import type { ReactNode } from "react";

import { MailForm } from "@/components/mail/mail-form";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import type { DutyAreaKey, RuleView, RulesPage } from "@/lib/data/api/dates";
import type { ActionState } from "@/lib/forms/action-state";
import { formatDate, formatNumber } from "@/lib/format";
import { CONFIRM_ROLES, RULE_AREAS, type RuleAreaKey } from "@/lib/data/labels-company";
import {
  DUTY_AMOUNT_MAX,
  DUTY_AREAS,
  DUTY_CONFIRM_ROLES,
  DUTY_UNIT_LABELS,
  NOBODY_CONFIRMS,
  NOT_ADVICE_DUTIES,
  RULE_READINGS_PILL,
  RULE_READINGS_SILENT,
  dutyConfirmWords,
  type DutyUnitKey,
} from "@/lib/data/labels-calendar";

/**
 * The rule book (company spec §6.7.5, "Rules"): every clock Data works a date out with, by
 * area, each with its source links, the day it was checked, his amount and whether his CA
 * or CS confirmed it. Changing an amount drops the confirmation; dates already made keep
 * their day until he moves them.
 *
 * The duty rules (duties spec §7.2) follow in ten tables of their own. A rule the sources
 * disagree on shows "Sources disagree" and each reading with its own sources, works nothing
 * out until he confirms a reading or his own amount, and its confirm form asks which. A rule
 * not yet in force says from when; a rule nobody confirms says so and only takes an amount.
 * Every row's id is `rule-{key}`, the anchor the rule line links to.
 */

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type RuleActions = {
  amount: Action;
  confirm: Action;
  unconfirm: Action;
  move: Action;
};

export const RULES_NOTE =
  "Every date in Data is worked out from one of these rules. Each says where it comes from and when it was checked. Change an amount when your CA or CS tells you to; dates already made keep their day until you move them. A rule marked “Only once confirmed” makes no date until it is confirmed.";

const AREA_ORDER: readonly RuleAreaKey[] = ["company", "meetings", "close", "calendar"];
const DUTY_ORDER = Object.keys(DUTY_AREAS) as DutyAreaKey[];
/** The duty rules that are practice rather than law: the rest nobody confirms are industry rules. */
const PRACTICE = new Set(["close-by"]);

const CAPTIONS: Record<RuleAreaKey, string> = {
  company: "Rules: the company",
  meetings: "Rules: meetings",
  close: "Rules: the round",
  calendar: "Rules: calendar dates",
};

const COLUMNS = [
  { key: "rule", label: "Rule", width: "30%" },
  { key: "clock", label: "Clock" },
  { key: "source", label: "Source" },
  { key: "confirmed", label: "Confirmed" },
  { key: "used", label: "Used by", align: "end" as const },
  { key: "actions", label: "Change", align: "end" as const },
];

const DUTY_COLUMNS = [
  { key: "rule", label: "Rule", width: "30%" },
  { key: "clock", label: "Clock or amount" },
  { key: "source", label: "Source" },
  { key: "checked", label: "Checked" },
  { key: "confirmed", label: "Confirmed" },
  { key: "actions", label: "Change", align: "end" as const },
];

const UNIT_LABEL: Record<string, string> = {
  days: "Days",
  months: "Months",
  years: "Years",
  people: "People",
};

const UNIT_MAX: Record<string, number> = { days: 3_650, months: 120, years: 10, people: 1_000 };

/** A duty rule that takes his own amount: a unit, and not plain words without readings. */
const takesAmount = (rule: RuleView): boolean =>
  rule.duty
    ? rule.unit !== null && (rule.sense !== "words" || (rule.readings ?? []).length > 0)
    : rule.amount !== null && rule.unit !== null;

const unitLabel = (rule: RuleView): string =>
  rule.duty && rule.unit
    ? DUTY_UNIT_LABELS[rule.unit as DutyUnitKey]
    : (UNIT_LABEL[rule.unit ?? ""] ?? "Amount");

