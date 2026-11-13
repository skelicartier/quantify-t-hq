"use server";

import { redirect } from "next/navigation";

import * as files from "@/lib/data/api/files";
import { gate, refreshData, refusal, refused, sent, staffOf } from "@/lib/data/gate";
import { DataRequestError } from "@/lib/data/socket";
import { PART_BYTES } from "@/lib/data/upload";
import { fieldValue } from "@/lib/auth/forms";
import type { ActionState } from "@/lib/forms/action-state";

/**
 * Files' writes. Each one checks for itself (same origin, the service set up, signed in,
 * may send mail), asks the service, refreshes what shows the change and says what happened
 * in one sentence. The upload actions are called by the tray with a `FormData` it builds,
 * and hand the service's answer back in `detail` as JSON.
 */

const ID = /^[A-Za-z0-9-]{1,64}$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;

function fileId(formData: FormData): string {
  const value = fieldValue(formData, "file_id", 64);
  return ID.test(value) ? value : "";
}

function attemptOf(formData: FormData): string | undefined {
  const value = fieldValue(formData, "attempt", 64);
  return /^[0-9a-f-]{36}$/i.test(value) ? value : undefined;
}

/** A refusal with the service's code beside the sentence, for the tray to tell outcomes apart. */
function uploadRefusal(error: unknown): ActionState {
  const state = refusal(error);
  return {
    ...state,
    detail: JSON.stringify({
      code: error instanceof DataRequestError ? error.code : "unavailable",
    }),
  };
}

const answered = (value: unknown): ActionState => ({
  status: "sent",
  message: null,
  sentAt: Date.now(),
  detail: JSON.stringify(value),
});

// ------------------------------------------------------------------ uploads

export async function beginUploadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files");
  if (refused(context)) return context;
  const size = Number(fieldValue(formData, "size", 20));
  const file = fileId(formData);
  const note = fieldValue(formData, "note", 200);
  const attempt = attemptOf(formData);
  try {
    const answer = await files.beginUpload({
      name: fieldValue(formData, "name", 255),
      size: Number.isSafeInteger(size) ? size : -1,
      folder_id: fieldValue(formData, "folder_id", 64),
      relative_path: fieldValue(formData, "relative_path", 1_000),
      ...(file ? { file_id: file } : {}),
      ...(note ? { note } : {}),
      ...(attempt ? { attempt } : {}),
      by: staffOf(context),
    });
    return answered(answer);
  } catch (error) {
    return uploadRefusal(error);
  }
}

export async function uploadPartAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files");
  if (refused(context)) return context;
  const uploadId = fieldValue(formData, "upload_id", 64);
  const index = Number(fieldValue(formData, "index", 4));
  const part = formData.get("part");
  if (!ID.test(uploadId) || !Number.isInteger(index) || index < 0 || index > 83)
    return {
      status: "error",
      message: "That part could not be read.",
      detail: '{"code":"part_refused"}',
    };
  if (!(part instanceof Blob) || part.size === 0 || part.size > PART_BYTES)
    return {
      status: "error",
      message: "That part could not be read.",
      detail: '{"code":"part_refused"}',
    };
  try {
    // A part is written as it comes; nothing on the page changes until the file is finished.
    const answer = await files.sendUploadPart(
      uploadId,
      index,
      new Uint8Array(await part.arrayBuffer()),
    );
    return answered(answer);
  } catch (error) {
    return uploadRefusal(error);
  }
}

export async function finishUploadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files");
  if (refused(context)) return context;
  const uploadId = fieldValue(formData, "upload_id", 64);
  if (!ID.test(uploadId)) return { status: "error", message: "That upload is no longer here." };
  try {
    // The upload's own id is the attempt: finishing twice gives the first answer again.
    const answer = await files.finishUpload(uploadId, staffOf(context), uploadId);
    refreshData("/data/files");
    return answered(answer);
  } catch (error) {
    return uploadRefusal(error);
  }
}

export async function resolveUploadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files");
  if (refused(context)) return context;
  const uploadId = fieldValue(formData, "upload_id", 64);
  const choice = fieldValue(formData, "choice", 20);
  if (!ID.test(uploadId)) return { status: "error", message: "That upload is no longer here." };
  try {
    const answer = await files.resolveUpload(
      uploadId,
      choice,
      staffOf(context),
      attemptOf(formData),
    );
    refreshData("/data/files");
    return answered(answer);
  } catch (error) {
    return uploadRefusal(error);
  }
}

export async function cancelUploadAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files");
  if (refused(context)) return context;
  const uploadId = fieldValue(formData, "upload_id", 64);
  if (!ID.test(uploadId)) return sent(null);
  try {
    await files.cancelUpload(uploadId, staffOf(context));
  } catch (error) {
    return uploadRefusal(error);
  }
  return sent(null);
}

// ------------------------------------------------------------------ folders

export async function newFolderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files");
  if (refused(context)) return context;
  const parent = fieldValue(formData, "parent_id", 64);
  let made = "";
  try {
    const attempt = attemptOf(formData);
    const answer = await files.createFolder({
      name: fieldValue(formData, "name", 80),
      parent_id: ID.test(parent) ? parent : null,
      by: staffOf(context),
      ...(attempt ? { attempt } : {}),
    });
    made = answer.folder.folder_id;
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files");
  redirect(`/data/files?folder=${made}`);
}

