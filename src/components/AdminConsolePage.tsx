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
  RotateCcw,
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
  checkAdminClientQuality,
  createAdminClient,
  deactivateAdminClient,
  deactivateAdminClientSolution,
  getAdminClient,
  getAdminClients,
  getAdminDashboard,
  getAdminOptions,
  getAdminSession,
  reactivateAdminClient,
  sendAdminClientWelcomeEmail,
  reactivateAdminClientSolution
} from "../lib/adminApi";
import { getSupabaseClient, hasSupabaseConfig } from "../lib/supabase";
import type {
  AdminClientDetail,
  AdminClientQualityWarning,
  AdminClientSummary,
  AdminCreateClientInput,
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
  ga4PropertyId: string;
  googleAdsCustomerId: string;
};

type SolutionDraftsByType = Record<AdminSolutionType, SolutionDraft[]>;

type AdminTab = "dashboard" | "clients" | "create";

const consolePath = "/fp-console";

const fallbackSolutionOptions: AdminSolutionOption[] = [
  {
    type: "visibility_acquisition",
    label: "Flux Visibilité & Acquisition",
    defaultName: "Site web",
    nameOptions: [
      "Site web",
      "Site e-shop",
      "Publicité Google Ads",
      "Réseaux sociaux"
    ]
  },
  {
    type: "automation_ai",
    label: "Flux Automatisation & IA",
    defaultName: "Tableau de bord",
    nameOptions: [
      "Tableau de bord",
      "Synchronisation de données"
    ]
  },
  {
    type: "assistant_ai",
    label: "Flux Assistant IA",
    defaultName: "Copilote entreprise",
    nameOptions: ["Copilote entreprise"]
  }
];

