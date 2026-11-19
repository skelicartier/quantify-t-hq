import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { MoneyTabs } from "@/components/data/money/money-tabs";
import { StatementImport } from "@/components/data/statements/statement-import";
import { ActForm } from "@/components/ui/act-form";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { hasCapability } from "@/lib/access/core";
import { DATA_ROLE_LINE } from "@/lib/data/access";
import { readStatements, type StatementsPage } from "@/lib/data/api/statements";
import { dayWords } from "@/lib/data/labels-company";
import { DUTY_CURRENCIES, minorWords } from "@/lib/data/labels-duties";
import {
  ACCOUNT_KINDS,
  CARD_NOTE,
  FORMATS_WORDS,
  NOT_ADVICE,
  NO_ACCOUNTS,
  PDF_WORDS,
  STATEMENTS_ABOUT,
  STATEMENTS_OWNER_LINE,
  XLS_WORDS,
  countOf,
  exactWords,
  rangeWords,
} from "@/lib/data/labels-statements";
import { requireDataOwner } from "@/lib/data/owner";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";

import {
  addAccountAction,
  addCopyAction,
  importStatementAction,
  previewImportAction,
  withdrawStatementAction,
} from "./actions";
import "./statements.css";

export const metadata = { title: "Statements" };
export const dynamic = "force-dynamic";

const BASE = "/data/money/statements";
const ACCOUNT_COLUMNS = [
  { key: "account", label: "Account" },
  { key: "kind", label: "Kind" },
  { key: "currency", label: "Currency" },
  { key: "covered", label: "Covered to" },
  { key: "closing", label: "Closing balance", align: "end" as const },
  { key: "sort", label: "To sort", align: "end" as const },
];
const STATEMENT_COLUMNS = [
  { key: "days", label: "Days covered" },
  { key: "lines", label: "Lines", align: "end" as const },
  { key: "adds", label: "Adds up" },
  { key: "imported", label: "Imported" },
  { key: "files", label: "The files" },
];

/**
 * Money › Statements (ws-notes/duties/spec.md §9.11): each bank and card account, the
 * statements imported for it, and the days nothing covers. For the Owner only: anyone else
 * reads one line and nothing is asked of the service for them.
 */
