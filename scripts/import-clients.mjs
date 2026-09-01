import { createHash, webcrypto } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { authenticationEmails, buildImportPlan, csv, domainFromUrl, isActive, parseCsv, rowsForClient } from "./lib/client-import.mjs";
import { createSilentSupabaseUser } from "./lib/silent-supabase.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const batchSize = 25;

function usage(message = "") {
  if (message) console.error(`Erreur : ${message}\n`);
  console.error("Usage : pnpm import:clients -- --input <dossier> --mode dry-run|apply [--env-file <fichier>] [--output <dossier>] [--skip-statistics] [--skip-thumbnails]");
  process.exitCode = 1;
}

function argsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (!argument.startsWith("--")) continue;
    const name = argument.slice(2);
    if (["help", "skip-statistics", "skip-thumbnails"].includes(name)) {
      result[name] = true;
    } else {
      result[name] = argv[index + 1];
      index += 1;
    }
  }
  return result;
}

function parseEnv(content) {
  return content.split(/\r?\n/).reduce((result, line) => {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) return result;
    const equals = trimmed.indexOf("=");
    if (equals <= 0) return result;
    const name = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[name] = value;
    return result;
  }, {});
}

async function loadEnv(envFile) {
  if (!envFile) return { ...process.env };
  return { ...process.env, ...parseEnv(await readFile(envFile, "utf8")) };
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function googleToken(env, scope) {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) throw new Error("Configuration Google Service Account manquante.");
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const pem = privateKey.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const binary = Buffer.from(pem, "base64");
  const key = await crypto.subtle.importKey("pkcs8", binary, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  const response = await fetch("https://oauth2.googleapis.com/token", { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${payload}.${Buffer.from(signature).toString("base64url")}` }) });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Jeton Google impossible à obtenir.");
  return data.access_token;
}

function requiredEnv(env, names) {
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Variables d'environnement manquantes : ${missing.join(", ")}.`);
}

async function googleRead(env, token, range) {
  const sheet = encodeURIComponent(env.GOOGLE_SHEET_ID);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Lecture Google Sheets impossible (${range}).`);
  return data.values ?? [];
}

async function googleAppend(env, token, range, values) {
  if (values.length === 0) return;
  const sheet = encodeURIComponent(env.GOOGLE_SHEET_ID);
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${sheet}/values/${encodeURIComponent(range)}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ values }) });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Écriture Google Sheets impossible (${range}).`);
}

async function readWorkbook(env) {
  requiredEnv(env, ["GOOGLE_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"]);
  const token = await googleToken(env, SHEETS_SCOPE);
  const [clients, contacts, solutions, actions, parameters] = await Promise.all([
    googleRead(env, token, env.GOOGLE_SHEET_RANGE || "Clients!A1:Z1000"),
    googleRead(env, token, env.GOOGLE_CONTACTS_RANGE || "Contacts!A1:Z1000").catch(() => []),
    googleRead(env, token, env.GOOGLE_SOLUTIONS_RANGE || "Solutions!A1:Z1000").catch(() => []),
    googleRead(env, token, env.GOOGLE_ACTIONS_RANGE || "Actions!A1:J1000").catch(() => []),
    googleRead(env, token, env.GOOGLE_PARAMETERS_RANGE || "Parametres!A1:B1000").catch(() => [])
  ]);
  return { token, workbook: { clients, contacts, solutions, actions }, parameters };
}

function idsFor(clientKey, counts) {
  const digest = (value) => createHash("sha256").update(value).digest("hex").slice(0, 10).toUpperCase();
  return {
    clientId: `CLI-IMP-${digest(clientKey)}`,
    contactIds: Array.from({ length: counts.contacts }, (_, index) => `CON-IMP-${digest(`${clientKey}:${index}`)}`),
    solutionIds: Array.from({ length: counts.solutions }, (_, index) => `SOL-IMP-${digest(`${clientKey}:${index}`)}`),
    actionId: `ACT-IMP-${digest(clientKey)}`
  };
}

function outputRecord(item, extra = {}) {
  return {
    client_key: item.clientKey,
    organisation: item.client.organisation,
    email_principal: item.client.email_principal,
    statut: item.status,
    raisons: [...item.conflicts, ...item.completeness].join(" | "),
    avertissements: item.warnings.join(" | "),
    ...extra
  };
}

async function createSupabaseUser(env, email) {
  const result = await createSilentSupabaseUser(env, email);
  return result.status;
}

async function verifyStatistics(env, item) {
  const result = [];
  for (const { values } of item.solutions) {
    const ga4 = String(values.ga4_property_id ?? "").replace(/^properties\//i, "").trim();
    const ads = String(values.google_ads_customer_id ?? "").replace(/\D/g, "");
    if (ga4) {
      try {
        const token = await googleToken(env, ANALYTICS_SCOPE);
        const response = await fetch(`https://analyticsdata.googleapis.com/v1beta/properties/${encodeURIComponent(ga4)}:runReport`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" }, body: JSON.stringify({ dateRanges: [{ startDate: "7daysAgo", endDate: "today" }], metrics: [{ name: "sessions" }], limit: 1 }) });
        result.push({ provider: "ga4", identifier: ga4, status: response.ok ? "available" : "pending_setup", detail: response.ok ? "" : `HTTP ${response.status}` });
      } catch (error) { result.push({ provider: "ga4", identifier: ga4, status: "not_checked", detail: error instanceof Error ? error.message : "Vérification indisponible" }); }
    }
    if (ads) {
      if (!env.GOOGLE_ADS_DEVELOPER_TOKEN || !env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) {
        result.push({ provider: "google_ads", identifier: ads, status: "not_checked", detail: "Configuration Google Ads absente" });
      } else {
        try {
          const token = await googleToken(env, ADS_SCOPE);
          const response = await fetch(`https://googleads.googleapis.com/v20/customers/${encodeURIComponent(ads)}/googleAds:searchStream`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "developer-token": env.GOOGLE_ADS_DEVELOPER_TOKEN, "login-customer-id": env.GOOGLE_ADS_LOGIN_CUSTOMER_ID.replace(/\D/g, ""), "Content-Type": "application/json" }, body: JSON.stringify({ query: "SELECT customer.id FROM customer LIMIT 1" }) });
          result.push({ provider: "google_ads", identifier: ads, status: response.ok ? "available" : "pending_setup", detail: response.ok ? "" : `HTTP ${response.status}` });
        } catch (error) { result.push({ provider: "google_ads", identifier: ads, status: "not_checked", detail: error instanceof Error ? error.message : "Vérification indisponible" }); }
      }
    }
  }
  return result;
}

async function refreshThumbnails(env, item, ids) {
  if (!env.THUMBNAIL_WORKER_URL || !env.THUMBNAIL_INTERNAL_SECRET) return [];
  const targets = item.solutions.flatMap(({ values }, index) => domainFromUrl(values.url_ou_indication) && ["site web", "site e shop"].includes(values.nom_solution.trim().toLowerCase().replace(/-/g, " ")) ? [{ solutionId: ids.solutionIds[index], domain: domainFromUrl(values.url_ou_indication) }] : []);
  const results = [];
  for (const target of targets) {
    try {
      const response = await fetch(`${env.THUMBNAIL_WORKER_URL.replace(/\/+$/, "")}/thumbnail/${encodeURIComponent(target.solutionId)}/refresh`, { method: "POST", headers: { Authorization: `Bearer ${env.THUMBNAIL_INTERNAL_SECRET}`, "X-Fluxperf-Client-Id": ids.clientId } });
      results.push({ solution_id: target.solutionId, status: response.ok ? "refreshing" : "failed", detail: response.ok ? "" : `HTTP ${response.status}` });
    } catch (error) { results.push({ solution_id: target.solutionId, status: "failed", detail: error instanceof Error ? error.message : "Rafraîchissement indisponible" }); }
  }
  return results;
}

async function writeReports(output, reports) {
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(path.join(output, "synthese.csv"), csv(reports.summary, ["client_key", "organisation", "email_principal", "statut", "raisons", "avertissements", "client_id", "supabase", "statistiques", "vignettes"])),
    writeFile(path.join(output, "exceptions.csv"), csv(reports.exceptions, ["client_key", "organisation", "email_principal", "statut", "raisons", "avertissements"])),
    writeFile(path.join(output, "mapping.csv"), csv(reports.mapping, ["client_key", "client_id", "contact_ids", "solution_ids", "statut"]))
  ]);
}

