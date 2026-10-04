import Link from "next/link";

import { sendOneOffAction } from "@/app/(portal)/mail/actions";
import { RecordEmailForm, type EmailRecipient } from "@/components/mail/record-email-form";
import { Callout } from "@/components/ui/callout";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readMailboxes } from "@/lib/api/mail";

/**
 * "Write an email" on a record: from the reader's own mailbox, and only when it is
 * sending. Everything else — the stop list, do-not-contact, the mailbox's day — the
 * service decides at the moment of sending and says in words if it refuses.
 */
export async function RecordEmail({
  token,
  staffId,
  recipients,
  returnPath,
  dealId = "",
  idPrefix,
}: {
  token: string;
  staffId: string;
  recipients: readonly EmailRecipient[];
  returnPath: string;
  dealId?: string;
  idPrefix: string;
}) {
  if (recipients.length === 0) {
    return <p className="muted">Nobody here has an address that may be written to.</p>;
  }
  let board: Awaited<ReturnType<typeof readMailboxes>> | null = null;
  try {
    board = await readMailboxes(token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (board === null) {
    return (
      <Callout tone="danger" compact>
        Your mailbox could not be read just now, so nothing can be written from here.
      </Callout>
    );
  }
  const mine = board.mailboxes.filter(
    (mailbox) => mailbox.owner?.staff_id.toLowerCase() === staffId.toLowerCase(),
  );
  const sending = mine.filter((mailbox) => mailbox.phase === "active");
  if (sending.length === 0) {
    return (
      <p className="muted">
        {mine[0] ? (
          <>
            Your mailbox is {mine[0].phase_label.toLowerCase()}, so nothing can go from it now.{" "}
            <Link href="/mail/mailboxes">Mailboxes</Link>
          </>
        ) : (
          <>
            An email from a record goes from your own address:{" "}
            <Link href="/mail/mailboxes">connect your mailbox</Link> to write from here.
          </>
        )}
      </p>
    );
  }
  return (
    <details className="record-email-panel">
      <summary>Write an email</summary>
      <RecordEmailForm
        action={sendOneOffAction}
        recipients={recipients}
        mailboxes={sending.map((mailbox) => ({
          value: mailbox.mailbox_id,
          label: mailbox.address,
        }))}
        returnPath={returnPath}
        dealId={dealId}
        idPrefix={idPrefix}
      />
    </details>
  );
}
