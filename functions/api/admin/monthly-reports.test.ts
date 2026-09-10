import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "./monthly-reports";
import { requireAdmin } from "../../lib/adminAuth";
import { listMonthlyReports } from "../../lib/monthlyReports";
import type { PagesContext } from "../../lib/types";

vi.mock("../../lib/adminAuth", () => ({ requireAdmin: vi.fn() }));
vi.mock("../../lib/monthlyReports", () => ({ listMonthlyReports: vi.fn() }));

function context(): PagesContext {
  return { request: new Request("https://my.fluxperf.fr/api/admin/monthly-reports"), env: { APP_ENV: "production" } };
}

describe("GET /api/admin/monthly-reports", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("does not expose D1 report data to a non-admin", async () => {
    vi.mocked(requireAdmin).mockResolvedValue(new Response(null, { status: 403 }));

    const response = await onRequestGet(context());

    expect(response.status).toBe(403);
    expect(listMonthlyReports).not.toHaveBeenCalled();
  });

  it("returns only the summarized report view after admin authorization", async () => {
    vi.mocked(requireAdmin).mockResolvedValue({ email: "admin@fluxperf.fr" });
    vi.mocked(listMonthlyReports).mockResolvedValue([{ id: "R-1", companyName: "Alpha" }] as never);

    const response = await onRequestGet(context());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ reports: [{ id: "R-1", companyName: "Alpha" }] });
  });
});
