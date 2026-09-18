const DEFAULT_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "http://localhost:8080/api";

export type ApiErrorBody = {
  timestamp: string;
  status: number;
  error: string;
  message: string;
};

export class ApiClientError extends Error {
  status: number;
  body?: ApiErrorBody;

  constructor(status: number, message: string, body?: ApiErrorBody) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

async function request<T>(
  path: string,
  options: RequestInit = {}
): Promise<T> {
  const url = `${DEFAULT_BASE_URL}${path}`;
  const accessToken = getStoredAccessToken();

  const config: RequestInit = {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
      ...(options.headers as Record<string, string> | undefined),
    },
  };

  let response = await fetch(url, config);

  if (response.status === 401 && path === "/auth/refresh") {
    return Promise.reject(new ApiClientError(401, "Unauthorized"));
  }

  if (response.status === 401 && !path.startsWith("/auth/")) {
    try {
      const refreshed = await refreshSession();
      if (refreshed) {
        config.headers = {
          ...(config.headers as Record<string, string>),
          Authorization: `Bearer ${refreshed.accessToken}`,
        };
        response = await fetch(url, config);
      }
    } catch {
      return Promise.reject(new ApiClientError(401, "Session expired"));
    }
  }

  if (!response.ok) {
    let body: ApiErrorBody | undefined;
    try {
      body = (await response.json()) as ApiErrorBody;
    } catch {
      /* ignore */
    }
    return Promise.reject(new ApiClientError(response.status, body?.message ?? `Request failed`, body));
  }

  if (response.status === 204) {
    return {} as T;
  }

  return response.json() as Promise<T>;
}

let accessTokenCache: string | null = null;

function getAccessTokenFromStorage(): string | null {
  try {
    return sessionStorage.getItem("archiviz_access_token");
  } catch {
    /* ignore */
  }
  return null;
}

function setAccessTokenInStorage(token: string | null) {
  if (token) {
    sessionStorage.setItem("archiviz_access_token", token);
  } else {
    sessionStorage.removeItem("archiviz_access_token");
  }
  accessTokenCache = token;
}

export function getStoredAccessToken(): string | null {
  return accessTokenCache ?? getAccessTokenFromStorage();
}

export function setStoredAccessToken(token: string | null) {
  setAccessTokenInStorage(token);
}

async function refreshSession(): Promise<{ accessToken: string } | null> {
  try {
    const result = await request<{ accessToken: string; user: unknown }>("/auth/refresh", {
      method: "POST",
      body: "{}",
    });
    if (result?.accessToken) {
      setAccessTokenInStorage(result.accessToken);
      return { accessToken: result.accessToken };
    }
  } catch {
    /* ignore */
  }
  return null;
}

export const apiClient = {
  async get<T>(path: string): Promise<T> {
    return request<T>(path, { method: "GET" });
  },

  async post<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "POST",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  async put<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "PUT",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  async patch<T>(path: string, body?: unknown): Promise<T> {
    return request<T>(path, {
      method: "PATCH",
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  },

  async delete<T>(path: string): Promise<T> {
    return request<T>(path, { method: "DELETE" });
  },
};

export type HistoryEntry = { id: string; projectName: string; createdAt: string; sizeBytes: number };
export type HistorySnapshot = HistoryEntry & { snapshot: string };
export type Subscription = { id: string; plan: "FREE" | "PRO" | "TEAM"; status: string; currentPeriodEnd?: string; cancelAtPeriodEnd: boolean };

export const backendApi = {
  history: {
    list: () => apiClient.get<HistoryEntry[]>("/history"),
    get: (id: string) => apiClient.get<HistorySnapshot>(`/history/${id}`),
    save: (projectName: string, snapshot: unknown) => apiClient.post<HistoryEntry>("/history", { projectName, snapshot: JSON.stringify(snapshot) }),
    delete: (id: string) => apiClient.delete<void>(`/history/${id}`),
    exportAll: () => apiClient.get<{ entries: HistorySnapshot[] }>("/history/export"),
  },
  subscription: {
    current: () => apiClient.get<Subscription>("/subscription"),
    plans: () => apiClient.get<Array<Record<string, unknown>>>("/subscription/plans"),
    select: (plan: Subscription["plan"]) => apiClient.post<Subscription>("/subscription", { plan }),
    cancel: () => apiClient.delete<void>("/subscription"),
    reactivate: () => apiClient.post<Subscription>("/subscription/reactivate"),
  },
};
