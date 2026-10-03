import Link from "next/link";

import { saveAllSuggestionsAction, saveViewSegmentAction } from "@/app/(portal)/leads/actions";
import { LeadTabs } from "@/components/crm/lead-tabs";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { ButtonLink } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RecordSection } from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readLeadSuggestions, type LeadSuggestionsPage } from "@/lib/api/crm";
import { describeCondition, readSegments, type SegmentsPage } from "@/lib/api/mail";
import { formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Lead segments" };
export const dynamic = "force-dynamic";

const BASE = "/leads/segments";

const SAVED_COLUMNS = [
  { key: "name", label: "Segment" },
  { key: "conditions", label: "Who is in it" },
  { key: "count", label: "Matched", align: "end" as const },
  { key: "when", label: "Counted" },
  { key: "actions", label: "" },
];

const SUGGESTED_COLUMNS = [
  { key: "name", label: "Suggested segment" },
  { key: "conditions", label: "Who is in it" },
  { key: "count", label: "Leads", align: "end" as const },
  { key: "actions", label: "" },
];

/** The prospects list showing exactly who a set of conditions matches. */
function listHref(conditions: readonly string[]): string {
  const params = new URLSearchParams();
  for (const condition of conditions) {
    if (condition.toLowerCase() === "origin:is:prospect") continue;
    if (condition.startsWith("stage:is:")) params.set("stage", condition.slice("stage:is:".length));
    else params.append("f", condition);
  }
  const rendered = params.toString();
  return rendered ? `/leads/prospects?${rendered}` : "/leads/prospects";
}

function split(condition: string): { field: string; op: string; value: string } {
  const [field = "", op = "", ...rest] = condition.split(":");
  return { field, op, value: rest.join(":") };
}

export default async function LeadSegmentsPage() {
  const context = await requireStaff(BASE);
  const now = requestNow();
  let suggestions: LeadSuggestionsPage | null = null;
  let segments: SegmentsPage | null = null;
  try {
    [suggestions, segments] = await Promise.all([
      readLeadSuggestions(context.token),
      readSegments(context.token),
    ]);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  const fields = segments?.fields.leads ?? [];
  const saved = (segments?.segments ?? []).filter(
    (segment) => segment.kind === "leads" && !segment.archived_at,
  );
  const unsaved = (suggestions?.suggestions ?? []).filter((item) => !item.segment_id);
  const describe = (conditions: readonly { field: string; op: string; value: string }[]) =>
    conditions
      .filter((condition) => !(condition.field === "origin" && condition.value === "prospect"))
      .map((condition) => describeCondition(condition, fields))
      .join("; ") || "Every prospect";

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Segments"
        description="Groups of leads worth writing to. A segment is a saved question — every PMS manager in India with a named address — answered again each time a campaign is scheduled, so it keeps itself up to date as leads come in. The suggestions are read off the leads themselves."
        meta={
          suggestions ? (
            <span className="quiet">{formatNumber(suggestions.prospects)} prospects</span>
          ) : undefined
        }
        actions={<LeadTabs current={BASE} />}
      />
      <div className="page-content">
        {suggestions === null || segments === null ? (
          <Callout tone="danger" role="alert">
            Segments could not be read just now. This is a read failure, not an empty list.
          </Callout>
        ) : (
          <>
            <RecordSection id="lead-segments-saved" title="Saved">
              <DataTable
                caption="Saved lead segments"
                columns={SAVED_COLUMNS}
                columnMenu={false}
                isEmpty={saved.length === 0}
                empty={
                  <EmptyState
                    compact
                    title="No lead segments yet"
                    description="Save a suggestion below, or filter the prospects list and save the view."
                  />
                }
              >
                {saved.map((segment) => {
                  const conditions = segment.conditions.map(
                    (condition) => `${condition.field}:${condition.op}:${condition.value}`,
                  );
                  return (
                    <tr key={segment.segment_id}>
                      <td>
                        <Link className="table-title" href={listHref(conditions)}>
                          {segment.name}
                        </Link>
                      </td>
                      <td>{describe(segment.conditions)}</td>
                      <td className="data-table__num">
                        {segment.last_count === null ? "—" : formatNumber(segment.last_count)}
                      </td>
                      <td>
                        <Timestamp value={segment.last_evaluated_at} now={now} mode="relative" />
                      </td>
                      <td>
                        {canWrite && (
                          <ButtonLink
                            size="small"
                            href={`/mail/campaigns/new?segment=${segment.segment_id}`}
                          >
                            Write a campaign
                          </ButtonLink>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
            </RecordSection>

            <RecordSection
              id="lead-segments-suggested"
              title="Suggested by the leads"
              actions={
                canWrite && unsaved.length > 0 ? (
                  <MailForm
                    action={saveAllSuggestionsAction}
                    submitLabel={`Save all ${unsaved.length}`}
                    pendingLabel="Saving…"
                    className="inline-form"
                  />
                ) : undefined
              }
            >
              <p className="page-note">
                Each firm type, region and country with at least {suggestions.minimum} leads, and
                the best-fit named people. A suggestion is the question, not a copy of the answer:
                saving it keeps it current as leads are added.
              </p>
              <DataTable
                caption="Suggested lead segments"
                columns={SUGGESTED_COLUMNS}
                columnMenu={false}
                isEmpty={suggestions.suggestions.length === 0}
                empty={
                  <EmptyState
                    compact
                    title="Nothing to suggest yet"
                    description={`A suggestion needs ${suggestions.minimum} leads that share a firm type, a region or a country. Import a file first.`}
                    action={
                      canWrite ? (
                        <ButtonLink href="/leads/import" size="small" variant="primary">
                          Import a file
                        </ButtonLink>
                      ) : undefined
                    }
                  />
                }
              >
                {suggestions.suggestions.map((item) => (
                  <tr key={item.name}>
                    <td>
                      <Link className="table-title" href={listHref(item.conditions)}>
                        {item.name}
                      </Link>
                    </td>
                    <td>{describe(item.conditions.map(split))}</td>
                    <td className="data-table__num">{formatNumber(item.count)}</td>
                    <td>
                      {item.segment_id ? (
                        <span className="table-sub">Saved</span>
                      ) : (
                        canWrite && (
                          <MailForm
                            action={saveViewSegmentAction}
                            fields={{
                              name: item.name,
                              conditions_json: JSON.stringify(item.conditions),
                            }}
                            submitLabel="Save"
                            pendingLabel="Saving…"
                            className="inline-form"
                          />
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </RecordSection>
          </>
        )}
      </div>
    </>
  );
}
