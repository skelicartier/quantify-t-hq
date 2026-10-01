import Link from "next/link";

import { Wordmark } from "@/components/brand/wordmark";

type BrandMarkProps = {
  /** The phone bar's smaller size. */
  compact?: boolean;
  href?: string;
};

/**
 * The brand at the top of the rail and the phone bar: the wordmark alone, the same one
 * every document carries. A collapsed rail has no room for it and shows none.
 */
export function BrandMark({ compact = false, href = "/home" }: BrandMarkProps) {
  return (
    <Link className="brand" href={href} aria-label="Quantify Terminal HQ, home">
      <Wordmark size={compact ? "small" : "rail"} />
    </Link>
  );
}
