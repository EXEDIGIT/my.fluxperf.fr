function text(value) {
  return String(value ?? "").trim();
}

function normalizeEmail(value) {
  return text(value).toLocaleLowerCase("fr-FR");
}

function configFrom(env) {
  const url = text(env.SUPABASE_URL).replace(/\/+$/, "");
  const key = text(env.SUPABASE_SERVICE_ROLE_KEY);

  if (!url || !key) {
    throw new Error("Configuration Supabase admin manquante.");
  }

  return { url, key };
}

function headers(config) {
  return {
    apikey: config.key,
    Authorization: `Bearer ${config.key}`
  };
}

function errorMessage(data, fallback) {
  return data?.message || data?.error || data?.msg || fallback;
}

export function silentAuthUserPayload(email, source = "my-fluxperf-silent-import") {
  return {
    email: normalizeEmail(email),
    email_confirm: true,
    user_metadata: { source }
  };
}

export async function createSilentSupabaseUser(env, email, fetcher = fetch) {
  const config = configFrom(env);
  const payload = silentAuthUserPayload(email);
  const response = await fetcher(`${config.url}/auth/v1/admin/users`, {
    method: "POST",
    headers: { ...headers(config), "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });

  if (response.ok) return { status: "created", email: payload.email };

  const data = await response.json().catch(() => ({}));
  const message = `${data.message ?? ""} ${data.error ?? ""} ${data.msg ?? ""}`.toLowerCase();

  if (message.includes("already") || message.includes("registered") || message.includes("exists")) {
    return { status: "already_exists", email: payload.email };
  }

  throw new Error(errorMessage(data, "Création Supabase impossible."));
}

export async function findSupabaseUserByEmail(env, email, fetcher = fetch) {
  const config = configFrom(env);
  const expectedEmail = normalizeEmail(email);

  for (let page = 1; page <= 10; page += 1) {
    const response = await fetcher(`${config.url}/auth/v1/admin/users?page=${page}&per_page=1000`, {
      headers: headers(config)
    });
    const data = await response.json().catch(() => ({}));

    if (!response.ok) throw new Error(errorMessage(data, "Lecture Supabase impossible."));

    const users = Array.isArray(data) ? data : data.users ?? [];
    const match = users.find((user) => normalizeEmail(user.email) === expectedEmail);

    if (match?.id) return { status: "found", id: String(match.id), email: expectedEmail };
    if (users.length < 1000) return { status: "not_found", email: expectedEmail };
  }

  return { status: "not_found", email: expectedEmail };
}

export async function deleteSupabaseUserByEmail(env, email, fetcher = fetch) {
  const found = await findSupabaseUserByEmail(env, email, fetcher);

  if (found.status === "not_found") return found;

  const config = configFrom(env);
  const response = await fetcher(`${config.url}/auth/v1/admin/users/${encodeURIComponent(found.id)}`, {
    method: "DELETE",
    headers: headers(config)
  });

  if (response.ok || response.status === 404) {
    return { status: response.status === 404 ? "not_found" : "deleted", email: found.email };
  }

  const data = await response.json().catch(() => ({}));
  throw new Error(errorMessage(data, "Suppression Supabase impossible."));
}
