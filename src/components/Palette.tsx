import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import "../styles.css";
import { analyzeSourceFile, isSourceFile } from "../utils/fileAnalysis";

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

// ── Imported-project file analysis ──────────────────────────────────────────

type ImportedFileItem = {
  path: string;
  displayName: string;
  nodeType: string;
  roleLabel: string;
  icon: string;
};

const ROLE_LABELS: Record<string, string> = {
  controller: "Controller",
  service: "Service",
  repository: "Repository",
  entity: "Entity",
  config: "Config",
  client: "Client",
  component: "Component",
  module: "Module",
};

function buildImportedItems(workspaceFiles: WorkspaceFile[]): ImportedFileItem[] {
  return workspaceFiles
    .filter((f) => isSourceFile(f.path))
    .map((f) => {
      const a = analyzeSourceFile(f.path, f.content);
      return {
        path: f.path,
        displayName: a.displayName,
        nodeType: a.nodeType,
        roleLabel: ROLE_LABELS[a.role] ?? "File",
        icon: a.icon,
      };
    });
}

const DRAG_THRESHOLD_PX = 4;

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

type PaletteTab = "all" | "implemented" | "project";

type PaletteProps = {
  embedded?: boolean;
  workspaceFiles?: WorkspaceFile[];
  onDropNode?: (type: string, clientX: number, clientY: number, name?: string) => boolean;
};

type PaletteDragState = {
  item: Item;
  nameOverride?: string;
  pointerId: number;
  originX: number;
  originY: number;
  x: number;
  y: number;
  active: boolean;
};

export default function Palette({ embedded = false, workspaceFiles = [], onDropNode }: PaletteProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<PaletteTab>("all");
  const [newItem, setNewItem] = useState({ label: "", icon: "⚙️", desc: "" });
  const [customItems, setCustomItems] = useState<Item[]>([]);
  const [dragState, setDragState] = useState<PaletteDragState | null>(null);
  const dragStateRef = useRef<PaletteDragState | null>(null);

  const importedItems = useMemo(() => buildImportedItems(workspaceFiles), [workspaceFiles]);

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

  useEffect(() => {
    dragStateRef.current = dragState;
  }, [dragState]);

  useEffect(() => {
    if (!dragState) return;

    const handlePointerMove = (event: PointerEvent) => {
      setDragState(current => {
        if (!current || current.pointerId !== event.pointerId) return current;

        const dx = event.clientX - current.originX;
        const dy = event.clientY - current.originY;
        const active = current.active || dx * dx + dy * dy >= DRAG_THRESHOLD_PX * DRAG_THRESHOLD_PX;

        return {
          ...current,
          x: event.clientX,
          y: event.clientY,
          active,
        };
      });
    };

    const finishDrag = (event: PointerEvent) => {
      const current = dragStateRef.current;
      if (!current || current.pointerId !== event.pointerId) return;

      if (current.active) {
        onDropNode?.(current.item.type, event.clientX, event.clientY, current.nameOverride);
      }

      setDragState(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", finishDrag);
    window.addEventListener("pointercancel", finishDrag);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", finishDrag);
      window.removeEventListener("pointercancel", finishDrag);
    };
  }, [dragState?.pointerId, onDropNode]);

  const startNodeDrag = (event: ReactPointerEvent<HTMLDivElement>, item: Item) => {
    if (event.button !== 0) return;

    event.preventDefault();
    event.stopPropagation();

    setDragState({
      item,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
    });
  };

  const startImportedFileDrag = (event: ReactPointerEvent<HTMLDivElement>, fileItem: ImportedFileItem) => {
    if (event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    setDragState({
      item: { type: fileItem.nodeType, label: fileItem.displayName, icon: fileItem.icon, desc: fileItem.path },
      nameOverride: fileItem.displayName,
      pointerId: event.pointerId,
      originX: event.clientX,
      originY: event.clientY,
      x: event.clientX,
      y: event.clientY,
      active: false,
    });
  };

  const importedGroups = useMemo(() => {
    const map = new Map<string, ImportedFileItem[]>();
    for (const item of importedItems) {
      const group = map.get(item.roleLabel) ?? [];
      group.push(item);
      map.set(item.roleLabel, group);
    }
    return map;
  }, [importedItems]);

  return (
    <div className={`palette${embedded ? " palette--embedded" : ""}${isOpen ? "" : " palette--collapsed"}`}>
      <div className="paletteHeaderRow">
        {isOpen && <div className="paletteHeader">COMPONENTS</div>}
        {!embedded && (
          <button
            className="btn panelCollapseBtn"
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
            {importedItems.length > 0 && (
              <button
                className={`paletteTab ${activeTab === "project" ? "active" : ""}`}
                onClick={() => setActiveTab("project")}
              >
                Project
                <span className="paletteTabCount">{importedItems.length}</span>
              </button>
            )}
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
                <button className="btn btn-primary workspace-wide-btn" onClick={addService}>
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

          {activeTab !== "project" && (
            <div className="paletteList">
              {filteredItems.length > 0 ? (
                filteredItems.map((item) => {
                  const matchedFiles = filesForType(item.type, workspaceFiles);
                  const isImplemented = matchedFiles.length > 0;
                  return (
                    <div
                      key={item.type}
                      onPointerDown={(event) => startNodeDrag(event, item)}
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
          )}

          {activeTab === "project" && (
            <div className="paletteProjectFiles">
              {importedGroups.size === 0 ? (
                <div className="paletteEmpty">No source files found in the imported project.</div>
              ) : (
                [...importedGroups.entries()].map(([role, items]) => (
                  <div key={role} className="paletteProjectGroup">
                    <div className="paletteSectionTitle">{role}s</div>
                    {items.map((fileItem) => (
                      <div
                        key={fileItem.path}
                        className="paletteItem paletteItem--file"
                        onPointerDown={(e) => startImportedFileDrag(e, fileItem)}
                        title={fileItem.path}
                      >
                        <div className="paletteIcon">{fileItem.icon}</div>
                        <div className="paletteText">
                          <div className="paletteTitle">{fileItem.displayName}</div>
                          <div className="paletteSub">{fileItem.path.split("/").slice(-2).join("/")}</div>
                        </div>
                        <div className="paletteHint">↗</div>
                      </div>
                    ))}
                  </div>
                ))
              )}
            </div>
          )}
        </div>
      )}

      {dragState?.active && (
        <div
          className="paletteDragPreview"
          style={{ left: dragState.x, top: dragState.y }}
        >
          <span className="paletteDragPreviewIcon">{dragState.item.icon}</span>
          <span className="paletteDragPreviewLabel">{dragState.item.label}</span>
        </div>
      )}
    </div>
  );
}
