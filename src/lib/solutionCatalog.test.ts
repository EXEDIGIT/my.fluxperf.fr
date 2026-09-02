import { describe, expect, it } from "vitest";
import { isWebsiteSolutionName } from "./solutionCatalog";

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
});
