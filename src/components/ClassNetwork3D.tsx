import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ClassNetwork, ClassNetworkNode } from "../utils/classNetwork";

type Props = {
  network: ClassNetwork;
  activeNodeId: string | null;
  selectedEdgeId: string | null;
  onSelectNode: (node: ClassNetworkNode) => void;
  onSelectEdge: (edgeId: string) => void;
  getRoleColor: (role: ClassNetworkNode["role"]) => string;
};

type LayoutType = "globe" | "torus" | "helix" | "galaxy" | "layers";

const LAYOUT_DEFS: { id: LayoutType; label: string; hint: string }[] = [
  { id: "globe",  label: "Globe",  hint: "Nodes mapped onto a sphere" },
  { id: "torus",  label: "Torus",  hint: "Nodes wrapped around a donut" },
  { id: "helix",  label: "Helix",  hint: "3-turn DNA-style spiral" },
  { id: "galaxy", label: "Galaxy", hint: "Flat 2-arm spiral disc" },
  { id: "layers", label: "Layers", hint: "Stacked architecture layers by class role" },
];

const BASE_R = 380;
const MIN_NODE_GAP = 118;

function roleRadius(role: ClassNetworkNode["role"]) {
  return roleGeometry(role).r;
}

function roleGeometry(role: string): { geo: THREE.BufferGeometry; r: number } {
  switch (role) {
    case "controller":  return { geo: new THREE.OctahedronGeometry(30),          r: 38 };
    case "middleware":  return { geo: new THREE.TorusGeometry(22, 7, 10, 24),     r: 36 };
    case "gateway":     return { geo: new THREE.TetrahedronGeometry(34),          r: 40 };
    case "service":     return { geo: new THREE.CylinderGeometry(20, 20, 42, 12), r: 34 };
    case "worker":      return { geo: new THREE.ConeGeometry(22, 46, 8),          r: 36 };
    case "queue":       return { geo: new THREE.CylinderGeometry(28, 28, 14, 16), r: 24 };
    case "repository":  return { geo: new THREE.BoxGeometry(46, 20, 46),          r: 26 };
    case "model":       return { geo: new THREE.SphereGeometry(24, 14, 12),       r: 32 };
    case "dto":         return { geo: new THREE.BoxGeometry(52, 12, 32),          r: 20 };
    case "config":      return { geo: new THREE.DodecahedronGeometry(26),         r: 34 };
    case "migration":   return { geo: new THREE.ConeGeometry(18, 38, 4),          r: 34 };
    case "test":        return { geo: new THREE.IcosahedronGeometry(26),          r: 34 };
    default:            return { geo: new THREE.BoxGeometry(32, 32, 32),          r: 32 };
  }
}

// Notched arrowhead — tip at +Y, matches setFromUnitVectors(Y, tangent)
function makeArrowHeadGeo(): THREE.BufferGeometry {
  const pts = [
    new THREE.Vector2(0,  18),
    new THREE.Vector2(15,  2),
    new THREE.Vector2(7,   2),
    new THREE.Vector2(7,  -12),
    new THREE.Vector2(0,  -12),
  ];
  return new THREE.LatheGeometry(pts, 8);
}

function colorValue(value: string) {
  return value.startsWith("var(") ? "#94a3b8" : value;
}

function shortLabel(value: string, max = 18) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
}

function layerIndex(role: ClassNetworkNode["role"]) {
  switch (role) {
    case "controller":
    case "middleware":
      return 0;
    case "gateway":
      return 1;
    case "service":
    case "worker":
    case "queue":
      return 2;
    case "repository":
    case "model":
      return 3;
    case "dto":
    case "config":
    case "migration":
    case "test":
    case "unknown":
    default:
      return 4;
  }
}

function makeLabel(text: string, color = "#e5e7eb", fontSize = 34) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext("2d")!;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(2, 6, 23, 0.86)";
  ctx.strokeText(text, canvas.width / 2, canvas.height / 2);
  ctx.fillStyle = color;
  ctx.fillText(text, canvas.width / 2, canvas.height / 2);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(136, 34, 1);
  return sprite;
}

