export type AdminSolutionType = "visibility_acquisition" | "automation_ai" | "assistant_ai";

export type AdminSessionResponse = {
  admin: {
    email: string;
  };
};

export type AdminCreateClientInput = {
  companyName: string;
  contactFirstName: string;
  contactLastName: string;
  email: string;
  notes: string;
  notifyClient: boolean;
  confirmWarnings?: boolean;
  solutions: Array<{
    type: AdminSolutionType;
    name: string;
    urlOrIndication: string;
    ga4PropertyId: string;
    googleAdsCustomerId: string;
  }>;
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

export type AdminClientActionResponse = {
  status: "deactivated" | "created" | "reactivated";
  clientId: string;
  solutionId?: string;
  activeSolutions?: number;
  auth?: {
    status: "banned" | "unbanned" | "not_found" | "skipped" | "failed";
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
  notification: {
    status: "sent" | "skipped" | "failed";
    email: string;
    reason?: string;
  };
  createdBy: string;
};
