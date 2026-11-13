/**
 * A few invented replies for the walk, so Replies and a lead's page have something to
 * show before the walk records its own: people the stand-in's live mailing wrote to
 * ("Walk 01"), each answering in a different way. No yes (the waitlist arrives with
 * Unit 4) and no no (the walk records that one itself and checks the stop list).
 */

import type { Outcome } from "../../../src/lib/data/labels";

export type SeedReply = {
  email: string;
  outcome: Outcome;
  words: string;
  subject: string;
  later_days?: number;
  referral?: { name: string; email: string; title: string };
};

export const WALK_REPLIES: readonly SeedReply[] = [
  {
    email: "partner3@fund3.example",
    outcome: "not_now",
    words: "Thanks for writing. We are mid-raise ourselves; try us again in a few weeks.",
    subject: "Re: A note for Walk Fund 3",
    later_days: 21,
  },
  {
    email: "partner4@fund4.example",
    outcome: "question",
    words: "Does it cover unlisted Indian companies, or only listed ones?",
    subject: "Re: A note for Walk Fund 4",
  },
  {
    email: "partner5@fund5.example",
    outcome: "wrong_person",
    words: "I have moved on from research. Please write to my colleague Rhea instead.",
    subject: "Re: A note for Walk Fund 5",
    referral: { name: "Rhea Walkname", email: "rhea@fund5.example", title: "Head of research" },
  },
  {
    email: "partner6@fund6.example",
    outcome: "out_of_office",
    words: "I am away until the end of the month with limited access to email.",
    subject: "Automatic reply: A note for Walk Fund 6",
    later_days: 10,
  },
];
