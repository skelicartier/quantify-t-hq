import "server-only";

import { z } from "zod";

import { dataAsk, ok } from "@/lib/data/socket";

/**
 * The registers' shared shapes (ws-notes/duties/spec.md §6.6) and the Summary's one read.
 * `ruleLineSchema` is the contract's `RuleLine`: what an answer carries beside every day or
 * comparison worked out from a duty rule, so the page can say who to confirm it with.
 * `dutyReadingSchema` is one of the amounts the sources give when they disagree.
 */

export const confirmWithSchema = z.enum(["CA", "CS", "lawyer", "agent", "bank"]);

export const ruleLineSchema = z.object({
  key: z.string(),
  title: z.string(),
  confirm_with: confirmWithSchema.nullable(),
  confirmed_by: z.string().nullable(),
  confirmed_on: z.string().nullable(),
  usable: z.boolean(),
  starts_on: z.string().nullable(),
  readings: z.array(z.string()),
});
export type RuleLineAnswer = z.infer<typeof ruleLineSchema>;

export const dutyReadingSchema = z.object({
  label: z.string(),
  amount: z.number().nullable(),
  words: z.string(),
  sources: z.array(z.object({ name: z.string(), url: z.string() })),
});
export type DutyReadingAnswer = z.infer<typeof dutyReadingSchema>;

/** A file a record keeps, as its page links to it; null when it is gone or in the trash. */
export const fileLinkSchema = z.object({ file_id: z.string(), title: z.string() });
export type FileLinkAnswer = z.infer<typeof fileLinkSchema>;

/** The files a form may choose from. */
export const fileChoiceSchema = z.object({
  file_id: z.string(),
  title: z.string(),
  folder: z.string(),
});

export const registerKeySchema = z.enum(["incidents", "marks", "domains", "holidays"]);
export type RegisterKey = z.infer<typeof registerKeySchema>;

export const nextDateSchema = z.object({ title: z.string(), on: z.string() });

export const registersSchema = ok.extend({
  rows: z.array(
    z.object({
      key: registerKeySchema,
      records: z.number().nullable(),
      next: nextDateSchema.nullable(),
      href: z.string(),
    }),
  ),
  today: z.string(),
});
export type RegistersSummary = z.infer<typeof registersSchema>;

export const readRegisters = () => dataAsk(registersSchema, "GET", "/data/registers");
