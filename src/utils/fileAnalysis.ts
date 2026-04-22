export type FileRole = "controller" | "service" | "repository" | "entity" | "config" | "client" | "component" | "module";

export type AnalyzedFile = {
  displayName: string;
  nodeType: string;
  role: FileRole;
  icon: string;
};

const SOURCE_EXTENSIONS = new Set(["java", "kt", "ts", "tsx", "js", "jsx", "py", "go", "cs"]);

export function isSourceFile(path: string): boolean {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return SOURCE_EXTENSIONS.has(ext);
}

function getExt(path: string) {
  return path.split(".").pop()?.toLowerCase() ?? "";
}

function getBaseName(path: string) {
  return path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? path;
}

export function analyzeSourceFile(path: string, content: string): AnalyzedFile {
  const ext = getExt(path);

  if (ext === "java" || ext === "kt") {
    const displayName =
      content.match(/\b(?:class|interface|record|enum|object)\s+([A-Z][A-Za-z0-9_]*)/)?.[1] ??
      getBaseName(path);
    const lowerPath = path.toLowerCase();
    const base = getBaseName(path).toLowerCase();

    // Controllers — checked first, most specific
    if (
      content.includes("@RestController") || content.includes("@Controller") ||
      content.includes("@ControllerAdvice") ||
      /controller(?:impl|advice|test)?\.(java|kt)$/.test(lowerPath) ||
      lowerPath.includes("/controller/") || lowerPath.includes("/controllers/")
    ) return { displayName, nodeType: "api", role: "controller", icon: "⚡" };

    // Repository / persistence
    if (
      content.includes("@Repository") ||
      /repository(?:impl)?\.(java|kt)$/.test(lowerPath) ||
      lowerPath.includes("/repository/") || lowerPath.includes("/repositories/") ||
      lowerPath.includes("/dao/")
    ) return { displayName, nodeType: "sql_database", role: "repository", icon: "🗄️" };

    // Entity / domain model
    if (
      content.includes("@Entity") || content.includes("@Table") || content.includes("@Document") ||
      /entity(?:impl)?\.(java|kt)$/.test(lowerPath) ||
      lowerPath.includes("/entity/") || lowerPath.includes("/entities/") ||
      lowerPath.includes("/model/") || lowerPath.includes("/domain/")
    ) return { displayName, nodeType: "sql_database", role: "entity", icon: "📋" };

    // Configuration
    if (
      content.includes("@Configuration") || content.includes("@EnableAutoConfiguration") ||
      /config(?:uration)?\.(java|kt)$/.test(lowerPath) ||
      lowerPath.includes("/config/") || lowerPath.includes("/configuration/")
    ) return { displayName, nodeType: "config_service", role: "config", icon: "📝" };

    // External clients / adapters
    if (
      content.includes("@FeignClient") || content.includes("@WebServiceClient") ||
      /client(?:impl)?\.(java|kt)$/.test(lowerPath) ||
      lowerPath.includes("/client/") || lowerPath.includes("/adapter/") || lowerPath.includes("/feign/")
    ) return { displayName, nodeType: "client_api", role: "client", icon: "🔗" };

    // Service — @Service, *Service*, *Handler*, *Consumer*, *Producer*, *Listener*
    if (
      content.includes("@Service") ||
      /service(?:impl|implementation)?\.(java|kt)$/.test(lowerPath) ||
      lowerPath.includes("/service/") || lowerPath.includes("/services/") ||
      lowerPath.includes("/usecase/") || lowerPath.includes("/usecases/") ||
      /(?:handler|consumer|producer|listener|processor|scheduler|job|worker)(?:impl)?\.(java|kt)$/.test(lowerPath) ||
      (content.includes("@Component") && (base.includes("service") || base.includes("handler") || base.includes("consumer")))
    ) return { displayName, nodeType: "microservice", role: "service", icon: "🧩" };

    // Generic @Component fallback
    if (content.includes("@Component"))
      return { displayName, nodeType: "module", role: "component", icon: "🧱" };

    return { displayName, nodeType: "module", role: "module", icon: "☕" };
  }

  if (["ts", "tsx", "js", "jsx"].includes(ext)) {
    const displayName = getBaseName(path);
    const lower = path.toLowerCase();
    if (lower.includes("/controller") || lower.includes("/route") || lower.includes("/handler"))
      return { displayName, nodeType: "api", role: "controller", icon: "⚡" };
    if (lower.includes("/service") || lower.includes("/usecase"))
      return { displayName, nodeType: "microservice", role: "service", icon: "🧩" };
    if (ext === "tsx" || ext === "jsx")
      return { displayName, nodeType: "shared_components", role: "component", icon: "🎨" };
    if (lower.includes("/model") || lower.includes("/entity") || lower.includes("/schema"))
      return { displayName, nodeType: "sql_database", role: "entity", icon: "📋" };
    if (lower.includes("/repository") || lower.includes("/repo"))
      return { displayName, nodeType: "sql_database", role: "repository", icon: "🗄️" };
    return { displayName, nodeType: "module", role: "module", icon: "📄" };
  }

  if (ext === "py") {
    const displayName = getBaseName(path);
    const lower = path.toLowerCase();
    if (lower.includes("route") || lower.includes("view") || lower.includes("endpoint"))
      return { displayName, nodeType: "api", role: "controller", icon: "⚡" };
    if (lower.includes("service"))
      return { displayName, nodeType: "microservice", role: "service", icon: "🧩" };
    if (lower.includes("model") || lower.includes("schema"))
      return { displayName, nodeType: "sql_database", role: "entity", icon: "📋" };
    return { displayName, nodeType: "module", role: "module", icon: "🐍" };
  }

  return { displayName: getBaseName(path), nodeType: "module", role: "module", icon: "📄" };
}
