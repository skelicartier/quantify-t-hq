import {
  archiveSegmentAction,
  previewSegmentAction,
  saveSegmentAction,
} from "@/app/(portal)/mail/actions";
import { MailForm } from "@/components/mail/mail-form";
import { MailTabs } from "@/components/mail/mail-tabs";
import { SegmentBuilder } from "@/components/mail/segment-builder";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { describeCondition, readSegments, type SegmentsPage } from "@/lib/api/mail";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";
import Link from "next/link";

export const metadata = { title: "Segments" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "name", label: "Segment" },
  { key: "of", label: "Of" },
  { key: "conditions", label: "Conditions" },
  { key: "count", label: "Matched", align: "end" as const },
  { key: "when", label: "Counted" },
  { key: "actions", label: "" },
];

type SegmentsPageProps = { searchParams: Promise<Record<string, string | string[] | undefined>> };

export default async function SegmentsListPage({ searchParams }: SegmentsPageProps) {
  const context = await requireStaff("/mail/segments");
  const editing = firstSearchValue((await searchParams).edit) ?? "";
  const now = requestNow();
  let page: SegmentsPage | null = null;
  try {
    page = await readSegments(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  const current = page?.segments.find((row) => row.segment_id === editing);
  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="Segments"
        description="A saved question about the CRM — people at customer firms in the UK, leads from the last month — answered again whenever a campaign is scheduled."
        actions={<MailTabs current="/mail/segments" />}
      />
      <div className="page-content">
        {page === null ? (
          <Callout tone="danger" role="alert">
            Segments could not be read just now.
          </Callout>
        ) : (
          <div className="record-layout">
            <div className="record-layout__main">
              <DataTable
                caption="Segments"
                columns={COLUMNS}
                isEmpty={page.segments.length === 0}
                empty={
                  <EmptyState
                    compact
                    title="No segments yet"
                    description="Build one beside this list."
                  />
                }
              >
                {page.segments.map((segment) => (
                  <tr
                    key={segment.segment_id}
                    className={segment.archived_at ? "row--muted" : undefined}
                  >
                    <td>
                      <Link
                        className="table-title"
                        href={`/mail/segments?edit=${segment.segment_id}`}
                      >
                        {segment.name}
                      </Link>
                    </td>
                    <td>{segment.kind === "people" ? "People" : "Leads"}</td>
                    <td>
                      {segment.conditions
                        .map((condition) =>
                          describeCondition(condition, page!.fields[segment.kind]),
                        )
                        .join("; ") || "Everyone"}
                    </td>
                    <td className="data-table__num">{segment.last_count ?? "—"}</td>
                    <td>
                      <Timestamp value={segment.last_evaluated_at} now={now} mode="relative" />
                    </td>
                    <td>
                      {canWrite && (
                        <MailForm
                          action={archiveSegmentAction}
                          fields={{
                            segment_id: segment.segment_id,
                            restore: segment.archived_at ? "1" : "0",
                          }}
                          submitLabel={segment.archived_at ? "Restore" : "Archive"}
                          variant="ghost"
                          className="inline-form"
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
            </div>
            <aside className="record-layout__side">
              <Card
                title={current ? `Edit “${current.name}”` : "New segment"}
                titleAs="h3"
                description="Every condition must hold. Checking shows who matches today and who a campaign could not mail."
                actions={
                  current ? (
                    <Link className="btn btn--small btn--ghost" href="/mail/segments">
                      New instead
                    </Link>
                  ) : undefined
                }
              >
                {canWrite ? (
                  <SegmentBuilder
                    key={current?.segment_id ?? "new"}
                    saveAction={saveSegmentAction}
                    previewAction={previewSegmentAction}
                    fields={page.fields}
                    initial={
                      current
                        ? {
                            segment_id: current.segment_id,
                            name: current.name,
                            kind: current.kind,
                            conditions: current.conditions,
                          }
                        : { name: "", kind: "people", conditions: [] }
                    }
                  />
                ) : (
                  <p className="muted">Your role reads segments without changing them.</p>
                )}
              </Card>
            </aside>
          </div>
        )}
      </div>
    </>
  );
}
