import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./brevo-sync";
import { readGoogleWorkbookValues } from "../../../../../../lib/googleSheets";
import { persistBrevoMarketingStatus, syncEligibleBrevoMarketingContact } from "../../../../../../lib/brevoMarketing";

vi.mock("../../../../../../lib/adminAuth", () => ({
  requireAdmin: vi.fn(async () => ({ email: "admin@fluxperf.fr" }))
}));
vi.mock("../../../../../../lib/googleSheets", () => ({
  readGoogleWorkbookValues: vi.fn()
}));
vi.mock("../../../../../../lib/adminWorkbook", () => ({
  findAdminClientRow: vi.fn(() => ({ rowNumber: 2, record: { client_id: "CLI-1", organisation: "Alpha", statut_client: "Actif", espace_client_actif: "Oui" } })),
  findAdminContactRow: vi.fn(() => ({ rowNumber: 3, record: { contact_id: "CON-1", client_id: "CLI-1", email: "alice@alpha.test", brevo_marketing_eligible: "Oui", statut_contact: "Actif" } })),
  parseRows: vi.fn(() => [])
}));
vi.mock("../../../../../../lib/brevoMarketing", () => ({
  isBrevoMarketingEligible: vi.fn(() => true),
  clientAndContactAreMarketingActive: vi.fn(() => true),
  persistBrevoMarketingStatus: vi.fn(async () => undefined),
  syncEligibleBrevoMarketingContact: vi.fn(async () => ({ status: "synced", email: "alice@alpha.test" }))
}));
vi.mock("../../../../../../lib/adminActions", () => ({
  logAdminAction: vi.fn(async () => undefined)
}));

const workbook = {
  clients: [["client_id"], ["CLI-1"]],
  contacts: [["contact_id"], ["CON-1"]],
  solutions: [],
  actions: []
};

describe("POST /api/admin/clients/:clientId/contacts/:contactId/brevo-sync", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue(workbook);
  });

  it("retries an eligible active contact and records its state", async () => {
    const response = await onRequestPost({
      request: new Request("https://my.fluxperf.fr/api/admin/clients/CLI-1/contacts/CON-1/brevo-sync", { method: "POST" }),
      params: { clientId: "CLI-1", contactId: "CON-1" },
      env: { APP_ENV: "development" }
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "synced", clientId: "CLI-1", contactId: "CON-1" });
    expect(vi.mocked(syncEligibleBrevoMarketingContact)).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.anything(),
      [],
      "myfluxperf_admin_retry"
    );
    expect(vi.mocked(persistBrevoMarketingStatus)).toHaveBeenCalledWith(expect.anything(), 3, { status: "synced", email: "alice@alpha.test" });
  });
});
