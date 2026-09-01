import { describe, expect, it } from "vitest";
import {
  EXPECTED_FRESH_COUNTS,
  PRESERVED_ADMIN_EMAIL,
  TEST_CLIENT_RESET_TARGETS,
  buildTestClientsResetPlan,
  deletionRequests
} from "./client-test-reset.mjs";

function rows(prefix, clientId, count, headers = ["id", "client_id"]) {
  void headers;
  return Array.from({ length: count }, (_, index) => [`${prefix}-${clientId}-${index + 1}`, clientId]);
}

function workbook() {
  const clients = [["client_id", "organisation", "email_principal"]];
  const contacts = [["contact_id", "client_id"]];
  const solutions = [["solution_id", "client_id"]];
  const actions = [["action_id", "client_id"]];
  const connexions = [["connexion_id", "client_id"]];
  const archives = [["site_id", "client_id", "domaine"]];

  TEST_CLIENT_RESET_TARGETS.forEach((target, index) => {
    clients.push([target.clientId, target.organisation, target.email]);
    contacts.push([`CON-${index + 1}`, target.clientId]);
  });
  solutions.push(...rows("SOL", TEST_CLIENT_RESET_TARGETS[0].clientId, 6));
  solutions.push(...rows("SOL", TEST_CLIENT_RESET_TARGETS[1].clientId, 3));
  solutions.push(...rows("SOL", TEST_CLIENT_RESET_TARGETS[2].clientId, 3));
  solutions.push(...rows("SOL", TEST_CLIENT_RESET_TARGETS[3].clientId, 5));
  solutions.push(...rows("SOL", TEST_CLIENT_RESET_TARGETS[4].clientId, 1));
  actions.push(...rows("ACT", TEST_CLIENT_RESET_TARGETS[0].clientId, 6));
  actions.push(...rows("ACT", TEST_CLIENT_RESET_TARGETS[1].clientId, 4));
  actions.push(...rows("ACT", TEST_CLIENT_RESET_TARGETS[2].clientId, 1));
  actions.push(...rows("ACT", TEST_CLIENT_RESET_TARGETS[3].clientId, 2));
  actions.push(...rows("ACT", TEST_CLIENT_RESET_TARGETS[4].clientId, 1));
  connexions.push(...rows("CNX", TEST_CLIENT_RESET_TARGETS[0].clientId, 18));
  connexions.push(...rows("CNX", TEST_CLIENT_RESET_TARGETS[2].clientId, 2));
  connexions.push(...rows("CNX", TEST_CLIENT_RESET_TARGETS[1].clientId, 1));
  archives.push(["SITE-1", TEST_CLIENT_RESET_TARGETS[0].clientId, "hbint.com"]);
  archives.push(["SITE-0002", '"Solutions', "trial.hbint.com"]);

  return {
    Clients: clients,
    Contacts: contacts,
    Solutions: solutions,
    Actions: actions,
    Connexions: connexions,
    Archive_Sites: archives
  };
}

describe("test clients reset", () => {
  it("targets the exact known test data and preserves the administration allow-list", () => {
    const plan = buildTestClientsResetPlan({ workbook: workbook(), adminEmails: `ops@example.test, ${PRESERVED_ADMIN_EMAIL}` });

    expect(plan.status).toBe("ready");
    expect(plan.counts).toEqual(EXPECTED_FRESH_COUNTS);
    expect(plan.solutionIds).toHaveLength(18);
    expect(plan.errors).toEqual([]);
  });

  it("blocks an unexpected client in any managed sheet", () => {
    const values = workbook();
    values.Actions.push(["ACT-UNKNOWN", "CLI-PRODUCTION"]);

    const plan = buildTestClientsResetPlan({ workbook: values, adminEmails: PRESERVED_ADMIN_EMAIL });

    expect(plan.status).toBe("blocked");
    expect(plan.errors.join(" ")).toContain("CLI-PRODUCTION");
  });

  it("removes the one approved malformed archive test row and no other orphan", () => {
    const plan = buildTestClientsResetPlan({ workbook: workbook(), adminEmails: PRESERVED_ADMIN_EMAIL });

    expect(plan.counts.Archive_Sites).toBe(2);
    expect(plan.status).toBe("ready");
  });

  it("blocks if the administrator is not in ADMIN_EMAILS", () => {
    const plan = buildTestClientsResetPlan({ workbook: workbook(), adminEmails: "other@example.test" });

    expect(plan.status).toBe("blocked");
    expect(plan.errors.join(" ")).toContain("ADMIN_EMAILS");
  });

  it("is safely resumable after spreadsheet rows have already been removed", () => {
    const plan = buildTestClientsResetPlan({
      workbook: {
        Clients: [["client_id", "organisation", "email_principal"]],
        Contacts: [["contact_id", "client_id"]],
        Solutions: [["solution_id", "client_id"]],
        Actions: [["action_id", "client_id"]],
        Connexions: [["connexion_id", "client_id"]],
        Archive_Sites: [["site_id", "client_id"]]
      },
      adminEmails: PRESERVED_ADMIN_EMAIL
    });

    expect(plan.status).toBe("already_reset");
    expect(plan.errors).toEqual([]);
  });

  it("builds descending Google Sheets deletion requests", () => {
    const plan = buildTestClientsResetPlan({ workbook: workbook(), adminEmails: PRESERVED_ADMIN_EMAIL });
    const requests = deletionRequests(plan, [
      { title: "Clients", sheetId: 1 },
      { title: "Solutions", sheetId: 2 }
    ]);
    const solutionRows = requests
      .filter((request) => request.deleteDimension.range.sheetId === 2)
      .map((request) => request.deleteDimension.range.startIndex);

    expect(solutionRows).toEqual([...solutionRows].sort((left, right) => right - left));
  });
});
