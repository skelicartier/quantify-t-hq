import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { acceptQuoteAction, declineQuoteAction } from "@/app/q/[token]/actions";
import { Letterhead } from "@/components/documents/letterhead";
import { QuoteAnswer } from "@/components/deals/quote-answer";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { QUOTE_TOKEN, readPublicQuote, type PublicQuote } from "@/lib/api/quotes";
import { formatDate, formatMoneyExact } from "@/lib/format";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Your quote from Quantify Terminal",
  robots: { index: false, follow: false },
};

type Params = Promise<{ token: string }>;

/**
 * A quote as its customer reads it: the order form on the letterhead, and the answer —
 * accept or decline — on the same page. The token in the address is the key; an unknown,
 * ended or revoked link is a 404 that says nothing about which links exist.
 */
export default async function CustomerQuotePage({ params }: { params: Params }) {
  const { token } = await params;
  if (!QUOTE_TOKEN.test(token)) notFound();
  let view: PublicQuote | null = null;
  try {
    view = await readPublicQuote(token);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (view === null) {
    return (
      <main className="status-public" id="main-content">
        <div className="status-banner status-banner--degraded">
          <strong>Your quote could not be read just now.</strong>
          <span>That is a problem on our side. Try the link again shortly.</span>
        </div>
      </main>
    );
  }
  const { quote } = view;
  const money = (value: number) => formatMoneyExact(value, quote.currency);
  const recurring = quote.lines.filter((line) => line.kind === "recurring");
  const oneOff = quote.lines.filter((line) => line.kind === "one_off");
  return (
    <main className="status-public quote-public" id="main-content">
      <article className="order-form" aria-label={`Quote ${quote.number}`}>
        <div className="order-form__letterhead">
          <Letterhead head={view.letterhead} />
        </div>
        <header className="order-form__head">
          <div>
            <p className="order-form__label">Quote</p>
            <h1 className="order-form__number">{quote.number}</h1>
            {quote.title && <p className="order-form__title">{quote.title}</p>}
          </div>
          <dl className="order-form__meta">
            <div>
              <dt>For</dt>
              <dd>{quote.customer || "—"}</dd>
            </div>
            <div>
              <dt>Term</dt>
              <dd>{quote.term_months} months</dd>
            </div>
            <div>
              <dt>Valid until</dt>
              <dd>{formatDate(quote.valid_until, "—")}</dd>
            </div>
          </dl>
        </header>
        <div className="order-form__scroll">
          <table className="order-form__lines">
            <caption className="sr-only">What the quote is for</caption>
            <thead>
              <tr>
                <th scope="col">What</th>
                <th scope="col" className="order-form__num">
                  Quantity
                </th>
                <th scope="col" className="order-form__num">
                  Price
                </th>
                <th scope="col" className="order-form__num">
                  Total
                </th>
              </tr>
            </thead>
            <tbody>
              {[...recurring, ...oneOff].map((line, index) => (
                <tr key={`${line.description}-${index}`}>
                  <td>
                    {line.description}
                    <span className="table-sub">
                      {line.kind === "recurring" ? "Each month" : "Once"}
                    </span>
                  </td>
                  <td className="order-form__num">{line.quantity}</td>
                  <td className="order-form__num">{money(line.unit_price)}</td>
                  <td className="order-form__num">{money(line.total)}</td>
                </tr>
              ))}
              <tr>
                <td colSpan={3}>Each month</td>
                <td className="order-form__num">{money(quote.net_recurring)}</td>
              </tr>
              {quote.net_one_off > 0 && (
                <tr>
                  <td colSpan={3}>Once, at the start</td>
                  <td className="order-form__num">{money(quote.net_one_off)}</td>
                </tr>
              )}
              <tr className="order-form__total">
                <td colSpan={3}>The first {quote.term_months} months</td>
                <td className="order-form__num">{money(quote.first_term_value)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        {quote.terms && <p className="order-form__terms prewrap">{quote.terms}</p>}
      </article>
      {view.state === "open" ? (
        <QuoteAnswer
          token={token}
          customer={quote.customer}
          acceptAction={acceptQuoteAction}
          declineAction={declineQuoteAction}
        />
      ) : (
        <div className="status-banner" role="status">
          <strong>
            {view.state === "accepted"
              ? `Accepted${view.signer_name ? ` by ${view.signer_name}` : ""}${view.signed_on ? ` on ${formatDate(view.signed_on)}` : ""}.`
              : view.state === "declined"
                ? "Declined."
                : view.state === "expired"
                  ? `This quote ran to ${formatDate(quote.valid_until, "its date")}.`
                  : "This quote is no longer open."}
          </strong>
          <span>
            {view.state === "accepted"
              ? "Thank you. We will be in touch about getting started."
              : "Write to whoever sent it if anything has changed."}
          </span>
        </div>
      )}
    </main>
  );
}
