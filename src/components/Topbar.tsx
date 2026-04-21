import "../styles.css";
import { useState, useRef, useEffect } from "react";
import type { JavaVersion, SpringBootVersion, BuildTool } from "../types";

const JAVA_VERSIONS: JavaVersion[]        = ["17", "21", "25"];
const SPRING_VERSIONS: SpringBootVersion[] = ["3.2", "3.3", "3.4"];
const BUILD_TOOLS: BuildTool[]             = ["maven", "gradle"];

type JavaProjectConfig = {
  projectName:       string;
  javaVersion:       JavaVersion;
  springBootVersion: SpringBootVersion;
  buildTool:         BuildTool;
};

/* ─────────────────────────────────────────
   DROPDOWN MENU
───────────────────────────────────────── */
type DropdownItem = {
  label: string;
  hint?: string;
  onClick: () => void;
  disabled?: boolean;
};

function DropdownMenu({ label, items, disabled = false }: { label: string; items: DropdownItem[]; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return (
    <div className="topbar-dropdown" ref={ref}>
      <button className="btn" onClick={() => !disabled && setOpen(o => !o)} disabled={disabled}>
        {label} <span className="dropdown-caret">▾</span>
      </button>
      {open && (
        <div className="dropdown-menu">
          {items.map(item => (
            <button
              key={item.label}
              className="dropdown-item"
              disabled={item.disabled}
              onClick={() => { item.onClick(); setOpen(false); }}
            >
              <span className="dropdown-item-label">{item.label}</span>
              {item.hint && <span className="dropdown-item-hint">{item.hint}</span>}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/* ─────────────────────────────────────────
   UNSAVED CHANGES MODAL
───────────────────────────────────────── */
function UnsavedChangesModal({
  projectName,
  onSaveAndContinue,
  onDiscardAndContinue,
  onCancel,
}: {
  projectName: string;
  onSaveAndContinue: () => void;
  onDiscardAndContinue: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="modal" onClick={onCancel}>
      <div className="np-modal unsaved-modal" onClick={e => e.stopPropagation()}>
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

/* ─────────────────────────────────────────
   PROJECT CONFIG MODAL (Java-only)
───────────────────────────────────────── */
function ProjectConfigModal({
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
  const update = (patch: Partial<JavaProjectConfig>) => setCfg(prev => ({ ...prev, ...patch }));

  const handleConfirm = () => {
    if (!cfg.projectName.trim()) { alert("Please enter a project name."); return; }
    onConfirm(cfg);
    onClose();
  };

  return (
    <div className="modal" onClick={onClose}>
      <div className="np-modal" onClick={e => e.stopPropagation()}>

        <div className="np-header">
          <span className="np-title">{title}</span>
          <button className="np-close" onClick={onClose}>✕</button>
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
              <button
                key={v}
                className={`np-chip ${cfg.javaVersion === v ? "active" : ""}`}
                onClick={() => update({ javaVersion: v })}
              >
                ☕ Java {v}
              </button>
            ))}
          </div>
        </div>

        <div className="np-field">
          <label className="np-label">Spring Boot Version</label>
          <div className="np-chip-row">
            {SPRING_VERSIONS.map(v => (
              <button
                key={v}
                className={`np-chip ${cfg.springBootVersion === v ? "active" : ""}`}
                onClick={() => update({ springBootVersion: v })}
              >
                Spring Boot {v}
              </button>
            ))}
          </div>
        </div>

        <div className="np-field">
          <label className="np-label">Build Tool</label>
          <div className="np-chip-row">
            {BUILD_TOOLS.map(t => (
              <button
                key={t}
                className={`np-chip ${cfg.buildTool === t ? "active" : ""}`}
                onClick={() => update({ buildTool: t })}
              >
                {t === "maven" ? "⚙ Maven" : "🐘 Gradle"}
              </button>
            ))}
          </div>
        </div>

        <div className="np-actions">
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={handleConfirm}>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   TOPBAR
───────────────────────────────────────── */
interface TopbarProps {
  generate: () => void;
  askAI: () => void;
  loading: boolean;
  canGenerate: boolean;
  canAskAI: boolean;
  canSaveProject: boolean;
  hasUnsavedChanges?: boolean;
  importingProject?: boolean;
  theme: "dark" | "light";
  setTheme: (t: "dark" | "light") => void;
  javaVersion: JavaVersion;
  setJavaVersion: (v: JavaVersion) => void;
  springBootVersion: SpringBootVersion;
  setSpringBootVersion: (v: SpringBootVersion) => void;
  projectName: string;
  setProjectName: (n: string) => void;
  buildTool: BuildTool;
  setBuildTool: (t: BuildTool) => void;
  onOpenSettings: () => void;
  onCancel: () => void;
  onCreateProject: () => void;
  onOpenProject: () => void;
  onImportProject: () => void;
  onSaveProject: () => void;
  onExportProject: () => void;
  onLogout?: () => void;
}

export default function Topbar({
  generate, askAI, loading,
  canGenerate, canAskAI, canSaveProject,
  hasUnsavedChanges, importingProject,
  theme, setTheme,
  javaVersion, setJavaVersion,
  springBootVersion, setSpringBootVersion,
  projectName, setProjectName,
  buildTool, setBuildTool,
  onOpenSettings, onCancel,
  onCreateProject, onOpenProject, onImportProject,
  onSaveProject, onExportProject,
  onLogout,
}: TopbarProps) {
  type Step = "idle" | "unsaved" | "newProject" | "editProject";
  const [step, setStep] = useState<Step>("idle");

  const handleNewClick = () => {
    if (hasUnsavedChanges) { setStep("unsaved"); } else { setStep("newProject"); }
  };

  const handleSaveAndContinue = () => {
    onSaveProject?.();
    setStep("newProject");
  };

  const handleNewProjectConfirm = (cfg: JavaProjectConfig) => {
    onCreateProject?.();
    setJavaVersion(cfg.javaVersion);
    setSpringBootVersion(cfg.springBootVersion);
    setBuildTool(cfg.buildTool);
    setProjectName(cfg.projectName);
    setStep("idle");
  };

  const handleEditProjectConfirm = (cfg: JavaProjectConfig) => {
    setJavaVersion(cfg.javaVersion);
    setSpringBootVersion(cfg.springBootVersion);
    setBuildTool(cfg.buildTool);
    setProjectName(cfg.projectName);
    setStep("idle");
  };

  return (
    <>
      <div className="topbar">

        {/* ── LEFT ─────────────────────────────────────────────────── */}
        <div className="topbar-left">
          <div className="logo">⚡ ARCH</div>

          <div className="topbar-file-actions">
            <button className="btn btn-primary" onClick={handleNewClick}>
              + New
            </button>

            <DropdownMenu
              label="Open"
              items={[
                { label: "Open Project",   hint: "Load a saved .archbuilder.json file",      onClick: onOpenProject },
                { label: "Import Folder",  hint: importingProject ? "Importing…" : "Scan an existing code directory", onClick: onImportProject, disabled: importingProject },
              ]}
            />

            <DropdownMenu
              label="Save"
              disabled={!canSaveProject}
              items={[
                { label: "Save Project",         hint: "Save to .archbuilder.json", onClick: onSaveProject,  disabled: !canSaveProject },
                { label: "Export as IDE Project", hint: "Download ZIP with code, Docker, Terraform", onClick: onExportProject, disabled: !canSaveProject },
              ]}
            />
          </div>
        </div>

        {/* ── CENTER: project identity ──────────────────────────────── */}
        <div className="topbar-center">
          <div className="topbar-project-name">
            {projectName
              ? <>
                  {projectName}
                  {hasUnsavedChanges && <span className="unsaved-dot" title="Unsaved changes">●</span>}
                </>
              : <span className="topbar-project-placeholder">Untitled Project</span>
            }
            <button className="topbar-edit-btn" onClick={() => setStep("editProject")} title="Edit project settings">
              ✎
            </button>
          </div>
          <div className="topbar-project-meta">
            <span className="topbar-lang-badge">☕</span>
            <span className="topbar-meta-sep">·</span>
            <span className="topbar-meta-text">Java {javaVersion}</span>
            <span className="topbar-meta-sep">·</span>
            <span className="topbar-meta-text">Spring Boot {springBootVersion}</span>
            <span className="topbar-meta-sep">·</span>
            <span className="topbar-meta-text">{buildTool}</span>
          </div>
        </div>

        {/* ── RIGHT ────────────────────────────────────────────────── */}
        <div className="topbar-right">
          <button className="btn" onClick={generate} disabled={!canGenerate}>
            Generate Prompt
          </button>

          {loading ? (
            <button className="btn btn-danger" onClick={onCancel}>Stop</button>
          ) : (
            <button className="btn btn-primary" onClick={askAI} disabled={!canAskAI}>Ask AI</button>
          )}

          <button className="btn" onClick={onOpenSettings} title="Settings">Settings</button>

          <button
            className="btn topbar-theme-toggle"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Toggle theme"
          >
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>

          {onLogout && <button className="btn" onClick={onLogout}>Logout</button>}
        </div>
      </div>

      {step === "unsaved" && (
        <UnsavedChangesModal
          projectName={projectName}
          onSaveAndContinue={handleSaveAndContinue}
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
