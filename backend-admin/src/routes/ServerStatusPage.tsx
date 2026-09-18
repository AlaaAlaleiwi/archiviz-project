import { useEffect, useState } from "react";
import { adminApi } from "../api";

export default function ServerStatusPage() {
  const [health, setHealth] = useState<Record<string, unknown> | null>(null);
  const [stats, setStats] = useState<Record<string, number> | null>(null);
  const [error, setError] = useState("");
  useEffect(() => { Promise.all([adminApi.health(), adminApi.stats()]).then(([health, stats]) => { setHealth(health); setStats(stats); }).catch(reason => setError(reason.message)); }, []);
  if (error) return <div className="admin-error" role="alert">{error}</div>;
  return <div className="admin-grid">
    <article className="admin-stat"><span className="admin-muted">API</span><strong>{String(health?.status ?? "Checking…")}</strong></article>
    <article className="admin-stat"><span className="admin-muted">Database</span><strong>{String(health?.database ?? "Checking…")}</strong></article>
    <article className="admin-stat"><span className="admin-muted">Users</span><strong>{stats?.userCount ?? "—"}</strong></article>
    <article className="admin-stat"><span className="admin-muted">Active subscriptions</span><strong>{stats?.activeSubscriptions ?? "—"}</strong></article>
  </div>;
}
