import { describe, expect, it } from "vitest";
import {
  clientEmails,
  findClientForEmail,
  findClientForEmailInWorkbook,
  getStatisticsSourceForClientSolution,
  getThumbnailSourcesFromWorkbook,
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
      "nb_services_actifs",
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
  solutions: [
    [
      "solution_id",
      "client_id",
      "type_solution",
      "statut_solution",
      "nom_solution",
      "domaine",
      "url",
      "date_activation",
      "notes"
    ],
    [
      "SOL-0001",
      "CLI-0001",
      "Flux Visibilité & Acquisition",
      "Actif",
      "Flux Visibilité & Acquisition • Site web",
      "hbint.com",
      "https://www.hbint.com",
      "2026-07-06",
      "Site public"
    ],
    [
      "SOL-0002",
      "CLI-0001",
      "Flux Visibilité & Acquisition",
      "Actif",
      "Flux Visibilité & Acquisition • Site e-shop",
      "trial.hbint.com",
      "https://trial.hbint.com",
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
        "Flux Visibilité & Acquisition • Site web - hbint.com",
        "Flux Visibilité & Acquisition • Site e-shop - trial.hbint.com"
      ]);
      expect(result.client.solutions).toEqual([
        {
          id: "SOL-0001",
          type: "visibility_acquisition",
          typeLabel: "Flux Visibilité & Acquisition",
          status: "Actif",
          name: "Flux Visibilité & Acquisition • Site web",
          domain: "hbint.com",
          url: "https://www.hbint.com",
          activatedAt: "2026-07-06",
          statistics: {
            status: "pending_setup"
          },
          thumbnail: {
            kind: "website",
            endpoint: "/api/thumbnails/SOL-0001",
            placeholderKey: "visibility_acquisition"
          }
        },
        {
          id: "SOL-0002",
          type: "visibility_acquisition",
          typeLabel: "Flux Visibilité & Acquisition",
          status: "Actif",
          name: "Flux Visibilité & Acquisition • Site e-shop",
          domain: "trial.hbint.com",
          url: "https://trial.hbint.com",
          activatedAt: "2026-07-06",
          statistics: {
            status: "pending_setup"
          },
          thumbnail: {
            kind: "website",
            endpoint: "/api/thumbnails/SOL-0002",
            placeholderKey: "visibility_acquisition"
          }
        }
      ]);
      expect(result.client.impact).toEqual({
        weeklyHours: 3,
        monthlyHours: 13,
        items: [
          {
            key: "visibility_acquisition",
            label: "Visibilité & Acquisition",
            quantity: 2,
            weeklyHours: 3,
            monthlyHours: 13
          }
        ],
        isEstimated: true
      });
    }
  });

  it("keeps French business dates readable for structured client data", () => {
    const workbook = {
      ...structuredWorkbook,
      clients: [
        structuredWorkbook.clients[0],
        [
          "CLI-17072026-ABCD",
          "Client Date",
          "DATE COMPANY",
          "Actif",
          "Oui",
          "CON-17072026-ABCD",
          "date@example.com",
          "1",
          "17/07/2026",
          "17/07/2026",
          ""
        ]
      ],
      contacts: [
        structuredWorkbook.contacts[0],
        [
          "CON-17072026-ABCD",
          "CLI-17072026-ABCD",
          "Camille",
          "Martin",
          "date@example.com",
          "Contact principal",
          "Oui",
          "Actif",
          "17/07/2026",
          ""
        ]
      ],
      solutions: [
        structuredWorkbook.solutions[0],
        [
          "SOL-17072026-ABCD",
          "CLI-17072026-ABCD",
          "Flux Automatisation & IA",
          "Actif",
          "Flux Automatisation & IA - Tableau de bord",
          "",
          "",
          "17/07/2026",
          ""
        ]
      ]
    };
    const result = findClientForEmailInWorkbook(workbook, "date@example.com");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.client.solutions[0].activatedAt).toBe("17/07/2026");
      expect(result.client.latestActions).toContainEqual({
        label: "Fiche client mise à jour",
        date: "17/07/2026"
      });
    }
  });

  it("keeps GA4 property ids server-side and exposes only the statistics status", () => {
    const workbook = {
      ...structuredWorkbook,
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
          "CLI-0001",
          "visibility_acquisition",
          "Actif",
          "Visibilite GA4",
          "hbint.com",
          "https://www.hbint.com",
          "2026-07-06",
          "",
          "123456789"
        ]
      ]
    };
    const result = findClientForEmailInWorkbook(workbook, "tdacunha@exedigit.fr");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.client.solutions[0]).toMatchObject({
        id: "SOL-GA4",
        statistics: {
          status: "available"
        }
      });
      expect("ga4PropertyId" in result.client.solutions[0]).toBe(false);

      const source = getStatisticsSourceForClientSolution(workbook, result.client, "SOL-GA4");

      expect(source).toMatchObject({
        status: "available",
        ga4PropertyId: "123456789"
      });
    }
  });

  it("returns only active website thumbnail sources from Solutions", () => {
    const sources = getThumbnailSourcesFromWorkbook(structuredWorkbook);

    expect(sources).toEqual([
      {
        solutionId: "SOL-0001",
        clientId: "CLI-0001",
        type: "visibility_acquisition",
        typeLabel: "Flux Visibilité & Acquisition",
        name: "Flux Visibilité & Acquisition • Site web",
        domain: "hbint.com",
        url: "https://www.hbint.com/"
      },
      {
        solutionId: "SOL-0002",
        clientId: "CLI-0001",
        type: "visibility_acquisition",
        typeLabel: "Flux Visibilité & Acquisition",
        name: "Flux Visibilité & Acquisition • Site e-shop",
        domain: "trial.hbint.com",
        url: "https://trial.hbint.com/"
      }
    ]);
  });

  it("rejects unsafe or mismatched thumbnail source URLs", () => {
    const sources = getThumbnailSourcesFromWorkbook({
      ...structuredWorkbook,
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
          "notes"
        ],
        [
          "SOL-LOCAL",
          "CLI-0001",
          "visibility_acquisition",
          "Actif",
          "Localhost",
          "localhost",
          "http://localhost:5173",
          "2026-07-06",
          ""
        ],
        [
          "SOL-PRIVATE",
          "CLI-0001",
          "visibility_acquisition",
          "Actif",
          "Private IP",
          "192.168.1.20",
          "https://192.168.1.20",
          "2026-07-06",
          ""
        ],
        [
          "SOL-MISMATCH",
          "CLI-0001",
          "visibility_acquisition",
          "Actif",
          "Mismatched domain",
          "hbint.com",
          "https://example.com",
          "2026-07-06",
          ""
        ],
        [
          "SOL-AUTOM",
          "CLI-0001",
          "automation_ai",
          "Actif",
          "Automation",
          "",
          "Centralisation donnees",
          "2026-07-06",
          ""
        ]
      ]
    });

    expect(sources).toEqual([]);
  });

  it("reads the new url_ou_indication column without turning indications into domains", () => {
    const result = findClientForEmailInWorkbook(
      {
        ...structuredWorkbook,
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
            "notes"
          ],
          [
            "SOL-INDICATION",
            "CLI-0001",
            "Flux Automatisation & IA",
            "Actif",
            "Flux Automatisation & IA - Tableau de bord",
            "",
            "Centralisation donnees",
            "2026-07-06",
            ""
          ]
        ]
      },
      "tdacunha@exedigit.fr"
    );

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.client.solutions[0]).toMatchObject({
        id: "SOL-INDICATION",
        type: "automation_ai",
        domain: "",
        url: "Centralisation donnees"
      });
      expect(result.client.services).toEqual([
        "Flux Automatisation & IA - Tableau de bord - Centralisation donnees"
      ]);
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
            "Message support envoyé",
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
            "Demande d'intervention envoyée - Flux Automatisation & IA",
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
          label: "Demande d'intervention envoyée - Flux Automatisation & IA",
          date: "17/07/2026 12:00"
        },
        {
          label: "Message support envoyé",
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
      solutions: [
        structuredWorkbook.solutions[0],
        [
          "SOL-0001",
          "CLI-0003",
          "automation_ai",
          "Actif",
          "Automatisation facturation",
          "",
          "",
          "2026-07-06",
          ""
        ]
      ]
    };
    const result = findClientForEmailInWorkbook(workbook, "autom@example.com");

    expect(result.status).toBe("ok");
    if (result.status === "ok") {
      expect(result.client.solutions).toEqual([
        {
          id: "SOL-0001",
          type: "automation_ai",
          typeLabel: "Flux Automatisation & IA",
          status: "Actif",
          name: "Automatisation facturation",
          domain: "",
          url: "",
          activatedAt: "2026-07-06",
          statistics: {
            status: "not_applicable"
          },
          thumbnail: {
            kind: "placeholder",
            endpoint: null,
            placeholderKey: "automation_ai"
          }
        }
      ]);
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
          "",
          "",
          "2026-07-06",
          ""
        ],
        [
          "SOL-0001",
          "CLI-0001",
          "automation_ai",
          "Actif",
          "Automatisation historique",
          "",
          "",
          "2026-07-06",
          ""
        ],
        [
          "SOL-0002",
          "CLI-0001",
          "assistant_ai",
          "Actif",
          "Assistant historique",
          "",
          "",
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
      solutions: [
        structuredWorkbook.solutions[0],
        [
          "SOL-0000",
          "CLI-0001",
          "Flux Visibilité & Acquisition",
          "Actif",
          "Acquisition digitale",
          "",
          "",
          "2026-07-06",
          ""
        ],
        [
          "SOL-0001",
          "CLI-0001",
          "Flux Automatisation & IA",
          "Actif",
          "Automatisation reporting",
          "",
          "",
          "2026-07-06",
          ""
        ],
        [
          "SOL-0002",
          "CLI-0001",
          "Flux Assistant IA",
          "Actif",
          "Assistant support",
          "",
          "",
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
          "",
          "",
          "2026-07-06",
          ""
        ],
        [
          "SOL-0002",
          "CLI-0001",
          "Flux Assistant IA",
          "En pause",
          "Assistant en pause",
          "",
          "",
          "2026-07-06",
          ""
        ],
        [
          "SOL-0001",
          "CLI-0001",
          "automation_ai",
          "Inactif",
          "Automatisation en pause",
          "",
          "",
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
