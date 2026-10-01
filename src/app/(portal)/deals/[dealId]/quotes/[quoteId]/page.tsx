import Link from "next/link";
import { notFound } from "next/navigation";

import {
  actOnQuoteAction,
  saveQuoteLinesAction,
  updateQuoteTermsAction,
} from "@/app/(portal)/deals/quote-actions";
import { PrintButton } from "@/components/deals/print-button";
import { QuoteLinesEditor } from "@/components/deals/quote-lines-editor";
import { QuoteStatePill } from "@/components/deals/quote-parts";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Field, Input, Textarea } from "@/components/ui/field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readQuote, type QuoteRead } from "@/lib/api/quotes";
import { formatAbsolute, formatDate, formatMoneyExact } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Quote" };
export const dynamic = "force-dynamic";

type Params = Promise<{ dealId: string; quoteId: string }>;

const or = (names: string[]) =>
  names.length <= 1
    ? (names[0] ?? "nobody")
    : `${names.slice(0, -1).join(", ")} or ${names.at(-1)}`;

/**
 * One quote: the order form as the customer sees it, its lines and terms while it is being
 * worked on, and the one or two things that can happen to it next — asked for, approved,
 * sent, signed.
 */
export default async function QuotePage({ params }: { params: Params }) {
  const { dealId, quoteId } = await params;
  const context = await requireStaff(`/deals/${dealId}/quotes/${quoteId}`);
  if (!hasCapability(context, "revenue:read")) {
    return (
      <>
        <PageHeader eyebrow="Deals" title="Quote" />
        <Callout tone="neutral">Quotes are money: your role reads the pipeline without it.</Callout>
      </>
    );
  }
  let read: QuoteRead | null = null;
  try {
    read = await readQuote(context.token, quoteId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (read === null) {
    return (
      <>
        <PageHeader eyebrow="Deals" title="Quote" />
        <Callout tone="danger" role="alert">
          This quote could not be read just now.
        </Callout>
      </>
    );
  }
  const { quote, plans, peer_above: peerAbove, admin_above: adminAbove } = read;
  if (quote.deal_id !== dealId) notFound();
  const money = (value: number) => formatMoneyExact(value, quote.currency);
  const hidden = { deal_id: dealId, quote_id: quote.quote_id };
  const can = quote.can;
  const today = new Date(requestNow()).toISOString().slice(0, 10);
  const anyAct =
    can.submit ||
    can.recall ||
    can.approve ||
    can.request_changes ||
    can.publish ||
    can.accept ||
    can.decline ||
    can.make_primary ||
    can.revise ||
    can.withdraw;

  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/deals/quotes", label: "Quotes" },
          { href: `/deals/${dealId}?tab=quotes`, label: quote.deal_name || "Deal" },
        ]}
        title={`${quote.number} · ${quote.title}`}
        status={<QuoteStatePill state={quote.state} label={quote.state_label} />}
        readouts={[
          { label: "A month", value: money(quote.net_recurring) },
          { label: `First ${quote.term_months} months`, value: money(quote.first_term_value) },
          {
            label: "Deepest discount",
            value: quote.deepest_discount_pct > 0 ? `${quote.deepest_discount_pct}%` : "None",
          },
        ]}
      />
      {quote.state === "pending_approval" && (
        <Callout tone="attention" compact>
          {quote.waiting_on_you ? "Waiting on you" : `Waiting for ${or(quote.approvers)}`}.{" "}
          {quote.tier_reason}
        </Callout>
      )}
      {quote.state === "changes_requested" && (
        <Callout tone="attention" compact>
          {quote.decided_by_name} asked for changes: {quote.decision_note}
        </Callout>
      )}
      {quote.state === "approved" && (
        <Callout tone="neutral" compact>
          Approved by {quote.decided_by_name}, {formatAbsolute(quote.decided_at)}
          {quote.decision_note ? `: ${quote.decision_note}` : "."} Any change to a price or the
          terms cancels it.
        </Callout>
      )}
      {quote.state === "expired" && (
        <Callout tone="danger" compact>
          Expired on {formatDate(quote.valid_until)}. Revise it to send it again.
        </Callout>
      )}
      {quote.state === "declined" && (
        <Callout tone="neutral" compact>
          Declined: {quote.declined_reason}
        </Callout>
      )}
      {quote.list_changed && (
        <Callout tone="neutral" compact>
          The price list has changed since these lines were priced. The quote keeps the prices it
          was made with; a line added now takes today&apos;s.
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="Quote">
            <Property label="Deal">
              <Link href={`/deals/${dealId}`}>{quote.deal_name || "Deal"}</Link>
            </Property>
            <Property label="Firm">{quote.company_name || "—"}</Property>
            <Property label="Currency">{quote.currency}</Property>
            <Property label="Term">{quote.term_months} months</Property>
            <Property label="Valid until">{formatDate(quote.valid_until, "—")}</Property>
            <Property label="The deal's quote">{quote.is_primary ? "Yes" : "No"}</Property>
            <Property label="Approval">{quote.tier_label}</Property>
            <Property label="Made by">
              {quote.created_by_name || "—"}
              <span className="quiet"> · {formatDate(quote.created_at)}</span>
            </Property>
            {quote.published_at && (
              <Property label="Sent">
                {quote.published_by_name}
                <span className="quiet"> · {formatDate(quote.published_at)}</span>
              </Property>
            )}
          </Properties>
        }
      >
        <RecordSection id="order-form" title="The order form" actions={<PrintButton />}>
          <article className="order-form" aria-label={`Order form ${quote.number}`}>
            <header className="order-form__head">
              <div>
                <p className="order-form__label">Order form</p>
                <p className="order-form__number">{quote.number}</p>
              </div>
              <dl className="order-form__meta">
                <div>
                  <dt>For</dt>
                  <dd>{quote.company_name || quote.deal_name}</dd>
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
                <caption className="sr-only">The lines of {quote.number}</caption>
                <thead>
                  <tr>
                    <th scope="col">Item</th>
                    <th scope="col" className="order-form__num">
                      Quantity
                    </th>
                    <th scope="col" className="order-form__num">
                      List price
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
                  {quote.lines.length === 0 && (
                    <tr>
                      <td colSpan={5} className="muted">
                        No lines yet.
                      </td>
                    </tr>
                  )}
                  {quote.lines.map((line) => (
                    <tr key={line.line_id}>
                      <td>
                        {line.description}
                        <span className="quiet">
                          {" "}
                          · {line.kind === "recurring" ? "a month" : "once"}
                          {line.discount_pct > 0 ? ` · ${line.discount_pct}% off` : ""}
                        </span>
                      </td>
                      <td className="order-form__num">{line.quantity}</td>
                      <td className="order-form__num">{money(line.list_unit)}</td>
                      <td className="order-form__num">{money(line.unit_price)}</td>
                      <td className="order-form__num">{money(line.net_total)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <th scope="row" colSpan={4}>
                      A month
                    </th>
                    <td className="order-form__num">{money(quote.net_recurring)}</td>
                  </tr>
                  {quote.net_one_off > 0 && (
                    <tr>
                      <th scope="row" colSpan={4}>
                        Once
                      </th>
                      <td className="order-form__num">{money(quote.net_one_off)}</td>
                    </tr>
                  )}
                  <tr className="order-form__total">
                    <th scope="row" colSpan={4}>
                      The first {quote.term_months} months
                    </th>
                    <td className="order-form__num">{money(quote.first_term_value)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            {quote.terms && <p className="order-form__terms prewrap">{quote.terms}</p>}
            <div className="order-form__sign">
              {quote.state === "accepted" ? (
                <p>
                  Signed by <strong>{quote.signer_name}</strong>
                  {quote.signer_email ? ` (${quote.signer_email})` : ""} on{" "}
                  {formatDate(quote.signed_on)}
                  {quote.signature_ref ? `. The signed copy: ${quote.signature_ref}.` : "."}
                </p>
              ) : (
                <>
                  <p>Signed for {quote.company_name || "the customer"}</p>
                  <p className="order-form__line">Name</p>
                  <p className="order-form__line">Date</p>
                </>
              )}
            </div>
          </article>
        </RecordSection>

        {can.edit && (
          <RecordSection id="lines" title="Lines">
            <QuoteLinesEditor
              action={saveQuoteLinesAction}
              dealId={dealId}
              quoteId={quote.quote_id}
              currency={quote.currency}
              termMonths={quote.term_months}
              lines={quote.lines}
              plans={plans}
              peerAbove={peerAbove}
              adminAbove={adminAbove}
              disabled={false}
            />
          </RecordSection>
        )}

        {can.edit && (
          <RecordSection id="terms" title="Terms">
            <ActForm
              action={updateQuoteTermsAction}
              hidden={hidden}
              act="terms"
              label="Save the terms"
              tight={false}
            >
              <Field id="quote-title" label="Title">
                <Input id="quote-title" name="title" maxLength={160} defaultValue={quote.title} />
              </Field>
              <div className="form-grid">
                <Field id="quote-term" label="Term (months)">
                  <Input
                    id="quote-term"
                    name="term_months"
                    type="number"
                    min={1}
                    max={60}
                    defaultValue={quote.term_months}
                  />
                </Field>
                <Field id="quote-valid" label="Valid until">
                  <Input
                    id="quote-valid"
                    name="valid_until"
                    type="date"
                    min={today}
                    defaultValue={quote.valid_until ?? ""}
                  />
                </Field>
              </div>
              <Field
                id="quote-terms"
                label="Terms"
                hint="Payment, notice, anything the customer agrees to."
              >
                <Textarea
                  id="quote-terms"
                  name="terms"
                  rows={4}
                  maxLength={4000}
                  defaultValue={quote.terms}
                />
              </Field>
            </ActForm>
          </RecordSection>
        )}

        {anyAct && (
          <RecordSection id="next" title="Next">
            <div className="form-grid">
              {can.submit && (
                <Card title="Ask for approval" titleAs="h3" description={quote.tier_reason}>
                  <ActForm
                    action={actOnQuoteAction}
                    hidden={hidden}
                    act="submit"
                    label="Ask for approval"
                    primary
                  />
                </Card>
              )}
              {can.approve && (
                <Card
                  title="Approve"
                  titleAs="h3"
                  description="What was asked for is what goes out."
                >
                  <ActForm
                    action={actOnQuoteAction}
                    hidden={hidden}
                    act="approve"
                    label="Approve"
                    primary
                  >
                    <Field id="approve-note" label="Note">
                      <Input id="approve-note" name="note" maxLength={1000} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {can.request_changes && (
                <Card
                  title="Ask for changes"
                  titleAs="h3"
                  description="It goes back to its author with your note."
                >
                  <ActForm
                    action={actOnQuoteAction}
                    hidden={hidden}
                    act="request_changes"
                    label="Send it back"
                  >
                    <Field id="changes-note" label="What should change">
                      <Input id="changes-note" name="note" maxLength={1000} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {can.recall && (
                <Card
                  title="Recall it"
                  titleAs="h3"
                  description="Back to a draft; the approvers are no longer asked."
                >
                  <ActForm action={actOnQuoteAction} hidden={hidden} act="recall" label="Recall" />
                </Card>
              )}
              {can.publish && (
                <Card
                  title="Mark as sent"
                  titleAs="h3"
                  description="When the order form goes to the customer. Nothing on it changes after this."
                >
                  <ActForm
                    action={actOnQuoteAction}
                    hidden={hidden}
                    act="publish"
                    label="Mark as sent"
                    primary
                  />
                </Card>
              )}
              {can.accept && (
                <Card
                  title="Record the signature"
                  titleAs="h3"
                  description="Who signed, when, and where the signed copy is. The deal takes the signed monthly value."
                >
                  <ActForm
                    action={actOnQuoteAction}
                    hidden={hidden}
                    act="accept"
                    label="Record the signature"
                    primary
                  >
                    <Field id="signer-name" label="Signed by">
                      <Input id="signer-name" name="signer_name" maxLength={160} />
                    </Field>
                    <Field id="signer-email" label="Their email">
                      <Input id="signer-email" name="signer_email" type="email" maxLength={254} />
                    </Field>
                    <Field id="signed-on" label="Signed on">
                      <Input
                        id="signed-on"
                        name="signed_on"
                        type="date"
                        max={today}
                        defaultValue={today}
                      />
                    </Field>
                    <Field id="signature-ref" label="Where the signed copy is">
                      <Input id="signature-ref" name="signature_ref" maxLength={400} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {can.decline && (
                <Card title="They declined" titleAs="h3">
                  <ActForm
                    action={actOnQuoteAction}
                    hidden={hidden}
                    act="decline"
                    label="Record it"
                  >
                    <Field id="decline-reason" label="Why">
                      <Input id="decline-reason" name="reason" maxLength={400} />
                    </Field>
                  </ActForm>
                </Card>
              )}
              {can.revise && (
                <Card
                  title="Revise it"
                  titleAs="h3"
                  description="A new draft from these lines and terms."
                >
                  <ActForm action={actOnQuoteAction} hidden={hidden} act="revise" label="Revise" />
                </Card>
              )}
              {can.make_primary && (
                <Card
                  title="Make it the deal's quote"
                  titleAs="h3"
                  description="The one the deal follows."
                >
                  <ActForm
                    action={actOnQuoteAction}
                    hidden={hidden}
                    act="make_primary"
                    label="Make it the deal's"
                  />
                </Card>
              )}
              {can.withdraw && (
                <Card
                  title="Withdraw it"
                  titleAs="h3"
                  description="It stays on the deal, marked withdrawn."
                >
                  <ActForm
                    action={actOnQuoteAction}
                    hidden={hidden}
                    act="withdraw"
                    label="Withdraw"
                    danger
                  />
                </Card>
              )}
            </div>
          </RecordSection>
        )}
      </RecordGrid>
    </>
  );
}
