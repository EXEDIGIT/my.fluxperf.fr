import { syncBrevoMarketingContact, type BrevoMarketingContact, type BrevoMarketingSyncResult } from "./brevo";
import { updateGoogleSheetValues } from "./googleSheets";
import type { AppEnv } from "./types";

type SheetRecord = Record<string, string>;

export const CONTACT_BREVO_MARKETING_HEADERS = [
  "brevo_marketing_eligible",
  "brevo_marketing_source",
  "brevo_marketing_eligible_at",
  "brevo_marketing_status",
  "brevo_marketing_synced_at",
  "brevo_marketing_last_error"
] as const;

function value(record: SheetRecord, ...keys: string[]): string {
  for (const key of keys) {
    const candidate = record[key.toLowerCase()];
    if (candidate) return candidate.trim();
  }
  return "";
}

function affirmative(input: string): boolean {
  return ["oui", "yes", "true", "1"].includes(input.trim().toLowerCase());
}

function active(input: string): boolean {
  return ["actif", "active"].includes(input.trim().toLowerCase());
}

export function isBrevoMarketingEligible(record: SheetRecord): boolean {
  return affirmative(value(record, "brevo_marketing_eligible"));
}

export function buildBrevoMarketingColumns(eligible: boolean, source: string, now = new Date()): string[] {
  if (!eligible) {
    return ["Non", "", "", "not_eligible", "", ""];
  }

  return ["Oui", source, now.toISOString(), "pending", "", ""];
}

export function brevoMarketingStatusCells(result: BrevoMarketingSyncResult, now = new Date()): string[] {
  if (result.status === "failed") {
    return ["failed", "", result.reason ?? "Synchronisation Brevo impossible."];
  }

  return [result.status, now.toISOString(), ""];
}

export async function persistBrevoMarketingStatus(
  env: AppEnv,
  rowNumber: number,
  result: BrevoMarketingSyncResult,
  now = new Date()
): Promise<void> {
  try {
    await updateGoogleSheetValues(env, `Contacts!N${rowNumber}:P${rowNumber}`, [brevoMarketingStatusCells(result, now)]);
  } catch (error) {
    console.error("brevo_marketing_status_write_failed", {
      rowNumber,
      message: error instanceof Error ? error.message : "Unknown Google Sheets error"
    });
  }
}

function servicesForClient(solutions: SheetRecord[], clientId: string): string[] {
  return Array.from(new Set(
    solutions
      .filter((solution) => value(solution, "client_id") === clientId && active(value(solution, "statut_solution", "status", "statut")))
      .map((solution) => value(solution, "nom_solution", "name") || value(solution, "type_solution", "type"))
      .filter(Boolean)
  ));
}

export function brevoMarketingContactFromRecords(
  client: SheetRecord,
  contact: SheetRecord,
  solutions: SheetRecord[],
  source = "myfluxperf_admin"
): BrevoMarketingContact {
  const clientId = value(client, "client_id", "id");

  return {
    email: value(contact, "email"),
    firstName: value(contact, "prenom", "first_name"),
    lastName: value(contact, "nom", "last_name"),
    clientId,
    companyName: value(client, "organisation", "company_name", "nom_compte") || "Client Fluxperf",
    role: value(contact, "role_contact", "role"),
    activeServices: servicesForClient(solutions, clientId),
    source
  };
}

export function clientAndContactAreMarketingActive(client: SheetRecord, contact: SheetRecord): boolean {
  const portal = value(client, "espace_client_actif");
  const contactStatus = value(contact, "statut_contact", "status");

  return active(value(client, "statut_client", "status")) && (!portal || affirmative(portal)) && (!contactStatus || active(contactStatus));
}

export async function syncEligibleBrevoMarketingContact(
  env: AppEnv,
  client: SheetRecord,
  contact: SheetRecord,
  solutions: SheetRecord[],
  source = "myfluxperf_admin"
): Promise<BrevoMarketingSyncResult> {
  return syncBrevoMarketingContact(env, brevoMarketingContactFromRecords(client, contact, solutions, source));
}
