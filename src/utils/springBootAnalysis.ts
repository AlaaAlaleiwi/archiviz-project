import type { ArchitectureComponent } from "./architectureModel";

export type SpringComponent = {
  kind: "controller" | "service" | "repository" | "entity" | "configuration" | "client" | "security" | "test" | "queue_listener" | "unknown";
  confidence: "high" | "medium" | "low";
  evidence: string[];
};

export type ExtractedRoute = {
  method: string;
  path: string;
  httpMethod: string;
  summary?: string;
  sourceFile: string;
  lineNumber?: number;
};

export type SecurityAnalysis = {
  hasSecurity: boolean;
  configClass?: string;
  annotations: string[];
  sourceFile?: string;
};

export type MessageQueueAnalysis = {
  hasKafka: boolean;
  hasRabbit: boolean;
  listeners: { type: "kafka" | "rabbit"; method: string; topic?: string; queue?: string; sourceFile: string }[];
};

export type HttpClientAnalysis = {
  hasFeign: boolean;
  hasRestTemplate: boolean;
  hasWebClient: boolean;
  clients: { type: "feign" | "restTemplate" | "webClient"; sourceFile: string }[];
};

export type ModuleAnalysis = {
  isMavenModule: boolean;
  isGradleModule: boolean;
  isSpringBootApp: boolean;
  mainClass?: string;
};

export type DockerAnalysis = {
  hasDockerfile: boolean;
  hasComposeFile: boolean;
  composeServices: string[];
};

export type TestAnalysis = {
  hasTests: boolean;
  testCount: number;
  frameworks: string[];
};

export type SpringBootAnalysis = {
  component: SpringComponent;
  routes: ExtractedRoute[];
  security: SecurityAnalysis;
  messageQueue: MessageQueueAnalysis;
  httpClient: HttpClientAnalysis;
  module: ModuleAnalysis;
  docker: DockerAnalysis;
  test: TestAnalysis;
};

const METHOD_MAPPINGS: Record<string, string> = {
  GetMapping: "GET",
  PostMapping: "POST",
  PutMapping: "PUT",
  DeleteMapping: "DELETE",
  PatchMapping: "PATCH",
  RequestMapping: "*",
};

