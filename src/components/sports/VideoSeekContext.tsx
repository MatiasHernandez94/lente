"use client";

import { createContext, useCallback, useContext, useMemo, useRef } from "react";
import type { ReactNode } from "react";

/**
 * Permite que cualquier chip con marca de tiempo (insights accionables) salte
 * el video nativo a un segundo exacto. Solo registra `<video>` (upload local);
 * los embeds de YouTube no soportan seek desde el DOM, así que consultar
 * `seekable` para deshabilitar el botón en ese caso.
 */
interface VideoSeekApi {
  register: (element: HTMLVideoElement | null) => void;
  seekTo: (seconds: number) => boolean;
  seekable: boolean;
}

const VideoSeekContext = createContext<VideoSeekApi | null>(null);

export function VideoSeekProvider({ children }: { children: ReactNode }) {
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const register = useCallback((element: HTMLVideoElement | null) => {
    videoRef.current = element;
  }, []);

  const seekTo = useCallback((seconds: number) => {
    const element = videoRef.current;
    if (!element || !Number.isFinite(element.duration)) return false;
    if (seconds < 0 || seconds >= element.duration) return false;
    element.currentTime = Math.min(seconds, element.duration - 0.1);
    return true;
  }, []);

  const value = useMemo<VideoSeekApi>(
    () => ({
      register,
      seekTo,
      get seekable() {
        return videoRef.current != null;
      },
    }),
    [register, seekTo],
  );

  return <VideoSeekContext.Provider value={value}>{children}</VideoSeekContext.Provider>;
}

export function useVideoSeek(): VideoSeekApi {
  const context = useContext(VideoSeekContext);
  if (!context) {
    return {
      register: () => {},
      seekTo: () => false,
      seekable: false,
    };
  }
  return context;
}