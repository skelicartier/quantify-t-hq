import Link from "next/link";

import { confirmSudoAction, inviteStaffAction } from "@/app/(portal)/admin/actions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { InviteStaffForm } from "@/components/admin/staff-forms";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { ROLE_ORDER, kindLabel, roleLabel } from "@/lib/access/role-labels";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { listStaff, readRolesMatrix, type RolesMatrix, type StaffMember } from "@/lib/api/staff";
import { isoDay, isoDayPlus } from "@/lib/crm/dates";
import { formatAbsolute, formatDate } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Staff" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "person", label: "Person" },
  { key: "role", label: "Role" },
  { key: "kind", label: "Engagement" },
  { key: "access", label: "Access" },
  { key: "factor", label: "Authenticator" },
  { key: "ends", label: "Access ends" },
  { key: "seen", label: "Last sign-in" },
];

/** The capabilities as a person reads them, in the matrix's column order. */
const CAPABILITY_LABELS: ReadonlyArray<[string, string]> = [
  ["crm:read", "Read the CRM"],
  ["crm:write", "Edit the CRM"],
  ["crm:export", "Export CRM data"],
  ["deals:read", "See the pipeline"],
  ["deals:write", "Move and close deals"],
  ["tickets:read", "Read the desk"],
  ["tickets:write", "Answer tickets"],
  ["tickets:manage", "Run the desk"],
  ["revenue:read", "See revenue"],
  ["revenue:write", "Edit contracts"],
  ["hr:read", "See team records"],
  ["hr:write", "Edit team records"],
  ["certificates:issue", "Issue certificates"],
  ["audit:read", "Read the audit log"],
  ["hq:admin", "Administer HQ"],
];

function accessState(member: StaffMember, today: string): { value: string; label: string } {
  if (!member.is_active) {
    return member.last_login_at
      ? { value: "inactive", label: "Deactivated" }
      : { value: "pending-review", label: "Never signed in" };
  }
  if (member.ends_on && member.ends_on.slice(0, 10) < today) {
    return { value: "expired", label: "Engagement ended" };
  }
  return { value: "active", label: "Active" };
}

