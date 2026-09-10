import { logAdminAction } from "../../../../../../lib/adminActions";
import { findAdminClientRow, findAdminContactRow, parseRows } from "../../../../../../lib/adminWorkbook";
import {
  clientAndContactAreMarketingActive,
  isBrevoMarketingEligible,
  persistBrevoMarketingStatus,
  syncEligibleBrevoMarketingContact
} from "../../../../../../lib/brevoMarketing";
import { readGoogleWorkbookValues } from "../../../../../../lib/googleSheets";
import { requireAdmin } from "../../../../../../lib/adminAuth";
import { json, jsonError } from "../../../../../../lib/response";
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
    const client = findAdminClientRow(workbook, clientId);
    const contact = findAdminContactRow(workbook, clientId, contactId);

    if (!client || !contact) return jsonError(404, "ADMIN_CONTACT_NOT_FOUND", "Utilisateur introuvable.");
    if (!isBrevoMarketingEligible(contact.record)) {
      return jsonError(409, "BREVO_MARKETING_NOT_ELIGIBLE", "Ce contact n'est pas inscrit à la liste e-marketing.");
    }
    if (!clientAndContactAreMarketingActive(client.record, contact.record)) {
      return jsonError(409, "BREVO_MARKETING_CONTACT_INACTIVE", "Réactivez le client et l'utilisateur avant la synchronisation Brevo.");
    }

    const brevoMarketing = await syncEligibleBrevoMarketingContact(
      context.env,
      client.record,
      contact.record,
      parseRows(workbook.solutions).map((item) => item.record),
      "myfluxperf_admin_retry"
    );
    await persistBrevoMarketingStatus(context.env, contact.rowNumber, brevoMarketing);
    await logAdminAction(context.env, {
      clientId,
      type: brevoMarketing.status === "synced" ? "brevo_marketing_synced" : "brevo_marketing_sync_failed",
      label: brevoMarketing.status === "synced" ? "Contact synchronisé avec Brevo" : "Synchronisation Brevo à relancer",
      actorEmail: admin.email,
      reference: contactId,
      status: brevoMarketing.status,
      details: brevoMarketing.status === "failed" ? brevoMarketing.reason : brevoMarketing.email
    });

    return json({ status: brevoMarketing.status, clientId, contactId, brevoMarketing, updatedBy: admin.email });
  } catch {
    return jsonError(500, "BREVO_MARKETING_SYNC_FAILED", "La synchronisation Brevo n'a pas pu être exécutée.");
  }
}
