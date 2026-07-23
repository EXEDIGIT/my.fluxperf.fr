import { describe, expect, it, vi } from "vitest";
import { fetchGoogleAdsStatistics } from "./googleAds";

vi.mock("./googleSheets", async () => {
  const actual = await vi.importActual<typeof import("./googleSheets")>("./googleSheets");

  return {
    ...actual,
    getGoogleAccessTokenForScope: vi.fn(async () => "ads-token")
  };
});

const solution = {
  id: "SOL-ADS",
  type: "visibility_acquisition",
  typeLabel: "Flux Visibilité & Acquisition",
  status: "Actif",
  name: "Publicité Google Ads",
  domain: "",
  url: "Campagnes nationales",
  activatedAt: "",
  thumbnail: { kind: "placeholder" as const, endpoint: null, placeholderKey: "google_ads" as const },
  statistics: { status: "available" as const, provider: "google_ads" as const }
};

describe("Google Ads statistics", () => {
  it("requests client-friendly metrics without financial fields", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ results: [{ metrics: { impressions: "1200", clicks: "84", conversions: "11", ctr: "0.07" } }] }]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ results: [{ segments: { date: "2026-07-20" }, metrics: { clicks: "84", conversions: "11" } }] }]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ results: [{ campaign: { name: "Recherche locale" }, metrics: { impressions: "1200", clicks: "84", conversions: "11", ctr: "0.07" } }] }]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ results: [{ segments: { device: "MOBILE" }, metrics: { impressions: "800", clicks: "60", conversions: "8", ctr: "0.075" } }] }]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ results: [{ segments: { keyword: { info: { text: "assurance auto" } } }, metrics: { impressions: "460", clicks: "42", conversions: "6", ctr: "0.091" } }] }]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              results: [
                {
                  geographicView: { countryCriterionId: "2250" },
                  segments: { geoTargetCity: "geoTargetConstants/1006368" },
                  metrics: { impressions: "780", clicks: "54", conversions: "8", ctr: "0.069" }
                },
                {
                  geographicView: { countryCriterionId: "2276" },
                  metrics: { impressions: "210", clicks: "16", conversions: "2", ctr: "0.076" }
                }
              ]
            }
          ]),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              results: [
                { geoTargetConstant: { resourceName: "geoTargetConstants/1006368", name: "Lyon", countryCode: "FR" } },
                { geoTargetConstant: { resourceName: "geoTargetConstants/2250", name: "France", countryCode: "FR" } },
                { geoTargetConstant: { resourceName: "geoTargetConstants/2276", name: "Allemagne", countryCode: "DE" } }
              ]
            }
          ]),
          { status: 200 }
        )
      );

    const result = await fetchGoogleAdsStatistics(
      {
        APP_ENV: "production",
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.com",
        GOOGLE_PRIVATE_KEY: "private-key",
        GOOGLE_ADS_DEVELOPER_TOKEN: "\u200Bdeveloper-token",
        GOOGLE_ADS_LOGIN_CUSTOMER_ID: "111-222-3333"
      },
      "123-456-7890",
      solution,
      "30d",
      fetcher
    );

    expect(result).toMatchObject({
      status: "ready",
      provider: "google_ads",
      overview: {
        impressions: 1200,
        clicks: 84,
        conversions: 11,
        clickThroughRate: 7
      },
      campaigns: [expect.objectContaining({ label: "Recherche locale", clicks: 84 })],
      keywords: [expect.objectContaining({ label: "assurance auto", clicks: 42 })],
      locations: [
        expect.objectContaining({ label: "Lyon, France", clicks: 54 }),
        expect.objectContaining({ label: "Allemagne", clicks: 16 })
      ],
      devices: [expect.objectContaining({ label: "Mobile", clicks: 60 })]
    });
    expect(fetcher).toHaveBeenCalledTimes(7);

    const queries = fetcher.mock.calls.map((call) => String(JSON.parse(String(call[1]?.body)).query)).join("\n").toLowerCase();

    expect(queries).toContain("metrics.impressions");
    expect(queries).toContain("metrics.clicks");
    expect(queries).toContain("metrics.conversions");
    expect(queries).toContain("from keyword_view");
    expect(queries).toContain("segments.keyword.info.text");
    expect(queries).toContain("ad_group_criterion.negative = false");
    expect(queries).toContain("from geographic_view");
    expect(queries).toContain("location_of_presence");
    expect(queries).toContain("from geo_target_constant");
    expect(queries).not.toMatch(/cost|cpc|budget|currency|conversion_value/);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      "developer-token": "developer-token",
      "login-customer-id": "1112223333"
    });
  });

  it("keeps an empty geographic list when Google Ads has no usable location data", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ results: [{ metrics: { impressions: "1200", clicks: "84", conversions: "11", ctr: "0.07" } }] }]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ results: [{ segments: { date: "2026-07-20" }, metrics: { clicks: "84", conversions: "11" } }] }]), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify([{ results: [] }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ results: [] }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ results: [] }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ results: [] }]), { status: 200 }));

    const result = await fetchGoogleAdsStatistics(
      {
        APP_ENV: "production",
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.com",
        GOOGLE_PRIVATE_KEY: "private-key",
        GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token"
      },
      "1234567890",
      solution,
      "30d",
      fetcher
    );

    expect(result.locations).toEqual([]);
    expect(fetcher).toHaveBeenCalledTimes(6);
  });

  it("keeps the main dashboard available when an optional report is rejected", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ results: [{ metrics: { impressions: "1200", clicks: "84", conversions: "11", ctr: "0.07" } }] }]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ results: [{ segments: { date: "2026-07-20" }, metrics: { clicks: "84", conversions: "11" } }] }]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ results: [{ campaign: { name: "Recherche locale" }, metrics: { impressions: "1200", clicks: "84", conversions: "11", ctr: "0.07" } }] }]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify([{ results: [{ segments: { device: "MOBILE" }, metrics: { impressions: "800", clicks: "60", conversions: "8", ctr: "0.075" } }] }]), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Keyword report is unavailable" } }), { status: 400 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ error: { message: "Location report is unavailable" } }), { status: 400 })
      );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const warningSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);

    const result = await fetchGoogleAdsStatistics(
      {
        APP_ENV: "production",
        GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.com",
        GOOGLE_PRIVATE_KEY: "private-key",
        GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token"
      },
      "1234567890",
      solution,
      "30d",
      fetcher
    );

    expect(result.overview.clicks).toBe(84);
    expect(result.campaigns).toHaveLength(1);
    expect(result.devices).toHaveLength(1);
    expect(result.keywords).toEqual([]);
    expect(result.locations).toEqual([]);
    expect(warningSpy).toHaveBeenCalledWith(
      "google_ads_optional_report_unavailable",
      expect.objectContaining({ report: "keywords" })
    );
    expect(warningSpy).toHaveBeenCalledWith(
      "google_ads_optional_report_unavailable",
      expect.objectContaining({ report: "locations" })
    );

    errorSpy.mockRestore();
    warningSpy.mockRestore();
  });

  it("reports the Google Ads HTTP status without logging credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () =>
      new Response("Access denied", {
        status: 403,
        statusText: "Forbidden",
        headers: { "request-id": "google-request-id" }
      })
    );
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => undefined);

    await expect(
      fetchGoogleAdsStatistics(
        {
          APP_ENV: "production",
          GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.com",
          GOOGLE_PRIVATE_KEY: "private-key",
          GOOGLE_ADS_DEVELOPER_TOKEN: "developer-token"
        },
        "1234567890",
        solution,
        "30d",
        fetcher
      )
    ).rejects.toThrow("Google Ads API 403: Access denied");

    expect(errorSpy).toHaveBeenCalledWith(
      "google_ads_api_request_failed",
      expect.objectContaining({
        status: 403,
        requestId: "google-request-id",
        message: "Access denied"
      })
    );
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("developer-token");
  });
});
