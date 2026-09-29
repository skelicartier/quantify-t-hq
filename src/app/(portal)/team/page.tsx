import Link from "next/link";

import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { kindLabel, roleLabel } from "@/lib/access/role-labels";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readTeam, type DirectoryPerson, type TeamReminder } from "@/lib/api/team";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Team" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "person", label: "Person" },
  { key: "engagement", label: "Engagement" },
  { key: "manager", label: "Reports to" },
  { key: "documents", label: "NDA · IP" },
  { key: "access", label: "Systems" },
  { key: "issued", label: "Issued" },
  { key: "checklist", label: "Checklist" },
  { key: "checkin", label: "This week" },
  { key: "ends", label: "Ends" },
];

function daysWord(days: number): string {
  if (days === 0) return "today";
  if (days < 0) return `${Math.abs(days)} ${Math.abs(days) === 1 ? "day" : "days"} ago`;
  return `in ${days} ${days === 1 ? "day" : "days"}`;
}

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
  let reminders: TeamReminder[] = [];
  try {
    const team = await readTeam(context.token);
    people = team.people;
    reminders = team.reminders;
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
            <Stat
              label="Policies outstanding"
              value={active.reduce((sum, person) => sum + person.policies_outstanding, 0)}
              hint={`${noCheckin.length} without a check-in`}
            />
          </StatGrid>
          {reminders.length > 0 && (
            <section className="props" aria-label="Coming up">
              <h2 className="props__title">Coming up</h2>
              <ul className="team-reminders">
                {reminders.map((item) => (
                  <li key={`${item.staff_id}-${item.kind}-${item.on}`}>
                    <Link href={`/team/${item.staff_id}`}>{item.display_name}</Link> · {item.label}{" "}
                    {formatDate(item.on)}{" "}
                    <span className={item.days <= 7 ? "due due--today" : "side-quiet"}>
                      {daysWord(item.days)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
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
                <td>
                  {person.manager_id ? (
                    <Link href={`/team/${person.manager_id}`}>{person.manager_name || "—"}</Link>
                  ) : (
                    <span className="table-sub">—</span>
                  )}
                </td>
                <td>{documentsPill(person)}</td>
                <td>
                  {person.live_access}
                  {person.access_expiring_soon > 0 && (
                    <span className="table-sub">{person.access_expiring_soon} expiring soon</span>
                  )}
                </td>
                <td>
                  {person.unreturned_assets === 0 ? (
                    <span className="table-sub">—</span>
                  ) : (
                    <>
                      {person.unreturned_assets}
                      <span className="table-sub">
                        {person.unreturned_assets === 1 ? "item out" : "items out"}
                      </span>
                    </>
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
