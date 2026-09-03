import type { BodyKeypoint, ExerciseCategory } from "./types";

export interface AngleSpec {
  key: string;
  label: string;
  side: "left" | "right" | "eje";
  points: [BodyKeypoint, BodyKeypoint, BodyKeypoint];
  targetDeg: [number, number];
  keyPoint?: "min" | "max" | "value";
}

export interface ExerciseSpec {
  id: string;
  name: string;
  category: ExerciseCategory;
  view: "frontal" | "lateral";
  summary: string;
  primary: AngleSpec;
  angles: AngleSpec[];
  symmetric: boolean;
}const LEFT: BodyKeypoint[] = [
  "left_hip",
  "left_knee",
  "left_ankle",
];

const RIGHT: BodyKeypoint[] = [
  "right_hip",
  "right_knee",
  "right_ankle",
];

const LEFT_UPPER: BodyKeypoint[] = [
  "left_shoulder",
  "left_elbow",
  "left_wrist",
];

const RIGHT_UPPER: BodyKeypoint[] = [
  "right_shoulder",
  "right_elbow",
  "right_wrist",
];

export const EXERCISES: ExerciseSpec[] = [
  {
    id: "sentadilla",
    name: "Sentadilla",
    category: "fuerza",
    view: "lateral",
    summary: "Flexiona rodillas y cadera bajando el torso, manteniendo la espalda neutra.",
    primary: {
      key: "knee",
      label: "Rodilla",
      side: "eje",
      points: ["right_hip", "right_knee", "right_ankle"],
      targetDeg: [80, 100],
      keyPoint: "min",
    },
    angles: [
      { key: "knee", label: "Rodilla", side: "eje", points: ["right_hip", "right_knee", "right_ankle"], targetDeg: [80, 100] },
      { key: "hip", label: "Cadera", side: "eje", points: ["right_shoulder", "right_hip", "right_knee"], targetDeg: [70, 100] },
      { key: "torso", label: "Tronco", side: "eje", points: ["right_hip", "right_shoulder", "nose"], targetDeg: [5, 25] },
    ],
    symmetric: false,
  },
  {
    id: "peso_muerto",
    name: "Peso muerto",
    category: "fuerza",
    view: "lateral",
    summary: "Bisagra de cadera manteniendo la espalda neutral durante todo el recorrido.",
    primary: {
      key: "torso",
      label: "Inclinación tronco",
      side: "eje",
      points: ["right_hip", "right_shoulder", "nose"],
      targetDeg: [20, 45],
      keyPoint: "value",
    },
    angles: [
      { key: "torso", label: "Inclinación tronco", side: "eje", points: ["right_hip", "right_shoulder", "nose"], targetDeg: [20, 45] },
      { key: "knee", label: "Rodilla", side: "eje", points: ["right_hip", "right_knee", "right_ankle"], targetDeg: [20, 45] },
    ],
    symmetric: false,
  },
  {
    id: "press_banca",
    name: "Press de banca",
    category: "fuerza",
    view: "lateral",
    summary: "Empuja la barra desde el pecho extendiendo los brazos de forma controlada.",
    primary: {
      key: "elbow",
      label: "Codo",
      side: "eje",
      points: ["left_shoulder", "left_elbow", "left_wrist"],
      targetDeg: [90, 15],
      keyPoint: "min",
    },
    angles: [
      { key: "elbow", label: "Codo", side: "eje", points: ["left_shoulder", "left_elbow", "left_wrist"], targetDeg: [90, 15] },
      { key: "shoulder", label: "Hombro", side: "eje", points: ["left_hip", "left_shoulder", "left_elbow"], targetDeg: [60, 110] },
    ],
    symmetric: false,
  },
  {
    id: "press_hombro",
    name: "Press de hombro",
    category: "fuerza",
    view: "frontal",
    summary: "Eleva el peso por encima de la cabeza extendiendo los brazos verticalmente.",
    primary: {
      key: "elbow",
      label: "Codo",
      side: "eje",
      points: ["left_shoulder", "left_elbow", "left_wrist"],
      targetDeg: [100, 15],
      keyPoint: "min",
    },
    angles: [
      { key: "elbow", label: "Codo", side: "eje", points: ["left_shoulder", "left_elbow", "left_wrist"], targetDeg: [100, 15] },
      { key: "shoulder", label: "Hombro", side: "eje", points: ["right_hip", "right_shoulder", "right_elbow"], targetDeg: [110, 160] },
    ],
    symmetric: false,
  },
  {
    id: "zancada",
    name: "Zancada",
    category: "fuerza",
    view: "lateral",
    summary: "Paso al frente doblando ambas rodillas hasta ~90°, manteniendo el tronco erguido.",
    primary: {
      key: "knee_front",
      label: "Rodilla delantera",
      side: "left",
      points: ["left_hip", "left_knee", "left_ankle"],
      targetDeg: [90, 100],
      keyPoint: "min",
    },
    angles: [
      { key: "knee_front", label: "Rodilla delantera", side: "left", points: ["left_hip", "left_knee", "left_ankle"], targetDeg: [90, 100] },
      { key: "knee_back", label: "Rodilla trasera", side: "right", points: ["right_hip", "right_knee", "right_ankle"], targetDeg: [90, 100] },
      { key: "hip_front", label: "Cadera delantera", side: "left", points: ["left_shoulder", "left_hip", "left_knee"], targetDeg: [70, 100] },
    ],
    symmetric: true,
  },
  {
    id: "plancha",
    name: "Plancha",
    category: "fuerza",
    view: "lateral",
    summary: "Mantén el cuerpo en línea recta alineando hombros, cadera y tobillos.",
    primary: {
      key: "alignment",
      label: "Alineación corporal",
      side: "eje",
      points: ["right_shoulder", "right_hip", "right_ankle"],
      targetDeg: [175, 185],
      keyPoint: "value",
    },
    angles: [
      { key: "alignment", label: "Alineación corporal", side: "eje", points: ["right_shoulder", "right_hip", "right_ankle"], targetDeg: [175, 185] },
    ],
    symmetric: false,
  },
  {
    id: "flexiones",
    name: "Flexiones",
    category: "fuerza",
    view: "lateral",
    summary: "Baja el pecho flexionando los codos manteniendo el cuerpo alineado.",
    primary: {
      key: "elbow",
      label: "Codo",
      side: "eje",
      points: ["left_shoulder", "left_elbow", "left_wrist"],
      targetDeg: [90, 15],
      keyPoint: "min",
    },
    angles: [
      { key: "elbow", label: "Codo", side: "eje", points: ["left_shoulder", "left_elbow", "left_wrist"], targetDeg: [90, 15] },
      { key: "alignment", label: "Alineación corporal", side: "eje", points: ["right_shoulder", "right_hip", "right_ankle"], targetDeg: [170, 185] },
    ],
    symmetric: false,
  },
  {
    id: "sentadilla_profunda",
    name: "Sentadilla profunda",
    category: "movilidad",
    view: "lateral",
    summary: "Desciende lo máximo manteniendo los talones apoyados y la espalda neutra.",
    primary: {
      key: "knee",
      label: "Rodilla",
      side: "eje",
      points: ["right_hip", "right_knee", "right_ankle"],
      targetDeg: [60, 90],
      keyPoint: "min",
    },
    angles: [
      { key: "knee", label: "Rodilla", side: "eje", points: ["right_hip", "right_knee", "right_ankle"], targetDeg: [60, 90] },
      { key: "hip", label: "Cadera", side: "eje", points: ["right_shoulder", "right_hip", "right_knee"], targetDeg: [50, 85] },
      { key: "torso", label: "Tronco", side: "eje", points: ["right_hip", "right_shoulder", "nose"], targetDeg: [5, 25] },
    ],
    symmetric: false,
  },
  {
    id: "apertura_cadera",
    name: "Apertura de cadera",
    category: "movilidad",
    view: "frontal",
    summary: "Eleva la rodilla hacia afuera abriendo la cadera de forma lateral.",
    primary: {
      key: "hip_abduction",
      label: "Apertura de cadera",
      side: "eje",
      points: ["right_shoulder", "right_hip", "right_knee"],
      targetDeg: [120, 170],
      keyPoint: "max",
    },
    angles: [
      { key: "hip_abduction", label: "Apertura de cadera", side: "eje", points: ["right_shoulder", "right_hip", "right_knee"], targetDeg: [120, 170] },
    ],
    symmetric: false,
  },
  {
    id: "movilidad_hombro",
    name: "Movilidad de hombro",
    category: "movilidad",
    view: "frontal",
    summary: "Eleva ambos brazos por encima de la cabeza manteniendo el control.",
    primary: {
      key: "shoulder",
      label: "Elevación de hombro",
      side: "eje",
      points: ["right_hip", "right_shoulder", "right_elbow"],
      targetDeg: [160, 180],
      keyPoint: "max",
    },
    angles: [
      { key: "shoulder", label: "Elevación de hombro", side: "eje", points: ["right_hip", "right_shoulder", "right_elbow"], targetDeg: [160, 180] },
      { key: "shoulder_left", label: "Elevación izquierda", side: "left", points: ["left_hip", "left_shoulder", "left_elbow"], targetDeg: [160, 180] },
    ],
    symmetric: true,
  },
];

export const EXERCISE_BY_ID: Record<string, ExerciseSpec> = Object.fromEntries(
  EXERCISES.map((exercise) => [exercise.id, exercise]),
);

export const MOVILIDAD = EXERCISES.filter((e) => e.category === "movilidad");
export const FUERZA = EXERCISES.filter((e) => e.category === "fuerza");
