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
import { randomUUID } from "node:crypto";

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
};

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
) {
  auditEvents.unshift({
    occurred_at: now(),
    staff_id: staffId ?? "",
    actor_label: staffId ? "" : "system",
    action,
    entity_type: entity,
    entity_id: entityId,
    reason,
    detail: {},
    correlation_id: `mock-${randomUUID().slice(0, 8)}`,
  });
}

function ok(payload: Record<string, unknown>) {
  return {
    status: 200,
    body: { ok: true, correlation_id: `mock-${randomUUID().slice(0, 12)}`, ...payload },
  };
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

function caller(headers: Record<string, string | string[] | undefined>) {
  const auth = String(headers.authorization ?? "");
  if (!auth.toLowerCase().startsWith("bearer hq_")) return null;
  const session = sessions.get(auth.slice(7));
  if (!session || session.revoked_at) return null;
  session.last_seen_at = now();
  const member = staff.find((row) => row.id === session.staffId);
  return member ? { member, session } : null;
}

const SLA_TARGETS: Record<string, { first: number; next: number }> = {
  urgent: { first: 60, next: 120 },
  high: { first: 240, next: 480 },
  normal: { first: 480, next: 960 },
  low: { first: 1440, next: 2880 },
};

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

function ticketSummary(row: TicketRow) {
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
    sla: slaFor(row),
  };
}

