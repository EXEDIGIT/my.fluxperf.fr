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
  | { status: "inactive"; raw: RawClientRow };

function normalizeColumn(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function splitList(value: string): string[] {
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
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
      label: action.label || "Action FluxPerf",
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
      name: row.contact_fluxperf_name || "FluxPerf",
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

