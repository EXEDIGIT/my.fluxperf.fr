import { requireAdmin } from "../../lib/adminAuth";
import { buildAdminDashboard } from "../../lib/adminWorkbook";
import { readGoogleWorkbookValues } from "../../lib/googleSheets";
import { json, jsonError } from "../../lib/response";
import type { PagesContext } from "../../lib/types";

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);

  if (admin instanceof Response) {
    return admin;
  }

  try {
    const workbook = await readGoogleWorkbookValues(context.env);

    return json({
      dashboard: buildAdminDashboard(workbook)
    });
  } catch {
    return jsonError(503, "ADMIN_DASHBOARD_UNAVAILABLE", "Le tableau de bord est indisponible.");
  }
}
