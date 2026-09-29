import "server-only";

import { z } from "zod";

import { fetchHqJson, postHqJson } from "@/lib/api/core";
import {
  campaignSchema,
  checklistItemSchema,
  conditionSchema,
  consentSchema,
  enrolmentSchema,
  healthSchema,
  messageSchema,
  previewSchema,
  segmentSchema,
  senderSchema,
  sequenceSchema,
  suppressionSchema,
  templateSchema,
  unsubscribeViewSchema,
  verdictSchema,
  mailListSchema,
  listMemberSchema,
  listImportResultSchema,
} from "@/lib/api/mail-schema";

export * from "@/lib/api/mail-schema";

const okEnvelope = z.object({ ok: z.literal(true) });
const labelled = z.array(z.object({ key: z.string(), label: z.string() }));

// --- overview -------------------------------------------------------------------------

const overviewSchema = okEnvelope.extend({
  sending_enabled: z.boolean(),
  paused_reason: z.string(),
  last_worker_at: z.string().nullable(),
  campaigns: z.object({
    running: z.number(),
    scheduled: z.number(),
    review: z.number(),
    approved: z.number(),
    auto_paused: z.number(),
    draft: z.number(),
  }),
  sequences: z.object({
    active_enrolments: z.number(),
    paused_enrolments: z.number(),
    awaiting_reply: z.number(),
  }),
  today: z.object({
    sent: z.number(),
    global_cap: z.number(),
    hour_sent: z.number(),
    hourly_cap: z.number(),
  }),
  suppressions_7d: z.number(),
  health_30d: healthSchema,
  senders: z.array(senderSchema),
  postal_address_set: z.boolean(),
  webhook_configured: z.boolean(),
});
export type MailOverview = z.infer<typeof overviewSchema>;

export function readMailOverview(token: string) {
  return fetchHqJson("hq/mail/overview", overviewSchema, { token });
}

// --- senders ----------------------------------------------------------------------------

export function readSenders(token: string) {
  return fetchHqJson(
    "hq/mail/senders",
    okEnvelope.extend({
      senders: z.array(senderSchema),
      default_from_email: z.string(),
      default_from_name: z.string(),
    }),
    { token },
  );
}

export function saveSender(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/mail/senders/save", okEnvelope.extend({ sender: senderSchema }), {
    token,
    body: input,
  });
}

/** Ask the provider about a sender; its answer, not a person, sets "verified". */
export function checkSender(token: string, senderId: string) {
  return postHqJson(
    `hq/mail/senders/${senderId}/check`,
    okEnvelope.extend({
      sender: senderSchema,
      check: z.object({ status: z.string(), verified: z.boolean(), detail: z.string() }),
    }),
    { token, body: {} },
  );
}

/** Hold a sender's mail (`resume: false`) or release it again. */
export function pauseSender(
  token: string,
  senderId: string,
  input: { resume: boolean; note?: string },
) {
  return postHqJson(
    `hq/mail/senders/${senderId}/pause`,
    okEnvelope.extend({ sender: senderSchema, released: z.number().optional() }),
    { token, body: input },
  );
}

// --- mailing lists ------------------------------------------------------------------------

export function readLists(token: string) {
  return fetchHqJson(
    "hq/mail/lists",
    okEnvelope.extend({
      lists: z.array(mailListSchema),
      limits: z.object({ members: z.number(), import_rows: z.number(), columns: z.number() }),
    }),
    { token },
  );
}

export function saveList(
  token: string,
  input: { list_id?: string; name: string; description: string },
) {
  return postHqJson("hq/mail/lists/save", okEnvelope.extend({ list: mailListSchema }), {
    token,
    body: input,
  });
}

export function readList(
  token: string,
  listId: string,
  query: { q?: string; status?: string; offset?: number; limit?: number } = {},
) {
  const params: Record<string, string> = {};
  if (query.q) params.q = query.q;
  if (query.status) params.status = query.status;
  if (query.offset) params.offset = String(query.offset);
  if (query.limit) params.limit = String(query.limit);
  return fetchHqJson(
    `hq/mail/lists/${listId}`,
    okEnvelope.extend({
      list: mailListSchema,
      members: z.array(listMemberSchema),
      total: z.number(),
      offset: z.number(),
      limit: z.number(),
      counts: z.object({
        members: z.number(),
        eligible: z.number(),
        blocked: z.number(),
        by_reason: z.record(z.string(), z.number()),
      }),
      campaigns: z.array(
        z.object({ campaign_id: z.string(), name: z.string(), state: z.string() }),
      ),
    }),
    { token, query: params },
  );
}

