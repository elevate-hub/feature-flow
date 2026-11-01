import { apiRequest } from "../api/client";

export type FlagType = "boolean" | "string" | "number" | "json";

export interface FeatureFlag {
  id: number;
  key: string;
  type: FlagType;
  default_value: unknown;
  enabled: boolean;
  description: string | null;
  environment_id: number;
  created_at: string;
  updated_at: string;
}

export interface FlagPayload {
  key: string;
  type: FlagType;
  default_value: unknown;
  enabled: boolean;
  description: string | null;
  environment_id: number;
}

export const flagApi = {
  list: () => apiRequest<FeatureFlag[]>("/api/v1/flags"),
  get: (id: number) => apiRequest<FeatureFlag>(`/api/v1/flags/${id}`),
  create: (payload: FlagPayload) =>
    apiRequest<FeatureFlag>("/api/v1/flags", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: FlagPayload) =>
    apiRequest<FeatureFlag>(`/api/v1/flags/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    apiRequest<void>(`/api/v1/flags/${id}`, { method: "DELETE" }),
  byEnvironment: (id: number) =>
    apiRequest<FeatureFlag[]>(`/api/v1/environments/${id}/flags`),
};
