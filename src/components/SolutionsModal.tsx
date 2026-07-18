import type { LucideIcon } from "lucide-react";
import { ArrowUpRight, Bot, CheckCircle2, Globe2, X, Zap } from "lucide-react";
import { useEffect } from "react";

type SolutionsModalProps = {
  isOpen: boolean;
  onClose: () => void;
  onActivationRequest: () => void;
};

type Solution = {
  title: string;
  subtitle: string;
  description: string;
  price: string;
  icon: LucideIcon;
  features: string[];
};

const solutions: Solution[] = [
  {
    title: "Flux Visibilité",
    subtitle: "Développez votre présence et captez davantage de clients.",
    description:
      "Création ou évolution de site web, SEO/GEO, contenus, Google Business Profile, réseaux sociaux, publicité et suivi des performances.",
    price: "À partir de 200 EUR HT / mois",
    icon: Globe2,
    features: ["Sites web & e-shop", "SEO / GEO", "Contenus", "Publicité en ligne"]
  },
  {
    title: "Flux Automatisation",
    subtitle: "Automatisez, gagnez du temps.",
    description:
      "Automatisations pour réduire les actions manuelles, connecter les outils, fluidifier les relances et structurer les workflows.",
    price: "À partir de 50 EUR HT / mois",
    icon: Zap,
    features: ["Tâches récurrentes", "Emails & relances", "Workflows", "API & intégrations"]
  },
  {
    title: "Flux Assistant",
    subtitle: "L'IA au service de votre entreprise.",
    description:
      "Assistant IA connecté au contexte métier, aux documents internes et aux connaissances de l'entreprise pour accompagner les équipes.",
    price: "Bientôt disponible",
    icon: Bot,
    features: ["Assistant IA métier", "Base de connaissances", "Rédaction & analyse", "Support équipes"]
  }
];

export function SolutionsModal({ isOpen, onClose, onActivationRequest }: SolutionsModalProps) {
  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    document.body.classList.add("modal-open");
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.classList.remove("modal-open");
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isOpen, onClose]);

  if (!isOpen) {
    return null;
  }

  return (
    <div className="simple-modal-backdrop" role="dialog" aria-modal="true" aria-label="Solutions Fluxperf">
      <section className="simple-modal solutions-modal">
        <header className="simple-modal-header">
          <div>
            <span className="section-kicker">Solutions Fluxperf</span>
            <h2>Trois piliers pour développer votre solution.</h2>
          </div>
          <button type="button" aria-label="Fermer la fenêtre" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="solutions-content">
          <p>
            Fluxperf pilote votre visibilité, vos automatisations et vos usages IA avec une approche
            concrète, mesurable et adaptée aux TPE / PME.
          </p>

          <div className="solutions-grid">
            {solutions.map((solution) => {
              const Icon = solution.icon;

              return (
                <article className="solution-card" key={solution.title}>
                  <span className="solution-icon">
                    <Icon aria-hidden="true" />
                  </span>
                  <div>
                    <h3>{solution.title}</h3>
                    <strong>{solution.subtitle}</strong>
                    <p>{solution.description}</p>
                  </div>
                  <ul>
                    {solution.features.map((feature) => (
                      <li key={feature}>
                        <CheckCircle2 aria-hidden="true" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  <small>{solution.price}</small>
                </article>
              );
            })}
          </div>
        </div>

        <footer className="simple-modal-footer">
          <button type="button" className="secondary-action" onClick={onClose}>
            Fermer
          </button>
          <button type="button" className="primary-action" onClick={onActivationRequest}>
            <ArrowUpRight aria-hidden="true" />
            Demander l'activation
          </button>
        </footer>
      </section>
    </div>
  );
}
