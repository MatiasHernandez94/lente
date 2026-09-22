"use client";

import { useState, useRef, useCallback, useEffect } from "react";

interface UseCameraStreamOptions {
  fps?: number;
  quality?: number;
  width?: number;
  height?: number;
}

interface CameraStream {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  streaming: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  getFrame: () => string | null;
}

export function useCameraStream(options: UseCameraStreamOptions = {}): CameraStream {
  const { fps = 5, quality = 0.6, width = 640, height = 480 } = options;
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [streaming, setStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const clearTracks = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTracks();
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  const start = async () => {
    try {
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: width }, height: { ideal: height } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      // Create canvas for frame capture
      canvasRef.current = document.createElement("canvas");
      canvasRef.current.width = width;
      canvasRef.current.height = height;

      setStreaming(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo acceder a la cámara");
    }
  };

  const stop = () => {
    clearTracks();
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setStreaming(false);
  };

  const getFrame = useCallback((): string | null => {
    if (!videoRef.current || !canvasRef.current) return null;

    const ctx = canvasRef.current.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(videoRef.current, 0, 0, canvasRef.current.width, canvasRef.current.height);
    return canvasRef.current.toDataURL("image/jpeg", quality).split(",")[1];
  }, [quality]);

  return { videoRef, streaming, error, start, stop, getFrame };
}
