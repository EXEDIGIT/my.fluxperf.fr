import {
  AlertCircle,
  ArrowLeft,
  BarChart3,
  Clock3,
  Globe2,
  Loader2,
  MapPin,
  Megaphone,
  MousePointerClick,
  Search,
  Target,
  TrendingUp,
  Users
} from "lucide-react";
import "flag-icons/css/flag-icons.min.css";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import {
  ApiError,
  getStatistics,
  type StatisticsEventRow,
  type StatisticsGoogleAdsBreakdownRow,
  type StatisticsGoogleAdsTimelinePoint,
  type StatisticsPageRow,
  type StatisticsPeriodId,
  type StatisticsResponse,
  type StatisticsTimelineGranularity,
  type StatisticsTimelinePoint,
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

function timelineDateLabel(date: string, granularity: StatisticsTimelineGranularity, long = false): string {
  const parsed = new Date(`${date}T00:00:00`);

  if (!Number.isFinite(parsed.getTime())) return date;

  if (granularity === "month") {
    return new Intl.DateTimeFormat("fr-FR", {
      month: long ? "long" : "short",
      year: "numeric"
    }).format(parsed);
  }

  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: long ? "long" : "short"
  }).format(parsed);
}

function pageDisplayLabel(label: string): string {
  return label === "/" ? "/ • Page d’accueil" : label;
}

function BarRow({
  label,
  description,
  value,
  percentage,
  detail,
  countryCode
}: {
  label: string;
  description?: string;
  value: string;
  percentage: number;
  detail?: string;
  countryCode?: string;
}) {
  const normalizedCountryCode = countryCode?.trim().toLowerCase();
  const hasCountryFlag = Boolean(normalizedCountryCode && /^[a-z]{2}$/.test(normalizedCountryCode));

  return (
    <div className="statistics-bar-row">
      <div>
        <strong className="statistics-row-label">
          {hasCountryFlag ? <span className={`fi fi-${normalizedCountryCode}`} aria-hidden="true" /> : null}
          <span>{label}</span>
          {description ? (
            <>
              <span className="statistics-label-separator" aria-hidden="true">•</span>
              <span className="statistics-label-description">{description}</span>
            </>
          ) : null}
        </strong>
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
          key={`${row.label}-${row.description ?? ""}`}
          label={row.label}
          description={row.description}
          value={formatNumber(row.sessions)}
          percentage={row.percentage}
          detail={`${formatNumber(row.activeUsers)} visiteurs - ${formatDuration(row.averageVisitDurationSeconds)} moy.`}
        />
      ))}
    </div>
  );
}

function ValueList({ rows, showFlags = false }: { rows: StatisticsValueRow[]; showFlags?: boolean }) {
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
          countryCode={showFlags ? row.countryCode : undefined}
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
          label={pageDisplayLabel(row.label)}
          value={formatNumber(row.views)}
          percentage={row.percentage}
          detail={`${percentageLabel(row.percentage)} - ${formatDuration(row.averageVisitDurationSeconds)} moy.`}
        />
      ))}
    </div>
  );
}

function StatisticsColumn({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="statistics-column">
      <h4>{title}</h4>
      {children}
    </div>
  );
}

function usePrefersReducedMotion(): boolean {
  const getPreference = () =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(getPreference);

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }

    const mediaQuery = window.matchMedia("(prefers-reduced-motion: reduce)");
    const updatePreference = () => setPrefersReducedMotion(mediaQuery.matches);

    updatePreference();
    mediaQuery.addEventListener("change", updatePreference);

    return () => mediaQuery.removeEventListener("change", updatePreference);
  }, []);

  return prefersReducedMotion;
}

function useTimelineAnimation() {
  const chartRef = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = usePrefersReducedMotion();
  const [hasEnteredViewport, setHasEnteredViewport] = useState(prefersReducedMotion);

  useEffect(() => {
    if (prefersReducedMotion) {
      setHasEnteredViewport(true);
      return;
    }

    const chart = chartRef.current;

    if (!chart || typeof IntersectionObserver === "undefined") {
      setHasEnteredViewport(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];

        if (entry?.isIntersecting && entry.intersectionRatio >= 0.35) {
          setHasEnteredViewport(true);
          observer.disconnect();
        }
      },
      { threshold: 0.35 }
    );

    observer.observe(chart);

    return () => observer.disconnect();
  }, [prefersReducedMotion]);

  return { chartRef, hasEnteredViewport, prefersReducedMotion };
}

