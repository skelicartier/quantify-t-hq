import { createMeetingAction } from "@/app/(portal)/meetings/actions";
import { MeetingCreateForm } from "@/components/crm/meeting-forms";
import { MeetingList } from "@/components/crm/meeting-list";
import { LiveRefresh } from "@/components/shell/live-refresh";
import { DocumentTools } from "@/components/documents/document-tools";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Popover } from "@/components/ui/popover";
import { Stat, StatGrid } from "@/components/ui/stat";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readCompanies } from "@/lib/api/crm";
import { readMeetings, type MeetingsPage } from "@/lib/api/meetings";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Meetings" };
export const dynamic = "force-dynamic";

const WINDOWS = [
  ["upcoming", "Upcoming"],
  ["needs_outcome", "Outcome owed"],
  ["past", "Past"],
] as const;

type MeetingsIndexProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function MeetingsIndexPage({ searchParams }: MeetingsIndexProps) {
  const context = await requireStaff("/meetings");
  const requested = firstSearchValue((await searchParams).when) ?? "upcoming";
  const when = WINDOWS.some(([value]) => value === requested)
    ? (requested as (typeof WINDOWS)[number][0])
    : "upcoming";

  let page: MeetingsPage | null = null;
  try {
    page = await readMeetings(context.token, when);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  let companies: { id: string; label: string }[] = [];
  if (canWrite) {
    try {
      companies = (await readCompanies(context.token)).companies.map((company) => ({
        id: company.company_id,
        label: company.name,
      }));
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }

  return (
    <>
      <PageHeader
        eyebrow="Work"
        title="Meetings"
        description="Demos and calls, booked or logged. Once a meeting starts, its outcome is owed for seven days."
        actions={
          <>
            <SegmentedLinks
              label="Which meetings"
              items={WINDOWS.map(([value, label]) => ({
                href: value === "upcoming" ? "/meetings" : `/meetings?when=${value}`,
                label,
                current: when === value,
              }))}
            />
            {canWrite && (
              <Popover label="Log a meeting" variant="primary" width="wide">
                <MeetingCreateForm action={createMeetingAction} companies={companies} />
              </Popover>
            )}
            <DocumentTools context={context} kind="meetings" returnPath="/meetings" />
          </>
        }
      />
      <LiveRefresh intervalSeconds={120} label="Meetings" />
      {page === null ? (
        <Callout tone="danger" role="alert">
          Meetings could not be read just now. This is a read failure, not an empty calendar.
        </Callout>
      ) : (
        <>
          <StatGrid columns={2} label="Meetings">
            <Stat label="Today (UTC)" value={page.counts.today} />
            <Stat
              label="Outcomes owed"
              value={page.counts.needs_outcome}
              tone={page.counts.needs_outcome > 0 ? "danger" : "default"}
              hint="Held in the last seven days, nothing recorded"
            />
          </StatGrid>
          <MeetingList
            meetings={page.meetings}
            emptyLabel={
              when === "needs_outcome"
                ? "Every recent meeting has its outcome."
                : when === "past"
                  ? "No past meetings yet."
                  : "Nothing booked. Log a meeting, or connect the calendar in Admin."
            }
          />
        </>
      )}
    </>
  );
}
