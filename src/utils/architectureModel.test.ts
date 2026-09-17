import { describe, it, expect } from "vitest";
import {
  createEmptyArchitectureModel,
  MODEL_VERSION,
  genStableId,
  genArchId,
} from "./architectureModel";
import {
  migrateFromSavedProject,
  isArchitectureModel,
  nodeTypeToComponentKind,
  edgeLabelToProtocol,
  roleForPath,
} from "./architectureModelMigration";
import type { Graph } from "../types";

describe("createEmptyArchitectureModel", () => {
  it("creates a v2 model with given project name", () => {
    const model = createEmptyArchitectureModel("my-app");
    expect(model.version).toBe(MODEL_VERSION);
    expect(model.schemaVersion).toBe(MODEL_VERSION);
    expect(model.projectName).toBe("my-app");
    expect(model.components).toEqual([]);
    expect(model.relationships).toEqual([]);
  });

  it("uses default language and framework", () => {
    const model = createEmptyArchitectureModel("svc");
    expect(model.language).toBe("java");
    expect(model.framework).toBe("Spring Boot");
  });

  it("sets timestamps", () => {
    const model = createEmptyArchitectureModel("svc");
    expect(model.createdAt).toBeTruthy();
    expect(model.updatedAt).toBeTruthy();
  });
});

describe("genArchId", () => {
  it("generates prefixed IDs", () => {
    const id = genArchId("component");
    expect(id).toMatch(/^component_[a-z0-9]+$/);
  });

  it("generates unique IDs", () => {
    const ids = new Set(Array.from({ length: 100 }, () => genArchId("x")));
    expect(ids.size).toBe(100);
  });
});

describe("genStableId", () => {
  it("normalizes identifiers", () => {
    expect(genStableId("service", "UserService")).toBe("stable-service-user-service");
  });

  it("handles multi-word identifiers", () => {
    expect(genStableId("service", "Order Processing Service")).toBe("stable-service-order-processing-service");
  });

  it("handles empty strings", () => {
    expect(genStableId("module", "")).toBe("stable-module-unnamed");
  });
});

describe("nodeTypeToComponentKind", () => {
  it("maps microservice to service", () => {
    expect(nodeTypeToComponentKind("microservice")).toBe("service");
  });

  it("maps sql_database to database", () => {
    expect(nodeTypeToComponentKind("sql_database")).toBe("database");
  });

  it("maps client_api to gateway", () => {
    expect(nodeTypeToComponentKind("client_api")).toBe("gateway");
  });

  it("maps config_service to configuration", () => {
    expect(nodeTypeToComponentKind("config_service")).toBe("configuration");
  });

  it("maps unknown to other", () => {
    expect(nodeTypeToComponentKind("weird_type")).toBe("other");
  });
});

describe("edgeLabelToProtocol", () => {
  it("defaults to http", () => {
    expect(edgeLabelToProtocol(undefined)).toBe("http");
  });

  it("detects kafka", () => {
    expect(edgeLabelToProtocol("kafka")).toBe("kafka");
  });

  it("detects grpc", () => {
    expect(edgeLabelToProtocol("grpc://localhost:50051")).toBe("grpc");
  });

  it("detects redis", () => {
    expect(edgeLabelToProtocol("redis-cache")).toBe("redis");
  });
});

describe("roleForPath", () => {
  it("identifies test files", () => {
    expect(roleForPath("src/test/java/com/example/MyServiceTest.java")).toBe("test");
  });

  it("identifies migration files", () => {
    expect(roleForPath("db/migration/V1__init.sql")).toBe("migration");
  });

  it("identifies config files", () => {
    expect(roleForPath("src/main/resources/application.yml")).toBe("configuration");
  });

  it("identifies build files", () => {
    expect(roleForPath("pom.xml")).toBe("build");
  });

  it("defaults to source", () => {
    expect(roleForPath("src/main/java/com/example/MyService.java")).toBe("source");
  });
});

