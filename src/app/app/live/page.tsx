"use client";

import { useState, useRef, useCallback, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Camera, Square, Play, Pause, Settings, Users, Zap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useCameraStream } from "@/lib/hooks/useCameraStream";
import { useLiveAnalysis } from "@/lib/hooks/useLiveAnalysis";
import { LiveOverlay } from "@/components/streaming/LiveOverlay";
import { LiveFeedbackOverlay } from "@/components/streaming/LiveFeedbackOverlay";
import { analyzeLiveDetection, type Feedback } from "@/lib/ai/live-feedback";
import { SPORTS } from "@/lib/sports";
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

export default function LiveAnalysisPage() {
  const router = useRouter();
  const [selectedSport, setSelectedSport] = useState<Sport>("general");
  const [videoId, setVideoId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const frameIdRef = useRef(0);
  const prevDetectionsRef = useRef<Detection[]>([]);

  const { videoRef, streaming: cameraActive, error: cameraError, start: startCamera, stop: stopCamera, getFrame } =
    useCameraStream({ fps: 5, quality: 0.6, width: 640, height: 480 });

  const {
    status: analysisStatus,
    error: analysisError,
    detections,
    fps,
    start: startAnalysis,
    stop: stopAnalysis,
    sendFrame,
  } = useLiveAnalysis({
    videoId: videoId || "",
    onDetection: useCallback((d: Detection) => {
      // Analyze detection for live feedback
      const newFeedback = analyzeLiveDetection(d, selectedSport, prevDetectionsRef.current);
      if (newFeedback) {
        setFeedback(newFeedback);
      }
      prevDetectionsRef.current = [...prevDetectionsRef.current.slice(-20), d];
    }, [selectedSport]),
  });

  // Frame capture loop
  useEffect(() => {
    if (!cameraActive || analysisStatus !== "ready") return;

    const interval = setInterval(() => {
      const frame = getFrame();
      if (frame) {
        sendFrame(frameIdRef.current++, frame);
      }
    }, 200); // 5 fps

    return () => clearInterval(interval);
  }, [cameraActive, analysisStatus, getFrame, sendFrame]);

  const handleStart = async () => {
    // First, create a video record
    try {
      const res = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Análisis en vivo - ${new Date().toLocaleTimeString()}`,
          sport: selectedSport,
          sourceType: "camera",
          sourceRef: null,
          durationSeconds: 120,
          players: [],
        }),
      });
      const { video } = await res.json();
      setVideoId(video.id);

      // Start camera and analysis
      await startCamera();
      await startAnalysis();
    } catch (err) {
      console.error("Failed to start:", err);
    }
  };

  const handleStop = async () => {
    stopCamera();
    await stopAnalysis();
    if (videoId) {
      router.push(`/app/videos/${videoId}`);
    }
  };

  const latestDetection = detections[detections.length - 1] || null;
  const playerCount = latestDetection?.players.length || 0;

  return (
    <div className="max-w-4xl space-y-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink">Análisis en vivo</h1>
        <p className="mt-1 text-sm text-muted">
          Conectá tu cámara para análisis deportivo en tiempo real con YOLOv8
        </p>
      </header>

      {/* Sport selector */}
      <section className="space-y-3">
        <h2 className="text-sm font-medium text-ink">Deporte / Actividad</h2>
        <div className="flex flex-wrap gap-2">
          {SPORTS.map((s) => (
            <button
              key={s.value}
              onClick={() => setSelectedSport(s.value)}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                selectedSport === s.value
                  ? "bg-ink text-white"
                  : "border border-ink/20 text-ink hover:bg-surface"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </section>

      {/* Video preview */}
      <section className="relative bg-black">
        <video
          ref={videoRef}
          className="w-full"
          muted
          playsInline
          autoPlay
        />
        {analysisStatus === "ready" && latestDetection && (
          <LiveOverlay
            width={640}
            height={480}
            detection={latestDetection}
          />
        )}
        {analysisStatus === "ready" && (
          <LiveFeedbackOverlay feedback={feedback} />
        )}
        {!cameraActive && (
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <Camera className="mx-auto mb-3 text-white/50" size={48} />
              <p className="text-sm text-white/50">
                Previsualización de cámara
              </p>
            </div>
          </div>
        )}
      </section>

      {/* Controls */}
      <section className="flex items-center gap-4">
        {!cameraActive ? (
          <Button onClick={handleStart} size="lg">
            <Play size={16} className="mr-2" />
            Iniciar análisis
          </Button>
        ) : (
          <Button onClick={handleStop} size="lg" variant="outline">
            <Square size={16} className="mr-2" />
            Detener y ver resultados
          </Button>
        )}

        {/* Status indicators */}
        <div className="flex items-center gap-4 text-sm">
          {analysisStatus === "ready" && (
            <>
              <div className="flex items-center gap-1.5 text-green-600">
                <Zap size={14} />
                <span>{fps} FPS</span>
              </div>
              <div className="flex items-center gap-1.5 text-muted">
                <Users size={14} />
                <span>{playerCount} jugadores</span>
              </div>
            </>
          )}
          {analysisStatus === "starting" && (
            <span className="text-muted">Iniciando worker...</span>
          )}
        </div>
      </section>

      {/* Errors */}
      {(cameraError || analysisError) && (
        <div className="border border-red-200 bg-red-50 p-3 text-sm text-red-700">
          {cameraError || analysisError}
        </div>
      )}

      {/* Live stats */}
      {detections.length > 0 && (
        <section className="grid grid-cols-3 gap-4">
          <div className="border border-hairline bg-surface p-4">
            <p className="text-xs text-muted">Frames procesados</p>
            <p className="text-2xl font-semibold text-ink">{detections.length}</p>
          </div>
          <div className="border border-hairline bg-surface p-4">
            <p className="text-xs text-muted">Jugadores detectados</p>
            <p className="text-2xl font-semibold text-ink">{playerCount}</p>
          </div>
          <div className="border border-hairline bg-surface p-4">
            <p className="text-xs text-muted">Latencia</p>
            <p className="text-2xl font-semibold text-ink">
              {fps > 0 ? `${Math.round(1000 / fps)}ms` : "—"}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
