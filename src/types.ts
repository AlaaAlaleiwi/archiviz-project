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
export type Language = "javascript" | "typescript" | "python" | "java" | "cpp";
