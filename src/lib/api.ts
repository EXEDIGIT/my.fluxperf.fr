import type { ApiErrorResponse, MeResponse } from "../types/client";
import { getSupabaseAccessToken } from "./supabase";

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

const demoResponse: MeResponse = {
  user: {
    email: "contact@a2-cm.fr"
  },
  client: {
    id: "a2cm",
    status: "active",
    companyName: "A2-CM",
    firstName: "Anthony",
    lastName: "Dupont",
    planLabel: "Abonnement actif",
    services: [
      "Flux Visibilité & Acquisition • Site web - a2-cm.fr",
      "Flux Automatisation & IA : Reporting automatique",
      "Flux Assistant IA : Assistant support"
    ],
    solutions: [
      {
        id: "SOL-0001",
        type: "visibility_acquisition",
        typeLabel: "Flux Visibilité & Acquisition",
        status: "Actif",
        name: "Flux Visibilité & Acquisition • Site web",
        domain: "a2-cm.fr",
        url: "https://www.a2-cm.fr",
        activatedAt: "2026-07-06",
        thumbnail: {
          kind: "website",
          endpoint: "/api/thumbnails/SOL-0001",
          placeholderKey: "visibility_acquisition"
        },
        statistics: {
          status: "available",
          provider: "ga4"
        }
      },
      {
        id: "SOL-0002",
        type: "visibility_acquisition",
        typeLabel: "Flux Visibilité & Acquisition",
        status: "Actif",
        name: "Flux Visibilité & Acquisition • Site e-shop",
        domain: "blog.a2-cm.fr",
        url: "https://blog.a2-cm.fr",
        activatedAt: "2026-07-06",
        thumbnail: {
          kind: "website",
          endpoint: "/api/thumbnails/SOL-0002",
          placeholderKey: "visibility_acquisition"
        },
        statistics: {
          status: "pending_setup",
          provider: "ga4"
        }
      },
      {
        id: "SOL-0003",
        type: "automation_ai",
        typeLabel: "Flux Automatisation & IA",
        status: "Actif",
        name: "Flux Automatisation & IA - Tableau de bord",
        domain: "",
        url: "Centralisation KPIs",
        activatedAt: "2026-07-06",
        thumbnail: {
          kind: "placeholder",
          endpoint: null,
          placeholderKey: "automation_ai"
        },
        statistics: {
          status: "not_applicable",
          provider: null
        }
      },
      {
        id: "SOL-0004",
        type: "assistant_ai",
        typeLabel: "Flux Assistant IA",
        status: "Actif",
        name: "Flux Assistant IA - Copilote entreprise",
        domain: "",
        url: "",
        activatedAt: "2026-07-06",
        thumbnail: {
          kind: "placeholder",
          endpoint: null,
          placeholderKey: "assistant_ai"
        },
        statistics: {
          status: "not_applicable",
          provider: null
        }
      }
    ],
    impact: {
      weeklyHours: 4.5,
      monthlyHours: 19.5,
      items: [
        {
          key: "visibility_acquisition",
          label: "Visibilité & Acquisition",
          quantity: 1,
          weeklyHours: 1.5,
          monthlyHours: 6.5
        },
        {
          key: "automation_ai",
          label: "Automatisation & IA",
          quantity: 1,
          weeklyHours: 1,
          monthlyHours: 4.5
        },
        {
          key: "assistant_ai",
          label: "Assistant IA",
          quantity: 1,
          weeklyHours: 2,
          monthlyHours: 8.5
        }
      ],
      isEstimated: true
    },
    links: {
      request: "https://form.jotform.com/240000000000000",
      support: "https://form.jotform.com/240000000000001",
      report: null,
      resources: "/ressources"
    },
    fluxperfContact: {
      name: "Tristan",
      email: "hello@fluxperf.fr"
    },
    latestActions: [
      {
        label: "Demande de modification envoyée",
        date: "Il y a 2h"
      },
      {
        label: "Rapport mensuel disponible",
        date: "Il y a 1j"
      },
      {
        label: "Support en cours de traitement",
        date: "Il y a 2j"
      }
    ]
  }
};

function shouldUseViteDemoFallback(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_DISABLE_DEMO_FALLBACK !== "true";
}

export async function getMe(): Promise<MeResponse> {
  try {
    const accessToken = await getSupabaseAccessToken();
    const headers: HeadersInit = {
      Accept: "application/json"
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch("/api/me", {
      headers
    });
    const contentType = response.headers.get("Content-Type") ?? "";

    if (!contentType.includes("application/json")) {
      throw new ApiError(response.status || 500, "INVALID_RESPONSE", "Réponse API invalide.");
    }

    const data = (await response.json()) as MeResponse & ApiErrorResponse;

    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.error?.code || "API_ERROR",
        data.error?.message || "Une erreur est survenue."
      );
    }

    return data;
  } catch (error) {
    if (shouldUseViteDemoFallback()) {
      return demoResponse;
    }

    throw error;
  }
}

