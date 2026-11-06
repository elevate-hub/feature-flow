const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ??
  (import.meta.env.DEV ? "" : "http://127.0.0.1:8000");

export const TOKEN_KEY = "featureflow.access-token";

export function getStoredToken(): string | null {
  return sessionStorage.getItem(TOKEN_KEY);
}

export function storeToken(token: string): void {
  sessionStorage.setItem(TOKEN_KEY, token);
}

export function clearStoredToken(): void {
  sessionStorage.removeItem(TOKEN_KEY);
}

export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  is_active: boolean;
}

export interface LoginPayload {
  email: string;
  password: string;
}

export interface RegistrationPayload extends LoginPayload {
  name: string;
}

interface TokenResponse {
  access_token: string;
  token_type: string;
}

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit = {},
  token: string | null = getStoredToken(),
): Promise<T> {
  const headers = new Headers(options.headers);
  headers.set("Accept", "application/json");
  if (options.body) headers.set("Content-Type", "application/json");
  if (token) headers.set("Authorization", `Bearer ${token}`);

  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...options,
      headers,
    });
  } catch {
    throw new ApiError(
      "Cannot reach the API. Check that the backend is running and try again.",
      0,
    );
  }

  if (!response.ok) {
    let message = getStatusMessage(response.status);
    try {
      const body: unknown = await response.json();
      message = getErrorMessage(body, response.status) || message;
    } catch {
      // Some proxies return an empty or non-JSON error body.
    }
    if (response.status === 401 && token) {
      window.dispatchEvent(new Event("featureflow:unauthorized"));
    }
    throw new ApiError(message, response.status);
  }

  if (response.status === 204) return undefined as T;
  return (await response.json()) as T;
}

function getStatusMessage(status: number): string {
  switch (status) {
    case 401:
      return "Your session has expired. Please sign in again.";
    case 403:
      return "You do not have permission to perform this action.";
    case 404:
      return "The requested resource could not be found.";
    case 409:
      return "This change conflicts with existing data.";
    case 422:
      return "Please check the information you entered.";
    default:
      return "The request could not be completed. Please try again.";
  }
}

function getErrorMessage(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = body.detail;
    if (typeof detail === "string") {
      return detail;
    }
    if (Array.isArray(detail)) {
      return detail
        .map((item) => {
          if (typeof item === "object" && item !== null && "msg" in item) {
            return String(item.msg);
          }
          return "Please check the information you entered.";
        })
        .join(" ");
    }
  }
  return getStatusMessage(status);
}

export const api = {
  register(payload: RegistrationPayload) {
    return apiRequest<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    }, null);
  },
  login(payload: LoginPayload) {
    return apiRequest<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    }, null);
  },
  me(token: string) {
    return apiRequest<User>("/auth/me", { method: "GET" }, token);
  },
};
