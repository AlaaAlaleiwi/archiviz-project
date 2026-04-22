import type { BuildTool, Edge, Graph, JavaVersion, Language, NodeData, NodeType, SpringBootVersion } from "../types";
import { analyzeSourceFile, isSourceFile } from "../utils/fileAnalysis";

type ProjectFile = {
  path: string;
  relativePath: string;
  content: string;
};

export type ImportedWorkspaceFile = {
  path: string;
  content: string;
};

export type ProjectImportResult = {
  graph: Graph;
  projectName: string;
  language: Language;
  framework: string;
  buildTool?: BuildTool;
  javaVersion?: JavaVersion;
  springBootVersion?: SpringBootVersion;
  files: ImportedWorkspaceFile[];
};

type BucketGroup = "frontend" | "shared" | "backend" | "data" | "infra";

type Bucket = {
  key: string;
  label: string;
  type: NodeType;
  group: BucketGroup;
  hints: string[];
};

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  "out",
  "target",
  "release",
  ".turbo",
  ".vite",
]);

const TEXT_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "json",
  "py",
  "java",
  "kt",
  "kts",
  "cpp",
  "cc",
  "cxx",
  "c",
  "hpp",
  "h",
  "vue",
  "svelte",
  "xml",
  "yml",
  "yaml",
  "gradle",
  "md",
  "txt",
  "css",
  "scss",
  "html",
]);

const SPECIAL_TEXT_FILES = new Set([
  "package.json",
  "package-lock.json",
  "pnpm-lock.yaml",
  "yarn.lock",
  "requirements.txt",
  "pyproject.toml",
  "pom.xml",
  "build.gradle",
  "build.gradle.kts",
  "cmakelists.txt",
  "makefile",
]);

const GRAPH_COLUMNS: Record<BucketGroup, number> = {
  frontend: 60,
  shared: 360,
  backend: 680,
  data: 980,
  infra: 1280,
};

const CLASSIFIERS: Bucket[] = [
  { key: "frontend_app", label: "Frontend App", type: "frontend_app", group: "frontend", hints: ["frontend_app", "app", "client", "frontend"] },
  { key: "pages", label: "Pages / Screens", type: "feature_page", group: "frontend", hints: ["pages", "views", "screens", "features"] },
  { key: "layout", label: "Layout Shell", type: "layout_shell", group: "frontend", hints: ["layout", "layouts", "shell"] },
  { key: "router", label: "Router", type: "router", group: "frontend", hints: ["router", "routes", "routing"] },
  { key: "components", label: "Shared Components", type: "shared_components", group: "shared", hints: ["components", "component", "ui"] },
  { key: "hooks", label: "Hooks Layer", type: "hooks_layer", group: "shared", hints: ["hooks", "composables"] },
  { key: "state", label: "State Store", type: "state_store", group: "shared", hints: ["store", "state", "redux", "zustand", "pinia"] },
  { key: "client_api", label: "API Client", type: "client_api", group: "shared", hints: ["client_api", "api-client", "http", "axios", "fetcher"] },
  { key: "auth_ui", label: "Auth UI", type: "auth_ui", group: "frontend", hints: ["login", "signup", "session", "auth_ui"] },
  { key: "uploads_ui", label: "File Uploader", type: "file_uploader", group: "frontend", hints: ["upload", "uploader", "dropzone"] },
  { key: "media", label: "Media Gallery", type: "media_gallery", group: "frontend", hints: ["gallery", "media", "images"] },
  { key: "api", label: "API Layer", type: "api", group: "backend", hints: ["controllers", "controller", "routes", "route", "handlers", "endpoint", "api"] },
  { key: "services", label: "Service Layer", type: "microservice", group: "backend", hints: ["services", "service", "usecases", "domain", "core"] },
  { key: "auth", label: "Auth Service", type: "auth", group: "backend", hints: ["auth", "authorization", "jwt", "passport"] },
  { key: "database", label: "Database Layer", type: "sql_database", group: "data", hints: ["database", "db", "models", "model", "entities", "entity", "schema", "schemas", "repository", "repositories", "prisma", "typeorm", "sequelize", "migrations"] },
  { key: "queue", label: "Queue / Broker", type: "queue", group: "infra", hints: ["queue", "broker", "kafka", "rabbit", "sqs"] },
  { key: "worker", label: "Background Worker", type: "worker", group: "infra", hints: ["worker", "workers", "jobs", "job"] },
  { key: "scheduler", label: "Scheduler", type: "scheduler", group: "infra", hints: ["scheduler", "cron"] },
  { key: "websocket", label: "WebSocket Gateway", type: "websocket_gateway", group: "backend", hints: ["websocket", "socket", "ws"] },
  { key: "file_service", label: "File Service", type: "file_service", group: "infra", hints: ["storage", "files", "uploads", "s3", "blob"] },
  { key: "config", label: "Config Service", type: "config_service", group: "shared", hints: ["config", "settings", "env"] },
  { key: "logging", label: "Logging Service", type: "logging_service", group: "infra", hints: ["log", "logger"] },
  { key: "monitoring", label: "Monitoring Service", type: "monitoring_service", group: "infra", hints: ["metrics", "telemetry", "monitor", "health"] },
  { key: "tests", label: "Test Suite", type: "module", group: "shared", hints: ["test", "__tests__", "spec", "e2e"] },
];

