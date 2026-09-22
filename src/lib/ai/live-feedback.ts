import type { Sport } from "@/lib/analysis/types";

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

export interface Feedback {
  type: "info" | "warning" | "success" | "tip";
  message: string;
  timestamp: number;
}

export function analyzeLiveDetection(
  detection: Detection,
  sport: Sport,
  previousDetections: Detection[],
): Feedback | null {
  if (!detection || detection.players.length === 0) return null;

  const now = Date.now();

  // Only generate feedback every 2 seconds
  if (previousDetections.length > 0) {
    const lastDetection = previousDetections[previousDetections.length - 1];
    const lastTimestamp = (lastDetection as unknown as { _timestamp?: number })._timestamp ?? 0;
    if (now - lastTimestamp < 2000) {
      return null;
    }
  }

  const playerCount = detection.players.length;

  // Player count feedback
  if (playerCount >= 10) {
    return {
      type: "info",
      message: `${playerCount} jugadores detectados en cancha`,
      timestamp: now,
    };
  }

  if (playerCount >= 4 && playerCount < 10) {
    return {
      type: "warning",
      message: `${playerCount} jugadores visibles —视野可能受限`,
      timestamp: now,
    };
  }

  if (playerCount < 4 && playerCount > 0) {
    return {
      type: "tip",
      message: `Solo ${playerCount} jugador(es) detectado(s) — ajustá la cámara`,
      timestamp: now,
    };
  }

  // Ball detection
  if (detection.ball) {
    const ballNearPlayer = detection.players.some((p) => {
      const [cx, cy] = p.center;
      const [bx, by] = detection.ball!.center;
      const dist = Math.sqrt((cx - bx) ** 2 + (cy - by) ** 2);
      return dist < 100; // Within 100 pixels
    });

    if (ballNearPlayer) {
      return {
        type: "success",
        message: "Balón en juego — jugadores cerca del balón",
        timestamp: now,
      };
    }
  }

  return null;
}

export function getFeedbackColor(type: Feedback["type"]): string {
  switch (type) {
    case "info":
      return "bg-blue-500";
    case "warning":
      return "bg-amber-500";
    case "success":
      return "bg-green-500";
    case "tip":
      return "bg-purple-500";
  }
}

export function getFeedbackIcon(type: Feedback["type"]): string {
  switch (type) {
    case "info":
      return "ℹ";
    case "warning":
      return "⚠";
    case "success":
      return "✓";
    case "tip":
      return "💡";
  }
}
