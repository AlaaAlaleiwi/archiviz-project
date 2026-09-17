import {
  type ArchitectureModel,
  type ArchitectureComponent,
  type ArchitectureRelationship,
  type ComponentKind,
  type Protocol,
  type Confidence,
  type Evidence,
  type SourceFileRef,
  type Endpoint,
  genArchId,
  genStableId,
  MODEL_VERSION,
  DEFAULT_MODEL_LANGUAGE,
  DEFAULT_MODEL_FRAMEWORK,
} from "./architectureModel";
import { analyzeSourceFile } from "./fileAnalysis";
import type { Graph, NodeData } from "../types";
import type { WorkspaceFile } from "../components/FileWorkspace";

export function nodeTypeToComponentKind(nodeType: string): ComponentKind {
  const lower = nodeType.toLowerCase();
  if (lower === "microservice" || lower === "api" || lower === "frontend_app" || lower === "auth") return "service";
  if (lower === "sql_database" || lower === "nosql_database") return "database";
  if (lower === "message_queue" || lower === "cache") return lower === "cache" ? "cache" : "queue";
  if (lower === "client_api") return "gateway";
  if (lower === "config_service") return "configuration";
  if (lower === "shared_components") return "module";
  if (lower === "module") return "module";
  if (lower === "deployment") return "deployment_unit";
  return "other";
}

export function nodeTypeToProtocol(nodeType: string): Protocol {
  const lower = nodeType.toLowerCase();
  if (lower.includes("queue") || lower.includes("rabbitmq")) return "rabbitmq";
  if (lower.includes("kafka")) return "kafka";
  if (lower.includes("cache") || lower.includes("redis")) return "redis";
  if (lower.includes("websocket")) return "websocket";
  if (lower.includes("database") || lower.includes("db") || lower.includes("sql") || lower.includes("nosql")) return "jdbc";
  if (lower.includes("client") || lower.includes("gateway") || lower.includes("grpc")) return "grpc";
  return "http";
}

export function edgeLabelToProtocol(label?: string): Protocol {
  if (!label) return "http";
  const lower = label.toLowerCase();
  if (lower.includes("kafka")) return "kafka";
  if (lower.includes("rabbit")) return "rabbitmq";
  if (lower.includes("redis") || lower.includes("cache")) return "redis";
  if (lower.includes("grpc")) return "grpc";
  if (lower.includes("websocket") || lower.includes("ws")) return "websocket";
  if (lower.includes("jdbc") || lower.includes("database")) return "jdbc";
  if (lower.includes("amqp")) return "amqp";
  return "http";
}

export function classifyConfidence(nodeType: string, imported?: boolean): Confidence {
  if (imported) return "high";
  if (nodeType === "other") return "low";
  return "medium";
}

export function buildEvidenceForNode(node: NodeData): Evidence[] {
  const evidence: Evidence[] = [];
  const framework = typeof node.config?.framework === "string" ? node.config.framework : "";
  if (framework) {
    evidence.push({
      sourceFile: "",
      confidence: "high",
      frameworkEvidence: framework,
      snippet: node.name,
    });
  }
  return evidence;
}

export function filesToSourceRefs(files: WorkspaceFile[], ownership: "generated" | "user"): SourceFileRef[] {
  return files.map(file => ({
    path: file.path,
    role: roleForPath(file.path),
    ownership,
  }));
}

export function roleForPath(path: string): SourceFileRef["role"] {
  const lower = path.toLowerCase();
  if (lower.includes("/test/") || lower.includes("_test.") || lower.includes(".test.")) return "test";
  if (lower.includes("/db/migration/") || lower.endsWith(".sql")) return "migration";
  if (lower.endsWith(".properties") || lower.endsWith(".yml") || lower.endsWith(".yaml") || lower.endsWith(".json")) return "configuration";
  if (lower.includes("readme")) return "documentation";
  if (lower.includes("/build.") || lower.endsWith(".gradle") || lower.endsWith("pom.xml")) return "build";
  return "source";
}

