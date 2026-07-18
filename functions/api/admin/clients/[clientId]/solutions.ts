import { requireAdmin } from "../../../../lib/adminAuth";
import {
  buildAdminSolutionRow,
  validateAdminSolutionInput
} from "../../../../lib/adminClients";
import { buildAdminSolutionOptions } from "../../../../lib/adminOptions";
import {
  activeSolutionCountForClient,
  findAdminClientRow
} from "../../../../lib/adminWorkbook";
import {
  appendGoogleSheetValues,
  getGoogleWriteRanges,
  readGoogleParametersValues,
  readGoogleWorkbookValues,
  updateGoogleSheetValues
} from "../../../../lib/googleSheets";
import { json, jsonError } from "../../../../lib/response";
import { formatFrenchDate } from "../../../../lib/dateFormats";
import type { PagesContext } from "../../../../lib/types";

function clientIdFromContext(context: PagesContext): string {
  const value = context.params?.clientId;

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
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
    const clientId = decodeURIComponent(clientIdFromContext(context));
    const workbook = await readGoogleWorkbookValues(context.env);
    const client = findAdminClientRow(workbook, clientId);

    if (!client) {
      return jsonError(404, "ADMIN_CLIENT_NOT_FOUND", "Client introuvable.");
    }

    const options = buildAdminSolutionOptions(await readGoogleParametersValues(context.env));
    const input = validateAdminSolutionInput(payload, options);

    if (typeof input === "string") {
      return jsonError(400, "INVALID_SOLUTION", input);
    }

    const row = buildAdminSolutionRow(clientId, input);
    const ranges = getGoogleWriteRanges(context.env);
    const nextActiveCount = activeSolutionCountForClient(workbook, clientId) + 1;

    await appendGoogleSheetValues(context.env, ranges.solutions, [row]);
    await updateGoogleSheetValues(context.env, `Clients!H${client.rowNumber}:H${client.rowNumber}`, [[String(nextActiveCount)]]);
    await updateGoogleSheetValues(context.env, `Clients!J${client.rowNumber}:J${client.rowNumber}`, [[formatFrenchDate()]]);

    return json(
      {
        status: "created",
        clientId,
        solutionId: row[0],
        activeSolutions: nextActiveCount,
        createdBy: admin.email
      },
      { status: 201 }
    );
  } catch {
    return jsonError(500, "ADMIN_SOLUTION_CREATE_FAILED", "La solution n'a pas pu etre ajoutee.");
  }
}
