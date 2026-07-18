import { requireAdmin } from "../../lib/adminAuth";
import {
  buildAdminClientRows,
  hasExistingClientEmail,
  sendClientWelcomeEmail,
  validateAdminClientInput
} from "../../lib/adminClients";
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
import type { PagesContext } from "../../lib/types";

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

    if (hasExistingClientEmail(workbook, input.email)) {
      return jsonError(409, "CLIENT_EMAIL_EXISTS", "Cette adresse email existe déjà dans la base client.");
    }

    const supabaseUser = await createSupabaseUserForClient(context.env, input.email);
    const ranges = getGoogleWriteRanges(context.env);
    const rows = buildAdminClientRows(input);

    await appendGoogleSheetValues(context.env, ranges.clients, [rows.clientRow]);
    await appendGoogleSheetValues(context.env, ranges.contacts, [rows.contactRow]);
    await appendGoogleSheetValues(context.env, ranges.solutions, rows.solutionRows);

    let notification: Awaited<ReturnType<typeof sendClientWelcomeEmail>> | {
      status: "failed";
      email: string;
      reason: string;
    };

    try {
      notification = await sendClientWelcomeEmail(context.env, context.request, input);
    } catch (error) {
      console.error(
        "brevo_welcome_email_failed",
        error instanceof Error ? error.message : "Unknown Brevo error"
      );

      notification = {
        status: "failed",
        email: input.email,
        reason: "Email d'ouverture non envoyé. Vérifiez Brevo."
      };
    }

    return json(
      {
        status: "created",
        client: {
          id: rows.clientId,
          companyName: input.companyName,
          email: input.email,
          solutionsCreated: rows.solutionRows.length
        },
        supabaseUser,
        notification,
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
