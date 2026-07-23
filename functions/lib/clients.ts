import type {
  ClientDto,
  ClientImpactDto,
  ClientImpactKey,
  ClientSolutionPlaceholderKey,
  ClientSolutionStatisticsDto,
  ClientSolutionDto,
  ClientSolutionThumbnailDto,
  RawClientRow,
  ThumbnailSourceDto
} from "./types";

const expectedColumns: Array<keyof RawClientRow> = [
  "client_id",
  "status",
  "company_name",
  "contact_first_name",
  "contact_last_name",
  "primary_email",
  "allowed_emails",
  "plan_label",
  "services_active",
  "jotform_request_url",
  "jotform_support_url",
  "report_url",
  "resources_url",
  "contact_fluxperf_name",
  "contact_fluxperf_email",
  "last_action_1_label",
  "last_action_1_date",
  "last_action_2_label",
  "last_action_2_date",
  "last_action_3_label",
  "last_action_3_date"
];

export const demoSheetValues: string[][] = [
  expectedColumns,
  [
    "a2cm",
    "active",
    "A2-CM",
    "Anthony",
    "Dupont",
    "contact@a2-cm.fr",
    "contact@a2-cm.fr, direction@a2-cm.fr",
    "Abonnement actif",
    "Site internet, Visibilite Web, Google Ads, Automatisation & IA, Assistant IA",
    "https://form.jotform.com/240000000000000",
    "https://form.jotform.com/240000000000001",
    "",
    "/ressources",
    "Tristan",
    "hello@fluxperf.fr",
    "Demande de modification envoyée",
    "Il y a 2h",
    "Rapport mensuel disponible",
    "Il y a 1j",
    "Support en cours de traitement",
    "Il y a 2j"
  ]
];

export const demoSolutionsValues: string[][] = [
  [
    "solution_id",
    "client_id",
    "type_solution",
    "statut_solution",
    "nom_solution",
    "domaine",
    "url_ou_indication",
    "date_activation",
    "notes",
    "ga4_property_id",
    "google_ads_customer_id"
  ],
  [
    "SOL-DEMO-1",
    "a2cm",
    "Flux Visibilité & Acquisition",
    "Actif",
    "Flux Visibilité & Acquisition • Site web",
    "a2-cm.fr",
    "https://www.a2-cm.fr",
    "2026-07-06",
    "",
    "123456789",
    ""
  ],
  [
    "SOL-DEMO-2",
    "a2cm",
    "Flux Automatisation & IA",
    "Actif",
    "Flux Automatisation & IA • Tableau de bord",
    "",
    "",
    "2026-07-06",
    "",
    "",
    ""
  ],
  [
    "SOL-DEMO-3",
    "a2cm",
    "Flux Assistant IA",
    "Actif",
    "Flux Assistant IA • Copilote entreprise",
    "",
    "",
    "2026-07-06",
    "",
    "",
    ""
  ]
];

type ClientLookupResult =
  | { status: "ok"; client: ClientDto }
  | { status: "not_found" }
  | { status: "inactive"; raw: RawClientRow | SheetRecord };

export type ClientWorkbookValues = {
  clients: string[][];
  contacts?: string[][];
  solutions?: string[][];
  actions?: string[][];
  connections?: string[][];
  documents?: string[][];
};

type SheetRecord = Record<string, string>;

export type ClientStatisticsSource =
  | {
      status: "available";
      provider: "ga4";
      solution: ClientSolutionDto;
      ga4PropertyId: string;
    }
  | {
      status: "available";
      provider: "google_ads";
      solution: ClientSolutionDto;
      googleAdsCustomerId: string;
    }
  | {
      status: "pending_setup" | "not_applicable";
      provider: "ga4" | "google_ads" | null;
      solution: ClientSolutionDto;
    };

const impactRules: Record<ClientImpactKey, { label: string; defaultWeeklyHoursPerUnit: number }> = {
  visibility_acquisition: {
    label: "Visibilité & Acquisition",
    defaultWeeklyHoursPerUnit: 1.5
  },
  automation_ai: {
    label: "Automatisation & IA",
    defaultWeeklyHoursPerUnit: 1
  },
  assistant_ai: {
    label: "Assistant IA",
    defaultWeeklyHoursPerUnit: 2
  }
};

