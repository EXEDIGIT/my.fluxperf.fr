export type ImpactKey = "visibility_acquisition" | "automation_ai" | "assistant_ai";

export type ImpactSolution = {
  type: string;
  name: string;
};

export type ImpactItem = {
  key: ImpactKey;
  label: string;
  quantity: number;
  weeklyHours: number;
  monthlyHours: number;
};

export type Impact = {
  weeklyHours: number;
  monthlyHours: number;
  items: ImpactItem[];
  isEstimated: true;
};

const rules: Record<ImpactKey, { label: string; defaultWeeklyHoursPerUnit: number }> = {
  visibility_acquisition: { label: "Visibilité & Acquisition", defaultWeeklyHoursPerUnit: 1.5 },
  automation_ai: { label: "Automatisation & IA", defaultWeeklyHoursPerUnit: 1 },
  assistant_ai: { label: "Assistant IA", defaultWeeklyHoursPerUnit: 2 }
};

const aliases: Record<ImpactKey, string[]> = {
  visibility_acquisition: ["visibility_acquisition", "visibilite_acquisition", "flux_visibility_acquisition", "flux_visibilite_acquisition"],
  automation_ai: ["automation_ai", "automatisation_ai", "automatisation_ia", "flux_automation_ai", "flux_automatisation_ai", "flux_automatisation_ia"],
  assistant_ai: ["assistant_ai", "assistant_ia", "flux_assistant_ai", "flux_assistant_ia"]
};

function normalize(value: string): string {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function roundToHalfHour(value: number): number {
  return Math.round(value * 2) / 2;
}

function monthlyHoursFromWeekly(weeklyHours: number): number {
  return roundToHalfHour((weeklyHours * 52) / 12);
}

export function impactKeyForType(type: string): ImpactKey | null {
  const value = normalize(type);
  return (Object.keys(aliases) as ImpactKey[]).find((key) => aliases[key].includes(value)) ?? null;
}

function isGoogleAdsOrSocial(name: string): boolean {
  const value = normalize(name).replace(/_/g, " ");
  return value.includes("google ads") || value.includes("publicite google") || value === "ads" || value.includes("reseaux sociaux") || value.includes("reseau social");
}

export function emptyImpact(): Impact {
  return { weeklyHours: 0, monthlyHours: 0, items: [], isEstimated: true };
}

/** One source of truth for the customer portal and monthly report. */
export function calculateImpact(solutions: ImpactSolution[]): Impact {
  const quantities: Record<ImpactKey, number> = { visibility_acquisition: 0, automation_ai: 0, assistant_ai: 0 };
  const weekly: Record<ImpactKey, number> = { visibility_acquisition: 0, automation_ai: 0, assistant_ai: 0 };

  solutions.forEach((solution) => {
    const key = impactKeyForType(solution.type);
    if (!key) return;
    quantities[key] += 1;
    weekly[key] += key === "visibility_acquisition" && isGoogleAdsOrSocial(solution.name)
      ? 2
      : rules[key].defaultWeeklyHoursPerUnit;
  });

  const items = (Object.keys(rules) as ImpactKey[]).map((key) => ({
    key,
    label: rules[key].label,
    quantity: quantities[key],
    weeklyHours: roundToHalfHour(weekly[key]),
    monthlyHours: monthlyHoursFromWeekly(roundToHalfHour(weekly[key]))
  })).filter((item) => item.quantity > 0);

  if (!items.length) return emptyImpact();
  const weeklyHours = roundToHalfHour(items.reduce((sum, item) => sum + item.weeklyHours, 0));
  return { weeklyHours, monthlyHours: monthlyHoursFromWeekly(weeklyHours), items, isEstimated: true };
}
