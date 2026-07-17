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
        activatedAt: "2026-07-06"
      },
      {
        id: "SOL-0002",
        type: "visibility_acquisition",
        typeLabel: "Flux Visibilité & Acquisition",
        status: "Actif",
        name: "Flux Visibilité & Acquisition • Site e-shop",
        domain: "blog.a2-cm.fr",
        url: "https://blog.a2-cm.fr",
        activatedAt: "2026-07-06"
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
  | "seo"
  | "advertising_campaign"
  | "automation"
  | "ai_assistant"
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
      throw new ApiError(response.status || 500, "INVALID_RESPONSE", "RÃ©ponse API invalide.");
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
