import { requireAdmin } from "../../../../../../lib/adminAuth";
import { logAdminAction } from "../../../../../../lib/adminActions";
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

function normalizeStatus(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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

    const status = normalizeStatus(solution.record.statut_solution || "");

    if (["actif", "active"].includes(status)) {
      return jsonError(409, "ADMIN_SOLUTION_ALREADY_ACTIVE", "La solution est deja active.");
    }

    if (!["inactif", "inactive"].includes(status)) {
      return jsonError(400, "ADMIN_SOLUTION_REACTIVATE_NOT_ALLOWED", "Cette solution ne peut pas etre reactivee depuis cette action.");
    }

    const nextActiveCount = activeSolutionCountForClient(workbook, clientId) + 1;

    await updateGoogleSheetValues(context.env, `Solutions!D${solution.rowNumber}:D${solution.rowNumber}`, [["Actif"]]);
    await updateGoogleSheetValues(context.env, `Clients!H${client.rowNumber}:H${client.rowNumber}`, [[String(nextActiveCount)]]);
    await updateGoogleSheetValues(context.env, `Clients!J${client.rowNumber}:J${client.rowNumber}`, [[formatFrenchDate()]]);

    await logAdminAction(context.env, {
      clientId,
      type: "admin_solution_reactivated",
      label: "Solution reactivee",
      actorEmail: admin.email,
      reference: solutionId,
      details: solution.record.nom_solution || solutionId
    });

    return json({
      status: "reactivated",
      clientId,
      solutionId,
      activeSolutions: nextActiveCount,
      updatedBy: admin.email
    });
  } catch {
    return jsonError(500, "ADMIN_SOLUTION_REACTIVATE_FAILED", "La solution n'a pas pu etre reactivee.");
  }
}