const unitMax = (rule: RuleView): number =>
  rule.duty && rule.unit
    ? DUTY_AMOUNT_MAX[rule.unit as DutyUnitKey]
    : (UNIT_MAX[rule.unit ?? ""] ?? 1_000);

/** "Source" links, new tab, the URL written after each on paper (a citation, never on screen). */
export function SourceLinks({
  sources,
  checked,
}: {
  sources: readonly { name: string; url: string }[];
  checked: string | null;
}) {
  return (
    <span className="hqdata-sources">
      {sources.map((source, index) => (
        <span key={source.url}>
          {index > 0 && " · "}
          <a
            className="text-link hqdata-source"
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={source.name}
          >
            Source
          </a>
          <span className="hqdata-source-url"> ({source.url})</span>
        </span>
      ))}
      {checked && <span className="table-sub">checked {formatDate(checked)}</span>}
    </span>
  );
}

/** "Confirmed by Walk CS, CS, 14 Nov 2026" (live) or "Confirm with your CS" (attention). */
export function ConfirmPill({
  confirmed,
  confirmWith,
}: {
  confirmed: { name: string; role: string; on: string } | null;
  confirmWith: string | null;
}): ReactNode {
  if (confirmed)
    return (
      <StatusPill
        value="confirmed"
        label={`Confirmed by ${confirmed.name}, ${DUTY_CONFIRM_ROLES[confirmed.role as keyof typeof DUTY_CONFIRM_ROLES] ?? confirmed.role}, ${formatDate(confirmed.on)}`}
        tone="live"
      />
    );
  if (!confirmWith) return null;
  return <StatusPill value="confirm" label={dutyConfirmWords(confirmWith)} tone="attention" />;
}

/** Each reading of a rule the sources disagree on: its label, its sentence, its sources. */
function Readings({ rule }: { rule: RuleView }) {
  const readings = rule.readings ?? [];
  if (readings.length === 0) return null;
  return (
    <span className="hqdata-rules__readings">
      {!rule.confirmed && <span className="table-sub">{RULE_READINGS_SILENT}</span>}
      {readings.map((reading, index) => (
        <span
          key={reading.label}
          className={`table-sub table-sub--prose hqdata-rules__reading${rule.confirmed && rule.reading === index ? " hqdata-rules__reading--chosen" : ""}`}
        >
          <strong>{reading.label}</strong>
          {rule.confirmed && rule.reading === index ? " (confirmed)" : ""}: {reading.words}{" "}
          {reading.sources.length > 0 && <SourceLinks sources={reading.sources} checked={null} />}
        </span>
      ))}
    </span>
  );
}

/** The confirm form: for a rule with readings, which reading (or his own amount) was confirmed. */
function ConfirmFields({ rule, today }: { rule: RuleView; today: string }) {
  const readings = rule.readings ?? [];
  const roles = rule.duty ? DUTY_CONFIRM_ROLES : CONFIRM_ROLES;
  const chosen = rule.reading ?? 0;
  return (
    <>
      {readings.length > 0 && (
        <fieldset className="checkbox-group hqdata-rules__choose">
          <legend className="field__label">Which was confirmed</legend>
          {readings.map((reading, index) => (
            <label key={reading.label} className="checkbox hqdata-rules__radio">
              <input
                type="radio"
                name="reading"
                value={String(index)}
                defaultChecked={!rule.changed && index === chosen}
              />
              <span className="checkbox__label">{reading.label}</span>
            </label>
          ))}
          {takesAmount(rule) && (
            <label className="checkbox hqdata-rules__radio">
              <input type="radio" name="reading" value="own" defaultChecked={rule.changed} />
              <span className="checkbox__label">My own amount</span>
            </label>
          )}
        </fieldset>
      )}
      {readings.length > 0 && takesAmount(rule) && (
        <Field
          id={`rule-own-${rule.key}`}
          label={`My own amount (${unitLabel(rule).toLowerCase()})`}
        >
          <Input
            id={`rule-own-${rule.key}`}
            name="own_amount"
            type="number"
            min={1}
            max={unitMax(rule)}
            step={1}
            defaultValue={rule.amount ?? undefined}
          />
        </Field>
      )}
      <Field id={`rule-who-${rule.key}`} label="Who confirmed it">
        <Input id={`rule-who-${rule.key}`} name="name" required maxLength={120} />
      </Field>
      <Field id={`rule-role-${rule.key}`} label="Their role">
        <Select id={`rule-role-${rule.key}`} name="role" defaultValue={rule.confirm_with ?? "CA"}>
          {Object.entries(roles).map(([key, label]) => (
            <option key={key} value={key}>
              {label}
            </option>
          ))}
        </Select>
      </Field>
      <Field id={`rule-on-${rule.key}`} label="On">
        <Input
          id={`rule-on-${rule.key}`}
          name="on"
          type="date"
          max={today}
          defaultValue={today}
          required
        />
      </Field>
    </>
  );
}

