import { AlertTriangle, LoaderCircle, ShieldCheck } from "lucide-react";
import { useMemo, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { getSupabaseClient } from "../lib/supabase";

type ConfirmState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "error"; message: string };

const allowedTypes = new Set<EmailOtpType>(["magiclink", "email"]);

function safeRedirectPath(value: string | null): string {
  if (!value || !value.startsWith("/") || value.startsWith("//")) {
    return "/";
  }

  return value;
}

export function AuthConfirmPage() {
  const [state, setState] = useState<ConfirmState>({ status: "idle" });

  const params = useMemo(() => new URLSearchParams(window.location.search), []);
  const tokenHash = params.get("token_hash");
  const type = params.get("type") as EmailOtpType | null;
  const nextPath = safeRedirectPath(params.get("next"));
  const canConfirm = Boolean(tokenHash && type && allowedTypes.has(type));
  const isLoading = state.status === "loading";

  async function handleConfirm() {
    const supabase = getSupabaseClient();

    if (!supabase || !tokenHash || !type || !allowedTypes.has(type)) {
      setState({
        status: "error",
        message: "Ce lien de connexion est incomplet. Demandez un nouveau lien."
      });
      return;
    }

    setState({ status: "loading" });

    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type
    });

    if (error) {
      setState({
        status: "error",
        message: "Ce lien de connexion est invalide ou expire. Demandez un nouveau lien."
      });
      return;
    }

    window.history.replaceState({}, "", nextPath);
    window.location.assign(nextPath);
  }

  return (
    <main className="center-state error-center" aria-live="polite">
      <img src="/assets/img/logo-fluxperf.svg" alt="Fluxperf" />
      {state.status === "loading" ? (
        <LoaderCircle className="loading-icon" aria-hidden="true" />
      ) : state.status === "error" || !canConfirm ? (
        <AlertTriangle aria-hidden="true" />
      ) : (
        <ShieldCheck aria-hidden="true" />
      )}
      <h1>{state.status === "error" || !canConfirm ? "Connexion impossible" : "Confirmer votre connexion"}</h1>
      <p>
        {state.status === "error"
          ? state.message
          : canConfirm
            ? "Cliquez sur le bouton ci-dessous pour acceder a votre espace client Fluxperf."
            : "Ce lien de connexion est incomplet. Demandez un nouveau lien."}
      </p>
      {canConfirm && state.status !== "error" ? (
        <button type="button" onClick={handleConfirm} disabled={isLoading}>
          {isLoading ? "Connexion en cours..." : "Confirmer ma connexion"}
        </button>
      ) : (
        <a href="/login">Demander un nouveau lien</a>
      )}
    </main>
  );
}
