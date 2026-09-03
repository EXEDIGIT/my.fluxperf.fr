import type { ClientSolution } from "../types/client";

export type StatisticsSupportPreset = {
  subject: string;
  message: string;
};

export function statisticsSupportPreset(solution: ClientSolution): StatisticsSupportPreset {
  const solutionLabel = solution.domain || solution.name || solution.typeLabel || "cette solution";

  return {
    subject: "Aide pour mes statistiques",
    message:
      `Bonjour,\n\nLes statistiques de ${solutionLabel} sont actuellement indiquées comme « en cours de raccordement » dans mon espace client.\n\n` +
      "Pouvez-vous vérifier que la configuration de cette solution permet bien l'affichage de mes statistiques ?\n\nMerci."
  };
}
