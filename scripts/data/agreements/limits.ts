/**
 * The legal-document register's own limits (ws-notes/company/spec.md §7.3). `guard.ts`
 * holds the limits every module shares and is not edited for this batch.
 */

export const AGREEMENT_LIMITS = {
  title: 200,
  party_name: 200,
  entity: 200,
  country: 60,
  /** Counterparties on one agreement. */
  parties: 5,
  months_max: 600,
  notice_days_max: 365,
  short_terms: 300,
  law: 120,
  stamp_number: 80,
  owner: 120,
  notes: 4_000,
  notice_note: 300,
  money_max: 1_000_000_000_000,
  search: 200,
} as const;

/** How many agreements Data keeps, ended ones included. */
export const AGREEMENT_TOTAL = 5_000;

/** Due rows join this many days before their day. */
export const NOTICE_AHEAD_DAYS = 14;
export const END_AHEAD_DAYS = 30;
export const REVIEW_AHEAD_DAYS = 14;

/** The agreement the walk pins under test routes, so the harness can open it by a fixed path. */
export const WALK_AGREEMENT_ID = "walk-agreement";

/** The sources "What is missing" rests on (spec §7.5): the Labour Codes and the IP point. */
export const LABOUR_CODES_URL =
  "https://kpmg.com/in/en/blogs/2025/12/implementation-of-labour-codes-what-changes-and-road-ahead.html";
export const IP_POINT_URL =
  "https://ksandk.com/labour-employment/employment-agreements-startup-india/";