function identifierSet(values, names) {
  if (!values?.length) return new Set();
  const headers = values[0].map((header) => String(header).trim().toLowerCase());
  const column = headers.findIndex((header) => names.includes(header));
  return new Set(values.slice(1).map((row) => String(row[column] ?? "").trim()).filter(Boolean));
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  if (args.help) {
    console.log("Usage : pnpm import:clients -- --input <dossier> --mode dry-run|apply [--env-file <fichier>] [--output <dossier>] [--skip-statistics] [--skip-thumbnails]");
    return;
  }
  if (!args.input || !args.mode || !["dry-run", "apply"].includes(args.mode)) return usage("--input et --mode sont obligatoires.");
  const input = path.resolve(args.input);
  const output = path.resolve(args.output || path.join(input, `rapport-import-${new Date().toISOString().slice(0, 10)}`));
  const env = await loadEnv(args["env-file"]);
  const [clientsText, contactsText, solutionsText] = await Promise.all(["clients.csv", "contacts.csv", "solutions.csv"].map((file) => readFile(path.join(input, file), "utf8")));
  const [clients, contacts, solutions] = [clientsText, contactsText, solutionsText].map(parseCsv);
  const { token, workbook, parameters } = await readWorkbook(env);
  const plan = buildImportPlan({ clients, contacts, solutions, parameters: parseCsv(parameters.map((row) => row.join(";")).join("\n")), workbook });
  const reports = { summary: [], exceptions: plan.packageErrors.map((reason) => ({ client_key: "", organisation: "", email_principal: "", statut: "package_error", raisons: reason, avertissements: "" })), mapping: [] };
  if (plan.packageErrors.length) {
    reports.summary.push(...reports.exceptions);
    await writeReports(output, reports);
    throw new Error(`Package invalide : consultez ${path.join(output, "exceptions.csv")}.`);
  }
  const existingContactIds = identifierSet(workbook.contacts, ["contact_id", "id"]);
  const existingSolutionIds = identifierSet(workbook.solutions, ["solution_id", "id"]);
  const existingActionReferences = identifierSet(workbook.actions, ["reference"]);

  for (let offset = 0; offset < plan.clients.length; offset += batchSize) {
    const batch = plan.clients.slice(offset, offset + batchSize);
    for (const item of batch) {
      const ids = idsFor(item.clientKey, { contacts: item.contacts.length, solutions: item.solutions.length });
      if (item.status === "ignored") {
        const record = outputRecord(item);
        reports.summary.push(record);
        reports.exceptions.push(record);
        continue;
      }
      const statistics = args["skip-statistics"] ? [] : await verifyStatistics(env, item);
      const statisticsSummary = statistics.map((entry) => `${entry.provider}:${entry.identifier}=${entry.status}`).join(" | ");
      if (args.mode === "dry-run") {
        reports.summary.push(outputRecord(item, { client_id: ids.clientId, supabase: item.status === "ready" ? "would_create_without_email" : "not_created_for_draft", statistiques: statisticsSummary, vignettes: "not_requested_in_dry_run" }));
        reports.mapping.push({ client_key: item.clientKey, client_id: ids.clientId, contact_ids: ids.contactIds.join(","), solution_ids: ids.solutionIds.join(","), statut: item.status });
        continue;
      }

      let supabase = item.status === "draft" ? "not_created_for_draft" : "";
      let thumbnailSummary = "";
      try {
        const rows = rowsForClient(item, ids);
        if (item.status !== "resumed") {
          await googleAppend(env, token, env.GOOGLE_CLIENTS_WRITE_RANGE || "Clients!A:K", [rows.clientRow]);
        }
        const missingContacts = rows.contactRows.filter((row) => !existingContactIds.has(row[0]));
        const missingSolutions = rows.solutionRows.filter((row) => !existingSolutionIds.has(row[0]));
        await googleAppend(env, token, env.GOOGLE_CONTACTS_WRITE_RANGE || "Contacts!A:J", missingContacts);
        await googleAppend(env, token, env.GOOGLE_SOLUTIONS_WRITE_RANGE || "Solutions!A:K", missingSolutions);
        if (!item.hasAudit && !existingActionReferences.has(rows.actionRow[5])) {
          await googleAppend(env, token, env.GOOGLE_ACTIONS_WRITE_RANGE || "Actions!A:J", [rows.actionRow]);
          existingActionReferences.add(rows.actionRow[5]);
        }
        missingContacts.forEach((row) => existingContactIds.add(row[0]));
        missingSolutions.forEach((row) => existingSolutionIds.add(row[0]));
        if (item.status === "ready" || item.status === "resumed") {
          const users = [];
          for (const email of authenticationEmails(item)) users.push(`${email}=${await createSupabaseUser(env, email)}`);
          supabase = users.join(" | ");
        }
        if (!args["skip-thumbnails"] && item.status !== "draft") {
          const thumbnails = await refreshThumbnails(env, item, ids);
          thumbnailSummary = thumbnails.map((entry) => `${entry.solution_id}=${entry.status}`).join(" | ");
        }
        reports.summary.push(outputRecord(item, { client_id: ids.clientId, supabase, statistiques: statisticsSummary, vignettes: thumbnailSummary }));
        reports.mapping.push({ client_key: item.clientKey, client_id: ids.clientId, contact_ids: ids.contactIds.join(","), solution_ids: ids.solutionIds.join(","), statut: item.status });
      } catch (error) {
        const record = outputRecord(item, { statut: "error", client_id: ids.clientId, supabase, statistiques: statisticsSummary, vignettes: thumbnailSummary });
        record.raisons = [record.raisons, error instanceof Error ? error.message : "Erreur inconnue"].filter(Boolean).join(" | ");
        reports.summary.push(record);
        reports.exceptions.push(record);
      }
      await writeReports(output, reports);
    }
  }
  await writeReports(output, reports);
  const created = reports.summary.filter((entry) => ["ready", "draft", "resumed"].includes(entry.statut)).length;
  console.log(`Import ${args.mode} terminé : ${created} dossier(s) traité(s). Rapports : ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
