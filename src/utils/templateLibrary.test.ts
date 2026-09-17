import { beforeEach, describe, expect, it } from "vitest";
import { BUILTIN_TEMPLATES, listTemplates, normalizeTemplateName, removeTemplate, saveTemplate } from "./templateLibrary";

const GRAPH = { nodes: [], edges: [] };

const FILES = [
  { path: "src/main/java/App.java", content: "public class App {\n}\n" },
  { path: "pom.xml", content: "<project></project>" },
];

beforeEach(() => localStorage.clear());

describe("templateLibrary", () => {
  it("saves, lists and deletes templates", () => {
    saveTemplate("  Blogs service  ", GRAPH, FILES, { projectName: "blogs" });
    const templates = listTemplates().filter(template => !template.builtIn);
    expect(templates).toHaveLength(1);
    expect(templates[0].name).toBe("Blogs service");
    expect(templates[0].files).toEqual(FILES);

    removeTemplate(templates[0].id);
    expect(listTemplates().filter(template => !template.builtIn)).toHaveLength(0);
  });

  it("keeps only the newest 20 templates", () => {
    for (let index = 0; index < 25; index += 1) {
      saveTemplate(`template ${index}`, GRAPH, FILES);
    }
    const templates = listTemplates().filter(template => !template.builtIn);
    expect(templates).toHaveLength(20);
    expect(templates[0].name).toBe("template 24");
  });

  it("replaces an older template with the same name", () => {
    saveTemplate("Payments", GRAPH, FILES);
    saveTemplate("Payments", GRAPH, [{ path: "x.ts", content: "1" }]);
    const templates = listTemplates().filter(template => !template.builtIn);
    expect(templates).toHaveLength(1);
    expect(templates[0].files).toEqual([{ path: "x.ts", content: "1" }]);
  });

  it("falls back to a default name when blank", () => {
    saveTemplate("   ", GRAPH, FILES);
    const templates = listTemplates().filter(template => !template.builtIn);
    expect(templates[0].name).toBe("Untitled template");
    expect(normalizeTemplateName("this is a very long template name exceeding sixty characters limit!!")).toHaveLength(60);
  });

  it("always exposes the six protected starter templates", () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(6);
    removeTemplate(BUILTIN_TEMPLATES[0].id);
    expect(listTemplates().filter(template => template.builtIn)).toHaveLength(6);
  });
});
