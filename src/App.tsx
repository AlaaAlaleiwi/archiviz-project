import {
  useState,
  useRef,
  useCallback,
  useMemo,
  useEffect,
  type ChangeEvent,
  type DragEvent as ReactDragEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import "./styles.css";
import { saveAs } from "file-saver";
import { invoke } from "@tauri-apps/api/core";

import Palette from "./components/Palette";
import Canvas from "./components/Canvas";
import CodePanel from "./components/CodePanel";
import FileWorkspace, { type WorkspaceFile, type WorkspaceFileGroup } from "./components/FileWorkspace";
import ApiTester from "./components/ApiTester";
import Topbar, { ProjectConfigModal, type JavaProjectConfig } from "./components/Topbar";
import Settings, {
  DEFAULT_DOCKER_SETTINGS,
  DEFAULT_EDITOR_SETTINGS,
  DEFAULT_GIT_SETTINGS,
  DEFAULT_TERMINAL_SETTINGS,
  type AISettings,
  type AppTheme,
  type DockerSettings,
  type EditorSettings,
  type GitSettings,
  type TerminalSettings,
} from "./components/Settings";
import NodeConfigModal from "./components/NodeConfigModal";
import NodeCodeModal from "./components/NodeCodeModal";
import ChatPanel from "./components/ChatPanel";
import TerminalDock from "./components/TerminalDock";

import type { Graph, NodeType, Camera, Language, NodeData, Edge, JavaVersion, SpringBootVersion, BuildTool } from "./types";

import { AIService } from "./services/AIService";
import { ProjectImportService } from "./services/ProjectImportService";
import { ZipService } from "./services/ZipService";
import { ProjectScaffoldService } from "./services/ProjectScaffoldService";

import { buildAIPrompt, buildServiceGenerationPrompts } from "./utils/promptBuilder";
import { analyzeSourceFile } from "./utils/fileAnalysis";

const genId = () => Math.random().toString(36).slice(2, 10);

type WireState = {
  from: string;
  fromSide: Edge["fromSide"];
  x1: number;
  y1: number;
  x2: number;
  y2: number;
} | null;

type DragState = {
  nodeId: string;
  offsetX: number;
  offsetY: number;
} | null;

type PanState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
} | null;

type GenerationProgress = {
  serviceName: string;
  currentFile: string;
  completedFiles: number;
  totalServices: number;
  currentServiceIndex: number;
  streamPreview: string;
} | null;

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.4;
const ZOOM_STEP = 1.14;
const RECENT_PROJECTS_KEY = "archiviz_recent_projects";
const RECENT_PROJECT_SNAPSHOT_PREFIX = "archiviz_recent_project_snapshot_";
const MAX_RECENT_PROJECTS = 6;
const AUTOSAVE_PROJECT_KEY = "archiviz_project_autosave";
const AUTOSAVE_DEBOUNCE_MS = 900;
const WINDOW_LAUNCH_PROJECT_PREFIX = "archiviz_window_launch_";
const EDITOR_SETTINGS_KEY    = "archiviz_editor_settings";
const DOCKER_SETTINGS_KEY    = "archiviz_docker_settings";
const GIT_SETTINGS_KEY       = "archiviz_git_settings";
const TERMINAL_SETTINGS_KEY  = "archiviz_terminal_settings";
const PALETTE_WIDTH_KEY      = "archiviz_palette_width";
const CODE_PANEL_WIDTH_KEY   = "archiviz_code_panel_width";
const NODE_DRAG_MIME         = "application/x-archiviz-node";
const NODE_DRAG_TEXT_PREFIX  = "archiviz-node:";

const dedupeFiles = (files: WorkspaceFile[]) => {
  const fileMap = new Map<string, string>();
  for (const file of files) fileMap.set(file.path, file.content);
  return Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }));
};

const parseStreamingFiles = (raw: string, includeCurrentFile: boolean) => {
  const cleaned = raw.replace(/```[a-z]*\r?\n?/gi, "").replace(/```\r?\n?/g, "");
  const markerRegex = /^=== FILE:\s*(.+?)\s*===\s*$/gm;
  const matches = Array.from(cleaned.matchAll(markerRegex));
  const files: WorkspaceFile[] = [];

  matches.forEach((match, index) => {
    const isCurrent = index === matches.length - 1;
    if (isCurrent && !includeCurrentFile) return;

    const path = match[1]?.trim();
    const contentStart = (match.index ?? 0) + match[0].length;
    const contentEnd = matches[index + 1]?.index ?? cleaned.length;
    const content = cleaned.slice(contentStart, contentEnd).trim();
    if (path && content) files.push({ path, content });
  });

  return {
    files,
    currentPath: matches.at(-1)?.[1]?.trim() ?? "",
  };
};

const clamp = (value: number, min: number, max: number) => Math.min(Math.max(value, min), max);

const loadNumberSetting = (key: string, fallback: number, min: number, max: number) => {
  const value = Number(localStorage.getItem(key));
  return Number.isFinite(value) ? clamp(value, min, max) : fallback;
};

const getWindowLaunchProjectKey = (token: string) => `${WINDOW_LAUNCH_PROJECT_PREFIX}${token}`;
const getRecentProjectSnapshotKey = (id: string) => `${RECENT_PROJECT_SNAPSHOT_PREFIX}${id}`;

const getDraggedNodeType = (dataTransfer: DataTransfer): NodeType | null => {
  const typedPayload = dataTransfer.getData(NODE_DRAG_MIME).trim();
  if (typedPayload) return typedPayload;

  const textPayload = dataTransfer.getData("text/plain").trim();
  if (textPayload.startsWith(NODE_DRAG_TEXT_PREFIX)) {
    const type = textPayload.slice(NODE_DRAG_TEXT_PREFIX.length).trim();
    return type || null;
  }

  const legacyPayload = dataTransfer.getData("type").trim();
  return legacyPayload || null;
};

const normalizePathKey = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, "");
const toRepoSlug = (value: string) =>
  value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "service";

const GENERIC_SERVICE_ALIAS_KEYS = new Set([
  "service",
  "services",
  "app",
  "application",
  "api",
  "backend",
  "frontend",
  "project",
  "module",
  "system",
  "server",
  "client",
  "database",
  "repo",
]);

const toServiceProjectRoot = (projectName: string, serviceName: string) =>
  `${toRepoSlug(projectName || "architecture-app")}-${toRepoSlug(serviceName)}`;

const getNodeServiceRoot = (projectName: string, node: NodeData) =>
  typeof node.config?.serviceRoot === "string" && node.config.serviceRoot.trim()
    ? node.config.serviceRoot
    : toServiceProjectRoot(projectName, node.name);

const stripServiceProjectRoot = (files: WorkspaceFile[], serviceRoot: string) =>
  files.map(file => {
    const prefix = `${serviceRoot}/`;
    return file.path.startsWith(prefix)
      ? { ...file, path: file.path.slice(prefix.length) }
      : file;
  });

const languageToNodeType = (language: Language, framework: string): NodeType => {
  const f = framework.toLowerCase();
  if (["React", "Next.js", "Vue", "Angular"].some(name => f.includes(name.toLowerCase()))) return "frontend_app";
  if (f.includes("spring") || f.includes("quarkus")) return "microservice";
  if (f.includes("fastapi") || f.includes("django") || f.includes("flask")) return "api";
  if (f.includes("express") || f.includes("nest")) return "api";
  if (language === "java" || language === "python" || language === "go" || language === "csharp") return "microservice";
  if (language === "typescript" || language === "javascript") return "frontend_app";
  return "module";
};

const nodeFileCandidates = (node: NodeData) => {
  const name = normalizePathKey(node.name);
  const type = normalizePathKey(node.type);
  return [...new Set([name, type].filter(key => key.length >= 3))];
};

const isNodeSourceFile = (path: string) => {
  const lower = path.toLowerCase();
  return (
    lower.includes("/src/main/") ||
    lower.includes("/src/test/") ||
    lower.includes("/db/migration/") ||
    /\.(java|kt|ts|tsx|js|jsx|py|go|cs|sql)$/.test(lower)
  );
};

const getWorkspaceFilesForNode = (node: NodeData, files: WorkspaceFile[]) => {
  // Nodes imported from real projects carry an explicit file list in config
  if (Array.isArray(node.config?.sourceFiles) && (node.config.sourceFiles as string[]).length > 0) {
    const paths = new Set(node.config.sourceFiles as string[]);
    return files.filter(f => paths.has(f.path));
  }

  const candidates = nodeFileCandidates(node);
  if (candidates.length === 0) return [];

  return files.filter(file => {
    if (!isNodeSourceFile(file.path)) return false;
    const normalizedPath = normalizePathKey(file.path);
    return candidates.some(candidate => normalizedPath.includes(candidate));
  });
};

const buildServiceAliases = (projectName: string, node: NodeData, serviceRoot: string) => {
  const projectSlug = toRepoSlug(projectName || "architecture-app");
  const rawValues = [
    node.name,
    serviceRoot,
    typeof node.config?.importedProjectName === "string" ? node.config.importedProjectName : "",
    serviceRoot.startsWith(`${projectSlug}-`) ? serviceRoot.slice(projectSlug.length + 1) : serviceRoot,
  ];

  const aliases = new Set<string>();
  for (const raw of rawValues) {
    const trimmed = raw.trim().toLowerCase();
    if (!trimmed) continue;

    const parts = trimmed.split(/[^a-z0-9]+/).filter(Boolean);
    if (parts.length === 0) continue;

    const variants = [
      parts.join("-"),
      parts.join("_"),
      parts.join(""),
      parts.join("."),
    ];

    for (const variant of variants) {
      const key = variant.replace(/[^a-z0-9]+/g, "");
      if (variant.length < 4 || GENERIC_SERVICE_ALIAS_KEYS.has(key)) continue;
      aliases.add(variant);
    }
  }

  return [...aliases];
};

