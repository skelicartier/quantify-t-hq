import type { ReactNode } from "react";

type EmptyStateProps = {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
};

export function EmptyState({ title, description, action, compact }: EmptyStateProps) {
  return (
    <div
      className={["empty-state", compact ? "empty-state--compact" : ""].filter(Boolean).join(" ")}
    >
      <p className="empty-state__title">{title}</p>
      {description && <p className="empty-state__desc">{description}</p>}
      {action && <div className="empty-state__action">{action}</div>}
    </div>
  );
}
