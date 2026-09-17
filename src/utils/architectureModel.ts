export type ComponentKind =
  | "application"
  | "service"
  | "module"
  | "controller"
  | "service_impl"
  | "repository"
  | "entity"
  | "database"
  | "cache"
  | "queue"
  | "topic"
  | "external_system"
  | "auth_boundary"
  | "deployment_unit"
  | "gateway"
  | "event_processor"
  | "configuration"
  | "test_suite"
  | "document"
  | "other";

export type Protocol =
  | "http"
  | "https"
  | "grpc"
  | "kafka"
  | "rabbitmq"
  | "redis"
  | "jdbc"
  | "jpa"
  | "websocket"
  | "amqp"
  | "internal"
  | "shell"
  | "custom";

export type ArtifactKind = "source" | "configuration" | "test" | "migration" | "documentation" | "build" | "other";

export type ArtifactOwnership = "generated" | "user";

export type Confidence = "high" | "medium" | "low";

export type Evidence = {
  sourceFile: string;
  lineNumber?: number;
  symbol?: string;
  snippet?: string;
  confidence: Confidence;
  frameworkEvidence?: string;
};

export type SourceFileRef = {
  path: string;
  startLine?: number;
  endLine?: number;
  role: ArtifactKind;
  ownership: ArtifactOwnership;
};

export type Endpoint = {
  id: string;
  method: string;
  path: string;
  summary?: string;
  sourceFiles: SourceFileRef[];
};

export type ArchitectureComponent = {
  id: string;
  name: string;
  kind: ComponentKind;
  description?: string;
  serviceRoot?: string;
  x: number;
  y: number;
  endpoints: Endpoint[];
  sourceFiles: SourceFileRef[];
  evidence: Evidence[];
  config: Record<string, unknown>;
  deploymentUnitId?: string;
  authBoundaryId?: string;
  children: string[];
  parents: string[];
  generated: boolean;
  stableId: string;
};

export type ArchitectureRelationship = {
  id: string;
  fromComponentId: string;
  toComponentId: string;
  protocol: Protocol;
  direction: "unidirectional" | "bidirectional";
  label?: string;
  contract?: {
    requestSchema?: string;
    responseSchema?: string;
    payloadExample?: string;
  };
  evidence: Evidence[];
  stableId: string;
};

export type ArchitectureModel = {
  version: 2;
  schemaVersion: 2;
  createdAt: string;
  updatedAt: string;
  projectName: string;
  language: string;
  framework: string;
  components: ArchitectureComponent[];
  relationships: ArchitectureRelationship[];
  authBoundaries: {
    id: string;
    name: string;
    componentIds: string[];
    requirements: { type: string; description: string }[];
  }[];
  deploymentUnits: {
    id: string;
    name: string;
    componentIds: string[];
  }[];
  contracts: {
    id: string;
    name: string;
    type: "rest" | "event" | "message" | "data";
    producerIds: string[];
    consumerIds: string[];
    schema?: string;
  }[];
};

export const DEFAULT_MODEL_LANGUAGE = "java";
export const DEFAULT_MODEL_FRAMEWORK = "Spring Boot";
export const MODEL_VERSION = 2;

export function createEmptyArchitectureModel(projectName: string, language = DEFAULT_MODEL_LANGUAGE, framework = DEFAULT_MODEL_FRAMEWORK): ArchitectureModel {
  return {
    version: MODEL_VERSION,
    schemaVersion: MODEL_VERSION,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    projectName,
    language,
    framework,
    components: [],
    relationships: [],
    authBoundaries: [],
    deploymentUnits: [],
    contracts: [],
  };
}

export function genArchId(prefix: string): string {
  return `${prefix}_${Math.random().toString(36).slice(2, 10)}`;
}

export function genStableId(kind: string, identifier: string): string {
  const normalized = identifier
    .replace(/([a-z0-9])([A-Z])/g, "$1-$2")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "unnamed";
  return `stable-${kind}-${normalized}`;
}
