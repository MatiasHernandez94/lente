import type {
  AnalysisResult,
  HeatZone,
  Highlight,
  Metric,
  Okr,
  PlayerAnalysis,
  PlayerMovement,
  Sport,
} from "./types";

function fnv1a(input: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

function mulberry32(seed: number): () => number {
  let state = seed;
  return () => {
    state |= 0;
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

const clampRating = (value: number): number => clamp(Math.round(value), 30, 98);

const metric = (key: string, label: string, value: string, unit: string, target: string, rating: number): Metric => ({
  key,
  label,
  value,
  unit,
  target,
  rating: clampRating(rating),
});

interface HighlightDraft {
  title: string;
  detail: string;
  category: string;
}

interface SportModel {
  secondsPerUnit: number;
  metrics: (r: () => number, minutes: number) => Metric[];
  okrs: (r: () => number, metrics: Metric[], minutes: number) => Okr[];
  highlights: HighlightDraft[];
  summary: (score: number, metrics: Metric[], top: Highlight) => string;
}

const timescale = (r: () => number, minutes: number, nominalMinutes: number): number => {
  const factor = minutes / nominalMinutes;
  return clamp(factor * (0.9 + r() * 0.2), 0.4, 1.8);
};

function buildHighlights(
  r: () => number,
  pool: HighlightDraft[],
  minutes: number,
  count = 5,
): Highlight[] {
  const picked = [...pool].sort(() => r() - 0.5).slice(0, count);
  const minutesPerSlot = minutes / count;

  return picked
    .map((item, index): Highlight => {
      const offset = index * minutesPerSlot + r() * minutesPerSlot * 0.8;
      const minute = clamp(Math.round(offset), 1, minutes);
      const impact = index < 2 ? "alta" : r() < 0.5 ? "media" : "baja";
      return { minute: `${minute}'`, title: item.title, detail: item.detail, category: item.category, impact };
    })
    .sort((a, b) => Number.parseInt(a.minute, 10) - Number.parseInt(b.minute, 10));
}

const general: SportModel = {
  secondsPerUnit: 600,
  metrics(r, minutes) {
    const t = timescale(r, minutes, 30);
    const personas = Math.round((3 + r() * 15) * t);
    const velocidad = round1(2 + r() * 6);
    const distancia = round1((0.5 + r() * 3) * t);
    const actividad = 40 + r() * 40;
    return [
      metric("personas", "Personas detectadas", `${personas}`, "", "≥ 5", 30 + personas * 4),
      metric("velocidad", "Velocidad promedio", `${velocidad}`, "m/s", "≥ 4 m/s", 40 + velocidad * 8),
      metric("distancia", "Distancia total", `${distancia}`, "km", "≥ 2 km", 35 + distancia * 15),
      metric("actividad", "Nivel de actividad", `${actividad.toFixed(0)}`, "%", "≥ 60 %", actividad * 1.1),
    ];
  },
  okrs(r, metrics, minutes) {
    const m = Object.fromEntries(metrics.map((x) => [x.key, x]));
    return [
      {
        objective: "Actividad general",
        keyResults: [
          { label: "Velocidad promedio sobre 4 m/s", value: m.velocidad.value, target: "4" },
          { label: "Distancia total sobre 2 km", value: m.distancia.value, target: "2" },
        ],
        progress: clampRating((Number(m.velocidad.rating) + Number(m.distancia.rating)) / 2),
      },
      {
        objective: "Participación",
        keyResults: [
          { label: "Personas detectadas sobre 5", value: m.personas.value, target: "5" },
          { label: "Nivel de actividad sobre 60 %", value: m.actividad.value, target: "60" },
        ],
        progress: clampRating(Number(m.personas.rating) + 4),
      },
    ];
  },
  highlights: [
    { title: "Movimiento detectado", detail: "Se identificó actividad física con movimiento constante del sujeto.", category: "Actividad" },
    { title: "Período de alta intensidad", detail: "Momento del video con velocidad superior al promedio.", category: "Intensidad" },
    { title: "Pausa en la actividad", detail: "Período de baja actividad que podría indicar descanso o preparación.", category: "Recuperación" },
    { title: "Desplazamiento lateral", detail: "Movimiento lateral detectado, indicando agilidad o cambio de dirección.", category: "Agilidad" },
    { title: "Ritmo constante", detail: "Mantenimiento de ritmo estable durante el segmento analizado.", category: "Consistencia" },
  ],
  summary(score, metrics, top) {
    const m = Object.fromEntries(metrics.map((x) => [x.key, x]));
    return `Se detectaron ${m.personas.value} persona(s) con velocidad promedio de ${m.velocidad.value} m/s y distancia total de ${m.distancia.value} km. Nivel de actividad: ${m.actividad.value} %. Momento destacado: «${top.title}». Calificación global: ${score}/100.`;
  },
};

const futbol: SportModel = {
  secondsPerUnit: 5400,
  metrics(r, minutes) {
    const t = timescale(r, minutes, 90);
    const posesion = 40 + r() * 22;
    const pases = 76 + r() * 15;
    const remates = Math.round((9 + r() * 8) * t);
    const conversion = 14 + r() * 16;
    return [
      metric("posesion", "Posesión efectiva", `${posesion.toFixed(1)}`, "%", "≥ 55 %", 55 - Math.abs(posesion - 55) * 3 + 20),
      metric("pases", "Precisión de pase", `${pases.toFixed(1)}`, "%", "≥ 85 %", pases * 1.05),
      metric("remates", "Remates a puerta", `${remates}`, "90'", "≥ 14", 40 + remates * 3.6),
      metric("conversion", "Conversión de ocasiones", `${conversion.toFixed(1)}`, "%", "≥ 25 %", conversion * 3.4),
    ];
  },
  okrs(r, metrics, minutes) {
    const m = Object.fromEntries(metrics.map((x) => [x.key, x]));
    const goles = Math.max(1, Math.round(Number.parseFloat(m.conversion.value) / 100 * (12 + r() * 5)));
    return [
      {
        objective: "Dominio del balón",
        keyResults: [
          { label: "Posesión efectiva sobre 55 %", value: m.posesion.value, target: "55" },
          { label: "Precisión de pase sobre 85 %", value: m.pases.value, target: "85" },
        ],
        progress: clampRating((Number(m.posesion.rating) + Number(m.pases.rating)) / 2),
      },
      {
        objective: "Control del área rival",
        keyResults: [
          { label: "Remates a puerta sobre 14", value: m.remates.value, target: "14" },
          { label: "Ocasiones claras creadas", value: `${Math.round(Number(m.remates.value) * 0.35 + r())}`, target: "5" },
        ],
        progress: clampRating(Number(m.remates.rating) + 4),
      },
      {
        objective: "Impacto en el marcador",
        keyResults: [
          { label: "Conversión sobre 25 %", value: m.conversion.value, target: "25" },
          { label: "Goles materializados", value: `${goles}`, target: "3" },
        ],
        progress: clampRating(Number(m.conversion.rating) + 2 + (minutes > 60 ? 3 : 0)),
      },
    ];
  },
  highlights: [
    { title: "Oportunidad clara generada", detail: "Jugada combinativa que terminó en ocasión de gol. Se recomienda repetir el patrón de desmarque.", category: "Ataque" },
    { title: "Recuperación en campo contrario", detail: "Presión tras pérdida, recuperación rápida y salida en transición.", category: "Presión" },
    { title: "Parada determinante del portero", detail: "Intervención de mérito que mantuvo el resultado en partido abierto.", category: "Defensa" },
    { title: "Ofensiva sostenida en el último tercio", detail: "Ronda de posesión ofensiva con tres llegadas consecutivas al área.", category: "Ataque" },
    { title: "Saque de esquina con peligro", detail: "Balón parado bien ejecutado con remate que exigió la respuesta del rival.", category: "Balón parado" },
    { title: "Presión efectiva tras pérdida", detail: "Recuperación en menos de tres segundos, cortocircuitando la salida del rival.", category: "Presión" },
  ],
  summary(score, metrics, top) {
    const m = Object.fromEntries(metrics.map((x) => [x.key, x]));
    return `El equipo controló la posesión en un ${m.posesion.value} % de los minutos efectivos, con precisión de pase del ${m.pases.value} %. El momento más relevante fue: «${top.title}». La calificación global alcanzó ${score} sobre 100; la conversión de ocasiones (${m.conversion.value} %) define el siguiente bloque de trabajo.`;
  },
};

const padel: SportModel = {
  secondsPerUnit: 3600,
  metrics(r, minutes) {
    const t = timescale(r, minutes, 100);
    const red = 58 + r() * 20;
    const errores = 5 + r() * 8;
    const smash = Math.round((3 + r() * 5) * t);
    const pared = 62 + r() * 18;
    return [
      metric("red", "Puntos ganados en red", `${red.toFixed(1)}`, "%", "≥ 70 %", red * 1.25),
      metric("errores", "Errores no forzados", `${errores.toFixed(1)}`, "set", "≤ 8", 112 - errores * 7),
      metric("smash", "Smashes ganadores", `${smash}`, "set", "≥ 5", 45 + smash * 9),
      metric("pared", "Precisión de bandeja", `${pared.toFixed(1)}`, "%", "≥ 75 %", pared * 1.2),
    ];
  },
  okrs(r, metrics, _minutes) {
    const m = Object.fromEntries(metrics.map((x) => [x.key, x]));
    const dejadas = Math.round(2 + r() * 4);
    return [
      {
        objective: "Agresión en la red",
        keyResults: [
          { label: "Puntos en red sobre 70 %", value: m.red.value, target: "70" },
          { label: "Smashes ganadores por set", value: m.smash.value, target: "5" },
        ],
        progress: clampRating((Number(m.red.rating) + Number(m.smash.rating)) / 2),
      },
      {
        objective: "Solidez propia",
        keyResults: [
          { label: "Errores no forzados ≤ 8 por set", value: m.errores.value, target: "8" },
          { label: "Dobles faltas en servicio", value: `${Math.round(1 + r() * 3)}`, target: "3" },
        ],
        progress: clampRating(Number(m.errores.rating) + 2),
      },
      {
        objective: "Estrategia de fondo",
        keyResults: [
          { label: "Bandejas precisas sobre 75 %", value: m.pared.value, target: "75" },
          { label: "Dejadas de presión ejecutadas", value: `${dejadas}`, target: "4" },
        ],
        progress: clampRating(Number(m.pared.rating) + 2),
      },
    ];
  },
  highlights: [
    { title: "Smash directo ganador", detail: "Remate en red sin respuesta del rival, que cerró el punto en dos golpes.", category: "Ataque" },
    { title: "Bandeja en la esquina", detail: "Colocación frontal imposible de responder, modelo de resolución de presión.", category: "Técnica" },
    { title: "Dejada de presión", detail: "Cambio de ritmo en el fondo que obligó al error del rival.", category: "Estrategia" },
    { title: "Red bien defendida y contrataque", detail: "Bloqueo en la red y recuperación inmediata del punto.", category: "Defensa" },
    { title: "Rally largo con resolución", detail: "Intercambio de más de veinte golpes resuelto con criterio.", category: "Resistencia" },
    { title: "Salida de pared en juego clave", detail: "Recuperación desde el fondo con bandeja de riesgo compensada.", category: "Defensa" },
  ],
  summary(score, metrics, top) {
    const m = Object.fromEntries(metrics.map((x) => [x.key, x]));
    return `El rendimiento en red fue del ${m.red.value} % de puntos ganados, con ${m.smash.value} smashes directos por set. El momento clave fue «${top.title}». La calificación global es de ${score} sobre 100; reducir los ${m.errores.value} errores no forzados por set es la señal de mejora inmediata.`;
  },
};

const voleibol: SportModel = {
  secondsPerUnit: 5400,
  metrics(r, minutes) {
    const t = timescale(r, minutes, 120);
    const remate = 40 + r() * 22;
    const bloqueo = Math.round((2 + r() * 4) * t);
    const recepcion = 58 + r() * 18;
    const saque = 15 + r() * 14;
    return [
      metric("remate", "Remates convertidos en punto", `${remate.toFixed(1)}`, "%", "≥ 55 %", remate * 1.55 + 8),
      metric("bloqueo", "Bloqueos por set", `${bloqueo}`, "set", "≥ 4", 30 + bloqueo * 14),
      metric("recepcion", "Recepción positiva", `${recepcion.toFixed(1)}`, "%", "≥ 70 %", recepcion * 1.25),
      metric("saque", "Saques efectivos", `${saque.toFixed(1)}`, "%", "≥ 20 %", saque * 3 + 25),
    ];
  },
  okrs(r, metrics, _minutes) {
    const m = Object.fromEntries(metrics.map((x) => [x.key, x]));
    const contra = Math.round(3 + r() * 4);
    return [
      {
        objective: "Dominio ofensivo",
        keyResults: [
          { label: "Remates convertidos sobre 55 %", value: m.remate.value, target: "55" },
          { label: "Saques efectivos sobre 20 %", value: m.saque.value, target: "20" },
        ],
        progress: clampRating((Number(m.remate.rating) + Number(m.saque.rating)) / 2),
      },
      {
        objective: "Muro en la red",
        keyResults: [
          { label: "Bloqueos por set sobre 4", value: m.bloqueo.value, target: "4" },
          { label: "Puntos de contraataque directos", value: `${contra}`, target: "5" },
        ],
        progress: clampRating(Number(m.bloqueo.rating) + 2),
      },
      {
        objective: "Continuidad en recepción",
        keyResults: [
          { label: "Recepción positiva sobre 70 %", value: m.recepcion.value, target: "70" },
          { label: "Errores de toque por set", value: `${Math.round(1 + r() * 3)}`, target: "3" },
        ],
        progress: clampRating(Number(m.recepcion.rating) + 2),
      },
    ];
  },
  highlights: [
    { title: "Bloqueo decisivo en el set", detail: "Muro sólido en zona 4 que cortó la ofensiva rival en el cierre del set.", category: "Defensa" },
    { title: "Remate de esquina", detail: "Ofensiva en zona 4 rematada a la esquina libre, imposible de defender.", category: "Ataque" },
    { title: "Saque directo en momento clave", detail: "Servicio agresivo que quebró la recepción rival y dio el punto directo.", category: "Servicio" },
    { title: "Recepción perfecta y construcción", detail: "Recepción de calidad que permitió distribuir en condiciones de ventaja.", category: "Técnica" },
    { title: "Defensa en profundidad", detail: "Recuperación en segunda línea y transición inmediata al ataque.", category: "Defensa" },
    { title: "Ace en zona de presión", detail: "Saques sucesivos ganadores en el momento de mayor tensión del set.", category: "Servicio" },
  ],
  summary(score, metrics, top) {
    const m = Object.fromEntries(metrics.map((x) => [x.key, x]));
    return `La eficacia de remate alcanzó el ${m.remate.value} %, con ${m.bloqueo.value} bloqueos por set. El momento más destacado fue «${top.title}». Con ${score} sobre 100 de calificación global, la recepción (${m.recepcion.value} % positiva) es la palanca prioritaria a reforzar.`;
  },
};

const baloncesto: SportModel = {
  secondsPerUnit: 4800,
  metrics(r, minutes) {
    const t = timescale(r, minutes, 96);
    const tc = 40 + r() * 16;
    const triple = 28 + r() * 14;
    const rebotes = Math.round((28 + r() * 22) * t);
    const asistencias = Math.round((14 + r() * 14) * t);
    const puntos = Math.round((70 + r() * 36) * clamp(t, 0.5, 1));
    return [
      metric("tc", "Tiro de campo", `${tc.toFixed(1)}`, "%", "≥ 48 %", tc * 1.8 + 8),
      metric("triple", "Triples", `${triple.toFixed(1)}`, "%", "≥ 36 %", triple * 2.1 + 12),
      metric("rebotes", "Rebotes", `${rebotes}`, "", "≥ 42", 35 + rebotes * 1.35),
      metric("asistencias", "Asistencias", `${asistencias}`, "", "≥ 22", 40 + asistencias * 2.2),
      metric("puntos", "Puntos", `${puntos}`, "", "≥ 90", 18 + puntos * 0.82),
    ];
  },
  okrs(r, metrics, _minutes) {
    const m = Object.fromEntries(metrics.map((x) => [x.key, x]));
    const perdidas = Math.round(8 + r() * 8);
    return [
      {
        objective: "Eficacia de tiro",
        keyResults: [
          { label: "Tiro de campo sobre 48 %", value: m.tc.value, target: "48" },
          { label: "Triples sobre 36 %", value: m.triple.value, target: "36" },
        ],
        progress: clampRating((Number(m.tc.rating) + Number(m.triple.rating)) / 2),
      },
      {
        objective: "Ritmo y circulación",
        keyResults: [
          { label: "Asistencias sobre 22", value: m.asistencias.value, target: "22" },
          { label: "Pérdidas de balón ≤ 12", value: `${perdidas}`, target: "12" },
        ],
        progress: clampRating(Number(m.asistencias.rating) - 2),
      },
      {
        objective: "Control del rebote",
        keyResults: [
          { label: "Rebotes sobre 42", value: m.rebotes.value, target: "42" },
          { label: "Puntos de segunda oportunidad", value: `${Math.round(Number(m.rebotes.value) * 0.32 + r() * 3)}`, target: "12" },
        ],
        progress: clampRating(Number(m.rebotes.rating) + 1),
      },
    ];
  },
  highlights: [
    { title: "Barrida defensiva y contrataque", detail: "Recuperación en la defensa y transición rápida finalizada en canasta fácil.", category: "Transición" },
    { title: "Racha de triples decisiva", detail: "Tres triples consecutivos que abrieron el partido en el segundo cuarto.", category: "Ataque" },
    { title: "Ofensiva en transición", detail: "Salida rápida tras rebote con asistencia en el primer pase.", category: "Transición" },
    { title: "Control del tablero defensivo", detail: "Seguridad en el rebote que limitó las segundas opciones del rival.", category: "Rebote" },
    { title: "Defensa de medio campo sostenida", detail: "Seguimiento agresivo y sin espacios en el back court durante el tramo clave.", category: "Defensa" },
    { title: "Jugada de líder en el cierre", detail: "Cesta en aislamiento con reloj presionado que sentenció el parcial.", category: "Ataque" },
  ],
  summary(score, metrics, top) {
    const m = Object.fromEntries(metrics.map((x) => [x.key, x]));
    return `El equipo sumó ${m.puntos.value} puntos con un ${m.tc.value} % de tiro de campo y ${m.rebotes.value} rebotes. El instante clave fue «${top.title}». La calificación global es de ${score} sobre 100; elevar las asistencias sobre ${m.asistencias.value} sostiene la eficacia del ataque posicional.`;
  },
};

const MODELS: Record<Sport, SportModel> = { general, futbol, padel, voleibol, baloncesto };

interface PlayerModel {
  positions: string[];
  heatmapDims: { cols: number; rows: number };
  movement: (r: () => number, factor: number) => PlayerMovement;
  kpis: (r: () => number, factor: number) => Metric[];
}

const PLAYER_MODELS: Record<Sport, PlayerModel> = {
  general: {
    positions: ["Sujeto"],
    heatmapDims: { cols: 10, rows: 7 },
    movement(r, factor) {
      return {
        distanceKm: round1((1 + r() * 3) * factor),
        avgSpeedKmh: round1(3 + r() * 4),
        maxSpeedKmh: round1(12 + r() * 8),
        sprints: Math.round((2 + r() * 8) * factor),
      };
    },
    kpis(r, factor) {
      const velocidad = round1(2 + r() * 5);
      const distancia = round1((0.5 + r() * 2) * factor);
      const actividad = 40 + r() * 40;
      return [
        metric("velocidad", "Velocidad promedio", `${velocidad}`, "m/s", "≥ 3 m/s", 35 + velocidad * 10),
        metric("distancia", "Distancia recorrida", `${distancia}`, "km", "≥ 1.5 km", 40 + distancia * 18),
        metric("actividad", "Nivel de actividad", `${actividad.toFixed(0)}`, "%", "≥ 60 %", actividad * 1.1),
      ];
    },
  },
  futbol: {
    positions: ["Delantero", "Mediocampista", "Defensa", "Portero"],
    heatmapDims: { cols: 12, rows: 8 },
    movement(r, factor) {
      return {
        distanceKm: round1((7 + r() * 5) * factor),
        avgSpeedKmh: round1(5.5 + r() * 3),
        maxSpeedKmh: round1(26 + r() * 7),
        sprints: Math.round((14 + r() * 16) * factor),
      };
    },
    kpis(r, factor) {
      const pases = 72 + r() * 20;
      const recuperaciones = Math.round((4 + r() * 6) * factor);
      const duelos = Math.round((4 + r() * 7) * factor);
      return [
        metric("pases", "Precisión de pase", `${pases.toFixed(1)}`, "%", "≥ 85 %", pases * 1.1),
        metric("recuperaciones", "Balones recuperados", `${recuperaciones}`, "", "≥ 6", 40 + recuperaciones * 8),
        metric("duelos", "Duelos ganados", `${duelos}`, "", "≥ 8", 35 + duelos * 6.5),
      ];
    },
  },
  padel: {
    positions: ["Zona de red", "Zona de fondo"],
    heatmapDims: { cols: 8, rows: 6 },
    movement(r, factor) {
      return {
        distanceKm: round1((1.5 + r() * 2) * factor),
        avgSpeedKmh: round1(3 + r() * 2.5),
        maxSpeedKmh: round1(16 + r() * 9),
        sprints: Math.round((5 + r() * 7) * factor),
      };
    },
    kpis(r, factor) {
      const red = 52 + r() * 26;
      const dejadas = Math.round((1 + r() * 4) * factor);
      const errores = 3 + r() * 7;
      return [
        metric("puntosRed", "Puntos ganados en la red", `${red.toFixed(1)}`, "%", "≥ 70 %", red * 1.3),
        metric("dejadas", "Dejadas ganadoras", `${dejadas}`, "", "≥ 3", 40 + dejadas * 13),
        metric("errores", "Errores no forzados", `${errores.toFixed(1)}`, "set", "≤ 6", 112 - errores * 7),
      ];
    },
  },
  voleibol: {
    positions: ["Colocador", "Atacante", "Líbero", "Receptor"],
    heatmapDims: { cols: 8, rows: 6 },
    movement(r, factor) {
      return {
        distanceKm: round1((0.8 + r() * 1.2) * factor),
        avgSpeedKmh: round1(2 + r() * 1.8),
        maxSpeedKmh: round1(10 + r() * 7),
        sprints: Math.round((3 + r() * 6) * factor),
      };
    },
    kpis(r, factor) {
      const remate = 35 + r() * 25;
      const bloqueos = Math.round((1 + r() * 4) * factor);
      const recepcion = 50 + r() * 25;
      return [
        metric("remate", "Remates convertidos", `${remate.toFixed(1)}`, "%", "≥ 50 %", remate * 1.5 + 10),
        metric("bloqueos", "Bloqueos directos", `${bloqueos}`, "set", "≥ 3", 35 + bloqueos * 14),
        metric("recepcion", "Recepción positiva", `${recepcion.toFixed(1)}`, "%", "≥ 65 %", recepcion * 1.2 + 6),
      ];
    },
  },
  baloncesto: {
    positions: ["Base", "Escolta", "Alero", "Ala-pívot", "Pívot"],
    heatmapDims: { cols: 10, rows: 7 },
    movement(r, factor) {
      return {
        distanceKm: round1((3.2 + r() * 2.6) * factor),
        avgSpeedKmh: round1(4.5 + r() * 3),
        maxSpeedKmh: round1(19 + r() * 8),
        sprints: Math.round((14 + r() * 16) * factor),
      };
    },
    kpis(r, factor) {
      const puntos = Math.round((10 + r() * 22) * factor);
      const rebotes = Math.round((3 + r() * 7) * factor);
      const asistencias = Math.round((1 + r() * 7) * factor);
      return [
        metric("puntos", "Puntos anotados", `${puntos}`, "", "≥ 20", 20 + puntos * 2.6),
        metric("rebotes", "Rebotes", `${rebotes}`, "", "≥ 6", 35 + rebotes * 8),
        metric("asistencias", "Asistencias", `${asistencias}`, "", "≥ 4", 35 + asistencias * 11),
      ];
    },
  },
};

function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

function buildHeatmap(r: () => number, cols: number, rows: number, hotSpots: number): HeatZone[] {
  const cells: number[][] = Array.from({ length: rows }, () => Array.from({ length: cols }, () => 0.04 + r() * 0.05));

  const anchors: { col: number; row: number; amp: number }[] = [];
  for (let i = 0; i < hotSpots; i += 1) {
    anchors.push({
      col: Math.floor(r() * cols),
      row: Math.floor(r() * rows),
      amp: 0.6 + r() * 0.4,
    });
  }

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      let value = cells[row][col];
      for (const anchor of anchors) {
        const dx = (col - anchor.col) / cols;
        const dy = (row - anchor.row) / rows;
        value += anchor.amp * Math.exp(-(dx * dx + dy * dy) * 14);
      }
      cells[row][col] = Math.min(1, value);
    }
  }

  const zones: HeatZone[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      zones.push({ col, row, intensity: round1(cells[row][col]) });
    }
  }
  return zones;
}

