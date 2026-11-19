import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { RuleLineNote } from "@/components/data/duties/rule-line";
import { MoneyTabs } from "@/components/data/money/money-tabs";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Button } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readClose, type ClosePage } from "@/lib/data/api/close";
import { dayWords } from "@/lib/data/labels-company";
import {
  ADMIN_PACK_WORDS,
  ATTACHABLE,
  CLOSE_ITEMS,
  CLOSE_ITEM_KEYS,
  CLOSE_ITEM_STATES,
  CLOSE_STATES,
  LOCK_WORDS,
  NOT_ADVICE,
  NO_HOLIDAYS,
  RULES_MISSING,
  readyWords,
} from "@/lib/data/labels-statements";
import { dataRead } from "@/lib/data/read";

import {
  acknowledgedAction,
  attachFileAction,
  closeItemAction,
  commentaryAction,
  detachFileAction,
  lockAction,
  reopenAction,
  sentAction,
} from "../actions";
import "../close.css";

export const metadata = { title: "Month close" };
export const dynamic = "force-dynamic";

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
const PACK_COLUMNS = [
  { key: "what", label: "What" },
  { key: "here", label: "What is here" },
  { key: "state", label: "State" },
];
const HISTORY_WORDS = {
  sent: "Sent",
  acknowledged: "Acknowledged",
  locked: "Locked",
  reopened: "Reopened",
} as const;

/**
 * One month's close (ws-notes/duties/spec.md §9.11): the pack's seven rows with their facts,
 * the download, sent, acknowledged, the lock and reopening, the history, and the month's MIS.
 * For Owners and Admins; the stipend row's figures and the pack's statements are the Owner's.
 */
export default async function CloseMonthRoute({ params }: { params: Promise<{ period: string }> }) {
  const { period } = await params;
  if (!PERIOD.test(period)) notFound();
  const { allowed, context } = await requireData(`/data/money/close/${period}`);
  const owner = context.me.role === "owner";
  const read = allowed ? await dataRead(() => readClose(period, owner)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title={data ? `Close ${data.label}` : "Month close"}
        description={allowed ? NOT_ADVICE : undefined}
        meta={
          data ? (
            <StatusPill
              value={data.state}
              label={CLOSE_STATES[data.state].label}
              tone={CLOSE_STATES[data.state].tone}
            />
          ) : undefined
        }
        actions={
          data ? (
            <form method="post" action={`/data/money/close/${period}/pack`}>
              <Button type="submit" size="small" variant="primary">
                Download the pack
              </Button>
            </form>
          ) : undefined
        }
      />
      <div className="page-content">
        <div className="hqdata-close">
          {allowed && <MoneyTabs current="close" owner={owner} />}
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : !read.ok ? (
            <DataUnavailable failure={read} />
          ) : (
            <Month page={read.data} period={period} owner={owner} />
          )}
        </div>
      </div>
    </>
  );
}

