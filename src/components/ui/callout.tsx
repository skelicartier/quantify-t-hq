import type { ReactNode } from "react";

type CalloutProps = {
  tone?: "neutral" | "success" | "danger" | "attention";
  title?: ReactNode;
  role?: "status" | "alert";
  compact?: boolean;
  className?: string;
  children?: ReactNode;
};

export function Callout({
  tone = "neutral",
  title,
  role,
  compact,
  className,
  children,
}: CalloutProps) {
  return (
    <div
      className={[
        "callout",
        tone !== "neutral" ? `callout--${tone}` : "",
        compact ? "callout--compact" : "",
        className ?? "",
      ]
        .filter(Boolean)
        .join(" ")}
      role={role}
    >
      {title && <strong className="callout__title">{title}</strong>}
      {children && <div className="callout__body">{children}</div>}
    </div>
  );
}
