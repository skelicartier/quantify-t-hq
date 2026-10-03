import Link from "next/link";

import type { Facet } from "@/lib/api/crm";
import { FACETS, facetLabel } from "@/lib/crm/prospects";
import { formatNumber } from "@/lib/format";

const SHOWN = 6;

/**
 * How the view breaks down, field by field: every value with the number of leads that
 * carry it. Each row is a link that narrows the view to that value, or widens it again
 * when it is the one already applied — so the list organises itself as it is read.
 */
export function FacetPanel({
  facets,
  total,
  stageLabels,
  hrefFor,
  isActive,
}: {
  facets: Record<string, Facet>;
  total: number;
  stageLabels: Record<string, string>;
  /** The list narrowed to (or released from) one value of one field. */
  hrefFor: (field: string, value: string) => string;
  isActive: (field: string, value: string) => boolean;
}) {
  // Bands and stages read in their own order, best and earliest first; everything else
  // most leads first, as the service sends it.
  const ordered = (field: string, entries: Facet): Facet => {
    if (field === "fit_band") return [...entries].sort((a, b) => a.value.localeCompare(b.value));
    if (field === "stage") {
      const order = Object.keys(stageLabels);
      return [...entries].sort((a, b) => order.indexOf(a.value) - order.indexOf(b.value));
    }
    return entries;
  };
  const groups = FACETS.map((facet) => ({
    ...facet,
    entries: ordered(facet.field, facets[facet.field] ?? []),
  })).filter((group) => group.entries.length > 0);
  if (groups.length === 0 || total === 0) return null;
  return (
    <details className="facets-panel" open>
      <summary className="facets-panel__summary">How this view breaks down</summary>
      <div className="facets">
        {groups.map((group) => {
          const largest = Math.max(...group.entries.map((entry) => entry.count), 1);
          const rest = group.entries.length - SHOWN;
          return (
            <section key={group.field} className="facets__group" aria-label={group.title}>
              <h3 className="facets__title">{group.title}</h3>
              <ul className="facets__list">
                {group.entries.slice(0, SHOWN).map((entry) => {
                  const active = isActive(group.field, entry.value);
                  return (
                    <li key={entry.value || "none"}>
                      <Link
                        className="facets__row"
                        href={hrefFor(group.field, entry.value)}
                        aria-current={active ? "true" : undefined}
                        title={active ? "Showing only these; press to show all" : "Show only these"}
                      >
                        <span className="facets__label">
                          {facetLabel(group.field, entry.value, stageLabels)}
                        </span>
                        <span className="facets__count">{formatNumber(entry.count)}</span>
                        <span className="facets__bar" aria-hidden="true">
                          <span style={{ width: `${(entry.count / largest) * 100}%` }} />
                        </span>
                      </Link>
                    </li>
                  );
                })}
              </ul>
              {rest > 0 && (
                <p className="facets__more">
                  and {formatNumber(rest)} more; filter by {group.title.toLowerCase()} to reach them
                </p>
              )}
            </section>
          );
        })}
      </div>
    </details>
  );
}