const solutionImpactKeys: ClientImpactKey[] = ["visibility_acquisition", "automation_ai", "assistant_ai"];

const solutionTypeAliases: Record<ClientImpactKey, string[]> = {
  visibility_acquisition: [
    "visibility_acquisition",
    "visibilite_acquisition",
    "flux_visibility_acquisition",
    "flux_visibilite_acquisition"
  ],
  automation_ai: [
    "automation_ai",
    "automatisation_ai",
    "automatisation_ia",
    "flux_automation_ai",
    "flux_automatisation_ai",
    "flux_automatisation_ia"
  ],
  assistant_ai: [
    "assistant_ai",
    "assistant_ia",
    "flux_assistant_ai",
    "flux_assistant_ia"
  ]
};

function normalizeColumn(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeId(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function normalizeAlias(value: string): string {
  return normalizeToken(value)
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function splitList(value: string): string[] {
  return value
    .split(/[;,]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseRecords(values: string[][]): SheetRecord[] {
  if (values.length < 2) {
    return [];
  }

  const headers = values[0]?.map(normalizeColumn) ?? [];

  return values
    .slice(1)
    .map((row) =>
      headers.reduce((record, header, index) => {
        if (header) {
          record[header] = row[index]?.trim() ?? "";
        }

        return record;
      }, {} as SheetRecord)
    )
    .filter((row) => Object.values(row).some(Boolean));
}

function getValue(record: SheetRecord, ...keys: string[]): string {
  for (const key of keys) {
    const value = record[normalizeColumn(key)];

    if (value) {
      return value;
    }
  }

  return "";
}

function parseActionTimestamp(value: string): number {
  if (!value) {
    return 0;
  }

  const timestamp = Date.parse(value);

  return Number.isFinite(timestamp) ? timestamp : 0;
}

function formatActionDate(value: string): string {
  if (!value) {
    return "";
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [year, month, day] = value.split("-");

    return `${day}/${month}/${year}`;
  }

  const timestamp = Date.parse(value);

  if (!Number.isFinite(timestamp)) {
    return value;
  }

  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).formatToParts(new Date(timestamp));
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";

  return `${part("day")}/${part("month")}/${part("year")} ${part("hour")}:${part("minute")}`;
}

function labelFromActionRecord(action: SheetRecord): string {
  const label = getValue(action, "libelle_action", "label");

  if (label) {
    return label;
  }

  const type = getValue(action, "type_action");

  if (type === "intervention_request") {
    return "Demande d'intervention envoyée";
  }

  if (type === "support_request") {
    return "Message support envoyé";
  }

  return type || "Action Fluxperf";
}

function latestActionsFromActionRows(
  clientId: string,
  actions: string[][] | undefined
): ClientDto["latestActions"] {
  const normalizedClientId = normalizeId(clientId);

  if (!normalizedClientId || !actions || actions.length < 2) {
    return [];
  }

  return parseRecords(actions)
    .map((action, index) => {
      const date = getValue(action, "date_action", "date", "submitted_at");

      return {
        action,
        index,
        timestamp: parseActionTimestamp(date)
      };
    })
    .filter(({ action }) => normalizeId(getValue(action, "client_id")) === normalizedClientId)
    .sort((left, right) => right.timestamp - left.timestamp || right.index - left.index)
    .slice(0, 3)
    .map(({ action }) => {
      const date = getValue(action, "date_action", "date", "submitted_at");

      return {
        label: labelFromActionRecord(action),
        date: formatActionDate(date)
      };
    });
}

function ribAccountForClient(clientId: string, documents: string[][] | undefined): ClientDto["account"] {
  const normalizedClientId = normalizeId(clientId);

  if (!normalizedClientId || !documents || documents.length < 2) {
    return {
      rib: {
        status: "missing",
        submittedAt: null
      }
    };
  }

  const latestRib = parseRecords(documents)
    .map((document, index) => {
      const submittedAt = getValue(document, "submitted_at", "date_depot", "date");

      return {
        document,
        submittedAt,
        index,
        timestamp: parseActionTimestamp(submittedAt)
      };
    })
    .filter(({ document }) => {
      const documentType = normalizeAlias(getValue(document, "document_type", "type_document", "type"));
      const status = normalizeAlias(getValue(document, "status", "statut"));

      return (
        normalizeId(getValue(document, "client_id")) === normalizedClientId &&
        ["rib", "rib_iban", "rib_iban_document"].includes(documentType) &&
        status === "complete"
      );
    })
    .sort((left, right) => right.timestamp - left.timestamp || right.index - left.index)[0];

  if (!latestRib) {
    return {
      rib: {
        status: "missing",
        submittedAt: null
      }
    };
  }

  return {
    rib: {
      status: "complete",
      submittedAt: latestRib.submittedAt || null
    }
  };
}

function withRibAccount(result: ClientLookupResult, documents: string[][] | undefined): ClientLookupResult {
  if (result.status !== "ok") {
    return result;
  }

  return {
    status: "ok",
    client: {
      ...result.client,
      account: ribAccountForClient(result.client.id, documents)
    }
  };
}

function isLikelyUrl(value: string): boolean {
  const candidate = value.trim();

  if (!candidate || /\s/.test(candidate)) {
    return false;
  }

  const withoutProtocol = candidate.replace(/^https?:\/\//i, "");
  const host = withoutProtocol.split(/[/?#]/)[0];

  return /^www\./i.test(host) || /^[a-z0-9-]+(\.[a-z0-9-]+)+(:\d+)?$/i.test(host);
}

function domainFromUrl(value: string): string {
  const text = value.trim();

  if (!text) {
    return "";
  }

  const url = /^https?:\/\//i.test(text) ? text : isLikelyUrl(text) ? `https://${text}` : "";

  if (!url) {
    return "";
  }

  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}

function urlFromUrlOrIndication(value: string): URL | null {
  const text = value.trim();

  if (!text || /\s/.test(text)) {
    return null;
  }

  const candidate = /^https?:\/\//i.test(text) ? text : isLikelyUrl(text) ? `https://${text}` : "";

  if (!candidate) {
    return null;
  }

  try {
    const url = new URL(candidate);

    return url.protocol === "http:" || url.protocol === "https:" ? url : null;
  } catch {
    return null;
  }
}

function normalizeHostname(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

function ipv4Parts(hostname: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return null;
  }

  const parts = hostname.split(".").map(Number);

  return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = ipv4Parts(hostname);

  if (!parts) {
    return false;
  }

  const [first, second] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);

  if (!normalized) {
    return true;
  }

  if (normalized.includes(":")) {
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80")
    );
  }

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    isBlockedIpv4(normalized)
  );
}

function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  const normalizedHost = normalizeHostname(hostname);
  const normalizedDomain = normalizeHostname(domain);

  if (!normalizedHost || !normalizedDomain) {
    return false;
  }

  return normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`);
}

export function thumbnailSourceUrl(urlOrIndication: string, domain: string): string {
  const url = urlFromUrlOrIndication(urlOrIndication);

  if (!url || url.username || url.password || isBlockedHostname(url.hostname)) {
    return "";
  }

  const expectedDomain = domain || domainFromUrl(url.href);

  if (!hostnameMatchesDomain(url.hostname, expectedDomain)) {
    return "";
  }

  return url.href;
}

function isAffirmative(value: string): boolean {
  const normalized = normalizeToken(value);

  return ["oui", "yes", "true", "1", "active", "actif"].includes(normalized);
}

function isActiveStatus(value: string): boolean {
  return ["active", "actif"].includes(normalizeToken(value));
}

function roundToHalfHour(value: number): number {
  return Math.round(value * 2) / 2;
}

function monthlyHoursFromWeekly(weeklyHours: number): number {
  return roundToHalfHour((weeklyHours * 52) / 12);
}

function solutionImpactKey(solution: SheetRecord): ClientImpactKey | null {
  const type = normalizeAlias(getValue(solution, "type_solution", "type", "solution_type"));

  return solutionImpactKeys.find((key) => solutionTypeAliases[key].includes(type)) ?? null;
}

function solutionName(solution: SheetRecord): string {
  return getValue(solution, "nom_solution", "name", "nom", "solution");
}

function isGoogleAdsSolution(solution: SheetRecord): boolean {
  const normalized = normalizeToken(solutionName(solution)).replace(/[_-]+/g, " ");

  return normalized.includes("google ads") || normalized.includes("publicite google") || normalized === "ads";
}

function isSocialMediaSolution(solution: SheetRecord): boolean {
  const normalized = normalizeToken(solutionName(solution)).replace(/[_-]+/g, " ");

  return normalized.includes("reseaux sociaux") || normalized.includes("reseau social");
}

function isWebsiteVisibilitySolution(type: ClientImpactKey | null, solution: SheetRecord): boolean {
  return type === "visibility_acquisition" && !isGoogleAdsSolution(solution) && !isSocialMediaSolution(solution);
}

function weeklyHoursForSolution(solution: SheetRecord): number {
  const type = solutionImpactKey(solution);

  if (!type) {
    return 0;
  }

  if (type === "visibility_acquisition" && (isGoogleAdsSolution(solution) || isSocialMediaSolution(solution))) {
    return 2;
  }

  return impactRules[type].defaultWeeklyHoursPerUnit;
}

function emptyImpact(): ClientImpactDto {
  return {
    weeklyHours: 0,
    monthlyHours: 0,
    items: [],
    isEstimated: true
  };
}

function buildImpact(activeSolutions: SheetRecord[] = []): ClientImpactDto {
  const quantities: Record<ClientImpactKey, number> = {
    visibility_acquisition: 0,
    automation_ai: 0,
    assistant_ai: 0
  };
  const weeklyHoursByType: Record<ClientImpactKey, number> = {
    visibility_acquisition: 0,
    automation_ai: 0,
    assistant_ai: 0
  };

  activeSolutions.forEach((solution) => {
    const type = solutionImpactKey(solution);

    if (type) {
      quantities[type] += 1;
      weeklyHoursByType[type] += weeklyHoursForSolution(solution);
    }
  });

  const items = (Object.keys(impactRules) as ClientImpactKey[])
    .map((key) => {
      const quantity = quantities[key];
      const rule = impactRules[key];
      const weeklyHours = roundToHalfHour(weeklyHoursByType[key]);

      return {
        key,
        label: rule.label,
        quantity,
        weeklyHours,
        monthlyHours: monthlyHoursFromWeekly(weeklyHours)
      };
    })
    .filter((item) => item.quantity > 0);

  if (items.length === 0) {
    return emptyImpact();
  }

  const weeklyHours = roundToHalfHour(
    items.reduce((total, item) => total + item.weeklyHours, 0)
  );

  return {
    weeklyHours,
    monthlyHours: monthlyHoursFromWeekly(weeklyHours),
    items,
    isEstimated: true
  };
}

function hasStructuredClientHeaders(values: string[][]): boolean {
  const headers = values[0]?.map(normalizeColumn) ?? [];

  return headers.includes("email_principal") || headers.includes("statut_client");
}

function blankRawClientRow(): RawClientRow {
  return expectedColumns.reduce((row, column) => {
    row[column] = "";
    return row;
  }, {} as RawClientRow);
}

export function parseClientRows(values: string[][]): RawClientRow[] {
  if (values.length < 2) {
    return [];
  }

  const headers = values[0]?.map(normalizeColumn) ?? [];

  return values
    .slice(1)
    .map((row) => {
      const record = blankRawClientRow();

      headers.forEach((header, index) => {
        if (expectedColumns.includes(header as keyof RawClientRow)) {
          record[header as keyof RawClientRow] = row[index]?.trim() ?? "";
        }
      });

      return record;
    })
    .filter((row) => row.client_id || row.primary_email || row.allowed_emails);
}

export function clientEmails(row: RawClientRow): string[] {
  const emails = [row.primary_email, ...splitList(row.allowed_emails)]
    .map(normalizeEmail)
    .filter(Boolean);

  return Array.from(new Set(emails));
}

export function toClientDto(row: RawClientRow): ClientDto {
  const latestActions = [
    [row.last_action_1_label, row.last_action_1_date],
    [row.last_action_2_label, row.last_action_2_date],
    [row.last_action_3_label, row.last_action_3_date]
  ]
    .map(([label, date]) => ({
      label: label.trim(),
      date: date.trim()
    }))
    .filter((action) => action.label || action.date)
    .map((action) => ({
      label: action.label || "Action Fluxperf",
      date: action.date
    }));

  return {
    id: row.client_id,
    status: row.status,
    companyName: row.company_name,
    firstName: row.contact_first_name,
    lastName: row.contact_last_name,
    planLabel: row.plan_label || "Espace client actif",
    services: splitList(row.services_active),
    solutions: [],
    impact: emptyImpact(),
    links: {
      request: row.jotform_request_url || null,
      support: row.jotform_support_url || null,
      report: row.report_url || null,
      resources: row.resources_url || null
    },
    fluxperfContact: {
      name: row.contact_fluxperf_name || "Fluxperf",
      email: row.contact_fluxperf_email || "hello@fluxperf.fr"
    },
    latestActions,
    account: {
      rib: {
        status: "missing",
        submittedAt: null
      }
    }
  };
}

export function findClientForEmail(values: string[][], email: string): ClientLookupResult {
  const normalizedEmail = normalizeEmail(email);
  const matchedClient = parseClientRows(values).find((row) =>
    clientEmails(row).includes(normalizedEmail)
  );

  if (!matchedClient) {
    return { status: "not_found" };
  }

  if (matchedClient.status.trim().toLowerCase() !== "active") {
    return { status: "inactive", raw: matchedClient };
  }

  return {
    status: "ok",
    client: toClientDto(matchedClient)
  };
}

function contactIsUsable(contact: SheetRecord): boolean {
  const status = getValue(contact, "statut_contact", "status");

  return !status || isActiveStatus(status);
}

function clientIsActive(client: SheetRecord): boolean {
  const status = getValue(client, "statut_client", "status");
  const portalEnabled = getValue(client, "espace_client_actif");

  return isActiveStatus(status) && (!portalEnabled || isAffirmative(portalEnabled));
}

function contactsForClient(client: SheetRecord, contacts: SheetRecord[]): SheetRecord[] {
  const clientId = getValue(client, "client_id");

  return contacts.filter(
    (contact) => getValue(contact, "client_id") === clientId && contactIsUsable(contact)
  );
}

function structuredClientEmails(client: SheetRecord, contacts: SheetRecord[]): string[] {
  const emails = [
    getValue(client, "email_principal", "primary_email"),
    ...contactsForClient(client, contacts).map((contact) => getValue(contact, "email"))
  ]
    .flatMap(splitList)
    .map(normalizeEmail)
    .filter(Boolean);

  return Array.from(new Set(emails));
}

function preferredContact(
  client: SheetRecord,
  contacts: SheetRecord[],
  email: string
): SheetRecord | null {
  const clientContacts = contactsForClient(client, contacts);
  const normalizedEmail = normalizeEmail(email);
  const principalContactId = getValue(client, "contact_principal_id");

  return (
    clientContacts.find((contact) => normalizeEmail(getValue(contact, "email")) === normalizedEmail) ||
    clientContacts.find((contact) => getValue(contact, "contact_id") === principalContactId) ||
    clientContacts.find((contact) => isAffirmative(getValue(contact, "contact_principal"))) ||
    clientContacts[0] ||
    null
  );
}

function activeSolutionsForClient(client: SheetRecord, solutions: SheetRecord[]): SheetRecord[] {
  const clientId = getValue(client, "client_id");

  return solutions.filter((solution) => {
    if (getValue(solution, "client_id") !== clientId) {
      return false;
    }

    return isActiveStatus(getValue(solution, "statut_solution", "status", "statut"));
  });
}

function activeClientIdsFromWorkbook(workbook: ClientWorkbookValues): Set<string> {
  const structuredClients = hasStructuredClientHeaders(workbook.clients);

  return new Set(
    parseRecords(workbook.clients)
      .filter((client) =>
        structuredClients
          ? clientIsActive(client)
          : isActiveStatus(getValue(client, "status", "statut_client"))
      )
      .map((client) => getValue(client, "client_id"))
      .filter(Boolean)
  );
}

function thumbnailSourceFromSolution(solution: SheetRecord): ThumbnailSourceDto | null {
  const type = solutionImpactKey(solution);

  if (type !== "visibility_acquisition" || !isWebsiteVisibilitySolution(type, solution)) {
    return null;
  }

  if (!isActiveStatus(getValue(solution, "statut_solution", "status", "statut"))) {
    return null;
  }

  const solutionId = getValue(solution, "solution_id", "id");
  const clientId = getValue(solution, "client_id");
  const urlOrIndication = getValue(solution, "url_ou_indication", "url");
  const domain = getValue(solution, "domaine", "domain") || domainFromUrl(urlOrIndication);
  const sourceUrl = thumbnailSourceUrl(urlOrIndication, domain);

  if (!solutionId || !clientId || !sourceUrl) {
    return null;
  }

  return {
    solutionId,
    clientId,
    type,
    typeLabel: solutionTypeLabel(type, solution),
    name:
      getValue(solution, "nom_solution", "name", "nom", "solution") ||
      solutionTypeLabel(type, solution),
    domain,
    url: sourceUrl
  };
}

export function getThumbnailSourcesFromWorkbook(workbook: ClientWorkbookValues): ThumbnailSourceDto[] {
  const activeClientIds = activeClientIdsFromWorkbook(workbook);

  if (activeClientIds.size === 0) {
    return [];
  }

  return parseRecords(workbook.solutions ?? [])
    .filter((solution) => activeClientIds.has(getValue(solution, "client_id")))
    .map(thumbnailSourceFromSolution)
    .filter((source): source is ThumbnailSourceDto => Boolean(source));
}

function solutionTypeLabel(type: ClientImpactKey | null, solution: SheetRecord): string {
  const officialLabels: Record<ClientImpactKey, string> = {
    visibility_acquisition: "Flux Visibilité & Acquisition",
    automation_ai: "Flux Automatisation & IA",
    assistant_ai: "Flux Assistant IA"
  };

  return type ? officialLabels[type] : getValue(solution, "type_solution", "type", "solution_type");
}

function thumbnailPlaceholderKey(
  type: ClientImpactKey | null,
  solution: SheetRecord
): ClientSolutionPlaceholderKey {
  if (isGoogleAdsSolution(solution)) {
    return "google_ads";
  }

  if (isSocialMediaSolution(solution)) {
    return "social_media";
  }

  return type ?? "automation_ai";
}

function thumbnailForSolution(
  id: string,
  type: ClientImpactKey | null,
  solution: SheetRecord,
  url: string,
  domain: string
): ClientSolutionThumbnailDto {
  const sourceUrl = thumbnailSourceUrl(url, domain);
  const hasWebsiteThumbnail = isWebsiteVisibilitySolution(type, solution) && Boolean(sourceUrl);

  return {
    kind: hasWebsiteThumbnail ? "website" : "placeholder",
    endpoint: hasWebsiteThumbnail ? `/api/thumbnails/${encodeURIComponent(id)}` : null,
    placeholderKey: thumbnailPlaceholderKey(type, solution)
  };
}

function normalizeGa4PropertyId(value: string): string {
  const trimmed = value.trim();
  const fromResourceName = trimmed.match(/^properties\/(\d+)$/i)?.[1];
  const candidate = fromResourceName || trimmed;

  return /^\d+$/.test(candidate) ? candidate : "";
}

function normalizeGoogleAdsCustomerId(value: string): string {
  const candidate = value.replace(/\D/g, "");

  return /^\d{10}$/.test(candidate) ? candidate : "";
}

function statisticsForSolution(
  type: ClientImpactKey | null,
  domain: string,
  solution: SheetRecord
): ClientSolutionStatisticsDto {
  if (type !== "visibility_acquisition") {
    return {
      status: "not_applicable",
      provider: null
    };
  }

  if (isGoogleAdsSolution(solution)) {
    const googleAdsCustomerId = normalizeGoogleAdsCustomerId(
      getValue(solution, "google_ads_customer_id", "google_ads_id", "ads_customer_id")
    );

    return {
      status: googleAdsCustomerId ? "available" : "pending_setup",
      provider: "google_ads"
    };
  }

  if (!isWebsiteVisibilitySolution(type, solution) || !domain) {
    return {
      status: "not_applicable",
      provider: null
    };
  }

  const ga4PropertyId = normalizeGa4PropertyId(
    getValue(solution, "ga4_property_id", "ga4_property", "analytics_property_id")
  );

  return {
    status: ga4PropertyId ? "available" : "pending_setup",
    provider: "ga4"
  };
}

function solutionRecordId(solution: SheetRecord, name: string, domain: string, url: string): string {
  return getValue(solution, "solution_id", "id") || name || domain || url;
}

function solutionRecordToDto(solution: SheetRecord): ClientSolutionDto {
  const url = getValue(solution, "url_ou_indication", "url");
  const domain = getValue(solution, "domaine", "domain") || domainFromUrl(url);
  const type = solutionImpactKey(solution);
  const name =
    getValue(solution, "nom_solution", "name", "nom", "solution") ||
    solutionTypeLabel(type, solution) ||
    "Solution Fluxperf";
  const id = solutionRecordId(solution, name, domain, url);

  return {
    id,
    type: type ?? getValue(solution, "type_solution", "type", "solution_type"),
    typeLabel: solutionTypeLabel(type, solution),
    status: getValue(solution, "statut_solution", "status", "statut") || "Actif",
    name,
    domain,
    url,
    activatedAt: getValue(solution, "date_activation", "activated_at", "date"),
    thumbnail: thumbnailForSolution(id, type, solution, url, domain),
    statistics: statisticsForSolution(type, domain, solution)
  };
}

export function getStatisticsSourceForClientSolution(
  workbook: ClientWorkbookValues,
  client: ClientDto,
  solutionId: string
): ClientStatisticsSource | null {
  const solution = client.solutions.find((item) => item.id === solutionId);

  if (!solution) {
    return null;
  }

  if (solution.statistics.status !== "available") {
    return {
      status: solution.statistics.status,
      provider: solution.statistics.provider,
      solution
    };
  }

  const rawSolution = activeSolutionsForClient(
    { client_id: client.id },
    parseRecords(workbook.solutions ?? [])
  ).find((record) => {
    const url = getValue(record, "url_ou_indication", "url");
    const domain = getValue(record, "domaine", "domain") || domainFromUrl(url);
    const type = solutionImpactKey(record);
    const name =
      getValue(record, "nom_solution", "name", "nom", "solution") ||
      solutionTypeLabel(type, record) ||
      "Solution Fluxperf";

    return solutionRecordId(record, name, domain, url) === solutionId;
  });
  if (solution.statistics.provider === "google_ads") {
    const googleAdsCustomerId = rawSolution
      ? normalizeGoogleAdsCustomerId(
          getValue(rawSolution, "google_ads_customer_id", "google_ads_id", "ads_customer_id")
        )
      : "";

    if (!googleAdsCustomerId) {
      return {
        status: "pending_setup",
        provider: "google_ads",
        solution
      };
    }

    return {
      status: "available",
      provider: "google_ads",
      solution,
      googleAdsCustomerId
    };
  }

  const ga4PropertyId = rawSolution
    ? normalizeGa4PropertyId(getValue(rawSolution, "ga4_property_id", "ga4_property", "analytics_property_id"))
    : "";

  if (!ga4PropertyId) {
    return {
      status: "pending_setup",
      provider: "ga4",
      solution
    };
  }

  return {
    status: "available",
    provider: "ga4",
    solution,
    ga4PropertyId
  };
}

function serviceFromSolution(solution: SheetRecord): string | null {
  const type = solutionImpactKey(solution);

  if (!type) {
    return null;
  }

  const solutionName = getValue(solution, "nom_solution", "name", "nom", "solution");
  const familyLabel = solutionTypeLabel(type, solution);
  const url = getValue(solution, "url_ou_indication", "url");
  const domain = getValue(solution, "domaine", "domain") || domainFromUrl(url);
  const detail = domain || url;
  const solutionNameAlreadyIncludesFamily =
    solutionName && normalizeAlias(solutionName).includes(normalizeAlias(familyLabel));
  const baseLabel = solutionName
    ? solutionNameAlreadyIncludesFamily
      ? solutionName
      : `${familyLabel} : ${solutionName}`
    : familyLabel;

  return detail ? `${baseLabel} - ${detail}` : baseLabel;
}

function dedupeServiceLabels(labels: string[]): string[] {
  const counts = labels.reduce((result, label) => {
    result.set(label, (result.get(label) ?? 0) + 1);
    return result;
  }, new Map<string, number>());

  return Array.from(counts).map(([label, count]) => (
    count > 1 ? `${label} (${count} actifs)` : label
  ));
}

function servicesFromActivePortfolio(solutions: SheetRecord[]): string[] {
  const serviceLabels = solutions.map(serviceFromSolution).filter((label): label is string => Boolean(label));

  if (serviceLabels.length === 0) {
    return ["Espace client Fluxperf"];
  }

  return dedupeServiceLabels(serviceLabels);
}

function latestActionsFromStructuredClient(client: SheetRecord, solutions: SheetRecord[]) {
  const actions: ClientDto["latestActions"] = [];
  const updateDate = getValue(client, "date_mise_a_jour");
  const creationDate = getValue(client, "date_creation");

  if (updateDate) {
    actions.push({
      label: "Fiche client mise à jour",
      date: updateDate
    });
  }

  if (solutions.length > 0) {
    actions.push({
      label: `${solutions.length} solution${solutions.length > 1 ? "s" : ""} active${
        solutions.length > 1 ? "s" : ""
      }`,
      date: updateDate || creationDate || ""
    });
  }

  if (creationDate && actions.length < 3) {
    actions.push({
      label: "Espace client créé",
      date: creationDate
    });
  }

  return actions.slice(0, 3);
}

function structuredClientToDto(
  client: SheetRecord,
  contacts: SheetRecord[],
  solutions: SheetRecord[],
  actions: string[][] | undefined,
  email: string
): ClientDto {
  const contact = preferredContact(client, contacts, email);
  const clientId = getValue(client, "client_id");
  const activeSolutions = activeSolutionsForClient(client, solutions);
  const companyName = getValue(client, "organisation") || getValue(client, "nom_compte") || "Client Fluxperf";
  const actionHistory = latestActionsFromActionRows(clientId, actions);

  return {
    id: clientId,
    status: "active",
    companyName,
    firstName: contact ? getValue(contact, "prenom", "first_name") : "",
    lastName: contact ? getValue(contact, "nom", "last_name") : "",
    planLabel: "Espace client actif",
    services: servicesFromActivePortfolio(activeSolutions),
    solutions: activeSolutions.map(solutionRecordToDto),
    impact: buildImpact(activeSolutions),
    links: {
      request: null,
      support: null,
      report: null,
      resources: null
    },
    fluxperfContact: {
      name: "Fluxperf",
      email: "hello@fluxperf.fr"
    },
    latestActions: actionHistory.length > 0 ? actionHistory : latestActionsFromStructuredClient(client, activeSolutions),
    account: {
      rib: {
        status: "missing",
        submittedAt: null
      }
    }
  };
}

function findStructuredClientForEmail(
  workbook: ClientWorkbookValues,
  email: string
): ClientLookupResult {
  if (!hasStructuredClientHeaders(workbook.clients)) {
    return { status: "not_found" };
  }

  const normalizedEmail = normalizeEmail(email);
  const clients = parseRecords(workbook.clients);
  const contacts = parseRecords(workbook.contacts ?? []);
  const solutions = parseRecords(workbook.solutions ?? []);
  const matchedClient = clients.find((client) =>
    structuredClientEmails(client, contacts).includes(normalizedEmail)
  );

  if (!matchedClient) {
    return { status: "not_found" };
  }

  if (!clientIsActive(matchedClient)) {
    return { status: "inactive", raw: matchedClient };
  }

  return {
    status: "ok",
    client: structuredClientToDto(matchedClient, contacts, solutions, workbook.actions, email)
  };
}

export function findClientForEmailInWorkbook(
  workbook: ClientWorkbookValues,
  email: string
): ClientLookupResult {
  const legacyResult = findClientForEmail(workbook.clients, email);

  if (legacyResult.status !== "not_found") {
    if (legacyResult.status === "ok") {
      const actionHistory = latestActionsFromActionRows(legacyResult.client.id, workbook.actions);
      const activeSolutions = activeSolutionsForClient(
        { client_id: legacyResult.client.id },
        parseRecords(workbook.solutions ?? [])
      );
      const client =
        activeSolutions.length > 0
          ? {
              ...legacyResult.client,
              services: servicesFromActivePortfolio(activeSolutions),
              solutions: activeSolutions.map(solutionRecordToDto),
              impact: buildImpact(activeSolutions)
            }
          : legacyResult.client;

      if (actionHistory.length > 0) {
        return withRibAccount({
          status: "ok",
          client: {
            ...client,
            latestActions: actionHistory
          }
        }, workbook.documents);
      }

      return withRibAccount({
        status: "ok",
        client
      }, workbook.documents);
    }

    return legacyResult;
  }

  return withRibAccount(findStructuredClientForEmail(workbook, email), workbook.documents);
}
