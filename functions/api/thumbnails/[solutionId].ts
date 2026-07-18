import { getAuthenticatedEmail } from "../../lib/auth";
import { findClientForEmailInWorkbook } from "../../lib/clients";
import { readGoogleWorkbookValues } from "../../lib/googleSheets";
import { json, jsonError } from "../../lib/response";
import type { ClientDto, ClientSolutionDto, PagesContext } from "../../lib/types";

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
    return fromParam;
  }

  const pathname = new URL(context.request.url).pathname;
  const parts = pathname.split("/").filter(Boolean);

  return decodeURIComponent(parts[parts.length - 1] ?? "").trim();
}

async function authenticatedClient(context: PagesContext): Promise<{ email: string; client: ClientDto } | Response> {
  const email = await getAuthenticatedEmail(context.request, context.env);

  if (!email) {
    return jsonError(401, "AUTH_REQUIRED", "Authentification requise.");
  }

  const workbook = await readGoogleWorkbookValues(context.env);
  const result = findClientForEmailInWorkbook(workbook, email);

  if (result.status !== "ok") {
    return jsonError(
      403,
      "CLIENT_NOT_CONFIGURED",
      "Votre accès est authentifié, mais votre espace client n'est pas encore configuré."
    );
  }

  return {
    email,
    client: result.client
  };
}

function allowedWebsiteSolution(client: ClientDto, solutionId: string): ClientSolutionDto | Response {
  const solution = client.solutions.find((item) => item.id === solutionId);

  if (!solution) {
    return jsonError(403, "SOLUTION_NOT_ALLOWED", "Cette solution ne correspond pas à votre compte.");
  }

  if (solution.thumbnail.kind !== "website" || !solution.thumbnail.endpoint) {
    return jsonError(404, "THUMBNAIL_NOT_AVAILABLE", "Cette solution n'a pas de vignette de site active.");
  }

  return solution;
}

function workerBaseUrl(context: PagesContext): string | Response {
  const baseUrl = context.env.THUMBNAIL_WORKER_URL?.trim().replace(/\/+$/, "");
  const secret = context.env.THUMBNAIL_INTERNAL_SECRET?.trim();

  if (!baseUrl || !secret) {
    return jsonError(503, "THUMBNAIL_SERVICE_NOT_CONFIGURED", "Le service de vignettes n'est pas configuré.");
  }

  return baseUrl;
}

function workerHeaders(context: PagesContext, client: ClientDto): HeadersInit {
  return {
    Authorization: `Bearer ${context.env.THUMBNAIL_INTERNAL_SECRET?.trim() ?? ""}`,
    "X-Fluxperf-Client-Id": client.id
  };
}

function imageResponseFromWorker(response: Response): Response {
  const headers = new Headers();

  ["Content-Type", "Cache-Control", "ETag", "Last-Modified"].forEach((name) => {
    const value = response.headers.get(name);

    if (value) {
      headers.set(name, value);
    }
  });
  headers.set("X-Content-Type-Options", "nosniff");

  return new Response(response.body, {
    status: response.status,
    headers
  });
}

async function fetchWorkerThumbnail(
  context: PagesContext,
  client: ClientDto,
  solution: ClientSolutionDto,
  suffix = ""
): Promise<Response> {
  const baseUrl = workerBaseUrl(context);

  if (baseUrl instanceof Response) {
    return baseUrl;
  }

  return fetch(`${baseUrl}/thumbnail/${encodeURIComponent(solution.id)}${suffix}`, {
    method: suffix ? "POST" : "GET",
    headers: workerHeaders(context, client)
  });
}

export async function onRequestGet(context: PagesContext): Promise<Response> {
  try {
    const solutionId = solutionIdFromRequest(context);
    const authenticated = await authenticatedClient(context);

    if (authenticated instanceof Response) {
      return authenticated;
    }

    const solution = allowedWebsiteSolution(authenticated.client, solutionId);

    if (solution instanceof Response) {
      return solution;
    }

    const workerResponse = await fetchWorkerThumbnail(context, authenticated.client, solution);

    return imageResponseFromWorker(workerResponse);
  } catch {
    return jsonError(
      503,
      "THUMBNAIL_UNAVAILABLE",
      "La vignette de cette solution est indisponible pour le moment."
    );
  }
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    const solutionId = solutionIdFromRequest(context);
    const authenticated = await authenticatedClient(context);

    if (authenticated instanceof Response) {
      return authenticated;
    }

    const solution = allowedWebsiteSolution(authenticated.client, solutionId);

    if (solution instanceof Response) {
      return solution;
    }

    const workerResponse = await fetchWorkerThumbnail(context, authenticated.client, solution, "/refresh");
    const contentType = workerResponse.headers.get("Content-Type") ?? "";

    if (contentType.includes("application/json")) {
      const body = await workerResponse.json();

      return json(body, { status: workerResponse.status });
    }

    return json(
      {
        status: workerResponse.ok ? "refreshing" : "failed"
      },
      { status: workerResponse.status }
    );
  } catch {
    return jsonError(
      503,
      "THUMBNAIL_REFRESH_UNAVAILABLE",
      "Le rafraîchissement de cette vignette est indisponible pour le moment."
    );
  }
}
