import { AdminGate } from "@/components/product/admin-gate";
import { AdminUserActivationForm } from "@/components/product/admin-user-activation-form";
import { AdminUserRoleForm } from "@/components/product/admin-user-role-form";
import { AdminUserSessionRevokeForm } from "@/components/product/admin-user-session-revoke-form";
import { AdminUserSubscription } from "@/components/product/admin-user-subscription";
import { PageHeader } from "@/components/shell/page-header";
import { RoleBadge } from "@/components/ui/badge";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { KeyValue, KeyValueRow } from "@/components/ui/key-value";
import { ShortId } from "@/components/ui/short-id";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import type { AdminUserDetailAccess } from "@/lib/product/access";
import {
  ROLE_WRITE_CAPABILITY,
  SUBSCRIPTION_WRITE_CAPABILITY,
  USER_ACTIVATION_CAPABILITY,
  USER_SESSION_REVOKE_CAPABILITY,
} from "@/lib/product/account-api";
import { planLabel } from "@/lib/product/plan-catalogue";
import { mismatchLabel, mismatchTone, roleLabel } from "@/lib/product/role-labels";
import type {
  AdminEntitlementOverrideState,
  AdminSubscriptionPlanState,
} from "@/lib/product/subscription";
import type { AdminUserActivationState } from "@/lib/product/user-activation";
import type { AdminUserRoleState } from "@/lib/product/user-role";
import type { AdminUserSessionRevocationState } from "@/lib/product/user-session-revocation";
import { formatLabel, formatNumber } from "@/lib/format";

type AdminUserDetailProps = {
  access: AdminUserDetailAccess;
  activationAction?: (
    state: AdminUserActivationState,
    formData: FormData,
  ) => Promise<AdminUserActivationState>;
  sessionRevokeAction?: (
    state: AdminUserSessionRevocationState,
    formData: FormData,
  ) => Promise<AdminUserSessionRevocationState>;
  roleAction?: (state: AdminUserRoleState, formData: FormData) => Promise<AdminUserRoleState>;
  planAction?: (
    state: AdminSubscriptionPlanState,
    formData: FormData,
  ) => Promise<AdminSubscriptionPlanState>;
  overrideAction?: (
    state: AdminEntitlementOverrideState,
    formData: FormData,
  ) => Promise<AdminEntitlementOverrideState>;
  now?: number | undefined;
};

type AuthorizedAdminUserDetailAccess = Extract<AdminUserDetailAccess, { status: "authorized" }>;

function accountName(user: AuthorizedAdminUserDetailAccess["detail"]["user"]): string {
  return user.display_name || user.email || "Unnamed account";
}

function sessionState(
  session: AuthorizedAdminUserDetailAccess["detail"]["sessions"][number],
  now: number | undefined,
): "revoked" | "expired" | "active" {
  if (session.revoked_at) return "revoked";
  // Without a reference instant the expiry cannot be judged, so the row stays "active"
  // rather than guessing from the render-time clock.
  if (now !== undefined && session.expires_at && Date.parse(session.expires_at) <= now) {
    return "expired";
  }
  return "active";
}

const SESSION_COLUMNS = [
  { key: "device", label: "Device" },
  { key: "status", label: "Status" },
  { key: "last-seen", label: "Last seen" },
  { key: "expires", label: "Expires" },
  { key: "action", label: <span className="sr-only">Action</span> },
] as const;

const EVENT_COLUMNS = [
  { key: "when", label: "When" },
  { key: "event", label: "Event" },
  { key: "outcome", label: "Outcome" },
  { key: "surface", label: "Surface" },
] as const;

