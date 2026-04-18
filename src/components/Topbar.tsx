import "../styles.css";

export default function Topbar({
  generate,
  askAI,
  loading,
  canGenerate,
  canAskAI,
  canSaveProject,
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
}: any) {
  const frameworksByLanguage: Record<string, string[]> = {
    javascript: ["Node.js", "Express", "React", "Vue", "Angular", "Next.js"],
    typescript: ["Node.js", "NestJS", "React", "Vue", "Angular", "Next.js"],
    python: ["FastAPI", "Django", "Flask"],
    java: ["Spring Boot", "Quarkus"],
    cpp: ["C++", "CMake"]
  };

  const buildToolsByLanguage: Record<string, string[]> = {
    javascript: ["npm", "pnpm", "yarn"],
    typescript: ["npm", "pnpm", "yarn"],
    python: ["pip", "poetry", "uv"],
    java: ["maven", "gradle"],
    cpp: ["cmake", "make", "meson"],
  };

  const buildTools = buildToolsByLanguage[language] || ["npm"];

  return (
    <div className="topbar">

      {/* LEFT */}
      <div className="topbar-left">
        <div className="logo">⚡ ARCH BUILDER</div>

        <div className="topbar-project-actions">
          <button className="btn" onClick={onCreateProject}>
            New Project
          </button>

          <button className="btn" onClick={onOpenProject}>
            Open Project
          </button>

          <button className="btn" onClick={onImportProject} disabled={importingProject}>
            {importingProject ? "Importing..." : "Import Folder"}
          </button>

          <button className="btn" onClick={onSaveProject} disabled={!canSaveProject}>
            Save Project
          </button>
        </div>
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
          {buildTools.map((tool) => (
            <option key={tool} value={tool}>
              {tool}
            </option>
          ))}
        </select>

        {/* Settings */}
        <button className="btn" onClick={onOpenSettings}>
          Settings
        </button>
      </div>

      {/* RIGHT */}
      <div className="topbar-right">

        <button className="btn" onClick={generate} disabled={!canGenerate}>
          Generate
        </button>

        {loading ? (
          <button className="btn btn-danger" onClick={onCancel}>
            ⏹ Stop
          </button>
        ) : (
          <button className="btn btn-primary" onClick={askAI} disabled={!canAskAI}>
            Ask AI
          </button>
        )}

        <button
          className="btn topbar-theme-toggle"
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
