import { getAuthenticatedEmail, isProduction } from "../lib/auth";
import { findClientForEmailInWorkbook } from "../lib/clients";
import { formatCompactFrenchDate } from "../lib/dateFormats";
import { readGoogleWorkbookValues } from "../lib/googleSheets";
import { json, jsonError } from "../lib/response";
import type { ClientDto, PagesContext } from "../lib/types";

type IncomingPayload = {
  subject?: unknown;
  message?: unknown;
};

type ValidatedPayload = {
  subject: string;
  message: string;
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function buildRequestId(now = new Date()): string {
  const date = formatCompactFrenchDate(now);
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return `SUP-${date}-${suffix}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

async function parsePayload(request: Request): Promise<IncomingPayload | null> {
  try {
    const parsed = (await request.json()) as unknown;

    return parsed && typeof parsed === "object" ? (parsed as IncomingPayload) : null;
  } catch {
    return null;
  }
}

function validatePayload(payload: IncomingPayload | null): ValidatedPayload | Response {
  if (!payload) {
    return jsonError(400, "INVALID_PAYLOAD", "La demande est invalide.");
  }

  const subject = isString(payload.subject) ? payload.subject.trim() : "";
  const message = isString(payload.message) ? payload.message.trim() : "";

  if (subject.length < 3) {
    return jsonError(400, "SUBJECT_REQUIRED", "Renseignez l'objet de votre demande.");
  }

  if (subject.length > 140) {
    return jsonError(400, "SUBJECT_TOO_LONG", "L'objet doit contenir 140 caractères maximum.");
  }

  if (message.length < 10) {
    return jsonError(400, "MESSAGE_REQUIRED", "Décrivez votre demande en quelques mots.");
  }

  if (message.length > 4000) {
    return jsonError(400, "MESSAGE_TOO_LONG", "La description doit contenir 4000 caractères maximum.");
  }

  return { subject, message };
}

function requesterName(client: ClientDto, email: string): string {
  return [client.firstName, client.lastName].filter(Boolean).join(" ") || email;
}

function buildBrevoBody(
  requestId: string,
  email: string,
  client: ClientDto,
  payload: ValidatedPayload
) {
  const name = requesterName(client, email);
  const escapedMessage = escapeHtml(payload.message).replace(/\n/g, "<br>");
  const textContent = [
    `Référence : ${requestId}`,
    `Client : ${client.companyName} (${client.id || "sans id"})`,
    `Demandeur : ${name} <${email}>`,
    `Objet : ${payload.subject}`,
    "",
    payload.message
  ].join("\n");

  return {
    sender: {
      name: "Fluxperf",
      email: "notifications@fluxperf.fr"
    },
    to: [
      {
        email: "support@fluxperf.fr",
        name: "Support Fluxperf"
      }
    ],
    replyTo: {
      email,
      name
    },
    subject: `[MyFluxperf] ${client.companyName} - ${payload.subject}`,
    htmlContent: [
      `<p><strong>Référence :</strong> ${escapeHtml(requestId)}</p>`,
      `<p><strong>Client :</strong> ${escapeHtml(client.companyName)} (${escapeHtml(client.id || "sans id")})</p>`,
      `<p><strong>Demandeur :</strong> ${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;</p>`,
      `<p><strong>Objet :</strong> ${escapeHtml(payload.subject)}</p>`,
      `<p>${escapedMessage}</p>`
    ].join(""),
    textContent
  };
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  const email = await getAuthenticatedEmail(context.request, context.env);

  if (!email) {
    return jsonError(401, "AUTH_REQUIRED", "Authentification requise.");
  }

  try {
    const validated = validatePayload(await parsePayload(context.request));

    if (validated instanceof Response) {
      return validated;
    }

    const brevoApiKey = context.env.BREVO_API_KEY?.trim();

    if (!brevoApiKey && isProduction(context.env)) {
      return jsonError(503, "BREVO_NOT_CONFIGURED", "Le support est indisponible pour le moment.");
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

    const requestId = buildRequestId();

    if (!brevoApiKey) {
      return json({ status: "received", requestId }, { status: 202 });
    }

    const brevoResponse = await fetch("https://api.brevo.com/v3/smtp/email", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": brevoApiKey
      },
      body: JSON.stringify(buildBrevoBody(requestId, email, result.client, validated))
    });

    if (!brevoResponse.ok) {
      return jsonError(502, "BREVO_FAILED", "La demande n'a pas pu être transmise au support.");
    }

    return json({ status: "received", requestId }, { status: 202 });
  } catch {
    return jsonError(
      500,
      "SUPPORT_REQUEST_FAILED",
      "La demande support est indisponible pour le moment. Merci de réessayer."
    );
  }
}
