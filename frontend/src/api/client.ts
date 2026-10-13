const API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL?.replace(/\/+$/, "") ??
  "http://127.0.0.1:8000";

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

async function request<T>(
  path: string,
  options: RequestInit = {},
  token?: string,
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
    let message = "The request could not be completed. Please try again.";
    try {
      const body: unknown = await response.json();
      message = getErrorMessage(body, response.status);
    } catch {
      if (response.status === 401) {
        message = "Your session has expired. Please sign in again.";
      }
    }
    throw new ApiError(message, response.status);
  }

  return (await response.json()) as T;
}

function getErrorMessage(body: unknown, status: number): string {
  if (typeof body === "object" && body !== null && "detail" in body) {
    const detail = body.detail;
    if (typeof detail === "string") {
      if (status === 401) return "Invalid email or password.";
      if (status === 409) return "An account with this email already exists.";
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
  if (status === 401) return "Your session has expired. Please sign in again.";
  if (status === 409) return "An account with this email already exists.";
  return "The request could not be completed. Please try again.";
}

export const api = {
  register(payload: RegistrationPayload) {
    return request<User>("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  login(payload: LoginPayload) {
    return request<TokenResponse>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  },
  me(token: string) {
    return request<User>("/auth/me", { method: "GET" }, token);
  },
};
