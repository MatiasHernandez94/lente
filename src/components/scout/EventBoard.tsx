"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Target, Trash2, X } from "lucide-react";
import type { RefObject } from "react";
import type { VideoRow } from "@/lib/schema";
import type { ScoutCalibration, ScoutResultData } from "@/lib/scout/types";
import { applyHomography, interpolateTrackPoint } from "@/lib/scout/geom";
import { TEAM_COLORS } from "@/lib/scout/colors";
import { BasketballCourtSvg, FootballPitchSvg } from "./courts";
import {
  courtBounds,
  EVENT_TYPES_BY_SPORT,
  eventLabel,
  supportsRealCourt,
} from "@/lib/events/meta";
import type { EventType, EventsTeam, VideoEvent } from "@/lib/events/meta";
import { Button } from "@/components/ui/Button";
import { Field, Select, TextInput } from "@/components/ui/Field";

interface EventBoardProps {
  video: VideoRow;
  calibration: ScoutCalibration | null;
  data: ScoutResultData | null;
  currentTime: number;
  selectedTrackId: number | null;
  selectedName: string | null;
  videoRef: RefObject<HTMLVideoElement | null>;
}

function formatSeconds(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.round(seconds % 60);
  return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
}

export function EventBoard({
  video,
  calibration,
  data,
  currentTime,
  selectedTrackId,
  selectedName,
  videoRef,
}: EventBoardProps) {
  const bounds = courtBounds(video.sport);
  const realistic = supportsRealCourt(video.sport);
  const boardRef = useRef<HTMLDivElement>(null);

  const [events, setEvents] = useState<VideoEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [formTeam, setFormTeam] = useState<EventsTeam>("A");
  const [formPlayer, setFormPlayer] = useState("");
  const [formType, setFormType] = useState<EventType>(EVENT_TYPES_BY_SPORT[video.sport][0]);
  const [formPoints, setFormPoints] = useState<2 | 3>(2);
  const [formPos, setFormPos] = useState<{ x: number; y: number } | null>(null);
  const [formTime, setFormTime] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [boardError, setBoardError] = useState<string | null>(null);

  const types = EVENT_TYPES_BY_SPORT[video.sport];
  const asksPoints = video.sport === "baloncesto" && (formType === "made" || formType === "missed");

  const loadEvents = useCallback(async () => {
    const res = await fetch(`/api/videos/${video.id}/events`);
    if (!res.ok) return;
    const body = (await res.json()) as { events?: VideoEvent[] };
    setEvents(body.events ?? []);
  }, [video.id]);

useEffect(() => {
  let active = true;
  fetch(`/api/videos/${video.id}/events`)
    .then((res) => (res.ok ? res.json() : null))
    .then((body) => {
      if (active && body) setEvents((body as { events?: VideoEvent[] }).events ?? []);
    })
    .catch(() => undefined);
  return () => {
    active = false;
  };
}, [video.id]);

  const playerWorldPos = useMemo(() => {
    if (!data || selectedTrackId === null || !calibration) return null;
    const track = data.tracks.find((track) => track.id === selectedTrackId);
    if (!track) return null;
    const point = interpolateTrackPoint(track, currentTime);
    if (!point) return null;
    const world = applyHomography(calibration.homography, point.x, point.y);
    if (!Number.isFinite(world.x) || !Number.isFinite(world.y)) return null;
    return { x: world.x, y: world.y };
  }, [data, selectedTrackId, calibration, currentTime]);

  const seekTo = (t: number) => {
    const element = videoRef.current;
    if (!element) return;
    element.currentTime = Math.max(0, t);
    setSelectedEventId(null);
  };

  const handleCourtClick = (event: React.MouseEvent<HTMLDivElement>) => {
    const element = boardRef.current;
    if (!element) return;
    const rect = element.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * bounds.width;
    const y = ((event.clientY - rect.top) / rect.height) * bounds.height;
    setFormPos({ x: Math.min(Math.max(x, 0), bounds.width), y: Math.min(Math.max(y, 0), bounds.height) });
    setFormTime(Math.round(currentTime * 10) / 10);
    if (!showForm) setShowForm(true);
  };

  const openForm = () => {
    setFormPos(playerWorldPos ?? null);
    setFormTime(Math.round(currentTime * 10) / 10);
    setFormType(EVENT_TYPES_BY_SPORT[video.sport][0]);
    setBoardError(null);
    setShowForm(true);
  };

  const submitEvent = async () => {
    if (!formPos) {
      setBoardError("Haga clic sobre la cancha para marcar el lugar de la jugada.");
      return;
    }
    setSubmitting(true);
    setBoardError(null);
    try {
      const res = await fetch(`/api/videos/${video.id}/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          team: formTeam,
          player: formPlayer,
          eventType: formType,
          x: Math.round(formPos.x * 100) / 100,
          y: Math.round(formPos.y * 100) / 100,
          t: formTime,
          points: asksPoints ? formPoints : null,
        }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? "No se pudo guardar el evento.");
      }
      await loadEvents();
      setShowForm(false);
      setFormPlayer("");
    } catch (error) {
      setBoardError(error instanceof Error ? error.message : "No se pudo guardar el evento.");
    } finally {
      setSubmitting(false);
    }
  };

  const removeEvent = async (eventId: string) => {
    await fetch(`/api/videos/${video.id}/events/${eventId}`, { method: "DELETE" });
    setSelectedEventId(null);
    await loadEvents();
  };

  const pointsByTeam = {
    A: events
      .filter((event) => event.team === "A" && event.eventType === "made")
      .reduce((sum, event) => sum + (event.points ?? 2), 0),
    B: events
      .filter((event) => event.team === "B" && event.eventType === "made")
      .reduce((sum, event) => sum + (event.points ?? 2), 0),
  };
  const countByType = (team: EventsTeam, type: EventType) =>
    events.filter((event) => event.team === team && event.eventType === type).length;

  const markerClass = (event: VideoEvent) => {
    const teamColor = TEAM_COLORS[event.team].stroke;
    if (event.eventType === "made") {
      return { bg: teamColor, shape: "rounded-full" };
    }
    if (event.eventType === "missed") {
      return { bg: "transparent", shape: "rounded-full" };
    }
    if (event.eventType === "assist") {
      return { bg: teamColor, shape: "rotate-45" };
    }
    return { bg: "rgba(255,255,255,0.85)", shape: "rounded-full" };
  };

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-base font-medium text-ink">
          <Target size={17} strokeWidth={1.8} aria-hidden="true" /> Gráfica del partido
          <span className="label text-muted">{events.length} {events.length === 1 ? "jugada" : "jugadas"}</span>
        </h2>
        <div className="flex items-center gap-2 label text-muted">
          <span className="flex items-center gap-1.5"><span className="size-2.5" style={{ background: TEAM_COLORS.A.stroke }} aria-hidden="true" /> A</span>
          <span className="flex items-center gap-1.5"><span className="size-2.5" style={{ background: TEAM_COLORS.B.stroke }} aria-hidden="true" /> B · {pointsByTeam.A}–{pointsByTeam.B}</span>
        </div>
      </div>

      {!calibration ? (
        <p className="mb-4 text-xs text-soft">
          Sin calibración de cancha, las posiciones se marcan manualmente sobre el dibujo.
        </p>
      ) : null}

      <div className="border border-hairline bg-surface p-4">
        <div className="flex items-start gap-4 md:gap-6">
          <div className="min-w-0 flex-1">
            <div
              ref={boardRef}
              onClick={handleCourtClick}
              className="relative mx-auto w-full cursor-crosshair text-[#8a93a5]"
              style={{ aspectRatio: `${bounds.width} / ${bounds.height}`, maxWidth: Math.round(bounds.width * 14) }}
              role="group"
              aria-label="Cancha con marcadores de jugadas"
            >
              <div className="absolute inset-0">
                {realistic && video.sport === "baloncesto" ? <BasketballCourtSvg /> : null}
                {realistic && video.sport === "futbol" ? <FootballPitchSvg /> : null}
              </div>
              {!realistic ? (
                <div className="absolute inset-0 flex items-center justify-center">
                  <span className="label text-soft">Mapa de {video.sport}</span>
                </div>
              ) : null}
              {events.map((event) => {
                const style = markerClass(event);
                const left = (event.x / bounds.width) * 100;
                const top = (event.y / bounds.height) * 100;
                const selected = event.id === selectedEventId;
                return (
                  <button
                    key={event.id}
                    type="button"
                    onClick={(clickEvent) => {
                      clickEvent.stopPropagation();
                      setSelectedEventId(event.id);
                      seekTo(event.t);
                    }}
                    className={`absolute -translate-x-1/2 -translate-y-1/2 ${style.shape} ${selected ? "z-10" : "z-0"}`}
                    style={{
                      left: `${left}%`,
                      top: `${top}%`,
                      width: 18,
                      height: 18,
                      backgroundColor: style.bg,
                      border: `2px solid ${TEAM_COLORS[event.team].stroke}`,
                      boxShadow: selected ? `0 0 0 3px ${TEAM_COLORS[event.team].stroke}` : `0 1px 3px rgba(0,0,0,0.4)`,
                    }}
                    aria-label={`${eventLabel(video.sport, event.eventType)} ${formatSeconds(event.t)}`}
                  >
                    {event.points ? (
                      <span className="flex h-full items-center justify-center text-[9px] font-bold text-canvas">
                        {event.points}
                      </span>
                    ) : null}
                  </button>
                );
              })}
              <span className="pointer-events-none absolute bottom-2 left-1/2 -translate-x-1/2 label whitespace-nowrap text-soft">
                Haga clic en la cancha para marcar la jugada
              </span>
            </div>
          </div>

          <div className="hidden w-72 shrink-0 flex-col gap-2 sm:flex">
            <h3 className="label text-muted">Jugadas registradas</h3>
            {events.length === 0 ? (
              <p className="text-xs leading-5 text-soft">
                Registre dónde ocurrió cada jugada y vuelva a verlas con un clic.
              </p>
            ) : (
              <ol className="max-h-64 space-y-1 overflow-y-auto pr-1">
                {events.map((event) => (
                  <li key={event.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedEventId(event.id);
                        seekTo(event.t);
                      }}
                      className={`flex w-full items-center gap-2 border px-2.5 py-1.5 text-left text-xs transition-colors ${
                        event.id === selectedEventId ? "border-ink bg-canvas" : "border-hairline bg-canvas hover:border-ink/40"
                      }`}
                    >
                      <span className="size-2 shrink-0 rounded-full" style={{ backgroundColor: TEAM_COLORS[event.team].stroke }} aria-hidden="true" />
                      <span className="min-w-0 flex-1 truncate">
                        {eventLabel(video.sport, event.eventType)}
                        {event.points ? ` (${event.points})` : ""}
                        {event.player ? ` · ${event.player}` : ""}
                      </span>
                      <span className="shrink-0 label text-muted">{formatSeconds(event.t)}</span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(itemEvent) => {
                          itemEvent.stopPropagation();
                          removeEvent(event.id).catch(() => undefined);
                        }}
                        onKeyDown={(itemEvent) => {
                          if (itemEvent.key === "Enter" || itemEvent.key === " ") {
                            itemEvent.preventDefault();
                            removeEvent(event.id).catch(() => undefined);
                          }
                        }}
                        className="shrink-0 rounded p-0.5 text-soft hover:bg-hairline hover:text-ink"
                        aria-label="Eliminar jugada"
                      >
                        <Trash2 size={12} aria-hidden="true" />
                      </span>
                    </button>
                  </li>
                ))}
              </ol>
            )}
            <Button variant="outline" size="sm" onClick={openForm}>
              <MapPin size={13} aria-hidden="true" /> Registrar jugada
            </Button>
          </div>
        </div>
      </div>

      {showForm ? (
        <div className="mt-4 border border-hairline bg-surface p-5">
          <div className="mb-4 flex items-center justify-between gap-2">
            <h3 className="flex items-center gap-2 text-sm font-medium text-ink">
              <MapPin size={15} strokeWidth={1.8} aria-hidden="true" /> Nueva jugada
              {formPos ? (
                <span className="label text-muted">en ({formPos.x.toFixed(1)} m, {formPos.y.toFixed(1)} m) · {formatSeconds(formTime)}</span>
              ) : null}
            </h3>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="rounded p-1 text-soft transition-colors hover:bg-hairline hover:text-ink"
              aria-label="Cerrar formulario"
            >
              <X size={15} aria-hidden="true" />
            </button>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[170px_150px_1fr_auto] lg:items-end">
            <Field label="Jugada">
              <Select
                value={formType}
                onChange={(event) => {
                  setFormType(event.target.value as EventType);
                  setFormPlayer("");
                }}
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {eventLabel(video.sport, type)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Equipo">
              <Select value={formTeam} onChange={(event) => setFormTeam(event.target.value as EventsTeam)}>
                <option value="A">Equipo A</option>
                <option value="B">Equipo B</option>
              </Select>
            </Field>
            <div className="space-y-3">
              <Field label="Jugador (opcional)">
                {selectedTrackId !== null ? (
                  <div className="space-y-1.5">
                    <TextInput value={formPlayer} onChange={(event) => setFormPlayer(event.target.value)} placeholder="Ej. Facundo" maxLength={60} />
                    <button
                      type="button"
                      disabled={!playerWorldPos}
                      onClick={() => setFormPos(playerWorldPos)}
                      className="label text-ink/70 underline decoration-ink/30 underline-offset-2 transition-colors hover:text-ink disabled:cursor-not-allowed disabled:text-soft disabled:no-underline"
                    >
                      Usar posición de {selectedName ?? "jugador seleccionado"}
                    </button>
                  </div>
                ) : (
                  <TextInput value={formPlayer} onChange={(event) => setFormPlayer(event.target.value)} placeholder="Ej. Facundo" maxLength={60} />
                )}
              </Field>
              {asksPoints ? (
                <div className="flex items-center gap-2">
                  <span className="label text-muted">Valor</span>
                  <Select value={String(formPoints)} onChange={(event) => setFormPoints(Number(event.target.value) as 2 | 3)} className="w-20">
                    <option value="2">2 pts</option>
                    <option value="3">3 pts</option>
                  </Select>
                </div>
              ) : null}
            </div>
            <div className="flex items-end gap-2">
              <Button size="md" disabled={submitting || !formPos} onClick={submitEvent}>
                {submitting ? "Guardando…" : "Guardar jugada"}
              </Button>
            </div>
          </div>
          {boardError ? <p className="mt-3 text-sm text-red-900">{boardError}</p> : null}
        </div>
      ) : null}

      {events.length > 0 ? (
        <div className="mt-4 flex flex-wrap gap-2">
          {(["A", "B"] as EventsTeam[]).map((team) => (
            <span key={team} className="label flex items-center gap-2 border border-hairline bg-surface px-2.5 py-1 text-muted">
              <span className="size-2 rounded-full" style={{ backgroundColor: TEAM_COLORS[team].stroke }} aria-hidden="true" />
              Equipo {team}: {countByType(team, "made")} convertidos ({pointsByTeam[team]} pts) · {countByType(team, "missed")} fallados · {countByType(team, "assist")} asistencias
            </span>
          ))}
        </div>
      ) : null}

      <div className="mt-4 sm:hidden">
        <Button variant="outline" size="sm" className="w-full" onClick={openForm}>
          <MapPin size={13} aria-hidden="true" /> Registrar jugada
        </Button>
      </div>
    </section>
  );
}