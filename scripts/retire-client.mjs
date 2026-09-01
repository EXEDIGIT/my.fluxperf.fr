import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { googleBatchUpdate, googleMetadata, googleRead, googleToken, loadEnv, requiredEnv, SHEETS_SCOPE } from "./lib/cli-runtime.mjs";
import { buildClientRetirementPlan, deletionRequests, PILOT_RETIREMENT_TARGET } from "./lib/client-retirement.mjs";
import { csv } from "./lib/client-import.mjs";
import { deleteSupabaseUserByEmail, findSupabaseUserByEmail } from "./lib/silent-supabase.mjs";

const ranges = {
  Clients: "Clients!A1:Z5000",
  Contacts: "Contacts!A1:Z5000",
  Solutions: "Solutions!A1:Z5000",
  Actions: "Actions!A1:Z5000",
  Connexions: "Connexions!A1:Z5000",
  Archive_Sites: "Archive_Sites!A1:Z5000",
  Documents: "Documents!A1:Z5000"
};

function usage(message = "", error = true) {
  if (message) console.error(`Erreur : ${message}\n`);
  console.error("Usage : pnpm retire:client -- --client-id CLI-17072026-C4F5 --mode dry-run|apply [--env-file <fichier>] [--output <dossier>]");
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

async function writeReport(output, mode, plan, authStatus) {
  await mkdir(output, { recursive: true });
  const rows = Object.entries(plan.counts).map(([sheet, count]) => ({
    mode,
    client_id: plan.target.clientId,
    statut: plan.status,
    sheet,
    lignes_ciblees: count,
    auth: authStatus,
    erreurs: plan.errors.join(" | ")
  }));
  await writeFile(path.join(output, "suppression.csv"), csv(rows, ["mode", "client_id", "statut", "sheet", "lignes_ciblees", "auth", "erreurs"]), "utf8");
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  if (args.help) return usage("", false);
  if (!args.mode || !["dry-run", "apply"].includes(args.mode)) return usage("--mode dry-run ou apply est obligatoire.");
  if ((args["client-id"] || PILOT_RETIREMENT_TARGET.clientId) !== PILOT_RETIREMENT_TARGET.clientId) {
    return usage("Cette commande est limitée à la fiche pilote CLI-17072026-C4F5.");
  }

  const output = path.resolve(args.output || path.join(".codex-tmp", "retrait-gabypower"));
  const env = await loadEnv(args["env-file"]);
  requiredEnv(env, ["GOOGLE_SHEET_ID", "GOOGLE_SERVICE_ACCOUNT_EMAIL", "GOOGLE_PRIVATE_KEY"]);
  const token = await googleToken(env, SHEETS_SCOPE);
  const metadata = await googleMetadata(token, env.GOOGLE_SHEET_ID);
  const workbook = {};
  await Promise.all(metadata.filter((sheet) => ranges[sheet.title]).map(async (sheet) => {
    workbook[sheet.title] = await googleRead(token, env.GOOGLE_SHEET_ID, ranges[sheet.title]);
  }));
  const plan = buildClientRetirementPlan({ workbook });
  let authStatus = "not_checked";

  try {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY) {
      const found = await findSupabaseUserByEmail(env, PILOT_RETIREMENT_TARGET.email);
      authStatus = found.status;
    } else if (args.mode === "apply") {
      requiredEnv(env, ["SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"]);
    }

    if (plan.status === "blocked") throw new Error(plan.errors.join(" | "));
    if (args.mode === "apply") {
      const auth = await deleteSupabaseUserByEmail(env, PILOT_RETIREMENT_TARGET.email);
      authStatus = auth.status;
      await googleBatchUpdate(token, env.GOOGLE_SHEET_ID, deletionRequests(plan, metadata));
    }
    await writeReport(output, args.mode, plan, authStatus);
    console.log(`Retrait ${args.mode} : ${plan.status}. Rapport : ${output}`);
  } catch (error) {
    await writeReport(output, args.mode, plan, authStatus);
    throw error;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
