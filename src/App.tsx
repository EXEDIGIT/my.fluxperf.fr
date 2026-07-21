import { FilePenLine, Layers3, MessageCircle, ShieldCheck, Sparkles, TimerReset } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { ActionCard } from "./components/ActionCard";
import { AdminConsolePage } from "./components/AdminConsolePage";
import { AuthCallbackPage } from "./components/AuthCallbackPage";
import { AuthConfirmPage } from "./components/AuthConfirmPage";
import { ErrorState } from "./components/ErrorState";
import { Header } from "./components/Header";
import { ImpactPanel } from "./components/ImpactPanel";
import { InterventionRequestModal } from "./components/InterventionRequestModal";
import { LatestActions } from "./components/LatestActions";
import { LoadingState } from "./components/LoadingState";
import { LoginPage } from "./components/LoginPage";
import { Resources } from "./components/Resources";
import { ServicesActive } from "./components/ServicesActive";
import { Sidebar } from "./components/Sidebar";
import { SolutionsModal } from "./components/SolutionsModal";
import { SupportRequestModal } from "./components/SupportRequestModal";
import { ApiError, getMe } from "./lib/api";
import { getSupabaseClient, hasSupabaseConfig } from "./lib/supabase";
import type { MeResponse } from "./types/client";

const StatisticsPage = lazy(() =>
  import("./components/StatisticsPage").then((module) => ({ default: module.StatisticsPage }))
);

type LoadState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready"; data: MeResponse }
  | { status: "error"; error: unknown };

