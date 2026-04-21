import { useState } from "react";
import { createPortal } from "react-dom";
import "../styles.css";
import { getClassMap, ROLE_COLOR, type ClassNode } from "../utils/classMap";

export type CodeFile = { path: string; content: string };

interface Props {
  nodeName: string;
  nodeType: string;
  files: CodeFile[];
  onClose: () => void;
  onSave?: (updatedFiles: CodeFile[]) => void;
}

function basename(path: string) {
  return path.split("/").pop() ?? path;
}

function stripExt(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

function isTestFile(path: string) {
  const p = path.toLowerCase();
  return p.includes("test") || p.includes("spec") || p.includes("__tests__");
}

function matchFileToClass(path: string, cls: ClassNode): boolean {
  const name = basename(path).toLowerCase();
  return (
    name.includes(cls.abbr.toLowerCase()) ||
    name.includes(cls.label.toLowerCase().replace(/\s/g, ""))
  );
}

export default function NodeCodeModal({ nodeName, nodeType, files, onClose, onSave }: Props) {
  const classMap = getClassMap(nodeType);
  const [edited, setEdited]   = useState<CodeFile[]>(files);
  const [activePath, setActivePath] = useState<string | null>(files[0]?.path ?? null);
  const [copied, setCopied]   = useState(false);
  const [saved, setSaved]     = useState(false);

  const isDirty = edited.some((f, i) => f.content !== files[i]?.content);
  const activeFile = edited.find(f => f.path === activePath) ?? null;

  const testFiles = edited.filter(f => isTestFile(f.path));
  const implFiles = edited.filter(f => !isTestFile(f.path));

  // Map class chain entries to their generated files
  const chainEntries: { cls: ClassNode; file: CodeFile | null }[] = classMap
    ? classMap.map(cls => ({ cls, file: implFiles.find(f => matchFileToClass(f.path, cls)) ?? null }))
    : [];

  const matchedPaths = new Set(chainEntries.map(e => e.file?.path).filter(Boolean));
  const supportFiles = implFiles.filter(f => !matchedPaths.has(f.path));

  const handleContentChange = (val: string) => {
    if (!activePath) return;
    setEdited(prev => prev.map(f => f.path === activePath ? { ...f, content: val } : f));
  };

  const handleCopy = () => {
    if (!activeFile) return;
    navigator.clipboard.writeText(activeFile.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSave = () => {
    onSave?.(edited);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const modal = (
    <div className="modal" onClick={onClose}>
      <div className="nim-panel" onClick={e => e.stopPropagation()}>

        {/* ── header ── */}
        <div className="nim-header">
          <div>
            <div className="nim-title">
              {nodeName}
              {isDirty && <span className="nim-dirty">(unsaved changes)</span>}
            </div>
            <div className="nim-subtitle">{nodeType} · {edited.length} file{edited.length !== 1 ? "s" : ""}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            {activeFile && (
              <button className="ncm-copy-btn" onClick={handleCopy}>
                {copied ? "✓ Copied" : "Copy"}
              </button>
            )}
            {onSave && isDirty && (
              <button className="ncm-copy-btn" onClick={handleSave}>
                {saved ? "✓ Saved" : "Save"}
              </button>
            )}
            <button className="np-close" onClick={onClose}>✕</button>
          </div>
        </div>

        {/* ── class diagram ── */}
        <div className="nim-diagram">
          {/* Main chain */}
          <div className="nim-chain">
            {(classMap ? chainEntries : implFiles.map(f => ({ cls: null as any, file: f }))).map((entry, i) => {
              const { cls, file } = entry;
              const color = cls ? ROLE_COLOR[cls.role as keyof typeof ROLE_COLOR] : "var(--accent)";
              const label = cls ? cls.abbr : stripExt(basename(file!.path));
              const sublabel = cls ? cls.label : undefined;
              const isActive = file && activePath === file.path;
              const hasFile = !!file;

              return (
                <div key={cls?.abbr ?? file?.path ?? i} className="nim-chain-item">
                  {i > 0 && <div className="nim-chain-connector"><span className="nim-chain-arrow">→</span></div>}
                  <button
                    className={`nim-class-box ${isActive ? "nim-class-box--active" : ""} ${!hasFile ? "nim-class-box--missing" : ""}`}
                    style={{
                      borderColor: color,
                      ...(isActive ? { background: `${color}1a`, boxShadow: `0 0 0 1px ${color}44` } : {}),
                    }}
                    onClick={() => file && setActivePath(file.path)}
                    title={file?.path ?? (cls ? `${cls.label} — not generated` : "")}
                    disabled={!hasFile}
                  >
                    <span className="nim-class-abbr" style={{ color }}>{label}</span>
                    {sublabel && <span className="nim-class-sublabel">{sublabel}</span>}
                  </button>
                </div>
              );
            })}
          </div>

          {/* Support files (DTOs, migrations, exceptions…) */}
          {supportFiles.length > 0 && (
            <div className="nim-row">
              {supportFiles.map(f => (
                <button
                  key={f.path}
                  className={`nim-chip ${activePath === f.path ? "nim-chip--active" : ""}`}
                  onClick={() => setActivePath(f.path)}
                  title={f.path}
                >
                  {stripExt(basename(f.path))}
                </button>
              ))}
            </div>
          )}

          {/* Test files */}
          {testFiles.length > 0 && (
            <div className="nim-row">
              <span className="nim-row-label">Tests</span>
              {testFiles.map(f => (
                <button
                  key={f.path}
                  className={`nim-chip nim-chip--test ${activePath === f.path ? "nim-chip--active" : ""}`}
                  onClick={() => setActivePath(f.path)}
                  title={f.path}
                >
                  {stripExt(basename(f.path))}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* ── active file path ── */}
        {activeFile && <div className="ncm-filepath">{activeFile.path}</div>}

        {/* ── code editor ── */}
        <div className="ncm-code-body">
          {activeFile ? (
            <textarea
              key={activePath}
              className="ncm-code-pre"
              value={activeFile.content}
              onChange={e => handleContentChange(e.target.value)}
              spellCheck={false}
              style={{
                flex: 1,
                resize: "none",
                border: "none",
                outline: "none",
                background: "transparent",
                width: "100%",
                minHeight: 380,
                fontFamily: 'ui-monospace, "Cascadia Code", "Fira Code", monospace',
                fontSize: "12.5px",
                lineHeight: 1.65,
                color: "var(--text)",
                whiteSpace: "pre",
                overflowWrap: "normal",
                overflowX: "auto",
                tabSize: 2,
                caretColor: "var(--accent)",
              }}
            />
          ) : (
            <div className="nim-empty-state">Select a class above to view its code</div>
          )}
        </div>

      </div>
    </div>
  );

  const container = document.querySelector(".app") ?? document.body;
  return createPortal(modal, container);
}
