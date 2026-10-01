import Link from "next/link";

import { AdminGate } from "@/components/product/admin-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Button, ButtonLink } from "@/components/ui/button";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { ShortId } from "@/components/ui/short-id";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AdminAuditEventsAccess } from "@/lib/product/access";
import { AUDIT_FILTER_FIELDS, countActiveFilters } from "@/lib/product/audit-filters";
import { formatLabel, pluralize } from "@/lib/format";
import { buildPageHref } from "@/lib/search-params";

type AdminAuditEventsProps = {
  access: AdminAuditEventsAccess;
  now?: number | undefined;
};

const COLUMNS = [
  { key: "when", label: "When" },
  { key: "event", label: "Event" },
  { key: "outcome", label: "Outcome" },
  { key: "actor", label: "Actor" },
  { key: "subject", label: "Subject" },
  { key: "session", label: "Session" },
  { key: "request", label: "Request" },
] as const;

function Identifier({ value }: { value: string | null }) {
  return value ? <ShortId value={value} /> : <span className="quiet">—</span>;
}

/** A person: their email when the API resolved it, the account id underneath either way. */
function Person({ userId, email }: { userId: string; email: string | null | undefined }) {
  const href = `/product/users/${userId}`;
  if (!email) return <ShortId value={userId} href={href} />;
  return (
    <>
      <Link className="row-link data-table__primary" href={href}>
        {email}
      </Link>
      <span className="data-table__secondary">
        <ShortId value={userId} />
      </span>
    </>
  );
}

export function AdminAuditEvents({ access, now }: AdminAuditEventsProps) {
  const authorized = access.status === "authorized" ? access : null;
  const activeFilters = authorized ? countActiveFilters(authorized.filters) : 0;

  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="Audit"
        titleId="admin-audit-heading"
        description="Security events across all accounts. Filter by event, outcome, or the identifiers involved."
        meta={
          authorized ? (
            <Timestamp value={authorized.auditEvents.generated_at} now={now} prefix="Updated" />
          ) : undefined
        }
      />

      <div className="page-content">
        <AdminGate access={access} section="Audit">
          {authorized && (
            <>
              <Section
                id="admin-audit-filters"
                title="Filters"
                eyebrow="Search"
                description={
                  activeFilters > 0
                    ? `${pluralize(activeFilters, "filter")} applied`
                    : "Exact matches only."
                }
              >
                <form className="form" action="/product/audit">
                  <input type="hidden" name="limit" value={authorized.limit} />
                  <div className="form-grid">
                    {AUDIT_FILTER_FIELDS.map((field) => (
                      <Field key={field.name} id={`audit-filter-${field.name}`} label={field.label}>
                        <Input
                          id={`audit-filter-${field.name}`}
                          name={field.name}
                          defaultValue={authorized.filters[field.name] ?? ""}
                          placeholder={field.placeholder}
                          autoComplete="off"
                          spellCheck={false}
                        />
                      </Field>
                    ))}
                  </div>
                  <div className="form-actions">
                    <Button variant="primary" type="submit">
                      Apply
                    </Button>
                    <ButtonLink href="/product/audit" variant="ghost">
                      Clear
                    </ButtonLink>
                  </div>
                </form>
              </Section>

              <Section
                id="admin-audit-table"
                title="Events"
                eyebrow="Results"
                actions={
                  <Pagination
                    offset={authorized.auditEvents.pagination.offset}
                    limit={authorized.auditEvents.pagination.limit}
                    returned={authorized.auditEvents.events.length}
                    hasMore={authorized.auditEvents.pagination.has_more}
                    nextOffset={authorized.auditEvents.pagination.next_offset}
                    buildHref={(offset, limit) =>
                      buildPageHref("/product/audit", offset, limit, authorized.filters)
                    }
                    noun="events"
                  />
                }
              >
                <DataTable
                  columns={COLUMNS}
                  caption="Audit events"
                  minWidth={960}
                  isEmpty={authorized.auditEvents.events.length === 0}
                  empty={
                    <EmptyState
                      title="No events match these filters."
                      description="Clear a filter or widen the search."
                    />
                  }
                >
                  {authorized.auditEvents.events.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <Timestamp
                          value={event.occurred_at}
                          now={now}
                          mode="both"
                          fallback="Unknown"
                        />
                      </td>
                      <td>
                        <span className="data-table__primary">{formatLabel(event.event_type)}</span>
                        <span className="data-table__secondary">{formatLabel(event.source)}</span>
                      </td>
                      <td>
                        <StatusPill value={event.outcome} />
                      </td>
                      <td>
                        {event.actor_user_id ? (
                          <Person userId={event.actor_user_id} email={event.actor_email} />
                        ) : (
                          <span className="quiet">
                            {formatLabel(event.summary.actor_role || "unknown")}
                          </span>
                        )}
                      </td>
                      <td>
                        {event.subject_user_id ? (
                          <Person userId={event.subject_user_id} email={event.subject_email} />
                        ) : (
                          <span className="quiet">—</span>
                        )}
                      </td>
                      <td>
                        <Identifier value={event.session_id} />
                      </td>
                      <td>
                        <Identifier value={event.request_id} />
                      </td>
                    </tr>
                  ))}
                </DataTable>
              </Section>
            </>
          )}
        </AdminGate>
      </div>
    </>
  );
}
