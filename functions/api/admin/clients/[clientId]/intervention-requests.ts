import { requireAdmin } from "../../../../lib/adminAuth";
import { logAdminAction } from "../../../../lib/adminActions";
import { buildAdminClientDetail } from "../../../../lib/adminWorkbook";
import { readGoogleWorkbookValues } from "../../../../lib/googleSheets";
import {
  buildInterventionRequestId,
  buildInterventionWebhookPayload,
  forwardInterventionRequest,
  parseInterventionRequest,
  validateInterventionFiles,
  validateInterventionRequest
} from "../../../../lib/interventionRequests";
import { json, jsonError } from "../../../../lib/response";
import type { PagesContext } from "../../../../lib/types";

const serviceLabels: Record<string, string> = {
  visibility_acquisition: "Flux Visibilité & Acquisition",
  automation_ai: "Flux Automatisation & IA",
  assistant_ai: "Flux Assistant IA"
};

function clientIdFromContext(context: PagesContext): string {
  const value = context.params?.clientId;

  return decodeURIComponent(Array.isArray(value) ? value[0] ?? "" : value ?? "");
}

function isActive(value: string): boolean {
  const normalized = value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  return normalized === "actif" || normalized === "active";
}

function requestedContactId(payload: Record<string, unknown>): string {
  return typeof payload.requesterContactId === "string" ? payload.requesterContactId.trim() : "";
}

function shouldSendAcknowledgment(payload: Record<string, unknown>): boolean {
  return payload.sendAcknowledgment !== false;
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);

  if (admin instanceof Response) {
    return admin;
  }

  try {
    const formData = await context.request.formData();
    const payload = parseInterventionRequest(formData.get("payload"));

    if (!payload) {
      return jsonError(400, "INVALID_PAYLOAD", "La demande est invalide.");
    }

    const contactId = requestedContactId(payload as Record<string, unknown>);

    if (!contactId) {
      return jsonError(400, "REQUESTER_REQUIRED", "Sélectionnez le contact demandeur.");
    }

    const files = formData.getAll("files[]").filter((entry): entry is File => entry instanceof File);
    const fileError = validateInterventionFiles(files);

    if (fileError) {
      return fileError;
    }

    const clientId = clientIdFromContext(context);
    const workbook = await readGoogleWorkbookValues(context.env);
    const client = buildAdminClientDetail(workbook, clientId);

    if (!client) {
      return jsonError(404, "ADMIN_CLIENT_NOT_FOUND", "Client introuvable.");
    }

    if (!isActive(client.status) || !client.portalEnabled) {
      return jsonError(409, "ADMIN_CLIENT_NOT_ACTIVE", "Ce client doit être actif pour recevoir une demande d'intervention.");
    }

    const contact = client.contacts.find((item) => item.id === contactId);

    if (!contact || !isActive(contact.status) || !contact.email) {
      return jsonError(400, "REQUESTER_NOT_ALLOWED", "Le contact demandeur sélectionné n'est pas actif.");
    }

    const activeSolutions = client.solutions
      .filter((solution) => isActive(solution.status))
      .map((solution) => ({
        id: solution.id,
        type: solution.type,
        typeLabel: serviceLabels[solution.type] || solution.type,
        name: solution.name,
        domain: solution.domain,
        url: solution.urlOrIndication
      }));
    const validated = validateInterventionRequest(payload, activeSolutions);

    if (validated instanceof Response) {
      return validated;
    }

    const requestId = buildInterventionRequestId();
    const sendAcknowledgment = shouldSendAcknowledgment(payload as Record<string, unknown>);
    const forwardedPayload = buildInterventionWebhookPayload(
      context.request,
      requestId,
      {
        client: {
          id: client.id,
          companyName: client.companyName,
          fluxperfContact: { name: "", email: "" }
        },
        requester: {
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName
        },
        source: {
          app: "my-fluxperf",
          channel: "admin_console"
        },
        submittedBy: {
          email: admin.email,
          role: "admin"
        },
        notification: { sendAcknowledgment }
      },
      validated
    );
    const forwardingError = await forwardInterventionRequest(context.env, files, forwardedPayload);

    if (forwardingError) {
      return forwardingError;
    }

    const historyLogged = await logAdminAction(context.env, {
      clientId: client.id,
      type: "intervention_request",
      label: "Demande d'intervention transmise depuis la console",
      actorEmail: admin.email,
      requesterEmail: contact.email,
      reference: requestId,
      status: "transmise",
      details: `${validated.selectedSolutions.length} solution(s) concernée(s). Accusé de réception ${sendAcknowledgment ? "demandé" : "désactivé"}.`
    });

    return json(
      {
        status: "received",
        requestId,
        notification: {
          status: sendAcknowledgment ? "requested" : "skipped",
          email: contact.email
        },
        history: {
          status: historyLogged ? "logged" : "failed"
        }
      },
      { status: 202 }
    );
  } catch {
    return jsonError(
      503,
      "ADMIN_INTERVENTION_REQUEST_UNAVAILABLE",
      "La demande n'a pas pu être transmise pour le moment. Merci de réessayer."
    );
  }
}
