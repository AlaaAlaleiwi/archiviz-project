import { useState } from "react";
import "../styles.css";

type Item = {
  type: string;
  label: string;
  icon: string;
  desc: string;
};

type WorkspaceFile = {
  path: string;
  content: string;
};

const catalog: Item[] = [
  { type: "api",                 label: "API Service",           icon: "⚡",  desc: "REST endpoints and business logic" },
  { type: "api_gateway",         label: "API Gateway",           icon: "🌐", desc: "Single entry point for backend traffic" },
  { type: "microservice",        label: "Microservice",          icon: "🧩", desc: "Independent domain service" },
  { type: "worker",              label: "Worker",                icon: "⚙️", desc: "Background task processor" },
  { type: "scheduler",           label: "Scheduler",             icon: "⏰", desc: "Cron jobs and timed tasks" },
  { type: "auth",                label: "Auth Service",          icon: "🔐", desc: "Authentication and authorization" },
  { type: "websocket_gateway",   label: "WebSocket Gateway",     icon: "🔌", desc: "Real-time communication layer" },
  { type: "grpc_service",        label: "gRPC Service",          icon: "📡", desc: "High-performance service-to-service RPC" },
  { type: "database",            label: "Database",              icon: "🗄️", desc: "Primary application data store" },
  { type: "sql_database",        label: "SQL Database",          icon: "🗃️", desc: "Relational persistence layer" },
  { type: "nosql_database",      label: "NoSQL Database",        icon: "📚", desc: "Document or key-value persistence" },
  { type: "cache",               label: "Cache",                 icon: "⚡",  desc: "Fast in-memory data access" },
  { type: "object_storage",      label: "Object Storage",        icon: "🪣", desc: "Blob, file, and media storage" },
  { type: "search_engine",       label: "Search Engine",         icon: "🔎", desc: "Indexing and full-text search" },
  { type: "queue",               label: "Queue",                 icon: "📨", desc: "Asynchronous job buffering" },
  { type: "message_broker",      label: "Message Broker",        icon: "🚌", desc: "Reliable message delivery" },
  { type: "event_bus",           label: "Event Bus",             icon: "🛰️", desc: "Domain event distribution" },
  { type: "stream_processor",    label: "Stream Processor",      icon: "🌊", desc: "Real-time event processing" },
  { type: "notification_service",label: "Notification Service",  icon: "🔔", desc: "Push, SMS, and in-app alerts" },
  { type: "email_service",       label: "Email Service",         icon: "✉️", desc: "Transactional and bulk email delivery" },
  { type: "payment_service",     label: "Payment Service",       icon: "💳", desc: "Billing and payment workflows" },
  { type: "file_service",        label: "File Service",          icon: "📁", desc: "Upload, download, and document handling" },
  { type: "reverse_proxy",       label: "Reverse Proxy",         icon: "🛡️", desc: "Traffic routing and termination" },
  { type: "load_balancer",       label: "Load Balancer",         icon: "↔️", desc: "Distribute requests across services" },
  { type: "rate_limiter",        label: "Rate Limiter",          icon: "🚦", desc: "Protect APIs from abuse" },
  { type: "config_service",      label: "Config Service",        icon: "📝", desc: "Centralized runtime configuration" },
  { type: "secrets_manager",     label: "Secrets Manager",       icon: "🔑", desc: "Secure secret and key storage" },
  { type: "logging_service",     label: "Logging Service",       icon: "📜", desc: "Centralized application logs" },
  { type: "monitoring_service",  label: "Monitoring Service",    icon: "📊", desc: "Metrics, health, and alerting" },
  { type: "tracing_service",     label: "Tracing Service",       icon: "🧭", desc: "Distributed tracing and observability" },
];

const typeKeywords = (type: string): string[] =>
  type.split("_").filter(w => w.length > 2);

const filesForType = (type: string, files: WorkspaceFile[]): WorkspaceFile[] => {
  const keywords = typeKeywords(type);
  return files.filter(f => {
    const lower = f.path.toLowerCase();
    return keywords.some(kw => lower.includes(kw));
  });
};

type PaletteTab = "all" | "implemented";

type PaletteProps = {
  embedded?: boolean;
  workspaceFiles?: WorkspaceFile[];
};

export default function Palette({ embedded = false, workspaceFiles = [] }: PaletteProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<PaletteTab>("all");
  const [newItem, setNewItem] = useState({ label: "", icon: "⚙️", desc: "" });
  const [customItems, setCustomItems] = useState<Item[]>([]);

  const allItems = [...catalog, ...customItems];

  const implementedTypes = new Set(
    allItems
      .filter(item => filesForType(item.type, workspaceFiles).length > 0)
      .map(item => item.type)
  );

  const normalizedSearch = searchQuery.trim().toLowerCase();

  const baseItems = activeTab === "implemented"
    ? allItems.filter(item => implementedTypes.has(item.type))
    : allItems;

  const filteredItems = baseItems.filter(item =>
    !normalizedSearch ||
    item.label.toLowerCase().includes(normalizedSearch) ||
    item.desc.toLowerCase().includes(normalizedSearch) ||
    item.type.toLowerCase().includes(normalizedSearch)
  );

  const implementedCount = implementedTypes.size;

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
    <div className={`palette${embedded ? " palette--embedded" : ""}${isOpen ? "" : " palette--collapsed"}`}>
      <div className="paletteHeaderRow">
        {isOpen && <div className="paletteHeader">COMPONENTS</div>}
        {!embedded && (
          <button
            className="panelCollapseBtn"
            onClick={() => setIsOpen(!isOpen)}
            title={isOpen ? "Collapse panel" : "Expand panel"}
          >
            {isOpen ? "‹" : "›"}
          </button>
        )}
      </div>

      {isOpen && (
        <div className="palette-scroll-area">
          <input
            className="input paletteSearch"
            placeholder="Search components"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />

          <div className="paletteTabs">
            <button
              className={`paletteTab ${activeTab === "all" ? "active" : ""}`}
              onClick={() => setActiveTab("all")}
            >
              All
              <span className="paletteTabCount">{allItems.length}</span>
            </button>
            <button
              className={`paletteTab ${activeTab === "implemented" ? "active" : ""}`}
              onClick={() => setActiveTab("implemented")}
              disabled={implementedCount === 0}
            >
              In Editor
              <span className="paletteTabCount">{implementedCount}</span>
            </button>
          </div>

          {activeTab === "all" && (
            <>
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
            </>
          )}

          {activeTab === "implemented" && implementedCount === 0 && (
            <div className="paletteEmpty">
              Generate a project first — implemented services will appear here.
            </div>
          )}

          <div className="paletteList">
            {filteredItems.length > 0 ? (
              filteredItems.map((item) => {
                const matchedFiles = filesForType(item.type, workspaceFiles);
                const isImplemented = matchedFiles.length > 0;
                return (
                  <div
                    key={item.type}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("type", item.type)}
                    className={`paletteItem${isImplemented ? " paletteItem--implemented" : ""}`}
                  >
                    <div className="paletteIcon">{item.icon}</div>
                    <div className="paletteText">
                      <div className="paletteTitle">
                        {item.label}
                        {isImplemented && (
                          <span className="paletteItemFileBadge" title={`${matchedFiles.length} file${matchedFiles.length !== 1 ? "s" : ""} in editor`}>
                            {matchedFiles.length}
                          </span>
                        )}
                      </div>
                      <div className="paletteSub">{item.desc}</div>
                    </div>
                    <div className="paletteHint">{isImplemented ? "✓" : "↗"}</div>
                  </div>
                );
              })
            ) : (
              <div className="paletteEmpty">No components match that search.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
