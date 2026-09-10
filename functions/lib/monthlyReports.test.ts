import { describe, expect, it } from "vitest";
import { listMonthlyReports, retryMonthlyReport } from "./monthlyReports";
import type { D1DatabaseLike } from "./types";

function database(options: { deliveryStatus?: string; reportStatus?: string; rows?: Record<string, unknown>[] }) {
  const calls: Array<{ query: string; values: unknown[] }> = [];
  const db = {
    prepare(query: string) {
      let values: unknown[] = [];
      const statement = {
        bind(...bound: unknown[]) { values = bound; calls.push({ query, values }); return statement; },
        async first<T>() {
          if (query.includes("monthly_report_deliveries")) return (options.deliveryStatus ? { status: options.deliveryStatus } : null) as T | null;
          return (options.reportStatus ? { status: options.reportStatus } : null) as T | null;
        },
        async all<T>() { return { results: (options.rows || []) as T[] }; },
        async run() { return { success: true, meta: { changes: 1 } }; }
      };
      return statement;
    },
    async batch() { return []; }
  } as unknown as D1DatabaseLike;
  return { db, calls };
}

describe("monthly report D1 controls", () => {
  it("derives a sent global state once every delivery has been accepted", async () => {
    const fake = database({ rows: [{
      id: "R-1", client_id: "CLI-1", company_name: "Alpha", period_key: "2026-08", status: "ready",
      delivery_count: 2, sent_count: 2, failed_count: 0, unknown_count: 0, generated_at: null, sent_at: "2026-09-01T07:05:00.000Z"
    }] });

    await expect(listMonthlyReports({ MONTHLY_REPORTS_DB: fake.db })).resolves.toEqual([
      expect.objectContaining({ id: "R-1", status: "sent", generationStatus: "ready", deliveryCount: 2 })
    ]);
  });

  it("allows a manual retry only for an explicitly failed delivery", async () => {
    const failed = database({ deliveryStatus: "failed" });
    await expect(retryMonthlyReport({ MONTHLY_REPORTS_DB: failed.db }, "R-1", "D-1")).resolves.toBe("queued");
    expect(failed.calls.some((call) => call.query.startsWith("UPDATE monthly_report_deliveries SET status = 'pending'"))).toBe(true);

    const unknown = database({ deliveryStatus: "unknown" });
    await expect(retryMonthlyReport({ MONTHLY_REPORTS_DB: unknown.db }, "R-1", "D-1")).resolves.toBe("not_retryable");
    expect(unknown.calls.some((call) => call.query.startsWith("UPDATE monthly_report_deliveries"))).toBe(false);
  });

  it("allows a report-generation retry only when the report itself failed", async () => {
    const pending = database({ reportStatus: "pending" });
    await expect(retryMonthlyReport({ MONTHLY_REPORTS_DB: pending.db }, "R-1")).resolves.toBe("not_retryable");

    const failed = database({ reportStatus: "failed" });
    await expect(retryMonthlyReport({ MONTHLY_REPORTS_DB: failed.db }, "R-1")).resolves.toBe("queued");
    expect(failed.calls.some((call) => call.query.startsWith("UPDATE monthly_reports SET status = 'pending'"))).toBe(true);
  });
});