function buildDraftId(type: AdminSolutionType): string {
  return `${type}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

function createSolutionDraft(option: AdminSolutionOption): SolutionDraft {
  return {
    id: buildDraftId(option.type),
    name: option.defaultName,
    urlOrIndication: "",
    ga4PropertyId: "",
    googleAdsCustomerId: ""
  };
}

function normalizedSolutionName(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[_-]+/g, " ");
}

function isWebsiteSolutionName(value: string): boolean {
  const normalized = normalizedSolutionName(value);

  return normalized.includes("site web") || normalized.includes("site e-shop") || normalized.includes("site eshop");
}

function isGoogleAdsSolutionName(value: string): boolean {
  const normalized = normalizedSolutionName(value);

  return normalized.includes("google ads") || normalized.includes("publicite google") || normalized === "ads";
}

function solutionStatusKind(status: string): "active" | "inactive" | "other" {
  const normalized = status
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  if (["actif", "active"].includes(normalized)) {
    return "active";
  }

  if (["inactif", "inactive"].includes(normalized)) {
    return "inactive";
  }

  return "other";
}

function adminDateTimestamp(value: string): number {
  const frenchDate = value.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);

  if (frenchDate) {
    const [, day, month, year] = frenchDate;

    return Date.UTC(Number(year), Number(month) - 1, Number(day));
  }

  const parsed = Date.parse(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function formatAdminDate(value: string, fallback = "Non renseignee"): string {
  const parsed = adminDateTimestamp(value);

  if (!parsed) {
    return value || fallback;
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "Europe/Paris"
  }).format(new Date(parsed));
}

function clientNeedsConnectionAttention(client: AdminClientSummary): boolean {
  const lastRelevantDate = adminDateTimestamp(client.lastConnectionAt || client.createdAt);

  return Boolean(lastRelevantDate && Date.now() - lastRelevantDate >= 60 * 24 * 60 * 60 * 1000);
}

function clientAccessIsActive(client: Pick<AdminClientSummary, "status" | "portalEnabled">): boolean {
  return client.portalEnabled && solutionStatusKind(client.status) === "active";
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
  const [clientStatusFilter, setClientStatusFilter] = useState<"all" | "active" | "inactive">("all");
  const [clientPortalFilter, setClientPortalFilter] = useState<"all" | "enabled" | "disabled">("all");
  const [clientSolutionFilter, setClientSolutionFilter] = useState("all");
  const [clientConnectionFilter, setClientConnectionFilter] = useState<"all" | "attention">("all");
  const [clientMessage, setClientMessage] = useState<string | null>(null);
  const [clientError, setClientError] = useState<string | null>(null);
  const [isAdminDataLoading, setIsAdminDataLoading] = useState(false);
  const [isClientActionPending, setIsClientActionPending] = useState(false);
  const [clientSolutionType, setClientSolutionType] = useState<AdminSolutionType>("visibility_acquisition");
  const [clientSolutionName, setClientSolutionName] = useState(fallbackSolutionOptions[0].defaultName);
  const [clientSolutionValue, setClientSolutionValue] = useState("");
  const [clientSolutionGa4PropertyId, setClientSolutionGa4PropertyId] = useState("");
  const [clientSolutionGoogleAdsCustomerId, setClientSolutionGoogleAdsCustomerId] = useState("");
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [creationWarnings, setCreationWarnings] = useState<AdminClientQualityWarning[]>([]);
  const [success, setSuccess] = useState<AdminCreateClientResponse | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const selectedSolutionOption =
    solutionOptions.find((option) => option.type === clientSolutionType) ?? solutionOptions[0] ?? fallbackSolutionOptions[0];
  const filteredAdminClients = useMemo(() => {
    const query = clientQuery.trim().toLowerCase();

    if (!query) {
      return adminClients;
    }

    return adminClients.filter((client) => {
      const matchesQuery = !query || [client.companyName, client.email, client.contactName, client.id]
        .join(" ")
        .toLowerCase()
        .includes(query);
      const isActive = clientAccessIsActive(client);
      const matchesStatus = clientStatusFilter === "all" || (clientStatusFilter === "active" ? isActive : !isActive);
      const matchesPortal =
        clientPortalFilter === "all" ||
        (clientPortalFilter === "enabled" ? client.portalEnabled : !client.portalEnabled);
      const matchesSolution =
        clientSolutionFilter === "all" ||
        client.activeSolutionTypes.some((type) => normalizedSolutionName(type) === normalizedSolutionName(clientSolutionFilter));
      const matchesConnection = clientConnectionFilter === "all" || clientNeedsConnectionAttention(client);

      return matchesQuery && matchesStatus && matchesPortal && matchesSolution && matchesConnection;
    });
  }, [adminClients, clientConnectionFilter, clientPortalFilter, clientQuery, clientSolutionFilter, clientStatusFilter]);

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

  function openClientFromDashboard(clientId: string) {
    setActiveTab("clients");
    void openClient(clientId);
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
          ? "Client desactive. La mise a jour de son acces reste a verifier."
          : "Client desactive."
      );
      await refreshAdminData(client.id);
    } catch (error) {
      setClientError(error instanceof ApiError ? error.message : "Le client n'a pas pu etre desactive.");
    } finally {
      setIsClientActionPending(false);
    }
  }

  async function handleReactivateClient(client: AdminClientDetail) {
    if (!window.confirm(`Reactiver l'acces MyFluxperf de ${client.companyName} ?`)) {
      return;
    }

    setClientError(null);
    setClientMessage(null);
    setIsClientActionPending(true);

    try {
      const result = await reactivateAdminClient(client.id);

      setClientMessage(
        result.auth?.status === "failed"
          ? "Client reactive. La mise a jour de son acces reste a verifier."
          : "Client reactive."
      );
      await refreshAdminData(client.id);
    } catch (error) {
      setClientError(error instanceof ApiError ? error.message : "Le client n'a pas pu etre reactive.");
    } finally {
      setIsClientActionPending(false);
    }
  }

  async function handleSendWelcomeEmail(client: AdminClientDetail) {
    if (!window.confirm(`Renvoyer l'email d'ouverture a ${client.email} ?`)) {
      return;
    }

    setClientError(null);
    setClientMessage(null);
    setIsClientActionPending(true);

    try {
      const result = await sendAdminClientWelcomeEmail(client.id);

      setClientMessage(
        result.status === "sent"
          ? `Email d'ouverture envoye a ${result.notification.email}.`
          : "L'email d'ouverture n'a pas ete envoye."
      );
      await refreshAdminData(client.id);
    } catch (error) {
      setClientError(error instanceof ApiError ? error.message : "L'email d'ouverture n'a pas pu etre envoye.");
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
      const name = clientSolutionName || selectedSolutionOption.defaultName;

      await addAdminClientSolution(selectedClient.id, {
        type: clientSolutionType,
        name,
        urlOrIndication: clientSolutionValue,
        ga4PropertyId: isWebsiteSolutionName(name) ? clientSolutionGa4PropertyId : "",
        googleAdsCustomerId: isGoogleAdsSolutionName(name) ? clientSolutionGoogleAdsCustomerId : ""
      });
      setClientSolutionValue("");
      setClientSolutionGa4PropertyId("");
      setClientSolutionGoogleAdsCustomerId("");
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

  async function handleReactivateSolution(solutionId: string) {
    if (!selectedClient) {
      return;
    }

    setClientError(null);
    setClientMessage(null);
    setIsClientActionPending(true);

    try {
      await reactivateAdminClientSolution(selectedClient.id, solutionId);
      setClientMessage("Solution réactivée.");
      await refreshAdminData(selectedClient.id);
    } catch (error) {
      setClientError(error instanceof ApiError ? error.message : "La solution n'a pas pu être réactivée.");
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
    setCreationWarnings([]);
  }

  async function handleLogout() {
    const supabase = getSupabaseClient();

    await supabase?.auth.signOut();
    setLoadState({ status: "anonymous" });
  }

  function buildNewClientInput(): AdminCreateClientInput | null {
    const selectedSolutions = solutionOptions.flatMap((option) =>
      (solutions[option.type] ?? []).map(({ name, urlOrIndication, ga4PropertyId, googleAdsCustomerId }) => ({
        type: option.type,
        name,
        urlOrIndication,
        ga4PropertyId: isWebsiteSolutionName(name) ? ga4PropertyId : "",
        googleAdsCustomerId: isGoogleAdsSolutionName(name) ? googleAdsCustomerId : ""
      }))
    );

    if (selectedSolutions.length === 0) {
      return null;
    }

    return {
      companyName,
      contactFirstName,
      contactLastName,
      email,
      notes,
      notifyClient,
      solutions: selectedSolutions
    };
  }

  async function submitNewClient(input: AdminCreateClientInput, confirmWarnings = false) {
    const result = await createAdminClient({ ...input, confirmWarnings });

    setSuccess(result);
    resetForm();
    await refreshAdminData();
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitError(null);
    setSuccess(null);
    setCreationWarnings([]);

    const input = buildNewClientInput();

    if (!input) {
      setSubmitError("Sélectionnez au moins une solution.");
      return;
    }

    setIsSubmitting(true);

    try {
      const quality = await checkAdminClientQuality(input);

      if (quality.warnings.length > 0) {
        setCreationWarnings(quality.warnings);
        return;
      }

      await submitNewClient(input);
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

  async function handleConfirmWarnings() {
    const input = buildNewClientInput();

    if (!input) {
      setSubmitError("Sélectionnez au moins une solution.");
      return;
    }

    setSubmitError(null);
    setIsSubmitting(true);

    try {
      await submitNewClient(input, true);
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

          <section className="admin-form-panel admin-to-process">
            <div className="admin-panel-heading">
              <ShieldCheck aria-hidden="true" />
              <div>
                <h2>À traiter</h2>
                <p>Demandes récentes et accès clients à surveiller.</p>
              </div>
            </div>
            <div className="admin-to-process-grid">
              <div className="admin-to-process-column">
                <div className="admin-to-process-title">
                  <h3>Demandes d'intervention</h3>
                  <strong>{dashboard?.toProcess.recentInterventionRequests.length ?? 0}</strong>
                </div>
                {(dashboard?.toProcess.recentInterventionRequests ?? []).length > 0 ? (
                  <div className="admin-to-process-list">
                    {(dashboard?.toProcess.recentInterventionRequests ?? []).map((request) => (
                      <button type="button" key={request.id} onClick={() => openClientFromDashboard(request.clientId)}>
                        <span>
                          <strong>{request.companyName}</strong>
                          <small>{request.label}{request.reference ? ` - ${request.reference}` : ""}</small>
                        </span>
                        <time dateTime={request.date}>{formatAdminDate(request.date)}</time>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="admin-empty-copy">Aucune demande reçue ces 7 derniers jours.</p>
                )}
              </div>
              <div className="admin-to-process-column">
                <div className="admin-to-process-title">
                  <h3>Connexions à relancer</h3>
                  <strong>{dashboard?.toProcess.clientsWithoutRecentConnection.length ?? 0}</strong>
                </div>
                {(dashboard?.toProcess.clientsWithoutRecentConnection ?? []).length > 0 ? (
                  <div className="admin-to-process-list">
                    {(dashboard?.toProcess.clientsWithoutRecentConnection ?? []).map((client) => (
                      <button type="button" key={client.clientId} onClick={() => openClientFromDashboard(client.clientId)}>
                        <span>
                          <strong>{client.companyName}</strong>
                          <small>{client.reason}</small>
                        </span>
                        <time dateTime={client.lastConnectionAt || client.createdAt}>
                          {client.lastConnectionAt ? formatAdminDate(client.lastConnectionAt) : "Jamais"}
                        </time>
                      </button>
                    ))}
                  </div>
                ) : (
                  <p className="admin-empty-copy">Aucun client actif sans connexion depuis 60 jours.</p>
                )}
              </div>
            </div>
          </section>

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
            <div className="admin-client-filters" aria-label="Filtres clients">
              <label>
                Statut
                <select value={clientStatusFilter} onChange={(event) => setClientStatusFilter(event.target.value as typeof clientStatusFilter)}>
                  <option value="all">Tous</option>
                  <option value="active">Actifs</option>
                  <option value="inactive">Inactifs</option>
                </select>
              </label>
              <label>
                Accès portail
                <select value={clientPortalFilter} onChange={(event) => setClientPortalFilter(event.target.value as typeof clientPortalFilter)}>
                  <option value="all">Tous</option>
                  <option value="enabled">Actif</option>
                  <option value="disabled">Désactivé</option>
                </select>
              </label>
              <label>
                Solution active
                <select value={clientSolutionFilter} onChange={(event) => setClientSolutionFilter(event.target.value)}>
                  <option value="all">Toutes</option>
                  {solutionOptions.map((option) => (
                    <option key={option.type} value={option.label}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Connexion
                <select value={clientConnectionFilter} onChange={(event) => setClientConnectionFilter(event.target.value as typeof clientConnectionFilter)}>
                  <option value="all">Toutes</option>
                  <option value="attention">Sans connexion depuis 60 jours</option>
                </select>
              </label>
            </div>
            <div className="admin-client-list">
              {filteredAdminClients.map((client) => (
                <button type="button" className={selectedClient?.id === client.id ? "is-selected" : ""} key={client.id} onClick={() => openClient(client.id)}>
                  <span>
                    <strong>{client.companyName}</strong>
                    <small>{client.email}</small>
                  </span>
                  <span>{client.activeSolutions} solution{client.activeSolutions > 1 ? "s" : ""}</span>
                  <em className={clientAccessIsActive(client) ? "is-active" : "is-inactive"}>{clientAccessIsActive(client) ? "Actif" : "Inactif"}</em>
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
                <span>Dernière connexion : <strong>{formatAdminDate(selectedClient.lastConnectionAt, "Jamais")}</strong></span>
              </div>

              <div className="admin-detail-actions">
                {clientAccessIsActive(selectedClient) ? (
                  <>
                    <button type="button" disabled={isClientActionPending} onClick={() => handleDeactivateClient(selectedClient)}>
                      <Ban aria-hidden="true" />
                      Désactiver le client
                    </button>
                    <button type="button" disabled={isClientActionPending} onClick={() => handleSendWelcomeEmail(selectedClient)}>
                      <Mail aria-hidden="true" />
                      Renvoyer l'email
                    </button>
                  </>
                ) : (
                  <button type="button" disabled={isClientActionPending} onClick={() => handleReactivateClient(selectedClient)}>
                    <RotateCcw aria-hidden="true" />
                    Réactiver le client
                  </button>
                )}
              </div>

              <div className="admin-detail-sections">
                <section className="admin-detail-section">
                  <h3>Contacts</h3>
                  {selectedClient.contacts.length > 0 ? (
                    <div className="admin-contact-list">
                      {selectedClient.contacts.map((contact) => (
                        <div key={contact.id || contact.email}>
                          <span>
                            <strong>{[contact.firstName, contact.lastName].filter(Boolean).join(" ") || contact.email}</strong>
                            <small>{contact.email}</small>
                          </span>
                          <em>{contact.isPrimary ? "Principal" : contact.role || contact.status}</em>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="admin-empty-copy">Aucun contact enregistré.</p>
                  )}
                </section>
                <section className="admin-detail-section">
                  <h3>Notes internes</h3>
                  <p className={selectedClient.notes ? "admin-notes" : "admin-empty-copy"}>
                    {selectedClient.notes || "Aucune note interne."}
                  </p>
                </section>
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
                    setClientSolutionGa4PropertyId("");
                    setClientSolutionGoogleAdsCustomerId("");
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
                {isWebsiteSolutionName(clientSolutionName) ? (
                  <input
                    value={clientSolutionGa4PropertyId}
                    inputMode="numeric"
                    placeholder="ID propriete GA4"
                    onChange={(event) => setClientSolutionGa4PropertyId(event.target.value)}
                  />
                ) : null}
                {isGoogleAdsSolutionName(clientSolutionName) ? (
                  <input
                    value={clientSolutionGoogleAdsCustomerId}
                    inputMode="numeric"
                    placeholder="ID client Google Ads (123-456-7890)"
                    onChange={(event) => setClientSolutionGoogleAdsCustomerId(event.target.value)}
                  />
                ) : null}
                <button type="submit" disabled={isClientActionPending}>
                  <Plus aria-hidden="true" />
                  Ajouter
                </button>
              </form>

              <div className="admin-solution-list">
                {selectedClient.solutions.map((solution) => {
                  const statusKind = solutionStatusKind(solution.status);

                  return (
                    <article key={solution.id}>
                      <span>
                        <strong>{solution.name || solution.type}</strong>
                        <small>
                          {[
                            solution.domain || solution.urlOrIndication || "Sans indication",
                            solution.ga4PropertyId ? `GA4 ${solution.ga4PropertyId}` : "",
                            solution.googleAdsCustomerId ? `Google Ads ${solution.googleAdsCustomerId}` : ""
                          ]
                            .filter(Boolean)
                            .join(" - ")}
                        </small>
                      </span>
                      <em className={`is-${statusKind}`}>{solution.status}</em>
                      {statusKind === "active" ? (
                        <button type="button" disabled={isClientActionPending} onClick={() => handleDeactivateSolution(solution.id)}>
                          <Trash2 aria-hidden="true" />
                          Désactiver
                        </button>
                      ) : null}
                      {statusKind === "inactive" ? (
                        <button type="button" disabled={isClientActionPending} onClick={() => handleReactivateSolution(solution.id)}>
                          <RotateCcw aria-hidden="true" />
                          Réactiver
                        </button>
                      ) : null}
                    </article>
                  );
                })}
              </div>

              <section className="admin-detail-section admin-timeline-section">
                <div className="admin-section-title-row">
                  <h3>Activité récente</h3>
                  <span>{selectedClient.timeline.length} événement{selectedClient.timeline.length > 1 ? "s" : ""}</span>
                </div>
                {selectedClient.timeline.length > 0 ? (
                  <ol className="admin-timeline">
                    {selectedClient.timeline.map((event) => (
                      <li key={`${event.kind}-${event.id}`}>
                        <span className={`admin-timeline-marker is-${event.kind}`} aria-hidden="true" />
                        <div>
                          <strong>{event.label}</strong>
                          <small>
                            {[event.reference, event.details, event.source].filter(Boolean).join(" - ")}
                          </small>
                        </div>
                        <time dateTime={event.date}>{formatAdminDate(event.date)}</time>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <p className="admin-empty-copy">Aucune activité enregistrée pour ce client.</p>
                )}
              </section>
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
                      {isWebsiteSolutionName(draft.name) ? (
                        <label>
                          ID propriete GA4
                          <input
                            value={draft.ga4PropertyId}
                            inputMode="numeric"
                            placeholder="123456789"
                            onChange={(event) => updateSolution(option.type, draft.id, { ga4PropertyId: event.target.value })}
                          />
                        </label>
                      ) : null}
                      {isGoogleAdsSolutionName(draft.name) ? (
                        <label>
                          ID client Google Ads
                          <input
                            value={draft.googleAdsCustomerId}
                            inputMode="numeric"
                            placeholder="123-456-7890"
                            onChange={(event) => updateSolution(option.type, draft.id, { googleAdsCustomerId: event.target.value })}
                          />
                        </label>
                      ) : null}
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

          {creationWarnings.length > 0 ? (
            <div className="admin-quality-warning" role="alert">
              <div>
                <strong>Vérifiez ces avertissements avant de créer le client.</strong>
                <ul>
                  {creationWarnings.map((warning) => (
                    <li key={warning.code}>
                      <span>{warning.message}</span>
                      <small>{warning.matches.map((match) => `${match.companyName} (${match.clientId})`).join(", ")}</small>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="admin-quality-actions">
                <button type="button" onClick={() => setCreationWarnings([])} disabled={isSubmitting}>
                  Modifier
                </button>
                <button type="button" onClick={handleConfirmWarnings} disabled={isSubmitting}>
                  Créer malgré les avertissements
                </button>
              </div>
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
