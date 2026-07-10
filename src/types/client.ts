export type ClientSite = {
  id: string;
  domain: string;
  url: string;
  type: string;
  status: string;
};

export type Client = {
  id: string;
  status: string;
  companyName: string;
  firstName: string;
  lastName: string;
  planLabel: string;
  services: string[];
  sites: ClientSite[];
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
