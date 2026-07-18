import type { ApiErrorResponse } from "../types/client";
import type {
  AdminCreateClientInput,
  AdminCreateClientResponse,
  AdminClientActionResponse,
  AdminClientDetailResponse,
  AdminClientsResponse,
  AdminDashboardResponse,
  AdminOptionsResponse,
  AdminSessionResponse
} from "../types/admin";
import { ApiError } from "./api";
import { getSupabaseAccessToken } from "./supabase";

async function adminFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getSupabaseAccessToken();
  const headers = new Headers(init.headers);

  headers.set("Accept", "application/json");

  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  if (accessToken) {
    headers.set("Authorization", `Bearer ${accessToken}`);
  }

  const response = await fetch(url, {
    ...init,
    headers
  });
  const contentType = response.headers.get("Content-Type") ?? "";

  if (!contentType.includes("application/json")) {
    throw new ApiError(response.status || 500, "INVALID_RESPONSE", "Reponse API invalide.");
  }

  const data = (await response.json()) as T & ApiErrorResponse;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      data.error?.code || "API_ERROR",
      data.error?.message || "Une erreur est survenue."
    );
  }

  return data;
}

export function getAdminSession(): Promise<AdminSessionResponse> {
  return adminFetch<AdminSessionResponse>("/api/admin/session");
}

export function getAdminOptions(): Promise<AdminOptionsResponse> {
  return adminFetch<AdminOptionsResponse>("/api/admin/options");
}

export function getAdminClients(): Promise<AdminClientsResponse> {
  return adminFetch<AdminClientsResponse>("/api/admin/clients");
}

export function getAdminClient(clientId: string): Promise<AdminClientDetailResponse> {
  return adminFetch<AdminClientDetailResponse>(`/api/admin/clients/${encodeURIComponent(clientId)}`);
}

export function getAdminDashboard(): Promise<AdminDashboardResponse> {
  return adminFetch<AdminDashboardResponse>("/api/admin/dashboard");
}

export function createAdminClient(input: AdminCreateClientInput): Promise<AdminCreateClientResponse> {
  return adminFetch<AdminCreateClientResponse>("/api/admin/clients", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function deactivateAdminClient(clientId: string): Promise<AdminClientActionResponse> {
  return adminFetch<AdminClientActionResponse>(`/api/admin/clients/${encodeURIComponent(clientId)}/deactivate`, {
    method: "POST"
  });
}

export function addAdminClientSolution(
  clientId: string,
  input: AdminCreateClientInput["solutions"][number]
): Promise<AdminClientActionResponse> {
  return adminFetch<AdminClientActionResponse>(`/api/admin/clients/${encodeURIComponent(clientId)}/solutions`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function deactivateAdminClientSolution(
  clientId: string,
  solutionId: string
): Promise<AdminClientActionResponse> {
  return adminFetch<AdminClientActionResponse>(
    `/api/admin/clients/${encodeURIComponent(clientId)}/solutions/${encodeURIComponent(solutionId)}/deactivate`,
    {
      method: "POST"
    }
  );
}

export function reactivateAdminClientSolution(
  clientId: string,
  solutionId: string
): Promise<AdminClientActionResponse> {
  return adminFetch<AdminClientActionResponse>(
    `/api/admin/clients/${encodeURIComponent(clientId)}/solutions/${encodeURIComponent(solutionId)}/reactivate`,
    {
      method: "POST"
    }
  );
}
