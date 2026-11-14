import Link from "next/link";
import { notFound } from "next/navigation";

import { DataUnavailable } from "@/components/data/data-down";
import { CopyTextButton } from "@/components/data/numbers/copy-text-button";
import { ReminderForm } from "@/components/data/numbers/reminder-form";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Textarea } from "@/components/ui/field";
import { RecordSection } from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readDates } from "@/lib/data/api/dates";
import {
  readNumbers,
  readRecipients,
  readUpdate,
  type UpdatePage,
  type UpdateRecipients,
} from "@/lib/data/api/numbers";
import {
  INVESTOR_STAGES,
  INVESTOR_STAGE_ORDER,
  UPDATE_DEFAULT_STAGES,
  UPDATE_STATUSES,
  labelOf,
  toneOf,
  type InvestorStage,
} from "@/lib/data/labels";
import { staffOf } from "@/lib/data/gate";
import { dataRead, isDataError } from "@/lib/data/read";
import { formatDate, formatMoney, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

import {
  addUpdateDateAction,
  freezeUpdateAction,
  handOverAction,
  saveUpdateAction,
  unfreezeUpdateAction,
} from "../../actions";
import "../../numbers.css";

export const metadata = { title: "Investor update" };
export const dynamic = "force-dynamic";

const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;
/** Who an update can go to: any forward stage, or Set aside. */
const CHOOSABLE: readonly InvestorStage[] = INVESTOR_STAGE_ORDER.filter(
  (stage) => !["not_written", "passed", "do_not_pitch"].includes(stage),
);
const RECIPIENT_COLUMNS = [
  { key: "tick", label: "Write to" },
  { key: "person", label: "Person", width: "30%" },
  { key: "firm", label: "Firm" },
  { key: "stage", label: "Stage" },
  { key: "stop", label: "Stop list" },
];
const NUMBER_COLUMNS = [
  { key: "what", label: "What", width: "60%" },
  { key: "value", label: "In the email", align: "end" as const },
];

type Params = Record<string, string | string[] | undefined>;

/** The stages asked for in the address (`?stages=soft,signed`), else the four defaults. */
function stagesFrom(params: Params): InvestorStage[] {
  const given = params.stages;
  if (given === undefined) return [...UPDATE_DEFAULT_STAGES];
  const values = (Array.isArray(given) ? given : given.split(","))
    .flatMap((value) => value.split(","))
    .map((value) => value.trim());
  return CHOOSABLE.filter((stage) => values.includes(stage));
}

async function reminderWanted(): Promise<boolean> {
  try {
    const [numbers, dates] = await Promise.all([readNumbers(), readDates("all")]);
    const id = numbers.update_date_id;
    return id === null || !dates.dates.some((date) => date.date_id === id);
  } catch (error) {
    if (isDataError(error)) return false;
    throw error;
  }
}

export default async function UpdateRoute({
  params,
  searchParams,
}: {
  params: Promise<{ period: string }>;
  searchParams: Promise<Params>;
}) {
  const { period } = await params;
  const query = await searchParams;
  const { allowed, context } = await requireData(`/data/numbers/updates/${period}`);
  if (!PERIOD.test(period)) notFound();
  const now = requestNow();
  const stages = stagesFrom(query);
  const read = allowed
    ? await dataRead(async () => {
        const page = await readUpdate(period);
        const recipients =
          page.update.status === "draft" ? null : await readRecipients(period, stages);
        return { page, recipients, reminder: await reminderWanted() };
      })
    : null;
  const data = read?.ok ? read.data : null;
  const label = data?.page.numbers.label ?? "";
  return (
    <>
      <PageHeader
        title={label ? `Investor update · ${label}` : "Investor update"}
        meta={
          data ? (
            <StatusPill
              value={data.page.update.status}
              label={labelOf(UPDATE_STATUSES, data.page.update.status)}
              tone={toneOf(UPDATE_STATUSES, data.page.update.status)}
            />
          ) : undefined
        }
        actions={data ? <UpdateActions page={data.page} /> : undefined}
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Update
            page={read.data.page}
            recipients={read.data.recipients}
            stages={stages}
            reminder={read.data.reminder}
            signOff={staffOf(context).name}
            now={now}
          />
        )}
      </div>
    </>
  );
}

