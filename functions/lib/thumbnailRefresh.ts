import { isWebsiteSolutionName } from "./adminOptions";
import { thumbnailSourceUrl } from "./clients";
import type { AppEnv } from "./types";

export type ThumbnailRefreshInput = {
  clientId: string;
  solutionId: string;
  name: string;
  domain?: string;
  urlOrIndication: string;
};

export type ThumbnailRefreshResult =
  | { status: "skipped"; reason: "not_website" | "not_configured" | "not_active" | "unchanged" }
  | { status: "ready" }
  | { status: "failed"; statusCode?: number };

type Fetcher = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

function workerBaseUrl(env: AppEnv): string | null {
  const value = env.THUMBNAIL_WORKER_URL?.trim();

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);

    return ["https:", "http:"].includes(url.protocol) ? url.href.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

function isCompatibleWebsiteName(value: string): boolean {
  if (isWebsiteSolutionName(value)) {
    return true;
  }

  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[•_-]+/g, " ")
    .replace(/\s+/g, " ");

  return /(?:^| )site (web|e shop|eshop)$/.test(normalized);
}

export function canRefreshWebsiteThumbnail(input: ThumbnailRefreshInput): boolean {
  return Boolean(
    input.clientId.trim() &&
      input.solutionId.trim() &&
      isCompatibleWebsiteName(input.name) &&
      thumbnailSourceUrl(input.urlOrIndication, input.domain ?? "")
  );
}

export function shouldRefreshWebsiteThumbnail(
  previous: ThumbnailRefreshInput,
  next: ThumbnailRefreshInput
): boolean {
  if (!canRefreshWebsiteThumbnail(next)) {
    return false;
  }

  if (!canRefreshWebsiteThumbnail(previous)) {
    return true;
  }

  return (
    thumbnailSourceUrl(previous.urlOrIndication, previous.domain ?? "") !==
    thumbnailSourceUrl(next.urlOrIndication, next.domain ?? "")
  );
}

export async function refreshWebsiteThumbnail(
  env: AppEnv,
  input: ThumbnailRefreshInput,
  fetcher: Fetcher = fetch
): Promise<ThumbnailRefreshResult> {
  if (!canRefreshWebsiteThumbnail(input)) {
    return { status: "skipped", reason: "not_website" };
  }

  const baseUrl = workerBaseUrl(env);
  const secret = env.THUMBNAIL_INTERNAL_SECRET?.trim();

  if (!baseUrl || !secret) {
    return { status: "skipped", reason: "not_configured" };
  }

  try {
    const response = await fetcher(`${baseUrl}/thumbnail/${encodeURIComponent(input.solutionId)}/refresh`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
        "X-Fluxperf-Client-Id": input.clientId
      }
    });

    if (response.ok) {
      return { status: "ready" };
    }

    console.error("admin_thumbnail_refresh_failed", {
      solutionId: input.solutionId,
      status: response.status
    });

    return { status: "failed", statusCode: response.status };
  } catch (error) {
    console.error("admin_thumbnail_refresh_failed", {
      solutionId: input.solutionId,
      message: error instanceof Error ? error.message : "Unknown thumbnail refresh error"
    });

    return { status: "failed" };
  }
}
