import Link from "next/link";
import { notFound } from "next/navigation";

import {
  addRowAction,
  deleteListAction,
  removeRowAction,
  renameListAction,
  updateRowAction,
} from "@/app/(portal)/mail/merge/actions";
import { MailForm } from "@/components/mail/mail-form";
import { MailTabs } from "@/components/mail/mail-tabs";
import { SenderDown } from "@/components/mail/merge";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Pagination } from "@/components/ui/pagination";
import { Popover } from "@/components/ui/popover";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { Stat, StatGrid } from "@/components/ui/stat";
import { StatusPill } from "@/components/ui/status-pill";
import { formatNumber } from "@/lib/format";
import { MERGE_ROLE_LINE, requireMerge } from "@/lib/merge/access";
import {
  MergeRequestError,
  MergeUnavailableError,
  readMergeList,
  type MergeListDetail,
} from "@/lib/merge/api";

export const metadata = { title: "Mail merge list" };
export const dynamic = "force-dynamic";

const LEFT_OUT_COLUMNS = [
  { key: "line", label: "Line", align: "end" as const },
  { key: "why", label: "Why" },
  { key: "value", label: "What it held" },
];
/** Beyond this the table stops being readable on a screen; every column still works. */
const SHOWN_COLUMNS = 6;

/** One list: who is on it, what each column is called in a message, what was left out. */
export default async function MailMergeListPage({
  params,
  searchParams,
}: {
  params: Promise<{ listId: string }>;
  searchParams: Promise<{
    offset?: string;
    added?: string;
    q?: string;
    edit?: string;
    back?: string;
  }>;
}) {
  const { listId } = await params;
  const query = await searchParams;
  const { allowed } = await requireMerge(`/mail/merge/lists/${listId}`);
  const offset = Math.max(0, Number.parseInt(query.offset ?? "0", 10) || 0);
  const search = (query.q ?? "").slice(0, 200);
  const editId = /^r\d{1,8}$/.test(query.edit ?? "") ? query.edit : undefined;
  const back = /^[A-Za-z0-9-]{1,64}$/.test(query.back ?? "") ? query.back : undefined;
  let detail: MergeListDetail | null = null;
  if (allowed) {
    try {
      detail = await readMergeList(listId, {
        offset,
        q: search,
        ...(editId ? { row: editId } : {}),
      });
    } catch (error) {
      if (error instanceof MergeRequestError && error.status === 404) notFound();
      if (!(error instanceof MergeUnavailableError || error instanceof MergeRequestError))
        throw error;
    }
  }
  const list = detail?.list;
  const columns = (list?.columns ?? []).filter((column) => column.key !== "email");
  const editing = detail?.editing ?? null;
  const self = `/mail/merge/lists/${listId}`;
  const shown = columns.slice(0, SHOWN_COLUMNS);
  const tableColumns = [
    { key: "email", label: "Email" },
    ...shown.map((column) => ({ key: column.key, label: column.label })),
    { key: "act", label: "Actions" },
  ];
  return (
    <>
      <PageHeader
        eyebrow="Mail merge"
        title={list?.name ?? "List"}
        actions={
          <>
            <Link
              className="btn btn--small"
              href={back ? `/mail/merge/mailings/${back}` : "/mail/merge"}
            >
              {back ? "Back to the mailing" : "Back to Mail merge"}
            </Link>
            {list && (
              <Popover label="Add a person" variant="primary" width="wide">
                <MailForm
                  action={addRowAction}
                  fields={{ list_id: list.id }}
                  submitLabel="Add to this list"
                >
                  <Field id="merge-row-new-email" label="Email">
                    <Input id="merge-row-new-email" name="email" type="email" required />
                  </Field>
                  {columns.slice(0, 12).map((column) => (
                    <Field key={column.key} id={`merge-new-${column.key}`} label={column.label}>
                      <Input id={`merge-new-${column.key}`} name={`value_${column.key}`} />
                    </Field>
                  ))}
                </MailForm>
              </Popover>
            )}
            {list && (
              <Popover label="Rename" width="wide">
                <MailForm
                  action={renameListAction}
                  fields={{ list_id: list.id }}
                  submitLabel="Rename"
                >
                  <Field id="merge-list-rename" label="Name">
                    <Input
                      id="merge-list-rename"
                      name="name"
                      maxLength={120}
                      defaultValue={list.name}
                      required
                    />
                  </Field>
                </MailForm>
              </Popover>
            )}
            {list && (
              <MailForm
                action={deleteListAction}
                fields={{ list_id: list.id }}
                submitLabel="Delete this list"
                variant="danger"
                className="inline-form"
              />
            )}
            <MailTabs current="/mail/merge" />
          </>
        }
      />
      <div className="page-content">
        {!allowed ? (
          <Callout tone="neutral">{MERGE_ROLE_LINE}</Callout>
        ) : !detail || !list ? (
          <SenderDown />
        ) : (
          <>
            {query.added && (
              <Callout tone="success" role="status" compact>
                {formatNumber(list.people)} people added from {list.file_name}
                {list.left_out > 0 ? `; ${formatNumber(list.left_out)} rows left out, below.` : "."}
              </Callout>
            )}
            {editing && (
              <RecordSection id="merge-edit" title={`Edit ${editing.email}`}>
                <MailForm
                  action={updateRowAction}
                  fields={{ list_id: list.id, row_id: editing.id }}
                  submitLabel="Save this person"
                >
                  <Field id="merge-edit-email" label="Email">
                    <Input
                      id="merge-edit-email"
                      name="email"
                      type="email"
                      defaultValue={editing.email}
                      required
                    />
                  </Field>
                  {columns.map((column) => {
                    const value = editing.values[column.key] ?? "";
                    return (
                      <Field key={column.key} id={`merge-edit-${column.key}`} label={column.label}>
                        {value.length > 60 ? (
                          <Textarea
                            id={`merge-edit-${column.key}`}
                            name={`value_${column.key}`}
                            rows={3}
                            defaultValue={value}
                          />
                        ) : (
                          <Input
                            id={`merge-edit-${column.key}`}
                            name={`value_${column.key}`}
                            defaultValue={value}
                          />
                        )}
                      </Field>
                    );
                  })}
                </MailForm>
                <Link className="text-link" href={back ? `/mail/merge/mailings/${back}` : self}>
                  Done
                </Link>
              </RecordSection>
            )}
            <StatGrid columns={3} label="This list">
              <Stat label="People" value={formatNumber(list.people)} />
              <Stat label="Rows left out" value={formatNumber(list.left_out)} />
              <Stat label="Addresses from" value={list.email_column} text />
            </StatGrid>
            <RecordSection id="merge-fields" title="Fields for the message">
              <ul className="merge-fields" aria-label="Fields this list gives a message">
                {list.columns.map((column) => (
                  <li key={column.key}>
                    <code className="merge-field">{`{{${column.key}}}`}</code>
                    <span className="table-sub">{column.label}</span>
                  </li>
                ))}
              </ul>
            </RecordSection>
            <RecordSection id="merge-people" title="People">
              <form className="merge-search" method="get" action={self}>
                <label className="sr-only" htmlFor="merge-list-search">
                  Find people by name, address or any column
                </label>
                <Input
                  id="merge-list-search"
                  name="q"
                  type="search"
                  defaultValue={search}
                  placeholder="Find by name, address, firm, tier…"
                />
                <button type="submit" className="btn btn--small">
                  Find
                </button>
              </form>
              {columns.length > SHOWN_COLUMNS && (
                <p className="side-quiet">
                  The first {SHOWN_COLUMNS} columns are shown; all {columns.length} work as fields.
                </p>
              )}
              <DataTable caption="People on this list" columns={tableColumns}>
                {detail.rows.map((row) => (
                  <tr key={row.id}>
                    <td className="mono">
                      {row.email}
                      {row.stopped && (
                        <>
                          {" "}
                          <StatusPill value="stopped" label="On the stop list" tone="attention" />
                        </>
                      )}
                    </td>
                    {shown.map((column) => (
                      <td key={column.key}>{row.values[column.key] ?? ""}</td>
                    ))}
                    <td className="merge-row-acts">
                      <Link
                        className="btn btn--small btn--ghost"
                        href={`${self}?edit=${row.id}${search ? `&q=${encodeURIComponent(search)}` : ""}`}
                        aria-label={`Edit ${row.email}`}
                      >
                        Edit
                      </Link>
                      <RowAction
                        action={removeRowAction}
                        fields={{ list_id: list.id, row_id: row.id }}
                        buttons={[
                          {
                            label: "Remove",
                            className: "btn btn--small btn--ghost",
                            ariaLabel: `Remove ${row.email} from this list`,
                          },
                        ]}
                      />
                    </td>
                  </tr>
                ))}
              </DataTable>
              {detail.total > detail.limit && (
                <Pagination
                  offset={detail.offset}
                  limit={detail.limit}
                  returned={detail.rows.length}
                  hasMore={detail.offset + detail.limit < detail.total}
                  nextOffset={detail.offset + detail.limit}
                  buildHref={(next) =>
                    `${self}?offset=${next}${search ? `&q=${encodeURIComponent(search)}` : ""}`
                  }
                  noun="people"
                />
              )}
            </RecordSection>
            {detail.left_out.length > 0 && (
              <RecordSection id="merge-left-out" title="Rows left out">
                <DataTable caption="Rows left out of this list" columns={LEFT_OUT_COLUMNS}>
                  {detail.left_out.map((row) => (
                    <tr key={row.line}>
                      <td className="data-table__num">{formatNumber(row.line)}</td>
                      <td>{row.reason}</td>
                      <td className="mono">{row.value}</td>
                    </tr>
                  ))}
                </DataTable>
              </RecordSection>
            )}
            {detail.used_by.length > 0 && (
              <RecordSection id="merge-used-by" title="Used by">
                <ul className="policy-list">
                  {detail.used_by.map((mailing) => (
                    <li key={mailing.id} className="policy">
                      <Link className="text-link" href={`/mail/merge/mailings/${mailing.id}`}>
                        {mailing.name}
                      </Link>
                    </li>
                  ))}
                </ul>
              </RecordSection>
            )}
          </>
        )}
      </div>
    </>
  );
}
