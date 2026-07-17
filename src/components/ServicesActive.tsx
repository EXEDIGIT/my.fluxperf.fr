import { Bot, Globe2, Megaphone, MonitorSmartphone, Sparkles, Wrench, Zap } from "lucide-react";
import type { Client } from "../types/client";

type ServicesActiveProps = {
  services: Client["services"];
  solutions: Client["solutions"];
};

function iconForService(service: string) {
  const normalized = normalizeService(service);

  if (normalized.includes("site")) return MonitorSmartphone;
  if (normalized.includes("visibil")) return Globe2;
  if (normalized.includes("ads") || normalized.includes("sea")) return Megaphone;
  if (normalized.includes("automatisation")) return Zap;
  if (normalized.includes("ia")) return Bot;
  return Wrench;
}

function normalizeService(service: string) {
  return service
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

function descriptionForService(service: string) {
  const normalized = normalizeService(service);

  if (normalized.includes("assistant")) {
    return "Assistant IA actif, suivi avec son contexte metier et ses evolutions utiles.";
  }

  if (normalized.includes("automatisation")) {
    return "Automatisations, integrations et workflows IA rattaches a votre compte.";
  }

  if (normalized.includes("site")) {
    return "Site rattache a votre espace client avec les informations de suivi a jour.";
  }

  if (normalized.includes("visibil") || normalized.includes("ads") || normalized.includes("sea")) {
    return "Pilotage de votre visibilite, acquisition et performance digitale.";
  }

  return "Suivi dans votre espace client avec les informations et acces utiles a jour.";
}

function solutionDetail(solution: Client["solutions"][number]): string {
  return solution.domain || solution.url || solution.typeLabel;
}

function descriptionForSolution(solution: Client["solutions"][number]) {
  return descriptionForService(`${solution.typeLabel} ${solution.name}`);
}

export function ServicesActive({ services, solutions }: ServicesActiveProps) {
  const activeSolutions = solutions.length > 0 ? solutions : null;
  const visibleServices = services.length > 0 ? services : ["Espace client Fluxperf"];

  return (
    <section className="dashboard-section">
      <div className="section-heading">
        <span className="section-kicker">Services actifs</span>
        <h2>Ce que notre équipe pilote avec vous.</h2>
      </div>
      <div className="service-grid">
        {activeSolutions ? activeSolutions.map((solution) => {
          const Icon = iconForService(`${solution.typeLabel} ${solution.name}`);
          const detail = solutionDetail(solution);

          return (
            <article className="service-card" key={solution.id}>
              <span>
                <Icon aria-hidden="true" />
              </span>
              <strong>{solution.name || solution.typeLabel}</strong>
              <p>{detail}</p>
              <p>{descriptionForSolution(solution)}</p>
            </article>
          );
        }) : visibleServices.map((service, index) => {
          const Icon = iconForService(service);

          return (
            <article className="service-card" key={`${service}-${index}`}>
              <span>
                <Icon aria-hidden="true" />
              </span>
              <strong>{service}</strong>
              <p>{descriptionForService(service)}</p>
            </article>
          );
        })}
      </div>
      <div className="section-note">
        <Sparkles aria-hidden="true" />
        Les services affichés proviennent de l'onglet Solutions de votre fiche client Fluxperf.
      </div>
    </section>
  );
}
