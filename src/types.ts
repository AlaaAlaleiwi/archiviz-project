export type NodeType = string;

export type NodeData = {

  id: string;

  type: NodeType;

  name: string;

  x: number;

  y: number;

  config?: Record<string, unknown>;

};

export type Edge = {

  id: string;

  from: string;

  to: string;

  fromSide: "top" | "right" | "bottom" | "left";

  toSide: "top" | "right" | "bottom" | "left";

  label?: string;

};

export type Graph = {

  nodes: NodeData[];

  edges: Edge[];

};

export type Camera = {

  x: number;

  y: number;

  scale: number;

};
export type Language = "typescript" | "javascript" | "python" | "java" | "csharp" | "cpp" | "go" | "ruby" | "php" | "kotlin" | "swift";

export type JavaVersion = "17" | "21" | "25";

export type SpringBootVersion = "3.2" | "3.3" | "3.4";

export type BuildTool = "maven" | "gradle";
