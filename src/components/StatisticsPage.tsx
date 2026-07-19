import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Clock3,
  Globe2,
  Loader2,
  MapPin,
  MousePointerClick,
  Search,
  TrendingUp,
  Users
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ApiError,
  getStatistics,
  type StatisticsEventRow,
  type StatisticsPageRow,
  type StatisticsPeriodId,
  type StatisticsResponse,
  type StatisticsTrafficRow,
  type StatisticsValueRow
} from "../lib/api";
import type { ClientSolution } from "../types/client";

type StatisticsPageProps = {
  solution: ClientSolution;
  onBack: () => void;
};

type LoadState =
  | { status: "idle" | "loading" }
  | { status: "ready"; data: StatisticsResponse }
  | { status: "error"; message: string };

const periodOptions: Array<{ id: StatisticsPeriodId; label: string }> = [
  { id: "7d", label: "7 jours" },
  { id: "30d", label: "30 jours" },
  { id: "90d", label: "90 jours" },
  { id: "365d", label: "1 an" }
];

function formatNumber(value: number): string {
  return new Intl.NumberFormat("fr-FR").format(Math.round(value));
}

function formatDuration(seconds: number): string {
  const safeSeconds = Math.max(0, Math.round(seconds));
  const minutes = Math.floor(safeSeconds / 60);
  const remainingSeconds = safeSeconds % 60;

  if (minutes === 0) {
    return `${remainingSeconds}s`;
  }

  return `${minutes}min ${remainingSeconds.toString().padStart(2, "0")}s`;
}

function displayDate(value: string): string {
  const parsed = Date.parse(value);

  if (!Number.isFinite(parsed)) {
    return "";
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23"
  }).format(new Date(parsed));
}

function percentageLabel(value: number): string {
  return `${value.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}%`;
}

function BarRow({
  label,
  value,
  percentage,
  detail
}: {
  label: string;
  value: string;
  percentage: number;
  detail?: string;
}) {
  return (
    <div className="statistics-bar-row">
      <div>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </div>
      <span>{value}</span>
      <i aria-hidden="true">
        <b style={{ width: `${Math.min(100, Math.max(0, percentage))}%` }} />
      </i>
    </div>
  );
}

