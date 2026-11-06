import { apiRequest } from "../api/client";

export type FlagType = "boolean" | "string" | "number" | "json";

export interface FeatureFlag {
  id: number;
  key: string;
  type: FlagType;
  default_value: unknown;
  enabled: boolean;
  rollout_percentage: number;
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
  rollout_percentage: number;
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
  targetingRules: (id: number) =>
    apiRequest<TargetingRule[]>(`/api/v1/flags/${id}/targeting-rules`),
  createTargetingRule: (id: number, payload: TargetingRulePayload) =>
    apiRequest<TargetingRule>(`/api/v1/flags/${id}/targeting-rules`, {
      method: "POST",
      body: JSON.stringify(payload),
    }),
  updateTargetingRule: (id: number, payload: TargetingRulePayload) =>
    apiRequest<TargetingRule>(`/api/v1/targeting-rules/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    }),
  deleteTargetingRule: (id: number) =>
    apiRequest<void>(`/api/v1/targeting-rules/${id}`, { method: "DELETE" }),
};

export type RuleOperator =
  | "equals"
  | "not_equals"
  | "contains"
  | "in"
  | "greater_than"
  | "less_than"
  | "is_set"
  | "is_not_set"
  | "in_group";

export interface TargetingRule {
  id: number;
  flag_id: number;
  rule_type: "user" | "attribute" | "user_group";
  operator: RuleOperator;
  attribute: string | null;
  value: unknown;
  result: unknown;
  priority: number;
  is_active: boolean;
  created_at: string;
}

export type TargetingRulePayload = Omit<TargetingRule, "id" | "flag_id" | "created_at">;

export interface EvaluationResult {
  flag_key: string;
  environment: string;
  value: unknown;
  reason: string;
  rule_id?: number | null;
  rollout_bucket?: number | null;
}

export const evaluationApi = {
  evaluate: (payload: {
    flag_key: string;
    environment: string;
    user_key?: string;
    attributes: Record<string, unknown>;
  }) =>
    apiRequest<EvaluationResult>("/api/v1/evaluations", {
      method: "POST",
      body: JSON.stringify(payload),
    }),
};