function Month({ page, period, owner }: { page: ClosePage; period: string; owner: boolean }) {
  const locked = page.close.locked !== null;
  const fields = { period };
  return (
    <>
      <p className="hqdata-close__line">
        {page.due_on ? `Close by ${dayWords(page.due_on)}` : RULES_MISSING} ·{" "}
        {readyWords(page.ready)} <RuleLineNote line={page.rule} />
      </p>
      {page.fallback_days && <p className="page-note">{NO_HOLIDAYS}</p>}
      {locked && page.close.locked && (
        <Callout tone="attention">
          {page.label} is locked since {dayWords(page.close.locked.at.slice(0, 10))}, by{" "}
          {page.close.locked.by.name}. Its bills, payments and lines cannot change until it is
          reopened with a reason.
        </Callout>
      )}

      <RecordSection id="close-pack" title="The pack">
        <DataTable caption="The pack" columns={PACK_COLUMNS} columnMenu={false}>
          {CLOSE_ITEM_KEYS.map((key) => {
            const item = page.close.items[key];
            return (
              <tr key={key}>
                <th scope="row" className="hqdata-close__what">
                  {CLOSE_ITEMS[key]}
                </th>
                <td>
                  {page.facts[key].length === 0 ? (
                    <span className="quiet">Nothing recorded for this row.</span>
                  ) : (
                    page.facts[key].map((fact) => (
                      <span key={fact} className="hqdata-close__fact">
                        {fact}
                      </span>
                    ))
                  )}
                  {item.note && <span className="table-sub">{item.note}</span>}
                  {!locked &&
                    ATTACHABLE.includes(key) &&
                    item.file_ids.map((id) => (
                      <MailForm
                        key={id}
                        action={detachFileAction}
                        fields={{ ...fields, key, file_id: id }}
                        submitLabel={`Take off: ${page.files[id] ?? "a file"}`}
                        pendingLabel="Taking off…"
                        className="hqdata-close__detach"
                      />
                    ))}
                </td>
                <td>
                  <StatusPill
                    value={item.state}
                    label={CLOSE_ITEM_STATES[item.state]}
                    tone={item.state === "open" ? "attention" : "neutral"}
                  />
                  {!locked && (
                    <div className="hqdata-close__acts">
                      <MailForm
                        action={closeItemAction}
                        fields={{ ...fields, key }}
                        submitLabel="Save"
                        pendingLabel="Saving…"
                        className="hqdata-close__row-form"
                      >
                        <label className="sr-only" htmlFor={`state-${key}`}>
                          State of {CLOSE_ITEMS[key]}
                        </label>
                        <Select id={`state-${key}`} name="state" defaultValue={item.state}>
                          <option value="open">{CLOSE_ITEM_STATES.open}</option>
                          <option value="ready">{CLOSE_ITEM_STATES.ready}</option>
                          <option value="none_this_month">
                            {CLOSE_ITEM_STATES.none_this_month}
                          </option>
                          {key === "gst_returns" && (
                            <option value="not_registered">
                              {CLOSE_ITEM_STATES.not_registered}
                            </option>
                          )}
                        </Select>
                        <label className="sr-only" htmlFor={`note-${key}`}>
                          Note on {CLOSE_ITEMS[key]}
                        </label>
                        <Input
                          id={`note-${key}`}
                          name="note"
                          defaultValue={item.note}
                          maxLength={500}
                          placeholder="Note"
                          autoComplete="off"
                        />
                      </MailForm>
                      {ATTACHABLE.includes(key) && (
                        <Popover label="Attach a file" width="wide">
                          <MailForm
                            action={attachFileAction}
                            fields={{ ...fields, key }}
                            submitLabel="Attach"
                            pendingLabel="Attaching…"
                          >
                            <Field
                              id={`file-${key}`}
                              label={CLOSE_ITEMS[key]}
                              hint="Kept in Files under Money › Close, and held for eight years."
                            >
                              <Input id={`file-${key}`} name="file" type="file" required />
                            </Field>
                          </MailForm>
                        </Popover>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            );
          })}
        </DataTable>
        <p className="page-note">
          {owner
            ? "Your pack holds the bank statements, the stipend sheet and the month's lines: keep it as private as this Mac."
            : ADMIN_PACK_WORDS}{" "}
          The pack is made when you download it and is never kept in Files.
        </p>
      </RecordSection>

      <RecordSection id="close-sent" title="Sent">
        {page.close.sent ? (
          <p className="hqdata-close__line">
            Sent {dayWords(page.close.sent.on)} to {page.close.sent.to_name}
            {page.close.sent.how ? `, ${page.close.sent.how}` : ""}.
          </p>
        ) : (
          <p className="page-note">
            Not recorded yet. HQ sends nothing: send it yourself, then record it.
          </p>
        )}
        {!locked && (
          <Popover label="Record that it was sent" width="wide" align="start">
            <MailForm
              action={sentAction}
              fields={fields}
              submitLabel="Record it"
              pendingLabel="Recording…"
            >
              <Field id="sent-on" label="On">
                <Input
                  id="sent-on"
                  name="on"
                  type="date"
                  required
                  defaultValue={page.close.sent?.on ?? ""}
                />
              </Field>
              <Field id="sent-to" label="To" hint="A contact or a name: your CA.">
                <Input
                  id="sent-to"
                  name="to_name"
                  required
                  maxLength={120}
                  autoComplete="off"
                  defaultValue={page.close.sent?.to_name ?? ""}
                />
              </Field>
              <Field id="sent-how" label="How">
                <Input
                  id="sent-how"
                  name="how"
                  maxLength={120}
                  autoComplete="off"
                  defaultValue={page.close.sent?.how ?? ""}
                />
              </Field>
            </MailForm>
          </Popover>
        )}
      </RecordSection>

      <RecordSection id="close-acknowledged" title="Acknowledged">
        {page.close.acknowledged ? (
          <p className="hqdata-close__line">
            Acknowledged {dayWords(page.close.acknowledged.on)} by {page.close.acknowledged.by_name}
            {page.close.acknowledged.note ? `: ${page.close.acknowledged.note}` : "."}
          </p>
        ) : (
          <p className="page-note">Not recorded yet. The lock does not wait for it.</p>
        )}
        {!locked && page.close.sent && (
          <Popover label="Record the acknowledgement" width="wide" align="start">
            <MailForm
              action={acknowledgedAction}
              fields={fields}
              submitLabel="Record it"
              pendingLabel="Recording…"
            >
              <Field id="ack-on" label="On">
                <Input id="ack-on" name="on" type="date" required />
              </Field>
              <Field id="ack-by" label="By">
                <Input id="ack-by" name="by_name" required maxLength={120} autoComplete="off" />
              </Field>
              <Field id="ack-note" label="Note">
                <Input id="ack-note" name="note" maxLength={500} autoComplete="off" />
              </Field>
            </MailForm>
          </Popover>
        )}
      </RecordSection>

      <RecordSection id="close-commentary" title="Commentary">
        {locked ? (
          <p className="hqdata-close__line">{page.close.commentary || "None written."}</p>
        ) : (
          <MailForm
            action={commentaryAction}
            fields={fields}
            submitLabel="Save the commentary"
            pendingLabel="Saving…"
          >
            <Field id="close-commentary-text" label="A few lines on the month, for the MIS">
              <Textarea
                id="close-commentary-text"
                name="commentary"
                rows={4}
                maxLength={4000}
                defaultValue={page.close.commentary}
              />
            </Field>
          </MailForm>
        )}
      </RecordSection>

      <RecordSection id="close-lock" title="Lock">
        {locked ? (
          <MailForm
            action={reopenAction}
            fields={fields}
            submitLabel={`Reopen ${page.label}`}
            pendingLabel="Reopening…"
          >
            <Field
              id="reopen-why"
              label="Why it is reopened"
              hint="10 to 500 characters; it stays in the history."
            >
              <Input
                id="reopen-why"
                name="why"
                required
                minLength={10}
                maxLength={500}
                autoComplete="off"
              />
            </Field>
          </MailForm>
        ) : (
          <>
            <p className="page-note">{LOCK_WORDS}</p>
            {page.can_lock ? (
              <MailForm
                action={lockAction}
                fields={fields}
                submitLabel={`Lock ${page.label}`}
                pendingLabel="Locking…"
                variant="primary"
              />
            ) : (
              <ul
                className="hqdata-close__reasons"
                aria-label={`Why ${page.label} cannot be locked yet`}
              >
                {page.cannot_lock_because.map((reason) => (
                  <li key={reason}>{reason}</li>
                ))}
              </ul>
            )}
          </>
        )}
      </RecordSection>

      <RecordSection id="close-history" title="History">
        {page.close.history.length === 0 ? (
          <p className="page-note">Nothing yet.</p>
        ) : (
          <ul className="hqdata-close__history">
            {page.close.history.map((line) => (
              <li key={`${line.verb}-${line.at}`}>
                {HISTORY_WORDS[line.verb]} {dayWords(line.at.slice(0, 10))} by {line.by.name}
                {line.why ? `: ${line.why}` : ""}
              </li>
            ))}
          </ul>
        )}
      </RecordSection>

      <p>
        <Link className="text-link" href={`/data/numbers/mis/${period}`}>
          Open the month&rsquo;s MIS
        </Link>
      </p>
    </>
  );
}
