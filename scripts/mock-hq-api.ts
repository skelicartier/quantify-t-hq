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
    "mail:send",
    "privacy:read",
    "privacy:write",
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
    "mail:send",
    "privacy:read",
    "privacy:write",
    "revenue:read",
    "revenue:write",
    "tickets:manage",
    "tickets:read",
    "tickets:write",
  ],
  sales: ["crm:read", "crm:write", "deals:read", "deals:write", "revenue:read", "tickets:read"],
  support: [
    "crm:read",
    "deals:read",
    "privacy:read",
    "privacy:write",
    "tickets:manage",
    "tickets:read",
    "tickets:write",
  ],
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
  /** Mirrors a credential row: false for an invitee until they accept; absent = set. */
  password_set?: boolean;
  recovery_codes_remaining?: number;
  manager_id?: string | null;
  probation_ends_on?: string | null;
  emergency_contact_name?: string;
  emergency_contact_phone?: string;
  emergency_contact_relation?: string;
};

const STAFF_KINDS = ["founder", "employee", "intern", "contractor"];

const now = () => new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
/** Where the portal under test runs: links the mock hands back (invites, calendar, stop links) point here. */
const PORTAL_ORIGIN = process.env.HQ_UI_BASE ?? "http://127.0.0.1:3000";

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
      const ticket = enrolTickets.get(member.id);
      if (!member.enrolled && ticket) {
        if (String(body.enrol_ticket ?? "") !== ticket.ticket)
          return refuse(403, "forbidden", { reason: "enrol-ticket-required" });
        if (Date.parse(ticket.expires_at) <= Date.now())
          return refuse(403, "forbidden", { reason: "enrol-ticket-expired" });
      }
      return ok({
        mfa: kind,
        pending_token: mintPending(member.id, kind),
        passkeys: member.enrolled && passkeys.some((row) => row.staff_id === member.id),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/auth/totp",
    handler: ({ body, headers }) => {
      const member = pendingFor(String(body.pending_token ?? ""), "totp");
      if (!member) return refuse(401, "unauthenticated");
      if (String(body.code ?? "") !== "000000") return refuse(401, "unauthenticated");
      noteDevice(
        member,
        String(body.device_id ?? ""),
        clientAddress(headers),
        clientAgent(headers),
      );
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
      noteDevice(
        member,
        String(body.device_id ?? ""),
        clientAddress(headers),
        clientAgent(headers),
      );
      recordSecurityEvent("recovery.used", member.id, "A recovery code was used to sign in.", {
        ip: clientAddress(headers),
      });
      return ok(mintSession(member, clientAddress(headers), clientAgent(headers)));
    },
  },
  {
    method: "POST",
    pattern: "hq/auth/passkey/options",
    handler: ({ body }) => {
      const member = pendingFor(String(body.pending_token ?? ""), "totp");
      if (!member) return refuse(401, "unauthenticated");
      const mine = passkeys.filter((row) => row.staff_id === member.id);
      if (!mine.length)
        return refuse(400, "malformed_request", {
          reason: "no passkey on this account; use the code",
        });
      return ok({
        ...mintPasskeyChallenge(member.id),
        rp_id: "localhost",
        allow_credentials: mine.map((row) => ({
          type: "public-key",
          id: row.credential_id,
          transports: row.transports,
        })),
        user_verification: "preferred",
        timeout_ms: 60_000,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/auth/passkey",
    handler: ({ body, headers }) => {
      const member = pendingFor(String(body.pending_token ?? ""), "totp");
      if (!member) return refuse(401, "unauthenticated");
      const challenge = passkeyChallenges.get(String(body.challenge_token ?? ""));
      if (!challenge || challenge.staffId !== member.id) {
        console.log("[mock-hq] passkey refused: unknown or foreign challenge");
        return refuse(401, "unauthenticated");
      }
      const row = passkeys.find(
        (candidate) =>
          candidate.credential_id === String(body.credential_id ?? "") &&
          candidate.staff_id === member.id,
      );
      if (!row) {
        console.log(
          `[mock-hq] passkey refused: no credential ${String(body.credential_id ?? "")} for this account`,
        );
        return refuse(401, "unauthenticated");
      }
      if (!body.client_data_json || !body.authenticator_data || !body.signature) {
        console.log("[mock-hq] passkey refused: assertion fields missing");
        return refuse(401, "unauthenticated");
      }
      passkeyChallenges.delete(String(body.challenge_token ?? ""));
      row.last_used_at = now();
      audit("auth.login", member.id, "staff", member.id, "", {
        factor: "passkey",
        passkey_id: row.id,
      });
      noteDevice(
        member,
        String(body.device_id ?? ""),
        clientAddress(headers),
        clientAgent(headers),
      );
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
      const afterReset = enrolTickets.delete(member.id);
      noteDevice(
        member,
        String(body.device_id ?? ""),
        clientAddress(headers),
        clientAgent(headers),
      );
      recordSecurityEvent(
        "factor.enrolled",
        member.id,
        afterReset
          ? "A new authenticator was enrolled on your account with the one-time link from your reset, and fresh recovery codes were issued."
          : "Your authenticator was enrolled and your recovery codes were issued.",
        { detail: { after_reset: afterReset } },
      );
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
      member.password_set = true;
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
        inbox_unread: inboxUnread(found.member.id),
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
    pattern: "hq/passkeys",
    auth: true,
    handler: ({ headers }) => {
      const me = caller(headers)!.member.id;
      return ok({
        passkeys: passkeys.filter((row) => row.staff_id === me).map(passkeyView),
        limit: 10,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/passkeys/register/options",
    auth: true,
    sudo: true,
    handler: ({ headers }) => {
      const found = caller(headers)!;
      const mine = passkeys.filter((row) => row.staff_id === found.member.id);
      if (mine.length >= 10)
        return refuse(400, "malformed_request", { reason: "at most 10 passkeys" });
      return ok({
        ...mintPasskeyChallenge(found.member.id),
        rp: { id: "localhost", name: "Quantify HQ" },
        user: {
          id: Buffer.from(found.member.id).toString("base64url"),
          name: found.member.email,
          display_name: found.member.display_name,
        },
        pub_key_cred_params: [
          { type: "public-key", alg: -7 },
          { type: "public-key", alg: -257 },
        ],
        exclude_credentials: mine.map((row) => ({ type: "public-key", id: row.credential_id })),
        authenticator_selection: { residentKey: "preferred", userVerification: "preferred" },
        attestation: "none",
        timeout_ms: 60_000,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/passkeys/register",
    auth: true,
    sudo: true,
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const challenge = passkeyChallenges.get(String(body.challenge_token ?? ""));
      if (!challenge || challenge.staffId !== found.member.id)
        return refuse(401, "unauthenticated");
      if (!body.client_data_json || !body.attestation_object)
        return refuse(400, "malformed_request", { credential: "no credential was attested" });
      passkeyChallenges.delete(String(body.challenge_token ?? ""));
      const credentialId = credentialIdFromAttestation(String(body.attestation_object));
      if (!credentialId)
        return refuse(400, "malformed_request", {
          credential: "the attestation object could not be read",
        });
      if (passkeys.some((row) => row.credential_id === credentialId))
        return refuse(400, "malformed_request", {
          credential: "this passkey is already registered",
        });
      const row: PasskeyRow = {
        id: randomUUID(),
        staff_id: found.member.id,
        credential_id: credentialId,
        label:
          String(body.label ?? "")
            .trim()
            .slice(0, 80) || "Passkey",
        transports: Array.isArray(body.transports) ? body.transports.map(String).slice(0, 6) : [],
        created_at: now(),
        last_used_at: null,
      };
      passkeys.push(row);
      audit("auth.passkey_added", found.member.id, "staff", found.member.id, "", {
        passkey_id: row.id,
        label: row.label,
      });
      return ok({ passkey: passkeyView(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/passkeys/{passkey_id}/delete",
    auth: true,
    sudo: true,
    handler: ({ headers, params }) => {
      const found = caller(headers)!;
      const index = passkeys.findIndex(
        (row) => row.id === params.passkey_id && row.staff_id === found.member.id,
      );
      if (index < 0) return refuse(404, "not_found");
      const [row] = passkeys.splice(index, 1);
      audit("auth.passkey_removed", found.member.id, "staff", found.member.id, "", {
        passkey_id: row!.id,
        label: row!.label,
      });
      return ok({ deleted: true });
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
      if (["owner", "admin"].includes(role) && approvers("role_grant", found.member.id).length)
        return ok({
          pending_approval: true,
          approval: requestApproval(
            "role_grant",
            found.member,
            {
              email,
              role,
              kind: String(body.kind ?? "employee"),
              display_name: String(body.display_name ?? ""),
              starts_on: String(body.starts_on ?? ""),
              ends_on: String(body.ends_on ?? ""),
              personal_email: String(body.personal_email ?? ""),
            },
            String(body.reason ?? ""),
          ),
        });
      const member: Staff = {
        id: randomUUID(),
        email,
        display_name: String(body.display_name ?? ""),
        role: role as Staff["role"],
        kind: String(body.kind ?? "employee"),
        is_active: false,
        password_set: false,
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
        invite_url: `${PORTAL_ORIGIN}/reset-password?invite=${token}`,
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
          // Mirrors staff_routes: joined = a password exists.
          joined: member.password_set !== false,
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
      let pendingApproval: Record<string, unknown> | null = null;
      const role = String(body.role ?? "");
      if (role && role !== member.role) {
        if (member.id === found.member.id) return refuse(403, "forbidden", { reason: "own-role" });
        if (!(role in CAPABILITIES))
          return refuse(400, "malformed_request", { role: "unknown role" });
        if (["owner", "admin"].includes(role) && found.member.role !== "owner")
          return refuse(403, "forbidden", { required_role: "owner" });
        if (member.role === "owner" && found.member.role !== "owner")
          return refuse(403, "forbidden", { required_role: "owner" });
        if (
          ["owner", "admin"].includes(role) &&
          approvers("role_grant", found.member.id, member.id).length
        ) {
          pendingApproval = requestApproval(
            "role_grant",
            found.member,
            { role, from: member.role, target_label: member.email },
            String(body.reason ?? ""),
            member.id,
          );
        } else {
          member.role = role as Staff["role"];
          changed = true;
          audit(
            "staff.role_changed",
            found.member.id,
            "staff",
            member.id,
            String(body.reason ?? ""),
          );
        }
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
      if (!changed && !pendingApproval)
        return refuse(400, "malformed_request", { body: "nothing to change" });
      if (changed && (!role || role === member.role || pendingApproval))
        audit("staff.updated", found.member.id, "staff", member.id);
      return ok({
        staff: staffView(member),
        ...(pendingApproval ? { pending_approval: true, approval: pendingApproval } : {}),
      });
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
      // Mirrors staff_routes: refused for anyone who has ever set a password.
      if (member.is_active || member.password_set !== false)
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
        invite_url: `${PORTAL_ORIGIN}/reset-password?invite=${token}`,
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
    handler: ({ headers, params, body }) => {
      const member = staff.find((row) => row.id === params.staff_id);
      if (!member) return refuse(404, "not_found");
      const self = caller(headers)!.member;
      const privileged = ["owner", "admin"].includes(member.role);
      if (privileged && self.role !== "owner" && self.id !== member.id)
        return refuse(403, "forbidden", { required_role: "owner" });
      const reason = String(body.reason ?? "")
        .trim()
        .slice(0, 400);
      if (privileged && approvers("factor_reset", self.id, member.id).length > 0) {
        const approval = requestApproval(
          "factor_reset",
          self,
          { target_label: member.email, target_role: member.role },
          reason,
          member.id,
        );
        return ok({ pending_approval: true, approval });
      }
      return ok(performFactorReset(self, member, reason, null));
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
          if (member.id !== row.assignee_staff_id)
            inboxAssigned(
              member.id,
              "ticket",
              row.id,
              found.member,
              `${found.member.display_name || "A colleague"} gave you the ticket \u201c${row.subject.slice(0, 120)}\u201d.`,
              row.subject,
            );
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

type PasskeyRow = {
  id: string;
  staff_id: string;
  credential_id: string;
  label: string;
  transports: string[];
  created_at: string;
  last_used_at: string | null;
};
const passkeys: PasskeyRow[] = [];
const passkeyChallenges = new Map<string, { staffId: string; challenge: string }>();

function seedPasskeys() {
  passkeys.length = 0;
  passkeyChallenges.clear();
  passkeys.push({
    id: "pk000000-0000-4000-8000-000000000001",
    staff_id: OWNER_STAFF,
    credential_id: "bW9jay1jcmVkZW50aWFsLW93bmVyLWxhcHRvcA",
    label: "Owner's laptop",
    transports: ["internal", "hybrid"],
    created_at: agoIso(24 * 30),
    last_used_at: agoIso(24 * 2),
  });
}

function passkeyView(row: PasskeyRow) {
  return {
    passkey_id: row.id,
    label: row.label,
    transports: row.transports,
    created_at: row.created_at,
    last_used_at: row.last_used_at,
  };
}

/**
 * Just enough CBOR to read an attestation object: the mock cannot verify a passkey, but
 * it does record the credential id the authenticator actually made, so a later sign-in
 * with that authenticator finds it — as the service would.
 */
function cborDecode(bytes: Uint8Array): unknown {
  let offset = 0;
  const readLength = (info: number): number => {
    if (info < 24) return info;
    if (info === 24) return bytes[offset++]!;
    if (info === 25) {
      const value = (bytes[offset]! << 8) | bytes[offset + 1]!;
      offset += 2;
      return value;
    }
    if (info === 26) {
      const value =
        bytes[offset]! * 2 ** 24 +
        (bytes[offset + 1]! << 16) +
        (bytes[offset + 2]! << 8) +
        bytes[offset + 3]!;
      offset += 4;
      return value;
    }
    throw new Error("cbor: unsupported length");
  };
  const item = (): unknown => {
    const initial = bytes[offset++]!;
    const major = initial >> 5;
    const info = initial & 0x1f;
    switch (major) {
      case 0:
        return readLength(info);
      case 1:
        return -1 - readLength(info);
      case 2: {
        const length = readLength(info);
        const value = bytes.slice(offset, offset + length);
        offset += length;
        return value;
      }
      case 3: {
        const length = readLength(info);
        const value = new TextDecoder().decode(bytes.slice(offset, offset + length));
        offset += length;
        return value;
      }
      case 4: {
        const length = readLength(info);
        const out: unknown[] = [];
        for (let index = 0; index < length; index += 1) out.push(item());
        return out;
      }
      case 5: {
        const length = readLength(info);
        const out: Record<string, unknown> = {};
        for (let index = 0; index < length; index += 1) {
          const key = item();
          out[String(key)] = item();
        }
        return out;
      }
      default:
        throw new Error("cbor: unsupported major type");
    }
  };
  return item();
}

/** The credential id an attestation object carries; null when it cannot be read. */
function credentialIdFromAttestation(attestationObject: string): string | null {
  try {
    const decoded = cborDecode(
      new Uint8Array(Buffer.from(attestationObject, "base64url")),
    ) as Record<string, unknown>;
    const authData = decoded["authData"];
    if (!(authData instanceof Uint8Array) || authData.length < 55) return null;
    if (!(authData[32]! & 0x40)) return null; // no attested credential data
    const length = (authData[53]! << 8) | authData[54]!;
    const id = authData.slice(55, 55 + length);
    if (id.length !== length || length === 0) return null;
    return Buffer.from(id).toString("base64url");
  } catch {
    return null;
  }
}

function mintPasskeyChallenge(staffId: string) {
  const challenge = randomUUID().replace(/-/g, "");
  const token = `mock-webauthn-${randomUUID()}`;
  passkeyChallenges.set(token, { staffId, challenge });
  return { challenge, challenge_token: token };
}
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
  /** Mirrors 0034: a person's category ('' or absent: the stage's), pushes, first date. */
  forecast_category?: string | null;
  push_count?: number;
  first_close_date?: string;
  next_step_changed_at?: string;
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

// --- dual control ---------------------------------------------------------------------------

type ApprovalRow = {
  id: string;
  kind: "role_grant" | "api_key" | "factor_reset" | "write_off";
  status: "pending" | "approved" | "declined" | "withdrawn" | "expired" | "done";
  requested_by: string;
  requested_at: string;
  expires_at: string;
  target_staff_id: string;
  payload: Record<string, unknown>;
  reason: string;
  decided_by: string;
  decided_at: string | null;
  decision_note: string;
  result_id: string;
};
const approvals: ApprovalRow[] = [];
const APPROVAL_TTL_HOURS = 48;

function hoursFromNowIso(hours: number): string {
  return new Date(Date.now() + hours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}

function approverRoles(kind: ApprovalRow["kind"]): string[] {
  return kind === "api_key" || kind === "write_off" ? ["owner", "admin"] : ["owner"];
}

/** Active colleagues, other than the requester and the person it is about, who may approve. */
function approvers(kind: ApprovalRow["kind"], excluding: string, targetStaffId = ""): Staff[] {
  return staff.filter(
    (row) =>
      row.is_active &&
      row.id !== excluding &&
      row.id !== targetStaffId &&
      approverRoles(kind).includes(row.role),
  );
}

function nameOf(staffId: string): string {
  const member = staff.find((row) => row.id === staffId);
  return member ? member.display_name || member.email : "";
}

function personOf(staffId: string) {
  return staffId ? { staff_id: staffId, name: nameOf(staffId) } : null;
}

function approvalSummary(kind: ApprovalRow["kind"], payload: Record<string, unknown>): string {
  if (kind === "factor_reset")
    return `reset ${String(payload.target_label ?? "a colleague")}'s authenticator`;
  if (kind === "write_off")
    return `write off invoice ${String(payload.number ?? "")} (${String(payload.currency ?? "")} ${String(payload.amount ?? "")}) for ${String(payload.company ?? "a customer")}`;
  if (kind === "api_key") {
    const scopes = Array.isArray(payload.scopes) ? payload.scopes.join(", ") : "";
    return `mint an intake key \u201c${String(payload.name ?? "")}\u201d for ${scopes} lasting ${String(payload.expires_in_days ?? 0)} days`;
  }
  if (payload.email) return `invite ${String(payload.email)} as ${String(payload.role ?? "")}`;
  return `change ${String(payload.target_label ?? "a colleague")}'s role from ${String(payload.from || "none")} to ${String(payload.role ?? "")}`;
}

function approvalPayloadView(kind: ApprovalRow["kind"], payload: Record<string, unknown>) {
  if (kind === "factor_reset") {
    return {
      target_label: String(payload.target_label ?? ""),
      target_role: String(payload.target_role ?? ""),
    };
  }
  if (kind === "write_off") {
    return {
      number: String(payload.number ?? ""),
      currency: String(payload.currency ?? ""),
      amount: String(payload.amount ?? ""),
      company: String(payload.company ?? ""),
    };
  }
  if (kind === "api_key") {
    return {
      name: String(payload.name ?? ""),
      scopes: Array.isArray(payload.scopes) ? payload.scopes.map(String) : [],
      expires_in_days: Number(payload.expires_in_days ?? 0),
    };
  }
  return {
    role: String(payload.role ?? ""),
    email: String(payload.email ?? ""),
    display_name: String(payload.display_name ?? ""),
    kind: String(payload.kind ?? ""),
    from: String(payload.from ?? ""),
    target_label: String(payload.target_label ?? ""),
  };
}

function approvalStatus(row: ApprovalRow): ApprovalRow["status"] {
  if (["pending", "approved"].includes(row.status) && Date.parse(row.expires_at) <= Date.now())
    return "expired";
  return row.status;
}

function expireStaleApprovals() {
  for (const row of approvals) if (approvalStatus(row) === "expired") row.status = "expired";
}

function approvalView(row: ApprovalRow, viewer?: Staff) {
  const status = approvalStatus(row);
  const view: Record<string, unknown> = {
    approval_id: row.id,
    kind: row.kind,
    status,
    summary: approvalSummary(row.kind, row.payload),
    payload: approvalPayloadView(row.kind, row.payload),
    reason: row.reason,
    requested_by: personOf(row.requested_by),
    requested_at: row.requested_at,
    expires_at: row.expires_at,
    target_staff_id: row.target_staff_id,
    decided_by: personOf(row.decided_by),
    decided_at: row.decided_at,
    decision_note: row.decision_note,
    result_id: row.result_id,
    approver_roles: approverRoles(row.kind),
  };
  if (viewer) {
    const mine = row.requested_by === viewer.id;
    view.can_decide =
      status === "pending" &&
      !mine &&
      row.target_staff_id !== viewer.id &&
      approverRoles(row.kind).includes(viewer.role);
    view.can_withdraw = mine && ["pending", "approved"].includes(status);
    view.can_collect =
      mine && status === "approved" && (row.kind === "api_key" || row.kind === "factor_reset");
  }
  return view;
}

function requestApproval(
  kind: ApprovalRow["kind"],
  requester: Staff,
  payload: Record<string, unknown>,
  reason: string,
  targetStaffId = "",
) {
  const row: ApprovalRow = {
    id: randomUUID(),
    kind,
    status: "pending",
    requested_by: requester.id,
    requested_at: now(),
    expires_at: hoursFromNowIso(APPROVAL_TTL_HOURS),
    target_staff_id: targetStaffId,
    payload,
    reason: reason.slice(0, 400),
    decided_by: "",
    decided_at: null,
    decision_note: "",
    result_id: "",
  };
  approvals.unshift(row);
  const summaryText = approvalSummary(kind, payload);
  inboxNotify({
    recipients: approvers(kind, requester.id, targetStaffId).map((member) => member.id),
    subject_type: "approval",
    subject_id: row.id,
    subject_label: `${summaryText.charAt(0).toUpperCase()}${summaryText.slice(1)}`,
    reason: "review",
    summary: `${requester.display_name || requester.email} asked for your approval. Reason given: ${row.reason || "none"}.`,
    actor_id: requester.id,
  });
  audit("approval.requested", requester.id, "approval", row.id, row.reason, {
    kind,
    summary: approvalSummary(kind, payload),
  });
  return approvalView(row, requester);
}

// --- security 2: enrolment tickets, devices, the feed -----------------------------------------

type SecurityEventRow = {
  id: string;
  kind: string;
  severity: "info" | "warning" | "critical";
  subject_staff_id: string;
  actor_staff_id: string;
  summary: string;
  detail: Record<string, unknown>;
  ip: string;
  occurred_at: string;
  state: "open" | "acknowledged" | "resolved";
  handled_by: string;
  handled_at: string | null;
  note: string;
  reported_at: string | null;
};
type DeviceRow = {
  id: string;
  staff_id: string;
  device_hash: string;
  label: string;
  first_seen_at: string;
  last_seen_at: string;
  last_ip: string;
};

/** Mirrors security_feed.KINDS: kind -> [severity, what the feed calls it]. */
const SECURITY_KINDS: Record<string, [SecurityEventRow["severity"], string]> = {
  "sign_in.new_device": ["info", "Sign-in from a new device"],
  "sign_in.unusual": ["warning", "Unusual sign-in"],
  "factor.enrolled": ["info", "Authenticator enrolled"],
  "factor.reset": ["warning", "Authenticator reset"],
  "passkey.added": ["info", "Passkey added"],
  "passkey.removed": ["warning", "Passkey removed"],
  "recovery.used": ["warning", "Recovery code used"],
  "recovery.regenerated": ["info", "Recovery codes replaced"],
  "password.changed": ["info", "Password changed"],
  "password.reset": ["info", "Password reset by link"],
  "account.reported": ["critical", "\u201cThis wasn't me\u201d pressed"],
  "device.forgotten": ["info", "Device forgotten"],
  "reads.volume": ["warning", "Many records opened"],
  "reads.step_up": ["warning", "Reading needs a fresh code"],
  "reads.held": ["critical", "Reading held"],
  "reads.cleared": ["info", "Reading cleared"],
  "decoy.touched": ["critical", "Decoy opened"],
  "decoy.exported": ["critical", "Decoy exported"],
  "decoy.key_used": ["critical", "Decoy key used"],
  "key.expiring": ["info", "Intake key expiring"],
  "key.disabled_unused": ["warning", "Unused key revoked"],
};

const securityEvents: SecurityEventRow[] = [];
const staffDevices: DeviceRow[] = [];
/** staff id -> the reset's one-time ticket and when it lapses. */
const enrolTickets = new Map<string, { ticket: string; expires_at: string }>();
/** "This wasn't me" tokens the mock hands out: token -> the person and the event. */
const reportTokens = new Map<string, { staffId: string; eventId: string }>();
const ENROL_TICKET_HOURS = 24;

function recordSecurityEvent(
  kind: string,
  subjectStaffId: string,
  summary: string,
  extra: Partial<SecurityEventRow> = {},
): SecurityEventRow {
  const row: SecurityEventRow = {
    id: randomUUID(),
    kind,
    severity: SECURITY_KINDS[kind]?.[0] ?? "info",
    subject_staff_id: subjectStaffId,
    actor_staff_id: "",
    summary: summary.slice(0, 400),
    detail: {},
    ip: "",
    occurred_at: now(),
    state: "open",
    handled_by: "",
    handled_at: null,
    note: "",
    reported_at: null,
    ...extra,
  };
  securityEvents.unshift(row);
  if (row.severity === "critical")
    inboxNotify({
      recipients: staff
        .filter((member) => member.role === "owner" && member.is_active)
        .map((m) => m.id),
      subject_type: "security",
      subject_id: row.id,
      subject_label: SECURITY_KINDS[kind]?.[1] ?? kind,
      reason: "security",
      summary: row.summary,
      at: row.occurred_at,
    });
  // The mail the service would send carries a lock link; the mock prints it instead.
  const token = `hqr_mock_${randomUUID().replace(/-/g, "")}`;
  reportTokens.set(token, { staffId: subjectStaffId, eventId: row.id });
  console.log(`[mock-hq] security ${kind}: lock link ${PORTAL_ORIGIN}/report/${token}`);
  return row;
}

function securityEventView(row: SecurityEventRow) {
  return {
    event_id: row.id,
    kind: row.kind,
    label: SECURITY_KINDS[row.kind]?.[1] ?? row.kind,
    severity: row.severity,
    summary: row.summary,
    subject: personOf(row.subject_staff_id),
    actor: personOf(row.actor_staff_id),
    ip: row.ip,
    occurred_at: row.occurred_at,
    state: row.state,
    handled_by: personOf(row.handled_by),
    handled_at: row.handled_at,
    note: row.note,
    reported_at: row.reported_at,
    detail: row.detail,
  };
}

function deviceHash(deviceId: string): string {
  return createHash("sha256").update(deviceId, "utf8").digest("hex");
}

/** Mirrors auth_routes._unfamiliar_device with the portal's cookie. */
function noteDevice(member: Staff, deviceId: string, ip: string, agent: string) {
  if (deviceId.length < 16 || deviceId.length > 128) return;
  const hash = deviceHash(deviceId);
  const mine = staffDevices.filter((row) => row.staff_id === member.id);
  const match = mine.find((row) => row.device_hash === hash);
  const label = deviceLabel(agent);
  if (match) {
    match.last_seen_at = now();
    match.last_ip = ip;
    match.label = label;
    return;
  }
  staffDevices.push({
    id: randomUUID(),
    staff_id: member.id,
    device_hash: hash,
    label,
    first_seen_at: now(),
    last_seen_at: now(),
    last_ip: ip,
  });
  const earlier = [...sessions.values()].some((session) => session.staffId === member.id);
  if (mine.length > 0 || earlier) {
    audit("auth.new_device", member.id, "session", member.id, "", { device: label, mailed: false });
    recordSecurityEvent(
      "sign_in.new_device",
      member.id,
      `Signed in from ${label}, a device this account had not used, from ${ip}.`,
      { ip, detail: { device: label } },
    );
  }
}

/** Mirrors staff_routes.perform_factor_reset. */
function performFactorReset(
  actor: Staff,
  target: Staff,
  reason: string,
  approval: ApprovalRow | null,
) {
  target.enrolled = false;
  let passkeysRemoved = 0;
  for (let index = passkeys.length - 1; index >= 0; index -= 1) {
    if (passkeys[index]!.staff_id === target.id) {
      passkeys.splice(index, 1);
      passkeysRemoved += 1;
    }
  }
  let revoked = 0;
  for (const session of sessions.values()) {
    if (session.staffId === target.id && !session.revoked_at) {
      session.revoked_at = now();
      revoked += 1;
    }
  }
  const ticket = `hqe_${randomUUID().replace(/-/g, "")}${randomUUID().replace(/-/g, "").slice(0, 11)}`;
  const expires = hoursFromNowIso(ENROL_TICKET_HOURS);
  enrolTickets.set(target.id, { ticket, expires_at: expires });
  const detail: Record<string, unknown> = {
    sessions_revoked: revoked,
    passkeys_removed: passkeysRemoved,
  };
  if (approval)
    detail.dual_control = { approval_id: approval.id, approved_by: approval.decided_by };
  else if (["owner", "admin"].includes(target.role)) detail.dual_control = "sole_approver";
  audit("staff.totp_reset", actor.id, "staff", target.id, reason, detail);
  const who = actor.display_name || "an administrator";
  recordSecurityEvent(
    "factor.reset",
    target.id,
    `Your authenticator, recovery codes and passkeys were reset by ${who}, and every session on your account was ended. ${who} will give you a one-time link to enrol a new authenticator; it works once, within ${ENROL_TICKET_HOURS} hours.`,
    {
      actor_staff_id: actor.id,
      detail: { sessions_revoked: revoked, passkeys_removed: passkeysRemoved },
    },
  );
  return {
    reset: true,
    sessions_revoked: revoked,
    passkeys_removed: passkeysRemoved,
    enrol_url: `${PORTAL_ORIGIN}/login?ticket=${ticket}`,
    enrol_expires_at: expires,
    shown_once: ["enrol_url"],
  };
}

// --- security 2, part two: the read watch and decoys (mirrors read_watch.py, decoys.py) --------

/** Mirrors routes.py `reads=`: record detail reads, written down and counted. */
const WATCHED_READS: Record<string, [string, string]> = {
  "hq/staff/{staff_id}": ["staff", "staff_id"],
  "hq/tickets/{ticket_id}": ["ticket", "ticket_id"],
  "hq/companies/{company_id}": ["company", "company_id"],
  "hq/people/{person_id}": ["person", "person_id"],
  "hq/leads/{lead_id}": ["lead", "lead_id"],
  "hq/deals/{deal_id}": ["deal", "deal_id"],
  "hq/meetings/{meeting_id}": ["meeting", "meeting_id"],
  "hq/contracts/{contract_id}": ["contract", "contract_id"],
  "hq/team/{staff_id}": ["team_member", "staff_id"],
  "hq/privacy/requests/{request_id}": ["privacy_request", "request_id"],
};
const READ_ENTITY_TYPES = [
  "company",
  "person",
  "lead",
  "deal",
  "contract",
  "ticket",
  "meeting",
  "staff",
  "team_member",
  "privacy_request",
];
const READ_WINDOW_MS = 60 * 60_000;
const READ_NOTIFY_AT = 150;
const READ_INTERN_NOTIFY_AT = 60;
const READ_STEP_UP_AT = 300;
const READ_HOLD_AT = 600;
const READ_KEEP_DAYS = 90;

type ReadWatchRow = {
  notified_at: string | null;
  stepped_up_at: string | null;
  held_at: string | null;
  cleared_at: string | null;
  cleared_by: string;
  peak: number;
};
const recordReads: Array<{
  staff_id: string;
  entity_type: string;
  entity_id: string;
  read_at: string;
}> = [];
const readWatch = new Map<string, ReadWatchRow>();

type DecoyRow = {
  id: string;
  entity_type: "company" | "person" | "api_key";
  entity_id: string;
  label: string;
  planted_by: string;
  planted_at: string;
  last_touched_at: string | null;
  touches: number;
};
const decoyRows: DecoyRow[] = [];
const DECOY_FIRMS = [
  "Harrowgate Capital Partners",
  "Ellison Rowe Asset Management",
  "Kestrel Point Advisors",
  "Marlow & Ashby Investments",
  "Northfield Crest Capital",
];

function readNotifyAt(member: Staff): number {
  return member.role === "intern_readonly" ? READ_INTERN_NOTIFY_AT : READ_NOTIFY_AT;
}

function distinctReads(staffId: string, sinceMs: number): number {
  const seen = new Set<string>();
  for (const row of recordReads)
    if (row.staff_id === staffId && Date.parse(row.read_at) >= sinceMs)
      seen.add(`${row.entity_type}:${row.entity_id}`);
  return seen.size;
}

function readHeld(row: ReadWatchRow | undefined): boolean {
  if (!row?.held_at) return false;
  return !row.cleared_at || row.cleared_at < row.held_at;
}

function tellOwners(subject: string, body: string) {
  console.log(`[mock-hq] mail to owners: ${subject} — ${body.slice(0, 120)}`);
}

/** Mirrors read_watch.gate: refused before it is served. */
function gateRead(found: { member: Staff; session: Session }) {
  if (found.member.role !== "owner" && readHeld(readWatch.get(found.member.id)))
    return refuse(403, "forbidden", { reason: "reads-held" });
  const fresh = Boolean(found.session.sudo_until && found.session.sudo_until > now());
  if (!fresh) {
    const opened = distinctReads(found.member.id, Date.now() - READ_WINDOW_MS);
    if (opened >= READ_STEP_UP_AT)
      return refuse(403, "forbidden", { sudo_required: true, reason: "reads-volume", opened });
  }
  return null;
}

/** Mirrors decoys.spring. */
function springDecoy(
  actor: Staff | null,
  entityType: string,
  entityId: string,
  how: string,
  ip = "",
) {
  const decoy = decoyRows.find(
    (row) => row.entity_type === entityType && row.entity_id === entityId.toLowerCase(),
  );
  if (!decoy) return false;
  decoy.last_touched_at = now();
  decoy.touches += 1;
  const kind =
    how === "used" ? "decoy.key_used" : how === "exported" ? "decoy.exported" : "decoy.touched";
  const who = actor ? actor.display_name || actor.email : "someone outside HQ";
  const summary =
    how === "used"
      ? `The decoy intake key \u201c${decoy.label}\u201d was presented from ${ip || "an unknown address"}.`
      : `${who} ${how} the decoy ${entityType} \u201c${decoy.label}\u201d.`;
  recordSecurityEvent(kind, actor?.id ?? "", summary, {
    ip,
    detail: { decoy: decoy.label, entity_type: entityType, how },
  });
  tellOwners("A decoy was touched", summary);
  return true;
}

/** Mirrors read_watch.note. */
function noteRead(found: { member: Staff }, entityType: string, entityId: string, ip: string) {
  const member = found.member;
  recordReads.push({
    staff_id: member.id,
    entity_type: entityType,
    entity_id: entityId.toLowerCase(),
    read_at: now(),
  });
  springDecoy(member, entityType, entityId, "opened", ip);
  const opened = distinctReads(member.id, Date.now() - READ_WINDOW_MS);
  const watch = readWatch.get(member.id) ?? {
    notified_at: null,
    stepped_up_at: null,
    held_at: null,
    cleared_at: null,
    cleared_by: "",
    peak: 0,
  };
  watch.peak = Math.max(watch.peak, opened);
  const fresh = (at: string | null) => Boolean(at && Date.now() - Date.parse(at) < READ_WINDOW_MS);
  const who = member.display_name || member.email;
  if (opened >= readNotifyAt(member) && !fresh(watch.notified_at)) {
    watch.notified_at = now();
    recordSecurityEvent(
      "reads.volume",
      member.id,
      `${who} opened ${opened} different records in the last hour.`,
      { ip, detail: { opened, threshold: readNotifyAt(member) } },
    );
    tellOwners("A colleague is opening many records", `${who} opened ${opened} records.`);
  }
  if (opened >= READ_STEP_UP_AT && !fresh(watch.stepped_up_at)) {
    watch.stepped_up_at = now();
    recordSecurityEvent(
      "reads.step_up",
      member.id,
      `${who} passed ${READ_STEP_UP_AT} records in an hour; each further record needs a fresh code.`,
      { ip, detail: { opened } },
    );
  }
  if (opened >= READ_HOLD_AT && member.role !== "owner" && !readHeld(watch)) {
    watch.held_at = now();
    recordSecurityEvent(
      "reads.held",
      member.id,
      `${who} passed ${READ_HOLD_AT} records in an hour; reading is held until an owner clears it.`,
      { ip, detail: { opened } },
    );
    tellOwners("Reading held for a colleague", `${who} opened ${opened} records within an hour.`);
  }
  readWatch.set(member.id, watch);
}

function readWatchView(member: Staff) {
  const watch = readWatch.get(member.id);
  const opened = distinctReads(member.id, Date.now() - READ_WINDOW_MS);
  const held = readHeld(watch);
  return {
    staff_id: member.id,
    name: member.display_name || member.email,
    role: member.role,
    opened_last_hour: opened,
    notify_at: readNotifyAt(member),
    state: held
      ? "held"
      : opened >= READ_STEP_UP_AT
        ? "step_up"
        : opened >= readNotifyAt(member)
          ? "notified"
          : "normal",
    peak: watch?.peak ?? 0,
    held_at: watch?.held_at ?? null,
    cleared_at: watch?.cleared_at ?? null,
    cleared_by: watch?.cleared_by ? personOf(watch.cleared_by) : null,
  };
}

function decoyView(row: DecoyRow) {
  return {
    decoy_id: row.id,
    entity_type: row.entity_type,
    entity_id: row.entity_id,
    label: row.label,
    planted_by: personOf(row.planted_by),
    planted_at: row.planted_at,
    last_touched_at: row.last_touched_at,
    touches: row.touches,
  };
}

/** Mirrors decoys.plant_company. */
function plantDecoyCompany(firm: string, contact: string, email: string, by: string) {
  const companyId = randomUUID();
  const personId = randomUUID();
  companies.push({
    id: companyId,
    name: firm,
    domain: "",
    firm_type: "Hedge fund",
    team_size_band: "",
    country: "United Kingdom",
    lifecycle: "prospect",
    owner_staff_id: "",
    source_key: "other",
    notes: "",
    customer_since: null,
    archived: false,
    created_at: now(),
    updated_at: now(),
  });
  people.push({
    id: personId,
    company_id: companyId,
    full_name: contact,
    email,
    title: "Chief Operating Officer",
    role_category: "",
    phone: "",
    account_user_id: "",
    do_not_contact: true,
    source_key: "other",
    notes: "",
    last_contacted_at: null,
    created_at: now(),
  });
  const decoy: DecoyRow = {
    id: randomUUID(),
    entity_type: "company",
    entity_id: companyId,
    label: firm,
    planted_by: by,
    planted_at: now(),
    last_touched_at: null,
    touches: 0,
  };
  decoyRows.push(decoy, {
    id: randomUUID(),
    entity_type: "person",
    entity_id: personId,
    label: `${contact} (${firm})`,
    planted_by: by,
    planted_at: now(),
    last_touched_at: null,
    touches: 0,
  });
  return { decoy, companyId };
}

function seedReadWatch() {
  recordReads.length = 0;
  readWatch.clear();
  decoyRows.length = 0;
  // The sales persona opened 612 different records within the hour: the owners were
  // told at 150, a code was asked for at 300, and reading was held at 600, so the demo
  // can show the hold being cleared.
  const SALES = "aa000000-0000-4000-8000-00000000000c";
  for (let index = 0; index < 612; index += 1) {
    const firm = companies[index];
    recordReads.push({
      staff_id: SALES,
      entity_type: firm ? "company" : "person",
      entity_id: firm ? firm.id : `ee${String(index).padStart(6, "0")}-0000-4000-8000-000000000000`,
      read_at: agoIso(0.6 - (index / 612) * 0.4),
    });
  }
  readWatch.set(SALES, {
    notified_at: agoIso(0.55),
    stepped_up_at: agoIso(0.4),
    held_at: agoIso(0.2),
    cleared_at: null,
    cleared_by: "",
    peak: 612,
  });
  recordSecurityEvent(
    "reads.held",
    SALES,
    "Sales Person passed 600 records in an hour; reading is held until an owner clears it.",
    { occurred_at: agoIso(0.2), detail: { opened: 612 } },
  );
  // A few ordinary reads so "Viewed by" has something to say on the first company.
  const first = companies[0];
  if (first) {
    for (const [staffId, hours] of [
      ["aa000000-0000-4000-8000-00000000000c", 3],
      ["aa000000-0000-4000-8000-00000000000c", 26],
      ["aa000000-0000-4000-8000-00000000000d", 50],
    ] as const)
      recordReads.push({
        staff_id: staffId,
        entity_type: "company",
        entity_id: first.id,
        read_at: agoIso(hours),
      });
  }
  plantDecoyCompany(
    "Kestrel Point Advisors",
    "Ruth Ellery",
    "owner+decoy@quantifyterminal.com",
    "aa000000-0000-4000-8000-00000000000a",
  );
}

// --- receivables (mirrors receivables.py; money in cents here, decimal text on the wire) ----------

type BillingProfileRow = {
  company_id: string;
  legal_name: string;
  billing_address: string;
  country: string;
  state_code: string;
  tax_id: string;
  tax_treatment: string;
  ap_emails: string;
  po_required: boolean;
  po_number: string;
  po_amount_cents: number | null;
  po_expires_on: string | null;
  portal_instructions: string;
  payment_terms_days: number;
  invoice_currency: string;
  withholds_tax: boolean;
  withholding_rate_bp: number | null;
  updated_at: string;
};
type InvoiceRow = {
  id: string;
  company_id: string;
  contract_id: string;
  number: string;
  issued_on: string;
  period_start: string | null;
  period_end: string | null;
  due_on: string;
  currency: string;
  net_cents: number;
  tax_cents: number;
  po_number: string;
  status: string;
  collection_state: string;
  reminders_sent: number;
  last_reminder_at: string | null;
  promised_on: string | null;
  promised_cents: number | null;
  dispute_reason: string;
  void_reason: string;
  paid_on: string | null;
  notes: string;
};
type ReceiptRow = {
  id: string;
  company_id: string;
  received_on: string;
  currency: string;
  amount_cents: number;
  charges_cents: number;
  withheld_cents: number;
  certificate_received_on: string | null;
  bank_reference: string;
  notes: string;
};
const billingProfiles = new Map<string, BillingProfileRow>();
const invoicesRx: InvoiceRow[] = [];
const receiptsRx: ReceiptRow[] = [];
const allocationsRx: Array<{ receipt_id: string; invoice_id: string; cents: number }> = [];
const invoiceEvents: Array<{
  invoice_id: string;
  kind: string;
  detail: string;
  staff_id: string;
  at: string;
}> = [];
const RX_BUCKETS: Array<[string, string, number, number | null]> = [
  ["current", "Not yet due", -10_000, 0],
  ["1_30", "1–30 days", 1, 30],
  ["31_60", "31–60 days", 31, 60],
  ["61_90", "61–90 days", 61, 90],
  ["90_plus", "Over 90 days", 91, null],
];
const RX_REMINDER_OFFSETS = [-7, 0, 7, 14, 30];
const RX_TREATMENTS: Record<string, string> = {
  uk_standard: "UK VAT, standard rate",
  outside_scope: "Outside the scope of UK VAT (overseas business)",
  eu_reverse_charge: "EU business, reverse charge",
  gst_intra: "India GST, same state (CGST + SGST)",
  gst_inter: "India GST, another state (IGST)",
  export_lut: "Export of services under a Letter of Undertaking",
  other: "Other",
};

function cents(value: unknown): number {
  const text = String(value ?? "").trim() || "0";
  if (!/^-?\d+(\.\d{1,2})?$/.test(text)) return NaN;
  return Math.round(Number(text) * 100);
}
function centsText(value: number): string {
  return (value / 100).toFixed(2);
}
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
function addDaysIso(day: string, days: number): string {
  const at = new Date(`${day}T00:00:00Z`);
  at.setUTCDate(at.getUTCDate() + days);
  return at.toISOString().slice(0, 10);
}
function addMonthsIso(day: string, months: number): string {
  const [y, m, d] = day.split("-").map(Number) as [number, number, number];
  const index = m - 1 + months;
  const year = y + Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12;
  const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(d, last))).toISOString().slice(0, 10);
}
function rxDaysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}
function allocatedCents(invoiceId: string): number {
  return allocationsRx
    .filter((row) => row.invoice_id === invoiceId)
    .reduce((total, row) => total + row.cents, 0);
}
function owedCents(row: InvoiceRow): number {
  if (row.status === "void" || row.status === "uncollectible") return 0;
  return Math.max(0, row.net_cents + row.tax_cents - allocatedCents(row.id));
}
function rxStatus(row: InvoiceRow): string {
  if (row.status === "void" || row.status === "uncollectible") return row.status;
  const paid = allocatedCents(row.id);
  if (paid >= row.net_cents + row.tax_cents) return "paid";
  return paid > 0 ? "partially_paid" : "open";
}
function rxBucket(days: number): string {
  for (const [key, , low, high] of RX_BUCKETS)
    if (days >= low && (high === null || days <= high)) return key;
  return "current";
}
function rxReminder(row: InvoiceRow) {
  const owed = owedCents(row);
  if (owed <= 0 || !["open", "partially_paid"].includes(rxStatus(row))) return null;
  if (["disputed", "escalated", "written_off"].includes(row.collection_state)) return null;
  if (
    row.collection_state === "promised" &&
    row.promised_on &&
    todayIso() <= addDaysIso(row.promised_on, 3)
  )
    return null;
  if (row.reminders_sent >= RX_REMINDER_OFFSETS.length) return null;
  const ahead = RX_REMINDER_OFFSETS.map((offset, index) => [index, offset] as const).slice(
    row.reminders_sent,
  );
  const passed = ahead.filter(([, offset]) => addDaysIso(row.due_on, offset) <= todayIso());
  const [index, offset] = passed.length ? passed[passed.length - 1]! : ahead[0]!;
  const on = addDaysIso(row.due_on, offset);
  return { offset, on, due_now: todayIso() >= on, number: row.reminders_sent + 1, step: index + 1 };
}
function rxExportFlag(row: InvoiceRow): string {
  const profile = billingProfiles.get(row.company_id);
  if (owedCents(row) <= 0 || profile?.tax_treatment !== "export_lut") return "";
  const deadline = addMonthsIso(row.issued_on, 9);
  if (todayIso() >= addMonthsIso(row.issued_on, 8))
    return `Export proceeds must be received by ${deadline} — under a month left.`;
  if (todayIso() >= addMonthsIso(row.issued_on, 6))
    return `Export proceeds must be received by ${deadline}.`;
  return "";
}
function rxReliefFrom(row: InvoiceRow): string | null {
  const supply = row.period_end ?? row.issued_on;
  return addMonthsIso(row.due_on > supply ? row.due_on : supply, 6);
}
function companyName(id: string): string {
  return companies.find((row) => row.id === id)?.name ?? "";
}
function invoiceViewRx(row: InvoiceRow) {
  const owed = owedCents(row);
  const days = rxDaysBetween(row.due_on, todayIso());
  return {
    invoice_id: row.id,
    company: { company_id: row.company_id, name: companyName(row.company_id) },
    contract_id: row.contract_id,
    number: row.number,
    issued_on: row.issued_on,
    period_start: row.period_start,
    period_end: row.period_end,
    due_on: row.due_on,
    currency: row.currency,
    net: centsText(row.net_cents),
    tax: centsText(row.tax_cents),
    gross: centsText(row.net_cents + row.tax_cents),
    paid: centsText(allocatedCents(row.id)),
    outstanding: centsText(owed),
    status: rxStatus(row),
    collection_state: row.collection_state,
    days_past_due: owed > 0 ? days : 0,
    bucket: owed > 0 ? rxBucket(days) : "",
    po_number: row.po_number,
    reminders_sent: row.reminders_sent,
    last_reminder_at: row.last_reminder_at,
    next_reminder: rxReminder(row),
    promised_on: row.promised_on,
    promised_amount: row.promised_cents === null ? null : centsText(row.promised_cents),
    dispute_reason: row.dispute_reason,
    void_reason: row.void_reason,
    paid_on: row.paid_on,
    export_flag: rxExportFlag(row),
    bad_debt_relief_from: row.collection_state === "written_off" ? rxReliefFrom(row) : null,
    notes: row.notes,
  };
}
function rxGaps(profile: BillingProfileRow | undefined): string[] {
  if (!profile)
    return ["No billing profile yet: the legal name and address an invoice must carry."];
  const gaps: string[] = [];
  if (!profile.legal_name.trim()) gaps.push("The legal entity's name");
  if (!profile.billing_address.trim()) gaps.push("The billing address");
  if (!profile.country.trim()) gaps.push("The country");
  if (!profile.tax_treatment) gaps.push("How the invoice is taxed");
  if (
    ["eu_reverse_charge", "gst_intra", "gst_inter"].includes(profile.tax_treatment) &&
    !profile.tax_id.trim()
  )
    gaps.push(
      "The customer's tax number (VAT number or GSTIN), which this treatment needs on the invoice",
    );
  if (["gst_intra", "gst_inter"].includes(profile.tax_treatment) && !profile.state_code.trim())
    gaps.push("The state code for the place of supply");
  if (profile.po_required && !profile.po_number.trim())
    gaps.push(
      "A purchase order number — this customer's accounts team rejects invoices without one",
    );
  if (!profile.ap_emails.trim())
    gaps.push("Where invoices and reminders go (the accounts payable address)");
  return gaps;
}
function profileViewRx(companyId: string) {
  const row = billingProfiles.get(companyId);
  return {
    company_id: companyId,
    exists: Boolean(row),
    legal_name: row?.legal_name ?? "",
    billing_address: row?.billing_address ?? "",
    country: row?.country ?? "",
    state_code: row?.state_code ?? "",
    tax_id: row?.tax_id ?? "",
    tax_treatment: row?.tax_treatment ?? "",
    ap_emails: row?.ap_emails ?? "",
    po_required: row?.po_required ?? false,
    po_number: row?.po_number ?? "",
    po_amount:
      row?.po_amount_cents === null || row?.po_amount_cents === undefined
        ? null
        : centsText(row.po_amount_cents),
    po_expires_on: row?.po_expires_on ?? null,
    portal_instructions: row?.portal_instructions ?? "",
    payment_terms_days: row?.payment_terms_days ?? 30,
    invoice_currency: row?.invoice_currency ?? "USD",
    withholds_tax: row?.withholds_tax ?? false,
    withholding_rate_percent:
      row?.withholding_rate_bp === null || row?.withholding_rate_bp === undefined
        ? null
        : row.withholding_rate_bp / 100,
    updated_at: row?.updated_at ?? null,
    gaps: rxGaps(row),
  };
}
function receiptViewRx(row: ReceiptRow) {
  const mine = allocationsRx.filter((item) => item.receipt_id === row.id);
  const applied = mine.reduce((total, item) => total + item.cents, 0);
  return {
    receipt_id: row.id,
    company: { company_id: row.company_id, name: companyName(row.company_id) },
    received_on: row.received_on,
    currency: row.currency,
    amount: centsText(row.amount_cents),
    bank_charges: centsText(row.charges_cents),
    tax_withheld: centsText(row.withheld_cents),
    certificate_received_on: row.certificate_received_on,
    bank_reference: row.bank_reference,
    notes: row.notes,
    allocations: mine.map((item) => ({
      invoice_id: item.invoice_id,
      number: invoicesRx.find((invoice) => invoice.id === item.invoice_id)?.number ?? "",
      amount: centsText(item.cents),
    })),
    unapplied: centsText(
      Math.max(0, row.amount_cents + row.charges_cents + row.withheld_cents - applied),
    ),
  };
}
function rxEvent(invoiceId: string, kind: string, detail: string, staffId: string) {
  invoiceEvents.push({ invoice_id: invoiceId, kind, detail, staff_id: staffId, at: now() });
}
function rxSchedule() {
  const today = todayIso();
  const horizon = addDaysIso(today, 30);
  const tracked = invoicesRx.map((row) => row.issued_on).sort()[0] ?? null;
  const billed = new Set(
    invoicesRx
      .filter((row) => row.contract_id && row.status !== "void")
      .map((row) => `${row.contract_id}|${row.period_start}`),
  );
  const toBill: Array<Record<string, unknown>> = [];
  const late: Array<Record<string, unknown>> = [];
  for (const contract of contracts) {
    if (contract.status !== "active") continue;
    const annual = contract.billing_cadence === "annual";
    const step = annual ? 12 : 1;
    for (let index = 0; index < 600; index += 1) {
      const period = addMonthsIso(contract.starts_on, step * index);
      if (period > horizon) break;
      if (contract.ends_on && period >= contract.ends_on) break;
      if (billed.has(`${contract.id}|${period}`)) continue;
      const item = {
        contract_id: contract.id,
        company_id: contract.company_id,
        company_name: companyName(contract.company_id),
        plan_name: contract.plan_name,
        period_start: period,
        period_end: addDaysIso(addMonthsIso(contract.starts_on, step * (index + 1)), -1),
        currency: contract.currency,
        amount: centsText(contract.mrr_cents * (annual ? 12 : 1)),
        cadence: annual ? "annual" : "monthly",
      };
      if (period > today) toBill.push(item);
      else if (tracked && period >= tracked && period <= addDaysIso(today, -3))
        late.push({ ...item, days_late: rxDaysBetween(period, today) });
    }
  }
  toBill.sort((a, b) => String(a.period_start).localeCompare(String(b.period_start)));
  late.sort((a, b) => String(a.period_start).localeCompare(String(b.period_start)));
  return { to_bill: toBill, billed_late: late, tracked_from: tracked };
}

/**
 * Every active contract invoiced for each period since recording began 95 days ago —
 * older ones paid, the latest open — with a few stories on top: reminded and late,
 * promised, part-paid with India's tax withheld, disputed; and two periods deliberately
 * left unbilled, which is what "billed late" exists to catch.
 */
function seedReceivables() {
  billingProfiles.clear();
  invoicesRx.length = 0;
  receiptsRx.length = 0;
  allocationsRx.length = 0;
  invoiceEvents.length = 0;
  const OWNER = "aa000000-0000-4000-8000-00000000000a";
  const today = todayIso();
  const recordingBegan = addDaysIso(today, -95);
  const active = contracts.filter((row) => row.status === "active");
  let serial = 400;
  // Stories are dealt only to contracts with an invoice already past due (and the skipped
  // periods only to monthly ones), so every story shows whatever the contract mix is.
  let worked = 0;
  let monthly = 0;
  active.forEach((contract, index) => {
    const company = companies.find((row) => row.id === contract.company_id);
    if (!company) return;
    const terms = index === 0 ? 45 : 30;
    const annual = contract.billing_cadence === "annual";
    const step = annual ? 12 : 1;
    const amount = contract.mrr_cents * (annual ? 12 : 1);
    const periods: string[] = [];
    for (let n = 0; n < 600; n += 1) {
      const period = addMonthsIso(contract.starts_on, step * n);
      if (period > today) break;
      if (contract.ends_on && period >= contract.ends_on) break;
      if (period >= recordingBegan) periods.push(period);
    }
    // The stories sit on the latest invoice already past its due date.
    const lastOverdue = periods
      .map((period) => addDaysIso(period, terms) < today)
      .lastIndexOf(true);
    const storyIndex = lastOverdue >= 0 ? worked++ : -1;
    // Two periods nobody invoiced: the 3rd and 9th monthly contracts miss the latest one that
    // began at least three days ago — the "billed late" the schedule exists to catch.
    const monthlyIndex = annual ? -1 : monthly++;
    const skipIndex =
      monthlyIndex === 3 || monthlyIndex === 9
        ? periods.map((period) => period <= addDaysIso(today, -3)).lastIndexOf(true)
        : -1;
    const india = storyIndex === 4;
    billingProfiles.set(contract.company_id, {
      company_id: contract.company_id,
      legal_name: index === 3 ? "" : `${company.name}${index % 2 ? " LLP" : " Ltd"}`,
      billing_address: index === 3 ? "" : `${10 + (index % 40)} Finsbury Circus, London EC2M 7EB`,
      country: india ? "India" : company.country || "United Kingdom",
      state_code: india ? "27" : "",
      tax_id: india ? "27AABCU9603R1ZM" : "",
      tax_treatment: india ? "gst_inter" : index === 2 ? "eu_reverse_charge" : "outside_scope",
      ap_emails: index === 3 ? "" : `accounts@${company.domain || "example.test"}`,
      po_required: index === 1,
      po_number: "",
      po_amount_cents: null,
      po_expires_on: null,
      portal_instructions:
        index === 5 ? "Upload to their supplier portal as well as mailing it." : "",
      payment_terms_days: terms,
      invoice_currency: contract.currency,
      withholds_tax: india,
      withholding_rate_bp: india ? 1000 : null,
      updated_at: agoIso(24 * 20),
    });
    periods.forEach((period, position) => {
      if (position === skipIndex) return;
      const latest = position === lastOverdue;
      serial += 1;
      const row: InvoiceRow = {
        id: `ab${String(serial).padStart(6, "0")}-0000-4000-8000-000000000000`,
        company_id: contract.company_id,
        contract_id: contract.id,
        number: `QT-2026-${String(serial).padStart(4, "0")}`,
        issued_on: period,
        period_start: period,
        period_end: addDaysIso(addMonthsIso(period, step), -1),
        due_on: addDaysIso(period, terms),
        currency: contract.currency,
        net_cents: amount,
        tax_cents: 0,
        po_number: "",
        status: "open",
        collection_state: "none",
        reminders_sent: 0,
        last_reminder_at: null,
        promised_on: null,
        promised_cents: null,
        dispute_reason: "",
        void_reason: "",
        paid_on: null,
        notes: "",
      };
      invoicesRx.push(row);
      invoiceEvents.push({
        invoice_id: row.id,
        kind: "recorded",
        detail: `Recorded as issued on ${period}, due ${row.due_on}.`,
        staff_id: OWNER,
        at: `${period}T09:00:00Z`,
      });
      const overdue = row.due_on < today;
      // The story for this row: the first contracts' latest overdue invoices are worked.
      const story = !overdue
        ? "open"
        : latest && storyIndex === 0
          ? "late"
          : latest && storyIndex === 1
            ? "promised"
            : latest && storyIndex === 4
              ? "part"
              : latest && storyIndex === 6
                ? "disputed"
                : latest && storyIndex % 5 === 2
                  ? "late"
                  : "paid";
      if (story === "paid" || story === "part") {
        const received = addDaysIso(row.due_on, story === "paid" ? -2 : 3);
        if (received > today) return;
        const withheld = india ? Math.round(amount * 0.1) : 0;
        const settled = story === "paid" ? amount : Math.round(amount / 2);
        const receipt: ReceiptRow = {
          id: `ac${String(serial).padStart(6, "0")}-0000-4000-8000-000000000000`,
          company_id: contract.company_id,
          received_on: received,
          currency: contract.currency,
          amount_cents: settled - withheld,
          charges_cents: 0,
          withheld_cents: withheld,
          certificate_received_on: india && position === 0 ? addDaysIso(received, 40) : null,
          bank_reference: `WIRE-${row.number.slice(-4)}`,
          notes: "",
        };
        receiptsRx.push(receipt);
        allocationsRx.push({ receipt_id: receipt.id, invoice_id: row.id, cents: settled });
        row.status = story === "paid" ? "paid" : "partially_paid";
        if (story === "paid") row.paid_on = received;
        invoiceEvents.push({
          invoice_id: row.id,
          kind: "payment",
          detail: `${row.currency} ${centsText(settled)} from a receipt of ${received}${story === "paid" ? ". Paid in full." : "."}`,
          staff_id: OWNER,
          at: `${received}T10:00:00Z`,
        });
      } else if (story === "late") {
        row.reminders_sent = 2;
        row.collection_state = "reminded";
        row.last_reminder_at = `${row.due_on}T09:30:00Z`;
        invoiceEvents.push({
          invoice_id: row.id,
          kind: "send_reminder",
          detail: `Reminder 2 sent to accounts@${company.domain || "example.test"}: Invoice ${row.number} due today`,
          staff_id: OWNER,
          at: `${row.due_on}T09:30:00Z`,
        });
      } else if (story === "promised") {
        row.collection_state = "promised";
        row.promised_on = addDaysIso(today, 4);
        row.promised_cents = amount;
        invoiceEvents.push({
          invoice_id: row.id,
          kind: "promise",
          detail: `Promised ${row.currency} ${centsText(amount)} by ${row.promised_on}. Reminders pause until then.`,
          staff_id: OWNER,
          at: agoIso(26),
        });
      } else if (story === "disputed") {
        row.collection_state = "disputed";
        row.dispute_reason = "They say two seats were removed in August";
        invoiceEvents.push({
          invoice_id: row.id,
          kind: "dispute",
          detail:
            "Disputed: They say two seats were removed in August. Reminders pause until it is resumed.",
          staff_id: OWNER,
          at: agoIso(50),
        });
      }
    });
  });
}

// --- customer success (mirrors success.py and success_routes.py) -----------------------------------

const CS_SIGNALS: Record<string, string> = {
  unlinked: "No product accounts linked",
  no_sign_in: "Nobody signing in",
  seat_use_low: "Seats going unused",
  renewal_risk: "Renewal at risk",
  no_contact: "No contact",
  near_limit: "Near the seat limit",
};
const CS_REQUEST_STATUSES: Record<string, string> = {
  open: "Open",
  planned: "Planned",
  building: "Building",
  shipped: "Shipped",
  declined: "Declined",
};
const CS_SOURCES = ["call", "meeting", "ticket", "email", "other"];
const CS_IMPORTANCE: Record<string, string> = {
  nice: "Nice to have",
  important: "Important",
  blocker: "Blocks them",
};
const CS_STEPS = [
  "Kickoff call booked",
  "Accounts created for every paid seat",
  "Data sources and watchlists set up",
  "First research workflow run together",
  "Week-two review",
];
const CS_PLAYBOOK: Array<[number, string]> = [
  [90, "Read the firm's signals and usage before the renewal conversation"],
  [60, "Renewal conversation: what worked, what they need next year"],
  [30, "Send the renewal terms in writing"],
  [7, "Confirm their answer; escalate if none"],
  [0, "Notice deadline: after today they renew on the current terms"],
];

type FeatureRequestRow = {
  id: string;
  title: string;
  description: string;
  status: string;
  shipped_on: string | null;
  declined_reason: string;
  owner_staff_id: string;
  created_at: string;
};
type FeatureAskRow = {
  id: string;
  request_id: string;
  company_id: string;
  person_id: string;
  source: string;
  quote: string;
  importance: string;
  deal_id: string;
  recorded_by: string;
  recorded_at: string;
  notified_at: string | null;
};
type OnboardingRow = {
  id: string;
  company_id: string;
  contract_id: string;
  owner_staff_id: string;
  starts_on: string;
  kickoff_on: string | null;
  first_sign_in_on: string | null;
  live_on: string | null;
  target_live_on: string | null;
  status: string;
  notes: string;
};
type OnboardingStepRow = {
  id: string;
  onboarding_id: string;
  position: number;
  title: string;
  due_on: string | null;
  done_on: string | null;
};

const featureRequests: FeatureRequestRow[] = [];
const featureAsks: FeatureAskRow[] = [];
const onboardings: OnboardingRow[] = [];
const onboardingSteps: OnboardingStepRow[] = [];
/** The last sign-in of each product account linked to a firm (null: never). */
const csLogins = new Map<string, Array<string | null>>();

function csActiveContracts(): Map<string, ContractRow[]> {
  const by = new Map<string, ContractRow[]>();
  for (const row of contracts) {
    if (row.status !== "active" || (row.ends_on && row.ends_on < today())) continue;
    by.set(row.company_id, [...(by.get(row.company_id) ?? []), row]);
  }
  return by;
}
function csNoticeDate(row: {
  renews_on: string | null;
  notice_days?: number | null;
}): string | null {
  if (!row.renews_on) return null;
  return row.notice_days !== null && row.notice_days !== undefined
    ? addDaysIso(row.renews_on, -row.notice_days)
    : row.renews_on;
}
function csUsage(seats: number, logins: Array<string | null>) {
  const cutoff = Date.now() - 30 * 86_400_000;
  const active = logins.filter((at) => at && Date.parse(at) >= cutoff).length;
  const latest =
    logins
      .filter((at): at is string => Boolean(at))
      .sort()
      .at(-1) ?? null;
  return {
    seats_paid: seats,
    accounts: logins.length,
    active_30d: active,
    last_sign_in: latest,
    live: seats > 0 && active >= 0.8 * seats,
  };
}
function csSignals(
  seats: number,
  logins: Array<string | null>,
  renewsOn: string | null,
  renewalStatus: string,
  lastContact: string | null,
) {
  const found: Array<{ key: string; label: string; rule: string; evidence: string }> = [];
  const nowMs = Date.now();
  const usage = csUsage(seats, logins);
  if (logins.length === 0) {
    found.push({
      key: "unlinked",
      label: "",
      rule: "No product account is linked to this firm.",
      evidence: "Link the accounts on the company page so usage can be read.",
    });
  } else {
    if (!usage.last_sign_in || nowMs - Date.parse(usage.last_sign_in) > 14 * 86_400_000)
      found.push({
        key: "no_sign_in",
        label: "",
        rule: "No linked account has signed in for 14 days.",
        evidence: usage.last_sign_in
          ? `Last sign-in ${pvDay(usage.last_sign_in)}.`
          : "No linked account has ever signed in.",
      });
    if (seats > 0 && usage.active_30d / seats < 0.5)
      found.push({
        key: "seat_use_low",
        label: "",
        rule: "Fewer than half the paid seats signed in within 30 days.",
        evidence: `${usage.active_30d} of ${seats} paid seats signed in within 30 days.`,
      });
    if (seats > 0 && logins.length >= 0.9 * seats)
      found.push({
        key: "near_limit",
        label: "",
        rule: "Linked accounts at 90 % or more of the seats paid for.",
        evidence: `${logins.length} accounts on ${seats} paid seats.`,
      });
  }
  if (renewsOn) {
    const inDays = rxDaysBetween(today(), renewsOn);
    if (inDays >= 0 && inDays <= 90 && (renewalStatus === "" || renewalStatus === "at_risk"))
      found.push({
        key: "renewal_risk",
        label: "",
        rule: "Renews within 90 days and the renewal is at risk or not yet called.",
        evidence: `Renews ${pvDay(renewsOn)} (${inDays} days); ${renewalStatus === "at_risk" ? "marked at risk." : "no renewal call recorded."}`,
      });
  }
  if (!lastContact || nowMs - Date.parse(lastContact) > 30 * 86_400_000)
    found.push({
      key: "no_contact",
      label: "",
      rule: "Nothing logged with the firm for 30 days.",
      evidence: lastContact ? `Last logged ${pvDay(lastContact)}.` : "Nothing logged yet.",
    });
  const order = Object.keys(CS_SIGNALS);
  return found
    .map((item) => ({ ...item, label: CS_SIGNALS[item.key]! }))
    .sort((a, b) => order.indexOf(a.key) - order.indexOf(b.key));
}
function csLastContact(companyId: string): string | null {
  return (
    activities
      .filter((row) => row.company_id === companyId)
      .map((row) => row.at)
      .sort()
      .at(-1) ?? null
  );
}
function csCustomerView(companyId: string, rows: ContractRow[], moneyOk: boolean) {
  const company = companies.find((row) => row.id === companyId);
  const seats = rows.reduce((total, row) => total + row.seats, 0);
  const renewing = rows
    .filter((row) => row.renews_on)
    .sort((a, b) => a.renews_on!.localeCompare(b.renews_on!));
  const next = renewing[0];
  const logins = csLogins.get(companyId) ?? [];
  const mrr: Record<string, string> = {};
  if (moneyOk) {
    const totals: Record<string, number> = {};
    for (const row of rows) totals[row.currency] = (totals[row.currency] ?? 0) + row.mrr_cents;
    for (const [code, cents] of Object.entries(totals).sort()) mrr[code] = centsText(cents);
  }
  return {
    company: { id: companyId, name: company?.name ?? "" },
    owner: staff.find((member) => member.id === company?.owner_staff_id)?.display_name ?? "",
    mrr,
    usage: csUsage(seats, logins),
    renews_on: next?.renews_on ?? null,
    notice_date: next ? csNoticeDate(next) : null,
    renewal_status: next?.renewal_status ?? "",
    signals: csSignals(
      seats,
      logins,
      next?.renews_on ?? null,
      next?.renewal_status ?? "",
      csLastContact(companyId),
    ),
  };
}
function csRollup(request: FeatureRequestRow, moneyOk: boolean) {
  const asks = featureAsks.filter((ask) => ask.request_id === request.id);
  const firms = new Set(asks.map((ask) => ask.company_id).filter(Boolean));
  const active = csActiveContracts();
  const mrr: Record<string, number> = {};
  for (const firm of firms)
    for (const row of active.get(firm) ?? [])
      mrr[row.currency] = (mrr[row.currency] ?? 0) + row.mrr_cents;
  const blocked = new Set(asks.map((ask) => ask.deal_id).filter(Boolean));
  const pipeline: Record<string, number> = {};
  let openDeals = 0;
  for (const deal of deals) {
    if (deal.status !== "open") continue;
    if (blocked.has(deal.id) || firms.has(deal.company_id)) {
      pipeline[deal.currency] = (pipeline[deal.currency] ?? 0) + Math.round(deal.mrr_amount * 100);
      openDeals += 1;
    }
  }
  const text = (values: Record<string, number>) =>
    Object.fromEntries(
      Object.entries(values)
        .sort()
        .map(([code, cents]) => [code, centsText(cents)]),
    );
  return {
    asks: asks.length,
    firms: firms.size,
    blockers: asks.filter((ask) => ask.importance === "blocker").length,
    deals_blocked: blocked.size,
    open_deals: openDeals,
    mrr: moneyOk ? text(mrr) : {},
    pipeline: moneyOk ? text(pipeline) : {},
  };
}
function csRequestView(row: FeatureRequestRow, moneyOk: boolean) {
  const owner = staff.find((member) => member.id === row.owner_staff_id);
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    status_label: CS_REQUEST_STATUSES[row.status] ?? row.status,
    shipped_on: row.shipped_on,
    declined_reason: row.declined_reason,
    owner: owner ? { id: owner.id, name: owner.display_name } : null,
    created_at: row.created_at,
    ...csRollup(row, moneyOk),
  };
}
function csOnboardingView(row: OnboardingRow) {
  const steps = onboardingSteps
    .filter((step) => step.onboarding_id === row.id)
    .sort((a, b) => a.position - b.position);
  const gap = (a: string | null, b: string | null) => (a && b ? rxDaysBetween(a, b) : null);
  const owner = staff.find((member) => member.id === row.owner_staff_id);
  return {
    id: row.id,
    company: { id: row.company_id, name: companyName(row.company_id) },
    contract_id: row.contract_id,
    owner: owner ? { id: owner.id, name: owner.display_name } : null,
    starts_on: row.starts_on,
    kickoff_on: row.kickoff_on,
    first_sign_in_on: row.first_sign_in_on,
    live_on: row.live_on,
    target_live_on: row.target_live_on,
    status: row.status,
    notes: row.notes,
    durations: {
      to_kickoff: gap(row.starts_on, row.kickoff_on),
      to_first_sign_in: gap(row.kickoff_on ?? row.starts_on, row.first_sign_in_on),
      to_live: gap(row.first_sign_in_on ?? row.kickoff_on ?? row.starts_on, row.live_on),
      total: gap(row.starts_on, row.live_on),
    },
    steps: steps.map((step) => ({
      id: step.id,
      title: step.title,
      due_on: step.due_on,
      done_on: step.done_on,
    })),
    steps_done: steps.filter((step) => step.done_on).length,
  };
}

/**
 * A customer book with something to read: sign-ins per firm (some quiet, some near their
 * seat limit, a few never linked), notice periods on some contracts, requests with asks
 * from real firms (one shipped, one blocking a deal), and onboardings at each stage.
 */
function seedSuccess() {
  featureRequests.length = 0;
  featureAsks.length = 0;
  onboardings.length = 0;
  onboardingSteps.length = 0;
  csLogins.clear();
  const OWNER = "aa000000-0000-4000-8000-00000000000a";
  const SALES = "aa000000-0000-4000-8000-00000000000c";
  const SUPPORT = "aa000000-0000-4000-8000-00000000000d";
  const active = csActiveContracts();
  [...active.entries()].forEach(([companyId, rows], index) => {
    const seats = rows.reduce((total, row) => total + row.seats, 0);
    // Most firms are touched: a check-in logged within the last few weeks.
    if (
      index % 4 !== 0 &&
      !activities.some((row) => row.company_id === companyId && row.body.startsWith("Check-in:"))
    )
      activities.push({
        kind: "call",
        at: agoIso(24 * (3 + ((index * 5) % 24))),
        staff_id: index % 2 ? SALES : SUPPORT,
        staff_name: index % 2 ? "Sales Person" : "Desk Person",
        body: "Check-in: usage and anything they need from us.",
        company_id: companyId,
        person_id: "",
        deal_id: "",
        lead_id: "",
      });
    if (index % 13 === 12) return; // never linked
    // Accounts linked: from 60 % to all of the seats paid for.
    const accounts = Math.max(1, Math.round(seats * (0.6 + (index % 5) * 0.1)));
    const logins: Array<string | null> = [];
    for (let n = 0; n < accounts; n += 1) {
      if (index % 11 === 3)
        logins.push(agoIso(24 * (18 + n))); // gone quiet
      else if (index % 7 === 5 && n > 0)
        logins.push(n % 2 ? agoIso(24 * (40 + n)) : null); // seats unused
      else logins.push(agoIso(2 + ((index * 7 + n * 13) % 96)));
    }
    csLogins.set(companyId, logins);
    rows.forEach((row, position) => {
      if (position === 0 && index % 3 === 0) row.notice_days = 30;
      if (position === 0 && index % 5 === 1) row.notice_days = 60;
    });
  });

  const customers = [...active.keys()];
  const firstDeal = deals.find((deal) => deal.status === "open");
  const requestsSeed: Array<[string, string, string]> = [
    [
      "Fixed-income coverage with ten years of history",
      "Bonds and credit alongside equities, with the same filings workflow.",
      "planned",
    ],
    [
      "Excel add-in that refreshes from a watchlist",
      "Pull prices and filings into a workbook without copying by hand.",
      "building",
    ],
    [
      "Single sign-on through the firm's identity provider",
      "SAML for firms whose security team will not allow passwords.",
      "open",
    ],
    [
      "Shared notes on a company across the desk",
      "One research note per company that the whole desk edits.",
      "shipped",
    ],
  ];
  requestsSeed.forEach(([title, description, status], index) => {
    const id = `ce00000${index + 1}-0000-4000-8000-000000000000`;
    featureRequests.push({
      id,
      title,
      description,
      status,
      shipped_on: status === "shipped" ? addDaysIso(today(), -12) : null,
      declined_reason: "",
      owner_staff_id: index % 2 ? SALES : OWNER,
      created_at: agoIso(24 * (60 - index * 9)),
    });
    const askers = customers.slice(index * 3, index * 3 + 3 + (index === 0 ? 2 : 0));
    askers.forEach((companyId, position) => {
      const person = people.find((row) => row.company_id === companyId && row.email);
      featureAsks.push({
        id: randomUUID(),
        request_id: id,
        company_id: companyId,
        person_id: person?.id ?? "",
        source: CS_SOURCES[(index + position) % CS_SOURCES.length]!,
        quote: [
          [
            "We cannot move the whole desk until bonds are in.",
            "Credit research is half our coverage; without it we keep the old terminal.",
            "Ten years of history or the backtests are meaningless.",
            "Our fixed-income desk would take ten seats tomorrow.",
            "Bonds alongside equities is the whole point for us.",
          ],
          [
            "Our analysts live in Excel; this would save them an hour a day.",
            "We rebuild the same workbook every Monday from copied prices.",
            "If it refreshed from a watchlist we would drop our data macro.",
          ],
          [
            "Security will not sign off on passwords.",
            "Our identity team requires SAML for every vendor.",
            "Onboarding waits on single sign-on; it is policy.",
          ],
          [
            "We keep duplicating notes in three places.",
            "The PMs want one note per company the whole desk edits.",
            "Shared notes would replace our research wiki.",
          ],
        ][index]![position % (index === 0 ? 5 : 3)]!,
        importance: position === 0 && index === 0 ? "blocker" : position % 2 ? "nice" : "important",
        deal_id: index === 0 && position === 0 && firstDeal ? firstDeal.id : "",
        recorded_by: position % 2 ? SUPPORT : SALES,
        recorded_at: agoIso(24 * (50 - index * 8 - position)),
        notified_at: status === "shipped" ? agoIso(24 * 11) : null,
      });
    });
  });

  // Onboardings: the newest customers, at each stage.
  const newest = [...active.entries()]
    .map(([companyId, rows]) => ({
      companyId,
      rows,
      starts: rows.map((row) => row.starts_on).sort()[0]!,
    }))
    .sort((a, b) => b.starts.localeCompare(a.starts))
    .slice(0, 4);
  newest.forEach((item, index) => {
    if (index === 3) return; // one recent customer with none started, to show the prompt
    const id = `cd00000${index + 1}-0000-4000-8000-000000000000`;
    const kickoff = index >= 0 ? addDaysIso(item.starts, 3 + index) : null;
    const first = index >= 1 ? addDaysIso(item.starts, 6 + index) : null;
    const live = index === 2 ? addDaysIso(item.starts, 24) : null;
    onboardings.push({
      id,
      company_id: item.companyId,
      contract_id: item.rows[0]!.id,
      owner_staff_id: index === 1 ? SUPPORT : SALES,
      starts_on: item.starts,
      kickoff_on: kickoff && kickoff <= today() ? kickoff : null,
      first_sign_in_on: first && first <= today() ? first : null,
      live_on: live && live <= today() ? live : null,
      target_live_on: addDaysIso(item.starts, 30),
      status: live && live <= today() ? "live" : "active",
      notes: "",
    });
    CS_STEPS.forEach((title, position) =>
      onboardingSteps.push({
        id: `cd0${index + 1}0${position + 1}00-0000-4000-8000-000000000000`,
        onboarding_id: id,
        position,
        title,
        due_on: addDaysIso(item.starts, 3 + position * 5),
        // Done only when that day has come: a customer starting today has done nothing yet.
        done_on:
          position < 2 + index && addDaysIso(item.starts, 3 + position * 4) <= today()
            ? addDaysIso(item.starts, 3 + position * 4)
            : null,
      }),
    );
  });
}

// --- pipeline inspection (mirrors inspection.py and inspection_routes.py) --------------------------

const IN_CATEGORIES: Record<string, string> = {
  pipeline: "Pipeline",
  best_case: "Best case",
  commit: "Commit",
  closed: "Closed",
  omitted: "Omitted",
};
const IN_SETTABLE = ["pipeline", "best_case", "commit", "omitted"];
const IN_RANK: Record<string, number> = {
  omitted: 0,
  pipeline: 1,
  best_case: 2,
  commit: 3,
  closed: 4,
};
const IN_REASONS: Record<string, string> = {
  won: "Won",
  lost: "Lost",
  new: "New",
  pushed: "Pushed",
  pulled_in: "Pulled in",
  category_up: "Moved up a category",
  category_down: "Moved down a category",
  increased: "Increased",
  decreased: "Decreased",
  stage_moved: "Moved stage",
};
const IN_DRIVERS: Record<string, string> = {
  data_coverage: "Data coverage",
  product_fit: "Fit to their workflow",
  ease_of_use: "Ease of use",
  price: "Price",
  support: "Support and onboarding",
  speed: "Speed",
  trust: "Trust and security",
  integration: "Integration",
  timing: "Timing and budget",
  champion: "Our champion",
  competitor: "A competitor's strength",
};
const IN_SELLER_REASONS: Record<string, string> = {
  no_decision: "No decision",
  timing: "Timing",
  price: "Price",
  competitor: "Competitor",
  status_quo: "Status quo",
  missing_feature: "Missing feature",
  procurement: "Procurement",
  champion_left: "Champion left",
};
const IN_STALE_STEP_DAYS = 7;
const IN_STALE_CARD_DAYS = 90;
const IN_PERCENT_FROM = 10;

type DealSnapshotRow = {
  deal_id: string;
  stage_key: string;
  status: string;
  mrr_amount: number;
  currency: string;
  expected_close_date: string;
  forecast_category: string;
};
type SubmissionRow = {
  id: string;
  period: string;
  currency: string;
  commit_cents: number;
  best_case_cents: number;
  closed_cents: number;
  pipeline_cents: number;
  deals: Array<{
    deal_id: string;
    name: string;
    company: string;
    category: string;
    amount: string;
  }>;
  note: string;
  submitted_by: string;
  submitted_at: string;
};
type CompetitorRow = {
  id: string;
  name: string;
  website: string;
  summary: string;
  quick_dismiss: string;
  why_we_win: string;
  why_we_lose: string;
  objections: Array<{ objection: string; response: string }>;
  reviewed_at: string | null;
  reviewed_by: string;
  archived_at: string | null;
};
type DealCompetitorRow = {
  deal_id: string;
  competitor_id: string;
  strengths: string;
  weaknesses: string;
  state: string;
};
type InterviewRow = {
  id: string;
  deal_id: string;
  held_on: string;
  interviewer_staff_id: string;
  interviewee_name: string;
  interviewee_title: string;
  buyer_reason: string;
  drivers: Array<{ driver: string; effect: string }>;
  quotes: string;
  summary: string;
};

const dealSnapshots = new Map<string, DealSnapshotRow[]>();
const forecastSubmissions: SubmissionRow[] = [];
const salesTargets = new Map<string, number>();
const competitors: CompetitorRow[] = [];
const dealCompetitors: DealCompetitorRow[] = [];
const interviews: InterviewRow[] = [];

function inDefaultCategory(probability: number, status: string): string {
  if (status === "won") return "closed";
  if (status === "lost" || status === "unqualified") return "omitted";
  if (probability >= 80) return "commit";
  if (probability >= 40) return "best_case";
  return "pipeline";
}
function inEffectiveCategory(row: DealRow): string {
  const probability = stageOf(row.stage_key)?.win_probability ?? 0;
  if (row.status !== "open") return inDefaultCategory(probability, row.status);
  return row.forecast_category && IN_SETTABLE.includes(row.forecast_category)
    ? row.forecast_category
    : inDefaultCategory(probability, row.status);
}
function inMonthIndex(day: string): number {
  const [year, month] = day.split("-").map(Number) as [number, number];
  return year * 12 + month - 1;
}
function inQuarterOf(day: string): string {
  const [year, month] = day.split("-").map(Number) as [number, number];
  return `${year}-Q${Math.floor((month - 1) / 3) + 1}`;
}
function inQuarterBounds(period: string): [string, string] | null {
  const match = /^(\d{4})-Q([1-4])$/.exec(period);
  if (!match) return null;
  const year = Number(match[1]);
  const quarter = Number(match[2]);
  const start = `${year}-${String(3 * (quarter - 1) + 1).padStart(2, "0")}-01`;
  const end = addDaysIso(addMonthsIso(start, 3), -1);
  return [start, end];
}
function inShiftQuarter(period: string, by: number): string {
  const [start] = inQuarterBounds(period)!;
  const [year, month] = start.split("-").map(Number) as [number, number];
  const index = year * 4 + Math.floor((month - 1) / 3) + by;
  return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
}
function inPushKind(before: string, after: string): string {
  if (!before || !after) return "";
  if (inMonthIndex(after) > inMonthIndex(before))
    return inQuarterOf(after) !== inQuarterOf(before) ? "quarter" : "month";
  if (inMonthIndex(after) < inMonthIndex(before)) return "pulled_in";
  return "";
}
function inChange(start: DealSnapshotRow | undefined, now: DealRow) {
  const amountNow = Math.round(now.mrr_amount * 100);
  if (!start) {
    if (now.status === "open")
      return { reason: "new", before: null as number | null, after: amountNow, push: "" };
    if (now.status === "won")
      return { reason: "won", before: null as number | null, after: amountNow, push: "" };
    return null;
  }
  const before = Math.round(start.mrr_amount * 100);
  if (now.status === "won") return { reason: "won", before, after: amountNow, push: "" };
  if (now.status === "lost" || now.status === "unqualified")
    return { reason: "lost", before, after: amountNow, push: "" };
  const push = inPushKind(start.expected_close_date, now.expected_close_date);
  if (push === "month" || push === "quarter")
    return { reason: "pushed", before, after: amountNow, push };
  if (push === "pulled_in") return { reason: "pulled_in", before, after: amountNow, push: "" };
  const rankBefore = IN_RANK[start.forecast_category] ?? 1;
  const rankAfter = IN_RANK[inEffectiveCategory(now)] ?? 1;
  if (rankAfter > rankBefore) return { reason: "category_up", before, after: amountNow, push: "" };
  if (rankAfter < rankBefore)
    return { reason: "category_down", before, after: amountNow, push: "" };
  if (amountNow > before) return { reason: "increased", before, after: amountNow, push: "" };
  if (amountNow < before) return { reason: "decreased", before, after: amountNow, push: "" };
  if (start.stage_key !== now.stage_key)
    return { reason: "stage_moved", before, after: amountNow, push: "" };
  return null;
}
function inAccuracy(forecastCents: number, actualCents: number) {
  const miss = centsText(forecastCents - actualCents);
  if (actualCents <= 0)
    return { accuracy: null as number | null, bias: null as number | null, miss };
  const ratio = Math.abs(forecastCents - actualCents) / actualCents;
  return {
    accuracy: Math.round(Math.max(0, 1 - ratio) * 10_000) / 10_000,
    bias: Math.round(((forecastCents - actualCents) / actualCents) * 10_000) / 10_000,
    miss,
  };
}
function inRecordText(won: number, closed: number): string {
  if (closed === 0) return "no closed deals yet";
  if (closed < IN_PERCENT_FROM) return `won ${won} of ${closed}`;
  return `won ${Math.round((100 * won) / closed)}% of ${closed}`;
}
function inCardStale(reviewedAt: string | null): boolean {
  return !reviewedAt || Date.now() - Date.parse(reviewedAt) > IN_STALE_CARD_DAYS * 86_400_000;
}
function inSnapshotOf(row: DealRow): DealSnapshotRow {
  return {
    deal_id: row.id,
    stage_key: row.stage_key,
    status: "open",
    mrr_amount: row.mrr_amount,
    currency: row.currency,
    expected_close_date: row.expected_close_date,
    forecast_category: inEffectiveCategory(row),
  };
}
function inEnsureToday() {
  const today = todayIso();
  if (!dealSnapshots.has(today))
    dealSnapshots.set(today, deals.filter((row) => row.status === "open").map(inSnapshotOf));
}
function inRecord(competitor: CompetitorRow) {
  const name = competitor.name.trim().toLowerCase();
  const ids = new Set(
    dealCompetitors.filter((row) => row.competitor_id === competitor.id).map((row) => row.deal_id),
  );
  for (const deal of deals)
    if (name && deal.loss_competitor.trim().toLowerCase() === name) ids.add(deal.id);
  const on = deals.filter((deal) => ids.has(deal.id));
  const closed = on.filter((deal) => deal.status === "won" || deal.status === "lost");
  const won = closed.filter((deal) => deal.status === "won").length;
  return {
    won,
    closed: closed.length,
    open: on.filter((deal) => deal.status === "open").length,
    text: inRecordText(won, closed.length),
  };
}
function inCompetitorView(row: CompetitorRow) {
  return {
    id: row.id,
    name: row.name,
    website: row.website,
    summary: row.summary,
    quick_dismiss: row.quick_dismiss,
    why_we_win: row.why_we_win,
    why_we_lose: row.why_we_lose,
    objections: row.objections,
    reviewed_at: row.reviewed_at,
    reviewed_by: staff.find((member) => member.id === row.reviewed_by)?.display_name ?? "",
    stale: inCardStale(row.reviewed_at),
    record: inRecord(row),
  };
}
function inDealCompetitors(dealId: string) {
  return dealCompetitors
    .filter((row) => row.deal_id === dealId)
    .map((row) => {
      const card = competitors.find((item) => item.id === row.competitor_id);
      return card
        ? {
            competitor_id: card.id,
            name: card.name,
            strengths: row.strengths,
            weaknesses: row.weaknesses,
            state: row.state,
            quick_dismiss: card.quick_dismiss,
            card_stale: inCardStale(card.reviewed_at),
          }
        : null;
    })
    .filter((row): row is NonNullable<typeof row> => row !== null)
    .sort(
      (a, b) =>
        Number(a.state !== "active") - Number(b.state !== "active") || a.name.localeCompare(b.name),
    );
}
function inInterviewView(row: InterviewRow) {
  const deal = deals.find((item) => item.id === row.deal_id);
  const status = deal?.status ?? "";
  return {
    id: row.id,
    deal_id: row.deal_id,
    deal_name: deal?.name ?? "",
    company: deal ? companyName(deal.company_id) : "",
    outcome: status,
    seller_reason:
      status === "won"
        ? "Won"
        : (IN_SELLER_REASONS[deal?.loss_reason ?? ""] ?? (deal?.loss_reason || "—")),
    seller_detail: status === "lost" ? (deal?.loss_detail ?? "") : "",
    held_on: row.held_on,
    interviewer: staff.find((member) => member.id === row.interviewer_staff_id)?.display_name ?? "",
    interviewee_name: row.interviewee_name,
    interviewee_title: row.interviewee_title,
    buyer_reason: row.buyer_reason,
    drivers: row.drivers.map((item) => ({
      ...item,
      label: IN_DRIVERS[item.driver] ?? item.driver,
    })),
    quotes: row.quotes,
    summary: row.summary,
  };
}
function inTally(views: Array<ReturnType<typeof inInterviewView>>) {
  const counts = new Map<string, { positive: number; negative: number }>();
  for (const view of views)
    for (const item of view.drivers) {
      const entry = counts.get(item.driver) ?? { positive: 0, negative: 0 };
      if (item.effect === "positive") entry.positive += 1;
      if (item.effect === "negative") entry.negative += 1;
      counts.set(item.driver, entry);
    }
  return [...counts.entries()]
    .map(([driver, value]) => ({ driver, label: IN_DRIVERS[driver] ?? driver, ...value }))
    .sort(
      (a, b) =>
        b.positive + b.negative - (a.positive + a.negative) || a.label.localeCompare(b.label),
    );
}
/** The quarter's deals in one currency: open ones closing in it, by category, and won ones. */
function inDealLines(period: string, currency: string) {
  const [start, end] = inQuarterBounds(period)!;
  const open: Array<
    Record<string, unknown> & { category: string; cents: number; deal_id: string }
  > = [];
  const won: typeof open = [];
  let undated = 0;
  for (const deal of deals) {
    if (deal.currency !== currency) continue;
    const category = inEffectiveCategory(deal);
    const line = {
      deal_id: deal.id,
      name: deal.name,
      company: companyName(deal.company_id),
      company_id: deal.company_id,
      stage: stageOf(deal.stage_key)?.label ?? deal.stage_key,
      category,
      category_label: IN_CATEGORIES[category] ?? "",
      overridden: deal.status === "open" && Boolean(deal.forecast_category),
      amount: centsText(Math.round(deal.mrr_amount * 100)),
      cents: Math.round(deal.mrr_amount * 100),
      close_date: deal.expected_close_date,
      push_count: deal.push_count ?? 0,
      closed_at: deal.closed_at,
    };
    if (deal.status === "won") {
      const closed = (deal.closed_at ?? "").slice(0, 10);
      if (closed && closed >= start && closed <= end) won.push(line);
    } else if (deal.status === "open") {
      if (!deal.expected_close_date) undated += 1;
      else if (deal.expected_close_date >= start && deal.expected_close_date <= end)
        open.push(line);
    }
  }
  return { open, won, undated };
}
function inStrip<T extends { cents: number }>(line: T): Omit<T, "cents"> {
  const { cents: _cents, ...rest } = line;
  void _cents;
  return rest;
}
function inSubmissionView(row: SubmissionRow, actualCents: number | null, wonIds: Set<string>) {
  const committed = row.deals.filter((item) => item.category === "commit");
  return {
    id: row.id,
    period: row.period,
    currency: row.currency,
    commit: centsText(row.commit_cents),
    best_case: centsText(row.best_case_cents),
    closed_then: centsText(row.closed_cents),
    pipeline_then: centsText(row.pipeline_cents),
    note: row.note,
    by: staff.find((member) => member.id === row.submitted_by)?.display_name ?? "",
    at: row.submitted_at,
    deals: row.deals,
    result:
      actualCents === null
        ? null
        : {
            ...inAccuracy(row.commit_cents, actualCents),
            actual: centsText(actualCents),
            hit: committed.filter((item) => wonIds.has(item.deal_id)),
            missed: committed.filter((item) => !wonIds.has(item.deal_id)),
          },
  };
}
function inObjections(value: unknown): Array<{ objection: string; response: string }> {
  const rows = Array.isArray(value) ? value : [];
  return rows
    .map((item) => ({
      objection: String((item as Record<string, unknown>)?.objection ?? "")
        .trim()
        .slice(0, 300),
      response: String((item as Record<string, unknown>)?.response ?? "")
        .trim()
        .slice(0, 1000),
    }))
    .filter((item) => item.objection)
    .slice(0, 20);
}

/**
 * The pipeline's recent past, so inspection has something to show on a fresh demo: nightly
 * pictures 7, 14 and 30 days back in which some deals closed later, were smaller or sat in
 * a lower category; a few deals pushed (with their counts) and set by hand; a quarter's
 * target and calls, last quarter's scored; four competitors met in deals; three buyers
 * interviewed after the decision.
 */
function seedInspection() {
  dealSnapshots.clear();
  forecastSubmissions.length = 0;
  salesTargets.clear();
  competitors.length = 0;
  dealCompetitors.length = 0;
  interviews.length = 0;
  const OWNER = "aa000000-0000-4000-8000-00000000000a";
  const SALES = "aa000000-0000-4000-8000-00000000000c";
  const today = todayIso();
  const open = deals.filter((deal) => deal.status === "open");

  // Hand-set categories, pushes and next-step ages on today's deals.
  open.forEach((deal, index) => {
    deal.next_step_changed_at =
      index % 4 === 3 ? agoIso(24 * (9 + index)) : agoIso(24 * (index % 5));
    if (index % 5 === 1 && deal.expected_close_date) {
      deal.push_count = 1 + (index % 3 === 0 ? 1 : 0);
      deal.first_close_date = addDaysIso(deal.expected_close_date, -35);
    }
    if (index === 2) deal.forecast_category = "commit";
    if (index === 6) deal.forecast_category = "omitted";
  });

  // The pictures at 30, 14 and 7 days back.
  for (const back of [30, 14, 7]) {
    const day = addDaysIso(today, -back);
    const since = `${day}T00:00:00Z`;
    const rows = deals
      .filter(
        (deal) =>
          deal.created_at < since &&
          (deal.status === "open" || (deal.closed_at !== null && deal.closed_at >= since)),
      )
      .map((deal, index) => {
        const row = inSnapshotOf(deal);
        if (deal.status !== "open") {
          row.stage_key = "negotiation";
          row.forecast_category = "commit";
        }
        if ((deal.push_count ?? 0) > 0 && deal.expected_close_date)
          row.expected_close_date = addDaysIso(deal.expected_close_date, -Math.min(35, back + 21));
        if (index % 6 === 2) row.mrr_amount = Math.round(deal.mrr_amount * 0.75);
        if (index % 9 === 4 && row.forecast_category === "commit")
          row.forecast_category = "best_case";
        return row;
      });
    dealSnapshots.set(day, rows);
  }
  inEnsureToday();

  // Targets and calls: this quarter's, and last quarter's scored against what was won.
  const current = inQuarterOf(today);
  // The latest earlier quarter that has wins, so its scored call means something; with
  // none, no past call is invented.
  const last =
    [1, 2, 3, 4]
      .map((back) => inShiftQuarter(current, -back))
      .find((period) => inDealLines(period, "USD").won.length > 0) ?? "";
  salesTargets.set(`${current}|USD`, 600_000);
  salesTargets.set(`${inShiftQuarter(current, 1)}|USD`, 750_000);
  if (last) salesTargets.set(`${last}|USD`, 450_000);
  const lastLines = inDealLines(last || current, "USD");
  const lastWon = lastLines.won.reduce((total, line) => total + line.cents, 0);
  const lastStart = inQuarterBounds(last || current)![0];
  const frozen = (lines: typeof lastLines.won, category: string) =>
    lines.map((line) => ({
      deal_id: line.deal_id,
      name: String(line.name),
      company: String(line.company),
      category,
      amount: String(line.amount),
    }));
  if (last)
    forecastSubmissions.push(
      {
        id: randomUUID(),
        period: last,
        currency: "USD",
        commit_cents: Math.round(lastWon * 1.25),
        best_case_cents: Math.round(lastWon * 1.6),
        closed_cents: 0,
        pipeline_cents: Math.round(lastWon * 2.2),
        deals: frozen(lastLines.won, "commit"),
        note: "Early call: the pilots convert if the fixed-income coverage lands.",
        submitted_by: OWNER,
        submitted_at: `${addDaysIso(lastStart, 6)}T09:00:00Z`,
      },
      {
        id: randomUUID(),
        period: last,
        currency: "USD",
        commit_cents: Math.round(lastWon * 1.08),
        best_case_cents: Math.round(lastWon * 1.3),
        closed_cents: Math.round(lastWon * 0.6),
        pipeline_cents: Math.round(lastWon * 1.4),
        deals: frozen(lastLines.won, "commit"),
        note: "Mid-quarter: one pilot slipped to next quarter.",
        submitted_by: SALES,
        submitted_at: `${addDaysIso(lastStart, 45)}T09:00:00Z`,
      },
    );
  const nowLines = inDealLines(current, "USD");
  const committed = nowLines.open.filter((line) => line.category === "commit");
  const wonNow = nowLines.won.reduce((total, line) => total + line.cents, 0);
  const commitNow = wonNow + committed.reduce((total, line) => total + line.cents, 0);
  forecastSubmissions.push({
    id: randomUUID(),
    period: current,
    currency: "USD",
    commit_cents: commitNow,
    best_case_cents: Math.round(commitNow * 1.35),
    closed_cents: wonNow,
    pipeline_cents: nowLines.open.reduce((total, line) => total + line.cents, 0),
    deals: [
      ...frozen(committed as typeof lastLines.won, "commit"),
      ...frozen(nowLines.won, "closed"),
    ],
    note: committed.length
      ? "Won so far plus the negotiations; best case adds the proposals out this week."
      : "Won so far: nothing else closes before the quarter ends.",
    submitted_by: SALES,
    submitted_at: agoIso(24 * 4),
  });

  // Competitors: invented names, never a real vendor's.
  const cards: CompetitorRow[] = [
    {
      id: "cf000001-0000-4000-8000-000000000000",
      name: "Fathom Terminal",
      website: "fathomterminal.example",
      summary: "A desktop terminal sold per desk, strong in rates and FX.",
      quick_dismiss:
        "Their filings arrive a day after ours, and every extra seat costs a desk licence.",
      why_we_win: "Same-day filings; research and chat in one place; seats priced per person.",
      why_we_lose: "Deeper fixed-income history; firms already trained on it.",
      objections: [
        {
          objection: "Everyone here already knows Fathom.",
          response: "Keep it for rates; put the research desk on us and compare the week.",
        },
        {
          objection: "You are newer.",
          response: "Show the audit export and the uptime page; offer the pilot.",
        },
      ],
      reviewed_at: agoIso(24 * 20),
      reviewed_by: SALES,
      archived_at: null,
    },
    {
      id: "cf000002-0000-4000-8000-000000000000",
      name: "Ledgerpoint",
      website: "ledgerpoint.example",
      summary: "Low-cost screening and charts for small funds.",
      quick_dismiss: "Cheaper per seat, but no filings and no research workflow.",
      why_we_win: "Primary documents and the desk's own notes on one record.",
      why_we_lose: "Price, when the buyer only screens.",
      objections: [
        {
          objection: "Ledgerpoint is half the price.",
          response: "Count the hours spent pulling filings by hand.",
        },
      ],
      reviewed_at: agoIso(24 * 120),
      reviewed_by: OWNER,
      archived_at: null,
    },
    {
      id: "cf000003-0000-4000-8000-000000000000",
      name: "Northbeam Data",
      website: "northbeam.example",
      summary: "A data feed firms build their own screens on.",
      quick_dismiss: "A feed, not a desk: they will build and maintain what we ship.",
      why_we_win: "No engineering needed; alerts and research ready on day one.",
      why_we_lose: "Firms with a data team who want raw access.",
      objections: [],
      reviewed_at: agoIso(24 * 45),
      reviewed_by: SALES,
      archived_at: null,
    },
    {
      id: "cf000004-0000-4000-8000-000000000000",
      name: "In-house spreadsheets",
      website: "",
      summary: "The status quo: analysts' own workbooks and a shared drive.",
      quick_dismiss:
        "Nobody is fired for a spreadsheet, until a number is wrong in front of a client.",
      why_we_win: "Sources on every figure; the audit trail.",
      why_we_lose: "No budget line; the team does not feel the pain yet.",
      objections: [],
      reviewed_at: null,
      reviewed_by: "",
      archived_at: null,
    },
  ];
  competitors.push(...cards);
  open.slice(0, 9).forEach((deal, index) => {
    const card = cards[index % 3]!;
    dealCompetitors.push({
      deal_id: deal.id,
      competitor_id: card.id,
      strengths:
        index % 3 === 0
          ? "Incumbent on the rates desk"
          : index % 3 === 1
            ? "Half our price"
            : "Their data team likes raw access",
      weaknesses:
        index % 3 === 0
          ? "No same-day filings"
          : index % 3 === 1
            ? "No research workflow"
            : "Months to build screens",
      state: index === 4 ? "eliminated" : "active",
    });
  });
  const lost = deals.filter((deal) => deal.status === "lost");
  lost.forEach((deal, index) => {
    if (index % 2 === 0) {
      deal.loss_reason = deal.loss_reason || "competitor";
      if (deal.loss_reason === "competitor") deal.loss_competitor = cards[index % 2]!.name;
    }
  });
  const won = deals.filter((deal) => deal.status === "won").slice(-4);
  won.slice(0, 2).forEach((deal, index) =>
    dealCompetitors.push({
      deal_id: deal.id,
      competitor_id: cards[index]!.id,
      strengths: "",
      weaknesses: "",
      state: "eliminated",
    }),
  );

  // Interviews after the decision.
  const pickLost = lost.slice(0, 2);
  pickLost.forEach((deal, index) =>
    interviews.push({
      id: `cf1000${index + 1}0-0000-4000-8000-000000000000`,
      deal_id: deal.id,
      held_on: addDaysIso((deal.closed_at ?? agoIso(24 * 10)).slice(0, 10), 6),
      interviewer_staff_id: SALES,
      interviewee_name: index === 0 ? "Head of research" : "COO",
      interviewee_title: index === 0 ? "Research" : "Operations",
      buyer_reason:
        index === 0
          ? "We needed ten years of fixed-income history on day one."
          : "The team would not move off the tool they already know this year.",
      drivers:
        index === 0
          ? [
              { driver: "data_coverage", effect: "negative" },
              { driver: "ease_of_use", effect: "positive" },
              { driver: "price", effect: "positive" },
            ]
          : [
              { driver: "timing", effect: "negative" },
              { driver: "champion", effect: "positive" },
              { driver: "competitor", effect: "negative" },
            ],
      quotes: index === 0 ? "“Price was never the issue.”" : "“Ask us again in the new year.”",
      summary: "",
    }),
  );
  if (won[0])
    interviews.push({
      id: "cf100030-0000-4000-8000-000000000000",
      deal_id: won[0].id,
      held_on: addDaysIso((won[0].closed_at ?? agoIso(24 * 30)).slice(0, 10), 10),
      interviewer_staff_id: OWNER,
      interviewee_name: "Portfolio manager",
      interviewee_title: "Equities",
      buyer_reason: "Filings the same day, with the desk's notes beside them.",
      drivers: [
        { driver: "speed", effect: "positive" },
        { driver: "data_coverage", effect: "positive" },
        { driver: "support", effect: "positive" },
      ],
      quotes: "“It saved an analyst a morning a week.”",
      summary: "",
    });
}

// --- the privacy desk (mirrors privacy.py and privacy_routes.py) -----------------------------------

const PV_KINDS: Record<string, string> = {
  access: "Access (a copy of their data)",
  rectification: "Rectification",
  erasure: "Erasure",
  restriction: "Restriction of processing",
  portability: "Portability",
  objection: "Objection",
  automated: "Review of an automated decision",
  consent: "Consent withdrawn",
  complaint: "Complaint about how we used their data",
};
const PV_REGIMES: Record<string, string> = {
  uk_gdpr: "UK GDPR",
  eu_gdpr: "EU GDPR",
  india_dpdp: "India DPDP",
  other: "Other",
};
const PV_CHANNELS = ["email", "form", "post", "phone", "in_app", "other"];
const PV_OPEN = ["received", "identity", "scoping", "searching", "review"];
const PV_CLOSED = ["responded", "refused", "withdrawn"];
const PV_OUTCOMES = ["fulfilled", "partly", "none_held"];
const PV_REFUSALS: Record<string, string> = {
  manifestly_unfounded: "Manifestly unfounded",
  excessive: "Manifestly excessive",
  exemption: "An exemption applies",
  identity: "Identity was not confirmed",
  not_ours: "We are not the controller",
};
const PV_SYSTEMS: Record<string, string> = {
  crm: "CRM: people, leads, companies and notes",
  support: "Support tickets and their replies",
  mail: "Mail sent, mailing lists and consent",
  meetings: "Meetings and calendar invitations",
  product: "The product account and its usage",
  billing: "Invoices, receipts and contracts",
  mailboxes: "Staff mailboxes and chat (outside HQ)",
  backups: "Backups and logs (kept to their retention)",
};
const PV_SEARCH_STATES = ["pending", "found", "none", "not_applicable"];
const PV_BANK_HOLIDAYS = new Set([
  "2025-01-01",
  "2025-04-18",
  "2025-04-21",
  "2025-05-05",
  "2025-05-26",
  "2025-08-25",
  "2025-12-25",
  "2025-12-26",
  "2026-01-01",
  "2026-04-03",
  "2026-04-06",
  "2026-05-04",
  "2026-05-25",
  "2026-08-31",
  "2026-12-25",
  "2026-12-28",
  "2027-01-01",
  "2027-03-26",
  "2027-03-29",
  "2027-05-03",
  "2027-05-31",
  "2027-08-30",
  "2027-12-27",
  "2027-12-28",
  "2028-01-03",
  "2028-04-14",
  "2028-04-17",
  "2028-05-01",
  "2028-05-29",
  "2028-08-28",
  "2028-12-25",
  "2028-12-26",
]);
const PV_HOLIDAYS_KNOWN_THROUGH = "2028-12-31";
const PV_INCIDENT_KINDS: Record<string, string> = {
  security: "Security",
  availability: "Availability",
  data_loss: "Data lost or destroyed",
  misdirected: "Sent to the wrong person",
  other: "Other",
};
const PV_SEVERITIES = ["low", "medium", "high", "critical"];
const PV_RISKS: Record<string, string> = {
  none: "Unlikely to result in a risk: not notifiable",
  risk: "A risk: tell the regulator",
  high: "A high risk: tell the regulator and the people affected",
};
const PV_STANDARD = {
  incident_notice_hours: 72,
  subprocessor_notice_days: 30,
  objection_window_days: 30,
};
const PV_AUDIT = ["none", "questionnaire", "remote", "onsite"];
const PV_DORA = ["none", "ict_service", "critical_important"];
const PV_TRANSFERS: Record<string, string> = {
  adequacy: "Adequacy decision",
  idta: "UK IDTA",
  scc_uk_addendum: "EU SCCs with the UK Addendum",
  scc: "EU SCCs",
  not_needed: "No restricted transfer",
};
const PV_RESOLUTIONS = ["withdrawn", "accommodated", "terminated"];
/** The mock's mail is "set up" unless told otherwise, so the demo can send a notice. */
const MOCK_MAIL_READY = process.env.MOCK_MAIL_READY !== "0";

type PrivacyRequestRow = {
  id: string;
  reference: string;
  kind: string;
  regime: string;
  channel: string;
  requester_name: string;
  requester_email: string;
  person_id: string;
  company_id: string;
  description: string;
  received_on: string;
  identity_state: string;
  identity_confirmed_on: string | null;
  identity_method: string;
  fee_requested_on: string | null;
  fee_paid_on: string | null;
  status: string;
  paused_on: string | null;
  paused_question: string;
  paused_days: number;
  extended: boolean;
  extension_reason: string;
  extension_told_on: string | null;
  acknowledged_on: string | null;
  responded_on: string | null;
  outcome: string;
  outcome_detail: string;
  assignee_staff_id: string;
  created_at: string;
  updated_at: string;
};
type PrivacySearchRow = { state: string; note: string; staff_id: string; at: string | null };
type PrivacyEventRow = {
  subject_type: string;
  subject_id: string;
  kind: string;
  detail: string;
  staff_id: string;
  at: string;
};
type IncidentRow = {
  id: string;
  reference: string;
  title: string;
  summary: string;
  kind: string;
  severity: string;
  status: string;
  personal_data: boolean;
  occurred_at: string | null;
  detected_at: string;
  aware_at: string | null;
  contained_at: string | null;
  resolved_at: string | null;
  data_categories: string;
  subjects_estimate: number | null;
  records_estimate: number | null;
  risk: string;
  risk_reason: string;
  assessed_by: string;
  assessed_at: string | null;
  regulator_notified_at: string | null;
  regulator_reference: string;
  late_reason: string;
  individuals_notified_at: string | null;
  lessons: string;
  lead_staff_id: string;
  created_at: string;
};
type IncidentCustomerRow = {
  incident_id: string;
  company_id: string;
  due_at: string | null;
  notified_at: string | null;
  note: string;
};
type CommitmentRow = {
  company_id: string;
  contract_reference: string;
  privacy_contact_email: string;
  incident_notice_hours: number | null;
  subprocessor_notice_days: number | null;
  objection_window_days: number | null;
  audit_rights: string;
  data_locations: string;
  exit_assistance_days: number | null;
  dora_classification: string;
  material_outsourcing: boolean;
  nonstandard_clauses: string;
  reviewed_on: string | null;
  updated_by: string;
  updated_at: string;
};
type SubprocessorRow = {
  id: string;
  legal_name: string;
  service: string;
  purpose: string;
  data_categories: string;
  locations: string;
  transfer_mechanism: string;
  dpa_signed_on: string | null;
  status: string;
  notice_sent_on: string | null;
  effective_on: string | null;
  activated_on: string | null;
  retired_on: string | null;
};
type NoticeRow = {
  subprocessor_id: string;
  company_id: string;
  sent_to: string;
  sent_on: string;
  objection_deadline: string;
  objected_on: string | null;
  objection: string;
  resolution: string;
  resolved_on: string | null;
};

const privacyRequests: PrivacyRequestRow[] = [];
const privacySearches = new Map<string, PrivacySearchRow>();
const privacyEvents: PrivacyEventRow[] = [];
const incidents: IncidentRow[] = [];
const incidentCustomers: IncidentCustomerRow[] = [];
const commitmentsByCompany = new Map<string, CommitmentRow>();
const subprocessors: SubprocessorRow[] = [];
const subprocessorNotices: NoticeRow[] = [];
const erasedPeople = new Set<string>();

function pvEvent(
  subjectType: string,
  subjectId: string,
  kind: string,
  detail: string,
  staffId: string,
  at?: string,
) {
  privacyEvents.push({
    subject_type: subjectType,
    subject_id: subjectId,
    kind,
    detail: detail.slice(0, 2000),
    staff_id: staffId,
    at: at ?? now(),
  });
}

const PV_MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];
/** Mirrors privacy.long_day: 3 Sep 2026 (spelled out, not left to the runtime's locale). */
function pvDay(value: string | null | undefined): string {
  if (!value) return "";
  const [year, month, day] = value.slice(0, 10).split("-").map(Number) as [number, number, number];
  return `${day} ${PV_MONTHS[month - 1]} ${year}`;
}
/** Mirrors privacy.long_moment: 29 Sep 2026, 21:36 UTC. */
function pvMoment(value: string | null | undefined): string {
  if (!value) return "";
  const iso = new Date(value).toISOString();
  return `${pvDay(iso)}, ${iso.slice(11, 16)} UTC`;
}
function pvWorkingDay(day: string): boolean {
  const weekday = new Date(`${day}T00:00:00Z`).getUTCDay();
  return weekday !== 0 && weekday !== 6 && !PV_BANK_HOLIDAYS.has(day);
}
function pvNextWorkingDay(day: string): string {
  let at = day;
  while (!pvWorkingDay(at)) at = addDaysIso(at, 1);
  return at;
}
function pvClockStart(row: PrivacyRequestRow): string | null {
  let start = row.received_on;
  if (row.identity_state === "requested") return null;
  if (row.identity_state === "confirmed") {
    if (!row.identity_confirmed_on) return null;
    if (row.identity_confirmed_on > start) start = row.identity_confirmed_on;
  }
  if (row.fee_requested_on) {
    if (!row.fee_paid_on) return null;
    if (row.fee_paid_on > start) start = row.fee_paid_on;
  }
  return start;
}
function pvFirstMonthEnd(row: PrivacyRequestRow): string | null {
  const start = pvClockStart(row);
  if (!start) return null;
  if (row.regime === "india_dpdp") return addDaysIso(start, 90 + row.paused_days);
  return pvNextWorkingDay(addDaysIso(addMonthsIso(start, 1), row.paused_days));
}
function pvDueOn(row: PrivacyRequestRow): string | null {
  if (row.kind === "complaint") return addDaysIso(row.received_on, 30);
  if (row.paused_on) return null;
  const start = pvClockStart(row);
  if (!start) return null;
  if (row.regime === "india_dpdp") return addDaysIso(start, 90 + row.paused_days);
  return pvNextWorkingDay(
    addDaysIso(addMonthsIso(start, 1 + (row.extended ? 2 : 0)), row.paused_days),
  );
}
function pvStoppedDays(pausedOn: string, answeredOn: string): number {
  return Math.max(0, rxDaysBetween(pausedOn, answeredOn) + 1);
}
function pvClock(row: PrivacyRequestRow, today: string) {
  const due = pvDueOn(row);
  const closed = PV_CLOSED.includes(row.status);
  let state: string;
  if (closed) state = "closed";
  else if (row.kind === "complaint") state = row.acknowledged_on ? "acknowledged" : "running";
  else if (row.paused_on) state = "stopped";
  else if (!due) state = "not_started";
  else state = "running";
  const daysLeft = due && state === "running" ? rxDaysBetween(today, due) : null;
  const firstMonth = row.kind !== "complaint" ? pvFirstMonthEnd(row) : null;
  let whenStopped: number | null = null;
  if (row.paused_on) {
    const running = pvDueOn({ ...row, paused_on: null });
    whenStopped = running ? rxDaysBetween(row.paused_on, running) : null;
  }
  const reason =
    state === "not_started"
      ? row.identity_state === "requested"
        ? "Waiting on proof of identity; the month starts when it is confirmed."
        : "Waiting on the fee; the month starts when it is paid."
      : state === "stopped"
        ? "Stopped while we wait for the information needed to scope the request."
        : row.kind === "complaint"
          ? "A complaint is acknowledged within 30 days of receipt."
          : row.regime === "india_dpdp"
            ? "Answered within 90 days of receipt."
            : row.extended
              ? "Extended by two months; the person was told why."
              : "One month from the day the clock started, to the next working day.";
  return {
    state,
    starts_on: row.kind !== "complaint" ? pvClockStart(row) : row.received_on,
    due_on: due,
    days_left: daysLeft,
    overdue: daysLeft !== null && daysLeft < 0,
    stopped_since: row.paused_on,
    days_left_when_stopped: whenStopped,
    paused_days: row.paused_days,
    extended: row.extended,
    can_extend:
      !closed &&
      row.kind !== "complaint" &&
      (row.regime === "uk_gdpr" || row.regime === "eu_gdpr") &&
      !row.extended &&
      firstMonth !== null &&
      today <= firstMonth,
    extend_by: firstMonth && !row.extended && row.kind !== "complaint" ? firstMonth : null,
    answered_late: Boolean(row.responded_on && due && row.responded_on > due),
    holidays_known: due === null || due <= PV_HOLIDAYS_KNOWN_THROUGH,
    reason,
  };
}
function pvRequestView(row: PrivacyRequestRow, today = todayIso()) {
  const assignee = staff.find((member) => member.id === row.assignee_staff_id);
  return {
    id: row.id,
    reference: row.reference,
    kind: row.kind,
    kind_label: PV_KINDS[row.kind] ?? row.kind,
    regime: row.regime,
    regime_label: PV_REGIMES[row.regime] ?? row.regime,
    channel: row.channel,
    requester_name: row.requester_name,
    requester_email: row.requester_email,
    person_id: row.person_id || null,
    company: row.company_id ? { id: row.company_id, name: companyName(row.company_id) } : null,
    description: row.description,
    received_on: row.received_on,
    identity_state: row.identity_state,
    identity_confirmed_on: row.identity_confirmed_on,
    identity_method: row.identity_method,
    fee_requested_on: row.fee_requested_on,
    fee_paid_on: row.fee_paid_on,
    status: row.status,
    open: PV_OPEN.includes(row.status),
    paused_question: row.paused_question,
    extension_reason: row.extension_reason,
    extension_told_on: row.extension_told_on,
    acknowledged_on: row.acknowledged_on,
    responded_on: row.responded_on,
    outcome: row.outcome,
    outcome_detail: row.outcome_detail,
    assignee: assignee ? { id: assignee.id, name: assignee.display_name } : null,
    clock: pvClock(row, today),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
function pvReference(existing: string[], prefix: string, year: number): string {
  const stem = `${prefix}-${year}-`;
  const used = existing
    .filter((ref) => ref.startsWith(stem))
    .map((ref) => Number(ref.slice(stem.length)))
    .filter((value) => Number.isFinite(value));
  return `${stem}${String((used.length ? Math.max(...used) : 0) + 1).padStart(4, "0")}`;
}
function pvEvents(subjectType: string, subjectId: string) {
  return privacyEvents
    .filter((row) => row.subject_type === subjectType && row.subject_id === subjectId)
    .sort((a, b) => a.at.localeCompare(b.at))
    .map((row) => ({
      kind: row.kind,
      detail: row.detail,
      by: staff.find((member) => member.id === row.staff_id)?.display_name ?? "",
      at: row.at,
    }));
}
function pvActiveCustomers(): Map<string, string> {
  const found = new Map<string, string>();
  for (const contract of contracts)
    if (contract.status === "active")
      found.set(contract.company_id, companyName(contract.company_id));
  return found;
}
function pvRegulatorClock(row: IncidentRow, at = Date.now()) {
  if (!row.personal_data)
    return { state: "not_applicable", due_at: null, hours_left: null, late: false };
  if (!row.aware_at) return { state: "no_awareness", due_at: null, hours_left: null, late: false };
  const due = Date.parse(row.aware_at) + 72 * 3_600_000;
  const dueIso = new Date(due).toISOString().replace(/\.\d{3}Z$/, "Z");
  if (row.regulator_notified_at)
    return {
      state: "notified",
      due_at: dueIso,
      hours_left: null,
      late: Date.parse(row.regulator_notified_at) > due,
      notified_at: row.regulator_notified_at,
    };
  if (row.risk === "none")
    return { state: "not_notifiable", due_at: dueIso, hours_left: null, late: false };
  const hoursLeft = Math.round(((due - at) / 3_600_000) * 10) / 10;
  return {
    state: row.risk === "" ? "unassessed" : "due",
    due_at: dueIso,
    hours_left: hoursLeft,
    late: hoursLeft < 0,
  };
}
function pvIncidentView(row: IncidentRow) {
  const at = Date.now();
  const lead = staff.find((member) => member.id === row.lead_staff_id);
  const owed = incidentCustomers
    .filter((item) => item.incident_id === row.id)
    .map((item) => {
      const commitment = commitmentsByCompany.get(item.company_id);
      const due = item.due_at ? Date.parse(item.due_at) : null;
      const told = item.notified_at ? Date.parse(item.notified_at) : null;
      return {
        company_id: item.company_id,
        company_name: companyName(item.company_id),
        due_at: item.due_at,
        notified_at: item.notified_at,
        hours_left:
          due !== null && told === null ? Math.round(((due - at) / 3_600_000) * 10) / 10 : null,
        late: due !== null && ((told !== null && told > due) || (told === null && at > due)),
        note: item.note,
        contact: commitment?.privacy_contact_email ?? "",
        dora: (commitment?.dora_classification ?? "none") !== "none",
      };
    })
    .sort(
      (a, b) =>
        Number(a.notified_at !== null) - Number(b.notified_at !== null) ||
        String(a.due_at ?? "~").localeCompare(String(b.due_at ?? "~")),
    );
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    summary: row.summary,
    kind: row.kind,
    kind_label: PV_INCIDENT_KINDS[row.kind] ?? "",
    severity: row.severity,
    status: row.status,
    personal_data: row.personal_data,
    occurred_at: row.occurred_at,
    detected_at: row.detected_at,
    aware_at: row.aware_at,
    contained_at: row.contained_at,
    resolved_at: row.resolved_at,
    data_categories: row.data_categories,
    subjects_estimate: row.subjects_estimate,
    records_estimate: row.records_estimate,
    risk: row.risk,
    risk_label: PV_RISKS[row.risk] ?? "Not yet assessed",
    risk_reason: row.risk_reason,
    assessed_by: staff.find((member) => member.id === row.assessed_by)?.display_name ?? "",
    assessed_at: row.assessed_at,
    regulator: pvRegulatorClock(row, at),
    regulator_reference: row.regulator_reference,
    late_reason: row.late_reason,
    individuals_notified_at: row.individuals_notified_at,
    lessons: row.lessons,
    lead: lead ? { id: lead.id, name: lead.display_name } : null,
    customers: owed,
    customers_owed: owed.filter((item) => !item.notified_at).length,
    created_at: row.created_at,
  };
}
function pvCommitmentFlags(row: CommitmentRow | undefined): string[] {
  if (!row) return [];
  const flags: string[] = [];
  if (
    row.incident_notice_hours !== null &&
    row.incident_notice_hours < PV_STANDARD.incident_notice_hours
  )
    flags.push(
      `Incident notice within ${row.incident_notice_hours} hours (standard ${PV_STANDARD.incident_notice_hours})`,
    );
  if (
    row.subprocessor_notice_days !== null &&
    row.subprocessor_notice_days > PV_STANDARD.subprocessor_notice_days
  )
    flags.push(
      `Sub-processor notice ${row.subprocessor_notice_days} days ahead (standard ${PV_STANDARD.subprocessor_notice_days})`,
    );
  if (
    row.objection_window_days !== null &&
    row.objection_window_days > PV_STANDARD.objection_window_days
  )
    flags.push(
      `Objection window ${row.objection_window_days} days (standard ${PV_STANDARD.objection_window_days})`,
    );
  if (row.audit_rights === "onsite") flags.push("On-site audit rights");
  if (row.dora_classification === "critical_important")
    flags.push("DORA: we support a critical or important function");
  if (row.material_outsourcing) flags.push("Material outsourcing for the customer");
  if (row.nonstandard_clauses.trim()) flags.push("Non-standard clauses recorded");
  return flags;
}
function pvCommitmentView(companyId: string, row: CommitmentRow | undefined) {
  return {
    company_id: companyId,
    recorded: Boolean(row),
    contract_reference: row?.contract_reference ?? "",
    privacy_contact_email: row?.privacy_contact_email ?? "",
    incident_notice_hours: row?.incident_notice_hours ?? null,
    subprocessor_notice_days: row?.subprocessor_notice_days ?? null,
    objection_window_days: row?.objection_window_days ?? null,
    audit_rights: row?.audit_rights ?? "none",
    data_locations: row?.data_locations ?? "",
    exit_assistance_days: row?.exit_assistance_days ?? null,
    dora_classification: row?.dora_classification ?? "none",
    material_outsourcing: row?.material_outsourcing ?? false,
    nonstandard_clauses: row?.nonstandard_clauses ?? "",
    reviewed_on: row?.reviewed_on ?? null,
    updated_by: staff.find((member) => member.id === row?.updated_by)?.display_name ?? "",
    updated_at: row?.updated_at ?? null,
    flags: pvCommitmentFlags(row),
  };
}
function pvNoticeDays(companyId: string): number {
  return (
    commitmentsByCompany.get(companyId)?.subprocessor_notice_days ??
    PV_STANDARD.subprocessor_notice_days
  );
}
function pvObjectionDays(companyId: string): number {
  return commitmentsByCompany.get(companyId)?.objection_window_days ?? pvNoticeDays(companyId);
}
function pvSubprocessorView(row: SubprocessorRow, today = todayIso()) {
  const notices = subprocessorNotices.filter((item) => item.subprocessor_id === row.id);
  const customers = pvActiveCustomers();
  const noticed = new Set(notices.map((item) => item.company_id));
  const unnoticed = [...customers.keys()].filter((id) => !noticed.has(id));
  const open = notices.filter((item) => item.objected_on && !item.resolution);
  const blockers: string[] = [];
  if (row.status === "notice_sent") {
    if (unnoticed.length) blockers.push(`${unnoticed.length} customer(s) not yet told`);
    if (row.effective_on && today < row.effective_on)
      blockers.push(`the notice runs until ${pvDay(row.effective_on)}`);
    if (open.length) blockers.push(`${open.length} objection(s) not settled`);
  }
  return {
    id: row.id,
    legal_name: row.legal_name,
    service: row.service,
    purpose: row.purpose,
    data_categories: row.data_categories,
    locations: row.locations,
    transfer_mechanism: row.transfer_mechanism,
    transfer_label: PV_TRANSFERS[row.transfer_mechanism] ?? "",
    dpa_signed_on: row.dpa_signed_on,
    status: row.status,
    notice_sent_on: row.notice_sent_on,
    effective_on: row.effective_on,
    activated_on: row.activated_on,
    retired_on: row.retired_on,
    notices_sent: notices.length,
    customers_unnoticed:
      row.status === "proposed" || row.status === "notice_sent" ? unnoticed.length : 0,
    open_objections: open.length,
    objections: notices.filter((item) => item.objected_on).length,
    can_activate: row.status === "notice_sent" && blockers.length === 0,
    blockers,
  };
}
function pvEffectiveOn(subprocessorId: string): string | null {
  const days = subprocessorNotices
    .filter((item) => item.subprocessor_id === subprocessorId)
    .map((item) => addDaysIso(item.sent_on, pvNoticeDays(item.company_id)));
  return days.length ? days.sort().at(-1)! : null;
}
function pvNoticeText(
  row: SubprocessorRow,
  companyName: string,
  effective: string,
  deadline: string,
) {
  const long = (day: string) =>
    new Date(`${day}T00:00:00Z`).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    });
  const lines = [
    `Hello ${companyName} team,`,
    "",
    `Under our data processing terms we are telling you, before it happens, that we intend to engage a new sub-processor from ${long(effective)}.`,
    "",
    `Sub-processor: ${row.legal_name}`,
  ];
  if (row.service) lines.push(`Service: ${row.service}`);
  if (row.purpose) lines.push(`Purpose: ${row.purpose}`);
  if (row.data_categories) lines.push(`Personal data involved: ${row.data_categories}`);
  if (row.locations) lines.push(`Where it is processed: ${row.locations}`);
  lines.push(`Transfer safeguard: ${PV_TRANSFERS[row.transfer_mechanism] ?? ""}`);
  lines.push(
    "",
    `If you object on reasonable data-protection grounds, reply to this message by ${long(deadline)} and say why. We will work with you on it before the change takes effect.`,
    "",
    "Quantify Terminal",
  );
  return { subject: `Notice of a new sub-processor: ${row.legal_name}`, body: lines.join("\n") };
}
function pvSuppress(email: string, reason: string, staffId: string, reference: string): boolean {
  if (!email) return false;
  if (
    mailSuppressions.some(
      (row) => row.email_norm === email && row.scope === "global" && !row.released_at,
    )
  )
    return false;
  mailSuppressions.push({
    id: randomUUID(),
    email_norm: email,
    scope: "global",
    scope_key: "",
    reason,
    source: `privacy ${reference}`.slice(0, 60),
    detail: "",
    created_at: now(),
    created_by: staffId,
    released_at: null,
    released_by: "",
    release_note: "",
  });
  return true;
}
function pvMatches(email: string, person: PersonRow | undefined) {
  if (!email) {
    return {
      email: "",
      people: [],
      leads: [],
      list_memberships: [],
      meetings: [],
      mail_messages: 0,
      suppressed: false,
      consent: null,
      tickets: [],
      tickets_searched: true,
    };
  }
  const account = person?.account_user_id ?? "";
  return {
    email,
    people: people
      .filter((row) => row.email.toLowerCase() === email)
      .map((row) => ({
        id: row.id,
        name: row.full_name,
        company_id: row.company_id,
        erased: erasedPeople.has(row.id),
      })),
    leads: leads
      .filter((row) => row.email.toLowerCase() === email)
      .map((row) => ({
        id: row.id,
        name: row.full_name,
        stage: row.stage,
        anonymised: Boolean(row.anonymised_at),
      })),
    list_memberships: mailListMembers
      .filter((row) => row.email_norm === email)
      .map((row) => ({
        list_id: row.list_id,
        list_name: mailLists.find((list) => list.id === row.list_id)?.name ?? "",
      })),
    meetings: meetingAttendees
      .filter((row) => row.email.toLowerCase() === email)
      .map((row) => ({
        id: row.meeting_id,
        title: meetings.find((meeting) => meeting.id === row.meeting_id)?.title ?? "",
      })),
    mail_messages: mailMessages.filter((row) => row.email_norm === email).length,
    suppressed: mailSuppressions.some((row) => row.email_norm === email && !row.released_at),
    consent: null,
    tickets: tickets
      .filter(
        (row) =>
          String(row.contact_email ?? "").toLowerCase() === email ||
          (account && String(row.account_id ?? "") === account),
      )
      .map((row) => ({ id: row.id, subject: row.subject })),
    tickets_searched: true,
  };
}

/**
 * A privacy desk with something at every stage: a request due this week, one overdue, one
 * with its clock stopped, one waiting on identity, an erasure, an objection, an
 * unacknowledged complaint and one answered; a misdirected export on the regulator's clock
 * with a DORA customer owed notice within hours; commitments with the usual departures;
 * the register of sub-processors with one change in its notice period and an objection.
 */
function seedPrivacy() {
  privacyRequests.length = 0;
  privacySearches.clear();
  privacyEvents.length = 0;
  incidents.length = 0;
  incidentCustomers.length = 0;
  commitmentsByCompany.clear();
  subprocessors.length = 0;
  subprocessorNotices.length = 0;
  erasedPeople.clear();
  const OWNER = "aa000000-0000-4000-8000-00000000000a";
  const SUPPORT = "aa000000-0000-4000-8000-00000000000d";
  const today = todayIso();
  const customers = [...pvActiveCustomers().keys()];

  // Commitments: most customers recorded, with the usual departures from the standard.
  customers.forEach((companyId, index) => {
    if (index % 12 === 11) return; // a few never recorded
    const company = companies.find((row) => row.id === companyId);
    const domain = company?.domain || "example.test";
    commitmentsByCompany.set(companyId, {
      company_id: companyId,
      contract_reference: `MSA-${2025 + (index % 2)}-${String(40 + index).padStart(3, "0")}`,
      privacy_contact_email: index % 17 === 16 ? "" : `dpo@${domain}`,
      incident_notice_hours: index % 11 === 0 ? 24 : index % 7 === 1 ? 48 : 72,
      subprocessor_notice_days: index % 13 === 2 ? 60 : 30,
      objection_window_days: index % 13 === 2 ? 45 : 30,
      audit_rights: index % 9 === 0 ? "onsite" : index % 4 === 1 ? "remote" : "questionnaire",
      data_locations: index % 3 === 0 ? "UK and EU only" : "",
      exit_assistance_days: index % 9 === 0 ? 90 : null,
      dora_classification:
        index % 11 === 0 ? "critical_important" : index % 11 === 5 ? "ict_service" : "none",
      material_outsourcing: index % 22 === 0,
      nonstandard_clauses:
        index === 2
          ? "Clause 14.3: incidents reported to their CISO by phone as well as in writing."
          : "",
      reviewed_on: addDaysIso(today, -30 - index * 3),
      updated_by: OWNER,
      updated_at: agoIso(24 * (30 + index)),
    });
  });

  // Requests.
  const withEmail = people.filter((row) => row.email && row.company_id);
  const person = (index: number) => withEmail[index % Math.max(withEmail.length, 1)];
  let serial = 0;
  let complaints = 0;
  const add = (input: Partial<PrivacyRequestRow> & { kind: string; received_on: string }) => {
    const complaint = input.kind === "complaint";
    const reference = complaint
      ? `PC-${input.received_on.slice(0, 4)}-${String(++complaints).padStart(4, "0")}`
      : `PR-${input.received_on.slice(0, 4)}-${String(++serial).padStart(4, "0")}`;
    const row: PrivacyRequestRow = {
      // Stable ids, so a demo link or a harness screen reaches the same request every time.
      id: `ad${String(serial + complaints).padStart(6, "0")}-0000-4000-8000-000000000000`,
      reference,
      regime: "uk_gdpr",
      channel: "email",
      requester_name: "",
      requester_email: "",
      person_id: "",
      company_id: "",
      description: "",
      identity_state: "not_needed",
      identity_confirmed_on: null,
      identity_method: "",
      fee_requested_on: null,
      fee_paid_on: null,
      status: "searching",
      paused_on: null,
      paused_question: "",
      paused_days: 0,
      extended: false,
      extension_reason: "",
      extension_told_on: null,
      acknowledged_on: null,
      responded_on: null,
      outcome: "",
      outcome_detail: "",
      assignee_staff_id: SUPPORT,
      created_at: `${input.received_on}T10:00:00Z`,
      updated_at: `${input.received_on}T10:00:00Z`,
      ...input,
    };
    privacyRequests.push(row);
    if (!complaint)
      for (const system of Object.keys(PV_SYSTEMS))
        privacySearches.set(`${row.id}|${system}`, {
          state: "pending",
          note: "",
          staff_id: "",
          at: null,
        });
    const due = pvDueOn(row);
    pvEvent(
      "request",
      row.id,
      "received",
      `Received ${pvDay(row.received_on)} by ${row.channel}.${due ? ` Due ${pvDay(due)}.` : ""}`,
      OWNER,
      `${row.received_on}T10:00:00Z`,
    );
    return row;
  };
  const from = (index: number) => {
    const found = person(index);
    return found
      ? {
          requester_name: found.full_name,
          requester_email: found.email.toLowerCase(),
          person_id: found.id,
          company_id: found.company_id,
        }
      : {};
  };

  // Due this week: two systems searched, the rest to go.
  const dueSoon = add({
    kind: "access",
    received_on: addDaysIso(addMonthsIso(today, -1), 4),
    ...from(0),
    description:
      "Please send me a copy of all personal data you hold about me, including call notes.",
  });
  for (const [system, state, note] of [
    ["crm", "found", "Person record, 6 notes, 2 meetings"],
    ["billing", "not_applicable", "Invoices name the firm, not the person"],
  ] as const) {
    privacySearches.set(`${dueSoon.id}|${system}`, {
      state,
      note,
      staff_id: SUPPORT,
      at: agoIso(20),
    });
    pvEvent(
      "request",
      dueSoon.id,
      "search",
      `${PV_SYSTEMS[system]}: ${state === "found" ? "found data" : "not applicable"} — ${note}`,
      SUPPORT,
      agoIso(20),
    );
  }
  // Overdue: nobody finished it.
  add({
    kind: "rectification",
    received_on: addDaysIso(addMonthsIso(today, -1), -4),
    ...from(1),
    description: "My job title and phone number are wrong in your records; please correct them.",
  });
  // Clock stopped while scoping.
  const stopped = add({
    kind: "access",
    received_on: addDaysIso(today, -12),
    ...from(2),
    status: "scoping",
    paused_on: addDaysIso(today, -6),
    paused_question:
      "Which period do you mean — only since you became a customer, or your trial in 2025 as well?",
    description: "I want everything you have on me.",
  });
  pvEvent(
    "request",
    stopped.id,
    "stop_clock",
    `Clock stopped on ${pvDay(stopped.paused_on)} while we wait for: ${stopped.paused_question}`,
    SUPPORT,
    agoIso(24 * 6),
  );
  // Waiting on identity: an address nobody knows.
  add({
    kind: "access",
    received_on: addDaysIso(today, -3),
    requester_name: "M. Hartley",
    requester_email: "m.hartley.private@example.net",
    identity_state: "requested",
    status: "identity",
    channel: "form",
    description: "Send me all data you hold about me. I used a different email before.",
  });
  // An erasure from someone with a lead and a person record.
  add({
    kind: "erasure",
    received_on: addDaysIso(today, -9),
    ...from(3),
    description: "Please delete my details. I left the firm last month.",
  });
  // An objection to marketing.
  add({
    kind: "objection",
    received_on: addDaysIso(today, -2),
    ...from(4),
    description: "Stop sending me your newsletters and research invitations.",
  });
  // A complaint not yet acknowledged.
  add({
    kind: "complaint",
    received_on: addDaysIso(today, -20),
    ...from(5),
    status: "received",
    description: "Your sales team phoned my mobile after I asked to be contacted by email only.",
  });
  // Answered last month.
  const answered = add({
    kind: "access",
    received_on: addDaysIso(today, -52),
    ...from(6),
    status: "responded",
    responded_on: addDaysIso(today, -30),
    outcome: "fulfilled",
    outcome_detail:
      "Sent a copy of the CRM record, 4 notes and the 11 messages we mailed, by secure link.",
  });
  for (const system of Object.keys(PV_SYSTEMS))
    privacySearches.set(`${answered.id}|${system}`, {
      state: system === "crm" || system === "mail" ? "found" : "none",
      note: system === "crm" ? "Person record and 4 notes" : system === "mail" ? "11 messages" : "",
      staff_id: SUPPORT,
      at: agoIso(24 * 32),
    });
  pvEvent(
    "request",
    answered.id,
    "respond",
    `Responded on ${pvDay(answered.responded_on)} (fulfilled): ${answered.outcome_detail}`,
    SUPPORT,
    agoIso(24 * 30),
  );

  // Incidents.
  const misdirected: IncidentRow = {
    id: "ae000003-0000-4000-8000-000000000000",
    reference: `INC-${today.slice(0, 4)}-0003`,
    title: "Weekly usage export mailed to the wrong customer",
    summary:
      "The Monday seat-usage export for one firm went to another firm's admin. It lists 38 named users with work emails and last-active times. The recipient has confirmed deletion in writing.",
    kind: "misdirected",
    severity: "high",
    status: "contained",
    personal_data: true,
    occurred_at: agoIso(22),
    detected_at: agoIso(20),
    aware_at: agoIso(19),
    contained_at: agoIso(6),
    resolved_at: null,
    data_categories: "Customer staff: names, work emails, last-active times",
    subjects_estimate: 38,
    records_estimate: 38,
    risk: "",
    risk_reason: "",
    assessed_by: "",
    assessed_at: null,
    regulator_notified_at: null,
    regulator_reference: "",
    late_reason: "",
    individuals_notified_at: null,
    lessons: "",
    lead_staff_id: OWNER,
    created_at: agoIso(20),
  };
  incidents.push(misdirected);
  pvEvent(
    "incident",
    misdirected.id,
    "logged",
    `Logged. Personal data involved: the regulator's 72 hours run from ${pvMoment(misdirected.aware_at)}.`,
    OWNER,
    misdirected.detected_at,
  );
  pvEvent(
    "incident",
    misdirected.id,
    "status",
    `Marked contained: the recipient confirmed deletion in writing.`,
    OWNER,
    misdirected.contained_at!,
  );
  const affected = customers.filter((id) => commitmentsByCompany.has(id)).slice(0, 2);
  for (const companyId of affected) {
    const hours = commitmentsByCompany.get(companyId)?.incident_notice_hours ?? null;
    incidentCustomers.push({
      incident_id: misdirected.id,
      company_id: companyId,
      due_at: hours
        ? new Date(Date.parse(misdirected.aware_at!) + hours * 3_600_000)
            .toISOString()
            .replace(/\.\d{3}Z$/, "Z")
        : null,
      notified_at: null,
      note: "",
    });
  }
  const laptop: IncidentRow = {
    ...misdirected,
    id: "ae000002-0000-4000-8000-000000000000",
    reference: `INC-${today.slice(0, 4)}-0002`,
    title: "Staff laptop left on a train",
    summary:
      "Recovered by the operator two days later. Full-disk encryption on, locked; the device was wiped remotely within the hour.",
    kind: "security",
    severity: "medium",
    status: "resolved",
    occurred_at: agoIso(24 * 26),
    detected_at: agoIso(24 * 26),
    aware_at: agoIso(24 * 26),
    contained_at: agoIso(24 * 26 - 1),
    resolved_at: agoIso(24 * 24),
    data_categories: "CRM cache on the device",
    subjects_estimate: null,
    records_estimate: null,
    risk: "none",
    risk_reason: "Encrypted and locked; wiped within the hour. No realistic access to the data.",
    assessed_by: OWNER,
    assessed_at: agoIso(24 * 26 - 3),
    lessons: "",
    created_at: agoIso(24 * 26),
  };
  incidents.push(laptop);
  pvEvent("incident", laptop.id, "logged", "Logged.", OWNER, laptop.detected_at);
  pvEvent(
    "incident",
    laptop.id,
    "assess",
    `Assessed: ${PV_RISKS.none}. ${laptop.risk_reason}`,
    OWNER,
    laptop.assessed_at!,
  );
  const outage: IncidentRow = {
    ...misdirected,
    id: "ae000001-0000-4000-8000-000000000000",
    reference: `INC-${today.slice(0, 4)}-0001`,
    title: "Charts unavailable for 47 minutes",
    summary:
      "The price service's upstream throttled us; charts showed a stale banner until the fallback took over.",
    kind: "availability",
    severity: "low",
    status: "closed",
    personal_data: false,
    occurred_at: agoIso(24 * 40),
    detected_at: agoIso(24 * 40),
    aware_at: null,
    contained_at: agoIso(24 * 40 - 1),
    resolved_at: agoIso(24 * 40 - 1),
    data_categories: "",
    subjects_estimate: null,
    records_estimate: null,
    risk: "",
    lessons: "The fallback now takes over after two failed calls, not five.",
    created_at: agoIso(24 * 40),
  };
  incidents.push(outage);
  pvEvent("incident", outage.id, "logged", "Logged.", OWNER, outage.detected_at);
  pvEvent("incident", outage.id, "status", "Marked closed.", OWNER, outage.resolved_at!);

  // Sub-processors: the register as it stands, and one change in its notice period.
  const register: Array<
    Omit<SubprocessorRow, "id" | "status" | "notice_sent_on" | "effective_on" | "retired_on">
  > = [
    {
      legal_name: "Northgate Cloud Ltd",
      service: "Hosting and database",
      purpose: "Runs the service and stores account data",
      data_categories: "Account holders: names, emails, usage",
      locations: "EU (Ireland, Netherlands)",
      transfer_mechanism: "adequacy",
      dpa_signed_on: "2025-03-02",
      activated_on: "2025-03-10",
    },
    {
      legal_name: "Edgeline Inc.",
      service: "Web hosting",
      purpose: "Serves the website and the account console",
      data_categories: "Visitors: IP addresses, request logs",
      locations: "United States, EU",
      transfer_mechanism: "scc_uk_addendum",
      dpa_signed_on: "2025-03-02",
      activated_on: "2025-03-10",
    },
    {
      legal_name: "Parcel Mail SAS",
      service: "Email delivery",
      purpose: "Sends account, support and outbound mail",
      data_categories: "Recipients: names, emails, delivery events",
      locations: "EU (France)",
      transfer_mechanism: "adequacy",
      dpa_signed_on: "2025-04-11",
      activated_on: "2025-04-15",
    },
    {
      legal_name: "Calendra Ltd",
      service: "Calendar",
      purpose: "Books demos and syncs meetings",
      data_categories: "Invitees: names, emails, meeting times",
      locations: "United Kingdom",
      transfer_mechanism: "not_needed",
      dpa_signed_on: "2025-06-01",
      activated_on: "2025-06-03",
    },
  ];
  register.forEach((entry, index) =>
    subprocessors.push({
      ...entry,
      id: `af${String(index + 1).padStart(6, "0")}-0000-4000-8000-000000000000`,
      status: "active",
      notice_sent_on: null,
      effective_on: null,
      retired_on: null,
    }),
  );
  for (const row of subprocessors)
    pvEvent(
      "subprocessor",
      row.id,
      "created",
      `Recorded as in use since ${pvDay(row.activated_on)}.`,
      OWNER,
      `${row.activated_on}T09:00:00Z`,
    );
  const proposed: SubprocessorRow = {
    id: "af000009-0000-4000-8000-000000000000",
    legal_name: "Ledgerline Analytics Ltd",
    service: "Product analytics",
    purpose: "Counts which features each firm uses, to decide what to build next",
    data_categories: "Account holders: user ids, feature events (no names or emails)",
    locations: "EU (Germany)",
    transfer_mechanism: "adequacy",
    dpa_signed_on: addDaysIso(today, -14),
    status: "notice_sent",
    notice_sent_on: addDaysIso(today, -8),
    effective_on: null,
    activated_on: null,
    retired_on: null,
  };
  subprocessors.push(proposed);
  pvEvent(
    "subprocessor",
    proposed.id,
    "created",
    "Proposed. Customers are told before it goes live.",
    OWNER,
    agoIso(24 * 14),
  );
  const told = customers.filter((id) => commitmentsByCompany.get(id)?.privacy_contact_email);
  told.forEach((companyId, index) => {
    const sent = addDaysIso(today, -8);
    subprocessorNotices.push({
      subprocessor_id: proposed.id,
      company_id: companyId,
      sent_to: commitmentsByCompany.get(companyId)!.privacy_contact_email,
      sent_on: sent,
      objection_deadline: addDaysIso(sent, pvObjectionDays(companyId)),
      objected_on: index === 1 ? addDaysIso(today, -3) : null,
      objection:
        index === 1
          ? "Our data must not leave the UK; please confirm the events carry no personal data."
          : "",
      resolution: "",
      resolved_on: null,
    });
  });
  proposed.effective_on = pvEffectiveOn(proposed.id);
  pvEvent(
    "subprocessor",
    proposed.id,
    "send_notices",
    `Notice mailed to ${told.length} customer(s). Not sent — no privacy contact: ${customers.length - told.length}.`,
    OWNER,
    agoIso(24 * 8),
  );
}

// --- the inbox (mirrors inbox.py) ----------------------------------------------------------------

type NotificationRow = {
  id: string;
  recipient_id: string;
  subject_type: string;
  subject_id: string;
  subject_label: string;
  link_path: string;
  reason: string;
  actor_id: string;
  summary: string;
  event_count: number;
  first_at: string;
  last_at: string;
  read_at: string | null;
  done_at: string | null;
  snoozed_until: string | null;
  emailed_at: string | null;
};
const INBOX_REASONS: Record<string, [number, string]> = {
  security: [90, "Security"],
  review: [80, "Waiting on you"],
  mention: [70, "Mentioned"],
  assigned: [60, "Assigned"],
  reply: [50, "Reply"],
  reminder: [40, "Reminder"],
  state: [30, "Update"],
  activity: [20, "Activity"],
};
const INBOX_PAGES: Record<string, string> = {
  company: "/companies/{id}",
  person: "/people/{id}",
  deal: "/deals/{id}",
  lead: "/leads/{id}",
  meeting: "/meetings/{id}",
  ticket: "/support/{id}",
  contract: "/revenue/contracts/{id}",
  approval: "/admin/approvals",
  security: "/admin/security",
  task: "/tasks",
  privacy_request: "/privacy/requests/{id}",
  incident: "/privacy/incidents/{id}",
};
const INBOX_SPECIFICITY = ["deal", "lead", "meeting", "person", "company"];
const notifications: NotificationRow[] = [];
const inboxSubscriptions = new Map<
  string,
  { staff_id: string; subject_type: string; subject_id: string; reason: string; muted: boolean }
>();
type ReminderRow = {
  id: string;
  staff_id: string;
  subject_type: string;
  subject_id: string;
  subject_label: string;
  link_path: string;
  note: string;
  remind_at: string;
  fired_at: string | null;
  cancelled_at: string | null;
};
const inboxReminders: ReminderRow[] = [];
const notificationPrefs = new Map<
  string,
  {
    email_mode: string;
    delay_minutes: number;
    quiet_from: number | null;
    quiet_to: number | null;
    time_zone: string;
  }
>();

function inboxLink(subjectType: string, subjectId: string): string {
  const template = INBOX_PAGES[subjectType] ?? "/home";
  return template.replace("{id}", subjectId);
}

function inboxLabel(subjectType: string, subjectId: string): string {
  if (subjectType === "company") return companies.find((row) => row.id === subjectId)?.name ?? "";
  if (subjectType === "person") return people.find((row) => row.id === subjectId)?.full_name ?? "";
  if (subjectType === "deal") return deals.find((row) => row.id === subjectId)?.name ?? "";
  if (subjectType === "lead") {
    const lead = leads.find((row) => row.id === subjectId);
    return lead ? lead.full_name || lead.company_name : "";
  }
  if (subjectType === "task") return tasks.find((row) => row.id === subjectId)?.title ?? "";
  if (subjectType === "privacy_request")
    return privacyRequests.find((row) => row.id === subjectId)?.reference ?? "";
  if (subjectType === "incident")
    return incidents.find((row) => row.id === subjectId)?.reference ?? "";
  return "";
}

function subscriptionKey(staffId: string, subjectType: string, subjectId: string) {
  return `${staffId}|${subjectType}|${subjectId.toLowerCase()}`;
}

/** Mirrors inbox.subscribe: never overrides a mute or an earlier choice. */
function inboxSubscribe(staffId: string, subjectType: string, subjectId: string, reason: string) {
  if (!staffId || !subjectId) return;
  const key = subscriptionKey(staffId, subjectType, subjectId);
  if (inboxSubscriptions.has(key)) return;
  inboxSubscriptions.set(key, {
    staff_id: staffId,
    subject_type: subjectType,
    subject_id: subjectId.toLowerCase(),
    reason,
    muted: false,
  });
}

function inboxFollowers(subjectType: string, subjectId: string): string[] {
  return [...inboxSubscriptions.values()]
    .filter(
      (row) =>
        row.subject_type === subjectType &&
        row.subject_id === subjectId.toLowerCase() &&
        !row.muted,
    )
    .map((row) => row.staff_id);
}

function inboxState(row: NotificationRow): string {
  if (row.done_at) return "done";
  if (row.snoozed_until && row.snoozed_until > now()) return "snoozed";
  return row.read_at ? "read" : "unread";
}

/** Mirrors inbox.notify: folds into the open row for the subject, unread again. */
function inboxNotify(input: {
  recipients: string[];
  subject_type: string;
  subject_id: string;
  subject_label?: string;
  reason: string;
  summary: string;
  actor_id?: string;
  link_path?: string;
  at?: string;
}): number {
  const at = input.at ?? now();
  const subjectId = input.subject_id.toLowerCase();
  const label = input.subject_label ?? inboxLabel(input.subject_type, subjectId);
  const link = input.link_path || inboxLink(input.subject_type, subjectId);
  let written = 0;
  for (const recipient of new Set(input.recipients.filter(Boolean))) {
    if (recipient === input.actor_id) continue;
    if (!staff.some((member) => member.id === recipient && member.is_active)) continue;
    const open = notifications.find(
      (row) =>
        row.recipient_id === recipient &&
        row.subject_type === input.subject_type &&
        row.subject_id === subjectId &&
        !row.done_at,
    );
    if (open) {
      const kept = INBOX_REASONS[open.reason]?.[0] ?? 0;
      if ((INBOX_REASONS[input.reason]?.[0] ?? 0) >= kept) open.reason = input.reason;
      open.event_count += 1;
      open.last_at = at;
      open.summary = input.summary.slice(0, 400);
      open.actor_id = input.actor_id ?? "";
      open.subject_label = label;
      open.read_at = null;
      open.snoozed_until = null;
    } else {
      notifications.push({
        id: randomUUID(),
        recipient_id: recipient,
        subject_type: input.subject_type,
        subject_id: subjectId,
        subject_label: label,
        link_path: link,
        reason: input.reason,
        actor_id: input.actor_id ?? "",
        summary: input.summary.slice(0, 400),
        event_count: 1,
        first_at: at,
        last_at: at,
        read_at: null,
        done_at: null,
        snoozed_until: null,
        emailed_at: null,
      });
    }
    written += 1;
  }
  return written;
}

/** Mirrors inbox.assigned. */
function inboxAssigned(
  staffId: string,
  subjectType: string,
  subjectId: string,
  actor: Staff | undefined,
  summary: string,
  label?: string,
  linkPath?: string,
) {
  if (!staffId || staffId === actor?.id) return;
  if (subjectType !== "task") inboxSubscribe(staffId, subjectType, subjectId, "assigned");
  inboxNotify({
    recipients: [staffId],
    subject_type: subjectType,
    subject_id: subjectId,
    ...(label !== undefined ? { subject_label: label } : {}),
    reason: "assigned",
    summary,
    actor_id: actor?.id ?? "",
    ...(linkPath ? { link_path: linkPath } : {}),
  });
}

/** Mirrors inbox.notify_linked. */
function inboxNotifyLinked(
  links: Record<string, string>,
  summary: string,
  actorId: string,
  exclude: string[],
) {
  const present = INBOX_SPECIFICITY.filter((kind) => links[`${kind}_id`]).map(
    (kind) => [kind, links[`${kind}_id`]!.toLowerCase()] as const,
  );
  if (!present.length) return;
  inboxSubscribe(actorId, present[0]![0], present[0]![1], "author");
  const seen = new Set<string>([...exclude, actorId]);
  for (const [kind, id] of present) {
    const recipients = inboxFollowers(kind, id).filter((staffId) => !seen.has(staffId));
    recipients.forEach((staffId) => seen.add(staffId));
    if (recipients.length)
      inboxNotify({
        recipients,
        subject_type: kind,
        subject_id: id,
        reason: "activity",
        summary,
        actor_id: actorId,
      });
  }
}

function inboxFireReminders(staffId?: string) {
  for (const row of inboxReminders) {
    if (row.fired_at || row.cancelled_at || row.remind_at > now()) continue;
    if (staffId && row.staff_id !== staffId) continue;
    inboxNotify({
      recipients: [row.staff_id],
      subject_type: row.subject_type,
      subject_id: row.subject_id,
      subject_label: row.subject_label,
      reason: "reminder",
      summary: `You asked to be reminded${row.note ? `: ${row.note}` : "."}`,
      link_path: row.link_path,
    });
    row.fired_at = now();
  }
}

function notificationView(row: NotificationRow) {
  return {
    notification_id: row.id,
    reason: row.reason,
    reason_label: INBOX_REASONS[row.reason]?.[1] ?? row.reason,
    subject_type: row.subject_type,
    subject_id: row.subject_id,
    subject_label: row.subject_label,
    link_path: row.link_path,
    actor: row.actor_id ? personOf(row.actor_id) : null,
    summary: row.summary,
    event_count: row.event_count,
    first_at: row.first_at,
    last_at: row.last_at,
    state: inboxState(row),
    snoozed_until: row.snoozed_until,
  };
}

function inboxUnread(staffId: string): number {
  return notifications.filter((row) => row.recipient_id === staffId && inboxState(row) === "unread")
    .length;
}

function notificationPrefsFor(staffId: string) {
  return (
    notificationPrefs.get(staffId) ?? {
      email_mode: "unread",
      delay_minutes: 15,
      quiet_from: null,
      quiet_to: null,
      time_zone: "UTC",
    }
  );
}

function resetInbox() {
  notifications.length = 0;
  inboxSubscriptions.clear();
  inboxReminders.length = 0;
  notificationPrefs.clear();
}

/** A morning's worth for the owner: something of every kind, a reminder waiting. */
function seedInbox() {
  const OWNER = "aa000000-0000-4000-8000-00000000000a";
  const ADMIN = "aa000000-0000-4000-8000-00000000000b";
  const SALES = "aa000000-0000-4000-8000-00000000000c";
  const SUPPORT = "aa000000-0000-4000-8000-00000000000d";
  // Security rows the seeds raised: anything older than a day is already dealt with.
  for (const row of notifications)
    if (row.reason === "security" && Date.parse(row.last_at) < Date.now() - 86_400_000) {
      row.read_at = row.last_at;
      row.done_at = row.last_at;
    }
  const firstDeal = deals.find((deal) => deal.status === "open");
  const secondDeal = deals.filter((deal) => deal.status === "open")[3];
  const firm = companies[2];
  const ticket = tickets.find((row) => row.status !== "resolved");
  const pendingApproval = approvals.find((row) => row.status === "pending");
  if (pendingApproval)
    inboxNotify({
      recipients: [OWNER],
      subject_type: "approval",
      subject_id: pendingApproval.id,
      subject_label: `${approvalSummary(pendingApproval.kind, pendingApproval.payload).charAt(0).toUpperCase()}${approvalSummary(pendingApproval.kind, pendingApproval.payload).slice(1)}`,
      reason: "review",
      summary: `${nameOf(pendingApproval.requested_by)} asked for your approval. Reason given: ${pendingApproval.reason}.`,
      actor_id: pendingApproval.requested_by,
      at: pendingApproval.requested_at,
    });
  if (firstDeal) {
    inboxSubscribe(OWNER, "deal", firstDeal.id, "author");
    inboxNotify({
      recipients: [OWNER],
      subject_type: "deal",
      subject_id: firstDeal.id,
      reason: "mention",
      summary: `Sales Person: \u201c@owner their COO wants a call before the proposal — can you take Thursday?\u201d`,
      actor_id: SALES,
      at: agoIso(1.2),
    });
  }
  if (secondDeal) {
    inboxSubscribe(OWNER, "deal", secondDeal.id, "manual");
    for (const [hours, text] of [
      [7, "Sales Person logged a call: \u201cTrial seats used every day this week.\u201d"],
      [
        4,
        "Sales Person logged an email sent: \u201cSent the security questionnaire answers.\u201d",
      ],
      [
        2.5,
        "Sales Person logged a note: \u201cProcurement wants the DPA redlines by Friday.\u201d",
      ],
    ] as const)
      inboxNotify({
        recipients: [OWNER],
        subject_type: "deal",
        subject_id: secondDeal.id,
        reason: "activity",
        summary: text,
        actor_id: SALES,
        at: agoIso(hours),
      });
  }
  if (ticket) {
    inboxSubscribe(OWNER, "ticket", ticket.id, "assigned");
    inboxNotify({
      recipients: [OWNER],
      subject_type: "ticket",
      subject_id: ticket.id,
      subject_label: ticket.subject,
      reason: "reply",
      summary: `${ticket.contact_email || "The customer"} wrote: \u201cStill seeing the old prices after the update — screenshots attached.\u201d`,
      at: agoIso(0.6),
    });
  }
  inboxNotify({
    recipients: [OWNER],
    subject_type: "task",
    subject_id: randomUUID(),
    subject_label: "Sign the Q4 renewal letters",
    reason: "assigned",
    summary: "The Admin gave you a task: Sign the Q4 renewal letters, due in two days",
    actor_id: ADMIN,
    link_path: "/tasks",
    at: agoIso(20),
  });
  if (firm) {
    inboxSubscribe(OWNER, "company", firm.id, "manual");
    const read = inboxNotify({
      recipients: [OWNER],
      subject_type: "company",
      subject_id: firm.id,
      reason: "activity",
      summary:
        "Desk Person logged a note: \u201cTheir analysts asked for the Asia session times.\u201d",
      actor_id: SUPPORT,
      at: agoIso(26),
    });
    void read;
    const row = notifications.find(
      (candidate) => candidate.subject_id === firm.id && candidate.recipient_id === OWNER,
    );
    if (row) row.read_at = agoIso(25);
    inboxReminders.push({
      id: "ae000000-0000-4000-8000-000000000001",
      staff_id: OWNER,
      subject_type: "company",
      subject_id: firm.id,
      subject_label: firm.name,
      link_path: `/companies/${firm.id}`,
      note: "Renewal call — ask about the second desk",
      remind_at: new Date(Date.now() + 2 * 86_400_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      fired_at: null,
      cancelled_at: null,
    });
  }
  // Something already done, for the Done view.
  inboxNotify({
    recipients: [OWNER],
    subject_type: "task",
    subject_id: randomUUID(),
    subject_label: "Approve the September invoices",
    reason: "assigned",
    summary: "The Admin gave you a task: Approve the September invoices",
    actor_id: ADMIN,
    link_path: "/tasks",
    at: agoIso(72),
  });
  const done = notifications[notifications.length - 1];
  if (done) {
    done.read_at = agoIso(70);
    done.done_at = agoIso(70);
  }
}

function seedSecurityFeed() {
  securityEvents.length = 0;
  staffDevices.length = 0;
  enrolTickets.clear();
  reportTokens.clear();
  const OWNER = "aa000000-0000-4000-8000-00000000000a";
  const ADMIN = "aa000000-0000-4000-8000-00000000000b";
  const SALES = "aa000000-0000-4000-8000-00000000000c";
  const SUPPORT = "aa000000-0000-4000-8000-00000000000d";
  const INTERN = "aa000000-0000-4000-8000-00000000000e";
  const seeded: Array<[string, string, string, Partial<SecurityEventRow>]> = [
    [
      "account.reported",
      SALES,
      "Sales Person said this wasn't them: Signed in from Firefox on Windows, a device this account had not used, from 192.0.2.66.",
      {
        occurred_at: agoIso(24 * 12),
        ip: "192.0.2.66",
        state: "resolved",
        handled_by: OWNER,
        handled_at: agoIso(24 * 12 - 3),
        note: "A family laptop signed in with a saved password. Password changed; the audit log shows two reads, no exports.",
        detail: { sessions_revoked: 2 },
      },
    ],
    [
      "recovery.used",
      INTERN,
      "A recovery code was used to sign in.",
      {
        occurred_at: agoIso(26),
        ip: "81.2.69.160",
        state: "acknowledged",
        handled_by: ADMIN,
        handled_at: agoIso(25),
        note: "Phone in for repair; confirmed with them on a call.",
        detail: { remaining: 9 },
      },
    ],
    [
      "passkey.added",
      OWNER,
      "A passkey named \u201cWork laptop\u201d was added to your account; it can stand in for your authenticator code.",
      { occurred_at: agoIso(72), ip: "198.51.100.20", detail: { label: "Work laptop" } },
    ],
    [
      "sign_in.unusual",
      ADMIN,
      "Your account was signed in to from the address 203.0.113.9, and it followed six failed sign-ins from that address within the hour.",
      {
        occurred_at: agoIso(5),
        ip: "203.0.113.9",
        detail: { rules: ["failures_first"] },
      },
    ],
    [
      "sign_in.new_device",
      SUPPORT,
      "Signed in from Safari on iOS, a device this account had not used, from 198.51.100.7.",
      { occurred_at: agoIso(2), ip: "198.51.100.7", detail: { device: "Safari on iOS" } },
    ],
  ];
  for (const [kind, subject, summary, extra] of seeded)
    recordSecurityEvent(kind, subject, summary, extra);
  securityEvents.sort((a, b) => b.occurred_at.localeCompare(a.occurred_at));
  // A stable lock link the harness can open: the new-device event above.
  const newest = securityEvents.find((row) => row.kind === "sign_in.new_device");
  if (newest) reportTokens.set("hqr_mock_demo", { staffId: SUPPORT, eventId: newest.id });
  staffDevices.push(
    {
      id: "dd000000-0000-4000-8000-000000000001",
      staff_id: OWNER,
      device_hash: deviceHash("mock-device-owner-laptop-000000000"),
      label: "Chrome on macOS",
      first_seen_at: agoIso(24 * 28),
      last_seen_at: agoIso(1),
      last_ip: "198.51.100.20",
    },
    {
      id: "dd000000-0000-4000-8000-000000000002",
      staff_id: OWNER,
      device_hash: deviceHash("mock-device-owner-phone-0000000000"),
      label: "Safari on iOS",
      first_seen_at: agoIso(24 * 9),
      last_seen_at: agoIso(30),
      last_ip: "81.2.69.160",
    },
  );
}

/** The key a collected request mints; the same shape the create route makes. */
function mintKeyRow(
  name: string,
  lifetime: number,
  createdBy: string,
): { row: ApiKeyRow; secret: string } {
  const prefix = randomUUID().replace(/-/g, "").slice(0, 8);
  const secret = `qthq_${prefix}_${randomUUID().replace(/-/g, "")}`;
  const row: ApiKeyRow = {
    key_id: randomUUID(),
    name,
    prefix,
    scopes: ["leads:create"],
    created_by: createdBy,
    created_at: now(),
    last_used_at: null,
    revoked_at: null,
    expires_at: new Date(Date.now() + lifetime * 86_400_000).toISOString(),
  };
  apiKeys.push(row);
  return { row, secret };
}

function seedApprovals() {
  approvals.length = 0;
  // The admin asked for a key: the owner can decide it.
  approvals.push({
    id: "ab000000-0000-4000-8000-000000000001",
    kind: "api_key",
    status: "pending",
    requested_by: "aa000000-0000-4000-8000-00000000000b",
    requested_at: agoIso(3),
    expires_at: hoursFromNowIso(45),
    target_staff_id: "",
    payload: { name: "Website early-access form", scopes: ["leads:create"], expires_in_days: 180 },
    reason: "The old key expires on Friday",
    decided_by: "",
    decided_at: null,
    decision_note: "",
    result_id: "",
  });
  // The owner asked for one last week; the admin declined it.
  approvals.push({
    id: "ab000000-0000-4000-8000-000000000002",
    kind: "api_key",
    status: "declined",
    requested_by: "aa000000-0000-4000-8000-00000000000a",
    requested_at: agoIso(24 * 6),
    expires_at: agoIso(24 * 4),
    target_staff_id: "",
    payload: { name: "Partner site", scopes: ["leads:create"], expires_in_days: 90 },
    reason: "A partner wants to post leads",
    decided_by: "aa000000-0000-4000-8000-00000000000b",
    decided_at: agoIso(24 * 6 - 2),
    decision_note: "Rotate the existing key first.",
    result_id: "",
  });
}

/** What the sign-in rules and the new-device mail found lately; rows the audit log shows. */
function seedSecurityEvents() {
  for (let index = auditEvents.length - 1; index >= 0; index -= 1) {
    if (String(auditEvents[index]!.correlation_id ?? "").startsWith("seed-security")) {
      auditEvents.splice(index, 1);
    }
  }
  const rows: Array<Record<string, unknown>> = [
    {
      occurred_at: agoIso(5),
      staff_id: "aa000000-0000-4000-8000-00000000000b",
      actor_label: "",
      action: "auth.anomalous",
      entity_type: "session",
      entity_id: randomUUID(),
      reason: "",
      detail: {
        rules: ["failures_first"],
        findings: [{ rule: "failures_first", failures: 6, minutes: 60 }],
        address: "203.0.113.9",
      },
      correlation_id: "seed-security-1",
      ip: "203.0.113.9",
    },
    {
      occurred_at: agoIso(48),
      staff_id: "aa000000-0000-4000-8000-00000000000c",
      actor_label: "",
      action: "auth.new_device",
      entity_type: "session",
      entity_id: randomUUID(),
      reason: "",
      detail: { device: "Safari on iOS", mailed: true },
      correlation_id: "seed-security-2",
      ip: "198.51.100.7",
    },
  ];
  for (let attempt = 0; attempt < 3; attempt += 1) {
    rows.push({
      occurred_at: agoIso(6),
      staff_id: "aa000000-0000-4000-8000-00000000000c",
      actor_label: "",
      action: "auth.login_failed",
      entity_type: "staff",
      entity_id: "aa000000-0000-4000-8000-00000000000c",
      reason: "",
      detail: {},
      correlation_id: `seed-security-f${attempt}`,
      ip: "203.0.113.9",
    });
  }
  auditEvents.push(...rows);
}

function countAudit(action: string, sinceHours: number): number {
  const since = Date.now() - sinceHours * 3_600_000;
  return auditEvents.filter(
    (row) => row.action === action && Date.parse(String(row.occurred_at)) >= since,
  ).length;
}

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
    forecast_category: inEffectiveCategory(row),
    forecast_override: isOpen ? (row.forecast_category ?? "") : "",
    push_count: row.push_count ?? 0,
    first_close_date: row.first_close_date ?? "",
    next_step_stale:
      isOpen &&
      Date.now() - Date.parse(row.next_step_changed_at ?? row.created_at) >
        IN_STALE_STEP_DAYS * 86_400_000,
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
  if (mentioned.length && entityId && entityType in INBOX_PAGES) {
    const by = staff.find((member) => member.id === callerId);
    for (const staffId of mentioned) inboxSubscribe(staffId, entityType, entityId, "mentioned");
    inboxNotify({
      recipients: mentioned,
      subject_type: entityType,
      subject_id: entityId,
      reason: "mention",
      summary: `${by?.display_name || by?.email || "A colleague"}: \u201c${text.slice(0, 300)}\u201d`,
      actor_id: callerId,
    });
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
      inboxFireReminders(found.member.id);
      const unreadRows = notifications
        .filter((row) => row.recipient_id === found.member.id && inboxState(row) === "unread")
        .sort((a, b) => b.last_at.localeCompare(a.last_at));
      payload.inbox = {
        unread: unreadRows.length,
        items: unreadRows.slice(0, 5).map(notificationView),
        available: true,
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
      if (capabilities.includes("hq:admin")) {
        expireStaleApprovals();
        const pending = approvals
          .filter((row) => approvalStatus(row) === "pending")
          .map((row) => approvalView(row, found.member));
        const approved = approvals
          .filter((row) => approvalStatus(row) === "approved")
          .map((row) => approvalView(row, found.member));
        payload.approvals = {
          pending: pending.length,
          awaiting_me: pending.filter((view) => view.can_decide).length,
          to_collect: approved.filter((view) => view.can_collect).length,
          approvals: pending.slice(0, 5),
        };
        const latest = auditEvents
          .filter((row) => row.action === "auth.anomalous")
          .sort((a, b) => String(b.occurred_at).localeCompare(String(a.occurred_at)))
          .slice(0, 5);
        const openEvents = securityEvents.filter((row) => row.state === "open");
        payload.security = {
          open_events: openEvents.length,
          critical_open: openEvents.filter((row) => row.severity === "critical").length,
          anomalies_7d: countAudit("auth.anomalous", 24 * 7),
          new_devices_7d: countAudit("auth.new_device", 24 * 7),
          failed_logins_24h: countAudit("auth.login_failed", 24),
          latest: latest.map((row) => {
            const detail = (row.detail ?? {}) as Record<string, unknown>;
            return {
              occurred_at: row.occurred_at,
              staff_id: String(row.staff_id ?? ""),
              name: nameOf(String(row.staff_id ?? "")),
              rules: Array.isArray(detail.rules) ? detail.rules.map(String) : [],
              address: String(detail.address ?? row.ip ?? ""),
            };
          }),
        };
      }
      if (capabilities.includes("crm:write")) {
        const maySend = capabilities.includes("mail:send");
        const byState = (state: string) =>
          mailCampaigns.filter((row) => row.state === state).length;
        payload.mail = {
          running: byState("running") + byState("scheduled"),
          awaiting_approval: maySend ? byState("review") : 0,
          paused: byState("paused") + byState("auto_paused"),
          awaiting_reply: mailEnrolments.filter(
            (row) =>
              row.state === "active" &&
              (maySend || row.owner_staff_id === found.member.id) &&
              mailEnrolmentView(row).awaiting_reply,
          ).length,
          sending_enabled: mailSettings.sending_enabled,
          sent_today: mailSentToday(),
          daily_cap: mailSettings.global_daily_cap,
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
      if ("owner_staff_id" in body) {
        const next = String(body.owner_staff_id ?? "");
        const actor = caller(headers)?.member;
        if (next && next !== row.owner_staff_id)
          inboxAssigned(
            next,
            "company",
            row.id,
            actor,
            `${actor?.display_name || "A colleague"} made you the owner of this company.`,
          );
        row.owner_staff_id = next;
      }
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
      if (body.do_not_contact === true) mailCrmEvent("do_not_contact", { person_id: row.id });
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
      if ("owner_staff_id" in body) {
        const next = String(body.owner_staff_id ?? "");
        const actor = caller(headers)?.member;
        if (next && next !== row.owner_staff_id)
          inboxAssigned(
            next,
            "lead",
            row.id,
            actor,
            `${actor?.display_name || "A colleague"} made you the owner of this lead.`,
          );
        row.owner_staff_id = next;
      }
      row.updated_at = now();
      if (stage) mailCrmEvent("lead_stage", { lead_id: row.id, stage });
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
      mailCrmEvent("deal", { company_id: row.company_id });
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
        competitors: inDealCompetitors(row.id),
        competitor_options: competitors
          .filter((card) => !card.archived_at)
          .sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()))
          .map((card) => ({ id: card.id, name: card.name })),
        interviews: interviews.filter((item) => item.deal_id === row.id).map(inInterviewView),
        forecast_categories: IN_SETTABLE.map((value) => ({ value, label: IN_CATEGORIES[value] })),
        drivers: Object.entries(IN_DRIVERS).map(([value, label]) => ({ value, label })),
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
      if ("forecast_category" in body) {
        const category = String(body.forecast_category ?? "").trim();
        if (category && !IN_SETTABLE.includes(category))
          return refuse(400, "malformed_request", {
            forecast_category: "pipeline, best_case, commit, omitted, or empty for the stage's",
          });
        if (row.status !== "open")
          return refuse(400, "malformed_request", {
            forecast_category: "only an open deal is forecast",
          });
        row.forecast_category = category || null;
      }
      if ("expected_close_date" in body) {
        const before = row.expected_close_date;
        const after = String(body.expected_close_date ?? "");
        // Each move into a later month counts, for good; the first date given is kept.
        const push = inPushKind(before, after);
        if (push === "month" || push === "quarter") row.push_count = (row.push_count ?? 0) + 1;
        if (!row.first_close_date && (before || after)) row.first_close_date = before || after;
        row.expected_close_date = after;
      }
      if ("next_step" in body || "next_step_due" in body) {
        const nextStep = String(body.next_step ?? row.next_step).trim();
        const nextStepDue = String(body.next_step_due ?? row.next_step_due).trim();
        if (row.status === "open" && (!nextStep || !nextStepDue))
          return refuse(400, "malformed_request", {
            next_step: "an open deal names its next step",
          });
        if (nextStep !== row.next_step || nextStepDue !== row.next_step_due)
          row.next_step_changed_at = now();
        row.next_step = nextStep;
        row.next_step_due = nextStepDue;
      }
      if ("owner_staff_id" in body) {
        const next = String(body.owner_staff_id ?? "");
        const actor = caller(headers)?.member;
        if (next && next !== row.owner_staff_id)
          inboxAssigned(
            next,
            "deal",
            row.id,
            actor,
            `${actor?.display_name || "A colleague"} made you the owner of this deal.`,
          );
        row.owner_staff_id = next;
      }
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
      row.next_step_changed_at = now();
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
      const words: Record<string, string> = {
        note: "a note",
        call: "a call",
        email_out: "an email sent",
        email_in: "an email received",
      };
      inboxNotifyLinked(
        { ...links, meeting_id: meetingId },
        `${found?.member.display_name || found?.member.email || "A colleague"} logged ${words[kind] ?? "a note"}: \u201c${text.slice(0, 240)}\u201d`,
        found?.member.id ?? "",
        mentioned,
      );
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
      if (kind === "email_in" && (links.person_id || links.lead_id))
        mailCrmEvent("reply_logged", { person_id: links.person_id, lead_id: links.lead_id });
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
      inboxAssigned(
        row.assignee_staff_id,
        "task",
        row.id,
        found?.member,
        `${found?.member.display_name || "A colleague"} gave you a task: ${title}${row.due_on ? `, due ${row.due_on}` : ""}`,
        title,
        "/tasks",
      );
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
        if (status === "done" && row.status !== "done")
          mailCrmEvent("task_done", { task_id: row.id });
        row.status = status;
        row.completed_at = status === "done" ? now() : null;
        if (status === "done" && row.deal_id) {
          const deal = deals.find((candidate) => candidate.id === row.deal_id);
          if (deal) deal.last_activity_at = now();
        }
      }
      if ("title" in body) row.title = String(body.title ?? "").trim() || row.title;
      if ("due_on" in body) row.due_on = String(body.due_on ?? "");
      if ("assignee_staff_id" in body) {
        const next = String(body.assignee_staff_id ?? "");
        const actor = caller(headers)?.member;
        if (next && next !== row.assignee_staff_id)
          inboxAssigned(
            next,
            "task",
            row.id,
            actor,
            `${actor?.display_name || "A colleague"} passed you a task: ${row.title}`,
            row.title,
            "/tasks",
          );
        row.assignee_staff_id = next;
      }
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
    pattern: "hq/security/events",
    auth: true,
    capability: "hq:admin",
    handler: ({ query }) => {
      const states = ["open", "acknowledged", "resolved"];
      if (query.state && !states.includes(query.state))
        return refuse(400, "malformed_request", { state: "open, acknowledged or resolved" });
      const rows = securityEvents.filter(
        (row) =>
          (!query.state || row.state === query.state) &&
          (!query.severity || row.severity === query.severity) &&
          (!query.kind || row.kind === query.kind),
      );
      const since = Date.now() - 90 * 86_400_000;
      const counts: Record<string, number> = { open: 0, acknowledged: 0, resolved: 0 };
      for (const row of securityEvents)
        if (Date.parse(row.occurred_at) >= since) counts[row.state] = (counts[row.state] ?? 0) + 1;
      return ok({
        events: rows.slice(0, 300).map(securityEventView),
        counts_90d: counts,
        kinds: Object.entries(SECURITY_KINDS).map(([kind, [severity, label]]) => ({
          kind,
          label,
          severity,
        })),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/security/events/{event_id}/update",
    auth: true,
    capability: "hq:admin",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = securityEvents.find((candidate) => candidate.id === params.event_id);
      if (!row) return refuse(404, "not_found");
      const state = String(body.state ?? "");
      if (!["open", "acknowledged", "resolved"].includes(state))
        return refuse(400, "malformed_request", { state: "open, acknowledged or resolved" });
      const note = String(body.note ?? "")
        .trim()
        .slice(0, 400);
      if (state === "resolved" && !note && row.severity === "critical")
        return refuse(400, "malformed_request", {
          note: "say what was found before resolving a critical event",
        });
      const from = row.state;
      row.state = state as SecurityEventRow["state"];
      if (note) row.note = note;
      row.handled_by = state === "open" ? "" : viewer.id;
      row.handled_at = state === "open" ? null : now();
      audit("security.event_updated", viewer.id, "security_event", row.id, note, {
        kind: row.kind,
        from,
        to: state,
      });
      return ok({ event: securityEventView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/security/reads",
    auth: true,
    capability: "hq:admin",
    handler: () =>
      ok({
        people: staff
          .filter((member) => member.is_active)
          .map(readWatchView)
          .sort((a, b) => b.opened_last_hour - a.opened_last_hour || a.name.localeCompare(b.name)),
        thresholds: {
          notify: READ_NOTIFY_AT,
          intern_notify: READ_INTERN_NOTIFY_AT,
          step_up: READ_STEP_UP_AT,
          hold: READ_HOLD_AT,
          window_minutes: READ_WINDOW_MS / 60_000,
        },
      }),
  },
  {
    method: "POST",
    pattern: "hq/security/reads/{staff_id}/clear",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const target = staff.find((member) => member.id === params.staff_id);
      if (!target) return refuse(404, "not_found");
      if (target.id === viewer.id) return refuse(403, "forbidden", { reason: "own-hold" });
      const watch = readWatch.get(target.id);
      if (!readHeld(watch)) return refuse(400, "malformed_request", { state: "not held" });
      const reason = String(body.reason ?? "")
        .trim()
        .slice(0, 400);
      if (!reason) return refuse(400, "malformed_request", { reason: "say why reading may go on" });
      watch!.cleared_at = now();
      watch!.cleared_by = viewer.id;
      audit("security.reads_cleared", viewer.id, "staff", target.id, reason);
      recordSecurityEvent(
        "reads.cleared",
        target.id,
        `${viewer.display_name || viewer.email} cleared the hold on ${target.display_name || target.email}: ${reason}`,
        { actor_staff_id: viewer.id },
      );
      return ok({ person: readWatchView(target) });
    },
  },
  {
    method: "GET",
    pattern: "hq/records/{entity_type}/{record}/reads",
    auth: true,
    capability: "audit:read",
    handler: ({ params }) => {
      if (!READ_ENTITY_TYPES.includes(String(params.entity_type))) return refuse(404, "not_found");
      const since = Date.now() - READ_KEEP_DAYS * 86_400_000;
      const rows = recordReads
        .filter(
          (row) =>
            row.entity_type === params.entity_type &&
            row.entity_id === String(params.record).toLowerCase() &&
            Date.parse(row.read_at) >= since,
        )
        .sort((a, b) => b.read_at.localeCompare(a.read_at));
      const readers = new Map<
        string,
        { staff_id: string; name: string; reads: number; last_read_at: string | null }
      >();
      for (const row of rows) {
        const entry = readers.get(row.staff_id) ?? {
          staff_id: row.staff_id,
          name: nameOf(row.staff_id),
          reads: 0,
          last_read_at: row.read_at,
        };
        entry.reads += 1;
        readers.set(row.staff_id, entry);
      }
      return ok({ readers: [...readers.values()], reads: rows.length, days: READ_KEEP_DAYS });
    },
  },
  {
    method: "GET",
    pattern: "hq/security/decoys",
    auth: true,
    capability: "hq:admin",
    handler: ({ headers }) => {
      if (caller(headers)!.member.role !== "owner")
        return refuse(403, "forbidden", { required_role: "owner" });
      return ok({
        decoys: decoyRows.filter((row) => row.entity_type !== "person").map(decoyView),
        suggested_firms: DECOY_FIRMS,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/security/decoys/plant",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      if (viewer.role !== "owner") return refuse(403, "forbidden", { required_role: "owner" });
      const kind = String(body.kind ?? "");
      if (kind === "company") {
        const firm = String(body.firm_name ?? "").trim();
        const contact = String(body.contact_name ?? "").trim();
        const email = String(body.contact_email ?? "")
          .trim()
          .toLowerCase();
        if (!firm || !contact)
          return refuse(400, "malformed_request", { firm_name: "name the firm and its contact" });
        if (!email.includes("@"))
          return refuse(400, "malformed_request", { contact_email: "an address you watch" });
        if (companies.some((row) => row.name.toLowerCase() === firm.toLowerCase()))
          return refuse(400, "malformed_request", {
            firm_name: "a company with this name exists",
          });
        const planted = plantDecoyCompany(firm, contact, email, viewer.id);
        audit("security.decoy_planted", viewer.id, "security", "decoy", "", { kind });
        return ok({ decoy_id: planted.decoy.id, company_id: planted.companyId });
      }
      if (kind === "api_key") {
        const label = String(body.label ?? "").trim() || "Website intake (legacy)";
        const minted = mintKeyRow(label, KEY_LIFETIME_DAYS, viewer.id);
        const decoy: DecoyRow = {
          id: randomUUID(),
          entity_type: "api_key",
          entity_id: minted.row.key_id,
          label,
          planted_by: viewer.id,
          planted_at: now(),
          last_touched_at: null,
          touches: 0,
        };
        decoyRows.push(decoy);
        audit("security.decoy_planted", viewer.id, "security", "decoy", "", { kind });
        return ok({ decoy_id: decoy.id, secret: minted.secret, shown_once: ["secret"] });
      }
      return refuse(400, "malformed_request", { kind: "company or api_key" });
    },
  },
  {
    method: "POST",
    pattern: "hq/security/decoys/{decoy_id}/remove",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, params }) => {
      const viewer = caller(headers)!.member;
      if (viewer.role !== "owner") return refuse(403, "forbidden", { required_role: "owner" });
      const index = decoyRows.findIndex(
        (row) => row.id === params.decoy_id && row.entity_type !== "person",
      );
      if (index < 0) return refuse(404, "not_found");
      const [decoy] = decoyRows.splice(index, 1);
      if (decoy!.entity_type === "api_key") {
        const key = apiKeys.find((row) => row.key_id === decoy!.entity_id);
        if (key) key.revoked_at = now();
      } else {
        const company = companies.find((row) => row.id === decoy!.entity_id);
        if (company) company.archived = true;
        for (const person of people) {
          if (person.company_id !== decoy!.entity_id) continue;
          person.archived = true;
          const partner = decoyRows.findIndex(
            (row) => row.entity_type === "person" && row.entity_id === person.id,
          );
          if (partner >= 0) decoyRows.splice(partner, 1);
        }
      }
      audit("security.decoy_removed", viewer.id, "security", "decoy", "", {
        kind: decoy!.entity_type,
      });
      return ok({ removed: true });
    },
  },
  {
    method: "GET",
    pattern: "hq/receivables",
    auth: true,
    capability: "revenue:read",
    handler: () => {
      const views = invoicesRx.map(invoiceViewRx);
      const open = views.filter((view) => Number(view.outstanding) > 0);
      const ageing: Record<string, Record<string, number>> = {};
      for (const view of open) {
        const row = (ageing[view.currency] ??= {
          current: 0,
          "1_30": 0,
          "31_60": 0,
          "61_90": 0,
          "90_plus": 0,
          total: 0,
        });
        const owed = Math.round(Number(view.outstanding) * 100);
        row[rxBucket(view.days_past_due)]! += owed;
        row.total! += owed;
      }
      const worklist = [...open].sort(
        (a, b) =>
          Number(b.outstanding) * Math.max(b.days_past_due, 0) -
            Number(a.outstanding) * Math.max(a.days_past_due, 0) ||
          String(a.due_on).localeCompare(String(b.due_on)),
      );
      const withheld: Record<string, number> = {};
      for (const receipt of receiptsRx)
        if (!receipt.certificate_received_on && receipt.withheld_cents > 0)
          withheld[receipt.currency] = (withheld[receipt.currency] ?? 0) + receipt.withheld_cents;
      const plan = rxSchedule();
      return ok({
        as_of: todayIso(),
        ageing: Object.fromEntries(
          Object.entries(ageing)
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([currency, row]) => [
              currency,
              Object.fromEntries(
                Object.entries(row).map(([key, value]) => [key, centsText(value)]),
              ),
            ]),
        ),
        buckets: RX_BUCKETS.map(([key, label]) => ({ key, label })),
        worklist: worklist.slice(0, 100),
        reminders_due: open.filter((view) => view.next_reminder?.due_now).length,
        disputed: open.filter((view) => view.collection_state === "disputed").length,
        promised: open.filter((view) => view.collection_state === "promised").length,
        to_bill: plan.to_bill,
        billed_late: plan.billed_late,
        tracked_from: plan.tracked_from,
        withheld_awaiting_certificate: Object.fromEntries(
          Object.entries(withheld).map(([currency, value]) => [currency, centsText(value)]),
        ),
        invoices: invoicesRx.length,
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/invoices",
    auth: true,
    capability: "revenue:read",
    handler: ({ query }) =>
      ok({
        invoices: invoicesRx
          .filter((row) => !query.company_id || row.company_id === query.company_id)
          .sort((a, b) => b.issued_on.localeCompare(a.issued_on))
          .map(invoiceViewRx)
          .filter((view) => !query.status || view.status === query.status),
      }),
  },
  {
    method: "POST",
    pattern: "hq/invoices/create",
    auth: true,
    capability: "revenue:write",
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      const companyId = String(body.company_id ?? "");
      if (!companies.some((row) => row.id === companyId))
        return refuse(400, "malformed_request", { company_id: "choose the customer" });
      const number = String(body.number ?? "")
        .trim()
        .slice(0, 40);
      if (!number)
        return refuse(400, "malformed_request", {
          number: "the number the accounting system gave it",
        });
      if (invoicesRx.some((row) => row.number === number))
        return refuse(400, "malformed_request", {
          number: "an invoice with this number is already recorded",
        });
      const contractId = String(body.contract_id ?? "");
      if (
        contractId &&
        !contracts.some((row) => row.id === contractId && row.company_id === companyId)
      )
        return refuse(400, "malformed_request", { contract_id: "not a contract of this customer" });
      const issued = String(body.issued_on ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(issued))
        return refuse(400, "malformed_request", { issued_on: "a date, YYYY-MM-DD" });
      const profile = billingProfiles.get(companyId);
      const due =
        String(body.due_on ?? "") || addDaysIso(issued, profile?.payment_terms_days ?? 30);
      if (due < issued)
        return refuse(400, "malformed_request", {
          due_on: "cannot be before the invoice was issued",
        });
      const net = cents(body.net);
      const tax = cents(body.tax ?? "0");
      if (!Number.isFinite(net) || net < 0 || !Number.isFinite(tax) || tax < 0)
        return refuse(400, "malformed_request", { net: "an amount such as 1250.00" });
      const row: InvoiceRow = {
        id: randomUUID(),
        company_id: companyId,
        contract_id: contractId,
        number,
        issued_on: issued,
        period_start: String(body.period_start ?? "") || null,
        period_end: String(body.period_end ?? "") || null,
        due_on: due,
        currency: String(body.currency ?? profile?.invoice_currency ?? "USD").toUpperCase(),
        net_cents: net,
        tax_cents: tax,
        po_number: String(body.po_number ?? profile?.po_number ?? ""),
        status: "open",
        collection_state: "none",
        reminders_sent: 0,
        last_reminder_at: null,
        promised_on: null,
        promised_cents: null,
        dispute_reason: "",
        void_reason: "",
        paid_on: null,
        notes: String(body.notes ?? ""),
      };
      invoicesRx.push(row);
      rxEvent(row.id, "recorded", `Recorded as issued on ${issued}, due ${due}.`, viewer.id);
      audit("invoice.recorded", viewer.id, "invoice", row.id, "", { number });
      return ok({ invoice: invoiceViewRx(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/invoices/{invoice_id}",
    auth: true,
    capability: "revenue:read",
    handler: ({ params }) => {
      const row = invoicesRx.find((candidate) => candidate.id === params.invoice_id);
      if (!row) return refuse(404, "not_found");
      const view = invoiceViewRx(row);
      const profile = billingProfiles.get(row.company_id);
      const reminder = view.next_reminder;
      let draft: { subject: string; body: string } | null = null;
      if (reminder) {
        const due = new Date(`${row.due_on}T00:00:00Z`).toLocaleDateString("en-GB", {
          day: "2-digit",
          month: "long",
          year: "numeric",
          timeZone: "UTC",
        });
        const owed = `${row.currency} ${view.outstanding}`;
        const opening =
          reminder.offset < 0
            ? `A note ahead of time: invoice ${row.number} for ${owed} falls due on ${due}.`
            : reminder.offset === 0
              ? `Invoice ${row.number} for ${owed} is due today, ${due}.`
              : `Invoice ${row.number} for ${owed} was due on ${due} and is now ${view.days_past_due} ${view.days_past_due === 1 ? "day" : "days"} overdue.`;
        draft = {
          subject:
            reminder.offset < 0
              ? `Invoice ${row.number} due ${due}`
              : reminder.offset === 0
                ? `Invoice ${row.number} due today`
                : `Invoice ${row.number} is overdue`,
          body: `Hello ${companyName(row.company_id)} accounts team,\n\n${opening}\n\n${row.po_number ? `Your PO reference: ${row.po_number}.\n\n` : ""}If it is already on its way, thank you, and please ignore this. If anything stands in the way of payment, reply and tell us what it is.\n\nKind regards,\nQuantify Terminal accounts`,
        };
      }
      return ok({
        invoice: view,
        events: invoiceEvents
          .filter((event) => event.invoice_id === row.id)
          .sort((a, b) => a.at.localeCompare(b.at))
          .map((event) => ({
            kind: event.kind,
            detail: event.detail,
            by: nameOf(event.staff_id),
            at: event.at,
          })),
        payments: allocationsRx
          .filter((item) => item.invoice_id === row.id)
          .map((item) => {
            const receipt = receiptsRx.find((candidate) => candidate.id === item.receipt_id);
            return {
              receipt_id: item.receipt_id,
              amount: centsText(item.cents),
              received_on: receipt?.received_on ?? null,
              bank_reference: receipt?.bank_reference ?? "",
            };
          }),
        reminder_draft: draft,
        send_to: (profile?.ap_emails ?? "")
          .split(",")
          .map((part) => part.trim().toLowerCase())
          .filter((part) => part.includes("@")),
        profile_gaps: rxGaps(profile),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/invoices/{invoice_id}/collection",
    auth: true,
    capability: "revenue:write",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = invoicesRx.find((candidate) => candidate.id === params.invoice_id);
      if (!row) return refuse(404, "not_found");
      const action = String(body.action ?? "");
      if (["void", "uncollectible"].includes(row.status) && action !== "note")
        return refuse(400, "malformed_request", { status: `this invoice is ${row.status}` });
      const today = todayIso();
      let detail = "";
      if (action === "send_reminder") {
        const reminder = rxReminder(row);
        if (!reminder)
          return refuse(400, "malformed_request", {
            reminder: "nothing to remind: paid, paused, or all reminders sent",
          });
        const to = (billingProfiles.get(row.company_id)?.ap_emails ?? "")
          .split(",")
          .map((part) => part.trim())
          .filter((part) => part.includes("@"));
        if (!to.length)
          return refuse(400, "malformed_request", {
            send_to: "add the accounts payable address to the billing profile first",
          });
        const subject = String(body.subject ?? "").trim();
        if (!subject || !String(body.body ?? "").trim())
          return refuse(400, "malformed_request", {
            body: "read the draft and send it as you want it to go",
          });
        row.reminders_sent = reminder.step;
        row.last_reminder_at = now();
        if (["none", "promised"].includes(row.collection_state)) row.collection_state = "reminded";
        detail = `Reminder ${reminder.number} sent to ${to.join(", ")}: ${subject} (the mock sends nothing)`;
      } else if (action === "promise") {
        const promised = String(body.promised_on ?? "");
        if (!/^\d{4}-\d{2}-\d{2}$/.test(promised) || promised < today)
          return refuse(400, "malformed_request", {
            promised_on: "a promise is for today or later",
          });
        const amount = body.promised_amount ? cents(body.promised_amount) : owedCents(row);
        row.collection_state = "promised";
        row.promised_on = promised;
        row.promised_cents = amount;
        detail = `Promised ${row.currency} ${centsText(amount)} by ${promised}. Reminders pause until then.`;
      } else if (action === "dispute") {
        const reason = String(body.reason ?? "").trim();
        if (!reason)
          return refuse(400, "malformed_request", { reason: "what the customer disputes" });
        row.collection_state = "disputed";
        row.dispute_reason = reason;
        detail = `Disputed: ${reason}. Reminders pause until it is resumed.`;
      } else if (action === "escalate") {
        row.collection_state = "escalated";
        detail = String(body.note ?? "Escalated for a call.");
      } else if (action === "resume") {
        row.collection_state = row.reminders_sent ? "reminded" : "none";
        row.promised_on = null;
        row.promised_cents = null;
        detail = "Collection resumed; reminders go on from where they stood.";
      } else if (action === "void") {
        if (allocatedCents(row.id) > 0)
          return refuse(400, "malformed_request", {
            status:
              "payments are allocated to it; issue a credit note in the accounting system instead",
          });
        const reason = String(body.reason ?? "").trim();
        if (!reason)
          return refuse(400, "malformed_request", {
            reason: "why it is void (as the accounting system records it)",
          });
        row.status = "void";
        row.void_reason = reason;
        detail = `Voided: ${reason}`;
      } else if (action === "note") {
        detail = String(body.note ?? "").trim();
        if (!detail) return refuse(400, "malformed_request", { note: "write the note" });
      } else return refuse(400, "malformed_request", { action: "not a collection act" });
      rxEvent(row.id, action, detail, viewer.id);
      audit(`invoice.${action}`, viewer.id, "invoice", row.id, "", { number: row.number });
      return ok({ invoice: invoiceViewRx(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/invoices/{invoice_id}/write-off",
    auth: true,
    capability: "revenue:write",
    sudo: true,
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = invoicesRx.find((candidate) => candidate.id === params.invoice_id);
      if (!row) return refuse(404, "not_found");
      if (!["open", "partially_paid"].includes(rxStatus(row)))
        return refuse(400, "malformed_request", { status: `this invoice is ${rxStatus(row)}` });
      const reason = String(body.reason ?? "").trim();
      if (!reason) return refuse(400, "malformed_request", { reason: "why it will not be paid" });
      if (approvers("write_off", viewer.id).length) {
        const approval = requestApproval(
          "write_off",
          viewer,
          {
            invoice_id: row.id,
            number: row.number,
            currency: row.currency,
            amount: centsText(owedCents(row)),
            company: companyName(row.company_id),
          },
          reason,
        );
        return ok({ pending_approval: true, approval });
      }
      row.status = "uncollectible";
      row.collection_state = "written_off";
      const relief = rxReliefFrom(row);
      rxEvent(
        row.id,
        "written_off",
        `Written off: ${reason}. UK VAT bad-debt relief can be claimed from ${relief}.`,
        viewer.id,
      );
      audit("invoice.written_off", viewer.id, "invoice", row.id, reason, {
        dual_control: "sole_approver",
      });
      return ok({ written_off: true, bad_debt_relief_from: relief });
    },
  },
  {
    method: "GET",
    pattern: "hq/receipts",
    auth: true,
    capability: "revenue:read",
    handler: ({ query }) =>
      ok({
        receipts: receiptsRx
          .filter((row) => !query.company_id || row.company_id === query.company_id)
          .sort((a, b) => b.received_on.localeCompare(a.received_on))
          .map(receiptViewRx),
      }),
  },
  {
    method: "POST",
    pattern: "hq/receipts/create",
    auth: true,
    capability: "revenue:write",
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      const companyId = String(body.company_id ?? "");
      if (!companies.some((row) => row.id === companyId))
        return refuse(400, "malformed_request", { company_id: "choose the customer" });
      const received = String(body.received_on ?? "");
      if (!/^\d{4}-\d{2}-\d{2}$/.test(received) || received > todayIso())
        return refuse(400, "malformed_request", {
          received_on: "a receipt is recorded once the money is in",
        });
      const currency = String(body.currency ?? "").toUpperCase();
      const amount = cents(body.amount);
      const charges = cents(body.bank_charges ?? "0");
      const withheld = cents(body.tax_withheld ?? "0");
      if (![amount, charges, withheld].every((value) => Number.isFinite(value) && value >= 0))
        return refuse(400, "malformed_request", { amount: "an amount such as 1250.00" });
      if (amount + charges + withheld <= 0)
        return refuse(400, "malformed_request", { amount: "nothing was received" });
      const planned: Array<{ invoice_id: string; cents: number }> = [];
      for (const item of Array.isArray(body.allocations) ? body.allocations.slice(0, 50) : []) {
        const entry = item as Record<string, unknown>;
        const invoice = invoicesRx.find(
          (row) => row.id === String(entry.invoice_id ?? "") && row.company_id === companyId,
        );
        if (!invoice)
          return refuse(400, "malformed_request", {
            allocations: "an invoice of another customer, or none",
          });
        if (invoice.currency !== currency)
          return refuse(400, "malformed_request", {
            allocations: `invoice ${invoice.number} is in ${invoice.currency}, the receipt in ${currency}`,
          });
        const part = cents(entry.amount);
        if (!Number.isFinite(part) || part <= 0) continue;
        if (part > owedCents(invoice))
          return refuse(400, "malformed_request", {
            allocations: `more than invoice ${invoice.number} still owes`,
          });
        planned.push({ invoice_id: invoice.id, cents: part });
      }
      if (planned.reduce((total, item) => total + item.cents, 0) > amount + charges + withheld)
        return refuse(400, "malformed_request", {
          allocations: "allocated more than the receipt, its charges and the tax withheld",
        });
      const receipt: ReceiptRow = {
        id: randomUUID(),
        company_id: companyId,
        received_on: received,
        currency,
        amount_cents: amount,
        charges_cents: charges,
        withheld_cents: withheld,
        certificate_received_on: null,
        bank_reference: String(body.bank_reference ?? "").slice(0, 80),
        notes: String(body.notes ?? "").slice(0, 400),
      };
      receiptsRx.push(receipt);
      for (const item of planned) {
        allocationsRx.push({
          receipt_id: receipt.id,
          invoice_id: item.invoice_id,
          cents: item.cents,
        });
        const invoice = invoicesRx.find((row) => row.id === item.invoice_id)!;
        invoice.status = rxStatus(invoice);
        if (invoice.status === "paid") invoice.paid_on = received;
        rxEvent(
          invoice.id,
          "payment",
          `${currency} ${centsText(item.cents)} from a receipt of ${received}${invoice.status === "paid" ? ". Paid in full." : "."}`,
          viewer.id,
        );
      }
      audit("receipt.recorded", viewer.id, "receipt", receipt.id, "", {
        allocations: planned.length,
      });
      return ok({ receipt: receiptViewRx(receipt) });
    },
  },
  {
    method: "POST",
    pattern: "hq/receipts/{receipt_id}/certificate",
    auth: true,
    capability: "revenue:write",
    handler: ({ headers, params, body }) => {
      const row = receiptsRx.find((candidate) => candidate.id === params.receipt_id);
      if (!row) return refuse(404, "not_found");
      if (row.withheld_cents <= 0)
        return refuse(400, "malformed_request", {
          receipt: "no tax was withheld from this receipt",
        });
      row.certificate_received_on = String(body.received_on ?? "") || todayIso();
      audit("receipt.certificate", caller(headers)!.member.id, "receipt", row.id);
      return ok({ certificate_received_on: row.certificate_received_on });
    },
  },
  {
    method: "GET",
    pattern: "hq/companies/{company_id}/billing",
    auth: true,
    capability: "revenue:read",
    handler: ({ params }) => {
      if (!companies.some((row) => row.id === params.company_id)) return refuse(404, "not_found");
      return ok({
        profile: profileViewRx(String(params.company_id)),
        treatments: Object.entries(RX_TREATMENTS).map(([value, label]) => ({ value, label })),
      });
    },
  },
  // --- customer success (mirrors success_routes.py) ------------------------------------------------
  {
    method: "GET",
    pattern: "hq/success",
    auth: true,
    capability: "crm:read",
    handler: ({ headers }) => {
      const moneyOk = seesMoney(headers);
      const views = [...csActiveContracts().entries()]
        .filter(([companyId]) => companies.some((row) => row.id === companyId))
        .map(([companyId, rows]) => csCustomerView(companyId, rows, moneyOk));
      const order = Object.keys(CS_SIGNALS);
      const worst = (view: (typeof views)[number]) =>
        Math.min(
          99,
          ...view.signals
            .filter((item) => item.key !== "near_limit")
            .map((item) => order.indexOf(item.key)),
        );
      views.sort(
        (a, b) =>
          worst(a) - worst(b) ||
          a.company.name.toLowerCase().localeCompare(b.company.name.toLowerCase()),
      );
      return ok({
        customers: views,
        counts: Object.fromEntries(
          Object.keys(CS_SIGNALS).map((key) => [
            key,
            views.filter((view) => view.signals.some((item) => item.key === key)).length,
          ]),
        ),
        signals: Object.entries(CS_SIGNALS).map(([key, label]) => ({ key, label })),
        rules: { active_days: 30, silent_days: 14, quiet_days: 30, renewal_days: 90 },
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/companies/{company_id}/success",
    auth: true,
    capability: "crm:read",
    handler: ({ headers, params }) => {
      const companyId = String(params.company_id);
      if (!companies.some((row) => row.id === companyId)) return refuse(404, "not_found");
      const rows = csActiveContracts().get(companyId) ?? [];
      return ok({
        customer: csCustomerView(companyId, rows, seesMoney(headers)),
        customer_of_ours: rows.length > 0,
        onboardings: onboardings
          .filter((row) => row.company_id === companyId)
          .map(csOnboardingView),
        asks: featureAsks
          .filter((ask) => ask.company_id === companyId)
          .map((ask) => {
            const request = featureRequests.find((row) => row.id === ask.request_id);
            return {
              request_id: ask.request_id,
              title: request?.title ?? "",
              status: request?.status ?? "",
              importance: ask.importance,
              quote: ask.quote,
              recorded_at: ask.recorded_at,
            };
          }),
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/feature-requests",
    auth: true,
    capability: "crm:read",
    handler: ({ headers, query }) => {
      const moneyOk = seesMoney(headers);
      let views = featureRequests.map((row) => csRequestView(row, moneyOk));
      const status = query.status ?? "";
      if (status === "active")
        views = views.filter((view) => ["open", "planned", "building"].includes(view.status));
      else if (status) views = views.filter((view) => view.status === status);
      views.sort(
        (a, b) =>
          b.firms - a.firms ||
          b.deals_blocked - a.deals_blocked ||
          b.asks - a.asks ||
          a.title.toLowerCase().localeCompare(b.title.toLowerCase()),
      );
      return ok({
        requests: views,
        statuses: Object.entries(CS_REQUEST_STATUSES).map(([value, label]) => ({ value, label })),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/feature-requests/create",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      const title = String(body.title ?? "")
        .trim()
        .slice(0, 200);
      if (!title) return refuse(400, "malformed_request", { title: "what they want, in a line" });
      if (featureRequests.some((row) => row.title.trim().toLowerCase() === title.toLowerCase()))
        return refuse(400, "malformed_request", {
          title: "already on the list: add the ask to it",
        });
      const row: FeatureRequestRow = {
        id: randomUUID(),
        title,
        description: String(body.description ?? "")
          .trim()
          .slice(0, 4000),
        status: "open",
        shipped_on: null,
        declined_reason: "",
        owner_staff_id: viewer.id,
        created_at: now(),
      };
      featureRequests.push(row);
      audit("feature_request.created", viewer.id, "feature_request", row.id, "", { title });
      return ok({ request: csRequestView(row, seesMoney(headers)) });
    },
  },
  {
    method: "GET",
    pattern: "hq/feature-requests/{request_id}",
    auth: true,
    capability: "crm:read",
    handler: ({ headers, params }) => {
      const row = featureRequests.find((item) => item.id === params.request_id);
      if (!row) return refuse(404, "not_found");
      const viewer = caller(headers)!.member;
      const order: Record<string, number> = { blocker: 0, important: 1, nice: 2 };
      const asks = featureAsks
        .filter((ask) => ask.request_id === row.id)
        .map((ask) => {
          const person = people.find((item) => item.id === ask.person_id);
          const deal = deals.find((item) => item.id === ask.deal_id);
          return {
            id: ask.id,
            company: { id: ask.company_id, name: companyName(ask.company_id) },
            person: person ? { id: person.id, name: person.full_name, email: person.email } : null,
            source: ask.source,
            quote: ask.quote,
            importance: ask.importance,
            importance_label: CS_IMPORTANCE[ask.importance] ?? "",
            deal: deal ? { id: deal.id, name: deal.name, status: deal.status } : null,
            recorded_by: staff.find((member) => member.id === ask.recorded_by)?.display_name ?? "",
            recorded_at: ask.recorded_at,
            notified_at: ask.notified_at,
          };
        })
        .sort(
          (a, b) =>
            (order[a.importance] ?? 3) - (order[b.importance] ?? 3) ||
            a.company.name.toLowerCase().localeCompare(b.company.name.toLowerCase()),
        );
      const title = row.title;
      return ok({
        request: csRequestView(row, seesMoney(headers)),
        asks,
        // People, not asks: one who asked twice hears once; do-not-contact is nobody to tell.
        to_tell: new Set(
          asks
            .filter(
              (ask) =>
                ask.person?.email &&
                !ask.notified_at &&
                !people.find((item) => item.id === ask.person?.id)?.do_not_contact,
            )
            .map((ask) => ask.person!.email.toLowerCase()),
        ).size,
        draft: {
          subject: `You asked for it: ${title}`,
          body: `Hello,\n\nYou asked us for ${title ? title[0]!.toLowerCase() + title.slice(1) : "this"}. It is now in Quantify Terminal.\n\nThank you for telling us what you needed. If it is not quite what you had in mind, reply to this message and say so.\n\nQuantify Terminal`,
        },
        mail_ready: MOCK_MAIL_READY,
        may_send: (CAPABILITIES[viewer.role] ?? []).includes("mail:send"),
        sources: CS_SOURCES,
        importance: Object.entries(CS_IMPORTANCE).map(([value, label]) => ({ value, label })),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/feature-requests/{request_id}/update",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = featureRequests.find((item) => item.id === params.request_id);
      if (!row) return refuse(404, "not_found");
      let changed = false;
      if ("title" in body) {
        const title = String(body.title ?? "")
          .trim()
          .slice(0, 200);
        if (!title) return refuse(400, "malformed_request", { title: "what they want, in a line" });
        row.title = title;
        changed = true;
      }
      if ("description" in body) {
        row.description = String(body.description ?? "")
          .trim()
          .slice(0, 4000);
        changed = true;
      }
      if ("status" in body) {
        const status = String(body.status ?? "");
        if (!CS_REQUEST_STATUSES[status] || status === "shipped")
          return refuse(400, "malformed_request", {
            status: "open, planned, building or declined (ship it through /ship)",
          });
        if (status === "declined") {
          const reason = String(body.declined_reason ?? "")
            .trim()
            .slice(0, 1000);
          if (!reason)
            return refuse(400, "malformed_request", {
              declined_reason: "why not, as the people who asked will hear it",
            });
          row.declined_reason = reason;
        }
        row.status = status;
        changed = true;
      }
      if (!changed) return refuse(400, "malformed_request", { fields: "nothing to change" });
      audit("feature_request.updated", viewer.id, "feature_request", row.id, "", {});
      return ok({ updated: true });
    },
  },
  {
    method: "POST",
    pattern: "hq/feature-requests/{request_id}/asks",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = featureRequests.find((item) => item.id === params.request_id);
      if (!row) return refuse(404, "not_found");
      for (const name of ["company_id", "person_id", "deal_id"])
        if (badId(body[name])) return refuse(400, "malformed_request", { [name]: "not an id" });
      const personId = String(body.person_id ?? "");
      const person = personId ? people.find((item) => item.id === personId) : undefined;
      if (personId && !person)
        return refuse(400, "malformed_request", { person_id: "no such person" });
      const companyId = String(body.company_id ?? "") || person?.company_id || "";
      if (!companyId && !personId)
        return refuse(400, "malformed_request", {
          company_id: "which firm, or which person, asked",
        });
      if (companyId && !companies.some((item) => item.id === companyId))
        return refuse(400, "malformed_request", { company_id: "no such company" });
      const source = String(body.source ?? "call");
      if (!CS_SOURCES.includes(source))
        return refuse(400, "malformed_request", { source: CS_SOURCES.join(", ") });
      const importance = String(body.importance ?? "important");
      if (!CS_IMPORTANCE[importance])
        return refuse(400, "malformed_request", {
          importance: Object.keys(CS_IMPORTANCE).join(", "),
        });
      const dealId = String(body.deal_id ?? "");
      if (dealId && !deals.some((item) => item.id === dealId && item.status === "open"))
        return refuse(400, "malformed_request", { deal_id: "an open deal" });
      const quote = String(body.quote ?? "")
        .trim()
        .slice(0, 1000);
      if (!quote)
        return refuse(400, "malformed_request", { quote: "what they said, in their words" });
      const ask: FeatureAskRow = {
        id: randomUUID(),
        request_id: row.id,
        company_id: companyId,
        person_id: personId,
        source,
        quote,
        importance,
        deal_id: dealId,
        recorded_by: viewer.id,
        recorded_at: now(),
        notified_at: null,
      };
      featureAsks.push(ask);
      audit("feature_request.asked", viewer.id, "feature_request", row.id, "", {
        company_id: companyId,
        importance,
      });
      return ok({ ask_id: ask.id });
    },
  },
  {
    method: "POST",
    pattern: "hq/feature-requests/{request_id}/ship",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = featureRequests.find((item) => item.id === params.request_id);
      if (!row) return refuse(404, "not_found");
      if (row.status === "declined")
        return refuse(400, "malformed_request", { status: "it was declined; reopen it first" });
      const shipped = String(body.shipped_on ?? "") || today();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(shipped) || shipped > today())
        return refuse(400, "malformed_request", { shipped_on: "a date, not in the future" });
      const mode = String(body.tell ?? "mail");
      if (!["mail", "recorded", "none"].includes(mode))
        return refuse(400, "malformed_request", { tell: "mail, recorded or none" });
      const asks = featureAsks.filter((ask) => ask.request_id === row.id);
      let told = 0;
      let skipped = 0;
      if (mode === "mail") {
        if (!(CAPABILITIES[viewer.role] ?? []).includes("mail:send"))
          return refuse(400, "malformed_request", {
            tell: "mailing customers is for people who may send mail; record it instead",
          });
        if (!MOCK_MAIL_READY)
          return refuse(400, "malformed_request", {
            tell: "mail is not set up, so nothing can leave HQ; record it instead",
          });
        if (!String(body.subject ?? "").trim() || !String(body.body ?? "").trim())
          return refuse(400, "malformed_request", {
            body: "read the draft and send it as you want it to go",
          });
        for (const ask of asks) {
          if (ask.notified_at) continue;
          const person = people.find((item) => item.id === ask.person_id);
          const email = (person?.email ?? "").toLowerCase();
          if (
            !email ||
            person?.do_not_contact ||
            mailSuppressions.some(
              (item) => item.email_norm === email && item.scope === "global" && !item.released_at,
            )
          ) {
            skipped += 1;
            continue;
          }
          ask.notified_at = now();
          told += 1;
        }
      } else if (mode === "recorded") {
        for (const ask of asks)
          if (!ask.notified_at) {
            ask.notified_at = now();
            told += 1;
          }
      }
      row.status = "shipped";
      row.shipped_on = shipped;
      audit("feature_request.shipped", viewer.id, "feature_request", row.id, "", {
        tell: mode,
        told,
        skipped,
      });
      return ok({ shipped_on: shipped, told, skipped });
    },
  },
  {
    method: "GET",
    pattern: "hq/onboardings",
    auth: true,
    capability: "crm:read",
    handler: () => {
      const active = csActiveContracts();
      const views = onboardings.map((row) => {
        const view = csOnboardingView(row);
        const seats = (active.get(row.company_id) ?? []).reduce(
          (total, item) => total + item.seats,
          0,
        );
        const usage = csUsage(seats, csLogins.get(row.company_id) ?? []);
        return {
          ...view,
          usage,
          suggest:
            view.status === "active" && usage.live && !view.live_on
              ? "live"
              : !view.first_sign_in_on && usage.last_sign_in
                ? "first_sign_in"
                : "",
        };
      });
      const rank: Record<string, number> = { active: 0, stalled: 1, live: 2, cancelled: 3 };
      views.sort(
        (a, b) =>
          (rank[a.status] ?? 4) - (rank[b.status] ?? 4) ||
          String(a.starts_on).localeCompare(String(b.starts_on)),
      );
      const started = new Set(views.map((view) => view.company.id));
      const notStarted = [...active.entries()]
        .filter(([companyId]) => !started.has(companyId))
        .map(([companyId, rows]) => ({
          company_id: companyId,
          company_name: companyName(companyId),
          starts_on: rows.map((item) => item.starts_on).sort()[0]!,
        }))
        .filter((item) => rxDaysBetween(item.starts_on, today()) <= 120)
        .sort((a, b) => b.starts_on.localeCompare(a.starts_on));
      return ok({ onboardings: views, not_started: notStarted, default_steps: CS_STEPS });
    },
  },
  {
    method: "POST",
    pattern: "hq/onboardings/create",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      const companyId = String(body.company_id ?? "");
      if (!companies.some((row) => row.id === companyId))
        return refuse(400, "malformed_request", { company_id: "choose the customer" });
      if (
        onboardings.some(
          (row) => row.company_id === companyId && ["active", "stalled"].includes(row.status),
        )
      )
        return refuse(400, "malformed_request", {
          company_id: "an onboarding is already running for them",
        });
      const rows = csActiveContracts().get(companyId) ?? [];
      const starts =
        String(body.starts_on ?? "") || rows.map((row) => row.starts_on).sort()[0] || today();
      const row: OnboardingRow = {
        id: randomUUID(),
        company_id: companyId,
        contract_id: rows[0]?.id ?? "",
        owner_staff_id: String(body.owner_staff_id ?? "") || viewer.id,
        starts_on: starts,
        kickoff_on: String(body.kickoff_on ?? "") || null,
        first_sign_in_on: null,
        live_on: null,
        target_live_on: String(body.target_live_on ?? "") || addDaysIso(starts, 30),
        status: "active",
        notes: String(body.notes ?? "").slice(0, 2000),
      };
      onboardings.push(row);
      CS_STEPS.forEach((title, position) =>
        onboardingSteps.push({
          id: randomUUID(),
          onboarding_id: row.id,
          position,
          title,
          due_on: addDaysIso(starts, 3 + position * 5),
          done_on: null,
        }),
      );
      audit("onboarding.started", viewer.id, "company", companyId, "", { onboarding_id: row.id });
      return ok({ onboarding: csOnboardingView(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/onboardings/{onboarding_id}/act",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = onboardings.find((item) => item.id === params.onboarding_id);
      if (!row) return refuse(404, "not_found");
      const action = String(body.action ?? "");
      if (action === "dates") {
        for (const name of [
          "kickoff_on",
          "first_sign_in_on",
          "live_on",
          "target_live_on",
        ] as const) {
          if (!(name in body)) continue;
          const raw = String(body[name] ?? "").trim();
          if (raw && !/^\d{4}-\d{2}-\d{2}$/.test(raw))
            return refuse(400, "malformed_request", { [name]: "a date, YYYY-MM-DD" });
          if (raw && name !== "target_live_on" && raw > today())
            return refuse(400, "malformed_request", { [name]: "has not happened yet" });
          row[name] = raw || null;
        }
        if (row.live_on) row.status = "live";
      } else if (action === "status") {
        const status = String(body.status ?? "");
        if (!["active", "live", "stalled", "cancelled"].includes(status))
          return refuse(400, "malformed_request", { status: "active, live, stalled or cancelled" });
        row.status = status;
        if (status === "live" && !row.live_on) row.live_on = today();
      } else if (action === "step_done" || action === "step_undone") {
        const step = onboardingSteps.find(
          (item) => item.id === String(body.step_id ?? "") && item.onboarding_id === row.id,
        );
        if (!step)
          return refuse(400, "malformed_request", { step_id: "not a step of this onboarding" });
        step.done_on = action === "step_done" ? today() : null;
      } else if (action === "add_step") {
        const title = String(body.title ?? "")
          .trim()
          .slice(0, 200);
        if (!title) return refuse(400, "malformed_request", { title: "the step" });
        onboardingSteps.push({
          id: randomUUID(),
          onboarding_id: row.id,
          position: onboardingSteps.filter((item) => item.onboarding_id === row.id).length,
          title,
          due_on: String(body.due_on ?? "") || null,
          done_on: null,
        });
      } else if (action === "notes") {
        row.notes = String(body.notes ?? "").slice(0, 2000);
      } else
        return refuse(400, "malformed_request", {
          action: "dates, status, step_done, step_undone, add_step, notes",
        });
      audit(`onboarding.${action}`, viewer.id, "company", row.company_id, "", {
        onboarding_id: row.id,
      });
      return ok({ onboarding: csOnboardingView(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/contracts/{contract_id}/playbook",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params }) => {
      const viewer = caller(headers)!.member;
      const contract = contracts.find((row) => row.id === params.contract_id);
      if (!contract) return refuse(404, "not_found");
      if (contract.status !== "active")
        return refuse(400, "malformed_request", { contract: "only a contract in force renews" });
      if (contract.playbook_started_at)
        return refuse(400, "malformed_request", { contract: "the playbook is already running" });
      const notice = csNoticeDate(contract);
      if (!notice)
        return refuse(400, "malformed_request", { renews_on: "set the renewal date first" });
      const company = companies.find((row) => row.id === contract.company_id);
      const assignee = company?.owner_staff_id || viewer.id;
      for (const [before, title] of CS_PLAYBOOK) {
        const due = addDaysIso(notice, -before);
        tasks.push({
          id: randomUUID(),
          title,
          body: `Renewal of ${company?.name ?? "the customer"}: notice by ${pvDay(notice)}.`,
          status: "open",
          priority: due < today() ? "high" : "medium",
          due_on: due < today() ? today() : due,
          assignee_staff_id: assignee,
          company_id: contract.company_id,
          person_id: "",
          deal_id: "",
          lead_id: "",
          ticket_id: "",
          origin: "renewal_playbook",
          completed_at: null,
          created_at: now(),
        });
      }
      contract.playbook_started_at = now();
      audit("contract.playbook_started", viewer.id, "contract", contract.id, "", {
        tasks: CS_PLAYBOOK.length,
        notice_date: notice,
      });
      return ok({ tasks: CS_PLAYBOOK.length, notice_date: notice });
    },
  },
  // --- pipeline inspection (mirrors inspection_routes.py) ------------------------------------------
  {
    method: "GET",
    pattern: "hq/pipeline/changes",
    auth: true,
    capability: "deals:read",
    handler: ({ headers, query }) => {
      const viewer = caller(headers)!.member;
      const moneyOk = (CAPABILITIES[viewer.role] ?? []).includes("revenue:read");
      const days = Number(query.days ?? "7");
      if (![7, 14, 30].includes(days))
        return refuse(400, "malformed_request", { days: "7, 14 or 30" });
      inEnsureToday();
      const today = todayIso();
      const start = addDaysIso(today, -days);
      const known = [...dealSnapshots.keys()].sort();
      let comparedFrom = [...known].reverse().find((day) => day <= start) ?? null;
      let note = "";
      if (!comparedFrom) {
        comparedFrom = known[0] ?? null;
        note =
          comparedFrom && comparedFrom < today
            ? `The nightly history starts on ${comparedFrom}, so this compares from then, not ${start}.`
            : "No history before today yet: every open deal counts as new until the nightly record has a few days in it.";
      }
      const before = new Map(
        (comparedFrom ? (dealSnapshots.get(comparedFrom) ?? []) : []).map((row) => [
          row.deal_id,
          row,
        ]),
      );
      const since = `${comparedFrom ?? today}T00:00:00Z`;
      const changes: Array<
        Record<string, unknown> & { reason: string; company: { id: string; name: string } }
      > = [];
      for (const deal of deals) {
        const startRow = before.get(deal.id);
        if (!startRow) {
          if (deal.status === "open" && deal.created_at < since) continue;
          if (
            deal.status !== "open" &&
            (!deal.closed_at || deal.closed_at < since || deal.created_at < since)
          )
            continue;
        } else if (deal.status !== "open" && deal.closed_at && deal.closed_at < since) continue;
        const change = inChange(startRow, deal);
        if (!change) continue;
        const summary = dealSummary(deal);
        changes.push({
          deal_id: deal.id,
          name: deal.name,
          company: { id: deal.company_id, name: companyName(deal.company_id) },
          owner: staff.find((member) => member.id === deal.owner_staff_id)?.display_name ?? "",
          reason: change.reason,
          reason_label: IN_REASONS[change.reason],
          push: change.push,
          push_count: deal.push_count ?? 0,
          stage_before: startRow ? (stageOf(startRow.stage_key)?.label ?? "") : "",
          stage_after: summary.stage_label,
          category_before: startRow ? (IN_CATEGORIES[startRow.forecast_category] ?? "") : "",
          category_after: IN_CATEGORIES[inEffectiveCategory(deal)] ?? "",
          close_before: startRow?.expected_close_date ?? "",
          close_after: deal.expected_close_date,
          currency: deal.currency,
          amount_before: moneyOk && change.before !== null ? centsText(change.before) : null,
          amount_after: moneyOk ? centsText(change.after) : null,
          delta: moneyOk ? centsText(change.after - (change.before ?? 0)) : null,
          next_step: deal.next_step,
          next_step_stale: summary.next_step_stale,
        });
      }
      const order = Object.keys(IN_REASONS);
      changes.sort(
        (a, b) =>
          order.indexOf(a.reason) - order.indexOf(b.reason) ||
          a.company.name.toLowerCase().localeCompare(b.company.name.toLowerCase()),
      );
      const byReason = Object.entries(IN_REASONS)
        .map(([reason, label]) => {
          const rows = changes.filter((row) => row.reason === reason);
          const totals: Record<string, number> = {};
          if (moneyOk)
            for (const row of rows) {
              const value = ["lost", "decreased"].includes(reason)
                ? (row.amount_before ?? "0")
                : row.amount_after;
              totals[String(row.currency)] =
                (totals[String(row.currency)] ?? 0) + Math.round(Number(value) * 100);
            }
          return {
            reason,
            label,
            count: rows.length,
            amounts: Object.fromEntries(
              Object.entries(totals)
                .sort()
                .map(([code, cents]) => [code, centsText(cents)]),
            ),
          };
        })
        .filter((row) => row.count > 0);
      return ok({
        window: { days, from: start, to: today, compared_from: comparedFrom, note },
        changes,
        by_reason: byReason,
        stale_steps: deals
          .filter((deal) => deal.status === "open" && dealSummary(deal).next_step_stale)
          .map((deal) => ({
            deal_id: deal.id,
            name: deal.name,
            company: companyName(deal.company_id),
            next_step: deal.next_step,
            next_step_due: deal.next_step_due,
            owner: staff.find((member) => member.id === deal.owner_staff_id)?.display_name ?? "",
          })),
        windows: [7, 14, 30],
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/forecast",
    auth: true,
    capability: "revenue:read",
    handler: ({ query }) => {
      const today = todayIso();
      const period = query.period || inQuarterOf(today);
      const bounds = inQuarterBounds(period);
      if (!bounds) return refuse(400, "malformed_request", { period: "a quarter such as 2026-Q4" });
      const tally = new Map<string, number>();
      for (const deal of deals) tally.set(deal.currency, (tally.get(deal.currency) ?? 0) + 1);
      const common = [...tally.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "USD";
      const currency = (query.currency || common).toUpperCase();
      const lines = inDealLines(period, currency);
      const wonCents = lines.won.reduce((total, line) => total + line.cents, 0);
      const sum = (category: string) =>
        lines.open
          .filter((line) => line.category === category)
          .reduce((total, line) => total + line.cents, 0);
      const commit = sum("commit");
      const best = sum("best_case");
      const pipeline = sum("pipeline");
      const openTotal = commit + best + pipeline;
      const goal = salesTargets.get(`${period}|${currency}`);
      const gap = goal === undefined ? null : Math.max(goal - wonCents, 0);
      const ended = bounds[1] < today;
      const wonIds = new Set(lines.won.map((line) => line.deal_id));
      const submissions = forecastSubmissions
        .filter((row) => row.period === period && row.currency === currency)
        .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at))
        .map((row) => inSubmissionView(row, ended ? wonCents : null, wonIds));
      const history = [];
      for (let back = 1; back <= 4; back += 1) {
        const past = inShiftQuarter(period, -back);
        const rows = forecastSubmissions
          .filter((row) => row.period === past && row.currency === currency)
          .sort((a, b) => a.submitted_at.localeCompare(b.submitted_at));
        if (!rows.length) continue;
        const pastLines = inDealLines(past, currency);
        const pastWon = pastLines.won.reduce((total, line) => total + line.cents, 0);
        const latest = rows.at(-1)!;
        history.push({
          period: past,
          call: centsText(latest.commit_cents),
          actual: centsText(pastWon),
          ...inAccuracy(latest.commit_cents, pastWon),
          deals_won: pastLines.won.length,
        });
      }
      const current = inQuarterOf(today);
      return ok({
        period,
        periods: [-4, -3, -2, -1, 0, 1, 2].map((offset) => inShiftQuarter(current, offset)),
        currency,
        currencies: [...tally.keys()].sort(),
        starts_on: bounds[0],
        ends_on: bounds[1],
        ended,
        goal: goal === undefined ? null : centsText(goal),
        won: centsText(wonCents),
        gap: gap === null ? null : centsText(gap),
        open: {
          commit: centsText(commit),
          best_case: centsText(best),
          pipeline: centsText(pipeline),
          total: centsText(openTotal),
        },
        coverage: gap ? Math.round((openTotal / gap) * 100) / 100 : null,
        suggested: {
          commit: centsText(wonCents + commit),
          best_case: centsText(wonCents + commit + best),
        },
        deals: [...lines.open]
          .sort(
            (a, b) =>
              (IN_RANK[b.category] ?? 0) - (IN_RANK[a.category] ?? 0) ||
              String(a.close_date).localeCompare(String(b.close_date)),
          )
          .map(inStrip),
        won_deals: lines.won.map(inStrip),
        undated_open: lines.undated,
        submissions: submissions.reverse(),
        history,
        categories: IN_SETTABLE.map((value) => ({ value, label: IN_CATEGORIES[value] })),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/forecast/submit",
    auth: true,
    capability: "deals:write",
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      const today = todayIso();
      const period = String(body.period ?? "") || inQuarterOf(today);
      const bounds = inQuarterBounds(period);
      if (!bounds) return refuse(400, "malformed_request", { period: "a quarter such as 2026-Q4" });
      if (bounds[1] < today)
        return refuse(400, "malformed_request", {
          period: "the quarter is over; a call is made before the result is known",
        });
      const currency = String(body.currency ?? "USD").toUpperCase();
      const cents = (name: string) => {
        const value = Number(String(body[name] ?? "").trim());
        return Number.isFinite(value) && value >= 0 ? Math.round(value * 100) : null;
      };
      const commit = cents("commit");
      const best = cents("best_case");
      if (commit === null)
        return refuse(400, "malformed_request", { commit: "an amount such as 12500.00" });
      if (best === null)
        return refuse(400, "malformed_request", { best_case: "an amount such as 12500.00" });
      if (best < commit)
        return refuse(400, "malformed_request", { best_case: "best case is at least the commit" });
      const lines = inDealLines(period, currency);
      const row: SubmissionRow = {
        id: randomUUID(),
        period,
        currency,
        commit_cents: commit,
        best_case_cents: best,
        closed_cents: lines.won.reduce((total, line) => total + line.cents, 0),
        pipeline_cents: lines.open.reduce((total, line) => total + line.cents, 0),
        deals: [
          ...lines.open
            .filter((line) => line.category === "commit" || line.category === "best_case")
            .map((line) => ({
              deal_id: line.deal_id,
              name: String(line.name),
              company: String(line.company),
              category: line.category,
              amount: String(line.amount),
            })),
          ...lines.won.map((line) => ({
            deal_id: line.deal_id,
            name: String(line.name),
            company: String(line.company),
            category: "closed",
            amount: String(line.amount),
          })),
        ],
        note: String(body.note ?? "")
          .trim()
          .slice(0, 2000),
        submitted_by: viewer.id,
        submitted_at: now(),
      };
      forecastSubmissions.push(row);
      audit("forecast.submitted", viewer.id, "forecast", row.id, "", { period, currency });
      return ok({ submission: inSubmissionView(row, null, new Set()) });
    },
  },
  {
    method: "POST",
    pattern: "hq/forecast/targets/update",
    auth: true,
    capability: "revenue:write",
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      const period = String(body.period ?? "") || inQuarterOf(todayIso());
      if (!inQuarterBounds(period))
        return refuse(400, "malformed_request", { period: "a quarter such as 2026-Q4" });
      const currency = String(body.currency ?? "USD").toUpperCase();
      const value = Number(String(body.amount ?? "").trim());
      if (!Number.isFinite(value) || value < 0)
        return refuse(400, "malformed_request", { amount: "an amount such as 12500.00" });
      salesTargets.set(`${period}|${currency}`, Math.round(value * 100));
      audit("forecast.target_set", viewer.id, "forecast", `${period}:${currency}`, "", {
        after: value.toFixed(2),
      });
      return ok({ period, currency, amount: value.toFixed(2) });
    },
  },
  {
    method: "GET",
    pattern: "hq/competitors",
    auth: true,
    capability: "deals:read",
    handler: () =>
      ok({
        competitors: competitors
          .filter((row) => !row.archived_at)
          .map(inCompetitorView)
          .sort(
            (a, b) =>
              b.record.open - a.record.open ||
              a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
          ),
        stale_after_days: IN_STALE_CARD_DAYS,
      }),
  },
  {
    method: "POST",
    pattern: "hq/competitors/create",
    auth: true,
    capability: "deals:write",
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      const name = String(body.name ?? "")
        .trim()
        .slice(0, 120);
      if (!name) return refuse(400, "malformed_request", { name: "the competitor's name" });
      if (
        competitors.some((row) => !row.archived_at && row.name.toLowerCase() === name.toLowerCase())
      )
        return refuse(400, "malformed_request", { name: "already on the list" });
      const row: CompetitorRow = {
        id: randomUUID(),
        name,
        website: String(body.website ?? "")
          .trim()
          .slice(0, 200),
        summary: String(body.summary ?? "")
          .trim()
          .slice(0, 1000),
        quick_dismiss: String(body.quick_dismiss ?? "")
          .trim()
          .slice(0, 1000),
        why_we_win: String(body.why_we_win ?? "")
          .trim()
          .slice(0, 2000),
        why_we_lose: String(body.why_we_lose ?? "")
          .trim()
          .slice(0, 2000),
        objections: inObjections(body.objections),
        reviewed_at: now(),
        reviewed_by: viewer.id,
        archived_at: null,
      };
      competitors.push(row);
      audit("competitor.created", viewer.id, "competitor", row.id, "", { name });
      return ok({ competitor: inCompetitorView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/competitors/{competitor_id}",
    auth: true,
    capability: "deals:read",
    handler: ({ params }) => {
      const row = competitors.find((item) => item.id === params.competitor_id && !item.archived_at);
      if (!row) return refuse(404, "not_found");
      const on = new Map(
        dealCompetitors
          .filter((item) => item.competitor_id === row.id)
          .map((item) => [item.deal_id, item]),
      );
      for (const deal of deals)
        if (
          row.name &&
          deal.loss_competitor.trim().toLowerCase() === row.name.toLowerCase() &&
          !on.has(deal.id)
        )
          on.set(deal.id, {
            deal_id: deal.id,
            competitor_id: row.id,
            strengths: "",
            weaknesses: "",
            state: "active",
          });
      const lines = [...on.values()]
        .map((item) => {
          const deal = deals.find((candidate) => candidate.id === item.deal_id);
          return deal
            ? {
                deal_id: deal.id,
                name: deal.name,
                company: companyName(deal.company_id),
                status: deal.status,
                stage: stageOf(deal.stage_key)?.label ?? deal.stage_key,
                state: item.state,
                strengths: item.strengths,
                weaknesses: item.weaknesses,
                loss_detail: deal.status === "lost" ? deal.loss_detail : "",
              }
            : null;
        })
        .filter((line): line is NonNullable<typeof line> => line !== null)
        .sort(
          (a, b) =>
            Number(a.status !== "open") - Number(b.status !== "open") ||
            a.company.toLowerCase().localeCompare(b.company.toLowerCase()),
        );
      return ok({ competitor: inCompetitorView(row), deals: lines });
    },
  },
  {
    method: "POST",
    pattern: "hq/competitors/{competitor_id}/update",
    auth: true,
    capability: "deals:write",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = competitors.find((item) => item.id === params.competitor_id && !item.archived_at);
      if (!row) return refuse(404, "not_found");
      if (body.archive) {
        row.archived_at = now();
        audit("competitor.archived", viewer.id, "competitor", row.id, "", { name: row.name });
        return ok({ archived: true });
      }
      if ("name" in body) {
        const name = String(body.name ?? "")
          .trim()
          .slice(0, 120);
        if (!name) return refuse(400, "malformed_request", { name: "the competitor's name" });
        if (
          name.toLowerCase() !== row.name.toLowerCase() &&
          competitors.some(
            (other) => !other.archived_at && other.name.toLowerCase() === name.toLowerCase(),
          )
        )
          return refuse(400, "malformed_request", { name: "already on the list" });
        row.name = name;
      }
      for (const [name, limit] of [
        ["website", 200],
        ["summary", 1000],
        ["quick_dismiss", 1000],
        ["why_we_win", 2000],
        ["why_we_lose", 2000],
      ] as const)
        if (name in body)
          row[name] = String(body[name] ?? "")
            .trim()
            .slice(0, limit);
      if ("objections" in body) row.objections = inObjections(body.objections);
      row.reviewed_at = now();
      row.reviewed_by = viewer.id;
      audit("competitor.updated", viewer.id, "competitor", row.id, "", {});
      return ok({ competitor: inCompetitorView(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/deals/{deal_id}/competitors",
    auth: true,
    capability: "deals:write",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const deal = deals.find((row) => row.id === params.deal_id);
      if (!deal) return refuse(404, "not_found");
      const action = String(body.action ?? "");
      if (!["add", "update", "eliminate", "restore", "remove"].includes(action))
        return refuse(400, "malformed_request", {
          action: "add, update, eliminate, restore, remove",
        });
      const competitorId = String(body.competitor_id ?? "");
      const card = competitors.find((row) => row.id === competitorId && !row.archived_at);
      if (!card)
        return refuse(400, "malformed_request", {
          competitor_id: "choose a competitor on the list",
        });
      const index = dealCompetitors.findIndex(
        (row) => row.deal_id === deal.id && row.competitor_id === card.id,
      );
      if (action === "add") {
        if (index >= 0)
          return refuse(400, "malformed_request", { competitor_id: "already on this deal" });
        dealCompetitors.push({
          deal_id: deal.id,
          competitor_id: card.id,
          strengths: String(body.strengths ?? "")
            .trim()
            .slice(0, 1000),
          weaknesses: String(body.weaknesses ?? "")
            .trim()
            .slice(0, 1000),
          state: "active",
        });
      } else {
        if (index < 0)
          return refuse(400, "malformed_request", { competitor_id: "not on this deal" });
        const row = dealCompetitors[index]!;
        if (action === "remove") dealCompetitors.splice(index, 1);
        else if (action === "update") {
          if ("strengths" in body)
            row.strengths = String(body.strengths ?? "")
              .trim()
              .slice(0, 1000);
          if ("weaknesses" in body)
            row.weaknesses = String(body.weaknesses ?? "")
              .trim()
              .slice(0, 1000);
        } else row.state = action === "eliminate" ? "eliminated" : "active";
      }
      audit(`deal.competitor_${action}`, viewer.id, "deal", deal.id, "", { competitor: card.name });
      return ok({ competitors: inDealCompetitors(deal.id) });
    },
  },
  {
    method: "GET",
    pattern: "hq/win-loss",
    auth: true,
    capability: "deals:read",
    handler: () => {
      const views = interviews
        .map(inInterviewView)
        .sort((a, b) => b.held_on.localeCompare(a.held_on));
      const asked = new Set(views.map((view) => view.deal_id));
      const cutoff = agoIso(24 * 180);
      return ok({
        interviews: views,
        tally: {
          won: inTally(views.filter((view) => view.outcome === "won")),
          lost: inTally(views.filter((view) => view.outcome === "lost")),
        },
        counts: {
          interviews: views.length,
          won: views.filter((view) => view.outcome === "won").length,
          lost: views.filter((view) => view.outcome === "lost").length,
        },
        not_interviewed: deals
          .filter(
            (deal) =>
              (deal.status === "won" || deal.status === "lost") &&
              deal.closed_at &&
              deal.closed_at >= cutoff &&
              !asked.has(deal.id),
          )
          .map((deal) => ({
            deal_id: deal.id,
            name: deal.name,
            company: companyName(deal.company_id),
            outcome: deal.status,
            closed_at: deal.closed_at,
          }))
          .sort((a, b) => String(b.closed_at).localeCompare(String(a.closed_at))),
        drivers: Object.entries(IN_DRIVERS).map(([value, label]) => ({ value, label })),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/deals/{deal_id}/interviews",
    auth: true,
    capability: "deals:write",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const deal = deals.find((row) => row.id === params.deal_id);
      if (!deal) return refuse(404, "not_found");
      if (deal.status !== "won" && deal.status !== "lost")
        return refuse(400, "malformed_request", {
          deal: "an interview is held once the deal is won or lost",
        });
      const held = String(body.held_on ?? "") || todayIso();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(held) || held > todayIso())
        return refuse(400, "malformed_request", { held_on: "a date, not in the future" });
      const buyer = String(body.buyer_reason ?? "")
        .trim()
        .slice(0, 400);
      if (!buyer)
        return refuse(400, "malformed_request", {
          buyer_reason: "why they decided, in their words",
        });
      const seen = new Set<string>();
      const drivers = (Array.isArray(body.drivers) ? body.drivers : [])
        .map((item) => ({
          driver: String((item as Record<string, unknown>).driver ?? ""),
          effect: String((item as Record<string, unknown>).effect ?? ""),
        }))
        .filter((item) => {
          const valid =
            IN_DRIVERS[item.driver] &&
            ["positive", "negative"].includes(item.effect) &&
            !seen.has(item.driver);
          if (valid) seen.add(item.driver);
          return valid;
        });
      const row: InterviewRow = {
        id: randomUUID(),
        deal_id: deal.id,
        held_on: held,
        interviewer_staff_id: viewer.id,
        interviewee_name: String(body.interviewee_name ?? "")
          .trim()
          .slice(0, 160),
        interviewee_title: String(body.interviewee_title ?? "")
          .trim()
          .slice(0, 120),
        buyer_reason: buyer,
        drivers,
        quotes: String(body.quotes ?? "")
          .trim()
          .slice(0, 4000),
        summary: String(body.summary ?? "")
          .trim()
          .slice(0, 4000),
      };
      interviews.push(row);
      audit("deal.interview_recorded", viewer.id, "deal", deal.id, "", { interview_id: row.id });
      return ok({ interview: inInterviewView(row) });
    },
  },
  // --- the privacy desk (mirrors privacy_routes.py) ------------------------------------------------
  {
    method: "GET",
    pattern: "hq/privacy/requests",
    auth: true,
    capability: "privacy:read",
    handler: ({ query }) => {
      const today = todayIso();
      let views = privacyRequests.map((row) => pvRequestView(row, today));
      const live = views.filter((view) => view.open);
      const stats = {
        open: live.length,
        overdue: live.filter((view) => view.clock.overdue).length,
        due_soon: live.filter(
          (view) =>
            view.clock.days_left !== null && view.clock.days_left >= 0 && view.clock.days_left <= 7,
        ).length,
        stopped: live.filter((view) => view.clock.state === "stopped").length,
        not_started: live.filter((view) => view.clock.state === "not_started").length,
        complaints_unacknowledged: live.filter(
          (view) => view.kind === "complaint" && !view.acknowledged_on,
        ).length,
      };
      const scope = query.scope || "open";
      if (query.company_id) views = views.filter((view) => view.company?.id === query.company_id);
      else if (scope === "open") views = views.filter((view) => view.open);
      else if (scope === "closed") views = views.filter((view) => !view.open);
      const rank = (view: (typeof views)[number]): [number, string] =>
        !view.open
          ? [3, `~${view.responded_on ?? view.received_on}`]
          : view.clock.due_on
            ? [0, view.clock.due_on]
            : [view.clock.state === "stopped" ? 1 : 2, view.received_on];
      views.sort((a, b) => rank(a)[0] - rank(b)[0] || rank(a)[1].localeCompare(rank(b)[1]));
      return ok({
        requests: views,
        stats,
        kinds: Object.entries(PV_KINDS).map(([value, label]) => ({ value, label })),
        regimes: Object.entries(PV_REGIMES).map(([value, label]) => ({ value, label })),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/privacy/requests/create",
    auth: true,
    capability: "privacy:write",
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      const today = todayIso();
      const kind = String(body.kind ?? "");
      if (!PV_KINDS[kind])
        return refuse(400, "malformed_request", { kind: "choose what they asked for" });
      const regime = String(body.regime ?? "uk_gdpr");
      if (!PV_REGIMES[regime])
        return refuse(400, "malformed_request", {
          regime: "UK GDPR, EU GDPR, India DPDP or other",
        });
      const channel = String(body.channel ?? "email");
      if (!PV_CHANNELS.includes(channel))
        return refuse(400, "malformed_request", { channel: PV_CHANNELS.join(", ") });
      const email = String(body.requester_email ?? "")
        .trim()
        .toLowerCase()
        .slice(0, 254);
      const name = String(body.requester_name ?? "")
        .trim()
        .slice(0, 160);
      if (!email && !name)
        return refuse(400, "malformed_request", {
          requester_email: "who is asking: an email or a name",
        });
      if (email && (!email.includes("@") || email.includes(" ")))
        return refuse(400, "malformed_request", { requester_email: "an email address" });
      const received = String(body.received_on ?? "") || today;
      if (!/^\d{4}-\d{2}-\d{2}$/.test(received))
        return refuse(400, "malformed_request", { received_on: "a date, YYYY-MM-DD" });
      if (received > today)
        return refuse(400, "malformed_request", { received_on: "cannot be in the future" });
      const identity = String(body.identity ?? "not_needed");
      if (!["not_needed", "requested"].includes(identity))
        return refuse(400, "malformed_request", { identity: "not_needed or requested" });
      if (badId(body.company_id))
        return refuse(400, "malformed_request", { company_id: "not an id" });
      let companyId = String(body.company_id ?? "");
      if (companyId && !companies.some((row) => row.id === companyId))
        return refuse(400, "malformed_request", { company_id: "no such company" });
      const person = email ? people.find((row) => row.email.toLowerCase() === email) : undefined;
      if (person && !companyId) companyId = person.company_id;
      const prefix = kind === "complaint" ? "PC" : "PR";
      const row: PrivacyRequestRow = {
        id: randomUUID(),
        reference: pvReference(
          privacyRequests.map((item) => item.reference),
          prefix,
          Number(received.slice(0, 4)),
        ),
        kind,
        regime,
        channel,
        requester_name: name,
        requester_email: email,
        person_id: person?.id ?? "",
        company_id: companyId,
        description: String(body.description ?? "")
          .trim()
          .slice(0, 4000),
        received_on: received,
        identity_state: identity,
        identity_confirmed_on: null,
        identity_method: "",
        fee_requested_on: null,
        fee_paid_on: null,
        status: identity === "requested" ? "identity" : "received",
        paused_on: null,
        paused_question: "",
        paused_days: 0,
        extended: false,
        extension_reason: "",
        extension_told_on: null,
        acknowledged_on: null,
        responded_on: null,
        outcome: "",
        outcome_detail: "",
        assignee_staff_id: viewer.id,
        created_at: now(),
        updated_at: now(),
      };
      privacyRequests.push(row);
      if (kind !== "complaint")
        for (const system of Object.keys(PV_SYSTEMS))
          privacySearches.set(`${row.id}|${system}`, {
            state: "pending",
            note: "",
            staff_id: "",
            at: null,
          });
      const due = pvDueOn(row);
      pvEvent(
        "request",
        row.id,
        "received",
        `Received ${pvDay(received)} by ${channel}.` +
          (due
            ? ` Due ${pvDay(due)}.`
            : identity === "requested"
              ? " Proof of identity asked for; the month starts when it is confirmed."
              : ""),
        viewer.id,
      );
      audit("privacy_request.created", viewer.id, "privacy_request", row.id, "", {
        reference: row.reference,
        kind,
        regime,
      });
      return ok({ request: pvRequestView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/privacy/requests/{request_id}",
    auth: true,
    capability: "privacy:read",
    handler: ({ params }) => {
      const row = privacyRequests.find((item) => item.id === params.request_id);
      if (!row) return refuse(404, "not_found");
      const person = people.find((item) => item.id === row.person_id);
      const view = pvRequestView(row);
      const erased = person ? erasedPeople.has(person.id) : false;
      return ok({
        request: view,
        person: person
          ? {
              id: person.id,
              name: person.full_name,
              email: person.email,
              do_not_contact: person.do_not_contact,
              erased,
            }
          : null,
        searches:
          row.kind === "complaint"
            ? []
            : Object.entries(PV_SYSTEMS).map(([system, label]) => {
                const found = privacySearches.get(`${row.id}|${system}`);
                return {
                  system,
                  label,
                  state: found?.state ?? "pending",
                  note: found?.note ?? "",
                  by: staff.find((member) => member.id === found?.staff_id)?.display_name ?? "",
                  at: found?.at ?? null,
                };
              }),
        matches: pvMatches(row.requester_email, person),
        events: pvEvents("request", row.id),
        can_erase: row.kind === "erasure" && view.open && Boolean(person) && !erased,
        can_stop_contact:
          ["erasure", "objection", "consent"].includes(row.kind) &&
          view.open &&
          Boolean(row.requester_email || person),
        refusals: Object.entries(PV_REFUSALS).map(([value, label]) => ({ value, label })),
        staff: staff
          .filter((member) => member.is_active)
          .map((member) => ({ id: member.id, name: member.display_name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/privacy/requests/{request_id}/act",
    auth: true,
    capability: "privacy:write",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = privacyRequests.find((item) => item.id === params.request_id);
      if (!row) return refuse(404, "not_found");
      const action = String(body.action ?? "");
      const today = todayIso();
      const text = (name: string, limit = 2000) =>
        String(body[name] ?? "")
          .trim()
          .slice(0, limit);
      const day = (name: string) => {
        const value = String(body[name] ?? "") || today;
        return /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
      };
      if (!PV_OPEN.includes(row.status) && action !== "note")
        return refuse(400, "malformed_request", {
          status: `this request is ${row.status}; only a note can be added`,
        });
      const clock = pvClock(row, today);
      let detail = "";
      if (action === "assign") {
        const assignee = String(body.assignee_staff_id ?? "");
        const member = staff.find((item) => item.id === assignee);
        if (!member)
          return refuse(400, "malformed_request", { assignee_staff_id: "choose who handles it" });
        row.assignee_staff_id = assignee;
        detail = `Given to ${member.display_name}.`;
        inboxAssigned(
          assignee,
          "privacy_request",
          row.id,
          viewer,
          `${row.reference}: ${PV_KINDS[row.kind]}`,
          row.reference,
          `/privacy/requests/${row.id}`,
        );
      } else if (action === "request_identity") {
        if (row.kind === "complaint")
          return refuse(400, "malformed_request", {
            action: "a complaint does not wait on identity",
          });
        if (row.identity_state === "confirmed")
          return refuse(400, "malformed_request", { identity: "identity is already confirmed" });
        row.identity_state = "requested";
        row.status = "identity";
        detail =
          text("note", 400) ||
          "Proof of identity asked for. The month starts when it is confirmed.";
      } else if (action === "confirm_identity") {
        const on = day("on");
        if (!on || on > today)
          return refuse(400, "malformed_request", { on: "cannot be in the future" });
        if (on < row.received_on)
          return refuse(400, "malformed_request", { on: "cannot be before the request arrived" });
        const method = text("method", 200);
        if (!method)
          return refuse(400, "malformed_request", { method: "how identity was confirmed" });
        row.identity_state = "confirmed";
        row.identity_confirmed_on = on;
        row.identity_method = method;
        if (["received", "identity"].includes(row.status)) row.status = "searching";
        detail = `Identity confirmed on ${pvDay(on)}: ${method}.`;
      } else if (action === "stop_clock") {
        if (row.kind === "complaint")
          return refuse(400, "malformed_request", { action: "a complaint's clock does not stop" });
        if (clock.state !== "running")
          return refuse(400, "malformed_request", { clock: "the clock is not running" });
        const on = day("on");
        if (!on || on > today)
          return refuse(400, "malformed_request", { on: "cannot be in the future" });
        const start = pvClockStart(row);
        if (start && on < start)
          return refuse(400, "malformed_request", { on: "cannot be before the clock started" });
        const question = text("question", 1000);
        if (!question)
          return refuse(400, "malformed_request", {
            question: "what you asked them, to scope the request",
          });
        row.paused_on = on;
        row.paused_question = question;
        row.status = "scoping";
        detail = `Clock stopped on ${pvDay(on)} while we wait for: ${question}`;
      } else if (action === "resume_clock") {
        if (!row.paused_on)
          return refuse(400, "malformed_request", { clock: "the clock is not stopped" });
        const on = day("on");
        if (!on || on > today)
          return refuse(400, "malformed_request", { on: "cannot be in the future" });
        if (on < row.paused_on)
          return refuse(400, "malformed_request", { on: "the answer came after the question" });
        const days = pvStoppedDays(row.paused_on, on);
        row.paused_days += days;
        row.paused_on = null;
        row.status = "searching";
        detail = `Answer received on ${pvDay(on)}; the clock runs again from the next day. ${days} day${days === 1 ? "" : "s"} added; due ${pvDay(pvDueOn(row))}.`;
      } else if (action === "review") {
        row.status = "review";
        detail = text("note", 400) || "Searches done; the response is being reviewed.";
      } else if (action === "extend") {
        if (!clock.can_extend)
          return refuse(400, "malformed_request", {
            extend: "only inside the first month, once, for a UK or EU request",
          });
        const reason = text("reason", 1000);
        if (!reason)
          return refuse(400, "malformed_request", {
            reason: "why it is complex or one of many — the person is told this",
          });
        const told = day("told_on");
        if (!told || told > today)
          return refuse(400, "malformed_request", { told_on: "cannot be in the future" });
        if (clock.extend_by && told > clock.extend_by)
          return refuse(400, "malformed_request", {
            told_on: `they must be told by ${pvDay(clock.extend_by)}`,
          });
        row.extended = true;
        row.extension_reason = reason;
        row.extension_told_on = told;
        detail = `Extended by two months, told on ${pvDay(told)}: ${reason}. Now due ${pvDay(pvDueOn(row))}.`;
      } else if (action === "acknowledge") {
        if (row.kind !== "complaint")
          return refuse(400, "malformed_request", { action: "only a complaint is acknowledged" });
        const on = day("on");
        if (!on || on > today)
          return refuse(400, "malformed_request", { on: "cannot be in the future" });
        row.acknowledged_on = on;
        if (row.status === "received") row.status = "searching";
        detail = `Acknowledged on ${pvDay(on)}.`;
      } else if (action === "respond") {
        const on = day("on");
        if (!on || on > today)
          return refuse(400, "malformed_request", { on: "cannot be in the future" });
        if (on < row.received_on)
          return refuse(400, "malformed_request", { on: "cannot be before the request arrived" });
        const outcome = String(body.outcome ?? "");
        if (!PV_OUTCOMES.includes(outcome))
          return refuse(400, "malformed_request", { outcome: PV_OUTCOMES.join(", ") });
        if (row.kind !== "complaint") {
          const pending = Object.entries(PV_SYSTEMS)
            .filter(
              ([system]) =>
                (privacySearches.get(`${row.id}|${system}`)?.state ?? "pending") === "pending",
            )
            .map(([, label]) => label);
          if (pending.length)
            return refuse(400, "malformed_request", {
              searches: `not yet searched: ${pending.join("; ")}`,
            });
        }
        if (row.paused_on)
          return refuse(400, "malformed_request", {
            clock: "the clock is stopped; record the answer first",
          });
        const summary = text("detail");
        if (!summary)
          return refuse(400, "malformed_request", { detail: "what they were sent or told" });
        const late = clock.due_on !== null && on > clock.due_on;
        row.status = "responded";
        row.responded_on = on;
        row.outcome = outcome;
        row.outcome_detail = summary;
        detail = `Responded on ${pvDay(on)} (${outcome.replace("_", " ")})${late ? " — after the deadline" : ""}: ${summary}`;
      } else if (action === "refuse") {
        const on = day("on");
        const reason = String(body.reason ?? "");
        if (!PV_REFUSALS[reason])
          return refuse(400, "malformed_request", { reason: Object.keys(PV_REFUSALS).join(", ") });
        const summary = text("detail");
        if (!summary)
          return refuse(400, "malformed_request", {
            detail: "the reasons they were given, and that they may complain to the regulator",
          });
        row.status = "refused";
        row.responded_on = on;
        row.outcome = "refused";
        row.outcome_detail = `${PV_REFUSALS[reason]}: ${summary}`;
        detail = `Refused on ${pvDay(on)} — ${PV_REFUSALS[reason]}: ${summary}`;
      } else if (action === "withdraw") {
        row.status = "withdrawn";
        row.responded_on = today;
        detail = text("note", 400) || "Withdrawn by the person.";
      } else if (action === "note") {
        detail = text("note");
        if (!detail) return refuse(400, "malformed_request", { note: "write the note" });
      } else if (action === "request_fee" || action === "fee_paid") {
        const on = day("on");
        if (action === "request_fee") {
          const reason = text("reason", 400);
          if (!reason) return refuse(400, "malformed_request", { reason: "why a fee is charged" });
          row.fee_requested_on = on;
          detail = `Fee asked for on ${pvDay(on)}: ${reason}. The clock waits until it is paid.`;
        } else {
          if (!row.fee_requested_on)
            return refuse(400, "malformed_request", { fee: "no fee was asked for" });
          row.fee_paid_on = on;
          detail = `Fee paid on ${pvDay(on)}.`;
        }
      } else return refuse(400, "malformed_request", { action: "not a request act" });
      row.updated_at = now();
      pvEvent("request", row.id, action, detail, viewer.id);
      audit(`privacy_request.${action}`, viewer.id, "privacy_request", row.id, "", {
        reference: row.reference,
      });
      return ok({ request: pvRequestView(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/privacy/requests/{request_id}/search",
    auth: true,
    capability: "privacy:write",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = privacyRequests.find((item) => item.id === params.request_id);
      if (!row) return refuse(404, "not_found");
      if (!PV_OPEN.includes(row.status))
        return refuse(400, "malformed_request", { status: "the request is closed" });
      if (row.kind === "complaint")
        return refuse(400, "malformed_request", { system: "a complaint has no search checklist" });
      const system = String(body.system ?? "");
      if (!PV_SYSTEMS[system])
        return refuse(400, "malformed_request", { system: Object.keys(PV_SYSTEMS).join(", ") });
      const state = String(body.state ?? "");
      if (!PV_SEARCH_STATES.includes(state))
        return refuse(400, "malformed_request", { state: PV_SEARCH_STATES.join(", ") });
      const note = String(body.note ?? "")
        .trim()
        .slice(0, 1000);
      if (state === "found" && !note)
        return refuse(400, "malformed_request", {
          note: "what was found, and what was done with it",
        });
      privacySearches.set(`${row.id}|${system}`, {
        state,
        note,
        staff_id: state === "pending" ? "" : viewer.id,
        at: state === "pending" ? null : now(),
      });
      const labels: Record<string, string> = {
        found: "found data",
        none: "holds nothing",
        not_applicable: "not applicable",
        pending: "back to be searched",
      };
      pvEvent(
        "request",
        row.id,
        "search",
        `${PV_SYSTEMS[system]}: ${labels[state]}${note ? ` — ${note}` : ""}`,
        viewer.id,
      );
      if (row.status === "received") row.status = "searching";
      audit("privacy_request.searched", viewer.id, "privacy_request", row.id, "", {
        system,
        state,
      });
      return ok({ system, state });
    },
  },
  {
    method: "POST",
    pattern: "hq/privacy/requests/{request_id}/stop-contact",
    auth: true,
    capability: "privacy:write",
    handler: ({ headers, params }) => {
      const viewer = caller(headers)!.member;
      const row = privacyRequests.find((item) => item.id === params.request_id);
      if (!row) return refuse(404, "not_found");
      if (!["erasure", "objection", "consent"].includes(row.kind) || !PV_OPEN.includes(row.status))
        return refuse(400, "malformed_request", {
          action: "only an open erasure, objection or consent withdrawal",
        });
      const person = people.find((item) => item.id === row.person_id);
      if (person) person.do_not_contact = true;
      const email = row.requester_email || (person?.email ?? "").toLowerCase();
      if (!email && !person)
        return refuse(400, "malformed_request", {
          requester_email: "no address or person to stop",
        });
      const reason = { erasure: "erasure", objection: "objection", consent: "consent_withdrawn" }[
        row.kind
      ]!;
      const added = pvSuppress(email, reason, viewer.id, row.reference);
      privacySearches.set(`${row.id}|mail`, {
        state: "found",
        note: "Suppressed: no campaign, sequence or list mail reaches this address.",
        staff_id: viewer.id,
        at: now(),
      });
      pvEvent(
        "request",
        row.id,
        "stop_contact",
        "Marked do not contact" +
          (added
            ? " and the address added to the suppression list."
            : "; the address was already suppressed."),
        viewer.id,
      );
      audit("privacy_request.stop_contact", viewer.id, "privacy_request", row.id, "", {
        reference: row.reference,
        suppressed: added,
      });
      return ok({ suppressed: added, person_marked: Boolean(person) });
    },
  },
  {
    method: "POST",
    pattern: "hq/privacy/requests/{request_id}/erase",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = privacyRequests.find((item) => item.id === params.request_id);
      if (!row) return refuse(404, "not_found");
      if (row.kind !== "erasure" || !PV_OPEN.includes(row.status))
        return refuse(400, "malformed_request", { action: "only an open erasure request erases" });
      const person = people.find((item) => item.id === row.person_id);
      if (!person)
        return refuse(400, "malformed_request", { person: "link the request to the person first" });
      if (erasedPeople.has(person.id))
        return refuse(400, "malformed_request", { person: "already erased" });
      const reason = String(body.reason ?? "")
        .trim()
        .slice(0, 400);
      if (!reason)
        return refuse(400, "malformed_request", {
          reason: "why erasure applies (and no exemption keeps the data)",
        });
      const email = person.email.toLowerCase() || row.requester_email;
      let leadCount = 0;
      for (const lead of leads)
        if (
          !lead.anonymised_at &&
          (lead.converted_person_id === person.id || (email && lead.email.toLowerCase() === email))
        ) {
          Object.assign(lead, {
            email: "",
            full_name: "",
            company_name: "",
            message: "",
            payload: {},
            anonymised_at: now(),
          });
          leadCount += 1;
        }
      let memberships = 0;
      for (let index = mailListMembers.length - 1; index >= 0; index -= 1)
        if (
          mailListMembers[index]!.person_id === person.id ||
          (email && mailListMembers[index]!.email_norm === email)
        ) {
          mailListMembers.splice(index, 1);
          memberships += 1;
        }
      let attendances = 0;
      for (let index = meetingAttendees.length - 1; index >= 0; index -= 1)
        if (
          meetingAttendees[index]!.person_id === person.id ||
          (email && meetingAttendees[index]!.email.toLowerCase() === email)
        ) {
          meetingAttendees.splice(index, 1);
          attendances += 1;
        }
      let notes = 0;
      for (const activity of activities)
        if (
          activity.person_id === person.id &&
          !activity.company_id &&
          !activity.deal_id &&
          activity.body
        ) {
          activity.body = "";
          notes += 1;
        }
      Object.assign(person, {
        full_name: "",
        email: "",
        title: "",
        phone: "",
        notes: "",
        role_category: "",
        account_user_id: "",
        do_not_contact: true,
      });
      erasedPeople.add(person.id);
      const added = pvSuppress(email, "erasure", viewer.id, row.reference);
      const summary = `Erased from the CRM: the person record emptied, ${leadCount} lead(s), ${memberships} list membership(s), ${attendances} meeting attendance(s) and ${notes} note(s) on them alone. The address stays on the suppression list only.`;
      privacySearches.set(`${row.id}|crm`, {
        state: "found",
        note: summary,
        staff_id: viewer.id,
        at: now(),
      });
      pvEvent("request", row.id, "erased", `${summary} Reason: ${reason}`, viewer.id);
      audit("person.erased", viewer.id, "person", person.id, reason, {
        reference: row.reference,
        leads: leadCount,
      });
      return ok({
        erased: { leads: leadCount, list_memberships: memberships, attendances, activities: notes },
        suppressed: added,
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/incidents",
    auth: true,
    capability: "privacy:read",
    handler: () => {
      const views = incidents.map(pvIncidentView);
      const live = views.filter((view) => view.status !== "closed");
      views.sort(
        (a, b) =>
          Number(a.status === "closed") - Number(b.status === "closed") ||
          String(b.detected_at).localeCompare(String(a.detected_at)),
      );
      return ok({
        incidents: views,
        stats: {
          open: live.length,
          unassessed: live.filter((view) => view.regulator.state === "unassessed").length,
          regulator_due: live.filter((view) => ["unassessed", "due"].includes(view.regulator.state))
            .length,
          customers_owed: live.reduce((total, view) => total + view.customers_owed, 0),
          breaches_logged: views.filter((view) => view.personal_data).length,
        },
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/incidents/create",
    auth: true,
    capability: "privacy:write",
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      const title = String(body.title ?? "")
        .trim()
        .slice(0, 200);
      if (!title) return refuse(400, "malformed_request", { title: "what happened, in a line" });
      const kind = String(body.kind ?? "security");
      if (!PV_INCIDENT_KINDS[kind])
        return refuse(400, "malformed_request", {
          kind: Object.keys(PV_INCIDENT_KINDS).join(", "),
        });
      const severity = String(body.severity ?? "medium");
      if (!PV_SEVERITIES.includes(severity))
        return refuse(400, "malformed_request", { severity: PV_SEVERITIES.join(", ") });
      const moment = (name: string) => {
        const value = String(body[name] ?? "").trim();
        if (!value) return null;
        const parsed = Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
        return Number.isFinite(parsed)
          ? new Date(parsed).toISOString().replace(/\.\d{3}Z$/, "Z")
          : "bad";
      };
      const detected = moment("detected_at") ?? now();
      const aware = moment("aware_at");
      if (detected === "bad" || aware === "bad")
        return refuse(400, "malformed_request", {
          detected_at: "a date and time, YYYY-MM-DDTHH:MM",
        });
      if (detected > new Date(Date.now() + 300_000).toISOString())
        return refuse(400, "malformed_request", { detected_at: "cannot be in the future" });
      const personal = Boolean(body.personal_data);
      const reference = pvReference(
        incidents.map((item) => item.reference),
        "INC",
        Number(detected.slice(0, 4)),
      );
      const row: IncidentRow = {
        id: randomUUID(),
        reference,
        title,
        summary: String(body.summary ?? "")
          .trim()
          .slice(0, 4000),
        kind,
        severity,
        status: "open",
        personal_data: personal,
        occurred_at: null,
        detected_at: detected,
        aware_at: personal ? (aware ?? detected) : aware,
        contained_at: null,
        resolved_at: null,
        data_categories: String(body.data_categories ?? "")
          .trim()
          .slice(0, 400),
        subjects_estimate: null,
        records_estimate: null,
        risk: "",
        risk_reason: "",
        assessed_by: "",
        assessed_at: null,
        regulator_notified_at: null,
        regulator_reference: "",
        late_reason: "",
        individuals_notified_at: null,
        lessons: "",
        lead_staff_id: viewer.id,
        created_at: now(),
      };
      incidents.push(row);
      pvEvent(
        "incident",
        row.id,
        "logged",
        `Logged. Detected ${pvMoment(detected)}.${personal ? ` Personal data involved: the regulator's 72 hours run from ${pvMoment(row.aware_at)}.` : ""}`,
        viewer.id,
      );
      audit("incident.logged", viewer.id, "incident", row.id, "", {
        reference,
        severity,
        personal_data: personal,
      });
      return ok({ incident: pvIncidentView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/incidents/{incident_id}",
    auth: true,
    capability: "privacy:read",
    handler: ({ params }) => {
      const row = incidents.find((item) => item.id === params.incident_id);
      if (!row) return refuse(404, "not_found");
      return ok({
        incident: pvIncidentView(row),
        events: pvEvents("incident", row.id),
        risks: Object.entries(PV_RISKS).map(([value, label]) => ({ value, label })),
        staff: staff
          .filter((member) => member.is_active)
          .map((member) => ({ id: member.id, name: member.display_name }))
          .sort((a, b) => a.name.localeCompare(b.name)),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/incidents/{incident_id}/act",
    auth: true,
    capability: "privacy:write",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = incidents.find((item) => item.id === params.incident_id);
      if (!row) return refuse(404, "not_found");
      const action = String(body.action ?? "");
      if (row.status === "closed" && !["note", "lessons"].includes(action))
        return refuse(400, "malformed_request", {
          status: "the incident is closed; add a note instead",
        });
      const text = (name: string, limit = 2000) =>
        String(body[name] ?? "")
          .trim()
          .slice(0, limit);
      const moment = (name: string) => {
        const value = String(body[name] ?? "").trim();
        if (!value) return now();
        const parsed = Date.parse(/[zZ]|[+-]\d{2}:\d{2}$/.test(value) ? value : `${value}Z`);
        return Number.isFinite(parsed)
          ? new Date(parsed).toISOString().replace(/\.\d{3}Z$/, "Z")
          : now();
      };
      let detail = "";
      if (action === "update") {
        if ("summary" in body) row.summary = text("summary", 4000);
        if ("data_categories" in body) row.data_categories = text("data_categories", 400);
        for (const name of ["subjects_estimate", "records_estimate"] as const) {
          if (!(name in body)) continue;
          const raw = String(body[name] ?? "").trim();
          if (raw && !/^\d+$/.test(raw))
            return refuse(400, "malformed_request", { [name]: "a whole number" });
          row[name] = raw ? Number(raw) : null;
        }
        if ("severity" in body) {
          const severity = String(body.severity ?? "");
          if (!PV_SEVERITIES.includes(severity))
            return refuse(400, "malformed_request", { severity: PV_SEVERITIES.join(", ") });
          row.severity = severity;
        }
        if ("personal_data" in body) row.personal_data = Boolean(body.personal_data);
        if ("aware_at" in body && body.aware_at) row.aware_at = moment("aware_at");
        if (row.personal_data && !row.aware_at) row.aware_at = row.detected_at;
        detail = "Updated.";
      } else if (action === "status") {
        const target = String(body.status ?? "");
        if (!["contained", "resolved", "closed"].includes(target))
          return refuse(400, "malformed_request", { status: "contained, resolved or closed" });
        const at = moment("at");
        if (target === "contained") {
          row.status = "contained";
          row.contained_at = at;
        } else if (target === "resolved") {
          row.status = "resolved";
          row.resolved_at = at;
          row.contained_at = row.contained_at ?? at;
        } else {
          if (row.personal_data && !row.risk)
            return refuse(400, "malformed_request", {
              risk: "record whether it was notifiable before closing",
            });
          if (
            row.personal_data &&
            ["risk", "high"].includes(row.risk) &&
            !row.regulator_notified_at
          )
            return refuse(400, "malformed_request", {
              regulator: "the regulator has not been told",
            });
          const owed = incidentCustomers.filter(
            (item) => item.incident_id === row.id && !item.notified_at,
          );
          if (owed.length)
            return refuse(400, "malformed_request", {
              customers: `${owed.length} affected customer(s) not yet told`,
            });
          if (!row.lessons.trim())
            return refuse(400, "malformed_request", {
              lessons: "write what was learned before closing",
            });
          row.status = "closed";
          row.resolved_at = row.resolved_at ?? at;
        }
        detail = `Marked ${target} at ${pvMoment(at)}.`;
      } else if (action === "assess") {
        const risk = String(body.risk ?? "");
        if (!PV_RISKS[risk])
          return refuse(400, "malformed_request", { risk: Object.keys(PV_RISKS).join(", ") });
        if (!row.personal_data)
          return refuse(400, "malformed_request", {
            personal_data: "only a personal-data breach is assessed for notification",
          });
        const reason = text("reason");
        if (!reason)
          return refuse(400, "malformed_request", {
            reason: "why — the likely consequences for the people affected",
          });
        row.risk = risk;
        row.risk_reason = reason;
        row.assessed_by = viewer.id;
        row.assessed_at = now();
        detail = `Assessed: ${PV_RISKS[risk]}. ${reason}`;
      } else if (action === "regulator") {
        if (!row.personal_data)
          return refuse(400, "malformed_request", { personal_data: "not a personal-data breach" });
        const at = moment("at");
        const reference = text("reference", 80);
        const clock = pvRegulatorClock(row);
        const lateReason = text("late_reason", 1000);
        if (clock.due_at && at > clock.due_at && !lateReason)
          return refuse(400, "malformed_request", {
            late_reason: "after 72 hours the notification must give the reasons for the delay",
          });
        row.regulator_notified_at = at;
        row.regulator_reference = reference;
        row.late_reason = lateReason;
        detail = `Regulator notified at ${pvMoment(at)}${reference ? ` (reference ${reference})` : ""}${lateReason ? `. Late: ${lateReason}` : "."}`;
      } else if (action === "individuals") {
        const how = text("how", 1000);
        if (!how)
          return refuse(400, "malformed_request", {
            how: "how they were told, and what they were told to do",
          });
        row.individuals_notified_at = moment("at");
        detail = `People affected told at ${pvMoment(row.individuals_notified_at)}: ${how}`;
      } else if (action === "add_customers") {
        const raw = Array.isArray(body.company_ids) ? body.company_ids : [body.company_ids];
        const ids = raw.map((value) => String(value ?? "")).filter(Boolean);
        if (!ids.length)
          return refuse(400, "malformed_request", { company_ids: "choose the customers affected" });
        if (ids.some((value) => badId(value)))
          return refuse(400, "malformed_request", { company_ids: "not an id" });
        const anchor = row.aware_at ?? row.detected_at;
        const added: string[] = [];
        for (const companyId of ids) {
          if (
            incidentCustomers.some(
              (item) => item.incident_id === row.id && item.company_id === companyId,
            )
          )
            continue;
          if (!companies.some((company) => company.id === companyId)) continue;
          const hours = commitmentsByCompany.get(companyId)?.incident_notice_hours ?? null;
          incidentCustomers.push({
            incident_id: row.id,
            company_id: companyId,
            due_at: hours
              ? new Date(Date.parse(anchor) + hours * 3_600_000)
                  .toISOString()
                  .replace(/\.\d{3}Z$/, "Z")
              : null,
            notified_at: null,
            note: "",
          });
          added.push(companyName(companyId));
        }
        if (!added.length)
          return refuse(400, "malformed_request", {
            company_ids: "already listed, or not a company",
          });
        detail = `Affected: ${added.join(", ")}.`;
      } else if (action === "customer_notified") {
        const companyId = String(body.company_id ?? "");
        const item = incidentCustomers.find(
          (entry) => entry.incident_id === row.id && entry.company_id === companyId,
        );
        if (!item)
          return refuse(400, "malformed_request", { company_id: "not listed as affected" });
        item.notified_at = moment("at");
        item.note = text("note", 1000);
        detail = `${companyName(companyId)} told at ${pvMoment(item.notified_at)}${item.note ? `: ${item.note}` : "."}`;
      } else if (action === "lessons") {
        const lessons = text("lessons", 4000);
        if (!lessons)
          return refuse(400, "malformed_request", {
            lessons: "what was learned, and what changes",
          });
        row.lessons = lessons;
        detail = "Lessons recorded.";
      } else if (action === "note") {
        detail = text("note");
        if (!detail) return refuse(400, "malformed_request", { note: "write the note" });
      } else return refuse(400, "malformed_request", { action: "not an incident act" });
      pvEvent("incident", row.id, action, detail, viewer.id);
      audit(`incident.${action}`, viewer.id, "incident", row.id, "", { reference: row.reference });
      return ok({ incident: pvIncidentView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/commitments",
    auth: true,
    capability: "privacy:read",
    handler: () => {
      const customers = pvActiveCustomers();
      const ids = [...new Set([...customers.keys(), ...commitmentsByCompany.keys()])].sort((a, b) =>
        companyName(a).toLowerCase().localeCompare(companyName(b).toLowerCase()),
      );
      const rows = ids.map((id) => ({
        company_name: companyName(id),
        customer: customers.has(id),
        ...pvCommitmentView(id, commitmentsByCompany.get(id)),
      }));
      return ok({
        commitments: rows,
        standard: PV_STANDARD,
        stats: {
          customers: customers.size,
          recorded: [...customers.keys()].filter((id) => commitmentsByCompany.has(id)).length,
          missing: [...customers.keys()].filter((id) => !commitmentsByCompany.has(id)).length,
          nonstandard: rows.filter((row) => row.flags.length).length,
          no_contact: rows.filter((row) => row.customer && !row.privacy_contact_email).length,
          dora: rows.filter((row) => row.dora_classification !== "none").length,
        },
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/companies/{company_id}/commitments",
    auth: true,
    capability: "privacy:read",
    handler: ({ params }) => {
      const companyId = String(params.company_id);
      if (!companies.some((row) => row.id === companyId)) return refuse(404, "not_found");
      return ok({
        commitments: pvCommitmentView(companyId, commitmentsByCompany.get(companyId)),
        standard: PV_STANDARD,
        requests: privacyRequests
          .filter((row) => row.company_id === companyId)
          .map((row) => pvRequestView(row)),
        notices: subprocessorNotices
          .filter((row) => row.company_id === companyId)
          .map((row) => ({
            subprocessor_id: row.subprocessor_id,
            legal_name:
              subprocessors.find((sub) => sub.id === row.subprocessor_id)?.legal_name ?? "",
            sent_on: row.sent_on,
            objection_deadline: row.objection_deadline,
            objected_on: row.objected_on,
            resolution: row.resolution,
          })),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/companies/{company_id}/commitments/update",
    auth: true,
    capability: "privacy:write",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const companyId = String(params.company_id);
      if (!companies.some((row) => row.id === companyId)) return refuse(404, "not_found");
      const contact = String(body.privacy_contact_email ?? "")
        .trim()
        .toLowerCase()
        .slice(0, 254);
      if (contact && (!contact.includes("@") || contact.includes(" ")))
        return refuse(400, "malformed_request", { privacy_contact_email: "an email address" });
      const audit_rights = String(body.audit_rights ?? "none");
      if (!PV_AUDIT.includes(audit_rights))
        return refuse(400, "malformed_request", { audit_rights: PV_AUDIT.join(", ") });
      const dora = String(body.dora_classification ?? "none");
      if (!PV_DORA.includes(dora))
        return refuse(400, "malformed_request", { dora_classification: PV_DORA.join(", ") });
      const whole = (name: string, low: number, high: number): number | null | "bad" => {
        const raw = String(body[name] ?? "").trim();
        if (!raw) return null;
        if (!/^\d+$/.test(raw) || Number(raw) < low || Number(raw) > high) return "bad";
        return Number(raw);
      };
      const hours = whole("incident_notice_hours", 1, 720);
      const notice = whole("subprocessor_notice_days", 0, 180);
      const window = whole("objection_window_days", 0, 180);
      const exit = whole("exit_assistance_days", 0, 730);
      for (const [name, value, low, high] of [
        ["incident_notice_hours", hours, 1, 720],
        ["subprocessor_notice_days", notice, 0, 180],
        ["objection_window_days", window, 0, 180],
        ["exit_assistance_days", exit, 0, 730],
      ] as const)
        if (value === "bad")
          return refuse(400, "malformed_request", {
            [name]: `a whole number from ${low} to ${high}`,
          });
      const reviewed = String(body.reviewed_on ?? "") || todayIso();
      const row: CommitmentRow = {
        company_id: companyId,
        contract_reference: String(body.contract_reference ?? "")
          .trim()
          .slice(0, 120),
        privacy_contact_email: contact,
        incident_notice_hours: hours as number | null,
        subprocessor_notice_days: notice as number | null,
        objection_window_days: window as number | null,
        audit_rights,
        data_locations: String(body.data_locations ?? "")
          .trim()
          .slice(0, 200),
        exit_assistance_days: exit as number | null,
        dora_classification: dora,
        material_outsourcing: Boolean(body.material_outsourcing),
        nonstandard_clauses: String(body.nonstandard_clauses ?? "")
          .trim()
          .slice(0, 2000),
        reviewed_on: reviewed,
        updated_by: viewer.id,
        updated_at: now(),
      };
      const before = commitmentsByCompany.get(companyId);
      commitmentsByCompany.set(companyId, row);
      audit("commitments.updated", viewer.id, "company", companyId, "", {
        changes: changesBetween(
          (before ?? {}) as Record<string, unknown>,
          row as unknown as Record<string, unknown>,
        ),
      });
      return ok({ commitments: pvCommitmentView(companyId, row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/subprocessors",
    auth: true,
    capability: "privacy:read",
    handler: () => {
      const order: Record<string, number> = { notice_sent: 0, proposed: 1, active: 2, retired: 3 };
      const views = subprocessors
        .map((row) => pvSubprocessorView(row))
        .sort(
          (a, b) =>
            (order[a.status] ?? 9) - (order[b.status] ?? 9) ||
            a.legal_name.toLowerCase().localeCompare(b.legal_name.toLowerCase()),
        );
      return ok({
        subprocessors: views,
        transfers: Object.entries(PV_TRANSFERS).map(([value, label]) => ({ value, label })),
        customers: pvActiveCustomers().size,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/subprocessors/create",
    auth: true,
    capability: "privacy:write",
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      const legal = String(body.legal_name ?? "")
        .trim()
        .slice(0, 200);
      if (!legal)
        return refuse(400, "malformed_request", { legal_name: "the company's legal name" });
      if (
        subprocessors.some(
          (row) => row.legal_name.toLowerCase() === legal.toLowerCase() && row.status !== "retired",
        )
      )
        return refuse(400, "malformed_request", { legal_name: "already on the register" });
      const mechanism = String(body.transfer_mechanism ?? "not_needed");
      if (!PV_TRANSFERS[mechanism])
        return refuse(400, "malformed_request", {
          transfer_mechanism: Object.keys(PV_TRANSFERS).join(", "),
        });
      const since = String(body.in_use_since ?? "");
      if (since && since > todayIso())
        return refuse(400, "malformed_request", { in_use_since: "cannot be in the future" });
      const row: SubprocessorRow = {
        id: randomUUID(),
        legal_name: legal,
        service: String(body.service ?? "")
          .trim()
          .slice(0, 200),
        purpose: String(body.purpose ?? "")
          .trim()
          .slice(0, 1000),
        data_categories: String(body.data_categories ?? "")
          .trim()
          .slice(0, 400),
        locations: String(body.locations ?? "")
          .trim()
          .slice(0, 200),
        transfer_mechanism: mechanism,
        dpa_signed_on: String(body.dpa_signed_on ?? "") || null,
        status: since ? "active" : "proposed",
        notice_sent_on: null,
        effective_on: null,
        activated_on: since || null,
        retired_on: null,
      };
      subprocessors.push(row);
      pvEvent(
        "subprocessor",
        row.id,
        "created",
        since
          ? `Recorded as in use since ${pvDay(since)}.`
          : "Proposed. Customers are told before it goes live.",
        viewer.id,
      );
      audit("subprocessor.created", viewer.id, "subprocessor", row.id, "", {
        legal_name: legal,
        status: row.status,
      });
      return ok({ subprocessor: pvSubprocessorView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/subprocessors/{subprocessor_id}",
    auth: true,
    capability: "privacy:read",
    handler: ({ params }) => {
      const row = subprocessors.find((item) => item.id === params.subprocessor_id);
      if (!row) return refuse(404, "not_found");
      const today = todayIso();
      const customers = pvActiveCustomers();
      const notices = subprocessorNotices.filter((item) => item.subprocessor_id === row.id);
      const noticed = new Set(notices.map((item) => item.company_id));
      const preview = addDaysIso(
        today,
        Math.max(
          ...[...customers.keys()].map((id) => pvNoticeDays(id)),
          PV_STANDARD.subprocessor_notice_days,
        ),
      );
      const draft = pvNoticeText(
        row,
        "{customer}",
        row.effective_on ?? preview,
        addDaysIso(today, 30),
      );
      return ok({
        subprocessor: pvSubprocessorView(row, today),
        notices: notices
          .map((item) => ({
            company_id: item.company_id,
            company_name: companyName(item.company_id),
            sent_to: item.sent_to,
            sent_on: item.sent_on,
            objection_deadline: item.objection_deadline,
            window_open: today <= item.objection_deadline,
            objected_on: item.objected_on,
            objection: item.objection,
            resolution: item.resolution,
            resolved_on: item.resolved_on,
          }))
          .sort((a, b) => a.company_name.toLowerCase().localeCompare(b.company_name.toLowerCase())),
        unnoticed: ["proposed", "notice_sent"].includes(row.status)
          ? [...customers.entries()]
              .filter(([id]) => !noticed.has(id))
              .sort(([, a], [, b]) => a.toLowerCase().localeCompare(b.toLowerCase()))
              .map(([id, name]) => ({
                company_id: id,
                company_name: name,
                contact: commitmentsByCompany.get(id)?.privacy_contact_email ?? "",
                notice_days: pvNoticeDays(id),
                objection_days: pvObjectionDays(id),
              }))
          : [],
        draft,
        mail_ready: MOCK_MAIL_READY,
        events: pvEvents("subprocessor", row.id),
        transfers: Object.entries(PV_TRANSFERS).map(([value, label]) => ({ value, label })),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/subprocessors/{subprocessor_id}/act",
    auth: true,
    capability: "privacy:write",
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = subprocessors.find((item) => item.id === params.subprocessor_id);
      if (!row) return refuse(404, "not_found");
      const action = String(body.action ?? "");
      const today = todayIso();
      if (row.status === "retired" && action !== "note")
        return refuse(400, "malformed_request", { status: "retired; add a note instead" });
      const customers = pvActiveCustomers();
      const text = (name: string, limit = 2000) =>
        String(body[name] ?? "")
          .trim()
          .slice(0, limit);
      let detail = "";
      const extra: Record<string, unknown> = {};
      if (action === "update") {
        for (const [name, limit] of [
          ["legal_name", 200],
          ["service", 200],
          ["purpose", 1000],
          ["data_categories", 400],
          ["locations", 200],
        ] as const)
          if (name in body) row[name] = text(name, limit);
        if ("transfer_mechanism" in body) {
          const mechanism = String(body.transfer_mechanism ?? "");
          if (!PV_TRANSFERS[mechanism])
            return refuse(400, "malformed_request", {
              transfer_mechanism: Object.keys(PV_TRANSFERS).join(", "),
            });
          row.transfer_mechanism = mechanism;
        }
        if ("dpa_signed_on" in body) row.dpa_signed_on = String(body.dpa_signed_on ?? "") || null;
        detail = "Updated.";
      } else if (action === "send_notices" || action === "record_notice") {
        if (!["proposed", "notice_sent"].includes(row.status))
          return refuse(400, "malformed_request", { status: "notices go before it is active" });
        const noticed = new Set(
          subprocessorNotices
            .filter((item) => item.subprocessor_id === row.id)
            .map((item) => item.company_id),
        );
        if (action === "send_notices") {
          if (!MOCK_MAIL_READY)
            return refuse(400, "malformed_request", {
              mail: "mail is not set up, so nothing can leave HQ; send it yourself and record it",
            });
          const sent: string[] = [];
          const missing: string[] = [];
          for (const [companyId, name] of [...customers.entries()].sort(([, a], [, b]) =>
            a.toLowerCase().localeCompare(b.toLowerCase()),
          )) {
            if (noticed.has(companyId)) continue;
            const contact = commitmentsByCompany.get(companyId)?.privacy_contact_email ?? "";
            if (!contact) {
              missing.push(name);
              continue;
            }
            subprocessorNotices.push({
              subprocessor_id: row.id,
              company_id: companyId,
              sent_to: contact,
              sent_on: today,
              objection_deadline: addDaysIso(today, pvObjectionDays(companyId)),
              objected_on: null,
              objection: "",
              resolution: "",
              resolved_on: null,
            });
            sent.push(name);
          }
          if (!sent.length)
            return refuse(400, "malformed_request", {
              customers:
                "nobody left to tell who has a privacy contact" +
                (missing.length ? `; missing: ${missing.join(", ")}` : ""),
            });
          detail = `Notice mailed to ${sent.length} customer(s).${missing.length ? ` Not sent — no privacy contact: ${missing.join(", ")}.` : ""}`;
          extra.sent = sent;
          extra.missing = missing;
        } else {
          const companyId = String(body.company_id ?? "");
          if (!customers.has(companyId))
            return refuse(400, "malformed_request", {
              company_id: "choose a customer with a contract in force",
            });
          if (noticed.has(companyId))
            return refuse(400, "malformed_request", { company_id: "already told" });
          const sentOn = String(body.sent_on ?? "") || today;
          if (sentOn > today)
            return refuse(400, "malformed_request", { sent_on: "cannot be in the future" });
          const sentTo = text("sent_to", 254);
          if (!sentTo)
            return refuse(400, "malformed_request", {
              sent_to: "where it went (an address, or how)",
            });
          subprocessorNotices.push({
            subprocessor_id: row.id,
            company_id: companyId,
            sent_to: sentTo,
            sent_on: sentOn,
            objection_deadline: addDaysIso(sentOn, pvObjectionDays(companyId)),
            objected_on: null,
            objection: "",
            resolution: "",
            resolved_on: null,
          });
          detail = `Notice to ${customers.get(companyId)} recorded as sent on ${pvDay(sentOn)} to ${sentTo}.`;
        }
        row.status = "notice_sent";
        row.notice_sent_on = row.notice_sent_on ?? today;
        row.effective_on = pvEffectiveOn(row.id);
      } else if (action === "objection" || action === "resolve") {
        const companyId = String(body.company_id ?? "");
        const notice = subprocessorNotices.find(
          (item) => item.subprocessor_id === row.id && item.company_id === companyId,
        );
        if (!notice)
          return refuse(400, "malformed_request", {
            company_id: "this customer was not sent a notice",
          });
        if (action === "objection") {
          const objection = text("objection");
          if (!objection)
            return refuse(400, "malformed_request", {
              objection: "what they object to, in their words",
            });
          const on = String(body.on ?? "") || today;
          notice.objected_on = on;
          notice.objection = objection;
          notice.resolution = "";
          notice.resolved_on = null;
          detail = `${companyName(companyId)} objected on ${pvDay(on)}${on > notice.objection_deadline ? " (after their window)" : ""}: ${objection}`;
        } else {
          const resolution = String(body.resolution ?? "");
          if (!PV_RESOLUTIONS.includes(resolution))
            return refuse(400, "malformed_request", { resolution: PV_RESOLUTIONS.join(", ") });
          if (!notice.objected_on)
            return refuse(400, "malformed_request", { company_id: "no objection to settle" });
          notice.resolution = resolution;
          notice.resolved_on = today;
          detail =
            `${companyName(companyId)}'s objection settled: ${resolution}. ${text("note", 400)}`.trim();
        }
      } else if (action === "activate") {
        const view = pvSubprocessorView(row, today);
        if (!(row.status === "proposed" && customers.size === 0) && !view.can_activate)
          return refuse(400, "malformed_request", {
            activate: view.blockers.join("; ") || "send the notices first",
          });
        row.status = "active";
        row.activated_on = today;
        detail = `Active from ${pvDay(today)}.`;
      } else if (action === "retire") {
        const reason = text("reason", 1000);
        if (!reason)
          return refuse(400, "malformed_request", {
            reason: "why it is no longer used, and what happened to the data",
          });
        const on = String(body.on ?? "") || today;
        row.status = "retired";
        row.retired_on = on;
        detail = `Retired on ${pvDay(on)}: ${reason}`;
      } else if (action === "note") {
        detail = text("note");
        if (!detail) return refuse(400, "malformed_request", { note: "write the note" });
      } else return refuse(400, "malformed_request", { action: "not a sub-processor act" });
      pvEvent("subprocessor", row.id, action, detail, viewer.id);
      audit(`subprocessor.${action}`, viewer.id, "subprocessor", row.id, "", {
        legal_name: row.legal_name,
      });
      return ok({ subprocessor: pvSubprocessorView(row, today), ...extra });
    },
  },
  {
    method: "POST",
    pattern: "hq/companies/{company_id}/billing/update",
    auth: true,
    capability: "revenue:write",
    handler: ({ headers, params, body }) => {
      const companyId = String(params.company_id);
      if (!companies.some((row) => row.id === companyId)) return refuse(404, "not_found");
      const current = billingProfiles.get(companyId);
      const text = (name: string, limit: number) =>
        String(body[name] ?? (current as Record<string, unknown> | undefined)?.[name] ?? "")
          .trim()
          .slice(0, limit);
      const treatment = text("tax_treatment", 20);
      if (treatment && !(treatment in RX_TREATMENTS))
        return refuse(400, "malformed_request", {
          tax_treatment: "choose how invoices to them are taxed",
        });
      const terms = Number(body.payment_terms_days ?? current?.payment_terms_days ?? 30);
      if (!Number.isInteger(terms) || terms < 0 || terms > 120)
        return refuse(400, "malformed_request", { payment_terms_days: "between 0 and 120 days" });
      const emails = text("ap_emails", 400)
        .replace(/;/g, ",")
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean);
      if (emails.some((part) => !part.includes("@") || part.includes(" ")))
        return refuse(400, "malformed_request", { ap_emails: "addresses separated by commas" });
      const rate = String(body.withholding_rate_percent ?? "");
      const poAmount = String(body.po_amount ?? "");
      billingProfiles.set(companyId, {
        company_id: companyId,
        legal_name: text("legal_name", 200),
        billing_address: text("billing_address", 400),
        country: text("country", 60),
        state_code: text("state_code", 8),
        tax_id: text("tax_id", 40),
        tax_treatment: treatment,
        ap_emails: emails.join(", "),
        po_required: Boolean(body.po_required),
        po_number: text("po_number", 60),
        po_amount_cents: poAmount ? cents(poAmount) : null,
        po_expires_on: String(body.po_expires_on ?? "") || null,
        portal_instructions: text("portal_instructions", 400),
        payment_terms_days: terms,
        invoice_currency: String(
          body.invoice_currency ?? current?.invoice_currency ?? "USD",
        ).toUpperCase(),
        withholds_tax: Boolean(body.withholds_tax),
        withholding_rate_bp: rate ? Math.round(Number(rate) * 100) : null,
        updated_at: now(),
      });
      audit("billing.profile_updated", caller(headers)!.member.id, "company", companyId);
      return ok({ profile: profileViewRx(companyId) });
    },
  },
  {
    method: "GET",
    pattern: "hq/inbox",
    auth: true,
    handler: ({ headers, query }) => {
      const viewer = caller(headers)!.member;
      inboxFireReminders(viewer.id);
      const view = query.view || "inbox";
      if (!["inbox", "snoozed", "done"].includes(view))
        return refuse(400, "malformed_request", { view: "inbox, snoozed or done" });
      const mine = notifications
        .filter((row) => row.recipient_id === viewer.id)
        .sort((a, b) => b.last_at.localeCompare(a.last_at));
      const views = mine.map(notificationView);
      const wanted: Record<string, string[]> = {
        inbox: ["unread", "read"],
        snoozed: ["snoozed"],
        done: ["done"],
      };
      let items = views.filter(
        (item) =>
          wanted[view]!.includes(item.state) && (!query.reason || item.reason === query.reason),
      );
      if (view === "done") items = items.slice(0, 100);
      return ok({
        items,
        counts: {
          unread: views.filter((item) => item.state === "unread").length,
          inbox: views.filter((item) => item.state === "unread" || item.state === "read").length,
          snoozed: views.filter((item) => item.state === "snoozed").length,
        },
        reminders: inboxReminders
          .filter((row) => row.staff_id === viewer.id && !row.fired_at && !row.cancelled_at)
          .sort((a, b) => a.remind_at.localeCompare(b.remind_at))
          .map((row) => ({
            reminder_id: row.id,
            subject_type: row.subject_type,
            subject_id: row.subject_id,
            subject_label: row.subject_label,
            link_path: row.link_path,
            note: row.note,
            remind_at: row.remind_at,
          })),
        reasons: Object.entries(INBOX_REASONS).map(([reason, [, label]]) => ({ reason, label })),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/inbox/bulk",
    auth: true,
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      const action = String(body.action ?? "");
      if (action !== "read_all" && action !== "clear_read")
        return refuse(400, "malformed_request", { action: "read_all or clear_read" });
      let changed = 0;
      for (const row of notifications) {
        if (row.recipient_id !== viewer.id) continue;
        const state = inboxState(row);
        if (action === "read_all" && state === "unread") {
          row.read_at = now();
          changed += 1;
        } else if (action === "clear_read" && state === "read") {
          row.done_at = now();
          changed += 1;
        }
      }
      audit(`inbox.${action}`, viewer.id, "notification", "bulk", "", { changed });
      return ok({ changed });
    },
  },
  {
    method: "POST",
    pattern: "hq/inbox/{notification_id}/update",
    auth: true,
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = notifications.find(
        (candidate) =>
          candidate.id === params.notification_id && candidate.recipient_id === viewer.id,
      );
      if (!row) return refuse(404, "not_found");
      const action = String(body.action ?? "");
      if (action === "read") row.read_at = now();
      else if (action === "unread") row.read_at = null;
      else if (action === "done") {
        row.done_at = now();
        row.read_at = row.read_at ?? now();
      } else if (action === "undone") {
        if (!row.done_at) return refuse(400, "malformed_request", { state: "not done" });
        const newer = notifications.some(
          (candidate) =>
            candidate.recipient_id === viewer.id &&
            candidate.subject_type === row.subject_type &&
            candidate.subject_id === row.subject_id &&
            !candidate.done_at,
        );
        if (newer)
          return refuse(400, "malformed_request", {
            state: "a newer row for this is open; use that one",
          });
        row.done_at = null;
      } else if (action === "snooze") {
        const until = Date.parse(String(body.until ?? ""));
        if (!Number.isFinite(until) || until <= Date.now() || until - Date.now() > 60 * 86_400_000)
          return refuse(400, "malformed_request", { until: "a time in the next sixty days" });
        row.snoozed_until = new Date(until).toISOString();
      } else
        return refuse(400, "malformed_request", { action: "read, unread, done, undone, snooze" });
      if ((action === "read" || action === "done") && row.reason === "mention")
        for (const mention of mentions)
          if (
            mention.staff_id === viewer.id &&
            !mention.seen_at &&
            mention.entity_id === row.subject_id
          )
            mention.seen_at = now();
      audit(`inbox.${action}`, viewer.id, "notification", row.id);
      return ok({ item: notificationView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/subscriptions/{subject_type}/{subject}",
    auth: true,
    handler: ({ headers, params }) => {
      if (!(String(params.subject_type) in INBOX_PAGES)) return refuse(404, "not_found");
      const viewer = caller(headers)!.member;
      const row = inboxSubscriptions.get(
        subscriptionKey(viewer.id, String(params.subject_type), String(params.subject)),
      );
      return ok({
        following: Boolean(row) && !row!.muted,
        reason: row?.reason ?? "",
        muted: Boolean(row?.muted),
        followers: inboxFollowers(String(params.subject_type), String(params.subject)).length,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/subscriptions/{subject_type}/{subject}/set",
    auth: true,
    handler: ({ headers, params, body }) => {
      const subjectType = String(params.subject_type);
      if (!(subjectType in INBOX_PAGES)) return refuse(404, "not_found");
      const viewer = caller(headers)!.member;
      const follow = Boolean(body.follow);
      const key = subscriptionKey(viewer.id, subjectType, String(params.subject));
      const existing = inboxSubscriptions.get(key);
      inboxSubscriptions.set(key, {
        staff_id: viewer.id,
        subject_type: subjectType,
        subject_id: String(params.subject).toLowerCase(),
        reason: follow ? "manual" : (existing?.reason ?? "manual"),
        muted: !follow,
      });
      audit(
        follow ? "inbox.followed" : "inbox.unfollowed",
        viewer.id,
        subjectType,
        String(params.subject),
      );
      return ok({
        following: follow,
        followers: inboxFollowers(subjectType, String(params.subject)).length,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/reminders/create",
    auth: true,
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      const subjectType = String(body.subject_type ?? "");
      const subjectId = String(body.subject_id ?? "")
        .trim()
        .toLowerCase();
      if (!(subjectType in INBOX_PAGES) || !subjectId)
        return refuse(400, "malformed_request", { subject: "what to be reminded about" });
      const at = Date.parse(String(body.remind_at ?? ""));
      if (!Number.isFinite(at) || at <= Date.now() || at - Date.now() > 366 * 86_400_000)
        return refuse(400, "malformed_request", { remind_at: "a time in the next year" });
      let link = String(body.link_path ?? "").trim();
      if (!link.startsWith("/") || link.startsWith("//")) link = inboxLink(subjectType, subjectId);
      const row: ReminderRow = {
        id: randomUUID(),
        staff_id: viewer.id,
        subject_type: subjectType,
        subject_id: subjectId,
        subject_label: String(body.subject_label ?? "").slice(0, 200),
        link_path: link,
        note: String(body.note ?? "")
          .trim()
          .slice(0, 400),
        remind_at: new Date(at).toISOString(),
        fired_at: null,
        cancelled_at: null,
      };
      inboxReminders.push(row);
      audit("inbox.reminder_set", viewer.id, subjectType, subjectId);
      return ok({
        reminder: {
          reminder_id: row.id,
          subject_type: row.subject_type,
          subject_id: row.subject_id,
          subject_label: row.subject_label,
          link_path: row.link_path,
          note: row.note,
          remind_at: row.remind_at,
        },
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/reminders/{reminder_id}/cancel",
    auth: true,
    handler: ({ headers, params }) => {
      const viewer = caller(headers)!.member;
      const row = inboxReminders.find(
        (candidate) =>
          candidate.id === params.reminder_id &&
          candidate.staff_id === viewer.id &&
          !candidate.fired_at &&
          !candidate.cancelled_at,
      );
      if (!row) return refuse(404, "not_found");
      row.cancelled_at = now();
      audit("inbox.reminder_cancelled", viewer.id, row.subject_type, row.subject_id);
      return ok({ cancelled: true });
    },
  },
  {
    method: "GET",
    pattern: "hq/me/notifications",
    auth: true,
    handler: ({ headers }) => ok({ prefs: notificationPrefsFor(caller(headers)!.member.id) }),
  },
  {
    method: "POST",
    pattern: "hq/me/notifications/update",
    auth: true,
    handler: ({ headers, body }) => {
      const viewer = caller(headers)!.member;
      const current = notificationPrefsFor(viewer.id);
      const mode = String(body.email_mode ?? current.email_mode);
      if (!["unread", "digest", "off"].includes(mode))
        return refuse(400, "malformed_request", { email_mode: "unread, digest or off" });
      const delay = Number(body.delay_minutes ?? current.delay_minutes);
      if (!Number.isInteger(delay) || delay < 5 || delay > 240)
        return refuse(400, "malformed_request", { delay_minutes: "between 5 and 240" });
      const hour = (raw: unknown, fallback: number | null) => {
        if (raw === undefined) return fallback;
        if (raw === "" || raw === null) return null;
        const value = Number(raw);
        return Number.isInteger(value) && value >= 0 && value <= 23 ? value : NaN;
      };
      const quietFrom = hour(body.quiet_from, current.quiet_from);
      const quietTo = hour(body.quiet_to, current.quiet_to);
      if (Number.isNaN(quietFrom) || Number.isNaN(quietTo))
        return refuse(400, "malformed_request", { quiet_from: "an hour from 0 to 23" });
      if ((quietFrom === null) !== (quietTo === null))
        return refuse(400, "malformed_request", {
          quiet_to: "set both ends of the quiet hours, or neither",
        });
      const zone = String(body.time_zone ?? current.time_zone) || "UTC";
      try {
        new Intl.DateTimeFormat("en-GB", { timeZone: zone });
      } catch {
        return refuse(400, "malformed_request", { time_zone: "a zone such as Europe/London" });
      }
      notificationPrefs.set(viewer.id, {
        email_mode: mode,
        delay_minutes: delay,
        quiet_from: quietFrom,
        quiet_to: quietTo,
        time_zone: zone,
      });
      audit("inbox.prefs_updated", viewer.id, "staff", viewer.id);
      return ok({ prefs: notificationPrefsFor(viewer.id) });
    },
  },
  {
    method: "GET",
    pattern: "hq/me/devices",
    auth: true,
    handler: ({ headers }) => {
      const viewer = caller(headers)!.member;
      return ok({
        devices: staffDevices
          .filter((row) => row.staff_id === viewer.id)
          .sort((a, b) => b.last_seen_at.localeCompare(a.last_seen_at))
          .map((row) => ({
            device_id: row.id,
            device_hash: row.device_hash,
            label: row.label,
            first_seen_at: row.first_seen_at,
            last_seen_at: row.last_seen_at,
            last_ip: row.last_ip,
          })),
        events: securityEvents
          .filter((row) => row.subject_staff_id === viewer.id)
          .slice(0, 20)
          .map(securityEventView),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/me/devices/{device_id}/forget",
    auth: true,
    handler: ({ headers, params }) => {
      const viewer = caller(headers)!.member;
      const index = staffDevices.findIndex(
        (row) => row.id === params.device_id && row.staff_id === viewer.id,
      );
      if (index < 0) return refuse(404, "not_found");
      const [row] = staffDevices.splice(index, 1);
      audit("auth.device_forgotten", viewer.id, "staff", viewer.id, "", {
        device_id: row!.id,
        label: row!.label,
      });
      recordSecurityEvent(
        "device.forgotten",
        viewer.id,
        `${row!.label || "A device"} was forgotten; its next sign-in will count as new.`,
      );
      return ok({ forgotten: true });
    },
  },
  {
    method: "POST",
    pattern: "hq/auth/report",
    handler: ({ body }) => {
      const found = reportTokens.get(String(body.token ?? ""));
      if (!found) return refuse(401, "unauthenticated");
      const member = staff.find((row) => row.id === found.staffId);
      if (!member) return refuse(401, "unauthenticated");
      const event = securityEvents.find((row) => row.id === found.eventId);
      if (event?.reported_at) return ok({ locked: true, already: true });
      let revoked = 0;
      for (const session of sessions.values()) {
        if (session.staffId === member.id && !session.revoked_at) {
          session.revoked_at = now();
          revoked += 1;
        }
      }
      enrolTickets.delete(member.id);
      if (event) event.reported_at = now();
      recordSecurityEvent(
        "account.reported",
        member.id,
        `${member.display_name || member.email} said this wasn't them: ${event?.summary ?? "a security mail"}`,
        { detail: { about_event: found.eventId, sessions_revoked: revoked } },
      );
      audit("auth.reported", member.id, "staff", member.id, "", {
        about_event: found.eventId,
        sessions_revoked: revoked,
      });
      return ok({ locked: true, already: false });
    },
  },
  {
    method: "GET",
    pattern: "hq/approvals",
    auth: true,
    capability: "hq:admin",
    handler: ({ headers }) => {
      const viewer = caller(headers)!.member;
      expireStaleApprovals();
      const since = Date.now() - 30 * 86_400_000;
      const views = approvals
        .filter((row) => Date.parse(row.requested_at) >= since)
        .map((row) => approvalView(row, viewer));
      const pending = views.filter((view) => view.status === "pending");
      const decided = views.filter((view) => view.status !== "pending");
      return ok({
        approvals: [...pending, ...decided],
        pending: pending.length,
        awaiting_me: pending.filter((view) => view.can_decide).length,
        to_collect: views.filter((view) => view.can_collect).length,
        ttl_hours: APPROVAL_TTL_HOURS,
        approver_roles: {
          role_grant: ["owner"],
          api_key: ["owner", "admin"],
          factor_reset: ["owner"],
          write_off: ["owner", "admin"],
        },
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/approvals/{approval_id}/approve",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = approvals.find((candidate) => candidate.id === params.approval_id);
      if (!row) return refuse(404, "not_found");
      const status = approvalStatus(row);
      if (status !== "pending")
        return refuse(400, "malformed_request", { status: `already ${status}` });
      if (row.requested_by === viewer.id)
        return refuse(403, "forbidden", { reason: "own-request" });
      if (row.target_staff_id === viewer.id)
        return refuse(403, "forbidden", { reason: "own-subject" });
      if (!approverRoles(row.kind).includes(viewer.role))
        return refuse(403, "forbidden", { required_role: approverRoles(row.kind).join(" or ") });
      const note = String(body.note ?? "")
        .trim()
        .slice(0, 400);
      let executed: Record<string, unknown> = {};
      if (row.kind === "role_grant") {
        const payload = row.payload;
        if (payload.email) {
          const member: Staff = {
            id: randomUUID(),
            email: String(payload.email),
            display_name: String(payload.display_name ?? ""),
            role: String(payload.role) as Staff["role"],
            kind: String(payload.kind || "employee"),
            is_active: false,
            password_set: false,
            enrolled: false,
            last_login_at: null,
            created_at: now(),
            ends_on: String(payload.ends_on ?? "") || null,
            starts_on: String(payload.starts_on ?? "") || null,
            personal_email: String(payload.personal_email ?? ""),
          };
          staff.push(member);
          invites.set(`hqi_mock_${randomUUID().replace(/-/g, "")}`, { staffId: member.id });
          audit("staff.invited", viewer.id, "staff", member.id, "", {
            role: member.role,
            kind: member.kind,
            approval_id: row.id,
            requested_by: row.requested_by,
          });
          executed = { staff_id: member.id, emailed: false };
        } else {
          const target = staff.find((candidate) => candidate.id === row.target_staff_id);
          if (!target) return refuse(404, "not_found");
          const from = target.role;
          target.role = String(payload.role) as Staff["role"];
          let revoked = 0;
          for (const session of sessions.values()) {
            if (session.staffId === target.id && !session.revoked_at) {
              session.revoked_at = now();
              revoked += 1;
            }
          }
          audit("staff.role_changed", viewer.id, "staff", target.id, row.reason, {
            role: { from, to: target.role },
            sessions_revoked: revoked,
            approval_id: row.id,
            requested_by: row.requested_by,
          });
          executed = { staff_id: target.id, role: target.role, sessions_revoked: revoked };
        }
        row.status = "done";
        row.result_id = String(executed.staff_id ?? "");
      } else if (row.kind === "write_off") {
        const invoice = invoicesRx.find((candidate) => candidate.id === row.payload.invoice_id);
        if (!invoice) return refuse(404, "not_found");
        if (!["open", "partially_paid"].includes(rxStatus(invoice)))
          return refuse(400, "malformed_request", {
            status: `the invoice is ${rxStatus(invoice)} now`,
          });
        invoice.status = "uncollectible";
        invoice.collection_state = "written_off";
        rxEvent(
          invoice.id,
          "written_off",
          `Written off: ${row.reason}. UK VAT bad-debt relief can be claimed from ${rxReliefFrom(invoice)}.`,
          viewer.id,
        );
        audit("invoice.written_off", viewer.id, "invoice", invoice.id, row.reason, {
          dual_control: { approval_id: row.id, requested_by: row.requested_by },
        });
        executed = { written_off: true };
        row.status = "done";
        row.result_id = invoice.id;
      } else {
        row.status = "approved";
        row.expires_at = hoursFromNowIso(APPROVAL_TTL_HOURS);
      }
      row.decided_by = viewer.id;
      row.decided_at = now();
      row.decision_note = note;
      inboxNotify({
        recipients: [row.requested_by],
        subject_type: "approval",
        subject_id: row.id,
        subject_label: `${approvalSummary(row.kind, row.payload).charAt(0).toUpperCase()}${approvalSummary(row.kind, row.payload).slice(1)}`,
        reason: "state",
        summary: `${viewer.display_name || viewer.email} approved your request to ${approvalSummary(row.kind, row.payload)}.${note ? ` Note: ${note}` : ""}`,
        actor_id: viewer.id,
      });
      audit("approval.approved", viewer.id, "approval", row.id, note, {
        kind: row.kind,
        summary: approvalSummary(row.kind, row.payload),
        requested_by: row.requested_by,
        executed: Object.keys(executed).length > 0,
      });
      return ok({ approval: approvalView(row, viewer), executed });
    },
  },
  {
    method: "POST",
    pattern: "hq/approvals/{approval_id}/decline",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, params, body }) => {
      const viewer = caller(headers)!.member;
      const row = approvals.find((candidate) => candidate.id === params.approval_id);
      if (!row) return refuse(404, "not_found");
      const status = approvalStatus(row);
      if (status !== "pending")
        return refuse(400, "malformed_request", { status: `already ${status}` });
      if (row.requested_by === viewer.id)
        return refuse(403, "forbidden", { reason: "own-request" });
      if (row.target_staff_id === viewer.id)
        return refuse(403, "forbidden", { reason: "own-subject" });
      if (!approverRoles(row.kind).includes(viewer.role))
        return refuse(403, "forbidden", { required_role: approverRoles(row.kind).join(" or ") });
      row.status = "declined";
      row.decided_by = viewer.id;
      row.decided_at = now();
      row.decision_note = String(body.note ?? "")
        .trim()
        .slice(0, 400);
      inboxNotify({
        recipients: [row.requested_by],
        subject_type: "approval",
        subject_id: row.id,
        subject_label: `${approvalSummary(row.kind, row.payload).charAt(0).toUpperCase()}${approvalSummary(row.kind, row.payload).slice(1)}`,
        reason: "state",
        summary: `${viewer.display_name || viewer.email} declined your request to ${approvalSummary(row.kind, row.payload)}.${row.decision_note ? ` Note: ${row.decision_note}` : ""}`,
        actor_id: viewer.id,
      });
      audit("approval.declined", viewer.id, "approval", row.id, row.decision_note, {
        kind: row.kind,
        summary: approvalSummary(row.kind, row.payload),
        requested_by: row.requested_by,
      });
      return ok({ approval: approvalView(row, viewer) });
    },
  },
  {
    method: "POST",
    pattern: "hq/approvals/{approval_id}/withdraw",
    auth: true,
    capability: "hq:admin",
    handler: ({ headers, params }) => {
      const viewer = caller(headers)!.member;
      const row = approvals.find((candidate) => candidate.id === params.approval_id);
      if (!row) return refuse(404, "not_found");
      if (row.requested_by !== viewer.id) return refuse(403, "forbidden", { reason: "not-yours" });
      const status = approvalStatus(row);
      if (!["pending", "approved"].includes(status))
        return refuse(400, "malformed_request", { status: `already ${status}` });
      row.status = "withdrawn";
      row.decided_at = now();
      audit("approval.withdrawn", viewer.id, "approval", row.id, "", {
        kind: row.kind,
        summary: approvalSummary(row.kind, row.payload),
        was: status,
      });
      return ok({ approval: approvalView(row, viewer) });
    },
  },
  {
    method: "POST",
    pattern: "hq/approvals/{approval_id}/collect",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, params }) => {
      const viewer = caller(headers)!.member;
      const row = approvals.find((candidate) => candidate.id === params.approval_id);
      if (!row) return refuse(404, "not_found");
      if (row.requested_by !== viewer.id) return refuse(403, "forbidden", { reason: "not-yours" });
      if (row.kind !== "api_key" && row.kind !== "factor_reset")
        return refuse(400, "malformed_request", {
          kind: "only an intake key or an authenticator reset is collected",
        });
      const status = approvalStatus(row);
      if (status !== "approved")
        return refuse(400, "malformed_request", { status: `${status}, not approved` });
      if (row.kind === "factor_reset") {
        const target = staff.find((candidate) => candidate.id === row.target_staff_id);
        if (!target) return refuse(404, "not_found");
        const done = performFactorReset(viewer, target, row.reason, row);
        row.status = "done";
        row.result_id = target.id;
        audit("approval.collected", viewer.id, "approval", row.id, "", {
          kind: "factor_reset",
          target_staff_id: target.id,
          approved_by: row.decided_by,
        });
        return ok({ ...done, approval: approvalView(row, viewer) });
      }
      const minted = mintKeyRow(
        String(row.payload.name ?? ""),
        Number(row.payload.expires_in_days ?? KEY_LIFETIME_DAYS),
        viewer.id,
      );
      row.status = "done";
      row.result_id = minted.row.key_id;
      audit("api_key.minted", viewer.id, "api_key", minted.row.key_id, row.reason, {
        name: minted.row.name,
        expires_in_days: Number(row.payload.expires_in_days ?? KEY_LIFETIME_DAYS),
        approval_id: row.id,
        approved_by: row.decided_by,
      });
      audit("approval.collected", viewer.id, "approval", row.id, "", {
        kind: "api_key",
        key_id: minted.row.key_id,
        approved_by: row.decided_by,
      });
      return ok({
        key: keyView(minted.row),
        secret: minted.secret,
        approval: approvalView(row, viewer),
      });
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
      const requester = caller(headers)!;
      if (approvers("api_key", requester.member.id).length)
        return ok({
          pending_approval: true,
          approval: requestApproval(
            "api_key",
            requester.member,
            { name, scopes: ["leads:create"], expires_in_days: lifetime },
            reason,
          ),
        });
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
      if (springDecoy(null, "api_key", live.key_id, "used", clientAddress(headers)))
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
      for (const attendee of matched)
        if (attendee.person_id)
          mailCrmEvent("meeting", { person_id: attendee.person_id, company_id: row.company_id });
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
  /** Mirrors 0035: the notice period in days (null: none written) and the playbook. */
  notice_days?: number | null;
  playbook_started_at?: string | null;
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
    notice_days: row.notice_days ?? null,
    notice_date: csNoticeDate(row),
    playbook_started_at: row.playbook_started_at ?? null,
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
      if ("notice_days" in body) {
        const raw = String(body.notice_days ?? "").trim();
        if (raw && (!/^\d+$/.test(raw) || Number(raw) > 365))
          return refuse(400, "malformed_request", {
            notice_days: "days before the renewal date, 0 to 365",
          });
        row.notice_days = raw ? Number(raw) : null;
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
      const decoyType = ({ companies: "company", people: "person" } as Record<string, string>)[
        String(params.kind)
      ];
      if (decoyType) {
        const exporter = caller(headers)!.member;
        for (const row of rows)
          springDecoy(exporter, decoyType, String(row[0]), "exported", clientAddress(headers));
      }
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
// =====================================================================================
// Outbound mail — mirrors account_api/hq/mail_*.py
// =====================================================================================

// --- outbound mail --------------------------------------------------------------------------
// Mirrors account_api/hq/mail_*.py: the same eligibility rules and reason codes, the same
// campaign states and approval rule, the same sequence refusals and exits. What the mock
// does NOT model: recipients' working-hour windows (it sends at once, so screens do not
// depend on the hour the harness runs), the per-domain cap, and provider retries.

const ADMIN_STAFF_ID = "aa000000-0000-4000-8000-00000000000b";
const MAIL_TOPICS: Record<string, string> = {
  updates: "Product updates",
  news: "Announcements",
  events: "Events",
  sales: "Sales",
};
const MAIL_MARKETING_TOPICS = ["updates", "news", "events"];
const MAIL_KNOWN_VARS = [
  "first_name",
  "last_name",
  "full_name",
  "email",
  "company",
  "title",
  "country",
  "sender_name",
  "sender_email",
  "owner_name",
  "unsubscribe_url",
  "preferences_url",
];
const MAIL_ROLE_LOCALS = new Set([
  "info",
  "sales",
  "admin",
  "administrator",
  "support",
  "help",
  "noreply",
  "no-reply",
  "postmaster",
  "abuse",
  "webmaster",
  "contact",
  "office",
  "hello",
  "team",
  "billing",
  "accounts",
  "hr",
  "jobs",
  "careers",
  "press",
  "marketing",
  "security",
  "privacy",
]);
const MAIL_EXPLICIT_CONSENT = new Set([
  "de",
  "germany",
  "deutschland",
  "at",
  "austria",
  "österreich",
]);
const MAIL_SENT_LIKE = [
  "sent",
  "delivered",
  "soft_bounced",
  "hard_bounced",
  "complained",
  "unsubscribed",
  "unknown",
];
const MAIL_CUSTOMER_LIFECYCLES = ["customer", "early_access"];
const MAIL_OUTCOMES: Record<string, string> = {
  replied_positive: "Replied, interested",
  not_now: "Not now",
  not_interested: "Not interested",
  wrong_person: "Wrong person",
  unsubscribe: "Asked us to stop",
  bounced: "Address bounced",
  meeting_booked: "Meeting booked",
  stop: "Stopped by hand",
  out_of_office: "Out of office until a date",
};
const MAIL_OUTCOME_REASONS: Record<string, string> = {
  replied_positive: "REPLIED",
  not_now: "NOT_NOW",
  not_interested: "NOT_INTERESTED",
  wrong_person: "WRONG_PERSON",
  unsubscribe: "UNSUBSCRIBED",
  bounced: "HARD_BOUNCE",
  meeting_booked: "MEETING_BOOKED",
  stop: "MANUAL",
};
const MAIL_PEOPLE_FIELDS: Record<string, string> = {
  lifecycle: "Lifecycle",
  firm_type: "Firm type",
  country: "Country",
  role_category: "Role",
  title: "Title",
  source: "Source",
  owner: "Owner",
  company: "Company",
  domain: "Web domain",
  do_not_contact: "Do not contact",
  marketing: "Marketing consent",
  last_emailed_days: "Days since last email",
  customer_days: "Days as a customer",
};
const MAIL_LEAD_FIELDS: Record<string, string> = {
  stage: "Stage",
  source: "Source",
  owner: "Owner",
  company: "Company",
  email: "Email",
  created_days: "Days since received",
  last_emailed_days: "Days since last email",
};
const MAIL_OPS = ["is", "not", "has", "gt", "lt", "empty", "set"];
const MAIL_TOKEN = /\{\{\s*([a-z][a-z0-9_]*(?:\.[a-z0-9_]+)?)\s*(?:\|\s*([^}]*?)\s*)?\}\}/g;
/** mail_templates.CUSTOM_PREFIX: a list's own columns, {{custom.fund_size}}. */
const MAIL_CUSTOM = "custom.";

type MailSenderRow = {
  id: string;
  from_email: string;
  from_name: string;
  reply_to: string;
  kind: "marketing" | "sales";
  staff_id: string;
  daily_cap: number;
  verified: boolean;
  verified_source: "manual" | "provider";
  verified_checked_at: string | null;
  verification_detail: string;
  active: boolean;
  paused_at: string | null;
  paused_reason: string;
  created_at: string;
};
type MailTemplateRow = {
  id: string;
  name: string;
  kind: "campaign" | "sequence";
  current_version: number;
  created_by: string;
  created_at: string;
  archived_at: string | null;
};
type MailVersionRow = {
  template_id: string;
  version: number;
  subject: string;
  body_html: string;
  body_text: string;
  required_vars: string[];
  content_hash: string;
  created_by: string;
  created_at: string;
};
type MailSegmentRow = {
  id: string;
  name: string;
  kind: "people" | "leads";
  conditions: string[];
  last_count: number | null;
  last_evaluated_at: string | null;
  created_by: string;
  created_at: string;
  archived_at: string | null;
};
type MailConsentRow = {
  email_norm: string;
  marketing_state: "unknown" | "subscribed" | "unsubscribed";
  topics_off: string[];
  sales_stop: boolean;
  lawful_basis: string;
  source: string;
  timezone: string;
  updated_at: string;
};
type MailSuppressionRow = {
  id: string;
  email_norm: string;
  scope: string;
  scope_key: string;
  reason: string;
  source: string;
  detail: string;
  created_at: string;
  created_by: string;
  released_at: string | null;
  released_by: string;
  release_note: string;
};
type MailCounts = {
  recipients: number;
  skipped: number;
  sent: number;
  delivered: number;
  hard_bounced: number;
  soft_bounced: number;
  complained: number;
  unsubscribed: number;
  clicked: number;
  failed: number;
};
type MailCampaignRow = {
  id: string;
  name: string;
  sender_id: string;
  template_id: string;
  template_version: number;
  topic: string;
  audience: Record<string, unknown>;
  state: string;
  scheduled_at: string | null;
  send_anytime: boolean;
  dry_run: boolean;
  requires_approval: boolean;
  approved_by: string;
  approved_at: string | null;
  pause_reason: string;
  paused_at: string | null;
  counts: MailCounts;
  started_at: string | null;
  completed_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type MailMessageRow = {
  id: string;
  kind: "campaign" | "sequence" | "test";
  campaign_id: string;
  enrolment_id: string;
  step_no: number | null;
  sender_id: string;
  topic: string;
  contact_kind: string;
  contact_id: string;
  company_id: string;
  email: string;
  email_norm: string;
  variables: Record<string, string>;
  template_id: string;
  template_version: number;
  state: string;
  scheduled_at: string;
  sent_at: string | null;
  delivered_at: string | null;
  first_clicked_at: string | null;
  first_opened_at: string | null;
  bounced_at: string | null;
  complained_at: string | null;
  unsubscribed_at: string | null;
  provider_message_id: string;
  provider_status: string;
  subject: string;
  in_reply_to: string;
  skip_reason: string;
  last_error: string;
  attempts: number;
  is_seed: boolean;
};
type MailSequenceRow = {
  id: string;
  name: string;
  kind: "prospect" | "customer";
  sender_id: string;
  state: "draft" | "active" | "paused" | "archived";
  cooling_days: number;
  recent_contact_days: number;
  company_limit: number;
  created_by: string;
  created_at: string;
  updated_at: string;
};
type MailStepRow = {
  step_no: number;
  kind: "email" | "task";
  delay_days: number;
  template_id: string;
  template_version: number | null;
  thread: "new" | "reply";
  task_title: string;
};
type MailEnrolmentRow = {
  id: string;
  sequence_id: string;
  contact_kind: "person" | "lead";
  contact_id: string;
  company_id: string;
  email_norm: string;
  owner_staff_id: string;
  sender_id: string;
  state: "active" | "paused" | "completed" | "exited";
  current_step: number;
  waiting_task_id: string;
  exit_reason: string;
  outcome: string;
  paused_until: string | null;
  pause_reason: string;
  thread_subject: string;
  thread_message_id: string;
  enrolled_at: string;
  enrolled_by: string;
  last_sent_at: string | null;
  exited_at: string | null;
};
type MailEventRow = {
  message_id: string;
  event_type: string;
  occurred_at: string;
  reason: string;
  link: string;
};
type MailRecipient = {
  contact_kind: string;
  contact_id: string;
  company_id: string;
  email: string;
  full_name: string;
  title: string;
  company_name: string;
  country: string;
  lifecycle: string;
  do_not_contact: boolean;
  owner_staff_id: string;
  source: string;
  stage: string;
  created_at: string | null;
  domain: string;
  role_category: string;
  firm_type: string;
  customer_since: string | null;
  custom?: Record<string, string>;
};
type MailVerdict = { allowed: boolean; reason: string; detail: string };

const mailSenders: MailSenderRow[] = [];
const mailTemplates: MailTemplateRow[] = [];
const mailVersions: MailVersionRow[] = [];
const mailSegments: MailSegmentRow[] = [];
const mailConsent = new Map<string, MailConsentRow>();
const mailSuppressions: MailSuppressionRow[] = [];
const mailCampaigns: MailCampaignRow[] = [];
const mailMessages: MailMessageRow[] = [];
const mailSequences: MailSequenceRow[] = [];
const mailSteps = new Map<string, MailStepRow[]>();
const mailEnrolments: MailEnrolmentRow[] = [];
const mailEvents: MailEventRow[] = [];
const MAIL_SETTINGS_SEED = {
  sending_enabled: true,
  global_daily_cap: 100,
  hourly_cap: 30,
  frequency_cap_per_week: 2,
  approval_threshold: 50,
  bounce_pause_pct: 2.0,
  complaint_pause_pct: 0.1,
  window_start: "09:00",
  window_end: "17:30",
  fallback_timezone: "UTC",
  postal_address: "Quantify Terminal · London, United Kingdom",
  seed_addresses: ["seed@quantifyterminal.com"],
  webhook_configured: true,
  paused_reason: "",
  last_worker_at: "" as string,
};
const mailSettings = {
  ...MAIL_SETTINGS_SEED,
  seed_addresses: [...MAIL_SETTINGS_SEED.seed_addresses],
};
let mailProviderCounter = 1000;

function mailNorm(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
function mailValidEmail(email: string): boolean {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) && email.length <= 254;
}
function mailMask(email: string): string {
  const [local = "", domain = ""] = mailNorm(email).split("@");
  if (!domain) return "";
  return `${local.length > 1 ? `${local[0]}…` : "…"}@${domain}`;
}
function mailFirstName(full: string): string {
  return full.trim().split(/\s+/)[0] ?? "";
}
function mailLastName(full: string): string {
  const parts = full.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(" ") : "";
}
function mailHoursAgo(hours: number): string {
  return new Date(Date.now() - hours * 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z");
}
function mailStaffName(staffId: string): string {
  const member = staff.find((row) => row.id === staffId);
  return member ? member.display_name || member.email : "";
}
function mailPerson(staffId: string) {
  return staffId ? { staff_id: staffId, name: mailStaffName(staffId) } : null;
}
function mailEmptyCounts(): MailCounts {
  return {
    recipients: 0,
    skipped: 0,
    sent: 0,
    delivered: 0,
    hard_bounced: 0,
    soft_bounced: 0,
    complained: 0,
    unsubscribed: 0,
    clicked: 0,
    failed: 0,
  };
}

// -- rendering ----------------------------------------------------------------------------
function mailAnalyse(...parts: string[]): { required: string[]; unknown: string[] } {
  const required: string[] = [];
  const unknown: string[] = [];
  for (const part of parts) {
    for (const match of (part ?? "").matchAll(MAIL_TOKEN)) {
      const name = match[1]!;
      const known =
        MAIL_KNOWN_VARS.includes(name) ||
        (name.startsWith(MAIL_CUSTOM) && name.length > MAIL_CUSTOM.length);
      if (!known) {
        if (!unknown.includes(name)) unknown.push(name);
        continue;
      }
      if (
        match[2] === undefined &&
        !required.includes(name) &&
        name !== "unsubscribe_url" &&
        name !== "preferences_url"
      )
        required.push(name);
    }
  }
  return { required, unknown };
}
function mailEscape(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
function mailRender(
  template: string,
  vars: Record<string, string>,
  asHtml: boolean,
): { text: string } | { missing: string } {
  let missing = "";
  const text = (template ?? "").replace(
    MAIL_TOKEN,
    (_whole, name: string, fallback: string | undefined) => {
      let value = String(vars[name] ?? "").trim();
      if (!value) {
        if (fallback === undefined) {
          missing = missing || name;
          return "";
        }
        value = fallback.trim().replace(/^["']|["']$/g, "");
      }
      return asHtml && name !== "unsubscribe_url" && name !== "preferences_url"
        ? mailEscape(value)
        : value;
    },
  );
  return missing ? { missing } : { text };
}
function mailHtmlToText(html: string): string {
  return html
    .replace(/<a\b[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, "$2 ($1)")
    .replace(/<\/(p|div|h[1-6]|li)>|<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .split("\n")
    .map((line) => line.trim())
    .filter((line, index, all) => line || (index > 0 && all[index - 1]))
    .join("\n")
    .trim();
}
function mailTextToHtml(text: string): string {
  return text
    .split(/\n\s*\n/)
    .filter((part) => part.trim())
    .map(
      (part) =>
        `<p style="margin:0 0 14px 0;">${mailEscape(part.trim()).replace(/\n/g, "<br>")}</p>`,
    )
    .join("");
}
function mailRenderMessage(
  version: MailVersionRow,
  vars: Record<string, string>,
  topic: string,
  messageId: string,
  threadSubject = "",
): { subject: string; html: string; text: string } | { missing: string } {
  const sales = topic === "sales";
  const unsubscribe = `${PORTAL_ORIGIN}/u/mock-${messageId}`;
  const full = {
    ...vars,
    unsubscribe_url: unsubscribe,
    preferences_url: `${unsubscribe}?choose=1`,
  };
  const subject = mailRender(version.subject, full, false);
  if ("missing" in subject) return subject;
  let bodyHtml: string;
  let bodyText: string;
  if (version.body_html) {
    const html = mailRender(version.body_html, full, true);
    if ("missing" in html) return html;
    bodyHtml = html.text;
    const text = version.body_text
      ? mailRender(version.body_text, full, false)
      : { text: mailHtmlToText(html.text) };
    if ("missing" in text) return text;
    bodyText = text.text;
  } else {
    const text = mailRender(version.body_text, full, false);
    if ("missing" in text) return text;
    bodyText = text.text;
    bodyHtml = mailTextToHtml(text.text);
  }
  const address = mailEscape(mailSettings.postal_address);
  const footerHtml = sales
    ? `<p style="margin:24px 0 0 0;font-size:12px;color:#6b6b6b;">${address}<br>Not the right person, or not interested? <a href="${unsubscribe}">Tell us once</a> and we will not write again.</p>`
    : `<p style="margin:24px 0 0 0;font-size:12px;color:#6b6b6b;">${address}<br><a href="${unsubscribe}">Unsubscribe</a> · <a href="${unsubscribe}?choose=1">Choose what you receive</a></p>`;
  const footerText = sales
    ? `\n--\n${mailSettings.postal_address}\nNot the right person, or not interested? Tell us once: ${unsubscribe}`
    : `\n--\n${mailSettings.postal_address}\nUnsubscribe: ${unsubscribe}\nChoose what you receive: ${unsubscribe}?choose=1`;
  const shownSubject = threadSubject
    ? threadSubject.toLowerCase().startsWith("re:")
      ? threadSubject
      : `Re: ${threadSubject}`
    : subject.text.replace(/[\r\n\t]+/g, " ").trim();
  const html = sales
    ? `<div style="font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.5;color:#111;padding:24px;">${bodyHtml}${footerHtml}</div>`
    : `<div style="background:#f4f4f4;padding:28px 0;"><div style="max-width:560px;margin:0 auto;background:#ffffff;padding:32px;font-family:-apple-system,Segoe UI,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#111;"><p style="margin:0 0 20px 0;font-weight:600;letter-spacing:0.02em;">Quantify Terminal</p>${bodyHtml}${footerHtml}</div></div>`;
  return { subject: shownSubject, html, text: `${bodyText}${footerText}`.trim() };
}

// -- recipients -----------------------------------------------------------------------------
function mailPersonRecipient(row: PersonRow): MailRecipient {
  const company = companies.find((candidate) => candidate.id === row.company_id);
  return {
    contact_kind: "person",
    contact_id: row.id,
    company_id: row.company_id,
    email: row.email,
    full_name: row.full_name,
    title: row.title,
    company_name: company?.name ?? "",
    country: company?.country ?? "",
    lifecycle: company?.lifecycle ?? "",
    do_not_contact: row.do_not_contact,
    owner_staff_id: company?.owner_staff_id ?? "",
    source: row.source_key,
    stage: "",
    created_at: row.created_at,
    domain: company?.domain ?? "",
    role_category: row.role_category,
    firm_type: company?.firm_type ?? "",
    customer_since: company?.customer_since ?? null,
  };
}
function mailLeadRecipient(row: LeadRow): MailRecipient {
  return {
    contact_kind: "lead",
    contact_id: row.id,
    company_id: row.converted_company_id,
    email: row.email,
    full_name: row.full_name,
    title: "",
    company_name: row.company_name,
    country: "",
    lifecycle: "",
    do_not_contact: false,
    owner_staff_id: row.owner_staff_id,
    source: row.source_key,
    stage: row.stage,
    created_at: row.created_at,
    domain: "",
    role_category: "",
    firm_type: "",
    customer_since: null,
  };
}
function mailPeopleRecipients(): MailRecipient[] {
  return people
    .filter(
      (row) =>
        !row.archived && !companies.find((company) => company.id === row.company_id)?.archived,
    )
    .map(mailPersonRecipient);
}
function mailLeadRecipients(): MailRecipient[] {
  return leads.filter((row) => row.email && !row.anonymised_at).map(mailLeadRecipient);
}
function mailVariables(recipient: MailRecipient): Record<string, string> {
  return {
    first_name: mailFirstName(recipient.full_name),
    last_name: mailLastName(recipient.full_name),
    full_name: recipient.full_name,
    email: recipient.email,
    company: recipient.company_name,
    title: recipient.title,
    country: recipient.country,
    ...Object.fromEntries(
      Object.entries(recipient.custom ?? {}).map(([key, value]) => [`${MAIL_CUSTOM}${key}`, value]),
    ),
  };
}

// -- verdicts -------------------------------------------------------------------------------
function mailSuppressionsFor(email: string, topic: string, senderId: string): MailSuppressionRow[] {
  const norm = mailNorm(email);
  return mailSuppressions.filter(
    (row) =>
      row.email_norm === norm &&
      !row.released_at &&
      (row.scope === "global" ||
        (row.scope === "topic" && row.scope_key === topic) ||
        (row.scope === "sender" && row.scope_key === senderId)),
  );
}
function mailAddressVerdict(email: string, topic: string, senderId: string): MailVerdict {
  const norm = mailNorm(email);
  if (!norm) return { allowed: false, reason: "NO_EMAIL", detail: "" };
  if (!mailValidEmail(norm)) return { allowed: false, reason: "INVALID_EMAIL", detail: "" };
  for (const row of mailSuppressionsFor(norm, topic, senderId)) {
    if (
      ["hard_bounce", "invalid_address", "provider_blocked", "soft_bounce_limit"].includes(
        row.reason,
      )
    )
      return { allowed: false, reason: "BOUNCED", detail: row.reason };
    if (row.reason === "complaint") return { allowed: false, reason: "COMPLAINED", detail: "" };
    if (row.reason === "unsubscribe") {
      if (row.scope === "topic" && row.scope_key === "sales")
        return { allowed: false, reason: "SALES_STOP", detail: "" };
      return { allowed: false, reason: "UNSUBSCRIBED", detail: row.scope };
    }
    if (row.reason === "manual")
      return { allowed: false, reason: "SUPPRESSED", detail: row.detail };
  }
  return { allowed: true, reason: "", detail: "" };
}
function mailRecentMarketing(norm: string): number {
  const since = Date.now() - 7 * 86_400_000;
  return mailMessages.filter(
    (row) =>
      row.kind === "campaign" &&
      row.email_norm === norm &&
      MAIL_SENT_LIKE.concat(["delivered"]).includes(row.state) &&
      Date.parse(row.sent_at ?? row.scheduled_at) >= since,
  ).length;
}
function mailMarketingVerdict(
  recipient: MailRecipient,
  topic: string,
  senderId: string,
): MailVerdict {
  if (recipient.do_not_contact) return { allowed: false, reason: "DO_NOT_CONTACT", detail: "" };
  const base = mailAddressVerdict(recipient.email, topic, senderId);
  if (!base.allowed) return base;
  const norm = mailNorm(recipient.email);
  if (MAIL_ROLE_LOCALS.has(norm.split("@")[0] ?? ""))
    return { allowed: false, reason: "ROLE_ADDRESS", detail: "" };
  const consent = mailConsent.get(norm);
  if (consent?.marketing_state === "unsubscribed")
    return { allowed: false, reason: "UNSUBSCRIBED", detail: "all marketing" };
  if (consent?.topics_off.includes(topic))
    return { allowed: false, reason: "TOPIC_OFF", detail: topic };
  const isCustomer = MAIL_CUSTOMER_LIFECYCLES.includes(recipient.lifecycle);
  if (
    consent?.marketing_state !== "subscribed" &&
    MAIL_EXPLICIT_CONSENT.has(recipient.country.trim().toLowerCase()) &&
    !isCustomer
  )
    return { allowed: false, reason: "NO_CONSENT", detail: "explicit consent required" };
  const recent = mailRecentMarketing(norm);
  if (mailSettings.frequency_cap_per_week && recent >= mailSettings.frequency_cap_per_week)
    return { allowed: false, reason: "FREQUENCY_CAP", detail: `${recent} in the last 7 days` };
  return { allowed: true, reason: "", detail: "" };
}
function mailSalesVerdict(recipient: MailRecipient, senderId: string): MailVerdict {
  if (recipient.do_not_contact) return { allowed: false, reason: "DO_NOT_CONTACT", detail: "" };
  const base = mailAddressVerdict(recipient.email, "sales", senderId);
  if (!base.allowed) return base;
  const norm = mailNorm(recipient.email);
  if (mailConsent.get(norm)?.sales_stop)
    return { allowed: false, reason: "SALES_STOP", detail: "" };
  if (MAIL_ROLE_LOCALS.has(norm.split("@")[0] ?? ""))
    return { allowed: false, reason: "ROLE_ADDRESS", detail: "" };
  return { allowed: true, reason: "", detail: "" };
}

// -- segments and audiences -----------------------------------------------------------------
function mailParseConditions(
  raw: unknown,
  kind: string,
): {
  conditions: Array<{ field: string; op: string; value: string }>;
  errors: Record<string, string>;
} {
  const fields = kind === "people" ? MAIL_PEOPLE_FIELDS : MAIL_LEAD_FIELDS;
  const conditions: Array<{ field: string; op: string; value: string }> = [];
  const errors: Record<string, string> = {};
  (Array.isArray(raw) ? raw : []).slice(0, 8).forEach((item, index) => {
    const [field = "", op = "", ...rest] = String(typeof item === "string" ? item : "").split(":");
    const value = rest.join(":").slice(0, 120);
    if (!(field in fields)) errors[`conditions[${index}]`] = `unknown field '${field}'`;
    else if (!MAIL_OPS.includes(op)) errors[`conditions[${index}]`] = `unknown comparison '${op}'`;
    else if (["is", "not", "has", "gt", "lt"].includes(op) && value === "")
      errors[`conditions[${index}]`] = "needs a value";
    else conditions.push({ field, op, value });
  });
  return { conditions, errors };
}
function mailLastEmailed(norm: string): number | null {
  const times = mailMessages
    .filter((row) => row.email_norm === norm && row.sent_at)
    .map((row) => Date.parse(row.sent_at!));
  return times.length ? Math.max(...times) : null;
}
function mailReadField(recipient: MailRecipient, field: string): string | number | null {
  const days = (iso: string | null) => (iso ? (Date.now() - Date.parse(iso)) / 86_400_000 : null);
  switch (field) {
    case "lifecycle":
      return recipient.lifecycle;
    case "firm_type":
      return recipient.firm_type;
    case "country":
      return recipient.country;
    case "role_category":
      return recipient.role_category;
    case "title":
      return recipient.title;
    case "source":
      return recipient.source;
    case "owner":
      return recipient.owner_staff_id ? mailStaffName(recipient.owner_staff_id) : "";
    case "company":
      return recipient.company_name;
    case "domain":
      return recipient.domain;
    case "do_not_contact":
      return recipient.do_not_contact ? "yes" : "no";
    case "marketing":
      return mailConsent.get(mailNorm(recipient.email))?.marketing_state ?? "unknown";
    case "stage":
      return recipient.stage;
    case "email":
      return recipient.email;
    case "created_days":
      return days(recipient.created_at);
    case "last_emailed_days": {
      const last = mailLastEmailed(mailNorm(recipient.email));
      return last === null ? null : (Date.now() - last) / 86_400_000;
    }
    case "customer_days":
      return days(recipient.customer_since);
    default:
      return null;
  }
}
function mailMatches(value: string | number | null, op: string, wanted: string): boolean {
  const text = value === null ? "" : String(value);
  if (op === "empty") return text === "";
  if (op === "set") return text !== "";
  if (op === "is") return text.toLowerCase() === wanted.toLowerCase();
  if (op === "not") return text.toLowerCase() !== wanted.toLowerCase();
  if (op === "has") return text.toLowerCase().includes(wanted.toLowerCase());
  const left = typeof value === "number" ? value : Number(text);
  const right = Number(wanted);
  if (Number.isNaN(left) || Number.isNaN(right) || text === "") return false;
  return op === "gt" ? left > right : left < right;
}
function mailEvaluateSegment(
  kind: string,
  conditions: Array<{ field: string; op: string; value: string }>,
): MailRecipient[] {
  const pool = kind === "people" ? mailPeopleRecipients() : mailLeadRecipients();
  return pool.filter((recipient) =>
    conditions.every((condition) =>
      mailMatches(mailReadField(recipient, condition.field), condition.op, condition.value),
    ),
  );
}
function mailResolveAudience(audience: Record<string, unknown>): MailRecipient[] {
  const kind = String(audience.kind ?? "");
  const ids = new Set(Array.isArray(audience.ids) ? audience.ids.map(String) : []);
  if (kind === "people") return mailPeopleRecipients().filter((row) => ids.has(row.contact_id));
  if (kind === "leads") return mailLeadRecipients().filter((row) => ids.has(row.contact_id));
  if (kind === "companies") return mailPeopleRecipients().filter((row) => ids.has(row.company_id));
  if (kind === "segment") {
    const segment = mailSegments.find((row) => row.id === String(audience.segment_id ?? ""));
    if (!segment) return [];
    return mailEvaluateSegment(
      segment.kind,
      mailParseConditions(segment.conditions, segment.kind).conditions,
    );
  }
  if (kind === "list") return mailListRecipients(String(audience.list_id ?? ""));
  if (kind === "csv") {
    return (Array.isArray(audience.rows) ? audience.rows : []).map((raw) => {
      const row = raw as Record<string, string>;
      const full = row.full_name || [row.first_name, row.last_name].filter(Boolean).join(" ");
      return {
        contact_kind: "csv",
        contact_id: "",
        company_id: "",
        email: String(row.email ?? "").trim(),
        full_name: full ?? "",
        title: row.title ?? "",
        company_name: row.company ?? "",
        country: row.country ?? "",
        lifecycle: "",
        do_not_contact: false,
        owner_staff_id: "",
        source: "",
        stage: "",
        created_at: null,
        domain: "",
        role_category: "",
        firm_type: "",
        customer_since: null,
      };
    });
  }
  return [];
}
function mailDescribeAudience(audience: Record<string, unknown>): string {
  const kind = String(audience.kind ?? "");
  const count = Array.isArray(audience.ids) ? audience.ids.length : 0;
  if (kind === "people") return `${count} chosen ${count === 1 ? "person" : "people"}`;
  if (kind === "leads") return `${count} chosen ${count === 1 ? "lead" : "leads"}`;
  if (kind === "companies") return `everyone at ${count} ${count === 1 ? "company" : "companies"}`;
  if (kind === "segment") {
    const segment = mailSegments.find((row) => row.id === String(audience.segment_id ?? ""));
    return segment ? `segment “${segment.name}”` : "a saved segment";
  }
  if (kind === "csv")
    return `${Array.isArray(audience.rows) ? audience.rows.length : 0} rows from ${String(audience.label ?? "") || "a CSV"}`;
  if (kind === "list") {
    const listRow = mailLists.find((row) => row.id === String(audience.list_id ?? ""));
    return listRow ? `list “${listRow.name}”` : "a mailing list";
  }
  return "nobody yet";
}
function mailDecide(
  recipients: MailRecipient[],
  topic: string,
  senderId: string,
  required: string[],
) {
  const seen = new Set<string>();
  return recipients.map((recipient) => {
    const norm = mailNorm(recipient.email);
    if (norm && seen.has(norm))
      return { recipient, verdict: { allowed: false, reason: "DUPLICATE", detail: "" } };
    if (norm) seen.add(norm);
    let verdict = mailMarketingVerdict(recipient, topic, senderId);
    if (verdict.allowed && required.length) {
      const vars = mailVariables(recipient);
      const missing = required.filter(
        (name) =>
          !["sender_name", "sender_email", "owner_name"].includes(name) &&
          !String(vars[name] ?? "").trim(),
      );
      if (missing.length)
        verdict = { allowed: false, reason: "MISSING_TOKEN", detail: missing.join(", ") };
    }
    return { recipient, verdict };
  });
}
function mailSummarise(decided: Array<{ recipient: MailRecipient; verdict: MailVerdict }>) {
  const byReason: Record<string, number> = {};
  for (const item of decided)
    if (!item.verdict.allowed)
      byReason[item.verdict.reason] = (byReason[item.verdict.reason] ?? 0) + 1;
  const eligible = decided.filter((item) => item.verdict.allowed);
  return {
    total: decided.length,
    eligible: eligible.length,
    skipped: decided.length - eligible.length,
    skipped_by_reason: Object.fromEntries(Object.entries(byReason).sort()),
    sample: eligible.slice(0, 8).map((item) => ({
      name: item.recipient.full_name,
      email: mailMask(item.recipient.email),
      company: item.recipient.company_name,
    })),
    skipped_sample: decided
      .filter((item) => !item.verdict.allowed)
      .slice(0, 12)
      .map((item) => ({
        name: item.recipient.full_name,
        email: mailMask(item.recipient.email),
        reason: item.verdict.reason,
        detail: item.verdict.detail,
      })),
    has_customers: eligible.some((item) =>
      MAIL_CUSTOMER_LIFECYCLES.includes(item.recipient.lifecycle),
    ),
  };
}

// -- views ------------------------------------------------------------------------------------
function mailSenderView(row: MailSenderRow) {
  return {
    sender_id: row.id,
    from_email: row.from_email,
    from_name: row.from_name,
    reply_to: row.reply_to,
    kind: row.kind,
    staff_id: row.staff_id || null,
    staff_name: mailStaffName(row.staff_id),
    daily_cap: row.daily_cap,
    verified: row.verified,
    verified_source: row.verified_source,
    verified_checked_at: row.verified_checked_at,
    verification_detail: row.verification_detail,
    active: row.active,
    paused_at: row.paused_at,
    paused_reason: row.paused_reason,
    created_at: row.created_at,
  };
}
/** What the mock's provider knows: the seeded addresses, and the company's two domains. */
const MAIL_PROVIDER_SENDERS = new Set([
  "news@mail.quantifyterminal.com",
  "owner@quantifyterminal.com",
  "sales@quantifyterminal.com",
]);
const MAIL_PROVIDER_DOMAINS: Record<string, boolean> = {
  "mail.quantifyterminal.com": true,
  "quantifyterminal.com": true,
};
/** mail_routes.sender_check_text, word for word. */
function mailSenderCheck(email: string): { verified: boolean; detail: string } {
  const address = email.trim().toLowerCase();
  const domain = address.split("@")[1] ?? "";
  if (!MAIL_PROVIDER_SENDERS.has(address))
    return {
      verified: false,
      detail: `The provider does not list ${email} as a sender. Add it there, then check again.`,
    };
  if (!(domain in MAIL_PROVIDER_DOMAINS))
    return {
      verified: false,
      detail: `${domain} is not set up with the provider, so mail from it would fail DMARC.`,
    };
  if (!MAIL_PROVIDER_DOMAINS[domain])
    return {
      verified: false,
      detail: `${domain} is set up with the provider but not authenticated: its DNS records are missing or wrong.`,
    };
  return {
    verified: true,
    detail: `${email} is an active sender, and ${domain} is authenticated with the provider.`,
  };
}
function mailVersionOf(templateId: string, version?: number): MailVersionRow | undefined {
  const template = mailTemplates.find((row) => row.id === templateId);
  const wanted = version ?? template?.current_version ?? 1;
  return mailVersions.find((row) => row.template_id === templateId && row.version === wanted);
}
function mailTemplateView(row: MailTemplateRow) {
  const version = mailVersionOf(row.id);
  return {
    template_id: row.id,
    name: row.name,
    kind: row.kind,
    current_version: row.current_version,
    subject: version?.subject ?? "",
    body_html: version?.body_html ?? "",
    body_text: version?.body_text ?? "",
    required_vars: version?.required_vars ?? [],
    content_hash: version?.content_hash ?? "",
    created_by: mailPerson(row.created_by),
    created_at: row.created_at,
    updated_at: version?.created_at ?? row.created_at,
    archived_at: row.archived_at,
    variables: MAIL_KNOWN_VARS,
  };
}
function mailSegmentView(row: MailSegmentRow) {
  return {
    segment_id: row.id,
    name: row.name,
    kind: row.kind,
    conditions: mailParseConditions(row.conditions, row.kind).conditions,
    last_count: row.last_count,
    last_evaluated_at: row.last_evaluated_at,
    created_by: mailPerson(row.created_by),
    created_at: row.created_at,
    archived_at: row.archived_at,
  };
}
function mailRate(part: number, whole: number): number | null {
  return whole > 0 ? Math.round((part * 10_000) / whole) / 100 : null;
}
function mailCampaignView(row: MailCampaignRow) {
  const sender = mailSenders.find((candidate) => candidate.id === row.sender_id);
  const template = mailTemplates.find((candidate) => candidate.id === row.template_id);
  const audience: Record<string, unknown> = { ...row.audience };
  if (audience.kind === "csv") {
    audience.row_count = Array.isArray(audience.rows) ? audience.rows.length : 0;
    delete audience.rows;
  }
  const counts = row.counts;
  return {
    campaign_id: row.id,
    name: row.name,
    sender: {
      sender_id: row.sender_id,
      from_email: sender?.from_email ?? "",
      from_name: sender?.from_name ?? "",
    },
    template: {
      template_id: row.template_id,
      name: template?.name ?? "",
      version: row.template_version,
    },
    topic: row.topic,
    topic_label: MAIL_TOPICS[row.topic] ?? row.topic,
    audience,
    audience_description: mailDescribeAudience(row.audience),
    state: row.state,
    scheduled_at: row.scheduled_at,
    send_anytime: row.send_anytime,
    dry_run: row.dry_run,
    requires_approval: row.requires_approval,
    approved_by: mailPerson(row.approved_by),
    approved_at: row.approved_at,
    pause_reason: row.pause_reason,
    paused_at: row.paused_at,
    counts: { ...counts },
    rates: {
      delivered_pct: mailRate(counts.delivered, counts.sent),
      hard_bounce_pct: mailRate(counts.hard_bounced, counts.sent),
      complaint_pct: mailRate(counts.complained, counts.sent),
      click_pct: mailRate(counts.clicked, counts.delivered),
      unsubscribe_pct: mailRate(counts.unsubscribed, counts.delivered),
    },
    started_at: row.started_at,
    completed_at: row.completed_at,
    created_by: mailPerson(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
function mailMessageView(row: MailMessageRow, fullEmail = true) {
  return {
    message_id: row.id,
    kind: row.kind,
    campaign_id: row.campaign_id || null,
    enrolment_id: row.enrolment_id || null,
    step_no: row.step_no,
    contact_kind: row.contact_kind,
    contact_id: row.contact_id || null,
    company_id: row.company_id || null,
    email: fullEmail ? row.email : mailMask(row.email),
    state: row.state,
    scheduled_at: row.scheduled_at,
    sent_at: row.sent_at,
    delivered_at: row.delivered_at,
    first_clicked_at: row.first_clicked_at,
    first_opened_at: row.first_opened_at,
    bounced_at: row.bounced_at,
    complained_at: row.complained_at,
    unsubscribed_at: row.unsubscribed_at,
    provider_status: row.provider_status,
    subject: row.subject,
    skip_reason: row.skip_reason,
    last_error: row.last_error,
    attempts: row.attempts,
    is_seed: row.is_seed,
  };
}
function mailSuppressionView(row: MailSuppressionRow) {
  return {
    suppression_id: row.id,
    email: row.email_norm,
    scope: row.scope,
    scope_key: row.scope_key,
    reason: row.reason,
    source: row.source,
    detail: row.detail,
    created_at: row.created_at,
    created_by: mailPerson(row.created_by),
    released_at: row.released_at,
    released_by: mailPerson(row.released_by),
    release_note: row.release_note,
    active: !row.released_at,
  };
}
function mailConsentView(norm: string) {
  const row = mailConsent.get(norm);
  return {
    email: norm,
    marketing_state: row?.marketing_state ?? "unknown",
    topics_off: row?.topics_off ?? [],
    sales_stop: row?.sales_stop ?? false,
    lawful_basis: row?.lawful_basis ?? "",
    source: row?.source ?? "",
    timezone: row?.timezone ?? "",
    updated_at: row?.updated_at ?? null,
  };
}
function mailStepView(step: MailStepRow) {
  return {
    step_no: step.step_no,
    kind: step.kind,
    delay_days: step.delay_days,
    template_id: step.template_id || null,
    template_name: mailTemplates.find((row) => row.id === step.template_id)?.name ?? "",
    template_version: step.template_version,
    thread: step.thread,
    task_title: step.task_title,
  };
}
function mailSequenceView(row: MailSequenceRow) {
  const enrolments = mailEnrolments.filter((candidate) => candidate.sequence_id === row.id);
  const sender = mailSenders.find((candidate) => candidate.id === row.sender_id);
  return {
    sequence_id: row.id,
    name: row.name,
    kind: row.kind,
    sender: sender
      ? { sender_id: sender.id, from_email: sender.from_email, from_name: sender.from_name }
      : null,
    state: row.state,
    cooling_days: row.cooling_days,
    recent_contact_days: row.recent_contact_days,
    company_limit: row.company_limit,
    steps: (mailSteps.get(row.id) ?? []).map(mailStepView),
    counts: {
      active: enrolments.filter((item) => item.state === "active").length,
      paused: enrolments.filter((item) => item.state === "paused").length,
      completed: enrolments.filter((item) => item.state === "completed").length,
      exited: enrolments.filter((item) => item.state === "exited").length,
      enrolled: enrolments.length,
      replied: enrolments.filter((item) => item.outcome === "replied_positive").length,
      meetings: enrolments.filter(
        (item) => item.outcome === "meeting_booked" || item.exit_reason === "MEETING_BOOKED",
      ).length,
    },
    created_by: mailPerson(row.created_by),
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
}
function mailContactLabel(kind: string, id: string): string {
  if (kind === "lead") return leads.find((row) => row.id === id)?.full_name ?? "";
  return people.find((row) => row.id === id)?.full_name ?? "";
}
function mailBusinessDaysSince(iso: string | null): number {
  if (!iso) return 0;
  let count = 0;
  const day = new Date(iso);
  const end = new Date();
  day.setUTCHours(0, 0, 0, 0);
  while (day < end) {
    day.setUTCDate(day.getUTCDate() + 1);
    const weekday = day.getUTCDay();
    if (day <= end && weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}
function mailEnrolmentView(row: MailEnrolmentRow) {
  const steps = mailSteps.get(row.sequence_id) ?? [];
  return {
    enrolment_id: row.id,
    sequence_id: row.sequence_id,
    contact_kind: row.contact_kind,
    contact_id: row.contact_id,
    contact_name: mailContactLabel(row.contact_kind, row.contact_id),
    company_id: row.company_id,
    company_name:
      companies.find((company) => company.id === row.company_id)?.name ??
      (row.contact_kind === "lead"
        ? (leads.find((lead) => lead.id === row.contact_id)?.company_name ?? "")
        : ""),
    email: mailMask(row.email_norm),
    owner_staff_id: row.owner_staff_id,
    owner_name: mailStaffName(row.owner_staff_id),
    state: row.state,
    current_step: row.current_step,
    steps_total: steps.length,
    waiting_task_id: row.waiting_task_id || null,
    exit_reason: row.exit_reason,
    outcome: row.outcome,
    outcome_label: MAIL_OUTCOMES[row.outcome] ?? "",
    paused_until: row.paused_until,
    pause_reason: row.pause_reason,
    enrolled_at: row.enrolled_at,
    last_sent_at: row.last_sent_at,
    exited_at: row.exited_at,
    awaiting_reply:
      row.state === "active" &&
      Boolean(row.last_sent_at) &&
      mailBusinessDaysSince(row.last_sent_at) >= 1 &&
      !row.outcome,
  };
}

// -- the queue ---------------------------------------------------------------------------------
function mailSentToday(): number {
  return mailSentTodayWhere(() => true);
}
/** mail_rules.COUNTRY_ZONES: a country picks the recipient's clock when no zone is recorded. */
const MAIL_COUNTRY_ZONES: Record<string, string> = {
  "united kingdom": "Europe/London",
  uk: "Europe/London",
  gb: "Europe/London",
  ireland: "Europe/Dublin",
  "united states": "America/New_York",
  usa: "America/New_York",
  us: "America/New_York",
  canada: "America/Toronto",
  switzerland: "Europe/Zurich",
  germany: "Europe/Berlin",
  austria: "Europe/Vienna",
  france: "Europe/Paris",
  netherlands: "Europe/Amsterdam",
  belgium: "Europe/Brussels",
  luxembourg: "Europe/Luxembourg",
  spain: "Europe/Madrid",
  italy: "Europe/Rome",
  sweden: "Europe/Stockholm",
  denmark: "Europe/Copenhagen",
  norway: "Europe/Oslo",
  finland: "Europe/Helsinki",
  poland: "Europe/Warsaw",
  portugal: "Europe/Lisbon",
  india: "Asia/Kolkata",
  singapore: "Asia/Singapore",
  "hong kong": "Asia/Hong_Kong",
  japan: "Asia/Tokyo",
  australia: "Australia/Sydney",
  "new zealand": "Pacific/Auckland",
  "united arab emirates": "Asia/Dubai",
  uae: "Asia/Dubai",
  "south africa": "Africa/Johannesburg",
  brazil: "America/Sao_Paulo",
  mexico: "America/Mexico_City",
  israel: "Asia/Jerusalem",
  china: "Asia/Shanghai",
  "south korea": "Asia/Seoul",
  qatar: "Asia/Qatar",
  "saudi arabia": "Asia/Riyadh",
};
/** mail_worker.DOMAIN_DAILY_CAP: no more than this many to one domain in a day. */
const MAIL_DOMAIN_DAILY_CAP = 3;
/** crm_routes.FREE_MAIL_DOMAINS: addresses there name a person, not a firm. */
const MAIL_FREE_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "live.com",
  "yahoo.com",
  "icloud.com",
  "me.com",
  "proton.me",
  "protonmail.com",
  "gmx.com",
  "aol.com",
  "mail.com",
  "yandex.com",
  "zoho.com",
  "hey.com",
  "pm.me",
]);
function mailIsoMs(ms: number): string {
  return new Date(ms).toISOString().replace(/\.\d{3}Z$/, "Z");
}
function mailValidZone(key: string): boolean {
  try {
    new Intl.DateTimeFormat("en-GB", { timeZone: key });
    return true;
  } catch {
    return false;
  }
}
/** mail_rules.zone_for: the first candidate naming a zone, by IANA key or by country. */
function mailZoneFor(...candidates: string[]): string {
  for (const candidate of candidates) {
    const text = String(candidate ?? "").trim();
    if (!text) continue;
    const key = MAIL_COUNTRY_ZONES[text.toLowerCase()] ?? (text.includes("/") ? text : "");
    if (key && mailValidZone(key)) return key;
  }
  return mailValidZone(mailSettings.fallback_timezone) ? mailSettings.fallback_timezone : "UTC";
}
/** `ms` as `zone`'s wall clock, written as if it were UTC (so getUTC* read local time). */
function mailWall(ms: number, zone: string): number {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(new Date(ms));
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value ?? 0);
  return Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
}
/** The instant at which `zone`'s wall clock reads `wallMs`. */
function mailFromWall(wallMs: number, zone: string): number {
  let guess = wallMs;
  for (let round = 0; round < 3; round += 1) guess = wallMs - (mailWall(guess, zone) - guess);
  return guess;
}
function mailMinutes(hhmm: string): number {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return (hours ?? 0) * 60 + (minutes ?? 0);
}
function mailWeekend(wallDay: number): boolean {
  const weekday = new Date(wallDay).getUTCDay();
  return weekday === 0 || weekday === 6;
}
/** mail_rules.next_slot: `fromMs` itself inside the window, else the next opening on a business day. */
function mailNextSlotMs(fromMs: number, zone: string): number {
  const start = mailMinutes(mailSettings.window_start);
  const end = mailMinutes(mailSettings.window_end);
  const wall = mailWall(fromMs, zone);
  const day = Math.floor(wall / 86_400_000) * 86_400_000;
  const minute = Math.floor((wall - day) / 60_000);
  if (!mailWeekend(day) && minute >= start && minute < end) return fromMs;
  let next = !mailWeekend(day) && minute < start ? day : day + 86_400_000;
  while (mailWeekend(next)) next += 86_400_000;
  return mailFromWall(next + start * 60_000, zone);
}
/** Sends today by anyone but seeds and tests, narrowed by `match` (a sender, a domain, an hour). */
function mailSentTodayWhere(match: (row: MailMessageRow) => boolean): number {
  const day = new Date().toISOString().slice(0, 10);
  return mailMessages.filter(
    (row) =>
      row.kind !== "test" && !row.is_seed && Boolean(row.sent_at?.startsWith(day)) && match(row),
  ).length;
}
function mailSentThisHour(): number {
  const hour = new Date().toISOString().slice(0, 13);
  return mailSentTodayWhere((row) => Boolean(row.sent_at?.startsWith(hour)));
}
/**
 * Seeded sends sit where the worker could have made them: inside the recipient's window, on
 * a business day `businessDaysBack` before today (0 = today), `minutesIn` after it opened.
 */
function mailSeedSentAt(businessDaysBack: number, zone: string, minutesIn: number): string {
  let day = Math.floor(mailWall(Date.now(), zone) / 86_400_000) * 86_400_000;
  let remaining = businessDaysBack;
  while (remaining > 0 || mailWeekend(day)) {
    day -= 86_400_000;
    if (!mailWeekend(day)) remaining -= 1;
  }
  const at = mailFromWall(
    day + (mailMinutes(mailSettings.window_start) + minutesIn) * 60_000,
    zone,
  );
  return mailIsoMs(Math.min(at, Date.now() - 60_000));
}
/** 0 when `needMinutes` of today's window in `zone` have already passed, else 1. */
function mailSeedDayBack(zone: string, needMinutes: number): number {
  const wall = mailWall(Date.now(), zone);
  const day = Math.floor(wall / 86_400_000) * 86_400_000;
  if (mailWeekend(day)) return 1;
  const minute = Math.floor((wall - day) / 60_000);
  const open =
    Math.min(minute, mailMinutes(mailSettings.window_end)) - mailMinutes(mailSettings.window_start);
  return open >= needMinutes ? 0 : 1;
}
function mailTomorrowNine(): string {
  const next = new Date();
  next.setUTCDate(next.getUTCDate() + 1);
  while (next.getUTCDay() === 0 || next.getUTCDay() === 6) next.setUTCDate(next.getUTCDate() + 1);
  next.setUTCHours(9, 0, 0, 0);
  return next.toISOString().replace(/\.\d{3}Z$/, "Z");
}
function mailAddBusinessDays(fromIso: string, count: number): string {
  const day = new Date(fromIso);
  let remaining = count;
  while (remaining > 0) {
    day.setUTCDate(day.getUTCDate() + 1);
    if (day.getUTCDay() !== 0 && day.getUTCDay() !== 6) remaining -= 1;
  }
  day.setUTCHours(9, 0, 0, 0);
  return day.toISOString().replace(/\.\d{3}Z$/, "Z");
}
function mailActivity(row: MailMessageRow, subject: string) {
  if (row.contact_kind !== "person" && row.contact_kind !== "lead") return;
  activities.unshift({
    kind: "email_out",
    at: now(),
    staff_id: "",
    staff_name: "",
    body: `${row.kind === "campaign" ? "Campaign email" : `Sequence email, step ${row.step_no ?? 1}`}: “${subject}”`,
    company_id: row.company_id,
    person_id: row.contact_kind === "person" ? row.contact_id : "",
    deal_id: "",
    lead_id: row.contact_kind === "lead" ? row.contact_id : "",
  });
}
function mailStageStep(enrolment: MailEnrolmentRow, step: MailStepRow, afterIso: string) {
  const when = step.delay_days > 0 ? mailAddBusinessDays(afterIso, step.delay_days) : afterIso;
  if (step.kind === "task") {
    const taskId = randomUUID();
    tasks.push({
      id: taskId,
      title: step.task_title || "Follow up",
      body: `Sequence step ${step.step_no} for ${mailContactLabel(enrolment.contact_kind, enrolment.contact_id) || enrolment.email_norm}. Mark it done and the sequence carries on.`,
      status: "open",
      priority: "medium",
      due_on: when.slice(0, 10),
      assignee_staff_id: enrolment.owner_staff_id,
      company_id: enrolment.company_id,
      person_id: enrolment.contact_kind === "person" ? enrolment.contact_id : "",
      deal_id: "",
      lead_id: enrolment.contact_kind === "lead" ? enrolment.contact_id : "",
      ticket_id: "",
      origin: `sequence:step-${step.step_no}`,
      completed_at: null,
      created_at: now(),
    });
    enrolment.current_step = step.step_no;
    enrolment.waiting_task_id = taskId;
    return;
  }
  const existing = mailMessages.find(
    (row) => row.enrolment_id === enrolment.id && row.step_no === step.step_no,
  );
  if (existing) {
    if (existing.state === "cancelled")
      Object.assign(existing, { state: "pending", scheduled_at: when, skip_reason: "" });
    enrolment.current_step = step.step_no;
    return;
  }
  const recipient =
    enrolment.contact_kind === "lead"
      ? mailLeadRecipient(leads.find((row) => row.id === enrolment.contact_id)!)
      : mailPersonRecipient(people.find((row) => row.id === enrolment.contact_id)!);
  const sender = mailSenders.find((row) => row.id === enrolment.sender_id);
  mailMessages.push({
    id: randomUUID(),
    kind: "sequence",
    campaign_id: "",
    enrolment_id: enrolment.id,
    step_no: step.step_no,
    sender_id: enrolment.sender_id,
    topic: "sales",
    contact_kind: enrolment.contact_kind,
    contact_id: enrolment.contact_id,
    company_id: enrolment.company_id,
    email: recipient.email,
    email_norm: mailNorm(recipient.email),
    variables: {
      ...mailVariables(recipient),
      sender_name: sender?.from_name ?? "",
      sender_email: sender?.from_email ?? "",
      owner_name: mailStaffName(enrolment.owner_staff_id),
    },
    template_id: step.template_id,
    template_version: step.template_version ?? 1,
    state: "pending",
    scheduled_at: when,
    sent_at: null,
    delivered_at: null,
    first_clicked_at: null,
    first_opened_at: null,
    bounced_at: null,
    complained_at: null,
    unsubscribed_at: null,
    provider_message_id: "",
    provider_status: "",
    subject: "",
    in_reply_to: step.thread === "reply" ? enrolment.thread_message_id : "",
    skip_reason: "",
    last_error: "",
    attempts: 0,
    is_seed: false,
  });
  enrolment.current_step = step.step_no;
  enrolment.waiting_task_id = "";
}
function mailAfterSend(row: MailMessageRow, sentAt: string) {
  const enrolment = mailEnrolments.find((candidate) => candidate.id === row.enrolment_id);
  if (!enrolment || (enrolment.state !== "active" && enrolment.state !== "paused")) return;
  enrolment.last_sent_at = sentAt;
  if (!enrolment.thread_message_id) {
    enrolment.thread_message_id = row.provider_message_id;
    enrolment.thread_subject = row.subject;
  }
  const steps = mailSteps.get(enrolment.sequence_id) ?? [];
  const next = steps.find((step) => step.step_no > (row.step_no ?? 1));
  if (!next) {
    enrolment.state = "completed";
    enrolment.exit_reason = "COMPLETED";
    enrolment.exited_at = sentAt;
    return;
  }
  mailStageStep(enrolment, next, sentAt);
}
function mailExit(
  enrolment: MailEnrolmentRow,
  reason: string,
  outcome: string,
  actor: string,
  note = "",
) {
  enrolment.state = "exited";
  enrolment.exit_reason = reason;
  enrolment.outcome = outcome || enrolment.outcome;
  enrolment.exited_at = now();
  enrolment.waiting_task_id = "";
  for (const row of mailMessages) {
    if (row.enrolment_id === enrolment.id && ["pending", "retry", "held"].includes(row.state)) {
      row.state = "cancelled";
      row.skip_reason = "ENROLMENT_ENDED";
    }
  }
  audit("mail.enrolment_exited", actor || null, "mail_enrolment", enrolment.id, note, {
    reason,
    outcome,
  });
}
function mailPauseCompany(companyId: string, exceptId: string) {
  if (!companyId) return;
  for (const row of mailEnrolments) {
    if (row.company_id !== companyId || row.id === exceptId || row.state !== "active") continue;
    row.state = "paused";
    row.pause_reason = "COMPANY_ENGAGED";
    row.paused_until = mailAddBusinessDays(now(), 3).slice(0, 10);
    for (const message of mailMessages) {
      if (message.enrolment_id === row.id && ["pending", "retry"].includes(message.state)) {
        message.state = "cancelled";
        message.skip_reason = "COMPANY_ENGAGED";
      }
    }
  }
}
function mailCrmEvent(
  kind: "meeting" | "deal" | "lead_stage" | "task_done" | "do_not_contact" | "reply_logged",
  ids: {
    person_id?: string;
    lead_id?: string;
    company_id?: string;
    stage?: string;
    task_id?: string;
  },
) {
  if (kind === "task_done") {
    const enrolment = mailEnrolments.find(
      (row) => row.state === "active" && row.waiting_task_id === ids.task_id,
    );
    if (!enrolment) return;
    enrolment.waiting_task_id = "";
    const next = (mailSteps.get(enrolment.sequence_id) ?? []).find(
      (step) => step.step_no > enrolment.current_step,
    );
    if (next) mailStageStep(enrolment, next, now());
    else
      Object.assign(enrolment, { state: "completed", exit_reason: "COMPLETED", exited_at: now() });
    return;
  }
  for (const row of mailEnrolments.filter(
    (candidate) => candidate.state === "active" || candidate.state === "paused",
  )) {
    const same =
      (ids.person_id && row.contact_id === ids.person_id) ||
      (ids.lead_id && row.contact_id === ids.lead_id);
    if (kind === "meeting" && same) {
      mailExit(row, "MEETING_BOOKED", "meeting_booked", "");
      mailPauseCompany(row.company_id, row.id);
    } else if (kind === "deal" && ids.company_id && row.company_id === ids.company_id) {
      const sequence = mailSequences.find((candidate) => candidate.id === row.sequence_id);
      if (sequence?.kind !== "customer") mailExit(row, "DEAL_CREATED", "", "");
    } else if (kind === "lead_stage" && ids.lead_id && row.contact_id === ids.lead_id) {
      if (ids.stage === "connected" || ids.stage === "qualified")
        mailExit(row, "STAGE_ADVANCED", "", "");
      else if (ids.stage === "disqualified") mailExit(row, "STAGE_CLOSED", "", "");
    } else if (kind === "do_not_contact" && same) {
      mailExit(row, "DO_NOT_CONTACT", "", "");
    } else if (kind === "reply_logged" && same) {
      mailExit(row, "REPLIED", "", "", "a reply was logged on the record");
      mailPauseCompany(row.company_id, row.id);
    }
  }
}
function mailRunWorker(): Record<string, number | boolean> {
  const report = { claimed: 0, sent: 0, deferred: 0, skipped: 0, dry_run: 0, paused: false };
  mailSettings.last_worker_at = now();
  if (!mailSettings.sending_enabled) return { ...report, paused: true };
  const due = mailMessages
    .filter(
      (row) =>
        (row.state === "pending" || row.state === "retry") &&
        Date.parse(row.scheduled_at) <= Date.now(),
    )
    .sort(
      (a, b) =>
        Number(b.is_seed) - Number(a.is_seed) ||
        Number(b.kind === "sequence" && (b.step_no ?? 0) > 1) -
          Number(a.kind === "sequence" && (a.step_no ?? 0) > 1) ||
        a.scheduled_at.localeCompare(b.scheduled_at),
    );
  for (const row of due) {
    report.claimed += 1;
    const campaign = row.campaign_id
      ? mailCampaigns.find((candidate) => candidate.id === row.campaign_id)
      : undefined;
    if (campaign && !["running", "scheduled"].includes(campaign.state)) continue;
    const enrolment = row.enrolment_id
      ? mailEnrolments.find((candidate) => candidate.id === row.enrolment_id)
      : undefined;
    if (row.enrolment_id && enrolment?.state !== "active") {
      row.state = "cancelled";
      row.skip_reason = "ENROLMENT_ENDED";
      continue;
    }
    const recipient = {
      ...(row.contact_kind === "person"
        ? mailPersonRecipient(people.find((p) => p.id === row.contact_id) ?? ({} as PersonRow))
        : {}),
      email: row.email,
    } as MailRecipient;
    const verdict = row.is_seed
      ? { allowed: true, reason: "", detail: "" }
      : row.kind === "campaign"
        ? mailAddressVerdict(row.email, row.topic, row.sender_id)
        : mailSalesVerdict(
            { ...recipient, do_not_contact: Boolean(recipient.do_not_contact) },
            row.sender_id,
          );
    if (!verdict.allowed) {
      row.state = "skipped";
      row.skip_reason = verdict.reason;
      if (campaign) {
        campaign.counts.skipped += 1;
        campaign.counts.recipients = Math.max(0, campaign.counts.recipients - 1);
      }
      report.skipped += 1;
      continue;
    }
    // mail_worker.process_row: the recipient's window, then one domain's day, then the caps
    // (global, sender, hour) — seeds are exempt, a dry run reserves no cap.
    const zone = mailZoneFor(
      mailConsent.get(row.email_norm)?.timezone ?? "",
      String(row.variables.country ?? ""),
    );
    const defer = (whenMs: number, reason: string) => {
      row.scheduled_at = mailIsoMs(whenMs);
      row.last_error = reason;
      report.deferred += 1;
    };
    const tomorrow = Date.parse(`${new Date().toISOString().slice(0, 10)}T00:00:00Z`) + 86_400_000;
    if (!row.is_seed && !campaign?.send_anytime) {
      const slot = mailNextSlotMs(Date.now(), zone);
      if (slot > Date.now()) {
        defer(slot, "outside the recipient's window");
        continue;
      }
    }
    const pausedSender = mailSenders.find((candidate) => candidate.id === row.sender_id);
    if (pausedSender?.paused_at && !row.is_seed) {
      Object.assign(row, { state: "held", last_error: "SENDER_PAUSED" });
      continue;
    }
    const rawDomain = row.email_norm.split("@")[1] ?? "";
    const domain = MAIL_FREE_DOMAINS.has(rawDomain) ? "" : rawDomain;
    if (
      domain &&
      !row.is_seed &&
      mailSentTodayWhere((sent) => sent.email_norm.endsWith(`@${domain}`)) >= MAIL_DOMAIN_DAILY_CAP
    ) {
      defer(mailNextSlotMs(tomorrow, zone), `${MAIL_DOMAIN_DAILY_CAP} to ${domain} today already`);
      continue;
    }
    if (domain && !row.is_seed && row.kind === "sequence" && row.step_no === 1) {
      const lastFirst = mailMessages
        .filter(
          (sent) =>
            sent.kind === "sequence" &&
            sent.step_no === 1 &&
            sent.sent_at &&
            sent.email_norm.endsWith(`@${domain}`) &&
            Date.parse(sent.sent_at) >= Date.now() - 86_400_000,
        )
        .map((sent) => Date.parse(sent.sent_at!))
        .sort((a, b) => b - a)[0];
      if (lastFirst !== undefined) {
        defer(
          Math.max(mailNextSlotMs(lastFirst + 86_400_000, zone), Date.now() + 60_000),
          `a first email went to ${domain} in the last day`,
        );
        continue;
      }
    }
    if (!row.is_seed && !campaign?.dry_run) {
      const sender = mailSenders.find((candidate) => candidate.id === row.sender_id);
      if (mailSentToday() >= mailSettings.global_daily_cap) {
        defer(mailNextSlotMs(tomorrow, zone), "cap reached: global");
        continue;
      }
      if (
        sender &&
        mailSentTodayWhere((sent) => sent.sender_id === sender.id) >= sender.daily_cap
      ) {
        defer(mailNextSlotMs(tomorrow, zone), "cap reached: sender");
        continue;
      }
      if (mailSentThisHour() >= mailSettings.hourly_cap) {
        defer(mailNextSlotMs(Date.now() + 3_600_000, zone), "cap reached: hour");
        continue;
      }
    }
    const version = mailVersionOf(row.template_id, row.template_version);
    const rendered = version
      ? mailRenderMessage(
          version,
          row.variables,
          row.topic,
          row.id,
          row.in_reply_to ? (enrolment?.thread_subject ?? "") : "",
        )
      : { missing: "template" };
    if ("missing" in rendered) {
      row.state = "skipped";
      row.skip_reason = "MISSING_TOKEN";
      row.last_error = rendered.missing;
      report.skipped += 1;
      continue;
    }
    if (campaign?.dry_run) {
      Object.assign(row, {
        state: "dry_run",
        provider_message_id: `dry-run:${row.id}`,
        subject: rendered.subject,
        sent_at: now(),
      });
      report.dry_run += 1;
      continue;
    }
    mailProviderCounter += 1;
    const sentAt = now();
    Object.assign(row, {
      state: "delivered",
      sent_at: sentAt,
      delivered_at: sentAt,
      provider_message_id: `<mock-${mailProviderCounter}@mail.test>`,
      provider_status: "delivered",
      subject: rendered.subject,
      attempts: row.attempts + 1,
      last_error: "",
    });
    mailEvents.push({
      message_id: row.id,
      event_type: "delivered",
      occurred_at: sentAt,
      reason: "",
      link: "",
    });
    if (campaign && !row.is_seed) {
      campaign.counts.sent += 1;
      campaign.counts.delivered += 1;
    }
    if (row.contact_kind === "person") {
      const person = people.find((candidate) => candidate.id === row.contact_id);
      if (person) person.last_contacted_at = sentAt;
    }
    mailActivity(row, rendered.subject);
    if (row.enrolment_id) mailAfterSend(row, sentAt);
    report.sent += 1;
  }
  for (const campaign of mailCampaigns) {
    if (campaign.state !== "running") continue;
    if (
      !mailMessages.some(
        (row) =>
          row.campaign_id === campaign.id && ["pending", "retry", "claimed"].includes(row.state),
      )
    ) {
      campaign.state = "completed";
      campaign.completed_at = now();
      campaign.updated_at = now();
    }
  }
  return report;
}
function mailChecklist(campaign: MailCampaignRow, eligible: number, skipped: number) {
  const sender = mailSenders.find((row) => row.id === campaign.sender_id);
  const tested = mailMessages.some(
    (row) =>
      row.kind === "test" &&
      row.state === "sent" &&
      row.template_id === campaign.template_id &&
      row.template_version === campaign.template_version,
  );
  return [
    {
      key: "sender_verified",
      ok: Boolean(sender?.verified && sender.active),
      blocking: true,
      label: "The sender is verified with the provider",
    },
    {
      key: "postal_address",
      ok: Boolean(mailSettings.postal_address),
      blocking: true,
      label: "A postal address is set for the footer",
    },
    {
      key: "audience",
      ok: eligible > 0,
      blocking: true,
      label: `${eligible} eligible recipients; ${skipped} skipped`,
    },
    {
      key: "test_send",
      ok: tested,
      blocking: true,
      label: "A test of this template version was sent to a colleague",
    },
    {
      key: "sending_enabled",
      ok: mailSettings.sending_enabled,
      blocking: true,
      label: "Sending is switched on",
    },
    {
      key: "webhook",
      ok: mailSettings.webhook_configured,
      blocking: false,
      label: "The provider's delivery events are wired (bounces, complaints)",
    },
    {
      key: "approval",
      ok: !campaign.requires_approval || Boolean(campaign.approved_by),
      blocking: true,
      label: campaign.requires_approval
        ? "Approved by a second person"
        : "No second approval needed at this size",
    },
  ];
}
function mailCampaignPreview(campaign: MailCampaignRow) {
  const version = mailVersionOf(campaign.template_id, campaign.template_version);
  const decided = mailDecide(
    mailResolveAudience(campaign.audience),
    campaign.topic,
    campaign.sender_id,
    version?.required_vars ?? [],
  );
  return mailSummarise(decided);
}
function mailEnqueue(campaign: MailCampaignRow, startIso: string) {
  const version = mailVersionOf(campaign.template_id, campaign.template_version);
  const sender = mailSenders.find((row) => row.id === campaign.sender_id);
  const decided = mailDecide(
    mailResolveAudience(campaign.audience),
    campaign.topic,
    campaign.sender_id,
    version?.required_vars ?? [],
  );
  let eligible = 0;
  let skipped = 0;
  const base = { sender_name: sender?.from_name ?? "", sender_email: sender?.from_email ?? "" };
  const push = (recipient: MailRecipient, verdict: MailVerdict, isSeed: boolean, when: string) => {
    mailMessages.push({
      id: randomUUID(),
      kind: "campaign",
      campaign_id: campaign.id,
      enrolment_id: "",
      step_no: null,
      sender_id: campaign.sender_id,
      topic: campaign.topic,
      contact_kind: recipient.contact_kind,
      contact_id: recipient.contact_id,
      company_id: recipient.company_id,
      email: recipient.email,
      email_norm: mailNorm(recipient.email),
      variables: { ...mailVariables(recipient), ...base },
      template_id: campaign.template_id,
      template_version: campaign.template_version,
      state: verdict.allowed ? "pending" : "skipped",
      scheduled_at: when,
      sent_at: null,
      delivered_at: null,
      first_clicked_at: null,
      first_opened_at: null,
      bounced_at: null,
      complained_at: null,
      unsubscribed_at: null,
      provider_message_id: "",
      provider_status: "",
      subject: "",
      in_reply_to: "",
      skip_reason: verdict.reason,
      last_error: verdict.detail,
      attempts: 0,
      is_seed: isSeed,
    });
  };
  for (const seed of mailSettings.seed_addresses) {
    push(
      {
        ...mailResolveAudience({
          kind: "csv",
          rows: [{ email: seed, full_name: "Seed inbox", company: "Quantify Terminal" }],
        })[0]!,
      },
      { allowed: true, reason: "", detail: "" },
      true,
      startIso,
    );
  }
  for (const item of decided) {
    if (!item.verdict.allowed && item.verdict.reason === "DUPLICATE") {
      skipped += 1;
      continue;
    }
    push(item.recipient, item.verdict, false, startIso);
    if (item.verdict.allowed) eligible += 1;
    else skipped += 1;
  }
  const running = Date.parse(startIso) <= Date.now();
  Object.assign(campaign, {
    state: running ? "running" : "scheduled",
    scheduled_at: startIso,
    started_at: running ? now() : null,
    counts: { ...campaign.counts, recipients: eligible, skipped },
    updated_at: now(),
  });
  return { eligible, skipped, state: campaign.state, starts_at: startIso };
}
function mailEnrolVerdicts(
  sequence: MailSequenceRow,
  contacts: Array<{ kind: string; id: string }>,
  enroller: Staff,
  mayEnrolOthers: boolean,
) {
  const seen = new Set<string>();
  const perCompany = new Map<string, number>();
  for (const row of mailEnrolments) {
    if (
      row.sequence_id === sequence.id &&
      (row.state === "active" || row.state === "paused") &&
      row.company_id
    )
      perCompany.set(row.company_id, (perCompany.get(row.company_id) ?? 0) + 1);
  }
  const sender =
    mailSenders.find((row) => row.id === sequence.sender_id && row.active) ??
    mailSenders.find((row) => row.kind === "sales" && row.staff_id === enroller.id && row.active);
  const required: string[] = [];
  for (const step of mailSteps.get(sequence.id) ?? []) {
    if (step.kind !== "email") continue;
    for (const name of mailVersionOf(step.template_id, step.template_version ?? undefined)
      ?.required_vars ?? []) {
      if (!required.includes(name) && !["sender_name", "sender_email", "owner_name"].includes(name))
        required.push(name);
    }
  }
  return contacts.map((contact) => {
    const personRow =
      contact.kind === "person"
        ? people.find((row) => row.id === contact.id && !row.archived)
        : undefined;
    const leadRow =
      contact.kind === "lead" ? leads.find((row) => row.id === contact.id) : undefined;
    const recipient = personRow
      ? mailPersonRecipient(personRow)
      : leadRow
        ? mailLeadRecipient(leadRow)
        : null;
    const entry = {
      contact_kind: contact.kind,
      contact_id: contact.id,
      name: recipient?.full_name ?? "",
      email: recipient ? mailMask(recipient.email) : "",
      company: recipient?.company_name ?? "",
      allowed: true,
      reason: "",
      detail: "",
      recipient,
      sender,
    };
    const refuse = (reason: string, detail = "") =>
      Object.assign(entry, { allowed: false, reason, detail });
    if (!recipient) return refuse("NOT_FOUND");
    if (!sender) return refuse("NO_SENDER", "no sales identity for the sender");
    const norm = mailNorm(recipient.email);
    if (seen.has(norm)) return refuse("DUPLICATE");
    seen.add(norm);
    const verdict = mailSalesVerdict(recipient, sender.id);
    if (!verdict.allowed) return refuse(verdict.reason, verdict.detail);
    const live = mailEnrolments.find(
      (row) =>
        row.contact_id === recipient.contact_id &&
        (row.state === "active" || row.state === "paused"),
    );
    if (live) return refuse("ALREADY_IN_SEQUENCE", live.sequence_id);
    const past = mailEnrolments.find(
      (row) => row.contact_id === recipient.contact_id && row.sequence_id === sequence.id,
    );
    if (
      past &&
      Date.now() - Date.parse(past.exited_at ?? past.enrolled_at) <
        sequence.cooling_days * 86_400_000
    )
      return refuse("ALREADY_HAD_SEQUENCE");
    if (MAIL_CUSTOMER_LIFECYCLES.includes(recipient.lifecycle) && sequence.kind !== "customer")
      return refuse("IS_CUSTOMER");
    const last = mailLastEmailed(norm);
    if (last !== null && Date.now() - last < sequence.recent_contact_days * 86_400_000)
      return refuse("CONTACTED_RECENTLY", new Date(last).toISOString().slice(0, 10));
    if (recipient.owner_staff_id && recipient.owner_staff_id !== enroller.id && !mayEnrolOthers)
      return refuse("OWNED_BY_COLLEAGUE", recipient.owner_staff_id);
    if (
      recipient.company_id &&
      (perCompany.get(recipient.company_id) ?? 0) >= sequence.company_limit
    )
      return refuse("COMPANY_LIMIT", String(sequence.company_limit));
    const vars = mailVariables(recipient);
    const missing = required.filter((name) => !String(vars[name] ?? "").trim());
    if (missing.length) return refuse("MISSING_TOKEN", missing.join(", "));
    if (recipient.company_id)
      perCompany.set(recipient.company_id, (perCompany.get(recipient.company_id) ?? 0) + 1);
    return entry;
  });
}
function mailPublicVerdict(entry: ReturnType<typeof mailEnrolVerdicts>[number]) {
  const { recipient: _recipient, sender: _sender, ...rest } = entry;
  void _recipient;
  void _sender;
  return rest;
}
function mailTotals(sinceMs: number) {
  const rows = mailMessages.filter(
    (row) =>
      row.kind !== "test" && !row.is_seed && Date.parse(row.sent_at ?? row.scheduled_at) >= sinceMs,
  );
  const counts = {
    sent: 0,
    delivered: 0,
    hard_bounced: 0,
    soft_bounced: 0,
    complained: 0,
    unsubscribed: 0,
    clicked: 0,
    failed: 0,
    skipped: 0,
  };
  for (const row of rows) {
    if (MAIL_SENT_LIKE.includes(row.state) || row.state === "delivered") counts.sent += 1;
    if (row.delivered_at) counts.delivered += 1;
    if (row.state === "hard_bounced") counts.hard_bounced += 1;
    if (row.state === "soft_bounced") counts.soft_bounced += 1;
    if (row.complained_at) counts.complained += 1;
    if (row.unsubscribed_at) counts.unsubscribed += 1;
    if (row.first_clicked_at) counts.clicked += 1;
    if (row.state === "failed") counts.failed += 1;
    if (row.state === "skipped") counts.skipped += 1;
  }
  return {
    ...counts,
    hard_bounce_pct: mailRate(counts.hard_bounced, counts.sent),
    complaint_pct: mailRate(counts.complained, counts.sent),
    unsubscribe_pct: mailRate(counts.unsubscribed, counts.delivered),
    click_pct: mailRate(counts.clicked, counts.delivered),
    thresholds: { hard_bounce_pct: 2.0, complaint_pct_watch: 0.1, complaint_pct_stop: 0.3 },
  };
}
function mailSuppress(
  norm: string,
  reason: string,
  source: string,
  detail = "",
  by = "",
  at = now(),
) {
  if (
    mailSuppressions.some(
      (row) =>
        row.email_norm === norm &&
        row.reason === reason &&
        !row.released_at &&
        row.scope === "global",
    )
  )
    return;
  mailSuppressions.unshift({
    id: randomUUID(),
    email_norm: norm,
    scope: "global",
    scope_key: "",
    reason,
    source,
    detail,
    created_at: at,
    created_by: by,
    released_at: null,
    released_by: "",
    release_note: "",
  });
}

// -- the seeded world ---------------------------------------------------------------------------
const MAIL_IDS = {
  news: "ea100000-0000-4000-8000-000000000001",
  ownerSales: "ea100000-0000-4000-8000-000000000002",
  salesSales: "ea100000-0000-4000-8000-000000000003",
  release: "ea200000-0000-4000-8000-000000000001",
  webinar: "ea200000-0000-4000-8000-000000000002",
  roadmap: "ea200000-0000-4000-8000-000000000003",
  intro: "ea200000-0000-4000-8000-000000000004",
  bump: "ea200000-0000-4000-8000-000000000005",
  last: "ea200000-0000-4000-8000-000000000006",
  ukCustomers: "ea300000-0000-4000-8000-000000000001",
  hedgeProspects: "ea300000-0000-4000-8000-000000000002",
  newLeads: "ea300000-0000-4000-8000-000000000003",
  september: "ea400000-0000-4000-8000-000000000001",
  october: "ea400000-0000-4000-8000-000000000002",
  webinarCampaign: "ea400000-0000-4000-8000-000000000003",
  roadmapCampaign: "ea400000-0000-4000-8000-000000000004",
  prospectNewsletter: "ea400000-0000-4000-8000-000000000005",
  fundIntro: "ea500000-0000-4000-8000-000000000001",
  renewal: "ea500000-0000-4000-8000-000000000002",
  stopMessage: "ea600000-0000-4000-8000-000000000001",
  stopMessage2: "ea600000-0000-4000-8000-000000000002",
  stopMessage3: "ea600000-0000-4000-8000-000000000003",
};
function mailSeedVersion(
  templateId: string,
  version: number,
  subject: string,
  bodyHtml: string,
  bodyText: string,
  createdBy: string,
  createdAt: string,
) {
  const { required } = mailAnalyse(subject, bodyHtml, bodyText);
  mailVersions.push({
    template_id: templateId,
    version,
    subject,
    body_html: bodyHtml,
    body_text: bodyText,
    required_vars: required,
    content_hash: createHash("sha256")
      .update(`${subject}\u001f${bodyHtml}\u001f${bodyText}`)
      .digest("hex"),
    created_by: createdBy,
    created_at: createdAt,
  });
}
function mailSeedHistoricMessage(
  campaign: MailCampaignRow,
  recipient: MailRecipient,
  sentAt: string,
  outcome: string,
  index: number,
) {
  mailProviderCounter += 1;
  const row: MailMessageRow = {
    // The first three September messages have fixed ids: the harness opens their footer links.
    id:
      campaign.id === MAIL_IDS.september && index < 3
        ? [MAIL_IDS.stopMessage, MAIL_IDS.stopMessage2, MAIL_IDS.stopMessage3][index]!
        : randomUUID(),
    kind: "campaign",
    campaign_id: campaign.id,
    enrolment_id: "",
    step_no: null,
    sender_id: campaign.sender_id,
    topic: campaign.topic,
    contact_kind: recipient.contact_kind,
    contact_id: recipient.contact_id,
    company_id: recipient.company_id,
    email: recipient.email,
    email_norm: mailNorm(recipient.email),
    variables: mailVariables(recipient),
    template_id: campaign.template_id,
    template_version: campaign.template_version,
    state: "delivered",
    scheduled_at: sentAt,
    sent_at: sentAt,
    delivered_at: sentAt,
    first_clicked_at: null,
    first_opened_at: null,
    bounced_at: null,
    complained_at: null,
    unsubscribed_at: null,
    provider_message_id: `<mock-${mailProviderCounter}@mail.test>`,
    provider_status: "delivered",
    subject: `What's new in Quantify Terminal for ${recipient.company_name || "your desk"}`,
    in_reply_to: "",
    skip_reason: "",
    last_error: "",
    attempts: 1,
    is_seed: false,
  };
  campaign.counts.sent += 1;
  if (outcome === "hard_bounce") {
    Object.assign(row, {
      state: "hard_bounced",
      delivered_at: null,
      bounced_at: sentAt,
      provider_status: "hard_bounce",
    });
    campaign.counts.hard_bounced += 1;
    mailSuppress(
      row.email_norm,
      "hard_bounce",
      "webhook:brevo",
      "550 5.1.1 mailbox unavailable",
      "",
      mailIsoMs(Date.parse(sentAt) + 120_000),
    );
  } else if (outcome === "soft_bounce") {
    Object.assign(row, {
      state: "soft_bounced",
      delivered_at: null,
      bounced_at: sentAt,
      provider_status: "soft_bounce",
    });
    campaign.counts.soft_bounced += 1;
  } else {
    campaign.counts.delivered += 1;
    if (outcome === "click" || outcome === "click_unsubscribe") {
      row.first_clicked_at = new Date(Date.parse(sentAt) + 3_600_000)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");
      campaign.counts.clicked += 1;
    }
    if (outcome === "unsubscribe" || outcome === "click_unsubscribe") {
      row.unsubscribed_at = new Date(Date.parse(sentAt) + 7_200_000)
        .toISOString()
        .replace(/\.\d{3}Z$/, "Z");
      campaign.counts.unsubscribed += 1;
      mailConsent.set(row.email_norm, {
        email_norm: row.email_norm,
        marketing_state: "unsubscribed",
        topics_off: [],
        sales_stop: false,
        lawful_basis: "",
        source: "one_click",
        timezone: "",
        updated_at: row.unsubscribed_at,
      });
      mailSuppress(row.email_norm, "unsubscribe", "one_click", "all", "", row.unsubscribed_at);
    }
  }
  mailMessages.push(row);
  return row;
}
/** A seeded campaign's own clock follows its messages: approved, started, finished or paused. */
function mailSeedCampaignTimes(campaign: MailCampaignRow, finished: "completed" | "paused" | "") {
  const sent = mailMessages
    .filter((row) => row.campaign_id === campaign.id && row.sent_at)
    .map((row) => Date.parse(row.sent_at!))
    .sort((a, b) => a - b);
  if (!sent.length) return;
  const first = sent[0]!;
  const last = sent[sent.length - 1]!;
  campaign.created_at = mailIsoMs(first - 44 * 3_600_000);
  campaign.approved_at = campaign.approved_by ? mailIsoMs(first - 20 * 3_600_000) : null;
  campaign.scheduled_at = mailIsoMs(first);
  campaign.started_at = mailIsoMs(first);
  if (finished === "completed") campaign.completed_at = mailIsoMs(last + 60_000);
  if (finished === "paused") campaign.paused_at = mailIsoMs(last + 60_000);
  campaign.updated_at = mailIsoMs(last + 60_000);
}
function seedMail() {
  mailSenders.length = 0;
  mailTemplates.length = 0;
  mailVersions.length = 0;
  mailSegments.length = 0;
  mailConsent.clear();
  mailSuppressions.length = 0;
  mailCampaigns.length = 0;
  mailMessages.length = 0;
  mailSequences.length = 0;
  mailSteps.clear();
  mailEnrolments.length = 0;
  mailEvents.length = 0;
  Object.assign(mailSettings, {
    ...MAIL_SETTINGS_SEED,
    seed_addresses: [...MAIL_SETTINGS_SEED.seed_addresses],
    last_worker_at: mailHoursAgo(0.1),
  });
  mailProviderCounter = 1000;

  mailSenders.push(
    {
      id: MAIL_IDS.news,
      from_email: "news@mail.quantifyterminal.com",
      from_name: "Quantify Terminal",
      reply_to: "hello@quantifyterminal.com",
      kind: "marketing",
      staff_id: "",
      daily_cap: 100,
      verified: true,
      verified_source: "provider",
      verified_checked_at: mailHoursAgo(49),
      verification_detail:
        "news@mail.quantifyterminal.com is an active sender, and mail.quantifyterminal.com is authenticated with the provider.",
      paused_at: null,
      paused_reason: "",
      active: true,
      created_at: mailHoursAgo(24 * 40),
    },
    {
      id: MAIL_IDS.ownerSales,
      from_email: "owner@quantifyterminal.com",
      from_name: "The Owner",
      reply_to: "",
      kind: "sales",
      staff_id: OWNER_STAFF,
      daily_cap: 50,
      verified: true,
      verified_source: "manual",
      verified_checked_at: null,
      verification_detail: "",
      paused_at: null,
      paused_reason: "",
      active: true,
      created_at: mailHoursAgo(24 * 38),
    },
    {
      id: MAIL_IDS.salesSales,
      from_email: "sales@quantifyterminal.com",
      from_name: "Sales Person",
      reply_to: "",
      kind: "sales",
      staff_id: SALES_STAFF,
      daily_cap: 50,
      verified: true,
      verified_source: "manual",
      verified_checked_at: null,
      verification_detail: "",
      paused_at: null,
      paused_reason: "",
      active: true,
      created_at: mailHoursAgo(24 * 30),
    },
  );

  const templateRows: Array<[string, string, "campaign" | "sequence", number, string, number]> = [
    [MAIL_IDS.release, "Release notes", "campaign", 2, OWNER_STAFF, 24 * 20],
    [MAIL_IDS.webinar, "Webinar invitation", "campaign", 1, SALES_STAFF, 24 * 3],
    [MAIL_IDS.roadmap, "Q4 roadmap preview", "campaign", 1, OWNER_STAFF, 24 * 1],
    [MAIL_IDS.intro, "Fund intro", "sequence", 1, OWNER_STAFF, 24 * 35],
    [MAIL_IDS.bump, "Short follow-up", "sequence", 1, OWNER_STAFF, 24 * 35],
    [MAIL_IDS.last, "Last note", "sequence", 1, OWNER_STAFF, 24 * 35],
  ];
  for (const [id, name, kind, version, by, hours] of templateRows) {
    mailTemplates.push({
      id,
      name,
      kind,
      current_version: version,
      created_by: by,
      created_at: mailHoursAgo(hours),
      archived_at: null,
    });
  }
  const releaseHtml =
    '<p>Hi {{first_name | there}},</p>\n<p>October\'s release brings scenario runs on the whole book, faster screens on large universes, and exports that keep your column choices.</p>\n<p>Everything is live in the terminal today; nothing to install.</p>\n<p><a href="https://quantifyterminal.com/changelog">Read what changed</a></p>\n<p>{{sender_name}}</p>';
  mailSeedVersion(
    MAIL_IDS.release,
    1,
    "What's new for {{company | your desk}}",
    releaseHtml,
    "",
    OWNER_STAFF,
    mailHoursAgo(24 * 20),
  );
  mailSeedVersion(
    MAIL_IDS.release,
    2,
    "What's new in Quantify Terminal for {{company | your desk}}",
    releaseHtml,
    "",
    OWNER_STAFF,
    mailHoursAgo(24 * 13),
  );
  mailSeedVersion(
    MAIL_IDS.webinar,
    1,
    "Portfolio risk in the terminal — a 30-minute walkthrough",
    '<p>Hi {{first_name | there}},</p>\n<p>On 14 October we walk through how desks like {{company | yours}} run portfolio risk end to end in the terminal: factor exposures, scenarios, and the reports compliance asks for.</p>\n<p><a href="https://quantifyterminal.com/events">Save a seat</a></p>\n<p>{{sender_name}}</p>',
    "",
    SALES_STAFF,
    mailHoursAgo(24 * 3),
  );
  mailSeedVersion(
    MAIL_IDS.roadmap,
    1,
    "Where Quantify Terminal goes next",
    "<p>Hi {{first_name | there}},</p>\n<p>Three things are coming before the year ends, and we would like your view on the order.</p>\n<p>{{sender_name}}</p>",
    "",
    OWNER_STAFF,
    mailHoursAgo(24),
  );
  mailSeedVersion(
    MAIL_IDS.intro,
    1,
    "Quick question, {{first_name}}",
    "",
    "Hi {{first_name}},\n\nI run sales at Quantify Terminal. Desks like {{company | yours}} use it to move research, risk and reporting into one screen.\n\nWould it be useful to see how a fund your size sets it up?\n\n{{owner_name}}",
    OWNER_STAFF,
    mailHoursAgo(24 * 35),
  );
  mailSeedVersion(
    MAIL_IDS.bump,
    1,
    "Following up",
    "",
    "Hi {{first_name}}, bumping this in case it got buried. Worth a short call?\n\n{{owner_name}}",
    OWNER_STAFF,
    mailHoursAgo(24 * 35),
  );
  mailSeedVersion(
    MAIL_IDS.last,
    1,
    "Closing the loop",
    "",
    "Hi {{first_name}},\n\nI will stop here. If the timing is better next quarter, a one-line reply is all it takes.\n\n{{owner_name}}",
    OWNER_STAFF,
    mailHoursAgo(24 * 35),
  );

  mailSegments.push(
    {
      id: MAIL_IDS.ukCustomers,
      name: "UK customers",
      kind: "people",
      conditions: ["lifecycle:is:customer", "country:is:United Kingdom"],
      last_count: null,
      last_evaluated_at: mailHoursAgo(26),
      created_by: OWNER_STAFF,
      created_at: mailHoursAgo(24 * 21),
      archived_at: null,
    },
    {
      id: MAIL_IDS.hedgeProspects,
      name: "Hedge-fund prospects",
      kind: "people",
      conditions: ["lifecycle:is:prospect", "firm_type:is:Hedge fund"],
      last_count: null,
      last_evaluated_at: mailHoursAgo(50),
      created_by: SALES_STAFF,
      created_at: mailHoursAgo(24 * 18),
      archived_at: null,
    },
    {
      id: MAIL_IDS.newLeads,
      name: "Leads this month",
      kind: "leads",
      conditions: ["created_days:lt:30"],
      last_count: null,
      last_evaluated_at: mailHoursAgo(4),
      created_by: SALES_STAFF,
      created_at: mailHoursAgo(24 * 9),
      archived_at: null,
    },
  );
  for (const segment of mailSegments)
    segment.last_count = mailEvaluateSegment(
      segment.kind,
      mailParseConditions(segment.conditions, segment.kind).conditions,
    ).length;

  const customers = mailPeopleRecipients().filter(
    (row) => row.lifecycle === "customer" && row.email,
  );
  const prospects = mailPeopleRecipients().filter(
    (row) => row.lifecycle === "prospect" && row.email,
  );
  const campaign = (
    id: string,
    name: string,
    templateId: string,
    version: number,
    topic: string,
    audience: Record<string, unknown>,
    state: string,
    by: string,
    hoursAgo: number,
  ): MailCampaignRow => ({
    id,
    name,
    sender_id: MAIL_IDS.news,
    template_id: templateId,
    template_version: version,
    topic,
    audience,
    state,
    scheduled_at: null,
    send_anytime: false,
    dry_run: false,
    requires_approval: false,
    approved_by: "",
    approved_at: null,
    pause_reason: "",
    paused_at: null,
    counts: mailEmptyCounts(),
    started_at: null,
    completed_at: null,
    created_by: by,
    created_at: mailHoursAgo(hoursAgo),
    updated_at: mailHoursAgo(hoursAgo),
  });

  // September's release notes: sent twelve days ago to every paying customer.
  const september = campaign(
    MAIL_IDS.september,
    "September release notes",
    MAIL_IDS.release,
    1,
    "updates",
    { kind: "companies", ids: [...new Set(customers.map((row) => row.company_id))] },
    "completed",
    OWNER_STAFF,
    24 * 13,
  );
  Object.assign(september, { requires_approval: true, approved_by: ADMIN_STAFF_ID });
  mailCampaigns.push(september);
  customers.forEach((recipient, index) => {
    const outcome =
      index === 7
        ? "hard_bounce"
        : index === 19
          ? "soft_bounce"
          : index === 11 || index === 31
            ? "unsubscribe"
            : index === 4
              ? "click_unsubscribe"
              : index % 3 === 0
                ? "click"
                : "delivered";
    mailSeedHistoricMessage(
      september,
      recipient,
      mailSeedSentAt(9, mailZoneFor(recipient.country), index * 3),
      outcome,
      index,
    );
  });
  september.counts.recipients = september.counts.sent;
  september.counts.skipped = 2;
  mailSeedCampaignTimes(september, "completed");

  // October's release notes, mid-send: the news sender is warming up at 40 a day and no
  // domain gets more than three a day, so part of the list waits for the next window.
  const october = campaign(
    MAIL_IDS.october,
    "October release notes",
    MAIL_IDS.release,
    2,
    "updates",
    { kind: "segment", segment_id: MAIL_IDS.ukCustomers },
    "running",
    OWNER_STAFF,
    24 * 2,
  );
  Object.assign(october, {
    audience: { kind: "companies", ids: [...new Set(customers.map((row) => row.company_id))] },
    requires_approval: true,
    approved_by: ADMIN_STAFF_ID,
  });
  mailCampaigns.push(october);
  const octoberEligible = customers.filter(
    (row) =>
      !mailSuppressionsFor(row.email, "updates", MAIL_IDS.news).length &&
      mailConsent.get(mailNorm(row.email))?.marketing_state !== "unsubscribed",
  );
  const newsSender = mailSenders.find((row) => row.id === MAIL_IDS.news)!;
  newsSender.daily_cap = 40;
  const sentPerDay = new Map<string, number>();
  const sentPerDomain = new Map<string, number>();
  octoberEligible.forEach((recipient, index) => {
    const zone = mailZoneFor(recipient.country);
    const sentAt = mailSeedSentAt(
      mailSeedDayBack(zone, 3 * octoberEligible.length),
      zone,
      index * 3,
    );
    const day = sentAt.slice(0, 10);
    const domain = mailNorm(recipient.email).split("@")[1] ?? "";
    const capped = (sentPerDay.get(day) ?? 0) >= newsSender.daily_cap;
    const domainFull = (sentPerDomain.get(`${day}|${domain}`) ?? 0) >= MAIL_DOMAIN_DAILY_CAP;
    if (!capped && !domainFull) {
      sentPerDay.set(day, (sentPerDay.get(day) ?? 0) + 1);
      sentPerDomain.set(`${day}|${domain}`, (sentPerDomain.get(`${day}|${domain}`) ?? 0) + 1);
      const row = mailSeedHistoricMessage(
        october,
        recipient,
        sentAt,
        index % 4 === 0 ? "click" : "delivered",
        index + 1,
      );
      row.subject = `What's new in Quantify Terminal for ${recipient.company_name || "your desk"}`;
      return;
    }
    const nextDay = Date.parse(`${day}T00:00:00Z`) + 86_400_000;
    mailMessages.push({
      id: randomUUID(),
      kind: "campaign",
      campaign_id: october.id,
      enrolment_id: "",
      step_no: null,
      sender_id: october.sender_id,
      topic: "updates",
      contact_kind: recipient.contact_kind,
      contact_id: recipient.contact_id,
      company_id: recipient.company_id,
      email: recipient.email,
      email_norm: mailNorm(recipient.email),
      variables: mailVariables(recipient),
      template_id: october.template_id,
      template_version: 2,
      state: "pending",
      scheduled_at: mailIsoMs(mailNextSlotMs(Math.max(nextDay, Date.now()), zone)),
      sent_at: null,
      delivered_at: null,
      first_clicked_at: null,
      first_opened_at: null,
      bounced_at: null,
      complained_at: null,
      unsubscribed_at: null,
      provider_message_id: "",
      provider_status: "",
      subject: "",
      in_reply_to: "",
      skip_reason: "",
      last_error: capped
        ? "cap reached: sender"
        : `${MAIL_DOMAIN_DAILY_CAP} to ${domain} today already`,
      attempts: 0,
      is_seed: false,
    });
  });
  october.counts.recipients = octoberEligible.length;
  october.counts.skipped = customers.length - octoberEligible.length;
  mailSeedCampaignTimes(october, "");

  // A webinar invitation the sales person drafted, waiting for a second owner or admin.
  const webinar = campaign(
    MAIL_IDS.webinarCampaign,
    "Webinar: portfolio risk in the terminal",
    MAIL_IDS.webinar,
    1,
    "events",
    { kind: "segment", segment_id: MAIL_IDS.ukCustomers },
    "review",
    SALES_STAFF,
    20,
  );
  webinar.requires_approval = true;
  mailCampaigns.push(webinar);
  mailMessages.push({
    id: randomUUID(),
    kind: "test",
    campaign_id: "",
    enrolment_id: "",
    step_no: null,
    sender_id: MAIL_IDS.news,
    topic: "events",
    contact_kind: "staff",
    contact_id: "",
    company_id: "",
    email: "sales@hq.test",
    email_norm: "sales@hq.test",
    variables: {},
    template_id: MAIL_IDS.webinar,
    template_version: 1,
    state: "sent",
    scheduled_at: mailSeedSentAt(1, "Europe/London", 240),
    sent_at: mailSeedSentAt(1, "Europe/London", 240),
    delivered_at: null,
    first_clicked_at: null,
    first_opened_at: null,
    bounced_at: null,
    complained_at: null,
    unsubscribed_at: null,
    provider_message_id: "<mock-test-1@mail.test>",
    provider_status: "sent",
    subject: "[Test] Portfolio risk in the terminal — a 30-minute walkthrough",
    in_reply_to: "",
    skip_reason: "",
    last_error: "",
    attempts: 1,
    is_seed: false,
  });

  // A draft nobody has tested yet.
  mailCampaigns.push(
    campaign(
      MAIL_IDS.roadmapCampaign,
      "Q4 roadmap preview",
      MAIL_IDS.roadmap,
      1,
      "news",
      { kind: "segment", segment_id: MAIL_IDS.ukCustomers },
      "draft",
      OWNER_STAFF,
      6,
    ),
  );

  // A prospect newsletter that paused itself after early hard bounces.
  const newsletter = campaign(
    MAIL_IDS.prospectNewsletter,
    "Prospect newsletter — September",
    MAIL_IDS.release,
    1,
    "news",
    { kind: "segment", segment_id: MAIL_IDS.hedgeProspects },
    "auto_paused",
    SALES_STAFF,
    24 * 6,
  );
  Object.assign(newsletter, {
    approved_by: OWNER_STAFF,
    pause_reason: "3 hard bounces in the first 9 sends",
  });
  mailCampaigns.push(newsletter);
  prospects.slice(0, 12).forEach((recipient, index) => {
    if (index < 9) {
      const row = mailSeedHistoricMessage(
        newsletter,
        recipient,
        mailSeedSentAt(4, mailZoneFor(recipient.country), index * 3),
        index === 2 || index === 5 || index === 8 ? "hard_bounce" : "delivered",
        index + 1,
      );
      row.subject = "What's new for " + (recipient.company_name || "your desk");
    } else {
      mailMessages.push({
        id: randomUUID(),
        kind: "campaign",
        campaign_id: newsletter.id,
        enrolment_id: "",
        step_no: null,
        sender_id: MAIL_IDS.news,
        topic: "news",
        contact_kind: recipient.contact_kind,
        contact_id: recipient.contact_id,
        company_id: recipient.company_id,
        email: recipient.email,
        email_norm: mailNorm(recipient.email),
        variables: mailVariables(recipient),
        template_id: MAIL_IDS.release,
        template_version: 1,
        state: "held",
        scheduled_at: mailSeedSentAt(4, mailZoneFor(recipient.country), index * 3),
        sent_at: null,
        delivered_at: null,
        first_clicked_at: null,
        first_opened_at: null,
        bounced_at: null,
        complained_at: null,
        unsubscribed_at: null,
        provider_message_id: "",
        provider_status: "",
        subject: "",
        in_reply_to: "",
        skip_reason: "",
        last_error: "",
        attempts: 0,
        is_seed: false,
      });
    }
  });
  newsletter.counts.recipients = 12;
  mailSeedCampaignTimes(newsletter, "paused");

  // The sales sequence, with people at every point of it.
  mailSequences.push(
    {
      id: MAIL_IDS.fundIntro,
      name: "Fund intro — four steps",
      kind: "prospect",
      sender_id: "",
      state: "active",
      cooling_days: 90,
      recent_contact_days: 14,
      company_limit: 2,
      created_by: OWNER_STAFF,
      created_at: mailHoursAgo(24 * 34),
      updated_at: mailHoursAgo(24 * 10),
    },
    {
      id: MAIL_IDS.renewal,
      name: "Renewal check-in",
      kind: "customer",
      sender_id: MAIL_IDS.ownerSales,
      state: "draft",
      cooling_days: 180,
      recent_contact_days: 7,
      company_limit: 1,
      created_by: OWNER_STAFF,
      created_at: mailHoursAgo(24 * 2),
      updated_at: mailHoursAgo(24 * 2),
    },
  );
  mailSteps.set(MAIL_IDS.fundIntro, [
    {
      step_no: 1,
      kind: "email",
      delay_days: 0,
      template_id: MAIL_IDS.intro,
      template_version: 1,
      thread: "new",
      task_title: "",
    },
    {
      step_no: 2,
      kind: "email",
      delay_days: 3,
      template_id: MAIL_IDS.bump,
      template_version: 1,
      thread: "reply",
      task_title: "",
    },
    {
      step_no: 3,
      kind: "task",
      delay_days: 2,
      template_id: "",
      template_version: null,
      thread: "new",
      task_title: "Call them",
    },
    {
      step_no: 4,
      kind: "email",
      delay_days: 4,
      template_id: MAIL_IDS.last,
      template_version: 1,
      thread: "new",
      task_title: "",
    },
  ]);
  mailSteps.set(MAIL_IDS.renewal, [
    {
      step_no: 1,
      kind: "email",
      delay_days: 0,
      template_id: MAIL_IDS.intro,
      template_version: 1,
      thread: "new",
      task_title: "",
    },
    {
      step_no: 2,
      kind: "task",
      delay_days: 5,
      template_id: "",
      template_version: null,
      thread: "new",
      task_title: "Call about the renewal",
    },
  ]);
  const plan: Array<{
    state: MailEnrolmentRow["state"];
    step: number;
    sentHoursAgo: number | null;
    outcome?: string;
    exit?: string;
    pause?: string;
  }> = [
    { state: "active", step: 2, sentHoursAgo: 24 * 4 },
    { state: "active", step: 2, sentHoursAgo: 24 * 3 },
    { state: "active", step: 1, sentHoursAgo: 24 * 2 },
    { state: "active", step: 3, sentHoursAgo: 24 * 3 },
    { state: "active", step: 1, sentHoursAgo: null },
    { state: "paused", step: 2, sentHoursAgo: 24 * 5, pause: "COMPANY_ENGAGED" },
    {
      state: "exited",
      step: 2,
      sentHoursAgo: 24 * 8,
      outcome: "replied_positive",
      exit: "REPLIED",
    },
    {
      state: "exited",
      step: 3,
      sentHoursAgo: 24 * 12,
      outcome: "meeting_booked",
      exit: "MEETING_BOOKED",
    },
    { state: "completed", step: 4, sentHoursAgo: 24 * 16, exit: "COMPLETED" },
    { state: "exited", step: 1, sentHoursAgo: 24 * 9, outcome: "bounced", exit: "HARD_BOUNCE" },
  ];
  prospects.slice(12, 12 + plan.length).forEach((recipient, index) => {
    const entry = plan[index]!;
    const enrolment: MailEnrolmentRow = {
      id: `ea700000-0000-4000-8000-0000000000${(index + 1).toString().padStart(2, "0")}`,
      sequence_id: MAIL_IDS.fundIntro,
      contact_kind: "person",
      contact_id: recipient.contact_id,
      company_id: recipient.company_id,
      email_norm: mailNorm(recipient.email),
      owner_staff_id: index % 3 === 0 ? SALES_STAFF : OWNER_STAFF,
      sender_id: index % 3 === 0 ? MAIL_IDS.salesSales : MAIL_IDS.ownerSales,
      state: entry.state,
      current_step: entry.step,
      waiting_task_id: "",
      exit_reason: entry.exit ?? "",
      outcome: entry.outcome ?? "",
      paused_until: entry.pause ? mailAddBusinessDays(now(), 2).slice(0, 10) : null,
      pause_reason: entry.pause ?? "",
      thread_subject: `Quick question, ${mailFirstName(recipient.full_name)}`,
      thread_message_id: "",
      enrolled_at: mailHoursAgo((entry.sentHoursAgo ?? 2) + 24 * (entry.step - 1) * 3 + 1),
      enrolled_by: OWNER_STAFF,
      last_sent_at: entry.sentHoursAgo === null ? null : mailHoursAgo(entry.sentHoursAgo),
      exited_at: entry.exit ? mailHoursAgo((entry.sentHoursAgo ?? 0) - 20) : null,
    };
    mailEnrolments.push(enrolment);
    for (let step = 1; step <= entry.step; step += 1) {
      const definition = mailSteps.get(MAIL_IDS.fundIntro)![step - 1]!;
      if (definition.kind !== "email") continue;
      const isLast = step === entry.step;
      const zone = mailZoneFor(recipient.country);
      const daysBack = Math.max(
        1,
        Math.round((((entry.sentHoursAgo ?? 0) + (entry.step - step) * 72) / 24) * (5 / 7)),
      );
      const sentAt =
        entry.sentHoursAgo === null && isLast
          ? null
          : mailSeedSentAt(daysBack, zone, 30 + index * 7 + step);
      mailProviderCounter += 1;
      const providerId = `<mock-${mailProviderCounter}@mail.test>`;
      if (step === 1 && sentAt) enrolment.thread_message_id = providerId;
      const bounced = entry.exit === "HARD_BOUNCE" && isLast;
      mailMessages.push({
        id: randomUUID(),
        kind: "sequence",
        campaign_id: "",
        enrolment_id: enrolment.id,
        step_no: step,
        sender_id: enrolment.sender_id,
        topic: "sales",
        contact_kind: "person",
        contact_id: recipient.contact_id,
        company_id: recipient.company_id,
        email: recipient.email,
        email_norm: mailNorm(recipient.email),
        variables: {
          ...mailVariables(recipient),
          owner_name: mailStaffName(enrolment.owner_staff_id),
        },
        template_id: definition.template_id,
        template_version: 1,
        state: sentAt === null ? "pending" : bounced ? "hard_bounced" : "delivered",
        scheduled_at: sentAt ?? mailIsoMs(mailNextSlotMs(Date.now(), zone)),
        sent_at: sentAt,
        delivered_at: sentAt && !bounced ? sentAt : null,
        first_clicked_at: null,
        first_opened_at: null,
        bounced_at: bounced ? sentAt : null,
        complained_at: null,
        unsubscribed_at: null,
        provider_message_id: sentAt ? providerId : "",
        provider_status: sentAt ? (bounced ? "hard_bounce" : "delivered") : "",
        subject: sentAt
          ? step === 1
            ? enrolment.thread_subject
            : definition.thread === "reply"
              ? `Re: ${enrolment.thread_subject}`
              : step === 4
                ? "Closing the loop"
                : "Following up"
          : "",
        in_reply_to: definition.thread === "reply" ? enrolment.thread_message_id : "",
        skip_reason: "",
        last_error: "",
        attempts: sentAt ? 1 : 0,
        is_seed: false,
      });
      if (bounced && sentAt)
        mailSuppress(
          mailNorm(recipient.email),
          "hard_bounce",
          "webhook:brevo",
          "550 5.1.1 user unknown",
          "",
          mailIsoMs(Date.parse(sentAt) + 120_000),
        );
    }
    const sentTimes = mailMessages
      .filter((row) => row.enrolment_id === enrolment.id && row.sent_at)
      .map((row) => Date.parse(row.sent_at!))
      .sort((a, b) => a - b);
    const firstSent = sentTimes[0];
    const lastSent = sentTimes[sentTimes.length - 1];
    enrolment.enrolled_at = mailIsoMs((firstSent ?? Date.now() - 2 * 3_600_000) - 3_600_000);
    enrolment.last_sent_at = lastSent === undefined ? null : mailIsoMs(lastSent);
    enrolment.exited_at =
      entry.exit && lastSent !== undefined
        ? mailIsoMs(Math.min(lastSent + 20 * 3_600_000, Date.now() - 3_600_000))
        : null;
    if (entry.state === "active" && lastSent !== undefined) {
      const steps = mailSteps.get(MAIL_IDS.fundIntro)!;
      const current = steps[entry.step - 1]!;
      const next = current.kind === "task" ? current : steps[entry.step];
      if (next) mailStageStep(enrolment, next, mailIsoMs(lastSent));
      const task = tasks.find((row) => row.id === enrolment.waiting_task_id);
      if (task) task.created_at = mailIsoMs(lastSent);
    }
  });

  // By hand, and consent recorded with its basis.
  mailSuppress(
    "former.analyst@example-fund.com",
    "manual",
    `admin:${OWNER_STAFF}`,
    "Left the fund; the firm asked us to remove the address",
    OWNER_STAFF,
  );
  const firstCustomer = customers[2];
  if (firstCustomer) {
    mailConsent.set(mailNorm(firstCustomer.email), {
      email_norm: mailNorm(firstCustomer.email),
      marketing_state: "subscribed",
      topics_off: ["events"],
      sales_stop: false,
      lawful_basis: "consent",
      source: "early_access_form",
      timezone: "Europe/London",
      updated_at: mailHoursAgo(24 * 30),
    });
  }
  seedMailLists();
}

// -- mailing lists (mirrors account_api/hq/mail_lists.py) -------------------------------------
type MailListRow = {
  id: string;
  name: string;
  description: string;
  columns: string[];
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
};
type MailListMemberRow = {
  id: string;
  list_id: string;
  email: string;
  email_norm: string;
  first_name: string;
  last_name: string;
  company: string;
  title: string;
  country: string;
  fields: Record<string, string>;
  person_id: string;
  source: "csv" | "manual" | "crm";
  basis: "consent" | "legitimate_interest";
  added_by: string;
  added_at: string;
  updated_at: string;
};
const mailLists: MailListRow[] = [];
const mailListMembers: MailListMemberRow[] = [];
const MAIL_LIST_MAX = 20_000;
const MAIL_LIST_IMPORT_MAX = 5_000;
const MAIL_LIST_COLUMNS_MAX = 20;
const MAIL_LIST_STANDARD = ["email", "first_name", "last_name", "company", "title", "country"];

function mailColumnKey(raw: unknown): string {
  let text = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  if (/^[0-9]/.test(text)) text = `c_${text}`;
  return text;
}
function mailListCleanRow(raw: Record<string, unknown>) {
  const email = String(raw.email ?? "")
    .trim()
    .slice(0, 254);
  const norm = mailNorm(email);
  if (!norm) return { reason: "NO_EMAIL" as const };
  if (!mailValidEmail(norm)) return { reason: "INVALID_EMAIL" as const };
  let first = String(raw.first_name ?? "").trim();
  let last = String(raw.last_name ?? "").trim();
  if (!first && !last) {
    const parts = String(raw.full_name ?? raw.name ?? "")
      .trim()
      .split(/\s+/)
      .filter(Boolean);
    first = parts[0] ?? "";
    last = parts.slice(1).join(" ");
  }
  const fields: Record<string, string> = {};
  const extra = raw.fields;
  if (extra && typeof extra === "object") {
    for (const [key, value] of Object.entries(extra as Record<string, unknown>)) {
      const clean = mailColumnKey(key);
      const text = String(value ?? "")
        .trim()
        .slice(0, 500);
      if (
        clean &&
        !MAIL_LIST_STANDARD.includes(clean) &&
        clean !== "full_name" &&
        clean !== "name" &&
        text
      )
        fields[clean] = text;
    }
  }
  return {
    member: {
      email,
      email_norm: norm,
      first_name: first.slice(0, 80),
      last_name: last.slice(0, 80),
      company: String(raw.company ?? raw.company_name ?? "")
        .trim()
        .slice(0, 200),
      title: String(raw.title ?? "")
        .trim()
        .slice(0, 120),
      country: String(raw.country ?? "")
        .trim()
        .slice(0, 60),
      fields,
    },
  };
}
function mailPersonByEmail(norm: string): PersonRow | undefined {
  return people.find((row) => !row.archived && mailNorm(row.email) === norm);
}
function mailListAdd(
  listRow: MailListRow,
  rows: Array<Record<string, unknown>>,
  source: MailListMemberRow["source"],
  basis: MailListMemberRow["basis"],
  updateExisting: boolean,
  actorId: string,
) {
  const existing = new Map(
    mailListMembers.filter((row) => row.list_id === listRow.id).map((row) => [row.email_norm, row]),
  );
  const columnsAdded: string[] = [];
  const columnsDropped: string[] = [];
  const seen = new Set<string>();
  const skipped: Array<{ row: number; email: string; reason: string }> = [];
  let skippedCount = 0;
  let added = 0;
  let updated = 0;
  let unchanged = 0;
  let room = MAIL_LIST_MAX - existing.size;
  const newlyAdded: MailListMemberRow[] = [];
  const skip = (row: number, email: string, reason: string) => {
    skippedCount += 1;
    if (skipped.length < 200) skipped.push({ row, email: email.slice(0, 254), reason });
  };
  rows.forEach((raw, index) => {
    const rowNo = index + 1;
    const cleaned = mailListCleanRow(raw);
    if (!("member" in cleaned)) {
      skip(rowNo, String(raw.email ?? ""), cleaned.reason);
      return;
    }
    const member = cleaned.member;
    if (seen.has(member.email_norm)) {
      skip(rowNo, member.email, "DUPLICATE_IN_FILE");
      return;
    }
    seen.add(member.email_norm);
    for (const key of Object.keys(member.fields)) {
      if (listRow.columns.includes(key)) continue;
      if (listRow.columns.length < MAIL_LIST_COLUMNS_MAX) {
        listRow.columns.push(key);
        columnsAdded.push(key);
      } else {
        delete member.fields[key];
        if (!columnsDropped.includes(key)) columnsDropped.push(key);
      }
    }
    const person = mailPersonByEmail(member.email_norm);
    const current = existing.get(member.email_norm);
    if (current) {
      if (!updateExisting) {
        unchanged += 1;
        return;
      }
      let changed = false;
      for (const name of [
        "email",
        "first_name",
        "last_name",
        "company",
        "title",
        "country",
      ] as const) {
        if (member[name] && member[name] !== current[name]) {
          current[name] = member[name];
          changed = true;
        }
      }
      const merged = { ...current.fields, ...member.fields };
      if (JSON.stringify(merged) !== JSON.stringify(current.fields)) {
        current.fields = merged;
        changed = true;
      }
      if (person && current.person_id !== person.id) {
        current.person_id = person.id;
        changed = true;
      }
      if (changed) {
        current.updated_at = now();
        updated += 1;
      } else unchanged += 1;
      return;
    }
    if (room <= 0) {
      skip(rowNo, member.email, "LIST_FULL");
      return;
    }
    room -= 1;
    const row: MailListMemberRow = {
      id: randomUUID(),
      list_id: listRow.id,
      ...member,
      person_id: person?.id ?? "",
      source,
      basis,
      added_by: actorId,
      added_at: now(),
      updated_at: now(),
    };
    mailListMembers.push(row);
    newlyAdded.push(row);
    existing.set(row.email_norm, row);
    added += 1;
  });
  listRow.updated_at = now();
  let consentRecorded = 0;
  if (basis === "consent") {
    for (const row of newlyAdded) {
      if (mailConsent.has(row.email_norm)) continue;
      mailConsent.set(row.email_norm, {
        email_norm: row.email_norm,
        marketing_state: "subscribed",
        topics_off: [],
        sales_stop: false,
        lawful_basis: "consent",
        source: `list:${listRow.name}`.slice(0, 60),
        timezone: "",
        updated_at: now(),
      });
      consentRecorded += 1;
    }
  }
  return {
    added,
    updated,
    unchanged,
    skipped,
    skipped_count: skippedCount,
    consent_recorded: consentRecorded,
    columns_added: columnsAdded,
    columns_dropped: columnsDropped,
    rows: rows.length,
  };
}
function mailListRecipients(listId: string): MailRecipient[] {
  return mailListMembers
    .filter((row) => row.list_id === listId)
    .map((member) => {
      const full = [member.first_name, member.last_name].filter(Boolean).join(" ");
      const person =
        people.find((row) => row.id === member.person_id && !row.archived) ??
        mailPersonByEmail(member.email_norm);
      const recipient: MailRecipient = person
        ? mailPersonRecipient(person)
        : {
            contact_kind: "list",
            contact_id: member.id,
            company_id: "",
            email: member.email,
            full_name: full,
            title: member.title,
            company_name: member.company,
            country: member.country,
            lifecycle: "",
            do_not_contact: false,
            owner_staff_id: "",
            source: "",
            stage: "",
            created_at: null,
            domain: "",
            role_category: "",
            firm_type: "",
            customer_since: null,
          };
      if (person) {
        recipient.full_name = recipient.full_name || full;
        recipient.title = recipient.title || member.title;
        recipient.company_name = recipient.company_name || member.company;
        recipient.country = recipient.country || member.country;
      }
      recipient.custom = { ...member.fields };
      return recipient;
    });
}
function mailListStatuses(listId: string): Map<string, MailVerdict> {
  const members = mailListMembers.filter((row) => row.list_id === listId);
  const decided = mailDecide(mailListRecipients(listId), "updates", "", []);
  return new Map(members.map((member, index) => [member.id, decided[index]!.verdict]));
}
function mailListView(row: MailListRow) {
  return {
    list_id: row.id,
    name: row.name,
    description: row.description,
    columns: [...row.columns],
    members: mailListMembers.filter((member) => member.list_id === row.id).length,
    created_by: row.created_by ? mailPerson(row.created_by) : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
    archived_at: row.archived_at,
  };
}
function mailListMemberView(row: MailListMemberRow, verdict: MailVerdict | undefined) {
  return {
    member_id: row.id,
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    full_name: [row.first_name, row.last_name].filter(Boolean).join(" "),
    company: row.company,
    title: row.title,
    country: row.country,
    fields: { ...row.fields },
    person_id: row.person_id || null,
    person_name: people.find((person) => person.id === row.person_id)?.full_name ?? "",
    source: row.source,
    basis: row.basis,
    added_at: row.added_at,
    status: !verdict || verdict.allowed ? "ok" : verdict.reason,
    status_detail: !verdict || verdict.allowed ? "" : verdict.detail,
  };
}
function mailCampaignsUsingList(listId: string, states: readonly string[]) {
  return mailCampaigns.filter(
    (row) =>
      states.includes(row.state) &&
      row.audience.kind === "list" &&
      String(row.audience.list_id ?? "") === listId,
  );
}
/** A made-up contact has no list columns: show where each would go, as [column]. */
function mailCustomPlaceholders(variables: Record<string, string>, version: MailVersionRow) {
  for (const part of [version.subject, version.body_html, version.body_text]) {
    for (const match of (part ?? "").matchAll(MAIL_TOKEN)) {
      const name = match[1]!;
      if (name.startsWith(MAIL_CUSTOM) && !String(variables[name] ?? "").trim())
        variables[name] = `[${name.slice(MAIL_CUSTOM.length)}]`;
    }
  }
}
const MAIL_LIST_IDS = {
  webinar: "ea800000-0000-4000-8000-000000000001",
  berlin: "ea800000-0000-4000-8000-000000000002",
  followUpTemplate: "ea200000-0000-4000-8000-000000000007",
  followUpCampaign: "ea400000-0000-4000-8000-000000000006",
};
/** Two demo lists: a webinar's sign-ups (from a CSV, with its own columns) and a conference's contacts. */
function seedMailLists() {
  mailLists.length = 0;
  mailListMembers.length = 0;
  const invented = [
    ["Hannah", "Okafor"],
    ["Tom", "Whitfield"],
    ["Priya", "Raman"],
    ["Lukas", "Brandt"],
    ["Sofia", "Marchetti"],
    ["James", "Holloway"],
    ["Mei", "Tanaka"],
    ["Oliver", "Grant"],
  ] as const;
  const firms = companies.filter((row) => !row.archived && row.domain);
  const customersWithPeople = mailPeopleRecipients().filter(
    (row) => row.lifecycle === "customer" && row.email,
  );
  const prospectsWithPeople = mailPeopleRecipients().filter(
    (row) => row.lifecycle === "prospect" && row.email,
  );
  const unsubscribed = customersWithPeople.find(
    (row) => mailConsent.get(mailNorm(row.email))?.marketing_state === "unsubscribed",
  );
  const webinar: MailListRow = {
    id: MAIL_LIST_IDS.webinar,
    name: "Webinar sign-ups — portfolio risk",
    description: "Registered for the 14 October walkthrough, from the registration form's CSV.",
    columns: [],
    created_by: SALES_STAFF,
    created_at: mailHoursAgo(24 * 3),
    updated_at: mailHoursAgo(24 * 3),
    archived_at: null,
  };
  mailLists.push(webinar);
  const sizes = ["$2.1bn", "$640m", "$12bn", "$380m", "$5.4bn", "$1.2bn", "$900m", "$27bn"];
  const regions = ["EMEA", "Americas", "APAC", "EMEA", "EMEA", "Americas", "APAC", "EMEA"];
  const questions = [
    "How do scenario runs handle FX exposure?",
    "Can risk reports go straight to our compliance team?",
    "Does the factor model cover Asian small caps?",
    "",
    "How long does onboarding take for a 12-person desk?",
    "Can we bring our own benchmarks?",
    "",
    "Is there an API for the risk numbers?",
  ];
  const webinarRows: Array<Record<string, unknown>> = [
    ...customersWithPeople.slice(0, 5).map((row, index) => ({
      email: row.email,
      full_name: row.full_name,
      company: row.company_name,
      fields: { "Fund size": sizes[index], Region: regions[index], Question: questions[index] },
    })),
    ...invented.slice(0, 5).map(([first, last], index) => {
      const firm = firms[(index * 7 + 3) % firms.length]!;
      return {
        email: `${first.toLowerCase()}.${last.toLowerCase()}@${firm.domain}`,
        first_name: first,
        last_name: last,
        company: firm.name,
        country: firm.country,
        fields: {
          "Fund size": sizes[(index + 5) % sizes.length],
          Region: regions[(index + 5) % regions.length],
          Question: questions[(index + 5) % questions.length],
        },
      };
    }),
    ...(unsubscribed
      ? [
          {
            email: unsubscribed.email,
            full_name: unsubscribed.full_name,
            company: unsubscribed.company_name,
            fields: { Region: "EMEA" },
          },
        ]
      : []),
  ];
  mailListAdd(webinar, webinarRows, "csv", "consent", false, SALES_STAFF);
  const berlin: MailListRow = {
    id: MAIL_LIST_IDS.berlin,
    name: "SuperReturn Berlin — met at the stand",
    description:
      "Business cards and badge scans from the conference, added by hand and from the CRM.",
    columns: [],
    created_by: OWNER_STAFF,
    created_at: mailHoursAgo(24 * 9),
    updated_at: mailHoursAgo(24 * 8),
    archived_at: null,
  };
  mailLists.push(berlin);
  mailListAdd(
    berlin,
    prospectsWithPeople.slice(0, 6).map((row) => ({
      email: row.email,
      full_name: row.full_name,
      company: row.company_name,
      title: row.title,
      country: row.country,
    })),
    "crm",
    "legitimate_interest",
    false,
    OWNER_STAFF,
  );
  const germanFirm = firms.find((row) => row.country === "Germany") ?? firms[0]!;
  mailListAdd(
    berlin,
    invented.slice(5).map(([first, last], index) => ({
      email: `${first.toLowerCase()}.${last.toLowerCase()}@${(index === 0 ? germanFirm : firms[(index * 11 + 5) % firms.length]!).domain}`,
      first_name: first,
      last_name: last,
      company: (index === 0 ? germanFirm : firms[(index * 11 + 5) % firms.length]!).name,
      country: index === 0 ? "Germany" : "",
      fields: {
        "Met by": index === 1 ? "Sales Person" : "The Owner",
        Interest: index === 2 ? "Risk" : "Research",
      },
    })),
    "manual",
    "legitimate_interest",
    false,
    OWNER_STAFF,
  );
  // Spread the join dates over the days the lists were built.
  mailListMembers.forEach((row, index) => {
    const base = row.list_id === MAIL_LIST_IDS.webinar ? 24 * 3 : 24 * 8.5;
    row.added_at = mailHoursAgo(base - index * 0.3);
    row.updated_at = row.added_at;
  });
  // A draft follow-up to the webinar list that uses its columns.
  mailTemplates.push({
    id: MAIL_LIST_IDS.followUpTemplate,
    name: "Webinar follow-up",
    kind: "campaign",
    current_version: 1,
    created_by: SALES_STAFF,
    created_at: mailHoursAgo(20),
    archived_at: null,
  });
  mailSeedVersion(
    MAIL_LIST_IDS.followUpTemplate,
    1,
    "Your question from the walkthrough",
    "<p>Hi {{first_name | there}},</p>\n<p>Thanks for joining the portfolio-risk walkthrough. You asked: <em>{{custom.question | how the terminal fits your desk}}</em></p>\n<p>For a {{custom.fund_size | fund}} book in {{custom.region | your region}}, the short answer is in the recording, and I am happy to show it on your own positions.</p>\n<p>{{sender_name}}</p>",
    "",
    SALES_STAFF,
    mailHoursAgo(20),
  );
  mailCampaigns.push({
    id: MAIL_LIST_IDS.followUpCampaign,
    name: "Webinar follow-up",
    sender_id: MAIL_IDS.news,
    template_id: MAIL_LIST_IDS.followUpTemplate,
    template_version: 1,
    topic: "events",
    audience: { kind: "list", list_id: MAIL_LIST_IDS.webinar },
    state: "draft",
    scheduled_at: null,
    send_anytime: false,
    dry_run: false,
    requires_approval: false,
    approved_by: "",
    approved_at: null,
    pause_reason: "",
    paused_at: null,
    counts: mailEmptyCounts(),
    started_at: null,
    completed_at: null,
    created_by: SALES_STAFF,
    created_at: mailHoursAgo(19),
    updated_at: mailHoursAgo(19),
  });
}

function mailCampaignFields(
  body: Record<string, unknown>,
  existing: MailCampaignRow | undefined,
):
  | {
      fields: Pick<
        MailCampaignRow,
        | "name"
        | "sender_id"
        | "template_id"
        | "template_version"
        | "topic"
        | "audience"
        | "send_anytime"
        | "dry_run"
      >;
    }
  | { error: { status: number; body: unknown } } {
  const name = String(body.name ?? existing?.name ?? "")
    .trim()
    .slice(0, 160);
  if (!name) return { error: refuse(400, "malformed_request", { name: "name it" }) };
  const senderId = String(body.sender_id ?? existing?.sender_id ?? "");
  if (!mailSenders.some((row) => row.id === senderId && row.active))
    return { error: refuse(400, "malformed_request", { sender_id: "an active sender" }) };
  const templateId = String(body.template_id ?? existing?.template_id ?? "");
  const template = mailTemplates.find((row) => row.id === templateId);
  if (!template || template.archived_at || template.kind !== "campaign")
    return { error: refuse(400, "malformed_request", { template_id: "a live campaign template" }) };
  const topic = String(body.topic ?? existing?.topic ?? "updates");
  if (!MAIL_MARKETING_TOPICS.includes(topic))
    return {
      error: refuse(400, "malformed_request", {
        topic: `one of ${MAIL_MARKETING_TOPICS.join(", ")}`,
      }),
    };
  let audience = existing?.audience ?? {};
  if ("audience" in body || !existing) {
    const raw = (body.audience ?? {}) as Record<string, unknown>;
    const kind = String(raw.kind ?? "");
    if (["people", "leads", "companies"].includes(kind)) {
      const ids = Array.isArray(raw.ids) ? raw.ids.map(String).filter(Boolean) : [];
      if (!ids.length)
        return { error: refuse(400, "malformed_request", { audience: "choose at least one" }) };
      audience = { kind, ids: ids.slice(0, 5000) };
    } else if (kind === "segment") {
      const segmentId = String(raw.segment_id ?? "");
      if (!mailSegments.some((row) => row.id === segmentId))
        return { error: refuse(400, "malformed_request", { audience: "unknown segment" }) };
      audience = { kind, segment_id: segmentId };
    } else if (kind === "csv") {
      const rows = Array.isArray(raw.rows) ? raw.rows : [];
      if (!rows.length)
        return { error: refuse(400, "malformed_request", { audience: "the CSV has no rows" }) };
      if (rows.length > 2000)
        return { error: refuse(400, "malformed_request", { audience: "at most 2000 rows" }) };
      audience = { kind, rows, label: String(raw.label ?? "").slice(0, 120) };
    } else if (kind === "list") {
      const listRow = mailLists.find((row) => row.id === String(raw.list_id ?? ""));
      if (!listRow)
        return { error: refuse(400, "malformed_request", { audience: "unknown list" }) };
      if (listRow.archived_at)
        return { error: refuse(400, "malformed_request", { audience: "that list is archived" }) };
      audience = { kind, list_id: listRow.id };
    } else {
      return {
        error: refuse(400, "malformed_request", {
          audience: "kind is people, leads, companies, segment, csv or list",
        }),
      };
    }
  }
  return {
    fields: {
      name,
      sender_id: senderId,
      template_id: templateId,
      template_version: template.current_version,
      topic,
      audience,
      send_anytime: Boolean(body.send_anytime ?? existing?.send_anytime ?? false),
      dry_run: Boolean(body.dry_run ?? existing?.dry_run ?? false),
    },
  };
}
/** The mock's stop tokens are `mock-<message id>`; the service's are signed. */
function mailMessageForToken(token: string): MailMessageRow | undefined {
  const id = token.startsWith("mock-") ? token.slice(5) : "";
  return id ? mailMessages.find((row) => row.id === id) : undefined;
}
function mailUnsubscribeView(message: MailMessageRow) {
  const consent = mailConsent.get(message.email_norm);
  const sales = message.topic === "sales";
  return {
    email: mailMask(message.email_norm),
    kind: sales ? "sales" : "marketing",
    topic: message.topic,
    topic_label: MAIL_TOPICS[message.topic] ?? "",
    marketing_state: consent?.marketing_state ?? "unknown",
    sales_stop: consent?.sales_stop ?? false,
    topics: MAIL_MARKETING_TOPICS.map((key) => ({
      key,
      label: MAIL_TOPICS[key]!,
      off:
        Boolean(consent?.topics_off.includes(key)) || consent?.marketing_state === "unsubscribed",
    })),
  };
}

/** pause / resume / cancel share one handler, as the service's three routes share one module. */
function mailCampaignControl(op: "pause" | "resume" | "cancel"): Handler {
  return ({ headers, params, body }) => {
    const found = caller(headers)!;
    const row = mailCampaigns.find((candidate) => candidate.id === params.campaign_id);
    if (!row) return refuse(404, "not_found");
    const note = String(body.note ?? "")
      .trim()
      .slice(0, 400);
    if (op === "pause") {
      if (!["scheduled", "running"].includes(row.state))
        return refuse(400, "malformed_request", { state: `${row.state} cannot pause` });
      let held = 0;
      for (const message of mailMessages)
        if (message.campaign_id === row.id && ["pending", "retry"].includes(message.state)) {
          message.state = "held";
          held += 1;
        }
      Object.assign(row, {
        state: "paused",
        pause_reason: note || "paused by hand",
        paused_at: now(),
        updated_at: now(),
      });
      audit("mail.campaign_paused", found.member.id, "mail_campaign", row.id, note, { held });
      return ok({ state: row.state, held });
    }
    if (op === "resume") {
      if (!["paused", "auto_paused"].includes(row.state))
        return refuse(400, "malformed_request", { state: `${row.state} is not paused` });
      let released = 0;
      for (const message of mailMessages)
        if (message.campaign_id === row.id && message.state === "held") {
          message.state = "pending";
          released += 1;
        }
      Object.assign(row, {
        state: "running",
        pause_reason: "",
        paused_at: null,
        updated_at: now(),
      });
      audit("mail.campaign_resumed", found.member.id, "mail_campaign", row.id, note, { released });
      mailRunWorker();
      return ok({ state: row.state, released });
    }
    if (["completed", "cancelled"].includes(row.state))
      return refuse(400, "malformed_request", { state: `already ${row.state}` });
    let cancelled = 0;
    for (const message of mailMessages)
      if (message.campaign_id === row.id && ["pending", "retry", "held"].includes(message.state)) {
        message.state = "cancelled";
        message.skip_reason = "CAMPAIGN_CANCELLED";
        cancelled += 1;
      }
    Object.assign(row, {
      state: "cancelled",
      pause_reason: note,
      completed_at: now(),
      updated_at: now(),
    });
    audit("mail.campaign_cancelled", found.member.id, "mail_campaign", row.id, note, { cancelled });
    return ok({ state: row.state, cancelled });
  };
}

routes.push(
  // --- outbound mail -------------------------------------------------------------------------
  {
    method: "GET",
    pattern: "hq/mail/overview",
    auth: true,
    capability: "crm:read",
    handler: ({ headers }) => {
      const found = caller(headers)!;
      const mayAll = (CAPABILITIES[found.member.role] ?? []).includes("mail:send");
      const byState = (state: string) => mailCampaigns.filter((row) => row.state === state).length;
      const live = mailEnrolments.filter((row) => row.state === "active" || row.state === "paused");
      const awaiting = live.filter(
        (row) =>
          mailEnrolmentView(row).awaiting_reply &&
          (mayAll || row.owner_staff_id === found.member.id),
      ).length;
      const week = Date.now() - 7 * 86_400_000;
      return ok({
        sending_enabled: mailSettings.sending_enabled,
        paused_reason: mailSettings.sending_enabled ? "" : mailSettings.paused_reason,
        last_worker_at: mailSettings.last_worker_at || null,
        campaigns: {
          running: byState("running"),
          scheduled: byState("scheduled"),
          review: byState("review"),
          approved: byState("approved"),
          auto_paused: byState("auto_paused") + byState("paused"),
          draft: byState("draft"),
        },
        sequences: {
          active_enrolments: live.filter((row) => row.state === "active").length,
          paused_enrolments: live.filter((row) => row.state === "paused").length,
          awaiting_reply: awaiting,
        },
        today: {
          sent: mailSentToday(),
          global_cap: mailSettings.global_daily_cap,
          hour_sent: mailSentThisHour(),
          hourly_cap: mailSettings.hourly_cap,
        },
        suppressions_7d: mailSuppressions.filter(
          (row) => !row.released_at && Date.parse(row.created_at) >= week,
        ).length,
        health_30d: mailTotals(Date.now() - 30 * 86_400_000),
        senders: mailSenders.map(mailSenderView),
        postal_address_set: Boolean(mailSettings.postal_address),
        webhook_configured: mailSettings.webhook_configured,
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/senders",
    auth: true,
    capability: "crm:read",
    handler: () =>
      ok({
        senders: mailSenders.map(mailSenderView),
        default_from_email: "support@quantifyterminal.com",
        default_from_name: "Quantify Terminal",
      }),
  },
  {
    method: "POST",
    pattern: "hq/mail/senders/save",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const senderId = String(body.sender_id ?? "");
      const existing = senderId ? mailSenders.find((row) => row.id === senderId) : undefined;
      if (senderId && !existing) return refuse(404, "not_found");
      const fromEmail = mailNorm(body.from_email ?? existing?.from_email);
      if (!mailValidEmail(fromEmail))
        return refuse(400, "malformed_request", { from_email: "a valid address" });
      const kind = String(body.kind ?? existing?.kind ?? "marketing");
      if (kind !== "marketing" && kind !== "sales")
        return refuse(400, "malformed_request", { kind: "marketing or sales" });
      const staffId = String(body.staff_id ?? existing?.staff_id ?? "") || "";
      if (kind === "sales" && !staffId)
        return refuse(400, "malformed_request", {
          staff_id: "a sales identity belongs to a person",
        });
      const cap = body.daily_cap ?? existing?.daily_cap ?? 50;
      if (typeof cap !== "number" || !Number.isInteger(cap) || cap < 1 || cap > 10_000)
        return refuse(400, "malformed_request", { daily_cap: "1 to 10000" });
      if (mailSenders.some((row) => row.from_email === fromEmail && row.id !== senderId))
        return refuse(400, "malformed_request", { from_email: "already a sender" });
      const fields = {
        from_email: fromEmail,
        from_name: String(body.from_name ?? existing?.from_name ?? "")
          .trim()
          .slice(0, 120),
        reply_to: mailNorm(body.reply_to ?? existing?.reply_to ?? ""),
        kind: kind as MailSenderRow["kind"],
        staff_id: staffId,
        daily_cap: cap,
        verified: Boolean(body.verified ?? existing?.verified ?? false),
        active: Boolean(body.active ?? existing?.active ?? true),
      };
      let row = existing;
      if (row) Object.assign(row, fields);
      else {
        row = {
          id: randomUUID(),
          created_at: now(),
          verified_source: "manual",
          verified_checked_at: null,
          verification_detail: "",
          paused_at: null,
          paused_reason: "",
          ...fields,
        };
        mailSenders.push(row);
      }
      audit("mail.sender_saved", found.member.id, "mail_sender", row.id, "", {
        from_email: fromEmail,
        verified: fields.verified,
      });
      return ok({ sender: mailSenderView(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/senders/{sender_id}/check",
    auth: true,
    capability: "hq:admin",
    handler: ({ headers, params }) => {
      const row = mailSenders.find((candidate) => candidate.id === params.sender_id);
      if (!row) return refuse(404, "not_found");
      const check = mailSenderCheck(row.from_email);
      Object.assign(row, {
        verified: check.verified,
        verified_source: "provider",
        verified_checked_at: now(),
        verification_detail: check.detail,
      });
      audit("mail.sender_checked", caller(headers)!.member.id, "mail_sender", row.id, "", {
        status: "ok",
        verified: check.verified,
      });
      return ok({
        sender: mailSenderView(row),
        check: { status: "ok", verified: check.verified, detail: check.detail },
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/senders/{sender_id}/pause",
    auth: true,
    capability: "mail:send",
    handler: ({ headers, params, body }) => {
      const row = mailSenders.find((candidate) => candidate.id === params.sender_id);
      if (!row) return refuse(404, "not_found");
      const note = String(body.note ?? "")
        .trim()
        .slice(0, 200);
      if (body.resume) {
        if (!row.paused_at)
          return refuse(400, "malformed_request", { state: "this sender is not paused" });
        Object.assign(row, { paused_at: null, paused_reason: "" });
        let released = 0;
        for (const message of mailMessages)
          if (
            message.sender_id === row.id &&
            message.state === "held" &&
            message.last_error === "SENDER_PAUSED"
          ) {
            Object.assign(message, { state: "pending", last_error: "" });
            released += 1;
          }
        audit("mail.sender_resumed", caller(headers)!.member.id, "mail_sender", row.id, note, {
          released,
        });
        return ok({ sender: mailSenderView(row), released });
      }
      if (row.paused_at) return refuse(400, "malformed_request", { state: "already paused" });
      Object.assign(row, { paused_at: now(), paused_reason: note || "paused by hand" });
      audit("mail.sender_paused", caller(headers)!.member.id, "mail_sender", row.id, note, {});
      return ok({ sender: mailSenderView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/templates",
    auth: true,
    capability: "crm:read",
    handler: () =>
      ok({
        templates: [...mailTemplates]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(mailTemplateView),
        variables: MAIL_KNOWN_VARS,
      }),
  },
  {
    method: "POST",
    pattern: "hq/mail/templates/save",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const templateId = String(body.template_id ?? "");
      const existing = templateId ? mailTemplates.find((row) => row.id === templateId) : undefined;
      if (templateId && !existing) return refuse(404, "not_found");
      const name = String(body.name ?? existing?.name ?? "")
        .trim()
        .slice(0, 120);
      if (!name) return refuse(400, "malformed_request", { name: "name it" });
      const kind = String(body.kind ?? existing?.kind ?? "campaign");
      if (kind !== "campaign" && kind !== "sequence")
        return refuse(400, "malformed_request", { kind: "campaign or sequence" });
      const subject = String(body.subject ?? "")
        .trim()
        .slice(0, 400);
      const bodyHtml = String(body.body_html ?? "");
      const bodyText = String(body.body_text ?? "");
      if (!subject) return refuse(400, "malformed_request", { subject: "a subject line" });
      if (kind === "sequence" && !bodyText)
        return refuse(400, "malformed_request", { body_text: "a sequence template is plain text" });
      if (!bodyHtml && !bodyText)
        return refuse(400, "malformed_request", { body_html: "write the message" });
      const { unknown } = mailAnalyse(subject, bodyHtml, bodyText);
      if (unknown.length)
        return refuse(400, "malformed_request", {
          tokens: `unknown: ${unknown.join(", ")}; known: ${MAIL_KNOWN_VARS.join(", ")}`,
        });
      if (
        mailTemplates.some(
          (row) => row.name.toLowerCase() === name.toLowerCase() && row.id !== templateId,
        )
      )
        return refuse(400, "malformed_request", { name: "another template has this name" });
      let row = existing;
      if (row) {
        row.name = name;
        row.current_version += 1;
      } else {
        row = {
          id: randomUUID(),
          name,
          kind: kind as MailTemplateRow["kind"],
          current_version: 1,
          created_by: found.member.id,
          created_at: now(),
          archived_at: null,
        };
        mailTemplates.push(row);
      }
      mailSeedVersion(
        row.id,
        row.current_version,
        subject,
        bodyHtml,
        bodyText,
        found.member.id,
        now(),
      );
      audit("mail.template_saved", found.member.id, "mail_template", row.id, "", {
        name,
        version: row.current_version,
      });
      return ok({ template: mailTemplateView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/templates/{template_id}",
    auth: true,
    capability: "crm:read",
    handler: ({ params }) => {
      const row = mailTemplates.find((candidate) => candidate.id === params.template_id);
      if (!row) return refuse(404, "not_found");
      return ok({
        template: mailTemplateView(row),
        versions: mailVersions
          .filter((version) => version.template_id === row.id)
          .sort((a, b) => b.version - a.version)
          .map((version) => ({
            version: version.version,
            subject: version.subject,
            created_at: version.created_at,
            created_by: mailPerson(version.created_by),
            content_hash: version.content_hash,
          })),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/templates/{template_id}/preview",
    auth: true,
    capability: "crm:read",
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = mailTemplates.find((candidate) => candidate.id === params.template_id);
      if (!row) return refuse(404, "not_found");
      const version = mailVersionOf(
        row.id,
        typeof body.version === "number" ? body.version : undefined,
      );
      if (!version) return refuse(404, "not_found");
      const kind = String(body.contact_kind ?? "");
      const contactId = String(body.contact_id ?? "");
      const person =
        kind === "person" ? people.find((candidate) => candidate.id === contactId) : undefined;
      const lead =
        kind === "lead" ? leads.find((candidate) => candidate.id === contactId) : undefined;
      const firstMember = body.list_id ? mailListRecipients(String(body.list_id))[0] : undefined;
      const variables: Record<string, string> = person
        ? mailVariables(mailPersonRecipient(person))
        : lead
          ? mailVariables(mailLeadRecipient(lead))
          : firstMember
            ? mailVariables(firstMember)
            : {
                first_name: "Ada",
                last_name: "Lovelace",
                full_name: "Ada Lovelace",
                email: "ada@example.com",
                company: "Example Capital",
                title: "Portfolio Manager",
                country: "United Kingdom",
              };
      variables.sender_name = "Quantify Terminal";
      variables.sender_email = "news@mail.quantifyterminal.com";
      variables.owner_name = found.member.display_name;
      if (!body.contact_id && !body.list_id) mailCustomPlaceholders(variables, version);
      const rendered = mailRenderMessage(
        version,
        variables,
        row.kind === "sequence" ? "sales" : String(body.topic ?? "updates"),
        "00000000-0000-4000-8000-000000000000",
      );
      if ("missing" in rendered)
        return ok({ ok_render: false, missing: rendered.missing, variables });
      return ok({
        ok_render: true,
        subject: rendered.subject,
        html: rendered.html,
        text: rendered.text,
        variables,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/templates/{template_id}/archive",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const row = mailTemplates.find((candidate) => candidate.id === params.template_id);
      if (!row) return refuse(404, "not_found");
      const restore = Boolean(body.restore);
      row.archived_at = restore ? null : now();
      audit("mail.template_archived", caller(headers)!.member.id, "mail_template", row.id, "", {
        restored: restore,
      });
      return ok({ archived: !restore });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/lists",
    auth: true,
    capability: "crm:read",
    handler: () =>
      ok({
        lists: mailLists
          .map(mailListView)
          .sort(
            (a, b) =>
              Number(Boolean(a.archived_at)) - Number(Boolean(b.archived_at)) ||
              a.name.toLowerCase().localeCompare(b.name.toLowerCase()),
          ),
        limits: {
          members: MAIL_LIST_MAX,
          import_rows: MAIL_LIST_IMPORT_MAX,
          columns: MAIL_LIST_COLUMNS_MAX,
        },
      }),
  },
  {
    method: "POST",
    pattern: "hq/mail/lists/save",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const listId = String(body.list_id ?? "");
      const existing = listId ? mailLists.find((row) => row.id === listId) : undefined;
      if (listId && !existing) return refuse(404, "not_found");
      const name = String(body.name ?? existing?.name ?? "")
        .trim()
        .slice(0, 120);
      if (!name) return refuse(400, "malformed_request", { name: "name the list" });
      if (
        mailLists.some(
          (row) =>
            !row.archived_at && row.name.toLowerCase() === name.toLowerCase() && row.id !== listId,
        )
      )
        return refuse(400, "malformed_request", { name: "another list has this name" });
      const description = String(body.description ?? existing?.description ?? "")
        .trim()
        .slice(0, 400);
      let row = existing;
      if (row) Object.assign(row, { name, description, updated_at: now() });
      else {
        row = {
          id: randomUUID(),
          name,
          description,
          columns: [],
          created_by: found.member.id,
          created_at: now(),
          updated_at: now(),
          archived_at: null,
        };
        mailLists.push(row);
      }
      audit("mail.list_saved", found.member.id, "mail_list", row.id, "", {
        name,
        created: !existing,
      });
      return ok({ list: mailListView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/lists/{list_id}",
    auth: true,
    capability: "crm:read",
    handler: ({ params, query }) => {
      const row = mailLists.find((candidate) => candidate.id === params.list_id);
      if (!row) return refuse(404, "not_found");
      const needle = String(query.q ?? "")
        .trim()
        .toLowerCase()
        .slice(0, 120);
      const statusFilter = String(query.status ?? "");
      const offset = Math.max(0, Number.parseInt(String(query.offset ?? "0"), 10) || 0);
      const limit = Math.min(
        200,
        Math.max(1, Number.parseInt(String(query.limit ?? "100"), 10) || 100),
      );
      const verdicts = mailListStatuses(row.id);
      const views = mailListMembers
        .filter((member) => member.list_id === row.id)
        .map((member) => mailListMemberView(member, verdicts.get(member.id)));
      const byReason: Record<string, number> = {};
      let eligible = 0;
      for (const view of views) {
        if (view.status === "ok") eligible += 1;
        else byReason[view.status] = (byReason[view.status] ?? 0) + 1;
      }
      const matching = views.filter(
        (view) =>
          (!needle ||
            [
              view.email,
              view.full_name,
              view.company,
              view.title,
              view.country,
              ...Object.values(view.fields),
            ]
              .join(" ")
              .toLowerCase()
              .includes(needle)) &&
          (statusFilter !== "ok" || view.status === "ok") &&
          (statusFilter !== "blocked" || view.status !== "ok"),
      );
      const campaigns = mailCampaignsUsingList(row.id, [
        "draft",
        "review",
        "approved",
        "scheduled",
        "running",
        "paused",
        "auto_paused",
        "completed",
      ]);
      return ok({
        list: mailListView(row),
        members: matching.slice(offset, offset + limit),
        total: matching.length,
        offset,
        limit,
        counts: {
          members: views.length,
          eligible,
          blocked: views.length - eligible,
          by_reason: Object.fromEntries(
            Object.entries(byReason).sort(([a], [b]) => a.localeCompare(b)),
          ),
        },
        campaigns: campaigns.map((item) => ({
          campaign_id: item.id,
          name: item.name,
          state: item.state,
        })),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/lists/{list_id}/import",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = mailLists.find((candidate) => candidate.id === params.list_id);
      if (!row) return refuse(404, "not_found");
      if (row.archived_at)
        return refuse(400, "malformed_request", {
          list: "this list is archived; restore it first",
        });
      const rows = Array.isArray(body.rows) ? (body.rows as Array<Record<string, unknown>>) : [];
      if (!rows.length) return refuse(400, "malformed_request", { rows: "no rows" });
      if (rows.length > MAIL_LIST_IMPORT_MAX)
        return refuse(400, "malformed_request", {
          rows: `at most ${MAIL_LIST_IMPORT_MAX} rows a request; send the file in parts`,
        });
      const basis = String(body.basis ?? "legitimate_interest");
      if (basis !== "consent" && basis !== "legitimate_interest")
        return refuse(400, "malformed_request", { basis: "consent or legitimate_interest" });
      const result = mailListAdd(
        row,
        rows,
        "csv",
        basis,
        Boolean(body.update_existing),
        found.member.id,
      );
      audit("mail.list_imported", found.member.id, "mail_list", row.id, "", {
        rows: result.rows,
        added: result.added,
        updated: result.updated,
        skipped_count: result.skipped_count,
      });
      return ok(result);
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/lists/{list_id}/members/add",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = mailLists.find((candidate) => candidate.id === params.list_id);
      if (!row) return refuse(404, "not_found");
      if (row.archived_at)
        return refuse(400, "malformed_request", {
          list: "this list is archived; restore it first",
        });
      const basis = String(body.basis ?? "legitimate_interest");
      if (basis !== "consent" && basis !== "legitimate_interest")
        return refuse(400, "malformed_request", { basis: "consent or legitimate_interest" });
      const refused: Array<{ row: number; email: string; reason: string }> = [];
      let rows: Array<Record<string, unknown>>;
      let source: MailListMemberRow["source"];
      if (body.member && typeof body.member === "object") {
        const cleaned = mailListCleanRow(body.member as Record<string, unknown>);
        if (!("member" in cleaned))
          return refuse(400, "malformed_request", {
            email: cleaned.reason === "INVALID_EMAIL" ? "a valid address" : "an address is needed",
          });
        rows = [body.member as Record<string, unknown>];
        source = "manual";
      } else if (Array.isArray(body.contacts) && body.contacts.length) {
        rows = [];
        source = "crm";
        (body.contacts as Array<{ kind: string; id: string }>)
          .slice(0, 2000)
          .forEach((contact, index) => {
            const person =
              contact.kind === "person" ? people.find((item) => item.id === contact.id) : undefined;
            const lead =
              contact.kind === "lead" ? leads.find((item) => item.id === contact.id) : undefined;
            if (!person && !lead) {
              refused.push({ row: index + 1, email: "", reason: "NOT_FOUND" });
              return;
            }
            const company = person
              ? companies.find((item) => item.id === person.company_id)
              : undefined;
            const parts = String((person ?? lead)!.full_name ?? "")
              .split(/\s+/)
              .filter(Boolean);
            rows.push({
              email: (person ?? lead)!.email,
              first_name: parts[0] ?? "",
              last_name: parts.slice(1).join(" "),
              company: company?.name ?? lead?.company_name ?? "",
              title: person?.title ?? "",
              country: company?.country ?? "",
            });
          });
      } else {
        return refuse(400, "malformed_request", { member: "a person to add, or CRM contacts" });
      }
      const result = mailListAdd(
        row,
        rows,
        source,
        basis,
        Boolean(body.update_existing ?? source === "manual"),
        found.member.id,
      );
      if (refused.length) {
        result.skipped = [...refused, ...result.skipped];
        result.skipped_count += refused.length;
      }
      audit("mail.list_members_added", found.member.id, "mail_list", row.id, "", {
        source,
        added: result.added,
      });
      return ok(result);
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/lists/{list_id}/members/remove",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const row = mailLists.find((candidate) => candidate.id === params.list_id);
      if (!row) return refuse(404, "not_found");
      const ids = new Set(Array.isArray(body.member_ids) ? body.member_ids.map(String) : []);
      if (!ids.size) return refuse(400, "malformed_request", { member_ids: "choose at least one" });
      let removed = 0;
      for (let index = mailListMembers.length - 1; index >= 0; index -= 1) {
        const member = mailListMembers[index]!;
        if (member.list_id === row.id && ids.has(member.id)) {
          mailListMembers.splice(index, 1);
          removed += 1;
        }
      }
      row.updated_at = now();
      audit("mail.list_members_removed", caller(headers)!.member.id, "mail_list", row.id, "", {
        removed,
      });
      return ok({ removed });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/lists/{list_id}/members/{member_id}/update",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const row = mailLists.find((candidate) => candidate.id === params.list_id);
      if (!row) return refuse(404, "not_found");
      const member = mailListMembers.find(
        (candidate) => candidate.id === params.member_id && candidate.list_id === row.id,
      );
      if (!member) return refuse(404, "not_found");
      let changed = false;
      for (const [name, limit] of [
        ["first_name", 80],
        ["last_name", 80],
        ["company", 200],
        ["title", 120],
        ["country", 60],
      ] as const) {
        if (name in body) {
          member[name] = String(body[name] ?? "")
            .trim()
            .slice(0, limit);
          changed = true;
        }
      }
      if ("fields" in body) {
        const raw = body.fields as Record<string, unknown>;
        if (!raw || typeof raw !== "object")
          return refuse(400, "malformed_request", { fields: "an object of column → value" });
        const merged = { ...member.fields };
        for (const [key, value] of Object.entries(raw)) {
          const clean = mailColumnKey(key);
          if (!row.columns.includes(clean))
            return refuse(400, "malformed_request", {
              fields: `${key} is not one of this list's columns`,
            });
          const text = String(value ?? "")
            .trim()
            .slice(0, 500);
          if (text) merged[clean] = text;
          else delete merged[clean];
        }
        member.fields = merged;
        changed = true;
      }
      if (!changed) return refuse(400, "malformed_request", { reason: "nothing to change" });
      member.updated_at = now();
      audit("mail.list_member_updated", caller(headers)!.member.id, "mail_list", row.id, "", {
        member_id: member.id,
      });
      return ok({ member: mailListMemberView(member, undefined) });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/lists/{list_id}/archive",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const row = mailLists.find((candidate) => candidate.id === params.list_id);
      if (!row) return refuse(404, "not_found");
      const restore = Boolean(body.restore);
      if (!restore) {
        const waiting = mailCampaignsUsingList(row.id, [
          "draft",
          "review",
          "approved",
          "scheduled",
        ]);
        if (waiting.length)
          return refuse(400, "malformed_request", {
            list: `used by ${waiting
              .slice(0, 3)
              .map((item) => item.name)
              .join(", ")}; change or cancel those campaigns first`,
          });
      }
      row.archived_at = restore ? null : now();
      row.updated_at = now();
      audit("mail.list_archived", caller(headers)!.member.id, "mail_list", row.id, "", {
        restored: restore,
      });
      return ok({ archived: !restore });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/lists/{list_id}/export",
    auth: true,
    capability: "crm:export",
    sudo: true,
    handler: ({ headers, params, body }) => {
      const row = mailLists.find((candidate) => candidate.id === params.list_id);
      if (!row) return refuse(404, "not_found");
      const reason = String(body.reason ?? "")
        .trim()
        .slice(0, 400);
      if (reason.length < 8)
        return refuse(400, "malformed_request", { reason: "say what the export is for" });
      const verdicts = mailListStatuses(row.id);
      const members = mailListMembers.filter((member) => member.list_id === row.id);
      const cell = (value: string) => {
        const text = /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
        return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
      };
      const lines = [
        [...MAIL_LIST_STANDARD, ...row.columns, "status", "source", "basis", "added_at"].join(","),
      ];
      for (const member of members) {
        const view = mailListMemberView(member, verdicts.get(member.id));
        lines.push(
          [
            view.email,
            view.first_name,
            view.last_name,
            view.company,
            view.title,
            view.country,
            ...row.columns.map((column) => view.fields[column] ?? ""),
            view.status === "ok" ? "can be mailed" : view.status.toLowerCase(),
            view.source,
            view.basis,
            view.added_at,
          ]
            .map((value) => cell(String(value ?? "")))
            .join(","),
        );
      }
      audit("export.created", caller(headers)!.member.id, "mail_list", row.id, reason, {
        rows: members.length,
      });
      const stamp = new Date().toISOString().slice(0, 16).replace(/[-:]/g, "").replace("T", "-");
      return ok({
        filename: `hq-list-${mailColumnKey(row.name) || "list"}-${stamp}.csv`,
        rows: members.length,
        csv: `${lines.join("\r\n")}\r\n`,
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/segments",
    auth: true,
    capability: "crm:read",
    handler: () =>
      ok({
        segments: [...mailSegments]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(mailSegmentView),
        fields: {
          people: Object.entries(MAIL_PEOPLE_FIELDS).map(([key, label]) => ({ key, label })),
          leads: Object.entries(MAIL_LEAD_FIELDS).map(([key, label]) => ({ key, label })),
        },
        ops: MAIL_OPS,
      }),
  },
  {
    method: "POST",
    pattern: "hq/mail/segments/save",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const segmentId = String(body.segment_id ?? "");
      const existing = segmentId ? mailSegments.find((row) => row.id === segmentId) : undefined;
      if (segmentId && !existing) return refuse(404, "not_found");
      const name = String(body.name ?? existing?.name ?? "")
        .trim()
        .slice(0, 120);
      if (!name) return refuse(400, "malformed_request", { name: "name it" });
      const kind = String(body.kind ?? existing?.kind ?? "people");
      if (kind !== "people" && kind !== "leads")
        return refuse(400, "malformed_request", { kind: "people or leads" });
      const { conditions, errors } = mailParseConditions(body.conditions ?? [], kind);
      if (Object.keys(errors).length) return refuse(400, "malformed_request", errors);
      const serialised = conditions.map(
        (condition) => `${condition.field}:${condition.op}:${condition.value}`,
      );
      const count = mailEvaluateSegment(kind, conditions).length;
      let row = existing;
      if (row)
        Object.assign(row, {
          name,
          kind,
          conditions: serialised,
          last_count: count,
          last_evaluated_at: now(),
        });
      else {
        row = {
          id: randomUUID(),
          name,
          kind: kind as MailSegmentRow["kind"],
          conditions: serialised,
          last_count: count,
          last_evaluated_at: now(),
          created_by: found.member.id,
          created_at: now(),
          archived_at: null,
        };
        mailSegments.push(row);
      }
      audit("mail.segment_saved", found.member.id, "mail_segment", row.id, "", { name, count });
      return ok({ segment: mailSegmentView(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/segments/preview",
    auth: true,
    capability: "crm:read",
    handler: ({ body }) => {
      const kind = String(body.kind ?? "people");
      if (kind !== "people" && kind !== "leads")
        return refuse(400, "malformed_request", { kind: "people or leads" });
      const { conditions, errors } = mailParseConditions(body.conditions ?? [], kind);
      if (Object.keys(errors).length) return refuse(400, "malformed_request", errors);
      const decided = mailDecide(
        mailEvaluateSegment(kind, conditions),
        String(body.topic ?? "updates"),
        "",
        [],
      );
      return ok({ conditions, ...mailSummarise(decided) });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/segments/{segment_id}/archive",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const row = mailSegments.find((candidate) => candidate.id === params.segment_id);
      if (!row) return refuse(404, "not_found");
      const restore = Boolean(body.restore);
      row.archived_at = restore ? null : now();
      audit("mail.segment_archived", caller(headers)!.member.id, "mail_segment", row.id, "", {
        restored: restore,
      });
      return ok({ archived: !restore });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/campaigns",
    auth: true,
    capability: "crm:read",
    handler: ({ headers }) => {
      mailRunWorker();
      const role = caller(headers)!.member.role;
      return ok({
        campaigns: [...mailCampaigns]
          .sort((a, b) => b.updated_at.localeCompare(a.updated_at))
          .map(mailCampaignView),
        topics: MAIL_MARKETING_TOPICS.map((key) => ({ key, label: MAIL_TOPICS[key]! })),
        may_send: (CAPABILITIES[role] ?? []).includes("mail:send"),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/campaigns/create",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const checked = mailCampaignFields(body, undefined);
      if ("error" in checked) return checked.error;
      const row: MailCampaignRow = {
        id: randomUUID(),
        state: "draft",
        scheduled_at: null,
        requires_approval: false,
        approved_by: "",
        approved_at: null,
        pause_reason: "",
        paused_at: null,
        counts: mailEmptyCounts(),
        started_at: null,
        completed_at: null,
        created_by: found.member.id,
        created_at: now(),
        updated_at: now(),
        ...checked.fields,
      };
      mailCampaigns.push(row);
      audit("mail.campaign_created", found.member.id, "mail_campaign", row.id, "", {
        name: row.name,
      });
      return ok({ campaign: mailCampaignView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/campaigns/{campaign_id}",
    auth: true,
    capability: "crm:read",
    handler: ({ headers, params }) => {
      const found = caller(headers)!;
      mailRunWorker();
      const row = mailCampaigns.find((candidate) => candidate.id === params.campaign_id);
      if (!row) return refuse(404, "not_found");
      const messages = mailMessages.filter((message) => message.campaign_id === row.id);
      const byState: Record<string, number> = {};
      const skippedBy: Record<string, number> = {};
      for (const message of messages) {
        byState[message.state] = (byState[message.state] ?? 0) + 1;
        if (message.state === "skipped")
          skippedBy[message.skip_reason] = (skippedBy[message.skip_reason] ?? 0) + 1;
      }
      const maySend = (CAPABILITIES[found.member.role] ?? []).includes("mail:send");
      const payload: Record<string, unknown> = {
        campaign: mailCampaignView(row),
        messages_by_state: byState,
        skipped_by_reason: skippedBy,
        messages: [...messages]
          .sort((a, b) => (b.sent_at ?? b.scheduled_at).localeCompare(a.sent_at ?? a.scheduled_at))
          .slice(0, 100)
          .map((message) => mailMessageView(message)),
        may_send: maySend,
        may_approve: maySend && row.created_by !== found.member.id,
      };
      if (["draft", "review", "approved"].includes(row.state)) {
        const summary = mailCampaignPreview(row);
        payload.preview = summary;
        payload.checklist = mailChecklist(row, summary.eligible, summary.skipped);
      }
      return ok(payload);
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/campaigns/{campaign_id}/update",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const row = mailCampaigns.find((candidate) => candidate.id === params.campaign_id);
      if (!row) return refuse(404, "not_found");
      if (!["draft", "review", "approved"].includes(row.state))
        return refuse(400, "malformed_request", { state: "only a draft can change" });
      const checked = mailCampaignFields(body, row);
      if ("error" in checked) return checked.error;
      Object.assign(row, checked.fields, {
        state: "draft",
        requires_approval: false,
        approved_by: "",
        approved_at: null,
        updated_at: now(),
      });
      audit("mail.campaign_updated", caller(headers)!.member.id, "mail_campaign", row.id, "", {});
      return ok({ campaign: mailCampaignView(row) });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/campaigns/{campaign_id}/preview",
    auth: true,
    capability: "crm:read",
    handler: ({ params }) => {
      const row = mailCampaigns.find((candidate) => candidate.id === params.campaign_id);
      if (!row) return refuse(404, "not_found");
      const summary = mailCampaignPreview(row);
      return ok({
        ...summary,
        checklist: mailChecklist(row, summary.eligible, summary.skipped),
        approval_threshold: mailSettings.approval_threshold,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/campaigns/{campaign_id}/test",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = mailCampaigns.find((candidate) => candidate.id === params.campaign_id);
      if (!row) return refuse(404, "not_found");
      const to = mailNorm(body.to_email || found.member.email);
      const allowed = new Set([
        found.member.email.toLowerCase(),
        ...mailSettings.seed_addresses,
        ...staff.filter((member) => member.is_active).map((member) => member.email.toLowerCase()),
      ]);
      if (!allowed.has(to))
        return refuse(400, "malformed_request", {
          to_email: "a colleague's address or a seed inbox",
        });
      const version = mailVersionOf(row.template_id, row.template_version);
      if (!version)
        return refuse(400, "malformed_request", { campaign: "sender or template gone" });
      const messageId = randomUUID();
      const listFirst =
        row.audience.kind === "list"
          ? mailListRecipients(String(row.audience.list_id ?? ""))[0]
          : undefined;
      const testVariables: Record<string, string> = listFirst
        ? { ...mailVariables(listFirst), sender_name: "Quantify Terminal", email: to }
        : {
            first_name: "Ada",
            full_name: "Ada Lovelace",
            company: "Example Capital",
            sender_name: "Quantify Terminal",
            email: to,
          };
      mailCustomPlaceholders(testVariables, version);
      const rendered = mailRenderMessage(version, testVariables, row.topic, messageId);
      if ("missing" in rendered)
        return refuse(400, "malformed_request", {
          template: `missing token ${rendered.missing} for the sample contact`,
        });
      mailProviderCounter += 1;
      mailMessages.push({
        id: messageId,
        kind: "test",
        campaign_id: "",
        enrolment_id: "",
        step_no: null,
        sender_id: row.sender_id,
        topic: row.topic,
        contact_kind: "staff",
        contact_id: "",
        company_id: "",
        email: to,
        email_norm: to,
        variables: {},
        template_id: row.template_id,
        template_version: row.template_version,
        state: "sent",
        scheduled_at: now(),
        sent_at: now(),
        delivered_at: null,
        first_clicked_at: null,
        first_opened_at: null,
        bounced_at: null,
        complained_at: null,
        unsubscribed_at: null,
        provider_message_id: `<mock-${mailProviderCounter}@mail.test>`,
        provider_status: "sent",
        subject: `[Test] ${rendered.subject}`,
        in_reply_to: "",
        skip_reason: "",
        last_error: "",
        attempts: 1,
        is_seed: false,
      });
      audit("mail.test_sent", found.member.id, "mail_campaign", row.id, "", { to: mailMask(to) });
      return ok({ status: "sent", message_id: messageId, error_code: "" });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/campaigns/{campaign_id}/submit",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params }) => {
      const found = caller(headers)!;
      const row = mailCampaigns.find((candidate) => candidate.id === params.campaign_id);
      if (!row) return refuse(404, "not_found");
      if (row.state !== "draft")
        return refuse(400, "malformed_request", { state: `already ${row.state}` });
      const summary = mailCampaignPreview(row);
      const blocking = mailChecklist(row, summary.eligible, summary.skipped).filter(
        (item) => item.blocking && !item.ok && item.key !== "approval",
      );
      if (blocking.length)
        return refuse(400, "malformed_request", {
          checklist: blocking.map((item) => item.key).join(", "),
        });
      const requires = summary.eligible >= mailSettings.approval_threshold || summary.has_customers;
      Object.assign(row, {
        state: requires ? "review" : "approved",
        requires_approval: requires,
        updated_at: now(),
      });
      audit("mail.campaign_submitted", found.member.id, "mail_campaign", row.id, "", {
        eligible: summary.eligible,
        requires_approval: requires,
      });
      return ok({
        state: row.state,
        requires_approval: requires,
        eligible: summary.eligible,
        skipped: summary.skipped,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/campaigns/{campaign_id}/approve",
    auth: true,
    capability: "mail:send",
    sudo: true,
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = mailCampaigns.find((candidate) => candidate.id === params.campaign_id);
      if (!row) return refuse(404, "not_found");
      if (row.state !== "review")
        return refuse(400, "malformed_request", { state: `${row.state}, not in review` });
      if (row.created_by === found.member.id)
        return refuse(403, "forbidden", { reason: "own-request" });
      if (String(body.decision ?? "approve") === "decline") {
        Object.assign(row, { state: "draft", requires_approval: false, updated_at: now() });
        audit(
          "mail.campaign_declined",
          found.member.id,
          "mail_campaign",
          row.id,
          String(body.note ?? ""),
          {},
        );
        return ok({ state: "draft" });
      }
      Object.assign(row, {
        state: "approved",
        approved_by: found.member.id,
        approved_at: now(),
        updated_at: now(),
      });
      audit(
        "mail.campaign_approved",
        found.member.id,
        "mail_campaign",
        row.id,
        String(body.note ?? ""),
        {},
      );
      return ok({ state: "approved" });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/campaigns/{campaign_id}/schedule",
    auth: true,
    capability: "mail:send",
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = mailCampaigns.find((candidate) => candidate.id === params.campaign_id);
      if (!row) return refuse(404, "not_found");
      if (row.state !== "approved")
        return refuse(400, "malformed_request", { state: `${row.state}, not approved` });
      const raw = String(body.scheduled_at ?? "").trim();
      const start = raw ? new Date(raw) : new Date();
      if (Number.isNaN(start.getTime()))
        return refuse(400, "malformed_request", { scheduled_at: "an ISO moment" });
      if (start.getTime() > Date.now() + 30 * 86_400_000)
        return refuse(400, "malformed_request", { scheduled_at: "within 30 days" });
      const summary = mailCampaignPreview(row);
      const blocking = mailChecklist(row, summary.eligible, summary.skipped).filter(
        (item) => item.blocking && !item.ok,
      );
      if (blocking.length)
        return refuse(400, "malformed_request", {
          checklist: blocking.map((item) => item.key).join(", "),
        });
      const outcome = mailEnqueue(row, start.toISOString().replace(/\.\d{3}Z$/, "Z"));
      audit("mail.campaign_scheduled", found.member.id, "mail_campaign", row.id, "", outcome);
      mailRunWorker();
      return ok(outcome);
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/campaigns/{campaign_id}/pause",
    auth: true,
    capability: "mail:send",
    handler: mailCampaignControl("pause"),
  },
  {
    method: "POST",
    pattern: "hq/mail/campaigns/{campaign_id}/resume",
    auth: true,
    capability: "mail:send",
    handler: mailCampaignControl("resume"),
  },
  {
    method: "POST",
    pattern: "hq/mail/campaigns/{campaign_id}/cancel",
    auth: true,
    capability: "mail:send",
    handler: mailCampaignControl("cancel"),
  },
  {
    method: "GET",
    pattern: "hq/mail/sequences",
    auth: true,
    capability: "crm:read",
    handler: ({ headers }) =>
      ok({
        sequences: [...mailSequences]
          .sort((a, b) => a.name.localeCompare(b.name))
          .map(mailSequenceView),
        outcomes: Object.entries(MAIL_OUTCOMES).map(([key, label]) => ({ key, label })),
        may_send: (CAPABILITIES[caller(headers)!.member.role] ?? []).includes("mail:send"),
      }),
  },
  {
    method: "POST",
    pattern: "hq/mail/sequences/save",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const sequenceId = String(body.sequence_id ?? "");
      const existing = sequenceId ? mailSequences.find((row) => row.id === sequenceId) : undefined;
      if (sequenceId && !existing) return refuse(404, "not_found");
      const name = String(body.name ?? existing?.name ?? "")
        .trim()
        .slice(0, 120);
      if (!name) return refuse(400, "malformed_request", { name: "name it" });
      const kind = String(body.kind ?? existing?.kind ?? "prospect");
      if (kind !== "prospect" && kind !== "customer")
        return refuse(400, "malformed_request", { kind: "prospect or customer" });
      const steps: MailStepRow[] = [];
      if ("steps" in body || !existing) {
        const raw = Array.isArray(body.steps) ? body.steps : [];
        if (!raw.length) return refuse(400, "malformed_request", { steps: "at least one step" });
        if (raw.length > 8) return refuse(400, "malformed_request", { steps: "at most 8 steps" });
        for (const [index, item] of raw.entries()) {
          const step = item as Record<string, unknown>;
          const stepKind = String(step.kind ?? "email");
          const delay = Number(step.delay_days ?? 0);
          if (index === 0 && stepKind !== "email")
            return refuse(400, "malformed_request", {
              "steps[0].kind": "the first step is an email",
            });
          if (stepKind === "email") {
            const template = mailTemplates.find((row) => row.id === String(step.template_id ?? ""));
            if (!template || template.archived_at || template.kind !== "sequence")
              return refuse(400, "malformed_request", {
                [`steps[${index}].template_id`]: "a live sequence template",
              });
            steps.push({
              step_no: index + 1,
              kind: "email",
              delay_days: index === 0 ? 0 : delay,
              template_id: template.id,
              template_version: template.current_version,
              thread: index === 0 ? "new" : step.thread === "new" ? "new" : "reply",
              task_title: "",
            });
          } else {
            const title = String(step.task_title ?? "")
              .trim()
              .slice(0, 200);
            if (!title)
              return refuse(400, "malformed_request", {
                [`steps[${index}].task_title`]: "say what to do",
              });
            steps.push({
              step_no: index + 1,
              kind: "task",
              delay_days: delay,
              template_id: "",
              template_version: null,
              thread: "new",
              task_title: title,
            });
          }
        }
      }
      const fields = {
        name,
        kind: kind as MailSequenceRow["kind"],
        sender_id: String(body.sender_id ?? existing?.sender_id ?? "") || "",
        cooling_days: Number(body.cooling_days ?? existing?.cooling_days ?? 90),
        recent_contact_days: Number(
          body.recent_contact_days ?? existing?.recent_contact_days ?? 14,
        ),
        company_limit: Number(body.company_limit ?? existing?.company_limit ?? 2),
        updated_at: now(),
      };
      let row = existing;
      if (row) Object.assign(row, fields);
      else {
        row = {
          id: randomUUID(),
          state: "draft",
          created_by: found.member.id,
          created_at: now(),
          ...fields,
        };
        mailSequences.push(row);
      }
      if (steps.length) mailSteps.set(row.id, steps);
      audit("mail.sequence_saved", found.member.id, "mail_sequence", row.id, "", {
        name,
        steps: steps.length,
      });
      return ok({ sequence: mailSequenceView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/sequences/{sequence_id}",
    auth: true,
    capability: "crm:read",
    handler: ({ headers, params }) => {
      mailRunWorker();
      const row = mailSequences.find((candidate) => candidate.id === params.sequence_id);
      if (!row) return refuse(404, "not_found");
      const steps = mailSteps.get(row.id) ?? [];
      const enrolments = mailEnrolments.filter((candidate) => candidate.sequence_id === row.id);
      const perStep = steps.map((step) => {
        const messages = mailMessages.filter(
          (message) =>
            message.step_no === step.step_no &&
            enrolments.some((enrolment) => enrolment.id === message.enrolment_id),
        );
        return {
          step_no: step.step_no,
          scheduled: messages.filter((message) =>
            ["pending", "retry", "claimed", "held"].includes(message.state),
          ).length,
          sent: messages.filter(
            (message) => MAIL_SENT_LIKE.includes(message.state) || message.state === "delivered",
          ).length,
          delivered: messages.filter((message) => message.delivered_at).length,
          bounced: messages.filter((message) =>
            ["hard_bounced", "soft_bounced"].includes(message.state),
          ).length,
          clicked: messages.filter((message) => message.first_clicked_at).length,
          skipped: messages.filter((message) => message.state === "skipped").length,
        };
      });
      return ok({
        sequence: mailSequenceView(row),
        enrolments: [...enrolments]
          .sort((a, b) => b.enrolled_at.localeCompare(a.enrolled_at))
          .map(mailEnrolmentView),
        per_step: perStep,
        may_send: (CAPABILITIES[caller(headers)!.member.role] ?? []).includes("mail:send"),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/sequences/{sequence_id}/state",
    auth: true,
    capability: "mail:send",
    handler: ({ headers, params, body }) => {
      const row = mailSequences.find((candidate) => candidate.id === params.sequence_id);
      if (!row) return refuse(404, "not_found");
      const state = String(body.state ?? "");
      if (!["active", "paused", "archived"].includes(state))
        return refuse(400, "malformed_request", { state: "active, paused or archived" });
      if (state === "active" && !(mailSteps.get(row.id) ?? []).length)
        return refuse(400, "malformed_request", { steps: "add steps first" });
      let ended = 0;
      if (state === "archived") {
        for (const enrolment of mailEnrolments.filter(
          (candidate) =>
            candidate.sequence_id === row.id && ["active", "paused"].includes(candidate.state),
        )) {
          mailExit(enrolment, "MANUAL", "stop", caller(headers)!.member.id, "sequence archived");
          ended += 1;
        }
      }
      row.state = state as MailSequenceRow["state"];
      row.updated_at = now();
      audit("mail.sequence_state", caller(headers)!.member.id, "mail_sequence", row.id, "", {
        state,
        ended,
      });
      return ok({ state, ended });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/sequences/{sequence_id}/enrol/preview",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = mailSequences.find((candidate) => candidate.id === params.sequence_id);
      if (!row) return refuse(404, "not_found");
      const contacts = Array.isArray(body.contacts)
        ? (body.contacts as Array<{ kind: string; id: string }>).slice(0, 200)
        : [];
      if (!contacts.length)
        return refuse(400, "malformed_request", { contacts: "choose at least one person or lead" });
      const verdicts = mailEnrolVerdicts(
        row,
        contacts,
        found.member,
        (CAPABILITIES[found.member.role] ?? []).includes("mail:send"),
      ).map(mailPublicVerdict);
      return ok({
        verdicts,
        will_enrol: verdicts.filter((entry) => entry.allowed).length,
        will_skip: verdicts.filter((entry) => !entry.allowed).length,
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/sequences/{sequence_id}/enrol",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = mailSequences.find((candidate) => candidate.id === params.sequence_id);
      if (!row) return refuse(404, "not_found");
      if (row.state !== "active")
        return refuse(400, "malformed_request", { state: "the sequence is not active" });
      const contacts = Array.isArray(body.contacts)
        ? (body.contacts as Array<{ kind: string; id: string }>).slice(0, 200)
        : [];
      if (!contacts.length)
        return refuse(400, "malformed_request", { contacts: "choose at least one person or lead" });
      const verdicts = mailEnrolVerdicts(
        row,
        contacts,
        found.member,
        (CAPABILITIES[found.member.role] ?? []).includes("mail:send"),
      );
      const first = (mailSteps.get(row.id) ?? [])[0];
      const enrolled: string[] = [];
      const shown = verdicts.map((entry) => {
        const view: Record<string, unknown> = mailPublicVerdict(entry);
        if (entry.allowed && entry.recipient && entry.sender && first) {
          const enrolment: MailEnrolmentRow = {
            id: randomUUID(),
            sequence_id: row.id,
            contact_kind: entry.recipient.contact_kind as "person" | "lead",
            contact_id: entry.recipient.contact_id,
            company_id: entry.recipient.company_id,
            email_norm: mailNorm(entry.recipient.email),
            owner_staff_id: found.member.id,
            sender_id: entry.sender.id,
            state: "active",
            current_step: 0,
            waiting_task_id: "",
            exit_reason: "",
            outcome: "",
            paused_until: null,
            pause_reason: "",
            thread_subject: "",
            thread_message_id: "",
            enrolled_at: now(),
            enrolled_by: found.member.id,
            last_sent_at: null,
            exited_at: null,
          };
          mailEnrolments.push(enrolment);
          mailStageStep(enrolment, first, mailTomorrowNine());
          enrolled.push(enrolment.id);
          view.enrolment_id = enrolment.id;
        }
        return view;
      });
      audit("mail.enrolled", found.member.id, "mail_sequence", row.id, "", {
        enrolled: enrolled.length,
      });
      return ok({ enrolled: enrolled.length, enrolment_ids: enrolled, verdicts: shown });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/enrolments/{enrolment_id}/outcome",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = mailEnrolments.find((candidate) => candidate.id === params.enrolment_id);
      if (!row) return refuse(404, "not_found");
      if (
        row.owner_staff_id !== found.member.id &&
        !(CAPABILITIES[found.member.role] ?? []).includes("mail:send")
      )
        return refuse(403, "forbidden", { reason: "not-yours" });
      if (!["active", "paused"].includes(row.state))
        return refuse(400, "malformed_request", { state: `already ${row.state}` });
      const outcome = String(body.outcome ?? "");
      if (!(outcome in MAIL_OUTCOMES))
        return refuse(400, "malformed_request", {
          outcome: `one of ${Object.keys(MAIL_OUTCOMES).join(", ")}`,
        });
      const note = String(body.note ?? "")
        .trim()
        .slice(0, 400);
      if (outcome === "out_of_office") {
        const until = String(body.pause_until ?? "").slice(0, 10);
        if (!/^\d{4}-\d{2}-\d{2}$/.test(until) || until <= new Date().toISOString().slice(0, 10))
          return refuse(400, "malformed_request", { pause_until: "a return date after today" });
        Object.assign(row, { state: "paused", paused_until: until, pause_reason: "OUT_OF_OFFICE" });
        for (const message of mailMessages)
          if (message.enrolment_id === row.id && ["pending", "retry"].includes(message.state)) {
            message.state = "cancelled";
            message.skip_reason = "OUT_OF_OFFICE";
          }
        audit("mail.enrolment_outcome", found.member.id, "mail_enrolment", row.id, note, {
          outcome,
        });
        return ok({ outcome, state: "paused", until });
      }
      mailExit(row, MAIL_OUTCOME_REASONS[outcome]!, outcome, found.member.id, note);
      if (outcome === "unsubscribe") {
        const existing = mailConsent.get(row.email_norm);
        mailConsent.set(row.email_norm, {
          email_norm: row.email_norm,
          marketing_state: existing?.marketing_state ?? "unknown",
          topics_off: existing?.topics_off ?? [],
          sales_stop: true,
          lawful_basis: existing?.lawful_basis ?? "",
          source: `outcome:${found.member.id}`.slice(0, 60),
          timezone: existing?.timezone ?? "",
          updated_at: now(),
        });
      }
      if (outcome === "bounced")
        mailSuppress(
          row.email_norm,
          "hard_bounce",
          `outcome:${found.member.id}`,
          note,
          found.member.id,
        );
      if (outcome === "replied_positive" || outcome === "meeting_booked")
        mailPauseCompany(row.company_id, row.id);
      if (row.contact_kind === "lead") {
        const lead = leads.find((candidate) => candidate.id === row.contact_id);
        if (
          lead &&
          (outcome === "replied_positive" || outcome === "meeting_booked") &&
          ["new", "attempting"].includes(lead.stage)
        )
          lead.stage = "connected";
        if (
          lead &&
          (outcome === "not_interested" || outcome === "wrong_person") &&
          ["new", "attempting", "connected"].includes(lead.stage)
        ) {
          lead.stage = "disqualified";
          lead.disqualify_reason = outcome === "not_interested" ? "not_a_fit" : "other";
        }
      }
      audit("mail.enrolment_outcome", found.member.id, "mail_enrolment", row.id, note, { outcome });
      return ok({ outcome, state: "exited", reason: MAIL_OUTCOME_REASONS[outcome] });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/enrolments/{enrolment_id}/resume",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, params }) => {
      const found = caller(headers)!;
      const row = mailEnrolments.find((candidate) => candidate.id === params.enrolment_id);
      if (!row) return refuse(404, "not_found");
      if (
        row.owner_staff_id !== found.member.id &&
        !(CAPABILITIES[found.member.role] ?? []).includes("mail:send")
      )
        return refuse(403, "forbidden", { reason: "not-yours" });
      if (row.state !== "paused")
        return refuse(400, "malformed_request", { state: `${row.state}, not paused` });
      Object.assign(row, { state: "active", paused_until: null, pause_reason: "" });
      const steps = mailSteps.get(row.sequence_id) ?? [];
      const sentSteps = new Set(
        mailMessages
          .filter((message) => message.enrolment_id === row.id && message.sent_at)
          .map((message) => message.step_no),
      );
      const next = steps.find(
        (step) => !sentSteps.has(step.step_no) && step.step_no >= Math.max(row.current_step, 1),
      );
      if (next) mailStageStep(row, next, now());
      audit("mail.enrolment_resumed", found.member.id, "mail_enrolment", row.id, "", {});
      return ok({ state: "active" });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/replies",
    auth: true,
    capability: "crm:write",
    handler: ({ headers }) => {
      const found = caller(headers)!;
      const mayAll = (CAPABILITIES[found.member.role] ?? []).includes("mail:send");
      const rows = mailEnrolments
        .filter(
          (row) =>
            (row.state === "active" || row.state === "paused") &&
            (mayAll || row.owner_staff_id === found.member.id),
        )
        .map((row) => ({
          ...mailEnrolmentView(row),
          sequence_name:
            mailSequences.find((sequence) => sequence.id === row.sequence_id)?.name ?? "",
        }))
        .filter((view) => view.awaiting_reply || view.state === "paused")
        .sort((a, b) => String(a.last_sent_at ?? "").localeCompare(String(b.last_sent_at ?? "")));
      return ok({
        enrolments: rows,
        outcomes: Object.entries(MAIL_OUTCOMES).map(([key, label]) => ({ key, label })),
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/suppressions",
    auth: true,
    capability: "crm:read",
    handler: ({ query }) => {
      const needle = mailNorm(query.q);
      const released = query.released === "1";
      const rows = mailSuppressions
        .filter(
          (row) => (released || !row.released_at) && (!needle || row.email_norm.includes(needle)),
        )
        .map(mailSuppressionView);
      const byReason: Record<string, number> = {};
      for (const row of mailSuppressions)
        if (!row.released_at) byReason[row.reason] = (byReason[row.reason] ?? 0) + 1;
      return ok({
        suppressions: rows,
        by_reason: byReason,
        reasons: [
          "hard_bounce",
          "complaint",
          "unsubscribe",
          "manual",
          "invalid_address",
          "provider_blocked",
          "soft_bounce_limit",
        ],
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/suppressions/add",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const norm = mailNorm(body.email);
      if (!mailValidEmail(norm))
        return refuse(400, "malformed_request", { email: "a valid address" });
      const detail = String(body.detail ?? "")
        .trim()
        .slice(0, 400);
      if (!detail) return refuse(400, "malformed_request", { detail: "say why" });
      const row: MailSuppressionRow = {
        id: randomUUID(),
        email_norm: norm,
        scope: "global",
        scope_key: "",
        reason: "manual",
        source: `admin:${found.member.id}`,
        detail,
        created_at: now(),
        created_by: found.member.id,
        released_at: null,
        released_by: "",
        release_note: "",
      };
      mailSuppressions.unshift(row);
      let cancelled = 0;
      for (const message of mailMessages)
        if (message.email_norm === norm && ["pending", "retry", "held"].includes(message.state)) {
          message.state = "cancelled";
          message.skip_reason = "SUPPRESSED";
          cancelled += 1;
        }
      for (const enrolment of mailEnrolments)
        if (enrolment.email_norm === norm && ["active", "paused"].includes(enrolment.state))
          mailExit(enrolment, "MANUAL", "stop", found.member.id, detail);
      audit("mail.suppression_added", found.member.id, "mail_suppression", row.id, detail, {
        cancelled,
      });
      return ok({ suppression: mailSuppressionView(row), cancelled });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/suppressions/{suppression_id}/release",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, params, body }) => {
      const found = caller(headers)!;
      const row = mailSuppressions.find((candidate) => candidate.id === params.suppression_id);
      if (!row) return refuse(404, "not_found");
      if (row.released_at) return refuse(400, "malformed_request", { state: "already released" });
      if (row.reason === "complaint" && found.member.role !== "owner")
        return refuse(403, "forbidden", { required_role: "owner" });
      const note = String(body.note ?? "")
        .trim()
        .slice(0, 400);
      if (!note)
        return refuse(400, "malformed_request", {
          note: "say why mail may go to this address again",
        });
      Object.assign(row, { released_at: now(), released_by: found.member.id, release_note: note });
      audit("mail.suppression_released", found.member.id, "mail_suppression", row.id, note, {});
      return ok({ released: true });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/consent",
    auth: true,
    capability: "crm:read",
    handler: ({ query }) => {
      const norm = mailNorm(query.email);
      if (!norm) return refuse(400, "malformed_request", { email: "which address" });
      return ok({
        consent: mailConsentView(norm),
        topics: MAIL_MARKETING_TOPICS.map((key) => ({ key, label: MAIL_TOPICS[key]! })),
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/consent/set",
    auth: true,
    capability: "crm:write",
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const norm = mailNorm(body.email);
      if (!mailValidEmail(norm))
        return refuse(400, "malformed_request", { email: "a valid address" });
      const state = String(body.marketing_state ?? "unknown");
      if (!["unknown", "subscribed", "unsubscribed"].includes(state))
        return refuse(400, "malformed_request", {
          marketing_state: "unknown, subscribed or unsubscribed",
        });
      const topics = Array.isArray(body.topics_off)
        ? body.topics_off.map(String).filter((topic) => MAIL_MARKETING_TOPICS.includes(topic))
        : [];
      const row: MailConsentRow = {
        email_norm: norm,
        marketing_state: state as MailConsentRow["marketing_state"],
        topics_off: [...new Set(topics)],
        sales_stop: Boolean(body.sales_stop),
        lawful_basis: String(body.lawful_basis ?? ""),
        source: String(body.source ?? "manual").slice(0, 60),
        timezone: String(body.timezone ?? "").trim(),
        updated_at: now(),
      };
      mailConsent.set(norm, row);
      if (row.sales_stop)
        for (const enrolment of mailEnrolments)
          if (enrolment.email_norm === norm && ["active", "paused"].includes(enrolment.state))
            mailExit(enrolment, "UNSUBSCRIBED", "unsubscribe", found.member.id, "sales stop set");
      audit("mail.consent_set", found.member.id, "mail_consent", norm, "", {});
      return ok({ consent: mailConsentView(norm) });
    },
  },
  {
    method: "GET",
    pattern: "hq/settings/mail",
    auth: true,
    capability: "hq:admin",
    handler: () =>
      ok({
        sending_enabled: mailSettings.sending_enabled,
        global_daily_cap: mailSettings.global_daily_cap,
        hourly_cap: mailSettings.hourly_cap,
        frequency_cap_per_week: mailSettings.frequency_cap_per_week,
        approval_threshold: mailSettings.approval_threshold,
        bounce_pause_pct: mailSettings.bounce_pause_pct,
        complaint_pause_pct: mailSettings.complaint_pause_pct,
        window_start: mailSettings.window_start,
        window_end: mailSettings.window_end,
        fallback_timezone: mailSettings.fallback_timezone,
        postal_address: mailSettings.postal_address,
        seed_addresses: mailSettings.seed_addresses,
        webhook_configured: mailSettings.webhook_configured,
        paused_reason: mailSettings.paused_reason,
        last_worker_at: mailSettings.last_worker_at || null,
        provider_backoff_until: null,
        webhook_url_shape: "https://<service>/api/v1/public/mail/events/<secret>",
        unsubscribe_url_shape: `${PORTAL_ORIGIN}/u/<token>`,
        provider_configured: true,
        topics: Object.entries(MAIL_TOPICS).map(([key, label]) => ({ key, label })),
      }),
  },
  {
    method: "POST",
    pattern: "hq/settings/mail/update",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers, body }) => {
      const found = caller(headers)!;
      const errors: Record<string, string> = {};
      const next = { ...mailSettings };
      for (const [name, low, high] of [
        ["global_daily_cap", 0, 100_000],
        ["hourly_cap", 1, 10_000],
        ["frequency_cap_per_week", 0, 50],
        ["approval_threshold", 0, 1_000_000],
      ] as const) {
        if (!(name in body)) continue;
        const value = body[name];
        if (typeof value !== "number" || !Number.isInteger(value) || value < low || value > high)
          errors[name] = `a whole number from ${low} to ${high}`;
        else next[name] = value;
      }
      for (const name of ["bounce_pause_pct", "complaint_pause_pct"] as const) {
        if (!(name in body)) continue;
        const value = body[name];
        if (typeof value !== "number" || value < 0 || value > 100)
          errors[name] = "a percentage from 0 to 100";
        else next[name] = value;
      }
      for (const name of ["window_start", "window_end"] as const) {
        if (!(name in body)) continue;
        const value = String(body[name] ?? "");
        if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(value)) errors[name] = "HH:MM, 24-hour";
        else next[name] = value;
      }
      if (("window_start" in body || "window_end" in body) && next.window_start >= next.window_end)
        errors.window_end = "after the start";
      if ("fallback_timezone" in body)
        next.fallback_timezone = String(body.fallback_timezone ?? "UTC").trim() || "UTC";
      if ("postal_address" in body)
        next.postal_address = String(body.postal_address ?? "")
          .trim()
          .slice(0, 400);
      if ("seed_addresses" in body) {
        const raw = Array.isArray(body.seed_addresses)
          ? body.seed_addresses.map(mailNorm).filter(Boolean)
          : [];
        if (raw.length > 5 || raw.some((item) => !mailValidEmail(item)))
          errors.seed_addresses = "up to five valid addresses";
        else next.seed_addresses = [...new Set(raw)];
      }
      if ("sending_enabled" in body) {
        next.sending_enabled = Boolean(body.sending_enabled);
        if (next.sending_enabled) next.paused_reason = "";
      }
      if (Object.keys(errors).length) return refuse(400, "malformed_request", errors);
      Object.assign(mailSettings, next);
      audit("mail.settings_updated", found.member.id, "settings", "mail", "", {
        fields: Object.keys(body),
      });
      return ok({ settings: { ...mailSettings } });
    },
  },
  {
    method: "POST",
    pattern: "hq/settings/mail/webhook/rotate",
    auth: true,
    capability: "hq:admin",
    sudo: true,
    handler: ({ headers }) => {
      mailSettings.webhook_configured = true;
      audit("mail.webhook_rotated", caller(headers)!.member.id, "settings", "mail", "", {});
      return ok({
        webhook_url: `https://account.example.test/api/v1/public/mail/events/${randomUUID().replace(/-/g, "")}`,
        shown_once: ["webhook_url"],
      });
    },
  },
  {
    method: "POST",
    pattern: "hq/mail/worker/run",
    auth: true,
    capability: "mail:send",
    handler: ({ headers }) => {
      const report = mailRunWorker();
      audit("mail.worker_run", caller(headers)!.member.id, "settings", "mail", "", report);
      return ok({ report });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/report",
    auth: true,
    capability: "crm:read",
    handler: ({ query }) => {
      const days = Math.max(7, Math.min(90, Number(query.days ?? 30) || 30));
      const perDay: Array<{ day: string; sent: number }> = [];
      for (let offset = 13; offset >= 0; offset -= 1) {
        const day = new Date(Date.now() - offset * 86_400_000).toISOString().slice(0, 10);
        perDay.push({
          day,
          sent: mailMessages.filter(
            (row) => row.kind !== "test" && !row.is_seed && row.sent_at?.startsWith(day),
          ).length,
        });
      }
      const byReason: Record<string, number> = {};
      for (const row of mailSuppressions)
        if (!row.released_at) byReason[row.reason] = (byReason[row.reason] ?? 0) + 1;
      const consent = { subscribed: 0, unknown: 0, unsubscribed: 0, sales_stop: 0 };
      for (const row of mailConsent.values()) {
        consent[row.marketing_state] += 1;
        if (row.sales_stop) consent.sales_stop += 1;
      }
      return ok({
        days,
        totals: mailTotals(Date.now() - days * 86_400_000),
        per_day: perDay,
        campaigns: mailCampaigns
          .filter((row) => row.state !== "draft")
          .sort((a, b) =>
            String(b.started_at ?? b.updated_at).localeCompare(
              String(a.started_at ?? a.updated_at),
            ),
          )
          .map(mailCampaignView),
        sequences: mailSequences.map((sequence) => {
          const enrolments = mailEnrolments.filter((row) => row.sequence_id === sequence.id);
          const exits: Record<string, number> = {};
          for (const row of enrolments)
            if (row.exit_reason) exits[row.exit_reason] = (exits[row.exit_reason] ?? 0) + 1;
          return {
            sequence_id: sequence.id,
            name: sequence.name,
            state: sequence.state,
            enrolled: enrolments.length,
            active: enrolments.filter((row) => row.state === "active").length,
            replied: enrolments.filter((row) => row.outcome === "replied_positive").length,
            meetings: enrolments.filter(
              (row) => row.outcome === "meeting_booked" || row.exit_reason === "MEETING_BOOKED",
            ).length,
            exits,
          };
        }),
        caps_today: {
          global: { sent: mailSentToday(), cap: mailSettings.global_daily_cap },
          hour: {
            sent: mailSentThisHour(),
            cap: mailSettings.hourly_cap,
          },
          senders: mailSenders.map((row) => ({
            ...mailSenderView(row),
            sent_today: mailMessages.filter(
              (message) =>
                message.sender_id === row.id &&
                message.kind !== "test" &&
                message.sent_at?.startsWith(new Date().toISOString().slice(0, 10)),
            ).length,
          })),
        },
        suppressions_by_reason: byReason,
        consent,
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/messages/{message_id}",
    auth: true,
    capability: "crm:read",
    handler: ({ params }) => {
      const row = mailMessages.find((candidate) => candidate.id === params.message_id);
      if (!row) return refuse(404, "not_found");
      return ok({
        message: mailMessageView(row),
        events: mailEvents
          .filter((event) => event.message_id === row.id)
          .sort((a, b) => a.occurred_at.localeCompare(b.occurred_at)),
      });
    },
  },
  {
    method: "GET",
    pattern: "hq/mail/history",
    auth: true,
    capability: "crm:read",
    handler: ({ query }) => {
      const norm = mailNorm(query.email);
      if (!norm) return refuse(400, "malformed_request", { email: "which address" });
      return ok({
        email: norm,
        consent: mailConsentView(norm),
        suppressions: mailSuppressions
          .filter((row) => row.email_norm === norm)
          .map(mailSuppressionView),
        messages: mailMessages
          .filter((row) => row.email_norm === norm)
          .sort((a, b) => (b.sent_at ?? b.scheduled_at).localeCompare(a.sent_at ?? a.scheduled_at))
          .slice(0, 200)
          .map((row) => mailMessageView(row)),
        enrolments: mailEnrolments
          .filter((row) => row.email_norm === norm)
          .map((row) => ({
            enrolment_id: row.id,
            sequence_id: row.sequence_id,
            state: row.state,
            outcome: row.outcome,
            exit_reason: row.exit_reason,
            enrolled_at: row.enrolled_at,
          })),
      });
    },
  },
  {
    method: "GET",
    pattern: "public/mail/unsubscribe/{token}",
    handler: ({ params }) => {
      const message = mailMessageForToken(String(params.token ?? ""));
      if (!message) return refuse(404, "not_found");
      return ok(mailUnsubscribeView(message));
    },
  },
  {
    method: "POST",
    pattern: "public/mail/unsubscribe",
    handler: ({ body }) => {
      const message = mailMessageForToken(String(body.token ?? ""));
      if (!message) return refuse(404, "not_found");
      const mode = String(body.mode ?? "one_click");
      if (!["one_click", "all", "topics", "sales"].includes(mode))
        return refuse(400, "malformed_request", { mode: "one of one_click, all, topics, sales" });
      const norm = message.email_norm;
      const existing = mailConsent.get(norm);
      const consent: MailConsentRow = existing
        ? { ...existing }
        : {
            email_norm: norm,
            marketing_state: "unknown",
            topics_off: [],
            sales_stop: false,
            lawful_basis: "",
            source: "",
            timezone: "",
            updated_at: now(),
          };
      let cancelled = 0;
      if (message.topic === "sales" || mode === "sales") {
        consent.sales_stop = true;
        for (const enrolment of mailEnrolments)
          if (enrolment.email_norm === norm && ["active", "paused"].includes(enrolment.state))
            mailExit(enrolment, "UNSUBSCRIBED", "unsubscribe", "", "the stop link");
      } else if (mode === "topics") {
        const chosen = Array.isArray(body.topics_off)
          ? body.topics_off.map(String).filter((topic) => MAIL_MARKETING_TOPICS.includes(topic))
          : [];
        consent.topics_off = [...new Set(chosen)];
        if (chosen.length >= MAIL_MARKETING_TOPICS.length) consent.marketing_state = "unsubscribed";
        else if (consent.marketing_state === "unsubscribed") consent.marketing_state = "subscribed";
      } else {
        consent.marketing_state = "unsubscribed";
        mailSuppress(
          norm,
          "unsubscribe",
          mode === "one_click" ? "one_click" : "landing_page",
          mode,
        );
        for (const row of mailMessages)
          if (
            row.email_norm === norm &&
            row.kind === "campaign" &&
            ["pending", "retry", "held"].includes(row.state)
          ) {
            row.state = "cancelled";
            row.skip_reason = "UNSUBSCRIBED";
            cancelled += 1;
          }
      }
      consent.updated_at = now();
      consent.source = mode === "one_click" ? "one_click" : "landing_page";
      mailConsent.set(norm, consent);
      if (!message.unsubscribed_at) {
        message.unsubscribed_at = now();
        const campaign = mailCampaigns.find((row) => row.id === message.campaign_id);
        if (campaign && !message.is_seed) campaign.counts.unsubscribed += 1;
      }
      audit("mail.unsubscribed", null, "mail_message", message.id, "", { mode });
      return ok({ ...mailUnsubscribeView(message), done: true, cancelled });
    },
  },
);

seedTeam();
seedOpenReview();
seedPeopleOps();
seedViews();
seedPasskeys();
seedApprovals();
seedSecurityEvents();
seedMail();
// Seeded after everything they point at (companies, deals, tickets, approvals).
seedReceivables();
seedPrivacy();
seedInspection();
seedSuccess();
seedSecurityFeed();
seedReadWatch();
seedInbox();

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
      const back = new URL(`${PORTAL_ORIGIN}/admin/integrations/calendar/callback`);
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
  resetInbox();
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
  seedPasskeys();
  seedApprovals();
  seedSecurityEvents();
  seedSecurityFeed();
  seedReadWatch();
  seedMail();
  seedSla();
  resetDeskRules();
  seedSources();
  seedPlans();
  seedReceivables();
  seedPrivacy();
  seedInspection();
  seedSuccess();
  seedInbox();
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
    const watched = method === "GET" ? WATCHED_READS[entry.pattern] : undefined;
    if (watched) {
      const refused = gateRead(found);
      if (refused) return refused;
      const answer = entry.handler({ method, route, params, query, body, headers });
      if (answer.status === 200)
        noteRead(found, watched[0], String(params[watched[1]] ?? ""), clientAddress(headers));
      return answer;
    }
  }
  return entry.handler({ method, route, params, query, body, headers });
}

server.listen(PORT, "127.0.0.1", () => {
  console.log(`[mock-hq] serving http://127.0.0.1:${PORT}${PREFIX}`);
  console.log("[mock-hq] personas: owner@ admin@ sales@ support@ intern@ newbie@hq.test");
  console.log("[mock-hq] every TOTP prompt accepts 000000; recovery codes mockr-code0..9");
});
