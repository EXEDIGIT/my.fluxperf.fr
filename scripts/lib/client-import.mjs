import { canonicalSolutionPair } from "./solution-catalog.mjs";

export const IMPORT_TAG_PREFIX = "Import silencieux:";

function text(value) {
  return String(value ?? "").trim();
}

function key(value) {
  return text(value).toLocaleLowerCase("fr-FR");
}

function token(value) {
  return key(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function parseCsv(source) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];

    if (quoted) {
      if (character === '"' && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        cell += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ";") {
      row.push(cell.trim());
      cell = "";
    } else if (character === "\n") {
      row.push(cell.replace(/\r$/, "").trim());
      if (row.some(Boolean)) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += character;
    }
  }

  row.push(cell.replace(/\r$/, "").trim());
  if (row.some(Boolean)) rows.push(row);
  if (quoted) throw new Error("CSV invalide : guillemet non fermé.");
  if (rows.length === 0) {
    const empty = [];
    Object.defineProperty(empty, "headers", { value: [] });
    return empty;
  }

  const headers = rows[0].map((value) => key(value.replace(/^\uFEFF/, "")));
  const duplicate = headers.find((header, index) => header && headers.indexOf(header) !== index);
  if (duplicate) throw new Error(`CSV invalide : colonne dupliquée ${duplicate}.`);

  const records = rows.slice(1).map((values, index) => ({
    rowNumber: index + 2,
    values: headers.reduce((record, header, column) => {
      if (header) record[header] = text(values[column]);
      return record;
    }, {})
  }));
  Object.defineProperty(records, "headers", { value: headers });
  return records;
}

