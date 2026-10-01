import Link from "next/link";

import { purchaseAction, requestPurchaseAction } from "@/app/(portal)/finance/actions";
import { FinanceTabs, SpendTabs } from "@/components/finance/finance-parts";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readPurchases, type PurchaseBoard } from "@/lib/api/finance";
import { formatDate, formatMoneyExact } from "@/lib/format";

export const metadata = { title: "Purchase requests" };
export const dynamic = "force-dynamic";

const TONE: Record<string, PillTone> = {
  submitted: "attention",
  approved: "live",
  bought: "neutral",
  rejected: "danger",
  withdrawn: "neutral",
};

const COLUMNS = [
  { key: "what", label: "What" },
  { key: "who", label: "Asked by" },
  { key: "amount", label: "Cost", align: "end" as const },
  { key: "needed", label: "Needed by" },
  { key: "state", label: "State" },
  { key: "act", label: "Action" },
];

/**
 * Asking to buy something before it is bought. Anyone asks; an owner or admin who is not the
 * asker decides; a monthly or yearly purchase joins the vendor register once bought.
 */
export default async function PurchasesPage() {
  const context = await requireStaff("/expenses/purchases");
  let board: PurchaseBoard | null = null;
  try {
    board = await readPurchases(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Work"
        title="Purchase requests"
        description="Ask before you buy. Someone else approves it, or says why not; a monthly or yearly purchase goes on the vendor register once it is bought, with its renewal date."
        actions={
          board?.can_decide ? (
            <FinanceTabs current="/expenses/purchases" />
          ) : (
            <SpendTabs current="/expenses/purchases" />
          )
        }
      />
      {board === null ? (
        <Callout tone="danger" role="alert">
          Purchase requests could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section id="requests" title={board.can_decide ? "Requests" : "Your requests"}>
            <DataTable
              caption="Purchase requests, waiting first"
              columns={COLUMNS}
              isEmpty={board.requests.length === 0}
              empty={<p className="muted">No requests yet.</p>}
            >
              {board.requests.map((item) => (
                <tr key={item.request_id}>
                  <td>
                    {item.vendor_name}
                    <span className="quiet">
                      {" "}
                      · {item.description} · {item.category_label}
                    </span>
                  </td>
                  <td>{item.mine ? "You" : item.requested_by_name}</td>
                  <td className="data-table__num">
                    {formatMoneyExact(item.amount, item.currency)}
                    <span className="quiet"> {item.billing_label.toLowerCase()}</span>
                  </td>
                  <td>{formatDate(item.needed_by, "—")}</td>
                  <td>
                    <StatusPill
                      value={item.status}
                      label={
                        item.status === "bought"
                          ? `Bought ${formatDate(item.bought_on)}`
                          : item.status.charAt(0).toUpperCase() + item.status.slice(1)
                      }
                      tone={TONE[item.status] ?? "neutral"}
                    />
                    {item.decision_note && <span className="quiet"> · {item.decision_note}</span>}
                    {item.vendor_id && (
                      <span className="quiet">
                        {" "}
                        ·{" "}
                        <Link className="text-link" href={`/finance/vendors/${item.vendor_id}`}>
                          on the register
                        </Link>
                      </span>
                    )}
                  </td>
                  <td>
                    <div className="inline-actions">
                      {board.can_decide && !item.mine && item.status === "submitted" && (
                        <>
                          <RowAction
                            action={purchaseAction}
                            fields={{ request_id: item.request_id, action: "approve" }}
                            buttons={[
                              {
                                label: "Approve",
                                className: "btn btn--small",
                                ariaLabel: `Approve ${item.requested_by_name}'s request for ${item.vendor_name}`,
                              },
                            ]}
                          />
                          <details className="disclosure">
                            <summary>Reject</summary>
                            <ActForm
                              action={purchaseAction}
                              hidden={{ request_id: item.request_id }}
                              act="reject"
                              label="Reject it"
                              danger
                            >
                              <Field id={`reject-${item.request_id}`} label="Why">
                                <Input
                                  id={`reject-${item.request_id}`}
                                  name="note"
                                  maxLength={400}
                                />
                              </Field>
                            </ActForm>
                          </details>
                        </>
                      )}
                      {item.status === "approved" && (item.mine || board.can_decide) && (
                        <RowAction
                          action={purchaseAction}
                          fields={{ request_id: item.request_id, action: "bought" }}
                          buttons={[
                            {
                              label: "Bought it",
                              className: "btn btn--small",
                              ariaLabel: `Record ${item.vendor_name} as bought`,
                            },
                          ]}
                        />
                      )}
                      {item.mine && (item.status === "submitted" || item.status === "approved") && (
                        <RowAction
                          action={purchaseAction}
                          fields={{ request_id: item.request_id, action: "withdraw" }}
                          buttons={[
                            {
                              label: "Withdraw",
                              className: "btn btn--small btn--ghost",
                              ariaLabel: `Withdraw the request for ${item.vendor_name}`,
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
          <Section id="ask" title="Ask to buy something">
            <ActForm
              action={requestPurchaseAction}
              hidden={{}}
              act="ask"
              label="Ask for it"
              primary
              tight={false}
            >
              <div className="form-grid">
                <Field id="purchase-vendor" label="From">
                  <Input
                    id="purchase-vendor"
                    name="vendor_name"
                    maxLength={160}
                    placeholder="Who sells it"
                  />
                </Field>
                <Field id="purchase-category" label="Kind">
                  <Select id="purchase-category" name="category" defaultValue="software">
                    {board.categories.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
              <Field id="purchase-description" label="What it is and why">
                <Input id="purchase-description" name="description" maxLength={1000} />
              </Field>
              <div className="form-grid">
                <Field id="purchase-amount" label="Cost">
                  <Input
                    id="purchase-amount"
                    name="amount"
                    inputMode="decimal"
                    maxLength={24}
                    placeholder="120.00"
                  />
                </Field>
                <Field id="purchase-currency" label="Currency">
                  <Input id="purchase-currency" name="currency" maxLength={3} defaultValue="USD" />
                </Field>
              </div>
              <div className="form-grid">
                <Field id="purchase-billing" label="Paid">
                  <Select id="purchase-billing" name="billing" defaultValue="one_off">
                    {board.billing.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="purchase-needed" label="Needed by">
                  <Input id="purchase-needed" name="needed_by" type="date" />
                </Field>
              </div>
            </ActForm>
          </Section>
        </div>
      )}
    </>
  );
}
