import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { MoneyTabs } from "@/components/data/money/money-tabs";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability } from "@/lib/access/core";
import { DATA_ROLE_LINE } from "@/lib/data/access";
import { readLines, type LineView, type LinesPage } from "@/lib/data/api/statements";
import { dayWords } from "@/lib/data/labels-company";
import { periodWords } from "@/lib/data/labels-duties";
import {
  LINE_VIEWS,
  MONEY_MISSING,
  NOT_ADVICE,
  STATEMENTS_OWNER_LINE,
  acceptSureWords,
  exactWords,
  type LineView as ViewKey,
} from "@/lib/data/labels-statements";
import { requireDataOwner } from "@/lib/data/owner";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

import {
  acceptSureAction,
  lineCategoryAction,
  matchLineAction,
  unmatchLineAction,
} from "../actions";
import "../statements.css";

export const metadata = { title: "Statement lines" };
export const dynamic = "force-dynamic";

const BASE = "/data/money/statements";
const COLUMNS = [
  { key: "day", label: "Day" },
  { key: "narration", label: "Narration" },
  { key: "reference", label: "Reference" },
  { key: "out", label: "Out", align: "end" as const },
  { key: "in", label: "In", align: "end" as const },
  { key: "category", label: "Category" },
  { key: "matched", label: "Matched to" },
];

type Params = Record<string, string | string[] | undefined>;

/**
 * One account's lines, a month at a time (ws-notes/duties/spec.md §9.11): what came in and
 * went out, each line's category and what it is matched to, and the suggestions worked out
 * as the page opens. A locked month shows the lock and no controls. For the Owner only.
 */
export default async function AccountLinesRoute({
  params,
  searchParams,
}: {
  params: Promise<{ accountId: string }>;
  searchParams: Promise<Params>;
}) {
  const { accountId } = await params;
  const query = await searchParams;
  const { allowed, context } = await requireDataOwner(`${BASE}/${accountId}`);
  const month = firstSearchValue(query.month) ?? "";
  const view = firstSearchValue(query.view) ?? "to_sort";
  const read = allowed ? await dataRead(() => readLines(true, accountId, month, view)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title={data ? data.label : "Statement lines"}
        description={
          data
            ? `${data.account.bank ? `${data.account.bank} · ` : ""}${data.account.currency}`
            : undefined
        }
        actions={
          data ? (
            <ButtonLink
              href={`${BASE}/export?month=${data.month}&account=${data.account.account_id}`}
              size="small"
            >
              Download the lines (CSV)
            </ButtonLink>
          ) : undefined
        }
      />
      <div className="page-content">
        <div className="hqdata-statements">
          {hasCapability(context, "mail:send") && (
            <MoneyTabs current="statements" owner={context.me.role === "owner"} />
          )}
          {!allowed || !read ? (
            <Callout tone="neutral">
              {hasCapability(context, "mail:send") ? STATEMENTS_OWNER_LINE : DATA_ROLE_LINE}
            </Callout>
          ) : !read.ok ? (
            <DataUnavailable failure={read} />
          ) : (
            <Lines page={read.data} />
          )}
        </div>
      </div>
    </>
  );
}

const why = (text: string) => text.replace(/\.$/, "").replace(/^./, (first) => first.toLowerCase());

function Lines({ page }: { page: LinesPage }) {
  const base = `${BASE}/${page.account.account_id}`;
  const currency = page.account.currency;
  const months = page.months.includes(page.month) ? page.months : [page.month, ...page.months];
  return (
    <>
      <SegmentedLinks
        label="Month"
        items={months.map((month) => ({
          href: `${base}?month=${month}&view=${page.view}`,
          label: periodWords(month),
          current: month === page.month,
        }))}
      />
      <p className="hqdata-statements__figures">
        {page.opening_minor === null
          ? "No statement covers the start of this month."
          : `Opening ${exactWords(page.opening_minor, currency)}`}{" "}
        · in {exactWords(page.in_minor, currency)} · out {exactWords(page.out_minor, currency)}
        {page.closing_minor === null
          ? ""
          : ` · closing ${exactWords(page.closing_minor, currency)}`}
      </p>
      {page.locked && page.lock_words && <Callout tone="attention">{page.lock_words}</Callout>}
      {!page.here.money && <p className="page-note">{MONEY_MISSING}</p>}
      <SegmentedLinks
        label="Which lines"
        items={(Object.keys(LINE_VIEWS) as ViewKey[]).map((key) => ({
          href: `${base}?month=${page.month}&view=${key}`,
          label: `${LINE_VIEWS[key]} ${formatNumber(page.counts[key])}`,
          current: page.view === key,
        }))}
      />
      {!page.locked && page.sure > 0 && (
        <MailForm
          action={acceptSureAction}
          fields={{ account_id: page.account.account_id, month: page.month }}
          submitLabel={acceptSureWords(page.sure)}
          pendingLabel="Accepting…"
          className="stack-form stack-form--tight hqdata-statements__sure"
        />
      )}
      <DataTable
        caption="Lines"
        columns={COLUMNS}
        columnMenu={false}
        isEmpty={page.lines.length === 0}
        empty={
          <p className="page-note">
            {page.view === "to_sort"
              ? "Every line of this month has a category."
              : "No lines here for this month."}
          </p>
        }
      >
        {page.lines.map((line) => (
          <LineRow key={line.line_id} line={line} page={page} />
        ))}
      </DataTable>
      <p className="page-note">
        A line is sorted once it has a category; matching it to a bill gives it the bill&rsquo;s. A
        match to an open bill records the payment in Money from the bank&rsquo;s own line, and
        taking it back takes that payment back. {NOT_ADVICE}
      </p>
    </>
  );
}

