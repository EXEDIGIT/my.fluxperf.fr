import type { AppEnv } from "./types";

const DEFAULT_ACCESS_HOSTNAME = "my.fluxperf.fr";

export function isProduction(env: AppEnv): boolean {
  return env.APP_ENV === "production";
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function requestHostname(request: Request): string {
  try {
    return new URL(request.url).hostname.toLowerCase();
  } catch {
    return request.headers.get("Host")?.toLowerCase() ?? "";
  }
}

function accessHostname(env: AppEnv): string {
  return (env.CF_ACCESS_HOSTNAME || DEFAULT_ACCESS_HOSTNAME).trim().toLowerCase();
}

function shouldTrustAccessIdentity(request: Request, env: AppEnv): boolean {
  if (!isProduction(env)) {
    return true;
  }

  return requestHostname(request) === accessHostname(env);
}

function getCookieValue(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("Cookie");

  if (!cookieHeader) {
    return null;
  }

  const matchingCookie = cookieHeader
    .split(";")
    .map((cookie) => cookie.trim())
    .find((cookie) => cookie.startsWith(`${name}=`));

  if (!matchingCookie) {
    return null;
  }

  const value = matchingCookie.slice(name.length + 1);

  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function decodeBase64Url(value: string): string | null {
  try {
    const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
    const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");

    return atob(padded);
  } catch {
    return null;
  }
}

function emailFromAccessJwt(token: string | null): string | null {
  const payloadSegment = token?.split(".")[1];

  if (!payloadSegment) {
    return null;
  }

  const decodedPayload = decodeBase64Url(payloadSegment);

  if (!decodedPayload) {
    return null;
  }

  try {
    const claims = JSON.parse(decodedPayload) as Record<string, unknown>;
    const emailClaim = claims.email;
    const subjectClaim = claims.sub;

    if (typeof emailClaim === "string" && emailClaim.trim()) {
      return normalizeEmail(emailClaim);
    }

    if (typeof subjectClaim === "string" && subjectClaim.includes("@")) {
      return normalizeEmail(subjectClaim);
    }
  } catch {
    return null;
  }

  return null;
}

function getAccessJwtEmail(request: Request): string | null {
  const assertionHeader = request.headers.get("Cf-Access-Jwt-Assertion");
  const authorizationCookie = getCookieValue(request, "CF_Authorization");

  return emailFromAccessJwt(assertionHeader) || emailFromAccessJwt(authorizationCookie);
}

export function getAuthenticatedEmail(request: Request, env: AppEnv): string | null {
  if (shouldTrustAccessIdentity(request, env)) {
    const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");

    if (accessEmail?.trim()) {
      return normalizeEmail(accessEmail);
    }

    const accessJwtEmail = getAccessJwtEmail(request);

    if (accessJwtEmail) {
      return accessJwtEmail;
    }
  }

  if (isProduction(env)) {
    return null;
  }

  const url = new URL(request.url);
  const localEmail = url.searchParams.get("email") || env.DEV_AUTH_EMAIL;

  if (!localEmail?.trim()) {
    return null;
  }

  return normalizeEmail(localEmail);
}
