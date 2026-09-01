import { requireAdmin } from "../../lib/adminAuth";
import { buildAdminClientDetail, buildAdminClientList, buildAdminDashboard } from "../../lib/adminWorkbook";
import { buildAdminSolutionOptions } from "../../lib/adminOptions";
import { readGoogleParametersValues, readGoogleWorkbookValues } from "../../lib/googleSheets";
import { json, jsonError } from "../../lib/response";
import type { PagesContext } from "../../lib/types";

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);

  if (admin instanceof Response) {
    return admin;
  }

  const url = new URL(context.request.url);
  const selectedClientId = url.searchParams.get("clientId")?.trim();

  try {
    const [workbook, parameterValues] = await Promise.all([
      readGoogleWorkbookValues(context.env),
      readGoogleParametersValues(context.env).catch(() => [])
    ]);

    return json({
      solutionOptions: buildAdminSolutionOptions(parameterValues),
      clients: buildAdminClientList(workbook),
      dashboard: buildAdminDashboard(workbook),
      selectedClient: selectedClientId ? buildAdminClientDetail(workbook, selectedClientId) : null
    });
  } catch {
    return jsonError(503, "ADMIN_OVERVIEW_UNAVAILABLE", "Les données de la console sont temporairement indisponibles.");
  }
}
