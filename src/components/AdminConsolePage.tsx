import {
  ArrowRight,
  Ban,
  BarChart3,
  CheckCircle2,
  LayoutDashboard,
  Loader2,
  LockKeyhole,
  LogOut,
  Mail,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserPlus,
  Users
} from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { ApiError } from "../lib/api";
import {
  addAdminClientSolution,
  createAdminClient,
  deactivateAdminClient,
  deactivateAdminClientSolution,
  getAdminClient,
  getAdminClients,
  getAdminDashboard,
  getAdminOptions,
  getAdminSession
} from "../lib/adminApi";
import { getSupabaseClient, hasSupabaseConfig } from "../lib/supabase";
import type {
  AdminClientDetail,
  AdminClientSummary,
  AdminCreateClientResponse,
  AdminDashboard,
  AdminSolutionOption,
  AdminSolutionType
} from "../types/admin";

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
  id: string;
  name: string;
  urlOrIndication: string;
};

type SolutionDraftsByType = Record<AdminSolutionType, SolutionDraft[]>;

type AdminTab = "dashboard" | "clients" | "create";

const consolePath = "/fp-console";

const fallbackSolutionOptions: AdminSolutionOption[] = [
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

function buildDraftId(type: AdminSolutionType): string {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSolutionDraft(option: AdminSolutionOption): SolutionDraft {
  return {
    id: buildDraftId(option.type),
    name: option.defaultName,
    urlOrIndication: ""
  };
}

function emptySolutions(options: AdminSolutionOption[] = fallbackSolutionOptions): SolutionDraftsByType {
  return options.reduce(
    (drafts, option, index) => {
      drafts[option.type] = index === 0 ? [createSolutionDraft(option)] : [];

      return drafts;
    },
    {} as SolutionDraftsByType
  );
}

function normalizeEmail(value: string): string {
  return value.trim().toLowerCase();
}

function loginErrorMessage(error: { message?: string; status?: number }) {
  const message = error.message?.toLowerCase() ?? "";

  if (error.status === 429 || message.includes("rate limit")) {
    return "Une demande vient déjà d'être envoyée. Patientez quelques instants.";
  }

  if (message.includes("signup") || message.includes("not found")) {
    return "Cette adresse n'est pas autorisée pour la console interne.";
  }

  return "Le lien de connexion admin n'a pas pu être envoyé.";
}

function notificationLabel(notification: AdminCreateClientResponse["notification"]): string {
  if (notification.status === "sent") {
    return "email envoyé";
  }

  if (notification.status === "failed") {
    return "email non envoyé";
  }

  return "email désactivé";
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
        message: "La connexion Supabase n'est pas configurée."
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
        <h1>Accès sécurisé Fluxperf</h1>
        <p>Connexion réservée aux emails internes autorisés.</p>

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
            Lien envoyé à {state.email}.
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
  const [activeTab, setActiveTab] = useState<AdminTab>("dashboard");
  const [companyName, setCompanyName] = useState("");
  const [contactFirstName, setContactFirstName] = useState("");
  const [contactLastName, setContactLastName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [notifyClient, setNotifyClient] = useState(true);
  const [solutionOptions, setSolutionOptions] = useState<AdminSolutionOption[]>(fallbackSolutionOptions);
  const [solutions, setSolutions] = useState(emptySolutions);
  const [dashboard, setDashboard] = useState<AdminDashboard | null>(null);
  const [adminClients, setAdminClients] = useState<AdminClientSummary[]>([]);
  const [selectedClient, setSelectedClient] = useState<AdminClientDetail | null>(null);
  const [clientQuery, setClientQuery] = useState("");
  const [clientMessage, setClientMessage] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isAdminDataLoading, setIsAdminDataLoading] = useState(false);
  const [isClientActionPending, setIsClientActionPending] = useState(false);
  const [clientSolutionType, setClientSolutionType] = useState<AdminSolutionType>("visibility_acquisition");
  const [clientSolutionName, setClientSolutionName] = useState(fallbackSolutionOptions[0].defaultName);
  const [clientSolutionValue, setClientSolutionValue] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [success, setSuccess] = useState<AdminCreateClientResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedSolutionOption =
    solutionOptions.find((option) => option.type === clientSolutionType) ?? solutionOptions[0] ?? fallbackSolutionOptions[0];
  const filteredAdminClients = useMemo(() => {
    const query = clientQuery.trim().toLowerCase();

    if (!query) {
      return adminClients;
    }

    return adminClients.filter((client) =>
      [client.companyName, client.email, client.contactName, client.id]
        .join(" ")
        .toLowerCase()
        .includes(query)
    );
  }, [adminClients, clientQuery]);

  useEffect(() => {
    let isMounted = true;
    const supabase = getSupabaseClient();

    async function loadAdminSession() {
      try {
        const [session, options, clientsData, dashboardData] = await Promise.all([
          getAdminSession(),
          getAdminOptions(),
          getAdminClients(),
          getAdminDashboard()
        ]);

        if (isMounted) {
          setSolutionOptions(options.solutionOptions);
          setSolutions(emptySolutions(options.solutionOptions));
          setAdminClients(clientsData.clients);
          setDashboard(dashboardData.dashboard);
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
          message: error instanceof Error ? error.message : "Accès interne indisponible."
        });
      }
    }

    async function bootstrap() {
      if (!hasSupabaseConfig() || !supabase) {
        setLoadState({
          status: "error",
          message: "La connexion Supabase n'est pas configurée."
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

  async function refreshAdminData(clientId = selectedClient?.id) {
    setIsAdminDataLoading(true);

    try {
      const [clientsData, dashboardData] = await Promise.all([getAdminClients(), getAdminDashboard()]);

      setAdminClients(clientsData.clients);
      setDashboard(dashboardData.dashboard);

      if (clientId) {
        const detail = await getAdminClient(clientId);

        setSelectedClient(detail.client);
      }
    } finally {
      setIsAdminDataLoading(false);
    }
  }

  async function openClient(clientId: string) {
    setClientError(null);
    setClientMessage(null);
    setIsAdminDataLoading(true);

    try {
      const detail = await getAdminClient(clientId);

      setSelectedClient(detail.client);
    } catch (error) {
      setClientError(error instanceof ApiError ? error.message : "La fiche client est indisponible.");
    } finally {
      setIsAdminDataLoading(false);
    }
  }

  async function handleDeactivateClient(client: AdminClientDetail) {
    if (!window.confirm(`Desactiver l'acces MyFluxperf de ${client.companyName} ?`)) {
      return;
    }

    setClientError(null);
    setClientMessage(null);
    setIsClientActionPending(true);

    try {
      const result = await deactivateAdminClient(client.id);

      setClientMessage(
        result.auth?.status === "failed"
          ? `Client desactive. Blocage Auth a verifier : ${result.auth.reason}`
          : "Client desactive."
      );
      await refreshAdminData(client.id);
    } catch (error) {
      setClientError(error instanceof ApiError ? error.message : "Le client n'a pas pu etre desactive.");
    } finally {
      setIsClientActionPending(false);
    }
  }

  async function handleAddClientSolution(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!selectedClient) {
      return;
    }

    setClientError(null);
    setClientMessage(null);
    setIsClientActionPending(true);

    try {
      await addAdminClientSolution(selectedClient.id, {
        type: clientSolutionType,
        name: clientSolutionName || selectedSolutionOption.defaultName,
        urlOrIndication: clientSolutionValue
      });
      setClientSolutionValue("");
      setClientMessage("Solution ajoutee.");
      await refreshAdminData(selectedClient.id);
    } catch (error) {
      setClientError(error instanceof ApiError ? error.message : "La solution n'a pas pu etre ajoutee.");
    } finally {
      setIsClientActionPending(false);
    }
  }

  async function handleDeactivateSolution(solutionId: string) {
    if (!selectedClient) {
      return;
    }

    setClientError(null);
    setClientMessage(null);
    setIsClientActionPending(true);

    try {
      await deactivateAdminClientSolution(selectedClient.id, solutionId);
      setClientMessage("Solution desactivee.");
      await refreshAdminData(selectedClient.id);
    } catch (error) {
      setClientError(error instanceof ApiError ? error.message : "La solution n'a pas pu etre desactivee.");
    } finally {
      setIsClientActionPending(false);
    }
  }

  function setSolutionEnabled(option: AdminSolutionOption, enabled: boolean) {
    setSolutions((current) => {
      const currentDrafts = current[option.type] ?? [];

      return {
        ...current,
        [option.type]: enabled ? currentDrafts.length > 0 ? currentDrafts : [createSolutionDraft(option)] : []
      };
    });
  }

  function addSolution(option: AdminSolutionOption) {
    setSolutions((current) => ({
      ...current,
      [option.type]: [...(current[option.type] ?? []), createSolutionDraft(option)]
    }));
  }

  function updateSolution(type: AdminSolutionType, id: string, values: Partial<SolutionDraft>) {
    setSolutions((current) => ({
      ...current,
      [type]: (current[type] ?? []).map((draft) => (draft.id === id ? { ...draft, ...values } : draft))
    }));
  }

  function removeSolution(type: AdminSolutionType, id: string) {
    setSolutions((current) => ({
      ...current,
      [type]: (current[type] ?? []).filter((draft) => draft.id !== id)
    }));
  }

  function resetForm() {
    setCompanyName("");
    setContactFirstName("");
    setContactLastName("");
    setEmail("");
    setNotes("");
    setNotifyClient(true);
    setSolutions(emptySolutions(solutionOptions));
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

    const selectedSolutions = solutionOptions.flatMap((option) =>
      (solutions[option.type] ?? []).map(({ name, urlOrIndication }) => ({
        type: option.type,
        name,
        urlOrIndication
      }))
    );

    if (selectedSolutions.length === 0) {
      setSubmitError("Sélectionnez au moins une solution.");
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
      await refreshAdminData();
    } catch (error) {
      setSubmitError(
        error instanceof ApiError
          ? error.message
          : "Le client n'a pas pu être créé. Vérifiez les informations puis réessayez."
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
        <h1>Vérification interne</h1>
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
        <h1>Accès refusé</h1>
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
          <h1>Console admin MyFluxperf</h1>
          <p>Pilotage clients, solutions actives et indicateurs internes.</p>
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

      <nav className="admin-tabs" aria-label="Navigation admin">
        <button type="button" className={activeTab === "dashboard" ? "is-active" : ""} onClick={() => setActiveTab("dashboard")}>
          <LayoutDashboard aria-hidden="true" />
          Tableau de bord
        </button>
        <button type="button" className={activeTab === "clients" ? "is-active" : ""} onClick={() => setActiveTab("clients")}>
          <Users aria-hidden="true" />
          Clients
        </button>
        <button type="button" className={activeTab === "create" ? "is-active" : ""} onClick={() => setActiveTab("create")}>
          <UserPlus aria-hidden="true" />
          Nouveau client
        </button>
      </nav>

      {activeTab === "dashboard" ? (
        <section className="admin-client-form">
          <div className="admin-dashboard-grid">
            <article className="admin-stat-card">
              <span>Comptes actifs</span>
              <strong>{dashboard?.totals.activeClients ?? 0}</strong>
              <small>{dashboard?.totals.totalClients ?? 0} comptes au total</small>
            </article>
            <article className="admin-stat-card">
              <span>Solutions actives</span>
              <strong>{dashboard?.totals.activeSolutions ?? 0}</strong>
              <small>Sur clients actifs</small>
            </article>
            <article className="admin-stat-card">
              <span>Demandes 12 mois</span>
              <strong>{dashboard?.totals.interventionRequests12Months ?? 0}</strong>
              <small>{dashboard?.totals.interventionRequestsAveragePerMonth ?? 0} / mois</small>
            </article>
            <article className="admin-stat-card">
              <span>Connexions 12 mois</span>
              <strong>{dashboard?.totals.connections12Months ?? 0}</strong>
              <small>{dashboard?.totals.connectionsAveragePerMonth ?? 0} / mois</small>
            </article>
          </div>

          <section className="admin-form-panel">
            <div className="admin-panel-heading">
              <BarChart3 aria-hidden="true" />
              <div>
                <h2>Demandes d'intervention</h2>
                <p>Moyenne globale : {dashboard?.totals.interventionRequestsAveragePerActiveClient ?? 0} demande / client actif.</p>
              </div>
            </div>
            <div className="admin-chart">
              {(dashboard?.interventionRequestsByMonth ?? []).map((item) => {
                const max = Math.max(1, ...(dashboard?.interventionRequestsByMonth ?? []).map((month) => month.count));

                return (
                  <div className="admin-chart-bar" key={item.month}>
                    <span style={{ height: `${Math.max(6, (item.count / max) * 100)}%` }} />
                    <small>{item.label}</small>
                    <strong>{item.count}</strong>
                  </div>
                );
              })}
            </div>
          </section>

          <div className="admin-rank-grid">
            <section className="admin-form-panel">
              <div className="admin-panel-heading">
                <Sparkles aria-hidden="true" />
                <div>
                  <h2>Top demandes</h2>
                  <p>Clients avec le plus de demandes sur 12 mois.</p>
                </div>
              </div>
              <ol className="admin-rank-list">
                {(dashboard?.topInterventionClients ?? []).map((client) => (
                  <li key={client.clientId}>
                    <span>{client.companyName}</span>
                    <strong>{client.count}</strong>
                  </li>
                ))}
              </ol>
            </section>
            <section className="admin-form-panel">
              <div className="admin-panel-heading">
                <Users aria-hidden="true" />
                <div>
                  <h2>Top connexions</h2>
                  <p>Clients les plus actifs sur MyFluxperf.</p>
                </div>
              </div>
              <ol className="admin-rank-list">
                {(dashboard?.topConnectionClients ?? []).map((client) => (
                  <li key={client.clientId}>
                    <span>{client.companyName}</span>
                    <strong>{client.count}</strong>
                  </li>
                ))}
              </ol>
            </section>
          </div>
        </section>
      ) : null}

      {activeTab === "clients" ? (
        <section className="admin-client-form">
          <section className="admin-form-panel">
            <div className="admin-panel-heading">
              <Users aria-hidden="true" />
              <div>
                <h2>Clients</h2>
                <p>{filteredAdminClients.length} client{filteredAdminClients.length > 1 ? "s" : ""} affiché{filteredAdminClients.length > 1 ? "s" : ""}.</p>
              </div>
            </div>
            <label className="admin-search-field">
              <Search aria-hidden="true" />
              <input value={clientQuery} placeholder="Rechercher un client, email ou ID" onChange={(event) => setClientQuery(event.target.value)} />
            </label>
            <div className="admin-client-list">
              {filteredAdminClients.map((client) => (
                <button type="button" className={selectedClient?.id === client.id ? "is-selected" : ""} key={client.id} onClick={() => openClient(client.id)}>
                  <span>
                    <strong>{client.companyName}</strong>
                    <small>{client.email}</small>
                  </span>
                  <span>{client.activeSolutions} solution{client.activeSolutions > 1 ? "s" : ""}</span>
                  <em>{client.portalEnabled && client.status.toLowerCase() === "actif" ? "Actif" : "Inactif"}</em>
                </button>
              ))}
            </div>
          </section>

          {selectedClient ? (
            <section className="admin-form-panel">
              <div className="admin-panel-heading">
                <ShieldCheck aria-hidden="true" />
                <div>
                  <h2>{selectedClient.companyName}</h2>
                  <p>{selectedClient.id} - {selectedClient.email}</p>
                </div>
              </div>

              {clientMessage ? <div className="admin-message success">{clientMessage}</div> : null}
              {clientError ? <div className="admin-message error">{clientError}</div> : null}

              <div className="admin-detail-grid">
                <span>Statut : <strong>{selectedClient.status}</strong></span>
                <span>Accès portail : <strong>{selectedClient.portalEnabled ? "Oui" : "Non"}</strong></span>
                <span>Solutions actives : <strong>{selectedClient.activeSolutions}</strong></span>
                <span>Dernière activité : <strong>{selectedClient.lastActivityLabel}</strong></span>
              </div>

              <div className="admin-detail-actions">
                <button type="button" disabled={isClientActionPending || !selectedClient.portalEnabled} onClick={() => handleDeactivateClient(selectedClient)}>
                  <Ban aria-hidden="true" />
                  Désactiver le client
                </button>
              </div>

              <form className="admin-inline-form" onSubmit={handleAddClientSolution}>
                <h3>Ajouter une solution</h3>
                <select
                  value={clientSolutionType}
                  onChange={(event) => {
                    const type = event.target.value as AdminSolutionType;
                    const option = solutionOptions.find((item) => item.type === type) ?? fallbackSolutionOptions[0];

                    setClientSolutionType(type);
                    setClientSolutionName(option.defaultName);
                  }}
                >
                  {solutionOptions.map((option) => (
                    <option value={option.type} key={option.type}>{option.label}</option>
                  ))}
                </select>
                <select value={clientSolutionName} onChange={(event) => setClientSolutionName(event.target.value)}>
                  {selectedSolutionOption.nameOptions.map((name) => (
                    <option value={name} key={name}>{name}</option>
                  ))}
                </select>
                <input value={clientSolutionValue} placeholder="exemple.fr ou indication" onChange={(event) => setClientSolutionValue(event.target.value)} />
                <button type="submit" disabled={isClientActionPending}>
                  <Plus aria-hidden="true" />
                  Ajouter
                </button>
              </form>

              <div className="admin-solution-list">
                {selectedClient.solutions.map((solution) => (
                  <article key={solution.id}>
                    <span>
                      <strong>{solution.name || solution.type}</strong>
                      <small>{solution.domain || solution.urlOrIndication || "Sans indication"}</small>
                    </span>
                    <em>{solution.status}</em>
                    <button type="button" disabled={isClientActionPending || solution.status.toLowerCase() !== "actif"} onClick={() => handleDeactivateSolution(solution.id)}>
                      <Trash2 aria-hidden="true" />
                      Désactiver
                    </button>
                  </article>
                ))}
              </div>
            </section>
          ) : (
            <section className="admin-form-panel">
              <div className="admin-empty-detail">
                {isAdminDataLoading ? <Loader2 className="loading-icon" aria-hidden="true" /> : <Users aria-hidden="true" />}
                <strong>Sélectionnez un client</strong>
                <span>Sa fiche, ses solutions et ses actions apparaîtront ici.</span>
              </div>
            </section>
          )}
        </section>
      ) : null}

      {activeTab === "create" ? (
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
              Prénom contact
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
              <p>Chaque solution cochée crée une ligne active dans l'onglet Solutions.</p>
            </div>
          </div>

          <div className="admin-solutions-grid">
            {solutionOptions.map((option) => {
              const drafts = solutions[option.type] ?? [];
              const isSelected = drafts.length > 0;

              return (
                <div className={`admin-solution-card ${isSelected ? "is-selected" : ""}`} key={option.type}>
                  <label className="admin-checkbox-row">
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={(event) => setSolutionEnabled(option, event.target.checked)}
                    />
                    <span>
                      <strong>{option.label}</strong>
                      <small>
                        {isSelected
                          ? `${drafts.length} solution${drafts.length > 1 ? "s" : ""} active${drafts.length > 1 ? "s" : ""}`
                          : option.defaultName}
                      </small>
                    </span>
                  </label>

                  {drafts.map((draft, index) => (
                    <div className="admin-solution-entry" key={draft.id}>
                      <div className="admin-solution-entry-header">
                        <span>Solution {index + 1}</span>
                        <button type="button" aria-label="Retirer la solution" onClick={() => removeSolution(option.type, draft.id)}>
                          <Trash2 aria-hidden="true" />
                        </button>
                      </div>
                      <label>
                        Nom affiché
                        <select
                          value={draft.name}
                          onChange={(event) => updateSolution(option.type, draft.id, { name: event.target.value })}
                        >
                          {option.nameOptions.map((name) => (
                            <option value={name} key={name}>
                              {name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        URL ou indication
                        <input
                          value={draft.urlOrIndication}
                          placeholder="exemple.fr ou indication de service"
                          onChange={(event) => updateSolution(option.type, draft.id, { urlOrIndication: event.target.value })}
                        />
                      </label>
                    </div>
                  ))}

                  {isSelected ? (
                    <button className="admin-add-solution-button" type="button" onClick={() => addSolution(option)}>
                      <Plus aria-hidden="true" />
                      Ajouter une solution
                    </button>
                  ) : null}
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
              <strong>Envoyer l'email d'ouverture d'accès</strong>
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
              Client {success.client.companyName} créé : {success.client.id}. Supabase :{" "}
              {success.supabaseUser.status}. {notificationLabel(success.notification)}.
              {success.notification.reason ? ` ${success.notification.reason}` : ""}
            </div>
          ) : null}

          <button className="admin-submit-button" type="submit" disabled={isSubmitting}>
            {isSubmitting ? <Loader2 className="loading-icon" aria-hidden="true" /> : <Plus aria-hidden="true" />}
            Créer le client
          </button>
        </section>
      </form>
      ) : null}
    </main>
  );
}
