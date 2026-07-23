import { getAuthenticatedEmail, isProduction } from "../../lib/auth";
import { formatCompactFrenchDate } from "../../lib/dateFormats";
import { findClientForEmailInWorkbook } from "../../lib/clients";
import { readGoogleWorkbookValues } from "../../lib/googleSheets";
import { json, jsonError } from "../../lib/response";
import type { ClientDto, PagesContext } from "../../lib/types";

const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_FILE_TYPES = new Set(["application/pdf", "image/jpeg", "image/png"]);

function buildDocumentId(now = new Date()): string {
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return `RIB-${formatCompactFrenchDate(now)}-${suffix}`;
}

function validateRibFile(files: File[]): Response | null {
  if (files.length !== 1) {
    return jsonError(400, "RIB_FILE_REQUIRED", "Ajoutez un unique document RIB au format PDF, JPG ou PNG.");
  }

  const [file] = files;

  if (!ALLOWED_FILE_TYPES.has(file.type)) {
    return jsonError(400, "RIB_FILE_TYPE_INVALID", "Le RIB doit être un fichier PDF, JPG ou PNG.");
  }

  if (file.size === 0) {
    return jsonError(400, "RIB_FILE_EMPTY", "Le document RIB est vide.");
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    return jsonError(400, "RIB_FILE_TOO_LARGE", "Le document RIB ne doit pas dépasser 10 Mo.");
  }

  return null;
}

function buildForwardedPayload(
  request: Request,
  documentId: string,
  email: string,
  client: ClientDto
) {
  return {
    documentId,
    submittedAt: new Date().toISOString(),
    source: {
      app: "my-fluxperf",
      hostname: new URL(request.url).hostname
    },
    requester: {
      email
    },
    client: {
      id: client.id,
      companyName: client.companyName
    },
    document: {
      type: "rib_iban"
    }
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
        "Votre accès est authentifié, mais votre espace client n'est pas encore configuré."
      );
    }

    const formData = await context.request.formData();
    const files = formData.getAll("rib").filter((entry): entry is File => entry instanceof File);
    const fileError = validateRibFile(files);

    if (fileError) {
      return fileError;
    }

    const documentId = buildDocumentId();
    const forwardedPayload = buildForwardedPayload(context.request, documentId, email, result.client);
    const webhookUrl = context.env.N8N_RIB_WEBHOOK_URL?.trim();

    if (!webhookUrl) {
      if (isProduction(context.env)) {
        return jsonError(503, "RIB_WEBHOOK_NOT_CONFIGURED", "Le dépôt de RIB est indisponible pour le moment.");
      }

      return json({ status: "received", documentId, submittedAt: forwardedPayload.submittedAt }, { status: 202 });
    }

    const outbound = new FormData();
    outbound.append("payload", JSON.stringify(forwardedPayload));
    outbound.append("rib", files[0], files[0].name);

    const webhookResponse = await fetch(webhookUrl, {
      method: "POST",
      headers: context.env.N8N_RIB_WEBHOOK_SECRET
        ? {
            "X-Fluxperf-Webhook-Secret": context.env.N8N_RIB_WEBHOOK_SECRET
          }
        : undefined,
      body: outbound
    });

    if (!webhookResponse.ok) {
      return jsonError(502, "RIB_WEBHOOK_FAILED", "Le document RIB n'a pas pu être enregistré. Merci de réessayer.");
    }

    return json({ status: "received", documentId, submittedAt: forwardedPayload.submittedAt }, { status: 202 });
  } catch {
    return jsonError(
      503,
      "RIB_UNAVAILABLE",
      "Le dépôt de RIB est indisponible pour le moment. Merci de réessayer dans quelques instants."
    );
  }
}
