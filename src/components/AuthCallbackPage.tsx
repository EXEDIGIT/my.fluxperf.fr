import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";

type CallbackState =
  | { status: "loading" }
  | { status: "error"; message: string };

export function AuthCallbackPage() {
  const [state, setState] = useState<CallbackState>({ status: "loading" });

  useEffect(() => {
    let isMounted = true;

    async function finishLogin() {
      const supabase = getSupabaseClient();
      const code = new URLSearchParams(window.location.search).get("code");

      if (!supabase || !code) {
        throw new Error("Lien de connexion invalide ou expire.");
      }

      const { error } = await supabase.auth.exchangeCodeForSession(code);

      if (error) {
        throw error;
      }

      window.history.replaceState({}, "", "/");
      window.location.assign("/");
    }

    finishLogin().catch(() => {
      if (isMounted) {
        setState({
          status: "error",
          message: "Ce lien de connexion est invalide ou expire. Demandez un nouveau lien."
        });
      }
    });

    return () => {
      isMounted = false;
    };
  }, []);

  if (state.status === "error") {
    return (
      <main className="center-state error-center">
        <img src="/assets/img/logo-fluxperf.svg" alt="FluxPerf" />
        <AlertTriangle aria-hidden="true" />
        <h1>Connexion impossible</h1>
        <p>{state.message}</p>
        <a href="/login">Demander un nouveau lien</a>
      </main>
    );
  }

  return (
    <main className="center-state" aria-live="polite">
      <img src="/assets/img/logo-fluxperf.svg" alt="FluxPerf" />
      <LoaderCircle className="loading-icon" aria-hidden="true" />
      <h1>Connexion en cours</h1>
      <p>Nous securisons votre session FluxPerf.</p>
    </main>
  );
}
