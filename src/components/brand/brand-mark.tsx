import Image from "next/image";
import Link from "next/link";

type BrandMarkProps = {
  compact?: boolean;
  href?: string;
};

/**
 * The Quantify Terminal mark from the marketing site. Both renderings ship so the
 * stylesheet can show the ink version on the light console and the light version
 * everywhere else; the sign-in pages are always dark and only ever show the latter.
 * The files are tiny static PNGs, so they bypass the image optimizer.
 */
export function BrandMark({ compact = false, href = "/home" }: BrandMarkProps) {
  return (
    <Link className="brand" href={href} aria-label="Quantify Terminal HQ home">
      <span className="brand__mark" aria-hidden="true">
        <Image
          className="brand__mark-img brand__mark-img--dark"
          src="/brand/mark-dark.png"
          alt=""
          width={32}
          height={32}
          unoptimized
        />
        <Image
          className="brand__mark-img brand__mark-img--light"
          src="/brand/mark-light.png"
          alt=""
          width={32}
          height={32}
          unoptimized
        />
      </span>
      {!compact && (
        <span className="brand__name">
          <strong>QUANTIFY</strong>
          <span>HQ</span>
        </span>
      )}
    </Link>
  );
}
