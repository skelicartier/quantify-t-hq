import type { ReactNode } from "react";

import { ButtonLink } from "@/components/ui/button";
import { capabilityLabel } from "@/lib/product/role-labels";

type GateAccess = {
  status: "authorized" | "forbidden" | "mfa-required" | "capability-required" | "not-found";
  capability?: string;
};

type AdminGateProps = {
  access: GateAccess;
  /** Human name of the page, used in the "X is not available" heading. */
  section: string;
  children: ReactNode;
};

function GateCard({
  id,
  title,
  body,
  actions,
}: {
  id: string;
  title: string;
  body: string;
  actions: ReactNode;
}) {
  return (
    <section className="card page-state" aria-labelledby={id}>
      <h2 id={id}>{title}</h2>
      <p className="card__desc">{body}</p>
      <div className="page-state__actions">{actions}</div>
    </section>
  );
}

/**
 * Renders privileged content only when the loader authorized it; otherwise one calm,
 * product-facing explanation with the single most useful next step.
 */
export function AdminGate({ access, section, children }: AdminGateProps) {
  switch (access.status) {
    case "authorized":
      return <>{children}</>;
    case "forbidden":
      return (
        <GateCard
          id="admin-gate-forbidden"
          title="Your linked account has no product staff role"
          body="Your linked Quantify Terminal account is active, but it holds no staff role in the product. If you expected one, ask an owner to grant it."
          actions={<ButtonLink href="/home">Return to Home</ButtonLink>}
        />
      );
    case "mfa-required":
      return (
        <GateCard
          id="admin-gate-mfa"
          title="A verified second factor is required"
          body="Confirm your code again before these views open."
          actions={
            <ButtonLink href="/me/security" variant="primary">
              Open my security
            </ButtonLink>
          }
        />
      );
    case "capability-required":
      return (
        <GateCard
          id="admin-gate-capability"
          title={`${section} is not available`}
          body={`Your role doesn't include ${access.capability ? capabilityLabel(access.capability).toLowerCase() : "this permission"}. Ask an owner to grant it.`}
          actions={<ButtonLink href="/product">Return to the overview</ButtonLink>}
        />
      );
    case "not-found":
      return (
        <GateCard
          id="admin-gate-not-found"
          title="No account record was found"
          body="The account may have been removed, or the link may be out of date."
          actions={<ButtonLink href="/product/users">Return to accounts</ButtonLink>}
        />
      );
    default:
      return null;
  }
}
