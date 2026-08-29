import Link from "next/link";

interface LogoProps {
  href?: string;
  className?: string;
}

export function Logo({ href = "/", className = "" }: LogoProps) {
  const mark = (
    <span className="inline-flex items-center gap-2.5">
      <svg
        width="20"
        height="20"
        viewBox="0 0 24 24"
        fill="none"
        aria-hidden="true"
        className="text-ink"
      >
        <circle cx="12" cy="12" r="8.5" stroke="currentColor" strokeWidth="1.4" />
        <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.4" />
        <path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="currentColor" strokeWidth="1.4" />
      </svg>
      <span className="text-[15px] font-semibold tracking-[0.22em] text-ink">LENTE</span>
    </span>
  );

  return (
    <Link href={href} className={`inline-flex items-center ${className}`} aria-label="Lente — inicio">
      {mark}
    </Link>
  );
}