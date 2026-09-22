"use client";

import { useCallback, useEffect, useRef } from "react";

interface PlayerPosition {
  x: number;
  y: number;
  team: number;
  id: number;
  name?: string;
  speed?: number;
}

interface TacticalBoardProps {
  width?: number;
  height?: number;
  players: PlayerPosition[];
  formation?: string;
  possession?: { team0: number; team1: number };
  heatmap?: number[][];
  teamColors?: [string, string];
}

const FIELD_RATIO = 68 / 105; // width/length
const PADDING = 40;

export function TacticalBoard({
  width = 600,
  height,
  players,
  formation,
  possession,
  heatmap,
  teamColors = ["#3b82f6", "#ef4444"],
}: TacticalBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const h = height || width * FIELD_RATIO;

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    canvas.width = width;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const fieldW = width - PADDING * 2;
    const fieldH = h - PADDING * 2;
    const ox = PADDING;
    const oy = PADDING;

    // Background
    ctx.fillStyle = "#1a472a";
    ctx.fillRect(0, 0, width, h);

    // Field lines
    ctx.strokeStyle = "rgba(255,255,255,0.5)";
    ctx.lineWidth = 1.5;

    // Outer border
    ctx.strokeRect(ox, oy, fieldW, fieldH);

    // Center line
    ctx.beginPath();
    ctx.moveTo(ox + fieldW / 2, oy);
    ctx.lineTo(ox + fieldW / 2, oy + fieldH);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(ox + fieldW / 2, oy + fieldH / 2, fieldH * 0.15, 0, Math.PI * 2);
    ctx.stroke();

    // Penalty areas
    const paW = fieldW * 0.15;
    const paH = fieldH * 0.4;
    ctx.strokeRect(ox, oy + (fieldH - paH) / 2, paW, paH);
    ctx.strokeRect(ox + fieldW - paW, oy + (fieldH - paH) / 2, paW, paH);

    // Goal areas
    const gaW = fieldW * 0.06;
    const gaH = fieldH * 0.18;
    ctx.strokeRect(ox, oy + (fieldH - gaH) / 2, gaW, gaH);
    ctx.strokeRect(ox + fieldW - gaW, oy + (fieldH - gaH) / 2, gaW, gaH);

    // Penalty spots
    ctx.beginPath();
    ctx.arc(ox + fieldW * 0.12, oy + fieldH / 2, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(ox + fieldW * 0.88, oy + fieldH / 2, 3, 0, Math.PI * 2);
    ctx.fill();

    // Corner arcs
    const cornerR = 10;
    ctx.beginPath();
    ctx.arc(ox, oy, cornerR, 0, Math.PI / 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ox + fieldW, oy, cornerR, Math.PI / 2, Math.PI);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ox, oy + fieldH, cornerR, -Math.PI / 2, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(ox + fieldW, oy + fieldH, cornerR, Math.PI, Math.PI * 1.5);
    ctx.stroke();

    // Heatmap overlay
    if (heatmap && heatmap.length > 0) {
      const cellW = fieldW / heatmap[0].length;
      const cellH = fieldH / heatmap.length;

      for (let y = 0; y < heatmap.length; y++) {
        for (let x = 0; x < heatmap[y].length; x++) {
          const val = heatmap[y][x];
          if (val > 0.05) {
            ctx.fillStyle = `rgba(255, 100, 0, ${val * 0.5})`;
            ctx.fillRect(ox + x * cellW, oy + y * cellH, cellW + 1, cellH + 1);
          }
        }
      }
    }

    // Player dots
    for (const player of players) {
      const px = ox + player.x * fieldW;
      const py = oy + player.y * fieldH;
      const color = teamColors[player.team] || teamColors[0];

      // Shadow
      ctx.beginPath();
      ctx.arc(px + 2, py + 2, 12, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(0,0,0,0.3)";
      ctx.fill();

      // Player circle
      ctx.beginPath();
      ctx.arc(px, py, 12, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "white";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Player label
      const label = player.name || `${player.id}`;
      ctx.font = "bold 10px system-ui";
      ctx.fillStyle = "white";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(label, px, py);

      // Speed ring
      if (player.speed && player.speed > 2) {
        ctx.beginPath();
        ctx.arc(px, py, 16, 0, Math.PI * 2);
        ctx.strokeStyle = player.speed > 4 ? "#fbbf24" : "#a3e635";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Formation label
    if (formation) {
      ctx.font = "bold 14px system-ui";
      ctx.fillStyle = "white";
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      ctx.fillText(`Formación: ${formation}`, 10, 10);
    }

    // Possession bar
    if (possession) {
      const barY = h - 20;
      const barW = width - 20;
      const barH = 8;

      // Background
      ctx.fillStyle = "rgba(255,255,255,0.2)";
      ctx.beginPath();
      ctx.roundRect(10, barY, barW, barH, 4);
      ctx.fill();

      // Team 0 portion
      const t0W = (possession.team0 / 100) * barW;
      ctx.fillStyle = teamColors[0];
      ctx.beginPath();
      ctx.roundRect(10, barY, t0W, barH, 4);
      ctx.fill();

      // Team 1 portion
      ctx.fillStyle = teamColors[1];
      ctx.beginPath();
      ctx.roundRect(10 + t0W, barY, barW - t0W, barH, 4);
      ctx.fill();

      // Labels
      ctx.font = "10px system-ui";
      ctx.fillStyle = "white";
      ctx.textAlign = "left";
      ctx.fillText(`${possession.team0}%`, 10, barY - 4);
      ctx.textAlign = "right";
      ctx.fillText(`${possession.team1}%`, width - 10, barY - 4);
    }
  }, [width, h, players, formation, possession, heatmap, teamColors]);

  useEffect(() => {
    draw();
  }, [draw]);

  return (
    <div className="relative">
      <canvas
        ref={canvasRef}
        width={width}
        height={h}
        className="rounded border border-hairline"
      />
      <div className="absolute top-2 right-2 flex gap-2">
        <span className="flex items-center gap-1 text-[10px] text-white">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: teamColors[0] }} />
          Equipo A
        </span>
        <span className="flex items-center gap-1 text-[10px] text-white">
          <span className="inline-block h-2 w-2 rounded-full" style={{ background: teamColors[1] }} />
          Equipo B
        </span>
      </div>
    </div>
  );
}