function layoutPosition(node: ClassNetworkNode, layout: LayoutType): THREE.Vector3 {
  const s = node.x / 1040; // [0, 1]
  const t = node.y / 520;  // [0, 1]
  switch (layout) {
    case "globe": {
      const phi   = t * Math.PI;
      const theta = s * Math.PI * 2;
      return new THREE.Vector3(
        BASE_R * Math.sin(phi) * Math.cos(theta),
        BASE_R * Math.cos(phi),
        BASE_R * Math.sin(phi) * Math.sin(theta)
      );
    }
    case "torus": {
      const Rmaj = 280, Rmin = 130;
      const phi   = t * Math.PI * 2;
      const theta = s * Math.PI * 2;
      return new THREE.Vector3(
        (Rmaj + Rmin * Math.cos(phi)) * Math.cos(theta),
        Rmin * Math.sin(phi),
        (Rmaj + Rmin * Math.cos(phi)) * Math.sin(theta)
      );
    }
    case "helix": {
      const turns  = 3;
      const angle  = s * turns * Math.PI * 2 + t * 0.4;
      const radius = 260 + t * 90;
      const height = (s - 0.5) * 700;
      return new THREE.Vector3(
        radius * Math.cos(angle),
        height,
        radius * Math.sin(angle)
      );
    }
    case "galaxy": {
      const radius = 70 + s * 350;
      const angle  = t * Math.PI * 2 + s * Math.PI * 4; // 2 spiral arms
      const height = (t - 0.5) * 55 * (1 - s * 0.8);
      return new THREE.Vector3(
        radius * Math.cos(angle),
        height,
        radius * Math.sin(angle)
      );
    }
    case "layers":
      return new THREE.Vector3(0, 0, 0);
  }
}

function edgeMid(from: THREE.Vector3, to: THREE.Vector3): THREE.Vector3 {
  const mid  = from.clone().lerp(to, 0.5);
  const len  = mid.length();
  const dir  = len < 0.001 ? new THREE.Vector3(0, 1, 0) : mid.clone().normalize();
  const avgR = (from.length() + to.length()) * 0.5;
  return dir.multiplyScalar(avgR * 1.42);
}

function buildLayerPositions(nodes: ClassNetworkNode[]) {
  const layers = new Map<number, ClassNetworkNode[]>();
  for (const node of nodes) {
    const index = layerIndex(node.role);
    layers.set(index, [...(layers.get(index) ?? []), node]);
  }

  const positions = new Map<string, THREE.Vector3>();
  const layerXs = [-420, -210, 0, 210, 420];

  for (const [index, layerNodes] of layers) {
    const sorted = [...layerNodes].sort((a, b) => a.y - b.y || a.name.localeCompare(b.name));
    const gapY = sorted.length > 4 ? 110 : 136;
    const startY = -((sorted.length - 1) * gapY) / 2;

    sorted.forEach((node, order) => {
      const zig = (order % 2 === 0 ? -1 : 1) * (18 + (order % 3) * 10);
      positions.set(
        node.id,
        new THREE.Vector3(
          layerXs[index] ?? 420,
          startY + order * gapY,
          zig + (index - 2) * 28,
        ),
      );
    });
  }

  return positions;
}

function buildLayoutPositions(nodes: ClassNetworkNode[], layout: LayoutType) {
  const anchors = layout === "layers"
    ? buildLayerPositions(nodes)
    : new Map(nodes.map(node => [node.id, layoutPosition(node, layout)]));

  const anchored = nodes.map(node => ({
    id: node.id,
    anchor: anchors.get(node.id)!.clone(),
    radius: roleRadius(node.role),
  }));

  const positions = new Map(anchored.map(item => [item.id, item.anchor.clone()]));

  for (let step = 0; step < 80; step += 1) {
    const forces = new Map(anchored.map(item => [item.id, new THREE.Vector3()]));

    for (let i = 0; i < anchored.length; i += 1) {
      for (let j = i + 1; j < anchored.length; j += 1) {
        const left = anchored[i];
        const right = anchored[j];
        const leftPos = positions.get(left.id)!;
        const rightPos = positions.get(right.id)!;
        const delta = rightPos.clone().sub(leftPos);
        let distance = delta.length();

        if (distance < 0.001) {
          delta.set(((i % 3) - 1) || 0.35, ((j % 3) - 1) || -0.45, 0.25).normalize();
          distance = 0.001;
        }

        const minimumDistance = Math.max(MIN_NODE_GAP, left.radius + right.radius + 42);
        if (distance >= minimumDistance) continue;

        const push = delta.normalize().multiplyScalar((minimumDistance - distance) * 0.18);
        forces.get(left.id)!.addScaledVector(push, -1);
        forces.get(right.id)!.add(push);
      }
    }

    for (const item of anchored) {
      const pos = positions.get(item.id)!;
      const force = forces.get(item.id)!;
      const spring = item.anchor.clone().sub(pos).multiplyScalar(0.12);
      pos.add(force.add(spring).clampLength(0, 18));
    }
  }

  return positions;
}

