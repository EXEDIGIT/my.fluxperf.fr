import type { ClientSolution } from "../types/client";

export type StatisticsSupportPreset = {
  subject: string;
  message: string;
};

export function statisticsSupportPreset(solution: ClientSolution): StatisticsSupportPreset {
  const provider = solution.statistics.provider === "google_ads" ? "Google Ads" : "GA4";
  const solutionLabel = solution.domain || solution.name || solution.typeLabel || "cette solution";

  return {
    subject: `Aide au raccordement des statistiques ${provider}`,
    message:
      `Bonjour,\n\nLes statistiques de ${solutionLabel} sont actuellement indiquées comme « en cours de raccordement » dans mon espace client.\n\n` +
      `Pouvez-vous vérifier le raccordement ${provider} ainsi que l'affectation de cette solution ?\n\nMerci.`
  };
}
