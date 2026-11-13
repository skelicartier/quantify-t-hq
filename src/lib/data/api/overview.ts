import "server-only";

import { z } from "zod";

import { dataAsk, ok } from "@/lib/data/socket";

/**
 * The overview: the sending figures are always there (they come from Mail merge's own
 * record); every other block is given by the module that owns it, and is absent until
 * that module exists. The page draws what it is given and nothing for what it is not.
 */

export const dueKindSchema = z.enum([
  "follow_up",
  "waitlist",
  "investor",
  "key_date",
  "file_review",
]);
export type DueKind = z.infer<typeof dueKindSchema>;

export const dueItemSchema = z.object({
  key: z.string(),
  kind: dueKindSchema,
  title: z.string(),
  sub: z.string(),
  due_on: z.string(),
  href: z.string(),
});
export type DueItem = z.infer<typeof dueItemSchema>;

/** The newest replies, as the overview lists them (the replies module's own row is wider). */
export const overviewReplySchema = z.object({
  reply_id: z.string(),
  lead_id: z.string(),
  email: z.string(),
  name: z.string(),
  firm: z.string(),
  outcome: z.string(),
  received_at: z.string(),
});
export type OverviewReply = z.infer<typeof overviewReplySchema>;

/** The most recently added or changed files, as the overview lists them. */
export const overviewFileSchema = z.object({
  file_id: z.string(),
  title: z.string(),
  folder_path: z.string(),
  kind: z.string(),
  bytes: z.number(),
  updated_at: z.string(),
  updated_by_name: z.string(),
});
export type OverviewFile = z.infer<typeof overviewFileSchema>;

export const overviewSchema = ok.extend({
  today: z.string(),
  sent_today: z.number(),
  week: z.array(z.object({ day: z.string(), sent: z.number() })),
  sending: z.object({ mailing_id: z.string(), name: z.string() }).nullable(),
  due: z.array(dueItemSchema).default([]),
  replies: z
    .object({
      today: z.number(),
      yes_today: z.number(),
      yes_total: z.number(),
      latest: z.array(overviewReplySchema),
    })
    .optional(),
  follow_ups: z.object({ due: z.number(), overdue: z.number() }).optional(),
  recent_files: z.array(overviewFileSchema).optional(),
  waitlist: z.array(z.object({ stage: z.string(), count: z.number() })).optional(),
  backup: z
    .object({ last_at: z.string().nullable(), no_backup_disk: z.boolean().nullable() })
    .optional(),
});
export type DataOverview = z.infer<typeof overviewSchema>;

export const readDataOverview = () => dataAsk(overviewSchema, "GET", "/data/overview");