export async function renameFolderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files");
  if (refused(context)) return context;
  const folder = fieldValue(formData, "folder_id", 64);
  try {
    await files.renameFolder(folder, fieldValue(formData, "name", 80), staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files");
  return sent("Renamed.");
}

export async function moveFolderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files");
  if (refused(context)) return context;
  const folder = fieldValue(formData, "folder_id", 64);
  const parent = fieldValue(formData, "parent_id", 64);
  try {
    await files.moveFolder(folder, ID.test(parent) ? parent : null, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files");
  return sent("Moved.");
}

export async function deleteFolderAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files");
  if (refused(context)) return context;
  const folder = fieldValue(formData, "folder_id", 64);
  try {
    await files.deleteFolder(folder, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files");
  redirect("/data/files");
}

// ------------------------------------------------------------------ one file

/** One field at a time, as every `InlineField` sends it; fields not sent are left alone. */
export async function updateFileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = fileId(formData);
  const context = await gate(formData, `/data/files/${id}`);
  if (refused(context)) return context;
  const change: files.FileChange = {};
  if (formData.has("title")) change.title = fieldValue(formData, "title", 200);
  if (formData.has("folder_id")) change.folder_id = fieldValue(formData, "folder_id", 64);
  if (formData.has("tags")) change.tags = fieldValue(formData, "tags", 1_000);
  if (formData.has("notes")) change.notes = fieldValue(formData, "notes", 4_000);
  if (formData.has("review_by")) {
    const day = fieldValue(formData, "review_by", 10);
    if (day && !DAY.test(day)) return { status: "error", message: "That date is not a date." };
    change.review_by = day;
  }
  try {
    await files.updateFile(id, change, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files", `/data/files/${id}`);
  return sent("Saved.");
}

export async function starFileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = fileId(formData);
  const context = await gate(formData, `/data/files/${id}`);
  if (refused(context)) return context;
  const starred = fieldValue(formData, "starred", 5) === "true";
  try {
    await files.updateFile(id, { starred }, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files", `/data/files/${id}`);
  return sent(starred ? "Starred." : "Unstarred.");
}

export async function makeCurrentAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = fileId(formData);
  const context = await gate(formData, `/data/files/${id}`);
  if (refused(context)) return context;
  const version = fieldValue(formData, "version_id", 64);
  try {
    await files.makeCurrent(id, version, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files", `/data/files/${id}`);
  return sent("Made current.");
}

export async function trashFileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = fileId(formData);
  const context = await gate(formData, `/data/files/${id}`);
  if (refused(context)) return context;
  try {
    await files.trashFile(id, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files", `/data/files/${id}`);
  return sent("Moved to the trash.");
}

export async function restoreFileAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = fileId(formData);
  const context = await gate(formData, `/data/files/${id}`);
  if (refused(context)) return context;
  try {
    await files.restoreFile(id, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files", `/data/files/${id}`);
  return sent("Restored.");
}

export async function deleteForeverAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = fileId(formData);
  const context = await gate(formData, "/data/files?view=trash");
  if (refused(context)) return context;
  try {
    await files.deleteForever(id, staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files", `/data/files/${id}`);
  redirect("/data/files?view=trash");
}

export async function emptyTrashAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files?view=trash");
  if (refused(context)) return context;
  let deleted = 0;
  try {
    deleted = (await files.emptyTrash(fieldValue(formData, "confirm", 12), staffOf(context)))
      .deleted;
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files");
  return sent(
    `${deleted.toLocaleString("en-GB")} ${deleted === 1 ? "file" : "files"} deleted forever.`,
  );
}

/** The selection bar's one change for many files. */
export async function bulkFilesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files");
  if (refused(context)) return context;
  const field = fieldValue(formData, "field", 20);
  const value = fieldValue(formData, "value", 64);
  const ids = fieldValue(formData, "ids", 40_000)
    .split(",")
    .filter((item) => ID.test(item));
  const change = field === "change" ? value : field;
  let answer: { changed: number; skipped: number };
  try {
    answer = await files.bulkFiles({
      ids,
      change,
      value: field === "change" ? "" : value,
      by: staffOf(context),
    });
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files");
  const skipped =
    answer.skipped > 0 ? `; ${answer.skipped.toLocaleString("en-GB")} left as they were` : "";
  return sent(`${answer.changed.toLocaleString("en-GB")} changed${skipped}.`);
}

export async function checkFilesAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const context = await gate(formData, "/data/files");
  if (refused(context)) return context;
  try {
    await files.checkFiles(staffOf(context));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files");
  return sent("Checking every file. The result shows here when it is done.");
}

// ------------------------------------------------------------------ sharing

export async function shareEmailAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = fileId(formData);
  const context = await gate(formData, `/data/files/${id}`);
  if (refused(context)) return context;
  const attempt = attemptOf(formData);
  let answer: files.DataShareAnswer;
  try {
    answer = await files.shareByEmail(id, {
      to: fieldValue(formData, "to", 2_000),
      subject: fieldValue(formData, "subject", 200),
      message: fieldValue(formData, "message", 2_000),
      by: staffOf(context),
      ...(attempt ? { attempt } : {}),
    });
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files", `/data/files/${id}`);
  const share = answer.share;
  if (share.result === "failed")
    return { status: "error", message: answer.message ?? "Nothing was sent." };
  return {
    status: "sent",
    message: answer.message ?? null,
    sentAt: Date.now(),
    detail: JSON.stringify({ at: share.at, result: share.result, to: share.to }),
  };
}

export async function logShareAction(
  _previous: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const id = fileId(formData);
  const context = await gate(formData, `/data/files/${id}`);
  if (refused(context)) return context;
  try {
    await files.logShareSheet(id, staffOf(context), attemptOf(formData));
  } catch (error) {
    return refusal(error);
  }
  refreshData("/data/files", `/data/files/${id}`);
  return sent("Shared.");
}
