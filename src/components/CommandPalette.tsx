import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { WorkspaceFile } from "./FileWorkspace";
import "../styles.css";

export type PaletteAction = {
  id: string;
  label: string;
  hint?: string;
  run: () => void;
};

type PaletteItem =
  | { kind: "file"; path: string; score: number }
  | { kind: "action"; id: string; label: string; hint?: string; score: number };

function scoreItem(haystack: string, query: string): number {
  const lowered = query.toLowerCase();
  if (!lowered) return 1;
  const index = haystack.toLowerCase().indexOf(lowered);
  if (index === -1) return 0;
  if (index === 0 || "/._-".includes(haystack[index - 1] ?? "")) return 3;
  return 2;
}

type Props = {
  files: WorkspaceFile[];
  actions: PaletteAction[];
  onClose: () => void;
}

export default function CommandPalette({ files, actions, onClose }: Props) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const items = useMemo<PaletteItem[]>(() => {
    const fileItems: PaletteItem[] = files
      .map(file => ({ kind: "file" as const, path: file.path, score: scoreItem(file.path, query) }))
      .filter(item => item.score > 0)
      .sort((a, b) => b.score - a.score || a.path.localeCompare(b.path))
      .slice(0, 8);
    const actionItems: PaletteItem[] = actions
      .map(action => ({ kind: "action" as const, id: action.id, label: action.label, hint: action.hint, score: scoreItem(action.label, query) }))
      .filter(item => item.score > 0)
      .slice(0, 6);
    return [
      ...actionItems.map(item => ({ ...item, score: (item.score || 1) + 4 })),
      ...fileItems,
    ];
  }, [files, actions, query]);

  const clampedIndex = Math.min(activeIndex, Math.max(items.length - 1, 0));

  const runItem = (item: PaletteItem) => {
    if (item.kind === "file") {
      window.dispatchEvent(new CustomEvent("archiviz:palette-open-file", { detail: item.path }));
      onClose();
      return;
    }
    const action = actions.find(entry => entry.id === item.id);
    if (action) {
      action.run();
      onClose();
    }
  };

  const modal = (
    <div
      className="command-palette-backdrop"
      onClick={onClose}
    >
      <div className="command-palette" onClick={event => event.stopPropagation()}>
        <input
          ref={inputRef}
          className="command-palette-input"
          autoFocus
          value={query}
          onChange={event => setQuery(event.target.value)}
          placeholder="Run a command or jump to a file..."
          onKeyDown={event => {
            if (event.key === "Escape") { onClose(); return; }
            if (event.key === "ArrowDown") { event.preventDefault(); setActiveIndex(index => Math.min(index + 1, items.length - 1)); }
            if (event.key === "ArrowUp") { event.preventDefault(); setActiveIndex(index => Math.max(index - 1, 0)); }
            if (event.key === "Enter" && items[clampedIndex]) { event.preventDefault(); runItem(items[clampedIndex]); }
          }}
        />
        <div className="command-palette-list">
          {items.map((item, index) => (
            <button
              key={item.kind === "file" ? item.path : item.id}
              className={`command-palette-item ${index === clampedIndex ? "active" : ""}`}
              onMouseEnter={() => setActiveIndex(index)}
              onClick={() => runItem(item)}
            >
              <span className={`command-palette-kind command-palette-kind--${item.kind}`}>
                {item.kind === "file" ? "File" : "Cmd"}
              </span>
              <span className="command-palette-label">
                {item.kind === "file" ? item.path : item.label}
              </span>
              {item.kind === "action" && item.hint && (
                <span className="command-palette-hint">{item.hint}</span>
              )}
            </button>
          ))}
          {items.length === 0 && <div className="command-palette-empty">No matches.</div>}
        </div>
      </div>
    </div>
  );

  const container = document.querySelector(".app") ?? document.body;
  return createPortal(modal, container);
}
