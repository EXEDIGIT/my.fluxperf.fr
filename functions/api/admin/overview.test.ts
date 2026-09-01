import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "./overview";
import { requireAdmin } from "../../lib/adminAuth";
import { readGoogleParametersValues, readGoogleWorkbookValues } from "../../lib/googleSheets";
import type { PagesContext } from "../../lib/types";

vi.mock("../../lib/adminAuth", () => ({
  requireAdmin: vi.fn(async () => ({ email: "admin@fluxperf.fr" }))
}));

vi.mock("../../lib/googleSheets", () => ({
  readGoogleWorkbookValues: vi.fn(async () => ({ clients: [], contacts: [], solutions: [], actions: [], connections: [], documents: [] })),
  readGoogleParametersValues: vi.fn(async () => [])
}));

vi.mock("../../lib/adminOptions", () => ({
  buildAdminSolutionOptions: vi.fn(() => [{ type: "visibility_acquisition", label: "Visibilité" }])
}));

vi.mock("../../lib/adminWorkbook", () => ({
  buildAdminClientList: vi.fn(() => [{ id: "CLI-1", companyName: "Alpha" }]),
  buildAdminDashboard: vi.fn(() => ({ generatedAt: "2026-09-01" })),
  buildAdminClientDetail: vi.fn(() => ({ id: "CLI-1", companyName: "Alpha" }))
}));

function context(url = "https://example.com/api/admin/overview"): PagesContext {
  return {
    request: new Request(url),
    env: { APP_ENV: "production" }
  };
}

describe("GET /api/admin/overview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("builds all admin data from one workbook read", async () => {
    const response = await onRequestGet(context("https://example.com/api/admin/overview?clientId=CLI-1"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      clients: [{ id: "CLI-1" }],
      selectedClient: { id: "CLI-1" }
    });
    expect(vi.mocked(requireAdmin)).toHaveBeenCalledOnce();
    expect(vi.mocked(readGoogleWorkbookValues)).toHaveBeenCalledOnce();
    expect(vi.mocked(readGoogleParametersValues)).toHaveBeenCalledOnce();
  });
});