function UpdateActions({ page }: { page: UpdatePage }) {
  const { update } = page;
  const fields = { period: update.period };
  return (
    <>
      <CopyTextButton text={page.text} />
      {update.status === "draft" && (
        <MailForm
          action={freezeUpdateAction}
          fields={fields}
          submitLabel="Freeze the numbers"
          pendingLabel="Freezing…"
          variant="primary"
          className="inline-form"
        />
      )}
      {update.status === "frozen" && (
        <MailForm
          action={unfreezeUpdateAction}
          fields={fields}
          submitLabel="Use today's numbers"
          pendingLabel="Counting…"
          className="inline-form"
        />
      )}
      {update.status === "handed_over" && update.handed_over && (
        <Link className={buttonClass({ size: "small" })} href="/mail/merge">
          {update.handed_over.list_name} in Mail merge
        </Link>
      )}
    </>
  );
}

function Update({
  page,
  recipients,
  stages,
  reminder,
  signOff,
  now,
}: {
  page: UpdatePage;
  recipients: UpdateRecipients | null;
  stages: readonly InvestorStage[];
  reminder: boolean;
  signOff: string;
  now: number;
}) {
  const { update, numbers, text } = page;
  const kept = update.status === "handed_over";
  return (
    <div className="hqdata-update">
      {kept && update.handed_over && (
        <Callout tone="neutral" compact>
          Handed to Mail merge as “{update.handed_over.list_name}” with{" "}
          {formatNumber(update.handed_over.people)}{" "}
          {update.handed_over.people === 1 ? "person" : "people"},{" "}
          <Timestamp value={update.handed_over.at} now={now} mode="relative" />. It is kept as it
          was; open Mail merge to send it yourself.
        </Callout>
      )}
      <RecordSection id="update-draft" title="The draft">
        <MailForm
          action={saveUpdateAction}
          fields={{ period: update.period }}
          submitLabel="Save the draft"
          pendingLabel="Saving…"
          disabled={kept}
        >
          <Field id="update-asks" label="Asks" hint="One per line, at most three. They go first.">
            <Textarea
              id="update-asks"
              name="asks"
              rows={3}
              maxLength={2_000}
              defaultValue={update.asks}
              readOnly={kept}
            />
          </Field>
          <Field id="update-opening" label="A line on the month">
            <Textarea
              id="update-opening"
              name="opening"
              rows={2}
              maxLength={400}
              defaultValue={update.opening}
              readOnly={kept}
            />
          </Field>
          <Field id="update-highlights" label="Highlights" hint="One per line, at most three.">
            <Textarea
              id="update-highlights"
              name="highlights"
              rows={3}
              maxLength={2_000}
              defaultValue={update.highlights}
              readOnly={kept}
            />
          </Field>
          <Field
            id="update-lowlights"
            label="Lowlights"
            hint="One per line, at most three. An update without them is not believed."
          >
            <Textarea
              id="update-lowlights"
              name="lowlights"
              rows={3}
              maxLength={2_000}
              defaultValue={update.lowlights}
              readOnly={kept}
            />
          </Field>
          <Field id="update-thanks" label="Thanks">
            <Textarea
              id="update-thanks"
              name="thanks"
              rows={2}
              maxLength={1_000}
              defaultValue={update.thanks}
              readOnly={kept}
            />
          </Field>
          <Field id="update-sign-off" label="Sign-off">
            <Input
              id="update-sign-off"
              name="sign_off"
              maxLength={120}
              defaultValue={update.sign_off || signOff}
              readOnly={kept}
              autoComplete="off"
            />
          </Field>
        </MailForm>
      </RecordSection>

      <RecordSection id="update-numbers" title="The numbers in it">
        <p className="hqdata-numbers__line">
          {update.snapshot && update.snapshot_at ? (
            <>
              Frozen <Timestamp value={update.snapshot_at} now={now} mode="absolute" />
            </>
          ) : (
            "Live: counted now"
          )}
        </p>
        <DataTable caption="The numbers in it" columns={NUMBER_COLUMNS} columnMenu={false}>
          {[
            ["People who said yes", formatNumber(numbers.yeses)],
            ["Firms that joined the waitlist", formatNumber(numbers.firms_joined)],
            ["Of them, named buyer firms", formatNumber(numbers.named_buyers)],
            ["Calls booked", formatNumber(numbers.calls_booked)],
            ["Calls held", formatNumber(numbers.calls_held)],
            ["Pilots signed (now)", formatNumber(numbers.pilots_signed)],
            ["Calls held without a pilot (now)", formatNumber(numbers.calls_held_no_pilot)],
            ...(numbers.raise
              ? [
                  ["Soft commits (now)", formatNumber(numbers.raise.soft)],
                  ["Signed (now)", formatNumber(numbers.raise.signed)],
                  ["Money in (now)", formatNumber(numbers.raise.money_in)],
                  ...Object.entries(numbers.raise.money_in_amounts)
                    .sort(([a], [b]) => a.localeCompare(b))
                    .map(([currency, amount]) => [
                      `Money in the bank, ${currency}`,
                      formatMoney(amount, currency),
                    ]),
                ]
              : []),
            ...numbers.cash.map((row) => [
              `Cash, ${row.currency}, on ${formatDate(row.as_of)}`,
              `${formatMoney(row.cash, row.currency)} · burn ${formatMoney(row.burn_per_month, row.currency)} · ${(Math.round(row.runway_months * 10) / 10).toFixed(1)} months`,
            ]),
          ].map(([what, value]) => (
            <tr key={what}>
              <th scope="row" className="hqdata-numbers__row">
                {what}
              </th>
              <td className="data-table__num">{value}</td>
            </tr>
          ))}
        </DataTable>
        <p className="page-note">
          The counts are {numbers.label}&rsquo;s, to {formatDate(numbers.counted_on)} for this
          month; pilots and the round are as they stand now. Without the investor list here the
          round is left out.
        </p>
      </RecordSection>

      <RecordSection id="update-text" title="The email">
        <pre className="hqdata-update__text">{text}</pre>
        <p className="page-note">
          Missing parts are in [brackets]; Mail merge will not send them until you fill or remove
          them.
        </p>
      </RecordSection>

      {update.status !== "draft" && (
        <RecordSection id="update-recipients" title="Who it goes to">
          <Recipients page={page} recipients={recipients} stages={stages} />
        </RecordSection>
      )}

      <ReminderForm action={addUpdateDateAction} wanted={reminder} />
    </div>
  );
}

