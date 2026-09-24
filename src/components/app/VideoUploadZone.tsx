"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, SquarePlay, Circle, Square, LoaderCircle } from "lucide-react";
import type { SourceType } from "@/lib/analysis/types";
import { Button } from "@/components/ui/Button";
import { Field, TextInput } from "@/components/ui/Field";
import { uploadVideoFile } from "@/lib/videos/client";

const SOURCES: { value: SourceType; label: string; hint: string; icon: typeof Camera }[] = [
  { value: "upload", label: "Subir archivo", hint: "MP4, WebM o MOV · máx. 250 MB", icon: Upload },
  { value: "youtube", label: "URL de YouTube", hint: "Pegá un enlace público", icon: SquarePlay },
  { value: "camera", label: "Cámara en vivo", hint: "Grabá desde tu cámara web", icon: Camera },
];

const RECORDING_MIME = "video/webm;codecs=vp9";

function deriveTitle(file: File): string {
  return file.name
    .replace(/\.[^.]+$/, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function useCameraRecording(onBlob: (blob: Blob | null) => void) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const mediaRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [recording, setRecording] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const clearTracks = () => {
    mediaRef.current?.getTracks().forEach((track) => track.stop());
    mediaRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
  };

  useEffect(() => {
    return () => {
      clearTracks();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  const start = async () => {
    try {
      clearTracks();
      setError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 1280 }, height: { ideal: 720 } },
        audio: false,
      });
      mediaRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      const mimeType = MediaRecorder.isTypeSupported(RECORDING_MIME) ? RECORDING_MIME : "video/webm";
      const recorder = new MediaRecorder(stream, { mimeType, videoBitsPerSecond: 2_500_000 });
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onBlob(blob.size > 0 ? blob : null);
        clearTracks();
      };
      recorder.start(500);
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((v) => v + 1), 1000);
    } catch {
      setError("No se pudo acceder a la cámara. Verificá permisos o elegí otra fuente.");
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  };

  return { videoRef, recording, elapsed, error, start, stop };
}

