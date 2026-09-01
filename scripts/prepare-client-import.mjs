import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { googleRead, googleToken, loadEnv, SHEETS_SCOPE } from "./lib/cli-runtime.mjs";
import { buildSheetImportPackage, importPackageCsv } from "./lib/import-sheet.mjs";

const DEFAULT_SHEET_ID = "1oYPodM_x4EEIDiXPwAosAhpn1vbbmdpDnZU4DafbyTU";
const DEFAULT_SHEET_NAME = "Import clients";
const DEFAULT_ROWS = [6, 7, 8];

function usage(message = "", error = true) {
  if (message) console.error(`Erreur : ${message}\n`);
  console.error("Usage : pnpm prepare:client-import -- [--source-sheet-id <id>] [--sheet <nom>] [--rows 6,7,8] [--env-file <fichier>] [--output <dossier>]");
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

function selectedRows(input) {
  if (!input) return DEFAULT_ROWS;
  const rows = input.split(",").map((value) => Number.parseInt(value.trim(), 10));
  if (rows.length === 0 || rows.some((row) => !Number.isSafeInteger(row) || row < 2) || new Set(rows).size !== rows.length) {
    throw new Error("--rows doit contenir des numéros de lignes uniques, séparés par des virgules.");
  }
  return rows;
}

async function writePackage(output, packageData) {
  const content = importPackageCsv(packageData);
  await mkdir(output, { recursive: true });
  await Promise.all([
    writeFile(path.join(output, "preparation.csv"), content.summary, "utf8"),
    writeFile(path.join(output, "preparation-exceptions.csv"), content.errors, "utf8")
  ]);
  if (packageData.errors.length > 0) return;
  await Promise.all([
    writeFile(path.join(output, "clients.csv"), content.clients, "utf8"),
    writeFile(path.join(output, "contacts.csv"), content.contacts, "utf8"),
    writeFile(path.join(output, "solutions.csv"), content.solutions, "utf8")
  ]);
}

async function main() {
  const args = argsFrom(process.argv.slice(2));
  if (args.help) return usage("", false);
  const rows = selectedRows(args.rows);
  const env = await loadEnv(args["env-file"]);
  const sourceSheetId = args["source-sheet-id"] || env.IMPORT_SOURCE_SHEET_ID || DEFAULT_SHEET_ID;
  const sheetName = args.sheet || DEFAULT_SHEET_NAME;
  const output = path.resolve(args.output || path.join(".codex-tmp", "pilote-mfp-001-003"));
  const token = await googleToken(env, SHEETS_SCOPE);
  const maxRow = Math.max(...rows);
  const values = await googleRead(token, sourceSheetId, `${sheetName}!A1:AY${maxRow}`);
  const headerRowIndex = values.findIndex((row) => String(row?.[0] ?? "").trim().replace(/\*+$/, "") === "Référence client");
  if (headerRowIndex === -1) throw new Error("Ligne d’en-tête « Référence client » introuvable dans le Sheet source.");

  const packageData = buildSheetImportPackage({
    headers: values[headerRowIndex],
    rows: rows.map((rowNumber) => ({ rowNumber, values: values[rowNumber - 1] ?? [] }))
  });
  await writePackage(output, packageData);
  if (packageData.errors.length > 0) {
    throw new Error(`Préparation invalide : consultez ${path.join(output, "preparation-exceptions.csv")}.`);
  }

  console.log(`Préparation terminée : ${packageData.clients.length} client(s), ${packageData.contacts.length} contact(s), ${packageData.solutions.length} solution(s). Dossier : ${output}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
