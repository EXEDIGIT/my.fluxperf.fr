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
import {
  canRefreshWebsiteThumbnail,
  refreshWebsiteThumbnail,
  shouldRefreshWebsiteThumbnail,
  type ThumbnailRefreshInput,
  type ThumbnailRefreshResult
} from "../../../../../lib/thumbnailRefresh";
import type { PagesContext } from "../../../../../lib/types";

function param(context: PagesContext, key: string): string {
  const value = context.params?.[key];

  return Array.isArray(value) ? value[0] ?? "" : value ?? "";
}

function isActiveStatus(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return normalized === "actif" || normalized === "active";
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

    const nextThumbnail: ThumbnailRefreshInput = {
      clientId,
      solutionId,
      name: input.name,
      domain: domainFromUrlOrIndication(input.urlOrIndication),
      urlOrIndication: input.urlOrIndication
    };
    const previousThumbnail: ThumbnailRefreshInput = {
      clientId,
      solutionId,
      name: solution.record.nom_solution || "",
      domain: solution.record.domaine || "",
      urlOrIndication: solution.record.url_ou_indication || ""
    };
    let thumbnailRefresh: ThumbnailRefreshResult;

    if (!isActiveStatus(solution.record.statut_solution || "")) {
      thumbnailRefresh = { status: "skipped", reason: "not_active" };
    } else if (!canRefreshWebsiteThumbnail(nextThumbnail)) {
      thumbnailRefresh = { status: "skipped", reason: "not_website" };
    } else if (!shouldRefreshWebsiteThumbnail(previousThumbnail, nextThumbnail)) {
      thumbnailRefresh = { status: "skipped", reason: "unchanged" };
    } else {
      thumbnailRefresh = await refreshWebsiteThumbnail(context.env, nextThumbnail);
    }

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
      thumbnailRefresh,
      updatedBy: admin.email
    });
  } catch {
    return jsonError(500, "ADMIN_SOLUTION_UPDATE_FAILED", "La solution n'a pas pu etre modifiee.");
  }
}
