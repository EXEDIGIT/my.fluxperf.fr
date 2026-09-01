import {
  canonicalSolutionName,
  isGoogleAdsSolutionName,
  isWebsiteSolutionName,
  optionForSolutionType,
  solutionCatalog,
  solutionLabels,
  type SolutionCatalogOption,
  type SolutionCatalogType
} from "../../src/lib/solutionCatalog";

export type AdminSolutionType = SolutionCatalogType;
export type AdminSolutionOption = SolutionCatalogOption;

export const fallbackAdminSolutionOptions: AdminSolutionOption[] = solutionCatalog.map((option) => ({
  ...option,
  nameOptions: [...option.nameOptions]
}));

export { isGoogleAdsSolutionName, isWebsiteSolutionName, solutionLabels };

/**
 * The Google Sheet mirrors the catalogue but is not allowed to introduce free
 * solution names. Keeping this signature preserves the existing API contract.
 */
export function buildAdminSolutionOptions(_parameterValues: string[][]): AdminSolutionOption[] {
  return fallbackAdminSolutionOptions.map((option) => ({
    ...option,
    nameOptions: [...option.nameOptions]
  }));
}

export function optionAllowsSolution(
  options: AdminSolutionOption[],
  type: AdminSolutionType,
  name: string
): boolean {
  const option = options.find((item) => item.type === type);
  const canonicalName = canonicalSolutionName(type, name);

  return Boolean(option && canonicalName && option.nameOptions.includes(canonicalName));
}

export function canonicalNameForType(type: AdminSolutionType, name: string): string | null {
  return canonicalSolutionName(type, name);
}

export function defaultNameForType(options: AdminSolutionOption[], type: AdminSolutionType): string {
  return options.find((option) => option.type === type)?.defaultName || optionForSolutionType(type)?.defaultName || "";
}

export function solutionLabelForType(type: AdminSolutionType): string {
  return solutionLabels[type];
}
