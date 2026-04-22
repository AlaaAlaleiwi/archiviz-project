import { useEffect, useMemo, useState, type PointerEvent as ReactPointerEvent } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { WorkspaceFile } from "./FileWorkspace";
import type { GitSettings } from "./Settings";
import "../styles.css";

type PanelTab = "prompt" | "git";

type CodePanelProps = {
  width?: number;
  onResizeStart?: (event: ReactPointerEvent<HTMLDivElement>) => void;
  prompt: string;
  setPrompt: (prompt: string) => void;
  filesCount: number;
  projectName: string;
  files: WorkspaceFile[];
  gitSettings: GitSettings;
  gitRepositoryReady: boolean;
  onGitRepositoryChange?: (isRepository: boolean) => void;
  onGeneratePrompt: () => void;
  onGenerateProject: () => Promise<void>;
  onRunCodeAgent: () => Promise<void>;
  onOpenEditor: () => void;
  aiGenerating: boolean;
  canGenerateProject: boolean;
  codeAgentRunning: boolean;
  codeAgentOutput: string;
  canRunCodeAgent: boolean;
  aiModelLabel: string;
};

type GitChange = { code: string; path: string };

type GitHubStatus = {
  kind: "idle" | "success" | "error";
  message: string;
  url?: string;
};

type GitRunResult = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  command: string;
  cwd: string;
  displayPath: string;
  isRepository: boolean;
};

const hashText = (value: string) => {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
  }
  return hash.toString(36);
};

const getFilesSignature = (files: WorkspaceFile[]) => files
  .map(file => `${file.path}:${file.content.length}:${hashText(file.content)}`)
  .join("|");

const getStatusPath = (line: string) => {
  const rawPath = line.slice(3).trim();
  const renameArrow = " -> ";
  return rawPath.includes(renameArrow) ? rawPath.split(renameArrow).pop() ?? rawPath : rawPath;
};

const basename = (path: string) => path.split("/").pop() ?? path;

const parseGitChanges = (statusText: string): GitChange[] =>
  statusText
    .split(/\r?\n/)
    .filter(line => line && !line.startsWith("##"))
    .map(line => ({ code: line.slice(0, 2).trim(), path: getStatusPath(line) }))
    .filter(c => c.path);

const changeStyle = (code: string): { label: string; cls: string } => {
  if (code.includes("M")) return { label: "M", cls: "modified" };
  if (code.includes("A")) return { label: "A", cls: "added" };
  if (code.includes("D")) return { label: "D", cls: "deleted" };
  if (code.includes("R")) return { label: "R", cls: "renamed" };
  if (code.includes("?")) return { label: "?", cls: "untracked" };
  return { label: code || "~", cls: "modified" };
};

const buildCommitSuggestion = (statusText: string) => {
  const changes = parseGitChanges(statusText);
  if (changes.length === 0) return { message: "", count: 0 };

  const firstName = basename(changes[0].path);
  const hasOnlyNew = changes.every(c => c.code.includes("?") || c.code.includes("A"));
  const hasOnlyDeleted = changes.every(c => c.code.includes("D"));
  const hasOnlyModified = changes.every(c => c.code.includes("M"));

  if (changes.length === 1) {
    if (hasOnlyNew) return { message: `Add ${firstName}`, count: 1 };
    if (hasOnlyDeleted) return { message: `Remove ${firstName}`, count: 1 };
    return { message: `Update ${firstName}`, count: 1 };
  }

  if (hasOnlyNew) return { message: `Add ${changes.length} project files`, count: changes.length };
  if (hasOnlyDeleted) return { message: `Remove ${changes.length} project files`, count: changes.length };
  if (hasOnlyModified) return { message: `Update ${changes.length} project files`, count: changes.length };
  return { message: `Update ${changes.length} project files`, count: changes.length };
};

