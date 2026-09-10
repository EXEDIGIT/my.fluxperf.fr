import { requireAdmin } from "../../lib/adminAuth";
import { listMonthlyReports } from "../../lib/monthlyReports";
import { json, jsonError } from "../../lib/response";
import type { PagesContext } from "../../lib/types";

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);
  if (admin instanceof Response) return admin;
  try {
    return json({ reports: await listMonthlyReports(context.env) });
  } catch (error) {
    console.error("monthly_reports_list_failed", error instanceof Error ? error.message : "Unknown error");
    return jsonError(503, "MONTHLY_REPORTS_UNAVAILABLE", "Les bilans mensuels sont indisponibles pour le moment.");
  }
}
