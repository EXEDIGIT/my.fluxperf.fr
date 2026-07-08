import { AlertTriangle, LifeBuoy } from "lucide-react";
import { ApiError } from "../lib/api";

type ErrorStateProps = {
  error: unknown;
};

function getErrorContent(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return {
        title: "Connexion requise",
        message: "Connectez-vous a votre espace FluxPerf pour continuer."
      };
    }

    if (error.status === 403) {
      return {
        title: "Espace client non configure",
        message:
          "Votre adresse est authentifiee, mais aucun espace client FluxPerf n'est encore rattache a cet email."
      };
    }

    return {
      title: "Donnees indisponibles",
      message: error.message
    };
  }

  return {
    title: "Donnees indisponibles",
    message: "Une erreur empeche l'affichage de votre espace client pour le moment."
  };
}

export function ErrorState({ error }: ErrorStateProps) {
  const content = getErrorContent(error);

  return (
    <main className="center-state error-center">
      <img src="/assets/img/logo-fluxperf.svg" alt="FluxPerf" />
      <AlertTriangle aria-hidden="true" />
      <h1>{content.title}</h1>
      <p>{content.message}</p>
      <a href="mailto:hello@fluxperf.fr">
        <LifeBuoy aria-hidden="true" />
        Contacter FluxPerf
      </a>
    </main>
  );
}
