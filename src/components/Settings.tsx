import { useState, useEffect } from "react";
import type { AIProvider, AISettings } from "../services/AIService";
import {
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_DOCKER_SETTINGS,
  DEFAULT_GIT_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
} from "./defaultSettings";

export type { AIProvider, AISettings };
export type AppTheme = "black" | "red" | "purple" | "green" | "blue" | "glass";
export {
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_DOCKER_SETTINGS,
  DEFAULT_GIT_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
};
export type EditorSettings = {
  theme: "dark" | "light";
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  tabSize: number;
  wordWrap: "on" | "off";
  minimap: boolean;
  lineNumbers: "on" | "off" | "relative";
  renderWhitespace: "none" | "selection" | "all";
  formatOnPaste: boolean;
  formatOnType: boolean;
  smoothScrolling: boolean;
  cursorStyle: "line" | "block" | "underline";
};
export type DockerSettings = {
  enabled: boolean;
  composeEnabled: boolean;
  includePostgres: boolean;
  includeRedis: boolean;
  imageName: string;
  imageTag: string;
  appPort: number;
  containerPort: number;
  postgresPort: number;
  redisPort: number;
  maxRamPercentage: number;
  healthcheckEnabled: boolean;
};
export type GitHubUser = {
  login: string;
  avatar_url?: string;
  html_url?: string;
};
export type GitSettings = {
  githubToken: string;
  githubUser: GitHubUser | null;
};
export type TerminalSettings = {
  shell: string;
  fontSize: number;
  fontFamily: string;
  cursorStyle: "bar" | "block" | "underline";
  cursorBlink: boolean;
};
type SettingsSection = "appearance" | "editor" | "terminal" | "docker" | "git" | "ai";

const OPENAI_MODELS = [
  { id: "gpt-4o",          hint: "Best quality" },
  { id: "gpt-4o-mini",     hint: "Fast & cheap" },
  { id: "gpt-4-turbo",     hint: "128k context" },
  { id: "gpt-4",           hint: "Classic" },
  { id: "gpt-3.5-turbo",   hint: "Fastest" },
  { id: "o1",              hint: "Reasoning" },
  { id: "o1-mini",         hint: "Fast reasoning" },
  { id: "o3-mini",         hint: "Latest reasoning" },
];

const ANTHROPIC_MODELS = [
  { id: "claude-opus-4-7",            hint: "Most capable" },
  { id: "claude-sonnet-4-6",          hint: "Best balance" },
  { id: "claude-haiku-4-5-20251001",  hint: "Fastest" },
  { id: "claude-3-5-sonnet-20241022", hint: "Prev Sonnet" },
  { id: "claude-3-5-haiku-20241022",  hint: "Prev Haiku" },
  { id: "claude-3-opus-20240229",     hint: "Prev Opus" },
];

const PROVIDERS: { id: AIProvider; label: string; icon: string }[] = [
  { id: "openai",       label: "OpenAI",      icon: "🤖" },
  { id: "anthropic",    label: "Claude",      icon: "🧠" },
  { id: "local",        label: "Local",       icon: "🖥️" },
];

const THEME_OPTIONS: { id: AppTheme; label: string; swatch: string; hint: string }[] = [
  { id: "black", label: "Black", swatch: "#2dd4bf", hint: "Neutral dark" },
  { id: "red", label: "Red", swatch: "#fb7185", hint: "High contrast" },
  { id: "purple", label: "Purple", swatch: "#a78bfa", hint: "Creative" },
  { id: "green", label: "Green", swatch: "#34d399", hint: "Spring" },
  { id: "blue", label: "Blue", swatch: "#38bdf8", hint: "Classic" },
  { id: "glass", label: "Glass", swatch: "#007AFF", hint: "Apple frosted" },
];

const SETTINGS_NAV: { id: SettingsSection; label: string; hint: string }[] = [
  { id: "appearance", label: "Appearance", hint: "Theme and color" },
  { id: "editor", label: "Editor", hint: "Font and behavior" },
  { id: "terminal", label: "Terminal", hint: "Shell and appearance" },
  { id: "docker", label: "Docker", hint: "Image and compose" },
  { id: "git", label: "Git", hint: "GitHub account" },
  { id: "ai", label: "AI", hint: "Provider and model" },
];

const GITHUB_TOKEN_URL = "https://github.com/settings/tokens/new?scopes=repo&description=Archiviz%20IDE";

const defaultSettings: AISettings = {
  provider: "openai",
  apiKey: "",
  baseUrl: "http://localhost:1234",
  model: "",
};

const label: React.CSSProperties = {
  display: "block", fontSize: 10, fontWeight: 700,
  letterSpacing: "0.8px", textTransform: "uppercase",
  color: "var(--muted)", marginBottom: 6, marginTop: 14,
};

