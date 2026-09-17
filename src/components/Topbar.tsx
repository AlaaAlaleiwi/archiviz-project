import "../styles.css";
import { useState, useRef, useEffect } from "react";
import type { JavaVersion, SpringBootVersion, BuildTool, Language } from "../types";
import { useDialogFocus } from "../useDialogFocus";

const JAVA_VERSIONS: JavaVersion[]         = ["17", "21", "25"];
const SPRING_VERSIONS: SpringBootVersion[] = ["3.2", "3.3", "3.4"];
const BUILD_TOOLS: BuildTool[]             = ["maven", "gradle"];

export type JavaProjectConfig = {
  projectName:       string;
  javaVersion:       JavaVersion;
  springBootVersion: SpringBootVersion;
  buildTool:         BuildTool;
};

export type RepositoryGitOperation =
  | "init" | "status" | "fetch" | "set-origin"
  | "pull" | "push" | "rebase" | "merge"
  | "stash" | "stash-pop" | "abort-rebase" | "abort-merge";

/* ──────────────────────────────────────────────────────────────────────────
   GENERIC DROPDOWN MENU
────────────────────────────────────────────────────────────────────────── */
type DropdownItem =
  | { kind: "action"; label: string; hint?: string; onClick: () => void; disabled?: boolean; danger?: boolean }
  | { kind: "divider" }
  | { kind: "section"; label: string };

