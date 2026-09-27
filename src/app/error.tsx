"use client";

import { AuthLegal } from "@/components/auth/auth-shell";
import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

/**
 * Root boundary.
 *
 * A segment's own `error.tsx` wraps that segment's children, not its layout, so a
 * throw from `src/app/account/layout.tsx` — where `requireCurrentAccount()` runs —
 * can only be caught here. Availability failures such as a provider outage, an
 * unusable identity, or a failed server-client factory therefore render this page
 * instead of falsely redirecting an authenticated visitor to the login route.
 * Only the generic message is shown; no provider detail is rendered.
 */
export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="auth auth--console" id="main-content">
      <section className="auth__panel" aria-labelledby="root-error-heading">
        <div className="auth__header">
          <h1 className="auth__title" id="root-error-heading">
            This secure view could not load
          </h1>
          <p className="auth__desc">
            The account service did not finish the request, so no changes were applied. Your current
            session remains protected.
          </p>
        </div>
        <div className="auth-form">
          <Callout tone="danger" compact className="auth__note">
            Refresh to try again. If the problem continues, sign in again from the login page.
          </Callout>
          <Button variant="primary" block onClick={() => reset()}>
            Refresh
          </Button>
          <ButtonLink href="/login" block>
            Go to sign in
          </ButtonLink>
        </div>
        {error.digest && <p className="auth__note quiet">Reference {error.digest}</p>}
      </section>
      <AuthLegal />
    </main>
  );
}
