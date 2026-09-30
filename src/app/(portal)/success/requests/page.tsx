import Link from "next/link";

import { createRequestAction } from "@/app/(portal)/success/actions";
import { NewRequestForm } from "@/components/success/success-forms";
import { SuccessTabs } from "@/components/success/success-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readFeatureRequests, type FeatureRequest } from "@/lib/api/success";
import { formatDate, formatMoney } from "@/lib/format";

export const metadata = { title: "Feature requests" };
export const dynamic = "force-dynamic";

const SCOPES = [
  { value: "active", label: "Open" },
  { value: "shipped", label: "Shipped" },
  { value: "declined", label: "Declined" },
  { value: "", label: "All" },
] as const;

const STATUS_TONE: Record<string, "live" | "attention" | "neutral" | "danger"> = {
  open: "attention",
  planned: "attention",
  building: "live",
  shipped: "live",
  declined: "neutral",
};

type SearchParams = Promise<{ status?: string }>;

function money(values: Record<string, string>): string {
  const entries = Object.entries(values);
  if (entries.length === 0) return "—";
  return entries.map(([currency, amount]) => formatMoney(Number(amount), currency)).join(" · ");
}

/**
 * What customers asked for: how many firms asked (each counted once), what they pay,
 * the open pipeline asking, and the deals it blocks. Ordered by firms asking, then deals
 * blocked — no weighted score to argue with.
 */
export default async function FeatureRequestsPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const context = await requireStaff("/success/requests");
  const raw = (await searchParams).status;
  const scope = SCOPES.some((item) => item.value === raw) ? (raw ?? "active") : "active";
  let requests: FeatureRequest[] | null = null;
  try {
    requests = (await readFeatureRequests(context.token, scope)).requests;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const seesMoney = hasCapability(context, "revenue:read");
  const canWrite = hasCapability(context, "crm:write");
  const columns = [
    { key: "title", label: "Request" },
    { key: "status", label: "Status" },
    { key: "firms", label: "Firms asking", align: "end" as const },
    { key: "asks", label: "Asks", align: "end" as const },
    { key: "blocks", label: "Deals it blocks", align: "end" as const },
    ...(seesMoney
      ? [
          { key: "mrr", label: "Their MRR", align: "end" as const },
          { key: "pipeline", label: "Open pipeline asking", align: "end" as const },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Feature requests"
        description="What customers asked for, in their words, and the money behind each ask. When one ships, everyone who asked hears."
        actions={
          <>
            <SuccessTabs current="/success/requests" />
            {canWrite && (
              <Popover label="New request" variant="primary" width="wide">
                <NewRequestForm action={createRequestAction} />
              </Popover>
            )}
          </>
        }
      />
      {requests === null ? (
        <Callout tone="danger" role="alert">
          The requests could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <div className="list-tools">
            <SegmentedLinks
              label="Which requests"
              items={SCOPES.map((item) => ({
                href:
                  item.value === "active"
                    ? "/success/requests"
                    : `/success/requests?status=${item.value}`,
                label: item.label,
                current: item.value === scope,
              }))}
            />
          </div>
          <Section id="requests" title="Requests">
            <DataTable
              caption="Feature requests, most firms asking first"
              columns={columns}
              isEmpty={requests.length === 0}
              empty={<p className="muted">Nothing here.</p>}
            >
              {requests.map((row) => (
                <tr key={row.id}>
                  <td>
                    <Link href={`/success/requests/${row.id}`}>{row.title}</Link>
                    {row.shipped_on && (
                      <span className="table-sub">shipped {formatDate(row.shipped_on)}</span>
                    )}
                  </td>
                  <td>
                    <StatusPill
                      value={row.status}
                      label={row.status_label}
                      tone={STATUS_TONE[row.status] ?? "neutral"}
                    />
                  </td>
                  <td className="data-table__num">{row.firms}</td>
                  <td className="data-table__num">
                    {row.asks}
                    {row.blockers > 0 && <span className="table-sub">{row.blockers} blocking</span>}
                  </td>
                  <td className="data-table__num">{row.deals_blocked || "—"}</td>
                  {seesMoney && (
                    <>
                      <td className="data-table__num">{money(row.mrr)}</td>
                      <td className="data-table__num">{money(row.pipeline)}</td>
                    </>
                  )}
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
