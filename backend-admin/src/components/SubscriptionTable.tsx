import { useEffect, useState } from "react";
import { adminApi } from "../api";

type SubscriptionRow = { id: string; userEmail: string; plan: string; status: string; currentPeriodEnd?: string; cancelAtPeriodEnd: boolean };

export default function SubscriptionTable() {
  const [rows, setRows] = useState<SubscriptionRow[]>([]);
  const [error, setError] = useState("");
  useEffect(() => { adminApi.subscriptions().then(data => setRows(data as SubscriptionRow[])).catch(reason => setError(reason.message)); }, []);
  const cancel = async (row: SubscriptionRow) => {
    if (!window.confirm(`Cancel the ${row.plan} subscription for ${row.userEmail}?`)) return;
    try { await adminApi.cancelSubscription(row.id); setRows(current => current.map(item => item.id === row.id ? { ...item, status: "CANCELED", cancelAtPeriodEnd: true } : item)); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not cancel subscription."); }
  };
  return <section className="admin-panel">
    {error && <div className="admin-error" role="alert">{error}</div>}
    <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>User</th><th>Plan</th><th>Status</th><th>Period end</th><th>Cancellation</th><th /></tr></thead><tbody>
      {rows.map(row => <tr key={row.id}><td>{row.userEmail}</td><td>{row.plan}</td><td><span className="admin-status">{row.status}</span></td><td>{row.currentPeriodEnd ? new Date(row.currentPeriodEnd).toLocaleDateString() : "—"}</td><td>{row.cancelAtPeriodEnd ? "At period end" : "No"}</td><td><button className="admin-button danger" disabled={row.status === "CANCELED"} onClick={() => cancel(row)}>Cancel</button></td></tr>)}
    </tbody></table></div>
    {!rows.length && !error && <p className="admin-muted">No subscriptions found.</p>}
  </section>;
}
