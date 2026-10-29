export type AdminUser = { id: string; name: string; email: string };

export type UserSummary = {
  id: string;
  name: string;
  email: string;
  createdAt: number;
  onboardingRequired: boolean;
  contacts: number;
  ownedAgents: number;
  groupCount: number;
  lastActiveAt: number | null;
  superAdmin: boolean;
};

export type Setting = {
  key: string;
  label: string;
  description: string;
  value: boolean;
  defaultValue: boolean;
  updatedAt: number | null;
  updatedBy: string | null;
};

export type AdminEvent = {
  id: string;
  action: string;
  target: string | null;
  details: Record<string, unknown> | null;
  createdAt: number;
  actorID: string;
  actorName: string | null;
};

export type Overview = {
  totals: { users: number; newUsers: number; contacts: number; groupCount: number };
  registrationEnabled: boolean;
  events: AdminEvent[];
};
