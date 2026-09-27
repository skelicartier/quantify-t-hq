import { archiveReplyAction, createReplyAction } from "@/app/(portal)/support/replies/actions";
import { PageHeader } from "@/components/shell/page-header";
import { SavedReplyForm } from "@/components/support/saved-reply-form";
import { Callout } from "@/components/ui/callout";
import { Card, Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiUnavailableError } from "@/lib/api/core";
import { listSavedReplies, type SavedReply } from "@/lib/api/tickets";

export const metadata = { title: "Saved replies" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "title", label: "Title" },
  { key: "body", label: "Body" },
  { key: "uses", label: "Uses", align: "end" as const },
  { key: "updated", label: "Updated" },
  { key: "actions", label: "", align: "end" as const },
];

export default async function SavedRepliesPage() {
  const context = await requireStaff("/support/replies");
  const canManage = hasCapability(context, "tickets:manage");
  let replies: readonly SavedReply[] | null = null;
  try {
    replies = (await listSavedReplies(context.token)).replies;
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError)) throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Saved replies"
        breadcrumbs={[{ label: "Support", href: "/support" }]}
        description="The desk's stock answers. Inserted into the composer, then edited to fit."
      />
      <Section id="replies" title="In the list">
        {replies === null ? (
          <Callout tone="danger" role="alert">
            Saved replies could not be read just now — a read failure, not an empty list.
          </Callout>
        ) : (
          <DataTable
            caption="Saved replies"
            columns={COLUMNS}
            isEmpty={replies.length === 0}
            empty={
              <EmptyState
                title="No saved replies yet"
                description="Save the answers the desk types twice a week; insert and edit rather than retype."
              />
            }
          >
            {replies.map((reply) => (
              <tr key={reply.reply_id} className={reply.archived ? "row--muted" : undefined}>
                <td>{reply.title}</td>
                <td>
                  <span className="table-sub">{reply.body.slice(0, 120)}</span>
                </td>
                <td className="data-table__num">{reply.uses}</td>
                <td>
                  <Timestamp value={reply.updated_at} mode="relative" />
                </td>
                <td className="data-table__num">
                  {canManage && (
                    <form action={archiveReplyAction}>
                      <input type="hidden" name="reply_id" value={reply.reply_id} />
                      <input
                        type="hidden"
                        name="archived"
                        value={reply.archived ? "false" : "true"}
                      />
                      <button className="btn btn--small btn--ghost" type="submit">
                        {reply.archived ? "Restore" : "Archive"}
                      </button>
                    </form>
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        )}
      </Section>
      {canManage && (
        <Section id="new-reply" title="Add one">
          <Card>
            <SavedReplyForm action={createReplyAction} />
          </Card>
        </Section>
      )}
    </>
  );
}
