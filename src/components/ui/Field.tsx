import type { InputHTMLAttributes, SelectHTMLAttributes } from "react";

const controlClass =
  "w-full border border-ink/15 bg-canvas px-3.5 py-2.5 text-sm text-ink placeholder:text-soft focus:outline-none focus:border-ink focus:ring-0 transition-colors";

interface FieldWrapperProps {
  label: string;
  hint?: string;
  children: React.ReactNode;
}

export function Field({ label, hint, children }: FieldWrapperProps) {
  return (
    <label className="block">
      <span className="label mb-2 block text-muted">{label}</span>
      {children}
      {hint ? <span className="mt-1.5 block text-xs leading-5 text-soft">{hint}</span> : null}
    </label>
  );
}

export function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}

export function Select(props: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...props} className={`${controlClass} ${props.className ?? ""}`} />;
}