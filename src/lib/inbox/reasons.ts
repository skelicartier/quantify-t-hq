/**
 * Why a line is in someone's inbox, in the service's weight order (`REASONS` in
 * `account_api/hq/inbox.py` — `tests/lib/inbox-reasons.test.ts` holds the two together),
 * and the reasons that count as Priority until a person says otherwise.
 */
export const INBOX_REASONS: readonly { reason: string; label: string; hint: string }[] = [
  {
    reason: "security",
    label: "Security",
    hint: "A sign-in, a key or an access change that needs a look.",
  },
  {
    reason: "late",
    label: "First reply running late",
    hint: "Someone wrote in and has waited most of the hour for a reply.",
  },
  {
    reason: "review",
    label: "Waiting on you",
    hint: "An approval, or anything else that cannot move without you.",
  },
  { reason: "mention", label: "Mentioned", hint: "Someone named you in a note or a thread." },
  { reason: "assigned", label: "Assigned", hint: "A record or a task given to you." },
  {
    reason: "reply",
    label: "Reply",
    hint: "Someone wrote back on a ticket or a conversation you look after.",
  },
  { reason: "reminder", label: "Reminder", hint: "A reminder you set fell due." },
  { reason: "state", label: "Update", hint: "Something you follow changed its state." },
  { reason: "activity", label: "Activity", hint: "Notes, calls and edits on what you follow." },
];

export const PRIORITY_DEFAULT: readonly string[] = ["security", "late", "review", "mention"];
