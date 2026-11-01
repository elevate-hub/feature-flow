import { apiRequest } from "../api/client";

export interface Environment {
  id: number;
  name: string;
  description: string | null;
  created_at: string;
}

export interface EnvironmentPayload {
  name: string;
  description: string | null;
}

export const environmentApi = {
  list: () => apiRequest<Environment[]>("/api/v1/environments"),
  get: (id: number) => apiRequest<Environment>(`/api/v1/environments/${id}`),
  create: (payload: EnvironmentPayload) =>
    apiRequest<Environment>("/api/v1/environments", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  update: (id: number, payload: EnvironmentPayload) =>
    apiRequest<Environment>(`/api/v1/environments/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  remove: (id: number) =>
    apiRequest<void>(`/api/v1/environments/${id}`, { method: "DELETE" }),
};
