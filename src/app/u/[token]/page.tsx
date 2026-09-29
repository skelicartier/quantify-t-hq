import type { Metadata } from "next";

import { stopMailAction } from "@/app/u/[token]/actions";
import { AuthLegal } from "@/components/auth/auth-shell";
import { UnsubscribeChoices } from "@/components/mail/unsubscribe-choices";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readUnsubscribe, type UnsubscribeView } from "@/lib/api/mail";
import { firstSearchValue } from "@/lib/search-params";

export const dynamic = "force-dynamic";

// A stop link is for the person it was sent to, not for search engines.
export const metadata: Metadata = {
  title: "Email preferences",
  robots: { index: false, follow: false },
};

type UnsubscribePageProps = {
  params: Promise<{ token: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * Where the footer link lands. Opening it changes nothing — mail scanners open every
 * link — and one press stops everything, at once.
 */
export default async function UnsubscribePage({ params, searchParams }: UnsubscribePageProps) {
  const { token } = await params;
  const showChoices = firstSearchValue((await searchParams).choose) === "1";
  let view: UnsubscribeView | null = null;
  let problem: "invalid" | "unavailable" | null = null;
  try {
    view = await readUnsubscribe(token);
  } catch (error) {
    if (error instanceof HqApiRequestError) problem = "invalid";
    else if (error instanceof HqApiUnavailableError) problem = "unavailable";
    else throw error;
  }
  const already =
    view && (view.kind === "sales" ? view.sales_stop : view.marketing_state === "unsubscribed");
  return (
    <main className="auth" id="main-content">
      <section className="auth__panel" aria-labelledby="unsub-heading">
        <div className="auth__brand">
          <a
            className="auth__wordmark"
            href="https://www.quantifyterminal.com"
            aria-label="Quantify Terminal"
          >
            <span>Quantify</span>
            <span>Terminal</span>
          </a>
        </div>
        <div className="auth__header">
          <p className="eyebrow">Email preferences</p>
          <h1 className="auth__title" id="unsub-heading">
            {view === null
              ? problem === "unavailable"
                ? "Not available just now"
                : "This link is not valid"
              : already
                ? "You are unsubscribed"
                : view.kind === "sales"
                  ? "Stop these emails?"
                  : "Unsubscribe?"}
          </h1>
          <p className="auth__desc">
            {view === null
              ? problem === "unavailable"
                ? "Your choice could not be loaded. Try again shortly; the mailbox's own Unsubscribe button also works."
                : "Use the link in the email itself; it is made for your address alone."
              : already
                ? `Nothing more is sent to ${view.email}. If a message arrives from us anyway, reply and tell us.`
                : view.kind === "sales"
                  ? `One press and no one from Quantify Terminal writes to ${view.email} like this again.`
                  : `One press and ${view.email} gets no more announcements, updates or invitations from Quantify Terminal. Account and security notices still arrive.`}
          </p>
        </div>
        {view && !already && (
          <UnsubscribeChoices
            action={stopMailAction}
            token={token}
            kind={view.kind}
            topics={view.topics}
            showChoices={showChoices}
          />
        )}
      </section>
      <AuthLegal />
    </main>
  );
}
