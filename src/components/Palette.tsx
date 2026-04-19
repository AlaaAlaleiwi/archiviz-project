import { useState } from "react";
import "../styles.css";


type Item = {
  type: string;
  label: string;
  icon: string;
  desc: string;
  category: "backend" | "frontend";
};

const backendCatalog: Item[] = [
  { type: "api", label: "API Service", icon: "⚡", desc: "REST endpoints and business logic", category: "backend" },
  { type: "api_gateway", label: "API Gateway", icon: "🌐", desc: "Single entry point for backend traffic", category: "backend" },
  { type: "microservice", label: "Microservice", icon: "🧩", desc: "Independent domain service", category: "backend" },
  { type: "worker", label: "Worker", icon: "⚙️", desc: "Background task processor", category: "backend" },
  { type: "scheduler", label: "Scheduler", icon: "⏰", desc: "Cron jobs and timed tasks", category: "backend" },
  { type: "auth", label: "Auth Service", icon: "🔐", desc: "Authentication and authorization", category: "backend" },
  { type: "websocket_gateway", label: "WebSocket Gateway", icon: "🔌", desc: "Real-time communication layer", category: "backend" },
  { type: "grpc_service", label: "gRPC Service", icon: "📡", desc: "High-performance service-to-service RPC", category: "backend" },
  { type: "database", label: "Database", icon: "🗄️", desc: "Primary application data store", category: "backend" },
  { type: "sql_database", label: "SQL Database", icon: "🗃️", desc: "Relational persistence layer", category: "backend" },
  { type: "nosql_database", label: "NoSQL Database", icon: "📚", desc: "Document or key-value persistence", category: "backend" },
  { type: "cache", label: "Cache", icon: "⚡", desc: "Fast in-memory data access", category: "backend" },
  { type: "object_storage", label: "Object Storage", icon: "🪣", desc: "Blob, file, and media storage", category: "backend" },
  { type: "search_engine", label: "Search Engine", icon: "🔎", desc: "Indexing and full-text search", category: "backend" },
  { type: "queue", label: "Queue", icon: "📨", desc: "Asynchronous job buffering", category: "backend" },
  { type: "message_broker", label: "Message Broker", icon: "🚌", desc: "Reliable message delivery", category: "backend" },
  { type: "event_bus", label: "Event Bus", icon: "🛰️", desc: "Domain event distribution", category: "backend" },
  { type: "stream_processor", label: "Stream Processor", icon: "🌊", desc: "Real-time event processing", category: "backend" },
  { type: "notification_service", label: "Notification Service", icon: "🔔", desc: "Push, SMS, and in-app alerts", category: "backend" },
  { type: "email_service", label: "Email Service", icon: "✉️", desc: "Transactional and bulk email delivery", category: "backend" },
  { type: "payment_service", label: "Payment Service", icon: "💳", desc: "Billing and payment workflows", category: "backend" },
  { type: "file_service", label: "File Service", icon: "📁", desc: "Upload, download, and document handling", category: "backend" },
  { type: "reverse_proxy", label: "Reverse Proxy", icon: "🛡️", desc: "Traffic routing and termination", category: "backend" },
  { type: "load_balancer", label: "Load Balancer", icon: "↔️", desc: "Distribute requests across services", category: "backend" },
  { type: "rate_limiter", label: "Rate Limiter", icon: "🚦", desc: "Protect APIs from abuse", category: "backend" },
  { type: "config_service", label: "Config Service", icon: "📝", desc: "Centralized runtime configuration", category: "backend" },
  { type: "secrets_manager", label: "Secrets Manager", icon: "🔑", desc: "Secure secret and key storage", category: "backend" },
  { type: "logging_service", label: "Logging Service", icon: "📜", desc: "Centralized application logs", category: "backend" },
  { type: "monitoring_service", label: "Monitoring Service", icon: "📊", desc: "Metrics, health, and alerting", category: "backend" },
  { type: "tracing_service", label: "Tracing Service", icon: "🧭", desc: "Distributed tracing and observability", category: "backend" },
];

