export type ClientImpactKey = "visibility_acquisition" | "automation_ai" | "assistant_ai";

export type ClientSolutionPlaceholderKey =
  | ClientImpactKey
  | "google_ads"
  | "social_media";

export type ClientSolutionThumbnail = {
  kind: "website" | "placeholder";
  endpoint: string | null;
  placeholderKey: ClientSolutionPlaceholderKey;
};

export type ClientStatisticsStatus = "available" | "pending_setup" | "not_applicable";

export type ClientStatisticsProvider = "ga4" | "google_ads" | null;

export type ClientSolutionStatistics = {
  status: ClientStatisticsStatus;
  provider: ClientStatisticsProvider;
};

export type ClientSolution = {
  id: string;
  type: string;
  typeLabel: string;
  status: string;
  name: string;
  domain: string;
  url: string;
  activatedAt: string;
  thumbnail: ClientSolutionThumbnail;
  statistics: ClientSolutionStatistics;
};

export type ClientImpactItem = {
  key: ClientImpactKey;
  label: string;
  quantity: number;
  weeklyHours: number;
  monthlyHours: number;
};

export type ClientImpact = {
  weeklyHours: number;
  monthlyHours: number;
  items: ClientImpactItem[];
  isEstimated: true;
};

export type Client = {
  id: string;
  status: string;
  companyName: string;
  firstName: string;
  lastName: string;
  planLabel: string;
  services: string[];
  solutions: ClientSolution[];
  impact: ClientImpact;
  links: {
    request: string | null;
    support: string | null;
    report: string | null;
    resources: string | null;
  };
  fluxperfContact: {
    name: string;
    email: string;
  };
  latestActions: Array<{
    label: string;
    date: string;
  }>;
};

export type MeResponse = {
  user: {
    email: string;
  };
  client: Client;
};

export type ApiErrorResponse = {
  error?: {
    code?: string;
    message?: string;
  };
};
