import { formatBytes, formatNumber } from "@/lib/format";

/**
 * The upload tray's rules, apart from the component so they can be tested on their own:
 * how a file is cut into parts, which files a drop skips, how big a drop may be, and the
 * sentence each outcome is told in, word for word (spec §2.3.3). No `server-only`: the
 * tray runs in the browser.
 */

/** 3 MiB: under the 4 MB a server action takes, with its framing. */
export const PART_BYTES = 3_145_728;
export const MAX_FILE_BYTES = 262_144_000;
export const DROP_MAX_FILES = 500;
export const DROP_MAX_BYTES = 2 * 1024 * 1024 * 1024;

export type TrayOutcome =
  | "waiting"
  | "sending"
  | "added"
  | "version_added"
  | "duplicate"
  | "name_taken"
  | "skipped"
  | "empty"
  | "too_large"
  | "stopped"
  | "refused";

/** Files a Mac or Windows leaves in a folder that nobody meant to keep. */
export function isSystemFile(path: string): boolean {
  const parts = path.split("/").filter(Boolean);
  const name = parts.at(-1) ?? "";
  if (parts.slice(0, -1).some((part) => part === "__MACOSX")) return true;
  if (name.startsWith("._")) return true;
  return [".DS_Store", "Thumbs.db", "desktop.ini"].includes(name);
}

export function partsOf(size: number): number {
  return size <= 0 ? 0 : Math.ceil(size / PART_BYTES);
}

/** Where each part starts and ends in the file. */
export function partRanges(size: number): { index: number; start: number; end: number }[] {
  return Array.from({ length: partsOf(size) }, (_, index) => ({
    index,
    start: index * PART_BYTES,
    end: Math.min(size, (index + 1) * PART_BYTES),
  }));
}

/** Nothing starts when a drop is too big; this is what it says instead. */
export function dropRefusal(files: number, bytes: number): string | null {
  if (files > DROP_MAX_FILES)
    return `That is ${formatNumber(files)} files; add ${formatNumber(DROP_MAX_FILES)} at most at a time.`;
  if (bytes > DROP_MAX_BYTES) return `That is ${formatBytes(bytes)}; add 2 GB at most at a time.`;
  return null;
}

export const SENTENCES = {
  added: "Added.",
  versionAdded: (n: number, title: string) => `Added as version ${n} of “${title}”.`,
  duplicate: (title: string, folder: string) =>
    `Already here as “${title}” in ${folder}. Not added again.`,
  nameTaken: (name: string) => `A file named “${name}” is already in this folder.`,
  empty:
    "Empty: not added. If it is in iCloud Drive, open it in Finder so it downloads, then add it again.",
  tooLarge: "Over 250 MB: not added.",
  stopped: (part: number, parts: number) =>
    `Stopped at part ${part} of ${parts}: the service did not answer. Try again.`,
  refused: (sentence: string) => `Not added: ${sentence}`,
  skipped: "Skipped: not added.",
} as const;

const plural = (count: number, one: string, many: string) =>
  `${formatNumber(count)} ${count === 1 ? one : many}`;

/** "10 added · 1 new version · 1 already here · 1 empty, not added · 1 system file skipped" */
export function summaryLine(outcomes: readonly TrayOutcome[], systemSkipped: number): string {
  const count = (outcome: TrayOutcome) => outcomes.filter((item) => item === outcome).length;
  const parts: string[] = [];
  const add = (value: number, text: string) => {
    if (value > 0) parts.push(text);
  };
  add(count("added"), `${formatNumber(count("added"))} added`);
  add(count("version_added"), plural(count("version_added"), "new version", "new versions"));
  add(count("duplicate"), `${formatNumber(count("duplicate"))} already here`);
  add(count("name_taken"), `${formatNumber(count("name_taken"))} waiting for a choice`);
  add(count("skipped"), `${formatNumber(count("skipped"))} skipped`);
  add(count("empty"), `${formatNumber(count("empty"))} empty, not added`);
  add(count("too_large"), `${formatNumber(count("too_large"))} over 250 MB, not added`);
  add(count("stopped"), `${formatNumber(count("stopped"))} stopped`);
  add(count("refused"), `${formatNumber(count("refused"))} not added`);
  add(systemSkipped, plural(systemSkipped, "system file skipped", "system files skipped"));
  return parts.join(" · ");
}
