import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./welcome-email";
import { readGoogleWorkbookValues } from "../../../../lib/googleSheets";
import { sendClientWelcomeEmail } from "../../../../lib/adminClients";
import { logAdminAction } from "../../../../lib/adminActions";
import type { ClientWorkbookValues } from "../../../../lib/clients";
import type { PagesContext } from "../../../../lib/types";

vi.mock("../../../../lib/googleSheets", () => ({
  readGoogleWorkbookValues: vi.fn()
}));

vi.mock("../../../../lib/adminClients", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/adminClients")>("../../../../lib/adminClients");

  return {
    ...actual,
    sendClientWelcomeEmail: vi.fn(async (_env: unknown, _request: Request, input: { email: string }) => ({
      status: "sent",
      email: input.email
    }))
  };
});

vi.mock("../../../../lib/adminActions", () => ({
  logAdminAction: vi.fn(async () => undefined)
}));

const workbook: ClientWorkbookValues = {
  clients: [
    ["client_id", "organisation", "statut_client", "espace_client_actif", "contact_principal_id", "email_principal", "notes"],
    ["CLI-1", "Alpha", "Actif", "Oui", "CON-1", "alpha@example.com", ""]
  ],
  contacts: [
    ["contact_id", "client_id", "prenom", "nom", "email", "contact_principal"],
    ["CON-1", "CLI-1", "Alice", "Martin", "alpha@example.com", "Oui"]
  ],
  solutions: [],
  actions: [],
  connections: []
};

function context(): PagesContext {
  return {
    request: new Request("https://my.fluxperf.fr/api/admin/clients/CLI-1/welcome-email?email=admin@fluxperf.fr", {
      method: "POST"
    }),
    env: {
      APP_ENV: "development",
      DEV_ADMIN_EMAIL: "admin@fluxperf.fr"
    },
    params: { clientId: "CLI-1" }
  };
}

describe("POST /api/admin/clients/:clientId/welcome-email", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue(workbook);
    vi.mocked(sendClientWelcomeEmail).mockResolvedValue({ status: "sent", email: "alpha@example.com" });
  });

  it("sends the welcome email for an active client and logs the action", async () => {
    const response = await onRequestPost(context());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ status: "sent", clientId: "CLI-1" });
    expect(vi.mocked(sendClientWelcomeEmail)).toHaveBeenCalledWith(
      expect.any(Object),
      expect.any(Request),
      expect.objectContaining({ email: "alpha@example.com", notifyClient: true })
    );
    expect(vi.mocked(logAdminAction)).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ type: "admin_welcome_email_sent" })
    );
  });

  it("refuses to send an email while the client access is inactive", async () => {
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue({
      ...workbook,
      clients: [workbook.clients[0], ["CLI-1", "Alpha", "Inactif", "Non", "CON-1", "alpha@example.com", ""]]
    });

    const response = await onRequestPost(context());
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toMatchObject({ error: { code: "ADMIN_CLIENT_ACCESS_INACTIVE" } });
    expect(vi.mocked(sendClientWelcomeEmail)).not.toHaveBeenCalled();
  });

  it("returns a controlled error when sending the email fails", async () => {
    vi.mocked(sendClientWelcomeEmail).mockRejectedValue(new Error("Brevo rejected sender"));

    const response = await onRequestPost(context());
    const body = await response.json();

    expect(response.status).toBe(502);
    expect(body).toMatchObject({ error: { code: "ADMIN_WELCOME_EMAIL_FAILED" } });
    expect(vi.mocked(logAdminAction)).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ type: "admin_welcome_email_failed" })
    );
  });
});
