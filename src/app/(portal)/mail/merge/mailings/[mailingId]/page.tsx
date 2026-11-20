import Link from "next/link";
import { notFound } from "next/navigation";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import {
  addPeopleAction,
  cancelMailingAction,
  deleteMailingAction,
  duplicateMailingAction,
  checkDeliveryAction,
  pauseMailingAction,
  pickAllAction,
  pickPersonAction,
  practiseMailingAction,
  resumeMailingAction,
  retryMailingAction,
  saveMailingAction,
  startMailingAction,
  testMailingAction,
} from "@/app/(portal)/mail/merge/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { MailForm } from "@/components/mail/mail-form";
import { MailTabs } from "@/components/mail/mail-tabs";
import { MailingPill, RecipientPill, SenderDown } from "@/components/mail/merge";
import { DeliveryPill, DeliveryWarnings, isDeliveryShown } from "@/components/mail/merge-delivery";
import { MergeEditor } from "@/components/mail/merge-editor";
import { PickBox } from "@/components/mail/merge-people";
import { RenderedPreview } from "@/components/mail/rendered-preview";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { formatAbsolute, formatNumber } from "@/lib/format";
import { MERGE_ROLE_LINE, requireMerge } from "@/lib/merge/access";
import {
  MergeRequestError,
  MergeUnavailableError,
  readMergeMailing,
  readMergeMailingDelivery,
  readMergePeople,
  type MergeMailingDelivery,
  type MergeMailingDetail,
  type MergePeople,
} from "@/lib/merge/api";
import { isRetry } from "@/lib/merge/delivery-contracts";
import { requestNow } from "@/lib/request-time";

import "../../delivery.css";

export const metadata = { title: "Mailing" };
export const dynamic = "force-dynamic";

const RECIPIENT_COLUMNS = [
  { key: "who", label: "Person" },
  { key: "list", label: "List" },
  { key: "state", label: "State" },
  { key: "delivery", label: "Delivery" },
  { key: "why", label: "Why" },
  { key: "when", label: "When" },
];

const DELIVERY_COLUMNS = [
  { key: "who", label: "Person" },
  { key: "what", label: "What happened" },
  { key: "when", label: "When" },
  { key: "next", label: "What next" },
];

const DELIVERY_VIEWS = [
  {
    key: "didnt",
    label: "Didn’t arrive",
    empty: "Everyone accepted has arrived or is still on its way.",
  },
  { key: "not_yet", label: "Not delivered yet", empty: "Nothing is still on its way." },
  { key: "retry", label: "For a retry", empty: "Nobody is waiting for a retry." },
  { key: "all", label: "Everyone", empty: "Nobody here" },
] as const;
type DeliveryViewKey = (typeof DELIVERY_VIEWS)[number]["key"];

/**
 * A mailing's delivery, from a sender that may be older than the read-back ("nothing
 * answers there" is then not a failure). Any other failure of this one read is null, and
 * the rest of the page is drawn as usual.
 */
async function readDelivery(
  mailingId: string,
  view: DeliveryViewKey,
  offset: number,
): Promise<MergeMailingDelivery | "older_sender" | null> {
  try {
    return await readMergeMailingDelivery(mailingId, { view, offset });
  } catch (error) {
    if (error instanceof MergeRequestError && error.code === "no_such_route") return "older_sender";
    if (error instanceof MergeRequestError || error instanceof MergeUnavailableError) return null;
    throw error;
  }
}

/** What comes next for one person, in a few words: the stop list, a retry, or nothing. */
function whatNext(row: MergeMailingDelivery["rows"][number]) {
  if (row.reaction !== null || row.delivery === "hard_bounce" || row.delivery === "invalid") {
    if (row.stop.on)
      return (
        <>
          On the stop list since <Timestamp value={row.stop.since} mode="date" />
        </>
      );
    return row.stop.waiting ? "Waiting for your say on Mail merge" : "Not on the stop list";
  }
  if (isRetry(row.delivery)) return row.stop.on ? "On the stop list" : "Can be retried";
  if (row.delivery === "delivered") return "Arrived";
  return "Still on its way";
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "sent", label: "Sent" },
  { key: "waiting", label: "Waiting" },
  { key: "failed", label: "Refused" },
  { key: "unknown", label: "No answer" },
  { key: "skipped", label: "Left out" },
] as const;

