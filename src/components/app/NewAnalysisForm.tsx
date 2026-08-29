"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, Upload, SquarePlay, Circle, Square, Plus, X } from "lucide-react";
import type { SourceType, Sport } from "@/lib/analysis/types";
import { Button } from "@/components/ui/Button";
import { Field, TextInput, Select } from "@/components/ui/Field";
import { SPORTS } from "@/lib/sports";

const SOURCES: { value: SourceType; label: string; hint: string; icon: typeof Camera }[] = [
  { value: "camera", label: "Cámara en vivo", hint: "Grabación desde su cámara web", icon: Camera },
  { value: "upload", label: "Subir archivo", hint: "MP4, WebM o MOV · máx. 250 MB", icon: Upload },
  { value: "youtube", label: "URL de YouTube", hint: "Detección por enlace público", icon: SquarePlay },
];

const DEFAULT_MINUTES: Record<Sport, number> = {
  futbol: 90,
  padel: 100,
  voleibol: 120,
  baloncesto: 96,
};

const RECORDING_MIME = "video/webm;codecs=vp9";

const MAX_PLAYERS = 20;

interface CameraHook {
  videoRef: React.RefObject<HTMLVideoElement | null>;
  recording: boolean;
  elapsed: number;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
}

function useCameraRecording(onBlob: (blob: Blob | null) => void): CameraHook {
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
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
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

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        onBlob(blob.size > 0 ? blob : null);
        clearTracks();
      };

      recorder.start(500);
      setRecording(true);
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed((value) => value + 1), 1000);
    } catch {
      setError("No se pudo acceder a la cámara. Verifique permisos o elija otra fuente.");
    }
  };

  const stop = () => {
    recorderRef.current?.stop();
    recorderRef.current = null;
    setRecording(false);
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  return { videoRef, recording, elapsed, error, start, stop };
}

