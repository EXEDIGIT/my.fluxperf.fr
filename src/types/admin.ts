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
  solutions: Array<{
    type: AdminSolutionType;
    name: string;
    url: string;
  }>;
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
