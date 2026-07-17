import { Clock3, TimerReset } from "lucide-react";
import type { ClientImpact, ClientImpactKey } from "../types/client";

type ImpactPanelProps = {
  impact: ClientImpact;
};

const unitLabels: Record<ClientImpactKey, { singular: string; plural: string }> = {
  visibility_acquisition: {
    singular: "site actif",
    plural: "sites actifs"
  },
  automation_ai: {
    singular: "solution active",
    plural: "solutions actives"
  },
  assistant_ai: {
    singular: "solution active",
    plural: "solutions actives"
  }
};

function formatHours(value: number): string {
  const formattedValue = value.toLocaleString("fr-FR", {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1
  });

  return `${formattedValue} h`;
}

function quantityLabel(key: ClientImpactKey, quantity: number): string {
  const labels = unitLabels[key];

  return `${quantity} ${quantity > 1 ? labels.plural : labels.singular}`;
}

export function ImpactPanel({ impact }: ImpactPanelProps) {
  if (impact.weeklyHours <= 0 || impact.items.length === 0) {
    return (
      <div className="empty-state impact-empty">
        <TimerReset aria-hidden="true" />
        <p>Votre estimation d'impact sera bientôt disponible.</p>
      </div>
    );
  }

  return (
    <div className="impact-panel" aria-label="Temps libéré par Fluxperf">
      <div className="impact-total">
        <TimerReset aria-hidden="true" />
        <div>
          <strong>{formatHours(impact.weeklyHours)} / semaine libérées</strong>
          <p>soit environ {formatHours(impact.monthlyHours)} / mois prises en charge par Fluxperf®</p>
        </div>
      </div>

      <div className="impact-list" aria-label="Répartition par solution">
        {impact.items.map((item) => (
          <div className="impact-item" key={item.key}>
            <span className="impact-item-icon" aria-hidden="true">
              <Clock3 />
            </span>
            <div>
              <strong>{item.label}</strong>
              <p>{quantityLabel(item.key, item.quantity)}</p>
            </div>
            <span>
              {formatHours(item.weeklyHours)} / semaine
              <small>{formatHours(item.monthlyHours)} / mois</small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
