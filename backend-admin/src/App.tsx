import { useEffect, useState } from "react";
import { adminApi, adminToken, type AdminUser } from "./api";
import LoginPage from "./routes/LoginPage";
import DashboardPage from "./routes/DashboardPage";

export default function App() {
  const [user, setUser] = useState<AdminUser | null>(null);
  const [checkingSession, setCheckingSession] = useState(Boolean(adminToken.get()));

  useEffect(() => {
    if (!adminToken.get()) return;
    adminApi.me()
      .then(currentUser => {
        if (currentUser.role !== "ADMIN") throw new Error("Administrator access is required.");
        setUser(currentUser);
      })
      .catch(() => adminToken.clear())
      .finally(() => setCheckingSession(false));
  }, []);

  if (checkingSession) {
    return <main className="admin-login"><div className="admin-card">Checking admin session…</div></main>;
  }

  if (!user) return <LoginPage onLogin={setUser} />;

  return <DashboardPage user={user} onLogout={() => { adminToken.clear(); setUser(null); }} />;
}
