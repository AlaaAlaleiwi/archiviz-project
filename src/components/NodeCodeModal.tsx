import { useState } from "react";
import { createPortal } from "react-dom";
import "../styles.css";

interface Props {
  nodeName: string;
  nodeType: string;
  filePath: string;
  code: string;
  onClose: () => void;
  onSave?: (newCode: string) => void;
}

export default function NodeCodeModal({ nodeName, nodeType, filePath, code, onClose, onSave }: Props) {
  const [editedCode, setEditedCode] = useState(code);
  const [copied, setCopied] = useState(false);
  const [saved, setSaved] = useState(false);

  const isDirty = editedCode !== code;

  const handleCopy = () => {
    navigator.clipboard.writeText(editedCode).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSave = () => {
    onSave?.(editedCode);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const modal = (
    <div className="modal" onClick={onClose}>
      <div className="ncm-panel ncm-code-panel" onClick={e => e.stopPropagation()}>

        <div className="ncm-header">
          <div>
            <div className="ncm-title">
              Generated Code · {nodeName}
              {isDirty && (
                <span style={{ marginLeft: 8, fontSize: 10, color: "var(--muted)", fontWeight: 400 }}>
                  (unsaved changes)
                </span>
              )}
            </div>
            <div className="ncm-subtitle">{nodeType} · {filePath}</div>
          </div>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <button className="ncm-copy-btn" onClick={handleCopy}>
              {copied ? "✓ Copied" : "Copy"}
            </button>
            {onSave && isDirty && (
              <button
                className="ncm-copy-btn"
                onClick={handleSave}
                style={{ borderColor: saved ? "var(--accent)" : undefined }}
              >
                {saved ? "✓ Saved" : "Save changes"}
              </button>
            )}
            <button className="np-close" onClick={onClose}>✕</button>
          </div>
        </div>

        <div className="ncm-code-body" style={{ display: "flex", flexDirection: "column" }}>
          <textarea
            className="ncm-code-pre"
            value={editedCode}
            onChange={e => setEditedCode(e.target.value)}
            spellCheck={false}
            style={{
              flex: 1,
              resize: "none",
              border: "none",
              outline: "none",
              background: "transparent",
              width: "100%",
              minHeight: 400,
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
        </div>

      </div>
    </div>
  );

  const container = document.querySelector(".app") ?? document.body;
  return createPortal(modal, container);
}