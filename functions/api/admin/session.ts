import { requireAdmin } from "../../lib/adminAuth";
import { json } from "../../lib/response";
import type { PagesContext } from "../../lib/types";

export async function onRequestGet(context: PagesContext): Promise<Response> {
  const admin = await requireAdmin(context.request, context.env);

  if (admin instanceof Response) {
    return admin;
  }

  return json({
    admin: {
      email: admin.email
    }
  });
}
