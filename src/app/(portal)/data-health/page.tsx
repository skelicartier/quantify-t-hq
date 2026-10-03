import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { RecordSection } from "@/components/ui/record-shell";
import { Stat, StatGrid } from "@/components/ui/stat";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDataHealth, type DataHealth, type HealthCheck } from "@/lib/api/data-quality";
import { sampleHref, viewHref } from "@/lib/crm/data-health";
import { formatNumber, pluralize } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Data health" };
export const dynamic = "force-dynamic";

const BASE = "/data-health";

/** Then against now, in words: "12, 3 more now". */
function Trend({ then, now }: { then: number | null; now: number }) {
  if (then === null) return <span className="table-sub">Not kept yet</span>;
  const change = now - then;
  return (
    <>
      <span className="health-figure">{formatNumber(then)}</span>
      <span className="table-sub">
        {change === 0
          ? "the same now"
          : `${formatNumber(Math.abs(change))} ${change > 0 ? "more" : "fewer"} now`}
      </span>
    </>
  );
}

function CheckRecords({ check }: { check: HealthCheck }) {
  if (check.count === 0) return null;
  return (
    <span className="health-check__records">
      {check.view && (
        <Link className="text-link" href={viewHref(check.view)}>
          See {check.count === 1 ? "it" : `all ${formatNumber(check.count)}`}
        </Link>
      )}
      {check.fix && (
        <Link className="text-link" href={`${BASE}/tidy?kind=${encodeURIComponent(check.fix)}`}>
          Put right after a preview
        </Link>
      )}
      {check.sample.length > 0 && !check.view && !check.fix && (
        <details className="health-check__sample">
          <summary>
            {check.sample.length < check.count
              ? `The first ${formatNumber(check.sample.length)}`
              : check.count === 1
                ? "Which one"
                : "Which ones"}
          </summary>
          <ul>
            {check.sample.map((item) => {
              const href = sampleHref(item.kind, item.id);
              return (
                <li key={`${item.kind}-${item.id}`}>
                  {href ? <Link href={href}>{item.label || "Unnamed"}</Link> : item.label}
                  {item.sub ? <span className="table-sub"> {item.sub}</span> : null}
                </li>
              );
            })}
          </ul>
        </details>
      )}
      {check.sample.length > 0 && check.view && check.key === "prospects_unknown_country" && (
        <span className="table-sub">
          {check.sample.map((item) => `${item.label} (${item.sub})`).join(", ")}
        </span>
      )}
      {check.sample.length > 0 && check.fix && (
        <span className="table-sub">
          For example{" "}
          {check.sample
            .slice(0, 3)
            .map((item) => `${item.label} → ${item.sub}`)
            .join("; ")}
        </span>
      )}
    </span>
  );
}

export default async function DataHealthPage() {
  const context = await requireStaff(BASE);
  if (!hasCapability(context, "crm:read")) {
    return (
      <>
        <PageHeader eyebrow="CRM" title="Data health" />
        <Callout tone="neutral">The records are read by roles with crm:read.</Callout>
      </>
    );
  }
  const now = requestNow();
  let health: DataHealth | null = null;
  try {
    health = await readDataHealth(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const count = (key: string) => health?.checks.find((check) => check.key === key)?.count ?? 0;
  const failing = health ? health.checks.filter((check) => check.count > 0).length : 0;

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Data health"
        description="Each count is something worth putting right in the records, read as they stand now, with what it was a week and a month ago. Where a list can show the records behind a count it opens filtered to them; two tidy-ups run here in bulk, after a preview of every change."
      />
      <div className="page-content">
        {health === null ? (
          <Callout tone="danger" role="alert">
            The data health counts could not be read just now. This is a read failure, not a clean
            book.
          </Callout>
        ) : (
          <>
            <StatGrid columns={4} label="The records today">
              <Stat
                label="To put right"
                value={`${formatNumber(failing)} of ${formatNumber(health.checks.length)}`}
                hint={
                  health.as_of ? (
                    <>
                      checks, read <Timestamp value={health.as_of} now={now} mode="relative" />
                    </>
                  ) : (
                    "checks"
                  )
                }
              />
              <Stat
                label={<Link href="/leads/duplicates?reason=crm">Leads the CRM holds</Link>}
                value={formatNumber(count("lead_crm_duplicates"))}
                tone={count("lead_crm_duplicates") > 0 ? "danger" : "default"}
              />
              <Stat
                label={<Link href="/leads/duplicates?reason=leads">Look-alike leads</Link>}
                value={formatNumber(count("lead_duplicates"))}
              />
              <Stat
                label="Invalid but open"
                value={formatNumber(count("prospects_invalid"))}
                tone={count("prospects_invalid") > 0 ? "danger" : "default"}
              />
            </StatGrid>
            {health.checks.every((check) => check.week_ago === null) && (
              <p className="page-note">
                The counts are kept once a day ({pluralize(health.history_days, "day")} so far).
                What each was a week ago shows once a day a week back has been kept.
              </p>
            )}
            {health.areas.map((area) => {
              const checks = health!.checks.filter((check) => check.area === area);
              if (checks.length === 0) return null;
              return (
                <RecordSection key={area} id={`health-${area.toLowerCase()}`} title={area}>
                  <div className="health-head" aria-hidden="true">
                    <span>Check</span>
                    <span className="health-head__figures">
                      <span>Now</span>
                      <span>A week ago</span>
                      <span>A month ago</span>
                    </span>
                  </div>
                  <ul className="health-list">
                    {checks.map((check) => (
                      <li key={check.key} id={`check-${check.key}`} className="health-row">
                        <div className="health-row__check">
                          <span className="table-title">{check.label}</span>
                          <span className="table-sub">{check.why}</span>
                          <CheckRecords check={check} />
                        </div>
                        <dl className="health-row__figures">
                          <div>
                            <dt>Now</dt>
                            <dd>
                              <span
                                className={
                                  check.tone === "danger" && check.count > 0
                                    ? "health-figure health-count--danger"
                                    : "health-figure"
                                }
                              >
                                {check.count === 0 ? "None" : formatNumber(check.count)}
                              </span>
                              <span className="table-sub">of {formatNumber(check.of)}</span>
                            </dd>
                          </div>
                          <div>
                            <dt>A week ago</dt>
                            <dd>
                              <Trend then={check.week_ago} now={check.count} />
                            </dd>
                          </div>
                          <div>
                            <dt>A month ago</dt>
                            <dd>
                              <Trend then={check.month_ago} now={check.count} />
                            </dd>
                          </div>
                        </dl>
                      </li>
                    ))}
                  </ul>
                </RecordSection>
              );
            })}
          </>
        )}
      </div>
    </>
  );
}
