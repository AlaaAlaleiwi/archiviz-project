import { useEffect, useRef, useState } from "react";
import type { GenerationChange } from "../utils/generationPlan";

type Props = {
  changes: GenerationChange[];
  onCancel: () => void;
  onApply: (changes: GenerationChange[]) => void;
};

export default function GenerationPlanModal({ changes, onCancel, onApply }: Props) {
  const [draft, setDraft] = useState(changes);
  const [expanded, setExpanded] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onCancel();
      if (event.key !== "Tab" || !dialogRef.current) return;
      const controls = [...dialogRef.current.querySelectorAll<HTMLElement>("button, input, [tabindex]:not([tabindex='-1'])")];
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls.at(-1)!;
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => { window.removeEventListener("keydown", onKeyDown); previous?.focus(); };
  }, [onCancel]);

  const selected = draft.filter(change => change.selected).length;
  const modified = draft.filter(change => change.kind === "modify").length;

  return (
    <div className="modal" onClick={onCancel}>
      <div ref={dialogRef} className="generation-plan" role="dialog" aria-modal="true" aria-labelledby="generation-plan-title" tabIndex={-1} onClick={event => event.stopPropagation()}>
        <header className="generation-plan__header">
          <div>
            <h2 id="generation-plan-title">Review generated changes</h2>
            <p>{draft.length} proposed files · {modified} existing files require approval</p>
          </div>
          <button type="button" className="np-close" onClick={onCancel} aria-label="Cancel generation plan">✕</button>
        </header>
        {modified > 0 && <div className="generation-plan__warning" role="alert">Existing files are never replaced unless they remain selected below.</div>}
        <div className="generation-plan__list">
          {draft.map((change, index) => (
            <article key={change.path} className={`generation-change generation-change--${change.kind}`}>
              <label className="generation-change__summary">
                <input type="checkbox" checked={change.selected} onChange={event => setDraft(current => current.map((item, itemIndex) => itemIndex === index ? { ...item, selected: event.target.checked } : item))} />
                <span className="generation-change__kind">{change.kind === "add" ? "ADD" : "MODIFY"}</span>
                <span className="generation-change__path">{change.path}</span>
              </label>
              <button type="button" className="btn btn-sm" onClick={() => setExpanded(current => current === change.path ? null : change.path)} aria-expanded={expanded === change.path}>Diff</button>
              {expanded === change.path && (
                <div className="generation-change__diff">
                  <pre aria-label="Current content">{change.before || "(new file)"}</pre>
                  <pre aria-label="Generated content">{change.after}</pre>
                </div>
              )}
            </article>
          ))}
        </div>
        <footer className="generation-plan__actions">
          <button type="button" className="btn" onClick={onCancel}>Cancel</button>
          <button type="button" className="btn btn-primary" disabled={selected === 0} onClick={() => onApply(draft)}>Apply {selected} change{selected === 1 ? "" : "s"}</button>
        </footer>
      </div>
    </div>
  );
}
