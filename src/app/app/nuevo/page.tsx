import type { Metadata } from "next";
import { NewAnalysisForm } from "@/components/app/NewAnalysisForm";

export const metadata: Metadata = { title: "Nuevo análisis" };

export default function NewAnalysisPage() {
  return (
    <div className="space-y-8">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight text-ink sm:text-3xl">Analizá tu video</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted">
          Subí un video, pegá un link de YouTube o grabá con la cámara. El análisis se ejecuta automáticamente y podés ver los resultados al instante.
        </p>
      </header>
      <NewAnalysisForm />
    </div>
  );
}