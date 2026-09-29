import Link from "next/link";

import { saveListAction } from "@/app/(portal)/mail/actions";
import { MailForm } from "@/components/mail/mail-form";
import { MailTabs } from "@/components/mail/mail-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readLists, type MailList } from "@/lib/api/mail";
import { requestNow } from "@/lib/request-time";

export const metadata = { title: "Lists" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "name", label: "List" },
  { key: "members", label: "People", align: "end" as const },
  { key: "columns", label: "Its own columns" },
  { key: "by", label: "Made by" },
  { key: "updated", label: "Updated" },
];

function NewListFields() {
  return (
    <>
      <Field id="list-name" label="Name">
        <Input id="list-name" name="name" maxLength={120} required />
      </Field>
      <Field
        id="list-description"
        label="What it is"
        hint="Optional: where these people came from, what they are for."
      >
        <Textarea id="list-description" name="description" rows={2} maxLength={400} />
      </Field>
    </>
  );
}

/**
 * Named groups of people: filled from a file, by hand or from the CRM, and mailed as a
 * campaign's audience. A list stays as it was made; a segment is the one that changes.
 */
export default async function ListsPage() {
  const context = await requireStaff("/mail/lists");
  const now = requestNow();
  let lists: MailList[] | null = null;
  try {
    lists = (await readLists(context.token)).lists;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  return (
    <>
      <PageHeader
        eyebrow="Mail"
        title="Lists"
        description="Named groups of people — a webinar's sign-ups, a conference's contacts, a partner's introductions. Fill one from a CSV (every column kept), by hand, or from the CRM, then send a campaign to it. Being on a list is not consent: stops, bounces and consent are checked at every send."
        actions={
          <>
            {canWrite && (
              <Popover label="New list" variant="primary" width="wide">
                <MailForm action={saveListAction} submitLabel="Create list">
                  <NewListFields />
                </MailForm>
              </Popover>
            )}
            <MailTabs current="/mail/lists" />
          </>
        }
      />
      <div className="page-content">
        {lists === null ? (
          <Callout tone="danger" role="alert">
            Lists could not be read just now. This is a read failure, not an empty page.
          </Callout>
        ) : (
          <DataTable
            caption="Lists"
            columns={COLUMNS}
            isEmpty={lists.length === 0}
            empty={
              <EmptyState
                title="No lists yet"
                description="Make one, then add people from a CSV, by hand, or from the CRM."
              />
            }
          >
            {lists.map((list) => (
              <tr key={list.list_id} className={list.archived_at ? "row--muted" : undefined}>
                <td>
                  <Link className="table-title" href={`/mail/lists/${list.list_id}`}>
                    {list.name}
                  </Link>
                  <span className="table-sub">
                    {list.archived_at ? "Archived" : list.description || "No description"}
                  </span>
                </td>
                <td className="data-table__num">{list.members.toLocaleString("en-GB")}</td>
                <td>
                  {list.columns.length ? (
                    list.columns.join(", ")
                  ) : (
                    <span className="table-sub">Only the standard ones</span>
                  )}
                </td>
                <td>{list.created_by?.name || "—"}</td>
                <td>
                  <Timestamp value={list.updated_at} now={now} mode="relative" />
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </div>
    </>
  );
}
