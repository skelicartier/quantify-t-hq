import Link from "next/link";

import { saveBudgetAction } from "@/app/(portal)/finance/actions";
import { FinanceTabs } from "@/components/finance/finance-parts";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readBudget, type Budget } from "@/lib/api/finance";
import { formatMoneyExact } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Budget" };
export const dynamic = "force-dynamic";

const shiftMonth = (month: string, by: number) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + by);
  return date.toISOString().slice(0, 7);
};
const monthLabel = (month: string) =>
  new Date(`${month}-01T00:00:00Z`).toLocaleString("en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  });

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * The month's budget against what the books say. Actuals are typed from the accounting
 * system with where they came from; over by more than a tenth is flagged for a cost, under
 * for revenue. Per currency, never added together.
 */
export default async function BudgetPage({ searchParams }: Props) {
  const context = await requireStaff("/finance/budget");
  if (!hasCapability(context, "revenue:write")) {
    return (
      <>
        <PageHeader eyebrow="Business" title="Budget" />
        <Callout tone="neutral">Finance is kept by Owners and Admins.</Callout>
      </>
    );
  }
  const asked = firstSearchValue((await searchParams).month) ?? "";
  const thisMonth = new Date(requestNow()).toISOString().slice(0, 7);
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(asked) ? asked : thisMonth;
  let budget: Budget | null = null;
  try {
    budget = await readBudget(context.token, month);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Business"
        title="Budget"
        description="The month's budget against the books. An actual is typed from the accounting system, with where it came from; HQ keeps no ledger. Over by more than a tenth is flagged for a cost, under for revenue."
        actions={<FinanceTabs current="/finance/budget" />}
      />
      {budget === null ? (
        <Callout tone="danger" role="alert">
          The budget could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <nav className="inline-actions" aria-label="Month">
            <Link
              className="btn btn--small btn--ghost"
              href={`/finance/budget?month=${shiftMonth(month, -1)}`}
            >
              Previous month
            </Link>
            <strong>{monthLabel(month)}</strong>
            <Link
              className="btn btn--small btn--ghost"
              href={`/finance/budget?month=${shiftMonth(month, 1)}`}
            >
              Next month
            </Link>
          </nav>
          {Object.keys(budget.costs).length > 0 && (
            <p className="page-note">
              Costs:{" "}
              {Object.entries(budget.costs)
                .map(
                  ([currency, entry]) =>
                    `${formatMoneyExact(entry.actual, currency)} of ${formatMoneyExact(entry.budget, currency)} budgeted${
                      entry.lines_without_actual
                        ? ` (${entry.lines_without_actual} without an actual yet)`
                        : ""
                    }`,
                )
                .join(" · ")}
              {Object.keys(budget.earned_revenue).length > 0 &&
                ` · revenue earned from the invoice register: ${Object.entries(
                  budget.earned_revenue,
                )
                  .map(([currency, amount]) => formatMoneyExact(amount, currency))
                  .join(" · ")}`}
            </p>
          )}
          <Section id="lines" title="Budget against actual">
            <DataTable
              caption={`Budget lines for ${monthLabel(month)}`}
              columns={[
                { key: "category", label: "Category" },
                { key: "budget", label: "Budget", align: "end" as const },
                { key: "actual", label: "Actual", align: "end" as const },
                { key: "variance", label: "Difference", align: "end" as const },
                { key: "flag", label: "State" },
                { key: "source", label: "Actual from" },
              ]}
              isEmpty={budget.lines.length === 0}
              empty={<p className="muted">No budget set for this month.</p>}
              columnMenu={false}
            >
              {budget.lines.map((line) => (
                <tr key={line.line_id}>
                  <td>
                    {line.category_label}
                    <span className="quiet"> · {line.currency}</span>
                  </td>
                  <td className="data-table__num">
                    {formatMoneyExact(line.budget, line.currency)}
                  </td>
                  <td className="data-table__num">
                    {line.actual === null ? "—" : formatMoneyExact(line.actual, line.currency)}
                  </td>
                  <td className="data-table__num">
                    {line.variance === null
                      ? "—"
                      : `${line.variance > 0 ? "+" : ""}${formatMoneyExact(line.variance, line.currency)}${
                          line.variance_share !== null
                            ? ` (${Math.round(line.variance_share * 1000) / 10}%)`
                            : ""
                        }`}
                  </td>
                  <td>
                    {line.actual === null ? (
                      <StatusPill value="open" label="Books not closed" tone="neutral" />
                    ) : line.flag ? (
                      <StatusPill
                        value="flag"
                        label={
                          line.category === "revenue"
                            ? "Under by more than a tenth"
                            : "Over by more than a tenth"
                        }
                        tone="attention"
                      />
                    ) : (
                      <StatusPill value="ok" label="Within a tenth" tone="live" />
                    )}
                  </td>
                  <td>{line.actual_source || "—"}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
          <Section id="set" title="Set a line">
            <ActForm
              action={saveBudgetAction}
              hidden={{ month }}
              act="save"
              label="Save the line"
              primary
              tight={false}
            >
              <div className="form-grid">
                <Field id="budget-category" label="Category">
                  <Select id="budget-category" name="category" defaultValue="software">
                    {budget.categories.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="budget-currency" label="Currency">
                  <Input id="budget-currency" name="currency" maxLength={3} defaultValue="USD" />
                </Field>
              </div>
              <div className="form-grid">
                <Field id="budget-amount" label="Budget">
                  <Input id="budget-amount" name="budget" inputMode="decimal" maxLength={24} />
                </Field>
                <Field
                  id="budget-actual"
                  label="Actual"
                  hint="Once the books close; leave empty until then."
                >
                  <Input id="budget-actual" name="actual" inputMode="decimal" maxLength={24} />
                </Field>
              </div>
              <Field
                id="budget-source"
                label="Where the actual came from"
                hint="The accounting system's report, and when it was run."
              >
                <Input id="budget-source" name="actual_source" maxLength={200} />
              </Field>
            </ActForm>
          </Section>
        </div>
      )}
    </>
  );
}