const frontendCatalog: Item[] = [
  { type: "frontend_app", label: "Frontend App", icon: "🖥️", desc: "Main client application shell", category: "frontend" },
  { type: "landing_page", label: "Landing Page", icon: "🏠", desc: "Marketing and welcome screen", category: "frontend" },
  { type: "dashboard_page", label: "Dashboard Page", icon: "📊", desc: "Overview and analytics workspace", category: "frontend" },
  { type: "feature_page", label: "Feature Page", icon: "🗂️", desc: "Dedicated business workflow screen", category: "frontend" },
  { type: "layout_shell", label: "Layout Shell", icon: "🧱", desc: "Top-level layout, nav, and chrome", category: "frontend" },
  { type: "router", label: "Router", icon: "🧭", desc: "Client-side navigation and route guards", category: "frontend" },
  { type: "navigation_menu", label: "Navigation Menu", icon: "🧰", desc: "Sidebar, tabs, and navigation links", category: "frontend" },
  { type: "state_store", label: "State Store", icon: "🧠", desc: "Shared client state and actions", category: "frontend" },
  { type: "client_api", label: "API Client", icon: "🔗", desc: "Frontend service for backend requests", category: "frontend" },
  { type: "auth_ui", label: "Auth UI", icon: "🔐", desc: "Login, signup, and access flows", category: "frontend" },
  { type: "profile_page", label: "Profile Page", icon: "👤", desc: "User settings and account details", category: "frontend" },
  { type: "form_module", label: "Form Module", icon: "📝", desc: "Complex forms, validation, and submission", category: "frontend" },
  { type: "data_table", label: "Data Table", icon: "📋", desc: "Sortable and filterable tabular UI", category: "frontend" },
  { type: "chart_widget", label: "Chart Widget", icon: "📈", desc: "Visual analytics and reporting", category: "frontend" },
  { type: "kanban_board", label: "Kanban Board", icon: "🗃️", desc: "Drag-and-drop workflow interface", category: "frontend" },
  { type: "modal_system", label: "Modal System", icon: "🪟", desc: "Dialogs, drawers, and overlays", category: "frontend" },
  { type: "notification_center", label: "Notification Center", icon: "🔔", desc: "Toasts, alerts, and inbox UI", category: "frontend" },
  { type: "search_ui", label: "Search UI", icon: "🔎", desc: "Search box, filters, and results view", category: "frontend" },
  { type: "file_uploader", label: "File Uploader", icon: "📤", desc: "Upload UI with previews and progress", category: "frontend" },
  { type: "media_gallery", label: "Media Gallery", icon: "🖼️", desc: "Image and asset browsing experience", category: "frontend" },
  { type: "shared_components", label: "Shared Components", icon: "🧩", desc: "Reusable UI building blocks", category: "frontend" },
  { type: "design_system", label: "Design System", icon: "🎨", desc: "Theme tokens and component foundations", category: "frontend" },
  { type: "hooks_layer", label: "Hooks Layer", icon: "🪝", desc: "Reusable client-side behavior and state hooks", category: "frontend" },
];

const frontendByStack: Record<string, Item[]> = {
  "react": [
    { type: "react_app", label: "React App", icon: "⚛️", desc: "Component-based SPA foundation", category: "frontend" },
    { type: "react_hooks", label: "React Hooks", icon: "🪝", desc: "Reusable state and lifecycle logic", category: "frontend" },
    { type: "context_provider", label: "Context Provider", icon: "🌍", desc: "Global app state and services", category: "frontend" },
  ],
  "angular": [
    { type: "angular_app", label: "Angular App", icon: "🅰️", desc: "Enterprise frontend foundation", category: "frontend" },
    { type: "angular_module", label: "Angular Module", icon: "📦", desc: "Feature module and dependency grouping", category: "frontend" },
    { type: "angular_service", label: "Angular Service", icon: "🛠️", desc: "Dependency-injected business logic", category: "frontend" },
  ],
  "vue": [
    { type: "vue_app", label: "Vue App", icon: "🟢", desc: "Reactive UI application shell", category: "frontend" },
    { type: "vue_store", label: "Vue Store", icon: "🗂️", desc: "Pinia or shared reactive state", category: "frontend" },
    { type: "vue_composable", label: "Vue Composable", icon: "🪄", desc: "Reusable composition logic", category: "frontend" },
  ],
  "none": [],
};

