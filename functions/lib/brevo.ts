import type { AppEnv } from "./types";

const BREVO_EMAIL_ENDPOINT = "https://api.brevo.com/v3/smtp/email";

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

export function hasBrevoApiKey(env: AppEnv): boolean {
  return Boolean(env.BREVO_API_KEY?.trim());
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
