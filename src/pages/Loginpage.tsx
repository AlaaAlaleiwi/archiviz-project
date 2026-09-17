import { useState } from "react";

/* ─────────────────────────────────────────
   Tiny localStorage auth store
   Users are stored as:  auth_users  →  User[]
   Active session:       auth_session →  User
───────────────────────────────────────── */
export interface User {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  createdAt: string;
}

function hashPassword(password: string): string {
  // Simple deterministic hash for client-side demo auth
  let hash = 5381;
  for (let i = 0; i < password.length; i++) {
    hash = ((hash << 5) + hash) ^ password.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

function getUsers(): User[] {
  try { return JSON.parse(localStorage.getItem("auth_users") || "[]"); } catch { return []; }
}

function saveUsers(users: User[]) {
  localStorage.setItem("auth_users", JSON.stringify(users));
}

export function getSession(): User | null {
  try { return JSON.parse(localStorage.getItem("auth_session") || "null"); } catch { return null; }
}

export function clearSession() {
  localStorage.removeItem("auth_session");
}

function saveSession(user: User) {
  // Don't persist the hash in the session
  const { passwordHash: _, ...safe } = user as any;
  localStorage.setItem("auth_session", JSON.stringify({ ...safe, passwordHash: "" }));
}

/* ─────────────────────────────────────────
   AUTH ACTIONS
───────────────────────────────────────── */
function login(email: string, password: string): User {
  const users = getUsers();
  const user = users.find(u => u.email.toLowerCase() === email.trim().toLowerCase());
  if (!user) throw new Error("No account found with that email.");
  if (user.passwordHash !== hashPassword(password)) throw new Error("Incorrect password.");
  saveSession(user);
  return user;
}

function signup(name: string, email: string, password: string): User {
  const users = getUsers();
  if (users.find(u => u.email.toLowerCase() === email.trim().toLowerCase())) {
    throw new Error("An account with this email already exists.");
  }
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");
  const user: User = {
    id: Math.random().toString(36).slice(2),
    name: name.trim(),
    email: email.trim().toLowerCase(),
    passwordHash: hashPassword(password),
    createdAt: new Date().toISOString(),
  };
  saveUsers([...users, user]);
  saveSession(user);
  return user;
}

/* ─────────────────────────────────────────
   COMPONENT
───────────────────────────────────────── */
interface Props {
  onAuth: (user: User) => void;
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

  const reset = () => { setName(""); setEmail(""); setPassword(""); setError(""); };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    // Tiny artificial delay so the spinner is visible
    await new Promise(r => setTimeout(r, 400));
    try {
      const user = mode === "login"
        ? login(email, password)
        : signup(name, email, password);
      onAuth(user);
    } catch (err: any) {
      setError(err.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
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
        <button type="button" className="auth-back" onClick={onBack} aria-label="Back to Archiviz home">← Back</button>
        {/* Brand */}
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

        {/* Error */}
        {error && <div className="auth-error">{error}</div>}

        <form className="auth-form" onSubmit={handleSubmit}>
          {/* Name — signup only */}
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

          {/* Email */}
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

          {/* Password */}
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

        {/* Divider */}
        <div className="auth-divider">or</div>

        <button type="button" className="auth-local" onClick={onContinueLocal}>Continue without an account</button>

        {/* Switch mode */}
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

        {/* Demo hint */}
        <p style={{
          marginTop: 20,
          fontSize: 10,
          color: "#334155",
          textAlign: "center",
          lineHeight: 1.5,
        }}>
          Local account preview only. Cloud accounts and synchronization are not connected yet.
        </p>
      </div>
    </div>
  );
}
