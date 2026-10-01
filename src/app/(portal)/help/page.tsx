import Link from "next/link";

import { createArticleAction } from "@/app/(portal)/_actions/knowledge";
import { ArticleStatePill, HelpTabs } from "@/components/help/help-parts";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readHelp, type HelpCentre } from "@/lib/api/knowledge";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Help centre" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "title", label: "Article" },
  { key: "category", label: "Category" },
  { key: "state", label: "State" },
  { key: "owner", label: "Owner" },
  { key: "review", label: "Next review" },
  { key: "tickets", label: "Tickets answered", align: "end" as const },
];

/**
 * The desk's own answers: who owns each, when it is next read again, and how many tickets
 * it has answered. Written here, linked from the ticket that needed it.
 */
export default async function HelpPage() {
  const context = await requireStaff("/help");
  let help: HelpCentre | null = null;
  try {
    help = await readHelp(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Desk"
        title="Help centre"
        description="The desk's own articles, each with an owner and a review date so an answer does not quietly go stale. Link one from the ticket it answered; the gaps are the questions nothing answers yet."
        actions={
          <>
            <HelpTabs current="/help" />
            {help?.can_write && (
              <Popover label="Write an article" variant="primary" width="wide">
                <ActForm
                  action={createArticleAction}
                  hidden={{}}
                  act="create"
                  label="Start it"
                  primary
                  tight={false}
                >
                  <Field id="article-title" label="The question it answers">
                    <Input
                      id="article-title"
                      name="title"
                      maxLength={200}
                      placeholder="Why is my chart blank?"
                    />
                  </Field>
                  <div className="form-grid">
                    <Field id="article-category" label="Category">
                      <Select id="article-category" name="category" defaultValue="troubleshooting">
                        {help.categories.map((item) => (
                          <option key={item.value} value={item.value}>
                            {item.label}
                          </option>
                        ))}
                      </Select>
                    </Field>
                    <Field id="article-tags" label="Ticket tags it answers" hint="Comma-separated.">
                      <Input id="article-tags" name="tags" maxLength={300} />
                    </Field>
                  </div>
                </ActForm>
              </Popover>
            )}
          </>
        }
      />
      {help === null ? (
        <Callout tone="danger" role="alert">
          The help centre could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <p className="page-note">
            {help.counts.published} published · {help.counts.review_due} due for review ·{" "}
            {help.counts.drafts} draft{help.counts.drafts === 1 ? "" : "s"}
          </p>
          <Section id="articles" title="Articles">
            <DataTable
              caption="Articles, published first and those due for review first among them"
              columns={COLUMNS}
              isEmpty={help.articles.length === 0}
              empty={<p className="muted">No articles yet.</p>}
            >
              {help.articles.map((article) => (
                <tr key={article.article_id}>
                  <td>
                    <Link href={`/help/${article.article_id}`}>{article.title}</Link>
                    {article.tags.length > 0 && (
                      <span className="quiet"> · {article.tags.join(", ")}</span>
                    )}
                  </td>
                  <td>{article.category_label}</td>
                  <td>
                    <ArticleStatePill status={article.status} reviewDue={article.review_due} />
                  </td>
                  <td>{article.owner_name || "Nobody"}</td>
                  <td>{formatDate(article.review_due_on, "—")}</td>
                  <td className="data-table__num">{article.tickets}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
