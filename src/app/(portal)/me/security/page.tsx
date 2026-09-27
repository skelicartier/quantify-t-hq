import { changePasswordAction, revokeSessionAction } from "@/app/(portal)/me/security/actions";
import { PageHeader } from "@/components/shell/page-header";
import { PasswordForm } from "@/components/me/password-form";
import { Card, Section } from "@/components/ui/card";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { listSessions } from "@/lib/api/auth";
import { HqApiUnavailableError } from "@/lib/api/core";
import { requireStaff } from "@/lib/access/core";

export const metadata = { title: "My security" };
export const dynamic = "force-dynamic";

const SESSION_COLUMNS = [
  { key: "started", label: "Started" },
  { key: "seen", label: "Last seen" },
  { key: "address", label: "Address" },
  { key: "client", label: "Client" },
  { key: "state", label: "State" },
  { key: "actions", label: "", align: "end" as const },
];

export default async function SecurityPage() {
  const { token } = await requireStaff("/me/security");
  let sessions: Awaited<ReturnType<typeof listSessions>>["sessions"] | null = null;
  try {
    sessions = (await listSessions(token)).sessions;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError)) throw error;
  }
  const live = (sessions ?? []).filter((session) => !session.revoked_at);
  return (
    <>
      <PageHeader
        eyebrow="My account"
        title="My security"
        description="Your sessions and your password. Sessions end on their own after 12 hours."
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
                <td>{session.user_agent ? session.user_agent.slice(0, 80) : "—"}</td>
                <td>
                  {session.current ? (
                    <StatusPill value="active" label="This session" tone="live" />
                  ) : (
                    <StatusPill value="active" label="Signed in" tone="neutral" />
                  )}
                </td>
                <td className="data-table__num">
                  {!session.current && (
                    <form action={revokeSessionAction}>
                      <input type="hidden" name="session_id" value={session.session_id} />
                      <button className="btn btn--small btn--ghost" type="submit">
                        Sign out
                      </button>
                    </form>
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
    </>
  );
}
