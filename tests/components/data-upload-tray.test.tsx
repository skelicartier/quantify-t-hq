import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { PICK_FILES_ID, UploadTray, type UploadActions } from "@/components/data/files/upload-tray";
import type { ActionState } from "@/lib/forms/action-state";
import {
  DROP_MAX_FILES,
  PART_BYTES,
  SENTENCES,
  dropRefusal,
  isSystemFile,
  partRanges,
  summaryLine,
} from "@/lib/data/upload";

/**
 * The upload tray: files cut into 3 MiB parts, system files skipped and counted, each
 * part sent once more when it fails, the outcome sentences word for word, and the summary.
 * The server actions are stand-ins that answer as the service does.
 */

const MiB = 1024 * 1024;

describe("the tray's rules", () => {
  it("cuts a file into 3 MiB parts", () => {
    expect(PART_BYTES).toBe(3_145_728);
    expect(partRanges(10 * MiB).map((part) => part.end - part.start)).toEqual([
      PART_BYTES,
      PART_BYTES,
      PART_BYTES,
      10 * MiB - 3 * PART_BYTES,
    ]);
    expect(partRanges(60 * MiB)).toHaveLength(20);
    expect(partRanges(0)).toEqual([]);
  });

  it("knows the files a Mac or Windows leaves behind", () => {
    for (const path of [
      ".DS_Store",
      "Board/.DS_Store",
      "__MACOSX/deck.pdf",
      "a/__MACOSX/b/c.pdf",
      "._deck.pdf",
      "Thumbs.db",
      "x/desktop.ini",
    ])
      expect(isSystemFile(path)).toBe(true);
    for (const path of ["deck.pdf", "Board/minutes.pdf", ".env.example", "MACOSX/deck.pdf"])
      expect(isSystemFile(path)).toBe(false);
  });

  it("refuses a drop over 500 files or 2 GB before anything starts", () => {
    expect(dropRefusal(501, 10)).toBe("That is 501 files; add 500 at most at a time.");
    expect(dropRefusal(DROP_MAX_FILES, 10)).toBeNull();
    expect(dropRefusal(2, 3 * 1024 * MiB)).toBe("That is 3 GB; add 2 GB at most at a time.");
  });

  it("says the summary as the spec writes it", () => {
    const outcomes = [
      ...Array.from({ length: 10 }, () => "added" as const),
      "version_added" as const,
      "duplicate" as const,
      "empty" as const,
    ];
    expect(summaryLine(outcomes, 1)).toBe(
      "10 added · 1 new version · 1 already here · 1 empty, not added · 1 system file skipped",
    );
    expect(summaryLine([...Array.from({ length: 10 }, () => "added" as const), "empty"], 1)).toBe(
      "10 added · 1 empty, not added · 1 system file skipped",
    );
    expect(summaryLine(["version_added", "version_added", "stopped", "refused"], 2)).toBe(
      "2 new versions · 1 stopped · 1 not added · 2 system files skipped",
    );
  });
});

type Sent = { upload: string; index: number; size: number };

function standIns(options: { failParts: Record<string, number> }) {
  const sent: Sent[] = [];
  const cancelled: string[] = [];
  const names = new Map<string, string>();
  const tries = new Map<string, number>();
  const ok = (detail: unknown): ActionState => ({
    status: "sent",
    message: null,
    sentAt: Date.now(),
    detail: JSON.stringify(detail),
  });
  const actions: UploadActions = {
    begin: async (_previous, form) => {
      const name = String(form.get("name"));
      const id = `up-${name}`;
      names.set(id, name);
      return ok({
        upload_id: id,
        part_bytes: PART_BYTES,
        parts: Math.ceil(Number(form.get("size")) / PART_BYTES),
      });
    },
    part: async (_previous, form) => {
      const upload = String(form.get("upload_id"));
      const index = Number(form.get("index"));
      const part = form.get("part") as Blob;
      const key = `${upload}:${index}`;
      const count = (tries.get(key) ?? 0) + 1;
      tries.set(key, count);
      sent.push({ upload, index, size: part.size });
      const failures = options.failParts[names.get(upload) ?? ""] ?? 0;
      if (count <= failures) return { status: "error", message: "The service did not answer." };
      return ok({ received: index });
    },
    finish: async (_previous, form) => {
      const name = names.get(String(form.get("upload_id"))) ?? "";
      if (name.startsWith("dup"))
        return ok({
          outcome: "duplicate",
          upload_id: `up-${name}`,
          message: `Already here as “logo.png” in 00 Inbox. Not added again.`,
        });
      if (name.startsWith("clash"))
        return ok({
          outcome: "name_taken",
          upload_id: `up-${name}`,
          message: `A file named “${name}” is already in this folder.`,
        });
      if (name.startsWith("refused"))
        return {
          status: "error",
          message: "That folder is no longer here.",
          detail: '{"code":"not_found"}',
        };
      return ok({ outcome: "added", message: "Added." });
    },
    resolve: async (_previous, form) => {
      const choice = String(form.get("choice"));
      if (choice === "skip") return ok({ outcome: "skipped", message: "Skipped: not added." });
      if (choice === "version")
        return ok({ outcome: "version_added", message: "Added as version 2 of “clash.pdf”." });
      return ok({ outcome: "added", message: "Added." });
    },
    cancel: async (_previous, form) => {
      cancelled.push(String(form.get("upload_id")));
      return ok({ cancelled: true });
    },
  };
  return { actions, sent, cancelled };
}

