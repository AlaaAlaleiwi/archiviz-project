import "../styles.css";
import { useRef, useState, useEffect } from "react";
import type { NodeData } from "../types";

interface Props {
  node: NodeData;
  selected: boolean;
  onPointerDown: (e: React.PointerEvent, node: NodeData) => void;
  onDelete: (id: string) => void;
  onRename: (id: string, name: string) => void;
  onStartWire: (
    id: string,
    side: "top" | "right" | "bottom" | "left",
    clientX: number,
    clientY: number
  ) => void;
  onEndWire: (
    id: string,
    side: "top" | "right" | "bottom" | "left"
  ) => void;
}

const TYPE_ICON: Record<string, string> = {
  api:      "⚡",
  database: "🗄️",
  queue:    "📨",
  auth:     "🔐",
  db:       "🗄️"
};

export default function Node({
  node,
  selected,
  onPointerDown,
  onDelete,
  onRename,
  onStartWire,
  onEndWire
}: Props) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(node.name);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (editing) inputRef.current?.focus(); }, [editing]);

  // Keep value in sync if node.name changes externally
  useEffect(() => { setValue(node.name); }, [node.name]);

  const commitRename = () => {
    setEditing(false);
    onRename(node.id, value);
  };

  // Port pointerDown — start a wire
  const handlePortDown = (
    e: React.PointerEvent,
    side: "top" | "right" | "bottom" | "left"
  ) => {
    e.stopPropagation();
    e.preventDefault();
    onStartWire(node.id, side, e.clientX, e.clientY);
  };

  // Port pointerUp — finish a wire
  const handlePortUp = (
    e: React.PointerEvent,
    side: "top" | "right" | "bottom" | "left"
  ) => {
    e.stopPropagation();
    onEndWire(node.id, side);
  };

  return (
    <div
      id={`node-${node.id}`}
      className={`node ${selected ? "selected" : ""}`}
      style={{ transform: `translate(${node.x}px, ${node.y}px)` }}
      onPointerDown={(e) => onPointerDown(e, node)}
      onDoubleClick={(e) => { e.stopPropagation(); setEditing(true); }}
    >
      {/* ---- header ---- */}
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

      {/* ---- ports ---- */}
      {(["top", "right", "bottom", "left"] as const).map(side => (
        <div
          key={side}
          className={`port ${side}`}
          onPointerDown={(e) => handlePortDown(e, side)}
          onPointerUp={(e) => handlePortUp(e, side)}
        />
      ))}
    </div>
  );
}