export default async function StaffPage() {
  const context = await requireStaff("/admin/staff");
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Staff" />
        <Callout tone="neutral">Staff are managed by HQ admins.</Callout>
      </>
    );
  }
  const now = requestNow();
  const today = isoDay(now);
  const soon = isoDayPlus(now, 14);

  let staff: StaffMember[] | null = null;
  try {
    staff = (await listStaff(context.token)).staff;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  let matrix: RolesMatrix | null = null;
  try {
    matrix = await readRolesMatrix(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  const isOwner = context.me.role === "owner";
  const grantable = isOwner
    ? [...ROLE_ORDER]
    : ROLE_ORDER.filter((role) => (matrix?.grantable_by_admin ?? []).includes(role));
  const active = (staff ?? []).filter((member) => member.is_active);
  const invited = (staff ?? []).filter((member) => !member.is_active && !member.last_login_at);
  const endingSoon = active.filter(
    (member) =>
      member.ends_on && member.ends_on.slice(0, 10) >= today && member.ends_on.slice(0, 10) <= soon,
  );
  const noFactor = active.filter((member) => member.totp_enrolled === false);
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const ordered = [...(staff ?? [])].sort(
    (a, b) =>
      Number(b.is_active) - Number(a.is_active) ||
      ROLE_ORDER.indexOf(a.role as (typeof ROLE_ORDER)[number]) -
        ROLE_ORDER.indexOf(b.role as (typeof ROLE_ORDER)[number]) ||
      (a.display_name || a.email).localeCompare(b.display_name || b.email),
  );

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Staff"
        description="Everyone who can sign in to HQ, what their role allows, and when their access ends."
        actions={<AdminTabs current="/admin/staff" />}
      />
      <SudoGate
        action={confirmSudoAction}
        fresh={context.me.sudo_fresh}
        untilLabel={untilLabel}
        returnPath="/admin/staff"
        purpose="Inviting, changing roles and removing access need a fresh code from your authenticator app."
      />
      {staff === null ? (
        <Callout tone="danger" role="alert">
          Staff could not be read just now. This is a read failure, not an empty team.
        </Callout>
      ) : (
        <>
          <StatGrid columns={4} label="The team">
            <Stat label="Active" value={active.length} />
            <Stat
              label="Never signed in"
              value={invited.length}
              hint="Invited, or removed before joining"
            />
            <Stat
              label="Access ends in 14 days"
              value={endingSoon.length}
              tone={endingSoon.length > 0 ? "danger" : "default"}
            />
            <Stat
              label="No authenticator"
              value={noFactor.length}
              tone={noFactor.length > 0 ? "danger" : "default"}
              hint="Active people who have not enrolled"
            />
          </StatGrid>
          <div className="record-layout">
            <div className="record-layout__main">
              <DataTable caption="Staff" columns={COLUMNS} scroll={false}>
                {ordered.map((member) => {
                  const access = accessState(member, today);
                  const ends = member.ends_on?.slice(0, 10) ?? "";
                  return (
                    <tr
                      key={member.staff_id}
                      className={member.is_active ? undefined : "row--muted"}
                    >
                      <td>
                        <Link className="table-title" href={`/admin/staff/${member.staff_id}`}>
                          {member.display_name || member.email}
                        </Link>
                        <span className="table-sub">{member.email}</span>
                      </td>
                      <td>{roleLabel(member.role)}</td>
                      <td>{kindLabel(member.kind)}</td>
                      <td>
                        <StatusPill value={access.value} label={access.label} />
                      </td>
                      <td>
                        {member.totp_enrolled === null ? (
                          <span className="table-sub">Unknown</span>
                        ) : member.totp_enrolled ? (
                          <StatusPill value="enabled" label="Enrolled" />
                        ) : (
                          <StatusPill value="attention" label="Not yet" tone="attention" />
                        )}
                      </td>
                      <td>
                        {ends ? (
                          <span
                            className={ends <= soon && ends >= today ? "due due--today" : "due"}
                          >
                            {formatDate(ends)}
                          </span>
                        ) : (
                          <span className="table-sub">No end date</span>
                        )}
                      </td>
                      <td>
                        <Timestamp
                          value={member.last_login_at}
                          now={now}
                          mode="relative"
                          fallback="Never"
                        />
                      </td>
                    </tr>
                  );
                })}
              </DataTable>
              {matrix && (
                <Card
                  title="What each role can do"
                  titleAs="h2"
                  description="Set by the service; the portal only shows it."
                >
                  <div
                    className="table-frame table-frame--full"
                    role="region"
                    aria-label="Roles and permissions"
                    tabIndex={0}
                  >
                    <table className="data-table matrix">
                      <caption className="sr-only">Roles and permissions</caption>
                      <thead>
                        <tr>
                          <th scope="col">Can</th>
                          {ROLE_ORDER.map((role) => (
                            <th key={role} scope="col" className="matrix__role">
                              {roleLabel(role)}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {CAPABILITY_LABELS.map(([capability, label]) => (
                          <tr key={capability}>
                            <th scope="row">{label}</th>
                            {ROLE_ORDER.map((role) => {
                              const held = (matrix.roles[role] ?? []).includes(capability);
                              return (
                                <td key={role} className={held ? "matrix__yes" : "matrix__no"}>
                                  {held ? "Yes" : "—"}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </Card>
              )}
            </div>
            <aside className="record-layout__side">
              <Card
                title="Invite someone"
                titleAs="h3"
                description={
                  isOwner
                    ? "Their account stays inactive until they accept and enrol an authenticator."
                    : "Admins invite Sales, Support and Intern roles. Owner and Admin come from an Owner."
                }
              >
                <InviteStaffForm
                  action={inviteStaffAction}
                  grantable={grantable}
                  disabled={!context.me.sudo_fresh}
                />
              </Card>
            </aside>
          </div>
        </>
      )}
    </>
  );
}
