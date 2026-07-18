import { getThumbnailSourcesFromWorkbook } from "../../lib/clients";
import { readGoogleWorkbookValues } from "../../lib/googleSheets";
import { json, jsonError } from "../../lib/response";
import type { PagesContext } from "../../lib/types";

function bearerToken(request: Request): string {
  const authorization = request.headers.get("Authorization") ?? "";
  const [scheme, token] = authorization.split(" ");

  if (scheme?.toLowerCase() === "bearer" && token?.trim()) {
    return token.trim();
  }

  return request.headers.get("X-Fluxperf-Thumbnail-Secret")?.trim() ?? "";
}

function hasInternalAccess(request: Request, secret: string | undefined): boolean {
  const expectedSecret = secret?.trim();

  return Boolean(expectedSecret && bearerToken(request) === expectedSecret);
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  if (!context.env.THUMBNAIL_INTERNAL_SECRET?.trim()) {
    return jsonError(503, "THUMBNAIL_SECRET_MISSING", "Le service de vignettes n'est pas configure.");
  }

  if (!hasInternalAccess(context.request, context.env.THUMBNAIL_INTERNAL_SECRET)) {
    return jsonError(401, "INTERNAL_AUTH_REQUIRED", "Authentification interne requise.");
  }

  try {
    const requestUrl = new URL(context.request.url);
    const solutionId = requestUrl.searchParams.get("solution_id")?.trim();
    const workbook = await readGoogleWorkbookValues(context.env);
    const sources = getThumbnailSourcesFromWorkbook(workbook).filter((source) =>
      solutionId ? source.solutionId === solutionId : true
    );

    if (solutionId && sources.length === 0) {
      return jsonError(404, "THUMBNAIL_SOURCE_NOT_FOUND", "Aucune source de vignette active ne correspond.");
    }

    return json({
      sources
    });
  } catch {
    return jsonError(
      503,
      "THUMBNAIL_SOURCES_UNAVAILABLE",
      "Les sources de vignettes sont indisponibles pour le moment."
    );
  }
}
