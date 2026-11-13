import "server-only";

import { z } from "zod";

import type { Staff } from "@/lib/data/gate";
import { dataAsk, dataOpen, dataSendPart, id, ok, type OpenedFile } from "@/lib/data/socket";

/**
 * Files, as the portal reads and writes them: folders, the list in its views, one file
 * with its versions and activity, uploads in parts, and sharing. Every answer is checked
 * against these shapes; the contract test holds them to the real service.
 */

const staffSchema = z.object({ staff_id: z.string(), name: z.string() });

export const fileKindSchema = z.enum([
  "pdf",
  "image",
  "csv",
  "text",
  "word",
  "excel",
  "slides",
  "zip",
  "web",
  "other",
]);
export type FileKindValue = z.infer<typeof fileKindSchema>;

export const textStateSchema = z.enum([
  "pending",
  "reading",
  "read",
  "none",
  "failed",
  "too_large",
  "not_applicable",
]);

export const folderSchema = z.object({
  folder_id: z.string(),
  name: z.string(),
  parent_id: z.string().nullable(),
  default_key: z.string().nullable(),
  created_at: z.string(),
  created_by: staffSchema,
  hint: z.string(),
  depth: z.number(),
  files: z.number(),
  bytes: z.number(),
  path: z.string(),
  children: z.number(),
});
export type DataFolder = z.infer<typeof folderSchema>;

export const versionSchema = z.object({
  version_id: z.string(),
  n: z.number(),
  sha256: z.string(),
  bytes: z.number(),
  kind: fileKindSchema,
  mime: z.string(),
  original_name: z.string(),
  added_at: z.string(),
  added_by: staffSchema,
  note: z.string(),
  text: textStateSchema,
  pages: z.number().nullable(),
  rows: z.number().nullable(),
  columns: z.number().nullable(),
});
export type DataVersion = z.infer<typeof versionSchema>;

export const fileRowSchema = z.object({
  file_id: z.string(),
  title: z.string(),
  original_name: z.string(),
  folder_id: z.string(),
  folder_path: z.string(),
  kind: fileKindSchema,
  bytes: z.number(),
  tags: z.array(z.string()),
  starred: z.boolean(),
  review_by: z.string().nullable(),
  versions: z.number(),
  current_n: z.number(),
  updated_at: z.string(),
  updated_by_name: z.string(),
  trashed_at: z.string().nullable(),
  trashed_by_name: z.string().nullable(),
  was_in: z.string().nullable(),
  match: z
    .object({ where: z.enum(["name", "tags", "notes", "text"]), snippet: z.string() })
    .optional(),
});
export type DataFileRow = z.infer<typeof fileRowSchema>;

export const shareRowSchema = z.object({
  share_id: z.string(),
  file_id: z.string(),
  title: z.string(),
  file_here: z.boolean(),
  version_n: z.number(),
  how: z.enum(["email", "share_sheet"]),
  to: z.array(z.string()),
  subject: z.string(),
  by_name: z.string(),
  at: z.string(),
  result: z.enum(["sent", "unknown", "failed"]),
});
export type DataShareRow = z.infer<typeof shareRowSchema>;

export const fileViewSchema = z.enum(["folder", "starred", "recent", "review", "trash", "shared"]);
export type DataFileView = z.infer<typeof fileViewSchema>;

export const filesListSchema = ok.extend({
  view: fileViewSchema,
  files: z.array(fileRowSchema),
  total: z.number(),
  offset: z.number(),
  limit: z.number(),
  folder: folderSchema.nullable(),
  path: z.array(folderSchema),
  subfolders: z.array(folderSchema),
  counts: z.object({
    starred: z.number(),
    review_due: z.number(),
    trash: z.number(),
    shared: z.number(),
  }),
  totals: z.object({ files: z.number(), bytes: z.number(), trash_bytes: z.number() }),
  jobs: z.object({ reading: z.number(), checking: z.boolean() }),
  today: z.string(),
  tags: z.array(z.string()),
  last_check: z
    .object({
      at: z.string(),
      by_name: z.string(),
      files: z.number(),
      changed: z.number(),
      changed_ids: z.array(z.string()),
    })
    .nullable(),
  shares: z.array(shareRowSchema),
});
export type DataFilesList = z.infer<typeof filesListSchema>;