describe("migrateFromSavedProject", () => {
  const baseGraph: Graph = {
    nodes: [
      { id: "node-1", type: "microservice", name: "User Service", x: 100, y: 100, config: { imported: false } },
      { id: "node-2", type: "sql_database", name: "PostgreSQL", x: 300, y: 200, config: { imported: false } },
      { id: "node-3", type: "client_api", name: "Payment Gateway", x: 500, y: 150, config: { imported: true } },
    ],
    edges: [
      { id: "edge-1", from: "node-1", to: "node-2", fromSide: "right", toSide: "left", label: "jdbc" },
      { id: "edge-2", from: "node-3", to: "node-1", fromSide: "right", toSide: "left", label: "https://payments" },
    ],
  };

  it("migrates a v1 project to v2 model", () => {
    const result = migrateFromSavedProject({
      version: 1,
      projectName: "arch-app",
      graph: baseGraph,
    });

    expect(result.model.version).toBe(MODEL_VERSION);
    expect(result.model.projectName).toBe("arch-app");
    expect(result.model.components).toHaveLength(3);
    expect(result.model.relationships).toHaveLength(2);
  });

  it("maps component kinds correctly", () => {
    const result = migrateFromSavedProject({
      version: 1,
      projectName: "app",
      graph: baseGraph,
    });

    expect(result.model.components[0].kind).toBe("service");
    expect(result.model.components[1].kind).toBe("database");
    expect(result.model.components[2].kind).toBe("gateway");
  });

  it("maps relationship protocols", () => {
    const result = migrateFromSavedProject({
      version: 1,
      projectName: "app",
      graph: baseGraph,
    });

    expect(result.model.relationships[0].protocol).toBe("jdbc");
    expect(result.model.relationships[1].protocol).toBe("http");
  });

  it("creates deployment unit for service components", () => {
    const result = migrateFromSavedProject({
      version: 1,
      projectName: "app",
      graph: baseGraph,
    });

    expect(result.model.deploymentUnits).toHaveLength(1);
    expect(result.model.deploymentUnits[0].name).toBe("app");
    expect(result.model.deploymentUnits[0].componentIds).toContain("node-1");
  });

  it("creates contracts for REST/gRPC relationships", () => {
    const result = migrateFromSavedProject({
      version: 1,
      projectName: "app",
      graph: baseGraph,
    });

    expect(result.model.contracts.length).toBeGreaterThan(0);
    expect(result.model.contracts[0].type).toBe("rest");
  });

  it("preserves stable IDs from node config", () => {
    const graph: Graph = {
      nodes: [
        { id: "node-a", type: "microservice", name: "Service", x: 0, y: 0, config: { stableId: "stable_service_my-service" } },
      ],
      edges: [],
    };

    const result = migrateFromSavedProject({ version: 1, projectName: "app", graph });
    expect(result.model.components[0].stableId).toBe("stable_service_my-service");
  });

  it("generates stable IDs when not provided", () => {
    const result = migrateFromSavedProject({
      version: 1,
      projectName: "app",
      graph: {
        nodes: [{ id: "n1", type: "microservice", name: "My Service", x: 0, y: 0 }],
        edges: [],
      },
    });
    expect(result.model.components[0].stableId).toBe("stable-service-my-service");
  });

  it("maps config and evidence", () => {
    const result = migrateFromSavedProject({
      version: 1,
      projectName: "app",
      graph: baseGraph,
    });

    const serviceComponent = result.model.components[0];
    expect(serviceComponent.evidence).toEqual([]);
    expect(serviceComponent.config).toBeDefined();
  });

  it("includes file content role classification", () => {
    const result = migrateFromSavedProject({
      version: 1,
      projectName: "app",
      graph: baseGraph,
      workspaceFiles: [
        { path: "src/main/java/com/example/UserService.java", content: "public class UserService {}" },
        { path: "src/test/java/com/example/UserServiceTest.java", content: "class UserServiceTest {}" },
      ],
    });

    const serviceComponent = result.model.components[0];
    const testFile = serviceComponent.sourceFiles.find(f => f.path.includes("Test"));
    expect(testFile).toBeDefined();
    expect(testFile?.role).toBe("test");
  });
});

describe("isArchitectureModel", () => {
  it("returns true for a valid model", () => {
    const model = createEmptyArchitectureModel("test");
    expect(isArchitectureModel(model)).toBe(true);
  });

  it("returns false for non-objects", () => {
    expect(isArchitectureModel(null)).toBe(false);
    expect(isArchitectureModel("string")).toBe(false);
    expect(isArchitectureModel(undefined)).toBe(false);
  });

  it("returns false for wrong version", () => {
    expect(isArchitectureModel({ version: 1, schemaVersion: 1, components: [], relationships: [] })).toBe(false);
  });

  it("returns false for missing arrays", () => {
    expect(isArchitectureModel({ version: 2, schemaVersion: 2, components: "not-array" })).toBe(false);
  });
});