export default function ClassNetwork3D({
  network,
  activeNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  getRoleColor,
}: Props) {
  const hostRef            = useRef<HTMLDivElement>(null);
  const activeNodeIdRef    = useRef(activeNodeId);
  const selectedEdgeIdRef  = useRef(selectedEdgeId);
  const onSelectNodeRef    = useRef(onSelectNode);
  const onSelectEdgeRef    = useRef(onSelectEdge);
  const [layout, setLayout] = useState<LayoutType>("globe");
  const layoutRef           = useRef<LayoutType>("globe");

  useEffect(() => {
    activeNodeIdRef.current   = activeNodeId;
    selectedEdgeIdRef.current = selectedEdgeId;
    onSelectNodeRef.current   = onSelectNode;
    onSelectEdgeRef.current   = onSelectEdge;
  }, [activeNodeId, onSelectEdge, onSelectNode, selectedEdgeId]);

  useEffect(() => { layoutRef.current = layout; }, [layout]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020617, 0.00042);

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 3200);
    camera.position.set(0, 180, 980);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping    = true;
    controls.dampingFactor    = 0.08;
    controls.target.set(0, 0, 0);
    controls.minDistance      = 480;
    controls.maxDistance      = 1800;
    controls.autoRotate       = true;
    controls.autoRotateSpeed  = 0.4;

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const keyLight = new THREE.DirectionalLight(0x9bdcff, 1.2);
    keyLight.position.set(240, 420, 360);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.5);
    fillLight.position.set(-320, 180, -260);
    scene.add(fillLight);
    const rimLight = new THREE.DirectionalLight(0x4466ff, 0.35);
    rimLight.position.set(0, -400, -300);
    scene.add(rimLight);

    // ── Layout guide shapes ───────────────────────────────────────────────────
    const wireMatOpts = { color: 0x1e3a5f, wireframe: true, transparent: true, opacity: 0.2 };

    const globeShell = new THREE.Mesh(
      new THREE.SphereGeometry(BASE_R, 64, 64),
      new THREE.MeshStandardMaterial({ color: 0x0d2040, transparent: true, opacity: 0.13, roughness: 0.9, metalness: 0.1, side: THREE.BackSide })
    );
    const globeWire = new THREE.Mesh(new THREE.SphereGeometry(BASE_R * 1.005, 24, 16), new THREE.MeshBasicMaterial({ ...wireMatOpts }));

    const torusWire = new THREE.Mesh(new THREE.TorusGeometry(280, 130, 16, 48), new THREE.MeshBasicMaterial({ ...wireMatOpts }));

    const helixWire = new THREE.Mesh(
      new THREE.CylinderGeometry(310, 310, 720, 32, 1, true),
      new THREE.MeshBasicMaterial({ ...wireMatOpts, side: THREE.DoubleSide })
    );

    const galaxyDisc = new THREE.Mesh(
      new THREE.RingGeometry(70, 420, 64, 3),
      new THREE.MeshBasicMaterial({ ...wireMatOpts, side: THREE.DoubleSide })
    );
    galaxyDisc.rotation.x = Math.PI / 2;

    const layersGuide = new THREE.Group();
    const layerMaterial = new THREE.MeshBasicMaterial({ color: 0x10243f, transparent: true, opacity: 0.16, side: THREE.DoubleSide });
    const dividerMaterial = new THREE.LineBasicMaterial({ color: 0x1e3a5f, transparent: true, opacity: 0.34 });
    const layerXs = [-420, -210, 0, 210, 420];
    for (const x of layerXs) {
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(150, 700), layerMaterial.clone());
      panel.position.set(x, 0, (x / 420) * 28);
      layersGuide.add(panel);

      const lineGeometry = new THREE.BufferGeometry().setFromPoints([
        new THREE.Vector3(x, -330, (x / 420) * 28 + 2),
        new THREE.Vector3(x, 330, (x / 420) * 28 + 2),
      ]);
      layersGuide.add(new THREE.Line(lineGeometry, dividerMaterial.clone()));
    }

    const guideMap = new Map<LayoutType, THREE.Object3D[]>([
      ["globe",  [globeShell, globeWire]],
      ["torus",  [torusWire]],
      ["helix",  [helixWire]],
      ["galaxy", [galaxyDisc]],
      ["layers", [layersGuide]],
    ]);
    for (const [lid, objs] of guideMap) {
      for (const o of objs) { o.visible = lid === "globe"; scene.add(o); }
    }

    // ── Scene data structures ─────────────────────────────────────────────────
    const raycaster  = new THREE.Raycaster();
    const pointer    = new THREE.Vector2();
    const selectables: THREE.Object3D[] = [];
    const nodeMeshes: Array<{ id: string; mesh: THREE.Mesh; outline: THREE.LineSegments; base: THREE.Color }> = [];
    const labelObjects: Array<{ nodeId: string; object: THREE.Object3D; offset: THREE.Vector3; sign: 1 | -1 }> = [];
    const edgeObjects: Array<{
      id: string; from: string; to: string;
      tube: THREE.Mesh; arrow: THREE.Mesh; bead: THREE.Mesh;
      base: THREE.Color; curve: THREE.QuadraticBezierCurve3;
    }> = [];

    const selectedColor     = new THREE.Color(0x00d4ff);
    const activeEdgeColor   = new THREE.Color(0x7dd3fc);
    const activeNodeEmissive = new THREE.Color(0x006b88);
    const noEmissive        = new THREE.Color(0x000000);
    const dimmedColor       = new THREE.Color(0x1e293b);

    const nodeById    = new Map(network.nodes.map(n => [n.id, n]));
    const initialPositions = buildLayoutPositions(network.nodes, "globe");
    const positionById = new Map(Array.from(initialPositions.entries()).map(([id, pos]) => [id, pos.clone()]));
    const meshById    = new Map<string, THREE.Mesh>();
    const dragPlane   = new THREE.Plane();
    const dragPoint   = new THREE.Vector3();
    const dragOffset  = new THREE.Vector3();
    const dragState   = { id: null as string | null, moved: false, startX: 0, startY: 0 };

    // ── Build nodes ───────────────────────────────────────────────────────────
    for (const node of network.nodes) {
      const color   = colorValue(getRoleColor(node.role));
      const base    = new THREE.Color(color);
      const pos     = initialPositions.get(node.id)?.clone() ?? layoutPosition(node, "globe");
      const radial  = pos.clone().normalize();
      const { geo, r } = roleGeometry(node.role);

      const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({
        color, roughness: 0.42, metalness: 0.18,
        emissive: color, emissiveIntensity: 0.1,
      }));
      mesh.position.copy(pos);
      mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial);
      mesh.userData = { kind: "node", id: node.id };
      selectables.push(mesh);
      scene.add(mesh);
      meshById.set(node.id, mesh);

      const outlineLine = new THREE.LineSegments(
        new THREE.EdgesGeometry(geo, 15),
        new THREE.LineBasicMaterial({ color: 0xb0bec5, transparent: true, opacity: 0.5 })
      );
      outlineLine.position.copy(pos);
      outlineLine.quaternion.copy(mesh.quaternion);
      scene.add(outlineLine);
      nodeMeshes.push({ id: node.id, mesh, outline: outlineLine, base });

      const nameLabel  = makeLabel(shortLabel(node.name), "#f8fafc", 32);
      const nameOffset = radial.clone().multiplyScalar(r + 22);
      nameLabel.position.copy(pos).add(nameOffset);
      scene.add(nameLabel);
      labelObjects.push({ nodeId: node.id, object: nameLabel, offset: nameOffset, sign: 1 });

      const roleLabel  = makeLabel(node.role.toUpperCase(), colorValue(getRoleColor(node.role)), 24);
      roleLabel.scale.set(104, 26, 1);
      const roleOffset = radial.clone().multiplyScalar(-(r + 18));
      roleLabel.position.copy(pos).add(roleOffset);
      scene.add(roleLabel);
      labelObjects.push({ nodeId: node.id, object: roleLabel, offset: roleOffset, sign: -1 });
    }

    // ── Edge helpers ──────────────────────────────────────────────────────────
    const updateEdgeGeometry = (edge: typeof edgeObjects[number]) => {
      const from = positionById.get(edge.from);
      const to   = positionById.get(edge.to);
      if (!from || !to) return;
      const mid   = edgeMid(from, to);
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      edge.curve = curve;
      edge.tube.geometry.dispose();
      edge.tube.geometry = new THREE.TubeGeometry(curve, 56, 2.4, 12, false);
      const tangent = curve.getTangent(0.92).normalize();
      edge.arrow.position.copy(curve.getPoint(0.92));
      edge.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      edge.bead.position.copy(curve.getPoint(0.5));
    };

    // ── Build edges ───────────────────────────────────────────────────────────
    for (const edge of network.edges) {
      const from = positionById.get(edge.from);
      const to   = positionById.get(edge.to);
      if (!from || !to) continue;

      const mid      = edgeMid(from, to);
      const curve    = new THREE.QuadraticBezierCurve3(from, mid, to);
      const edgeBase = new THREE.Color(0x6b7f9b);

      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 56, 2.4, 12, false),
        new THREE.MeshStandardMaterial({ color: edgeBase, roughness: 0.42, metalness: 0.08, transparent: true, opacity: 0.5 })
      );
      scene.add(tube);

      const tangent = curve.getTangent(0.92).normalize();
      const arrow   = new THREE.Mesh(
        makeArrowHeadGeo(),
        new THREE.MeshStandardMaterial({ color: edgeBase, roughness: 0.28, metalness: 0.22 })
      );
      arrow.position.copy(curve.getPoint(0.92));
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      scene.add(arrow);

      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(8, 20, 20),
        new THREE.MeshStandardMaterial({ color: 0x64748b, emissive: 0x000000, emissiveIntensity: 0 })
      );
      bead.position.copy(curve.getPoint(0.5));
      bead.userData = { kind: "edge", id: edge.id };
      selectables.push(bead);
      scene.add(bead);
      edgeObjects.push({ id: edge.id, from: edge.from, to: edge.to, tube, arrow, bead, base: edgeBase, curve });
    }

    // ── moveNode ──────────────────────────────────────────────────────────────
    const moveNode = (id: string, nextPos: THREE.Vector3) => {
      const mesh     = meshById.get(id);
      const nodeItem = nodeMeshes.find(item => item.id === id);
      if (!mesh || !nodeItem) return;

      const radial = nextPos.clone().normalize();
      const q      = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), radial);

      mesh.position.copy(nextPos);
      mesh.quaternion.copy(q);
      nodeItem.outline.position.copy(nextPos);
      nodeItem.outline.quaternion.copy(q);
      positionById.set(id, nextPos.clone());

      for (const label of labelObjects) {
        if (label.nodeId !== id) continue;
        const mag       = label.offset.length();
        const newOffset = radial.clone().multiplyScalar(label.sign * mag);
        label.offset.copy(newOffset);
        label.object.position.copy(nextPos).add(newOffset);
      }

      for (const edge of edgeObjects) {
        if (edge.from === id || edge.to === id) updateEdgeGeometry(edge);
      }
    };

    // ── Highlight / dim ───────────────────────────────────────────────────────
    const applyHighlight = () => {
      const activeId = activeNodeIdRef.current;
      const edgeId   = selectedEdgeIdRef.current;
      const hasFocus = activeId !== null;

      const connectedNodes = new Set<string>();
      const connectedEdges = new Set<string>();
      if (activeId) {
        connectedNodes.add(activeId);
        for (const edge of edgeObjects) {
          if (edge.from === activeId || edge.to === activeId) {
            connectedNodes.add(edge.from);
            connectedNodes.add(edge.to);
            connectedEdges.add(edge.id);
          }
        }
      }

      for (const item of nodeMeshes) {
        const active  = item.id === activeId;
        const dimmed  = hasFocus && !connectedNodes.has(item.id);
        const mat     = item.mesh.material as THREE.MeshStandardMaterial;
        mat.transparent      = true;
        mat.color.copy(active ? selectedColor : dimmed ? dimmedColor : item.base);
        mat.emissive.copy(active ? activeNodeEmissive : dimmed ? noEmissive : item.base);
        mat.emissiveIntensity = active ? 0.95 : dimmed ? 0 : 0.08;
        mat.opacity           = dimmed ? 0.1 : 1;
        item.mesh.scale.setScalar(active ? 1.08 : 1);

        const outMat = item.outline.material as THREE.LineBasicMaterial;
        outMat.color.set(active ? 0xffffff : dimmed ? 0x1e293b : 0x9ca3af);
        outMat.opacity = active ? 0.95 : dimmed ? 0.08 : 0.55;
      }

      for (const label of labelObjects) {
        const dimmed = hasFocus && !connectedNodes.has(label.nodeId);
        ((label.object as THREE.Sprite).material as THREE.SpriteMaterial).opacity = dimmed ? 0.07 : 1;
      }

      for (const edge of edgeObjects) {
        const active   = edge.id === edgeId || edge.from === activeId || edge.to === activeId;
        const selected = edge.id === edgeId;
        const dimmed   = hasFocus && !connectedEdges.has(edge.id);
        const color    = selected ? selectedColor : active ? activeEdgeColor : dimmed ? dimmedColor : edge.base;

        for (const obj of [edge.tube, edge.arrow, edge.bead]) {
          const mat      = obj.material as THREE.MeshStandardMaterial;
          mat.transparent = true;
          mat.color.copy(color);
          mat.opacity          = selected ? 1 : active ? 0.9 : dimmed ? 0.05 : 0.5;
          mat.emissive.copy(selected ? activeNodeEmissive : noEmissive);
          mat.emissiveIntensity = selected ? 0.9 : 0;
        }
        edge.bead.scale.setScalar(selected ? 1.45 : active ? 1.2 : 1);
        edge.tube.scale.setScalar(selected ? 1.18 : 1);
      }
    };

    // ── Resize ────────────────────────────────────────────────────────────────
    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      const w = Math.max(1, width), h = Math.max(1, height);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    // ── Pointer events ────────────────────────────────────────────────────────
    const updatePointerRay = (e: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((e.clientX - rect.left) / rect.width)  *  2 - 1;
      pointer.y = ((e.clientY - rect.top)  / rect.height) * -2 + 1;
      raycaster.setFromCamera(pointer, camera);
    };

    const handlePointerDown = (e: PointerEvent) => {
      updatePointerRay(e);
      const hit  = raycaster.intersectObjects(selectables, false)[0]?.object;
      if (!hit) return;
      const kind = hit.userData.kind as string | undefined;
      const id   = hit.userData.id   as string | undefined;

      if (kind === "node" && id) {
        const mesh = meshById.get(id);
        if (!mesh) return;
        dragPlane.setFromNormalAndCoplanarPoint(mesh.position.clone().normalize(), mesh.position);
        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
          dragState.id = id; dragState.moved = false;
          dragState.startX = e.clientX; dragState.startY = e.clientY;
          dragOffset.copy(mesh.position).sub(dragPoint);
          controls.enabled = false; controls.autoRotate = false;
          renderer.domElement.style.cursor = "grabbing";
          renderer.domElement.setPointerCapture(e.pointerId);
          e.preventDefault();
        }
      }
      if (kind === "edge" && id) onSelectEdgeRef.current(id);
    };

    const handlePointerMove = (e: PointerEvent) => {
      if (!dragState.id) return;
      updatePointerRay(e);
      if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;
      const dx = e.clientX - dragState.startX, dy = e.clientY - dragState.startY;
      if (dx * dx + dy * dy > 9) dragState.moved = true;
      moveNode(dragState.id, dragPoint.clone().add(dragOffset));
      e.preventDefault();
    };

    const finishPointerDrag = (e: PointerEvent) => {
      if (!dragState.id) return;
      const id = dragState.id, didMove = dragState.moved;
      dragState.id = null; dragState.moved = false;
      controls.enabled = true; controls.autoRotate = true;
      renderer.domElement.style.cursor = "";
      if (renderer.domElement.hasPointerCapture(e.pointerId))
        renderer.domElement.releasePointerCapture(e.pointerId);
      if (!didMove) { const node = nodeById.get(id); if (node) onSelectNodeRef.current(node); }
    };

    renderer.domElement.addEventListener("pointerdown",   handlePointerDown);
    renderer.domElement.addEventListener("pointermove",   handlePointerMove);
    renderer.domElement.addEventListener("pointerup",     finishPointerDrag);
    renderer.domElement.addEventListener("pointercancel", finishPointerDrag);

    // ── Layout transition state ───────────────────────────────────────────────
    const currentPos = new Map(Array.from(initialPositions.entries()).map(([id, pos]) => [id, pos.clone()]));
    const targetPos  = new Map(Array.from(initialPositions.entries()).map(([id, pos]) => [id, pos.clone()]));
    let prevLayout: LayoutType = "globe";

    // ── Animation loop ────────────────────────────────────────────────────────
    let frameId = 0;
    const animate = () => {
      const wantedLayout = layoutRef.current;

      if (wantedLayout !== prevLayout) {
        prevLayout = wantedLayout;
        const nextLayoutPositions = buildLayoutPositions(network.nodes, wantedLayout);
        for (const [id, pos] of nextLayoutPositions) targetPos.set(id, pos.clone());
        for (const [lid, objs] of guideMap) for (const o of objs) o.visible = lid === wantedLayout;
      }

      for (const node of network.nodes) {
        const cur = currentPos.get(node.id)!;
        const tgt = targetPos.get(node.id)!;
        if (cur.distanceTo(tgt) > 0.5) {
          cur.lerp(tgt, 0.055);
          moveNode(node.id, cur.clone());
        }
      }

      applyHighlight();
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    // ── Cleanup ───────────────────────────────────────────────────────────────
    return () => {
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener("pointerdown",   handlePointerDown);
      renderer.domElement.removeEventListener("pointermove",   handlePointerMove);
      renderer.domElement.removeEventListener("pointerup",     finishPointerDrag);
      renderer.domElement.removeEventListener("pointercancel", finishPointerDrag);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse(object => {
        const m = object as THREE.Mesh;
        (m.geometry as THREE.BufferGeometry | undefined)?.dispose();
        const mat = m.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach(x => x.dispose()); else mat?.dispose();
      });
      host.removeChild(renderer.domElement);
    };
  }, [getRoleColor, network]);

  return (
    <div className="nim-network-3d">
      <div ref={hostRef} style={{ position: "absolute", inset: 0 }} />
      <div
        style={{
          position: "absolute", top: 10, right: 10,
          display: "flex", gap: 5, zIndex: 10,
        }}
      >
        {LAYOUT_DEFS.map(def => (
          <button
            key={def.id}
            title={def.hint}
            onClick={() => setLayout(def.id)}
            style={{
              padding: "4px 11px",
              background: layout === def.id ? "#0ea5e9" : "rgba(2,6,23,0.78)",
              color:      layout === def.id ? "#fff"    : "#94a3b8",
              border:     `1px solid ${layout === def.id ? "#0ea5e9" : "#1e3a5f"}`,
              borderRadius: 6,
              fontSize: 11,
              fontWeight: 600,
              cursor: "pointer",
              backdropFilter: "blur(8px)",
              letterSpacing: "0.04em",
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
              transition: "background 0.15s, color 0.15s, border-color 0.15s",
            }}
          >
            {def.label}
          </button>
        ))}
      </div>
    </div>
  );
}
