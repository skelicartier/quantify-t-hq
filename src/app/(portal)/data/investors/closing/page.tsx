import Link from "next/link";
import type { ReactNode } from "react";

import { DueChip } from "@/components/crm/pills";
import { DataUnavailable } from "@/components/data/data-down";
import { KeyDatePill } from "@/components/data/closing/closing-section-view";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Checkbox, Field, Input, Select, Textarea } from "@/components/ui/field";
import { DataTable } from "@/components/ui/data-table";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readClosings, type ClosingRow, type ClosingsPage } from "@/lib/data/api/closing";
import { INVESTOR_VIEWS, NOT_KNOWN, RESIDENCY } from "@/lib/data/labels";
import {
  CLOSING_VIEW,
  KEY_DATES_MISSING,
  OFFERS_LINE,
  ROUND_STEPS,
  VALUATION_KINDS,
  dayShort,
  dayWords,
  moneyWords,
  type RoundStep,
} from "@/lib/data/labels-close";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";

import "@/components/data/closing/closing.css";
import "../investors.css";
import { roundStepAction } from "./actions";

export const metadata = { title: "Closing" };
export const dynamic = "force-dynamic";

const ABOUT =
  "From a yes to shares in the register: each investor's documents, money, valuation, allotment and filings, and the round's own steps. The filings' days are added to Key dates, each from a rule your CS can confirm. This is a record to keep, not legal advice.";
const EMPTY =
  "No closing started yet. A firm's closing checklist starts from its page once it reaches Soft commit.";

const COLUMNS = [
  { key: "firm", label: "Firm", width: "18%" },
  { key: "residency", label: "Residency" },
  { key: "instrument", label: "Instrument" },
  { key: "money", label: "Money received" },
  { key: "allotted", label: "Allotted" },
  { key: "next", label: "Next" },
  { key: "warnings", label: "Warnings" },
];

export default async function ClosingViewPage() {
  const { allowed } = await requireData(CLOSING_VIEW.href);
  const read = allowed ? await dataRead(readClosings) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Closing"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">
              {formatNumber(data.closings.length)}{" "}
              {data.closings.length === 1 ? "closing" : "closings"}
            </span>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-investors hqdata-closing">
            <SegmentedLinks
              label="View"
              items={[
                ...(Object.keys(INVESTOR_VIEWS) as (keyof typeof INVESTOR_VIEWS)[]).map((key) => ({
                  href: key === "firms" ? "/data/investors" : `/data/investors?view=${key}`,
                  label: INVESTOR_VIEWS[key],
                  current: false,
                })),
                { href: CLOSING_VIEW.href, label: CLOSING_VIEW.label, current: true },
              ]}
            />
            <p className="page-note hqdata-closing__advice">
              This is a record to keep, not legal advice. HQ never files anything.
            </p>
            <RoundSteps page={read.data} />
            <Offers page={read.data} />
            <RecordSection id="closing-closings" title="Closings">
              <DataTable
                caption="Closings"
                columns={COLUMNS}
                isEmpty={read.data.closings.length === 0}
                empty={<p className="page-note">{EMPTY}</p>}
              >
                {read.data.closings.map((row) => (
                  <ClosingLine key={row.closing_id} row={row} today={read.data.today} />
                ))}
              </DataTable>
            </RecordSection>
          </div>
        )}
      </div>
    </>
  );
}

