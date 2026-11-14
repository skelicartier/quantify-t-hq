import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { MailForm } from "@/components/mail/mail-form";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import type { ClosingPage, Guardrail, KeyDateLink } from "@/lib/data/api/closing";
import { INSTRUMENTS } from "@/lib/data/labels";
import {
  CLOSING_STEPS,
  CLOSING_STEP_ORDER,
  CONFIRM_WITH,
  HOLDER_KINDS,
  KEY_DATES_MISSING,
  KEY_DATE_STATES,
  NOT_LEGAL_ADVICE,
  POOLED_KINDS,
  dayShort,
  dayWords,
  moneyWords,
  stepSlug,
  type ClosingStep,
} from "@/lib/data/labels-close";
import type { DataRead } from "@/lib/data/read";
import type { ActionState } from "@/lib/forms/action-state";
import { formatNumber } from "@/lib/format";

import {
  datesForStep,
  deadlineWords,
  holderWords,
  pooledWords,
  stepDay,
  stepDetail,
} from "./closing-words";
import { StepFields } from "./step-forms";

/**
 * The Closing section on an investor firm's page (ws-notes/company/spec.md §9.7.7), drawn
 * from what was read: the guardrails, the deadlines line, the terms, the checklist with the
 * Key dates each step added, and the two buttons that add dates. Kept apart from
 * `closing-section.tsx` (which reads) so it can be drawn from fixed data. Never a bar, a
 * meter or a percentage.
 */

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type ClosingActions = {
  start: Action;
  terms: Action;
  step: Action;
  clear: Action;
  addDates: Action;
  refundDate: Action;
};

export const OPENS_AT_SOFT = "The closing checklist opens at Soft commit.";

/** One guardrail: its words, the extra line, its Source link and who to confirm it with. */
export function GuardrailCallout({ guardrail }: { guardrail: Guardrail }) {
  return (
    <Callout tone="attention" compact className="hqdata-guardrail">
      <span data-guardrail={guardrail.key}>
        {guardrail.words}
        {guardrail.extra ? ` ${guardrail.extra}` : ""}{" "}
        {guardrail.source_url && (
          <>
            <a
              className="text-link"
              href={guardrail.source_url}
              target="_blank"
              rel="noopener noreferrer"
            >
              Source
            </a>
            <span className="hqdata-print-url"> ({guardrail.source_url})</span>.{" "}
          </>
        )}
        {CONFIRM_WITH(guardrail.confirm_with)}
      </span>
    </Callout>
  );
}

/** The state of a Key date, as a pill linked to it. */
export function KeyDatePill({ link }: { link: KeyDateLink }) {
  const state = KEY_DATE_STATES[link.state] ?? { label: link.state, tone: "neutral" as const };
  return (
    <Link className="hqdata-key-date" href={link.href}>
      <span className="hqdata-key-date__title">
        {link.title} · {dayShort(link.due_on)}
      </span>{" "}
      <StatusPill value={link.state} label={state.label} tone={state.tone} />
    </Link>
  );
}

