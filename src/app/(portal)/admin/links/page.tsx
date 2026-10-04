import Link from "next/link";

import { revokeQuoteLinkAction } from "@/app/(portal)/_actions/share";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readExternalLinks, type ExternalLinks } from "@/lib/api/share";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Outside links" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "link", label: "Link" },
  { key: "state", label: "State" },
  { key: "made", label: "Made" },
  { key: "ends", label: "Ends" },
  { key: "views", label: "Opened", align: "end" as const },
  { key: "act", label: "", align: "end" as const },
];

const KINDS: Record<string, string> = {
  auditor: "An auditor's read of the control map",
  quote: "A customer's quote",
};

const STATES: Record<string, string> = {
  live: "Open",
  expired: "Ended",
  revoked: "Revoked",
  accepted: "Accepted",
  declined: "Declined",
};

/**
 * Every link that lets someone outside HQ read something inside it, in one place: what it
 * shows, who made it, when it ends, how often it was opened — and revoking it, or the page
 * where it is revoked.
 */
export default async function OutsideLinksPage() {
  const context = await requireStaff("/admin/links");
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Outside links" />
        <Callout tone="neutral">Outside links are for HQ owners and admins.</Callout>
      </>
    );
  }
  let data: ExternalLinks | null = null;
  try {
    data = await readExternalLinks(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const now = requestNow();
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Outside links"
        meta={data ? <span className="quiet">{data.live} open</span> : undefined}
        description="Every link that lets someone outside HQ read something inside it: open ones first, then the last ninety days of the rest."
        actions={<AdminTabs current="/admin/links" />}
      />
      {data === null ? (
        <Callout tone="danger" role="alert">
          The links could not be read just now. This is a read failure, not an empty list.
        </Callout>
      ) : (
        <DataTable
          caption="Outside links"
          columns={COLUMNS}
          isEmpty={data.links.length === 0}
          empty={
            <EmptyState
              title="No outside links"
              description="An auditor's link from Controls, or a customer's link from a sent quote, appears here."
            />
          }
        >
          {data.links.map((row) => {
            const [, dealId = "", , quoteId = ""] = row.manage_path.split("/").slice(1);
            return (
              <tr key={`${row.kind}-${row.link_id}`}>
                <td>
                  <Link className="table-title" href={row.manage_path}>
                    {row.label || KINDS[row.kind]}
                  </Link>
                  <span className="table-sub">{KINDS[row.kind]}</span>
                </td>
                <td>
                  <StatusPill
                    value={row.state}
                    label={STATES[row.state] ?? row.state}
                    tone={row.state === "live" ? "live" : "neutral"}
                  />
                </td>
                <td>
                  {row.created_by_name || "A colleague"}
                  <span className="table-sub">
                    <Timestamp value={row.created_at} now={now} mode="relative" />
                  </span>
                </td>
                <td>
                  <Timestamp value={row.expires_at} now={now} mode="absolute" />
                </td>
                <td className="data-table__num">{row.views}</td>
                <td className="data-table__num">
                  {row.state === "live" && row.kind === "quote" && quoteId ? (
                    <RowAction
                      action={revokeQuoteLinkAction}
                      fields={{ deal_id: dealId, quote_id: quoteId, link_id: row.link_id }}
                      buttons={[
                        {
                          label: "Revoke",
                          className: "btn btn--small btn--ghost",
                          pendingLabel: "Revoking…",
                        },
                      ]}
                    />
                  ) : row.state === "live" ? (
                    <Link className="btn btn--small btn--ghost" href={row.manage_path}>
                      Revoke there
                    </Link>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </DataTable>
      )}
    </>
  );
}