export type InterventionService = "visibility_acquisition" | "automation_ai" | "assistant_ai";
export type InterventionPriority = "normal" | "urgent" | "critical";
export type InterventionNeed =
  | "content_update"
  | "technical_issue"
  | "new_creation"
  | "page_creation"
  | "seo"
  | "advertising_campaign"
  | "tracking_analytics"
  | "performance_optimization"
  | "automation"
  | "dashboard_reporting"
  | "process_automation"
  | "tool_integration"
  | "workflow_issue"
  | "data_sync"
  | "ai_prompt_optimization"
  | "scenario_improvement"
  | "ai_assistant"
  | "answer_adjustment"
  | "knowledge_base"
  | "prompt_instructions"
  | "access_issue"
  | "new_capability"
  | "conversation_analysis"
  | "user_support"
  | "other";

export type InterventionRequestInput = {
  service: InterventionService;
  solutionIds: string[];
  needs: InterventionNeed[];
  priority: InterventionPriority;
  message: string;
  files: File[];
};

export type InterventionRequestResponse = {
  status: "received";
  requestId: string;
};

export type SupportRequestInput = {
  subject: string;
  message: string;
};

export type SupportRequestResponse = {
  status: "received";
  requestId: string;
};

export type AccessRequestInput = {
  firstName: string;
  lastName: string;
  email: string;
  companyName: string;
  referrer: string;
  message: string;
  website: string;
};

export type AccessRequestResponse = {
  status: "received";
  requestId: string;
};

export type StatisticsPeriod = {
  id: "7d" | "30d" | "90d" | "365d";
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

export type StatisticsTimelineGranularity = "day" | "week" | "month";

export type StatisticsTimelinePoint = {
  date: string;
  visits: number;
};

export type StatisticsGa4ReadyResponse = {
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

export type StatisticsGoogleAdsBreakdownRow = {
  label: string;
  impressions: number;
  clicks: number;
  conversions: number;
  clickThroughRate: number;
  percentage: number;
};

export type StatisticsGoogleAdsTimelinePoint = {
  date: string;
  clicks: number;
  conversions: number;
};

export type StatisticsGoogleAdsReadyResponse = {
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
    points: StatisticsGoogleAdsTimelinePoint[];
  };
  campaigns: StatisticsGoogleAdsBreakdownRow[];
  devices: StatisticsGoogleAdsBreakdownRow[];
};

export type StatisticsPendingResponse = {
  status: "pending_setup";
  provider: "ga4" | "google_ads";
  period: StatisticsPeriod;
  solution: {
    id: string;
    name: string;
    domain: string;
  };
};

export type StatisticsReadyResponse = StatisticsGa4ReadyResponse | StatisticsGoogleAdsReadyResponse;
export type StatisticsResponse = StatisticsReadyResponse | StatisticsPendingResponse;
export type StatisticsPeriodId = StatisticsPeriod["id"];

function buildDemoRequestId(): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const date = `${part("day")}${part("month")}${part("year")}`;

  return `FP-${date}-DEMO`;
}

function buildAccessDemoRequestId(): string {
  const parts = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).formatToParts(new Date());
  const part = (type: string) => parts.find((item) => item.type === type)?.value ?? "";
  const date = `${part("day")}${part("month")}${part("year")}`;

  return `ACC-${date}-DEMO`;
}

function demoPeriod(period: StatisticsPeriodId): StatisticsPeriod {
  const labels: Record<StatisticsPeriodId, string> = {
    "7d": "7 derniers jours",
    "30d": "30 derniers jours",
    "90d": "90 derniers jours",
    "365d": "Depuis 1 an"
  };

  return {
    id: period,
    label: labels[period],
    startDate: period === "365d" ? "365daysAgo" : `${period.replace("d", "")}daysAgo`,
    endDate: "yesterday"
  };
}

function buildDemoTimeline(period: StatisticsPeriodId, totalVisits: number): StatisticsGa4ReadyResponse["timeline"] {
  const granularity: StatisticsTimelineGranularity = period === "365d" ? "month" : period === "90d" ? "week" : "day";
  const pointCount = period === "7d" ? 7 : period === "30d" ? 30 : period === "90d" ? 13 : 12;
  const weights = Array.from({ length: pointCount }, (_, index) => 0.72 + ((index * 7) % 11) / 20 + Math.sin(index / 2.4) * 0.18);
  const weightTotal = weights.reduce((sum, value) => sum + value, 0);
  const yesterday = new Date();

  yesterday.setHours(0, 0, 0, 0);
  yesterday.setDate(yesterday.getDate() - 1);

  const points = weights.map((weight, index) => {
    const date = new Date(yesterday);

    if (granularity === "month") {
      date.setDate(1);
      date.setMonth(date.getMonth() - (pointCount - index - 1));
    } else {
      date.setDate(date.getDate() - (pointCount - index - 1) * (granularity === "week" ? 7 : 1));
    }

    return {
      date: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      visits: Math.floor((totalVisits * weight) / weightTotal)
    };
  });
  const assignedVisits = points.reduce((sum, point) => sum + point.visits, 0);

  points[points.length - 1].visits += totalVisits - assignedVisits;

  return { granularity, points };
}

