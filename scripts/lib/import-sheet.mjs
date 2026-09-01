import { csv, domainFromUrl } from "./client-import.mjs";
import { canonicalSolutionPair } from "./solution-catalog.mjs";

const CLIENT_COLUMNS = [
  "Référence client",
  "Organisation",
  "Email principal",
  "Prénom contact principal",
  "Nom contact principal",
  "Fonction contact principal",
  "Email contact secondaire",
  "Prénom contact secondaire",
  "Nom contact secondaire",
  "Fonction contact secondaire",
  "Notes internes"
];

const serviceColumns = Array.from({ length: 8 }, (_, index) => {
  const number = index + 1;
  return {
    family: `Service ${number} — Famille`,
    name: `Service ${number} — Type`,
    url: `Service ${number} — URL ou indication`,
    ga4: `Service ${number} — ID GA4`,
    ads: `Service ${number} — ID Google Ads`
  };
});

function text(value) {
  return String(value ?? "").trim();
}

function key(value) {
  return text(value).toLocaleLowerCase("fr-FR");
}

function normalizedHeader(value) {
  return text(value).replace(/\*+$/, "").trim();
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(value));
}

function isWebsite(name) {
  return ["site web", "site e shop"].includes(key(name).replace(/-/g, " "));
}

function normalizeGoogleAds(value) {
  return text(value).replace(/\D/g, "");
}

function valueFrom(row, index, name) {
  return text(row.values[index.get(name)]);
}

function addReason(reasons, reason) {
  if (!reasons.includes(reason)) reasons.push(reason);
}

function headersIndex(headers) {
  const index = new Map(headers.map((header, column) => [normalizedHeader(header), column]));
  const expected = [...CLIENT_COLUMNS, ...serviceColumns.flatMap((columns) => Object.values(columns))];
  const missing = expected.filter((column) => !index.has(column));

  return { index, missing };
}

