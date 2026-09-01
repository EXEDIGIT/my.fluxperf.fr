import { requireAdmin } from "../../../../../../lib/adminAuth";
import { logAdminAction } from "../../../../../../lib/adminActions";
import { sendContactWelcomeEmail } from "../../../../../../lib/adminClients";
import { findAdminClientRow, findAdminContactRow } from "../../../../../../lib/adminWorkbook";
import { readGoogleWorkbookValues } from "../../../../../../lib/googleSheets";
import { json, jsonError } from "../../../../../../lib/response";
import type { PagesContext } from "../../../../../../lib/types";

function valueFromContext(context: PagesContext, key: "clientId" | "contactId"): string {
  const value = context.params?.[key];

  return decodeURIComponent(Array.isArray(value) ? value[0] ?? "" : value ?? "");
}

function isActive(record: Record<string, string>): boolean {
  return !record.statut_contact || ["actif", "active"].includes(record.statut_contact.trim().toLowerCase());
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
    if (!isActive(contact.record)) return jsonError(409, "ADMIN_CONTACT_INACTIVE", "Réactivez cet utilisateur avant de lui envoyer un email d'accès.");

    const notification = await sendContactWelcomeEmail(context.env, context.request, {
      companyName: client.record.organisation || client.record.company_name || "Client Fluxperf",
      contact: {
        firstName: contact.record.prenom || "",
        lastName: contact.record.nom || "",
        email: contact.record.email || "",
        sendAccessEmail: true
      }
    });

    await logAdminAction(context.env, {
      clientId,
      type: notification.status === "sent" ? "admin_welcome_email_sent" : "admin_welcome_email_failed",
      label: notification.status === "sent" ? "Email d'ouverture envoyé" : "Email d'ouverture non envoyé",
      actorEmail: admin.email,
      reference: contactId,
      status: notification.status,
      details: notification.status === "sent" ? `Email transmis à Brevo pour ${contact.record.email || ""}.` : notification.reason
    });

    return json({ status: notification.status, clientId, contactId, notification, sentBy: admin.email });
  } catch {
    return jsonError(500, "ADMIN_CONTACT_WELCOME_EMAIL_FAILED", "L'email d'accès n'a pas pu être envoyé.");
  }
}
