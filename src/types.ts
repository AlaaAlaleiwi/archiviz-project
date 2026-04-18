export type NodeType = "api" | "db" | "database" | "queue" | "auth";

export interface NodeData {
  id: string;
  type: NodeType;
  name: string;
  x: number;
  y: number;
}

export interface Edge {
  id: string;
  from: string;
  to: string;

  fromSide: "top" | "right" | "bottom" | "left";
  toSide: "top" | "right" | "bottom" | "left";
}

export interface Graph {
  nodes: NodeData[];
  edges: Edge[];
}

export type Camera = {

  x: number;

  y: number;

  scale: number;

};