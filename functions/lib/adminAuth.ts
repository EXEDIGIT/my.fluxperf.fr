import { getAuthenticatedEmail, isProduction, normalizeEmail } from "./auth";
import { jsonError } from "./response";
import type { AppEnv } from "./types";

function splitEmails(value: string | undefined): string[] {
  return (value ?? "")
    .split(/[;,]/)
    .map((email) => email.trim())
    .filter(Boolean)
    .map(normalizeEmail);
}

export function getAdminEmails(env: AppEnv): string[] {
  const configuredEmails = splitEmails(env.ADMIN_EMAILS);

  if (configuredEmails.length > 0 || isProduction(env)) {
    return Array.from(new Set(configuredEmails));
  }

  return Array.from(new Set(splitEmails(env.DEV_ADMIN_EMAIL || env.DEV_AUTH_EMAIL)));
}

export function isAdminEmail(email: string, env: AppEnv): boolean {
  return getAdminEmails(env).includes(normalizeEmail(email));
}

export async function requireAdmin(request: Request, env: AppEnv): Promise<{ email: string } | Response> {
  const email = await getAuthenticatedEmail(request, env);

  if (!email) {
    return jsonError(401, "AUTH_REQUIRED", "Authentification admin requise.");
  }

  const adminEmails = getAdminEmails(env);

  if (adminEmails.length === 0) {
    return jsonError(403, "ADMIN_NOT_CONFIGURED", "La zone interne n'est pas encore configurée.");
  }

  if (!adminEmails.includes(email)) {
    return jsonError(403, "ADMIN_FORBIDDEN", "Votre compte n'est pas autorisé sur cette zone interne.");
  }

  return { email };
}
