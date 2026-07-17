import { describe, expect, it } from "vitest";
import { buildAdminClientRows, hasExistingClientEmail, validateAdminClientInput } from "./adminClients";
import { fallbackAdminSolutionOptions } from "./adminOptions";

describe("admin client helpers", () => {
  it("validates and normalizes a new client payload", () => {
    const input = validateAdminClientInput({
      companyName: "A2-CM",
      contactFirstName: "Anthony",
      contactLastName: "Dupont",
      email: " CONTACT@A2-CM.FR ",
      notifyClient: true,
      solutions: [
        {
          type: "visibility_acquisition",
          name: "",
          urlOrIndication: "a2-cm.fr"
        }
      ]
    });

    expect(typeof input).toBe("object");
    if (typeof input !== "string") {
      expect(input.email).toBe("contact@a2-cm.fr");
      expect(input.solutions[0]).toEqual({
        type: "visibility_acquisition",
        name: fallbackAdminSolutionOptions[0].defaultName,
        urlOrIndication: "https://a2-cm.fr"
      });
    }
  });

  it("keeps a service indication as text instead of forcing an URL", () => {
    const input = validateAdminClientInput({
      companyName: "Data Client",
      contactFirstName: "Camille",
      contactLastName: "Martin",
      email: "contact@data-client.fr",
      solutions: [
        {
          type: "automation_ai",
          name: fallbackAdminSolutionOptions[1].defaultName,
          urlOrIndication: "Centralisation donnees"
        }
      ]
    });

    expect(typeof input).toBe("object");
    if (typeof input !== "string") {
      const rows = buildAdminClientRows(input, new Date("2026-07-17T10:00:00.000Z"));

      expect(input.solutions[0].urlOrIndication).toBe("Centralisation donnees");
      expect(rows.solutionRows[0][5]).toBe("");
      expect(rows.solutionRows[0][6]).toBe("Centralisation donnees");
    }
  });

  it("keeps legacy admin payloads using url compatible", () => {
    const input = validateAdminClientInput({
      companyName: "Legacy Client",
      contactFirstName: "Camille",
      contactLastName: "Martin",
      email: "contact@legacy-client.fr",
      solutions: [
        {
          type: "visibility_acquisition",
          name: fallbackAdminSolutionOptions[0].defaultName,
          url: "www.legacy-client.fr"
        }
      ]
    });

    expect(typeof input).toBe("object");
    if (typeof input !== "string") {
      expect(input.solutions[0].urlOrIndication).toBe("https://www.legacy-client.fr");
    }
  });

  it("builds structured rows for Clients, Contacts and Solutions", () => {
    const input = validateAdminClientInput({
      companyName: "A2-CM",
      contactFirstName: "Anthony",
      contactLastName: "Dupont",
      email: "contact@a2-cm.fr",
      notes: "Premier client",
      solutions: [
        {
          type: "automation_ai",
          name: fallbackAdminSolutionOptions[1].defaultName,
          urlOrIndication: ""
        },
        {
          type: "automation_ai",
          name: fallbackAdminSolutionOptions[1].defaultName,
          urlOrIndication: "hbint.com"
        }
      ]
    });

    expect(typeof input).toBe("object");
    if (typeof input !== "string") {
      const rows = buildAdminClientRows(input, new Date("2026-07-17T10:00:00.000Z"));

      expect(rows.clientId).toMatch(/^CLI-17072026-[A-F0-9]{4}$/);
      expect(rows.contactId).toMatch(/^CON-17072026-[A-F0-9]{4}$/);
      expect(rows.solutionRows[0][0]).toMatch(/^SOL-17072026-[A-F0-9]{4}$/);
      expect(rows.clientRow.slice(2, 11)).toEqual([
        "A2-CM",
        "Actif",
        "Oui",
        rows.contactId,
        "contact@a2-cm.fr",
        "2",
        "17/07/2026",
        "17/07/2026",
        "Premier client"
      ]);
      expect(rows.contactRow.slice(2, 8)).toEqual([
        "Anthony",
        "Dupont",
        "contact@a2-cm.fr",
        "Contact principal",
        "Oui",
        "Actif"
      ]);
      expect(rows.contactRow[8]).toBe("17/07/2026");
      expect(rows.solutionRows).toHaveLength(2);
      expect(rows.solutionRows[0].slice(1, 8)).toEqual([
        rows.clientId,
        "Flux Automatisation & IA",
        "Actif",
        fallbackAdminSolutionOptions[1].defaultName,
        "",
        "",
        "17/07/2026"
      ]);
      expect(rows.solutionRows[1].slice(1, 8)).toEqual([
        rows.clientId,
        "Flux Automatisation & IA",
        "Actif",
        fallbackAdminSolutionOptions[1].defaultName,
        "hbint.com",
        "https://hbint.com",
        "17/07/2026"
      ]);
    }
  });

  it("detects an existing structured workbook email", () => {
    expect(
      hasExistingClientEmail(
        {
          clients: [
            ["client_id", "statut_client", "espace_client_actif", "email_principal"],
            ["CLI-1", "Actif", "Oui", "client@example.com"]
          ],
          contacts: [],
          solutions: []
        },
        "CLIENT@EXAMPLE.COM"
      )
    ).toBe(true);
  });
});
