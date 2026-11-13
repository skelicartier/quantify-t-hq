import Link from "next/link";
import { notFound } from "next/navigation";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import { StageForm } from "@/components/data/investors/stage-form";
import { InvestorStagePill, amountWords } from "@/components/data/investors/stage-pill";
import { LeadStatus } from "@/components/data/leads/lead-status";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
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
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readInvestor, type InvestorDetail } from "@/lib/data/api/investors";
import {
  AMOUNT_STATES,
  CURRENCIES,
  INSTRUMENTS,
  INVESTOR_STAGES,
  OUTCOMES,
  PASS_REASONS,
  TAKEN_BACK,
  WAITLIST_STAGES,
  labelOf,
  toneOf,
} from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import "../../leads/leads.css";
import "../../replies/replies.css";
import {
  addInvestorNoteAction,
  moveInvestorAction,
  recordAmountAction,
  updateInvestorAction,
} from "../actions";
import "../investors.css";

export const metadata = { title: "Investor" };
export const dynamic = "force-dynamic";

const INVESTOR_ID = /^[0-9a-f]{32}$/;

const KIND_WORDS: Record<string, string> = {
  seeded: "From the list",
  written: "Mail merge",
  stage: "Stage",
  note: "Note",
  amount: "Amount",
  update: "Change",
  reply: "Reply",
  person: "Person",
};

const PEOPLE_COLUMNS = [
  { key: "person", label: "Person", width: "26%" },
  { key: "title", label: "Title" },
  { key: "status", label: "Status" },
  { key: "written", label: "Written to" },
  { key: "from", label: "On file" },
];

