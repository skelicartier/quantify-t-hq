/**
 * C4's test kit (ws-notes/company/spec.md §9.10): Data's real core in one thread with leads
 * and replies (leads-kit's `startKit`), then pilots, diligence and the closing loaded on it,
 * with invented stand-ins for what they read of other modules: the waitlist's firms
 * (`waitlist-feed`), the investor firms (`investors-close`), Files that remembers the folder
 * each copy went into, and, when a test asks, `key-dates`, `members` and `meetings`. Every
 * firm and person is invented, on `.example`.
 */

import type { FilesService } from "../../scripts/data/leads/contracts";
import type { CloseFirm, InvestorsClose } from "../../scripts/data/closing/seams";
import type { WaitlistFeed } from "../../scripts/data/raise-contracts";
import { WALKER, startKit, type Kit } from "./leads-kit";

export { WALKER };

export type FeedEntry = ReturnType<WaitlistFeed["entries"]>[number];

export type CloseKit = Kit & {
  entries: FeedEntry[];
  firms: Map<string, CloseFirm>;
  round: { instrument: string | null };
  /** The folders copies were put into, in order. */
  folders: string[][];
  /** POST with `by` filled in. */
  post(
    path: string,
    body?: Record<string, unknown>,
  ): Promise<{ status: number; body: Record<string, unknown> }>;
  get(path: string): Promise<{ status: number; body: Record<string, unknown> }>;
};

export const entry = (n: number, firm = `Walk Buyer ${n}`, stage = "call_held"): FeedEntry => ({
  entry_id: `0a17e000-0000-4000-8000-0000000c4${String(n).padStart(3, "0")}`,
  firm,
  domain: `buyer${n}.example`,
  firm_type: "Hedge fund",
  free_mail: false,
  joined_on: "2026-10-20",
  stage,
});

export const firm = (n: number, change: Partial<CloseFirm> = {}): CloseFirm => ({
  investor_id: `c4${String(n).padStart(30, "0")}`,
  firm: `Walk Fund ${n}`,
  stage: "soft",
  residency: "non_resident",
  latest: { state: "soft", amount: 25_000, currency: "USD", instrument: "SAFE" },
  contact: { email: `partner${n}@fund${n}.example`, name: `Asha${n} Rao` },
  ...change,
});

export async function closeKit(
  options: { entries?: FeedEntry[]; firms?: CloseFirm[]; files?: boolean } = {},
): Promise<CloseKit> {
  const kit = await startKit(options.files === false ? { noFiles: true } : {});
  const entries = [...(options.entries ?? [])];
  const firms = new Map((options.firms ?? []).map((item) => [item.investor_id, item]));
  const round = { instrument: null as string | null };
  const folders: string[][] = [];
  const feed: WaitlistFeed = { entries: () => entries, moves: () => [] };
  const close: InvestorsClose = {
    firm: (id) => firms.get(id) ?? null,
    roundInstrument: () => round.instrument,
  };
  kit.core.provide("waitlist-feed", feed);
  kit.core.provide("investors-close", close);
  if (kit.files) {
    const real = kit.files;
    const files: FilesService = {
      csvFiles: () => real.csvFiles(),
      fileRow: (id) => real.fileRow(id),
      versions: (id) => real.versions(id),
      versionPath: (id, n) => real.versionPath(id, n),
      putFile: async (input) => {
        folders.push(input.folderPath);
        return real.putFile(input);
      },
      onChange: (listener) => real.onChange(listener),
    };
    kit.core.provide("files", files);
  }
  await kit.core.loadModules(["pilots", "diligence", "closing"], (name) =>
    name === "pilots"
      ? import("../../scripts/data/pilots/index")
      : name === "diligence"
        ? import("../../scripts/data/diligence/index")
        : import("../../scripts/data/closing/index"),
  );
  for (const state of kit.core.modules)
    if (state.state !== "ready") throw new Error(`module ${state.name} failed: ${state.detail}`);
  return {
    ...kit,
    entries,
    firms,
    round,
    folders,
    post: (path, body = {}) => kit.ask("POST", path, { by: WALKER, ...body }),
    get: (path) => kit.ask("GET", path),
  };
}

export const codeOf = (answer: { body: Record<string, unknown> }): string =>
  String(((answer.body.error ?? {}) as { code?: string }).code ?? "");
export const messageOf = (answer: { body: Record<string, unknown> }): string =>
  String(((answer.body.error ?? {}) as { message?: string }).message ?? "");

/** A calendar date plus whole days, with no zone involved. */
export function plus(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}
