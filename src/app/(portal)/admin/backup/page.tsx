import { confirmSudoAction, withdrawApprovalAction } from "@/app/(portal)/admin/actions";
import { requestBackupAction } from "@/app/(portal)/admin/backup/actions";
import { AdminTabs } from "@/components/admin/admin-tabs";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { RowAction } from "@/components/ui/row-action";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { readBackup, type BackupState } from "@/lib/api/backup";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { formatAbsolute } from "@/lib/format";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "Backup" };
export const dynamic = "force-dynamic";

/** What the page says when a download came back refused, keyed by `?backup=`. */
const OUTCOMES: Record<string, string> = {
  sudo: "Confirm it's you first, then download again.",
  reason: "Say what the backup is for, in a sentence.",
  forbidden: "A backup is an Owner's to make.",
  approval: "That approval was not found. Ask again below.",
  lapsed:
    "That approval is no longer open: it lapsed, was declined or was already used. Ask again below.",
  failed: "The backup could not be made just now. Nothing left HQ.",
};

const RECENT_COLUMNS = [
  { key: "when", label: "Made" },
  { key: "who", label: "By" },
  { key: "rows", label: "Records", align: "end" as const },
  { key: "why", label: "What for" },
];

type BackupPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

/**
 * A backup of everything HQ holds, as one zip: a CSV per kind of record and a README. An
 * Owner's to ask for; it waits for a second Owner when one exists, and the asker downloads
 * it once it is approved.
 */
export default async function BackupPage({ searchParams }: BackupPageProps) {
  const context = await requireStaff("/admin/backup");
  if (!hasCapability(context, "hq:admin")) {
    return (
      <>
        <PageHeader eyebrow="Admin" title="Backup" />
        <Callout tone="neutral">Backups are for HQ owners.</Callout>
      </>
    );
  }
  const parameters = await searchParams;
  const outcome = OUTCOMES[firstSearchValue(parameters.backup) ?? ""];
  let state: BackupState | null = null;
  try {
    state = await readBackup(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const now = requestNow();
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const request = state?.request ?? null;

  return (
    <>
      <PageHeader
        eyebrow="Admin"
        title="Backup"
        description="Everything HQ holds, as one zip to keep: a spreadsheet file per kind of record, with a note of what is in it and what is not."
        actions={<AdminTabs current="/admin/backup" />}
      />
      {state === null ? (
        <Callout tone="danger" role="alert">
          The backup page could not be read just now. Nothing was made.
        </Callout>
      ) : (
        <div className="record-layout">
          <div className="record-layout__main">
            {outcome && (
              <Callout tone="danger" role="alert">
                {outcome}
              </Callout>
            )}
            <Card
              title="Make a backup"
              titleAs="h2"
              description={
                state.needs_approval
                  ? "Another Owner approves it first; you download it once it is approved, within 48 hours. It is recorded in the audit log and the export ledger."
                  : "No second Owner exists, so it is made as you download it, and the audit log says so. It is recorded in the export ledger too."
              }
            >
              {!state.can_make ? (
                <p className="side-quiet">A backup is an Owner&apos;s to make.</p>
              ) : (
                <>
                  <SudoGate
                    action={confirmSudoAction}
                    fresh={fresh}
                    untilLabel={untilLabel}
                    returnPath="/admin/backup"
                    purpose="A backup needs a fresh code from your authenticator app."
                  />
                  {state.needs_approval && request === null && (
                    <ActForm
                      action={requestBackupAction}
                      hidden={{}}
                      act="request"
                      label="Ask the other Owners"
                      primary
                      disabled={!fresh}
                      tight={false}
                    >
                      <ReasonField id="backup-reason" disabled={!fresh} />
                    </ActForm>
                  )}
                  {request?.status === "pending" && (
                    <div className="backup-request">
                      <p>
                        Asked <Timestamp value={request.requested_at} now={now} mode="relative" />{" "}
                        for “{request.reason}”. It waits for a second Owner and lapses{" "}
                        <Timestamp value={request.expires_at} now={now} mode="relative" />.
                      </p>
                      <RowAction
                        action={withdrawApprovalAction}
                        fields={{ approval_id: request.approval_id }}
                        buttons={[
                          {
                            label: "Withdraw",
                            className: "btn btn--small btn--ghost",
                            pendingLabel: "Withdrawing…",
                          },
                        ]}
                      />
                    </div>
                  )}
                  {request?.status === "approved" && (
                    <form
                      className="stack-form stack-form--tight"
                      method="post"
                      action="/admin/backup/download"
                    >
                      <input type="hidden" name="approval_id" value={request.approval_id} />
                      <p>
                        Approved by {request.decided_by?.name || "a second Owner"}
                        {request.decision_note ? ` (“${request.decision_note}”)` : ""}. Download it
                        before it lapses{" "}
                        <Timestamp value={request.expires_at} now={now} mode="relative" />; it can
                        be downloaded once.
                      </p>
                      <button
                        className={buttonClass({ variant: "primary" })}
                        type="submit"
                        disabled={!fresh}
                      >
                        Download the backup
                      </button>
                    </form>
                  )}
                  {!state.needs_approval && (
                    <form className="stack-form" method="post" action="/admin/backup/download">
                      <ReasonField id="backup-reason" disabled={!fresh} />
                      <button
                        className={buttonClass({ variant: "primary" })}
                        type="submit"
                        disabled={!fresh}
                      >
                        Make and download the backup
                      </button>
                    </form>
                  )}
                </>
              )}
            </Card>
            <Card title="Backups made" titleAs="h2">
              <DataTable
                caption="Backups made"
                columns={RECENT_COLUMNS}
                isEmpty={state.recent.length === 0}
                empty={
                  <EmptyState
                    title="No backup yet"
                    description="The first one made appears here, with who made it and why."
                  />
                }
              >
                {state.recent.map((row, index) => (
                  <tr key={`${row.made_at ?? ""}-${index}`}>
                    <td>
                      <Timestamp value={row.made_at} now={now} mode="absolute" />
                    </td>
                    <td>{row.made_by || "A former colleague"}</td>
                    <td className="data-table__num">{row.rows.toLocaleString("en-GB")}</td>
                    <td>{row.reason}</td>
                  </tr>
                ))}
              </DataTable>
            </Card>
          </div>
          <aside className="record-layout__side">
            <Card title="In the zip" titleAs="h3">
              <ul className="file-list">
                {state.files.map((file) => (
                  <li key={file.name}>
                    <span>{file.title}</span>
                    <span className="file-list__name">{file.name}.csv</span>
                  </li>
                ))}
                <li>
                  <span>Who, when, why, and each file&apos;s checksum</span>
                  <span className="file-list__name">README.txt</span>
                </li>
              </ul>
            </Card>
            <Card title="Not in the zip" titleAs="h3">
              <ul className="side-list">
                {state.excluded.map((line) => (
                  <li key={line}>{line}</li>
                ))}
              </ul>
            </Card>
          </aside>
        </div>
      )}
    </>
  );
}

function ReasonField({ id, disabled }: { id: string; disabled: boolean }) {
  return (
    <div className="field">
      <div className="field__label">
        <label htmlFor={id}>What it is for</label>
      </div>
      <input
        id={id}
        className="input"
        name="reason"
        minLength={8}
        maxLength={400}
        required
        placeholder="e.g. Quarter-end copy for the board's records"
        disabled={disabled}
      />
    </div>
  );
}
