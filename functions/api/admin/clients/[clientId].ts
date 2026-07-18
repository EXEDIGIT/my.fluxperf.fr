import { requireAdmin } from "../../../lib/adminAuth";
import { buildAdminClientDetail } from "../../../lib/adminWorkbook";
import { readGoogleWorkbookValues } from "../../../lib/googleSheets";
import { json, jsonError } from "../../../lib/response";
import type { PagesContext } from "../../../lib/types";

function clientIdFromContext(context: PagesContext): string {
  const value = context.params?.clientId;

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);

  if (admin instanceof Response) {
    return admin;
  }

  try {
    const workbook = await readGoogleWorkbookValues(context.env);
    const detail = buildAdminClientDetail(workbook, decodeURIComponent(clientIdFromContext(context)));

    if (!detail) {
      return jsonError(404, "ADMIN_CLIENT_NOT_FOUND", "Client introuvable.");
    }

    return json({
      client: detail
    });
  } catch {
    return jsonError(503, "ADMIN_CLIENT_UNAVAILABLE", "La fiche client est indisponible.");
  }
}
