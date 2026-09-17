import { useEffect, useRef } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Graph, NodeData } from "../types";

type Props = {
  graph: Graph;
  selectedIds: string[];
  selectedEdgeId: string | null;
};

const ROLE_COLORS = [
  "#60a5fa",
  "#34d399",
  "#f59e0b",
  "#a78bfa",
  "#f97316",
  "#06b6d4",
  "#ec4899",
  "#94a3b8",
];

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  return Math.abs(hash);
}

function nodeColor(node: NodeData) {
  return ROLE_COLORS[hashString(node.type || node.name) % ROLE_COLORS.length];
}

function nodeGeometry(node: NodeData) {
  const type = node.type.toLowerCase();
  if (type.includes("database") || type.includes("cache")) {
    return new THREE.CylinderGeometry(42, 42, 58, 24);
  }
  if (type.includes("gateway") || type.includes("proxy") || type.includes("api")) {
    return new THREE.IcosahedronGeometry(38, 0);
  }
  if (type.includes("queue") || type.includes("broker") || type.includes("event")) {
    return new THREE.TorusKnotGeometry(24, 8, 96, 12);
  }
  if (type.includes("worker") || type.includes("scheduler")) {
    return new THREE.ConeGeometry(34, 62, 8);
  }
  if (type.includes("frontend") || type.includes("page") || type.includes("ui")) {
    return new THREE.CapsuleGeometry(24, 88, 8, 18);
  }
  if (type.includes("service") || type.includes("microservice")) {
    return new THREE.CapsuleGeometry(28, 76, 10, 20);
  }
  if (type.includes("module") || type.includes("component")) {
    return new THREE.TetrahedronGeometry(42);
  }
  return new THREE.DodecahedronGeometry(36);
}

function nodeAccentGeometry(node: NodeData) {
  const type = node.type.toLowerCase();
  if (type.includes("database") || type.includes("cache")) {
    return new THREE.TorusGeometry(34, 4, 12, 32);
  }
  if (type.includes("gateway") || type.includes("api")) {
    return new THREE.TorusGeometry(36, 4, 12, 32);
  }
  if (type.includes("frontend") || type.includes("page") || type.includes("ui")) {
    return new THREE.RingGeometry(30, 44, 28);
  }
  return new THREE.RingGeometry(34, 42, 28);
}

function nodeRotation(node: NodeData) {
  const type = node.type.toLowerCase();
  if (type.includes("service") || type.includes("microservice")) {
    return new THREE.Euler(Math.PI / 2, Math.PI / 4, 0);
  }
  if (type.includes("frontend") || type.includes("page") || type.includes("ui")) {
    return new THREE.Euler(Math.PI / 2, 0, Math.PI / 2.8);
  }
  if (type.includes("gateway") || type.includes("proxy") || type.includes("api")) {
    return new THREE.Euler(0.45, 0.6, 0);
  }
  if (type.includes("worker") || type.includes("scheduler")) {
    return new THREE.Euler(0, 0, Math.PI);
  }
  return new THREE.Euler(0.12, 0.4, 0);
}

function wrapLabelLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const words = text.split(/[\s_-]+/).filter(Boolean);
  if (words.length === 0) return [text];

  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth || !current) {
      current = next;
      continue;
    }
    lines.push(current);
    current = word;
  }
  if (current) lines.push(current);
  return lines;
}

