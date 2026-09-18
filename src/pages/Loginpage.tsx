import { useState } from "react";
import { login as apiLogin, register as apiRegister, type Session } from "../utils/authStore";
import { apiClient } from "../utils/apiClient";

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  createdAt: string;
}

interface Props {
  onAuth: (session: Session) => void;
  initialMode?: "login" | "signup";
  onBack: () => void;
  onContinueLocal: () => void;
}

export default function LoginPage({ onAuth, initialMode = "login", onBack, onContinueLocal }: Props) {
  const [mode, setMode] = useState<"login" | "signup">(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resetPending, setResetPending] = useState(false);
  const [resetEmail, setResetEmail] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [showReset, setShowReset] = useState(false);

  const reset = () => { setName(""); setEmail(""); setPassword(""); setError(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const session = mode === "login"
        ? await apiLogin(email, password)
        : await apiRegister(name, email, password);
      onAuth(session);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  };

  const handleResetRequest = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setResetPending(true);
    try {
      await apiClient.post("/auth/reset-password/request", { email: resetEmail });
      setResetSent(true);
      setResetPending(false);
    } catch {
      setError("Could not send reset email. Check console for dev mode token.");
      setResetPending(false);
    }
  };

  const switchMode = (next: "login" | "signup") => { setMode(next); reset(); };

  return (
    <div className="auth-page">
      <div className="auth-bg">
        <div className="auth-grid" />
        <div className="auth-glow" />
      </div>

      <div className="auth-card">
        <button type="button" className="auth-back" onClick={onBack} aria-label="Back to Archiviz home">&larr; Back</button>
        <div className="auth-brand">
          <span className="auth-logo" aria-hidden="true">A</span>
          <span className="auth-brand-name">ARCHIVIZ // ACCESS GATEWAY</span>
        </div>

        <h1 className="auth-title">
          {mode === "login" ? "Welcome back" : "Create account"}
        </h1>
        <p className="auth-sub">
          {mode === "login"
            ? "Sign in to continue to your projects."
            : "Start designing architecture in minutes."}
        </p>

        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {mode === "signup" && (
            <div className="auth-field">
              <label className="auth-label" htmlFor="auth-name">Full Name</label>
              <input
                id="auth-name"
                className="auth-input"
                type="text"
                placeholder="Jane Doe"
                value={name}
                onChange={e => setName(e.target.value)}
                required
                autoFocus
              />
            </div>
          )}

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              className="auth-input"
              type="email"
              placeholder="you@example.com"
              value={email}
              onChange={e => setEmail(e.target.value)}
              required
              autoFocus={mode === "login"}
            />
          </div>

          <div className="auth-field">
            <label className="auth-label" htmlFor="auth-password">Password</label>
            <div style={{ position: "relative" }}>
              <input
                id="auth-password"
                className="auth-input"
                type={showPw ? "text" : "password"}
                placeholder={mode === "signup" ? "Min. 6 characters" : "••••••••"}
                value={password}
                onChange={e => setPassword(e.target.value)}
                required
                style={{ paddingRight: 44 }}
              />
              <button
                type="button"
                className="auth-eye"
                onClick={() => setShowPw(v => !v)}
                aria-label={showPw ? "Hide password" : "Show password"}
              >
                {showPw ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <button
            type="submit"
            className="auth-submit"
            disabled={loading}
          >
            {loading
              ? <span className="auth-spinner" />
              : mode === "login" ? "Sign in →" : "Create account →"}
          </button>
        </form>

        <div className="auth-divider">or</div>

        <button type="button" className="auth-local" onClick={onContinueLocal}>Continue without an account</button>

        <div className="auth-footer" style={{ justifyContent: "center" }}>
          <span>{mode === "login" ? "Don't have an account?" : "Already have an account?"}</span>
          <button
            type="button"
            className="auth-link-btn"
            onClick={() => switchMode(mode === "login" ? "signup" : "login")}
          >
            {mode === "login" ? "Sign up" : "Sign in"}
          </button>
        </div>

        {mode === "login" && !showReset && (
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <button
              type="button"
              className="auth-link-btn"
              onClick={() => { setShowReset(true); setResetSent(false); setResetEmail(email); }}
              style={{ fontSize: 12 }}
            >
              Forgot password?
            </button>
          </div>
        )}

        {mode === "login" && showReset && !resetSent && (
          <div style={{ marginTop: 16 }}>
            <form onSubmit={handleResetRequest} style={{ display: "flex", gap: 8 }}>
              <input
                className="auth-input"
                type="email"
                placeholder="your@email.com"
                value={resetEmail}
                onChange={e => setResetEmail(e.target.value)}
                required
                style={{ flex: 1 }}
              />
              <button
                type="submit"
                className="auth-submit"
                disabled={resetPending}
                style={{ whiteSpace: "nowrap" }}
              >
                {resetPending ? "..." : "Send"}
              </button>
            </form>
            <p style={{ fontSize: 10, color: "#334155", textAlign: "center", marginTop: 8, lineHeight: 1.5 }}>
              In dev mode, the reset token is logged to the server console.
            </p>
          </div>
        )}

        {resetSent && <p className="auth-sub" role="status">If the account exists, reset instructions have been sent.</p>}

        <p style={{
          marginTop: 20,
          fontSize: 10,
          color: "#334155",
          textAlign: "center",
          lineHeight: 1.5,
        }}>
          Cloud accounts are stored on the backend server.
        </p>
      </div>
    </div>
  );
}