export function VideoUploadZone() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [source, setSource] = useState<SourceType>("upload");
  const [ytUrl, setYtUrl] = useState("");
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [cameraBlob, setCameraBlob] = useState<Blob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onBlob = (blob: Blob | null) => {
    setCameraBlob(blob);
    if (!blob) setError("La grabación quedó vacía. Intentá de nuevo.");
  };
  const { videoRef, recording, elapsed, error: cameraError, start, stop } = useCameraRecording(onBlob);

  const isCamera = source === "camera";
  const isUpload = source === "upload";

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setUploadedFile(file);
    setError(null);
  };

  const uploadFile = async (): Promise<string> => {
    const file = isCamera ? cameraBlob : uploadedFile;
    if (!file) {
      throw new Error(isCamera ? "Grabá un segmento antes de continuar." : "Seleccioná un archivo de video.");
    }
    const uploadFileArg = isCamera ? new File([file], "camara.webm", { type: file.type || "video/webm" }) : uploadedFile!;
    return uploadVideoFile(uploadFileArg);
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      let sourceRef: string | null = null;
      let title = "Video sin título";
      const isYt = source === "youtube";

      if (isYt) {
        if (!/^https?:\/\/(www\.)?youtu(\.be|be\.com)\//.test(ytUrl.trim())) {
          throw new Error("La URL de YouTube no es válida.");
        }
        sourceRef = ytUrl.trim();
        title = "Video de YouTube";
      } else {
        sourceRef = await uploadFile();
        title = uploadedFile ? deriveTitle(uploadedFile) : "Video grabado";
      }

      const createRes = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          sport: "general",
          sourceType: source,
          sourceRef,
          durationSeconds: 1800,
          players: [],
        }),
      });
      const created = (await createRes.json()) as { video?: { id: string }; error?: string };
      if (!createRes.ok || !created.video) {
        throw new Error(created.error ?? "El video no se pudo registrar.");
      }

      const analyzeRes = await fetch(`/api/videos/${created.video.id}/analizar`, { method: "POST" });
      if (!analyzeRes.ok) {
        const err = (await analyzeRes.json()) as { error?: string };
        throw new Error(err.error ?? "El análisis no se completó.");
      }

      // Auto-trigger sports analysis in background (YOLOv8)
      fetch(`/api/videos/${created.video.id}/sports`, { method: "POST" }).catch(() => {});

      router.push(`/app/videos/${created.video.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar el análisis.");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-8" noValidate>
      {/* Source selector */}
      <section className="space-y-4">
        <h2 className="text-base font-medium text-ink">¿Cómo querés subir tu video?</h2>
        <div className="grid grid-cols-3 gap-px border border-hairline bg-hairline">
          {SOURCES.map(({ value, label, hint, icon: Icon }) => (
            <label
              key={value}
              className={`cursor-pointer bg-canvas px-4 py-5 transition-colors hover:bg-surface ${
                source === value ? "ring-inset ring-1 ring-ink" : ""
              }`}
            >
              <input
                type="radio"
                name="source"
                value={value}
                checked={source === value}
                onChange={() => setSource(value)}
                className="sr-only"
              />
              <Icon size={20} strokeWidth={1.6} className="mb-2 text-ink" aria-hidden="true" />
              <span className="block text-sm font-medium text-ink">{label}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-soft">{hint}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Source-specific input */}
      <section className="min-h-[200px] border border-hairline bg-surface">
        {isUpload && (
          <div className="p-5">
            <input
              ref={fileInputRef}
              type="file"
              accept="video/mp4,video/webm,video/quicktime"
              onChange={handleFileChange}
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="flex w-full flex-col items-center justify-center gap-2 border border-dashed border-ink/20 bg-canvas px-6 py-12 transition-colors hover:border-ink"
            >
              <Upload size={28} strokeWidth={1.5} aria-hidden="true" />
              <span className="text-sm font-medium text-ink">
                {uploadedFile ? uploadedFile.name : "Arrastrá un video o hacé clic acá"}
              </span>
              <span className="text-[11px] text-soft">
                {uploadedFile
                  ? `${(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB listo para analizar`
                  : "MP4 · WebM · MOV · hasta 250 MB"}
              </span>
            </button>
          </div>
        )}

        {source === "youtube" && (
          <div className="p-5">
            <Field label="Pegá la URL del video">
              <TextInput
                value={ytUrl}
                onChange={(e) => setYtUrl(e.target.value)}
                type="url"
                placeholder="https://youtu.be/… o …/watch?v=…"
              />
            </Field>
          </div>
        )}

        {isCamera && (
          <div className="flex h-full flex-col justify-between p-5">
            <div className="relative aspect-video overflow-hidden bg-ink">
              <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
              {!recording && !elapsed && (
                <div className="absolute inset-0 flex items-center justify-center">
                  <p className="label text-white/70">Vista previa de la cámara</p>
                </div>
              )}
              {recording && (
                <span className="label absolute top-3 left-3 flex animate-pulse items-center gap-1.5 rounded-sm bg-white/10 px-2 py-1 text-white">
                  <span className="size-1.5 rounded-full bg-red-600" aria-hidden="true" /> REC
                </span>
              )}
            </div>
            {cameraBlob && (
              <p className="mt-3 text-sm text-muted">
                Segmento grabado listo{elapsed > 0 ? ` (${elapsed}s)` : ""}
              </p>
            )}
            <div className="mt-4 flex items-center gap-3">
              {!recording ? (
                <Button type="button" size="sm" variant="outline" onClick={() => void start()}>
                  <Circle size={14} strokeWidth={2} aria-hidden="true" /> Grabar segmento
                </Button>
              ) : (
                <Button type="button" size="sm" variant="primary" onClick={stop}>
                  <Square size={14} strokeWidth={2} aria-hidden="true" /> Detener ({elapsed}s)
                </Button>
              )}
            </div>
            {cameraError && <p className="mt-3 text-sm text-red-900">{cameraError}</p>}
          </div>
        )}
      </section>

      {/* Error */}
      {error && (
        <p role="alert" className="border border-red-900/30 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      )}

      {/* Submit */}
      <div className="flex items-center gap-4">
        <Button type="submit" size="lg" disabled={isSubmitting || (!uploadedFile && !cameraBlob && !ytUrl)}>
          {isSubmitting ? (
            <span className="inline-flex items-center gap-2">
              <LoaderCircle size={16} className="animate-spin" /> Analizando…
            </span>
          ) : (
            "Analizar video"
          )}
        </Button>
        <p className="text-xs leading-5 text-soft">
          Podés editar título y deporte después del análisis.
        </p>
      </div>
    </form>
  );
}
