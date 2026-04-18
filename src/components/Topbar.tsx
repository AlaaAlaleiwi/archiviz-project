import "../styles.css";

export default function Topbar({
  generate,
  askAI,
  loading,
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
}: any) {

  const frameworksByLanguage: Record<string, string[]> = {
    javascript: ["Node.js", "Express"],
    typescript: ["Node.js", "NestJS"],
    python: ["FastAPI", "Django"],
    java: ["Spring Boot"],
    cpp: ["None"]
  };

  return (
    <div className="topbar">

      {/* LEFT */}
      <div className="topbar-left">
        <div className="logo">⚡ ARCH BUILDER</div>
      </div>

      {/* CENTER */}
      <div className="topbar-nav">

        {/* Project Name */}
        <input
          className="input"
          placeholder="Project Name"
          value={projectName}
          onChange={(e) => setProjectName(e.target.value)}
        />

        {/* Language */}
        <select
          className="btn"
          value={language}
          onChange={(e) => {
            const newLang = e.target.value;
            setLanguage(newLang);

            const fw = frameworksByLanguage[newLang]?.[0] || "";
            setFramework(fw);
          }}
        >
          <option value="javascript">JavaScript</option>
          <option value="typescript">TypeScript</option>
          <option value="python">Python</option>
          <option value="java">Java</option>
          <option value="cpp">C++</option>
        </select>

        {/* Framework */}
        <select
          className="btn"
          value={framework}
          onChange={(e) => setFramework(e.target.value)}
        >
          {(frameworksByLanguage[language] || []).map((fw) => (
            <option key={fw} value={fw}>
              {fw}
            </option>
          ))}
        </select>

        {/* 🔥 BUILD TOOL (NEW) */}
        <select
          className="btn"
          value={buildTool}
          onChange={(e) => setBuildTool(e.target.value)}
        >
          <option value="maven">Maven</option>
          <option value="gradle">Gradle</option>
        </select>

        {/* Settings */}
        <button className="btn" onClick={onOpenSettings}>
          Settings
        </button>
      </div>

      {/* RIGHT */}
      <div className="topbar-right">

        <button className="btn" onClick={generate}>
          Generate
        </button>

        {loading ? (
          <button className="btn btn-danger" onClick={onCancel}>
            ⏹ Stop
          </button>
        ) : (
          <button className="btn btn-primary" onClick={askAI}>
            Ask AI
          </button>
        )}

        <button
          className="btn"
          onClick={() =>
            setTheme(theme === "dark" ? "light" : "dark")
          }
        >
          {theme === "dark" ? "☀ Light" : "🌙 Dark"}
        </button>
      </div>
    </div>
  );
}