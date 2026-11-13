import Link from "next/link";

import { Callout } from "@/components/ui/callout";
import { hasCapability, type StaffContext } from "@/lib/access/core";
import { dataConfigured } from "@/lib/data/socket";

/**
 * The CRM's leads pages run on the service; the leads Mail merge writes to are kept on
 * this computer, in Data. Shown on Leads and Prospects only where Data exists and to the
 * people who may open it, so nobody is sent to a page that refuses them.
 */
export function AllLeadsCallout({ context }: { context: StaffContext }) {
  if (!dataConfigured() || !hasCapability(context, "mail:send")) return null;
  return (
    <Callout tone="neutral">
      The leads you write to, with what Mail merge sent them, are in All leads under Data.{" "}
      <Link className="text-link" href="/data/leads">
        Open All leads
      </Link>
    </Callout>
  );
}
