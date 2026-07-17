import { requireAdmin } from "../../lib/adminAuth";
import {
  buildAdminClientRows,
  hasExistingClientEmail,
  sendClientWelcomeEmail,
  validateAdminClientInput
} from "../../lib/adminClients";
import { appendGoogleSheetValues, getGoogleWriteRanges, readGoogleWorkbookValues } from "../../lib/googleSheets";
import { json, jsonError } from "../../lib/response";
import { createSupabaseUserForClient } from "../../lib/supabaseAdmin";
import type { PagesContext } from "../../lib/types";

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

  const input = validateAdminClientInput(payload);

  if (typeof input === "string") {
    return jsonError(400, "INVALID_CLIENT", input);
  }

  try {
    const workbook = await readGoogleWorkbookValues(context.env);

    if (hasExistingClientEmail(workbook, input.email)) {
      return jsonError(409, "CLIENT_EMAIL_EXISTS", "Cette adresse email existe deja dans la base client.");
    }

    const supabaseUser = await createSupabaseUserForClient(context.env, input.email);
    const ranges = getGoogleWriteRanges(context.env);
    const rows = buildAdminClientRows(input);

    await appendGoogleSheetValues(context.env, ranges.clients, [rows.clientRow]);
    await appendGoogleSheetValues(context.env, ranges.contacts, [rows.contactRow]);
    await appendGoogleSheetValues(context.env, ranges.solutions, rows.solutionRows);

    const notification = await sendClientWelcomeEmail(context.env, context.request, input);

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
      "Le client n'a pas pu etre cree completement. Verifiez la configuration Google Sheets, Supabase et Brevo."
    );
  }
}
