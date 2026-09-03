import { describe, expect, it } from "vitest";
import { statisticsSupportPreset } from "./statisticsSupport";

describe("statisticsSupportPreset", () => {
  it("prepares a clear support request without technical provider names", () => {
    const preset = statisticsSupportPreset({
      id: "SOL-1",
      type: "visibility_acquisition",
      typeLabel: "Flux Visibilité & Acquisition",
      status: "Actif",
      name: "Site web",
      domain: "example.fr",
      url: "https://example.fr",
      activatedAt: "",
      thumbnail: {
        kind: "website",
        endpoint: "/api/thumbnails/SOL-1",
        placeholderKey: "visibility_acquisition"
      },
      statistics: {
        status: "pending_setup",
        provider: "ga4"
      }
    });

    expect(preset.subject).toBe("Aide pour mes statistiques");
    expect(preset.message).toContain("example.fr");
    expect(preset.message).toContain("l'affichage de mes statistiques");
    expect(preset.message).not.toContain("GA4");
  });

  it("uses the same generic support wording for other statistics providers", () => {
    const preset = statisticsSupportPreset({
      id: "SOL-2",
      type: "visibility_acquisition",
      typeLabel: "Flux Visibilité & Acquisition",
      status: "Actif",
      name: "Publicité Google Ads",
      domain: "",
      url: "",
      activatedAt: "",
      thumbnail: {
        kind: "placeholder",
        endpoint: null,
        placeholderKey: "google_ads"
      },
      statistics: {
        status: "pending_setup",
        provider: "google_ads"
      }
    });

    expect(preset.subject).toBe("Aide pour mes statistiques");
    expect(preset.message).toContain("l'affichage de mes statistiques");
  });
});
