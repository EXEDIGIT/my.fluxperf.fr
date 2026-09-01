import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./solutions";
import {
  appendGoogleSheetValues,
  readGoogleParametersValues,
  readGoogleWorkbookValues,
  updateGoogleSheetValues
} from "../../../../lib/googleSheets";
import { refreshWebsiteThumbnail } from "../../../../lib/thumbnailRefresh";
import type { ClientWorkbookValues } from "../../../../lib/clients";
import type { PagesContext } from "../../../../lib/types";

vi.mock("../../../../lib/googleSheets", () => ({
  readGoogleWorkbookValues: vi.fn(),
  readGoogleParametersValues: vi.fn(async () => []),
  appendGoogleSheetValues: vi.fn(async () => ({ updatedRows: 1 })),
  updateGoogleSheetValues: vi.fn(async () => ({ updatedRows: 1 })),
  getGoogleWriteRanges: vi.fn(() => ({ solutions: "Solutions!A:K", actions: "Actions!A:J" }))
}));

vi.mock("../../../../lib/thumbnailRefresh", () => ({
  refreshWebsiteThumbnail: vi.fn(async () => ({ status: "ready" as const }))
}));

const workbook: ClientWorkbookValues = {
  clients: [
    ["client_id", "nom_compte", "organisation", "statut_client", "espace_client_actif", "contact_principal_id", "email_principal", "nb_services_actifs", "date_creation", "date_mise_a_jour", "notes"],
    ["CLI-1", "Client Un", "Alpha", "Actif", "Oui", "CON-1", "alpha@example.com", "1", "01/01/2026", "10/07/2026", ""]
  ],
  contacts: [],
  solutions: [
    ["solution_id", "client_id", "type_solution", "statut_solution", "nom_solution", "domaine", "url_ou_indication", "date_activation", "notes", "ga4_property_id", "google_ads_customer_id"],
    ["SOL-EXISTING", "CLI-1", "Flux Automatisation & IA", "Actif", "Tableau de bord", "", "Centralisation", "01/07/2026", "", "", ""]
  ],
  actions: [],
  connections: []
};

function context(payload: Record<string, unknown>): PagesContext {
  return {
    request: new Request("https://my.fluxperf.fr/api/admin/clients/CLI-1/solutions?email=admin@fluxperf.fr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
    env: { APP_ENV: "development", DEV_ADMIN_EMAIL: "admin@fluxperf.fr" },
    params: { clientId: "CLI-1" }
  };
}

describe("POST /api/admin/clients/:clientId/solutions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue(workbook);
    vi.mocked(readGoogleParametersValues).mockResolvedValue([]);
    vi.mocked(refreshWebsiteThumbnail).mockResolvedValue({ status: "ready" });
  });

  it("creates a website solution and requests its thumbnail as part of the operation", async () => {
    const response = await onRequestPost(
      context({
        type: "visibility_acquisition",
        name: "Site web",
        urlOrIndication: "www.example.com",
        ga4PropertyId: "",
        googleAdsCustomerId: ""
      })
    );
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(201);
    expect(body.thumbnailRefresh).toEqual({ status: "ready" });
    expect(vi.mocked(appendGoogleSheetValues)).toHaveBeenCalledWith(
      expect.any(Object),
      "Solutions!A:K",
      [
        expect.arrayContaining([expect.stringMatching(/^SOL-/), "CLI-1", expect.any(String), "Actif", "Site web", "example.com", "www.example.com"])
      ]
    );
    expect(vi.mocked(refreshWebsiteThumbnail)).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        clientId: "CLI-1",
        solutionId: expect.stringMatching(/^SOL-/),
        name: "Site web",
        domain: "example.com",
        urlOrIndication: "www.example.com"
      })
    );
    expect(vi.mocked(updateGoogleSheetValues)).toHaveBeenCalledTimes(2);
  });
});
