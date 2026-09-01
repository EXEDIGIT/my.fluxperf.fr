import { afterEach, describe, expect, it, vi } from "vitest";
import { browserPagePayload, isCaptureUrlAllowed, isStateStale, looksLikeBlockedPage } from "./index";
import worker from "./index";

describe("thumbnail worker guards", () => {
  it("accepts the configured domain and its subdomains", () => {
    expect(isCaptureUrlAllowed("https://www.hbint.com", "hbint.com")).toBe(true);
    expect(isCaptureUrlAllowed("https://trial.hbint.com", "hbint.com")).toBe(true);
  });

  it("rejects private, local and mismatched capture targets", () => {
    expect(isCaptureUrlAllowed("http://localhost:5173", "localhost")).toBe(false);
    expect(isCaptureUrlAllowed("https://127.0.0.1", "127.0.0.1")).toBe(false);
    expect(isCaptureUrlAllowed("https://192.168.1.20", "192.168.1.20")).toBe(false);
    expect(isCaptureUrlAllowed("https://example.com", "hbint.com")).toBe(false);
    expect(isCaptureUrlAllowed("data:text/html,hello", "hbint.com")).toBe(false);
  });

  it("detects missing, changed or expired states", () => {
    const now = Date.parse("2026-07-18T12:00:00.000Z");
    const staleAfterMs = 7 * 24 * 60 * 60 * 1000;

    expect(isStateStale(null, "hash", now, staleAfterMs)).toBe(true);
    expect(
      isStateStale(
        {
          solutionId: "SOL-0001",
          status: "ready",
          capturedAt: "2026-07-18T10:00:00.000Z",
          sourceUrlHash: "other"
        },
        "hash",
        now,
        staleAfterMs
      )
    ).toBe(true);
    expect(
      isStateStale(
        {
          solutionId: "SOL-0001",
          status: "ready",
          capturedAt: "2026-07-10T10:00:00.000Z",
          sourceUrlHash: "hash"
        },
        "hash",
        now,
        staleAfterMs
      )
    ).toBe(true);
    expect(
      isStateStale(
        {
          solutionId: "SOL-0001",
          status: "ready",
          capturedAt: "2026-07-18T10:00:00.000Z",
          sourceUrlHash: "hash"
        },
        "hash",
        now,
        staleAfterMs
      )
    ).toBe(false);
  });

  it("detects blocked pages before storing a screenshot", () => {
    expect(looksLikeBlockedPage("<html><head><title>403 Forbidden</title></head><body>Forbidden</body></html>")).toBe(
      true
    );
    expect(looksLikeBlockedPage("<html><head><title>Accueil</title></head><body>Bienvenue</body></html>")).toBe(
      false
    );
  });

  it("does not wait indefinitely for third-party homepage connections", () => {
    expect(browserPagePayload("https://www.villadcm.fr/")).toMatchObject({
      url: "https://www.villadcm.fr/",
      gotoOptions: {
        waitUntil: ["domcontentloaded", "networkidle2"],
        timeout: 20_000
      },
      waitForTimeout: 1_000
    });
  });

  it("completes a manual refresh before reporting it ready", async () => {
    const cacheDelete = vi.fn(async () => true);
    const bucketPut = vi.fn(async () => undefined);
    const quickAction = vi
      .fn()
      .mockResolvedValueOnce(new Response("<html><title>Villa DCM</title></html>"))
      .mockResolvedValueOnce(new Response("image", { headers: { "Content-Type": "image/jpeg" } }));
    const source = {
      solutionId: "SOL-01092026-BD9A",
      clientId: "CLI-01092026-5FC2",
      type: "visibility_acquisition",
      typeLabel: "Flux Visibilité & Acquisition",
      name: "Site web",
      domain: "villadcm.fr",
      url: "https://www.villadcm.fr/"
    };

    vi.stubGlobal("caches", { default: { delete: cacheDelete } });
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ sources: [source] })));

    const response = await worker.fetch(
      new Request("https://thumbnail-worker.example/thumbnail/SOL-01092026-BD9A/refresh", {
        method: "POST",
        headers: { Authorization: "Bearer internal-secret" }
      }),
      {
        THUMBNAILS_BUCKET: { get: vi.fn(), put: bucketPut, delete: vi.fn() },
        BROWSER: { quickAction },
        INTERNAL_API_BASE_URL: "https://my.fluxperf.fr",
        THUMBNAIL_INTERNAL_SECRET: "internal-secret"
      },
      { waitUntil: vi.fn() }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "ready", solutionId: source.solutionId });
    expect(quickAction).toHaveBeenCalledTimes(2);
    expect(bucketPut).toHaveBeenCalledWith(
      "solutions/SOL-01092026-BD9A/homepage.jpg",
      expect.any(ArrayBuffer),
      expect.objectContaining({ httpMetadata: expect.objectContaining({ contentType: "image/jpeg" }) })
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("purges only one solution after internal authentication", async () => {
    const cacheDelete = vi.fn(async () => true);
    const bucketDelete = vi.fn(async () => undefined);
    vi.stubGlobal("caches", { default: { delete: cacheDelete } });
    const response = await worker.fetch(
      new Request("https://thumbnail-worker.example/thumbnail/SOL-0001", {
        method: "DELETE",
        headers: { Authorization: "Bearer internal-secret" }
      }),
      {
        THUMBNAILS_BUCKET: { get: vi.fn(), put: vi.fn(), delete: bucketDelete },
        BROWSER: { quickAction: vi.fn() },
        INTERNAL_API_BASE_URL: "https://my.fluxperf.fr",
        THUMBNAIL_INTERNAL_SECRET: "internal-secret"
      },
      { waitUntil: vi.fn() }
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "purged", solutionId: "SOL-0001" });
    expect(bucketDelete).toHaveBeenCalledWith(["solutions/SOL-0001/homepage.jpg", "solutions/SOL-0001/state.json"]);
    expect(cacheDelete).toHaveBeenCalledTimes(1);
  });

  it("does not expose the purge endpoint without the internal secret", async () => {
    const response = await worker.fetch(
      new Request("https://thumbnail-worker.example/thumbnail/SOL-0001", { method: "DELETE" }),
      {
        THUMBNAILS_BUCKET: { get: vi.fn(), put: vi.fn(), delete: vi.fn() },
        BROWSER: { quickAction: vi.fn() },
        INTERNAL_API_BASE_URL: "https://my.fluxperf.fr",
        THUMBNAIL_INTERNAL_SECRET: "internal-secret"
      },
      { waitUntil: vi.fn() }
    );

    expect(response.status).toBe(401);
  });
});
