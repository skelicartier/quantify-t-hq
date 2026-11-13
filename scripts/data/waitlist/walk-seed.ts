/**
 * Invented waitlist firms for the walk and the tests: yeses from people the stand-in's lead
 * files and lists already hold (all on reserved `.example` domains), the stages each is
 * moved through, and an invented "old waitlist file" in the founder's old columns. Nothing
 * here is anyone real.
 */

import { toCsv } from "../text";
import type { WaitlistStage } from "../../../src/lib/data/labels";
import { OLD_HEADER } from "./exports";

/** The walk's firms have fixed ids so the harness can open their pages without asking. */
export const WALK_ENTRIES = {
  /** Walk Capital 2000: sixteen people on file, none written to; the hold preview's firm. */
  firm: "0a17e000-0000-4000-8000-000000000001",
  /** A free-mail yes: not grouped with anyone. */
  freeMail: "0a17e000-0000-4000-8000-000000000002",
  /** Walk Fund 8, moved to Pilot and named to investors. */
  pilot: "0a17e000-0000-4000-8000-000000000003",
  dropped: "0a17e000-0000-4000-8000-000000000004",
  customer: "0a17e000-0000-4000-8000-000000000005",
} as const;

export type SeedMove = {
  stage: WaitlistStage;
  next_step?: string;
  /** Days from today. */
  next_in?: number;
  call_in_days?: number;
  pilot?: { starts_in: number; ends_in: number; success: string };
  reason?: string;
  look_again_in?: number;
};

export type SeedFirm = {
  entry_id: string;
  email: string;
  words: string;
  subject: string;
  /** Hours before now the reply arrived. */
  hours_ago: number;
  moves: SeedMove[];
  naming?: "named" | "described";
  /** Days to move the next step back by, so it is overdue (Due, and Home's owed rows). */
  overdue_by?: number;
};

export const WALK_FIRMS: readonly SeedFirm[] = [
  {
    entry_id: WALK_ENTRIES.firm,
    // inventedLead(2000): Walk Capital 2000, a hedge fund in Delhi.
    email: "asha.rao2000@firm2000.example",
    words: "Yes, count us in. Our two analysts would like to see it first.",
    subject: "Re: Quantify for Walk Capital 2000",
    hours_ago: 26,
    moves: [],
    overdue_by: 1,
  },
  {
    entry_id: WALK_ENTRIES.freeMail,
    // inventedLead(19): free mail, never grouped.
    email: "vikram.shah19@inbox.example",
    words: "Happy to try it. I run my own book.",
    subject: "Re: A note",
    hours_ago: 30,
    moves: [],
  },
  {
    entry_id: WALK_ENTRIES.pilot,
    email: "partner8@fund8.example",
    words: "Yes. Let us talk about a pilot for the research desk.",
    subject: "Re: A note for Walk Fund 8",
    hours_ago: 50,
    naming: "named",
    moves: [
      { stage: "call_booked", next_step: "Hold the first call", next_in: 1, call_in_days: 1 },
      { stage: "call_held", next_step: "Send the pilot terms", next_in: 3 },
      {
        stage: "pilot",
        next_step: "Check in at week two",
        next_in: 14,
        pilot: { starts_in: 0, ends_in: 30, success: "Two analysts use it every day" },
      },
    ],
  },
  {
    entry_id: WALK_ENTRIES.dropped,
    email: "partner9@fund9.example",
    words: "Sounds interesting, yes.",
    subject: "Re: A note for Walk Fund 9",
    hours_ago: 70,
    moves: [{ stage: "dropped", reason: "not_a_fit", look_again_in: 60 }],
  },
  {
    entry_id: WALK_ENTRIES.customer,
    email: "partner14@fund14.example",
    words: "Yes please, we will take it.",
    subject: "Re: A note for Walk Fund 14",
    hours_ago: 90,
    moves: [{ stage: "customer" }],
  },
];

/** A follow-up due yesterday, so the overview's tile and Home's queue have one overdue. */
export const WALK_OVERDUE_FOLLOW_UP = {
  email: "partner15@fund15.example",
  title: "Send the deck to Asha15 Rao15",
} as const;

/** The invented old waitlist file: `count` firms in the founder's old columns. */
export function oldWaitlistText(count = 3, from = 1): string {
  const rows: string[][] = [];
  for (let index = from; index < from + count; index += 1)
    rows.push([
      `2026-10-${String(10 + (index % 18)).padStart(2, "0")}`,
      `Old Walker ${index}`,
      index % 2 ? "Managing partner" : "Chief investment officer",
      `Old Walk Fund ${index}`,
      index % 2 ? "Family office" : "AIF",
      index % 2 ? "Mumbai" : "GIFT City",
      "India",
      `old${index}@oldfund${index}.example`,
      "Replied yes to “Waitlist 01”",
      `Yes, add us. (subject “Re: Waitlist 01”, 2026-10-${String(10 + (index % 18)).padStart(2, "0")})`,
      "Joined waitlist",
      index === from ? "Asked for the deck first" : "",
    ]);
  return toCsv(OLD_HEADER, rows);
}
