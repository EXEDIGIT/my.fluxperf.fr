import { requireAdmin } from "../../../lib/adminAuth";
import { json, jsonError } from "../../../lib/response";
import type { PagesContext } from "../../../lib/types";

type WorkerTestResponse = {
  status?: "sent" | "partial" | "failed";
  recipientCount?: number;
  sentCount?: number;
  analyticsStatus?: string;
  availableProperties?: number;
  error?: string;
};

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);
  if (admin instanceof Response) return admin;

  let body: { clientId?: unknown } = {};
  try { body = await context.request.json() as { clientId?: unknown }; } catch { /* handled below */ }
  const clientId = typeof body.clientId === "string" ? body.clientId.trim() : "";
  if (!clientId || clientId.length > 120) return jsonError(400, "MONTHLY_REPORT_TEST_CLIENT_REQUIRED", "Saisissez l’identifiant du client de test.");

  const url = context.env.MONTHLY_REPORT_WORKER_URL?.trim();
  const secret = context.env.MONTHLY_REPORT_INTERNAL_SECRET?.trim();
  if (!url || !secret) return jsonError(503, "MONTHLY_REPORT_TEST_UNAVAILABLE", "Le service de test des bilans n’est pas configuré.");

  try {
    const response = await fetch(`${url.replace(/\/+$/, "")}/internal/test`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Fluxperf-Internal-Secret": secret },
      body: JSON.stringify({ clientId })
    });
    const result = await response.json().catch(() => ({})) as WorkerTestResponse;
    if (!response.ok || !result.status) return jsonError(response.status === 422 ? 422 : 503, "MONTHLY_REPORT_TEST_FAILED", result.error || "Le bilan de test n’a pas pu être envoyé.");
    return json({
      status: result.status,
      recipientCount: Number(result.recipientCount || 0),
      sentCount: Number(result.sentCount || 0),
      analyticsStatus: result.analyticsStatus || "not_configured",
      availableProperties: Number(result.availableProperties || 0)
    });
  } catch (error) {
    console.error("monthly_report_test_failed", error instanceof Error ? error.message : "Unknown error");
    return jsonError(503, "MONTHLY_REPORT_TEST_UNAVAILABLE", "Le service de test des bilans est indisponible pour le moment.");
  }
}
