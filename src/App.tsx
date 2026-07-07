import { BarChart3, FilePenLine, LifeBuoy, Mail, MessageCircle, ShieldCheck } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { ActionCard } from "./components/ActionCard";
import { ErrorState } from "./components/ErrorState";
import { Header } from "./components/Header";
import { JotformModal } from "./components/JotformModal";
import { LatestActions } from "./components/LatestActions";
import { LoadingState } from "./components/LoadingState";
import { Resources } from "./components/Resources";
import { ServicesActive } from "./components/ServicesActive";
import { Sidebar } from "./components/Sidebar";
import { getMe } from "./lib/api";
import { buildPrefilledJotformUrl, isExternalUrl, prefillFromClient } from "./lib/url";
import type { Client, MeResponse } from "./types/client";

type LoadState =
  | { status: "loading" }
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

  useEffect(() => {
    let isMounted = true;

    getMe()
      .then((data) => {
        if (isMounted) {
          setState({ status: "ready", data });
        }
      })
      .catch((error) => {
        if (isMounted) {
          setState({ status: "error", error });
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  const mailto = useMemo(() => {
    if (state.status !== "ready") return "#";

    const { client } = state.data;
    const subject = encodeURIComponent(`Espace client FluxPerf - ${client.companyName}`);

    return `mailto:${client.fluxperfContact.email}?subject=${subject}`;
  }, [state]);

  if (state.status === "loading") {
    return <LoadingState />;
  }

  if (state.status === "error") {
    return <ErrorState error={state.error} />;
  }

  const { client, user, meta } = state.data;
  const requestUrl = client.links.request
    ? buildSafeJotformUrl(client.links.request, client, user.email)
    : null;
  const supportUrl = client.links.support
    ? buildSafeJotformUrl(client.links.support, client, user.email)
    : null;
  const reportUrl = client.links.report;

  return (
    <>
      <Sidebar logoutUrl={meta?.logoutUrl} />
      <main className="app-shell">
        <Header client={client} email={user.email} />

        <section className="trust-strip" aria-label="Garanties FluxPerf">
          <span>
            <ShieldCheck aria-hidden="true" />
            Cloudflare Access
          </span>
          <span>Production en France</span>
          <span>Données client filtrées côté serveur</span>
        </section>

        <section className="dashboard-section" id="demandes">
          <div className="section-heading section-heading-row">
            <div>
              <span className="section-kicker">Actions rapides</span>
              <h2>Les accès essentiels de votre accompagnement.</h2>
            </div>
          </div>

          <div className="action-grid">
            <ActionCard
              title="Faire une demande"
              description="Transmettez une nouvelle demande à l'équipe FluxPerf."
              disabled={!requestUrl}
              disabledText="Le formulaire de demande n'est pas encore relié à votre espace."
              icon={FilePenLine}
              tone="primary"
              actionLabel="Ouvrir"
              onAction={() =>
                requestUrl ? setModal({ title: "Faire une demande", url: requestUrl }) : undefined
              }
            />
            <ActionCard
              title="Support"
              description="Besoin d'aide ? Contactez notre équipe support."
              disabled={!supportUrl}
              disabledText="Le formulaire support n'est pas encore relié à votre espace."
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
              disabledText="Votre rapport n'est pas encore disponible. Il apparaîtra ici dès sa publication."
              icon={BarChart3}
              tone="yellow"
              actionLabel="Consulter"
              onAction={() => {
                if (reportUrl) window.open(reportUrl, "_blank", "noopener,noreferrer");
              }}
            />
            <ActionCard
              title="Contacter FluxPerf"
              description={`Échangez directement avec ${client.fluxperfContact.name}.`}
              icon={Mail}
              actionLabel="Écrire"
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
                <p>Votre rapport n'est pas encore disponible. Il apparaîtra ici dès sa publication.</p>
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
            <h2>Une question spécifique ?</h2>
            <p>Notre équipe reste disponible pour échanger sur votre projet et vos demandes.</p>
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
            Contacter l'équipe
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