export function ClosingSectionView({
  investorId,
  read,
  actions,
}: {
  investorId: string;
  read: DataRead<ClosingPage>;
  actions: ClosingActions;
}) {
  if (!read.ok)
    return (
      <RecordSection id="investor-closing" title="Closing">
        <DataUnavailable failure={read} />
      </RecordSection>
    );
  const page = read.data;
  const { closing } = page;
  const fields = { investor_id: investorId };
  return (
    <RecordSection
      id="investor-closing"
      title="Closing"
      actions={
        closing ? (
          <Popover label="Terms" align="end" width="wide">
            <TermsForm page={page} investorId={investorId} action={actions.terms} />
          </Popover>
        ) : undefined
      }
    >
      {page.guardrails.length > 0 && (
        <div className="hqdata-guardrails">
          {page.guardrails.map((guardrail) => (
            <GuardrailCallout key={guardrail.key} guardrail={guardrail} />
          ))}
        </div>
      )}
      {!closing ? (
        page.can_start ? (
          <MailForm
            action={actions.start}
            fields={fields}
            submitLabel="Start the closing checklist"
            pendingLabel="Starting…"
            className="hqdata-inline-action"
          />
        ) : (
          <p className="page-note">{OPENS_AT_SOFT}</p>
        )
      ) : (
        <>
          {page.deadlines.length > 0 && (
            <p className="hqdata-deadlines" data-deadlines="">
              {page.deadlines.map((deadline, index) => (
                <span
                  key={deadline.rule_key}
                  className={deadline.done_on ? "hqdata-deadline--done" : undefined}
                >
                  {index > 0 && " · "}
                  {deadlineWords(deadline)}
                </span>
              ))}
            </p>
          )}
          {!page.key_dates_here && page.deadlines.length > 0 && (
            <p className="page-note">{KEY_DATES_MISSING}</p>
          )}
          <dl className="hqdata-kv hqdata-terms">
            <div className="hqdata-kv__row">
              <dt>Instrument</dt>
              <dd>{closing.instrument}</dd>
            </div>
            <div className="hqdata-kv__row">
              <dt>Class</dt>
              <dd>
                {closing.class_id
                  ? (page.classes?.find((item) => item.class_id === closing.class_id)?.name ??
                    "A class no longer in the register")
                  : "Not chosen"}
              </dd>
            </div>
            <div className="hqdata-kv__row">
              <dt>Shares and price a share</dt>
              <dd>
                {closing.shares === null ? "Not set" : `${formatNumber(closing.shares)} shares`}
                {closing.price_per_share !== null &&
                  ` at ${moneyWords(closing.price_per_share, "INR")}`}
              </dd>
            </div>
            <div className="hqdata-kv__row">
              <dt>Holder</dt>
              <dd>{holderWords(closing.holder)}</dd>
            </div>
            {closing.pooled && (
              <div className="hqdata-kv__row">
                <dt>Backers</dt>
                <dd>
                  {POOLED_KINDS[closing.pooled.kind]} that holds as one ·{" "}
                  {pooledWords(closing.pooled)}
                </dd>
              </div>
            )}
          </dl>
          <Checklist page={page} investorId={investorId} actions={actions} />
          {(page.missing_dates || page.refund_date_due) && (
            <div className="hqdata-actions">
              {page.missing_dates && (
                <MailForm
                  action={actions.addDates}
                  fields={fields}
                  submitLabel="Add the deadlines now"
                  pendingLabel="Adding…"
                  className="hqdata-inline-action"
                />
              )}
              {page.refund_date_due && (
                <MailForm
                  action={actions.refundDate}
                  fields={fields}
                  submitLabel="Add the refund date to Key dates"
                  pendingLabel="Adding…"
                  className="hqdata-inline-action"
                />
              )}
            </div>
          )}
          <p className="page-note">
            {NOT_LEGAL_ADVICE} HQ never files anything; each day is from a rule in Key dates ›
            Rules.
          </p>
        </>
      )}
    </RecordSection>
  );
}

function Checklist({
  page,
  investorId,
  actions,
}: {
  page: ClosingPage;
  investorId: string;
  actions: ClosingActions;
}) {
  const closing = page.closing!;
  const classes = new Map((page.classes ?? []).map((item) => [item.class_id, item.name]));
  const steps = CLOSING_STEP_ORDER.filter(
    (step) =>
      (step !== "bank_kyc" || page.firm.residency === "non_resident" || closing.bank_kyc) &&
      (step !== "refund" || !closing.allotment || closing.refund),
  );
  return (
    <DataTable
      caption="Closing checklist"
      columns={[
        { key: "step", label: "Step", width: "18%" },
        { key: "done", label: "Done" },
        { key: "detail", label: "Detail" },
        { key: "dates", label: "In Key dates" },
        { key: "act", label: "" },
      ]}
      columnMenu={false}
      scroll={false}
    >
      {steps.map((step) => (
        <StepRow
          key={step}
          step={step}
          page={page}
          investorId={investorId}
          actions={actions}
          detail={stepDetail(closing, step, classes)}
        />
      ))}
    </DataTable>
  );
}

function StepRow({
  step,
  page,
  investorId,
  actions,
  detail,
}: {
  step: ClosingStep;
  page: ClosingPage;
  investorId: string;
  actions: ClosingActions;
  detail: string;
}) {
  const closing = page.closing!;
  const day = stepDay(closing, step);
  const dates = datesForStep(investorId, step, page.key_dates);
  const slug = stepSlug(step);
  const waiting =
    (step === "allotment" && !closing.money_received) ||
    ((step === "register" || step === "certificate") && !closing.allotment);
  return (
    <tr data-step={slug}>
      <td>
        <span className="table-title">{CLOSING_STEPS[step]}</span>
      </td>
      <td>{day ? dayWords(day) : <span className="table-sub">Not yet</span>}</td>
      <td>{detail || <span className="table-sub">{day ? "" : "Nothing recorded"}</span>}</td>
      <td>
        {dates.length === 0 ? (
          <span className="table-sub">None</span>
        ) : (
          <span className="hqdata-key-dates">
            {dates.map((link) => (
              <KeyDatePill key={link.date_id} link={link} />
            ))}
          </span>
        )}
      </td>
      <td>
        <span className="hqdata-actions">
          {!waiting && (
            <Popover label={day ? "Change" : "Record it"} align="end" width="wide">
              <MailForm
                action={actions.step}
                fields={{ investor_id: investorId, step: slug }}
                submitLabel={
                  step === "register" && page.members_here
                    ? "Enter it in the register"
                    : "Record it"
                }
                pendingLabel="Recording…"
              >
                <StepFields step={step} page={page} />
              </MailForm>
            </Popover>
          )}
          {day && (
            <RowAction
              action={actions.clear}
              fields={{ investor_id: investorId, step: slug }}
              className="hqdata-inline-action"
              sentLabel="Cleared."
              buttons={[{ label: "Clear it", className: "btn btn--small btn--ghost" }]}
            />
          )}
        </span>
      </td>
    </tr>
  );
}

