import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Client } from "../types/client";
import { AccountPage } from "./AccountPage";

const completeClient: Client = {
  id: "CLI-0001",
  status: "Actif",
  companyName: "VILLA DCM",
  firstName: "Laura",
  lastName: "Barba",
  planLabel: "Accompagnement Fluxperf",
  services: [],
  solutions: [],
  impact: {
    weeklyHours: 0,
    monthlyHours: 0,
    items: [],
    isEstimated: true
  },
  links: {
    request: null,
    support: null,
    report: null,
    resources: null
  },
  fluxperfContact: {
    name: "Fluxperf",
    email: "support@fluxperf.fr"
  },
  latestActions: [],
  account: {
    rib: {
      status: "complete",
      submittedAt: null
    }
  }
};

describe("AccountPage", () => {
  it("keeps the replacement CTA available before a new file is selected", () => {
    const html = renderToStaticMarkup(
      <AccountPage client={completeClient} onRibSubmitted={() => undefined} />
    );
    const replacementButton = html.match(/<button class="rib-submit-button"[^>]*>/)?.[0];

    expect(html).toContain("Votre RIB est indiqué comme complet.");
    expect(replacementButton).toContain('type="button"');
    expect(replacementButton).not.toContain("disabled");
    expect(html).toContain("Remplacer mon RIB");
  });
});
