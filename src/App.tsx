import { useState, useRef, useCallback, useMemo, useEffect, type ChangeEvent } from "react";
import "./styles.css";
import { saveAs } from "file-saver";

import Palette from "./components/Palette";
import Canvas from "./components/Canvas";
import CodePanel from "./components/CodePanel";
import FileWorkspace, { type WorkspaceFile } from "./components/FileWorkspace";
import ApiTester from "./components/ApiTester";
import Topbar, { ProjectConfigModal, type JavaProjectConfig, type RepositoryGitOperation } from "./components/Topbar";
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

import { buildAIPrompt } from "./utils/promptBuilder";
import { parseMultiFileResponse } from "./utils/stringUtils";

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

const MIN_SCALE = 0.5;
const MAX_SCALE = 2.4;
const ZOOM_STEP = 1.14;
const RECENT_PROJECTS_KEY = "archiviz_recent_projects";
const MAX_RECENT_PROJECTS = 6;
const EDITOR_SETTINGS_KEY    = "archiviz_editor_settings";
const DOCKER_SETTINGS_KEY    = "archiviz_docker_settings";
const GIT_SETTINGS_KEY       = "archiviz_git_settings";
const TERMINAL_SETTINGS_KEY  = "archiviz_terminal_settings";

const dedupeFiles = (files: WorkspaceFile[]) => {
  const fileMap = new Map<string, string>();
  for (const file of files) fileMap.set(file.path, file.content);
  return Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }));
};

const isHiddenWorkspacePlaceholder = (path: string) => path.split("/").pop() === ".gitkeep";


const getBuildCommand = (_files: WorkspaceFile[], buildTool: BuildTool) => {
  return buildTool === "gradle"
    ? "gradle clean build -x test"
    : "mvn clean package -DskipTests";
};

