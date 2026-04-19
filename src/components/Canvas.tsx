import React from "react";
import Node from "./Node";
import type { Graph, NodeData } from "../types";

interface Props {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  graph: Graph;
  camera: any;
  selectedIds: string[];
  selectedEdgeId: string | null;
  wire: any;
  onDrop: any;
  onDragOver: any;
  onNodePointerDown: any;
  onEdgePointerDown: (e: React.PointerEvent<SVGPathElement>, edgeId: string) => void;
  onCanvasPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onCanvasWheel: (e: React.WheelEvent<HTMLDivElement>) => void;
  onDelete: any;
  onRename: any;
  onConfigure: (id: string) => void;
  onViewCode: (id: string) => void;
  generatedNodeIds: Set<string>;
  startWire: any;
  moveWire: (clientX: number, clientY: number) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onResetCamera: () => void;
  onClearCanvas: () => void;
}

// Node dimensions — must match CSS
const W = 160;
const H = 80;

// Returns the world-space position of a given port on a node
function portPos(node: NodeData, side: "top" | "right" | "bottom" | "left") {
  switch (side) {
    case "top":    return { x: node.x + W / 2, y: node.y };
    case "bottom": return { x: node.x + W / 2, y: node.y + H };
    case "left":   return { x: node.x,         y: node.y + H / 2 };
    case "right":  return { x: node.x + W,     y: node.y + H / 2 };
  }
}

// Cubic bezier control-point offset for smooth curves
function bezier(ax: number, ay: number, bx: number, by: number, fromSide: string, toSide: string) {
  const dx = Math.abs(bx - ax);
  const dy = Math.abs(by - ay);
  const strength = Math.max(60, Math.max(dx, dy) * 0.5);

  const cp = (side: string, px: number, py: number) => {
    switch (side) {
      case "top":    return { cx: px,            cy: py - strength };
      case "bottom": return { cx: px,            cy: py + strength };
      case "left":   return { cx: px - strength, cy: py };
      case "right":  return { cx: px + strength, cy: py };
      default:       return { cx: px,            cy: py + strength };
    }
  };

  const c1 = cp(fromSide, ax, ay);
  const c2 = cp(toSide,   bx, by);
  return `M ${ax} ${ay} C ${c1.cx} ${c1.cy}, ${c2.cx} ${c2.cy}, ${bx} ${by}`;
}

export default function Canvas({
  canvasRef,
  graph,
  camera,
  selectedIds,
  selectedEdgeId,
  wire,
  onDrop,
  onDragOver,
  onNodePointerDown,
  onEdgePointerDown,
  onCanvasPointerDown,
  onCanvasWheel,
  onDelete,
  onRename,
  onConfigure,
  onViewCode,
  generatedNodeIds,
  startWire,
  moveWire,
  onZoomIn,
  onZoomOut,
  onResetCamera,
  onClearCanvas,
}: Props) {
  return (
    <div
      ref={canvasRef}
      className="canvas"
      onDrop={onDrop}
      onDragOver={onDragOver}
      onWheel={onCanvasWheel}
      onPointerMove={(e) => moveWire(e.clientX, e.clientY)}
      onPointerUp={() => { /* wire cancelled by onCanvasPointerDown or port pointerUp */ }}
      onPointerDown={onCanvasPointerDown}
    >
      <div className="canvasHud" onPointerDown={(e) => e.stopPropagation()}>
        <div className="cameraBadge">
          Zoom {Math.round(camera.scale * 100)}%
        </div>

        <div className="cameraControls">
          <button type="button" className="cameraButton" onClick={onZoomOut}>
            -
          </button>
          <button type="button" className="cameraButton" onClick={onZoomIn}>
            +
          </button>
          <button type="button" className="cameraButton reset" onClick={onResetCamera}>
            Reset
          </button>
          <button type="button" className="cameraButton clear" onClick={onClearCanvas}>
            Clear
          </button>
        </div>
      </div>

      <div
        className="grid"
        style={{
          transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`
        }}
      />

      <div
        className="world"
        style={{
          transform: `translate(${camera.x}px,${camera.y}px) scale(${camera.scale})`
        }}
      >
        <svg className="edges">
          <defs>
            <marker
              id="arrow"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="3"
              orient="auto"
              markerUnits="userSpaceOnUse"
            >
              <path d="M0,0 L0,6 L9,3 Z" fill="var(--accent)" />
            </marker>
          </defs>

          {/* COMMITTED EDGES */}
          {graph.edges.map(e => {
            const a = graph.nodes.find(n => n.id === e.from);
            const b = graph.nodes.find(n => n.id === e.to);
            if (!a || !b) return null;

            const A = portPos(a, e.fromSide);
            const B = portPos(b, e.toSide);
            const d = bezier(A.x, A.y, B.x, B.y, e.fromSide, e.toSide);

            return (
              <path
                key={e.id}
                d={d}
                className={`edge animated-edge ${selectedEdgeId === e.id ? "selected" : ""}`}
                markerEnd="url(#arrow)"
                onPointerDown={(event) => onEdgePointerDown(event, e.id)}
              />
            );
          })}

          {/* LIVE WIRE PREVIEW */}
          {wire && (() => {
            // straight cubic from port to mouse
            const d = bezier(wire.x1, wire.y1, wire.x2, wire.y2, wire.fromSide, "top");
            return (
              <path
                d={d}
                className="edge preview"
              />
            );
          })()}
        </svg>

        {/* NODES */}
        {graph.nodes.map(n => (
          <Node
            key={n.id}
            node={n}
            selected={selectedIds.includes(n.id)}
            hasCode={generatedNodeIds.has(n.id)}
            onPointerDown={onNodePointerDown}
            onDelete={onDelete}
            onRename={onRename}
            onConfigure={onConfigure}
            onViewCode={onViewCode}
            onStartWire={startWire}
          />
        ))}
      </div>
    </div>
  );
}
