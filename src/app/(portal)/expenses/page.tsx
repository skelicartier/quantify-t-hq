import { actOnExpenseAction, claimExpenseAction } from "@/app/(portal)/finance/actions";
import { ClaimPill, FinanceTabs } from "@/components/finance/finance-parts";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { RowAction } from "@/components/ui/row-action";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readExpenses, type ExpenseBoard, type ExpenseClaim } from "@/lib/api/finance";
import { formatDate, formatMoneyExact } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Expenses" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "when", label: "Spent on" },
  { key: "who", label: "Who" },
  { key: "what", label: "What for" },
  { key: "amount", label: "Amount", align: "end" as const },
  { key: "receipt", label: "Receipt" },
  { key: "status", label: "State" },
  { key: "decided", label: "Decided" },
  { key: "act", label: "Action" },
];

function Decision({ claim }: { claim: ExpenseClaim }) {
  if (claim.status === "paid") return <>Paid {formatDate(claim.paid_on)}</>;
  if (claim.decided_by_name)
    return (
      <>
        {claim.decided_by_name}
        {claim.decision_note && <span className="quiet"> · {claim.decision_note}</span>}
      </>
    );
  return <>—</>;
}

/**
 * Money spent for the company, claimed back. Everyone claims their own; an owner or
 * admin who is not the claimant approves it or says why not, and records the payment.
 */
export default async function ExpensesPage() {
  const context = await requireStaff("/expenses");
  let board: ExpenseBoard | null = null;
  try {
    board = await readExpenses(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const today = new Date(requestNow()).toISOString().slice(0, 10);
  const owed = Object.entries(board?.owed_by_currency ?? {});

  return (
    <>
      <PageHeader
        eyebrow="Work"
        title="Expenses"
        description="Claim back what you spent for the company, with where the receipt is. Someone else approves it; your own claims are never yours to decide."
        actions={board?.can_decide ? <FinanceTabs current="/expenses" /> : undefined}
      />
      {board === null ? (
        <Callout tone="danger" role="alert">
          Expenses could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section
            id="claims"
            title={board.can_decide ? "Claims" : "Your claims"}
            description={
              board.can_decide && owed.length
                ? `Waiting or approved and not yet paid: ${owed.map(([currency, amount]) => formatMoneyExact(amount, currency)).join(" · ")}.`
                : undefined
            }
          >
            <DataTable
              caption="Expense claims, waiting first"
              columns={COLUMNS}
              isEmpty={board.claims.length === 0}
              empty={<p className="muted">No claims yet.</p>}
            >
              {board.claims.map((claim) => (
                <tr key={claim.claim_id}>
                  <td>{formatDate(claim.spent_on)}</td>
                  <td>{claim.mine ? "You" : claim.staff_name}</td>
                  <td>
                    {claim.description}
                    <span className="quiet"> · {claim.category_label}</span>
                  </td>
                  <td className="data-table__num">
                    {formatMoneyExact(claim.amount, claim.currency)}
                  </td>
                  <td>{claim.receipt_ref || "—"}</td>
                  <td>
                    <ClaimPill status={claim.status} />
                  </td>
                  <td>
                    <Decision claim={claim} />
                  </td>
                  <td>
                    <div className="inline-actions">
                      {claim.mine && claim.status === "submitted" && (
                        <RowAction
                          action={actOnExpenseAction}
                          fields={{ claim_id: claim.claim_id, action: "withdraw" }}
                          buttons={[
                            {
                              label: "Withdraw",
                              className: "btn btn--small btn--ghost",
                              ariaLabel: `Withdraw the claim for ${claim.description}`,
                            },
                          ]}
                        />
                      )}
                      {board.can_decide && !claim.mine && claim.status === "submitted" && (
                        <>
                          <RowAction
                            action={actOnExpenseAction}
                            fields={{ claim_id: claim.claim_id, action: "approve" }}
                            buttons={[
                              {
                                label: "Approve",
                                className: "btn btn--small",
                                ariaLabel: `Approve ${claim.staff_name}'s claim for ${claim.description}`,
                              },
                            ]}
                          />
                          <details className="disclosure">
                            <summary>Reject</summary>
                            <ActForm
                              action={actOnExpenseAction}
                              hidden={{ claim_id: claim.claim_id }}
                              act="reject"
                              label="Reject it"
                              danger
                            >
                              <Field id={`reject-${claim.claim_id}`} label="Why">
                                <Input
                                  id={`reject-${claim.claim_id}`}
                                  name="note"
                                  maxLength={400}
                                />
                              </Field>
                            </ActForm>
                          </details>
                        </>
                      )}
                      {board.can_decide && !claim.mine && claim.status === "approved" && (
                        <RowAction
                          action={actOnExpenseAction}
                          fields={{ claim_id: claim.claim_id, action: "pay" }}
                          buttons={[
                            {
                              label: "Mark paid",
                              className: "btn btn--small",
                              ariaLabel: `Mark ${claim.staff_name}'s claim for ${claim.description} paid`,
                            },
                          ]}
                        />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>
          <Section id="claim" title="Claim an expense">
            <ActForm
              action={claimExpenseAction}
              hidden={{}}
              act="claim"
              label="Claim it"
              primary
              tight={false}
            >
              <div className="form-grid">
                <Field id="claim-day" label="Spent on">
                  <Input
                    id="claim-day"
                    name="spent_on"
                    type="date"
                    defaultValue={today}
                    max={today}
                  />
                </Field>
                <Field id="claim-category" label="Kind">
                  <Select id="claim-category" name="category" defaultValue="travel">
                    {board.categories.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="form-grid">
                <Field id="claim-amount" label="Amount">
                  <Input
                    id="claim-amount"
                    name="amount"
                    inputMode="decimal"
                    maxLength={24}
                    placeholder="42.50"
                  />
                </Field>
                <Field id="claim-currency" label="Currency">
                  <Input id="claim-currency" name="currency" maxLength={3} defaultValue="GBP" />
                </Field>
              </div>
              <Field id="claim-description" label="What it was for">
                <Input
                  id="claim-description"
                  name="description"
                  maxLength={400}
                  placeholder="Train to the client meeting"
                />
              </Field>
              <Field
                id="claim-receipt"
                label="Where the receipt is"
                hint="A link or where it is filed."
              >
                <Input id="claim-receipt" name="receipt_ref" maxLength={400} />
              </Field>
            </ActForm>
          </Section>
        </div>
      )}
    </>
  );
}
