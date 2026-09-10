import { webcrypto } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const MARKETING_HEADERS = [
  "brevo_marketing_eligible",
  "brevo_marketing_source",
  "brevo_marketing_eligible_at",
  "brevo_marketing_status",
  "brevo_marketing_synced_at",
  "brevo_marketing_last_error"
];

function usageText() {
  return "Usage : pnpm sync:brevo-contacts -- --mode dry-run|apply [--env-file <fichier>] [--output <dossier>]";
}

function usage(message = "") {
  if (message) console.error(`Erreur : ${message}\n`);
  console.error(usageText());
  process.exitCode = 1;
}

function argsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (!argument.startsWith("--")) continue;
    const name = argument.slice(2);
    if (name === "help") result.help = true;
    else {
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
    if (equals < 1) return result;
    const key = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[key] = value;
    return result;
  }, {});
}

async function loadEnv(envFile) {
  return envFile ? { ...process.env, ...parseEnv(await readFile(envFile, "utf8")) } : { ...process.env };
}

function required(env, names) {
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Variables d'environnement manquantes : ${missing.join(", ")}.`);
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function googleToken(env) {
  required(env, ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"]);
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope: SHEETS_SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const pem = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n").replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
  const key = await crypto.subtle.importKey("pkcs8", Buffer.from(pem, "base64"), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, new TextEncoder().encode(`${header}.${payload}`));
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: `${header}.${payload}.${Buffer.from(signature).toString("base64url")}` })
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(data.error_description || data.error || "Jeton Google impossible à obtenir.");
  return data.access_token;
}

