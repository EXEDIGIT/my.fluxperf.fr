import { describe, expect, it } from "vitest";
import { aggregate, allowedClientIds, configuredProperties, delta, eligibleClients, expiresAt, insight, isSchedulingWindow, renderEmail, reportPeriod, reportPeriodFromStart, summarizeServices } from "./index";

describe("monthly-report service", () => {
  it("schedules from 09:00 Paris on the first Monday-to-Friday day, across DST", () => {
    expect(isSchedulingWindow(new Date("2026-08-03T06:59:00.000Z"))).toBe(false);
    expect(isSchedulingWindow(new Date("2026-08-03T07:00:00.000Z"))).toBe(true);
    expect(isSchedulingWindow(new Date("2026-11-02T07:59:00.000Z"))).toBe(false);
    expect(isSchedulingWindow(new Date("2026-11-02T08:00:00.000Z"))).toBe(true);
  });

  it("uses explicit full calendar months, including when a queued report is resumed later", () => {
    expect(reportPeriod(new Date("2026-04-01T07:00:00.000Z"))).toMatchObject({
      key: "2026-03",
      start: "2026-03-01",
      end: "2026-03-31",
      previousStart: "2026-02-01",
      previousEnd: "2026-02-28"
    });
    expect(reportPeriodFromStart("2026-03-01")).toMatchObject({ key: "2026-03", previousStart: "2026-02-01" });
    expect(expiresAt(new Date("2026-09-01T07:00:00.000Z"))).toBe("2028-09-01T07:00:00.000Z");
  });

  it("aggregates multiple properties and only shows changes when session volume is sufficient", () => {
    const report = aggregate([
      {
        propertyId: "1",
        current: { sessions: 30, activeUsers: 20, views: 60, engagementRate: 0.5 },
        previous: { sessions: 25, activeUsers: 18, views: 50, engagementRate: 0.4 },
        channels: new Map([["Organic Search", 20]]),
        keyEvents: new Map([["generate_lead", 3]])
      },
      {
        propertyId: "2",
        current: { sessions: 10, activeUsers: 8, views: 20, engagementRate: 0.8 },
        previous: { sessions: 10, activeUsers: 7, views: 18, engagementRate: 0.6 },
        channels: new Map([["Direct", 12]]),
        keyEvents: new Map([["generate_lead", 2]])
      }
    ]);

    expect(report.current).toEqual({ sessions: 40, activeUsers: 28, views: 80, engagementRate: 0.575 });
    expect(report.channels[0]).toEqual({ label: "Organic Search", sessions: 20 });
    expect(report.keyEvents).toEqual([{ name: "generate_lead", count: 5 }]);
    expect(delta(40, 35, 40, 35)).toBe("+14% vs M-1");
    expect(delta(19, 35, 19, 35)).toBe("");
  });

  it("uses a constructive deterministic insight, even when numbers decline", () => {
    const report = aggregate([
      {
        propertyId: "1",
        current: { sessions: 30, activeUsers: 15, views: 42, engagementRate: 0.4 },
        previous: { sessions: 50, activeUsers: 26, views: 70, engagementRate: 0.5 },
        channels: new Map([["Organic Search", 15]]),
        keyEvents: new Map()
      }
    ]);

    expect(insight(report)).toContain("Organic Search");
    expect(insight(report).toLowerCase()).not.toContain("baisse");
  });

  it("includes active clients with Fluxperf services even when no GA4 property is configured", () => {
    const entries = eligibleClients({
      clients: [{ client_id: "client-1", statut_client: "Actif", espace_client_actif: "Oui" }],
      contacts: [{ client_id: "client-1", contact_id: "contact-1", email: "contact@example.com", statut_contact: "Actif", bilan_mensuel_actif: "Oui" }],
      solutions: [{ client_id: "client-1", solution_id: "solution-1", nom_solution: "Réseaux sociaux", statut_solution: "Actif" }]
    } as never);

    expect(entries).toHaveLength(1);
    expect(entries[0].properties).toEqual([]);
  });

  it("can restrict a preproduction run to explicit client identifiers", () => {
    expect(Array.from(allowedClientIds(" client-1, client-2 ,"))).toEqual(["client-1", "client-2"]);
  });

  it("renders a service-only email without invented analytics metrics", () => {
    const email = renderEmail({
      hasAnalytics: false,
      current: { sessions: 0, activeUsers: 0, views: 0, engagementRate: 0 },
      previous: { sessions: 0, activeUsers: 0, views: 0, engagementRate: 0 },
      channels: [],
      keyEvents: [],
      periodLabel: "Août 2026",
      insight: "Vos services Fluxperf® restent actifs à vos côtés.",
      impact: { monthlyHours: 12, items: [{ label: "Automatisation & IA", monthlyHours: 12 }] }
    }, "Camille", "https://my.fluxperf.fr");

    expect(email.htmlContent).toContain("Vos services actifs");
    expect(email.htmlContent).not.toContain("Performance digitale");
    expect(email.textContent).not.toContain("Sessions :");
    expect(email.textContent).toContain("Temps libéré : environ 12 heures");
  });

  it("uses every active numeric GA4 property, whatever the solution label", () => {
    const properties = configuredProperties([
      { solution_id: "SOL-1", nom_solution: "Site vitrine", ga4_property_id: "properties/123" },
      { solution_id: "SOL-2", nom_solution: "Boutique en ligne", ga4_property_id: "456" },
      { solution_id: "SOL-3", nom_solution: "Autre", ga4_property_id: "not-a-property" }
    ]);

    expect(properties.properties).toEqual([{ solutionId: "SOL-1", propertyId: "123" }, { solutionId: "SOL-2", propertyId: "456" }]);
    expect(properties.invalidPropertySolutions).toEqual(["SOL-3"]);
  });

  it("renders the branded analytics email with detailed services and a distinct test subject", () => {
    const report = {
      hasAnalytics: true,
      analyticsStatus: "partial",
      availablePropertyCount: 2,
      unavailablePropertyCount: 1,
      periodLabel: "août 2026",
      multiProperty: true,
      current: { sessions: 120, activeUsers: 90, views: 240, engagementRate: 0.62 },
      previous: { sessions: 100, activeUsers: 80, views: 200, engagementRate: 0.55 },
      channels: [{ label: "Organic Search", sessions: 60 }],
      keyEvents: [{ name: "generate_lead", count: 4 }],
      insight: "Belle dynamique ce mois-ci.",
      impact: { monthlyHours: 50, items: [{ label: "Visibilité & Acquisition", monthlyHours: 41 }] },
      services: summarizeServices([
        { type_solution: "Flux Visibilité & Acquisition", nom_solution: "Site vitrine", domaine: "exemple.fr" },
        { type_solution: "Flux Automatisation & IA", nom_solution: "Automatisation commerciale" }
      ])
    };

    const email = renderEmail(report, "Laura", "https://my.fluxperf.fr", { test: true });

    expect(email.subject).toBe("[TEST] Votre bilan Fluxperf® — août 2026");
    expect(email.htmlContent).toContain("logo-fluxperf-email.png");
    expect(email.htmlContent).toContain("background-color:#f7f4ee");
    expect(email.htmlContent).toContain("BILAN DE TEST");
    expect(email.htmlContent).toContain("Performance digitale");
    expect(email.htmlContent).toContain("Données consolidées sur 2 sites analysés.");
    expect(email.htmlContent).toContain("Site vitrine — exemple.fr");
    expect(email.htmlContent).toContain("v:roundrect");
  });
});
