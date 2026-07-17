import {
  ArrowRight,
  CheckCircle2,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  Plus,
  ShieldCheck,
  Sparkles,
  UserPlus
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError } from "../lib/api";
import { createAdminClient, getAdminSession } from "../lib/adminApi";
import { getSupabaseClient, hasSupabaseConfig } from "../lib/supabase";
import type { AdminCreateClientResponse, AdminSolutionType } from "../types/admin";

type LoadState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready"; email: string }
  | { status: "error"; message: string };

type LoginState =
  | { status: "idle" }
  | { status: "sending" }
  | { status: "sent"; email: string }
  | { status: "error"; message: string };

type SolutionDraft = {
  enabled: boolean;
  name: string;
  domain: string;
  url: string;
};

const consolePath = "/fp-console";

const solutionOptions: Array<{
  type: AdminSolutionType;
  label: string;
  defaultName: string;
  nameOptions: string[];
}> = [
  {
    type: "visibility_acquisition",
    label: "Flux Visibilité & Acquisition",
    defaultName: "Flux Visibilité & Acquisition • Site web",
    nameOptions: [
      "Flux Visibilité & Acquisition • Site web",
      "Flux Visibilité & Acquisition • Site e-shop"
    ]
  },
  {
    type: "automation_ai",
    label: "Flux Automatisation & IA",
    defaultName: "Flux Automatisation & IA • Tableau de bord",
    nameOptions: [
      "Flux Automatisation & IA • Tableau de bord",
      "Flux Automatisation & IA • Synchronisation de données"
    ]
  },
  {
    type: "assistant_ai",
    label: "Flux Assistant IA",
    defaultName: "Flux Assistant IA • Copilote entreprise",
    nameOptions: ["Flux Assistant IA • Copilote entreprise"]
  }
];

