import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { RuleLineNote } from "@/components/data/duties/rule-line";
import { MarkFields, StatusFields, StepFields } from "@/components/data/marks/mark-fields";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readMark, type MarkClock, type MarkPage } from "@/lib/data/api/marks";
import { FLAGS, dayWords, rupees } from "@/lib/data/labels-company";
import { MARK_KINDS, NO_RULE_BOOK, REGISTER_ABOUT, WATCH_LINE } from "@/lib/data/labels-security";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import {
  markFileAction,
  markRenewedAction,
  markStatusAction,
  markStepAction,
  markWatchAction,
  updateMarkAction,
} from "../actions";
import "../../registers.css";

export const metadata = { title: "Trademark" };
export const dynamic = "force-dynamic";

const BASE = "/data/registers/marks";
const MARK_ID = /^[A-Za-z0-9-]{1,64}$/;
const DEAD = new Set(["refused", "abandoned", "withdrawn", "removed"]);

const EVENT_WORDS: Record<string, string> = {
  added: "Added",
  changed: "Changed",
  step: "Step recorded",
  status: "Status",
  renewed: "Renewed",
  "watch note": "Watch note",
  "file attached": "File attached",
  "file detached": "File detached",
};

export default async function MarkRecordPage({ params }: { params: Promise<{ markId: string }> }) {
  const { markId } = await params;
  const { allowed } = await requireData(`${BASE}/${markId}`);
  if (!MARK_ID.test(markId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readMark(markId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Trademark" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <MarkRecord page={read.data} now={now} />;
}

function clockState(clock: MarkClock, today: string, dead: boolean): string {
  if (clock.done) return "Done";
  if (clock.open) return clock.due_on && clock.due_on < today ? "Passed" : "Open";
  if (dead) return "Ended";
  return "Not running";
}

function MarkRecord({ page, now }: { page: MarkPage; now: number }) {
  const { mark, today } = page;
  const dead = DEAD.has(mark.status);
  const fields = { mark_id: mark.mark_id };
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/data/registers", label: "Registers" },
          { href: BASE, label: "Trademarks" },
        ]}
        title={`${mark.name}, class ${mark.class_number}`}
        status={
          <StatusPill
            value={mark.status}
            label={mark.status_label}
            tone={mark.status === "registered" ? "live" : "neutral"}
          />
        }
        readouts={[
          { label: "Application", value: mark.application_number || "Not filed" },
          { label: "Applied", value: mark.applied_on ? dayWords(mark.applied_on) : "Not yet" },
          { label: "Next date", value: mark.next ? mark.next.words : "None" },
        ]}
        actions={
          <>
            <Popover label="Edit" variant="primary" align="start" width="wide">
              <MailForm
                action={updateMarkAction}
                fields={fields}
                submitLabel="Save"
                pendingLabel="Saving…"
                className="stack-form stack-form--tight"
              >
                <MarkFields prefix="mark-edit" values={mark} today={today} />
              </MailForm>
            </Popover>
            <Popover label="Change the status" align="start">
              <MailForm
                action={markStatusAction}
                fields={fields}
                submitLabel="Save"
                pendingLabel="Saving…"
              >
                <StatusFields prefix="mark-status" values={mark} today={today} />
              </MailForm>
            </Popover>
            {mark.expires_on_now && (
              <Popover label="Record a renewal" align="start">
                <MailForm
                  action={markRenewedAction}
                  fields={fields}
                  submitLabel="Record the renewal"
                  pendingLabel="Saving…"
                >
                  <Field id="renewal-on" label="Renewed on">
                    <Input
                      id="renewal-on"
                      name="renewed_on"
                      type="date"
                      max={today}
                      defaultValue={today}
                    />
                  </Field>
                  <Field
                    id="renewal-expires"
                    label="New expiry"
                    hint="Filled in as the old expiry plus the term. Check it on the renewal."
                  >
                    <Input
                      id="renewal-expires"
                      name="expires_on"
                      type="date"
                      required
                      defaultValue={page.renewal_expires_on ?? ""}
                    />
                  </Field>
                  <Field id="renewal-srn" label="Reference">
                    <Input id="renewal-srn" name="srn" className="mono" maxLength={40} />
                  </Field>
                </MailForm>
              </Popover>
            )}
          </>
        }
      />
      <RecordGrid side={<Side page={page} />}>
        <div className="hqdata-mark">
          <p className="page-note">{REGISTER_ABOUT}</p>
          <RecordSection
            id="mark-dates"
            title="Dates"
            actions={
              <Popover label="Record a step" align="end">
                <MailForm
                  action={markStepAction}
                  fields={fields}
                  submitLabel="Record the step"
                  pendingLabel="Saving…"
                >
                  <StepFields prefix="mark-step" today={today} />
                </MailForm>
              </Popover>
            }
          >
            {!page.rules_here && <p className="hqdata-rule-line">{NO_RULE_BOOK}</p>}
            <DataTable
              caption="Dates"
              columns={[
                { key: "step", label: "Step", width: "30%" },
                { key: "day", label: "Day" },
                { key: "due", label: "Due" },
                { key: "state", label: "State" },
              ]}
              columnMenu={false}
              scroll={false}
              isEmpty={page.clocks.length === 0}
              empty={
                <p className="page-note">
                  No dates yet. Record the application day, then each step as it comes.
                </p>
              }
            >
              {page.clocks.map((clock) => (
                <tr key={clock.key} id={`clock-${clock.key}`}>
                  <td>
                    <span className="table-title">{clock.title}</span>
                    <RuleLineNote line={clock.rule} />
                  </td>
                  <td className="nowrap">
                    {clock.base_on ? dayWords(clock.base_on) : <span className="quiet">—</span>}
                  </td>
                  <td className="nowrap">
                    {clock.due_on ? (
                      dayWords(clock.due_on)
                    ) : (
                      <span className="quiet">Not worked out</span>
                    )}
                  </td>
                  <td>{clockState(clock, today, dead)}</td>
                </tr>
              ))}
            </DataTable>
          </RecordSection>
          <RecordSection id="mark-fee" title="Fee">
            <p>
              Fee paid for this class:{" "}
              {mark.fee_paid === null ? "Not recorded" : rupees(mark.fee_paid)}.
              {mark.filed_as_startup !== "yes" && " Not filed as a recognised startup."}
            </p>
            {page.fee_check?.words && <p>{page.fee_check.words}</p>}
            <p>
              {page.fee.rule ? (
                <RuleLineNote line={page.fee.rule} />
              ) : (
                <span className="hqdata-rule-line">
                  The sources give {page.fee.readings.map((item) => item.label).join(" and ")}.{" "}
                  {NO_RULE_BOOK}
                </span>
              )}
            </p>
          </RecordSection>
          <RecordSection id="mark-renewals" title="Renewals">
            {mark.renewals.length === 0 ? (
              <p className="page-note">No renewal recorded.</p>
            ) : (
              <DataTable
                caption="Renewals"
                columns={[
                  { key: "on", label: "Renewed on" },
                  { key: "expires", label: "New expiry" },
                  { key: "srn", label: "Reference" },
                  { key: "by", label: "Recorded by" },
                ]}
                columnMenu={false}
                scroll={false}
              >
                {mark.renewals.map((renewal) => (
                  <tr key={`${renewal.renewed_on}-${renewal.at}`}>
                    <td>{dayWords(renewal.renewed_on)}</td>
                    <td>{dayWords(renewal.expires_on)}</td>
                    <td className="mono">{renewal.srn || "—"}</td>
                    <td>{renewal.by.name}</td>
                  </tr>
                ))}
              </DataTable>
            )}
          </RecordSection>
          <RecordSection
            id="mark-watch"
            title="Watch notes"
            actions={
              <Popover label="Add a note" align="end" width="wide">
                <MailForm
                  action={markWatchAction}
                  fields={fields}
                  submitLabel="Add the note"
                  pendingLabel="Saving…"
                >
                  <Field id="watch-text" label="Note">
                    <Textarea id="watch-text" name="text" rows={3} minLength={2} maxLength={1000} />
                  </Field>
                  <Field id="watch-on" label="On">
                    <Input id="watch-on" name="on" type="date" max={today} defaultValue={today} />
                  </Field>
                </MailForm>
              </Popover>
            }
          >
            <p className="page-note">{WATCH_LINE}</p>
            {mark.watch.length === 0 ? (
              <p className="page-note">No notes yet.</p>
            ) : (
              <ul className="hqdata-registers__list">
                {mark.watch.map((note) => (
                  <li key={note.note_id}>
                    {dayWords(note.on)}: {note.text} <span className="quiet">({note.by.name})</span>
                  </li>
                ))}
              </ul>
            )}
          </RecordSection>
          <RecordSection
            id="mark-files"
            title="Files"
            actions={
              page.files_here ? (
                <Popover label="Attach a file" align="end" width="wide">
                  <MailForm
                    action={markFileAction}
                    fields={fields}
                    submitLabel="Attach it"
                    pendingLabel="Attaching…"
                  >
                    <CopyFields
                      prefix="mark-file"
                      label="The paper"
                      files={page.file_choices}
                      filesHere={page.files_here}
                      folder="Company › Trademarks"
                    />
                  </MailForm>
                </Popover>
              ) : undefined
            }
          >
            {page.files.length === 0 ? (
              <p className="page-note">
                No papers attached: the application, the examination report and the certificate
                belong here.
              </p>
            ) : (
              <ul className="hqdata-registers__list">
                {page.files.map((item) => (
                  <li key={item.file_id}>
                    {item.file ? (
                      <Link className="text-link" href={`/data/files/${item.file.file_id}`}>
                        {item.file.title}
                      </Link>
                    ) : (
                      <span className="quiet">A file no longer in Files</span>
                    )}
                    <RowAction
                      action={markFileAction}
                      fields={{ ...fields, file_id: item.file_id, detach: "1" }}
                      buttons={[{ label: "Detach", className: "btn btn--small btn--ghost" }]}
                      className="hqdata-registers__inline"
                    />
                  </li>
                ))}
              </ul>
            )}
          </RecordSection>
          <RecordSection id="mark-activity" title="Activity">
            {page.events.length === 0 ? (
              <p className="timeline-empty">Nothing has happened yet.</p>
            ) : (
              <ol className="timeline">
                {page.events.map((event) => (
                  <li key={event.event_id} className="timeline__item">
                    <span className="timeline__kind">{EVENT_WORDS[event.verb] ?? event.verb}</span>
                    <div>
                      <p className="timeline__meta">
                        <span className="timeline__actor">{event.by.name}</span>
                        <Timestamp value={event.at} now={now} mode="relative" />
                      </p>
                      {event.detail && <p className="timeline__body">{event.detail}</p>}
                    </div>
                  </li>
                ))}
              </ol>
            )}
          </RecordSection>
        </div>
      </RecordGrid>
    </>
  );
}

