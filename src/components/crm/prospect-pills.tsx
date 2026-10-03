import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { EMAIL_KIND_SHORT, FIT_LABELS, VERIFIED_LABELS } from "@/lib/crm/prospects";

const FIT_TONES: Record<string, PillTone> = { A: "live", B: "attention", C: "neutral" };

/** The band and the score behind it: "A · 85". The letter carries it, not the colour. */
export function FitPill({ band, score }: { band: string; score: number }) {
  return (
    <span title={FIT_LABELS[band] ?? band}>
      <StatusPill value={band} label={`${band} · ${score}`} tone={FIT_TONES[band] ?? "neutral"} />
    </span>
  );
}

/** "Named", "Shared" or "Free mail", and what a verification said when one ran. */
export function AddressKind({ kind, verified }: { kind: string; verified: string }) {
  return (
    <>
      {EMAIL_KIND_SHORT[kind] ?? "Not judged"}
      {verified && <span className="table-sub">{VERIFIED_LABELS[verified] ?? verified}</span>}
    </>
  );
}

export function TagList({ tags }: { tags: readonly string[] }) {
  if (tags.length === 0) return <span className="side-quiet">None</span>;
  return (
    <span className="tag-row">
      {tags.map((tag) => (
        <span key={tag} className="tag">
          {tag}
        </span>
      ))}
    </span>
  );
}
