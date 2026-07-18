import {
  buildConnectionRow,
  connectionExistsForDay
} from "./adminWorkbook";
import type { ClientWorkbookValues } from "./clients";
import { formatParisDateKey } from "./dateFormats";
import {
  appendGoogleSheetValues,
  ensureConnectionsSheet,
  getGoogleWriteRanges
} from "./googleSheets";
import { isProduction } from "./auth";
import type { ClientDto, AppEnv } from "./types";

type Fetcher = typeof fetch;

function shouldCreateConnectionsSheet(error: unknown): boolean {
  const message = error instanceof Error ? error.message.toLowerCase() : "";

  return message.includes("unable to parse range") || message.includes("range") || message.includes("connexions");
}

export async function logClientConnectionOncePerDay(
  env: AppEnv,
  workbook: ClientWorkbookValues,
  client: ClientDto,
  email: string,
  request: Request,
  fetcher: Fetcher = fetch
): Promise<void> {
  if (!env.GOOGLE_SHEET_ID || !env.GOOGLE_SERVICE_ACCOUNT_EMAIL || !env.GOOGLE_PRIVATE_KEY) {
    if (!isProduction(env)) {
      return;
    }
  }

  const day = formatParisDateKey(new Date());

  if (connectionExistsForDay(workbook, client.id, day)) {
    return;
  }

  const ranges = getGoogleWriteRanges(env);
  const row = buildConnectionRow(client.id, email, request);

  try {
    await appendGoogleSheetValues(env, ranges.connections, [row], fetcher);
  } catch (error) {
    if (!shouldCreateConnectionsSheet(error)) {
      throw error;
    }

    await ensureConnectionsSheet(env, fetcher);
    await appendGoogleSheetValues(env, ranges.connections, [row], fetcher);
  }
}
