/**
 * A provider for walking Mail merge in a browser: it answers as the real one does and
 * sends nothing, so every screen of a live send can be exercised with no key and no mail.
 * Used only by `scripts/e2e-mail-merge-sender.ts`; the sender itself never loads this.
 */

import { walkMixOf } from "../../src/lib/merge/delivery-contracts";
import type {
  AccountCheck,
  Blocked,
  EventPage,
  EventQuery,
  MailProvider,
  OutgoingMail,
  ProviderEvent,
  SendResult,
  SenderCheck,
} from "./provider";

export const WALK_KEY = "xkeysib-walk-0000000000000000000000000000000000000000000000000000-wxyz";

/**
 * Every message the stand-in answered "sent", so it can say afterwards what "happened" to
 * each (delivery spec §5.6). Module level, because the engine makes a new provider for
 * every call.
 */
const ACCEPTED: { email: string; message_id: string; tags: string[]; at: number }[] = [];
let sentCount = 0;

/** Forget every accepted message (tests). */
export function resetWalkEvents(): void {
  ACCEPTED.length = 0;
}

export class WalkProvider implements MailProvider {
  readonly kind = "live" as const;
  readonly #key: string;
  readonly #sent: (mail: OutgoingMail) => void;

  constructor(key: string, sent: (mail: OutgoingMail) => void) {
    this.#key = key;
    this.#sent = sent;
  }

  async send(mail: OutgoingMail): Promise<SendResult> {
    const base = { message_id: "", error_code: "", retry_after_seconds: null };
    if (mail.to_email.startsWith("refused"))
      return { ...base, status: "failed", error_code: "invalid_parameter" };
    this.#sent(mail);
    sentCount += 1;
    const at = Date.now();
    const message_id = `<walk-${sentCount}-${at}@walk.invalid>`;
    ACCEPTED.push({ email: mail.to_email, message_id, tags: [...mail.tags], at });
    return { ...base, status: "sent", message_id };
  }

  /**
   * The mix of `walkMixOf` for every accepted message, oldest first. It includes events
   * the reader must drop: opens, clicks, and everything about a test of the wording.
   */
  async listEvents(query: EventQuery): Promise<EventPage> {
    if (this.#key !== WALK_KEY) return { status: "auth_failed" };
    const events: ProviderEvent[] = [];
    for (const message of ACCEPTED) {
      if (query.tags !== null && !query.tags.some((tag) => message.tags.includes(tag))) continue;
      for (const item of walkMixOf(message.email))
        events.push({
          email: message.email,
          date: new Date(message.at + item.offset_ms).toISOString(),
          message_id: message.message_id,
          event: item.event,
          reason: item.reason,
          tag: message.tags[0] ?? "",
        });
    }
    events.sort(
      (a, b) =>
        a.date.localeCompare(b.date) ||
        a.message_id.localeCompare(b.message_id) ||
        a.event.localeCompare(b.event),
    );
    return { status: "ok", events: events.slice(query.offset, query.offset + query.limit) };
  }

  async checkAccount(): Promise<AccountCheck> {
    return this.#key === WALK_KEY
      ? { status: "ok", email: "walk@walk.invalid", company: "Walk", plan: "free", credits: 300 }
      : { status: "auth_failed", email: "", company: "", plan: "", credits: null };
  }

  async checkSender(email: string): Promise<SenderCheck> {
    return {
      status: "ok",
      domain: email.split("@")[1] ?? "",
      sender_known: true,
      sender_active: true,
      domain_known: true,
      domain_authenticated: true,
    };
  }

  async listBlocked(): Promise<Blocked[]> {
    return [{ email: "bounced@walk.invalid", reason: "hardBounce", blocked_at: "" }];
  }
}
