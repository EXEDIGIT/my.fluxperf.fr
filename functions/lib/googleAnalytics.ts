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
  countryCode?: string;
};

export type StatisticsTrafficRow = {
  label: string;
  description?: string;
  sessions: number;
  activeUsers: number;
  percentage: number;
  averageVisitDurationSeconds: number;
};

export type StatisticsTimelineGranularity = "day" | "week" | "month";

export type StatisticsTimelinePoint = {
  date: string;
  visits: number;
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
  provider: "ga4";
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
  timeline: {
    granularity: StatisticsTimelineGranularity;
    points: StatisticsTimelinePoint[];
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
  keepEmptyRows?: boolean;
  orderBys?: Array<
    | {
        metric: {
          metricName: string;
        };
        desc: boolean;
      }
    | {
        dimension: {
          dimensionName: string;
        };
        desc: boolean;
      }
  >;
};

type TrafficPresentation = {
  label: string;
  description?: string;
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
const channelDescriptions: Record<string, string> = {
  Autres: "Canaux non classés",
  Direct: "Adresse saisie, favori ou origine non détectée",
  "IA GEO": "Assistants IA",
  Publicité: "Campagnes payantes",
  SEO: "Moteurs de recherche",
  Social: "Réseaux sociaux",
  "Sites référents": "Liens depuis d’autres sites"
};
const frenchRegionNames = new Intl.DisplayNames(["fr"], { type: "region" });

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

function timelineReportRequest(period: StatisticsPeriod): BatchReportRequest {
  return {
    dateRanges: [
      {
        startDate: period.startDate,
        endDate: period.endDate
      }
    ],
    dimensions: [{ name: "date" }],
    metrics: [{ name: "sessions" }],
    limit: "400",
    keepEmptyRows: true,
    orderBys: [
      {
        dimension: {
          dimensionName: "date"
        },
        desc: false
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
  if (normalized.includes("paid search") || normalized.includes("paid shopping")) return "Publicité";
  if (normalized.includes("cross-network") || normalized.includes("display") || normalized.includes("paid video")) {
    return "Publicité";
  }
  if (normalized.includes("organic social") || normalized.includes("paid social") || normalized.includes("social")) {
    return "Social";
  }
  if (normalized.includes("referral") || normalized.includes("affiliate")) return "Sites référents";

  return "Autres";
}

export function channelPresentation(value: string): TrafficPresentation {
  const label = channelLabel(value);

  return {
    label,
    description: channelDescriptions[label]
  };
}

function mergeTrafficRows(rows: StatisticsTrafficRow[]): StatisticsTrafficRow[] {
  const totals = rows.reduce((map, row) => {
    const current = map.get(row.label) ?? {
      label: row.label,
      description: row.description,
      sessions: 0,
      activeUsers: 0,
      weightedDuration: 0
    };

    current.sessions += row.sessions;
    current.activeUsers += row.activeUsers;
    current.weightedDuration += row.averageVisitDurationSeconds * row.sessions;
    map.set(row.label, current);

    return map;
  }, new Map<string, { label: string; description?: string; sessions: number; activeUsers: number; weightedDuration: number }>());
  const sessionTotal = Array.from(totals.values()).reduce((sum, row) => sum + row.sessions, 0);

  return Array.from(totals.values())
    .map((row) => ({
      label: row.label,
      description: row.description,
      sessions: row.sessions,
      activeUsers: row.activeUsers,
      percentage: percentage(row.sessions, sessionTotal),
      averageVisitDurationSeconds: roundSeconds(row.sessions > 0 ? row.weightedDuration / row.sessions : 0)
    }))
    .sort((left, right) => right.sessions - left.sessions);
}

function sourceDisplayName(value: string): string {
  const normalized = value.trim().replace(/_/g, " ");
  const knownNames: Record<string, string> = {
    bing: "Bing",
    google: "Google",
    yahoo: "Yahoo",
    youtube: "YouTube"
  };

  return knownNames[normalized.toLowerCase()] || normalized;
}

export function sourcePresentation(value: string): TrafficPresentation {
  const normalized = value.trim();

  if (!normalized || normalized.toLowerCase() === "(not set)") {
    return { label: "Source non identifiée" };
  }

  const separatorIndex = normalized.indexOf("/");

  if (separatorIndex < 0) {
    return { label: sourceDisplayName(normalized) };
  }

  const source = normalized.slice(0, separatorIndex).trim();
  const medium = normalized.slice(separatorIndex + 1).trim().toLowerCase();

  if (source.toLowerCase() === "(direct)" && medium === "(none)") {
    return {
      label: "Accès direct",
      description: "Origine non détectée"
    };
  }

  const descriptions: Record<string, string> = {
    affiliate: "Site partenaire",
    cpc: "Publicité",
    email: "E-mail",
    organic: "Moteur de recherche",
    paid: "Publicité",
    ppc: "Publicité",
    referral: "Site référent",
    social: "Réseau social"
  };
  const description = descriptions[medium];

  if (description) {
    return {
      label: sourceDisplayName(source),
      description
    };
  }

  return {
    label: normalized.replace(/\s*\/\s*/g, " / ").replace(/_/g, " ")
  };
}

export function sourceLabel(value: string): string {
  return sourcePresentation(value).label;
}

export function pageLabel(value: string): string {
  const normalized = value.trim();

  if (!normalized) return "Page sans titre";
  if (normalized === "/") return "/ • Page d’accueil";

  return normalized;
}

function normalizedDimensionLabel(value: string): string {
  const normalized = value.trim();

  return !normalized || normalized.toLowerCase() === "(not set)" ? "Non identifié" : normalized;
}

export function countryPresentation(country: string, countryCode: string): Pick<StatisticsValueRow, "label" | "countryCode"> {
  const normalizedCode = countryCode.trim().toUpperCase();

  if (!/^[A-Z]{2}$/.test(normalizedCode)) {
    return { label: normalizedDimensionLabel(country) };
  }

  const translated = frenchRegionNames.of(normalizedCode);

  return {
    label: translated && translated !== normalizedCode ? translated : normalizedDimensionLabel(country),
    countryCode: normalizedCode
  };
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
  presentationFromValue: (value: string) => TrafficPresentation
): StatisticsTrafficRow[] {
  return (report?.rows ?? []).map((row) => {
    const sessions = numberValue(row, 0);
    const presentation = presentationFromValue(textValue(row, 0));

    return {
      ...presentation,
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
      label: normalizedDimensionLabel(textValue(row, 0)),
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

function rowsToCountries(report: GaReportResponse | undefined, limit = 5): StatisticsValueRow[] {
  const rows = (report?.rows ?? [])
    .map((row) => ({
      ...countryPresentation(textValue(row, 0), textValue(row, 1)),
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
      label: pageLabel(textValue(row, 0)),
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

export function timelineGranularity(periodId: StatisticsPeriodId): StatisticsTimelineGranularity {
  if (periodId === "365d") return "month";
  if (periodId === "90d") return "week";

  return "day";
}

function isoDateFromGaDate(value: string): string | null {
  const match = value.match(/^(\d{4})(\d{2})(\d{2})$/);

  return match ? `${match[1]}-${match[2]}-${match[3]}` : null;
}

function timelineBucket(date: string, granularity: StatisticsTimelineGranularity): string {
  if (granularity === "day") return date;
  if (granularity === "month") return `${date.slice(0, 7)}-01`;

  const parsed = new Date(`${date}T00:00:00Z`);
  const day = parsed.getUTCDay() || 7;

  parsed.setUTCDate(parsed.getUTCDate() - day + 1);

  return parsed.toISOString().slice(0, 10);
}

export function aggregateTimelinePoints(
  points: StatisticsTimelinePoint[],
  periodId: StatisticsPeriodId
): StatisticsReadyResponse["timeline"] {
  const granularity = timelineGranularity(periodId);
  const buckets = points.reduce((map, point) => {
    const bucket = timelineBucket(point.date, granularity);

    map.set(bucket, (map.get(bucket) ?? 0) + Math.max(0, Math.round(point.visits)));
    return map;
  }, new Map<string, number>());

  return {
    granularity,
    points: Array.from(buckets, ([date, visits]) => ({ date, visits })).sort((left, right) =>
      left.date.localeCompare(right.date)
    )
  };
}

function rowsToTimeline(
  report: GaReportResponse | undefined,
  periodId: StatisticsPeriodId
): StatisticsReadyResponse["timeline"] {
  const points = (report?.rows ?? []).flatMap((row) => {
    const date = isoDateFromGaDate(textValue(row, 0));

    return date ? [{ date, visits: numberValue(row, 0) }] : [];
  });

  return aggregateTimelinePoints(points, periodId);
}

function demoTimeline(periodId: StatisticsPeriodId, totalVisits: number): StatisticsReadyResponse["timeline"] {
  const granularity = timelineGranularity(periodId);
  const pointCount = periodId === "7d" ? 7 : periodId === "30d" ? 30 : periodId === "90d" ? 13 : 12;
  const weights = Array.from({ length: pointCount }, (_, index) => 0.72 + ((index * 7) % 11) / 20 + Math.sin(index / 2.4) * 0.18);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const yesterday = new Date();

  yesterday.setUTCHours(0, 0, 0, 0);
  yesterday.setUTCDate(yesterday.getUTCDate() - 1);

  const points = weights.map((weight, index) => {
    const date = new Date(yesterday);

    if (granularity === "month") {
      date.setUTCDate(1);
      date.setUTCMonth(date.getUTCMonth() - (pointCount - index - 1));
    } else {
      date.setUTCDate(date.getUTCDate() - (pointCount - index - 1) * (granularity === "week" ? 7 : 1));
    }

    return {
      date: timelineBucket(date.toISOString().slice(0, 10), granularity),
      visits: Math.floor((totalVisits * weight) / weightTotal)
    };
  });
  const assignedVisits = points.reduce((sum, point) => sum + point.visits, 0);

  points[points.length - 1].visits += totalVisits - assignedVisits;

  return { granularity, points };
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
    { ...channelPresentation("Organic Search"), sessions: 1240, activeUsers: 960, percentage: 0, averageVisitDurationSeconds: 118 },
    { ...channelPresentation("Direct"), sessions: 520, activeUsers: 430, percentage: 0, averageVisitDurationSeconds: 82 },
    { ...channelPresentation("Referral"), sessions: 270, activeUsers: 210, percentage: 0, averageVisitDurationSeconds: 96 },
    { ...channelPresentation("Organic Social"), sessions: 190, activeUsers: 160, percentage: 0, averageVisitDurationSeconds: 54 },
    { ...channelPresentation("AI Assistants"), sessions: 64, activeUsers: 52, percentage: 0, averageVisitDurationSeconds: 74 }
  ]);
  const sources = mergeTrafficRows([
    { ...sourcePresentation("google / organic"), sessions: 980, activeUsers: 760, percentage: 0, averageVisitDurationSeconds: 122 },
    { ...sourcePresentation("(direct) / (none)"), sessions: 520, activeUsers: 430, percentage: 0, averageVisitDurationSeconds: 82 },
    { ...sourcePresentation("bing / organic"), sessions: 180, activeUsers: 140, percentage: 0, averageVisitDurationSeconds: 104 },
    { ...sourcePresentation("linkedin.com / referral"), sessions: 120, activeUsers: 96, percentage: 0, averageVisitDurationSeconds: 68 }
  ]);
  const pages = [
    { label: pageLabel("/"), views: 1420, percentage: 42.1, averageVisitDurationSeconds: 74 },
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
    provider: "ga4",
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
        { label: "France", countryCode: "FR", value: 1700, percentage: 81.3 },
        { label: "Belgique", countryCode: "BE", value: 140, percentage: 6.7 },
        { label: "Suisse", countryCode: "CH", value: 96, percentage: 4.6 },
        { label: "Canada", countryCode: "CA", value: 84, percentage: 4 },
        { label: "Espagne", countryCode: "ES", value: 72, percentage: 3.4 }
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
    timeline: demoTimeline(period.id, 2284),
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
      reportRequest(period, ["activeUsers"], ["country", "countryId"], 5, "activeUsers"),
      reportRequest(period, ["activeUsers"], ["city"], 5, "activeUsers")
    ],
    fetcher
  );
  const overviewRow = batchOne[0]?.rows?.[0];
  const visits = Math.round(numberValue(overviewRow, 0));
  const uniqueVisitors = Math.round(numberValue(overviewRow, 1));
  const averageVisitDurationSeconds = roundSeconds(numberValue(overviewRow, 2));
  const rawChannels = rowsToTraffic(batchOne[1], visits, channelPresentation);
  const channels = mergeTrafficRows(rawChannels);
  const sources = rowsToTraffic(batchOne[2], visits, sourcePresentation).slice(0, 10);
  const batchTwo = await batchRunReports(
    env,
    propertyId,
    [
      reportRequest(period, ["screenPageViews", "averageSessionDuration"], ["pagePath"], 10, "screenPageViews"),
      reportRequest(period, ["eventCount"], ["eventName"], 25, "eventCount"),
      timelineReportRequest(period)
    ],
    fetcher
  );
  const pages = rowsToPages(batchTwo[0], 10);
  const events = rowsToEvents(batchTwo[1], 10);

  return {
    status: "ready",
    provider: "ga4",
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
      countries: rowsToCountries(batchOne[3], 5),
      cities: rowsToValueRows(batchOne[4], 5),
      topPages: pages.slice(0, 5)
    },
    timeline: rowsToTimeline(batchTwo[2], periodId),
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
