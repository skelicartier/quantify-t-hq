import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { MailForm } from "@/components/mail/mail-form";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { Timestamp } from "@/components/ui/timestamp";
import type { ActionState } from "@/lib/forms/action-state";
import { formatDate } from "@/lib/format";

/**
 * Actions from notes, as a table: on the Notes page's Actions view (with the firm and the
 * note each came from) and on one note's page (with "Move" on an open one). "Done" and
 * "Open again" are one press; the row is never hidden, only moved between Open and Done.
 */

type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type ActionTableRow = {
  action_id: string;
  note_id: string;
  title: string;
  due_on: string | null;
  owner: string;
  state: "open" | "done";
  done_at: string | null;
  /** The Notes page's columns: the note's title and the firm. */
  note_title?: string;
  subject_name?: string;
  firm_href?: string;
};

function Due({ row, today, now }: { row: ActionTableRow; today: string; now: number }) {
  if (row.state === "done")
    return (
      <>
        {row.due_on ? formatDate(row.due_on) : <span className="due due--none">No day</span>}
        {row.done_at && (
          <span className="table-sub">
            Done <Timestamp value={row.done_at} now={now} mode="relative" />
          </span>
        )}
      </>
    );
  return row.due_on ? (
    <DueChip due={row.due_on} today={today} />
  ) : (
    <span className="due due--none">No day</span>
  );
}

export function ActionsTable({
  caption,
  rows,
  today,
  now,
  path,
  setState,
  move,
  showFrom,
}: {
  caption: string;
  rows: readonly ActionTableRow[];
  today: string;
  now: number;
  /** The firm's page, refreshed with the note's. */
  path: string;
  setState: Action;
  /** "Move" on an open action: on the note's own page. */
  move?: Action;
  showFrom: boolean;
}) {
  const columns = [
    { key: "due", label: "Due" },
    { key: "action", label: "Action", width: showFrom ? "28%" : "40%" },
    ...(showFrom
      ? [
          { key: "firm", label: "Firm" },
          { key: "from", label: "From" },
        ]
      : []),
    { key: "who", label: "Who" },
    { key: "change", label: "Change", align: "end" as const },
  ];
  return (
    <DataTable caption={caption} columns={columns} columnMenu={false} scroll={false}>
      {rows.map((row) => (
        <tr
          key={row.action_id}
          id={`action-${row.action_id}`}
          className={row.state === "done" ? "hqdata-notes__row--done" : undefined}
        >
          <td className="nowrap">
            <Due row={row} today={today} now={now} />
          </td>
          <td>
            <span className="table-title">{row.title}</span>
          </td>
          {showFrom && (
            <>
              <td>
                {row.firm_href ? (
                  <Link className="text-link" href={row.firm_href}>
                    {row.subject_name}
                  </Link>
                ) : (
                  row.subject_name
                )}
              </td>
              <td>
                <Link className="text-link" href={`/data/notes/${row.note_id}`}>
                  {row.note_title}
                </Link>
              </td>
            </>
          )}
          <td>{row.owner || <span className="table-sub">Nobody named</span>}</td>
          <td>
            <div className="hqdata-notes__acts">
              <RowAction
                action={setState}
                fields={{
                  note_id: row.note_id,
                  action_id: row.action_id,
                  to: row.state === "open" ? "done" : "open",
                  path,
                }}
                buttons={[
                  {
                    label: row.state === "open" ? "Done" : "Open again",
                    className: "btn btn--small",
                    ariaLabel: `${row.state === "open" ? "Done" : "Open again"}: ${row.title}`,
                    pendingLabel: "Saving…",
                  },
                ]}
              />
              {move && row.state === "open" && (
                <Popover label="Move" align="end">
                  <MailForm
                    action={move}
                    fields={{ note_id: row.note_id, action_id: row.action_id, path }}
                    submitLabel="Move it"
                    pendingLabel="Moving…"
                  >
                    <Field id={`move-${row.action_id}`} label="By">
                      <Input
                        id={`move-${row.action_id}`}
                        name="due_on"
                        type="date"
                        defaultValue={row.due_on ?? ""}
                      />
                    </Field>
                  </MailForm>
                </Popover>
              )}
            </div>
          </td>
        </tr>
      ))}
    </DataTable>
  );
}
