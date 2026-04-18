import type { Graph, NodeData, Edge } from "../types";

export class GraphService {
  private graph: Graph;

  constructor(graph: Graph) {
    this.graph = graph;
  }

  setGraph(graph: Graph) {
    this.graph = graph;
  }

  getNodes(): NodeData[] {
    return this.graph.nodes;
  }

  getEdges(): Edge[] {
    return this.graph.edges;
  }

  private buildNodeMap(): Map<string, NodeData> {
    return new Map(this.graph.nodes.map(n => [n.id, n]));
  }

  formatNodes(): string {
    return this.graph.nodes.map(n => `- ${n.name} (${n.type})`).join("\n");
  }

  formatEdges(): string {
    const map = this.buildNodeMap();

    return this.graph.edges.map(e => {
      const from = map.get(e.from);
      const to = map.get(e.to);

      return `- ${from?.name ?? e.from} → ${to?.name ?? e.to}`;
    }).join("\n");
  }
}