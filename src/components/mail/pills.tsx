import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import {
  CAMPAIGN_STATE_LABELS,
  MESSAGE_STATE_LABELS,
  type MailCampaign,
} from "@/lib/api/mail-schema";

const CAMPAIGN_TONES: Record<MailCampaign["state"], PillTone> = {
  draft: "neutral",
  review: "attention",
  approved: "attention",
  scheduled: "attention",
  running: "live",
  paused: "attention",
  auto_paused: "danger",
  completed: "live",
  cancelled: "neutral",
};

export function CampaignStatePill({ state }: { state: MailCampaign["state"] }) {
  return (
    <StatusPill value={state} label={CAMPAIGN_STATE_LABELS[state]} tone={CAMPAIGN_TONES[state]} />
  );
}

const MESSAGE_TONES: Record<string, PillTone> = {
  pending: "neutral",
  held: "attention",
  retry: "attention",
  claimed: "attention",
  unknown: "attention",
  sent: "live",
  delivered: "live",
  dry_run: "neutral",
  soft_bounced: "attention",
  hard_bounced: "danger",
  complained: "danger",
  failed: "danger",
  unsubscribed: "neutral",
  skipped: "neutral",
  cancelled: "neutral",
};

export function MessageStatePill({ state }: { state: string }) {
  return (
    <StatusPill
      value={state}
      label={MESSAGE_STATE_LABELS[state] ?? state}
      tone={MESSAGE_TONES[state] ?? "neutral"}
    />
  );
}

const ENROLMENT_TONES: Record<string, PillTone> = {
  active: "live",
  paused: "attention",
  completed: "neutral",
  exited: "neutral",
};
const ENROLMENT_LABELS: Record<string, string> = {
  active: "In sequence",
  paused: "Paused",
  completed: "Finished",
  exited: "Ended",
};

export function EnrolmentStatePill({ state }: { state: string }) {
  return (
    <StatusPill
      value={state}
      label={ENROLMENT_LABELS[state] ?? state}
      tone={ENROLMENT_TONES[state] ?? "neutral"}
    />
  );
}

/** A percentage beside its count, never alone; a dash when there is nothing to divide. */
export function Rate({ part, whole, pct }: { part: number; whole: number; pct: number | null }) {
  if (pct === null || whole === 0) return <span className="table-sub">—</span>;
  return (
    <>
      {part}
      <span className="table-sub">{pct.toFixed(pct < 1 && pct > 0 ? 2 : 1)}%</span>
    </>
  );
}

/** One decimal, or two under one per cent, so 0.08% never reads as 0.1% or 0%. */
export function formatPct(value: number): string {
  return `${value.toFixed(value > 0 && value < 1 ? 2 : 1)}%`;
}

/**
 * Why the queue put a message back, in words: the worker writes a short code
 * (`cap reached: sender`, `3 to example.com today already`); people read this.
 */
export function deferralText(lastError: string): string {
  const text = lastError.trim();
  if (!text) return "";
  if (text === "cap reached: global") return "Daily limit reached";
  if (text === "cap reached: sender") return "Sender's daily limit reached";
  if (text === "cap reached: hour") return "Hourly limit reached";
  if (text === "outside the recipient's window") return "Outside their working hours";
  if (text === "SENDER_UNVERIFIED") return "The sender is not verified yet";
  if (text === "provider refused the key") return "The provider refused the key; sending is off";
  const domain = /^(\d+) to (.+) today already$/.exec(text);
  if (domain) return `${domain[1]} already sent to ${domain[2]} today`;
  return text;
}

/** A URL pattern with break points after each slash, so a narrow column wraps it cleanly. */
export function BreakableUrl({ value }: { value: string }) {
  const parts = value.split("/");
  return (
    <>
      {parts.map((part, index) => (
        <span key={index}>
          {part}
          {index < parts.length - 1 && (
            <>
              /<wbr />
            </>
          )}
        </span>
      ))}
    </>
  );
}