function TimelineChart({
  points,
  granularity
}: {
  points: StatisticsTimelinePoint[];
  granularity: StatisticsTimelineGranularity;
}) {
  const { chartRef, hasEnteredViewport, prefersReducedMotion } = useTimelineAnimation();

  if (points.length === 0) {
    return <EmptyList label="Aucune visite enregistrée sur cette période." />;
  }

  return (
    <div
      ref={chartRef}
      className="statistics-timeline"
      role="img"
      aria-label="Évolution des visites sur la période sélectionnée"
    >
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={points} margin={{ top: 12, right: 8, left: -14, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="rgba(8, 45, 66, 0.1)" strokeDasharray="4 4" />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => timelineDateLabel(String(value), granularity)}
            axisLine={{ stroke: "rgba(8, 45, 66, 0.14)" }}
            tickLine={false}
            tick={{ fill: "#425964", fontSize: 11 }}
            minTickGap={28}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#425964", fontSize: 11 }}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: "rgba(0, 111, 120, 0.28)", strokeWidth: 1 }}
            labelFormatter={(value) => timelineDateLabel(String(value), granularity, true)}
            formatter={(value) => [formatNumber(Number(value)), "Visites"]}
            contentStyle={{
              border: "1px solid rgba(8, 45, 66, 0.14)",
              borderRadius: "8px",
              boxShadow: "0 10px 24px rgba(8, 45, 66, 0.12)",
              color: "#082d42",
              fontFamily: "Comfortaa, Segoe UI, Arial, sans-serif",
              fontSize: "12px"
            }}
          />
          {hasEnteredViewport ? (
            <Area
              type="monotone"
              dataKey="visits"
              name="Visites"
              stroke="#006f78"
              strokeWidth={2.5}
              fill="#e7f4f3"
              fillOpacity={0.72}
              dot={false}
              activeDot={{ r: 5, fill: "#f9b900", stroke: "#ffffff", strokeWidth: 2 }}
              isAnimationActive={!prefersReducedMotion}
              animationDuration={900}
              animationEasing="ease-out"
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
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

function GoogleAdsTimelineChart({
  points,
  granularity
}: {
  points: StatisticsGoogleAdsTimelinePoint[];
  granularity: StatisticsTimelineGranularity;
}) {
  const { chartRef, hasEnteredViewport, prefersReducedMotion } = useTimelineAnimation();

  if (points.length === 0) {
    return <EmptyList label="Aucune activité Google Ads enregistrée sur cette période." />;
  }

  return (
    <div
      ref={chartRef}
      className="statistics-timeline"
      role="img"
      aria-label="Évolution des visites et des actions & conversions issues de Google Ads"
    >
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={points} margin={{ top: 12, right: 8, left: -14, bottom: 0 }} accessibilityLayer>
          <CartesianGrid vertical={false} stroke="rgba(8, 45, 66, 0.1)" strokeDasharray="4 4" />
          <XAxis
            dataKey="date"
            tickFormatter={(value) => timelineDateLabel(String(value), granularity)}
            axisLine={{ stroke: "rgba(8, 45, 66, 0.14)" }}
            tickLine={false}
            tick={{ fill: "#425964", fontSize: 11 }}
            minTickGap={28}
          />
          <YAxis
            allowDecimals={false}
            axisLine={false}
            tickLine={false}
            tick={{ fill: "#425964", fontSize: 11 }}
            width={48}
          />
          <Tooltip
            cursor={{ stroke: "rgba(0, 111, 120, 0.28)", strokeWidth: 1 }}
            labelFormatter={(value) => timelineDateLabel(String(value), granularity, true)}
            formatter={(value, name) => [
              formatNumber(Number(value)),
              name === "conversions" || name === "Actions & conversions"
                ? "Actions & conversions"
                : "Visites via vos annonces"
            ]}
            contentStyle={{
              border: "1px solid rgba(8, 45, 66, 0.14)",
              borderRadius: "8px",
              boxShadow: "0 10px 24px rgba(8, 45, 66, 0.12)",
              color: "#082d42",
              fontFamily: "Comfortaa, Segoe UI, Arial, sans-serif",
              fontSize: "12px"
            }}
          />
          {hasEnteredViewport ? (
            <>
              <Line
                type="monotone"
                dataKey="clicks"
                name="Visites via vos annonces"
                stroke="#006f78"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: "#f9b900", stroke: "#ffffff", strokeWidth: 2 }}
                isAnimationActive={!prefersReducedMotion}
                animationDuration={900}
                animationEasing="ease-out"
              />
              <Line
                type="monotone"
                dataKey="conversions"
                name="Actions & conversions"
                stroke="#f9b900"
                strokeWidth={2.5}
                dot={false}
                activeDot={{ r: 5, fill: "#006f78", stroke: "#ffffff", strokeWidth: 2 }}
                isAnimationActive={!prefersReducedMotion}
                animationDuration={900}
                animationEasing="ease-out"
              />
            </>
          ) : null}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function GoogleAdsBreakdownList({ rows }: { rows: StatisticsGoogleAdsBreakdownRow[] }) {
  if (rows.length === 0) {
    return <EmptyList label="Aucune donnée disponible sur cette période." />;
  }

  return (
    <div className="statistics-list">
      {rows.map((row) => (
        <BarRow
          key={row.label}
          label={row.label}
          value={formatNumber(row.clicks)}
          percentage={row.percentage}
          detail={`${formatNumber(row.impressions)} apparitions - ${formatNumber(row.conversions)} actions & conversions - ${percentageLabel(row.clickThroughRate)} clics`}
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
      provider: solution.statistics.provider === "google_ads" ? "google_ads" : "ga4",
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
            Notre équipe termine le lien avec {readyData.provider === "google_ads" ? "Google Ads" : "GA4"} pour {readyData.solution.domain || readyData.solution.name || "cette solution"}.
          </p>
        </div>
      ) : null}

      {readyData?.status === "ready" && readyData.provider === "ga4" ? (
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

          <section className="statistics-panel statistics-timeline-panel">
            <div className="statistics-panel-heading">
              <TrendingUp aria-hidden="true" />
              <div>
                <h3>Évolution des visites</h3>
                <p>Nombre de visites au fil de la période sélectionnée.</p>
              </div>
            </div>
            <TimelineChart
              key={period}
              points={readyData.timeline?.points ?? []}
              granularity={readyData.timeline?.granularity ?? (period === "365d" ? "month" : period === "90d" ? "week" : "day")}
            />
          </section>

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
                <StatisticsColumn title="Principaux pays">
                  <ValueList rows={readyData.overview.countries} showFlags />
                </StatisticsColumn>
                <StatisticsColumn title="Principales villes">
                  <ValueList rows={readyData.overview.cities} />
                </StatisticsColumn>
              </div>
            </section>
          </div>

          <section className="statistics-panel">
            <div className="statistics-panel-heading">
              <TrendingUp aria-hidden="true" />
              <div>
                <h3>Acquisition de trafic</h3>
                <p>Les mêmes visites regroupées par canal, puis détaillées par origine.</p>
              </div>
            </div>
            <div className="statistics-split">
              <StatisticsColumn title="Canaux d’acquisition">
                <TrafficList rows={readyData.acquisition.channels} />
              </StatisticsColumn>
              <StatisticsColumn title="Origines détaillées">
                <TrafficList rows={readyData.acquisition.sources} />
              </StatisticsColumn>
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
              <StatisticsColumn title="Performances des pages">
                <PageList rows={readyData.behavior.pages} />
              </StatisticsColumn>
              <StatisticsColumn title="Actions des utilisateurs">
                <EventList rows={readyData.behavior.events} />
              </StatisticsColumn>
            </div>
          </section>
        </>
      ) : null}

      {readyData?.status === "ready" && readyData.provider === "google_ads" ? (
        <>
          <div className="statistics-meta">
            <span>{readyData.period.label}</span>
            <span>{displayDate(readyData.generatedAt) ? `Mis à jour le ${displayDate(readyData.generatedAt)}` : "Données Google Ads"}</span>
          </div>

          <div className="statistics-kpi-grid is-google-ads">
            <article>
              <Globe2 aria-hidden="true" />
              <span>Apparitions</span>
              <strong>{formatNumber(readyData.overview.impressions)}</strong>
            </article>
            <article>
              <MousePointerClick aria-hidden="true" />
              <span>Visites via vos annonces</span>
              <strong>{formatNumber(readyData.overview.clicks)}</strong>
            </article>
            <article>
              <Target aria-hidden="true" />
              <span>Actions & conversions</span>
              <strong>{formatNumber(readyData.overview.conversions)}</strong>
            </article>
            <article>
              <BarChart3 aria-hidden="true" />
              <span>Taux de clic</span>
              <strong>{percentageLabel(readyData.overview.clickThroughRate)}</strong>
            </article>
          </div>

          <section className="statistics-panel statistics-timeline-panel">
            <div className="statistics-panel-heading">
              <TrendingUp aria-hidden="true" />
              <div>
                <h3>Évolution des résultats</h3>
                <p>Visites issues de vos annonces et actions & conversions sur la période sélectionnée.</p>
              </div>
            </div>
            <GoogleAdsTimelineChart
              key={period}
              points={readyData.timeline.points}
              granularity={readyData.timeline.granularity}
            />
          </section>

          <div className="statistics-grid">
            <section className="statistics-panel">
              <div className="statistics-panel-heading">
                <Megaphone aria-hidden="true" />
                <div>
                  <h3>Campagnes actives</h3>
                  <p>Les campagnes qui génèrent le plus de visites via vos annonces.</p>
                </div>
              </div>
              <GoogleAdsBreakdownList rows={readyData.campaigns} />
            </section>

            <section className="statistics-panel">
              <div className="statistics-panel-heading">
                <MapPin aria-hidden="true" />
                <div>
                  <h3>Zones géographiques</h3>
                  <p>Villes et pays où vos annonces ont généré le plus de visites.</p>
                </div>
              </div>
              <GoogleAdsBreakdownList rows={readyData.locations} />
            </section>

            <section className="statistics-panel">
              <div className="statistics-panel-heading">
                <Search aria-hidden="true" />
                <div>
                  <h3>Performances des mots-clés</h3>
                  <p>Les mots-clés ciblés ayant généré le plus de visites.</p>
                </div>
              </div>
              <GoogleAdsBreakdownList rows={readyData.keywords} />
            </section>

            <section className="statistics-panel">
              <div className="statistics-panel-heading">
                <MousePointerClick aria-hidden="true" />
                <div>
                  <h3>Répartition par appareil</h3>
                  <p>Comment vos annonces sont consultées selon le type d’écran.</p>
                </div>
              </div>
              <GoogleAdsBreakdownList rows={readyData.devices} />
            </section>
          </div>
        </>
      ) : null}
    </section>
  );
}
