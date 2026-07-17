import { demoSheetValues, demoSolutionsValues, type ClientWorkbookValues } from "./clients";
import { isProduction } from "./auth";
import type { AppEnv } from "./types";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GOOGLE_SCOPE = "https://www.googleapis.com/auth/spreadsheets";
const DEFAULT_RANGE = "Clients!A1:Z1000";
const DEFAULT_CONTACTS_RANGE = "Contacts!A1:Z1000";
const DEFAULT_SOLUTIONS_RANGE = "Solutions!A1:Z1000";
const DEFAULT_ACTIONS_RANGE = "Actions!A1:J1000";
const DEFAULT_CLIENTS_WRITE_RANGE = "Clients!A:K";
const DEFAULT_CONTACTS_WRITE_RANGE = "Contacts!A:J";
const DEFAULT_SOLUTIONS_WRITE_RANGE = "Solutions!A:I";

type Fetcher = typeof fetch;

type GoogleTokenResponse = {
  access_token?: string;
  token_type?: string;
  expires_in?: number;
  error?: string;
  error_description?: string;
};

type GoogleSheetResponse = {
  values?: string[][];
  error?: {
    message?: string;
  };
};

type GoogleAppendResponse = {
  updates?: {
    updatedRange?: string;
    updatedRows?: number;
  };
  error?: {
    message?: string;
  };
};

function isSheetsConfigured(env: AppEnv): boolean {
  return Boolean(
    env.GOOGLE_SHEET_ID &&
      env.GOOGLE_SERVICE_ACCOUNT_EMAIL &&
      env.GOOGLE_PRIVATE_KEY
  );
}

function base64UrlEncode(input: string | ArrayBuffer): string {
  const bytes = typeof input === "string" ? new TextEncoder().encode(input) : new Uint8Array(input);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const normalized = pem.replace(/\\n/g, "\n");
  const base64 = normalized
    .replace("-----BEGIN PRIVATE KEY-----", "")
    .replace("-----END PRIVATE KEY-----", "")
    .replace(/\s/g, "");
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);

  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }

  return bytes.buffer;
}

async function signJwt(unsignedJwt: string, privateKey: string): Promise<string> {
  const cryptoKey = await crypto.subtle.importKey(
    "pkcs8",
    pemToArrayBuffer(privateKey),
    {
      name: "RSASSA-PKCS1-v1_5",
      hash: "SHA-256"
    },
    false,
    ["sign"]
  );

  const signature = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    cryptoKey,
    new TextEncoder().encode(unsignedJwt)
  );

  return base64UrlEncode(signature);
}

async function createGoogleJwt(env: AppEnv): Promise<string> {
  if (!env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    throw new Error("Google Service Account configuration is missing.");
  }

  const now = Math.floor(Date.now() / 1000);
  const header = {
    alg: "RS256",
    typ: "JWT"
  };
  const payload = {
    iss: env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
    scope: GOOGLE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    exp: now + 3600,
    iat: now
  };
  const unsignedJwt = `${base64UrlEncode(JSON.stringify(header))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}`;
  const signature = await signJwt(unsignedJwt, env.GOOGLE_PRIVATE_KEY);

  return `${unsignedJwt}.${signature}`;
}

async function getGoogleAccessToken(env: AppEnv, fetcher: Fetcher): Promise<string> {
  const assertion = await createGoogleJwt(env);
  const body = new URLSearchParams({
    grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  });
  const response = await fetcher(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    },
    body
  });
  const data = (await response.json()) as GoogleTokenResponse;

  if (!response.ok || !data.access_token) {
    throw new Error(data.error_description || data.error || "Unable to get Google access token.");
  }

  return data.access_token;
}

export async function readGoogleSheetValues(
  env: AppEnv,
  fetcher: Fetcher = fetch
): Promise<string[][]> {
  if (!isSheetsConfigured(env)) {
    if (!isProduction(env)) {
      return demoSheetValues;
    }

    throw new Error("Google Sheets configuration is missing.");
  }

  const accessToken = await getGoogleAccessToken(env, fetcher);

  return readGoogleSheetRange(env, accessToken, env.GOOGLE_SHEET_RANGE || DEFAULT_RANGE, fetcher);
}

