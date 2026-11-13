/**
 * The mail provider behind a send: one message, one call, one answer.
 *
 * The same provider, endpoint and classification as the service's own
 * (`account_api/hq/mail_provider.py`), so what is learned here holds there: an answer is
 * sent, failed, retry, auth_failed or unknown, and only the provider's machine `code` is
 * kept from a refusal, never its prose, which can echo the address. A lost answer is
 * `unknown` and is never sent again: the provider may have taken it.
 */

import { appendFileSync } from "node:fs";

export type OutgoingMail = {
  to_email: string;
  to_name: string;
  from_email: string;
  from_name: string;
  reply_to: string;
  subject: string;
  html: string;
  text: string;
  headers: Record<string, string>;
  tags: string[];
  /** Files sent with it (Data's "Send by email"): base64 content. The sender never sets it. */
  attachments?: { name: string; content: string }[];
};

export type SendResult = {
  status: "sent" | "retry" | "failed" | "unknown" | "auth_failed";
  message_id: string;
  error_code: string;
  retry_after_seconds: number | null;
};

export type CheckStatus = "ok" | "auth_failed" | "unavailable" | "not_configured";

export type AccountCheck = {
  status: CheckStatus;
  email: string;
  company: string;
  plan: string;
  /** Sends the plan has left, where the provider says; null where it does not. */
  credits: number | null;
};

export type SenderCheck = {
  status: CheckStatus;
  domain: string;
  sender_known: boolean;
  sender_active: boolean;
  domain_known: boolean;
  domain_authenticated: boolean;
};

export type Blocked = { email: string; reason: string; blocked_at: string };

export interface MailProvider {
  /** live: mail leaves. practice: it is written down and goes nowhere. */
  readonly kind: "live" | "practice";
  send(mail: OutgoingMail): Promise<SendResult>;
  checkAccount(): Promise<AccountCheck>;
  checkSender(email: string): Promise<SenderCheck>;
  listBlocked(limit?: number): Promise<Blocked[]>;
}

const SEND = "https://api.brevo.com/v3/smtp/email";
const ACCOUNT = "https://api.brevo.com/v3/account";
const BLOCKED = "https://api.brevo.com/v3/smtp/blockedContacts";
const SENDERS = "https://api.brevo.com/v3/senders";
const DOMAINS = "https://api.brevo.com/v3/senders/domains";
const TIMEOUT_MS = 15_000;

export function domainOf(email: string): string {
  return email.trim().toLowerCase().split("@").pop() ?? "";
}

