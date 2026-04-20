import { useState, useRef, useCallback, useMemo, useEffect, type ChangeEvent } from "react";
import "./styles.css";
import { saveAs } from "file-saver";

import Palette from "./components/Palette";
import Canvas from "./components/Canvas";
import CodePanel from "./components/CodePanel";
import Topbar from "./components/Topbar";
import Settings, { type AISettings } from "./components/Settings";
import NodeConfigModal from "./components/NodeConfigModal";
import NodeCodeModal from "./components/NodeCodeModal";

import type { Graph, NodeType, Camera, Language, NodeData, Edge } from "./types";

import { AIService } from "./services/AIService";
import { GraphService } from "./services/GraphService";
import { ProjectImportService } from "./services/ProjectImportService";
import { ZipService } from "./services/ZipService";
import { ProjectScaffoldService } from "./services/ProjectScaffoldService";

import {
  buildAIPrompt,
  buildNodeImplementationPrompt,
  getGeneratedFilePath,
} from "./utils/promptBuilder";
import { cleanAIResponse } from "./utils/stringUtils";

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

const BUILD_TOOLS_BY_LANGUAGE: Record<Language, string[]> = {
  javascript: ["npm", "pnpm", "yarn"],
  typescript: ["npm", "pnpm", "yarn"],
  python: ["pip", "poetry", "uv"],
  java: ["maven", "gradle"],
  cpp: ["cmake", "make", "meson"],
};

