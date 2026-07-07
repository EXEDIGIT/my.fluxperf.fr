import type { AppEnv } from "./types";

export function isProduction(env: AppEnv): boolean {
  return env.APP_ENV === "production";
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function getAuthenticatedEmail(request: Request, env: AppEnv): string | null {
  const accessEmail = request.headers.get("Cf-Access-Authenticated-User-Email");

  if (accessEmail?.trim()) {
    return normalizeEmail(accessEmail);
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

