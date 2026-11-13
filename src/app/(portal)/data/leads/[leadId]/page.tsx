import Link from "next/link";
import { notFound } from "next/navigation";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import { LeadBadges, LeadStatus } from "@/components/data/leads/lead-status";
import { FollowUpActions } from "@/components/data/replies/follow-up-actions";
import { ReplyForm } from "@/components/data/replies/reply-form";
import { TakeBack, effectWords, undoneWords } from "@/components/data/replies/take-back";
import { MailForm } from "@/components/mail/mail-form";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { InlineField } from "@/components/ui/inline-field";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
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
import { readLead, type LeadDetail } from "@/lib/data/api/leads";
import { readTakeBackPreview, type TakeBackPlan } from "@/lib/data/api/replies";
import {
  LEAD_FIELDS,
  OUTCOMES,
  STOP_REASONS,
  TAKEN_BACK,
  WAITLIST_STAGES,
  labelOf,
  toneOf,
} from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import {
  doneFollowUpAction,
  moveFollowUpAction,
  recordReplyAction,
  takeBackReplyAction,
} from "../../replies/actions";
import "../../replies/replies.css";
import {
  addLeadNoteAction,
  deleteLeadNoteAction,
  stopLeadAction,
  tagLeadAction,
  unstopLeadAction,
  updateLeadAction,
} from "../actions";
import "../leads.css";

export const metadata = { title: "Lead" };
export const dynamic = "force-dynamic";

const LEAD_ID = /^[0-9a-f]{32}$/;

const KIND_WORDS: Record<string, string> = {
  sent: "Sent",
  reply: "Reply",
  take_back: "Taken back",
  note: "Note",
  edit: "Edit",
  tag: "Tag",
  stop: "Stop list",
  unstop: "Stop list",
  added: "Added",
  follow_up: "Follow-up",
  follow_up_done: "Follow-up",
};

const EMAIL_KIND_OPTIONS = [
  { value: "", label: "Not judged" },
  { value: "named", label: "Named" },
  { value: "role", label: "Shared" },
  { value: "personal-domain", label: "Free mail" },
];

const TEXT_FIELDS = [
  "full_name",
  "first_name",
  "last_name",
  "title",
  "company",
  "firm_type",
  "website",
  "country",
  "city",
  "phone",
  "registration_no",
  "source",
  "source_url",
  "email_kind",
  "notes",
] as const;

const FIELD_LABELS: Record<(typeof TEXT_FIELDS)[number], string> = {
  ...LEAD_FIELDS,
  full_name: "Name",
  company: "Firm",
  source_url: "Source page",
  notes: "Notes from the file",
};

function writtenTimes(count: number): string {
  if (count === 0) return "Never";
  if (count === 1) return "Once";
  return `${formatNumber(count)} times`;
}

