import { requireAdmin } from "../../../../../../lib/adminAuth";
import { logAdminAction } from "../../../../../../lib/adminActions";
import { findAdminContactRow } from "../../../../../../lib/adminWorkbook";
import { readGoogleWorkbookValues, updateGoogleSheetValues } from "../../../../../../lib/googleSheets";
import { json, jsonError } from "../../../../../../lib/response";
import { banSupabaseUserForClient } from "../../../../../../lib/supabaseAdmin";
import type { PagesContext } from "../../../../../../lib/types";

function valueFromContext(context: PagesContext, key: "clientId" | "contactId"): string {
  const value = context.params?.[key];

  return decodeURIComponent(Array.isArray(value) ? value[0] ?? "" : value ?? "");
}

function isPrimary(record: Record<string, string>): boolean {
  return ["oui", "yes", "true", "1"].includes((record.contact_principal || "").trim().toLowerCase());
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);

  if (admin instanceof Response) return admin;

  try {
    const clientId = valueFromContext(context, "clientId");
    const contactId = valueFromContext(context, "contactId");
    const workbook = await readGoogleWorkbookValues(context.env);
    const contact = findAdminContactRow(workbook, clientId, contactId);

    if (!contact) return jsonError(404, "ADMIN_CONTACT_NOT_FOUND", "Utilisateur introuvable.");
    if (isPrimary(contact.record)) {
      return jsonError(409, "PRIMARY_CONTACT_PROTECTED", "Le contact principal ne peut pas être désactivé individuellement.");
    }

    await updateGoogleSheetValues(context.env, `Contacts!H${contact.rowNumber}:H${contact.rowNumber}`, [["Inactif"]]);
    const auth = await banSupabaseUserForClient(context.env, contact.record.email || "");

    await logAdminAction(context.env, {
      clientId,
      type: "admin_contact_deactivated",
      label: "Accès utilisateur désactivé",
      actorEmail: admin.email,
      reference: contactId,
      status: auth.status === "failed" ? "partiel" : "realisee",
      details: auth.status === "failed" ? auth.reason : contact.record.email || ""
    });

    return json({ status: "deactivated", clientId, contactId, auth, updatedBy: admin.email });
  } catch {
    return jsonError(500, "ADMIN_CONTACT_DEACTIVATE_FAILED", "L'accès de l'utilisateur n'a pas pu être désactivé.");
  }
}
