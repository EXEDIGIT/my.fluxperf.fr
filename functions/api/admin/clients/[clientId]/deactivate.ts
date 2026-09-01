import { requireAdmin } from "../../../../lib/adminAuth";
import { logAdminAction } from "../../../../lib/adminActions";
import { contactsForAdminClient, findAdminClientRow } from "../../../../lib/adminWorkbook";
import {
  readGoogleWorkbookValues,
  updateGoogleSheetValues
} from "../../../../lib/googleSheets";
import { json, jsonError } from "../../../../lib/response";
import { banSupabaseUserForClient } from "../../../../lib/supabaseAdmin";
import { formatFrenchDate } from "../../../../lib/dateFormats";
import type { PagesContext } from "../../../../lib/types";

function clientIdFromContext(context: PagesContext): string {
  const value = context.params?.clientId;

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function emailFromClient(record: Record<string, string>): string {
  return record.email_principal || record.primary_email || "";
}

function contactIsActive(record: Record<string, string>): boolean {
  return !record.statut_contact || ["actif", "active"].includes(record.statut_contact.trim().toLowerCase());
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);

  if (admin instanceof Response) {
    return admin;
  }

  try {
    const workbook = await readGoogleWorkbookValues(context.env);
    const client = findAdminClientRow(workbook, decodeURIComponent(clientIdFromContext(context)));

    if (!client) {
      return jsonError(404, "ADMIN_CLIENT_NOT_FOUND", "Client introuvable.");
    }

    await updateGoogleSheetValues(context.env, `Clients!D${client.rowNumber}:E${client.rowNumber}`, [["Inactif", "Non"]]);
    await updateGoogleSheetValues(context.env, `Clients!J${client.rowNumber}:J${client.rowNumber}`, [[formatFrenchDate()]]);

    const contactEmails = contactsForAdminClient(workbook, decodeURIComponent(clientIdFromContext(context)))
      .filter(({ record }) => contactIsActive(record))
      .map(({ record }) => record.email || "")
      .filter(Boolean);
    const emails = Array.from(new Set(contactEmails.length > 0 ? contactEmails : [emailFromClient(client.record)].filter(Boolean)));
    const authResults = await Promise.all(emails.map((email) => banSupabaseUserForClient(context.env, email)));
    const auth = authResults.find((result) => result.status === "failed") ?? authResults[0] ?? {
      status: "skipped" as const,
      email: "",
      reason: "Aucun utilisateur actif à désactiver."
    };

    await logAdminAction(context.env, {
      clientId: decodeURIComponent(clientIdFromContext(context)),
      type: "admin_client_deactivated",
      label: "Acces client desactive",
      actorEmail: admin.email,
      status: auth.status === "failed" ? "partiel" : "realisee",
      details: auth.status === "failed" ? auth.reason : `${emails.length} utilisateur(s) concerné(s).`
    });

    return json({
      status: "deactivated",
      clientId: decodeURIComponent(clientIdFromContext(context)),
      auth,
      authResults,
      updatedBy: admin.email
    });
  } catch {
    return jsonError(500, "ADMIN_CLIENT_DEACTIVATE_FAILED", "Le client n'a pas pu etre desactive.");
  }
}