const extractServiceReference = (content: string, aliases: string[]) => {
  const normalized = content.toLowerCase();
  for (const alias of aliases) {
    const patterns = [
      /@feignclient\s*\(([^)]*)\)/i,
      /(?:https?|wss?|lb|grpc):\/\/[^\s"'`)]*/i,
      /["'`](?:https?|wss?|lb|grpc):\/\/[^"'`\s)]*["'`]/i,
      /["'`][^"'`\n]{0,160}(?:\/api\/[^"'`\n]*)?["'`]/i,
    ];

    for (const pattern of patterns) {
      const match = normalized.match(pattern);
      const value = match?.[0] ?? "";
      if (!value.includes(alias)) continue;

      if (pattern.source.includes("@feignclient")) {
        return `feign:${alias}`;
      }

      return value.replace(/^["'`]|["'`]$/g, "").slice(0, 72);
    }
  }

  return null;
};

const detectServiceCallEdges = ({
  nodes,
  edges,
  files,
  projectName,
}: {
  nodes: NodeData[];
  edges: Edge[];
  files: WorkspaceFile[];
  projectName: string;
}) => {
  const existingPairs = new Set(edges.map(edge => `${edge.from}:${edge.to}`));
  const serviceRoots = new Map<string, { node: NodeData; root: string; aliases: string[] }>();

  for (const node of nodes) {
    const root = getNodeServiceRoot(projectName, node);
    if (!root) continue;
    if (serviceRoots.has(root)) continue;
    serviceRoots.set(root, {
      node,
      root,
      aliases: buildServiceAliases(projectName, node, root),
    });
  }

  const services = [...serviceRoots.values()];
  const rootedFiles = new Map(
    services.map(service => [
      service.root,
      files.filter(file => file.path.startsWith(`${service.root}/`) && !isHiddenWorkspacePlaceholder(file.path)),
    ]),
  );

  const detectedEdges: Edge[] = [];

  for (const source of services) {
    const sourceFiles = rootedFiles.get(source.root) ?? [];
    if (sourceFiles.length === 0) continue;

    for (const target of services) {
      if (source.node.id === target.node.id || target.aliases.length === 0) continue;

      const pairKey = `${source.node.id}:${target.node.id}`;
      if (existingPairs.has(pairKey)) continue;

      const matchedReference = sourceFiles
        .map(file => extractServiceReference(file.content, target.aliases))
        .find((value): value is string => Boolean(value));
      if (!matchedReference) continue;

      existingPairs.add(pairKey);
      detectedEdges.push({
        id: `svc-auto:${source.node.id}:${target.node.id}`,
        from: source.node.id,
        to: target.node.id,
        fromSide: "right",
        toSide: "left",
        label: matchedReference,
      });
    }
  }

  return detectedEdges;
};

const isSharedProjectFile = (path: string) => {
  const lower = path.toLowerCase();
  return (
    !lower.includes("/src/main/java/") &&
    !lower.includes("/src/test/java/") &&
    !lower.includes("/db/migration/")
  ) || /(^|\/)(application|bootstrap)\.(ya?ml|properties)$/.test(lower);
};

const isHiddenWorkspacePlaceholder = (path: string) => path.split("/").pop() === ".gitkeep";

const hasWorkspaceFile = (files: WorkspaceFile[], path: string) => files.some(file => file.path === path);

type BuildDiagnostic = {
  path: string;
  lineNumber?: number;
  column?: number;
  message: string;
};

const CODE_AGENT_CONTEXT_LIMIT = 100_000;
const CODE_AGENT_FILE_LIMIT = 18_000;

const getProjectCommandParts = (mode: "build" | "run", buildTool: BuildTool, files: WorkspaceFile[]) => {
  if (buildTool === "gradle") {
    const program = hasWorkspaceFile(files, "gradlew")
      ? "./gradlew"
      : hasWorkspaceFile(files, "gradlew.bat")
        ? "gradlew.bat"
        : "gradle";
    return {
      program,
      args: mode === "build" ? ["build", "-x", "test"] : ["bootRun"],
    };
  }

  const program = hasWorkspaceFile(files, "mvnw")
    ? "./mvnw"
    : hasWorkspaceFile(files, "mvnw.cmd")
      ? "mvnw.cmd"
      : "mvn";
  return {
    program,
    args: mode === "build" ? ["clean", "package", "-DskipTests"] : ["spring-boot:run"],
  };
};

const formatCommandLine = ({ program, args }: { program: string; args: string[] }) => [program, ...args].join(" ");

const parseBuildDiagnostics = (output: string, files: WorkspaceFile[]): BuildDiagnostic[] => {
  const normalizedOutput = output.replace(/\\/g, "/");
  const lines = normalizedOutput.split(/\r?\n/);
  const sourceFiles = files
    .filter(file => !isHiddenWorkspacePlaceholder(file.path))
    .map(file => ({
      path: file.path.replace(/\\/g, "/").replace(/^\/+/, ""),
    }));
  const diagnostics = new Map<string, BuildDiagnostic>();
  const errorLinePattern = /\b(error|failed|failure|exception|cannot find symbol|compilation failure)\b/i;
  const sourcePathPattern = /\.(java|kt|xml|properties|ya?ml|gradle|kts|json)\b/i;

  for (const line of lines) {
    if (!errorLinePattern.test(line) && !sourcePathPattern.test(line)) continue;

    for (const file of sourceFiles) {
      const fileIndex = line.includes(file.path) ? line.indexOf(file.path) : line.indexOf(`/${file.path}`);
      if (fileIndex < 0) continue;

      const afterPath = line.slice(fileIndex + file.path.length);
      const bracketLocation = afterPath.match(/\[(\d+)(?:,(\d+))?\]/);
      const colonLocation = afterPath.match(/:(\d+)(?::(\d+))?(?::|\s)/);
      const location = bracketLocation ?? colonLocation;
      const lineNumber = location?.[1] ? Number(location[1]) : undefined;
      const column = location?.[2] ? Number(location[2]) : undefined;
      const message = line
        .replace(/^\[[A-Z]+\]\s*/, "")
        .replace(/^>\s*/, "")
        .trim() || "Build error";

      diagnostics.set(`${file.path}:${lineNumber ?? 0}:${column ?? 0}`, {
        path: file.path,
        lineNumber,
        column,
        message,
      });
    }
  }

  if (diagnostics.size === 0 && errorLinePattern.test(normalizedOutput)) {
    for (const file of sourceFiles) {
      if (normalizedOutput.includes(file.path) || normalizedOutput.includes(`/${file.path}`)) {
        diagnostics.set(file.path, {
          path: file.path,
          lineNumber: 1,
          column: 1,
          message: "Build error",
        });
      }
    }
  }

  return Array.from(diagnostics.values());
};

const buildCodeAgentPrompt = ({
  projectName,
  buildTool,
  javaVersion,
  springBootVersion,
  files,
  diagnostics,
}: {
  projectName: string;
  buildTool: BuildTool;
  javaVersion: JavaVersion;
  springBootVersion: SpringBootVersion;
  files: WorkspaceFile[];
  diagnostics: BuildDiagnostic[];
}) => {
  const diagnosticPaths = new Set(diagnostics.map(diagnostic => diagnostic.path));
  const sortedFiles = [...files]
    .filter(file => !isHiddenWorkspacePlaceholder(file.path) && !file.path.startsWith(".git/"))
    .sort((a, b) => {
      const aHasError = diagnosticPaths.has(a.path);
      const bHasError = diagnosticPaths.has(b.path);
      if (aHasError !== bHasError) return aHasError ? -1 : 1;
      return a.path.localeCompare(b.path);
    });

  let remaining = CODE_AGENT_CONTEXT_LIMIT;
  const includedFiles: string[] = [];
  const omittedFiles: string[] = [];

  for (const file of sortedFiles) {
    const content = file.content.length > CODE_AGENT_FILE_LIMIT
      ? `${file.content.slice(0, CODE_AGENT_FILE_LIMIT)}\n\n/* File truncated for AI review. */`
      : file.content;
    const block = `=== FILE: ${file.path} ===\n${content}`;

    if (block.length > remaining) {
      omittedFiles.push(file.path);
      continue;
    }

    includedFiles.push(block);
    remaining -= block.length;
  }

  const buildErrors = diagnostics.length > 0
    ? diagnostics.map(diagnostic => {
        const location = diagnostic.lineNumber
          ? `:${diagnostic.lineNumber}${diagnostic.column ? `:${diagnostic.column}` : ""}`
          : "";
        return `- ${diagnostic.path}${location} ${diagnostic.message}`;
      }).join("\n")
    : "No build diagnostics captured yet.";

  return [
    "You are an AI code fix agent inside an architecture IDE.",
    "Review this Java/Spring Boot project and propose concrete fixes. Do not invent files that are not needed.",
    "Prioritize build errors, missing imports, invalid annotations, broken configuration, security mistakes, and runtime wiring issues.",
    "Return Markdown with these sections only: Findings, Proposed Fixes, Patch Plan, Verification.",
    "For each finding, include the file path and line when available. Keep proposed code snippets focused.",
    "",
    `Project: ${projectName || "architecture-app"}`,
    `Build tool: ${buildTool}`,
    `Java: ${javaVersion}`,
    `Spring Boot: ${springBootVersion}`,
    "",
    "Current build diagnostics:",
    buildErrors,
    "",
    omittedFiles.length > 0 ? `Omitted because of context limit: ${omittedFiles.join(", ")}` : "All available files are included.",
    "",
    includedFiles.join("\n\n"),
  ].join("\n");
};

type SavedProjectFile = {
  version: 1;
  savedAt: string;
  projectName: string;
  javaVersion: JavaVersion;
  springBootVersion: SpringBootVersion;
  buildTool: BuildTool;
  prompt: string;
  graph: Graph;
  nodeCode?: Record<string, WorkspaceFile[]>;
  workspaceFiles?: WorkspaceFile[];
  dockerSettings?: DockerSettings;
};

type RecentProject = {
  id: string;
  name: string;
  openedAt: string;
  path?: string;
  fileName?: string;
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

type WorkspaceMaterializeResult = {
  cwd: string;
  displayPath: string;
};

type WorkspaceCommandResult = {
  ok: boolean;
  code: number;
  stdout: string;
  stderr: string;
  command: string;
  cwd: string;
  displayPath: string;
};

type AutoSaveStatus = "idle" | "saving" | "saved" | "error";

const toRecentProjectId = (project: { name: string; path?: string; fileName?: string }) =>
  project.path || project.fileName || project.name;

const persistRecentProjectSnapshot = (id: string, project: SavedProjectFile) => {
  try {
    localStorage.setItem(getRecentProjectSnapshotKey(id), JSON.stringify(project));
  } catch (error) {
    console.warn("[recent-project-snapshot]", error);
  }
};

const loadRecentProjectSnapshot = (id: string): Partial<SavedProjectFile> | null => {
  try {
    const saved = localStorage.getItem(getRecentProjectSnapshotKey(id));
    return saved ? JSON.parse(saved) as Partial<SavedProjectFile> : null;
  } catch {
    return null;
  }
};

const removeRecentProjectSnapshots = (ids: string[]) => {
  ids.forEach(id => localStorage.removeItem(getRecentProjectSnapshotKey(id)));
};

const isSavedProjectFile = (parsed: Partial<SavedProjectFile>): parsed is SavedProjectFile => (
  parsed.version === 1 &&
  !!parsed.graph &&
  Array.isArray(parsed.graph.nodes) &&
  Array.isArray(parsed.graph.edges) &&
  typeof parsed.projectName === "string" &&
  typeof parsed.javaVersion === "string" &&
  typeof parsed.springBootVersion === "string" &&
  typeof parsed.buildTool === "string" &&
  typeof parsed.prompt === "string"
);

const getProjectSignature = (project: SavedProjectFile) => {
  const { savedAt: _savedAt, ...snapshot } = project;
  return JSON.stringify(snapshot);
};

const loadAutosavedProject = (): SavedProjectFile | null => {
  try {
    const saved = localStorage.getItem(AUTOSAVE_PROJECT_KEY);
    if (!saved) return null;
    const parsed = JSON.parse(saved) as Partial<SavedProjectFile>;
    return isSavedProjectFile(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const loadRecentProjects = (): RecentProject[] => {
  try {
    const saved = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(item =>
      item &&
      typeof item.id === "string" &&
      typeof item.name === "string" &&
      typeof item.openedAt === "string"
    ).slice(0, MAX_RECENT_PROJECTS);
  } catch {
    return [];
  }
};

const loadEditorSettings = (): EditorSettings => {
  try {
    const saved = localStorage.getItem(EDITOR_SETTINGS_KEY);
    if (!saved) return DEFAULT_EDITOR_SETTINGS;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return DEFAULT_EDITOR_SETTINGS;
    return {
      ...DEFAULT_EDITOR_SETTINGS,
      ...parsed,
      theme: parsed.theme === "light" ? "light" : "dark",
      fontSize: Number(parsed.fontSize) || DEFAULT_EDITOR_SETTINGS.fontSize,
      lineHeight: Number(parsed.lineHeight) || DEFAULT_EDITOR_SETTINGS.lineHeight,
      tabSize: Number(parsed.tabSize) || DEFAULT_EDITOR_SETTINGS.tabSize,
      wordWrap: parsed.wordWrap === "on" ? "on" : "off",
      lineNumbers: parsed.lineNumbers === "off" || parsed.lineNumbers === "relative" ? parsed.lineNumbers : "on",
      renderWhitespace: parsed.renderWhitespace === "none" || parsed.renderWhitespace === "all" ? parsed.renderWhitespace : "selection",
      cursorStyle: parsed.cursorStyle === "block" || parsed.cursorStyle === "underline" ? parsed.cursorStyle : "line",
      minimap: Boolean(parsed.minimap),
      formatOnPaste: parsed.formatOnPaste !== false,
      formatOnType: parsed.formatOnType !== false,
      smoothScrolling: parsed.smoothScrolling !== false,
    };
  } catch {
    return DEFAULT_EDITOR_SETTINGS;
  }
};

const toSafePort = (value: unknown, fallback: number) => {
  const port = Number(value);
  return Number.isFinite(port) && port > 0 && port <= 65535 ? port : fallback;
};

const loadDockerSettings = (): DockerSettings => {
  try {
    const saved = localStorage.getItem(DOCKER_SETTINGS_KEY);
    if (!saved) return DEFAULT_DOCKER_SETTINGS;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return DEFAULT_DOCKER_SETTINGS;
    return {
      ...DEFAULT_DOCKER_SETTINGS,
      ...parsed,
      enabled: parsed.enabled !== false,
      composeEnabled: parsed.composeEnabled !== false,
      includePostgres: parsed.includePostgres !== false,
      includeRedis: parsed.includeRedis !== false,
      imageName: typeof parsed.imageName === "string" ? parsed.imageName : DEFAULT_DOCKER_SETTINGS.imageName,
      imageTag: typeof parsed.imageTag === "string" && parsed.imageTag.trim() ? parsed.imageTag : DEFAULT_DOCKER_SETTINGS.imageTag,
      appPort: toSafePort(parsed.appPort, DEFAULT_DOCKER_SETTINGS.appPort),
      containerPort: toSafePort(parsed.containerPort, DEFAULT_DOCKER_SETTINGS.containerPort),
      postgresPort: toSafePort(parsed.postgresPort, DEFAULT_DOCKER_SETTINGS.postgresPort),
      redisPort: toSafePort(parsed.redisPort, DEFAULT_DOCKER_SETTINGS.redisPort),
      maxRamPercentage: Number(parsed.maxRamPercentage) || DEFAULT_DOCKER_SETTINGS.maxRamPercentage,
      healthcheckEnabled: parsed.healthcheckEnabled !== false,
    };
  } catch {
    return DEFAULT_DOCKER_SETTINGS;
  }
};

const loadTerminalSettings = (): TerminalSettings => {
  try {
    const saved = localStorage.getItem(TERMINAL_SETTINGS_KEY);
    if (!saved) return DEFAULT_TERMINAL_SETTINGS;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return DEFAULT_TERMINAL_SETTINGS;
    return {
      ...DEFAULT_TERMINAL_SETTINGS,
      ...parsed,
      shell: typeof parsed.shell === "string" ? parsed.shell : DEFAULT_TERMINAL_SETTINGS.shell,
      fontSize: Number(parsed.fontSize) || DEFAULT_TERMINAL_SETTINGS.fontSize,
      fontFamily: typeof parsed.fontFamily === "string" && parsed.fontFamily.trim() ? parsed.fontFamily : DEFAULT_TERMINAL_SETTINGS.fontFamily,
      cursorStyle: ["bar", "block", "underline"].includes(parsed.cursorStyle) ? parsed.cursorStyle : DEFAULT_TERMINAL_SETTINGS.cursorStyle,
      cursorBlink: parsed.cursorBlink !== false,
    };
  } catch {
    return DEFAULT_TERMINAL_SETTINGS;
  }
};

const loadGitSettings = (): GitSettings => {
  try {
    const saved = localStorage.getItem(GIT_SETTINGS_KEY);
    if (!saved) return DEFAULT_GIT_SETTINGS;
    const parsed = JSON.parse(saved);
    if (!parsed || typeof parsed !== "object") return DEFAULT_GIT_SETTINGS;
    return {
      githubToken: typeof parsed.githubToken === "string" ? parsed.githubToken : "",
      githubUser: parsed.githubUser && typeof parsed.githubUser.login === "string" ? parsed.githubUser : null,
    };
  } catch {
    return DEFAULT_GIT_SETTINGS;
  }
};

export default function App() {
  /* =======================
     STATE
  ======================= */

  const [theme, setTheme] = useState<AppTheme>(() => {
    const saved = localStorage.getItem("archiviz_theme");
    return saved === "black" || saved === "red" || saved === "purple" || saved === "green" || saved === "blue" || saved === "glass"
      ? saved
      : "glass";
  });
  const [colorScheme, setColorScheme] = useState<"dark" | "light">(() => {
    const saved = localStorage.getItem("archiviz_color_scheme");
    return saved === "light" ? "light" : "dark";
  });
  const [settings, setSettings] = useState<AISettings | null>(() => {
    try {
      const saved = localStorage.getItem("ai_settings");
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === "object" && parsed.provider && parsed.model) {
          return parsed as AISettings;
        }
      }
    } catch { /* ignore */ }
    return null;
  });
  const [editorSettings, setEditorSettings] = useState<EditorSettings>(loadEditorSettings);
  const [terminalSettings, setTerminalSettings] = useState<TerminalSettings>(loadTerminalSettings);
  const [dockerSettings, setDockerSettings] = useState<DockerSettings>(loadDockerSettings);
  const [gitSettings, setGitSettings] = useState<GitSettings>(loadGitSettings);
  const [paletteWidth, setPaletteWidth] = useState(() => loadNumberSetting(PALETTE_WIDTH_KEY, 286, 220, 460));
  const [codePanelWidth, setCodePanelWidth] = useState(() => loadNumberSetting(CODE_PANEL_WIDTH_KEY, 380, 300, 560));

  const [language, setLanguage] = useState<Language>("java");
  const [detectedFramework, setDetectedFramework] = useState("Spring Boot");
  const [javaVersion, setJavaVersion] = useState<JavaVersion>("21");
  const [springBootVersion, setSpringBootVersion] = useState<SpringBootVersion>("3.4");
  const [buildTool, setBuildTool] = useState<BuildTool>("maven");

  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] });

  const [prompt, setPrompt] = useState("");

  const [projectName, setProjectName] = useState("architecture-app");
  const [importingProject, setImportingProject] = useState(false);
  const [projectFileHandle, setProjectFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [activeRecentProjectId, setActiveRecentProjectId] = useState<string | null>(null);
  const [activeProjectStarted, setActiveProjectStarted] = useState(false);
  const [showStartupProjectConfig, setShowStartupProjectConfig] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(loadRecentProjects);
  const [autosavedProject, setAutosavedProject] = useState<SavedProjectFile | null>(loadAutosavedProject);
  const [autoSaveStatus, setAutoSaveStatus] = useState<AutoSaveStatus>("idle");
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<string | null>(autosavedProject?.savedAt ?? null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [wire, setWire] = useState<WireState>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [pan, setPan] = useState<PanState>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showChat, setShowChat] = useState(false);
  const [chatMinimized, setChatMinimized] = useState(false);
  const [chatUnread, setChatUnread] = useState(0);
  const [configuringNodeId, setConfiguringNodeId] = useState<string | null>(null);
  const [viewingNodeId, setViewingNodeId] = useState<string | null>(null);
  const [expandedNodeIds, setExpandedNodeIds] = useState<Set<string>>(new Set());
  const [nodeCode, setNodeCode] = useState<Record<string, { path: string; content: string }[]>>({});
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [workspaceFilesImported, setWorkspaceFilesImported] = useState(false);
  const [activeWorkspacePath, setActiveWorkspacePath] = useState<string | null>(null);
  const [activeWorkspaceGroupId, setActiveWorkspaceGroupId] = useState("all");
  const [buildDiagnostics, setBuildDiagnostics] = useState<BuildDiagnostic[]>([]);
  const [workspaceView, setWorkspaceView] = useState<"canvas" | "editor" | "api" | null>("canvas");
  const [gitRepositoryReady, setGitRepositoryReady] = useState(false);
  const [projectGenerating, setProjectGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<GenerationProgress>(null);
  const [codeAgentRunning, setCodeAgentRunning] = useState(false);
  const [codeAgentOutput, setCodeAgentOutput] = useState("");
  const [runnerBusy] = useState(false);
  const [genError, setGenError] = useState<{ message: string; failedNodes?: string[] } | null>(null);

  const [camera, setCamera] = useState<Camera>({ x: 120, y: 72, scale: 1 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const projectGenerationInFlightRef = useRef(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const folderImportModeRef = useRef<"replace" | "append-service">("replace");
  const projectFileInputRef = useRef<HTMLInputElement>(null);
  const lastSavedSignatureRef = useRef<string>(autosavedProject ? getProjectSignature(autosavedProject) : "");
  const buildOnOpenRef = useRef(false);
  const codeAgentAbortRef = useRef<AbortController | null>(null);

  const toggleWorkspaceView = useCallback((view: "canvas" | "editor" | "api") => {
    setWorkspaceView(current => current === view ? null : view);
  }, []);

  const showTopbar = activeProjectStarted && !viewingNodeId;

  useEffect(() => {
    localStorage.setItem("archiviz_theme", theme);
  }, [theme]);

  useEffect(() => {
    localStorage.setItem("archiviz_color_scheme", colorScheme);
  }, [colorScheme]);

  useEffect(() => {
    localStorage.setItem(EDITOR_SETTINGS_KEY, JSON.stringify(editorSettings));
  }, [editorSettings]);

  useEffect(() => {
    localStorage.setItem(TERMINAL_SETTINGS_KEY, JSON.stringify(terminalSettings));
  }, [terminalSettings]);

  useEffect(() => {
    localStorage.setItem(DOCKER_SETTINGS_KEY, JSON.stringify(dockerSettings));
  }, [dockerSettings]);

  useEffect(() => {
    localStorage.setItem(GIT_SETTINGS_KEY, JSON.stringify(gitSettings));
  }, [gitSettings]);

  useEffect(() => {
    localStorage.setItem(PALETTE_WIDTH_KEY, String(paletteWidth));
  }, [paletteWidth]);

  useEffect(() => {
    localStorage.setItem(CODE_PANEL_WIDTH_KEY, String(codePanelWidth));
  }, [codePanelWidth]);

  const startPaletteResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = paletteWidth;
    document.body.classList.add("resizing-panel", "resizing-panel--x");

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      setPaletteWidth(clamp(startWidth + moveEvent.clientX - startX, 220, 460));
    };
    const onUp = () => {
      document.body.classList.remove("resizing-panel", "resizing-panel--x");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [paletteWidth]);

  const startCodePanelResize = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = codePanelWidth;
    document.body.classList.add("resizing-panel", "resizing-panel--x");

    const onMove = (moveEvent: globalThis.PointerEvent) => {
      setCodePanelWidth(clamp(startWidth + startX - moveEvent.clientX, 300, 560));
    };
    const onUp = () => {
      document.body.classList.remove("resizing-panel", "resizing-panel--x");
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }, [codePanelWidth]);

  /* =======================
     SERVICES (STABLE)
  ======================= */

  const ai = useMemo(() => {
    return settings ? new AIService(settings) : null;
  }, [settings]);

  const zipService = useMemo(() => new ZipService(), []);
  const scaffoldService = useMemo(() => new ProjectScaffoldService(), []);
  const projectImportService = useMemo(() => new ProjectImportService(), []);

  /* =======================
     UTIL
  ======================= */

  const clientToWorld = useCallback(
    (cx: number, cy: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();

      if (!rect) return { x: 0, y: 0 };

      return {
        x: (cx - rect.left - camera.x) / camera.scale,
        y: (cy - rect.top - camera.y) / camera.scale,
      };
    },
    [camera]
  );

  const hasCanvasContent = graph.nodes.length > 0;
  const hasPrompt = prompt.trim().length > 0;
  const hasProjectData = hasCanvasContent || hasPrompt;
  const buildProjectPayload = useCallback((savedAt = new Date().toISOString()): SavedProjectFile => ({
    version: 1,
    savedAt,
    projectName,
    javaVersion,
    springBootVersion,
    buildTool,
    prompt,
    graph,
    nodeCode,
    workspaceFiles,
    dockerSettings,
  }), [buildTool, dockerSettings, graph, javaVersion, nodeCode, projectName, prompt, springBootVersion, workspaceFiles]);
  const projectSignature = useMemo(
    () => getProjectSignature(buildProjectPayload("")),
    [buildProjectPayload]
  );
  const hasUnsavedChanges = activeProjectStarted && projectSignature !== lastSavedSignatureRef.current;
  const autoSaveLabel = autoSaveStatus === "saving"
    ? "Autosaving..."
    : autoSaveStatus === "error"
      ? "Autosave failed"
      : lastAutoSavedAt
        ? `Autosaved ${new Date(lastAutoSavedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`
        : "Autosave ready";

  useEffect(() => {
    if (!activeProjectStarted) return;

    setAutoSaveStatus("saving");
    const timeout = window.setTimeout(async () => {
      const payload = buildProjectPayload();
      const json = JSON.stringify(payload, null, 2);

      try {
        localStorage.setItem(AUTOSAVE_PROJECT_KEY, json);
        setAutosavedProject(payload);
        setLastAutoSavedAt(payload.savedAt);
        if (activeRecentProjectId) {
          persistRecentProjectSnapshot(activeRecentProjectId, payload);
        }

        if (projectFileHandle) {
          const writable = await projectFileHandle.createWritable();
          await writable.write(json);
          await writable.close();
        }

        lastSavedSignatureRef.current = getProjectSignature(payload);
        setAutoSaveStatus("saved");
      } catch (error) {
        console.error("[autosave]", error);
        setAutoSaveStatus("error");
      }
    }, AUTOSAVE_DEBOUNCE_MS);

    return () => window.clearTimeout(timeout);
  }, [activeProjectStarted, activeRecentProjectId, buildProjectPayload, projectFileHandle]);

  /* =======================
     GRAPH ACTIONS
  ======================= */

  const addNode = (type: NodeType, x: number, y: number, name?: string) => {
    setGraph((g) => ({
      ...g,
      nodes: [...g.nodes, { id: genId(), type, name: name ?? type, x, y }],
    }));
  };

  const onDelete = (id: string) => {
    setGraph((g) => ({
      nodes: g.nodes.filter((n) => n.id !== id),
      edges: g.edges.filter((e) => e.from !== id && e.to !== id),
    }));
  };

  const onRename = (id: string, name: string) => {
    setGraph((g) => ({
      ...g,
      nodes: g.nodes.map((n) => (n.id === id ? { ...n, name } : n)),
    }));
  };

  const onDeleteEdge = useCallback((edgeId: string) => {
    setGraph((g) => ({
      ...g,
      edges: g.edges.filter((edge) => edge.id !== edgeId),
    }));
    setSelectedEdgeId((current) => (current === edgeId ? null : current));
  }, []);

  const zoomAtPoint = useCallback(
    (clientX: number, clientY: number, nextScale: number) => {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (!rect) return;

      const clampedScale = Math.min(MAX_SCALE, Math.max(MIN_SCALE, nextScale));

      setCamera((currentCamera) => {
        const pointerX = clientX - rect.left;
        const pointerY = clientY - rect.top;
        const worldX = (pointerX - currentCamera.x) / currentCamera.scale;
        const worldY = (pointerY - currentCamera.y) / currentCamera.scale;

        return {
          x: pointerX - worldX * clampedScale,
          y: pointerY - worldY * clampedScale,
          scale: clampedScale,
        };
      });
    },
    []
  );

  const onNodePointerDown = useCallback(
    (e: ReactPointerEvent, node: NodeData) => {
      e.stopPropagation();
      e.preventDefault();

      const { x, y } = clientToWorld(e.clientX, e.clientY);

      setSelectedIds([node.id]);
      setSelectedEdgeId(null);
      setWire(null);
      setPan(null);
      setDrag({
        nodeId: node.id,
        offsetX: x - node.x,
        offsetY: y - node.y,
      });
    },
    [clientToWorld]
  );

  const startWire = useCallback(
    (id: string, side: Edge["fromSide"], clientX: number, clientY: number) => {
      const { x, y } = clientToWorld(clientX, clientY);

      setSelectedIds([id]);
      setSelectedEdgeId(null);
      setDrag(null);
      setWire({
        from: id,
        fromSide: side,
        x1: x,
        y1: y,
        x2: x,
        y2: y,
      });
    },
    [clientToWorld]
  );

  const movePointerInteraction = useCallback(
    (clientX: number, clientY: number) => {
      const { x, y } = clientToWorld(clientX, clientY);

      if (pan) {
        setCamera({
          x: pan.originX + (clientX - pan.startX),
          y: pan.originY + (clientY - pan.startY),
          scale: camera.scale,
        });
      }

      if (drag) {
        setGraph((g) => ({
          ...g,
          nodes: g.nodes.map((node) =>
            node.id === drag.nodeId
              ? { ...node, x: x - drag.offsetX, y: y - drag.offsetY }
              : node
          ),
        }));
      }

      if (wire) {
        setWire((currentWire) =>
          currentWire
            ? {
                ...currentWire,
                x2: x,
                y2: y,
              }
            : currentWire
        );
      }
    },
    [camera.scale, clientToWorld, drag, pan, wire]
  );

  const endWire = useCallback(
    (id: string, side: Edge["toSide"]) => {
      if (!wire || wire.from === id) {
        setWire(null);
        return;
      }

      setGraph((g) => {
        const alreadyExists = g.edges.some(
          (edge) =>
            edge.from === wire.from &&
            edge.to === id &&
            edge.fromSide === wire.fromSide &&
            edge.toSide === side
        );

        if (alreadyExists) {
          return g;
        }

        return {
          ...g,
          edges: [
            ...g.edges,
            {
              id: genId(),
              from: wire.from,
              to: id,
              fromSide: wire.fromSide,
              toSide: side,
            },
          ],
        };
      });

      setWire(null);
    },
    [wire]
  );

  const completeWireFromPointer = useCallback(
    (clientX: number, clientY: number) => {
      if (!wire) return;

      const target = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
      const port = target?.closest(".port") as HTMLElement | null;
      const nodeId = port?.dataset.nodeId;
      const side = port?.dataset.portSide as Edge["toSide"] | undefined;

      if (!nodeId || !side) {
        setWire(null);
        return;
      }

      endWire(nodeId, side);
    },
    [endWire, wire]
  );

  /* =======================
     DROP
  ======================= */

  const onDrop = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const type = getDraggedNodeType(e.dataTransfer);
    if (!type) return;

    e.dataTransfer.dropEffect = "copy";
    const { x, y } = clientToWorld(e.clientX, e.clientY);
    addNode(type, x - 80, y - 40);
  };

  const onDragOver = (e: ReactDragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onPaletteNodeDrop = (type: NodeType, clientX: number, clientY: number, name?: string) => {
    const canvas = canvasRef.current;
    if (!canvas) return false;

    const rect = canvas.getBoundingClientRect();
    const isInsideCanvas =
      clientX >= rect.left &&
      clientX <= rect.right &&
      clientY >= rect.top &&
      clientY <= rect.bottom;

    if (!isInsideCanvas) return false;

    const { x, y } = clientToWorld(clientX, clientY);
    addNode(type, x - 80, y - 40, name);
    return true;
  };

  const onCanvasPointerDown = useCallback(
    (e: ReactPointerEvent<HTMLDivElement>) => {
      setSelectedIds([]);
      setSelectedEdgeId(null);
      setDrag(null);
      setWire(null);

      if (e.button !== 0 && e.button !== 1) {
        setPan(null);
        return;
      }

      e.preventDefault();
      setPan({
        pointerId: e.pointerId,
        startX: e.clientX,
        startY: e.clientY,
        originX: camera.x,
        originY: camera.y,
      });
    },
    [camera.x, camera.y]
  );

  const onEdgePointerDown = useCallback(
    (e: ReactPointerEvent<SVGPathElement>, edgeId: string) => {
      e.stopPropagation();
      e.preventDefault();

      setSelectedIds([]);
      setDrag(null);
      setWire(null);
      setPan(null);
      setSelectedEdgeId(edgeId);
    },
    []
  );

  const onCanvasWheel = useCallback(
    (e: { deltaY: number; clientX: number; clientY: number }) => {
      const scaleFactor = e.deltaY < 0 ? ZOOM_STEP : 1 / ZOOM_STEP;
      zoomAtPoint(e.clientX, e.clientY, camera.scale * scaleFactor);
    },
    [camera.scale, zoomAtPoint]
  );

  const zoomIn = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, camera.scale * ZOOM_STEP);
  }, [camera.scale, zoomAtPoint]);

  const zoomOut = useCallback(() => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;

    zoomAtPoint(rect.left + rect.width / 2, rect.top + rect.height / 2, camera.scale / ZOOM_STEP);
  }, [camera.scale, zoomAtPoint]);

  const resetCamera = useCallback(() => {
    setCamera({ x: 120, y: 72, scale: 1 });
    setPan(null);
  }, []);

  const clearCanvas = useCallback(() => {
    setGraph({ nodes: [], edges: [] });
    setLanguage("java");
    setDetectedFramework("Spring Boot");
    setSelectedIds([]);
    setSelectedEdgeId(null);
    setWire(null);
    setDrag(null);
    setPan(null);
    setPrompt("");
    setNodeCode({});
    setWorkspaceFiles([]);
    setWorkspaceFilesImported(false);
    setActiveWorkspacePath(null);
    setBuildDiagnostics([]);
    setWorkspaceView("canvas");
    setGitRepositoryReady(false);
    setActiveRecentProjectId(null);
    setCamera({ x: 120, y: 72, scale: 1 });
  }, []);

  const createNewProject = useCallback(() => {
    setProjectName("architecture-app");
    setLanguage("java");
    setDetectedFramework("Spring Boot");
    setJavaVersion("21");
    setSpringBootVersion("3.4");
    setBuildTool("maven");
    setGraph({ nodes: [], edges: [] });
    setPrompt("");
    setSelectedIds([]);
    setSelectedEdgeId(null);
    setWire(null);
    setDrag(null);
    setPan(null);
    setCamera({ x: 120, y: 72, scale: 1 });
    setProjectFileHandle(null);
    setActiveRecentProjectId(null);
    setNodeCode({});
    setWorkspaceFiles([]);
    setWorkspaceFilesImported(false);
    setActiveWorkspacePath(null);
    setBuildDiagnostics([]);
    setWorkspaceView("canvas");
    setGitRepositoryReady(false);
    lastSavedSignatureRef.current = "";
    setAutoSaveStatus("idle");
  }, []);

  const createConfiguredProject = useCallback((cfg: JavaProjectConfig) => {
    createNewProject();
    setLanguage("java");
    setDetectedFramework("Spring Boot");
    setProjectName(cfg.projectName);
    setJavaVersion(cfg.javaVersion);
    setSpringBootVersion(cfg.springBootVersion);
    setBuildTool(cfg.buildTool);
    setActiveProjectStarted(true);
  }, [createNewProject]);

  const applyProjectData = useCallback((parsed: SavedProjectFile) => {
    setProjectName(parsed.projectName);
    setLanguage("java");
    setDetectedFramework("Spring Boot");
    setJavaVersion(parsed.javaVersion);
    setSpringBootVersion(parsed.springBootVersion);
    setBuildTool(parsed.buildTool);
    setPrompt(parsed.prompt);
    setGraph(parsed.graph);
    setSelectedIds([]);
    setSelectedEdgeId(null);
    setWire(null);
    setDrag(null);
    setPan(null);
    setCamera({ x: 120, y: 72, scale: 1 });
    setNodeCode(parsed.nodeCode ?? {});
    setDockerSettings(parsed.dockerSettings ?? loadDockerSettings());
    const restoredFiles = parsed.workspaceFiles ?? Object.values(parsed.nodeCode ?? {}).flat();
    setWorkspaceFiles(restoredFiles);
    setWorkspaceFilesImported(false);
    setActiveWorkspacePath(restoredFiles[0]?.path ?? null);
    setBuildDiagnostics([]);
    setWorkspaceView(restoredFiles.length > 0 ? "editor" : "canvas");
    setGitRepositoryReady(false);
  }, []);

  const validateProjectData = (parsed: Partial<SavedProjectFile>): parsed is SavedProjectFile => isSavedProjectFile(parsed);

  const rememberRecentProject = useCallback((project: { name: string; path?: string; fileName?: string }) => {
    const id = toRecentProjectId(project);
    setRecentProjects(prev => {
      const nextProject: RecentProject = {
        id,
        name: project.name || project.fileName || "Untitled project",
        fileName: project.fileName,
        path: project.path,
        openedAt: new Date().toISOString(),
      };
      const next = [
        nextProject,
        ...prev.filter(item => item.id !== id),
      ].slice(0, MAX_RECENT_PROJECTS);
      const removedIds = prev
        .map(item => item.id)
        .filter(prevId => !next.some(item => item.id === prevId));

      if (removedIds.length > 0) {
        removeRecentProjectSnapshots(removedIds);
      }

      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
      return next;
    });
    return id;
  }, []);

  const openParsedProject = useCallback((
    parsed: Partial<SavedProjectFile>,
    options: { handle?: FileSystemFileHandle | null; path?: string; fileName?: string } = {}
  ) => {
    if (!validateProjectData(parsed)) throw new Error("Invalid project file");
    const recentProjectId = toRecentProjectId({
      name: parsed.projectName,
      path: options.path,
      fileName: options.fileName,
    });
    buildOnOpenRef.current = true;
    applyProjectData(parsed);
    setProjectFileHandle(options.handle ?? null);
    setActiveRecentProjectId(recentProjectId);
    setActiveProjectStarted(true);
    lastSavedSignatureRef.current = getProjectSignature(parsed);
    setAutoSaveStatus("saved");
    setLastAutoSavedAt(parsed.savedAt);
    rememberRecentProject({
      name: parsed.projectName,
      path: options.path,
      fileName: options.fileName,
    });
    persistRecentProjectSnapshot(recentProjectId, parsed);
  }, [applyProjectData, rememberRecentProject]);

  const onLoadProject = useCallback(() => {
    folderImportModeRef.current = "replace";
    folderInputRef.current?.click();
  }, []);

  const onImportIdeProject = useCallback(() => {
    folderImportModeRef.current = "replace";
    folderInputRef.current?.click();
  }, []);

  const onAddServiceProject = useCallback(() => {
    folderImportModeRef.current = "append-service";
    folderInputRef.current?.click();
  }, []);

  const onOpenSavedProject = useCallback(async () => {
    if ("showOpenFilePicker" in window) {
      try {
        const [handle] = await (window as any).showOpenFilePicker({
          types: [{ description: "ArchBuilder Project", accept: { "application/json": [".json"] } }],
          multiple: false,
        });
        const file = await handle.getFile();
        const parsed = JSON.parse(await file.text()) as Partial<SavedProjectFile>;
        openParsedProject(parsed, { handle, fileName: file.name });
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error(err);
          alert("Could not open this project file.");
        }
      }
    } else {
      projectFileInputRef.current?.click();
    }
  }, [openParsedProject]);

  const onOpenRecentProject = useCallback(async (recent: RecentProject) => {
    const cachedProject = loadRecentProjectSnapshot(recent.id);
    if (cachedProject && validateProjectData(cachedProject)) {
      openParsedProject(cachedProject, {
        path: recent.path,
        fileName: recent.fileName,
      });
      return;
    }

    alert(`Could not reopen "${recent.name}" from its cached snapshot. Please select the project file again.`);
    projectFileInputRef.current?.click();
  }, [openParsedProject]);

  const onOpenProjectInNewWindow = useCallback(async () => {
    const payload = buildProjectPayload();
    const launchToken = `${Date.now()}-${genId()}`;
    const launchKey = getWindowLaunchProjectKey(launchToken);

    try {
      localStorage.setItem(launchKey, JSON.stringify(payload));
      await invoke("open_project_window", { launchToken });
    } catch (error) {
      localStorage.removeItem(launchKey);
      console.error("[window-open]", error);
      alert("Could not open a new project window.");
    }
  }, [buildProjectPayload]);

  const resumeAutosavedProject = useCallback(() => {
    if (!autosavedProject) return;
    openParsedProject(autosavedProject, { fileName: `${autosavedProject.projectName}.autosave` });
  }, [autosavedProject, openParsedProject]);

  const clearAutosavedProject = useCallback(() => {
    localStorage.removeItem(AUTOSAVE_PROJECT_KEY);
    setAutosavedProject(null);
    setLastAutoSavedAt(null);
    setAutoSaveStatus("idle");
  }, []);

  useEffect(() => {
    const launchToken = (window as Window & { __ARCHIVIZ_LAUNCH_TOKEN__?: string }).__ARCHIVIZ_LAUNCH_TOKEN__;
    if (!launchToken) return;

    const launchKey = getWindowLaunchProjectKey(launchToken);
    const raw = localStorage.getItem(launchKey);
    if (!raw) return;

    localStorage.removeItem(launchKey);

    try {
      const parsed = JSON.parse(raw) as Partial<SavedProjectFile>;
      if (!validateProjectData(parsed)) throw new Error("Invalid project handoff payload");

      buildOnOpenRef.current = true;
      applyProjectData(parsed);
      setProjectFileHandle(null);
      setActiveRecentProjectId(null);
      setActiveProjectStarted(true);
      setAutosavedProject(parsed);
      lastSavedSignatureRef.current = getProjectSignature(parsed);
      setAutoSaveStatus("saved");
      setLastAutoSavedAt(parsed.savedAt);
    } catch (error) {
      console.error("[window-launch]", error);
    }
  }, [applyProjectData]);

  const onProjectFolderSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setImportingProject(true);

      try {
        const importedProject = await projectImportService.importFromFiles(files);
        const importedFiles: WorkspaceFile[] = importedProject.files;
        const nextLanguage = importedProject.language;
        const nextFramework = importedProject.framework;
        const nextJavaVersion = importedProject.javaVersion ?? javaVersion;
        const nextSpringBootVersion = importedProject.springBootVersion ?? springBootVersion;
        const nextBuildTool = importedProject.buildTool ?? buildTool;

        if (folderImportModeRef.current === "append-service") {
          const serviceRoot = toServiceProjectRoot(projectName, importedProject.projectName);
          const serviceFiles = importedFiles.map(file => ({
            path: `${serviceRoot}/${file.path}`,
            content: file.content,
          }));
          const maxX = graph.nodes.length > 0 ? Math.max(...graph.nodes.map(node => node.x)) : 360;
          const maxY = graph.nodes.length > 0 ? Math.max(...graph.nodes.map(node => node.y)) : 80;
          const idMap = new Map(importedProject.graph.nodes.map(node => [node.id, `${genId()}-${node.id}`]));
          const importedNodes = importedProject.graph.nodes.length > 0
            ? importedProject.graph.nodes.map(node => ({
                ...node,
                id: idMap.get(node.id) ?? genId(),
                x: node.x + maxX + 340,
                y: node.y + maxY,
                config: {
                  ...node.config,
                  // Prefix sourceFiles so they match the prefixed workspaceFiles paths
                  ...(Array.isArray(node.config?.sourceFiles) ? {
                    sourceFiles: (node.config.sourceFiles as string[]).map(p => `${serviceRoot}/${p}`),
                  } : {}),
                  imported: true,
                  importedProjectName: importedProject.projectName,
                  language: nextLanguage,
                  framework: nextFramework,
                  serviceRoot,
                },
              }))
            : [{
                id: genId(),
                name: importedProject.projectName,
                type: languageToNodeType(nextLanguage, nextFramework),
                x: maxX + 340,
                y: maxY + 40,
                config: {
                  imported: true,
                  importedProjectName: importedProject.projectName,
                  language: nextLanguage,
                  framework: nextFramework,
                  serviceRoot,
                },
              } satisfies NodeData];
          const importedEdges = importedProject.graph.edges
            .map(edge => {
              const from = idMap.get(edge.from);
              const to = idMap.get(edge.to);
              if (!from || !to) return null;
              return {
                ...edge,
                id: `${from}:${to}`,
                from,
                to,
              };
            })
            .filter((edge): edge is Edge => Boolean(edge));
          const mergedFiles = dedupeFiles([...workspaceFiles, ...serviceFiles]);
          const mergedNodes = [...graph.nodes, ...importedNodes];
          const mergedEdges = [...graph.edges, ...importedEdges];
          const detectedServiceEdges = detectServiceCallEdges({
            nodes: mergedNodes,
            edges: mergedEdges,
            files: mergedFiles,
            projectName,
          });
          const nextGraph = {
            ...graph,
            nodes: mergedNodes,
            edges: [...mergedEdges, ...detectedServiceEdges],
          };
          const nextNodeCode = Object.fromEntries(
            importedNodes.map(node => [node.id, getWorkspaceFilesForNode(node, serviceFiles)])
          );

          setGraph(nextGraph);
          setWorkspaceFiles(mergedFiles);
          setNodeCode(prev => ({ ...prev, ...nextNodeCode }));
          setActiveWorkspacePath(serviceFiles[0]?.path ?? null);
          setActiveWorkspaceGroupId("all");
          setWorkspaceView("editor");
          setActiveProjectStarted(true);
          setPrompt(buildAIPrompt(nextGraph, javaVersion, springBootVersion, projectName, buildTool, {
            existingFiles: mergedFiles,
          }));
          return;
        }

        setProjectName(importedProject.projectName);
        setLanguage(nextLanguage);
        setDetectedFramework(nextFramework);
        setJavaVersion(nextJavaVersion);
        setSpringBootVersion(nextSpringBootVersion);
        setBuildTool(nextBuildTool);
        setGraph(importedProject.graph);
        setWorkspaceFiles(importedFiles);
        setWorkspaceFilesImported(true);
        setNodeCode(Object.fromEntries(
          importedProject.graph.nodes.map(node => [node.id, getWorkspaceFilesForNode(node, importedFiles)])
        ));
        setActiveWorkspacePath(importedFiles[0]?.path ?? null);
        setActiveWorkspaceGroupId("all");
        setSelectedIds([]);
        setSelectedEdgeId(null);
        setWire(null);
        setDrag(null);
        setPan(null);
        setPrompt(
          buildAIPrompt(
            importedProject.graph,
            nextLanguage === "java" ? nextJavaVersion : nextLanguage,
            nextLanguage === "java" ? nextSpringBootVersion : nextFramework,
            importedProject.projectName,
            nextBuildTool,
            { existingFiles: importedFiles }
          )
        );
        setCamera({ x: 120, y: 72, scale: 1 });
        setWorkspaceView("editor");
        setActiveProjectStarted(true);
      } catch (error) {
        console.error(error);
        alert("Could not import this folder.");
      } finally {
        setImportingProject(false);
        folderImportModeRef.current = "replace";
        e.target.value = "";
      }
    },
    [buildTool, graph, javaVersion, projectImportService, projectName, springBootVersion, workspaceFiles]
  );

  // Fallback for browsers without File System Access API
  const onSavedProjectSelected = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<SavedProjectFile>;
      openParsedProject(parsed, { fileName: file.name });
    } catch (error) {
      console.error(error);
      alert("Could not open this project file.");
    } finally {
      e.target.value = "";
    }
  }, [openParsedProject]);

  const saveProject = useCallback(async () => {
    const payload = buildProjectPayload();
    const json = JSON.stringify(payload, null, 2);
    const markSaved = () => {
      localStorage.setItem(AUTOSAVE_PROJECT_KEY, json);
      setAutosavedProject(payload);
      setLastAutoSavedAt(payload.savedAt);
      lastSavedSignatureRef.current = getProjectSignature(payload);
      setAutoSaveStatus("saved");
    };

    if (projectFileHandle) {
      try {
        const writable = await projectFileHandle.createWritable();
        await writable.write(json);
        await writable.close();
        const recentProjectId = rememberRecentProject({
          name: payload.projectName,
          fileName: projectFileHandle.name,
        });
        setActiveRecentProjectId(recentProjectId);
        persistRecentProjectSnapshot(recentProjectId, payload);
        markSaved();
      } catch (err) {
        console.error(err);
      }
      return;
    }

    if ("showSaveFilePicker" in window) {
      try {
        const handle = await (window as any).showSaveFilePicker({
          suggestedName: `${projectName || "project"}.archbuilder.json`,
          types: [{ description: "ArchBuilder Project", accept: { "application/json": [".json"] } }],
        });
        setProjectFileHandle(handle);
        const writable = await handle.createWritable();
        await writable.write(json);
        await writable.close();
        const recentProjectId = rememberRecentProject({
          name: payload.projectName,
          fileName: handle.name,
        });
        setActiveRecentProjectId(recentProjectId);
        persistRecentProjectSnapshot(recentProjectId, payload);
        markSaved();
      } catch (err: any) {
        if (err.name !== "AbortError") console.error(err);
      }
      return;
    }

    // Fallback for browsers without File System Access API
    saveAs(new Blob([json], { type: "application/json;charset=utf-8" }), `${projectName || "project"}.archbuilder.json`);
    const recentProjectId = rememberRecentProject({
      name: payload.projectName,
      fileName: `${projectName || "project"}.archbuilder.json`,
    });
    setActiveRecentProjectId(recentProjectId);
    persistRecentProjectSnapshot(recentProjectId, payload);
    markSaved();
  }, [buildProjectPayload, projectFileHandle, projectName, rememberRecentProject]);

  /* =======================
     EXPORT TO IDE ZIP
  ======================= */

  const exportProject = useCallback(async () => {
    // 1. Collect AI-generated source files (each node now stores an array of files)
    const generatedFiles = workspaceFiles.length > 0 ? workspaceFiles : Object.values(nodeCode).flat();

    // 2. Build scaffold (pom.xml/build.gradle, Dockerfile, docker-compose, Terraform, etc.)
    const scaffoldFiles = workspaceFilesImported ? [] : scaffoldService.generate({
      projectName,
      javaVersion,
      springBootVersion,
      buildTool,
      generatedFiles,
      docker: dockerSettings,
    });

    // 3. Embed the prompt as a reference file
    const promptFile = prompt.trim()
      ? [{ path: "arch-prompt.md", content: `# Architecture Prompt\n\n${prompt}` }]
      : [];

    // 4. Embed the .archbuilder.json so the project can be reopened in Arch Builder
    const archFile = [{
      path: `${projectName || "project"}.archbuilder.json`,
      content: JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        projectName,
        javaVersion,
        springBootVersion,
        buildTool,
        prompt,
        graph,
        nodeCode,
        workspaceFiles,
        dockerSettings,
      }, null, 2),
    }];

    // 5. Merge all — scaffold base, then generated src, then meta files
    const allFiles = [...scaffoldFiles, ...generatedFiles, ...promptFile, ...archFile];

    // Deduplicate: later entries win (generated src overrides scaffold placeholders)
    const fileMap = new Map<string, string>();
    for (const f of allFiles) fileMap.set(f.path, f.content);
    const dedupedFiles = Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }));

    await zipService.download(dedupedFiles, projectName);
  }, [buildTool, dockerSettings, javaVersion, springBootVersion, graph, nodeCode, projectName, prompt, scaffoldService, workspaceFiles, workspaceFilesImported, zipService]);

  const getRunnableProjectFiles = useCallback(() => {
    const generatedFiles = (workspaceFiles.length > 0 ? workspaceFiles : Object.values(nodeCode).flat())
      .filter(file => !isHiddenWorkspacePlaceholder(file.path));

    if (generatedFiles.length === 0) return [];
    if (workspaceFilesImported) return generatedFiles;

    const scaffoldFiles = scaffoldService.generate({
      projectName,
      javaVersion,
      springBootVersion,
      buildTool,
      generatedFiles,
      docker: dockerSettings,
    });

    return dedupeFiles([...scaffoldFiles, ...generatedFiles]);
  }, [buildTool, dockerSettings, javaVersion, nodeCode, projectName, scaffoldService, springBootVersion, workspaceFiles, workspaceFilesImported]);

  const serviceFileGroups = useMemo<WorkspaceFileGroup[]>(() => {
    const runnableFiles = getRunnableProjectFiles();
    if (graph.nodes.length <= 1 || runnableFiles.length === 0) return [];

    const serviceRoots = new Map(graph.nodes.map(node => [node.id, getNodeServiceRoot(projectName, node)]));
    const serviceRootSet = new Set(serviceRoots.values());
    const isUnderGeneratedServiceRoot = (path: string) => serviceRootSet.has(path.split("/")[0] ?? "");
    const sharedFiles = runnableFiles.filter(file => !isUnderGeneratedServiceRoot(file.path) && isSharedProjectFile(file.path));
    return graph.nodes
      .map(node => {
        const serviceRoot = serviceRoots.get(node.id) ?? "";
        const rootedFiles = serviceRoot
          ? runnableFiles.filter(file => file.path.startsWith(`${serviceRoot}/`))
          : [];
        const serviceFiles = dedupeFiles([...rootedFiles, ...getWorkspaceFilesForNode(node, runnableFiles)]);
        return {
          id: node.id,
          label: node.name,
          files: dedupeFiles([...sharedFiles, ...serviceFiles]),
        };
      })
      .filter(group => group.files.length > sharedFiles.length);
  }, [getRunnableProjectFiles, graph.nodes]);

  const activeServiceGroup = useMemo(
    () => serviceFileGroups.find(group => group.id === activeWorkspaceGroupId) ?? null,
    [activeWorkspaceGroupId, serviceFileGroups]
  );

  const activeServiceProjectName = useMemo(() => {
    if (!activeServiceGroup) return projectName;
    const node = graph.nodes.find(item => item.id === activeServiceGroup.id);
    return node ? getNodeServiceRoot(projectName, node) : toServiceProjectRoot(projectName, activeServiceGroup.label);
  }, [activeServiceGroup, graph.nodes, projectName]);

  const getActiveGitFiles = useCallback(() => {
    if (!activeServiceGroup) return getRunnableProjectFiles();
    const node = graph.nodes.find(item => item.id === activeServiceGroup.id);
    const serviceRoot = node ? getNodeServiceRoot(projectName, node) : toServiceProjectRoot(projectName, activeServiceGroup.label);
    return stripServiceProjectRoot(activeServiceGroup.files, serviceRoot);
  }, [activeServiceGroup, getRunnableProjectFiles, graph.nodes, projectName]);

  const gitScopedFiles = useMemo(
    () => serviceFileGroups.length > 1 && !activeServiceGroup ? [] : getActiveGitFiles(),
    [activeServiceGroup, getActiveGitFiles, serviceFileGroups.length]
  );

  useEffect(() => {
    if (activeWorkspaceGroupId === "all") return;
    if (!serviceFileGroups.some(group => group.id === activeWorkspaceGroupId)) {
      setActiveWorkspaceGroupId("all");
    }
  }, [activeWorkspaceGroupId, serviceFileGroups]);

  const materializeProjectWorkspace = useCallback(async (filesOverride?: WorkspaceFile[], projectNameOverride?: string) => {
    const files = filesOverride ?? getRunnableProjectFiles();
    if (files.length === 0) {
      throw new Error("Generate or create project files first.");
    }

    return invoke<WorkspaceMaterializeResult>("workspace_materialize", {
      options: {
        projectName: projectNameOverride ?? projectName,
        files,
      },
    });
  }, [getRunnableProjectFiles, projectName]);

  const checkProjectBuild = useCallback(async (filesOverride?: WorkspaceFile[]) => {
    const files = filesOverride ?? getRunnableProjectFiles();
    if (files.length === 0) return;

    const command = getProjectCommandParts("build", buildTool, files);
    try {
      const result = await invoke<WorkspaceCommandResult>("workspace_command", {
        options: {
          projectName,
          files,
          program: command.program,
          args: command.args,
        },
      });
      const diagnostics = result.ok ? [] : parseBuildDiagnostics(`${result.stdout}\n${result.stderr}`, files);
      setBuildDiagnostics(diagnostics);
    } catch (error) {
      console.warn("[build-check]", error);
      setBuildDiagnostics([]);
    }
  }, [buildTool, getRunnableProjectFiles, projectName]);

  const runTopbarGit = useCallback(async (args: string[], filesOverride?: WorkspaceFile[], projectNameOverride?: string) => {
    return invoke<GitRunResult>("git_run", {
      options: {
        projectName: projectNameOverride ?? activeServiceProjectName,
        files: filesOverride ?? getActiveGitFiles(),
        args,
      },
    });
  }, [activeServiceProjectName, getActiveGitFiles]);

  const refreshTopbarGit = useCallback(async () => {
    const files = getActiveGitFiles();
    try {
      const status = await runTopbarGit(["status", "--short", "--branch"], files);
      setGitRepositoryReady(status.isRepository);
    } catch {
      setGitRepositoryReady(false);
    }
  }, [getActiveGitFiles, runTopbarGit]);

  useEffect(() => {
    void refreshTopbarGit();
  }, [refreshTopbarGit]);

  const runProjectCommand = useCallback(async (mode: "build" | "run") => {
    try {
      const files = getActiveGitFiles();
      const { cwd } = await materializeProjectWorkspace(files, activeServiceProjectName);
      const command = formatCommandLine(getProjectCommandParts(mode, buildTool, files));

      window.dispatchEvent(new CustomEvent("archiviz:terminal-command", {
        detail: {
          cwd,
          title: mode === "build" ? "Build" : "Run",
          command,
        },
      }));
    } catch (error: any) {
      alert(error?.message ?? "Could not prepare the project workspace.");
    }
  }, [activeServiceProjectName, buildTool, getActiveGitFiles, materializeProjectWorkspace]);

  useEffect(() => {
    if (!buildOnOpenRef.current || !activeProjectStarted) return;

    const files = getRunnableProjectFiles();
    if (files.length === 0) return;

    buildOnOpenRef.current = false;
    const timeout = window.setTimeout(() => {
      void checkProjectBuild(files);
    }, 450);

    return () => window.clearTimeout(timeout);
  }, [activeProjectStarted, checkProjectBuild, getRunnableProjectFiles]);

  /* =======================
     PROMPT
  ======================= */

  const generate = () => {
    if (!hasCanvasContent) {
      alert("Add at least one node to the canvas before generating a prompt.");
      return;
    }

    const existingFiles = workspaceFiles.length > 0 ? workspaceFiles : Object.values(nodeCode).flat();
    const p = buildAIPrompt(graph, javaVersion, springBootVersion, projectName, buildTool, { existingFiles });
    setPrompt(p);
  };

  const generateProjectWithAI = useCallback(async () => {
    if (projectGenerationInFlightRef.current) return;

    if (!settings || !ai) {
      alert("Configure AI first");
      return;
    }

    const existingFiles = workspaceFiles.length > 0 ? workspaceFiles : Object.values(nodeCode).flat();
    const shouldSplitByService = hasCanvasContent && graph.nodes.length > 1;
    let sourcePrompt = prompt.trim();
    const servicePrompts = shouldSplitByService
      ? buildServiceGenerationPrompts(graph, javaVersion, springBootVersion, projectName, buildTool, { existingFiles })
      : [];

    if (!sourcePrompt && hasCanvasContent) {
      sourcePrompt = buildAIPrompt(graph, javaVersion, springBootVersion, projectName, buildTool, { existingFiles });
      setPrompt(sourcePrompt);
    }

    if (!sourcePrompt && servicePrompts.length === 0) {
      alert("Write a prompt or add nodes before generating a project.");
      return;
    }

    setProjectGenerating(true);
    projectGenerationInFlightRef.current = true;
    setGenError(null);
    setGenerationProgress(null);
    setBuildDiagnostics([]);
    if (workspaceFiles.length === 0) {
      setWorkspaceFiles([]);
      setNodeCode({});
    }
    setWorkspaceFilesImported(false);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const publishFiles = (nodeId: string | null, nextFiles: WorkspaceFile[]) => {
        if (nextFiles.length === 0) return;
        const visibleFiles = dedupeFiles(nextFiles);
        setWorkspaceFiles(prev => dedupeFiles([...prev, ...visibleFiles]));
        if (nodeId) {
          setNodeCode(prev => ({
            ...prev,
            [nodeId]: dedupeFiles([...(prev[nodeId] ?? []), ...visibleFiles]),
          }));
          setActiveWorkspaceGroupId(nodeId);
        }
        setActiveWorkspacePath(visibleFiles.at(-1)?.path ?? null);
        setWorkspaceView("editor");
      };

      const streamPromptToEditor = async (
        promptToRun: string,
        progressMeta: {
          nodeId: string | null;
          serviceName: string;
          currentServiceIndex: number;
          totalServices: number;
        },
      ) => {
        let raw = "";
        const published = new Set<string>();

        const publishCompletedFromRaw = (includeCurrentFile: boolean) => {
          const parsed = parseStreamingFiles(raw, includeCurrentFile);
          const nextFiles = parsed.files.filter(file => {
            const key = `${file.path}:${file.content.length}`;
            if (published.has(key)) return false;
            published.add(key);
            return true;
          });
          publishFiles(progressMeta.nodeId, nextFiles);
          setGenerationProgress({
            serviceName: progressMeta.serviceName,
            currentFile: parsed.currentPath,
            completedFiles: published.size,
            totalServices: progressMeta.totalServices,
            currentServiceIndex: progressMeta.currentServiceIndex,
            streamPreview: raw.slice(-900),
          });
        };

        const finalRaw = await ai.callStream(
          [{ role: "user", content: promptToRun }],
          token => {
            raw += token;
            publishCompletedFromRaw(false);
          },
          controller.signal
        );

        raw = finalRaw || raw;
        publishCompletedFromRaw(true);
      };

      if (servicePrompts.length > 1) {
        for (let index = 0; index < servicePrompts.length; index += 1) {
          const step = servicePrompts[index];
          const scopedPrompt = [
            step.prompt,
            sourcePrompt
              ? [
                  "# Original Full Architecture Prompt",
                  "Use this as the orchestration context and user intent. Do not generate the whole system in this call; generate only the target service named above.",
                  sourcePrompt,
                ].join("\n")
              : "",
          ].filter(Boolean).join("\n\n");

          await streamPromptToEditor(scopedPrompt, {
            nodeId: step.nodeId,
            serviceName: step.serviceName,
            currentServiceIndex: index + 1,
            totalServices: servicePrompts.length,
          });
        }
      } else {
        const projectPrompt = [
          `Generate a complete ${buildTool} Java ${javaVersion} Spring Boot ${springBootVersion} project named "${projectName || "architecture-app"}".`,
          "Return multiple files only with this exact marker before each file:",
          "=== FILE: path/to/file.ext ===",
          "Include build files, application entrypoint, configuration, and implementation files needed for the described architecture.",
          "Do not wrap the answer in Markdown fences.",
          "",
          sourcePrompt,
        ].join("\n");

        await streamPromptToEditor(projectPrompt, {
          nodeId: graph.nodes[0]?.id ?? null,
          serviceName: projectName || graph.nodes[0]?.name || "Project",
          currentServiceIndex: 1,
          totalServices: 1,
        });
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("[project-generator]", err);
        setGenError({ message: err?.message ?? "Project generation failed. Check your AI settings and try again." });
      }
    } finally {
      projectGenerationInFlightRef.current = false;
      setProjectGenerating(false);
      setGenerationProgress(null);
    }
  }, [ai, buildTool, graph, hasCanvasContent, javaVersion, nodeCode, projectName, prompt, settings, springBootVersion, workspaceFiles]);

  const runCodeFixAgent = useCallback(async () => {
    if (codeAgentRunning) return;

    if (!settings || !ai) {
      alert("Configure AI in Settings first.");
      return;
    }

    const files = getRunnableProjectFiles();
    if (files.length === 0) {
      alert("Generate or open project files first.");
      return;
    }

    codeAgentAbortRef.current?.abort();
    const controller = new AbortController();
    codeAgentAbortRef.current = controller;
    setCodeAgentRunning(true);
    setCodeAgentOutput("");

    try {
      const agentPrompt = buildCodeAgentPrompt({
        projectName,
        buildTool,
        javaVersion,
        springBootVersion,
        files,
        diagnostics: buildDiagnostics,
      });

      await ai.callStream(
        [
          {
            role: "system",
            content: "You are a senior code review and repair-planning agent. Be specific, practical, and concise.",
          },
          { role: "user", content: agentPrompt },
        ],
        token => setCodeAgentOutput(prev => prev + token),
        controller.signal
      );
    } catch (error: any) {
      if (error?.name !== "AbortError") {
        console.error("[code-agent]", error);
        setCodeAgentOutput(error?.message ?? "The code fix agent could not complete the review.");
      }
    } finally {
      if (codeAgentAbortRef.current === controller) {
        codeAgentAbortRef.current = null;
      }
      setCodeAgentRunning(false);
    }
  }, [
    ai,
    buildDiagnostics,
    buildTool,
    codeAgentRunning,
    getRunnableProjectFiles,
    javaVersion,
    projectName,
    settings,
    springBootVersion,
  ]);

  /* =======================
     CLEANUP
  ======================= */

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
      codeAgentAbortRef.current?.abort();
    };
  }, []);

  useEffect(() => {
    if (!selectedEdgeId) return;

    const selectedEdgeStillExists = graph.edges.some((edge) => edge.id === selectedEdgeId);
    if (!selectedEdgeStillExists) {
      setSelectedEdgeId(null);
    }
  }, [graph.edges, selectedEdgeId]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tagName = target?.tagName;
      const isTypingContext =
        !!target?.isContentEditable ||
        tagName === "INPUT" ||
        tagName === "TEXTAREA" ||
        tagName === "SELECT";

      if (isTypingContext || !selectedEdgeId) return;

      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        onDeleteEdge(selectedEdgeId);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onDeleteEdge, selectedEdgeId]);

  useEffect(() => {
    if (!drag && !wire && !pan) return;

    const handlePointerMove = (e: globalThis.PointerEvent) => {
      movePointerInteraction(e.clientX, e.clientY);
    };

    const handlePointerUp = (e: globalThis.PointerEvent) => {
      if (wire) {
        completeWireFromPointer(e.clientX, e.clientY);
      }

      if (pan && e.pointerId === pan.pointerId) {
        setPan(null);
      }

      setDrag(null);
    };

    window.addEventListener("pointermove", handlePointerMove);
    window.addEventListener("pointerup", handlePointerUp);

    return () => {
      window.removeEventListener("pointermove", handlePointerMove);
      window.removeEventListener("pointerup", handlePointerUp);
    };
  }, [completeWireFromPointer, drag, wire, pan, movePointerInteraction]);

  const nodeFilesById = useMemo(() => {
    const allGeneratedFiles = workspaceFiles.length > 0 ? workspaceFiles : Object.values(nodeCode).flat();
    const entries = graph.nodes.map(node => {
      const directFiles = nodeCode[node.id];
      const inferredFiles = directFiles?.length ? directFiles : getWorkspaceFilesForNode(node, allGeneratedFiles);
      return [node.id, inferredFiles] as const;
    });

    return Object.fromEntries(entries) as Record<string, WorkspaceFile[]>;
  }, [graph.nodes, nodeCode, workspaceFiles]);

  const generatedNodeIds = useMemo(
    () => new Set(Object.entries(nodeFilesById).filter(([, files]) => files.length > 0).map(([id]) => id)),
    [nodeFilesById]
  );

  // How many expandable class files each node has
  const nodeClassCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const node of graph.nodes) {
      const sourceFiles = node.config?.sourceFiles;
      if (Array.isArray(sourceFiles) && sourceFiles.length > 0) {
        counts[node.id] = (sourceFiles as string[]).length;
      }
    }
    return counts;
  }, [graph.nodes]);

  const onExpandClasses = (nodeId: string) => {
    const alreadyExpanded = expandedNodeIds.has(nodeId);

    if (alreadyExpanded) {
      // Collapse: remove all class nodes that belong to this parent
      setGraph(g => ({
        ...g,
        nodes: g.nodes.filter(n => n.config?.parentNodeId !== nodeId),
        edges: g.edges.filter(e => {
          const fromNode = g.nodes.find(n => n.id === e.from);
          const toNode = g.nodes.find(n => n.id === e.to);
          return fromNode?.config?.parentNodeId !== nodeId && toNode?.config?.parentNodeId !== nodeId;
        }),
      }));
      setExpandedNodeIds(prev => { const next = new Set(prev); next.delete(nodeId); return next; });
      return;
    }

    // Expand: create class nodes from sourceFiles
    const parentNode = graph.nodes.find(n => n.id === nodeId);
    if (!parentNode) return;

    const sourcePaths = parentNode.config?.sourceFiles as string[] | undefined;
    if (!sourcePaths?.length) return;

    const allFiles = workspaceFiles.length > 0 ? workspaceFiles : Object.values(nodeCode).flat();
    const COLS = 3;
    const COL_W = 185;
    const ROW_H = 110;

    const classNodes: NodeData[] = sourcePaths.map((path, i) => {
      const file = allFiles.find(f => f.path === path);
      const analyzed = analyzeSourceFile(path, file?.content ?? "");
      const col = i % COLS;
      const row = Math.floor(i / COLS);
      return {
        id: `class:${nodeId}:${path}`,
        type: analyzed.nodeType,
        name: analyzed.displayName,
        x: parentNode.x + col * COL_W,
        y: parentNode.y + 110 + row * ROW_H,
        config: { parentNodeId: nodeId, isClassNode: true },
      };
    });

    setGraph(g => ({ ...g, nodes: [...g.nodes, ...classNodes] }));
    setExpandedNodeIds(prev => new Set([...prev, nodeId]));
  };

  /* =======================
     UI
  ======================= */

  return (
    <div className={`app ${colorScheme} ${theme}`}>
      <input
        ref={folderInputRef}
        type="file"
        hidden
        multiple
        onChange={onProjectFolderSelected}
        {...({ webkitdirectory: "", directory: "" } as any)}
      />

      <input
        ref={projectFileInputRef}
        type="file"
        hidden
        accept=".archbuilder.json,application/json"
        onChange={onSavedProjectSelected}
      />

      {!activeProjectStarted && (
        <div className="startup-overlay" role="dialog" aria-modal="true" aria-labelledby="startup-title">
          <div className="startup-panel">
            <div className="startup-brand">ARCH</div>
            <div className="startup-copy">
              <h1 id="startup-title">Choose a project</h1>
              <p>Open a saved architecture workspace, import an IDE codebase, or create a fresh Spring Boot project.</p>
            </div>
            <div className="startup-actions">
              <button className="btn btn-primary startup-action" onClick={() => setShowStartupProjectConfig(true)}>
                Create New Project
              </button>
              <button className="btn startup-action" onClick={onOpenSavedProject}>
                Open Project
              </button>
              <button className="btn startup-action" onClick={onImportIdeProject} disabled={importingProject}>
                {importingProject ? "Importing..." : "Import IDE Project"}
              </button>
            </div>
            {autosavedProject && (
              <div className="startup-autosave">
                <button className="startup-history-item" onClick={resumeAutosavedProject}>
                  <span className="startup-history-icon">AS</span>
                  <span className="startup-history-main">
                    <span className="startup-history-name">Resume {autosavedProject.projectName || "autosaved project"}</span>
                    <span className="startup-history-path">
                      Autosaved {new Date(autosavedProject.savedAt).toLocaleString()}
                    </span>
                  </span>
                </button>
                <button className="startup-history-clear" onClick={clearAutosavedProject}>
                  Discard autosave
                </button>
              </div>
            )}
            <div className="startup-history">
              <div className="startup-history-header">
                <span>Recent Projects</span>
                {recentProjects.length > 0 && (
                  <button
                    className="startup-history-clear"
                    onClick={() => {
                      removeRecentProjectSnapshots(recentProjects.map(project => project.id));
                      setRecentProjects([]);
                      localStorage.removeItem(RECENT_PROJECTS_KEY);
                    }}
                  >
                    Clear
                  </button>
                )}
              </div>
              {recentProjects.length > 0 ? (
                <div className="startup-history-list">
                  {recentProjects.map(recent => (
                    <button
                      key={recent.id}
                      className="startup-history-item"
                      onClick={() => void onOpenRecentProject(recent)}
                      title={recent.path || recent.fileName || recent.name}
                    >
                      <span className="startup-history-icon">AR</span>
                      <span className="startup-history-main">
                        <span className="startup-history-name">{recent.name}</span>
                        <span className="startup-history-path">{recent.path || recent.fileName || "Select from disk to reopen"}</span>
                      </span>
                      <span className="startup-history-date">
                        {new Date(recent.openedAt).toLocaleDateString()}
                      </span>
                    </button>
                  ))}
                </div>
              ) : (
                <div className="startup-history-empty">Opened projects will appear here.</div>
              )}
            </div>
          </div>
        </div>
      )}

      {showStartupProjectConfig && (
        <ProjectConfigModal
          initial={{ projectName: "", javaVersion, springBootVersion, buildTool }}
          onConfirm={createConfiguredProject}
          onClose={() => setShowStartupProjectConfig(false)}
        />
      )}

      {showTopbar && (
        <Topbar
          canSaveProject={hasProjectData}
          hasUnsavedChanges={hasUnsavedChanges}
          autoSaveLabel={activeProjectStarted ? autoSaveLabel : undefined}
          importingProject={importingProject}
          javaVersion={javaVersion}
          setJavaVersion={setJavaVersion}
          springBootVersion={springBootVersion}
          setSpringBootVersion={setSpringBootVersion}
          detectedLanguage={language}
          detectedFramework={detectedFramework}
          projectName={projectName}
          setProjectName={setProjectName}
          buildTool={buildTool}
          setBuildTool={setBuildTool}
          onOpenSettings={() => setShowSettings(true)}
          onCreateProject={createNewProject}
          onOpenProject={onOpenSavedProject}
          onImportProject={onLoadProject}
          onOpenProjectInNewWindow={onOpenProjectInNewWindow}
          onAddServiceProject={onAddServiceProject}
          onSaveProject={saveProject}
          onExportProject={exportProject}
        />
      )}

      <div className="main">
        <div className="workspace-shell">
          <div className="workspace-content">
            <nav className="workspace-rail" aria-label="Workspace views">
              <button
                className={`workspace-rail-btn ${workspaceView === "canvas" ? "active" : ""}`}
                onClick={() => toggleWorkspaceView("canvas")}
                title={workspaceView === "canvas" ? "Close canvas" : "Open canvas"}
                aria-label="Canvas"
                aria-pressed={workspaceView === "canvas"}
              >
                <span className="workspace-rail-icon">C</span>
                <span className="workspace-rail-label">Canvas</span>
              </button>
              <button
                className={`workspace-rail-btn ${workspaceView === "editor" ? "active" : ""}`}
                onClick={() => toggleWorkspaceView("editor")}
                title={workspaceView === "editor" ? "Close editor" : "Open editor"}
                aria-label="Code editor"
                aria-pressed={workspaceView === "editor"}
              >
                <span className="workspace-rail-icon">E</span>
                <span className="workspace-rail-label">Editor</span>
              </button>
              <button
                className={`workspace-rail-btn ${workspaceView === "api" ? "active" : ""}`}
                onClick={() => toggleWorkspaceView("api")}
                title={workspaceView === "api" ? "Close API tester" : "Open API tester"}
                aria-label="API tester"
                aria-pressed={workspaceView === "api"}
              >
                <span className="workspace-rail-icon">API</span>
                <span className="workspace-rail-label">API</span>
              </button>
            </nav>

            {workspaceView === "canvas" && (
              <aside
                className="workspace-side-pane workspace-side-pane--resizable"
                style={{ width: paletteWidth, flexBasis: paletteWidth }}
              >
                <Palette
                  embedded
                  workspaceFiles={workspaceFiles}
                  onDropNode={onPaletteNodeDrop}
                />
                <div
                  className="panel-resize-handle panel-resize-handle--right"
                  onPointerDown={startPaletteResize}
                  role="separator"
                  aria-orientation="vertical"
                  aria-label="Resize components panel"
                  title="Resize components panel"
                />
              </aside>
            )}

            <div className="workspace-main">
              {workspaceView === "editor" ? (
                <FileWorkspace
                  files={getRunnableProjectFiles()}
                  activePath={activeWorkspacePath}
                  onActivePathChange={setActiveWorkspacePath}
                  onFilesChange={setWorkspaceFiles}
                  fileGroups={serviceFileGroups}
                  activeGroupId={activeWorkspaceGroupId}
                  onActiveGroupChange={setActiveWorkspaceGroupId}
                  projectName={projectName || undefined}
                  editorTheme={colorScheme}
                  editorSettings={editorSettings}
                  showGitFolder={gitRepositoryReady}
                  errorDiagnostics={buildDiagnostics}
                  onBuildProject={() => void runProjectCommand("build")}
                  onRunProject={() => void runProjectCommand("run")}
                  runnerBusy={runnerBusy}
                />
              ) : workspaceView === "api" ? (
                <ApiTester files={workspaceFiles.length > 0 ? workspaceFiles : Object.values(nodeCode).flat()} />
              ) : (
                <Canvas
                  canvasRef={canvasRef}
                  graph={graph}
                  camera={camera}
                  selectedIds={selectedIds}
                  selectedEdgeId={selectedEdgeId}
                  wire={wire}
                  onDrop={onDrop}
                  onDragOver={onDragOver}
                  onDelete={onDelete}
                  onRename={onRename}
                  onConfigure={setConfiguringNodeId}
                  onViewCode={setViewingNodeId}
                  generatedNodeIds={generatedNodeIds}
                  startWire={startWire}
                  moveWire={movePointerInteraction}
                  onNodePointerDown={onNodePointerDown}
                  onEdgePointerDown={onEdgePointerDown}
                  onCanvasPointerDown={onCanvasPointerDown}
                  onCanvasWheel={onCanvasWheel}
                  onZoomIn={zoomIn}
                  onZoomOut={zoomOut}
                  onResetCamera={resetCamera}
                  onClearCanvas={clearCanvas}
                  nodeClassCounts={nodeClassCounts}
                  expandedNodeIds={expandedNodeIds}
                  onExpandClasses={onExpandClasses}
                />
              )}
            </div>
          </div>

          <TerminalDock
            terminalSettings={terminalSettings}
          getWorkspaceCwd={async () => (await materializeProjectWorkspace(getActiveGitFiles(), activeServiceProjectName)).cwd}
          />
        </div>

        <CodePanel
          width={codePanelWidth}
          onResizeStart={startCodePanelResize}
          prompt={prompt}
          setPrompt={setPrompt}
          filesCount={workspaceFiles.length}
          projectName={activeServiceProjectName}
          files={gitScopedFiles}
          gitSettings={gitSettings}
          gitRepositoryReady={gitRepositoryReady}
          onGitRepositoryChange={setGitRepositoryReady}
          onGeneratePrompt={generate}
          onGenerateProject={generateProjectWithAI}
          onRunCodeAgent={runCodeFixAgent}
          onOpenEditor={() => setWorkspaceView("editor")}
          aiGenerating={projectGenerating}
          canGenerateProject={!!settings && (hasPrompt || hasCanvasContent)}
          codeAgentRunning={codeAgentRunning}
          codeAgentOutput={codeAgentOutput}
          canRunCodeAgent={!!settings && getActiveGitFiles().length > 0}
          aiModelLabel={settings?.model || settings?.provider || ""}
        />
      </div>

      {showSettings && (
        <div className="modal" onClick={() => setShowSettings(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Settings
              theme={theme}
              setTheme={setTheme}
              colorScheme={colorScheme}
              setColorScheme={setColorScheme}
              editorSettings={editorSettings}
              setEditorSettings={setEditorSettings}
              terminalSettings={terminalSettings}
              setTerminalSettings={setTerminalSettings}
              dockerSettings={dockerSettings}
              setDockerSettings={setDockerSettings}
              gitSettings={gitSettings}
              setGitSettings={setGitSettings}
              onClose={() => setShowSettings(false)}
              onSave={(s) => {
                setSettings(s);
                setShowSettings(false);
              }}
            />
          </div>
        </div>
      )}

      {configuringNodeId && (() => {
        const node = graph.nodes.find(n => n.id === configuringNodeId);
        return node ? (
          <NodeConfigModal
            node={node}
            onSave={(id, config) =>
              setGraph(g => ({ ...g, nodes: g.nodes.map(n => n.id === id ? { ...n, config } : n) }))
            }
            onClose={() => setConfiguringNodeId(null)}
          />
        ) : null;
      })()}

      {viewingNodeId && (() => {
        const node  = graph.nodes.find(n => n.id === viewingNodeId);
        const files = nodeFilesById[viewingNodeId];
        return node && files ? (
          <NodeCodeModal
            nodeName={node.name}
            nodeType={node.type}
            files={files}
            onClose={() => setViewingNodeId(null)}
            onSave={(updatedFiles) => {
              setNodeCode(prev => ({ ...prev, [viewingNodeId]: updatedFiles }));
              setWorkspaceFiles(prev => dedupeFiles([...prev, ...updatedFiles]));
              setActiveWorkspacePath(updatedFiles[0]?.path ?? activeWorkspacePath);
              setBuildDiagnostics([]);
            }}
          />
        ) : null;
      })()}

      {/* Floating chat button — visible when chat is closed or minimized */}
      {(!showChat || chatMinimized) && (
        <div className="chat-fab-wrap">
          <button
            className="chat-fab"
            onClick={() => {
              setShowChat(true);
              setChatMinimized(false);
              setChatUnread(0);
            }}
            title="Open AI Chat"
          >
            💬
          </button>
          {chatUnread > 0 && (
            <span className="chat-fab-badge">{chatUnread > 9 ? "9+" : chatUnread}</span>
          )}
        </div>
      )}

      {showChat && (
        <ChatPanel
          ai={ai}
          minimized={chatMinimized}
          onMinimize={() => setChatMinimized(true)}
          onMaximize={() => { setChatMinimized(false); setChatUnread(0); }}
          onClose={() => { setShowChat(false); setChatMinimized(false); setChatUnread(0); }}
          onNewMessage={() => setChatUnread(v => v + 1)}
          workspaceFiles={workspaceFiles}
        />
      )}

      {generationProgress && (
        <div className="gen-progress-hud">
          <div className="gen-progress-header">
            <span className="gen-progress-label">Generating service</span>
            <span className="gen-progress-count">
              {generationProgress.currentServiceIndex}/{generationProgress.totalServices}
              {" · "}
              {generationProgress.completedFiles} file{generationProgress.completedFiles === 1 ? "" : "s"}
            </span>
          </div>
          <div className="gen-progress-node">
            {generationProgress.serviceName}
            {generationProgress.currentFile ? ` · ${generationProgress.currentFile}` : ""}
          </div>
          <div className="gen-progress-bar-track">
            <div
              className="gen-progress-bar-fill"
              style={{
                width: `${Math.max(
                  8,
                  Math.round((generationProgress.currentServiceIndex / generationProgress.totalServices) * 100),
                )}%`,
              }}
            />
          </div>
          {generationProgress.streamPreview && (
            <pre className="gen-progress-stream">{generationProgress.streamPreview}</pre>
          )}
        </div>
      )}

      {genError && (
        <div className="gen-error-hud">
          <div className="gen-error-header">
            <span className="gen-error-icon">⚠</span>
            <span className="gen-error-message">{genError.message}</span>
            <button className="gen-error-close" onClick={() => setGenError(null)}>✕</button>
          </div>
          {genError.failedNodes && genError.failedNodes.length > 0 && (
            <ul className="gen-error-nodes">
              {genError.failedNodes.map(name => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
