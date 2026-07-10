import { AlertTriangle, LoaderCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { getSupabaseClient } from "../lib/supabase";

type CallbackState =
  | { status: "loading" }
  | { status: "error"; message: string };

function getHashSession() {
  const hash = window.location.hash.replace(/^#/, "");

  if (!hash) {
    return null;
  }

  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (!accessToken || !refreshToken) {
    return null;
  }

  return {
    access_token: accessToken,
    refresh_token: refreshToken
  };
}

export function AuthCallbackPage() {
  const [state, setState] = useState<CallbackState>({ status: "loading" });

  useEffect(() => {
    let isMounted = true;

    async function finishLogin() {
      const supabase = getSupabaseClient();
      const searchParams = new URLSearchParams(window.location.search);
      const code = searchParams.get("code");
      const callbackError = searchParams.get("error_description") || searchParams.get("error");

      if (!supabase || callbackError) {
        throw new Error("Lien de connexion invalide ou expire.");
      }

      if (code) {
        const { error } = await supabase.auth.exchangeCodeForSession(code);

        if (error) {
          throw error;
        }
      } else {
        const hashSession = getHashSession();

        if (!hashSession) {
          throw new Error("Lien de connexion invalide ou expire.");
        }

        const { error } = await supabase.auth.setSession(hashSession);

        if (error) {
          throw error;
        }
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
        <img src="/assets/img/logo-fluxperf.svg" alt="Fluxperf" />
        <AlertTriangle aria-hidden="true" />
        <h1>Connexion impossible</h1>
        <p>{state.message}</p>
        <a href="/login">Demander un nouveau lien</a>
      </main>
    );
  }

  return (
    <main className="center-state" aria-live="polite">
      <img src="/assets/img/logo-fluxperf.svg" alt="Fluxperf" />
      <LoaderCircle className="loading-icon" aria-hidden="true" />
      <h1>Connexion en cours</h1>
      <p>Nous securisons votre session Fluxperf.</p>
    </main>
  );
}
