type ThumbnailSource = {
  solutionId: string;
  clientId: string;
  type: "visibility_acquisition";
  typeLabel: string;
  name: string;
  domain: string;
  url: string;
};

type ThumbnailState = {
  solutionId: string;
  status: "ready" | "refreshing" | "error";
  capturedAt?: string;
  sourceUrlHash?: string;
  error?: string;
};

type BrowserRunBinding = {
  quickAction(action: "content" | "screenshot", payload: Record<string, unknown>): Promise<Response>;
};

type RateLimitBinding = {
  limit(options: { key: string }): Promise<{ success: boolean }>;
};

type R2ObjectBody = {
  body: ReadableStream | null;
  httpMetadata?: {
    contentType?: string;
    cacheControl?: string;
  };
  customMetadata?: Record<string, string>;
  writeHttpMetadata?: (headers: Headers) => void;
};

type R2BucketBinding = {
  get(key: string): Promise<R2ObjectBody | null>;
  put(
    key: string,
    value: ArrayBuffer | string,
    options?: {
      httpMetadata?: Record<string, string>;
      customMetadata?: Record<string, string>;
    }
  ): Promise<unknown>;
};

type Env = {
  THUMBNAILS_BUCKET: R2BucketBinding;
  BROWSER: BrowserRunBinding;
  REFRESH_RATE_LIMITER?: RateLimitBinding;
  INTERNAL_API_BASE_URL: string;
  THUMBNAIL_INTERNAL_SECRET: string;
  THUMBNAIL_MAX_AGE_DAYS?: string;
  THUMBNAIL_CRON_BATCH_SIZE?: string;
};

type ExecutionContextLike = {
  waitUntil(promise: Promise<unknown>): void;
};

const CACHE_ORIGIN = "https://thumbnail-cache.myfluxperf.local";
const IMAGE_CACHE_CONTROL = "private, max-age=86400, stale-while-revalidate=604800";
const DEFAULT_MAX_AGE_DAYS = 7;
const DEFAULT_CRON_BATCH_SIZE = 10;
const BROWSER_USER_AGENT =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36";

function json(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...(init.headers ?? {})
    }
  });
}

function jsonError(status: number, code: string, message: string): Response {
  return json(
    {
      error: {
        code,
        message
      }
    },
    { status }
  );
}

function internalToken(request: Request): string {
  const authorization = request.headers.get("Authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() === "bearer" && token?.trim()) {
    return token.trim();
  }

  return request.headers.get("X-Fluxperf-Thumbnail-Secret")?.trim() ?? "";
}

function hasInternalAccess(request: Request, env: Env): boolean {
  return Boolean(env.THUMBNAIL_INTERNAL_SECRET?.trim() && internalToken(request) === env.THUMBNAIL_INTERNAL_SECRET);
}

function thumbnailPath(solutionId: string): string {
  return `solutions/${solutionId}/homepage.jpg`;
}

function statePath(solutionId: string): string {
  return `solutions/${solutionId}/state.json`;
}

function cacheRequestForSolution(solutionId: string): Request {
  return new Request(`${CACHE_ORIGIN}/thumbnail/${encodeURIComponent(solutionId)}`);
}

function defaultCache(): Cache {
  return (caches as CacheStorage & { default: Cache }).default;
}

function solutionIdFromPath(pathname: string): { solutionId: string; isRefresh: boolean } | null {
  const match = pathname.match(/^\/thumbnail\/([^/]+)(\/refresh)?$/);

  if (!match) {
    return null;
  }

  return {
    solutionId: decodeURIComponent(match[1] ?? "").trim(),
    isRefresh: Boolean(match[2])
  };
}

function normalizeHostname(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/^\[|\]$/g, "")
    .replace(/\.$/, "")
    .replace(/^www\./, "");
}

function ipv4Parts(hostname: string): number[] | null {
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) {
    return null;
  }

  const parts = hostname.split(".").map(Number);

  return parts.every((part) => Number.isInteger(part) && part >= 0 && part <= 255) ? parts : null;
}

function isBlockedIpv4(hostname: string): boolean {
  const parts = ipv4Parts(hostname);

  if (!parts) {
    return false;
  }

  const [first, second] = parts;

  return (
    first === 0 ||
    first === 10 ||
    first === 127 ||
    first >= 224 ||
    (first === 100 && second >= 64 && second <= 127) ||
    (first === 169 && second === 254) ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168) ||
    (first === 198 && (second === 18 || second === 19))
  );
}

function isBlockedHostname(hostname: string): boolean {
  const normalized = normalizeHostname(hostname);

  if (!normalized) {
    return true;
  }

  if (normalized.includes(":")) {
    return (
      normalized === "::1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80")
    );
  }

  return (
    normalized === "localhost" ||
    normalized.endsWith(".localhost") ||
    normalized.endsWith(".local") ||
    isBlockedIpv4(normalized)
  );
}

function hostnameMatchesDomain(hostname: string, domain: string): boolean {
  const normalizedHost = normalizeHostname(hostname);
  const normalizedDomain = normalizeHostname(domain);

  return Boolean(
    normalizedHost &&
      normalizedDomain &&
      (normalizedHost === normalizedDomain || normalizedHost.endsWith(`.${normalizedDomain}`))
  );
}

