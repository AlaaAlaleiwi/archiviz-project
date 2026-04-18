import "../styles.css";

export default function CodePanel({ prompt, setPrompt }: any) {
  return (
    <div className="code-panel">

      <div className="code-header">
        <div className="code-title">AI PROMPT (Editable)</div>
      </div>

      <div className="code-body">
        <textarea
          className="code-editor"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
        />
      </div>

    </div>
  );
}