function Recipients({
  page,
  recipients,
  stages,
}: {
  page: UpdatePage;
  recipients: UpdateRecipients | null;
  stages: readonly InvestorStage[];
}) {
  const { update } = page;
  if (!recipients || !recipients.here)
    return <p className="page-note">The investor list is not set up here yet.</p>;
  const everyone = recipients.firms.flatMap((firm) =>
    firm.people.map((person) => ({ ...person, firm })),
  );
  const writable = everyone.filter((person) => !person.stopped);
  return (
    <>
      <form className="hqdata-update__stages" method="get">
        <fieldset>
          <legend>Firms at these stages</legend>
          <div className="hqdata-update__stage-list">
            {CHOOSABLE.map((stage) => (
              <label key={stage} className="hqdata-update__stage">
                <input
                  type="checkbox"
                  name="stages"
                  value={stage}
                  defaultChecked={stages.includes(stage)}
                />{" "}
                {INVESTOR_STAGES[stage].label}
              </label>
            ))}
          </div>
        </fieldset>
        <button type="submit" className={buttonClass({ size: "small" })}>
          Show who
        </button>
      </form>
      <MailForm
        action={handOverAction}
        fields={{
          period: update.period,
          stages: stages.join(","),
          people: writable.map((person) => person.email).join(","),
        }}
        submitLabel="Make the Mail merge list"
        pendingLabel="Making…"
        variant="primary"
      >
        <DataTable
          caption="Recipients"
          columns={RECIPIENT_COLUMNS}
          columnMenu={false}
          isEmpty={everyone.length === 0}
          empty={<p className="page-note">No firm is at these stages.</p>}
        >
          {everyone.map((person, index) => (
            <tr
              key={person.email}
              className={person.stopped ? "hqdata-update__stopped" : undefined}
            >
              <td>
                <input
                  type="checkbox"
                  id={`recipient-${index}`}
                  name="person"
                  value={person.email}
                  defaultChecked={!person.stopped}
                  disabled={person.stopped}
                  aria-label={`Write to ${person.name || person.email}`}
                />
              </td>
              <td>
                <span className="table-title">{person.name || person.email}</span>
                <span className="table-sub mono">{person.email}</span>
              </td>
              <td>
                <Link className="text-link" href={`/data/investors/${person.firm.investor_id}`}>
                  {person.firm.firm}
                </Link>
              </td>
              <td>{labelOf(INVESTOR_STAGES, person.firm.stage)}</td>
              <td>{person.stopped ? <span className="quiet">On the stop list</span> : "No"}</td>
            </tr>
          ))}
        </DataTable>
        <p className="page-note">
          {formatNumber(recipients.people)} {recipients.people === 1 ? "person" : "people"} to write
          to
          {recipients.left_out.length > 0
            ? `; ${formatNumber(recipients.left_out.length)} on the stop list left out`
            : ""}
          . The list is made in Mail merge; nothing is sent from here.
        </p>
      </MailForm>
      {update.handed_over && update.handed_over.left_out.length > 0 && (
        <p className="page-note">
          Left out of “{update.handed_over.list_name}”:{" "}
          {update.handed_over.left_out.map((item) => `${item.email} (${item.why})`).join(", ")}.
        </p>
      )}
    </>
  );
}
