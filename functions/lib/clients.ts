import type { ClientDto, RawClientRow } from "./types";

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
    "Site internet, Visibilite Web, Google Ads, Automatisation & IA",
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
};

type SheetRecord = Record<string, string>;

function normalizeColumn(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

function isAffirmative(value: string): boolean {
  const normalized = normalizeToken(value);

  return ["oui", "yes", "true", "1", "active", "actif"].includes(normalized);
}

function isActiveStatus(value: string): boolean {
  return ["active", "actif"].includes(normalizeToken(value));
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

function servicesFromSites(sites: SheetRecord[]): string[] {
  if (sites.length === 0) {
    return ["Espace client Fluxperf"];
  }

  return sites.slice(0, 4).map((site) => {
    const label = getValue(site, "domaine") || getValue(site, "url") || getValue(site, "site_id");

    return `Site suivi : ${label}`;
  });
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
  email: string
): ClientDto {
  const contact = preferredContact(client, contacts, email);
  const activeSites = activeSitesForClient(client, sites);
  const companyName = getValue(client, "organisation") || getValue(client, "nom_compte") || "Client Fluxperf";

  return {
    id: getValue(client, "client_id"),
    status: "active",
    companyName,
    firstName: contact ? getValue(contact, "prenom", "first_name") : "",
    lastName: contact ? getValue(contact, "nom", "last_name") : "",
    planLabel: "Espace client actif",
    services: servicesFromSites(activeSites),
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
    latestActions: latestActionsFromStructuredClient(client, activeSites)
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
    client: structuredClientToDto(matchedClient, contacts, sites, email)
  };
}

export function findClientForEmailInWorkbook(
  workbook: ClientWorkbookValues,
  email: string
): ClientLookupResult {
  const legacyResult = findClientForEmail(workbook.clients, email);

  if (legacyResult.status !== "not_found") {
    return legacyResult;
  }

  return findStructuredClientForEmail(workbook, email);
}
