export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2">
      <svg viewBox="0 0 32 32" className="size-8" aria-hidden>
        <rect width="32" height="32" rx="9" className="fill-surface-2" />
        <path d="M7 22 L13 16 L18 19 L25 10" fill="none" stroke="rgb(var(--accent))" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M18 19 L25 24" fill="none" stroke="rgb(var(--violet))" strokeWidth="2.4" strokeLinecap="round" strokeDasharray="2 3" />
        <circle cx="13" cy="16" r="2" fill="rgb(var(--accent))" />
      </svg>
      {!compact && <span className="font-display text-[15px] font-extrabold tracking-[0.12em]">FUTUREWISE</span>}
    </span>
  );
}
