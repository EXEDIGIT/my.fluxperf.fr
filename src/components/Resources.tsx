import type { LucideIcon } from "lucide-react";
import {
  ArrowUpRight,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  Copy,
  HelpCircle,
  Lightbulb,
  X
} from "lucide-react";
import { useEffect, useState } from "react";
import { isExternalUrl } from "../lib/url";
import type { Client } from "../types/client";

type ResourcesProps = {
  resourcesUrl: Client["links"]["resources"];
};

type ResourceId = "request-guide" | "faq" | "best-practices";

type Resource = {
  id: ResourceId;
  title: string;
  description: string;
  actionLabel: string;
  icon: LucideIcon;
};

const resources: Resource[] = [
  {
    id: "request-guide",
    title: "Guide de demande",
    description: "Préparer une demande claire et complète.",
    actionLabel: "Préparer",
    icon: BookOpen
  },
  {
    id: "faq",
    title: "FAQ",
    description: "Retrouver les réponses aux questions fréquentes.",
    actionLabel: "Consulter",
    icon: HelpCircle
  },
  {
    id: "best-practices",
    title: "Bonnes pratiques",
    description: "Mieux suivre vos actions, priorités et indicateurs.",
    actionLabel: "Découvrir",
    icon: Lightbulb
  }
];

const requestChecklist = [
  "Objectif de la demande",
  "Contexte utile",
  "Niveau d'urgence",
  "Lien ou page concernée",
  "Résultat attendu",
  "Pièces jointes ou exemples"
];

const requestTemplate = `Bonjour,

Je souhaite faire une demande concernant :

Objectif :
Contexte :
Lien ou page concernée :
Niveau d'urgence :
Résultat attendu :
Pièces jointes ou exemples :

Merci.`;

const requestExamples = [
  {
    title: "Modification site",
    text: "Préciser la page concernée, le texte à remplacer, l'image à utiliser et le résultat attendu."
  },
  {
    title: "Campagne Ads",
    text: "Indiquer l'objectif, la période, le budget souhaité, l'offre à pousser et la zone ciblée."
  },
  {
    title: "Question reporting",
    text: "Mentionner l'indicateur observé, la période analysée et ce qui semble inhabituel."
  }
];

const faqItems = [
  {
    question: "Comment suivre l'avancement d'une action ?",
    answer:
      "Consultez les dernières actions affichées dans votre espace client. Pour une demande précise, indiquez la référence ou le sujet lors de votre message."
  },
  {
    question: "Quel délai prévoir pour une demande ?",
    answer:
      "Le délai dépend du niveau d'urgence et de la complexité. Une demande claire, avec contexte et exemples, permet à l'équipe Fluxperf de traiter plus vite."
  },
  {
    question: "Comment signaler une urgence ?",
    answer:
      "Indiquez clairement ce qui bloque votre activité, la date limite et la conséquence concrète. Réservez l'urgence aux sujets réellement bloquants."
  },
  {
    question: "Où retrouver mes indicateurs ?",
    answer:
      "Les indicateurs principaux sont visibles dans les sections Temps libéré et dernières actions. Les rapports détaillés peuvent être ajoutés via les accès utiles de votre espace."
  },
  {
    question: "Que faire si une donnée semble incorrecte ?",
    answer:
      "Signalez l'indicateur concerné, la période observée et la différence constatée. Une capture ou un exemple aide à vérifier rapidement."
  },
  {
    question: "Comment prioriser mes demandes ?",
    answer:
      "Classez vos demandes entre urgent, important et à planifier. Une priorité claire évite les allers-retours et facilite l'organisation de l'équipe."
  }
];

const bestPractices = [
  {
    title: "Bien prioriser une demande",
    text: "Distinguez ce qui bloque immédiatement, ce qui améliore la performance et ce qui peut être planifié plus tard."
  },
  {
    title: "Lire une tendance",
    text: "Comparez l'évolution sur plusieurs périodes plutôt qu'un chiffre isolé. La tendance raconte souvent mieux la réalité."
  },
  {
    title: "Préparer un point mensuel",
    text: "Listez les objectifs, les résultats, les blocages et les prochaines actions avant l'échange avec Fluxperf."
  },
  {
    title: "Suivre une action",
    text: "Gardez en tête le statut, le responsable et la prochaine étape. C'est le trio le plus utile pour avancer sans friction."
  }
];