function file(name: string, bytes: number): File {
  return new File([new Uint8Array(bytes)], name, { type: "application/octet-stream" });
}

describe("the upload tray", () => {
  it("sends files one at a time in parts, retries a part once, and says each outcome", async () => {
    const { actions, sent, cancelled } = standIns({ failParts: { "b.csv": 1, "c.txt": 2 } });
    render(<UploadTray actions={actions} folderId="inbox" folderName="00 Inbox" />);
    expect(screen.getByText("Drop files or a folder here")).toBeInTheDocument();
    const huge = file("huge.bin", 1);
    Object.defineProperty(huge, "size", { value: 251 * MiB });
    const input = document.getElementById(PICK_FILES_ID) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: {
          files: [
            file("a.pdf", 5 * MiB),
            file(".DS_Store", 6),
            file("empty.txt", 0),
            file("b.csv", 100),
            file("c.txt", 10),
            file("dup.png", 20),
            huge,
            file("refused.pdf", 9),
          ],
        },
      });
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(/system file skipped$/),
    );

    // a.pdf in two parts: 3 MiB, then the rest; the system file never went.
    const a = sent.filter((part) => part.upload === "up-a.pdf");
    expect(a.map((part) => part.size)).toEqual([PART_BYTES, 5 * MiB - PART_BYTES]);
    expect(sent.some((part) => part.upload.includes("DS_Store"))).toBe(false);
    // b.csv failed once and went on the second try; c.txt failed twice and stopped.
    expect(sent.filter((part) => part.upload === "up-b.csv")).toHaveLength(2);
    expect(sent.filter((part) => part.upload === "up-c.txt")).toHaveLength(2);
    expect(cancelled).toEqual(["up-c.txt"]);

    const rows = [...document.querySelectorAll(".hqdata-tray__row")].map(
      (row) => row.textContent ?? "",
    );
    expect(rows).toHaveLength(7);
    expect(rows[0]).toContain("Added.");
    expect(rows[0]).toContain("100%");
    expect(rows[1]).toContain(SENTENCES.empty);
    expect(rows[2]).toContain("Added.");
    expect(rows[3]).toContain("Stopped at part 1 of 1: the service did not answer. Try again.");
    expect(rows[4]).toContain("Already here as “logo.png” in 00 Inbox. Not added again.");
    expect(rows[5]).toContain("Over 250 MB: not added.");
    expect(rows[6]).toContain("Not added: That folder is no longer here.");
    expect(screen.getByRole("status")).toHaveTextContent(
      "2 added · 1 already here · 1 empty, not added · 1 over 250 MB, not added · 1 stopped · 1 not added · 1 system file skipped",
    );

    // "Add it anyway" keeps both.
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add it anyway" }));
    });
    await waitFor(() =>
      expect(screen.getByRole("status")).toHaveTextContent(
        "3 added · 1 empty, not added · 1 over 250 MB, not added · 1 stopped · 1 not added · 1 system file skipped",
      ),
    );
  });

  it("asks the three choices when a name is taken", async () => {
    const { actions } = standIns({ failParts: {} });
    render(<UploadTray actions={actions} folderId="inbox" folderName="00 Inbox" />);
    const input = document.getElementById(PICK_FILES_ID) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, { target: { files: [file("clash.pdf", 30)] } });
    });
    await waitFor(() =>
      expect(
        screen.getByText("A file named “clash.pdf” is already in this folder."),
      ).toBeInTheDocument(),
    );
    for (const label of ["Add as a new version", "Keep both", "Skip"])
      expect(screen.getByRole("button", { name: label })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("1 waiting for a choice");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Add as a new version" }));
    });
    await waitFor(() =>
      expect(screen.getByText("Added as version 2 of “clash.pdf”.")).toBeInTheDocument(),
    );
    expect(screen.getByRole("status")).toHaveTextContent("1 new version");
  });

  it("starts nothing for a drop of more than 500 files", async () => {
    const { actions, sent } = standIns({ failParts: {} });
    render(<UploadTray actions={actions} folderId="inbox" folderName="00 Inbox" />);
    const input = document.getElementById(PICK_FILES_ID) as HTMLInputElement;
    await act(async () => {
      fireEvent.change(input, {
        target: { files: Array.from({ length: 501 }, (_, index) => file(`f${index}.txt`, 1)) },
      });
    });
    expect(screen.getByRole("alert")).toHaveTextContent(
      "That is 501 files; add 500 at most at a time.",
    );
    expect(sent).toHaveLength(0);
  });
});
