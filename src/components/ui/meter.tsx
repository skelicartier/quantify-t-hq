export type MeterTone = "default" | "attention" | "danger" | "success";

type MeterProps = {
  /** What the bar is measuring, for assistive technology. */
  label: string;
  value: number;
  /** `null` means unlimited: there is no ceiling to draw, so nothing is drawn. */
  limit: number | null | undefined;
  tone?: MeterTone | undefined;
};

/**
 * A single spend against a single ceiling, drawn as one flat bar.
 *
 * The numbers themselves are always rendered as text beside it — the bar is the
 * scannable form of a fact the reader can already read, never the only place it
 * appears — so the element carries one label and nothing else.
 */
export function Meter({ label, value, limit, tone = "default" }: MeterProps) {
  if (limit === null || limit === undefined || limit <= 0) return null;
  const ratio = Math.min(1, Math.max(0, value / limit));
  return (
    <div className="meter" role="img" aria-label={label}>
      <div className="meter__track">
        <div
          className={["meter__fill", tone !== "default" ? `meter__fill--${tone}` : ""]
            .filter(Boolean)
            .join(" ")}
          style={{ inlineSize: `${Math.round(ratio * 1000) / 10}%` }}
        />
      </div>
    </div>
  );
}
