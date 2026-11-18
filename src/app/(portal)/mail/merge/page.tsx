import Link from "next/link";

import {
  applyBacklogAction,
  checkDeliveryAction,
  createMailingAction,
  importListAction,
  pauseMailingAction,
} from "@/app/(portal)/mail/merge/actions";
import { MailForm } from "@/components/mail/mail-form";
import { MailTabs } from "@/components/mail/mail-tabs";
import { ImportListFields, MailingPill, SenderDown } from "@/components/mail/merge";
import { DeliveryPill, DeliveryReadLine, DeliveryWarnings } from "@/components/mail/merge-delivery";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
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
import { formatNumber } from "@/lib/format";
import { MERGE_ROLE_LINE, requireMerge } from "@/lib/merge/access";
import {
  MAILING_SHOWS,
  findTerms,
  matchesTerms,
  parseShow,
  rankByNumber,
  showsMailing,
  type MailingShow,
} from "@/lib/merge/find";
import {
  MergeRequestError,
  MergeUnavailableError,
  readMergeDelivery,
  readMergeLists,
  readMergeMailings,
  readMergeStatus,
  type MergeDeliveryOverview,
  type MergeDeliveryWarning,
  type MergeList,
  type MergeMailing,
  type MergeStatus,
} from "@/lib/merge/api";
import { WEEK_MS } from "@/lib/merge/delivery-contracts";
import { requestNow } from "@/lib/request-time";

import "./delivery.css";

export const metadata = { title: "Mail merge" };
export const dynamic = "force-dynamic";

const MAILING_COLUMNS = [
  { key: "name", label: "Mailing" },
  { key: "to", label: "To" },
  { key: "state", label: "State" },
  { key: "sent", label: "Accepted", align: "end" as const },
  { key: "delivered", label: "Delivered", align: "end" as const },
  { key: "waiting", label: "Waiting", align: "end" as const },
  { key: "left", label: "Left out", align: "end" as const },
  { key: "updated", label: "Changed" },
];

const BACKLOG_COLUMNS = [
  { key: "address", label: "Address" },
  { key: "what", label: "What happened" },
  { key: "when", label: "When" },
  { key: "mailing", label: "Mailing" },
  { key: "now", label: "Now" },
];

/**
 * The one read that may meet a sender from before the read-back: that sender answers
 * "nothing answers there", which is not a failure. Anything else that goes wrong with this
 * read leaves the rest of the page as it is.
 */
type DeliveryRead =
  { kind: "read"; overview: MergeDeliveryOverview } | { kind: "older_sender" } | { kind: "failed" };

async function readDelivery(): Promise<DeliveryRead> {
  try {
    return { kind: "read", overview: await readMergeDelivery() };
  } catch (error) {
    if (error instanceof MergeRequestError && error.code === "no_such_route")
      return { kind: "older_sender" };
    if (error instanceof MergeRequestError || error instanceof MergeUnavailableError)
      return { kind: "failed" };
    throw error;
  }
}

/** "Delivered" in the mailings table: the count once read, and why there is none before. */
function DeliveredCell({ mailing }: { mailing: MergeMailing }) {
  if (mailing.mode === "practice") return <span className="table-sub">Practice</span>;
  const accepted = mailing.progress.sent + mailing.progress.unknown;
  if (mailing.mode !== "live" || accepted === 0) return <span className="table-sub">Not sent</span>;
  const delivery = mailing.delivery;
  if (!delivery) return <span className="table-sub">Not read yet</span>;
  return (
    <span className="merge-delivery__delivered">
      {formatNumber(delivery.delivered)} of {formatNumber(delivery.accepted)}
      {delivery.warning && (
        <StatusPill value={delivery.warning} label="Warning" tone={delivery.warning} />
      )}
    </span>
  );
}

const LIST_COLUMNS = [
  { key: "name", label: "List" },
  { key: "people", label: "People", align: "end" as const },
  { key: "left", label: "Left out", align: "end" as const },
  { key: "columns", label: "Its columns" },
  { key: "added", label: "Added" },
];