function Side({ page }: { page: MarkPage }) {
  const { mark } = page;
  const steps = mark.steps;
  return (
    <Properties title="The mark">
      <Property label="Kind">{MARK_KINDS[mark.kind]}</Property>
      <Property label="Class">{mark.class_number}</Property>
      <Property label="Goods and services">{mark.goods || "Not recorded"}</Property>
      <Property label="Applicant">{mark.applicant || "Not recorded"}</Property>
      <Property label="Agent">{mark.agent || "Not recorded"}</Property>
      <Property label="Filed as a startup">{FLAGS[mark.filed_as_startup]}</Property>
      <Property label="Journal">
        {steps.journal_on
          ? `${dayWords(steps.journal_on)}${steps.journal_number ? `, number ${steps.journal_number}` : ""}`
          : "Not advertised"}
      </Property>
      <Property label="Registered">
        {steps.registered_on
          ? `${dayWords(steps.registered_on)}${steps.certificate_number ? `, certificate ${steps.certificate_number}` : ""}`
          : "Not yet"}
      </Property>
      <Property label="Expires">
        {mark.expires_on_now ? dayWords(mark.expires_on_now) : "Not known"}
      </Property>
      <Property label="Notes">{mark.notes || "None"}</Property>
    </Properties>
  );
}
