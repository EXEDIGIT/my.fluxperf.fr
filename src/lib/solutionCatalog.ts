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
