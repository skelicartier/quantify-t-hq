import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { Colleagues } from "@/components/data/waitlist/colleagues";
import { HoldPreview } from "@/components/data/waitlist/hold-preview";
import { StageForm } from "@/components/data/waitlist/stage-form";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Textarea } from "@/components/ui/field";
import { InlineField } from "@/components/ui/inline-field";
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
import {
  readEntry,
  readHoldPreview,
  type EntryDetail,
  type Hold,
  type HoldPreview as Preview,
  type WaitlistEvent,
} from "@/lib/data/api/waitlist";
import { DROP_REASONS, NAMING, WAITLIST_STAGES, labelOf } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

import "../../replies/replies.css";
import {
  addColleagueAction,
  addEntryNoteAction,
  attachProofAction,
  holdAction,
  moveStageAction,
  releaseAction,
  setRoleAction,
  updateEntryAction,
} from "../actions";
import "../waitlist.css";

export const metadata = { title: "Waitlist firm" };
export const dynamic = "force-dynamic";

const ENTRY_ID = /^[0-9a-f-]{36}$/;

const KIND_WORDS: Record<WaitlistEvent["kind"], string> = {
  stage: "Stage",
  note: "Note",
  call: "Call",
  next_step: "Next step",
  person: "People",
  hold: "Held back",
  release: "Released",
  edit: "Edit",
  proof: "Proof",
};

type Params = Record<string, string | string[] | undefined>;

export default async function WaitlistEntryPage({
  params,
  searchParams,
}: {
  params: Promise<{ entryId: string }>;
  searchParams: Promise<Params>;
}) {
  const { entryId } = await params;
  const { allowed } = await requireData(`/data/waitlist/${entryId}`);
  if (!ENTRY_ID.test(entryId)) notFound();
  const now = requestNow();
  const showHold = firstSearchValue((await searchParams).hold) === "1";
  const read = allowed
    ? await dataRead(async () => {
        const [detail, preview] = await Promise.all([
          readEntry(entryId),
          showHold ? readHoldPreview(entryId) : Promise.resolve(null),
        ]);
        return { detail, preview };
      })
    : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Waitlist firm" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <Entry detail={read.data.detail} preview={read.data.preview} now={now} />;
}

/** "Joined → Call booked", "Firm type: AIF → PMS", or the event's own words. */
function eventLine(event: WaitlistEvent): string {
  if (event.kind === "stage")
    return event.from
      ? `${WAITLIST_STAGES[event.from].label} → ${event.to ? WAITLIST_STAGES[event.to].label : ""}${event.text ? ` · ${event.text}` : ""}`
      : `${event.to ? WAITLIST_STAGES[event.to].label : "Joined"}${event.text ? ` · ${event.text}` : ""}`;
  return event.text ?? "";
}

