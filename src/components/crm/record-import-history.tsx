import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { MailForm } from "@/components/mail/mail-form";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { Timestamp } from "@/components/ui/timestamp";
import type { RecordImportKind, RecordImports } from "@/lib/api/crm";
import type { ActionState } from "@/lib/forms/action-state";
import { formatNumber } from "@/lib/format";

const COLUMNS = [
  { key: "file", label: "File" },
  { key: "by", label: "Brought in" },
  { key: "rows", label: "Rows", align: "end" as const },
  { key: "created", label: "Added", align: "end" as const },
  { key: "updated", label: "Filled in", align: "end" as const },
  { key: "left_out", label: "Left out", align: "end" as const },
  { key: "remaining", label: "Still here", align: "end" as const },
  { key: "actions", label: "" },
];

const NOUNS: Record<RecordImportKind, [string, string]> = {
  companies: ["company", "companies"],
  people: ["person", "people"],
};

/**
 * Every file brought in, newest first: who, when, why, what each did, and what is still
 * here of it. A file can be taken back while what it added is untouched and what it
 * filled in still holds the file's value; the rest stays, and the line says how much.
 */
export function RecordImportHistory({
  kind,
  history,
  canWrite,
  rollback,
  sudoFresh,
  sudoUntilLabel,
  returnPath,
  now,
}: {
  kind: RecordImportKind;
  history: RecordImports | null;
  canWrite: boolean;
  rollback: (previous: ActionState, formData: FormData) => Promise<ActionState>;
  sudoFresh: boolean;
  sudoUntilLabel: string | null;
  returnPath: string;
  /** The request's moment, for the relative times. */
  now: number;
}) {
  const [one, many] = NOUNS[kind];
  return (
    <RecordSection id={`${kind}-imports`} title="Files brought in">
      {history === null ? (
        <Callout tone="danger" role="alert">
          The import history could not be read just now.
        </Callout>
      ) : (
        <>
          {canWrite &&
            history.imports.some(
              (row) => !row.rolled_back_at && (row.remaining || row.changes),
            ) && (
              <SudoGate
                action={confirmSudoAction}
                fresh={sudoFresh}
                untilLabel={sudoUntilLabel}
                returnPath={returnPath}
                purpose="Taking a file back needs a fresh code from your authenticator app."
              />
            )}
          <DataTable
            caption={`${many[0]!.toUpperCase()}${many.slice(1)} imports`}
            columns={COLUMNS}
            isEmpty={history.imports.length === 0}
            empty={
              <EmptyState
                compact
                title="No file has come in yet"
                description="Each file will be listed here with its counts, and can be taken back."
              />
            }
          >
            {history.imports.map((row) => (
              <tr key={row.import_id} className={row.rolled_back_at ? "row--muted" : undefined}>
                <td>
                  <span className="table-title">{row.label || "Unnamed file"}</span>
                  <span className="table-sub">{row.reason}</span>
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
                <td className="data-table__num">{formatNumber(row.left_out)}</td>
                <td className="data-table__num">{formatNumber(row.remaining)}</td>
                <td>
                  {row.rolled_back_at ? (
                    <span className="table-sub">
                      Taken back
                      {row.rolled_back_by_name ? ` by ${row.rolled_back_by_name}` : ""} ·{" "}
                      {formatNumber(row.removed_count)} removed
                      {row.reverted_count ? `, ${formatNumber(row.reverted_count)} put back` : ""}
                      {row.kept_count ? `, ${formatNumber(row.kept_count)} kept` : ""}
                    </span>
                  ) : (
                    canWrite &&
                    (row.remaining > 0 || row.changes > 0) && (
                      <Popover label="Take back" align="end">
                        <MailForm
                          action={rollback}
                          fields={{ import_id: row.import_id }}
                          submitLabel="Take this file back"
                          pendingLabel="Taking back…"
                          variant="danger"
                        >
                          <p className="page-note">
                            Removes the {many} this file added that nobody has edited, archived,
                            linked to or worked on since, and puts back each field it filled in
                            while it still holds the file&rsquo;s value. A {one} or a field somebody
                            has changed since stays.
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
        </>
      )}
    </RecordSection>
  );
}
