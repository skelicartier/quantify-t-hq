import Link from "next/link";

import { HelpTabs } from "@/components/help/help-parts";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readHelpGaps, type HelpGaps } from "@/lib/api/knowledge";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Help centre gaps" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "tag", label: "Tag" },
  { key: "tickets", label: "Tickets with no article", align: "end" as const },
  { key: "articles", label: "Articles with the tag", align: "end" as const },
  { key: "samples", label: "Most recent" },
];

/** The questions customers asked in the last 90 days that no article answered, by tag. */
export default async function HelpGapsPage() {
  const context = await requireStaff("/help/gaps");
  let report: HelpGaps | null = null;
  try {
    report = await readHelpGaps(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const gaps = report?.gaps ?? null;
  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Gaps"
        description="Tickets resolved in the last 90 days that no article answered, grouped by their tags, largest first: where the next article should come from. A ticket with two tags counts under each."
        actions={<HelpTabs current="/help/gaps" />}
      />
      {report === null || !report.available || gaps === null ? (
        <Callout tone="danger" role="alert">
          {report?.reason || "The gaps could not be read just now."} This is not an empty list.
        </Callout>
      ) : (
        <div className="page-content">
          <p className="page-note">
            Since {formatDate(gaps.since)}: {gaps.resolved} ticket{gaps.resolved === 1 ? "" : "s"}{" "}
            resolved, {gaps.answered_with_article} answered with an article.
          </p>
          <Section id="gaps" title="Unanswered, by tag">
            <DataTable
              caption="Tags of resolved tickets no article answered"
              columns={COLUMNS}
              isEmpty={gaps.groups.length === 0}
              empty={<p className="muted">Every resolved ticket was answered with an article.</p>}
              columnMenu={false}
            >
              {gaps.groups.map((group) => (
                <tr key={group.tag}>
                  <td>{group.tag === "untagged" ? "No tag" : group.tag}</td>
                  <td className="data-table__num">{group.tickets}</td>
                  <td className="data-table__num">{group.articles_with_tag}</td>
                  <td>
                    {group.samples.map((sample, index) => (
                      <span key={sample.ticket_id}>
                        {index > 0 && " · "}
                        <Link href={`/support/${sample.ticket_id}`}>
                          {sample.subject || sample.ticket_id}
                        </Link>
                      </span>
                    ))}
                  </td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
