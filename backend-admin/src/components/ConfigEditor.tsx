import { useEffect, useState } from "react";
import { adminApi } from "../api";

export default function ConfigEditor() {
  const [value, setValue] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => { adminApi.config().then(config => setValue(JSON.stringify(config, null, 2))).catch(reason => setError(reason.message)); }, []);
  const save = async () => {
    setError(""); setMessage("");
    try { const parsed = JSON.parse(value) as Record<string, unknown>; await adminApi.updateConfig(parsed); setMessage("Configuration saved for this service instance."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Could not save configuration."); }
  };
  return <section className="admin-panel"><p className="admin-muted">Edit the runtime configuration as JSON. Invalid JSON is rejected.</p>{error && <div className="admin-error" role="alert">{error}</div>}{message && <div className="admin-success" role="status">{message}</div>}<textarea className="admin-json" value={value} onChange={event => setValue(event.target.value)} spellCheck={false} aria-label="Runtime configuration"/><div className="admin-actions"><button className="admin-button primary" onClick={save}>Save configuration</button></div></section>;
}
