import { useCallback, useEffect, useState } from "react";
import App from "./App";
import HomePage from "./pages/HomePage";
import LoginPage, { clearSession, getSession, type User } from "./pages/Loginpage";

type ProductRoute = "home" | "login" | "signup" | "workspace";

function routeFromPath(pathname: string): ProductRoute {
  if (pathname.endsWith("/login")) return "login";
  if (pathname.endsWith("/signup")) return "signup";
  if (pathname.endsWith("/app")) return "workspace";
  return "home";
}

export default function ProductShell() {
  const [route, setRoute] = useState<ProductRoute>(() => routeFromPath(window.location.pathname));
  const [user, setUser] = useState<User | null>(getSession);

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

  const logout = useCallback(() => {
    clearSession();
    setUser(null);
    navigate("home");
  }, [navigate]);

  if (route === "workspace") return <App onLogout={logout} />;
  if (route === "login" || route === "signup") {
    return (
      <LoginPage
        initialMode={route}
        onBack={() => navigate("home")}
        onContinueLocal={() => navigate("workspace")}
        onAuth={authenticatedUser => {
          setUser(authenticatedUser);
          navigate("workspace");
        }}
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
