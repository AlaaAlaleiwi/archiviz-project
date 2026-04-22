import type { Graph, NodeData, JavaVersion, SpringBootVersion, BuildTool } from "../types";
import { getComponentConfig, formatConfigForPrompt } from "./componentConfigs";
import { getCodeScaffold } from "./codeScaffolds";
import type { ClassRole } from "./classMap";

export type PromptContextFile = {
  path: string;
  content: string;
};

export type PromptBuildOptions = {
  existingFiles?: PromptContextFile[];
};

// ─── String helpers ───────────────────────────────────────────────────────────

function sanitizePkg(value: string) {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") || "app";
}

function toKebab(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "-").replace(/^-+|-+$/g, "").toLowerCase() || "component";
}

function toSnake(value: string) {
  return value.trim().replace(/[^a-zA-Z0-9]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase() || "component";
}

function toPascal(value: string) {
  return value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join("");
}

function formatList(items: string[]) {
  return items.length ? items.map(i => `- ${i}`).join("\n") : "- None";
}

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function truncate(value: string, max = 2400) {
  return value.length > max ? `${value.slice(0, max)}\n/* ...truncated... */` : value;
}

export function sanitizeFileName(value: string) {
  return toPascal(value) || "Component";
}

// ─── Graph helpers ────────────────────────────────────────────────────────────

function buildNodeMap(graph: Graph) {
  return new Map(graph.nodes.map(n => [n.id, n]));
}

function buildArchitectureSummary(graph: Graph) {
  const m = buildNodeMap(graph);
  return {
    components: formatList(graph.nodes.map(n => `${n.name} (${n.type})`)),
    relationships: formatList(
      graph.edges.map(e => `${m.get(e.from)?.name ?? e.from} → ${m.get(e.to)?.name ?? e.to}`)
    ),
  };
}

function getNodeLabelMap(graph: Graph) {
  return new Map(graph.nodes.map((node, index) => [node.id, `C${String(index + 1).padStart(2, "0")}`]));
}

function buildComponentBlueprint(graph: Graph) {
  const labels = getNodeLabelMap(graph);

  return formatList(graph.nodes.map(node => {
    const configSchema = getComponentConfig(node.type);
    const config = configSchema && node.config && Object.keys(node.config).length > 0
      ? compact(formatConfigForPrompt(configSchema, node.config))
      : "default sensible configuration";

    return [
      `${labels.get(node.id)} ${node.name}`,
      `type=${node.type}`,
      `module=${toSnake(node.name).replace(/_/g, "")}`,
      `route=/api/${toKebab(node.name)}`,
      `config=${config}`,
    ].join(" | ");
  }));
}

function buildRelationshipBlueprint(graph: Graph) {
  const nodes = buildNodeMap(graph);
  const labels = getNodeLabelMap(graph);

  return formatList(graph.edges.map(edge => {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    const fromName = from ? `${labels.get(from.id)} ${from.name}` : edge.from;
    const toName = to ? `${labels.get(to.id)} ${to.name}` : edge.to;

    return `${fromName} -> ${toName} | integration=typed service/client/event boundary | reason=inferred from architecture edge`;
  }));
}

function findNodeFiles(node: NodeData, files: PromptContextFile[]) {
  const candidates = [
    toSnake(node.name).replace(/_/g, ""),
    toKebab(node.name).replace(/-/g, ""),
    node.type.replace(/_/g, ""),
  ].filter(part => part.length >= 3);

  return files.filter(file => {
    const normalizedPath = file.path.toLowerCase().replace(/[^a-z0-9]+/g, "");
    return candidates.some(candidate => normalizedPath.includes(candidate.toLowerCase()));
  });
}

function buildIncrementalUpdateSection(graph: Graph, files: PromptContextFile[]) {
  if (files.length === 0) return "";

  const nodesWithCode = graph.nodes
    .map(node => ({ node, files: findNodeFiles(node, files) }))
    .filter(entry => entry.files.length > 0);

  const nodesWithoutCode = graph.nodes
    .filter(node => !nodesWithCode.some(entry => entry.node.id === node.id));

  const nodes = buildNodeMap(graph);
  const integrationEdges = graph.edges.filter(edge => {
    const fromHasCode = nodesWithCode.some(entry => entry.node.id === edge.from);
    const toHasCode = nodesWithCode.some(entry => entry.node.id === edge.to);
    return fromHasCode || toHasCode;
  });

  const existingSummary = nodesWithCode.map(entry => {
    const fileList = entry.files.slice(0, 8).map(file => file.path).join(", ");
    return `- ${entry.node.name} (${entry.node.type}) already has code: ${fileList}`;
  });

  const newSummary = nodesWithoutCode.map(node => `- ${node.name} (${node.type}) appears new or has no generated files yet.`);

  const integrationSummary = integrationEdges.map(edge => {
    const from = nodes.get(edge.from);
    const to = nodes.get(edge.to);
    return `- Update integration: ${from?.name ?? edge.from} -> ${to?.name ?? edge.to}`;
  });

  const representativeFiles = nodesWithCode
    .flatMap(entry => entry.files.slice(0, 4))
    .slice(0, 18)
    .map(file => `=== EXISTING FILE: ${file.path} ===\n${truncate(file.content)}`)
    .join("\n\n");

  return `
# Incremental Update Mode
Existing code is present. Do not regenerate the whole project or rewrite existing services from scratch.

## Existing generated services/files
${formatList(existingSummary)}

## New or missing services
${formatList(newSummary)}

## Required integration updates
${formatList(integrationSummary)}

## Incremental rules
- Preserve existing package names, public APIs, DTOs, persistence mappings, tests, and behavior unless a graph relationship requires a targeted change.
- If a new service was added to the canvas, generate only the files for the new service plus minimal changes to existing services that must call or depend on it.
- For an existing service connected to a newly added service, update the current service in place: add constructor-injected client/service dependency, adapter, DTO mapping, configuration, and focused tests.
- Do not ask to recreate or regenerate already generated services from scratch.
- Return only changed or newly required files, each with the exact === FILE: path === marker.
- When editing an existing file, output the complete updated file content for that file.
- Keep unchanged existing files out of the response.

## Existing code excerpts for context
${representativeFiles || "- Existing code is available in the workspace, but no matching excerpts were selected."}
`.trim();
}

function buildNodeRelationships(graph: Graph, node: NodeData) {
  const m = buildNodeMap(graph);
  return {
    incoming: formatList(
      graph.edges.filter(e => e.to === node.id)
        .map(e => `${m.get(e.from)?.name ?? e.from} → ${node.name}`)
    ),
    outgoing: formatList(
      graph.edges.filter(e => e.from === node.id)
        .map(e => `${node.name} → ${m.get(e.to)?.name ?? e.to}`)
    ),
  };
}

// ─── FileSpec — one entry per file the AI must produce ───────────────────────

export type FileSpec = {
  path: string;
  className: string;
  role: ClassRole | "test" | "dto" | "module" | "schema" | "interface";
  description: string;
  isTest: boolean;
};

export type ServiceGenerationPrompt = {
  nodeId: string;
  serviceName: string;
  serviceRoot: string;
  prompt: string;
};

// ─── Java / Spring Boot file layout ──────────────────────────────────────────

function specsJava(
  node: NodeData,
  pkg: string,
  pascal: string,
  javaVersion: JavaVersion,
  springBootVersion: SpringBootVersion,
  buildTool: BuildTool,
): FileSpec[] {
  const mod   = toSnake(node.name).replace(/_/g, "");
  const kebab = toKebab(node.name);
  const base  = `src/main/java/com/${pkg}/${mod}`;
  const tbase = `src/test/java/com/${pkg}/${mod}`;

  const buildFileSpec: FileSpec = buildTool === "maven"
    ? {
        path: "pom.xml",
        className: "pom",
        role: "config",
        isTest: false,
        description:
          `Maven POM — parent: spring-boot-starter-parent ${springBootVersion}; ` +
          `groupId: com.${pkg}; artifactId: ${kebab}; Java ${javaVersion}; ` +
          `dependencies: spring-boot-starter-web, spring-boot-starter-data-jpa, ` +
          `postgresql, spring-boot-starter-validation, spring-boot-starter-security, ` +
          `lombok (optional:true), flyway-core, springdoc-openapi-starter-webmvc-ui, ` +
          `spring-boot-starter-test (scope:test), testcontainers:junit-jupiter + postgresql (scope:test), ` +
          `spring-boot-starter-webflux; ` +
          `plugins: spring-boot-maven-plugin (exclude lombok), maven-compiler-plugin with lombok annotationProcessorPath`,
      }
    : {
        path: "build.gradle.kts",
        className: "build",
        role: "config",
        isTest: false,
        description:
          `Gradle Kotlin DSL — plugins: java, id("org.springframework.boot") version "${springBootVersion}", ` +
          `id("io.spring.dependency-management"); ` +
          `group = "com.${pkg}"; sourceCompatibility = JavaVersion.VERSION_${javaVersion}; ` +
          `dependencies: same full set as the Maven equivalent above; ` +
          `configurations { compileOnly { extendsFrom(configurations.annotationProcessor.get()) } }; ` +
          `tasks.withType<Test> { useJUnitPlatform() }`,
      };

  const specs: FileSpec[] = [
    buildFileSpec,
    {
      path: "src/main/resources/application.yml",
      className: "application",
      role: "config",
      isTest: false,
      description:
        `Spring Boot application config — ` +
        `server.port: <unique port for this microservice>; ` +
        `spring.application.name: ${kebab}; ` +
        `spring.datasource: url (jdbc:postgresql://localhost:5432/${mod}), username, password; ` +
        `spring.jpa: hibernate.ddl-auto: validate, show-sql: false, open-in-view: false; ` +
        `spring.flyway: enabled: true, locations: classpath:db/migration; ` +
        `management.endpoints.web.exposure.include: health,info,metrics; ` +
        `logging.level.root: INFO, logging.level.com.${pkg}: DEBUG`,
    },
    {
      path: `${base}/controller/${pascal}Controller.java`,
      className: `${pascal}Controller`,
      role: "controller",
      description: `@RestController — maps HTTP routes to ${pascal}Service; uses @Valid on request bodies; includes @Operation/@Tag Swagger annotations; @ResponseStatus on 201/204`,
      isTest: false,
    },
    {
      path: `${base}/service/${pascal}Service.java`,
      className: `${pascal}Service`,
      role: "service",
      description: `Service interface defining the contract for ${pascal} business operations`,
      isTest: false,
    },
    {
      path: `${base}/service/impl/${pascal}ServiceImpl.java`,
      className: `${pascal}ServiceImpl`,
      role: "service",
      description: `@Service @Transactional implementation of ${pascal}Service; calls repository; maps entities ↔ DTOs; throws ${pascal}NotFoundException`,
      isTest: false,
    },
    {
      path: `${base}/repository/${pascal}Repository.java`,
      className: `${pascal}Repository`,
      role: "repository",
      description: `Spring Data JPA JpaRepository<${pascal}Entity, String>; add custom @Query / derived query methods as needed`,
      isTest: false,
    },
    {
      path: `${base}/entity/${pascal}Entity.java`,
      className: `${pascal}Entity`,
      role: "model",
      description: `@Entity @Table; @Id @GeneratedValue(UUID); @CreationTimestamp @UpdateTimestamp; Lombok @Getter @Setter @Builder @NoArgsConstructor @AllArgsConstructor`,
      isTest: false,
    },
    {
      path: `${base}/dto/${pascal}Request.java`,
      className: `${pascal}Request`,
      role: "dto",
      description: `Request DTO with Bean Validation (@NotBlank, @Email, @Positive, etc.); Lombok @Data @Builder @NoArgsConstructor @AllArgsConstructor`,
      isTest: false,
    },
    {
      path: `${base}/dto/${pascal}Response.java`,
      className: `${pascal}Response`,
      role: "dto",
      description: `Response DTO — never expose the @Entity directly; Lombok @Data @Builder; include all fields a caller needs`,
      isTest: false,
    },
    {
      path: `${base}/exception/${pascal}NotFoundException.java`,
      className: `${pascal}NotFoundException`,
      role: "config",
      description: `extends RuntimeException; caught by @RestControllerAdvice GlobalExceptionHandler → HTTP 404`,
      isTest: false,
    },
    {
      path: `src/main/resources/db/migration/V1__create_${toSnake(node.name)}.sql`,
      className: "migration",
      role: "config",
      description: `Flyway migration — CREATE TABLE ${toSnake(node.name)} (id UUID PK DEFAULT gen_random_uuid(), created_at, updated_at, domain columns); CREATE INDEX statements`,
      isTest: false,
    },
    // ── Unit test (Mockito + JUnit 5) ──
    {
      path: `${tbase}/service/${pascal}ServiceImplTest.java`,
      className: `${pascal}ServiceImplTest`,
      role: "test",
      description: `@ExtendWith(MockitoExtension.class) unit test; @Mock ${pascal}Repository; @InjectMocks ${pascal}ServiceImpl; test findAll, findById (found + notFound), create, update, delete with Mockito verify and AssertJ assertions`,
      isTest: true,
    },
    // ── Controller slice test (MockMvc) ──
    {
      path: `${tbase}/controller/${pascal}ControllerTest.java`,
      className: `${pascal}ControllerTest`,
      role: "test",
      description: `@WebMvcTest(${pascal}Controller.class); @MockBean ${pascal}Service; MockMvc tests for GET /api, GET /api/{id} (200+404), POST (201+400 validation), PUT, DELETE; andExpect(status()) + andExpect(jsonPath(...))`,
      isTest: true,
    },
    // ── Integration test (TestContainers) ──
    {
      path: `${tbase}/${pascal}IntegrationTest.java`,
      className: `${pascal}IntegrationTest`,
      role: "test",
      description: `@SpringBootTest(webEnvironment=RANDOM_PORT) + @Testcontainers; @Container PostgreSQLContainer; full round-trip test: POST → GET → PUT → DELETE; uses RestAssured or TestRestTemplate; @Sql to set up and tear down test data`,
      isTest: true,
    },
  ];

  return specs;
}

/**
 * Returns every FileSpec (implementation + test) for a node.
 */
export function getFileSpecs(
  node: NodeData,
  javaVersion: JavaVersion,
  springBootVersion: SpringBootVersion,
  projectName: string,
  buildTool: BuildTool = "maven",
): FileSpec[] {
  const pkg    = sanitizePkg(projectName);
  const pascal = toPascal(node.name) || "Component";
  return specsJava(node, pkg, pascal, javaVersion, springBootVersion, buildTool);
}

export function getGeneratedFilePath(node: NodeData, projectName: string): string {
  const specs = getFileSpecs(node, "21", "3.4", projectName, "maven");
  return specs.find(s => !s.isTest && s.path.endsWith(".java"))?.path
    ?? `src/main/java/${toKebab(node.name)}.java`;
}

// ─── Spring Boot context blocks ────────────────────────────────────────────────

function springBootContext(javaVersion: JavaVersion, springBootVersion: SpringBootVersion, buildTool: BuildTool): string {
  return `
## Spring Boot ${springBootVersion} conventions (Java ${javaVersion})
- Build system: ${buildTool === "maven" ? "Maven with pom.xml" : "Gradle Kotlin DSL with build.gradle.kts"}
- Use one cohesive Spring Boot application, not disconnected snippets.
- Package root: com.<sanitized-project-name>; packages by feature/module.
- Controllers: @RestController, versioned REST routes, DTOs only, @Valid request bodies.
- Services: interfaces plus @Service implementations; constructor injection only.
- Persistence: Spring Data JPA repositories, entities with UUID ids, Flyway migrations.
- Validation: Bean Validation annotations on DTOs; meaningful validation errors.
- Error handling: one @RestControllerAdvice returning ProblemDetail responses.
- Observability: actuator health/info/metrics, useful structured logging, no noisy debug prints.
- Security: if auth/security is in the graph, implement stateless JWT-style security; otherwise provide a minimal documented SecurityFilterChain suitable for local development.
- OpenAPI: annotate controllers with @Tag, @Operation, and relevant @ApiResponse entries.
- Java style: use records for immutable request/response DTOs on Java ${javaVersion}; avoid field injection and hidden static state.`;
}

function testingContext(javaVersion: JavaVersion): string {
  return `
## Testing strategy (Java ${javaVersion} / Spring Boot)

### Unit tests — @ExtendWith(MockitoExtension.class)
- Mock all collaborators with @Mock; inject with @InjectMocks
- Mockito: when(...).thenReturn(...), verify(..., times(1)), ArgumentCaptor
- AssertJ: assertThat(result).isNotNull().extracting(...).containsExactly(...)
- Test naming: methodName_whenCondition_thenExpectedResult()

### Controller slice tests — @WebMvcTest
- @MockBean the service layer; use MockMvc for HTTP assertions
- andExpect(status().isOk()), andExpect(jsonPath("$.id").value(...))
- Test validation: POST with missing/invalid fields → 400 + error details

### Integration tests — @SpringBootTest + TestContainers
- @Testcontainers + @Container PostgreSQLContainer + @DynamicPropertySource
- Test the full HTTP stack: POST → GET → PUT → DELETE against a real database
- @Sql("/test-data/setup.sql") for seeding, @Sql(executionPhase=AFTER_TEST_METHOD) for teardown
- Use RestAssured or TestRestTemplate for HTTP calls`;
}

// ─── Base prompt ──────────────────────────────────────────────────────────────

const JAVA_VERSIONS: JavaVersion[] = ["17", "21", "25"];

function isJavaVersion(value: string): value is JavaVersion {
  return JAVA_VERSIONS.includes(value as JavaVersion);
}

function resolvePromptTarget(
  languageOrJavaVersion: string,
  frameworkOrSpringBootVersion: string,
) {
  if (isJavaVersion(languageOrJavaVersion)) {
    return {
      language: "java",
      javaVersion: languageOrJavaVersion,
      framework: `Spring Boot ${frameworkOrSpringBootVersion}`,
      springBootVersion: frameworkOrSpringBootVersion as SpringBootVersion,
    };
  }

  const language = languageOrJavaVersion.toLowerCase();
  if (language === "java") {
    return {
      language,
      javaVersion: "21" as JavaVersion,
      framework: `Spring Boot ${frameworkOrSpringBootVersion}`,
      springBootVersion: frameworkOrSpringBootVersion as SpringBootVersion,
    };
  }

  return {
    language,
    javaVersion: null,
    framework: frameworkOrSpringBootVersion,
    springBootVersion: null,
  };
}

export function buildAIPrompt(
  graph: Graph,
  languageOrJavaVersion: string,
  frameworkOrSpringBootVersion: string,
  projectName: string,
  buildTool: BuildTool = "maven",
  options: PromptBuildOptions = {},
): string {
  const target = resolvePromptTarget(languageOrJavaVersion, frameworkOrSpringBootVersion);
  const projectSlug = toKebab(projectName);
  const incrementalSection = buildIncrementalUpdateSection(graph, options.existingFiles ?? []);

  if (target.language === "java" && target.javaVersion && target.springBootVersion) {
    const javaVersion = target.javaVersion;
    const springBootVersion = target.springBootVersion;
    const sbCtx = springBootContext(javaVersion, springBootVersion, buildTool);
    const testCtx = testingContext(javaVersion);

    return `Act as a principal backend engineer and production code generator.
Generate a complete, cohesive, buildable ${buildTool} project. Make strong implementation choices when details are unspecified, but keep them consistent with the architecture below.

# Mission
Create "${projectName || "architecture-app"}" as a Java ${javaVersion} / Spring Boot ${springBootVersion} application.
The result must be immediately usable by a developer: install dependencies, run tests, start the app, inspect OpenAPI docs, and exercise the REST endpoints.
${incrementalSection ? `\n${incrementalSection}\n` : ""}

# Architecture Blueprint
Components:
${buildComponentBlueprint(graph)}

Relationships:
${buildRelationshipBlueprint(graph)}

# Product And Domain Rules
- Infer a practical domain model for each component from its name and type.
- Expose clean CRUD-style REST APIs for data-owning services unless the component type clearly implies infrastructure behavior.
- Reflect architecture relationships in code through service calls, typed clients, events, queues, or adapters. Do not ignore edges.
- Keep modules loosely coupled: communicate through interfaces, DTOs, and explicit integration boundaries.
- Use deterministic names, packages, routes, table names, and DTO names derived from the component names.
- Prefer simple, understandable business logic over elaborate abstractions.

# Required Project Files
- ${buildTool === "maven" ? "pom.xml" : "build.gradle.kts"} with all dependencies required by the implementation.
- src/main/java/com/${sanitizePkg(projectName)}/Application.java
- src/main/resources/application.yml
- src/main/resources/db/migration/*.sql for every persisted aggregate.
- Feature packages under src/main/java/com/${sanitizePkg(projectName)}/<module>/...
- Tests under src/test/java/com/${sanitizePkg(projectName)}/...
- README.md with setup, run, test, configuration, and endpoint notes.
- Dockerfile and docker-compose.yml when database or infrastructure services are required.
${sbCtx}
${testCtx}

# Output Contract
- Output only file contents. No markdown fences. No explanations.
- Every file must start with exactly: === FILE: path/to/file.ext ===
- Use relative paths from the project root.
- Include all imports, package declarations, configuration, and tests for every new or changed file.
- Do not emit duplicate files. Use one build file and one application.yml.
- Do not use placeholders, TODOs, ellipses, pseudo-code, or "implementation omitted".
- If a dependency is referenced in code, it must be declared in the build file.
- The generated project must compile and tests must be realistic, not superficial.

# Quality Gate Before Answering
Mentally verify:
- The build file matches Java ${javaVersion}, Spring Boot ${springBootVersion}, and ${buildTool}.
- Package names match file paths.
- Controllers call services, services call repositories/clients, and DTO/entity mapping is complete.
- Validation and exception handling paths are implemented.
- Flyway schema matches JPA entities.
- Tests use the same routes, DTO fields, and package names as production code.

# Project Identity
- Project slug: ${projectSlug}
- Java package root: com.${sanitizePkg(projectName)}
- Build tool: ${buildTool}`.trim();
  } else {
    const summary = buildArchitectureSummary(graph);
    return `Act as a principal software engineer and production code generator.
Generate a complete, cohesive, buildable project. Make strong implementation choices when details are unspecified, but keep them consistent with the architecture below.

# Project
Name: ${projectName}
Language: ${target.language}
Framework: ${target.framework}
${incrementalSection ? `\n${incrementalSection}\n` : ""}

# Architecture Blueprint
Components:
${summary.components}

Relationships:
${summary.relationships}

# Output Contract
- Output only file contents. No markdown fences. No explanations.
- Every file must start with exactly: === FILE: path/to/file.ext ===
- Use relative paths from the project root.
- Include build/config files, source files, tests, and README.
- Do not use placeholders, TODOs, ellipses, pseudo-code, or "implementation omitted".
- If a dependency is referenced in code, it must be declared in the build file.
- The generated project must compile and tests must exercise meaningful behavior.

# Engineering Standards
- Use idiomatic ${target.language} and ${target.framework}.
- Keep modules loosely coupled and aligned with the architecture relationships.
- Implement validation, error handling, and configuration needed for local development.
- Prefer simple, maintainable code over clever abstractions.`.trim();
  }
}

// ─── Node implementation prompt ───────────────────────────────────────────────

export function buildNodeImplementationPrompt(
  graph: Graph,
  node: NodeData,
  javaVersion: JavaVersion,
  springBootVersion: SpringBootVersion,
  projectName: string,
  buildTool: BuildTool = "maven",
  options: PromptBuildOptions = {},
): string {
  const base       = buildAIPrompt(graph, javaVersion, springBootVersion, projectName, buildTool, options);
  const rel        = buildNodeRelationships(graph, node);
  const specs      = getFileSpecs(node, javaVersion, springBootVersion, projectName, buildTool);
  const implSpecs  = specs.filter(s => !s.isTest);
  const testSpecs  = specs.filter(s => s.isTest);

  const configSchema = getComponentConfig(node.type);
  const configSection = configSchema && node.config && Object.keys(node.config).length > 0
    ? `\n## User configuration (honour exactly)\n${formatConfigForPrompt(configSchema, node.config)}\n`
    : "";

  const scaffold = getCodeScaffold({
    nodeName:          node.name,
    nodeType:          node.type,
    javaVersion,
    springBootVersion,
    config:            (node.config as Record<string, unknown>) ?? {},
    projectName,
  });

  const fileList = (list: FileSpec[]) =>
    list.map(s => `  === FILE: ${s.path} ===\n  // ${s.description}`).join("\n");

  const scaffoldSection = scaffold
    ? `\n## Pre-built scaffold (fill IMPLEMENT[n] sections only — do not change structure)\n\n${scaffold}\n`
    : "";

  return `${base}

---

# Component: ${node.name}
Type: ${node.type}
${configSection}
## Connections
Incoming: ${rel.incoming}
Outgoing: ${rel.outgoing}

## Required implementation files
${fileList(implSpecs)}

## Required test files
${fileList(testSpecs)}
${scaffoldSection}
## Instructions
- Generate every file listed above, each starting with its exact === FILE: path === header.
- Implementation files: complete, production-ready, zero placeholders.
- Test files: cover happy path, error paths, edge cases, and validation failures.
- Wire up all connections shown above through service calls, events, or dependency injection.
- Apply all user configuration choices exactly as specified.`.trim();
}

// ─── Multi-service streaming prompts ─────────────────────────────────────────

export function buildServiceGenerationPrompts(
  graph: Graph,
  javaVersion: JavaVersion,
  springBootVersion: SpringBootVersion,
  projectName: string,
  buildTool: BuildTool = "maven",
  options: PromptBuildOptions = {},
): ServiceGenerationPrompt[] {
  const nodes = buildNodeMap(graph);
  const projectSlug = toKebab(projectName || "architecture-app");
  const appPkg = sanitizePkg(projectName || "architectureapp");
  const sbCtx = springBootContext(javaVersion, springBootVersion, buildTool);
  const testCtx = testingContext(javaVersion);
  const incrementalSection = buildIncrementalUpdateSection(graph, options.existingFiles ?? []);

  return graph.nodes.map(node => {
    const serviceSlug = toKebab(node.name);
    const serviceRoot = `${projectSlug}-${serviceSlug}`;
    const servicePkg = `${appPkg}.${sanitizePkg(node.name)}`;
    const rel = buildNodeRelationships(graph, node);
    const connected = graph.edges
      .filter(edge => edge.from === node.id || edge.to === node.id)
      .map(edge => {
        const from = nodes.get(edge.from);
        const to = nodes.get(edge.to);
        const direction = edge.from === node.id ? "outgoing" : "incoming";
        return `${direction}: ${from?.name ?? edge.from} -> ${to?.name ?? edge.to}`;
      });
    const specs = getFileSpecs(node, javaVersion, springBootVersion, projectName, buildTool)
      .map(spec => ({
        ...spec,
        path: `${serviceRoot}/${spec.path}`,
      }));
    const fileList = specs.map(spec => `- === FILE: ${spec.path} === ${spec.description}`).join("\n");
    const existingNodeFiles = findNodeFiles(node, options.existingFiles ?? [])
      .slice(0, 10)
      .map(file => `=== EXISTING FILE: ${file.path} ===\n${truncate(file.content, 1800)}`)
      .join("\n\n");

    return {
      nodeId: node.id,
      serviceName: node.name,
      serviceRoot,
      prompt: `Act as a principal backend engineer and production code generator.
Generate exactly one independently buildable service for a multi-service architecture. Do not generate code for every service in this request.

# Target Service
- Service name: ${node.name}
- Component type: ${node.type}
- Repository/project folder: ${serviceRoot}
- Java package root: com.${servicePkg}
- Java: ${javaVersion}
- Spring Boot: ${springBootVersion}
- Build tool: ${buildTool}

# Full Architecture Context
Components:
${buildComponentBlueprint(graph)}

Relationships:
${buildRelationshipBlueprint(graph)}

# Target Service Connections
Incoming:
${rel.incoming}

Outgoing:
${rel.outgoing}

Connected boundaries:
${formatList(connected)}
${incrementalSection ? `\n${incrementalSection}\n` : ""}

# Generation Scope
- Generate only "${node.name}" and the files needed inside ${serviceRoot}/.
- Every output path must start with ${serviceRoot}/.
- Do not create files for other services. Represent other services only as typed clients, ports, DTOs, adapters, event contracts, or configuration needed by this service.
- If existing code for this service is present, update it in place instead of regenerating unrelated files.
- If this service depends on another newly added service, add the smallest focused client/adapter and DTO mapping needed for the connection.
- Keep this service independently buildable and testable.

# Required Files For This Service
${fileList}
${sbCtx}
${testCtx}

# Existing Service Code Excerpts
${existingNodeFiles || "- None for this service."}

# Output Contract
- Output only file contents. No markdown fences. No explanations.
- Every file must start with exactly: === FILE: path/to/file.ext ===
- Use only relative paths from the workspace root, always under ${serviceRoot}/.
- Include all imports, package declarations, configuration, and tests for every new or changed file.
- Do not emit duplicate files.
- Do not use placeholders, TODOs, ellipses, pseudo-code, or "implementation omitted".
- If a dependency is referenced in code, declare it in ${serviceRoot}/${buildTool === "maven" ? "pom.xml" : "build.gradle.kts"}.
- The service must compile by itself from inside ${serviceRoot}.`.trim(),
    };
  });
}

// ─── Full-project prompt (used by "Generate Prompt" button) ──────────────────

export function buildFullProjectPrompt(
  graph: Graph,
  javaVersion: JavaVersion,
  springBootVersion: SpringBootVersion,
  projectName: string,
  buildTool: BuildTool = "maven",
  options: PromptBuildOptions = {},
): string {
  const pkg      = sanitizePkg(projectName);
  const buildFile = buildTool === "maven" ? "pom.xml" : "build.gradle.kts";
  const base = buildAIPrompt(graph, javaVersion, springBootVersion, projectName, buildTool, options);
  return `${base}

---

# Full project generation

Generate the complete, integrated project including:
- ${buildFile} — Spring Boot ${springBootVersion} parent/plugin, Java ${javaVersion}, all required dependencies (web, data-jpa, postgresql, validation, security, lombok, flyway, springdoc-openapi, testcontainers)
- src/main/resources/application.yml — server port, spring.application.name: ${toKebab(projectName)}, datasource (jdbc:postgresql://localhost:5432/${pkg}), JPA (ddl-auto: validate), Flyway, actuator endpoints, logging levels
- All service implementations (controller, service, repository, entity, DTOs, exceptions) for each component
- All Flyway migrations (src/main/resources/db/migration/V1__create_<table>.sql)
- All tests: JUnit 5 unit tests (@ExtendWith(MockitoExtension.class)), @WebMvcTest controller tests, TestContainers integration tests
- Multi-stage Dockerfile (build stage: ${buildTool === "maven" ? "maven:3-eclipse-temurin-" + javaVersion : "gradle:8-jdk" + javaVersion}-alpine; run stage: eclipse-temurin:${javaVersion}-jre-alpine)
- docker-compose.yml with PostgreSQL 16 and the application service
- README.md with setup, run, and test instructions

Output every file starting with === FILE: <path> ===.`.trim();
}