function buildServices(row, index, reasons) {
  const services = [];

  serviceColumns.forEach((columns, serviceIndex) => {
    const values = {
      family: valueFrom(row, index, columns.family),
      name: valueFrom(row, index, columns.name),
      url: valueFrom(row, index, columns.url),
      ga4: valueFrom(row, index, columns.ga4),
      ads: valueFrom(row, index, columns.ads)
    };
    const filled = Object.values(values).filter(Boolean);

    if (filled.length === 0) return;

    if (!values.family || !values.name) {
      addReason(reasons, `Service ${serviceIndex + 1} : famille et type sont obligatoires.`);
      return;
    }

    const canonical = canonicalSolutionPair(values.family, values.name);
    if (!canonical) {
      addReason(reasons, `Service ${serviceIndex + 1} : association Famille/Type invalide.`);
      return;
    }

    if (values.ga4 && !/^\d+$/.test(values.ga4.replace(/^properties\//i, ""))) {
      addReason(reasons, `Service ${serviceIndex + 1} : ID GA4 numérique invalide.`);
    }

    const ads = normalizeGoogleAds(values.ads);
    if (values.ads && (!/^[\d\s-]+$/.test(values.ads) || ads.length !== 10)) {
      addReason(reasons, `Service ${serviceIndex + 1} : ID Google Ads invalide.`);
    }

    if (isWebsite(canonical.name) && values.url && !domainFromUrl(values.url)) {
      addReason(reasons, `Service ${serviceIndex + 1} : URL ou domaine du site invalide.`);
    }

    services.push({
      type_solution: canonical.typeLabel,
      statut_solution: "Actif",
      nom_solution: canonical.name,
      url_ou_indication: values.url,
      ga4_property_id: values.ga4.replace(/^properties\//i, ""),
      google_ads_customer_id: ads,
      notes: ""
    });
  });

  return services;
}

export function buildSheetImportPackage({ headers, rows }) {
  const { index, missing } = headersIndex(headers);
  if (missing.length > 0) {
    return {
      clients: [],
      contacts: [],
      solutions: [],
      summary: [],
      errors: [{ source_row: "", client_key: "", reason: `Colonnes manquantes : ${missing.join(", ")}` }]
    };
  }

  const clients = [];
  const contacts = [];
  const solutions = [];
  const summary = [];
  const errors = [];
  const clientKeys = new Set();

  rows.forEach((row) => {
    const values = row.values ?? [];
    const clientKey = valueFrom({ values }, index, "Référence client");
    const organisation = valueFrom({ values }, index, "Organisation");
    const email = key(valueFrom({ values }, index, "Email principal"));
    const firstName = valueFrom({ values }, index, "Prénom contact principal");
    const lastName = valueFrom({ values }, index, "Nom contact principal");
    const role = valueFrom({ values }, index, "Fonction contact principal") || "Contact";
    const secondaryEmail = key(valueFrom({ values }, index, "Email contact secondaire"));
    const secondaryFirstName = valueFrom({ values }, index, "Prénom contact secondaire");
    const secondaryLastName = valueFrom({ values }, index, "Nom contact secondaire");
    const secondaryRole = valueFrom({ values }, index, "Fonction contact secondaire") || "Contact";
    const notes = valueFrom({ values }, index, "Notes internes");
    const reasons = [];

    if (!values.some((value) => text(value))) addReason(reasons, "Ligne vide.");
    if (!clientKey) addReason(reasons, "Référence client manquante.");
    if (clientKey && clientKeys.has(clientKey)) addReason(reasons, "Référence client dupliquée.");
    if (clientKey) clientKeys.add(clientKey);
    if (!organisation) addReason(reasons, "Organisation manquante.");
    if (!isEmail(email)) addReason(reasons, "Email principal invalide.");
    if (!firstName || !lastName) addReason(reasons, "Nom complet du contact principal requis.");

    const secondaryValues = [secondaryEmail, secondaryFirstName, secondaryLastName, valueFrom({ values }, index, "Fonction contact secondaire")];
    if (secondaryValues.some(Boolean)) {
      if (!isEmail(secondaryEmail)) addReason(reasons, "Email du contact secondaire invalide.");
      if (!secondaryFirstName || !secondaryLastName) addReason(reasons, "Nom complet du contact secondaire requis.");
      if (secondaryEmail && secondaryEmail === email) addReason(reasons, "Le contact secondaire doit utiliser un email distinct.");
    }

    const clientServices = buildServices({ values }, index, reasons);
    if (clientServices.length === 0) addReason(reasons, "Au moins une solution est requise.");

    summary.push({
      source_row: String(row.rowNumber),
      client_key: clientKey,
      statut: reasons.length > 0 ? "erreur" : "prêt",
      raison: reasons.join(" | "),
      solutions: String(clientServices.length)
    });

    if (reasons.length > 0) {
      errors.push({ source_row: String(row.rowNumber), client_key: clientKey, reason: reasons.join(" | ") });
      return;
    }

    clients.push({ client_key: clientKey, organisation, email_principal: email, notes });
    contacts.push({ client_key: clientKey, prenom: firstName, nom: lastName, email, role_contact: role, contact_principal: "Oui" });
    if (secondaryEmail) {
      contacts.push({ client_key: clientKey, prenom: secondaryFirstName, nom: secondaryLastName, email: secondaryEmail, role_contact: secondaryRole, contact_principal: "Non" });
    }
    clientServices.forEach((service) => solutions.push({ client_key: clientKey, ...service }));
  });

  return { clients, contacts, solutions, summary, errors };
}

export function importPackageCsv(packageData) {
  return {
    clients: csv(packageData.clients, ["client_key", "organisation", "email_principal", "notes"]),
    contacts: csv(packageData.contacts, ["client_key", "prenom", "nom", "email", "role_contact", "contact_principal"]),
    solutions: csv(packageData.solutions, ["client_key", "type_solution", "statut_solution", "nom_solution", "url_ou_indication", "ga4_property_id", "google_ads_customer_id", "notes"]),
    summary: csv(packageData.summary, ["source_row", "client_key", "statut", "raison", "solutions"]),
    errors: csv(packageData.errors, ["source_row", "client_key", "reason"])
  };
}
