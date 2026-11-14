import "server-only";

import { z } from "zod";

import { fileChoiceSchema, type CopyInput } from "@/lib/data/api/meetings";
import { staffSchema } from "@/lib/data/api/replies";
import type { Staff } from "@/lib/data/gate";
import { dataAsk, id, ok } from "@/lib/data/socket";

/**
 * The register of members (MGT-1; ws-notes/company/spec.md §7.8), kept on this computer by
 * the local service: classes of shares, members and folios, entries (reversed, never
 * deleted), share certificates (cancelled, never deleted) and the holdings it adds up.
 */

const rangeSchema = z.object({ from: z.number(), to: z.number() }).nullable();
const stampedSchema = z.object({
  on: z.string(),
  why: z.string(),
  at: z.string(),
  by: staffSchema,
});

export const holderKindSchema = z.enum(["person", "company", "llp", "trust", "fund", "other"]);
export const residencySchema = z.enum(["resident", "non_resident", ""]);
export const entryKindSchema = z.enum([
  "subscription",
  "allotment",
  "transfer_in",
  "transfer_out",
  "conversion_in",
  "conversion_out",
]);
export type EntryKind = z.infer<typeof entryKindSchema>;

export const shareClassSchema = z.object({
  class_id: z.string(),
  name: z.string(),
  kind: z.enum(["equity", "preference"]),
  nominal: z.number(),
  created_at: z.string(),
  created_by: staffSchema,
});
export type ShareClass = z.infer<typeof shareClassSchema>;

