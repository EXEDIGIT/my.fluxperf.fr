import { BookOpen, HelpCircle, PlayCircle } from "lucide-react";
import type { Client } from "../types/client";
import { isExternalUrl } from "../lib/url";

type ResourcesProps = {
  resourcesUrl: Client["links"]["resources"];
};

const resources = [
  {
    title: "Guide de demande",
    description: "Préparer une demande claire pour accélérer le traitement par l'équipe Fluxperf.",
    icon: BookOpen
  },
  {
    title: "FAQ",
    description: "Retrouver les réponses utiles sur votre espace client, les rapports et le support.",
    icon: HelpCircle
  },
  {
    title: "Tutoriels",
    description: "Découvrir les bonnes pratiques pour suivre vos actions et vos indicateurs.",
    icon: PlayCircle
  }
];

export function Resources({ resourcesUrl }: ResourcesProps) {
  return (
    <section className="dashboard-section" id="ressources">
      <div className="section-heading section-heading-row">
        <div>
          <span className="section-kicker">Ressources utiles</span>
          <h2>Des repères simples pour avancer avec l'équipe.</h2>
        </div>
        {resourcesUrl ? (
          <a
            className="secondary-link"
            href={resourcesUrl}
            target={isExternalUrl(resourcesUrl) ? "_blank" : undefined}
            rel={isExternalUrl(resourcesUrl) ? "noreferrer" : undefined}
          >
            Ouvrir les ressources
          </a>
        ) : null}
      </div>

      <div className="resource-grid">
        {resources.map((resource) => {
          const Icon = resource.icon;

          return (
            <article className="resource-card" key={resource.title}>
              <Icon aria-hidden="true" />
              <h3>{resource.title}</h3>
              <p>{resource.description}</p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