export function csv(records, headers) {
  const escape = (value) => {
    const content = String(value ?? "");
    return /[";\n\r]/.test(content) ? `"${content.replace(/"/g, '""')}"` : content;
  };
  return [headers.join(";"), ...records.map((record) => headers.map((header) => escape(record[header])).join(";"))].join("\n") + "\n";
}

export function domainFromUrl(value) {
  const input = text(value);
  if (!input || /\s/.test(input)) return "";
  const candidate = /^https?:\/\//i.test(input) ? input : /^([a-z0-9-]+\.)+[a-z0-9-]+(?::\d+)?(?:[/?#].*)?$/i.test(input) ? `https://${input}` : "";
  if (!candidate) return "";
  try {
    return new URL(candidate).hostname.replace(/^www\./i, "").toLowerCase();
  } catch {
    return "";
  }
}

export function isActive(value) {
  return ["actif", "active"].includes(token(value));
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value));
}

function isWebsite(name) {
  return ["site web", "site e shop"].includes(token(name));
}

function isAds(name) {
  return token(name) === "publicite google ads";
}

function recordsByKey(records, field) {
  return records.reduce((result, row) => {
    const id = text(row.values[field]);
    if (!result.has(id)) result.set(id, []);
    result.get(id).push(row);
    return result;
  }, new Map());
}

export function sourceTag(clientKey) {
  return `${IMPORT_TAG_PREFIX} ${clientKey}`;
}

function existingRecords(values) {
  if (!values?.length) return [];
  const headers = values[0].map(key);
  return values.slice(1).map((row) => headers.reduce((record, header, index) => {
    if (header) record[header] = text(row[index]);
    return record;
  }, {})).filter((record) => Object.values(record).some(Boolean));
}

export function buildImportPlan({ clients, contacts, solutions, parameters = [], workbook = {} }) {
  const missingHeaders = (rows, required, label) => {
    const headers = new Set(rows.headers ?? (rows[0] ? Object.keys(rows[0].values) : []));
    const missing = required.filter((header) => !headers.has(header));
    return missing.length ? [`${label} : colonnes manquantes ${missing.join(", ")}.`] : [];
  };
  const packageErrors = [
    ...missingHeaders(clients, ["client_key", "organisation", "email_principal"], "clients.csv"),
    ...missingHeaders(contacts, ["client_key", "prenom", "nom", "email", "contact_principal"], "contacts.csv"),
    ...missingHeaders(solutions, ["client_key", "type_solution", "nom_solution"], "solutions.csv")
  ];
  if (packageErrors.length) return { packageErrors, clients: [] };

  const contactsByClient = recordsByKey(contacts, "client_key");
  const solutionsByClient = recordsByKey(solutions, "client_key");
  void parameters;
  const existingClients = existingRecords(workbook.clients);
  const existingSolutions = existingRecords(workbook.solutions);
  const existingContacts = existingRecords(workbook.contacts);
  const existingActions = existingRecords(workbook.actions);
  const existingEmailOwner = new Map();
  const existingOrganisation = new Map();
  const importedByKey = new Map();
  const existingDomains = new Map();

  existingClients.forEach((client) => {
    const clientId = client.client_id || client.id || "";
    const email = key(client.email_principal || client.primary_email);
    if (email) existingEmailOwner.set(email, clientId || client.organisation || "Client existant");
    const organisation = token(client.organisation || client.company_name || client.nom_compte);
    if (organisation) existingOrganisation.set(organisation, clientId || client.organisation || "Client existant");
    const tag = Object.values(client).find((value) => value.includes(IMPORT_TAG_PREFIX));
    const importedKey = tag?.split(IMPORT_TAG_PREFIX)[1]?.trim();
    if (importedKey) importedByKey.set(importedKey, clientId);
  });
  existingContacts.forEach((contact) => {
    const email = key(contact.email);
    if (email) existingEmailOwner.set(email, contact.client_id || "Contact existant");
  });
  existingSolutions.forEach((solution) => {
    if (!isActive(solution.statut_solution || solution.status)) return;
    const domain = key(solution.domaine || solution.domain || domainFromUrl(solution.url_ou_indication || solution.url));
    if (domain) existingDomains.set(domain, solution.client_id || "Solution existante");
  });

  const inputEmailOwner = new Map();
  const inputKeys = new Set();
  const result = clients.map((clientRow) => {
    const client = clientRow.values;
    const clientKey = text(client.client_key);
    const clientContacts = contactsByClient.get(clientKey) ?? [];
    const clientSolutions = solutionsByClient.get(clientKey) ?? [];
    const completeness = [];
    const conflicts = [];
    const warnings = [];
    const clientEmail = key(client.email_principal);

    if (!clientKey) completeness.push("client_key manquant");
    if (!text(client.organisation)) completeness.push("organisation manquante");
    if (!isEmail(clientEmail)) completeness.push("email_principal invalide");
    if (inputKeys.has(clientKey)) conflicts.push("client_key dupliqué dans le fichier");
    inputKeys.add(clientKey);
    const clientEmails = new Set([clientEmail, ...clientContacts.map(({ values }) => key(values.email))].filter(Boolean));
    clientEmails.forEach((email) => {
      if (inputEmailOwner.has(email) && inputEmailOwner.get(email) !== clientKey) conflicts.push(`email déjà présent dans le fichier (${inputEmailOwner.get(email)})`);
      inputEmailOwner.set(email, clientKey);
      if (existingEmailOwner.has(email) && !importedByKey.has(clientKey)) conflicts.push(`email déjà rattaché à ${existingEmailOwner.get(email)}`);
    });
    const org = token(client.organisation);
    if (org && existingOrganisation.has(org) && !importedByKey.has(clientKey)) conflicts.push(`organisation déjà présente (${existingOrganisation.get(org)})`);

    const primaryContacts = clientContacts.filter(({ values }) => ["oui", "yes", "true", "1"].includes(token(values.contact_principal)));
    if (clientContacts.length === 0) completeness.push("aucun contact");
    if (primaryContacts.length !== 1) completeness.push("un unique contact_principal est requis");
    clientContacts.forEach(({ values, rowNumber }) => {
      if (!text(values.prenom) && !text(values.nom)) completeness.push(`contact ligne ${rowNumber} sans nom`);
      if (!isEmail(values.email)) completeness.push(`contact ligne ${rowNumber} avec email invalide`);
    });

    const activeSolutions = clientSolutions.filter(({ values }) => isActive(values.statut_solution || "Actif"));
    if (clientSolutions.length === 0) completeness.push("aucune solution");
    if (activeSolutions.length === 0) completeness.push("aucune solution active");
    clientSolutions.forEach(({ values, rowNumber }) => {
      const canonicalSolution = canonicalSolutionPair(values.type_solution, values.nom_solution);
      if (!canonicalSolution) {
        conflicts.push(`solution ligne ${rowNumber} : association famille et type de solution invalide`);
      }
      const ga4 = text(values.ga4_property_id).replace(/^properties\//i, "");
      const ads = text(values.google_ads_customer_id).replace(/\D/g, "");
      if (isWebsite(values.nom_solution) && ga4 && !/^\d+$/.test(ga4)) completeness.push(`solution ligne ${rowNumber} : ID GA4 invalide`);
      if (isAds(values.nom_solution) && ads && !/^\d{10}$/.test(ads)) completeness.push(`solution ligne ${rowNumber} : ID Google Ads invalide`);
      const domain = domainFromUrl(values.url_ou_indication);
      if (isActive(values.statut_solution || "Actif") && domain && existingDomains.has(domain) && !importedByKey.has(clientKey)) {
        conflicts.push(`domaine déjà rattaché à ${existingDomains.get(domain)} (${domain})`);
      }
      if (isWebsite(values.nom_solution) && text(values.url_ou_indication) && !domain) warnings.push(`solution ligne ${rowNumber} : vignette indisponible, URL ou domaine non exploitable`);
    });

    const importedClientId = importedByKey.get(clientKey) ?? "";
    const hasAudit = existingActions.some((action) => text(action.reference) === `IMP-${clientKey}`);
    if (importedClientId && completeness.length > 0) {
      conflicts.push("dossier déjà importé en brouillon : finalisez-le depuis la console avant toute activation");
    }
    const status = conflicts.length > 0 ? "ignored" : importedClientId ? "resumed" : completeness.length > 0 ? "draft" : "ready";
    return { clientKey, client, clientRow, contacts: clientContacts, solutions: clientSolutions, completeness, conflicts, warnings, status, importedClientId, hasAudit };
  });

  const knownKeys = new Set(result.map((item) => item.clientKey));
  contacts.forEach(({ values, rowNumber }) => {
    if (text(values.client_key) && !knownKeys.has(text(values.client_key))) packageErrors.push(`contacts.csv ligne ${rowNumber} : client_key inconnu.`);
  });
  solutions.forEach(({ values, rowNumber }) => {
    if (text(values.client_key) && !knownKeys.has(text(values.client_key))) packageErrors.push(`solutions.csv ligne ${rowNumber} : client_key inconnu.`);
  });

  return { packageErrors, clients: result };
}

export function rowsForClient(item, ids, now = new Date()) {
  const date = new Intl.DateTimeFormat("fr-FR", { timeZone: "Europe/Paris", day: "2-digit", month: "2-digit", year: "numeric" }).format(now);
  const ready = item.status === "ready" || item.status === "resumed";
  const primary = item.contacts.find(({ values }) => ["oui", "yes", "true", "1"].includes(token(values.contact_principal)))?.values;
  const notes = [text(item.client.notes), sourceTag(item.clientKey)].filter(Boolean).join(" | ");
  const primaryIndex = item.contacts.findIndex(({ values }) => ["oui", "yes", "true", "1"].includes(token(values.contact_principal)));
  const clientRow = [ids.clientId, `${text(primary?.prenom)} ${text(primary?.nom)}`.trim() || text(item.client.organisation), text(item.client.organisation), ready ? "Actif" : "Brouillon", ready ? "Oui" : "Non", ids.contactIds[primaryIndex] ?? "", key(item.client.email_principal), String(ready ? item.solutions.filter(({ values }) => isActive(values.statut_solution || "Actif")).length : 0), date, date, notes];
  const contactRows = item.contacts.map(({ values }, index) => [ids.contactIds[index], ids.clientId, text(values.prenom), text(values.nom), key(values.email), text(values.role_contact) || "Contact", ["oui", "yes", "true", "1"].includes(token(values.contact_principal)) ? "Oui" : "Non", ready ? "Actif" : "Brouillon", date, sourceTag(item.clientKey)]);
  const solutionRows = item.solutions.map(({ values }, index) => {
    const active = ready && isActive(values.statut_solution || "Actif");
    const url = text(values.url_ou_indication);
    const canonicalSolution = canonicalSolutionPair(values.type_solution, values.nom_solution);
    const type = canonicalSolution?.typeLabel ?? text(values.type_solution);
    const name = canonicalSolution?.name ?? text(values.nom_solution);
    return [ids.solutionIds[index], ids.clientId, type, active ? "Actif" : "En cours d'activation", name, domainFromUrl(url), url, date, [text(values.notes), sourceTag(item.clientKey)].filter(Boolean).join(" | "), text(values.ga4_property_id).replace(/^properties\//i, ""), text(values.google_ads_customer_id).replace(/\D/g, "")];
  });
  const actionRow = [ids.actionId, ids.clientId, now.toISOString(), "client_import_silent", "Import initial silencieux", `IMP-${item.clientKey}`, "", "client_import", ready ? "réalisée" : "brouillon", ready ? "Client créé sans notification client." : `Dossier créé en brouillon : ${item.completeness.join(", ")}`];
  return { clientRow, contactRows, solutionRows, actionRow };
}

export function authenticationEmails(item) {
  return Array.from(new Set([
    key(item.client.email_principal),
    ...item.contacts.map(({ values }) => key(values.email))
  ].filter(isEmail)));
}
