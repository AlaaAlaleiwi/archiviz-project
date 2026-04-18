import { useRef, useState } from "react";

export function useCamera() {
  const [camera, setCamera] = useState({
    x: 0,
    y: 0,
    scale: 1
  });

  const dragging = useRef(false);
  const last = useRef({ x: 0, y: 0 });

  const onPointerDown = (e: React.PointerEvent) => {
    dragging.current = true;
    last.current = { x: e.clientX, y: e.clientY };
  };

  const onPointerMove = (e: PointerEvent) => {
    if (!dragging.current) return;

    const dx = e.clientX - last.current.x;
    const dy = e.clientY - last.current.y;

    last.current = { x: e.clientX, y: e.clientY };

    setCamera(c => ({
      ...c,
      x: c.x + dx,
      y: c.y + dy
    }));
  };

  const onPointerUp = () => {
    dragging.current = false;
  };

  const zoomAtPoint = (delta: number, x: number, y: number) => {
    setCamera(c => {
      const nextScale = Math.min(2.5, Math.max(0.4, c.scale + delta));

      const scaleRatio = nextScale / c.scale;

      return {
        scale: nextScale,
        x: x - (x - c.x) * scaleRatio,
        y: y - (y - c.y) * scaleRatio
      };
    });
  };

  return {
    camera,
    setCamera,
    onPointerDown,
    onPointerMove,
    onPointerUp,
    zoomAtPoint
  };
}