import { getAuthenticatedEmail, normalizeEmail } from "../../lib/auth";
import { findClientForEmailInWorkbook } from "../../lib/clients";
import { parseRows } from "../../lib/adminWorkbook";
import { readGoogleWorkbookValues, updateGoogleSheetValues } from "../../lib/googleSheets";
import { json, jsonError } from "../../lib/response";
import type { PagesContext } from "../../lib/types";

function contactIsActive(record: Record<string, string>): boolean {
  const status = (record.statut_contact || record.status || "").trim().toLowerCase();
  return !status || status === "actif" || status === "active";
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const email = await getAuthenticatedEmail(context.request, context.env);
  if (!email) return jsonError(401, "AUTH_REQUIRED", "Authentification requise.");

  let payload: unknown;
  try {
    payload = await context.request.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "La préférence est invalide.");
  }

  if (!payload || typeof payload !== "object" || typeof (payload as { enabled?: unknown }).enabled !== "boolean") {
    return jsonError(400, "INVALID_PREFERENCE", "La préférence doit être renseignée.");
  }

  try {
    const workbook = await readGoogleWorkbookValues(context.env);
    const clientResult = findClientForEmailInWorkbook(workbook, email);
    if (clientResult.status !== "ok") {
      return jsonError(403, "CLIENT_NOT_CONFIGURED", "Votre espace client n'est pas configuré.");
    }

    const contact = parseRows(workbook.contacts).find(({ record }) =>
      record.client_id === clientResult.client.id &&
      normalizeEmail(record.email || "") === normalizeEmail(email) &&
      contactIsActive(record)
    );
    if (!contact) {
      return jsonError(404, "CONTACT_NOT_FOUND", "Aucun contact actif ne correspond à votre compte.");
    }

    const enabled = (payload as { enabled: boolean }).enabled;
    await updateGoogleSheetValues(context.env, `Contacts!Q${contact.rowNumber}:Q${contact.rowNumber}`, [[enabled ? "Oui" : "Non"]]);

    return json({ enabled });
  } catch (error) {
    console.error("monthly_report_preference_update_failed", error instanceof Error ? error.message : "Unknown error");
    return jsonError(503, "PREFERENCE_UNAVAILABLE", "La préférence n'a pas pu être enregistrée.");
  }
}
