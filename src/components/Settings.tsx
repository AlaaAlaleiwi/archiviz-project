import { useState, useEffect } from "react";
import type { AIProvider, AISettings } from "../services/AIService";

export type { AIProvider, AISettings };

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
  { id: "claude-opus-4-5",            hint: "Most capable" },
  { id: "claude-sonnet-4-5",          hint: "Best balance" },
  { id: "claude-haiku-4-5",           hint: "Fastest" },
  { id: "claude-3-5-sonnet-20241022", hint: "Prev Sonnet" },
  { id: "claude-3-5-haiku-20241022",  hint: "Prev Haiku" },
  { id: "claude-3-opus-20240229",     hint: "Prev Opus" },
];

const PROVIDERS: { id: AIProvider; label: string; icon: string }[] = [
  { id: "openai",    label: "OpenAI",   icon: "🤖" },
  { id: "anthropic", label: "Claude",   icon: "🧠" },
  { id: "local",     label: "Local",    icon: "🖥️" },
];

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

export default function Settings({ onSave }: { onSave: (s: AISettings) => void }) {
  const [cfg, setCfg] = useState<AISettings>(defaultSettings);
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<"ok" | "fail" | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);
  const [fetchedModels, setFetchedModels] = useState<{ id: string }[]>([]);

useEffect(() => {
  const saved = localStorage.getItem("ai_settings");
  if (saved) {
    try {
      const parsed = JSON.parse(saved);
      if (parsed && typeof parsed === "object") {
        setCfg({ ...defaultSettings, ...parsed }); // ✅ safe merge
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
    setCfg(s => ({ ...s, provider: p, model: "" }));
    setFetchedModels([]);
    setTestResult(null);
    setError(null);
  };

  /* ── Test connection ── */
  const testConnection = async () => {
    if (!cfg.model.trim()) { setError("Select or enter a model first."); return; }
    if ((cfg.provider === "openai" || cfg.provider === "anthropic") && !cfg.apiKey.trim()) {
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
      setError(err.message ?? "Connection failed.");
    } finally {
      setTesting(false);
    }
  };

  /* ── Fetch OpenAI models ── */
  const fetchOpenAIModels = async () => {
    if (!cfg.apiKey.trim()) { setError("Enter your API key first."); return; }
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
    if ((cfg.provider === "openai" || cfg.provider === "anthropic") && !cfg.apiKey.trim()) {
      setError("Please enter your API key."); return;
    }
    localStorage.setItem("ai_settings", JSON.stringify(cfg));
    onSave(cfg);
  };

  const openAIModels = fetchedModels.length > 0 ? fetchedModels : OPENAI_MODELS;

  return (
    <div className="settings-page" style={{ width: 460, maxHeight: "85vh", overflowY: "auto" }}>
      <h2 style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", marginBottom: 2 }}>AI Settings</h2>

      {/* Provider */}
      <label style={label}>Provider</label>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8 }}>
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
        Save Settings
      </button>
    </div>
  );
}