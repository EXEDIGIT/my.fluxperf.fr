import { describe, expect, it } from "vitest";
import {
  buildAdminSolutionOptions,
  canonicalNameForType,
  fallbackAdminSolutionOptions,
  optionAllowsSolution
} from "./adminOptions";

describe("admin solution options", () => {
  it("returns the seven canonical solutions independently from legacy Sheet values", () => {
    const options = buildAdminSolutionOptions([
      ["categorie", "valeur"],
      ["nom_solution", "Synchronisation de données"],
      ["nom_solution", "Copilote entreprise"]
    ]);

    expect(options).toEqual(fallbackAdminSolutionOptions);
    expect(options.find((option) => option.type === "automation_ai")?.nameOptions).toEqual([
      "Tableau de bord",
      "Automatisation & Synchronisation"
    ]);
    expect(options.find((option) => option.type === "assistant_ai")?.nameOptions).toEqual([
      "Copilote entreprise - Alzy"
    ]);
  });

  it("accepts a canonical family/name pair and canonicalizes harmless casing", () => {
    expect(optionAllowsSolution(fallbackAdminSolutionOptions, "assistant_ai", "copilote entreprise - alzy")).toBe(true);
    expect(canonicalNameForType("assistant_ai", "copilote entreprise - alzy")).toBe("Copilote entreprise - Alzy");
  });

  it("rejects legacy, prefixed and cross-family names", () => {
    expect(optionAllowsSolution(fallbackAdminSolutionOptions, "automation_ai", "Synchronisation de données")).toBe(false);
    expect(optionAllowsSolution(fallbackAdminSolutionOptions, "assistant_ai", "Flux Assistant IA • Copilote entreprise")).toBe(false);
    expect(optionAllowsSolution(fallbackAdminSolutionOptions, "assistant_ai", "Site web")).toBe(false);
  });
});