function TermsForm({
  page,
  investorId,
  action,
}: {
  page: ClosingPage;
  investorId: string;
  action: Action;
}) {
  const closing = page.closing!;
  const backers = (closing.pooled?.backers ?? [])
    .map((backer) => `${backer.name}, ${backer.amount}, ${backer.currency}`)
    .join("\n");
  return (
    <MailForm
      action={action}
      fields={{ investor_id: investorId }}
      submitLabel="Save the terms"
      pendingLabel="Saving…"
      className="stack-form stack-form--tight hqdata-terms-form"
    >
      <Field id="terms-instrument" label="Instrument">
        <Select id="terms-instrument" name="instrument" defaultValue={closing.instrument}>
          {INSTRUMENTS.map((instrument) => (
            <option key={instrument} value={instrument}>
              {instrument}
            </option>
          ))}
        </Select>
      </Field>
      {page.classes && (
        <Field id="terms-class" label="Class">
          <Select id="terms-class" name="class_id" defaultValue={closing.class_id ?? ""}>
            <option value="">Not chosen yet</option>
            {page.classes.map((item) => (
              <option key={item.class_id} value={item.class_id}>
                {item.name}
              </option>
            ))}
          </Select>
        </Field>
      )}
      <div className="hqdata-pilot-form__pair">
        <Field id="terms-shares" label="Shares">
          <Input
            id="terms-shares"
            name="shares"
            inputMode="numeric"
            maxLength={15}
            defaultValue={closing.shares === null ? "" : String(closing.shares)}
          />
        </Field>
        <Field id="terms-price" label="Price a share (₹)">
          <Input
            id="terms-price"
            name="price_per_share"
            inputMode="numeric"
            maxLength={15}
            defaultValue={closing.price_per_share === null ? "" : String(closing.price_per_share)}
          />
        </Field>
      </div>
      <Field id="terms-holder" label="Holder, as it goes in the register">
        <Input
          id="terms-holder"
          name="holder_name"
          maxLength={200}
          required
          defaultValue={closing.holder.name}
        />
      </Field>
      <Field id="terms-holder-kind" label="The holder is">
        <Select id="terms-holder-kind" name="holder_kind" defaultValue={closing.holder.kind}>
          {Object.entries(HOLDER_KINDS).map(([key, label]) => (
            <option key={key} value={key}>
              {label.charAt(0).toUpperCase() + label.slice(1)}
            </option>
          ))}
        </Select>
      </Field>
      <div className="hqdata-pilot-form__pair">
        <Field id="terms-email" label="Holder's email">
          <Input
            id="terms-email"
            name="holder_email"
            type="email"
            maxLength={254}
            defaultValue={closing.holder.email}
          />
        </Field>
        <Field id="terms-address" label="Holder's address">
          <Input
            id="terms-address"
            name="holder_address"
            maxLength={400}
            defaultValue={closing.holder.address}
          />
        </Field>
      </div>
      <Field id="terms-pooled" label="Holds for backers as one">
        <Select id="terms-pooled" name="pooled_kind" defaultValue={closing.pooled?.kind ?? ""}>
          <option value="">No: one holder of its own</option>
          {Object.entries(POOLED_KINDS).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id="terms-backers"
        label="Backers"
        hint="One a line: name, amount, currency. A syndicate or fund is one holder; its backers are listed under it."
      >
        <Textarea
          id="terms-backers"
          name="backers"
          rows={3}
          maxLength={20_000}
          defaultValue={backers}
        />
      </Field>
      <Field id="terms-fee" label="Fee, as typed">
        <Input
          id="terms-fee"
          name="fee_note"
          maxLength={300}
          defaultValue={closing.pooled?.fee_note ?? ""}
        />
      </Field>
    </MailForm>
  );
}