export function isCaptureUrlAllowed(sourceUrl: string, domain: string): boolean {
  try {
    const url = new URL(sourceUrl);

    if (url.protocol !== "https:" && url.protocol !== "http:") {
      return false;
    }

    if (url.username || url.password || isBlockedHostname(url.hostname)) {
      return false;
    }

    return hostnameMatchesDomain(url.hostname, domain);
  } catch {
    return false;
  }
}

async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));

  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readState(env: Env, solutionId: string): Promise<ThumbnailState | null> {
  const object = await env.THUMBNAILS_BUCKET.get(statePath(solutionId));

  if (!object?.body) {
    return null;
  }

  try {
    const state = (await new Response(object.body).json()) as ThumbnailState;

    return state?.solutionId === solutionId ? state : null;
  } catch {
    return null;
  }
}

async function writeState(env: Env, state: ThumbnailState): Promise<void> {
  await env.THUMBNAILS_BUCKET.put(statePath(state.solutionId), JSON.stringify(state), {
    httpMetadata: {
      contentType: "application/json; charset=utf-8",
      cacheControl: "no-store"
    }
  });
}

function maxAgeMs(env: Env): number {
  const days = Number(env.THUMBNAIL_MAX_AGE_DAYS || DEFAULT_MAX_AGE_DAYS);
  const safeDays = Number.isFinite(days) && days > 0 ? days : DEFAULT_MAX_AGE_DAYS;

  return safeDays * 24 * 60 * 60 * 1000;
}

function cronBatchSize(env: Env): number {
  const size = Number(env.THUMBNAIL_CRON_BATCH_SIZE || DEFAULT_CRON_BATCH_SIZE);

  return Number.isFinite(size) && size > 0 ? Math.floor(size) : DEFAULT_CRON_BATCH_SIZE;
}

export function isStateStale(
  state: ThumbnailState | null,
  sourceUrlHash: string,
  now: number,
  staleAfterMs: number
): boolean {
  if (!state || state.status !== "ready" || state.sourceUrlHash !== sourceUrlHash || !state.capturedAt) {
    return true;
  }

  const capturedAt = Date.parse(state.capturedAt);

  return !Number.isFinite(capturedAt) || now - capturedAt >= staleAfterMs;
}

export function looksLikeBlockedPage(content: string): boolean {
  const normalized = content.replace(/\s+/g, " ").trim().toLowerCase();

  return (
    /<title>\s*(403|401|forbidden|access denied|request blocked|just a moment)/i.test(content) ||
    /\b403\s*forbidden\b/.test(normalized) ||
    /\b401\s*unauthorized\b/.test(normalized) ||
    /\baccess denied\b/.test(normalized) ||
    /\brequest blocked\b/.test(normalized) ||
    /\benable javascript and cookies\b/.test(normalized)
  );
}

function browserPagePayload(url: string): Record<string, unknown> {
  return {
    url,
    userAgent: BROWSER_USER_AGENT,
    gotoOptions: {
      waitUntil: "networkidle2"
    }
  };
}

async function assertBrowserCanReadSource(source: ThumbnailSource, env: Env): Promise<void> {
  const response = await env.BROWSER.quickAction("content", browserPagePayload(source.url));

  if (!response.ok) {
    throw new Error(`Browser Run content check returned ${response.status}.`);
  }

  const content = await response.text();

  if (looksLikeBlockedPage(content)) {
    throw new Error("Browser Run reached a blocked or forbidden page.");
  }
}

