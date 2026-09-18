import { apiClient, setStoredAccessToken } from "./apiClient";

const USER_KEY = "archiviz_auth_user";

export interface Session {
  accessToken: string;
  refreshToken?: string;
  user: AuthSession;
}

export interface AuthSession {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

function readStoredUser(): AuthSession | null {
  try { const value = sessionStorage.getItem(USER_KEY); return value ? JSON.parse(value) as AuthSession : null; }
  catch { return null; }
}

let currentSession: Session | null = null;

export function getSession(): Session | null {
  return currentSession;
}

export function setSession(session: Session | null) {
  currentSession = session;
  if (session) {
    setStoredAccessToken(session.accessToken);
    sessionStorage.setItem(USER_KEY, JSON.stringify(session.user));
  } else {
    setStoredAccessToken(null);
    sessionStorage.removeItem(USER_KEY);
  }
}

export async function login(email: string, password: string): Promise<Session> {
  const response = await apiClient.post<{
    accessToken: string;
    refreshToken: string;
    user: AuthSession;
  }>("/auth/login", { email, password });

  setSession({
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
  });
  return currentSession!;
}

export async function register(name: string, email: string, password: string): Promise<Session> {
  const response = await apiClient.post<{
    accessToken: string;
    refreshToken: string;
    user: AuthSession;
  }>("/auth/register", { email, password, name });

  setSession({
    accessToken: response.accessToken,
    refreshToken: response.refreshToken,
    user: response.user,
  });
  return currentSession!;
}

export async function refresh(): Promise<Session | null> {
  try {
    const response = await apiClient.post<{
      accessToken: string;
      refreshToken: string;
      user: AuthSession;
    }>("/auth/refresh", {});

    setSession({
      accessToken: response.accessToken,
      refreshToken: response.refreshToken,
      user: response.user,
    });
    return currentSession;
  } catch {
    setSession(null);
    return null;
  }
}

export async function logout(): Promise<void> {
  try {
    await apiClient.post("/auth/logout", {});
  } catch {
    /* ignore */
  }
  setSession(null);
}

export async function logoutAll(): Promise<void> {
  try {
    await apiClient.post("/auth/logout-all", {});
  } catch {
    /* ignore */
  }
  setSession(null);
}

export async function getCurrentUser(): Promise<AuthSession | null> {
  try {
    const user = await apiClient.get<AuthSession>("/auth/me");
    return user;
  } catch {
    return null;
  }
}

export function getStoredUser(): AuthSession | null {
  return currentSession?.user ?? readStoredUser();
}
