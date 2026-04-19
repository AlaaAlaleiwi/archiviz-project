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

function DropdownMenu({ label, items }: { label: string; items: DropdownItem[] }) {
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
      <button className="btn" onClick={() => setOpen(o => !o)}>
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
  confirmLabel = "Next →",
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
   WINDOW PICKER MODAL
───────────────────────────────────────── */
function WindowPickerModal({
  cfg,
  onSameWindow,
  onNewTab,
  onBack,
  onClose,
}: {
  cfg: NewProjectConfig;
  onSameWindow: () => void;
  onNewTab: () => void;
  onBack: () => void;
  onClose: () => void;
}) {
  return (
    <div className="modal" onClick={onClose}>
      <div className="np-modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 460 }}>

        <div className="np-header">
          <span className="np-title">Where to open "{cfg.projectName}"?</span>
          <button className="np-close" onClick={onClose}>✕</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, padding: "4px 0 8px" }}>
          {/* Same window */}
          <button
            onClick={onSameWindow}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: "22px 16px",
              background: "var(--panel2)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              cursor: "pointer",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
              (e.currentTarget as HTMLButtonElement).style.background = "color-mix(in srgb, var(--accent) 6%, var(--panel2))";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--panel2)";
            }}
          >
            <span style={{ fontSize: 32 }}>🖥️</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>Same Window</span>
            <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", lineHeight: 1.4 }}>
              Replace the current project in this window
            </span>
          </button>

          {/* New tab */}
          <button
            onClick={onNewTab}
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 10,
              padding: "22px 16px",
              background: "var(--panel2)",
              border: "1px solid var(--border)",
              borderRadius: 14,
              cursor: "pointer",
              transition: "border-color 0.15s, background 0.15s",
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--accent)";
              (e.currentTarget as HTMLButtonElement).style.background = "color-mix(in srgb, var(--accent) 6%, var(--panel2))";
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--border)";
              (e.currentTarget as HTMLButtonElement).style.background = "var(--panel2)";
            }}
          >
            <span style={{ fontSize: 32 }}>🗂️</span>
            <span style={{ fontSize: 13, fontWeight: 700, color: "var(--text)" }}>New Tab</span>
            <span style={{ fontSize: 11, color: "var(--muted)", textAlign: "center", lineHeight: 1.4 }}>
              Keep this project open and start fresh in a new browser tab
            </span>
          </button>
        </div>

        <div className="np-actions">
          <button className="btn" onClick={onBack}>← Back</button>
        </div>
      </div>
    </div>
  );
}

/* ─────────────────────────────────────────
   HELPERS — encode/decode new-project params
   in the URL so the new tab can auto-init
───────────────────────────────────────── */
export function encodeProjectParams(cfg: NewProjectConfig): string {
  const params = new URLSearchParams({
    newProject: "1",
    projectName: cfg.projectName,
    language:    cfg.language,
    framework:   cfg.framework,
    buildTool:   cfg.buildTool,
  });
  return params.toString();
}

export function readProjectParamsFromURL(): NewProjectConfig | null {
  const params = new URLSearchParams(window.location.search);
  if (params.get("newProject") !== "1") return null;
  return {
    projectName: params.get("projectName") || "new-project",
    language:    params.get("language")    || "javascript",
    framework:   params.get("framework")   || "Node.js",
    buildTool:   params.get("buildTool")   || "npm",
  };
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
  importingProject,
  onLogout,
  aiHealthy,
  aiError,
}: any) {
  type Step = "idle" | "unsaved" | "newProject" | "windowPicker" | "editProject";
  const [step, setStep] = useState<Step>("idle");
  const [pendingCfg, setPendingCfg] = useState<NewProjectConfig | null>(null);

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

  /* After the config form, always go to the window picker */
  const handleNewProjectCfgConfirm = (cfg: NewProjectConfig) => {
    setPendingCfg(cfg);
    setStep("windowPicker");
  };

  /* User chose "same window" — pass full config so App resets + applies in one shot */
  const handleSameWindow = () => {
    if (!pendingCfg) return;
    onCreateProject?.({
      projectName: pendingCfg.projectName,
      language:    pendingCfg.language,
      framework:   pendingCfg.framework,
      buildTool:   pendingCfg.buildTool,
    });
    setPendingCfg(null);
    setStep("idle");
  };

  /* User chose "new tab" — open a fresh tab with config encoded in the URL */
  const handleNewTab = () => {
    if (!pendingCfg) return;
    const qs = encodeProjectParams(pendingCfg);
    const url = `${window.location.origin}${window.location.pathname}?${qs}`;
    window.open(url, "_blank", "noopener");
    setPendingCfg(null);
    setStep("idle");
  };

  const handleEditProjectConfirm = (cfg: NewProjectConfig) => {
    setLanguage(cfg.language);
    setFramework(cfg.framework);
    setBuildTool(cfg.buildTool);
    setProjectName(cfg.projectName);
    setStep("idle");
  };

  const closeAll = () => { setPendingCfg(null); setStep("idle"); };

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

            <button className="btn" onClick={onSaveProject} disabled={!canSaveProject}>
              Save
            </button>
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

          <button
            className="btn"
            onClick={onOpenSettings}
            title={
              aiHealthy === true  ? "AI connected" :
              aiHealthy === false ? `AI error: ${aiError}` :
              "Settings"
            }
            style={{ position: "relative" }}
          >
            Settings
            {aiHealthy !== null && (
              <span
                style={{
                  position: "absolute",
                  top: 6,
                  right: 6,
                  width: 7,
                  height: 7,
                  borderRadius: "50%",
                  background: aiHealthy ? "#22c55e" : "#ef4444",
                  boxShadow: aiHealthy ? "0 0 5px #22c55e" : "0 0 5px #ef4444",
                  display: "block",
                }}
              />
            )}
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

      {/* ── MODALS ───────────────────────────────────────────────── */}

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
          onConfirm={handleNewProjectCfgConfirm}
          onClose={closeAll}
        />
      )}

      {step === "windowPicker" && pendingCfg && (
        <WindowPickerModal
          cfg={pendingCfg}
          onSameWindow={handleSameWindow}
          onNewTab={handleNewTab}
          onBack={() => setStep("newProject")}
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