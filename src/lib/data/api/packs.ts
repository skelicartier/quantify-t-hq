import "server-only";

import { z } from "zod";

import { fileRowSchema } from "@/lib/data/api/files";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * Data-room packs, as the portal reads and writes them: a numbered set of files, what is
 * still missing, the index, and the record he keeps of who was given which version. The
 * zip is a build (`pack_zip`); nothing here sends a pack anywhere.
 */

const staffSchema = z.object({ staff_id: z.string(), name: z.string() });

export const packCoverSchema = z.enum([
  "deck",
  "team",
  "roadmap",
  "cap_table",
  "pilot_data",
  "burn",
  "other",
]);
export type PackCoverValue = z.infer<typeof packCoverSchema>;
export const packShareHowSchema = z.enum(["mailbox", "meeting", "link"]);
export type PackShareHowValue = z.infer<typeof packShareHowSchema>;

export const packItemSchema = z.object({
  item_id: z.string(),
  file_id: z.string(),
  covers: packCoverSchema,
  note: z.string(),
  added_at: z.string(),
  added_by: staffSchema,
});

export const packSchema = z.object({
  pack_id: z.string(),
  name: z.string(),
  items: z.array(packItemSchema),
  version: z.number(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
  archived: z.object({ at: z.string(), by: staffSchema }).nullable(),
});
export type DataPack = z.infer<typeof packSchema>;

export const packShareSchema = z.object({
  share_id: z.string(),
  pack_id: z.string(),
  version: z.number(),
  investor_id: z.string().nullable(),
  firm: z.string(),
  how: packShareHowSchema,
  to: z.array(z.string()),
  shared_on: z.string(),
  note: z.string(),
  files: z.array(
    z.object({
      n: z.number(),
      title: z.string(),
      file_id: z.string(),
      version_n: z.number(),
      sha256: z.string(),
      bytes: z.number(),
    }),
  ),
  at: z.string(),
  by: staffSchema,
});
export type DataPackShare = z.infer<typeof packShareSchema>;

export const packsListSchema = ok.extend({
  packs: z.array(
    packSchema.extend({
      files: z.number(),
      missing: z.array(z.string()),
      last_shared_on: z.string().nullable(),
    }),
  ),
  archived_count: z.number(),
});
export type DataPacksList = z.infer<typeof packsListSchema>;

export const packPageSchema = ok.extend({
  pack: packSchema,
  items: z.array(
    packItemSchema.extend({
      n: z.number(),
      file: fileRowSchema.nullable(),
      warning: z.string(),
    }),
  ),
  checklist: z.array(
    z.object({
      key: z.string(),
      label: z.string(),
      need: z.enum(["required", "expected", "if_any"]),
      why: z.string(),
      covered_by: z.array(z.number()),
    }),
  ),
  missing: z.array(z.string()),
  index_text: z.string(),
  shares: z.array(packShareSchema),
  firms: z
    .array(z.object({ investor_id: z.string(), firm: z.string(), stage: z.string() }))
    .nullable(),
  today: z.string(),
});
export type DataPackPage = z.infer<typeof packPageSchema>;

export const packCandidatesSchema = ok.extend({
  fundraising: z.array(fileRowSchema),
  other: z.array(fileRowSchema),
  total: z.number(),
});
export type DataPackCandidates = z.infer<typeof packCandidatesSchema>;

const packAnswer = ok.extend({ pack: packSchema });

export const readPacks = (archived = false) =>
  dataAsk(packsListSchema, "GET", archived ? "/data/packs?archived=1" : "/data/packs");

export const makePack = (name: string, by: Staff, attempt: string) =>
  dataAsk(packAnswer, "POST", "/data/packs", { name, by, attempt });

export const readPack = (packId: string) =>
  dataAsk(packPageSchema, "GET", `/data/packs/${id(packId)}`);

export const readPackCandidates = (packId: string, q = "") =>
  dataAsk(
    packCandidatesSchema,
    "GET",
    `/data/packs/${id(packId)}/candidates${q ? `?q=${encodeURIComponent(q)}` : ""}`,
  );

export const addPackItems = (
  packId: string,
  input: { file_ids: string[]; covers?: PackCoverValue | PackCoverValue[] },
  by: Staff,
) =>
  dataAsk(
    packAnswer.extend({ added: z.number(), skipped: z.number() }),
    "POST",
    `/data/packs/${id(packId)}/items`,
    { ...input, by },
  );

export const movePackItem = (packId: string, itemId: string, to: number, by: Staff) =>
  dataAsk(packAnswer, "POST", `/data/packs/${id(packId)}/items/${id(itemId)}/move`, { to, by });

export const coverPackItem = (packId: string, itemId: string, covers: PackCoverValue, by: Staff) =>
  dataAsk(packAnswer, "POST", `/data/packs/${id(packId)}/items/${id(itemId)}/covers`, {
    covers,
    by,
  });

export const removePackItem = (packId: string, itemId: string, by: Staff) =>
  dataAsk(packAnswer, "POST", `/data/packs/${id(packId)}/items/${id(itemId)}/remove`, { by });

export const renamePack = (packId: string, name: string, by: Staff) =>
  dataAsk(packAnswer, "POST", `/data/packs/${id(packId)}/rename`, { name, by });

export const archivePack = (packId: string, by: Staff) =>
  dataAsk(packAnswer, "POST", `/data/packs/${id(packId)}/archive`, { by });

export const restorePack = (packId: string, by: Staff) =>
  dataAsk(packAnswer, "POST", `/data/packs/${id(packId)}/restore`, { by });

export const recordPackShare = (
  packId: string,
  input: {
    investor_id?: string;
    firm?: string;
    how: string;
    to: string;
    shared_on: string;
    note: string;
  },
  by: Staff,
  attempt: string,
) =>
  dataAsk(ok.extend({ share: packShareSchema }), "POST", `/data/packs/${id(packId)}/shares`, {
    ...input,
    by,
    attempt,
  });

export const savePackIndex = (packId: string, by: Staff) =>
  dataAsk(ok.extend({ file: fileRowSchema }), "POST", `/data/packs/${id(packId)}/save-index`, {
    by,
  });
