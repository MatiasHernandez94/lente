"use client";

import { useRef, useEffect } from "react";

interface Detection {
  frame_id: number;
  players: Array<{
    bbox: [number, number, number, number];
    center: [number, number];
    confidence: number;
  }>;
  ball: {
    center: [number, number];
    confidence: number;
  } | null;
}

interface Props {
  width: number;
  height: number;
  detection: Detection | null;
  showBboxes?: boolean;
  showLabels?: boolean;
  showBall?: boolean;
}

export function LiveOverlay({
  width,
  height,
  detection,
  showBboxes = true,
  showLabels = true,
  showBall = true,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Clear
    ctx.clearRect(0, 0, width, height);

    if (!detection) return;

    // Draw players
    detection.players.forEach((player, i) => {
      const [x1, y1, x2, y2] = player.bbox;
      const [cx, cy] = player.center;

      // Bounding box
      if (showBboxes) {
        ctx.strokeStyle = `hsl(${(i * 37) % 360}, 70%, 50%)`;
        ctx.lineWidth = 2;
        ctx.strokeRect(x1, y1, x2 - x1, y2 - y1);
      }

      // Center dot
      ctx.fillStyle = `hsl(${(i * 37) % 360}, 70%, 50%)`;
      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fill();

      // Label
      if (showLabels) {
        const label = `P${i + 1}`;
        ctx.font = "11px monospace";
        const textWidth = ctx.measureText(label).width;

        ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
        ctx.fillRect(cx - textWidth / 2 - 2, y1 - 16, textWidth + 4, 14);

        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.fillText(label, cx, y1 - 5);
      }
    });

    // Draw ball
    if (showBall && detection.ball) {
      const [bx, by] = detection.ball.center;

      // Glow
      const gradient = ctx.createRadialGradient(bx, by, 0, bx, by, 15);
      gradient.addColorStop(0, "rgba(255, 255, 0, 0.8)");
      gradient.addColorStop(1, "rgba(255, 255, 0, 0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(bx, by, 15, 0, Math.PI * 2);
      ctx.fill();

      // Ball
      ctx.fillStyle = "white";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.5)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }, [detection, width, height, showBboxes, showLabels, showBall]);

  return (
    <canvas
      ref={canvasRef}
      width={width}
      height={height}
      className="absolute inset-0 pointer-events-none"
      style={{ zIndex: 10 }}
    />
  );
}