export type ListRow = {
  email: string;
  first_name?: string;
  last_name?: string;
  full_name?: string;
  company?: string;
  title?: string;
  country?: string;
  fields?: Record<string, string>;
};

export function importListRows(
  token: string,
  listId: string,
  input: { rows: ListRow[]; basis: string; update_existing: boolean; label: string },
) {
  return postHqJson(`hq/mail/lists/${listId}/import`, okEnvelope.merge(listImportResultSchema), {
    token,
    body: input,
  });
}

export function addListMembers(
  token: string,
  listId: string,
  input:
    | { member: ListRow; basis: string }
    | { contacts: { kind: "person" | "lead"; id: string }[]; basis: string },
) {
  return postHqJson(
    `hq/mail/lists/${listId}/members/add`,
    okEnvelope.merge(listImportResultSchema),
    { token, body: input },
  );
}

export function updateListMember(
  token: string,
  listId: string,
  memberId: string,
  input: Record<string, unknown>,
) {
  return postHqJson(
    `hq/mail/lists/${listId}/members/${memberId}/update`,
    okEnvelope.extend({ member: listMemberSchema }),
    { token, body: input },
  );
}

export function removeListMembers(token: string, listId: string, memberIds: string[]) {
  return postHqJson(
    `hq/mail/lists/${listId}/members/remove`,
    okEnvelope.extend({ removed: z.number() }),
    { token, body: { member_ids: memberIds } },
  );
}

export function archiveList(token: string, listId: string, restore: boolean) {
  return postHqJson(
    `hq/mail/lists/${listId}/archive`,
    okEnvelope.extend({ archived: z.boolean() }),
    {
      token,
      body: { restore },
    },
  );
}

export function exportList(token: string, listId: string, reason: string) {
  return postHqJson(
    `hq/mail/lists/${listId}/export`,
    okEnvelope.extend({ filename: z.string(), rows: z.number(), csv: z.string() }),
    { token, body: { reason } },
  );
}

// --- templates ----------------------------------------------------------------------------

export function readTemplates(token: string) {
  return fetchHqJson(
    "hq/mail/templates",
    okEnvelope.extend({ templates: z.array(templateSchema), variables: z.array(z.string()) }),
    { token },
  );
}

const templateVersionSchema = z.object({
  version: z.number(),
  subject: z.string(),
  created_at: z.string().nullable(),
  created_by: z.object({ staff_id: z.string(), name: z.string() }).nullable(),
  content_hash: z.string(),
});

export function readTemplate(token: string, templateId: string) {
  return fetchHqJson(
    `hq/mail/templates/${templateId}`,
    okEnvelope.extend({ template: templateSchema, versions: z.array(templateVersionSchema) }),
    { token },
  );
}

export function saveTemplate(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/mail/templates/save", okEnvelope.extend({ template: templateSchema }), {
    token,
    body: input,
  });
}

export function archiveTemplate(token: string, templateId: string, restore: boolean) {
  return postHqJson(
    `hq/mail/templates/${templateId}/archive`,
    okEnvelope.extend({ archived: z.boolean() }),
    { token, body: { restore } },
  );
}

const renderedSchema = okEnvelope.extend({
  ok_render: z.boolean(),
  subject: z.string().optional(),
  html: z.string().optional(),
  text: z.string().optional(),
  missing: z.string().optional(),
  variables: z.record(z.string(), z.string()),
});
export type RenderedPreview = z.infer<typeof renderedSchema>;

export function previewTemplate(
  token: string,
  templateId: string,
  input: {
    contact_kind?: string;
    contact_id?: string;
    /** A list campaign previews as the list's first member. */
    list_id?: string;
    version?: number;
    topic?: string;
  },
) {
  return postHqJson(`hq/mail/templates/${templateId}/preview`, renderedSchema, {
    token,
    body: input,
  });
}

// --- segments -----------------------------------------------------------------------------

const segmentsSchema = okEnvelope.extend({
  segments: z.array(segmentSchema),
  fields: z.object({ people: labelled, leads: labelled }),
  ops: z.array(z.string()),
});
export type SegmentsPage = z.infer<typeof segmentsSchema>;

export function readSegments(token: string) {
  return fetchHqJson("hq/mail/segments", segmentsSchema, { token });
}

export function saveSegment(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/mail/segments/save", okEnvelope.extend({ segment: segmentSchema }), {
    token,
    body: input,
  });
}

