import { useState } from "react";
import "../styles.css";

export default function CodePanel({ prompt, setPrompt }: any) {
  const [isOpen, setIsOpen] = useState(true);

  return (
    <div className={`code-panel${isOpen ? "" : " code-panel--collapsed"}`}>
      <div className="code-header">
        <button
          className="panelCollapseBtn"
          onClick={() => setIsOpen(!isOpen)}
          title={isOpen ? "Collapse panel" : "Expand panel"}
        >
          {isOpen ? "›" : "‹"}
        </button>
        {isOpen && <div className="code-title">AI PROMPT (Editable)</div>}
      </div>

      {isOpen && (
        <div className="code-body">
          <textarea
            className="code-editor"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>
      )}
    </div>
  );
}