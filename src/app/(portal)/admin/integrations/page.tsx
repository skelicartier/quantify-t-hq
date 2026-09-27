import { confirmSudoAction, mintKeyAction, revokeKeyAction } from "@/app/(portal)/admin/actions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { MintKeyForm, RevokeKeyForm } from "@/components/admin/intake-key-forms";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readApiKeys, type ApiKey } from "@/lib/api/keys";
import { directoryOrEmpty } from "@/lib/api/staff";
import { formatAbsolute } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Integrations" };
export const dynamic = "force-dynamic";

const KEY_COLUMNS = [
  { key: "name", label: "Key" },
  { key: "scope", label: "Allows" },
  { key: "used", label: "Last used" },
  { key: "created", label: "Minted" },
  { key: "state", label: "State" },
  { key: "revoke", label: "Revoke" },
];

export default async function IntegrationsPage() {
  const context = await requireStaff("/admin/integrations");
  const now = requestNow();
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Integrations" />
        <Callout tone="neutral">Integrations are managed by HQ admins.</Callout>
      </>
    );
  }

  let keys: ApiKey[] | null = null;
  try {
    keys = (await readApiKeys(context.token)).keys;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const names = await directoryOrEmpty(context.token);
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const live = (keys ?? []).filter((key) => !key.revoked_at);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Integrations"
        description="The doors into HQ from outside, and the keys that open them."
        actions={<AdminTabs current="/admin/integrations" />}
      />
      <SudoGate
        action={confirmSudoAction}
        fresh={fresh}
        untilLabel={untilLabel}
        returnPath="/admin/integrations"
      />
      <div className="record-layout">
        <div className="record-layout__main">
          <Card
            title="Website intake keys"
            titleAs="h2"
            description="The early-access and contact forms post leads with one of these. A key can only create leads; revoking one stops it at once."
          >
            {keys === null ? (
              <Callout tone="danger" compact>
                Keys could not be read just now. This is a read failure, not an empty list.
              </Callout>
            ) : (
              <DataTable
                caption="Intake keys"
                columns={KEY_COLUMNS}
                scroll={false}
                isEmpty={keys.length === 0}
                empty={
                  <EmptyState
                    title="No keys yet"
                    description="Mint one for the website so its forms land as leads here."
                    compact
                  />
                }
              >
                {keys.map((key) => (
                  <tr key={key.key_id} className={key.revoked_at ? "row--muted" : undefined}>
                    <td>
                      <span className="table-title">{key.name}</span>
                      <span className="table-sub mono">qthq_{key.prefix}_…</span>
                    </td>
                    <td className="mono">{key.scopes.join(", ") || "—"}</td>
                    <td>
                      <Timestamp
                        value={key.last_used_at}
                        now={now}
                        mode="relative"
                        fallback="Never"
                      />
                    </td>
                    <td>
                      <Timestamp value={key.created_at} mode="date" />
                      <span className="table-sub">
                        {names.get(key.created_by)?.display_name ?? "—"}
                      </span>
                    </td>
                    <td>
                      {key.revoked_at ? (
                        <StatusPill value="revoked" label="Revoked" />
                      ) : (
                        <StatusPill value="active" label="Live" />
                      )}
                    </td>
                    <td>
                      {key.revoked_at ? (
                        <span className="table-sub">
                          <Timestamp value={key.revoked_at} mode="date" />
                        </span>
                      ) : (
                        <RevokeKeyForm
                          action={revokeKeyAction}
                          keyId={key.key_id}
                          keyName={key.name}
                          disabled={!fresh}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
            )}
          </Card>
          <Card title="Calendar" titleAs="h2">
            <p className="side-quiet">
              Not connected. Connecting the team calendar will list booked demos under Meetings and
              on Today.
            </p>
          </Card>
        </div>
        <aside className="record-layout__side">
          <Card
            title="Mint an intake key"
            titleAs="h3"
            description={
              live.length > 0
                ? `${live.length} live ${live.length === 1 ? "key" : "keys"}. Mint a new one before revoking the old, so the form never goes dark.`
                : "The website needs one before its forms can post here."
            }
          >
            <MintKeyForm action={mintKeyAction} disabled={!fresh} />
          </Card>
        </aside>
      </div>
    </>
  );
}