export function previewSegment(
  token: string,
  input: { kind: string; conditions: string[]; topic?: string },
) {
  return postHqJson(
    "hq/mail/segments/preview",
    okEnvelope.merge(previewSchema).extend({ conditions: z.array(conditionSchema) }),
    { token, body: input },
  );
}

export function archiveSegment(token: string, segmentId: string, restore: boolean) {
  return postHqJson(
    `hq/mail/segments/${segmentId}/archive`,
    okEnvelope.extend({ archived: z.boolean() }),
    { token, body: { restore } },
  );
}

// --- campaigns ----------------------------------------------------------------------------

export function readCampaigns(token: string) {
  return fetchHqJson(
    "hq/mail/campaigns",
    okEnvelope.extend({
      campaigns: z.array(campaignSchema),
      topics: labelled,
      may_send: z.boolean(),
    }),
    { token },
  );
}

const campaignDetailSchema = okEnvelope.extend({
  campaign: campaignSchema,
  messages_by_state: z.record(z.string(), z.number()),
  skipped_by_reason: z.record(z.string(), z.number()),
  messages: z.array(messageSchema),
  may_send: z.boolean(),
  may_approve: z.boolean(),
  preview: previewSchema.optional(),
  checklist: z.array(checklistItemSchema).optional(),
});
export type CampaignDetail = z.infer<typeof campaignDetailSchema>;

export function readCampaign(token: string, campaignId: string) {
  return fetchHqJson(`hq/mail/campaigns/${campaignId}`, campaignDetailSchema, { token });
}

const campaignEnvelope = okEnvelope.extend({ campaign: campaignSchema });

export function createCampaign(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/mail/campaigns/create", campaignEnvelope, { token, body: input });
}

export function updateCampaign(token: string, campaignId: string, input: Record<string, unknown>) {
  return postHqJson(`hq/mail/campaigns/${campaignId}/update`, campaignEnvelope, {
    token,
    body: input,
  });
}

export function previewCampaign(token: string, campaignId: string) {
  return postHqJson(
    `hq/mail/campaigns/${campaignId}/preview`,
    okEnvelope
      .merge(previewSchema)
      .extend({ checklist: z.array(checklistItemSchema), approval_threshold: z.number() }),
    { token, body: {} },
  );
}

export function testCampaign(token: string, campaignId: string, input: Record<string, unknown>) {
  return postHqJson(
    `hq/mail/campaigns/${campaignId}/test`,
    okEnvelope.extend({ status: z.string(), message_id: z.string(), error_code: z.string() }),
    { token, body: input },
  );
}

export function submitCampaign(token: string, campaignId: string) {
  return postHqJson(
    `hq/mail/campaigns/${campaignId}/submit`,
    okEnvelope.extend({
      state: z.string(),
      requires_approval: z.boolean(),
      eligible: z.number(),
      skipped: z.number(),
    }),
    { token, body: {} },
  );
}

export function decideCampaign(
  token: string,
  campaignId: string,
  decision: "approve" | "decline",
  note: string,
) {
  return postHqJson(
    `hq/mail/campaigns/${campaignId}/approve`,
    okEnvelope.extend({ state: z.string() }),
    { token, body: { decision, note } },
  );
}

export function scheduleCampaign(token: string, campaignId: string, scheduledAt: string) {
  return postHqJson(
    `hq/mail/campaigns/${campaignId}/schedule`,
    okEnvelope.extend({
      eligible: z.number(),
      skipped: z.number(),
      state: z.string(),
      starts_at: z.string(),
    }),
    { token, body: scheduledAt ? { scheduled_at: scheduledAt } : {} },
  );
}

const transitionSchema = okEnvelope.extend({ state: z.string() }).passthrough();

export function pauseCampaign(token: string, campaignId: string, note: string) {
  return postHqJson(`hq/mail/campaigns/${campaignId}/pause`, transitionSchema, {
    token,
    body: { note },
  });
}

export function resumeCampaign(token: string, campaignId: string, note: string) {
  return postHqJson(`hq/mail/campaigns/${campaignId}/resume`, transitionSchema, {
    token,
    body: { note },
  });
}

export function cancelCampaign(token: string, campaignId: string, note: string) {
  return postHqJson(`hq/mail/campaigns/${campaignId}/cancel`, transitionSchema, {
    token,
    body: { note },
  });
}

// --- sequences ----------------------------------------------------------------------------

export function readSequences(token: string) {
  return fetchHqJson(
    "hq/mail/sequences",
    okEnvelope.extend({
      sequences: z.array(sequenceSchema),
      outcomes: labelled,
      may_send: z.boolean(),
    }),
    { token },
  );
}

