import { describe, expect, it } from "vitest";
import { buildSheetImportPackage } from "./import-sheet.mjs";

const clientHeaders = [
  "Référence client*",
  "Organisation*",
  "Email principal*",
  "Prénom contact principal*",
  "Nom contact principal*",
  "Fonction contact principal",
  "Email contact secondaire",
  "Prénom contact secondaire",
  "Nom contact secondaire",
  "Fonction contact secondaire"
];

const serviceHeaders = Array.from({ length: 8 }, (_, index) => {
  const number = index + 1;
  return [
    `Service ${number} — Famille`,
    `Service ${number} — Type`,
    `Service ${number} — URL ou indication`,
    `Service ${number} — ID GA4`,
    `Service ${number} — ID Google Ads`
  ];
}).flat();

const headers = [...clientHeaders, ...serviceHeaders, "Notes internes"];

function row(rowNumber, values) {
  const result = Array(headers.length).fill("");
  Object.entries(values).forEach(([header, value]) => {
    result[headers.indexOf(header)] = value;
  });
  return { rowNumber, values: result };
}

function validRow(rowNumber = 6) {
  return row(rowNumber, {
    "Référence client*": "MFP-001",
    "Organisation*": "ACME",
    "Email principal*": "contact@acme.test",
    "Prénom contact principal*": "Camille",
    "Nom contact principal*": "Martin",
    "Fonction contact principal": "Direction",
    "Service 1 — Famille": "Flux Visibilité & Acquisition",
    "Service 1 — Type": "Site web",
    "Service 1 — URL ou indication": "https://www.acme.test",
    "Service 1 — ID GA4": "123456789"
  });
}

describe("Google Sheet import preparation", () => {
  it("creates the three import tables from a primary and secondary contact", () => {
    const source = validRow();
    source.values[headers.indexOf("Email contact secondaire")] = "finance@acme.test";
    source.values[headers.indexOf("Prénom contact secondaire")] = "Lou";
    source.values[headers.indexOf("Nom contact secondaire")] = "Durand";
    source.values[headers.indexOf("Service 2 — Famille")] = "Flux Automatisation & IA";
    source.values[headers.indexOf("Service 2 — Type")] = "Tableau de bord";

    const result = buildSheetImportPackage({ headers, rows: [source] });

    expect(result.errors).toEqual([]);
    expect(result.clients).toEqual([expect.objectContaining({ client_key: "MFP-001", organisation: "ACME" })]);
    expect(result.contacts).toEqual([
      expect.objectContaining({ email: "contact@acme.test", contact_principal: "Oui" }),
      expect.objectContaining({ email: "finance@acme.test", contact_principal: "Non", role_contact: "Contact" })
    ]);
    expect(result.solutions).toEqual([
      expect.objectContaining({ nom_solution: "Site web", ga4_property_id: "123456789" }),
      expect.objectContaining({ type_solution: "Flux Automatisation & IA", nom_solution: "Tableau de bord" })
    ]);
  });

  it("maps all eight service blocks with only canonical pairs", () => {
    const source = validRow();
    const values = [
      ["Flux Visibilité & Acquisition", "Site web"],
      ["Flux Visibilité & Acquisition", "Site e-shop"],
      ["Flux Visibilité & Acquisition", "Publicité Google Ads"],
      ["Flux Visibilité & Acquisition", "Réseaux sociaux"],
      ["Flux Automatisation & IA", "Tableau de bord"],
      ["Flux Automatisation & IA", "Automatisation & Synchronisation"],
      ["Flux Assistant IA", "Copilote entreprise - Alzy"],
      ["Flux Visibilité & Acquisition", "Site web"]
    ];
    values.forEach(([family, name], index) => {
      const number = index + 1;
      source.values[headers.indexOf(`Service ${number} — Famille`)] = family;
      source.values[headers.indexOf(`Service ${number} — Type`)] = name;
    });

    const result = buildSheetImportPackage({ headers, rows: [source] });

    expect(result.errors).toEqual([]);
    expect(result.solutions).toHaveLength(8);
    expect(result.solutions.map((solution) => solution.nom_solution)).toContain("Copilote entreprise - Alzy");
  });

  it("rejects partial services and GA4 measurement IDs", () => {
    const source = validRow();
    source.values[headers.indexOf("Service 1 — ID GA4")] = "G-ABC123";
    source.values[headers.indexOf("Service 2 — Famille")] = "Flux Automatisation & IA";

    const result = buildSheetImportPackage({ headers, rows: [source] });

    expect(result.errors).toEqual([
      expect.objectContaining({
        source_row: "6",
        reason: expect.stringContaining("ID GA4 numérique invalide")
      })
    ]);
    expect(result.errors[0].reason).toContain("Service 2 : famille et type sont obligatoires.");
  });
});
