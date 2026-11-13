"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState, type DragEvent, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { INITIAL_ACTION_STATE, type ActionState } from "@/lib/forms/action-state";
import { formatBytes } from "@/lib/format";
import {
  MAX_FILE_BYTES,
  PART_BYTES,
  SENTENCES,
  dropRefusal,
  isSystemFile,
  partRanges,
  summaryLine,
  type TrayOutcome,
} from "@/lib/data/upload";

export type Action = (previous: ActionState, formData: FormData) => Promise<ActionState>;

export type UploadActions = {
  begin: Action;
  part: Action;
  finish: Action;
  resolve: Action;
  cancel: Action;
};

type Choice = "version" | "both" | "skip" | "anyway";

export type TrayRow = {
  key: string;
  name: string;
  path: string;
  size: number;
  percent: number;
  outcome: TrayOutcome;
  sentence: string;
  uploadId: string;
  choices: Choice[];
};

const CHOICE_LABELS: Record<Choice, string> = {
  anyway: "Add it anyway",
  version: "Add as a new version",
  both: "Keep both",
  skip: "Skip",
};

function formOf(values: Record<string, string>): FormData {
  const form = new FormData();
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  return form;
}

function detailOf(state: ActionState | null): Record<string, unknown> {
  if (!state?.detail) return {};
  try {
    const parsed: unknown = JSON.parse(state.detail);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

async function call(action: Action, form: FormData): Promise<ActionState | null> {
  try {
    return await action(INITIAL_ACTION_STATE, form);
  } catch {
    return null;
  }
}

/** What a finished or resolved upload said, as the row shows it. */
function outcomeOf(state: ActionState | null): Pick<TrayRow, "outcome" | "sentence" | "choices"> {
  if (!state || state.status !== "sent") {
    const code = String(detailOf(state).code ?? "");
    if (code === "empty") return { outcome: "empty", sentence: SENTENCES.empty, choices: [] };
    if (code === "too_large")
      return { outcome: "too_large", sentence: SENTENCES.tooLarge, choices: [] };
    return {
      outcome: "refused",
      sentence: SENTENCES.refused(state?.message ?? "the service did not answer."),
      choices: [],
    };
  }
  const answer = detailOf(state);
  const message = String(answer.message ?? "");
  switch (answer.outcome) {
    case "added":
      return { outcome: "added", sentence: message || SENTENCES.added, choices: [] };
    case "version_added":
      return { outcome: "version_added", sentence: message, choices: [] };
    case "duplicate":
      return { outcome: "duplicate", sentence: message, choices: ["anyway"] };
    case "name_taken":
      return { outcome: "name_taken", sentence: message, choices: ["version", "both", "skip"] };
    case "skipped":
      return { outcome: "skipped", sentence: SENTENCES.skipped, choices: [] };
    default:
      return {
        outcome: "refused",
        sentence: SENTENCES.refused("the answer could not be read."),
        choices: [],
      };
  }
}

/**
 * One file through begin, its parts (each sent once more if it fails) and finish. The
 * row is told how far it has got and, at the end, what happened.
 */
export async function sendFile(
  actions: UploadActions,
  file: File,
  target: { folderId: string; relativePath: string; fileId?: string; note?: string },
  update: (change: Partial<TrayRow>) => void,
): Promise<Partial<TrayRow>> {
  if (file.size === 0) return { outcome: "empty", sentence: SENTENCES.empty, percent: 0 };
  if (file.size > MAX_FILE_BYTES)
    return { outcome: "too_large", sentence: SENTENCES.tooLarge, percent: 0 };
  update({ outcome: "sending", percent: 0 });
  const begun = await call(
    actions.begin,
    formOf({
      name: file.name,
      size: String(file.size),
      folder_id: target.folderId,
      relative_path: target.relativePath || file.name,
      ...(target.fileId ? { file_id: target.fileId } : {}),
      ...(target.note ? { note: target.note } : {}),
      attempt: crypto.randomUUID(),
    }),
  );
  if (!begun || begun.status !== "sent") return { ...outcomeOf(begun), percent: 0 };
  const uploadId = String(detailOf(begun).upload_id ?? "");
  const ranges = partRanges(file.size);
  for (const range of ranges) {
    const form = formOf({ upload_id: uploadId, index: String(range.index) });
    form.set("part", file.slice(range.start, range.end), "part");
    let state = await call(actions.part, form);
    if (state?.status !== "sent") state = await call(actions.part, form);
    if (state?.status !== "sent") {
      void call(actions.cancel, formOf({ upload_id: uploadId }));
      return {
        outcome: "stopped",
        sentence: SENTENCES.stopped(range.index + 1, ranges.length),
        uploadId: "",
        choices: [],
      };
    }
    update({ percent: Math.round(((range.index + 1) / ranges.length) * 100) });
  }
  const finished = await call(actions.finish, formOf({ upload_id: uploadId }));
  return { ...outcomeOf(finished), uploadId, percent: 100 };
}

/** The files a drop holds, folders walked, each with its path inside what was dropped. */
async function droppedFiles(
  event: DragEvent<HTMLElement>,
): Promise<{ file: File; path: string }[]> {
  const items = [...event.dataTransfer.items].filter((item) => item.kind === "file");
  const found: { file: File; path: string }[] = [];
  const walk = async (entry: FileSystemEntry): Promise<void> => {
    if (entry.isFile) {
      const file = await new Promise<File>((resolve, reject) =>
        (entry as FileSystemFileEntry).file(resolve, reject),
      );
      found.push({ file, path: entry.fullPath.replace(/^\/+/, "") || file.name });
      return;
    }
    const reader = (entry as FileSystemDirectoryEntry).createReader();
    for (;;) {
      const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
        reader.readEntries(resolve, reject),
      );
      if (batch.length === 0) break;
      for (const child of batch) await walk(child);
    }
  };
  const entries = items.map((item) => ({ item, entry: item.webkitGetAsEntry?.() ?? null }));
  for (const { item, entry } of entries) {
    if (entry) await walk(entry);
    else {
      const file = item.getAsFile();
      if (file) found.push({ file, path: file.name });
    }
  }
  return found;
}

export const PICK_FILES_ID = "hqdata-pick-files";

/** The page bar's "Add files": opens the tray's own picker. */
export function AddFilesButton({ label = "Add files" }: { label?: string }) {
  return (
    <Button
      variant="primary"
      size="small"
      onClick={() => document.getElementById(PICK_FILES_ID)?.click()}
    >
      {label}
    </Button>
  );
}

/**
 * The drop zone and the tray: several files or whole folders in, one at a time and in
 * order, each with its progress and, at the end, its outcome in words. Folders keep their
 * shape below the open folder; system files are skipped and counted.
 */
export function UploadTray({
  actions,
  folderId,
  folderName,
  focus = false,
}: {
  actions: UploadActions;
  folderId: string;
  folderName: string;
  focus?: boolean;
}) {
  const router = useRouter();
  const [rows, setRows] = useState<TrayRow[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [notice, setNotice] = useState("");
  const [running, setRunning] = useState(false);
  const [dragging, setDragging] = useState(false);
  const folderInput = useRef<HTMLInputElement>(null);
  const chooseButton = useRef<HTMLButtonElement>(null);
  const summaryId = useId();

  useEffect(() => {
    folderInput.current?.setAttribute("webkitdirectory", "");
    if (focus) chooseButton.current?.focus();
  }, [focus]);

  const change = (key: string, patch: Partial<TrayRow>) =>
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  async function take(items: { file: File; path: string }[]) {
    if (running || items.length === 0) return;
    const system = items.filter((item) => isSystemFile(item.path)).length;
    const kept = items.filter((item) => !isSystemFile(item.path));
    const refusal = dropRefusal(
      kept.length,
      kept.reduce((sum, item) => sum + item.file.size, 0),
    );
    setSkipped(system);
    if (refusal) {
      setRows([]);
      setNotice(refusal);
      return;
    }
    setNotice("");
    const batch: TrayRow[] = kept.map((item, index) => ({
      key: `${Date.now()}-${index}`,
      name: item.file.name,
      path: item.path,
      size: item.file.size,
      percent: 0,
      outcome: "waiting",
      sentence: "Waiting.",
      uploadId: "",
      choices: [],
    }));
    setRows(batch);
    setRunning(true);
    for (const [index, item] of kept.entries()) {
      const key = batch[index]!.key;
      const done = await sendFile(
        actions,
        item.file,
        { folderId, relativePath: item.path },
        (patch) => change(key, patch),
      );
      change(key, done);
    }
    setRunning(false);
    router.refresh();
  }

  async function choose(row: TrayRow, choice: Choice) {
    change(row.key, { choices: [], sentence: "Working…" });
    const state = await call(
      actions.resolve,
      formOf({ upload_id: row.uploadId, choice, attempt: crypto.randomUUID() }),
    );
    change(row.key, outcomeOf(state));
    router.refresh();
  }

  function picked(list: FileList | null) {
    const items = [...(list ?? [])].map((file) => ({
      file,
      path: file.webkitRelativePath || file.name,
    }));
    void take(items);
  }

  const settled = rows.filter((row) => row.outcome !== "waiting" && row.outcome !== "sending");
  const summary = summaryLine(
    settled.map((row) => row.outcome),
    skipped,
  );

  return (
    <div className="hqdata-tray">
      <div
        className="hqdata-drop"
        data-dragging={dragging ? "true" : undefined}
        onDragOver={(event) => {
          event.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          event.preventDefault();
          setDragging(false);
          void droppedFiles(event).then(take);
        }}
      >
        <p className="hqdata-drop__text">
          <span className="hqdata-drop__desk">Drop files or a folder here</span>
          <span className="hqdata-drop__phone">Choose files to add to {folderName}</span>
        </p>
        <div className="hqdata-drop__buttons">
          <button
            ref={chooseButton}
            type="button"
            className="btn btn--small"
            disabled={running}
            onClick={() => document.getElementById(PICK_FILES_ID)?.click()}
          >
            Choose files
          </button>
          <button
            type="button"
            className="btn btn--small hqdata-drop__folder"
            disabled={running}
            onClick={() => folderInput.current?.click()}
          >
            Choose a folder
          </button>
        </div>
        <input
          id={PICK_FILES_ID}
          className="sr-only"
          type="file"
          multiple
          tabIndex={-1}
          aria-label={`Files to add to ${folderName}`}
          onChange={(event) => {
            picked(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
        <input
          ref={folderInput}
          className="sr-only"
          type="file"
          multiple
          tabIndex={-1}
          aria-label={`A folder to add to ${folderName}`}
          onChange={(event) => {
            picked(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      </div>
      {notice && (
        <p className="hqdata-tray__notice" role="alert">
          {notice}
        </p>
      )}
      {rows.length > 0 && (
        <ul className="hqdata-tray__rows" aria-describedby={summaryId}>
          {rows.map((row) => (
            <li key={row.key} className="hqdata-tray__row" data-outcome={row.outcome}>
              <span className="hqdata-tray__name">
                {row.name}
                {row.path !== row.name && <span className="table-sub">{row.path}</span>}
              </span>
              <span className="hqdata-tray__size">{formatBytes(row.size)}</span>
              <span className="hqdata-tray__bar">
                <progress max={100} value={row.percent} aria-label={`${row.name}: sent so far`} />
                <span>{row.percent}%</span>
              </span>
              <span className="hqdata-tray__outcome">{row.sentence}</span>
              {row.choices.length > 0 && (
                <span className="hqdata-tray__choices">
                  {row.choices.map((choice) => (
                    <button
                      key={choice}
                      type="button"
                      className={`btn btn--small${choice === "skip" ? " btn--ghost" : ""}`}
                      onClick={() => void choose(row, choice)}
                    >
                      {CHOICE_LABELS[choice]}
                    </button>
                  ))}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {(settled.length > 0 || skipped > 0) && (
        <p className="hqdata-tray__summary" role="status" id={summaryId}>
          {running ? `${summary || "Working"}…` : summary}
        </p>
      )}
    </div>
  );
}

/** "Upload a new version" on a file's page: one file, a line on what changed, the same parts. */
export function VersionUpload({
  actions,
  fileId,
  folderId,
}: {
  actions: UploadActions;
  fileId: string;
  folderId: string;
}) {
  const router = useRouter();
  const [row, setRow] = useState<TrayRow | null>(null);
  const [error, setError] = useState("");
  const inputId = useId();
  const noteId = useId();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const file = (form.elements.namedItem("file") as HTMLInputElement | null)?.files?.[0];
    const note = (form.elements.namedItem("note") as HTMLInputElement | null)?.value ?? "";
    if (!file) {
      setError("Choose the file first.");
      return;
    }
    setError("");
    const start: TrayRow = {
      key: "version",
      name: file.name,
      path: file.name,
      size: file.size,
      percent: 0,
      outcome: "sending",
      sentence: "Sending…",
      uploadId: "",
      choices: [],
    };
    setRow(start);
    const done = await sendFile(
      actions,
      file,
      { folderId, relativePath: file.name, fileId, note },
      (patch) => setRow((current) => (current ? { ...current, ...patch } : current)),
    );
    setRow((current) => (current ? { ...current, ...done } : current));
    router.refresh();
  }

  async function anyway() {
    if (!row) return;
    setRow({ ...row, choices: [], sentence: "Working…" });
    const state = await call(
      actions.resolve,
      formOf({ upload_id: row.uploadId, choice: "anyway", attempt: crypto.randomUUID() }),
    );
    setRow((current) => (current ? { ...current, ...outcomeOf(state) } : current));
    router.refresh();
  }

  const busy = row?.outcome === "sending";
  return (
    <form
      className="stack-form stack-form--tight hqdata-tray"
      onSubmit={(event) => void submit(event)}
    >
      <Field id={inputId} label="File">
        <Input id={inputId} name="file" type="file" required disabled={busy} />
      </Field>
      <Field id={noteId} label="What changed" hint="Optional.">
        <Input id={noteId} name="note" maxLength={200} disabled={busy} />
      </Field>
      <div className="form-actions">
        <Button type="submit" size="small" variant="primary" disabled={busy}>
          {busy ? "Sending…" : "Add this version"}
        </Button>
      </div>
      {error && (
        <p className="field__error" role="alert">
          {error}
        </p>
      )}
      {row && (
        <div className="hqdata-tray__row" role="status">
          <span className="hqdata-tray__bar">
            <progress max={100} value={row.percent} aria-label={`${row.name}: sent so far`} />
            <span>{row.percent}%</span>
          </span>
          <span className="hqdata-tray__outcome">{row.sentence}</span>
          {row.choices.includes("anyway") && (
            <span className="hqdata-tray__choices">
              <button type="button" className="btn btn--small" onClick={() => void anyway()}>
                {CHOICE_LABELS.anyway}
              </button>
            </span>
          )}
        </div>
      )}
    </form>
  );
}

/** Each part is at most this many bytes: the tray and its test agree on it. */
export const TRAY_PART_BYTES = PART_BYTES;
