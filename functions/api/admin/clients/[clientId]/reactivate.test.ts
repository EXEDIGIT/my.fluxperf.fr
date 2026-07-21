import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./reactivate";
import { readGoogleWorkbookValues, updateGoogleSheetValues } from "../../../../lib/googleSheets";
import { unbanSupabaseUserForClient } from "../../../../lib/supabaseAdmin";
import { logAdminAction } from "../../../../lib/adminActions";
import type { ClientWorkbookValues } from "../../../../lib/clients";
import type { PagesContext } from "../../../../lib/types";

vi.mock("../../../../lib/googleSheets", () => ({
  readGoogleWorkbookValues: vi.fn(),
  updateGoogleSheetValues: vi.fn(async () => ({ updatedRows: 1 }))
}));

vi.mock("../../../../lib/supabaseAdmin", () => ({
  unbanSupabaseUserForClient: vi.fn(async (_env: unknown, email: string) => ({ status: "unbanned", email }))
}));

vi.mock("../../../../lib/adminActions", () => ({
  logAdminAction: vi.fn(async () => undefined)
}));

const inactiveWorkbook: ClientWorkbookValues = {
  clients: [
    ["client_id", "statut_client", "espace_client_actif", "email_principal", "date_mise_a_jour"],
    ["CLI-1", "Inactif", "Non", "alpha@example.com", "10/07/2026"]
  ],
  contacts: [],
  solutions: [],
  actions: [],
  connections: []
};

function context(clientId = "CLI-1"): PagesContext {
  return {
    request: new Request("https://my.fluxperf.fr/api/admin/clients/CLI-1/reactivate?email=admin@fluxperf.fr", {
      method: "POST"
    }),
    env: {
      APP_ENV: "development",
      DEV_ADMIN_EMAIL: "admin@fluxperf.fr"
    },
    params: { clientId }
  };
}

describe("POST /api/admin/clients/:clientId/reactivate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue(inactiveWorkbook);
    vi.mocked(unbanSupabaseUserForClient).mockResolvedValue({ status: "unbanned", email: "alpha@example.com" });
  });

  it("reactivates the Google Sheet client and unbans its account", async () => {
    const response = await onRequestPost(context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "reactivated", clientId: "CLI-1", auth: { status: "unbanned" } });
    expect(vi.mocked(updateGoogleSheetValues)).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      "Clients!D2:E2",
      [["Actif", "Oui"]]
    );
    expect(vi.mocked(unbanSupabaseUserForClient)).toHaveBeenCalledWith(expect.any(Object), "alpha@example.com");
    expect(vi.mocked(logAdminAction)).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ type: "admin_client_reactivated", clientId: "CLI-1" })
    );
  });

  it("keeps the Google Sheet reactivation when the account update fails", async () => {
    vi.mocked(unbanSupabaseUserForClient).mockResolvedValue({
      status: "failed",
      email: "alpha@example.com",
      reason: "Auth unavailable"
    });

    const response = await onRequestPost(context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ auth: { status: "failed" } });
    expect(vi.mocked(updateGoogleSheetValues)).toHaveBeenCalled();
  });

  it("rejects an already active client", async () => {
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue({
      ...inactiveWorkbook,
      clients: [inactiveWorkbook.clients[0], ["CLI-1", "Actif", "Oui", "alpha@example.com", "10/07/2026"]]
    });

    const response = await onRequestPost(context());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ error: { code: "ADMIN_CLIENT_ALREADY_ACTIVE" } });
    expect(vi.mocked(updateGoogleSheetValues)).not.toHaveBeenCalled();
  });
});
