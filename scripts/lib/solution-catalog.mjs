import catalogue from "../../src/lib/solution-catalog.json" with { type: "json" };

export const solutionCatalogue = catalogue.map((entry) => ({
  ...entry,
  nameOptions: [...entry.nameOptions]
}));

export function solutionToken(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("fr-FR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

export function solutionTypeForLabel(label) {
  const normalized = solutionToken(label);

  return solutionCatalogue.find((entry) => solutionToken(entry.label) === normalized) ?? null;
}

export function canonicalSolutionName(typeLabel, name) {
  const type = solutionTypeForLabel(typeLabel);
  const normalizedName = solutionToken(name);

  if (!type) return null;

  const canonicalName = type.nameOptions.find((candidate) => solutionToken(candidate) === normalizedName);

  return canonicalName ? { type, name: canonicalName } : null;
}

export function canonicalSolutionPair(typeLabel, name) {
  const result = canonicalSolutionName(typeLabel, name);

  return result ? { typeLabel: result.type.label, name: result.name } : null;
}