function ticketView(row: TicketRow) {
  return {
    ...ticketSummary(row),
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
    starts_on: null,
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
      return ok(mintSession(member, "203.0.113.9", String(headers["user-agent"] ?? "mock")));
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
      return ok(mintSession(member, "203.0.113.9", String(headers["user-agent"] ?? "mock")));
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
        ...mintSession(member, "203.0.113.9", String(headers["user-agent"] ?? "mock")),
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
    handler: ({ body }) =>
      String(body.token ?? "").startsWith("mock-reset-") && String(body.password ?? "").length >= 12
        ? ok({ reset: true })
        : refuse(401, "unauthenticated"),
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
          current: session.id === found.session.id,
          revoked_at: session.revoked_at,
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
      };
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
        staff: { ...staffView(member), live_sessions: live.length, personal_email: "" },
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
      const role = String(body.role ?? "");
      if (role && role !== member.role) {
        if (member.id === found.member.id) return refuse(403, "forbidden");
        if (["owner", "admin"].includes(role) && found.member.role !== "owner")
          return refuse(403, "forbidden");
        member.role = role as Staff["role"];
        audit("staff.role_changed", found.member.id, "staff", member.id);
      }
      if (typeof body.display_name === "string") member.display_name = body.display_name;
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
      if (member.id === found.member.id) return refuse(403, "forbidden");
      if (!String(body.reason ?? "").trim()) return refuse(400, "malformed_request");
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
      member.is_active = true;
      audit("staff.reactivated", caller(headers)!.member.id, "staff", member.id);
      return ok({ reactivated: true });
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
    handler: ({ query }) => {
      const summaries = tickets.map(ticketSummary);
      const visible = summaries.filter((summary) => {
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
      };
      tickets.push(row);
      audit("ticket.opened", found.member.id, "ticket", row.id);
      return ok({ ticket: ticketView(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/tickets/{ticket_id}",
    auth: true,
    capability: "tickets:read",
    handler: ({ params }) => {
      const row = tickets.find((ticket) => ticket.id === params.ticket_id);
      if (!row) return refuse(404, "not_found");
      row.staff_last_read_at = now();
      return ok({ ticket: ticketView(row) });
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
      audit("ticket.replied", found.member.id, "ticket", row.id);
      return ok({ ticket: ticketView(row) });
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
      return ok({ ticket: ticketView(row) });
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
      return ok({ ticket: ticketView(row) });
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
    handler: ({ params }) => {
      void params;
      return ok({ events: auditEvents.slice(0, 50), limit: 50, offset: 0 });
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
};
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
};

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
  });
}
seedCrm();

const SOURCES = [
  { key: "website_early_access", label: "Early access form" },
  { key: "website_contact", label: "Contact form" },
  { key: "demo_booking", label: "Demo booking" },
  { key: "outbound", label: "Outbound" },
  { key: "referral", label: "Referral" },
  { key: "other", label: "Other" },
];

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
  const domain = email.toLowerCase().split("@")[1] ?? "";
  return FREE_MAIL.has(domain) ? "" : domain;
}

function companyDetailPayload(row: CompanyRow) {
  const linkedPeople = people.filter((person) => person.company_id === row.id).map(personView);
  const companyDeals = deals
    .filter((deal) => deal.company_id === row.id)
    .map((deal) => ({
      ...dealSummary(deal),
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
  return {
    company: companyView(row),
    people: linkedPeople,
    deals: companyDeals,
    accounts,
    open_tasks: openTasks,
    activities: activityViews({ company_id: row.id }),
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
      const payload: Record<string, unknown> = {
        as_of: now(),
        staff: { display_name: found.member.display_name, role: found.member.role },
      };
      if (capabilities.includes("tickets:read")) {
        const open = tickets.filter((row) => row.status === "open");
        const pending = tickets.filter((row) => row.status === "pending");
        const troubled = tickets
          .map(ticketSummary)
          .filter((summary) => ["breached", "at-risk"].includes(summary.sla.status))
          .slice(0, 5);
        payload.desk = {
          open: open.length,
          pending: pending.length,
          unassigned: tickets.filter((row) => !row.assignee_staff_id && row.status !== "resolved")
            .length,
          breached: troubled.filter((summary) => summary.sla.status === "breached").length,
          at_risk: troubled.filter((summary) => summary.sla.status === "at-risk").length,
          tickets: troubled,
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
        payload.deals = {
          open_count: open.length,
          open_mrr: Math.round(open.reduce((sum, view) => sum + view.mrr_amount, 0) * 100) / 100,
          weighted_mrr:
            Math.round(open.reduce((sum, view) => sum + view.weighted_mrr, 0) * 100) / 100,
          neglected: open.filter((view) => view.flags.includes("neglected")).length,
          rotting: open.filter((view) => view.flags.includes("rotting")).length,
          no_next_step: open.filter(
            (view) =>
              view.flags.includes("no_next_step") || view.flags.includes("next_step_overdue"),
          ).length,
          deals: flagged.slice(0, 5),
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
    handler: ({ query }) => {
      const needle = (query.q ?? "").toLowerCase();
      const views = companies
        .filter((row) => !row.archived)
        .filter((row) => !needle || `${row.name} ${row.domain}`.toLowerCase().includes(needle))
        .map((row) => ({
          ...companyView(row),
          people_count: people.filter((person) => person.company_id === row.id).length,
          open_deals: deals.filter((deal) => deal.company_id === row.id && deal.status === "open")
            .length,
          won_mrr: deals
            .filter((deal) => deal.company_id === row.id && deal.status === "won")
            .reduce((sum, deal) => sum + deal.mrr_amount, 0),
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
    handler: ({ params }) => {
      const row = companies.find((company) => company.id === params.company_id);
      if (!row) return refuse(404, "not_found");
      return ok(companyDetailPayload(row));
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
      if ("lifecycle" in body) row.lifecycle = String(body.lifecycle ?? row.lifecycle);
      if ("owner_staff_id" in body) row.owner_staff_id = String(body.owner_staff_id ?? "");
      if ("archived" in body) row.archived = Boolean(body.archived);
      row.updated_at = now();
      audit("company.updated", caller(headers)?.member.id ?? null, "company", row.id);
      return ok({ company: companyView(row) });
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
    pattern: "hq/people/{person_id}/update",
    auth: true,
    capability: "crm:write",
    handler: ({ params, body, headers }) => {
      const row = people.find((person) => person.id === params.person_id);
      if (!row) return refuse(404, "not_found");
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
      audit("person.updated", caller(headers)?.member.id ?? null, "person", row.id);
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
      const found = caller(headers);
      const row: LeadRow = {
        id: randomUUID(),
        source_key: String(body.source_key ?? "") || "outbound",
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
      const stage = String(body.stage ?? "");
      if (stage) {
        if (!["new", "attempting", "connected", "disqualified"].includes(stage))
          return refuse(400, "malformed_request", { stage: "qualify by converting" });
        if (stage === "disqualified") {
          const reason = String(body.disqualify_reason ?? "");
          if (!DISQUALIFY_REASONS.includes(reason))
            return refuse(400, "malformed_request", { disqualify_reason: "pick a reason" });
          row.disqualify_reason = reason;
        }
        row.stage = stage;
      }
      if ("owner_staff_id" in body) row.owner_staff_id = String(body.owner_staff_id ?? "");
      audit("lead.updated", caller(headers)?.member.id ?? null, "lead", row.id);
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
      if (row.stage === "qualified" || row.stage === "disqualified")
        return refuse(400, "malformed_request", { stage: "already closed" });
      const found = caller(headers);
      const companyInput = (body.company ?? {}) as Record<string, unknown>;
      const domain = String(companyInput.domain ?? "").toLowerCase() || domainOf(row.email);
      let company =
        companies.find((candidate) => candidate.id === String(companyInput.company_id ?? "")) ??
        (domain ? companies.find((candidate) => candidate.domain === domain) : undefined);
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
    handler: ({ query }) => {
      const statusFilter = query.status ?? "open";
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
            deals: stageDeals,
            mrr_total:
              Math.round(stageDeals.reduce((sum, view) => sum + view.mrr_amount, 0) * 100) / 100,
            weighted_total:
              Math.round(stageDeals.reduce((sum, view) => sum + view.weighted_mrr, 0) * 100) / 100,
          };
        });
      const open = views.filter((view) => view.status === "open");
      return ok({
        columns,
        totals: {
          open_count: open.length,
          open_mrr: Math.round(open.reduce((sum, view) => sum + view.mrr_amount, 0) * 100) / 100,
          weighted_mrr:
            Math.round(open.reduce((sum, view) => sum + view.weighted_mrr, 0) * 100) / 100,
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
      const row: DealRow = {
        id: randomUUID(),
        name: String(body.name ?? "").trim() || `${company.name} — new business`,
        company_id: company.id,
        primary_person_id: String(body.primary_person_id ?? ""),
        stage_key: stageKey,
        status: "open",
        mrr_amount: Number(body.mrr_amount ?? 0) || 0,
        currency: String(body.currency ?? "USD") || "USD",
        seats: Number(body.seats ?? 1) || 1,
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
      return ok({ deal: dealSummary(row) });
    },
  },
  {
    method: "GET",
    pattern: "hq/deals/{deal_id}",
    auth: true,
    capability: "deals:read",
    handler: ({ params }) => {
      const row = deals.find((deal) => deal.id === params.deal_id);
      if (!row) return refuse(404, "not_found");
      const company = companies.find((candidate) => candidate.id === row.company_id);
      const person = people.find((candidate) => candidate.id === row.primary_person_id);
      return ok({
        deal: { ...dealSummary(row), notes: row.notes },
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
      if ("stage_key" in body || "status" in body)
        return refuse(400, "malformed_request", {
          reason: "move stages via /stage, close via /close",
        });
      if ("name" in body) row.name = String(body.name ?? "").trim() || row.name;
      if ("mrr_amount" in body) row.mrr_amount = Number(body.mrr_amount ?? 0) || 0;
      if ("seats" in body) row.seats = Math.max(Number(body.seats ?? 1) || 1, 1);
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
      audit("deal.updated", caller(headers)?.member.id ?? null, "deal", row.id);
      return ok({ deal: dealSummary(row) });
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
      return ok({ deal: dealSummary(row) });
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
      return ok({ deal: dealSummary(row) });
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
      if (!Object.values(links).some(Boolean))
        return refuse(400, "malformed_request", { reason: "link at least one record" });
      const found = caller(headers);
      recordActivity({
        kind,
        body: text,
        staff_id: found?.member.id ?? "",
        staff_name: found?.member.display_name ?? "",
        ...links,
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
      audit("activity.logged", found?.member.id ?? null, "activity", kind);
      return ok({ logged: true });
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
        pipeline: stagePayload(),
        sources: SOURCES,
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
    pattern: "hq/api-keys",
    auth: true,
    capability: "hq:admin",
    handler: () =>
      ok({
        keys: apiKeys
          .slice()
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .map((row) => ({ ...row })),
        grantable_scopes: ["leads:create"],
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
      };
      apiKeys.push(row);
      audit("api_key.minted", found?.member.id ?? null, "api_key", row.key_id, reason);
      return ok({ key: { ...row }, secret });
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
      if (String(body.website ?? "").trim()) return ok({ received: true });
      const email = String(body.email ?? "")
        .trim()
        .toLowerCase();
      if (!email.includes("@"))
        return refuse(400, "malformed_request", { email: "an address is required" });
      live.last_used_at = now();
      const sourceKey = SOURCES.some((source) => source.key === String(body.source_key ?? ""))
        ? String(body.source_key)
        : "other";
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
