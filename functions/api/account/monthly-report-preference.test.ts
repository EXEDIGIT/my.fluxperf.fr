import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./monthly-report-preference";
import { findClientForEmailInWorkbook } from "../../lib/clients";
import { readGoogleWorkbookValues, updateGoogleSheetValues } from "../../lib/googleSheets";
import type { PagesContext } from "../../lib/types";

vi.mock("../../lib/clients", () => ({
  findClientForEmailInWorkbook: vi.fn()
}));

vi.mock("../../lib/googleSheets", () => ({
  readGoogleWorkbookValues: vi.fn(),
  updateGoogleSheetValues: vi.fn(async () => ({ updatedRows: 1 }))
}));

function context(payload: unknown, email = "alice@alpha.test"): PagesContext {
  return {
    request: new Request(`https://my.fluxperf.fr/api/account/monthly-report-preference?email=${encodeURIComponent(email)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
    env: { APP_ENV: "development" }
  };
}

describe("POST /api/account/monthly-report-preference", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue({
      clients: [],
      contacts: [
        ["contact_id", "client_id", "email", "statut_contact", "bilan_mensuel_actif"],
        ["CON-1", "CLI-1", "alice@alpha.test", "Actif", "Oui"],
        ["CON-2", "CLI-1", "bob@alpha.test", "Actif", "Oui"]
      ],
      solutions: [],
      actions: []
    });
    vi.mocked(findClientForEmailInWorkbook).mockReturnValue({
      status: "ok",
      client: { id: "CLI-1" }
    } as ReturnType<typeof findClientForEmailInWorkbook>);
  });

  it("updates only the authenticated contact's Q-column preference", async () => {
    const response = await onRequestPost(context({ enabled: false }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ enabled: false });
    expect(updateGoogleSheetValues).toHaveBeenCalledWith(expect.anything(), "Contacts!Q2:Q2", [["Non"]]);
  });

  it("never falls back to another contact belonging to the same organisation", async () => {
    const response = await onRequestPost(context({ enabled: false }, "mallory@alpha.test"));

    expect(response.status).toBe(404);
    expect(updateGoogleSheetValues).not.toHaveBeenCalled();
  });

  it("validates the preference payload", async () => {
    const response = await onRequestPost(context({ enabled: "Non" }));

    expect(response.status).toBe(400);
    expect(updateGoogleSheetValues).not.toHaveBeenCalled();
  });
});
