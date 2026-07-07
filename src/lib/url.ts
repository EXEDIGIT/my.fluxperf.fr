import type { Client } from "../types/client";

export type JotformPrefill = {
  clientId: string;
  company: string;
  email: string;
  firstName: string;
};

export function buildPrefilledJotformUrl(url: string, prefill: JotformPrefill): string {
  const target = new URL(url);

  target.searchParams.set("client_id", prefill.clientId);
  target.searchParams.set("company", prefill.company);
  target.searchParams.set("email", prefill.email);
  target.searchParams.set("first_name", prefill.firstName);

  return target.toString();
}

export function prefillFromClient(client: Client, email: string): JotformPrefill {
  return {
    clientId: client.id,
    company: client.companyName,
    email,
    firstName: client.firstName
  };
}

export function isExternalUrl(url: string | null | undefined): url is string {
  return Boolean(url && /^https?:\/\//i.test(url));
}

