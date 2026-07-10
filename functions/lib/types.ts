export type AppEnv = {
  APP_ENV?: string;
  GOOGLE_SHEET_ID?: string;
  GOOGLE_SHEET_RANGE?: string;
  GOOGLE_SERVICE_ACCOUNT_EMAIL?: string;
  GOOGLE_PRIVATE_KEY?: string;
  DEV_AUTH_EMAIL?: string;
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_ANON_KEY?: string;
  GOOGLE_CONTACTS_RANGE?: string;
  GOOGLE_SITES_RANGE?: string;
  N8N_INTERVENTION_WEBHOOK_URL?: string;
  N8N_INTERVENTION_WEBHOOK_SECRET?: string;
};

export type PagesContext = {
  request: Request;
  env: AppEnv;
};

export type ClientSiteDto = {
  id: string;
  domain: string;
  url: string;
  type: string;
  status: string;
};

export type ClientDto = {
  id: string;
  status: string;
  companyName: string;
  firstName: string;
  lastName: string;
  planLabel: string;
  services: string[];
  sites: ClientSiteDto[];
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
