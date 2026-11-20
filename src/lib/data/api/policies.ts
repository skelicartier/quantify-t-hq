import "server-only";

import { z } from "zod";

import { fileChoiceSchema } from "@/lib/data/api/registers";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, ok } from "@/lib/data/socket";
import { POLICY_STATE_KEYS } from "@/lib/data/labels-assurance";

/**
 * The policy register (ws-notes/security/spec.md §8.4): the eleven expected policies and his
 * own, each with the Files document linked as it (its version and review date are Files'
 * own), who owns and approved it, and its state in words.
 */

export const policyViewSchema = z.object({
  key: z.string(),
  own: z.boolean(),
  title: z.string(),
  controls: z.array(z.string()),
  why: z.string(),
  trust_label: z.string().nullable(),
  trust_words: z.string(),
  file: z
    .object({
      file_id: z.string(),
      title: z.string(),
      folder: z.string(),
      version: z.number(),
      review_by: z.string().nullable(),
      trashed: z.boolean(),
      href: z.string(),
    })
    .nullable(),
  file_id: z.string().nullable(),
  owner: z.string(),
  approved_by: z.string(),
  approved_on: z.string().nullable(),
  note: z.string(),
  not_needed: z.object({ why: z.string(), on: z.string() }).nullable(),
  state: z.enum(POLICY_STATE_KEYS),
  state_label: z.string(),
  words: z.string(),
  next_review: z.string().nullable(),
  updated_at: z.string().nullable(),
  updated_by: staffSchema.nullable(),
  href: z.string(),
});
export type PolicyView = z.infer<typeof policyViewSchema>;

export const policiesPageSchema = ok.extend({
  policies: z.array(policyViewSchema),
  own: z.array(policyViewSchema),
  counts: z.object({
    expected: z.number(),
    linked: z.number(),
    current: z.number(),
    lapsed: z.number(),
    own: z.number(),
  }),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  today: z.string(),
});
export type PoliciesPage = z.infer<typeof policiesPageSchema>;

const policyAnswer = ok.extend({ policy: policyViewSchema });

/** A policy key in a path: lower case, digits, "_" and "-" (the service's own pattern). */
const keyOf = (key: string): string => (/^[a-z0-9_-]{1,64}$/.test(key) ? key : "unknown");

export const readPolicies = () => dataAsk(policiesPageSchema, "GET", "/data/policies");

export const linkPolicy = (key: string, fileId: string | null, by: Staff) =>
  dataAsk(policyAnswer, "POST", `/data/policies/${keyOf(key)}/link`, { file_id: fileId, by });

export const updatePolicy = (
  key: string,
  input: {
    owner?: string;
    approved_by?: string;
    approved_on?: string;
    note?: string;
    title?: string;
  },
  by: Staff,
) => dataAsk(policyAnswer, "POST", `/data/policies/${keyOf(key)}/update`, { ...input, by });

export const policyNotNeeded = (key: string, input: { why: string } | { undo: true }, by: Staff) =>
  dataAsk(policyAnswer, "POST", `/data/policies/${keyOf(key)}/not-needed`, { ...input, by });

export const addOwnPolicy = (title: string, by: Staff, attempt: string) =>
  dataAsk(policyAnswer, "POST", "/data/policies/own", { title, by, attempt });
