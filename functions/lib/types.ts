export type AppEnv = {
  APP_ENV?: string;
  GOOGLE_SHEET_ID?: string;
  GOOGLE_SHEET_RANGE?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  DEV_AUTH_EMAIL?: string;
  DEV_ADMIN_EMAIL?: string;
  ADMIN_EMAILS?: string;
  APP_PUBLIC_URL?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
  GOOGLE_CONTACTS_RANGE?: string;
  GOOGLE_SOLUTIONS_RANGE?: string;
  GOOGLE_ACTIONS_RANGE?: string;
  GOOGLE_CLIENTS_WRITE_RANGE?: string;
  GOOGLE_CONTACTS_WRITE_RANGE?: string;
  GOOGLE_SOLUTIONS_WRITE_RANGE?: string;
  N8N_INTERVENTION_WEBHOOK_URL?: string;
  N8N_INTERVENTION_WEBHOOK_SECRET?: string;
  BREVO_API_KEY?: string;
};

export type PagesContext = {
  request: Request;
  env: AppEnv;
};

export type ClientSolutionDto = {
  id: string;
  type: string;
  typeLabel: string;
  status: string;
  name: string;
  domain: string;
  url: string;
  activatedAt: string;
};

export type ClientImpactKey = "visibility_acquisition" | "automation_ai" | "assistant_ai";

export type ClientImpactItemDto = {
  key: ClientImpactKey;
  label: string;
  quantity: number;
  weeklyHours: number;
  monthlyHours: number;
};

export type ClientImpactDto = {
  weeklyHours: number;
  monthlyHours: number;
  items: ClientImpactItemDto[];
  isEstimated: true;
};

export type ClientDto = {
  id: string;
  status: string;
  companyName: string;
  firstName: string;
  lastName: string;
  planLabel: string;
  services: string[];
  solutions: ClientSolutionDto[];
  impact: ClientImpactDto;
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

export type RawClientRow = {
  client_id: string;
  status: string;
  company_name: string;
  contact_first_name: string;
  contact_last_name: string;
  primary_email: string;
  allowed_emails: string;
  plan_label: string;
  services_active: string;
  jotform_request_url: string;
  jotform_support_url: string;
  report_url: string;
  resources_url: string;
  contact_fluxperf_name: string;
  contact_fluxperf_email: string;
  last_action_1_label: string;
  last_action_1_date: string;
  last_action_2_label: string;
  last_action_2_date: string;
  last_action_3_label: string;
  last_action_3_date: string;
};
