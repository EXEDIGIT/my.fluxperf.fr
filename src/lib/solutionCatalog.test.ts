import { describe, expect, it } from "vitest";
import { canonicalSolutionCatalogType, isWebsiteSolutionName } from "./solutionCatalog";

describe("website solution catalogue", () => {
  it.each(["Site web", "Site e-shop", "Site e shop", "Site eshop"])(
    "recognizes %s as a website solution eligible for GA4",
    (name) => {
      expect(isWebsiteSolutionName(name)).toBe(true);
    }
  );

  it("does not enable GA4 for a non-website solution", () => {
    expect(isWebsiteSolutionName("Tableau de bord")).toBe(false);
  });

  it.each([
    ["visibility_acquisition", "visibility_acquisition"],
    ["Flux Visibilité & Acquisition", "visibility_acquisition"],
    ["Flux Visibilite et Acquisition", "visibility_acquisition"],
    ["Flux Automatisation & IA", "automation_ai"],
    ["Flux Assistant IA", "assistant_ai"]
  ] as const)("normalizes %s to %s", (value, expected) => {
    expect(canonicalSolutionCatalogType(value)).toBe(expected);
  });
});
