import { getAuthenticatedEmail } from "../../lib/auth";
import { findClientForEmailInWorkbook, getStatisticsSourceForClientSolution } from "../../lib/clients";
import {
  fetchGa4Statistics,
  isStatisticsPeriod,
  statisticsPeriod,
  type StatisticsReadyResponse
} from "../../lib/googleAnalytics";
import { fetchGoogleAdsStatistics, type GoogleAdsStatisticsReadyResponse } from "../../lib/googleAds";
import { readGoogleWorkbookValues } from "../../lib/googleSheets";
import { json, jsonError } from "../../lib/response";
import type { PagesContext } from "../../lib/types";

type CacheStorageWithDefault = CacheStorage & {
  default?: Cache;
};

type StatisticsApiReadyResponse = StatisticsReadyResponse | GoogleAdsStatisticsReadyResponse;

function paramValue(context: PagesContext, name: string): string {
  const value = context.params?.[name];

  if (Array.isArray(value)) {
    return value[0]?.trim() ?? "";
  }

  return value?.trim() ?? "";
}

function solutionIdFromRequest(context: PagesContext): string {
  const fromParam = paramValue(context, "solutionId");

  if (fromParam) {
    return decodeURIComponent(fromParam);
  }

  const pathname = new URL(context.request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);

  return decodeURIComponent(parts[parts.length - 1] ?? "").trim();
}

function requestedPeriod(context: PagesContext): string {
  return new URL(context.request.url).searchParams.get("period")?.trim() || "30d";
}

function cacheForRuntime(): Cache | null {
  return (globalThis.caches as CacheStorageWithDefault | undefined)?.default ?? null;
}

function cacheKey(context: PagesContext, clientId: string, solutionId: string, period: string): Request {
  const url = new URL(context.request.url);

  url.pathname = `/api/statistics-cache/${encodeURIComponent(clientId)}/${encodeURIComponent(solutionId)}`;
  url.search = `?period=${encodeURIComponent(period)}`;

  return new Request(url.toString(), {
    method: "GET"
  });
}

function cachedJson(data: unknown): Response {
  return json(data, {
    headers: {
      "Cache-Control": "private, max-age=14400"
    }
  });
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const email = await getAuthenticatedEmail(context.request, context.env);

  if (!email) {
    return jsonError(401, "AUTH_REQUIRED", "Authentification requise.");
  }

  const periodId = requestedPeriod(context);

  if (!isStatisticsPeriod(periodId)) {
    return jsonError(400, "INVALID_PERIOD", "La periode selectionnee est invalide.");
  }

  try {
    const solutionId = solutionIdFromRequest(context);
    const workbook = await readGoogleWorkbookValues(context.env);
    const result = findClientForEmailInWorkbook(workbook, email);

    if (result.status !== "ok") {
      return jsonError(
        403,
        "CLIENT_NOT_CONFIGURED",
        "Votre acces est authentifie, mais votre espace client n'est pas encore configure."
      );
    }

    const source = getStatisticsSourceForClientSolution(workbook, result.client, solutionId);

    if (!source) {
      return jsonError(403, "SOLUTION_NOT_ALLOWED", "Cette solution ne correspond pas a votre compte.");
    }

    if (source.status === "not_applicable") {
      return jsonError(404, "STATISTICS_NOT_AVAILABLE", "Les statistiques ne sont pas disponibles pour cette solution.");
    }

    if (source.status === "pending_setup") {
      return json({
        status: "pending_setup",
        provider: source.provider,
        period: statisticsPeriod(periodId),
        solution: {
          id: source.solution.id,
          name: source.solution.name || source.solution.typeLabel,
          domain: source.solution.domain
        }
      });
    }

    if (source.status !== "available") {
      return jsonError(404, "STATISTICS_NOT_AVAILABLE", "Les statistiques ne sont pas disponibles pour cette solution.");
    }

    const cache = cacheForRuntime();
    const key = cacheKey(context, result.client.id, source.solution.id, periodId);
    const cached = await cache?.match(key);

    if (cached) {
      return cached;
    }

    const statistics =
      source.provider === "google_ads"
        ? await fetchGoogleAdsStatistics(
            context.env,
            source.googleAdsCustomerId,
            source.solution,
            periodId
          )
        : await fetchGa4Statistics(context.env, source.ga4PropertyId, source.solution, periodId);
    const response = cachedJson(statistics satisfies StatisticsApiReadyResponse);

    await cache?.put(key, response.clone());

    return response;
  } catch (error) {
    console.error("statistics_unavailable", error instanceof Error ? error.message : "Unknown error");

    return jsonError(
      503,
      "STATISTICS_UNAVAILABLE",
      "Les statistiques sont indisponibles pour le moment. Merci de reessayer dans quelques instants."
    );
  }
}
