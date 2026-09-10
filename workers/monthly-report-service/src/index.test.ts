import { describe, expect, it } from "vitest";
import { aggregate, delta, expiresAt, insight, isSchedulingWindow, reportPeriod, reportPeriodFromStart } from "./index";

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
});
