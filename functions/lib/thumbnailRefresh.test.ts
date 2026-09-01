import { describe, expect, it, vi } from "vitest";
import {
  canRefreshWebsiteThumbnail,
  refreshWebsiteThumbnail,
  shouldRefreshWebsiteThumbnail
} from "./thumbnailRefresh";

const websiteInput = {
  clientId: "CLI-1",
  solutionId: "SOL-1",
  name: "Site web",
  domain: "example.com",
  urlOrIndication: "www.example.com"
};

describe("thumbnailRefresh", () => {
  it("accepts active website inputs, including legacy prefixed names", () => {
    expect(canRefreshWebsiteThumbnail(websiteInput)).toBe(true);
    expect(
      canRefreshWebsiteThumbnail({
        ...websiteInput,
        name: "Flux Visibilite & Acquisition • Site e-shop"
      })
    ).toBe(true);
  });

  it("does not request a thumbnail for an indication or a non-website solution", () => {
    expect(
      canRefreshWebsiteThumbnail({
        ...websiteInput,
        name: "Publicité Google Ads",
        urlOrIndication: "Centralisation KPIs"
      })
    ).toBe(false);
  });

  it("refreshes an existing website only when its website source changes", () => {
    expect(shouldRefreshWebsiteThumbnail(websiteInput, { ...websiteInput })).toBe(false);
    expect(
      shouldRefreshWebsiteThumbnail(websiteInput, {
        ...websiteInput,
        urlOrIndication: "https://shop.example.com"
      })
    ).toBe(true);
  });

  it("skips a website when the thumbnail service is not configured", async () => {
    const fetcher = vi.fn();

    await expect(refreshWebsiteThumbnail({}, websiteInput, fetcher)).resolves.toEqual({
      status: "skipped",
      reason: "not_configured"
    });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("calls the private worker with the solution and client ids", async () => {
    const fetcher = vi.fn(async () => new Response(JSON.stringify({ status: "ready" }), { status: 200 }));

    await expect(
      refreshWebsiteThumbnail(
        {
          THUMBNAIL_WORKER_URL: "https://thumbnail-worker.example/",
          THUMBNAIL_INTERNAL_SECRET: "internal-secret"
        },
        websiteInput,
        fetcher
      )
    ).resolves.toEqual({ status: "ready" });

    expect(fetcher).toHaveBeenCalledWith("https://thumbnail-worker.example/thumbnail/SOL-1/refresh", {
      method: "POST",
      headers: {
        Authorization: "Bearer internal-secret",
        "X-Fluxperf-Client-Id": "CLI-1"
      }
    });
  });

  it("reports a failed capture without throwing into the administration route", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const fetcher = vi.fn(async () => new Response("blocked", { status: 502 }));

    await expect(
      refreshWebsiteThumbnail(
        {
          THUMBNAIL_WORKER_URL: "https://thumbnail-worker.example",
          THUMBNAIL_INTERNAL_SECRET: "internal-secret"
        },
        websiteInput,
        fetcher
      )
    ).resolves.toEqual({ status: "failed", statusCode: 502 });

    consoleError.mockRestore();
  });
});
