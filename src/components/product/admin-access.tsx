import { setStaffRole } from "@/app/(portal)/product/access/actions";
import { AdminGate } from "@/components/product/admin-gate";
import { AdminStaffRoleForm } from "@/components/product/admin-staff-role-form";
import { PageHeader } from "@/components/shell/page-header";
import { Badge, RoleBadge } from "@/components/ui/badge";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { ShortId } from "@/components/ui/short-id";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AdminStaffAccess } from "@/lib/product/access";
import type {
  AccountApiStaffMember,
  AccountApiStaffRoleCatalogue,
} from "@/lib/product/account-api";
import { capabilityLabel, roleDescription, roleLabel } from "@/lib/product/role-labels";
import { formatNumber } from "@/lib/format";

type AdminAccessProps = {
  access: AdminStaffAccess;
  now?: number | undefined;
};

const MEMBER_COLUMNS = [
  { key: "person", label: "Person" },
  { key: "role", label: "Role" },
  { key: "status", label: "Account" },
  // A count, not the list. Every account holding a role has exactly that role's
  // permissions, so twenty badges on every row is the same wall written N times — and it
  // squeezes the two columns somebody actually reads. The list in full is one card down.
  { key: "permits", label: "Permissions" },
  { key: "id", label: "Account id" },
] as const;

function accountName(member: AccountApiStaffMember): string {
  if (member.display_name) return member.display_name;
  if (member.email) return member.email;
  // The directory is built from the role stores, so a row can exist for an account whose
  // profile could not be read. Naming it is more useful than hiding it.
  return "Account not readable";
}

function MemberRow({ member }: { member: AccountApiStaffMember }) {
  return (
    <tr>
      <td>
        <span className="data-table__primary">{accountName(member)}</span>
        <span className="data-table__secondary">
          {member.display_name && member.email ? member.email : ""}
          {member.break_glass ? "Pinned by deployment configuration" : ""}
        </span>
      </td>
      <td>
        <RoleBadge role={member.role} />
      </td>
      <td>
        <StatusPill value={member.is_active ? "active" : "inactive"} />
      </td>
      <td className="data-table__num">
        <a href={`#role-${member.role}`} className="row-link">
          {formatNumber(member.capabilities.length)}
        </a>
      </td>
      <td>
        <ShortId value={member.user_id} href={`/product/users/${member.user_id}`} full />
      </td>
    </tr>
  );
}

function RoleCard({ entry }: { entry: AccountApiStaffRoleCatalogue }) {
  return (
    <div className="role-card" id={`role-${entry.role}`}>
      <p className="role-card__head">
        <RoleBadge role={entry.role} />
        {entry.grantable ? null : <span className="quiet">Set from Roles</span>}
      </p>
      <p className="role-card__desc">{roleDescription(entry.role) || roleLabel(entry.role)}</p>
      <span className="chip-list">
        {entry.capabilities.map((capability) => (
          <Badge key={capability}>{capabilityLabel(capability)}</Badge>
        ))}
      </span>
    </div>
  );
}

/**
 * What to tell someone when the directory is missing.
 *
 * Three causes that need three different next actions. The page used to give one sentence
 * for all of them, which meant a permissions problem read as an outage and sent the reader
 * to check a service that was working perfectly.
 */
const STAFF_FAILURE: Record<
  Extract<AdminStaffAccess, { status: "unavailable" }>["reason"],
  { title: string; body: string }
> = {
  forbidden: {
    title: "This account cannot read the staff directory",
    body:
      "The account service refused the read. Reading the directory needs the staff:write " +
      "capability, which only an Owner holds — nothing is wrong with the service.",
  },
  unreachable: {
    title: "The account service could not be reached",
    body:
      "Nothing has changed — this is a read that failed. Reload in a moment; if it persists, " +
      "the service itself is the place to look.",
  },
  unreadable: {
    title: "The account service answered with something HQ could not read",
    body:
      "The response did not match the shape HQ expects, so it was refused rather " +
      "than rendered. That usually means the two are on different versions.",
  },
};

export function AdminAccess({ access, now }: AdminAccessProps) {
  const authorized = access.status === "authorized" ? access : null;
  const staff = authorized?.staff ?? null;
  const members = staff?.members ?? [];
  const elevated = members.filter(
    (member) => member.role === "owner" || member.role === "admin",
  ).length;
  const inactive = members.filter((member) => !member.is_active).length;

  return (
    <>
      <PageHeader
        eyebrow="Product"
        title="Product staff"
        titleId="admin-access-heading"
        description="Everyone who is not a plain account, the role they hold, and exactly what that role permits."
        meta={staff ? <Timestamp value={staff.generated_at} now={now} prefix="Read" /> : undefined}
      />
      <div className="page-content">
        {access.status === "unavailable" ? (
          <Callout tone="danger" role="alert" title={STAFF_FAILURE[access.reason].title}>
            {STAFF_FAILURE[access.reason].body}
            {access.correlationId && (
              <>
                {" "}
                Reference <span className="mono">{access.correlationId}</span>.
              </>
            )}
          </Callout>
        ) : (
          <AdminGate access={access} section="Access control">
            {staff && (
              <div className="stack-board">
                <StatGrid columns={3} label="Staff summary">
                  <Stat label="Staff accounts" value={formatNumber(members.length)} />
                  <Stat label="Owner or Admin" value={formatNumber(elevated)} />
                  <Stat label="Deactivated" value={formatNumber(inactive)} />
                </StatGrid>

                {!staff.legacy_readable && (
                  <Callout tone="attention" compact>
                    The legacy role registry could not be read, so this list is what the database
                    holds. An account whose role exists only in the legacy store is missing from it.
                  </Callout>
                )}

                <Card
                  title="Staff"
                  titleId="admin-access-staff-heading"
                  description="Built from the role stores, so an account whose profile cannot be read is still named."
                >
                  <DataTable
                    caption="Staff accounts"
                    columns={MEMBER_COLUMNS}
                    minWidth={860}
                    isEmpty={members.length === 0}
                    empty={
                      <EmptyState
                        title="No staff accounts"
                        description="Every account is a plain one. Grant a role below to staff the desk."
                      />
                    }
                  >
                    {members.map((member) => (
                      <MemberRow key={member.user_id} member={member} />
                    ))}
                  </DataTable>
                </Card>

                {staff.can_grant ? (
                  <Card
                    title="Grant or remove staff access"
                    titleId="admin-access-grant-heading"
                    description="Owner and Admin are set from Roles. Nobody can change their own access."
                  >
                    <AdminStaffRoleForm action={setStaffRole} />
                  </Card>
                ) : (
                  <Callout tone="neutral" compact>
                    This account can see who is staff but cannot change it.
                  </Callout>
                )}

                <Card
                  title="What each role permits"
                  titleId="admin-access-roles-heading"
                  description="Sent by the account service, not described here, so this page and the rules it renders cannot drift apart."
                >
                  <div className="role-grid">
                    {staff.roles.map((entry) => (
                      <RoleCard key={entry.role} entry={entry} />
                    ))}
                  </div>
                </Card>
              </div>
            )}
          </AdminGate>
        )}
      </div>
    </>
  );
}
