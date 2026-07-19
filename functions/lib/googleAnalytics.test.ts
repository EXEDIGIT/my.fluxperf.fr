import { describe, expect, it } from "vitest";
import { channelLabel, eventLabel, isHiddenGa4Event, isStatisticsPeriod, statisticsPeriod } from "./googleAnalytics";

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
    expect(channelLabel("Paid Search")).toBe("Publicite");
    expect(channelLabel("Referral")).toBe("Sites referents");
    expect(channelLabel("Direct")).toBe("Direct");
    expect(channelLabel("Email")).toBe("Autres");
  });

  it("hides technical events and renames useful events", () => {
    expect(isHiddenGa4Event("page_view")).toBe(true);
    expect(isHiddenGa4Event("session_start")).toBe(true);
    expect(isHiddenGa4Event("generate_lead")).toBe(false);
    expect(eventLabel("generate_lead")).toBe("Formulaire envoye");
    expect(eventLabel("file_download")).toBe("Telechargement");
    expect(eventLabel("view_search_results")).toBe("Recherche interne");
  });
});
