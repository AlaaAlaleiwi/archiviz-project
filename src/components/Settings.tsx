import { useState, useEffect } from "react";

export type AIProvider = "openai" | "local";

export interface AISettings {
  provider: AIProvider;
  apiKey: string;
  baseUrl: string;
  model: string;
}

const defaultSettings: AISettings = {
  provider: "local",
  apiKey: "",
  baseUrl: "http://localhost:1234",
  model: ""
};

export default function Settings({
  onSave
}: {
  onSave: (settings: AISettings) => void;
}) {
  const [settings, setSettings] = useState<AISettings>(defaultSettings);

  useEffect(() => {
    const saved = localStorage.getItem("ai_settings");
    if (saved) {
      try { setSettings(JSON.parse(saved)); } catch {}
    }
  }, []);

  const update = (patch: Partial<AISettings>) =>
    setSettings((s) => ({ ...s, ...patch }));

  const save = () => {
    if (settings.provider === "local" && !settings.model.trim()) {
      alert("Please enter the exact model name from LM Studio's model list.");
      return;
    }
    localStorage.setItem("ai_settings", JSON.stringify(settings));
    onSave(settings);
  };

  return (
    <div className="settings-page">
      <h2>AI Settings</h2>

      {/* Provider */}
      <label>Provider</label>
      <select
        value={settings.provider}
        onChange={(e) => update({ provider: e.target.value as AIProvider })}
      >
        <option value="local">Local Model (LM Studio / Ollama)</option>
        <option value="openai">OpenAI</option>
      </select>

      {/* OpenAI API Key */}
      {settings.provider === "openai" && (
        <>
          <label>OpenAI API Key</label>
          <input
            type="password"
            value={settings.apiKey}
            onChange={(e) => update({ apiKey: e.target.value })}
            placeholder="sk-..."
          />
        </>
      )}

      {/* Base URL — local only */}
      {settings.provider === "local" && (
        <>
          <label>Base URL</label>
          <input
            value={settings.baseUrl}
            onChange={(e) => update({ baseUrl: e.target.value.replace(/\/$/, "") })}
            placeholder="http://localhost:1234"
          />
          <small style={{ color: "#f59e0b", fontSize: 11, lineHeight: 1.5 }}>
            ⚠️ In LM Studio → Server tab, enable <strong>CORS</strong> and set
            allowed origin to <code>*</code>. Then start the server.
          </small>
        </>
      )}

      {/* Model — always shown */}
      <label>Model name</label>
      <input
        value={settings.model}
        onChange={(e) => update({ model: e.target.value })}
        placeholder={
          settings.provider === "local"
            ? "Paste exact name from LM Studio — e.g. google/gemma-4-e4b"
            : "gpt-4o-mini"
        }
      />
      {settings.provider === "local" && (
        <small style={{ color: "#94a3b8", fontSize: 11 }}>
          Copy the model identifier exactly as shown in LM Studio's loaded model list.
        </small>
      )}

      <button className="btn btn-primary" onClick={save}>
        Save Settings
      </button>
    </div>
  );
}