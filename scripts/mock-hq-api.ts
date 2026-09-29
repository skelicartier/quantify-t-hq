/**
 * A local stand-in for the Account API's `hq/*` route group, for developing the portal
 * with no Azure and no database.
 *
 *     npm run mock:hq          →  http://127.0.0.1:7071/api/v1
 *
 * THE MOCK MIRRORS THE REAL TABLE OR IT IS WORSE THAN NOTHING. Every route it serves
 * exists upstream with the same method, the same auth model and the same response
 * shape; the route-parity test holds this file to the Python `HQ_HANDLERS` table the
 * same way it holds the client. A permissive mock once certified a console flow the
 * service refused; that class of lie is what the parity test exists to kill.
 *
 * Personas (any password of 8+ characters; every TOTP prompt accepts 000000):
 *   owner@hq.test    Owner            admin@hq.test    Admin
 *   sales@hq.test    Sales            support@hq.test  Support
 *   intern@hq.test   Intern           newbie@hq.test   Owner, not yet enrolled
 *
 * MOCK_DEGRADE="hq/staff,hq/sessions" makes the named routes answer 503, which is how
 * the degraded screenshots are produced.
 */

import { createServer } from "node:http";
import { createHash, createHmac, randomUUID } from "node:crypto";

const PORT = 7071;
const PREFIX = "/api/v1/";
const DEGRADED = new Set(
  (process.env.MOCK_DEGRADE ?? "")
    .split(",")
    .map((route) => route.trim())
    .filter(Boolean),
);

const CAPABILITIES: Record<string, string[]> = {
  owner: [
    "audit:read",
    "certificates:issue",
    "crm:export",
    "crm:read",
    "crm:write",
    "deals:read",
    "deals:write",
    "hq:admin",
    "hr:read",
    "hr:write",
    "revenue:read",
    "revenue:write",
    "tickets:manage",
    "tickets:read",
    "tickets:write",
  ],
  admin: [
    "audit:read",
    "certificates:issue",
    "crm:export",
    "crm:read",
    "crm:write",
    "deals:read",
    "deals:write",
    "hq:admin",
    "hr:read",
    "hr:write",
    "revenue:read",
    "revenue:write",
    "tickets:manage",
    "tickets:read",
    "tickets:write",
  ],
  sales: ["crm:read", "crm:write", "deals:read", "deals:write", "revenue:read", "tickets:read"],
  support: ["crm:read", "deals:read", "tickets:manage", "tickets:read", "tickets:write"],
  intern_readonly: ["crm:read", "deals:read", "tickets:read"],
};

type Staff = {
  id: string;
  email: string;
  display_name: string;
  role: keyof typeof CAPABILITIES;
  kind: string;
  is_active: boolean;
  enrolled: boolean;
  last_login_at: string | null;
  created_at: string;
  ends_on: string | null;
  starts_on?: string | null;
  personal_email?: string;
  recovery_codes_remaining?: number;
  manager_id?: string | null;
  probation_ends_on?: string | null;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
};

const STAFF_KINDS = ["founder", "employee", "intern", "contractor"];

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");

const staff: Staff[] = [
  {
    id: "aa000000-0000-4000-8000-00000000000a",
    email: "owner@hq.test",
    display_name: "The Owner",
    role: "owner",
    kind: "founder",
    is_active: true,
    enrolled: true,
    last_login_at: now(),
    created_at: "2026-09-01T09:00:00Z",
    ends_on: null,
  },
  {
    id: "aa000000-0000-4000-8000-00000000000b",
    email: "admin@hq.test",
    display_name: "The Admin",
    role: "admin",
    kind: "employee",
    is_active: true,
    enrolled: true,
    last_login_at: now(),
    created_at: "2026-09-02T09:00:00Z",
    ends_on: null,
  },
  {
    id: "aa000000-0000-4000-8000-00000000000c",
    email: "sales@hq.test",
    display_name: "Sales Person",
    role: "sales",
    kind: "employee",
    is_active: true,
    enrolled: true,
    last_login_at: null,
    created_at: "2026-09-03T09:00:00Z",
    ends_on: null,
  },
  {
    id: "aa000000-0000-4000-8000-00000000000d",
    email: "support@hq.test",
    display_name: "Desk Person",
    role: "support",
    kind: "employee",
    is_active: true,
    enrolled: true,
    last_login_at: null,
    created_at: "2026-09-04T09:00:00Z",
    ends_on: null,
  },
  {
    id: "aa000000-0000-4000-8000-00000000000e",
    email: "intern@hq.test",
    display_name: "The Intern",
    role: "intern_readonly",
    kind: "intern",
    is_active: true,
    enrolled: true,
    last_login_at: null,
    created_at: "2026-09-05T09:00:00Z",
    ends_on: "2026-12-20",
  },
  {
    id: "aa000000-0000-4000-8000-00000000000f",
    email: "newbie@hq.test",
    display_name: "New Starter",
    role: "owner",
    kind: "employee",
    is_active: true,
    enrolled: false,
    last_login_at: null,
    created_at: now(),
    ends_on: null,
  },
  {
    id: "aa000000-0000-4000-8000-000000000010",
    email: "newbie2@hq.test",
    display_name: "Second Starter",
    role: "owner",
    kind: "employee",
    is_active: true,
    enrolled: false,
    last_login_at: null,
    created_at: now(),
    ends_on: null,
  },
];

type Message = {
  id: string;
  author: "customer" | "staff" | "system";
  author_id: string;
  author_name: string;
  visibility: "public" | "internal";
  body: string;
  at: string;
};

type TicketRow = {
  id: string;
  account_id: string;
  contact_email: string;
  subject: string;
  status: "open" | "pending" | "resolved";
  priority: "low" | "normal" | "high" | "urgent";
  assignee_staff_id: string;
  assignee_name: string;
  source: string;
  app_version: string;
  platform: string;
  created_at: string;
  updated_at: string;
  staff_last_read_at: string;
  snoozed_until: string | null;
  linked_issue_url: string;
  tags: string[];
  messages: Message[];
  /** Staff ids watching the thread without owning it. */
  followers: string[];
  /** Times the thread left Resolved — a desk reopen or the customer writing again. */
  reopened_count: number;
  resolved_at: string | null;
  first_replied_at: string | null;
};

type Pending = { staffId: string; kind: "totp" | "enroll"; expires: number };
type Session = {
  id: string;
  staffId: string;
  token: string;
  created_at: string;
  last_seen_at: string;
  sudo_until: string | null;
  revoked_at: string | null;
  ip: string;
  user_agent: string;
};

const pendings = new Map<string, Pending>();
const sessions = new Map<string, Session>();
const auditEvents: Array<Record<string, unknown>> = [];
const invites = new Map<string, { staffId: string }>();

function audit(
  action: string,
  staffId: string | null,
  entity: string,
  entityId: string,
  reason = "",
  detail: Record<string, unknown> = {},
) {
  auditEvents.unshift({
    occurred_at: now(),
    staff_id: staffId ?? "",
    actor_label: staffId ? "" : "system",
    action,
    entity_type: entity,
    entity_id: entityId,
    reason,
    detail,
    correlation_id: `mock-${randomUUID().slice(0, 8)}`,
  });
}

/** Mirrors audit.field_changes: what an update changed, value before and after, as text. */
function changesBetween(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
): Record<string, { from: string; to: string }> {
  const text = (value: unknown) => {
    if (value === null || value === undefined) return "";
    const raw = typeof value === "object" ? JSON.stringify(value) : String(value);
    return raw.length <= 200 ? raw : `${raw.slice(0, 199)}…`;
  };
  const changes: Record<string, { from: string; to: string }> = {};
  for (const key of new Set([...Object.keys(before), ...Object.keys(after)])) {
    if (["updated_at", "entered_stage_at", "last_activity_at"].includes(key)) continue;
    const from = text(before[key]);
    const to = text(after[key]);
    if (from !== to) changes[key] = { from, to };
  }
  return changes;
}

function ok(payload: Record<string, unknown>) {
  return {
    status: 200,
    body: { ok: true, correlation_id: `mock-${randomUUID().slice(0, 12)}`, ...payload },
  };
}

/** The service's rule for every id: GUID-shaped or "not an id" (a SQL conversion error otherwise). */
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function badId(value: unknown): boolean {
  const text = String(value ?? "").trim();
  return text !== "" && !GUID.test(text);
}

function refuse(status: number, code: string, details?: Record<string, unknown>) {
  return {
    status,
    body: {
      ok: false,
      correlation_id: `mock-${randomUUID().slice(0, 12)}`,
      error: { code, message: code, ...(details ? { details } : {}) },
    },
  };
}

function mintPending(staffId: string, kind: "totp" | "enroll") {
  const token = `pending-${kind}-${randomUUID()}`;
  pendings.set(token, { staffId, kind, expires: Date.now() + 5 * 60_000 });
  return token;
}

function pendingFor(token: string, kind: "totp" | "enroll") {
  const record = pendings.get(token);
  if (!record || record.kind !== kind || record.expires < Date.now()) return null;
  return staff.find((row) => row.id === record.staffId) ?? null;
}

/** As the service records a session: the person the portal reports, else what it saw. */
function clientAddress(headers: Record<string, string | string[] | undefined>): string {
  return String(headers["x-qt-client-address"] ?? "") || "203.0.113.9";
}
function clientAgent(headers: Record<string, string | string[] | undefined>): string {
  return String(headers["x-qt-client-agent"] ?? headers["user-agent"] ?? "").slice(0, 400);
}

function mintSession(member: Staff, ip: string, userAgent: string) {
  const token = `hq_mock_${randomUUID().replace(/-/g, "")}`;
  const session: Session = {
    id: randomUUID(),
    staffId: member.id,
    token,
    created_at: now(),
    last_seen_at: now(),
    sudo_until: null,
    revoked_at: null,
    ip,
    user_agent: userAgent,
  };
  sessions.set(token, session);
  member.last_login_at = now();
  audit("auth.login", member.id, "staff", member.id);
  return {
    token,
    session_id: session.id,
    absolute_expires_at: new Date(Date.now() + 12 * 3600_000).toISOString(),
    staff: {
      staff_id: member.id,
      email: member.email,
      display_name: member.display_name,
      role: member.role,
    },
  };
}

/**
 * Mirrors deal_routes.sees_money / without_money: a role without revenue:read reads the
 * pipeline with every money figure null. The board's sort still uses the figures.
 */
function seesMoney(headers: Record<string, string | string[] | undefined>): boolean {
  const found = caller(headers);
  return Boolean(found && (CAPABILITIES[found.member.role] ?? []).includes("revenue:read"));
}
/** Mirrors deal_routes.money_total: summed per currency, never across, null when unseen. */
function moneyByCurrency<T extends { currency: string }>(
  views: T[],
  pick: (view: T) => number,
  money = true,
): Record<string, number> | null {
  if (!money) return null;
  const totals: Record<string, number> = {};
  for (const view of views) totals[view.currency] = (totals[view.currency] ?? 0) + pick(view);
  return Object.fromEntries(
    Object.entries(totals)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, amount]) => [currency, Math.round(amount * 100) / 100]),
  );
}
/** Mirrors revenue_routes.ledger_by_company: what a company pays today, per currency. */
function ledgerMrr(companyId: string, money: boolean): Record<string, number> | null {
  if (!money) return null;
  const today = new Date().toISOString().slice(0, 10);
  const totals: Record<string, number> = {};
  for (const row of movements) {
    if (row.company_id !== companyId || row.effective_on > today) continue;
    totals[row.currency] = (totals[row.currency] ?? 0) + row.cents;
  }
  return Object.fromEntries(
    Object.entries(totals)
      .filter(([, cents]) => cents !== 0)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([currency, cents]) => [currency, cents / 100]),
  );
}
function withoutMoney<T extends { mrr_amount: number | null; weighted_mrr: number | null }>(
  view: T,
  money: boolean,
): T {
  return money ? view : { ...view, mrr_amount: null, weighted_mrr: null };
}

function caller(headers: Record<string, string | string[] | undefined>) {
  const auth = String(headers.authorization ?? "");
  if (!auth.toLowerCase().startsWith("bearer hq_")) return null;
  const session = sessions.get(auth.slice(7));
  if (!session || session.revoked_at) return null;
  session.last_seen_at = now();
  const member = staff.find((row) => row.id === session.staffId);
  return member ? { member, session } : null;
}

/** Mirrors 0009's seeded targets; `hq/settings/sla/update` changes them. */
const SLA_SEED: Record<string, { first: number; next: number }> = {
  urgent: { first: 60, next: 120 },
  high: { first: 240, next: 480 },
  normal: { first: 480, next: 960 },
  low: { first: 1440, next: 2880 },
};
const SLA_TARGETS: Record<string, { first: number; next: number }> = {};

/** Mirrors account_api.hq.auth.device_label: browser and system, never the version. */
const BROWSER_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ["Edg/", "Edge"],
  ["OPR/", "Opera"],
  ["CriOS/", "Chrome"],
  ["FxiOS/", "Firefox"],
  ["Firefox/", "Firefox"],
  ["Chrome/", "Chrome"],
  ["Safari/", "Safari"],
];
const SYSTEM_TOKENS: ReadonlyArray<readonly [string, string]> = [
  ["iPhone", "iOS"],
  ["iPad", "iPadOS"],
  ["Android", "Android"],
  ["CrOS", "ChromeOS"],
  ["Windows", "Windows"],
  ["Mac OS X", "macOS"],
  ["Linux", "Linux"],
];
function deviceLabel(agent: string): string {
  const browser =
    BROWSER_TOKENS.find(([token]) => agent.includes(token))?.[1] ?? "an unrecognised browser";
  const system = SYSTEM_TOKENS.find(([token]) => agent.includes(token))?.[1];
  return system ? `${browser} on ${system}` : browser;
}
/** Most urgent first, the order the service checks and shows them in. */
const SLA_ORDER = ["urgent", "high", "normal", "low"] as const;
const SLA_MIN_MINUTES = 15;
const SLA_MAX_MINUTES = 14 * 24 * 60;
function seedSla() {
  for (const [priority, targets] of Object.entries(SLA_SEED))
    SLA_TARGETS[priority] = { ...targets };
}
seedSla();
function slaView() {
  return SLA_ORDER.map((priority) => ({
    priority,
    first_reply_minutes: SLA_TARGETS[priority]!.first,
    next_reply_minutes: SLA_TARGETS[priority]!.next,
  }));
}

function hoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3600_000).toISOString().replace(/\.\d{3}Z$/, "+00:00");
}

let ticketCounter = 0;
function ticketId(): string {
  ticketCounter += 1;
  return `sup_${String(ticketCounter).padStart(20, "0")}`;
}
let messageCounter = 0;
function messageId(): string {
  messageCounter += 1;
  return `msg_${String(messageCounter).padStart(20, "0")}`;
}

function makeTicket(
  input: Partial<TicketRow> & { subject: string; opened: string; body: string },
): TicketRow {
  const id = ticketId();
  return {
    id,
    account_id: input.account_id ?? "cc000000-0000-4000-8000-000000000001",
    contact_email: input.contact_email ?? "analyst@meridianfund.test",
    subject: input.subject,
    status: input.status ?? "open",
    priority: input.priority ?? "normal",
    assignee_staff_id: input.assignee_staff_id ?? "",
    assignee_name: input.assignee_name ?? "",
    source: input.source ?? "desktop",
    app_version: input.app_version ?? "1.4.2",
    platform: input.platform ?? "macOS",
    created_at: input.opened,
    updated_at: input.updated_at ?? input.opened,
    staff_last_read_at: input.staff_last_read_at ?? "",
    snoozed_until: input.snoozed_until ?? null,
    linked_issue_url: input.linked_issue_url ?? "",
    tags: input.tags ?? [],
    messages: [
      {
        id: messageId(),
        author: "customer",
        author_id: input.account_id ?? "cc000000-0000-4000-8000-000000000001",
        author_name: input.contact_email ?? "analyst@meridianfund.test",
        visibility: "public",
        body: input.body,
        at: input.opened,
      },
      ...(input.messages ?? []),
    ],
    followers: input.followers ?? [],
    reopened_count: input.reopened_count ?? 0,
    resolved_at:
      input.resolved_at ??
      (input.status === "resolved" ? (input.updated_at ?? input.opened) : null),
    first_replied_at:
      input.first_replied_at ??
      (input.messages ?? []).find(
        (message) => message.author === "staff" && message.visibility === "public",
      )?.at ??
      null,
  };
}

const tickets: TicketRow[] = [];
function seedTickets() {
  tickets.length = 0;
  ticketCounter = 0;
  messageCounter = 0;
  tickets.push(
    makeTicket({
      subject: "Export refuses our fiscal calendar",
      body: "Exports land with calendar quarters; our fiscal year ends in June and every figure shifts a quarter.",
      opened: hoursAgo(31),
      priority: "high",
      contact_email: "ops@halcyoncapital.test",
      account_id: "cc000000-0000-4000-8000-000000000002",
      tags: ["exports"],
    }),
    makeTicket({
      subject: "Chart panel blank after wake from sleep",
      body: "Every chart is blank until a restart. Started with 1.4.2 on two machines here.",
      opened: hoursAgo(7),
      priority: "urgent",
      contact_email: "cto@meridianfund.test",
      tags: ["charts", "regression"],
      linked_issue_url: "https://github.com/example/terminal/issues/812",
    }),
    makeTicket({
      subject: "Add a second seat for our new analyst",
      body: "We hired. What is the process for a second seat on our plan?",
      opened: hoursAgo(2),
      contact_email: "founder@bluecrestpartners.test",
      account_id: "cc000000-0000-4000-8000-000000000003",
      tags: ["billing"],
    }),
    makeTicket({
      subject: "Thesis health shows unchecked on one holding",
      body: "One assumption reads unchecked since Tuesday. The field it watches has fresh data.",
      opened: hoursAgo(26),
      status: "pending",
      assignee_name: "Desk Person",
      assignee_staff_id: "aa000000-0000-4000-8000-00000000000d",
      staff_last_read_at: hoursAgo(20),
      updated_at: hoursAgo(20),
      followers: ["aa000000-0000-4000-8000-00000000000a", "aa000000-0000-4000-8000-00000000000d"],
      messages: [
        {
          id: messageId(),
          author: "staff",
          author_id: "aa000000-0000-4000-8000-00000000000d",
          author_name: "Desk Person",
          visibility: "internal",
          body: "Reproduced. The watched field moved vendors; the rule needs re-pointing.",
          at: hoursAgo(21),
        },
        {
          id: messageId(),
          author: "staff",
          author_id: "aa000000-0000-4000-8000-00000000000d",
          author_name: "Desk Person",
          visibility: "public",
          body: "We can see it — one data field moved and the assumption needs re-pointing. Fix lands tomorrow; we will confirm here.",
          at: hoursAgo(20),
        },
      ],
    }),
    makeTicket({
      subject: "Waiting on their compliance sign-off",
      body: "Can you hold our export request until compliance signs the data agreement?",
      opened: hoursAgo(50),
      snoozed_until: new Date(Date.now() + 3 * 86400_000).toISOString(),
      contact_email: "legal@halcyoncapital.test",
      account_id: "cc000000-0000-4000-8000-000000000002",
      staff_last_read_at: hoursAgo(49),
    }),
    makeTicket({
      subject: "Locked out after phone change",
      body: "New phone, old authenticator gone. How do I get back in?",
      opened: hoursAgo(120),
      status: "resolved",
      reopened_count: 1,
      assignee_name: "The Owner",
      assignee_staff_id: "aa000000-0000-4000-8000-00000000000a",
      staff_last_read_at: hoursAgo(118),
      updated_at: hoursAgo(118),
      messages: [
        {
          id: messageId(),
          author: "staff",
          author_id: "aa000000-0000-4000-8000-00000000000a",
          author_name: "The Owner",
          visibility: "public",
          body: "Reset done — sign in with your password and re-enrol the authenticator.",
          at: hoursAgo(119),
        },
        {
          id: messageId(),
          author: "system",
          author_id: "",
          author_name: "The Owner",
          visibility: "public",
          body: "Marked resolved",
          at: hoursAgo(118),
        },
      ],
    }),
  );
}
seedTickets();

const savedReplies: Array<{
  reply_id: string;
  title: string;
  body: string;
  uses: number;
  updated_at: string;
  archived: boolean;
}> = [];
function seedSavedReplies() {
  savedReplies.length = 0;
  savedReplies.push(
    {
      reply_id: randomUUID(),
      title: "Export steps",
      body: "Settings, then Data, then Export. The file lands in your downloads folder.",
      uses: 4,
      updated_at: now(),
      archived: false,
    },
    {
      reply_id: randomUUID(),
      title: "Authenticator reset",
      body: "We have reset your sign-in. Sign in with your password; it will walk you through enrolling the new device.",
      uses: 2,
      updated_at: now(),
      archived: false,
    },
  );
}
seedSavedReplies();

function publicMessages(row: TicketRow): Message[] {
  return row.messages.filter((message) => message.visibility !== "internal");
}

function slaFor(row: TicketRow): {
  timer: string;
  due_at: string | null;
  status: string;
  minutes_remaining: number | null;
} {
  if (row.status === "resolved")
    return { timer: "none", due_at: null, status: "none", minutes_remaining: null };
  if (row.snoozed_until && new Date(row.snoozed_until).getTime() > Date.now())
    return { timer: "none", due_at: null, status: "paused", minutes_remaining: null };
  if (row.status === "pending")
    return { timer: "none", due_at: null, status: "paused", minutes_remaining: null };
  const targets = SLA_TARGETS[row.priority] ?? SLA_TARGETS.normal!;
  const firstStaff = publicMessages(row).find((message) => message.author === "staff");
  const anchorAt = firstStaff
    ? [...publicMessages(row)].reverse().find((message) => message.author === "customer")?.at
    : row.created_at;
  if (!anchorAt) return { timer: "none", due_at: null, status: "none", minutes_remaining: null };
  const minutes = firstStaff ? targets.next : targets.first;
  const due = new Date(new Date(anchorAt).getTime() + minutes * 60_000);
  const remaining = Math.round((due.getTime() - Date.now()) / 60_000);
  const status = remaining <= 0 ? "breached" : remaining <= minutes * 0.2 ? "at-risk" : "healthy";
  return {
    timer: firstStaff ? "next-reply" : "first-reply",
    due_at: due.toISOString(),
    status,
    minutes_remaining: remaining,
  };
}

const DESK_MAX_DAYS = 90;
const DESK_RULES: {
  nudge_days: number;
  autoclose_days: number;
  alert_assignee: boolean;
  assign_pool: string[];
  last_sweep_at: string | null;
} = {
  nudge_days: 3,
  autoclose_days: 7,
  alert_assignee: true,
  assign_pool: [],
  last_sweep_at: null,
};
const alertsSent = new Set<string>();
let lastDeskPass = 0;

function resetDeskRules() {
  Object.assign(DESK_RULES, {
    nudge_days: 3,
    autoclose_days: 7,
    alert_assignee: true,
    assign_pool: [],
    last_sweep_at: null,
  });
  alertsSent.clear();
  lastDeskPass = 0;
}

function deskRulesView() {
  return { ...DESK_RULES, assign_pool: [...DESK_RULES.assign_pool], max_days: DESK_MAX_DAYS };
}

function lastPublicStaffAt(row: TicketRow): string | null {
  const stamps = row.messages
    .filter((message) => message.author === "staff" && message.visibility === "public")
    .map((message) => message.at)
    .sort();
  return stamps[stamps.length - 1] ?? null;
}

/** As the service's desk_sweeper: assign, then close, then nudge, then alert. */
function sweepDesk() {
  const at = now();
  const nowMs = Date.now();
  const days = (iso: string) => (nowMs - Date.parse(iso)) / 86_400_000;
  const systemLine = (body: string, visibility: Message["visibility"] = "public"): Message => ({
    id: messageId(),
    author: "system",
    author_id: "",
    author_name: "desk rules",
    visibility,
    body,
    at,
  });
  if (DESK_RULES.assign_pool.length > 0) {
    const openCounts = new Map<string, number>();
    for (const row of tickets) {
      if (row.status !== "resolved" && row.assignee_staff_id)
        openCounts.set(row.assignee_staff_id, (openCounts.get(row.assignee_staff_id) ?? 0) + 1);
    }
    for (const row of tickets) {
      if (row.status === "resolved" || row.assignee_staff_id) continue;
      const members = DESK_RULES.assign_pool
        .map((id) => staff.find((candidate) => candidate.id === id && candidate.is_active))
        .filter((member): member is Staff => Boolean(member))
        .sort(
          (a, b) =>
            (openCounts.get(a.id) ?? 0) - (openCounts.get(b.id) ?? 0) ||
            a.display_name.toLowerCase().localeCompare(b.display_name.toLowerCase()) ||
            a.id.localeCompare(b.id),
        );
      const member = members[0];
      if (!member) break;
      row.assignee_staff_id = member.id;
      row.assignee_name = member.display_name;
      row.messages.push(systemLine("Assigned to Support Team"));
      row.updated_at = at;
      openCounts.set(member.id, (openCounts.get(member.id) ?? 0) + 1);
      audit("ticket.auto_assigned", null, "ticket", row.id, "", {
        assignee: member.display_name,
        assignee_staff_id: member.id,
      });
    }
  }
  for (const row of tickets) {
    if (row.status !== "pending") continue;
    if (row.snoozed_until && Date.parse(row.snoozed_until) > nowMs) continue;
    const lastStaff = lastPublicStaffAt(row);
    if (!lastStaff) continue;
    const waited = days(lastStaff);
    if (DESK_RULES.autoclose_days && waited >= DESK_RULES.autoclose_days) {
      row.messages.push(
        systemLine(
          `Closed after ${DESK_RULES.autoclose_days} days without a reply. If this is still a problem, reply here and it reopens on our side.`,
        ),
      );
      row.status = "resolved";
      row.resolved_at = at;
      row.snoozed_until = null;
      row.updated_at = at;
      audit("ticket.auto_closed", null, "ticket", row.id, "", {
        waited_days: Math.round(waited * 10) / 10,
      });
      continue;
    }
    const nudged = row.messages.some(
      (message) =>
        message.author === "system" &&
        message.visibility === "public" &&
        message.body.startsWith("Still there?") &&
        message.at >= lastStaff,
    );
    if (DESK_RULES.nudge_days && waited >= DESK_RULES.nudge_days && !nudged) {
      const remaining = DESK_RULES.autoclose_days - DESK_RULES.nudge_days;
      row.messages.push(
        systemLine(
          DESK_RULES.autoclose_days > DESK_RULES.nudge_days
            ? `Still there? We have not heard back since our last message. Reply here and this conversation carries on where it left off; otherwise it closes in ${remaining} ${remaining === 1 ? "day" : "days"}.`
            : "Still there? We have not heard back since our last message. Reply here and this conversation carries on where it left off.",
        ),
      );
      row.updated_at = at;
      audit("ticket.auto_nudged", null, "ticket", row.id, "", {
        waited_days: Math.round(waited * 10) / 10,
      });
    }
  }
  if (DESK_RULES.alert_assignee) {
    for (const row of tickets) {
      if (row.status === "resolved" || !row.assignee_staff_id) continue;
      const sla = slaFor(row);
      if ((sla.status !== "at-risk" && sla.status !== "breached") || !sla.due_at) continue;
      const key = `${row.id}:${sla.status}:${sla.due_at}`;
      if (alertsSent.has(key)) continue;
      alertsSent.add(key);
      // The mock sends no mail; the audit row is the record the service would also write.
      audit("ticket.alerted", null, "ticket", row.id, "", {
        state: sla.status,
        timer: sla.timer,
        assignee_staff_id: row.assignee_staff_id,
        mailed: false,
      });
    }
  }
  DESK_RULES.last_sweep_at = at;
}

function sweepDeskIfStale() {
  if (Date.now() - lastDeskPass < 15 * 60_000) return;
  lastDeskPass = Date.now();
  sweepDesk();
}

function ticketSummary(row: TicketRow, viewer = "") {
  const pub = publicMessages(row);
  const last = pub[pub.length - 1];
  const snoozed = Boolean(row.snoozed_until && new Date(row.snoozed_until).getTime() > Date.now());
  const lastCustomer = [...pub].reverse().find((message) => message.author === "customer");
  return {
    id: row.id,
    subject: row.subject,
    status: row.status,
    snoozed,
    snoozed_until: snoozed ? row.snoozed_until : null,
    priority: row.priority,
    source: row.source,
    account_id: row.account_id,
    contact_email: row.contact_email,
    assignee_staff_id: row.assignee_staff_id,
    assignee_name: row.assignee_name,
    tags: [...row.tags].sort(),
    created_at: row.created_at,
    updated_at: row.updated_at,
    message_count: pub.length,
    notes_count: row.messages.length - pub.length,
    last_author: last?.author ?? "",
    last_at: last?.at ?? "",
    unread: Boolean(
      lastCustomer && (!row.staff_last_read_at || row.staff_last_read_at < lastCustomer.at),
    ),
    linked_issue_url: row.linked_issue_url,
    reopened_count: row.reopened_count,
    followers: [...row.followers].sort(),
    following: Boolean(viewer) && row.followers.includes(viewer),
    sla: slaFor(row),
  };
}

function ticketView(row: TicketRow, viewer = "") {
  return {
    ...ticketSummary(row, viewer),
    app_version: row.app_version,
    platform: row.platform,
    messages: row.messages.map((message) => ({
      id: message.id,
      author: message.author,
      author_name: message.author_name,
      visibility: message.visibility,
      body: message.body,
      at: message.at,
    })),
  };
}

const ACCOUNT_PROFILES: Record<string, { email: string; name: string; plan: string }> = {
  "cc000000-0000-4000-8000-000000000001": {
    email: "analyst@meridianfund.test",
    name: "Meridian Fund",
    plan: "desk",
  },
  "cc000000-0000-4000-8000-000000000002": {
    email: "ops@halcyoncapital.test",
    name: "Halcyon Capital",
    plan: "teams",
  },
  "cc000000-0000-4000-8000-000000000003": {
    email: "founder@bluecrestpartners.test",
    name: "Bluecrest Partners",
    plan: "pro",
  },
};

const RECOVERY_CODES = Array.from({ length: 10 }, (_, index) => `mockr-code${index}`);

type Handler = (context: {
  method: string;
  route: string;
  params: Record<string, string>;
  query: Record<string, string>;
  body: Record<string, unknown>;
  headers: Record<string, string | string[] | undefined>;
}) => { status: number; body: unknown };

function staffView(member: Staff) {
  return {
    staff_id: member.id,
    email: member.email,
    display_name: member.display_name,
    role: member.role,
    kind: member.kind,
    is_active: member.is_active,
    starts_on: member.starts_on ?? null,
    ends_on: member.ends_on,
    last_login_at: member.last_login_at,
    created_at: member.created_at,
    totp_enrolled: member.enrolled,
  };
}

const routes: Array<{
  method: string;
  pattern: string;
  handler: Handler;
  auth?: boolean;
  capability?: string;
  sudo?: boolean;
}> = [
  {
    method: "POST",
    pattern: "hq/auth/login",
    handler: ({ body, headers }) => {
      const email = String(body.email ?? "").toLowerCase();
      const password = String(body.password ?? "");
      const member = staff.find((row) => row.email === email);
      if (!member || !member.is_active || password.length < 8)
        return refuse(401, "unauthenticated");
      const kind = member.enrolled ? "totp" : "enroll";
      void headers;
      return ok({ mfa: kind, pending_token: mintPending(member.id, kind) });
    },
  },
  {
    method: "POST",
    pattern: "hq/auth/totp",
    handler: ({ body, headers }) => {
      const member = pendingFor(String(body.pending_token ?? ""), "totp");
      if (!member) return refuse(401, "unauthenticated");
      if (String(body.code ?? "") !== "000000") return refuse(401, "unauthenticated");
      return ok(mintSession(member, clientAddress(headers), clientAgent(headers)));
    },
  },
  {
    method: "POST",
    pattern: "hq/auth/recovery",
    handler: ({ body, headers }) => {
      const member = pendingFor(String(body.pending_token ?? ""), "totp");
      if (!member) return refuse(401, "unauthenticated");
      if (!RECOVERY_CODES.includes(String(body.recovery_code ?? "")))
        return refuse(401, "unauthenticated");
      return ok(mintSession(member, clientAddress(headers), clientAgent(headers)));
    },
  },
  {
    method: "POST",
    pattern: "hq/auth/enroll/begin",
    handler: ({ body }) => {
      const member = pendingFor(String(body.pending_token ?? ""), "enroll");
      if (!member) return refuse(401, "unauthenticated");
      if (member.enrolled) return refuse(403, "forbidden");
      return ok({
        secret: "MOCKSECRETBASE32AAAA",
        otpauth_uri: `otpauth://totp/Quantify%20HQ:${encodeURIComponent(member.email)}?secret=MOCKSECRETBASE32AAAA&issuer=Quantify%20HQ`,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/auth/enroll/confirm",
    handler: ({ body, headers }) => {
      const member = pendingFor(String(body.pending_token ?? ""), "enroll");
      if (!member) return refuse(401, "unauthenticated");
      if (String(body.code ?? "") !== "000000") return refuse(401, "unauthenticated");
      member.enrolled = true;
      audit("auth.totp_enrolled", member.id, "staff", member.id);
      return ok({
        ...mintSession(member, clientAddress(headers), clientAgent(headers)),
        recovery_codes: RECOVERY_CODES,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/auth/invite/accept",
    handler: ({ body }) => {
      const invite = invites.get(String(body.token ?? ""));
      if (!invite || String(body.password ?? "").length < 12) return refuse(401, "unauthenticated");
      const breached = breachedRefusal(String(body.password ?? ""));
      if (breached) return breached;
      invites.delete(String(body.token ?? ""));
      const member = staff.find((row) => row.id === invite.staffId);
      if (!member) return refuse(401, "unauthenticated");
      member.is_active = true;
      audit("auth.invite_accepted", member.id, "staff", member.id);
      return ok({ mfa: "enroll", pending_token: mintPending(member.id, "enroll") });
    },
  },
  { method: "POST", pattern: "hq/auth/forgot", handler: () => ok({ sent: true }) },
  {
    method: "POST",
    pattern: "hq/auth/reset",
    handler: ({ body }) => {
      if (String(body.password ?? "").length < 12) return refuse(400, "malformed_request");
      const breached = breachedRefusal(String(body.password ?? ""));
      if (breached) return breached;
      return String(body.token ?? "").startsWith("mock-reset-")
        ? ok({ reset: true })
        : refuse(401, "unauthenticated");
    },
  },
  {
    method: "GET",
    pattern: "hq/me",
    auth: true,
    handler: ({ headers }) => {
      const found = caller(headers)!;
      const sudoFresh = Boolean(found.session.sudo_until && found.session.sudo_until > now());
      return ok({
        staff: {
          staff_id: found.member.id,
          email: found.member.email,
          display_name: found.member.display_name,
          role: found.member.role,
          kind: found.member.kind,
        },
        role: found.member.role,
        capabilities: CAPABILITIES[found.member.role] ?? [],
        sudo_fresh: sudoFresh,
        sudo_until: found.session.sudo_until,
        recovery_codes_remaining: found.member.recovery_codes_remaining ?? 10,
        session_policy: {
          idle_minutes: ["owner", "admin"].includes(found.member.role) ? 15 : 30,
          absolute_hours: 12,
        },
        environment: "mock",
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/auth/sudo",
    auth: true,
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      if (String(body.code ?? "") !== "000000") return refuse(401, "unauthenticated");
      found.session.sudo_until = new Date(Date.now() + 10 * 60_000).toISOString();
      audit("auth.sudo", found.member.id, "staff", found.member.id);
      return ok({ sudo_until: found.session.sudo_until });
    },
  },
  {
    method: "POST",
    pattern: "hq/auth/recovery/regenerate",
    auth: true,
    sudo: true,
    handler: ({ headers }) => {
      const found = caller(headers)!;
      const codes = Array.from({ length: 10 }, () =>
        `${randomUUID().slice(0, 5)}-${randomUUID().slice(0, 5)}`.toUpperCase(),
      );
      found.member.recovery_codes_remaining = 10;
      audit("auth.recovery_codes_regenerated", found.member.id, "staff", found.member.id);
      return ok({ recovery_codes: codes, remaining: 10, shown_once: ["recovery_codes"] });
    },
  },
  {
    method: "POST",
    pattern: "hq/auth/logout",
    auth: true,
    handler: ({ headers }) => {
      const found = caller(headers)!;
      found.session.revoked_at = now();
      audit("auth.logout", found.member.id, "staff", found.member.id);
      return ok({ signed_out: true });
    },
  },
  {
    method: "POST",
    pattern: "hq/auth/password",
    auth: true,
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      if (String(body.current_password ?? "").length < 8) return refuse(401, "unauthenticated");
      if (String(body.new_password ?? "").length < 12) return refuse(400, "malformed_request");
      const breached = breachedRefusal(String(body.new_password ?? ""));
      if (breached) return breached;
      let revoked = 0;
      for (const session of sessions.values()) {
        if (
          session.staffId === found.member.id &&
          session.id !== found.session.id &&
          !session.revoked_at
        ) {
          session.revoked_at = now();
          revoked += 1;
        }
      }
      audit("auth.password_changed", found.member.id, "staff", found.member.id);
      return ok({ changed: true, other_sessions_revoked: revoked });
    },
  },
  {
    method: "GET",
    pattern: "hq/sessions",
    auth: true,
    handler: ({ headers }) => {
      const found = caller(headers)!;
      const rows = [...sessions.values()]
        .filter((session) => session.staffId === found.member.id)
        .map((session) => ({
          session_id: session.id,
          created_at: session.created_at,
          last_seen_at: session.last_seen_at,
          ip: session.ip,
          user_agent: session.user_agent,
          device: deviceLabel(session.user_agent),
          current: session.id === found.session.id,
          revoked_at: session.revoked_at,
          live: !session.revoked_at,
          ended: session.revoked_at ? "revoked" : "",
        }));
      return ok({ sessions: rows });
    },
  },
  {
    method: "POST",
    pattern: "hq/sessions/revoke",
    auth: true,
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const target = [...sessions.values()].find(
        (session) =>
          session.id === String(body.session_id ?? "") && session.staffId === found.member.id,
      );
      if (!target) return refuse(404, "not_found");
      target.revoked_at = now();
      audit("auth.session_revoked", found.member.id, "hq_session", target.id);
      return ok({ revoked: true });
    },
  },
  {
    method: "GET",
    pattern: "hq/directory",
    auth: true,
    handler: () =>
      ok({
        staff: staff
          .slice()
          .sort((a, b) => a.display_name.localeCompare(b.display_name))
          .map((member) => ({
            staff_id: member.id,
            display_name: member.display_name,
            kind: member.kind,
            is_active: member.is_active,
          })),
      }),
  },
  {
    method: "GET",
    pattern: "hq/roles/matrix",
    auth: true,
    handler: () =>
      ok({ roles: CAPABILITIES, grantable_by_admin: ["sales", "support", "intern_readonly"] }),
  },
  {
    method: "GET",
    pattern: "hq/staff",
    auth: true,
    capability: "hq:admin",
    handler: () => ok({ staff: staff.map(staffView) }),
  },
  {
    method: "POST",
    pattern: "hq/staff/invite",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const email = String(body.email ?? "").toLowerCase();
      const role = String(body.role ?? "");
      if (!email.includes("@") || !(role in CAPABILITIES)) return refuse(400, "malformed_request");
      if (["owner", "admin"].includes(role) && found.member.role !== "owner")
        return refuse(403, "forbidden");
      if (staff.some((row) => row.email === email)) return refuse(400, "malformed_request");
      const member: Staff = {
        id: randomUUID(),
        email,
        display_name: String(body.display_name ?? ""),
        role: role as Staff["role"],
        kind: String(body.kind ?? "employee"),
        is_active: false,
        enrolled: false,
        last_login_at: null,
        created_at: now(),
        ends_on: typeof body.ends_on === "string" && body.ends_on ? body.ends_on : null,
        starts_on: typeof body.starts_on === "string" && body.starts_on ? body.starts_on : null,
        personal_email: String(body.personal_email ?? ""),
      };
      if (!STAFF_KINDS.includes(member.kind))
        return refuse(400, "malformed_request", { kind: `one of ${STAFF_KINDS.join(", ")}` });
      staff.push(member);
      const token = `hqi_mock_${randomUUID().replace(/-/g, "")}`;
      invites.set(token, { staffId: member.id });
      audit("staff.invited", found.member.id, "staff", member.id);
      return ok({
        staff_id: member.id,
        invite_url: `http://127.0.0.1:3000/reset-password?invite=${token}`,
        emailed: false,
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/staff/{staff_id}",
    auth: true,
    capability: "hq:admin",
    handler: ({ params }) => {
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      const live = [...sessions.values()].filter(
        (session) => session.staffId === member.id && !session.revoked_at,
      );
      return ok({
        staff: {
          ...staffView(member),
          live_sessions: live.length,
          personal_email: member.personal_email ?? "",
          joined: member.enrolled || Boolean(member.last_login_at),
        },
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/staff/{staff_id}/update",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      if (
        member.id === found.member.id &&
        ["starts_on", "ends_on", "kind"].some((name) => name in body)
      )
        return refuse(403, "forbidden", { reason: "own-engagement" });
      if (
        ["owner", "admin"].includes(member.role) &&
        found.member.role !== "owner" &&
        member.id !== found.member.id
      )
        return refuse(403, "forbidden", { required_role: "owner" });
      const endsPast =
        "ends_on" in body &&
        String(body.ends_on ?? "") !== "" &&
        String(body.ends_on) < new Date().toISOString().slice(0, 10);
      const demotesOwner = member.role === "owner" && Boolean(body.role) && body.role !== "owner";
      if ((endsPast || demotesOwner) && lastActiveOwner(member))
        return refuse(409, "last_owner_protected");
      let changed = false;
      const role = String(body.role ?? "");
      if (role && role !== member.role) {
        if (member.id === found.member.id) return refuse(403, "forbidden", { reason: "own-role" });
        if (!(role in CAPABILITIES))
          return refuse(400, "malformed_request", { role: "unknown role" });
        if (["owner", "admin"].includes(role) && found.member.role !== "owner")
          return refuse(403, "forbidden", { required_role: "owner" });
        if (member.role === "owner" && found.member.role !== "owner")
          return refuse(403, "forbidden", { required_role: "owner" });
        member.role = role as Staff["role"];
        changed = true;
        audit("staff.role_changed", found.member.id, "staff", member.id, String(body.reason ?? ""));
      }
      if (typeof body.display_name === "string") {
        member.display_name = body.display_name.trim();
        changed = true;
      }
      if (typeof body.kind === "string") {
        if (!STAFF_KINDS.includes(body.kind))
          return refuse(400, "malformed_request", { kind: `one of ${STAFF_KINDS.join(", ")}` });
        member.kind = body.kind;
        changed = true;
      }
      if ("starts_on" in body) {
        member.starts_on = String(body.starts_on ?? "") || null;
        changed = true;
      }
      if ("ends_on" in body) {
        member.ends_on = String(body.ends_on ?? "") || null;
        changed = true;
      }
      if (typeof body.personal_email === "string") {
        member.personal_email = body.personal_email.trim();
        changed = true;
      }
      if (!changed) return refuse(400, "malformed_request", { body: "nothing to change" });
      if (!role || role === member.role)
        audit("staff.updated", found.member.id, "staff", member.id);
      return ok({ staff: staffView(member) });
    },
  },
  {
    method: "POST",
    pattern: "hq/staff/{staff_id}/deactivate",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      if (member.id === found.member.id) return refuse(403, "forbidden", { reason: "own-account" });
      if (["owner", "admin"].includes(member.role) && found.member.role !== "owner")
        return refuse(403, "forbidden", { required_role: "owner" });
      if (!String(body.reason ?? "").trim())
        return refuse(400, "malformed_request", { reason: "a reason is required" });
      if (lastActiveOwner(member)) return refuse(409, "last_owner_protected");
      member.is_active = false;
      audit("staff.deactivated", found.member.id, "staff", member.id, String(body.reason));
      return ok({ deactivated: true, sessions_revoked: 0 });
    },
  },
  {
    method: "POST",
    pattern: "hq/staff/{staff_id}/reactivate",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, params }) => {
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      if (["owner", "admin"].includes(member.role) && caller(headers)!.member.role !== "owner")
        return refuse(403, "forbidden", { required_role: "owner" });
      member.is_active = true;
      audit("staff.reactivated", caller(headers)!.member.id, "staff", member.id);
      return ok({ reactivated: true });
    },
  },
  {
    method: "POST",
    pattern: "hq/staff/{staff_id}/reinvite",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, params }) => {
      const found = caller(headers)!;
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      if (member.is_active || member.enrolled || member.last_login_at)
        return refuse(400, "malformed_request", { reason: "already-joined" });
      if (["owner", "admin"].includes(member.role) && found.member.role !== "owner")
        return refuse(403, "forbidden", { required_role: "owner" });
      for (const [token, invite] of invites)
        if (invite.staffId === member.id) invites.delete(token);
      const token = `hqi_mock_${randomUUID().replace(/-/g, "")}`;
      invites.set(token, { staffId: member.id });
      audit("staff.reinvited", found.member.id, "staff", member.id);
      return ok({
        staff_id: member.id,
        invite_url: `http://127.0.0.1:3000/reset-password?invite=${token}`,
        emailed: false,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/staff/{staff_id}/totp/reset",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, params }) => {
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      const self = caller(headers)!.member;
      if (
        ["owner", "admin"].includes(member.role) &&
        self.role !== "owner" &&
        self.id !== member.id
      )
        return refuse(403, "forbidden", { required_role: "owner" });
      member.enrolled = false;
      audit("staff.totp_reset", caller(headers)!.member.id, "staff", member.id);
      return ok({ reset: true, sessions_revoked: 0 });
    },
  },
  {
    method: "GET",
    pattern: "hq/tickets",
    auth: true,
    capability: "tickets:read",
    handler: ({ query, headers }) => {
      const viewer = caller(headers)!.member.id;
      sweepDeskIfStale();
      const summaries = tickets.map((row) => ticketSummary(row, viewer));
      const visible = summaries.filter((summary) => {
        if (query.following && !summary.following) return false;
        if (query.status === "snoozed") {
          if (!summary.snoozed) return false;
        } else if (query.status) {
          if (summary.status !== query.status || summary.snoozed) return false;
        }
        if (query.priority && summary.priority !== query.priority) return false;
        if (query.assignee === "unassigned") {
          if (summary.assignee_staff_id) return false;
        } else if (query.assignee && summary.assignee_staff_id !== query.assignee) return false;
        if (query.tag && !summary.tags.includes(query.tag)) return false;
        if (query.sla && summary.sla.status !== query.sla) return false;
        if (query.q) {
          const haystack =
            `${summary.subject} ${summary.contact_email} ${summary.id}`.toLowerCase();
          if (!haystack.includes(query.q.toLowerCase())) return false;
        }
        return true;
      });
      const slaRank: Record<string, number> = {
        breached: 0,
        "at-risk": 1,
        healthy: 2,
        paused: 3,
        none: 4,
      };
      const priorityRank: Record<string, number> = { urgent: 0, high: 1, normal: 2, low: 3 };
      visible.sort((left, right) => {
        const resolved = Number(left.status === "resolved") - Number(right.status === "resolved");
        if (resolved !== 0) return resolved;
        const sla = (slaRank[left.sla.status] ?? 5) - (slaRank[right.sla.status] ?? 5);
        if (sla !== 0) return sla;
        const priority = (priorityRank[left.priority] ?? 5) - (priorityRank[right.priority] ?? 5);
        if (priority !== 0) return priority;
        return left.updated_at.localeCompare(right.updated_at);
      });
      return ok({
        tickets: visible,
        counts: {
          open: summaries.filter((s2) => s2.status === "open" && !s2.snoozed).length,
          pending: summaries.filter((s2) => s2.status === "pending").length,
          resolved: summaries.filter((s2) => s2.status === "resolved").length,
          snoozed: summaries.filter((s2) => s2.snoozed).length,
          unassigned: summaries.filter((s2) => !s2.assignee_staff_id && s2.status !== "resolved")
            .length,
          breached: summaries.filter((s2) => s2.sla.status === "breached").length,
          at_risk: summaries.filter((s2) => s2.sla.status === "at-risk").length,
          unread: summaries.filter((s2) => s2.unread).length,
        },
        statuses: ["open", "pending", "resolved", "snoozed"],
        priorities: ["low", "normal", "high", "urgent"],
        sla_states: ["breached", "at-risk", "healthy", "paused"],
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/tickets/open",
    auth: true,
    capability: "tickets:manage",
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const accountId = String(body.account_id ?? "").trim();
      const subject = String(body.subject ?? "").trim();
      const text = String(body.body ?? "").trim();
      if (badId(accountId)) return refuse(400, "malformed_request", { account_id: "not an id" });
      if (!accountId || !text) return refuse(400, "malformed_request");
      const opened = now();
      const row: TicketRow = {
        id: ticketId(),
        account_id: accountId,
        contact_email: ACCOUNT_PROFILES[accountId]?.email ?? "",
        subject: subject || text.split("\n")[0]!.slice(0, 200),
        status: "pending",
        priority: "normal",
        assignee_staff_id: found.member.id,
        assignee_name: found.member.display_name,
        source: "hq",
        app_version: "",
        platform: "",
        created_at: opened,
        updated_at: opened,
        staff_last_read_at: opened,
        snoozed_until: null,
        linked_issue_url: "",
        tags: [],
        messages: [
          {
            id: messageId(),
            author: "staff",
            author_id: found.member.id,
            author_name: found.member.display_name,
            visibility: "public",
            body: text,
            at: opened,
          },
        ],
        followers: [],
        reopened_count: 0,
        resolved_at: null,
        // The desk wrote first, so the first reply is the opening message.
        first_replied_at: opened,
      };
      tickets.push(row);
      audit("ticket.opened", found.member.id, "ticket", row.id);
      return ok({ ticket: ticketView(row, found.member.id) });
    },
  },
  {
    method: "GET",
    pattern: "hq/tickets/{ticket_id}",
    auth: true,
    capability: "tickets:read",
    handler: ({ params, headers }) => {
      const row = tickets.find((ticket) => ticket.id === params.ticket_id);
      if (!row) return refuse(404, "not_found");
      row.staff_last_read_at = now();
      return ok({ ticket: ticketView(row, caller(headers)!.member.id) });
    },
  },
  {
    method: "GET",
    pattern: "hq/tickets/{ticket_id}/context",
    auth: true,
    capability: "tickets:read",
    handler: ({ params }) => {
      const row = tickets.find((ticket) => ticket.id === params.ticket_id);
      if (!row) return refuse(404, "not_found");
      const profile = ACCOUNT_PROFILES[row.account_id];
      return ok({
        account: profile
          ? {
              account_id: row.account_id,
              email: profile.email,
              name: profile.name,
              plan: profile.plan,
              is_active: true,
              created_at: "2026-08-01T00:00:00Z",
              last_login_at: hoursAgo(4),
            }
          : null,
        app_version: row.app_version,
        platform: row.platform,
        related_tickets: tickets
          .filter((ticket) => ticket.account_id === row.account_id && ticket.id !== row.id)
          .map((ticket) => ({
            id: ticket.id,
            subject: ticket.subject,
            status: ticket.status,
            updated_at: ticket.updated_at,
          })),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/tickets/{ticket_id}/reply",
    auth: true,
    capability: "tickets:write",
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = tickets.find((ticket) => ticket.id === params.ticket_id);
      if (!row) return refuse(404, "not_found");
      const text = String(body.body ?? "").trim();
      if (!text) return refuse(400, "malformed_request");
      const at = now();
      row.messages.push({
        id: messageId(),
        author: "staff",
        author_id: found.member.id,
        author_name: found.member.display_name,
        visibility: "public",
        body: text,
        at,
      });
      row.status = "pending";
      row.updated_at = at;
      row.staff_last_read_at = at;
      if (!row.first_replied_at) row.first_replied_at = at;
      audit("ticket.replied", found.member.id, "ticket", row.id);
      return ok({ ticket: ticketView(row, found.member.id) });
    },
  },
  {
    method: "POST",
    pattern: "hq/tickets/{ticket_id}/note",
    auth: true,
    capability: "tickets:write",
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = tickets.find((ticket) => ticket.id === params.ticket_id);
      if (!row) return refuse(404, "not_found");
      const text = String(body.body ?? "").trim();
      if (!text) return refuse(400, "malformed_request");
      const at = now();
      row.messages.push({
        id: messageId(),
        author: "staff",
        author_id: found.member.id,
        author_name: found.member.display_name,
        visibility: "internal",
        body: text,
        at,
      });
      row.updated_at = at;
      audit("ticket.noted", found.member.id, "ticket", row.id);
      return ok({ ticket: ticketView(row, found.member.id) });
    },
  },
  {
    method: "POST",
    pattern: "hq/tickets/{ticket_id}/manage",
    auth: true,
    capability: "tickets:manage",
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = tickets.find((ticket) => ticket.id === params.ticket_id);
      if (!row) return refuse(404, "not_found");
      if ("assignee_staff_id" in body) {
        const assignee = String(body.assignee_staff_id ?? "").trim();
        if (assignee) {
          const member = staff.find(
            (candidate) => candidate.id === assignee && candidate.is_active,
          );
          if (!member) return refuse(400, "malformed_request");
          row.assignee_staff_id = member.id;
          row.assignee_name = member.display_name;
        } else {
          row.assignee_staff_id = "";
          row.assignee_name = "";
        }
      }
      if (body.priority) {
        const priority = String(body.priority);
        if (!(priority in SLA_TARGETS)) return refuse(400, "malformed_request");
        row.priority = priority as TicketRow["priority"];
      }
      if (body.status) {
        const status = String(body.status);
        if (!["open", "pending", "resolved"].includes(status))
          return refuse(400, "malformed_request");
        // As the service: leaving Resolved is a reopen; resolving again moves the stamp.
        if (row.status === "resolved" && status !== "resolved") row.reopened_count += 1;
        if (status === "resolved" && row.status !== "resolved") row.resolved_at = now();
        row.status = status as TicketRow["status"];
        row.messages.push({
          id: messageId(),
          author: "system",
          author_id: "",
          author_name: found.member.display_name,
          visibility: "public",
          body: `Marked ${status}`,
          at: now(),
        });
      }
      if ("tags" in body) {
        if (!Array.isArray(body.tags)) return refuse(400, "malformed_request");
        row.tags = [
          ...new Set(body.tags.map((tag) => String(tag).trim().toLowerCase()).filter(Boolean)),
        ].sort();
      }
      if ("snoozed_until" in body) {
        const raw = String(body.snoozed_until ?? "").trim();
        if (!raw) row.snoozed_until = null;
        else {
          const until = new Date(raw);
          if (Number.isNaN(until.getTime()) || until.getTime() <= Date.now()) {
            return refuse(400, "malformed_request");
          }
          row.snoozed_until = until.toISOString();
        }
      }
      if ("linked_issue_url" in body) {
        const raw = String(body.linked_issue_url ?? "").trim();
        if (raw && !raw.startsWith("http")) return refuse(400, "malformed_request");
        row.linked_issue_url = raw;
      }
      row.updated_at = now();
      audit("ticket.managed", found.member.id, "ticket", row.id);
      return ok({ ticket: ticketView(row, found.member.id) });
    },
  },
  {
    method: "POST",
    pattern: "hq/tickets/{ticket_id}/follow",
    auth: true,
    capability: "tickets:read",
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = tickets.find((ticket) => ticket.id === params.ticket_id);
      if (!row) return refuse(404, "not_found");
      const following = body.following === true;
      row.followers = row.followers.filter((id) => id !== found.member.id);
      if (following) row.followers.push(found.member.id);
      audit(following ? "ticket.followed" : "ticket.unfollowed", found.member.id, "ticket", row.id);
      return ok({ ticket: ticketView(row, found.member.id) });
    },
  },
  {
    method: "POST",
    pattern: "hq/tickets/{ticket_id}/merge",
    auth: true,
    capability: "tickets:manage",
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const duplicate = tickets.find((ticket) => ticket.id === params.ticket_id);
      if (!duplicate) return refuse(404, "not_found");
      const into = String(body.into ?? "").trim();
      if (!into || into === duplicate.id) return refuse(400, "malformed_request");
      const kept = tickets.find((ticket) => ticket.id === into);
      if (!kept) return refuse(404, "not_found");
      if (duplicate.status === "resolved" || kept.status === "resolved")
        return refuse(400, "malformed_request");
      const at = now();
      const priorityRank: Record<string, number> = { low: 0, normal: 1, high: 2, urgent: 3 };
      kept.messages = [...kept.messages, ...duplicate.messages].sort((a, b) =>
        a.at.localeCompare(b.at),
      );
      kept.messages.push({
        id: messageId(),
        author: "system",
        author_id: "",
        author_name: found.member.display_name,
        visibility: "internal",
        body: `Merged ${duplicate.id} (${duplicate.subject.slice(0, 80)}) into this conversation`,
        at,
      });
      kept.tags = [...new Set([...kept.tags, ...duplicate.tags])].sort();
      if (priorityRank[duplicate.priority]! > priorityRank[kept.priority]!)
        kept.priority = duplicate.priority;
      if (duplicate.status === "open") kept.status = "open";
      kept.followers = [...new Set([...kept.followers, ...duplicate.followers])];
      kept.updated_at = at;
      duplicate.messages.push({
        id: messageId(),
        author: "system",
        author_id: "",
        author_name: found.member.display_name,
        visibility: "internal",
        body: `Merged into ${kept.id}`,
        at,
      });
      duplicate.status = "resolved";
      duplicate.resolved_at = at;
      duplicate.snoozed_until = null;
      duplicate.tags = [...new Set([...duplicate.tags, "merged"])].sort();
      duplicate.updated_at = at;
      audit("ticket.merged_into", found.member.id, "ticket", duplicate.id, "", { other: kept.id });
      audit("ticket.merged_from", found.member.id, "ticket", kept.id, "", { other: duplicate.id });
      return ok({ ticket: ticketView(kept, found.member.id) });
    },
  },
  {
    method: "GET",
    pattern: "hq/saved-replies",
    auth: true,
    capability: "tickets:read",
    handler: () =>
      ok({ replies: [...savedReplies].sort((a, b) => a.title.localeCompare(b.title)) }),
  },
  {
    method: "POST",
    pattern: "hq/saved-replies/create",
    auth: true,
    capability: "tickets:manage",
    handler: ({ body }) => {
      const title = String(body.title ?? "").trim();
      const text = String(body.body ?? "").trim();
      if (!title || !text) return refuse(400, "malformed_request");
      const reply = {
        reply_id: randomUUID(),
        title,
        body: text,
        uses: 0,
        updated_at: now(),
        archived: false,
      };
      savedReplies.push(reply);
      return ok({ reply });
    },
  },
  {
    method: "POST",
    pattern: "hq/saved-replies/{reply_id}/update",
    auth: true,
    capability: "tickets:manage",
    handler: ({ params, body }) => {
      const reply = savedReplies.find((candidate) => candidate.reply_id === params.reply_id);
      if (!reply) return refuse(404, "not_found");
      if ("title" in body) reply.title = String(body.title ?? "").trim() || reply.title;
      if ("body" in body) reply.body = String(body.body ?? "").trim() || reply.body;
      if ("archived" in body) reply.archived = Boolean(body.archived);
      if (body.used) reply.uses += 1;
      reply.updated_at = now();
      return ok({ updated: true });
    },
  },
  {
    method: "GET",
    pattern: "hq/audit",
    auth: true,
    capability: "audit:read",
    handler: ({ query }) => {
      const limit = Math.min(Math.max(Number(query.limit ?? 50) || 50, 1), 200);
      const offset = Math.max(Number(query.offset ?? 0) || 0, 0);
      if (badId(query.staff_id)) return refuse(400, "malformed_request", { staff_id: "not an id" });
      const filters = (["staff_id", "action", "entity_type", "entity_id"] as const).filter(
        (name) => query[name],
      );
      const rows = auditEvents.filter((row) =>
        filters.every((name) => String(row[name] ?? "") === query[name]),
      );
      return ok({ events: rows.slice(offset, offset + limit), limit, offset });
    },
  },
  {
    method: "POST",
    pattern: "hq/audit/export",
    auth: true,
    capability: "audit:read",
    sudo: true,
    handler: ({ body, headers }) => {
      const reason = String(body.reason ?? "").trim();
      if (reason.length < 8)
        return refuse(400, "malformed_request", { reason: "say what the export is for" });
      const from = String(body.from ?? "");
      const to = String(body.to ?? "");
      const day = /^\d{4}-\d{2}-\d{2}$/;
      if (!day.test(from)) return refuse(400, "malformed_request", { from: "a date, YYYY-MM-DD" });
      if (!day.test(to)) return refuse(400, "malformed_request", { to: "a date, YYYY-MM-DD" });
      if (to < from) return refuse(400, "malformed_request", { to: "before from" });
      const start = Date.parse(`${from}T00:00:00Z`);
      const end = Date.parse(`${to}T00:00:00Z`) + 86_400_000;
      if (end - start > 367 * 86_400_000)
        return refuse(400, "malformed_request", { to: "at most 366 days at a time" });
      const stamp = (row: (typeof auditEvents)[number]) => String(row.occurred_at ?? "");
      const events = auditEvents
        .filter((row) => {
          const at = Date.parse(stamp(row));
          return at >= start && at < end;
        })
        .sort((a, b) => stamp(a).localeCompare(stamp(b)));
      const line = (value: unknown) => JSON.stringify(value);
      const bodyText = events.map((row) => line(row) + "\n").join("");
      const sha256 = createHash("sha256").update(bodyText, "utf8").digest("hex");
      const key = createHash("sha256").update("hq-audit-export:mock-secret").digest();
      const signature = createHmac("sha256", key).update(sha256).digest("hex");
      const found = caller(headers);
      const correlation = `qt-${randomUUID().replace(/-/g, "")}`;
      const header = {
        format: "quantify-hq-audit-jsonl/1",
        exported_at: now(),
        from,
        to,
        rows: events.length,
        truncated: false,
        exported_by: found?.member.id ?? "",
        reason,
        correlation_id: correlation,
      };
      const trailer = { sha256, signature, algorithm: "HMAC-SHA256" };
      audit("audit.exported", found?.member.id ?? null, "audit", `${from}..${to}`, reason, {
        rows: events.length,
        sha256,
        truncated: false,
      });
      return ok({
        filename: `hq-audit-${from}-${to}.jsonl`,
        rows: events.length,
        truncated: false,
        sha256,
        signature,
        algorithm: "HMAC-SHA256",
        jsonl: line(header) + "\n" + bodyText + line(trailer) + "\n",
      });
    },
  },
];

// =====================================================================================
// The CRM world. Shapes mirror the service's view builders field for field; the
// discipline rules (dated next step, closes via /close, qualified only via convert)
// are enforced here too, so the portal cannot be built against a laxer service.
// =====================================================================================

const FIRST_REPLY_TARGET_MINUTES = 60;
const NEGLECT_AFTER_DAYS = 14;
const FREE_MAIL = new Set(["gmail.com", "outlook.com", "yahoo.com", "icloud.com", "proton.me"]);
const LOSS_REASONS = [
  "no_decision",
  "timing",
  "price",
  "competitor",
  "status_quo",
  "missing_feature",
  "procurement",
  "champion_left",
];
const DISQUALIFY_REASONS = [
  "not_a_fit",
  "student_or_personal",
  "competitor",
  "spam",
  "no_response",
  "other",
];

type StageRow = {
  key: string;
  label: string;
  position: number;
  win_probability: number;
  stale_after_days: number;
  outcome: string;
  exit_criteria: string;
  archived: boolean;
};
type CompanyRow = {
  id: string;
  name: string;
  domain: string;
  firm_type: string;
  team_size_band: string;
  country: string;
  lifecycle: string;
  owner_staff_id: string;
  source_key: string;
  notes: string;
  customer_since: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
  parent_id?: string;
};
type PersonRow = {
  id: string;
  company_id: string;
  full_name: string;
  email: string;
  title: string;
  role_category: string;
  phone: string;
  account_user_id: string;
  do_not_contact: boolean;
  source_key: string;
  notes: string;
  last_contacted_at: string | null;
  created_at: string;
  archived?: boolean;
};
type MentionRow = {
  id: string;
  staff_id: string;
  mentioned_by: string;
  entity_type: string;
  entity_id: string;
  excerpt: string;
  at: string;
  seen_at: string | null;
};
const mentions: MentionRow[] = [];

type SavedViewRow = {
  id: string;
  list_key: string;
  name: string;
  query: string;
  shared: boolean;
  owner_staff_id: string;
  updated_at: string;
};
const savedViews: SavedViewRow[] = [];
const preferences = new Map<string, string>(); // `${staffId}\u0000${key}`

function seedViews() {
  savedViews.length = 0;
  preferences.clear();
  savedViews.push(
    {
      id: "sv000000-0000-4000-8000-000000000001",
      list_key: "companies",
      name: "UK customers",
      query: "lifecycle=customer&f=country%3Ais%3AUnited+Kingdom",
      shared: true,
      owner_staff_id: SALES_STAFF,
      updated_at: agoIso(24 * 9),
    },
    {
      id: "sv000000-0000-4000-8000-000000000002",
      list_key: "deals",
      name: "Stuck this quarter",
      query: "sort=-days&view=table",
      shared: false,
      owner_staff_id: OWNER_STAFF,
      updated_at: agoIso(24 * 3),
    },
  );
}

function viewView(row: SavedViewRow, viewer: string) {
  return {
    view_id: row.id,
    list_key: row.list_key,
    name: row.name,
    query: row.query,
    shared: row.shared,
    owner_staff_id: row.owner_staff_id,
    mine: row.owner_staff_id === viewer,
    updated_at: row.updated_at,
  };
}
type LeadRow = {
  id: string;
  source_key: string;
  email: string;
  full_name: string;
  company_name: string;
  message: string;
  payload: Record<string, string>;
  stage: string;
  disqualify_reason: string;
  owner_staff_id: string;
  first_replied_at: string | null;
  converted_company_id: string;
  converted_person_id: string;
  converted_deal_id: string;
  created_at: string;
  /** Absent means never touched since creation. */
  updated_at?: string;
  anonymised_at?: string | null;
};
type DealRow = {
  id: string;
  name: string;
  company_id: string;
  primary_person_id: string;
  stage_key: string;
  status: string;
  mrr_amount: number;
  currency: string;
  /** The price-list plan that priced it, when one did. */
  plan_key?: string;
  seats: number;
  expected_close_date: string;
  next_step: string;
  next_step_due: string;
  owner_staff_id: string;
  source_key: string;
  notes: string;
  entered_stage_at: string;
  last_activity_at: string;
  loss_reason: string;
  loss_competitor: string;
  loss_detail: string;
  closed_at: string | null;
  created_at: string;
};
type ActivityRow = {
  kind: string;
  at: string;
  staff_id: string;
  staff_name: string;
  body: string;
  company_id: string;
  person_id: string;
  deal_id: string;
  lead_id: string;
};
type TaskRow = {
  id: string;
  title: string;
  body: string;
  status: string;
  priority: string;
  due_on: string;
  assignee_staff_id: string;
  company_id: string;
  person_id: string;
  deal_id: string;
  lead_id: string;
  ticket_id: string;
  origin: string;
  completed_at: string | null;
  created_at: string;
};
type ApiKeyRow = {
  key_id: string;
  name: string;
  prefix: string;
  scopes: string[];
  created_by: string;
  created_at: string;
  last_used_at: string | null;
  revoked_at: string | null;
  expires_at: string | null;
};

const KEY_LIFETIME_DAYS = 180;

function keyView(row: ApiKeyRow) {
  return {
    ...row,
    expired: Boolean(row.expires_at && Date.parse(row.expires_at) <= Date.now()),
  };
}

/** Stands in for the public breach corpus: the service asks HIBP, the mock asks this. */
const BREACHED_PASSWORDS = new Set(["password1234", "qwerty123456", "letmein12345"]);

function breachedRefusal(password: string) {
  return BREACHED_PASSWORDS.has(password.toLowerCase())
    ? refuse(400, "malformed_request", {
        password: "this password appears in a public data breach; choose another",
      })
    : null;
}

const stages: StageRow[] = [];
const companies: CompanyRow[] = [];
const people: PersonRow[] = [];
const leads: LeadRow[] = [];
const deals: DealRow[] = [];
const dealStageEvents: Array<{
  deal_id: string;
  from_stage_key: string;
  to_stage_key: string;
  at: string;
  staff_id: string;
}> = [];
const activities: ActivityRow[] = [];
const tasks: TaskRow[] = [];
const apiKeys: ApiKeyRow[] = [];

const OWNER_STAFF = "aa000000-0000-4000-8000-00000000000a";
const SALES_STAFF = "aa000000-0000-4000-8000-00000000000c";

function agoIso(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}
function daysFromNow(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}

function seedCrm() {
  stages.length = 0;
  stages.push(
    {
      key: "demo_booked",
      label: "Demo booked",
      position: 1,
      win_probability: 10,
      stale_after_days: 14,
      outcome: "",
      exit_criteria: "Demo happened, or was rebooked once at most",
      archived: false,
    },
    {
      key: "demo_done",
      label: "Demo done",
      position: 2,
      win_probability: 25,
      stale_after_days: 10,
      outcome: "",
      exit_criteria: "They named a workflow ours replaces and who decides",
      archived: false,
    },
    {
      key: "pilot",
      label: "Early access",
      position: 3,
      win_probability: 40,
      stale_after_days: 30,
      outcome: "",
      exit_criteria: "Signed in twice in a week without prompting",
      archived: false,
    },
    {
      key: "proposal",
      label: "Proposal sent",
      position: 4,
      win_probability: 60,
      stale_after_days: 14,
      outcome: "",
      exit_criteria: "Proposal opened and a review call is on the calendar",
      archived: false,
    },
    {
      key: "negotiation",
      label: "Negotiation",
      position: 5,
      win_probability: 80,
      stale_after_days: 14,
      outcome: "",
      exit_criteria: "Terms agreed; only signature and billing remain",
      archived: false,
    },
    {
      key: "won",
      label: "Won",
      position: 6,
      win_probability: 100,
      stale_after_days: 0,
      outcome: "won",
      exit_criteria: "",
      archived: false,
    },
    {
      key: "lost",
      label: "Lost",
      position: 7,
      win_probability: 0,
      stale_after_days: 0,
      outcome: "lost",
      exit_criteria: "",
      archived: false,
    },
    {
      key: "unqualified",
      label: "Closed unqualified",
      position: 8,
      win_probability: 0,
      stale_after_days: 0,
      outcome: "unqualified",
      exit_criteria: "",
      archived: false,
    },
  );
  companies.length = 0;
  companies.push(
    {
      id: "c0000000-0000-4000-8000-000000000001",
      name: "Meridian Capital",
      domain: "meridiancap.com",
      firm_type: "Hedge fund",
      team_size_band: "11-50",
      country: "United Kingdom",
      lifecycle: "customer",
      owner_staff_id: OWNER_STAFF,
      source_key: "referral",
      notes: "Three-desk equities shop; the CIO signs.",
      customer_since: agoIso(24 * 40).slice(0, 10),
      archived: false,
      created_at: agoIso(24 * 60),
      updated_at: agoIso(24 * 2),
    },
    {
      id: "c0000000-0000-4000-8000-000000000002",
      name: "Northwall Advisors",
      domain: "northwall.ch",
      firm_type: "Wealth manager",
      team_size_band: "2-10",
      country: "Switzerland",
      lifecycle: "early_access",
      owner_staff_id: SALES_STAFF,
      source_key: "website_early_access",
      notes: "",
      customer_since: null,
      archived: false,
      created_at: agoIso(24 * 30),
      updated_at: agoIso(24),
    },
    {
      id: "c0000000-0000-4000-8000-000000000004",
      name: "Kestrel Research",
      domain: "kestrelresearch.io",
      firm_type: "Research firm",
      team_size_band: "2-10",
      country: "Ireland",
      lifecycle: "former_customer",
      owner_staff_id: OWNER_STAFF,
      source_key: "outbound",
      notes: "Left for a cheaper data terminal; open to returning.",
      customer_since: agoIso(24 * 250).slice(0, 10),
      archived: false,
      created_at: agoIso(24 * 260),
      updated_at: agoIso(24 * 95),
    },
    {
      id: "c0000000-0000-4000-8000-000000000003",
      name: "Bluecrest Family Office",
      domain: "bluecrestfo.com",
      firm_type: "Family office",
      team_size_band: "2-10",
      country: "Singapore",
      lifecycle: "prospect",
      owner_staff_id: "",
      source_key: "demo_booking",
      notes: "",
      customer_since: null,
      archived: false,
      created_at: agoIso(24 * 12),
      updated_at: agoIso(24 * 5),
    },
  );
  people.length = 0;
  people.push(
    {
      id: "p0000000-0000-4000-8000-000000000001",
      company_id: "c0000000-0000-4000-8000-000000000001",
      full_name: "Elena Marsh",
      email: "elena@meridiancap.com",
      title: "Chief Investment Officer",
      role_category: "decision_maker",
      phone: "",
      account_user_id: "cc000000-0000-4000-8000-000000000001",
      do_not_contact: false,
      source_key: "referral",
      notes: "",
      last_contacted_at: agoIso(24 * 3),
      created_at: agoIso(24 * 60),
    },
    {
      id: "p0000000-0000-4000-8000-000000000002",
      company_id: "c0000000-0000-4000-8000-000000000002",
      full_name: "Jonas Keller",
      email: "jonas@northwall.ch",
      title: "Managing Partner",
      role_category: "decision_maker",
      phone: "",
      account_user_id: "",
      do_not_contact: false,
      source_key: "website_early_access",
      notes: "",
      last_contacted_at: agoIso(24 * 6),
      created_at: agoIso(24 * 30),
    },
    {
      id: "p0000000-0000-4000-8000-000000000003",
      company_id: "c0000000-0000-4000-8000-000000000003",
      full_name: "Priya Nair",
      email: "priya@bluecrestfo.com",
      title: "Head of Research",
      role_category: "champion",
      phone: "",
      account_user_id: "",
      do_not_contact: false,
      source_key: "demo_booking",
      notes: "",
      last_contacted_at: null,
      created_at: agoIso(24 * 12),
    },
  );
  leads.length = 0;
  leads.push(
    {
      id: "1e000000-0000-4000-8000-000000000001",
      source_key: "website_early_access",
      email: "marc@arkstonepartners.com",
      full_name: "Marc Delaney",
      company_name: "Arkstone Partners",
      message: "We run a four-person macro book and want the morning brief workflow.",
      payload: { role: "Portfolio manager", team_size: "2-10", where: "Hedge fund" },
      stage: "new",
      disqualify_reason: "",
      owner_staff_id: "",
      first_replied_at: null,
      converted_company_id: "",
      converted_person_id: "",
      converted_deal_id: "",
      created_at: agoIso(3),
    },
    {
      id: "1e000000-0000-4000-8000-000000000002",
      source_key: "website_contact",
      email: "sofia@graniterow.com",
      full_name: "Sofia Lindqvist",
      company_name: "Granite Row",
      message: "Which brokers does the terminal support for live accounts?",
      payload: {},
      stage: "attempting",
      disqualify_reason: "",
      owner_staff_id: SALES_STAFF,
      first_replied_at: agoIso(20),
      converted_company_id: "",
      converted_person_id: "",
      converted_deal_id: "",
      created_at: agoIso(26),
    },
    {
      id: "1e000000-0000-4000-8000-000000000003",
      source_key: "demo_booking",
      email: "tom@hollowaycap.com",
      full_name: "Tom Holloway",
      company_name: "Holloway Capital",
      message: "Booked the Thursday slot.",
      payload: { where: "Prop desk" },
      stage: "connected",
      disqualify_reason: "",
      owner_staff_id: OWNER_STAFF,
      first_replied_at: agoIso(70),
      converted_company_id: "",
      converted_person_id: "",
      converted_deal_id: "",
      created_at: agoIso(75),
    },
    {
      id: "1e000000-0000-4000-8000-000000000004",
      source_key: "website_early_access",
      email: "student@gmail.com",
      full_name: "Alex Kim",
      company_name: "",
      message: "Can I get free access for my thesis?",
      payload: { role: "Student" },
      stage: "disqualified",
      disqualify_reason: "student_or_personal",
      owner_staff_id: OWNER_STAFF,
      first_replied_at: agoIso(96),
      converted_company_id: "",
      converted_person_id: "",
      converted_deal_id: "",
      created_at: agoIso(100),
    },
  );
  deals.length = 0;
  deals.push(
    {
      id: "d0000000-0000-4000-8000-000000000001",
      name: "Northwall Advisors — new business",
      company_id: "c0000000-0000-4000-8000-000000000002",
      primary_person_id: "p0000000-0000-4000-8000-000000000002",
      stage_key: "pilot",
      status: "open",
      mrr_amount: 398,
      currency: "USD",
      seats: 2,
      expected_close_date: daysFromNow(21),
      next_step: "Week-two pilot review call",
      next_step_due: daysFromNow(3),
      owner_staff_id: SALES_STAFF,
      source_key: "website_early_access",
      notes: "Two seats on trial; the second desk watches.",
      entered_stage_at: agoIso(24 * 9),
      last_activity_at: agoIso(24 * 2),
      loss_reason: "",
      loss_competitor: "",
      loss_detail: "",
      closed_at: null,
      created_at: agoIso(24 * 28),
    },
    {
      id: "d0000000-0000-4000-8000-000000000002",
      name: "Bluecrest Family Office — new business",
      company_id: "c0000000-0000-4000-8000-000000000003",
      primary_person_id: "p0000000-0000-4000-8000-000000000003",
      stage_key: "demo_done",
      status: "open",
      mrr_amount: 199,
      currency: "USD",
      seats: 1,
      expected_close_date: "",
      next_step: "",
      next_step_due: "",
      owner_staff_id: OWNER_STAFF,
      source_key: "demo_booking",
      notes: "",
      entered_stage_at: agoIso(24 * 20),
      last_activity_at: agoIso(24 * 17),
      loss_reason: "",
      loss_competitor: "",
      loss_detail: "",
      closed_at: null,
      created_at: agoIso(24 * 24),
    },
    {
      id: "d0000000-0000-4000-8000-000000000003",
      name: "Meridian Capital — rates desk seats",
      company_id: "c0000000-0000-4000-8000-000000000001",
      primary_person_id: "p0000000-0000-4000-8000-000000000001",
      stage_key: "demo_booked",
      status: "open",
      mrr_amount: 597,
      currency: "USD",
      seats: 3,
      expected_close_date: daysFromNow(45),
      next_step: "Demo the rates workflow to the second desk",
      next_step_due: daysFromNow(2),
      owner_staff_id: OWNER_STAFF,
      source_key: "demo_booking",
      notes: "",
      entered_stage_at: agoIso(24 * 2),
      last_activity_at: agoIso(20),
      loss_reason: "",
      loss_competitor: "",
      loss_detail: "",
      closed_at: null,
      created_at: agoIso(24 * 2),
    },
    {
      id: "d0000000-0000-4000-8000-000000000004",
      name: "Meridian Capital — desk expansion",
      company_id: "c0000000-0000-4000-8000-000000000001",
      primary_person_id: "p0000000-0000-4000-8000-000000000001",
      stage_key: "won",
      status: "won",
      mrr_amount: 995,
      currency: "USD",
      seats: 5,
      expected_close_date: "",
      next_step: "",
      next_step_due: "",
      owner_staff_id: OWNER_STAFF,
      source_key: "referral",
      notes: "",
      entered_stage_at: agoIso(24 * 40),
      last_activity_at: agoIso(24 * 40),
      loss_reason: "",
      loss_competitor: "",
      loss_detail: "",
      closed_at: agoIso(24 * 40),
      created_at: agoIso(24 * 70),
    },
  );
  dealStageEvents.length = 0;
  dealStageEvents.push(
    {
      deal_id: "d0000000-0000-4000-8000-000000000001",
      from_stage_key: "",
      to_stage_key: "demo_booked",
      at: agoIso(24 * 28),
      staff_id: SALES_STAFF,
    },
    {
      deal_id: "d0000000-0000-4000-8000-000000000001",
      from_stage_key: "demo_booked",
      to_stage_key: "demo_done",
      at: agoIso(24 * 21),
      staff_id: SALES_STAFF,
    },
    {
      deal_id: "d0000000-0000-4000-8000-000000000001",
      from_stage_key: "demo_done",
      to_stage_key: "pilot",
      at: agoIso(24 * 9),
      staff_id: SALES_STAFF,
    },
    {
      deal_id: "d0000000-0000-4000-8000-000000000002",
      from_stage_key: "",
      to_stage_key: "demo_booked",
      at: agoIso(24 * 24),
      staff_id: OWNER_STAFF,
    },
    {
      deal_id: "d0000000-0000-4000-8000-000000000002",
      from_stage_key: "demo_booked",
      to_stage_key: "demo_done",
      at: agoIso(24 * 20),
      staff_id: OWNER_STAFF,
    },
    {
      deal_id: "d0000000-0000-4000-8000-000000000003",
      from_stage_key: "",
      to_stage_key: "demo_booked",
      at: agoIso(24 * 2),
      staff_id: OWNER_STAFF,
    },
    {
      deal_id: "d0000000-0000-4000-8000-000000000004",
      from_stage_key: "",
      to_stage_key: "negotiation",
      at: agoIso(24 * 70),
      staff_id: OWNER_STAFF,
    },
    {
      deal_id: "d0000000-0000-4000-8000-000000000004",
      from_stage_key: "negotiation",
      to_stage_key: "won",
      at: agoIso(24 * 40),
      staff_id: OWNER_STAFF,
    },
  );
  activities.length = 0;
  activities.push(
    {
      kind: "email_in",
      at: agoIso(20),
      staff_id: "",
      staff_name: "",
      body: "Jonas: pilot going well, second desk wants in.",
      company_id: "c0000000-0000-4000-8000-000000000002",
      person_id: "p0000000-0000-4000-8000-000000000002",
      deal_id: "d0000000-0000-4000-8000-000000000001",
      lead_id: "",
    },
    {
      kind: "call",
      at: agoIso(24 * 2),
      staff_id: SALES_STAFF,
      staff_name: "Sales Person",
      body: "Walked the pilot desk through the risk tab.",
      company_id: "c0000000-0000-4000-8000-000000000002",
      person_id: "p0000000-0000-4000-8000-000000000002",
      deal_id: "d0000000-0000-4000-8000-000000000001",
      lead_id: "",
    },
    {
      kind: "stage_change",
      at: agoIso(24 * 9),
      staff_id: SALES_STAFF,
      staff_name: "Sales Person",
      body: "demo_done -> pilot",
      company_id: "c0000000-0000-4000-8000-000000000002",
      person_id: "",
      deal_id: "d0000000-0000-4000-8000-000000000001",
      lead_id: "",
    },
    {
      kind: "note",
      at: agoIso(24 * 17),
      staff_id: OWNER_STAFF,
      staff_name: "The Owner",
      body: "Priya went quiet after the demo. Needs a nudge.",
      company_id: "c0000000-0000-4000-8000-000000000003",
      person_id: "p0000000-0000-4000-8000-000000000003",
      deal_id: "d0000000-0000-4000-8000-000000000002",
      lead_id: "",
    },
    {
      kind: "email_out",
      at: agoIso(22),
      staff_id: SALES_STAFF,
      staff_name: "Sales Person",
      body: "Sent the broker coverage answer.",
      company_id: "",
      person_id: "",
      deal_id: "",
      lead_id: "1e000000-0000-4000-8000-000000000002",
    },
    {
      kind: "system",
      at: agoIso(24 * 40),
      staff_id: "",
      staff_name: "",
      body: "Closed won",
      company_id: "c0000000-0000-4000-8000-000000000001",
      person_id: "",
      deal_id: "d0000000-0000-4000-8000-000000000004",
      lead_id: "",
    },
  );
  tasks.length = 0;
  tasks.push(
    {
      id: "aaaa0000-0000-4000-8000-000000000001",
      title: "Nudge Priya with the recap deck",
      body: "Demo was 17 days ago; no reply since.",
      status: "open",
      priority: "high",
      due_on: daysFromNow(-2),
      assignee_staff_id: OWNER_STAFF,
      company_id: "c0000000-0000-4000-8000-000000000003",
      person_id: "p0000000-0000-4000-8000-000000000003",
      deal_id: "d0000000-0000-4000-8000-000000000002",
      lead_id: "",
      ticket_id: "",
      origin: "manual",
      completed_at: null,
      created_at: agoIso(24 * 10),
    },
    {
      id: "aaaa0000-0000-4000-8000-000000000002",
      title: "Prepare the Northwall week-two review",
      body: "",
      status: "open",
      priority: "medium",
      due_on: daysFromNow(3),
      assignee_staff_id: SALES_STAFF,
      company_id: "c0000000-0000-4000-8000-000000000002",
      person_id: "",
      deal_id: "d0000000-0000-4000-8000-000000000001",
      lead_id: "",
      ticket_id: "",
      origin: "manual",
      completed_at: null,
      created_at: agoIso(24 * 3),
    },
    {
      id: "aaaa0000-0000-4000-8000-000000000003",
      title: "Reply to Marc at Arkstone",
      body: "Early-access application is past the one-hour target.",
      status: "open",
      priority: "urgent",
      due_on: daysFromNow(0),
      assignee_staff_id: "",
      company_id: "",
      person_id: "",
      deal_id: "",
      lead_id: "1e000000-0000-4000-8000-000000000001",
      ticket_id: "",
      origin: "manual",
      completed_at: null,
      created_at: agoIso(2),
    },
  );
  apiKeys.length = 0;
  apiKeys.push({
    key_id: "ee000000-0000-4000-8000-000000000001",
    name: "Website early-access form",
    prefix: "a1b2c3d4",
    scopes: ["leads:create"],
    created_by: OWNER_STAFF,
    created_at: agoIso(24 * 14),
    last_used_at: agoIso(3),
    revoked_at: null,
    expires_at: new Date(Date.now() + (KEY_LIFETIME_DAYS - 14) * 86_400_000).toISOString(),
  });
  seedRetentionExamples();
  // A group: the first paying firm owns a vehicle of its own.
  const parent = companies.find((row) => row.lifecycle === "customer" && !row.archived);
  if (parent) {
    companies.push({
      id: "c0000000-0000-4000-8000-0000000000fe",
      name: `${parent.name} Vehicle II`,
      domain: "",
      firm_type: parent.firm_type,
      team_size_band: parent.team_size_band,
      country: parent.country,
      lifecycle: "prospect",
      owner_staff_id: parent.owner_staff_id,
      source_key: parent.source_key,
      notes: "A second vehicle run by the same team; billed under the parent for now.",
      customer_since: null,
      archived: false,
      created_at: agoIso(24 * 40),
      updated_at: agoIso(24 * 40),
      parent_id: parent.id,
    });
  }
  mentions.length = 0;
  const firstCompany = companies[0];
  if (firstCompany)
    mentions.push({
      id: "me000000-0000-4000-8000-000000000001",
      staff_id: OWNER_STAFF,
      mentioned_by: SALES_STAFF,
      entity_type: "company",
      entity_id: firstCompany.id,
      excerpt: `@owner they asked for a reference call before signing — can you take it this week?`,
      at: agoIso(5),
      seen_at: null,
    });
}
seedCrm();

/** One lead per rule, old enough that the default rules reach it. */
function seedRetentionExamples() {
  const base = {
    source_key: "website_early_access",
    payload: {},
    owner_staff_id: OWNER_STAFF,
    converted_company_id: "",
    converted_person_id: "",
    converted_deal_id: "",
  };
  leads.push(
    {
      ...base,
      id: "1e000000-0000-4000-8000-0000000000d1",
      email: "iris@harlow-wealth.test",
      full_name: "Iris Cole",
      company_name: "Harlow Wealth",
      message: "Looking for a retail screener.",
      stage: "disqualified",
      disqualify_reason: "not_a_fit",
      first_replied_at: hoursAgo(24 * 419),
      created_at: hoursAgo(24 * 420),
      updated_at: hoursAgo(24 * 400),
    },
    {
      ...base,
      id: "1e000000-0000-4000-8000-0000000000d2",
      email: "oren@quayside-capital.test",
      full_name: "Oren Blake",
      company_name: "Quayside Capital",
      message: "Maybe next year.",
      stage: "attempting",
      disqualify_reason: "",
      first_replied_at: hoursAgo(24 * 799),
      created_at: hoursAgo(24 * 800),
      updated_at: hoursAgo(24 * 790),
    },
  );
}

/** Mirrors 0010's seeded sources. Rows, not constants: admins add and archive them. */
const SOURCE_SEED: ReadonlyArray<readonly [string, string]> = [
  ["website_early_access", "Early access form"],
  ["website_contact", "Contact form"],
  ["demo_booking", "Demo booking"],
  ["outbound", "Outbound"],
  ["referral", "Referral"],
  ["other", "Other"],
];
/** Mirrors crm_routes.PROTECTED_SOURCES: new leads fall back to these. */
const PROTECTED_SOURCES = ["website_early_access", "other", "outbound"];
const sources: Array<{ key: string; label: string; archived: boolean }> = [];
function seedSources() {
  sources.length = 0;
  for (const [key, label] of SOURCE_SEED) sources.push({ key, label, archived: false });
}
seedSources();

/** The price list: the mock's own rates, not the product's. */
type PlanRow = {
  key: string;
  name: string;
  unit_amount: number;
  currency: string;
  billing_cadence: string;
  min_seats: number;
  archived: boolean;
};
const PLAN_SEED: ReadonlyArray<Omit<PlanRow, "archived">> = [
  {
    key: "desk",
    name: "Desk",
    unit_amount: 199,
    currency: "USD",
    billing_cadence: "monthly",
    min_seats: 1,
  },
  {
    key: "pro",
    name: "Professional desk",
    unit_amount: 199,
    currency: "USD",
    billing_cadence: "monthly",
    min_seats: 2,
  },
  {
    key: "team",
    name: "Team",
    unit_amount: 169,
    currency: "USD",
    billing_cadence: "annual",
    min_seats: 5,
  },
  {
    key: "enterprise",
    name: "Enterprise desk",
    unit_amount: 149,
    currency: "USD",
    billing_cadence: "annual",
    min_seats: 20,
  },
];
const PLAN_KEY_BY_NAME: Record<string, string> = Object.fromEntries(
  PLAN_SEED.map((plan) => [plan.name, plan.key]),
);
const plans: PlanRow[] = [];
function seedPlans() {
  plans.length = 0;
  for (const plan of PLAN_SEED) plans.push({ ...plan, archived: false });
}
seedPlans();
function planView(plan: PlanRow) {
  return {
    key: plan.key,
    name: plan.name,
    unit_amount: plan.unit_amount,
    currency: plan.currency,
    billing_cadence: plan.billing_cadence,
    min_seats: plan.min_seats,
    archived: plan.archived,
  };
}
/** Mirrors crm_routes.active_plan_or_refuse. */
function activePlan(key: string): PlanRow | null {
  const plan = plans.find((row) => row.key === key);
  return plan && !plan.archived ? plan : null;
}

/** Mirrors crm_routes._check_source: a new choice must be a live source. */
function sourceRefusal(key: string, current = "") {
  if (!key || key === current) return null;
  if (sources.some((row) => row.key === key && !row.archived)) return null;
  return refuse(400, "malformed_request", { source_key: "not a source on the list" });
}

// -- retention: mirrors account_api/hq/retention.py ----------------------------------
const RETENTION_SEED = { disqualified: 365, quiet: 730 };
const retentionRules = { ...RETENTION_SEED };
const RETENTION_BATCH = 200;
const RETENTION_STAGES: Record<"disqualified" | "quiet", string[]> = {
  disqualified: ["disqualified"],
  quiet: ["new", "attempting", "connected"],
};
const ANONYMISED_TASK_TITLE = "Task on an anonymised lead";
const ANONYMISED = { lead: "anonymised under the retention rules; nothing on it can change" };
const SIGN_OUT_PHRASE = "sign everyone out";

function leadLastTouch(row: LeadRow): number {
  let touched = new Date(row.updated_at ?? row.created_at).getTime();
  for (const activity of activities) {
    if (activity.lead_id === row.id) touched = Math.max(touched, new Date(activity.at).getTime());
  }
  return touched;
}

function retentionCandidates(rule: "disqualified" | "quiet"): LeadRow[] {
  const days = retentionRules[rule];
  if (!days) return [];
  const cutoff = Date.now() - days * 86_400_000;
  return leads
    .filter(
      (row) =>
        !row.anonymised_at &&
        !row.converted_company_id &&
        !row.converted_person_id &&
        !row.converted_deal_id &&
        RETENTION_STAGES[rule].includes(row.stage) &&
        !tasks.some((task) => task.lead_id === row.id && task.status === "open") &&
        leadLastTouch(row) < cutoff,
    )
    .sort((a, b) => leadLastTouch(a) - leadLastTouch(b));
}

function retentionPreview() {
  const rules = (["disqualified", "quiet"] as const).map((rule) => ({
    rule,
    days: retentionRules[rule],
    untouched_since: retentionRules[rule]
      ? new Date(Date.now() - retentionRules[rule] * 86_400_000).toISOString()
      : null,
    due: retentionCandidates(rule).length,
  }));
  const due = rules.reduce((sum, row) => sum + row.due, 0);
  return { rules, due, this_run: Math.min(due, RETENTION_BATCH), batch: RETENTION_BATCH };
}

function onlyTheLead(row: { lead_id: string } & Record<string, unknown>, leadId: string) {
  return (
    row.lead_id === leadId && !row.company_id && !row.person_id && !row.deal_id && !row.meeting_id
  );
}

function sweepRetention(staffId: string | null, reason: string, limit: number) {
  let budget = limit;
  const planned: Record<string, LeadRow[]> = {};
  for (const rule of ["disqualified", "quiet"] as const) {
    planned[rule] = budget > 0 ? retentionCandidates(rule).slice(0, budget) : [];
    budget -= planned[rule]!.length;
  }
  const ids = Object.values(planned).flatMap((rows) => rows.map((row) => row.id));
  if (ids.length)
    audit("retention.swept", staffId, "retention", "leads", reason, {
      rules: { ...retentionRules },
      lead_ids: ids,
    });
  const anonymised: Record<string, number> = {};
  const at = now();
  for (const [rule, rows] of Object.entries(planned)) {
    for (const row of rows) {
      Object.assign(row, {
        email: "",
        full_name: "",
        company_name: "",
        message: "",
        payload: {},
        anonymised_at: at,
        updated_at: at,
      });
      for (const activity of activities)
        if (onlyTheLead(activity as ActivityRow & Record<string, unknown>, row.id))
          activity.body = "";
      for (const task of tasks)
        if (onlyTheLead(task as TaskRow & Record<string, unknown>, row.id))
          Object.assign(task, { title: ANONYMISED_TASK_TITLE, body: "" });
    }
    anonymised[rule] = rows.length;
  }
  const cutoff = Date.now() - 30 * 86_400_000;
  const kept = webhookEvents.filter((row) => new Date(row.received_at).getTime() >= cutoff);
  const pruned = webhookEvents.length - kept.length;
  webhookEvents.splice(0, webhookEvents.length, ...kept);
  return {
    anonymised,
    skipped: 0,
    webhook_events_pruned: pruned,
    remaining: retentionPreview().due,
  };
}

function lastSweep() {
  const row = auditEvents.find((event) => event.action === "retention.swept");
  if (!row) return null;
  const detail = row.detail as { lead_ids?: string[] };
  return {
    at: String(row.occurred_at),
    by_staff: Boolean(row.staff_id),
    leads: (detail.lead_ids ?? []).length,
  };
}

/** Mirrors crm_routes._check_linked_lead. */
function linkedLeadRefusal(leadId: string) {
  if (!leadId) return null;
  const lead = leads.find((row) => row.id === leadId);
  if (!lead) return refuse(400, "malformed_request", { lead_id: "no such lead" });
  if (lead.anonymised_at) return refuse(400, "malformed_request", ANONYMISED);
  return null;
}

// -- the webhook ledger: mirrors hq_webhook_events --------------------------------------
type WebhookRow = {
  provider: string;
  event_id: string;
  received_at: string;
  state: string;
  outcome: string;
  duplicates: number;
};
const webhookEvents: WebhookRow[] = [];

function stageOf(key: string): StageRow | undefined {
  return stages.find((row) => row.key === key);
}

function minutesSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
}
function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function companyView(row: CompanyRow) {
  return {
    parent_id: row.parent_id ?? "",
    company_id: row.id,
    name: row.name,
    domain: row.domain,
    firm_type: row.firm_type,
    team_size_band: row.team_size_band,
    country: row.country,
    lifecycle: row.lifecycle,
    owner_staff_id: row.owner_staff_id,
    source_key: row.source_key,
    notes: row.notes,
    customer_since: row.customer_since,
    archived: row.archived,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}

function personView(row: PersonRow) {
  return {
    person_id: row.id,
    company_id: row.company_id,
    full_name: row.full_name,
    email: row.email,
    title: row.title,
    role_category: row.role_category,
    phone: row.phone,
    account_user_id: row.account_user_id,
    do_not_contact: row.do_not_contact,
    source_key: row.source_key,
    notes: row.notes,
    last_contacted_at: row.last_contacted_at,
    created_at: row.created_at,
  };
}

function leadView(row: LeadRow) {
  const unanswered = !row.first_replied_at && (row.stage === "new" || row.stage === "attempting");
  const waiting = unanswered ? minutesSince(row.created_at) : null;
  return {
    lead_id: row.id,
    source_key: row.source_key,
    email: row.email,
    full_name: row.full_name,
    company_name: row.company_name,
    message: row.message,
    payload: row.payload,
    stage: row.stage,
    disqualify_reason: row.disqualify_reason,
    owner_staff_id: row.owner_staff_id,
    first_replied_at: row.first_replied_at,
    waiting_minutes: waiting,
    first_reply_overdue: waiting !== null && waiting > FIRST_REPLY_TARGET_MINUTES,
    converted_company_id: row.converted_company_id,
    converted_person_id: row.converted_person_id,
    converted_deal_id: row.converted_deal_id,
    created_at: row.created_at,
    anonymised_at: row.anonymised_at ?? null,
  };
}

function dealSummary(row: DealRow) {
  const stage = stageOf(row.stage_key);
  const isOpen = row.status === "open";
  const daysInStage = daysSince(row.entered_stage_at);
  const idleDays = daysSince(row.last_activity_at);
  const today = new Date().toISOString().slice(0, 10);
  const stepScheduled = Boolean(row.next_step_due) && row.next_step_due >= today;
  const flags: string[] = [];
  if (isOpen) {
    if (!row.next_step || !row.next_step_due) flags.push("no_next_step");
    else if (!stepScheduled) flags.push("next_step_overdue");
    if (idleDays >= NEGLECT_AFTER_DAYS) flags.push("neglected");
    if (
      (stage?.stale_after_days ?? 0) > 0 &&
      daysInStage > (stage?.stale_after_days ?? 0) &&
      !stepScheduled
    )
      flags.push("rotting");
    // A close date in the past is a forecast nobody has corrected.
    if (row.expected_close_date && row.expected_close_date < today) flags.push("close_overdue");
  }
  const probability = stage?.win_probability ?? 0;
  return {
    deal_id: row.id,
    name: row.name,
    company_id: row.company_id,
    primary_person_id: row.primary_person_id,
    stage_key: row.stage_key,
    stage_label: stage?.label ?? row.stage_key,
    status: row.status,
    mrr_amount: row.mrr_amount,
    currency: row.currency,
    plan_key: row.plan_key ?? "",
    seats: row.seats,
    win_probability: probability,
    weighted_mrr: Math.round(row.mrr_amount * probability) / 100,
    expected_close_date: row.expected_close_date,
    next_step: row.next_step,
    next_step_due: row.next_step_due,
    owner_staff_id: row.owner_staff_id,
    source_key: row.source_key,
    days_in_stage: daysInStage,
    idle_days: idleDays,
    flags,
    loss_reason: row.loss_reason,
    loss_competitor: row.loss_competitor,
    loss_detail: row.loss_detail,
    closed_at: row.closed_at,
    created_at: row.created_at,
  };
}

function recordLabel(row: TaskRow): string {
  if (row.deal_id) return deals.find((deal) => deal.id === row.deal_id)?.name ?? "";
  if (row.company_id) return companies.find((company) => company.id === row.company_id)?.name ?? "";
  if (row.person_id) {
    const person = people.find((candidate) => candidate.id === row.person_id);
    return person ? person.full_name || person.email : "";
  }
  if (row.lead_id) {
    const lead = leads.find((candidate) => candidate.id === row.lead_id);
    return lead ? lead.full_name || lead.email : "";
  }
  return "";
}

function taskView(row: TaskRow, withLabel = false) {
  return {
    record_label: withLabel ? recordLabel(row) : "",
    task_id: row.id,
    title: row.title,
    body: row.body,
    status: row.status,
    priority: row.priority,
    due_on: row.due_on,
    assignee_staff_id: row.assignee_staff_id,
    company_id: row.company_id,
    person_id: row.person_id,
    deal_id: row.deal_id,
    lead_id: row.lead_id,
    ticket_id: row.ticket_id,
    origin: row.origin,
    completed_at: row.completed_at,
    created_at: row.created_at,
  };
}

function activityViews(
  filter: Partial<Record<"company_id" | "person_id" | "deal_id" | "lead_id", string>>,
) {
  return activities
    .filter((row) =>
      Object.entries(filter).every(
        ([name, value]) => !value || row[name as keyof ActivityRow] === value,
      ),
    )
    .sort((a, b) => (a.at < b.at ? 1 : -1))
    .slice(0, 100);
}

function recordActivity(partial: Partial<ActivityRow> & { kind: string; body: string }) {
  activities.push({
    kind: partial.kind,
    at: now(),
    staff_id: partial.staff_id ?? "",
    staff_name: partial.staff_name ?? "",
    body: partial.body,
    company_id: partial.company_id ?? "",
    person_id: partial.person_id ?? "",
    deal_id: partial.deal_id ?? "",
    lead_id: partial.lead_id ?? "",
  });
}

function domainOf(email: string): string {
  const domain = normaliseDomain(email.toLowerCase().split("@")[1] ?? "");
  return FREE_MAIL.has(domain) ? "" : domain;
}

/** The service's rule: lower-case host only — no scheme, path, www. or trailing dot. */
function normaliseDomain(value: unknown): string {
  let text = String(value ?? "")
    .trim()
    .toLowerCase();
  text = text.replace(/^https?:\/\//, "").split(/[/?#]/)[0] ?? "";
  if (text.includes("@")) text = text.split("@").pop() ?? "";
  text = text
    .replace(/^\.+|\.+$/g, "")
    .replace(/^www\./, "")
    .replace(/^\.+|\.+$/g, "");
  return text.slice(0, 255);
}

/** Whether `member` is the only Owner who can sign in: active, enrolled, inside the engagement. */
function lastActiveOwner(member: Staff): boolean {
  if (member.role !== "owner") return false;
  const today = new Date().toISOString().slice(0, 10);
  const others = staff.filter(
    (row) =>
      row.id !== member.id &&
      row.role === "owner" &&
      row.is_active &&
      row.enrolled &&
      (!row.ends_on || row.ends_on >= today),
  );
  return others.length === 0;
}

function companyDetailPayload(row: CompanyRow, money = true) {
  const linkedPeople = people.filter((person) => person.company_id === row.id).map(personView);
  const companyDeals = deals
    .filter((deal) => deal.company_id === row.id)
    .map((deal) => ({
      ...withoutMoney(dealSummary(deal), money),
      company_name: row.name,
    }));
  const accounts = people
    .filter((person) => person.company_id === row.id && person.account_user_id)
    .map((person) => {
      const profile = ACCOUNT_PROFILES[person.account_user_id];
      return {
        account_user_id: person.account_user_id,
        email: profile?.email ?? person.email,
        plan: profile?.plan ?? "professional",
        is_active: true,
        last_login_at: agoIso(8),
        profile_available: Boolean(profile),
      };
    });
  const openTasks = tasks
    .filter((task) => task.company_id === row.id && task.status === "open")
    .map((row) => taskView(row));
  const parent = companies.find((candidate) => candidate.id === row.parent_id);
  const children = companies
    .filter((candidate) => candidate.parent_id === row.id && !candidate.archived)
    .sort((a, b) => a.name.localeCompare(b.name));
  let groupMrr: Record<string, number> | null = null;
  if (money && children.length) {
    groupMrr = {};
    for (const member of [row, ...children]) {
      for (const [currency, amount] of Object.entries(ledgerMrr(member.id, true) ?? {}))
        groupMrr[currency] = Math.round(((groupMrr[currency] ?? 0) + amount) * 100) / 100;
    }
  }
  return {
    company: companyView(row),
    parent: parent ? { company_id: parent.id, name: parent.name } : null,
    children: children.map((child) => ({
      company_id: child.id,
      name: child.name,
      lifecycle: child.lifecycle,
      mrr: ledgerMrr(child.id, money),
    })),
    group_mrr: groupMrr,
    people: linkedPeople.filter(
      (person) => !people.find((p) => p.id === person.person_id)?.archived,
    ),
    deals: companyDeals,
    mrr: ledgerMrr(row.id, money),
    accounts,
    open_tasks: openTasks,
    activities: activityViews({ company_id: row.id }),
  };
}

/** As the service's normalise_company_name: legal suffixes and punctuation gone. */
function normaliseCompanyName(name: string): string {
  return name
    .toLowerCase()
    .replace(
      /\b(ltd|limited|llp|llc|inc|incorporated|plc|gmbh|ag|sa|sarl|bv|nv|pty|co|corp|corporation|company)\b\.?/g,
      " ",
    )
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .join(" ");
}

function mergeNotes(kept: string, folded: string, label: string): string {
  const extra = folded.trim();
  if (!extra || kept.includes(extra)) return kept;
  const line = `[Merged from ${label}] ${extra}`;
  return (kept.trim() ? `${kept.trimEnd()}\n\n${line}` : line).slice(0, 2000);
}

const MENTION = /(?<![\w@])@([A-Za-z0-9._-]{2,40})/g;

/** @first-name or @mail-name names a colleague; unknown handles are left alone. */
function recordMentions(callerId: string, text: string, links: Record<string, string>): string[] {
  const handles = new Set([...text.matchAll(MENTION)].map((match) => match[1]!.toLowerCase()));
  if (!handles.size) return [];
  const [entityName, entityId] = Object.entries(links).find(([, value]) => value) ?? ["", ""];
  const entityType = entityName.replace(/_id$/, "");
  const mentioned: string[] = [];
  for (const member of staff) {
    if (!member.is_active || member.id === callerId) continue;
    const first = member.display_name.split(" ")[0]?.toLowerCase() ?? "";
    const local = member.email.split("@")[0]?.toLowerCase() ?? "";
    const full = member.display_name.replace(/ /g, ".").toLowerCase();
    if (!(handles.has(first) || handles.has(local) || handles.has(full))) continue;
    mentions.push({
      id: randomUUID(),
      staff_id: member.id,
      mentioned_by: callerId,
      entity_type: entityType,
      entity_id: entityId,
      excerpt: text.slice(0, 400),
      at: now(),
      seen_at: null,
    });
    mentioned.push(member.id);
  }
  return mentioned;
}

function mentionView(row: MentionRow) {
  return {
    mention_id: row.id,
    by_staff_id: row.mentioned_by,
    by_name: staff.find((member) => member.id === row.mentioned_by)?.display_name ?? "",
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    excerpt: row.excerpt,
    at: row.at,
    seen_at: row.seen_at,
  };
}

function stagePayload() {
  return stages
    .filter((row) => !row.archived)
    .sort((a, b) => a.position - b.position)
    .map((row) => ({
      key: row.key,
      label: row.label,
      position: row.position,
      win_probability: row.win_probability,
      stale_after_days: row.stale_after_days,
      outcome: row.outcome,
      exit_criteria: row.exit_criteria,
    }));
}

routes.push(
  {
    method: "GET",
    pattern: "hq/home",
    auth: true,
    handler: ({ headers }) => {
      const found = caller(headers);
      if (!found) return refuse(401, "session_invalid");
      const capabilities = CAPABILITIES[found.member.role] ?? [];
      const unseenMentions = mentions
        .filter((row) => row.staff_id === found.member.id && !row.seen_at)
        .sort((a, b) => b.at.localeCompare(a.at));
      const payload: Record<string, unknown> = {
        as_of: now(),
        staff: { display_name: found.member.display_name, role: found.member.role },
        mentions: {
          unseen: unseenMentions.length,
          mentions: unseenMentions.slice(0, 5).map(mentionView),
        },
      };
      if (capabilities.includes("tickets:read")) {
        // As the service counts: open-like and not snoozed; totals over the whole
        // list, the top five only for the card's rows.
        const summaries = tickets.map((row) => ticketSummary(row));
        const openLike = summaries.filter(
          (summary) => ["open", "pending"].includes(summary.status) && !summary.snoozed,
        );
        const troubled = openLike.filter((summary) =>
          ["breached", "at-risk"].includes(summary.sla.status),
        );
        payload.desk = {
          open: openLike.filter((summary) => summary.status === "open").length,
          pending: openLike.filter((summary) => summary.status === "pending").length,
          unassigned: openLike.filter((summary) => !summary.assignee_staff_id).length,
          breached: troubled.filter((summary) => summary.sla.status === "breached").length,
          at_risk: troubled.filter((summary) => summary.sla.status === "at-risk").length,
          tickets: troubled.slice(0, 5),
        };
      }
      if (capabilities.includes("crm:read")) {
        const waiting = leads
          .map(leadView)
          .filter(
            (view) =>
              (view.stage === "new" || view.stage === "attempting") && !view.first_replied_at,
          )
          .sort((a, b) => (b.waiting_minutes ?? 0) - (a.waiting_minutes ?? 0));
        payload.leads = {
          awaiting_first_reply: waiting.length,
          first_reply_overdue: waiting.filter((view) => view.first_reply_overdue).length,
          leads: waiting.slice(0, 5),
        };
        const today = new Date().toISOString().slice(0, 10);
        const mine = tasks
          .filter(
            (task) =>
              task.status === "open" &&
              (task.assignee_staff_id === "" || task.assignee_staff_id === found.member.id),
          )
          .map((row) => taskView(row, true));
        const overdue = mine.filter((task) => task.due_on && task.due_on < today);
        const dueToday = mine.filter((task) => task.due_on === today);
        payload.tasks = {
          open: mine.length,
          overdue: overdue.length,
          due_today: dueToday.length,
          tasks: [...overdue, ...dueToday].slice(0, 5),
        };
        const views = meetings.map(meetingView);
        const todays = views
          .filter((view) => view.starts_at.slice(0, 10) === today && view.status !== "canceled")
          .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
        const owed = views.filter((view) => view.needs_outcome);
        payload.meetings = {
          today: todays.slice(0, 5),
          today_count: todays.length,
          needs_outcome: owed.slice(0, 5),
          needs_outcome_count: owed.length,
        };
      }
      if (capabilities.includes("deals:read")) {
        const open = deals
          .filter((row) => row.status === "open")
          .map((row) => ({
            ...dealSummary(row),
            company_name: companies.find((company) => company.id === row.company_id)?.name ?? "",
          }));
        const flagged = open
          .filter((view) => view.flags.length > 0)
          .sort((a, b) => b.flags.length - a.flags.length);
        const money = seesMoney(headers);
        payload.deals = {
          open_count: open.length,
          open_mrr: moneyByCurrency(open, (view) => view.mrr_amount, money),
          weighted_mrr: moneyByCurrency(open, (view) => view.weighted_mrr, money),
          neglected: open.filter((view) => view.flags.includes("neglected")).length,
          rotting: open.filter((view) => view.flags.includes("rotting")).length,
          no_next_step: open.filter(
            (view) =>
              view.flags.includes("no_next_step") || view.flags.includes("next_step_overdue"),
          ).length,
          deals: flagged.slice(0, 5).map((view) => withoutMoney(view, money)),
        };
      }
      if (capabilities.includes("revenue:read")) {
        const todayIso = today();
        const daysUntil = (day: string) =>
          Math.round((Date.parse(day) - Date.parse(todayIso)) / 86_400_000);
        const soon = contracts.filter(
          (row) =>
            contractState(row) === "active" &&
            row.renews_on !== null &&
            daysUntil(row.renews_on) <= 60,
        );
        const owed = soon
          .filter(
            (row) =>
              (row.renews_on ?? "") < todayIso ||
              !row.renewal_status ||
              row.renewal_status === "at_risk",
          )
          .sort((a, b) => (a.renews_on ?? "").localeCompare(b.renews_on ?? ""));
        payload.renewals = {
          due_60_count: soon.length,
          due_60_mrr: money(
            soon
              .filter((row) => row.currency === "USD")
              .reduce((sum, row) => sum + row.mrr_cents, 0),
          ),
          undecided_count: soon.filter((row) => !row.renewal_status).length,
          at_risk_count: soon.filter((row) => row.renewal_status === "at_risk").length,
          overdue_count: soon.filter((row) => (row.renews_on ?? "") < todayIso).length,
          renewals: owed.slice(0, 5).map((row) => ({
            ...contractView(row),
            weighted_mrr: money(renewalWeightedCents(row)),
          })),
        };
      }
      return ok(payload);
    },
  },
  {
    method: "GET",
    pattern: "hq/companies",
    auth: true,
    capability: "crm:read",
    handler: ({ query, headers }) => {
      const needle = (query.q ?? "").toLowerCase();
      const views = companies
        .filter((row) => !row.archived)
        .filter((row) => !needle || `${row.name} ${row.domain}`.toLowerCase().includes(needle))
        .map((row) => ({
          ...companyView(row),
          people_count: people.filter((person) => person.company_id === row.id).length,
          open_deals: deals.filter((deal) => deal.company_id === row.id && deal.status === "open")
            .length,
          mrr: ledgerMrr(row.id, seesMoney(headers)),
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
      return ok({ companies: views });
    },
  },
  {
    method: "POST",
    pattern: "hq/companies/create",
    auth: true,
    capability: "crm:write",
    handler: ({ body, headers }) => {
      const name = String(body.name ?? "").trim();
      if (!name) return refuse(400, "malformed_request", { name: "a name is required" });
      const companySourceRefusal = sourceRefusal(String(body.source_key ?? ""));
      if (companySourceRefusal) return companySourceRefusal;
      const domain = String(body.domain ?? "")
        .trim()
        .toLowerCase();
      if (domain && FREE_MAIL.has(domain))
        return refuse(400, "malformed_request", {
          domain: "a personal mail domain cannot anchor a company",
        });
      if (domain && companies.some((row) => row.domain === domain))
        return refuse(400, "malformed_request", {
          domain: "another company already holds this domain",
        });
      const found = caller(headers);
      const row: CompanyRow = {
        id: randomUUID(),
        name,
        domain,
        firm_type: String(body.firm_type ?? ""),
        team_size_band: String(body.team_size_band ?? ""),
        country: String(body.country ?? ""),
        lifecycle: "prospect",
        owner_staff_id: found?.member.id ?? "",
        source_key: String(body.source_key ?? ""),
        notes: String(body.notes ?? ""),
        customer_since: null,
        archived: false,
        created_at: now(),
        updated_at: now(),
      };
      companies.push(row);
      audit("company.created", found?.member.id ?? null, "company", row.id);
      return ok({ company: companyView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/companies/{company_id}",
    auth: true,
    capability: "crm:read",
    handler: ({ params, headers }) => {
      const row = companies.find((company) => company.id === params.company_id);
      if (!row) return refuse(404, "not_found");
      return ok(companyDetailPayload(row, seesMoney(headers)));
    },
  },
  {
    method: "POST",
    pattern: "hq/companies/{company_id}/update",
    auth: true,
    capability: "crm:write",
    handler: ({ params, body, headers }) => {
      const row = companies.find((company) => company.id === params.company_id);
      if (!row) return refuse(404, "not_found");
      const before = { ...row };
      if ("source_key" in body) {
        const refusal = sourceRefusal(String(body.source_key ?? ""), row.source_key);
        if (refusal) return refusal;
      }
      if ("name" in body) row.name = String(body.name ?? "").trim() || row.name;
      if ("domain" in body) {
        const domain = String(body.domain ?? "")
          .trim()
          .toLowerCase();
        if (domain && FREE_MAIL.has(domain))
          return refuse(400, "malformed_request", {
            domain: "a personal mail domain cannot anchor a company",
          });
        row.domain = domain;
      }
      for (const name of [
        "firm_type",
        "team_size_band",
        "country",
        "notes",
        "source_key",
      ] as const) {
        if (name in body) row[name] = String(body[name] ?? "");
      }
      if ("lifecycle" in body) {
        const lifecycle = String(body.lifecycle ?? "");
        if (!["prospect", "early_access", "customer", "former_customer"].includes(lifecycle))
          return refuse(400, "malformed_request", { lifecycle: "not a lifecycle" });
        row.lifecycle = lifecycle;
      }
      if (badId(body.owner_staff_id))
        return refuse(400, "malformed_request", { owner_staff_id: "not an id" });
      if ("owner_staff_id" in body) row.owner_staff_id = String(body.owner_staff_id ?? "");
      if ("archived" in body) row.archived = Boolean(body.archived);
      if ("parent_id" in body) {
        const parentId = String(body.parent_id ?? "").trim();
        if (parentId) {
          if (parentId === row.id)
            return refuse(400, "malformed_request", {
              parent_id: "a company cannot be its own parent",
            });
          if (!companies.some((candidate) => candidate.id === parentId))
            return refuse(400, "malformed_request", { parent_id: "no such company" });
          const seen = new Set([row.id]);
          let cursor: string | undefined = parentId;
          while (cursor) {
            if (seen.has(cursor))
              return refuse(400, "malformed_request", {
                parent_id: "that would make the group a loop",
              });
            seen.add(cursor);
            cursor = companies.find((candidate) => candidate.id === cursor)?.parent_id || undefined;
          }
        }
        row.parent_id = parentId;
      }
      row.updated_at = now();
      audit("company.updated", caller(headers)?.member.id ?? null, "company", row.id, "", {
        fields: Object.keys(changesBetween(before, row)).sort(),
        changes: changesBetween(before, row),
      });
      return ok({ company: companyView(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/companies/{company_id}/merge",
    auth: true,
    capability: "crm:write",
    sudo: true,
    handler: ({ params, body, headers }) => {
      const duplicate = companies.find((company) => company.id === params.company_id);
      if (!duplicate) return refuse(404, "not_found");
      const into = String(body.into ?? "").trim();
      if (!into || into === duplicate.id)
        return refuse(400, "malformed_request", { into: "the company to keep" });
      const kept = companies.find((company) => company.id === into);
      if (!kept) return refuse(404, "not_found");
      if (kept.archived)
        return refuse(400, "malformed_request", {
          into: "unarchive it first; a merge cannot land on an archived company",
        });
      const moved: Record<string, number> = {};
      const count = (key: string) => (moved[key] = (moved[key] ?? 0) + 1);
      for (const person of people) {
        if (person.company_id === duplicate.id) {
          person.company_id = kept.id;
          count("hq_people.company_id");
        }
      }
      for (const deal of deals) {
        if (deal.company_id === duplicate.id) {
          deal.company_id = kept.id;
          count("hq_deals.company_id");
        }
      }
      for (const row of contracts) {
        if (row.company_id === duplicate.id) {
          row.company_id = kept.id;
          count("hq_contracts.company_id");
        }
      }
      for (const row of movements) {
        if (row.company_id === duplicate.id) {
          row.company_id = kept.id;
          count("hq_mrr_movements.company_id");
        }
      }
      for (const row of activities) {
        if (row.company_id === duplicate.id) {
          row.company_id = kept.id;
          count("hq_activities.company_id");
        }
      }
      for (const row of tasks) {
        if (row.company_id === duplicate.id) {
          row.company_id = kept.id;
          count("hq_tasks.company_id");
        }
      }
      for (const row of companies) {
        if (row.parent_id === duplicate.id) {
          row.parent_id = kept.id;
          count("hq_companies.parent_id");
        }
      }
      const filled: string[] = [];
      for (const name of [
        "domain",
        "firm_type",
        "team_size_band",
        "country",
        "source_key",
        "owner_staff_id",
      ] as const) {
        if (!kept[name] && duplicate[name]) {
          kept[name] = duplicate[name];
          filled.push(name);
        }
      }
      if (!kept.customer_since && duplicate.customer_since) {
        kept.customer_since = duplicate.customer_since;
        filled.push("customer_since");
      }
      if (!kept.parent_id && duplicate.parent_id && duplicate.parent_id !== kept.id) {
        kept.parent_id = duplicate.parent_id;
        filled.push("parent_id");
      }
      const rank: Record<string, number> = {
        prospect: 0,
        disqualified: 0,
        early_access: 1,
        former_customer: 2,
        customer: 3,
      };
      if ((rank[duplicate.lifecycle] ?? 0) > (rank[kept.lifecycle] ?? 0)) {
        kept.lifecycle = duplicate.lifecycle;
        filled.push("lifecycle");
      }
      kept.notes = mergeNotes(kept.notes, duplicate.notes, duplicate.name);
      kept.updated_at = now();
      duplicate.domain = "";
      duplicate.archived = true;
      duplicate.notes = `Merged into ${kept.name} (${kept.id}) on ${today()}.`;
      duplicate.updated_at = now();
      const actor = caller(headers)?.member.id ?? null;
      recordActivity({
        kind: "system",
        body: `Merged ${duplicate.name} into this company`,
        staff_id: actor ?? "",
        company_id: kept.id,
      });
      audit("company.merged_into", actor, "company", duplicate.id, "", {
        other: kept.id,
        moved,
        filled,
      });
      audit("company.merged_from", actor, "company", kept.id, "", {
        other: duplicate.id,
        moved,
        filled,
      });
      return ok({ company: companyView(kept), moved });
    },
  },
  {
    method: "POST",
    pattern: "hq/companies/import",
    auth: true,
    capability: "crm:write",
    handler: ({ body, headers }) => {
      const rows = body.rows;
      if (!Array.isArray(rows) || !rows.length)
        return refuse(400, "malformed_request", { rows: "a non-empty list" });
      if (rows.length > 500)
        return refuse(400, "malformed_request", { rows: "at most 500 rows at a time" });
      const reason = String(body.reason ?? "").trim();
      if (reason.length < 4)
        return refuse(400, "malformed_request", { reason: "say where the file came from" });
      const domains = new Set(companies.filter((row) => row.domain).map((row) => row.domain));
      const names = new Map(companies.map((row) => [normaliseCompanyName(row.name), row.name]));
      const created: { company_id: string; name: string }[] = [];
      const skipped: { row: number; name: string; reason: string }[] = [];
      const invalid: { row: number; reason: string }[] = [];
      (rows as Record<string, unknown>[]).forEach((raw, index) => {
        const number = index + 1;
        const name = String(raw?.name ?? "")
          .trim()
          .slice(0, 200);
        if (!name) return void invalid.push({ row: number, reason: "a name is required" });
        const domain = String(raw?.domain ?? "")
          .trim()
          .toLowerCase();
        if (domain && FREE_MAIL.has(domain))
          return void invalid.push({
            row: number,
            reason: "a personal mail domain cannot anchor a company",
          });
        const key = normaliseCompanyName(name);
        if (domain && domains.has(domain))
          return void skipped.push({ row: number, name, reason: `domain ${domain} already known` });
        if (key && names.has(key))
          return void skipped.push({ row: number, name, reason: `looks like ${names.get(key)}` });
        const sourceKey = String(raw?.source_key ?? "").trim();
        const row: CompanyRow = {
          id: randomUUID(),
          name,
          domain,
          firm_type: String(raw?.firm_type ?? "").trim(),
          team_size_band: String(raw?.team_size_band ?? "").trim(),
          country: String(raw?.country ?? "").trim(),
          lifecycle: "prospect",
          owner_staff_id: "",
          source_key: sources.some((source) => source.key === sourceKey)
            ? sourceKey
            : sourceKey
              ? "other"
              : "",
          notes: String(raw?.notes ?? "").trim(),
          customer_since: null,
          archived: false,
          created_at: now(),
          updated_at: now(),
        };
        companies.push(row);
        created.push({ company_id: row.id, name });
        if (domain) domains.add(domain);
        if (key) names.set(key, name);
      });
      audit("crm.imported", caller(headers)?.member.id ?? null, "import", "companies", reason, {
        rows: rows.length,
        created: created.length,
        skipped: skipped.length,
        invalid: invalid.length,
      });
      return ok({ created, skipped, invalid, rows: rows.length });
    },
  },
  {
    method: "POST",
    pattern: "hq/companies/{company_id}/link-account",
    auth: true,
    capability: "crm:write",
    handler: ({ params, body, headers }) => {
      const row = companies.find((company) => company.id === params.company_id);
      if (!row) return refuse(404, "not_found");
      if (!String(body.account_user_id ?? "").trim())
        return refuse(400, "malformed_request", { account_user_id: "required" });
      audit("company.account_linked", caller(headers)?.member.id ?? null, "company", row.id);
      return ok({ linked: true });
    },
  },
  {
    method: "GET",
    pattern: "hq/people",
    auth: true,
    capability: "crm:read",
    handler: ({ query }) => {
      const needle = (query.q ?? "").toLowerCase();
      const views = people
        .filter((row) => !row.archived)
        .filter((row) => !needle || `${row.full_name} ${row.email}`.toLowerCase().includes(needle))
        .map((row) => ({
          ...personView(row),
          company_name: companies.find((company) => company.id === row.company_id)?.name ?? "",
        }))
        .sort((a, b) => (a.full_name || a.email).localeCompare(b.full_name || b.email));
      return ok({ people: views });
    },
  },
  {
    method: "POST",
    pattern: "hq/people/create",
    auth: true,
    capability: "crm:write",
    handler: ({ body, headers }) => {
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
      const fullName = String(body.full_name ?? "").trim();
      if (!email && !fullName)
        return refuse(400, "malformed_request", { reason: "a name or an email is required" });
      const personSourceRefusal = sourceRefusal(String(body.source_key ?? ""));
      if (personSourceRefusal) return personSourceRefusal;
      if (email && people.some((row) => row.email === email))
        return refuse(400, "malformed_request", { email: "already a person" });
      const row: PersonRow = {
        id: randomUUID(),
        company_id: String(body.company_id ?? ""),
        full_name: fullName,
        email,
        title: String(body.title ?? ""),
        role_category: String(body.role_category ?? ""),
        phone: String(body.phone ?? ""),
        account_user_id: "",
        do_not_contact: false,
        source_key: String(body.source_key ?? ""),
        notes: String(body.notes ?? ""),
        last_contacted_at: null,
        created_at: now(),
      };
      people.push(row);
      audit("person.created", caller(headers)?.member.id ?? null, "person", row.id);
      return ok({ person: personView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/people/{person_id}",
    auth: true,
    capability: "crm:read",
    handler: ({ params }) => {
      const row = people.find((person) => person.id === params.person_id);
      if (!row) return refuse(404, "not_found");
      const company = companies.find((candidate) => candidate.id === row.company_id);
      return ok({
        person: personView(row),
        company: company ? companyView(company) : null,
        activities: activityViews({ person_id: row.id }),
        open_tasks: tasks
          .filter((task) => task.person_id === row.id && task.status === "open")
          .map((row) => taskView(row)),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/people/{person_id}/merge",
    auth: true,
    capability: "crm:write",
    sudo: true,
    handler: ({ params, body, headers }) => {
      const duplicate = people.find((person) => person.id === params.person_id);
      if (!duplicate) return refuse(404, "not_found");
      const into = String(body.into ?? "").trim();
      if (!into || into === duplicate.id)
        return refuse(400, "malformed_request", { into: "the person to keep" });
      const kept = people.find((person) => person.id === into);
      if (!kept) return refuse(404, "not_found");
      if (kept.archived)
        return refuse(400, "malformed_request", {
          into: "a merge cannot land on an archived person",
        });
      const moved: Record<string, number> = {};
      const count = (key: string) => (moved[key] = (moved[key] ?? 0) + 1);
      for (const deal of deals) {
        if (deal.primary_person_id === duplicate.id) {
          deal.primary_person_id = kept.id;
          count("hq_deals.primary_person_id");
        }
      }
      for (const row of activities) {
        if (row.person_id === duplicate.id) {
          row.person_id = kept.id;
          count("hq_activities.person_id");
        }
      }
      for (const row of tasks) {
        if (row.person_id === duplicate.id) {
          row.person_id = kept.id;
          count("hq_tasks.person_id");
        }
      }
      const filled: string[] = [];
      for (const name of [
        "company_id",
        "full_name",
        "email",
        "title",
        "role_category",
        "phone",
        "account_user_id",
        "source_key",
      ] as const) {
        if (!kept[name] && duplicate[name]) {
          kept[name] = duplicate[name];
          filled.push(name);
        }
      }
      if (duplicate.do_not_contact && !kept.do_not_contact) {
        kept.do_not_contact = true;
        filled.push("do_not_contact");
      }
      if (
        duplicate.last_contacted_at &&
        (!kept.last_contacted_at || duplicate.last_contacted_at > kept.last_contacted_at)
      )
        kept.last_contacted_at = duplicate.last_contacted_at;
      kept.notes = mergeNotes(kept.notes, duplicate.notes, duplicate.full_name || duplicate.email);
      duplicate.email = "";
      duplicate.archived = true;
      duplicate.notes = `Merged into ${kept.full_name || kept.email} (${kept.id}) on ${today()}.`;
      const actor = caller(headers)?.member.id ?? null;
      audit("person.merged_into", actor, "person", duplicate.id, "", {
        other: kept.id,
        moved,
        filled,
      });
      audit("person.merged_from", actor, "person", kept.id, "", {
        other: duplicate.id,
        moved,
        filled,
      });
      return ok({ person: personView(kept), moved });
    },
  },
  {
    method: "POST",
    pattern: "hq/people/import",
    auth: true,
    capability: "crm:write",
    handler: ({ body, headers }) => {
      const rows = body.rows;
      if (!Array.isArray(rows) || !rows.length)
        return refuse(400, "malformed_request", { rows: "a non-empty list" });
      if (rows.length > 500)
        return refuse(400, "malformed_request", { rows: "at most 500 rows at a time" });
      const reason = String(body.reason ?? "").trim();
      if (reason.length < 4)
        return refuse(400, "malformed_request", { reason: "say where the file came from" });
      const byDomain = new Map(
        companies.filter((row) => row.domain && !row.archived).map((row) => [row.domain, row.id]),
      );
      const byName = new Map(
        companies
          .filter((row) => !row.archived)
          .map((row) => [normaliseCompanyName(row.name), row.id]),
      );
      const emails = new Set(
        people.filter((row) => row.email).map((row) => row.email.toLowerCase()),
      );
      const created: { person_id: string; name: string; company_id: string }[] = [];
      const skipped: { row: number; name: string; reason: string }[] = [];
      const invalid: { row: number; reason: string }[] = [];
      (rows as Record<string, unknown>[]).forEach((raw, index) => {
        const number = index + 1;
        const email = String(raw?.email ?? "")
          .trim()
          .toLowerCase();
        const fullName = String(raw?.full_name ?? "")
          .trim()
          .slice(0, 160);
        if (email && !email.includes("@"))
          return void invalid.push({ row: number, reason: "not an address" });
        if (!email && !fullName)
          return void invalid.push({ row: number, reason: "a name or an email is required" });
        if (email && emails.has(email))
          return void skipped.push({
            row: number,
            name: fullName || email,
            reason: `${email} is already a person`,
          });
        let companyId = "";
        const companyDomain = String(raw?.company_domain ?? "")
          .trim()
          .toLowerCase();
        const companyHint = String(raw?.company ?? raw?.company_name ?? "").trim();
        if (companyDomain && byDomain.has(companyDomain)) companyId = byDomain.get(companyDomain)!;
        else if (companyHint && byName.has(normaliseCompanyName(companyHint)))
          companyId = byName.get(normaliseCompanyName(companyHint))!;
        else {
          const mailDomain = email.split("@")[1] ?? "";
          if (mailDomain && !FREE_MAIL.has(mailDomain) && byDomain.has(mailDomain))
            companyId = byDomain.get(mailDomain)!;
        }
        const row: PersonRow = {
          id: randomUUID(),
          company_id: companyId,
          full_name: fullName,
          email,
          title: String(raw?.title ?? "").trim(),
          role_category: String(raw?.role_category ?? "").trim(),
          phone: String(raw?.phone ?? "").trim(),
          account_user_id: "",
          do_not_contact: false,
          source_key: String(raw?.source_key ?? "").trim(),
          notes: String(raw?.notes ?? "").trim(),
          last_contacted_at: null,
          created_at: now(),
        };
        people.push(row);
        created.push({ person_id: row.id, name: fullName || email, company_id: companyId });
        if (email) emails.add(email);
      });
      audit("crm.imported", caller(headers)?.member.id ?? null, "import", "people", reason, {
        rows: rows.length,
        created: created.length,
        skipped: skipped.length,
        invalid: invalid.length,
      });
      return ok({ created, skipped, invalid, rows: rows.length });
    },
  },
  {
    method: "GET",
    pattern: "hq/crm/duplicates",
    auth: true,
    capability: "crm:read",
    handler: () => {
      const byKey = new Map<string, CompanyRow[]>();
      for (const row of companies.filter((company) => !company.archived)) {
        const key = normaliseCompanyName(row.name);
        if (key) byKey.set(key, [...(byKey.get(key) ?? []), row]);
      }
      const companyGroups = [...byKey.values()]
        .filter((rows) => rows.length > 1)
        .map((rows) => ({
          kind: "company",
          reason: "same name once legal suffixes are removed",
          records: rows
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((row) => ({
              company_id: row.id,
              name: row.name,
              domain: row.domain,
              lifecycle: row.lifecycle,
            })),
        }));
      const groups = new Map<string, PersonRow[]>();
      for (const row of people.filter((person) => !person.archived)) {
        const full = row.full_name.toLowerCase().split(/\s+/).filter(Boolean).join(" ");
        if (full && row.company_id)
          groups.set(`name:${row.company_id}:${full}`, [
            ...(groups.get(`name:${row.company_id}:${full}`) ?? []),
            row,
          ]);
        if (row.email.includes("@")) {
          const [local, domain] = row.email.toLowerCase().split("@") as [string, string];
          const key = `email:${domain}:${local.split("+")[0]!.replace(/\./g, "")}`;
          groups.set(key, [...(groups.get(key) ?? []), row]);
        }
      }
      const seen = new Set<string>();
      const peopleGroups: { kind: string; reason: string; records: Record<string, string>[] }[] =
        [];
      for (const [key, rows] of groups) {
        if (rows.length < 2) continue;
        const ids = rows
          .map((row) => row.id)
          .sort()
          .join(",");
        if (seen.has(ids)) continue;
        seen.add(ids);
        peopleGroups.push({
          kind: "person",
          reason: key.startsWith("name:")
            ? "same name at the same company"
            : "same address once dots and plus-tags are removed",
          records: rows
            .sort((a, b) => a.created_at.localeCompare(b.created_at))
            .map((row) => ({
              person_id: row.id,
              full_name: row.full_name,
              email: row.email,
              company_name: companies.find((company) => company.id === row.company_id)?.name ?? "",
            })),
        });
      }
      return ok({
        groups: [...companyGroups, ...peopleGroups],
        companies: companyGroups.length,
        people: peopleGroups.length,
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/views",
    auth: true,
    handler: ({ headers, query }) => {
      const me = caller(headers)!.member.id;
      const listKey = String(query.list ?? "");
      if (listKey && !/^[a-z][a-z0-9_-]{1,39}$/.test(listKey))
        return refuse(400, "malformed_request", { list: "lowercase letters, digits, dashes" });
      const rows = savedViews
        .filter(
          (row) =>
            (!listKey || row.list_key === listKey) && (row.owner_staff_id === me || row.shared),
        )
        .sort(
          (a, b) =>
            Number(a.owner_staff_id !== me) - Number(b.owner_staff_id !== me) ||
            a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
        );
      return ok({ views: rows.map((row) => viewView(row, me)) });
    },
  },
  {
    method: "POST",
    pattern: "hq/views/save",
    auth: true,
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const me = found.member.id;
      const isAdmin = (CAPABILITIES[found.member.role] ?? []).includes("hq:admin");
      const cleanQuery = (value: unknown) => {
        const text = String(value ?? "").trim();
        if (text.length > 400) return null;
        if (/[\n\r<>]/.test(text)) return null;
        return text.replace(/^\?/, "");
      };
      const viewId = String(body.view_id ?? "").trim();
      if (viewId) {
        const row = savedViews.find((candidate) => candidate.id === viewId);
        if (!row) return refuse(404, "not_found");
        if (row.owner_staff_id !== me && !isAdmin)
          return refuse(403, "forbidden", { reason: "not your view" });
        let changed = false;
        if ("name" in body) {
          const name = String(body.name ?? "")
            .trim()
            .slice(0, 80);
          if (!name) return refuse(400, "malformed_request", { name: "name the view" });
          row.name = name;
          changed = true;
        }
        if ("query" in body) {
          const query = cleanQuery(body.query);
          if (query === null) return refuse(400, "malformed_request", { query: "a query string" });
          row.query = query;
          changed = true;
        }
        if ("shared" in body) {
          if (typeof body.shared !== "boolean")
            return refuse(400, "malformed_request", { shared: "true or false" });
          row.shared = body.shared;
          changed = true;
        }
        if (!changed) return refuse(400, "malformed_request", { reason: "nothing to change" });
        row.updated_at = now();
        audit("view.updated", me, "saved_view", row.id);
        return ok({ view: viewView(row, me) });
      }
      const listKey = String(body.list_key ?? "").trim();
      if (!/^[a-z][a-z0-9_-]{1,39}$/.test(listKey))
        return refuse(400, "malformed_request", { list_key: "lowercase letters, digits, dashes" });
      const name = String(body.name ?? "")
        .trim()
        .slice(0, 80);
      if (!name) return refuse(400, "malformed_request", { name: "name the view" });
      const query = cleanQuery(body.query);
      if (query === null) return refuse(400, "malformed_request", { query: "a query string" });
      const mine = savedViews.filter(
        (row) => row.list_key === listKey && row.owner_staff_id === me,
      );
      if (mine.length >= 20)
        return refuse(400, "malformed_request", {
          reason: "at most 20 views of one list per person",
        });
      if (mine.some((row) => row.name.toLowerCase() === name.toLowerCase()))
        return refuse(400, "malformed_request", { name: "you already have a view with that name" });
      const row: SavedViewRow = {
        id: randomUUID(),
        list_key: listKey,
        name,
        query,
        shared: body.shared === true,
        owner_staff_id: me,
        updated_at: now(),
      };
      savedViews.push(row);
      audit("view.saved", me, "saved_view", row.id, "", {
        list_key: listKey,
        name,
        shared: row.shared,
      });
      return ok({ view: viewView(row, me) });
    },
  },
  {
    method: "POST",
    pattern: "hq/views/{view_id}/delete",
    auth: true,
    handler: ({ headers, params }) => {
      const found = caller(headers)!;
      const index = savedViews.findIndex((row) => row.id === params.view_id);
      if (index < 0) return refuse(404, "not_found");
      const row = savedViews[index]!;
      if (
        row.owner_staff_id !== found.member.id &&
        !(CAPABILITIES[found.member.role] ?? []).includes("hq:admin")
      )
        return refuse(403, "forbidden", { reason: "not your view" });
      savedViews.splice(index, 1);
      audit("view.deleted", found.member.id, "saved_view", row.id, "", {
        list_key: row.list_key,
        name: row.name,
      });
      return ok({ deleted: true });
    },
  },
  {
    method: "GET",
    pattern: "hq/preferences",
    auth: true,
    handler: ({ headers }) => {
      const me = caller(headers)!.member.id;
      const mine: Record<string, string> = {};
      for (const [key, value] of preferences) {
        const [owner, name] = key.split("\u0000") as [string, string];
        if (owner === me) mine[name] = value;
      }
      return ok({ preferences: mine });
    },
  },
  {
    method: "POST",
    pattern: "hq/preferences/set",
    auth: true,
    handler: ({ headers, body }) => {
      const me = caller(headers)!.member.id;
      const key = String(body.key ?? "").trim();
      if (!/^[a-z][a-z0-9_.:-]{1,63}$/.test(key))
        return refuse(400, "malformed_request", {
          key: "lowercase letters, digits, dots, colons, dashes",
        });
      if (typeof body.value !== "string")
        return refuse(400, "malformed_request", { value: "text" });
      if (body.value.length > 2000)
        return refuse(400, "malformed_request", { value: "at most 2000 characters" });
      if (body.value === "") preferences.delete(`${me}\u0000${key}`);
      else preferences.set(`${me}\u0000${key}`, body.value);
      return ok({ key, value: body.value });
    },
  },
  {
    method: "GET",
    pattern: "hq/mentions",
    auth: true,
    handler: ({ headers, query }) => {
      const me = caller(headers)!.member.id;
      const rows = mentions
        .filter((row) => row.staff_id === me && (query.unseen !== "1" || !row.seen_at))
        .sort((a, b) => b.at.localeCompare(a.at))
        .slice(0, 50);
      return ok({
        mentions: rows.map(mentionView),
        unseen: rows.filter((row) => !row.seen_at).length,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/mentions/{mention_id}/seen",
    auth: true,
    handler: ({ headers, params }) => {
      const me = caller(headers)!.member.id;
      const row = mentions.find(
        (candidate) =>
          candidate.id === params.mention_id && candidate.staff_id === me && !candidate.seen_at,
      );
      if (!row) return refuse(404, "not_found");
      row.seen_at = now();
      audit("mention.seen", me, "mention", row.id);
      return ok({ seen: true });
    },
  },
  {
    method: "POST",
    pattern: "hq/people/{person_id}/update",
    auth: true,
    capability: "crm:write",
    handler: ({ params, body, headers }) => {
      const row = people.find((person) => person.id === params.person_id);
      if (!row) return refuse(404, "not_found");
      const before = { ...row };
      for (const name of [
        "full_name",
        "title",
        "role_category",
        "phone",
        "notes",
        "email",
      ] as const) {
        if (name in body) row[name] = String(body[name] ?? "");
      }
      if ("company_id" in body) row.company_id = String(body.company_id ?? "");
      if ("do_not_contact" in body) row.do_not_contact = Boolean(body.do_not_contact);
      audit("person.updated", caller(headers)?.member.id ?? null, "person", row.id, "", {
        fields: Object.keys(changesBetween(before, row)).sort(),
        changes: changesBetween(before, row),
      });
      return ok({ person: personView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/leads",
    auth: true,
    capability: "crm:read",
    handler: ({ query }) => {
      const views = leads.map(leadView);
      const counts: Record<string, number> = {
        new: 0,
        attempting: 0,
        connected: 0,
        qualified: 0,
        disqualified: 0,
        first_reply_overdue: 0,
      };
      for (const view of views) {
        counts[view.stage] = (counts[view.stage] ?? 0) + 1;
        if (view.first_reply_overdue)
          counts.first_reply_overdue = (counts.first_reply_overdue ?? 0) + 1;
      }
      const needle = (query.q ?? "").toLowerCase();
      const visible = views
        .filter((view) => !query.stage || view.stage === query.stage)
        .filter((view) => !query.source || view.source_key === query.source)
        .filter(
          (view) =>
            !needle ||
            `${view.full_name} ${view.email} ${view.company_name}`.toLowerCase().includes(needle),
        )
        .sort((a, b) => {
          if (a.first_reply_overdue !== b.first_reply_overdue)
            return a.first_reply_overdue ? -1 : 1;
          return (b.waiting_minutes ?? 0) - (a.waiting_minutes ?? 0);
        });
      return ok({
        leads: visible,
        counts,
        stages: ["new", "attempting", "connected", "qualified", "disqualified"],
        first_reply_target_minutes: FIRST_REPLY_TARGET_MINUTES,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/leads/create",
    auth: true,
    capability: "crm:write",
    handler: ({ body, headers }) => {
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
      const fullName = String(body.full_name ?? "").trim();
      if (!email && !fullName)
        return refuse(400, "malformed_request", { reason: "a name or an email is required" });
      const leadSource = String(body.source_key ?? "") || "outbound";
      const leadSourceRefusal = sourceRefusal(leadSource);
      if (leadSourceRefusal) return leadSourceRefusal;
      const found = caller(headers);
      const row: LeadRow = {
        id: randomUUID(),
        source_key: leadSource,
        email,
        full_name: fullName,
        company_name: String(body.company_name ?? ""),
        message: String(body.message ?? ""),
        payload: {},
        stage: "new",
        disqualify_reason: "",
        owner_staff_id: found?.member.id ?? "",
        first_replied_at: null,
        converted_company_id: "",
        converted_person_id: "",
        converted_deal_id: "",
        created_at: now(),
      };
      leads.push(row);
      audit("lead.created", found?.member.id ?? null, "lead", row.id);
      return ok({ lead: leadView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/leads/{lead_id}",
    auth: true,
    capability: "crm:read",
    handler: ({ params }) => {
      const row = leads.find((lead) => lead.id === params.lead_id);
      if (!row) return refuse(404, "not_found");
      const person = row.email
        ? people.find((candidate) => candidate.email === row.email)
        : undefined;
      const domain = domainOf(row.email);
      const company = domain
        ? companies.find((candidate) => candidate.domain === domain)
        : undefined;
      return ok({
        lead: leadView(row),
        matches: {
          person: person ? personView(person) : null,
          company: company ? companyView(company) : null,
        },
        activities: activityViews({ lead_id: row.id }),
        first_reply_target_minutes: 60,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/leads/{lead_id}/update",
    auth: true,
    capability: "crm:write",
    handler: ({ params, body, headers }) => {
      const row = leads.find((lead) => lead.id === params.lead_id);
      if (!row) return refuse(404, "not_found");
      if (row.anonymised_at) return refuse(400, "malformed_request", ANONYMISED);
      const before = { ...row };
      const stage = String(body.stage ?? "");
      if (stage) {
        if (!["new", "attempting", "connected", "disqualified"].includes(stage))
          return refuse(400, "malformed_request", { stage: "qualify by converting" });
        if (row.stage === "qualified")
          return refuse(400, "malformed_request", { stage: "already converted; work the deal" });
        if (row.stage === "disqualified" && stage !== "disqualified") row.disqualify_reason = "";
        if (badId(body.owner_staff_id))
          return refuse(400, "malformed_request", { owner_staff_id: "not an id" });
        if (stage === "disqualified") {
          const reason = String(body.disqualify_reason ?? "");
          if (!DISQUALIFY_REASONS.includes(reason))
            return refuse(400, "malformed_request", { disqualify_reason: "pick a reason" });
          row.disqualify_reason = reason;
        }
        row.stage = stage;
      }
      if ("owner_staff_id" in body) row.owner_staff_id = String(body.owner_staff_id ?? "");
      row.updated_at = now();
      audit("lead.updated", caller(headers)?.member.id ?? null, "lead", row.id, "", {
        fields: Object.keys(changesBetween(before, row)).sort(),
        changes: changesBetween(before, row),
      });
      return ok({ lead: leadView(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/leads/{lead_id}/convert",
    auth: true,
    capability: "crm:write",
    handler: ({ params, body, headers }) => {
      const row = leads.find((lead) => lead.id === params.lead_id);
      if (!row) return refuse(404, "not_found");
      if (row.anonymised_at) return refuse(400, "malformed_request", ANONYMISED);
      if (row.stage === "qualified" || row.stage === "disqualified")
        return refuse(400, "malformed_request", { stage: "already closed" });
      if (row.converted_company_id || row.converted_deal_id)
        return refuse(400, "malformed_request", { stage: "already converted" });
      const found = caller(headers);
      const companyInput = (body.company ?? {}) as Record<string, unknown>;
      // Everything is decided before anything is written, as the service does it.
      if (body.deal && typeof body.deal === "object") {
        const dealInput = body.deal as Record<string, unknown>;
        if (
          !String(dealInput.next_step ?? "").trim() ||
          !String(dealInput.next_step_due ?? "").trim()
        )
          return refuse(400, "malformed_request", {
            next_step: "an open deal names its next step",
          });
        if (String(dealInput.next_step_due) < new Date().toISOString().slice(0, 10))
          return refuse(400, "malformed_request", { next_step_due: "today or later" });
        const mrr = Number(dealInput.mrr_amount ?? 0);
        if (!Number.isFinite(mrr) || mrr < 0)
          return refuse(400, "malformed_request", { mrr_amount: "a number" });
        if (mrr > 10_000_000)
          return refuse(400, "malformed_request", { mrr_amount: "at most 10,000,000" });
      }
      const typed = normaliseDomain(companyInput.domain);
      if (typed && FREE_MAIL.has(typed))
        return refuse(400, "malformed_request", {
          domain: "a personal mail domain cannot anchor a company",
        });
      const domain = typed || domainOf(row.email);
      let company =
        companies.find((candidate) => candidate.id === String(companyInput.company_id ?? "")) ??
        (domain
          ? companies.find((candidate) => candidate.domain === domain && !candidate.archived)
          : undefined);
      if (!company) {
        const name =
          String(companyInput.name ?? "").trim() ||
          row.company_name ||
          (domain
            ? `${domain.split(".")[0]![0]!.toUpperCase()}${domain.split(".")[0]!.slice(1)}`
            : "");
        if (!name)
          return refuse(400, "malformed_request", { company: "a company name is required" });
        company = {
          id: randomUUID(),
          name,
          domain,
          firm_type: row.payload.where ?? "",
          team_size_band: row.payload.team_size ?? "",
          country: "",
          lifecycle: "prospect",
          owner_staff_id: found?.member.id ?? "",
          source_key: row.source_key,
          notes: "",
          customer_since: null,
          archived: false,
          created_at: now(),
          updated_at: now(),
        };
        companies.push(company);
      }
      let person = row.email
        ? people.find((candidate) => candidate.email === row.email)
        : undefined;
      if (!person) {
        person = {
          id: randomUUID(),
          company_id: company.id,
          full_name: row.full_name,
          email: row.email,
          title: row.payload.role ?? "",
          role_category: "",
          phone: "",
          account_user_id: "",
          do_not_contact: false,
          source_key: row.source_key,
          notes: "",
          last_contacted_at: row.first_replied_at,
          created_at: now(),
        };
        people.push(person);
      }
      let dealId = "";
      if (body.deal && typeof body.deal === "object") {
        const dealInput = body.deal as Record<string, unknown>;
        const nextStep = String(dealInput.next_step ?? "").trim();
        const nextStepDue = String(dealInput.next_step_due ?? "").trim();
        if (!nextStep || !nextStepDue)
          return refuse(400, "malformed_request", {
            next_step: "an open deal names its next step",
          });
        const deal: DealRow = {
          id: randomUUID(),
          name: String(dealInput.name ?? "").trim() || `${company.name} — new business`,
          company_id: company.id,
          primary_person_id: person.id,
          stage_key: String(dealInput.stage_key ?? "") || "demo_booked",
          status: "open",
          mrr_amount: Number(dealInput.mrr_amount ?? 0) || 0,
          currency: "USD",
          seats: Number(dealInput.seats ?? 1) || 1,
          expected_close_date: "",
          next_step: nextStep,
          next_step_due: nextStepDue,
          owner_staff_id: found?.member.id ?? "",
          source_key: row.source_key,
          notes: "",
          entered_stage_at: now(),
          last_activity_at: now(),
          loss_reason: "",
          loss_competitor: "",
          loss_detail: "",
          closed_at: null,
          created_at: now(),
        };
        deals.push(deal);
        dealStageEvents.push({
          deal_id: deal.id,
          from_stage_key: "",
          to_stage_key: deal.stage_key,
          at: now(),
          staff_id: found?.member.id ?? "",
        });
        dealId = deal.id;
      }
      row.stage = "qualified";
      row.converted_company_id = company.id;
      row.converted_person_id = person.id;
      row.converted_deal_id = dealId;
      recordActivity({
        kind: "system",
        body: "Qualified from a lead",
        staff_id: found?.member.id ?? "",
        staff_name: found?.member.display_name ?? "",
        company_id: company.id,
        person_id: person.id,
        deal_id: dealId,
        lead_id: row.id,
      });
      audit("lead.converted", found?.member.id ?? null, "lead", row.id);
      return ok({ company_id: company.id, person_id: person.id, deal_id: dealId });
    },
  },
  {
    method: "GET",
    pattern: "hq/deals",
    auth: true,
    capability: "deals:read",
    handler: ({ query, headers }) => {
      const statusFilter = query.status ?? "open";
      const money = seesMoney(headers);
      const views = deals
        .map((row) => ({
          ...dealSummary(row),
          company_name: companies.find((company) => company.id === row.company_id)?.name ?? "",
        }))
        .filter((view) => statusFilter === "all" || view.status === statusFilter);
      const columns = stages
        .filter((stage) => !stage.archived)
        .filter((stage) => !(stage.outcome && statusFilter === "open"))
        .sort((a, b) => a.position - b.position)
        .map((stage) => {
          const stageDeals = views
            .filter((view) => view.stage_key === stage.key)
            .sort((a, b) => (a.next_step_due || "9999").localeCompare(b.next_step_due || "9999"));
          return {
            key: stage.key,
            label: stage.label,
            win_probability: stage.win_probability,
            stale_after_days: stage.stale_after_days,
            outcome: stage.outcome,
            exit_criteria: stage.exit_criteria,
            deals: stageDeals.map((view) => withoutMoney(view, money)),
            mrr_total: moneyByCurrency(stageDeals, (view) => view.mrr_amount, money),
            weighted_total: moneyByCurrency(stageDeals, (view) => view.weighted_mrr, money),
          };
        });
      const open = views.filter((view) => view.status === "open");
      return ok({
        columns,
        totals: {
          open_count: open.length,
          open_mrr: moneyByCurrency(open, (view) => view.mrr_amount, money),
          weighted_mrr: moneyByCurrency(open, (view) => view.weighted_mrr, money),
        },
        attention: {
          neglected: open.filter((view) => view.flags.includes("neglected")).length,
          rotting: open.filter((view) => view.flags.includes("rotting")).length,
          no_next_step: open.filter(
            (view) =>
              view.flags.includes("no_next_step") || view.flags.includes("next_step_overdue"),
          ).length,
        },
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/deals/create",
    auth: true,
    capability: "deals:write",
    handler: ({ body, headers }) => {
      const company = companies.find((row) => row.id === String(body.company_id ?? ""));
      if (!company) return refuse(404, "not_found");
      const nextStep = String(body.next_step ?? "").trim();
      const nextStepDue = String(body.next_step_due ?? "").trim();
      if (!nextStep || !nextStepDue)
        return refuse(400, "malformed_request", { next_step: "an open deal names its next step" });
      const stageKey = String(body.stage_key ?? "") || "demo_booked";
      const stage = stageOf(stageKey);
      if (!stage || stage.outcome)
        return refuse(400, "malformed_request", { stage_key: "not an open pipeline stage" });
      const found = caller(headers);
      const planKey = String(body.plan_key ?? "").trim();
      const plan = planKey ? activePlan(planKey) : null;
      if (planKey && !plan)
        return refuse(400, "malformed_request", { plan_key: "not a plan on the price list" });
      const askedSeats = Number(body.seats ?? 1) || 1;
      const seats = plan ? Math.max(askedSeats, plan.min_seats) : askedSeats;
      const row: DealRow = {
        id: randomUUID(),
        name: String(body.name ?? "").trim() || `${company.name} — new business`,
        company_id: company.id,
        primary_person_id: String(body.primary_person_id ?? ""),
        stage_key: stageKey,
        status: "open",
        mrr_amount: plan
          ? Math.round(plan.unit_amount * seats * 100) / 100
          : Number(body.mrr_amount ?? 0) || 0,
        currency: plan ? plan.currency : String(body.currency ?? "USD") || "USD",
        plan_key: planKey,
        seats,
        expected_close_date: String(body.expected_close_date ?? ""),
        next_step: nextStep,
        next_step_due: nextStepDue,
        owner_staff_id: found?.member.id ?? "",
        source_key: String(body.source_key ?? ""),
        notes: String(body.notes ?? ""),
        entered_stage_at: now(),
        last_activity_at: now(),
        loss_reason: "",
        loss_competitor: "",
        loss_detail: "",
        closed_at: null,
        created_at: now(),
      };
      deals.push(row);
      dealStageEvents.push({
        deal_id: row.id,
        from_stage_key: "",
        to_stage_key: stageKey,
        at: now(),
        staff_id: found?.member.id ?? "",
      });
      audit("deal.created", found?.member.id ?? null, "deal", row.id);
      return ok({ deal: withoutMoney(dealSummary(row), seesMoney(headers)) });
    },
  },
  {
    method: "GET",
    pattern: "hq/deals/{deal_id}",
    auth: true,
    capability: "deals:read",
    handler: ({ params, headers }) => {
      const row = deals.find((deal) => deal.id === params.deal_id);
      if (!row) return refuse(404, "not_found");
      const company = companies.find((candidate) => candidate.id === row.company_id);
      const person = people.find((candidate) => candidate.id === row.primary_person_id);
      return ok({
        deal: { ...withoutMoney(dealSummary(row), seesMoney(headers)), notes: row.notes },
        company: company ? companyView(company) : null,
        primary_person: person ? personView(person) : null,
        stage_history: dealStageEvents
          .filter((event) => event.deal_id === row.id)
          .map((event) => ({
            from_stage_key: event.from_stage_key,
            to_stage_key: event.to_stage_key,
            at: event.at,
            staff_id: event.staff_id,
          })),
        activities: activityViews({ deal_id: row.id }),
        open_tasks: tasks
          .filter((task) => task.deal_id === row.id && task.status === "open")
          .map((row) => taskView(row)),
        stages: stages
          .filter((stage) => !stage.archived)
          .sort((a, b) => a.position - b.position)
          .map((stage) => ({
            key: stage.key,
            label: stage.label,
            outcome: stage.outcome,
            exit_criteria: stage.exit_criteria,
          })),
        loss_reasons: LOSS_REASONS,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/deals/{deal_id}/update",
    auth: true,
    capability: "deals:write",
    handler: ({ params, body, headers }) => {
      const row = deals.find((deal) => deal.id === params.deal_id);
      if (!row) return refuse(404, "not_found");
      const before = { ...row };
      if ("stage_key" in body || "status" in body)
        return refuse(400, "malformed_request", {
          reason: "move stages via /stage, close via /close",
        });
      if ("name" in body) row.name = String(body.name ?? "").trim() || row.name;
      if ("mrr_amount" in body) row.mrr_amount = Number(body.mrr_amount ?? 0) || 0;
      if ("seats" in body) row.seats = Math.max(Number(body.seats ?? 1) || 1, 1);
      if ("plan_key" in body) {
        const planKey = String(body.plan_key ?? "").trim();
        row.plan_key = planKey;
        if (planKey) {
          const plan = activePlan(planKey);
          if (!plan)
            return refuse(400, "malformed_request", { plan_key: "not a plan on the price list" });
          row.seats = Math.max(row.seats, plan.min_seats);
          row.currency = plan.currency;
          if (!("mrr_amount" in body))
            row.mrr_amount = Math.round(plan.unit_amount * row.seats * 100) / 100;
        }
      }
      if ("expected_close_date" in body)
        row.expected_close_date = String(body.expected_close_date ?? "");
      if ("next_step" in body || "next_step_due" in body) {
        const nextStep = String(body.next_step ?? row.next_step).trim();
        const nextStepDue = String(body.next_step_due ?? row.next_step_due).trim();
        if (row.status === "open" && (!nextStep || !nextStepDue))
          return refuse(400, "malformed_request", {
            next_step: "an open deal names its next step",
          });
        row.next_step = nextStep;
        row.next_step_due = nextStepDue;
      }
      if ("owner_staff_id" in body) row.owner_staff_id = String(body.owner_staff_id ?? "");
      if ("primary_person_id" in body) row.primary_person_id = String(body.primary_person_id ?? "");
      if ("notes" in body) row.notes = String(body.notes ?? "");
      audit("deal.updated", caller(headers)?.member.id ?? null, "deal", row.id, "", {
        fields: Object.keys(changesBetween(before, row)).sort(),
        changes: changesBetween(before, row),
      });
      return ok({ deal: withoutMoney(dealSummary(row), seesMoney(headers)) });
    },
  },
  {
    method: "POST",
    pattern: "hq/deals/{deal_id}/stage",
    auth: true,
    capability: "deals:write",
    handler: ({ params, body, headers }) => {
      const row = deals.find((deal) => deal.id === params.deal_id);
      if (!row) return refuse(404, "not_found");
      if (row.status !== "open")
        return refuse(400, "malformed_request", { status: "only an open deal moves" });
      const stage = stageOf(String(body.stage_key ?? ""));
      if (!stage || stage.archived)
        return refuse(400, "malformed_request", { stage_key: "not a pipeline stage" });
      if (stage.outcome) return refuse(400, "malformed_request", { stage_key: "close via /close" });
      if (stage.key === row.stage_key)
        return refuse(400, "malformed_request", { stage_key: "already there" });
      const nextStep = String(body.next_step ?? "").trim();
      const nextStepDue = String(body.next_step_due ?? "").trim();
      if (!nextStep || !nextStepDue)
        return refuse(400, "malformed_request", { next_step: "an open deal names its next step" });
      const found = caller(headers);
      dealStageEvents.push({
        deal_id: row.id,
        from_stage_key: row.stage_key,
        to_stage_key: stage.key,
        at: now(),
        staff_id: found?.member.id ?? "",
      });
      recordActivity({
        kind: "stage_change",
        body: `${row.stage_key} -> ${stage.key}`,
        staff_id: found?.member.id ?? "",
        staff_name: found?.member.display_name ?? "",
        company_id: row.company_id,
        deal_id: row.id,
      });
      row.stage_key = stage.key;
      row.entered_stage_at = now();
      row.last_activity_at = now();
      row.next_step = nextStep;
      row.next_step_due = nextStepDue;
      audit("deal.stage_moved", found?.member.id ?? null, "deal", row.id);
      return ok({ deal: withoutMoney(dealSummary(row), seesMoney(headers)) });
    },
  },
  {
    method: "POST",
    pattern: "hq/deals/{deal_id}/close",
    auth: true,
    capability: "deals:write",
    handler: ({ params, body, headers }) => {
      const row = deals.find((deal) => deal.id === params.deal_id);
      if (!row) return refuse(404, "not_found");
      if (row.status !== "open")
        return refuse(400, "malformed_request", { status: "already closed" });
      const outcome = String(body.outcome ?? "");
      if (!["won", "lost", "unqualified"].includes(outcome))
        return refuse(400, "malformed_request", { outcome: "won, lost or unqualified" });
      if (outcome === "lost") {
        const reason = String(body.loss_reason ?? "");
        if (!LOSS_REASONS.includes(reason))
          return refuse(400, "malformed_request", { loss_reason: "pick a reason" });
        if (reason === "competitor" && !String(body.loss_competitor ?? "").trim())
          return refuse(400, "malformed_request", { loss_competitor: "name the competitor" });
        row.loss_reason = reason;
        row.loss_competitor = String(body.loss_competitor ?? "");
        row.loss_detail = String(body.loss_detail ?? "");
      }
      const found = caller(headers);
      dealStageEvents.push({
        deal_id: row.id,
        from_stage_key: row.stage_key,
        to_stage_key: outcome,
        at: now(),
        staff_id: found?.member.id ?? "",
      });
      row.status = outcome;
      row.stage_key = outcome;
      row.entered_stage_at = now();
      row.closed_at = now();
      row.next_step = "";
      row.next_step_due = "";
      if (outcome === "won") {
        const company = companies.find((candidate) => candidate.id === row.company_id);
        if (company && company.lifecycle !== "customer") {
          company.lifecycle = "customer";
          company.customer_since = company.customer_since ?? now().slice(0, 10);
        }
      }
      recordActivity({
        kind: "system",
        body: `Closed ${outcome}`,
        staff_id: found?.member.id ?? "",
        staff_name: found?.member.display_name ?? "",
        company_id: row.company_id,
        deal_id: row.id,
      });
      audit("deal.closed", found?.member.id ?? null, "deal", row.id);
      return ok({ deal: withoutMoney(dealSummary(row), seesMoney(headers)) });
    },
  },
  {
    method: "GET",
    pattern: "hq/activities",
    auth: true,
    capability: "crm:read",
    handler: ({ query }) => {
      const filter: Partial<Record<"company_id" | "person_id" | "deal_id" | "lead_id", string>> =
        {};
      for (const name of ["company_id", "person_id", "deal_id", "lead_id"] as const) {
        if (badId(query[name])) return refuse(400, "malformed_request", { [name]: "not an id" });
        if (query[name]) filter[name] = query[name];
      }
      if (Object.keys(filter).length === 0)
        return refuse(400, "malformed_request", { reason: "name a record" });
      return ok({ activities: activityViews(filter) });
    },
  },
  {
    method: "POST",
    pattern: "hq/activities/log",
    auth: true,
    capability: "crm:write",
    handler: ({ body, headers }) => {
      const kind = String(body.kind ?? "");
      if (!["note", "call", "email_out", "email_in"].includes(kind))
        return refuse(400, "malformed_request", { kind: "note, call, email_out or email_in" });
      const text = String(body.body ?? "").trim();
      if (!text) return refuse(400, "malformed_request", { body: "write what happened" });
      const links = {
        company_id: String(body.company_id ?? ""),
        person_id: String(body.person_id ?? ""),
        deal_id: String(body.deal_id ?? ""),
        lead_id: String(body.lead_id ?? ""),
      };
      const meetingId = String(body.meeting_id ?? "");
      if (!Object.values(links).some(Boolean) && !meetingId)
        return refuse(400, "malformed_request", { reason: "link at least one record" });
      const leadRefusal = linkedLeadRefusal(links.lead_id);
      if (leadRefusal) return leadRefusal;
      const found = caller(headers);
      recordActivity({
        kind,
        body: text,
        staff_id: found?.member.id ?? "",
        staff_name: found?.member.display_name ?? "",
        ...links,
      });
      if (meetingId)
        (activities[activities.length - 1] as ActivityRow & { meeting_id?: string }).meeting_id =
          meetingId;
      const mentioned = recordMentions(found?.member.id ?? "", text, {
        ...links,
        meeting_id: meetingId,
      });
      const deal = deals.find((candidate) => candidate.id === links.deal_id);
      if (deal) deal.last_activity_at = now();
      const lead = leads.find((candidate) => candidate.id === links.lead_id);
      if (lead) {
        if ((kind === "call" || kind === "email_out") && !lead.first_replied_at) {
          lead.first_replied_at = now();
          if (lead.stage === "new") lead.stage = "attempting";
        }
        if (kind === "email_in" && (lead.stage === "new" || lead.stage === "attempting"))
          lead.stage = "connected";
      }
      audit("activity.logged", found?.member.id ?? null, "activity", kind, "", {
        ...(mentioned.length ? { mentioned } : {}),
      });
      return ok({ logged: true, mentioned });
    },
  },
  {
    method: "GET",
    pattern: "hq/tasks",
    auth: true,
    capability: "crm:read",
    handler: ({ query, headers }) => {
      const found = caller(headers);
      const scope = query.scope ?? "mine";
      const status = query.status ?? "open";
      const views = tasks
        .map((row) => taskView(row, true))
        .filter((view) => !status || view.status === status)
        .filter(
          (view) =>
            scope !== "mine" ||
            view.assignee_staff_id === "" ||
            view.assignee_staff_id === (found?.member.id ?? ""),
        )
        .sort((a, b) => (a.due_on || "9999").localeCompare(b.due_on || "9999"));
      const today = new Date().toISOString().slice(0, 10);
      return ok({
        tasks: views,
        counts: {
          overdue: views.filter(
            (view) => view.status === "open" && view.due_on && view.due_on < today,
          ).length,
          open: views.length,
        },
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/tasks/create",
    auth: true,
    capability: "crm:write",
    handler: ({ body, headers }) => {
      const title = String(body.title ?? "").trim();
      if (!title) return refuse(400, "malformed_request", { title: "required" });
      const taskLeadRefusal = linkedLeadRefusal(String(body.lead_id ?? ""));
      if (taskLeadRefusal) return taskLeadRefusal;
      const found = caller(headers);
      const row: TaskRow = {
        id: randomUUID(),
        title,
        body: String(body.body ?? ""),
        status: "open",
        priority: String(body.priority ?? "medium") || "medium",
        due_on: String(body.due_on ?? ""),
        assignee_staff_id: String(body.assignee_staff_id ?? "") || (found?.member.id ?? ""),
        company_id: String(body.company_id ?? ""),
        person_id: String(body.person_id ?? ""),
        deal_id: String(body.deal_id ?? ""),
        lead_id: String(body.lead_id ?? ""),
        ticket_id: String(body.ticket_id ?? ""),
        origin: "manual",
        completed_at: null,
        created_at: now(),
      };
      tasks.push(row);
      audit("task.created", found?.member.id ?? null, "task", row.id);
      return ok({ task: taskView(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/tasks/{task_id}/update",
    auth: true,
    capability: "crm:write",
    handler: ({ params, body, headers }) => {
      const row = tasks.find((task) => task.id === params.task_id);
      if (!row) return refuse(404, "not_found");
      const status = String(body.status ?? "");
      if (status) {
        if (!["open", "done", "canceled"].includes(status))
          return refuse(400, "malformed_request", { status: "open, done or canceled" });
        row.status = status;
        row.completed_at = status === "done" ? now() : null;
        if (status === "done" && row.deal_id) {
          const deal = deals.find((candidate) => candidate.id === row.deal_id);
          if (deal) deal.last_activity_at = now();
        }
      }
      if ("title" in body) row.title = String(body.title ?? "").trim() || row.title;
      if ("due_on" in body) row.due_on = String(body.due_on ?? "");
      if ("assignee_staff_id" in body) row.assignee_staff_id = String(body.assignee_staff_id ?? "");
      audit("task.updated", caller(headers)?.member.id ?? null, "task", row.id);
      return ok({ task: taskView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/settings/crm",
    auth: true,
    capability: "crm:read",
    handler: () =>
      ok({
        plans: plans.filter((row) => !row.archived).map(planView),
        archived_plans: plans.filter((row) => row.archived).map(planView),
        pipeline: stagePayload(),
        sources: sources
          .filter((row) => !row.archived)
          .map((row) => ({ key: row.key, label: row.label })),
        archived_sources: sources
          .filter((row) => row.archived)
          .map((row) => ({ key: row.key, label: row.label })),
        protected_sources: PROTECTED_SOURCES,
        lead_stages: ["new", "attempting", "connected", "qualified", "disqualified"],
        disqualify_reasons: DISQUALIFY_REASONS,
      }),
  },
  {
    method: "POST",
    pattern: "hq/settings/pipeline/update",
    auth: true,
    capability: "hq:admin",
    handler: ({ body, headers }) => {
      const key = String(body.key ?? "").trim();
      if (!/^[a-z][a-z0-9_]{1,31}$/.test(key))
        return refuse(400, "malformed_request", { key: "a short lowercase slug" });
      let stage = stageOf(key);
      if (stage?.outcome)
        return refuse(400, "malformed_request", { key: "the terminal stages are fixed" });
      if (!stage) {
        const label = String(body.label ?? "").trim();
        if (!label) return refuse(400, "malformed_request", { label: "a new stage needs a label" });
        stage = {
          key,
          label,
          position: Number(body.position ?? 0) || 0,
          win_probability: Number(body.win_probability ?? 0) || 0,
          stale_after_days: Number(body.stale_after_days ?? 30) || 30,
          outcome: "",
          exit_criteria: String(body.exit_criteria ?? ""),
          archived: false,
        };
        stages.push(stage);
      } else {
        if ("label" in body) stage.label = String(body.label ?? "").trim() || stage.label;
        for (const name of ["position", "win_probability", "stale_after_days"] as const) {
          if (name in body) stage[name] = Number(body[name] ?? stage[name]) || 0;
        }
        if ("exit_criteria" in body) stage.exit_criteria = String(body.exit_criteria ?? "");
        if (body.archived === true) {
          const openHere = deals.filter(
            (deal) => deal.stage_key === key && deal.status === "open",
          ).length;
          if (openHere > 0)
            return refuse(400, "malformed_request", {
              archived: `${openHere} open deal(s) sit in this stage; move them first`,
            });
          stage.archived = true;
        }
        if (body.archived === false) stage.archived = false;
      }
      audit("pipeline.stage_updated", caller(headers)?.member.id ?? null, "pipeline_stage", key);
      return ok({ updated: true, key });
    },
  },
  {
    method: "GET",
    pattern: "hq/settings/support",
    auth: true,
    capability: "tickets:read",
    handler: () =>
      ok({
        sla: slaView(),
        bounds: { min_minutes: SLA_MIN_MINUTES, max_minutes: SLA_MAX_MINUTES },
        desk: deskRulesView(),
      }),
  },
  {
    method: "POST",
    pattern: "hq/settings/desk/update",
    auth: true,
    capability: "hq:admin",
    handler: ({ body, headers }) => {
      const before = { ...DESK_RULES, assign_pool: [...DESK_RULES.assign_pool] };
      const next = { ...before, assign_pool: [...before.assign_pool] };
      for (const name of ["nudge_days", "autoclose_days"] as const) {
        if (!(name in body)) continue;
        const value = Number(body[name]);
        if (!Number.isInteger(value) || value < 0 || value > DESK_MAX_DAYS)
          return refuse(400, "malformed_request", { [name]: `0 (off) to ${DESK_MAX_DAYS} days` });
        next[name] = value;
      }
      if (next.nudge_days && next.autoclose_days && next.autoclose_days <= next.nudge_days)
        return refuse(400, "malformed_request", {
          autoclose_days: "the close must come after the nudge",
        });
      if ("alert_assignee" in body) {
        if (typeof body.alert_assignee !== "boolean")
          return refuse(400, "malformed_request", { alert_assignee: "true or false" });
        next.alert_assignee = body.alert_assignee;
      }
      if ("assign_pool" in body) {
        if (!Array.isArray(body.assign_pool))
          return refuse(400, "malformed_request", { assign_pool: "a list of staff ids" });
        const cleaned: string[] = [];
        for (const raw of body.assign_pool) {
          const id = String(raw).trim();
          if (!id || cleaned.includes(id)) continue;
          const member = staff.find((candidate) => candidate.id === id);
          if (!member || !member.is_active)
            return refuse(400, "malformed_request", {
              assign_pool: "every member must be active staff",
            });
          if (!(CAPABILITIES[member.role] ?? []).includes("tickets:write"))
            return refuse(400, "malformed_request", {
              assign_pool: "every member must be able to write on the desk",
            });
          cleaned.push(id);
        }
        next.assign_pool = cleaned.slice(0, 20);
      }
      if (JSON.stringify(next) === JSON.stringify(before))
        return refuse(400, "malformed_request", { reason: "nothing to change" });
      Object.assign(DESK_RULES, next);
      audit("settings.desk_updated", caller(headers)?.member.id ?? null, "settings", "desk", "", {
        changes: changesBetween(before, next),
      });
      return ok({ updated: true, desk: deskRulesView() });
    },
  },
  {
    method: "POST",
    pattern: "hq/settings/sla/update",
    auth: true,
    capability: "hq:admin",
    handler: ({ body, headers }) => {
      const priority = String(body.priority ?? "");
      if (!(priority in SLA_TARGETS))
        return refuse(400, "malformed_request", { priority: "one of low, normal, high, urgent" });
      const before = { ...SLA_TARGETS[priority]! };
      const updated = { ...before };
      const timers = [
        ["first_reply_minutes", "first"],
        ["next_reply_minutes", "next"],
      ] as const;
      for (const [name, key] of timers) {
        if (!(name in body)) continue;
        const value = Number(body[name]);
        if (!Number.isInteger(value))
          return refuse(400, "malformed_request", { [name]: "a whole number of minutes" });
        if (value < SLA_MIN_MINUTES || value > SLA_MAX_MINUTES)
          return refuse(400, "malformed_request", { [name]: "15 minutes to 14 days" });
        updated[key] = value;
      }
      const proposed = { ...SLA_TARGETS, [priority]: updated };
      for (const [name, key] of timers) {
        for (let index = 0; index + 1 < SLA_ORDER.length; index += 1) {
          const sooner = SLA_ORDER[index]!;
          const later = SLA_ORDER[index + 1]!;
          if (proposed[sooner]![key] > proposed[later]![key])
            return refuse(400, "malformed_request", {
              [name]: `${sooner} cannot wait longer than ${later}`,
            });
        }
      }
      SLA_TARGETS[priority] = updated;
      audit(
        "settings.sla_updated",
        caller(headers)?.member.id ?? null,
        "sla_policy",
        priority,
        "",
        {
          before,
          after: updated,
        },
      );
      return ok({ updated: true, sla: slaView() });
    },
  },
  {
    method: "POST",
    pattern: "hq/settings/sources/update",
    auth: true,
    capability: "hq:admin",
    handler: ({ body, headers }) => {
      const key = String(body.key ?? "").trim();
      if (!/^[a-z][a-z0-9_]{1,31}$/.test(key))
        return refuse(400, "malformed_request", { key: "a short lowercase slug" });
      const existing = sources.find((row) => row.key === key);
      let label: string | undefined;
      if ("label" in body) {
        label = String(body.label ?? "")
          .trim()
          .slice(0, 80);
        if (!label) return refuse(400, "malformed_request", { label: "cannot be empty" });
      }
      let archived: boolean | undefined;
      if ("archived" in body) {
        archived = body.archived === true;
        if (archived && PROTECTED_SOURCES.includes(key))
          return refuse(400, "malformed_request", {
            archived: "new leads are filed under this source by default",
          });
      }
      if (!existing) {
        if (!label)
          return refuse(400, "malformed_request", { label: "a new source needs a label" });
        sources.push({ key, label, archived: false });
      } else if (label !== undefined || archived !== undefined) {
        if (label !== undefined) existing.label = label;
        if (archived !== undefined) existing.archived = archived;
      } else {
        return refuse(400, "malformed_request", { reason: "nothing to change" });
      }
      audit("settings.source_updated", caller(headers)?.member.id ?? null, "lead_source", key);
      return ok({ updated: true, key });
    },
  },
  {
    method: "POST",
    pattern: "hq/settings/plans/update",
    auth: true,
    capability: "hq:admin",
    handler: ({ body, headers }) => {
      const key = String(body.key ?? "").trim();
      if (!/^[a-z][a-z0-9_]{1,31}$/.test(key))
        return refuse(400, "malformed_request", { key: "a short lowercase slug" });
      const existing = plans.find((row) => row.key === key);
      const fields: Partial<PlanRow> = {};
      if ("name" in body) {
        const name = String(body.name ?? "")
          .trim()
          .slice(0, 80);
        if (!name) return refuse(400, "malformed_request", { name: "cannot be empty" });
        fields.name = name;
      }
      if ("unit_amount" in body) {
        const amount = Math.round(Number(body.unit_amount) * 100) / 100;
        if (!(amount >= 0.01 && amount <= 1_000_000))
          return refuse(400, "malformed_request", { unit_amount: "between 0.01 and 1,000,000" });
        fields.unit_amount = amount;
      }
      if ("currency" in body) {
        const currency = String(body.currency ?? "")
          .trim()
          .toUpperCase();
        if (!/^[A-Z]{3}$/.test(currency))
          return refuse(400, "malformed_request", { currency: "a three-letter code" });
        fields.currency = currency;
      }
      if ("billing_cadence" in body) {
        const cadence = String(body.billing_cadence ?? "");
        if (cadence !== "monthly" && cadence !== "annual")
          return refuse(400, "malformed_request", { billing_cadence: "monthly or annual" });
        fields.billing_cadence = cadence;
      }
      if ("min_seats" in body) {
        const minSeats = Number(body.min_seats);
        if (!Number.isInteger(minSeats) || minSeats < 1 || minSeats > 100_000)
          return refuse(400, "malformed_request", { min_seats: "1 to 100,000" });
        fields.min_seats = minSeats;
      }
      if ("archived" in body) fields.archived = body.archived === true;
      if (!existing) {
        if (!fields.name || fields.unit_amount === undefined)
          return refuse(400, "malformed_request", { name: "a new plan needs a name and a price" });
        plans.push({
          key,
          name: fields.name,
          unit_amount: fields.unit_amount,
          currency: fields.currency ?? "USD",
          billing_cadence: fields.billing_cadence ?? "monthly",
          min_seats: fields.min_seats ?? 1,
          archived: false,
        });
      } else if (Object.keys(fields).length > 0) {
        Object.assign(existing, fields);
      } else {
        return refuse(400, "malformed_request", { reason: "nothing to change" });
      }
      audit("settings.plan_updated", caller(headers)?.member.id ?? null, "plan", key);
      return ok({ updated: true, key });
    },
  },
  {
    method: "GET",
    pattern: "hq/webhooks",
    auth: true,
    capability: "hq:admin",
    handler: () =>
      ok({
        events: webhookEvents
          .slice()
          .sort((a, b) => b.received_at.localeCompare(a.received_at))
          .slice(0, 50)
          .map((row) => ({ ...row })),
        kept_days: 30,
        limit: 50,
      }),
  },
  {
    method: "GET",
    pattern: "hq/retention",
    auth: true,
    capability: "hq:admin",
    handler: () => {
      const view = retentionPreview();
      return ok({
        ...view,
        confirm_phrase: view.this_run ? `anonymise ${view.this_run}` : "",
        min_days: 30,
        max_days: 3650,
        webhook_ledger_days: 30,
        last_sweep: lastSweep(),
        sign_out_phrase: SIGN_OUT_PHRASE,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/retention/update",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ body, headers }) => {
      const before = { ...retentionRules };
      const after = { ...before };
      for (const rule of ["disqualified", "quiet"] as const) {
        const name = `${rule}_lead_days`;
        if (!(name in body)) continue;
        const value = Number(body[name]);
        if (!Number.isInteger(value))
          return refuse(400, "malformed_request", { [name]: "a whole number of days" });
        if (!(value === 0 || (value >= 30 && value <= 3650)))
          return refuse(400, "malformed_request", {
            [name]: "0 to turn it off, or 30 to 3650 days",
          });
        after[rule] = value;
      }
      const reason = String(body.reason ?? "")
        .trim()
        .slice(0, 400);
      if (reason.length < 8)
        return refuse(400, "malformed_request", { reason: "say why, in a sentence" });
      if (after.disqualified === before.disqualified && after.quiet === before.quiet)
        return refuse(400, "malformed_request", { reason: "nothing to change" });
      audit(
        "retention.rules_updated",
        caller(headers)?.member.id ?? null,
        "retention",
        "leads",
        reason,
        {
          before,
          after,
        },
      );
      Object.assign(retentionRules, after);
      return ok({ updated: true, rules: { ...after } });
    },
  },
  {
    method: "POST",
    pattern: "hq/retention/run",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ body, headers }) => {
      const reason = String(body.reason ?? "")
        .trim()
        .slice(0, 400);
      if (reason.length < 8)
        return refuse(400, "malformed_request", { reason: "say why, in a sentence" });
      const view = retentionPreview();
      if (!view.this_run) return refuse(400, "malformed_request", { confirm: "nothing is due" });
      const expected = `anonymise ${view.this_run}`;
      if (
        String(body.confirm ?? "")
          .trim()
          .slice(0, 60)
          .toLowerCase() !== expected
      )
        return refuse(400, "malformed_request", { confirm: `type: ${expected}` });
      return ok({
        ran: true,
        ...sweepRetention(caller(headers)?.member.id ?? null, reason, view.this_run),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/sessions/revoke-all",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ body, headers }) => {
      const reason = String(body.reason ?? "")
        .trim()
        .slice(0, 400);
      if (reason.length < 8)
        return refuse(400, "malformed_request", { reason: "say why, in a sentence" });
      if (
        String(body.confirm ?? "")
          .trim()
          .slice(0, 60)
          .toLowerCase() !== SIGN_OUT_PHRASE
      )
        return refuse(400, "malformed_request", { confirm: `type: ${SIGN_OUT_PHRASE}` });
      const found = caller(headers)!;
      audit("sessions.revoked_all", found.member.id, "session", "all", reason);
      let revoked = 0;
      for (const session of sessions.values()) {
        if (session.revoked_at || session.id === found.session.id) continue;
        session.revoked_at = now();
        revoked += 1;
      }
      return ok({ revoked });
    },
  },
  {
    method: "GET",
    pattern: "hq/api-keys",
    auth: true,
    capability: "hq:admin",
    handler: () =>
      ok({
        keys: apiKeys
          .slice()
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map(keyView),
        grantable_scopes: ["leads:create"],
        lifetime_days: KEY_LIFETIME_DAYS,
      }),
  },
  {
    method: "POST",
    pattern: "hq/api-keys/create",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ body, headers }) => {
      const name = String(body.name ?? "").trim();
      if (!name) return refuse(400, "malformed_request", { name: "name what will hold this key" });
      const reason = String(body.reason ?? "").trim();
      if (!reason)
        return refuse(400, "malformed_request", { reason: "a written reason is required" });
      const lifetime =
        body.expires_in_days === undefined ? KEY_LIFETIME_DAYS : body.expires_in_days;
      if (
        typeof lifetime !== "number" ||
        !Number.isInteger(lifetime) ||
        lifetime < 1 ||
        lifetime > KEY_LIFETIME_DAYS
      )
        return refuse(400, "malformed_request", { expires_in_days: `1 to ${KEY_LIFETIME_DAYS}` });
      const prefix = randomUUID().replace(/-/g, "").slice(0, 8);
      const secret = `qthq_${prefix}_${randomUUID().replace(/-/g, "")}`;
      const found = caller(headers);
      const row: ApiKeyRow = {
        key_id: randomUUID(),
        name,
        prefix,
        scopes: ["leads:create"],
        created_by: found?.member.id ?? "",
        created_at: now(),
        last_used_at: null,
        revoked_at: null,
        expires_at: new Date(Date.now() + lifetime * 86_400_000).toISOString(),
      };
      apiKeys.push(row);
      audit("api_key.minted", found?.member.id ?? null, "api_key", row.key_id, reason, {
        name,
        expires_in_days: lifetime,
      });
      return ok({ key: keyView(row), secret });
    },
  },
  {
    method: "POST",
    pattern: "hq/api-keys/{key_id}/revoke",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ params, body, headers }) => {
      const reason = String(body.reason ?? "").trim();
      if (!reason)
        return refuse(400, "malformed_request", { reason: "a written reason is required" });
      const row = apiKeys.find((key) => key.key_id === params.key_id);
      if (!row || row.revoked_at) return refuse(404, "not_found");
      row.revoked_at = now();
      audit("api_key.revoked", caller(headers)?.member.id ?? null, "api_key", row.key_id, reason);
      return ok({ revoked: true });
    },
  },
  {
    method: "POST",
    pattern: "public/leads",
    handler: ({ body, headers }) => {
      const presented = String(headers["x-qt-intake-key"] ?? "");
      const live = apiKeys.find(
        (key) => !key.revoked_at && presented.startsWith(`qthq_${key.prefix}_`),
      );
      // The seeded key's secret is not known; the mock accepts any qthq_ key whose
      // prefix matches a live row, which is enough to exercise both refusal paths.
      if (!presented.startsWith("qthq_") || !live)
        return refuse(403, "forbidden", { api_key: "unknown or revoked" });
      if (keyView(live).expired) return refuse(403, "forbidden", { api_key: "expired" });
      if (String(body.website ?? "").trim()) return ok({ received: true });
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
      if (!email.includes("@"))
        return refuse(400, "malformed_request", { email: "an address is required" });
      live.last_used_at = now();
      // As the service: no source means the website's own; an unknown one means "other".
      const requested = String(body.source_key ?? "").trim() || "website_early_access";
      const sourceKey = sources.some((source) => source.key === requested) ? requested : "other";
      if (
        leads.some(
          (row) =>
            row.email === email &&
            row.source_key === sourceKey &&
            minutesSince(row.created_at) < 1440,
        )
      )
        return ok({ received: true });
      leads.push({
        id: randomUUID(),
        source_key: sourceKey,
        email,
        full_name: String(body.full_name ?? ""),
        company_name: String(body.company_name ?? ""),
        message: String(body.message ?? ""),
        payload: Object.fromEntries(
          ["role", "where", "team_size", "markets", "heard_from", "phone", "firm", "use_case"]
            .filter((name) => String(body[name] ?? "").trim())
            .map((name) => [name, String(body[name])]),
        ),
        stage: "new",
        disqualify_reason: "",
        owner_staff_id: "",
        first_replied_at: null,
        converted_company_id: "",
        converted_person_id: "",
        converted_deal_id: "",
        created_at: now(),
      });
      audit("lead.received", null, "lead", email);
      return ok({ received: true });
    },
  },
);

// =====================================================================================
// Meetings, mirroring hq/meetings*: seven-day outcome window, cadence tasks keyed by
// (meeting, origin), calendar-owned times and guests on synced meetings.
// =====================================================================================

type MeetingRow = {
  id: string;
  google_event_id: string;
  kind: string;
  status: string;
  starts_at: string;
  ends_at: string | null;
  title: string;
  description: string;
  company_id: string;
  deal_id: string;
  prep_notes: string;
  outcome: string;
  outcome_notes: string;
  outcome_recorded_at: string | null;
  recording_url: string;
};
type AttendeeRow = {
  meeting_id: string;
  email: string;
  person_id: string;
  is_staff: boolean;
  response: string;
};

const MEETING_KINDS = ["demo", "intro", "check_in", "other"];
const MEETING_OUTCOMES = ["advanced", "qualified", "not_a_fit", "other"];
const OUTCOME_WINDOW_MS = 7 * 86_400_000;
const meetings: MeetingRow[] = [];
const meetingAttendees: AttendeeRow[] = [];

function hoursFromNow(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function seedMeetings() {
  meetings.length = 0;
  meetingAttendees.length = 0;
  meetings.push(
    {
      id: "ee100000-0000-4000-8000-000000000001",
      google_event_id: "evt_mock_holloway",
      kind: "demo",
      status: "scheduled",
      starts_at: hoursFromNow(3),
      ends_at: hoursFromNow(3.5),
      title: "Quantify Terminal demo — Holloway Capital",
      description: "Booked from the website. Interested in: morning brief, risk.",
      company_id: "",
      deal_id: "",
      prep_notes: "",
      outcome: "",
      outcome_notes: "",
      outcome_recorded_at: null,
      recording_url: "",
    },
    {
      id: "ee100000-0000-4000-8000-000000000002",
      google_event_id: "",
      kind: "check_in",
      status: "scheduled",
      starts_at: hoursFromNow(-20),
      ends_at: hoursFromNow(-19.5),
      title: "Northwall pilot check-in",
      description: "",
      company_id: "c0000000-0000-4000-8000-000000000002",
      deal_id: "d0000000-0000-4000-8000-000000000001",
      prep_notes: "Ask whether the second desk has signed in yet.",
      outcome: "",
      outcome_notes: "",
      outcome_recorded_at: null,
      recording_url: "",
    },
    {
      id: "ee100000-0000-4000-8000-000000000003",
      google_event_id: "evt_mock_meridian",
      kind: "demo",
      status: "scheduled",
      starts_at: hoursFromNow(50),
      ends_at: hoursFromNow(51),
      title: "Rates desk walkthrough — Meridian Capital",
      description: "",
      company_id: "c0000000-0000-4000-8000-000000000001",
      deal_id: "d0000000-0000-4000-8000-000000000003",
      prep_notes: "",
      outcome: "",
      outcome_notes: "",
      outcome_recorded_at: null,
      recording_url: "",
    },
  );
  meetingAttendees.push(
    {
      meeting_id: "ee100000-0000-4000-8000-000000000001",
      email: "tom@hollowaycap.com",
      person_id: "",
      is_staff: false,
      response: "accepted",
    },
    {
      meeting_id: "ee100000-0000-4000-8000-000000000001",
      email: "owner@hq.test",
      person_id: "",
      is_staff: true,
      response: "accepted",
    },
    {
      meeting_id: "ee100000-0000-4000-8000-000000000002",
      email: "jonas@northwall.ch",
      person_id: "p0000000-0000-4000-8000-000000000002",
      is_staff: false,
      response: "accepted",
    },
    {
      meeting_id: "ee100000-0000-4000-8000-000000000002",
      email: "sales@hq.test",
      person_id: "",
      is_staff: true,
      response: "accepted",
    },
    {
      meeting_id: "ee100000-0000-4000-8000-000000000003",
      email: "elena@meridiancap.com",
      person_id: "p0000000-0000-4000-8000-000000000001",
      is_staff: false,
      response: "tentative",
    },
  );
}
seedMeetings();

function meetingNeedsOutcome(row: MeetingRow): boolean {
  const starts = Date.parse(row.starts_at);
  return (
    row.status === "scheduled" && starts <= Date.now() && Date.now() - starts <= OUTCOME_WINDOW_MS
  );
}

function meetingView(row: MeetingRow) {
  const starts = Date.parse(row.starts_at);
  return {
    meeting_id: row.id,
    source: row.google_event_id ? "calendar" : "manual",
    kind: row.kind,
    status: row.status,
    starts_at: row.starts_at,
    ends_at: row.ends_at,
    title: row.title,
    description: row.description,
    company_id: row.company_id,
    company_name: companies.find((company) => company.id === row.company_id)?.name ?? "",
    deal_id: row.deal_id,
    deal_name: deals.find((deal) => deal.id === row.deal_id)?.name ?? "",
    prep_notes: row.prep_notes,
    outcome: row.outcome,
    outcome_notes: row.outcome_notes,
    outcome_recorded_at: row.outcome_recorded_at,
    recording_url: row.recording_url,
    needs_outcome: meetingNeedsOutcome(row),
    outcome_lapsed: row.status === "scheduled" && Date.now() - starts > OUTCOME_WINDOW_MS,
    attendees: meetingAttendees
      .filter((attendee) => attendee.meeting_id === row.id)
      .map((attendee) => {
        const person = people.find((candidate) => candidate.id === attendee.person_id);
        return {
          email: attendee.email,
          person_id: attendee.person_id,
          person_name: person ? person.full_name || person.email : "",
          is_staff: attendee.is_staff,
          response: attendee.response,
        };
      }),
  };
}

function matchAttendees(meetingId: string, raw: unknown): AttendeeRow[] | string {
  const emails = (Array.isArray(raw) ? raw.map(String) : String(raw ?? "").split(/[\s,;]+/))
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
  const rows: AttendeeRow[] = [];
  for (const email of [...new Set(emails)].slice(0, 25)) {
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]{2,}$/.test(email)) return `not an address: ${email}`;
    rows.push({
      meeting_id: meetingId,
      email,
      person_id: people.find((person) => person.email === email)?.id ?? "",
      is_staff: staff.some((member) => member.email === email),
      response: "needs_action",
    });
  }
  return rows;
}

const CADENCE_STEPS: Record<string, Array<[number, string, string]>> = {
  no_show: [
    [1, "Call {who}: they missed the {kind}", "high"],
    [3, "Send {who} a link to rebook", "medium"],
    [7, "Last nudge to {who} before closing the loop", "medium"],
  ],
  completed: [
    [0, "Send {who} the recap of the {kind}", "high"],
    [2, "Send {who} the materials promised in the {kind}", "medium"],
    [7, "Check in with {who}", "medium"],
  ],
};
const KIND_WORDS: Record<string, string> = {
  demo: "demo",
  intro: "intro call",
  check_in: "check-in",
  other: "meeting",
};

type MeetingTask = TaskRow & { meeting_id?: string };

function runCadence(row: MeetingRow, cadence: string, who: string, assignee: string): number {
  const mine = tasks.filter((task) => (task as MeetingTask).meeting_id === row.id);
  for (const task of mine) {
    if (
      task.origin.startsWith("cadence:") &&
      !task.origin.startsWith(`cadence:${cadence}:`) &&
      task.status === "open"
    )
      task.status = "canceled";
  }
  const have = new Set(mine.map((task) => task.origin));
  let minted = 0;
  (CADENCE_STEPS[cadence] ?? []).forEach(([days, template, priority], index) => {
    const origin = `cadence:${cadence}:${index + 1}`;
    if (have.has(origin)) return;
    const task: MeetingTask = {
      id: randomUUID(),
      title: template.replace("{who}", who).replace("{kind}", KIND_WORDS[row.kind] ?? "meeting"),
      body: "",
      status: "open",
      priority,
      due_on: new Date(Date.parse(row.starts_at) + days * 86_400_000).toISOString().slice(0, 10),
      assignee_staff_id: assignee,
      company_id: row.company_id,
      person_id: "",
      deal_id: row.deal_id,
      lead_id: "",
      ticket_id: "",
      origin,
      completed_at: null,
      created_at: now(),
      meeting_id: row.id,
    };
    tasks.push(task);
    minted += 1;
  });
  return minted;
}

routes.push(
  {
    method: "GET",
    pattern: "hq/meetings",
    auth: true,
    capability: "crm:read",
    handler: ({ query }) => {
      const when = query.when ?? "upcoming";
      const views = meetings
        .filter((row) => !query.company_id || row.company_id === query.company_id)
        .filter((row) => !query.deal_id || row.deal_id === query.deal_id)
        .map(meetingView)
        .filter((view) => {
          const starts = Date.parse(view.starts_at);
          if (when === "upcoming") return starts >= Date.now() || view.needs_outcome;
          if (when === "past") return starts < Date.now();
          if (when === "needs_outcome") return view.needs_outcome;
          return true;
        })
        .sort((a, b) =>
          when === "past"
            ? b.starts_at.localeCompare(a.starts_at)
            : a.starts_at.localeCompare(b.starts_at),
        );
      const today = new Date().toISOString().slice(0, 10);
      return ok({
        meetings: views,
        counts: {
          needs_outcome: meetings.filter(meetingNeedsOutcome).length,
          today: meetings.filter(
            (row) => row.starts_at.slice(0, 10) === today && row.status !== "canceled",
          ).length,
        },
        kinds: MEETING_KINDS,
        outcomes: MEETING_OUTCOMES,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/meetings/create",
    auth: true,
    capability: "crm:write",
    handler: ({ body, headers }) => {
      const title = String(body.title ?? "").trim();
      if (!title) return refuse(400, "malformed_request", { title: "name the meeting" });
      const kind = String(body.kind ?? "other") || "other";
      if (!MEETING_KINDS.includes(kind))
        return refuse(400, "malformed_request", { kind: "unknown kind" });
      const startsRaw = String(body.starts_at ?? "");
      if (!/[zZ]|[+-]\d{2}:\d{2}$/.test(startsRaw) || Number.isNaN(Date.parse(startsRaw)))
        return refuse(400, "malformed_request", { starts_at: "include a time zone offset" });
      const id = randomUUID();
      const matched = matchAttendees(id, body.attendees);
      if (typeof matched === "string")
        return refuse(400, "malformed_request", { attendees: matched });
      let companyId = String(body.company_id ?? "");
      const dealId = String(body.deal_id ?? "");
      if (dealId && !companyId)
        companyId = deals.find((deal) => deal.id === dealId)?.company_id ?? "";
      const row: MeetingRow = {
        id,
        google_event_id: "",
        kind,
        status: "scheduled",
        starts_at: new Date(startsRaw).toISOString().replace(/\.\d{3}Z$/, "Z"),
        ends_at: body.ends_at
          ? new Date(String(body.ends_at)).toISOString().replace(/\.\d{3}Z$/, "Z")
          : null,
        title,
        description: String(body.description ?? ""),
        company_id: companyId,
        deal_id: dealId,
        prep_notes: String(body.prep_notes ?? ""),
        outcome: "",
        outcome_notes: "",
        outcome_recorded_at: null,
        recording_url: "",
      };
      meetings.push(row);
      meetingAttendees.push(...matched);
      audit("meeting.created", caller(headers)?.member.id ?? null, "meeting", id);
      return ok({ meeting: meetingView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/meetings/{meeting_id}",
    auth: true,
    capability: "crm:read",
    handler: ({ params }) => {
      const row = meetings.find((meeting) => meeting.id === params.meeting_id);
      if (!row) return refuse(404, "not_found");
      return ok({
        meeting: meetingView(row),
        activities: activities.filter(
          (activity) => (activity as ActivityRow & { meeting_id?: string }).meeting_id === row.id,
        ),
        follow_ups: tasks
          .filter((task) => (task as MeetingTask).meeting_id === row.id)
          .map((task) => ({
            task_id: task.id,
            title: task.title,
            status: task.status,
            due_on: task.due_on,
            origin: task.origin,
          }))
          .sort((a, b) => a.due_on.localeCompare(b.due_on)),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/meetings/{meeting_id}/update",
    auth: true,
    capability: "crm:write",
    handler: ({ params, body, headers }) => {
      const row = meetings.find((meeting) => meeting.id === params.meeting_id);
      if (!row) return refuse(404, "not_found");
      if ("status" in body || "outcome" in body)
        return refuse(400, "malformed_request", { reason: "record outcomes via /outcome" });
      const synced = Boolean(row.google_event_id);
      if (synced && ("starts_at" in body || "ends_at" in body))
        return refuse(400, "malformed_request", { starts_at: "move it in the calendar" });
      if (synced && "attendees" in body)
        return refuse(400, "malformed_request", { attendees: "the calendar owns the guest list" });
      if ("title" in body) row.title = String(body.title ?? "").trim() || row.title;
      if ("kind" in body) {
        if (!MEETING_KINDS.includes(String(body.kind)))
          return refuse(400, "malformed_request", { kind: `one of ${MEETING_KINDS.join(", ")}` });
        row.kind = String(body.kind);
      }
      if (badId(body.company_id) || badId(body.deal_id))
        return refuse(400, "malformed_request", { company_id: "not an id" });
      if ("prep_notes" in body) row.prep_notes = String(body.prep_notes ?? "");
      if ("recording_url" in body) {
        const url = String(body.recording_url ?? "").trim();
        if (url && !url.startsWith("https://"))
          return refuse(400, "malformed_request", { recording_url: "an https link" });
        row.recording_url = url;
      }
      if ("company_id" in body) row.company_id = String(body.company_id ?? "");
      if ("deal_id" in body) row.deal_id = String(body.deal_id ?? "");
      if ("starts_at" in body)
        row.starts_at = new Date(String(body.starts_at)).toISOString().replace(/\.\d{3}Z$/, "Z");
      if ("attendees" in body) {
        const matched = matchAttendees(row.id, body.attendees);
        if (typeof matched === "string")
          return refuse(400, "malformed_request", { attendees: matched });
        for (let index = meetingAttendees.length - 1; index >= 0; index -= 1)
          if (meetingAttendees[index]!.meeting_id === row.id) meetingAttendees.splice(index, 1);
        meetingAttendees.push(...matched);
      }
      audit("meeting.updated", caller(headers)?.member.id ?? null, "meeting", row.id);
      return ok({ meeting: meetingView(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/meetings/{meeting_id}/outcome",
    auth: true,
    capability: "crm:write",
    handler: ({ params, body, headers }) => {
      const row = meetings.find((meeting) => meeting.id === params.meeting_id);
      if (!row) return refuse(404, "not_found");
      const status = String(body.status ?? "");
      if (!["completed", "no_show", "canceled"].includes(status))
        return refuse(400, "malformed_request", { status: "completed, no_show or canceled" });
      if (status !== "canceled" && Date.parse(row.starts_at) > Date.now())
        return refuse(400, "malformed_request", { status: "it has not happened yet" });
      let outcome = "";
      if (status === "completed") {
        outcome = String(body.outcome ?? "");
        if (!MEETING_OUTCOMES.includes(outcome))
          return refuse(400, "malformed_request", { outcome: "pick what happened" });
      } else if (status === "no_show") outcome = "no_show";
      const found = caller(headers);
      row.status = status;
      row.outcome = outcome;
      row.outcome_notes = String(body.outcome_notes ?? "");
      row.outcome_recorded_at = now();
      const guest = meetingAttendees.find(
        (attendee) => attendee.meeting_id === row.id && !attendee.is_staff,
      );
      const person = people.find((candidate) => candidate.id === guest?.person_id);
      const who =
        (person ? person.full_name || person.email : "") ||
        guest?.email ||
        companies.find((company) => company.id === row.company_id)?.name ||
        "them";
      let minted = 0;
      if (status === "no_show" || (status === "completed" && outcome !== "not_a_fit"))
        minted = runCadence(row, status, who, found?.member.id ?? "");
      else runCadence(row, "none", who, found?.member.id ?? "");
      activities.push({
        kind: "meeting",
        at: now(),
        staff_id: found?.member.id ?? "",
        staff_name: found?.member.display_name ?? "",
        body: `${status === "completed" ? "Held" : status === "no_show" ? "No-show" : "Canceled"}: ${row.title}\n${row.outcome_notes}`.trim(),
        company_id: row.company_id,
        person_id: guest?.person_id ?? "",
        deal_id: row.deal_id,
        lead_id: "",
        meeting_id: row.id,
      } as ActivityRow);
      const deal = deals.find((candidate) => candidate.id === row.deal_id);
      if (deal && status === "completed") deal.last_activity_at = now();
      audit("meeting.outcome_recorded", found?.member.id ?? null, "meeting", row.id);
      return ok({ meeting: meetingView(row), follow_ups_created: minted });
    },
  },
);

// =====================================================================================
// The team calendar. The mock's "consent screen" is the portal's own callback: connect
// returns a URL that lands straight back with a code, so the whole round trip can be
// walked without leaving the machine.
// =====================================================================================

type CalendarState = {
  connected: boolean;
  account_email: string;
  connected_at: string | null;
  last_synced_at: string | null;
  last_error: string;
};
const calendar: CalendarState = {
  connected: false,
  account_email: "",
  connected_at: null,
  last_synced_at: null,
  last_error: "",
};
const calendarStates = new Set<string>();

function resetCalendar() {
  calendar.connected = false;
  calendar.account_email = "";
  calendar.connected_at = null;
  calendar.last_synced_at = null;
  calendar.last_error = "";
  calendarStates.clear();
}

function calendarStatus() {
  return {
    configured: true,
    push_configured: true,
    connected: calendar.connected,
    account_email: calendar.account_email,
    connected_at: calendar.connected_at,
    last_synced_at: calendar.last_synced_at,
    last_error: calendar.last_error,
    push_active: calendar.connected,
    channel_expires_at: calendar.connected ? hoursFromNow(24 * 7) : null,
  };
}

routes.push(
  {
    method: "GET",
    pattern: "hq/integrations/calendar",
    auth: true,
    capability: "hq:admin",
    handler: () => ok({ calendar: calendarStatus() }),
  },
  {
    method: "POST",
    pattern: "hq/integrations/calendar/connect",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers }) => {
      const found = caller(headers)!;
      const state = `mockstate-${found.member.id}-${randomUUID().slice(0, 8)}`;
      calendarStates.add(state);
      audit("calendar.connect_started", found.member.id, "integration", "calendar");
      // Like the real consent screen, on ANOTHER origin: the portal must leave and be
      // sent back, not route there internally.
      return ok({
        authorization_url: `http://127.0.0.1:${PORT}/api/v1/mock/consent?state=${encodeURIComponent(state)}`,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/integrations/calendar/complete",
    auth: true,
    capability: "hq:admin",
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const state = String(body.state ?? "");
      if (!calendarStates.has(state) || !state.includes(found.member.id))
        return refuse(403, "forbidden", { reason: "state" });
      calendarStates.delete(state);
      calendar.connected = true;
      calendar.account_email = "team@quantifyterminal.test";
      calendar.connected_at = now();
      calendar.last_synced_at = now();
      webhookEvents.push({
        provider: "calendar",
        event_id: `${randomUUID()}:1`,
        received_at: now(),
        state: "sync",
        outcome: "channel opened",
        duplicates: 0,
      });
      audit("calendar.connected", found.member.id, "integration", "calendar");
      return ok({
        calendar: calendarStatus(),
        sync: { created: 0, updated: 2, canceled: 0, skipped: 5 },
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/integrations/calendar/sync",
    auth: true,
    capability: "hq:admin",
    handler: ({ headers }) => {
      if (!calendar.connected) return refuse(404, "not_found");
      calendar.last_synced_at = now();
      audit("calendar.synced", caller(headers)!.member.id, "integration", "calendar");
      return ok({
        calendar: calendarStatus(),
        sync: { created: 0, updated: 0, canceled: 0, skipped: 0 },
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/integrations/calendar/disconnect",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, body }) => {
      const reason = String(body.reason ?? "").trim();
      if (!reason)
        return refuse(400, "malformed_request", { reason: "a written reason is required" });
      if (!calendar.connected) return refuse(404, "not_found");
      resetCalendar();
      audit("calendar.disconnected", caller(headers)!.member.id, "integration", "calendar", reason);
      return ok({ calendar: calendarStatus() });
    },
  },
);

// =====================================================================================
// Revenue, mirroring hq/contracts*, hq/revenue/*: movements carry their currency and
// sign, the bridge sums one currency in cents, the churn is dated the last day of service.
// =====================================================================================

type RenewalStatus = "" | "commit" | "likely" | "at_risk" | "lost";
const RENEWAL_STATUSES: RenewalStatus[] = ["commit", "likely", "at_risk", "lost"];
const RENEWAL_DEFAULT_CONFIDENCE: Record<string, number> = {
  commit: 90,
  likely: 70,
  at_risk: 30,
  lost: 0,
};
type ContractRow = {
  id: string;
  company_id: string;
  deal_id: string;
  plan_name: string;
  plan_key?: string;
  renewal_status?: RenewalStatus;
  renewal_confidence?: number | null;
  renewal_forecast_cents?: number | null;
  renewal_note?: string;
  renewal_updated_at?: string | null;
  renewal_updated_by?: string;
  seats: number;
  mrr_cents: number;
  currency: string;
  billing_cadence: string;
  starts_on: string;
  term_months: number;
  renews_on: string | null;
  status: string;
  ends_on: string | null;
  cancel_reason: string;
  notes: string;
  created_at: string;
};
type MovementRow = {
  contract_id: string;
  company_id: string;
  kind: string;
  cents: number;
  currency: string;
  effective_on: string;
  note: string;
  staff_id: string;
};

const CANCEL_REASONS = [
  "price",
  "missing_feature",
  "budget",
  "no_usage",
  "switched",
  "closed_down",
  "other",
];
const contracts: ContractRow[] = [];
const movements: MovementRow[] = [];

function dayOffset(days: number): string {
  return new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
}
function addMonths(day: string, months: number): string {
  const [year, month, date] = day.split("-").map(Number) as [number, number, number];
  const target = new Date(Date.UTC(year, month - 1 + months, 1));
  const last = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  target.setUTCDate(Math.min(date, last));
  return target.toISOString().slice(0, 10);
}

function seedRevenue() {
  contracts.length = 0;
  movements.length = 0;
  contracts.push(
    {
      id: "cc100000-0000-4000-8000-000000000001",
      company_id: "c0000000-0000-4000-8000-000000000001",
      deal_id: "d0000000-0000-4000-8000-000000000004",
      plan_name: "Professional desk",
      seats: 6,
      mrr_cents: 119_500,
      currency: "USD",
      billing_cadence: "annual",
      starts_on: dayOffset(-40),
      term_months: 12,
      renews_on: addMonths(dayOffset(-40), 12),
      status: "active",
      ends_on: null,
      cancel_reason: "",
      notes: "Annual prepay; the CIO signs renewals.",
      created_at: agoIso(24 * 40),
    },
    {
      id: "cc100000-0000-4000-8000-000000000002",
      company_id: "c0000000-0000-4000-8000-000000000004",
      deal_id: "",
      plan_name: "Research seat",
      seats: 3,
      mrr_cents: 45_000,
      currency: "USD",
      billing_cadence: "monthly",
      starts_on: dayOffset(-250),
      term_months: 6,
      renews_on: addMonths(dayOffset(-250), 6),
      status: "canceled",
      ends_on: dayOffset(-95),
      cancel_reason: "price",
      notes: "",
      created_at: agoIso(24 * 250),
    },
  );
  movements.push(
    {
      contract_id: "cc100000-0000-4000-8000-000000000002",
      company_id: "c0000000-0000-4000-8000-000000000004",
      kind: "new",
      cents: 45_000,
      currency: "USD",
      effective_on: dayOffset(-250),
      note: "Research seat",
      staff_id: OWNER_STAFF,
    },
    {
      contract_id: "cc100000-0000-4000-8000-000000000002",
      company_id: "c0000000-0000-4000-8000-000000000004",
      kind: "churn",
      cents: -45_000,
      currency: "USD",
      effective_on: dayOffset(-95),
      note: "price",
      staff_id: OWNER_STAFF,
    },
    {
      contract_id: "cc100000-0000-4000-8000-000000000001",
      company_id: "c0000000-0000-4000-8000-000000000001",
      kind: "new",
      cents: 99_500,
      currency: "USD",
      effective_on: dayOffset(-40),
      note: "Professional desk",
      staff_id: OWNER_STAFF,
    },
    {
      contract_id: "cc100000-0000-4000-8000-000000000001",
      company_id: "c0000000-0000-4000-8000-000000000001",
      kind: "expansion",
      cents: 20_000,
      currency: "USD",
      effective_on: dayOffset(-12),
      note: "Sixth seat",
      staff_id: OWNER_STAFF,
    },
  );
  seedBook();
}

// =====================================================================================
// The book: the paying firms behind roughly $87,000 a month, two years of growth in the
// ledger, and a pipeline in proportion. Demo data — real firms, invented contacts, and a
// price list that is the mock's own (Desk and Professional desk $199 a seat, Team $169,
// Enterprise desk $149), so seats × rate reconciles with every figure. Deterministic:
// a reset lands on the same numbers; everything reads from the movements, as the real
// service does.
// =====================================================================================

type BookCustomer = {
  n: number;
  name: string;
  domain: string;
  firm: string;
  size: string;
  country: string;
  plan: string;
  /** Seats today. */
  seats: number;
  /** Monthly value today, in dollars; the opening value is this less every change. */
  mrr: number;
  /** Days ago the contract started. */
  start: number;
  contact: [string, string, string];
  /** [days ago, dollars, note]; positive expands, negative contracts. */
  changes?: [number, number, string][];
  /** Days ago the contract was cancelled, and why; the firm is a former customer. */
  churned?: [number, string];
  /** The deal that won the contract, when the firm came through the pipeline. */
  won?: { entered: number; stages: string[] };
  /** What we expect of the coming renewal: [status, confidence, note, forecast dollars?]. */
  renewal?: [RenewalStatus, number, string, number?];
};

const BOOK: BookCustomer[] = [
  // --- Enterprise desk, $149 a seat, annual ---------------------------------------
  {
    n: 1,
    name: "Man Group",
    domain: "man.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United Kingdom",
    plan: "Enterprise desk",
    seats: 60,
    mrr: 8940,
    start: 700,
    contact: ["Oliver Brandt", "Head of Trading Technology", "decision_maker"],
    changes: [
      [540, 2442, "London macro desk: 30 seats on Enterprise desk"],
      [300, 4470, "Firm-wide agreement: 60 seats"],
    ],
    renewal: ["commit", 95, "Procurement confirmed the renewal in September; seats unchanged."],
  },
  {
    n: 2,
    name: "Millennium Management",
    domain: "mlp.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    plan: "Enterprise desk",
    seats: 45,
    mrr: 6705,
    start: 640,
    contact: ["Dana Whitfield", "Platform Engineering Lead", "champion"],
    changes: [[420, 2235, "Second pod group: 15 more seats"]],
    renewal: ["commit", 90, "Platform lead wants the same 45 seats; legal review in hand."],
  },
  {
    n: 3,
    name: "Balyasny Asset Management",
    domain: "bamfunds.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    plan: "Enterprise desk",
    seats: 40,
    mrr: 5960,
    start: 560,
    contact: ["Marcus Ellery", "Head of Research Platforms", "decision_maker"],
    changes: [[200, 1490, "Ten seats for the equities pods"]],
  },
  {
    n: 4,
    name: "Brevan Howard",
    domain: "brevanhoward.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United Kingdom",
    plan: "Enterprise desk",
    seats: 32,
    mrr: 4768,
    start: 480,
    contact: ["Sophie Marchetti", "Chief Operating Officer, Trading", "decision_maker"],
    changes: [[150, 1192, "Eight seats for the rates desk"]],
  },
  {
    n: 5,
    name: "Schroders",
    domain: "schroders.com",
    firm: "Asset manager",
    size: "201+",
    country: "United Kingdom",
    plan: "Enterprise desk",
    seats: 30,
    mrr: 4470,
    start: 260,
    contact: ["James Okafor", "Head of Investment Research", "decision_maker"],
  },
  {
    n: 6,
    name: "Baillie Gifford",
    domain: "bailliegifford.com",
    firm: "Asset manager",
    size: "201+",
    country: "United Kingdom",
    plan: "Enterprise desk",
    seats: 25,
    mrr: 3725,
    start: 330,
    contact: ["Fiona Macrae", "Investment Operations Director", "champion"],
    changes: [[90, 745, "Five seats for the emerging markets team"]],
    renewal: ["likely", 70, "Waiting on the investment operations budget round."],
  },
  {
    n: 7,
    name: "Jane Street",
    domain: "janestreet.com",
    firm: "Prop desk",
    size: "201+",
    country: "United States",
    plan: "Enterprise desk",
    seats: 24,
    mrr: 3576,
    start: 200,
    contact: ["Ravi Menon", "Trading Desk Lead", "decision_maker"],
    changes: [[70, 596, "Four seats, Hong Kong desk"]],
  },
  {
    n: 8,
    name: "Kotak Mahindra Bank",
    domain: "kotak.com",
    firm: "Bank",
    size: "201+",
    country: "India",
    plan: "Enterprise desk",
    seats: 20,
    mrr: 2980,
    start: 120,
    contact: ["Ananya Iyer", "Head of Institutional Equities Research", "decision_maker"],
    changes: [[10, 745, "Five seats for the derivatives desk"]],
  },
  // --- Team, $169 a seat, annual --------------------------------------------------
  {
    n: 9,
    name: "Marshall Wace",
    domain: "mwam.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United Kingdom",
    plan: "Team",
    seats: 18,
    mrr: 3042,
    start: 610,
    contact: ["Henrik Lund", "Head of Data", "champion"],
    changes: [[380, 1014, "Six seats for the systematic analysts"]],
  },
  {
    n: 10,
    name: "Capula Investment Management",
    domain: "capulaglobal.com",
    firm: "Hedge fund",
    size: "51-200",
    country: "United Kingdom",
    plan: "Team",
    seats: 12,
    mrr: 2028,
    start: 520,
    contact: ["Elena Petrova", "Portfolio Manager", "user"],
    changes: [[45, -169, "One seat returned after a portfolio manager left"]],
  },
  {
    n: 11,
    name: "Rokos Capital Management",
    domain: "rokoscapital.com",
    firm: "Hedge fund",
    size: "51-200",
    country: "United Kingdom",
    plan: "Team",
    seats: 10,
    mrr: 1690,
    start: 450,
    contact: ["Daniel Reyes", "Head of Macro Research", "decision_maker"],
  },
  {
    n: 12,
    name: "Squarepoint Capital",
    domain: "squarepoint-capital.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United Kingdom",
    plan: "Team",
    seats: 15,
    mrr: 2535,
    start: 400,
    contact: ["Wei Zhang", "Quantitative Researcher", "user"],
    changes: [[120, 845, "Five seats, Singapore office"]],
  },
  {
    n: 13,
    name: "Schonfeld Strategic Advisors",
    domain: "schonfeld.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    plan: "Team",
    seats: 14,
    mrr: 2366,
    start: 370,
    contact: ["Rachel Goldberg", "Head of Fundamental Equities Platform", "decision_maker"],
    changes: [[30, 338, "Two seats for the new healthcare pod"]],
  },
  {
    n: 14,
    name: "ExodusPoint Capital",
    domain: "exoduspoint.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    plan: "Team",
    seats: 12,
    mrr: 2028,
    start: 340,
    contact: ["Tom Nakamura", "Portfolio Manager", "champion"],
    renewal: ["likely", 75, "Positive check-in; a second pod may join."],
  },
  {
    n: 15,
    name: "Verition Fund Management",
    domain: "verition.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    plan: "Team",
    seats: 9,
    mrr: 1521,
    start: 300,
    contact: ["Priya Venkataraman", "Risk Manager", "user"],
    renewal: ["likely", 70, "Renewal conversation booked for next month."],
  },
  {
    n: 16,
    name: "Systematica Investments",
    domain: "systematica.com",
    firm: "Hedge fund",
    size: "51-200",
    country: "Jersey",
    plan: "Team",
    seats: 10,
    mrr: 1690,
    start: 290,
    contact: ["Luca Ferrari", "Head of Research", "decision_maker"],
    renewal: ["commit", 85, "Verbal yes from the head of research.", 1859],
  },
  {
    n: 17,
    name: "Winton",
    domain: "winton.com",
    firm: "Hedge fund",
    size: "51-200",
    country: "United Kingdom",
    plan: "Team",
    seats: 8,
    mrr: 1352,
    start: 560,
    contact: ["Hannah Clarke", "Research Lead", "champion"],
  },
  {
    n: 18,
    name: "Aspect Capital",
    domain: "aspectcapital.com",
    firm: "Hedge fund",
    size: "51-200",
    country: "United Kingdom",
    plan: "Team",
    seats: 8,
    mrr: 1352,
    start: 430,
    contact: ["George Whitmore", "Portfolio Manager", "user"],
  },
  {
    n: 19,
    name: "Eisler Capital",
    domain: "eislercapital.com",
    firm: "Hedge fund",
    size: "51-200",
    country: "United Kingdom",
    plan: "Team",
    seats: 8,
    mrr: 1352,
    start: 240,
    contact: ["Nadia Hussain", "Chief of Staff", "champion"],
  },
  {
    n: 20,
    name: "Walleye Capital",
    domain: "walleyecapital.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    plan: "Team",
    seats: 7,
    mrr: 1183,
    start: 210,
    contact: ["Chris Lindqvist", "Head of Trading", "decision_maker"],
  },
  {
    n: 21,
    name: "Graham Capital Management",
    domain: "grahamcapital.com",
    firm: "Hedge fund",
    size: "51-200",
    country: "United States",
    plan: "Team",
    seats: 6,
    mrr: 1014,
    start: 500,
    contact: ["Michael Torres", "Portfolio Manager", "user"],
  },
  {
    n: 22,
    name: "Optiver",
    domain: "optiver.com",
    firm: "Prop desk",
    size: "201+",
    country: "Netherlands",
    plan: "Team",
    seats: 12,
    mrr: 2028,
    start: 320,
    contact: ["Sanne de Vries", "Head of Research", "decision_maker"],
  },
  {
    n: 23,
    name: "IMC Trading",
    domain: "imc.com",
    firm: "Prop desk",
    size: "201+",
    country: "Netherlands",
    plan: "Team",
    seats: 8,
    mrr: 1352,
    start: 180,
    contact: ["Pieter Jansen", "Trading Lead", "champion"],
  },
  {
    n: 24,
    name: "Qube Research & Technologies",
    domain: "qube-rt.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United Kingdom",
    plan: "Team",
    seats: 10,
    mrr: 1690,
    start: 160,
    contact: ["Aisha Khan", "Quantitative Research Manager", "decision_maker"],
  },
  {
    n: 25,
    name: "Ruffer",
    domain: "ruffer.co.uk",
    firm: "Asset manager",
    size: "201+",
    country: "United Kingdom",
    plan: "Team",
    seats: 6,
    mrr: 1014,
    start: 380,
    contact: ["Edward Hale", "Investment Director", "decision_maker"],
  },
  {
    n: 26,
    name: "Ninety One",
    domain: "ninetyone.com",
    firm: "Asset manager",
    size: "201+",
    country: "United Kingdom",
    plan: "Team",
    seats: 8,
    mrr: 1352,
    start: 150,
    contact: ["Thandi Nkosi", "Head of Equity Research", "decision_maker"],
  },
  {
    n: 27,
    name: "Wellington Management",
    domain: "wellington.com",
    firm: "Asset manager",
    size: "201+",
    country: "United States",
    plan: "Team",
    seats: 12,
    mrr: 2028,
    start: 130,
    contact: ["Sarah Kim", "Research Operations Manager", "champion"],
  },
  {
    n: 28,
    name: "Avendus Capital",
    domain: "avendus.com",
    firm: "Bank",
    size: "201+",
    country: "India",
    plan: "Team",
    seats: 6,
    mrr: 1014,
    start: 100,
    contact: ["Rohan Mehta", "Director, Institutional Equities", "decision_maker"],
  },
  {
    n: 29,
    name: "Regal Partners",
    domain: "regalfm.com",
    firm: "Hedge fund",
    size: "51-200",
    country: "Australia",
    plan: "Team",
    seats: 6,
    mrr: 1014,
    start: 75,
    contact: ["Lucy Adams", "Portfolio Manager", "champion"],
    won: { entered: 140, stages: ["demo_done", "pilot", "proposal", "negotiation"] },
  },
  // --- Professional desk, $199 a seat ----------------------------------------------
  {
    n: 30,
    name: "Evelyn Partners",
    domain: "evelyn.com",
    firm: "Wealth manager",
    size: "201+",
    country: "United Kingdom",
    plan: "Professional desk",
    seats: 3,
    mrr: 597,
    start: 420,
    contact: ["Charlotte Reid", "Investment Manager", "user"],
    changes: [[20, -199, "One seat fewer after a team restructure"]],
  },
  {
    n: 31,
    name: "Rathbones",
    domain: "rathbones.com",
    firm: "Wealth manager",
    size: "201+",
    country: "United Kingdom",
    plan: "Professional desk",
    seats: 4,
    mrr: 796,
    start: 350,
    contact: ["William Grant", "Head of Research", "decision_maker"],
    changes: [[140, 199, "Fourth seat"]],
    renewal: ["commit", 90, "Research head signed off; invoice to follow."],
  },
  {
    n: 32,
    name: "Julius Baer",
    domain: "juliusbaer.com",
    firm: "Wealth manager",
    size: "201+",
    country: "Switzerland",
    plan: "Professional desk",
    seats: 3,
    mrr: 597,
    start: 310,
    contact: ["Matthias Keller", "Investment Advisor", "user"],
    renewal: ["at_risk", 35, "Champion moved teams; new sponsor not yet met."],
  },
  {
    n: 33,
    name: "Pictet",
    domain: "pictet.com",
    firm: "Wealth manager",
    size: "201+",
    country: "Switzerland",
    plan: "Professional desk",
    seats: 2,
    mrr: 398,
    start: 280,
    contact: ["Claire Dubois", "Portfolio Manager", "champion"],
  },
  {
    n: 34,
    name: "Stonehage Fleming",
    domain: "stonehagefleming.com",
    firm: "Family office",
    size: "201+",
    country: "United Kingdom",
    plan: "Professional desk",
    seats: 2,
    mrr: 398,
    start: 260,
    contact: ["Alexander Moore", "Investment Director", "decision_maker"],
  },
  {
    n: 35,
    name: "Iconiq Capital",
    domain: "iconiqcapital.com",
    firm: "Family office",
    size: "201+",
    country: "United States",
    plan: "Professional desk",
    seats: 3,
    mrr: 597,
    start: 230,
    contact: ["Jordan Lee", "Investment Associate", "user"],
  },
  {
    n: 36,
    name: "Bessemer Trust",
    domain: "bessemertrust.com",
    firm: "Wealth manager",
    size: "201+",
    country: "United States",
    plan: "Professional desk",
    seats: 2,
    mrr: 398,
    start: 220,
    contact: ["Emily Carter", "Portfolio Manager", "user"],
  },
  {
    n: 37,
    name: "Capital Economics",
    domain: "capitaleconomics.com",
    firm: "Research firm",
    size: "51-200",
    country: "United Kingdom",
    plan: "Professional desk",
    seats: 3,
    mrr: 597,
    start: 400,
    contact: ["Neil Ashworth", "Senior Markets Economist", "champion"],
  },
  {
    n: 38,
    name: "TS Lombard",
    domain: "tslombard.com",
    firm: "Research firm",
    size: "51-200",
    country: "United Kingdom",
    plan: "Professional desk",
    seats: 2,
    mrr: 398,
    start: 360,
    contact: ["Anna Kowalski", "Senior Economist", "user"],
    renewal: ["at_risk", 40, "Budget review this quarter; one of two users left."],
  },
  {
    n: 39,
    name: "BCA Research",
    domain: "bcaresearch.com",
    firm: "Research firm",
    size: "201+",
    country: "Canada",
    plan: "Professional desk",
    seats: 2,
    mrr: 398,
    start: 190,
    contact: ["David Chen", "Strategist", "champion"],
  },
  {
    n: 40,
    name: "Gavekal",
    domain: "gavekal.com",
    firm: "Research firm",
    size: "11-50",
    country: "Hong Kong",
    plan: "Professional desk",
    seats: 2,
    mrr: 398,
    start: 170,
    contact: ["Mei Lin", "Research Analyst", "user"],
  },
  {
    n: 41,
    name: "Marcellus Investment Managers",
    domain: "marcellus.in",
    firm: "Asset manager",
    size: "51-200",
    country: "India",
    plan: "Professional desk",
    seats: 2,
    mrr: 398,
    start: 140,
    contact: ["Karan Shah", "Research Analyst", "user"],
  },
  {
    n: 42,
    name: "Abakkus Asset Manager",
    domain: "abakkusinvest.com",
    firm: "Asset manager",
    size: "11-50",
    country: "India",
    plan: "Professional desk",
    seats: 2,
    mrr: 398,
    start: 110,
    contact: ["Sneha Patel", "Fund Manager", "decision_maker"],
  },
  {
    n: 43,
    name: "Nuvama Wealth",
    domain: "nuvama.com",
    firm: "Wealth manager",
    size: "201+",
    country: "India",
    plan: "Professional desk",
    seats: 3,
    mrr: 597,
    start: 90,
    contact: ["Arjun Malhotra", "Head of Products, Private Wealth", "decision_maker"],
    changes: [[25, 199, "Third seat"]],
    won: { entered: 150, stages: ["demo_done", "pilot", "proposal"] },
  },
  {
    n: 44,
    name: "Bank of Singapore",
    domain: "bankofsingapore.com",
    firm: "Bank",
    size: "201+",
    country: "Singapore",
    plan: "Professional desk",
    seats: 3,
    mrr: 597,
    start: 65,
    contact: ["Grace Tan", "Investment Strategist", "champion"],
    won: { entered: 120, stages: ["demo_done", "pilot", "proposal"] },
  },
  {
    n: 45,
    name: "L1 Capital",
    domain: "l1.com.au",
    firm: "Hedge fund",
    size: "11-50",
    country: "Australia",
    plan: "Professional desk",
    seats: 2,
    mrr: 398,
    start: 50,
    contact: ["Ben Carter", "Analyst", "user"],
    won: { entered: 95, stages: ["demo_done", "proposal"] },
  },
  // --- Desk, $199, one seat, monthly ----------------------------------------------
  {
    n: 46,
    name: "Muddy Waters Research",
    domain: "muddywatersresearch.com",
    firm: "Research firm",
    size: "2-10",
    country: "United States",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 300,
    contact: ["Sam Whitaker", "Research Analyst", "user"],
    renewal: ["lost", 0, "Moving to an in-house tool at the end of the term."],
  },
  {
    n: 47,
    name: "Kerrisdale Capital",
    domain: "kerrisdalecap.com",
    firm: "Hedge fund",
    size: "2-10",
    country: "United States",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 240,
    contact: ["Leah Moreno", "Analyst", "user"],
  },
  {
    n: 48,
    name: "Variant Perception",
    domain: "variantperception.com",
    firm: "Research firm",
    size: "11-50",
    country: "United Kingdom",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 210,
    contact: ["Owen Price", "Macro Strategist", "champion"],
  },
  {
    n: 49,
    name: "Macro Hive",
    domain: "macrohive.com",
    firm: "Research firm",
    size: "11-50",
    country: "United Kingdom",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 180,
    contact: ["Isla Ferguson", "Senior Strategist", "user"],
  },
  {
    n: 50,
    name: "Bianco Research",
    domain: "biancoresearch.com",
    firm: "Independent",
    size: "2-10",
    country: "United States",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 160,
    contact: ["Paul Sanders", "Analyst", "user"],
  },
  {
    n: 51,
    name: "Alpine Macro",
    domain: "alpinemacro.com",
    firm: "Independent",
    size: "11-50",
    country: "Canada",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 125,
    contact: ["Julie Tremblay", "Strategist", "champion"],
  },
  {
    n: 52,
    name: "Grant's Interest Rate Observer",
    domain: "grantspub.com",
    firm: "Independent",
    size: "2-10",
    country: "United States",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 95,
    contact: ["Harriet Cole", "Analyst", "user"],
  },
  {
    n: 53,
    name: "Quadeye",
    domain: "quadeye.com",
    firm: "Prop desk",
    size: "51-200",
    country: "India",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 80,
    contact: ["Vikram Nair", "Quantitative Trader", "user"],
  },
  {
    n: 54,
    name: "Fundstrat",
    domain: "fsinsight.com",
    firm: "Independent",
    size: "11-50",
    country: "United States",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 60,
    contact: ["Nina Alvarez", "Research Associate", "user"],
    won: { entered: 80, stages: ["demo_done"] },
  },
  {
    n: 55,
    name: "Longview Economics",
    domain: "longvieweconomics.com",
    firm: "Research firm",
    size: "2-10",
    country: "United Kingdom",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 40,
    contact: ["Robert Ellis", "Economist", "user"],
    won: { entered: 62, stages: ["demo_done", "pilot"] },
  },
  {
    n: 56,
    name: "Spark Capital",
    domain: "sparkcapital.in",
    firm: "Bank",
    size: "51-200",
    country: "India",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 25,
    contact: ["Deepak Rao", "Research Analyst", "champion"],
    won: { entered: 50, stages: ["demo_done", "proposal"] },
  },
  {
    n: 57,
    name: "Waterfield Advisors",
    domain: "waterfieldadvisors.com",
    firm: "Wealth manager",
    size: "51-200",
    country: "India",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 0,
    contact: ["Meera Krishnan", "Investment Advisor", "decision_maker"],
    won: { entered: 40, stages: ["demo_done", "pilot", "proposal"] },
  },
  // --- Former customers: their churn is in the bridge -----------------------------
  {
    n: 58,
    name: "Lansdowne Partners",
    domain: "lansdownepartners.com",
    firm: "Hedge fund",
    size: "51-200",
    country: "United Kingdom",
    plan: "Professional desk",
    seats: 3,
    mrr: 597,
    start: 600,
    contact: ["Peter Hollis", "Analyst", "user"],
    churned: [330, "switched"],
  },
  {
    n: 59,
    name: "Pelham Capital",
    domain: "pelhamcapital.com",
    firm: "Hedge fund",
    size: "11-50",
    country: "United Kingdom",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 420,
    contact: ["Amelia Ward", "Analyst", "user"],
    churned: [200, "budget"],
  },
  {
    n: 60,
    name: "Polar Capital",
    domain: "polarcapital.co.uk",
    firm: "Asset manager",
    size: "51-200",
    country: "United Kingdom",
    plan: "Professional desk",
    seats: 2,
    mrr: 398,
    start: 520,
    contact: ["Simon Blake", "Fund Manager", "decision_maker"],
    churned: [150, "missing_feature"],
  },
  {
    n: 61,
    name: "Tibra",
    domain: "tibra.com",
    firm: "Prop desk",
    size: "51-200",
    country: "Australia",
    plan: "Team",
    seats: 6,
    mrr: 1014,
    start: 480,
    contact: ["Jack Morrison", "Head of Trading", "decision_maker"],
    churned: [100, "price"],
  },
  {
    n: 62,
    name: "Third Point",
    domain: "thirdpoint.com",
    firm: "Hedge fund",
    size: "51-200",
    country: "United States",
    plan: "Professional desk",
    seats: 3,
    mrr: 597,
    start: 380,
    contact: ["Laura Bennett", "Analyst", "user"],
    churned: [60, "no_usage"],
  },
  {
    n: 63,
    name: "Fullerton Fund Management",
    domain: "fullertonfund.com",
    firm: "Asset manager",
    size: "201+",
    country: "Singapore",
    plan: "Professional desk",
    seats: 2,
    mrr: 398,
    start: 330,
    contact: ["Kelvin Ong", "Portfolio Manager", "user"],
    churned: [35, "budget"],
  },
  {
    n: 64,
    name: "Ariel Investments",
    domain: "arielinvestments.com",
    firm: "Asset manager",
    size: "51-200",
    country: "United States",
    plan: "Desk",
    seats: 1,
    mrr: 199,
    start: 250,
    contact: ["Monica Hayes", "Research Analyst", "user"],
    churned: [15, "no_usage"],
  },
  {
    n: 65,
    name: "Eastspring Investments",
    domain: "eastspring.com",
    firm: "Asset manager",
    size: "201+",
    country: "Singapore",
    plan: "Professional desk",
    seats: 2,
    mrr: 398,
    start: 290,
    contact: ["Adrian Lim", "Investment Specialist", "user"],
    churned: [270, "switched"],
  },
];

type BookProspect = {
  n: number;
  name: string;
  domain: string;
  firm: string;
  size: string;
  country: string;
  stage: string;
  plan: string;
  mrr: number;
  seats: number;
  next: string;
  due: number;
  entered: number;
  /** Days ago the deal was opened; defaults to twenty days before the last move. */
  created?: number;
  /** Days ago the close date was set for; a past date is a forecast nobody corrected. */
  closeDaysAgo?: number;
  contact: [string, string, string];
  /** "lost" closes it that many days ago for that reason; open otherwise. */
  lost?: [number, string, string];
};

const PROSPECTS: BookProspect[] = [
  // --- Negotiation ----------------------------------------------------------------
  {
    n: 101,
    name: "Citadel",
    domain: "citadel.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    stage: "negotiation",
    plan: "Enterprise desk",
    mrr: 5960,
    seats: 40,
    next: "Legal review of the master agreement",
    due: 3,
    entered: 9,
    created: 74,
    contact: ["Isabel Moreno", "Head of Research Technology", "decision_maker"],
  },
  {
    n: 102,
    name: "Point72",
    domain: "point72.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    stage: "negotiation",
    plan: "Team",
    mrr: 2535,
    seats: 15,
    next: "Agree the seat ramp with procurement",
    due: 5,
    entered: 7,
    created: 60,
    contact: ["Adam Fischer", "Chief Operating Officer, Equities", "decision_maker"],
  },
  // --- Proposal sent --------------------------------------------------------------
  {
    n: 103,
    name: "Two Sigma",
    domain: "twosigma.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    stage: "proposal",
    plan: "Team",
    mrr: 2028,
    seats: 12,
    next: "Walk the proposal with the platform committee",
    due: 4,
    entered: 6,
    created: 48,
    contact: ["Maya Rosenthal", "Head of Research Platforms", "champion"],
  },
  {
    n: 104,
    name: "Lombard Odier",
    domain: "lombardodier.com",
    firm: "Wealth manager",
    size: "201+",
    country: "Switzerland",
    stage: "proposal",
    plan: "Professional desk",
    mrr: 796,
    seats: 4,
    next: "Answer the data-residency questions",
    due: 6,
    entered: 4,
    created: 33,
    contact: ["Julien Favre", "Head of Investment Solutions", "decision_maker"],
  },
  {
    n: 105,
    name: "abrdn",
    domain: "abrdn.com",
    firm: "Asset manager",
    size: "201+",
    country: "United Kingdom",
    stage: "proposal",
    plan: "Enterprise desk",
    mrr: 3725,
    seats: 25,
    next: "Revised proposal for the equities floor",
    due: 8,
    entered: 10,
    created: 70,
    contact: ["Callum Fraser", "Head of Investment Research", "decision_maker"],
  },
  {
    n: 106,
    name: "HDFC Securities",
    domain: "hdfcsec.com",
    firm: "Bank",
    size: "201+",
    country: "India",
    stage: "proposal",
    plan: "Team",
    mrr: 1352,
    seats: 8,
    next: "Commercials call with the research head",
    due: 2,
    entered: 5,
    created: 40,
    contact: ["Nikhil Verma", "Head of Retail Research", "decision_maker"],
  },
  // --- Early access / pilot -------------------------------------------------------
  {
    n: 107,
    name: "Bridgewater Associates",
    domain: "bridgewater.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    stage: "pilot",
    plan: "Team",
    mrr: 1690,
    seats: 10,
    next: "Week-four pilot review",
    due: 5,
    entered: 14,
    created: 45,
    contact: ["Laura Steinberg", "Research Operations Lead", "champion"],
  },
  {
    n: 108,
    name: "AQR Capital Management",
    domain: "aqr.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    stage: "pilot",
    plan: "Team",
    mrr: 1352,
    seats: 8,
    next: "Pilot usage report to the sponsor",
    due: 9,
    entered: 11,
    created: 38,
    contact: ["Ethan Park", "Portfolio Manager", "user"],
  },
  {
    n: 109,
    name: "Fisher Investments",
    domain: "fisherinvestments.com",
    firm: "Wealth manager",
    size: "201+",
    country: "United States",
    stage: "pilot",
    plan: "Professional desk",
    mrr: 995,
    seats: 5,
    next: "Pilot check-in with the research group",
    due: 3,
    entered: 16,
    created: 50,
    closeDaysAgo: 4,
    contact: ["Megan Foster", "Research Analyst", "champion"],
  },
  {
    n: 110,
    name: "Motilal Oswal",
    domain: "motilaloswal.com",
    firm: "Bank",
    size: "201+",
    country: "India",
    stage: "pilot",
    plan: "Team",
    mrr: 1014,
    seats: 6,
    next: "Pilot review with the institutional desk",
    due: 7,
    entered: 8,
    created: 30,
    contact: ["Rahul Desai", "Head of Institutional Research", "decision_maker"],
  },
  {
    n: 111,
    name: "Hillhouse Investment",
    domain: "hillhousecap.com",
    firm: "Hedge fund",
    size: "201+",
    country: "Hong Kong",
    stage: "pilot",
    plan: "Professional desk",
    mrr: 796,
    seats: 4,
    next: "Send the pilot findings and pricing",
    due: 4,
    entered: 12,
    created: 36,
    contact: ["Vivian Cheng", "Investment Analyst", "user"],
  },
  {
    n: 112,
    name: "Nomura",
    domain: "nomura.com",
    firm: "Bank",
    size: "201+",
    country: "Japan",
    stage: "pilot",
    plan: "Team",
    mrr: 1690,
    seats: 10,
    next: "Security questionnaire back to their vendor team",
    due: 12,
    entered: 6,
    created: 28,
    contact: ["Kenji Sato", "Head of Equity Research Technology", "decision_maker"],
  },
  // --- Demo done ------------------------------------------------------------------
  {
    n: 113,
    name: "D. E. Shaw",
    domain: "deshaw.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    stage: "demo_done",
    plan: "Team",
    mrr: 2028,
    seats: 12,
    next: "Send the recap and the pilot terms",
    due: 1,
    entered: 0.05,
    created: 15,
    contact: ["Sophia Bennett", "Research Platform Lead", "champion"],
  },
  {
    n: 114,
    name: "Carmignac",
    domain: "carmignac.com",
    firm: "Asset manager",
    size: "201+",
    country: "France",
    stage: "demo_done",
    plan: "Professional desk",
    mrr: 597,
    seats: 3,
    next: "Recap to the fund managers who joined",
    due: 2,
    entered: 3,
    created: 18,
    contact: ["Antoine Girard", "Fund Manager", "user"],
  },
  {
    n: 115,
    name: "Flow Traders",
    domain: "flowtraders.com",
    firm: "Prop desk",
    size: "201+",
    country: "Netherlands",
    stage: "demo_done",
    plan: "Team",
    mrr: 1014,
    seats: 6,
    next: "Propose a two-week pilot on the ETF desk",
    due: 3,
    entered: 2,
    created: 12,
    contact: ["Lotte Bakker", "Head of ETF Trading", "decision_maker"],
  },
  {
    n: 116,
    name: "Rockefeller Capital Management",
    domain: "rockco.com",
    firm: "Wealth manager",
    size: "201+",
    country: "United States",
    stage: "demo_done",
    plan: "Professional desk",
    mrr: 597,
    seats: 3,
    next: "Follow up on the model-portfolio questions",
    due: 4,
    entered: 4,
    created: 20,
    contact: ["Brian Walsh", "Senior Portfolio Manager", "user"],
  },
  {
    n: 117,
    name: "360 ONE",
    domain: "360.one",
    firm: "Wealth manager",
    size: "201+",
    country: "India",
    stage: "demo_done",
    plan: "Professional desk",
    mrr: 796,
    seats: 4,
    next: "Recap and a pilot proposal to the products head",
    due: 6,
    entered: 5,
    created: 22,
    contact: ["Pooja Bhatia", "Head of Products", "decision_maker"],
  },
  // --- Demo booked ----------------------------------------------------------------
  {
    n: 118,
    name: "Elliott Management",
    domain: "elliottmgmt.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    stage: "demo_booked",
    plan: "Team",
    mrr: 1352,
    seats: 8,
    next: "Demo for the equities team",
    due: 3,
    entered: 0.05,
    created: 0.05,
    contact: ["Nathan Brooks", "Analyst", "champion"],
  },
  {
    n: 119,
    name: "Robeco",
    domain: "robeco.com",
    firm: "Asset manager",
    size: "201+",
    country: "Netherlands",
    stage: "demo_booked",
    plan: "Professional desk",
    mrr: 796,
    seats: 4,
    next: "Demo with the quant equities team",
    due: 5,
    entered: 2,
    created: 6,
    contact: ["Femke van Dijk", "Portfolio Manager", "user"],
  },
  {
    n: 120,
    name: "DRW",
    domain: "drw.com",
    firm: "Prop desk",
    size: "201+",
    country: "United States",
    stage: "demo_booked",
    plan: "Team",
    mrr: 1014,
    seats: 6,
    next: "Demo for the rates desk",
    due: 6,
    entered: 3,
    created: 9,
    contact: ["Kyle Peterson", "Trading Desk Lead", "decision_maker"],
  },
  {
    n: 121,
    name: "Macquarie",
    domain: "macquarie.com",
    firm: "Bank",
    size: "201+",
    country: "Australia",
    stage: "demo_booked",
    plan: "Team",
    mrr: 1352,
    seats: 8,
    next: "Demo with the research and strategy team",
    due: 8,
    entered: 2,
    created: 11,
    contact: ["Olivia Hart", "Equity Strategist", "champion"],
  },
  {
    n: 122,
    name: "Neuberger Berman",
    domain: "nb.com",
    firm: "Asset manager",
    size: "201+",
    country: "United States",
    stage: "demo_booked",
    plan: "Professional desk",
    mrr: 995,
    seats: 5,
    next: "Demo for the global equity research team",
    due: 9,
    entered: 4,
    created: 13,
    contact: ["Daniel Hughes", "Director of Research", "decision_maker"],
  },
  {
    n: 123,
    name: "Smartkarma",
    domain: "smartkarma.com",
    firm: "Research firm",
    size: "51-200",
    country: "Singapore",
    stage: "demo_booked",
    plan: "Professional desk",
    mrr: 398,
    seats: 2,
    next: "Demo with the insight providers team",
    due: 4,
    entered: 0.05,
    created: 0.05,
    contact: ["Jasmine Goh", "Head of Research Operations", "champion"],
  },
  // --- Lost, last ninety days -----------------------------------------------------
  {
    n: 124,
    name: "Renaissance Technologies",
    domain: "rentec.com",
    firm: "Hedge fund",
    size: "201+",
    country: "United States",
    stage: "lost",
    plan: "Team",
    mrr: 1352,
    seats: 8,
    next: "",
    due: 0,
    entered: 70,
    created: 130,
    contact: ["Alan Whitcombe", "Research Engineer", "user"],
    lost: [70, "status_quo", "Kept the tooling they build in-house."],
  },
  {
    n: 125,
    name: "PIMCO",
    domain: "pimco.com",
    firm: "Asset manager",
    size: "201+",
    country: "United States",
    stage: "lost",
    plan: "Enterprise desk",
    mrr: 2980,
    seats: 20,
    next: "",
    due: 0,
    entered: 55,
    created: 150,
    contact: ["Karen Mitchell", "Head of Vendor Management", "decision_maker"],
    lost: [55, "procurement", "Vendor onboarding stalled; try again next budget year."],
  },
  {
    n: 126,
    name: "Coatue",
    domain: "coatue.com",
    firm: "Hedge fund",
    size: "51-200",
    country: "United States",
    stage: "lost",
    plan: "Team",
    mrr: 1014,
    seats: 6,
    next: "",
    due: 0,
    entered: 40,
    created: 95,
    contact: ["Jason Liu", "Analyst", "user"],
    lost: [40, "timing", "Mid-year freeze on new subscriptions."],
  },
  {
    n: 127,
    name: "Goldman Sachs",
    domain: "goldmansachs.com",
    firm: "Bank",
    size: "201+",
    country: "United States",
    stage: "lost",
    plan: "Enterprise desk",
    mrr: 4470,
    seats: 30,
    next: "",
    due: 0,
    entered: 30,
    created: 120,
    contact: ["Michelle Turner", "Head of Research Platforms", "decision_maker"],
    lost: [30, "competitor", "Renewed the incumbent terminal firm-wide."],
  },
  {
    n: 128,
    name: "Platinum Asset Management",
    domain: "platinum.com.au",
    firm: "Asset manager",
    size: "51-200",
    country: "Australia",
    stage: "lost",
    plan: "Professional desk",
    mrr: 597,
    seats: 3,
    next: "",
    due: 0,
    entered: 20,
    created: 75,
    contact: ["Andrew Scott", "Portfolio Manager", "user"],
    lost: [20, "price", "Wanted the Desk price for the Professional desk."],
  },
  {
    n: 129,
    name: "Cerity Partners",
    domain: "ceritypartners.com",
    firm: "Wealth manager",
    size: "201+",
    country: "United States",
    stage: "lost",
    plan: "Professional desk",
    mrr: 398,
    seats: 2,
    next: "",
    due: 0,
    entered: 0.1,
    created: 60,
    contact: ["Stephanie Ross", "Partner", "decision_maker"],
    lost: [0.1, "no_decision", "Went quiet after the proposal."],
  },
];

function bookCompanyId(n: number): string {
  return `c0000000-0000-4000-8000-0000000001${n.toString(16).padStart(2, "0")}`;
}
function bookPersonId(n: number): string {
  return `e0000000-0000-4000-8000-0000000001${n.toString(16).padStart(2, "0")}`;
}
function bookDealId(n: number): string {
  return `d1000000-0000-4000-8000-0000000001${n.toString(16).padStart(2, "0")}`;
}
function bookContractId(n: number): string {
  return `cc200000-0000-4000-8000-0000000001${n.toString(16).padStart(2, "0")}`;
}
function emailFor(name: string, domain: string): string {
  const [first = "", ...rest] = name.toLowerCase().split(" ");
  const last = rest[rest.length - 1] ?? "";
  return `${[first, last]
    .filter(Boolean)
    .join(".")
    .replace(/[^a-z.]/g, "")}@${domain}`;
}
/** The first renewal date on or after today, stepping the term from the start. */
function nextRenewal(startsOn: string, termMonths: number): string {
  let renews = addMonths(startsOn, termMonths);
  while (renews < dayOffset(0)) renews = addMonths(renews, termMonths);
  return renews;
}
/** Team and Enterprise agreements are annual; a desk or two is billed monthly. */
function cadenceFor(plan: string): string {
  return plan === "Team" || plan === "Enterprise desk" ? "annual" : "monthly";
}

function seedBook() {
  const sourceKeys = sources.filter((row) => !row.archived).map((row) => row.key);
  const sourceOf = (n: number) => sourceKeys[n % Math.max(sourceKeys.length, 1)] ?? "referral";
  const ownerOf = (n: number) => (n % 3 === 0 ? OWNER_STAFF : SALES_STAFF);
  const stageEvents = (
    dealId: string,
    path: string[],
    openedDaysAgo: number,
    closedDaysAgo: number,
    staffId: string,
  ) => {
    const span = Math.max(openedDaysAgo - closedDaysAgo, 0);
    const step = path.length > 1 ? span / (path.length - 1) : 0;
    path.forEach((stage, index) => {
      const daysAgo =
        index === path.length - 1 ? closedDaysAgo : Math.round(openedDaysAgo - step * index);
      dealStageEvents.push({
        deal_id: dealId,
        from_stage_key: index === 0 ? "" : path[index - 1]!,
        to_stage_key: stage,
        at: agoIso(24 * daysAgo),
        staff_id: staffId,
      });
    });
  };

  for (const firm of BOOK) {
    const startsOn = dayOffset(-firm.start);
    const companyId = bookCompanyId(firm.n);
    const personId = bookPersonId(firm.n);
    const contractId = bookContractId(firm.n);
    const owner = ownerOf(firm.n);
    const churnedOn = firm.churned ? dayOffset(-firm.churned[0]) : null;
    const changes = firm.changes ?? [];
    const currentCents = Math.round(firm.mrr * 100);
    const openingCents =
      currentCents - changes.reduce((sum, [, dollars]) => sum + Math.round(dollars * 100), 0);
    companies.push({
      id: companyId,
      name: firm.name,
      domain: firm.domain,
      firm_type: firm.firm,
      team_size_band: firm.size,
      country: firm.country,
      lifecycle: churnedOn ? "former_customer" : "customer",
      owner_staff_id: owner,
      source_key: sourceOf(firm.n),
      notes: "",
      customer_since: startsOn,
      archived: false,
      created_at: agoIso(
        24 * (firm.start + (firm.won?.entered ? firm.won.entered - firm.start : 30)),
      ),
      updated_at: agoIso(24 * Math.min(firm.start, 14)),
    });
    people.push({
      id: personId,
      company_id: companyId,
      full_name: firm.contact[0],
      email: emailFor(firm.contact[0], firm.domain),
      title: firm.contact[1],
      role_category: firm.contact[2],
      phone: "",
      account_user_id: "",
      do_not_contact: false,
      source_key: sourceOf(firm.n),
      notes: "",
      last_contacted_at: agoIso(24 * ((firm.n * 7) % 40)),
      created_at: agoIso(24 * (firm.start + 30)),
    });
    let dealId = "";
    if (firm.won) {
      dealId = bookDealId(firm.n);
      deals.push({
        id: dealId,
        name: `${firm.name} — new business`,
        company_id: companyId,
        primary_person_id: personId,
        stage_key: "won",
        status: "won",
        mrr_amount: openingCents / 100,
        currency: "USD",
        seats: firm.seats,
        expected_close_date: startsOn,
        next_step: "",
        next_step_due: "",
        owner_staff_id: owner,
        source_key: sourceOf(firm.n),
        notes: "",
        entered_stage_at: agoIso(24 * firm.start),
        last_activity_at: agoIso(24 * firm.start),
        loss_reason: "",
        loss_competitor: "",
        loss_detail: "",
        closed_at: agoIso(24 * firm.start),
        created_at: agoIso(24 * firm.won.entered),
      });
      stageEvents(
        dealId,
        ["demo_booked", ...firm.won.stages, "won"],
        firm.won.entered,
        firm.start,
        owner,
      );
    }
    contracts.push({
      id: contractId,
      company_id: companyId,
      deal_id: dealId,
      plan_name: firm.plan,
      plan_key: PLAN_KEY_BY_NAME[firm.plan] ?? "",
      ...(firm.renewal && !churnedOn
        ? {
            renewal_status: firm.renewal[0],
            renewal_confidence: firm.renewal[1],
            renewal_note: firm.renewal[2],
            renewal_forecast_cents:
              firm.renewal[3] !== undefined ? Math.round(firm.renewal[3] * 100) : null,
            renewal_updated_at: agoIso(24 * 6),
            renewal_updated_by: owner,
          }
        : {}),
      seats: firm.seats,
      mrr_cents: currentCents,
      currency: "USD",
      billing_cadence: cadenceFor(firm.plan),
      starts_on: startsOn,
      term_months: 12,
      renews_on: churnedOn ? null : nextRenewal(startsOn, 12),
      status: churnedOn ? "canceled" : "active",
      ends_on: churnedOn,
      cancel_reason: churnedOn ? firm.churned![1] : "",
      notes: "",
      created_at: agoIso(24 * firm.start),
    });
    addMovement({
      contract_id: contractId,
      company_id: companyId,
      kind: "new",
      cents: openingCents,
      currency: "USD",
      effective_on: startsOn,
      note: firm.plan,
      staff_id: owner,
    });
    for (const [daysAgo, dollars, note] of changes) {
      addMovement({
        contract_id: contractId,
        company_id: companyId,
        kind: dollars > 0 ? "expansion" : "contraction",
        cents: Math.round(dollars * 100),
        currency: "USD",
        effective_on: dayOffset(-daysAgo),
        note,
        staff_id: owner,
      });
    }
    if (churnedOn) {
      addMovement({
        contract_id: contractId,
        company_id: companyId,
        kind: "churn",
        cents: -currentCents,
        currency: "USD",
        effective_on: churnedOn,
        note: firm.churned![1],
        staff_id: owner,
      });
    }
  }

  for (const prospect of PROSPECTS) {
    const companyId = bookCompanyId(prospect.n);
    const personId = bookPersonId(prospect.n);
    const dealId = bookDealId(prospect.n);
    const owner = ownerOf(prospect.n);
    const opened = prospect.created ?? prospect.entered + 20;
    const lost = prospect.lost;
    companies.push({
      id: companyId,
      name: prospect.name,
      domain: prospect.domain,
      firm_type: prospect.firm,
      team_size_band: prospect.size,
      country: prospect.country,
      lifecycle: prospect.stage === "pilot" ? "early_access" : "prospect",
      owner_staff_id: owner,
      source_key: sourceOf(prospect.n),
      notes: "",
      customer_since: null,
      archived: false,
      created_at: agoIso(24 * opened),
      updated_at: agoIso(24 * Math.min(prospect.entered, 1)),
    });
    people.push({
      id: personId,
      company_id: companyId,
      full_name: prospect.contact[0],
      email: emailFor(prospect.contact[0], prospect.domain),
      title: prospect.contact[1],
      role_category: prospect.contact[2],
      phone: "",
      account_user_id: "",
      do_not_contact: false,
      source_key: sourceOf(prospect.n),
      notes: "",
      last_contacted_at: agoIso(24 * Math.min(prospect.entered, 2)),
      created_at: agoIso(24 * opened),
    });
    deals.push({
      id: dealId,
      name: `${prospect.name} — new business`,
      company_id: companyId,
      primary_person_id: personId,
      stage_key: lost ? "lost" : prospect.stage,
      status: lost ? "lost" : "open",
      mrr_amount: prospect.mrr,
      currency: "USD",
      plan_key: PLAN_KEY_BY_NAME[prospect.plan] ?? "",
      seats: prospect.seats,
      expected_close_date: lost
        ? dayOffset(-lost[0])
        : prospect.closeDaysAgo !== undefined
          ? dayOffset(-prospect.closeDaysAgo)
          : daysFromNow(prospect.due + 14),
      next_step: lost ? "" : prospect.next,
      next_step_due: lost ? "" : daysFromNow(prospect.due),
      owner_staff_id: owner,
      source_key: sourceOf(prospect.n),
      notes: `${prospect.plan}, ${prospect.seats} ${prospect.seats === 1 ? "seat" : "seats"}.`,
      entered_stage_at: agoIso(24 * prospect.entered),
      last_activity_at: agoIso(24 * Math.min(prospect.entered, 2)),
      loss_reason: lost ? lost[1] : "",
      loss_competitor: "",
      loss_detail: lost ? lost[2] : "",
      closed_at: lost ? agoIso(24 * lost[0]) : null,
      created_at: agoIso(24 * opened),
    });
    const path = ["demo_booked"];
    if (lost) path.push("demo_done", "proposal", "lost");
    else if (prospect.stage !== "demo_booked") path.push(prospect.stage);
    stageEvents(dealId, path, opened, prospect.entered, owner);
  }
}

seedRevenue();

const today = () => new Date().toISOString().slice(0, 10);
const money = (cents: number) => Math.round(cents) / 100;

function contractState(row: ContractRow): string {
  if (row.status !== "canceled") return "active";
  return row.ends_on && row.ends_on > today() ? "ending" : "ended";
}

function renewalView(row: ContractRow) {
  return {
    status: row.renewal_status ?? "",
    confidence: row.renewal_confidence ?? null,
    forecast_mrr: row.renewal_forecast_cents != null ? money(row.renewal_forecast_cents) : null,
    note: row.renewal_note ?? "",
    updated_at: row.renewal_updated_at ?? null,
    updated_by: row.renewal_updated_by ?? "",
  };
}
/** Mirrors revenue_routes.renewal_weighted_mrr: forecast (or today's price) × confidence. */
function renewalWeightedCents(row: ContractRow): number {
  const status = row.renewal_status ?? "";
  if (!status || status === "lost") return 0;
  const confidence = row.renewal_confidence ?? RENEWAL_DEFAULT_CONFIDENCE[status] ?? 0;
  const base = row.renewal_forecast_cents ?? row.mrr_cents;
  return Math.round((base * confidence) / 100);
}
function renewalRollup(month: string, rows: ContractRow[]) {
  const total = (subset: ContractRow[]) =>
    money(subset.reduce((sum, row) => sum + row.mrr_cents, 0));
  const undecided = rows.filter((row) => !row.renewal_status);
  return {
    month,
    due_count: rows.length,
    due_mrr: total(rows),
    forecast_mrr: money(rows.reduce((sum, row) => sum + renewalWeightedCents(row), 0)),
    committed_mrr: money(
      rows
        .filter((row) => row.renewal_status === "commit")
        .reduce((sum, row) => sum + (row.renewal_forecast_cents ?? row.mrr_cents), 0),
    ),
    at_risk_mrr: total(rows.filter((row) => row.renewal_status === "at_risk")),
    lost_mrr: total(rows.filter((row) => row.renewal_status === "lost")),
    undecided_count: undecided.length,
    undecided_mrr: total(undecided),
  };
}

function contractView(row: ContractRow) {
  return {
    renewal: renewalView(row),
    contract_id: row.id,
    company_id: row.company_id,
    company_name: companies.find((company) => company.id === row.company_id)?.name ?? "",
    deal_id: row.deal_id,
    plan_name: row.plan_name,
    plan_key: row.plan_key ?? "",
    seats: row.seats,
    mrr_amount: money(row.mrr_cents),
    currency: row.currency,
    billing_cadence: row.billing_cadence,
    starts_on: row.starts_on,
    term_months: row.term_months,
    renews_on: row.renews_on,
    renews_in_days: row.renews_on
      ? Math.round((Date.parse(row.renews_on) - Date.parse(today())) / 86_400_000)
      : null,
    state: contractState(row),
    ends_on: row.ends_on,
    cancel_reason: row.cancel_reason,
    notes: row.notes,
    created_at: row.created_at,
  };
}

function movementView(row: MovementRow) {
  return {
    kind: row.kind,
    amount: money(row.cents),
    currency: row.currency,
    effective_on: row.effective_on,
    note: row.note,
    contract_id: row.contract_id,
    company_id: row.company_id,
    staff_id: row.staff_id,
  };
}

function mrrCents(currency: string, onOrBefore: string): number {
  return movements
    .filter((row) => row.currency === currency && row.effective_on <= onOrBefore)
    .reduce((sum, row) => sum + row.cents, 0);
}

function totalsFor(currency: string) {
  const byCompany = new Map<string, number>();
  for (const row of movements) {
    if (row.currency !== currency || row.effective_on > today()) continue;
    byCompany.set(row.company_id, (byCompany.get(row.company_id) ?? 0) + row.cents);
  }
  const paying = [...byCompany.values()].filter((cents) => cents > 0);
  const total = paying.reduce((sum, cents) => sum + cents, 0);
  return {
    mrr: money(total),
    arr: money(total * 12),
    customers: paying.length,
    arpa: paying.length ? money(total / paying.length) : 0,
  };
}

function addMovement(row: MovementRow) {
  if (row.cents !== 0) movements.push(row);
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

routes.push(
  {
    method: "GET",
    pattern: "hq/contracts",
    auth: true,
    capability: "revenue:read",
    handler: ({ query }) => {
      const views = contracts
        .filter((row) => !query.company_id || row.company_id === query.company_id)
        .map(contractView)
        .filter((view) => !query.state || view.state === query.state)
        .sort(
          (a, b) =>
            Number(a.state !== "active") - Number(b.state !== "active") ||
            a.company_name.localeCompare(b.company_name),
        );
      const currencies = [...new Set(["USD", ...movements.map((row) => row.currency)])].sort();
      return ok({
        contracts: views,
        totals: Object.fromEntries(currencies.map((currency) => [currency, totalsFor(currency)])),
        renewing_soon: views
          .filter(
            (view) =>
              view.state === "active" &&
              view.renews_in_days !== null &&
              view.renews_in_days >= 0 &&
              view.renews_in_days <= 90,
          )
          .sort((a, b) => (a.renews_in_days ?? 0) - (b.renews_in_days ?? 0)),
        cancel_reasons: CANCEL_REASONS,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/contracts/create",
    auth: true,
    capability: "revenue:write",
    handler: ({ body, headers }) => {
      const company = companies.find((row) => row.id === String(body.company_id ?? ""));
      if (!company) return refuse(400, "malformed_request", { company_id: "no such company" });
      const planKey = String(body.plan_key ?? "").trim();
      const plan = planKey ? activePlan(planKey) : null;
      if (planKey && !plan)
        return refuse(400, "malformed_request", { plan_key: "not a plan on the price list" });
      const planSeats = Math.max(Number(body.seats ?? 1) || 1, plan?.min_seats ?? 1);
      const cents =
        plan && !String(body.mrr_amount ?? "").trim()
          ? Math.round(plan.unit_amount * planSeats * 100)
          : Math.round(Number(body.mrr_amount ?? 0) * 100);
      if (!(cents > 0))
        return refuse(400, "malformed_request", { mrr_amount: "a contract is paid for" });
      const currency = plan ? plan.currency : String(body.currency ?? "USD").toUpperCase() || "USD";
      if (!/^[A-Z]{3}$/.test(currency))
        return refuse(400, "malformed_request", { currency: "a three-letter code" });
      const startsOn = String(body.starts_on ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn))
        return refuse(400, "malformed_request", { starts_on: "expected YYYY-MM-DD" });
      const earlier = contracts.filter((row) => row.company_id === company.id);
      const live = earlier.filter(
        (row) => !(row.status === "canceled" && row.ends_on && row.ends_on <= startsOn),
      );
      const kind = earlier.length === 0 ? "new" : live.length === 0 ? "reactivation" : "expansion";
      const termMonths = Number(body.term_months ?? 12) || 12;
      const found = caller(headers);
      const row: ContractRow = {
        id: randomUUID(),
        company_id: company.id,
        deal_id: String(body.deal_id ?? ""),
        plan_name: String(body.plan_name ?? "") || plan?.name || "",
        plan_key: planKey,
        seats: plan ? planSeats : Math.max(1, Number(body.seats ?? 1) || 1),
        mrr_cents: cents,
        currency,
        billing_cadence: String(body.billing_cadence ?? "") || plan?.billing_cadence || "monthly",
        starts_on: startsOn,
        term_months: termMonths,
        renews_on: addMonths(startsOn, termMonths),
        status: "active",
        ends_on: null,
        cancel_reason: "",
        notes: String(body.notes ?? ""),
        created_at: now(),
      };
      contracts.push(row);
      addMovement({
        contract_id: row.id,
        company_id: company.id,
        kind,
        cents,
        currency,
        effective_on: startsOn,
        note: row.plan_name,
        staff_id: found?.member.id ?? "",
      });
      company.lifecycle = "customer";
      company.customer_since = company.customer_since ?? startsOn;
      audit("contract.created", found?.member.id ?? null, "contract", row.id);
      return ok({ contract: contractView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/contracts/{contract_id}",
    auth: true,
    capability: "revenue:read",
    handler: ({ params }) => {
      const row = contracts.find((contract) => contract.id === params.contract_id);
      if (!row) return refuse(404, "not_found");
      return ok({
        contract: contractView(row),
        movements: movements
          .filter((movement) => movement.contract_id === row.id)
          .sort((a, b) => a.effective_on.localeCompare(b.effective_on))
          .map(movementView),
        cancel_reasons: CANCEL_REASONS,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/contracts/{contract_id}/renewal",
    auth: true,
    capability: "revenue:write",
    handler: ({ params, body, headers }) => {
      const row = contracts.find((contract) => contract.id === params.contract_id);
      if (!row) return refuse(404, "not_found");
      if (contractState(row) !== "active")
        return refuse(400, "malformed_request", { status: "only an active contract renews" });
      let changed = false;
      if ("status" in body) {
        const status = String(body.status ?? "").trim() as RenewalStatus;
        if (status && !RENEWAL_STATUSES.includes(status))
          return refuse(400, "malformed_request", {
            status: "commit, likely, at_risk, lost, or empty",
          });
        row.renewal_status = status;
        if (!status) {
          row.renewal_confidence = null;
          row.renewal_forecast_cents = null;
          row.renewal_note = "";
        } else if (row.renewal_confidence == null && !("confidence" in body)) {
          row.renewal_confidence = RENEWAL_DEFAULT_CONFIDENCE[status] ?? null;
        }
        changed = true;
      }
      if ("confidence" in body && row.renewal_status) {
        const raw = String(body.confidence ?? "").trim();
        if (raw) {
          const confidence = Number(raw);
          if (!Number.isInteger(confidence) || confidence < 0 || confidence > 100)
            return refuse(400, "malformed_request", { confidence: "0 to 100" });
          row.renewal_confidence = confidence;
        } else {
          row.renewal_confidence = null;
        }
        changed = true;
      }
      if ("forecast_mrr" in body && row.renewal_status) {
        const raw = String(body.forecast_mrr ?? "").trim();
        if (raw) {
          const cents = Math.round(Number(raw) * 100);
          if (!(cents >= 0)) return refuse(400, "malformed_request", { forecast_mrr: "a price" });
          row.renewal_forecast_cents = cents;
        } else {
          row.renewal_forecast_cents = null;
        }
        changed = true;
      }
      if ("note" in body && row.renewal_status) {
        row.renewal_note = String(body.note ?? "")
          .trim()
          .slice(0, 400);
        changed = true;
      }
      if (!changed) return refuse(400, "malformed_request", { reason: "nothing to change" });
      row.renewal_updated_at = now();
      row.renewal_updated_by = caller(headers)?.member.id ?? "";
      audit("contract.renewal_forecast", caller(headers)?.member.id ?? null, "contract", row.id);
      return ok({ contract: contractView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/revenue/renewals",
    auth: true,
    capability: "revenue:read",
    handler: ({ query }) => {
      const windowDays = Math.max(1, Math.min(Number(query.days ?? 120) || 120, 730));
      const currency = String(query.currency ?? "USD").toUpperCase();
      const todayIso = today();
      const daysUntil = (day: string) =>
        Math.round((Date.parse(day) - Date.parse(todayIso)) / 86_400_000);
      const rows = contracts
        .filter(
          (row) =>
            contractState(row) === "active" &&
            row.currency === currency &&
            row.renews_on !== null &&
            daysUntil(row.renews_on) <= windowDays,
        )
        .sort((a, b) => (a.renews_on ?? "").localeCompare(b.renews_on ?? ""));
      const ahead = rows.filter((row) => (row.renews_on ?? "") >= todayIso);
      const overdue = rows.filter((row) => (row.renews_on ?? "") < todayIso);
      const firstMonth = `${todayIso.slice(0, 7)}-01`;
      const months = Array.from({ length: 6 }, (_, index) => {
        const key = addMonths(firstMonth, index).slice(0, 7);
        return renewalRollup(
          key,
          ahead.filter((row) => (row.renews_on ?? "").slice(0, 7) === key),
        );
      });
      const rollup = renewalRollup("window", ahead);
      const totals = Object.fromEntries(Object.entries(rollup).filter(([key]) => key !== "month"));
      return ok({
        currency,
        window_days: windowDays,
        today: todayIso,
        renewals: rows.map((row) => ({
          ...contractView(row),
          weighted_mrr: money(renewalWeightedCents(row)),
        })),
        months,
        totals: {
          ...totals,
          overdue_count: overdue.length,
          overdue_mrr: money(overdue.reduce((sum, row) => sum + row.mrr_cents, 0)),
        },
        statuses: RENEWAL_STATUSES,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/contracts/{contract_id}/update",
    auth: true,
    capability: "revenue:write",
    handler: ({ params, body, headers }) => {
      const row = contracts.find((contract) => contract.id === params.contract_id);
      if (!row) return refuse(404, "not_found");
      const before = { ...row };
      let changed = false;
      if ("plan_name" in body) {
        row.plan_name = String(body.plan_name ?? "");
        changed = true;
      }
      if ("plan_key" in body) {
        const planKey = String(body.plan_key ?? "").trim();
        if (planKey) {
          const plan = activePlan(planKey);
          if (!plan)
            return refuse(400, "malformed_request", { plan_key: "not a plan on the price list" });
          row.plan_name = plan.name;
        }
        row.plan_key = planKey;
        changed = true;
      }
      if ("notes" in body) {
        row.notes = String(body.notes ?? "");
        changed = true;
      }
      if ("seats" in body) {
        const seats = Number(body.seats);
        if (!(seats >= 1)) return refuse(400, "malformed_request", { seats: "at least one" });
        row.seats = seats;
        changed = true;
      }
      if ("mrr_amount" in body) {
        if (row.status !== "active")
          return refuse(400, "malformed_request", {
            mrr_amount: "a canceled contract's price is fixed",
          });
        const cents = Math.round(Number(body.mrr_amount) * 100);
        if (!(cents > 0))
          return refuse(400, "malformed_request", { mrr_amount: "cancel the contract instead" });
        const effective = String(body.effective_on ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(effective))
          return refuse(400, "malformed_request", { effective_on: "expected YYYY-MM-DD" });
        if (effective < row.starts_on)
          return refuse(400, "malformed_request", { effective_on: "before the contract started" });
        const delta = cents - row.mrr_cents;
        if (delta !== 0) {
          addMovement({
            contract_id: row.id,
            company_id: row.company_id,
            kind: delta > 0 ? "expansion" : "contraction",
            cents: delta,
            currency: row.currency,
            effective_on: effective,
            note: String(body.note ?? ""),
            staff_id: caller(headers)?.member.id ?? "",
          });
          row.mrr_cents = cents;
          changed = true;
        }
      }
      if (!changed) return refuse(400, "malformed_request", { reason: "nothing to change" });
      audit("contract.updated", caller(headers)?.member.id ?? null, "contract", row.id, "", {
        fields: Object.keys(changesBetween(before, row)).sort(),
        changes: changesBetween(before, row),
      });
      return ok({ contract: contractView(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/contracts/{contract_id}/cancel",
    auth: true,
    capability: "revenue:write",
    handler: ({ params, body, headers }) => {
      const row = contracts.find((contract) => contract.id === params.contract_id);
      if (!row) return refuse(404, "not_found");
      if (row.status !== "active")
        return refuse(400, "malformed_request", { status: "already canceled" });
      const endsOn = String(body.ends_on ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(endsOn) || endsOn < row.starts_on)
        return refuse(400, "malformed_request", { ends_on: "a date after the start" });
      const reason = String(body.cancel_reason ?? "");
      if (!CANCEL_REASONS.includes(reason))
        return refuse(400, "malformed_request", { cancel_reason: "pick a reason" });
      row.status = "canceled";
      row.ends_on = endsOn;
      row.cancel_reason = reason;
      addMovement({
        contract_id: row.id,
        company_id: row.company_id,
        kind: "churn",
        cents: -row.mrr_cents,
        currency: row.currency,
        effective_on: endsOn,
        note: String(body.note ?? "") || reason,
        staff_id: caller(headers)?.member.id ?? "",
      });
      if (
        !contracts.some(
          (other) =>
            other.company_id === row.company_id && other.id !== row.id && other.status === "active",
        )
      ) {
        const company = companies.find((candidate) => candidate.id === row.company_id);
        if (company) company.lifecycle = "former_customer";
      }
      audit(
        "contract.canceled",
        caller(headers)?.member.id ?? null,
        "contract",
        row.id,
        String(body.note ?? ""),
      );
      return ok({ contract: contractView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/revenue/mrr",
    auth: true,
    capability: "revenue:read",
    handler: ({ query }) => {
      const currency = String(query.currency ?? "USD").toUpperCase();
      const months = Math.max(1, Math.min(Number(query.months ?? 12) || 12, 24));
      const first = addMonths(`${today().slice(0, 7)}-01`, -(months - 1));
      const kinds = ["new", "expansion", "contraction", "churn", "reactivation", "adjustment"];
      const series = Array.from({ length: months }, (_, index) => {
        const start = addMonths(first, index);
        const next = addMonths(start, 1);
        const dayBefore = new Date(Date.parse(start) - 86_400_000).toISOString().slice(0, 10);
        const startCents = mrrCents(currency, dayBefore);
        const byKind: Record<string, number> = Object.fromEntries(kinds.map((kind) => [kind, 0]));
        for (const row of movements)
          if (row.currency === currency && row.effective_on >= start && row.effective_on < next)
            byKind[row.kind] = (byKind[row.kind] ?? 0) + row.cents;
        const moved = Object.values(byKind).reduce((sum, cents) => sum + cents, 0);
        return {
          month: start.slice(0, 7),
          start: money(startCents),
          ...Object.fromEntries(kinds.map((kind) => [kind, money(byKind[kind] ?? 0)])),
          end: money(startCents + moved),
          partial: next > today(),
        };
      });
      return ok({
        currency,
        currencies: [...new Set(movements.map((row) => row.currency))].sort(),
        months: series,
        current: totalsFor(currency),
        scheduled: movements
          .filter((row) => row.currency === currency && row.effective_on > today())
          .sort((a, b) => a.effective_on.localeCompare(b.effective_on))
          .map(movementView),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/revenue/adjust",
    auth: true,
    capability: "revenue:write",
    sudo: true,
    handler: ({ body, headers }) => {
      const reason = String(body.reason ?? "").trim();
      if (!reason)
        return refuse(400, "malformed_request", { reason: "a written reason is required" });
      const company = companies.find((row) => row.id === String(body.company_id ?? ""));
      if (!company) return refuse(400, "malformed_request", { company_id: "no such company" });
      const cents = Math.round(Number(body.amount ?? 0) * 100);
      if (!cents) return refuse(400, "malformed_request", { amount: "non-zero" });
      const effective = String(body.effective_on ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(effective))
        return refuse(400, "malformed_request", { effective_on: "expected YYYY-MM-DD" });
      addMovement({
        contract_id: "",
        company_id: company.id,
        kind: "adjustment",
        cents,
        currency: String(body.currency ?? "USD").toUpperCase(),
        effective_on: effective,
        note: reason,
        staff_id: caller(headers)?.member.id ?? "",
      });
      audit("mrr.adjusted", caller(headers)?.member.id ?? null, "company", company.id, reason);
      return ok({ adjusted: true });
    },
  },
  {
    method: "GET",
    pattern: "hq/reports/weekly",
    auth: true,
    capability: "revenue:read",
    handler: ({ query }) => {
      const label = String(query.week ?? "");
      const nowDate = new Date();
      const isoWeekStart = (date: Date) => {
        const day = (date.getUTCDay() + 6) % 7;
        return new Date(
          Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate() - day),
        );
      };
      const labelOf = (monday: Date) => {
        const thursday = new Date(monday.getTime() + 3 * 86_400_000);
        const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
        const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
        return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
      };
      let monday = isoWeekStart(nowDate);
      if (label) {
        const match = /^(\d{4})-W(\d{2})$/.exec(label);
        if (!match) return refuse(400, "malformed_request", { week: "expected YYYY-Www" });
        const jan4 = new Date(Date.UTC(Number(match[1]), 0, 4));
        monday = new Date(isoWeekStart(jan4).getTime() + (Number(match[2]) - 1) * 7 * 86_400_000);
        if (monday > nowDate)
          return refuse(400, "malformed_request", { week: "that week has not started" });
      }
      const start = monday.getTime();
      const end = start + 7 * 86_400_000;
      const within = (iso: string | null) =>
        Boolean(iso) && Date.parse(iso!) >= start && Date.parse(iso!) < end;
      const received = leads.filter((row) => within(row.created_at));
      const waits = received
        .filter((row) => row.first_replied_at)
        .map((row) => (Date.parse(row.first_replied_at!) - Date.parse(row.created_at)) / 60_000)
        .sort((a, b) => a - b);
      const median = waits.length
        ? Math.round(
            waits.length % 2
              ? waits[(waits.length - 1) / 2]!
              : (waits[waits.length / 2 - 1]! + waits[waits.length / 2]!) / 2,
          )
        : null;
      const bySource = new Map<string, number>();
      for (const row of received)
        bySource.set(row.source_key, (bySource.get(row.source_key) ?? 0) + 1);
      const weekMeetings = meetings.filter((row) => within(row.starts_at));
      const openDeals = deals.filter((row) => row.status === "open");
      const pipelineStages = stages
        .filter((stage) => !stage.outcome && !stage.archived)
        .sort((a, b) => a.position - b.position)
        .map((stage) => {
          const inStage = openDeals.filter((row) => row.stage_key === stage.key);
          return {
            key: stage.key,
            label: stage.label,
            count: inStage.length,
            mrr: moneyByCurrency(inStage, (row) => row.mrr_amount) ?? {},
            weighted:
              moneyByCurrency(inStage, (row) => (row.mrr_amount * stage.win_probability) / 100) ??
              {},
          };
        });
      const won = deals.filter((row) => row.status === "won" && within(row.closed_at));
      const lost = deals.filter((row) => row.status === "lost" && within(row.closed_at));
      const reasons = (rows: DealRow[]) => {
        const counts = new Map<string, number>();
        for (const row of rows)
          counts.set(
            row.loss_reason || "unrecorded",
            (counts.get(row.loss_reason || "unrecorded") ?? 0) + 1,
          );
        return [...counts.entries()].map(([reason, count]) => ({ reason, count }));
      };
      const todayIso = today();
      const slipped = openDeals
        .filter((row) => row.expected_close_date && row.expected_close_date < todayIso)
        .map((row) => ({
          deal_id: row.id,
          name: row.name,
          company_name: companies.find((company) => company.id === row.company_id)?.name ?? "",
          expected_close_date: row.expected_close_date,
          days_late: Math.round(
            (Date.parse(todayIso) - Date.parse(row.expected_close_date)) / 86_400_000,
          ),
        }));
      const horizon = dayOffset(30);
      const inHorizon = openDeals.filter(
        (row) =>
          row.expected_close_date &&
          row.expected_close_date >= todayIso &&
          row.expected_close_date <= horizon,
      );
      const weekEnd = new Date(Math.min(end - 86_400_000, Date.now())).toISOString().slice(0, 10);
      const mondayIso = new Date(start).toISOString().slice(0, 10);
      const byKind: Record<string, number> = {};
      for (const row of movements)
        if (row.currency === "USD" && row.effective_on >= mondayIso && row.effective_on <= weekEnd)
          byKind[row.kind] = money((byKind[row.kind] ?? 0) * 100 + row.cents);
      const nextMonday = new Date(end);
      return ok({
        week: {
          label: labelOf(monday),
          starts_on: mondayIso,
          ends_on: new Date(end - 86_400_000).toISOString().slice(0, 10),
          previous: labelOf(new Date(start - 7 * 86_400_000)),
          next: nextMonday <= nowDate ? labelOf(nextMonday) : null,
          in_progress: nowDate.getTime() < end,
        },
        leads: {
          received: received.length,
          by_source: [...bySource.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([source_key, count]) => ({ source_key, count })),
          answered: waits.length,
          median_first_reply_minutes: median,
          answered_within_target: waits.filter((wait) => wait <= 60).length,
          first_reply_target_minutes: 60,
          qualified: activities.filter(
            (row) =>
              within(row.at) &&
              row.lead_id &&
              row.kind === "system" &&
              row.body.includes("Qualified"),
          ).length,
        },
        meetings: {
          demos_held: weekMeetings.filter(
            (row) => row.kind === "demo" && row.status === "completed",
          ).length,
          demo_no_shows: weekMeetings.filter(
            (row) => row.kind === "demo" && row.status === "no_show",
          ).length,
          held: weekMeetings.filter((row) => row.status === "completed").length,
          no_shows: weekMeetings.filter((row) => row.status === "no_show").length,
          outcomes_missing: weekMeetings.filter(
            (row) => row.status === "scheduled" && Date.parse(row.starts_at) < Date.now(),
          ).length,
        },
        deals: {
          created: deals.filter((row) => within(row.created_at)).length,
          stage_moves: dealStageEvents.filter((event) => event.from_stage_key && within(event.at))
            .length,
          won: { count: won.length, mrr: moneyByCurrency(won, (row) => row.mrr_amount) ?? {} },
          lost: { count: lost.length, reasons: reasons(lost) },
        },
        pipeline: {
          stages: pipelineStages,
          open_count: openDeals.length,
          open_mrr: moneyByCurrency(openDeals, (row) => row.mrr_amount) ?? {},
          weighted:
            moneyByCurrency(
              openDeals,
              (row) => (row.mrr_amount * (stageOf(row.stage_key)?.win_probability ?? 0)) / 100,
            ) ?? {},
        },
        forecast: {
          horizon_days: 30,
          commit_mrr:
            moneyByCurrency(
              inHorizon.filter((row) => (stageOf(row.stage_key)?.win_probability ?? 0) >= 60),
              (row) => row.mrr_amount,
            ) ?? {},
          best_case_mrr: moneyByCurrency(inHorizon, (row) => row.mrr_amount) ?? {},
          slipped,
          slipped_count: slipped.length,
        },
        revenue: {
          currency: "USD",
          mrr_at_start: money(
            mrrCents("USD", new Date(start - 86_400_000).toISOString().slice(0, 10)),
          ),
          mrr_at_end: money(mrrCents("USD", weekEnd)),
          movements: byKind,
        },
        losses_last_90_days: reasons(
          deals.filter(
            (row) =>
              row.status === "lost" &&
              row.closed_at &&
              Date.now() - Date.parse(row.closed_at) <= 90 * 86_400_000,
          ),
        ),
        desk: (() => {
          const staffPublic = (row: TicketRow) =>
            row.messages.filter(
              (message) => message.author === "staff" && message.visibility === "public",
            );
          const opened = tickets.filter((row) => within(row.created_at));
          const waits = opened
            .filter((row) => row.first_replied_at)
            .map((row) => (Date.parse(row.first_replied_at!) - Date.parse(row.created_at)) / 60_000)
            .sort((a, b) => a - b);
          const resolved = tickets.filter(
            (row) => row.status === "resolved" && within(row.resolved_at),
          );
          return {
            opened: opened.length,
            answered: waits.length,
            median_first_reply_minutes:
              waits.length === 0
                ? null
                : Math.round(
                    waits.length % 2
                      ? waits[(waits.length - 1) / 2]!
                      : (waits[waits.length / 2 - 1]! + waits[waits.length / 2]!) / 2,
                  ),
            replies_sent: tickets.reduce(
              (sum, row) => sum + staffPublic(row).filter((message) => within(message.at)).length,
              0,
            ),
            resolved: resolved.length,
            resolved_on_first_reply: resolved.filter((row) => staffPublic(row).length === 1).length,
            resolved_after_reopen: resolved.filter((row) => row.reopened_count > 0).length,
            open_now: tickets.filter((row) => row.status === "open" || row.status === "pending")
              .length,
          };
        })(),
        generated_at: now(),
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/reports/funnel",
    auth: true,
    capability: "deals:read",
    handler: ({ query }) => {
      const days = query.days === undefined ? 90 : Number(query.days);
      if (!Number.isInteger(days) || days < 1 || days > 366)
        return refuse(400, "malformed_request", { days: "1 to 366" });
      const start = Date.now() - days * 86_400_000;
      const ordered = stages.filter((row) => !row.archived).sort((a, b) => a.position - b.position);
      const order = new Map(ordered.map((row, index) => [row.key, index]));
      const outcome = new Map(ordered.map((row) => [row.key, row.outcome]));
      const byDeal = new Map<string, typeof dealStageEvents>();
      for (const event of dealStageEvents)
        byDeal.set(
          event.deal_id,
          [...(byDeal.get(event.deal_id) ?? []), event].sort((a, b) => a.at.localeCompare(b.at)),
        );
      const inWindow = dealStageEvents.filter((event) => Date.parse(event.at) >= start);
      const buckets = new Map(
        ordered
          .filter((row) => !row.outcome)
          .map((row) => [
            row.key,
            {
              key: row.key,
              label: row.label,
              entered: 0,
              advanced: 0,
              won: 0,
              lost: 0,
              still: 0,
              durations: [] as number[],
            },
          ]),
      );
      const dealsMoved = new Set<string>();
      for (const event of inWindow) {
        const bucket = buckets.get(event.to_stage_key);
        if (!bucket) continue;
        dealsMoved.add(event.deal_id);
        bucket.entered += 1;
        const left = (byDeal.get(event.deal_id) ?? []).find(
          (later) => later.at > event.at && later.from_stage_key === event.to_stage_key,
        );
        if (!left) {
          bucket.still += 1;
          continue;
        }
        bucket.durations.push((Date.parse(left.at) - Date.parse(event.at)) / 86_400_000);
        const next = outcome.get(left.to_stage_key);
        if (next === "won") bucket.won += 1;
        else if (next === "lost" || next === "unqualified") bucket.lost += 1;
        else if ((order.get(left.to_stage_key) ?? -1) > (order.get(event.to_stage_key) ?? -1))
          bucket.advanced += 1;
      }
      const median = (values: number[]) => {
        if (!values.length) return null;
        const sorted = [...values].sort((a, b) => a - b);
        const mid = Math.floor(sorted.length / 2);
        return (
          Math.round(
            (sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2) * 10,
          ) / 10
        );
      };
      const funnel = [...buckets.values()].map((bucket) => {
        const left = bucket.advanced + bucket.won + bucket.lost;
        return {
          key: bucket.key,
          label: bucket.label,
          entered: bucket.entered,
          advanced: bucket.advanced,
          won_from_here: bucket.won,
          lost_from_here: bucket.lost,
          still_here: bucket.still,
          conversion: left
            ? Math.round(((bucket.advanced + bucket.won) / left) * 1000) / 1000
            : null,
          median_days: median(bucket.durations),
        };
      });
      const won = inWindow.filter((event) => outcome.get(event.to_stage_key) === "won").length;
      const lost = inWindow.filter((event) => outcome.get(event.to_stage_key) === "lost").length;
      return ok({
        days,
        since: new Date(start).toISOString().slice(0, 10),
        deals_moved: dealsMoved.size,
        stages: funnel,
        closed: {
          won,
          lost,
          win_rate: won + lost ? Math.round((won / (won + lost)) * 1000) / 1000 : null,
        },
        generated_at: now(),
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/reports/pipeline-history",
    auth: true,
    capability: "deals:read",
    handler: ({ query }) => {
      const days = query.days === undefined ? 90 : Number(query.days);
      if (!Number.isInteger(days) || days < 1 || days > 366)
        return refuse(400, "malformed_request", { days: "1 to 366" });
      // The mock has no nightly job: each day's point is what the board would have said
      // on the day, from when deals were created and closed, at today's probabilities.
      const probability = new Map(stages.map((row) => [row.key, row.win_probability]));
      const labels = new Map(
        stages.map((row) => [row.key, { label: row.label, position: row.position }]),
      );
      const points = [];
      for (let back = days; back >= 0; back -= 1) {
        const day = dayOffset(-back);
        const dayEnd = `${day}T23:59:59Z`;
        const open = deals.filter(
          (deal) =>
            deal.created_at <= dayEnd &&
            (deal.status === "open" || !deal.closed_at || deal.closed_at > dayEnd),
        );
        const byStage = new Map<
          string,
          {
            key: string;
            label: string;
            position: number;
            count: number;
            mrr_cents: number;
            weighted_cents: number;
          }
        >();
        let mrr = 0;
        let weighted = 0;
        for (const deal of open) {
          const cents = Math.round(deal.mrr_amount * 100);
          const weight = Math.round((cents * (probability.get(deal.stage_key) ?? 0)) / 100);
          mrr += cents;
          weighted += weight;
          const bucket = byStage.get(deal.stage_key) ?? {
            key: deal.stage_key,
            label: labels.get(deal.stage_key)?.label ?? deal.stage_key,
            position: labels.get(deal.stage_key)?.position ?? 0,
            count: 0,
            mrr_cents: 0,
            weighted_cents: 0,
          };
          bucket.count += 1;
          bucket.mrr_cents += cents;
          bucket.weighted_cents += weight;
          byStage.set(deal.stage_key, bucket);
        }
        points.push({
          day,
          open_count: open.length,
          open_mrr_cents: mrr,
          weighted_cents: weighted,
          by_stage: [...byStage.values()].sort((a, b) => a.position - b.position),
        });
      }
      return ok({ days, currency: "USD", points });
    },
  },
  {
    method: "POST",
    pattern: "hq/exports/{kind}",
    auth: true,
    capability: "crm:export",
    sudo: true,
    handler: ({ params, body, headers }) => {
      const reason = String(body.reason ?? "").trim();
      if (reason.length < 8)
        return refuse(400, "malformed_request", { reason: "say what the export is for" });
      const tables: Record<string, [string[], unknown[][]]> = {
        companies: [
          ["id", "name", "domain", "lifecycle"],
          companies.map((row) => [row.id, row.name, row.domain, row.lifecycle]),
        ],
        people: [
          ["id", "full_name", "email", "title"],
          people.map((row) => [row.id, row.full_name, row.email, row.title]),
        ],
        leads: [
          ["id", "received_at", "source", "full_name", "email", "stage"],
          leads.map((row) => [
            row.id,
            row.created_at,
            row.source_key,
            row.full_name,
            row.email,
            row.stage,
          ]),
        ],
        deals: [
          ["id", "name", "stage", "status", "mrr"],
          deals.map((row) => [row.id, row.name, row.stage_key, row.status, row.mrr_amount]),
        ],
        contracts: [
          ["id", "plan", "mrr", "currency", "status"],
          contracts.map((row) => [
            row.id,
            row.plan_name,
            money(row.mrr_cents),
            row.currency,
            row.status,
          ]),
        ],
      };
      const table = tables[String(params.kind)];
      if (!table) return refuse(404, "not_found");
      const [header, rows] = table;
      const csv =
        [header.join(","), ...rows.map((row) => row.map(csvCell).join(","))].join("\r\n") + "\r\n";
      audit(
        "export.created",
        caller(headers)?.member.id ?? null,
        "export",
        String(params.kind),
        reason,
      );
      return ok({ filename: `hq-${params.kind}-mock.csv`, rows: rows.length, csv });
    },
  },
);

// =====================================================================================
// The team, mirroring hq/team*, hq/checkins*, hq/time-off*, hq/certificates*,
// hq/access-reviews* and public/certificates: documents before access, a 24-hour
// offboarding clock, check-ins that are yours, serials with a check code.
// =====================================================================================

const INTERN_STAFF = "aa000000-0000-4000-8000-00000000000e";
const SUPPORT_STAFF = "aa000000-0000-4000-8000-00000000000d";
const CHECKLIST_TEMPLATES: Record<string, string[]> = {
  onboarding: [
    "NDA signed and recorded",
    "IP assignment signed and recorded",
    "HQ invite accepted and authenticator enrolled",
    "System access granted and entered in the register",
    "Introduced to the team and to their first week's goals",
    "Check-in rhythm explained",
  ],
  offboarding: [
    "Access removed from every system in the register",
    "HQ access deactivated",
    "Devices and materials returned",
    "Handover notes written",
    "Exit conversation held",
    "Certificate issued (interns)",
  ],
};

type DocumentRow = {
  id: string;
  staff_id: string;
  kind: string;
  title: string;
  status: string;
  signed_on: string | null;
  reference: string;
  updated_at: string;
};
type AccessRow = {
  id: string;
  staff_id: string;
  system: string;
  level: string;
  granted_on: string;
  expires_on: string | null;
  revoked_on: string | null;
  notes: string;
};
type RunRow = {
  id: string;
  staff_id: string;
  kind: string;
  started_at: string;
  due_at: string | null;
  completed_at: string | null;
};
type StepRow = {
  run_id: string;
  position: number;
  title: string;
  done_at: string | null;
  note: string;
};
type CheckinRow = {
  staff_id: string;
  week: string;
  wins: string;
  priorities: string;
  blockers: string;
  mood: number;
  submitted_at: string;
};
type LeaveRow = {
  id: string;
  staff_id: string;
  kind: string;
  starts_on: string;
  ends_on: string;
  note: string;
  status: string;
  decided_at: string | null;
};
type CertificateRow = {
  serial: string;
  staff_id: string;
  recipient_name: string;
  title: string;
  starts_on: string;
  ends_on: string;
  summary: string;
  issued_on: string;
  revoked_at: string | null;
  revoke_reason: string;
};
type ReviewRow = { id: string; quarter: string; started_at: string; completed_at: string | null };
type ReviewItemRow = {
  review_id: string;
  access_id: string;
  decision: string;
  evidence: string;
  decided_at: string | null;
};

const staffDocuments: DocumentRow[] = [];
const systemAccess: AccessRow[] = [];
const checklistRuns: RunRow[] = [];
const checklistSteps: StepRow[] = [];
const checkins: CheckinRow[] = [];
const leave: LeaveRow[] = [];
const certificates: CertificateRow[] = [];
const reviews: ReviewRow[] = [];
const reviewItems: ReviewItemRow[] = [];

type AssetRow = {
  id: string;
  staff_id: string;
  kind: string;
  label: string;
  serial: string;
  issued_on: string;
  returned_on: string | null;
  notes: string;
};
type PolicyRow = { key: string; title: string; version: number; url: string };
type AckRow = { staff_id: string; policy_key: string; version: number; acknowledged_at: string };
type TrainingRow = {
  id: string;
  staff_id: string;
  title: string;
  provider: string;
  completed_on: string;
  expires_on: string | null;
  reference: string;
};
type OneOnOneRow = {
  id: string;
  staff_id: string;
  held_by: string;
  held_on: string;
  notes: string;
};
type ActionRow = {
  id: string;
  one_on_one_id: string;
  staff_id: string;
  title: string;
  due_on: string | null;
  done_at: string | null;
  created_at: string;
};

const ASSET_KINDS = ["laptop", "phone", "monitor", "badge", "key", "token", "other"];
const REMINDER_HORIZON_DAYS = 60;
const assets: AssetRow[] = [];
const policies: PolicyRow[] = [];
const policyAcks: AckRow[] = [];
const training: TrainingRow[] = [];
const oneOnOnes: OneOnOneRow[] = [];
const oneOnOneActions: ActionRow[] = [];

function seedPeopleOps() {
  for (const list of [assets, policies, policyAcks, training, oneOnOnes, oneOnOneActions])
    list.length = 0;
  policies.push(
    { key: "acceptable_use", title: "Acceptable use of systems", version: 1, url: "" },
    { key: "data_handling", title: "Client data handling", version: 2, url: "" },
    { key: "security_basics", title: "Security basics", version: 1, url: "" },
  );
  // Everyone active has acknowledged the current versions, except the intern, who is
  // behind on data handling since it was re-published.
  for (const member of staff) {
    if (!member.is_active) continue;
    for (const policy of policies) {
      const behind = member.id === INTERN_STAFF && policy.key === "data_handling";
      policyAcks.push({
        staff_id: member.id,
        policy_key: policy.key,
        version: behind ? 1 : policy.version,
        acknowledged_at: agoIso(24 * 20),
      });
    }
  }
  assets.push(
    {
      id: "as000000-0000-4000-8000-000000000001",
      staff_id: INTERN_STAFF,
      kind: "laptop",
      label: "MacBook Air 13 (M4)",
      serial: "C02ZQ1X7",
      issued_on: dayOffset(-58),
      returned_on: null,
      notes: "",
    },
    {
      id: "as000000-0000-4000-8000-000000000002",
      staff_id: INTERN_STAFF,
      kind: "badge",
      label: "Office badge 0417",
      serial: "",
      issued_on: dayOffset(-58),
      returned_on: null,
      notes: "",
    },
    {
      id: "as000000-0000-4000-8000-000000000003",
      staff_id: SALES_STAFF,
      kind: "phone",
      label: "iPhone 15 (work line)",
      serial: "F2LXQ9",
      issued_on: dayOffset(-120),
      returned_on: null,
      notes: "Number kept on the sales line",
    },
  );
  training.push(
    {
      id: "tr000000-0000-4000-8000-000000000001",
      staff_id: INTERN_STAFF,
      title: "Client data handling induction",
      provider: "In-house",
      completed_on: dayOffset(-57),
      expires_on: dayOffset(308),
      reference: "",
    },
    {
      id: "tr000000-0000-4000-8000-000000000002",
      staff_id: SALES_STAFF,
      title: "Anti-money-laundering awareness",
      provider: "External (online)",
      completed_on: dayOffset(-330),
      expires_on: dayOffset(35),
      reference: "AML-2025-0912",
    },
  );
  oneOnOnes.push({
    id: "oo000000-0000-4000-8000-000000000001",
    staff_id: INTERN_STAFF,
    held_by: OWNER_STAFF,
    held_on: dayOffset(-6),
    notes:
      "Settling in well. Wants more time on the research side; agreed a sector note as a stretch piece.",
  });
  oneOnOneActions.push(
    {
      id: "oa000000-0000-4000-8000-000000000001",
      one_on_one_id: "oo000000-0000-4000-8000-000000000001",
      staff_id: INTERN_STAFF,
      title: "Draft the sector note on European asset managers",
      due_on: dayOffset(8),
      done_at: null,
      created_at: agoIso(24 * 6),
    },
    {
      id: "oa000000-0000-4000-8000-000000000002",
      one_on_one_id: "oo000000-0000-4000-8000-000000000001",
      staff_id: OWNER_STAFF,
      title: "Share the research reading list",
      due_on: dayOffset(-3),
      done_at: agoIso(24 * 4),
      created_at: agoIso(24 * 6),
    },
  );
  const intern = staff.find((member) => member.id === INTERN_STAFF);
  if (intern) {
    intern.manager_id = OWNER_STAFF;
    intern.probation_ends_on = dayOffset(12);
    intern.emergency_contact_name = "Rohan Mehta";
    intern.emergency_contact_phone = "+44 7700 900123";
    intern.emergency_contact_relation = "Parent";
  }
  const sales = staff.find((member) => member.id === SALES_STAFF);
  if (sales) sales.manager_id = OWNER_STAFF;
}

function assetView(row: AssetRow) {
  return { asset_id: row.id, ...row, out: row.returned_on === null };
}

function trainingView(row: TrainingRow) {
  const todayIso = today();
  const horizon = dayOffset(REMINDER_HORIZON_DAYS);
  return {
    training_id: row.id,
    title: row.title,
    provider: row.provider,
    completed_on: row.completed_on,
    expires_on: row.expires_on,
    reference: row.reference,
    expired: Boolean(row.expires_on && row.expires_on < todayIso),
    expiring_soon: Boolean(
      row.expires_on && row.expires_on >= todayIso && row.expires_on <= horizon,
    ),
  };
}

function policyStates(staffId: string) {
  return policies
    .slice()
    .sort((a, b) => a.title.toLowerCase().localeCompare(b.title.toLowerCase()))
    .map((policy) => {
      const mine = policyAcks.filter(
        (row) => row.staff_id === staffId && row.policy_key === policy.key,
      );
      const best = Math.max(0, ...mine.map((row) => row.version));
      const when = mine.find((row) => row.version === best)?.acknowledged_at ?? null;
      return {
        key: policy.key,
        title: policy.title,
        version: policy.version,
        url: policy.url,
        acknowledged_version: best || null,
        acknowledged_at: best ? when : null,
        outstanding: best < policy.version,
      };
    });
}

const daysBetween = (fromIso: string, toIso: string) =>
  Math.round((Date.parse(toIso) - Date.parse(fromIso)) / 86_400_000);

function remindersFor(member: Staff) {
  const todayIso = today();
  const horizon = dayOffset(REMINDER_HORIZON_DAYS);
  const out: { kind: string; on: string; days: number; label: string }[] = [];
  if (member.probation_ends_on && member.probation_ends_on <= horizon)
    out.push({
      kind: "probation_end",
      on: member.probation_ends_on,
      days: daysBetween(todayIso, member.probation_ends_on),
      label: "Probation ends",
    });
  if (member.ends_on && member.ends_on <= horizon && member.is_active)
    out.push({
      kind: "engagement_end",
      on: member.ends_on,
      days: daysBetween(todayIso, member.ends_on),
      label: "Engagement ends",
    });
  for (const row of training.filter((candidate) => candidate.staff_id === member.id)) {
    if (row.expires_on && row.expires_on <= horizon)
      out.push({
        kind: "training_expiry",
        on: row.expires_on,
        days: daysBetween(todayIso, row.expires_on),
        label: `${row.title} expires`,
      });
  }
  return out.sort((a, b) => a.on.localeCompare(b.on));
}

function unreturnedFor(staffId: string) {
  return assets.filter((row) => row.staff_id === staffId && row.returned_on === null).length;
}

function mayWriteOneOnOne(callerId: string, role: string, subject: Staff) {
  return (CAPABILITIES[role] ?? []).includes("hr:write") || subject.manager_id === callerId;
}

/** This quarter's review, started two days ago with one grant already kept. */
function seedOpenReview() {
  reviews.length = 0;
  reviewItems.length = 0;
  // Not quarterOf: that arrow is declared further down and this runs at module load.
  const started = new Date();
  const review: ReviewRow = {
    id: "ar000000-0000-4000-8000-000000000001",
    quarter: `${started.getUTCFullYear()}-Q${Math.floor(started.getUTCMonth() / 3) + 1}`,
    started_at: agoIso(48),
    completed_at: null,
  };
  reviews.push(review);
  for (const row of systemAccess.filter((candidate) => accessView(candidate).live)) {
    const kept = row.system === "Mail";
    reviewItems.push({
      review_id: review.id,
      access_id: row.id,
      decision: kept ? "keep" : "pending",
      evidence: kept ? "Works the shared inbox every day" : "",
      decided_at: kept ? agoIso(40) : null,
    });
  }
}

function isoWeek(date: Date): string {
  const monday = new Date(
    Date.UTC(
      date.getUTCFullYear(),
      date.getUTCMonth(),
      date.getUTCDate() - ((date.getUTCDay() + 6) % 7),
    ),
  );
  const thursday = new Date(monday.getTime() + 3 * 86_400_000);
  const yearStart = new Date(Date.UTC(thursday.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7);
  return `${thursday.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function seedTeam() {
  for (const list of [
    staffDocuments,
    systemAccess,
    checklistRuns,
    checklistSteps,
    checkins,
    leave,
    certificates,
    reviews,
    reviewItems,
  ])
    list.length = 0;
  staffDocuments.push(
    {
      id: "dd000000-0000-4000-8000-000000000001",
      staff_id: INTERN_STAFF,
      kind: "nda",
      title: "Mutual NDA",
      status: "signed",
      signed_on: dayOffset(-60),
      reference: "Signed copy in the HR drive, /Interns/2026",
      updated_at: agoIso(24 * 60),
    },
    {
      id: "dd000000-0000-4000-8000-000000000002",
      staff_id: INTERN_STAFF,
      kind: "ip_assignment",
      title: "IP assignment",
      status: "signed",
      signed_on: dayOffset(-60),
      reference: "Signed copy in the HR drive, /Interns/2026",
      updated_at: agoIso(24 * 60),
    },
    {
      id: "dd000000-0000-4000-8000-000000000003",
      staff_id: SALES_STAFF,
      kind: "nda",
      title: "NDA",
      status: "signed",
      signed_on: dayOffset(-120),
      reference: "Employment contract, schedule 2",
      updated_at: agoIso(24 * 120),
    },
    {
      id: "dd000000-0000-4000-8000-000000000004",
      staff_id: SUPPORT_STAFF,
      kind: "nda",
      title: "NDA",
      status: "requested",
      signed_on: null,
      reference: "",
      updated_at: agoIso(24 * 3),
    },
  );
  systemAccess.push(
    {
      id: "ac000000-0000-4000-8000-000000000001",
      staff_id: INTERN_STAFF,
      system: "Source control",
      level: "Read",
      granted_on: dayOffset(-58),
      expires_on: "2026-12-20",
      revoked_on: null,
      notes: "",
    },
    {
      id: "ac000000-0000-4000-8000-000000000002",
      staff_id: INTERN_STAFF,
      system: "Research data room",
      level: "Member",
      granted_on: dayOffset(-58),
      expires_on: dayOffset(9),
      revoked_on: null,
      notes: "Project-scoped; shared team login until the vendor adds seats",
    },
    {
      id: "ac000000-0000-4000-8000-000000000005",
      staff_id: SALES_STAFF,
      system: "Bank portal",
      level: "Viewer",
      granted_on: dayOffset(-40),
      expires_on: null,
      revoked_on: null,
      notes: "To read incoming payments against invoices",
    },
    {
      id: "ac000000-0000-4000-8000-000000000003",
      staff_id: SALES_STAFF,
      system: "Mail",
      level: "Member",
      granted_on: dayOffset(-118),
      expires_on: null,
      revoked_on: null,
      notes: "",
    },
    {
      id: "ac000000-0000-4000-8000-000000000004",
      staff_id: SALES_STAFF,
      system: "Billing",
      level: "Viewer",
      granted_on: dayOffset(-100),
      expires_on: null,
      revoked_on: null,
      notes: "",
    },
  );
  const runId = "cr000000-0000-4000-8000-000000000001";
  checklistRuns.push({
    id: runId,
    staff_id: INTERN_STAFF,
    kind: "onboarding",
    started_at: agoIso(24 * 60),
    due_at: null,
    completed_at: null,
  });
  CHECKLIST_TEMPLATES.onboarding!.forEach((title, index) =>
    checklistSteps.push({
      run_id: runId,
      position: index + 1,
      title,
      done_at: index < 4 ? agoIso(24 * (58 - index)) : null,
      note: "",
    }),
  );
  const thisWeek = isoWeek(new Date());
  const lastWeek = isoWeek(new Date(Date.now() - 7 * 86_400_000));
  checkins.push(
    {
      staff_id: INTERN_STAFF,
      week: thisWeek,
      wins: "Earnings-quality screener reviewed with the desk.",
      priorities: "Write up the three false positives.",
      blockers: "",
      mood: 4,
      submitted_at: agoIso(20),
    },
    {
      staff_id: SALES_STAFF,
      week: lastWeek,
      wins: "Northwall pilot extended to a second desk.",
      priorities: "Proposal to Holloway.",
      blockers: "Need a pricing sheet for three seats.",
      mood: 3,
      submitted_at: agoIso(24 * 6),
    },
  );
  leave.push(
    {
      id: "lv000000-0000-4000-8000-000000000001",
      staff_id: SALES_STAFF,
      kind: "vacation",
      starts_on: dayOffset(12),
      ends_on: dayOffset(16),
      note: "Family wedding",
      status: "requested",
      decided_at: null,
    },
    {
      id: "lv000000-0000-4000-8000-000000000002",
      staff_id: INTERN_STAFF,
      kind: "personal",
      starts_on: dayOffset(-1),
      ends_on: dayOffset(0),
      note: "Exam",
      status: "approved",
      decided_at: agoIso(24 * 5),
    },
  );
  certificates.push({
    serial: "QT-2026-0001-7KD2QX",
    staff_id: "",
    recipient_name: "Arjun Mehta",
    title: "Quantitative Research Intern",
    starts_on: "2026-05-04",
    ends_on: "2026-08-14",
    summary: "Built the factor-attribution notebook the desk now uses weekly.",
    issued_on: "2026-08-15",
    revoked_at: null,
    revoke_reason: "",
  });
}
seedTeam();
seedOpenReview();
seedPeopleOps();
seedViews();

function accessView(row: AccessRow) {
  const todayIso = today();
  const live = !row.revoked_on && (!row.expires_on || row.expires_on >= todayIso);
  return {
    access_id: row.id,
    staff_id: row.staff_id,
    system: row.system,
    level: row.level,
    granted_on: row.granted_on,
    expires_on: row.expires_on,
    revoked_on: row.revoked_on,
    notes: row.notes,
    live,
    expiring_soon:
      live &&
      Boolean(row.expires_on) &&
      Date.parse(row.expires_on!) - Date.parse(todayIso) <= 14 * 86_400_000,
  };
}

function documentsState(staffId: string) {
  const rank: Record<string, number> = { missing: 0, requested: 1, waived: 2, signed: 3 };
  const state: Record<string, string> = { nda: "missing", ip_assignment: "missing" };
  for (const row of staffDocuments)
    if (
      row.staff_id === staffId &&
      row.kind in state &&
      rank[row.status]! > rank[state[row.kind]!]!
    )
      state[row.kind] = row.status;
  return state as { nda: string; ip_assignment: string };
}

function runView(run: RunRow) {
  const steps = checklistSteps
    .filter((step) => step.run_id === run.id)
    .sort((a, b) => a.position - b.position);
  return {
    run_id: run.id,
    staff_id: run.staff_id,
    kind: run.kind,
    started_at: run.started_at,
    due_at: run.due_at,
    completed_at: run.completed_at,
    done: steps.filter((step) => step.done_at).length,
    total: steps.length,
    overdue: !run.completed_at && Boolean(run.due_at) && Date.parse(run.due_at!) < Date.now(),
    blocked_by_assets:
      run.kind === "offboarding" && !run.completed_at ? unreturnedFor(run.staff_id) : 0,
    steps: steps.map((step) => ({
      position: step.position,
      title: step.title,
      done_at: step.done_at,
      note: step.note,
    })),
  };
}

function leaveView(row: LeaveRow) {
  return {
    request_id: row.id,
    staff_id: row.staff_id,
    staff_name: staff.find((member) => member.id === row.staff_id)?.display_name ?? "",
    kind: row.kind,
    starts_on: row.starts_on,
    ends_on: row.ends_on,
    days: Math.round((Date.parse(row.ends_on) - Date.parse(row.starts_on)) / 86_400_000) + 1,
    note: row.note,
    status: row.status,
    decided_at: row.decided_at,
  };
}

function certificateView(row: CertificateRow) {
  return { ...row, revoked: Boolean(row.revoked_at) };
}

const quarterOf = (date: Date) =>
  `${date.getUTCFullYear()}-Q${Math.floor(date.getUTCMonth() / 3) + 1}`;

function reviewView(review: ReviewRow, withItems: boolean) {
  const items = reviewItems.filter((item) => item.review_id === review.id);
  const view: Record<string, unknown> = {
    review_id: review.id,
    quarter: review.quarter,
    started_at: review.started_at,
    completed_at: review.completed_at,
    total: items.length,
    decided: items.filter((item) => item.decision !== "pending").length,
    revoked: items.filter((item) => item.decision === "revoke").length,
  };
  if (withItems) {
    const { flags, findings } = reviewFindings(items);
    view.items = items.map((item) => {
      const access = systemAccess.find((row) => row.id === item.access_id)!;
      return {
        access_id: item.access_id,
        decision: item.decision,
        evidence: item.evidence,
        decided_at: item.decided_at,
        access: accessView(access),
        staff_name: staff.find((member) => member.id === access.staff_id)?.display_name ?? "",
        flags: flags.get(item.access_id) ?? [],
      };
    });
    view.findings = findings;
  }
  return view;
}

/** As the service's team_routes.review_findings: orphans, shared accounts, money SoD. */
const SOD_MONEY_OUT = ["bank", "banking", "treasury", "payments", "card"];
const SOD_MONEY_RECORDED = [
  "accounting",
  "bookkeeping",
  "billing",
  "invoicing",
  "payroll",
  "ledger",
];
const sodSide = (system: string, words: string[]) =>
  words.some((word) => system.toLowerCase().includes(word));

function reviewFindings(items: ReviewItemRow[]) {
  const flags = new Map<string, string[]>();
  const findings: {
    kind: string;
    access_id: string;
    staff_name: string;
    system: string;
    detail: string;
  }[] = [];
  const liveByStaff = new Map<string, AccessRow[]>();
  for (const item of items) {
    const access = systemAccess.find((row) => row.id === item.access_id);
    if (!access || !accessView(access).live) continue;
    liveByStaff.set(access.staff_id, [...(liveByStaff.get(access.staff_id) ?? []), access]);
  }
  for (const item of items) {
    const access = systemAccess.find((row) => row.id === item.access_id);
    if (!access) continue;
    const holder = staff.find((member) => member.id === access.staff_id);
    const name = holder?.display_name ?? "";
    const own: string[] = [];
    const ended = Boolean(holder?.ends_on && holder.ends_on < today());
    if (!holder || !holder.is_active || ended) {
      own.push("orphan");
      findings.push({
        kind: "orphan",
        access_id: access.id,
        staff_name: name,
        system: access.system,
        detail: holder ? "the holder is no longer active" : "the holder is not on the staff list",
      });
    }
    if (`${access.system} ${access.level} ${access.notes}`.toLowerCase().includes("shared")) {
      own.push("shared");
      findings.push({
        kind: "shared",
        access_id: access.id,
        staff_name: name,
        system: access.system,
        detail: "a shared account cannot be attributed to one person",
      });
    }
    const out = sodSide(access.system, SOD_MONEY_OUT);
    const recorded = sodSide(access.system, SOD_MONEY_RECORDED);
    if (out || recorded) {
      const otherSide = out ? SOD_MONEY_RECORDED : SOD_MONEY_OUT;
      for (const other of liveByStaff.get(access.staff_id) ?? []) {
        if (other.id === access.id || !sodSide(other.system, otherSide)) continue;
        own.push(`conflict:${other.system}`);
        findings.push({
          kind: "conflict",
          access_id: access.id,
          staff_name: name,
          system: access.system,
          detail: `moves money and records it: also holds ${other.system}`,
        });
      }
    }
    if (own.length) flags.set(access.id, own);
  }
  findings.sort(
    (a, b) =>
      a.kind.localeCompare(b.kind) ||
      a.staff_name.toLowerCase().localeCompare(b.staff_name.toLowerCase()) ||
      a.system.toLowerCase().localeCompare(b.system.toLowerCase()),
  );
  return { flags, findings };
}

const hasCap = (headers: Record<string, string | string[] | undefined>, capability: string) =>
  (CAPABILITIES[caller(headers)?.member.role ?? ""] ?? []).includes(capability);

routes.push(
  {
    method: "GET",
    pattern: "hq/team",
    auth: true,
    capability: "hr:read",
    handler: () => {
      const thisWeek = isoWeek(new Date());
      const todayIso = today();
      const teamReminders = staff
        .filter((member) => member.is_active)
        .flatMap((member) =>
          remindersFor(member).map((item) => ({
            ...item,
            staff_id: member.id,
            display_name: member.display_name,
          })),
        )
        .sort((a, b) => a.on.localeCompare(b.on) || a.display_name.localeCompare(b.display_name));
      return ok({
        week: thisWeek,
        reminders: teamReminders,
        people: staff
          .map((member) => {
            const state = documentsState(member.id);
            const grants = systemAccess.filter((row) => row.staff_id === member.id).map(accessView);
            const weeks = checkins
              .filter((row) => row.staff_id === member.id)
              .map((row) => row.week)
              .sort()
              .reverse();
            return {
              staff_id: member.id,
              display_name: member.display_name,
              email: member.email,
              role: member.role,
              kind: member.kind,
              is_active: member.is_active,
              starts_on: member.starts_on ?? null,
              ends_on: member.ends_on,
              ends_in_days: member.ends_on
                ? Math.round((Date.parse(member.ends_on) - Date.parse(todayIso)) / 86_400_000)
                : null,
              documents: state,
              documents_ok:
                ["signed", "waived"].includes(state.nda) &&
                ["signed", "waived"].includes(state.ip_assignment),
              live_access: grants.filter((grant) => grant.live).length,
              access_expiring_soon: grants.filter((grant) => grant.expiring_soon).length,
              open_checklists: checklistRuns
                .filter((run) => run.staff_id === member.id && !run.completed_at)
                .map(runView)
                .map(({ run_id, kind, done, total, overdue, due_at }) => ({
                  run_id,
                  kind,
                  done,
                  total,
                  overdue,
                  due_at,
                })),
              checked_in_this_week: weeks.includes(thisWeek),
              last_checkin_week: weeks[0] ?? "",
              away_today: leave.some(
                (row) =>
                  row.staff_id === member.id &&
                  row.status === "approved" &&
                  row.starts_on <= todayIso &&
                  todayIso <= row.ends_on,
              ),
              manager_id: member.manager_id ?? "",
              manager_name:
                staff.find((candidate) => candidate.id === member.manager_id)?.display_name ?? "",
              unreturned_assets: unreturnedFor(member.id),
              policies_outstanding: member.is_active
                ? policyStates(member.id).filter((row) => row.outstanding).length
                : 0,
              reminders: member.is_active ? remindersFor(member) : [],
            };
          })
          .sort(
            (a, b) =>
              Number(b.is_active) - Number(a.is_active) ||
              a.display_name.localeCompare(b.display_name),
          ),
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/team/{staff_id}",
    auth: true,
    capability: "hr:read",
    handler: ({ params }) => {
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      const state = documentsState(member.id);
      return ok({
        person: {
          staff_id: member.id,
          display_name: member.display_name,
          email: member.email,
          personal_email: member.personal_email ?? "",
          role: member.role,
          kind: member.kind,
          is_active: member.is_active,
          starts_on: member.starts_on ?? null,
          ends_on: member.ends_on,
          manager_id: member.manager_id ?? "",
          manager_name:
            staff.find((candidate) => candidate.id === member.manager_id)?.display_name ?? "",
          probation_ends_on: member.probation_ends_on ?? null,
          emergency_contact: {
            name: member.emergency_contact_name ?? "",
            phone: member.emergency_contact_phone ?? "",
            relation: member.emergency_contact_relation ?? "",
          },
        },
        reports: staff
          .filter((candidate) => candidate.manager_id === member.id && candidate.is_active)
          .map((candidate) => ({ staff_id: candidate.id, display_name: candidate.display_name }))
          .sort((a, b) => a.display_name.localeCompare(b.display_name)),
        assets: assets
          .filter((row) => row.staff_id === member.id)
          .sort(
            (a, b) =>
              Number(a.returned_on !== null) - Number(b.returned_on !== null) ||
              a.issued_on.localeCompare(b.issued_on),
          )
          .map(assetView),
        training: training
          .filter((row) => row.staff_id === member.id)
          .sort((a, b) => b.completed_on.localeCompare(a.completed_on))
          .map(trainingView),
        one_on_ones: oneOnOnes
          .filter((row) => row.staff_id === member.id)
          .sort((a, b) => b.held_on.localeCompare(a.held_on))
          .slice(0, 12)
          .map((row) => ({
            one_on_one_id: row.id,
            held_on: row.held_on,
            held_by: row.held_by,
            held_by_name:
              staff.find((candidate) => candidate.id === row.held_by)?.display_name ?? "",
            notes: row.notes,
            actions: oneOnOneActions
              .filter((action) => action.one_on_one_id === row.id)
              .sort((a, b) => a.created_at.localeCompare(b.created_at))
              .map((action) => ({
                action_id: action.id,
                title: action.title,
                owner_id: action.staff_id,
                owner_name:
                  staff.find((candidate) => candidate.id === action.staff_id)?.display_name ?? "",
                due_on: action.due_on,
                done_at: action.done_at,
                overdue: !action.done_at && Boolean(action.due_on) && action.due_on! < today(),
              })),
          })),
        policies: policyStates(member.id),
        reminders: remindersFor(member),
        documents: staffDocuments
          .filter((row) => row.staff_id === member.id)
          .map((row) => ({
            document_id: row.id,
            kind: row.kind,
            title: row.title,
            status: row.status,
            signed_on: row.signed_on,
            reference: row.reference,
            updated_at: row.updated_at,
          })),
        documents_state: state,
        documents_ok:
          ["signed", "waived"].includes(state.nda) &&
          ["signed", "waived"].includes(state.ip_assignment),
        access: systemAccess
          .filter((row) => row.staff_id === member.id)
          .map(accessView)
          .sort((a, b) => Number(b.live) - Number(a.live) || a.system.localeCompare(b.system)),
        checklists: checklistRuns
          .filter((run) => run.staff_id === member.id)
          .map(runView)
          .sort((a, b) => b.started_at.localeCompare(a.started_at)),
        checkins: checkins
          .filter((row) => row.staff_id === member.id)
          .sort((a, b) => b.week.localeCompare(a.week))
          .slice(0, 8)
          .map(({ week, wins, priorities, blockers, mood, submitted_at }) => ({
            week,
            wins,
            priorities,
            blockers,
            mood,
            submitted_at,
          })),
        time_off: leave.filter((row) => row.staff_id === member.id).map(leaveView),
        certificates: certificates.filter((row) => row.staff_id === member.id).map(certificateView),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/team/{staff_id}/documents",
    auth: true,
    capability: "hr:write",
    sudo: true,
    handler: ({ params, body, headers }) => {
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      const status = String(body.status ?? "requested");
      if (!["requested", "signed", "waived"].includes(status))
        return refuse(400, "malformed_request", { status: "requested, signed or waived" });
      const signedOn = String(body.signed_on ?? "") || null;
      if (status === "signed" && !signedOn)
        return refuse(400, "malformed_request", { signed_on: "a signed document has a date" });
      const reference = String(body.reference ?? "").trim();
      if (status === "waived" && reference.length < 8)
        return refuse(400, "malformed_request", { reference: "a waiver says why" });
      const documentId = String(body.document_id ?? "");
      if (documentId) {
        const row = staffDocuments.find(
          (doc) => doc.id === documentId && doc.staff_id === member.id,
        );
        if (!row) return refuse(404, "not_found");
        Object.assign(row, { status, signed_on: signedOn, reference, updated_at: now() });
      } else {
        const kind = String(body.kind ?? "");
        if (
          !["nda", "ip_assignment", "offer_letter", "contractor_agreement", "other"].includes(kind)
        )
          return refuse(400, "malformed_request", { kind: "unknown document" });
        staffDocuments.push({
          id: randomUUID(),
          staff_id: member.id,
          kind,
          title: String(body.title ?? ""),
          status,
          signed_on: signedOn,
          reference,
          updated_at: now(),
        });
      }
      audit("team.document_recorded", caller(headers)?.member.id ?? null, "staff", member.id);
      return ok({
        document_id: documentId || staffDocuments[staffDocuments.length - 1]!.id,
        status,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/team/{staff_id}/access/grant",
    auth: true,
    capability: "hr:write",
    sudo: true,
    handler: ({ params, body, headers }) => {
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      const system = String(body.system ?? "").trim();
      if (!system) return refuse(400, "malformed_request", { system: "name the system" });
      const state = documentsState(member.id);
      const missing = Object.entries(state)
        .filter(([, value]) => !["signed", "waived"].includes(value))
        .map(([kind]) => kind);
      const override = String(body.override_reason ?? "").trim();
      if (missing.length && !override)
        return refuse(400, "malformed_request", { reason: "documents-missing", missing });
      const row: AccessRow = {
        id: randomUUID(),
        staff_id: member.id,
        system,
        level: String(body.level ?? ""),
        granted_on: String(body.granted_on ?? "") || today(),
        expires_on: String(body.expires_on ?? "") || null,
        revoked_on: null,
        notes: String(body.notes ?? ""),
      };
      systemAccess.push(row);
      audit(
        "team.access_granted",
        caller(headers)?.member.id ?? null,
        "staff",
        member.id,
        override,
      );
      return ok({ access_id: row.id });
    },
  },
  {
    method: "POST",
    pattern: "hq/team/{staff_id}/access/{access_id}/revoke",
    auth: true,
    capability: "hr:write",
    handler: ({ params, body, headers }) => {
      const row = systemAccess.find(
        (grant) => grant.id === params.access_id && grant.staff_id === params.staff_id,
      );
      if (!row) return refuse(404, "not_found");
      if (row.revoked_on) return refuse(400, "malformed_request", { status: "already revoked" });
      row.revoked_on = String(body.revoked_on ?? "") || today();
      audit(
        "team.access_revoked",
        caller(headers)?.member.id ?? null,
        "staff",
        row.staff_id,
        String(body.reason ?? ""),
      );
      return ok({ revoked: true });
    },
  },
  {
    method: "POST",
    pattern: "hq/team/{staff_id}/checklists/start",
    auth: true,
    capability: "hr:write",
    handler: ({ params, body, headers }) => {
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      const kind = String(body.kind ?? "");
      if (!(kind in CHECKLIST_TEMPLATES))
        return refuse(400, "malformed_request", { kind: "onboarding or offboarding" });
      if (
        checklistRuns.some(
          (run) => run.staff_id === member.id && run.kind === kind && !run.completed_at,
        )
      )
        return refuse(400, "malformed_request", { kind: `an ${kind} is already open` });
      const run: RunRow = {
        id: randomUUID(),
        staff_id: member.id,
        kind,
        started_at: now(),
        due_at: kind === "offboarding" ? new Date(Date.now() + 86_400_000).toISOString() : null,
        completed_at: null,
      };
      checklistRuns.push(run);
      CHECKLIST_TEMPLATES[kind]!.forEach((title, index) =>
        checklistSteps.push({
          run_id: run.id,
          position: index + 1,
          title,
          done_at: null,
          note: "",
        }),
      );
      audit(`team.${kind}_started`, caller(headers)?.member.id ?? null, "staff", member.id);
      return ok({ run_id: run.id });
    },
  },
  {
    method: "POST",
    pattern: "hq/checklists/{run_id}/steps/{position}",
    auth: true,
    capability: "hr:write",
    handler: ({ params, body, headers }) => {
      const run = checklistRuns.find((row) => row.id === params.run_id);
      const step = checklistSteps.find(
        (row) => row.run_id === params.run_id && row.position === Number(params.position),
      );
      if (!run || !step) return refuse(404, "not_found");
      if (
        body.done !== false &&
        run.kind === "offboarding" &&
        step.title.startsWith("Devices and materials returned")
      ) {
        const out = assets.filter(
          (row) => row.staff_id === run.staff_id && row.returned_on === null,
        );
        if (out.length)
          return refuse(400, "malformed_request", {
            reason: `${out.length} ${out.length === 1 ? "asset is" : "assets are"} not yet returned`,
            assets: out.map((row) => row.label),
          });
      }
      step.done_at = body.done === false ? null : now();
      const complete = checklistSteps
        .filter((row) => row.run_id === run.id)
        .every((row) => row.done_at);
      run.completed_at = complete ? now() : null;
      audit("team.checklist_step", caller(headers)?.member.id ?? null, "staff", run.staff_id);
      return ok({ complete });
    },
  },
  {
    method: "GET",
    pattern: "hq/checkins",
    auth: true,
    handler: ({ query, headers }) => {
      const found = caller(headers)!;
      const week = String(query.week ?? "") || isoWeek(new Date());
      const rows = checkins.filter((row) => row.week === week);
      const view = (row: CheckinRow) => ({
        staff_id: row.staff_id,
        week: row.week,
        wins: row.wins,
        priorities: row.priorities,
        blockers: row.blockers,
        mood: row.mood,
        submitted_at: row.submitted_at,
      });
      const payload: Record<string, unknown> = {
        week,
        this_week: isoWeek(new Date()),
        last_week: isoWeek(new Date(Date.now() - 7 * 86_400_000)),
        mine: rows.find((row) => row.staff_id === found.member.id)
          ? view(rows.find((row) => row.staff_id === found.member.id)!)
          : null,
      };
      if (hasCap(headers, "hr:read")) {
        payload.team = rows.map(view);
        payload.missing = staff
          .filter((member) => member.is_active && !rows.some((row) => row.staff_id === member.id))
          .map((member) => ({ staff_id: member.id, display_name: member.display_name }));
      }
      return ok(payload);
    },
  },
  {
    method: "POST",
    pattern: "hq/checkins/submit",
    auth: true,
    handler: ({ body, headers }) => {
      const found = caller(headers)!;
      const allowed = [isoWeek(new Date()), isoWeek(new Date(Date.now() - 7 * 86_400_000))];
      const week = String(body.week ?? "") || allowed[0]!;
      if (!allowed.includes(week))
        return refuse(400, "malformed_request", { week: "this week or last" });
      const mood = Number(body.mood);
      if (!(mood >= 1 && mood <= 5)) return refuse(400, "malformed_request", { mood: "1 to 5" });
      const wins = String(body.wins ?? "").trim();
      const priorities = String(body.priorities ?? "").trim();
      if (!wins && !priorities)
        return refuse(400, "malformed_request", { reason: "say what went well or what is next" });
      const existing = checkins.findIndex(
        (row) => row.staff_id === found.member.id && row.week === week,
      );
      const row: CheckinRow = {
        staff_id: found.member.id,
        week,
        wins,
        priorities,
        blockers: String(body.blockers ?? "").trim(),
        mood,
        submitted_at: now(),
      };
      if (existing >= 0) checkins[existing] = row;
      else checkins.push(row);
      audit("team.checkin_submitted", found.member.id, "staff", found.member.id);
      return ok({ week });
    },
  },
  {
    method: "GET",
    pattern: "hq/time-off",
    auth: true,
    handler: ({ headers }) => {
      const found = caller(headers)!;
      const sorted = [...leave].sort((a, b) => a.starts_on.localeCompare(b.starts_on));
      const payload: Record<string, unknown> = {
        mine: sorted.filter((row) => row.staff_id === found.member.id).map(leaveView),
        kinds: ["vacation", "sick", "personal", "other"],
      };
      if (hasCap(headers, "hr:read")) {
        payload.pending = sorted.filter((row) => row.status === "requested").map(leaveView);
        payload.upcoming = sorted
          .filter((row) => row.status === "approved" && row.ends_on >= today())
          .map(leaveView);
      }
      return ok(payload);
    },
  },
  {
    method: "POST",
    pattern: "hq/time-off/request",
    auth: true,
    handler: ({ body, headers }) => {
      const found = caller(headers)!;
      const kind = String(body.kind ?? "");
      if (!["vacation", "sick", "personal", "other"].includes(kind))
        return refuse(400, "malformed_request", { kind: "unknown kind" });
      const startsOn = String(body.starts_on ?? "");
      const endsOn = String(body.ends_on ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(startsOn) || !/^\d{4}-\d{2}-\d{2}$/.test(endsOn))
        return refuse(400, "malformed_request", { starts_on: "expected YYYY-MM-DD" });
      if (endsOn < startsOn)
        return refuse(400, "malformed_request", { ends_on: "before it starts" });
      const row: LeaveRow = {
        id: randomUUID(),
        staff_id: found.member.id,
        kind,
        starts_on: startsOn,
        ends_on: endsOn,
        note: String(body.note ?? ""),
        status: "requested",
        decided_at: null,
      };
      leave.push(row);
      audit("team.time_off_requested", found.member.id, "staff", found.member.id);
      return ok({ request_id: row.id });
    },
  },
  {
    method: "POST",
    pattern: "hq/time-off/{request_id}/decide",
    auth: true,
    handler: ({ params, body, headers }) => {
      const found = caller(headers)!;
      const row = leave.find((item) => item.id === params.request_id);
      if (!row) return refuse(404, "not_found");
      const decision = String(body.decision ?? "");
      const own = row.staff_id === found.member.id;
      if (decision === "canceled") {
        if (!own && !hasCap(headers, "hr:write"))
          return refuse(403, "forbidden", { required_capability: "hr:write" });
      } else if (decision === "approved" || decision === "declined") {
        if (!hasCap(headers, "hr:write"))
          return refuse(403, "forbidden", { required_capability: "hr:write" });
        if (own) return refuse(403, "forbidden", { reason: "own-request" });
      } else
        return refuse(400, "malformed_request", { decision: "approved, declined or canceled" });
      if (
        !["requested", "approved"].includes(row.status) ||
        (decision !== "canceled" && row.status !== "requested")
      )
        return refuse(400, "malformed_request", { status: "already decided" });
      row.status = decision;
      row.decided_at = now();
      audit(`team.time_off_${decision}`, found.member.id, "staff", row.staff_id);
      return ok({ status: decision });
    },
  },
  {
    method: "GET",
    pattern: "hq/certificates",
    auth: true,
    capability: "certificates:issue",
    handler: () =>
      ok({
        certificates: [...certificates]
          .sort((a, b) => b.serial.localeCompare(a.serial))
          .map(certificateView),
      }),
  },
  {
    method: "POST",
    pattern: "hq/certificates/issue",
    auth: true,
    capability: "certificates:issue",
    sudo: true,
    handler: ({ body, headers }) => {
      const name = String(body.recipient_name ?? "").trim();
      const title = String(body.title ?? "").trim();
      if (!name || !title)
        return refuse(400, "malformed_request", {
          recipient_name: "a name and a title are required",
        });
      const startsOn = String(body.starts_on ?? "");
      const endsOn = String(body.ends_on ?? "");
      if (!startsOn || !endsOn || endsOn < startsOn)
        return refuse(400, "malformed_request", { ends_on: "before it starts" });
      if (endsOn > today())
        return refuse(400, "malformed_request", {
          ends_on: "a certificate records time already served",
        });
      const year = new Date().getUTCFullYear();
      const number = certificates.filter((row) => row.serial.startsWith(`QT-${year}-`)).length + 1;
      const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
      const code = Array.from(
        { length: 6 },
        () => alphabet[Math.floor(Math.random() * alphabet.length)],
      ).join("");
      const serial = `QT-${year}-${String(number).padStart(4, "0")}-${code}`;
      certificates.push({
        serial,
        staff_id: String(body.staff_id ?? ""),
        recipient_name: name,
        title,
        starts_on: startsOn,
        ends_on: endsOn,
        summary: String(body.summary ?? ""),
        issued_on: today(),
        revoked_at: null,
        revoke_reason: "",
      });
      audit("certificate.issued", caller(headers)?.member.id ?? null, "certificate", serial);
      return ok({ serial });
    },
  },
  {
    method: "POST",
    pattern: "hq/certificates/{serial}/revoke",
    auth: true,
    capability: "certificates:issue",
    sudo: true,
    handler: ({ params, body, headers }) => {
      const row = certificates.find((item) => item.serial === params.serial);
      if (!row) return refuse(404, "not_found");
      if (row.revoked_at) return refuse(400, "malformed_request", { status: "already revoked" });
      const reason = String(body.reason ?? "").trim();
      if (!reason)
        return refuse(400, "malformed_request", { reason: "a written reason is required" });
      row.revoked_at = now();
      row.revoke_reason = reason;
      audit(
        "certificate.revoked",
        caller(headers)?.member.id ?? null,
        "certificate",
        row.serial,
        reason,
      );
      return ok({ revoked: true });
    },
  },
  {
    method: "GET",
    pattern: "public/certificates/{serial}",
    handler: ({ params }) => {
      const row = certificates.find((item) => item.serial === String(params.serial).toUpperCase());
      if (!row) return refuse(404, "not_found");
      return ok({
        certificate: {
          serial: row.serial,
          recipient_name: row.recipient_name,
          title: row.title,
          starts_on: row.starts_on,
          ends_on: row.ends_on,
          summary: row.summary,
          issued_on: row.issued_on,
          valid: !row.revoked_at,
          revoked_on: row.revoked_at ? row.revoked_at.slice(0, 10) : null,
        },
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/team/{staff_id}/profile",
    auth: true,
    capability: "hr:write",
    sudo: true,
    handler: ({ params, body, headers }) => {
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      const before = { ...member };
      const fields: string[] = [];
      if ("manager_id" in body) {
        const managerId = String(body.manager_id ?? "").trim();
        if (managerId) {
          if (managerId === member.id)
            return refuse(400, "malformed_request", { manager_id: "nobody manages themself" });
          const manager = staff.find((row) => row.id === managerId && row.is_active);
          if (!manager)
            return refuse(400, "malformed_request", { manager_id: "not an active colleague" });
          const seen = new Set([member.id]);
          let cursor: string | null | undefined = managerId;
          while (cursor) {
            if (seen.has(cursor))
              return refuse(400, "malformed_request", {
                manager_id: "that would make the reporting line a loop",
              });
            seen.add(cursor);
            cursor = staff.find((row) => row.id === cursor)?.manager_id;
          }
        }
        member.manager_id = managerId || null;
        fields.push("manager_id");
      }
      if ("probation_ends_on" in body) {
        const raw = String(body.probation_ends_on ?? "").trim();
        if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw))
          return refuse(400, "malformed_request", { probation_ends_on: "a date, YYYY-MM-DD" });
        member.probation_ends_on = raw || null;
        fields.push("probation_ends_on");
      }
      for (const name of [
        "emergency_contact_name",
        "emergency_contact_phone",
        "emergency_contact_relation",
      ] as const) {
        if (name in body) {
          member[name] = String(body[name] ?? "").trim();
          fields.push(name);
        }
      }
      if (!fields.length) return refuse(400, "malformed_request", { body: "nothing to change" });
      audit("team.profile_updated", caller(headers)?.member.id ?? null, "staff", member.id, "", {
        changes: changesBetween(before, member),
      });
      return ok({ updated: true });
    },
  },
  {
    method: "POST",
    pattern: "hq/team/{staff_id}/assets",
    auth: true,
    capability: "hr:write",
    sudo: true,
    handler: ({ params, body, headers }) => {
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      const actor = caller(headers)?.member.id ?? null;
      const assetId = String(body.asset_id ?? "").trim();
      if (assetId) {
        const asset = assets.find((row) => row.id === assetId && row.staff_id === member.id);
        if (!asset) return refuse(404, "not_found");
        let returnedNow = false;
        if ("returned_on" in body) {
          const raw = String(body.returned_on ?? "").trim();
          if (raw) {
            if (!/^\d{4}-\d{2}-\d{2}$/.test(raw))
              return refuse(400, "malformed_request", { returned_on: "a date, YYYY-MM-DD" });
            if (raw < asset.issued_on)
              return refuse(400, "malformed_request", { returned_on: "before it was issued" });
            asset.returned_on = raw;
            returnedNow = true;
          } else asset.returned_on = null;
        }
        if ("notes" in body)
          asset.notes = String(body.notes ?? "")
            .trim()
            .slice(0, 400);
        audit(
          returnedNow ? "team.asset_returned" : "team.asset_updated",
          actor,
          "staff",
          member.id,
          "",
          { asset_id: assetId, label: asset.label },
        );
        return ok({ asset_id: assetId });
      }
      const kind = String(body.kind ?? "").trim();
      if (!ASSET_KINDS.includes(kind))
        return refuse(400, "malformed_request", { kind: `one of ${ASSET_KINDS.join(", ")}` });
      const label = String(body.label ?? "")
        .trim()
        .slice(0, 120);
      if (!label) return refuse(400, "malformed_request", { label: "say what it is" });
      const issued = String(body.issued_on ?? "").trim() || today();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(issued))
        return refuse(400, "malformed_request", { issued_on: "a date, YYYY-MM-DD" });
      const row: AssetRow = {
        id: randomUUID(),
        staff_id: member.id,
        kind,
        label,
        serial: String(body.serial ?? "")
          .trim()
          .slice(0, 80),
        issued_on: issued,
        returned_on: null,
        notes: String(body.notes ?? "")
          .trim()
          .slice(0, 400),
      };
      assets.push(row);
      audit("team.asset_issued", actor, "staff", member.id, "", { asset_id: row.id, kind, label });
      return ok({ asset_id: row.id });
    },
  },
  {
    method: "POST",
    pattern: "hq/team/{staff_id}/training",
    auth: true,
    capability: "hr:write",
    handler: ({ params, body, headers }) => {
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      const title = String(body.title ?? "")
        .trim()
        .slice(0, 160);
      if (!title) return refuse(400, "malformed_request", { title: "name the training" });
      const completed = String(body.completed_on ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(completed))
        return refuse(400, "malformed_request", { completed_on: "a date, YYYY-MM-DD" });
      const expires = String(body.expires_on ?? "").trim() || null;
      if (expires && !/^\d{4}-\d{2}-\d{2}$/.test(expires))
        return refuse(400, "malformed_request", { expires_on: "a date, YYYY-MM-DD" });
      if (expires && expires <= completed)
        return refuse(400, "malformed_request", { expires_on: "after it was completed" });
      const row: TrainingRow = {
        id: randomUUID(),
        staff_id: member.id,
        title,
        provider: String(body.provider ?? "")
          .trim()
          .slice(0, 120),
        completed_on: completed,
        expires_on: expires,
        reference: String(body.reference ?? "")
          .trim()
          .slice(0, 400),
      };
      training.push(row);
      audit("team.training_recorded", caller(headers)?.member.id ?? null, "staff", member.id, "", {
        training_id: row.id,
        title,
      });
      return ok({ training_id: row.id });
    },
  },
  {
    method: "POST",
    pattern: "hq/team/{staff_id}/one-on-ones",
    auth: true,
    handler: ({ params, body, headers }) => {
      const found = caller(headers)!;
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      if (!mayWriteOneOnOne(found.member.id, found.member.role, member))
        return refuse(403, "forbidden", {
          reason: "only HR or the person's manager records a one-to-one",
        });
      const heldOn = String(body.held_on ?? "").trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(heldOn))
        return refuse(400, "malformed_request", { held_on: "a date, YYYY-MM-DD" });
      const rawActions = body.actions;
      if (rawActions !== undefined && !Array.isArray(rawActions))
        return refuse(400, "malformed_request", { actions: "a list" });
      const meetingId = randomUUID();
      const created: ActionRow[] = [];
      for (const item of ((rawActions ?? []) as Record<string, unknown>[]).slice(0, 8)) {
        const title = String(item?.title ?? "")
          .trim()
          .slice(0, 200);
        if (!title) continue;
        const due = String(item?.due_on ?? "").trim() || null;
        if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due))
          return refuse(400, "malformed_request", { actions: "a due date is YYYY-MM-DD" });
        created.push({
          id: randomUUID(),
          one_on_one_id: meetingId,
          staff_id: String(item?.owner ?? "them") === "me" ? found.member.id : member.id,
          title,
          due_on: due,
          done_at: null,
          created_at: now(),
        });
      }
      oneOnOnes.push({
        id: meetingId,
        staff_id: member.id,
        held_by: found.member.id,
        held_on: heldOn,
        notes: String(body.notes ?? "")
          .trim()
          .slice(0, 2000),
      });
      oneOnOneActions.push(...created);
      audit("team.one_on_one_held", found.member.id, "staff", member.id, "", {
        one_on_one_id: meetingId,
        actions: created.length,
      });
      return ok({ one_on_one_id: meetingId, actions: created.length });
    },
  },
  {
    method: "POST",
    pattern: "hq/one-on-ones/actions/{action_id}",
    auth: true,
    handler: ({ params, body, headers }) => {
      const found = caller(headers)!;
      const action = oneOnOneActions.find((row) => row.id === params.action_id);
      if (!action) return refuse(404, "not_found");
      const meeting = oneOnOnes.find((row) => row.id === action.one_on_one_id);
      const subject = staff.find((row) => row.id === meeting?.staff_id);
      const allowed =
        found.member.id === action.staff_id ||
        found.member.id === meeting?.staff_id ||
        (subject ? mayWriteOneOnOne(found.member.id, found.member.role, subject) : false);
      if (!allowed) return refuse(403, "forbidden", { reason: "not your action" });
      const done = body.done === undefined ? true : Boolean(body.done);
      action.done_at = done ? now() : null;
      audit(
        done ? "team.action_done" : "team.action_reopened",
        found.member.id,
        "staff",
        meeting?.staff_id ?? "",
        "",
        { action_id: action.id },
      );
      return ok({ done });
    },
  },
  {
    method: "GET",
    pattern: "hq/policies",
    auth: true,
    handler: ({ headers }) => {
      const states = policyStates(caller(headers)!.member.id);
      return ok({ policies: states, outstanding: states.filter((row) => row.outstanding).length });
    },
  },
  {
    method: "POST",
    pattern: "hq/policies/{policy_key}/acknowledge",
    auth: true,
    handler: ({ params, headers }) => {
      const found = caller(headers)!;
      const policy = policies.find((row) => row.key === params.policy_key);
      if (!policy) return refuse(404, "not_found");
      if (
        !policyAcks.some(
          (row) =>
            row.staff_id === found.member.id &&
            row.policy_key === policy.key &&
            row.version === policy.version,
        )
      )
        policyAcks.push({
          staff_id: found.member.id,
          policy_key: policy.key,
          version: policy.version,
          acknowledged_at: now(),
        });
      audit("policy.acknowledged", found.member.id, "policy", policy.key, "", {
        version: policy.version,
      });
      return ok({ acknowledged: true, version: policy.version });
    },
  },
  {
    method: "POST",
    pattern: "hq/settings/policies/update",
    auth: true,
    capability: "hq:admin",
    handler: ({ body, headers }) => {
      const key = String(body.key ?? "")
        .trim()
        .toLowerCase();
      if (!/^[a-z][a-z0-9_]{1,39}$/.test(key))
        return refuse(400, "malformed_request", {
          key: "lowercase letters, digits and underscores",
        });
      const existing = policies.find((row) => row.key === key);
      const title =
        String(body.title ?? "")
          .trim()
          .slice(0, 120) ||
        existing?.title ||
        "";
      if (!title) return refuse(400, "malformed_request", { title: "name the policy" });
      const url =
        "url" in body
          ? String(body.url ?? "")
              .trim()
              .slice(0, 400)
          : (existing?.url ?? "");
      if (url && !/^https?:\/\//.test(url))
        return refuse(400, "malformed_request", { url: "expected an http(s) URL" });
      const bump = body.publish === true || !existing;
      let version = existing?.version ?? 0;
      if (bump) version += 1;
      if (existing && !bump && title === existing.title && url === existing.url)
        return refuse(400, "malformed_request", { reason: "nothing to change" });
      if (existing) Object.assign(existing, { title, url, version });
      else policies.push({ key, title, version, url });
      audit(
        bump ? "settings.policy_published" : "settings.policy_updated",
        caller(headers)?.member.id ?? null,
        "policy",
        key,
        "",
        { version, title },
      );
      return ok({ updated: true, key, version });
    },
  },
  {
    method: "GET",
    pattern: "hq/access-reviews",
    auth: true,
    capability: "hr:read",
    handler: () =>
      ok({
        reviews: [...reviews]
          .sort((a, b) => b.started_at.localeCompare(a.started_at))
          .map((review) => reviewView(review, false)),
        quarter: quarterOf(new Date()),
      }),
  },
  {
    method: "POST",
    pattern: "hq/access-reviews/start",
    auth: true,
    capability: "hr:write",
    sudo: true,
    handler: ({ headers }) => {
      if (reviews.some((review) => !review.completed_at))
        return refuse(400, "malformed_request", { reason: "a review is already open" });
      const live = systemAccess.filter((row) => accessView(row).live);
      if (!live.length)
        return refuse(400, "malformed_request", { reason: "nothing in the register to review" });
      const review: ReviewRow = {
        id: randomUUID(),
        quarter: quarterOf(new Date()),
        started_at: now(),
        completed_at: null,
      };
      reviews.push(review);
      for (const row of live)
        reviewItems.push({
          review_id: review.id,
          access_id: row.id,
          decision: "pending",
          evidence: "",
          decided_at: null,
        });
      audit(
        "access_review.started",
        caller(headers)?.member.id ?? null,
        "access_review",
        review.id,
      );
      return ok({ review_id: review.id });
    },
  },
  {
    method: "GET",
    pattern: "hq/access-reviews/{review_id}",
    auth: true,
    capability: "hr:read",
    handler: ({ params }) => {
      const review = reviews.find((row) => row.id === params.review_id);
      if (!review) return refuse(404, "not_found");
      return ok({ review: reviewView(review, true) });
    },
  },
  {
    method: "POST",
    pattern: "hq/access-reviews/{review_id}/items/{access_id}",
    auth: true,
    capability: "hr:write",
    handler: ({ params, body, headers }) => {
      const review = reviews.find((row) => row.id === params.review_id);
      if (!review) return refuse(404, "not_found");
      if (review.completed_at)
        return refuse(400, "malformed_request", { status: "the review is complete" });
      const decision = String(body.decision ?? "");
      if (!["keep", "revoke"].includes(decision))
        return refuse(400, "malformed_request", { decision: "keep or revoke" });
      const evidence = String(body.evidence ?? "").trim();
      if (evidence.length < 4)
        return refuse(400, "malformed_request", { evidence: "say what the decision rests on" });
      const item = reviewItems.find(
        (row) => row.review_id === review.id && row.access_id === params.access_id,
      );
      if (!item) return refuse(404, "not_found");
      Object.assign(item, { decision, evidence, decided_at: now() });
      if (decision === "revoke") {
        const access = systemAccess.find((row) => row.id === item.access_id);
        if (access && !access.revoked_on) access.revoked_on = today();
      }
      audit(
        "access_review.decided",
        caller(headers)?.member.id ?? null,
        "access_review",
        review.id,
        evidence,
      );
      return ok({ decision });
    },
  },
  {
    method: "POST",
    pattern: "hq/access-reviews/{review_id}/complete",
    auth: true,
    capability: "hr:write",
    handler: ({ params, headers }) => {
      const review = reviews.find((row) => row.id === params.review_id);
      if (!review) return refuse(404, "not_found");
      if (review.completed_at)
        return refuse(400, "malformed_request", { status: "already complete" });
      const pending = reviewItems.filter(
        (row) => row.review_id === review.id && row.decision === "pending",
      ).length;
      if (pending) return refuse(400, "malformed_request", { reason: `${pending} undecided` });
      review.completed_at = now();
      audit(
        "access_review.completed",
        caller(headers)?.member.id ?? null,
        "access_review",
        review.id,
      );
      return ok({ completed: true });
    },
  },
);

function matchRoute(method: string, route: string) {
  for (const entry of routes) {
    if (entry.method !== method) continue;
    if (!entry.pattern.includes("{")) {
      if (entry.pattern === route) return { entry, params: {} as Record<string, string> };
      continue;
    }
    const regex = new RegExp(
      `^${entry.pattern.replace(/\{([a-z_]+)\}/g, "(?<$1>[A-Za-z0-9._-]{1,64})")}$`,
    );
    const found = route.match(regex);
    if (found) return { entry, params: { ...(found.groups ?? {}) } };
  }
  // Same route, other method → 405, mirroring the service.
  const sibling = routes.some((entry) => {
    if (!entry.pattern.includes("{")) return entry.pattern === route;
    const regex = new RegExp(
      `^${entry.pattern.replace(/\{([a-z_]+)\}/g, "[A-Za-z0-9._-]{1,64}")}$`,
    );
    return regex.test(route);
  });
  return sibling ? "method" : null;
}

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", `http://127.0.0.1:${PORT}`);
  if (!url.pathname.startsWith(PREFIX)) {
    response.writeHead(404).end();
    return;
  }
  const route = url.pathname.slice(PREFIX.length).replace(/\/+$/, "");
  const chunks: Buffer[] = [];
  request.on("data", (chunk: Buffer) => chunks.push(chunk));
  request.on("end", () => {
    let body: Record<string, unknown> = {};
    try {
      body = chunks.length
        ? (JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>)
        : {};
    } catch {
      body = {};
    }
    const query: Record<string, string> = {};
    url.searchParams.forEach((value, name) => {
      query[name] = value;
    });
    // The mock consent screen: approve at once and send the browser back to the portal.
    if (request.method === "GET" && route === "mock/consent") {
      const back = new URL("http://127.0.0.1:3000/admin/integrations/calendar/callback");
      back.searchParams.set("code", "mock-code");
      back.searchParams.set("state", query.state ?? "");
      response.writeHead(302, { location: back.toString() }).end();
      console.log(`[mock-hq] GET /${route} -> 302 consent`);
      return;
    }
    const answer = respond(request.method ?? "GET", route, query, body, request.headers);
    response
      .writeHead(answer.status, { "content-type": "application/json" })
      .end(JSON.stringify(answer.body));
    console.log(`[mock-hq] ${request.method} /${route} -> ${answer.status}`);
  });
});

function resetWorld() {
  pendings.clear();
  sessions.clear();
  invites.clear();
  auditEvents.length = 0;
  seedTickets();
  seedSavedReplies();
  seedCrm();
  seedMeetings();
  resetCalendar();
  seedRevenue();
  seedTeam();
  seedOpenReview();
  seedPeopleOps();
  seedViews();
  seedSla();
  resetDeskRules();
  seedSources();
  seedPlans();
  Object.assign(retentionRules, RETENTION_SEED);
  webhookEvents.length = 0;
  for (const member of staff) {
    member.enrolled = !member.email.startsWith("newbie");
    member.is_active = true;
  }
}

function respond(
  method: string,
  route: string,
  query: Record<string, string>,
  body: Record<string, unknown>,
  headers: Record<string, string | string[] | undefined>,
) {
  // Test-only, deliberately OUTSIDE the hq/ and public/ namespaces the parity test
  // mirrors: the real service has no reset, and this must never look like it does.
  if (method === "POST" && route === "mock/reset") {
    resetWorld();
    return ok({ reset: true });
  }
  if (DEGRADED.has(route)) return refuse(503, "upstream_unavailable");
  const matched = matchRoute(method, route);
  if (matched === null) return refuse(404, "not_found");
  if (matched === "method") return refuse(405, "method_not_allowed");
  const { entry, params } = matched;
  if (entry.auth) {
    const found = caller(headers);
    if (!found) return refuse(401, "session_invalid");
    if (entry.capability && !(CAPABILITIES[found.member.role] ?? []).includes(entry.capability)) {
      return refuse(403, "forbidden", { required_capability: entry.capability });
    }
    if (entry.sudo && !(found.session.sudo_until && found.session.sudo_until > now())) {
      return refuse(403, "forbidden", { sudo_required: true });
    }
    if (method === "POST" && !headers["idempotency-key"]) {
      return refuse(400, "idempotency_key_required");
    }
  }
  return entry.handler({ method, route, params, query, body, headers });
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-hq] serving http://127.0.0.1:${PORT}${PREFIX}`);
  console.log("[mock-hq] personas: owner@ admin@ sales@ support@ intern@ newbie@hq.test");
  console.log("[mock-hq] every TOTP prompt accepts 000000; recovery codes mockr-code0..9");
});
