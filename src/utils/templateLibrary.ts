import { storage } from "./storage";

const TEMPLATES_KEY = "archiviz_templates_v1";
const MAX_TEMPLATES = 20;

export type WorkspaceTemplate = {
  id: string;
  name: string;
  savedAt: string;
  graph: unknown;
  files: { path: string; content: string }[];
  meta: Record<string, string>;
  builtIn?: boolean;
};

const builtIn = (id: string, name: string, nodes: Array<{ type: string; name: string; x: number; y: number }>, edges: Array<{ from: number; to: number }> = []): WorkspaceTemplate => ({
  id: `builtin_${id}`,
  name,
  savedAt: "Built in",
  builtIn: true,
  graph: {
    nodes: nodes.map((node, index) => ({ ...node, id: `${id}_${index}` })),
    edges: edges.map((edge, index) => ({ id: `${id}_edge_${index}`, from: `${id}_${edge.from}`, to: `${id}_${edge.to}`, fromSide: "right", toSide: "left" })),
  },
  files: [],
  meta: { projectName: id, language: "java", buildTool: "maven" },
});

export const BUILTIN_TEMPLATES: WorkspaceTemplate[] = [
  builtIn("rest-postgres", "REST API with PostgreSQL", [{ type: "api", name: "API Service", x: 120, y: 140 }, { type: "sql_database", name: "PostgreSQL", x: 410, y: 140 }], [{ from: 0, to: 1 }]),
  builtIn("modular-monolith", "Modular Monolith", [{ type: "module", name: "Application", x: 120, y: 140 }, { type: "module", name: "Domain", x: 410, y: 80 }, { type: "module", name: "Infrastructure", x: 410, y: 220 }], [{ from: 0, to: 1 }, { from: 0, to: 2 }]),
  builtIn("event-microservices", "Event-driven Microservices", [{ type: "microservice", name: "Orders", x: 100, y: 100 }, { type: "event_bus", name: "Event Bus", x: 360, y: 150 }, { type: "microservice", name: "Fulfilment", x: 620, y: 100 }], [{ from: 0, to: 1 }, { from: 1, to: 2 }]),
  builtIn("gateway-services", "API Gateway with Services", [{ type: "api_gateway", name: "Gateway", x: 100, y: 150 }, { type: "microservice", name: "Customers", x: 410, y: 80 }, { type: "microservice", name: "Orders", x: 410, y: 220 }], [{ from: 0, to: 1 }, { from: 0, to: 2 }]),
  builtIn("authentication", "Authentication Service", [{ type: "auth", name: "Authentication", x: 160, y: 130 }, { type: "sql_database", name: "Identity Store", x: 450, y: 130 }], [{ from: 0, to: 1 }]),
  builtIn("spring-react", "Spring Boot with React", [{ type: "frontend_app", name: "React App", x: 100, y: 130 }, { type: "api", name: "Spring API", x: 370, y: 130 }, { type: "sql_database", name: "PostgreSQL", x: 640, y: 130 }], [{ from: 0, to: 1 }, { from: 1, to: 2 }]),
];

export function listTemplates(): WorkspaceTemplate[] {
  return [...BUILTIN_TEMPLATES, ...storage.get<WorkspaceTemplate[]>(TEMPLATES_KEY, [])];
}

export function normalizeTemplateName(name: string): string {
  return name.trim().slice(0, 60) || "Untitled template";
}

export function saveTemplate(
  name: string,
  graph: unknown,
  files: { path: string; content: string }[],
  meta: Record<string, string> = {}
): WorkspaceTemplate {
  const cleanName = normalizeTemplateName(name);
  const template: WorkspaceTemplate = {
    id: `tpl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`,
    name: cleanName,
    savedAt: new Date().toISOString(),
    graph,
    files,
    meta,
  };
  const next = [template, ...listTemplates().filter(item => !item.builtIn && item.name !== cleanName)].slice(0, MAX_TEMPLATES);
  storage.set(TEMPLATES_KEY, next);
  return template;
}

export function removeTemplate(id: string) {
  if (id.startsWith("builtin_")) return;
  storage.set(TEMPLATES_KEY, listTemplates().filter(item => !item.builtIn && item.id !== id));
}