async function fetchThumbnailSources(env: Env, solutionId?: string): Promise<ThumbnailSource[]> {
  const baseUrl = env.INTERNAL_API_BASE_URL?.trim().replace(/\/+$/, "");

  if (!baseUrl || !env.THUMBNAIL_INTERNAL_SECRET?.trim()) {
    throw new Error("Internal thumbnail source API is not configured.");
  }

  const url = new URL(`${baseUrl}/api/internal/thumbnail-sources`);

  if (solutionId) {
    url.searchParams.set("solution_id", solutionId);
  }

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${env.THUMBNAIL_INTERNAL_SECRET}`
    }
  });

  if (!response.ok) {
    throw new Error(`Unable to fetch thumbnail sources: ${response.status}`);
  }

  const data = (await response.json()) as { sources?: ThumbnailSource[] };

  return Array.isArray(data.sources) ? data.sources : [];
}

async function captureAndStore(source: ThumbnailSource, env: Env): Promise<void> {
  const sourceUrlHash = await hashText(source.url);

  await writeState(env, {
    solutionId: source.solutionId,
    status: "refreshing",
    sourceUrlHash
  });

  try {
    if (!isCaptureUrlAllowed(source.url, source.domain)) {
      throw new Error("Capture URL is not allowed.");
    }

    await assertBrowserCanReadSource(source, env);

    const screenshot = await env.BROWSER.quickAction("screenshot", {
      ...browserPagePayload(source.url),
      screenshotOptions: {
        type: "jpeg",
        quality: 78
      }
    });

    if (!screenshot.ok) {
      throw new Error(`Browser Run returned ${screenshot.status}.`);
    }

    const image = await screenshot.arrayBuffer();
    const capturedAt = new Date().toISOString();

    await env.THUMBNAILS_BUCKET.put(thumbnailPath(source.solutionId), image, {
      httpMetadata: {
        contentType: "image/jpeg",
        cacheControl: IMAGE_CACHE_CONTROL
      },
      customMetadata: {
        capturedAt,
        sourceUrlHash,
        sourceUrl: source.url
      }
    });
    await writeState(env, {
      solutionId: source.solutionId,
      status: "ready",
      capturedAt,
      sourceUrlHash
    });
    await defaultCache().delete(cacheRequestForSolution(source.solutionId));
  } catch (error) {
    await writeState(env, {
      solutionId: source.solutionId,
      status: "error",
      capturedAt: new Date().toISOString(),
      sourceUrlHash,
      error: error instanceof Error ? error.message : "Unknown capture error."
    });
    await defaultCache().delete(cacheRequestForSolution(source.solutionId));
  }
}

async function serveThumbnail(solutionId: string, env: Env): Promise<Response> {
  const cacheKey = cacheRequestForSolution(solutionId);
  const state = await readState(env, solutionId);

  if (state?.status === "error") {
    await defaultCache().delete(cacheKey);

    return jsonError(404, "THUMBNAIL_NOT_READY", "Thumbnail is not ready yet.");
  }

  const cached = await defaultCache().match(cacheKey);

  if (cached) {
    return cached;
  }

  const object = await env.THUMBNAILS_BUCKET.get(thumbnailPath(solutionId));

  if (!object?.body) {
    return jsonError(404, "THUMBNAIL_NOT_READY", "Thumbnail is not ready yet.");
  }

  const headers = new Headers();

  object.writeHttpMetadata?.(headers);
  headers.set("Content-Type", headers.get("Content-Type") || object.httpMetadata?.contentType || "image/jpeg");
  headers.set("Cache-Control", headers.get("Cache-Control") || object.httpMetadata?.cacheControl || IMAGE_CACHE_CONTROL);
  headers.set("X-Content-Type-Options", "nosniff");

  const response = new Response(object.body, {
    headers
  });

  await defaultCache().put(cacheKey, response.clone());

  return response;
}

async function refreshThumbnail(
  solutionId: string,
  request: Request,
  env: Env,
  context: ExecutionContextLike
): Promise<Response> {
  if (env.REFRESH_RATE_LIMITER) {
    const clientId = request.headers.get("X-Fluxperf-Client-Id")?.trim() || "internal";
    const rateLimit = await env.REFRESH_RATE_LIMITER.limit({
      key: `${clientId}:${solutionId}`
    });

    if (!rateLimit.success) {
      return jsonError(429, "REFRESH_RATE_LIMITED", "Thumbnail refresh is rate limited.");
    }
  }

  const [source] = await fetchThumbnailSources(env, solutionId);

  if (!source) {
    return jsonError(404, "THUMBNAIL_SOURCE_NOT_FOUND", "No active website solution matches this id.");
  }

  context.waitUntil(captureAndStore(source, env));

  return json(
    {
      status: "refreshing",
      solutionId
    },
    { status: 202 }
  );
}

async function scheduledRefresh(env: Env, context: ExecutionContextLike): Promise<void> {
  const sources = await fetchThumbnailSources(env);
  const batchSize = cronBatchSize(env);
  const now = Date.now();
  const staleAfterMs = maxAgeMs(env);
  let scheduled = 0;

  for (const source of sources) {
    if (scheduled >= batchSize) {
      return;
    }

    if (!isCaptureUrlAllowed(source.url, source.domain)) {
      continue;
    }

    const sourceUrlHash = await hashText(source.url);
    const state = await readState(env, source.solutionId);

    if (isStateStale(state, sourceUrlHash, now, staleAfterMs)) {
      scheduled += 1;
      context.waitUntil(captureAndStore(source, env));
    }
  }
}

export default {
  async fetch(request: Request, env: Env, context: ExecutionContextLike): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      return json({
        status: "ok",
        r2: Boolean(env.THUMBNAILS_BUCKET),
        browser: Boolean(env.BROWSER)
      });
    }

    const route = solutionIdFromPath(url.pathname);

    if (!route?.solutionId) {
      return jsonError(404, "NOT_FOUND", "Route not found.");
    }

    if (!hasInternalAccess(request, env)) {
      return jsonError(401, "INTERNAL_AUTH_REQUIRED", "Internal authentication required.");
    }

    if (request.method === "GET" && !route.isRefresh) {
      return serveThumbnail(route.solutionId, env);
    }

    if (request.method === "POST" && route.isRefresh) {
      return refreshThumbnail(route.solutionId, request, env, context);
    }

    return jsonError(405, "METHOD_NOT_ALLOWED", "Method not allowed.");
  },

  async scheduled(_event: unknown, env: Env, context: ExecutionContextLike): Promise<void> {
    await scheduledRefresh(env, context);
  }
};
