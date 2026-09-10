import { calculateImpact } from "../../../functions/lib/impact";

type D1Statement = {
  bind(...values: unknown[]): D1Statement;
  run(): Promise<{ meta?: { changes?: number } }>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{ results: T[] }>;
};

type D1Database = { prepare(query: string): D1Statement };
type ScheduledController = { scheduledTime: number };
type ExecutionContext = { waitUntil(promise: Promise<unknown>): void };

type Env = {
  MONTHLY_REPORTS_DB: D1Database;
  APP_PUBLIC_URL: string;
  GOOGLE_SHEET_ID: string;
  GOOGLE_SHEET_RANGE?: string;
  GOOGLE_CONTACTS_RANGE?: string;
  GOOGLE_SOLUTIONS_RANGE?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL: string;
  GOOGLE_PRIVATE_KEY: string;
  GOOGLE_GA_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_GA_PRIVATE_KEY?: string;
  BREVO_API_KEY: string;
  MONTHLY_REPORT_INTERNAL_SECRET: string;
  MONTHLY_REPORT_BATCH_SIZE?: string;
  MONTHLY_REPORTS_ENABLED?: string;
};

type SheetRecord = Record<string, string>;
type GaRow = { dimensionValues?: Array<{ value?: string }>; metricValues?: Array<{ value?: string }> };
type GaResponse = { reports?: Array<{ rows?: GaRow[] }>; error?: { message?: string } };
type PropertyMetrics = {
  propertyId: string;
  current: { sessions: number; activeUsers: number; views: number; engagementRate: number };
  previous: { sessions: number; activeUsers: number; views: number; engagementRate: number };
  channels: Map<string, number>;
  keyEvents: Map<string, number>;
};
type ReportPeriod = { key: string; start: string; end: string; previousStart: string; previousEnd: string; label: string };

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const HIDDEN_KEY_EVENTS = new Set(["page_view", "session_start", "first_visit", "user_engagement"]);
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const TEMPLATE_VERSION = "v1";

function nowIso(): string { return new Date().toISOString(); }
function value(record: SheetRecord, ...keys: string[]): string { return keys.map((key) => record[key.toLowerCase()] || "").find(Boolean)?.trim() || ""; }
function affirmative(input: string): boolean { return ["oui", "yes", "true", "1", "actif", "active"].includes(input.trim().toLowerCase()); }
function active(input: string): boolean { return ["actif", "active"].includes(input.trim().toLowerCase()); }
function activeContact(input: string): boolean { return !input.trim() || active(input); }
function normalize(input: string): string { return input.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, " ").trim(); }
function emailValid(input: string): boolean { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input); }
function contactIdentifier(contact: SheetRecord): string { return value(contact, "contact_id", "id") || value(contact, "email").toLowerCase(); }
function uuid(): string { return crypto.randomUUID(); }

