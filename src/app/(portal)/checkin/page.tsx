import Link from "next/link";

import { submitCheckinAction } from "@/app/(portal)/team/actions";
import { PageHeader } from "@/components/shell/page-header";
import { CheckinForm } from "@/components/team/team-forms";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { directoryOrNull, nameFor } from "@/lib/api/staff";
import { readCheckins, type CheckinsPage } from "@/lib/api/team";

export const metadata = { title: "Check-in" };
export const dynamic = "force-dynamic";

const MOOD_WORDS = ["", "Rough", "Meh", "Steady", "Good", "Great"];

export default async function CheckinPage() {
  const context = await requireStaff("/checkin");
  let page: CheckinsPage | null = null;
  try {
    page = await readCheckins(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = page?.team ? await directoryOrNull(context.token) : new Map();

  return (
    <>
      <PageHeader
        eyebrow="Work"
        title="Weekly check-in"
        description="Three questions, once a week: what went well, what is next, what is in the way."
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          Check-ins could not be read just now. Nothing was lost.
        </Callout>
      ) : (
        <div className="record-layout">
          <div className="record-layout__main">
            <Card title={page.mine ? "Your check-in this week" : "This week"} titleAs="h2">
              <CheckinForm
                action={submitCheckinAction}
                weeks={[
                  { value: page.this_week, label: `This week (${page.this_week})` },
                  { value: page.last_week, label: `Last week (${page.last_week})` },
                ]}
                initial={page.mine}
              />
            </Card>
          </div>
          {page.team && (
            <aside className="record-layout__side">
              <Card title={`The team, ${page.week}`} titleAs="h3">
                {page.team.length === 0 ? (
                  <p className="side-quiet">Nobody has checked in yet.</p>
                ) : (
                  <ul className="side-list">
                    {page.team.map((checkin) => (
                      <li key={checkin.staff_id} className="checkin checkin--compact">
                        <p className="checkin__head">
                          <Link href={`/team/${checkin.staff_id}`}>
                            {nameFor(names, checkin.staff_id, "A colleague")}
                          </Link>
                          <span className={`mood mood--${checkin.mood}`}>
                            {MOOD_WORDS[checkin.mood]}
                          </span>
                        </p>
                        {checkin.blockers && (
                          <p className="checkin__line checkin__line--blocker">
                            <strong>Blocked</strong> {checkin.blockers}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
                {page.missing && page.missing.length > 0 && (
                  <p className="side-quiet report-note">
                    Not yet: {page.missing.map((person) => person.display_name).join(", ")}
                  </p>
                )}
              </Card>
            </aside>
          )}
        </div>
      )}
    </>
  );
}
