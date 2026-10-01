import Link from "next/link";

import { PipelineTabs } from "@/components/deals/pipeline-tabs";
import { QuoteStatePill } from "@/components/deals/quote-parts";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { QUOTE_VIEWS, readQuotes, type QuotesList, type QuoteView } from "@/lib/api/quotes";
import { formatDate, formatMoneyExact } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Quotes" };
export const dynamic = "force-dynamic";

const VIEW_LABELS: Record<QuoteView, string> = {
  open: "Open",
  waiting: "Waiting on you",
  mine: "Yours",
  all: "All",
};

const COLUMNS = [
  { key: "number", label: "Quote" },
  { key: "deal", label: "Deal" },
  { key: "state", label: "State" },
  { key: "month", label: "A month", align: "end" as const },
  { key: "term", label: "First term", align: "end" as const },
  { key: "off", label: "Deepest discount", align: "end" as const },
  { key: "valid", label: "Valid until" },
  { key: "by", label: "Made by" },
];

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Every quote in one list: those waiting on you first, then the ones still moving. A quote
 * is made from its deal; this is where the approvals are found.
 */
export default async function QuotesPage({ searchParams }: Props) {
  const context = await requireStaff("/deals/quotes");
  const asked = firstSearchValue((await searchParams).view);
  const view: QuoteView = (QUOTE_VIEWS as readonly string[]).includes(asked ?? "")
    ? (asked as QuoteView)
    : "open";
  if (!hasCapability(context, "revenue:read")) {
    return (
      <>
        <PageHeader
          eyebrow="Deals"
          title="Quotes"
          actions={<PipelineTabs current="/deals/quotes" />}
        />
        <Callout tone="neutral">Quotes are money: your role reads the pipeline without it.</Callout>
      </>
    );
  }
  let list: QuotesList | null = null;
  try {
    list = await readQuotes(context.token, view);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Deals"
        title="Quotes"
        description="Order forms on deals, with the approval a discount needs: up to 10 % its author sends it; above that a second person approves, and above 25 % an owner or admin. Made from a deal's Quotes tab."
        actions={<PipelineTabs current="/deals/quotes" />}
      />
      {list === null ? (
        <Callout tone="danger" role="alert">
          The quotes could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <SegmentedLinks
            label="Which quotes"
            items={QUOTE_VIEWS.map((key) => ({
              href: key === "open" ? "/deals/quotes" : `/deals/quotes?view=${key}`,
              label: `${VIEW_LABELS[key]} ${list.counts[key]}`,
              current: key === view,
            }))}
          />
          <Section id="quotes" title={VIEW_LABELS[view]}>
            <DataTable
              caption="Quotes, those waiting on you first"
              columns={COLUMNS}
              isEmpty={list.quotes.length === 0}
              empty={
                <p className="muted">
                  {view === "waiting" ? "Nothing is waiting on you." : "No quotes here."}
                </p>
              }
            >
              {list.quotes.map((quote) => (
                <tr key={quote.quote_id}>
                  <td>
                    <Link href={`/deals/${quote.deal_id}/quotes/${quote.quote_id}`}>
                      {quote.number}
                    </Link>
                    <span className="quiet"> · {quote.title}</span>
                  </td>
                  <td>
                    <Link href={`/deals/${quote.deal_id}?tab=quotes`}>
                      {quote.deal_name || "Deal"}
                    </Link>
                    {quote.company_name && <span className="quiet"> · {quote.company_name}</span>}
                  </td>
                  <td>
                    <QuoteStatePill
                      state={quote.state}
                      label={quote.waiting_on_you ? "Waiting on you" : quote.state_label}
                    />
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
          </Section>
        </div>
      )}
    </>
  );
}