export const memberSchema = z.object({
  member_id: z.string(),
  folio: z.string(),
  name: z.string(),
  kind: holderKindSchema,
  email: z.string(),
  address: z.string(),
  id_number: z.string(),
  residency: residencySchema,
  nationality: z.string(),
  investor_id: z.string().nullable(),
  backers_note: z.string(),
  became_member_on: z.string(),
  ceased_on: z.string().nullable(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
});
export type Member = z.infer<typeof memberSchema>;

export const entrySchema = z.object({
  entry_id: z.string(),
  member_id: z.string(),
  class_id: z.string(),
  kind: entryKindSchema,
  shares: z.number(),
  distinctive: rangeSchema,
  price_per_share: z.number().nullable(),
  paid_up_per_share: z.number().nullable(),
  on: z.string(),
  entered_on: z.string(),
  resolution: z.object({ resolution_id: z.string().nullable(), words: z.string() }),
  closing_key: z.string().nullable(),
  counterpart_member_id: z.string().nullable(),
  note: z.string(),
  reversed: stampedSchema.nullable(),
  created_at: z.string(),
  created_by: staffSchema,
});
export type RegisterEntry = z.infer<typeof entrySchema>;

export const certificateSchema = z.object({
  certificate_id: z.string(),
  number: z.string(),
  member_id: z.string(),
  class_id: z.string(),
  shares: z.number(),
  distinctive: rangeSchema,
  issued_on: z.string(),
  stamp: z.object({ amount: z.number().nullable(), reference: z.string() }),
  file_id: z.string().nullable(),
  entry_ids: z.array(z.string()),
  cancelled: stampedSchema.nullable(),
  created_at: z.string(),
  created_by: staffSchema,
});
export type Certificate = z.infer<typeof certificateSchema>;

export const memberRowSchema = memberSchema.extend({
  holds: z.array(
    z.object({
      class_id: z.string(),
      class_name: z.string(),
      shares: z.number(),
      of: z.number(),
      words: z.string(),
    }),
  ),
});
export type MemberRow = z.infer<typeof memberRowSchema>;

export const entryRowSchema = entrySchema.extend({
  folio: z.string(),
  member_name: z.string(),
  investor_id: z.string().nullable(),
  class_name: z.string(),
  certificate: z.string().nullable(),
  resolution_title: z.string(),
  resolution_href: z.string().nullable(),
  late_days: z.number(),
});
export type EntryRow = z.infer<typeof entryRowSchema>;

export const certificateRowSchema = certificateSchema.extend({
  folio: z.string(),
  member_name: z.string(),
  class_name: z.string(),
  file: z.object({ file_id: z.string(), title: z.string() }).nullable(),
});
export type CertificateRow = z.infer<typeof certificateRowSchema>;

export const holdingSchema = z.object({
  member_id: z.string(),
  folio: z.string(),
  name: z.string(),
  class_id: z.string(),
  class_name: z.string(),
  class_kind: z.enum(["equity", "preference"]),
  shares: z.number(),
  of: z.number(),
  words: z.string(),
});
export type Holding = z.infer<typeof holdingSchema>;

export const membersPageSchema = ok.extend({
  view: z.enum(["register", "certificates", "holdings"]),
  classes: z.array(shareClassSchema),
  members: z.array(memberRowSchema),
  entries: z.array(entryRowSchema),
  certificates: z.array(certificateRowSchema),
  holdings: z.array(holdingSchema),
  totals: z.array(z.object({ class_id: z.string(), class_name: z.string(), issued: z.number() })),
  resolutions: z
    .array(z.object({ resolution_id: z.string(), title: z.string(), meeting_title: z.string() }))
    .nullable(),
  files: z.array(fileChoiceSchema),
  files_here: z.boolean(),
  today: z.string(),
});
export type MembersPage = z.infer<typeof membersPageSchema>;

const warnings = z.array(z.string());

export const readMembers = (view = "register") =>
  dataAsk(membersPageSchema, "GET", `/data/members?view=${encodeURIComponent(view)}`);

export const addClass = (
  input: { name: string; kind: "equity" | "preference"; nominal: number | string },
  by: Staff,
  attempt: string,
) =>
  dataAsk(ok.extend({ class: shareClassSchema }), "POST", "/data/members/classes", {
    ...input,
    by,
    attempt,
  });

export type MemberInput = {
  name: string;
  kind: z.infer<typeof holderKindSchema>;
  email: string;
  address: string;
  id_number: string;
  residency: z.infer<typeof residencySchema>;
  nationality: string;
  backers_note: string;
  became_member_on: string;
};

export const addMember = (input: MemberInput, by: Staff, attempt: string) =>
  dataAsk(ok.extend({ member: memberSchema }), "POST", "/data/members", {
    ...input,
    by,
    attempt,
  });

export const updateMember = (memberId: string, input: Partial<MemberInput>, by: Staff) =>
  dataAsk(ok.extend({ member: memberSchema }), "POST", `/data/members/${id(memberId)}/update`, {
    ...input,
    by,
  });

export type EntryInput = {
  member_id: string;
  class_id: string;
  kind: EntryKind;
  shares: number | string;
  distinctive_from: number | string;
  distinctive_to: number | string;
  price_per_share: number | string;
  paid_up_per_share: number | string;
  on: string;
  entered_on: string;
  resolution_id: string;
  resolution_words: string;
  note: string;
};

export const recordEntry = (input: EntryInput, by: Staff, attempt: string) =>
  dataAsk(ok.extend({ entry: entryRowSchema, warnings }), "POST", "/data/members/entries", {
    ...input,
    by,
    attempt,
  });

export const reverseEntry = (entryId: string, input: { on: string; why: string }, by: Staff) =>
  dataAsk(
    ok.extend({ entry: entryRowSchema, warnings }),
    "POST",
    `/data/members/entries/${id(entryId)}/reverse`,
    { ...input, by },
  );

export type CertificateInput = {
  member_id: string;
  class_id: string;
  shares: number | string;
  distinctive_from: number | string;
  distinctive_to: number | string;
  number: string;
  issued_on: string;
  stamp_amount: number | string;
  stamp_reference: string;
} & CopyInput;

export const issueCertificate = (input: CertificateInput, by: Staff, attempt: string) =>
  dataAsk(
    ok.extend({ certificate: certificateSchema, warnings }),
    "POST",
    "/data/members/certificates",
    { ...input, by, attempt },
  );

export const cancelCertificate = (
  certificateId: string,
  input: { on: string; why: string },
  by: Staff,
) =>
  dataAsk(
    ok.extend({ certificate: certificateSchema, warnings }),
    "POST",
    `/data/members/certificates/${id(certificateId)}/cancel`,
    { ...input, by },
  );
