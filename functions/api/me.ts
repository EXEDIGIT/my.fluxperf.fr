import { getAuthenticatedEmail } from "../lib/auth";
import { findClientForEmailInWorkbook } from "../lib/clients";
import { logClientConnectionOncePerDay } from "../lib/connections";
import { readGoogleWorkbookValues } from "../lib/googleSheets";
import { json, jsonError } from "../lib/response";
import type { PagesContext } from "../lib/types";

export async function onRequestGet(context: PagesContext): Promise<Response> {
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
        "Votre accès est authentifié, mais votre espace client n'est pas encore configuré. Contactez Fluxperf."
      );
    }

    try {
      await logClientConnectionOncePerDay(context.env, workbook, result.client, email, context.request);
    } catch (error) {
      console.error("connection_log_failed", error instanceof Error ? error.message : "Unknown error");
    }

    return json({
      user: {
        email
      },
      client: result.client
    });
  } catch {
    return jsonError(
      503,
      "DATA_UNAVAILABLE",
      "Les données de votre espace client sont indisponibles pour le moment. Merci de réessayer dans quelques instants."
    );
  }
}