async function readGoogleSheetRange(
  env: AppEnv,
  accessToken: string,
  rangeName: string,
  fetcher: Fetcher
): Promise<string[][]> {
  const sheetId = encodeURIComponent(env.GOOGLE_SHEET_ID as string);
  const range = encodeURIComponent(rangeName);
  const response = await fetcher(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`
      }
    }
  );
  const data = (await response.json()) as GoogleSheetResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || `Unable to read Google Sheet range ${rangeName}.`);
  }

  return data.values ?? [];
}

async function readOptionalGoogleSheetRange(
  env: AppEnv,
  accessToken: string,
  rangeName: string,
  fetcher: Fetcher
): Promise<string[][]> {
  try {
    return await readGoogleSheetRange(env, accessToken, rangeName, fetcher);
  } catch {
    return [];
  }
}

export async function readGoogleWorkbookValues(
  env: AppEnv,
  fetcher: Fetcher = fetch
): Promise<ClientWorkbookValues> {
  if (!isSheetsConfigured(env)) {
    if (!isProduction(env)) {
      return {
        clients: demoSheetValues,
        contacts: [],
        solutions: demoSolutionsValues,
        actions: []
      };
    }

    throw new Error("Google Sheets configuration is missing.");
  }

  const accessToken = await getGoogleAccessToken(env, fetcher);
  const [clients, contacts, solutions, actions] = await Promise.all([
    readGoogleSheetRange(env, accessToken, env.GOOGLE_SHEET_RANGE || DEFAULT_RANGE, fetcher),
    readOptionalGoogleSheetRange(
      env,
      accessToken,
      env.GOOGLE_CONTACTS_RANGE || DEFAULT_CONTACTS_RANGE,
      fetcher
    ),
    readOptionalGoogleSheetRange(
      env,
      accessToken,
      env.GOOGLE_SOLUTIONS_RANGE || DEFAULT_SOLUTIONS_RANGE,
      fetcher
    ),
    readOptionalGoogleSheetRange(
      env,
      accessToken,
      env.GOOGLE_ACTIONS_RANGE || DEFAULT_ACTIONS_RANGE,
      fetcher
    )
  ]);

  return {
    clients,
    contacts,
    solutions,
    actions
  };
}

export async function appendGoogleSheetValues(
  env: AppEnv,
  rangeName: string,
  rows: string[][],
  fetcher: Fetcher = fetch
): Promise<GoogleAppendResponse["updates"]> {
  if (!isSheetsConfigured(env)) {
    throw new Error("Google Sheets configuration is missing.");
  }

  if (rows.length === 0) {
    return {
      updatedRows: 0
    };
  }

  const accessToken = await getGoogleAccessToken(env, fetcher);
  const sheetId = encodeURIComponent(env.GOOGLE_SHEET_ID as string);
  const range = encodeURIComponent(rangeName);
  const response = await fetcher(
    `https://sheets.googleapis.com/v4/spreadsheets/${sheetId}/values/${range}:append?valueInputOption=USER_ENTERED&insertDataOption=INSERT_ROWS`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        values: rows
      })
    }
  );
  const data = (await response.json()) as GoogleAppendResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || `Unable to append Google Sheet range ${rangeName}.`);
  }

  return data.updates;
}

export function getGoogleWriteRanges(env: AppEnv) {
  return {
    clients: env.GOOGLE_CLIENTS_WRITE_RANGE || DEFAULT_CLIENTS_WRITE_RANGE,
    contacts: env.GOOGLE_CONTACTS_WRITE_RANGE || DEFAULT_CONTACTS_WRITE_RANGE,
    solutions: env.GOOGLE_SOLUTIONS_WRITE_RANGE || DEFAULT_SOLUTIONS_WRITE_RANGE
  };
}
