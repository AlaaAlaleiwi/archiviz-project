import type { Graph, NodeData, JavaVersion, SpringBootVersion, BuildTool } from "../types";
import { getComponentConfig, formatConfigForPrompt } from "./componentConfigs";
import { getCodeScaffold } from "./codeScaffolds";
import type { ClassRole } from "./classMap";

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

function springBootContext(javaVersion: JavaVersion, springBootVersion: SpringBootVersion): string {
  return `
## Spring Boot ${springBootVersion} conventions (Java ${javaVersion})
- Annotations: @RestController, @Service, @Repository, @Entity, @Transactional
- Constructor injection only — never @Autowired on fields (use @RequiredArgsConstructor from Lombok)
- Lombok: @RequiredArgsConstructor, @Data, @Builder, @Getter, @Setter, @Slf4j
- DTOs for ALL API boundaries — never serialize @Entity directly to JSON
- Validation: @Valid on controller params; @NotBlank / @Email / @Positive / @Size on DTO fields
- Exception handling: @RestControllerAdvice + @ExceptionHandler; return ProblemDetail (RFC 9457)
- Flyway migrations in src/main/resources/db/migration/V{n}__{description}.sql
- Swagger / OpenAPI via springdoc-openapi: @Operation, @ApiResponse, @Tag on controllers
- Security: Spring Security with JWT filter chain (stateless); BCryptPasswordEncoder for passwords
- Use Java ${javaVersion >= "21" ? "records for simple DTOs where immutability is desired" : "classes with Lombok for DTOs"}
- Package structure: com.<project>.<module>.{controller,service,repository,entity,dto,exception}`;
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

export function buildAIPrompt(
  graph: Graph,
  language: string,
  framework: string,
  projectName: string,
): string {
  if (language === "java") {
    const javaVersion: JavaVersion = "17"; // default
    const springBootVersion: SpringBootVersion = framework as SpringBootVersion || "3.2";
    const summary  = buildArchitectureSummary(graph);
    const sbCtx    = springBootContext(javaVersion, springBootVersion);
    const testCtx  = testingContext(javaVersion);

    return `You are a senior Java ${javaVersion} engineer specialising in Spring Boot ${springBootVersion}.
Your code is production-grade: clean, tested, secure, idiomatic, and fully implemented.

# Project: ${projectName}
Language: Java ${javaVersion}  |  Framework: Spring Boot ${springBootVersion}

## System architecture

Components:
${summary.components}

Relationships:
${summary.relationships}
${sbCtx}
${testCtx}

## Global output rules
- Output ONLY raw source code — no markdown fences, no prose, no explanatory text outside code.
- Every file MUST start with exactly: === FILE: <path/as/shown/below> ===
- Implement EVERY file listed — do not skip tests.
- No placeholder TODO comments — write real, working implementations.
- All code must compile with zero errors on Java ${javaVersion} with Spring Boot ${springBootVersion}.
- Follow the exact package paths shown in each file header.`.trim();
  } else {
    const summary = buildArchitectureSummary(graph);
    return `You are a senior ${language} engineer specialising in ${framework}.
Your code is production-grade: clean, tested, secure, idiomatic, and fully implemented.

# Project: ${projectName}
Language: ${language}  |  Framework: ${framework}

## System architecture

Components:
${summary.components}

Relationships:
${summary.relationships}

## Global output rules
- Output ONLY raw source code — no markdown fences, no prose, no explanatory text outside code.
- Every file MUST start with exactly: === FILE: <path/as/shown/below> ===
- Implement EVERY file listed — do not skip tests.
- No placeholder TODO comments — write real, working implementations.
- All code must compile with zero errors.
- Follow best practices for ${language}.`.trim();
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
): string {
  const base       = buildAIPrompt(graph, "java", springBootVersion, projectName);
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

// ─── Full-project prompt (used by "Generate Prompt" button) ──────────────────

export function buildFullProjectPrompt(
  graph: Graph,
  javaVersion: JavaVersion,
  springBootVersion: SpringBootVersion,
  projectName: string,
  buildTool: BuildTool = "maven",
): string {
  const pkg      = sanitizePkg(projectName);
  const buildFile = buildTool === "maven" ? "pom.xml" : "build.gradle.kts";
  const base = buildAIPrompt(graph, "java", springBootVersion, projectName);
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
