import { readFile } from "node:fs/promises";
import { webcrypto } from "node:crypto";

if (!globalThis.crypto) globalThis.crypto = webcrypto;

export const SHEETS_SCOPE = "https://www.googleapis.com/auth/spreadsheets";

export function parseEnv(content) {
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

export async function loadEnv(envFile) {
  return envFile ? { ...process.env, ...parseEnv(await readFile(envFile, "utf8")) } : { ...process.env };
}

export function requiredEnv(env, names) {
  const missing = names.filter((name) => !String(env[name] ?? "").trim());
  if (missing.length) throw new Error(`Variables d'environnement manquantes : ${missing.join(", ")}.`);
}

function base64Url(value) {
  return Buffer.from(value).toString("base64url");
}

export async function googleToken(env, scope = SHEETS_SCOPE) {
  requiredEnv(env, ["GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"]);
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64Url(JSON.stringify({ iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600 }));
  const privateKey = String(env.GOOGLE_PRIVATE_KEY).replace(/\\n/g, "\n");
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

export async function googleRead(token, spreadsheetId, range) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values/${encodeURIComponent(range)}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || `Lecture Google Sheets impossible (${range}).`);
  return data.values ?? [];
}

export async function googleMetadata(token, spreadsheetId) {
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=sheets.properties(sheetId,title)`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error?.message || "Lecture des métadonnées Google Sheets impossible.");
  return (data.sheets ?? []).map((sheet) => sheet.properties).filter(Boolean);
}

export async function googleBatchUpdate(token, spreadsheetId, requests) {
  if (requests.length === 0) return;
  const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ requests })
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || "Suppression Google Sheets impossible.");
}
