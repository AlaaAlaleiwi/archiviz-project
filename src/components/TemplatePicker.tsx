import { createPortal } from "react-dom";
import type { WorkspaceTemplate } from "../utils/templateLibrary";
import "../styles.css";
import { useDialogFocus } from "../useDialogFocus";

type Props = {
  templates: WorkspaceTemplate[];
  busy: boolean;
  onLoad: (template: WorkspaceTemplate) => void;
  onDelete: (template: WorkspaceTemplate) => void;
  onClose: () => void;
};

function formatDate(value: string) {
  if (value === "Built in") return value;
  try {
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return value;
  }
}

export default function TemplatePicker({ templates, busy, onLoad, onDelete, onClose }: Props) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose);
  const modal = (
    <div className="modal" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} className="template-picker" role="dialog" aria-modal="true" aria-label="Template library" onClick={event => event.stopPropagation()}>
        <div className="template-picker-header">
          <div>
            <div className="template-picker-title">Template Library</div>
            <div className="template-picker-subtitle">Save an architecture once, reuse it for any project</div>
          </div>
          <button type="button" className="np-close" onClick={onClose} aria-label="Close template library">✕</button>
        </div>

        <div className="template-picker-list">
          {templates.length === 0 && (
            <div className="template-picker-empty">
              No templates yet. Use the command palette (Ctrl+K) → “Save workspace as template”.
            </div>
          )}
          {templates.map(template => (
            <div key={template.id} className="template-picker-item">
              <div className="template-picker-item-main">
                <div className="template-picker-name">{template.name}</div>
                <div className="template-picker-meta">
                  {formatDate(template.savedAt)} · {template.files.length} file{template.files.length === 1 ? "" : "s"}
                  {template.meta.projectName ? ` · ${template.meta.projectName}` : ""}
                </div>
              </div>
              <div className="template-picker-actions">
                <button
                  type="button"
                  className="file-action-btn file-action-btn--run"
                  disabled={busy}
                  onClick={() => onLoad(template)}
                >
                  Load
                </button>
                {!template.builtIn && (
                  <button type="button" className="file-action-btn" disabled={busy} onClick={() => onDelete(template)} title="Delete template" aria-label={`Delete ${template.name}`}>✕</button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );

  const container = document.querySelector(".app") ?? document.body;
  return createPortal(modal, container);
}
