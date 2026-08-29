import type { Metadata } from "next";
import { NewAnalysisForm } from "@/components/app/NewAnalysisForm";

export const metadata: Metadata = { title: "Nuevo análisis" };

export default function NewAnalysisPage() {
  return (
    <div className="space-y-8">
      <header>
        <p className="label mb-2 text-muted">Panel de análisis</p>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Nuevo análisis</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Registre el material a analizar: grabación desde su cámara, archivo subido o video detectado en YouTube.
          El resultado se organiza en indicadores, OKRs y momentos destacados.
        </p>
      </header>
      <NewAnalysisForm />
    </div>
  );
}