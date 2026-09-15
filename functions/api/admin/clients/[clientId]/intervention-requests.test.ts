import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./intervention-requests";
import { readGoogleWorkbookValues } from "../../../../lib/googleSheets";
import { logAdminAction } from "../../../../lib/adminActions";
import type { ClientWorkbookValues } from "../../../../lib/clients";
import type { PagesContext } from "../../../../lib/types";

vi.mock("../../../../lib/googleSheets", () => ({
  readGoogleWorkbookValues: vi.fn()
}));

vi.mock("../../../../lib/adminActions", () => ({
  logAdminAction: vi.fn(async () => true)
}));

const workbook: ClientWorkbookValues = {
  clients: [
    ["client_id", "nom_compte", "organisation", "statut_client", "espace_client_actif", "contact_principal_id", "email_principal", "nb_services_actifs", "date_creation", "date_mise_a_jour", "notes"],
    ["CLI-1", "Alpha", "Alpha", "Actif", "Oui", "CON-1", "alpha@example.com", "1", "01/01/2026", "01/01/2026", ""]
  ],
  contacts: [
    ["contact_id", "client_id", "prenom", "nom", "email", "role_contact", "contact_principal", "statut_contact"],
    ["CON-1", "CLI-1", "Alice", "Alpha", "alice@alpha.example", "Direction", "Oui", "Actif"],
    ["CON-2", "CLI-1", "Ines", "Inactive", "ines@alpha.example", "Direction", "Non", "Inactif"]
  ],
  solutions: [
    ["solution_id", "client_id", "type_solution", "statut_solution", "nom_solution", "domaine", "url_ou_indication"],
    ["SOL-1", "CLI-1", "automation_ai", "Actif", "Tableau de bord", "", "Centralisation"],
    ["SOL-2", "CLI-1", "automation_ai", "Inactif", "Automatisation", "", ""]
  ],
  actions: [],
  connections: []
};

const validPayload = {
  requesterContactId: "CON-1",
  service: "automation_ai",
  solutionIds: ["SOL-1"],
  needs: ["process_automation"],
  priority: "normal",
  message: "Merci de vérifier cette automatisation depuis la console.",
  sendAcknowledgment: true
};

function context(payload: Record<string, unknown>): PagesContext {
  const formData = new FormData();

  formData.append("payload", JSON.stringify(payload));

  return {
    request: new Request("https://my.fluxperf.fr/api/admin/clients/CLI-1/intervention-requests?email=admin@fluxperf.fr", {
      method: "POST",
      body: formData
    }),
    env: {
      APP_ENV: "development",
      DEV_ADMIN_EMAIL: "admin@fluxperf.fr",
      N8N_INTERVENTION_WEBHOOK_URL: "https://n8n.example.test/webhook/intervention",
      N8N_INTERVENTION_WEBHOOK_SECRET: "secret"
    },
    params: { clientId: "CLI-1" }
  };
}

describe("POST /api/admin/clients/:clientId/intervention-requests", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue(workbook);
    vi.mocked(logAdminAction).mockResolvedValue(true);
  });

  it("transmits a request for the selected active contact and logs it for the dashboard", async () => {
    const webhookFetch = vi.fn(async () => Response.json({ status: "accepted" }));
    vi.stubGlobal("fetch", webhookFetch);

    const response = await onRequestPost(context(validPayload));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      status: "received",
      notification: { status: "requested", email: "alice@alpha.example" },
      history: { status: "logged" }
    });
    const webhookCalls = webhookFetch.mock.calls as unknown as Array<[RequestInfo | URL, RequestInit]>;
    const init = webhookCalls[0][1];
    const forwarded = JSON.parse(String((init.body as FormData).get("payload"))) as Record<string, unknown>;

    expect(forwarded).toMatchObject({
      source: { app: "my-fluxperf", channel: "admin_console" },
      requester: { email: "alice@alpha.example", firstName: "Alice", lastName: "Alpha" },
      submittedBy: { email: "admin@fluxperf.fr", role: "admin" },
      notification: { sendAcknowledgment: true }
    });
    expect(vi.mocked(logAdminAction)).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        clientId: "CLI-1",
        type: "intervention_request",
        requesterEmail: "alice@alpha.example",
        actorEmail: "admin@fluxperf.fr"
      })
    );
  });

  it("rejects an inactive contact", async () => {
    const response = await onRequestPost(context({ ...validPayload, requesterContactId: "CON-2" }));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "REQUESTER_NOT_ALLOWED" });
  });

  it("rejects an inactive solution", async () => {
    const response = await onRequestPost(context({ ...validPayload, solutionIds: ["SOL-2"] }));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "SOLUTION_NOT_ALLOWED" });
  });

  it("rejects a client whose portal access is inactive", async () => {
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue({
      ...workbook,
      clients: [
        workbook.clients[0],
        ["CLI-1", "Alpha", "Alpha", "Inactif", "Non", "CON-1", "alpha@example.com", "1", "01/01/2026", "01/01/2026", ""]
      ]
    });

    const response = await onRequestPost(context(validPayload));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({ code: "ADMIN_CLIENT_NOT_ACTIVE" });
  });

  it("does not write a history action when n8n rejects the request", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response("unavailable", { status: 503 })));

    const response = await onRequestPost(context(validPayload));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(502);
    expect(body.error).toMatchObject({ code: "WEBHOOK_FAILED" });
    expect(vi.mocked(logAdminAction)).not.toHaveBeenCalled();
  });

  it("keeps a transmitted request successful when activity logging fails", async () => {
    const webhookFetch = vi.fn(async () => Response.json({ status: "accepted" }));
    vi.stubGlobal("fetch", webhookFetch);
    vi.mocked(logAdminAction).mockResolvedValue(false);

    const response = await onRequestPost(context({ ...validPayload, sendAcknowledgment: false }));
    const body = await response.json() as Record<string, unknown>;

    expect(response.status).toBe(202);
    expect(body).toMatchObject({
      notification: { status: "skipped" },
      history: { status: "failed" }
    });
  });
});