function Offers({ page }: { page: ClosingsPage }) {
  const { offers } = page;
  return (
    <p className="hqdata-offers" data-offers="">
      {OFFERS_LINE(offers.count, offers.fy, offers.limit)}{" "}
      {offers.source_url && (
        <>
          <a
            className="text-link"
            href={offers.source_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Source
          </a>
          <span className="hqdata-print-url"> ({offers.source_url})</span>
        </>
      )}
      {offers.by_class.length > 0 && (
        <span className="hqdata-offers__classes">
          {offers.by_class
            .map((item) => `${item.class_name}: ${formatNumber(item.count)} offered`)
            .join(" · ")}
        </span>
      )}
    </p>
  );
}

function ClosingLine({ row, today }: { row: ClosingRow; today: string }) {
  const href = `/data/investors/${row.investor_id}#investor-closing`;
  const money = row.money_received;
  const allotBy = row.deadlines.find((deadline) => deadline.rule_key === "allotment");
  return (
    <tr>
      <td>
        <Link className="table-title" href={href}>
          {row.firm}
        </Link>
      </td>
      <td>{row.residency ? RESIDENCY[row.residency] : NOT_KNOWN}</td>
      <td>{row.instrument}</td>
      <td>
        {money ? (
          `${moneyWords(money.amount, money.currency)} on ${dayShort(money.on)}`
        ) : (
          <span className="table-sub">Not yet</span>
        )}
      </td>
      <td>
        {row.allotment ? (
          `${formatNumber(row.allotment.shares)} shares on ${dayShort(row.allotment.on)}`
        ) : row.refund ? (
          `Refunded ${dayShort(row.refund.on)}`
        ) : allotBy ? (
          `Allot by ${dayShort(allotBy.on)}`
        ) : (
          <span className="table-sub">Not yet</span>
        )}
      </td>
      <td>
        {row.next ? (
          <span className="hqdata-next">
            {row.next.title} {dayShort(row.next.on)} <DueChip due={row.next.on} today={today} />
          </span>
        ) : (
          <span className="table-sub">Nothing owed</span>
        )}
      </td>
      <td>
        {row.warnings > 0 ? (
          <Link className="hqdata-attention" href={href}>
            {formatNumber(row.warnings)}
          </Link>
        ) : (
          <span className="table-sub">None</span>
        )}
      </td>
    </tr>
  );
}

function RoundSteps({ page }: { page: ClosingsPage }) {
  const { round, round_dates: dates } = page;
  const rows: { step: RoundStep; done: string | null; detail: ReactNode }[] = [
    {
      step: "special_resolution",
      done: round.special_resolution?.on ?? null,
      detail: round.special_resolution ? (
        <>
          {round.special_resolution.words}
          {round.special_resolution.resolution_id
            ? " · from Meetings, whose MGT-14 date covers it"
            : dates.mgt_14
              ? ` · MGT-14 by ${dayWords(dates.mgt_14)}`
              : ""}
          {(page.round_key_dates ?? []).map((link) => (
            <KeyDatePill key={link.date_id} link={link} />
          ))}
        </>
      ) : null,
    },
    {
      step: "separate_account",
      done: round.separate_account?.opened_on ?? null,
      detail: round.separate_account?.bank ?? null,
    },
    {
      step: "valuation",
      done: round.valuation?.on ?? null,
      detail: round.valuation
        ? `${round.valuation.by_name} · ${VALUATION_KINDS[round.valuation.kind]}${
            dates.valuation_valid_until
              ? ` · Valid for allotment until ${dayWords(dates.valuation_valid_until)}`
              : ""
          }`
        : null,
    },
    {
      step: "firms_registered",
      done: page.firms_registered_on,
      detail: page.firms_registered_on
        ? `Registered ${dayWords(page.firms_registered_on)}${
            page.company?.firms_registered_on ? ", from the company record" : ""
          }`
        : null,
    },
  ];
  return (
    <RecordSection id="closing-round" title="The round's steps">
      {!page.key_dates_here && <p className="page-note">{KEY_DATES_MISSING}</p>}
      <DataTable
        caption="The round's steps"
        columns={[
          { key: "step", label: "Step", width: "22%" },
          { key: "done", label: "Done" },
          { key: "detail", label: "Detail" },
          { key: "act", label: "" },
        ]}
        columnMenu={false}
        scroll={false}
      >
        {rows.map((row) => (
          <tr key={row.step} data-step={row.step}>
            <td>
              <span className="table-title">{ROUND_STEPS[row.step]}</span>
            </td>
            <td>{row.done ? dayWords(row.done) : <span className="table-sub">Not yet</span>}</td>
            <td>{row.detail ?? <span className="table-sub">Nothing recorded</span>}</td>
            <td>
              <Popover label={row.done ? "Change" : "Record it"} align="end" width="wide">
                <MailForm
                  action={roundStepAction}
                  fields={{ step: row.step.replace(/_/g, "-") }}
                  submitLabel="Record it"
                  pendingLabel="Recording…"
                >
                  <RoundFields step={row.step} page={page} />
                </MailForm>
              </Popover>
            </td>
          </tr>
        ))}
      </DataTable>
    </RecordSection>
  );
}

function RoundFields({ step, page }: { step: RoundStep; page: ClosingsPage }) {
  const today = page.today;
  const at = (name: string) => `round-${step}-${name}`;
  const day = (value: string | null | undefined, label = "On") => (
    <Field id={at("on")} label={label}>
      <Input
        id={at("on")}
        name="on"
        type="date"
        max={today}
        required
        defaultValue={value ?? today}
      />
    </Field>
  );
  switch (step) {
    case "special_resolution":
      return (
        <>
          {page.resolutions && page.resolutions.length > 0 && (
            <Field id={at("resolution")} label="From Meetings">
              <Select
                id={at("resolution")}
                name="resolution_id"
                defaultValue={page.round.special_resolution?.resolution_id ?? ""}
              >
                <option value="">Typed here instead</option>
                {page.resolutions
                  .filter((resolution) => resolution.kind === "special")
                  .map((resolution) => (
                    <option key={resolution.resolution_id} value={resolution.resolution_id}>
                      {resolution.title} · {resolution.meeting_title}
                    </option>
                  ))}
              </Select>
            </Field>
          )}
          {day(page.round.special_resolution?.on, "Passed on")}
          <Field id={at("words")} label="What it approved">
            <Textarea
              id={at("words")}
              name="words"
              rows={2}
              maxLength={400}
              defaultValue={page.round.special_resolution?.words ?? ""}
            />
          </Field>
          <Checkbox
            id={at("dates")}
            name="add_dates"
            label="Add the deadlines to Key dates"
            description="MGT-14, from the rule your CS can confirm in Key dates › Rules. A resolution picked from Meetings has its own."
            defaultChecked
          />
        </>
      );
    case "separate_account":
      return (
        <>
          {day(page.round.separate_account?.opened_on, "Opened on")}
          <Field id={at("bank")} label="Bank">
            <Input
              id={at("bank")}
              name="bank"
              maxLength={120}
              required
              defaultValue={page.round.separate_account?.bank ?? ""}
            />
          </Field>
        </>
      );
    case "valuation":
      return (
        <>
          {day(page.round.valuation?.on, "Report dated")}
          <Field id={at("by")} label="Valuer">
            <Input
              id={at("by")}
              name="by_name"
              maxLength={120}
              required
              defaultValue={page.round.valuation?.by_name ?? ""}
            />
          </Field>
          <Field id={at("kind")} label="Kind">
            <Select
              id={at("kind")}
              name="kind"
              defaultValue={page.round.valuation?.kind ?? "registered_valuer"}
            >
              {Object.entries(VALUATION_KINDS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id={at("file")} label="The report (at most 3 MB)">
            <Input id={at("file")} name="file" type="file" />
          </Field>
        </>
      );
    case "firms_registered":
      return day(page.round.firms_registered?.on, "Registered on");
  }
}
