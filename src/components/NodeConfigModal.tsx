import { useState } from "react";
import { createPortal } from "react-dom";
import type { NodeData } from "../types";
import { getComponentConfig, type ConfigField } from "../utils/componentConfigs";
import "../styles.css";
import { useDialogFocus } from "../useDialogFocus";

interface Props {
  node: NodeData;
  onSave: (id: string, config: Record<string, unknown>) => void;
  onClose: () => void;
}

function MultiSelect({ field, value, onChange }: { field: ConfigField; value: string[]; onChange: (v: string[]) => void }) {
  const toggle = (opt: string) =>
    onChange(value.includes(opt) ? value.filter(v => v !== opt) : [...value, opt]);
  return (
    <div className="ncm-chips">
      {field.options!.map(opt => (
        <button
          key={opt}
          type="button"
          className={`ncm-chip ${value.includes(opt) ? "active" : ""}`}
          onClick={() => toggle(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function SingleSelect({ field, value, onChange }: { field: ConfigField; value: string; onChange: (v: string) => void }) {
  return (
    <div className="ncm-chips">
      {field.options!.map(opt => (
        <button
          key={opt}
          type="button"
          className={`ncm-chip ${value === opt ? "active" : ""}`}
          onClick={() => onChange(opt)}
        >
          {opt}
        </button>
      ))}
    </div>
  );
}

function Toggle({ value, onChange }: { value: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      className={`ncm-toggle ${value ? "on" : ""}`}
      onClick={() => onChange(!value)}
      aria-pressed={value}
    >
      <span className="ncm-toggle-thumb" />
    </button>
  );
}

export default function NodeConfigModal({ node, onSave, onClose }: Props) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose);
  const schema = getComponentConfig(node.type);
  if (!schema) return null;

  const buildInitial = (): Record<string, unknown> => {
    const base: Record<string, unknown> = {};
    for (const f of schema.fields) {
      base[f.key] = node.config?.[f.key] ?? f.default ?? (f.type === "multiselect" ? [] : f.type === "toggle" ? false : "");
    }
    return base;
  };

  // eslint-disable-next-line react-hooks/rules-of-hooks
  const [values, setValues] = useState<Record<string, unknown>>(buildInitial);

  const set = (key: string, val: unknown) => setValues(prev => ({ ...prev, [key]: val }));

  const handleSave = () => {
    onSave(node.id, values);
    onClose();
  };

  const modal = (
    <div className="modal" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} className="ncm-panel" role="dialog" aria-modal="true" aria-label={`Configure ${node.name}`} onClick={e => e.stopPropagation()}>

        <div className="ncm-header">
          <div>
            <div className="ncm-title">Configure · {node.name}</div>
            <div className="ncm-subtitle">{node.type}</div>
          </div>
          <button className="np-close" onClick={onClose} aria-label="Close configuration">✕</button>
        </div>

        <div className="ncm-body">
          {schema.fields.map(field => (
            <div key={field.key} className="ncm-field">
              <div className="ncm-field-header">
                <label className="ncm-label">{field.label}</label>
                {field.type === "toggle" && (
                  <Toggle
                    value={values[field.key] as boolean}
                    onChange={v => set(field.key, v)}
                  />
                )}
              </div>

              {field.hint && <p className="ncm-hint">{field.hint}</p>}

              {field.type === "multiselect" && (
                <MultiSelect
                  field={field}
                  value={(values[field.key] as string[]) ?? []}
                  onChange={v => set(field.key, v)}
                />
              )}

              {field.type === "select" && (
                <SingleSelect
                  field={field}
                  value={(values[field.key] as string) ?? ""}
                  onChange={v => set(field.key, v)}
                />
              )}

              {(field.type === "text" || field.type === "password") && (
                <input
                  className="input"
                  type={field.type}
                  value={(values[field.key] as string) ?? ""}
                  placeholder={field.placeholder}
                  onChange={e => set(field.key, e.target.value)}
                />
              )}

              {field.type === "number" && (
                <input
                  className="input"
                  type="number"
                  value={(values[field.key] as number) ?? ""}
                  placeholder={field.placeholder}
                  onChange={e => set(field.key, Number(e.target.value))}
                />
              )}
            </div>
          ))}
        </div>

        <div className="ncm-footer">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleSave}>Save Configuration</button>
        </div>
      </div>
    </div>
  );

  const container = document.querySelector(".app") ?? document.body;
  return createPortal(modal, container);
}
