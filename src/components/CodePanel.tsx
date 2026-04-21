import { useState } from "react";
import "../styles.css";

type PanelTab = "prompt" | "git";

type GitCommit = {
  id: string;
  branch: string;
  message: string;
  createdAt: string;
};

type GitBranch = {
  name: string;
  commitCount: number;
};

type GitHubUser = {
  login: string;
  avatar_url?: string;
  html_url?: string;
};

type GitHubStatus = {
  kind: "idle" | "success" | "error";
  message: string;
  url?: string;
};

type CodePanelProps = {
  prompt: string;
  setPrompt: (prompt: string) => void;
  filesCount: number;
  onGenerateProject: () => Promise<void>;
  onOpenEditor: () => void;
  aiGenerating: boolean;
  canGenerateProject: boolean;
};

export default function CodePanel({
  prompt,
  setPrompt,
  filesCount,
  onGenerateProject,
  onOpenEditor,
  aiGenerating,
  canGenerateProject,
}: CodePanelProps) {
  const [isOpen, setIsOpen] = useState(true);
  const [activeTab, setActiveTab] = useState<PanelTab>("prompt");
  const [branchName, setBranchName] = useState("");
  const [commitMessage, setCommitMessage] = useState("");
  const [currentBranch, setCurrentBranch] = useState("main");
  const [branches, setBranches] = useState<GitBranch[]>([{ name: "main", commitCount: 0 }]);
  const [commits, setCommits] = useState<GitCommit[]>([]);
  const [githubToken, setGithubToken] = useState("");
  const [githubUser, setGithubUser] = useState<GitHubUser | null>(null);
  const [githubStatus, setGithubStatus] = useState<GitHubStatus>({ kind: "idle", message: "" });
  const [repoName, setRepoName] = useState("");
  const [repoDescription, setRepoDescription] = useState("");
  const [repoPrivate, setRepoPrivate] = useState(false);
  const [githubBusy, setGithubBusy] = useState(false);

  const createBranch = () => {
    const nextName = branchName.trim();
    if (!nextName || branches.some(branch => branch.name === nextName)) return;
    setBranches(prev => [...prev, { name: nextName, commitCount: 0 }]);
    setCurrentBranch(nextName);
    setBranchName("");
  };

  const createCommit = () => {
    const message = commitMessage.trim();
    if (!message) return;

    const commit: GitCommit = {
      id: Math.random().toString(36).slice(2, 9),
      branch: currentBranch,
      message,
      createdAt: new Date().toLocaleString(),
    };

    setCommits(prev => [commit, ...prev]);
    setBranches(prev => prev.map(branch =>
      branch.name === currentBranch ? { ...branch, commitCount: branch.commitCount + 1 } : branch
    ));
    setCommitMessage("");
  };

  const githubHeaders = (token = githubToken.trim()) => ({
    Accept: "application/vnd.github+json",
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    "X-GitHub-Api-Version": "2022-11-28",
  });

  const loginToGitHub = async () => {
    const token = githubToken.trim();
    if (!token) {
      setGithubStatus({ kind: "error", message: "Enter a GitHub token first." });
      return;
    }

    setGithubBusy(true);
    setGithubStatus({ kind: "idle", message: "" });

    try {
      const res = await fetch("https://api.github.com/user", {
        headers: githubHeaders(token),
      });

      if (!res.ok) {
        throw new Error(res.status === 401 ? "GitHub rejected this token." : `GitHub login failed (${res.status}).`);
      }

      const user = await res.json() as GitHubUser;
      setGithubUser(user);
      setGithubStatus({ kind: "success", message: `Logged in as ${user.login}.`, url: user.html_url });
    } catch (error: any) {
      setGithubUser(null);
      setGithubStatus({ kind: "error", message: error?.message ?? "Could not log in to GitHub." });
    } finally {
      setGithubBusy(false);
    }
  };

  const logoutFromGitHub = () => {
    setGithubToken("");
    setGithubUser(null);
    setGithubStatus({ kind: "idle", message: "" });
  };

  const createGitHubRepo = async () => {
    const name = repoName.trim();
    if (!githubUser) {
      setGithubStatus({ kind: "error", message: "Log in to GitHub before creating a repo." });
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
        headers: githubHeaders(),
        body: JSON.stringify({
          name,
          description: repoDescription.trim() || undefined,
          private: repoPrivate,
          auto_init: true,
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        const message = typeof data?.message === "string" ? data.message : `Repo creation failed (${res.status}).`;
        throw new Error(message);
      }

      setGithubStatus({
        kind: "success",
        message: `Created ${data.full_name ?? name}.`,
        url: data.html_url,
      });
      setRepoName("");
      setRepoDescription("");
    } catch (error: any) {
      setGithubStatus({ kind: "error", message: error?.message ?? "Could not create GitHub repo." });
    } finally {
      setGithubBusy(false);
    }
  };

  return (
    <div className={`code-panel${isOpen ? "" : " code-panel--collapsed"}`}>
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
                {tab === "prompt" ? "Prompt + AI" : "Git"}
              </button>
            ))}
          </div>
        )}
      </div>

      {isOpen && activeTab === "prompt" && (
        <div className="code-body prompt-ai-body">
          <div className="workspace-section-title">Architecture Prompt</div>
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
        </div>
      )}

      {isOpen && activeTab === "git" && (
        <div className="workspace-tool-body">
          <div className="workspace-section-title">GitHub</div>
          {githubUser ? (
            <div className="github-account">
              {githubUser.avatar_url && <img className="github-avatar" src={githubUser.avatar_url} alt="" />}
              <div className="github-account-main">
                <span className="github-account-name">{githubUser.login}</span>
                {githubUser.html_url && (
                  <a className="github-link" href={githubUser.html_url} target="_blank" rel="noreferrer">
                    View profile
                  </a>
                )}
              </div>
              <button className="btn" onClick={logoutFromGitHub}>Logout</button>
            </div>
          ) : (
            <div className="github-login-box">
              <input
                className="input"
                value={githubToken}
                onChange={(e) => setGithubToken(e.target.value)}
                placeholder="GitHub token with repo scope"
                type="password"
              />
              <button className="btn btn-primary" onClick={loginToGitHub} disabled={githubBusy}>
                {githubBusy ? "Logging in..." : "Login"}
              </button>
            </div>
          )}

          <div className="github-repo-box">
            <input
              className="input"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="Repository name"
              disabled={!githubUser || githubBusy}
            />
            <input
              className="input"
              value={repoDescription}
              onChange={(e) => setRepoDescription(e.target.value)}
              placeholder="Description"
              disabled={!githubUser || githubBusy}
            />
            <label className="github-private-toggle">
              <input
                type="checkbox"
                checked={repoPrivate}
                onChange={(e) => setRepoPrivate(e.target.checked)}
                disabled={!githubUser || githubBusy}
              />
              Private repository
            </label>
            <button className="btn btn-primary workspace-wide-btn" onClick={createGitHubRepo} disabled={!githubUser || githubBusy}>
              {githubBusy ? "Working..." : "Create GitHub Repo"}
            </button>
          </div>

          {githubStatus.message && (
            <div className={`github-status github-status--${githubStatus.kind}`}>
              <span>{githubStatus.message}</span>
              {githubStatus.url && (
                <a href={githubStatus.url} target="_blank" rel="noreferrer">
                  Open
                </a>
              )}
            </div>
          )}

          <div className="workspace-section-title">Branches</div>
          <div className="git-branch-list">
            {branches.map(branch => (
              <button
                key={branch.name}
                className={`git-branch ${branch.name === currentBranch ? "active" : ""}`}
                onClick={() => setCurrentBranch(branch.name)}
              >
                <span>{branch.name}</span>
                <span>{branch.commitCount}</span>
              </button>
            ))}
          </div>
          <div className="workspace-row">
            <input
              className="input"
              value={branchName}
              onChange={(e) => setBranchName(e.target.value)}
              placeholder="feature/project-ui"
            />
            <button className="btn" onClick={createBranch}>Branch</button>
          </div>

          <div className="workspace-section-title">Commits</div>
          <textarea
            className="workspace-commit-input"
            value={commitMessage}
            onChange={(e) => setCommitMessage(e.target.value)}
            placeholder="Describe this snapshot"
          />
          <button className="btn btn-primary workspace-wide-btn" onClick={createCommit}>
            Commit to {currentBranch}
          </button>
          <div className="git-commit-list">
            {commits.length > 0 ? commits.map(commit => (
              <div key={commit.id} className="git-commit">
                <div className="git-commit-message">{commit.message}</div>
                <div className="git-commit-meta">{commit.id} on {commit.branch} · {commit.createdAt}</div>
              </div>
            )) : (
              <div className="workspace-empty">No commits yet.</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
