import type { Graph, Language, NodeData } from "../types";
import { getComponentTemplate, formatTemplateForPrompt } from "./componentTemplates";
import { getComponentConfig, formatConfigForPrompt } from "./componentConfigs";
import { getCodeScaffold, type ScaffoldContext } from "./codeScaffolds";

const FRONTEND_NODE_HINTS = [
  "frontend",
  "react",
  "angular",
  "vue",
  "page",
  "layout",
  "router",
  "navigation",
  "ui",
  "form",
  "table",
  "chart",
  "gallery",
  "modal",
  "dashboard",
  "profile",
  "hooks",
  "design_system",
];

function isFrontendNode(node: NodeData) {
  return FRONTEND_NODE_HINTS.some((hint) => node.type.includes(hint));
}

function formatList(items: string[]) {
  return items.length > 0 ? items.map((item) => `- ${item}`).join("\n") : "- None defined yet";
}

function buildNodeMap(graph: Graph) {
  return new Map(graph.nodes.map((node) => [node.id, node]));
}

function buildNodeRelationships(graph: Graph, node: NodeData) {
  const nodeMap = buildNodeMap(graph);

  const incoming = graph.edges
    .filter((edge) => edge.to === node.id)
    .map((edge) => {
      const from = nodeMap.get(edge.from);
      return `${from?.name ?? edge.from} -> ${node.name}`;
    });

  const outgoing = graph.edges
    .filter((edge) => edge.from === node.id)
    .map((edge) => {
      const to = nodeMap.get(edge.to);
      return `${node.name} -> ${to?.name ?? edge.to}`;
    });

  return {
    incoming: formatList(incoming),
    outgoing: formatList(outgoing),
  };
}

function buildArchitectureSummary(graph: Graph) {
  const nodeMap = buildNodeMap(graph);

  const components = graph.nodes.map((node) => `${node.name} (${node.type})`);
  const relationships = graph.edges.map((edge) => {
    const from = nodeMap.get(edge.from);
    const to = nodeMap.get(edge.to);
    return `${from?.name ?? edge.from} -> ${to?.name ?? edge.to}`;
  });

  return {
    components: formatList(components),
    relationships: formatList(relationships),
  };
}

export function sanitizeFileName(value: string) {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

  return cleaned || "component";
}

export function getGeneratedFilePath(language: Language, node: NodeData) {
  const safeName = sanitizeFileName(node.name);
  const frontendNode = isFrontendNode(node);

  switch (language) {
    case "javascript":
      return `src/${safeName}.${frontendNode ? "jsx" : "js"}`;
    case "typescript":
      return `src/${safeName}.${frontendNode ? "tsx" : "ts"}`;
    case "python":
      return `src/${safeName}.py`;
    case "java":
      return `src/${safeName}.java`;
    case "cpp":
      return `src/${safeName}.cpp`;
    default:
      return `src/${safeName}.txt`;
  }
}

export function buildAIPrompt(
  graph: Graph,
  language: Language,
  framework: string,
  projectName: string
) {
  const summary = buildArchitectureSummary(graph);

  return `
You are a principal software architect and senior ${language} engineer specializing in ${framework}.

Your task is to design a professional, production-ready application for the following project.

Project name:
${projectName}

Technology direction:
- Primary language: ${language}
- Main framework: ${framework}
- System style: modern production application with clean architecture and maintainable module boundaries

System components:
${summary.components}

System relationships:
${summary.relationships}

Architecture expectations:
- Respect the component boundaries shown above and keep responsibilities separated clearly.
- Use professional naming, modular structure, and implementation patterns that suit ${language} and ${framework}.
- Make sensible assumptions where details are missing, but keep them realistic for a production environment.
- Ensure the architecture is cohesive across frontend, backend, data, messaging, and infrastructure components when present.
- Follow SOLID principles
- Design for maintainability, readability, and scalability.
- When implementing components, include necessary structure, types, validation, error handling, and documentation.
- Reflect inter-component relationships through clean interfaces, service methods, API calls, or adapters as appropriate.
- Use environment-driven configuration patterns for any configurable aspects.
- Include security, observability, and resilience considerations where relevant.
- One class per file
- DTOs required (no entity exposure)
- Swagger (Springdoc)
- Flyway for database migrations
- Use naming: V1__create_<table>.sql

Production readiness requirements:
- Include configuration strategy, environment variable usage, and secrets handling expectations.
- Include input validation, error handling, and structured logging.
- Include authentication, authorization, and security best practices where relevant.
- Include observability concerns such as monitoring, tracing, and health checks where relevant.
- Include testability considerations, separation of concerns, and maintainable abstractions.
- Include deployment readiness, scalability, and performance-minded decisions.
- Avoid demo shortcuts, placeholder logic, and toy examples unless absolutely necessary.

Output quality bar:
- The result should feel like work prepared by an experienced engineer for a real team.
- Prefer robust, readable, and maintainable code over clever shortcuts.
- Generate implementation choices that are consistent with enterprise-grade production software.

Constraints:
- Use correct annotations
- Follow best practices
- Keep code clean and maintainable
- Avoid unnecessary complexity

`.trim();
}