function makeLabel(text: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 768;
  canvas.height = 192;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  let fontSize = 30;
  ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
  let lines = wrapLabelLines(ctx, text, 680);
  if (lines.length > 3) {
    fontSize = 24;
    ctx.font = `700 ${fontSize}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    lines = wrapLabelLines(ctx, text, 680);
  }
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineWidth = 8;
  ctx.strokeStyle = "rgba(2, 6, 23, 0.86)";
  ctx.fillStyle = "#f8fafc";
  const lineHeight = fontSize + 8;
  const totalHeight = (lines.length - 1) * lineHeight;
  lines.forEach((line, index) => {
    const y = canvas.height / 2 - totalHeight / 2 + index * lineHeight;
    ctx.strokeText(line, canvas.width / 2, y);
    ctx.fillText(line, canvas.width / 2, y);
  });

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  }));
  sprite.scale.set(220, 56, 1);
  return sprite;
}

function makeBadge(text: string, color: string) {
  const canvas = document.createElement("canvas");
  canvas.width = 320;
  canvas.height = 88;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "rgba(2, 6, 23, 0.88)";
  ctx.strokeStyle = color;
  ctx.lineWidth = 3;

  const x = 24;
  const y = 18;
  const width = 272;
  const height = 52;
  const radius = 20;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.font = "700 24px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillStyle = color;
  ctx.fillText(text.toUpperCase(), canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texture,
    transparent: true,
    depthWrite: false,
  }));
  sprite.scale.set(88, 24, 1);
  return sprite;
}

export default function Canvas3D({ graph, selectedIds, selectedEdgeId }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x020617, 0.00052);

    const camera = new THREE.PerspectiveCamera(48, 1, 1, 5000);
    camera.position.set(0, 540, 1180);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.minDistance = 360;
    controls.maxDistance = 2600;
    controls.target.set(0, 60, 0);

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const key = new THREE.DirectionalLight(0x9bdcff, 1.15);
    key.position.set(380, 620, 300);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xffffff, 0.42);
    fill.position.set(-320, 240, -260);
    scene.add(fill);

    const grid = new THREE.GridHelper(2200, 24, 0x1e3a5f, 0x0f2744);
    grid.position.y = -120;
    scene.add(grid);

    const nodesGroup = new THREE.Group();
    const edgesGroup = new THREE.Group();
    scene.add(edgesGroup);
    scene.add(nodesGroup);

    const sortedNodes = [...graph.nodes].sort((a, b) => a.x - b.x || a.y - b.y);
    const xs = sortedNodes.map(node => node.x);
    const ys = sortedNodes.map(node => node.y);
    const centerX = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const centerY = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
    const typeLevels = new Map<string, number>();

    const nodePositions = new Map<string, THREE.Vector3>();

    for (const node of sortedNodes) {
      if (!typeLevels.has(node.type)) typeLevels.set(node.type, typeLevels.size);
      const level = typeLevels.get(node.type) ?? 0;
      const position = new THREE.Vector3(
        (node.x - centerX) * 1.15,
        level * 90,
        (node.y - centerY) * 1.08,
      );
      nodePositions.set(node.id, position);

      const selected = selectedIds.includes(node.id);
      const color = new THREE.Color(selected ? "#22d3ee" : nodeColor(node));
      const glowColor = color.clone().multiplyScalar(1.12);
      const geometry = nodeGeometry(node);
      const rotation = nodeRotation(node);
      const body = new THREE.Mesh(
        geometry,
        new THREE.MeshPhysicalMaterial({
          color,
          roughness: 0.32,
          metalness: 0.2,
          clearcoat: 0.42,
          clearcoatRoughness: 0.3,
          emissive: selected ? glowColor.clone().multiplyScalar(0.36) : color.clone().multiplyScalar(0.08),
          emissiveIntensity: selected ? 1 : 0.34,
        }),
      );
      body.position.copy(position);
      body.rotation.copy(rotation);
      body.castShadow = false;
      body.receiveShadow = false;
      nodesGroup.add(body);

      const accentGeometry = nodeAccentGeometry(node);
      const accent = new THREE.Mesh(
        accentGeometry,
        new THREE.MeshBasicMaterial({
          color: glowColor,
          transparent: true,
          opacity: selected ? 0.34 : 0.18,
          side: THREE.DoubleSide,
        }),
      );
      accent.position.copy(position).add(new THREE.Vector3(0, 0, 0));
      if (accent.geometry instanceof THREE.RingGeometry || accent.geometry instanceof THREE.TorusGeometry) {
        accent.rotation.x = Math.PI / 2;
      }
      nodesGroup.add(accent);

      const pedestal = new THREE.Mesh(
        new THREE.CylinderGeometry(56, 64, 10, 28),
        new THREE.MeshStandardMaterial({
          color: 0x08111f,
          roughness: 0.72,
          metalness: 0.08,
          transparent: true,
          opacity: 0.9,
        }),
      );
      pedestal.position.copy(position).add(new THREE.Vector3(0, -46, 0));
      nodesGroup.add(pedestal);

      const halo = new THREE.Mesh(
        new THREE.RingGeometry(48, 70, 40),
        new THREE.MeshBasicMaterial({
          color: glowColor,
          transparent: true,
          opacity: selected ? 0.28 : 0.12,
          side: THREE.DoubleSide,
        }),
      );
      halo.position.copy(position).add(new THREE.Vector3(0, -40, 0));
      halo.rotation.x = Math.PI / 2;
      nodesGroup.add(halo);

      const outline = new THREE.LineSegments(
        new THREE.EdgesGeometry(geometry, 20),
        new THREE.LineBasicMaterial({ color: 0xe2e8f0, transparent: true, opacity: selected ? 0.85 : 0.46 }),
      );
      outline.position.copy(position);
      outline.rotation.copy(rotation);
      nodesGroup.add(outline);

      const label = makeLabel(node.name);
      if (label) {
        label.position.copy(position).add(new THREE.Vector3(0, 74, 0));
        nodesGroup.add(label);
      }

      const badge = makeBadge(node.type.length > 14 ? node.type.slice(0, 14) : node.type, `#${color.getHexString()}`);
      if (badge) {
        badge.position.copy(position).add(new THREE.Vector3(0, -76, 0));
        nodesGroup.add(badge);
      }
    }

    for (const edge of graph.edges) {
      const from = nodePositions.get(edge.from);
      const to = nodePositions.get(edge.to);
      if (!from || !to) continue;

      const middle = from.clone().lerp(to, 0.5);
      middle.y += Math.max(70, from.distanceTo(to) * 0.1);
      const curve = new THREE.QuadraticBezierCurve3(from, middle, to);
      const color = new THREE.Color(edge.id === selectedEdgeId ? "#f97316" : "#60a5fa");

      const line = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 42, edge.id === selectedEdgeId ? 3.6 : 2.4, 10, false),
        new THREE.MeshStandardMaterial({
          color,
          transparent: true,
          opacity: edge.id === selectedEdgeId ? 0.96 : 0.68,
          roughness: 0.36,
          metalness: 0.12,
        }),
      );
      edgesGroup.add(line);

      const tangent = curve.getTangent(0.96).normalize();
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(10, 28, 12),
        new THREE.MeshStandardMaterial({ color, roughness: 0.3, metalness: 0.22 }),
      );
      arrow.position.copy(curve.getPoint(0.96));
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      edgesGroup.add(arrow);

      if (edge.label) {
        const label = makeLabel(edge.label.length > 18 ? `${edge.label.slice(0, 17)}...` : edge.label);
        if (label) {
          label.position.copy(curve.getPoint(0.5)).add(new THREE.Vector3(0, 28, 0));
          edgesGroup.add(label);
        }
      }
    }

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      const w = Math.max(1, width);
      const h = Math.max(1, height);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h, false);
    };

    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();

    let frameId = 0;
    const animate = () => {
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      observer.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        (mesh.geometry as THREE.BufferGeometry | undefined)?.dispose();
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(material)) material.forEach(item => item.dispose()); else material?.dispose();
      });
      host.removeChild(renderer.domElement);
    };
  }, [graph, selectedEdgeId, selectedIds]);

  return (
    <div className="canvas-3d-wrap">
      <div ref={hostRef} className="canvas-3d-host" />
      <div className="canvas-3d-hint">Orbit, pan, and zoom to inspect the architecture in 3D.</div>
    </div>
  );
}
