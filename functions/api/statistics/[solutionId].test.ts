import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestGet } from "./[solutionId]";
import { readGoogleWorkbookValues } from "../../lib/googleSheets";
import type { PagesContext } from "../../lib/types";

vi.mock("../../lib/googleSheets", async () => {
  const actual = await vi.importActual<typeof import("../../lib/googleSheets")>("../../lib/googleSheets");

  return {
    ...actual,
    readGoogleWorkbookValues: vi.fn()
  };
});

const baseWorkbook = {
  clients: [
    [
      "client_id",
      "nom_compte",
      "organisation",
      "statut_client",
      "espace_client_actif",
      "contact_principal_id",
      "email_principal"
    ],
    ["CLI-1", "Client Stats", "Client Stats", "Actif", "Oui", "CON-1", "client@example.com"]
  ],
  contacts: [
    ["contact_id", "client_id", "prenom", "nom", "email", "role_contact", "contact_principal", "statut_contact"],
    ["CON-1", "CLI-1", "Camille", "Martin", "client@example.com", "Contact principal", "Oui", "Actif"]
  ],
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
      "ga4_property_id"
    ],
    [
      "SOL-GA4",
      "CLI-1",
      "visibility_acquisition",
      "Actif",
      "Visibilite GA4",
      "example.com",
      "https://www.example.com",
      "17/07/2026",
      "",
      "123456789"
    ],
    [
      "SOL-PENDING",
      "CLI-1",
      "visibility_acquisition",
      "Actif",
      "Visibilite pending",
      "shop.example.com",
      "https://shop.example.com",
      "17/07/2026",
      "",
      ""
    ]
  ],
  actions: []
};

function context(solutionId: string, period = "30d"): PagesContext {
  return {
    request: new Request(
      `https://my.fluxperf.fr/api/statistics/${encodeURIComponent(solutionId)}?email=client@example.com&period=${period}`
    ),
    env: {
      APP_ENV: "development"
    },
    params: {
      solutionId
    }
  };
}

async function bodyOf(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

describe("GET /api/statistics/:solutionId", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue(baseWorkbook);
  });

  it("rejects an invalid period", async () => {
    const response = await onRequestGet(context("SOL-GA4", "14d"));
    const body = await bodyOf(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "INVALID_PERIOD" });
  });

  it("rejects a solution that is not attached to the client", async () => {
    const response = await onRequestGet(context("SOL-UNKNOWN"));
    const body = await bodyOf(response);

    expect(response.status).toBe(403);
    expect(body.error).toMatchObject({ code: "SOLUTION_NOT_ALLOWED" });
  });

  it("returns a clean pending setup state when GA4 is not configured on the solution", async () => {
    const response = await onRequestGet(context("SOL-PENDING"));
    const body = await bodyOf(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "pending_setup",
      solution: {
        id: "SOL-PENDING",
        domain: "shop.example.com"
      }
    });
  });

  it("returns ready demo statistics in local mode for a configured solution", async () => {
    const response = await onRequestGet(context("SOL-GA4"));
    const body = await bodyOf(response);

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      status: "ready",
      solution: {
        id: "SOL-GA4",
        domain: "example.com"
      }
    });
    expect(JSON.stringify(body)).not.toContain("123456789");
  });
});
