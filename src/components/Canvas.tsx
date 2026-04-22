import React, { memo, useEffect, useMemo, useRef, useState } from "react";
import Node from "./Node";
import type { Graph, NodeData } from "../types";

interface Props {
  canvasRef: React.RefObject<HTMLDivElement | null>;
  graph: Graph;
  camera: any;
  selectedIds: string[];
  selectedEdgeId: string | null;
  wire: any;
  onDrop: (e: React.DragEvent<HTMLDivElement>) => void;
  onDragOver: (e: React.DragEvent<HTMLDivElement>) => void;
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
  nodeClassCounts?: Record<string, number>;
  expandedNodeIds?: Set<string>;
  onExpandClasses?: (id: string) => void;
}

// Node dimensions — must match CSS
const W = 160;
const H = 80;
const CULL_MARGIN = 360;
const LARGE_GRAPH_NODE_COUNT = 120;
const LARGE_GRAPH_EDGE_COUNT = 220;

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

const MemoNode = memo(Node);

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
  nodeClassCounts,
  expandedNodeIds,
  onExpandClasses,
}: Props) {
  const [isDropActive, setIsDropActive] = useState(false);
  const [viewport, setViewport] = useState({ width: 1200, height: 800 });
  const dragDepth = useRef(0);

  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;

    const update = () => {
      const rect = el.getBoundingClientRect();
      setViewport({ width: rect.width, height: rect.height });
    };

    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, [canvasRef]);

  // Attach wheel listener as non-passive so preventDefault() works (React 19 registers onWheel as passive)
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    const handler = (e: WheelEvent) => { e.preventDefault(); onCanvasWheel(e as any); };
    el.addEventListener("wheel", handler, { passive: false });
    return () => el.removeEventListener("wheel", handler);
  }, [canvasRef, onCanvasWheel]);

  const handleDragEnter = (event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    dragDepth.current += 1;
    setIsDropActive(true);
  };

  const handleDragLeave = () => {
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setIsDropActive(false);
  };

  const handleDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    onDragOver(event);
    setIsDropActive(true);
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    dragDepth.current = 0;
    setIsDropActive(false);
    onDrop(event);
  };

  const nodeById = useMemo(() => new Map(graph.nodes.map(node => [node.id, node])), [graph.nodes]);
  const visibleBounds = useMemo(() => {
    const scale = camera.scale || 1;
    return {
      left: (-camera.x / scale) - CULL_MARGIN,
      top: (-camera.y / scale) - CULL_MARGIN,
      right: ((viewport.width - camera.x) / scale) + CULL_MARGIN,
      bottom: ((viewport.height - camera.y) / scale) + CULL_MARGIN,
    };
  }, [camera.scale, camera.x, camera.y, viewport.height, viewport.width]);
  const visibleNodes = useMemo(() => graph.nodes.filter(node => (
    node.x + W >= visibleBounds.left &&
    node.x <= visibleBounds.right &&
    node.y + H >= visibleBounds.top &&
    node.y <= visibleBounds.bottom
  )), [graph.nodes, visibleBounds]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(node => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => graph.edges.filter(edge => (
    edge.id === selectedEdgeId ||
    (visibleNodeIds.has(edge.from) && visibleNodeIds.has(edge.to))
  )), [graph.edges, selectedEdgeId, visibleNodeIds]);
  const isLargeGraph = graph.nodes.length > LARGE_GRAPH_NODE_COUNT || graph.edges.length > LARGE_GRAPH_EDGE_COUNT;
  const hiddenNodeCount = graph.nodes.length - visibleNodes.length;

  return (
    <div
      ref={canvasRef}
      className={`canvas${isDropActive ? " canvas--drop-active" : ""}`}
      onDrop={handleDrop}
      onDragEnter={handleDragEnter}
      onDragLeave={handleDragLeave}
      onDragOver={handleDragOver}
      onPointerMove={(e) => moveWire(e.clientX, e.clientY)}
      onPointerUp={() => { /* wire cancelled by onCanvasPointerDown or port pointerUp */ }}
      onPointerDown={onCanvasPointerDown}
    >
      <div className="canvasHud" onPointerDown={(e) => e.stopPropagation()}>
        <div className="cameraBadge">
          Zoom {Math.round(camera.scale * 100)}%
        </div>
        {isLargeGraph && (
          <div className="cameraBadge cameraBadge--compact" title="Large graph optimization is active">
            {visibleNodes.length}/{graph.nodes.length} nodes
          </div>
        )}

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
          {visibleEdges.map(e => {
            const a = nodeById.get(e.from);
            const b = nodeById.get(e.to);
            if (!a || !b) return null;

            const A = portPos(a, e.fromSide);
            const B = portPos(b, e.toSide);
            const d = bezier(A.x, A.y, B.x, B.y, e.fromSide, e.toSide);

            return (
              <path
                key={e.id}
                d={d}
                className={`edge ${isLargeGraph ? "edge--large-graph" : "animated-edge"} ${selectedEdgeId === e.id ? "selected" : ""}`}
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
        {visibleNodes.map(n => (
          <MemoNode
            key={n.id}
            node={n}
            selected={selectedIds.includes(n.id)}
            hasCode={generatedNodeIds.has(n.id)}
            classCount={nodeClassCounts?.[n.id]}
            isExpanded={expandedNodeIds?.has(n.id)}
            onPointerDown={onNodePointerDown}
            onDelete={onDelete}
            onRename={onRename}
            onConfigure={onConfigure}
            onViewCode={onViewCode}
            onExpandClasses={onExpandClasses}
            onStartWire={startWire}
          />
        ))}
        {hiddenNodeCount > 0 && (
          <div
            className="canvas-cull-indicator"
            style={{
              transform: `translate(${visibleBounds.left + 24}px, ${visibleBounds.top + 24}px)`,
            }}
          >
            {hiddenNodeCount} off-screen
          </div>
        )}
      </div>
    </div>
  );
}
