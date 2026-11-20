import "server-only";

import { z } from "zod";

import { agreementViewSchema } from "@/lib/data/api/pilots";
import { fileOptionSchema } from "@/lib/data/api/questionnaires";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Regulatory profiles (ws-notes/security/spec.md §9.5): one per waitlist firm, the rules it
 * works under, the duties its contract passes down, which are in the contract, and the day it
 * applies from. Kept on this computer by the local service.
 */

const regimeSchema = z.enum(["sebi", "dora", "uk", "other"]);
const severitySchema = z.enum(["critical", "high", "medium", "low"]);
const effectSchema = z.object({
  sources: z.array(z.string()),
  severities: z.array(severitySchema),
  days: z.number().nullable(),
  months: z.number().nullable(),
});

export const flowdownSchema = z.object({
  key: z.string(),
  regime: regimeSchema,
  words: z.string(),
  ref: z.string(),
  sources: z.array(z.object({ name: z.string(), url: z.string() })),
  verified_on: z.string(),
  effect: effectSchema.nullable(),
  note: z.string(),
});
export type FlowdownView = z.infer<typeof flowdownSchema>;

export const dutySchema = z.object({
  duty_id: z.string(),
  key: z.string().nullable(),
  words: z.string(),
  state: z.enum(["", "in_contract", "not_in_contract"]),
  agreement_id: z.string().nullable(),
  file_id: z.string().nullable(),
  note: z.string(),
  withdrawn: z.object({ on: z.string(), why: z.string() }).nullable(),
  shown: z.string(),
  ref: z.string(),
  regime: regimeSchema.nullable(),
  note_from_list: z.string(),
  effect: effectSchema.nullable(),
  critical_only: z.boolean(),
});
export type DutyView = z.infer<typeof dutySchema>;

export const profileLineSchema = z.object({
  entry_id: z.string(),
  firm: z.string(),
  regimes: z.array(regimeSchema),
  in_contract: z.number(),
  unchecked: z.number(),
  href: z.string(),
});
export type ProfileLineView = z.infer<typeof profileLineSchema>;

export const profileDetailSchema = z.object({
  profile_id: z.string(),
  entry_id: z.string(),
  firm: z.string(),
  regimes: z.object({
    sebi: z
      .object({
        category: z.enum([
          "",
          "mii",
          "qualified",
          "mid",
          "small",
          "self_certification",
          "not_known",
        ]),
      })
      .nullable(),
    dora: z.object({ critical_function: z.enum(["yes", "no", ""]) }).nullable(),
    uk: z.object({ note: z.string() }).nullable(),
    other: z.string(),
  }),
  applies_from: z.string().nullable(),
  duties: z.array(dutySchema),
  notes: z.string(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
  line: profileLineSchema,
  rules: z.string(),
  in_force: z.boolean(),
  applies_words: z.string(),
  effects: z.array(z.string()),
});
export type ProfileDetail = z.infer<typeof profileDetailSchema>;

export const profileRowSchema = profileLineSchema.extend({
  profile_id: z.string(),
  rules: z.string(),
  duties: z.number(),
  not_in_contract: z.number(),
  applies_from: z.string().nullable(),
  in_force: z.boolean(),
});
export type ProfileRow = z.infer<typeof profileRowSchema>;

export const profilesPageSchema = ok.extend({
  profiles: z.array(profileRowSchema),
  counts: z.object({ profiles: z.number(), in_contract: z.number(), unchecked: z.number() }),
  today: z.string(),
});
export type ProfilesPage = z.infer<typeof profilesPageSchema>;

export const entryProfileSchema = ok.extend({
  profile: profileDetailSchema.nullable(),
  entry: z.object({ entry_id: z.string(), firm: z.string(), stage: z.string() }).nullable(),
  agreements: z.array(agreementViewSchema).nullable(),
  flowdowns: z.array(flowdownSchema),
  events: z.array(
    z.object({
      event_id: z.string(),
      profile_id: z.string(),
      verb: z.string(),
      detail: z.string(),
      by: staffSchema,
      at: z.string(),
    }),
  ),
  files: z.array(fileOptionSchema),
  files_here: z.boolean(),
  today: z.string(),
});
export type EntryProfile = z.infer<typeof entryProfileSchema>;

const profileAnswer = ok.extend({ profile: profileDetailSchema });

export const readProfiles = () => dataAsk(profilesPageSchema, "GET", "/data/profiles");

export const readEntryProfile = (entryId: string) =>
  dataAsk(entryProfileSchema, "GET", `/data/profiles/for-entry/${id(entryId)}`);

export const startProfile = (entryId: string, by: Staff, attempt: string) =>
  dataAsk(profileAnswer, "POST", "/data/profiles", { entry_id: entryId, by, attempt });

export type ProfileInput = {
  sebi: boolean;
  sebi_category: string;
  dora: boolean;
  dora_critical: string;
  uk: boolean;
  uk_note: string;
  other: string;
  applies_from: string;
  notes: string;
};

export const updateProfile = (profileId: string, input: ProfileInput, by: Staff) =>
  dataAsk(profileAnswer, "POST", `/data/profiles/${id(profileId)}/update`, { ...input, by });

export const addDuty = (
  profileId: string,
  input: { key: string } | { words: string },
  by: Staff,
  attempt: string,
) =>
  dataAsk(profileAnswer, "POST", `/data/profiles/${id(profileId)}/duties`, {
    ...input,
    by,
    attempt,
  });

export type DutyInput = {
  state: string;
  agreement_id: string;
  note: string;
  file: { file_id: string } | { content: string; name: string } | null;
};

export const saveDuty = (profileId: string, dutyId: string, input: DutyInput, by: Staff) =>
  dataAsk(profileAnswer, "POST", `/data/profiles/${id(profileId)}/duties/${id(dutyId)}`, {
    state: input.state,
    agreement_id: input.agreement_id,
    note: input.note,
    ...(input.file
      ? "file_id" in input.file
        ? { file_id: input.file.file_id }
        : { content: input.file.content, name: input.file.name }
      : {}),
    by,
  });

export const withdrawDuty = (profileId: string, dutyId: string, why: string, by: Staff) =>
  dataAsk(profileAnswer, "POST", `/data/profiles/${id(profileId)}/duties/${id(dutyId)}/withdraw`, {
    why,
    by,
  });
