import Link from "next/link";

import { outcomeAction, resumeEnrolmentAction } from "@/app/(portal)/mail/actions";
import { MailForm } from "@/components/mail/mail-form";
import { MailTabs } from "@/components/mail/mail-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readReplies, type MailEnrolment } from "@/lib/api/mail";
import { formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Replies" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "who", label: "Person" },
  { key: "sequence", label: "Sequence" },
  { key: "step", label: "Step" },
  { key: "last", label: "Last email" },
  { key: "owner", label: "Owner" },
  { key: "record", label: "What happened" },
];

/**
 * The replies queue: HQ does not read anyone's inbox, so a reply exists here only when the
 * person it came to says so. Each outcome ends the sequence and moves the lead with it.
 */
export default async function RepliesPage() {
  const context = await requireStaff("/mail/replies");
  const now = requestNow();
  let rows: MailEnrolment[] | null = null;
  let outcomes: { key: string; label: string }[] = [];
  try {
    const page = await readReplies(context.token);
    rows = page.enrolments;
    outcomes = page.outcomes;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  const awaiting = (rows ?? []).filter((row) => row.awaiting_reply);
  const paused = (rows ?? []).filter((row) => row.state === "paused");
  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="Replies"
        description="Everyone in a sequence whose last email is a working day old. Check your inbox, then say what happened: the sequence stops, and a lead who replied moves to Connected."
        actions={<MailTabs current="/mail/replies" />}
      />
      <div className="page-content">
        {rows === null ? (
          <Callout tone="danger" role="alert">
            The replies queue could not be read just now.
          </Callout>
        ) : (
          <>
            <DataTable
              caption="Waiting for your word"
              columns={COLUMNS}
              isEmpty={awaiting.length === 0}
              empty={
                <EmptyState
                  title="Nothing to record"
                  description="When a sequence email is a working day old, the person appears here until you say whether they replied."
                />
              }
            >
              {awaiting.map((row) => (
                <tr key={row.enrolment_id}>
                  <td>
                    <Link
                      className="table-title"
                      href={
                        row.contact_kind === "lead"
                          ? `/leads/${row.contact_id}`
                          : `/people/${row.contact_id}`
                      }
                    >
                      {row.contact_name || row.email}
                    </Link>
                    <span className="table-sub">
                      {[row.company_name, row.email].filter(Boolean).join(" · ")}
                    </span>
                  </td>
                  <td>
                    <Link href={`/mail/sequences/${row.sequence_id}`}>
                      {row.sequence_name ?? "Sequence"}
                    </Link>
                  </td>
                  <td>
                    {row.current_step} of {row.steps_total}
                  </td>
                  <td>
                    <Timestamp value={row.last_sent_at} now={now} mode="relative" />
                  </td>
                  <td>{row.owner_name}</td>
                  <td>
                    {canWrite && (
                      <div className="outcome-row">
                        <RowAction
                          action={outcomeAction}
                          fields={{ enrolment_id: row.enrolment_id }}
                          buttons={[
                            {
                              label: "Interested",
                              className: "btn btn--small",
                              name: "outcome",
                              value: "replied_positive",
                              ariaLabel: `${row.contact_name}: replied, interested`,
                            },
                            {
                              label: "Meeting",
                              className: "btn btn--small",
                              name: "outcome",
                              value: "meeting_booked",
                              ariaLabel: `${row.contact_name}: meeting booked`,
                            },
                            {
                              label: "Not now",
                              className: "btn btn--small btn--ghost",
                              name: "outcome",
                              value: "not_now",
                              ariaLabel: `${row.contact_name}: not now`,
                            },
                          ]}
                        />
                        <Popover label="More" align="end">
                          <MailForm
                            action={outcomeAction}
                            fields={{ enrolment_id: row.enrolment_id }}
                            submitLabel="Record"
                          >
                            <Field id={`outcome-${row.enrolment_id}`} label="What happened">
                              <Select
                                id={`outcome-${row.enrolment_id}`}
                                name="outcome"
                                defaultValue="not_interested"
                              >
                                {outcomes.map((outcome) => (
                                  <option key={outcome.key} value={outcome.key}>
                                    {outcome.label}
                                  </option>
                                ))}
                              </Select>
                            </Field>
                            <Field
                              id={`back-${row.enrolment_id}`}
                              label="Back on (out of office only)"
                            >
                              <Input
                                id={`back-${row.enrolment_id}`}
                                name="pause_until"
                                type="date"
                              />
                            </Field>
                            <Field id={`note-${row.enrolment_id}`} label="Note">
                              <Input id={`note-${row.enrolment_id}`} name="note" maxLength={400} />
                            </Field>
                          </MailForm>
                        </Popover>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
            {paused.length > 0 && (
              <section className="record-section" aria-labelledby="replies-paused">
                <h2 className="record-section__title" id="replies-paused">
                  Paused
                </h2>
                <DataTable caption="Paused" columns={COLUMNS}>
                  {paused.map((row) => (
                    <tr key={row.enrolment_id}>
                      <td>
                        <span className="table-title">{row.contact_name || row.email}</span>
                        <span className="table-sub">{row.company_name}</span>
                      </td>
                      <td>{row.sequence_name ?? "Sequence"}</td>
                      <td>
                        {row.current_step} of {row.steps_total}
                      </td>
                      <td>
                        <Timestamp
                          value={row.last_sent_at}
                          now={now}
                          mode="relative"
                          fallback="Not yet"
                        />
                      </td>
                      <td>{row.owner_name}</td>
                      <td>
                        <span className="table-sub">
                          {row.pause_reason === "COMPANY_ENGAGED"
                            ? `A colleague at ${row.company_name || "the firm"} engaged; decide by ${row.paused_until ? formatDate(row.paused_until) : "soon"}`
                            : row.pause_reason === "OUT_OF_OFFICE"
                              ? `Out of office until ${row.paused_until ? formatDate(row.paused_until) : "they are back"}`
                              : row.pause_reason.startsWith("MISSING_TOKEN")
                                ? "The copy needs a name this record lacks"
                                : row.pause_reason}
                        </span>
                        {canWrite && (
                          <RowAction
                            action={resumeEnrolmentAction}
                            fields={{ enrolment_id: row.enrolment_id }}
                            buttons={[{ label: "Carry on", className: "btn btn--small" }]}
                          />
                        )}
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </section>
            )}
          </>
        )}
      </div>
    </>
  );
}
