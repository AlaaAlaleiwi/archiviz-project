import { getClassMap, type ClassRole } from "./classMap";

export type CodeFile = { path: string; content: string };

export type ClassNetworkNode = {
  id: string;
  name: string;
  role: ClassRole | "dto" | "test" | "migration" | "unknown";
  file: CodeFile;
  x: number;
  y: number;
};

export type ClassNetworkEdge = {
  id: string;
  from: string;
  to: string;
  sends: string;
  expects: string;
};

export type ClassNetwork = {
  nodes: ClassNetworkNode[];
  edges: ClassNetworkEdge[];
};

export type ClassMethodFlow = {
  name: string;
  input: string;
  output: string;
  signature: string;
};

const ROLE_ORDER: Array<ClassNetworkNode["role"]> = [
  "controller",
  "middleware",
  "gateway",
  "service",
  "worker",
  "queue",
  "repository",
  "model",
  "dto",
  "config",
  "migration",
  "test",
  "unknown",
];

function basename(path: string) {
  return path.split("/").pop() ?? path;
}

function stripExt(name: string) {
  return name.replace(/\.[^.]+$/, "");
}

function isTestFile(path: string) {
  const lower = path.toLowerCase();
  return lower.includes("/test/") || lower.includes(".test.") || lower.includes("test.");
}

function extractDeclaredName(file: CodeFile) {
  const match = file.content.match(/\b(?:class|interface|record|enum)\s+([A-Z][A-Za-z0-9_]*)\b/);
  return match?.[1] ?? stripExt(basename(file.path));
}

function inferRole(file: CodeFile, nodeType: string): ClassNetworkNode["role"] {
  const path = file.path.toLowerCase();
  const content = file.content;

  if (isTestFile(path)) return "test";
  if (path.includes("/db/migration/") || path.endsWith(".sql")) return "migration";
  if (path.includes("/dto/") || /\brecord\s+\w+(Request|Response|Dto)\b/.test(content)) return "dto";
  if (path.includes("/controller/") || content.includes("@RestController") || content.includes("@Controller")) return "controller";
  if (path.includes("/service/") || content.includes("@Service")) return "service";
  if (path.includes("/repository/") || content.includes("JpaRepository") || content.includes("@Repository")) return "repository";
  if (path.includes("/entity/") || path.includes("/model/") || content.includes("@Entity")) return "model";
  if (path.includes("/config/") || content.includes("@Configuration")) return "config";
  if (path.includes("/gateway/") || path.includes("/client/") || path.includes("/adapter/")) return "gateway";
  if (path.includes("/worker/") || path.includes("/scheduler/") || content.includes("@Scheduled")) return "worker";
  if (path.includes("/queue/") || path.includes("/event/")) return "queue";

  const mapped = getClassMap(nodeType)?.find(cls => {
    const name = extractDeclaredName(file).toLowerCase();
    return name.includes(cls.label.toLowerCase().replace(/\s+/g, "")) || name.includes(cls.abbr.toLowerCase());
  });

  return mapped?.role ?? "unknown";
}

function payloadsMentioned(content: string) {
  const matches = Array.from(content.matchAll(/\b([A-Z][A-Za-z0-9_]*(?:Request|Response|Dto|Command|Event|Entity|Message|Payload))\b/g));
  return [...new Set(matches.map(match => match[1]))].slice(0, 4);
}

