import { Clock3, ListChecks } from "lucide-react";
import type { Client } from "../types/client";

type LatestActionsProps = {
  actions: Client["latestActions"];
};

export function LatestActions({ actions }: LatestActionsProps) {
  return (
    <section className="dashboard-section compact-section">
      <div className="section-heading">
        <span className="section-kicker">Dernières actions</span>
        <h2>Les derniers mouvements à suivre.</h2>
      </div>

      {actions.length > 0 ? (
        <div className="timeline">
          {actions.map((action, index) => (
            <article className="timeline-item" key={`${action.label}-${action.date}-${index}`}>
              <span className="timeline-icon">
                <Clock3 aria-hidden="true" />
              </span>
              <div>
                <strong>{action.label}</strong>
                <p>{action.date || "Date non précisée"}</p>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="empty-state small-empty">
          <ListChecks aria-hidden="true" />
          <p>Aucune action récente à afficher pour le moment.</p>
        </div>
      )}
    </section>
  );
}