function EmptyList({ label }: { label: string }) {
  return (
    <div className="statistics-list-empty">
      <Search aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

function TrafficList({ rows }: { rows: StatisticsTrafficRow[] }) {
  if (rows.length === 0) {
    return <EmptyList label="Aucune donnee de trafic disponible sur cette periode." />;
  }

  return (
    <div className="statistics-list">
      {rows.map((row) => (
        <BarRow
          key={row.label}
          label={row.label}
          value={formatNumber(row.sessions)}
          percentage={row.percentage}
          detail={`${formatNumber(row.activeUsers)} visiteurs - ${formatDuration(row.averageVisitDurationSeconds)} moy.`}
        />
      ))}
    </div>
  );
}

function ValueList({ rows }: { rows: StatisticsValueRow[] }) {
  if (rows.length === 0) {
    return <EmptyList label="Aucune donnee disponible sur cette periode." />;
  }

  return (
    <div className="statistics-list">
      {rows.map((row) => (
        <BarRow
          key={row.label}
          label={row.label}
          value={formatNumber(row.value)}
          percentage={row.percentage}
          detail={percentageLabel(row.percentage)}
        />
      ))}
    </div>
  );
}

function PageList({ rows }: { rows: StatisticsPageRow[] }) {
  if (rows.length === 0) {
    return <EmptyList label="Aucune page consultee sur cette periode." />;
  }

  return (
    <div className="statistics-list">
      {rows.map((row) => (
        <BarRow
          key={row.label}
          label={row.label}
          value={formatNumber(row.views)}
          percentage={row.percentage}
          detail={`${percentageLabel(row.percentage)} - ${formatDuration(row.averageVisitDurationSeconds)} moy.`}
        />
      ))}
    </div>
  );
}

function EventList({ rows }: { rows: StatisticsEventRow[] }) {
  if (rows.length === 0) {
    return <EmptyList label="Aucun evenement utile a afficher sur cette periode." />;
  }

  return (
    <div className="statistics-list">
      {rows.map((row) => (
        <BarRow
          key={`${row.eventName}-${row.label}`}
          label={row.label}
          value={formatNumber(row.count)}
          percentage={row.percentage}
          detail={percentageLabel(row.percentage)}
        />
      ))}
    </div>
  );
}

export function StatisticsPage({ solution, onBack }: StatisticsPageProps) {
  const [period, setPeriod] = useState<StatisticsPeriodId>("30d");
  const [state, setState] = useState<LoadState>({ status: "idle" });
  const canFetchStatistics = solution.statistics.status === "available";
  const pendingResponse = useMemo<StatisticsResponse>(
    () => ({
      status: "pending_setup",
      period: {
        id: period,
        label: periodOptions.find((item) => item.id === period)?.label ?? "30 jours",
        startDate: "",
        endDate: ""
      },
      solution: {
        id: solution.id,
        name: solution.name || solution.typeLabel,
        domain: solution.domain
      }
    }),
    [period, solution]
  );

  useEffect(() => {
    let isCurrent = true;

    if (!canFetchStatistics) {
      setState({ status: "ready", data: pendingResponse });
      return () => {
        isCurrent = false;
      };
    }

    async function loadStatistics() {
      setState({ status: "loading" });

      try {
        const data = await getStatistics(solution.id, period);

        if (isCurrent) {
          setState({ status: "ready", data });
        }
      } catch (error) {
        if (isCurrent) {
          setState({
            status: "error",
            message:
              error instanceof ApiError
                ? error.message
                : "Les statistiques sont indisponibles pour le moment."
          });
        }
      }
    }

    void loadStatistics();

    return () => {
      isCurrent = false;
    };
  }, [canFetchStatistics, pendingResponse, period, solution.id]);

  const readyData = state.status === "ready" ? state.data : null;

  return (
    <section className="statistics-page">
      <div className="statistics-toolbar">
        <button type="button" className="secondary-link statistics-back" onClick={onBack}>
          <ArrowLeft aria-hidden="true" />
          Retour
        </button>
        <div>
          <span className="section-kicker">Statistiques</span>
          <h2>{solution.name || solution.typeLabel}</h2>
          <p>{solution.domain || solution.url}</p>
        </div>
        <div className="statistics-periods" aria-label="Periode statistiques">
          {periodOptions.map((option) => (
            <button
              type="button"
              className={option.id === period ? "is-active" : ""}
              key={option.id}
              onClick={() => setPeriod(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      {state.status === "loading" || state.status === "idle" ? (
        <div className="statistics-loading">
          <Loader2 className="loading-icon" aria-hidden="true" />
          <strong>Chargement des statistiques</strong>
        </div>
      ) : null}

      {state.status === "error" ? (
        <div className="statistics-empty-state" role="alert">
          <AlertCircle aria-hidden="true" />
          <h3>Statistiques indisponibles</h3>
          <p>{state.message}</p>
        </div>
      ) : null}

      {readyData?.status === "pending_setup" ? (
        <div className="statistics-empty-state">
          <BarChart3 aria-hidden="true" />
          <h3>Statistiques en cours de raccordement</h3>
          <p>
            Notre equipe termine le lien avec GA4 pour {readyData.solution.domain || "cette solution"}.
          </p>
        </div>
      ) : null}

      {readyData?.status === "ready" ? (
        <>
          <div className="statistics-meta">
            <span>{readyData.period.label}</span>
            <span>{displayDate(readyData.generatedAt) ? `Mis a jour le ${displayDate(readyData.generatedAt)}` : "Donnees GA4"}</span>
          </div>

          <div className="statistics-kpi-grid">
            <article>
              <Globe2 aria-hidden="true" />
              <span>Visites</span>
              <strong>{formatNumber(readyData.overview.visits)}</strong>
            </article>
            <article>
              <Users aria-hidden="true" />
              <span>Visiteurs uniques</span>
              <strong>{formatNumber(readyData.overview.uniqueVisitors)}</strong>
            </article>
            <article>
              <Clock3 aria-hidden="true" />
              <span>Duree moyenne</span>
              <strong>{formatDuration(readyData.overview.averageVisitDurationSeconds)}</strong>
            </article>
          </div>

          <div className="statistics-grid">
            <section className="statistics-panel">
              <div className="statistics-panel-heading">
                <MousePointerClick aria-hidden="true" />
                <div>
                  <h3>Evenements principaux</h3>
                  <p>Les actions utiles les plus declenchees.</p>
                </div>
              </div>
              <EventList rows={readyData.overview.topEvents} />
            </section>

            <section className="statistics-panel">
              <div className="statistics-panel-heading">
                <MapPin aria-hidden="true" />
                <div>
                  <h3>Provenance geographique</h3>
                  <p>Top pays et villes sur la periode.</p>
                </div>
              </div>
              <div className="statistics-split">
                <ValueList rows={readyData.overview.countries} />
                <ValueList rows={readyData.overview.cities} />
              </div>
            </section>
          </div>

          <section className="statistics-panel">
            <div className="statistics-panel-heading">
              <TrendingUp aria-hidden="true" />
              <div>
                <h3>Acquisition de trafic</h3>
                <p>Sources qui apportent les visites, avec duree moyenne par visite.</p>
              </div>
            </div>
            <div className="statistics-split">
              <TrafficList rows={readyData.acquisition.channels} />
              <TrafficList rows={readyData.acquisition.sources} />
            </div>
          </section>

          <section className="statistics-panel">
            <div className="statistics-panel-heading">
              <BarChart3 aria-hidden="true" />
              <div>
                <h3>Comportement utilisateurs</h3>
                <p>Pages les plus consultees et actions utiles declenchees.</p>
              </div>
            </div>
            <div className="statistics-split">
              <PageList rows={readyData.behavior.pages} />
              <EventList rows={readyData.behavior.events} />
            </div>
          </section>
        </>
      ) : null}
    </section>
  );
}
