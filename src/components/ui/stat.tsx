import type { ReactNode } from "react";

type StatGridProps = {
  columns?: 2 | 3 | 4 | 6;
  label?: string;
  children: ReactNode;
};

export function StatGrid({ columns = 4, label, children }: StatGridProps) {
  return (
    <div className={`stat-grid stat-grid--${columns}`} role="list" aria-label={label}>
      {children}
    </div>
  );
}

type StatProps = {
  label: ReactNode;
  value: ReactNode;
  hint?: ReactNode;
  /** Render the value in body type (for words rather than numbers). */
  text?: boolean;
  tone?: "default" | "danger";
};

export function Stat({ label, value, hint, text, tone = "default" }: StatProps) {
  return (
    <div
      className={["stat", tone === "danger" ? "stat--danger" : ""].filter(Boolean).join(" ")}
      role="listitem"
    >
      <span className="stat__label">{label}</span>
      <span className={["stat__value", text ? "stat__value--text" : ""].filter(Boolean).join(" ")}>
        {value}
      </span>
      {hint && <span className="stat__hint">{hint}</span>}
    </div>
  );
}
