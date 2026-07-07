import type { ApiErrorResponse, MeResponse } from "../types/client";

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
    const response = await fetch("/api/me", {
      headers: {
        Accept: "application/json"
      }
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

