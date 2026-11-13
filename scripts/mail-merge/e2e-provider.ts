/**
 * A provider for walking Mail merge in a browser: it answers as the real one does and
 * sends nothing, so every screen of a live send can be exercised with no key and no mail.
 * Used only by `scripts/e2e-mail-merge-sender.ts`; the sender itself never loads this.
 */

import type {
  AccountCheck,
  Blocked,
  MailProvider,
  OutgoingMail,
  SendResult,
  SenderCheck,
} from "./provider";

export const WALK_KEY = "xkeysib-walk-0000000000000000000000000000000000000000000000000000-wxyz";

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
    return { ...base, status: "sent", message_id: `<walk-${Date.now()}@walk.invalid>` };
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
