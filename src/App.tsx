import { useState, useRef, useCallback, useMemo, useEffect, type ChangeEvent } from "react";
import "./styles.css";
import { saveAs } from "file-saver";

import Palette from "./components/Palette";
import Canvas from "./components/Canvas";
import CodePanel from "./components/CodePanel";
import FileWorkspace, { type WorkspaceFile } from "./components/FileWorkspace";
import Topbar, { ProjectConfigModal, type JavaProjectConfig } from "./components/Topbar";
import Settings, { type AISettings } from "./components/Settings";
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

const dedupeFiles = (files: WorkspaceFile[]) => {
  const fileMap = new Map<string, string>();
  for (const file of files) fileMap.set(file.path, file.content);
  return Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }));
};

const isHiddenWorkspacePlaceholder = (path: string) => path.split("/").pop() === ".gitkeep";

const hasWorkspacePath = (files: WorkspaceFile[], path: string) => files.some(file => file.path === path);

const getBuildCommand = (files: WorkspaceFile[], buildTool: BuildTool) => {
  if (buildTool === "gradle" || hasWorkspacePath(files, "build.gradle") || hasWorkspacePath(files, "build.gradle.kts")) {
    return hasWorkspacePath(files, "gradlew") ? "chmod +x ./gradlew && ./gradlew build" : "gradle build";
  }

  return hasWorkspacePath(files, "mvnw") ? "chmod +x ./mvnw && ./mvnw clean package" : "mvn clean package";
};

const getRunCommand = (files: WorkspaceFile[], buildTool: BuildTool) => {
  if (buildTool === "gradle" || hasWorkspacePath(files, "build.gradle") || hasWorkspacePath(files, "build.gradle.kts")) {
    return hasWorkspacePath(files, "gradlew") ? "chmod +x ./gradlew && ./gradlew bootRun" : "gradle bootRun";
  }

  return hasWorkspacePath(files, "mvnw") ? "chmod +x ./mvnw && ./mvnw spring-boot:run" : "mvn spring-boot:run";
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
};

export default function App() {
  /* =======================
     STATE
  ======================= */

  const [theme, setTheme] = useState<"dark" | "light">("dark");
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
  const [workspaceView, setWorkspaceView] = useState<"canvas" | "editor">("canvas");
  const [projectGenerating, setProjectGenerating] = useState(false);
  const [runnerBusy, setRunnerBusy] = useState(false);
  const [genError, setGenError] = useState<{ message: string; failedNodes?: string[] } | null>(null);

  const [camera, setCamera] = useState<Camera>({ x: 120, y: 72, scale: 1 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const projectGenerationInFlightRef = useRef(false);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

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
    const restoredFiles = parsed.workspaceFiles ?? Object.values(parsed.nodeCode ?? {}).flat();
    setWorkspaceFiles(restoredFiles);
    setActiveWorkspacePath(restoredFiles[0]?.path ?? null);
    setWorkspaceView(restoredFiles.length > 0 ? "editor" : "canvas");
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

  const onLoadProject = useCallback(() => {
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
        if (!validateProjectData(parsed)) throw new Error("Invalid project file");
        applyProjectData(parsed);
        setProjectFileHandle(handle);
        setActiveProjectStarted(true);
      } catch (err: any) {
        if (err.name !== "AbortError") {
          console.error(err);
          alert("Could not open this project file.");
        }
      }
    } else {
      projectFileInputRef.current?.click();
    }
  }, [applyProjectData]);

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
      if (!validateProjectData(parsed)) throw new Error("Invalid project file");
      applyProjectData(parsed);
      setProjectFileHandle(null);
      setActiveProjectStarted(true);
    } catch (error) {
      console.error(error);
      alert("Could not open this project file.");
    } finally {
      e.target.value = "";
    }
  }, [applyProjectData]);

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
  }, [buildTool, javaVersion, springBootVersion, graph, nodeCode, projectName, prompt, projectFileHandle, workspaceFiles]);

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
      }, null, 2),
    }];

    // 5. Merge all — scaffold base, then generated src, then meta files
    const allFiles = [...scaffoldFiles, ...generatedFiles, ...promptFile, ...archFile];

    // Deduplicate: later entries win (generated src overrides scaffold placeholders)
    const fileMap = new Map<string, string>();
    for (const f of allFiles) fileMap.set(f.path, f.content);
    const dedupedFiles = Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }));

    await zipService.download(dedupedFiles, projectName);
  }, [buildTool, javaVersion, springBootVersion, graph, nodeCode, projectName, prompt, scaffoldService, workspaceFiles, zipService]);

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
    });

    return dedupeFiles([...scaffoldFiles, ...generatedFiles]);
  }, [buildTool, javaVersion, nodeCode, projectName, scaffoldService, springBootVersion, workspaceFiles]);

  const runProjectCommand = useCallback(async (mode: "build" | "run") => {
    if (!window.electronAPI?.materializeWorkspace) {
      alert("Build and Run are available in the Electron desktop app.");
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
      alert(error?.message ?? "Could not start the project runner.");
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
        theme={theme}
        setTheme={setTheme}
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
      />

      <div className="main">
        <div className="workspace-shell">
          <nav className="workspace-rail" aria-label="Workspace views">
            <button
              className={`workspace-rail-btn ${workspaceView === "canvas" ? "active" : ""}`}
              onClick={() => setWorkspaceView("canvas")}
              title="Components"
              aria-label="Components"
              aria-pressed={workspaceView === "canvas"}
            >
              <span className="workspace-rail-icon">C</span>
              <span className="workspace-rail-label">Components</span>
            </button>
            <button
              className={`workspace-rail-btn ${workspaceView === "editor" ? "active" : ""}`}
              onClick={() => setWorkspaceView("editor")}
              title="Code editor"
              aria-label="Code editor"
              aria-pressed={workspaceView === "editor"}
            >
              <span className="workspace-rail-icon">E</span>
              <span className="workspace-rail-label">Editor</span>
            </button>
          </nav>

          {workspaceView === "canvas" && (
            <aside className="workspace-side-pane">
              <Palette embedded />
            </aside>
          )}

          <div className="workspace-main">
            {workspaceView === "canvas" ? (
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
            ) : (
              <FileWorkspace
                files={workspaceFiles}
                activePath={activeWorkspacePath}
                onActivePathChange={setActiveWorkspacePath}
                onFilesChange={setWorkspaceFiles}
                editorTheme={theme}
                onBuildProject={() => void runProjectCommand("build")}
                onRunProject={() => void runProjectCommand("run")}
                runnerBusy={runnerBusy}
              />
            )}
          </div>
        </div>

        <CodePanel
          prompt={prompt}
          setPrompt={setPrompt}
          filesCount={workspaceFiles.length}
          onGenerateProject={generateProjectWithAI}
          onOpenEditor={() => setWorkspaceView("editor")}
          aiGenerating={projectGenerating}
          canGenerateProject={!!settings && (hasPrompt || hasCanvasContent)}
        />
      </div>

      <TerminalDock />

      {showSettings && (
        <div className="modal" onClick={() => setShowSettings(false)}>
          <div onClick={(e) => e.stopPropagation()}>
            <Settings
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
