import Link from "next/link";

import { articleAction } from "@/app/(portal)/_actions/knowledge";
import { ActForm } from "@/components/ui/act-form";
import { Field, Select } from "@/components/ui/field";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readHelp, type HelpCentre } from "@/lib/api/knowledge";

/**
 * The articles this ticket was answered with, and linking one — so the gap list knows which
 * questions already have an answer to point people at.
 */
export async function TicketArticles({
  token,
  ticketId,
  canWrite,
}: {
  token: string;
  ticketId: string;
  canWrite: boolean;
}) {
  let linked: HelpCentre | null = null;
  let all: HelpCentre | null = null;
  try {
    [linked, all] = await Promise.all([readHelp(token, ticketId), readHelp(token)]);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (linked === null || all === null)
    return <p className="field__hint">The help centre could not be read just now.</p>;
  const onTicket = new Set(linked.articles.map((article) => article.article_id));
  const choices = all.articles.filter(
    (article) => article.status === "published" && !onTicket.has(article.article_id),
  );
  return (
    <>
      {linked.articles.length === 0 ? (
        <p className="field__hint">No article linked yet.</p>
      ) : (
        <ul className="desk__related">
          {linked.articles.map((article) => (
            <li key={article.article_id}>
              <Link href={`/help/${article.article_id}`}>{article.title}</Link>
            </li>
          ))}
        </ul>
      )}
      {canWrite && choices.length > 0 && (
        // The article comes from the select; the act links this ticket to it.
        <ActForm
          action={articleAction}
          hidden={{ ticket_id: ticketId, return_to: `/support/${ticketId}` }}
          act="link_ticket"
          label="Link it"
        >
          <Field id="link-article" label="Link an article">
            <Select id="link-article" name="article_id" defaultValue={choices[0]?.article_id}>
              {choices.map((choice) => (
                <option key={choice.article_id} value={choice.article_id}>
                  {choice.title}
                </option>
              ))}
            </Select>
          </Field>
        </ActForm>
      )}
    </>
  );
}
