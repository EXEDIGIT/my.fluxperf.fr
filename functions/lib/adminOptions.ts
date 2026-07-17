export type AdminSolutionType = "visibility_acquisition" | "automation_ai" | "assistant_ai";

export type AdminSolutionOption = {
  type: AdminSolutionType;
  label: string;
  defaultName: string;
  nameOptions: string[];
};

type SheetRecord = Record<string, string>;

export const fallbackAdminSolutionOptions: AdminSolutionOption[] = [
  {
    type: "visibility_acquisition",
    label: "Flux Visibilité & Acquisition",
    defaultName: "Flux Visibilité & Acquisition • Site web",
    nameOptions: [
      "Flux Visibilité & Acquisition • Site web",
      "Flux Visibilité & Acquisition • Site e-shop"
    ]
  },
  {
    type: "automation_ai",
    label: "Flux Automatisation & IA",
    defaultName: "Flux Automatisation & IA • Tableau de bord",
    nameOptions: [
      "Flux Automatisation & IA • Tableau de bord",
      "Flux Automatisation & IA • Synchronisation de données"
    ]
  },
  {
    type: "assistant_ai",
    label: "Flux Assistant IA",
    defaultName: "Flux Assistant IA • Copilote entreprise",
    nameOptions: ["Flux Assistant IA • Copilote entreprise"]
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

function normalizeToken(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
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
  const normalizedLabel = normalizeToken(label);

  return (
    fallbackAdminSolutionOptions.find((option) => normalizeToken(option.label) === normalizedLabel)?.type ??
    null
  );
}

function valuesForCategory(records: SheetRecord[], category: string): string[] {
  const normalizedCategory = normalizeToken(category);

  return unique(
    records
      .filter((record) => normalizeToken(record.categorie || record.category) === normalizedCategory)
      .map((record) => record.valeur || record.value)
  );
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

      const nameOptions = solutionNames.filter((name) => normalizeToken(name).startsWith(normalizeToken(label)));

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
  return Boolean(options.find((option) => option.type === type)?.nameOptions.includes(name));
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