export default function CodePanel({
  width,
  onResizeStart,
  prompt,
  setPrompt,
  filesCount,
  projectName,
  files,
  gitSettings,
  gitRepositoryReady,
  onGitRepositoryChange,
  onGeneratePrompt,
  onGenerateProject,
  onRunCodeAgent,
  onOpenEditor,
  aiGenerating,
  canGenerateProject,
  codeAgentRunning,
  codeAgentOutput,
  canRunCodeAgent,
  aiModelLabel,
}: CodePanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<PanelTab>("prompt");
  const [commitMessage, setCommitMessage] = useState("");
  const [currentBranch, setCurrentBranch] = useState("main");
  const [commits, setCommits] = useState<string[]>([]);
  const [gitStatusText, setGitStatusText] = useState("");
  const [gitOutput, setGitOutput] = useState("");
  const [gitBusy, setGitBusy] = useState(false);
  const [customGitArgs, setCustomGitArgs] = useState("");
  const [gitInitialized, setGitInitialized] = useState(gitRepositoryReady);
  const [suggestedCommitMessage, setSuggestedCommitMessage] = useState("");
  const [changedFilesCount, setChangedFilesCount] = useState(0);
  const [pendingRefresh, setPendingRefresh] = useState(false);
  const [repoName, setRepoName] = useState(projectName);
  const [repoDescription, setRepoDescription] = useState("");
  const [repoPrivate, setRepoPrivate] = useState(false);
  const [originUrl, setOriginUrl] = useState("");
  const [githubBusy, setGithubBusy] = useState(false);
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>({ kind: "idle", message: "" });
  const filesSignature = useMemo(() => getFilesSignature(files), [files]);

  const gitChanges = useMemo(() => parseGitChanges(gitStatusText), [gitStatusText]);

  const splitGitArgs = (value: string) =>
    value.match(/(?:[^\s"]+|"[^"]*")+/g)?.map(part => part.replace(/^"|"$/g, "")) ?? [];

  const runGit = async (args: string[], refresh = true) => {
    setGitBusy(true);
    try {
      const result = await invoke<GitRunResult>("git_run", { options: { projectName, files, args } });
      const output = [result.command, result.stdout, result.stderr].filter(Boolean).join("\n\n");
      setGitOutput(output || `${result.command}\n\nDone.`);
      setGitInitialized(result.isRepository);
      onGitRepositoryChange?.(result.isRepository);
      if (refresh) await refreshGit(false, false);
      return result;
    } catch (error: any) {
      setGitOutput(error?.message ?? String(error) ?? "Git operation failed.");
      return null;
    } finally {
      setGitBusy(false);
    }
  };

  const refreshGit = async (showOutput = true, showBusy = true) => {
    if (showBusy) setGitBusy(true);
    try {
      const status = await invoke<GitRunResult>("git_run", { options: { projectName, files, args: ["status", "--short", "--branch"] } });
      const branchList = await invoke<GitRunResult>("git_run", { options: { projectName, files, args: ["branch", "--list"] } });
      const log = await invoke<GitRunResult>("git_run", { options: { projectName, files, args: ["log", "--oneline", "-10"] } });
      const origin = await invoke<GitRunResult>("git_run", { options: { projectName, files, args: ["remote", "get-url", "origin"] } });

      const statusText = status.stdout || status.stderr || "";
      const suggestion = buildCommitSuggestion(status.stdout);
      setGitStatusText(statusText);
      setSuggestedCommitMessage(suggestion.message);
      setChangedFilesCount(suggestion.count);
      setCommitMessage(prev => prev.trim() ? prev : suggestion.message);
      const nextInitialized = status.isRepository || branchList.isRepository || log.isRepository;
      setGitInitialized(nextInitialized);
      onGitRepositoryChange?.(nextInitialized);
      const active = branchList.stdout.split(/\r?\n/).find(line => line.startsWith("* "));
      if (active) setCurrentBranch(active.replace(/^\*\s*/, "").trim());
      setCommits(log.stdout.split(/\r?\n/).filter(Boolean));
      setOriginUrl(origin.ok ? origin.stdout.trim() : "");
      if (showOutput) setGitOutput([status.command, status.stdout, status.stderr].filter(Boolean).join("\n\n"));
    } catch (error: any) {
      if (showOutput) setGitOutput(error?.message ?? String(error) ?? "Could not refresh Git status.");
      setGitInitialized(false);
      onGitRepositoryChange?.(false);
    } finally {
      if (showBusy) setGitBusy(false);
    }
  };

  const initRepo = async () => {
    await runGit(["init"]);
  };

  const createCommit = async () => {
    const message = commitMessage.trim();
    if (!message) return;
    await runGit(["add", "-A"], false);
    const result = await runGit(["commit", "-m", message]);
    if (!result?.ok) return;
    setCommitMessage("");
    setSuggestedCommitMessage("");
    setChangedFilesCount(0);
  };

  const runCustomGit = async () => {
    const args = splitGitArgs(customGitArgs.trim());
    if (args.length === 0) return;
    await runGit(args);
  };

  const createGitHubRepo = async () => {
    const name = repoName.trim();
    const token = gitSettings.githubToken.trim();

    if (!gitSettings.githubUser || !token) {
      setGithubStatus({ kind: "error", message: "Log in to GitHub in Settings first." });
      return;
    }
    if (!name) {
      setGithubStatus({ kind: "error", message: "Enter a repository name." });
      return;
    }

    setGithubBusy(true);
    setGithubStatus({ kind: "idle", message: "" });

    try {
      const res = await fetch("https://api.github.com/user/repos", {
        method: "POST",
        headers: {
          Accept: "application/vnd.github+json",
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        body: JSON.stringify({
          name,
          description: repoDescription.trim() || undefined,
          private: repoPrivate,
          auto_init: false,
        }),
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = typeof data?.message === "string" ? data.message : `GitHub API error (${res.status})`;
        throw new Error(msg);
      }

      const url = data.clone_url as string;
      const htmlUrl = data.html_url as string;
      const fullName = data.full_name as string;
      const remote = await runGit(["remote", "add", "origin", url], false);

      if (!remote?.ok) {
        const fallback = await runGit(["remote", "set-url", "origin", url], false);
        if (!fallback?.ok) throw new Error(fallback?.stderr || remote?.stderr || "Could not link the GitHub repository.");
      }

      setOriginUrl(url);
      setGithubStatus({
        kind: "success",
        message: `Created ${fullName || name}. Commit your changes, then push when ready.`,
        url: htmlUrl || (url.startsWith("http") ? url.replace(/\.git$/, "") : undefined),
      });
      await refreshGit(false, false);
    } catch (error: any) {
      setGithubStatus({ kind: "error", message: error?.message ?? "Could not create the GitHub repository." });
    } finally {
      setGithubBusy(false);
    }
  };

  const pushToGitHub = async () => {
    const token = gitSettings.githubToken.trim();
    const url = originUrl.trim();

    if (!gitSettings.githubUser || !token) {
      setGithubStatus({ kind: "error", message: "Log in to GitHub in Settings first." });
      return;
    }
    if (!url) {
      setGithubStatus({ kind: "error", message: "Create or link a GitHub repository first." });
      return;
    }
    if (commits.length === 0) {
      setGithubStatus({ kind: "error", message: "Make at least one commit before pushing." });
      return;
    }

    setGithubBusy(true);
    setGithubStatus({ kind: "idle", message: "" });

    try {
      const push = await runGit(["push", "-u", "origin", currentBranch], false);
      if (!push?.ok) throw new Error(push?.stderr || "Push failed.");

      setGithubStatus({
        kind: "success",
        message: `Pushed ${currentBranch} to origin.`,
        url: url.startsWith("http") ? url.replace(/\.git$/, "") : undefined,
      });
      await refreshGit(false, false);
    } catch (error: any) {
      setGithubStatus({ kind: "error", message: error?.message ?? "Could not push to GitHub." });
    } finally {
      setGithubBusy(false);
    }
  };

  useEffect(() => {
    setRepoName(projectName);
    setGithubStatus({ kind: "idle", message: "" });
  }, [projectName]);

  useEffect(() => {
    setGitInitialized(gitRepositoryReady);
  }, [gitRepositoryReady]);

  useEffect(() => {
    if (!gitInitialized) return;
    setPendingRefresh(true);
    const timeout = window.setTimeout(async () => {
      await refreshGit(false, false);
      setPendingRefresh(false);
    }, 700);
    return () => {
      window.clearTimeout(timeout);
      setPendingRefresh(false);
    };
  }, [filesSignature, gitInitialized]);

  const hasChanges = gitChanges.length > 0;
  const hasOrigin = originUrl.trim().length > 0;

  return (
    <div
      className={`code-panel${isOpen ? "" : " code-panel--collapsed"}${onResizeStart ? " code-panel--resizable" : ""}`}
      style={isOpen && width ? { width, flexBasis: width } : undefined}
    >
      {isOpen && onResizeStart && (
        <div
          className="panel-resize-handle panel-resize-handle--left"
          onPointerDown={onResizeStart}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize code panel"
          title="Resize code panel"
        />
      )}
      <div className="code-header workspace-header">
        <button
          className="panelCollapseBtn"
          onClick={() => setIsOpen(!isOpen)}
          title={isOpen ? "Collapse panel" : "Expand panel"}
        >
          {isOpen ? ">" : "<"}
        </button>
        {isOpen && (
          <div className="workspace-tabs" role="tablist" aria-label="Workspace tools">
            {(["prompt", "git"] as PanelTab[]).map(tab => (
              <button
                key={tab}
                className={`workspace-tab ${activeTab === tab ? "active" : ""}`}
                onClick={() => setActiveTab(tab)}
                role="tab"
                aria-selected={activeTab === tab}
              >
                {tab === "prompt" ? "Prompt + AI" : (
                  <>
                    Git
                    {hasChanges && (
                      <span className="git-tab-badge">{changedFilesCount}</span>
                    )}
                  </>
                )}
              </button>
            ))}
          </div>
        )}
      </div>

      {isOpen && activeTab === "prompt" && (
        <div className="code-body prompt-ai-body">
          <div className="prompt-ai-heading">
            <div className="workspace-section-title">Architecture Prompt</div>
            <button
              className="btn"
              onClick={onGeneratePrompt}
              disabled={aiGenerating}
            >
              Generate Prompt
            </button>
          </div>
          <textarea
            className="code-editor"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Describe the architecture, then generate a multi-file project."
          />
          <div className="prompt-ai-actions">
            <button
              className="btn btn-primary workspace-wide-btn"
              onClick={onGenerateProject}
              disabled={!canGenerateProject || aiGenerating}
            >
              {aiGenerating ? "Generating..." : "Generate Multi-file Project"}
            </button>
            <div className="workspace-stat-grid">
              <button
                className="workspace-stat workspace-stat-button"
                onClick={onOpenEditor}
                disabled={filesCount === 0}
                title={filesCount > 0 ? "Open generated files" : "Generate files first"}
              >
                <span className="workspace-stat-value">{filesCount}</span>
                <span className="workspace-stat-label">Files</span>
              </button>
              <div className="workspace-stat">
                <span className="workspace-stat-value">{prompt.trim() ? "Ready" : "Empty"}</span>
                <span className="workspace-stat-label">Prompt</span>
              </div>
            </div>
          </div>
          <section className="ai-agent-card">
            <div className="ai-agent-header">
              <div>
                <span>Code Fix Agent</span>
                <small>{aiModelLabel ? `Using ${aiModelLabel}` : "Uses the model from Settings"}</small>
              </div>
              <button
                className="btn"
                onClick={() => void onRunCodeAgent()}
                disabled={!canRunCodeAgent || codeAgentRunning || aiGenerating}
              >
                {codeAgentRunning ? "Checking..." : "Review Code"}
              </button>
            </div>
            <div className="ai-agent-output">
              {codeAgentOutput ? (
                <pre>{codeAgentOutput}</pre>
              ) : (
                <div className="ai-agent-empty">
                  Run the agent to inspect the current project files and propose fixes.
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {isOpen && activeTab === "git" && (
        <div className="workspace-tool-body">

          {/* ── Header bar ── */}
          <div className="git-header-bar">
            <div className="git-header-branch">
              <span className={`git-header-dot ${gitInitialized ? "git-header-dot--ready" : ""}`} />
              <span className="git-header-branch-name">
                {gitInitialized ? currentBranch : "No repository"}
              </span>
            </div>
            <div className="git-header-meta">
              {pendingRefresh && (
                <span className="git-header-checking">Checking…</span>
              )}
              {!pendingRefresh && hasChanges && (
                <span className="git-header-changes">
                  {changedFilesCount} change{changedFilesCount !== 1 ? "s" : ""}
                </span>
              )}
              {!pendingRefresh && gitInitialized && !hasChanges && (
                <span className="git-header-clean">Clean</span>
              )}
            </div>
            <button
              className="btn git-header-refresh"
              onClick={() => void refreshGit(true, true)}
              disabled={gitBusy}
              title="Refresh git status"
            >
              ↻
            </button>
          </div>

          {/* ── Not initialized ── */}
          {!gitInitialized && (
            <div className="git-init-state">
              <div className="git-init-icon">⎇</div>
              <div className="git-init-title">No Git repository</div>
              <div className="git-init-desc">Initialize a repository to start tracking this project.</div>
              <button
                className="btn btn-primary workspace-wide-btn"
                onClick={() => void initRepo()}
                disabled={gitBusy || files.length === 0}
              >
                {gitBusy ? "Initializing…" : "Initialize Git Repository"}
              </button>
              {files.length === 0 && (
                <div className="git-init-hint">Generate project files first.</div>
              )}
            </div>
          )}

          {gitInitialized && (
            <>
              {/* ── Changed files ── */}
              {(hasChanges || pendingRefresh) && (
                <section className={`git-card git-changes-card${hasChanges ? " git-changes-card--active" : ""}`}>
                  <div className="git-card-header">
                    <div>
                      <span>Changes</span>
                      <small>
                        {pendingRefresh && !hasChanges
                          ? "Scanning project files…"
                          : `${changedFilesCount} file${changedFilesCount !== 1 ? "s" : ""} not committed`}
                      </small>
                    </div>
                  </div>
                  <div className="git-change-list">
                    {gitChanges.map(change => {
                      const style = changeStyle(change.code);
                      return (
                        <div key={change.path} className="git-change-item">
                          <span className={`git-change-badge git-change-badge--${style.cls}`}>
                            {style.label}
                          </span>
                          <span className="git-change-path" title={change.path}>
                            {change.path}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── Create remote ── */}
              {!hasOrigin && (
                <section className="git-card">
                  <div className="git-card-header">
                    <div>
                      <span>Create GitHub Repository</span>
                      <small>Create the remote for this service before committing.</small>
                    </div>
                    {gitSettings.githubUser && (
                      <div className="git-github-account">
                        {gitSettings.githubUser.avatar_url && (
                          <img className="github-avatar" src={gitSettings.githubUser.avatar_url} alt="" />
                        )}
                        <span>{gitSettings.githubUser.login}</span>
                      </div>
                    )}
                  </div>

                  {!gitSettings.githubUser ? (
                    <div className="workspace-empty">Log in to GitHub in Settings to create a repo.</div>
                  ) : (
                    <>
                      <input
                        className="input"
                        value={repoName}
                        onChange={(e) => setRepoName(e.target.value)}
                        placeholder="Repository name"
                        disabled={githubBusy}
                      />
                      <input
                        className="input"
                        value={repoDescription}
                        onChange={(e) => setRepoDescription(e.target.value)}
                        placeholder="Description (optional)"
                        disabled={githubBusy}
                      />
                      <label className="github-private-toggle">
                        <input
                          type="checkbox"
                          checked={repoPrivate}
                          onChange={(e) => setRepoPrivate(e.target.checked)}
                          disabled={githubBusy}
                        />
                        Private repository
                      </label>
                      <button
                        className="btn btn-primary workspace-wide-btn"
                        onClick={() => void createGitHubRepo()}
                        disabled={githubBusy || !repoName.trim()}
                      >
                        {githubBusy ? "Creating..." : "Create Repository"}
                      </button>
                    </>
                  )}

                  {githubStatus.message && (
                    <div className={`github-status github-status--${githubStatus.kind}`}>
                      <span>{githubStatus.message}</span>
                      {githubStatus.url && (
                        <a href={githubStatus.url} target="_blank" rel="noreferrer">Open on GitHub</a>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* ── Commit ── */}
              <section className="git-card">
                <div className="git-card-header">
                  <div>
                    <span>Commit</span>
                    <small>
                      {hasChanges
                        ? `Stage all & commit to ${currentBranch}`
                        : "Working tree clean"}
                    </small>
                  </div>
                </div>
                {suggestedCommitMessage && (
                  <div className="git-commit-suggestion">
                    <div>
                      <span>Suggested</span>
                      <strong>{suggestedCommitMessage}</strong>
                    </div>
                    <button className="btn" onClick={() => setCommitMessage(suggestedCommitMessage)}>
                      Use
                    </button>
                  </div>
                )}
                <textarea
                  className="workspace-commit-input"
                  value={commitMessage}
                  onChange={(e) => setCommitMessage(e.target.value)}
                  placeholder="Describe this snapshot…"
                />
                <button
                  className="btn btn-primary workspace-wide-btn"
                  onClick={() => void createCommit()}
                  disabled={gitBusy || !commitMessage.trim() || files.length === 0}
                >
                  {gitBusy ? "Working…" : `Commit to ${currentBranch}`}
                </button>
              </section>

              {/* ── Recent commits ── */}
              {commits.length > 0 && (
                <section className="git-card">
                  <div className="git-card-header">
                    <div>
                      <span>History</span>
                      <small>Last {commits.length} commit{commits.length !== 1 ? "s" : ""}</small>
                    </div>
                  </div>
                  <div className="git-commit-list">
                    {commits.map(commit => {
                      const [hash, ...msgParts] = commit.split(" ");
                      return (
                        <div key={commit} className="git-commit">
                          <div className="git-commit-message">{msgParts.join(" ") || commit}</div>
                          <div className="git-commit-meta">{hash}</div>
                        </div>
                      );
                    })}
                  </div>
                </section>
              )}

              {/* ── Push to GitHub ── */}
              {hasOrigin && (
                <section className="git-card">
                  <div className="git-card-header">
                    <div>
                      <span>Push to GitHub</span>
                      <small>Push commits to this service repository.</small>
                    </div>
                    {gitSettings.githubUser && (
                      <div className="git-github-account">
                        {gitSettings.githubUser.avatar_url && (
                          <img className="github-avatar" src={gitSettings.githubUser.avatar_url} alt="" />
                        )}
                        <span>{gitSettings.githubUser.login}</span>
                      </div>
                    )}
                  </div>

                  <div className="github-status">
                    <span>Origin: {originUrl}</span>
                  </div>

                  {!gitSettings.githubUser ? (
                    <div className="workspace-empty">Log in to GitHub in Settings to push.</div>
                  ) : (
                    <>
                      <button
                        className="btn btn-primary workspace-wide-btn"
                        onClick={() => void pushToGitHub()}
                        disabled={githubBusy || commits.length === 0}
                      >
                        {githubBusy ? "Pushing..." : "Push to GitHub"}
                      </button>
                      {commits.length === 0 && (
                        <div className="git-publish-hint">Commit your changes first before pushing.</div>
                      )}
                      <button
                        className="btn workspace-wide-btn"
                        onClick={() => {
                          setOriginUrl("");
                          setGithubStatus({ kind: "idle", message: "" });
                          void runGit(["remote", "remove", "origin"], false);
                        }}
                        disabled={githubBusy}
                      >
                        Change GitHub Repository
                      </button>
                    </>
                  )}

                  {githubStatus.message && (
                    <div className={`github-status github-status--${githubStatus.kind}`}>
                      <span>{githubStatus.message}</span>
                      {githubStatus.url && (
                        <a href={githubStatus.url} target="_blank" rel="noreferrer">Open on GitHub</a>
                      )}
                    </div>
                  )}
                </section>
              )}

              {/* ── Terminal ── */}
              <section className="git-card git-card--wide">
                <div className="git-card-header">
                  <div>
                    <span>Terminal</span>
                    <small>Run any git command — arguments only</small>
                  </div>
                </div>
                <div className="workspace-row">
                  <input
                    className="input"
                    value={customGitArgs}
                    onChange={(e) => setCustomGitArgs(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && void runCustomGit()}
                    placeholder="log --oneline, remote -v, diff HEAD~1"
                  />
                  <button
                    className="btn"
                    onClick={() => void runCustomGit()}
                    disabled={gitBusy || !customGitArgs.trim()}
                  >
                    Run
                  </button>
                </div>
                {gitOutput && (
                  <pre className="git-output">{gitOutput}</pre>
                )}
              </section>
            </>
          )}
        </div>
      )}
    </div>
  );
}
