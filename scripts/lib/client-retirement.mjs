export const PILOT_RETIREMENT_TARGET = Object.freeze({
  clientId: "CLI-17072026-C4F5",
  organisation: "GabyPower",
  email: "dacunha.t@gmail.com"
});

const managedSheets = ["Clients", "Contacts", "Solutions", "Actions", "Connexions", "Archive_Sites", "Documents"];

function text(value) {
  return String(value ?? "").trim();
}

function token(value) {
  return text(value)
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function records(values) {
  if (!values?.length) return [];
  const headers = values[0].map((header) => text(header).toLocaleLowerCase("fr-FR"));
  const clientColumn = headers.indexOf("client_id");
  if (clientColumn === -1) return [];

  return values.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    clientId: text(row[clientColumn]),
    values: headers.reduce((record, header, column) => ({ ...record, [header]: text(row[column]) }), {})
  })).filter((record) => record.clientId);
}

function expectedClient(clientRows, target) {
  if (clientRows.length === 0) return [];
  const client = clientRows[0]?.values ?? {};
  const errors = [];
  if (token(client.organisation) !== token(target.organisation)) errors.push("Organisation inattendue pour le client cible.");
  if (text(client.email_principal).toLocaleLowerCase("fr-FR") !== target.email) errors.push("Email principal inattendu pour le client cible.");
  return errors;
}

export function buildClientRetirementPlan({ workbook, target = PILOT_RETIREMENT_TARGET }) {
  const rowsBySheet = Object.fromEntries(managedSheets.map((sheet) => [sheet, records(workbook[sheet])])) ;
  const clientRows = rowsBySheet.Clients.filter((record) => record.clientId === target.clientId);
  const errors = [];

  if (clientRows.length > 1) errors.push("Plusieurs lignes Clients correspondent à la cible.");
  errors.push(...expectedClient(clientRows, target));

  const deletions = Object.fromEntries(managedSheets.map((sheet) => [
    sheet,
    rowsBySheet[sheet].filter((record) => record.clientId === target.clientId).map((record) => record.rowNumber)
  ]));
  const totalRows = Object.values(deletions).reduce((sum, rowNumbers) => sum + rowNumbers.length, 0);
  const status = errors.length > 0 ? "blocked" : totalRows > 0 ? "ready" : "already_retired";

  return {
    target,
    status,
    errors,
    deletions,
    counts: Object.fromEntries(Object.entries(deletions).map(([sheet, rowNumbers]) => [sheet, rowNumbers.length]))
  };
}

export function deletionRequests(plan, sheetMetadata) {
  const sheetIds = new Map(sheetMetadata.map((sheet) => [sheet.title, sheet.sheetId]));

  return Object.entries(plan.deletions).flatMap(([title, rowNumbers]) => {
    const sheetId = sheetIds.get(title);
    if (sheetId === undefined) return [];
    return [...rowNumbers].sort((left, right) => right - left).map((rowNumber) => ({
      deleteDimension: {
        range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber }
      }
    }));
  });
}
