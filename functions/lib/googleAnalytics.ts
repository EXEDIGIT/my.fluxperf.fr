import { isProduction } from "./auth";
import { getGoogleAccessTokenForScope } from "./googleSheets";
import type { AppEnv, ClientSolutionDto } from "./types";

const GOOGLE_ANALYTICS_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const GOOGLE_ANALYTICS_DATA_API_BASE = "https://analyticsdata.googleapis.com/v1beta";

export type StatisticsPeriodId = "7d" | "30d" | "90d" | "365d";

export type StatisticsPeriod = {
  id: StatisticsPeriodId;
  label: string;
  startDate: string;
  endDate: string;
};

export type StatisticsValueRow = {
  label: string;
  value: number;
  percentage: number;
};

export type StatisticsTrafficRow = {
  label: string;
  sessions: number;
  activeUsers: number;
  percentage: number;
  averageVisitDurationSeconds: number;
};

export type StatisticsPageRow = {
  label: string;
  views: number;
  percentage: number;
  averageVisitDurationSeconds: number;
};

export type StatisticsEventRow = {
  label: string;
  eventName: string;
  count: number;
  percentage: number;
};

export type StatisticsReadyResponse = {
  status: "ready";
  generatedAt: string;
  period: StatisticsPeriod;
  solution: {
    id: string;
    name: string;
    domain: string;
  };
  overview: {
    visits: number;
    uniqueVisitors: number;
    averageVisitDurationSeconds: number;
    topEvents: StatisticsEventRow[];
    countries: StatisticsValueRow[];
    cities: StatisticsValueRow[];
    topPages: StatisticsPageRow[];
  };
  acquisition: {
    channels: StatisticsTrafficRow[];
    sources: StatisticsTrafficRow[];
  };
  behavior: {
    pages: StatisticsPageRow[];
    events: StatisticsEventRow[];
  };
};

type Fetcher = typeof fetch;

type GaReportRow = {
  dimensionValues?: Array<{ value?: string }>;
  metricValues?: Array<{ value?: string }>;
};

type GaReportResponse = {
  rows?: GaReportRow[];
  rowCount?: number;
};

type GaBatchResponse = {
  reports?: GaReportResponse[];
  error?: {
    message?: string;
  };
};

type BatchReportRequest = {
  dateRanges: Array<{
    startDate: string;
    endDate: string;
  }>;
  dimensions?: Array<{ name: string }>;
  metrics: Array<{ name: string }>;
  limit?: string;
  orderBys?: Array<{
    metric: {
      metricName: string;
    };
    desc: boolean;
  }>;
};

const periods: Record<StatisticsPeriodId, StatisticsPeriod> = {
  "7d": {
    id: "7d",
    label: "7 derniers jours",
    startDate: "7daysAgo",
    endDate: "yesterday"
  },
  "30d": {
    id: "30d",
    label: "30 derniers jours",
    startDate: "30daysAgo",
    endDate: "yesterday"
  },
  "90d": {
    id: "90d",
    label: "90 derniers jours",
    startDate: "90daysAgo",
    endDate: "yesterday"
  },
  "365d": {
    id: "365d",
    label: "Depuis 1 an",
    startDate: "365daysAgo",
    endDate: "yesterday"
  }
};

const hiddenEventNames = new Set(["page_view", "session_start", "first_visit", "user_engagement"]);

export function isStatisticsPeriod(value: string): value is StatisticsPeriodId {
  return value === "7d" || value === "30d" || value === "90d" || value === "365d";
}

export function statisticsPeriod(value: StatisticsPeriodId): StatisticsPeriod {
  return periods[value];
}

function analyticsConfigured(env: AppEnv): boolean {
  return Boolean(env.GOOGLE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_PRIVATE_KEY);
}

function numberValue(row: GaReportRow | undefined, index: number): number {
  const value = row?.metricValues?.[index]?.value ?? "0";
  const parsed = Number(value);

  return Number.isFinite(parsed) ? parsed : 0;
}

function textValue(row: GaReportRow | undefined, index: number): string {
  return row?.dimensionValues?.[index]?.value?.trim() || "";
}

function percentage(value: number, total: number): number {
  if (total <= 0) {
    return 0;
  }

  return Math.round((value / total) * 1000) / 10;
}

function roundSeconds(value: number): number {
  return Math.round(value);
}

