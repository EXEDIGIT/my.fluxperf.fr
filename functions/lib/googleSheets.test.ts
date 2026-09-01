import { beforeAll, describe, expect, it, vi } from "vitest";
import { readGoogleWorkbookValues } from "./googleSheets";
import type { AppEnv } from "./types";

function toPrivateKeyPem(value: ArrayBuffer): string {
  const base64 = btoa(String.fromCharCode(...new Uint8Array(value)));
  const lines = base64.match(/.{1,64}/g) ?? [];

  return `-----BEGIN PRIVATE KEY-----\n${lines.join("\n")}\n-----END PRIVATE KEY-----`;
}

let privateKey = "";

beforeAll(async () => {
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 1024,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256"
    },
    true,
    ["sign", "verify"]
  );
  privateKey = toPrivateKeyPem(await crypto.subtle.exportKey("pkcs8", keyPair.privateKey));
});

const env = (): AppEnv => ({
  APP_ENV: "production",
  GOOGLE_SHEET_ID: "sheet-id",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.iam.gserviceaccount.com",
  GOOGLE_PRIVATE_KEY: privateKey
});

describe("Google Sheets workbook reads", () => {
  it("loads the core workbook ranges with one batch request", async () => {
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 });
      }

      if (url.includes("values:batchGet")) {
        return new Response(
          JSON.stringify({
            valueRanges: [
              { values: [["client_id"], ["CLI-1"]] },
              { values: [["contact_id"]] },
              { values: [["solution_id"]] },
              { values: [["action_id"]] },
              { values: [["connexion_id"]] }
            ]
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({ error: { message: "Unable to parse range: Documents" } }), {
        status: 400
      });
    });

    const workbook = await readGoogleWorkbookValues(env(), fetcher as typeof fetch);

    expect(workbook.clients).toEqual([["client_id"], ["CLI-1"]]);
    expect(workbook.contacts).toEqual([["contact_id"]]);
    expect(workbook.documents).toEqual([]);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("values:batchGet"))).toHaveLength(1);
    expect(fetcher).toHaveBeenCalledTimes(3);
  });

  it("retries a temporary Google Sheets quota response before failing", async () => {
    let batchAttempts = 0;
    const fetcher = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);

      if (url === "https://oauth2.googleapis.com/token") {
        return new Response(JSON.stringify({ access_token: "token", expires_in: 3600 }), { status: 200 });
      }

      if (url.includes("values:batchGet")) {
        batchAttempts += 1;

        if (batchAttempts === 1) {
          return new Response(JSON.stringify({ error: { message: "Quota exceeded" } }), {
            status: 429,
            headers: { "Retry-After": "0.001" }
          });
        }

        return new Response(
          JSON.stringify({
            valueRanges: [{ values: [["client_id"]] }, {}, {}, {}, {}]
          }),
          { status: 200 }
        );
      }

      return new Response(JSON.stringify({}), { status: 200 });
    });

    await expect(readGoogleWorkbookValues(env(), fetcher as typeof fetch)).resolves.toMatchObject({
      clients: [["client_id"]]
    });
    expect(batchAttempts).toBe(2);
  });
});
