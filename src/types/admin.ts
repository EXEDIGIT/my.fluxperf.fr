export type AdminSolutionType = "visibility_acquisition" | "automation_ai" | "assistant_ai";

export type AdminSessionResponse = {
  admin: {
    email: string;
  };
};

export type AdminCreateClientInput = {
  companyName: string;
  notes: string;
  contacts: AdminClientContactInput[];
  confirmWarnings?: boolean;
  solutions: Array<{
    type: AdminSolutionType;
    name: string;
    urlOrIndication: string;
    ga4PropertyId: string;
    googleAdsCustomerId: string;
  }>;
};

export type AdminClientContactInput = {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isPrimary: boolean;
  sendAccessEmail: boolean;
  brevoMarketingEligible: boolean;
};

export type AdminAddClientContactInput = Omit<AdminClientContactInput, "isPrimary">;

export type AdminClientSolutionInput = AdminCreateClientInput["solutions"][number];

export type AdminInterventionRequestInput = {
  requesterContactId: string;
  service: AdminSolutionType;
  solutionIds: string[];
  needs: string[];
  priority: "normal" | "urgent" | "critical";
  message: string;
  files: File[];
  sendAcknowledgment: boolean;
};

export type AdminInterventionRequestResponse = {
  status: "received";
  requestId: string;
  notification: {
    status: "requested" | "skipped";
    email: string;
  };
  history: {
    status: "logged" | "failed";
  };
};

export type AdminClientQualityWarning = {
  code: "COMPANY_EXISTS" | "ACTIVE_DOMAIN_EXISTS";
  message: string;
  matches: Array<{
    clientId: string;
    companyName: string;
    value: string;
  }>;
};

export type AdminClientQualityResponse = {
  warnings: AdminClientQualityWarning[];
};

export type AdminSolutionOption = {
  type: AdminSolutionType;
  label: string;
  defaultName: string;
  nameOptions: string[];
};

export type AdminOptionsResponse = {
  solutionOptions: AdminSolutionOption[];
};

export type AdminClientSummary = {
  id: string;
  companyName: string;
  status: string;
  portalEnabled: boolean;
  email: string;
  contactName: string;
  activeSolutions: number;
  totalSolutions: number;
  activeSolutionTypes: string[];
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  lastActivityLabel: string;
  lastConnectionAt: string;
};

export type AdminClientDetail = AdminClientSummary & {
  notes: string;
  contacts: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    status: string;
    isPrimary: boolean;
    brevoMarketingEligible: boolean;
    brevoMarketingStatus: string;
    brevoMarketingLastError: string;
  }>;
  solutions: Array<{
    id: string;
    type: string;
    status: string;
    name: string;
    domain: string;
    urlOrIndication: string;
    activatedAt: string;
    notes: string;
    ga4PropertyId: string;
    googleAdsCustomerId: string;
  }>;
  actions: Array<{
    id: string;
    date: string;
    type: string;
    label: string;
    reference: string;
    requesterEmail: string;
    status: string;
  }>;
  timeline: Array<{
    id: string;
    kind: "action" | "connection";
    date: string;
    label: string;
    reference: string;
    status: string;
    source: string;
    details: string;
  }>;
};

export type AdminClientsResponse = {
  clients: AdminClientSummary[];
};

export type AdminClientDetailResponse = {
  client: AdminClientDetail;
};

export type AdminDashboard = {
  generatedAt: string;
  totals: {
    activeClients: number;
    totalClients: number;
    activeSolutions: number;
    interventionRequests12Months: number;
    interventionRequestsAveragePerMonth: number;
    interventionRequestsAveragePerActiveClient: number;
    connections12Months: number;
    connectionsAveragePerMonth: number;
  };
  interventionRequestsByMonth: Array<{
    month: string;
    label: string;
    count: number;
  }>;
  topInterventionClients: Array<{
    clientId: string;
    companyName: string;
    count: number;
  }>;
  topConnectionClients: Array<{
    clientId: string;
    companyName: string;
    count: number;
  }>;
  toProcess: {
    recentInterventionRequests: Array<{
      id: string;
      clientId: string;
      companyName: string;
      date: string;
      label: string;
      reference: string;
      requesterEmail: string;
    }>;
    clientsWithoutRecentConnection: Array<{
      clientId: string;
      companyName: string;
      email: string;
      lastConnectionAt: string;
      createdAt: string;
      reason: string;
    }>;
  };
};

export type AdminDashboardResponse = {
  dashboard: AdminDashboard;
};

export type AdminOverviewResponse = {
  solutionOptions: AdminSolutionOption[];
  clients: AdminClientSummary[];
  dashboard: AdminDashboard;
  selectedClient: AdminClientDetail | null;
};

export type AdminMonthlyReportListItem = {
  id: string;
  clientId: string;
  companyName: string;
  periodKey: string;
  status: string;
  generationStatus: string;
  generatedAt: string | null;
  sentAt: string | null;
  deliveryCount: number;
  sentCount: number;
  failedCount: number;
  unknownCount: number;
  errorMessage: string | null;
};

export type AdminMonthlyReportDetail = AdminMonthlyReportListItem & {
  periodStart: string;
  periodEnd: string;
  insight: string | null;
  report: Record<string, unknown> | null;
  deliveries: Array<{
    id: string;
    contactId: string;
    recipientEmail: string;
    recipientName: string;
    status: string;
    attempts: number;
    sentAt: string | null;
    errorMessage: string | null;
  }>;
};

export type AdminMonthlyReportsResponse = { reports: AdminMonthlyReportListItem[] };
export type AdminMonthlyReportDetailResponse = { report: AdminMonthlyReportDetail };
export type AdminMonthlyReportRetryResponse = { status: "queued" };
export type AdminMonthlyReportTestResponse = {
  status: "sent" | "partial" | "failed";
  recipientCount: number;
  sentCount: number;
  analyticsStatus: string;
  availableProperties: number;
};

export type AdminClientActionResponse = {
  status: "deactivated" | "created" | "reactivated" | "updated" | "synced" | "unlinked" | "failed";
  clientId: string;
  solutionId?: string;
  contactId?: string;
  activeSolutions?: number;
  auth?: {
    status: "banned" | "unbanned" | "not_found" | "skipped" | "failed";
    email: string;
    reason?: string;
  };
  authResults?: Array<{
    status: "banned" | "unbanned" | "not_found" | "skipped" | "failed";
    email: string;
    reason?: string;
  }>;
  notification?: {
    status: "sent" | "skipped" | "failed";
    email: string;
    reason?: string;
  };
  brevoMarketing?: {
    status: "synced" | "unlinked" | "failed";
    email: string;
    reason?: string;
  };
};

export type AdminWelcomeEmailResponse = {
  status: "sent" | "skipped";
  clientId: string;
  notification: AdminCreateClientResponse["notification"];
  sentBy: string;
};

export type AdminCreateClientResponse = {
  status: "created";
  client: {
    id: string;
    companyName: string;
    email: string;
    solutionsCreated: number;
  };
  supabaseUser: {
    status: "created" | "already_exists" | "skipped";
    email: string;
    reason?: string;
  };
  contactsCreated?: number;
  supabaseUsers?: Array<{
    status: "created" | "already_exists" | "skipped";
    email: string;
    reason?: string;
  }>;
  notification: {
    status: "sent" | "skipped" | "failed";
    email: string;
    reason?: string;
  };
  marketingSyncs?: Array<{
    contactId: string;
    status: "synced" | "failed";
    email: string;
    reason?: string;
  }>;
  createdBy: string;
};