type SavedProjectFile = {
  version: 1;
  savedAt: string;
  projectName: string;
  language: Language;
  framework: string;
  buildTool: string;
  prompt: string;
  graph: Graph;
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

  const [language, setLanguage] = useState<Language>("javascript");
  const [framework, setFramework] = useState("Spring Boot");

  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] });

  const [prompt, setPrompt] = useState("");

  const [projectName, setProjectName] = useState("architecture-app");
  const [buildTool, setBuildTool] = useState("npm");
  const [loading, setLoading] = useState(false);
  const [importingProject, setImportingProject] = useState(false);
  const [projectFileHandle, setProjectFileHandle] = useState<FileSystemFileHandle | null>(null);

  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selectedEdgeId, setSelectedEdgeId] = useState<string | null>(null);
  const [wire, setWire] = useState<WireState>(null);
  const [drag, setDrag] = useState<DragState>(null);
  const [pan, setPan] = useState<PanState>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [configuringNodeId, setConfiguringNodeId] = useState<string | null>(null);
  const [viewingNodeId, setViewingNodeId] = useState<string | null>(null);
  const [nodeCode, setNodeCode] = useState<Record<string, { path: string; content: string }>>({});
  const [generationProgress, setGenerationProgress] = useState<{ current: number; total: number; nodeName: string } | null>(null);
  const [genError, setGenError] = useState<{ message: string; failedNodes?: string[] } | null>(null);

  const [camera, setCamera] = useState<Camera>({ x: 120, y: 72, scale: 1 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const projectFileInputRef = useRef<HTMLInputElement>(null);

  /* =======================
     SERVICES (STABLE)
  ======================= */

  const ai = useMemo(() => {
    return settings ? new AIService(settings) : null;
  }, [settings]);

  const graphService = useMemo(() => {
    return new GraphService(graph);
  }, [graph]);

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
    (e: React.WheelEvent<HTMLDivElement>) => {
      e.preventDefault();

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
    setCamera({ x: 120, y: 72, scale: 1 });
  }, []);

  const createNewProject = useCallback(() => {
    setProjectName("architecture-app");
    setLanguage("javascript");
    setFramework("Node.js");
    setBuildTool("npm");
    setGraph({ nodes: [], edges: [] });
    setPrompt("");
    setSelectedIds([]);
    setSelectedEdgeId(null);
    setWire(null);
    setDrag(null);
    setPan(null);
    setCamera({ x: 120, y: 72, scale: 1 });
    setProjectFileHandle(null);
  }, []);

  const applyProjectData = useCallback((parsed: SavedProjectFile) => {
    setProjectName(parsed.projectName);
    setLanguage(parsed.language as Language);
    setFramework(parsed.framework);
    setBuildTool(parsed.buildTool);
    setPrompt(parsed.prompt);
    setGraph(parsed.graph);
    setSelectedIds([]);
    setSelectedEdgeId(null);
    setWire(null);
    setDrag(null);
    setPan(null);
    setCamera({ x: 120, y: 72, scale: 1 });
  }, []);

  const validateProjectData = (parsed: Partial<SavedProjectFile>): parsed is SavedProjectFile => (
    parsed.version === 1 &&
    !!parsed.graph &&
    Array.isArray(parsed.graph.nodes) &&
    Array.isArray(parsed.graph.edges) &&
    typeof parsed.projectName === "string" &&
    typeof parsed.language === "string" &&
    typeof parsed.framework === "string" &&
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
        setLanguage(importedProject.language);
        setFramework(importedProject.framework);
        setGraph(importedProject.graph);
        setSelectedIds([]);
        setSelectedEdgeId(null);
        setWire(null);
        setDrag(null);
        setPan(null);
        setPrompt(
          buildAIPrompt(
            importedProject.graph,
            importedProject.language,
            importedProject.framework,
            importedProject.projectName
          )
        );
        setCamera({ x: 120, y: 72, scale: 1 });
      } catch (error) {
        console.error(error);
      } finally {
        setImportingProject(false);
        e.target.value = "";
      }
    },
    [projectImportService]
  );

  // Fallback for browsers without File System Access API
  const onSavedProjectSelected = useCallback(async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as Partial<SavedProjectFile>;
      if (!validateProjectData(parsed)) throw new Error("Invalid project file");
      applyProjectData(parsed);
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
      language,
      framework,
      buildTool,
      prompt,
      graph,
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
  }, [buildTool, framework, graph, language, projectName, prompt, projectFileHandle]);

  /* =======================
     EXPORT TO IDE ZIP
  ======================= */

  const exportProject = useCallback(async () => {
    // 1. Collect AI-generated source files
    const generatedFiles = Object.values(nodeCode).map(({ path, content }) => ({ path, content }));

    // 2. Build scaffold (package.json, tsconfig, .gitignore, README, .vscode/, etc.)
    const scaffoldFiles = scaffoldService.generate({
      projectName,
      language,
      framework,
      buildTool,
      generatedFiles,
    });

    // 3. Embed the prompt as a reference file
    const promptFile = prompt.trim()
      ? [{ path: "arch-prompt.md", content: `# Architecture Prompt

${prompt}` }]
      : [];

    // 4. Embed the .archbuilder.json so the project can be reopened in Arch Builder
    const archFile = [{
      path: `${projectName || "project"}.archbuilder.json`,
      content: JSON.stringify({
        version: 1,
        savedAt: new Date().toISOString(),
        projectName,
        language,
        framework,
        buildTool,
        prompt,
        graph,
        nodeCode,
      }, null, 2),
    }];

    // 5. Merge all — scaffold base, then generated src, then meta files
    const allFiles = [...scaffoldFiles, ...generatedFiles, ...promptFile, ...archFile];

    // Deduplicate: later entries win (generated src overrides scaffold placeholders)
    const fileMap = new Map<string, string>();
    for (const f of allFiles) fileMap.set(f.path, f.content);
    const dedupedFiles = Array.from(fileMap.entries()).map(([path, content]) => ({ path, content }));

    await zipService.download(dedupedFiles, projectName);
  }, [buildTool, framework, graph, language, nodeCode, projectName, prompt, scaffoldService, zipService]);

  /* =======================
     PROMPT
  ======================= */

  const generate = () => {
    if (!hasCanvasContent) {
      alert("Add at least one node to the canvas before generating a prompt.");
      return;
    }

    const p = buildAIPrompt(graph, language, framework, projectName);
    setPrompt(p);
  };

  /* =======================
     ASK AI (ZIP GENERATION)
  ======================= */

  const askAI = async () => {
    if (!settings || !ai) return alert("Configure AI first");
    if (!hasPrompt) return alert("Generate or write a prompt before asking AI.");

    setLoading(true);
    setGenError(null);
    const controller = new AbortController();
    abortRef.current = controller;

    const nodes = graphService.getNodes();
    setGenerationProgress({ current: 0, total: nodes.length, nodeName: "" });

    const files: { path: string; content: string }[] = [];
    const newCode: Record<string, { path: string; content: string }> = {};
    const failedNodes: string[] = [];

    try {
      for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        setGenerationProgress({ current: i + 1, total: nodes.length, nodeName: node.name });

        try {
          const nodePrompt = buildNodeImplementationPrompt(graph, node, language, framework, projectName);
          const raw = await ai.call(nodePrompt, controller.signal);
          const content = cleanAIResponse(raw);
          const path = getGeneratedFilePath(language, node);
          files.push({ path, content });
          newCode[node.id] = { path, content };
        } catch (nodeErr: any) {
          if (nodeErr?.name === "AbortError") throw nodeErr; // bubble up — user cancelled
          console.error(`[generate] ${node.name}:`, nodeErr);
          failedNodes.push(node.name);
        }
      }

      if (Object.keys(newCode).length > 0) {
        setNodeCode(prev => ({ ...prev, ...newCode }));
        await zipService.download(files, projectName);
      }

      if (failedNodes.length > 0) {
        setGenError({
          message: `${failedNodes.length} component${failedNodes.length > 1 ? "s" : ""} failed to generate.`,
          failedNodes,
        });
      }
    } catch (err: any) {
      if (err?.name !== "AbortError") {
        console.error("[generate]", err);
        setGenError({ message: err?.message ?? "Generation failed. Check your AI settings and try again." });
      }
    } finally {
      setLoading(false);
      setGenerationProgress(null);
    }
  };


  /* =======================
     CLEANUP
  ======================= */

  useEffect(() => {
    return () => abortRef.current?.abort();
  }, []);

  useEffect(() => {
    const supportedBuildTools = BUILD_TOOLS_BY_LANGUAGE[language];
    if (supportedBuildTools.includes(buildTool)) return;
    setBuildTool(supportedBuildTools[0]);
  }, [buildTool, language]);

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

      <Topbar
        generate={generate}
        askAI={askAI}
        loading={loading}
        canGenerate={hasCanvasContent}
        canAskAI={hasPrompt}
        canSaveProject={hasProjectData}
        importingProject={importingProject}
        theme={theme}
        setTheme={setTheme}
        language={language}
        setLanguage={setLanguage}
        framework={framework}
        setFramework={setFramework}
        projectName={projectName}
        setProjectName={setProjectName}
        buildTool={buildTool}
        setBuildTool={setBuildTool}
        onOpenSettings={() => setShowSettings(true)}
        onCancel={() => abortRef.current?.abort()}
        onCreateProject={createNewProject}
        onOpenProject={onOpenSavedProject}
        onImportProject={onLoadProject}
        onSaveProject={saveProject}
        onExportProject={exportProject}
      />

      <div className="main">
        <Palette framework={framework} />

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

        <CodePanel prompt={prompt} setPrompt={setPrompt} />
      </div>

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
        const node = graph.nodes.find(n => n.id === viewingNodeId);
        const entry = nodeCode[viewingNodeId];
        return node && entry ? (
          <NodeCodeModal
            nodeName={node.name}
            nodeType={node.type}
            filePath={entry.path}
            code={entry.content}
            onClose={() => setViewingNodeId(null)}
          />
        ) : null;
      })()}

      {generationProgress && (
        <div className="gen-progress-hud">
          <div className="gen-progress-header">
            <span className="gen-progress-label">Generating code…</span>
            <span className="gen-progress-count">
              {generationProgress.current} / {generationProgress.total}
            </span>
          </div>
          <div className="gen-progress-node">{generationProgress.nodeName}</div>
          <div className="gen-progress-bar-track">
            <div
              className="gen-progress-bar-fill"
              style={{ width: `${(generationProgress.current / generationProgress.total) * 100}%` }}
            />
          </div>
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