/**
 * The incident register's limits and sentences (ws-notes/duties/spec.md §6.3): module
 * constants, because `guard.ts` is not edited. Each refusal is the sentence the page shows.
 */

export const LIMIT = {
  incidents: 2_000,
  title_min: 3,
  title: 200,
  text: 4_000,
  late_reason: 500,
  reference: 80,
  sent_by: 120,
  customers: 50,
  customer_name: 200,
  hours_min: 1,
  hours_max: 720,
  why_min: 10,
  why: 500,
  decided_by: 120,
  how: 200,
  /** A clock a little fast: a time noticed up to five minutes ahead of now is accepted. */
  ahead_minutes: 5,
  search: 200,
} as const;

export const SAY = {
  title: "Say what happened in 3 to 200 characters.",
  kind: "Choose the kind from the list.",
  severity: "Choose the severity: Low, Medium, High or Critical.",
  noticed: "Give the day and the time it was noticed, in India time, such as 21:40.",
  when: "Give the day and the time, in India time, such as 21:40.",
  futureDay: "That day is in the future.",
  future: "That time is in the future.",
  occurredAfter: "It cannot have happened after it was noticed.",
  beforeNoticed: "That is before it was noticed.",
  beforeLast: "That is before the step before it.",
  frozen: "When it was noticed cannot change once a report is recorded.",
  status: "Choose contained, resolved, closed or open.",
  closeFirst: "Record the report to CERT-In, or why it was not reportable, before closing.",
  already: "That is its status already.",
  channel: "Choose how it was sent: email, phone, fax or the online form.",
  reportedAlready: "The report to CERT-In is recorded already.",
  boardAlready: "The report to the Data Protection Board is recorded already.",
  noPersonalData: "No personal data is involved, so there is no Board report to record.",
  why: "Say why in 10 to 500 characters.",
  decidedBy: "Say who decided.",
  notReportableNone: "Nothing is recorded as not reportable.",
  customers: "An incident holds 50 customers at most.",
  customerName: "Give the customer's name.",
  hours: "Type the hours as a whole number from 1 to 720.",
  customer: "That customer is not on this incident.",
  withdrawn: "That customer is withdrawn already.",
  told: "That customer is recorded as told already.",
  incident: "That incident is not here.",
  closed: "That incident is closed. Reopen it to change it.",
  waitlist: "That firm is not on the waitlist.",
  runbook: "Choose a kind from the list.",
  file: "That file is not in Files.",
  filesMissing: "Files is not set up here yet, so a copy cannot be kept.",
} as const;

/** "It went after the 6 hours. Say why, in a line." with the rule's hours. */
export const lateSentence = (hours: number): string =>
  `It went after the ${hours.toLocaleString("en")} ${hours === 1 ? "hour" : "hours"}. Say why, in a line.`;

export const tooMany = (count: number): string =>
  `Data holds ${count.toLocaleString("en")} at most.`;
