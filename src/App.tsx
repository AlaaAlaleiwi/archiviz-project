import { useState, useRef, useEffect, useCallback } from "react";
import "./styles.css";

import Palette from "./components/Palette";
import Canvas from "./components/Canvas";
import CodePanel from "./components/CodePanel";
import Topbar from "./components/Topbar";

import type { Graph, NodeData, NodeType, Camera } from "./types";
import Settings, { type AISettings } from "./components/Settings";
import JSZip from "jszip";
import { saveAs } from "file-saver";

const genId = () => Math.random().toString(36).slice(2, 10);
const extensionMap = {
  javascript: "js",
  typescript: "ts",
  python: "py",
  java: "java",
  cpp: "cpp"
};
type GeneratedFile = {
  path: string;
  content: string;
};

type BuildTool = "maven" | "gradle";

const mainFileNameMap = {
  javascript: "index.js",
  typescript: "index.ts",
  python: "main.py",
  java: "Main.java",
  cpp: "main.cpp"
};
const cleanAIResponse = (text: string) => {
  return text
    .replace(/```[a-z]*\n?/gi, "")
    .replace(/```/g, "")
    .trim();
};
type Language = "javascript" | "typescript" | "python" | "java" | "cpp";

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const formatters: Record<Language, { node: (n: NodeData) => string; edge: (e: any) => string }> = {
  javascript: {
    node: (n) => `const ${n.id} = create${capitalize(n.type)}();`,
    edge: (e) => `${e.from}.connect(${e.to});`
  },
  typescript: {
    node: (n) => `const ${n.id}: Node = create${capitalize(n.type)}();`,
    edge: (e) => `${e.from}.connect(${e.to});`
  },
  python: {
    node: (n) => `${n.id} = create_${n.type}()`,
    edge: (e) => `${e.from}.connect(${e.to})`
  },
  java: {
    node: (n) => `Node ${n.id} = create${capitalize(n.type)}();`,
    edge: (e) => `${e.from}.connect(${e.to});`
  },
  cpp: {
    node: (n) => `Node* ${n.id} = create${capitalize(n.type)}();`,
    edge: (e) => `${e.from}->connect(${e.to});`
  }
};

