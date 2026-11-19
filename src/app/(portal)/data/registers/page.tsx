import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { RegistersTabs } from "@/components/data/registers/registers-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readRegisters, type RegistersSummary } from "@/lib/data/api/registers";
import { dayWords } from "@/lib/data/labels-company";
import { REGISTER_ABOUT, REGISTER_ROWS } from "@/lib/data/labels-security";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";

import "./registers.css";

export const metadata = { title: "Registers" };
export const dynamic = "force-dynamic";

const BASE = "/data/registers";
const ABOUT = `The company's registers of things with dates: incidents and their CERT-In clock, trademarks, domains and certificates, and holidays. Each view lists its own; this one says how many each holds and its next date. ${REGISTER_ABOUT}`;

/**
 * Registers › Summary (ws-notes/duties/spec.md §6.5): one table, four rows, each linking to
 * its view, with how many records it holds and its next date. No tiles, no meter.
 */
export default async function RegistersPage() {
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(readRegisters) : null;
  return (
    <>
      <PageHeader title="Registers" description={ABOUT} />
      <div className="page-content">
        <RegistersTabs current="summary" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-registers">
            <Summary page={read.data} />
            <p className="page-note">{REGISTER_ABOUT}</p>
          </div>
        )}
      </div>
    </>
  );
}

function Summary({ page }: { page: RegistersSummary }) {
  return (
    <section data-section="registers-summary">
      <DataTable
        caption="Registers"
        columns={[
          { key: "register", label: "Register", width: "30%" },
          { key: "records", label: "Records" },
          { key: "next", label: "Next date" },
        ]}
        columnMenu={false}
        scroll={false}
      >
        {page.rows.map((row) => (
          <tr key={row.key} id={`register-${row.key}`}>
            <td>
              <Link className="table-title" href={row.href}>
                {REGISTER_ROWS[row.key]}
              </Link>
            </td>
            <td>
              {row.records === null ? (
                <span className="quiet">Not loaded here</span>
              ) : (
                formatNumber(row.records)
              )}
            </td>
            <td>
              {row.next ? (
                <>
                  <span className={row.next.on < page.today ? "hqdata-registers__late" : undefined}>
                    {dayWords(row.next.on)}
                  </span>
                  <span className="table-sub">{row.next.title}</span>
                </>
              ) : row.records === null ? (
                <span className="quiet">—</span>
              ) : (
                "None"
              )}
            </td>
          </tr>
        ))}
      </DataTable>
    </section>
  );
}
