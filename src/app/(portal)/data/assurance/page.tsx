import { DataUnavailable } from "@/components/data/data-down";
import { AssuranceTabs } from "@/components/data/assurance/assurance-tabs";
import { SummaryTables } from "@/components/data/assurance/summary-tables";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readAssuranceSummary } from "@/lib/data/api/assurance";
import { NOT_ADVICE } from "@/lib/data/labels-controls";
import { dataRead } from "@/lib/data/read";

import "./assurance.css";

export const metadata = { title: "Assurance" };
export const dynamic = "force-dynamic";

const BASE = "/data/assurance";
const ABOUT = `Where the company stands on what a buyer's security review asks for: the systems, the policies, the tests and findings, certification, insurance, reviews and what customers pass down, each a sentence and a link. ${NOT_ADVICE}`;

/**
 * Assurance › Summary (ws-notes/security/spec.md §8.6): three tables, Systems, Assurance and
 * Buyers, a row per line each module gives, the attention words as a pill, a module not
 * loaded here as its row. The service is asked with the Owner flag only when the role is
 * Owner; an Admin reads the line that the people ledger's part is left out.
 */
export default async function AssurancePage() {
  const { context, allowed } = await requireData(BASE);
  const owner = context.me.role === "owner";
  const read = allowed ? await dataRead(() => readAssuranceSummary(owner)) : null;
  return (
    <>
      <PageHeader title="Assurance" description={ABOUT} />
      <div className="page-content">
        <AssuranceTabs current="summary" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-assurance">
            <SummaryTables summary={read.data} owner={owner} />
            <p className="page-note">{NOT_ADVICE}</p>
          </div>
        )}
      </div>
    </>
  );
}
