import type { ClientDto, ClientImpactDto, ClientImpactKey, ClientSiteDto, RawClientRow } from "./types";

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
    "Demande de modification envoyee",
    "Il y a 2h",
    "Rapport mensuel disponible",
    "Il y a 1j",
    "Support en cours de traitement",
    "Il y a 2j"
  ]
];

type ClientLookupResult =
  | { status: "ok"; client: ClientDto }
  | { status: "not_found" }
  | { status: "inactive"; raw: RawClientRow | SheetRecord };

export type ClientWorkbookValues = {
  clients: string[][];
  contacts?: string[][];
  sites?: string[][];
  solutions?: string[][];
  actions?: string[][];
};

type SheetRecord = Record<string, string>;

const impactRules: Record<ClientImpactKey, { label: string; weeklyHoursPerUnit: number }> = {
  visibility_acquisition: {
    label: "Visibilité & Acquisition",
    weeklyHoursPerUnit: 1.5
  },
  automation_ai: {
    label: "Automatisation & IA",
    weeklyHoursPerUnit: 1
  },
  assistant_ai: {
    label: "Assistant IA",
    weeklyHoursPerUnit: 2
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
    return "Demande d'intervention envoyee";
  }

  if (type === "support_request") {
    return "Message support envoye";
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

function domainFromUrl(value: string): string {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).hostname.replace(/^www\./, "");
  } catch {
    return value
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .trim();
  }
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

  activeSolutions.forEach((solution) => {
    const type = solutionImpactKey(solution);

    if (type) {
      quantities[type] += 1;
    }
  });

  const items = (Object.keys(impactRules) as ClientImpactKey[])
    .map((key) => {
      const quantity = quantities[key];
      const rule = impactRules[key];
      const weeklyHours = roundToHalfHour(quantity * rule.weeklyHoursPerUnit);

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
    sites: [],
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
    latestActions
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

function activeSitesForClient(client: SheetRecord, sites: SheetRecord[]): SheetRecord[] {
  const clientId = getValue(client, "client_id");

  return sites.filter((site) => {
    if (getValue(site, "client_id") !== clientId) {
      return false;
    }

    const siteStatus = getValue(site, "statut_site", "status");
    const trackingEnabled = getValue(site, "suivi_actif");

    return (!siteStatus || isActiveStatus(siteStatus)) && (!trackingEnabled || isAffirmative(trackingEnabled));
  });
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

function siteRecordToDto(site: SheetRecord): ClientSiteDto {
  const url = getValue(site, "url");
  const domain = getValue(site, "domaine", "domain") || domainFromUrl(url) || getValue(site, "site_id");

  return {
    id: getValue(site, "site_id") || domain || url,
    domain,
    url,
    type: getValue(site, "type_site", "type") || "Site suivi",
    status: getValue(site, "statut_site", "status") || "Actif"
  };
}

function serviceFromSolution(solution: SheetRecord): string | null {
  const type = solutionImpactKey(solution);

  if (!type) {
    return null;
  }

  const familyLabels: Record<ClientImpactKey, string> = {
    visibility_acquisition: "Flux Visibilité & Acquisition",
    automation_ai: "Flux Automatisation & IA",
    assistant_ai: "Flux Assistant IA"
  };
  const solutionName = getValue(solution, "nom_solution", "name", "nom", "solution");
  const familyLabel = familyLabels[type];

  return solutionName ? `${familyLabel} : ${solutionName}` : familyLabel;
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

function latestActionsFromStructuredClient(client: SheetRecord, sites: SheetRecord[]) {
  const actions: ClientDto["latestActions"] = [];
  const updateDate = getValue(client, "date_mise_a_jour");
  const creationDate = getValue(client, "date_creation");

  if (updateDate) {
    actions.push({
      label: "Fiche client mise a jour",
      date: updateDate
    });
  }

  if (sites.length > 0) {
    actions.push({
      label: `${sites.length} site${sites.length > 1 ? "s" : ""} actif${sites.length > 1 ? "s" : ""} suivi${
        sites.length > 1 ? "s" : ""
      }`,
      date: updateDate || creationDate || ""
    });
  }

  if (creationDate && actions.length < 3) {
    actions.push({
      label: "Espace client cree",
      date: creationDate
    });
  }

  return actions.slice(0, 3);
}

function structuredClientToDto(
  client: SheetRecord,
  contacts: SheetRecord[],
  sites: SheetRecord[],
  solutions: SheetRecord[],
  actions: string[][] | undefined,
  email: string
): ClientDto {
  const contact = preferredContact(client, contacts, email);
  const clientId = getValue(client, "client_id");
  const activeSites = activeSitesForClient(client, sites);
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
    sites: activeSites.map(siteRecordToDto),
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
    latestActions: actionHistory.length > 0 ? actionHistory : latestActionsFromStructuredClient(client, activeSites)
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
  const sites = parseRecords(workbook.sites ?? []);
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
    client: structuredClientToDto(matchedClient, contacts, sites, solutions, workbook.actions, email)
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

      if (actionHistory.length > 0) {
        return {
          status: "ok",
          client: {
            ...legacyResult.client,
            latestActions: actionHistory
          }
        };
      }
    }

    return legacyResult;
  }

  return findStructuredClientForEmail(workbook, email);
}
