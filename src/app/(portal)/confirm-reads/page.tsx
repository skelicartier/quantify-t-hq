import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { requireStaff } from "@/lib/access/core";
import { sanitizeNextPath } from "@/lib/auth/route-policy";
import { formatAbsolute } from "@/lib/format";

export const metadata = { title: "Keep reading" };
export const dynamic = "force-dynamic";

type SearchParams = Promise<{ next?: string | string[]; held?: string | string[] }>;

function one(value: string | string[] | undefined): string {
  return (Array.isArray(value) ? value[0] : value) ?? "";
}

/**
 * Where a record read lands when the read watch refused it: past three hundred records
 * in an hour a fresh code is needed to go on, and past six hundred reading waits for an
 * owner. Said plainly, with the way back — never a blank "could not be read".
 */
export default async function ConfirmReadsPage({ searchParams }: { searchParams: SearchParams }) {
  const parameters = await searchParams;
  const next = sanitizeNextPath(one(parameters.next));
  const held = one(parameters.held) === "1";
  const context = await requireStaff(`/confirm-reads?next=${encodeURIComponent(next)}`);
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  if (held) {
    return (
      <>
        <PageHeader eyebrow="My account" title="Reading is paused" />
        <div className="page-content">
          <Callout tone="attention">
            You opened more than six hundred different records within an hour, so HQ stopped showing
            you records. The owners have been told. Ask one of them to clear it once they know it
            was real work — the lists and your own tasks still open meanwhile.
          </Callout>
          <p className="page-note">
            <Link href="/home">Go to Home</Link>
          </p>
        </div>
      </>
    );
  }
  return (
    <>
      <PageHeader eyebrow="My account" title="Confirm it's you to keep reading" />
      <div className="page-content">
        <Callout tone="neutral">
          You have opened more than three hundred different records in the last hour. That is
          allowed, and it is also what copying HQ looks like — so each further record needs a fresh
          code from your authenticator app, which lasts ten minutes.
        </Callout>
        <SudoGate
          action={confirmSudoAction}
          fresh={context.me.sudo_fresh}
          untilLabel={untilLabel}
          returnPath={`/confirm-reads?next=${encodeURIComponent(next)}`}
          purpose="Enter the six digits your authenticator app shows, then go back to what you were reading."
        />
        {context.me.sudo_fresh && (
          <p className="page-note">
            <Link className="btn btn--primary" href={next}>
              Go back to where you were
            </Link>
          </p>
        )}
      </div>
    </>
  );
}
