import type { ApiErrorResponse } from "../types/client";
import type {
  AdminCreateClientInput,
  AdminClientSolutionInput,
  AdminCreateClientResponse,
  AdminAddClientContactInput,
  AdminClientActionResponse,
  AdminClientDetailResponse,
  AdminClientsResponse,
  AdminClientQualityResponse,
  AdminDashboardResponse,
  AdminOverviewResponse,
  AdminOptionsResponse,
  AdminSessionResponse,
  AdminWelcomeEmailResponse,
  AdminMonthlyReportsResponse,
  AdminMonthlyReportDetailResponse,
  AdminMonthlyReportRetryResponse,
  AdminMonthlyReportTestResponse,
  AdminInterventionRequestInput,
  AdminInterventionRequestResponse
} from "../types/admin";
import { ApiError } from "./api";
import { getSupabaseAccessToken } from "./supabase";

async function adminFetch<T>(url: string, init: RequestInit = {}): Promise<T> {
  const accessToken = await getSupabaseAccessToken();
  const headers = new Headers(init.headers);

  headers.set("Accept", "application/json");

  if (init.body && !(init.body instanceof FormData)) {
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

export function getAdminOverview(clientId?: string): Promise<AdminOverviewResponse> {
  const query = clientId ? `?clientId=${encodeURIComponent(clientId)}` : "";

  return adminFetch<AdminOverviewResponse>(`/api/admin/overview${query}`);
}

export function getAdminMonthlyReports(): Promise<AdminMonthlyReportsResponse> {
  return adminFetch<AdminMonthlyReportsResponse>("/api/admin/monthly-reports");
}

export function getAdminMonthlyReport(reportId: string): Promise<AdminMonthlyReportDetailResponse> {
  return adminFetch<AdminMonthlyReportDetailResponse>(`/api/admin/monthly-reports/${encodeURIComponent(reportId)}`);
}

export function retryAdminMonthlyReport(reportId: string, deliveryId?: string): Promise<AdminMonthlyReportRetryResponse> {
  return adminFetch<AdminMonthlyReportRetryResponse>(`/api/admin/monthly-reports/${encodeURIComponent(reportId)}/retry`, {
    method: "POST",
    body: JSON.stringify(deliveryId ? { deliveryId } : {})
  });
}

export function sendAdminMonthlyReportTest(clientId: string): Promise<AdminMonthlyReportTestResponse> {
  return adminFetch<AdminMonthlyReportTestResponse>("/api/admin/monthly-reports/test", {
    method: "POST",
    body: JSON.stringify({ clientId })
  });
}

export function createAdminClient(input: AdminCreateClientInput): Promise<AdminCreateClientResponse> {
  return adminFetch<AdminCreateClientResponse>("/api/admin/clients", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function checkAdminClientQuality(input: AdminCreateClientInput): Promise<AdminClientQualityResponse> {
  return adminFetch<AdminClientQualityResponse>("/api/admin/clients/quality-check", {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function deactivateAdminClient(clientId: string): Promise<AdminClientActionResponse> {
  return adminFetch<AdminClientActionResponse>(`/api/admin/clients/${encodeURIComponent(clientId)}/deactivate`, {
    method: "POST"
  });
}

export function reactivateAdminClient(clientId: string): Promise<AdminClientActionResponse> {
  return adminFetch<AdminClientActionResponse>(`/api/admin/clients/${encodeURIComponent(clientId)}/reactivate`, {
    method: "POST"
  });
}

export function sendAdminClientWelcomeEmail(clientId: string): Promise<AdminWelcomeEmailResponse> {
  return adminFetch<AdminWelcomeEmailResponse>(`/api/admin/clients/${encodeURIComponent(clientId)}/welcome-email`, {
    method: "POST"
  });
}

export function addAdminClientContact(
  clientId: string,
  input: AdminAddClientContactInput
): Promise<AdminClientActionResponse> {
  return adminFetch<AdminClientActionResponse>(`/api/admin/clients/${encodeURIComponent(clientId)}/contacts`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function deactivateAdminClientContact(clientId: string, contactId: string): Promise<AdminClientActionResponse> {
  return adminFetch<AdminClientActionResponse>(
    `/api/admin/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(contactId)}/deactivate`,
    { method: "POST" }
  );
}

export function reactivateAdminClientContact(clientId: string, contactId: string): Promise<AdminClientActionResponse> {
  return adminFetch<AdminClientActionResponse>(
    `/api/admin/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(contactId)}/reactivate`,
    { method: "POST" }
  );
}

export function syncAdminClientContactWithBrevo(clientId: string, contactId: string): Promise<AdminClientActionResponse> {
  return adminFetch<AdminClientActionResponse>(
    `/api/admin/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(contactId)}/brevo-sync`,
    { method: "POST" }
  );
}

export function sendAdminClientContactWelcomeEmail(clientId: string, contactId: string): Promise<AdminWelcomeEmailResponse> {
  return adminFetch<AdminWelcomeEmailResponse>(
    `/api/admin/clients/${encodeURIComponent(clientId)}/contacts/${encodeURIComponent(contactId)}/welcome-email`,
    { method: "POST" }
  );
}

export function addAdminClientSolution(
  clientId: string,
  input: AdminClientSolutionInput
): Promise<AdminClientActionResponse> {
  return adminFetch<AdminClientActionResponse>(`/api/admin/clients/${encodeURIComponent(clientId)}/solutions`, {
    method: "POST",
    body: JSON.stringify(input)
  });
}

export function updateAdminClientSolution(
  clientId: string,
  solutionId: string,
  input: AdminClientSolutionInput
): Promise<AdminClientActionResponse> {
  return adminFetch<AdminClientActionResponse>(
    `/api/admin/clients/${encodeURIComponent(clientId)}/solutions/${encodeURIComponent(solutionId)}`,
    {
      method: "PUT",
      body: JSON.stringify(input)
    }
  );
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

export function submitAdminInterventionRequest(
  clientId: string,
  input: AdminInterventionRequestInput
): Promise<AdminInterventionRequestResponse> {
  const formData = new FormData();

  formData.append(
    "payload",
    JSON.stringify({
      requesterContactId: input.requesterContactId,
      service: input.service,
      solutionIds: input.solutionIds,
      needs: input.needs,
      priority: input.priority,
      message: input.message,
      sendAcknowledgment: input.sendAcknowledgment
    })
  );
  input.files.forEach((file) => formData.append("files[]", file, file.name));

  return adminFetch<AdminInterventionRequestResponse>(
    `/api/admin/clients/${encodeURIComponent(clientId)}/intervention-requests`,
    {
      method: "POST",
      body: formData
    }
  );
}
