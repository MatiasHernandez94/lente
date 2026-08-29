import type { ButtonHTMLAttributes } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "outline" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
}

const base =
  "inline-flex items-center justify-center gap-2 rounded-none transition-colors duration-150 font-medium disabled:opacity-45 disabled:pointer-events-none cursor-pointer";

const variants: Record<NonNullable<ButtonProps["variant"]>, string> = {
  primary: "bg-ink text-canvas hover:bg-muted active:bg-ink",
  outline: "border border-ink/20 text-ink hover:border-ink hover:bg-surface",
  ghost: "text-ink hover:bg-surface-2",
  danger: "text-red-900 hover:bg-red-50",
};

const sizes: Record<NonNullable<ButtonProps["size"]>, string> = {
  sm: "px-4 py-2 text-[13px]",
  md: "px-6 py-2.5 text-sm",
  lg: "px-8 py-3 text-sm",
};

export function Button({ variant = "primary", size = "md", className = "", ...props }: ButtonProps) {
  return <button className={`${base} ${variants[variant]} ${sizes[size]} ${className}`} {...props} />;
}