export function migrateNodeToComponent(node: NodeData, workspaceFiles: WorkspaceFile[]): ArchitectureComponent {
  const kind = nodeTypeToComponentKind(node.type);
  const stableId = node.config?.stableId as string | undefined;

  const nodeFiles = Array.isArray(node.config?.sourceFiles)
    ? (node.config.sourceFiles as string[]).map(p => workspaceFiles.find(f => f.path === p)).filter(Boolean) as WorkspaceFile[]
    : [];

  const fallbackFiles = nodeFiles.length > 0
    ? nodeFiles
    : workspaceFiles.filter(f =>
        f.path.toLowerCase().includes(node.name.toLowerCase().replace(/\s+/g, ""))
        || f.path.toLowerCase().includes(node.name.toLowerCase().replace(/\s+/g, "-"))
      );

  const ownership: "generated" | "user" = node.config?.imported ? "user" : "generated";
  const sourceFiles = filesToSourceRefs(fallbackFiles, ownership);

  const fileAnalyzedRoles = new Set<string>();
  for (const file of fallbackFiles) {
    const analyzed = analyzeSourceFile(file.path, file.content);
    fileAnalyzedRoles.add(analyzed.role);
    for (const ref of sourceFiles) {
      if (ref.path === file.path) {
        const pathRole = roleForPath(file.path);
        if (pathRole === "source") ref.role = toArtifactKind(analyzed.role);
      }
    }
  }

  let endpoints: Endpoint[] = [];
  if (fileAnalyzedRoles.has("controller")) {
    endpoints = extractEndpointsFromFiles(fallbackFiles);
  }

  const evidence = buildEvidenceForNode(node);

  return {
    id: node.id,
    name: node.name,
    kind,
    serviceRoot: typeof node.config?.serviceRoot === "string" ? node.config.serviceRoot : undefined,
    x: node.x,
    y: node.y,
    endpoints,
    sourceFiles,
    evidence,
    config: { ...node.config, stableId },
    deploymentUnitId: typeof node.config?.deploymentUnitId === "string" ? node.config.deploymentUnitId : undefined,
    authBoundaryId: typeof node.config?.authBoundaryId === "string" ? node.config.authBoundaryId : undefined,
    children: [],
    parents: [],
    generated: !node.config?.imported,
    stableId: stableId ?? genStableId(kind, node.name),
  };
}

function toArtifactKind(role: string): SourceFileRef["role"] {
  switch (role) {
    case "controller": return "source";
    case "service": return "source";
    case "repository": return "source";
    case "entity": return "source";
    case "config": return "configuration";
    case "client": return "source";
    case "module": return "source";
    default: return "source";
  }
}