export default async function StatementsRoute() {
  const { allowed, context } = await requireDataOwner(BASE);
  const owner = allowed;
  const read = owner ? await dataRead(() => readStatements(true)) : null;
  const data = read?.ok ? read.data : null;
  const openAccounts =
    data?.accounts
      .filter((row) => row.account.closed_on === null)
      .map((row) => ({
        account_id: row.account_id,
        name: row.name,
        last4: row.account.last4,
        currency: row.currency,
      })) ?? [];
  return (
    <>
      <PageHeader
        title="Statements"
        description={owner ? STATEMENTS_ABOUT : undefined}
        actions={
          data ? (
            <>
              <Popover label="Add an account" width="wide">
                <AccountForm />
              </Popover>
              {openAccounts.length > 0 && (
                <Popover label="Import a statement" variant="primary" width="wide">
                  <StatementImport
                    accounts={openAccounts}
                    preview={previewImportAction}
                    importAction={importStatementAction}
                  />
                </Popover>
              )}
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        <div className="hqdata-statements">
          {hasCapability(context, "mail:send") && (
            <MoneyTabs current="statements" owner={context.me.role === "owner"} />
          )}
          {!owner || !read ? (
            <Callout tone="neutral">
              {hasCapability(context, "mail:send") ? STATEMENTS_OWNER_LINE : DATA_ROLE_LINE}
            </Callout>
          ) : !read.ok ? (
            <DataUnavailable failure={read} />
          ) : (
            <Statements page={read.data} />
          )}
        </div>
      </div>
    </>
  );
}

function AccountForm() {
  return (
    <MailForm action={addAccountAction} submitLabel="Add the account" pendingLabel="Adding…">
      <Field id="account-name" label="Name" hint="As you call it: “Current account”.">
        <Input id="account-name" name="name" required maxLength={120} autoComplete="off" />
      </Field>
      <Field id="account-kind" label="Kind">
        <Select id="account-kind" name="kind" defaultValue="bank">
          <option value="bank">{ACCOUNT_KINDS.bank}</option>
          <option value="card">{ACCOUNT_KINDS.card}</option>
        </Select>
      </Field>
      <Field id="account-bank" label="Bank">
        <Input id="account-bank" name="bank" maxLength={120} autoComplete="off" />
      </Field>
      <Field
        id="account-last4"
        label="Last four digits"
        hint="Only the last four digits are kept, never the whole number."
      >
        <Input
          id="account-last4"
          name="last4"
          required
          inputMode="numeric"
          pattern="[0-9]{4}"
          maxLength={4}
          autoComplete="off"
        />
      </Field>
      <Field id="account-currency" label="Currency">
        <Select id="account-currency" name="currency" defaultValue="INR">
          {DUTY_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
      </Field>
      <Field
        id="account-opening-on"
        label="Opening balance on"
        hint="Only for a bank whose files give no balances."
      >
        <Input id="account-opening-on" name="opening_on" type="date" />
      </Field>
      <Field id="account-opening" label="Opening balance">
        <Input
          id="account-opening"
          name="opening_balance"
          inputMode="decimal"
          maxLength={24}
          autoComplete="off"
        />
      </Field>
    </MailForm>
  );
}

function Statements({ page }: { page: StatementsPage }) {
  return (
    <>
      <DataTable
        caption="Accounts"
        columns={ACCOUNT_COLUMNS}
        columnMenu={false}
        isEmpty={page.accounts.length === 0}
        empty={<p className="page-note">{NO_ACCOUNTS}</p>}
      >
        {page.accounts.map((row) => (
          <tr key={row.account_id}>
            <td>
              <Link className="table-title" href={`${BASE}/${row.account_id}`}>
                {row.label}
              </Link>
              {row.account.bank && <span className="table-sub">{row.account.bank}</span>}
              {row.account.closed_on && (
                <span className="table-sub">Closed {dayWords(row.account.closed_on)}</span>
              )}
            </td>
            <td>{ACCOUNT_KINDS[row.kind]}</td>
            <td>{row.currency}</td>
            <td className="nowrap">
              {row.covered_to ? dayWords(row.covered_to) : "Nothing imported"}
            </td>
            <td className="data-table__num">
              {row.closing_minor === null ? "" : exactWords(row.closing_minor, row.currency)}
            </td>
            <td className="data-table__num">{formatNumber(row.to_sort)}</td>
          </tr>
        ))}
      </DataTable>
      {page.accounts.map((row) => (
        <section
          key={row.account_id}
          className="hqdata-statements__account"
          aria-labelledby={`account-${row.account_id}`}
        >
          <h2 className="hqdata-statements__title" id={`account-${row.account_id}`}>
            {row.label}
          </h2>
          {row.kind === "card" && <p className="page-note">{CARD_NOTE}</p>}
          {row.gaps.map((gap) => (
            <p key={gap.from} className="hqdata-statements__check">
              {gap.words}
            </p>
          ))}
          <DataTable
            caption={`Statements for ${row.label}`}
            columns={STATEMENT_COLUMNS}
            columnMenu={false}
            isEmpty={row.statements.length === 0}
            empty={<p className="page-note">No statement imported yet.</p>}
          >
            {row.statements.map((statement) => (
              <tr
                key={statement.statement_id}
                className={statement.withdrawn ? "hqdata-statements__withdrawn" : undefined}
              >
                <td className="nowrap">
                  {rangeWords(statement.from, statement.to)}
                  {statement.withdrawn && (
                    <span className="table-sub">
                      Withdrawn {dayWords(statement.withdrawn.at.slice(0, 10))}:{" "}
                      {statement.withdrawn.why}
                    </span>
                  )}
                </td>
                <td className="data-table__num">
                  {formatNumber(statement.lines)}
                  {statement.skipped > 0 && (
                    <span className="table-sub">
                      {formatNumber(statement.skipped)} already here
                    </span>
                  )}
                </td>
                <td>
                  {statement.adds_up.ok === true
                    ? "Yes"
                    : statement.adds_up.ok === false
                      ? statement.adds_up.words
                      : "No balances to check"}
                </td>
                <td className="nowrap">
                  {dayWords(statement.imported_at.slice(0, 10))}
                  <span className="table-sub">{statement.imported_by.name}</span>
                </td>
                <td>
                  <a
                    className="text-link"
                    href={`${BASE}/files/${statement.statement_id}?which=file`}
                  >
                    {statement.file_name}
                  </a>
                  {statement.copy_name && (
                    <a
                      className="text-link table-sub"
                      href={`${BASE}/files/${statement.statement_id}?which=copy`}
                    >
                      {statement.copy_name}
                    </a>
                  )}
                  {!statement.withdrawn && (
                    <div className="hqdata-statements__acts">
                      {!statement.copy && (
                        <Popover label="Add the bank's PDF" width="wide" align="start">
                          <MailForm
                            action={addCopyAction}
                            fields={{ statement_id: statement.statement_id }}
                            submitLabel="Keep it"
                            pendingLabel="Keeping…"
                          >
                            <Field id={`copy-${statement.statement_id}`} label="The bank's PDF">
                              <Input
                                id={`copy-${statement.statement_id}`}
                                name="file"
                                type="file"
                                accept="application/pdf,.pdf"
                                required
                              />
                            </Field>
                          </MailForm>
                        </Popover>
                      )}
                      <Popover label="Withdraw" width="wide" align="start">
                        <ActForm
                          action={withdrawStatementAction}
                          hidden={{
                            statement_id: statement.statement_id,
                            account_id: row.account_id,
                          }}
                          act="withdraw"
                          label="Withdraw it"
                          danger
                        >
                          <Field
                            id={`why-${statement.statement_id}`}
                            label="Why"
                            hint="Its lines stay, marked, and count nowhere. Nothing is deleted."
                          >
                            <Input
                              id={`why-${statement.statement_id}`}
                              name="why"
                              required
                              minLength={5}
                              maxLength={300}
                              autoComplete="off"
                            />
                          </Field>
                        </ActForm>
                      </Popover>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </section>
      ))}
      {page.cash.length > 0 && (
        <p className="page-note">
          {page.cash
            .map(
              (item) =>
                `Cash in ${item.currency}: ${minorWords(item.cash_minor, item.currency)} on ${dayWords(item.as_of)}; ${countOf(item.uncategorised, "line")} without a category.`,
            )
            .join(" ")}{" "}
          <Link className="text-link" href="/data/numbers">
            Open Numbers
          </Link>
        </p>
      )}
      <p className="page-note">
        {FORMATS_WORDS} {XLS_WORDS.replace(/^Save it/, "A spreadsheet: save it")} {PDF_WORDS}
      </p>
      <p className="page-note">{NOT_ADVICE}</p>
    </>
  );
}
