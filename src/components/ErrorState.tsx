import { AlertTriangle, LifeBuoy, RefreshCw } from "lucide-react";
import { ApiError } from "../lib/api";

type ErrorStateProps = {
  error: unknown;
  onRequestAccess?: () => void;
  onRetryLogin?: () => void;
};

function getErrorContent(error: unknown) {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return {
        type: "default",
        title: "Connexion requise",
        message: "Connectez-vous à votre espace Fluxperf pour continuer."
      };
    }

    if (error.status === 403 && error.code === "CLIENT_NOT_CONFIGURED") {
      return {
        type: "client-not-configured",
        title: "Espace client non configuré",
        message:
          "Votre adresse est authentifiée, mais aucun espace client Fluxperf n'est encore rattaché à cet email."
      };
    }

    return {
      type: "default",
      title: "Données indisponibles",
      message: error.message
    };
  }

  return {
    type: "default",
    title: "Données indisponibles",
    message: "Une erreur empêche l'affichage de votre espace client pour le moment."
  };
}

export function ErrorState({ error, onRequestAccess, onRetryLogin }: ErrorStateProps) {
  const content = getErrorContent(error);
  const isClientNotConfigured = content.type === "client-not-configured";

  return (
    <main className="center-state error-center">
      <img src="/assets/img/logo-fluxperf.svg" alt="Fluxperf" />
      <AlertTriangle aria-hidden="true" />
      <h1>{content.title}</h1>
      <p>{content.message}</p>
      {isClientNotConfigured ? (
        <div className="error-actions">
          <button type="button" onClick={onRetryLogin}>
            <RefreshCw aria-hidden="true" />
            Réessayer avec une autre adresse
          </button>
          <button type="button" className="error-secondary-action" onClick={onRequestAccess}>
            <LifeBuoy aria-hidden="true" />
            Demander un accès à MyFluxperf
          </button>
        </div>
      ) : (
        <a href="mailto:hello@fluxperf.fr">
          <LifeBuoy aria-hidden="true" />
          Contacter Fluxperf
        </a>
      )}
    </main>
  );
}