export default async function InvestorPage({
  params,
}: {
  params: Promise<{ investorId: string }>;
}) {
  const { investorId } = await params;
  const { allowed } = await requireData(`/data/investors/${investorId}`);
  if (!INVESTOR_ID.test(investorId)) notFound();
  const now = requestNow();
  const read = allowed ? await dataRead(() => readInvestor(investorId)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Investor" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <Investor detail={read.data} now={now} />;
}

function stepWords(step: string, on: string | null): string {
  if (!step) return "None set";
  return on ? `${step} · ${formatDate(on)}` : step;
}

function Investor({ detail, now }: { detail: InvestorDetail; now: number }) {
  const { investor, today } = detail;
  const base = `/data/investors/${investor.investor_id}`;
  const latest = [...investor.amounts].sort(
    (a, b) => b.on.localeCompare(a.on) || b.at.localeCompare(a.at),
  )[0];
  return (
    <div className="hqdata-investor">
      <RecordHeader
        crumbs={[{ href: "/data/investors", label: "Investors" }]}
        title={investor.firm}
        favourite={{ href: base, label: investor.firm, kind: "Investor" }}
        status={<InvestorStagePill stage={investor.stage} />}
        readouts={[
          {
            label: "Stage",
            value: `${labelOf(INVESTOR_STAGES, investor.stage)}, since ${formatDate(investor.stage_since)}`,
          },
          {
            label: "Last written",
            value: investor.last_written_at ? (
              <Timestamp value={investor.last_written_at} now={now} mode="relative" />
            ) : (
              "Never"
            ),
          },
          { label: "Next step", value: stepWords(investor.next_step, investor.next_step_on) },
          { label: "Amount", value: amountWords(latest ?? null) },
        ]}
        actions={
          <>
            <Popover label="Move to a stage" variant="primary" align="start" width="wide">
              <StageForm
                action={moveInvestorAction}
                investorId={investor.investor_id}
                stage={investor.stage}
                nextStep={investor.next_step}
                nextStepOn={investor.next_step_on}
                today={today}
              />
            </Popover>
            <Popover label="Record an amount" align="start" width="wide">
              <MailForm
                action={recordAmountAction}
                fields={{ investor_id: investor.investor_id }}
                submitLabel="Record it"
                pendingLabel="Recording…"
              >
                <Field id="amount-state" label="State">
                  <Select id="amount-state" name="state" defaultValue="soft">
                    {Object.entries(AMOUNT_STATES).map(([key, label]) => (
                      <option key={key} value={key}>
                        {label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="amount-value" label="Amount">
                  <Input
                    id="amount-value"
                    name="amount"
                    inputMode="decimal"
                    required
                    maxLength={20}
                    placeholder="50000"
                  />
                </Field>
                <Field id="amount-currency" label="Currency">
                  <Select id="amount-currency" name="currency" defaultValue="USD">
                    {CURRENCIES.map((currency) => (
                      <option key={currency} value={currency}>
                        {currency}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="amount-instrument" label="Instrument">
                  <Select id="amount-instrument" name="instrument" defaultValue="Not decided">
                    {INSTRUMENTS.map((instrument) => (
                      <option key={instrument} value={instrument}>
                        {instrument}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="amount-on" label="On">
                  <Input id="amount-on" name="on" type="date" defaultValue={today} required />
                </Field>
              </MailForm>
            </Popover>
            <Popover label="Add a note" align="start" width="wide">
              <MailForm
                action={addInvestorNoteAction}
                fields={{ investor_id: investor.investor_id }}
                submitLabel="Add the note"
                pendingLabel="Adding…"
              >
                <Field id="investor-note-header" label="Note">
                  <Textarea
                    id="investor-note-header"
                    name="text"
                    rows={3}
                    maxLength={4_000}
                    required
                  />
                </Field>
              </MailForm>
            </Popover>
          </>
        }
      />
      {investor.list_ids.length === 0 && (
        <Callout tone="neutral" compact>
          Not on the chosen investor list now. It stays because something was recorded on it.
        </Callout>
      )}
      <RecordGrid side={<Side detail={detail} />}>
        <RecordSection id="investor-activity" title="Activity">
          <MailForm
            action={addInvestorNoteAction}
            fields={{ investor_id: investor.investor_id }}
            submitLabel="Add the note"
            pendingLabel="Adding…"
          >
            <label className="sr-only" htmlFor="investor-note">
              A note
            </label>
            <Textarea id="investor-note" name="text" rows={3} maxLength={4_000} required />
          </MailForm>
          {detail.events.length === 0 ? (
            <p className="timeline-empty">Nothing has happened yet.</p>
          ) : (
            <ol className="timeline">
              {detail.events.map((event) => (
                <li key={event.event_id} className={`timeline__item timeline__item--${event.kind}`}>
                  <span className="timeline__kind">{KIND_WORDS[event.kind] ?? "Change"}</span>
                  <div>
                    <p className="timeline__meta">
                      <span className="timeline__actor">{event.by.name}</span>
                      <Timestamp value={event.at} now={now} mode="relative" />
                    </p>
                    <p className="timeline__body">
                      {event.title}
                      {event.detail &&
                        (event.kind === "note" ? (
                          <>
                            {"\n"}
                            {event.detail}
                          </>
                        ) : (
                          ` · ${event.detail}`
                        ))}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </RecordSection>

        <RecordSection id="investor-sent" title="What was sent">
          {detail.sent.length === 0 ? (
            <p className="page-note">
              Mail merge has not written to anyone at this firm. Practice runs and tests never
              count.
            </p>
          ) : (
            detail.sent.map((mail) => (
              <article key={`${mail.mailing_id}-${mail.email}-${mail.at}`} className="hqdata-mail">
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
                      <span>To {mail.name ? `${mail.name} <${mail.to}>` : mail.to}</span>
                    </>
                  )}
                </p>
                {mail.gone ? (
                  <p className="page-note">
                    The words of this send to {mail.name || mail.email} are no longer on this
                    computer: the mailing was deleted in Mail merge.
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
                  </>
                )}
              </article>
            ))
          )}
        </RecordSection>

        <RecordSection id="investor-replies" title="Replies">
          {detail.replies.length === 0 ? (
            <p className="page-note">
              No reply recorded. Record one on Replies or from the person&rsquo;s lead; what it does
              to this firm happens here.
            </p>
          ) : (
            detail.replies.map((reply) => (
              <article key={reply.reply_id} className="hqdata-reply">
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
                    {reply.name || reply.email} ·{" "}
                    <Timestamp value={reply.received_at} now={now} mode="absolute" />
                  </span>
                </div>
                {reply.words && <blockquote className="hqdata-quote">{reply.words}</blockquote>}
                <p className="hqdata-reply__meta">
                  Recorded by {reply.recorded_by.name}.{" "}
                  <Link
                    className="text-link"
                    href={`/data/leads/${reply.lead_id}#reply-${reply.reply_id}`}
                  >
                    Open it on the lead
                  </Link>
                </p>
              </article>
            ))
          )}
        </RecordSection>

        <RecordSection id="investor-people" title="People">
          <DataTable caption="People at the firm" columns={PEOPLE_COLUMNS} columnMenu={false}>
            {detail.people.map((person) => (
              <tr key={person.email}>
                <td>
                  {person.lead_id ? (
                    <Link className="table-title" href={`/data/leads/${person.lead_id}`}>
                      {person.name || person.email}
                    </Link>
                  ) : (
                    <span className="table-title">{person.name || person.email}</span>
                  )}
                  <span className="table-sub mono prospect-email">{person.email}</span>
                </td>
                <td>{person.title || <span className="table-sub">Not given</span>}</td>
                <td>
                  {person.status ? (
                    <LeadStatus status={person.status} />
                  ) : (
                    <span className="table-sub">Not a lead yet</span>
                  )}
                </td>
                <td>
                  {person.times_written === 0
                    ? "Never"
                    : `${formatNumber(person.times_written)} ${person.times_written === 1 ? "time" : "times"}`}
                  {person.last_written_at && (
                    <span className="table-sub">
                      <Timestamp value={person.last_written_at} now={now} mode="relative" />
                    </span>
                  )}
                </td>
                <td>{person.from === "list" ? "On the list" : "Added since"}</td>
              </tr>
            ))}
          </DataTable>
        </RecordSection>

        <RecordSection id="investor-list" title="From the list">
          {Object.keys(investor.list_values).length === 0 ? (
            <p className="page-note">The list has no other columns for this firm.</p>
          ) : (
            <KeyValue columns={2}>
              {Object.entries(investor.list_values).map(([key, value]) => (
                <KeyValueRow key={key} label={key}>
                  {value}
                </KeyValueRow>
              ))}
            </KeyValue>
          )}
        </RecordSection>
      </RecordGrid>
    </div>
  );
}

function Side({ detail }: { detail: InvestorDetail }) {
  const { investor, today } = detail;
  const inline = { action: updateInvestorAction, idName: "investor_id", id: investor.investor_id };
  const amounts = [...investor.amounts].sort(
    (a, b) => b.on.localeCompare(a.on) || b.at.localeCompare(a.at),
  );
  return (
    <>
      <Properties title="Details">
        <InlineField {...inline} name="firm" label="Firm" value={investor.firm} />
        <Property label="Domain">
          {investor.free_mail ? "Free mail: a firm of one" : investor.domain}
        </Property>
        <InlineField
          {...inline}
          name="owner"
          label="Owner"
          value={investor.owner}
          display={investor.owner || <span className="quiet">None set</span>}
        />
        <InlineField
          {...inline}
          name="next_step"
          label="Next step"
          value={investor.next_step}
          display={investor.next_step || <span className="quiet">None set</span>}
        />
        <InlineField
          {...inline}
          name="next_step_on"
          label="By"
          type="date"
          value={investor.next_step_on ?? ""}
          display={
            investor.next_step_on ? (
              <DueChip due={investor.next_step_on} today={today} />
            ) : (
              <span className="quiet">None set</span>
            )
          }
        />
        {investor.stage === "set_aside" && investor.set_aside_until && (
          <Property label="Set aside until">{formatDate(investor.set_aside_until)}</Property>
        )}
        {investor.stage === "passed" && investor.passed_reason && (
          <Property label="Passed because">
            {labelOf(PASS_REASONS, investor.passed_reason)}
          </Property>
        )}
        <Property label="On the lists">
          {investor.lists.length ? investor.lists.map((list) => list.name).join(", ") : "None now"}
        </Property>
        <Property label="Waitlist">
          {investor.free_mail ? (
            "Free mail: not grouped by firm"
          ) : !detail.waitlist_here ? (
            "The waitlist is not set up here yet."
          ) : detail.waitlist ? (
            <Link className="text-link" href={`/data/waitlist/${detail.waitlist.entry_id}`}>
              Also on the waitlist: {detail.waitlist.firm} ·{" "}
              {labelOf(WAITLIST_STAGES, detail.waitlist.stage)}
            </Link>
          ) : (
            "Not on the waitlist"
          )}
        </Property>
      </Properties>
      <Properties title="Amounts">
        {amounts.length === 0 ? (
          <Property label="Recorded">None recorded</Property>
        ) : (
          amounts.map((amount) => (
            <Property key={amount.amount_id} label={labelOf(AMOUNT_STATES, amount.state)}>
              <span className="hqdata-money">{formatMoney(amount.amount, amount.currency)}</span>
              <span className="table-sub">
                {amount.instrument} · {formatDate(amount.on)} · {amount.by.name}
              </span>
            </Property>
          ))
        )}
      </Properties>
      <p className="side-quiet">
        Each amount stays in its own currency; nothing is added across currencies.
      </p>
    </>
  );
}
