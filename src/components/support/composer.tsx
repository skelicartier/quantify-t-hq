"use client";

import { useActionState, useEffect, useRef, useState } from "react";

import { COMPOSER_MODE_EVENT } from "@/components/support/desk-keys";
import { Button } from "@/components/ui/button";
import { FormFeedback } from "@/components/ui/form-feedback";
import { AttemptField } from "@/components/ui/attempt-field";
import { INITIAL_DESK_STATE, type DeskActionState } from "@/lib/support/desk-state";
import type { SavedReply } from "@/lib/api/tickets";

type ComposerProps = {
  ticketId: string;
  action: (previous: DeskActionState, formData: FormData) => Promise<DeskActionState>;
  savedReplies: readonly SavedReply[];
  /** What `{{first_name}}`, `{{name}}`, `{{plan}}` and `{{me}}` become when a saved reply is inserted. */
  variables?: Readonly<Record<string, string>> | undefined;
};

/**
 * `{{name}}` becomes the value, `{{name|there}}` the fallback when the value is empty; an
 * unknown variable is left as written so it is noticed before it is sent.
 */
export function fillVariables(body: string, variables: Readonly<Record<string, string>>): string {
  return body.replace(
    /\{\{\s*([a-z_]+)\s*(?:\|([^}]*))?\}\}/gi,
    (match, key: string, fallback?: string) => {
      const name = key.toLowerCase();
      if (!(name in variables)) return match;
      const value = variables[name] ?? "";
      return value || (fallback ?? "").trim();
    },
  );
}

/**
 * One box, two sends: a public reply the customer reads, or an internal note that
 * never leaves the desk. The toggle changes the send, the border colour and the
 * button wording together, so what is about to happen is never ambiguous.
 */
export function Composer({ ticketId, action, savedReplies, variables = {} }: ComposerProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_DESK_STATE);
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [usedReplyId, setUsedReplyId] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  // `r` and `n` from the keyboard: switch the kind and put the cursor in the box.
  useEffect(() => {
    const onMode = (event: Event) => {
      const wanted = (event as CustomEvent<string>).detail === "note" ? "note" : "reply";
      setMode(wanted);
      bodyRef.current?.focus();
    };
    window.addEventListener(COMPOSER_MODE_EVENT, onMode);
    return () => window.removeEventListener(COMPOSER_MODE_EVENT, onMode);
  }, []);

  function insertSavedReply(replyId: string) {
    const reply = savedReplies.find((candidate) => candidate.reply_id === replyId);
    if (!reply || !bodyRef.current) return;
    const box = bodyRef.current;
    const filled = fillVariables(reply.body, variables);
    box.value = box.value ? `${box.value.trimEnd()}\n\n${filled}` : filled;
    box.focus();
    setUsedReplyId(replyId);
  }

  const isNote = mode === "note";
  return (
    <form
      className={isNote ? "composer composer--note" : "composer"}
      action={formAction}
      key={state.sentAt ?? "composer"}
    >
      <AttemptField state={state} />
      <input type="hidden" name="ticket_id" value={ticketId} />
      <input type="hidden" name="mode" value={mode} />
      <input type="hidden" name="used_reply_id" value={usedReplyId} />
      <div className="composer__bar" aria-label="Message kind">
        <button
          type="button"
          aria-pressed={!isNote}
          className={!isNote ? "composer__tab composer__tab--active" : "composer__tab"}
          onClick={() => setMode("reply")}
        >
          Public reply
        </button>
        <button
          type="button"
          aria-pressed={isNote}
          className={isNote ? "composer__tab composer__tab--active" : "composer__tab"}
          onClick={() => setMode("note")}
        >
          Internal note
        </button>
        {savedReplies.length > 0 && !isNote && (
          <label className="composer__saved">
            <span className="sr-only">Insert a saved reply</span>
            <select
              value=""
              onChange={(event) => insertSavedReply(event.target.value)}
              disabled={isPending}
            >
              <option value="" disabled>
                Insert saved reply…
              </option>
              {savedReplies
                .filter((reply) => !reply.archived)
                .map((reply) => (
                  <option key={reply.reply_id} value={reply.reply_id}>
                    {reply.title}
                  </option>
                ))}
            </select>
          </label>
        )}
      </div>
      <textarea
        ref={bodyRef}
        className="composer__body"
        name="body"
        rows={5}
        maxLength={8000}
        required
        disabled={isPending}
        placeholder={
          isNote
            ? "For the desk only. The customer never sees a note."
            : "The customer reads this, signed as Support Team."
        }
        aria-label={isNote ? "Internal note" : "Public reply"}
      />
      <div className="composer__foot">
        <span className="composer__hint">
          {isNote
            ? "Notes move nothing: the reply timer keeps running."
            : "Sending marks the thread as waiting on the customer."}
        </span>
        <Button variant={isNote ? "default" : "primary"} type="submit" disabled={isPending}>
          {isPending ? "Sending…" : isNote ? "Add note" : "Send reply"}
        </Button>
      </div>
      <FormFeedback state={state} sentLabel={isNote ? "Note added." : "Reply sent."} />
    </form>
  );
}
