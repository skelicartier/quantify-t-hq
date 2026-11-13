"use client";

import Link from "next/link";
import { useActionState, type ReactNode } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button, type ButtonVariant } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

/** The link an answer carries in `detail` (`{href, label}`), when it is one of this portal's. */
function linkOf(state: ActionState): { href: string; label: string } | null {
  if (state.status === "idle" || !state.detail) return null;
  try {
    const parsed = JSON.parse(state.detail) as { href?: unknown; label?: unknown };
    return typeof parsed.href === "string" && parsed.href.startsWith("/")
      ? { href: parsed.href, label: typeof parsed.label === "string" ? parsed.label : "Open it" }
      : null;
  } catch {
    return null;
  }
}

/**
 * A form whose outcome names a record: "Made “Walk 21” in Mail merge with 290 people.
 * Open it", or "That address is already a lead. Open it". Otherwise as `MailForm`: hidden
 * fields, the page's inputs, one submit, the sentence under it. It clears after a success.
 */
export function LinkingForm({
  action,
  fields = {},
  children,
  submitLabel,
  pendingLabel = "Working…",
  variant = "default",
  className = "stack-form stack-form--tight",
}: {
  action: Action;
  fields?: Record<string, string>;
  children?: ReactNode;
  submitLabel: string;
  pendingLabel?: string;
  variant?: ButtonVariant;
  className?: string;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const link = linkOf(state);
  return (
    <form key={state.sentAt ?? "form"} className={className} action={formAction}>
      <AttemptField state={state} />
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      {children}
      <div className="form-actions">
        <Button type="submit" size="small" variant={variant} disabled={isPending}>
          {isPending ? pendingLabel : submitLabel}
        </Button>
      </div>
      <FormFeedback state={state} />
      {link && (
        <p className="hqdata-linked">
          <Link className="text-link" href={link.href}>
            {link.label}
          </Link>
        </p>
      )}
    </form>
  );
}
