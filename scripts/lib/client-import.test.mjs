import { describe, expect, it } from "vitest";
import { authenticationEmails, buildImportPlan, parseCsv, rowsForClient } from "./client-import.mjs";

const clients = parseCsv("client_key;organisation;email_principal\nalpha;Alpha;alice@alpha.test\n");
const contacts = parseCsv("client_key;prenom;nom;email;contact_principal\nalpha;Alice;Martin;alice@alpha.test;Oui\n");
const solutions = parseCsv("client_key;type_solution;nom_solution;statut_solution;url_ou_indication\nalpha;Flux Visibilité & Acquisition;Site web;Actif;https://alpha.test\n");

describe("client import package", () => {
  it("parses quoted semicolon CSV values", () => {
    expect(parseCsv('client_key;organisation;email_principal\na;"Alpha; SAS";a@example.test\n')[0].values.organisation).toBe("Alpha; SAS");
  });

  it("marks incomplete clients as drafts without rejecting their data", () => {
    const plan = buildImportPlan({ clients, contacts: parseCsv("client_key;prenom;nom;email;contact_principal\n"), solutions, workbook: {} });
    expect(plan.clients[0]).toMatchObject({ status: "draft" });
    expect(plan.clients[0].completeness).toContain("aucun contact");
  });

  it("does not create active rows for a draft", () => {
    const plan = buildImportPlan({ clients, contacts: parseCsv("client_key;prenom;nom;email;contact_principal\n"), solutions, workbook: {} });
    const rows = rowsForClient(plan.clients[0], { clientId: "CLI-1", contactIds: [], solutionIds: ["SOL-1"], actionId: "ACT-1" }, new Date("2026-08-31T10:00:00Z"));
    expect(rows.clientRow[3]).toBe("Brouillon");
    expect(rows.clientRow[4]).toBe("Non");
    expect(rows.solutionRows[0][3]).toBe("En cours d'activation");
  });

  it("reports existing email conflicts", () => {
    const plan = buildImportPlan({ clients, contacts, solutions, workbook: { clients: [["client_id", "organisation", "email_principal"], ["CLI-OLD", "Other", "alice@alpha.test"]] } });
    expect(plan.clients[0]).toMatchObject({ status: "ignored" });
  });

  it("rejects a contact email assigned to another imported client", () => {
    const otherClients = parseCsv("client_key;organisation;email_principal\nalpha;Alpha;alice@alpha.test\nbeta;Beta;betty@beta.test\n");
    const otherContacts = parseCsv("client_key;prenom;nom;email;contact_principal\nalpha;Alice;Martin;shared@example.test;Oui\nbeta;Betty;Martin;shared@example.test;Oui\n");
    const otherSolutions = parseCsv("client_key;type_solution;nom_solution;statut_solution\nalpha;Flux Automatisation & IA;Tableau de bord;Actif\nbeta;Flux Automatisation & IA;Tableau de bord;Actif\n");
    const plan = buildImportPlan({ clients: otherClients, contacts: otherContacts, solutions: otherSolutions, workbook: {} });
    expect(plan.clients.map((item) => item.status)).toEqual(["ready", "ignored"]);
  });

  it("provisions every distinct contact email", () => {
    const moreContacts = parseCsv("client_key;prenom;nom;email;contact_principal\nalpha;Alice;Martin;alice@alpha.test;Oui\nalpha;Louis;Martin;louis@alpha.test;Non\n");
    const plan = buildImportPlan({ clients, contacts: moreContacts, solutions, workbook: {} });
    expect(authenticationEmails(plan.clients[0])).toEqual(["alice@alpha.test", "louis@alpha.test"]);
  });

  it("rejects a solution name that does not belong to its family", () => {
    const invalidSolutions = parseCsv("client_key;type_solution;nom_solution;statut_solution\nalpha;Flux Assistant IA;Site web;Actif\n");
    const plan = buildImportPlan({ clients, contacts, solutions: invalidSolutions, workbook: {} });

    expect(plan.clients[0]).toMatchObject({ status: "ignored" });
    expect(plan.clients[0].conflicts).toContain("solution ligne 2 : association famille et type de solution invalide");
  });

  it("writes the canonical spelling for accepted solution values", () => {
    const canonicalizedSolutions = parseCsv("client_key;type_solution;nom_solution;statut_solution\nalpha;Flux Assistant IA;copilote entreprise - alzy;Actif\n");
    const plan = buildImportPlan({ clients, contacts, solutions: canonicalizedSolutions, workbook: {} });
    const rows = rowsForClient(plan.clients[0], { clientId: "CLI-1", contactIds: ["CON-1"], solutionIds: ["SOL-1"], actionId: "ACT-1" });

    expect(rows.solutionRows[0][2]).toBe("Flux Assistant IA");
    expect(rows.solutionRows[0][4]).toBe("Copilote entreprise - Alzy");
  });
});
