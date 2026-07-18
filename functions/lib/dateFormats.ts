const PARIS_TIME_ZONE = "Europe/Paris";

function frenchDateParts(now: Date): { day: string; month: string; year: string } {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: PARIS_TIME_ZONE,
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(now);
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";

  return {
    day: part("day"),
    month: part("month"),
    year: part("year")
  };
}

export function formatFrenchDate(now = new Date()): string {
  const { day, month, year } = frenchDateParts(now);

  return `${day}/${month}/${year}`;
}

export function formatCompactFrenchDate(now = new Date()): string {
  const { day, month, year } = frenchDateParts(now);

  return `${day}${month}${year}`;
}

export function formatParisDateKey(now = new Date()): string {
  const { day, month, year } = frenchDateParts(now);

  return `${year}-${month}-${day}`;
}

export function formatParisMonthKey(now = new Date()): string {
  const { month, year } = frenchDateParts(now);

  return `${year}-${month}`;
}