export const activitySchema = z.object({
  file_id: z.string(),
  verb: z.string(),
  detail: z.string(),
  by: staffSchema,
  at: z.string(),
});

export const previewSchema = z.object({
  kind: z.enum(["pdf", "image", "csv", "text", "none"]),
  text: z.string().optional(),
  table: z.object({ header: z.array(z.string()), rows: z.array(z.array(z.string())) }).optional(),
  text_state: textStateSchema,
});
export type DataPreview = z.infer<typeof previewSchema>;

export const fileDetailSchema = z.object({
  file_id: z.string(),
  title: z.string(),
  folder_id: z.string(),
  tags: z.array(z.string()),
  notes: z.string(),
  starred: z.boolean(),
  review_by: z.string().nullable(),
  current: z.string(),
  versions: z.array(versionSchema),
  came_from: z.string(),
  trashed: z.object({ at: z.string(), by: staffSchema, from_folder_id: z.string() }).nullable(),
  created_at: z.string(),
  created_by: staffSchema,
  updated_at: z.string(),
  updated_by: staffSchema,
  row: fileRowSchema,
  folder_path: z.string(),
  path: z.array(folderSchema),
  folders: z.array(z.object({ folder_id: z.string(), path: z.string(), depth: z.number() })),
  activity: z.array(activitySchema),
  preview: previewSchema,
  used_for: z.array(z.object({ label: z.string(), href: z.string() })),
  sender: z.object({ from_name: z.string(), from_email: z.string() }),
  share_max_bytes: z.number(),
  today: z.string(),
});
export type DataFileDetail = z.infer<typeof fileDetailSchema>;

const fileAnswer = ok.extend({ file: fileDetailSchema });

export const uploadBeginSchema = ok.extend({
  upload_id: z.string(),
  part_bytes: z.number(),
  parts: z.number(),
});
export const uploadPartSchema = ok.extend({ received: z.number() });
export const uploadOutcomeSchema = ok.extend({
  outcome: z.enum(["added", "version_added", "duplicate", "name_taken", "skipped"]),
  upload_id: z.string().optional(),
  file: fileRowSchema.optional(),
  existing: fileRowSchema.optional(),
  message: z.string(),
});
export type DataUploadOutcome = z.infer<typeof uploadOutcomeSchema>;

const jobSchema = z.object({
  job_id: z.string(),
  kind: z.string(),
  detail: z.string(),
  done: z.number(),
  total: z.number(),
  state: z.enum(["running", "done", "failed"]),
});

export const shareAnswerSchema = ok.extend({
  share: shareRowSchema,
  message: z.string().optional(),
});
export type DataShareAnswer = z.infer<typeof shareAnswerSchema>;

// ------------------------------------------------------------------ reads

export type FilesQuery = {
  view?: string;
  folder?: string;
  q?: string;
  in?: string;
  tag?: string;
  kind?: string;
  offset?: number;
};

export function filesQueryString(query: FilesQuery): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query))
    if (value !== undefined && value !== "" && value !== 0) params.set(key, String(value));
  const text = params.toString();
  return text ? `?${text}` : "";
}

export const readFolders = () =>
  dataAsk(ok.extend({ folders: z.array(folderSchema) }), "GET", "/data/folders");

export const readFiles = (query: FilesQuery = {}) =>
  dataAsk(filesListSchema, "GET", `/data/files${filesQueryString(query)}`);

export const readFile = (fileId: string) => dataAsk(fileAnswer, "GET", `/data/files/${id(fileId)}`);

/** The bytes of a version (the current one when `version` is not given), as a stream. */
export function openFileBytes(
  fileId: string,
  options: { version?: number; log?: "open" | "download"; by?: Staff } = {},
  signal?: AbortSignal,
): Promise<OpenedFile> {
  const params = new URLSearchParams();
  if (options.version) params.set("version", String(options.version));
  if (options.log && options.by) {
    params.set("log", options.log);
    params.set("by_id", options.by.staff_id);
    params.set("by_name", options.by.name);
  }
  const query = params.toString();
  return dataOpen(`/data/files/${id(fileId)}/bytes${query ? `?${query}` : ""}`, signal);
}

// ------------------------------------------------------------------ folders

const folderAnswer = ok.extend({ folder: folderSchema });

export const createFolder = (input: {
  name: string;
  parent_id: string | null;
  by: Staff;
  attempt?: string;
}) => dataAsk(folderAnswer, "POST", "/data/folders", input);

