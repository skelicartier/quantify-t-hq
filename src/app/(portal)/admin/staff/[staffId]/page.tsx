import Link from "next/link";
import { notFound } from "next/navigation";

import {
  changeStaffRoleAction,
  confirmSudoAction,
  deactivateStaffAction,
  reactivateStaffAction,
  reinviteStaffAction,
  resetAuthenticatorAction,
  updateStaffDetailsAction,
} from "@/app/(portal)/admin/actions";
import {
  ReinviteForm,
  ResetAuthenticatorForm,
  StaffReasonForm,
  StaffRoleForm,
} from "@/components/admin/staff-forms";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { InlineField } from "@/components/ui/inline-field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
  RecordTabs,
  currentTab,
} from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import {
  ROLE_ORDER,
  STAFF_KINDS,
  kindLabel,
  roleDescription,
  roleLabel,
} from "@/lib/access/role-labels";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  readRolesMatrix,
  readStaffMember,
  searchAudit,
  type AuditEvent,
  type StaffDetail,
} from "@/lib/api/staff";
import { formatAbsolute, formatDate, formatSentence } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Staff member" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "overview", label: "Overview" },
  { key: "changes", label: "Changes" },
] as const;

type StaffMemberPageProps = {
  params: Promise<{ staffId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function StaffMemberPage({ params, searchParams }: StaffMemberPageProps) {
  const { staffId } = await params;
  const context = await requireStaff(`/admin/staff/${staffId}`);
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Staff member" />
        <Callout tone="neutral">Staff are managed by HQ admins.</Callout>
      </>
    );
  }
  const now = requestNow();

  let member: StaffDetail;
  try {
    member = (await readStaffMember(context.token, staffId)).staff;
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    throw error;
  }
  let grantableByAdmin: string[] = [];
  try {
    grantableByAdmin = (await readRolesMatrix(context.token)).grantable_by_admin;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  // Null is a read failure, told apart from a person nobody has changed yet.
  const canAudit = hasCapability(context, "audit:read");
  let history: AuditEvent[] | null = canAudit ? null : [];
  if (canAudit) {
    try {
      history = (
        await searchAudit(
          context.token,
          { entity_type: "staff", entity_id: staffId },
          { limit: 20, offset: 0 },
        )
      ).events;
    } catch (error) {
      if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
        throw error;
    }
  }

  const isOwner = context.me.role === "owner";
  const isSelf = member.staff_id === context.me.staff.staff_id;
  const protectedTarget = member.role === "owner" || member.role === "admin";
  const mayManage = isOwner || !protectedTarget;
  const fresh = context.me.sudo_fresh;
  const grantable = isOwner
    ? [...ROLE_ORDER]
    : ROLE_ORDER.filter((role) => grantableByAdmin.includes(role));
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const base = `/admin/staff/${member.staff_id}`;
  const tabs = canAudit
    ? [TABS[0], { ...TABS[1], count: history?.length ?? undefined }]
    : [TABS[0]];
  const tab = currentTab(firstSearchValue((await searchParams).tab), tabs);
  const inline = {
    action: updateStaffDetailsAction,
    idName: "staff_id",
    id: member.staff_id,
    readOnly: !mayManage || !fresh,
  };

  const changes = (
    <RecordSection
      id="staff-history"
      title="Changes to this person"
      actions={
        <Link className="btn btn--small" href={`/admin/audit?entity_id=${member.staff_id}`}>
          Full audit
        </Link>
      }
    >
      {history === null ? (
        <Callout tone="danger" compact>
          Changes to this person could not be read just now — a read failure, not an empty history.
        </Callout>
      ) : history.length === 0 ? (
        <p className="timeline-empty">No recorded changes.</p>
      ) : (
        <ol className="timeline" aria-label="Changes">
          {history.map((event, index) => (
            <li key={`${event.occurred_at}-${index}`} className="timeline__item">
              <span className="timeline__kind">
                {formatSentence(event.action.split(".")[1] ?? event.action)}
              </span>
              <div className="timeline__main">
                <p className="timeline__meta">
                  <Timestamp value={event.occurred_at} now={now} mode="relative" />
                </p>
                <p className="timeline__body">{event.reason || "No reason recorded."}</p>
              </div>
            </li>
          ))}
        </ol>
      )}
    </RecordSection>
  );

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/admin/staff", label: "Staff" }]}
        title={member.display_name || member.email}
        favourite={{ href: base, label: member.display_name || member.email, kind: "Staff" }}
        status={
          <>
            <StatusPill
              value={member.is_active ? "active" : "inactive"}
              label={member.is_active ? "Active" : member.joined ? "Deactivated" : "Invite pending"}
            />
            {member.totp_enrolled === false && (
              <StatusPill value="attention" label="No authenticator yet" tone="attention" />
            )}
            <span className="mono quiet">{member.email}</span>
          </>
        }
        readouts={[
          { label: "Role", value: roleLabel(member.role) },
          { label: "Engagement", value: kindLabel(member.kind) },
          { label: "Sessions", value: member.live_sessions },
          {
            label: "Last sign-in",
            value: (
              <Timestamp value={member.last_login_at} now={now} mode="relative" fallback="Never" />
            ),
          },
        ]}
        actions={
          hasCapability(context, "hr:read") ? (
            <Link className="btn btn--small" href={`/team/${member.staff_id}`}>
              Team record
            </Link>
          ) : undefined
        }
      />
      <SudoGate
        action={confirmSudoAction}
        fresh={fresh}
        untilLabel={untilLabel}
        returnPath={base}
        purpose="Changes to someone's access need a fresh code from your authenticator app."
      />
      {!mayManage && (
        <Callout tone="neutral" compact>
          Only an Owner changes an Owner or Admin. You can read this record.
        </Callout>
      )}
      <RecordTabs base={base} tabs={tabs} current={tab} label="Staff member sections" />
      <RecordGrid
        side={
          <Properties title="Record">
            <InlineField {...inline} name="display_name" label="Name" value={member.display_name} />
            <Property label="Role">
              {roleLabel(member.role)}
              <span className="table-sub">{roleDescription(member.role)}</span>
            </Property>
            <InlineField
              {...inline}
              name="kind"
              label="Engagement"
              type="select"
              options={STAFF_KINDS.map((kind) => ({ value: kind, label: kindLabel(kind) }))}
              value={member.kind}
            />
            <InlineField
              {...inline}
              name="starts_on"
              label="Starts"
              type="date"
              value={member.starts_on ?? ""}
              display={member.starts_on ? formatDate(member.starts_on) : "—"}
            />
            <InlineField
              {...inline}
              name="ends_on"
              label="Access ends"
              type="date"
              value={member.ends_on ?? ""}
              display={member.ends_on ? formatDate(member.ends_on) : "No end date"}
            />
            <Property label="Work email" mono>
              {member.email}
            </Property>
            <InlineField
              {...inline}
              name="personal_email"
              label="Personal email"
              type="email"
              value={member.personal_email}
              placeholder="Where to reach them after they leave"
            />
            <Property label="Authenticator">
              {member.totp_enrolled === null
                ? "Unknown"
                : member.totp_enrolled
                  ? "Enrolled"
                  : "Not enrolled yet"}
            </Property>
            <Property label="Live sessions">{member.live_sessions}</Property>
            <Property label="Last sign-in">
              <Timestamp value={member.last_login_at} now={now} mode="both" fallback="Never" />
            </Property>
            <Property label="Added">{formatDate(member.created_at, "—")}</Property>
          </Properties>
        }
      >
        {tab === "overview" && (
          <>
            {mayManage && !isSelf && (
              <RecordSection id="staff-role" title="Role">
                <StaffRoleForm
                  action={changeStaffRoleAction}
                  staffId={member.staff_id}
                  current={member.role}
                  grantable={grantable}
                  disabled={!fresh}
                />
              </RecordSection>
            )}
            {(mayManage || isSelf) && (
              <RecordSection id="staff-access" title="Access">
                <div className="card-grid">
                  {mayManage && !isSelf && member.is_active && (
                    <Card
                      title="Remove access"
                      titleAs="h3"
                      danger
                      description="Ends every session at once and cancels any open invite."
                    >
                      <StaffReasonForm
                        action={deactivateStaffAction}
                        staffId={member.staff_id}
                        label="Deactivate"
                        pendingLabel="Deactivating…"
                        hint="Kept in the audit log for the access review."
                        danger
                        disabled={!fresh}
                      />
                    </Card>
                  )}
                  {mayManage && !isSelf && !member.is_active && member.joined && (
                    <Card
                      title="Restore access"
                      titleAs="h3"
                      description="They sign in again with their existing password and authenticator."
                    >
                      <StaffReasonForm
                        action={reactivateStaffAction}
                        staffId={member.staff_id}
                        label="Reactivate"
                        pendingLabel="Reactivating…"
                        hint="Kept in the audit log for the access review."
                        disabled={!fresh}
                      />
                    </Card>
                  )}
                  {mayManage && !member.is_active && !member.joined && (
                    <Card
                      title="Invite pending"
                      titleAs="h3"
                      description="They have not accepted their invite. Invites last a day; issue a new one if theirs lapsed."
                    >
                      <ReinviteForm
                        action={reinviteStaffAction}
                        staffId={member.staff_id}
                        disabled={!fresh}
                      />
                    </Card>
                  )}
                  {(mayManage || isSelf) && member.joined && (
                    <Card
                      title="Reset authenticator"
                      titleAs="h3"
                      description={
                        member.totp_enrolled
                          ? "For a lost or replaced phone. Their sessions, recovery codes and passkeys end, and you get a one-time link to hand them: their password alone no longer sets up a new authenticator. An owner's or admin's reset waits for a second owner."
                          : "They have no authenticator now and can only enrol one with the one-time link from their reset. If that link was lost or has lapsed, reset again for a new one; the old link stops working."
                      }
                    >
                      <ResetAuthenticatorForm
                        action={resetAuthenticatorAction}
                        staffId={member.staff_id}
                        disabled={!fresh}
                        again={!member.totp_enrolled}
                      />
                    </Card>
                  )}
                  {isSelf && member.is_active && (
                    <Card
                      title="Your own access"
                      titleAs="h3"
                      description="You cannot change your own role or remove your own access here; another Owner does that."
                    />
                  )}
                </div>
              </RecordSection>
            )}
            {canAudit && changes}
          </>
        )}
        {tab === "changes" && changes}
      </RecordGrid>
    </>
  );
}
