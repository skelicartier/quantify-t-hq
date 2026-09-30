import { notFound } from "next/navigation";

import { webhookAct } from "@/app/(portal)/_actions/platform";
import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { WebhookActs } from "@/components/platform/platform-forms";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError } from "@/lib/api/core";
import { readWebhook } from "@/lib/api/platform";
import { formatAbsolute } from "@/lib/format";

export const metadata = { title: "Webhook receiver" };
export const dynamic = "force-dynamic";

const STATE_LABELS = { delivered: "Delivered", gave_up: "Gave up", waiting: "Waiting" } as const;

export default async function WebhookPage({ params }: { params: Promise<{ endpointId: string }> }) {
  const { endpointId } = await params;
  const context = await requireStaff(`/admin/webhooks/${endpointId}`);
  if (!hasCapability(context, "hq:admin")) {
    return <Callout tone="neutral">Webhooks are set up by HQ owners and admins.</Callout>;
  }
  let detail: Awaited<ReturnType<typeof readWebhook>>;
  try {
    detail = await readWebhook(context.token, endpointId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    throw error;
  }
  const { endpoint, deliveries } = detail;
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/admin/webhooks", label: "Webhooks" }]}
        title={endpoint.url}
        status={
          <StatusPill
            value={endpoint.active ? "on" : "off"}
            label={endpoint.active ? (endpoint.failing_since ? "Failing" : "On") : "Off"}
            tone={endpoint.active ? (endpoint.failing_since ? "danger" : "live") : "neutral"}
          />
        }
        readouts={[
          { label: "Delivered", value: String(endpoint.delivered) },
          { label: "Gave up", value: String(endpoint.failed) },
          { label: "Waiting", value: String(endpoint.waiting) },
        ]}
      />
      <SudoGate
        action={confirmSudoAction}
        fresh={fresh}
        untilLabel={untilLabel}
        returnPath={`/admin/webhooks/${endpointId}`}
        purpose="Switching it and replacing its secret need a fresh code from your authenticator app."
      />
      <RecordGrid
        side={
          <Properties title="Receiver">
            <Property label="Events">{endpoint.event_types.join(", ")}</Property>
            <Property label="Secret ends" mono>
              {endpoint.secret_hint ? `…${endpoint.secret_hint}` : "—"}
            </Property>
            <Property label="Since">{formatAbsolute(endpoint.created_at ?? "")}</Property>
            {endpoint.disabled_at && (
              <Property label="Switched off">
                {formatAbsolute(endpoint.disabled_at)}: {endpoint.disabled_reason}
              </Property>
            )}
          </Properties>
        }
      >
        <RecordSection id="webhook-acts" title="Act on it">
          <WebhookActs
            action={webhookAct}
            endpointId={endpoint.endpoint_id}
            active={endpoint.active}
            disabled={!fresh}
          />
        </RecordSection>
        <RecordSection id="webhook-deliveries" title="Deliveries, newest first">
          <DataTable
            caption="Deliveries to this receiver"
            columns={[
              { key: "when", label: "Queued" },
              { key: "event", label: "Event" },
              { key: "state", label: "State" },
              { key: "tries", label: "Tries", align: "end" },
              { key: "answer", label: "Last answer" },
            ]}
            isEmpty={deliveries.length === 0}
            empty={<p className="muted">Nothing sent yet.</p>}
          >
            {deliveries.map((delivery) => (
              <tr key={delivery.delivery_id}>
                <td>{formatAbsolute(delivery.created_at ?? "")}</td>
                <td className="mono">{delivery.event_type}</td>
                <td>
                  {STATE_LABELS[delivery.state]}
                  {delivery.state === "waiting" && delivery.next_attempt_at
                    ? `, next ${formatAbsolute(delivery.next_attempt_at)}`
                    : ""}
                </td>
                <td className="num">{delivery.attempts}</td>
                <td>
                  {delivery.last_error ||
                    (delivery.last_status ? String(delivery.last_status) : "—")}
                </td>
              </tr>
            ))}
          </DataTable>
        </RecordSection>
      </RecordGrid>
    </>
  );
}
