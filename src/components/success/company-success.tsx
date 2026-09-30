import Link from "next/link";

import { SignalList } from "@/components/success/signal-list";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanySuccess, type CompanySuccess as Success } from "@/lib/api/success";
import { formatDate } from "@/lib/format";

/**
 * A firm's customer-success page: seats paid against seats used, the signals with their
 * rule and evidence, their onboarding, and what they have asked us for.
 */
export async function CompanySuccess({ token, companyId }: { token: string; companyId: string }) {
  let page: Success | null = null;
  try {
    page = await readCompanySuccess(token, companyId);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (page === null) {
    return (
      <Callout tone="danger" role="alert">
        Their usage could not be read just now.
      </Callout>
    );
  }
  const { customer } = page;
  return (
    <div className="page-content">
      {!page.customer_of_ours && (
        <Callout tone="neutral" compact>
          No contract in force, so there are no paid seats to measure against.
        </Callout>
      )}
      <Card
        title="Usage"
        titleAs="h3"
        description={`${customer.usage.active_30d} of ${customer.usage.seats_paid} paid seats signed in within 30 days · ${customer.usage.accounts} product account${customer.usage.accounts === 1 ? "" : "s"} linked`}
      >
        <ul className="match-list">
          <li className="match-list__row">
            <span className="match-list__what">Last sign-in</span>
            <span>
              {customer.usage.last_sign_in
                ? formatDate(customer.usage.last_sign_in)
                : "Never, or no account linked"}
            </span>
          </li>
          <li className="match-list__row">
            <span className="match-list__what">Renews</span>
            <span>
              {formatDate(customer.renews_on, "—")}
              {customer.notice_date && (
                <span className="quiet"> · notice by {formatDate(customer.notice_date)}</span>
              )}
            </span>
          </li>
        </ul>
      </Card>
      <Card
        title="Signals"
        titleAs="h3"
        description="Each with its rule and its evidence. They clear themselves when the rule stops matching."
      >
        <SignalList signals={customer.signals} />
      </Card>
      <Card title="Onboarding" titleAs="h3">
        {page.onboardings.length === 0 ? (
          <p className="muted">
            None recorded. <Link href="/success/onboarding">Start one</Link>.
          </p>
        ) : (
          page.onboardings.map((row) => (
            <p key={row.id} className="clock-line">
              {row.status === "live"
                ? `Live ${formatDate(row.live_on)}`
                : `Onboarding since ${formatDate(row.starts_on)}`}{" "}
              · {row.steps_done} of {row.steps.length} steps done
              {row.durations.total !== null && ` · start to live ${row.durations.total} days`}
            </p>
          ))
        )}
      </Card>
      <Card title="What they asked for" titleAs="h3">
        {page.asks.length === 0 ? (
          <p className="muted">Nothing recorded.</p>
        ) : (
          <ul className="match-list">
            {page.asks.map((ask, index) => (
              <li key={`${ask.request_id}-${index}`} className="match-list__row">
                <span className="match-list__what">
                  <Link href={`/success/requests/${ask.request_id}`}>{ask.title}</Link>
                </span>
                <span>
                  “{ask.quote}”{" "}
                  <span className="quiet">
                    · {ask.importance} · {ask.status}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
