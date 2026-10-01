import Link from "next/link";

import { StagePill } from "@/components/hiring/hiring-parts";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readInterviews, type Interviews } from "@/lib/api/hiring";

export const metadata = { title: "Interviews" };
export const dynamic = "force-dynamic";

/** The applicants you are named to interview, those still waiting on your scorecard first. */
export default async function InterviewsPage() {
  const context = await requireStaff("/hiring/interviews");
  let list: Interviews | null = null;
  try {
    list = await readInterviews(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Work"
        title="Interviews"
        description="The applicants you are named to interview. Write your scorecard before reading anyone else's: until yours is in, theirs stay closed."
      />
      {list === null ? (
        <Callout tone="danger" role="alert">
          Your interviews could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section id="interviews" title="Yours">
            <DataTable
              caption="Applicants you are interviewing"
              columns={[
                { key: "who", label: "Who" },
                { key: "role", label: "Role" },
                { key: "stage", label: "Stage" },
                { key: "card", label: "Your scorecard" },
                { key: "days", label: "Days in stage", align: "end" as const },
              ]}
              isEmpty={list.interviews.length === 0}
              empty={<p className="muted">Nobody is waiting on you.</p>}
              columnMenu={false}
            >
              {list.interviews.map((item) => (
                <tr key={item.applicant_id}>
                  <td>
                    <Link href={`/hiring/applicants/${item.applicant_id}`}>{item.full_name}</Link>
                  </td>
                  <td>{item.opening_title}</td>
                  <td>
                    <StagePill stage={item.stage} label={item.stage_label} />
                  </td>
                  <td>
                    {item.scorecard_written ? (
                      <StatusPill value="done" label="In" tone="live" />
                    ) : (
                      <StatusPill value="due" label="To write" tone="attention" />
                    )}
                  </td>
                  <td className="data-table__num">{item.days_in_stage}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
