import { z } from "zod";

/**
 * Outbound mail's shapes, as the service writes them. A leaf module with no server-only
 * import, so client components (the campaign form, the segment builder) can share the
 * vocabulary without pulling the fetch layer into the browser.
 */

export const personRefSchema = z.object({ staff_id: z.string(), name: z.string() });

export const senderSchema = z.object({
  sender_id: z.string(),
  from_email: z.string(),
  from_name: z.string(),
  reply_to: z.string(),
  kind: z.enum(["marketing", "sales"]),
  staff_id: z.string().nullable(),
  staff_name: z.string(),
  daily_cap: z.number(),
  verified: z.boolean(),
  /** How "verified" was decided: read from the provider's lists, or ticked by an admin. */
  verified_source: z.enum(["manual", "provider"]),
  verified_checked_at: z.string().nullable(),
  verification_detail: z.string(),
  active: z.boolean(),
  /** Set by the bounce breaker or by hand; its sequence mail is held until resumed. */
  paused_at: z.string().nullable(),
  paused_reason: z.string(),
  created_at: z.string().nullable(),
});
export type MailSender = z.infer<typeof senderSchema>;

export const templateSchema = z.object({
  template_id: z.string(),
  name: z.string(),
  kind: z.enum(["campaign", "sequence"]),
  current_version: z.number(),
  subject: z.string(),
  body_html: z.string(),
  body_text: z.string(),
  required_vars: z.array(z.string()),
  content_hash: z.string(),
  created_by: personRefSchema.nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  archived_at: z.string().nullable(),
  variables: z.array(z.string()),
});
export type MailTemplate = z.infer<typeof templateSchema>;

export const conditionSchema = z.object({ field: z.string(), op: z.string(), value: z.string() });
export type MailCondition = z.infer<typeof conditionSchema>;

export const segmentSchema = z.object({
  segment_id: z.string(),
  name: z.string(),
  kind: z.enum(["people", "leads"]),
  conditions: z.array(conditionSchema),
  last_count: z.number().nullable(),
  last_evaluated_at: z.string().nullable(),
  created_by: personRefSchema.nullable(),
  created_at: z.string().nullable(),
  archived_at: z.string().nullable(),
});
export type MailSegment = z.infer<typeof segmentSchema>;

export const CAMPAIGN_STATES = [
  "draft",
  "review",
  "approved",
  "scheduled",
  "running",
  "paused",
  "auto_paused",
  "completed",
  "cancelled",
] as const;

export const campaignCountsSchema = z.object({
  recipients: z.number(),
  skipped: z.number(),
  sent: z.number(),
  delivered: z.number(),
  hard_bounced: z.number(),
  soft_bounced: z.number(),
  complained: z.number(),
  unsubscribed: z.number(),
  clicked: z.number(),
  failed: z.number(),
});

