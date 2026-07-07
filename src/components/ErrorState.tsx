import { AlertTriangle, LifeBuoy } from "lucide-react";
import { ApiError } from "../lib/api";

type ErrorStateProps = {
  error: unknown;
};

function getErrorContent(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return {
        title: "Accès non authentifié",
        message:
          "Connectez-vous via Cloudflare Access pour ouvrir votre espace client FluxPerf."
      };
    }

    if (error.status === 403) {
      return {
        title: "Espace client non configuré",
        message:
          "Votre accès est bien authentifié, mais votre espace client n'est pas encore configuré. Merci de contacter FluxPerf."
      };
    }

    return {
      title: "Données indisponibles",
      message: error.message
    };
  }

  return {
    title: "Données indisponibles",
    message: "Une erreur empêche l'affichage de votre espace client pour le moment."
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
