import { describe, expect, it } from "vitest";
import { clientEmails, findClientForEmail, parseClientRows } from "./clients";

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
});