function generatePlayer(name: string, index: number, videoId: string, sport: Sport): PlayerAnalysis {
  const model = PLAYER_MODELS[sport];
  const subSeed = fnv1a(`${videoId}::jugador::${index}::${name}`);
  const r = mulberry32(subSeed);
  const factor = clamp(0.85 + r() * 0.4, 0.6, 1.3);

  return {
    name,
    position: model.positions[Math.floor(r() * model.positions.length)],
    movement: model.movement(r, factor),
    kpis: model.kpis(r, factor),
    heatmap: buildHeatmap(r, model.heatmapDims.cols, model.heatmapDims.rows, 3 + Math.floor(r() * 3)),
  };
}

export function generateAnalysis(
  videoId: string,
  sport: Sport,
  durationSeconds: number,
  players: readonly string[] = [],
): AnalysisResult {
  const model = MODELS[sport];
  const seed = fnv1a(videoId);
  const r = mulberry32(seed);
  const minutes = clamp(Math.round(durationSeconds / 60), 20, 240);
  const metrics = model.metrics(r, minutes);
  const okrs = model.okrs(r, metrics, minutes);
  const highlights = buildHighlights(r, model.highlights, minutes);
  const score = clamp(Math.round(metrics.reduce((acc, m) => acc + m.rating, 0) / metrics.length), 60, 93);
  const summary = model.summary(score, metrics, highlights[0]);

  return {
    score,
    summary,
    metrics,
    okrs,
    highlights,
    players: players.map((name, index) => generatePlayer(name, index, videoId, sport)),
  };
}