const ghostBtn: React.CSSProperties = {
  background: "none", border: "1px solid var(--border)", borderRadius: 8,
  color: "var(--muted)", fontSize: 11, padding: "5px 12px",
  cursor: "pointer", display: "inline-block",
};

function ModelChips({
  models, selected, onSelect,
}: { models: { id: string; hint?: string }[]; selected: string; onSelect: (id: string) => void }) {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 6 }}>
      {models.map(({ id, hint }) => {
        const active = selected === id;
        return (
          <button key={id} onClick={() => onSelect(id)} style={{
            padding: "5px 11px", borderRadius: 20, fontSize: 11, fontWeight: 600,
            border: `1px solid ${active ? "var(--accent)" : "var(--border)"}`,
            background: active ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "var(--panel2)",
            color: active ? "var(--accent)" : "var(--muted)",
            cursor: "pointer", transition: "all 0.12s",
            display: "flex", alignItems: "center", gap: 5,
          }}>
            {id}
            {hint && <span style={{ fontSize: 9, opacity: 0.55, fontWeight: 400 }}>{hint}</span>}
          </button>
        );
      })}
    </div>
  );
}

const isWindows = () => navigator.platform.startsWith("Win");

const SHELL_PRESETS = () => isWindows()
  ? [
      { label: "Auto-detect",   value: "" },
      { label: "PowerShell",    value: "powershell.exe" },
      { label: "CMD",           value: "cmd.exe" },
      { label: "Git Bash",      value: "C:\\Program Files\\Git\\bin\\bash.exe" },
      { label: "WSL",           value: "wsl.exe" },
    ]
  : [
      { label: "Auto-detect",   value: "" },
      { label: "zsh",           value: "/bin/zsh" },
      { label: "bash",          value: "/bin/bash" },
      { label: "fish",          value: "/usr/local/bin/fish" },
      { label: "sh",            value: "/bin/sh" },
    ];