/**
 * Mail merge: lists of people from files, one message made out to each, sent from this
 * computer through the mail provider. What is here is this machine's own, not the
 * service's: the lists, the key and the record of who was written to stay beside it.
 */
export default async function MailMergePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; show?: string }>;
}) {
  const query = await searchParams;
  const { allowed } = await requireMerge("/mail/merge");
  const now = requestNow();
  let status: MergeStatus | null = null;
  let lists: MergeList[] = [];
  let mailings: MergeMailing[] = [];
  let deliveryRead: DeliveryRead = { kind: "failed" };
  if (allowed) {
    try {
      [status, lists, mailings, deliveryRead] = await Promise.all([
        readMergeStatus(),
        readMergeLists().then((answer) => answer.lists),
        readMergeMailings().then((answer) => answer.mailings),
        readDelivery(),
      ]);
    } catch (error) {
      if (!(error instanceof MergeUnavailableError || error instanceof MergeRequestError))
        throw error;
      status = null;
    }
  }
  const provider = status?.provider;
  const sending = status?.sending ?? null;
  // Find: every word in the name, subject, state or list; the tabs narrow by state.
  const search = (query.q ?? "").trim().slice(0, 200);
  const show = parseShow(query.show);
  const terms = findTerms(search);
  const found = mailings.filter((mailing) =>
    matchesTerms(
      [mailing.name, mailing.subject, mailing.state, ...mailing.lists.map((list) => list.name)],
      terms,
    ),
  );
  const shownMailings = rankByNumber(
    found.filter((mailing) => showsMailing(mailing.state, show)),
    terms,
    (mailing) => mailing.name,
  );
  const shownLists = lists.filter((list) => matchesTerms([list.name, list.file_name], terms));
  const findHref = (next: { q?: string; show?: MailingShow }) => {
    const params = new URLSearchParams();
    const q = next.q ?? search;
    const chosen = next.show ?? show;
    if (q) params.set("q", q);
    if (chosen !== "all") params.set("show", chosen);
    const text = params.toString();
    return text ? `/mail/merge?${text}` : "/mail/merge";
  };
  const narrowed = search !== "" || show !== "all";
  const delivery = deliveryRead.kind === "read" ? deliveryRead.overview : null;
  const week = delivery?.week ?? null;
  const backlog = delivery?.backlog ?? null;
  const cutOff = delivery?.read.auto_stop_from ?? null;
  // Sent for real this week and not read back yet: "nothing was sent" would be untrue.
  const unreadThisWeek = mailings.some(
    (mailing) =>
      mailing.mode === "live" &&
      !mailing.delivery &&
      mailing.progress.sent + mailing.progress.unknown > 0 &&
      mailing.started_at !== null &&
      Date.parse(mailing.started_at) >= now - WEEK_MS,
  );
  const mostOf = (warning: MergeDeliveryWarning) => {
    const count = (item: { hard_bounce: number; complaint: number }) =>
      warning.key === "complaints" ? item.complaint : item.hard_bounce;
    const most = (week?.by_mailing ?? [])
      .filter((item) => count(item) > 0)
      .sort((a, b) => count(b) - count(a))
      .slice(0, 3);
    if (most.length === 0) return null;
    return (
      <p>
        Most of them:{" "}
        {most.map((item, index) => (
          <span key={item.mailing_id}>
            {index > 0 && ", "}
            <Link className="text-link" href={`/mail/merge/mailings/${item.mailing_id}`}>
              {item.name}
            </Link>{" "}
            ({formatNumber(count(item))})
          </span>
        ))}
        .
      </p>
    );
  };
  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="Mail merge"
        meta={sending ? <LiveRefresh intervalSeconds={10} label="Mail merge" /> : undefined}
        description="One message, made out to each person on a list and sent from this computer. Add a list from a CSV, write the message with its columns as fields, practise the send, then send it for real. Lists, the provider key and the record of who was written to are kept on this computer, not on the service."
        actions={
          <>
            {allowed && status && (
              <>
                <Popover label="New mailing" variant="primary" width="wide">
                  <MailForm action={createMailingAction} submitLabel="Start writing">
                    <Field
                      id="merge-mailing-name"
                      label="Name"
                      hint="For you: the people written to never see it."
                    >
                      <Input id="merge-mailing-name" name="name" maxLength={120} required />
                    </Field>
                  </MailForm>
                </Popover>
                <Popover label="Add a list" width="wide">
                  <MailForm
                    action={importListAction}
                    submitLabel="Add this list"
                    pendingLabel="Reading…"
                  >
                    <ImportListFields />
                  </MailForm>
                </Popover>
                <Link className="btn btn--small" href="/mail/merge/setup">
                  Setup
                </Link>
              </>
            )}
            <MailTabs current="/mail/merge" />
          </>
        }
      />
      <div className="page-content">
        {!allowed ? (
          <Callout tone="neutral">{MERGE_ROLE_LINE}</Callout>
        ) : !status || !provider ? (
          <SenderDown />
        ) : (
          <>
            {!provider.key_set ? (
              <Callout tone="attention" title="Practice only until a provider key is added">
                Nothing can leave yet: every send is a practice run that goes through each step and
                shows each person&rsquo;s message. Add the key in{" "}
                <Link className="text-link" href="/mail/merge/setup">
                  Setup
                </Link>{" "}
                to send for real.
              </Callout>
            ) : !status.settings.from_email ? (
              <Callout tone="attention" title="Say who the mail is from">
                The key is in. Set the sender&rsquo;s name and address in{" "}
                <Link className="text-link" href="/mail/merge/setup">
                  Setup
                </Link>{" "}
                before a send.
              </Callout>
            ) : !provider.sender_verified ? (
              <Callout
                tone="attention"
                title="The sender address is not verified with the provider"
              >
                Mail from {status.settings.from_email} would be refused or land in spam. See{" "}
                <Link className="text-link" href="/mail/merge/setup">
                  Setup
                </Link>{" "}
                for what the provider is missing.
              </Callout>
            ) : null}
            {sending && (
              <Callout tone="neutral" role="status">
                <Link className="text-link" href={`/mail/merge/mailings/${sending.mailing_id}`}>
                  {sending.name}
                </Link>{" "}
                is going out now.
              </Callout>
            )}
            <StatGrid columns={4} label="Mail merge at a glance">
              <Stat
                label="Sent today"
                value={formatNumber(status.sent_today)}
                hint={`of ${formatNumber(status.settings.daily_cap)} a day`}
              />
              <Stat label="Lists" value={formatNumber(status.counts.lists)} />
              <Stat label="People" value={formatNumber(status.counts.people)} />
              <Stat label="On the stop list" value={formatNumber(status.counts.stopped)} />
            </StatGrid>
            <RecordSection
              id="merge-delivery-home"
              title="Delivery"
              actions={
                delivery ? (
                  <MailForm
                    action={checkDeliveryAction}
                    submitLabel="Check delivery now"
                    pendingLabel="Asking the provider…"
                    className="inline-form"
                    disabled={!delivery.read.key_set || delivery.read.reading}
                  />
                ) : undefined
              }
            >
              <div className="merge-delivery">
                {deliveryRead.kind === "older_sender" ? (
                  <p>
                    Delivery read-back starts when the sender is next restarted, between batches.
                  </p>
                ) : !delivery || !week || !backlog ? (
                  <p>Delivery could not be read from the sender just now.</p>
                ) : (
                  <>
                    <DeliveryReadLine read={delivery.read} now={now} live={!sending} />
                    {week.counts.accepted === 0 ? (
                      <p className="merge-delivery__sentence">
                        {unreadThisWeek
                          ? "Mail sent for real in the last 7 days has not been read back yet."
                          : "Nothing was sent for real in the last 7 days."}
                      </p>
                    ) : (
                      <p className="merge-delivery__sentence">
                        Last 7 days: {formatNumber(week.counts.delivered)} of{" "}
                        {formatNumber(week.counts.accepted)} delivered ·{" "}
                        {formatNumber(week.counts.didnt_arrive)} didn&rsquo;t arrive ·{" "}
                        {formatNumber(week.counts.not_yet)} not delivered yet ·{" "}
                        {formatNumber(week.counts.complaint)} spam{" "}
                        {week.counts.complaint === 1 ? "complaint" : "complaints"} ·{" "}
                        {formatNumber(week.counts.unsubscribed)} unsubscribed.
                      </p>
                    )}
                    <DeliveryWarnings
                      warnings={week.warnings}
                      after={mostOf}
                      pause={
                        sending ? (
                          <MailForm
                            action={pauseMailingAction}
                            fields={{ mailing_id: sending.mailing_id }}
                            submitLabel={`Pause “${sending.name}”`}
                            pendingLabel="Pausing…"
                            className="inline-form"
                          />
                        ) : undefined
                      }
                    />
                    {backlog.total > 0 && cutOff && (
                      <Callout
                        tone="attention"
                        title={
                          backlog.would_add === 0 ? (
                            <>
                              Everything from before <Timestamp value={cutOff} mode="date" /> is on
                              the stop list already
                            </>
                          ) : (
                            <>
                              {formatNumber(backlog.would_add)}{" "}
                              {backlog.would_add === 1 ? "address" : "addresses"} from before{" "}
                              <Timestamp value={cutOff} mode="date" /> would go on the stop list
                            </>
                          )
                        }
                      >
                        <div className="merge-delivery__backlog">
                          <p>
                            Delivery read back from the provider found hard bounces, spam
                            complaints, unsubscribes or addresses that cannot take mail, from before
                            this computer started reading delivery. The provider already refuses to
                            send to most of them; Mail merge would still try. Nothing from before{" "}
                            <Timestamp value={cutOff} mode="date" /> goes on the stop list until you
                            say so.
                          </p>
                          <DataTable caption="Waiting for your say" columns={BACKLOG_COLUMNS}>
                            {backlog.rows.map((row) => (
                              <tr key={row.email}>
                                <td className="mono">{row.email}</td>
                                <td>
                                  <DeliveryPill shown={row.kind} />
                                </td>
                                <td>
                                  <Timestamp value={row.at} mode="absolute" />
                                </td>
                                <td>{row.mailing}</td>
                                <td>
                                  {row.on_stop_list ? "On the stop list already" : "Would go on"}
                                </td>
                              </tr>
                            ))}
                          </DataTable>
                          {backlog.total > backlog.rows.length && (
                            <p className="side-quiet">
                              and {formatNumber(backlog.total - backlog.rows.length)} more
                            </p>
                          )}
                          <div className="merge-delivery__act">
                            <MailForm
                              action={applyBacklogAction}
                              fields={{ count: String(backlog.would_add) }}
                              submitLabel="Apply to the stop list"
                              pendingLabel="Putting them on…"
                              className="inline-form"
                            />
                            <p className="side-quiet">
                              One press puts them all on. From then on, anything older that a later
                              read finds goes on by itself too. Each one can be taken off in Setup.
                            </p>
                          </div>
                        </div>
                      </Callout>
                    )}
                  </>
                )}
              </div>
            </RecordSection>
            <RecordSection
              id="merge-mailings"
              title="Mailings"
              actions={
                <form className="merge-search" method="get" action="/mail/merge" role="search">
                  <label className="sr-only" htmlFor="merge-find">
                    Find a mailing or a list
                  </label>
                  <Input
                    id="merge-find"
                    name="q"
                    type="search"
                    defaultValue={search}
                    placeholder="Find by name, number, subject or list…"
                  />
                  {show !== "all" && <input type="hidden" name="show" value={show} />}
                  <button type="submit" className="btn btn--small">
                    Find
                  </button>
                  {narrowed && (
                    <Link className="btn btn--small btn--ghost" href="/mail/merge">
                      Clear
                    </Link>
                  )}
                </form>
              }
            >
              <SegmentedLinks
                label="Which mailings"
                items={MAILING_SHOWS.map((choice) => ({
                  href: findHref({ show: choice.key }),
                  label: `${choice.label} ${formatNumber(
                    found.filter((mailing) => showsMailing(mailing.state, choice.key)).length,
                  )}`,
                  current: choice.key === show,
                }))}
              />
              {narrowed && (
                <p className="side-quiet merge-find-count" role="status">
                  {formatNumber(shownMailings.length)} of {formatNumber(mailings.length)} mailings
                  {search ? ` match “${search}”` : ""}
                </p>
              )}
              <DataTable
                caption="Mailings"
                columns={MAILING_COLUMNS}
                isEmpty={shownMailings.length === 0}
                empty={
                  narrowed ? (
                    <EmptyState
                      compact
                      title="Nothing matches"
                      description={
                        search
                          ? `No mailing matches “${search}” here. Try fewer words, or All.`
                          : "No mailing is in this state."
                      }
                    />
                  ) : (
                    <EmptyState
                      compact
                      title="No mailings yet"
                      description="Add a list, then start a mailing: write it once and it is made out to each person."
                    />
                  )
                }
              >
                {shownMailings.map((mailing) => (
                  <tr key={mailing.id}>
                    <td>
                      <Link className="table-title" href={`/mail/merge/mailings/${mailing.id}`}>
                        {mailing.name}
                      </Link>
                      <span className="table-sub">{mailing.subject || "No subject yet"}</span>
                    </td>
                    <td>
                      {mailing.lists.length > 0 ? (
                        mailing.lists.map((list) => list.name).join(", ")
                      ) : (
                        <span className="table-sub">No list chosen</span>
                      )}
                    </td>
                    <td>
                      <MailingPill mailing={mailing} />
                    </td>
                    <td className="data-table__num">{formatNumber(mailing.progress.sent)}</td>
                    <td className="data-table__num">
                      <DeliveredCell mailing={mailing} />
                    </td>
                    <td className="data-table__num">{formatNumber(mailing.progress.waiting)}</td>
                    <td className="data-table__num">
                      {formatNumber(
                        mailing.progress.skipped +
                          mailing.progress.failed +
                          mailing.progress.unknown,
                      )}
                    </td>
                    <td>
                      <Timestamp value={mailing.updated_at} now={now} mode="relative" />
                    </td>
                  </tr>
                ))}
              </DataTable>
              <p className="side-quiet">
                Accepted means the provider took the message. Delivered is what it said happened
                next.
              </p>
            </RecordSection>
            <RecordSection id="merge-lists" title="Lists">
              {search && (
                <p className="side-quiet merge-find-count" role="status">
                  {formatNumber(shownLists.length)} of {formatNumber(lists.length)} lists match “
                  {search}”
                </p>
              )}
              <DataTable
                caption="Mail merge lists"
                columns={LIST_COLUMNS}
                isEmpty={shownLists.length === 0}
                empty={
                  search ? (
                    <EmptyState
                      compact
                      title="Nothing matches"
                      description={`No list matches “${search}”.`}
                    />
                  ) : (
                    <EmptyState
                      compact
                      title="No lists yet"
                      description="Add a CSV with one row a person. Every column becomes a field the message can use."
                    />
                  )
                }
              >
                {shownLists.map((list) => (
                  <tr key={list.id}>
                    <td>
                      <Link className="table-title" href={`/mail/merge/lists/${list.id}`}>
                        {list.name}
                      </Link>
                      <span className="table-sub">{list.file_name || "Added by hand"}</span>
                    </td>
                    <td className="data-table__num">{formatNumber(list.people)}</td>
                    <td className="data-table__num">{formatNumber(list.left_out)}</td>
                    <td>
                      {list.columns
                        .filter((column) => !column.derived)
                        .map((column) => column.label)
                        .join(", ")}
                    </td>
                    <td>
                      <Timestamp value={list.created_at} now={now} mode="relative" />
                    </td>
                  </tr>
                ))}
              </DataTable>
            </RecordSection>
          </>
        )}
      </div>
    </>
  );
}