function escapeHtml(input: string): string {
  return input.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function json<T>(value: T): string { return JSON.stringify(value); }
function parseJson<T>(value: string, fallback: T): T { try { return JSON.parse(value) as T; } catch { return fallback; } }

function base64Url(input: string | ArrayBuffer): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";
  bytes.forEach((item) => { binary += String.fromCharCode(item); });
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

async function googleAccessToken(env: Env, scope: string): Promise<string> {
  const useGaIdentity = scope === ANALYTICS_SCOPE && env.GOOGLE_GA_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_GA_PRIVATE_KEY;
  const serviceAccountEmail = useGaIdentity ? env.GOOGLE_GA_SERVICE_ACCOUNT_EMAIL as string : env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = useGaIdentity ? env.GOOGLE_GA_PRIVATE_KEY as string : env.GOOGLE_PRIVATE_KEY;
  const now = Math.floor(Date.now() / 1000);
  const encodedKey = privateKey.replace(/\\n/g, "\n").replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Uint8Array.from(atob(encodedKey), (char) => char.charCodeAt(0)).buffer, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iss: serviceAccountEmail, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${payload}.${base64Url(signature)}` }) });
  const data = await response.json() as { access_token?: string; error_description?: string; error?: string };
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Google token unavailable.");
  return data.access_token;
}

function records(values: string[][]): SheetRecord[] {
  const headers = values[0]?.map((header) => header.trim().toLowerCase()) ?? [];
  return values.slice(1).map((row) => headers.reduce((record, header, index) => {
    if (header) record[header] = row[index]?.trim() || "";
    return record;
  }, {} as SheetRecord)).filter((row) => Object.values(row).some(Boolean));
}

async function sheetValues(env: Env, token: string, range: string): Promise<string[][]> {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEET_ID)}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json() as { values?: string[][]; error?: { message?: string } };
  if (!response.ok) throw new Error(data.error?.message || `Unable to read ${range}.`);
  return data.values || [];
}

async function workbook(env: Env): Promise<{ clients: SheetRecord[]; contacts: SheetRecord[]; solutions: SheetRecord[] }> {
  const token = await googleAccessToken(env, SHEETS_SCOPE);
  const [clients, contacts, solutions] = await Promise.all([
    sheetValues(env, token, env.GOOGLE_SHEET_RANGE || "Clients!A1:Z1000"),
    sheetValues(env, token, env.GOOGLE_CONTACTS_RANGE || "Contacts!A1:Z1000"),
    sheetValues(env, token, env.GOOGLE_SOLUTIONS_RANGE || "Solutions!A1:Z1000")
  ]);
  return { clients: records(clients), contacts: records(contacts), solutions: records(solutions) };
}

function paris(now: Date): { year: number; month: number; day: number; hour: number } {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", hourCycle: "h23" }).formatToParts(now);
  const item = (type: string) => Number(parts.find((part) => part.type === type)?.value || 0);
  return { year: item("year"), month: item("month"), day: item("day"), hour: item("hour") };
}

function firstBusinessDay(year: number, month: number): number {
  const weekday = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  return weekday === 6 ? 3 : weekday === 0 ? 2 : 1;
}

function reportPeriodFromStart(start: string): ReportPeriod {
  const date = new Date(`${start}T12:00:00.000Z`);
  const previous = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
  const end = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
  const previousEnd = new Date(Date.UTC(previous.getUTCFullYear(), previous.getUTCMonth() + 1, 0));
  const format = (item: Date) => item.toISOString().slice(0, 10);
  return { key: format(date).slice(0, 7), start: format(date), end: format(end), previousStart: format(previous), previousEnd: format(previousEnd), label: new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "Europe/Paris" }).format(date) };
}

function reportPeriod(now: Date): ReportPeriod {
  const local = paris(now);
  return reportPeriodFromStart(new Date(Date.UTC(local.year, local.month - 2, 1)).toISOString().slice(0, 10));
}

function isSchedulingWindow(now: Date): boolean {
  const local = paris(now);
  return local.day >= firstBusinessDay(local.year, local.month) && local.hour >= 9;
}

function expiresAt(now: Date): string {
  const expiry = new Date(now);
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 2);
  return expiry.toISOString();
}

function eligibleClients(data: Awaited<ReturnType<typeof workbook>>) {
  return data.clients.flatMap((client) => {
    const clientId = value(client, "client_id", "id");
    if (!clientId || !active(value(client, "statut_client", "status")) || (value(client, "espace_client_actif") && !affirmative(value(client, "espace_client_actif")))) return [];
    const properties = data.solutions.filter((solution) => {
      const name = normalize(value(solution, "nom_solution", "name"));
      const property = value(solution, "ga4_property_id").replace(/^properties\//i, "");
      return value(solution, "client_id") === clientId && active(value(solution, "statut_solution", "status", "statut")) && ["site web", "site e shop"].includes(name) && /^\d+$/.test(property);
    }).map((solution) => ({ propertyId: value(solution, "ga4_property_id").replace(/^properties\//i, ""), solutionId: value(solution, "solution_id", "id") }));
    const uniqueProperties = Array.from(new Map(properties.map((entry) => [entry.propertyId, entry])).values());
    const contacts = data.contacts.filter((contact) => value(contact, "client_id") === clientId && activeContact(value(contact, "statut_contact", "status")) && emailValid(value(contact, "email")) && normalize(value(contact, "bilan_mensuel_actif")) !== "non");
    if (!uniqueProperties.length || !contacts.length) return [];
    return [{ client, clientId, contacts, properties: uniqueProperties, solutions: data.solutions.filter((solution) => value(solution, "client_id") === clientId && active(value(solution, "statut_solution", "status", "statut"))) }];
  });
}

async function event(env: Env, reportId: string | null, deliveryId: string | null, clientId: string, eventType: string, status: string, message = "", metadata: Record<string, unknown> = {}): Promise<void> {
  const now = nowIso();
  await env.MONTHLY_REPORTS_DB.prepare("INSERT INTO monthly_report_events (id, report_id, delivery_id, client_id, event_type, status, message, metadata_json, created_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)")
    .bind(uuid(), reportId, deliveryId, clientId, eventType, status, message.slice(0, 1000), json(metadata), now, expiresAt(new Date())).run();
}

async function seedReports(env: Env, data: Awaited<ReturnType<typeof workbook>>, now: Date): Promise<void> {
  if (!isSchedulingWindow(now)) return;
  const period = reportPeriod(now);
  const created = now.toISOString();
  const expiry = expiresAt(now);
  for (const entry of eligibleClients(data)) {
    const companyName = value(entry.client, "organisation", "company_name", "nom_compte") || "Client Fluxperf";
    const id = uuid();
    const result = await env.MONTHLY_REPORTS_DB.prepare("INSERT OR IGNORE INTO monthly_reports (id, client_id, company_name, period_key, period_start, period_end, status, source_properties_json, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)")
      .bind(id, entry.clientId, companyName, period.key, period.start, period.end, json(entry.properties), created, created, expiry).run();
    if ((result.meta?.changes || 0) > 0) await event(env, id, null, entry.clientId, "report_seeded", "pending", "Bilan mensuel créé.", { propertyCount: entry.properties.length, contactCount: entry.contacts.length });
  }
}

function metric(row: GaRow | undefined, index: number): number { const parsed = Number(row?.metricValues?.[index]?.value || 0); return Number.isFinite(parsed) ? parsed : 0; }
function dimension(row: GaRow | undefined, index: number): string { return row?.dimensionValues?.[index]?.value?.trim() || ""; }
function request(startDate: string, endDate: string, metrics: string[], dimensions: string[] = [], limit = 20) {
  return { dateRanges: [{ startDate, endDate }], metrics: metrics.map((name) => ({ name })), dimensions: dimensions.length ? dimensions.map((name) => ({ name })) : undefined, limit: String(limit), orderBys: [{ metric: { metricName: metrics[0] }, desc: true }] };
}

async function propertyMetrics(env: Env, propertyId: string, period: ReportPeriod): Promise<PropertyMetrics | null> {
  const token = await googleAccessToken(env, ANALYTICS_SCOPE);
  const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(propertyId)}:batchRunReports`, {
    method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: json({ requests: [
      request(period.start, period.end, ["sessions", "activeUsers", "screenPageViews", "engagementRate"], [], 1),
      request(period.previousStart, period.previousEnd, ["sessions", "activeUsers", "screenPageViews", "engagementRate"], [], 1),
      request(period.start, period.end, ["sessions"], ["sessionDefaultChannelGroup"], 20),
      request(period.start, period.end, ["keyEvents"], ["eventName"], 20)
    ] })
  });
  const data = await response.json() as GaResponse;
  if (response.status === 403) return null;
  if (!response.ok) throw new Error(data.error?.message || `GA4 ${response.status}`);
  const reports = data.reports || [];
  const overview = (index: number) => ({ sessions: Math.round(metric(reports[index]?.rows?.[0], 0)), activeUsers: Math.round(metric(reports[index]?.rows?.[0], 1)), views: Math.round(metric(reports[index]?.rows?.[0], 2)), engagementRate: metric(reports[index]?.rows?.[0], 3) });
  const channels = new Map<string, number>();
  (reports[2]?.rows || []).forEach((row) => channels.set(dimension(row, 0), Math.round(metric(row, 0))));
  const keyEvents = new Map<string, number>();
  (reports[3]?.rows || []).forEach((row) => { const name = dimension(row, 0); const count = Math.round(metric(row, 0)); if (count > 0 && !HIDDEN_KEY_EVENTS.has(name.toLowerCase())) keyEvents.set(name, count); });
  return { propertyId, current: overview(0), previous: overview(1), channels, keyEvents };
}