function emptySolutions(): Record<AdminSolutionType, SolutionDraft> {
  return {
    visibility_acquisition: {
      enabled: true,
      name: "Flux Visibilité & Acquisition • Site web",
      domain: "",
      url: ""
    },
    automation_ai: {
      enabled: false,
      name: "Flux Automatisation & IA • Tableau de bord",
      domain: "",
      url: ""
    },
    assistant_ai: {
      enabled: false,
      name: "Flux Assistant IA • Copilote entreprise",
      domain: "",
      url: ""
    }
  };
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function loginErrorMessage(error: { message?: string; status?: number }) {
  const message = error.message?.toLowerCase() ?? "";

  if (error.status === 429 || message.includes("rate limit")) {
    return "Une demande vient deja d'etre envoyee. Patientez quelques instants.";
  }

  if (message.includes("signup") || message.includes("not found")) {
    return "Cette adresse n'a pas de compte Supabase autorise.";
  }

  return "Le lien de connexion admin n'a pas pu etre envoye.";
}

function AdminLoginPanel() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<LoginState>({ status: "idle" });
  const redirectTo = useMemo(
    () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(consolePath)}`,
    []
  );
  const isSending = state.status === "sending";

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const normalizedEmail = normalizeEmail(email);
    const supabase = getSupabaseClient();

    if (!hasSupabaseConfig() || !supabase) {
      setState({
        status: "error",
        message: "La connexion Supabase n'est pas configuree."
      });
      return;
    }

    if (!normalizedEmail) {
      setState({
        status: "error",
        message: "Renseignez votre adresse email interne."
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
        message: loginErrorMessage(error)
      });
      return;
    }

    setState({ status: "sent", email: normalizedEmail });
  }

  return (
    <main className="admin-auth-page">
      <section className="admin-auth-panel" aria-label="Connexion interne Fluxperf">
        <img src="/assets/img/logo-fluxperf.svg" alt="Fluxperf" />
        <span className="admin-badge">
          <LockKeyhole aria-hidden="true" />
          Console interne
        </span>
        <h1>Acces securise Fluxperf</h1>
        <p>Connexion reservee aux emails internes autorises.</p>

        <form className="admin-login-form" onSubmit={handleSubmit}>
          <label htmlFor="admin-email">Email interne</label>
          <div>
            <Mail aria-hidden="true" />
            <input
              id="admin-email"
              type="email"
              value={email}
              autoComplete="email"
              placeholder="vous@fluxperf.fr"
              disabled={isSending}
              onChange={(event) => setEmail(event.target.value)}
            />
          </div>
          <button type="submit" disabled={isSending}>
            {isSending ? <Loader2 className="loading-icon" aria-hidden="true" /> : <ArrowRight aria-hidden="true" />}
            Recevoir le lien
          </button>
        </form>

        {state.status === "sent" ? (
          <div className="admin-message success" role="status">
            Lien envoye a {state.email}.
          </div>
        ) : null}

        {state.status === "error" ? (
          <div className="admin-message error" role="alert">
            {state.message}
          </div>
        ) : null}
      </section>
    </main>
  );
}

export function AdminConsolePage() {
  const [loadState, setLoadState] = useState<LoadState>({ status: "loading" });
  const [companyName, setCompanyName] = useState("");
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [notifyClient, setNotifyClient] = useState(true);
  const [solutions, setSolutions] = useState(emptySolutions);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<AdminCreateClientResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const supabase = getSupabaseClient();

    async function loadAdminSession() {
      try {
        const session = await getAdminSession();

        if (isMounted) {
          setLoadState({ status: "ready", email: session.admin.email });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (error instanceof ApiError && error.status === 401) {
          setLoadState({ status: "anonymous" });
          return;
        }

        setLoadState({
          status: "error",
          message: error instanceof Error ? error.message : "Acces interne indisponible."
        });
      }
    }

    async function bootstrap() {
      if (!hasSupabaseConfig() || !supabase) {
        setLoadState({
          status: "error",
          message: "La connexion Supabase n'est pas configuree."
        });
        return;
      }

      const { data } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (!data.session) {
        setLoadState({ status: "anonymous" });
        return;
      }

      await loadAdminSession();
    }

    void bootstrap();

    const listener = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      if (!session) {
        setLoadState({ status: "anonymous" });
        return;
      }

      void loadAdminSession();
    });

    return () => {
      isMounted = false;
      listener?.data.subscription.unsubscribe();
    };
  }, []);

  function updateSolution(type: AdminSolutionType, values: Partial<SolutionDraft>) {
    setSolutions((current) => ({
      ...current,
      [type]: {
        ...current[type],
        ...values
      }
    }));
  }

  function resetForm() {
    setCompanyName("");
    setContactFirstName("");
    setContactLastName("");
    setEmail("");
    setNotes("");
    setNotifyClient(true);
    setSolutions(emptySolutions());
  }

  async function handleLogout() {
    const supabase = getSupabaseClient();

    await supabase?.auth.signOut();
    setLoadState({ status: "anonymous" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSuccess(null);

    const selectedSolutions = solutionOptions
      .map((option) => ({
        type: option.type,
        ...solutions[option.type]
      }))
      .filter((solution) => solution.enabled)
      .map(({ type, name, domain, url }) => ({
        type,
        name,
        domain,
        url
      }));

    if (selectedSolutions.length === 0) {
      setSubmitError("Selectionnez au moins une solution.");
      return;
    }

    setIsSubmitting(true);

    try {
      const result = await createAdminClient({
        companyName,
        contactFirstName,
        contactLastName,
        email,
        notes,
        notifyClient,
        solutions: selectedSolutions
      });

      setSuccess(result);
      resetForm();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : "Le client n'a pas pu etre cree. Verifiez les informations puis reessayez."
      );
    } finally {
      setIsSubmitting(false);
    }
  }

  if (loadState.status === "loading") {
    return (
      <main className="center-state">
        <img src="/assets/img/logo-fluxperf.svg" alt="Fluxperf" />
        <Loader2 className="loading-icon" aria-hidden="true" />
        <h1>Verification interne</h1>
      </main>
    );
  }

  if (loadState.status === "anonymous") {
    return <AdminLoginPanel />;
  }

  if (loadState.status === "error") {
    return (
      <main className="center-state error-center">
        <img src="/assets/img/logo-fluxperf.svg" alt="Fluxperf" />
        <LockKeyhole aria-hidden="true" />
        <h1>Acces refuse</h1>
        <p>{loadState.message}</p>
        <button type="button" onClick={handleLogout}>
          Changer de compte
        </button>
      </main>
    );
  }

  return (
    <main className="admin-console">
      <header className="admin-console-header">
        <div>
          <span className="admin-badge">
            <ShieldCheck aria-hidden="true" />
            Zone interne
          </span>
          <h1>Creation client MyFluxperf</h1>
          <p>Ajout rapide dans Google Sheets, creation Supabase et notification client.</p>
        </div>
        <button type="button" onClick={handleLogout}>
          <LogOut aria-hidden="true" />
          Sortir
        </button>
      </header>

      <section className="admin-status-strip" aria-label="Session admin">
        <span>{loadState.email}</span>
        <span>Google Sheets</span>
        <span>Supabase Auth</span>
        <span>Brevo</span>
      </section>

      <form className="admin-client-form" onSubmit={handleSubmit}>
        <section className="admin-form-panel">
          <div className="admin-panel-heading">
            <UserPlus aria-hidden="true" />
            <div>
              <h2>Nouveau client</h2>
              <p>Ces informations alimentent les onglets Clients et Contacts.</p>
            </div>
          </div>

          <div className="admin-form-grid">
            <label>
              Organisation
              <input value={companyName} onChange={(event) => setCompanyName(event.target.value)} required />
            </label>
            <label>
              Email principal
              <input
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label>
              Prenom contact
              <input
                value={contactFirstName}
                onChange={(event) => setContactFirstName(event.target.value)}
              />
            </label>
            <label>
              Nom contact
              <input value={contactLastName} onChange={(event) => setContactLastName(event.target.value)} />
            </label>
          </div>

          <label className="admin-wide-field">
            Notes internes
            <textarea value={notes} rows={4} onChange={(event) => setNotes(event.target.value)} />
          </label>
        </section>

        <section className="admin-form-panel">
          <div className="admin-panel-heading">
            <Sparkles aria-hidden="true" />
            <div>
              <h2>Solutions actives</h2>
              <p>Chaque solution cochee cree une ligne active dans l'onglet Solutions.</p>
            </div>
          </div>

          <div className="admin-solutions-grid">
            {solutionOptions.map((option) => {
              const draft = solutions[option.type];

              return (
                <div className={`admin-solution-card ${draft.enabled ? "is-selected" : ""}`} key={option.type}>
                  <label className="admin-checkbox-row">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      onChange={(event) => updateSolution(option.type, { enabled: event.target.checked })}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>{option.defaultName}</small>
                    </span>
                  </label>
                  <label>
                    Nom affiche
                    <select
                      value={draft.name}
                      disabled={!draft.enabled}
                      onChange={(event) => updateSolution(option.type, { name: event.target.value })}
                    >
                      {option.nameOptions.map((name) => (
                        <option value={name} key={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Domaine
                    <input
                      value={draft.domain}
                      disabled={!draft.enabled}
                      placeholder="exemple.fr"
                      onChange={(event) => updateSolution(option.type, { domain: event.target.value })}
                    />
                  </label>
                  <label>
                    URL
                    <input
                      value={draft.url}
                      disabled={!draft.enabled}
                      placeholder="https://exemple.fr"
                      onChange={(event) => updateSolution(option.type, { url: event.target.value })}
                    />
                  </label>
                </div>
              );
            })}
          </div>
        </section>

        <section className="admin-submit-panel">
          <label className="admin-checkbox-row">
            <input
              type="checkbox"
              checked={notifyClient}
              onChange={(event) => setNotifyClient(event.target.checked)}
            />
            <span>
              <strong>Envoyer l'email d'ouverture d'acces</strong>
              <small>Le client recevra l'adresse du portail et utilisera son email pour demander son lien.</small>
            </span>
          </label>

          {submitError ? (
            <div className="admin-message error" role="alert">
              {submitError}
            </div>
          ) : null}

          {success ? (
            <div className="admin-message success" role="status">
              <CheckCircle2 aria-hidden="true" />
              Client {success.client.companyName} cree : {success.client.id}. Supabase :{" "}
              {success.supabaseUser.status}. Email : {success.notification.status}.
            </div>
          ) : null}

          <button className="admin-submit-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="loading-icon" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            Creer le client
          </button>
        </section>
      </form>
    </main>
  );
}