export const campaignSchema = z.object({
  campaign_id: z.string(),
  name: z.string(),
  sender: z.object({ sender_id: z.string(), from_email: z.string(), from_name: z.string() }),
  template: z.object({ template_id: z.string(), name: z.string(), version: z.number() }),
  topic: z.string(),
  topic_label: z.string(),
  audience: z.record(z.string(), z.unknown()),
  audience_description: z.string(),
  state: z.enum(CAMPAIGN_STATES),
  scheduled_at: z.string().nullable(),
  send_anytime: z.boolean(),
  dry_run: z.boolean(),
  requires_approval: z.boolean(),
  approved_by: personRefSchema.nullable(),
  approved_at: z.string().nullable(),
  pause_reason: z.string(),
  paused_at: z.string().nullable(),
  counts: campaignCountsSchema,
  rates: z.object({
    delivered_pct: z.number().nullable(),
    hard_bounce_pct: z.number().nullable(),
    complaint_pct: z.number().nullable(),
    click_pct: z.number().nullable(),
    unsubscribe_pct: z.number().nullable(),
  }),
  started_at: z.string().nullable(),
  completed_at: z.string().nullable(),
  created_by: personRefSchema.nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type MailCampaign = z.infer<typeof campaignSchema>;

export const messageSchema = z.object({
  message_id: z.string(),
  kind: z.string(),
  campaign_id: z.string().nullable(),
  enrolment_id: z.string().nullable(),
  step_no: z.number().nullable(),
  contact_kind: z.string(),
  contact_id: z.string().nullable(),
  company_id: z.string().nullable(),
  email: z.string(),
  state: z.string(),
  scheduled_at: z.string().nullable(),
  sent_at: z.string().nullable(),
  delivered_at: z.string().nullable(),
  first_clicked_at: z.string().nullable(),
  first_opened_at: z.string().nullable(),
  bounced_at: z.string().nullable(),
  complained_at: z.string().nullable(),
  unsubscribed_at: z.string().nullable(),
  provider_status: z.string(),
  subject: z.string(),
  skip_reason: z.string(),
  last_error: z.string(),
  attempts: z.number(),
  is_seed: z.boolean(),
});
export type MailMessage = z.infer<typeof messageSchema>;

export const previewSchema = z.object({
  total: z.number(),
  eligible: z.number(),
  skipped: z.number(),
  skipped_by_reason: z.record(z.string(), z.number()),
  sample: z.array(z.object({ name: z.string(), email: z.string(), company: z.string() })),
  skipped_sample: z.array(
    z.object({ name: z.string(), email: z.string(), reason: z.string(), detail: z.string() }),
  ),
  has_customers: z.boolean(),
});
export type MailPreview = z.infer<typeof previewSchema>;

export const checklistItemSchema = z.object({
  key: z.string(),
  ok: z.boolean(),
  blocking: z.boolean(),
  label: z.string(),
});
export type ChecklistItem = z.infer<typeof checklistItemSchema>;

export const suppressionSchema = z.object({
  suppression_id: z.string(),
  email: z.string(),
  scope: z.string(),
  scope_key: z.string(),
  reason: z.string(),
  source: z.string(),
  detail: z.string(),
  created_at: z.string().nullable(),
  created_by: personRefSchema.nullable(),
  released_at: z.string().nullable(),
  released_by: personRefSchema.nullable(),
  release_note: z.string(),
  active: z.boolean(),
});
export type MailSuppression = z.infer<typeof suppressionSchema>;

export const consentSchema = z.object({
  email: z.string(),
  marketing_state: z.enum(["unknown", "subscribed", "unsubscribed"]),
  topics_off: z.array(z.string()),
  sales_stop: z.boolean(),
  lawful_basis: z.string(),
  source: z.string(),
  timezone: z.string(),
  updated_at: z.string().nullable(),
});
export type MailConsent = z.infer<typeof consentSchema>;

export const stepSchema = z.object({
  step_no: z.number(),
  kind: z.enum(["email", "task"]),
  delay_days: z.number(),
  template_id: z.string().nullable(),
  template_name: z.string(),
  template_version: z.number().nullable(),
  thread: z.enum(["new", "reply"]),
  task_title: z.string(),
});
export type SequenceStep = z.infer<typeof stepSchema>;

export const sequenceSchema = z.object({
  sequence_id: z.string(),
  name: z.string(),
  kind: z.enum(["prospect", "customer"]),
  sender: z
    .object({ sender_id: z.string(), from_email: z.string(), from_name: z.string() })
    .nullable(),
  state: z.enum(["draft", "active", "paused", "archived"]),
  cooling_days: z.number(),
  recent_contact_days: z.number(),
  company_limit: z.number(),
  steps: z.array(stepSchema),
  counts: z.object({
    active: z.number(),
    paused: z.number(),
    completed: z.number(),
    exited: z.number(),
    enrolled: z.number(),
    replied: z.number(),
    meetings: z.number(),
  }),
  created_by: personRefSchema.nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
});
export type MailSequence = z.infer<typeof sequenceSchema>;

export const enrolmentSchema = z.object({
  enrolment_id: z.string(),
  sequence_id: z.string(),
  contact_kind: z.string(),
  contact_id: z.string(),
  contact_name: z.string(),
  company_id: z.string(),
  company_name: z.string(),
  email: z.string(),
  owner_staff_id: z.string(),
  owner_name: z.string(),
  state: z.enum(["active", "paused", "completed", "exited"]),
  current_step: z.number(),
  steps_total: z.number(),
  waiting_task_id: z.string().nullable(),
  exit_reason: z.string(),
  outcome: z.string(),
  outcome_label: z.string(),
  paused_until: z.string().nullable(),
  pause_reason: z.string(),
  enrolled_at: z.string().nullable(),
  last_sent_at: z.string().nullable(),
  exited_at: z.string().nullable(),
  awaiting_reply: z.boolean(),
  sequence_name: z.string().optional(),
});
export type MailEnrolment = z.infer<typeof enrolmentSchema>;

export const verdictSchema = z.object({
  contact_kind: z.string(),
  contact_id: z.string(),
  name: z.string(),
  email: z.string(),
  company: z.string(),
  allowed: z.boolean(),
  reason: z.string(),
  detail: z.string(),
  enrolment_id: z.string().optional(),
});
export type EnrolVerdict = z.infer<typeof verdictSchema>;

export const healthSchema = z.object({
  sent: z.number(),
  delivered: z.number(),
  hard_bounced: z.number(),
  soft_bounced: z.number(),
  complained: z.number(),
  unsubscribed: z.number(),
  clicked: z.number(),
  failed: z.number(),
  skipped: z.number(),
  hard_bounce_pct: z.number().nullable(),
  complaint_pct: z.number().nullable(),
  unsubscribe_pct: z.number().nullable(),
  click_pct: z.number().nullable(),
  thresholds: z.object({
    hard_bounce_pct: z.number(),
    complaint_pct_watch: z.number(),
    complaint_pct_stop: z.number(),
  }),
});
export type MailHealth = z.infer<typeof healthSchema>;

export const unsubscribeViewSchema = z.object({
  email: z.string(),
  kind: z.enum(["marketing", "sales"]),
  topic: z.string(),
  topic_label: z.string(),
  marketing_state: z.string(),
  sales_stop: z.boolean(),
  topics: z.array(z.object({ key: z.string(), label: z.string(), off: z.boolean() })),
});
export type UnsubscribeView = z.infer<typeof unsubscribeViewSchema>;

// --- mailing lists -------------------------------------------------------------------------

export const mailListSchema = z.object({
  list_id: z.string(),
  name: z.string(),
  description: z.string(),
  /** The list's own columns beyond the standard ones; templates use {{custom.<key>}}. */
  columns: z.array(z.string()),
  members: z.number(),
  created_by: z.object({ staff_id: z.string(), name: z.string() }).nullable(),
  created_at: z.string().nullable(),
  updated_at: z.string().nullable(),
  archived_at: z.string().nullable(),
});
export type MailList = z.infer<typeof mailListSchema>;

export const listMemberSchema = z.object({
  member_id: z.string(),
  email: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  full_name: z.string(),
  company: z.string(),
  title: z.string(),
  country: z.string(),
  fields: z.record(z.string(), z.string()),
  person_id: z.string().nullable(),
  person_name: z.string(),
  source: z.enum(["csv", "manual", "crm"]),
  basis: z.enum(["consent", "legitimate_interest"]),
  added_at: z.string().nullable(),
  /** "ok" when a product-update campaign could mail them today; else the reason it could not. */
  status: z.string(),
  status_detail: z.string(),
});
export type ListMember = z.infer<typeof listMemberSchema>;

export const listImportResultSchema = z.object({
  added: z.number(),
  updated: z.number(),
  unchanged: z.number(),
  skipped: z.array(z.object({ row: z.number(), email: z.string(), reason: z.string() })),
  skipped_count: z.number(),
  consent_recorded: z.number(),
  columns_added: z.array(z.string()),
  columns_dropped: z.array(z.string()),
  rows: z.number(),
});
export type ListImportResult = z.infer<typeof listImportResultSchema>;

/** mail_lists.MAX_MEMBERS: the most people one list holds. */
export const LIST_MAX_MEMBERS = 20_000;

/** Why a row of a list import was not taken. */
export const IMPORT_SKIP_LABELS: Record<string, string> = {
  NO_EMAIL: "No address",
  INVALID_EMAIL: "Not a valid address",
  DUPLICATE_IN_FILE: "Twice in the file",
  LIST_FULL: "The list is full",
  NOT_FOUND: "Record not found",
};

/** Why a recipient was not sent a message, in words a colleague would use. */
export const SKIP_REASON_LABELS: Record<string, string> = {
  NO_EMAIL: "No address",
  INVALID_EMAIL: "Not a valid address",
  BOUNCED: "Address bounced",
  COMPLAINED: "Reported us as spam",
  UNSUBSCRIBED: "Unsubscribed",
  SALES_STOP: "Asked sales to stop",
  SUPPRESSED: "On the stop list",
  DO_NOT_CONTACT: "Do not contact",
  ROLE_ADDRESS: "Shared inbox (info@, sales@)",
  TOPIC_OFF: "Turned this topic off",
  NO_CONSENT: "Needs a yes first (DE/AT)",
  FREQUENCY_CAP: "Mailed twice this week",
  MISSING_TOKEN: "Missing a name the copy needs",
  ADDRESS_INVALID: "A verification said the address does not exist",
  DUPLICATE: "Same address twice",
  ALREADY_IN_SEQUENCE: "Already in a sequence",
  ALREADY_HAD_SEQUENCE: "Had this sequence recently",
  CONTACTED_RECENTLY: "Emailed in the last two weeks",
  OWNED_BY_COLLEAGUE: "A colleague's account",
  IS_CUSTOMER: "Already a customer",
  COMPANY_LIMIT: "Two at this firm already",
  NO_SENDER: "No sending identity",
  NOT_FOUND: "Record not found",
  SENDER_UNVERIFIED: "Sender not verified",
  TEMPLATE_GONE: "Template gone",
  CAMPAIGN_CANCELLED: "Campaign cancelled",
  ENROLMENT_ENDED: "Sequence ended",
  COMPANY_ENGAGED: "Colleague at the firm engaged",
  OUT_OF_OFFICE: "Out of office",
};

export const EXIT_REASON_LABELS: Record<string, string> = {
  REPLIED: "Replied",
  NOT_NOW: "Not now",
  NOT_INTERESTED: "Not interested",
  WRONG_PERSON: "Wrong person",
  UNSUBSCRIBED: "Asked us to stop",
  HARD_BOUNCE: "Address bounced",
  MEETING_BOOKED: "Meeting booked",
  DEAL_CREATED: "Deal opened",
  STAGE_ADVANCED: "Lead moved on",
  STAGE_CLOSED: "Lead closed",
  MANUAL: "Stopped by hand",
  COMPANY_ENGAGED: "Colleague engaged",
  COMPLETED: "All steps sent",
  DO_NOT_CONTACT: "Do not contact",
};

export const MESSAGE_STATE_LABELS: Record<string, string> = {
  pending: "Queued",
  retry: "Retrying",
  claimed: "Sending",
  held: "Held",
  sent: "Sent",
  delivered: "Delivered",
  soft_bounced: "Soft bounce",
  hard_bounced: "Bounced",
  complained: "Spam report",
  unsubscribed: "Unsubscribed",
  failed: "Failed",
  unknown: "Awaiting answer",
  skipped: "Skipped",
  cancelled: "Cancelled",
  dry_run: "Dry run",
};

export const CAMPAIGN_STATE_LABELS: Record<(typeof CAMPAIGN_STATES)[number], string> = {
  draft: "Draft",
  review: "Awaiting approval",
  approved: "Approved",
  scheduled: "Scheduled",
  running: "Sending",
  paused: "Paused",
  auto_paused: "Paused itself",
  completed: "Sent",
  cancelled: "Cancelled",
};

export const SUPPRESSION_REASON_LABELS: Record<string, string> = {
  hard_bounce: "Hard bounce",
  complaint: "Spam complaint",
  unsubscribe: "Unsubscribed",
  manual: "Added by hand",
  invalid_address: "Invalid address",
  provider_blocked: "Blocked by the provider",
  soft_bounce_limit: "Three soft bounces",
};

export const CONDITION_OPS: Record<string, string> = {
  is: "is",
  not: "is not",
  has: "contains",
  in: "is any of",
  gt: "is more than",
  lt: "is less than",
  empty: "is empty",
  set: "is set",
};

export function describeCondition(
  condition: MailCondition,
  fields: readonly { key: string; label: string }[],
): string {
  const label = fields.find((field) => field.key === condition.field)?.label ?? condition.field;
  const op = CONDITION_OPS[condition.op] ?? condition.op;
  return ["empty", "set"].includes(condition.op)
    ? `${label} ${op}`
    : `${label} ${op} ${condition.value}`;
}
