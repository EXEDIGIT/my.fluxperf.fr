import { requireAdmin } from "../../lib/adminAuth";
import { buildAdminSolutionOptions, fallbackAdminSolutionOptions } from "../../lib/adminOptions";
import { readGoogleParametersValues } from "../../lib/googleSheets";
import { json } from "../../lib/response";
import type { PagesContext } from "../../lib/types";

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);

  if (admin instanceof Response) {
    return admin;
  }

  try {
    const parameterValues = await readGoogleParametersValues(context.env);

    return json({
      solutionOptions: buildAdminSolutionOptions(parameterValues)
    });
  } catch {
    return json({
      solutionOptions: fallbackAdminSolutionOptions
    });
  }
}
