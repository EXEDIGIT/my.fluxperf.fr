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
  MONTHLY_REPORT_ALLOWED_CLIENT_IDS?: string;
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
type ReportProperty = { propertyId: string; solutionId: string };
type AnalyticsAttempt = { propertyId: string; result: PropertyMetrics | null; error: string | null; transient: boolean };
type ServiceGroup = { label: string; solutions: string[] };
type EligibleClient = {
  client: SheetRecord;
  clientId: string;
  contacts: SheetRecord[];
  properties: ReportProperty[];
  invalidPropertySolutions: string[];
  solutions: SheetRecord[];
};

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets.readonly";
const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const HIDDEN_KEY_EVENTS = new Set(["page_view", "session_start", "first_visit", "user_engagement"]);
const BREVO_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const TEMPLATE_VERSION = "v3";

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
  return local.day === firstBusinessDay(local.year, local.month) && local.hour >= 9;
}

function expiresAt(now: Date): string {
  const expiry = new Date(now);
  expiry.setUTCFullYear(expiry.getUTCFullYear() + 2);
  return expiry.toISOString();
}

function testExpiresAt(now: Date): string {
  const expiry = new Date(now);
  expiry.setUTCDate(expiry.getUTCDate() + 14);
  return expiry.toISOString();
}

function allowedClientIds(input: string | undefined): Set<string> {
  return new Set((input || "").split(",").map((entry) => entry.trim()).filter(Boolean));
}

