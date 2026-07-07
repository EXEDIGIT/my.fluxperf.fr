import { describe, expect, it } from "vitest";
import { getAuthenticatedEmail } from "./auth";

function base64UrlEncode(input: string): string {
  const bytes = new TextEncoder().encode(input);
  let binary = "";

  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });

  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function unsignedAccessJwt(payload: Record<string, unknown>): string {
  return `${base64UrlEncode(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64UrlEncode(
    JSON.stringify(payload)
  )}.signature`;
}

describe("Cloudflare Access auth", () => {
  it("uses the Access email header on the protected production hostname", () => {
    const request = new Request("https://my.fluxperf.fr/api/me", {
      headers: {
        "Cf-Access-Authenticated-User-Email": "TDACUNHA@EXEDIGIT.FR"
      }
    });

    expect(getAuthenticatedEmail(request, { APP_ENV: "production" })).toBe(
      "tdacunha@exedigit.fr"
    );
  });

  it("ignores spoofable Access headers on the pages.dev hostname in production", () => {
    const request = new Request("https://my-fluxperf-fr.pages.dev/api/me", {
      headers: {
        "Cf-Access-Authenticated-User-Email": "tdacunha@exedigit.fr"
      }
    });

    expect(getAuthenticatedEmail(request, { APP_ENV: "production" })).toBeNull();
  });

  it("reads the Access email from the CF_Authorization cookie on the protected hostname", () => {
    const token = unsignedAccessJwt({ email: "TDACUNHA@EXEDIGIT.FR" });
    const request = new Request("https://my.fluxperf.fr/api/me", {
      headers: {
        Cookie: `CF_Authorization=${token}`
      }
    });

    expect(getAuthenticatedEmail(request, { APP_ENV: "production" })).toBe(
      "tdacunha@exedigit.fr"
    );
  });

  it("reads the Access email from the assertion header when the email header is absent", () => {
    const token = unsignedAccessJwt({ sub: "tdacunha@exedigit.fr" });
    const request = new Request("https://my.fluxperf.fr/api/me", {
      headers: {
        "Cf-Access-Jwt-Assertion": token
      }
    });

    expect(getAuthenticatedEmail(request, { APP_ENV: "production" })).toBe(
      "tdacunha@exedigit.fr"
    );
  });

  it("ignores Access cookies on the pages.dev hostname in production", () => {
    const token = unsignedAccessJwt({ email: "tdacunha@exedigit.fr" });
    const request = new Request("https://my-fluxperf-fr.pages.dev/api/me", {
      headers: {
        Cookie: `CF_Authorization=${token}`
      }
    });

    expect(getAuthenticatedEmail(request, { APP_ENV: "production" })).toBeNull();
  });
});
