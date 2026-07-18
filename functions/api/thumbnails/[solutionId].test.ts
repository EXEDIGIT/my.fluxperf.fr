import { afterEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "./[solutionId]";
import { onRequestPost as onRefreshRequestPost } from "./[solutionId]/refresh";
import type { AppEnv, PagesContext } from "../../lib/types";

function context(solutionId: string, env: AppEnv = {}, suffix = ""): PagesContext {
  return {
    request: new Request(`https://my.fluxperf.fr/api/thumbnails/${solutionId}${suffix}?email=contact@a2-cm.fr`),
    env: {
      APP_ENV: "development",
      THUMBNAIL_WORKER_URL: "https://thumbnail-worker.example",
      THUMBNAIL_INTERNAL_SECRET: "internal-secret",
      ...env
    },
    params: {
      solutionId
    }
  };
}

async function bodyOf(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("GET /api/thumbnails/:solutionId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("proxies an owned website thumbnail through the internal worker", async () => {
    const workerFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      new Response("jpeg", {
        headers: {
          "Content-Type": "image/jpeg",
          "Cache-Control": "private, max-age=86400"
        }
      })
    );

    vi.stubGlobal("fetch", workerFetch);

    const response = await onRequestGet(context("SOL-DEMO-1"));

    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(workerFetch).toHaveBeenCalledWith("https://thumbnail-worker.example/thumbnail/SOL-DEMO-1", {
      method: "GET",
      headers: {
        Authorization: "Bearer internal-secret",
        "X-Fluxperf-Client-Id": "a2cm"
      }
    });
  });

  it("rejects a solution id that is not attached to the client", async () => {
    const response = await onRequestGet(context("SOL-UNKNOWN"));
    const body = await bodyOf(response);

    expect(response.status).toBe(403);
    expect(body.error).toMatchObject({ code: "SOLUTION_NOT_ALLOWED" });
  });

  it("does not proxy placeholders to the thumbnail worker", async () => {
    const response = await onRequestGet(context("SOL-DEMO-2"));
    const body = await bodyOf(response);

    expect(response.status).toBe(404);
    expect(body.error).toMatchObject({ code: "THUMBNAIL_NOT_AVAILABLE" });
  });
});

describe("POST /api/thumbnails/:solutionId", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requests a refresh for an owned website solution", async () => {
    const workerFetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json(
        {
          status: "refreshing",
          solutionId: "SOL-DEMO-1"
        },
        { status: 202 }
      )
    );

    vi.stubGlobal("fetch", workerFetch);

    const response = await onRefreshRequestPost(context("SOL-DEMO-1", {}, "/refresh"));
    const body = await bodyOf(response);

    expect(response.status).toBe(202);
    expect(body).toMatchObject({ status: "refreshing", solutionId: "SOL-DEMO-1" });
    expect(workerFetch).toHaveBeenCalledWith("https://thumbnail-worker.example/thumbnail/SOL-DEMO-1/refresh", {
      method: "POST",
      headers: {
        Authorization: "Bearer internal-secret",
        "X-Fluxperf-Client-Id": "a2cm"
      }
    });
  });
});
