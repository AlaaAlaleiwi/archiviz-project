import "../styles.css";
import { useState, useRef, useEffect } from "react";

interface NewProjectConfig {
  projectName: string;
  language: string;
  framework: string;
  buildTool: string;
}

const frameworksByLanguage: Record<string, string[]> = {
  javascript: ["Node.js", "Express", "React", "Vue", "Angular", "Next.js"],
  typescript: ["Node.js", "NestJS", "React", "Vue", "Angular", "Next.js"],
  python:     ["FastAPI", "Django", "Flask"],
  java:       ["Spring Boot", "Quarkus"],
  cpp:        ["C++", "CMake"],
};

const buildToolsByLanguage: Record<string, string[]> = {
  javascript: ["npm", "pnpm", "yarn"],
  typescript: ["npm", "pnpm", "yarn"],
  python:     ["pip", "poetry", "uv"],
  java:       ["maven", "gradle"],
  cpp:        ["cmake", "make", "meson"],
};

const LANGUAGE_ICONS: Record<string, string> = {
  javascript: "JS",
  typescript: "TS",
  python:     "PY",
  java:       "☕",
  cpp:        "C++",
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
   UNSAVED CHANGES CONFIRMATION MODAL
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
            Would you like to save before creating a new project?
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
   NEW PROJECT MODAL
───────────────────────────────────────── */
function NewProjectModal({
  initial,
  title = "New Project",
  confirmLabel = "Create Project →",
  onConfirm,
  onClose,
}: {
  initial: NewProjectConfig;
  title?: string;
  confirmLabel?: string;
  onConfirm: (cfg: NewProjectConfig) => void;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<NewProjectConfig>(initial);

  const update = (patch: Partial<NewProjectConfig>) =>
    setCfg(prev => ({ ...prev, ...patch }));

  const handleLangChange = (lang: string) => {
    update({
      language:  lang,
      framework: frameworksByLanguage[lang]?.[0] || "",
      buildTool: buildToolsByLanguage[lang]?.[0] || "",
    });
  };

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
          <label className="np-label">Language</label>
          <div className="np-lang-grid">
            {Object.keys(frameworksByLanguage).map(lang => (
              <button
                key={lang}
                className={`np-lang-btn ${cfg.language === lang ? "active" : ""}`}
                onClick={() => handleLangChange(lang)}
              >
                <span className="np-lang-badge">{LANGUAGE_ICONS[lang]}</span>
                <span className="np-lang-name">
                  {lang.charAt(0).toUpperCase() + lang.slice(1)}
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="np-field">
          <label className="np-label">Framework</label>
          <div className="np-chip-row">
            {(frameworksByLanguage[cfg.language] || []).map(fw => (
              <button
                key={fw}
                className={`np-chip ${cfg.framework === fw ? "active" : ""}`}
                onClick={() => update({ framework: fw })}
              >
                {fw}
              </button>
            ))}
          </div>
        </div>

        <div className="np-field">
          <label className="np-label">Build Tool</label>
          <div className="np-chip-row">
            {(buildToolsByLanguage[cfg.language] || []).map(tool => (
              <button
                key={tool}
                className={`np-chip ${cfg.buildTool === tool ? "active" : ""}`}
                onClick={() => update({ buildTool: tool })}
              >
                {tool}
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
export default function Topbar({
  generate,
  askAI,
  loading,
  canGenerate,
  canAskAI,
  canSaveProject,
  hasUnsavedChanges,
  theme,
  setTheme,
  language,
  setLanguage,
  framework,
  setFramework,
  projectName,
  setProjectName,
  buildTool,
  setBuildTool,
  onOpenSettings,
  onCancel,
  onCreateProject,
  onOpenProject,
  onImportProject,
  onSaveProject,
  onExportProject,
  importingProject,
  onLogout,
}: any) {
  type Step = "idle" | "unsaved" | "newProject" | "editProject";
  const [step, setStep] = useState<Step>("idle");

  const handleNewClick = () => {
    if (hasUnsavedChanges) {
      setStep("unsaved");
    } else {
      setStep("newProject");
    }
  };

  const handleSaveAndContinue = async () => {
    await onSaveProject?.();
    setStep("newProject");
  };

  const handleDiscardAndContinue = () => setStep("newProject");

  const handleNewProjectConfirm = (cfg: NewProjectConfig) => {
    onCreateProject?.();
    setLanguage(cfg.language);
    setFramework(cfg.framework);
    setBuildTool(cfg.buildTool);
    setProjectName(cfg.projectName);
    setStep("idle");
  };

  const handleEditProjectConfirm = (cfg: NewProjectConfig) => {
    setLanguage(cfg.language);
    setFramework(cfg.framework);
    setBuildTool(cfg.buildTool);
    setProjectName(cfg.projectName);
    setStep("idle");
  };

  const closeAll = () => setStep("idle");

  const langBadge = LANGUAGE_ICONS[language] || language.toUpperCase();

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
                {
                  label: "Open Project",
                  hint: "Load a saved .archbuilder.json file",
                  onClick: onOpenProject,
                },
                {
                  label: "Import Folder",
                  hint: importingProject ? "Importing…" : "Scan an existing code directory",
                  onClick: onImportProject,
                  disabled: importingProject,
                },
              ]}
            />

            <DropdownMenu
              label="Save"
              disabled={!canSaveProject}
              items={[
                {
                  label: "Save Project",
                  hint: "Save to .archbuilder.json — reopen in Arch Builder",
                  onClick: onSaveProject,
                  disabled: !canSaveProject,
                },
                {
                  label: "Export as IDE Project",
                  hint: "Download a ready-to-open zip with code, config & scaffold files",
                  onClick: onExportProject,
                  disabled: !canSaveProject,
                },
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
                  {hasUnsavedChanges && (
                    <span className="unsaved-dot" title="Unsaved changes">●</span>
                  )}
                </>
              : <span className="topbar-project-placeholder">Untitled Project</span>
            }
            <button
              className="topbar-edit-btn"
              onClick={() => setStep("editProject")}
              title="Edit project settings"
            >
              ✎
            </button>
          </div>
          <div className="topbar-project-meta">
            <span className="topbar-lang-badge">{langBadge}</span>
            <span className="topbar-meta-sep">·</span>
            <span className="topbar-meta-text">{framework}</span>
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
            <button className="btn btn-danger" onClick={onCancel}>
              Stop
            </button>
          ) : (
            <button className="btn btn-primary" onClick={askAI} disabled={!canAskAI}>
              Ask AI
            </button>
          )}

          <button className="btn" onClick={onOpenSettings} title="Settings">
            Settings
          </button>

          <button
            className="btn topbar-theme-toggle"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            title="Toggle theme"
          >
            {theme === "dark" ? "Light Mode" : "Dark Mode"}
          </button>

          {onLogout && (
            <button className="btn" onClick={onLogout} title="Logout">Logout</button>
          )}
        </div>
      </div>

      {step === "unsaved" && (
        <UnsavedChangesModal
          projectName={projectName}
          onSaveAndContinue={handleSaveAndContinue}
          onDiscardAndContinue={handleDiscardAndContinue}
          onCancel={closeAll}
        />
      )}

      {step === "newProject" && (
        <NewProjectModal
          initial={{ projectName: "", language, framework, buildTool }}
          onConfirm={handleNewProjectConfirm}
          onClose={closeAll}
        />
      )}

      {step === "editProject" && (
        <NewProjectModal
          title="Edit Project Settings"
          confirmLabel="Save Settings →"
          initial={{ projectName, language, framework, buildTool }}
          onConfirm={handleEditProjectConfirm}
          onClose={closeAll}
        />
      )}
    </>
  );
}