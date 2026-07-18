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

type SupabaseUser = {
  id?: string;
  email?: string;
};

type SupabaseListUsersResponse = {
  users?: SupabaseUser[];
  error?: string;
  message?: string;
};

type SupabaseBanResult =
  | { status: "banned"; email: string }
  | { status: "not_found"; email: string; reason: string }
  | { status: "skipped"; email: string; reason: string }
  | { status: "failed"; email: string; reason: string };

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

async function findSupabaseUserIdByEmail(
  config: NonNullable<ReturnType<typeof getSupabaseAdminConfig>>,
  email: string,
  fetcher: Fetcher
): Promise<string | null> {
  for (let page = 1; page <= 10; page += 1) {
    const response = await fetcher(`${config.url}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`
      }
    });
    const data = (await response.json().catch(() => ({}))) as SupabaseListUsersResponse | SupabaseUser[];

    if (!response.ok) {
      const message = Array.isArray(data) ? "" : data.message || data.error;

      throw new Error(message || "Unable to list Supabase users.");
    }

    const users = Array.isArray(data) ? data : data.users ?? [];
    const found = users.find((user) => normalizeEmail(user.email ?? "") === email);

    if (found?.id) {
      return found.id;
    }

    if (users.length < 1000) {
      return null;
    }
  }

  return null;
}

export async function banSupabaseUserForClient(
  env: AppEnv,
  email: string,
  fetcher: Fetcher = fetch
): Promise<SupabaseBanResult> {
  const normalizedEmail = normalizeEmail(email);
  const config = getSupabaseAdminConfig(env);

  if (!config) {
    return {
      status: "skipped",
      email: normalizedEmail,
      reason: "Configuration Auth admin absente."
    };
  }

  try {
    const userId = await findSupabaseUserIdByEmail(config, normalizedEmail, fetcher);

    if (!userId) {
      return {
        status: "not_found",
        email: normalizedEmail,
        reason: "Utilisateur Auth introuvable."
      };
    }

    const response = await fetcher(`${config.url}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
      method: "PUT",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ban_duration: "876000h"
      })
    });
    const data = (await response.json().catch(() => ({}))) as SupabaseAdminError;

    if (!response.ok) {
      return {
        status: "failed",
        email: normalizedEmail,
        reason: data.message || data.error || data.msg || "Bannissement Auth impossible."
      };
    }

    return {
      status: "banned",
      email: normalizedEmail
    };
  } catch (error) {
    return {
      status: "failed",
      email: normalizedEmail,
      reason: error instanceof Error ? error.message : "Bannissement Auth impossible."
    };
  }
}
