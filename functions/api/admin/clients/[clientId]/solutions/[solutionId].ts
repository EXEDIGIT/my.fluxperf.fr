import { requireAdmin } from "../../../../../lib/adminAuth";
import { logAdminAction } from "../../../../../lib/adminActions";
import {
  domainFromUrlOrIndication,
  validateAdminSolutionInput
} from "../../../../../lib/adminClients";
import { buildAdminSolutionOptions, solutionLabelForType } from "../../../../../lib/adminOptions";
import {
  findAdminClientRow,
  findAdminSolutionRow
} from "../../../../../lib/adminWorkbook";
import {
  readGoogleParametersValues,
  readGoogleWorkbookValues,
  updateGoogleSheetValues
} from "../../../../../lib/googleSheets";
import { json, jsonError } from "../../../../../lib/response";
import { formatFrenchDate } from "../../../../../lib/dateFormats";
import type { PagesContext } from "../../../../../lib/types";

function param(context: PagesContext, key: string): string {
  const value = context.params?.[key];

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function onRequestPut(context: PagesContext): Promise<Response> {
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
    const clientId = decodeURIComponent(param(context, "clientId"));
    const solutionId = decodeURIComponent(param(context, "solutionId"));
    const workbook = await readGoogleWorkbookValues(context.env);
    const client = findAdminClientRow(workbook, clientId);
    const solution = findAdminSolutionRow(workbook, clientId, solutionId);

    if (!client) {
      return jsonError(404, "ADMIN_CLIENT_NOT_FOUND", "Client introuvable.");
    }

    if (!solution) {
      return jsonError(404, "ADMIN_SOLUTION_NOT_FOUND", "Solution introuvable.");
    }

    const options = buildAdminSolutionOptions(await readGoogleParametersValues(context.env));
    const input = validateAdminSolutionInput(payload, options);

    if (typeof input === "string") {
      return jsonError(400, "INVALID_SOLUTION", input);
    }

    const rowNumber = solution.rowNumber;

    await updateGoogleSheetValues(
      context.env,
      `Solutions!C${rowNumber}:C${rowNumber}`,
      [[solutionLabelForType(input.type)]]
    );
    await updateGoogleSheetValues(
      context.env,
      `Solutions!E${rowNumber}:G${rowNumber}`,
      [[input.name, domainFromUrlOrIndication(input.urlOrIndication), input.urlOrIndication]]
    );
    await updateGoogleSheetValues(
      context.env,
      `Solutions!J${rowNumber}:K${rowNumber}`,
      [[input.ga4PropertyId, input.googleAdsCustomerId]]
    );
    await updateGoogleSheetValues(
      context.env,
      `Clients!J${client.rowNumber}:J${client.rowNumber}`,
      [[formatFrenchDate()]]
    );

    await logAdminAction(context.env, {
      clientId,
      type: "admin_solution_updated",
      label: "Solution modifiee",
      actorEmail: admin.email,
      reference: solutionId,
      details: input.name
    });

    return json({
      status: "updated",
      clientId,
      solutionId,
      updatedBy: admin.email
    });
  } catch {
    return jsonError(500, "ADMIN_SOLUTION_UPDATE_FAILED", "La solution n'a pas pu etre modifiee.");
  }
}