export default function Settings({
  onSave,
  theme,
  setTheme,
  colorScheme,
  setColorScheme,
  editorSettings,
  setEditorSettings,
  terminalSettings,
  setTerminalSettings,
  dockerSettings,
  setDockerSettings,
  gitSettings,
  setGitSettings,
  onClose,
}: {
  onSave: (s: AISettings) => void;
  theme: AppTheme;
  setTheme: (theme: AppTheme) => void;
  colorScheme: "dark" | "light";
  setColorScheme: (scheme: "dark" | "light") => void;
  editorSettings: EditorSettings;
  setEditorSettings: (settings: EditorSettings) => void;
  terminalSettings: TerminalSettings;
  setTerminalSettings: (settings: TerminalSettings) => void;
  dockerSettings: DockerSettings;
  setDockerSettings: (settings: DockerSettings) => void;
  gitSettings: GitSettings;
  setGitSettings: (settings: GitSettings) => void;
  onClose: () => void;
}) {
  const [cfg, setCfg] = useState<AISettings>(defaultSettings);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<{ id: string }[]>([]);
  const [activeSection, setActiveSection] = useState<SettingsSection>("appearance");
  const [gitToken, setGitToken] = useState(gitSettings.githubToken);
  const [gitTesting, setGitTesting] = useState(false);
  const [gitStatus, setGitStatus] = useState<{ kind: "idle" | "success" | "error"; message: string }>({ kind: "idle", message: "" });

  useEffect(() => {
    const saved = localStorage.getItem("ai_settings");
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object") {
          setCfg({
            ...defaultSettings,
            ...parsed,
            provider: parsed.provider === "spring-boot" ? "openai" : parsed.provider,
            baseUrl: parsed.provider === "spring-boot" ? defaultSettings.baseUrl : (parsed.baseUrl ?? defaultSettings.baseUrl),
            model: parsed.provider === "spring-boot" ? "" : (parsed.model ?? defaultSettings.model),
          });
        }
      } catch {
        console.warn("Invalid ai_settings in localStorage");
      }
    }
  }, []);

  const update = (patch: Partial<AISettings>) => {
    setCfg(s => ({ ...s, ...patch }));
    setTestResult(null);
    setError(null);
  };

  const handleProviderChange = (p: AIProvider) => {
    const baseUrl = p === "local" ? "http://localhost:1234"
      : "";
    setCfg(s => ({ ...s, provider: p, model: "", baseUrl: baseUrl || s.baseUrl }));
    setFetchedModels([]);
    setTestResult(null);
    setError(null);
  };

  /* ── Test connection ── */
  const testConnection = async () => {
    if (!cfg.model.trim()) { setError("Select or enter a model first."); return; }
    if ((cfg.provider === "openai" || cfg.provider === "anthropic") && !cfg.apiKey?.trim()) {
      setError("Enter your API key first."); return;
    }
    setTesting(true);
    setTestResult(null);
    setError(null);
    try {
      const { AIService } = await import("../services/AIService");
      const svc = new AIService(cfg);
      await svc.healthCheck();
      setTestResult("ok");
    } catch (err: any) {
      setTestResult("fail");
      const msg = typeof err === "string" ? err : (err?.message ?? "Connection failed.");
      setError(msg);
    } finally {
      setTesting(false);
    }
  };

  /* ── Fetch OpenAI models ── */
  const fetchOpenAIModels = async () => {
    if (!cfg.apiKey?.trim()) { setError("Enter your API key first."); return; }
    setFetchingModels(true);
    setError(null);
    try {
      const res = await fetch("https://api.openai.com/v1/models", {
        headers: { Authorization: `Bearer ${cfg.apiKey}` },
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) {
        const b = await res.json().catch(() => ({}));
        throw new Error(b?.error?.message || `HTTP ${res.status}`);
      }
      const data = await res.json();
      const chat = (data.data as any[])
        .map((m: any) => ({ id: m.id as string }))
        .filter(m => m.id.startsWith("gpt-") || m.id.startsWith("o1") || m.id.startsWith("o3") || m.id.startsWith("o4"))
        .sort((a, b) => a.id.localeCompare(b.id));
      setFetchedModels(chat);
    } catch (err: any) {
      setError(err?.name === "TimeoutError" ? "Request timed out." : (err.message ?? "Could not fetch models."));
    } finally {
      setFetchingModels(false);
    }
  };

  const save = () => {
    if (!cfg.model.trim()) { setError("Please select or enter a model."); return; }
    if ((cfg.provider === "openai" || cfg.provider === "anthropic") && !cfg.apiKey?.trim()) {
      setError("Please enter your API key."); return;
    }
    localStorage.setItem("ai_settings", JSON.stringify(cfg));
    onSave(cfg);
  };

  const updateEditorSettings = (patch: Partial<EditorSettings>) => {
    setEditorSettings({ ...editorSettings, ...patch });
  };

  const updateDockerSettings = (patch: Partial<DockerSettings>) => {
    setDockerSettings({ ...dockerSettings, ...patch });
  };

  const updateTerminalSettings = (patch: Partial<TerminalSettings>) => {
    setTerminalSettings({ ...terminalSettings, ...patch });
  };

  const loginToGitHub = async () => {
    const token = gitToken.trim();
    if (!token) {
      setGitStatus({ kind: "error", message: "Enter a GitHub token first." });
      return;
    }

    setGitTesting(true);
    setGitStatus({ kind: "idle", message: "" });
    try {
      const res = await fetch("https://api.github.com/user", {
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "X-GitHub-Api-Version": "2022-11-28",
        },
      });
      if (!res.ok) {
        throw new Error(res.status === 401 ? "GitHub rejected this token." : `GitHub login failed (${res.status}).`);
      }
      const user = await res.json() as GitHubUser;
      setGitSettings({ githubToken: token, githubUser: user });
      setGitStatus({ kind: "success", message: `Logged in as ${user.login}.` });
    } catch (err: any) {
      setGitSettings(DEFAULT_GIT_SETTINGS);
      setGitStatus({ kind: "error", message: err?.message ?? "Could not log in to GitHub." });
    } finally {
      setGitTesting(false);
    }
  };

  const logoutFromGitHub = () => {
    setGitToken("");
    setGitSettings(DEFAULT_GIT_SETTINGS);
    setGitStatus({ kind: "idle", message: "" });
  };

  const openGitHubTokenGenerator = async () => {
    setGitStatus({ kind: "idle", message: "" });
    window.location.assign(GITHUB_TOKEN_URL);
  };

  const openAIModels = fetchedModels.length > 0 ? fetchedModels : OPENAI_MODELS;
  const activeNav = SETTINGS_NAV.find(item => item.id === activeSection) ?? SETTINGS_NAV[0];

  return (
    <div className="settings-page settings-page--wide settings-page--split">
      <aside className="settings-sidebar" aria-label="Settings sections">
        <div className="settings-sidebar-title">
          <h2>Settings</h2>
          <p>Workspace configuration</p>
        </div>
        <div className="settings-sidebar-nav">
          {SETTINGS_NAV.map(item => (
            <button
              key={item.id}
              className={`settings-sidebar-item ${activeSection === item.id ? "active" : ""}`}
              onClick={() => setActiveSection(item.id)}
            >
              <span>{item.label}</span>
              <small>{item.hint}</small>
            </button>
          ))}
        </div>
      </aside>

      <main className="settings-config">
        <div className="settings-config-header">
          <div>
            <h3>{activeNav.label}</h3>
            <p>{activeNav.hint}</p>
          </div>
          <button className="settings-close" onClick={onClose} aria-label="Close settings">x</button>
        </div>

        {activeSection === "appearance" && (
          <section className="settings-section">
            <div className="settings-section-heading">
              <span>Color Mode</span>
              <small>Switch between dark and light workspace</small>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
              {(["dark", "light"] as const).map(scheme => (
                <button
                  key={scheme}
                  onClick={() => setColorScheme(scheme)}
                  style={{
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "14px 16px", borderRadius: 10, cursor: "pointer",
                    border: `1px solid ${colorScheme === scheme ? "var(--accent)" : "var(--border)"}`,
                    background: colorScheme === scheme
                      ? "color-mix(in srgb, var(--accent) 10%, transparent)"
                      : "var(--panel2)",
                    boxShadow: colorScheme === scheme ? "0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent)" : "none",
                    transition: "all 0.15s",
                  }}
                >
                  <span style={{ fontSize: 22 }}>{scheme === "dark" ? "🌙" : "☀️"}</span>
                  <span style={{ display: "flex", flexDirection: "column", gap: 2, textAlign: "left" }}>
                    <span style={{ fontSize: 12, fontWeight: 700, color: colorScheme === scheme ? "var(--accent)" : "var(--text)" }}>
                      {scheme === "dark" ? "Dark" : "Light"}
                    </span>
                    <small style={{ fontSize: 10, color: "var(--muted)" }}>
                      {scheme === "dark" ? "Dark workspace" : "Light workspace"}
                    </small>
                  </span>
                </button>
              ))}
            </div>

            <div className="settings-section-heading">
              <span>Accent Color</span>
              <small>Choose a workspace accent</small>
            </div>
            <div className="settings-theme-grid">
              {THEME_OPTIONS.map(option => (
                <button
                  key={option.id}
                  className={`settings-theme-card ${theme === option.id ? "active" : ""}`}
                  onClick={() => setTheme(option.id)}
                >
                  <span className="settings-theme-swatch" style={{ background: option.swatch }} />
                  <span className="settings-theme-copy">
                    <span>{option.label}</span>
                    <small>{option.hint}</small>
                  </span>
                </button>
              ))}
            </div>
          </section>
        )}

        {activeSection === "editor" && (
          <section className="settings-section">
            <div className="settings-section-heading">
              <span>Editor Configuration</span>
              <small>Font, layout, and typing behavior</small>
            </div>

            <div className="settings-form-grid">
              <label className="settings-field">
                <span>Theme</span>
                <select
                  className="input"
                  value={editorSettings.theme}
                  onChange={e => updateEditorSettings({ theme: e.target.value as EditorSettings["theme"] })}
                >
                  <option value="dark">Dark</option>
                  <option value="light">Light</option>
                </select>
              </label>

              <label className="settings-field settings-field--wide">
                <span>Font Family</span>
                <input
                  className="input"
                  value={editorSettings.fontFamily}
                  onChange={e => updateEditorSettings({ fontFamily: e.target.value })}
                  placeholder="JetBrains Mono, Menlo, Monaco, Consolas, monospace"
                />
              </label>

              <label className="settings-field">
                <span>Font Size</span>
                <input
                  className="input"
                  type="number"
                  min={10}
                  max={28}
                  value={editorSettings.fontSize}
                  onChange={e => updateEditorSettings({ fontSize: Number(e.target.value) || DEFAULT_EDITOR_SETTINGS.fontSize })}
                />
              </label>

              <label className="settings-field">
                <span>Line Height</span>
                <input
                  className="input"
                  type="number"
                  min={14}
                  max={44}
                  value={editorSettings.lineHeight}
                  onChange={e => updateEditorSettings({ lineHeight: Number(e.target.value) || DEFAULT_EDITOR_SETTINGS.lineHeight })}
                />
              </label>

              <label className="settings-field">
                <span>Tab Size</span>
                <input
                  className="input"
                  type="number"
                  min={2}
                  max={8}
                  value={editorSettings.tabSize}
                  onChange={e => updateEditorSettings({ tabSize: Number(e.target.value) || DEFAULT_EDITOR_SETTINGS.tabSize })}
                />
              </label>

              <label className="settings-field">
                <span>Word Wrap</span>
                <select
                  className="input"
                  value={editorSettings.wordWrap}
                  onChange={e => updateEditorSettings({ wordWrap: e.target.value as EditorSettings["wordWrap"] })}
                >
                  <option value="off">Off</option>
                  <option value="on">On</option>
                </select>
              </label>

              <label className="settings-field">
                <span>Line Numbers</span>
                <select
                  className="input"
                  value={editorSettings.lineNumbers}
                  onChange={e => updateEditorSettings({ lineNumbers: e.target.value as EditorSettings["lineNumbers"] })}
                >
                  <option value="on">On</option>
                  <option value="relative">Relative</option>
                  <option value="off">Off</option>
                </select>
              </label>

              <label className="settings-field">
                <span>Whitespace</span>
                <select
                  className="input"
                  value={editorSettings.renderWhitespace}
                  onChange={e => updateEditorSettings({ renderWhitespace: e.target.value as EditorSettings["renderWhitespace"] })}
                >
                  <option value="selection">Selection</option>
                  <option value="all">All</option>
                  <option value="none">None</option>
                </select>
              </label>

              <label className="settings-field">
                <span>Cursor</span>
                <select
                  className="input"
                  value={editorSettings.cursorStyle}
                  onChange={e => updateEditorSettings({ cursorStyle: e.target.value as EditorSettings["cursorStyle"] })}
                >
                  <option value="line">Line</option>
                  <option value="block">Block</option>
                  <option value="underline">Underline</option>
                </select>
              </label>
            </div>

            <div className="settings-toggle-list">
              <label className="settings-toggle-row">
                <span>
                  <strong>Minimap</strong>
                  <small>Show code overview on the right side.</small>
                </span>
                <input
                  type="checkbox"
                  checked={editorSettings.minimap}
                  onChange={e => updateEditorSettings({ minimap: e.target.checked })}
                />
              </label>

              <label className="settings-toggle-row">
                <span>
                  <strong>Format on Paste</strong>
                  <small>Clean up pasted snippets when Monaco can format them.</small>
                </span>
                <input
                  type="checkbox"
                  checked={editorSettings.formatOnPaste}
                  onChange={e => updateEditorSettings({ formatOnPaste: e.target.checked })}
                />
              </label>

              <label className="settings-toggle-row">
                <span>
                  <strong>Format on Type</strong>
                  <small>Apply language formatting while typing.</small>
                </span>
                <input
                  type="checkbox"
                  checked={editorSettings.formatOnType}
                  onChange={e => updateEditorSettings({ formatOnType: e.target.checked })}
                />
              </label>

              <label className="settings-toggle-row">
                <span>
                  <strong>Smooth Scrolling</strong>
                  <small>Use animated scrolling inside the editor.</small>
                </span>
                <input
                  type="checkbox"
                  checked={editorSettings.smoothScrolling}
                  onChange={e => updateEditorSettings({ smoothScrolling: e.target.checked })}
                />
              </label>
            </div>

            <button className="btn" onClick={() => setEditorSettings(DEFAULT_EDITOR_SETTINGS)}>
              Reset Editor Defaults
            </button>
          </section>
        )}

        {activeSection === "terminal" && (
          <section className="settings-section">
            <div className="settings-section-heading">
              <span>Terminal Configuration</span>
              <small>Shell, font, and cursor behavior</small>
            </div>

            <div className="settings-section-heading" style={{ marginTop: 8 }}>
              <span>Shell</span>
              <small>Which shell to launch in new terminal tabs</small>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 10 }}>
              {SHELL_PRESETS().map(({ label: lbl, value }) => {
                const isActive = terminalSettings.shell === value;
                return (
                  <button
                    key={value || "__auto__"}
                    onClick={() => updateTerminalSettings({ shell: value })}
                    style={{
                      padding: "5px 12px", borderRadius: 20, fontSize: 11, fontWeight: 600,
                      border: `1px solid ${isActive ? "var(--accent)" : "var(--border)"}`,
                      background: isActive ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "var(--panel2)",
                      color: isActive ? "var(--accent)" : "var(--muted)",
                      cursor: "pointer", transition: "all 0.12s",
                    }}
                  >
                    {lbl}
                  </button>
                );
              })}
            </div>

            <label className="settings-field settings-field--wide" style={{ marginBottom: 18 }}>
              <span>Custom shell path</span>
              <input
                className="input"
                value={terminalSettings.shell}
                onChange={e => updateTerminalSettings({ shell: e.target.value })}
                placeholder="Leave empty for auto-detect, or enter a full path"
              />
            </label>

            <div className="settings-form-grid">
              <label className="settings-field">
                <span>Font Size</span>
                <input
                  className="input"
                  type="number"
                  min={8}
                  max={28}
                  value={terminalSettings.fontSize}
                  onChange={e => updateTerminalSettings({ fontSize: Number(e.target.value) || DEFAULT_TERMINAL_SETTINGS.fontSize })}
                />
              </label>

              <label className="settings-field">
                <span>Cursor Style</span>
                <select
                  className="input"
                  value={terminalSettings.cursorStyle}
                  onChange={e => updateTerminalSettings({ cursorStyle: e.target.value as TerminalSettings["cursorStyle"] })}
                >
                  <option value="bar">Bar</option>
                  <option value="block">Block</option>
                  <option value="underline">Underline</option>
                </select>
              </label>
            </div>

            <label className="settings-field settings-field--wide">
              <span>Font Family</span>
              <input
                className="input"
                value={terminalSettings.fontFamily}
                onChange={e => updateTerminalSettings({ fontFamily: e.target.value })}
                placeholder={DEFAULT_TERMINAL_SETTINGS.fontFamily}
              />
            </label>

            <div className="settings-toggle-list" style={{ marginTop: 12 }}>
              <label className="settings-toggle-row">
                <span>
                  <strong>Cursor Blink</strong>
                  <small>Animate the terminal cursor.</small>
                </span>
                <input
                  type="checkbox"
                  checked={terminalSettings.cursorBlink}
                  onChange={e => updateTerminalSettings({ cursorBlink: e.target.checked })}
                />
              </label>
            </div>

            <button className="btn" style={{ marginTop: 16 }} onClick={() => setTerminalSettings(DEFAULT_TERMINAL_SETTINGS)}>
              Reset Terminal Defaults
            </button>
          </section>
        )}

        {activeSection === "docker" && (
          <section className="settings-section">
            <div className="settings-section-heading">
              <span>Docker Configuration</span>
              <small>Generated Dockerfile and Compose settings</small>
            </div>

            <div className="settings-toggle-list">
              <label className="settings-toggle-row">
                <span>
                  <strong>Generate Docker Files</strong>
                  <small>Add Dockerfile and container runtime configuration to exported projects.</small>
                </span>
                <input
                  type="checkbox"
                  checked={dockerSettings.enabled}
                  onChange={e => updateDockerSettings({ enabled: e.target.checked })}
                />
              </label>

              <label className="settings-toggle-row">
                <span>
                  <strong>Generate Docker Compose</strong>
                  <small>Create docker-compose.yml for local app, database, and cache services.</small>
                </span>
                <input
                  type="checkbox"
                  checked={dockerSettings.composeEnabled}
                  disabled={!dockerSettings.enabled}
                  onChange={e => updateDockerSettings({ composeEnabled: e.target.checked })}
                />
              </label>

              <label className="settings-toggle-row">
                <span>
                  <strong>PostgreSQL Service</strong>
                  <small>Include a postgres container in Docker Compose.</small>
                </span>
                <input
                  type="checkbox"
                  checked={dockerSettings.includePostgres}
                  disabled={!dockerSettings.enabled || !dockerSettings.composeEnabled}
                  onChange={e => updateDockerSettings({ includePostgres: e.target.checked })}
                />
              </label>

              <label className="settings-toggle-row">
                <span>
                  <strong>Redis Service</strong>
                  <small>Include a redis container in Docker Compose.</small>
                </span>
                <input
                  type="checkbox"
                  checked={dockerSettings.includeRedis}
                  disabled={!dockerSettings.enabled || !dockerSettings.composeEnabled}
                  onChange={e => updateDockerSettings({ includeRedis: e.target.checked })}
                />
              </label>

              <label className="settings-toggle-row">
                <span>
                  <strong>Healthcheck</strong>
                  <small>Add a container healthcheck against the Spring actuator endpoint.</small>
                </span>
                <input
                  type="checkbox"
                  checked={dockerSettings.healthcheckEnabled}
                  disabled={!dockerSettings.enabled}
                  onChange={e => updateDockerSettings({ healthcheckEnabled: e.target.checked })}
                />
              </label>
            </div>

            <div className="settings-form-grid">
              <label className="settings-field">
                <span>Image Name</span>
                <input
                  className="input"
                  value={dockerSettings.imageName}
                  onChange={e => updateDockerSettings({ imageName: e.target.value })}
                  placeholder="Use project name"
                  disabled={!dockerSettings.enabled}
                />
              </label>

              <label className="settings-field">
                <span>Image Tag</span>
                <input
                  className="input"
                  value={dockerSettings.imageTag}
                  onChange={e => updateDockerSettings({ imageTag: e.target.value })}
                  placeholder="latest"
                  disabled={!dockerSettings.enabled}
                />
              </label>

              <label className="settings-field">
                <span>Host Port</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={65535}
                  value={dockerSettings.appPort}
                  onChange={e => updateDockerSettings({ appPort: Number(e.target.value) || DEFAULT_DOCKER_SETTINGS.appPort })}
                  disabled={!dockerSettings.enabled}
                />
              </label>

              <label className="settings-field">
                <span>Container Port</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={65535}
                  value={dockerSettings.containerPort}
                  onChange={e => updateDockerSettings({ containerPort: Number(e.target.value) || DEFAULT_DOCKER_SETTINGS.containerPort })}
                  disabled={!dockerSettings.enabled}
                />
              </label>

              <label className="settings-field">
                <span>Postgres Port</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={65535}
                  value={dockerSettings.postgresPort}
                  onChange={e => updateDockerSettings({ postgresPort: Number(e.target.value) || DEFAULT_DOCKER_SETTINGS.postgresPort })}
                  disabled={!dockerSettings.enabled || !dockerSettings.composeEnabled || !dockerSettings.includePostgres}
                />
              </label>

              <label className="settings-field">
                <span>Redis Port</span>
                <input
                  className="input"
                  type="number"
                  min={1}
                  max={65535}
                  value={dockerSettings.redisPort}
                  onChange={e => updateDockerSettings({ redisPort: Number(e.target.value) || DEFAULT_DOCKER_SETTINGS.redisPort })}
                  disabled={!dockerSettings.enabled || !dockerSettings.composeEnabled || !dockerSettings.includeRedis}
                />
              </label>

              <label className="settings-field">
                <span>JVM Max RAM %</span>
                <input
                  className="input"
                  type="number"
                  min={25}
                  max={95}
                  value={dockerSettings.maxRamPercentage}
                  onChange={e => updateDockerSettings({ maxRamPercentage: Number(e.target.value) || DEFAULT_DOCKER_SETTINGS.maxRamPercentage })}
                  disabled={!dockerSettings.enabled}
                />
              </label>
            </div>

            <button className="btn" onClick={() => setDockerSettings(DEFAULT_DOCKER_SETTINGS)}>
              Reset Docker Defaults
            </button>
          </section>
        )}

        {activeSection === "git" && (
          <section className="settings-section">
            <div className="settings-section-heading">
              <span>GitHub Login</span>
              <small>Persisted for repo creation and Git operations</small>
            </div>

            {gitSettings.githubUser ? (
              <div className="github-account">
                {gitSettings.githubUser.avatar_url && <img className="github-avatar" src={gitSettings.githubUser.avatar_url} alt="" />}
                <div className="github-account-main">
                  <span className="github-account-name">{gitSettings.githubUser.login}</span>
                  {gitSettings.githubUser.html_url && (
                    <a className="github-link" href={gitSettings.githubUser.html_url} target="_blank" rel="noreferrer">
                      View profile
                    </a>
                  )}
                </div>
                <button className="btn" onClick={logoutFromGitHub}>Logout</button>
              </div>
            ) : (
              <div className="github-login-box">
                <label className="settings-field settings-field--wide">
                  <span>GitHub Token</span>
                  <input
                    className="input"
                    type="password"
                    value={gitToken}
                    onChange={e => {
                      setGitToken(e.target.value);
                      setGitStatus({ kind: "idle", message: "" });
                    }}
                    placeholder="Token with repo scope"
                  />
                </label>
                <button className="btn btn-primary workspace-wide-btn" onClick={loginToGitHub} disabled={gitTesting}>
                  {gitTesting ? "Checking..." : "Login with Token"}
                </button>

                <div className="github-token-actions">
                  <button
                    type="button"
                    className="btn workspace-wide-btn github-browser-login-btn"
                    onClick={() => void openGitHubTokenGenerator()}
                  >
                    Generate Token in Browser
                  </button>
                  <small style={{ display: "block", marginTop: 8, color: "var(--muted)", textAlign: "center" }}>
                    Opens GitHub to create a new personal access token
                  </small>
                </div>
              </div>
            )}

            <div className="settings-note">
              The token is saved locally on this machine so you do not need to log in every time you open a project.
              <br />
              <strong>Tip:</strong> Click "Generate Token in Browser" to create a token with the right permissions automatically.
            </div>

            {gitStatus.message && (
              <div className={`github-status github-status--${gitStatus.kind}`}>
                <span>{gitStatus.message}</span>
              </div>
            )}
          </section>
        )}

        {activeSection === "ai" && (
          <section className="settings-section">
            <div className="settings-section-heading">
              <span>AI Settings</span>
              <small>Provider and model</small>
            </div>

      {/* Provider */}
      <label style={label}>Provider</label>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 8 }}>
        {PROVIDERS.map(p => (
          <button key={p.id} onClick={() => handleProviderChange(p.id)} style={{
            padding: "10px 8px", borderRadius: 10, fontWeight: 700, fontSize: 12, cursor: "pointer",
            border: `1px solid ${cfg.provider === p.id ? "var(--accent)" : "var(--border)"}`,
            background: cfg.provider === p.id ? "color-mix(in srgb, var(--accent) 10%, transparent)" : "var(--panel2)",
            color: cfg.provider === p.id ? "var(--accent)" : "var(--muted)",
            transition: "all 0.15s",
          }}>
            {p.icon} {p.label}
          </button>
        ))}
      </div>

      {/* OpenAI */}
      {cfg.provider === "openai" && (
        <>
          <label style={label}>API Key</label>
          <div style={{ display: "flex", gap: 6 }}>
            <input className="input" type="password" value={cfg.apiKey}
              onChange={e => update({ apiKey: e.target.value })} placeholder="sk-..." style={{ flex: 1 }} />
            <button onClick={fetchOpenAIModels} disabled={fetchingModels} style={{
              ...ghostBtn, whiteSpace: "nowrap",
              opacity: fetchingModels ? 0.6 : 1, cursor: fetchingModels ? "not-allowed" : "pointer",
            }}>
              {fetchingModels ? "…" : "Fetch Models"}
            </button>
          </div>
          <label style={{ ...label, marginTop: 12 }}>Model</label>
          <ModelChips models={openAIModels} selected={cfg.model} onSelect={id => update({ model: id })} />
          <input className="input" value={cfg.model} onChange={e => update({ model: e.target.value })}
            placeholder="Or type a model ID…" style={{ fontSize: 12 }} />
          <small style={{ color: "var(--muted)", fontSize: 11, marginTop: 4, display: "block" }}>
            Selected: <code style={{ color: "var(--accent)" }}>{cfg.model || "—"}</code>
          </small>
        </>
      )}

      {/* Anthropic / Claude */}
      {cfg.provider === "anthropic" && (
        <>
          <label style={label}>API Key</label>
          <input className="input" type="password" value={cfg.apiKey}
            onChange={e => update({ apiKey: e.target.value })} placeholder="sk-ant-..." />
          <small style={{ color: "var(--muted)", fontSize: 11, marginTop: 4, display: "block" }}>
            Get your key at{" "}
            <a href="https://console.anthropic.com" target="_blank" rel="noopener noreferrer"
              style={{ color: "var(--accent)" }}>console.anthropic.com</a>
          </small>
          <label style={{ ...label, marginTop: 12 }}>Model</label>
          <ModelChips models={ANTHROPIC_MODELS} selected={cfg.model} onSelect={id => update({ model: id })} />
          <input className="input" value={cfg.model} onChange={e => update({ model: e.target.value })}
            placeholder="Or type a model ID…" style={{ fontSize: 12 }} />
          <small style={{ color: "var(--muted)", fontSize: 11, marginTop: 4, display: "block" }}>
            Selected: <code style={{ color: "var(--accent)" }}>{cfg.model || "—"}</code>
          </small>
        </>
      )}

      {/* Local */}
      {cfg.provider === "local" && (
        <>
          <label style={label}>Base URL</label>
          <input className="input" value={cfg.baseUrl}
            onChange={e => update({ baseUrl: e.target.value.replace(/\/$/, "") })}
            placeholder="http://localhost:1234" />
          <small style={{ color: "#f59e0b", fontSize: 11, lineHeight: 1.5, marginTop: 4, display: "block" }}>
            ⚠️ In LM Studio → Server tab, enable <strong>CORS</strong> and set allowed origin to <code>*</code>.
          </small>
          <label style={{ ...label, marginTop: 12 }}>Model name</label>
          <input className="input" value={cfg.model} onChange={e => update({ model: e.target.value })}
            placeholder="e.g. google/gemma-4-e4b" />
          <small style={{ color: "var(--muted)", fontSize: 11, marginTop: 4, display: "block" }}>
            Copy the model identifier exactly as shown in LM Studio's loaded model list.
          </small>
        </>
      )}

      {/* Test connection */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 16 }}>
        <button onClick={testConnection} disabled={testing} style={{
          ...ghostBtn,
          opacity: testing ? 0.6 : 1,
          cursor: testing ? "not-allowed" : "pointer",
          display: "flex", alignItems: "center", gap: 6,
        }}>
          {testing ? (
            <span style={{ display: "inline-block", width: 10, height: 10, borderRadius: "50%",
              border: "2px solid var(--muted)", borderTopColor: "var(--accent)",
              animation: "spin 0.7s linear infinite" }} />
          ) : (
            <span style={{ fontSize: 12 }}>🔌</span>
          )}
          {testing ? "Testing…" : "Test Connection"}
        </button>
        {testResult === "ok" && (
          <span style={{ fontSize: 12, color: "#22c55e", fontWeight: 600 }}>✓ Connected</span>
        )}
        {testResult === "fail" && (
          <span style={{ fontSize: 12, color: "#ef4444", fontWeight: 600 }}>✗ Failed</span>
        )}
      </div>

      {/* Error */}
      {error && (
        <div style={{ fontSize: 11, color: "#f87171", marginTop: 8, padding: "7px 11px",
          background: "rgba(239,68,68,0.08)", borderRadius: 6, border: "1px solid rgba(239,68,68,0.2)" }}>
          ⚠️ {error}
        </div>
      )}

      <button className="btn btn-primary" onClick={save}
        style={{ marginTop: 18, width: "100%", minHeight: 40 }}>
        Save AI Settings
      </button>
          </section>
        )}
      </main>
    </div>
  );
}
