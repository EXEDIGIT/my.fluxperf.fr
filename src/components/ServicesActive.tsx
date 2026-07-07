import { Bot, Globe2, Megaphone, MonitorSmartphone, Sparkles, Wrench, Zap } from "lucide-react";
import type { Client } from "../types/client";

type ServicesActiveProps = {
  services: Client["services"];
};

function iconForService(service: string) {
  const normalized = service.toLowerCase();

  if (normalized.includes("site")) return MonitorSmartphone;
  if (normalized.includes("visibil")) return Globe2;
  if (normalized.includes("ads") || normalized.includes("sea")) return Megaphone;
  if (normalized.includes("automatisation")) return Zap;
  if (normalized.includes("ia")) return Bot;
  return Wrench;
}

export function ServicesActive({ services }: ServicesActiveProps) {
  const visibleServices = services.length > 0 ? services : ["Espace client FluxPerf"];

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <span className="section-kicker">Services actifs</span>
        <h2>Ce que notre équipe pilote avec vous.</h2>
      </div>
      <div className="service-grid">
        {visibleServices.map((service) => {
          const Icon = iconForService(service);

          return (
            <article className="service-card" key={service}>
              <span>
                <Icon aria-hidden="true" />
              </span>
              <strong>{service}</strong>
              <p>
                Suivi dans votre espace client avec les informations et accès utiles à jour.
              </p>
            </article>
          );
        })}
      </div>
      <div className="section-note">
        <Sparkles aria-hidden="true" />
        Les services affichés proviennent de votre fiche client FluxPerf.
      </div>
    </section>
  );
}