export default async function LeadPage({ params }: { params: Promise<{ leadId: string }> }) {
  const { leadId } = await params;
  const { context, allowed } = await requireData(`/data/leads/${leadId}`);
  if (!LEAD_ID.test(leadId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readLead(leadId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Lead" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  const { lead, today } = read.data;
  const plans = new Map<string, TakeBackPlan>();
  await Promise.all(
    lead.replies
      .filter((reply) => !reply.taken_back)
      .map(async (reply) => {
        try {
          plans.set(reply.reply_id, await readTakeBackPreview(reply.reply_id));
        } catch {
          // without a preview there is no "Take this back"; the reply still shows
        }
      }),
  );
  return <Lead lead={lead} today={today} now={now} plans={plans} me={context.me.staff.staff_id} />;
}

function Lead({
  lead,
  today,
  now,
  plans,
  me,
}: {
  lead: LeadDetail;
  today: string;
  now: number;
  plans: ReadonlyMap<string, TakeBackPlan>;
  me: string;
}) {
  const title = lead.name || lead.email;
  const base = `/data/leads/${lead.lead_id}`;
  const latest = lead.replies.find((reply) => !reply.taken_back) ?? null;
  const saidNo = lead.replies.find(
    (reply) => !reply.taken_back && reply.outcome === "not_interested",
  );
  const stopped = lead.stop !== null;
  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/data/leads", label: "All leads" }]}
        title={title}
        favourite={{ href: base, label: title, kind: "Lead" }}
        status={
          <>
            <LeadStatus status={lead.status} />
            <LeadBadges badges={lead.badges} />
            {lead.sending_to_them && <LiveRefresh intervalSeconds={30} label="This lead" />}
          </>
        }
        readouts={[
          { label: "Written to", value: writtenTimes(lead.times_written) },
          {
            label: "Last written",
            value: lead.last_written_at ? (
              <Timestamp value={lead.last_written_at} now={now} mode="relative" />
            ) : (
              "Never"
            ),
          },
          {
            label: "Replied",
            value: latest
              ? `${OUTCOMES[latest.outcome].label}, ${formatDate(latest.received_at)}`
              : "Not yet",
          },
          {
            label: "At the firm",
            value: lead.firm.free_mail
              ? "Free mail"
              : `${formatNumber(lead.firm.total)} ${lead.firm.total === 1 ? "person" : "people"}`,
          },
        ]}
        actions={
          <>
            <Popover label="Record a reply" variant="primary" width="wide">
              <ReplyForm action={recordReplyAction} today={today} now={now} email={lead.email} />
            </Popover>
            <Popover label="Add a note" width="wide">
              <MailForm
                action={addLeadNoteAction}
                fields={{ lead_id: lead.lead_id }}
                submitLabel="Add the note"
                pendingLabel="Adding…"
              >
                <Field id="note-header" label="Note">
                  <Textarea id="note-header" name="text" rows={3} maxLength={4_000} required />
                </Field>
              </MailForm>
            </Popover>
            <Popover label="More" width="wide">
              <div className="hqdata-more">
                {stopped ? (
                  <section>
                    <h3>Take off the stop list</h3>
                    <MailForm
                      action={unstopLeadAction}
                      fields={{ lead_id: lead.lead_id }}
                      submitLabel="Take off the stop list"
                      pendingLabel="Taking off…"
                    >
                      <p className="field__hint">Mail merge may write to them again.</p>
                    </MailForm>
                  </section>
                ) : (
                  <section>
                    <h3>Put on the stop list</h3>
                    <MailForm
                      action={stopLeadAction}
                      fields={{ lead_id: lead.lead_id }}
                      submitLabel="Put on the stop list"
                      pendingLabel="Adding…"
                      variant="danger"
                    >
                      <Field id="stop-why" label="Why">
                        <Select id="stop-why" name="reason" defaultValue="asked">
                          <option value="asked">They asked to stop</option>
                          <option value="manual">Do not write to them</option>
                        </Select>
                      </Field>
                      <Field id="stop-note" label="Note">
                        <Input id="stop-note" name="note" maxLength={200} />
                      </Field>
                    </MailForm>
                  </section>
                )}
                <section>
                  <h3>Add a tag</h3>
                  <MailForm
                    action={tagLeadAction}
                    fields={{ lead_id: lead.lead_id }}
                    submitLabel="Add the tag"
                    pendingLabel="Adding…"
                  >
                    <Field id="tag-add" label="Tag">
                      <Input id="tag-add" name="tag" maxLength={40} required />
                    </Field>
                  </MailForm>
                </section>
              </div>
            </Popover>
          </>
        }
      />
      <div className="hqdata-banners">
        {lead.stop && !lead.firm_hold && (
          <Callout tone="danger" compact>
            On the stop list since {formatDate(lead.stop.at)}: {STOP_REASONS[lead.stop.reason]}.
            {lead.stop.why === "said_no" &&
              saidNo &&
              ` Said no on ${formatDate(saidNo.received_at)}.`}
          </Callout>
        )}
        {lead.firm_hold && (
          <Callout tone="attention" compact>
            Held back: firm already joined ({lead.firm_hold.firm} said yes on{" "}
            {formatDate(lead.firm_hold.on)}).{" "}
            {lead.waitlist && (
              <Link className="text-link" href={`/data/waitlist/${lead.waitlist.entry_id}`}>
                Release it on the firm&rsquo;s page
              </Link>
            )}
          </Callout>
        )}
        {lead.held && !lead.firm_hold && lead.status === "held_back" && (
          <Callout tone="attention" compact>
            Held back: {lead.held.reason}, from {lead.held.source}.
          </Callout>
        )}
        {lead.waitlist && (
          <Callout tone="success" compact>
            On the waitlist: {lead.waitlist.firm} · {labelOf(WAITLIST_STAGES, lead.waitlist.stage)}.{" "}
            <Link className="text-link" href={`/data/waitlist/${lead.waitlist.entry_id}`}>
              Open it
            </Link>
          </Callout>
        )}
        {lead.stale_in && (
          <Callout tone="neutral" compact>
            Not in the newest version of {lead.stale_in} (last seen in version{" "}
            {lead.stale_seen_in ?? 1}). Kept here so nothing is lost.
          </Callout>
        )}
      </div>
      <RecordGrid side={<Side lead={lead} today={today} />}>
        <RecordSection id="lead-activity" title="Activity">
          <MailForm
            action={addLeadNoteAction}
            fields={{ lead_id: lead.lead_id }}
            submitLabel="Add the note"
            pendingLabel="Adding…"
          >
            <label className="sr-only" htmlFor="note-composer">
              A note
            </label>
            <Textarea id="note-composer" name="text" rows={3} maxLength={4_000} required />
          </MailForm>
          {lead.activity.length === 0 ? (
            <p className="timeline-empty">Nothing has happened yet.</p>
          ) : (
            <ol className="timeline">
              {lead.activity.map((item, index) => (
                <li
                  key={`${item.kind}-${item.at}-${index}`}
                  className={`timeline__item timeline__item--${item.kind}`}
                >
                  <span className="timeline__kind">{KIND_WORDS[item.kind] ?? "Change"}</span>
                  <div>
                    <p className="timeline__meta">
                      {item.by && <span className="timeline__actor">{item.by.name}</span>}
                      <Timestamp value={item.at} now={now} mode="relative" />
                    </p>
                    <p className="timeline__body">
                      {item.href ? (
                        <a className="text-link" href={item.href}>
                          {item.title}
                        </a>
                      ) : (
                        item.title
                      )}
                      {item.detail && item.kind !== "note" && ` · ${item.detail}`}
                      {item.kind === "note" && item.detail && (
                        <>
                          {"\n"}
                          {item.detail}
                        </>
                      )}
                    </p>
                    {item.kind === "note" && item.note_id && item.by?.staff_id === me && (
                      <RowAction
                        action={deleteLeadNoteAction}
                        fields={{ lead_id: lead.lead_id, note_id: item.note_id }}
                        className="hqdata-note-delete"
                        buttons={[
                          {
                            label: "Delete",
                            className: "btn btn--small btn--ghost",
                            ariaLabel: "Delete this note",
                            pendingLabel: "Deleting…",
                          },
                        ]}
                      />
                    )}
                  </div>
                </li>
              ))}
            </ol>
          )}
        </RecordSection>

        <RecordSection id="lead-sent" title="What was sent">
          {lead.sent.length === 0 ? (
            <p className="page-note">
              Mail merge has not written to them. Practice runs and tests never count.
            </p>
          ) : (
            lead.sent.map((mail) => (
              <article
                key={`${mail.mailing_id}-${mail.at}`}
                className="hqdata-mail"
                id={`sent-${mail.mailing_id}`}
              >
                <p className="hqdata-mail__head">
                  <span>
                    {mail.mailing || "A mailing"} ·{" "}
                    <Timestamp value={mail.at} now={now} mode="absolute" />
                  </span>
                  {!mail.gone && (
                    <>
                      <span>
                        From {mail.from} · Reply to {mail.reply_to || mail.from}
                      </span>
                      <span>To {lead.name ? `${lead.name} <${mail.to}>` : mail.to}</span>
                    </>
                  )}
                </p>
                {mail.gone ? (
                  <p className="page-note">
                    The words of this send are no longer on this computer: the mailing was deleted
                    in Mail merge.
                  </p>
                ) : (
                  <>
                    <p className="hqdata-mail__subject">{mail.subject}</p>
                    <pre className="hqdata-mail__body">{mail.text}</pre>
                    {mail.state === "unknown" && (
                      <p className="page-note">
                        No answer came back from the provider: it may have been sent.
                      </p>
                    )}
                    <p className="hqdata-linked">
                      <Link className="text-link" href={`/mail/merge/mailings/${mail.mailing_id}`}>
                        Open the mailing
                      </Link>
                    </p>
                  </>
                )}
              </article>
            ))
          )}
        </RecordSection>

        <RecordSection id="lead-replies" title="Replies">
          {lead.replies.length === 0 ? (
            <p className="page-note">No reply recorded.</p>
          ) : (
            lead.replies.map((reply) => {
              const plan = plans.get(reply.reply_id);
              return (
                <article
                  key={reply.reply_id}
                  className="hqdata-reply"
                  id={`reply-${reply.reply_id}`}
                >
                  <div className="hqdata-reply__head">
                    {reply.taken_back ? (
                      <StatusPill
                        value="taken_back"
                        label={TAKEN_BACK.label}
                        tone={TAKEN_BACK.tone}
                      />
                    ) : (
                      <StatusPill
                        value={reply.outcome}
                        label={labelOf(OUTCOMES, reply.outcome)}
                        tone={toneOf(OUTCOMES, reply.outcome)}
                      />
                    )}
                    <span>
                      Received <Timestamp value={reply.received_at} now={now} mode="absolute" />
                    </span>
                  </div>
                  {reply.mailing && (
                    <p className="hqdata-reply__meta">Answering &ldquo;{reply.mailing}&rdquo;</p>
                  )}
                  {reply.words && <blockquote className="hqdata-quote">{reply.words}</blockquote>}
                  {reply.subject && <p className="hqdata-reply__meta">Subject: {reply.subject}</p>}
                  <p className="hqdata-reply__meta">
                    Recorded by {reply.recorded_by.name},{" "}
                    <Timestamp value={reply.recorded_at} now={now} mode="relative" />
                  </p>
                  {reply.effects.length > 0 && (
                    <ul className="hqdata-reply__did">
                      {reply.effects.map((effect, index) => (
                        <li key={`${effect.kind}-${index}`}>{effectWords(effect)}</li>
                      ))}
                    </ul>
                  )}
                  {reply.taken_back ? (
                    <>
                      <p className="hqdata-reply__meta">
                        Taken back by {reply.taken_back.by.name},{" "}
                        <Timestamp value={reply.taken_back.at} now={now} mode="relative" />.
                      </p>
                      {(reply.taken_back.undone.length > 0 || reply.taken_back.kept.length > 0) && (
                        <ul className="hqdata-reply__did">
                          {reply.taken_back.undone.map((effect, index) => (
                            <li key={`undone-${index}`}>Undone: {undoneWords(effect)}.</li>
                          ))}
                          {reply.taken_back.kept.map((item, index) => (
                            <li key={`kept-${index}`}>
                              Kept: {effectWords(item.effect)}. {item.why}
                            </li>
                          ))}
                        </ul>
                      )}
                    </>
                  ) : (
                    plan && (
                      <TakeBack
                        replyId={reply.reply_id}
                        leadId={lead.lead_id}
                        plan={plan}
                        action={takeBackReplyAction}
                      />
                    )
                  )}
                </article>
              );
            })
          )}
        </RecordSection>

        <RecordSection id="lead-sources" title="Where this lead came from">
          {lead.sources.map((source, index) => (
            <div key={`${source.label}-${index}`} className="hqdata-source">
              <p className="hqdata-source__label">{source.label}</p>
              {Object.keys(source.values).length > 0 && (
                <KeyValue columns={2}>
                  {Object.entries(source.values).map(([key, value]) => (
                    <KeyValueRow key={key} label={key}>
                      {value}
                    </KeyValueRow>
                  ))}
                </KeyValue>
              )}
            </div>
          ))}
          {lead.sources.length === 0 && (
            <p className="page-note">
              Written to by Mail merge from a list that is no longer there; kept so nothing is lost.
            </p>
          )}
        </RecordSection>
      </RecordGrid>
    </>
  );
}

function Side({ lead: item, today: day }: { lead: LeadDetail; today: string }) {
  const inline = { action: updateLeadAction, idName: "lead_id", id: item.lead_id };
  return (
    <>
      <Properties title="Details">
        <Property label="Email" mono>
          {item.email}
        </Property>
        {TEXT_FIELDS.map((field) =>
          field === "email_kind" ? (
            <InlineField
              key={field}
              {...inline}
              name={field}
              label={FIELD_LABELS[field]}
              value={item.fields[field] ?? ""}
              type="select"
              options={EMAIL_KIND_OPTIONS}
            />
          ) : (
            <InlineField
              key={field}
              {...inline}
              name={field}
              label={FIELD_LABELS[field]}
              value={item.fields[field] ?? ""}
              type={
                field === "notes"
                  ? "textarea"
                  : field === "website" || field === "source_url"
                    ? "url"
                    : "text"
              }
              display={
                (field === "website" || field === "source_url") && item.fields[field] ? (
                  <a
                    className="text-link"
                    href={item.fields[field]}
                    rel="noreferrer noopener"
                    target="_blank"
                  >
                    {item.fields[field]}
                  </a>
                ) : (
                  item.fields[field] || <span className="quiet">Not given</span>
                )
              }
            />
          ),
        )}
        <Property label="Tags">{item.tags.length ? item.tags.join(", ") : "None set"}</Property>
      </Properties>
      {Object.keys(item.other).length > 0 && (
        <Properties title="Other columns">
          {Object.entries(item.other).map(([key, value]) => (
            <Property key={key} label={key}>
              {value}
            </Property>
          ))}
        </Properties>
      )}
      <p className="side-quiet">
        Changing a detail here does not change Mail merge lists; a send already made used the words
        it had.
      </p>
      <Properties title="The firm">
        <Property label="Domain">
          {item.firm.free_mail ? (
            "Free mail: not grouped"
          ) : (
            <Link
              className="text-link"
              href={`/data/leads?domain=${encodeURIComponent(item.firm.domain)}`}
            >
              {item.firm.domain}
            </Link>
          )}
        </Property>
        <Property label="People on file">{formatNumber(item.firm.total)}</Property>
        <Property label="Waitlist">
          {item.waitlist ? (
            <Link className="text-link" href={`/data/waitlist/${item.waitlist.entry_id}`}>
              {item.waitlist.firm}
            </Link>
          ) : (
            "Not on the waitlist"
          )}
        </Property>
        {item.investor && (
          <Property label="Investor">
            <Link className="text-link" href={`/data/investors/${item.investor.investor_id}`}>
              {item.investor.firm}
            </Link>
          </Property>
        )}
        {item.firm.people.length > 0 && (
          <Property label="Colleagues">
            <ul className="hqdata-colleagues">
              {item.firm.people.map((person) => (
                <li key={person.lead_id}>
                  <Link className="text-link" href={`/data/leads/${person.lead_id}`}>
                    {person.name || person.email}
                  </Link>
                  <LeadStatus status={person.status} />
                </li>
              ))}
            </ul>
            {item.firm.total - 1 > item.firm.people.length && (
              <Link
                className="text-link"
                href={`/data/leads?domain=${encodeURIComponent(item.firm.domain)}`}
              >
                See all {formatNumber(item.firm.total)}
              </Link>
            )}
          </Property>
        )}
      </Properties>
      <Properties title="Follow-up">
        {item.follow_up ? (
          <Property label={item.follow_up.title}>
            <DueChip due={item.follow_up.due_on} today={day} />
            <FollowUpActions
              followUpId={item.follow_up.follow_up_id}
              title={item.follow_up.title}
              dueOn={item.follow_up.due_on}
              today={day}
              done={doneFollowUpAction}
              move={moveFollowUpAction}
            />
          </Property>
        ) : (
          <Property label="Open">None open.</Property>
        )}
      </Properties>
    </>
  );
}