export default function App() {
  // ── Persisted state — hydrated from localStorage on first render ─────
  const [theme, setTheme] = useState<"dark" | "light">(() => {
    try { return (localStorage.getItem("arch_theme") as "dark" | "light") || "dark"; } catch { return "dark"; }
  });
  const [settings, setSettings] = useState<AISettings | null>(() => {
    try { const s = localStorage.getItem("ai_settings"); return s ? JSON.parse(s) : null; } catch { return null; }
  });
  const [language, setLanguage] = useState<Language>(() => {
    try { return (localStorage.getItem("arch_language") as Language) || "javascript"; } catch { return "javascript"; }
  });
  const [graph, setGraph] = useState<Graph>(() => {
    try { const g = localStorage.getItem("arch_graph"); return g ? JSON.parse(g) : { nodes: [], edges: [] }; } catch { return { nodes: [], edges: [] }; }
  });
  const [code, setCode] = useState<string>(() => {
    try { return localStorage.getItem("arch_code") || ""; } catch { return ""; }
  });
  const [buildTool, setBuildTool] = useState<BuildTool>("maven");

  const BASE_PACKAGE = "com.generated.app";
  const [projectName, setProjectName] = useState("architecture-app");
  const [framework, setFramework] = useState("Spring Boot");
  const getFolders = () => ({
    java: "src/main/java/com/generated/app",
    resources: "src/main/resources"
  });

  const generatePomXml = () => `<?xml version="1.0" encoding="UTF-8"?>
<project xmlns="http://maven.apache.org/POM/4.0.0">
  <modelVersion>4.0.0</modelVersion>

  <groupId>com.generated</groupId>
  <artifactId>architecture-app</artifactId>
  <version>1.0.0</version>

  <parent>
    <groupId>org.springframework.boot</groupId>
    <artifactId>spring-boot-starter-parent</artifactId>
    <version>3.2.0</version>
  </parent>

  <properties>
    <java.version>17</java.version>
  </properties>

  <dependencies>
    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-web</artifactId>
    </dependency>

    <dependency>
      <groupId>org.springframework.boot</groupId>
      <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>

    <dependency>
      <groupId>com.h2database</groupId>
      <artifactId>h2</artifactId>
      <scope>runtime</scope>
    </dependency>
  </dependencies>

  <build>
    <plugins>
      <plugin>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-maven-plugin</artifactId>
      </plugin>
    </plugins>
  </build>
</project>`;

  const generateGradle = () => `
plugins {
  id 'java'
  id 'org.springframework.boot' version '3.2.0'
}

group = 'com.generated'
version = '1.0.0'

java {
  toolchain {
    languageVersion = JavaLanguageVersion.of(17)
  }
}

dependencies {
  implementation 'org.springframework.boot:spring-boot-starter-web'
  implementation 'org.springframework.boot:spring-boot-starter-data-jpa'
  runtimeOnly 'com.h2database:h2'
}
`;

  const generateMainClass = () => `
package ${BASE_PACKAGE};

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class Application {
  public static void main(String[] args) {
    SpringApplication.run(Application.class, args);
  }
}
`;
  const ensurePackage = (code: string) => {
    if (!code.includes(`package ${BASE_PACKAGE}`)) {
      return `package ${BASE_PACKAGE};\n\n${code}`;
    }
    return code;
  };

  const generateApplicationYml = () => `
spring:
  datasource:
    url: jdbc:h2:mem:testdb
    driverClassName: org.h2.Driver
  h2:
    console:
      enabled: true
`;
  // ── Non-persisted state ────────────────────────────────────────────────
  const [showSettings, setShowSettings] = useState(false);
  const [loading, setLoading] = useState(false);
  const [aiResponse, setAiResponse] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const [camera] = useState<Camera>({ x: 0, y: 0, scale: 1 });

  // ref to the canvas div — used to convert client → world coordinates
  const canvasRef = useRef<HTMLDivElement>(null);

  /* ---- coordinate helper ---- */
  const clientToWorld = useCallback(
    (cx: number, cy: number) => {
      const rect = canvasRef.current?.getBoundingClientRect() ?? { left: 0, top: 0 };
      return {
        x: (cx - rect.left - camera.x) / camera.scale,
        y: (cy - rect.top - camera.y) / camera.scale
      };
    },
    [camera]
  );

  /* =========================
     PERSISTENCE — save to localStorage whenever key state changes
  ========================= */
  useEffect(() => { try { localStorage.setItem("arch_graph", JSON.stringify(graph)); } catch { } }, [graph]);
  useEffect(() => { try { localStorage.setItem("arch_code", code); } catch { } }, [code]);
  useEffect(() => { try { localStorage.setItem("arch_theme", theme); } catch { } }, [theme]);
  useEffect(() => { try { localStorage.setItem("arch_language", language); } catch { } }, [language]);

  /* =========================
     DRAG STATE
  ========================= */
  const dragRef = useRef<{
    id: string;
    offsetX: number; // world-space offset from node origin to click point
    offsetY: number;
    lastX: number;
    lastY: number;
  } | null>(null);

  const frameRef = useRef<number | null>(null);

  // Holds the AbortController for the active streaming request — lets user cancel mid-stream
  const abortRef = useRef<AbortController | null>(null);

  const cancelAI = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setLoading(false);
  };

  /* =========================
     WIRE STATE  (world-space coords)
  ========================= */
  const [wire, setWire] = useState<null | {
    from: string;
    fromSide: "top" | "right" | "bottom" | "left";
    x1: number; y1: number; // port origin (world)
    x2: number; y2: number; // current mouse (world)
  }>(null);

  /* =========================
     ADD NODE
  ========================= */
  const addNode = (type: NodeType, x: number, y: number) => {
    setGraph(p => ({ ...p, nodes: [...p.nodes, { id: genId(), type, name: type, x, y }] }));
  };

  /* =========================
     DROP
  ========================= */
  const onDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const type = e.dataTransfer.getData("type") as NodeType;
    if (!type) return;
    const { x, y } = clientToWorld(e.clientX, e.clientY);
    addNode(type, x - 80, y - 40); // center node on cursor
  };

  const onDragOver = (e: React.DragEvent<HTMLDivElement>) => e.preventDefault();

  /* =========================
     NODE POINTER DOWN
  ========================= */
  const onNodePointerDown = (e: React.PointerEvent, node: NodeData) => {
    e.stopPropagation();
    // offset in world space between node origin and click point
    const { x: wx, y: wy } = clientToWorld(e.clientX, e.clientY);
    dragRef.current = {
      id: node.id,
      offsetX: wx - node.x,
      offsetY: wy - node.y,
      lastX: node.x,
      lastY: node.y
    };
    setSelectedIds([node.id]);
  };

  /* =========================
     GLOBAL POINTER EVENTS
  ========================= */
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
      frameRef.current = requestAnimationFrame(() => {

        // ---- node drag ----
        if (dragRef.current) {
          const { id, offsetX, offsetY } = dragRef.current;
          const { x: wx, y: wy } = clientToWorld(e.clientX, e.clientY);
          const nx = wx - offsetX;
          const ny = wy - offsetY;
          dragRef.current.lastX = nx;
          dragRef.current.lastY = ny;
          // move DOM element directly for zero-lag feel
          const el = document.getElementById(`node-${id}`);
          if (el) el.style.transform = `translate(${nx}px, ${ny}px)`;
        }

        // ---- wire drag ----
        if (wire) {
          const { x, y } = clientToWorld(e.clientX, e.clientY);
          setWire(w => w ? { ...w, x2: x, y2: y } : null);
        }
      });
    };

    const up = () => {
      if (dragRef.current) {
        const { id, lastX, lastY } = dragRef.current;
        setGraph(p => ({
          ...p,
          nodes: p.nodes.map(n => n.id === id ? { ...n, x: lastX, y: lastY } : n)
        }));
        dragRef.current = null;
      }
    };

    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
    };
  }, [wire, clientToWorld]);

  /* =========================
     START WIRE  (port pointerDown)
     clientX/Y → convert to world space immediately
  ========================= */
  const startWire = (
    id: string,
    side: "top" | "right" | "bottom" | "left",
    clientX: number,
    clientY: number
  ) => {
    const { x, y } = clientToWorld(clientX, clientY);
    setWire({ from: id, fromSide: side, x1: x, y1: y, x2: x, y2: y });
  };

  /* =========================
     END WIRE  (port pointerUp)
  ========================= */
  const endWire = (
    targetId: string,
    targetSide: "top" | "right" | "bottom" | "left"
  ) => {
    if (!wire) return;
    if (wire.from === targetId) { setWire(null); return; }

    const exists = graph.edges.some(e => e.from === wire.from && e.to === targetId);
    if (!exists) {
      setGraph(p => ({
        ...p,
        edges: [
          ...p.edges,
          { id: genId(), from: wire.from, to: targetId, fromSide: wire.fromSide, toSide: targetSide }
        ]
      }));
    }
    setWire(null);
  };

  /* =========================
     CANVAS POINTER DOWN  (background click)
  ========================= */
  const onCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).className;
    if (typeof tag === "string" && (tag.includes("canvas") || tag.includes("world") || tag.includes("grid"))) {
      setSelectedIds([]);
      setWire(null);
    }
  };

  /* =========================
     DELETE / RENAME
  ========================= */
  const onDelete = (id: string) => {
    setGraph(p => ({
      nodes: p.nodes.filter(n => n.id !== id),
      edges: p.edges.filter(e => e.from !== id && e.to !== id)
    }));
  };

  const onRename = (id: string, name: string) => {
    setGraph(p => ({ ...p, nodes: p.nodes.map(n => n.id === id ? { ...n, name } : n) }));
  };
  const [prompt, setPrompt] = useState("");
  /* =========================
     GENERATE CODE
  ========================= */
  const generate = () => {
    const builtPrompt = buildAIPrompt();
    setPrompt(builtPrompt);
    setCode(builtPrompt); // show in UI
  };

  /* =========================
     AI HELPERS
  ========================= */

  /** Builds the fetch options shared by all AI calls */
  const buildFetchOptions = (prompt: string, stream: boolean, signal: AbortSignal) => {
    const isOpenAI = settings?.provider === "openai";
    const url = isOpenAI
      ? "https://api.openai.com/v1/chat/completions"
      : `${settings?.baseUrl}/v1/chat/completions`;
    const model = (settings?.model || "").trim() || (isOpenAI ? "gpt-4o-mini" : "local-model");
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Accept": stream ? "text/event-stream" : "application/json",
    };
    if (isOpenAI) headers["Authorization"] = `Bearer ${settings?.apiKey}`;
    const body = JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 4096,
      stream,
    });
    return { url, headers, body, signal };
  };

  /**
   * Non-streaming call — awaits the full response and returns the text.
   * Used for per-node generation where we need the result before proceeding.
   */
  const callAI = async (prompt: string, signal: AbortSignal): Promise<string> => {
    const { url, headers, body } = buildFetchOptions(prompt, false, signal);
    const res = await fetch(url, { method: "POST", mode: "cors", headers, body, signal });
    if (!res.ok) { const t = await res.text(); throw new Error(`API error ${res.status}: ${t}`); }
    const data = await res.json();
    return data.choices?.[0]?.message?.content?.trim() || "";
  };

  /**
   * Streaming call — pipes tokens into setCode/setAiResponse as they arrive.
   * Used for the final assembled output so the user sees it build up live.
   */
  const sendToAI = async (prompt: string) => {
    if (!settings) { alert("Open Settings and configure your AI provider first."); return; }

    setLoading(true);
    setCode("");
    setAiResponse("");

    const controller = new AbortController();
    abortRef.current = controller;

    const { url, headers, body } = buildFetchOptions(prompt, true, controller.signal);

    try {
      const res = await fetch(url, {
        method: "POST",
        mode: "cors",
        headers,
        body,
        signal: controller.signal,
      });

      if (!res.ok) { const t = await res.text(); throw new Error(`API error ${res.status}: ${t}`); }
      if (!res.body) throw new Error("No response body — streaming not supported by this server.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          const data = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              accumulated += delta;
              setCode(accumulated);
              setAiResponse(accumulated);
            }
          } catch { }
        }
      }
      if (!accumulated) {
        setCode("// Model returned an empty response.");
        setAiResponse("// Model returned an empty response.");
      }
    } catch (err: any) {
      if (err.name === "AbortError") { setLoading(false); return; }
      const msg = `// Error: ${err.message || "AI request failed"}`;
      setAiResponse(msg);
      setCode(msg);
    } finally {
      setLoading(false);
    }
  };
  const downloadZip = async (files: GeneratedFile[]) => {
    const zip = new JSZip();

    files.forEach(file => {
      zip.file(file.path, file.content);
    });

    const blob = await zip.generateAsync({ type: "blob" });
    saveAs(blob, `${projectName || "architecture-project"}.zip`);
  };
