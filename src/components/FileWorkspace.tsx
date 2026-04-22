import Editor from "@monaco-editor/react";
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from "react";
import type { EditorSettings } from "./Settings";
import "../styles.css";

export type WorkspaceFile = {
  path: string;
  content: string;
};

type FileTreeNode = {
  name: string;
  path: string;
  children: Map<string, FileTreeNode>;
  file?: WorkspaceFile;
};

type FileWorkspaceProps = {
  files: WorkspaceFile[];
  activePath: string | null;
  onActivePathChange: (path: string | null) => void;
  onFilesChange: (files: WorkspaceFile[]) => void;
  editorTheme: "dark" | "light";
  editorSettings: EditorSettings;
  showGitFolder?: boolean;
  onBuildProject?: () => void;
  onRunProject?: () => void;
  runnerBusy?: boolean;
};

type FileContextMenu = {
  x: number;
  y: number;
  basePath: string;
  label: string;
} | null;

type NavigationTarget = {
  path: string;
  lineNumber: number;
  column: number;
};

function basename(path: string) {
  return path.split("/").pop() ?? path;
}

function getLanguage(path: string) {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "java") return "java";
  if (ext === "xml") return "xml";
  if (ext === "gradle") return "groovy";
  if (ext === "properties") return "properties";
  if (ext === "yml" || ext === "yaml") return "yaml";
  if (ext === "json") return "json";
  if (ext === "md") return "markdown";
  if (ext === "ts" || ext === "tsx") return "typescript";
  if (ext === "js" || ext === "jsx") return "javascript";
  if (ext === "css") return "css";
  if (ext === "html") return "html";
  if (ext === "sh") return "shell";
  return "plaintext";
}

function getLanguageLabel(path: string) {
  const language = getLanguage(path);
  if (language === "plaintext") return "Text";
  if (language === "groovy") return "Gradle";
  return language.charAt(0).toUpperCase() + language.slice(1);
}

function getFileExtension(path: string) {
  const name = basename(path);
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toUpperCase().slice(0, 4) : "FILE";
}

function getFolderName(path: string) {
  const parts = path.split("/");
  return parts.length > 1 ? parts.slice(0, -1).join("/") : "/";
}

function getParentFolders(path: string) {
  const parts = path.split("/").filter(Boolean);
  return parts.slice(0, -1).map((_, index) => parts.slice(0, index + 1).join("/"));
}

function isFolderPlaceholder(path: string) {
  return basename(path) === ".gitkeep" || path === ".git/.archiviz";
}

function isGitFolderPath(path: string) {
  return path === ".git";
}

function normalizeWorkspacePath(path: string) {
  return path.trim().replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/+/g, "/");
}

