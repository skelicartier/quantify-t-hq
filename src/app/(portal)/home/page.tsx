import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { requireStaff, hasCapability } from "@/lib/access/core";

export const metadata = { title: "Today" };
export const dynamic = "force-dynamic";

/**
 * The attention surface. Each card fills in as its module lands; until then it says
 * honestly what will create its data, because a dashboard of silent zeros teaches
 * people to stop looking at it.
 */
export default async function HomePage() {
  const context = await requireStaff("/home");
  const crm = hasCapability(context, "crm:read");
  const desk = hasCapability(context, "tickets:read");
  return (
    <>
      <PageHeader eyebrow="Command" title="Today" description="What needs a person, first." />
      <div className="card-grid">
        <Card title="Meetings today">
          <EmptyState
            title="Nothing scheduled"
            description="Booked demos and calls appear here once the calendar is connected."
          />
        </Card>
        {crm && (
          <Card title="Needs first reply">
            <EmptyState
              title="No lead is waiting"
              description="Early-access requests land here the moment website intake is connected."
            />
          </Card>
        )}
        <Card title="Overdue tasks">
          <EmptyState title="Nothing overdue" description="Tasks arrive with the CRM." />
        </Card>
        {crm && (
          <Card title="Deals needing attention">
            <EmptyState
              title="Pipeline is empty"
              description="Deals appear when the first lead is qualified."
            />
          </Card>
        )}
        {desk && (
          <Card title="Tickets near breach">
            <EmptyState
              title="No ticket is close to breach"
              description="The support desk moves here from the console next."
            />
          </Card>
        )}
      </div>
      <Callout tone="neutral" className="home-first-run">
        HQ is new and empty. It fills module by module — the support desk first, then leads,
        companies and deals. Your sign-in, sessions and staff administration are live now:{" "}
        <Link href="/me/security">review your security</Link>.
      </Callout>
    </>
  );
}
