import type { ReactNode } from "react";

import { MailForm } from "@/components/mail/mail-form";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import type { RuleView } from "@/lib/data/api/dates";
import type { ActionState } from "@/lib/forms/action-state";
import { formatDate, formatNumber } from "@/lib/format";
import {
  CONFIRM_ROLES,
  RULE_AREAS,
  confirmWords,
  type RuleAreaKey,
} from "@/lib/data/labels-company";

/**
 * The rule book (company spec §6.7.5, "Rules"): every clock Data works a date out with, by
 * area, each with its source links, the day it was checked, his amount and whether his CA
 * or CS confirmed it. Changing an amount drops the confirmation; dates already made keep
 * their day until he moves them.
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

const UNIT_LABEL: Record<string, string> = {
  days: "Days",
  months: "Months",
  years: "Years",
  people: "People",
};

const UNIT_MAX: Record<string, number> = { days: 3_650, months: 120, years: 10, people: 1_000 };

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
        label={`Confirmed by ${confirmed.name}, ${CONFIRM_ROLES[confirmed.role as keyof typeof CONFIRM_ROLES] ?? confirmed.role}, ${formatDate(confirmed.on)}`}
        tone="live"
      />
    );
  if (!confirmWith) return null;
  return <StatusPill value="confirm" label={confirmWords(confirmWith)} tone="attention" />;
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
  return (
    <tr id={`rule-${rule.key}`}>
      <td>
        <span className="table-title">{rule.title}</span>
        {rule.area !== "calendar" && <span className="table-sub">from {rule.from}</span>}
        {rule.area === "calendar" && <span className="table-sub">Applies when: {rule.from}</span>}
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
      </td>
      <td>
        {rule.clock}
        {rule.changed && rule.default_amount !== null && (
          <span className="table-sub">Changed from {formatNumber(rule.default_amount)}</span>
        )}
      </td>
      <td>
        <SourceLinks sources={rule.sources} checked={rule.verified_on} />
      </td>
      <td>
        <div className="hqdata-rules__pills">
          <ConfirmPill confirmed={rule.confirmed} confirmWith={rule.confirm_with} />
          {rule.only_when_confirmed && !rule.confirmed && (
            <StatusPill value="only_when_confirmed" label="Only once confirmed" tone="attention" />
          )}
        </div>
        {rule.confirmation_dropped && (
          <span className="table-sub">The confirmation was dropped when the amount changed.</span>
        )}
      </td>
      <td className="data-table__num">
        {formatNumber(rule.used_by)} {rule.used_by === 1 ? "date" : "dates"}
      </td>
      <td>
        <div className="hqdata-dates__acts">
          {rule.amount !== null && rule.unit && (
            <Popover label="Change the amount" align="end">
              <MailForm
                action={actions.amount}
                fields={fields}
                submitLabel="Save"
                pendingLabel="Saving…"
              >
                <Field
                  id={`rule-amount-${rule.key}`}
                  label={UNIT_LABEL[rule.unit] ?? "Amount"}
                  hint={`The rule's own is ${formatNumber(rule.default_amount)}. Your CA's or CS's confirmation is dropped when you change it.`}
                >
                  <Input
                    id={`rule-amount-${rule.key}`}
                    name="amount"
                    type="number"
                    min={1}
                    max={UNIT_MAX[rule.unit]}
                    step={1}
                    required
                    defaultValue={rule.amount}
                  />
                </Field>
              </MailForm>
            </Popover>
          )}
          <Popover label="Record a confirmation" align="end">
            <MailForm
              action={actions.confirm}
              fields={fields}
              submitLabel="Record it"
              pendingLabel="Recording…"
            >
              <Field id={`rule-who-${rule.key}`} label="Who confirmed it">
                <Input id={`rule-who-${rule.key}`} name="name" required maxLength={120} />
              </Field>
              <Field id={`rule-role-${rule.key}`} label="Their role">
                <Select id={`rule-role-${rule.key}`} name="role" defaultValue={rule.confirm_with}>
                  {Object.entries(CONFIRM_ROLES).map(([key, label]) => (
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
            </MailForm>
          </Popover>
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
  today,
  actions,
}: {
  rules: readonly RuleView[];
  today: string;
  actions: RuleActions;
}) {
  return (
    <div className="hqdata-rules">
      <p className="page-note">{RULES_NOTE}</p>
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
    </div>
  );
}