function LineRow({ line, page }: { line: LineView; page: LinesPage }) {
  const currency = page.account.currency;
  const controls = !page.locked && !line.withdrawn;
  const hidden = { line_id: line.line_id, account_id: page.account.account_id };
  return (
    <tr className={line.withdrawn ? "hqdata-statements__withdrawn" : undefined}>
      <td className="nowrap">{dayWords(line.posted_on)}</td>
      <td>
        {line.narration}
        {line.withdrawn && <span className="table-sub">Its statement was withdrawn.</span>}
        {line.note && <span className="table-sub">{line.note}</span>}
        {controls && line.suggestions.length > 0 && (
          <div className="hqdata-statements__suggestions">
            {line.suggestions.map((suggestion) =>
              suggestion.kind === "export" ? (
                <Popover
                  key={suggestion.ref}
                  label={`Match: ${suggestion.title} · ${why(suggestion.why)}`}
                  width="wide"
                  align="start"
                >
                  <MailForm
                    action={matchLineAction}
                    fields={{ ...hidden, ref: suggestion.ref }}
                    submitLabel="Record the receipt"
                    pendingLabel="Recording…"
                  >
                    <Field
                      id={`amount-${line.line_id}-${suggestion.ref}`}
                      label={`Received, in ${suggestion.currency ?? "the invoice's currency"}`}
                    >
                      <Input
                        id={`amount-${line.line_id}-${suggestion.ref}`}
                        name="amount"
                        inputMode="decimal"
                        required
                        maxLength={24}
                        autoComplete="off"
                      />
                    </Field>
                  </MailForm>
                </Popover>
              ) : (
                <MailForm
                  key={suggestion.ref}
                  action={matchLineAction}
                  fields={{ ...hidden, ref: suggestion.ref }}
                  submitLabel={`Match: ${suggestion.title} · ${why(suggestion.why)}`}
                  pendingLabel="Matching…"
                  variant={suggestion.strength === "sure" ? "primary" : "default"}
                  className="hqdata-statements__match"
                />
              ),
            )}
          </div>
        )}
      </td>
      <td>{line.reference}</td>
      <td className="data-table__num">
        {line.direction === "debit" ? exactWords(line.amount_minor, currency) : ""}
      </td>
      <td className="data-table__num">
        {line.direction === "credit" ? exactWords(line.amount_minor, currency) : ""}
      </td>
      <td>
        {line.category ? (
          <>
            {line.category.name}
            {line.category.ledger && <span className="table-sub">{line.category.ledger}</span>}
          </>
        ) : (
          <span className="quiet">None yet</span>
        )}
        {controls && page.categories && (
          <MailForm
            action={lineCategoryAction}
            fields={hidden}
            submitLabel="Save"
            pendingLabel="Saving…"
            className="hqdata-statements__category"
          >
            <label className="sr-only" htmlFor={`category-${line.line_id}`}>
              Category for the line of {dayWords(line.posted_on)}
            </label>
            <Select
              id={`category-${line.line_id}`}
              name="category_id"
              defaultValue={line.category_id ?? ""}
            >
              <option value="">No category</option>
              {page.categories.map((category) => (
                <option key={category.category_id} value={category.category_id}>
                  {category.name}
                </option>
              ))}
            </Select>
          </MailForm>
        )}
      </td>
      <td>
        {line.match_title ? (
          line.match_href ? (
            <Link className="text-link" href={line.match_href}>
              {line.match_title}
            </Link>
          ) : (
            line.match_title
          )
        ) : (
          <span className="quiet">Nothing</span>
        )}
        {controls && line.match && (
          <MailForm
            action={unmatchLineAction}
            fields={{ ...hidden, why: "" }}
            submitLabel="Take the match back"
            pendingLabel="Taking back…"
            className="hqdata-statements__unmatch"
          />
        )}
      </td>
    </tr>
  );
}
