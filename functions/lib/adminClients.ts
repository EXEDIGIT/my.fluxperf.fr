import { isProduction, normalizeEmail } from "./auth";
import {
  defaultNameForType,
  fallbackAdminSolutionOptions,
  optionAllowsSolution,
  solutionLabelForType,
  type AdminSolutionOption,
  type AdminSolutionType
} from "./adminOptions";
import { findClientForEmailInWorkbook, type ClientWorkbookValues } from "./clients";
import { formatCompactFrenchDate, formatFrenchDate } from "./dateFormats";
import type { AppEnv } from "./types";

export type AdminClientInput = {
  companyName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  notes: string;
  notifyClient: boolean;
  solutions: Array<{
    type: AdminSolutionType;
    name: string;
    url: string;
  }>;
};

export type BuiltAdminClientRows = {
  clientId: string;
  contactId: string;
  clientRow: string[];
  contactRow: string[];
  solutionRows: string[][];
};

type Fetcher = typeof fetch;

type BrevoError = {
  message?: string;
};

type EmailResult =
  | { status: "sent"; email: string }
  | { status: "skipped"; email: string; reason: string };

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function asText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeUrl(value: string): string {
  const url = value.trim();

  if (!url) {
    return "";
  }

  if (/^https?:\/\//i.test(url)) {
    return url;
  }

  return `https://${url}`;
}

function domainFromUrl(value: string): string {
  if (!value) {
    return "";
  }

  try {
    return new URL(value).hostname.replace(/^www\./i, "");
  } catch {
    return value
      .replace(/^https?:\/\//i, "")
      .replace(/^www\./i, "")
      .split("/")[0]
      .trim();
  }
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function compactName(firstName: string, lastName: string): string {
  return [firstName, lastName].filter(Boolean).join(" ").trim();
}

function randomSuffix(length = 4): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);

  return Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .slice(0, length)
    .toUpperCase();
}

function buildId(prefix: string, now: Date): string {
  return `${prefix}-${formatCompactFrenchDate(now)}-${randomSuffix()}`;
}

export function validateAdminClientInput(
  payload: unknown,
  solutionOptions: AdminSolutionOption[] = fallbackAdminSolutionOptions
): AdminClientInput | string {
  if (!isRecord(payload)) {
    return "La demande est invalide.";
  }

  const companyName = asText(payload.companyName);
  const contactFirstName = asText(payload.contactFirstName);
  const contactLastName = asText(payload.contactLastName);
  const email = normalizeEmail(asText(payload.email));
  const notes = asText(payload.notes);
  const notifyClient = payload.notifyClient !== false;

  if (companyName.length < 2) {
    return "Renseignez le nom de l'organisation.";
  }

  if (!contactFirstName && !contactLastName) {
    return "Renseignez au moins le prenom ou le nom du contact.";
  }

  if (!isValidEmail(email)) {
    return "Renseignez une adresse email valide.";
  }

  if (!Array.isArray(payload.solutions) || payload.solutions.length === 0) {
    return "Selectionnez au moins une solution Fluxperf.";
  }

  const solutions = payload.solutions.map((item): AdminClientInput["solutions"][number] | string => {
    if (!isRecord(item)) {
      return "Une solution selectionnee est invalide.";
    }

    const type = asText(item.type) as AdminSolutionType;

    if (!solutionOptions.some((option) => option.type === type)) {
      return "Une solution selectionnee est invalide.";
    }

    const url = normalizeUrl(asText(item.url));
    const name = asText(item.name) || defaultNameForType(solutionOptions, type);

    if (!optionAllowsSolution(solutionOptions, type, name)) {
      return "Le nom de solution selectionne est invalide.";
    }

    return {
      type,
      name,
      url
    };
  });
  const firstError = solutions.find((item): item is string => typeof item === "string");

  if (firstError) {
    return firstError;
  }

  return {
    companyName,
    contactFirstName,
    contactLastName,
    email,
    notes,
    notifyClient,
    solutions: solutions as AdminClientInput["solutions"]
  };
}

export function hasExistingClientEmail(workbook: ClientWorkbookValues, email: string): boolean {
  return findClientForEmailInWorkbook(workbook, email).status !== "not_found";
}

export function buildAdminClientRows(input: AdminClientInput, now = new Date()): BuiltAdminClientRows {
  const date = formatFrenchDate(now);
  const clientId = buildId("CLI", now);
  const contactId = buildId("CON", now);
  const contactName = compactName(input.contactFirstName, input.contactLastName);
  const clientRow = [
    clientId,
    contactName || input.companyName,
    input.companyName,
    "Actif",
    "Oui",
    contactId,
    input.email,
    String(input.solutions.length),
    date,
    date,
    input.notes
  ];
  const contactRow = [
    contactId,
    clientId,
    input.contactFirstName,
    input.contactLastName,
    input.email,
    "Contact principal",
    "Oui",
    "Actif",
    date,
    "Cree depuis la zone interne"
  ];
  const solutionRows = input.solutions.map((solution) => [
    buildId("SOL", now),
    clientId,
    solutionLabelForType(solution.type),
    "Actif",
    solution.name,
    domainFromUrl(solution.url),
    solution.url,
    date,
    ""
  ]);

  return {
    clientId,
    contactId,
    clientRow,
    contactRow,
    solutionRows
  };
}

function portalUrl(env: AppEnv, request: Request): string {
  return (env.APP_PUBLIC_URL || new URL(request.url).origin).replace(/\/+$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export async function sendClientWelcomeEmail(
  env: AppEnv,
  request: Request,
  input: AdminClientInput,
  fetcher: Fetcher = fetch
): Promise<EmailResult> {
  const brevoApiKey = env.BREVO_API_KEY?.trim();
  const email = input.email;

  if (!input.notifyClient) {
    return {
      status: "skipped",
      email,
      reason: "Notification client desactivee."
    };
  }

  if (!brevoApiKey) {
    if (isProduction(env)) {
      throw new Error("Brevo configuration is missing.");
    }

    return {
      status: "skipped",
      email,
      reason: "Brevo non configure en local."
    };
  }

  const accessUrl = portalUrl(env, request);
  const name = compactName(input.contactFirstName, input.contactLastName) || input.companyName;
  const htmlContent = [
    `<p>Bonjour ${escapeHtml(name)},</p>`,
    `<p>Votre espace client MyFluxperf est pret pour ${escapeHtml(input.companyName)}.</p>`,
    `<p>Vous pouvez demander votre lien de connexion securise depuis <a href="${escapeHtml(accessUrl)}">${escapeHtml(accessUrl)}</a> avec cette adresse email : <strong>${escapeHtml(email)}</strong>.</p>`,
    "<p>A tres vite,<br>L'equipe Fluxperf</p>"
  ].join("");
  const textContent = [
    `Bonjour ${name},`,
    "",
    `Votre espace client MyFluxperf est pret pour ${input.companyName}.`,
    `Vous pouvez demander votre lien de connexion securise depuis ${accessUrl} avec cette adresse email : ${email}.`,
    "",
    "A tres vite,",
    "L'equipe Fluxperf"
  ].join("\n");
  const response = await fetcher("https://api.brevo.com/v3/smtp/email", {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "api-key": brevoApiKey
    },
    body: JSON.stringify({
      sender: {
        name: "Fluxperf",
        email: "notifications@fluxperf.fr"
      },
      to: [
        {
          email,
          name
        }
      ],
      subject: "Votre espace MyFluxperf est pret",
      htmlContent,
      textContent
    })
  });

  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as BrevoError;

    throw new Error(data.message || "Unable to send welcome email.");
  }

  return {
    status: "sent",
    email
  };
}