function getStarterContent(path: string) {
  const language = getLanguage(path);
  if (language === "json") return "{\n  \n}\n";
  if (language === "markdown") return `# ${basename(path).replace(/\.[^.]+$/, "")}\n`;
  if (language === "yaml") return "";
  if (language === "xml") return "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n";
  return "";
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function getLineColumn(content: string, index: number) {
  const before = content.slice(0, Math.max(0, index));
  const lines = before.split(/\r?\n/);
  return {
    lineNumber: lines.length,
    column: lines[lines.length - 1].length + 1,
  };
}

function findDeclarationInContent(content: string, symbol: string) {
  const declaration = new RegExp(`\\b(class|interface|enum|record)\\s+${escapeRegExp(symbol)}\\b`);
  const match = declaration.exec(content);
  if (!match) return null;
  return getLineColumn(content, match.index + match[0].lastIndexOf(symbol));
}

function getTypeCandidates(typeName: string) {
  const cleaned = typeName.replace(/\b(final|private|protected|public|static|volatile|transient)\b/g, "").trim();
  const candidates = new Set<string>();
  const outer = cleaned.replace(/<.*$/, "").replace(/\[\]$/, "").trim();
  if (/^[A-Z]\w*$/.test(outer)) candidates.add(outer);

  const genericMatches = cleaned.match(/[A-Z]\w*/g) ?? [];
  genericMatches.forEach(match => candidates.add(match));

  return Array.from(candidates);
}

function inferTypeCandidates(content: string, symbol: string) {
  const escaped = escapeRegExp(symbol);
  const patterns = [
    new RegExp(`\\b([A-Z][\\w]*(?:\\s*<[^;=(){}]+>)?(?:\\[\\])?)\\s+${escaped}\\b`),
    new RegExp(`\\bvar\\s+${escaped}\\s*=\\s*new\\s+([A-Z]\\w*)\\b`),
    new RegExp(`\\b${escaped}\\s*=\\s*new\\s+([A-Z]\\w*)\\b`),
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(content);
    if (match?.[1]) return getTypeCandidates(match[1]);
  }

  return [];
}

function findClassTarget(files: WorkspaceFile[], symbol: string): NavigationTarget | null {
  const exactFile = files.find(file => basename(file.path) === `${symbol}.java`);
  if (exactFile) {
    const declarationPosition = findDeclarationInContent(exactFile.content, symbol);
    return {
      path: exactFile.path,
      lineNumber: declarationPosition?.lineNumber ?? 1,
      column: declarationPosition?.column ?? 1,
    };
  }

  for (const file of files) {
    const declarationPosition = findDeclarationInContent(file.content, symbol);
    if (declarationPosition) {
      return {
        path: file.path,
        lineNumber: declarationPosition.lineNumber,
        column: declarationPosition.column,
      };
    }
  }

  return null;
}

function countFiles(node: FileTreeNode): number {
  if (node.file) return isFolderPlaceholder(node.file.path) ? 0 : 1;
  return Array.from(node.children.values()).reduce((total, child) => total + countFiles(child), 0);
}

function buildFileTree(files: WorkspaceFile[]) {
  const root: FileTreeNode = { name: "", path: "", children: new Map() };

  for (const file of files) {
    const parts = file.path.split("/").filter(Boolean);
    let current = root;

    parts.forEach((part, index) => {
      const path = parts.slice(0, index + 1).join("/");
      const existing = current.children.get(part);
      const next: FileTreeNode = existing ?? { name: part, path, children: new Map<string, FileTreeNode>() };
      if (index === parts.length - 1) next.file = file;
      current.children.set(part, next);
      current = next;
    });
  }

  return root;
}

function sortTreeNodes(nodes: FileTreeNode[]) {
  return nodes.sort((a, b) => {
    const aIsFile = !!a.file;
    const bIsFile = !!b.file;
    if (aIsFile !== bIsFile) return aIsFile ? 1 : -1;
    return a.name.localeCompare(b.name);
  });
}

function childTreeMatches(node: FileTreeNode, query: string): boolean {
  if (!query) return true;
  if (node.path.toLowerCase().includes(query)) return true;
  return Array.from(node.children.values()).some(child => childTreeMatches(child, query));
}

function FileTree({
  node,
  depth = 0,
  activePath,
  onSelect,
  collapsedPaths,
  onToggleFolder,
  onContextMenu,
  filter = "",
}: {
  node: FileTreeNode;
  depth?: number;
  activePath: string | null;
  onSelect: (path: string) => void;
  collapsedPaths: Set<string>;
  onToggleFolder: (path: string) => void;
  onContextMenu: (event: MouseEvent, basePath: string, label: string) => void;
  filter?: string;
}) {
  const children = sortTreeNodes(Array.from(node.children.values()));
  const normalizedFilter = filter.trim().toLowerCase();
  const isFiltering = normalizedFilter.length > 0;

  return (
    <>
      {children.map(child => {
        const isFile = !!child.file;
        const isActive = child.path === activePath;
        const isCollapsed = !isFile && collapsedPaths.has(child.path) && !isFiltering;
        if (isFile && child.file && isFolderPlaceholder(child.file.path)) return null;
        if (!childTreeMatches(child, normalizedFilter)) return null;

        return (
          <div key={child.path}>
            <button
              className={`file-tree-item ${isActive ? "active" : ""} ${isFile ? "file-tree-item--file" : "file-tree-item--folder"} ${isGitFolderPath(child.path) ? "file-tree-item--git" : ""}`}
              style={{ paddingLeft: 10 + depth * 14 }}
              onClick={() => isFile ? onSelect(child.path) : onToggleFolder(child.path)}
              onContextMenu={(event) => {
                const basePath = isFile ? getFolderName(child.path).replace(/^\//, "") : child.path;
                onContextMenu(event, basePath === "/" ? "" : basePath, child.path);
              }}
              title={child.path}
            >
              <span className={`file-tree-caret ${isFile ? "file-tree-caret--blank" : isCollapsed ? "" : "open"}`} />
              <span className={`file-tree-icon ${isFile ? "file-tree-icon--file" : isGitFolderPath(child.path) ? "file-tree-icon--git" : "file-tree-icon--folder"}`}>
                {isFile ? <span>{getFileExtension(child.path)}</span> : null}
              </span>
              <span className="file-tree-label">{child.name}</span>
              {!isFile && <span className="file-tree-count">{isGitFolderPath(child.path) ? "repo" : countFiles(child)}</span>}
            </button>
            {!isFile && !isCollapsed && (
              <FileTree
                node={child}
                depth={depth + 1}
                activePath={activePath}
                onSelect={onSelect}
                collapsedPaths={collapsedPaths}
                onToggleFolder={onToggleFolder}
                onContextMenu={onContextMenu}
                filter={filter}
              />
            )}
          </div>
        );
      })}
    </>
  );
}

export default function FileWorkspace({
  files,
  activePath,
  onActivePathChange,
  onFilesChange,
  editorTheme,
  editorSettings,
  showGitFolder = false,
  onBuildProject,
  onRunProject,
  runnerBusy = false,
}: FileWorkspaceProps) {
  const [openPaths, setOpenPaths] = useState<string[]>([]);
  const [fileSearch, setFileSearch] = useState("");
  const [copiedPath, setCopiedPath] = useState(false);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(() => new Set());
  const [newEntryMode, setNewEntryMode] = useState<"file" | "folder" | null>(null);
  const [newEntryPath, setNewEntryPath] = useState("");
  const [newEntryError, setNewEntryError] = useState("");
  const [contextMenu, setContextMenu] = useState<FileContextMenu>(null);
  const editorRef = useRef<any>(null);
  const pendingNavigationRef = useRef<NavigationTarget | null>(null);
  const activeFileRef = useRef<WorkspaceFile | null>(null);
  const visibleFilesRef = useRef<WorkspaceFile[]>([]);

  const treeFiles = useMemo(() => {
    if (!showGitFolder || files.some(file => file.path === ".git/.archiviz" || file.path.startsWith(".git/"))) {
      return files;
    }
    return [{ path: ".git/.archiviz", content: "" }, ...files];
  }, [files, showGitFolder]);
  const fileTree = useMemo(() => buildFileTree(treeFiles), [treeFiles]);
  const hasTreeMatches = useMemo(() => {
    const query = fileSearch.trim().toLowerCase();
    return Array.from(fileTree.children.values()).some(child => childTreeMatches(child, query));
  }, [fileSearch, fileTree]);
  const visibleFiles = useMemo(() => files.filter(file => !isFolderPlaceholder(file.path)), [files]);
  const activeFile = visibleFiles.find(file => file.path === activePath) ?? visibleFiles[0] ?? null;
  const activeFileLines = activeFile?.content ? activeFile.content.split(/\r?\n/).length : 0;
  const filteredFileCount = useMemo(() => {
    const query = fileSearch.trim().toLowerCase();
    return query ? visibleFiles.filter(file => file.path.toLowerCase().includes(query)).length : visibleFiles.length;
  }, [fileSearch, visibleFiles]);

  useEffect(() => {
    activeFileRef.current = activeFile;
    visibleFilesRef.current = visibleFiles;
  }, [activeFile, visibleFiles]);

  const revealEditorPosition = useCallback((target: NavigationTarget) => {
    window.setTimeout(() => {
      const editor = editorRef.current;
      if (!editor) return;
      editor.setPosition({ lineNumber: target.lineNumber, column: target.column });
      editor.revealLineInCenter(target.lineNumber);
      editor.focus();
    }, 0);
  }, []);

  const openNavigationTarget = useCallback((target: NavigationTarget) => {
    pendingNavigationRef.current = target;
    openParentFolders(target.path);
    onActivePathChange(target.path);
    setOpenPaths(prev => prev.includes(target.path) ? prev : [...prev, target.path]);

    if (activeFileRef.current?.path === target.path) {
      revealEditorPosition(target);
      pendingNavigationRef.current = null;
    }
  }, [onActivePathChange, revealEditorPosition]);

  const findNavigationTarget = useCallback((symbol: string): NavigationTarget | null => {
    const currentActiveFile = activeFileRef.current;
    const currentVisibleFiles = visibleFilesRef.current;
    if (!currentActiveFile || !symbol) return null;

    const directClassTarget = findClassTarget(currentVisibleFiles, symbol);
    if (directClassTarget) return directClassTarget;

    const typeCandidates = inferTypeCandidates(currentActiveFile.content, symbol);
    for (const typeCandidate of typeCandidates) {
      const target = findClassTarget(currentVisibleFiles, typeCandidate);
      if (target) return target;
    }

    return null;
  }, []);

  const handleEditorMount = useCallback((editor: any) => {
    editorRef.current = editor;

    editor.onMouseDown((event: any) => {
      const browserEvent = event.event.browserEvent as globalThis.MouseEvent | undefined;
      const position = event.target.position;
      const model = editor.getModel();

      if (!browserEvent || !position || !model) return;
      if (browserEvent.button !== 0 || (!browserEvent.ctrlKey && !browserEvent.metaKey)) return;

      const word = model.getWordAtPosition(position);
      if (!word?.word) return;

      const target = findNavigationTarget(word.word);
      if (!target) return;

      browserEvent.preventDefault();
      browserEvent.stopPropagation();
      openNavigationTarget(target);
    });
  }, [findNavigationTarget, openNavigationTarget]);

  const selectFile = (path: string) => {
    onActivePathChange(path);
    setOpenPaths(prev => prev.includes(path) ? prev : [...prev, path]);
  };

  const openParentFolders = (path: string) => {
    const parents = new Set(getParentFolders(path));
    setCollapsedPaths(prev => {
      const next = new Set(prev);
      parents.forEach(parent => next.delete(parent));
      return next;
    });
  };

  const toggleFolder = (path: string) => {
    setCollapsedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const startNewEntry = (mode: "file" | "folder", basePath = "") => {
    const normalizedBasePath = normalizeWorkspacePath(basePath).replace(/\/+$/, "");
    setNewEntryMode(mode);
    setNewEntryError("");
    setNewEntryPath(normalizedBasePath ? `${normalizedBasePath}/` : "");
    setContextMenu(null);
  };

  const cancelNewEntry = () => {
    setNewEntryMode(null);
    setNewEntryPath("");
    setNewEntryError("");
  };

  const openContextMenu = (event: MouseEvent, basePath = "", label = "Project root") => {
    event.preventDefault();
    event.stopPropagation();
    setContextMenu({
      x: event.clientX,
      y: event.clientY,
      basePath,
      label,
    });
  };

  const createWorkspaceEntry = () => {
    const normalizedPath = normalizeWorkspacePath(newEntryPath);

    if (!newEntryMode) return;

    if (!normalizedPath) {
      setNewEntryError(newEntryMode === "file" ? "Enter a file path." : "Enter a folder path.");
      return;
    }

    if (newEntryMode === "file") {
      if (normalizedPath.endsWith("/")) {
        setNewEntryError("File paths need a file name.");
        return;
      }

      if (files.some(file => file.path === normalizedPath)) {
        setNewEntryError("A file already exists at that path.");
        return;
      }

      const nextFile = { path: normalizedPath, content: getStarterContent(normalizedPath) };
      onFilesChange([...files, nextFile]);
      selectFile(normalizedPath);
      openParentFolders(normalizedPath);
      cancelNewEntry();
      return;
    }

    const folderPath = normalizedPath.replace(/\/+$/, "");
    const alreadyHasChildren = files.some(file => file.path === folderPath || file.path.startsWith(`${folderPath}/`));
    if (alreadyHasChildren) {
      openParentFolders(`${folderPath}/placeholder`);
      setCollapsedPaths(prev => {
        const next = new Set(prev);
        next.delete(folderPath);
        return next;
      });
      cancelNewEntry();
      return;
    }

    const placeholderPath = `${folderPath}/.gitkeep`;
    onFilesChange([...files, { path: placeholderPath, content: "" }]);
    openParentFolders(placeholderPath);
    cancelNewEntry();
  };

  const updateActiveFile = (content: string) => {
    if (!activeFile) return;
    onFilesChange(files.map(file => file.path === activeFile.path ? { ...file, content } : file));
  };

  const copyActiveFilePath = () => {
    if (!activeFile) return;
    void navigator.clipboard?.writeText(activeFile.path);
    setCopiedPath(true);
    window.setTimeout(() => setCopiedPath(false), 1200);
  };

  const closeEditorTab = (path: string) => {
    setOpenPaths(prev => {
      const next = prev.filter(openPath => openPath !== path);

      if (path === activeFile?.path) {
        const closedIndex = prev.indexOf(path);
        const nextActivePath = next[Math.min(closedIndex, next.length - 1)] ?? next[0] ?? null;
        onActivePathChange(nextActivePath);
      }

      return next;
    });
  };

  useEffect(() => {
    if (visibleFiles.length === 0) {
      setOpenPaths([]);
      if (activePath) onActivePathChange(null);
      return;
    }

    const validPaths = new Set(visibleFiles.map(file => file.path));
    const nextActivePath = activePath && validPaths.has(activePath) ? activePath : visibleFiles[0].path;

    if (nextActivePath !== activePath) {
      onActivePathChange(nextActivePath);
    }

    setOpenPaths(prev => {
      const kept = prev.filter(path => validPaths.has(path));
      return kept.includes(nextActivePath) ? kept : [...kept, nextActivePath];
    });
  }, [activePath, visibleFiles, onActivePathChange]);

  useEffect(() => {
    if (!contextMenu) return;

    const closeContextMenu = () => setContextMenu(null);
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeContextMenu();
    };

    window.addEventListener("click", closeContextMenu);
    window.addEventListener("keydown", closeOnEscape);

    return () => {
      window.removeEventListener("click", closeContextMenu);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [contextMenu]);

  useEffect(() => {
    const pendingTarget = pendingNavigationRef.current;
    if (!pendingTarget || activeFile?.path !== pendingTarget.path) return;
    revealEditorPosition(pendingTarget);
    pendingNavigationRef.current = null;
  }, [activeFile?.path, revealEditorPosition]);

  return (
    <div className="file-workspace">
      <aside className="file-explorer">
        <div className="file-explorer-header">
          <div>
            <div className="workspace-section-title">Explorer</div>
            <div className="file-explorer-subtitle">
              {filteredFileCount} / {visibleFiles.length} file{visibleFiles.length === 1 ? "" : "s"}
            </div>
          </div>
          <div className="file-explorer-actions">
            <button className="file-action-btn file-action-btn--icon" onClick={() => startNewEntry("file")} title="New file">
              +
            </button>
            <button className="file-action-btn file-action-btn--icon" onClick={() => startNewEntry("folder")} title="New folder">
              /
            </button>
            <button className="file-explorer-clear" onClick={() => setFileSearch("")} disabled={!fileSearch}>
              Clear
            </button>
          </div>
        </div>
        {newEntryMode && (
          <div className="file-create-box">
            <div className="file-create-title">{newEntryMode === "file" ? "New File" : "New Folder"}</div>
            <div className="file-create-row">
              <input
                className="input file-create-input"
                value={newEntryPath}
                onChange={(e) => {
                  setNewEntryPath(e.target.value);
                  setNewEntryError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") createWorkspaceEntry();
                  if (e.key === "Escape") cancelNewEntry();
                }}
                placeholder={newEntryMode === "file" ? "src/main/java/App.java" : "src/main/resources"}
                autoFocus
              />
              <button className="file-action-btn" onClick={createWorkspaceEntry}>Create</button>
              <button className="file-action-btn" onClick={cancelNewEntry}>Cancel</button>
            </div>
            {newEntryError && <div className="file-create-error">{newEntryError}</div>}
          </div>
        )}
        <input
          className="input file-search-input"
          value={fileSearch}
          onChange={(e) => setFileSearch(e.target.value)}
          placeholder="Find files by path"
        />
        <div className="file-tree-scroll" onContextMenu={(event) => openContextMenu(event)}>
          {treeFiles.length > 0 ? (
            hasTreeMatches ? (
              <FileTree
                node={fileTree}
                activePath={activeFile?.path ?? null}
                onSelect={selectFile}
                collapsedPaths={collapsedPaths}
                onToggleFolder={toggleFolder}
                onContextMenu={openContextMenu}
                filter={fileSearch}
              />
            ) : (
              <div className="workspace-empty">No files match that search.</div>
            )
          ) : (
            <div className="workspace-empty">No generated files yet.</div>
          )}
        </div>
        {contextMenu && (
          <div
            className="file-context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onMouseDown={(event) => event.stopPropagation()}
            role="menu"
          >
            <div className="file-context-menu-title">{contextMenu.label}</div>
            <button className="file-context-menu-item" onClick={() => startNewEntry("file", contextMenu.basePath)}>
              <span className="file-context-menu-icon file-context-menu-icon--file" />
              New File
            </button>
            <button className="file-context-menu-item" onClick={() => startNewEntry("folder", contextMenu.basePath)}>
              <span className="file-context-menu-icon file-context-menu-icon--folder" />
              New Folder
            </button>
          </div>
        )}
      </aside>

      <section className="workspace-editor">
        {activeFile ? (
          <>
            <div className="workspace-editor-bar">
              <div className="workspace-file-heading">
                <span className="workspace-file-name">{basename(activeFile.path)}</span>
                <span className="workspace-file-folder">{getFolderName(activeFile.path)}</span>
              </div>
              <div className="workspace-file-actions">
                <span className="workspace-file-meta">{getLanguageLabel(activeFile.path)} · {activeFileLines} lines</span>
                <button className="file-action-btn" onClick={onBuildProject} disabled={!onBuildProject || runnerBusy}>
                  {runnerBusy ? "Starting..." : "Build"}
                </button>
                <button className="file-action-btn file-action-btn--run" onClick={onRunProject} disabled={!onRunProject || runnerBusy}>
                  Run
                </button>
                <button className="file-action-btn" onClick={copyActiveFilePath}>
                  {copiedPath ? "Copied" : "Path"}
                </button>
              </div>
            </div>
            <div className="editor-tabs" role="tablist" aria-label="Open files">
              {openPaths.map(path => (
                <button
                  key={path}
                  className={`editor-tab ${path === activeFile.path ? "active" : ""}`}
                  onClick={() => onActivePathChange(path)}
                  title={path}
                  role="tab"
                  aria-selected={path === activeFile.path}
                >
                  <span className="editor-tab-file-icon">{getFileExtension(path)}</span>
                  <span className="editor-tab-name">{basename(path)}</span>
                  <span
                    className="editor-tab-close"
                    onClick={(e) => {
                      e.stopPropagation();
                      closeEditorTab(path);
                    }}
                    role="button"
                    aria-label={`Close ${path}`}
                    title="Close"
                  >
                    x
                  </span>
                </button>
              ))}
            </div>
            <div className="workspace-file-path">{activeFile.path}</div>
            <div className="workspace-code-editor">
              <Editor
                path={activeFile.path}
                value={activeFile.content}
                language={getLanguage(activeFile.path)}
                theme={editorTheme === "dark" ? "vs-dark" : "light"}
                onMount={handleEditorMount}
                onChange={(value) => updateActiveFile(value ?? "")}
                options={{
                  automaticLayout: true,
                  fontFamily: editorSettings.fontFamily,
                  fontSize: editorSettings.fontSize,
                  lineHeight: editorSettings.lineHeight,
                  minimap: { enabled: editorSettings.minimap },
                  scrollBeyondLastLine: false,
                  tabSize: editorSettings.tabSize,
                  wordWrap: editorSettings.wordWrap,
                  lineNumbers: editorSettings.lineNumbers,
                  renderWhitespace: editorSettings.renderWhitespace,
                  formatOnPaste: editorSettings.formatOnPaste,
                  formatOnType: editorSettings.formatOnType,
                  smoothScrolling: editorSettings.smoothScrolling,
                  cursorStyle: editorSettings.cursorStyle,
                }}
              />
            </div>
          </>
        ) : (
          <div className="workspace-empty workspace-empty-fill">
            Generate a project from Prompt + AI to open files here.
          </div>
        )}
      </section>
    </div>
  );
}
