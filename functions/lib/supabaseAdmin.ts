import { isProduction, normalizeEmail } from "./auth";
import type { AppEnv } from "./types";

type Fetcher = typeof fetch;

type SupabaseAdminError = {
  message?: string;
  error?: string;
  msg?: string;
};

type SupabaseAdminResult =
  | { status: "created"; email: string }
  | { status: "already_exists"; email: string }
  | { status: "skipped"; email: string; reason: string };

function getSupabaseAdminConfig(env: AppEnv) {
  const url = env.SUPABASE_URL?.trim().replace(/\/+$/, "");
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    return null;
  }

  return {
    url,
    serviceRoleKey
  };
}

function looksLikeExistingUserError(error: SupabaseAdminError): boolean {
  const message = `${error.message ?? ""} ${error.error ?? ""} ${error.msg ?? ""}`.toLowerCase();

  return message.includes("already") || message.includes("registered") || message.includes("exists");
}

export async function createSupabaseUserForClient(
  env: AppEnv,
  email: string,
  fetcher: Fetcher = fetch
): Promise<SupabaseAdminResult> {
  const normalizedEmail = normalizeEmail(email);
  const config = getSupabaseAdminConfig(env);

  if (!config) {
    if (isProduction(env)) {
      throw new Error("Supabase admin configuration is missing.");
    }

    return {
      status: "skipped",
      email: normalizedEmail,
      reason: "Supabase admin non configure en local."
    };
  }

  const response = await fetcher(`${config.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: config.serviceRoleKey,
      Authorization: `Bearer ${config.serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      email: normalizedEmail,
      email_confirm: true,
      user_metadata: {
        source: "my-fluxperf-admin"
      }
    })
  });

  if (response.ok) {
    return {
      status: "created",
      email: normalizedEmail
    };
  }

  const data = (await response.json().catch(() => ({}))) as SupabaseAdminError;

  if (looksLikeExistingUserError(data)) {
    return {
      status: "already_exists",
      email: normalizedEmail
    };
  }

  throw new Error(data.message || data.error || data.msg || "Unable to create Supabase user.");
}
