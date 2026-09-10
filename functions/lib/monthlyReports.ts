import type { AppEnv, D1DatabaseLike } from "./types";

export type MonthlyReportListItem = {
  id: string;
  clientId: string;
  companyName: string;
  periodKey: string;
  status: string;
  generationStatus: string;
  generatedAt: string | null;
  sentAt: string | null;
  deliveryCount: number;
  sentCount: number;
  failedCount: number;
  unknownCount: number;
  errorMessage: string | null;
};

export type MonthlyReportDetail = MonthlyReportListItem & {
  periodStart: string;
  periodEnd: string;
  insight: string | null;
  report: Record<string, unknown> | null;
  deliveries: Array<{
    id: string;
    contactId: string;
    recipientEmail: string;
    recipientName: string;
    status: string;
    attempts: number;
    sentAt: string | null;
    errorMessage: string | null;
  }>;
};

function db(env: AppEnv): D1DatabaseLike {
  if (!env.MONTHLY_REPORTS_DB) throw new Error("Monthly reports D1 binding is missing.");
  return env.MONTHLY_REPORTS_DB;
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function asNumber(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parseJson(value: unknown): Record<string, unknown> | null {
  if (typeof value !== "string" || !value) return null;
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function listItem(row: Record<string, unknown>): MonthlyReportListItem {
  const deliveryCount = asNumber(row.delivery_count);
  const sentCount = asNumber(row.sent_count);
  const failedCount = asNumber(row.failed_count);
  const unknownCount = asNumber(row.unknown_count);
  const generationStatus = asString(row.status);
  const status = generationStatus !== "ready"
    ? generationStatus
    : unknownCount > 0
      ? "unknown"
      : failedCount > 0
        ? "failed"
        : deliveryCount > 0 && sentCount === deliveryCount
          ? "sent"
          : deliveryCount > 0
            ? "sending"
            : "ready";
  return {
    id: asString(row.id),
    clientId: asString(row.client_id),
    companyName: asString(row.company_name),
    periodKey: asString(row.period_key),
    status,
    generationStatus,
    generatedAt: asString(row.generated_at) || null,
    sentAt: asString(row.sent_at) || null,
    deliveryCount,
    sentCount,
    failedCount,
    unknownCount,
    errorMessage: asString(row.error_message) || null
  };
}

const listQuery = `
  SELECT r.*, COUNT(d.id) AS delivery_count,
    SUM(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
    SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
    SUM(CASE WHEN d.status = 'unknown' THEN 1 ELSE 0 END) AS unknown_count,
    MAX(d.sent_at) AS sent_at
  FROM monthly_reports r
  LEFT JOIN monthly_report_deliveries d ON d.report_id = r.id
  GROUP BY r.id
  ORDER BY r.period_key DESC, r.created_at DESC
  LIMIT ?`;

export async function listMonthlyReports(env: AppEnv, limit = 100): Promise<MonthlyReportListItem[]> {
  const result = await db(env).prepare(listQuery).bind(Math.max(1, Math.min(limit, 200))).all<Record<string, unknown>>();
  return result.results.map(listItem);
}

export async function getMonthlyReport(env: AppEnv, id: string): Promise<MonthlyReportDetail | null> {
  const row = await db(env).prepare(`
    SELECT r.*, COUNT(d.id) AS delivery_count,
      SUM(CASE WHEN d.status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
      SUM(CASE WHEN d.status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
      SUM(CASE WHEN d.status = 'unknown' THEN 1 ELSE 0 END) AS unknown_count,
      MAX(d.sent_at) AS sent_at
    FROM monthly_reports r
    LEFT JOIN monthly_report_deliveries d ON d.report_id = r.id
    WHERE r.id = ?
    GROUP BY r.id
    LIMIT 1
  `).bind(id).first<Record<string, unknown>>();
  if (!row) return null;
  const deliveries = await db(env).prepare(`
    SELECT id, contact_id, recipient_email, recipient_name, status, attempts, sent_at, error_message
    FROM monthly_report_deliveries WHERE report_id = ? ORDER BY created_at ASC
  `).bind(id).all<Record<string, unknown>>();
  return {
    ...listItem(row),
    periodStart: asString(row.period_start),
    periodEnd: asString(row.period_end),
    insight: asString(row.insight) || null,
    report: parseJson(row.report_json),
    deliveries: deliveries.results.map((delivery) => ({
      id: asString(delivery.id), contactId: asString(delivery.contact_id), recipientEmail: asString(delivery.recipient_email),
      recipientName: asString(delivery.recipient_name), status: asString(delivery.status), attempts: asNumber(delivery.attempts),
      sentAt: asString(delivery.sent_at) || null, errorMessage: asString(delivery.error_message) || null
    }))
  };
}

export async function retryMonthlyReport(env: AppEnv, reportId: string, deliveryId?: string): Promise<"queued" | "not_retryable" | "not_found"> {
  const database = db(env);
  const now = new Date().toISOString();
  if (deliveryId) {
    const existing = await database.prepare("SELECT status FROM monthly_report_deliveries WHERE id = ? AND report_id = ?").bind(deliveryId, reportId).first<{ status?: string }>();
    if (!existing) return "not_found";
    if (existing.status !== "failed") return "not_retryable";
    await database.prepare("UPDATE monthly_report_deliveries SET status = 'pending', attempts = 0, next_attempt_at = ?, error_message = NULL, updated_at = ? WHERE id = ?")
      .bind(now, now, deliveryId).run();
    return "queued";
  }
  const existing = await database.prepare("SELECT status FROM monthly_reports WHERE id = ?").bind(reportId).first<{ status?: string }>();
  if (!existing) return "not_found";
  if (existing.status !== "failed") return "not_retryable";
  await database.prepare("UPDATE monthly_reports SET status = 'pending', attempts = 0, next_attempt_at = ?, error_message = NULL, updated_at = ? WHERE id = ?")
    .bind(now, now, reportId).run();
  return "queued";
}
