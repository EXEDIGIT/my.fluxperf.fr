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
      devices: [expect.objectContaining({ label: "Mobile", clicks: 60 })]
    });
    expect(fetcher).toHaveBeenCalledTimes(4);

    const queries = fetcher.mock.calls.map((call) => String(JSON.parse(String(call[1]?.body)).query)).join("\n").toLowerCase();

    expect(queries).toContain("metrics.impressions");
    expect(queries).toContain("metrics.clicks");
    expect(queries).toContain("metrics.conversions");
    expect(queries).not.toMatch(/cost|cpc|budget|currency|conversion_value/);
    expect(fetcher.mock.calls[0]?.[1]?.headers).toMatchObject({
      "developer-token": "developer-token",
      "login-customer-id": "1112223333"
    });
  });
});
