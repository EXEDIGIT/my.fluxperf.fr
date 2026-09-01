import { beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestPost } from "./contacts";
import { appendGoogleSheetValues, readGoogleWorkbookValues } from "../../../../lib/googleSheets";
import { createSupabaseUserForClient } from "../../../../lib/supabaseAdmin";

vi.mock("../../../../lib/googleSheets", () => ({
  readGoogleWorkbookValues: vi.fn(),
  appendGoogleSheetValues: vi.fn(async () => ({ updatedRows: 1 })),
  getGoogleWriteRanges: vi.fn(() => ({ contacts: "Contacts!A:J", actions: "Actions!A:J" }))
}));

vi.mock("../../../../lib/supabaseAdmin", () => ({
  createSupabaseUserForClient: vi.fn(async (_env: unknown, email: string) => ({ status: "created", email }))
}));

vi.mock("../../../../lib/adminClients", async () => {
  const actual = await vi.importActual<typeof import("../../../../lib/adminClients")>("../../../../lib/adminClients");

  return {
    ...actual,
    sendContactWelcomeEmail: vi.fn(async (_env: unknown, _request: Request, input: { contact: { email: string; sendAccessEmail: boolean } }) => (
      input.contact.sendAccessEmail
        ? { status: "sent" as const, email: input.contact.email }
        : { status: "skipped" as const, email: input.contact.email, reason: "Notification client désactivée." }
    ))
  };
});

function workbook(contacts: string[][] = []) {
  return {
    clients: [
      ["client_id", "organisation", "statut_client", "espace_client_actif", "contact_principal_id", "email_principal"],
      ["CLI-1", "Alpha", "Actif", "Oui", "CON-1", "alice@alpha.test"]
    ],
    contacts: contacts.length > 0
      ? contacts
      : [["contact_id", "client_id", "prenom", "nom", "email", "role_contact", "contact_principal", "statut_contact"]],
    solutions: [],
    actions: []
  };
}

function context(payload: Record<string, unknown>) {
  return {
    request: new Request("https://my.fluxperf.fr/api/admin/clients/CLI-1/contacts?email=admin@fluxperf.fr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    }),
    params: { clientId: "CLI-1" },
    env: { APP_ENV: "development", DEV_ADMIN_EMAIL: "admin@fluxperf.fr" }
  };
}

describe("POST /api/admin/clients/:clientId/contacts", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue(workbook());
  });

  it("adds a secondary user, provisions Supabase and keeps notification opt-in", async () => {
    const response = await onRequestPost(context({
      firstName: "Louis",
      lastName: "Durand",
      email: "louis@alpha.test",
      role: "Marketing",
      sendAccessEmail: false
    }));
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body).toMatchObject({ status: "created", clientId: "CLI-1", notification: { status: "skipped" } });
    expect(vi.mocked(createSupabaseUserForClient)).toHaveBeenCalledWith(expect.anything(), "louis@alpha.test");
    expect(vi.mocked(appendGoogleSheetValues)).toHaveBeenCalledWith(
      expect.anything(),
      "Contacts!A:J",
      [expect.arrayContaining(["CLI-1", "Louis", "Durand", "louis@alpha.test", "Marketing", "Non", "Actif"])]
    );
  });

  it("refuses an email already attached to the same organisation", async () => {
    vi.mocked(readGoogleWorkbookValues).mockResolvedValue(workbook([
      ["contact_id", "client_id", "prenom", "nom", "email", "role_contact", "contact_principal", "statut_contact"],
      ["CON-2", "CLI-1", "Louis", "Durand", "louis@alpha.test", "Marketing", "Non", "Inactif"]
    ]));

    const response = await onRequestPost(context({ firstName: "Louis", lastName: "Durand", email: "louis@alpha.test" }));
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toMatchObject({ code: "CONTACT_EMAIL_EXISTS" });
    expect(vi.mocked(createSupabaseUserForClient)).not.toHaveBeenCalled();
  });
});
