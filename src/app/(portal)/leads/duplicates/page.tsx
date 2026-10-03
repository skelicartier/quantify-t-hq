import Link from "next/link";

import {
  dismissLeadGroupAction,
  markLeadsAsPersonAction,
  restoreDuplicatesAction,
} from "@/app/(portal)/leads/actions";
import { LeadTabs } from "@/components/crm/lead-tabs";
import { LeadStagePill } from "@/components/crm/pills";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { Pagination } from "@/components/ui/pagination";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  readLeadDuplicates,
  type LeadBrief,
  type LeadDuplicates,
  type LeadGroup,
} from "@/lib/api/data-quality";
import { formatNumber, pluralize } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { boundedInteger, firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Duplicates" };
export const dynamic = "force-dynamic";

const BASE = "/leads/duplicates";

/** The filters a person narrows the review by: who is in the group, then why. */
const VIEWS = [
  { reason: "", label: "All" },
  { reason: "crm", label: "Already in the CRM" },
  { reason: "leads", label: "Leads only" },
  { reason: "same_name_firm", label: "Same name at a firm" },
  { reason: "same_mailbox", label: "Same mailbox" },
  { reason: "same_address", label: "Same address" },
] as const;

const VERIFIED_LABELS: Record<string, string> = {
  valid: "Verified valid",
  risky: "Verified risky",
  invalid: "Verified invalid",
};

type DuplicatesPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function sentence(text: string): string {
  return `${text.charAt(0).toUpperCase()}${text.slice(1)}`;
}

/** Someone who wrote in and has not been answered: never folded away or marked. */
function owedReply(lead: LeadBrief): boolean {
  return lead.origin === "inbound" && !lead.first_replied_at;
}

function mergeHref(group: LeadGroup): string {
  const others = group.leads.map((lead) => lead.lead_id).filter((id) => id !== group.keep);
  return `${BASE}/merge?keep=${group.keep}&fold=${others.join(",")}`;
}

function LeadLine({ lead, keep, now }: { lead: LeadBrief; keep: boolean; now: number }) {
  const facts = [
    lead.origin === "inbound" ? "Wrote in" : "Found",
    lead.fit_band ? `Fit ${lead.fit_band}` : "",
    VERIFIED_LABELS[lead.verified_state] ?? "Never verified",
    lead.emails_sent ? `Written to ${pluralize(lead.emails_sent, "time")}` : "Never written to",
  ].filter(Boolean);
  return (
    <li className="dup-record">
      <div className="dup-record__main">
        <span>
          <Link className="table-title" href={`/leads/${lead.lead_id}`}>
            {lead.full_name || lead.email || "Unnamed"}
          </Link>{" "}
          <LeadStagePill stage={lead.stage} />
        </span>
        <span className="table-sub mono">{lead.email || "No address"}</span>
        <span className="table-sub">
          {[lead.company_name, lead.title].filter(Boolean).join(" · ") || "No firm"}
        </span>
        <span className="table-sub">
          {facts.join(" · ")}
          {lead.created_at ? (
            <>
              {" · came in "}
              <Timestamp value={lead.created_at} now={now} mode="relative" />
            </>
          ) : null}
        </span>
      </div>
      {keep && <span className="dup-record__keep">Stays if merged as suggested</span>}
    </li>
  );
}

export default async function LeadDuplicatesPage({ searchParams }: DuplicatesPageProps) {
  const context = await requireStaff(BASE);
  const parameters = await searchParams;
  const reason = firstSearchValue(parameters.reason) ?? "";
  const offset = boundedInteger(firstSearchValue(parameters.offset), 0, 1_000_000);
  const now = requestNow();
  const known = VIEWS.some((view) => view.reason === reason);
  let page: LeadDuplicates | null = null;
  try {
    page = await readLeadDuplicates(context.token, { reason: known ? reason : "", offset });
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  const href = (over: { reason?: string; offset?: number }) => {
    const params = new URLSearchParams();
    const nextReason = over.reason ?? reason;
    if (nextReason) params.set("reason", nextReason);
    if (over.offset) params.set("offset", String(over.offset));
    const rendered = params.toString();
    return `${BASE}${rendered ? `?${rendered}` : ""}`;
  };

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Duplicates"
        description="Leads that look like the same person: the same address, the same mailbox once dots and plus-tags are taken out, or the same name at the same firm — and leads the CRM already holds as a person. Nothing is merged until you choose what stays; a folded lead is kept as a duplicate naming the one it went into, so the same file brought in again does not add it back."
        actions={<LeadTabs current={BASE} />}
      />
      <div className="page-content">
        {page === null ? (
          <Callout tone="danger" role="alert">
            Duplicates could not be read just now. This is a read failure, not a clean list.
          </Callout>
        ) : (
          <>
            <StatGrid columns={4} label="Look-alikes waiting">
              <Stat label="To review" value={formatNumber(page.total)} />
              <Stat
                label={<Link href={href({ reason: "crm", offset: 0 })}>Already in the CRM</Link>}
                value={formatNumber(page.with_people)}
                tone={page.with_people > 0 ? "danger" : "default"}
              />
              <Stat
                label="Same name at a firm"
                value={formatNumber(page.by_reason.same_name_firm ?? 0)}
              />
              <Stat
                label="Same mailbox or address"
                value={formatNumber(
                  (page.by_reason.same_mailbox ?? 0) + (page.by_reason.same_address ?? 0),
                )}
              />
            </StatGrid>

            <SegmentedLinks
              label="Which look-alikes"
              items={VIEWS.map((view) => ({
                href: href({ reason: view.reason, offset: 0 }),
                label: view.label,
                current: view.reason === (known ? reason : ""),
              }))}
            />

            {page.groups.length === 0 ? (
              <Callout tone="neutral">
                {page.total === 0
                  ? "No look-alikes: no two leads still being worked share an address, a mailbox or a name at a firm, and none is a CRM person already."
                  : "None of the look-alikes is of this kind."}
              </Callout>
            ) : (
              <div className="dup-groups">
                {page.groups.map((group) => {
                  const owed = group.leads.filter(owedReply);
                  const markable = group.leads.filter((lead) => !owedReply(lead));
                  return (
                    <Card
                      key={group.key}
                      title={
                        group.people.length
                          ? "Already in the CRM"
                          : `${group.leads.length} records of one person?`
                      }
                      titleAs="h2"
                      description={`Why: ${group.reasons
                        .map((code) => page!.reasons[code] ?? code)
                        .join("; ")}.`}
                    >
                      <ul className="dup-records">
                        {group.leads.map((lead) => (
                          <LeadLine
                            key={lead.lead_id}
                            lead={lead}
                            keep={group.leads.length > 1 && lead.lead_id === group.keep}
                            now={now}
                          />
                        ))}
                        {group.people.map((person) => (
                          <li key={person.person_id} className="dup-record">
                            <div className="dup-record__main">
                              <span>
                                <Link className="table-title" href={`/people/${person.person_id}`}>
                                  {person.full_name || person.email}
                                </Link>{" "}
                                <StatusPill value="crm" label="In the CRM" tone="live" />
                              </span>
                              <span className="table-sub mono">{person.email || "No address"}</span>
                              <span className="table-sub">
                                {[person.company_name, person.title].filter(Boolean).join(" · ") ||
                                  "No company"}
                                {person.do_not_contact ? " · asked not to be contacted" : ""}
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                      {canWrite && (
                        <div className="dup-actions">
                          {group.leads.length > 1 && (
                            <ButtonLink href={mergeHref(group)} size="small" variant="primary">
                              Choose what stays
                            </ButtonLink>
                          )}
                          {group.people.map((person) =>
                            markable.length > 0 ? (
                              <RowAction
                                key={person.person_id}
                                action={markLeadsAsPersonAction}
                                fields={{
                                  person_id: person.person_id,
                                  lead_ids: markable.map((lead) => lead.lead_id).join(","),
                                }}
                                buttons={[
                                  {
                                    label: `${markable.length === 1 ? "This lead is" : "These leads are"} ${person.full_name || person.email}`,
                                    className: "btn btn--small",
                                    pendingLabel: "Marking…",
                                  },
                                ]}
                              />
                            ) : null,
                          )}
                          <RowAction
                            action={dismissLeadGroupAction}
                            fields={{
                              ids: group.leads.map((lead) => lead.lead_id).join(","),
                              person_ids: group.people.map((person) => person.person_id).join(","),
                            }}
                            buttons={[
                              {
                                label: "Not the same",
                                className: "btn btn--small btn--ghost",
                                pendingLabel: "Saving…",
                              },
                            ]}
                          />
                        </div>
                      )}
                      {owed.length > 0 && group.people.length > 0 && (
                        <p className="table-sub">
                          {owed.map((lead) => lead.full_name || lead.email).join(", ")}{" "}
                          {owed.length === 1 ? "wrote in and is" : "wrote in and are"} still owed a
                          reply: convert {owed.length === 1 ? "that lead" : "those leads"} instead,
                          which links {owed.length === 1 ? "it" : "them"} to the person.
                        </p>
                      )}
                    </Card>
                  );
                })}
              </div>
            )}

            {page.matched > page.limit && (
              <Pagination
                offset={page.offset}
                limit={page.limit}
                returned={page.groups.length}
                hasMore={page.offset + page.groups.length < page.matched}
                nextOffset={page.offset + page.groups.length}
                buildHref={(nextOffset) => href({ offset: nextOffset })}
                noun="groups"
              />
            )}

            {page.dismissed.length > 0 && (
              <RecordSection id="dismissed" title="Judged not the same">
                <ul className="dup-records">
                  {page.dismissed.map((row) => (
                    <li key={row.key} className="dup-record">
                      <div className="dup-record__main">
                        <span>
                          {sentence(pluralize(row.record_ids.length, "record"))}
                          {row.reason ? `: ${row.reason}` : ""}
                        </span>
                        <span className="table-sub">
                          {row.dismissed_by?.name || "Someone"}
                          {row.dismissed_at ? (
                            <>
                              {" · "}
                              <Timestamp value={row.dismissed_at} now={now} mode="relative" />
                            </>
                          ) : null}
                        </span>
                      </div>
                      {canWrite && (
                        <RowAction
                          action={restoreDuplicatesAction}
                          fields={{ key: row.key, back: BASE }}
                          buttons={[
                            {
                              label: "Ask again",
                              className: "btn btn--small btn--ghost",
                              pendingLabel: "Saving…",
                            },
                          ]}
                        />
                      )}
                    </li>
                  ))}
                </ul>
              </RecordSection>
            )}
          </>
        )}
      </div>
    </>
  );
}
