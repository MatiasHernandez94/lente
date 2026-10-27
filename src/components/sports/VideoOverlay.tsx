"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface Player {
  id: number;
  team: number;
  center: [number, number];
  bbox: [number, number, number, number];
  speed_mps?: number;
  name?: string;
}

interface Ball {
  center: [number, number];
}

interface FrameData {
  frame: number;
  time_s: number;
  players: Player[];
  ball: Ball | null;
}

interface OverlaySettings {
  showLabels: boolean;
  showTrajectories: boolean;
  showSpeed: boolean;
  showBboxes: boolean;
  showBall: boolean;
  teamColors: [string, string];
}

interface VideoAnalysisData {
  video: {
    width: number;
    height: number;
    fps: number;
    duration_s: number;
  };
  frames: FrameData[];
}

interface Props {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  data: VideoAnalysisData;
  settings?: Partial<OverlaySettings>;
}

const DEFAULT_SETTINGS: OverlaySettings = {
  showLabels: true,
  showTrajectories: true,
  showSpeed: true,
  showBboxes: true,
  showBall: true,
  teamColors: ["#3b82f6", "#ef4444"], // Blue, Red
};

export function VideoOverlay({ videoRef, data, settings: userSettings }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>(0);
  const [settings, setSettings] = useState<OverlaySettings>({
    ...DEFAULT_SETTINGS,
    ...userSettings,
  });

  // Cache for trajectory trails
  const trailCache = useRef<Map<number, [number, number][]>>(new Map());

  const getCurrentFrame = useCallback((): FrameData | null => {
    if (!data.frames.length) return null;
    const video = videoRef.current;
    if (!video) return null;

    const currentTime = video.currentTime;
    // Find closest frame
    let closest = data.frames[0];
    let minDiff = Math.abs(closest.time_s - currentTime);
    for (const frame of data.frames) {
      const diff = Math.abs(frame.time_s - currentTime);
      if (diff < minDiff) {
        minDiff = diff;
        closest = frame;
      }
    }
    return closest;
  }, [data.frames, videoRef]);

  const drawFrameRef = useRef<() => void>(() => {});

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    const video = videoRef.current;
    if (!canvas || !video || video.paused || video.ended) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Match canvas to video display size
    const rect = video.getBoundingClientRect();
    if (canvas.width !== rect.width || canvas.height !== rect.height) {
      canvas.width = rect.width;
      canvas.height = rect.height;
    }

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const frame = getCurrentFrame();
    if (!frame) return;

    const scaleX = canvas.width / data.video.width;
    const scaleY = canvas.height / data.video.height;

    // Update trail cache
    for (const player of frame.players) {
      const existing = trailCache.current.get(player.id) || [];
      existing.push(player.center);
      if (existing.length > 30) existing.shift(); // Keep last 30 positions
      trailCache.current.set(player.id, existing);
    }

    // Draw trajectory trails
    if (settings.showTrajectories) {
      for (const player of frame.players) {
        const trail = trailCache.current.get(player.id) || [];
        if (trail.length < 2) continue;

        const color = settings.teamColors[player.team] || settings.teamColors[0];
        ctx.beginPath();
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.4;

        for (let i = 0; i < trail.length; i++) {
          const x = trail[i][0] * scaleX;
          const y = trail[i][1] * scaleY;
          if (i === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        }
        ctx.stroke();
        ctx.globalAlpha = 1;
      }
    }

    // Draw bounding boxes
    if (settings.showBboxes) {
      for (const player of frame.players) {
        const color = settings.teamColors[player.team] || settings.teamColors[0];
        const [x1, y1, x2, y2] = player.bbox;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.strokeRect(x1 * scaleX, y1 * scaleY, (x2 - x1) * scaleX, (y2 - y1) * scaleY);
      }
    }

    // Draw player labels
    if (settings.showLabels) {
      for (const player of frame.players) {
        const x = player.center[0] * scaleX;
        const y = player.center[1] * scaleY;
        const color = settings.teamColors[player.team] || settings.teamColors[0];
        const label = player.name || `#${player.id}`;

        // Background pill
        ctx.font = "bold 11px system-ui";
        const textWidth = ctx.measureText(label).width;
        const pillWidth = textWidth + 12;
        const pillHeight = 18;

        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.roundRect(x - pillWidth / 2, y - 40, pillWidth, pillHeight, 4);
        ctx.fill();

        // Text
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(label, x, y - 31);

        // Player dot
        ctx.beginPath();
        ctx.arc(x, y, 5, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();
      }
    }

    // Draw speed indicators
    if (settings.showSpeed) {
      for (const player of frame.players) {
        if (!player.speed_mps || player.speed_mps < 0.5) continue;
        const x = player.center[0] * scaleX;
        const y = player.center[1] * scaleY;

        const speedText = `${player.speed_mps.toFixed(1)} m/s`;
        ctx.font = "10px monospace";
        const textWidth = ctx.measureText(speedText).width;

        // Speed badge
        ctx.fillStyle = "rgba(0,0,0,0.7)";
        ctx.beginPath();
        ctx.roundRect(x - textWidth / 2 - 4, y + 10, textWidth + 8, 14, 3);
        ctx.fill();

        ctx.fillStyle = player.speed_mps > 4 ? "#fbbf24" : "#a3e635";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText(speedText, x, y + 17);
      }
    }

    // Draw ball
    if (settings.showBall && frame.ball) {
      const bx = frame.ball.center[0] * scaleX;
      const by = frame.ball.center[1] * scaleY;

      // Ball glow
      const gradient = ctx.createRadialGradient(bx, by, 0, bx, by, 15);
      gradient.addColorStop(0, "rgba(255,255,255,0.8)");
      gradient.addColorStop(1, "rgba(255,255,255,0)");
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(bx, by, 15, 0, Math.PI * 2);
      ctx.fill();

      // Ball
      ctx.beginPath();
      ctx.arc(bx, by, 6, 0, Math.PI * 2);
      ctx.fillStyle = "white";
      ctx.fill();
      ctx.strokeStyle = "#333";
      ctx.lineWidth = 2;
      ctx.stroke();
    }

    animationRef.current = requestAnimationFrame(() => drawFrameRef.current());
  }, [data.video, getCurrentFrame, settings, videoRef]);

  useEffect(() => {
    drawFrameRef.current = drawFrame;
    const video = videoRef.current;
    if (!video) return;

    const handlePlay = () => {
      animationRef.current = requestAnimationFrame(drawFrame);
    };

    const handlePause = () => {
      cancelAnimationFrame(animationRef.current);
      drawFrame(); // Draw one last frame
    };

    const handleSeeked = () => {
      drawFrame();
    };

    video.addEventListener("play", handlePlay);
    video.addEventListener("pause", handlePause);
    video.addEventListener("seeked", handleSeeked);
    video.addEventListener("ended", handlePause);

    // Initial draw
    drawFrame();

    return () => {
      video.removeEventListener("play", handlePlay);
      video.removeEventListener("pause", handlePause);
      video.removeEventListener("seeked", handleSeeked);
      video.removeEventListener("ended", handlePause);
      cancelAnimationFrame(animationRef.current);
    };
  }, [drawFrame, videoRef]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-10 pointer-events-none"
      style={{ width: "100%", height: "100%" }}
    />
  );
}

export function useOverlaySettings() {
  const [settings, setSettings] = useState<OverlaySettings>(DEFAULT_SETTINGS);

  const toggleLabels = () => setSettings(s => ({ ...s, showLabels: !s.showLabels }));
  const toggleTrajectories = () => setSettings(s => ({ ...s, showTrajectories: !s.showTrajectories }));
  const toggleSpeed = () => setSettings(s => ({ ...s, showSpeed: !s.showSpeed }));
  const toggleBboxes = () => setSettings(s => ({ ...s, showBboxes: !s.showBboxes }));
  const toggleBall = () => setSettings(s => ({ ...s, showBall: !s.showBall }));
  const setTeamColors = (colors: [string, string]) => setSettings(s => ({ ...s, teamColors: colors }));

  return {
    settings,
    toggleLabels,
    toggleTrajectories,
    toggleSpeed,
    toggleBboxes,
    toggleBall,
    setTeamColors,
  };
}
