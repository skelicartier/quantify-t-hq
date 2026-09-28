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
import { AdminTabs } from "@/components/admin/admin-tabs";
import {
  ReinviteForm,
  StaffDetailsForm,
  StaffReasonForm,
  StaffRoleForm,
} from "@/components/admin/staff-forms";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { RecordHeader } from "@/components/ui/record-shell";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { ROLE_ORDER, kindLabel, roleDescription, roleLabel } from "@/lib/access/role-labels";
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

export const metadata = { title: "Staff member" };
export const dynamic = "force-dynamic";

type StaffMemberPageProps = { params: Promise<{ staffId: string }> };

export default async function StaffMemberPage({ params }: StaffMemberPageProps) {
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
  let history: AuditEvent[] | null = hasCapability(context, "audit:read") ? null : [];
  if (hasCapability(context, "audit:read")) {
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
  const returnPath = `/admin/staff/${member.staff_id}`;

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/admin/staff", label: "Staff" }]}
        title={member.display_name || member.email}
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
          {
            label: "Last sign-in",
            value: (
              <Timestamp value={member.last_login_at} now={now} mode="relative" fallback="Never" />
            ),
          },
        ]}
        actions={<AdminTabs current="/admin/staff" />}
      />
      <SudoGate
        action={confirmSudoAction}
        fresh={fresh}
        untilLabel={untilLabel}
        returnPath={returnPath}
        purpose="Changes to someone's access need a fresh code from your authenticator app."
      />
      {!mayManage && (
        <Callout tone="neutral" compact>
          Only an Owner changes an Owner or Admin. You can read this record.
        </Callout>
      )}
      <div className="record-layout">
        <div className="record-layout__main">
          <Card title="Record" titleAs="h2">
            <KeyValue columns={2}>
              <KeyValueRow label="Role">{roleLabel(member.role)}</KeyValueRow>
              <KeyValueRow label="Engagement">{kindLabel(member.kind)}</KeyValueRow>
              <KeyValueRow label="Starts">
                {member.starts_on ? formatDate(member.starts_on) : "—"}
              </KeyValueRow>
              <KeyValueRow label="Access ends">
                {member.ends_on ? formatDate(member.ends_on) : "No end date"}
              </KeyValueRow>
              <KeyValueRow label="Work email" mono>
                {member.email}
              </KeyValueRow>
              <KeyValueRow label="Personal email" mono>
                {member.personal_email || "—"}
              </KeyValueRow>
              <KeyValueRow label="Live sessions">{member.live_sessions}</KeyValueRow>
              <KeyValueRow label="Last sign-in">
                <Timestamp value={member.last_login_at} now={now} mode="both" fallback="Never" />
              </KeyValueRow>
            </KeyValue>
            <p className="side-quiet role-note">{roleDescription(member.role)}</p>
          </Card>
          {hasCapability(context, "audit:read") && (
            <section className="record-section" aria-labelledby="staff-history">
              <div className="record-section__head">
                <h2 className="record-section__title" id="staff-history">
                  Changes to this person
                </h2>
                <Link className="btn btn--small" href={`/admin/audit?entity_id=${member.staff_id}`}>
                  Full audit
                </Link>
              </div>
              {history === null ? (
                <Callout tone="danger" compact>
                  Changes to this person could not be read just now — a read failure, not an empty
                  history.
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
            </section>
          )}
        </div>
        <aside className="record-layout__side">
          {mayManage && !isSelf && (
            <Card title="Role" titleAs="h3">
              <StaffRoleForm
                action={changeStaffRoleAction}
                staffId={member.staff_id}
                current={member.role}
                grantable={grantable}
                disabled={!fresh}
              />
            </Card>
          )}
          {mayManage && (
            <Card title="Details" titleAs="h3">
              <StaffDetailsForm
                action={updateStaffDetailsAction}
                staff={member}
                disabled={!fresh}
              />
            </Card>
          )}
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
          {(mayManage || isSelf) && member.totp_enrolled && (
            <Card
              title="Reset authenticator"
              titleAs="h3"
              description="For a lost or replaced phone. Their sessions and recovery codes end; they enrol again at next sign-in."
            >
              <StaffReasonForm
                action={resetAuthenticatorAction}
                staffId={member.staff_id}
                label="Reset authenticator"
                pendingLabel="Resetting…"
                hint="Kept in the audit log."
                danger
                disabled={!fresh}
              />
            </Card>
          )}
        </aside>
      </div>
    </>
  );
}