const perStepSchema = z.object({
  step_no: z.number(),
  scheduled: z.number(),
  sent: z.number(),
  delivered: z.number(),
  bounced: z.number(),
  clicked: z.number(),
  skipped: z.number(),
});

const sequenceDetailSchema = okEnvelope.extend({
  sequence: sequenceSchema,
  enrolments: z.array(enrolmentSchema),
  per_step: z.array(perStepSchema),
  may_send: z.boolean(),
});
export type SequenceDetail = z.infer<typeof sequenceDetailSchema>;

export function readSequence(token: string, sequenceId: string) {
  return fetchHqJson(`hq/mail/sequences/${sequenceId}`, sequenceDetailSchema, { token });
}

export function saveSequence(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/mail/sequences/save", okEnvelope.extend({ sequence: sequenceSchema }), {
    token,
    body: input,
  });
}

export function setSequenceState(token: string, sequenceId: string, state: string) {
  return postHqJson(
    `hq/mail/sequences/${sequenceId}/state`,
    okEnvelope.extend({ state: z.string(), ended: z.number() }),
    { token, body: { state } },
  );
}

type Contact = { kind: "person" | "lead"; id: string };

export function previewEnrolment(token: string, sequenceId: string, contacts: Contact[]) {
  return postHqJson(
    `hq/mail/sequences/${sequenceId}/enrol/preview`,
    okEnvelope.extend({
      verdicts: z.array(verdictSchema),
      will_enrol: z.number(),
      will_skip: z.number(),
    }),
    { token, body: { contacts } },
  );
}

export function enrol(token: string, sequenceId: string, contacts: Contact[]) {
  return postHqJson(
    `hq/mail/sequences/${sequenceId}/enrol`,
    okEnvelope.extend({
      enrolled: z.number(),
      enrolment_ids: z.array(z.string()),
      verdicts: z.array(verdictSchema),
    }),
    { token, body: { contacts } },
  );
}

export function recordOutcome(
  token: string,
  enrolmentId: string,
  input: { outcome: string; note?: string; pause_until?: string },
) {
  return postHqJson(
    `hq/mail/enrolments/${enrolmentId}/outcome`,
    okEnvelope.extend({ outcome: z.string(), state: z.string() }).passthrough(),
    { token, body: input },
  );
}

export function resumeEnrolment(token: string, enrolmentId: string) {
  return postHqJson(
    `hq/mail/enrolments/${enrolmentId}/resume`,
    okEnvelope.extend({ state: z.string() }),
    { token, body: {} },
  );
}

export function readReplies(token: string) {
  return fetchHqJson(
    "hq/mail/replies",
    okEnvelope.extend({ enrolments: z.array(enrolmentSchema), outcomes: labelled }),
    { token },
  );
}

// --- suppressions and consent ------------------------------------------------------------

export function readSuppressions(token: string, query: { q?: string; released?: boolean } = {}) {
  return fetchHqJson(
    "hq/mail/suppressions",
    okEnvelope.extend({
      suppressions: z.array(suppressionSchema),
      by_reason: z.record(z.string(), z.number()),
      reasons: z.array(z.string()),
    }),
    {
      token,
      query: {
        ...(query.q ? { q: query.q } : {}),
        ...(query.released ? { released: "1" } : {}),
      },
    },
  );
}

export function addSuppression(token: string, email: string, detail: string) {
  return postHqJson(
    "hq/mail/suppressions/add",
    okEnvelope.extend({ suppression: suppressionSchema, cancelled: z.number() }),
    { token, body: { email, detail } },
  );
}

export function releaseSuppression(token: string, suppressionId: string, note: string) {
  return postHqJson(
    `hq/mail/suppressions/${suppressionId}/release`,
    okEnvelope.extend({ released: z.boolean() }),
    { token, body: { note } },
  );
}

export function readConsent(token: string, email: string) {
  return fetchHqJson(
    "hq/mail/consent",
    okEnvelope.extend({ consent: consentSchema, topics: labelled }),
    { token, query: { email } },
  );
}

export function setConsent(token: string, input: Record<string, unknown>) {
  return postHqJson("hq/mail/consent/set", okEnvelope.extend({ consent: consentSchema }), {
    token,
    body: input,
  });
}

// --- settings, worker, report, messages -----------------------------------------------------

