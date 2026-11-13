/**
 * What a Data walk module gets and gives. Every `scripts/data-walk/<name>.ts` may export
 * `shots` (the screens the harness captures), `seed(socketPath)` (what the stand-in makes
 * before the walk) and `walk(page, kit)` (the checks, run at both widths and in both
 * themes by `scripts/e2e-data.ts`). This file exports none of those, so the loaders skip it.
 */

import type { Page } from "playwright";

import type { Staff } from "../data/protocol";
import type { OutgoingMail } from "../mail-merge/provider";

/** A screen the harness opens: the `ready` selector must be the page's own. */
export type Shot = { name: string; path: string; ready?: string };

export type Pass = {
  width: "desktop" | "phone";
  theme: "dark" | "light";
  /** The first pass of the run (desktop, dark): the place for steps that break things. */
  first: boolean;
};

export type SocketAnswer = { status: number; body: Record<string, unknown> };

export type WalkKit = {
  /** The portal's origin, never the live one. */
  base: string;
  pass: Pass;
  /** One check: counted, printed, and the run fails if any is false. */
  check(name: string, ok: boolean, detail?: unknown): void;
  /** Overflow ≤ 1px, axe serious or critical = 0, no "demo", no progress bar outside the tray; a screenshot. */
  audit(name: string): Promise<void>;
  /** What the stand-in's provider was handed: every "sent" mail, nothing of which left. */
  outbox(): OutgoingMail[];
  socket: {
    path: string;
    /** A call straight to the service, for the test routes; the body is JSON. */
    ask(method: "GET" | "POST", path: string, body?: unknown): Promise<SocketAnswer>;
    /** Wait until the service answers and Data says it is ready. */
    waitReady(timeoutMs?: number): Promise<void>;
  };
  /** The main landmark's text. */
  text(): Promise<string>;
  /** Wait until the page says these words. */
  says(words: string, timeoutMs?: number): Promise<void>;
};

export type WalkModule = {
  shots?: Shot[];
  seed?: (socketPath: string) => Promise<void>;
  walk?: (page: Page, kit: WalkKit) => Promise<void>;
};

/** Who the walk acts as on the service side: invented, like everyone in the walk. */
export const WALKER: Staff = { staff_id: "walk-owner", name: "Walk Owner" };

/** The ids the walk pins, so the harness can open them without asking the service. */
export const PINNED = { preparingBuild: "walk-preparing" } as const;
