import { BarChart3, FilePenLine, LifeBuoy, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActionCard } from "./components/ActionCard";
import { AuthCallbackPage } from "./components/AuthCallbackPage";
import { AuthConfirmPage } from "./components/AuthConfirmPage";
import { ErrorState } from "./components/ErrorState";
import { Header } from "./components/Header";
import { JotformModal } from "./components/JotformModal";
import { LatestActions } from "./components/LatestActions";
import { LoadingState } from "./components/LoadingState";
import { LoginPage } from "./components/LoginPage";
import { Resources } from "./components/Resources";
import { ServicesActive } from "./components/ServicesActive";
import { Sidebar } from "./components/Sidebar";
import { ApiError, getMe } from "./lib/api";
import { getSupabaseClient, hasSupabaseConfig } from "./lib/supabase";
import { buildPrefilledJotformUrl, isExternalUrl, prefillFromClient } from "./lib/url";
import type { Client, MeResponse } from "./types/client";

type LoadState =
  | { status: "loading" }
  | { status: "anonymous" }
  | { status: "ready"; data: MeResponse }
  | { status: "error"; error: unknown };

type ModalState = {
  title: string;
  url: string;
} | null;

function buildSafeJotformUrl(url: string, client: Client, email: string): string {
  try {
    return buildPrefilledJotformUrl(url, prefillFromClient(client, email));
  } catch {
    return url;
  }
}

export function App() {
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [modal, setModal] = useState<ModalState>(null);
  const isAuthCallback = window.location.pathname === "/auth/callback";
  const isAuthConfirm = window.location.pathname === "/auth/confirm";

  useEffect(() => {
    if (isAuthCallback || isAuthConfirm) {
      return;
    }

    let isMounted = true;
    const supabase = getSupabaseClient();

    async function loadMe() {
      setState({ status: "loading" });

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

        setState({ status: "error", error });
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
  }, [isAuthCallback, isAuthConfirm]);

  useEffect(() => {
    if (state.status === "ready" && window.location.pathname === "/login") {
      window.history.replaceState({}, "", "/");
    }
  }, [state.status]);

  async function handleLogout() {
    const supabase = getSupabaseClient();

    if (supabase) {
      await supabase.auth.signOut();
    }

    setState({ status: "anonymous" });
  }

  const mailto = useMemo(() => {
    if (state.status !== "ready") return "#";

    const { client } = state.data;
    const subject = encodeURIComponent(`Espace client FluxPerf - ${client.companyName}`);

    return `mailto:${client.fluxperfContact.email}?subject=${subject}`;
  }, [state]);

  if (isAuthCallback) {
    return <AuthCallbackPage />;
  }

  if (isAuthConfirm) {
    return <AuthConfirmPage />;
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
  const requestUrl = client.links.request
    ? buildSafeJotformUrl(client.links.request, client, user.email)
    : null;
  const supportUrl = client.links.support
    ? buildSafeJotformUrl(client.links.support, client, user.email)
    : null;
  const reportUrl = client.links.report;

  return (
    <>
      <Sidebar onLogout={handleLogout} />
      <main className="app-shell">
        <Header client={client} email={user.email} />

        <section className="trust-strip" aria-label="Garanties FluxPerf">
          <span>
            <ShieldCheck aria-hidden="true" />
            Connexion securisee
          </span>
          <span>Production en France</span>
          <span>Donnees client filtrees cote serveur</span>
        </section>

        <section className="dashboard-section" id="demandes">
          <div className="section-heading section-heading-row">
            <div>
              <span className="section-kicker">Actions rapides</span>
              <h2>Les acces essentiels de votre accompagnement.</h2>
            </div>
          </div>

          <div className="action-grid">
            <ActionCard
              title="Faire une demande"
              description="Transmettez une nouvelle demande a l'equipe FluxPerf."
              disabled={!requestUrl}
              disabledText="Le formulaire de demande n'est pas encore relie a votre espace."
              icon={FilePenLine}
              tone="primary"
              actionLabel="Ouvrir"
              onAction={() =>
                requestUrl ? setModal({ title: "Faire une demande", url: requestUrl }) : undefined
              }
            />
            <ActionCard
              title="Support"
              description="Besoin d'aide ? Contactez notre equipe support."
              disabled={!supportUrl}
              disabledText="Le formulaire support n'est pas encore relie a votre espace."
              icon={LifeBuoy}
              actionLabel="Contacter"
              onAction={() =>
                supportUrl ? setModal({ title: "Contacter le support", url: supportUrl }) : undefined
              }
            />
            <ActionCard
              title="Voir mon rapport"
              description="Consultez vos derniers rapports et indicateurs."
              disabled={!reportUrl}
              disabledText="Votre rapport n'est pas encore disponible. Il apparaitra ici des sa publication."
              icon={BarChart3}
              tone="yellow"
              actionLabel="Consulter"
              onAction={() => {
                if (reportUrl) window.open(reportUrl, "_blank", "noopener,noreferrer");
              }}
            />
            <ActionCard
              title="Contacter FluxPerf"
              description={`Echangez directement avec ${client.fluxperfContact.name}.`}
              icon={Mail}
              actionLabel="Ecrire"
              onAction={() => {
                window.location.href = mailto;
              }}
              footer={<span>{client.fluxperfContact.email}</span>}
            />
          </div>
        </section>

        <div className="dashboard-two-columns">
          <section className="dashboard-section compact-section" id="rapports">
            <div className="section-heading">
              <span className="section-kicker">Rapports</span>
              <h2>Votre suivi de performance.</h2>
            </div>
            {reportUrl ? (
              <a
                className="report-panel"
                href={reportUrl}
                target={isExternalUrl(reportUrl) ? "_blank" : undefined}
                rel={isExternalUrl(reportUrl) ? "noreferrer" : undefined}
              >
                <BarChart3 aria-hidden="true" />
                <div>
                  <strong>Rapport disponible</strong>
                  <p>Ouvrir vos derniers indicateurs FluxPerf.</p>
                </div>
              </a>
            ) : (
              <div className="empty-state">
                <BarChart3 aria-hidden="true" />
                <p>Votre rapport n'est pas encore disponible. Il apparaitra ici des sa publication.</p>
              </div>
            )}
          </section>

          <LatestActions actions={client.latestActions} />
        </div>

        <ServicesActive services={client.services} />

        <Resources resourcesUrl={client.links.resources} />

        <section className="support-band" id="support">
          <div>
            <span className="section-kicker">Support FluxPerf</span>
            <h2>Une question specifique ?</h2>
            <p>Notre equipe reste disponible pour echanger sur votre projet et vos demandes.</p>
          </div>
          <button
            type="button"
            onClick={() =>
              supportUrl
                ? setModal({ title: "Contacter le support", url: supportUrl })
                : (window.location.href = mailto)
            }
          >
            <MessageCircle aria-hidden="true" />
            Contacter l'equipe
          </button>
        </section>
      </main>

      <JotformModal
        title={modal?.title ?? ""}
        url={modal?.url ?? null}
        isOpen={Boolean(modal)}
        onClose={() => setModal(null)}
      />
    </>
  );
}
