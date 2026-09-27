"use client";

import { useActionState, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { INITIAL_DESK_STATE, type DeskActionState } from "@/lib/support/desk-state";
import type { SavedReply } from "@/lib/api/tickets";

type ComposerProps = {
  ticketId: string;
  action: (previous: DeskActionState, formData: FormData) => Promise<DeskActionState>;
  savedReplies: readonly SavedReply[];
  canManage: boolean;
};

/**
 * One box, two sends: a public reply the customer reads, or an internal note that
 * never leaves the desk. The toggle changes the send, the border colour and the
 * button wording together, so what is about to happen is never ambiguous.
 */
export function Composer({ ticketId, action, savedReplies, canManage }: ComposerProps) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_DESK_STATE);
  const [mode, setMode] = useState<"reply" | "note">("reply");
  const [usedReplyId, setUsedReplyId] = useState("");
  const bodyRef = useRef<HTMLTextAreaElement>(null);

  function insertSavedReply(replyId: string) {
    const reply = savedReplies.find((candidate) => candidate.reply_id === replyId);
    if (!reply || !bodyRef.current) return;
    const box = bodyRef.current;
    box.value = box.value ? `${box.value.trimEnd()}\n\n${reply.body}` : reply.body;
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
      {state.status === "error" && state.message && (
        <Callout tone="danger" role="alert" compact>
          {state.message}
        </Callout>
      )}
      {canManage ? null : null}
    </form>
  );
}
