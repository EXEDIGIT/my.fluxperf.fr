import { describe, expect, it, vi } from "vitest";
import {
  aggregateTimelinePoints,
  channelLabel,
  channelPresentation,
  countryPresentation,
  eventLabel,
  fetchGa4Statistics,
  isHiddenGa4Event,
  isStatisticsPeriod,
  pageLabel,
  sourcePresentation,
  statisticsPeriod,
  timelineGranularity
} from "./googleAnalytics";

vi.mock("./googleSheets", async () => {
  const actual = await vi.importActual<typeof import("./googleSheets")>("./googleSheets");

  return {
    ...actual,
    getGoogleAccessTokenForScope: vi.fn(async () => "analytics-token")
  };
});

describe("google analytics statistics helpers", () => {
  it("validates the supported periods", () => {
    expect(isStatisticsPeriod("7d")).toBe(true);
    expect(isStatisticsPeriod("365d")).toBe(true);
    expect(isStatisticsPeriod("14d")).toBe(false);
    expect(statisticsPeriod("365d")).toMatchObject({
      label: "Depuis 1 an",
      startDate: "365daysAgo",
      endDate: "yesterday"
    });
  });

  it("groups GA4 channel labels into client-friendly acquisition families", () => {
    expect(channelLabel("Organic Search")).toBe("SEO");
    expect(channelLabel("Organic Social")).toBe("Social");
    expect(channelLabel("AI Assistants")).toBe("IA GEO");
    expect(channelLabel("Paid Search")).toBe("Publicité");
    expect(channelLabel("Referral")).toBe("Sites référents");
    expect(channelLabel("Direct")).toBe("Direct");
    expect(channelLabel("Email")).toBe("Autres");
    expect(channelPresentation("Direct")).toEqual({
      label: "Direct",
      description: "Adresse saisie, favori ou origine non détectée"
    });
  });

  it("turns GA4 sources, pages and countries into friendly labels", () => {
    expect(sourcePresentation("google / organic")).toEqual({
      label: "Google",
      description: "Moteur de recherche"
    });
    expect(sourcePresentation("(direct) / (none)")).toEqual({
      label: "Accès direct",
      description: "Origine non détectée"
    });
    expect(sourcePresentation("(not set)")).toEqual({ label: "Source non identifiée" });
    expect(pageLabel("/")).toBe("/ • Page d’accueil");
    expect(countryPresentation("Germany", "DE")).toEqual({ label: "Allemagne", countryCode: "DE" });
    expect(countryPresentation("(not set)", "")).toEqual({ label: "Non identifié" });
  });

  it("hides technical events and renames useful events", () => {
    expect(isHiddenGa4Event("page_view")).toBe(true);
    expect(isHiddenGa4Event("session_start")).toBe(true);
    expect(isHiddenGa4Event("generate_lead")).toBe(false);
    expect(eventLabel("generate_lead")).toBe("Formulaire envoye");
    expect(eventLabel("file_download")).toBe("Telechargement");
    expect(eventLabel("view_search_results")).toBe("Recherche interne");
  });

  it("aggregates timeline points according to the selected period", () => {
    const dailyPoints = [
      { date: "2026-07-01", visits: 2 },
      { date: "2026-07-02", visits: 3 },
      { date: "2026-07-06", visits: 5 },
      { date: "2026-08-01", visits: 7 }
    ];

    expect(timelineGranularity("30d")).toBe("day");
    expect(aggregateTimelinePoints(dailyPoints, "30d").points).toEqual(dailyPoints);
    expect(aggregateTimelinePoints(dailyPoints, "90d")).toEqual({
      granularity: "week",
      points: [
        { date: "2026-06-29", visits: 5 },
        { date: "2026-07-06", visits: 5 },
        { date: "2026-07-27", visits: 7 }
      ]
    });
    expect(aggregateTimelinePoints(dailyPoints, "365d")).toEqual({
      granularity: "month",
      points: [
        { date: "2026-07-01", visits: 10 },
        { date: "2026-08-01", visits: 7 }
      ]
    });
  });

  it("builds geographic and timeline data from GA4 reports", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            reports: [
              { rows: [{ metricValues: [{ value: "12" }, { value: "9" }, { value: "75" }] }] },
              {
                rows: [
                  {
                    dimensionValues: [{ value: "Organic Search" }],
                    metricValues: [{ value: "7" }, { value: "6" }, { value: "80" }]
                  }
                ]
              },
              {
                rows: [
                  {
                    dimensionValues: [{ value: "google / organic" }],
                    metricValues: [{ value: "7" }, { value: "6" }, { value: "80" }]
                  }
                ]
              },
              {
                rows: [
                  {
                    dimensionValues: [{ value: "Germany" }, { value: "DE" }],
                    metricValues: [{ value: "6" }]
                  }
                ]
              },
              {
                rows: [
                  {
                    dimensionValues: [{ value: "(not set)" }],
                    metricValues: [{ value: "4" }]
                  }
                ]
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            reports: [
              {
                rows: [
                  {
                    dimensionValues: [{ value: "/" }],
                    metricValues: [{ value: "10" }, { value: "70" }]
                  }
                ]
              },
              {
                rows: [
                  {
                    dimensionValues: [{ value: "generate_lead" }],
                    metricValues: [{ value: "2" }]
                  }
                ]
              },
              {
                rows: [
                  { dimensionValues: [{ value: "20260701" }], metricValues: [{ value: "5" }] },
                  { dimensionValues: [{ value: "20260702" }], metricValues: [{ value: "7" }] }
                ]
              }
            ]
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        )
      );
    const result = await fetchGa4Statistics(
      {
        APP_ENV: "production",
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "analytics@example.com",
        GOOGLE_PRIVATE_KEY: "private-key"
      },
      "123456789",
      {
        id: "SOL-1",
        type: "visibility_acquisition",
        typeLabel: "Flux Visibilité & Acquisition",
        status: "Actif",
        name: "Site web",
        domain: "example.com",
        url: "https://example.com",
        activatedAt: "",
        thumbnail: { kind: "website", endpoint: null, placeholderKey: "visibility_acquisition" },
        statistics: { status: "available", provider: "ga4" }
      },
      "30d",
      fetcher
    );

    expect(result.overview.countries).toEqual([
      { label: "Allemagne", countryCode: "DE", value: 6, percentage: 100 }
    ]);
    expect(result.overview.cities[0]?.label).toBe("Non identifié");
    expect(result.behavior.pages[0]?.label).toBe("/ • Page d’accueil");
    expect(result.acquisition.channels[0]).toMatchObject({
      label: "SEO",
      description: "Moteurs de recherche"
    });
    expect(result.timeline).toEqual({
      granularity: "day",
      points: [
        { date: "2026-07-01", visits: 5 },
        { date: "2026-07-02", visits: 7 }
      ]
    });
    expect(result.timeline.points.reduce((sum, point) => sum + point.visits, 0)).toBe(result.overview.visits);

    const secondRequest = JSON.parse(String(fetcher.mock.calls[1]?.[1]?.body));
    expect(secondRequest.requests[2]).toMatchObject({
      dimensions: [{ name: "date" }],
      metrics: [{ name: "sessions" }],
      keepEmptyRows: true,
      limit: "400"
    });
  });
});
