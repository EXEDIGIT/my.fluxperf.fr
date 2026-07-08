import { ArrowRight, LifeBuoy, Mail, ShieldCheck } from "lucide-react";
import { FormEvent, useMemo, useState } from "react";
import { getSupabaseClient, hasSupabaseConfig } from "../lib/supabase";

type LoginState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

export function LoginPage() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<LoginState>({ status: "idle" });

  const redirectTo = useMemo(() => `${window.location.origin}/auth/callback`, []);
  const isSending = state.status === "sending";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabaseClient();

    if (!hasSupabaseConfig() || !supabase) {
      setState({
        status: "error",
        message: "La connexion FluxPerf n'est pas encore configuree."
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
      setState({
        status: "error",
        message:
          "Cette adresse email ne semble pas rattachee a un espace FluxPerf. Verifiez l'adresse ou contactez le support."
      });
      return;
    }

    setState({ status: "sent", email: normalizedEmail });
  }

  return (
    <main className="auth-page">
      <section className="auth-panel" aria-label="Connexion a My FluxPerf">
        <div className="auth-brand">
          <img src="/assets/img/logo-fluxperf.svg" alt="FluxPerf" />
          <span>My FluxPerf</span>
        </div>

        <div className="auth-copy">
          <span className="auth-kicker">
            <ShieldCheck aria-hidden="true" />
            Espace client securise
          </span>
          <h1>Connexion a votre espace client</h1>
          <p>Recevez un lien de connexion sur l'adresse email rattachee a votre espace FluxPerf.</p>
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

          <button type="submit" disabled={isSending}>
            <span>{isSending ? "Envoi en cours..." : "Recevoir mon lien"}</span>
            <ArrowRight aria-hidden="true" />
          </button>
        </form>

        {state.status === "sent" ? (
          <div className="auth-message success" role="status">
            <strong>Lien envoye</strong>
            <p>Consultez la boite mail de {state.email}. Le lien expire automatiquement.</p>
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="auth-message error" role="alert">
            <strong>Connexion impossible</strong>
            <p>{state.message}</p>
          </div>
        ) : null}

        <a className="auth-support" href="mailto:hello@fluxperf.fr">
          <LifeBuoy aria-hidden="true" />
          Contacter le support FluxPerf
        </a>
      </section>
    </main>
  );
}
