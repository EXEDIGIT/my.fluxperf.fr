import type { AppEnv } from "./types";

type Fetcher = typeof fetch;

type SupabaseUserResponse = {
  email?: string;
  user?: {
    email?: string;
  };
};

export function isProduction(env: AppEnv): boolean {
  return env.APP_ENV === "production";
}

export function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getBearerToken(request: Request): string | null {
  const authorization = request.headers.get("Authorization");
  const [scheme, token] = authorization?.split(" ") ?? [];

  if (scheme?.toLowerCase() !== "bearer" || !token?.trim()) {
    return null;
  }

  return token.trim();
}

function getSupabaseConfig(env: AppEnv) {
  const url = env.SUPABASE_URL?.trim();
  const publishableKey = (env.SUPABASE_PUBLISHABLE_KEY || env.SUPABASE_ANON_KEY)?.trim();

  if (!url || !publishableKey) {
    return null;
  }

  return {
    url: url.replace(/\/+$/, ""),
    publishableKey
  };
}

async function emailFromSupabaseToken(
  token: string,
  env: AppEnv,
  fetcher: Fetcher
): Promise<string | null> {
  const config = getSupabaseConfig(env);

  if (!config) {
    return null;
  }

  const response = await fetcher(`${config.url}/auth/v1/user`, {
    headers: {
      apikey: config.publishableKey,
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = (await response.json()) as SupabaseUserResponse;
  const email = data.email || data.user?.email;

  return email?.trim() ? normalizeEmail(email) : null;
}

export async function getAuthenticatedEmail(
  request: Request,
  env: AppEnv,
  fetcher: Fetcher = fetch
): Promise<string | null> {
  const bearerToken = getBearerToken(request);

  if (bearerToken) {
    const supabaseEmail = await emailFromSupabaseToken(bearerToken, env, fetcher);

    if (supabaseEmail) {
      return supabaseEmail;
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
