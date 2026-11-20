import Link from "next/link";

import { AssuranceTabs } from "@/components/data/assurance/assurance-tabs";
import { DataUnavailable } from "@/components/data/data-down";
import { ControlRefNote } from "@/components/data/security/control-ref";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readProfiles } from "@/lib/data/api/profiles";
import { dayWords } from "@/lib/data/labels-company";
import { NOT_ADVICE } from "@/lib/data/labels-controls";
import { CUSTOMERS_EMPTY, NOT_APPLIED } from "@/lib/data/labels-questionnaires";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";

import "@/components/data/closing/closing.css";
import "@/components/data/questionnaires/questionnaires.css";

export const metadata = { title: "Customer duties" };
export const dynamic = "force-dynamic";

const BASE = "/data/assurance/customers";
const ABOUT = `Each regulated customer's rules and the duties its contract passes to you, from the firm's regulatory profile. A duty marked as in the contract, on a profile that applies by today, can make a finding's fix-by day earlier. ${NOT_ADVICE}`;

const COLUMNS = [
  { key: "firm", label: "Firm", width: "24%" },
  { key: "rules", label: "Rules" },
  { key: "in_contract", label: "In the contract", align: "end" as const },
  { key: "unchecked", label: "Not checked", align: "end" as const },
  { key: "applies", label: "Applies from" },
];

export default async function CustomerDutiesPage() {
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(readProfiles) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Customer duties"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">{formatNumber(data.counts.profiles)} customers</span>
          ) : undefined
        }
        actions={
          data && data.profiles.length > 0 ? (
            <a className="btn btn--small" href={`${BASE}/export`}>
              Export CSV
            </a>
          ) : undefined
        }
      />
      <div className="page-content">
        <AssuranceTabs current="customers" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-profile">
            <p className="page-note">
              <ControlRefNote refs={["cscrf", "dora_30"]} />
            </p>
            <DataTable
              caption="Customer duties"
              columns={COLUMNS}
              isEmpty={read.data.profiles.length === 0}
              empty={<p className="page-note">{CUSTOMERS_EMPTY}</p>}
            >
              {read.data.profiles.map((row) => (
                <tr key={row.profile_id}>
                  <td>
                    <Link className="table-title" href={row.href}>
                      {row.firm}
                    </Link>
                  </td>
                  <td>{row.rules}</td>
                  <td className="data-table__num">
                    {formatNumber(row.in_contract)} of {formatNumber(row.duties)}
                  </td>
                  <td className="data-table__num">
                    {row.unchecked > 0 ? (
                      <span className="hqdata-attention">{formatNumber(row.unchecked)}</span>
                    ) : (
                      "0"
                    )}
                  </td>
                  <td>
                    {row.applies_from ? (
                      dayWords(row.applies_from)
                    ) : (
                      <span className="table-sub">{NOT_APPLIED}</span>
                    )}
                  </td>
                </tr>
              ))}
            </DataTable>
          </div>
        )}
      </div>
    </>
  );
}
