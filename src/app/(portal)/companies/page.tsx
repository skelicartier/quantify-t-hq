import Link from "next/link";

import { createCompanyAction } from "@/app/(portal)/companies/actions";
import { CompanyCreateForm } from "@/components/crm/company-forms";
import { LifecyclePill } from "@/components/crm/pills";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies, type CompanyRow } from "@/lib/api/crm";
import { directoryOrEmpty } from "@/lib/api/staff";
import { LIFECYCLES, LIFECYCLE_LABELS } from "@/lib/crm/vocabulary";
import { formatMrrBy, sumMoneyByCurrency } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Companies" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "company", label: "Company" },
  { key: "lifecycle", label: "Lifecycle" },
  { key: "type", label: "Type" },
  { key: "people", label: "People", align: "end" as const },
  { key: "deals", label: "Open deals", align: "end" as const },
  { key: "mrr", label: "MRR", align: "end" as const },
  { key: "owner", label: "Owner" },
  { key: "updated", label: "Updated" },
];

type CompaniesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function CompaniesPage({ searchParams }: CompaniesPageProps) {
  const context = await requireStaff("/companies");
  const parameters = await searchParams;
  const q = firstSearchValue(parameters.q) ?? "";
  const lifecycle = firstSearchValue(parameters.lifecycle) ?? "";
  const now = requestNow();

  let companies: CompanyRow[] | null = null;
  try {
    companies = (await readCompanies(context.token, q)).companies;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrEmpty(context.token);
  const visible = (companies ?? []).filter((row) => !lifecycle || row.lifecycle === lifecycle);
  const customers = (companies ?? []).filter((row) => row.lifecycle === "customer");
  // The service totals each company from the ledger; across companies we may only add
  // within a currency, and not at all when any figure is withheld from this role.
  const ledger = (companies ?? []).every((row) => row.mrr !== null)
    ? (companies ?? []).flatMap((row) =>
        Object.entries(row.mrr ?? {}).map(([currency, amount]) => ({ amount, currency })),
      )
    : null;
  const mrr = ledger === null ? null : sumMoneyByCurrency(ledger);
  const openDeals = (companies ?? []).reduce((sum, row) => sum + row.open_deals, 0);

  const lifecycleLink = (value: string) => {
    const next = new URLSearchParams();
    if (q) next.set("q", q);
    if (value) next.set("lifecycle", value);
    const rendered = next.toString();
    return rendered ? `/companies?${rendered}` : "/companies";
  };

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Companies"
        description="Every firm we know, anchored on its web domain. Colleagues' leads join the same company."
        actions={
          hasCapability(context, "crm:write") ? (
            <Popover label="New company" variant="primary">
              <CompanyCreateForm action={createCompanyAction} />
            </Popover>
          ) : undefined
        }
      />
      {companies === null ? (
        <Callout tone="danger" role="alert">
          Companies could not be read just now. This is a read failure, not an empty book.
        </Callout>
      ) : (
        <>
          <StatGrid columns={4} label="The book">
            <Stat label="Companies" value={companies.length} />
            <Stat label="Customers" value={customers.length} />
            <Stat label="MRR" value={formatMrrBy(mrr)} text hint="From contracts, today" />
            <Stat label="Open deals" value={openDeals} />
          </StatGrid>
          <nav className="filter-strip" aria-label="Company filters">
            <span className="eyebrow">Lifecycle</span>
            <Link href={lifecycleLink("")} aria-current={lifecycle === "" ? "page" : undefined}>
              All
            </Link>
            {LIFECYCLES.map((value) => (
              <Link
                key={value}
                href={lifecycleLink(value)}
                aria-current={lifecycle === value ? "page" : undefined}
              >
                {LIFECYCLE_LABELS[value]}
              </Link>
            ))}
            <form className="filter-strip__search" action="/companies" role="search">
              {lifecycle && <input type="hidden" name="lifecycle" value={lifecycle} />}
              <label className="sr-only" htmlFor="companies-q">
                Search companies
              </label>
              <input
                id="companies-q"
                className="input input--small"
                name="q"
                defaultValue={q}
                placeholder="Name or domain"
              />
            </form>
          </nav>
          <DataTable
            caption="Companies"
            columns={COLUMNS}
            isEmpty={visible.length === 0}
            empty={
              <EmptyState
                title={q || lifecycle ? "Nothing matches" : "No companies yet"}
                description={
                  q || lifecycle
                    ? "No company matches these filters."
                    : "Companies are created when a lead is qualified, or by hand with New company."
                }
              />
            }
          >
            {visible.map((row) => (
              <tr key={row.company_id}>
                <td>
                  <Link className="table-title" href={`/companies/${row.company_id}`}>
                    {row.name}
                  </Link>
                  <span className="table-sub">{row.domain || "No domain"}</span>
                </td>
                <td>
                  <LifecyclePill lifecycle={row.lifecycle} />
                </td>
                <td>{row.firm_type || <span className="table-sub">—</span>}</td>
                <td className="data-table__num">{row.people_count}</td>
                <td className="data-table__num">{row.open_deals}</td>
                <td className="data-table__num">{formatMrrBy(row.mrr)}</td>
                <td>
                  {row.owner_staff_id ? (
                    (names.get(row.owner_staff_id)?.display_name ?? "—")
                  ) : (
                    <span className="table-sub">Unowned</span>
                  )}
                </td>
                <td>
                  <Timestamp value={row.updated_at} now={now} mode="relative" />
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </>
  );
}
