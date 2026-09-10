import type { AppEnv } from "./types";

const BREVO_EMAIL_ENDPOINT = "https://api.brevo.com/v3/smtp/email";
const BREVO_CONTACTS_ENDPOINT = "https://api.brevo.com/v3/contacts";

export const FLUXPERF_BREVO_SENDER = {
  name: "Fluxperf",
  email: "notifications@fluxperf.fr"
} as const;

export const FLUXPERF_SUPPORT_RECIPIENT = {
  name: "Support Fluxperf",
  email: "support@fluxperf.fr"
} as const;

type BrevoRecipient = {
  email: string;
  name: string;
};

export type BrevoSupportEmail = {
  replyTo: BrevoRecipient;
  subject: string;
  htmlContent: string;
  textContent: string;
};

export type BrevoMarketingContact = {
  email: string;
  firstName: string;
  lastName: string;
  clientId: string;
  companyName: string;
  role: string;
  activeServices: string[];
  source: string;
};

export type BrevoMarketingSyncResult = {
  status: "synced" | "unlinked" | "failed";
  email: string;
  reason?: string;
};

type BrevoError = {
  message?: string;
  code?: string;
};

export function hasBrevoApiKey(env: AppEnv): boolean {
  return Boolean(env.BREVO_API_KEY?.trim());
}

function marketingConfig(env: AppEnv): { apiKey: string; listId: number } | null {
  const apiKey = env.BREVO_API_KEY?.trim();
  const listId = Number(env.BREVO_MARKETING_LIST_ID?.trim());

  if (!apiKey || !Number.isInteger(listId) || listId <= 0) {
    return null;
  }

  return { apiKey, listId };
}

function brevoError(data: BrevoError, fallback: string): string {
  return (data.message || data.code || fallback).trim().slice(0, 240);
}

/**
 * Adds or updates a contact without touching Brevo blacklist fields. Brevo remains
 * authoritative for unsubscriptions, hard bounces and complaints.
 */
export async function syncBrevoMarketingContact(
  env: AppEnv,
  contact: BrevoMarketingContact,
  fetcher: typeof fetch = fetch
): Promise<BrevoMarketingSyncResult> {
  const config = marketingConfig(env);
  const email = contact.email.trim().toLowerCase();

  if (!config) {
    return { status: "failed", email, reason: "Configuration Brevo marketing absente." };
  }

  try {
    const response = await fetcher(BREVO_CONTACTS_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": config.apiKey
      },
      body: JSON.stringify({
        email,
        updateEnabled: true,
        listIds: [config.listId],
        attributes: {
          FNAME: contact.firstName.trim(),
          LNAME: contact.lastName.trim(),
          MFP_CLIENT_ID: contact.clientId.trim(),
          MFP_COMPANY: contact.companyName.trim(),
          MFP_ROLE: contact.role.trim(),
          MFP_ACTIVE_SERVICES: contact.activeServices.filter(Boolean).join(" | "),
          MFP_SOURCE: contact.source.trim()
        }
      })
    });

    if (!response.ok) {
      const data = (await response.json().catch(() => ({}))) as BrevoError;
      return { status: "failed", email, reason: brevoError(data, `Brevo a répondu ${response.status}.`) };
    }

    return { status: "synced", email };
  } catch (error) {
    return { status: "failed", email, reason: error instanceof Error ? error.message.slice(0, 240) : "Brevo indisponible." };
  }
}

export async function unlinkBrevoMarketingContact(
  env: AppEnv,
  email: string,
  fetcher: typeof fetch = fetch
): Promise<BrevoMarketingSyncResult> {
  const config = marketingConfig(env);
  const normalizedEmail = email.trim().toLowerCase();

  if (!config) {
    return { status: "failed", email: normalizedEmail, reason: "Configuration Brevo marketing absente." };
  }

  try {
    const response = await fetcher(`${BREVO_CONTACTS_ENDPOINT}/${encodeURIComponent(normalizedEmail)}`, {
      method: "PUT",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": config.apiKey
      },
      body: JSON.stringify({ unlinkListIds: [config.listId] })
    });

    if (!response.ok && response.status !== 404) {
      const data = (await response.json().catch(() => ({}))) as BrevoError;
      return { status: "failed", email: normalizedEmail, reason: brevoError(data, `Brevo a répondu ${response.status}.`) };
    }

    return { status: "unlinked", email: normalizedEmail };
  } catch (error) {
    return { status: "failed", email: normalizedEmail, reason: error instanceof Error ? error.message.slice(0, 240) : "Brevo indisponible." };
  }
}

export async function sendBrevoSupportEmail(
  env: AppEnv,
  email: BrevoSupportEmail,
  fetcher: typeof fetch = fetch
): Promise<boolean> {
  const apiKey = env.BREVO_API_KEY?.trim();

  if (!apiKey) {
    return false;
  }

  try {
    const response = await fetcher(BREVO_EMAIL_ENDPOINT, {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
        "api-key": apiKey
      },
      body: JSON.stringify({
        sender: FLUXPERF_BREVO_SENDER,
        to: [FLUXPERF_SUPPORT_RECIPIENT],
        ...email
      })
    });

    return response.ok;
  } catch {
    return false;
  }
}