function cleanType(value: string) {
  return value
    .replace(/\b(public|private|protected|static|final|abstract|synchronized|native|default)\b/g, "")
    .replace(/@\w+(?:\([^)]*\))?/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function parseParam(param: string) {
  const cleaned = cleanType(param);
  if (!cleaned) return "";
  const parts = cleaned.split(/\s+/);
  if (parts.length <= 1) return cleaned;
  const name = parts.at(-1);
  const type = parts.slice(0, -1).join(" ");
  return `${name}: ${type}`;
}

export function extractClassMethodFlows(content: string): ClassMethodFlow[] {
  const methodRegex = /(?:^|\n)\s*(?:@\w+(?:\([^)]*\))?\s*)*(?:public|private|protected)\s+((?:static|final|synchronized|abstract|default)\s+)*([A-Za-z_$][\w$<>[\], ?.&]+)\s+([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*(?:throws\s+[^{]+)?\{/g;
  const methods: ClassMethodFlow[] = [];
  let match: RegExpExecArray | null;

  while ((match = methodRegex.exec(content)) !== null) {
    const returnType = cleanType(match[2]);
    const methodName = match[3];
    if (methodName === "if" || methodName === "for" || methodName === "while" || methodName === "switch") continue;

    const params = match[4]
      .split(",")
      .map(parseParam)
      .filter(Boolean);

    methods.push({
      name: methodName,
      input: params.length > 0 ? params.join(", ") : "none",
      output: returnType || "void",
      signature: `${methodName}(${params.join(", ")}) -> ${returnType || "void"}`,
    });
  }

  return methods.slice(0, 24);
}

function roleDefaultPayload(role: ClassNetworkNode["role"]) {
  switch (role) {
    case "controller": return "HTTP request DTO, path/query parameters";
    case "middleware": return "request context and auth/rate-limit metadata";
    case "gateway": return "typed integration DTO or external provider request";
    case "service": return "validated command/query DTO";
    case "worker": return "job payload or domain event";
    case "queue": return "serialized message envelope";
    case "repository": return "entity, id, or query criteria";
    case "model": return "domain state";
    case "dto": return "request/response data";
    case "config": return "configuration bean";
    case "migration": return "database schema change";
    case "test": return "test fixture and assertion";
    default: return "typed data";
  }
}

function describeLink(from: ClassNetworkNode, to: ClassNetworkNode) {
  const payloads = payloadsMentioned(from.file.content);
  const sentPayload = payloads.length > 0 ? payloads.join(", ") : roleDefaultPayload(from.role);

  if (from.role === "controller" && to.role === "service") {
    return {
      sends: sentPayload,
      expects: "service response DTO or domain result",
    };
  }
  if (from.role === "service" && to.role === "repository") {
    return {
      sends: sentPayload,
      expects: "persisted entity, Optional<Entity>, or collection",
    };
  }
  if (from.role === "repository" && to.role === "model") {
    return {
      sends: "JPA query mapping and entity metadata",
      expects: "entity fields, table mapping, and id type",
    };
  }
  if (from.role === "service" && to.role === "gateway") {
    return {
      sends: sentPayload,
      expects: "provider/client response or integration status",
    };
  }
  if (from.role === "worker" || from.role === "queue") {
    return {
      sends: sentPayload,
      expects: "acknowledgement, retry signal, or processing result",
    };
  }

  return {
    sends: sentPayload,
    expects: roleDefaultPayload(to.role),
  };
}

function roleRank(role: ClassNetworkNode["role"]) {
  const index = ROLE_ORDER.indexOf(role);
  return index === -1 ? ROLE_ORDER.length : index;
}

function layoutColumn(role: ClassNetworkNode["role"]) {
  if (role === "controller" || role === "middleware") return 0;
  if (role === "gateway") return 1;
  if (role === "service" || role === "worker" || role === "queue") return 2;
  if (role === "repository" || role === "model") return 3;
  return 4;
}

function layout(nodes: Omit<ClassNetworkNode, "x" | "y">[]): ClassNetworkNode[] {
  const columns = new Map<number, Omit<ClassNetworkNode, "x" | "y">[]>();
  for (const node of nodes) {
    const column = layoutColumn(node.role);
    columns.set(column, [...(columns.get(column) ?? []), node]);
  }

  const positioned: ClassNetworkNode[] = [];
  const columnX = [110, 315, 520, 725, 930];

  for (const [column, columnNodes] of columns.entries()) {
    const sorted = [...columnNodes].sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name));
    const gapY = sorted.length > 3 ? 86 : 112;
    const startY = 260 - ((sorted.length - 1) * gapY) / 2;

    sorted.forEach((node, index) => {
      positioned.push({
        ...node,
        x: columnX[column] ?? 930,
        y: startY + index * gapY,
      });
    });
  }

  return positioned.sort((a, b) => roleRank(a.role) - roleRank(b.role) || a.name.localeCompare(b.name));
}

export function buildClassNetwork(files: CodeFile[], nodeType: string): ClassNetwork {
  const relevantFiles = files.filter(file => {
    const path = file.path.toLowerCase();
    return /\.(java|kt|ts|tsx|js|jsx|py|go|cs|sql)$/.test(path) && !path.includes("readme");
  });

  const nodes = layout(relevantFiles.map(file => ({
    id: file.path,
    name: extractDeclaredName(file),
    role: inferRole(file, nodeType),
    file,
  })));

  const edgeMap = new Map<string, ClassNetworkEdge>();
  const byId = new Map(nodes.map(node => [node.id, node]));

  for (const from of nodes) {
    for (const to of nodes) {
      if (from.id === to.id) continue;
      if (!from.file.content.includes(to.name)) continue;

      const description = describeLink(from, to);
      edgeMap.set(`${from.id}->${to.id}`, {
        id: `${from.id}->${to.id}`,
        from: from.id,
        to: to.id,
        ...description,
      });
    }
  }

  const productionNodes = nodes.filter(node => node.role !== "test" && node.role !== "migration" && node.role !== "dto" && node.role !== "config");
  for (let index = 0; index < productionNodes.length - 1; index += 1) {
    const from = productionNodes[index];
    const to = productionNodes[index + 1];
    const key = `${from.id}->${to.id}`;
    if (!edgeMap.has(key)) {
      edgeMap.set(key, {
        id: key,
        from: from.id,
        to: to.id,
        ...describeLink(from, to),
      });
    }
  }

  const edges = Array.from(edgeMap.values()).filter(edge => byId.has(edge.from) && byId.has(edge.to));
  return { nodes, edges };
}
