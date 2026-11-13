import Link from "next/link";
import { notFound } from "next/navigation";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import {
  addPeopleAction,
  cancelMailingAction,
  deleteMailingAction,
  duplicateMailingAction,
  pauseMailingAction,
  pickAllAction,
  pickPersonAction,
  practiseMailingAction,
  resumeMailingAction,
  saveMailingAction,
  startMailingAction,
  testMailingAction,
} from "@/app/(portal)/mail/merge/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { MailForm } from "@/components/mail/mail-form";
import { MailTabs } from "@/components/mail/mail-tabs";
import { MailingPill, RecipientPill, SenderDown } from "@/components/mail/merge";
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
  readMergePeople,
  type MergeMailingDetail,
  type MergePeople,
} from "@/lib/merge/api";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Mailing" };
export const dynamic = "force-dynamic";

const RECIPIENT_COLUMNS = [
  { key: "who", label: "Person" },
  { key: "list", label: "List" },
  { key: "state", label: "State" },
  { key: "why", label: "Why" },
  { key: "when", label: "When" },
];

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
  const show = query.show === "picked" ? "picked" : "all";
  const from = Math.max(0, Number.parseInt(query.from ?? "0", 10) || 0);
  let detail: MergeMailingDetail | null = null;
  let people: MergePeople | null = null;
  if (allowed) {
    try {
      detail = await readMergeMailing(mailingId, { preview, offset, state: wanted });
      if (detail.mailing.editable && detail.mailing.pick_only)
        people = await readMergePeople(mailingId, { q: search, offset: from, view: show });
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
  const filterHref = (state: string) => (state === "all" ? path : `${path}?state=${state}`);
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
                    label={practice ? "Practised" : "Sent"}
                    value={formatNumber(progress.sent)}
                    hint={`of ${formatNumber(progress.total)}`}
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
                <SegmentedLinks
                  label="Show"
                  items={FILTERS.map((filter) => ({
                    href: filterHref(filter.key),
                    label: filter.label,
                    current: filter.key === wanted,
                  }))}
                />
                <DataTable
                  caption="Who was written to"
                  columns={RECIPIENT_COLUMNS}
                  isEmpty={detail.recipients.rows.length === 0}
                  empty={<EmptyState compact title="Nobody here" />}
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
                    buildHref={(next) =>
                      `${path}?offset=${next}${wanted === "all" ? "" : `&state=${wanted}`}`
                    }
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
