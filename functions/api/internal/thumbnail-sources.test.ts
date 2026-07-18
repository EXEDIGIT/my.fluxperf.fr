import { describe, expect, it } from "vitest";
import { onRequestGet } from "./thumbnail-sources";
import type { AppEnv, PagesContext } from "../../lib/types";

function context(url: string, env: AppEnv = {}, headers: HeadersInit = {}): PagesContext {
  return {
    request: new Request(url, { headers }),
    env: {
      APP_ENV: "development",
      THUMBNAIL_INTERNAL_SECRET: "internal-secret",
      ...env
    }
  };
}

async function bodyOf(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("GET /api/internal/thumbnail-sources", () => {
  it("requires the internal thumbnail secret", async () => {
    const response = await onRequestGet(context("https://my.fluxperf.fr/api/internal/thumbnail-sources"));
    const body = await bodyOf(response);

    expect(response.status).toBe(401);
    expect(body.error).toMatchObject({ code: "INTERNAL_AUTH_REQUIRED" });
  });

  it("returns active website sources for the thumbnail worker", async () => {
    const response = await onRequestGet(
      context("https://my.fluxperf.fr/api/internal/thumbnail-sources", {}, {
        Authorization: "Bearer internal-secret"
      })
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(200);
    expect(body.sources).toEqual([
      {
        solutionId: "SOL-DEMO-1",
        clientId: "a2cm",
        type: "visibility_acquisition",
        typeLabel: "Flux Visibilité & Acquisition",
        name: "Flux Visibilité & Acquisition • Site web",
        domain: "a2-cm.fr",
        url: "https://www.a2-cm.fr/"
      }
    ]);
  });

  it("returns 404 when a specific solution is not capturable", async () => {
    const response = await onRequestGet(
      context("https://my.fluxperf.fr/api/internal/thumbnail-sources?solution_id=SOL-DEMO-2", {}, {
        Authorization: "Bearer internal-secret"
      })
    );
    const body = await bodyOf(response);

    expect(response.status).toBe(404);
    expect(body.error).toMatchObject({ code: "THUMBNAIL_SOURCE_NOT_FOUND" });
  });
});
