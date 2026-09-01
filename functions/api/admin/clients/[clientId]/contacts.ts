import { requireAdmin } from "../../../../lib/adminAuth";
import { logAdminAction } from "../../../../lib/adminActions";
import {
  buildAdminAdditionalContactRow,
  findExistingClientIdForEmail,
  sendContactWelcomeEmail,
  validateAdminAdditionalContactInput
} from "../../../../lib/adminClients";
import { findAdminClientRow } from "../../../../lib/adminWorkbook";
import { appendGoogleSheetValues, getGoogleWriteRanges, readGoogleWorkbookValues } from "../../../../lib/googleSheets";
import { json, jsonError } from "../../../../lib/response";
import { createSupabaseUserForClient } from "../../../../lib/supabaseAdmin";
import type { PagesContext } from "../../../../lib/types";

function clientIdFromContext(context: PagesContext): string {
  const value = context.params?.clientId;

  return decodeURIComponent(Array.isArray(value) ? value[0] ?? "" : value ?? "");
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);

  if (admin instanceof Response) {
    return admin;
  }

  let payload: unknown;

  try {
    payload = await context.request.json();
  } catch {
    return jsonError(400, "INVALID_JSON", "La demande est invalide.");
  }

  const input = validateAdminAdditionalContactInput(payload);

  if (typeof input === "string") {
    return jsonError(400, "INVALID_CONTACT", input);
  }

  try {
    const clientId = clientIdFromContext(context);
    const workbook = await readGoogleWorkbookValues(context.env);
    const client = findAdminClientRow(workbook, clientId);

    if (!client) {
      return jsonError(404, "ADMIN_CLIENT_NOT_FOUND", "Client introuvable.");
    }

    const existingClientId = findExistingClientIdForEmail(workbook, input.email);

    if (existingClientId) {
      return jsonError(
        409,
        "CONTACT_EMAIL_EXISTS",
        existingClientId === clientId
          ? "Cette adresse est déjà enregistrée pour ce client. Réactivez le contact existant si nécessaire."
          : `Cette adresse est déjà rattachée au client ${existingClientId}.`
      );
    }

    const supabaseUser = await createSupabaseUserForClient(context.env, input.email);
    const contact = buildAdminAdditionalContactRow(clientId, input);

    await appendGoogleSheetValues(context.env, getGoogleWriteRanges(context.env).contacts, [contact.contactRow]);

    await logAdminAction(context.env, {
      clientId,
      type: "admin_contact_added",
      label: "Utilisateur ajouté",
      actorEmail: admin.email,
      reference: contact.contactId,
      details: `${input.firstName} ${input.lastName}`.trim() || input.email
    });

    let notification: Awaited<ReturnType<typeof sendContactWelcomeEmail>> | { status: "failed"; email: string; reason: string };

    try {
      notification = await sendContactWelcomeEmail(context.env, context.request, {
        companyName: client.record.organisation || client.record.company_name || "Client Fluxperf",
        contact: input
      });
    } catch (error) {
      console.error("brevo_welcome_email_failed", error instanceof Error ? error.message : "Unknown Brevo error");
      notification = { status: "failed", email: input.email, reason: "Email d'ouverture non envoyé. Vérifiez Brevo." };
    }

    if (notification.status !== "skipped") {
      await logAdminAction(context.env, {
        clientId,
        type: notification.status === "sent" ? "admin_welcome_email_sent" : "admin_welcome_email_failed",
        label: notification.status === "sent" ? "Email d'ouverture envoyé" : "Email d'ouverture non envoyé",
        actorEmail: admin.email,
        reference: contact.contactId,
        status: notification.status,
        details: notification.status === "sent" ? `Email transmis à Brevo pour ${input.email}.` : notification.reason
      });
    }

    return json({
      status: "created",
      clientId,
      contactId: contact.contactId,
      supabaseUser,
      notification,
      createdBy: admin.email
    }, { status: 201 });
  } catch {
    return jsonError(500, "ADMIN_CONTACT_CREATE_FAILED", "L'utilisateur n'a pas pu être ajouté.");
  }
}
