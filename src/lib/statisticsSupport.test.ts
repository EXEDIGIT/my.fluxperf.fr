import { describe, expect, it } from "vitest";
import { statisticsSupportPreset } from "./statisticsSupport";

describe("statisticsSupportPreset", () => {
  it("prepares a contextual GA4 support request", () => {
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

    expect(preset.subject).toBe("Aide au raccordement des statistiques GA4");
    expect(preset.message).toContain("example.fr");
    expect(preset.message).toContain("raccordement GA4");
  });

  it("names Google Ads when it is the pending provider", () => {
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

    expect(preset.subject).toBe("Aide au raccordement des statistiques Google Ads");
    expect(preset.message).toContain("raccordement Google Ads");
  });
});
