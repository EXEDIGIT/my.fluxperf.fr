import { getAuthenticatedEmail } from "../lib/auth";
import { findClientForEmailInWorkbook } from "../lib/clients";
import { readGoogleWorkbookValues } from "../lib/googleSheets";
import {
  buildInterventionRequestId,
  buildInterventionWebhookPayload,
  forwardInterventionRequest,
  parseInterventionRequest,
  validateInterventionFiles,
  validateInterventionRequest
} from "../lib/interventionRequests";
import { json, jsonError } from "../lib/response";
import type { PagesContext } from "../lib/types";

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
    const files = formData.getAll("files[]").filter((entry): entry is File => entry instanceof File);
    const fileError = validateInterventionFiles(files);

    if (fileError) {
      return fileError;
    }

    const validated = validateInterventionRequest(parseInterventionRequest(formData.get("payload")), result.client.solutions);

    if (validated instanceof Response) {
      return validated;
    }

    const requestId = buildInterventionRequestId();
    const forwardedPayload = buildInterventionWebhookPayload(
      context.request,
      requestId,
      {
        client: {
          id: result.client.id,
          companyName: result.client.companyName,
          fluxperfContact: result.client.fluxperfContact
        },
        requester: {
          email,
          firstName: result.client.firstName,
          lastName: result.client.lastName
        },
        source: { app: "my-fluxperf" }
      },
      validated
    );
    const forwardingError = await forwardInterventionRequest(context.env, files, forwardedPayload);

    if (forwardingError) return forwardingError;

    return json({ status: "received", requestId }, { status: 202 });
  } catch {
    return jsonError(
      503,
      "REQUEST_UNAVAILABLE",
      "Le service de demande est indisponible pour le moment. Merci de réessayer dans quelques instants."
    );
  }
}