function buildDemoStatistics(solutionId: string, period: StatisticsPeriodId): StatisticsResponse {
  if (solutionId === "SOL-0002") {
    return {
      status: "pending_setup",
      provider: "ga4",
      period: demoPeriod(period),
      solution: {
        id: solutionId,
        name: "Flux Visibilite & Acquisition - Site e-shop",
        domain: "blog.a2-cm.fr"
      }
    };
  }

  return {
    status: "ready",
    provider: "ga4",
    generatedAt: new Date().toISOString(),
    period: demoPeriod(period),
    solution: {
      id: solutionId,
      name: "Flux Visibilite & Acquisition - Site web",
      domain: "a2-cm.fr"
    },
    overview: {
      visits: 2284,
      uniqueVisitors: 1812,
      averageVisitDurationSeconds: 104,
      topEvents: [
        { label: "Formulaire envoye", eventName: "generate_lead", count: 38, percentage: 44.2 },
        { label: "Clic", eventName: "click", count: 24, percentage: 27.9 },
        { label: "Telechargement", eventName: "file_download", count: 14, percentage: 16.3 },
        { label: "Recherche interne", eventName: "search", count: 10, percentage: 11.6 }
      ],
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
      topPages: [
        { label: "/ • Page d’accueil", views: 1420, percentage: 42.1, averageVisitDurationSeconds: 74 },
        { label: "/contact", views: 520, percentage: 15.4, averageVisitDurationSeconds: 88 },
        { label: "/services", views: 470, percentage: 13.9, averageVisitDurationSeconds: 112 },
        { label: "/realisations", views: 310, percentage: 9.2, averageVisitDurationSeconds: 96 },
        { label: "/blog", views: 220, percentage: 6.5, averageVisitDurationSeconds: 64 }
      ]
    },
    timeline: buildDemoTimeline(period, 2284),
    acquisition: {
      channels: [
        { label: "SEO", description: "Moteurs de recherche", sessions: 1240, activeUsers: 960, percentage: 54.3, averageVisitDurationSeconds: 118 },
        { label: "Direct", description: "Adresse saisie, favori ou origine non détectée", sessions: 520, activeUsers: 430, percentage: 22.8, averageVisitDurationSeconds: 82 },
        { label: "Sites référents", description: "Liens depuis d’autres sites", sessions: 270, activeUsers: 210, percentage: 11.8, averageVisitDurationSeconds: 96 },
        { label: "Social", description: "Réseaux sociaux", sessions: 190, activeUsers: 160, percentage: 8.3, averageVisitDurationSeconds: 54 },
        { label: "IA GEO", description: "Assistants IA", sessions: 64, activeUsers: 52, percentage: 2.8, averageVisitDurationSeconds: 74 }
      ],
      sources: [
        { label: "Google", description: "Moteur de recherche", sessions: 980, activeUsers: 760, percentage: 42.9, averageVisitDurationSeconds: 122 },
        { label: "Accès direct", description: "Origine non détectée", sessions: 520, activeUsers: 430, percentage: 22.8, averageVisitDurationSeconds: 82 },
        { label: "Bing", description: "Moteur de recherche", sessions: 180, activeUsers: 140, percentage: 7.9, averageVisitDurationSeconds: 104 },
        { label: "linkedin.com", description: "Site référent", sessions: 120, activeUsers: 96, percentage: 5.3, averageVisitDurationSeconds: 68 }
      ]
    },
    behavior: {
      pages: [
        { label: "/ • Page d’accueil", views: 1420, percentage: 42.1, averageVisitDurationSeconds: 74 },
        { label: "/contact", views: 520, percentage: 15.4, averageVisitDurationSeconds: 88 },
        { label: "/services", views: 470, percentage: 13.9, averageVisitDurationSeconds: 112 },
        { label: "/realisations", views: 310, percentage: 9.2, averageVisitDurationSeconds: 96 },
        { label: "/blog", views: 220, percentage: 6.5, averageVisitDurationSeconds: 64 }
      ],
      events: [
        { label: "Formulaire envoye", eventName: "generate_lead", count: 38, percentage: 44.2 },
        { label: "Clic", eventName: "click", count: 24, percentage: 27.9 },
        { label: "Telechargement", eventName: "file_download", count: 14, percentage: 16.3 },
        { label: "Recherche interne", eventName: "search", count: 10, percentage: 11.6 }
      ]
    }
  };
}

