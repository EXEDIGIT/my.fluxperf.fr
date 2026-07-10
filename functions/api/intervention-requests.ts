import { getAuthenticatedEmail, isProduction } from "../lib/auth";
import { findClientForEmailInWorkbook } from "../lib/clients";
import { readGoogleWorkbookValues } from "../lib/googleSheets";
import { json, jsonError } from "../lib/response";
import type { ClientDto, ClientSiteDto, PagesContext } from "../lib/types";

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;

const allowedServices = new Set(["visibility_acquisition", "automation_ai", "assistant_ai"]);
const allowedPriorities = new Set(["normal", "urgent", "critical"]);
const allowedNeeds = new Set([
  "content_update",
  "technical_issue",
  "new_creation",
  "seo",
  "advertising_campaign",
  "automation",
  "ai_assistant",
  "other"
]);

type IncomingPayload = {
  service?: unknown;
  siteIds?: unknown;
  needs?: unknown;
  priority?: unknown;
  message?: unknown;
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(value.filter(isString).map((item) => item.trim()).filter(Boolean))
  );
}

function parsePayload(value: FormDataEntryValue | null): IncomingPayload | null {
  if (!isString(value)) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return parsed && typeof parsed === "object" ? (parsed as IncomingPayload) : null;
  } catch {
    return null;
  }
}

function buildRequestId(now = new Date()): string {
  const date = now.toISOString().slice(0, 10).replace(/-/g, "");
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return `FP-${date}-${suffix}`;
}

function validateFiles(files: File[]): Response | null {
  if (files.length > MAX_FILES) {
    return jsonError(400, "TOO_MANY_FILES", `Vous pouvez joindre ${MAX_FILES} fichiers maximum.`);
  }

  const oversizedFile = files.find((file) => file.size > MAX_FILE_SIZE_BYTES);

  if (oversizedFile) {
    return jsonError(
      400,
      "FILE_TOO_LARGE",
      `Le fichier "${oversizedFile.name}" depasse la limite de 10 Mo.`
    );
  }

  return null;
}

function validateRequest(
  payload: IncomingPayload | null,
  client: ClientDto
):
  | {
      service: string;
      siteIds: string[];
      selectedSites: ClientSiteDto[];
      needs: string[];
      priority: string;
      message: string;
    }
  | Response {
  if (!payload) {
    return jsonError(400, "INVALID_PAYLOAD", "La demande est invalide.");
  }

  const service = isString(payload.service) ? payload.service.trim() : "";
  const priority = isString(payload.priority) ? payload.priority.trim() : "";
  const message = isString(payload.message) ? payload.message.trim() : "";
  const needs = asStringArray(payload.needs);
  const siteIds = asStringArray(payload.siteIds);

  if (!allowedServices.has(service)) {
    return jsonError(400, "INVALID_SERVICE", "Le service selectionne est invalide.");
  }

  if (!allowedPriorities.has(priority)) {
    return jsonError(400, "INVALID_PRIORITY", "La priorite selectionnee est invalide.");
  }

  if (needs.length === 0 || needs.some((need) => !allowedNeeds.has(need))) {
    return jsonError(400, "INVALID_NEEDS", "Selectionnez au moins un besoin valide.");
  }

  if (message.length < 10) {
    return jsonError(400, "MESSAGE_REQUIRED", "Precisez votre demande en quelques mots.");
  }

  const availableSites = client.sites ?? [];
  const selectedSites = availableSites.filter((site) => siteIds.includes(site.id));
  const invalidSiteIds = siteIds.filter((siteId) => !availableSites.some((site) => site.id === siteId));

  if (invalidSiteIds.length > 0) {
    return jsonError(400, "SITE_NOT_ALLOWED", "Un site selectionne ne correspond pas a votre compte.");
  }

  if (service === "visibility_acquisition" && availableSites.length > 0 && selectedSites.length === 0) {
    return jsonError(400, "SITE_REQUIRED", "Selectionnez le site concerne par votre demande.");
  }

  return {
    service,
    siteIds: service === "visibility_acquisition" ? siteIds : [],
    selectedSites: service === "visibility_acquisition" ? selectedSites : [],
    needs,
    priority,
    message
  };
}

function buildForwardedPayload(
  request: Request,
  requestId: string,
  email: string,
  client: ClientDto,
  validated: Exclude<ReturnType<typeof validateRequest>, Response>
) {
  return {
    requestId,
    submittedAt: new Date().toISOString(),
    source: {
      app: "my-fluxperf",
      hostname: new URL(request.url).hostname
    },
    requester: {
      email,
      firstName: client.firstName,
      lastName: client.lastName
    },
    client: {
      id: client.id,
      companyName: client.companyName,
      fluxperfContact: client.fluxperfContact
    },
    request: validated
  };
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const email = await getAuthenticatedEmail(context.request, context.env);

  if (!email) {
    return jsonError(401, "AUTH_REQUIRED", "Authentification requise.");
  }

  try {
    const workbook = await readGoogleWorkbookValues(context.env);
    const result = findClientForEmailInWorkbook(workbook, email);

    if (result.status !== "ok") {
      return jsonError(
        403,
        "CLIENT_NOT_CONFIGURED",
        "Votre acces est authentifie, mais votre espace client n'est pas encore configure."
      );
    }

    const formData = await context.request.formData();
    const files = formData.getAll("files[]").filter((entry): entry is File => entry instanceof File);
    const fileError = validateFiles(files);

    if (fileError) {
      return fileError;
    }

    const validated = validateRequest(parsePayload(formData.get("payload")), result.client);

    if (validated instanceof Response) {
      return validated;
    }

    const requestId = buildRequestId();
    const forwardedPayload = buildForwardedPayload(
      context.request,
      requestId,
      email,
      result.client,
      validated
    );
    const webhookUrl = context.env.N8N_INTERVENTION_WEBHOOK_URL?.trim();

    if (!webhookUrl) {
      if (isProduction(context.env)) {
        return jsonError(503, "WEBHOOK_NOT_CONFIGURED", "Le service de demande est indisponible.");
      }

      return json({ status: "received", requestId }, { status: 202 });
    }

    const outbound = new FormData();
    outbound.append("payload", JSON.stringify(forwardedPayload));
    files.forEach((file) => outbound.append("files[]", file, file.name));

    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: context.env.N8N_INTERVENTION_WEBHOOK_SECRET
        ? {
            "X-Fluxperf-Webhook-Secret": context.env.N8N_INTERVENTION_WEBHOOK_SECRET
          }
        : undefined,
      body: outbound
    });

    if (!webhookResponse.ok) {
      return jsonError(502, "WEBHOOK_FAILED", "La demande n'a pas pu etre transmise a nos equipes.");
    }

    return json({ status: "received", requestId }, { status: 202 });
  } catch {
    return jsonError(
      503,
      "REQUEST_UNAVAILABLE",
      "Le service de demande est indisponible pour le moment. Merci de reessayer dans quelques instants."
    );
  }
}
