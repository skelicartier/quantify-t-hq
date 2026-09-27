import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { kindLabel, roleLabel } from "@/lib/access/role-labels";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readTeam, type DirectoryPerson } from "@/lib/api/team";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "person", label: "Person" },
  { key: "engagement", label: "Engagement" },
  { key: "documents", label: "NDA · IP" },
  { key: "access", label: "Systems" },
  { key: "checklist", label: "Checklist" },
  { key: "checkin", label: "This week" },
  { key: "ends", label: "Ends" },
];

function documentsPill(person: DirectoryPerson) {
  if (person.documents_ok) return <StatusPill value="signed" label="Both in" tone="live" />;
  const missing = [
    person.documents.nda === "missing" || person.documents.nda === "requested" ? "NDA" : null,
    person.documents.ip_assignment === "missing" || person.documents.ip_assignment === "requested"
      ? "IP"
      : null,
  ].filter(Boolean);
  return <StatusPill value="missing" label={`Missing ${missing.join(" · ")}`} tone="danger" />;
}

export default async function TeamPage() {
  const context = await requireStaff("/team");
  if (!hasCapability(context, "hr:read")) {
    return (
      <>
        <PageHeader eyebrow="Team" title="Team" />
        <Callout tone="neutral">Team records are kept by HQ admins.</Callout>
      </>
    );
  }
  let people: DirectoryPerson[] | null = null;
  try {
    people = (await readTeam(context.token)).people;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const active = (people ?? []).filter((person) => person.is_active);
  const missingDocs = active.filter((person) => !person.documents_ok);
  const endingSoon = active.filter(
    (person) =>
      person.ends_in_days !== null && person.ends_in_days >= 0 && person.ends_in_days <= 30,
  );
  const noCheckin = active.filter((person) => !person.checked_in_this_week);

  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Team"
        description="Everyone who works here: what they signed, what they can reach, and how their week is going."
      />
      {people === null ? (
        <Callout tone="danger" role="alert">
          The team could not be read just now. This is a read failure, not an empty team.
        </Callout>
      ) : (
        <>
          <StatGrid columns={4} label="The team">
            <Stat label="Active" value={active.length} />
            <Stat
              label="Documents missing"
              value={missingDocs.length}
              tone={missingDocs.length > 0 ? "danger" : "default"}
              hint="NDA or IP assignment"
            />
            <Stat label="Ending in 30 days" value={endingSoon.length} />
            <Stat label="No check-in this week" value={noCheckin.length} />
          </StatGrid>
          <DataTable caption="Team" columns={COLUMNS} scroll={false}>
            {people.map((person) => (
              <tr key={person.staff_id} className={person.is_active ? undefined : "row--muted"}>
                <td>
                  <Link className="table-title" href={`/team/${person.staff_id}`}>
                    {person.display_name || person.email}
                  </Link>
                  <span className="table-sub">
                    {roleLabel(person.role)}
                    {person.away_today && " · away today"}
                  </span>
                </td>
                <td>{kindLabel(person.kind)}</td>
                <td>{documentsPill(person)}</td>
                <td>
                  {person.live_access}
                  {person.access_expiring_soon > 0 && (
                    <span className="table-sub">{person.access_expiring_soon} expiring soon</span>
                  )}
                </td>
                <td>
                  {person.open_checklists.length === 0 ? (
                    <span className="table-sub">—</span>
                  ) : (
                    person.open_checklists.map((run) => (
                      <span key={run.run_id} className={run.overdue ? "due due--overdue" : "due"}>
                        {run.kind === "offboarding" ? "Offboarding" : "Onboarding"} {run.done}/
                        {run.total}
                      </span>
                    ))
                  )}
                </td>
                <td>
                  {person.checked_in_this_week ? (
                    <StatusPill value="done" label="Checked in" tone="live" />
                  ) : (
                    <span className="table-sub">Not yet</span>
                  )}
                </td>
                <td>
                  {person.ends_on ? (
                    <span
                      className={
                        person.ends_in_days !== null && person.ends_in_days <= 30
                          ? "due due--today"
                          : "due"
                      }
                    >
                      {formatDate(person.ends_on)}
                    </span>
                  ) : (
                    <span className="table-sub">—</span>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </>
      )}
    </>
  );
}