async function googleValues(env, token, range) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEET_ID)}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Lecture Google Sheets impossible (${range}).`);
  return data.values ?? [];
}

async function googleUpdate(env, token, range, values) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEET_ID)}/values/${encodeURIComponent(range)}?valueInputOption=USER_ENTERED`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ values })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Écriture Google Sheets impossible (${range}).`);
}

function headers(values) {
  return values[0]?.map((value) => String(value ?? "").trim().toLowerCase()) ?? [];
}

function records(values) {
  const keys = headers(values);
  return values.slice(1).map((row, index) => ({
    rowNumber: index + 2,
    record: keys.reduce((result, key, keyIndex) => {
      if (key) result[key] = String(row[keyIndex] ?? "").trim();
      return result;
    }, {})
  })).filter(({ record }) => Object.values(record).some(Boolean));
}

function value(record, ...keys) {
  return keys.map((key) => record[key.toLowerCase()] || "").find(Boolean)?.trim() || "";
}

function isActive(input) {
  return ["actif", "active"].includes(String(input).trim().toLowerCase());
}

function affirmative(input) {
  return ["oui", "yes", "true", "1"].includes(String(input).trim().toLowerCase());
}

function eligibleForHistoricalImport(contact) {
  const stored = value(contact, "brevo_marketing_eligible");
  return !stored || affirmative(stored);
}

function csvEscape(value) {
  const text = String(value ?? "");
  return /[;"\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  const keys = ["client_id", "contact_id", "email", "organisation", "eligibility", "status", "detail"];
  return [keys.join(";"), ...rows.map((row) => keys.map((key) => csvEscape(row[key])).join(";"))].join("\n");
}

async function syncBrevo(env, payload) {
  const response = await fetch("https://api.brevo.com/v3/contacts", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/json", "api-key": env.BREVO_API_KEY },
    body: JSON.stringify({ email: payload.email, updateEnabled: true, listIds: [Number(env.BREVO_MARKETING_LIST_ID)], attributes: payload.attributes })
  });
  if (response.ok) return { status: "synced", detail: "" };
  const data = await response.json().catch(() => ({}));
  return { status: "failed", detail: String(data.message || data.code || `Brevo a répondu ${response.status}.`).slice(0, 240) };
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  if (args.help) {
    console.log(usageText());
    return;
  }
  if (!args.mode || !["dry-run", "apply"].includes(args.mode)) return usage("--mode dry-run ou apply est obligatoire.");
  const env = await loadEnv(args["env-file"]);
  required(env, ["GOOGLE_SHEET_ID"]);
  if (args.mode === "apply") required(env, ["BREVO_API_KEY", "BREVO_MARKETING_LIST_ID"]);
  if (args.mode === "apply" && (!Number.isInteger(Number(env.BREVO_MARKETING_LIST_ID)) || Number(env.BREVO_MARKETING_LIST_ID) <= 0)) {
    throw new Error("BREVO_MARKETING_LIST_ID doit être un entier positif.");
  }

  const token = await googleToken(env);
  const [clientValues, contactValues, solutionValues] = await Promise.all([
    googleValues(env, token, env.GOOGLE_SHEET_RANGE || "Clients!A1:Z1000"),
    googleValues(env, token, env.GOOGLE_CONTACTS_RANGE || "Contacts!A1:Z1000"),
    googleValues(env, token, env.GOOGLE_SOLUTIONS_RANGE || "Solutions!A1:Z1000")
  ]);
  const contactHeaders = headers(contactValues);
  const missingBaseHeaders = ["contact_id", "client_id", "email", "statut_contact"].filter((header) => !contactHeaders.includes(header));
  if (missingBaseHeaders.length) throw new Error(`Colonnes Contacts manquantes : ${missingBaseHeaders.join(", ")}.`);
  const headerSetupRequired = MARKETING_HEADERS.some((header) => !contactHeaders.includes(header));
  if (args.mode === "apply" && headerSetupRequired) await googleUpdate(env, token, "Contacts!K1:P1", [MARKETING_HEADERS]);

  const clients = new Map(records(clientValues).map(({ record }) => [value(record, "client_id", "id"), record]));
  const solutions = records(solutionValues).map(({ record }) => record);
  const report = [];
  for (const { rowNumber, record: contact } of records(contactValues)) {
    const clientId = value(contact, "client_id");
    const client = clients.get(clientId);
    const email = value(contact, "email").toLowerCase();
    const organisation = client ? value(client, "organisation", "company_name", "nom_compte") : "";
    const clientActive = client && isActive(value(client, "statut_client", "status")) && (!value(client, "espace_client_actif") || affirmative(value(client, "espace_client_actif")));
    const contactActive = !value(contact, "statut_contact", "status") || isActive(value(contact, "statut_contact", "status"));
    const eligible = eligibleForHistoricalImport(contact);

    if (!clientActive || !contactActive || !email || !eligible) {
      report.push({ client_id: clientId, contact_id: value(contact, "contact_id"), email, organisation, eligibility: eligible ? "eligible" : "excluded", status: "skipped", detail: !clientActive ? "client inactive" : !contactActive ? "contact inactive" : !email ? "email missing" : "explicitly excluded" });
      continue;
    }

    const activeServices = Array.from(new Set(solutions
      .filter((solution) => value(solution, "client_id") === clientId && isActive(value(solution, "statut_solution", "status", "statut")))
      .map((solution) => value(solution, "nom_solution", "name") || value(solution, "type_solution", "type"))
      .filter(Boolean)));
    const source = value(contact, "brevo_marketing_source") || "myfluxperf_historical_b2b";
    const payload = {
      email,
      attributes: {
        FNAME: value(contact, "prenom", "first_name"),
        LNAME: value(contact, "nom", "last_name"),
        MFP_CLIENT_ID: clientId,
        MFP_COMPANY: organisation || "Client Fluxperf",
        MFP_ROLE: value(contact, "role_contact", "role"),
        MFP_ACTIVE_SERVICES: activeServices.join(" | "),
        MFP_SOURCE: source
      }
    };
    if (args.mode === "dry-run") {
      report.push({ client_id: clientId, contact_id: value(contact, "contact_id"), email, organisation, eligibility: "eligible", status: "would_sync", detail: headerSetupRequired ? "marketing headers will be added on apply" : "" });
      continue;
    }
    const result = await syncBrevo(env, payload);
    const now = new Date().toISOString();
    await googleUpdate(env, token, `Contacts!K${rowNumber}:P${rowNumber}`, [[
      "Oui",
      source,
      value(contact, "brevo_marketing_eligible_at") || now,
      result.status,
      result.status === "synced" ? now : "",
      result.detail
    ]]);
    report.push({ client_id: clientId, contact_id: value(contact, "contact_id"), email, organisation, eligibility: "eligible", status: result.status, detail: result.detail });
  }

  const output = path.resolve(args.output || `rapport-brevo-${new Date().toISOString().slice(0, 10)}`);
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "synchronisation-brevo.csv"), toCsv(report), "utf8");
  const summary = report.reduce((counts, row) => ({ ...counts, [row.status]: (counts[row.status] || 0) + 1 }), {});
  console.log(`Synchronisation Brevo ${args.mode} terminée : ${JSON.stringify(summary)}. Rapport : ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