function reportRequest(
  period: StatisticsPeriod,
  metrics: string[],
  dimensions: string[] = [],
  limit = 10,
  orderMetric = metrics[0]
): BatchReportRequest {
  return {
    dateRanges: [
      {
        startDate: period.startDate,
        endDate: period.endDate
      }
    ],
    dimensions: dimensions.length > 0 ? dimensions.map((name) => ({ name })) : undefined,
    metrics: metrics.map((name) => ({ name })),
    limit: String(limit),
    orderBys: [
      {
        metric: {
          metricName: orderMetric
        },
        desc: true
      }
    ]
  };
}

async function batchRunReports(
  env: AppEnv,
  propertyId: string,
  requests: BatchReportRequest[],
  fetcher: Fetcher
): Promise<GaReportResponse[]> {
  const accessToken = await getGoogleAccessTokenForScope(env, GOOGLE_ANALYTICS_SCOPE, fetcher);
  const response = await fetcher(
    `${GOOGLE_ANALYTICS_DATA_API_BASE}/properties/${encodeURIComponent(propertyId)}:batchRunReports`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        requests
      })
    }
  );
  const data = (await response.json()) as GaBatchResponse;

  if (!response.ok) {
    throw new Error(data.error?.message || "Unable to read GA4 statistics.");
  }

  return data.reports ?? [];
}

export function channelLabel(value: string): string {
  const normalized = value.trim().toLowerCase();

  if (!normalized || normalized === "(not set)") return "Autres";
  if (normalized === "direct") return "Direct";
  if (normalized.includes("organic search")) return "SEO";
  if (normalized.includes("ai assistant")) return "IA GEO";
  if (normalized.includes("paid search") || normalized.includes("paid shopping")) return "Publicite";
  if (normalized.includes("cross-network") || normalized.includes("display") || normalized.includes("paid video")) {
    return "Publicite";
  }
  if (normalized.includes("organic social") || normalized.includes("paid social") || normalized.includes("social")) {
    return "Social";
  }
  if (normalized.includes("referral") || normalized.includes("affiliate")) return "Sites referents";

  return "Autres";
}

function mergeTrafficRows(rows: StatisticsTrafficRow[]): StatisticsTrafficRow[] {
  const totals = rows.reduce((map, row) => {
    const current = map.get(row.label) ?? {
      label: row.label,
      sessions: 0,
      activeUsers: 0,
      weightedDuration: 0
    };

    current.sessions += row.sessions;
    current.activeUsers += row.activeUsers;
    current.weightedDuration += row.averageVisitDurationSeconds * row.sessions;
    map.set(row.label, current);

    return map;
  }, new Map<string, { label: string; sessions: number; activeUsers: number; weightedDuration: number }>());
  const sessionTotal = Array.from(totals.values()).reduce((sum, row) => sum + row.sessions, 0);

  return Array.from(totals.values())
    .map((row) => ({
      label: row.label,
      sessions: row.sessions,
      activeUsers: row.activeUsers,
      percentage: percentage(row.sessions, sessionTotal),
      averageVisitDurationSeconds: roundSeconds(row.sessions > 0 ? row.weightedDuration / row.sessions : 0)
    }))
    .sort((left, right) => right.sessions - left.sessions);
}

function sourceLabel(value: string): string {
  const normalized = value.trim();

  if (!normalized || normalized === "(not set)") return "Source non identifiee";
  if (normalized === "(direct) / (none)") return "Acces direct";

  return normalized
    .replace(/\s*\/\s*/g, " / ")
    .replace(/_/g, " ");
}

export function isHiddenGa4Event(eventName: string): boolean {
  return hiddenEventNames.has(eventName.trim().toLowerCase());
}

