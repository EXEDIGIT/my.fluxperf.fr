import { requireAdmin } from "../../../../../../lib/adminAuth";
import {
  activeSolutionCountForClient,
  findAdminClientRow,
  findAdminSolutionRow
} from "../../../../../../lib/adminWorkbook";
import {
  readGoogleWorkbookValues,
  updateGoogleSheetValues
} from "../../../../../../lib/googleSheets";
import { json, jsonError } from "../../../../../../lib/response";
import { formatFrenchDate } from "../../../../../../lib/dateFormats";
import type { PagesContext } from "../../../../../../lib/types";

function param(context: PagesContext, key: string): string {
  const value = context.params?.[key];

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);

  if (admin instanceof Response) {
    return admin;
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

    const wasActive = ["actif", "active"].includes((solution.record.statut_solution || "").trim().toLowerCase());
    const nextActiveCount = Math.max(0, activeSolutionCountForClient(workbook, clientId) - (wasActive ? 1 : 0));

    await updateGoogleSheetValues(context.env, `Solutions!D${solution.rowNumber}:D${solution.rowNumber}`, [["Inactif"]]);
    await updateGoogleSheetValues(context.env, `Clients!H${client.rowNumber}:H${client.rowNumber}`, [[String(nextActiveCount)]]);
    await updateGoogleSheetValues(context.env, `Clients!J${client.rowNumber}:J${client.rowNumber}`, [[formatFrenchDate()]]);

    return json({
      status: "deactivated",
      clientId,
      solutionId,
      activeSolutions: nextActiveCount,
      updatedBy: admin.email
    });
  } catch {
    return jsonError(500, "ADMIN_SOLUTION_DEACTIVATE_FAILED", "La solution n'a pas pu etre desactivee.");
  }
}
