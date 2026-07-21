import { beforeEach, describe, expect, it, vi } from "vitest";
import { logAdminAction } from "./adminActions";
import { appendGoogleSheetValues } from "./googleSheets";

vi.mock("./googleSheets", () => ({
  appendGoogleSheetValues: vi.fn(async () => ({ updatedRows: 1 })),
  getGoogleWriteRanges: vi.fn(() => ({ actions: "Actions!A:J" }))
}));

describe("admin action log", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("writes an admin action to the Actions tab", async () => {
    await logAdminAction(
      {},
      {
        clientId: "CLI-1",
        type: "admin_client_reactivated",
        label: "Acces client reactive",
        actorEmail: "admin@fluxperf.fr"
      }
    );

    expect(vi.mocked(appendGoogleSheetValues)).toHaveBeenCalledWith(
      {},
      "Actions!A:J",
      [
        expect.arrayContaining([
          expect.stringMatching(/^ACT-/),
          "CLI-1",
          expect.any(String),
          "admin_client_reactivated",
          "Acces client reactive",
          "",
          "admin@fluxperf.fr",
          "fp-console"
        ])
      ]
    );
  });

  it("does not throw when action logging fails", async () => {
    vi.mocked(appendGoogleSheetValues).mockRejectedValueOnce(new Error("Google unavailable"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      logAdminAction(
        {},
        {
          clientId: "CLI-1",
          type: "admin_client_created",
          label: "Client cree depuis la console interne",
          actorEmail: "admin@fluxperf.fr"
        }
      )
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalledWith(
      "admin_action_log_failed",
      expect.objectContaining({ clientId: "CLI-1" })
    );
    consoleError.mockRestore();
  });
});
