import type { ReactNode } from "react";

import { formatLabel } from "@/lib/format";
import { roleLabel, roleTone } from "@/lib/access/role-labels";

type BadgeProps = {
  tone?: "default" | "owner" | "admin" | "support" | "user" | "env";
  children: ReactNode;
  className?: string;
};

export function Badge({ tone = "default", children, className }: BadgeProps) {
  return (
    <span
      className={["badge", tone !== "default" ? `badge--${tone}` : "", className ?? ""]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}

export function RoleBadge({ role }: { role: string | null | undefined }) {
  return <Badge tone={roleTone(role)}>{roleLabel(role)}</Badge>;
}

export function EnvBadge({ environment }: { environment: string | null | undefined }) {
  if (!environment) return null;
  return <Badge tone="env">{formatLabel(environment)}</Badge>;
}
