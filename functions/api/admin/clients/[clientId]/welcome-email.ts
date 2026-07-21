import { logAdminAction } from "../../../../lib/adminActions";
import { sendClientWelcomeEmail, type AdminClientInput } from "../../../../lib/adminClients";
import { requireAdmin } from "../../../../lib/adminAuth";
import { buildAdminClientDetail } from "../../../../lib/adminWorkbook";
import { readGoogleWorkbookValues } from "../../../../lib/googleSheets";
import { json, jsonError } from "../../../../lib/response";
import type { PagesContext } from "../../../../lib/types";

function clientIdFromContext(context: PagesContext): string {
  const value = context.params?.clientId;

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isActiveStatus(value: string): boolean {
  return ["actif", "active"].includes(value.trim().toLowerCase());
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);

  if (admin instanceof Response) {
    return admin;
  }

  const clientId = decodeURIComponent(clientIdFromContext(context));

  try {
    const workbook = await readGoogleWorkbookValues(context.env);
    const client = buildAdminClientDetail(workbook, clientId);

    if (!client) {
      return jsonError(404, "ADMIN_CLIENT_NOT_FOUND", "Client introuvable.");
    }

    if (!client.portalEnabled || !isActiveStatus(client.status)) {
      return jsonError(409, "ADMIN_CLIENT_ACCESS_INACTIVE", "Reactivez le client avant de renvoyer son email d'ouverture.");
    }

    const contact = client.contacts.find((item) => item.isPrimary) ?? client.contacts[0];
    const input: AdminClientInput = {
      companyName: client.companyName,
      contactFirstName: contact?.firstName ?? "",
      contactLastName: contact?.lastName ?? "",
      email: client.email,
      notes: client.notes,
      notifyClient: true,
      solutions: []
    };

    const notification = await sendClientWelcomeEmail(context.env, context.request, input);

    await logAdminAction(context.env, {
      clientId,
      type: notification.status === "sent" ? "admin_welcome_email_sent" : "admin_welcome_email_failed",
      label: notification.status === "sent" ? "Email d'ouverture envoye" : "Email d'ouverture non envoye",
      actorEmail: admin.email,
      status: notification.status,
      details: notification.status === "sent" ? "Email transmis à Brevo." : notification.reason
    });

    return json({
      status: notification.status,
      clientId,
      notification,
      sentBy: admin.email
    });
  } catch (error) {
    await logAdminAction(context.env, {
      clientId,
      type: "admin_welcome_email_failed",
      label: "Email d'ouverture non envoye",
      actorEmail: admin.email,
      status: "failed",
      details: error instanceof Error ? error.message : "Erreur email inconnue"
    });

    return jsonError(502, "ADMIN_WELCOME_EMAIL_FAILED", "L'email d'ouverture n'a pas pu etre envoye.");
  }
}
