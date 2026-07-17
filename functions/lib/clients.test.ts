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
  ],
  solutions: [
    [
      "solution_id",
      "client_id",
      "type_solution",
      "statut_solution",
      "nom_solution",
      "date_activation",
      "notes"
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
      expect(result.client.services).toEqual(["Espace client Fluxperf"]);
      expect(result.client.sites).toEqual([
        {
          id: "SITE-0001",
          domain: "hbint.com",
          url: "https://www.hbint.com",
          type: "Principal",
          status: "Actif"
        },
        {
          id: "SITE-0002",
          domain: "trial.hbint.com",
          url: "https://trial.hbint.com",
          type: "Environnement de test",
          status: "Actif"
        }
      ]);
      expect(result.client.impact).toEqual({
        weeklyHours: 0,
        monthlyHours: 0,
        items: [],
        isEstimated: true
      });
    }
  });

  it("uses the latest matching rows from the Actions tab", () => {
    const result = findClientForEmailInWorkbook(
      {
        ...structuredWorkbook,
        actions: [
          [
            "action_id",
            "client_id",
            "date_action",
            "type_action",
            "libelle_action",
            "reference",
            "email_demandeur",
            "source",
            "statut",
            "details"
          ],
          [
            "ACT-OLD",
            "CLI-0001",
            "2026-07-16T08:00:00.000Z",
            "support_request",
            "Message support envoye",
            "SUP-20260716-0001",
            "tdacunha@exedigit.fr",
            "myfluxperf",
            "envoyee",
            ""
          ],
          [
            "ACT-OTHER",
            "CLI-9999",
            "2026-07-18T08:00:00.000Z",
            "intervention_request",
            "Action autre client",
            "FP-20260718-0001",
            "other@example.com",
            "myfluxperf",
            "envoyee",
            ""
          ],
          [
            "ACT-NEW",
            "CLI-0001",
            "2026-07-17T10:00:00.000Z",
            "intervention_request",
            "Demande d'intervention envoyee - Flux Automatisation & IA",
            "FP-20260717-0001",
            "tdacunha@exedigit.fr",
            "myfluxperf",
            "envoyee",
            ""
          ]
        ]
      },
      "tdacunha@exedigit.fr"
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.client.latestActions).toEqual([
        {
          label: "Demande d'intervention envoyee - Flux Automatisation & IA",
          date: "17/07/2026 12:00"
        },
        {
          label: "Message support envoye",
          date: "16/07/2026 10:00"
        }
      ]);
    }
  });

  it("counts an active automation solution even when the client has no site", () => {
    const workbook = {
      ...structuredWorkbook,
      clients: [
        structuredWorkbook.clients[0],
        [
          "CLI-0003",
          "Autom Client",
          "AUTOM",
          "Actif",
          "Oui",
          "CON-0003",
          "autom@example.com",
          "0",
          "2026-07-06",
          "2026-07-06",
          ""
        ]
      ],
      contacts: [
        structuredWorkbook.contacts[0],
        [
          "CON-0003",
          "CLI-0003",
          "Alex",
          "Martin",
          "autom@example.com",
          "Decisionnaire",
          "Oui",
          "Actif",
          "2026-07-06",
          ""
        ]
      ],
      sites: [structuredWorkbook.sites[0]],
      solutions: [
        structuredWorkbook.solutions[0],
        [
          "SOL-0001",
          "CLI-0003",
          "automation_ai",
          "Actif",
          "Automatisation facturation",
          "2026-07-06",
          ""
        ]
      ]
    };
    const result = findClientForEmailInWorkbook(workbook, "autom@example.com");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.client.sites).toEqual([]);
      expect(result.client.services).toEqual([
        "Flux Automatisation & IA : Automatisation facturation"
      ]);
      expect(result.client.impact.weeklyHours).toBe(1);
      expect(result.client.impact.items).toEqual([
        {
          key: "automation_ai",
          label: "Automatisation & IA",
          quantity: 1,
          weeklyHours: 1,
          monthlyHours: 4.5
        }
      ]);
    }
  });

  it("keeps legacy technical solution codes compatible", () => {
    const workbook = {
      ...structuredWorkbook,
      solutions: [
        structuredWorkbook.solutions[0],
        [
          "SOL-0000",
          "CLI-0001",
          "visibility_acquisition",
          "Actif",
          "Visibilite historique",
          "2026-07-06",
          ""
        ],
        [
          "SOL-0001",
          "CLI-0001",
          "automation_ai",
          "Actif",
          "Automatisation historique",
          "2026-07-06",
          ""
        ],
        [
          "SOL-0002",
          "CLI-0001",
          "assistant_ai",
          "Actif",
          "Assistant historique",
          "2026-07-06",
          ""
        ]
      ]
    };
    const result = findClientForEmailInWorkbook(workbook, "tdacunha@exedigit.fr");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.client.services).toEqual([
        "Flux Visibilité & Acquisition : Visibilite historique",
        "Flux Automatisation & IA : Automatisation historique",
        "Flux Assistant IA : Assistant historique"
      ]);
      expect(result.client.impact.weeklyHours).toBe(4.5);
      expect(result.client.impact.items.map((item) => item.key)).toEqual([
        "visibility_acquisition",
        "automation_ai",
        "assistant_ai"
      ]);
    }
  });

  it("combines active visibility, automation and assistant solutions", () => {
    const workbook = {
      ...structuredWorkbook,
      sites: [structuredWorkbook.sites[0], structuredWorkbook.sites[1]],
      solutions: [
        structuredWorkbook.solutions[0],
        [
          "SOL-0000",
          "CLI-0001",
          "Flux Visibilité & Acquisition",
          "Actif",
          "Acquisition digitale",
          "2026-07-06",
          ""
        ],
        [
          "SOL-0001",
          "CLI-0001",
          "Flux Automatisation & IA",
          "Actif",
          "Automatisation reporting",
          "2026-07-06",
          ""
        ],
        [
          "SOL-0002",
          "CLI-0001",
          "Flux Assistant IA",
          "Actif",
          "Assistant support",
          "2026-07-06",
          ""
        ]
      ]
    };
    const result = findClientForEmailInWorkbook(workbook, "tdacunha@exedigit.fr");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.client.services).toEqual([
        "Flux Visibilité & Acquisition : Acquisition digitale",
        "Flux Automatisation & IA : Automatisation reporting",
        "Flux Assistant IA : Assistant support"
      ]);
      expect(result.client.impact.weeklyHours).toBe(4.5);
      expect(result.client.impact.monthlyHours).toBe(19.5);
      expect(result.client.impact.items.map((item) => [item.key, item.quantity, item.weeklyHours])).toEqual([
        ["visibility_acquisition", 1, 1.5],
        ["automation_ai", 1, 1],
        ["assistant_ai", 1, 2]
      ]);
    }
  });

  it("ignores non-active solutions", () => {
    const workbook = {
      ...structuredWorkbook,
      solutions: [
        structuredWorkbook.solutions[0],
        [
          "SOL-0000",
          "CLI-0001",
          "Flux Visibilité & Acquisition",
          "En cours d'activation",
          "Acquisition en activation",
          "2026-07-06",
          ""
        ],
        [
          "SOL-0002",
          "CLI-0001",
          "Flux Assistant IA",
          "En pause",
          "Assistant en pause",
          "2026-07-06",
          ""
        ],
        [
          "SOL-0001",
          "CLI-0001",
          "automation_ai",
          "Inactif",
          "Automatisation en pause",
          "2026-07-06",
          ""
        ]
      ]
    };
    const result = findClientForEmailInWorkbook(workbook, "tdacunha@exedigit.fr");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.client.services).toEqual(["Espace client Fluxperf"]);
      expect(result.client.impact).toEqual({
        weeklyHours: 0,
        monthlyHours: 0,
        items: [],
        isEstimated: true
      });
    }
  });

  it("rejects a normalized workbook client when the portal is disabled", () => {
    const result = findClientForEmailInWorkbook(structuredWorkbook, "pause@example.com");

    expect(result.status).toBe("inactive");
  });
});
