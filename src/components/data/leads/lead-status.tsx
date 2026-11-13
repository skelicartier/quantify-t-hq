import { StatusPill } from "@/components/ui/status-pill";
import { LEAD_STATUSES, labelOf, toneOf } from "@/lib/data/labels";

/** A lead's one status, as every list and record shows it: the pill, and its line under it. */
export function LeadStatus({ status, detail }: { status: string; detail?: string | undefined }) {
  return (
    <>
      <StatusPill
        value={status}
        label={labelOf(LEAD_STATUSES, status)}
        tone={toneOf(LEAD_STATUSES, status)}
      />
      {detail && <span className="table-sub">{detail}</span>}
    </>
  );
}

/** "Referral", "Copied on a yes", "Investor": where a lead came from that a list should say. */
export function LeadBadges({ badges }: { badges: readonly string[] }) {
  if (badges.length === 0) return null;
  return (
    <span className="hqdata-badges">
      {badges.map((badge) => (
        <StatusPill key={badge} value={badge} label={badge} tone="neutral" />
      ))}
    </span>
  );
}