function extractEndpointsFromFiles(files: WorkspaceFile[]) {
  const endpoints: Endpoint[] = [];
  for (const file of files) {
    const lower = file.path.toLowerCase();
    if (!lower.includes("/controller/") && !lower.includes("controller")) continue;
    const methodRegex = /@(\w+)\s*\(\s*["'`]([^"'`\s]+)["'`]/g;
    let match: RegExpExecArray | null;
    while ((match = methodRegex.exec(file.content)) !== null) {
      const method = match[1].toUpperCase();
      const path = match[2];
      endpoints.push({
        id: genArchId("ep"),
        method,
        path,
        sourceFiles: filesToSourceRefs([file], "user"),
      });
    }
  }
  return endpoints;
}

export interface MigrationResult {
  model: ArchitectureModel;
  warnings: string[];
}

export function migrateFromSavedProject(
  savedProject: {
    version: number;
    projectName: string;
    graph: Graph;
    nodeCode?: Record<string, WorkspaceFile[]>;
    workspaceFiles?: WorkspaceFile[];
    javaVersion?: string;
    springBootVersion?: string;
    language?: "typescript" | "javascript" | "python" | "java" | "csharp" | "cpp" | "go" | "ruby" | "php" | "kotlin" | "swift";
    detectedFramework?: string;
    prompt?: string;
  },
): MigrationResult {
  const warnings: string[] = [];

  if (savedProject.version >= MODEL_VERSION) {
    warnings.push("Project model version is already current; no migration needed.");
    return { model: savedProject as unknown as ArchitectureModel, warnings };
  }

  const allFiles: WorkspaceFile[] = [
    ...(savedProject.workspaceFiles ?? []),
    ...Object.values(savedProject.nodeCode ?? {}).flat(),
  ];
  const filesMap = new Map(allFiles.map(f => [f.path, f]));

  const components = savedProject.graph.nodes.map(node =>
    migrateNodeToComponent(node, Array.from(filesMap.values()))
  );

  const relationships: ArchitectureRelationship[] = savedProject.graph.edges.map(edge => {
    const fromNode = savedProject.graph.nodes.find(n => n.id === edge.from);
    const toNode = savedProject.graph.nodes.find(n => n.id === edge.to);
    const stableId = (fromNode?.config?.stableId as string | undefined)
      ?? genStableId(nodeTypeToComponentKind(fromNode?.type ?? ""), fromNode?.name ?? edge.from);
    const toStableId = (toNode?.config?.stableId as string | undefined)
      ?? genStableId(nodeTypeToComponentKind(toNode?.type ?? ""), toNode?.name ?? edge.to);

    return {
      id: edge.id,
      fromComponentId: edge.from,
      toComponentId: edge.to,
      protocol: edgeLabelToProtocol(edge.label),
      direction: "unidirectional",
      label: edge.label,
      evidence: edge.label
        ? [{
            sourceFile: "",
            confidence: "medium",
            snippet: edge.label,
          }]
        : [],
      stableId: genStableId("relationship", `${stableId}->${toStableId}`),
    };
  });

  const authBoundaries: ArchitectureModel["authBoundaries"] = [];
  const deploymentUnits: ArchitectureModel["deploymentUnits"] = [];

  const serviceComponents = components.filter(c => c.kind === "service" || c.kind === "application");
  if (serviceComponents.length > 0) {
    deploymentUnits.push({
      id: genArchId("deploy"),
      name: savedProject.projectName || "project",
      componentIds: serviceComponents.map(c => c.id),
    });
  }

  const model: ArchitectureModel = {
    version: MODEL_VERSION,
    schemaVersion: MODEL_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectName: savedProject.projectName || "architecture-app",
    language: savedProject.language ?? (savedProject.javaVersion ? "java" : DEFAULT_MODEL_LANGUAGE),
    framework: savedProject.detectedFramework ?? savedProject.springBootVersion ? `Spring Boot ${savedProject.springBootVersion}` : DEFAULT_MODEL_FRAMEWORK,
    components,
    relationships,
    authBoundaries,
    deploymentUnits,
    contracts: relationships
      .filter(r => r.protocol === "http" || r.protocol === "grpc")
      .map(r => ({
        id: genArchId("contract"),
        name: r.label ?? `${r.fromComponentId}->${r.toComponentId}`,
        type: "rest" as const,
        producerIds: [r.fromComponentId],
        consumerIds: [r.toComponentId],
      })),
  };

  if (components.length !== savedProject.graph.nodes.length) {
    warnings.push(`Migrated ${components.length} of ${savedProject.graph.nodes.length} nodes.`);
  }

  return { model, warnings };
}

export function isArchitectureModel(obj: unknown): obj is ArchitectureModel {
  if (typeof obj !== "object" || obj === null) return false;
  const m = obj as Record<string, unknown>;
  return (
    m.version === MODEL_VERSION &&
    m.schemaVersion === MODEL_VERSION &&
    Array.isArray(m.components) &&
    Array.isArray(m.relationships)
  );
}
