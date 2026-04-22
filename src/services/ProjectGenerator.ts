import { AIService } from "./AIService";
import { ZipService } from "./ZipService";
import { cleanAIResponse } from "../utils/stringUtils";
import type { Graph, NodeData, Language } from "../types";
import { buildAIPrompt } from "../utils/promptBuilder";
import { GraphService } from "./GraphService";

type GenerateParams = {
  graph: Graph;
  language: Language; // ✅ FIXED (was string)
  framework: string;
  projectName: string;
  signal: AbortSignal;
};

export class ProjectGenerator {
  private ai: AIService;
  private zip: ZipService;
  private graphService: GraphService;

  constructor(ai: AIService, zip: ZipService, graphService: GraphService) {
    this.ai = ai;
    this.zip = zip;
    this.graphService = graphService;
  }

  async generateProject({
    graph,
    language,
    framework,
    projectName,
    signal,
  }: GenerateParams) {
    this.graphService.setGraph(graph);

    const nodes: NodeData[] = this.graphService.getNodes();

    const basePrompt = buildAIPrompt(graph, language, framework, projectName);

    const files: { path: string; content: string }[] = [];

    for (const node of nodes) {
      const nodePrompt = `
${basePrompt}

Generate ONLY the implementation for this component:
Component: ${node.name}
Type: ${node.type}
Language: ${language}

Return only code, no explanation.
      `.trim();

      const raw = await this.ai.call([{ role: "user", content: nodePrompt }], signal);

      files.push({
        path: this.getFilePath(node.name, language),
        content: cleanAIResponse(raw),
      });
    }

    await this.zip.download(files, projectName);
  }

  private getFilePath(name: string, language: Language): string {
    const extMap: Record<Language, string> = {
      javascript: "js",
      typescript: "ts",
      python: "py",
      java: "java",
      cpp: "cpp",
      csharp: "",
      go: "",
      ruby: "",
      php: "",
      kotlin: "",
      swift: ""
    };

    const ext = extMap[language] ?? "txt";
    return `src/${name}.${ext}`;
  }
}