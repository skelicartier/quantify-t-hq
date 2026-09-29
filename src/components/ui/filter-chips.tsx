import Link from "next/link";

/**
 * The filters a list is under, each one removable: "Stage: Qualified ×". The chips read
 * the URL and change it; nothing is stored. A list with one filter dimension shows it in
 * its filter strip already, so chips are for lists that combine several.
 */

export type FilterChip = {
  key: string;
  label: string;
  value: string;
  /** The same list without this filter. */
  removeHref: string;
};

export function FilterChips({
  chips,
  clearHref,
}: {
  chips: readonly FilterChip[];
  clearHref: string;
}) {
  if (chips.length === 0) return null;
  return (
    <ul className="chips" aria-label="Active filters">
      {chips.map((chip) => (
        <li key={chip.key} className="chip">
          <span className="chip__label">{chip.label}</span>
          <span className="chip__value">{chip.value}</span>
          <Link
            className="chip__remove"
            href={chip.removeHref}
            aria-label={`Remove ${chip.label} filter`}
          >
            ×
          </Link>
        </li>
      ))}
      {chips.length > 1 && (
        <li className="chip chip--clear">
          <Link href={clearHref}>Clear all</Link>
        </li>
      )}
    </ul>
  );
}