export function eventLabel(eventName: string): string {
  const normalized = eventName.trim().toLowerCase();

  if (["form_submit", "generate_lead", "lead", "submit_form"].includes(normalized)) return "Formulaire envoye";
  if (["click", "outbound_click", "select_content"].includes(normalized)) return "Clic";
  if (normalized === "file_download") return "Telechargement";
  if (normalized === "scroll") return "Scroll complet";
  if (["search", "view_search_results"].includes(normalized)) return "Recherche interne";
  if (normalized === "purchase") return "Achat";
  if (normalized === "sign_up") return "Inscription";

  return normalized
    .split(/[_\s-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function rowsToTraffic(
  report: GaReportResponse | undefined,
  totalSessions: number,
  labelFromValue: (value: string) => string
): StatisticsTrafficRow[] {
  return (report?.rows ?? []).map((row) => {
    const sessions = numberValue(row, 0);

    return {
      label: labelFromValue(textValue(row, 0)),
      sessions,
      activeUsers: numberValue(row, 1),
      percentage: percentage(sessions, totalSessions),
      averageVisitDurationSeconds: roundSeconds(numberValue(row, 2))
    };
  });
}

function rowsToValueRows(report: GaReportResponse | undefined, limit = 5): StatisticsValueRow[] {
  const rows = (report?.rows ?? [])
    .map((row) => ({
      label: textValue(row, 0) || "Non identifie",
      value: numberValue(row, 0),
      percentage: 0
    }))
    .filter((row) => row.value > 0)
    .slice(0, limit);
  const total = rows.reduce((sum, row) => sum + row.value, 0);

  return rows.map((row) => ({
    ...row,
    percentage: percentage(row.value, total)
  }));
}

function rowsToPages(report: GaReportResponse | undefined, limit = 10): StatisticsPageRow[] {
  const rows = (report?.rows ?? [])
    .map((row) => ({
      label: textValue(row, 0) || "Page sans titre",
      views: numberValue(row, 0),
      percentage: 0,
      averageVisitDurationSeconds: roundSeconds(numberValue(row, 1))
    }))
    .filter((row) => row.views > 0)
    .slice(0, limit);
  const total = rows.reduce((sum, row) => sum + row.views, 0);

  return rows.map((row) => ({
    ...row,
    percentage: percentage(row.views, total)
  }));
}

function rowsToEvents(report: GaReportResponse | undefined, limit = 10): StatisticsEventRow[] {
  const rows = (report?.rows ?? [])
    .map((row) => {
      const eventName = textValue(row, 0);

      return {
        label: eventLabel(eventName),
        eventName,
        count: numberValue(row, 0),
        percentage: 0
      };
    })
    .filter((row) => row.count > 0 && !isHiddenGa4Event(row.eventName))
    .slice(0, limit);
  const total = rows.reduce((sum, row) => sum + row.count, 0);

  return rows.map((row) => ({
    ...row,
    percentage: percentage(row.count, total)
  }));
}

function demoStatistics(solution: ClientSolutionDto, period: StatisticsPeriod): StatisticsReadyResponse {
  const channels = mergeTrafficRows([
    { label: "SEO", sessions: 1240, activeUsers: 960, percentage: 0, averageVisitDurationSeconds: 118 },
    { label: "Direct", sessions: 520, activeUsers: 430, percentage: 0, averageVisitDurationSeconds: 82 },
    { label: "Sites referents", sessions: 270, activeUsers: 210, percentage: 0, averageVisitDurationSeconds: 96 },
    { label: "Social", sessions: 190, activeUsers: 160, percentage: 0, averageVisitDurationSeconds: 54 },
    { label: "IA GEO", sessions: 64, activeUsers: 52, percentage: 0, averageVisitDurationSeconds: 74 }
  ]);
  const sources = mergeTrafficRows([
    { label: "google / organic", sessions: 980, activeUsers: 760, percentage: 0, averageVisitDurationSeconds: 122 },
    { label: "Acces direct", sessions: 520, activeUsers: 430, percentage: 0, averageVisitDurationSeconds: 82 },
    { label: "bing / organic", sessions: 180, activeUsers: 140, percentage: 0, averageVisitDurationSeconds: 104 },
    { label: "linkedin.com / referral", sessions: 120, activeUsers: 96, percentage: 0, averageVisitDurationSeconds: 68 }
  ]);
  const pages = [
    { label: "/", views: 1420, percentage: 42.1, averageVisitDurationSeconds: 74 },
    { label: "/contact", views: 520, percentage: 15.4, averageVisitDurationSeconds: 88 },
    { label: "/services", views: 470, percentage: 13.9, averageVisitDurationSeconds: 112 },
    { label: "/realisations", views: 310, percentage: 9.2, averageVisitDurationSeconds: 96 },
    { label: "/blog", views: 220, percentage: 6.5, averageVisitDurationSeconds: 64 }
  ];
  const events = [
    { label: "Formulaire envoye", eventName: "generate_lead", count: 38, percentage: 44.2 },
    { label: "Clic", eventName: "click", count: 24, percentage: 27.9 },
    { label: "Telechargement", eventName: "file_download", count: 14, percentage: 16.3 },
    { label: "Recherche interne", eventName: "search", count: 10, percentage: 11.6 }
  ];

  return {
    status: "ready",
    generatedAt: new Date().toISOString(),
    period,
    solution: {
      id: solution.id,
      name: solution.name || solution.typeLabel,
      domain: solution.domain
    },
    overview: {
      visits: 2284,
      uniqueVisitors: 1812,
      averageVisitDurationSeconds: 104,
      topEvents: events.slice(0, 5),
      countries: [
        { label: "France", value: 1700, percentage: 81.3 },
        { label: "Belgique", value: 140, percentage: 6.7 },
        { label: "Suisse", value: 96, percentage: 4.6 },
        { label: "Canada", value: 84, percentage: 4 },
        { label: "Espagne", value: 72, percentage: 3.4 }
      ],
      cities: [
        { label: "Paris", value: 520, percentage: 36.4 },
        { label: "Lyon", value: 260, percentage: 18.2 },
        { label: "Marseille", value: 210, percentage: 14.7 },
        { label: "Bordeaux", value: 160, percentage: 11.2 },
        { label: "Lille", value: 132, percentage: 9.2 }
      ],
      topPages: pages.slice(0, 5)
    },
    acquisition: {
      channels,
      sources
    },
    behavior: {
      pages,
      events
    }
  };
}

export async function fetchGa4Statistics(
  env: AppEnv,
  propertyId: string,
  solution: ClientSolutionDto,
  periodId: StatisticsPeriodId,
  fetcher: Fetcher = fetch
): Promise<StatisticsReadyResponse> {
  const period = statisticsPeriod(periodId);

  if (!analyticsConfigured(env) && !isProduction(env)) {
    return demoStatistics(solution, period);
  }

  const batchOne = await batchRunReports(
    env,
    propertyId,
    [
      reportRequest(period, ["sessions", "activeUsers", "averageSessionDuration"], [], 1, "sessions"),
      reportRequest(period, ["sessions", "activeUsers", "averageSessionDuration"], ["sessionDefaultChannelGroup"], 20, "sessions"),
      reportRequest(period, ["sessions", "activeUsers", "averageSessionDuration"], ["sessionSourceMedium"], 20, "sessions"),
      reportRequest(period, ["activeUsers"], ["country"], 5, "activeUsers"),
      reportRequest(period, ["activeUsers"], ["city"], 5, "activeUsers")
    ],
    fetcher
  );
  const overviewRow = batchOne[0]?.rows?.[0];
  const visits = Math.round(numberValue(overviewRow, 0));
  const uniqueVisitors = Math.round(numberValue(overviewRow, 1));
  const averageVisitDurationSeconds = roundSeconds(numberValue(overviewRow, 2));
  const rawChannels = rowsToTraffic(batchOne[1], visits, channelLabel);
  const channels = mergeTrafficRows(rawChannels);
  const sources = rowsToTraffic(batchOne[2], visits, sourceLabel).slice(0, 10);
  const batchTwo = await batchRunReports(
    env,
    propertyId,
    [
      reportRequest(period, ["screenPageViews", "averageSessionDuration"], ["pagePath"], 10, "screenPageViews"),
      reportRequest(period, ["eventCount"], ["eventName"], 25, "eventCount")
    ],
    fetcher
  );
  const pages = rowsToPages(batchTwo[0], 10);
  const events = rowsToEvents(batchTwo[1], 10);

  return {
    status: "ready",
    generatedAt: new Date().toISOString(),
    period,
    solution: {
      id: solution.id,
      name: solution.name || solution.typeLabel,
      domain: solution.domain
    },
    overview: {
      visits,
      uniqueVisitors,
      averageVisitDurationSeconds,
      topEvents: events.slice(0, 5),
      countries: rowsToValueRows(batchOne[3], 5),
      cities: rowsToValueRows(batchOne[4], 5),
      topPages: pages.slice(0, 5)
    },
    acquisition: {
      channels,
      sources
    },
    behavior: {
      pages,
      events
    }
  };
}