export function NewAnalysisForm() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const [sport, setSport] = useState<Sport>("futbol");
  const [title, setTitle] = useState("");
  const [source, setSource] = useState<SourceType>("camera");
  const [ytUrl, setYtUrl] = useState("");
  const [durationMinutes, setDurationMinutes] = useState(DEFAULT_MINUTES.futbol);

  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [cameraBlob, setCameraBlob] = useState<Blob | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [players, setPlayers] = useState<string[]>([]);
  const [playerName, setPlayerName] = useState("");
  const [playerError, setPlayerError] = useState<string | null>(null);

  const addPlayer = () => {
    const name = playerName.trim();
    if (!name) {
      setPlayerError("Ingrese el nombre del jugador.");
      return;
    }
    if (players.some((existing) => existing.toLowerCase() === name.toLowerCase())) {
      setPlayerError("Ese jugador ya fue agregado.");
      return;
    }
    if (players.length >= MAX_PLAYERS) {
      setPlayerError(`Máximo ${MAX_PLAYERS} jugadores por análisis.`);
      return;
    }
    setPlayers((current) => [...current, name]);
    setPlayerName("");
    setPlayerError(null);
  };

  const removePlayer = (name: string) => {
    setPlayers((current) => current.filter((existing) => existing !== name));
  };

  const onBlob = (blob: Blob | null) => {
    setCameraBlob(blob);
    if (!blob) setError("La grabación quedó vacía. Intente nuevamente.");
  };
  const { videoRef, recording, elapsed, error: cameraError, start, stop } = useCameraRecording(onBlob);

  const isCamera = source === "camera";
  const isUpload = source === "upload";

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setUploadedFile(file);
    setError(null);
  };

  const uploadCurrentFile = async (): Promise<string> => {
    const file = isCamera ? cameraBlob : uploadedFile;
    if (!file) {
      throw new Error(isCamera ? "Grabe un segmento antes de continuar." : "Adjunte un archivo de video.");
    }

    const formData = new FormData();
    const fileName = isCamera ? "camara.webm" : uploadedFile?.name ?? "video.webm";
    formData.append("file", file, fileName);
    const response = await fetch("/api/upload", { method: "POST", body: formData });
    const body = (await response.json()) as { file?: string; error?: string };
    if (!response.ok || !body.file) {
      throw new Error(body.error ?? "La subida no se completó.");
    }
    return body.file;
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      let sourceRef: string | null = null;
      const isYt = source === "youtube";

      if (isYt) {
        if (!/^https?:\/\/(www\.)?youtu(\.be|be\.com)\//.test(ytUrl.trim())) {
          throw new Error("La URL de YouTube no es válida.");
        }
        sourceRef = ytUrl.trim();
      } else {
        sourceRef = await uploadCurrentFile();
      }

      const createResponse = await fetch("/api/videos", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          sport,
          sourceType: source,
          sourceRef,
          durationSeconds: Math.max(120, Math.round(durationMinutes * 60)),
          players,
        }),
      });
      const created = (await createResponse.json()) as { video?: { id: string }; error?: string };
      if (!createResponse.ok || !created.video) {
        throw new Error(created.error ?? "El video no se pudo registrar.");
      }

      const analyzeResponse = await fetch(`/api/videos/${created.video.id}/analizar`, { method: "POST" });
      const analyzed = (await analyzeResponse.json()) as { error?: string };
      if (!analyzeResponse.ok) {
        throw new Error(analyzed.error ?? "El análisis no se completó.");
      }

      router.push(`/app/videos/${created.video.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "No se pudo completar el análisis.");
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="max-w-2xl space-y-10" noValidate>
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-ink">01 · Deporte</h2>
          <span className="label text-muted">Seleccione una disciplina</span>
        </div>
        <div className="grid grid-cols-2 gap-px border border-hairline bg-hairline lg:grid-cols-4">
          {SPORTS.map((item) => (
            <label
              key={item.value}
              className={`relative cursor-pointer bg-canvas px-4 py-4 transition-colors hover:bg-surface ${
                sport === item.value ? "ring-inset ring-1 ring-ink" : ""
              }`}
            >
              <input
                type="radio"
                name="sport"
                value={item.value}
                checked={sport === item.value}
                onChange={() => {
                  setSport(item.value);
                  setDurationMinutes(DEFAULT_MINUTES[item.value]);
                }}
                className="sr-only"
              />
              {sport === item.value ? (
                <span aria-hidden="true" className="label absolute top-3 right-3 text-ink">
                  Seleccionado
                </span>
              ) : null}
              <span className="block text-sm font-medium text-ink">{item.label}</span>
              <span className="mt-1 block text-[11px] leading-4 text-soft">{item.description}</span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-ink">02 · Título</h2>
          <span className="label text-muted">Identifique el material</span>
        </div>
        <TextInput
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Ej.: Final de liga — partido de ida"
          required
          minLength={3}
          maxLength={120}
        />
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-ink">03 · Fuente del video</h2>
          <span className="label text-muted">Cámara · archivo · detección</span>
        </div>

        <div className="grid grid-cols-3 gap-px border border-hairline bg-hairline">
          {SOURCES.map(({ value, label, hint, icon: Icon }) => (
            <label
              key={value}
              className={`cursor-pointer bg-canvas px-4 py-4 transition-colors hover:bg-surface ${
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
              <Icon size={18} strokeWidth={1.6} className="mb-2 text-ink" aria-hidden="true" />
              <span className="block text-sm font-medium text-ink">{label}</span>
              <span className="mt-0.5 block text-[11px] leading-4 text-soft">{hint}</span>
            </label>
          ))}
        </div>

        <div className="min-h-[240px] border border-hairline bg-surface">
          {isCamera ? (
            <div className="flex h-full flex-col justify-between p-5">
              <div className="relative aspect-video overflow-hidden bg-ink">
                <video ref={videoRef} className="h-full w-full object-cover" muted playsInline />
                {!recording && !elapsed ? (
                  <div className="absolute inset-0 flex items-center justify-center">
                    <p className="label text-white/70">Vista previa de la cámara</p>
                  </div>
                ) : null}
                {recording ? (
                  <span className="label absolute top-3 left-3 flex animate-pulse items-center gap-1.5 rounded-sm bg-white/10 px-2 py-1 text-white">
                    <span className="size-1.5 rounded-full bg-red-600" aria-hidden="true" /> REC
                  </span>
                ) : null}
              </div>

              {cameraBlob ? (
                <p className="mt-3 text-sm text-muted">
                  Segmento grabado listo para analizar
                  {elapsed > 0 ? ` (${elapsed}s)` : ""}.
                </p>
              ) : null}

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
              {cameraError ? <p className="mt-3 text-sm text-red-900">{cameraError}</p> : null}
            </div>
          ) : null}

          {isUpload ? (
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
                className="flex w-full flex-col items-center justify-center gap-2 border border-dashed border-ink/20 bg-canvas px-6 py-10 transition-colors hover:border-ink"
              >
                <Upload size={22} strokeWidth={1.6} aria-hidden="true" />
                <span className="text-sm font-medium text-ink">
                  {uploadedFile ? uploadedFile.name : "Seleccione un archivo de video"}
                </span>
                <span className="text-[11px] text-soft">
                  {uploadedFile
                    ? `${(uploadedFile.size / (1024 * 1024)).toFixed(1)} MB`
                    : "MP4 · WebM · MOV · hasta 250 MB"}
                </span>
              </button>
            </div>
          ) : null}

          {source === "youtube" ? (
            <div className="p-5">
              <Field label="URL del video en YouTube">
                <TextInput
                  value={ytUrl}
                  onChange={(event) => setYtUrl(event.target.value)}
                  type="url"
                  placeholder="https://youtu.be/… o …/watch?v=…"
                />
              </Field>
              <p className="mt-3 text-xs leading-5 text-soft">
                La URL se registra como referencia; el análisis se ejecuta sobre los metadatos del{" "}
                <span className="text-muted">material detectado</span>. Los videos privados requieren otra fuente.
              </p>
            </div>
          ) : null}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-ink">04 · Jugadores</h2>
          <span className="label text-muted">Opcional · 1 a 20</span>
        </div>

        <div className="border border-hairline bg-surface p-5">
          <p className="mb-4 text-sm leading-6 text-muted">
            Registre los jugadores que quiere seguir. Para cada uno se genera un mapa de calor, el
            desplazamiento total recorrido, la velocidad y sus indicadores propios del deporte.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <div className="flex-1">
              <TextInput
                value={playerName}
                onChange={(event) => {
                  setPlayerName(event.target.value);
                  setPlayerError(null);
                }}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    addPlayer();
                  }
                }}
                placeholder="Nombre del jugador"
                maxLength={60}
                aria-label="Nombre del jugador"
              />
            </div>
            <Button type="button" size="md" variant="outline" onClick={addPlayer}>
              <Plus size={15} strokeWidth={2} aria-hidden="true" /> Añadir jugador
            </Button>
          </div>

          {playerError ? <p className="mt-3 text-sm text-red-900">{playerError}</p> : null}

          {players.length > 0 ? (
            <ul className="mt-4 border-t border-hairline pt-4">
              {players.map((name, index) => (
                <li
                  key={name}
                  className="flex items-center justify-between gap-3 border-b border-hairline py-3 last:border-b-0"
                >
                  <span className="text-sm text-ink">
                    <span className="label mr-3 text-muted">{String(index + 1).padStart(2, "0")}</span>
                    {name}
                  </span>
                  <button
                    type="button"
                    onClick={() => removePlayer(name)}
                    aria-label={`Quitar a ${name}`}
                    className="cursor-pointer text-soft transition-colors hover:text-ink"
                  >
                    <X size={16} strokeWidth={1.8} aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-xs leading-5 text-soft">
              Si no agrega jugadores, el análisis se enfocará únicamente en el rendimiento general del
              material.
            </p>
          )}
        </div>
      </section>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-medium text-ink">05 · Duración estimada</h2>
          <span className="label text-muted">En minutos</span>
        </div>
        <Field label="Minutos de juego" hint="Define la escala por partido o set del análisis.">
          <Select
            value={durationMinutes}
            onChange={(event) => setDurationMinutes(Number(event.target.value))}
            aria-label="Duración estimada en minutos"
          >
            {Array.from({ length: 59 }, (_, index) => (index + 4) * 2)
              .map((minutes) => (
                <option key={minutes} value={minutes}>
                  {minutes} min
                </option>
              ))}
          </Select>
        </Field>
      </section>

      {error ? (
        <p role="alert" className="border border-red-900/30 bg-red-50 px-4 py-3 text-sm text-red-900">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Analizando video…" : "Iniciar análisis"}
        </Button>
        <p className="text-xs leading-5 text-soft">
          El análisis de esta iteración se genera con un modelo de ejemplo sobre el material registrado.
        </p>
      </div>
    </form>
  );
}