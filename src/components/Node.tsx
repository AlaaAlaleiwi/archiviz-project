import "../styles.css";
import { useRef, useState, useEffect } from "react";
import type { NodeData } from "../types";
import { hasConfig, summarizeConfig } from "../utils/componentConfigs";

interface Props {
  node: NodeData;
  selected: boolean;
  hasCode: boolean;
  onPointerDown: (e: React.PointerEvent, node: NodeData) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onConfigure: (id: string) => void;
  onViewCode: (id: string) => void;
  onStartWire: (
    id: string,
    side: "top" | "right" | "bottom" | "left",
    clientX: number,
    clientY: number
  ) => void;
}

const TYPE_ICON: Record<string, string> = {
  api:      "⚡",
  api_gateway: "🌐",
  microservice: "🧩",
  worker: "⚙️",
  scheduler: "⏰",
  database: "🗄️",
  sql_database: "🗃️",
  nosql_database: "📚",
  cache: "⚡",
  object_storage: "🪣",
  search_engine: "🔎",
  queue:    "📨",
  message_broker: "🚌",
  event_bus: "🛰️",
  stream_processor: "🌊",
  auth:     "🔐",
  websocket_gateway: "🔌",
  grpc_service: "📡",
  notification_service: "🔔",
  email_service: "✉️",
  payment_service: "💳",
  file_service: "📁",
  reverse_proxy: "🛡️",
  load_balancer: "↔️",
  rate_limiter: "🚦",
  config_service: "📝",
  secrets_manager: "🔑",
  logging_service: "📜",
  monitoring_service: "📊",
  tracing_service: "🧭",
  frontend_app: "🖥️",
  landing_page: "🏠",
  dashboard_page: "📊",
  feature_page: "🗂️",
  layout_shell: "🧱",
  router: "🧭",
  navigation_menu: "🧰",
  state_store: "🧠",
  client_api: "🔗",
  auth_ui: "🔐",
  profile_page: "👤",
  form_module: "📝",
  data_table: "📋",
  chart_widget: "📈",
  kanban_board: "🗃️",
  modal_system: "🪟",
  notification_center: "🔔",
  search_ui: "🔎",
  file_uploader: "📤",
  media_gallery: "🖼️",
  shared_components: "🧩",
  design_system: "🎨",
  hooks_layer: "🪝",
  react_app: "⚛️",
  react_hooks: "🪝",
  context_provider: "🌍",
  angular_app: "🅰️",
  angular_module: "📦",
  angular_service: "🛠️",
  vue_app: "🟢",
  vue_store: "🗂️",
  vue_composable: "🪄",
  db:       "🗄️"
};

export default function Node({
  node,
  selected,
  hasCode,
  onPointerDown,
  onDelete,
  onRename,
  onConfigure,
  onViewCode,
  onStartWire,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);
  useEffect(() => { setValue(node.name); }, [node.name]);

  const commitRename = () => { setEditing(false); onRename(node.id, value); };

  const handlePortDown = (e: React.PointerEvent, side: "top" | "right" | "bottom" | "left") => {
    e.stopPropagation();
    e.preventDefault();
    onStartWire(node.id, side, e.clientX, e.clientY);
  };

  const configurable  = hasConfig(node.type);
  const configured    = configurable && !!node.config && Object.keys(node.config).length > 0;
  const configSummary = configured ? summarizeConfig(node.config!) : null;

  return (
    <div
      id={`node-${node.id}`}
      className={`node ${selected ? "selected" : ""} ${configured ? "node--configured" : ""}`}
      style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
      onPointerDown={(e) => onPointerDown(e, node)}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
    >
      {/* ── header ── */}
      <div className="node-header">
        <span className="node-icon">{TYPE_ICON[node.type] ?? "📦"}</span>

        {editing ? (
          <input
            ref={inputRef}
            className="node-input"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onBlur={commitRename}
            onKeyDown={(e) => { if (e.key === "Enter") commitRename(); }}
            onPointerDown={(e) => e.stopPropagation()}
          />
        ) : (
          <div className="node-title">{node.name}</div>
        )}

        <button
          className="node-delete"
          onClick={(e) => { e.stopPropagation(); onDelete(node.id); }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          ✕
        </button>
      </div>

      <div className="node-type">{node.type}</div>

      {/* ── config row ── */}
      {configurable && (
        <button
          className={`node-config-btn ${configured ? "configured" : "unconfigured"}`}
          onClick={(e) => { e.stopPropagation(); onConfigure(node.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          title="Configure component"
        >
          {configured ? (
            <span className="node-config-summary">{configSummary}</span>
          ) : (
            <span className="node-config-prompt">⚙ Configure</span>
          )}
        </button>
      )}

      {/* ── view code button ── */}
      {hasCode && (
        <button
          className="node-code-btn"
          onClick={(e) => { e.stopPropagation(); onViewCode(node.id); }}
          onPointerDown={(e) => e.stopPropagation()}
          title="View generated code"
        >
          {"</>"}
        </button>
      )}

      {/* ── ports ── */}
      {(["top", "right", "bottom", "left"] as const).map(side => (
        <div
          key={side}
          className={`port ${side}`}
          data-node-id={node.id}
          data-port-side={side}
          onPointerDown={(e) => handlePortDown(e, side)}
        />
      ))}
    </div>
  );
}