function configuredProperties(solutions: SheetRecord[]): { properties: ReportProperty[]; invalidPropertySolutions: string[] } {
  const invalidPropertySolutions: string[] = [];
  const properties = solutions.flatMap((solution) => {
    const rawProperty = value(solution, "ga4_property_id", "ga4_property", "analytics_property_id");
    if (!rawProperty) return [];
    const propertyId = rawProperty.replace(/^properties\//i, "");
    const solutionId = value(solution, "solution_id", "id") || value(solution, "nom_solution", "name") || "solution";
    if (!/^\d+$/.test(propertyId)) {
      invalidPropertySolutions.push(solutionId);
      return [];
    }
    return [{ propertyId, solutionId }];
  });
  return { properties: Array.from(new Map(properties.map((entry) => [entry.propertyId, entry])).values()), invalidPropertySolutions };
}

function eligibleClients(data: Awaited<ReturnType<typeof workbook>>, allowedIds = new Set<string>()): EligibleClient[] {
  return data.clients.flatMap((client) => {
    const clientId = value(client, "client_id", "id");
    if (!clientId || (allowedIds.size > 0 && !allowedIds.has(clientId)) || !active(value(client, "statut_client", "status")) || (value(client, "espace_client_actif") && !affirmative(value(client, "espace_client_actif")))) return [];
    const solutions = data.solutions.filter((solution) => value(solution, "client_id") === clientId && active(value(solution, "statut_solution", "status", "statut")));
    const contacts = data.contacts.filter((contact) => value(contact, "client_id") === clientId && activeContact(value(contact, "statut_contact", "status")) && emailValid(value(contact, "email")) && normalize(value(contact, "bilan_mensuel_actif")) !== "non");
    if (!solutions.length || !contacts.length) return [];
    const { properties, invalidPropertySolutions } = configuredProperties(solutions);
    return [{ client, clientId, contacts, properties, invalidPropertySolutions, solutions }];
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
  for (const entry of eligibleClients(data, allowedClientIds(env.MONTHLY_REPORT_ALLOWED_CLIENT_IDS))) {
    const companyName = value(entry.client, "organisation", "company_name", "nom_compte") || "Client Fluxperf";
    const id = uuid();
    const result = await env.MONTHLY_REPORTS_DB.prepare("INSERT OR IGNORE INTO monthly_reports (id, client_id, company_name, period_key, period_start, period_end, status, source_properties_json, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)")
      .bind(id, entry.clientId, companyName, period.key, period.start, period.end, json(entry.properties), created, created, expiry).run();
    if ((result.meta?.changes || 0) > 0) {
      await event(env, id, null, entry.clientId, "report_seeded", "pending", "Bilan mensuel créé.", { propertyCount: entry.properties.length, contactCount: entry.contacts.length });
      if (!entry.properties.length) await event(env, id, null, entry.clientId, "analytics_not_configured", "info", "Aucune propriété GA4 valide n’est configurée pour les solutions actives.");
      if (entry.invalidPropertySolutions.length) await event(env, id, null, entry.clientId, "analytics_property_invalid", "warning", "Une ou plusieurs propriétés GA4 configurées sont invalides.", { solutionIds: entry.invalidPropertySolutions });
    }
  }
}

function metric(row: GaRow | undefined, index: number): number { const parsed = Number(row?.metricValues?.[index]?.value || 0); return Number.isFinite(parsed) ? parsed : 0; }
function dimension(row: GaRow | undefined, index: number): string { return row?.dimensionValues?.[index]?.value?.trim() || ""; }
function request(startDate: string, endDate: string, metrics: string[], dimensions: string[] = [], limit = 20) {
  return { dateRanges: [{ startDate, endDate }], metrics: metrics.map((name) => ({ name })), dimensions: dimensions.length ? dimensions.map((name) => ({ name })) : undefined, limit: String(limit), orderBys: [{ metric: { metricName: metrics[0] }, desc: true }] };
}

async function propertyMetrics(env: Env, propertyId: string, period: ReportPeriod): Promise<PropertyMetrics> {
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
  if (!response.ok) throw new Error(`GA4 ${response.status}: ${data.error?.message || "réponse indisponible"}`);
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

function serviceInsight(impact: { monthlyHours: number }): string {
  if (impact.monthlyHours > 0) return "Vos services Fluxperf® restent actifs à vos côtés et contribuent à vous libérer du temps au quotidien.";
  return "Vos services Fluxperf® restent actifs à vos côtés pour accompagner votre présence digitale et vos opérations.";
}

function formatNumber(value: number): string { return new Intl.NumberFormat("fr-FR").format(Math.round(value)); }
function percentage(value: number): string { return `${Math.round(value * 1000) / 10}%`; }
function delta(current: number, previous: number, sessionsCurrent: number, sessionsPrevious: number): string {
  if (Math.min(sessionsCurrent, sessionsPrevious) < 20 || !previous) return "";
  const value = Math.round(((current - previous) / previous) * 100);
  return `${value > 0 ? "+" : ""}${value}% vs M-1`;
}

function summarizeServices(solutions: SheetRecord[]): ServiceGroup[] {
  const groups = new Map<string, string[]>();
  solutions.forEach((solution) => {
    const label = value(solution, "type_solution", "type") || "Services Fluxperf®";
    const name = value(solution, "nom_solution", "name") || "Service actif";
    const domain = value(solution, "domaine", "domain");
    const url = value(solution, "url_ou_indication", "url");
    const suffix = domain || (() => { try { return new URL(url).hostname.replace(/^www\./i, ""); } catch { return ""; } })();
    const summary = suffix && normalize(suffix) !== normalize(name) ? `${name} — ${suffix}` : name;
    const existing = groups.get(label) || [];
    if (!existing.includes(summary)) groups.set(label, [...existing, summary]);
  });
  return Array.from(groups, ([label, entries]) => ({ label, solutions: entries }));
}

function servicesFromReport(report: Record<string, unknown>): ServiceGroup[] {
  if (!Array.isArray(report.services)) return [];
  return report.services.flatMap((group) => {
    if (!group || typeof group !== "object") return [];
    const entry = group as { label?: unknown; solutions?: unknown };
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    const solutions = Array.isArray(entry.solutions) ? entry.solutions.filter((item): item is string => typeof item === "string" && Boolean(item.trim())).map((item) => item.trim()) : [];
    return label && solutions.length ? [{ label, solutions }] : [];
  });
}

function visibleServices(groups: ServiceGroup[], limit = 6): { groups: ServiceGroup[]; remaining: number } {
  let left = limit;
  let remaining = 0;
  const visible = groups.flatMap((group) => {
    const kept = group.solutions.slice(0, Math.max(left, 0));
    left -= kept.length;
    remaining += group.solutions.length - kept.length;
    return kept.length ? [{ label: group.label, solutions: kept }] : [];
  });
  return { groups: visible, remaining };
}

function htmlButton(url: string, label: string): string {
  const href = escapeHtml(url);
  const text = escapeHtml(label);
  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" align="center" style="margin:24px auto 0;"><tr><td align="center" bgcolor="#f8bf18" style="border-radius:28px;"><!--[if mso]><v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" href="${href}" style="height:54px;v-text-anchor:middle;width:270px;" arcsize="50%" strokecolor="#f8bf18" fillcolor="#f8bf18"><w:anchorlock/><center style="color:#17324a;font-family:Arial,sans-serif;font-size:16px;font-weight:bold;"><![endif]--><a href="${href}" style="display:inline-block;padding:17px 27px;color:#17324a;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:20px;font-weight:700;text-decoration:none;border-radius:28px;">${text}</a><!--[if mso]></center></v:roundrect><![endif]--></td></tr></table>`;
}

function hours(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function formatMonthlyHours(value: number): string {
  return `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(hours(value))} h`;
}

function formatWeeklyDuration(value: number): string {
  const minutes = Math.round(hours(value) * 60);
  const wholeHours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  if (!wholeHours) return `${remainingMinutes} min`;
  return remainingMinutes ? `${wholeHours} h ${remainingMinutes}` : `${wholeHours} h`;
}

function renderEmail(report: Record<string, unknown>, recipientName: string, appUrl: string, options: { test?: boolean } = {}): { subject: string; htmlContent: string; textContent: string } {
  const current = report.current as { sessions?: number; activeUsers?: number; views?: number; engagementRate?: number } || {};
  const previous = report.previous as typeof current || {};
  const hasAnalytics = Boolean(report.hasAnalytics);
  const multiProperty = Boolean(report.multiProperty);
  const impact = report.impact as { monthlyHours?: unknown; weeklyHours?: unknown; items?: unknown[] } || {};
  const events = Array.isArray(report.keyEvents) ? report.keyEvents as Array<{ name: string; count: number }> : [];
  const channels = Array.isArray(report.channels) ? report.channels as Array<{ label: string; sessions: number }> : [];
  const services = visibleServices(servicesFromReport(report));
  const label = String(report.periodLabel || "ce mois-ci");
  const availableProperties = Number(report.availablePropertyCount || 0);
  const unavailableProperties = Number(report.unavailablePropertyCount || 0);
  const principalChannel = channels.find((item) => item.label && !["(not set)", "Unassigned", "Other"].includes(item.label));
  const currentSessions = Number(current.sessions || 0); const previousSessions = Number(previous.sessions || 0);
  const rows = hasAnalytics ? [
    ["Sessions", formatNumber(currentSessions), delta(currentSessions, Number(previous.sessions || 0), currentSessions, previousSessions)],
    [multiProperty ? "Utilisateurs actifs cumulés sur vos sites" : "Utilisateurs actifs", formatNumber(Number(current.activeUsers || 0)), delta(Number(current.activeUsers || 0), Number(previous.activeUsers || 0), currentSessions, previousSessions)],
    ["Vues", formatNumber(Number(current.views || 0)), delta(Number(current.views || 0), Number(previous.views || 0), currentSessions, previousSessions)],
    ["Taux d’engagement", percentage(Number(current.engagementRate || 0)), Math.min(currentSessions, previousSessions) >= 20 ? `${Math.round((Number(current.engagementRate || 0) - Number(previous.engagementRate || 0)) * 1000) / 10} point${Math.abs(Number(current.engagementRate || 0) - Number(previous.engagementRate || 0)) * 100 >= 2 ? "s" : ""} vs M-1` : ""],
    ...(principalChannel ? [["Canal principal", principalChannel.label, ""]] : [])
  ] : [];
  const metricRows = rows.map(([name, metric, change]) => `<tr><td style="padding:13px 12px 13px 0;color:#607786;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:700;border-bottom:1px solid #dce3e7;">${escapeHtml(name)}</td><td style="padding:13px 0;color:#17324a;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:700;text-align:right;border-bottom:1px solid #dce3e7;">${escapeHtml(metric)}</td><td style="padding:13px 0 13px 12px;color:#607786;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;text-align:right;border-bottom:1px solid #dce3e7;">${escapeHtml(change)}</td></tr>`).join("");
  const keyEvents = events.length ? `<p style="margin:16px 0 0;color:#26485d;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:22px;"><strong>Actions clés :</strong> ${events.map((item) => `${escapeHtml(item.name.replace(/[_-]+/g, " "))} (${formatNumber(item.count)})`).join(" · ")}</p>` : "";
  const scopeMessage = hasAnalytics
    ? `<p style="margin:0 0 14px;color:#607786;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;">Données consolidées sur ${availableProperties || 1} site${(availableProperties || 1) > 1 ? "s" : ""} analysé${(availableProperties || 1) > 1 ? "s" : ""}.${unavailableProperties ? ` ${unavailableProperties} propriété${unavailableProperties > 1 ? "s" : ""} non disponible${unavailableProperties > 1 ? "s" : ""} ce mois-ci.` : ""}</p>`
    : report.analyticsStatus === "unavailable"
      ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#fff5d8;border:1px solid #f2d581;border-radius:8px;"><tr><td style="padding:15px 18px;color:#5b4a16;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:21px;">Les indicateurs de fréquentation ne sont pas disponibles pour ce bilan. Vos services Fluxperf® restent bien suivis.</td></tr></table>`
      : "";
  const serviceRows = services.groups.map((group) => `<tr><td valign="top" width="37%" style="padding:14px 12px 14px 0;color:#607786;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:700;border-bottom:1px solid #dce3e7;">${escapeHtml(group.label)}</td><td valign="top" width="63%" style="padding:14px 0;color:#17324a;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;border-bottom:1px solid #dce3e7;">${group.solutions.map(escapeHtml).join("<br>")}</td></tr>`).join("") || `<tr><td style="padding:14px 0;color:#17324a;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;">Vos services Fluxperf® sont actifs et suivis ce mois-ci.</td></tr>`;
  const serviceMore = services.remaining ? `<p style="margin:12px 0 0;color:#607786;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;">Et ${services.remaining} autre${services.remaining > 1 ? "s" : ""} solution${services.remaining > 1 ? "s" : ""} active${services.remaining > 1 ? "s" : ""} dans votre espace MyFluxperf.</p>` : "";
  const impactItems = Array.isArray(impact.items) ? impact.items.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const entry = item as { label?: unknown; monthlyHours?: unknown; weeklyHours?: unknown };
    const label = typeof entry.label === "string" ? entry.label.trim() : "";
    if (!label) return [];
    const monthlyHours = hours(entry.monthlyHours);
    const weeklyHours = Number.isFinite(Number(entry.weeklyHours)) ? hours(entry.weeklyHours) : monthlyHours * 12 / 52;
    return [{ label, monthlyHours, weeklyHours }];
  }) : [];
  const totalMonthlyHours = hours(impact.monthlyHours) || impactItems.reduce((total, item) => total + item.monthlyHours, 0);
  const totalWeeklyHours = Number.isFinite(Number(impact.weeklyHours)) ? hours(impact.weeklyHours) : impactItems.reduce((total, item) => total + item.weeklyHours, 0);
  const impactRows = impactItems.map((item) => `<tr><td style="padding:0 0 10px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#ffffff;border:1px solid #d7e8e9;border-radius:6px;"><tr><td width="4" bgcolor="#007780" style="width:4px;background-color:#007780;font-size:0;line-height:0;border-radius:6px 0 0 6px;">&nbsp;</td><td valign="top" style="padding:12px 10px 12px 14px;color:#26485d;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;font-weight:700;">${escapeHtml(item.label)}</td><td valign="top" align="right" style="padding:12px 14px 12px 8px;color:#17324a;font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:20px;text-align:right;white-space:nowrap;"><strong>${formatMonthlyHours(item.monthlyHours)} / mois</strong><br><span style="color:#607786;font-size:12px;line-height:18px;">≈ ${formatWeeklyDuration(item.weeklyHours)} / semaine</span></td></tr></table></td></tr>`).join("");
  const impactCard = impactItems.length && totalMonthlyHours > 0
    ? `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#eef7f7;border:1px solid #c9e4e5;border-radius:8px;"><tr><td style="padding:20px;"><p style="margin:0 0 10px;color:#087b83;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:16px;font-weight:700;letter-spacing:.8px;text-transform:uppercase;">La promesse Fluxperf®</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;"><tr><td valign="top" style="padding:0 12px 16px 0;color:#007780;font-family:Arial,Helvetica,sans-serif;font-size:32px;line-height:38px;font-weight:700;white-space:nowrap;">≈ ${formatMonthlyHours(totalMonthlyHours)}</td><td valign="top" style="padding:5px 0 16px;color:#26485d;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:22px;font-weight:700;">libérées ce mois-ci</td></tr></table><p style="margin:0 0 16px;color:#607786;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;">Soit environ ${formatWeeklyDuration(totalWeeklyHours)} chaque semaine.</p><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;">${impactRows}</table></td></tr></table>`
    : `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#eef7f7;border:1px solid #c9e4e5;border-radius:8px;"><tr><td style="padding:18px 20px;color:#26485d;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;">Vos services Fluxperf® restent actifs à vos côtés et contribuent à vous faire gagner du temps au quotidien.</td></tr></table>`;
  const preferenceUrl = `${appUrl.replace(/\/+$/, "")}/#mon-compte`;
  const preheader = options.test ? `Test — bilan Fluxperf® de ${label}` : `Votre bilan Fluxperf® de ${label}`;
  const intro = hasAnalytics ? "Voici l’essentiel de votre activité digitale et des services Fluxperf® actifs à vos côtés." : "Voici l’essentiel des services Fluxperf® actifs à vos côtés.";
  const performance = hasAnalytics ? `<h2 style="margin:30px 0 10px;color:#17324a;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:27px;font-weight:700;">Performance digitale</h2>${scopeMessage}<table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid #dce3e7;">${metricRows}</table>${keyEvents}` : scopeMessage;
  const testNotice = options.test ? `<p style="margin:0 0 18px;color:#607786;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;">Ceci est un envoi de test : il ne modifie pas votre historique de bilan mensuel.</p>` : "";
  const htmlContent = `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;padding:0;background-color:#f7f4ee;color:#17324a;"><div style="display:none;max-height:0;overflow:hidden;opacity:0;color:transparent;">${escapeHtml(preheader)}</div><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#f7f4ee;"><tr><td align="center" style="padding:16px 10px 28px;"><table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="width:600px;max-width:600px;background-color:#ffffff;border:1px solid #dce3e7;border-radius:12px;overflow:hidden;"><tr><td height="6" style="height:6px;background-color:#f8bf18;font-size:0;line-height:0;">&nbsp;</td></tr><tr><td style="padding:34px 44px 30px;"><img src="https://my.fluxperf.fr/assets/img/logo-fluxperf-email.png" width="190" alt="Fluxperf" style="display:block;width:190px;max-width:100%;height:auto;border:0;"><table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-top:28px;"><tr><td style="padding:8px 13px;background-color:#e8f5f5;border-radius:18px;color:#087b83;font-family:Arial,Helvetica,sans-serif;font-size:12px;font-weight:700;letter-spacing:.4px;text-transform:uppercase;">${options.test ? "BILAN DE TEST" : "BILAN MENSUEL"}</td></tr></table><h1 style="margin:24px 0 14px;color:#007780;font-family:Arial,Helvetica,sans-serif;font-size:30px;line-height:38px;font-weight:700;">Votre bilan Fluxperf® — ${escapeHtml(label)}</h1><p style="margin:0 0 18px;color:#40596b;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;">Bonjour ${escapeHtml(recipientName || "")},</p>${testNotice}<p style="margin:0 0 24px;color:#40596b;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:25px;">${intro}</p>${performance}<h2 style="margin:30px 0 14px;color:#17324a;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:27px;font-weight:700;">Vos services actifs</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;border-top:1px solid #dce3e7;">${serviceRows}</table>${serviceMore}<h2 style="margin:30px 0 14px;color:#17324a;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:27px;font-weight:700;">À retenir</h2><table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="width:100%;background-color:#eef7f7;border:1px solid #c9e4e5;border-radius:8px;"><tr><td style="padding:18px 20px;color:#26485d;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:24px;">${escapeHtml(String(report.insight || "Vos services Fluxperf® restent actifs à vos côtés."))}</td></tr></table><h2 style="margin:30px 0 10px;color:#17324a;font-family:Arial,Helvetica,sans-serif;font-size:20px;line-height:27px;font-weight:700;">Votre temps libéré</h2>${impactCard}${htmlButton(appUrl, "Accéder à mon espace MyFluxperf")}<p style="margin:24px 0 0;color:#607786;font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:20px;text-align:center;">Et si Fluxperf® pouvait vous libérer encore plus de temps ? Retrouvez les services disponibles dans votre espace.</p><p style="margin:14px 0 0;color:#607786;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;text-align:center;"><a href="${escapeHtml(preferenceUrl)}" style="color:#007780;text-decoration:underline;">Gérer la réception de mes bilans mensuels</a></p></td></tr><tr><td style="padding:22px 44px;background-color:#f8fafb;border-top:1px solid #dce3e7;color:#607786;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:18px;text-align:center;">Cet e-mail est envoyé depuis votre espace MyFluxperf.<br>© Fluxperf</td></tr></table></td></tr></table></body></html>`;
  const analyticsText = hasAnalytics ? [`Performance digitale (${availableProperties || 1} site${(availableProperties || 1) > 1 ? "s" : ""} analysé${(availableProperties || 1) > 1 ? "s" : ""})`, ...rows.map(([name, metric]) => `${name} : ${metric}`), ...(events.length ? [`Actions clés : ${events.map((item) => `${item.name} (${formatNumber(item.count)})`).join(" · ")}`] : [])] : [report.analyticsStatus === "unavailable" ? "Les indicateurs de fréquentation ne sont pas disponibles pour ce bilan." : "Aucune propriété GA4 n’est configurée pour ce périmètre."];
  const serviceText = services.groups.flatMap((group) => [`${group.label} : ${group.solutions.join(" ; ")}`]);
  const subject = `${options.test ? "[TEST] " : ""}Votre bilan Fluxperf® — ${label}`;
  const impactText = impactItems.length && totalMonthlyHours > 0
    ? ["Votre temps libéré", `≈ ${formatMonthlyHours(totalMonthlyHours)} libérées ce mois-ci.`, `Soit environ ${formatWeeklyDuration(totalWeeklyHours)} chaque semaine.`, ...impactItems.flatMap((item) => [`${item.label} : ${formatMonthlyHours(item.monthlyHours)} / mois`, `≈ ${formatWeeklyDuration(item.weeklyHours)} / semaine`])]
    : ["Votre temps libéré", "Vos services Fluxperf® restent actifs à vos côtés et contribuent à vous faire gagner du temps au quotidien."];
  const textContent = [subject, "", `Bonjour ${recipientName},`, "", ...analyticsText, "", "Vos services actifs", ...serviceText, "", `À retenir : ${String(report.insight || "Vos services Fluxperf® restent actifs à vos côtés.")}`, "", ...impactText, "", `Mon espace : ${appUrl}`, `Préférences : ${preferenceUrl}`].join("\n");
  return { subject, htmlContent, textContent };
}

async function buildReportPayload(env: Env, period: ReportPeriod, properties: ReportProperty[], solutions: SheetRecord[]): Promise<{ payload: Record<string, unknown>; attempts: AnalyticsAttempt[]; hasTransientFailure: boolean }> {
  const requests = await Promise.allSettled(properties.map((item) => propertyMetrics(env, item.propertyId, period)));
  const attempts: AnalyticsAttempt[] = properties.map((item, index) => {
    const attempt = requests[index];
    if (attempt.status === "fulfilled") return { propertyId: item.propertyId, result: attempt.value, error: null, transient: false };
    const error = attempt.reason instanceof Error ? attempt.reason.message : "GA4 indisponible";
    const status = Number(/^GA4 (\d{3}):/i.exec(error)?.[1]);
    return { propertyId: item.propertyId, result: null, error, transient: !Number.isFinite(status) || status === 429 || status >= 500 };
  });
  const usable = attempts.flatMap((item) => item.result ? [item.result] : []);
  const aggregated = aggregate(usable);
  const impact = calculateImpact(solutions.map((solution) => ({ type: value(solution, "type_solution", "type"), name: value(solution, "nom_solution", "name") })));
  const unavailableProperties = attempts.filter((item) => !item.result).length;
  const analyticsStatus = !properties.length ? "not_configured" : usable.length ? (unavailableProperties ? "partial" : "available") : "unavailable";
  const hasAnalytics = usable.length > 0;
  return {
    payload: {
      ...aggregated,
      hasAnalytics,
      analyticsStatus,
      availablePropertyCount: usable.length,
      unavailablePropertyCount: unavailableProperties,
      periodLabel: period.label,
      multiProperty: usable.length > 1,
      insight: hasAnalytics ? insight(aggregated) : serviceInsight(impact),
      impact,
      services: summarizeServices(solutions),
      properties: attempts.map((item) => ({ propertyId: item.propertyId, status: item.result ? "available" : "unavailable" }))
    },
    attempts,
    hasTransientFailure: attempts.some((item) => item.transient)
  };
}

async function generateReports(env: Env, data: Awaited<ReturnType<typeof workbook>>, now: Date): Promise<void> {
  const batchSize = Math.max(1, Math.min(Number(env.MONTHLY_REPORT_BATCH_SIZE || 10), 25));
  const queued = await env.MONTHLY_REPORTS_DB.prepare("SELECT * FROM monthly_reports WHERE status = 'pending' AND report_json IS NULL AND (next_attempt_at IS NULL OR next_attempt_at <= ?) ORDER BY created_at ASC LIMIT ?").bind(now.toISOString(), batchSize).all<Record<string, unknown>>();
  for (const row of queued.results) {
    const id = String(row.id); const clientId = String(row.client_id); const lock = await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_reports SET status = 'generating', attempts = attempts + 1, updated_at = ? WHERE id = ? AND status = 'pending'").bind(nowIso(), id).run();
    if ((lock.meta?.changes || 0) !== 1) continue;
    try {
      const period = reportPeriodFromStart(String(row.period_start));
      const currentSolutions = data.solutions.filter((solution) => value(solution, "client_id") === clientId && active(value(solution, "statut_solution", "status", "statut")));
      const propertyRows = parseJson<ReportProperty[]>(String(row.source_properties_json), []);
      const { payload, attempts, hasTransientFailure } = await buildReportPayload(env, period, propertyRows, currentSolutions);
      for (const item of attempts.filter((entry) => !entry.result)) await event(env, id, null, clientId, "property_unavailable", "warning", item.error || "Accès GA4 indisponible.", { propertyId: item.propertyId, transient: item.transient });
      if (!Boolean(payload.hasAnalytics) && hasTransientFailure && Number(row.attempts || 0) + 1 < 3) throw new Error("Toutes les propriétés GA4 sont temporairement indisponibles.");
      if (payload.analyticsStatus === "unavailable") await event(env, id, null, clientId, "analytics_unavailable", "warning", "Aucune propriété GA4 n’est accessible pour ce bilan ; la version services a été préparée.");
      await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_reports SET status = 'ready', report_json = ?, insight = ?, impact_json = ?, template_version = ?, generated_at = ?, updated_at = ?, error_message = NULL WHERE id = ?").bind(json(payload), String(payload.insight), json(payload.impact), TEMPLATE_VERSION, nowIso(), nowIso(), id).run();
      const contacts = data.contacts.filter((contact) => value(contact, "client_id") === clientId && activeContact(value(contact, "statut_contact", "status")) && emailValid(value(contact, "email")) && normalize(value(contact, "bilan_mensuel_actif")) !== "non");
      for (const contact of contacts) {
        const recipientName = [value(contact, "prenom", "first_name"), value(contact, "nom", "last_name")].filter(Boolean).join(" ");
        await env.MONTHLY_REPORTS_DB.prepare("INSERT OR IGNORE INTO monthly_report_deliveries (id, report_id, contact_id, recipient_email, recipient_name, status, idempotency_key, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)").bind(uuid(), id, contactIdentifier(contact), value(contact, "email").toLowerCase(), recipientName, uuid(), nowIso(), nowIso(), expiresAt(now)).run();
      }
      await event(env, id, null, clientId, "report_generated", "ready", "Bilan généré.", { analyticsAvailable: Boolean(payload.hasAnalytics), availableProperties: Number(payload.availablePropertyCount || 0), unavailableProperties: Number(payload.unavailablePropertyCount || 0), recipientCount: contacts.length });
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

async function runTest(env: Env, clientId: string, now = new Date()): Promise<{ status: "sent" | "partial" | "failed"; recipientCount: number; sentCount: number; analyticsStatus: string; availableProperties: number }> {
  const allowed = allowedClientIds(env.MONTHLY_REPORT_ALLOWED_CLIENT_IDS);
  if (!clientId || !allowed.size || !allowed.has(clientId)) throw new Error("Ce client n’est pas autorisé pour un envoi de test.");
  const data = await workbook(env);
  const entry = eligibleClients(data, allowed).find((candidate) => candidate.clientId === clientId);
  if (!entry) throw new Error("Ce client n’est pas éligible au bilan de test.");

  const id = uuid();
  const created = nowIso();
  const period = reportPeriod(now);
  const companyName = value(entry.client, "organisation", "company_name", "nom_compte") || "Client Fluxperf";
  await env.MONTHLY_REPORTS_DB.prepare("INSERT INTO monthly_report_test_runs (id, client_id, company_name, period_key, status, created_at, expires_at) VALUES (?, ?, ?, ?, 'generating', ?, ?)")
    .bind(id, clientId, companyName, period.key, created, testExpiresAt(now)).run();

  try {
    const { payload } = await buildReportPayload(env, period, entry.properties, entry.solutions);
    await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_report_test_runs SET status = 'sending', report_json = ? WHERE id = ?").bind(json(payload), id).run();
    let sentCount = 0;
    for (const contact of entry.contacts) {
      const deliveryId = uuid();
      const recipientName = [value(contact, "prenom", "first_name"), value(contact, "nom", "last_name")].filter(Boolean).join(" ");
      const recipientEmail = value(contact, "email").toLowerCase();
      const idempotencyKey = uuid();
      await env.MONTHLY_REPORTS_DB.prepare("INSERT INTO monthly_report_test_deliveries (id, test_run_id, contact_id, recipient_email, recipient_name, status, attempts, idempotency_key, created_at, updated_at, expires_at) VALUES (?, ?, ?, ?, ?, 'sending', 1, ?, ?, ?, ?)")
        .bind(deliveryId, id, contactIdentifier(contact), recipientEmail, recipientName, idempotencyKey, created, created, testExpiresAt(now)).run();
      const email = renderEmail(payload, recipientName, env.APP_PUBLIC_URL, { test: true });
      try {
        const response = await fetch(BREVO_ENDPOINT, { method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json", "api-key": env.BREVO_API_KEY }, body: json({ sender: { name: "Fluxperf", email: "notifications@fluxperf.fr" }, to: [{ email: recipientEmail, name: recipientName }], subject: email.subject, htmlContent: email.htmlContent, textContent: email.textContent, tags: ["myfluxperf-monthly-report-test"], headers: { "Idempotency-Key": idempotencyKey, "X-Mailin-custom": `monthly-report-test:${id}:${deliveryId}` } }) });
        const result = await response.json().catch(() => ({})) as { messageId?: string; code?: string; message?: string };
        if (response.ok || /duplicate_parameter/i.test(`${result.code || ""} ${result.message || ""}`)) {
          sentCount += 1;
          await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_report_test_deliveries SET status = 'sent', brevo_message_id = ?, sent_at = ?, updated_at = ? WHERE id = ?").bind(result.messageId || null, nowIso(), nowIso(), deliveryId).run();
        } else {
          await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_report_test_deliveries SET status = 'failed', error_message = ?, updated_at = ? WHERE id = ?").bind((result.message || `Brevo ${response.status}`).slice(0, 1000), nowIso(), deliveryId).run();
        }
      } catch (error) {
        await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_report_test_deliveries SET status = 'unknown', error_message = ?, updated_at = ? WHERE id = ?").bind(error instanceof Error ? error.message.slice(0, 1000) : "Brevo indisponible", nowIso(), deliveryId).run();
      }
    }
    const status = sentCount === entry.contacts.length ? "sent" : sentCount ? "partial" : "failed";
    await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_report_test_runs SET status = ?, completed_at = ? WHERE id = ?").bind(status, nowIso(), id).run();
    return { status, recipientCount: entry.contacts.length, sentCount, analyticsStatus: String(payload.analyticsStatus), availableProperties: Number(payload.availablePropertyCount || 0) };
  } catch (error) {
    await env.MONTHLY_REPORTS_DB.prepare("UPDATE monthly_report_test_runs SET status = 'failed', error_message = ?, completed_at = ? WHERE id = ?").bind(error instanceof Error ? error.message.slice(0, 1000) : "Test indisponible", nowIso(), id).run();
    throw error;
  }
}

async function purge(env: Env, now: Date): Promise<void> {
  const local = paris(now); if (local.hour !== 3) return;
  const cutoff = now.toISOString();
  await env.MONTHLY_REPORTS_DB.prepare("DELETE FROM monthly_report_events WHERE expires_at < ?").bind(cutoff).run();
  await env.MONTHLY_REPORTS_DB.prepare("DELETE FROM monthly_report_deliveries WHERE expires_at < ?").bind(cutoff).run();
  await env.MONTHLY_REPORTS_DB.prepare("DELETE FROM monthly_reports WHERE expires_at < ?").bind(cutoff).run();
  await env.MONTHLY_REPORTS_DB.prepare("DELETE FROM monthly_report_test_deliveries WHERE expires_at < ?").bind(cutoff).run();
  await env.MONTHLY_REPORTS_DB.prepare("DELETE FROM monthly_report_test_runs WHERE expires_at < ?").bind(cutoff).run();
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
    if (request.method === "POST" && url.pathname === "/internal/test" && env.MONTHLY_REPORT_INTERNAL_SECRET && request.headers.get("X-Fluxperf-Internal-Secret") === env.MONTHLY_REPORT_INTERNAL_SECRET) {
      let body: { clientId?: unknown } = {};
      try { body = await request.json() as { clientId?: unknown }; } catch { /* invalid request */ }
      const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
      try {
        const result = await runTest(env, clientId);
        return new Response(json(result), { headers: { "Content-Type": "application/json; charset=utf-8" } });
      } catch (error) {
        return new Response(json({ error: error instanceof Error ? error.message : "Le test n’a pas pu être lancé." }), { status: 422, headers: { "Content-Type": "application/json; charset=utf-8" } });
      }
    }
    return new Response("Not found", { status: 404 });
  }
};

export { aggregate, allowedClientIds, configuredProperties, delta, eligibleClients, expiresAt, insight, isSchedulingWindow, renderEmail, reportPeriod, reportPeriodFromStart, summarizeServices };
