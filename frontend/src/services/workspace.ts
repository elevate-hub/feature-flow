import { apiRequest } from "../api/client";

export interface AnalyticsPoint {
  date: string;
  evaluations: number;
  true: number;
  false: number;
}

export interface DashboardAnalytics {
  total_flags: number;
  enabled_flags: number;
  evaluations: number;
  true_rate: number | null;
  series: AnalyticsPoint[];
  range_start: string;
  range_end: string;
}

export interface ActivityEntry {
  id: number;
  action: string;
  actor: string;
  flag_key: string | null;
  before_value: unknown;
  after_value: unknown;
  created_at: string;
}

export interface FlagVersion {
  id: number;
  version_number: number;
  configuration: Record<string, unknown>;
  created_at: string;
}

export const workspaceApi = {
  analytics: (environmentId?: number) =>
    apiRequest<DashboardAnalytics>(
      `/api/v1/analytics${environmentId ? `?environment_id=${environmentId}` : ""}`,
    ),
  activity: (limit = 100) =>
    apiRequest<ActivityEntry[]>(`/api/v1/activity?limit=${limit}`),
  versions: (flagId: number) =>
    apiRequest<FlagVersion[]>(`/api/v1/flags/${flagId}/versions`),
};
