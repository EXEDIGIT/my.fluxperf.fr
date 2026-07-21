export type AdminSolutionType = "visibility_acquisition" | "automation_ai" | "assistant_ai";

export type AdminSolutionOption = {
  type: AdminSolutionType;
  label: string;
  defaultName: string;
  nameOptions: string[];
};

type SheetRecord = Record<string, string>;

const solutionNamesByType: Record<AdminSolutionType, string[]> = {
  visibility_acquisition: ["Site web", "Site e-shop", "Publicité Google Ads", "Réseaux sociaux"],
  automation_ai: ["Tableau de bord", "Synchronisation de données"],
  assistant_ai: ["Copilote entreprise"]
};

export const fallbackAdminSolutionOptions: AdminSolutionOption[] = [
  {
    type: "visibility_acquisition",
    label: "Flux Visibilité & Acquisition",
    defaultName: "Site web",
    nameOptions: solutionNamesByType.visibility_acquisition
  },
  {
    type: "automation_ai",
    label: "Flux Automatisation & IA",
    defaultName: "Tableau de bord",
    nameOptions: solutionNamesByType.automation_ai
  },
  {
    type: "assistant_ai",
    label: "Flux Assistant IA",
    defaultName: "Copilote entreprise",
    nameOptions: solutionNamesByType.assistant_ai
  }
];

export const solutionLabels: Record<AdminSolutionType, string> = fallbackAdminSolutionOptions.reduce(
  (labels, option) => {
    labels[option.type] = option.label;
    return labels;
  },
  {} as Record<AdminSolutionType, string>
);

function normalizeColumn(value: string): string {
  return value.trim().toLowerCase();
}

export function normalizeSolutionName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ");
}

function unique(values: string[]): string[] {
  return Array.from(new Set(values.map((value) => value.trim()).filter(Boolean)));
}

function parseRecords(values: string[][]): SheetRecord[] {
  if (values.length < 2) {
    return [];
  }

  const headers = values[0]?.map(normalizeColumn) ?? [];

  return values
    .slice(1)
    .map((row) =>
      headers.reduce((record, header, index) => {
        if (header) {
          record[header] = row[index]?.trim() ?? "";
        }

        return record;
      }, {} as SheetRecord)
    )
    .filter((row) => Object.values(row).some(Boolean));
}

function optionTypeFromLabel(label: string): AdminSolutionType | null {
  const normalizedLabel = normalizeSolutionName(label);

  return (
    fallbackAdminSolutionOptions.find((option) => normalizeSolutionName(option.label) === normalizedLabel)?.type ??
    null
  );
}

function valuesForCategory(records: SheetRecord[], category: string): string[] {
  const normalizedCategory = normalizeSolutionName(category);

  return unique(
    records
      .filter((record) => normalizeSolutionName(record.categorie || record.category) === normalizedCategory)
      .map((record) => record.valeur || record.value)
  );
}

function nameMatchesType(name: string, type: AdminSolutionType, label: string): boolean {
  const normalizedName = normalizeSolutionName(name);
  const normalizedLabel = normalizeSolutionName(label);

  return (
    normalizedName.startsWith(normalizedLabel) ||
    solutionNamesByType[type].some((candidate) => normalizedName === normalizeSolutionName(candidate))
  );
}

function optionOrder(type: AdminSolutionType, name: string): number {
  const canonicalIndex = solutionNamesByType[type].findIndex(
    (candidate) => normalizeSolutionName(candidate) === normalizeSolutionName(name)
  );

  return canonicalIndex === -1 ? Number.MAX_SAFE_INTEGER : canonicalIndex;
}

export function isWebsiteSolutionName(name: string): boolean {
  const normalized = normalizeSolutionName(name);

  return normalized.includes("site web") || normalized.includes("site e-shop") || normalized.includes("site eshop");
}

export function isGoogleAdsSolutionName(name: string): boolean {
  const normalized = normalizeSolutionName(name);

  return normalized.includes("google ads") || normalized.includes("publicite google") || normalized === "ads";
}

export function isSocialMediaSolutionName(name: string): boolean {
  const normalized = normalizeSolutionName(name);

  return normalized.includes("reseaux sociaux") || normalized.includes("reseau social");
}

export function buildAdminSolutionOptions(parameterValues: string[][]): AdminSolutionOption[] {
  const records = parseRecords(parameterValues);
  const typeLabels = valuesForCategory(records, "type_solution");
  const solutionNames = valuesForCategory(records, "nom_solution");

  if (typeLabels.length === 0 || solutionNames.length === 0) {
    return fallbackAdminSolutionOptions;
  }

  const options = typeLabels
    .map((label) => {
      const type = optionTypeFromLabel(label);

      if (!type) {
        return null;
      }

      const nameOptions = solutionNames
        .filter((name) => nameMatchesType(name, type, label))
        .sort((left, right) => optionOrder(type, left) - optionOrder(type, right));

      if (nameOptions.length === 0) {
        return null;
      }

      return {
        type,
        label,
        defaultName: nameOptions[0],
        nameOptions
      };
    })
    .filter((option): option is AdminSolutionOption => Boolean(option));

  return options.length > 0 ? options : fallbackAdminSolutionOptions;
}

export function optionAllowsSolution(
  options: AdminSolutionOption[],
  type: AdminSolutionType,
  name: string
): boolean {
  const normalizedName = normalizeSolutionName(name);
  const option = options.find((item) => item.type === type);

  return Boolean(
    option?.nameOptions.some((candidate) => normalizeSolutionName(candidate) === normalizedName) ||
      solutionNamesByType[type].some((candidate) => normalizedName === normalizeSolutionName(candidate))
  );
}

export function defaultNameForType(options: AdminSolutionOption[], type: AdminSolutionType): string {
  return (
    options.find((option) => option.type === type)?.defaultName ||
    fallbackAdminSolutionOptions.find((option) => option.type === type)?.defaultName ||
    ""
  );
}

export function solutionLabelForType(type: AdminSolutionType): string {
  return solutionLabels[type];
}
