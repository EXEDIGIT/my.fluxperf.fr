import { normalizeEmail } from "./auth";
import { formatFrenchDate, formatParisDateKey, formatParisMonthKey } from "./dateFormats";
import type { ClientWorkbookValues } from "./clients";

type SheetRecord = Record<string, string>;

type RowRecord = {
  rowNumber: number;
  record: SheetRecord;
};

export type AdminClientSummary = {
  id: string;
  companyName: string;
  status: string;
  portalEnabled: boolean;
  email: string;
  contactName: string;
  activeSolutions: number;
  totalSolutions: number;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  lastActivityLabel: string;
};

export type AdminClientDetail = AdminClientSummary & {
  notes: string;
  contacts: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    status: string;
    isPrimary: boolean;
  }>;
  solutions: Array<{
    id: string;
    type: string;
    status: string;
    name: string;
    domain: string;
    urlOrIndication: string;
    activatedAt: string;
    notes: string;
  }>;
  actions: Array<{
    id: string;
    date: string;
    type: string;
    label: string;
    reference: string;
    requesterEmail: string;
    status: string;
  }>;
};

export type AdminDashboard = {
  generatedAt: string;
  totals: {
    activeClients: number;
    totalClients: number;
    activeSolutions: number;
    interventionRequests12Months: number;
    interventionRequestsAveragePerMonth: number;
    interventionRequestsAveragePerActiveClient: number;
    connections12Months: number;
    connectionsAveragePerMonth: number;
  };
  interventionRequestsByMonth: Array<{
    month: string;
    label: string;
    count: number;
  }>;
  topInterventionClients: Array<{
    clientId: string;
    companyName: string;
    count: number;
  }>;
  topConnectionClients: Array<{
    clientId: string;
    companyName: string;
    count: number;
  }>;
};

function normalizeColumn(value: string): string {
  return value.trim().toLowerCase();
}

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

export function parseRows(values: string[][] | undefined): RowRecord[] {
  if (!values || values.length < 2) {
    return [];
  }

  const headers = values[0].map(normalizeColumn);

  return values
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      record: headers.reduce((record, header, cellIndex) => {
        if (header) {
          record[header] = row[cellIndex]?.trim() ?? "";
        }

        return record;
      }, {} as SheetRecord)
    }))
    .filter(({ record }) => Object.values(record).some(Boolean));
}

function isActiveStatus(value: string): boolean {
  return ["active", "actif"].includes(normalizeToken(value));
}

function isAffirmative(value: string): boolean {
  return ["oui", "yes", "true", "1", "active", "actif"].includes(normalizeToken(value));
}

function isInterventionAction(action: SheetRecord): boolean {
  return getValue(action, "type_action", "type") === "intervention_request";
}

function timestamp(value: string): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function actionLabel(action: SheetRecord): string {
  return getValue(action, "libelle_action", "label") || getValue(action, "type_action") || "Action Fluxperf";
}

function clientId(record: SheetRecord): string {
  return getValue(record, "client_id", "id");
}

function solutionClientId(record: SheetRecord): string {
  return getValue(record, "client_id");
}

function companyName(record: SheetRecord): string {
  return getValue(record, "organisation", "company_name", "nom_compte") || "Client Fluxperf";
}

function contactName(record: SheetRecord): string {
  return [getValue(record, "prenom", "first_name"), getValue(record, "nom", "last_name")]
    .filter(Boolean)
    .join(" ")
    .trim();
}

function clientIsActive(record: SheetRecord): boolean {
  return isActiveStatus(getValue(record, "statut_client", "status")) && clientPortalEnabled(record);
}

function clientPortalEnabled(record: SheetRecord): boolean {
  const value = getValue(record, "espace_client_actif");

  return !value || isAffirmative(value);
}

function solutionIsActive(record: SheetRecord): boolean {
  return isActiveStatus(getValue(record, "statut_solution", "status", "statut"));
}

function actionMonthKey(action: SheetRecord): string {
  const date = getValue(action, "date_action", "date", "submitted_at");
  const parsed = timestamp(date);

  return parsed > 0 ? formatParisMonthKey(new Date(parsed)) : "";
}

function connectionMonthKey(connection: SheetRecord): string {
  return getValue(connection, "mois") || (
    timestamp(getValue(connection, "date_connexion")) > 0
      ? formatParisMonthKey(new Date(timestamp(getValue(connection, "date_connexion"))))
      : ""
  );
}

function monthLabel(monthKey: string): string {
  const [year, month] = monthKey.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, 1));

  return new Intl.DateTimeFormat("fr-FR", {
    month: "short",
    year: "2-digit",
    timeZone: "Europe/Paris"
  }).format(date);
}

function lastTwelveMonthKeys(now = new Date()): string[] {
  const currentMonth = formatParisMonthKey(now);
  const [year, month] = currentMonth.split("-").map(Number);

  return Array.from({ length: 12 }, (_, index) => {
    const date = new Date(Date.UTC(year, month - 1 - (11 - index), 1));
    const monthValue = String(date.getUTCMonth() + 1).padStart(2, "0");

    return `${date.getUTCFullYear()}-${monthValue}`;
  });
}

