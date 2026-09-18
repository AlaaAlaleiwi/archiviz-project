const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "/api";
const TOKEN_KEY = "archiviz_admin_access_token";

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  role: "USER" | "ADMIN";
  createdAt: string;
  subscription?: { plan: string; status: string };
};

export type AuthResponse = { accessToken: string; user: AdminUser };

export const adminToken = {
  get: () => sessionStorage.getItem(TOKEN_KEY),
  set: (token: string) => sessionStorage.setItem(TOKEN_KEY, token),
  clear: () => sessionStorage.removeItem(TOKEN_KEY),
};

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = adminToken.get();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    credentials: "include",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { message?: string } | null;
    throw new Error(body?.message ?? `Request failed (${response.status})`);
  }
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}

export const adminApi = {
  login: (email: string, password: string) => request<AuthResponse>("/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password, name: null }),
  }),
  me: () => request<AdminUser>("/auth/me"),
  health: () => request<Record<string, unknown>>("/health"),
  stats: () => request<Record<string, number>>("/admin/stats"),
  users: () => request<AdminUser[]>("/admin/users"),
  deleteUser: (id: string) => request<void>(`/admin/users/${id}`, { method: "DELETE" }),
  subscriptions: () => request<Array<Record<string, unknown>>>("/admin/subscriptions"),
  cancelSubscription: (id: string) => request<void>(`/admin/subscriptions/${id}`, { method: "DELETE" }),
  config: () => request<Record<string, unknown>>("/admin/config"),
  updateConfig: (config: Record<string, unknown>) => request<void>("/admin/config", {
    method: "PUT",
    body: JSON.stringify(config),
  }),
};