export default function Palette({ framework }: any) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<"backend" | "frontend">("backend");
  const [searchQuery, setSearchQuery] = useState("");
  const [newItem, setNewItem] = useState({
    label: "",
    icon: "⚙️",
    desc: ""
  });
  const [customBackendItems, setCustomBackendItems] = useState<Item[]>([]);

  const frontendItems = [
    ...frontendCatalog,
    ...(frontendByStack[framework?.toLowerCase()] || []),
  ];
  const backendItems = [...backendCatalog, ...customBackendItems];
  const normalizedSearch = searchQuery.trim().toLowerCase();

  const matchesSearch = (item: Item) =>
    !normalizedSearch ||
    item.label.toLowerCase().includes(normalizedSearch) ||
    item.desc.toLowerCase().includes(normalizedSearch) ||
    item.type.toLowerCase().includes(normalizedSearch);

  const filteredBackendItems = backendItems.filter(matchesSearch);
  const filteredFrontendItems = frontendItems.filter(matchesSearch);

  const addService = () => {
    if (!newItem.label.trim()) return;

    const type = newItem.label.toLowerCase().replace(/\s+/g, "_");

    setCustomBackendItems((prev) => [
      ...prev,
      {
        type,
        label: newItem.label,
        icon: newItem.icon,
        desc: newItem.desc || "Custom service",
        category: "backend"
      }
    ]);

    setNewItem({ label: "", icon: "⚙️", desc: "" });
  };

  return (
    <div className={`palette${isOpen ? "" : " palette--collapsed"}`}>
      <div className="paletteHeaderRow">
        {isOpen && <div className="paletteHeader">COMPONENTS</div>}
        <button
          className="panelCollapseBtn"
          onClick={() => setIsOpen(!isOpen)}
          title={isOpen ? "Collapse panel" : "Expand panel"}
        >
          {isOpen ? "‹" : "›"}
        </button>
      </div>

      {isOpen && <><div className="paletteTabs" role="tablist" aria-label="Component groups">
        <button
          type="button"
          className={`paletteTab ${activeTab === "backend" ? "active" : ""}`}
          onClick={() => setActiveTab("backend")}
        >
          Backend
          <span className="paletteTabCount">{backendItems.length}</span>
        </button>

        <button
          type="button"
          className={`paletteTab ${activeTab === "frontend" ? "active" : ""}`}
          onClick={() => setActiveTab("frontend")}
        >
          Frontend
          <span className="paletteTabCount">{frontendItems.length}</span>
        </button>
      </div>

      <input
        className="input paletteSearch"
        placeholder={`Search ${activeTab} components`}
        value={searchQuery}
        onChange={(e) => setSearchQuery(e.target.value)}
      />

      {activeTab === "backend" && (
        <>
          <div className="paletteSectionTitle">Backend Developer Toolkit</div>

          <div className="paletteAddBox">
            <input
              className="input"
              placeholder="Service name"
              value={newItem.label}
              onChange={(e) =>
                setNewItem({ ...newItem, label: e.target.value })
              }
            />

            <input
              className="input"
              placeholder="Description"
              value={newItem.desc}
              onChange={(e) =>
                setNewItem({ ...newItem, desc: e.target.value })
              }
            />

            <button className="paletteAddBtn" onClick={addService}>
              + Add Service
            </button>
          </div>

          <div className="paletteList">
            {filteredBackendItems.length > 0 ? (
              filteredBackendItems.map((t) => (
                <div
                  key={t.type}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("type", t.type)}
                  className="paletteItem"
                >
                  <div className="paletteIcon">{t.icon}</div>

                  <div className="paletteText">
                    <div className="paletteTitle">{t.label}</div>
                    <div className="paletteSub">{t.desc}</div>
                  </div>

                  <div className="paletteHint">↗</div>
                </div>
              ))
            ) : (
              <div className="paletteEmpty">No backend components match that search.</div>
            )}
          </div>
        </>
      )}

      {activeTab === "frontend" && (
        <>
          <div className="paletteSectionTitle">Frontend Developer Toolkit</div>

          <div className="paletteList">
            {filteredFrontendItems.length > 0 ? (
              filteredFrontendItems.map((t) => (
                <div
                  key={t.type}
                  draggable
                  onDragStart={(e) => e.dataTransfer.setData("type", t.type)}
                  className="paletteItem frontend"
                >
                  <div className="paletteIcon">{t.icon}</div>

                  <div className="paletteText">
                    <div className="paletteTitle">{t.label}</div>
                    <div className="paletteSub">{t.desc}</div>
                  </div>

                  <div className="paletteHint">↗</div>
                </div>
              ))
            ) : (
              <div className="paletteEmpty">No frontend components match that search.</div>
            )}
          </div>
        </>
      )}
      </>}
    </div>
  );
}
