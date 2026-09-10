import { requireAdmin } from "../../../../lib/adminAuth";
import { retryMonthlyReport } from "../../../../lib/monthlyReports";
import { json, jsonError } from "../../../../lib/response";
import type { PagesContext } from "../../../../lib/types";

function reportId(context: PagesContext): string {
  const value = context.params?.reportId;
  return decodeURIComponent(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim();
}

async function triggerWorker(context: PagesContext): Promise<void> {
  const url = context.env.MONTHLY_REPORT_WORKER_URL?.trim();
  const secret = context.env.MONTHLY_REPORT_INTERNAL_SECRET?.trim();
  if (!url || !secret) return;
  try {
    await fetch(`${url.replace(/\/+$/, "")}/internal/run`, {
      method: "POST",
      headers: { "X-Fluxperf-Internal-Secret": secret }
    });
  } catch (error) {
    console.warn("monthly_report_worker_trigger_failed", error instanceof Error ? error.message : "Unknown error");
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);
  if (admin instanceof Response) return admin;
  let body: { deliveryId?: string } = {};
  try { body = await context.request.json() as { deliveryId?: string }; } catch { /* report retry */ }
  try {
    const result = await retryMonthlyReport(context.env, reportId(context), body.deliveryId?.trim());
    if (result === "not_found") return jsonError(404, "MONTHLY_REPORT_NOT_FOUND", "Bilan ou livraison introuvable.");
    if (result === "not_retryable") return jsonError(409, "MONTHLY_REPORT_NOT_RETRYABLE", "Seuls les échecs confirmés peuvent être relancés.");
    await triggerWorker(context);
    return json({ status: "queued" });
  } catch {
    return jsonError(503, "MONTHLY_REPORTS_UNAVAILABLE", "La relance n'a pas pu être enregistrée.");
  }
}