function Checklist({ checks }: { checks: MergeMailingDetail["checks"] }) {
  return (
    <ul className="checklist">
      {checks.map((item) => (
        <li
          key={item.key}
          className={
            item.ok ? "check check--ok" : item.blocking ? "check check--block" : "check check--warn"
          }
        >
          <span className="check__mark" aria-hidden="true">
            {item.ok ? "✓" : item.blocking ? "✕" : "!"}
          </span>
          <span>{item.label}</span>
          <span className="sr-only">
            {item.ok ? "done" : item.blocking ? "blocks sending" : "advised"}
          </span>
        </li>
      ))}
    </ul>
  );
}

/**
 * One mailing, from the words to the record of who was written to. While it is a draft it
 * is written, checked, read as each person will read it, tested and practised; once it
 * is going, this is where it is watched, paused and accounted for.
 */
export default async function MailingPage({
  params,
  searchParams,
}: {
  params: Promise<{ mailingId: string }>;
  searchParams: Promise<{
    preview?: string;
    state?: string;
    offset?: string;
    q?: string;
    show?: string;
    from?: string;
    dview?: string;
    doffset?: string;
    find?: string;
  }>;
}) {
  const { mailingId } = await params;
  const query = await searchParams;
  const path = `/mail/merge/mailings/${mailingId}`;
  const { context, allowed } = await requireMerge(path);
  const now = requestNow();
  const preview = Math.max(0, Number.parseInt(query.preview ?? "0", 10) || 0);
  const offset = Math.max(0, Number.parseInt(query.offset ?? "0", 10) || 0);
  const wanted = FILTERS.some((filter) => filter.key === query.state) ? query.state! : "all";
  const search = (query.q ?? "").slice(0, 200);
  // The record's own find box, kept apart from the picker's `q` above it.
  const find = (query.find ?? "").trim().slice(0, 200);
  const show = query.show === "picked" ? "picked" : "all";
  const from = Math.max(0, Number.parseInt(query.from ?? "0", 10) || 0);
  let detail: MergeMailingDetail | null = null;
  let people: MergePeople | null = null;
  const dview: DeliveryViewKey =
    DELIVERY_VIEWS.find((view) => view.key === query.dview)?.key ?? "didnt";
  const doffset = Math.max(0, Number.parseInt(query.doffset ?? "0", 10) || 0);
  let delivered: MergeMailingDelivery | null = null;
  // A sender from before the read-back has no such answer: the section says so, in a line.
  let olderSender = false;
  if (allowed) {
    try {
      detail = await readMergeMailing(mailingId, { preview, offset, state: wanted, q: find });
      if (detail.mailing.editable && detail.mailing.pick_only)
        people = await readMergePeople(mailingId, { q: search, offset: from, view: show });
      if (detail.mailing.mode === "live" && detail.mailing.state !== "draft") {
        const read = await readDelivery(mailingId, dview, doffset);
        delivered = read === "older_sender" ? null : read;
        olderSender = read === "older_sender";
      }
    } catch (error) {
      if (error instanceof MergeRequestError && error.status === 404) notFound();
      if (!(error instanceof MergeUnavailableError || error instanceof MergeRequestError))
        throw error;
    }
  }
  const mailing = detail?.mailing;
  const running = mailing?.state === "sending" || mailing?.state === "paused";
  const hasRun = mailing !== undefined && mailing.state !== "draft" && mailing.mode !== null;
  const practice = mailing?.mode === "practice";
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const idField = { mailing_id: mailingId };
  const checks = detail?.checks ?? [];
  const blockers = checks.filter((check) => check.blocking && !check.ok);
  const practiceReady = blockers.every((check) => check.live_only);
  const sendReady = blockers.length === 0;
  const progress = mailing?.progress;
  const previewHref = (index: number) => `${path}?preview=${index}`;
  const peopleHref = (next: { show?: string; from?: number }) => {
    const params = new URLSearchParams();
    if (search) params.set("q", search);
    if ((next.show ?? show) === "picked") params.set("show", "picked");
    if (next.from) params.set("from", String(next.from));
    const text = params.toString();
    return `${path}${text ? `?${text}` : ""}#merge-who-section`;
  };
  const sendable = detail?.audience.sendable ?? 0;
  const sendLabel = `Send to ${formatNumber(sendable)} ${sendable === 1 ? "person" : "people"}`;
  // The record's two keys: which outcome, and who is being looked for. A page starts over.
  const recordHref = (next: { state?: string; offset?: number; find?: string }) => {
    const params = new URLSearchParams();
    const state = next.state ?? wanted;
    if (state !== "all") params.set("state", state);
    const looking = next.find ?? find;
    if (looking) params.set("find", looking);
    if (next.offset) params.set("offset", String(next.offset));
    const text = params.toString();
    // While someone is looked for (or the look is being cleared), the page stays at the record.
    return `${path}${text ? `?${text}` : ""}${looking || find ? "#merge-recipients" : ""}`;
  };
  const filterHref = (state: string) => recordHref({ state });
  // The Delivery section's own two keys, kept apart from the recipients table's.
  const deliveryHref = (next: { view?: DeliveryViewKey; offset?: number }) => {
    const params = new URLSearchParams();
    if (wanted !== "all") params.set("state", wanted);
    if (find) params.set("find", find);
    if (offset) params.set("offset", String(offset));
    const view = next.view ?? dview;
    if (view !== "didnt") params.set("dview", view);
    if (next.offset) params.set("doffset", String(next.offset));
    const text = params.toString();
    return `${path}${text ? `?${text}` : ""}#merge-delivery`;
  };
  const counts = delivered?.delivery?.counts ?? null;
  const retryCount = delivered?.retry.count ?? 0;
  const reading = delivered?.read.reading === true;
  const deliveryView = DELIVERY_VIEWS.find((view) => view.key === dview)!;
  // A sender started before the find box answers with everyone: say so, not a wrong list.
  const findUnread = find !== "" && detail !== null && detail.recipients.q === undefined;
  const found = detail?.recipients.total ?? 0;
  const foundOf = detail?.recipients.of ?? found;
  return (
    <>
      <PageHeader
        eyebrow="Mail merge"
        title={mailing?.name ?? "Mailing"}
        meta={
          mailing && (
            <>
              <MailingPill mailing={mailing} />
              {mailing.state === "sending" && <LiveRefresh intervalSeconds={5} label="This send" />}
            </>
          )
        }
        actions={
          <>
            <Link className="btn btn--small" href="/mail/merge">
              Back to Mail merge
            </Link>
            {mailing && (
              <MailForm
                action={duplicateMailingAction}
                fields={idField}
                submitLabel="Make a copy"
                className="inline-form"
              />
            )}
            {mailing && !running && (
              <MailForm
                action={deleteMailingAction}
                fields={idField}
                submitLabel="Delete"
                variant="danger"
                className="inline-form"
              />
            )}
            <MailTabs current="/mail/merge" />
          </>
        }
      />
      <div className="page-content">
        {!allowed ? (
          <Callout tone="neutral">{MERGE_ROLE_LINE}</Callout>
        ) : !detail || !mailing || !progress ? (
          <SenderDown />
        ) : (
          <>
            {mailing.pause_reason && (
              <Callout tone="attention" role="status" title="Paused">
                {mailing.pause_reason}
              </Callout>
            )}
            {practice && mailing.state === "finished" && (
              <Callout tone="neutral" role="status" title="That was practice">
                Nothing left this computer. Read the messages below, change the words if you want
                to, and send it for real when it is right.
              </Callout>
            )}
            {hasRun && (
              <>
                <StatGrid columns={6} label="This send">
                  <Stat
                    label={practice ? "Practised" : "Accepted"}
                    value={formatNumber(progress.sent)}
                    hint={
                      practice
                        ? `of ${formatNumber(progress.total)}`
                        : `of ${formatNumber(progress.total)}, by the provider`
                    }
                  />
                  <Stat label="Waiting" value={formatNumber(progress.waiting)} />
                  <Stat
                    label="Refused"
                    value={formatNumber(progress.failed)}
                    tone={progress.failed > 0 ? "danger" : "default"}
                  />
                  <Stat label="No answer" value={formatNumber(progress.unknown)} />
                  <Stat label="Left out" value={formatNumber(progress.skipped)} />
                  <Stat
                    label="Sent today"
                    value={formatNumber(detail.sent_today)}
                    hint={`of ${formatNumber(detail.daily_cap)} a day`}
                  />
                </StatGrid>
                {running && (
                  <div className="inline-actions">
                    {mailing.state === "sending" ? (
                      <MailForm
                        action={pauseMailingAction}
                        fields={idField}
                        submitLabel="Pause"
                        variant="primary"
                        className="inline-form"
                      />
                    ) : (
                      <MailForm
                        action={resumeMailingAction}
                        fields={idField}
                        submitLabel="Resume"
                        variant="primary"
                        className="inline-form"
                      />
                    )}
                    <MailForm
                      action={cancelMailingAction}
                      fields={idField}
                      submitLabel="Cancel the rest"
                      variant="danger"
                      className="inline-form"
                    />
                  </div>
                )}
              </>
            )}

            {hasRun && !practice && (
              <RecordSection
                id="merge-delivery"
                title="Delivery"
                actions={
                  delivered ? (
                    <MailForm
                      action={checkDeliveryAction}
                      fields={idField}
                      submitLabel="Check delivery now"
                      pendingLabel="Asking the provider…"
                      className="inline-form"
                      disabled={!delivered.read.key_set || reading}
                    />
                  ) : undefined
                }
              >
                <div className="merge-delivery">
                  {olderSender ? (
                    <p>
                      Delivery read-back starts when the sender is next restarted, between batches.
                    </p>
                  ) : !delivered ? (
                    <p>Delivery could not be read from the sender just now.</p>
                  ) : (
                    <>
                      <p>
                        What the provider says happened after it accepted each message.{" "}
                        {reading ? (
                          <span role="status">
                            Reading now…{" "}
                            {mailing.state !== "sending" && (
                              <LiveRefresh intervalSeconds={5} label="Delivery" />
                            )}
                          </span>
                        ) : delivered.delivery?.read_at ? (
                          <>
                            Read{" "}
                            <Timestamp
                              value={delivered.delivery.read_at}
                              now={now}
                              mode="relative"
                            />
                            .
                          </>
                        ) : (
                          "Not read yet."
                        )}
                      </p>
                      {!delivered.delivery || !counts ? (
                        <EmptyState
                          compact
                          title="Not read yet"
                          description="Delivery is read every 30 minutes for mailings sent in the last 7 days, then once a day up to 30 days. Check now to read it at once."
                        />
                      ) : (
                        <>
                          <DeliveryWarnings
                            warnings={delivered.warnings}
                            after={(warning) =>
                              warning.key === "hard_bounces" ? (
                                <p>
                                  {(delivered.waiting_stops ?? 0) > 0
                                    ? "They go on the stop list once you say so on Mail merge."
                                    : "Those addresses are on the stop list now."}
                                </p>
                              ) : null
                            }
                            pause={
                              mailing.state === "sending" ? (
                                <MailForm
                                  action={pauseMailingAction}
                                  fields={idField}
                                  submitLabel="Pause this mailing"
                                  pendingLabel="Pausing…"
                                  className="inline-form"
                                />
                              ) : undefined
                            }
                          />
                          <p className="merge-delivery__sentence">
                            {formatNumber(counts.delivered)} of {formatNumber(counts.accepted)}{" "}
                            delivered. {formatNumber(counts.didnt_arrive)} didn&rsquo;t arrive.{" "}
                            {formatNumber(counts.not_yet)} not delivered yet.
                            {(counts.complaint > 0 || counts.unsubscribed > 0) &&
                              ` ${formatNumber(counts.complaint)} marked as spam, ${formatNumber(counts.unsubscribed)} unsubscribed.`}
                          </p>
                          <StatGrid columns={3} label="Delivery">
                            <Stat
                              label="Delivered"
                              value={formatNumber(counts.delivered)}
                              hint={`of ${formatNumber(counts.accepted)} accepted`}
                            />
                            <Stat
                              label="Not delivered yet"
                              value={formatNumber(counts.not_yet)}
                              hint="no word, or delayed"
                            />
                            <Stat
                              label="Hard bounces"
                              value={formatNumber(counts.hard_bounce)}
                              hint="go on the stop list"
                              tone={counts.hard_bounce > 0 ? "danger" : "default"}
                            />
                            <Stat
                              label="Soft bounces"
                              value={formatNumber(counts.soft_bounce)}
                              hint="worth one retry"
                            />
                            <Stat
                              label="Blocked by the provider"
                              value={formatNumber(counts.blocked)}
                              hint="can be retried"
                            />
                            <Stat
                              label="Not a working address"
                              value={formatNumber(counts.invalid)}
                              hint="go on the stop list"
                            />
                            <Stat
                              label="Not sent by the provider"
                              value={formatNumber(counts.error)}
                              hint="can be retried"
                            />
                            <Stat
                              label="Spam complaints"
                              value={formatNumber(counts.complaint)}
                              hint="go on the stop list"
                              tone={counts.complaint > 0 ? "danger" : "default"}
                            />
                            <Stat
                              label="Unsubscribed"
                              value={formatNumber(counts.unsubscribed)}
                              hint="go on the stop list"
                            />
                          </StatGrid>
                          <SegmentedLinks
                            label="Show"
                            items={DELIVERY_VIEWS.map((view) => ({
                              href: deliveryHref({ view: view.key }),
                              label: `${view.label} ${formatNumber(delivered.counts_by_view[view.key])}`,
                              current: view.key === dview,
                            }))}
                          />
                          <p className="merge-delivery__print">Showing: {deliveryView.label}</p>
                          <DataTable
                            caption="Delivery by person"
                            columns={DELIVERY_COLUMNS}
                            isEmpty={delivered.rows.length === 0}
                            empty={<EmptyState compact title={deliveryView.empty} />}
                          >
                            {delivered.rows.map((row) => (
                              <tr key={row.email}>
                                <td>
                                  <span className="mono">{row.email}</span>
                                  {row.name && <span className="table-sub">{row.name}</span>}
                                </td>
                                <td>
                                  <DeliveryPill shown={row.shown} />
                                  {row.reason && <span className="table-sub">{row.reason}</span>}
                                </td>
                                <td>
                                  <Timestamp
                                    value={row.reaction_at ?? row.delivery_at}
                                    now={now}
                                    mode="relative"
                                    fallback="No word yet"
                                  />
                                </td>
                                <td>{whatNext(row)}</td>
                              </tr>
                            ))}
                          </DataTable>
                          {delivered.total > delivered.limit && (
                            <Pagination
                              offset={delivered.offset}
                              limit={delivered.limit}
                              returned={delivered.rows.length}
                              hasMore={delivered.offset + delivered.limit < delivered.total}
                              nextOffset={delivered.offset + delivered.limit}
                              buildHref={(next) => deliveryHref({ offset: next })}
                              noun="people"
                            />
                          )}
                          {retryCount > 0 && (
                            <div className="merge-delivery__retry">
                              <p>
                                {retryCount === 1
                                  ? "1 soft bounce, blocked or not sent can be tried once more."
                                  : `${formatNumber(retryCount)} soft bounces, blocked or not sent can be tried once more.`}
                                {delivered.retry.on_stop_list > 0 &&
                                  ` ${formatNumber(delivered.retry.on_stop_list)} more are on the stop list and are left out.`}
                              </p>
                              <div className="merge-delivery__act">
                                <MailForm
                                  action={retryMailingAction}
                                  fields={idField}
                                  submitLabel="Make a retry mailing for these"
                                  pendingLabel="Making the draft…"
                                  className="inline-form"
                                />
                                <p className="side-quiet">
                                  It makes a draft that goes only to these{" "}
                                  {formatNumber(retryCount)}, with “Leave out anyone another mailing
                                  already reached” unticked. Nothing goes until you test it and send
                                  it.
                                </p>
                              </div>
                            </div>
                          )}
                        </>
                      )}
                    </>
                  )}
                </div>
              </RecordSection>
            )}

            {mailing.editable && (
              <>
                <RecordSection id="merge-words" title="The message">
                  <MergeEditor
                    action={saveMailingAction}
                    mailingId={mailing.id}
                    name={mailing.name}
                    subject={mailing.subject}
                    body={mailing.body}
                    listIds={mailing.list_ids}
                    onlyColumn={mailing.only_column}
                    onlyValue={mailing.only_value}
                    holdColumn={mailing.hold_column}
                    pickOnly={mailing.pick_only}
                    skipWritten={mailing.skip_written}
                    lists={detail.available_lists}
                    fields={detail.fields}
                  />
                  <p className="side-quiet">
                    Under every message: {detail.message.footer || "nothing yet"}.{" "}
                    <Link className="text-link" href="/mail/merge/setup">
                      Change it in Setup
                    </Link>
                  </p>
                </RecordSection>
                <div id="merge-who-section">
                  <RecordSection
                    id="merge-who-people"
                    title={
                      mailing.pick_only
                        ? `People you pick (${formatNumber(people?.picked_total ?? 0)} ticked)`
                        : "Add someone by hand"
                    }
                    actions={
                      <Popover label="Add addresses by hand" width="wide" align="end">
                        <MailForm
                          action={addPeopleAction}
                          fields={idField}
                          submitLabel="Add to this mailing"
                          pendingLabel="Adding…"
                        >
                          <Field
                            id="merge-add-emails"
                            label="Addresses"
                            hint="One or many, separated by spaces, commas or new lines. They are kept on the list called Added by hand."
                          >
                            <Textarea id="merge-add-emails" name="emails" rows={3} required />
                          </Field>
                          {detail.message_fields.map((field) => (
                            <Field
                              key={field.key}
                              id={`merge-add-${field.key}`}
                              label={field.label}
                              hint={
                                field.required
                                  ? "The message uses this. With it empty, they are left out."
                                  : "Optional: the message has a fallback."
                              }
                            >
                              <Textarea
                                id={`merge-add-${field.key}`}
                                name={`value_${field.key}`}
                                rows={2}
                                maxLength={4000}
                              />
                            </Field>
                          ))}
                        </MailForm>
                      </Popover>
                    }
                  >
                    {!people && (
                      <p className="side-quiet">
                        To send to a few people only, set Send to as Only the people I pick above
                        and save. Addresses added here get this mailing too.
                      </p>
                    )}
                    {people && (
                      <>
                        <form className="merge-search" method="get" action={path}>
                          <label className="sr-only" htmlFor="merge-people-search">
                            Find people by name, address or any column
                          </label>
                          <Input
                            id="merge-people-search"
                            name="q"
                            type="search"
                            defaultValue={search}
                            placeholder="Find by name, address, firm, tier…"
                          />
                          {show === "picked" && <input type="hidden" name="show" value="picked" />}
                          <button type="submit" className="btn btn--small">
                            Find
                          </button>
                        </form>
                        <div className="merge-preview-bar">
                          <SegmentedLinks
                            label="Show"
                            items={[
                              {
                                href: peopleHref({ show: "all" }),
                                label: "All",
                                current: show === "all",
                              },
                              {
                                href: peopleHref({ show: "picked" }),
                                label: "Ticked",
                                current: show === "picked",
                              },
                            ]}
                          />
                          <span className="inline-actions">
                            <MailForm
                              action={pickAllAction}
                              fields={{ ...idField, picked: "1", q: search }}
                              submitLabel={search ? "Tick everyone found" : "Tick everyone"}
                              className="inline-form"
                            />
                            <MailForm
                              action={pickAllAction}
                              fields={{ ...idField, picked: "0", q: search }}
                              submitLabel={search ? "Untick everyone found" : "Untick everyone"}
                              className="inline-form"
                            />
                          </span>
                        </div>
                        <DataTable
                          caption="People you can pick"
                          columns={[
                            { key: "pick", label: "Send" },
                            { key: "who", label: "Person" },
                            ...people.columns.map((column) => ({
                              key: column.key,
                              label: column.label,
                            })),
                            { key: "note", label: "Note" },
                            { key: "act", label: "Actions" },
                          ]}
                          isEmpty={people.rows.length === 0}
                          empty={
                            <EmptyState
                              compact
                              title={
                                search
                                  ? "Nobody found"
                                  : show === "picked"
                                    ? "Nobody ticked yet"
                                    : "Nobody on the lists chosen"
                              }
                              description={show === "picked" ? "Tick people under All." : undefined}
                            />
                          }
                        >
                          {people.rows.map((person) => (
                            <tr key={person.email}>
                              <td>
                                <PickBox
                                  action={pickPersonAction}
                                  mailingId={mailing.id}
                                  email={person.email}
                                  picked={person.picked}
                                  label={`Send to ${person.email}`}
                                />
                              </td>
                              <td>
                                <span className="mono">{person.email}</span>
                                {person.name && <span className="table-sub">{person.name}</span>}
                              </td>
                              {person.cells.map((cell, index) => (
                                <td key={people.columns[index]!.key}>{cell}</td>
                              ))}
                              <td>{person.reason}</td>
                              <td>
                                <Link
                                  className="btn btn--small btn--ghost"
                                  href={`/mail/merge/lists/${person.list_id}?edit=${person.row_id}&back=${mailing.id}`}
                                  aria-label={`Edit ${person.email}`}
                                >
                                  Edit
                                </Link>
                              </td>
                            </tr>
                          ))}
                        </DataTable>
                        {people.total > people.limit && (
                          <Pagination
                            offset={people.offset}
                            limit={people.limit}
                            returned={people.rows.length}
                            hasMore={people.offset + people.limit < people.total}
                            nextOffset={people.offset + people.limit}
                            buildHref={(next) => peopleHref({ from: next })}
                            noun="people"
                          />
                        )}
                      </>
                    )}
                  </RecordSection>
                </div>
                <RecordSection id="merge-checks" title="Before it can go">
                  <Checklist checks={checks} />
                </RecordSection>
              </>
            )}

            <RecordSection id="merge-preview" title="As each person reads it">
              {detail.preview ? (
                <>
                  <div className="merge-preview-bar">
                    <span>
                      To <span className="mono">{detail.preview.email}</span>
                      {detail.preview.name ? ` (${detail.preview.name})` : ""}, person{" "}
                      {formatNumber(detail.preview.index + 1)} of{" "}
                      {formatNumber(detail.preview.total)}
                    </span>
                    <span className="inline-actions">
                      {mailing.editable && detail.preview.row_id && (
                        <Link
                          className="btn btn--small"
                          href={`/mail/merge/lists/${detail.preview.list_id}?edit=${detail.preview.row_id}&back=${mailing.id}`}
                        >
                          Edit this person
                        </Link>
                      )}
                      {detail.preview.index > 0 && (
                        <Link
                          className="btn btn--small"
                          href={previewHref(detail.preview.index - 1)}
                        >
                          Previous person
                        </Link>
                      )}
                      {detail.preview.index + 1 < detail.preview.total && (
                        <Link
                          className="btn btn--small"
                          href={previewHref(detail.preview.index + 1)}
                        >
                          Next person
                        </Link>
                      )}
                    </span>
                  </div>
                  <RenderedPreview
                    subject={detail.preview.subject}
                    html={detail.preview.html}
                    text={detail.preview.text}
                    label={`The message to ${detail.preview.email}`}
                  />
                </>
              ) : (
                <EmptyState
                  compact
                  title="Nobody to show it for yet"
                  description="Save a subject and a message, and choose a list with people on it."
                />
              )}
            </RecordSection>

            {mailing.editable && (
              <RecordSection id="merge-go" title="Send">
                <div className="merge-go">
                  <div className="merge-go__step">
                    <h3 className="card__title">Practise</h3>
                    <p className="side-quiet">
                      Goes through every person and sends nothing. Needs no key.
                    </p>
                    <MailForm
                      action={practiseMailingAction}
                      fields={idField}
                      submitLabel="Practise this send"
                      disabled={!practiceReady}
                    />
                  </div>
                  <div className="merge-go__step">
                    <h3 className="card__title">Test</h3>
                    <p className="side-quiet">
                      One real email to you, made out as the first person&rsquo;s message.
                    </p>
                    <MailForm
                      action={testMailingAction}
                      fields={idField}
                      submitLabel="Send me a test"
                      pendingLabel="Sending…"
                      disabled={!detail.key_set}
                    >
                      <Field id="merge-test-to" label="To">
                        <Input
                          id="merge-test-to"
                          name="to"
                          type="email"
                          maxLength={254}
                          defaultValue={detail.message.from_email}
                          required
                        />
                      </Field>
                    </MailForm>
                  </div>
                  <div className="merge-go__step">
                    <h3 className="card__title">Send for real</h3>
                    <SudoGate
                      action={confirmSudoAction}
                      fresh={fresh}
                      untilLabel={untilLabel}
                      returnPath={path}
                      purpose="Sending for real needs a fresh code from your authenticator app."
                    />
                    <MailForm
                      action={startMailingAction}
                      fields={idField}
                      submitLabel={sendLabel}
                      pendingLabel="Starting…"
                      variant="primary"
                      disabled={!sendReady || !fresh}
                    >
                      <Field
                        id="merge-confirm"
                        label={`Type ${detail.audience.sendable} to send`}
                        hint={
                          sendReady
                            ? "This cannot be taken back once a message has gone."
                            : "Open once every check above is done."
                        }
                      >
                        <Input
                          id="merge-confirm"
                          name="confirm"
                          inputMode="numeric"
                          autoComplete="off"
                          disabled={!sendReady || !fresh}
                          required
                        />
                      </Field>
                    </MailForm>
                  </div>
                </div>
              </RecordSection>
            )}

            {hasRun && (
              <RecordSection
                id="merge-recipients"
                title="Who was written to"
                actions={
                  <a className="btn btn--small" href={`${path}/outcomes`}>
                    Download as a CSV
                  </a>
                }
              >
                <form
                  className="merge-search"
                  method="get"
                  action={`${path}#merge-recipients`}
                  role="search"
                >
                  <label className="sr-only" htmlFor="merge-record-find">
                    Find someone in this mailing by address, name, firm or list
                  </label>
                  <Input
                    id="merge-record-find"
                    name="find"
                    type="search"
                    maxLength={200}
                    defaultValue={find}
                    placeholder="Find by address, name, firm or list…"
                  />
                  {wanted !== "all" && <input type="hidden" name="state" value={wanted} />}
                  <button type="submit" className="btn btn--small">
                    Find
                  </button>
                  {find && (
                    <Link className="btn btn--small btn--ghost" href={recordHref({ find: "" })}>
                      Clear
                    </Link>
                  )}
                </form>
                <SegmentedLinks
                  label="Show"
                  items={FILTERS.map((filter) => ({
                    href: filterHref(filter.key),
                    label: filter.label,
                    current: filter.key === wanted,
                  }))}
                />
                {find &&
                  (findUnread ? (
                    <p className="side-quiet" role="status">
                      The find box starts working when the sender is next restarted, between
                      batches. Everyone is shown below.
                    </p>
                  ) : (
                    <p className="side-quiet" role="status">
                      {found === 0
                        ? `Nobody matches “${find}”.`
                        : `${formatNumber(found)} of ${formatNumber(foundOf)} ${
                            found === 1 ? "matches" : "match"
                          } “${find}”.`}
                    </p>
                  ))}
                <DataTable
                  caption="Who was written to"
                  columns={RECIPIENT_COLUMNS}
                  isEmpty={detail.recipients.rows.length === 0}
                  empty={
                    <EmptyState
                      compact
                      title={find && !findUnread ? "Nobody found" : "Nobody here"}
                    />
                  }
                >
                  {detail.recipients.rows.map((row) => (
                    <tr key={row.email}>
                      <td>
                        <span className="mono">{row.email}</span>
                        {row.name && <span className="table-sub">{row.name}</span>}
                      </td>
                      <td>{row.list}</td>
                      <td>
                        <RecipientPill state={row.state} practice={practice} />
                      </td>
                      <td>
                        {practice ? null : isDeliveryShown(row.delivery) ? (
                          <DeliveryPill shown={row.delivery} />
                        ) : row.state === "sent" || row.state === "unknown" ? (
                          <span className="table-sub">Not read yet</span>
                        ) : null}
                      </td>
                      <td>{row.reason}</td>
                      <td>{row.at && <Timestamp value={row.at} now={now} mode="relative" />}</td>
                    </tr>
                  ))}
                </DataTable>
                {detail.recipients.total > detail.recipients.limit && (
                  <Pagination
                    offset={detail.recipients.offset}
                    limit={detail.recipients.limit}
                    returned={detail.recipients.rows.length}
                    hasMore={
                      detail.recipients.offset + detail.recipients.limit < detail.recipients.total
                    }
                    nextOffset={detail.recipients.offset + detail.recipients.limit}
                    buildHref={(next) => recordHref({ offset: next })}
                    noun="people"
                  />
                )}
              </RecordSection>
            )}
          </>
        )}
      </div>
    </>
  );
}