function aggregate(properties: PropertyMetrics[]) {
  const totals = { current: { sessions: 0, activeUsers: 0, views: 0, weightedEngagement: 0 }, previous: { sessions: 0, activeUsers: 0, views: 0, weightedEngagement: 0 } };
  const channels = new Map<string, number>(); const keyEvents = new Map<string, number>();
  properties.forEach((property) => {
    (["current", "previous"] as const).forEach((period) => { totals[period].sessions += property[period].sessions; totals[period].activeUsers += property[period].activeUsers; totals[period].views += property[period].views; totals[period].weightedEngagement += property[period].engagementRate * property[period].sessions; });
    property.channels.forEach((count, label) => channels.set(label, (channels.get(label) || 0) + count));
    property.keyEvents.forEach((count, name) => keyEvents.set(name, (keyEvents.get(name) || 0) + count));
  });
  const overview = (period: "current" | "previous") => ({ sessions: totals[period].sessions, activeUsers: totals[period].activeUsers, views: totals[period].views, engagementRate: totals[period].sessions ? totals[period].weightedEngagement / totals[period].sessions : 0 });
  return { current: overview("current"), previous: overview("previous"), channels: Array.from(channels, ([label, sessions]) => ({ label, sessions })).sort((a, b) => b.sessions - a.sessions), keyEvents: Array.from(keyEvents, ([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count).slice(0, 2) };
}

function insight(report: ReturnType<typeof aggregate>): string {
  const enoughVolume = Math.min(report.current.sessions, report.previous.sessions) >= 20;
  const change = report.previous.sessions ? (report.current.sessions - report.previous.sessions) / report.previous.sessions : 0;
  const channel = report.channels.find((item) => item.label && !["(not set)", "Unassigned", "Other"].includes(item.label));
  if (enoughVolume && change >= 0.1) return "Belle dynamique ce mois-ci : la fréquentation de votre site progresse par rapport au mois précédent.";
  if (report.keyEvents.length) return `Vos visiteurs ont réalisé ${report.keyEvents.reduce((sum, item) => sum + item.count, 0)} action${report.keyEvents.reduce((sum, item) => sum + item.count, 0) > 1 ? "s" : ""} clé${report.keyEvents.reduce((sum, item) => sum + item.count, 0) > 1 ? "s" : ""} ce mois-ci.`;
  if (channel) return `${channel.label} reste votre principal levier de visibilité ce mois-ci.`;
  if (enoughVolume && Math.abs(change) <= 0.1) return "Votre activité digitale reste régulière ce mois-ci, avec un niveau de fréquentation globalement stable.";
  return "Votre site continue d’assurer votre présence digitale et d’accueillir vos visiteurs.";
}

function formatNumber(value: number): string { return new Intl.NumberFormat("fr-FR").format(Math.round(value)); }
function percentage(value: number): string { return `${Math.round(value * 1000) / 10}%`; }
function delta(current: number, previous: number, sessionsCurrent: number, sessionsPrevious: number): string {
  if (Math.min(sessionsCurrent, sessionsPrevious) < 20 || !previous) return "";
  const value = Math.round(((current - previous) / previous) * 100);
  return `${value > 0 ? "+" : ""}${value}% vs M-1`;
}

function renderEmail(report: Record<string, unknown>, recipientName: string, appUrl: string): { subject: string; htmlContent: string; textContent: string } {
  const current = report.current as { sessions: number; activeUsers: number; views: number; engagementRate: number };
  const previous = report.previous as typeof current;
  const multiProperty = Boolean(report.multiProperty);
  const impact = report.impact as { monthlyHours: number; items: Array<{ label: string; monthlyHours: number }> };
  const events = report.keyEvents as Array<{ name: string; count: number }>;
  const channels = report.channels as Array<{ label: string; sessions: number }>;
  const label = String(report.periodLabel);
  const principalChannel = channels.find((item) => item.label && !["(not set)", "Unassigned", "Other"].includes(item.label));
  const rows = [
    ["Sessions", formatNumber(current.sessions), delta(current.sessions, previous.sessions, current.sessions, previous.sessions)],
    [multiProperty ? "Utilisateurs actifs cumulés sur vos sites" : "Utilisateurs actifs", formatNumber(current.activeUsers), delta(current.activeUsers, previous.activeUsers, current.sessions, previous.sessions)],
    ["Vues", formatNumber(current.views), delta(current.views, previous.views, current.sessions, previous.sessions)],
    ["Taux d’engagement", percentage(current.engagementRate), Math.min(current.sessions, previous.sessions) >= 20 ? `${Math.round((current.engagementRate - previous.engagementRate) * 1000) / 10} point${Math.abs(current.engagementRate - previous.engagementRate) * 100 >= 2 ? "s" : ""} vs M-1` : ""],
    ...(principalChannel ? [["Canal principal", principalChannel.label, ""]] : [])
  ];
  const keyEvents = events.length ? `<p><strong>Actions clés :</strong> ${events.map((item) => `${escapeHtml(item.name.replace(/[_-]+/g, " "))} (${formatNumber(item.count)})`).join(" · ")}</p>` : "";
  const serviceDetail = impact.items.map((item) => `<li>${escapeHtml(item.label)} : ${item.monthlyHours.toLocaleString("fr-FR")} h / mois</li>`).join("");
  const htmlRows = rows.map(([name, metric, change]) => `<tr><td style="padding:10px 0;color:#5c6170">${escapeHtml(name)}</td><td style="padding:10px 0;text-align:right;font-weight:700;color:#17213c">${escapeHtml(metric)}</td><td style="padding:10px 0 10px 12px;text-align:right;color:#5c6170;font-size:12px">${escapeHtml(change)}</td></tr>`).join("");
  const preferenceUrl = `${appUrl.replace(/\/+$/, "")}/#mon-compte`;
  const htmlContent = `<div style="max-width:620px;margin:0 auto;font-family:Arial,sans-serif;color:#17213c;line-height:1.5"><p style="font-size:12px;letter-spacing:.08em;color:#5c6170">BILAN FLUXPERF®</p><h1 style="font-size:26px;margin:0 0 20px">Votre bilan Fluxperf® — ${escapeHtml(label)}</h1><p>Bonjour ${escapeHtml(recipientName || "")},</p><p>Voici l’essentiel de votre activité digitale et des services pris en charge par Fluxperf®.</p><h2 style="font-size:18px;margin-top:28px">Performance digitale</h2><table style="width:100%;border-collapse:collapse">${htmlRows}</table>${keyEvents}<h2 style="font-size:18px;margin-top:28px">À retenir</h2><p style="background:#f2f6ff;padding:16px;border-radius:10px">${escapeHtml(String(report.insight))}</p><h2 style="font-size:18px;margin-top:28px">Votre temps libéré</h2><p style="font-size:22px;font-weight:700;margin:0">≈ ${impact.monthlyHours.toLocaleString("fr-FR")} heures libérées ce mois-ci</p><ul>${serviceDetail}</ul><p style="margin-top:28px"><a style="display:inline-block;background:#17213c;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none" href="${escapeHtml(appUrl)}">Voir mon espace MyFluxperf</a></p><p style="color:#5c6170">Et si Fluxperf® pouvait vous libérer encore plus de temps ? Retrouvez les services disponibles dans votre espace.</p><p style="font-size:12px;color:#5c6170"><a href="${escapeHtml(preferenceUrl)}">Gérer la réception de mes bilans mensuels</a></p></div>`;
  const textContent = [`Votre bilan Fluxperf® — ${label}`, "", `Bonjour ${recipientName},`, "", `Sessions : ${formatNumber(current.sessions)}`, `${multiProperty ? "Utilisateurs actifs cumulés sur vos sites" : "Utilisateurs actifs"} : ${formatNumber(current.activeUsers)}`, `Vues : ${formatNumber(current.views)}`, `Taux d’engagement : ${percentage(current.engagementRate)}`, ...(principalChannel ? [`Canal principal : ${principalChannel.label}`] : []), "", `À retenir : ${String(report.insight)}`, "", `Temps libéré : environ ${impact.monthlyHours.toLocaleString("fr-FR")} heures ce mois-ci.`, `Mon espace : ${appUrl}`, `Préférences : ${preferenceUrl}`].join("\n");
  return { subject: `Votre bilan Fluxperf® — ${label}`, htmlContent, textContent };
}

async function generateReports(env: Env, data: Awaited<ReturnType<typeof workbook>>, now: Date): Promise<void> {
  const batchSize = Math.max(1, Math.min(Number(env.MONTHLY_REPORT_BATCH_SIZE || 10), 25));
  const queued = await env.MONTHLY_REPORTS_DB.prepare("SELECT * FROM monthly_reports WHERE status = 'pending' AND report_json IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at ASC LIMIT ?").bind(now.toISOString(), batchSize).all<Record<string, unknown>>();
  for (const row of queued.results) {
    const id = String(row.id); const clientId = String(row.client_id); const lock = await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_reports SET status = 'generating', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pending'").bind(nowIso(), id).run();
    if ((lock.meta?.changes || 0) !== 1) continue;
    try {
      const period = reportPeriodFromStart(String(row.period_start));
      const propertyRows = parseJson<Array<{ propertyId: string }>>(String(row.source_properties_json), []);
      const attempts = await Promise.allSettled(propertyRows.map((item) => propertyMetrics(env, item.propertyId, period)));
      const settled = propertyRows.map((item, index) => {
        const attempt = attempts[index];
        return attempt.status === "fulfilled"
          ? { propertyId: item.propertyId, result: attempt.value, error: null, transient: false }
          : (() => {
            const error = attempt.reason instanceof Error ? attempt.reason.message : "GA4 indisponible";
            const status = Number(/^GA4 (\d{3}):/i.exec(error)?.[1]);
            return { propertyId: item.propertyId, result: null, error, transient: !Number.isFinite(status) || status === 429 || status >= 500 };
          })();
      });
      const usable = settled.flatMap((item) => item.result ? [item.result] : []);
      for (const item of settled.filter((entry) => !entry.result)) await event(env, id, null, clientId, "property_unavailable", "warning", item.error || "Accès GA4 indisponible.", { propertyId: item.propertyId });
      if (!usable.length) {
        if (settled.some((item) => item.transient)) throw new Error("Toutes les propriétés GA4 sont temporairement indisponibles.");
        await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_reports SET status = 'skipped', error_message = ?, updated_at = ? WHERE id = ?").bind("Aucune propriété GA4 n'est accessible.", nowIso(), id).run();
        await event(env, id, null, clientId, "report_skipped", "skipped", "Aucune propriété GA4 accessible.");
        continue;
      }
      const aggregated = aggregate(usable);
      const currentSolutions = data.solutions.filter((solution) => value(solution, "client_id") === clientId && active(value(solution, "statut_solution", "status", "statut")));
      const impact = calculateImpact(currentSolutions.map((solution) => ({ type: value(solution, "type_solution", "type"), name: value(solution, "nom_solution", "name") })));
      const payload = { ...aggregated, periodLabel: period.label, multiProperty: usable.length > 1, insight: insight(aggregated), impact, properties: settled.map((item) => ({ propertyId: item.propertyId, status: item.result ? "available" : "unavailable" })) };
      await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_reports SET status = 'ready', report_json = ?, insight = ?, impact_json = ?, template_version = ?, generated_at = ?, updated_at = ?, error_message = NULL WHERE id = ?").bind(json(payload), payload.insight, json(impact), TEMPLATE_VERSION, nowIso(), nowIso(), id).run();
      const contacts = data.contacts.filter((contact) => value(contact, "client_id") === clientId && activeContact(value(contact, "statut_contact", "status")) && emailValid(value(contact, "email")) && normalize(value(contact, "bilan_mensuel_actif")) !== "non");
      for (const contact of contacts) {
        const recipientName = [value(contact, "prenom", "first_name"), value(contact, "nom", "last_name")].filter(Boolean).join(" ");
        await env.MONTHLY_REPORTS_DB.prepare("INSERT OR IGNORE INTO monthly_report_deliveries (id, report_id, contact_id, recipient_email, recipient_name, status, idempotency_key, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)").bind(uuid(), id, contactIdentifier(contact), value(contact, "email").toLowerCase(), recipientName, uuid(), nowIso(), nowIso(), expiresAt(now)).run();
      }
      await event(env, id, null, clientId, "report_generated", "ready", "Bilan généré.", { availableProperties: usable.length, unavailableProperties: settled.length - usable.length, recipientCount: contacts.length });
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1; const retry = attempts < 3;
      await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_reports SET status = ?, next_attempt_at = ?, error_message = ?, updated_at = ? WHERE id = ?").bind(retry ? "pending" : "failed", retry ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null, error instanceof Error ? error.message.slice(0, 1000) : "GA4 unavailable", nowIso(), id).run();
      await event(env, id, null, clientId, "report_generation_failed", retry ? "pending" : "failed", error instanceof Error ? error.message : "GA4 unavailable");
    }
  }
}

async function sendDeliveries(env: Env, data: Awaited<ReturnType<typeof workbook>>, now: Date): Promise<void> {
  const batchSize = Math.max(1, Math.min(Number(env.MONTHLY_REPORT_BATCH_SIZE || 10), 25));
  const pending = await env.MONTHLY_REPORTS_DB.prepare("SELECT d.*, r.client_id, r.report_json FROM monthly_report_deliveries d JOIN monthly_reports r ON r.id = d.report_id WHERE d.status = 'pending' AND (d.next_attempt_at IS NULL OR d.next_attempt_at <= ?) AND r.status = 'ready' ORDER BY d.created_at ASC LIMIT ?").bind(now.toISOString(), batchSize).all<Record<string, unknown>>();
  for (const row of pending.results) {
    const id = String(row.id); const lock = await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_report_deliveries SET status = 'sending', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pending'").bind(nowIso(), id).run();
    if ((lock.meta?.changes || 0) !== 1) continue;
    const contact = data.contacts.find((entry) => value(entry, "client_id") === String(row.client_id) && contactIdentifier(entry) === String(row.contact_id));
    if (!contact || !activeContact(value(contact, "statut_contact", "status")) || normalize(value(contact, "bilan_mensuel_actif")) === "non" || value(contact, "email").toLowerCase() !== String(row.recipient_email).toLowerCase()) {
      await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_report_deliveries SET status = 'skipped', error_message = NULL, updated_at = ? WHERE id = ?").bind(nowIso(), id).run();
      await event(env, String(row.report_id), id, String(row.client_id), "delivery_skipped", "skipped", "Préférence ou contact devenu inactif.");
      continue;
    }
    const report = parseJson<Record<string, unknown>>(String(row.report_json), {});
    try {
      const email = renderEmail(report, String(row.recipient_name || ""), env.APP_PUBLIC_URL);
      const response = await fetch(BREVO_ENDPOINT, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "api-key": env.BREVO_API_KEY }, body: json({ sender: { name: "Fluxperf", email: "notifications@fluxperf.fr" }, to: [{ email: String(row.recipient_email), name: String(row.recipient_name || "") }], subject: email.subject, htmlContent: email.htmlContent, textContent: email.textContent, tags: ["myfluxperf-monthly-report"], headers: { "Idempotency-Key": String(row.idempotency_key), "X-Mailin-custom": `monthly-report:${id}` } }) });
      const result = await response.json().catch(() => ({})) as { messageId?: string; code?: string; message?: string };
      if (response.ok || /duplicate_parameter/i.test(`${result.code || ""} ${result.message || ""}`)) {
        await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_report_deliveries SET status = 'sent', brevo_message_id = ?, sent_at = COALESCE(sent_at, ?), error_message = NULL, updated_at = ? WHERE id = ?").bind(result.messageId || null, nowIso(), nowIso(), id).run();
        await event(env, String(row.report_id), id, String(row.client_id), "delivery_accepted", "sent", "Brevo a accepté l'envoi.");
        continue;
      }
      const permanent = response.status >= 400 && response.status < 500 && response.status !== 429;
      const attempts = Number(row.attempts || 0) + 1;
      const retry = !permanent && attempts < 3;
      await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_report_deliveries SET status = ?, next_attempt_at = ?, error_message = ?, updated_at = ? WHERE id = ?").bind(retry ? "pending" : "failed", retry ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null, (result.message || `Brevo ${response.status}`).slice(0, 1000), nowIso(), id).run();
      await event(env, String(row.report_id), id, String(row.client_id), "delivery_failed", retry ? "pending" : "failed", result.message || `Brevo ${response.status}`);
    } catch (error) {
      const attempts = Number(row.attempts || 0) + 1; const retry = attempts < 3;
      await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_report_deliveries SET status = ?, next_attempt_at = ?, error_message = ?, updated_at = ? WHERE id = ?").bind(retry ? "pending" : "unknown", retry ? new Date(Date.now() + 5 * 60 * 1000).toISOString() : null, error instanceof Error ? error.message.slice(0, 1000) : "Brevo unavailable", nowIso(), id).run();
      await event(env, String(row.report_id), id, String(row.client_id), "delivery_transport_error", retry ? "pending" : "unknown", error instanceof Error ? error.message : "Brevo unavailable");
    }
  }
}

