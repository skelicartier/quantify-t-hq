import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import { FollowUpActions } from "@/components/data/replies/follow-up-actions";
import { ReplyForm } from "@/components/data/replies/reply-form";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink, buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readLead } from "@/lib/data/api/leads";
import {
  readFollowUps,
  readReplies,
  type FollowUpsPage,
  type RepliesPage,
} from "@/lib/data/api/replies";
import { OUTCOMES, OUTCOME_ORDER, TAKEN_BACK, labelOf, toneOf } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { boundedInteger, firstSearchValue } from "@/lib/search-params";

import {
  addFollowUpAction,
  doneFollowUpAction,
  moveFollowUpAction,
  recordReplyAction,
} from "./actions";
import "./replies.css";

export const metadata = { title: "Replies" };
export const dynamic = "force-dynamic";

const BASE = "/data/replies";
const PAGE_SIZE = 100;
const ABOUT =
  "HQ does not read your mailbox. When a reply arrives, record it here or from the lead: a yes puts the firm on the waitlist, a no puts the address on Mail merge's stop list, a later sets a reminder, a wrong person adds whoever they named, a question adds a follow-up for today.";

const FOLLOW_UP_COLUMNS = [
  { key: "who", label: "Who", width: "22%" },
  { key: "what", label: "What", width: "28%" },
  { key: "due", label: "Due" },
  { key: "from", label: "From" },
  { key: "change", label: "Change" },
];

const REPLY_COLUMNS = [
  { key: "received", label: "Received" },
  { key: "who", label: "Who", width: "20%" },
  { key: "firm", label: "Firm" },
  { key: "outcome", label: "Outcome" },
  { key: "words", label: "Their words", width: "26%" },
  { key: "answering", label: "Answering" },
  { key: "by", label: "Recorded by" },
];

const LEAD_ID = /^[0-9a-f]{32}$/;

type Params = Record<string, string | string[] | undefined>;

export default async function RepliesPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const now = requestNow();
  const parameters = await searchParams;
  const outcome = firstSearchValue(parameters.outcome) ?? "";
  const q = (firstSearchValue(parameters.q) ?? "").slice(0, 200);
  const offset = boundedInteger(firstSearchValue(parameters.offset), 0, 200_000);
  const leadParam = firstSearchValue(parameters.lead) ?? "";
  const focus = firstSearchValue(parameters.new) === "1";
  const read = allowed
    ? await dataRead(async () => {
        const [replies, followUps] = await Promise.all([
          readReplies({ outcome, q, offset }),
          readFollowUps(),
        ]);
        let prefill = "";
        if (LEAD_ID.test(leadParam)) {
          try {
            prefill = (await readLead(leadParam)).lead.email;
          } catch {
            // an unknown lead leaves the address empty
          }
        }
        return { replies, followUps, prefill };
      })
    : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Replies"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">
              {formatNumber(data.replies.live.all ?? 0)} recorded ·{" "}
              {formatNumber(data.replies.follow_ups_open)}{" "}
              {data.replies.follow_ups_open === 1 ? "follow-up" : "follow-ups"} open
            </span>
          ) : undefined
        }
        actions={
          data ? (
            <a className={buttonClass({ size: "small" })} href={`${BASE}/export`}>
              Download (CSV)
            </a>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Replies
            replies={read.data.replies}
            followUps={read.data.followUps}
            prefill={read.data.prefill}
            focus={focus || Boolean(read.data.prefill)}
            now={now}
            outcome={outcome}
            q={q}
          />
        )}
      </div>
    </>
  );
}

function listHref(
  change: { outcome?: string; q?: string; offset?: number },
  current: { outcome: string; q: string },
): string {
  const params = new URLSearchParams();
  const outcome = change.outcome ?? current.outcome;
  const q = change.q ?? current.q;
  if (outcome) params.set("outcome", outcome);
  if (q) params.set("q", q);
  if (change.offset) params.set("offset", String(change.offset));
  const rendered = params.toString();
  return `${BASE}${rendered ? `?${rendered}` : ""}#replies-all`;
}

