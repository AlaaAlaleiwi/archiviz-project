import { useState } from "react";
import type { AdminUser } from "../api";
import UserTable from "../components/UserTable";
import SubscriptionTable from "../components/SubscriptionTable";
import ConfigEditor from "../components/ConfigEditor";
import ServerStatusPage from "./ServerStatusPage";

type Tab = "users" | "subscriptions" | "config" | "status";
const labels: Record<Tab, string> = { users: "Users", subscriptions: "Subscriptions", config: "Configuration", status: "Service status" };

export default function DashboardPage({ user, onLogout }: { user: AdminUser; onLogout: () => void }) {
  const [activeTab, setActiveTab] = useState<Tab>("users");

  return (
    <div className="admin-shell">
      <nav className="admin-nav" aria-label="Admin sections">
        <h1>Archiviz Admin</h1>
        {(Object.keys(labels) as Tab[]).map(tab => <button key={tab} className={activeTab === tab ? "active" : ""} onClick={() => setActiveTab(tab)}>{labels[tab]}</button>)}
        <button className="logout" onClick={onLogout}>Log out</button>
      </nav>
      <main className="admin-main">
        <header className="admin-header"><div><h2>{labels[activeTab]}</h2><span className="admin-muted">Signed in as {user.email}</span></div></header>
        {activeTab === "users" && <UserTable />}
        {activeTab === "subscriptions" && <SubscriptionTable />}
        {activeTab === "config" && <ConfigEditor />}
        {activeTab === "status" && <ServerStatusPage />}
      </main>
    </div>
  );
}
