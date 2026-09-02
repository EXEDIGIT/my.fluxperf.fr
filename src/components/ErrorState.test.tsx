import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ApiError } from "../lib/api";
import { ErrorState } from "./ErrorState";

describe("ErrorState", () => {
  it("shows recovery actions when the client is not configured", () => {
    const html = renderToStaticMarkup(
      <ErrorState
        error={
          new ApiError(
            403,
            "CLIENT_NOT_CONFIGURED",
            "Votre accès est authentifié, mais votre espace client n'est pas encore configuré."
          )
        }
        onRequestAccess={() => undefined}
        onRetryLogin={() => undefined}
      />
    );

    expect(html).toContain("Espace client non configuré");
    expect(html).toContain("Réessayer avec une autre adresse");
    expect(html).toContain("Demander un accès à MyFluxperf");
    expect(html).not.toContain("mailto:hello@fluxperf.fr");
  });

  it("keeps the contact action for generic errors", () => {
    const html = renderToStaticMarkup(
      <ErrorState error={new ApiError(503, "DATA_UNAVAILABLE", "Données indisponibles.")} />
    );

    expect(html).toContain("Données indisponibles");
    expect(html).toContain("mailto:hello@fluxperf.fr");
    expect(html).toContain("Contacter Fluxperf");
    expect(html).not.toContain("Réessayer avec une autre adresse");
  });
});