export function AdminUserDetail({
  access,
  activationAction,
  sessionRevokeAction,
  roleAction,
  planAction,
  overrideAction,
  now,
}: AdminUserDetailProps) {
  const { me } = access;
  const detail = access.status === "authorized" ? access.detail : null;
  const usage = access.status === "authorized" ? access.usage : null;
  const isSelf = Boolean(detail) && me.user.user_id === detail?.user.user_id;
  const canManageSubscription =
    Boolean(detail) && !isSelf && me.capabilities.includes(SUBSCRIPTION_WRITE_CAPABILITY);
  const canChangeActivation =
    Boolean(detail) && !isSelf && me.capabilities.includes(USER_ACTIVATION_CAPABILITY);
  const canRevokeSessions =
    Boolean(detail) && !isSelf && me.capabilities.includes(USER_SESSION_REVOKE_CAPABILITY);
  const canChangeRole =
    Boolean(detail) && !isSelf && me.capabilities.includes(ROLE_WRITE_CAPABILITY);
  const showSessionActions = canRevokeSessions && Boolean(sessionRevokeAction);
  const sessionColumns = showSessionActions ? SESSION_COLUMNS : SESSION_COLUMNS.slice(0, 4);

  return (
    <>
      <PageHeader
        breadcrumbs={[{ href: "/product/users", label: "Users" }]}
        eyebrow="Account"
        title={detail ? accountName(detail.user) : "User detail"}
        titleId="admin-user-detail-heading"
        description={detail ? detail.user.email || "No email on file" : undefined}
        actions={
          detail && canChangeActivation && activationAction ? (
            <AdminUserActivationForm
              userId={detail.user.user_id}
              isActive={detail.user.is_active}
              action={activationAction}
            />
          ) : undefined
        }
      />

      <div className="page-content">
        <AdminGate access={access} section="User detail">
          {detail && (
            <>
              <StatGrid columns={4} label="Account summary">
                <Stat
                  label="Status"
                  value={<StatusPill value={detail.user.is_active ? "active" : "inactive"} />}
                  text
                />
                <Stat label="Role" value={<RoleBadge role={detail.role.effective} />} text />
                <Stat
                  label="Plan"
                  value={planLabel(usage?.plan ?? detail.user.subscription_tier)}
                  hint={detail.user.subscription_tier || "free"}
                  text
                />
                <Stat
                  label="Sessions"
                  value={formatNumber(detail.sessions.length)}
                  hint="Most recent shown below"
                />
              </StatGrid>

              <div className="card-grid card-grid--2">
                <Card eyebrow="Account" title="Details" titleId="admin-user-account-heading">
                  <KeyValue>
                    <KeyValueRow label="Email">{detail.user.email || "No email"}</KeyValueRow>
                    <KeyValueRow label="Account ID">
                      <ShortId value={detail.user.user_id} full />
                    </KeyValueRow>
                    <KeyValueRow label="Joined">
                      <Timestamp value={detail.user.created_at} mode="date" fallback="Unknown" />
                    </KeyValueRow>
                    <KeyValueRow label="Last sign-in">
                      <Timestamp value={detail.user.last_login_at} now={now} fallback="Never" />
                    </KeyValueRow>
                    <KeyValueRow label="Last updated">
                      <Timestamp value={detail.user.updated_at} now={now} fallback="Unknown" />
                    </KeyValueRow>
                  </KeyValue>
                </Card>

                <Card
                  eyebrow="Role"
                  title="Access level"
                  titleId="admin-user-role-heading"
                  important={canChangeRole}
                >
                  <div className="role-form__current">
                    <RoleBadge role={detail.role.effective} />
                    <StatusPill
                      value={detail.role.mismatch}
                      tone={mismatchTone(detail.role.mismatch)}
                      label={mismatchLabel(detail.role.mismatch)}
                    />
                  </div>
                  <p className="card__desc">
                    Stored role: {detail.role.database ? roleLabel(detail.role.database) : "none"} ·
                    Legacy registry: {detail.role.legacy ? roleLabel(detail.role.legacy) : "none"}
                    {detail.role.break_glass ? " · Set by configuration" : ""}
                  </p>
                  <div className="card__body">
                    {canChangeRole && roleAction ? (
                      <AdminUserRoleForm
                        userId={detail.user.user_id}
                        currentRole={detail.role.effective}
                        action={roleAction}
                      />
                    ) : (
                      <p className="field__hint">
                        {isSelf
                          ? "You can't change your own role."
                          : "Changing roles needs the Manage roles permission, which only owners hold."}
                      </p>
                    )}
                  </div>
                </Card>
              </div>

              <AdminUserSubscription
                userId={detail.user.user_id}
                storedTier={detail.user.subscription_tier}
                usage={usage}
                canManage={canManageSubscription}
                isSelf={isSelf}
                planAction={planAction}
                overrideAction={overrideAction}
                now={now}
              />

              <Section
                id="admin-user-sessions"
                title="Sessions"
                eyebrow="Recent"
                description="The most recent cloud sessions for this account."
              >
                <DataTable
                  columns={sessionColumns}
                  caption="Recent sessions"
                  isEmpty={detail.sessions.length === 0}
                  empty={<EmptyState title="No recent sessions were found." compact />}
                >
                  {detail.sessions.map((session) => {
                    const state = sessionState(session, now);
                    return (
                      <tr key={session.id}>
                        <td>
                          <span className="data-table__primary">
                            {session.device_name || "Unknown device"}
                          </span>
                          <span className="data-table__secondary">
                            {formatLabel(session.source)}
                          </span>
                        </td>
                        <td>
                          <StatusPill value={state} />
                        </td>
                        <td>
                          <Timestamp value={session.last_seen_at} now={now} fallback="Unknown" />
                        </td>
                        <td>
                          <Timestamp value={session.expires_at} now={now} fallback="No expiry" />
                        </td>
                        {showSessionActions && (
                          <td className="data-table__actions">
                            {session.revoked_at ? (
                              <span className="quiet">Revoked</span>
                            ) : (
                              <AdminUserSessionRevokeForm
                                action={sessionRevokeAction!}
                                userId={detail.user.user_id}
                                sessionId={session.id}
                              />
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </DataTable>
              </Section>

              <Section id="admin-user-activity" title="Recent security events" eyebrow="Audit">
                <DataTable
                  columns={EVENT_COLUMNS}
                  caption="Recent security events"
                  isEmpty={detail.activity.length === 0}
                  empty={<EmptyState title="No recent security events were found." compact />}
                >
                  {detail.activity.map((event) => (
                    <tr key={event.id}>
                      <td>
                        <Timestamp
                          value={event.occurred_at}
                          now={now}
                          mode="both"
                          fallback="Unknown"
                        />
                      </td>
                      <td>
                        <span className="data-table__primary">{formatLabel(event.event_type)}</span>
                      </td>
                      <td>
                        <StatusPill value={event.outcome} />
                      </td>
                      <td>{formatLabel(event.source)}</td>
                    </tr>
                  ))}
                </DataTable>
              </Section>
            </>
          )}
        </AdminGate>
      </div>
    </>
  );
}
