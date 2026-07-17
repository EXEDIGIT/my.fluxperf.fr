import { isProduction } from "../lib/auth";
import { formatCompactFrenchDate } from "../lib/dateFormats";
import { json, jsonError } from "../lib/response";
import type { PagesContext } from "../lib/types";

type IncomingPayload = {
  firstName?: unknown;
  lastName?: unknown;
  email?: unknown;
  companyName?: unknown;
  referrer?: unknown;
  message?: unknown;
  website?: unknown;
};

type ValidatedPayload = {
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  referrer: string;
  message: string;
};

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function buildRequestId(now = new Date()): string {
  const date = formatCompactFrenchDate(now);
  const bytes = new Uint8Array(2);
  crypto.getRandomValues(bytes);
  const suffix = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return `ACC-${date}-${suffix}`;
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

  const website = isString(payload.website) ? payload.website.trim() : "";

  if (website) {
    return jsonError(400, "SPAM_DETECTED", "La demande est invalide.");
  }

  const firstName = isString(payload.firstName) ? payload.firstName.trim() : "";
  const lastName = isString(payload.lastName) ? payload.lastName.trim() : "";
  const email = isString(payload.email) ? normalizeEmail(payload.email) : "";
  const companyName = isString(payload.companyName) ? payload.companyName.trim() : "";
  const referrer = isString(payload.referrer) ? payload.referrer.trim() : "";
  const message = isString(payload.message) ? payload.message.trim() : "";

  if (!firstName) {
    return jsonError(400, "FIRST_NAME_REQUIRED", "Renseignez votre prenom.");
  }

  if (firstName.length > 80) {
    return jsonError(400, "FIRST_NAME_TOO_LONG", "Le prenom doit contenir 80 caracteres maximum.");
  }

  if (!lastName) {
    return jsonError(400, "LAST_NAME_REQUIRED", "Renseignez votre nom.");
  }

  if (lastName.length > 80) {
    return jsonError(400, "LAST_NAME_TOO_LONG", "Le nom doit contenir 80 caracteres maximum.");
  }

  if (!isValidEmail(email)) {
    return jsonError(400, "EMAIL_INVALID", "Renseignez une adresse email valide.");
  }

  if (email.length > 180) {
    return jsonError(400, "EMAIL_TOO_LONG", "L'email doit contenir 180 caracteres maximum.");
  }

  if (companyName.length < 2) {
    return jsonError(400, "COMPANY_REQUIRED", "Renseignez le nom de votre entreprise.");
  }

  if (companyName.length > 140) {
    return jsonError(400, "COMPANY_TOO_LONG", "L'entreprise doit contenir 140 caracteres maximum.");
  }

  if (referrer.length > 180) {
    return jsonError(400, "REFERRER_TOO_LONG", "Le referent doit contenir 180 caracteres maximum.");
  }

  if (message.length < 10) {
    return jsonError(400, "MESSAGE_REQUIRED", "Decrivez votre demande en quelques mots.");
  }

  if (message.length > 4000) {
    return jsonError(400, "MESSAGE_TOO_LONG", "La description doit contenir 4000 caracteres maximum.");
  }

  return {
    firstName,
    lastName,
    email,
    companyName,
    referrer,
    message
  };
}

function requesterName(payload: ValidatedPayload): string {
  return [payload.firstName, payload.lastName].filter(Boolean).join(" ");
}

function buildBrevoBody(requestId: string, payload: ValidatedPayload) {
  const name = requesterName(payload);
  const escapedMessage = escapeHtml(payload.message).replace(/\n/g, "<br>");
  const referrerLine = payload.referrer ? `Referent : ${payload.referrer}` : "Referent : non renseigne";
  const referrerHtml = payload.referrer
    ? escapeHtml(payload.referrer)
    : "non renseigne";
  const textContent = [
    `Reference : ${requestId}`,
    `Entreprise : ${payload.companyName}`,
    `Demandeur : ${name} <${payload.email}>`,
    referrerLine,
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
      email: payload.email,
      name
    },
    subject: `[MyFluxperf] Demande d'acces - ${payload.companyName}`,
    htmlContent: [
      `<p><strong>Reference :</strong> ${escapeHtml(requestId)}</p>`,
      `<p><strong>Entreprise :</strong> ${escapeHtml(payload.companyName)}</p>`,
      `<p><strong>Demandeur :</strong> ${escapeHtml(name)} &lt;${escapeHtml(payload.email)}&gt;</p>`,
      `<p><strong>Referent :</strong> ${referrerHtml}</p>`,
      `<p>${escapedMessage}</p>`
    ].join(""),
    textContent
  };
}

export async function onRequestPost(context: PagesContext): Promise<Response> {
  try {
    const validated = validatePayload(await parsePayload(context.request));

    if (validated instanceof Response) {
      return validated;
    }

    const brevoApiKey = context.env.BREVO_API_KEY?.trim();

    if (!brevoApiKey && isProduction(context.env)) {
      return jsonError(503, "BREVO_NOT_CONFIGURED", "La demande d'acces est indisponible pour le moment.");
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
      body: JSON.stringify(buildBrevoBody(requestId, validated))
    });

    if (!brevoResponse.ok) {
      return jsonError(502, "BREVO_FAILED", "La demande n'a pas pu etre transmise au support.");
    }

    return json({ status: "received", requestId }, { status: 202 });
  } catch {
    return jsonError(
      500,
      "ACCESS_REQUEST_FAILED",
      "La demande d'acces est indisponible pour le moment. Merci de reessayer."
    );
  }
}
