import { logAdminAction } from "../../../../lib/adminActions";
import { requireAdmin } from "../../../../lib/adminAuth";
import { contactsForAdminClient, findAdminClientRow } from "../../../../lib/adminWorkbook";
import { formatFrenchDate } from "../../../../lib/dateFormats";
import { readGoogleWorkbookValues, updateGoogleSheetValues } from "../../../../lib/googleSheets";
import { json, jsonError } from "../../../../lib/response";
import { unbanSupabaseUserForClient } from "../../../../lib/supabaseAdmin";
import type { PagesContext } from "../../../../lib/types";

function clientIdFromContext(context: PagesContext): string {
  const value = context.params?.clientId;

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isActiveStatus(value: string): boolean {
  return ["actif", "active"].includes(value.trim().toLowerCase());
}

function portalEnabled(value: string): boolean {
  return !value || ["oui", "yes", "true", "1", "actif", "active"].includes(value.trim().toLowerCase());
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
    const clientId = decodeURIComponent(clientIdFromContext(context));
    const workbook = await readGoogleWorkbookValues(context.env);
    const client = findAdminClientRow(workbook, clientId);

    if (!client) {
      return jsonError(404, "ADMIN_CLIENT_NOT_FOUND", "Client introuvable.");
    }

    if (isActiveStatus(client.record.statut_client || "") && portalEnabled(client.record.espace_client_actif || "")) {
      return jsonError(409, "ADMIN_CLIENT_ALREADY_ACTIVE", "Le client est deja actif.");
    }

    await updateGoogleSheetValues(context.env, `Clients!D${client.rowNumber}:E${client.rowNumber}`, [["Actif", "Oui"]]);
    await updateGoogleSheetValues(context.env, `Clients!J${client.rowNumber}:J${client.rowNumber}`, [[formatFrenchDate()]]);

    const contactEmails = contactsForAdminClient(workbook, clientId)
      .filter(({ record }) => contactIsActive(record))
      .map(({ record }) => record.email || "")
      .filter(Boolean);
    const emails = Array.from(new Set(contactEmails.length > 0 ? contactEmails : [client.record.email_principal || client.record.primary_email || ""].filter(Boolean)));
    const authResults = await Promise.all(emails.map((email) => unbanSupabaseUserForClient(context.env, email)));
    const auth = authResults.find((result) => result.status === "failed") ?? authResults[0] ?? {
      status: "skipped" as const,
      email: "",
      reason: "Aucun utilisateur actif à réactiver."
    };

    await logAdminAction(context.env, {
      clientId,
      type: "admin_client_reactivated",
      label: "Acces client reactive",
      actorEmail: admin.email,
      status: auth.status === "failed" ? "partiel" : "realisee",
      details: auth.status === "failed" ? auth.reason : `${emails.length} utilisateur(s) concerné(s).`
    });

    return json({
      status: "reactivated",
      clientId,
      auth,
      authResults,
      updatedBy: admin.email
    });
  } catch {
    return jsonError(500, "ADMIN_CLIENT_REACTIVATE_FAILED", "Le client n'a pas pu etre reactive.");
  }
}
