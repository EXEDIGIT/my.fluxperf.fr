import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./test";
import { requireAdmin } from "../../../lib/adminAuth";
import type { PagesContext } from "../../../lib/types";

vi.mock("../../../lib/adminAuth", () => ({ requireAdmin: vi.fn() }));

function context(payload: unknown): PagesContext {
  return {
    request: new Request("https://my.fluxperf.fr/api/admin/monthly-reports/test", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) }),
    env: { APP_ENV: "production", MONTHLY_REPORT_WORKER_URL: "https://worker.example.test/", MONTHLY_REPORT_INTERNAL_SECRET: "secret" }
  };
}

describe("POST /api/admin/monthly-reports/test", () => {
  beforeEach(() => { vi.clearAllMocks(); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("requires an administrator before contacting the Worker", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(new Response(null, { status: 403 }));
    const fetchMock = vi.fn(); vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestPost(context({ clientId: "CLI-1" }));

    expect(response.status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("forwards only an explicit test client to the internal Worker endpoint", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ email: "admin@fluxperf.fr" });
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ status: "sent", recipientCount: 2, sentCount: 2, analyticsStatus: "available", availableProperties: 2 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const response = await onRequestPost(context({ clientId: "CLI-1" }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "sent", recipientCount: 2, sentCount: 2, analyticsStatus: "available", availableProperties: 2 });
    expect(fetchMock).toHaveBeenCalledWith("https://worker.example.test/internal/test", expect.objectContaining({ headers: expect.objectContaining({ "X-Fluxperf-Internal-Secret": "secret" }), body: JSON.stringify({ clientId: "CLI-1" }) }));
  });
});
