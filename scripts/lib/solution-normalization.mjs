import { canonicalSolutionPair } from "./solution-catalog.mjs";

const historicalNames = new Map([
  ["Flux Visibilité & Acquisition • Site web", "Site web"],
  ["Flux Visibilité & Acquisition • Site e-shop", "Site e-shop"],
  ["Flux Automatisation & IA • Tableau de bord", "Tableau de bord"],
  ["Flux Automatisation & IA • Synchronisation de données", "Automatisation & Synchronisation"],
  ["Synchronisation de données", "Automatisation & Synchronisation"],
  ["Flux Assistant IA • Copilote entreprise", "Copilote entreprise - Alzy"],
  ["Copilote entreprise", "Copilote entreprise - Alzy"]
]);

function text(value) {
  return String(value ?? "").trim();
}

function key(value) {
  return text(value).toLocaleLowerCase("fr-FR");
}

function headersFor(values, required) {
  const headers = values[0]?.map(key) ?? [];
  const missing = required.filter((header) => !headers.includes(header));

  return { headers, missing };
}

function valueAt(row, headers, header) {
  return text(row[headers.indexOf(header)]);
}

function mappedName(name) {
  return historicalNames.get(text(name)) ?? text(name);
}

export function buildSolutionNormalizationPlan(values) {
  const { headers, missing } = headersFor(values, ["solution_id", "type_solution", "nom_solution"]);

  if (missing.length > 0) {
    return { updates: [], unchanged: [], exceptions: [{ scope: "Solutions", rowNumber: 1, solutionId: "", reason: `Colonnes manquantes : ${missing.join(", ")}` }] };
  }

  const updates = [];
  const unchanged = [];
  const exceptions = [];

  values.slice(1).forEach((row, index) => {
    if (!row.some((value) => text(value))) return;
    const rowNumber = index + 2;
    const solutionId = valueAt(row, headers, "solution_id");
    const type = valueAt(row, headers, "type_solution");
    const currentName = valueAt(row, headers, "nom_solution");
    const nextName = mappedName(currentName);
    const canonical = canonicalSolutionPair(type, nextName);

    if (!canonical) {
      exceptions.push({ scope: "Solutions", rowNumber, solutionId, type, currentName, reason: "Famille ou nom de solution hors catalogue" });
      return;
    }

    if (currentName === canonical.name) {
      unchanged.push({ scope: "Solutions", rowNumber, solutionId, type: canonical.typeLabel, currentName, nextName: canonical.name });
      return;
    }

    updates.push({ scope: "Solutions", rowNumber, solutionId, type: canonical.typeLabel, currentName, nextName: canonical.name, range: `Solutions!E${rowNumber}` });
  });

  return { updates, unchanged, exceptions };
}

export function buildParameterNormalizationPlan(values) {
  const { headers, missing } = headersFor(values, ["categorie", "valeur"]);

  if (missing.length > 0) {
    return { updates: [], unchanged: [], exceptions: [{ scope: "Parametres", rowNumber: 1, solutionId: "", reason: `Colonnes manquantes : ${missing.join(", ")}` }] };
  }

  const updates = [];
  const unchanged = [];
  const exceptions = [];

  values.slice(1).forEach((row, index) => {
    if (!row.some((value) => text(value))) return;
    const rowNumber = index + 2;
    const category = valueAt(row, headers, "categorie");
    const currentName = valueAt(row, headers, "valeur");

    if (key(category) !== "nom_solution") return;

    const nextName = mappedName(currentName);

    if (currentName === nextName) {
      unchanged.push({ scope: "Parametres", rowNumber, solutionId: "", type: "", currentName, nextName });
      return;
    }

    const belongsToCatalogue = [
      "Site web",
      "Site e-shop",
      "Publicité Google Ads",
      "Réseaux sociaux",
      "Tableau de bord",
      "Automatisation & Synchronisation",
      "Copilote entreprise - Alzy"
    ].includes(nextName);

    if (!belongsToCatalogue) {
      exceptions.push({ scope: "Parametres", rowNumber, solutionId: "", currentName, reason: "Nom de solution hors catalogue" });
      return;
    }

    updates.push({ scope: "Parametres", rowNumber, solutionId: "", type: "", currentName, nextName, range: `Parametres!B${rowNumber}` });
  });

  return { updates, unchanged, exceptions };
}

export function buildNormalizationPlan({ solutions, parameters }) {
  const solutionPlan = buildSolutionNormalizationPlan(solutions);
  const parameterPlan = buildParameterNormalizationPlan(parameters);

  return {
    updates: [...solutionPlan.updates, ...parameterPlan.updates],
    unchanged: [...solutionPlan.unchanged, ...parameterPlan.unchanged],
    exceptions: [...solutionPlan.exceptions, ...parameterPlan.exceptions]
  };
}
