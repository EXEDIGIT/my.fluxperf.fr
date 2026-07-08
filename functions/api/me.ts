import { getAuthenticatedEmail } from "../lib/auth";
import { findClientForEmailInWorkbook } from "../lib/clients";
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
        "Votre acces est authentifie, mais votre espace client n'est pas encore configure. Contactez FluxPerf."
      );
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
      "Les donnees de votre espace client sont indisponibles pour le moment. Merci de reessayer dans quelques instants."
    );
  }
}
