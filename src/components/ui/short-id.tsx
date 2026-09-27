import Link from "next/link";

type ShortIdProps = {
  value: string;
  href?: string;
  full?: boolean;
};

/**
 * An identifier rendered in full in the DOM (selection and tests see the whole value)
 * but visually truncated; the full value is also the tooltip.
 */
export function ShortId({ value, href, full }: ShortIdProps) {
  const code = (
    <code
      className={["short-id", full ? "short-id--full" : ""].filter(Boolean).join(" ")}
      title={value}
    >
      {value}
    </code>
  );
  if (!href) return code;
  return (
    <Link href={href} className="row-link">
      {code}
    </Link>
  );
}