const mailSettingsSchema = okEnvelope.extend({
  sending_enabled: z.boolean(),
  global_daily_cap: z.number(),
  hourly_cap: z.number(),
  frequency_cap_per_week: z.number(),
  approval_threshold: z.number(),
  bounce_pause_pct: z.number(),
  complaint_pause_pct: z.number(),
  window_start: z.string(),
  window_end: z.string(),
  fallback_timezone: z.string(),
  postal_address: z.string(),
  seed_addresses: z.array(z.string()),
  webhook_configured: z.boolean(),
  paused_reason: z.string(),
  last_worker_at: z.string().nullable(),
  provider_backoff_until: z.string().nullable(),
  webhook_url_shape: z.string(),
  unsubscribe_url_shape: z.string(),
  provider_configured: z.boolean(),
  topics: labelled,
});
export type MailSettings = z.infer<typeof mailSettingsSchema>;

export function readMailSettings(token: string) {
  return fetchHqJson("hq/settings/mail", mailSettingsSchema, { token });
}

export function updateMailSettings(token: string, input: Record<string, unknown>) {
  return postHqJson(
    "hq/settings/mail/update",
    okEnvelope.extend({ settings: z.record(z.string(), z.unknown()) }),
    { token, body: input },
  );
}

export function rotateMailWebhook(token: string) {
  return postHqJson(
    "hq/settings/mail/webhook/rotate",
    okEnvelope.extend({ webhook_url: z.string() }),
    { token, body: {} },
  );
}

export function runMailWorker(token: string) {
  return postHqJson(
    "hq/mail/worker/run",
    okEnvelope.extend({ report: z.record(z.string(), z.union([z.number(), z.boolean()])) }),
    { token, body: {} },
  );
}

const reportSchema = okEnvelope.extend({
  days: z.number(),
  totals: healthSchema,
  per_day: z.array(z.object({ day: z.string(), sent: z.number() })),
  campaigns: z.array(campaignSchema),
  sequences: z.array(
    z.object({
      sequence_id: z.string(),
      name: z.string(),
      state: z.string(),
      enrolled: z.number(),
      active: z.number(),
      replied: z.number(),
      meetings: z.number(),
      exits: z.record(z.string(), z.number()),
    }),
  ),
  caps_today: z.object({
    global: z.object({ sent: z.number(), cap: z.number() }),
    hour: z.object({ sent: z.number(), cap: z.number() }),
    senders: z.array(senderSchema.extend({ sent_today: z.number() })),
  }),
  suppressions_by_reason: z.record(z.string(), z.number()),
  consent: z.record(z.string(), z.number()),
});
export type MailReport = z.infer<typeof reportSchema>;

export function readMailReport(token: string, days: number) {
  return fetchHqJson("hq/mail/report", reportSchema, { token, query: { days: String(days) } });
}

export function readMessage(token: string, messageId: string) {
  return fetchHqJson(
    `hq/mail/messages/${messageId}`,
    okEnvelope.extend({
      message: messageSchema,
      events: z.array(
        z.object({
          event_type: z.string(),
          occurred_at: z.string().nullable(),
          reason: z.string(),
          link: z.string(),
        }),
      ),
    }),
    { token },
  );
}

const historySchema = okEnvelope.extend({
  email: z.string(),
  consent: consentSchema,
  suppressions: z.array(suppressionSchema),
  messages: z.array(messageSchema),
  enrolments: z.array(
    z.object({
      enrolment_id: z.string(),
      sequence_id: z.string(),
      state: z.string(),
      outcome: z.string(),
      exit_reason: z.string(),
      enrolled_at: z.string().nullable(),
    }),
  ),
});
export type MailHistory = z.infer<typeof historySchema>;

export function readMailHistory(token: string, email: string) {
  return fetchHqJson("hq/mail/history", historySchema, { token, query: { email } });
}

// --- the recipient's stop (anonymous) ------------------------------------------------------

export function readUnsubscribe(token: string) {
  const safeToken = encodeURIComponent(token);
  return fetchHqJson(
    `public/mail/unsubscribe/${safeToken}`,
    okEnvelope.merge(unsubscribeViewSchema),
  );
}

export function unsubscribe(
  token: string,
  mode: "one_click" | "all" | "topics" | "sales",
  topicsOff: string[] = [],
) {
  return postHqJson(
    "public/mail/unsubscribe",
    okEnvelope.merge(unsubscribeViewSchema).extend({
      done: z.boolean(),
      cancelled: z.number(),
      /** The service's database was asleep: the stop is kept and applied within minutes. */
      spooled: z.boolean().optional(),
    }),
    { body: { token, mode, topics_off: topicsOff } },
  );
}
