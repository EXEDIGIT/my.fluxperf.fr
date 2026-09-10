import { requireAdmin } from "../../lib/adminAuth";
import {
  buildAdminClientRows,
  findExistingClientIdForEmail,
  getAdminClientQualityWarnings,
  sendContactWelcomeEmail,
  validateAdminClientInput
} from "../../lib/adminClients";
import { logAdminAction } from "../../lib/adminActions";
import { buildAdminSolutionOptions } from "../../lib/adminOptions";
import { buildAdminClientList } from "../../lib/adminWorkbook";
import {
  appendGoogleSheetValues,
  getGoogleWriteRanges,
  readGoogleParametersValues,
  readGoogleWorkbookValues
} from "../../lib/googleSheets";
import { json, jsonError } from "../../lib/response";
import { createSupabaseUserForClient } from "../../lib/supabaseAdmin";
import { refreshWebsiteThumbnail } from "../../lib/thumbnailRefresh";
import { persistBrevoMarketingStatus } from "../../lib/brevoMarketing";
import { syncBrevoMarketingContact } from "../../lib/brevo";
import type { PagesContext } from "../../lib/types";

function warningsConfirmed(payload: unknown): boolean {
  return Boolean(
    payload &&
      typeof payload === "object" &&
      !Array.isArray(payload) &&
      (payload as Record<string, unknown>).confirmWarnings === true
  );
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);

  if (admin instanceof Response) {
    return admin;
  }

  try {
    const workbook = await readGoogleWorkbookValues(context.env);

    return json({
      clients: buildAdminClientList(workbook)
    });
  } catch {
    return jsonError(503, "ADMIN_CLIENTS_UNAVAILABLE", "La liste clients est indisponible.");
  }
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

  try {
    const solutionOptions = buildAdminSolutionOptions(await readGoogleParametersValues(context.env));
    const input = validateAdminClientInput(payload, solutionOptions);

    if (typeof input === "string") {
      return jsonError(400, "INVALID_CLIENT", input);
    }

    const workbook = await readGoogleWorkbookValues(context.env);

    const existingEmail = input.contacts
      .map((contact) => ({ email: contact.email, clientId: findExistingClientIdForEmail(workbook, contact.email) }))
      .find((contact) => contact.clientId);

    if (existingEmail) {
      return jsonError(409, "CLIENT_EMAIL_EXISTS", `L'adresse ${existingEmail.email} est déjà rattachée au client ${existingEmail.clientId}.`);
    }

    const warnings = getAdminClientQualityWarnings(workbook, input);

    if (warnings.length > 0 && !warningsConfirmed(payload)) {
      return json(
        {
          error: {
            code: "CLIENT_CREATION_WARNINGS",
            message: "Des avertissements doivent etre confirmes avant la creation du client."
          },
          warnings
        },
        { status: 409 }
      );
    }

    const supabaseUsers = await Promise.all(
      input.contacts.map((contact) => createSupabaseUserForClient(context.env, contact.email))
    );
    const ranges = getGoogleWriteRanges(context.env);
    const rows = buildAdminClientRows(input);

    await appendGoogleSheetValues(context.env, ranges.clients, [rows.clientRow]);
    const appendedContacts = await appendGoogleSheetValues(context.env, ranges.contacts, rows.contactRows);
    await appendGoogleSheetValues(context.env, ranges.solutions, rows.solutionRows);

    const thumbnailRefreshes = await Promise.all(
      rows.solutionRows.map((row, index) =>
        refreshWebsiteThumbnail(context.env, {
          clientId: rows.clientId,
          solutionId: row[0] ?? "",
          name: input.solutions[index]?.name ?? "",
          domain: row[5] ?? "",
          urlOrIndication: row[6] ?? ""
        })
      )
    );

    const notifications = await Promise.all(
      input.contacts.map(async (contact) => {
        try {
          return await sendContactWelcomeEmail(context.env, context.request, { companyName: input.companyName, contact });
        } catch (error) {
          console.error("brevo_welcome_email_failed", error instanceof Error ? error.message : "Unknown Brevo error");
          return { status: "failed" as const, email: contact.email, reason: "Email d'ouverture non envoyé. Vérifiez Brevo." };
        }
      })
    );
    const notification = notifications.find((item) => item.status !== "skipped") ?? notifications[0];

    const firstContactRow = Number(appendedContacts?.updatedRange?.match(/!\D*(\d+):/)?.[1]) || Math.max(2, (workbook.contacts?.length ?? 0) + 1);
    const marketingSyncs = await Promise.all(
      input.contacts.map(async (contact, index) => {
        if (!contact.brevoMarketingEligible) return null;

        const result = await syncBrevoMarketingContact(context.env, {
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          clientId: rows.clientId,
          companyName: input.companyName,
          role: contact.role,
          activeServices: input.solutions.map((solution) => solution.name),
          source: "myfluxperf_admin"
        });

        await persistBrevoMarketingStatus(context.env, firstContactRow + index, result);
        await logAdminAction(context.env, {
          clientId: rows.clientId,
          type: result.status === "synced" ? "brevo_marketing_synced" : "brevo_marketing_sync_failed",
          label: result.status === "synced" ? "Contact synchronisé avec Brevo" : "Synchronisation Brevo à relancer",
          actorEmail: admin.email,
          reference: rows.contactIds[index],
          status: result.status,
          details: result.status === "failed" ? result.reason : result.email
        });

        return { contactId: rows.contactIds[index], ...result };
      })
    );

    await logAdminAction(context.env, {
      clientId: rows.clientId,
      type: "admin_client_created",
      label: "Client cree depuis la console interne",
      actorEmail: admin.email,
      status: "realisee",
      details: `${rows.solutionRows.length} solution(s) créée(s), ${rows.contactRows.length} utilisateur(s) ajouté(s)`
    });

    await Promise.all(
      notifications
        .filter((item) => item.status !== "skipped")
        .map((item) =>
          logAdminAction(context.env, {
            clientId: rows.clientId,
            type: item.status === "sent" ? "admin_welcome_email_sent" : "admin_welcome_email_failed",
            label: item.status === "sent" ? "Email d'ouverture envoye" : "Email d'ouverture non envoye",
            actorEmail: admin.email,
            status: item.status,
            details: item.status === "sent" ? `Email transmis à Brevo pour ${item.email}.` : item.reason
          })
        )
    );

    return json(
      {
        status: "created",
        client: {
          id: rows.clientId,
          companyName: input.companyName,
          email: input.email,
          solutionsCreated: rows.solutionRows.length
        },
        contactsCreated: rows.contactRows.length,
        thumbnailRefreshes,
        supabaseUser: supabaseUsers[0],
        supabaseUsers,
        notification,
        marketingSyncs: marketingSyncs.filter((item): item is NonNullable<typeof item> => Boolean(item)),
        createdBy: admin.email
      },
      { status: 201 }
    );
  } catch {
    return jsonError(
      500,
      "CLIENT_CREATE_FAILED",
      "Le client n'a pas pu être créé complètement. Vérifiez la configuration Google Sheets, Supabase et Brevo."
    );
  }
}