export function Resources({ resourcesUrl }: ResourcesProps) {
  const [activeResource, setActiveResource] = useState<Resource | null>(null);

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
            <button
              type="button"
              className="resource-card resource-card-button"
              key={resource.id}
              onClick={() => setActiveResource(resource)}
            >
              <span className="resource-card-icon">
                <Icon aria-hidden="true" />
              </span>
              <h3>{resource.title}</h3>
              <p>{resource.description}</p>
              <span className="resource-card-action">
                {resource.actionLabel}
                <ArrowUpRight aria-hidden="true" />
              </span>
            </button>
          );
        })}
      </div>

      <ResourceModal resource={activeResource} onClose={() => setActiveResource(null)} />
    </section>
  );
}

type ResourceModalProps = {
  resource: Resource | null;
  onClose: () => void;
};

function ResourceModal({ resource, onClose }: ResourceModalProps) {
  const [copyState, setCopyState] = useState<"idle" | "success" | "error">("idle");

  useEffect(() => {
    if (!resource) return;

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
  }, [resource, onClose]);

  useEffect(() => {
    if (copyState === "idle") return;

    const timeoutId = window.setTimeout(() => setCopyState("idle"), 2400);

    return () => window.clearTimeout(timeoutId);
  }, [copyState]);

  useEffect(() => {
    setCopyState("idle");
  }, [resource?.id]);

  if (!resource) {
    return null;
  }

  const Icon = resource.icon;
  const primaryLabel =
    resource.id === "request-guide"
      ? copyState === "success"
        ? "Modèle copié"
        : copyState === "error"
          ? "Copie indisponible"
          : "Copier le modèle"
      : resource.id === "faq"
        ? "J'ai ma réponse"
        : "J'ai mes repères";

  async function handlePrimaryAction() {
    if (resource?.id !== "request-guide") {
      onClose();
      return;
    }

    if (!navigator.clipboard) {
      setCopyState("error");
      return;
    }

    try {
      await navigator.clipboard.writeText(requestTemplate);
      setCopyState("success");
    } catch {
      setCopyState("error");
    }
  }

  return (
    <div className="simple-modal-backdrop" role="dialog" aria-modal="true" aria-label={resource.title}>
      <section className="simple-modal resource-modal">
        <header className="simple-modal-header">
          <div>
            <span className="section-kicker">Ressources utiles</span>
            <h2>{resource.title}</h2>
          </div>
          <button type="button" aria-label="Fermer la fenêtre" onClick={onClose}>
            <X aria-hidden="true" />
          </button>
        </header>

        <div className="resource-modal-content">
          <div className="resource-modal-intro">
            <span className="resource-modal-icon">
              <Icon aria-hidden="true" />
            </span>
            <p>{resource.description}</p>
          </div>

          {resource.id === "request-guide" ? <RequestGuideContent /> : null}
          {resource.id === "faq" ? <FaqContent /> : null}
          {resource.id === "best-practices" ? <BestPracticesContent /> : null}
        </div>

        <footer className="simple-modal-footer">
          <button type="button" className="secondary-action" onClick={onClose}>
            Fermer
          </button>
          <button type="button" className="primary-action" onClick={handlePrimaryAction}>
            {resource.id === "request-guide" && copyState !== "success" ? (
              <Copy aria-hidden="true" />
            ) : (
              <CheckCircle2 aria-hidden="true" />
            )}
            {primaryLabel}
          </button>
        </footer>
      </section>
    </div>
  );
}

function RequestGuideContent() {
  return (
    <>
      <section className="resource-panel">
        <h3>Checklist avant envoi</h3>
        <ul className="resource-checklist">
          {requestChecklist.map((item) => (
            <li key={item}>
              <CheckCircle2 aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <section className="resource-panel">
        <h3>Modèle de demande</h3>
        <pre className="resource-template">{requestTemplate}</pre>
      </section>

      <section className="resource-panel">
        <h3>Exemples utiles</h3>
        <div className="resource-example-grid">
          {requestExamples.map((example) => (
            <article className="resource-mini-card" key={example.title}>
              <strong>{example.title}</strong>
              <p>{example.text}</p>
            </article>
          ))}
        </div>
      </section>
    </>
  );
}

function FaqContent() {
  return (
    <section className="resource-panel">
      <h3>Questions fréquentes</h3>
      <div className="resource-faq-list">
        {faqItems.map((item, index) => (
          <details className="resource-faq-item" key={item.question} open={index === 0}>
            <summary>
              <span>{item.question}</span>
              <ChevronDown aria-hidden="true" />
            </summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

function BestPracticesContent() {
  return (
    <section className="resource-panel">
      <h3>Conseils actionnables</h3>
      <div className="resource-practice-grid">
        {bestPractices.map((practice) => (
          <article className="resource-mini-card" key={practice.title}>
            <span>
              <CheckCircle2 aria-hidden="true" />
            </span>
            <strong>{practice.title}</strong>
            <p>{practice.text}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
