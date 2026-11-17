import Image from "next/image";
import { getTrainingImage } from "@/lib/training/media";

interface TrainingReferenceProps {
  exerciseId: string;
  exerciseName: string;
}

export function TrainingReference({ exerciseId, exerciseName }: TrainingReferenceProps) {
  const image = getTrainingImage(exerciseId);
  if (!image) return null;

  return (
    <figure className="space-y-3 border border-hairline bg-canvas p-4">
      <Image src={image} alt={`Referencia visual estática de ${exerciseName}`} width={720} height={1280} className="mx-auto h-auto max-h-[28rem] w-auto object-contain" />
      <figcaption className="text-xs leading-5 text-muted"><strong>Imagen generada con IA, revisada por un personal trainer.</strong> Es una referencia estática: no demuestra el movimiento completo ni valida la técnica.</figcaption>
    </figure>
  );
}