const IMPORT_EXTENSIONS = ["ts", "tsx", "js", "jsx", "py", "java", "cpp", "cc", "cxx", "c", "vue"];

function normalizePath(value: string) {
  return value.replace(/\\/g, "/").replace(/\/+/g, "/").replace(/^\.\//, "");
}

function splitPath(value: string) {
  return normalizePath(value).split("/").filter(Boolean);
}

function getExtension(path: string) {
  const fileName = splitPath(path).at(-1) ?? "";
  const dotIndex = fileName.lastIndexOf(".");
  return dotIndex === -1 ? "" : fileName.slice(dotIndex + 1).toLowerCase();
}

function getFileName(path: string) {
  return splitPath(path).at(-1) ?? "";
}

function getDirName(path: string) {
  const parts = splitPath(path);
  parts.pop();
  return parts.join("/");
}

function joinPath(...parts: string[]) {
  return normalizePath(parts.filter(Boolean).join("/"));
}

function toTitle(value: string) {
  return value
    .replace(/\.[^.]+$/, "")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/[-_]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function isIgnoredPath(path: string) {
  return splitPath(path).map(p => p.toLowerCase()).some(p => IGNORED_DIRS.has(p));
}

function shouldReadFile(path: string) {
  if (isIgnoredPath(path)) return false;
  const fileName = getFileName(path).toLowerCase();
  const ext = getExtension(path);
  return SPECIAL_TEXT_FILES.has(fileName) || TEXT_EXTENSIONS.has(ext);
}

function rootRelativePath(path: string) {
  const parts = splitPath(path);
  return parts.slice(1).join("/");
}

function detectLanguage(files: ProjectFile[]): Language {
  const scores = new Map<Language, number>();
  const add = (language: Language, amount = 1) => {
    scores.set(language, (scores.get(language) ?? 0) + amount);
  };

  for (const file of files) {
    const path = file.relativePath.toLowerCase();
    const ext = getExtension(path);
    if (ext === "java" || path === "pom.xml" || path.startsWith("build.gradle")) add("java", path === "pom.xml" || path.startsWith("build.gradle") ? 6 : 3);
    if (ext === "kt" || ext === "kts") add("kotlin", 3);
    if (ext === "ts" || ext === "tsx" || path === "tsconfig.json") add("typescript", path === "tsconfig.json" ? 4 : 2);
    if (ext === "js" || ext === "jsx" || path === "package.json") add("javascript", path === "package.json" ? 2 : 1);
    if (ext === "py" || path === "requirements.txt" || path === "pyproject.toml") add("python", path.endsWith(".txt") || path.endsWith(".toml") ? 4 : 2);
    if (ext === "go" || path === "go.mod") add("go", path === "go.mod" ? 5 : 2);
    if (ext === "cs" || path.endsWith(".csproj")) add("csharp", path.endsWith(".csproj") ? 5 : 2);
    if (["cpp", "cc", "cxx", "c", "hpp", "h"].includes(ext) || path === "cmakelists.txt" || path === "makefile") add("cpp", 1);
    if (ext === "rb" || path === "gemfile") add("ruby", path === "gemfile" ? 4 : 2);
    if (ext === "php" || path === "composer.json") add("php", path === "composer.json" ? 4 : 2);
    if (ext === "swift") add("swift", 2);
  }

  return [...scores.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "javascript";
}

function detectFramework(files: ProjectFile[], language: Language) {
  const packageJson = files.find((file) => file.relativePath === "package.json")?.content.toLowerCase() ?? "";
  const requirements = files.find((file) => file.relativePath === "requirements.txt")?.content.toLowerCase() ?? "";
  const pyproject = files.find((file) => file.relativePath === "pyproject.toml")?.content.toLowerCase() ?? "";
  const pom = files.find((file) => file.relativePath === "pom.xml")?.content.toLowerCase() ?? "";
  const gradle = files.find((file) => file.relativePath === "build.gradle" || file.relativePath === "build.gradle.kts")?.content.toLowerCase() ?? "";

  if (packageJson.includes("\"next\"")) return "Next.js";
  if (packageJson.includes("\"react\"")) return "React";
  if (packageJson.includes("\"vue\"")) return "Vue";
  if (packageJson.includes("\"@angular/core\"")) return "Angular";
  if (packageJson.includes("\"nest")) return "NestJS";
  if (packageJson.includes("\"express\"")) return "Express";

  if (`${requirements}\n${pyproject}`.includes("fastapi")) return "FastAPI";
  if (`${requirements}\n${pyproject}`.includes("django")) return "Django";
  if (`${requirements}\n${pyproject}`.includes("flask")) return "Flask";

  if (`${pom}\n${gradle}`.includes("spring-boot")) return "Spring Boot";
  if (`${pom}\n${gradle}`.includes("quarkus")) return "Quarkus";

  if (language === "javascript") return "Node.js";
  if (language === "typescript") return "TypeScript";
  if (language === "python") return "Python";
  if (language === "java") return "Java";
  return "C++";
}

function detectBuildTool(files: ProjectFile[]): BuildTool | undefined {
  if (files.some((file) => file.relativePath === "pom.xml")) return "maven";
  if (files.some((file) => file.relativePath === "build.gradle" || file.relativePath === "build.gradle.kts")) return "gradle";
  return undefined;
}

function detectJavaVersion(files: ProjectFile[]): JavaVersion | undefined {
  const joined = files
    .filter((file) => ["pom.xml", "build.gradle", "build.gradle.kts"].includes(file.relativePath))
    .map((file) => file.content)
    .join("\n");

  const version = joined.match(/(?:<java\.version>|sourceCompatibility\s*=\s*JavaVersion\.VERSION_|sourceCompatibility\s*=\s*["']?)(17|21|25)/)?.[1];
  return version === "17" || version === "21" || version === "25" ? version : undefined;
}

function detectSpringBootVersion(files: ProjectFile[]): SpringBootVersion | undefined {
  const joined = files
    .filter((file) => ["pom.xml", "build.gradle", "build.gradle.kts"].includes(file.relativePath))
    .map((file) => file.content)
    .join("\n");

  const version = joined.match(/spring-boot(?:-starter-parent|["']?\)?\s+version\s+["']?|.*?<version>)\s*["']?(\d+\.\d+)/is)?.[1];
  return version === "3.2" || version === "3.3" || version === "3.4" ? version : undefined;
}

function createProjectFilesMap(files: ProjectFile[]) {
  return new Map(files.map((file) => [normalizePath(file.relativePath), file]));
}

function getJavaClassName(file: ProjectFile) {
  const declared = file.content.match(/\b(?:class|interface|record|enum)\s+([A-Z][A-Za-z0-9_]*)/)?.[1];
  return declared || getFileName(file.relativePath).replace(/\.java$/i, "");
}

function getJavaPackage(file: ProjectFile) {
  return file.content.match(/^\s*package\s+([a-zA-Z0-9_.]+)\s*;/m)?.[1] ?? "";
}

function isJavaSourceClass(file: ProjectFile): boolean {
  const ext = file.relativePath.split(".").pop()?.toLowerCase();
  if (ext !== "java" && ext !== "kt") return false;

  const lower = file.relativePath.toLowerCase();
  const inMainSrc =
    lower.includes("src/main/java/") ||
    lower.includes("src/main/kotlin/") ||
    // non-Maven projects that put source directly under src/
    lower.includes("/src/");
  if (!inMainSrc) return false;

  const className = getJavaClassName(file);
  if (!className) return false;

  const content = file.content;
  return (
    content.includes("@RestController") || content.includes("@Controller") ||
    content.includes("@ControllerAdvice") ||
    content.includes("@Service") || content.includes("@Repository") ||
    content.includes("@Entity") || content.includes("@Table") || content.includes("@Document") ||
    content.includes("@Configuration") || content.includes("@Component") ||
    content.includes("@FeignClient") ||
    /(?:Controller|Service|ServiceImpl|Repository|RepositoryImpl|Entity|Configuration|Config|Client|Adapter|Handler|Consumer|Producer|Listener|Scheduler|Job|Mapper|Processor|Facade)$/.test(className) ||
    lower.includes("/controller/") || lower.includes("/controllers/") ||
    lower.includes("/service/") || lower.includes("/services/") ||
    lower.includes("/repository/") || lower.includes("/repositories/") || lower.includes("/dao/") ||
    lower.includes("/entity/") || lower.includes("/entities/") ||
    lower.includes("/model/") || lower.includes("/domain/") ||
    lower.includes("/client/") || lower.includes("/adapter/") ||
    lower.includes("/config/") || lower.includes("/configuration/")
  );
}

function bucketForPath(relativePath: string): Bucket | null {
  const lower = relativePath.toLowerCase();

  for (const bucket of CLASSIFIERS) {
    if (bucket.hints.some((hint) => lower.includes(hint))) {
      return bucket;
    }
  }

  return null;
}

function createFallbackBuckets(files: ProjectFile[]) {
  const directories = new Map<string, Bucket>();

  for (const file of files) {
    const parts = splitPath(file.relativePath);
    const sourceRootIndex = parts.findIndex((part) => ["src", "app", "server", "client", "backend", "frontend"].includes(part.toLowerCase()));
    const directory = sourceRootIndex >= 0 ? parts[sourceRootIndex + 1] : parts[0];
    if (!directory) continue;

    const key = `module:${directory.toLowerCase()}`;
    if (directories.has(key)) continue;

    directories.set(key, {
      key,
      label: directory.replace(/[-_]/g, " "),
      type: "module",
      group: "shared",
      hints: [directory.toLowerCase()],
    });
  }

  return [...directories.values()];
}

function extractImports(file: ProjectFile) {
  const imports = new Set<string>();
  const content = file.content;

  for (const match of content.matchAll(/(?:import|export)\s+(?:[^"'`]+\s+from\s+)?["'`]([^"'`]+)["'`]/g)) {
    imports.add(match[1]);
  }

  for (const match of content.matchAll(/require\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
    imports.add(match[1]);
  }

  for (const match of content.matchAll(/import\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
    imports.add(match[1]);
  }

  for (const match of content.matchAll(/from\s+([a-zA-Z0-9_./]+)\s+import/g)) {
    imports.add(match[1]);
  }

  for (const match of content.matchAll(/^\s*import\s+([a-zA-Z0-9_./]+)/gm)) {
    imports.add(match[1]);
  }

  for (const match of content.matchAll(/^\s*#include\s+["<]([^">]+)[">]/gm)) {
    imports.add(match[1]);
  }

  return [...imports];
}

function resolveRelativeImport(sourcePath: string, specifier: string, fileMap: Map<string, ProjectFile>) {
  const baseDir = getDirName(sourcePath);
  const normalizedBase = splitPath(baseDir);
  const specifierParts = splitPath(specifier);
  const resolvedParts = [...normalizedBase];

  for (const part of specifierParts) {
    if (part === ".") continue;
    if (part === "..") {
      resolvedParts.pop();
      continue;
    }
    resolvedParts.push(part);
  }

  const candidate = resolvedParts.join("/");
  const candidates = [candidate];

  for (const extension of IMPORT_EXTENSIONS) {
    candidates.push(`${candidate}.${extension}`);
    candidates.push(joinPath(candidate, `index.${extension}`));
  }

  return candidates.find((value) => fileMap.has(normalizePath(value))) ?? null;
}

function inferEdges(
  files: ProjectFile[],
  buckets: Bucket[],
  fileToBucketKey: Map<string, string>,
) {
  const edges = new Map<string, Edge>();
  const bucketMap = new Map(buckets.map((bucket) => [bucket.key, bucket]));
  const fileMap = createProjectFilesMap(files);

  const addEdge = (fromKey: string, toKey: string) => {
    if (!bucketMap.has(fromKey) || !bucketMap.has(toKey) || fromKey === toKey) return;

    const id = `${fromKey}:${toKey}`;
    if (edges.has(id)) return;

    edges.set(id, {
      id,
      from: fromKey,
      to: toKey,
      fromSide: "right",
      toSide: "left",
    });
  };

  for (const file of files) {
    const sourceKey = fileToBucketKey.get(file.relativePath);
    if (!sourceKey) continue;

    for (const specifier of extractImports(file)) {
      let targetKey: string | undefined;

      if (specifier.startsWith(".")) {
        const resolved = resolveRelativeImport(file.relativePath, specifier, fileMap);
        targetKey = resolved ? fileToBucketKey.get(resolved) : undefined;
      }

      if (!targetKey) {
        const lowerSpecifier = specifier.toLowerCase();
        const matchedBucket = buckets.find((bucket) =>
          bucket.hints.some((hint) => lowerSpecifier.includes(hint))
        );

        targetKey = matchedBucket?.key;
      }

      if (targetKey) {
        addEdge(sourceKey, targetKey);
      }
    }
  }

  if (edges.size === 0) {
    const present = new Set(buckets.map((bucket) => bucket.key));
    if (present.has("router") && present.has("pages")) addEdge("router", "pages");
    if (present.has("pages") && present.has("components")) addEdge("pages", "components");
    if (present.has("pages") && present.has("client_api")) addEdge("pages", "client_api");
    if (present.has("pages") && present.has("state")) addEdge("pages", "state");
    if (present.has("api") && present.has("services")) addEdge("api", "services");
    if (present.has("api") && present.has("auth")) addEdge("api", "auth");
    if (present.has("services") && present.has("database")) addEdge("services", "database");
    if (present.has("services") && present.has("queue")) addEdge("services", "queue");
    if (present.has("services") && present.has("file_service")) addEdge("services", "file_service");
    if (present.has("worker") && present.has("queue")) addEdge("worker", "queue");
    if (present.has("worker") && present.has("database")) addEdge("worker", "database");
    if (present.has("scheduler") && present.has("worker")) addEdge("scheduler", "worker");
    if (present.has("websocket") && present.has("auth")) addEdge("websocket", "auth");
  }

  return [...edges.values()];
}

function layoutNodes(
  buckets: Bucket[],
  sourceFilesByBucket?: Map<string, string[]>,
): NodeData[] {
  const groupRows: Record<BucketGroup, number> = {
    frontend: 0,
    shared: 0,
    backend: 0,
    data: 0,
    infra: 0,
  };

  const sorted = [...buckets].sort((a, b) => {
    if (a.group !== b.group) return GRAPH_COLUMNS[a.group] - GRAPH_COLUMNS[b.group];
    return a.label.localeCompare(b.label);
  });

  return sorted.map((bucket) => {
    const row = groupRows[bucket.group];
    groupRows[bucket.group] += 1;

    const sourcePaths = sourceFilesByBucket?.get(bucket.key);
    return {
      id: bucket.key,
      name: bucket.label,
      type: bucket.type,
      x: GRAPH_COLUMNS[bucket.group],
      y: 80 + row * 140,
      ...(sourcePaths?.length ? { config: { sourceFiles: sourcePaths } } : {}),
    };
  });
}

export class ProjectImportService {
  async importFromFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList);
    const firstPath = normalizePath(files[0]?.webkitRelativePath || files[0]?.name || "project");
    const rootName = splitPath(firstPath)[0] || "project";

    const projectFiles: ProjectFile[] = [];
    const allFilePaths: { relativePath: string }[] = [];

    for (const file of files) {
      const fullPath = normalizePath(file.webkitRelativePath || file.name);
      const relativePath = rootRelativePath(fullPath);
      if (!relativePath) continue;
      if (isIgnoredPath(fullPath)) continue;

      const normalizedRelative = normalizePath(relativePath);
      allFilePaths.push({ relativePath: normalizedRelative });

      if (!shouldReadFile(fullPath)) continue;

      let content = "";
      try {
        content = await file.text();
      } catch {
        content = "";
      }

      projectFiles.push({
        path: fullPath,
        relativePath: normalizedRelative,
        content,
      });
    }

    const language = detectLanguage(projectFiles);
    const framework = detectFramework(projectFiles, language);

    const bucketMap = new Map<string, Bucket>();
    const fileToBucketKey = new Map<string, string>();
    const sourceFilesByBucket = new Map<string, string[]>();

    const addToSourceFiles = (bucketKey: string, relativePath: string) => {
      const list = sourceFilesByBucket.get(bucketKey) ?? [];
      list.push(relativePath);
      sourceFilesByBucket.set(bucketKey, list);
    };

    if (language === "java" || language === "kotlin") {
      // One service node for the whole project; classes are revealed on expand
      const serviceKey = "java:service";
      const serviceBucket: Bucket = {
        key: serviceKey,
        label: toTitle(rootName),
        type: "microservice",
        group: "backend",
        hints: [rootName.toLowerCase()],
      };

      for (const file of projectFiles) {
        if (!isJavaSourceClass(file)) continue;
        if (!isSourceFile(file.relativePath)) continue;
        bucketMap.set(serviceKey, serviceBucket);
        fileToBucketKey.set(file.relativePath, serviceKey);
        addToSourceFiles(serviceKey, file.relativePath);
      }
    }

    if (bucketMap.size === 0) {
      for (const file of projectFiles) {
        const bucket = bucketForPath(file.relativePath);
        if (!bucket) continue;

        bucketMap.set(bucket.key, bucket);
        fileToBucketKey.set(file.relativePath, bucket.key);
        addToSourceFiles(bucket.key, file.relativePath);
      }
    }

    if (bucketMap.size === 0) {
      for (const bucket of createFallbackBuckets(projectFiles)) {
        bucketMap.set(bucket.key, bucket);
      }
    }

    const buckets = [...bucketMap.values()];
    const nodes = layoutNodes(buckets, sourceFilesByBucket);
    const edges = inferEdges(projectFiles, buckets, fileToBucketKey);

    return {
      projectName: rootName,
      language,
      framework,
      buildTool: detectBuildTool(projectFiles),
      javaVersion: detectJavaVersion(projectFiles),
      springBootVersion: detectSpringBootVersion(projectFiles),
      files: allFilePaths.map(({ relativePath }) => ({
        path: relativePath,
        content: projectFiles.find(f => f.relativePath === relativePath)?.content ?? "",
      })),
      graph: {
        nodes,
        edges,
      },
    } satisfies ProjectImportResult;
  }
}
