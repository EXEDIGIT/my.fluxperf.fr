import { describe, expect, it } from "vitest";
import { buildNormalizationPlan } from "./solution-normalization.mjs";

const solutions = [
  ["solution_id", "client_id", "type_solution", "statut_solution", "nom_solution"],
  ["SOL-1", "CLI-1", "Flux Visibilité & Acquisition", "Actif", "Flux Visibilité & Acquisition • Site web"],
  ["SOL-2", "CLI-1", "Flux Automatisation & IA", "Actif", "Flux Automatisation & IA • Synchronisation de données"],
  ["SOL-3", "CLI-1", "Flux Assistant IA", "Actif", "Copilote entreprise"],
  ["SOL-4", "CLI-1", "Flux Visibilité & Acquisition", "Actif", "Site e-shop"],
  ["SOL-5", "CLI-1", "Flux Assistant IA", "Actif", "Assistant libre"]
];

const parameters = [
  ["categorie", "valeur"],
  ["nom_solution", "Synchronisation de données"],
  ["nom_solution", "Copilote entreprise"],
  ["nom_solution", "Site web"]
];

describe("solution normalization", () => {
  it("maps only known legacy values and leaves canonical values untouched", () => {
    const plan = buildNormalizationPlan({ solutions, parameters });

    expect(plan.updates).toEqual(expect.arrayContaining([
      expect.objectContaining({ solutionId: "SOL-1", nextName: "Site web", range: "Solutions!E2" }),
      expect.objectContaining({ solutionId: "SOL-2", nextName: "Automatisation & Synchronisation", range: "Solutions!E3" }),
      expect.objectContaining({ solutionId: "SOL-3", nextName: "Copilote entreprise - Alzy", range: "Solutions!E4" }),
      expect.objectContaining({ scope: "Parametres", nextName: "Automatisation & Synchronisation", range: "Parametres!B2" }),
      expect.objectContaining({ scope: "Parametres", nextName: "Copilote entreprise - Alzy", range: "Parametres!B3" })
    ]));
    expect(plan.unchanged).toEqual(expect.arrayContaining([
      expect.objectContaining({ solutionId: "SOL-4", currentName: "Site e-shop" })
    ]));
    expect(plan.exceptions).toEqual([
      expect.objectContaining({ solutionId: "SOL-5", reason: "Famille ou nom de solution hors catalogue" })
    ]);
  });

  it("is idempotent after the known replacements are applied", () => {
    const normalizedSolutions = solutions.map((row) => [...row]);
    normalizedSolutions[1][4] = "Site web";
    normalizedSolutions[2][4] = "Automatisation & Synchronisation";
    normalizedSolutions[3][4] = "Copilote entreprise - Alzy";
    normalizedSolutions.pop();
    const normalizedParameters = parameters.map((row) => [...row]);
    normalizedParameters[1][1] = "Automatisation & Synchronisation";
    normalizedParameters[2][1] = "Copilote entreprise - Alzy";

    const plan = buildNormalizationPlan({ solutions: normalizedSolutions, parameters: normalizedParameters });

    expect(plan.updates).toEqual([]);
    expect(plan.exceptions).toEqual([]);
  });
});
