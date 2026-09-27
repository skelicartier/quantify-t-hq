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