function Replies({
  replies,
  followUps,
  prefill,
  focus,
  now,
  outcome,
  q,
}: {
  replies: RepliesPage;
  followUps: FollowUpsPage;
  prefill: string;
  focus: boolean;
  now: number;
  outcome: string;
  q: string;
}) {
  const live = replies.live;
  const counts = replies.counts;
  const current = { outcome, q };
  const today = replies.today;
  const last = replies.offset + replies.replies.length;
  return (
    <>
      <RecordSection id="record-reply" title="Record a reply">
        <ReplyForm
          action={recordReplyAction}
          today={today}
          now={now}
          defaultEmail={prefill}
          autoFocus={focus}
        />
      </RecordSection>

      <StatGrid columns={6} label="Replies recorded">
        <Stat label="Recorded" value={formatNumber(live.all ?? 0)} />
        <Stat
          label={OUTCOMES.replied_positive.label}
          value={formatNumber(live.replied_positive ?? 0)}
        />
        <Stat
          label={OUTCOMES.not_interested.label}
          value={formatNumber(live.not_interested ?? 0)}
        />
        <Stat
          label={OUTCOMES.not_now.label}
          value={formatNumber((live.not_now ?? 0) + (live.out_of_office ?? 0))}
          hint={`${formatNumber(live.out_of_office ?? 0)} out of office`}
        />
        <Stat label={OUTCOMES.wrong_person.label} value={formatNumber(live.wrong_person ?? 0)} />
        <Stat label={OUTCOMES.question.label} value={formatNumber(live.question ?? 0)} />
      </StatGrid>

      <RecordSection
        id="replies-followups"
        title="Follow-ups"
        actions={
          <Popover label="Add a follow-up" align="end" width="wide">
            <MailForm action={addFollowUpAction} submitLabel="Add it" pendingLabel="Adding…">
              <Field id="follow-email" label="Who" hint="Their address; they must be a lead.">
                <Input
                  id="follow-email"
                  name="email"
                  type="email"
                  required
                  maxLength={254}
                  aria-describedby="follow-email-hint"
                />
              </Field>
              <Field id="follow-what" label="What">
                <Input id="follow-what" name="title" required maxLength={200} />
              </Field>
              <Field id="follow-due" label="Due">
                <Input
                  id="follow-due"
                  name="due_on"
                  type="date"
                  required
                  defaultValue={today}
                  min={today}
                />
              </Field>
            </MailForm>
          </Popover>
        }
      >
        <DataTable
          caption="Follow-ups"
          columns={FOLLOW_UP_COLUMNS}
          columnMenu={false}
          isEmpty={followUps.follow_ups.length === 0}
          empty={
            <EmptyState
              compact
              title="Nothing to follow up"
              description="Questions, laters and people named instead land here."
            />
          }
        >
          {followUps.follow_ups.map((item) => (
            <tr key={item.follow_up_id}>
              <td>
                <Link className="table-title" href={`/data/leads/${item.lead_id}`}>
                  {item.name || item.email}
                </Link>
                <span className="table-sub">{item.firm || item.email}</span>
              </td>
              <td>
                {item.title}
                {item.note && (
                  <span className="table-sub table-sub--prose" title={item.note}>
                    {item.note}
                  </span>
                )}
              </td>
              <td className="nowrap">
                <DueChip due={item.due_on} today={today} />
              </td>
              <td>
                {item.from_reply_id ? (
                  <Link
                    className="text-link"
                    href={`/data/leads/${item.lead_id}#reply-${item.from_reply_id}`}
                  >
                    The reply
                  </Link>
                ) : (
                  <span className="table-sub">Added by hand</span>
                )}
              </td>
              <td>
                <FollowUpActions
                  followUpId={item.follow_up_id}
                  title={item.title}
                  dueOn={item.due_on}
                  today={today}
                  done={doneFollowUpAction}
                  move={moveFollowUpAction}
                />
              </td>
            </tr>
          ))}
        </DataTable>
      </RecordSection>

      <RecordSection id="replies-all" title="Every reply">
        <SegmentedLinks
          label="Outcome"
          items={[
            {
              href: listHref({ outcome: "" }, current),
              label: `All ${formatNumber(counts.all ?? 0)}`,
              current: !outcome,
            },
            ...OUTCOME_ORDER.map((key) => ({
              href: listHref({ outcome: key }, current),
              label: `${OUTCOMES[key].label} ${formatNumber(counts[key] ?? 0)}`,
              current: outcome === key,
            })),
          ]}
        />
        <form className="filter-strip__search merge-search" action={BASE} role="search">
          {outcome && <input type="hidden" name="outcome" value={outcome} />}
          <label className="sr-only" htmlFor="replies-q">
            Search replies
          </label>
          <input
            id="replies-q"
            className="input input--small"
            name="q"
            type="search"
            maxLength={200}
            defaultValue={q}
            placeholder="Name, address, firm or words"
          />
          <button className="btn btn--small" type="submit">
            Find
          </button>
          {q && (
            <ButtonLink href={listHref({ q: "" }, current)} size="small" variant="ghost">
              Clear
            </ButtonLink>
          )}
        </form>
        <DataTable
          caption="Replies"
          columns={REPLY_COLUMNS}
          isEmpty={replies.replies.length === 0}
          empty={
            <EmptyState
              compact
              title={q || outcome ? "Nothing matches" : "No replies recorded yet"}
              description={
                q || outcome
                  ? "No reply matches. Try fewer words, or All."
                  : "Record one above, or from a lead."
              }
            />
          }
        >
          {replies.replies.map((reply) => (
            <tr key={reply.reply_id} className={reply.taken_back ? "row--muted" : undefined}>
              <td className="nowrap">
                <Timestamp value={reply.received_at} now={now} mode="relative" />
              </td>
              <td>
                <Link
                  className="table-title"
                  href={`/data/leads/${reply.lead_id}#reply-${reply.reply_id}`}
                >
                  {reply.name || reply.email}
                </Link>
                <span className="table-sub mono prospect-email">{reply.email}</span>
              </td>
              <td>{reply.firm || <span className="table-sub">Not given</span>}</td>
              <td className="nowrap">
                {reply.taken_back ? (
                  <StatusPill value="taken_back" label={TAKEN_BACK.label} tone={TAKEN_BACK.tone} />
                ) : (
                  <StatusPill
                    value={reply.outcome}
                    label={labelOf(OUTCOMES, reply.outcome)}
                    tone={toneOf(OUTCOMES, reply.outcome)}
                  />
                )}
                {reply.taken_back && (
                  <span className="table-sub">{labelOf(OUTCOMES, reply.outcome)}</span>
                )}
              </td>
              <td>
                {reply.words ? (
                  <span className="table-sub table-sub--prose" title={reply.words}>
                    {reply.words}
                  </span>
                ) : (
                  <span className="table-sub">No words pasted</span>
                )}
              </td>
              <td>{reply.mailing || <span className="table-sub">Not written to</span>}</td>
              <td>{reply.recorded_by.name}</td>
            </tr>
          ))}
        </DataTable>
        {replies.total > 0 && (
          <nav className="pagination" aria-label="Pagination">
            <span className="toolbar__summary">
              {formatNumber(replies.offset + 1)}–{formatNumber(last)} of{" "}
              {formatNumber(replies.total)}
            </span>
            {replies.offset > 0 && (
              <ButtonLink
                size="small"
                href={listHref({ offset: Math.max(0, replies.offset - PAGE_SIZE) }, current)}
              >
                Previous
              </ButtonLink>
            )}
            {last < replies.total && (
              <ButtonLink
                size="small"
                href={listHref({ offset: replies.offset + PAGE_SIZE }, current)}
              >
                Next
              </ButtonLink>
            )}
          </nav>
        )}
      </RecordSection>
    </>
  );
}
