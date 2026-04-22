import { useEffect, useRef } from "react";
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

const ROLE_HEIGHT: Record<string, number> = {
  controller: 145,
  middleware: 125,
  gateway: 75,
  service: 20,
  worker: 10,
  queue: -10,
  repository: -75,
  model: -118,
  dto: -150,
  config: -178,
  migration: -205,
  test: -235,
  unknown: -190,
};

function colorValue(value: string) {
  return value.startsWith("var(") ? "#94a3b8" : value;
}

function shortLabel(value: string, max = 18) {
  return value.length > max ? `${value.slice(0, max - 1)}...` : value;
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

function nodePosition(node: ClassNetworkNode) {
  return new THREE.Vector3(
    (node.x - 520) * 1.18,
    ROLE_HEIGHT[node.role] ?? ROLE_HEIGHT.unknown,
    (node.y - 260) * 1.18
  );
}

export default function ClassNetwork3D({
  network,
  activeNodeId,
  selectedEdgeId,
  onSelectNode,
  onSelectEdge,
  getRoleColor,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const activeNodeIdRef = useRef(activeNodeId);
  const selectedEdgeIdRef = useRef(selectedEdgeId);
  const onSelectNodeRef = useRef(onSelectNode);
  const onSelectEdgeRef = useRef(onSelectEdge);

  useEffect(() => {
    activeNodeIdRef.current = activeNodeId;
    selectedEdgeIdRef.current = selectedEdgeId;
    onSelectNodeRef.current = onSelectNode;
    onSelectEdgeRef.current = onSelectEdge;
  }, [activeNodeId, onSelectEdge, onSelectNode, selectedEdgeId]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x020617, 950, 1800);

    const camera = new THREE.PerspectiveCamera(45, 1, 1, 2400);
    camera.position.set(0, 350, 760);

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.target.set(0, 0, 0);
    controls.minDistance = 260;
    controls.maxDistance = 1350;

    scene.add(new THREE.AmbientLight(0xffffff, 0.72));
    const keyLight = new THREE.DirectionalLight(0x9bdcff, 1.1);
    keyLight.position.set(240, 420, 360);
    scene.add(keyLight);
    const fillLight = new THREE.DirectionalLight(0xffffff, 0.55);
    fillLight.position.set(-320, 180, -260);
    scene.add(fillLight);

    const floor = new THREE.GridHelper(920, 18, 0x1f3a4d, 0x132536);
    floor.position.y = -180;
    scene.add(floor);

    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const selectables: THREE.Object3D[] = [];
    const nodeMeshes: Array<{ id: string; mesh: THREE.Mesh; outline: THREE.LineSegments; base: THREE.Color }> = [];
    const labelObjects: Array<{ nodeId: string; object: THREE.Object3D; offset: THREE.Vector3 }> = [];
    const edgeObjects: Array<{
      id: string;
      from: string;
      to: string;
      tube: THREE.Mesh;
      arrow: THREE.Mesh;
      bead: THREE.Mesh;
      base: THREE.Color;
      curve: THREE.QuadraticBezierCurve3;
    }> = [];
    const selectedColor = new THREE.Color(0x00d4ff);
    const activeEdgeColor = new THREE.Color(0x7dd3fc);
    const activeNodeEmissive = new THREE.Color(0x006b88);
    const noEmissive = new THREE.Color(0x000000);
    const nodeById = new Map(network.nodes.map(node => [node.id, node]));
    const positionById = new Map(network.nodes.map(node => [node.id, nodePosition(node)]));
    const meshById = new Map<string, THREE.Mesh>();
    const dragPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
    const dragPoint = new THREE.Vector3();
    const dragOffset = new THREE.Vector3();
    const dragState = {
      id: null as string | null,
      moved: false,
      startX: 0,
      startY: 0,
    };

    const nodeGeometry = new THREE.BoxGeometry(132, 42, 48);

    for (const node of network.nodes) {
      const color = colorValue(getRoleColor(node.role));
      const base = new THREE.Color(color);
      const material = new THREE.MeshStandardMaterial({
        color,
        roughness: 0.48,
        metalness: 0.12,
        emissive: color,
        emissiveIntensity: 0.08,
      });

      const mesh = new THREE.Mesh(nodeGeometry, material);
      mesh.position.copy(nodePosition(node));
      mesh.userData = { kind: "node", id: node.id };
      selectables.push(mesh);
      scene.add(mesh);
      meshById.set(node.id, mesh);

      const outline = new THREE.EdgesGeometry(nodeGeometry);
      const outlineLine = new THREE.LineSegments(
        outline,
        new THREE.LineBasicMaterial({ color: 0x9ca3af, transparent: true, opacity: 0.55 })
      );
      outlineLine.position.copy(mesh.position);
      scene.add(outlineLine);
      nodeMeshes.push({ id: node.id, mesh, outline: outlineLine, base });

      const nameLabel = makeLabel(shortLabel(node.name), "#f8fafc", 32);
      const nameOffset = new THREE.Vector3(0, 50, 0);
      nameLabel.position.copy(mesh.position).add(nameOffset);
      scene.add(nameLabel);
      labelObjects.push({ nodeId: node.id, object: nameLabel, offset: nameOffset });

      const roleLabel = makeLabel(node.role.toUpperCase(), colorValue(getRoleColor(node.role)), 24);
      roleLabel.scale.set(104, 26, 1);
      const roleOffset = new THREE.Vector3(0, -46, 0);
      roleLabel.position.copy(mesh.position).add(roleOffset);
      scene.add(roleLabel);
      labelObjects.push({ nodeId: node.id, object: roleLabel, offset: roleOffset });
    }

    const updateEdgeGeometry = (edge: typeof edgeObjects[number]) => {
      const from = positionById.get(edge.from);
      const to = positionById.get(edge.to);
      if (!from || !to) return;

      const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 92, 0));
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      edge.curve = curve;
      edge.tube.geometry.dispose();
      edge.tube.geometry = new THREE.TubeGeometry(curve, 56, 2.4, 12, false);

      const tangent = curve.getTangent(0.92).normalize();
      edge.arrow.position.copy(curve.getPoint(0.92));
      edge.arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      edge.bead.position.copy(curve.getPoint(0.5));
    };

    for (const edge of network.edges) {
      const from = positionById.get(edge.from);
      const to = positionById.get(edge.to);
      if (!from || !to) continue;

      const mid = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 92, 0));
      const curve = new THREE.QuadraticBezierCurve3(from, mid, to);
      const edgeBase = new THREE.Color(0x6b7f9b);
      const tube = new THREE.Mesh(
        new THREE.TubeGeometry(curve, 56, 2.4, 12, false),
        new THREE.MeshStandardMaterial({
          color: edgeBase,
          roughness: 0.42,
          metalness: 0.08,
          transparent: true,
          opacity: 0.5,
        })
      );
      scene.add(tube);

      const tangent = curve.getTangent(0.92).normalize();
      const arrow = new THREE.Mesh(
        new THREE.ConeGeometry(11, 28, 24),
        new THREE.MeshStandardMaterial({ color: edgeBase, roughness: 0.34, metalness: 0.08 })
      );
      arrow.position.copy(curve.getPoint(0.92));
      arrow.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), tangent);
      scene.add(arrow);

      const bead = new THREE.Mesh(
        new THREE.SphereGeometry(8, 20, 20),
        new THREE.MeshStandardMaterial({
          color: 0x64748b,
          emissive: 0x000000,
          emissiveIntensity: 0,
        })
      );
      bead.position.copy(curve.getPoint(0.5));
      bead.userData = { kind: "edge", id: edge.id };
      selectables.push(bead);
      scene.add(bead);
      edgeObjects.push({ id: edge.id, from: edge.from, to: edge.to, tube, arrow, bead, base: edgeBase, curve });
    }

    const moveNode = (id: string, nextPosition: THREE.Vector3) => {
      const mesh = meshById.get(id);
      const nodeItem = nodeMeshes.find(item => item.id === id);
      if (!mesh || !nodeItem) return;

      mesh.position.copy(nextPosition);
      nodeItem.outline.position.copy(nextPosition);
      positionById.set(id, nextPosition.clone());

      for (const label of labelObjects) {
        if (label.nodeId !== id) continue;
        label.object.position.copy(nextPosition).add(label.offset);
      }

      for (const edge of edgeObjects) {
        if (edge.from === id || edge.to === id) updateEdgeGeometry(edge);
      }
    };

    const applyHighlight = () => {
      const activeId = activeNodeIdRef.current;
      const edgeId = selectedEdgeIdRef.current;

      for (const item of nodeMeshes) {
        const active = item.id === activeId;
        const material = item.mesh.material as THREE.MeshStandardMaterial;
        material.color.copy(active ? selectedColor : item.base);
        material.emissive.copy(active ? activeNodeEmissive : item.base);
        material.emissiveIntensity = active ? 0.95 : 0.08;
        item.mesh.scale.setScalar(active ? 1.08 : 1);

        const outlineMaterial = item.outline.material as THREE.LineBasicMaterial;
        outlineMaterial.color.set(active ? 0xffffff : 0x9ca3af);
        outlineMaterial.opacity = active ? 0.95 : 0.55;
      }

      for (const edge of edgeObjects) {
        const active = edge.id === edgeId || edge.from === activeId || edge.to === activeId;
        const selected = edge.id === edgeId;
        const color = selected ? selectedColor : active ? activeEdgeColor : edge.base;

        for (const object of [edge.tube, edge.arrow, edge.bead]) {
          const material = object.material as THREE.MeshStandardMaterial;
          material.color.copy(color);
          material.opacity = selected ? 1 : active ? 0.9 : 0.5;
          material.emissive.copy(selected ? activeNodeEmissive : noEmissive);
          material.emissiveIntensity = selected ? 0.9 : 0;
        }
        edge.bead.scale.setScalar(selected ? 1.45 : active ? 1.2 : 1);
        edge.tube.scale.setScalar(selected ? 1.18 : 1);
      }
    };

    const resize = () => {
      const { width, height } = host.getBoundingClientRect();
      const safeWidth = Math.max(1, width);
      const safeHeight = Math.max(1, height);
      camera.aspect = safeWidth / safeHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(safeWidth, safeHeight, false);
    };

    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(host);
    resize();

    const updatePointerRay = (event: PointerEvent) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
    };

    const handlePointerDown = (event: PointerEvent) => {
      updatePointerRay(event);

      const hit = raycaster.intersectObjects(selectables, false)[0]?.object;
      if (!hit) return;

      const kind = hit.userData.kind as string | undefined;
      const id = hit.userData.id as string | undefined;
      if (kind === "node" && id) {
        const node = nodeById.get(id);
        const mesh = meshById.get(id);
        if (!node || !mesh) return;

        dragPlane.setFromNormalAndCoplanarPoint(new THREE.Vector3(0, 1, 0), mesh.position);
        if (raycaster.ray.intersectPlane(dragPlane, dragPoint)) {
          dragState.id = id;
          dragState.moved = false;
          dragState.startX = event.clientX;
          dragState.startY = event.clientY;
          dragOffset.copy(mesh.position).sub(dragPoint);
          controls.enabled = false;
          renderer.domElement.style.cursor = "grabbing";
          renderer.domElement.setPointerCapture(event.pointerId);
          event.preventDefault();
        }
      }
      if (kind === "edge" && id) onSelectEdgeRef.current(id);
    };

    const handlePointerMove = (event: PointerEvent) => {
      if (!dragState.id) return;

      updatePointerRay(event);
      if (!raycaster.ray.intersectPlane(dragPlane, dragPoint)) return;

      const dx = event.clientX - dragState.startX;
      const dy = event.clientY - dragState.startY;
      if (dx * dx + dy * dy > 9) dragState.moved = true;

      const next = dragPoint.clone().add(dragOffset);
      next.x = THREE.MathUtils.clamp(next.x, -720, 720);
      next.z = THREE.MathUtils.clamp(next.z, -430, 430);
      moveNode(dragState.id, next);
      event.preventDefault();
    };

    const finishPointerDrag = (event: PointerEvent) => {
      if (!dragState.id) return;

      const id = dragState.id;
      const didMove = dragState.moved;
      dragState.id = null;
      dragState.moved = false;
      controls.enabled = true;
      renderer.domElement.style.cursor = "";

      if (renderer.domElement.hasPointerCapture(event.pointerId)) {
        renderer.domElement.releasePointerCapture(event.pointerId);
      }

      if (!didMove) {
        const node = nodeById.get(id);
        if (node) onSelectNodeRef.current(node);
      }
    };

    renderer.domElement.addEventListener("pointerdown", handlePointerDown);
    renderer.domElement.addEventListener("pointermove", handlePointerMove);
    renderer.domElement.addEventListener("pointerup", finishPointerDrag);
    renderer.domElement.addEventListener("pointercancel", finishPointerDrag);

    let frameId = 0;
    const animate = () => {
      applyHighlight();
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };
    animate();

    return () => {
      cancelAnimationFrame(frameId);
      renderer.domElement.removeEventListener("pointerdown", handlePointerDown);
      renderer.domElement.removeEventListener("pointermove", handlePointerMove);
      renderer.domElement.removeEventListener("pointerup", finishPointerDrag);
      renderer.domElement.removeEventListener("pointercancel", finishPointerDrag);
      resizeObserver.disconnect();
      controls.dispose();
      renderer.dispose();
      scene.traverse(object => {
        const mesh = object as THREE.Mesh;
        const material = mesh.material as THREE.Material | THREE.Material[] | undefined;
        const geometry = mesh.geometry as THREE.BufferGeometry | undefined;
        geometry?.dispose();
        if (Array.isArray(material)) material.forEach(item => item.dispose());
        else material?.dispose();
      });
      host.removeChild(renderer.domElement);
    };
  }, [getRoleColor, network]);

  return <div ref={hostRef} className="nim-network-3d" />;
}