const buildAIPrompt = () => {
  const nodeMap = new Map(graph.nodes.map(n => [n.id, n]));

  const nodesDesc = graph.nodes.map(n => {
    return `- ${n.name} (${n.type})`;
  }).join("\n");

  const edgesDesc = graph.edges.map(e => {
    const fromNode = nodeMap.get(e.from);
    const toNode = nodeMap.get(e.to);

    const fromName = fromNode ? `${fromNode.name} (${fromNode.type})` : e.from;
    const toName = toNode ? `${toNode.name} (${toNode.type})` : e.to;

    return `- ${fromName} → ${toName}`;
  }).join("\n");

  return `
You are a senior ${language} software architect specializing in ${framework}.

Project Name:
${projectName || "Unnamed Project"}

Goal:
Generate a production-ready backend system with clean architecture and best practices.

System Components:

${nodesDesc || "No components defined"}

System Relationships (VERY IMPORTANT):

${edgesDesc || "No connections defined"}

Architecture Rules:
- Use Clean Architecture (Controller → Service → Repository)
- Proper separation of concerns
- Use dependency injection
- No business logic in controllers
- Each component must be modular and testable
- Use DTOs for API communication
- Follow ${framework} best practices

Output Requirements:
- Full project structure
- All required files (controllers, services, repositories, models)
- Build file (Maven or Gradle depending on user selection)
- application configuration
- Dockerfile with multi-stage build
- Terraform configuration for AWS deployment
- Well-documented code with comments
- README with run instructions

Make the output production-ready and consistent.
`;
};
  const finalPrompt = prompt || buildAIPrompt();
  const askAI = async () => {
    if (graph.nodes.length === 0) {
      alert("Add nodes first");
      return;
    }

    if (!settings) {
      alert("Configure AI first");
      return;
    }

    setLoading(true);
    setCode("");

    const controller = new AbortController();
    abortRef.current = controller;
    const { signal } = controller;

    const files: GeneratedFile[] = [];
    const folders = getFolders();

    try {
      // =========================
      // GENERATE NODE FILES
      // =========================
      for (const node of graph.nodes) {
        if (signal.aborted) return;

        const cleanName = node.name.replace(/\s+/g, "");



        const raw = await callAI(finalPrompt, signal);
        const result = cleanAIResponse(raw);

        files.push({
          path: `${folders.java}/${cleanName}.java`,
          content: result
        });
      }

      // =========================
      // ADD MAIN CLASS
      // =========================
      files.push({
        path: `${folders.java}/Application.java`,
        content: generateMainClass()
      });

      // =========================
      // ADD application.yml
      // =========================
      files.push({
        path: `${folders.resources}/application.yml`,
        content: generateApplicationYml()
      });

      // =========================
      // ADD BUILD FILE
      // =========================
      if (buildTool === "maven") {
        files.push({ path: "pom.xml", content: generatePomXml() });
      } else {
        files.push({ path: "build.gradle", content: generateGradle() });
      }

      // =========================
      // PREVIEW
      // =========================
      const preview = files
        .map(f => `// ===== ${f.path} =====\n${f.content}`)
        .join("\n\n");

      setCode(preview);
      setAiResponse(""); // 👈 important

      // =========================
      // DOWNLOAD ZIP
      // =========================
      await downloadZip(files);

    } catch (err: any) {
      const msg = `// Error: ${err.message}`;
      setCode(msg);
      setAiResponse(msg);
    } finally {
      setLoading(false);
    }
  };

  /** Internal streaming call used by askAI for the final connection layer */
  const sendToAIStreaming = async (
    prompt: string,
    signal: AbortSignal,
    prefix: string = ""
  ) => {
    const { url, headers, body } = buildFetchOptions(prompt, true, signal);
    try {
      const res = await fetch(url, { method: "POST", mode: "cors", headers, body, signal });
      if (!res.ok) { const t = await res.text(); throw new Error(`API error ${res.status}: ${t}`); }
      if (!res.body) throw new Error("No streaming body.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let accumulated = prefix ? prefix + "\n\n// ══ COMPOSITION LAYER ══\n\n" : "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || trimmed === "data: [DONE]") continue;
          const data = trimmed.startsWith("data: ") ? trimmed.slice(6) : trimmed;
          try {
            const delta = JSON.parse(data).choices?.[0]?.delta?.content;
            if (typeof delta === "string" && delta.length > 0) {
              accumulated += delta;
              setCode(accumulated);
              setAiResponse(accumulated);
            }
          } catch { }
        }
      }
    } finally {
      setLoading(false);
    }
  };

  /* =========================
     UI
  ========================= */
  return (
    <div className={`app ${theme}`}>
      <Topbar
        generate={generate}
        askAI={askAI}
        loading={loading}
        theme={theme}
        setTheme={setTheme}
        language={language}
        setLanguage={setLanguage}
        framework={framework}
        setFramework={setFramework}
        projectName={projectName}
        setProjectName={setProjectName}
        onOpenSettings={() => setShowSettings(true)}
        onCancel={cancelAI}
      />

      <div className="main">
        <Palette />

        <Canvas
          canvasRef={canvasRef}
          graph={graph}
          camera={camera}
          selectedIds={selectedIds}
          wire={wire}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodePointerDown={onNodePointerDown}
          onCanvasPointerDown={onCanvasPointerDown}
          onDelete={onDelete}
          onRename={onRename}
          startWire={startWire}
          moveWire={(cx, cy) => {
            if (!wire) return;
            const { x, y } = clientToWorld(cx, cy);
            setWire(w => w ? { ...w, x2: x, y2: y } : null);
          }}
          endWire={endWire}
        />

        <CodePanel
          prompt={prompt}
          setPrompt={setPrompt}
        />
      </div>

      {showSettings && (
        <div className="modal" onClick={() => setShowSettings(false)}>
          <div onClick={e => e.stopPropagation()}>
            <Settings onSave={(s) => { setSettings(s); setShowSettings(false); }} />
          </div>
        </div>
      )}
    </div>
  );
}