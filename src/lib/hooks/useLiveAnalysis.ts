"use client";

import { useState, useRef, useCallback, useEffect } from "react";

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

interface UseLiveAnalysisOptions {
  videoId: string;
  onDetection?: (detection: Detection) => void;
}

interface LiveAnalysisState {
  status: "idle" | "starting" | "ready" | "processing" | "error";
  sessionId: string | null;
  error: string | null;
  detections: Detection[];
  fps: number;
}

export function useLiveAnalysis(options: UseLiveAnalysisOptions) {
  const { videoId, onDetection } = options;
  const [state, setState] = useState<LiveAnalysisState>({
    status: "idle",
    sessionId: null,
    error: null,
    detections: [],
    fps: 0,
  });

  const frameCountRef = useRef(0);
  const lastFpsTimeRef = useRef(Date.now());
  const eventSourceRef = useRef<EventSource | null>(null);
  const onDetectionRef = useRef(onDetection);
  onDetectionRef.current = onDetection;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      eventSourceRef.current?.close();
    };
  }, []);

  const start = useCallback(async () => {
    try {
      setState((prev) => ({ ...prev, status: "starting", error: null }));

      const res = await fetch(`/api/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "start", videoId }),
      });

      if (!res.ok) throw new Error("No se pudo iniciar el streaming");

      const { sessionId } = await res.json();

      setState((prev) => ({ ...prev, sessionId, status: "ready" }));

      // Start SSE listener for detections
      const eventSource = new EventSource(`/api/stream/${sessionId}`);
      eventSourceRef.current = eventSource;

      eventSource.onmessage = (event) => {
        try {
          const detection = JSON.parse(event.data) as Detection;
          setState((prev) => ({
            ...prev,
            detections: [...prev.detections.slice(-50), detection], // Keep last 50
          }));
          onDetectionRef.current?.(detection);

          // Calculate FPS
          frameCountRef.current++;
          const now = Date.now();
          if (now - lastFpsTimeRef.current >= 1000) {
            setState((prev) => ({ ...prev, fps: frameCountRef.current }));
            frameCountRef.current = 0;
            lastFpsTimeRef.current = now;
          }
        } catch {
          // Ignore parse errors
        }
      };

      eventSource.onerror = () => {
        setState((prev) => ({ ...prev, status: "error", error: "Conexión perdida" }));
      };
    } catch (err) {
      setState((prev) => ({
        ...prev,
        status: "error",
        error: err instanceof Error ? err.message : "Error desconocido",
      }));
    }
  }, [videoId]);

  const stop = useCallback(async () => {
    eventSourceRef.current?.close();
    eventSourceRef.current = null;

    if (state.sessionId) {
      await fetch(`/api/stream`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "stop", videoId }),
      });
    }

    setState({
      status: "idle",
      sessionId: null,
      error: null,
      detections: [],
      fps: 0,
    });
  }, [videoId, state.sessionId]);

  const sendFrame = useCallback(
    async (frameId: number, imageBase64: string) => {
      if (!state.sessionId || state.status !== "ready") return;

      await fetch(`/api/stream/${state.sessionId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ frameId, image: imageBase64 }),
      });
    },
    [state.sessionId, state.status],
  );

  return {
    ...state,
    start,
    stop,
    sendFrame,
  };
}
