"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BarChart3, Crosshair, Play, Radio, RefreshCw, Users } from "lucide-react";
import type { VideoRow } from "@/lib/schema";
import type {
  ScoutAssignment,
  ScoutCalibration,
  ScoutPoint,
  ScoutResultData,
  ScoutSnapshot,
  ScoutTeamKey,
  ScoutTrack,
} from "@/lib/scout/types";
import { computeTrackMetrics, instantSpeedAt, interpolateTrackPoint } from "@/lib/scout/geom";
import { SELECTED_COLOR, TEAM_COLORS, UNASSIGNED_COLOR } from "@/lib/scout/colors";
import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";
import { EventBoard } from "@/components/scout/EventBoard";
import { SpeedChart } from "@/components/scout/SpeedChart";
import { HeatMap } from "@/components/scout/HeatMap";
import { KpiBars } from "@/components/scout/KpiBars";
import { CoachAssistant } from "@/components/scout/CoachAssistant";
import { youtubeEmbedUrl } from "@/components/analysis/VideoFrame";

interface ScoutViewerProps {
  video: VideoRow;
  initial: ScoutSnapshot;
}

const POLL_MS = 2500;
const DEFAULT_COURT = { width: 28.65, height: 15.24 };

interface FetchError extends Error {
  status: number;
}

async function scoutFetch(url: string, init?: RequestInit): Promise<Record<string, unknown>> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const error = new Error((body.error as string) ?? "Solicitud inválida.") as FetchError;
    error.status = res.status;
    throw error;
  }
  return body;
}

function formatDistance(meters: number): string {
  if (meters >= 1000) return `${(meters / 1000).toFixed(2)} km`;
  return `${Math.round(meters)} m`;
}

function formatSpeed(kmh: number): string {
  return `${kmh.toFixed(1)} km/h`;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y, x + w, y + r, r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r, r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y, x + r, y, r);
  ctx.closePath();
}

function interpolateTrail(track: ScoutTrack, t: number, spanSeconds = 1.6, count = 8): ScoutPoint[] {
  const trail: ScoutPoint[] = [];
  for (let i = 0; i < count; i++) {
    const at = t - (spanSeconds * i) / count;
    const point = interpolateTrackPoint(track, at);
    if (point) trail.push(point);
  }
  return trail;
}

