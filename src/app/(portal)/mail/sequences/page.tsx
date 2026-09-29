import Link from "next/link";

import { MailTabs } from "@/components/mail/mail-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readSequences, type MailSequence } from "@/lib/api/mail";

export const metadata = { title: "Sequences" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "name", label: "Sequence" },
  { key: "state", label: "State" },
  { key: "for", label: "For" },
  { key: "steps", label: "Steps" },
  { key: "active", label: "In it now", align: "end" as const },
  { key: "enrolled", label: "Enrolled", align: "end" as const },
  { key: "replied", label: "Replied", align: "end" as const },
  { key: "meetings", label: "Meetings", align: "end" as const },
];

const STATE_TONES = {
  draft: "neutral",
  active: "live",
  paused: "attention",
  archived: "neutral",
} as const;
const STATE_LABELS = {
  draft: "Draft",
  active: "Live",
  paused: "Paused",
  archived: "Archived",
} as const;

function stepLine(sequence: MailSequence): string {
  return sequence.steps
    .map((step) => (step.kind === "task" ? "call" : step.thread === "reply" ? "re:" : "email"))
    .join(" · ");
}

export default async function SequencesPage() {
  const context = await requireStaff("/mail/sequences");
  let sequences: MailSequence[] | null = null;
  try {
    sequences = (await readSequences(context.token)).sequences;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="Sequences"
        description="A few short emails from one person, days apart, in the recipient's working hours. They end the moment the conversation becomes real: a reply, a meeting, a deal, a stop."
        actions={
          <>
            {canWrite && (
              <Link className="btn btn--small" href="/mail/replies">
                Replies to record
              </Link>
            )}
            {canWrite && (
              <Link className="btn btn--small btn--primary" href="/mail/sequences/new">
                New sequence
              </Link>
            )}
            <MailTabs current="/mail/sequences" />
          </>
        }
      />
      <div className="page-content">
        {sequences === null ? (
          <Callout tone="danger" role="alert">
            Sequences could not be read just now.
          </Callout>
        ) : (
          <DataTable
            caption="Sequences"
            columns={COLUMNS}
            isEmpty={sequences.length === 0}
            empty={
              <EmptyState
                title="No sequences yet"
                description="Four steps over three weeks is where most replies come from: an email, a reply in thread, a call, a last note."
              />
            }
          >
            {sequences.map((sequence) => (
              <tr
                key={sequence.sequence_id}
                className={sequence.state === "archived" ? "row--muted" : undefined}
              >
                <td>
                  <Link className="table-title" href={`/mail/sequences/${sequence.sequence_id}`}>
                    {sequence.name}
                  </Link>
                  <span className="table-sub">
                    {sequence.sender ? `As ${sequence.sender.from_email}` : "As whoever enrols"}
                  </span>
                </td>
                <td>
                  <StatusPill
                    value={sequence.state}
                    label={STATE_LABELS[sequence.state]}
                    tone={STATE_TONES[sequence.state]}
                  />
                </td>
                <td>{sequence.kind === "customer" ? "Customers" : "Prospects"}</td>
                <td>{stepLine(sequence)}</td>
                <td className="data-table__num">{sequence.counts.active}</td>
                <td className="data-table__num">{sequence.counts.enrolled}</td>
                <td className="data-table__num">{sequence.counts.replied}</td>
                <td className="data-table__num">{sequence.counts.meetings}</td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </>
  );
}
