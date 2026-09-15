import catalogue from "./solution-catalog.json";

export type SolutionCatalogType = "visibility_acquisition" | "automation_ai" | "assistant_ai";

export type SolutionCatalogOption = {
  type: SolutionCatalogType;
  label: string;
  defaultName: string;
  nameOptions: string[];
};

export const solutionCatalog: SolutionCatalogOption[] = catalogue.map((entry) => ({
  type: entry.type as SolutionCatalogType,
  label: entry.label,
  defaultName: entry.nameOptions[0] ?? "",
  nameOptions: [...entry.nameOptions]
}));

export const fallbackSolutionOptions: SolutionCatalogOption[] = solutionCatalog.map((option) => ({
  ...option,
  nameOptions: [...option.nameOptions]
}));

export const solutionLabels: Record<SolutionCatalogType, string> = solutionCatalog.reduce(
  (labels, entry) => {
    labels[entry.type] = entry.label;
    return labels;
  },
  {} as Record<SolutionCatalogType, string>
);

export function normalizeSolutionCatalogValue(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function normalizeSolutionType(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

const solutionTypeAliases: Record<SolutionCatalogType, string[]> = {
  visibility_acquisition: [
    "visibility_acquisition",
    "visibilite_acquisition",
    "flux_visibility_acquisition",
    "flux_visibilite_acquisition",
    "flux_visibilite_et_acquisition"
  ],
  automation_ai: [
    "automation_ai",
    "automatisation_ai",
    "automatisation_ia",
    "flux_automation_ai",
    "flux_automatisation_ai",
    "flux_automatisation_ia"
  ],
  assistant_ai: [
    "assistant_ai",
    "assistant_ia",
    "flux_assistant_ai",
    "flux_assistant_ia"
  ]
};

/** Maps legacy Google Sheet labels and technical values to the catalogue type. */
export function canonicalSolutionCatalogType(value: string): SolutionCatalogType | null {
  const normalized = normalizeSolutionType(value);

  return (Object.keys(solutionTypeAliases) as SolutionCatalogType[]).find((type) =>
    solutionTypeAliases[type].includes(normalized)
  ) ?? null;
}

export function optionForSolutionType(type: string): SolutionCatalogOption | undefined {
  return solutionCatalog.find((entry) => entry.type === type);
}

export function canonicalSolutionName(type: string, name: string): string | null {
  const option = optionForSolutionType(type);
  const normalizedName = normalizeSolutionCatalogValue(name);

  return option?.nameOptions.find((candidate) => normalizeSolutionCatalogValue(candidate) === normalizedName) ?? null;
}

export function isWebsiteSolutionName(name: string): boolean {
  const normalized = normalizeSolutionCatalogValue(name);

  return normalized === "site web" || normalized === "site e shop" || normalized === "site eshop";
}

export function isGoogleAdsSolutionName(name: string): boolean {
  return normalizeSolutionCatalogValue(name) === "publicite google ads";
}
