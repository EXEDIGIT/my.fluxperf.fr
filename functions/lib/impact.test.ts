import { describe, expect, it } from "vitest";
import { calculateImpact, impactKeyForType } from "./impact";

describe("calculateImpact", () => {
  it("uses one identical estimated-time rule for the portal and the monthly report", () => {
    const impact = calculateImpact([
      { type: "Flux Visibilité & Acquisition", name: "Site web" },
      { type: "Flux Visibilité & Acquisition", name: "Google Ads" },
      { type: "Flux Automatisation & IA", name: "Automatisation devis" },
      { type: "Flux Assistant IA", name: "Assistant commercial" }
    ]);

    expect(impact).toMatchObject({ weeklyHours: 6.5, monthlyHours: 28, isEstimated: true });
    expect(impact.items).toEqual([
      expect.objectContaining({ key: "visibility_acquisition", quantity: 2, weeklyHours: 3.5, monthlyHours: 15 }),
      expect.objectContaining({ key: "automation_ai", quantity: 1, weeklyHours: 1, monthlyHours: 4.5 }),
      expect.objectContaining({ key: "assistant_ai", quantity: 1, weeklyHours: 2, monthlyHours: 8.5 })
    ]);
  });

  it("normalizes the supported service-type aliases and ignores unrelated solutions", () => {
    expect(impactKeyForType("Flux Automatisation & IA")).toBe("automation_ai");
    expect(impactKeyForType("Flux Assistant IA")).toBe("assistant_ai");
    expect(calculateImpact([{ type: "Site web", name: "Site web" }])).toMatchObject({ monthlyHours: 0, items: [] });
  });
});
