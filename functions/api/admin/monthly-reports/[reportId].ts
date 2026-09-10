import { requireAdmin } from "../../../lib/adminAuth";
import { getMonthlyReport } from "../../../lib/monthlyReports";
import { json, jsonError } from "../../../lib/response";
import type { PagesContext } from "../../../lib/types";

function reportId(context: PagesContext): string {
  const value = context.params?.reportId;
  return decodeURIComponent(Array.isArray(value) ? value[0] ?? "" : value ?? "").trim();
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);
  if (admin instanceof Response) return admin;
  try {
    const report = await getMonthlyReport(context.env, reportId(context));
    if (!report) return jsonError(404, "MONTHLY_REPORT_NOT_FOUND", "Bilan introuvable.");
    return json({ report });
  } catch {
    return jsonError(503, "MONTHLY_REPORTS_UNAVAILABLE", "Le bilan est indisponible pour le moment.");
  }
}