export function extractRoutes(path: string, content: string): ExtractedRoute[] {
  const routes: ExtractedRoute[] = [];

  const classRequestMapping = content.match(/@RequestMapping\s*\(\s*(['"])([^'"]+)\1\s*\)/)?.[2];

  const methodPattern = /@(\w+(?:Mapping))\s*(?:\(\s*([^)]*)\))?/g;
  let match: RegExpExecArray | null;
  while ((match = methodPattern.exec(content)) !== null) {
    const annotation = match[1];
    const args = match[2] || "";
    const httpMethod = METHOD_MAPPINGS[annotation];
    if (!httpMethod) continue;

    if (annotation === "RequestMapping" && !args.includes("method")) continue;

    const methodSignature = content.slice(match.index).match(/(\w+)\s*\(/)?.[1] ?? "";
    const pathMatch = args.match(/(['"])([^'"]+)\1/)?.[2];
    const pathValue = pathMatch ?? classRequestMapping ?? "/";

    const line = content.slice(0, match.index).split("\n").length;

    routes.push({
      method: methodSignature,
      path: pathValue,
      httpMethod,
      sourceFile: path,
      lineNumber: line,
    });
  }

  return routes.sort((a, b) => (a.lineNumber ?? 0) - (b.lineNumber ?? 0));
}

export function analyzeSecurity(path: string, content: string): SecurityAnalysis {
  const annotations: string[] = [];
  let configClass: string | undefined;
  let hasSecurity = false;

  const securityAnnotations = ["@EnableWebSecurity", "@EnableGlobalMethodSecurity", "@Secured", "@PreAuthorize", "@PostAuthorize", "@RolesAllowed"];
  for (const ann of securityAnnotations) {
    if (content.includes(ann)) {
      annotations.push(ann);
      hasSecurity = true;
    }
  }

  if (content.includes("WebSecurityConfigurerAdapter") || content.includes("SecurityFilterChain") || content.includes("WebSecurity")) {
    hasSecurity = true;
  }

  if (hasSecurity) {
    const classMatch = content.match(/\b(?:public\s+|abstract\s+|final\s+)*class\s+(\w+)/);
    configClass = classMatch?.[1];
  }

  return {
    hasSecurity,
    configClass,
    annotations,
    sourceFile: hasSecurity ? path : undefined,
  };
}

export function analyzeMessageQueue(path: string, content: string): MessageQueueAnalysis {
  const listeners: MessageQueueAnalysis["listeners"] = [];

  const kafkaListenerPattern = /@KafkaListener\s*\(\s*(?:topics\s*=\s*({[^}]+}|[^,)]+))(?:,\s*([^)]+))?\)/g;
  let match: RegExpExecArray | null;
  while ((match = kafkaListenerPattern.exec(content)) !== null) {
    const topicsStr = match[1] || "";
    const topic = topicsStr.replace(/[{}'"]/g, "").trim();
    listeners.push({ type: "kafka", method: "", topic, sourceFile: path });
  }

  const kafkaPattern = /@KafkaListener/g;
  if (kafkaPattern.test(content)) {
    void kafkaPattern.exec(content);
  }

  const methodPattern = /(?:public|private|protected)\s+(?:static\s+)?[\w<>[\], ?.&]+\s+(\w+)\s*\(/g;
  let methodMatch: RegExpExecArray | null;
  while ((methodMatch = methodPattern.exec(content)) !== null) {
    const prevIdx = methodMatch.index - 100;
    const context = content.slice(Math.max(0, prevIdx), methodMatch.index + 50);
    if (context.includes("@KafkaListener")) {
      const listener = listeners.find(l => l.type === "kafka" && !l.method);
      if (listener) {
        listener.method = methodMatch[1];
      }
    }
  }

  const rabbitListenerPattern = /@RabbitListener\s*\(([^)]*)\)/g;
  while ((match = rabbitListenerPattern.exec(content)) !== null) {
    const bindings = match[1];
    const queueMatch = bindings.match(/queues\s*=\s*({[^}]+}|[^,)]+)/)?.[1]?.replace(/[{}'"]/g, "").trim();
    listeners.push({ type: "rabbit", method: "", queue: queueMatch, sourceFile: path });
  }

  const rabbitHandlerPattern = /@RabbitHandler/g;
  if (rabbitHandlerPattern.test(content)) {
    void rabbitHandlerPattern.exec(content);
    const hasKafka = content.includes("@KafkaListener") || content.includes("@Kafka");
    const hasRabbit = content.includes("@RabbitListener") || content.includes("@RabbitHandler") || content.includes("RabbitTemplate");
    return {
      hasKafka: hasKafka || listeners.some(l => l.type === "kafka"),
      hasRabbit: hasRabbit || listeners.some(l => l.type === "rabbit"),
      listeners,
    };
  }

  const hasKafka = content.includes("@KafkaListener") || content.includes("@Kafka") || content.includes("KafkaTemplate") || listeners.some(l => l.type === "kafka");
  const hasRabbit = content.includes("@RabbitListener") || content.includes("@RabbitHandler") || content.includes("RabbitTemplate") || listeners.some(l => l.type === "rabbit");

  return { hasKafka, hasRabbit, listeners };
}

export function analyzeHttpRequestClient(path: string, content: string): HttpClientAnalysis {
  const clients: HttpClientAnalysis["clients"] = [];
  let hasFeign = false;
  let hasRestTemplate = false;
  let hasWebClient = false;

  if (content.includes("@FeignClient")) {
    hasFeign = true;
    clients.push({ type: "feign", sourceFile: path });
  }

  if (content.includes("RestTemplate")) {
    hasRestTemplate = true;
    clients.push({ type: "restTemplate", sourceFile: path });
  }

  if (content.includes("WebClient")) {
    hasWebClient = true;
    clients.push({ type: "webClient", sourceFile: path });
  }

  return { hasFeign, hasRestTemplate, hasWebClient, clients };
}

export function analyzeModule(path: string, content: string): ModuleAnalysis {
  const lower = path.toLowerCase();

  const isMavenModule = lower.endsWith("pom.xml");
  const isGradleModule = lower.endsWith("build.gradle") || lower.endsWith("build.gradle.kts") || lower.endsWith("settings.gradle");
  let isSpringBootApp = false;
  let mainClass: string | undefined;

  if (lower.endsWith(".java") || lower.endsWith(".kt")) {
    if (content.includes("@SpringBootApplication")) {
      isSpringBootApp = true;
      const classMatch = content.match(/\b(?:public\s+|final\s+)*class\s+(\w+)/);
      mainClass = classMatch?.[1];
    }
  }

  if (isMavenModule) {
    if (content.includes("spring-boot-starter-parent") || content.includes("spring-boot-starter")) {
      isSpringBootApp = true;
    }
  }

  if (isGradleModule) {
    if (content.includes("spring-boot") || content.includes("org.springframework.boot")) {
      isSpringBootApp = true;
    }
  }

  return { isMavenModule, isGradleModule, isSpringBootApp, mainClass };
}

export function analyzeDocker(path: string, content: string): DockerAnalysis {
  const lower = path.toLowerCase();
  let hasDockerfile = false;
  let hasComposeFile = false;
  const composeServices: string[] = [];

  if (lower.includes("dockerfile") || lower === "dockerfile" || lower.endsWith(".dockerfile")) {
    hasDockerfile = true;
  }

  if (lower.includes("docker-compose") || lower === "compose.yml" || lower === "compose.yaml" || lower.endsWith("docker-compose.yml") || lower.endsWith("docker-compose.yaml")) {
    hasComposeFile = true;
    const serviceMatches = Array.from(content.matchAll(/^\s*(\w+)\s*:/gm));
    for (const m of serviceMatches) {
      const svc = m[1]?.toLowerCase();
      if (svc && !["version", "services", "networks", "volumes"].includes(svc)) {
        composeServices.push(svc);
      }
    }
  }

  return { hasDockerfile, hasComposeFile, composeServices };
}

export function analyzeTests(path: string, content: string): TestAnalysis {
  const lower = path.toLowerCase();
  let hasTests = false;
  let testCount = 0;
  const frameworks: string[] = [];

  const baseName = path.split("/").pop()?.replace(/\.[^.]+$/, "") ?? "";
  const baseLower = baseName.toLowerCase();
  if (lower.includes("/test/") || lower.includes(".test.") || lower.includes("_test.") || lower.includes("testng") || lower.includes("junit") || baseLower.endsWith("test") || baseLower.endsWith("tests")) {
    hasTests = true;
    testCount = (content.match(/@(?:Test|TestFactory|ParameterizedTest)\s*\(/g) || []).length;
    if (content.includes("import org.junit")) frameworks.push("junit");
    if (content.includes("import org.testng")) frameworks.push("testng");
    if (content.includes("import io.rest assured")) frameworks.push("rest-assured");
    if (content.includes("@SpringBootTest")) frameworks.push("spring-test");
    if (testCount === 0 && content.includes("class ")) testCount = 1;
  }

  return { hasTests, testCount, frameworks };
}

export function analyzeSpringBootComponent(path: string, content: string): SpringBootAnalysis {
  const lowerPath = path.toLowerCase();
  const component = classifyComponent(path, content, lowerPath);
  const routes = component.kind === "controller" ? extractRoutes(path, content) : [];
  const security = analyzeSecurity(path, content);
  const messageQueue = analyzeMessageQueue(path, content);
  const httpClient = analyzeHttpRequestClient(path, content);
  const module = analyzeModule(path, content);
  const docker = analyzeDocker(path, content);
  const test = analyzeTests(path, content);

  return {
    component,
    routes,
    security,
    messageQueue,
    httpClient,
    module,
    docker,
    test,
  };
}

function classifyComponent(_path: string, content: string, lowerPath: string): SpringComponent {
  const evidence: string[] = [];
  let confidence: "high" | "medium" | "low" = "low";
  let kind: SpringComponent["kind"] = "unknown";

  if (content.includes("@RestController") || content.includes("@Controller") || content.includes("@ControllerAdvice") ||
      /controller(?:impl|advice|test)?\.(java|kt)$/.test(lowerPath) ||
      lowerPath.includes("/controller/") || lowerPath.includes("/controllers/")) {
    kind = "controller";
    evidence.push("@RestController/@Controller annotation or controller path");
    confidence = "high";
  } else if (content.includes("@Repository") ||
             /repository(?:impl)?\.(java|kt)$/.test(lowerPath) ||
             lowerPath.includes("/repository/") || lowerPath.includes("/repositories/") ||
             lowerPath.includes("/dao/") ||
             content.includes("JpaRepository") || content.includes("CrudRepository")) {
    kind = "repository";
    evidence.push("@Repository annotation, JpaRepository, or repository path");
    confidence = "high";
  } else if (content.includes("@Entity") || content.includes("@Table") || content.includes("@Document") ||
             /entity(?:impl)?\.(java|kt)$/.test(lowerPath) ||
             lowerPath.includes("/entity/") || lowerPath.includes("/entities/") ||
             lowerPath.includes("/model/") || lowerPath.includes("/domain/")) {
    kind = "entity";
    evidence.push("@Entity/@Table/@Document annotation or entity path");
    confidence = "high";
  } else if (content.includes("@EnableWebSecurity") || content.includes("@Configuration") && (content.includes("Security") || content.includes("WebSecurity"))) {
    kind = "security";
    evidence.push("Security configuration detected");
    confidence = "high";
  } else if (content.includes("@Configuration") || content.includes("@EnableAutoConfiguration") ||
             /config(?:uration)?\.(java|kt)$/.test(lowerPath) ||
             lowerPath.includes("/config/") || lowerPath.includes("/configuration/")) {
    kind = "configuration";
    evidence.push("@Configuration or configuration path");
    confidence = "high";
  } else if (content.includes("@FeignClient") || content.includes("@WebServiceClient") ||
             /client(?:impl)?\.(java|kt)$/.test(lowerPath) ||
             lowerPath.includes("/client/") || lowerPath.includes("/adapter/") || lowerPath.includes("/feign/")) {
    kind = "client";
    evidence.push("@FeignClient or HTTP client annotation");
    confidence = "high";
  } else if (content.includes("@Service") ||
             /service(?:impl|implementation)?\.(java|kt)$/.test(lowerPath) ||
             lowerPath.includes("/service/") || lowerPath.includes("/services/") ||
             lowerPath.includes("/usecase/") || lowerPath.includes("/usecases/") ||
             /(?:handler|producer|processor|scheduler|job|worker)(?:impl)?\.(java|kt)$/.test(lowerPath)) {
    kind = "service";
    evidence.push("@Service annotation or service/handler naming");
    confidence = "high";
  } else if (content.includes("@KafkaListener") || content.includes("@RabbitListener") ||
             content.includes("@RabbitHandler")) {
    kind = "queue_listener";
    evidence.push("@KafkaListener/@RabbitListener annotation");
    confidence = "high";
  } else if (lowerPath.includes("/test/") || lowerPath.includes(".test.") || lowerPath.includes("_test.") ||
             /(?:test|tests)\.java$/.test(lowerPath)) {
    kind = "test";
    evidence.push("Test file detected by path or naming convention");
    confidence = "high";
  } else if (content.includes("@Component")) {
    kind = "unknown";
    evidence.push("@Component annotation (generic)");
    confidence = "medium";
  }

  return { kind, confidence, evidence };
}

export function getConfidenceLevel(component: ArchitectureComponent): "high" | "medium" | "low" {
  if (component.evidence.length > 0) {
    const highEvidence = component.evidence.filter(e => e.confidence === "high");
    if (highEvidence.length > 0) return "high";
    if (component.evidence.length > 2) return "medium";
  }
  return "low";
}
