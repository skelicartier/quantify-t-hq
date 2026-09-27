import { ButtonLink } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";

type PaginationProps = {
  offset: number;
  limit: number;
  returned: number;
  hasMore: boolean;
  nextOffset: number | null;
  buildHref: (offset: number, limit: number) => string;
  noun?: string;
};

/**
 * Previous/Next links plus a one-line summary. The hrefs come from the caller so the
 * parameter order (offset, limit, filters) stays part of each page's contract.
 */
export function Pagination({
  offset,
  limit,
  returned,
  hasMore,
  nextOffset,
  buildHref,
  noun = "records",
}: PaginationProps) {
  const start = returned > 0 ? offset + 1 : 0;
  const end = offset + returned;
  return (
    <nav className="pagination" aria-label="Pagination">
      <span className="toolbar__summary">
        {returned > 0
          ? `Showing ${formatNumber(start)}–${formatNumber(end)}${hasMore ? " of more" : ""} ${noun}`
          : `No ${noun} on this page`}
      </span>
      {offset > 0 && (
        <ButtonLink size="small" href={buildHref(Math.max(0, offset - limit), limit)}>
          Previous
        </ButtonLink>
      )}
      {hasMore && nextOffset !== null && (
        <ButtonLink size="small" href={buildHref(nextOffset, limit)}>
          Next
        </ButtonLink>
      )}
    </nav>
  );
}
