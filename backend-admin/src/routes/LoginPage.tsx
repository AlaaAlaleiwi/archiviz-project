import { useState, type FormEvent } from "react";
import { adminApi, adminToken, type AdminUser } from "../api";

interface LoginPageProps { onLogin: (user: AdminUser) => void; }

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = await adminApi.login(email, password);
      if (session.user.role !== "ADMIN") throw new Error("This account does not have administrator access.");
      adminToken.set(session.accessToken);
      onLogin(session.user);
    } catch (reason) {
      adminToken.clear();
      setError(reason instanceof Error ? reason.message : "Unable to sign in.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="admin-login">
      <section className="admin-card">
        <span className="admin-kicker">Archiviz operations</span>
        <h1>Admin sign in</h1>
        <p className="admin-muted">Manage users, subscriptions, runtime configuration, and service health.</p>
        <form className="admin-form" onSubmit={handleSubmit}>
          <label>Email<input type="email" value={email} onChange={event => setEmail(event.target.value)} autoComplete="username" required /></label>
          <label>Password<input type="password" value={password} onChange={event => setPassword(event.target.value)} autoComplete="current-password" required /></label>
          {error && <div className="admin-error" role="alert">{error}</div>}
          <button className="admin-button primary" type="submit" disabled={loading}>{loading ? "Signing in…" : "Sign in"}</button>
        </form>
      </section>
    </main>
  );
}