const getRunCommand = (_files: WorkspaceFile[], buildTool: BuildTool) => {
  return buildTool === "gradle"
    ? "gradle bootRun"
    : "mvn spring-boot:run";
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
    return saved === "black" || saved === "red" || saved === "purple" || saved === "green" || saved === "blue"
      ? saved
      : "black";
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

  const language: Language = "java";
  const [javaVersion, setJavaVersion] = useState<JavaVersion>("21");
  const [springBootVersion, setSpringBootVersion] = useState<SpringBootVersion>("3.4");
  const [buildTool, setBuildTool] = useState<BuildTool>("maven");

  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] });

  const [prompt, setPrompt] = useState("");

  const [projectName, setProjectName] = useState("architecture-app");
  const [importingProject, setImportingProject] = useState(false);
  const [projectFileHandle, setProjectFileHandle] = useState<FileSystemFileHandle | null>(null);
  const [activeProjectStarted, setActiveProjectStarted] = useState(false);
  const [showStartupProjectConfig, setShowStartupProjectConfig] = useState(false);
  const [recentProjects, setRecentProjects] = useState<RecentProject[]>(loadRecentProjects);

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
  const [nodeCode, setNodeCode] = useState<Record<string, { path: string; content: string }[]>>({});
  const [workspaceFiles, setWorkspaceFiles] = useState<WorkspaceFile[]>([]);
  const [activeWorkspacePath, setActiveWorkspacePath] = useState<string | null>(null);
  const [workspaceView, setWorkspaceView] = useState<"canvas" | "editor" | "api" | null>("canvas");
  const [gitRepositoryReady, setGitRepositoryReady] = useState(false);
  const [topbarGitBusy, setTopbarGitBusy] = useState(false);
  const [topbarGitOperation, setTopbarGitOperation] = useState<RepositoryGitOperation>("init");
  const [topbarGitRemoteUrl, setTopbarGitRemoteUrl] = useState("");
  const [topbarGitCurrentBranch, setTopbarGitCurrentBranch] = useState("main");
  const [topbarGitTargetBranch, setTopbarGitTargetBranch] = useState("main");
  const [topbarGitBranches, setTopbarGitBranches] = useState<string[]>([]);
  const [projectGenerating, setProjectGenerating] = useState(false);
  const [runnerBusy, setRunnerBusy] = useState(false);
  const [genError, setGenError] = useState<{ message: string; failedNodes?: string[] } | null>(null);

  const [camera, setCamera] = useState<Camera>({ x: 120, y: 72, scale: 1 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const projectGenerationInFlightRef = useRef(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  const toggleWorkspaceView = useCallback((view: "canvas" | "editor" | "api") => {
    setWorkspaceView(current => current === view ? null : view);
  }, []);

  useEffect(() => {
    localStorage.setItem("archiviz_theme", theme);
  }, [theme]);

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

  /* =======================
     GRAPH ACTIONS
  ======================= */

  const addNode = (type: NodeType, x: number, y: number) => {
    setGraph((g) => ({
      ...g,
      nodes: [...g.nodes, { id: genId(), type, name: type, x, y }],
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
    (e: React.PointerEvent, node: NodeData) => {
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

  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("type") as NodeType;
    if (!type) return;

    const { x, y } = clientToWorld(e.clientX, e.clientY);
    addNode(type, x - 80, y - 40);
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  const onCanvasPointerDown = useCallback(
    (e: React.PointerEvent<HTMLDivElement>) => {
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
    (e: React.PointerEvent<SVGPathElement>, edgeId: string) => {
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
    setSelectedIds([]);
    setSelectedEdgeId(null);
    setWire(null);
    setDrag(null);
    setPan(null);
    setPrompt("");
    setNodeCode({});
    setWorkspaceFiles([]);
    setActiveWorkspacePath(null);
    setWorkspaceView("canvas");
    setGitRepositoryReady(false);
    setTopbarGitBranches([]);
    setTopbarGitCurrentBranch("main");
    setTopbarGitTargetBranch("main");
    setCamera({ x: 120, y: 72, scale: 1 });
  }, []);

  const createNewProject = useCallback(() => {
    setProjectName("architecture-app");
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
    setNodeCode({});
    setWorkspaceFiles([]);
    setActiveWorkspacePath(null);
    setWorkspaceView("canvas");
    setGitRepositoryReady(false);
    setTopbarGitBranches([]);
    setTopbarGitCurrentBranch("main");
    setTopbarGitTargetBranch("main");
  }, []);

  const createConfiguredProject = useCallback((cfg: JavaProjectConfig) => {
    createNewProject();
    setProjectName(cfg.projectName);
    setJavaVersion(cfg.javaVersion);
    setSpringBootVersion(cfg.springBootVersion);
    setBuildTool(cfg.buildTool);
    setActiveProjectStarted(true);
  }, [createNewProject]);

  const applyProjectData = useCallback((parsed: SavedProjectFile) => {
    setProjectName(parsed.projectName);
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
    setActiveWorkspacePath(restoredFiles[0]?.path ?? null);
    setWorkspaceView(restoredFiles.length > 0 ? "editor" : "canvas");
    setGitRepositoryReady(false);
    setTopbarGitBranches([]);
    setTopbarGitCurrentBranch("main");
    setTopbarGitTargetBranch("main");
  }, []);

  const validateProjectData = (parsed: Partial<SavedProjectFile>): parsed is SavedProjectFile => (
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

  const rememberRecentProject = useCallback((project: { name: string; path?: string; fileName?: string }) => {
    setRecentProjects(prev => {
      const id = project.path || project.fileName || project.name;
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

      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const forgetRecentProject = useCallback((id: string) => {
    setRecentProjects(prev => {
      const next = prev.filter(item => item.id !== id);
      localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const openParsedProject = useCallback((
    parsed: Partial<SavedProjectFile>,
    options: { handle?: FileSystemFileHandle | null; path?: string; fileName?: string } = {}
  ) => {
    if (!validateProjectData(parsed)) throw new Error("Invalid project file");
    applyProjectData(parsed);
    setProjectFileHandle(options.handle ?? null);
    setActiveProjectStarted(true);
    rememberRecentProject({
      name: parsed.projectName,
      path: options.path,
      fileName: options.fileName,
    });
  }, [applyProjectData, rememberRecentProject]);

  const onLoadProject = useCallback(() => {
    folderInputRef.current?.click();
  }, []);

  const onOpenSavedProject = useCallback(async () => {
    if (window.electronAPI?.openProjectFile) {
      try {
        const result = await window.electronAPI.openProjectFile();
        if (!result) return;
        const parsed = JSON.parse(result.content) as Partial<SavedProjectFile>;
        openParsedProject(parsed, { path: result.path, fileName: result.name });
      } catch (err: any) {
        console.error(err);
        alert("Could not open this project file.");
      }
      return;
    }

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
    if (recent.path && window.electronAPI?.readProjectFile) {
      try {
        const result = await window.electronAPI.readProjectFile(recent.path);
        const parsed = JSON.parse(result.content) as Partial<SavedProjectFile>;
        openParsedProject(parsed, { path: result.path, fileName: result.name });
      } catch (error: any) {
        console.error(error);
        alert(error?.message ?? "Could not reopen this project.");
        forgetRecentProject(recent.id);
      }
      return;
    }

    alert("This recent project needs to be selected again from disk.");
    projectFileInputRef.current?.click();
  }, [forgetRecentProject, openParsedProject]);

  const onProjectFolderSelected = useCallback(
    async (e: ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files;
      if (!files || files.length === 0) return;

      setImportingProject(true);

      try {
        const importedProject = await projectImportService.importFromFiles(files);

        setProjectName(importedProject.projectName);
        setGraph(importedProject.graph);
        setSelectedIds([]);
        setSelectedEdgeId(null);
        setWire(null);
        setDrag(null);
        setPan(null);
        setPrompt(
          buildAIPrompt(
            importedProject.graph,
            javaVersion,
            springBootVersion,
            importedProject.projectName
          )
        );
        setCamera({ x: 120, y: 72, scale: 1 });
        setWorkspaceView("canvas");
      } catch (error) {
        console.error(error);
      } finally {
        setImportingProject(false);
        e.target.value = "";
      }
    },
    [projectImportService, javaVersion, springBootVersion]
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
    const payload: SavedProjectFile = {
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
    };
    const json = JSON.stringify(payload, null, 2);

    if (projectFileHandle) {
      try {
        const writable = await projectFileHandle.createWritable();
        await writable.write(json);
        await writable.close();
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
      } catch (err: any) {
        if (err.name !== "AbortError") console.error(err);
      }
      return;
    }

    // Fallback for browsers without File System Access API
    saveAs(new Blob([json], { type: "application/json;charset=utf-8" }), `${projectName || "project"}.archbuilder.json`);
  }, [buildTool, dockerSettings, javaVersion, springBootVersion, graph, nodeCode, projectName, prompt, projectFileHandle, workspaceFiles]);

  /* =======================
     EXPORT TO IDE ZIP
  ======================= */

  const exportProject = useCallback(async () => {
    // 1. Collect AI-generated source files (each node now stores an array of files)
    const generatedFiles = workspaceFiles.length > 0 ? workspaceFiles : Object.values(nodeCode).flat();

    // 2. Build scaffold (pom.xml/build.gradle, Dockerfile, docker-compose, Terraform, etc.)
    const scaffoldFiles = scaffoldService.generate({
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
  }, [buildTool, dockerSettings, javaVersion, springBootVersion, graph, nodeCode, projectName, prompt, scaffoldService, workspaceFiles, zipService]);

  const getRunnableProjectFiles = useCallback(() => {
    const generatedFiles = (workspaceFiles.length > 0 ? workspaceFiles : Object.values(nodeCode).flat())
      .filter(file => !isHiddenWorkspacePlaceholder(file.path));

    if (generatedFiles.length === 0) return [];

    const scaffoldFiles = scaffoldService.generate({
      projectName,
      javaVersion,
      springBootVersion,
      buildTool,
      generatedFiles,
      docker: dockerSettings,
    });

    return dedupeFiles([...scaffoldFiles, ...generatedFiles]);
  }, [buildTool, dockerSettings, javaVersion, nodeCode, projectName, scaffoldService, springBootVersion, workspaceFiles]);

  const runTopbarGit = useCallback(async (args: string[], filesOverride?: WorkspaceFile[]) => {
    if (!window.electronAPI?.runGit) {
      if (!window.electronAPI) {
        alert("Git operations are only available in the Electron desktop app, not the browser.");
      } else {
        alert("Git IPC handler not loaded. Quit and restart the Electron app so the latest preload is applied.");
      }
      return null;
    }

    return window.electronAPI.runGit({
      projectName,
      files: filesOverride ?? getRunnableProjectFiles(),
      args,
    });
  }, [getRunnableProjectFiles, projectName]);

  const refreshTopbarGit = useCallback(async (filesOverride?: WorkspaceFile[]) => {
    if (!window.electronAPI?.runGit) return;

    const files = filesOverride ?? getRunnableProjectFiles();
    const base = { projectName, files };
    const [status, branchList] = await Promise.all([
      window.electronAPI.runGit({ ...base, args: ["status", "--short", "--branch"] }),
      window.electronAPI.runGit({ ...base, args: ["branch", "--list"] }),
    ]);

    const parsedBranches = branchList.stdout.split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean)
      .map(line => line.replace(/^\*\s*/, ""));
    const active = branchList.stdout.split(/\r?\n/).find(line => line.startsWith("* "));
    const activeBranch = active?.replace(/^\*\s*/, "").trim();

    setGitRepositoryReady(status.isRepository || branchList.isRepository);
    setTopbarGitBranches(parsedBranches);
    if (activeBranch) {
      setTopbarGitCurrentBranch(activeBranch);
      setTopbarGitTargetBranch(prev => prev && parsedBranches.includes(prev) ? prev : activeBranch);
    }
  }, [getRunnableProjectFiles, projectName]);

  const runTopbarGitOperation = useCallback(async () => {
    const runnableFiles = getRunnableProjectFiles();
    const currentBranch = topbarGitCurrentBranch || "main";
    const targetBranch = topbarGitTargetBranch || currentBranch;

    const run = async (args: string[]) => runTopbarGit(args, runnableFiles);

    setTopbarGitBusy(true);
    try {
      if (topbarGitOperation === "init") {
        const result = await run(["init"]);
        if (result?.ok || result?.isRepository) {
          await run(["branch", "-M", currentBranch]);
          setGitRepositoryReady(true);
          setWorkspaceView("editor");
        }
      } else if (topbarGitOperation === "status") {
        await refreshTopbarGit(runnableFiles);
      } else if (topbarGitOperation === "fetch") {
        await run(["fetch", "--all", "--prune"]);
      } else if (topbarGitOperation === "set-origin") {
        const url = topbarGitRemoteUrl.trim();
        if (!url) {
          alert("Enter an origin remote URL first.");
          return;
        }
        await run(["remote", "remove", "origin"]);
        await run(["remote", "add", "origin", url]);
      } else if (topbarGitOperation === "pull") {
        await run(["pull", "origin", currentBranch]);
      } else if (topbarGitOperation === "push") {
        await run(["push", "-u", "origin", currentBranch]);
      } else if (topbarGitOperation === "rebase") {
        await run(["rebase", targetBranch]);
      } else if (topbarGitOperation === "merge") {
        await run(["merge", targetBranch]);
      } else if (topbarGitOperation === "stash") {
        await run(["stash", "push", "-u", "-m", "Archiviz workspace snapshot"]);
      } else if (topbarGitOperation === "stash-pop") {
        await run(["stash", "pop"]);
      } else if (topbarGitOperation === "abort-rebase") {
        await run(["rebase", "--abort"]);
      } else if (topbarGitOperation === "abort-merge") {
        await run(["merge", "--abort"]);
      }

      await refreshTopbarGit(runnableFiles);
    } catch (error: any) {
      alert(error?.message ?? "Git operation failed.");
    } finally {
      setTopbarGitBusy(false);
    }
  }, [
    getRunnableProjectFiles,
    refreshTopbarGit,
    runTopbarGit,
    topbarGitCurrentBranch,
    topbarGitOperation,
    topbarGitRemoteUrl,
    topbarGitTargetBranch,
  ]);

  const runProjectCommand = useCallback(async (mode: "build" | "run") => {
    if (!window.electronAPI?.materializeWorkspace) {
      if (!window.electronAPI) {
        alert("Build and Run are only available in the Electron desktop app, not the browser.");
      } else {
        alert("Build/Run IPC handler not loaded. Quit and restart the Electron app so the latest preload is applied.");
      }
      return;
    }

    const runnableFiles = getRunnableProjectFiles();
    if (runnableFiles.length === 0) {
      alert("Generate or create project files before building.");
      return;
    }

    setRunnerBusy(true);

    try {
      const { cwd } = await window.electronAPI.materializeWorkspace({
        projectName,
        files: runnableFiles,
      });
      const command = mode === "build"
        ? getBuildCommand(runnableFiles, buildTool)
        : getRunCommand(runnableFiles, buildTool);

      window.dispatchEvent(new CustomEvent("archiviz:terminal-command", {
        detail: {
          cwd,
          title: mode === "build" ? "Build" : "Run",
          command,
        },
      }));
    } catch (error: any) {
      console.error("[runner]", error);
      const message = String(error?.message ?? "");
      alert(message.includes("No handler registered for 'workspace:materialize'")
        ? "Build/Run support was added to Electron. Restart the desktop app with npm run dev so the main process can load the new IPC handler."
        : message || "Could not start the project runner.");
    } finally {
      setRunnerBusy(false);
    }
  }, [buildTool, getRunnableProjectFiles, projectName]);

  /* =======================
     PROMPT
  ======================= */

  const generate = () => {
    if (!hasCanvasContent) {
      alert("Add at least one node to the canvas before generating a prompt.");
      return;
    }

    const p = buildAIPrompt(graph, javaVersion, springBootVersion, projectName);
    setPrompt(p);
  };

  const generateProjectWithAI = useCallback(async () => {
    if (projectGenerationInFlightRef.current) return;

    if (!settings || !ai) {
      alert("Configure AI first");
      return;
    }

    let sourcePrompt = prompt.trim();
    if (!sourcePrompt && hasCanvasContent) {
      sourcePrompt = buildAIPrompt(graph, javaVersion, springBootVersion, projectName);
      setPrompt(sourcePrompt);
    }

    if (!sourcePrompt) {
      alert("Write a prompt or add nodes before generating a project.");
      return;
    }

    setProjectGenerating(true);
    projectGenerationInFlightRef.current = true;
    setGenError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const projectPrompt = [
        `Generate a complete ${buildTool} Java ${javaVersion} Spring Boot ${springBootVersion} project named "${projectName || "architecture-app"}".`,
        "Return multiple files only with this exact marker before each file:",
        "=== FILE: path/to/file.ext ===",
        "Include build files, application entrypoint, configuration, and implementation files needed for the described architecture.",
        "Do not wrap the answer in Markdown fences.",
        "",
        sourcePrompt,
      ].join("\n");

      const raw = await ai.callStream(
        [{ role: "user", content: projectPrompt }],
        () => {},
        controller.signal
      );
      const files = dedupeFiles(parseMultiFileResponse(raw, "README.md"));

      setWorkspaceFiles(files);
      setActiveWorkspacePath(files[0]?.path ?? null);
      setWorkspaceView("editor");
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("[project-generator]", err);
        setGenError({ message: err?.message ?? "Project generation failed. Check your AI settings and try again." });
      }
    } finally {
      projectGenerationInFlightRef.current = false;
      setProjectGenerating(false);
    }
  }, [ai, buildTool, graph, hasCanvasContent, javaVersion, projectName, prompt, settings, springBootVersion]);

  /* =======================
     CLEANUP
  ======================= */

  useEffect(() => {
    return () => abortRef.current?.abort();
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

    const handlePointerMove = (e: PointerEvent) => {
      movePointerInteraction(e.clientX, e.clientY);
    };

    const handlePointerUp = (e: PointerEvent) => {
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

  // suppress unused warning — language is kept for potential future use
  void language;

  /* =======================
     UI
  ======================= */

  return (
    <div className={`app ${theme}`}>
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
              <p>Open a saved architecture workspace or create a fresh Spring Boot project.</p>
            </div>
            <div className="startup-actions">
              <button className="btn btn-primary startup-action" onClick={() => setShowStartupProjectConfig(true)}>
                Create New Project
              </button>
              <button className="btn startup-action" onClick={onOpenSavedProject}>
                Open Project
              </button>
            </div>
            <div className="startup-history">
              <div className="startup-history-header">
                <span>Recent Projects</span>
                {recentProjects.length > 0 && (
                  <button
                    className="startup-history-clear"
                    onClick={() => {
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

      <Topbar
        generate={generate}
        canGenerate={hasCanvasContent}
        canSaveProject={hasProjectData}
        importingProject={importingProject}
        javaVersion={javaVersion}
        setJavaVersion={setJavaVersion}
        springBootVersion={springBootVersion}
        setSpringBootVersion={setSpringBootVersion}
        projectName={projectName}
        setProjectName={setProjectName}
        buildTool={buildTool}
        setBuildTool={setBuildTool}
        onOpenSettings={() => setShowSettings(true)}
        onCreateProject={createNewProject}
        onOpenProject={onOpenSavedProject}
        onImportProject={onLoadProject}
        onSaveProject={saveProject}
        onExportProject={exportProject}
        gitRepositoryReady={gitRepositoryReady}
        gitBusy={topbarGitBusy}
        gitOperation={topbarGitOperation}
        setGitOperation={setTopbarGitOperation}
        gitRemoteUrl={topbarGitRemoteUrl}
        setGitRemoteUrl={setTopbarGitRemoteUrl}
        gitCurrentBranch={topbarGitCurrentBranch}
        gitTargetBranch={topbarGitTargetBranch}
        setGitTargetBranch={setTopbarGitTargetBranch}
        gitBranches={topbarGitBranches}
        onRunGitOperation={runTopbarGitOperation}
      />

      <div className="main">
        <div className="workspace-shell">
          <div className="workspace-content">
            <nav className="workspace-rail" aria-label="Workspace views">
              <button
                className={`workspace-rail-btn ${workspaceView === "canvas" ? "active" : ""}`}
                onClick={() => toggleWorkspaceView("canvas")}
                title={workspaceView === "canvas" ? "Close components" : "Open components"}
                aria-label="Components"
                aria-pressed={workspaceView === "canvas"}
              >
                <span className="workspace-rail-icon">C</span>
                <span className="workspace-rail-label">Components</span>
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
              <aside className="workspace-side-pane">
                <Palette embedded workspaceFiles={workspaceFiles} />
              </aside>
            )}

            <div className="workspace-main">
              {workspaceView === "editor" ? (
                <FileWorkspace
                  files={getRunnableProjectFiles()}
                  activePath={activeWorkspacePath}
                  onActivePathChange={setActiveWorkspacePath}
                  onFilesChange={setWorkspaceFiles}
                  editorTheme="dark"
                  editorSettings={editorSettings}
                  showGitFolder={gitRepositoryReady}
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
                  generatedNodeIds={new Set(Object.keys(nodeCode))}
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
                />
              )}
            </div>
          </div>

          <TerminalDock terminalSettings={terminalSettings} />
        </div>

        <CodePanel
          prompt={prompt}
          setPrompt={setPrompt}
          filesCount={workspaceFiles.length}
          projectName={projectName}
          files={getRunnableProjectFiles()}
          gitSettings={gitSettings}
          gitRepositoryReady={gitRepositoryReady}
          onGitRepositoryChange={setGitRepositoryReady}
          onGenerateProject={generateProjectWithAI}
          onOpenEditor={() => setWorkspaceView("editor")}
          aiGenerating={projectGenerating}
          canGenerateProject={!!settings && (hasPrompt || hasCanvasContent)}
        />
      </div>

      {showSettings && (
        <div className="modal" onClick={() => setShowSettings(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Settings
              theme={theme}
              setTheme={setTheme}
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
        const files = nodeCode[viewingNodeId];
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
        />
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
