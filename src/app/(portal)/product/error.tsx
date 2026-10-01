"use client";

import { Button, ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";

/** Segment boundary for the Product pages; renders inside the HQ shell. */
export default function AdminError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="page-state">
      <h1 id="admin-error-heading">This Product view could not load</h1>
      <div className="page-content">
        <Callout tone="danger" title="No administrative data was shown">
          The privileged check did not complete, so nothing was changed. Refresh to try again. If it
          keeps failing, the account service may be recovering; check back in a minute.
        </Callout>
      </div>
      <div className="page-state__actions">
        <Button variant="primary" onClick={() => reset()}>
          Refresh
        </Button>
        <ButtonLink href="/product">Overview</ButtonLink>
        <ButtonLink href="/home">Return to Home</ButtonLink>
      </div>
      {error.digest && <p className="page-state__ref">Reference {error.digest}</p>}
    </div>
  );
}
