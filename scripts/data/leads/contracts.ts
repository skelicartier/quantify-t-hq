/**
 * The services Data's modules offer one another (addendum2), as Unit 3 uses and provides
 * them. Only `provide`/`need` joins the modules, so these are structural: Unit 2's files
 * service and Unit 4's waitlist service fit them without importing this file.
 */

import type { Staff } from "../protocol";
import type { SentMail } from "../sender-files";
import type {
  FileKind,
  FollowUpKind,
  LeadField,
  Outcome,
  WaitlistStage,
} from "../../../src/lib/data/labels";
import type { LeadRow, ReplyMark, Standing } from "./types";

// ------------------------------------------------------------------ files (Unit 2)

export type FileRow = {
  file_id: string;
  title: string;
  original_name: string;
  folder_id: string;
  folder_path: string;
  kind: FileKind;
  bytes: number;
  tags: string[];
  starred: boolean;
  review_by: string | null;
  versions: number;
  updated_at: string;
  updated_by_name: string;
  trashed_at: string | null;
};

export type FileVersion = {
  version_id: string;
  n: number;
  sha256: string;
  bytes: number;
  kind: FileKind;
  original_name: string;
  added_at: string;
};

export type VersionPath = {
  path: string;
  sha256: string;
  n: number;
  bytes: number;
  original_name: string;
  kind: FileKind;
};

export type FilesEvent = {
  kind: "added" | "version_added" | "current_changed" | "trashed" | "restored" | "deleted";
  file_id: string;
};

export type FilesService = {
  csvFiles(): FileRow[];
  fileRow(fileId: string): FileRow | null;
  versions(fileId: string): FileVersion[];
  versionPath(fileId: string, n?: number): VersionPath | null;
  putFile(input: {
    folderPath: string[];
    title: string;
    originalName: string;
    bytes: Uint8Array;
    by: Staff;
    note?: string;
  }): Promise<FileRow>;
  onChange(listener: (event: FilesEvent) => void): () => void;
};

// ------------------------------------------------------------------ waitlist (Unit 4)

export type WaitlistLink = { entry_id: string; firm: string; stage: WaitlistStage };

export type WaitlistService = {
  joinFromReply(input: { reply: Reply; lead: LeadRow; firmKey: string; by: Staff }): {
    entry_id: string;
    created: boolean;
    firm: string;
    unsent: number;
    href: string;
  };
  forEmail(email: string): WaitlistLink | null;
  forFirm(firmKey: string): WaitlistLink | null;
  stageCounts(): Record<WaitlistStage, number>;
  usedFor(fileId: string): { label: string; href: string }[];
};

/** Unit 5's investors, as far as a lead's page links to them (optional, read defensively). */
export type InvestorsLookup = {
  forEmail?(email: string): { investor_id: string; firm: string; stage: string } | null;
};

// ------------------------------------------------------------------ replies (Unit 3)

export type Effect =
  | { kind: "waitlist_joined"; entry_id: string; created: boolean }
  /** `at`: the stop list entry's own stamp, so a take-back removes that entry and no later one. */
  | { kind: "stop_added"; email: string; at?: string }
  | { kind: "stop_already"; email: string }
  | { kind: "stop_failed"; email: string }
  | { kind: "follow_up"; follow_up_id: string }
  | { kind: "lead_added"; lead_id: string; email: string }
  | { kind: "investor_stage"; investor_id: string; from: string; to: string };

export type Reply = {
  kind: "reply";
  reply_id: string;
  email: string;
  lead_id: string;
  outcome: Outcome;
  received_at: string;
  subject: string;
  words: string;
  later_until: string | null;
  referral: { name: string; email: string; title: string } | null;
  mailing_id: string | null;
  mailing: string;
  recorded_at: string;
  recorded_by: Staff;
  effects: Effect[];
  attempt: string;
};

export type TakeBack = {
  kind: "take_back";
  reply_id: string;
  at: string;
  by: Staff;
  undone: Effect[];
  kept: { effect: Effect; why: string }[];
};

export type ReplyRow = Reply & {
  name: string;
  firm: string;
  /** When it was taken back: what that undid, and what stayed and why. */
  taken_back: {
    at: string;
    by: Staff;
    undone: Effect[];
    kept: { effect: Effect; why: string }[];
  } | null;
};

export type FollowUp = {
  follow_up_id: string;
  lead_id: string;
  email: string;
  name: string;
  kind: FollowUpKind;
  title: string;
  due_on: string;
  from_reply_id: string | null;
  state: "open" | "done" | "closed_by_send" | "taken_back";
  created_at: string;
  done_at: string | null;
  done_by: Staff | null;
  note: string;
};

export type Interceptor = {
  name: string;
  owns(email: string): boolean;
  apply(reply: Reply, ctx: { lead: LeadRow; by: Staff }): Promise<Effect[]>;
};

export type RepliesService = {
  forEmail(email: string): ReplyRow[];
  forFirm(firmKey: string): ReplyRow[];
  openFollowUps(): FollowUp[];
  addFollowUp(input: {
    email: string;
    kind: FollowUp["kind"];
    title: string;
    due_on: string;
    from_reply_id: string | null;
    by: Staff;
  }): FollowUp;
  registerInterceptor(interceptor: Interceptor): void;
  /** Beyond addendum2, for the lead's page: every follow-up of one address, newest first. */
  followUpsFor(email: string): FollowUp[];
};

// ------------------------------------------------------------------ leads (Unit 3)

export type LeadsEvent = { kind: "rebuilt" | "lead" | "written" | "stops"; emails?: string[] };

export type LeadsService = {
  byEmail(email: string): LeadRow | null;
  detail(leadId: string): unknown;
  firmKeyOf(email: string, emailKind?: string): string;
  atFirm(firmKey: string): LeadRow[];
  unsentAt(firmKey: string): { email: string; name: string; title: string; lists: string[] }[];
  addManual(input: {
    email: string;
    values: Partial<Record<LeadField, string>>;
    origin: "hand" | "referral" | "reply" | "copied";
    referred_by: string | null;
    by: Staff;
  }): LeadRow;
  tag(leadId: string, add: string[], remove: string[], by: Staff): void;
  sentMail(email: string): SentMail[];
  usedFor(fileId: string): { label: string; href: string }[];
  onChange(listener: (event: LeadsEvent) => void): () => void;
  // Beyond addendum2 (additive): what the replies module and Units 4–5 tell the index.
  /** The newest reply not taken back, per address (null: none); the status follows at once. */
  noteReply(email: string, mark: ReplyMark | null): void;
  /** A firm hold (Unit 4) or badges (Unit 5) a lead's status and row should show. */
  registerStanding(standing: Standing): void;
};
