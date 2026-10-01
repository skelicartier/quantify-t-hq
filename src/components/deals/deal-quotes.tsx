import Link from "next/link";

import { createQuoteAction } from "@/app/(portal)/deals/quote-actions";
import { QuoteStatePill } from "@/components/deals/quote-parts";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDealQuotes, type DealQuotes } from "@/lib/api/quotes";
import { formatDate, formatMoneyExact } from "@/lib/format";

const COLUMNS = [
  { key: "number", label: "Quote" },
  { key: "state", label: "State" },
  { key: "month", label: "A month", align: "end" as const },
  { key: "term", label: "First term", align: "end" as const },
  { key: "off", label: "Deepest discount", align: "end" as const },
  { key: "valid", label: "Valid until" },
  { key: "by", label: "Made by" },
];

/**
 * The deal's quotes, newest first, with the one it follows marked; and a new one, started
 * from the deal's plan at its seats and the list price.
 */
export async function DealQuotesSection({
  token,
  dealId,
  today,
}: {
  token: string;
  dealId: string;
  today: string;
}) {
  let board: DealQuotes | null = null;
  try {
    board = await readDealQuotes(token, dealId);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (board === null) {
    return (
      <RecordSection id="deal-quotes" title="Quotes">
        <Callout tone="danger" role="alert">
          The quotes could not be read just now.
        </Callout>
      </RecordSection>
    );
  }
  const inThirty = new Date(Date.parse(`${today}T00:00:00Z`) + 30 * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return (
    <RecordSection
      id="deal-quotes"
      title="Quotes"
      actions={
        board.can_create ? (
          <Popover label="New quote" variant="primary" width="wide">
            <ActForm
              action={createQuoteAction}
              hidden={{ deal_id: dealId }}
              act="create"
              label="Start the quote"
              primary
              tight={false}
            >
              <p className="muted">
                It starts from the deal&apos;s plan at its seats and the list price. Up to{" "}
                {board.peer_above}% off, you send it yourself; above that a second person approves,
                and above {board.admin_above}% an owner or admin.
              </p>
              <Field id="quote-new-title" label="Title">
                <Input
                  id="quote-new-title"
                  name="title"
                  maxLength={160}
                  placeholder="Two desks for a year"
                />
              </Field>
              <div className="form-grid">
                <Field id="quote-new-term" label="Term (months)">
                  <Input
                    id="quote-new-term"
                    name="term_months"
                    type="number"
                    min={1}
                    max={60}
                    defaultValue={12}
                  />
                </Field>
                <Field id="quote-new-valid" label="Valid until">
                  <Input
                    id="quote-new-valid"
                    name="valid_until"
                    type="date"
                    min={today}
                    defaultValue={inThirty}
                  />
                </Field>
              </div>
            </ActForm>
          </Popover>
        ) : undefined
      }
    >
      <DataTable
        caption="This deal's quotes, newest first"
        columns={COLUMNS}
        isEmpty={board.quotes.length === 0}
        empty={<p className="muted">No quote on this deal yet.</p>}
        columnMenu={false}
      >
        {board.quotes.map((quote) => (
          <tr key={quote.quote_id}>
            <td>
              <Link href={`/deals/${dealId}/quotes/${quote.quote_id}`}>{quote.number}</Link>
              <span className="quiet"> · {quote.title}</span>
              {quote.is_primary && <span className="quiet"> · the deal&apos;s quote</span>}
            </td>
            <td>
              <QuoteStatePill state={quote.state} label={quote.state_label} />
            </td>
            <td className="data-table__num">
              {formatMoneyExact(quote.net_recurring, quote.currency)}
            </td>
            <td className="data-table__num">
              {formatMoneyExact(quote.first_term_value, quote.currency)}
            </td>
            <td className="data-table__num">
              {quote.deepest_discount_pct > 0 ? `${quote.deepest_discount_pct}%` : "None"}
            </td>
            <td>{formatDate(quote.valid_until, "—")}</td>
            <td>{quote.created_by_name || "—"}</td>
          </tr>
        ))}
      </DataTable>
    </RecordSection>
  );
}
