import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";

const okEnvelope = z.object({ ok: z.literal(true) });
const option = z.object({ value: z.string(), label: z.string() });

// --- the changelog ---------------------------------------------------------------------------

export const ENTRY_KINDS = ["new", "improved", "fixed"] as const;

const entrySchema = z.object({
  entry_id: z.string(),
  title: z.string(),
  body: z.string(),
  kind: z.enum(ENTRY_KINDS),
  kind_label: z.string(),
  status: z.enum(["draft", "published"]),
  published_on: z.string().nullable(),
  published_by_name: z.string(),
  created_by_name: z.string(),
  updated_at: z.string().nullable(),
  requests: z.array(
    z.object({
      request_id: z.string(),
      title: z.string(),
      status: z.string(),
      asks: z.number(),
      not_told: z.number(),
    }),
  ),
});
export type ChangelogEntry = z.infer<typeof entrySchema>;

const changelogSchema = okEnvelope.extend({
  entries: z.array(entrySchema),
  kinds: z.array(option),
  requests: z.array(z.object({ request_id: z.string(), title: z.string(), status: z.string() })),
  can_write: z.boolean(),
});
export type Changelog = z.infer<typeof changelogSchema>;

const entryEnvelope = okEnvelope.extend({ entry: entrySchema });

export function readChangelog(token: string) {
  return fetchHqJson("hq/changelog", changelogSchema, { token });
}

export function readEntry(token: string, entryId: string) {
  return fetchHqJson(`hq/changelog/${entryId}`, entryEnvelope, { token });
}

export function createEntry(token: string, body: Record<string, string>) {
  return postHqJson("hq/changelog/create", entryEnvelope, { token, body });
}

export function actOnEntry(token: string, entryId: string, body: Record<string, string>) {
  return postHqJson(`hq/changelog/${entryId}/act`, entryEnvelope, { token, body });
}

const publicChangelogSchema = okEnvelope.extend({
  entries: z.array(
    z.object({
      title: z.string(),
      body: z.string(),
      kind: z.enum(ENTRY_KINDS),
      kind_label: z.string(),
      published_on: z.string(),
    }),
  ),
});
export type PublicChangelog = z.infer<typeof publicChangelogSchema>;

export function readPublicChangelog() {
  return fetchHqJson("public/changelog", publicChangelogSchema);
}

// --- the help centre ---------------------------------------------------------------------------

export const ARTICLE_STATUSES = ["draft", "published", "archived"] as const;

const articleSummary = z.object({
  article_id: z.string(),
  title: z.string(),
  category: z.string(),
  category_label: z.string(),
  tags: z.array(z.string()),
  status: z.enum(ARTICLE_STATUSES),
  owner_staff_id: z.string().nullable(),
  owner_name: z.string(),
  review_every_days: z.number(),
  reviewed_on: z.string().nullable(),
  review_due_on: z.string().nullable(),
  review_due: z.boolean(),
  tickets: z.number(),
  published_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type ArticleSummary = z.infer<typeof articleSummary>;

const articleSchema = articleSummary.extend({
  body: z.string(),
  linked_tickets: z.array(
    z.object({
      ticket_id: z.string(),
      subject: z.string(),
      status: z.string(),
      linked_at: z.string().nullable(),
    }),
  ),
  tickets_readable: z.boolean(),
});
export type Article = z.infer<typeof articleSchema>;

const helpSchema = okEnvelope.extend({
  articles: z.array(articleSummary),
  counts: z.object({ published: z.number(), review_due: z.number(), drafts: z.number() }),
  categories: z.array(option),
  can_write: z.boolean(),
});
export type HelpCentre = z.infer<typeof helpSchema>;

const gapsSchema = okEnvelope.extend({
  available: z.boolean(),
  reason: z.string(),
  gaps: z
    .object({
      since: z.string(),
      resolved: z.number(),
      answered_with_article: z.number(),
      groups: z.array(
        z.object({
          tag: z.string(),
          tickets: z.number(),
          articles_with_tag: z.number(),
          samples: z.array(z.object({ ticket_id: z.string(), subject: z.string() })),
        }),
      ),
    })
    .nullable(),
});
export type HelpGaps = z.infer<typeof gapsSchema>;

const articleReadSchema = okEnvelope.extend({
  article: articleSchema,
  staff: z.array(z.object({ staff_id: z.string(), name: z.string() })),
  categories: z.array(option),
});
export type ArticleRead = z.infer<typeof articleReadSchema>;

const articleEnvelope = okEnvelope.extend({ article: articleSchema });

export function readHelp(token: string, ticketId?: string) {
  return fetchHqJson("hq/help", helpSchema, {
    token,
    query: ticketId ? { ticket_id: ticketId } : {},
  });
}

export function readHelpGaps(token: string) {
  return fetchHqJson("hq/help/gaps", gapsSchema, { token });
}

export function readArticle(token: string, articleId: string) {
  return fetchHqJson(`hq/help/${articleId}`, articleReadSchema, { token });
}

export function createArticle(token: string, body: Record<string, string>) {
  return postHqJson("hq/help/create", articleEnvelope, { token, body });
}

export function actOnArticle(token: string, articleId: string, body: Record<string, string>) {
  return postHqJson(`hq/help/${articleId}/act`, articleEnvelope, { token, body });
}
