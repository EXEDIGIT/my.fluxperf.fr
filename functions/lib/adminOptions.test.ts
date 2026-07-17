import { describe, expect, it } from "vitest";
import { buildAdminSolutionOptions, fallbackAdminSolutionOptions } from "./adminOptions";

describe("admin solution options", () => {
  it("builds solution options from the Parametres sheet", () => {
    const options = buildAdminSolutionOptions([
      ["categorie", "valeur"],
      ["type_solution", "Flux Visibilité & Acquisition"],
      ["type_solution", "Flux Automatisation & IA"],
      ["nom_solution", "Flux Visibilité & Acquisition • Site web"],
      ["nom_solution", "Flux Visibilité & Acquisition • Site e-shop"],
      ["nom_solution", "Flux Automatisation & IA • Tableau de bord"]
    ]);

    expect(options).toEqual([
      {
        type: "visibility_acquisition",
        label: "Flux Visibilité & Acquisition",
        defaultName: "Flux Visibilité & Acquisition • Site web",
        nameOptions: [
          "Flux Visibilité & Acquisition • Site web",
          "Flux Visibilité & Acquisition • Site e-shop"
        ]
      },
      {
        type: "automation_ai",
        label: "Flux Automatisation & IA",
        defaultName: "Flux Automatisation & IA • Tableau de bord",
        nameOptions: ["Flux Automatisation & IA • Tableau de bord"]
      }
    ]);
  });

  it("falls back when Parametres is empty", () => {
    expect(buildAdminSolutionOptions([])).toEqual(fallbackAdminSolutionOptions);
  });
});