function Entry({
  detail,
  preview,
  now,
}: {
  detail: EntryDetail;
  preview: Preview | null;
  now: number;
}) {
  const { entry, events, people, holds, today } = detail;
  const base = `/data/waitlist/${entry.entry_id}`;
  const stage = WAITLIST_STAGES[entry.stage];
  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/data/waitlist", label: "Waitlist" }]}
        title={entry.firm}
        favourite={{ href: base, label: entry.firm, kind: "Waitlist firm" }}
        status={<StatusPill value={entry.stage} label={stage.label} tone={stage.tone} />}
        readouts={[
          { label: "Joined", value: formatDate(entry.joined_on) },
          { label: "In this stage since", value: formatDate(entry.stage_since) },
          {
            label: "Next step",
            value: entry.next_step
              ? entry.next_step_on
                ? formatDate(entry.next_step_on)
                : "No date"
              : "None set",
          },
          { label: "People on file", value: formatNumber(people.length) },
        ]}
        actions={
          <>
            <Popover label="Move to a stage" variant="primary" width="wide" align="start">
              <StageForm
                action={moveStageAction}
                entryId={entry.entry_id}
                stage={entry.stage}
                today={today}
              />
            </Popover>
            <Popover label="Add a note" width="wide" align="start">
              <MailForm
                action={addEntryNoteAction}
                fields={{ entry_id: entry.entry_id, kind: "note" }}
                submitLabel="Add the note"
                pendingLabel="Adding…"
              >
                <Field id="note-header" label="Note">
                  <Textarea id="note-header" name="text" rows={3} maxLength={4_000} required />
                </Field>
              </MailForm>
            </Popover>
            <Popover label="Add a call" width="wide" align="start">
              <MailForm
                action={addEntryNoteAction}
                fields={{ entry_id: entry.entry_id, kind: "call" }}
                submitLabel="Add the call"
                pendingLabel="Adding…"
              >
                <Field id="call-when" label="When">
                  <Input id="call-when" name="at" type="datetime-local" required />
                </Field>
                <Field id="call-notes" label="Notes">
                  <Textarea id="call-notes" name="text" rows={4} maxLength={4_000} required />
                </Field>
              </MailForm>
            </Popover>
          </>
        }
      />
      <RecordGrid side={<Side detail={detail} />}>
        <RecordSection id="waitlist-activity" title="Activity">
          <MailForm
            action={addEntryNoteAction}
            fields={{ entry_id: entry.entry_id, kind: "note" }}
            submitLabel="Add the note"
            pendingLabel="Adding…"
          >
            <label className="sr-only" htmlFor="note-composer">
              A note
            </label>
            <Textarea id="note-composer" name="text" rows={3} maxLength={4_000} required />
          </MailForm>
          {events.length === 0 ? (
            <p className="timeline-empty">Nothing has happened yet.</p>
          ) : (
            <ol className="timeline">
              {events.map((event) => (
                <li key={event.event_id} className={`timeline__item timeline__item--${event.kind}`}>
                  <span className="timeline__kind">{KIND_WORDS[event.kind]}</span>
                  <div>
                    <p className="timeline__meta">
                      <span className="timeline__actor">{event.by.name}</span>
                      <Timestamp value={event.at} now={now} mode="relative" />
                    </p>
                    <p className="timeline__body">
                      {event.kind === "call" && event.when && (
                        <>
                          Call on <Timestamp value={event.when} now={now} mode="absolute" />
                          {"\n"}
                        </>
                      )}
                      {eventLine(event)}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </RecordSection>

        <RecordSection
          id="waitlist-proof"
          title="Proof of the yes"
          actions={
            detail.files ? (
              <Popover label="Attach a saved copy" width="wide">
                <MailForm
                  action={attachProofAction}
                  fields={{ entry_id: entry.entry_id }}
                  submitLabel="Attach it"
                  pendingLabel="Attaching…"
                >
                  <p className="field__hint">
                    It goes into 11 Leads, lists and outreach › Waitlist proof, in Files. 3 MB at
                    most.
                  </p>
                  <Field id="proof-file" label="The saved copy">
                    <Input id="proof-file" name="file" type="file" required />
                  </Field>
                </MailForm>
              </Popover>
            ) : undefined
          }
        >
          {entry.proof.quote ? (
            <blockquote className="hqdata-quote">{entry.proof.quote}</blockquote>
          ) : (
            <p className="page-note">No words were kept with this yes.</p>
          )}
          <ul className="hqdata-proof">
            <li>From {entry.proof.from || entry.contact_email}</li>
            {entry.proof.subject && <li>Subject &ldquo;{entry.proof.subject}&rdquo;</li>}
            <li>
              {entry.proof.received_at ? (
                <>
                  Received <Timestamp value={entry.proof.received_at} now={now} mode="absolute" />
                </>
              ) : (
                `Joined on ${formatDate(entry.joined_on)}`
              )}
            </li>
            {entry.proof.recorded_by && <li>Recorded by {entry.proof.recorded_by}</li>}
            {detail.proof_file && (
              <li>
                A saved copy:{" "}
                <Link className="text-link" href={`/data/files/${detail.proof_file.file_id}`}>
                  {detail.proof_file.title}
                </Link>
              </li>
            )}
          </ul>
        </RecordSection>

        <RecordSection
          id="waitlist-people"
          title={detail.free_mail ? "Colleagues" : `Colleagues at ${entry.domain}`}
        >
          <Colleagues
            entryId={entry.entry_id}
            people={people}
            freeMail={detail.free_mail}
            domain={entry.domain}
            setRole={setRoleAction}
            addColleague={addColleagueAction}
          />
        </RecordSection>

        <RecordSection id="waitlist-hold" title="Hold back the firm's unsent addresses">
          {detail.free_mail ? (
            <p className="page-note">
              Free-mail addresses are not grouped by firm, so there is nobody to hold back.
            </p>
          ) : preview ? (
            <HoldPreview
              action={holdAction}
              entryId={entry.entry_id}
              candidates={preview.candidates}
              large={preview.large}
              peopleAtDomain={preview.people_at_domain}
              domain={entry.domain}
            />
          ) : (
            <>
              <p className="page-note">
                Nothing is held back unless you ask. The preview lists who at {entry.domain} has not
                been written to yet, and which Mail merge lists they are on.
              </p>
              <ButtonLink href={`${base}?hold=1#waitlist-hold`} size="small">
                Show the unsent addresses
              </ButtonLink>
            </>
          )}
          {holds.length > 0 && <Holds holds={holds} entryId={entry.entry_id} now={now} />}
        </RecordSection>
      </RecordGrid>
    </>
  );
}

function Holds({ holds, entryId, now }: { holds: readonly Hold[]; entryId: string; now: number }) {
  return (
    <div className="hqdata-holds">
      <h3 className="hqdata-holds__title">Held back</h3>
      {holds.map((hold) => (
        <div key={hold.hold_id} className="hqdata-holds__hold">
          <div className="hqdata-holds__head">
            <span>
              {formatNumber(hold.emails.length)} held back by {hold.made_by.name},{" "}
              <Timestamp value={hold.made_at} now={now} mode="relative" />
              {hold.open.length < hold.emails.length &&
                ` · ${formatNumber(hold.emails.length - hold.open.length)} released`}
            </span>
            {hold.open.length > 0 && (
              <RowAction
                action={releaseAction}
                fields={{ entry_id: entryId, hold_id: hold.hold_id }}
                buttons={[
                  {
                    label: hold.open.length === 1 ? "Release" : `Release all ${hold.open.length}`,
                    className: "btn btn--small",
                    pendingLabel: "Releasing…",
                  },
                ]}
              />
            )}
          </div>
          <ul className="hqdata-holds__list">
            {hold.emails.map((email) => {
              const released = hold.released.find((item) => item.email === email);
              return (
                <li key={email} className="hqdata-hold__row">
                  <span className="mono">{email}</span>
                  {released ? (
                    <span className="table-sub">
                      Released by {released.by.name},{" "}
                      <Timestamp value={released.at} now={now} mode="relative" />
                    </span>
                  ) : (
                    <RowAction
                      action={releaseAction}
                      fields={{ entry_id: entryId, hold_id: hold.hold_id, email }}
                      buttons={[
                        {
                          label: "Release",
                          className: "btn btn--small btn--ghost",
                          ariaLabel: `Release ${email}`,
                          pendingLabel: "Releasing…",
                        },
                      ]}
                    />
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}

function Side({ detail }: { detail: EntryDetail }) {
  const { entry, people } = detail;
  const inline = { action: updateEntryAction, idName: "entry_id", id: entry.entry_id };
  const contact = people.find((person) => person.email === entry.contact_email) ?? null;
  const contactOptions = people
    .filter((person) => person.on_page || person.email === entry.contact_email)
    .map((person) => ({ value: person.email, label: person.name || person.email }));
  const text = (value: string) => value || <span className="quiet">Not given</span>;
  const day = (value: string | null | undefined) =>
    value ? formatDate(value) : <span className="quiet">None set</span>;
  return (
    <>
      <Properties title="Details">
        <InlineField {...inline} name="firm" label="Firm" value={entry.firm} display={entry.firm} />
        <Property label="Domain" mono>
          {detail.free_mail ? "Free mail: not grouped" : entry.domain}
        </Property>
        <InlineField
          {...inline}
          name="firm_type"
          label="Firm type"
          value={entry.firm_type}
          display={text(entry.firm_type)}
        />
        <InlineField
          {...inline}
          name="city"
          label="City"
          value={entry.city}
          display={text(entry.city)}
        />
        <InlineField
          {...inline}
          name="country"
          label="Country"
          value={entry.country}
          display={text(entry.country)}
        />
        <InlineField
          {...inline}
          name="contact_email"
          label="Contact"
          type="select"
          options={contactOptions}
          value={entry.contact_email}
          display={
            contact ? (
              <Link className="text-link" href={`/data/leads/${contact.lead_id}`}>
                {contact.name || contact.email}
              </Link>
            ) : (
              entry.contact_email
            )
          }
        />
        <InlineField
          {...inline}
          name="how_joined"
          label="How they joined"
          value={entry.how_joined}
          display={text(entry.how_joined)}
        />
        <InlineField
          {...inline}
          name="joined_on"
          label="Joined on"
          type="date"
          value={entry.joined_on}
          display={formatDate(entry.joined_on)}
        />
        <InlineField
          {...inline}
          name="owner"
          label="Owner"
          value={entry.owner}
          display={text(entry.owner)}
        />
        <InlineField
          {...inline}
          name="next_step"
          label="Next step"
          value={entry.next_step}
          display={entry.next_step || <span className="quiet">None set</span>}
        />
        <InlineField
          {...inline}
          name="next_step_on"
          label="By"
          type="date"
          value={entry.next_step_on ?? ""}
          display={day(entry.next_step_on)}
        />
        <InlineField
          {...inline}
          name="naming"
          label="To investors"
          type="select"
          options={Object.entries(NAMING).map(([value, label]) => ({ value, label }))}
          value={entry.naming}
          display={NAMING[entry.naming]}
        />
        <InlineField
          {...inline}
          name="described_as"
          label="Described as"
          value={entry.described_as}
          display={entry.described_as}
        />
        <InlineField
          {...inline}
          name="pilot_starts_on"
          label="Pilot starts"
          type="date"
          value={entry.pilot?.starts_on ?? ""}
          display={day(entry.pilot?.starts_on)}
        />
        <InlineField
          {...inline}
          name="pilot_ends_on"
          label="Pilot ends"
          type="date"
          value={entry.pilot?.ends_on ?? ""}
          display={day(entry.pilot?.ends_on)}
        />
        <InlineField
          {...inline}
          name="pilot_success"
          label="What success looks like"
          type="textarea"
          value={entry.pilot?.success ?? ""}
          display={entry.pilot?.success || <span className="quiet">Not given</span>}
        />
        {entry.stage === "dropped" && entry.dropped && (
          <>
            <InlineField
              {...inline}
              name="drop_reason"
              label="Drop reason"
              type="select"
              options={Object.entries(DROP_REASONS).map(([value, label]) => ({ value, label }))}
              value={entry.dropped.reason}
              display={labelOf(DROP_REASONS, entry.dropped.reason)}
            />
            <InlineField
              {...inline}
              name="look_again_on"
              label="Look again on"
              type="date"
              value={entry.dropped.look_again_on ?? ""}
              display={day(entry.dropped.look_again_on)}
            />
          </>
        )}
      </Properties>
      <p className="side-quiet">
        Investors read the firm&rsquo;s name only when &ldquo;Name the firm&rdquo; is chosen;
        otherwise they read &ldquo;Described as&rdquo;. They never read an address, a name or the
        quote.
      </p>
    </>
  );
}
