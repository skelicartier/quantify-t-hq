import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import {
  changePasswordAction,
  regenerateRecoveryCodesAction,
  revokeSessionAction,
} from "@/app/(portal)/me/security/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { PasswordForm } from "@/components/me/password-form";
import { RecoveryCodesForm } from "@/components/me/recovery-codes-form";
import { Card, Section } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { listSessions } from "@/lib/api/auth";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { requireStaff } from "@/lib/access/core";
import { formatAbsolute } from "@/lib/format";

export const metadata = { title: "My security" };
export const dynamic = "force-dynamic";

const SESSION_COLUMNS = [
  { key: "started", label: "Started" },
  { key: "seen", label: "Last seen" },
  { key: "address", label: "Address" },
  { key: "client", label: "Browser" },
  { key: "state", label: "State" },
  { key: "actions", label: "Actions", align: "end" as const },
];

export default async function SecurityPage() {
  const context = await requireStaff("/me/security");
  const { token } = context;
  let sessions: Awaited<ReturnType<typeof listSessions>>["sessions"] | null = null;
  try {
    sessions = (await listSessions(token)).sessions;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const live = (sessions ?? []).filter((session) => session.live);
  return (
    <>
      <PageHeader
        eyebrow="My account"
        title="My security"
        description="Your sessions and your password. A session ends after 30 minutes without activity, and after 12 hours regardless."
      />
      <Section id="sessions" title="Where you are signed in">
        {sessions === null ? (
          <Callout tone="danger" role="alert">
            Sessions could not be read just now. This is a read failure, not an empty list — try
            again shortly.
          </Callout>
        ) : (
          <DataTable
            caption="Live sessions for your staff account"
            columns={SESSION_COLUMNS}
            isEmpty={live.length === 0}
            empty={<EmptyState title="No live sessions" compact />}
          >
            {live.map((session) => (
              <tr key={session.session_id}>
                <td>
                  <Timestamp value={session.created_at} mode="both" />
                </td>
                <td>
                  <Timestamp value={session.last_seen_at} mode="relative" />
                </td>
                <td className="mono">{session.ip || "—"}</td>
                <td title={session.user_agent || undefined}>
                  {session.user_agent
                    ? `${session.device.charAt(0).toUpperCase()}${session.device.slice(1)}`
                    : "—"}
                </td>
                <td>
                  {session.current ? (
                    <StatusPill value="active" label="This session" tone="live" />
                  ) : (
                    <StatusPill value="active" label="Signed in" tone="neutral" />
                  )}
                </td>
                <td className="data-table__num">
                  {!session.current && (
                    <RowAction
                      action={revokeSessionAction}
                      fields={{ session_id: session.session_id }}
                      buttons={[
                        {
                          label: "Sign out",
                          pendingLabel: "Signing out…",
                          className: "btn btn--small btn--ghost",
                        },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
      <Section id="password" title="Password">
        <Card>
          <PasswordForm action={changePasswordAction} />
        </Card>
      </Section>
      <Section id="recovery" title="Recovery codes">
        <Card>
          <p className="muted">
            {context.me.recovery_codes_remaining === undefined
              ? "Recovery codes sign you in when your authenticator is out of reach."
              : `${context.me.recovery_codes_remaining} unused ${context.me.recovery_codes_remaining === 1 ? "code" : "codes"} left. Each signs you in once when your authenticator is out of reach.`}
          </p>
          <SudoGate
            action={confirmSudoAction}
            fresh={context.me.sudo_fresh}
            untilLabel={untilLabel}
            returnPath="/me/security"
            purpose="New recovery codes need a fresh code from your authenticator app."
          />
          <RecoveryCodesForm
            action={regenerateRecoveryCodesAction}
            disabled={!context.me.sudo_fresh}
          />
        </Card>
      </Section>
    </>
  );
}