export const renameFolder = (folderId: string, name: string, by: Staff) =>
  dataAsk(folderAnswer, "POST", `/data/folders/${id(folderId)}/rename`, { name, by });

export const moveFolder = (folderId: string, parentId: string | null, by: Staff) =>
  dataAsk(folderAnswer, "POST", `/data/folders/${id(folderId)}/move`, { parent_id: parentId, by });

export const deleteFolder = (folderId: string, by: Staff) =>
  dataAsk(ok.extend({ deleted: z.boolean() }), "POST", `/data/folders/${id(folderId)}/delete`, {
    by,
  });

// ------------------------------------------------------------------ one file

export type FileChange = {
  title?: string;
  folder_id?: string;
  tags?: string;
  notes?: string;
  review_by?: string;
  starred?: boolean;
};

export const updateFile = (fileId: string, change: FileChange, by: Staff) =>
  dataAsk(fileAnswer, "POST", `/data/files/${id(fileId)}/update`, { ...change, by });

export const makeCurrent = (fileId: string, versionId: string, by: Staff) =>
  dataAsk(fileAnswer, "POST", `/data/files/${id(fileId)}/versions/${id(versionId)}/current`, {
    by,
  });

export const trashFile = (fileId: string, by: Staff) =>
  dataAsk(fileAnswer, "POST", `/data/files/${id(fileId)}/trash`, { by });

export const restoreFile = (fileId: string, by: Staff) =>
  dataAsk(fileAnswer, "POST", `/data/files/${id(fileId)}/restore`, { by });

export const deleteForever = (fileId: string, by: Staff) =>
  dataAsk(
    ok.extend({ deleted: z.boolean(), bytes_freed: z.number() }),
    "POST",
    `/data/files/${id(fileId)}/delete-forever`,
    { by },
  );

export const emptyTrash = (confirm: string, by: Staff) =>
  dataAsk(
    ok.extend({ deleted: z.number(), bytes_freed: z.number() }),
    "POST",
    "/data/trash/empty",
    {
      confirm,
      by,
    },
  );

export const bulkFiles = (input: { ids: string[]; change: string; value: string; by: Staff }) =>
  dataAsk(
    ok.extend({ changed: z.number(), skipped: z.number() }),
    "POST",
    "/data/files/bulk",
    input,
  );

export const checkFiles = (by: Staff) =>
  dataAsk(ok.extend({ job: jobSchema }), "POST", "/data/files/check", { by });

// ------------------------------------------------------------------ uploads

export const beginUpload = (input: {
  name: string;
  size: number;
  folder_id: string;
  relative_path: string;
  file_id?: string;
  note?: string;
  by: Staff;
  attempt?: string;
}) => dataAsk(uploadBeginSchema, "POST", "/data/uploads", input);

export const sendUploadPart = (uploadId: string, index: number, bytes: Uint8Array) =>
  dataSendPart(uploadPartSchema, `/data/uploads/${id(uploadId)}/parts/${index}`, bytes);

export const finishUpload = (uploadId: string, by: Staff, attempt?: string) =>
  dataAsk(uploadOutcomeSchema, "POST", `/data/uploads/${id(uploadId)}/finish`, {
    by,
    ...(attempt ? { attempt } : {}),
  });

export const resolveUpload = (uploadId: string, choice: string, by: Staff, attempt?: string) =>
  dataAsk(uploadOutcomeSchema, "POST", `/data/uploads/${id(uploadId)}/resolve`, {
    choice,
    by,
    ...(attempt ? { attempt } : {}),
  });

export const cancelUpload = (uploadId: string, by: Staff) =>
  dataAsk(ok.extend({ cancelled: z.boolean() }), "POST", `/data/uploads/${id(uploadId)}/cancel`, {
    by,
  });

// ------------------------------------------------------------------ sharing

export const shareByEmail = (
  fileId: string,
  input: { to: string; subject: string; message: string; by: Staff; attempt?: string },
) => dataAsk(shareAnswerSchema, "POST", `/data/files/${id(fileId)}/share/email`, input);

export const logShareSheet = (fileId: string, by: Staff, attempt?: string) =>
  dataAsk(shareAnswerSchema, "POST", `/data/files/${id(fileId)}/share/sheet`, {
    by,
    ...(attempt ? { attempt } : {}),
  });
