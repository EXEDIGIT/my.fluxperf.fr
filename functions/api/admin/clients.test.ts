import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./clients";
import { sendClientWelcomeEmail } from "../../lib/adminClients";
import { fallbackAdminSolutionOptions } from "../../lib/adminOptions";
import { appendGoogleSheetValues, readGoogleParametersValues, readGoogleWorkbookValues } from "../../lib/googleSheets";
import { createSupabaseUserForClient } from "../../lib/supabaseAdmin";
import type { PagesContext } from "../../lib/types";

vi.mock("../../lib/googleSheets", () => ({
  readGoogleWorkbookValues: vi.fn(async () => ({
    clients: [["client_id", "statut_client", "espace_client_actif", "email_principal"]],
    contacts: [],
    solutions: [],
    actions: []
  })),
  readGoogleParametersValues: vi.fn(async () => []),
  getGoogleWriteRanges: vi.fn(() => ({
    clients: "Clients!A:K",
    contacts: "Contacts!A:J",
    solutions: "Solutions!A:I"
  })),
  appendGoogleSheetValues: vi.fn(async () => ({ updatedRows: 1 }))
}));

vi.mock("../../lib/supabaseAdmin", () => ({
  createSupabaseUserForClient: vi.fn(async (_env: unknown, email: string) => ({
    status: "created",
    email
  }))
}));

vi.mock("../../lib/adminClients", async () => {
  const actual = await vi.importActual<typeof import("../../lib/adminClients")>("../../lib/adminClients");

  return {
    ...actual,
    sendClientWelcomeEmail: vi.fn(async (_env: unknown, _request: Request, input: { email: string }) => ({
      status: "sent",
      email: input.email
    }))
  };
});

function context(payload: Record<string, unknown>): PagesContext {
  return {
    request: new Request("https://my.fluxperf.fr/api/admin/clients?email=admin@fluxperf.fr", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(payload)
    }),
    env: {
      APP_ENV: "development",
      DEV_ADMIN_EMAIL: "admin@fluxperf.fr"
    }
  };
}

async function responseBody(response: Response) {
  return response.json() as Promise<Record<string, unknown>>;
}

const validPayload = {
  companyName: "Client Test",
  contactFirstName: "Camille",
  contactLastName: "Martin",
  email: "client@example.com",
  notes: "",
  notifyClient: true,
  solutions: [
    {
      type: "visibility_acquisition",
      name: fallbackAdminSolutionOptions[0].defaultName,
      urlOrIndication: "https://example.com"
    }
  ]
};

describe("POST /api/admin/clients", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(sendClientWelcomeEmail).mockResolvedValue({
      status: "sent",
      email: "client@example.com"
    });
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue({
      clients: [["client_id", "statut_client", "espace_client_actif", "email_principal"]],
      contacts: [],
      solutions: [],
      actions: []
    });
    vi.mocked(readGoogleParametersValues).mockResolvedValue([]);
  });

  it("creates the client, writes a derived domain and reports a sent notification", async () => {
    const response = await onRequestPost(context(validPayload));
    const body = await responseBody(response);

    expect(response.status).toBe(201);
    expect(body.status).toBe("created");
    expect(body.notification).toMatchObject({
      status: "sent",
      email: "client@example.com"
    });
    expect(vi.mocked(createSupabaseUserForClient)).toHaveBeenCalledOnce();
    expect(vi.mocked(appendGoogleSheetValues)).toHaveBeenCalledTimes(3);

    const solutionRows = vi.mocked(appendGoogleSheetValues).mock.calls[2][2] as string[][];

    expect(solutionRows[0][5]).toBe("example.com");
    expect(solutionRows[0][6]).toBe("https://example.com");
  });

  it("writes multiple solutions of the same type and keeps text indications", async () => {
    const response = await onRequestPost(
      context({
        ...validPayload,
        solutions: [
          {
            type: "visibility_acquisition",
            name: fallbackAdminSolutionOptions[0].defaultName,
            urlOrIndication: "Centralisation donnees"
          },
          {
            type: "visibility_acquisition",
            name: fallbackAdminSolutionOptions[0].nameOptions[1],
            urlOrIndication: "hbint.com"
          }
        ]
      })
    );
    const body = await responseBody(response);
    const clientRows = vi.mocked(appendGoogleSheetValues).mock.calls[0][2] as string[][];
    const solutionRows = vi.mocked(appendGoogleSheetValues).mock.calls[2][2] as string[][];

    expect(response.status).toBe(201);
    expect(body.client).toMatchObject({ solutionsCreated: 2 });
    expect(clientRows[0][7]).toBe("2");
    expect(solutionRows).toHaveLength(2);
    expect(solutionRows[0][5]).toBe("");
    expect(solutionRows[0][6]).toBe("Centralisation donnees");
    expect(solutionRows[1][5]).toBe("hbint.com");
    expect(solutionRows[1][6]).toBe("hbint.com");
  });

  it("keeps the client creation successful when Brevo fails", async () => {
    vi.mocked(sendClientWelcomeEmail).mockRejectedValue(new Error("Brevo sender rejected"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const response = await onRequestPost(context(validPayload));
    const body = await responseBody(response);

    expect(response.status).toBe(201);
    expect(body.status).toBe("created");
    expect(body.notification).toMatchObject({
      status: "failed",
      email: "client@example.com",
      reason: "Email d'ouverture non envoye. Verifiez Brevo."
    });
    expect(consoleError).toHaveBeenCalledWith("brevo_welcome_email_failed", "Brevo sender rejected");

    consoleError.mockRestore();
  });

  it("reports a skipped notification when the email is disabled", async () => {
    vi.mocked(sendClientWelcomeEmail).mockResolvedValue({
      status: "skipped",
      email: "client@example.com",
      reason: "Notification client desactivee."
    });

    const response = await onRequestPost(context({ ...validPayload, notifyClient: false }));
    const body = await responseBody(response);

    expect(response.status).toBe(201);
    expect(body.notification).toMatchObject({
      status: "skipped",
      reason: "Notification client desactivee."
    });
  });

  it("still rejects a duplicate email before writing rows", async () => {
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue({
      clients: [
        ["client_id", "statut_client", "espace_client_actif", "email_principal"],
        ["CLI-1", "Actif", "Oui", "client@example.com"]
      ],
      contacts: [],
      solutions: [],
      actions: []
    });

    const response = await onRequestPost(context(validPayload));
    const body = await responseBody(response);

    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({ code: "CLIENT_EMAIL_EXISTS" });
    expect(vi.mocked(createSupabaseUserForClient)).not.toHaveBeenCalled();
    expect(vi.mocked(appendGoogleSheetValues)).not.toHaveBeenCalled();
  });

  it("rejects a solution name that is not allowed by admin options", async () => {
    const response = await onRequestPost(
      context({
        ...validPayload,
        solutions: [
          {
            type: "visibility_acquisition",
            name: "Solution non autorisee",
            urlOrIndication: ""
          }
        ]
      })
    );
    const body = await responseBody(response);

    expect(response.status).toBe(400);
    expect(body.error).toMatchObject({ code: "INVALID_CLIENT" });
  });
});
