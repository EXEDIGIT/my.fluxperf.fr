import { requireAdmin } from "../../../../lib/adminAuth";
import { logAdminAction } from "../../../../lib/adminActions";
import { findAdminClientRow } from "../../../../lib/adminWorkbook";
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

    const auth = await banSupabaseUserForClient(context.env, emailFromClient(client.record));

    await logAdminAction(context.env, {
      clientId: decodeURIComponent(clientIdFromContext(context)),
      type: "admin_client_deactivated",
      label: "Acces client desactive",
      actorEmail: admin.email,
      status: auth.status === "failed" ? "partiel" : "realisee",
      details: auth.status === "failed" ? auth.reason : ""
    });

    return json({
      status: "deactivated",
      clientId: decodeURIComponent(clientIdFromContext(context)),
      auth,
      updatedBy: admin.email
    });
  } catch {
    return jsonError(500, "ADMIN_CLIENT_DEACTIVATE_FAILED", "Le client n'a pas pu etre desactive.");
  }
}