async function purge(env: Env, now: Date): Promise<void> {
  const local = paris(now); if (local.hour !== 3) return;
  const cutoff = now.toISOString();
  await env.MONTHLY_REPORTS_DB.prepare("DELETE FROM monthly_report_events WHERE expires_at < ?").bind(cutoff).run();
  await env.MONTHLY_REPORTS_DB.prepare("DELETE FROM monthly_report_deliveries WHERE expires_at < ?").bind(cutoff).run();
  await env.MONTHLY_REPORTS_DB.prepare("DELETE FROM monthly_reports WHERE expires_at < ?").bind(cutoff).run();
}

function reportsEnabled(value: string | undefined): boolean {
  return ["true", "1", "yes", "oui"].includes((value || "").trim().toLowerCase());
}

async function run(env: Env, now = new Date()): Promise<void> {
  if (!reportsEnabled(env.MONTHLY_REPORTS_ENABLED)) {
    await purge(env, now);
    return;
  }
  const data = await workbook(env);
  await seedReports(env, data, now);
  await generateReports(env, data, now);
  await sendDeliveries(env, data, now);
  await purge(env, now);
}

export default {
  async scheduled(_controller: ScheduledController, env: Env, context: ExecutionContext): Promise<void> { context.waitUntil(run(env)); },
  async fetch(request: Request, env: Env, context: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "POST" && url.pathname === "/internal/run" && env.MONTHLY_REPORT_INTERNAL_SECRET && request.headers.get("X-Fluxperf-Internal-Secret") === env.MONTHLY_REPORT_INTERNAL_SECRET) {
      context.waitUntil(run(env));
      return new Response(null, { status: 202 });
    }
    return new Response("Not found", { status: 404 });
  }
};

export { aggregate, delta, expiresAt, insight, isSchedulingWindow, reportPeriod, reportPeriodFromStart };
