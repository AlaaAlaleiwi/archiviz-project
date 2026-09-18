import { useCallback, useEffect, useState } from "react";
import App from "./App";
import HomePage from "./pages/HomePage";
import LoginPage, { type User } from "./pages/Loginpage";
import { getCurrentUser, getStoredUser, logout as apiLogout, setSession, type Session } from "./utils/authStore";

type ProductRoute = "home" | "login" | "signup" | "workspace";

function routeFromPath(pathname: string): ProductRoute {
  if (pathname.endsWith("/login")) return "login";
  if (pathname.endsWith("/signup")) return "signup";
  if (pathname.endsWith("/app")) return "workspace";
  return "home";
}

export default function ProductShell() {
  const [route, setRoute] = useState<ProductRoute>(() => routeFromPath(window.location.pathname));
  const [user, setUser] = useState<User | null>(() => getStoredUser() as User | null);
  const [loading, setLoading] = useState(true);

  const navigate = useCallback((next: ProductRoute) => {
    const path = next === "home" ? "/" : next === "workspace" ? "/app" : `/${next}`;
    window.history.pushState({}, "", path);
    setRoute(next);
    window.scrollTo({ top: 0, behavior: "auto" });
  }, []);

  useEffect(() => {
    const onPopState = () => setRoute(routeFromPath(window.location.pathname));
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    const checkSession = async () => {
      try {
        const currentUser = await getCurrentUser();
        if (currentUser) setUser(currentUser as User);
      } catch {
        /* ignore */
      } finally {
        setLoading(false);
      }
    };
    checkSession();
  }, []);

  const handleAuth = useCallback((session: Session) => {
    setSession(session);
    setUser(session.user as User);
    navigate("workspace");
  }, [navigate]);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
    navigate("home");
  }, [navigate]);

  if (loading) {
    return <div className="workspace-loading" role="status">Loading…</div>;
  }

  if (route === "workspace") return <App onLogout={logout} />;
  if (route === "login" || route === "signup") {
    return (
      <LoginPage
        initialMode={route}
        onBack={() => navigate("home")}
        onContinueLocal={() => navigate("workspace")}
        onAuth={handleAuth}
      />
    );
  }
  return (
    <HomePage
      user={user}
      onLogin={() => navigate("login")}
      onSignup={() => navigate("signup")}
      onOpenWorkspace={() => navigate("workspace")}
      onContinueLocal={() => navigate("workspace")}
    />
  );
}
