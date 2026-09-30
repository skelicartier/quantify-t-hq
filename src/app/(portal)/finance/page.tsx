import {
  archiveCashAccountAction,
  createCashAccountAction,
  recordBalanceAction,
} from "@/app/(portal)/finance/actions";
import { FinanceTabs, RunwayCard } from "@/components/finance/finance-parts";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { RowAction } from "@/components/ui/row-action";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCash, type CashBoard } from "@/lib/api/finance";
import { formatDate, formatMoney } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Cash and runway" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "account", label: "Account" },
  { key: "currency", label: "Currency" },
  { key: "balance", label: "Balance", align: "end" as const },
  { key: "as_of", label: "As of" },
  { key: "history", label: "Earlier" },
  { key: "act", label: "Action" },
];

/**
 * Cash as the bank said it was on a day, and runway measured from it — per currency,
 * and refused, with the reason, when a balance is missing or old. A runway worked out
 * from a stale balance is a number nobody should act on.
 */
export default async function CashPage() {
  const context = await requireStaff("/finance");
  if (!hasCapability(context, "revenue:write")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Cash and runway" />
        <Callout tone="neutral">Cash and runway are kept by Owners and Admins.</Callout>
      </>
    );
  }
  let board: CashBoard | null = null;
  try {
    board = await readCash(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const today = new Date(requestNow()).toISOString().slice(0, 10);
  const live = board?.accounts.filter((account) => !account.archived) ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Cash and runway"
        description="Runway is cash divided by the net burn of the last three months, one currency at a time. It is not shown when an account has no balance or one older than 35 days, or when no balance goes back three months — record balances from the bank as they stand on a day."
        actions={<FinanceTabs current="/finance" />}
      />
      {board === null ? (
        <Callout tone="danger" role="alert">
          Cash could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section id="runway" title="Runway">
            {board.runway.length === 0 ? (
              <p className="muted">Add an account and record its balance to see runway.</p>
            ) : (
              <div className="runway-grid">
                {board.runway.map((item) => (
                  <RunwayCard key={item.currency} runway={item} />
                ))}
              </div>
            )}
          </Section>
          <Section id="accounts" title="Accounts">
            <DataTable
              caption="Bank accounts and their latest balance"
              columns={COLUMNS}
              isEmpty={board.accounts.length === 0}
              empty={<p className="muted">No accounts yet.</p>}
              columnMenu={false}
            >
              {board.accounts.map((account) => (
                <tr key={account.account_id}>
                  <td>
                    {account.name}
                    {account.institution && <span className="quiet"> · {account.institution}</span>}
                    {account.archived && <span className="quiet"> · archived</span>}
                  </td>
                  <td>{account.currency}</td>
                  <td className="data-table__num">
                    {account.balance === null
                      ? "—"
                      : formatMoney(account.balance, account.currency)}
                  </td>
                  <td>
                    {formatDate(account.as_of, "None yet")}
                    {account.stale && (
                      <span className="quiet"> · older than {board.stale_after_days} days</span>
                    )}
                  </td>
                  <td>
                    {account.history
                      .slice(1, 4)
                      .map(
                        (item) =>
                          `${formatDate(item.as_of)}: ${formatMoney(item.amount, account.currency)}`,
                      )
                      .join(" · ") || "—"}
                  </td>
                  <td>
                    <RowAction
                      action={archiveCashAccountAction}
                      fields={{ account_id: account.account_id }}
                      buttons={[
                        {
                          label: account.archived ? "Restore" : "Archive",
                          name: "action",
                          value: account.archived ? "restore" : "archive",
                          className: "btn btn--small btn--ghost",
                          ariaLabel: `${account.archived ? "Restore" : "Archive"} ${account.name}`,
                        },
                      ]}
                    />
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>
          <Section id="record" title="Keep it current">
            <div className="form-grid">
              {live.length > 0 && (
                <Card
                  title="Record a balance"
                  titleAs="h3"
                  description="As the bank shows it on a day. The same day again corrects it."
                >
                  <ActForm
                    action={recordBalanceAction}
                    hidden={{}}
                    act="record"
                    label="Record the balance"
                    primary
                  >
                    <Field id="balance-account" label="Account">
                      <Select
                        id="balance-account"
                        name="account_id"
                        defaultValue={live[0]?.account_id}
                      >
                        {live.map((account) => (
                          <option key={account.account_id} value={account.account_id}>
                            {account.name} ({account.currency})
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <div className="form-grid">
                      <Field id="balance-day" label="On">
                        <Input
                          id="balance-day"
                          name="as_of"
                          type="date"
                          defaultValue={today}
                          max={today}
                        />
                      </Field>
                      <Field id="balance-amount" label="Balance">
                        <Input
                          id="balance-amount"
                          name="amount"
                          inputMode="decimal"
                          maxLength={24}
                          placeholder="125000.00"
                        />
                      </Field>
                    </div>
                    <Field id="balance-note" label="Note">
                      <Input id="balance-note" name="note" maxLength={400} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              <Card title="Add an account" titleAs="h3">
                <ActForm
                  action={createCashAccountAction}
                  hidden={{}}
                  act="create"
                  label="Add the account"
                >
                  <Field id="account-name" label="Name">
                    <Input
                      id="account-name"
                      name="name"
                      maxLength={120}
                      placeholder="Operating account"
                    />
                  </Field>
                  <div className="form-grid">
                    <Field id="account-bank" label="Bank">
                      <Input id="account-bank" name="institution" maxLength={120} />
                    </Field>
                    <Field id="account-currency" label="Currency">
                      <Input
                        id="account-currency"
                        name="currency"
                        maxLength={3}
                        placeholder="USD"
                      />
                    </Field>
                  </div>
                </ActForm>
              </Card>
            </div>
          </Section>
        </div>
      )}
    </>
  );
}