function roundMetric(value: number): number {
  return Math.round(value * 10) / 10;
}

function rowsByClient(rows: RowRecord[], id: string): RowRecord[] {
  return rows.filter(({ record }) => getValue(record, "client_id") === id);
}

function latestActivity(actions: RowRecord[], client: SheetRecord): { label: string; date: string } {
  const latestAction = actions
    .filter(({ record }) => getValue(record, "client_id") === clientId(client))
    .sort((left, right) => timestamp(getValue(right.record, "date_action")) - timestamp(getValue(left.record, "date_action")))[0];

  if (latestAction) {
    return {
      label: actionLabel(latestAction.record),
      date: getValue(latestAction.record, "date_action")
    };
  }

  return {
    label: getValue(client, "date_mise_a_jour") ? "Fiche client mise a jour" : "Client cree",
    date: getValue(client, "date_mise_a_jour", "date_creation")
  };
}

export function buildClientSummary(
  client: RowRecord,
  contacts: RowRecord[],
  solutions: RowRecord[],
  actions: RowRecord[]
): AdminClientSummary {
  const id = clientId(client.record);
  const clientContacts = rowsByClient(contacts, id);
  const primaryContactId = getValue(client.record, "contact_principal_id");
  const primaryContact =
    clientContacts.find(({ record }) => getValue(record, "contact_id") === primaryContactId) ||
    clientContacts.find(({ record }) => isAffirmative(getValue(record, "contact_principal"))) ||
    clientContacts[0];
  const clientSolutions = rowsByClient(solutions, id);
  const activity = latestActivity(actions, client.record);

  return {
    id,
    companyName: companyName(client.record),
    status: getValue(client.record, "statut_client", "status") || "Actif",
    portalEnabled: clientPortalEnabled(client.record),
    email: normalizeEmail(getValue(client.record, "email_principal", "primary_email")),
    contactName: primaryContact ? contactName(primaryContact.record) : getValue(client.record, "nom_compte"),
    activeSolutions: clientSolutions.filter(({ record }) => solutionIsActive(record)).length,
    totalSolutions: clientSolutions.length,
    createdAt: getValue(client.record, "date_creation"),
    updatedAt: getValue(client.record, "date_mise_a_jour"),
    lastActivityAt: activity.date,
    lastActivityLabel: activity.label
  };
}

export function adminClientRows(workbook: ClientWorkbookValues): RowRecord[] {
  return parseRows(workbook.clients);
}

export function adminSolutionRows(workbook: ClientWorkbookValues): RowRecord[] {
  return parseRows(workbook.solutions);
}

export function findAdminClientRow(workbook: ClientWorkbookValues, id: string): RowRecord | null {
  return adminClientRows(workbook).find(({ record }) => clientId(record) === id) ?? null;
}

export function findAdminSolutionRow(
  workbook: ClientWorkbookValues,
  clientIdValue: string,
  solutionId: string
): RowRecord | null {
  return adminSolutionRows(workbook).find(({ record }) =>
    solutionClientId(record) === clientIdValue && getValue(record, "solution_id", "id") === solutionId
  ) ?? null;
}

export function activeSolutionCountForClient(workbook: ClientWorkbookValues, id: string): number {
  return adminSolutionRows(workbook).filter(({ record }) =>
    solutionClientId(record) === id && solutionIsActive(record)
  ).length;
}

export function buildAdminClientList(workbook: ClientWorkbookValues): AdminClientSummary[] {
  const contacts = parseRows(workbook.contacts);
  const solutions = parseRows(workbook.solutions);
  const actions = parseRows(workbook.actions);

  return adminClientRows(workbook)
    .map((client) => buildClientSummary(client, contacts, solutions, actions))
    .filter((client) => client.id)
    .sort((left, right) => left.companyName.localeCompare(right.companyName, "fr"));
}

