import { describe, expect, it } from "vitest";
import {
  buildAdminClientDetail,
  buildAdminClientList,
  buildAdminDashboard,
  buildConnectionRow,
  connectionExistsForDay
} from "./adminWorkbook";

const workbook = {
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
    ["CLI-1", "Client Un", "Alpha", "Actif", "Oui", "CON-1", "alpha@example.com", "1", "01/01/2026", "10/07/2026", ""],
    ["CLI-2", "Client Deux", "Beta", "Inactif", "Non", "CON-2", "beta@example.com", "0", "01/01/2026", "11/07/2026", ""]
  ],
  contacts: [
    ["contact_id", "client_id", "prenom", "nom", "email", "role_contact", "contact_principal", "statut_contact"],
    ["CON-1", "CLI-1", "Alice", "Martin", "alpha@example.com", "Contact principal", "Oui", "Actif"]
  ],
  solutions: [
    ["solution_id", "client_id", "type_solution", "statut_solution", "nom_solution", "domaine", "url_ou_indication", "date_activation", "notes"],
    ["SOL-1", "CLI-1", "Flux Visibilite & Acquisition", "Actif", "Site web", "alpha.fr", "alpha.fr", "01/07/2026", ""],
    ["SOL-2", "CLI-1", "Flux Automatisation & IA", "Inactif", "Workflow", "", "Centralisation", "01/07/2026", ""]
  ],
  actions: [
    ["action_id", "client_id", "date_action", "type_action", "libelle_action", "reference", "email_demandeur", "source", "statut", "details"],
    ["ACT-1", "CLI-1", "2026-07-10T10:00:00.000Z", "intervention_request", "Demande envoyee", "FP-1", "alpha@example.com", "myfluxperf", "envoyee", ""],
    ["ACT-2", "CLI-1", "2026-06-10T10:00:00.000Z", "support_request", "Support envoye", "SUP-1", "alpha@example.com", "myfluxperf", "envoyee", ""]
  ],
  connections: [
    ["connexion_id", "client_id", "email", "date_connexion", "jour", "mois", "source", "user_agent"],
    ["CNX-1", "CLI-1", "alpha@example.com", "2026-07-10T10:00:00.000Z", "2026-07-10", "2026-07", "myfluxperf", "test"]
  ]
};

describe("admin workbook helpers", () => {
  it("builds admin client summaries and details", () => {
    const clients = buildAdminClientList(workbook);
    const detail = buildAdminClientDetail(workbook, "CLI-1");

    expect(clients).toHaveLength(2);
    expect(clients[0]).toMatchObject({
      id: "CLI-1",
      companyName: "Alpha",
      activeSolutions: 1,
      totalSolutions: 2
    });
    expect(detail?.contacts[0].email).toBe("alpha@example.com");
    expect(detail?.solutions).toHaveLength(2);
    expect(detail?.actions[0]).toMatchObject({ id: "ACT-1", type: "intervention_request" });
  });

  it("builds dashboard metrics for the last 12 months", () => {
    const dashboard = buildAdminDashboard(workbook, new Date("2026-07-18T10:00:00.000Z"));

    expect(dashboard.totals).toMatchObject({
      activeClients: 1,
      totalClients: 2,
      activeSolutions: 1,
      interventionRequests12Months: 1,
      connections12Months: 1
    });
    expect(dashboard.interventionRequestsByMonth).toHaveLength(12);
    expect(dashboard.topInterventionClients[0]).toMatchObject({ clientId: "CLI-1", count: 1 });
    expect(dashboard.topConnectionClients[0]).toMatchObject({ clientId: "CLI-1", count: 1 });
  });

  it("detects one connection per client and day", () => {
    const request = new Request("https://my.fluxperf.fr/api/me", {
      headers: {
        "user-agent": "Vitest"
      }
    });

    expect(connectionExistsForDay(workbook, "CLI-1", "2026-07-10")).toBe(true);
    expect(buildConnectionRow("CLI-1", "ALPHA@EXAMPLE.COM", request, new Date("2026-07-10T10:00:00.000Z")).slice(1, 7)).toEqual([
      "CLI-1",
      "alpha@example.com",
      "2026-07-10T10:00:00.000Z",
      "2026-07-10",
      "2026-07",
      "myfluxperf"
    ]);
  });
});
