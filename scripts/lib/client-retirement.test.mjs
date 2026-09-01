import { describe, expect, it } from "vitest";
import { buildClientRetirementPlan, deletionRequests, PILOT_RETIREMENT_TARGET } from "./client-retirement.mjs";

const clientId = PILOT_RETIREMENT_TARGET.clientId;

function workbook() {
  return {
    Clients: [["client_id", "organisation", "email_principal"], [clientId, "GabyPower", "dacunha.t@gmail.com"]],
    Contacts: [["contact_id", "client_id"], ["CON-1", clientId]],
    Solutions: [["solution_id", "client_id"], ["SOL-1", clientId], ["SOL-2", clientId], ["SOL-3", clientId]],
    Actions: [["action_id", "client_id"], ["ACT-1", clientId]],
    Connexions: [["connexion_id", "client_id"], ["CNX-1", clientId], ["CNX-2", clientId]],
    Archive_Sites: [["site_id", "client_id"]],
    Documents: [["document_id", "client_id"]]
  };
}

describe("pilot client retirement", () => {
  it("targets every linked row of the approved pilot client only", () => {
    const plan = buildClientRetirementPlan({ workbook: workbook() });

    expect(plan.status).toBe("ready");
    expect(plan.counts).toMatchObject({ Clients: 1, Contacts: 1, Solutions: 3, Actions: 1, Connexions: 2 });
    expect(plan.errors).toEqual([]);
  });

  it("blocks a client row whose identity no longer matches the approved target", () => {
    const values = workbook();
    values.Clients[1][1] = "Autre organisation";

    const plan = buildClientRetirementPlan({ workbook: values });

    expect(plan.status).toBe("blocked");
    expect(plan.errors).toContain("Organisation inattendue pour le client cible.");
  });

  it("deletes rows in descending order per sheet", () => {
    const plan = buildClientRetirementPlan({ workbook: workbook() });
    const requests = deletionRequests(plan, [
      { title: "Clients", sheetId: 1 },
      { title: "Contacts", sheetId: 2 },
      { title: "Solutions", sheetId: 3 },
      { title: "Actions", sheetId: 4 },
      { title: "Connexions", sheetId: 5 }
    ]);

    const solutionRows = requests.filter((request) => request.deleteDimension.range.sheetId === 3).map((request) => request.deleteDimension.range.startIndex);
    expect(solutionRows).toEqual([3, 2, 1]);
  });
});
