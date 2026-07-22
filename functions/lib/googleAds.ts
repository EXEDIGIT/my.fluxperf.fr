import { isProduction } from "./auth";
import {
  statisticsPeriod,
  timelineGranularity,
  type StatisticsPeriod,
  type StatisticsPeriodId,
  type StatisticsTimelineGranularity
} from "./googleAnalytics";
import { getGoogleAccessTokenForScope } from "./googleSheets";
import type { AppEnv, ClientSolutionDto } from "./types";

const GOOGLE_ADS_SCOPE = "https://www.googleapis.com/auth/adwords";
const GOOGLE_ADS_API_BASE = "https://googleads.googleapis.com/v24";

export type GoogleAdsBreakdownRow = {
  label: string;
  impressions: number;
  clicks: number;
  conversions: number;
  clickThroughRate: number;
  percentage: number;
};

export type GoogleAdsTimelinePoint = {
  date: string;
  clicks: number;
  conversions: number;
};

export type GoogleAdsStatisticsReadyResponse = {
  status: "ready";
  provider: "google_ads";
  generatedAt: string;
  period: StatisticsPeriod;
  solution: {
    id: string;
    name: string;
    domain: string;
  };
  overview: {
    impressions: number;
    clicks: number;
    conversions: number;
    clickThroughRate: number;
  };
  timeline: {
    granularity: StatisticsTimelineGranularity;
    points: GoogleAdsTimelinePoint[];
  };
  campaigns: GoogleAdsBreakdownRow[];
  devices: GoogleAdsBreakdownRow[];
};

type Fetcher = typeof fetch;

type GoogleAdsMetrics = {
  impressions?: string;
  clicks?: string;
  conversions?: string;
  ctr?: string;
};

type GoogleAdsResult = {
  metrics?: GoogleAdsMetrics;
  segments?: {
    date?: string;
    device?: string;
  };
  campaign?: {
    name?: string;
  };
};

type GoogleAdsStreamChunk = {
  results?: GoogleAdsResult[];
  error?: {
    message?: string;
  };
};

function numberValue(value: string | undefined): number {
  const parsed = Number(value ?? "0");

  return Number.isFinite(parsed) ? parsed : 0;
}

function integerValue(value: string | undefined): number {
  return Math.round(numberValue(value));
}

function percentage(value: number, total: number): number {
  return total > 0 ? Math.round((value / total) * 1000) / 10 : 0;
}

function clickThroughRate(value: string | undefined, clicks: number, impressions: number): number {
  const reported = numberValue(value);

  if (reported > 1) {
    return Math.round(reported * 100) / 100;
  }

  if (reported > 0) {
    return Math.round(reported * 10000) / 100;
  }

  return impressions > 0 ? Math.round((clicks / impressions) * 10000) / 100 : 0;
}

function normalizeDeveloperToken(value: string | undefined): string {
  // Copying a token from a browser can prepend an invisible zero-width character.
  return value?.replace(/[\u200B-\u200D\uFEFF]/g, "").trim() ?? "";
}

function configured(env: AppEnv): boolean {
  return Boolean(
    env.GOOGLE_SERVICE_ACCOUNT_EMAIL?.trim() &&
      env.GOOGLE_PRIVATE_KEY?.trim() &&
      normalizeDeveloperToken(env.GOOGLE_ADS_DEVELOPER_TOKEN)
  );
}

function normalizeCustomerId(value: string): string {
  const digits = value.replace(/\D/g, "");

  if (!/^\d{10}$/.test(digits)) {
    throw new Error("Google Ads customer ID is invalid.");
  }

  return digits;
}

