import type { ReactNode } from "react";

import { buttonClass, type ButtonVariant } from "@/components/ui/button";

type PopoverProps = {
  label: string;
  variant?: ButtonVariant;
  /** Which edge the panel hangs from; "end" for header actions on the right. */
  align?: "start" | "end";
  width?: "narrow" | "wide";
  children: ReactNode;
};

/**
 * A disclosure that opens a panel beside its trigger — "New company", "Edit details".
 * Native `<details>`: keyboard and screen-reader behaviour for free, no script, and it
 * works before hydration. Not for anything inside a scrolling region, which would clip
 * the panel.
 */
export function Popover({
  label,
  variant = "default",
  align = "end",
  width = "narrow",
  children,
}: PopoverProps) {
  return (
    <details className={`popover popover--${align}`}>
      <summary className={buttonClass({ variant, size: "small", className: "popover__trigger" })}>
        {label}
      </summary>
      <div className={`popover__panel popover__panel--${width}`}>{children}</div>
    </details>
  );
}
