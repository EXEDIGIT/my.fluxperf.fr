import { ArrowRight, LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { getSupabaseClient, hasSupabaseConfig } from "../lib/supabase";
import { AccessRequestModal } from "./AccessRequestModal";

type LoginState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

const RESEND_COOLDOWN_SECONDS = 20;
const RATE_LIMIT_FALLBACK_SECONDS = 60;

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function getRateLimitDelaySeconds(message: string | undefined): number {
  const match = message?.match(/after\s+(\d+)\s+seconds?/i);
  return match ? Number(match[1]) : RATE_LIMIT_FALLBACK_SECONDS;
}

function signInErrorMessage(error: { message?: string; status?: number }) {
  const message = error.message?.toLowerCase() ?? "";

  if (error.status === 429 || message.includes("rate limit") || message.includes("security purposes")) {
    return "Une demande de connexion vient déjà d'être envoyée. Patientez quelques instants, puis demandez un nouveau lien.";
  }

  if (message.includes("signup") || message.includes("user not found") || message.includes("not found")) {
    return "Cette adresse email ne semble pas rattachée à un espace Fluxperf. Vérifiez l'adresse ou contactez le support.";
  }

  return "Le lien de connexion n'a pas pu être envoyé pour le moment. Patientez quelques instants, puis réessayez.";
}

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<LoginState>({ status: "idle" });
  const [cooldownRemaining, setCooldownRemaining] = useState(0);
  const [isAccessRequestOpen, setIsAccessRequestOpen] = useState(false);

  const redirectTo = useMemo(() => `${window.location.origin}/auth/callback`, []);
  const isSending = state.status === "sending";
  const isCoolingDown = cooldownRemaining > 0;
  const isSubmitDisabled = isSending || isCoolingDown;
  const submitLabel = isSending
    ? "Envoi en cours..."
    : isCoolingDown
      ? `Nouveau lien dans ${cooldownRemaining}s`
      : "Recevoir mon lien";

  useEffect(() => {
    if (cooldownRemaining <= 0) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setCooldownRemaining((currentValue) => Math.max(0, currentValue - 1));
    }, 1000);

    return () => window.clearTimeout(timeoutId);
  }, [cooldownRemaining]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabaseClient();

    if (!hasSupabaseConfig() || !supabase) {
      setState({
        status: "error",
        message: "La connexion Fluxperf n'est pas encore configurée."
      });
      return;
    }

    if (!normalizedEmail) {
      setState({
        status: "error",
        message: "Renseignez votre adresse email pour recevoir le lien de connexion."
      });
      return;
    }

    setState({ status: "sending" });

    const { error } = await supabase.auth.signInWithOtp({
      email: normalizedEmail,
      options: {
        emailRedirectTo: redirectTo,
        shouldCreateUser: false
      }
    });

    if (error) {
      if (error.status === 429) {
        setCooldownRemaining(getRateLimitDelaySeconds(error.message));
      }

      setState({
        status: "error",
        message: signInErrorMessage(error)
      });
      return;
    }

    setCooldownRemaining(RESEND_COOLDOWN_SECONDS);
    setState({ status: "sent", email: normalizedEmail });
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-label="Connexion à MyFluxperf">
        <div className="auth-brand">
          <img src="/assets/img/logo-fluxperf.svg" alt="Fluxperf" />
          <span>MyFluxperf</span>
        </div>

        <div className="auth-copy">
          <span className="auth-kicker">
            <ShieldCheck aria-hidden="true" />
            Espace client sécurisé
          </span>
          <h1>Connexion à votre espace client</h1>
          <p>Recevez un lien de connexion sur l'adresse email rattachée à votre espace Fluxperf.</p>
        </div>

        <form className="auth-form" onSubmit={handleSubmit}>
          <label htmlFor="email">Adresse email</label>
          <div className="auth-input-row">
            <Mail aria-hidden="true" />
            <input
              id="email"
              name="email"
              type="email"
              value={email}
              autoComplete="email"
              placeholder="vous@entreprise.fr"
              disabled={isSending}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>

          <button
            className={isSending ? "is-loading" : isCoolingDown ? "is-cooling" : undefined}
            type="submit"
            disabled={isSubmitDisabled}
          >
            <span>{submitLabel}</span>
            <ArrowRight aria-hidden="true" />
          </button>
        </form>

        {state.status === "sent" ? (
          <div className="auth-message success" role="status">
            <strong>Lien envoyé</strong>
            <p>Consultez la boîte mail de {state.email}. Le lien expire automatiquement.</p>
            {isCoolingDown ? <p>Vous pourrez demander un nouveau lien dans {cooldownRemaining}s.</p> : null}
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="auth-message error" role="alert">
            <strong>Connexion impossible</strong>
            <p>{state.message}</p>
          </div>
        ) : null}

        <button className="auth-support" type="button" onClick={() => setIsAccessRequestOpen(true)}>
          <LifeBuoy aria-hidden="true" />
          Demander un accès à MyFluxperf
        </button>
      </section>

      <AccessRequestModal
        isOpen={isAccessRequestOpen}
        onClose={() => setIsAccessRequestOpen(false)}
      />
    </main>
  );
}
