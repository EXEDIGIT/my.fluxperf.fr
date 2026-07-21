import { describe, expect, it } from "vitest";
import {
  buildAdminClientRows,
  getAdminClientQualityWarnings,
  hasExistingClientEmail,
  validateAdminClientInput
} from "./adminClients";
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
        urlOrIndication: "a2-cm.fr",
        ga4PropertyId: "",
        googleAdsCustomerId: ""
      });
    }
  });

  it("keeps a GA4 property id for visibility solutions only", () => {
    const input = validateAdminClientInput({
      companyName: "Stats Client",
      contactFirstName: "Camille",
      contactLastName: "Martin",
      email: "contact@stats-client.fr",
      solutions: [
        {
          type: "visibility_acquisition",
          name: fallbackAdminSolutionOptions[0].defaultName,
          urlOrIndication: "stats-client.fr",
          ga4PropertyId: "properties/123456789"
        },
        {
          type: "automation_ai",
          name: fallbackAdminSolutionOptions[1].defaultName,
          urlOrIndication: "Centralisation",
          ga4PropertyId: "987654321"
        }
      ]
    });

    expect(typeof input).toBe("object");
    if (typeof input !== "string") {
      const rows = buildAdminClientRows(input, new Date("2026-07-17T10:00:00.000Z"));

      expect(input.solutions[0].ga4PropertyId).toBe("123456789");
      expect(input.solutions[1].ga4PropertyId).toBe("");
      expect(rows.solutionRows[0][9]).toBe("123456789");
      expect(rows.solutionRows[1][9]).toBe("");
      expect(rows.solutionRows[0][10]).toBe("");
      expect(rows.solutionRows[1][10]).toBe("");
    }
  });

  it("normalizes a Google Ads customer id and writes it in column K only", () => {
    const input = validateAdminClientInput({
      companyName: "Ads Client",
      contactFirstName: "Camille",
      contactLastName: "Martin",
      email: "contact@ads-client.fr",
      solutions: [
        {
          type: "visibility_acquisition",
          name: "Publicité Google Ads",
          urlOrIndication: "Campagnes Search",
          ga4PropertyId: "123456789",
          googleAdsCustomerId: "123-456-7890"
        },
        {
          type: "visibility_acquisition",
          name: "Réseaux sociaux",
          urlOrIndication: "LinkedIn",
          googleAdsCustomerId: "9876543210"
        }
      ]
    });

    expect(typeof input).toBe("object");
    if (typeof input !== "string") {
      const rows = buildAdminClientRows(input, new Date("2026-07-17T10:00:00.000Z"));

      expect(input.solutions[0]).toMatchObject({ ga4PropertyId: "", googleAdsCustomerId: "1234567890" });
      expect(input.solutions[1]).toMatchObject({ ga4PropertyId: "", googleAdsCustomerId: "" });
      expect(rows.solutionRows[0][9]).toBe("");
      expect(rows.solutionRows[0][10]).toBe("1234567890");
      expect(rows.solutionRows[1][10]).toBe("");
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
      expect(input.solutions[0].urlOrIndication).toBe("www.legacy-client.fr");
    }
  });

  it("derives domains without rewriting url_or_indication values", () => {
    const input = validateAdminClientInput({
      companyName: "Domain Client",
      contactFirstName: "Camille",
      contactLastName: "Martin",
      email: "contact@domain-client.fr",
      solutions: [
        {
          type: "visibility_acquisition",
          name: fallbackAdminSolutionOptions[0].defaultName,
          urlOrIndication: "www.hbint.com"
        },
        {
          type: "visibility_acquisition",
          name: fallbackAdminSolutionOptions[0].defaultName,
          urlOrIndication: "https://www.hbint.com"
        }
      ]
    });

    expect(typeof input).toBe("object");
    if (typeof input !== "string") {
      const rows = buildAdminClientRows(input, new Date("2026-07-17T10:00:00.000Z"));

      expect(rows.solutionRows[0][5]).toBe("hbint.com");
      expect(rows.solutionRows[0][6]).toBe("www.hbint.com");
      expect(rows.solutionRows[1][5]).toBe("hbint.com");
      expect(rows.solutionRows[1][6]).toBe("https://www.hbint.com");
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
        "hbint.com",
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

  it("warns about an existing organization and active domain without treating text indications as domains", () => {
    const input = validateAdminClientInput({
      companyName: "Alpha Conseil",
      contactFirstName: "Camille",
      contactLastName: "Martin",
      email: "camille@new-client.fr",
      solutions: [
        {
          type: "visibility_acquisition",
          name: fallbackAdminSolutionOptions[0].defaultName,
          urlOrIndication: "www.alpha.fr"
        },
        {
          type: "automation_ai",
          name: fallbackAdminSolutionOptions[1].defaultName,
          urlOrIndication: "Centralisation donnees"
        }
      ]
    });

    expect(typeof input).toBe("object");
    if (typeof input === "string") {
      return;
    }

    const warnings = getAdminClientQualityWarnings(
      {
        clients: [
          ["client_id", "organisation", "statut_client"],
          ["CLI-1", "Alpha conseil", "Actif"]
        ],
        contacts: [],
        solutions: [
          ["solution_id", "client_id", "statut_solution", "domaine", "url_ou_indication"],
          ["SOL-1", "CLI-1", "Actif", "alpha.fr", "https://www.alpha.fr"],
          ["SOL-2", "CLI-1", "Actif", "", "Centralisation donnees"]
        ]
      },
      input
    );

    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "COMPANY_EXISTS", matches: [expect.objectContaining({ clientId: "CLI-1" })] }),
        expect.objectContaining({ code: "ACTIVE_DOMAIN_EXISTS", matches: [expect.objectContaining({ value: "alpha.fr" })] })
      ])
    );
    expect(warnings).toHaveLength(2);
  });
});