export function buildNodeImplementationPrompt(
  graph: Graph,
  node: NodeData,
  language: Language,
  framework: string,
  projectName: string
) {
  const basePrompt = buildAIPrompt(graph, language, framework, projectName);
  const relationships = buildNodeRelationships(graph, node);
  const filePath = getGeneratedFilePath(language, node);
  const frontendNode = isFrontendNode(node);

  const scaffoldCtx: ScaffoldContext = {
    nodeName: node.name,
    nodeType: node.type,
    language,
    framework,
    config: (node.config as Record<string, unknown>) ?? {},
    projectName,
  };
  const scaffold = getCodeScaffold(scaffoldCtx);

  const configSchema = getComponentConfig(node.type);
  const configSection = configSchema && node.config && Object.keys(node.config).length > 0
    ? `\nUser-defined configuration (already applied to scaffold above — honour these choices):\n${formatConfigForPrompt(configSchema, node.config)}\n`
    : "";

  const template = getComponentTemplate(node.type);
  const contractSection = !scaffold && template
    ? `\nComponent contract:\n${formatTemplateForPrompt(template, language)}\n`
    : "";

  if (scaffold) {
    return `
${basePrompt}

Now complete one concrete component from the system.

Component:
- Name: ${node.name}
- Type: ${node.type}
- Layer: ${frontendNode ? "frontend/client" : "backend/service"}
- Target output file: ${filePath}

Direct incoming relationships:
${relationships.incoming}

Direct outgoing relationships:
${relationships.outgoing}
${configSection}
A pre-built scaffold has already been generated from the user's configuration choices.
Your job is ONLY to implement the sections marked // IMPLEMENT[n]: with real, production-quality business logic.
Do NOT rewrite boilerplate, imports, or structure — only fill in the marked sections.
Replace each // IMPLEMENT[n]: comment block with working code, then leave everything else exactly as-is.

Pre-built scaffold (complete ONLY the IMPLEMENT sections):
${scaffold}

Strict output rules:
- Output the completed scaffold as raw file contents — no markdown fences, no commentary.
- Each file starts with: === FILE: <full_path> ===
- Do not add or remove files beyond what the scaffold defines.
`.trim();
  }

  return `
${basePrompt}

Now implement one concrete component from the system.

Component to implement:
- Name: ${node.name}
- Type: ${node.type}
- Layer: ${frontendNode ? "frontend/client" : "backend/service"}
- Target output file: ${filePath}

Direct incoming relationships:
${relationships.incoming}
${configSection}

Direct outgoing relationships:
${relationships.outgoing}
${contractSection}
Implementation instructions:
- Generate a professional implementation for this specific component only.
- Make the component production-ready, not just syntactically correct.
- Include the right structure, imports, types, validation, error handling, and internal documentation where useful.
- If this component talks to other services or layers, reflect those responsibilities through interfaces, service methods, API calls, adapters, or placeholders that are realistic and clean.
- Use patterns idiomatic to ${language} and ${framework}.
- Keep the code maintainable, readable, and ready for integration into a larger application.
- If configuration is needed, reference environment-driven configuration patterns.
- If security, observability, or resilience concerns apply to this component, include them.
- Honor the component contract above — the generated file must expose the interface and environment variables listed there.
- Avoid demo shortcuts, placeholder logic, and toy examples unless absolutely necessary.

Strict output rules:
- Return only the raw contents of a single source file.
- Do not wrap the answer in markdown fences.
- Do not include explanations, bullet lists, or extra commentary.
- Do NOT include markdown
- Generate MULTIPLE FILES if needed
- Each file must start with:
  === FILE: <full_path> ===
`.trim();
}
