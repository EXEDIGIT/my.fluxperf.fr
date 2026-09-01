import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { csv } from "./lib/client-import.mjs";
import { googleBatchUpdate, googleMetadata, googleRead, googleToken, loadEnv, requiredEnv, SHEETS_SCOPE } from "./lib/cli-runtime.mjs";
import {
  PRESERVED_ADMIN_EMAIL,
  RESET_SHEETS,
  TEST_CLIENT_RESET_TARGETS,
  buildTestClientsResetPlan,
  deletionRequests
} from "./lib/client-test-reset.mjs";
import { deleteSupabaseUserByEmail, findSupabaseUserByEmail } from "./lib/silent-supabase.mjs";
import { purgeThumbnail } from "./lib/thumbnail-purge.mjs";

const CONFIRMATION = "DELETE_TEST_CLIENTS";
const ranges = Object.fromEntries(RESET_SHEETS.map((sheet) => [sheet, `${sheet}!A1:Z5000`]));
const authTargets = TEST_CLIENT_RESET_TARGETS.filter((target) => target.email !== PRESERVED_ADMIN_EMAIL);

function usage(message = "", error = true) {
  if (message) console.error(`Erreur : ${message}\n`);
  console.error("Usage : pnpm reset:test-clients -- --mode dry-run|apply [--confirm DELETE_TEST_CLIENTS] [--env-file <fichier>] [--output <dossier>]");
  if (error) process.exitCode = 1;
}

function argsFrom(argv) {
  const result = {};
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--") continue;
    if (!argument.startsWith("--")) continue;
    const name = argument.slice(2);
    if (name === "help") result.help = true;
    else {
      result[name] = argv[index + 1];
      index += 1;
    }
  }
  return result;
}

function timestamp() {
  return new Date().toISOString().replace(/[:.]/g, "-");
}

async function writeReport(output, report) {
  await mkdir(output, { recursive: true });
  await writeFile(path.join(output, "reset-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(
    path.join(output, "reset-summary.csv"),
    csv(
      Object.entries(report.counts ?? {}).map(([resource, count]) => ({
        mode: report.mode,
        resource,
        lignes_ciblees: count,
        statut: report.status
      })),
      ["mode", "resource", "lignes_ciblees", "statut"]
    ),
    "utf8"
  );
}

async function readWorkbook(token, spreadsheetId) {
  const metadata = await googleMetadata(token, spreadsheetId);
  const existingSheets = metadata.filter((sheet) => ranges[sheet.title]);
  const workbook = {};
  await Promise.all(
    existingSheets.map(async (sheet) => {
      workbook[sheet.title] = await googleRead(token, spreadsheetId, ranges[sheet.title]);
    })
  );
  return { metadata, workbook };
}

async function authPreflight(env) {
  const administrator = await findSupabaseUserByEmail(env, PRESERVED_ADMIN_EMAIL);
  const targets = {};
  for (const target of authTargets) {
    targets[target.clientId] = await findSupabaseUserByEmail(env, target.email);
  }
  return { administrator, targets };
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  if (args.help) return usage("", false);
  if (!args.mode || !["dry-run", "apply"].includes(args.mode)) return usage("--mode dry-run ou apply est obligatoire.");
  if (args.mode === "apply" && args.confirm !== CONFIRMATION) {
    return usage(`L'application exige --confirm ${CONFIRMATION}.`);
  }

  const output = path.resolve(args.output || path.join(".codex-tmp", "reset-test-clients", timestamp()));
  const report = {
    generated_at: new Date().toISOString(),
    mode: args.mode,
    status: "preflight",
    counts: {},
    targets: TEST_CLIENT_RESET_TARGETS.map((target) => ({ client_id: target.clientId, organisation: target.organisation })),
    administrator: "preserved_not_checked",
    auth: {},
    thumbnails: [],
    errors: []
  };

  try {
    const env = await loadEnv(args["env-file"]);
    requiredEnv(env, [
      "GOOGLE_SHEET_ID",
      "GOOGLE_SERVICE_ACCOUNT_EMAIL",
      "GOOGLE_PRIVATE_KEY",
      "SUPABASE_URL",
      "SUPABASE_SERVICE_ROLE_KEY",
      "ADMIN_EMAILS",
      "THUMBNAIL_WORKER_URL",
      "THUMBNAIL_INTERNAL_SECRET"
    ]);

    const token = await googleToken(env, SHEETS_SCOPE);
    const { metadata, workbook } = await readWorkbook(token, env.GOOGLE_SHEET_ID);
    const plan = buildTestClientsResetPlan({ workbook, adminEmails: env.ADMIN_EMAILS });
    report.counts = plan.counts;
    const auth = await authPreflight(env);
    report.administrator = auth.administrator.status === "found" ? "preserved" : "missing";
    report.auth = Object.fromEntries(Object.entries(auth.targets).map(([clientId, result]) => [clientId, result.status]));

    if (auth.administrator.status !== "found") {
      plan.errors.push("Le compte Supabase de l'administrateur à préserver est introuvable.");
      plan.status = "blocked";
    }
    if (plan.status === "blocked") throw new Error(plan.errors.join(" | "));

    if (args.mode === "dry-run") {
      report.status = plan.status === "already_reset" ? "already_reset" : "ready";
      report.thumbnails = plan.solutionIds.map((solutionId) => ({ solution_id: solutionId, status: "planned" }));
      await writeReport(output, report);
      console.log(`Reset ${args.mode} : ${report.status}. Rapport : ${output}`);
      return;
    }

    for (const solutionId of plan.solutionIds) {
      const result = await purgeThumbnail(env, solutionId);
      report.thumbnails.push({ solution_id: result.solutionId, status: result.status });
    }

    for (const target of authTargets) {
      const result = await deleteSupabaseUserByEmail(env, target.email);
      report.auth[target.clientId] = result.status;
    }

    await googleBatchUpdate(token, env.GOOGLE_SHEET_ID, deletionRequests(plan, metadata));
    report.status = plan.status === "already_reset" ? "already_reset" : "deleted";
    await writeReport(output, report);
    console.log(`Reset ${args.mode} : ${report.status}. Rapport : ${output}`);
  } catch (error) {
    report.status = "error";
    report.errors.push(error instanceof Error ? error.message : String(error));
    await writeReport(output, report);
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
