import { describe, expect, it } from "vitest";
import {
  clientEmails,
  findClientForEmail,
  findClientForEmailInWorkbook,
  parseClientRows
} from "./clients";

const sheetValues = [
  [
    "client_id",
    "status",
    "company_name",
    "contact_first_name",
    "contact_last_name",
    "primary_email",
    "allowed_emails",
    "plan_label",
    "services_active",
    "jotform_request_url",
    "jotform_support_url",
    "report_url",
    "resources_url",
    "contact_fluxperf_name",
    "contact_fluxperf_email",
    "last_action_1_label",
    "last_action_1_date",
    "last_action_2_label",
    "last_action_2_date",
    "last_action_3_label",
    "last_action_3_date"
  ],
  [
    "a2cm",
    "active",
    "A2-CM",
    "Anthony",
    "Dupont",
    "contact@a2-cm.fr",
    "direction@a2-cm.fr, admin@a2-cm.fr",
    "Abonnement actif",
    "Site internet, Visibilité Web, Google Ads",
    "https://form.jotform.com/request",
    "https://form.jotform.com/support",
    "",
    "/ressources",
    "Tristan",
    "hello@fluxperf.fr",
    "Demande envoyée",
    "Il y a 2h",
    "",
    "",
    "",
    ""
  ],
  [
    "inactive-client",
    "paused",
    "Client en pause",
    "Camille",
    "Martin",
    "pause@example.com",
    "",
    "Accès suspendu",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    "",
    ""
  ]
];

const structuredWorkbook = {
  clients: [
    [
      "client_id",
      "nom_compte",
      "organisation",
      "statut_client",
      "espace_client_actif",
      "contact_principal_id",
      "email_principal",
      "nb_sites",
      "date_creation",
      "date_mise_a_jour",
      "notes"
    ],
    [
      "CLI-0001",
      "Celine HEMING",
      "HBINT",
      "Actif",
      "Oui",
      "CON-0001",
      "tdacunha@exedigit.fr",
      "2",
      "2026-07-06",
      "2026-07-06",
      "Premier client MVP"
    ],
    [
      "CLI-0002",
      "Client Suspendu",
      "SUSPENDU",
      "Actif",
      "Non",
      "CON-0002",
      "pause@example.com",
      "0",
      "2026-07-06",
      "2026-07-06",
      ""
    ]
  ],
  contacts: [
    [
      "contact_id",
      "client_id",
      "prenom",
      "nom",
      "email",
      "role_contact",
      "contact_principal",
      "statut_contact",
      "date_creation",
      "notes"
    ],
    [
      "CON-0001",
      "CLI-0001",
      "Celine",
      "HEMING",
      "tdacunha@exedigit.fr",
      "Decisionnaire",
      "Oui",
      "Actif",
      "2026-07-06",
      "Contact initial MVP"
    ],
    [
      "CON-0002",
      "CLI-0002",
      "Camille",
      "Martin",
      "pause@example.com",
      "Decisionnaire",
      "Oui",
      "Actif",
      "2026-07-06",
      ""
    ]
  ],
  sites: [
    [
      "site_id",
      "client_id",
      "domaine",
      "url",
      "type_site",
      "statut_site",
      "suivi_actif",
      "date_ajout",
      "notes"
    ],
    [
      "SITE-0001",
      "CLI-0001",
      "hbint.com",
      "https://www.hbint.com",
      "Principal",
      "Actif",
      "Oui",
      "2026-07-06",
      "Site public"
    ],
    [
      "SITE-0002",
      "CLI-0001",
      "trial.hbint.com",
      "https://trial.hbint.com",
      "Environnement de test",
      "Actif",
      "Oui",
      "2026-07-06",
      "Site trial"
    ]
  ]
};

describe("client sheet parsing", () => {
  it("parses rows and keeps empty fields safe", () => {
    const rows = parseClientRows(sheetValues);

    expect(rows).toHaveLength(2);
    expect(rows[0].company_name).toBe("A2-CM");
    expect(rows[0].report_url).toBe("");
  });

  it("normalizes primary and allowed emails", () => {
    const rows = parseClientRows(sheetValues);

    expect(clientEmails(rows[0])).toEqual([
      "contact@a2-cm.fr",
      "direction@a2-cm.fr",
      "admin@a2-cm.fr"
    ]);
  });

  it("matches an active client by allowed email", () => {
    const result = findClientForEmail(sheetValues, "DIRECTION@A2-CM.FR");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.client.companyName).toBe("A2-CM");
      expect(result.client.services).toEqual(["Site internet", "Visibilité Web", "Google Ads"]);
      expect(result.client.links.report).toBeNull();
    }
  });

  it("rejects a matching client when status is not active", () => {
    const result = findClientForEmail(sheetValues, "pause@example.com");

    expect(result.status).toBe("inactive");
  });

  it("returns not_found when no email matches", () => {
    const result = findClientForEmail(sheetValues, "unknown@example.com");

    expect(result.status).toBe("not_found");
  });

  it("matches the normalized Fluxperf workbook by principal email", () => {
    const result = findClientForEmailInWorkbook(structuredWorkbook, "TDACUNHA@EXEDIGIT.FR");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.client.id).toBe("CLI-0001");
      expect(result.client.companyName).toBe("HBINT");
      expect(result.client.firstName).toBe("Celine");
      expect(result.client.lastName).toBe("HEMING");
      expect(result.client.services).toEqual([
        "Site suivi : hbint.com",
        "Site suivi : trial.hbint.com"
      ]);
    }
  });

  it("rejects a normalized workbook client when the portal is disabled", () => {
    const result = findClientForEmailInWorkbook(structuredWorkbook, "pause@example.com");

    expect(result.status).toBe("inactive");
  });
});