function toDateString(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(
    date.getUTCDate()
  ).padStart(2, "0")}`;
}

function dateRange(periodId: StatisticsPeriodId): { start: string; end: string } {
  const days = periodId === "7d" ? 7 : periodId === "30d" ? 30 : periodId === "90d" ? 90 : 365;
  const end = new Date();

  end.setUTCHours(0, 0, 0, 0);
  end.setUTCDate(end.getUTCDate() - 1);
  const start = new Date(end);

  start.setUTCDate(start.getUTCDate() - (days - 1));

  return { start: toDateString(start), end: toDateString(end) };
}

function dateFilter(periodId: StatisticsPeriodId): string {
  const range = dateRange(periodId);

  return `segments.date BETWEEN '${range.start}' AND '${range.end}'`;
}

function streamRows(payload: unknown): GoogleAdsResult[] {
  const chunks = Array.isArray(payload) ? payload : [payload];

  return chunks.flatMap((chunk) => {
    const typed = chunk as GoogleAdsStreamChunk;

    if (typed.error?.message) {
      throw new Error(typed.error.message);
    }

    return Array.isArray(typed.results) ? typed.results : [];
  });
}

async function searchStream(
  env: AppEnv,
  customerId: string,
  query: string,
  fetcher: Fetcher
): Promise<GoogleAdsResult[]> {
  const accessToken = await getGoogleAccessTokenForScope(env, GOOGLE_ADS_SCOPE, fetcher);
  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
    "developer-token": normalizeDeveloperToken(env.GOOGLE_ADS_DEVELOPER_TOKEN)
  };
  const loginCustomerId = env.GOOGLE_ADS_LOGIN_CUSTOMER_ID?.replace(/\D/g, "");

  if (loginCustomerId) {
    headers["login-customer-id"] = loginCustomerId;
  }

  const response = await fetcher(
    `${GOOGLE_ADS_API_BASE}/customers/${encodeURIComponent(customerId)}/googleAds:searchStream`,
    {
      method: "POST",
      headers,
      body: JSON.stringify({ query })
    }
  );
  const payload = await response.json().catch(() => ({}));

  if (!response.ok) {
    const message = (payload as GoogleAdsStreamChunk).error?.message || "Google Ads API request failed.";

    throw new Error(message);
  }

  return streamRows(payload);
}

function deviceLabel(value: string | undefined): string {
  const labels: Record<string, string> = {
    DESKTOP: "Ordinateur",
    MOBILE: "Mobile",
    TABLET: "Tablette",
    CONNECTED_TV: "TV connectée",
    OTHER: "Autre"
  };

  return labels[value ?? ""] || "Autre";
}

function breakdownRow(label: string, row: GoogleAdsResult): GoogleAdsBreakdownRow {
  const impressions = integerValue(row.metrics?.impressions);
  const clicks = integerValue(row.metrics?.clicks);

  return {
    label,
    impressions,
    clicks,
    conversions: integerValue(row.metrics?.conversions),
    clickThroughRate: clickThroughRate(row.metrics?.ctr, clicks, impressions),
    percentage: 0
  };
}

function withPercentages(rows: GoogleAdsBreakdownRow[]): GoogleAdsBreakdownRow[] {
  const totalClicks = rows.reduce((total, row) => total + row.clicks, 0);

  return rows.map((row) => ({
    ...row,
    percentage: percentage(row.clicks, totalClicks)
  }));
}

function startOfWeek(value: string): string {
  const date = new Date(`${value}T00:00:00Z`);
  const day = date.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;

  date.setUTCDate(date.getUTCDate() + offset);

  return toDateString(date);
}

function timelineKey(date: string, granularity: StatisticsTimelineGranularity): string {
  if (granularity === "month") {
    return `${date.slice(0, 7)}-01`;
  }

  return granularity === "week" ? startOfWeek(date) : date;
}

function timelineRows(rows: GoogleAdsResult[], periodId: StatisticsPeriodId): GoogleAdsStatisticsReadyResponse["timeline"] {
  const granularity = timelineGranularity(periodId);
  const points = new Map<string, GoogleAdsTimelinePoint>();

  rows.forEach((row) => {
    const date = row.segments?.date;

    if (!date) {
      return;
    }

    const key = timelineKey(date, granularity);
    const current = points.get(key) ?? { date: key, clicks: 0, conversions: 0 };

    current.clicks += integerValue(row.metrics?.clicks);
    current.conversions += integerValue(row.metrics?.conversions);
    points.set(key, current);
  });

  return {
    granularity,
    points: Array.from(points.values()).sort((left, right) => left.date.localeCompare(right.date))
  };
}

function demoStatistics(
  solution: ClientSolutionDto,
  periodId: StatisticsPeriodId
): GoogleAdsStatisticsReadyResponse {
  const period = statisticsPeriod(periodId);
  const range = dateRange(periodId);
  const start = new Date(`${range.start}T00:00:00Z`);
  const end = new Date(`${range.end}T00:00:00Z`);
  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1);
  const timeline = Array.from({ length: days }, (_, index) => {
    const date = new Date(start);

    date.setUTCDate(date.getUTCDate() + index);

    return {
      segments: { date: toDateString(date) },
      metrics: {
        clicks: String(18 + ((index * 5) % 21)),
        conversions: String(2 + (index % 4))
      }
    } satisfies GoogleAdsResult;
  });

  return {
    status: "ready",
    provider: "google_ads",
    generatedAt: new Date().toISOString(),
    period,
    solution: {
      id: solution.id,
      name: solution.name || solution.typeLabel,
      domain: solution.domain
    },
    overview: {
      impressions: 18450,
      clicks: 812,
      conversions: 96,
      clickThroughRate: 4.4
    },
    timeline: timelineRows(timeline, periodId),
    campaigns: withPercentages([
      { label: "Campagne principale", impressions: 10230, clicks: 482, conversions: 57, clickThroughRate: 4.7, percentage: 0 },
      { label: "Recherche locale", impressions: 5280, clicks: 221, conversions: 27, clickThroughRate: 4.2, percentage: 0 },
      { label: "Marque", impressions: 2940, clicks: 109, conversions: 12, clickThroughRate: 3.7, percentage: 0 }
    ]),
    devices: withPercentages([
      { label: "Mobile", impressions: 10500, clicks: 476, conversions: 55, clickThroughRate: 4.5, percentage: 0 },
      { label: "Ordinateur", impressions: 6840, clicks: 297, conversions: 37, clickThroughRate: 4.3, percentage: 0 },
      { label: "Tablette", impressions: 1110, clicks: 39, conversions: 4, clickThroughRate: 3.5, percentage: 0 }
    ])
  };
}

export async function fetchGoogleAdsStatistics(
  env: AppEnv,
  googleAdsCustomerId: string,
  solution: ClientSolutionDto,
  periodId: StatisticsPeriodId,
  fetcher: Fetcher = fetch
): Promise<GoogleAdsStatisticsReadyResponse> {
  if (!configured(env) && !isProduction(env)) {
    return demoStatistics(solution, periodId);
  }

  if (!configured(env)) {
    throw new Error("Google Ads configuration is missing.");
  }

  const customerId = normalizeCustomerId(googleAdsCustomerId);
  const filter = dateFilter(periodId);
  const [overviewRows, timeline, campaignRows, deviceRows] = await Promise.all([
    searchStream(
      env,
      customerId,
      `SELECT metrics.impressions, metrics.clicks, metrics.conversions, metrics.ctr FROM customer WHERE ${filter}`,
      fetcher
    ),
    searchStream(
      env,
      customerId,
      `SELECT segments.date, metrics.clicks, metrics.conversions FROM customer WHERE ${filter} ORDER BY segments.date`,
      fetcher
    ),
    searchStream(
      env,
      customerId,
      `SELECT campaign.name, metrics.impressions, metrics.clicks, metrics.conversions, metrics.ctr FROM campaign WHERE ${filter} AND campaign.status = 'ENABLED' ORDER BY metrics.clicks DESC LIMIT 10`,
      fetcher
    ),
    searchStream(
      env,
      customerId,
      `SELECT segments.device, metrics.impressions, metrics.clicks, metrics.conversions, metrics.ctr FROM customer WHERE ${filter} ORDER BY metrics.clicks DESC`,
      fetcher
    )
  ]);
  const overviewRow = overviewRows[0];
  const impressions = integerValue(overviewRow?.metrics?.impressions);
  const clicks = integerValue(overviewRow?.metrics?.clicks);

  return {
    status: "ready",
    provider: "google_ads",
    generatedAt: new Date().toISOString(),
    period: statisticsPeriod(periodId),
    solution: {
      id: solution.id,
      name: solution.name || solution.typeLabel,
      domain: solution.domain
    },
    overview: {
      impressions,
      clicks,
      conversions: integerValue(overviewRow?.metrics?.conversions),
      clickThroughRate: clickThroughRate(overviewRow?.metrics?.ctr, clicks, impressions)
    },
    timeline: timelineRows(timeline, periodId),
    campaigns: withPercentages(
      campaignRows.map((row) => breakdownRow(row.campaign?.name?.trim() || "Campagne sans nom", row))
    ),
    devices: withPercentages(deviceRows.map((row) => breakdownRow(deviceLabel(row.segments?.device), row)))
  };
}
