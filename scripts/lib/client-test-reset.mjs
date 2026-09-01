export const PRESERVED_ADMIN_EMAIL = "tdacunha@exedigit.fr";

export const TEST_CLIENT_RESET_TARGETS = Object.freeze([
  Object.freeze({ clientId: "CLI-0001", organisation: "HBINT", email: "tdacunha@exedigit.fr" }),
  Object.freeze({ clientId: "CLI-20260717-21E8", organisation: "BAEGNE COMPANY", email: "jbaegne@exedigit.fr" }),
  Object.freeze({ clientId: "CLI-17072026-C4F5", organisation: "GabyPower", email: "dacunha.t@gmail.com" }),
  Object.freeze({ clientId: "CLI-17072026-14CF", organisation: "FFIA", email: "dacou95@gmail.com" }),
  Object.freeze({ clientId: "CLI-18072026-2993", organisation: "LAUD SARL", email: "laudrea3@gmail.com" })
]);

export const RESET_SHEETS = Object.freeze([
  "Clients",
  "Contacts",
  "Solutions",
  "Actions",
  "Connexions",
  "Archive_Sites",
  "Documents"
]);

export const EXPECTED_FRESH_COUNTS = Object.freeze({
  Clients: 5,
  Contacts: 5,
  Solutions: 18,
  Actions: 14,
  Connexions: 21,
  Archive_Sites: 2,
  Documents: 0
});

const APPROVED_ORPHAN_ARCHIVE = Object.freeze({
  siteId: "SITE-0002",
  malformedClientId: '"Solutions',
  domain: "trial.hbint.com"
});

function text(value) {
  return String(value ?? "").trim();
}

function normalized(value) {
  return text(value).toLocaleLowerCase("fr-FR");
}

function nameToken(value) {
  return normalized(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function records(values) {
  if (!Array.isArray(values) || values.length === 0) return [];

  const headers = values[0].map((header) => normalized(header));
  const clientColumn = headers.indexOf("client_id");
  if (clientColumn === -1) return [];

  return values
    .slice(1)
    .map((row, index) => ({
      rowNumber: index + 2,
      clientId: text(row[clientColumn]),
      values: headers.reduce((record, header, column) => {
        if (header) record[header] = text(row[column]);
        return record;
      }, {})
    }))
    .filter((record) => record.clientId);
}

function includesAdmin(adminEmails, email) {
  return String(adminEmails ?? "")
    .split(/[,;\s]+/)
    .map(normalized)
    .includes(normalized(email));
}

function targetIdentityErrors(record, target) {
  const errors = [];
  if (nameToken(record.values.organisation) !== nameToken(target.organisation)) {
    errors.push(`Organisation inattendue pour ${target.clientId}.`);
  }
  if (normalized(record.values.email_principal) !== normalized(target.email)) {
    errors.push(`Email principal inattendu pour ${target.clientId}.`);
  }
  return errors;
}

function isApprovedOrphanArchive(sheet, record) {
  return (
    sheet === "Archive_Sites" &&
    text(record.values.site_id) === APPROVED_ORPHAN_ARCHIVE.siteId &&
    text(record.clientId) === APPROVED_ORPHAN_ARCHIVE.malformedClientId &&
    normalized(record.values.domaine) === APPROVED_ORPHAN_ARCHIVE.domain
  );
}

export function buildTestClientsResetPlan({ workbook, adminEmails }) {
  const targetsByClientId = new Map(TEST_CLIENT_RESET_TARGETS.map((target) => [target.clientId, target]));
  const rowsBySheet = Object.fromEntries(RESET_SHEETS.map((sheet) => [sheet, records(workbook[sheet])]));
  const errors = [];

  if (!includesAdmin(adminEmails, PRESERVED_ADMIN_EMAIL)) {
    errors.push("ADMIN_EMAILS ne conserve pas explicitement l'administrateur attendu.");
  }

  for (const sheet of RESET_SHEETS) {
    for (const record of rowsBySheet[sheet]) {
      if (!targetsByClientId.has(record.clientId) && !isApprovedOrphanArchive(sheet, record)) {
        errors.push(`${sheet} ligne ${record.rowNumber} : client hors périmètre (${record.clientId}).`);
      }
    }
  }

  for (const target of TEST_CLIENT_RESET_TARGETS) {
    const matchingClients = rowsBySheet.Clients.filter((record) => record.clientId === target.clientId);
    if (matchingClients.length > 1) {
      errors.push(`Clients : plusieurs lignes correspondent à ${target.clientId}.`);
    }
    if (matchingClients.length === 1) {
      errors.push(...targetIdentityErrors(matchingClients[0], target));
    }
  }

  const deletions = Object.fromEntries(
    RESET_SHEETS.map((sheet) => [
      sheet,
      rowsBySheet[sheet]
        .filter((record) => targetsByClientId.has(record.clientId) || isApprovedOrphanArchive(sheet, record))
        .map((record) => record.rowNumber)
    ])
  );
  const counts = Object.fromEntries(Object.entries(deletions).map(([sheet, rowNumbers]) => [sheet, rowNumbers.length]));
  const clientRowsPresent = counts.Clients;
  const isInitialReset = clientRowsPresent === TEST_CLIENT_RESET_TARGETS.length;

  for (const [sheet, expected] of Object.entries(EXPECTED_FRESH_COUNTS)) {
    const actual = counts[sheet] ?? 0;
    if (isInitialReset && actual !== expected) {
      errors.push(`${sheet} : ${expected} ligne(s) attendue(s) avant le premier reset, ${actual} trouvée(s).`);
    }
    if (!isInitialReset && actual > expected) {
      errors.push(`${sheet} : volume inattendu pendant une reprise (${actual} au lieu de ${expected} maximum).`);
    }
  }

  const solutionIds = [];
  const seenSolutionIds = new Set();
  for (const record of rowsBySheet.Solutions.filter((record) => targetsByClientId.has(record.clientId))) {
    const solutionId = text(record.values.solution_id);
    if (!solutionId) {
      errors.push(`Solutions ligne ${record.rowNumber} : solution_id manquant, vignette non purgeable.`);
      continue;
    }
    if (seenSolutionIds.has(solutionId)) {
      errors.push(`Solutions : solution_id dupliqué (${solutionId}).`);
      continue;
    }
    seenSolutionIds.add(solutionId);
    solutionIds.push(solutionId);
  }

  const totalRows = Object.values(counts).reduce((total, count) => total + count, 0);
  const status = errors.length > 0 ? "blocked" : totalRows > 0 ? "ready" : "already_reset";

  return {
    status,
    errors,
    counts,
    deletions,
    solutionIds,
    isInitialReset,
    targets: TEST_CLIENT_RESET_TARGETS
  };
}

export function deletionRequests(plan, sheetMetadata) {
  const sheetIds = new Map(sheetMetadata.map((sheet) => [sheet.title, sheet.sheetId]));

  return Object.entries(plan.deletions).flatMap(([title, rowNumbers]) => {
    const sheetId = sheetIds.get(title);
    if (sheetId === undefined) return [];

    return [...rowNumbers]
      .sort((left, right) => right - left)
      .map((rowNumber) => ({
        deleteDimension: {
          range: { sheetId, dimension: "ROWS", startIndex: rowNumber - 1, endIndex: rowNumber }
        }
      }));
  });
}
