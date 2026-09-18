import { useEffect, useState } from "react";
import { adminApi, type AdminUser } from "../api";

export default function UserTable() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  useEffect(() => { adminApi.users().then(setUsers).catch(reason => setError(reason.message)).finally(() => setLoading(false)); }, []);

  const remove = async (user: AdminUser) => {
    if (!window.confirm(`Delete ${user.email}? This cannot be undone.`)) return;
    try { await adminApi.deleteUser(user.id); setUsers(current => current.filter(item => item.id !== user.id)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not delete user."); }
  };

  if (loading) return <section className="admin-panel">Loading users…</section>;
  return <section className="admin-panel">
    {error && <div className="admin-error" role="alert">{error}</div>}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Role</th><th>Plan</th><th>Created</th><th /></tr></thead><tbody>
      {users.map(user => <tr key={user.id}><td><strong>{user.name}</strong><br/><span className="admin-muted">{user.email}</span></td><td>{user.role}</td><td>{user.subscription?.plan ?? "—"}</td><td>{new Date(user.createdAt).toLocaleDateString()}</td><td><button className="admin-button danger" disabled={user.role === "ADMIN"} onClick={() => remove(user)}>Delete</button></td></tr>)}
    </tbody></table></div>
    {!users.length && !error && <p className="admin-muted">No users found.</p>}
  </section>;
}