function RuleRow({
  rule,
  today,
  actions,
}: {
  rule: RuleView;
  today: string;
  actions: RuleActions;
}) {
  const fields = { key: rule.key };
  const duty = rule.duty === true && rule.area !== "calendar";
  const disputed = (rule.readings ?? []).length > 0;
  const ahead = rule.starts_on && rule.starts_on > today ? rule.starts_on : null;
  const hint =
    rule.default_amount === null
      ? "Your amount counts once it is confirmed. Your adviser's confirmation is dropped when you change it."
      : `The rule's own is ${formatNumber(rule.default_amount)}. Your adviser's confirmation is dropped when you change it.`;
  return (
    <tr id={`rule-${rule.key}`}>
      <td>
        <span className="table-title">{rule.title}</span>
        {rule.area !== "calendar" && <span className="table-sub">from {rule.from}</span>}
        {rule.area === "calendar" && <span className="table-sub">Applies when: {rule.from}</span>}
        {ahead && <span className="table-sub">In force from {formatDate(ahead)}.</span>}
        {rule.note && (
          <span className="table-sub table-sub--prose" title={rule.note}>
            {rule.note}
          </span>
        )}
        {rule.late_words && (
          <span className="table-sub table-sub--prose" title={rule.late_words}>
            {rule.late_words}
          </span>
        )}
        <Readings rule={rule} />
      </td>
      <td>
        {rule.clock}
        {rule.changed && rule.default_amount !== null && (
          <span className="table-sub">Changed from {formatNumber(rule.default_amount)}</span>
        )}
        {rule.changed && rule.default_amount === null && (
          <span className="table-sub">
            {rule.confirmed
              ? "Changed: your own amount"
              : "Changed: your own amount, counted once confirmed"}
          </span>
        )}
      </td>
      <td>
        <SourceLinks sources={rule.sources} checked={duty ? null : rule.verified_on} />
      </td>
      {duty && <td>{formatDate(rule.verified_on)}</td>}
      <td>
        <div className="hqdata-rules__pills">
          <ConfirmPill confirmed={rule.confirmed} confirmWith={rule.confirm_with} />
          {disputed && !rule.confirmed && (
            <StatusPill value="sources_disagree" label={RULE_READINGS_PILL} tone="attention" />
          )}
          {!duty && rule.only_when_confirmed && !rule.confirmed && (
            <StatusPill value="only_when_confirmed" label="Only once confirmed" tone="attention" />
          )}
          {rule.confirm_with === null && (
            <StatusPill
              value="nobody_confirms"
              label={PRACTICE.has(rule.key) ? NOBODY_CONFIRMS.practice : NOBODY_CONFIRMS.industry}
              tone="neutral"
            />
          )}
        </div>
        {rule.confirmation_dropped && (
          <span className="table-sub">The confirmation was dropped when the amount changed.</span>
        )}
      </td>
      {!duty && (
        <td className="data-table__num">
          {formatNumber(rule.used_by)} {rule.used_by === 1 ? "date" : "dates"}
        </td>
      )}
      <td>
        <div className="hqdata-dates__acts">
          {takesAmount(rule) && rule.unit && (
            <Popover label="Change the amount" align="end">
              <MailForm
                action={actions.amount}
                fields={fields}
                submitLabel="Save"
                pendingLabel="Saving…"
              >
                <Field id={`rule-amount-${rule.key}`} label={unitLabel(rule)} hint={hint}>
                  <Input
                    id={`rule-amount-${rule.key}`}
                    name="amount"
                    type="number"
                    min={1}
                    max={unitMax(rule)}
                    step={1}
                    required
                    defaultValue={rule.amount ?? undefined}
                  />
                </Field>
              </MailForm>
            </Popover>
          )}
          {rule.confirm_with !== null && (
            <Popover label="Record a confirmation" align="end">
              <MailForm
                action={actions.confirm}
                fields={fields}
                submitLabel="Record it"
                pendingLabel="Recording…"
              >
                <ConfirmFields rule={rule} today={today} />
              </MailForm>
            </Popover>
          )}
          {rule.confirmed && (
            <RowAction
              action={actions.unconfirm}
              fields={fields}
              buttons={[
                {
                  label: "Remove the confirmation",
                  className: "btn btn--small btn--ghost",
                  ariaLabel: `Remove the confirmation: ${rule.title}`,
                  pendingLabel: "Removing…",
                },
              ]}
            />
          )}
          {rule.changed && rule.movable > 0 && (
            <RowAction
              action={actions.move}
              fields={fields}
              buttons={[
                {
                  label: `Move ${formatNumber(rule.movable)} ${rule.movable === 1 ? "date" : "dates"} to this amount`,
                  className: "btn btn--small",
                  pendingLabel: "Moving…",
                },
              ]}
            />
          )}
        </div>
      </td>
    </tr>
  );
}

