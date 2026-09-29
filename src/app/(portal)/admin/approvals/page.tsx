import {
  collectApprovalAction,
  confirmSudoAction,
  decideApprovalAction,
  withdrawApprovalAction,
} from "@/app/(portal)/admin/actions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { CollectKeyForm, DecideApprovalForm } from "@/components/admin/approval-forms";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { RowAction } from "@/components/ui/row-action";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { APPROVAL_STATUS_LABELS, approverText, type Approval } from "@/lib/api/approval-schema";
import { readApprovals, type ApprovalsPage } from "@/lib/api/approvals";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { formatAbsolute } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Approvals" };
export const dynamic = "force-dynamic";

const TONES: Record<Approval["status"], PillTone> = {
  pending: "attention",
  approved: "live",
  declined: "danger",
  withdrawn: "neutral",
  expired: "neutral",
  done: "live",
};

function sentence(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/**
 * Dual control's desk: what waits for this person to decide, what they asked for, and
 * the last month's decisions. Deciding and collecting sit behind the sudo gate, as the
 * acts they stand in for do.
 */
export default async function ApprovalsPage() {
  const context = await requireStaff("/admin/approvals");
  const now = requestNow();
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Approvals" />
        <Callout tone="neutral">Approvals are decided by HQ owners and admins.</Callout>
      </>
    );
  }
  let page: ApprovalsPage | null = null;
  try {
    page = await readApprovals(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const all = page?.approvals ?? [];
  const forMe = all.filter((row) => row.status === "pending" && row.can_decide);
  const mine = all.filter(
    (row) => row.can_collect || (row.status === "pending" && row.can_withdraw),
  );
  const onOthers = all.filter(
    (row) => row.status === "pending" && !row.can_decide && !row.can_withdraw,
  );
  const history = all.filter((row) => row.status !== "pending" && !row.can_collect);

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Approvals"
        description="An Owner or Admin seat, or an intake key, waits here for a second person with the standing to approve. Alone, an owner acts at once and the audit log says so."
        actions={<AdminTabs current="/admin/approvals" />}
      />
      {page === null ? (
        <Callout tone="danger" role="alert">
          Approvals could not be read just now. This is a read failure, not an empty list.
        </Callout>
      ) : (
        <>
          <StatGrid columns={3} label="Approvals">
            <Stat
              label="For you to decide"
              value={page.awaiting_me}
              tone={page.awaiting_me > 0 ? "danger" : "default"}
            />
            <Stat label="Waiting on others" value={page.pending - page.awaiting_me} />
            <Stat
              label="Keys to collect"
              value={page.to_collect}
              hint={`Within ${page.ttl_hours} hours of approval`}
            />
          </StatGrid>
          <SudoGate
            action={confirmSudoAction}
            fresh={fresh}
            untilLabel={untilLabel}
            returnPath="/admin/approvals"
            purpose="Deciding a request, or collecting an approved key, needs a fresh code from your authenticator app."
          />
          <div className="record-layout">
            <div className="record-layout__main">
              <Card title="For you to decide" titleAs="h3">
                {forMe.length === 0 ? (
                  <EmptyState
                    compact
                    title="Nothing waits for you"
                    description="A request appears here when a colleague asks for something only a second Owner or Admin can approve."
                  />
                ) : (
                  <ul className="policy-list">
                    {forMe.map((row) => (
                      <li key={row.approval_id} className="policy approval">
                        <div className="policy__main">
                          <span className="policy__title">{sentence(row.summary)}</span>
                          <span className="policy__meta">
                            Asked by {row.requested_by?.name || "a colleague"}{" "}
                            <Timestamp value={row.requested_at} now={now} mode="relative" /> ·
                            lapses <Timestamp value={row.expires_at} now={now} mode="relative" />
                            {row.reason && ` · “${row.reason}”`}
                          </span>
                        </div>
                        <DecideApprovalForm
                          action={decideApprovalAction}
                          approvalId={row.approval_id}
                          disabled={!fresh}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              <Card title="History" titleAs="h3" description="The last thirty days of decisions.">
                {history.length === 0 ? (
                  <p className="muted">Nothing decided yet.</p>
                ) : (
                  <ul className="policy-list">
                    {history.map((row) => (
                      <li key={row.approval_id} className="policy">
                        <div className="policy__main">
                          <span className="policy__title">{sentence(row.summary)}</span>
                          <span className="policy__meta">
                            Asked by {row.requested_by?.name || "a colleague"}{" "}
                            <Timestamp value={row.requested_at} now={now} mode="relative" />
                            {row.decided_by &&
                              ` · ${APPROVAL_STATUS_LABELS[row.status].toLowerCase()} by ${row.decided_by.name}`}
                            {row.decision_note && ` · “${row.decision_note}”`}
                          </span>
                        </div>
                        <StatusPill
                          value={row.status}
                          label={APPROVAL_STATUS_LABELS[row.status]}
                          tone={TONES[row.status]}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
            </div>
            <aside className="record-layout__side">
              <Card
                title="Your requests"
                titleAs="h3"
                description="An approved key is minted when you collect it, and its secret is shown to you alone. Withdraw a request that no longer applies."
              >
                {mine.length === 0 ? (
                  <p className="muted">None open.</p>
                ) : (
                  <ul className="policy-list">
                    {mine.map((row) => (
                      <li key={row.approval_id} className="policy approval">
                        <div className="policy__main">
                          <span className="policy__title">{sentence(row.summary)}</span>
                          <span className="policy__meta">
                            {row.can_collect && row.decided_by
                              ? `Approved by ${row.decided_by.name} · collect before it lapses `
                              : `Waits for ${approverText(row)} · lapses `}
                            <Timestamp value={row.expires_at} now={now} mode="relative" />
                          </span>
                        </div>
                        {row.can_collect && (
                          <CollectKeyForm
                            action={collectApprovalAction}
                            approvalId={row.approval_id}
                            disabled={!fresh}
                          />
                        )}
                        <RowAction
                          action={withdrawApprovalAction}
                          fields={{ approval_id: row.approval_id }}
                          buttons={[
                            {
                              label: "Withdraw",
                              className: "btn btn--small btn--ghost",
                              pendingLabel: "Withdrawing…",
                            },
                          ]}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </Card>
              {onOthers.length > 0 && (
                <Card
                  title="Waiting on others"
                  titleAs="h3"
                  description="Requests only a second Owner can decide."
                >
                  <ul className="policy-list">
                    {onOthers.map((row) => (
                      <li key={row.approval_id} className="policy">
                        <div className="policy__main">
                          <span className="policy__title">{sentence(row.summary)}</span>
                          <span className="policy__meta">
                            Asked by {row.requested_by?.name || "a colleague"} · waits for{" "}
                            {approverText(row)}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                </Card>
              )}
            </aside>
          </div>
        </>
      )}
    </>
  );
}
