import Link from "next/link";

import { createWebhookAction } from "@/app/(portal)/_actions/platform";
import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { SudoGate } from "@/components/admin/sudo-gate";
import { CreateWebhookForm } from "@/components/platform/platform-forms";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readWebhooks, type WebhookBoard } from "@/lib/api/platform";
import { formatAbsolute } from "@/lib/format";

export const metadata = { title: "Webhooks" };
export const dynamic = "force-dynamic";

/**
 * Events sent to other systems as they happen: a lead in, a deal moved or closed, a
 * contract signed, a ticket resolved. Signed to the Standard Webhooks spec, retried for
 * about a day, switched off after three days of failure.
 */
export default async function WebhooksPage() {
  const context = await requireStaff("/admin/webhooks");
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Webhooks" />
        <Callout tone="neutral">Webhooks are set up by HQ owners and admins.</Callout>
      </>
    );
  }
  let board: WebhookBoard | null = null;
  try {
    board = await readWebhooks(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const labels = Object.fromEntries((board?.events ?? []).map((event) => [event.key, event.label]));
  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Webhooks"
        description="Events sent to other systems as they happen. Each is signed so the receiver can check it came from HQ, retried for about a day, and a receiver that fails for three days is switched off and the owners told."
        actions={<AdminTabs current="/admin/webhooks" />}
      />
      {board === null ? (
        <Callout tone="danger" role="alert">
          The webhooks could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <SudoGate
            action={confirmSudoAction}
            fresh={fresh}
            untilLabel={untilLabel}
            returnPath="/admin/webhooks"
            purpose="Adding a receiver, switching one, or replacing its secret needs a fresh code from your authenticator app."
          />
          <Section id="receivers" title="Receivers">
            <DataTable
              caption="Webhook receivers"
              columns={[
                { key: "url", label: "Address" },
                { key: "events", label: "Events" },
                { key: "state", label: "State" },
                { key: "delivered", label: "Delivered", align: "end" },
                { key: "failed", label: "Gave up", align: "end" },
                { key: "waiting", label: "Waiting", align: "end" },
              ]}
              isEmpty={board.endpoints.length === 0}
              empty={<p className="muted">No receivers. Nothing leaves HQ this way.</p>}
            >
              {board.endpoints.map((endpoint) => (
                <tr key={endpoint.endpoint_id}>
                  <td>
                    <Link href={`/admin/webhooks/${endpoint.endpoint_id}`}>{endpoint.url}</Link>
                    {endpoint.description && (
                      <span className="field__hint"> · {endpoint.description}</span>
                    )}
                  </td>
                  <td>{endpoint.event_types.map((key) => labels[key] ?? key).join("; ")}</td>
                  <td>
                    <StatusPill
                      value={endpoint.active ? (endpoint.failing_since ? "failing" : "on") : "off"}
                      label={
                        !endpoint.active
                          ? endpoint.disabled_reason
                            ? "Switched off: failing"
                            : "Off"
                          : endpoint.failing_since
                            ? `Failing since ${formatAbsolute(endpoint.failing_since)}`
                            : "On"
                      }
                      tone={
                        !endpoint.active ? "neutral" : endpoint.failing_since ? "danger" : "live"
                      }
                    />
                  </td>
                  <td className="num">{endpoint.delivered}</td>
                  <td className="num">{endpoint.failed}</td>
                  <td className="num">{endpoint.waiting}</td>
                </tr>
              ))}
            </DataTable>
            {board.can_seal ? (
              <details className="disclosure">
                <summary>Add a receiver</summary>
                <CreateWebhookForm
                  action={createWebhookAction}
                  events={board.events}
                  disabled={!fresh}
                />
              </details>
            ) : (
              <Callout tone="neutral" compact>
                Receivers cannot be added until the service&rsquo;s integration key is set: each
                receiver&rsquo;s signing secret is kept sealed with it.
              </Callout>
            )}
          </Section>
        </div>
      )}
    </>
  );
}