function DropdownMenu({
  label, items, disabled = false, alignRight = false,
}: {
  label: React.ReactNode;
  items: DropdownItem[];
  disabled?: boolean;
  alignRight?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  return (
    <div className="topbar-dropdown" ref={ref}>
      <button className="btn" onClick={() => !disabled && setOpen(o => !o)} disabled={disabled}>
        {label}
        <span className="dropdown-caret">▾</span>
      </button>
      {open && (
        <div className={`dropdown-menu${alignRight ? " dropdown-menu--right" : ""}`}>
          {items.map((item, i) => {
            if (item.kind === "divider")
              return <div key={i} className="dropdown-divider" />;
            if (item.kind === "section")
              return <div key={i} className="dropdown-section-label">{item.label}</div>;
            return (
              <button
                key={item.label}
                className={`dropdown-item${item.danger ? " dropdown-item--danger" : ""}`}
                disabled={item.disabled}
                onClick={() => { item.onClick(); setOpen(false); }}
              >
                <span className="dropdown-item-label">{item.label}</span>
                {item.hint && <span className="dropdown-item-hint">{item.hint}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   UNSAVED CHANGES MODAL
────────────────────────────────────────────────────────────────────────── */
function UnsavedChangesModal({
  projectName, onSaveAndContinue, onDiscardAndContinue, onCancel,
}: {
  projectName: string;
  onSaveAndContinue: () => void;
  onDiscardAndContinue: () => void;
  onCancel: () => void;
}) {
  const dialogRef = useDialogFocus<HTMLDivElement>(onCancel);
  return (
    <div className="modal" onClick={onCancel}>
      <div ref={dialogRef} tabIndex={-1} className="np-modal unsaved-modal" role="dialog" aria-modal="true" aria-label="Unsaved changes" onClick={e => e.stopPropagation()}>
        <div className="unsaved-icon">⚠️</div>
        <div className="np-header" style={{ flexDirection: "column", alignItems: "flex-start", gap: 6 }}>
          <span className="np-title">Unsaved changes</span>
          <p className="unsaved-desc">
            <strong>{projectName || "This project"}</strong> has unsaved changes.
            Save before creating a new project?
          </p>
        </div>
        <div className="unsaved-actions">
          <button className="btn" onClick={onCancel}>Cancel</button>
          <button className="btn btn-danger" onClick={onDiscardAndContinue}>Discard & Continue</button>
          <button className="btn btn-primary" onClick={onSaveAndContinue}>Save & Continue</button>
        </div>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   PROJECT CONFIG MODAL
────────────────────────────────────────────────────────────────────────── */
export function ProjectConfigModal({
  initial,
  title = "New Project",
  confirmLabel = "Create Project →",
  onConfirm,
  onClose,
}: {
  initial: JavaProjectConfig;
  title?: string;
  confirmLabel?: string;
  onConfirm: (cfg: JavaProjectConfig) => void;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<JavaProjectConfig>(initial);
  const dialogRef = useDialogFocus<HTMLDivElement>(onClose);
  const update = (patch: Partial<JavaProjectConfig>) => setCfg(prev => ({ ...prev, ...patch }));

  const handleConfirm = () => {
    if (!cfg.projectName.trim()) { alert("Please enter a project name."); return; }
    onConfirm(cfg);
    onClose();
  };

  return (
    <div className="modal" onClick={onClose}>
      <div ref={dialogRef} tabIndex={-1} className="np-modal" role="dialog" aria-modal="true" aria-label={title} onClick={e => e.stopPropagation()}>
        <div className="np-header">
          <span className="np-title">{title}</span>
          <button className="np-close" onClick={onClose} aria-label={`Close ${title}`}>✕</button>
        </div>

        <div className="np-field">
          <label className="np-label">Project Name</label>
          <input
            className="np-input"
            placeholder="my-project"
            value={cfg.projectName}
            onChange={e => update({ projectName: e.target.value })}
            onKeyDown={e => e.key === "Enter" && handleConfirm()}
            autoFocus
          />
        </div>

        <div className="np-field">
          <label className="np-label">Java Version</label>
          <div className="np-chip-row">
            {JAVA_VERSIONS.map(v => (
              <button key={v} className={`np-chip ${cfg.javaVersion === v ? "active" : ""}`} onClick={() => update({ javaVersion: v })}>
                ☕ Java {v}
              </button>
            ))}
          </div>
        </div>

        <div className="np-field">
          <label className="np-label">Spring Boot Version</label>
          <div className="np-chip-row">
            {SPRING_VERSIONS.map(v => (
              <button key={v} className={`np-chip ${cfg.springBootVersion === v ? "active" : ""}`} onClick={() => update({ springBootVersion: v })}>
                Spring Boot {v}
              </button>
            ))}
          </div>
        </div>

        <div className="np-field">
          <label className="np-label">Build Tool</label>
          <div className="np-chip-row">
            {BUILD_TOOLS.map(t => (
              <button key={t} className={`np-chip ${cfg.buildTool === t ? "active" : ""}`} onClick={() => update({ buildTool: t })}>
                {t === "maven" ? "⚙ Maven" : "🐘 Gradle"}
              </button>
            ))}
          </div>
        </div>

        <div className="np-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm}>{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}

type AutoSaveState = "idle" | "unsaved" | "saving" | "saved" | "error" | "local";

export interface AutosaveDetails {
  lastSavedAt: string | null;
  destination: string;
  error: string | null;
  canRestore: boolean;
}

function AutosaveChip({
  state,
  details,
  active,
  onToggle,
  onRetry,
  onRestore,
}: {
  state: AutoSaveState;
  details: AutosaveDetails;
  active: boolean;
  onToggle: () => void;
  onRetry: () => void;
  onRestore: () => void;
}) {
  const icon = state === "saving" ? "⋯" : state === "error" ? "⚠" : state === "unsaved" ? "●" : state === "local" ? "⌂" : "✓";
  const colorClass =
    state === "saving" ? "autosave-chip--saving"
    : state === "error" ? "autosave-chip--error"
    : state === "unsaved" ? "autosave-chip--saving"
    : state === "local" ? "autosave-chip--local"
    : "autosave-chip--saved";
  const statusLabel = state === "saving" ? "Saving…"
    : state === "error" ? "Save failed — Retry"
    : state === "unsaved" ? "Unsaved changes"
    : state === "local" ? "Local-only"
    : details.lastSavedAt ? `Saved ${new Date(details.lastSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
    : "Save ready";

  return (
    <div className="autosave-chip-wrapper">
      <button
        type="button"
        className={`autosave-chip ${colorClass}`}
        aria-expanded={active}
        onClick={onToggle}
      >
        <span className="autosave-chip-icon">{icon}</span>
        <span className="topbar-autosave">{statusLabel}</span>
        <span className="autosave-chip-caret">▾</span>
      </button>

      {active && (
        <div className="autosave-details-dropdown">
          <div className="autosave-details-row">
            <span className="autosave-details-label">Destination</span>
            <span className="autosave-details-value">{details.destination}</span>
          </div>
          {details.lastSavedAt && (
            <div className="autosave-details-row">
              <span className="autosave-details-label">Last saved</span>
              <span className="autosave-details-value">{new Date(details.lastSavedAt).toLocaleString()}</span>
            </div>
          )}
          {details.error && (
            <div className="autosave-details-row">
              <span className="autosave-details-label">Error</span>
              <span className="autosave-details-value autosave-details-value--error">{details.error}</span>
            </div>
          )}
          <div className="autosave-details-actions">
            {state === "error" && (
              <button type="button" className="btn btn-sm" onClick={onRetry}>Retry</button>
            )}
            {details.canRestore && (
              <button type="button" className="btn btn-sm btn-primary" onClick={onRestore}>Restore</button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────────────────
   TOPBAR
───────────────────────────────────────────────────────────────────────── */
interface TopbarProps {
  canSaveProject: boolean;
  hasUnsavedChanges?: boolean;
  autosaveState?: AutoSaveState;
  autosaveDetails?: AutosaveDetails;
  autosaveDetailsActive?: boolean;
  onToggleAutosaveDetails?: () => void;
  onRetryAutosave?: () => void;
  onRestoreAutosave?: () => void;
  importingProject?: boolean;
  javaVersion: JavaVersion;
  setJavaVersion: (v: JavaVersion) => void;
  springBootVersion: SpringBootVersion;
  setSpringBootVersion: (v: SpringBootVersion) => void;
  detectedLanguage?: Language;
  detectedFramework?: string;
  workspaceName: string;
  setWorkspaceName: (n: string) => void;
  projectName: string;
  setProjectName: (n: string) => void;
  buildTool: BuildTool;
  setBuildTool: (t: BuildTool) => void;
  onOpenSettings: () => void;
  onCreateProject: () => void;
  onOpenProject: () => void;
  onImportProject: () => void;
  onOpenProjectInNewWindow?: () => void;
  onAddServiceProject?: () => void;
  onSaveProject: () => void;
  onExportProject: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  onLogout?: () => void;
}

export default function Topbar({
  canSaveProject,
  hasUnsavedChanges, importingProject,
  autosaveState = "idle",
  autosaveDetails,
  autosaveDetailsActive = false,
  onToggleAutosaveDetails,
  onRetryAutosave,
  onRestoreAutosave,
  javaVersion, setJavaVersion,
  springBootVersion, setSpringBootVersion,
  workspaceName, setWorkspaceName,
  projectName, setProjectName,
  buildTool, setBuildTool,
  onOpenSettings,
  onCreateProject, onOpenProject, onImportProject, onOpenProjectInNewWindow, onAddServiceProject,
  onSaveProject, onExportProject,
  onUndo, onRedo, canUndo = false, canRedo = false,
  onLogout,
}: TopbarProps) {
  type Step = "idle" | "unsaved" | "newProject" | "editProject";
  const [step, setStep] = useState<Step>("idle");

  const handleNewClick = () => {
    if (hasUnsavedChanges) setStep("unsaved"); else setStep("newProject");
  };

  const handleNewProjectConfirm = (cfg: JavaProjectConfig) => {
    onCreateProject?.();
    setJavaVersion(cfg.javaVersion);
    setSpringBootVersion(cfg.springBootVersion);
    setBuildTool(cfg.buildTool);
    setProjectName(cfg.projectName);
    setWorkspaceName("My Workspace");
    setStep("idle");
  };

  const handleEditProjectConfirm = (cfg: JavaProjectConfig) => {
    setJavaVersion(cfg.javaVersion);
    setSpringBootVersion(cfg.springBootVersion);
    setBuildTool(cfg.buildTool);
    setProjectName(cfg.projectName);
    setStep("idle");
  };

  // File dropdown items
  const fileItems: DropdownItem[] = [
    { kind: "section", label: "Project" },
    { kind: "action", label: "New Project", hint: "Start a fresh project", onClick: handleNewClick },
    { kind: "divider" },
    { kind: "section", label: "Open" },
    { kind: "action", label: "Open Project",      hint: "Load a saved .archbuilder.json file",      onClick: onOpenProject },
    ...(onOpenProjectInNewWindow
      ? [{ kind: "action" as const, label: "Open in New Window", hint: "Launch this project in a separate app window", onClick: onOpenProjectInNewWindow }]
      : []),
    { kind: "action", label: "Import Folder",     hint: importingProject ? "Importing…" : "Scan an existing code directory", onClick: onImportProject, disabled: importingProject },
    ...(onAddServiceProject
      ? [{ kind: "action" as const, label: "Add Service Folder", hint: "Scan code and add as a new canvas service", onClick: () => onAddServiceProject(), disabled: !!importingProject }]
      : []),
    { kind: "divider" },
    { kind: "section", label: "Save" },
    { kind: "action", label: "Save Project",          hint: "Save to .archbuilder.json",                   onClick: onSaveProject,  disabled: !canSaveProject },
    { kind: "action", label: "Export as IDE Project", hint: "Download ZIP with code, Docker, Terraform",   onClick: onExportProject, disabled: !canSaveProject },
  ];

  return (
    <>
      <div className="topbar">

        {/* ── LEFT: logo + File menu ─────────────────────────────── */}
        <div className="topbar-left">
          <div className="logo" title="Archiviz Quantum OS">⚡ ARCH</div>
          <div className="topbar-telemetry-chip">
            <span className="telemetry-dot" />
            <span>SYS: OK</span>
          </div>
          <DropdownMenu label="File" items={fileItems} />
        </div>

        {/* ── CENTER: workspace identity ───────────────────────────── */}
        <div className="topbar-center">
          <div className="topbar-workspace-name">
            <input
              className="topbar-workspace-input"
              value={workspaceName}
              onChange={(e) => setWorkspaceName(e.target.value)}
              placeholder="Workspace name"
              title="Edit workspace name"
            />
          </div>
        </div>

          {/* ── RIGHT: autosave chip + settings + logout ─────────────────────── */}
          <div className="topbar-right">
            <button className="btn topbar-history-btn" onClick={onUndo} disabled={!canUndo} title="Undo (Ctrl/Cmd+Z)" aria-label="Undo last workspace change">↶</button>
            <button className="btn topbar-history-btn" onClick={onRedo} disabled={!canRedo} title="Redo (Ctrl/Cmd+Shift+Z)" aria-label="Redo last workspace change">↷</button>
            {autosaveState !== "idle" && onToggleAutosaveDetails && autosaveDetails && (
              <AutosaveChip
                state={autosaveState}
                details={autosaveDetails}
                active={autosaveDetailsActive}
                onToggle={onToggleAutosaveDetails}
                onRetry={onRetryAutosave ?? (() => {})}
                onRestore={onRestoreAutosave ?? (() => {})}
              />
            )}
            <button className="btn topbar-icon-btn" onClick={onOpenSettings} title="Settings" aria-label="Settings">
            ⚙
          </button>

          {onLogout && <button className="btn topbar-logout-btn" onClick={onLogout} aria-label="Log out of Archiviz">Log out</button>}
        </div>
      </div>

      {step === "unsaved" && (
        <UnsavedChangesModal
          projectName={projectName}
          onSaveAndContinue={() => { onSaveProject?.(); setStep("newProject"); }}
          onDiscardAndContinue={() => setStep("newProject")}
          onCancel={() => setStep("idle")}
        />
      )}
      {step === "newProject" && (
        <ProjectConfigModal
          initial={{ projectName: "", javaVersion, springBootVersion, buildTool }}
          onConfirm={handleNewProjectConfirm}
          onClose={() => setStep("idle")}
        />
      )}
      {step === "editProject" && (
        <ProjectConfigModal
          title="Edit Project Settings"
          confirmLabel="Save Settings →"
          initial={{ projectName, javaVersion, springBootVersion, buildTool }}
          onConfirm={handleEditProjectConfirm}
          onClose={() => setStep("idle")}
        />
      )}
    </>
  );
}
