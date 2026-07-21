import { formatCompactFrenchDate } from "./dateFormats";
import { appendGoogleSheetValues, getGoogleWriteRanges } from "./googleSheets";
import type { AppEnv } from "./types";

type AdminActionInput = {
  clientId: string;
  type: string;
  label: string;
  actorEmail: string;
  reference?: string;
  status?: string;
  details?: string;
};

function actionId(now = new Date()): string {
  const bytes = new Uint8Array(3);

  crypto.getRandomValues(bytes);

  const suffix = Array.from(bytes)
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("")
    .toUpperCase();

  return `ACT-${formatCompactFrenchDate(now)}-${suffix}`;
}

export async function logAdminAction(env: AppEnv, input: AdminActionInput): Promise<void> {
  const now = new Date();
  const details = [input.details?.trim(), `Action par ${input.actorEmail}`].filter(Boolean).join(" - ");
  const row = [
    actionId(now),
    input.clientId,
    now.toISOString(),
    input.type,
    input.label,
    input.reference?.trim() ?? "",
    input.actorEmail,
    "fp-console",
    input.status ?? "realisee",
    details
  ];

  try {
    await appendGoogleSheetValues(env, getGoogleWriteRanges(env).actions, [row]);
  } catch (error) {
    console.error("admin_action_log_failed", {
      clientId: input.clientId,
      type: input.type,
      message: error instanceof Error ? error.message : "Unknown Google Sheets error"
    });
  }
}
