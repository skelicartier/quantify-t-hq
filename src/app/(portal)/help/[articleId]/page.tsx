import Link from "next/link";
import { notFound } from "next/navigation";

import { articleAction } from "@/app/(portal)/_actions/knowledge";
import { ArticleStatePill } from "@/components/help/help-parts";
import { PageHeader } from "@/components/shell/page-header";
import { CopyAnswer } from "@/components/trust/copy-answer";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readArticle, type ArticleRead } from "@/lib/api/knowledge";
import { formatAbsolute, formatDate } from "@/lib/format";

export const metadata = { title: "Article" };
export const dynamic = "force-dynamic";

type Params = Promise<{ articleId: string }>;

/** One article: the answer, who owns it, when it is next read again, the tickets it answered. */
export default async function ArticlePage({ params }: { params: Params }) {
  const { articleId } = await params;
  const context = await requireStaff(`/help/${articleId}`);
  let read: ArticleRead | null = null;
  try {
    read = await readArticle(context.token, articleId);
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (read === null) {
    return (
      <>
        <PageHeader eyebrow="Help centre" title="Article" />
        <Callout tone="danger" role="alert">
          This article could not be read just now.
        </Callout>
      </>
    );
  }
  const { article, staff, categories } = read;
  const canWrite = hasCapability(context, "tickets:write");
  const hidden = { article_id: article.article_id };

  return (
    <>
      <RecordHeader
        crumbs={[{ href: "/help", label: "Help centre" }]}
        title={article.title}
        status={<ArticleStatePill status={article.status} reviewDue={article.review_due} />}
        readouts={[
          { label: "Category", value: article.category_label },
          { label: "Next review", value: formatDate(article.review_due_on, "—") },
          { label: "Tickets answered", value: String(article.tickets) },
        ]}
      />
      {article.review_due && (
        <Callout tone="attention" compact>
          Due for review since {formatDate(article.review_due_on)}. Read it again: is it still true?
        </Callout>
      )}
      <RecordGrid
        side={
          <Properties title="Article">
            <Property label="Owner">{article.owner_name || "Nobody"}</Property>
            <Property label="Tags">{article.tags.join(", ") || "—"}</Property>
            <Property label="Read again every">{article.review_every_days} days</Property>
            <Property label="Last read again">{formatDate(article.reviewed_on, "—")}</Property>
            <Property label="Published">{formatAbsolute(article.published_at, "—")}</Property>
          </Properties>
        }
      >
        <RecordSection
          id="answer"
          title="The answer"
          actions={
            article.body ? <CopyAnswer text={article.body} label="Copy the answer" /> : undefined
          }
        >
          <p className="prewrap">{article.body || "Not written yet."}</p>
        </RecordSection>

        <RecordSection id="tickets" title="Tickets it answered">
          {!article.tickets_readable && (
            <Callout tone="neutral" compact>
              The desk could not be read just now; the links are shown without their subjects.
            </Callout>
          )}
          <DataTable
            caption="Tickets this article answered, newest link first"
            columns={[
              { key: "ticket", label: "Ticket" },
              { key: "status", label: "State" },
              { key: "linked", label: "Linked" },
              { key: "act", label: "Action" },
            ]}
            isEmpty={article.linked_tickets.length === 0}
            empty={<p className="muted">Not linked from a ticket yet.</p>}
            columnMenu={false}
          >
            {article.linked_tickets.map((ticket) => (
              <tr key={ticket.ticket_id}>
                <td>
                  <Link href={`/support/${ticket.ticket_id}`}>
                    {ticket.subject || ticket.ticket_id}
                  </Link>
                </td>
                <td>{ticket.status || "—"}</td>
                <td>{formatAbsolute(ticket.linked_at, "—")}</td>
                <td>
                  {canWrite && (
                    <RowAction
                      action={articleAction}
                      fields={{ ...hidden, ticket_id: ticket.ticket_id, action: "unlink_ticket" }}
                      buttons={[
                        {
                          label: "Unlink",
                          className: "btn btn--small btn--ghost",
                          ariaLabel: `Unlink ${ticket.subject || ticket.ticket_id}`,
                        },
                      ]}
                    />
                  )}
                </td>
              </tr>
            ))}
          </DataTable>
        </RecordSection>

        {canWrite && (
          <RecordSection id="write" title="Write it">
            <ActForm action={articleAction} hidden={hidden} act="edit" label="Save" tight={false}>
              <Field id="edit-title" label="The question it answers">
                <Input id="edit-title" name="title" maxLength={200} defaultValue={article.title} />
              </Field>
              <Field
                id="edit-body"
                label="The answer"
                hint="Rewriting a published answer counts as reading it again."
              >
                <Textarea
                  id="edit-body"
                  name="body"
                  rows={10}
                  maxLength={20000}
                  defaultValue={article.body}
                />
              </Field>
              <div className="form-grid">
                <Field id="edit-category" label="Category">
                  <Select id="edit-category" name="category" defaultValue={article.category}>
                    {categories.map((item) => (
                      <option key={item.value} value={item.value}>
                        {item.label}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="edit-tags" label="Ticket tags it answers">
                  <Input
                    id="edit-tags"
                    name="tags"
                    maxLength={300}
                    defaultValue={article.tags.join(", ")}
                  />
                </Field>
              </div>
              <div className="form-grid">
                <Field id="edit-owner" label="Owner">
                  <Select
                    id="edit-owner"
                    name="owner_staff_id"
                    defaultValue={article.owner_staff_id ?? ""}
                  >
                    <option value="">Nobody</option>
                    {staff.map((person) => (
                      <option key={person.staff_id} value={person.staff_id}>
                        {person.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field id="edit-every" label="Read again every (days)">
                  <Input
                    id="edit-every"
                    name="review_every_days"
                    type="number"
                    min={30}
                    max={730}
                    defaultValue={article.review_every_days}
                  />
                </Field>
              </div>
            </ActForm>
            <div className="form-grid">
              {article.status === "draft" && (
                <Card
                  title="Publish it"
                  titleAs="h3"
                  description="The desk can link it from tickets once it is published."
                >
                  <ActForm
                    action={articleAction}
                    hidden={hidden}
                    act="publish"
                    label="Publish"
                    primary
                  />
                </Card>
              )}
              {article.status === "published" && (
                <Card
                  title="Read it again"
                  titleAs="h3"
                  description="Still true as written: the review clock restarts."
                >
                  <ActForm
                    action={articleAction}
                    hidden={hidden}
                    act="reviewed"
                    label="Still true"
                    primary
                  />
                </Card>
              )}
              {article.status !== "archived" ? (
                <Card
                  title="Archive it"
                  titleAs="h3"
                  description="No longer offered from tickets; kept with its links."
                >
                  <ActForm
                    action={articleAction}
                    hidden={hidden}
                    act="archive"
                    label="Archive"
                    danger
                  />
                </Card>
              ) : (
                <Card title="Bring it back" titleAs="h3" description="Back to a draft.">
                  <ActForm action={articleAction} hidden={hidden} act="restore" label="Restore" />
                </Card>
              )}
            </div>
          </RecordSection>
        )}
      </RecordGrid>
    </>
  );
}
