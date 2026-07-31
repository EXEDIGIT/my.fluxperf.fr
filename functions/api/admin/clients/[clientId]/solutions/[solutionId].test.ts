import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPut } from "./[solutionId]";
import {
  appendGoogleSheetValues,
  readGoogleParametersValues,
  readGoogleWorkbookValues,
  updateGoogleSheetValues
} from "../../../../../lib/googleSheets";
import type { ClientWorkbookValues } from "../../../../../lib/clients";
import type { PagesContext } from "../../../../../lib/types";

vi.mock("../../../../../lib/googleSheets", () => ({
  readGoogleWorkbookValues: vi.fn(),
  readGoogleParametersValues: vi.fn(async () => []),
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
    [
      "solution_id",
      "client_id",
      "type_solution",
      "statut_solution",
      "nom_solution",
      "domaine",
      "url_ou_indication",
      "date_activation",
      "notes",
      "ga4_property_id",
      "google_ads_customer_id"
    ],
    [
      "SOL-1",
      "CLI-1",
      "Flux Visibilite & Acquisition",
      "Inactif",
      "Site web",
      "alpha.fr",
      "alpha.fr",
      "01/07/2026",
      "Conserver cette note",
      "371201585",
      ""
    ]
  ],
  actions: [],
  connections: []
};

function context(clientId: string, solutionId: string, payload: Record<string, unknown>): PagesContext {
  return {
    request: new Request("https://my.fluxperf.fr/api/admin/clients/CLI-1/solutions/SOL-1?email=admin@fluxperf.fr", {
      method: "PUT",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
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

const validPayload = {
  type: "visibility_acquisition",
  name: "Site web",
  urlOrIndication: "www.hbint.com",
  ga4PropertyId: "123456789",
  googleAdsCustomerId: ""
};

describe("PUT /api/admin/clients/:clientId/solutions/:solutionId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue(workbook);
    vi.mocked(readGoogleParametersValues).mockResolvedValue([]);
  });

  it("updates the editable solution fields while preserving its status and raw indication", async () => {
    const response = await onRequestPut(context("CLI-1", "SOL-1", validPayload));
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "updated",
      clientId: "CLI-1",
      solutionId: "SOL-1"
    });
    expect(vi.mocked(updateGoogleSheetValues)).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      "Solutions!C2:C2",
      [[expect.stringContaining("Flux Visibil")]]
    );
    expect(vi.mocked(updateGoogleSheetValues)).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      "Solutions!E2:G2",
      [["Site web", "hbint.com", "www.hbint.com"]]
    );
    expect(vi.mocked(updateGoogleSheetValues)).toHaveBeenNthCalledWith(
      3,
      expect.any(Object),
      "Solutions!J2:K2",
      [["123456789", ""]]
    );
    expect(vi.mocked(updateGoogleSheetValues)).toHaveBeenNthCalledWith(
      4,
      expect.any(Object),
      "Clients!J2:J2",
      [[expect.any(String)]]
    );
    expect(vi.mocked(appendGoogleSheetValues)).toHaveBeenCalledOnce();
  });

  it("rejects an invalid solution input without updating the sheet", async () => {
    const response = await onRequestPut(
      context("CLI-1", "SOL-1", { ...validPayload, ga4PropertyId: "properties/not-a-number" })
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "INVALID_SOLUTION" });
    expect(vi.mocked(updateGoogleSheetValues)).not.toHaveBeenCalled();
  });

  it("accepts a prefixed canonical name with a free text indication", async () => {
    vi.mocked(readGoogleParametersValues).mockResolvedValue([
      ["categorie", "valeur"],
      ["type_solution", "Flux Assistant IA"],
      ["nom_solution", "Copilote entreprise"]
    ]);

    const response = await onRequestPut(
      context("CLI-1", "SOL-1", {
        type: "assistant_ai",
        name: "Flux Assistant IA \u2022 Copilote entreprise",
        urlOrIndication: "Agent IA interne",
        ga4PropertyId: "",
        googleAdsCustomerId: ""
      })
    );
    const body = await responseBody(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "updated" });
    expect(vi.mocked(updateGoogleSheetValues)).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      "Solutions!E2:G2",
      [["Flux Assistant IA \u2022 Copilote entreprise", "", "Agent IA interne"]]
    );
  });

  it("returns 404 when the solution does not belong to the client", async () => {
    const response = await onRequestPut(context("CLI-1", "SOL-404", validPayload));
    const body = await responseBody(response);

    expect(response.status).toBe(404);
    expect(body.error).toMatchObject({ code: "ADMIN_SOLUTION_NOT_FOUND" });
    expect(vi.mocked(updateGoogleSheetValues)).not.toHaveBeenCalled();
  });
});