export async function submitInterventionRequest(
  input: InterventionRequestInput
): Promise<InterventionRequestResponse> {
  try {
    const accessToken = await getSupabaseAccessToken();
    const headers: HeadersInit = {
      Accept: "application/json"
    };
    const formData = new FormData();

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    formData.append(
      "payload",
      JSON.stringify({
        service: input.service,
        solutionIds: input.solutionIds,
        needs: input.needs,
        priority: input.priority,
        message: input.message
      })
    );
    input.files.forEach((file) => formData.append("files[]", file, file.name));

    const response = await fetch("/api/intervention-requests", {
      method: "POST",
      headers,
      body: formData
    });
    const contentType = response.headers.get("Content-Type") ?? "";

    if (!contentType.includes("application/json")) {
      throw new ApiError(response.status || 500, "INVALID_RESPONSE", "Réponse API invalide.");
    }

    const data = (await response.json()) as InterventionRequestResponse & ApiErrorResponse;

    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.error?.code || "API_ERROR",
        data.error?.message || "Une erreur est survenue."
      );
    }

    return data;
  } catch (error) {
    if (shouldUseViteDemoFallback()) {
      return {
        status: "received",
        requestId: buildDemoRequestId()
      };
    }

    throw error;
  }
}

export async function submitSupportRequest(
  input: SupportRequestInput
): Promise<SupportRequestResponse> {
  try {
    const accessToken = await getSupabaseAccessToken();
    const headers: HeadersInit = {
      Accept: "application/json",
      "Content-Type": "application/json"
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch("/api/support-requests", {
      method: "POST",
      headers,
      body: JSON.stringify({
        subject: input.subject,
        message: input.message
      })
    });
    const contentType = response.headers.get("Content-Type") ?? "";

    if (!contentType.includes("application/json")) {
      throw new ApiError(response.status || 500, "INVALID_RESPONSE", "Reponse API invalide.");
    }

    const data = (await response.json()) as SupportRequestResponse & ApiErrorResponse;

    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.error?.code || "API_ERROR",
        data.error?.message || "Une erreur est survenue."
      );
    }

    return data;
  } catch (error) {
    if (shouldUseViteDemoFallback()) {
      return {
        status: "received",
        requestId: buildDemoRequestId()
      };
    }

    throw error;
  }
}

export async function submitAccessRequest(
  input: AccessRequestInput
): Promise<AccessRequestResponse> {
  try {
    const response = await fetch("/api/access-requests", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        firstName: input.firstName,
        lastName: input.lastName,
        email: input.email,
        companyName: input.companyName,
        referrer: input.referrer,
        message: input.message,
        website: input.website
      })
    });
    const contentType = response.headers.get("Content-Type") ?? "";

    if (!contentType.includes("application/json")) {
      throw new ApiError(response.status || 500, "INVALID_RESPONSE", "Reponse API invalide.");
    }

    const data = (await response.json()) as AccessRequestResponse & ApiErrorResponse;

    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.error?.code || "API_ERROR",
        data.error?.message || "Une erreur est survenue."
      );
    }

    return data;
  } catch (error) {
    if (shouldUseViteDemoFallback()) {
      return {
        status: "received",
        requestId: buildAccessDemoRequestId()
      };
    }

    throw error;
  }
}

export async function getStatistics(
  solutionId: string,
  period: StatisticsPeriodId
): Promise<StatisticsResponse> {
  try {
    const accessToken = await getSupabaseAccessToken();
    const headers: HeadersInit = {
      Accept: "application/json"
    };

    if (accessToken) {
      headers.Authorization = `Bearer ${accessToken}`;
    }

    const response = await fetch(
      `/api/statistics/${encodeURIComponent(solutionId)}?period=${encodeURIComponent(period)}`,
      {
        headers
      }
    );
    const contentType = response.headers.get("Content-Type") ?? "";

    if (!contentType.includes("application/json")) {
      throw new ApiError(response.status || 500, "INVALID_RESPONSE", "Reponse API invalide.");
    }

    const data = (await response.json()) as StatisticsResponse & ApiErrorResponse;

    if (!response.ok) {
      throw new ApiError(
        response.status,
        data.error?.code || "API_ERROR",
        data.error?.message || "Une erreur est survenue."
      );
    }

    return data;
  } catch (error) {
    if (shouldUseViteDemoFallback()) {
      return buildDemoStatistics(solutionId, period);
    }

    throw error;
  }
}
