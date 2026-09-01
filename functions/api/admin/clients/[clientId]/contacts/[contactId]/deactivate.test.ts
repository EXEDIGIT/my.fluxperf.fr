import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./deactivate";
import { readGoogleWorkbookValues, updateGoogleSheetValues } from "../../../../../../lib/googleSheets";
import { banSupabaseUserForClient } from "../../../../../../lib/supabaseAdmin";

vi.mock("../../../../../../lib/googleSheets", () => ({
  readGoogleWorkbookValues: vi.fn(),
  updateGoogleSheetValues: vi.fn(async () => ({ updatedRows: 1 }))
}));

vi.mock("../../../../../../lib/supabaseAdmin", () => ({
  banSupabaseUserForClient: vi.fn(async (_env: unknown, email: string) => ({ status: "banned", email }))
}));

vi.mock("../../../../../../lib/adminActions", () => ({
  logAdminAction: vi.fn(async () => undefined)
}));

const workbook = {
  clients: [["client_id", "organisation"], ["CLI-1", "Alpha"]],
  contacts: [
    ["contact_id", "client_id", "email", "contact_principal", "statut_contact"],
    ["CON-1", "CLI-1", "alice@alpha.test", "Oui", "Actif"],
    ["CON-2", "CLI-1", "louis@alpha.test", "Non", "Actif"]
  ],
  solutions: [],
  actions: []
};

function context(contactId: string) {
  return {
    request: new Request(`https://my.fluxperf.fr/api/admin/clients/CLI-1/contacts/${contactId}/deactivate?email=admin@fluxperf.fr`, { method: "POST" }),
    params: { clientId: "CLI-1", contactId },
    env: { APP_ENV: "development", DEV_ADMIN_EMAIL: "admin@fluxperf.fr" }
  };
}

describe("POST /api/admin/clients/:clientId/contacts/:contactId/deactivate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue(workbook);
  });

  it("protects the primary contact from individual deactivation", async () => {
    const response = await onRequestPost(context("CON-1"));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({ code: "PRIMARY_CONTACT_PROTECTED" });
    expect(vi.mocked(updateGoogleSheetValues)).not.toHaveBeenCalled();
    expect(vi.mocked(banSupabaseUserForClient)).not.toHaveBeenCalled();
  });

  it("deactivates a secondary contact in Sheets and Supabase", async () => {
    const response = await onRequestPost(context("CON-2"));

    expect(response.status).toBe(200);
    expect(vi.mocked(updateGoogleSheetValues)).toHaveBeenCalledWith(expect.anything(), "Contacts!H3:H3", [["Inactif"]]);
    expect(vi.mocked(banSupabaseUserForClient)).toHaveBeenCalledWith(expect.anything(), "louis@alpha.test");
  });
});
