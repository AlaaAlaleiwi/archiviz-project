import { useCallback, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import "../styles.css";
import CodeEditor from "./CodeEditor";
import { useDialogFocus } from "../useDialogFocus";
import ClassNetwork3D from "./ClassNetwork3D";
import { ROLE_COLOR } from "../utils/classMap";
import {
  buildClassNetwork,
  extractClassMethodFlows,
  type ClassNetworkNode,
} from "../utils/classNetwork";

export type CodeFile = { path: string; content: string };

interface Props {
  nodeName: string;
  nodeType: string;
  files: CodeFile[];
  onClose: () => void;
  onSave?: (updatedFiles: CodeFile[]) => void;
}

function roleColor(role: ClassNetworkNode["role"]) {
  if (role in ROLE_COLOR) return ROLE_COLOR[role as keyof typeof ROLE_COLOR];
  const fallback: Record<string, string> = {
    dto: "#22c55e",
    test: "#a78bfa",
    migration: "#f97316",
    unknown: "var(--muted)",
  };
  return fallback[role] ?? "var(--accent)";
}

function basename(path: string) {
  return path.split("/").pop() ?? path;
}

const LANGUAGE_BY_EXT: Record<string, string> = {
  java: "java",
  kt: "kotlin",
  ts: "typescript",
  tsx: "typescript",
  js: "javascript",
  jsx: "javascript",
  py: "python",
  go: "go",
  cs: "csharp",
  sql: "sql",
  xml: "xml",
  yaml: "yaml",
  yml: "yaml",
  json: "json",
  md: "markdown",
  properties: "properties",
  gradle: "groovy",
  toml: "ini",
};

function languageFor(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return LANGUAGE_BY_EXT[ext] ?? "plaintext";
}

function openPathInWorkspaceEditor(path: string) {
  window.dispatchEvent(new CustomEvent("archiviz:palette-open-file", { detail: path }));
}

export default function NodeCodeModal({ nodeName, nodeType, files, onClose, onSave }: Props) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(true);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [savedFlash, setSavedFlash] = useState(false);

  const classNetwork = useMemo(() => buildClassNetwork(files, nodeType), [files, nodeType]);
  const activeNode = useMemo(
    () =>
      classNetwork.nodes.find(node => node.id === selectedNodeId) ??
      classNetwork.nodes[0] ??
      null,
    [classNetwork.nodes, selectedNodeId]
  );
  const activeContent = activeNode
    ? edits[activeNode.file.path] ?? activeNode.file.content
    : "";
  const methodFlows = useMemo(
    () => activeNode ? extractClassMethodFlows(activeContent) : [],
    [activeNode, activeContent]
  );
  const isDirty = activeNode ? activeContent !== activeNode.file.content : false;

  const handleSave = useCallback(() => {
    if (!onSave || !activeNode) return;
    const updated = files.map(file =>
      file.path === activeNode.file.path
        ? { ...file, content: edits[file.path] ?? file.content }
        : file
    );
    onSave(updated);
    setSavedFlash(true);
    window.setTimeout(() => setSavedFlash(false), 1200);
  }, [onSave, activeNode, files, edits]);

  const graph = (
    <ClassNetwork3D
      network={classNetwork}
      activeNodeId={activeNode?.id ?? null}
      selectedEdgeId={selectedEdgeId}
      onSelectNode={node => setSelectedNodeId(node.id)}
      onSelectEdge={setSelectedEdgeId}
      getRoleColor={roleColor}
    />
  );

  const modal = (
    <div className="modal" onClick={onClose}>
      <div
        ref={dialogRef}
        tabIndex={-1}
        className={`class-graph-modal ${expanded ? "class-graph-modal--expanded" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={`${nodeName} code inspector`}
        onClick={event => event.stopPropagation()}
      >
        <div className="class-graph-topbar">
          <div>
            <div className="class-graph-title">{nodeName}</div>
            <div className="class-graph-subtitle">{nodeType} · rotate, pan, zoom, then click a class</div>
          </div>
          <div className="class-graph-actions">
            <button type="button" className="class-graph-action" onClick={() => setExpanded(prev => !prev)}>
              {expanded ? "Compact" : "Expand"}
            </button>
            <button type="button" className="np-close" onClick={onClose} aria-label="Close code inspector">✕</button>
          </div>
        </div>

        <div className="class-graph-stage">
          {classNetwork.nodes.length > 0 ? graph : (
            <div className="class-graph-empty">No source files available for this node yet.</div>
          )}

          {activeNode && (
            <div className="class-node-popup">
              <div className="class-node-popup-header">
                <div>
                  <div className="class-node-popup-title">{activeNode.name}</div>
                  <div className="class-node-popup-path">{basename(activeNode.file.path)}</div>
                </div>
                <div className="class-node-popup-header-actions">
                  <button
                    type="button"
                    className="class-node-popup-close"
                    onClick={() => openPathInWorkspaceEditor(activeNode.file.path)}
                    aria-label="Open file in workspace editor"
                    title="Open in editor"
                  >
                    ⇱
                  </button>
                  <button
                    type="button"
                    className="class-node-popup-close"
                    onClick={() => setSelectedNodeId(null)}
                    aria-label="Close class details"
                  >
                    ✕
                  </button>
                </div>
              </div>

              <div className="class-method-section">
                <div className="class-method-heading">Methods</div>
                {methodFlows.length > 0 ? (
                  methodFlows.map(method => (
                    <div key={method.signature} className="class-method-card">
                      <div className="class-method-name">{method.name}</div>
                      <div className="class-method-row">
                        <span>Input</span>
                        <code>{method.input}</code>
                      </div>
                      <div className="class-method-row">
                        <span>Output</span>
                        <code>{method.output}</code>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="class-method-empty">No methods detected in this class.</div>
                )}
              </div>

              <div className="class-code-section">
                <div className="class-method-heading">Code</div>
                <div className="class-code-editor">
                  <CodeEditor
                    path={activeNode.file.path}
                    value={activeContent}
                    language={languageFor(activeNode.file.path)}
                    dark
                    fontSize={11.5}
                    lineNumbers
                    wordWrap
                    readOnly={!onSave}
                    onChange={value => {
                      if (!onSave || !activeNode) return;
                      setEdits(prev => ({ ...prev, [activeNode.file.path]: value }));
                    }}
                  />
                </div>
                {onSave && (
                  <div className="class-code-footer">
                    <span className={`class-dirty-hint ${isDirty ? "class-dirty-hint--dirty" : ""}`}>
                      {isDirty ? "Unsaved changes" : savedFlash ? "Saved" : ""}
                    </span>
                    <button
                      type="button"
                      className="class-save-btn"
                      onClick={handleSave}
                      disabled={!isDirty}
                    >
                      Save
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );

  const container = document.querySelector(".app") ?? document.body;
  return createPortal(modal, container);
}
