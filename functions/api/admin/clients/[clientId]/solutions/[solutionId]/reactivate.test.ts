import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./reactivate";
import {
  readGoogleWorkbookValues,
  updateGoogleSheetValues
} from "../../../../../../lib/googleSheets";
import type { ClientWorkbookValues } from "../../../../../../lib/clients";
import type { PagesContext } from "../../../../../../lib/types";

vi.mock("../../../../../../lib/googleSheets", () => ({
  readGoogleWorkbookValues: vi.fn(),
  updateGoogleSheetValues: vi.fn(async () => ({ updatedRows: 1 })),
  appendGoogleSheetValues: vi.fn(async () => ({ updatedRows: 1 })),
  getGoogleWriteRanges: vi.fn(() => ({ actions: "Actions!A:J" }))
}));

const workbook: ClientWorkbookValues = {
  clients: [
    [
      "client_id",
      "nom_compte",
      "organisation",
      "statut_client",
      "espace_client_actif",
      "contact_principal_id",
      "email_principal",
      "nb_services_actifs",
      "date_creation",
      "date_mise_a_jour",
      "notes"
    ],
    ["CLI-1", "Client Un", "Alpha", "Actif", "Oui", "CON-1", "alpha@example.com", "1", "01/01/2026", "10/07/2026", ""]
  ],
  contacts: [],
  solutions: [
    ["solution_id", "client_id", "type_solution", "statut_solution", "nom_solution", "domaine", "url_ou_indication", "date_activation", "notes"],
    ["SOL-ACTIVE", "CLI-1", "Flux Visibilite & Acquisition", "Actif", "Site web", "alpha.fr", "alpha.fr", "01/07/2026", ""],
    ["SOL-INACTIVE", "CLI-1", "Flux Automatisation & IA", "Inactif", "Workflow", "", "Centralisation", "01/07/2026", ""],
    ["SOL-PAUSED", "CLI-1", "Flux Assistant IA", "En pause", "Copilote", "", "", "01/07/2026", ""]
  ],
  actions: [],
  connections: []
};

function context(clientId: string, solutionId: string): PagesContext {
  return {
    request: new Request("https://my.fluxperf.fr/api/admin/clients/CLI-1/solutions/SOL-1/reactivate?email=admin@fluxperf.fr", {
      method: "POST"
    }),
    env: {
      APP_ENV: "development",
      DEV_ADMIN_EMAIL: "admin@fluxperf.fr"
    },
    params: {
      clientId,
      solutionId
    }
  };
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("POST /api/admin/clients/:clientId/solutions/:solutionId/reactivate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue(workbook);
  });

  it("reactivates an inactive solution and updates the active solution count", async () => {
    const response = await onRequestPost(context("CLI-1", "SOL-INACTIVE"));
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "reactivated",
      clientId: "CLI-1",
      solutionId: "SOL-INACTIVE",
      activeSolutions: 2
    });
    expect(vi.mocked(updateGoogleSheetValues)).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      "Solutions!D3:D3",
      [["Actif"]]
    );
    expect(vi.mocked(updateGoogleSheetValues)).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      "Clients!H2:H2",
      [["2"]]
    );
  });

  it("rejects a solution that is already active", async () => {
    const response = await onRequestPost(context("CLI-1", "SOL-ACTIVE"));
    const body = await responseBody(response);

    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({ code: "ADMIN_SOLUTION_ALREADY_ACTIVE" });
    expect(vi.mocked(updateGoogleSheetValues)).not.toHaveBeenCalled();
  });

  it("rejects a status that is not reactivatable", async () => {
    const response = await onRequestPost(context("CLI-1", "SOL-PAUSED"));
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "ADMIN_SOLUTION_REACTIVATE_NOT_ALLOWED" });
    expect(vi.mocked(updateGoogleSheetValues)).not.toHaveBeenCalled();
  });

  it("returns 404 when the client does not exist", async () => {
    const response = await onRequestPost(context("CLI-404", "SOL-INACTIVE"));
    const body = await responseBody(response);

    expect(response.status).toBe(404);
    expect(body.error).toMatchObject({ code: "ADMIN_CLIENT_NOT_FOUND" });
    expect(vi.mocked(updateGoogleSheetValues)).not.toHaveBeenCalled();
  });

  it("returns 404 when the solution does not exist", async () => {
    const response = await onRequestPost(context("CLI-1", "SOL-404"));
    const body = await responseBody(response);

    expect(response.status).toBe(404);
    expect(body.error).toMatchObject({ code: "ADMIN_SOLUTION_NOT_FOUND" });
    expect(vi.mocked(updateGoogleSheetValues)).not.toHaveBeenCalled();
  });
});
