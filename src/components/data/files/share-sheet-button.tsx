"use client";

import { useActionState, useEffect, useId, useState } from "react";

import { AttemptField } from "@/components/ui/attempt-field";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Timestamp } from "@/components/ui/timestamp";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { formatBytes } from "@/lib/format";
import { submitWithoutReset } from "@/lib/forms/submit-without-reset";

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

const COULD_NOT = "Your browser could not share it. Download it and attach it to a message.";
const ANOTHER_WAY = "To share it another way, download it and attach it to a message.";

/**
 * The device's own share sheet, where the browser offers one for this kind of file
 * (PDFs, pictures, text and CSV; not Word, Excel, slides or zips). Elsewhere it is one
 * line saying how else to share it. Once shared, it is written down under "Shared by me".
 */
export function ShareSheetButton({
  fileId,
  name,
  type,
  title,
  logAction,
}: {
  fileId: string;
  name: string;
  type: string;
  title: string;
  logAction: Action;
}) {
  const [can, setCan] = useState<boolean | null>(null);
  const [said, setSaid] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let able = false;
    try {
      able = Boolean(navigator.canShare?.({ files: [new File([""], name, { type })] }));
    } catch {
      able = false;
    }
    const timer = window.setTimeout(() => setCan(able), 0);
    return () => window.clearTimeout(timer);
  }, [name, type]);

  async function share() {
    setBusy(true);
    setSaid("");
    try {
      const response = await fetch(`/data/files/${fileId}/download?quiet=1`);
      if (!response.ok) throw new Error("not fetched");
      const file = new File([await response.blob()], name, { type });
      await navigator.share({ files: [file], title });
      const form = new FormData();
      form.set("file_id", fileId);
      form.set("attempt", crypto.randomUUID());
      const state = await logAction(INITIAL_ACTION_STATE, form);
      setSaid(state.status === "sent" ? "Shared." : (state.message ?? ""));
    } catch (error) {
      if (!(error instanceof DOMException && error.name === "AbortError")) setSaid(COULD_NOT);
    } finally {
      setBusy(false);
    }
  }

  if (can === null) return null;
  if (!can) return <p className="side-quiet hqdata-share__line">{ANOTHER_WAY}</p>;
  return (
    <div className="hqdata-share__sheet">
      <Button size="small" disabled={busy} onClick={() => void share()}>
        {busy ? "Sharing…" : "Share…"}
      </Button>
      {said && (
        <p className={said === "Shared." ? "form-sent" : "field__error"} role="status">
          {said}
        </p>
      )}
    </div>
  );
}

/**
 * "Send by email": the current version attached, from the address Mail merge sends from.
 * Only for a file of 3 MB or less; a larger one says to send it from the mail app.
 */
export function SendByEmailForm({
  fileId,
  title,
  size,
  maxBytes,
  fromName,
  fromEmail,
  action,
}: {
  fileId: string;
  title: string;
  size: number;
  maxBytes: number;
  fromName: string;
  fromEmail: string;
  action: Action;
}) {
  const [state, formAction, isPending] = useActionState(action, INITIAL_ACTION_STATE);
  const toId = useId();
  const subjectId = useId();
  const messageId = useId();
  if (size > maxBytes)
    return (
      <p className="side-quiet">
        This file is {formatBytes(size)}, too large to attach. Download it and send it from your
        mail app.
      </p>
    );
  let sentAt = "";
  if (state.status === "sent" && state.detail) {
    try {
      sentAt = String((JSON.parse(state.detail) as { at?: unknown }).at ?? "");
    } catch {
      sentAt = "";
    }
  }
  return (
    <form
      className="stack-form stack-form--tight hqdata-share"
      onSubmit={submitWithoutReset(formAction)}
    >
      <AttemptField state={state} />
      <input type="hidden" name="file_id" value={fileId} />
      <Field
        id={toId}
        label="To"
        hint="One or more addresses, with commas or spaces between them; ten at most."
      >
        <Input
          id={toId}
          name="to"
          required
          maxLength={2_000}
          autoComplete="off"
          placeholder="name@firm.example"
          disabled={isPending}
        />
      </Field>
      <Field id={subjectId} label="Subject">
        <Input
          id={subjectId}
          name="subject"
          maxLength={200}
          defaultValue={title}
          disabled={isPending}
        />
      </Field>
      <Field id={messageId} label="Message">
        <Textarea
          id={messageId}
          name="message"
          rows={4}
          maxLength={2_000}
          defaultValue={`Please find ${title} attached.`}
          disabled={isPending}
        />
      </Field>
      <p className="side-quiet hqdata-share__from">
        {formatBytes(size)} attached. It goes from {fromName || fromEmail} &lt;
        {fromEmail || "no address set"}&gt;, the address Mail merge sends from, and counts toward
        the provider&rsquo;s daily limit.
      </p>
      <div className="form-actions">
        <Button type="submit" size="small" disabled={isPending}>
          {isPending ? "Sending…" : "Send by email"}
        </Button>
      </div>
      {state.status === "error" && state.message && (
        <Callout tone="danger" role="alert" compact>
          {state.message}
        </Callout>
      )}
      {state.status === "sent" && state.message && (
        <p className="form-sent" role="status">
          {state.message.replace(/\.$/, "")}
          {sentAt && (
            <>
              {" · "}
              <Timestamp value={sentAt} mode="absolute" />
            </>
          )}
        </p>
      )}
    </form>
  );
}
