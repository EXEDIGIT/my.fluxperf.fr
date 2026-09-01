import { readFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { webcrypto } from "node:crypto";
import { csv } from "./lib/client-import.mjs";
import { buildNormalizationPlan } from "./lib/solution-normalization.mjs";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

function usage(message = "") {
  const usageMessage = "Usage : pnpm normalize:solutions -- --mode dry-run|apply [--env-file <fichier>] [--output <dossier>]";
  if (message) {
    console.error(`Erreur : ${message}\n`);
    console.error(usageMessage);
    process.exitCode = 1;
    return;
  }
  console.log(usageMessage);
}

function argsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (!argument.startsWith("--")) continue;
    const name = argument.slice(2);
    if (name === "help") result[name] = true;
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
    if (equals <= 0) return result;
    const name = trimmed.slice(0, equals).trim();
    let value = trimmed.slice(equals + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
    result[name] = value;
    return result;
  }, {});
}

async function loadEnv(envFile) {
  return envFile ? { ...process.env, ...parseEnv(await readFile(envFile, "utf8")) } : { ...process.env };
}

function requiredEnv(env) {
  const names = ["GOOGLE_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"];
  const missing = names.filter((name) => !env[name]?.trim());
  if (missing.length) throw new Error(`Variables d'environnement manquantes : ${missing.join(", ")}.`);
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

async function googleToken(env) {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope: SHEETS_SCOPE, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const privateKey = env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, "\n");
  const pem = privateKey.replace("-----BEGIN PRIVATE KEY-----", "").replace("-----END PRIVATE KEY-----", "").replace(/\s/g, "");
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

async function readValues(env, token, range) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEET_ID)}/values/${encodeURIComponent(range)}`, { headers: { Authorization: `Bearer ${token}` } });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Lecture Google Sheets impossible (${range}).`);
  return data.values ?? [];
}

async function updateValues(env, token, updates) {
  if (updates.length === 0) return;
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(env.GOOGLE_SHEET_ID)}/values:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "RAW", data: updates.map((update) => ({ range: update.range, values: [[update.nextName]] })) })
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Mise à jour Google Sheets impossible.");
}

async function writeReports(output, plan) {
  await mkdir(output, { recursive: true });
  const rows = [
    ...plan.updates.map((entry) => ({ ...entry, status: "à_normaliser", reason: "" })),
    ...plan.unchanged.map((entry) => ({ ...entry, status: "conforme", reason: "" })),
    ...plan.exceptions.map((entry) => ({ ...entry, status: "exception", nextName: "", reason: entry.reason }))
  ];
  await Promise.all([
    writeFile(path.join(output, "normalisation.csv"), csv(rows, ["scope", "rowNumber", "solutionId", "type", "currentName", "nextName", "status", "reason"])),
    writeFile(path.join(output, "exceptions.csv"), csv(plan.exceptions, ["scope", "rowNumber", "solutionId", "type", "currentName", "reason"]))
  ]);
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  if (args.help) return usage();
  if (!args.mode || !["dry-run", "apply"].includes(args.mode)) return usage("--mode dry-run ou apply est obligatoire.");
  const env = await loadEnv(args["env-file"]);
  requiredEnv(env);
  const output = path.resolve(args.output || path.join(".codex-tmp", `rapport-normalisation-solutions-${new Date().toISOString().slice(0, 10)}`));
  const token = await googleToken(env);
  const [solutions, parameters] = await Promise.all([
    readValues(env, token, env.GOOGLE_SOLUTIONS_RANGE || "Solutions!A1:K1000"),
    readValues(env, token, env.GOOGLE_PARAMETERS_RANGE || "Parametres!A1:B1000")
  ]);
  const plan = buildNormalizationPlan({ solutions, parameters });
  await writeReports(output, plan);
  if (args.mode === "apply") await updateValues(env, token, plan.updates);
  console.log(`Normalisation ${args.mode} : ${plan.updates.length} mise(s) à jour, ${plan.exceptions.length} exception(s). Rapports : ${output}`);
  if (plan.exceptions.length > 0) process.exitCode = 2;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
