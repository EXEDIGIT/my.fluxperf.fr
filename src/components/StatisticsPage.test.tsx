import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { StatisticsPage } from "./StatisticsPage";

describe("StatisticsPage", () => {
  it("offers support when statistics are pending setup", () => {
    const html = renderToStaticMarkup(
      <StatisticsPage
        solution={{
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
        }}
        onBack={() => undefined}
        onSupportRequest={() => undefined}
      />
    );

    expect(html).toContain("Statistiques en cours de raccordement");
    expect(html).toContain("Contacter le support");
  });
});
