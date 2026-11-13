import { DataUnavailable } from "@/components/data/data-down";
import { PrintButton } from "@/components/documents/print-button";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readForInvestors, type InvestorPage, type StageCounts } from "@/lib/data/api/waitlist";
import { WAITLIST_PROOF, WAITLIST_STAGES, WAITLIST_STAGE_ORDER } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatDate, formatNumber } from "@/lib/format";

import "../waitlist.css";

export const metadata = { title: "Waitlist for investors" };
export const dynamic = "force-dynamic";

const BASE = "/data/waitlist/for-investors";
const EXPORT = "/data/waitlist/export";
const DEFINITIONS =
  "A firm joins the waitlist when someone there replies yes in writing to our email, or says so on a call. Each firm counts once. Dates are the reply's own date. Stages: Call booked, Call held, Pilot, Customer; Dropped is kept and shown.";

const COLUMNS = [
  { key: "joined", label: "Joined" },
  { key: "firm", label: "Firm", width: "20%" },
  { key: "type", label: "Firm type" },
  { key: "place", label: "Place" },
  { key: "role", label: "Contact's role" },
  { key: "how", label: "How they joined" },
  { key: "stage", label: "Stage" },
  { key: "since", label: "Since" },
  { key: "proof", label: "Proof" },
];

/**
 * The waitlist as an investor may read it, made to print: the definitions first, the counts
 * as words, then one row per firm. The service builds these rows itself; none of them
 * carries an address, a person's name, a phone or the quote, and a firm is named only when
 * "Name the firm" was chosen for it.
 */
export default async function ForInvestorsPage() {
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(readForInvestors) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Waitlist for investors"
        actions={
          data ? (
            <>
              <PrintButton />
              <a className={buttonClass({ size: "small" })} href={`${EXPORT}?kind=investors`}>
                Download (CSV)
              </a>
            </>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <ForInvestors page={read.data} />
        )}
      </div>
    </>
  );
}

function countsLine(counts: StageCounts): string {
  return WAITLIST_STAGE_ORDER.map(
    (stage) => `${WAITLIST_STAGES[stage].label} ${formatNumber(counts[stage])}`,
  ).join(" · ");
}

function ForInvestors({ page }: { page: InvestorPage }) {
  return (
    <div className="hqdata-investors">
      <p className="hqdata-investors__asof">As of {formatDate(page.as_of)}</p>
      <p className="hqdata-investors__definitions">{DEFINITIONS}</p>
      <dl className="hqdata-readouts-line">
        <div>
          <dt>Now at</dt>
          <dd>{countsLine(page.now)}</dd>
        </div>
        <div>
          <dt>Ever reached</dt>
          <dd>{countsLine(page.ever)}</dd>
        </div>
      </dl>
      <DataTable
        caption="Waitlist for investors"
        columns={COLUMNS}
        scroll={false}
        columnMenu={false}
        isEmpty={page.rows.length === 0}
        empty={
          <EmptyState
            compact
            title="No firm on the waitlist yet"
            description="A firm joins when someone there replies yes in writing, or says so on a call."
          />
        }
      >
        {page.rows.map((row, index) => (
          <tr key={`${row.joined_on}-${index}`}>
            <td className="nowrap">{formatDate(row.joined_on)}</td>
            <td>{row.firm}</td>
            <td>{row.firm_type || <span className="table-sub">Not given</span>}</td>
            <td>{row.place || <span className="table-sub">Not given</span>}</td>
            <td>{row.contact_role || <span className="table-sub">Not given</span>}</td>
            <td>{row.how_joined || <span className="table-sub">Not given</span>}</td>
            <td className="nowrap">{WAITLIST_STAGES[row.stage].label}</td>
            <td className="nowrap">{formatDate(row.since)}</td>
            <td>
              {WAITLIST_PROOF[row.proof]}, {formatDate(row.proof_on)}
            </td>
          </tr>
        ))}
      </DataTable>
    </div>
  );
}
