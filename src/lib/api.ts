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
    services: ["Site internet", "Visibilité Web", "Google Ads", "Automatisation & IA"],
    sites: [
      {
        id: "SITE-0001",
        domain: "a2-cm.fr",
        url: "https://www.a2-cm.fr",
        type: "Site principal",
        status: "Actif"
      },
      {
        id: "SITE-0002",
        domain: "blog.a2-cm.fr",
        url: "https://blog.a2-cm.fr",
        type: "Blog",
        status: "Actif"
      }
    ],
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
  siteIds: string[];
  needs: InterventionNeed[];
  priority: InterventionPriority;
  message: string;
  files: File[];
};

export type InterventionRequestResponse = {
  status: "received";
  requestId: string;
};

function buildDemoRequestId(): string {
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, "");

  return `FP-${date}-DEMO`;
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
        siteIds: input.siteIds,
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
