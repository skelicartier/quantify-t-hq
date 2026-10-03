import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readTargets, type TargetList } from "@/lib/api/targets";
import { tierShort, untouchedWords } from "@/lib/crm/targets";
import { formatDate, formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Target accounts" };
export const dynamic = "force-dynamic";

const BASE = "/targets";
const TIER_TONES: Record<number, PillTone> = { 1: "live", 2: "attention", 3: "neutral" };

type TargetsPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function href(query: { tier?: string; untouched?: string; owner?: string }): string {
  const params = new URLSearchParams();
  for (const [name, value] of Object.entries(query)) if (value) params.set(name, value);
  const text = params.toString();
  return text ? `${BASE}?${text}` : BASE;
}

/**
 * The few firms worth the most, the most wanted first and, within a tier, what has waited
 * longest for a touch: why each matters, who there to reach, the next step and its day.
 */
export default async function TargetsPage({ searchParams }: TargetsPageProps) {
  const context = await requireStaff(BASE);
  const parameters = await searchParams;
  const tier = ["1", "2", "3"].includes(firstSearchValue(parameters.tier) ?? "")
    ? (firstSearchValue(parameters.tier) ?? "")
    : "";
  const untouched = firstSearchValue(parameters.untouched) === "1" ? "1" : "";
  const owner = firstSearchValue(parameters.owner) === "me" ? "me" : "";
  let list: TargetList | null = null;
  try {
    list = await readTargets(context.token, { tier, untouched, owner });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const filters = { tier, untouched, owner };

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Target accounts"
        description="The few firms worth the most, each with a tier and a short plan. A touch is anything the firm could notice — a note or a call, a meeting held, a mail sent, a deal moved — and the owner hears on Monday of every target nobody has touched for two weeks."
      />
      <div className="page-content">
        {list === null ? (
          <Callout tone="danger" role="alert">
            The target accounts could not be read just now. This is a read failure, not an empty
            list.
          </Callout>
        ) : (
          <>
            <StatGrid label="Target accounts at a glance">
              <Stat label="Target accounts" value={formatNumber(list.counts.total)} />
              <Stat
                label={`Untouched for ${list.untouched_days} days`}
                value={formatNumber(list.counts.untouched)}
                tone={list.counts.untouched > 0 ? "danger" : "default"}
              />
              <Stat label="Tier 1" value={formatNumber(list.counts.by_tier["1"] ?? 0)} />
              <Stat
                label="Tiers 2 and 3"
                value={formatNumber(
                  (list.counts.by_tier["2"] ?? 0) + (list.counts.by_tier["3"] ?? 0),
                )}
              />
            </StatGrid>
            <div className="list-bar">
              <SegmentedLinks
                label="Tier"
                items={[
                  { href: href({ ...filters, tier: "" }), label: "Every tier", current: !tier },
                  ...["1", "2", "3"].map((value) => ({
                    href: href({ ...filters, tier: value }),
                    label: `Tier ${value}`,
                    current: tier === value,
                  })),
                ]}
              />
              <SegmentedLinks
                label="Which"
                items={[
                  { href: href({ ...filters, untouched: "" }), label: "All", current: !untouched },
                  {
                    href: href({ ...filters, untouched: "1" }),
                    label: `Untouched for ${list.untouched_days} days`,
                    current: untouched === "1",
                  },
                ]}
              />
              <SegmentedLinks
                label="Whose"
                items={[
                  { href: href({ ...filters, owner: "" }), label: "Everyone's", current: !owner },
                  {
                    href: href({ ...filters, owner: "me" }),
                    label: "Mine",
                    current: owner === "me",
                  },
                ]}
              />
            </div>
            <DataTable
              caption="Target accounts"
              columns={[
                { key: "company", label: "Company" },
                { key: "tier", label: "Tier" },
                { key: "touch", label: "Last touch" },
                { key: "next", label: "Next step" },
                { key: "reach", label: "Who to reach" },
                { key: "owner", label: "Owner" },
                { key: "deals", label: "Open deals", align: "end" },
              ]}
              isEmpty={list.targets.length === 0}
              empty={
                <EmptyState
                  compact
                  title={
                    list.counts.total === 0 ? "No target accounts yet" : "None of them match this"
                  }
                  description={
                    list.counts.total === 0
                      ? "Make a firm a target from its own page: a tier, why it matters, who to reach and the next step."
                      : undefined
                  }
                />
              }
            >
              {list.targets.map((row) => (
                <tr key={row.company_id}>
                  <td>
                    <Link className="table-title" href={`/companies/${row.company_id}`}>
                      {row.name}
                    </Link>
                    {row.why && <span className="table-sub">{row.why}</span>}
                  </td>
                  <td>
                    <StatusPill
                      value={`tier-${row.tier}`}
                      label={tierShort(row.tier)}
                      tone={TIER_TONES[row.tier] ?? "neutral"}
                    />
                  </td>
                  <td>
                    {untouchedWords(row.days_untouched)}
                    {row.untouched && (
                      <span className="due due--overdue">Nobody for two weeks</span>
                    )}
                  </td>
                  <td>
                    {row.next_step || <span className="quiet">No next step</span>}
                    {row.next_step_due && (
                      <span className={row.next_step_overdue ? "due due--overdue" : "table-sub"}>
                        {row.next_step_overdue ? "Was due " : "By "}
                        {formatDate(row.next_step_due)}
                      </span>
                    )}
                  </td>
                  <td>
                    {row.reach.length === 0 ? (
                      <span className="quiet">Nobody chosen</span>
                    ) : (
                      row.reach.map((person) => person.full_name).join(", ")
                    )}
                    {row.roles.length > 0 && (
                      <span className="table-sub">
                        {row.roles.map((role) => role.replace(/_/g, " ")).join(" · ")}
                      </span>
                    )}
                  </td>
                  <td>{row.owner_name || <span className="quiet">Nobody</span>}</td>
                  <td className="data-table__num">{formatNumber(row.open_deals)}</td>
                </tr>
              ))}
            </DataTable>
          </>
        )}
      </div>
    </>
  );
}
