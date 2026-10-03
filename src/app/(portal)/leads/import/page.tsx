import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import {
  importLeadVerificationAction,
  importLeadsAction,
  rollbackLeadImportAction,
} from "@/app/(portal)/leads/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { LeadImport } from "@/components/crm/lead-import";
import { LeadTabs } from "@/components/crm/lead-tabs";
import { VerificationImport } from "@/components/crm/verification-import";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  readCrmSettings,
  readLeadImports,
  type CrmSettings,
  type LeadImportsPage,
} from "@/lib/api/crm";
import { sourceLabel, sourceNamesFrom } from "@/lib/crm/vocabulary";
import { formatAbsolute, formatNumber } from "@/lib/format";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Import leads" };
export const dynamic = "force-dynamic";

const BASE = "/leads/import";

const COLUMNS = [
  { key: "file", label: "File" },
  { key: "by", label: "Brought in" },
  { key: "rows", label: "Rows", align: "end" as const },
  { key: "created", label: "Added", align: "end" as const },
  { key: "updated", label: "Filled in", align: "end" as const },
  { key: "skipped", label: "Left out", align: "end" as const },
  { key: "remaining", label: "Still here", align: "end" as const },
  { key: "health", label: "Since then" },
  { key: "actions", label: "" },
];

/** What came of a file's addresses, in one line; nothing sent reads as that. */
function healthLine(health: LeadImportsPage["imports"][number]["health"]): string {
  if (health.written_to === 0 && health.stopped === 0) return "Nothing sent yet";
  const parts = [`${formatNumber(health.written_to)} written to`];
  if (health.bounced) parts.push(`${formatNumber(health.bounced)} bounced`);
  if (health.clicked) parts.push(`${formatNumber(health.clicked)} clicked`);
  if (health.stopped) parts.push(`${formatNumber(health.stopped)} stopped`);
  return parts.join(" · ");
}

export default async function LeadImportPage() {
  const context = await requireStaff(BASE);
  const now = requestNow();
  const canWrite = hasCapability(context, "crm:write");
  let history: LeadImportsPage | null = null;
  let settings: CrmSettings | null = null;
  try {
    [history, settings] = await Promise.all([
      readLeadImports(context.token),
      readCrmSettings(context.token),
    ]);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const sourceNames = sourceNamesFrom(settings);
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Import"
        description="Bring a researched list in as prospects, then bring back what a verifier said about its addresses. Every row is accounted for: added, filled in, already here, or left out with the reason. A file can be taken back out while nobody has started on its leads."
        actions={<LeadTabs current={BASE} />}
      />
      <div className="page-content">
        {canWrite ? (
          settings === null ? (
            <Callout tone="danger" role="alert">
              The sources could not be read just now, so the import is paused. Nothing is lost.
            </Callout>
          ) : (
            <LeadImport action={importLeadsAction} sources={settings.sources} />
          )
        ) : (
          <Callout tone="neutral">Your role reads leads without importing them.</Callout>
        )}

        {canWrite && history !== null && (
          <RecordSection
            id="lead-verification"
            title="What a verifier said"
            actions={
              <Link className="text-link" href="/leads/rules">
                The sending rules
              </Link>
            }
          >
            <VerificationImport
              action={importLeadVerificationAction}
              words={history.verification_words}
            />
          </RecordSection>
        )}

        <RecordSection id="lead-imports" title="Files brought in">
          {history === null ? (
            <Callout tone="danger" role="alert">
              The import history could not be read just now.
            </Callout>
          ) : (
            <>
              {canWrite && history.imports.some((row) => !row.rolled_back_at && row.remaining) && (
                <SudoGate
                  action={confirmSudoAction}
                  fresh={context.me.sudo_fresh}
                  untilLabel={untilLabel}
                  returnPath={BASE}
                  purpose="Taking a file back out needs a fresh code from your authenticator app."
                />
              )}
              <DataTable
                caption="Lead imports"
                columns={COLUMNS}
                isEmpty={history.imports.length === 0}
                empty={
                  <EmptyState
                    compact
                    title="No file has come in yet"
                    description="The first import will be listed here with its counts."
                  />
                }
              >
                {history.imports.map((row) => (
                  <tr key={row.import_id} className={row.rolled_back_at ? "row--muted" : undefined}>
                    <td>
                      {row.label && row.remaining > 0 ? (
                        <Link
                          className="table-title"
                          href={`/leads/prospects?f=${encodeURIComponent(`import:is:${row.label}`)}`}
                        >
                          {row.label}
                        </Link>
                      ) : (
                        <span className="table-title">{row.label || "Unnamed file"}</span>
                      )}
                      <span className="table-sub">
                        {sourceLabel(row.source_key, sourceNames)} · {row.reason}
                      </span>
                    </td>
                    <td>
                      {row.by?.name || "Name unavailable"}
                      <span className="table-sub">
                        <Timestamp value={row.started_at} now={now} mode="relative" />
                      </span>
                    </td>
                    <td className="data-table__num">{formatNumber(row.rows)}</td>
                    <td className="data-table__num">{formatNumber(row.created)}</td>
                    <td className="data-table__num">{formatNumber(row.updated)}</td>
                    <td className="data-table__num">{formatNumber(row.skipped)}</td>
                    <td className="data-table__num">{formatNumber(row.remaining)}</td>
                    <td className="nowrap">
                      {row.health.written_to === 0 && row.health.stopped === 0 ? (
                        <span className="table-sub">{healthLine(row.health)}</span>
                      ) : (
                        healthLine(row.health)
                      )}
                    </td>
                    <td>
                      {row.rolled_back_at ? (
                        <span className="table-sub">
                          Taken back · {formatNumber(row.rolled_back_count)} removed
                        </span>
                      ) : (
                        canWrite &&
                        row.remaining > 0 && (
                          <Popover label="Take back" align="end">
                            <MailForm
                              action={rollbackLeadImportAction}
                              fields={{ import_id: row.import_id }}
                              submitLabel="Take this file back"
                              pendingLabel="Taking back…"
                              variant="danger"
                            >
                              <p className="page-note">
                                Removes the leads from this file that are still new, unowned, never
                                worked and never mailed. Anything somebody has started on stays.
                              </p>
                              <Field id={`why-${row.import_id}`} label="Why">
                                <Input
                                  id={`why-${row.import_id}`}
                                  name="reason"
                                  maxLength={400}
                                  minLength={4}
                                  required
                                  placeholder="Wrong file"
                                />
                              </Field>
                            </MailForm>
                          </Popover>
                        )
                      )}
                    </td>
                  </tr>
                ))}
              </DataTable>
              <p className="page-note">
                The table holds up to {formatNumber(history.max_leads)} leads.
              </p>
            </>
          )}
        </RecordSection>
      </div>
    </>
  );
}
