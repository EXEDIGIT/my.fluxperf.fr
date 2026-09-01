import { requireAdmin } from "../../../../../../lib/adminAuth";
import { logAdminAction } from "../../../../../../lib/adminActions";
import { findAdminContactRow } from "../../../../../../lib/adminWorkbook";
import { readGoogleWorkbookValues, updateGoogleSheetValues } from "../../../../../../lib/googleSheets";
import { json, jsonError } from "../../../../../../lib/response";
import { unbanSupabaseUserForClient } from "../../../../../../lib/supabaseAdmin";
import type { PagesContext } from "../../../../../../lib/types";

function valueFromContext(context: PagesContext, key: "clientId" | "contactId"): string {
  const value = context.params?.[key];

  return decodeURIComponent(Array.isArray(value) ? value[0] ?? "" : value ?? "");
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
    if (["actif", "active"].includes((contact.record.statut_contact || "").trim().toLowerCase())) {
      return jsonError(409, "ADMIN_CONTACT_ALREADY_ACTIVE", "Cet utilisateur est déjà actif.");
    }

    await updateGoogleSheetValues(context.env, `Contacts!H${contact.rowNumber}:H${contact.rowNumber}`, [["Actif"]]);
    const auth = await unbanSupabaseUserForClient(context.env, contact.record.email || "");

    await logAdminAction(context.env, {
      clientId,
      type: "admin_contact_reactivated",
      label: "Accès utilisateur réactivé",
      actorEmail: admin.email,
      reference: contactId,
      status: auth.status === "failed" ? "partiel" : "realisee",
      details: auth.status === "failed" ? auth.reason : contact.record.email || ""
    });

    return json({ status: "reactivated", clientId, contactId, auth, updatedBy: admin.email });
  } catch {
    return jsonError(500, "ADMIN_CONTACT_REACTIVATE_FAILED", "L'accès de l'utilisateur n'a pas pu être réactivé.");
  }
}