export function buildAdminClientDetail(workbook: ClientWorkbookValues, id: string): AdminClientDetail | null {
  const client = findAdminClientRow(workbook, id);

  if (!client) {
    return null;
  }

  const contacts = parseRows(workbook.contacts);
  const solutions = parseRows(workbook.solutions);
  const actions = parseRows(workbook.actions);
  const summary = buildClientSummary(client, contacts, solutions, actions);
  const clientContacts = rowsByClient(contacts, id);
  const clientSolutions = rowsByClient(solutions, id);
  const clientActions = rowsByClient(actions, id)
    .sort((left, right) => timestamp(getValue(right.record, "date_action")) - timestamp(getValue(left.record, "date_action")))
    .slice(0, 10);

  return {
    ...summary,
    notes: getValue(client.record, "notes"),
    contacts: clientContacts.map(({ record }) => ({
      id: getValue(record, "contact_id"),
      firstName: getValue(record, "prenom", "first_name"),
      lastName: getValue(record, "nom", "last_name"),
      email: normalizeEmail(getValue(record, "email")),
      role: getValue(record, "role_contact"),
      status: getValue(record, "statut_contact", "status") || "Actif",
      isPrimary: isAffirmative(getValue(record, "contact_principal"))
    })),
    solutions: clientSolutions.map(({ record }) => ({
      id: getValue(record, "solution_id", "id"),
      type: getValue(record, "type_solution", "type"),
      status: getValue(record, "statut_solution", "status", "statut") || "Actif",
      name: getValue(record, "nom_solution", "name"),
      domain: getValue(record, "domaine", "domain"),
      urlOrIndication: getValue(record, "url_ou_indication", "url"),
      activatedAt: getValue(record, "date_activation"),
      notes: getValue(record, "notes")
    })),
    actions: clientActions.map(({ record }) => ({
      id: getValue(record, "action_id", "id"),
      date: getValue(record, "date_action"),
      type: getValue(record, "type_action"),
      label: actionLabel(record),
      reference: getValue(record, "reference"),
      requesterEmail: normalizeEmail(getValue(record, "email_demandeur")),
      status: getValue(record, "statut", "status")
    }))
  };
}

export function buildAdminDashboard(workbook: ClientWorkbookValues, now = new Date()): AdminDashboard {
  const clients = adminClientRows(workbook);
  const contacts = parseRows(workbook.contacts);
  const solutions = adminSolutionRows(workbook);
  const actions = parseRows(workbook.actions);
  const connections = parseRows(workbook.connections);
  const clientSummaries = clients.map((client) => buildClientSummary(client, contacts, solutions, actions));
  const activeClientIds = new Set(
    clients.filter(({ record }) => clientIsActive(record)).map(({ record }) => clientId(record)).filter(Boolean)
  );
  const clientNameById = new Map(clientSummaries.map((client) => [client.id, client.companyName]));
  const monthKeys = lastTwelveMonthKeys(now);
  const monthSet = new Set(monthKeys);
  const interventionActions = actions.filter(({ record }) => isInterventionAction(record) && monthSet.has(actionMonthKey(record)));
  const connectionRows = connections.filter(({ record }) => monthSet.has(connectionMonthKey(record)));
  const requestsByMonth = new Map(monthKeys.map((month) => [month, 0]));
  const requestsByClient = new Map<string, number>();
  const connectionsByClient = new Map<string, number>();

  interventionActions.forEach(({ record }) => {
    const month = actionMonthKey(record);
    const id = getValue(record, "client_id");

    requestsByMonth.set(month, (requestsByMonth.get(month) ?? 0) + 1);
    requestsByClient.set(id, (requestsByClient.get(id) ?? 0) + 1);
  });

  connectionRows.forEach(({ record }) => {
    const id = getValue(record, "client_id");

    connectionsByClient.set(id, (connectionsByClient.get(id) ?? 0) + 1);
  });

  const topFromMap = (values: Map<string, number>) =>
    Array.from(values.entries())
      .filter(([id]) => Boolean(id))
      .sort((left, right) => right[1] - left[1])
      .slice(0, 5)
      .map(([id, count]) => ({
        clientId: id,
        companyName: clientNameById.get(id) || id,
        count
      }));

  const interventionTotal = interventionActions.length;
  const connectionTotal = connectionRows.length;

  return {
    generatedAt: now.toISOString(),
    totals: {
      activeClients: activeClientIds.size,
      totalClients: clients.filter(({ record }) => clientId(record)).length,
      activeSolutions: solutions.filter(({ record }) => activeClientIds.has(solutionClientId(record)) && solutionIsActive(record)).length,
      interventionRequests12Months: interventionTotal,
      interventionRequestsAveragePerMonth: roundMetric(interventionTotal / 12),
      interventionRequestsAveragePerActiveClient: roundMetric(interventionTotal / Math.max(1, activeClientIds.size)),
      connections12Months: connectionTotal,
      connectionsAveragePerMonth: roundMetric(connectionTotal / 12)
    },
    interventionRequestsByMonth: monthKeys.map((month) => ({
      month,
      label: monthLabel(month),
      count: requestsByMonth.get(month) ?? 0
    })),
    topInterventionClients: topFromMap(requestsByClient),
    topConnectionClients: topFromMap(connectionsByClient)
  };
}

export function clientUpdateDateRow(now = new Date()): string {
  return formatFrenchDate(now);
}

export function connectionExistsForDay(workbook: ClientWorkbookValues, id: string, day: string): boolean {
  return parseRows(workbook.connections).some(({ record }) =>
    getValue(record, "client_id") === id && getValue(record, "jour") === day
  );
}

export function buildConnectionRow(
  id: string,
  email: string,
  request: Request,
  now = new Date()
): string[] {
  const day = formatParisDateKey(now);
  const month = formatParisMonthKey(now);

  return [
    `CNX-${day.replace(/-/g, "")}-${id}`,
    id,
    normalizeEmail(email),
    now.toISOString(),
    day,
    month,
    "myfluxperf",
    request.headers.get("user-agent")?.slice(0, 240) ?? ""
  ];
}
