import { describe, expect, it } from "vitest";
import { buildAdminClientRows, hasExistingClientEmail, validateAdminClientInput } from "./adminClients";

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
          domain: "",
          url: "a2-cm.fr"
        }
      ]
    });

    expect(typeof input).toBe("object");
    if (typeof input !== "string") {
      expect(input.email).toBe("contact@a2-cm.fr");
      expect(input.solutions[0]).toEqual({
        type: "visibility_acquisition",
        name: "Flux Visibilité & Acquisition • Site web",
        domain: "a2-cm.fr",
        url: "https://a2-cm.fr"
      });
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
          name: "Flux Automatisation & IA • Tableau de bord",
          domain: "",
          url: ""
        }
      ]
    });

    expect(typeof input).toBe("object");
    if (typeof input !== "string") {
      const rows = buildAdminClientRows(input, new Date("2026-07-17T10:00:00.000Z"));

      expect(rows.clientRow.slice(2, 11)).toEqual([
        "A2-CM",
        "Actif",
        "Oui",
        rows.contactId,
        "contact@a2-cm.fr",
        "1",
        "2026-07-17",
        "2026-07-17",
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
      expect(rows.solutionRows[0].slice(1, 8)).toEqual([
        rows.clientId,
        "Flux Automatisation & IA",
        "Actif",
        "Flux Automatisation & IA • Tableau de bord",
        "",
        "",
        "2026-07-17"
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