type SupportPreset = {
  key: number;
  subject: string;
  message: string;
};

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [isRequestOpen, setIsRequestOpen] = useState(false);
  const [isSupportOpen, setIsSupportOpen] = useState(false);
  const [isSolutionsOpen, setIsSolutionsOpen] = useState(false);
  const [statisticsSolutionId, setStatisticsSolutionId] = useState<string | null>(null);
  const [navigationTarget, setNavigationTarget] = useState<string | null>(null);
  const [supportPreset, setSupportPreset] = useState<SupportPreset>({
    key: 0,
    subject: "",
    message: ""
  });
  const isAuthCallback = window.location.pathname === "/auth/callback";
  const isAuthConfirm = window.location.pathname === "/auth/confirm";
  const isAdminConsole = window.location.pathname === "/fp-console";

  useEffect(() => {
    if (isAuthCallback || isAuthConfirm || isAdminConsole) {
      return;
    }

    let isMounted = true;
    const supabase = getSupabaseClient();

    async function loadMe() {
      setState((current) => (current.status === "ready" ? current : { status: "loading" }));

      try {
        const data = await getMe();

        if (isMounted) {
          setState({ status: "ready", data });
        }
      } catch (error) {
        if (!isMounted) {
          return;
        }

        if (hasSupabaseConfig() && error instanceof ApiError && error.status === 401) {
          setState({ status: "anonymous" });
          return;
        }

        setState((current) => (current.status === "ready" ? current : { status: "error", error }));
      }
    }

    async function bootstrap() {
      if (!supabase) {
        await loadMe();
        return;
      }

      const { data } = await supabase.auth.getSession();

      if (!isMounted) {
        return;
      }

      if (!data.session) {
        setState({ status: "anonymous" });
        return;
      }

      await loadMe();
    }

    void bootstrap();

    const listener = supabase?.auth.onAuthStateChange((_event, session) => {
      if (!isMounted) {
        return;
      }

      if (!session) {
        setState({ status: "anonymous" });
        return;
      }

      void loadMe();
    });

    return () => {
      isMounted = false;
      listener?.data.subscription.unsubscribe();
    };
  }, [isAuthCallback, isAuthConfirm, isAdminConsole]);

  useEffect(() => {
    if (state.status === "ready" && window.location.pathname === "/login") {
      window.history.replaceState({}, "", "/");
    }
  }, [state.status]);

  useEffect(() => {
    if (statisticsSolutionId || !navigationTarget || state.status !== "ready") {
      return;
    }

    const target = document.querySelector<HTMLElement>(navigationTarget);

    if (!target) {
      setNavigationTarget(null);
      return;
    }

    window.history.replaceState({}, "", navigationTarget);
    target.scrollIntoView({ behavior: "smooth", block: "start" });
    setNavigationTarget(null);
  }, [navigationTarget, state.status, statisticsSolutionId]);

  async function handleLogout() {
    const supabase = getSupabaseClient();

    if (supabase) {
      await supabase.auth.signOut();
    }

    setState({ status: "anonymous" });
    setStatisticsSolutionId(null);
  }

  function openSupportRequest(preset?: Partial<Omit<SupportPreset, "key">>) {
    setSupportPreset((current) => ({
      key: current.key + 1,
      subject: preset?.subject ?? "",
      message: preset?.message ?? ""
    }));
    setIsSupportOpen(true);
  }

  function openActivationRequest() {
    setIsSolutionsOpen(false);
    openSupportRequest({
      subject: "Activation d'une solution Fluxperf",
      message:
        "Bonjour,\n\nJe souhaite en savoir plus et activer une nouvelle solution Fluxperf pour mon espace client.\n\nMerci."
    });
  }

  function scrollToImpacts() {
    document.getElementById("impacts")?.scrollIntoView({ behavior: "smooth" });
  }

  function navigateToSection(href: string) {
    setStatisticsSolutionId(null);
    setNavigationTarget(href);
  }

  if (isAuthCallback) {
    return <AuthCallbackPage />;
  }

  if (isAuthConfirm) {
    return <AuthConfirmPage />;
  }

  if (isAdminConsole) {
    return <AdminConsolePage />;
  }

  if (state.status === "anonymous") {
    return <LoginPage />;
  }

  if (state.status === "loading") {
    return <LoadingState />;
  }

  if (state.status === "error") {
    return <ErrorState error={state.error} />;
  }

  const { client, user } = state.data;
  const selectedStatisticsSolution = statisticsSolutionId
    ? client.solutions.find((solution) => solution.id === statisticsSolutionId) ?? null
    : null;

  return (
    <>
      <Sidebar onLogout={handleLogout} onNavigate={navigateToSection} />
      <main className="app-shell" id="accueil">
        <Header client={client} email={user.email} />

        <section className="trust-strip" aria-label="Garanties Fluxperf">
          <span>
            <ShieldCheck aria-hidden="true" />
            Connexion sécurisée
          </span>
          <span>
            <span className="flag-fr" aria-hidden="true"></span>
            Production en France
          </span>
          <span>Données client filtrées côté serveur</span>
        </section>

        {selectedStatisticsSolution ? (
          <Suspense
            fallback={
              <div className="statistics-loading">
                <strong>Chargement des statistiques</strong>
              </div>
            }
          >
            <StatisticsPage
              solution={selectedStatisticsSolution}
              onBack={() => setStatisticsSolutionId(null)}
            />
          </Suspense>
        ) : (
          <>
        <section className="dashboard-section" id="demandes">
          <div className="section-heading section-heading-row">
            <div>
              <span className="section-kicker">Actions rapides</span>
              <h2>Les accès essentiels de votre accompagnement.</h2>
            </div>
          </div>

          <div className="action-grid">
            <ActionCard
              title="Demande d'intervention"
              description="Transmettez une nouvelle demande d'intervention à l'équipe Fluxperf."
              icon={FilePenLine}
              tone="primary"
              actionLabel="Demander"
              onAction={() => setIsRequestOpen(true)}
            />
            <ActionCard
              title="Temps libéré"
              description="Visualisez le temps que Fluxperf vous aide à récupérer chaque mois."
              icon={TimerReset}
              tone="yellow"
              actionLabel="Voir"
              onAction={scrollToImpacts}
            />
            <ActionCard
              title="Services actifs"
              description="Retrouvez les services Fluxperf® actuellement actifs sur votre espace client."
              icon={Layers3}
              actionLabel="Voir mes services"
              onAction={() => navigateToSection("#services-actifs")}
            />
            <ActionCard
              title="Solutions Fluxperf"
              description="Échangez directement avec Fluxperf. Découvrez et activez une nouvelle solution Fluxperf."
              icon={Sparkles}
              actionLabel="En savoir plus"
              onAction={() => setIsSolutionsOpen(true)}
            />
          </div>
        </section>

        <div className="dashboard-two-columns">
          <section className="dashboard-section compact-section" id="impacts">
            <div className="section-heading impact-heading">
              <div>
                <span className="section-kicker">TEMPS LIBÉRÉ</span>
                <h2>Votre temps libéré</h2>
                <p className="section-subtitle">
                  Le temps récupéré grâce aux actions prises en charge par Fluxperf®.
                </p>
              </div>
              <span className="impact-live-badge" aria-label="Suivi actif en ce moment">
                <span className="impact-live-dot" aria-hidden="true"></span>
                En ce moment
              </span>
            </div>
            <ImpactPanel impact={client.impact} />
          </section>

          <LatestActions actions={client.latestActions} />
        </div>

        <ServicesActive
          services={client.services}
          solutions={client.solutions}
          onOpenStatistics={(solution) => setStatisticsSolutionId(solution.id)}
          onSupportRequest={() =>
            openSupportRequest({
              subject: "Question sur mes services Fluxperf",
              message:
                "Bonjour,\n\nJe souhaite vous contacter au sujet des services Fluxperf actuellement recensés dans mon espace client.\n\nMerci."
            })
          }
        />

        <Resources resourcesUrl={client.links.resources} />

        <section className="support-band" id="support">
          <div>
            <span className="section-kicker">Support Fluxperf</span>
            <h2>Une question spécifique ?</h2>
            <p>Notre équipe reste disponible pour échanger sur votre projet et vos demandes.</p>
          </div>
          <button
            type="button"
            onClick={() => openSupportRequest()}
          >
            <MessageCircle aria-hidden="true" />
            Contacter l'équipe
          </button>
        </section>
          </>
        )}
      </main>

      <InterventionRequestModal
        client={client}
        email={user.email}
        isOpen={isRequestOpen}
        onSupportRequest={(preset) => {
          setIsRequestOpen(false);
          openSupportRequest(preset);
        }}
        onClose={() => setIsRequestOpen(false)}
      />

      <SupportRequestModal
        client={client}
        email={user.email}
        isOpen={isSupportOpen}
        initialSubject={supportPreset.subject}
        initialMessage={supportPreset.message}
        resetKey={supportPreset.key}
        onClose={() => setIsSupportOpen(false)}
      />

      <SolutionsModal
        isOpen={isSolutionsOpen}
        onClose={() => setIsSolutionsOpen(false)}
        onActivationRequest={openActivationRequest}
      />
    </>
  );
}