export function ScoutViewer({ video, initial }: ScoutViewerProps) {
  const router = useRouter();
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const statusRef = useRef(initial.status);
  const tickRef = useRef(0);

  const [status, setStatus] = useState<ScoutSnapshot["status"]>(initial.status);
  const [data, setData] = useState<ScoutResultData | null>(initial.data);
  const [assignments, setAssignments] = useState<ScoutAssignment[]>(initial.assignments);
  const [calibration, setCalibration] = useState<ScoutCalibration | null>(initial.calibration);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  const [selectedTrackId, setSelectedTrackId] = useState<number | null>(null);
  const [draftName, setDraftName] = useState("");
  const [draftTeam, setDraftTeam] = useState<ScoutTeamKey>("A");
  const [calibrating, setCalibrating] = useState(false);
  const [draftPoints, setDraftPoints] = useState<{ x: number; y: number }[]>([]);
  const [draftCourt, setDraftCourt] = useState(DEFAULT_COURT);

  const mediaUrl = `/api/media/${encodeURIComponent(video.sourceRef ?? "")}`;
  const fps = data?.analysis.fps ?? 5;

  const isLocal = video.sourceType === "upload" || video.sourceType === "camera";
  const isDemoYoutube = video.sourceType === "youtube";
  const embedUrl = isDemoYoutube && video.sourceRef ? youtubeEmbedUrl(video.sourceRef) : null;
  const demoDuration = data?.video.durationSec ?? 60;

  useEffect(() => {
    statusRef.current = status;
  }, [status]);

  const loadSnapshot = useCallback(async () => {
    const snapshot = (await scoutFetch(`/api/videos/${video.id}/scout`)) as unknown as ScoutSnapshot;
    setStatus(snapshot.status);
    setData(snapshot.data);
    setAssignments(snapshot.assignments);
    setCalibration(snapshot.calibration);
  }, [video.id]);

  useEffect(() => {
    if (status !== "running") return;
    const timer = setInterval(() => {
      loadSnapshot()
        .then(() => {
          if (statusRef.current !== "running") clearInterval(timer);
        })
        .catch((err) => setError(err.message));
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [status, loadSnapshot]);

  const startAnalysis = async () => {
    setBusy(true);
    setError(null);
    try {
      await scoutFetch(`/api/videos/${video.id}/scout`, { method: "POST" });
      setStatus("running");
      await loadSnapshot();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo iniciar el seguimiento.");
      setStatus("none");
    } finally {
      setBusy(false);
    }
  };

  const displayRect = useCallback(() => {
    const container = containerRef.current;
    const videoEl = videoRef.current;
    if (!container) return { x: 0, y: 0, width: 0, height: 0 };
    const rect = container.getBoundingClientRect();
    const vw = videoEl?.videoWidth ?? 0;
    const vh = videoEl?.videoHeight ?? 0;
    if (!vw || !vh) return rect;
    const scale = Math.min(rect.width / vw, rect.height / vh);
    const dw = vw * scale;
    const dh = vh * scale;
    return { x: (rect.width - dw) / 2, y: (rect.height - dh) / 2, width: dw, height: dh };
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    const videoEl = videoRef.current;
    if (!canvas || !container) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * dpr));
    canvas.height = Math.max(1, Math.round(rect.height * dpr));
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);

    const view = displayRect();
    const t = videoEl?.currentTime ?? 0;
    const byTrack = new Map(assignments.map((a) => [a.trackId, a]));
    const minBox = 0.02 * view.width;

    const drawPlayerBox = (cx: number, cy: number, w: number, h: number, color: { stroke: string; fill: string }) => {
      const x = cx - w / 2;
      const y = cy - h / 2;
      ctx.fillStyle = color.fill;
      ctx.strokeStyle = color.stroke;
      ctx.beginPath();
      roundRect(ctx, x, y, w, h, 3);
      ctx.fill();
      ctx.stroke();
    };

    const drawPill = (cx: number, topY: number, text: string, bg: string, maxWidth: number) => {
      ctx.font = "600 11px system-ui, sans-serif";
      const textW = Math.min(ctx.measureText(text).width + 14, maxWidth);
      const pillW = Math.max(textW, 24);
      const x = cx - pillW / 2;
      ctx.fillStyle = bg;
      ctx.beginPath();
      roundRect(ctx, x, topY, pillW, 17, 8.5);
      ctx.fill();
      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "center";
      ctx.fillText(text.length > 22 ? `${text.slice(0, 20)}…` : text, cx, topY + 12);
      ctx.textAlign = "left";
    };

    for (const track of data?.tracks ?? []) {
      const point = interpolateTrackPoint(track, t);
      if (!point) continue;
      const cx = view.x + point.x * view.width;
      const cy = view.y + point.y * view.height;
      const pw = Math.max(point.w * view.width, minBox);
      const ph = Math.max(point.h * view.height, pw * 1.15);
      const feetY = cy + ph / 2;
      const assignment = byTrack.get(track.id);
      const selected = track.id === selectedTrackId;
      const color = selected
        ? SELECTED_COLOR
        : assignment
          ? TEAM_COLORS[assignment.team]
          : UNASSIGNED_COLOR;

      if (selected && calibration) {
        const trail = interpolateTrail(track, t);
        ctx.strokeStyle = "rgba(255,255,255,0.55)";
        ctx.lineWidth = 2;
        ctx.setLineDash([]);
        ctx.beginPath();
        let started = false;
        for (const { x: tx, y: ty } of trail) {
          const lx = view.x + tx * view.width;
          const ly = view.y + ty * view.height;
          if (!started) {
            ctx.moveTo(lx, ly);
            started = true;
          } else {
            ctx.lineTo(lx, ly);
          }
        }
        ctx.stroke();
      }

      ctx.save();
      if (selected) {
        ctx.shadowColor = "rgba(255,255,255,0.9)";
        ctx.shadowBlur = 10;
      }
      drawPlayerBox(cx, cy, pw, ph, color);
      ctx.restore();

      if (assignment || selected) {
        const label = assignment?.name ?? `Jugador ${track.id + 1}`;
        const tagBg = assignment ? TEAM_COLORS[assignment.team].stroke : "#111111";
        drawPill(cx, feetY + 4, label, tagBg, Math.max(view.width * 0.3, 90));
      } else {
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        ctx.beginPath();
        ctx.arc(cx, feetY, 2.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (selectedTrackId !== null) {
      const track = data?.tracks.find((track) => track.id === selectedTrackId);
      const point = track ? interpolateTrackPoint(track, t) : null;
      const assignment = byTrack.get(selectedTrackId);
      if (track && point) {
        const cardW = 176;
        const cardH = 74;
        const cardX = view.x + 12;
        const cardY = view.y + 12;
        ctx.fillStyle = "rgba(17,17,17,0.78)";
        ctx.beginPath();
        roundRect(ctx, cardX, cardY, cardW, cardH, 6);
        ctx.fill();
        ctx.strokeStyle = assignment ? TEAM_COLORS[assignment.team].stroke : "rgba(255,255,255,0.5)";
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = assignment ? TEAM_COLORS[assignment.team].stroke : "#ffffff";
        ctx.beginPath();
        ctx.arc(cardX + 17, cardY + 17, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.font = "600 13px system-ui, sans-serif";
        ctx.fillStyle = "#ffffff";
        ctx.textAlign = "left";
        const name = assignment?.name ?? `Jugador ${selectedTrackId + 1}`;
        ctx.fillText(name, cardX + 28, cardY + 21);
        ctx.font = "500 10px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.62)";
        ctx.fillText(TEAM_COLORS[assignment?.team ?? "A"].label, cardX + 28, cardY + 35);
        ctx.font = "700 22px system-ui, sans-serif";
        ctx.fillStyle = "#ffffff";
        const speed = calibration ? instantSpeedAt(track, calibration.homography, t) : null;
        ctx.fillText(speed === null ? "—" : formatSpeed(speed), cardX + 14, cardY + 58);
        ctx.font = "600 10px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.7)";
        ctx.fillText("velocidad en vivo", cardX + 76, cardY + 58);
        ctx.font = "600 11px system-ui, sans-serif";
        ctx.fillStyle = "rgba(255,255,255,0.85)";
        const distance = calibration
          ? computeTrackMetrics({ ...track, points: track.points.filter((p) => p.t <= t) }, calibration.homography, fps).distanceM
          : null;
        ctx.fillText(
          distance === null ? "" : `Distancia ${formatDistance(distance)}`,
          cardX + 14,
          cardY + cardH - 8,
        );
      }
    }

    if (calibrating) {
      ctx.font = "600 13px system-ui, sans-serif";
      for (const [i, point] of draftPoints.entries()) {
        const px = view.x + point.x * view.width;
        const py = view.y + point.y * view.height;
        ctx.beginPath();
        ctx.arc(px, py, 7, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.strokeStyle = "#111111";
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = "#111111";
        ctx.textAlign = "center";
        ctx.fillText(String(i + 1), px, py + 4);
      }
      ctx.textAlign = "left";
      if (draftPoints.length >= 2) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 3]);
        ctx.beginPath();
        ctx.moveTo(view.x + draftPoints[0].x * view.width, view.y + draftPoints[0].y * view.height);
        for (const point of draftPoints) ctx.lineTo(view.x + point.x * view.width, view.y + point.y * view.height);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
  }, [assignments, calibrating, calibration, data, displayRect, draftPoints, fps, selectedTrackId]);

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      draw();
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [draw]);

  const handleVideoClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const container = containerRef.current;
    if (!container) return;
    const rect = container.getBoundingClientRect();
    const px = event.clientX - rect.left;
    const py = event.clientY - rect.top;
    const view = displayRect();
    if (view.width <= 0 || view.height <= 0) return;
    const nx = (px - view.x) / view.width;
    const ny = (py - view.y) / view.height;
    if (nx < 0 || nx > 1 || ny < 0 || ny > 1) return;

    if (calibrating) {
      setDraftPoints((points) => (points.length >= 4 ? points : [...points, { x: nx, y: ny }]));
      return;
    }

    if (!data) return;
    const t = videoRef.current?.currentTime ?? 0;
    let hit = -1;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const track of data.tracks) {
      const point = interpolateTrackPoint(track, t);
      if (!point) continue;
      const inBox =
        nx >= point.x - point.w / 2 && nx <= point.x + point.w / 2 &&
        ny >= point.y - point.h && ny <= point.y;
      if (inBox) {
        const dist = Math.hypot(nx - point.x, ny - point.y);
        if (dist < bestDist) {
          bestDist = dist;
          hit = track.id;
        }
      }
    }
    if (hit >= 0) {
      const existing = assignments.find((a) => a.trackId === hit);
      setSelectedTrackId(hit);
      setDraftName(existing?.name ?? "");
      setDraftTeam(existing?.team ?? "A");
    } else {
      setSelectedTrackId(null);
    }
  };

  const saveAssignment = async () => {
    if (selectedTrackId === null) return;
    setBusy(true);
    setError(null);
    try {
      await scoutFetch(`/api/videos/${video.id}/scout/select`, {
        method: "POST",
        body: JSON.stringify({ trackId: selectedTrackId, name: draftName, team: draftTeam }),
      });
      await loadSnapshot();
      setSelectedTrackId(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar el jugador.");
    } finally {
      setBusy(false);
    }
  };

  const saveCalibration = async () => {
    if (draftPoints.length !== 4) return;
    setBusy(true);
    setError(null);
    try {
      await scoutFetch(`/api/videos/${video.id}/scout/calibrate`, {
        method: "POST",
        body: JSON.stringify({ points: draftPoints, court: draftCourt }),
      });
      await loadSnapshot();
      setCalibrating(false);
      setDraftPoints([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo guardar la calibración.");
    } finally {
      setBusy(false);
    }
  };

  const clearCalibration = () => {
    setDraftPoints([]);
  };

  const liveMetrics =
    data && calibration
      ? assignments
          .map((a) => {
            const track = data.tracks.find((t2) => t2.id === a.trackId);
            if (!track) return null;
            const t = currentTime;
            const sliced = { ...track, points: track.points.filter((p) => p.t <= t) };
            return { ...a, metrics: computeTrackMetrics(sliced, calibration.homography, fps) };
          })
          .filter((m): m is ScoutAssignment & { metrics: ReturnType<typeof computeTrackMetrics> } => m !== null)
      : null;

  const videoIsUsable = isLocal || data !== null;

  if (!videoIsUsable) {
    return (
      <div className="border border-hairline bg-surface px-6 py-12 text-center">
        <Radio size={28} strokeWidth={1.5} className="mx-auto mb-4 text-soft" aria-hidden="true" />
        <p className="mx-auto max-w-md text-sm leading-6 text-muted">
          El seguimiento de jugadores requiere un video local (subido o grabado). Los enlaces embebidos no
          pueden procesarse para esta función.
        </p>
        <Button variant="outline" size="sm" className="mt-6" onClick={() => router.push(`/app/videos/${video.id}`)}>
          <ArrowLeft size={14} aria-hidden="true" /> Volver al análisis
        </Button>
      </div>
    );
  }

  if (status === "none") {
    return (
      <div className="border border-hairline bg-surface px-6 py-12 text-center">
        <Radio size={28} strokeWidth={1.5} className="mx-auto mb-4 text-soft" aria-hidden="true" />
        <p className="mx-auto max-w-md text-sm leading-6 text-muted">
          Esta función detecta a cada jugador en el video, lo sigue y permite asignarlo a un equipo para ver sus
          métricas en vivo. El análisis de visión se ejecuta en su computadora.
        </p>
        <Button size="sm" className="mt-6" onClick={startAnalysis} disabled={busy}>
          {busy ? <RefreshCw size={14} className="animate-spin" aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
          {busy ? "Iniciando…" : "Analizar jugadores"}
        </Button>
        {error ? <p className="mt-4 text-sm text-red-900">{error}</p> : null}
      </div>
    );
  }

  if (status === "running") {
    return (
      <div className="border border-hairline bg-surface px-6 py-12 text-center">
        <RefreshCw size={28} strokeWidth={1.5} className="mx-auto mb-4 animate-spin text-soft" aria-hidden="true" />
        <p className="text-sm font-medium text-ink">Analizando jugadores</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">
          Detectando y siguiendo a cada jugador a lo largo del video. Esto puede tomar unos segundos por cada
          tramo. Puede cerrar la página y consultar el progreso luego.
        </p>
        {error ? <p className="mt-4 text-sm text-red-900">{error}</p> : null}
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="border border-hairline bg-surface px-6 py-12 text-center">
        <p className="text-sm font-medium text-ink">El seguimiento no pudo completarse</p>
        <p className="mx-auto mt-2 max-w-md text-sm leading-6 text-muted">{error ?? "Error interno del análisis."}</p>
        <Button variant="outline" size="sm" className="mt-6" onClick={startAnalysis}>
          <RefreshCw size={14} aria-hidden="true" /> Reintentar
        </Button>
      </div>
    );
  }

  const selectedAssignment = assignments.find((a) => a.trackId === selectedTrackId);
  const totalTracks = data?.tracks.length ?? 0;
  const calibrated = calibration !== null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => router.push(`/app/videos/${video.id}`)}>
            <ArrowLeft size={14} aria-hidden="true" /> Análisis
          </Button>
          <span className="label text-muted">
            {totalTracks} {totalTracks === 1 ? "jugador detectado" : "jugadores detectados"}
          </span>
          {data && data.tracks.length > 0 ? (
            <Select
              value={selectedTrackId ?? -1}
              onChange={(event) => setSelectedTrackId(Number(event.target.value))}
              aria-label="Seleccionar jugador"
            >
              <option value={-1}>Seleccionar jugador…</option>
              {data.tracks.map((track) => {
                const name = assignments.find((a) => a.trackId === track.id)?.name ?? `Jugador ${track.id + 1}`;
                return (
                  <option key={track.id} value={track.id}>
                    {name}
                  </option>
                );
              })}
            </Select>
          ) : null}
          {data?.teams ? (
            <span className="label flex items-center gap-1.5 text-muted">
              <span className="size-2" style={{ backgroundColor: `rgb(${data.teams.A.join(",")})` }} aria-hidden="true" />
              Auto A
              <span className="ml-1 size-2" style={{ backgroundColor: `rgb(${data.teams.B.join(",")})` }} aria-hidden="true" />
              Auto B
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {calibrated ? (
            <span className="label text-muted">Cancha calibrada</span>
          ) : null}
          <Button
            variant={calibrating ? "primary" : "outline"}
            size="sm"
            onClick={() => {
              setCalibrating((value) => !value);
              setDraftPoints([]);
            }}
          >
            <Crosshair size={14} aria-hidden="true" /> {calibrating ? "Cancelar" : "Calibrar cancha"}
          </Button>
        </div>
      </div>

      <div
        ref={containerRef}
        className="relative aspect-video w-full overflow-hidden bg-ink"
        onClick={isLocal ? handleVideoClick : undefined}
        role="group"
        aria-label="Video con seguimiento de jugadores"
      >
        {isLocal ? (
          <>
            <video
              ref={videoRef}
              src={mediaUrl}
              controls
              playsInline
              preload="metadata"
              className="absolute inset-0 h-full w-full"
              onTimeUpdate={() => {
                const videoEl = videoRef.current;
                if (!videoEl) return;
                const now = Date.now();
                if (now - tickRef.current > 400) {
                  tickRef.current = now;
                  setCurrentTime(videoEl.currentTime);
                }
              }}
            >
              <p className="p-4 text-sm text-white">Su navegador no puede reproducir este video.</p>
            </video>
            <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden="true" />
          </>
        ) : embedUrl ? (
          <iframe
            src={embedUrl}
            title={`Video fuente: ${video.title}`}
            className="absolute inset-0 h-full w-full"
            loading="lazy"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
            referrerPolicy="strict-origin-when-cross-origin"
            allowFullScreen
          />
        ) : null}
      </div>
      {isDemoYoutube && data ? (
        <div className="flex items-center gap-3">
          <span className="label shrink-0 text-muted">{formatTime(currentTime)}</span>
          <input
            type="range"
            min={0}
            max={demoDuration}
            step={0.2}
            value={Math.min(currentTime, demoDuration)}
            onChange={(event) => setCurrentTime(Number(event.target.value))}
            className="w-full"
            aria-label="Línea de tiempo del análisis de ejemplo"
          />
          <span className="label shrink-0 text-muted">{formatTime(demoDuration)}</span>
        </div>
      ) : null}

      <EventBoard
        video={video}
        calibration={calibration}
        data={data}
        currentTime={currentTime}
        selectedTrackId={selectedTrackId}
        selectedName={selectedAssignment?.name ?? null}
        videoRef={videoRef}
      />

      <div className="flex flex-wrap items-center gap-2">
        <span className="label text-muted">Equipo A</span>
        <span className="h-2.5 w-6" style={{ backgroundColor: TEAM_COLORS.A.stroke }} aria-hidden="true" />
        <span className="label ml-4 text-muted">Equipo B</span>
        <span className="h-2.5 w-6" style={{ backgroundColor: TEAM_COLORS.B.stroke }} aria-hidden="true" />
        <span className="label ml-4 text-muted">Jugador</span>
        <span className="h-2.5 w-6 bg-white/70" aria-hidden="true" />
        <span className="ml-auto label text-muted">Haga clic sobre un jugador para asignarlo</span>
      </div>

      {selectedTrackId !== null ? (
        <section className="border border-hairline bg-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <Users size={16} strokeWidth={1.8} aria-hidden="true" />
            <h3 className="text-sm font-medium text-ink">
              Asignar jugador {selectedTrackId + 1}
              {selectedAssignment ? ` · ${selectedAssignment.name}` : ""}
            </h3>
          </div>
          <div className="grid gap-4 sm:grid-cols-[1fr_160px_auto] sm:items-end">
            <Field label="Nombre del jugador">
              <TextInput
                value={draftName}
                onChange={(event) => setDraftName(event.target.value)}
                placeholder="Ej. Facundo"
                maxLength={60}
              />
            </Field>
            <Field label="Equipo">
              <Select value={draftTeam} onChange={(event) => setDraftTeam(event.target.value as ScoutTeamKey)}>
                <option value="A">Equipo A</option>
                <option value="B">Equipo B</option>
              </Select>
            </Field>
            <Button size="md" disabled={busy || draftName.trim() === ""} onClick={saveAssignment}>
              {busy ? "Guardando…" : "Guardar jugador"}
            </Button>
          </div>
        </section>
      ) : null}

      {(() => {
        const firstTrackId = data?.tracks[0]?.id ?? null;
        const chartTrackId = selectedTrackId ?? firstTrackId;
        const chartAssignment = chartTrackId !== null ? assignments.find((a) => a.trackId === chartTrackId) ?? null : null;
        const chartTrack =
          chartTrackId !== null && data ? data.tracks.find((track) => track.id === chartTrackId) ?? null : null;
        if (!chartTrack || !data || !calibration) return null;
        const playerName = chartAssignment?.name ?? `Jugador ${chartTrack.id + 1}`;
        const chartColor = chartAssignment ? TEAM_COLORS[chartAssignment.team].stroke : TEAM_COLORS.A.stroke;
        return (
          <section aria-label={`Análisis de ${playerName}`}>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-base font-medium text-ink">
                <Users size={17} strokeWidth={1.8} aria-hidden="true" />
                Análisis de {playerName}
              </h2>
            </div>
            <div className="grid gap-5 lg:grid-cols-2">
              <SpeedChart
                track={chartTrack}
                calibration={calibration}
                currentTime={currentTime}
                color={chartColor}
                playerName={playerName}
              />
              <HeatMap
                track={chartTrack}
                calibration={calibration}
                color={chartColor}
                playerName={playerName}
              />
            </div>
          </section>
        );
      })()}

      {calibrating ? (
        <section className="border border-hairline bg-surface p-5">
          <div className="mb-4 flex items-center gap-2">
            <Crosshair size={16} strokeWidth={1.8} aria-hidden="true" />
            <h3 className="text-sm font-medium text-ink">Calibración de cancha</h3>
          </div>
          <p className="mb-4 text-sm leading-6 text-muted">
            Haga clic en 4 esquinas de la cancha en orden: <span className="text-ink">1</span> corta superior,{" "}
            <span className="text-ink">2</span> larga superior, <span className="text-ink">3</span> larga inferior,{" "}
            <span className="text-ink">4</span> corta inferior. Luego indique las dimensiones reales en metros.
          </p>
          <div className="grid gap-4 sm:grid-cols-[120px_120px_auto]" aria-hidden="true">
            <div className="flex items-center gap-2 text-sm text-muted">
              {[1, 2, 3, 4].map((n) => (
                <span
                  key={n}
                  className={`flex size-6 items-center justify-center border text-xs font-semibold ${
                    draftPoints.length >= n ? "border-ink bg-ink text-canvas" : "border-ink/25 text-soft"
                  }`}
                >
                  {n}
                </span>
              ))}
            </div>
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-[160px_160px_auto] sm:items-end">
            <Field label="Ancho (metros)">
              <TextInput
                type="number"
                min={1}
                step={0.01}
                value={draftCourt.width}
                onChange={(event) => setDraftCourt((court) => ({ ...court, width: Number(event.target.value) }))}
              />
            </Field>
            <Field label="Largo (metros)">
              <TextInput
                type="number"
                min={1}
                step={0.01}
                value={draftCourt.height}
                onChange={(event) => setDraftCourt((court) => ({ ...court, height: Number(event.target.value) }))}
              />
            </Field>
            <div className="flex gap-2">
              <Button variant="outline" size="md" onClick={clearCalibration}>
                Limpiar
              </Button>
              <Button size="md" disabled={busy || draftPoints.length !== 4} onClick={saveCalibration}>
                {busy ? "Guardando…" : "Guardar calibración"}
              </Button>
            </div>
          </div>
        </section>
      ) : null}

      {assignments.length > 0 ? (
        <section>
          <div className="mb-4 flex items-center justify-between">
            <h2 className="flex items-center gap-2 text-base font-medium text-ink">
              <Users size={17} strokeWidth={1.8} aria-hidden="true" /> Métricas en vivo
            </h2>
            <span className="label text-muted">
              {assignments.length} {assignments.length === 1 ? "jugador asignado" : "jugadores asignados"}
            </span>
          </div>
          {!calibrated ? (
            <div className="border border-hairline bg-surface px-5 py-6 text-center">
              <p className="text-sm leading-6 text-muted">
                Calibre la cancha (4 esquinas) para convertir píxeles a metros y ver distancia, velocidad y sprints.
              </p>
            </div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2">
              {(liveMetrics ?? []).map(({ trackId, name, team, metrics }) => {
                const color = TEAM_COLORS[team].stroke;
                return (
                  <div key={trackId} className="border border-hairline p-5">
                    <div className="mb-4 flex items-center justify-between gap-2">
                      <span className="flex items-center gap-2 text-sm font-medium text-ink">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
                        {name}
                      </span>
                      <span className="label text-muted">{TEAM_COLORS[team].label}</span>
                    </div>
                    <dl className="grid grid-cols-2 gap-4">
                      <div>
                        <dt className="label text-muted">Distancia</dt>
                        <dd className="mt-1 text-lg font-semibold text-ink">{formatDistance(metrics.distanceM)}</dd>
                      </div>
                      <div>
                        <dt className="label text-muted">Velocidad media</dt>
                        <dd className="mt-1 text-lg font-semibold text-ink">{formatSpeed(metrics.avgSpeedKmh)}</dd>
                      </div>
                      <div>
                        <dt className="label text-muted">Velocidad máxima</dt>
                        <dd className="mt-1 text-lg font-semibold text-ink">{formatSpeed(metrics.maxSpeedKmh)}</dd>
                      </div>
                      <div>
                        <dt className="label text-muted">Sprints</dt>
                        <dd className="mt-1 text-lg font-semibold text-ink">{metrics.sprints}</dd>
                      </div>
                    </dl>
                    <p className="mt-4 text-xs text-soft">Tiempo jugado: {formatTime(metrics.playTimeS)}</p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      ) : null}

      {data && calibration ? (
        <section>
          <div className="mb-3 flex items-center gap-2">
            <BarChart3 size={17} strokeWidth={1.8} aria-hidden="true" />
            <h2 className="text-base font-medium text-ink">Comparativa de jugadores</h2>
          </div>
          <KpiBars tracks={data.tracks} assignments={assignments} calibration={calibration} fps={fps} />
        </section>
      ) : null}

      <CoachAssistant
        playerName={
          selectedTrackId !== null
            ? assignments.find((a) => a.trackId === selectedTrackId)?.name ?? `Jugador ${selectedTrackId + 1}`
            : null
        }
      />

      {error ? <p className="text-sm text-red-900">{error}</p> : null}
    </div>
  );
}