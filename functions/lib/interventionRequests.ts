import { isProduction } from "./auth";
import { formatCompactFrenchDate } from "./dateFormats";
import { json, jsonError } from "./response";
import type { AppEnv } from "./types";

const MAX_FILES = 5;
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_TOTAL_FILE_SIZE_BYTES = 15 * 1024 * 1024;

const allowedServices = new Set(["visibility_acquisition", "automation_ai", "assistant_ai"]);
const allowedPriorities = new Set(["normal", "urgent", "critical"]);
const allowedNeeds = new Set([
  "content_update",
  "technical_issue",
  "new_creation",
  "page_creation",
  "seo",
  "advertising_campaign",
  "tracking_analytics",
  "performance_optimization",
  "automation",
  "dashboard_reporting",
  "process_automation",
  "tool_integration",
  "workflow_issue",
  "data_sync",
  "ai_prompt_optimization",
  "scenario_improvement",
  "ai_assistant",
  "answer_adjustment",
  "knowledge_base",
  "prompt_instructions",
  "access_issue",
  "new_capability",
  "conversation_analysis",
  "user_support",
  "other"
]);

export type InterventionService = "visibility_acquisition" | "automation_ai" | "assistant_ai";

export type IncomingInterventionRequest = {
  service?: unknown;
  solutionIds?: unknown;
  siteIds?: unknown;
  needs?: unknown;
  priority?: unknown;
  message?: unknown;
};

export type InterventionSolution = {
  id: string;
  type: string;
  typeLabel: string;
  name: string;
  domain: string;
  url: string;
};

export type ValidatedInterventionRequest = {
  service: InterventionService;
  solutionIds: string[];
  selectedSolutions: InterventionSolution[];
  needs: string[];
  priority: string;
  message: string;
};

export type InterventionWebhookContext = {
  client: {
    id: string;
    companyName: string;
    fluxperfContact: {
      name: string;
      email: string;
    };
  };
  requester: {
    email: string;
    firstName: string;
    lastName: string;
  };
  source: {
    app: string;
    channel?: string;
  };
  submittedBy?: {
    email: string;
    role: "admin";
  };
  notification?: {
    sendAcknowledgment: boolean;
  };
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

export function parseInterventionRequest(value: FormDataEntryValue | null): IncomingInterventionRequest | null {
  if (!isString(value)) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return parsed && typeof parsed === "object" ? (parsed as IncomingInterventionRequest) : null;
  } catch {
    return null;
  }
}

export function buildInterventionRequestId(now = new Date()): string {
  const date = formatCompactFrenchDate(now);
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return `FP-${date}-${suffix}`;
}

export function validateInterventionFiles(files: File[]): Response | null {
  if (files.length > MAX_FILES) {
    return jsonError(400, "TOO_MANY_FILES", `Vous pouvez joindre ${MAX_FILES} fichiers maximum.`);
  }

  const totalSize = files.reduce((sum, file) => sum + file.size, 0);

  if (totalSize > MAX_TOTAL_FILE_SIZE_BYTES) {
    return jsonError(
      400,
      "FILES_TOTAL_TOO_LARGE",
      "L'ensemble des fichiers joints dépasse la limite de 15 Mo."
    );
  }

  const oversizedFile = files.find((file) => file.size > MAX_FILE_SIZE_BYTES);

  if (oversizedFile) {
    return jsonError(
      400,
      "FILE_TOO_LARGE",
      `Le fichier "${oversizedFile.name}" dépasse la limite de 10 Mo.`
    );
  }

  return null;
}

export function validateInterventionRequest(
  payload: IncomingInterventionRequest | null,
  solutions: InterventionSolution[]
): ValidatedInterventionRequest | Response {
  if (!payload) {
    return jsonError(400, "INVALID_PAYLOAD", "La demande est invalide.");
  }

  const service = isString(payload.service) ? payload.service.trim() : "";
  const priority = isString(payload.priority) ? payload.priority.trim() : "";
  const message = isString(payload.message) ? payload.message.trim() : "";
  const needs = asStringArray(payload.needs);
  const solutionIds = asStringArray(payload.solutionIds);

  if (!allowedServices.has(service)) {
    return jsonError(400, "INVALID_SERVICE", "Le service sélectionné est invalide.");
  }

  if (!allowedPriorities.has(priority)) {
    return jsonError(400, "INVALID_PRIORITY", "La priorité sélectionnée est invalide.");
  }

  if (needs.length === 0 || needs.some((need) => !allowedNeeds.has(need))) {
    return jsonError(400, "INVALID_NEEDS", "Sélectionnez au moins un besoin valide.");
  }

  if (message.length < 10) {
    return jsonError(400, "MESSAGE_REQUIRED", "Précisez votre demande en quelques mots.");
  }

  const availableSolutions = solutions.filter((solution) => solution.type === service);
  const selectedSolutions = availableSolutions.filter((solution) => solutionIds.includes(solution.id));
  const invalidSolutionIds = solutionIds.filter(
    (solutionId) => !availableSolutions.some((solution) => solution.id === solutionId)
  );

  if (invalidSolutionIds.length > 0) {
    return jsonError(400, "SOLUTION_NOT_ALLOWED", "Une solution sélectionnée ne correspond pas à votre compte.");
  }

  if (availableSolutions.length === 0) {
    return jsonError(400, "SOLUTION_NOT_ACTIVE", "Aucune solution active ne correspond à ce flux.");
  }

  if (selectedSolutions.length === 0) {
    return jsonError(400, "SOLUTION_REQUIRED", "Sélectionnez la solution concernée par votre demande.");
  }

  return {
    service: service as InterventionService,
    solutionIds,
    selectedSolutions,
    needs,
    priority,
    message
  };
}

export function buildInterventionWebhookPayload(
  request: Request,
  requestId: string,
  context: InterventionWebhookContext,
  validated: ValidatedInterventionRequest
) {
  return {
    requestId,
    submittedAt: new Date().toISOString(),
    source: {
      ...context.source,
      hostname: new URL(request.url).hostname
    },
    requester: context.requester,
    client: context.client,
    submittedBy: context.submittedBy,
    notification: context.notification ?? { sendAcknowledgment: true },
    request: validated
  };
}

export async function forwardInterventionRequest(
  env: AppEnv,
  files: File[],
  payload: ReturnType<typeof buildInterventionWebhookPayload>
): Promise<Response | null> {
  const webhookUrl = env.N8N_INTERVENTION_WEBHOOK_URL?.trim();

  if (!webhookUrl) {
    return isProduction(env)
      ? jsonError(503, "WEBHOOK_NOT_CONFIGURED", "Le service de demande est indisponible.")
      : null;
  }

  const outbound = new FormData();
  outbound.append("payload", JSON.stringify(payload));
  files.forEach((file) => outbound.append("files[]", file, file.name));

  const webhookResponse = await fetch(webhookUrl, {
    method: "POST",
    headers: env.N8N_INTERVENTION_WEBHOOK_SECRET
      ? {
          "X-Fluxperf-Webhook-Secret": env.N8N_INTERVENTION_WEBHOOK_SECRET
        }
      : undefined,
    body: outbound
  });

  if (!webhookResponse.ok) {
    return jsonError(502, "WEBHOOK_FAILED", "La demande n'a pas pu être transmise à nos équipes.");
  }

  return null;
}
