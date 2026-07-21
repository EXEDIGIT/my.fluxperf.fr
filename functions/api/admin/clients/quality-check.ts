import { requireAdmin } from "../../../lib/adminAuth";
import { getAdminClientQualityWarnings, validateAdminClientInput } from "../../../lib/adminClients";
import { buildAdminSolutionOptions } from "../../../lib/adminOptions";
import { readGoogleParametersValues, readGoogleWorkbookValues } from "../../../lib/googleSheets";
import { json, jsonError } from "../../../lib/response";
import type { PagesContext } from "../../../lib/types";

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);

  if (admin instanceof Response) {
    return admin;
  }

  let payload: unknown;

  try {
    payload = await context.request.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "La demande est invalide.");
  }

  try {
    const solutionOptions = buildAdminSolutionOptions(await readGoogleParametersValues(context.env));
    const input = validateAdminClientInput(payload, solutionOptions);

    if (typeof input === "string") {
      return jsonError(400, "INVALID_CLIENT", input);
    }

    const workbook = await readGoogleWorkbookValues(context.env);

    return json({
      warnings: getAdminClientQualityWarnings(workbook, input)
    });
  } catch {
    return jsonError(503, "ADMIN_CLIENT_QUALITY_UNAVAILABLE", "Le controle qualite est indisponible.");
  }
}