function result(
  status: SendResult["status"],
  extra: Partial<Omit<SendResult, "status">> = {},
): SendResult {
  return { status, message_id: "", error_code: "", retry_after_seconds: null, ...extra };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function rows(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(record) : [];
}

/** The provider's sender and domain lists, read defensively: an odd shape is "not listed". */
export function senderCheckFromLists(
  email: string,
  senders: unknown,
  domains: unknown,
): SenderCheck {
  const address = email.trim().toLowerCase();
  const domain = domainOf(address);
  const sender = rows(record(senders).senders).find(
    (row) =>
      String(row.email ?? "")
        .trim()
        .toLowerCase() === address,
  );
  // The domain must be the address's own: a parent's signature does not cover a subdomain.
  const found = rows(record(domains).domains).find(
    (row) =>
      String(row.domain_name ?? "")
        .trim()
        .toLowerCase() === domain,
  );
  return {
    status: "ok",
    domain,
    sender_known: sender !== undefined,
    sender_active: Boolean(sender?.active),
    domain_known: found !== undefined,
    domain_authenticated: Boolean(found?.authenticated),
  };
}

type Fetcher = typeof fetch;

export class BrevoProvider implements MailProvider {
  readonly kind = "live" as const;
  readonly #key: string;
  readonly #fetch: Fetcher;
  readonly #timeout: number;

  constructor(key: string, fetcher: Fetcher = fetch, timeoutMs = TIMEOUT_MS) {
    this.#key = key.trim();
    this.#fetch = fetcher;
    this.#timeout = timeoutMs;
  }

  #call(url: string, body?: unknown): Promise<Response> {
    return this.#fetch(url, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        accept: "application/json",
        "content-type": "application/json",
        "api-key": this.#key,
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      signal: AbortSignal.timeout(this.#timeout),
    });
  }

  async send(mail: OutgoingMail): Promise<SendResult> {
    if (!this.#key) return result("auth_failed", { error_code: "not_configured" });
    const payload: Record<string, unknown> = {
      sender: { email: mail.from_email, name: mail.from_name || mail.from_email },
      to: [{ email: mail.to_email, ...(mail.to_name ? { name: mail.to_name } : {}) }],
      subject: mail.subject,
      htmlContent: mail.html,
      textContent: mail.text,
      tags: mail.tags.slice(0, 10),
    };
    if (mail.reply_to) payload.replyTo = { email: mail.reply_to };
    if (Object.keys(mail.headers).length > 0) payload.headers = mail.headers;
    if (mail.attachments && mail.attachments.length > 0)
      payload.attachment = mail.attachments.map(({ name, content }) => ({ name, content }));
    let response: Response;
    try {
      response = await this.#call(SEND, payload);
    } catch (error) {
      // The request may have been taken before the answer was lost: never resend on it.
      const name = error instanceof Error ? error.name : "";
      if (name === "TimeoutError" || name === "AbortError")
        return result("unknown", { error_code: "timeout" });
      return result("retry", { error_code: "unreachable" });
    }
    const parsed = record(await response.json().catch(() => ({})));
    if (response.ok)
      return result("sent", { message_id: String(parsed.messageId ?? "").slice(0, 200) });
    const code = String(parsed.code ?? "").slice(0, 40) || String(response.status);
    if (response.status === 401 || response.status === 403)
      return result("auth_failed", { error_code: code });
    if (response.status === 429) {
      const after = Number.parseInt(response.headers.get("retry-after") ?? "", 10);
      return result("retry", {
        error_code: "rate_limited",
        retry_after_seconds: Number.isFinite(after) ? after : null,
      });
    }
    if (response.status >= 400 && response.status < 500)
      return result("failed", { error_code: code });
    return result("retry", { error_code: String(response.status) });
  }

  async checkAccount(): Promise<AccountCheck> {
    const none = { email: "", company: "", plan: "", credits: null };
    if (!this.#key) return { status: "not_configured", ...none };
    try {
      const response = await this.#call(ACCOUNT);
      if (response.status === 401 || response.status === 403)
        return { status: "auth_failed", ...none };
      if (!response.ok) return { status: "unavailable", ...none };
      const parsed = record(await response.json());
      const plans = rows(parsed.plan);
      const sending = plans.find((plan) => plan.creditsType === "sendLimit") ?? plans[0];
      const credits = Number(sending?.credits);
      return {
        status: "ok",
        email: String(parsed.email ?? "").slice(0, 254),
        company: String(parsed.companyName ?? "").slice(0, 120),
        plan: String(sending?.type ?? "").slice(0, 40),
        credits: Number.isFinite(credits) ? credits : null,
      };
    } catch {
      return { status: "unavailable", ...none };
    }
  }

  async checkSender(email: string): Promise<SenderCheck> {
    const none = {
      domain: domainOf(email),
      sender_known: false,
      sender_active: false,
      domain_known: false,
      domain_authenticated: false,
    };
    if (!this.#key) return { status: "not_configured", ...none };
    try {
      const lists: unknown[] = [];
      for (const url of [SENDERS, DOMAINS]) {
        const response = await this.#call(url);
        if (response.status === 401 || response.status === 403)
          return { status: "auth_failed", ...none };
        if (!response.ok) return { status: "unavailable", ...none };
        lists.push(await response.json());
      }
      return senderCheckFromLists(email, lists[0], lists[1]);
    } catch {
      return { status: "unavailable", ...none };
    }
  }

  async listBlocked(limit = 500): Promise<Blocked[]> {
    if (!this.#key) return [];
    try {
      const response = await this.#call(`${BLOCKED}?limit=${Math.trunc(limit)}&offset=0`);
      if (!response.ok) return [];
      return rows(record(await response.json()).contacts).map((item) => ({
        email: String(item.email ?? ""),
        reason: String(record(item.reason).code ?? ""),
        blocked_at: String(item.blockedAt ?? ""),
      }));
    } catch {
      return [];
    }
  }
}

/**
 * A provider that writes down what it would have sent and sends nothing: a whole run can
 * be rehearsed, every person's message read, before a key is anywhere near it.
 */
export class PracticeProvider implements MailProvider {
  readonly kind = "practice" as const;
  readonly #outbox: string;
  #count = 0;

  constructor(outboxFile: string) {
    this.#outbox = outboxFile;
  }

  async send(mail: OutgoingMail): Promise<SendResult> {
    this.#count += 1;
    appendFileSync(
      this.#outbox,
      `${JSON.stringify({ at: new Date().toISOString(), to: mail.to_email, subject: mail.subject })}\n`,
      { mode: 0o600 },
    );
    return result("sent", {
      message_id: `<practice-${Date.now()}-${this.#count}@practice.invalid>`,
    });
  }

  async checkAccount(): Promise<AccountCheck> {
    return { status: "not_configured", email: "", company: "", plan: "", credits: null };
  }

  async checkSender(email: string): Promise<SenderCheck> {
    return {
      status: "not_configured",
      domain: domainOf(email),
      sender_known: false,
      sender_active: false,
      domain_known: false,
      domain_authenticated: false,
    };
  }

  async listBlocked(): Promise<Blocked[]> {
    return [];
  }
}
