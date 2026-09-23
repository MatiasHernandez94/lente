import type { UserRol } from "../schema";

export interface Deporte {
  id: string;
  nombre: string;
  destacado: boolean;
}

export interface TutorLink {
  profesor: {
    id: string;
    name: string;
    email: string;
    deporteDocente: string | null;
  };
  createdAt: string;
}

export interface ProfileInput {
  pesoKg?: number | null;
  alturaCm?: number | null;
  rol?: UserRol;
  deporteDocente?: string | null;
  tutorEmail?: string | null;
  termsAccepted?: boolean;
  termsAcceptedAt?: string | null;
}