export function RulesView({
  rules,
  counts,
  today,
  actions,
}: {
  rules: readonly RuleView[];
  counts?: RulesPage["counts"];
  today: string;
  actions: RuleActions;
}) {
  return (
    <div className="hqdata-rules">
      <p className="page-note">{RULES_NOTE}</p>
      <p className="page-note">{NOT_ADVICE_DUTIES}</p>
      {counts && (
        <p className="quiet hqdata-rules__count">
          {formatNumber(counts.confirmed)} of {formatNumber(counts.confirmable)} rules confirmed
        </p>
      )}
      {AREA_ORDER.map((area) => {
        const rows = rules.filter((rule) => rule.area === area);
        if (rows.length === 0) return null;
        return (
          <section key={area} className="hqdata-dates__month" aria-labelledby={`rules-${area}`}>
            <h3 className="hqdata-dates__heading" id={`rules-${area}`}>
              {RULE_AREAS[area]}
            </h3>
            <DataTable caption={CAPTIONS[area]} columns={COLUMNS} columnMenu={false} scroll={false}>
              {rows.map((rule) => (
                <RuleRow key={rule.key} rule={rule} today={today} actions={actions} />
              ))}
            </DataTable>
          </section>
        );
      })}
      {DUTY_ORDER.map((area) => {
        const rows = rules.filter((rule) => rule.area === area);
        if (rows.length === 0) return null;
        return (
          <section key={area} className="hqdata-dates__month" aria-labelledby={`rules-${area}`}>
            <h3 className="hqdata-dates__heading" id={`rules-${area}`}>
              {DUTY_AREAS[area]}
            </h3>
            <DataTable
              caption={DUTY_AREAS[area]}
              columns={DUTY_COLUMNS}
              columnMenu={false}
              scroll={false}
            >
              {rows.map((rule) => (
                <RuleRow key={rule.key} rule={rule} today={today} actions={actions} />
              ))}
            </DataTable>
          </section>
        );
      })}
    </div>
  );
}
