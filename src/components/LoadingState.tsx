import { LoaderCircle } from "lucide-react";

export function LoadingState() {
  return (
    <main className="center-state" aria-live="polite">
      <img src="/assets/img/logo-fluxperf.svg" alt="Fluxperf" />
      <LoaderCircle className="loading-icon" aria-hidden="true" />
      <h1>Préparation de votre espace client</h1>
      <p>Nous récupérons vos informations Fluxperf sécurisées.</p>
    </main>
  );
}
