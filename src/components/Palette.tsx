import { useState } from "react";
import "../styles.css";

type Item = {
  type: string;
  label: string;
  icon: string;
  desc: string;
};

const catalog: Item[] = [
  { type: "api",                label: "API Service",          icon: "⚡",  desc: "REST endpoints and business logic" },
  { type: "api_gateway",        label: "API Gateway",          icon: "🌐", desc: "Single entry point for backend traffic" },
  { type: "microservice",       label: "Microservice",         icon: "🧩", desc: "Independent domain service" },
  { type: "worker",             label: "Worker",               icon: "⚙️", desc: "Background task processor" },
  { type: "scheduler",          label: "Scheduler",            icon: "⏰", desc: "Cron jobs and timed tasks" },
  { type: "auth",               label: "Auth Service",         icon: "🔐", desc: "Authentication and authorization" },
  { type: "websocket_gateway",  label: "WebSocket Gateway",    icon: "🔌", desc: "Real-time communication layer" },
  { type: "grpc_service",       label: "gRPC Service",         icon: "📡", desc: "High-performance service-to-service RPC" },
  { type: "database",           label: "Database",             icon: "🗄️", desc: "Primary application data store" },
  { type: "sql_database",       label: "SQL Database",         icon: "🗃️", desc: "Relational persistence layer" },
  { type: "nosql_database",     label: "NoSQL Database",       icon: "📚", desc: "Document or key-value persistence" },
  { type: "cache",              label: "Cache",                icon: "⚡",  desc: "Fast in-memory data access" },
  { type: "object_storage",     label: "Object Storage",       icon: "🪣", desc: "Blob, file, and media storage" },
  { type: "search_engine",      label: "Search Engine",        icon: "🔎", desc: "Indexing and full-text search" },
  { type: "queue",              label: "Queue",                icon: "📨", desc: "Asynchronous job buffering" },
  { type: "message_broker",     label: "Message Broker",       icon: "🚌", desc: "Reliable message delivery" },
  { type: "event_bus",          label: "Event Bus",            icon: "🛰️", desc: "Domain event distribution" },
  { type: "stream_processor",   label: "Stream Processor",     icon: "🌊", desc: "Real-time event processing" },
  { type: "notification_service",label: "Notification Service",icon: "🔔", desc: "Push, SMS, and in-app alerts" },
  { type: "email_service",      label: "Email Service",        icon: "✉️", desc: "Transactional and bulk email delivery" },
  { type: "payment_service",    label: "Payment Service",      icon: "💳", desc: "Billing and payment workflows" },
  { type: "file_service",       label: "File Service",         icon: "📁", desc: "Upload, download, and document handling" },
  { type: "reverse_proxy",      label: "Reverse Proxy",        icon: "🛡️", desc: "Traffic routing and termination" },
  { type: "load_balancer",      label: "Load Balancer",        icon: "↔️", desc: "Distribute requests across services" },
  { type: "rate_limiter",       label: "Rate Limiter",         icon: "🚦", desc: "Protect APIs from abuse" },
  { type: "config_service",     label: "Config Service",       icon: "📝", desc: "Centralized runtime configuration" },
  { type: "secrets_manager",    label: "Secrets Manager",      icon: "🔑", desc: "Secure secret and key storage" },
  { type: "logging_service",    label: "Logging Service",      icon: "📜", desc: "Centralized application logs" },
  { type: "monitoring_service", label: "Monitoring Service",   icon: "📊", desc: "Metrics, health, and alerting" },
  { type: "tracing_service",    label: "Tracing Service",      icon: "🧭", desc: "Distributed tracing and observability" },
];

export default function Palette() {
  const [isOpen, setIsOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [newItem, setNewItem] = useState({ label: "", icon: "⚙️", desc: "" });
  const [customItems, setCustomItems] = useState<Item[]>([]);

  const allItems = [...catalog, ...customItems];
  const normalizedSearch = searchQuery.trim().toLowerCase();
  const filteredItems = allItems.filter(item =>
    !normalizedSearch ||
    item.label.toLowerCase().includes(normalizedSearch) ||
    item.desc.toLowerCase().includes(normalizedSearch) ||
    item.type.toLowerCase().includes(normalizedSearch)
  );

  const addService = () => {
    if (!newItem.label.trim()) return;
    const type = newItem.label.toLowerCase().replace(/\s+/g, "_");
    setCustomItems(prev => [...prev, {
      type,
      label: newItem.label,
      icon: newItem.icon,
      desc: newItem.desc || "Custom service",
    }]);
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

      {isOpen && (
        <>
          <input
            className="input paletteSearch"
            placeholder="Search components"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="paletteSectionTitle">Spring Boot Services</div>

          <div className="paletteAddBox">
            <input
              className="input"
              placeholder="Service name"
              value={newItem.label}
              onChange={(e) => setNewItem({ ...newItem, label: e.target.value })}
            />
            <input
              className="input"
              placeholder="Description"
              value={newItem.desc}
              onChange={(e) => setNewItem({ ...newItem, desc: e.target.value })}
            />
            <button className="paletteAddBtn" onClick={addService}>
              + Add Service
            </button>
          </div>

          <div className="paletteList">
            {filteredItems.length > 0 ? (
              filteredItems.map((t) => (
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
              <div className="paletteEmpty">No components match that search.</div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
