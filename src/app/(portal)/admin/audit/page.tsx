import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Card } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ShortId } from "@/components/ui/short-id";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { directoryOrNull, searchAudit, type AuditPage } from "@/lib/api/staff";
import { formatAbsolute, formatSentence } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Audit" };
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

const COLUMNS = [
  { key: "when", label: "When" },
  { key: "who", label: "Who" },
  { key: "action", label: "Action" },
  { key: "record", label: "Record" },
  { key: "reason", label: "Reason and detail" },
];

const ENTITY_TYPES = [
  "staff",
  "session",
  "lead",
  "company",
  "person",
  "deal",
  "task",
  "activity",
  "ticket",
  "saved_reply",
  "api_key",
  "pipeline_stage",
] as const;

const RECORD_PAGES: Record<string, string> = {
  lead: "/leads",
  company: "/companies",
  person: "/people",
  deal: "/deals",
  staff: "/admin/staff",
  ticket: "/support",
};

/** One line from a detail object: `role: sales → admin · sessions revoked: 2`. */
function describeDetail(detail: Record<string, unknown>): string {
  return Object.entries(detail)
    .map(([key, value]) => {
      if (value && typeof value === "object" && !Array.isArray(value)) {
        const record = value as Record<string, unknown>;
        if ("from" in record && "to" in record) {
          return `${formatSentence(key)}: ${String(record.from) || "none"} → ${String(record.to)}`;
        }
        return `${formatSentence(key)}: ${JSON.stringify(value)}`;
      }
      if (Array.isArray(value)) return `${formatSentence(key)}: ${value.join(", ")}`;
      return `${formatSentence(key)}: ${String(value)}`;
    })
    .join(" · ");
}

const EXPORT_OUTCOMES: Record<string, string> = {
  sudo: "Confirm it's you below, then export again.",
  reason: "Say what the export is for, in a sentence.",
  dates: "The range needs two dates, the later one second, at most a year apart.",
  forbidden: "Your role cannot export the audit log.",
  failed: "The export could not be built just now. Nothing was downloaded.",
};

type AuditPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function AuditIndexPage({ searchParams }: AuditPageProps) {
  const context = await requireStaff("/admin/audit");
  if (!hasCapability(context, "audit:read")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Audit" />
        <Callout tone="neutral">The audit log is read by Owners and Admins.</Callout>
      </>
    );
  }
  const parameters = await searchParams;
  const filters = {
    action: firstSearchValue(parameters.action) ?? "",
    entity_type: firstSearchValue(parameters.entity_type) ?? "",
    entity_id: firstSearchValue(parameters.entity_id) ?? "",
    staff_id: firstSearchValue(parameters.staff_id) ?? "",
    q: (firstSearchValue(parameters.q) ?? "").slice(0, 100),
    from: firstSearchValue(parameters.from) ?? "",
    to: firstSearchValue(parameters.to) ?? "",
  };
  const offset = Math.max(0, Number(firstSearchValue(parameters.offset) ?? 0) || 0);
  const now = requestNow();
  const exportOutcome = EXPORT_OUTCOMES[firstSearchValue(parameters.export) ?? ""] ?? null;
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const today = new Date(now).toISOString().slice(0, 10);
  const monthAgo = new Date(now - 30 * 86_400_000).toISOString().slice(0, 10);

  let page: AuditPage | null = null;
  try {
    page = await searchAudit(context.token, filters, { limit: PAGE_SIZE, offset });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const directory = await directoryOrNull(context.token);
  const names = directory ?? new Map();

  const pageLink = (nextOffset: number) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) if (value) query.set(key, value);
    if (nextOffset > 0) query.set("offset", String(nextOffset));
    const rendered = query.toString();
    return rendered ? `/admin/audit?${rendered}` : "/admin/audit";
  };

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Audit"
        description="Every change anyone made in HQ, newest first. Rows are never edited or removed."
        actions={
          hasCapability(context, "hq:admin") ? <AdminTabs current="/admin/audit" /> : undefined
        }
      />
      <form className="filter-strip filter-strip--form" action="/admin/audit" role="search">
        <span className="eyebrow">Filter</span>
        <label className="sr-only" htmlFor="audit-action">
          Action
        </label>
        <input
          id="audit-action"
          className="input input--small"
          name="action"
          defaultValue={filters.action}
          placeholder="Action, e.g. deal.closed"
          spellCheck={false}
        />
        <label className="sr-only" htmlFor="audit-type">
          Record type
        </label>
        <select
          id="audit-type"
          className="select select--small"
          name="entity_type"
          defaultValue={filters.entity_type}
        >
          <option value="">Any record</option>
          {ENTITY_TYPES.map((type) => (
            <option key={type} value={type}>
              {formatSentence(type)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="audit-staff">
          Person
        </label>
        <select
          id="audit-staff"
          className="select select--small"
          name="staff_id"
          defaultValue={filters.staff_id}
        >
          <option value="">Anyone</option>
          {[...names.values()].map((entry) => (
            <option key={entry.staff_id} value={entry.staff_id}>
              {entry.display_name}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="audit-q">
          Words
        </label>
        <input
          id="audit-q"
          className="input input--small"
          name="q"
          type="search"
          defaultValue={filters.q}
          placeholder="Words in the reason or detail"
          maxLength={100}
        />
        <span className="audit-days">
          <label className="audit-day" htmlFor="audit-search-from">
            <span>From</span>
            <input
              id="audit-search-from"
              className="input input--small"
              type="date"
              name="from"
              defaultValue={filters.from}
              max={today}
            />
          </label>
          <label className="audit-day" htmlFor="audit-search-to">
            <span>To</span>
            <input
              id="audit-search-to"
              className="input input--small"
              type="date"
              name="to"
              defaultValue={filters.to}
              max={today}
            />
          </label>
        </span>
        {filters.entity_id && <input type="hidden" name="entity_id" value={filters.entity_id} />}
        <button className="btn btn--small" type="submit">
          Apply
        </button>
        {Object.values(filters).some(Boolean) && (
          <Link className="filter-strip__clear" href="/admin/audit">
            Clear
          </Link>
        )}
      </form>
      {exportOutcome && (
        <Callout tone="danger" role="alert" compact>
          {exportOutcome}
        </Callout>
      )}
      <details className="audit-export">
        <summary className="audit-export__summary">Export a signed copy</summary>
        <div className="audit-export__body">
          <SudoGate
            action={confirmSudoAction}
            fresh={fresh}
            untilLabel={untilLabel}
            returnPath="/admin/audit"
            purpose="Exporting the log needs a fresh code from your authenticator app."
          />
          <Card
            title="Signed JSONL export"
            titleAs="h2"
            description="One line per event for a date range, with a digest and an HMAC signature an auditor can verify against the service's secret. The export itself is recorded in the log before the file leaves."
          >
            <form className="audit-export__form" action="/admin/audit/export" method="post">
              <label className="field__label" htmlFor="audit-export-from">
                From
              </label>
              <input
                id="audit-export-from"
                className="input input--small"
                type="date"
                name="from"
                defaultValue={monthAgo}
                max={today}
                required
              />
              <label className="field__label" htmlFor="audit-export-to">
                To
              </label>
              <input
                id="audit-export-to"
                className="input input--small"
                type="date"
                name="to"
                defaultValue={today}
                max={today}
                required
              />
              <label className="field__label" htmlFor="audit-export-reason">
                What it is for
              </label>
              <input
                id="audit-export-reason"
                className="input input--small"
                name="reason"
                placeholder="e.g. Q3 evidence pack for the bank"
                minLength={8}
                maxLength={400}
                required
              />
              <button className="btn btn--small btn--primary" type="submit" disabled={!fresh}>
                Download .jsonl
              </button>
            </form>
          </Card>
        </div>
      </details>
      {page === null ? (
        <Callout tone="danger" role="alert">
          The audit log could not be read just now. This is a read failure, not an empty log.
        </Callout>
      ) : (
        <>
          {directory === null && (
            <Callout tone="danger" compact>
              Names could not be read just now, so each row shows who acted as unavailable rather
              than by name.
            </Callout>
          )}
          <DataTable
            caption="Audit events"
            columns={COLUMNS}
            isEmpty={page.events.length === 0}
            empty={
              <EmptyState
                title="No events"
                description={
                  Object.values(filters).some(Boolean)
                    ? "Nothing matches these filters."
                    : "Nothing has been recorded yet."
                }
              />
            }
          >
            {page.events.map((event, index) => {
              const recordPage = RECORD_PAGES[event.entity_type];
              const who = event.staff_id
                ? (names.get(event.staff_id)?.display_name ?? "Name unavailable")
                : formatSentence(event.actor_label || "system");
              const detail = describeDetail(event.detail);
              return (
                <tr key={`${event.occurred_at}-${event.correlation_id}-${index}`}>
                  <td>
                    <Timestamp value={event.occurred_at} now={now} mode="both" />
                  </td>
                  <td>{who}</td>
                  <td className="mono">{event.action}</td>
                  <td>
                    <span className="table-sub-inline">{formatSentence(event.entity_type)}</span>{" "}
                    {event.entity_id ? (
                      <ShortId
                        value={event.entity_id}
                        {...(recordPage && event.entity_id.length > 8
                          ? { href: `${recordPage}/${event.entity_id}` }
                          : {})}
                      />
                    ) : (
                      "—"
                    )}
                  </td>
                  <td>
                    {event.reason && <span className="audit-reason">{event.reason}</span>}
                    {detail && <span className="table-sub">{detail}</span>}
                    {!event.reason && !detail && <span className="table-sub">—</span>}
                  </td>
                </tr>
              );
            })}
          </DataTable>
          <nav className="pager" aria-label="Audit pages">
            {offset > 0 ? (
              <Link className="btn btn--small" href={pageLink(Math.max(0, offset - PAGE_SIZE))}>
                Newer
              </Link>
            ) : (
              <span />
            )}
            <span className="pager__range">
              {page.events.length === 0
                ? "No rows"
                : `Rows ${offset + 1}–${offset + page.events.length}`}
            </span>
            {page.events.length === PAGE_SIZE ? (
              <Link className="btn btn--small" href={pageLink(offset + PAGE_SIZE)}>
                Older
              </Link>
            ) : (
              <span />
            )}
          </nav>
        </>
      )}
    </>
  );
}
