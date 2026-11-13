import type { ReactNode } from "react";

import { Callout } from "@/components/ui/callout";
import { Field, Input } from "@/components/ui/field";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import type { MergeMailing, MergeRecipientState } from "@/lib/merge/api";

/** What a mailing is doing, in a word: practice is never called sending. */
export function mailingStanding(mailing: Pick<MergeMailing, "state" | "mode">): {
  label: string;
  tone: PillTone;
} {
  const practice = mailing.mode === "practice";
  if (mailing.state === "sending")
    return practice
      ? { label: "Practising", tone: "attention" }
      : { label: "Sending", tone: "live" };
  if (mailing.state === "paused") return { label: "Paused", tone: "attention" };
  if (mailing.state === "finished")
    return practice ? { label: "Practised", tone: "neutral" } : { label: "Sent", tone: "live" };
  if (mailing.state === "cancelled") return { label: "Cancelled", tone: "neutral" };
  return { label: "Draft", tone: "neutral" };
}

export function MailingPill({ mailing }: { mailing: Pick<MergeMailing, "state" | "mode"> }) {
  const standing = mailingStanding(mailing);
  return <StatusPill value={mailing.state} label={standing.label} tone={standing.tone} />;
}

const RECIPIENT: Record<MergeRecipientState, { label: string; tone: PillTone }> = {
  waiting: { label: "Waiting", tone: "neutral" },
  sent: { label: "Sent", tone: "live" },
  failed: { label: "Refused", tone: "danger" },
  skipped: { label: "Left out", tone: "neutral" },
  unknown: { label: "No answer", tone: "attention" },
};

export function RecipientPill({
  state,
  practice,
}: {
  state: MergeRecipientState;
  practice: boolean;
}) {
  const standing = RECIPIENT[state];
  return (
    <StatusPill
      value={state}
      label={practice && state === "sent" ? "Practised" : standing.label}
      tone={practice && state === "sent" ? "neutral" : standing.tone}
    />
  );
}

/** The sender is a program beside the portal; when it is not running, say so and how. */
export function SenderDown({ children }: { children?: ReactNode }) {
  return (
    <Callout tone="danger" role="alert" title="The sender is not running">
      Mail merge is done by a small program on this computer, and it is not answering. Nothing is
      lost: the lists and what was sent are kept. Start it in a terminal, leave that window open,
      and reload this page:
      <pre className="merge-command">cd ~/Library/Caches/hq-work/hq && npm run mail-merge</pre>
      {children}
    </Callout>
  );
}

/** A file and a name: what adding a list asks for. */
export function ImportListFields() {
  return (
    <>
      <Field
        id="merge-file"
        label="The file"
        hint="A CSV from a spreadsheet: the first row names the columns, one of them the email address. Every column is kept as a field for the message."
      >
        <Input id="merge-file" name="file" type="file" accept=".csv,.tsv,.txt,text/csv" required />
      </Field>
      <Field id="merge-list-name" label="Name" hint="Optional: the file's own name otherwise.">
        <Input id="merge-list-name" name="name" maxLength={120} />
      </Field>
    </>
  );
}
