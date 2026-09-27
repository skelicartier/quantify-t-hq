import Link from "next/link";
import type { ReactNode } from "react";

type ToolbarProps = {
  summary?: ReactNode;
  start?: ReactNode;
  end?: ReactNode;
};

export function Toolbar({ summary, start, end }: ToolbarProps) {
  return (
    <div className="toolbar">
      <div className="toolbar__group">
        {summary && <span className="toolbar__summary">{summary}</span>}
        {start}
      </div>
      {end && <div className="toolbar__group">{end}</div>}
    </div>
  );
}

type SegmentedLinksProps = {
  label: string;
  items: ReadonlyArray<{ href: string; label: string; current: boolean }>;
};

export function SegmentedLinks({ label, items }: SegmentedLinksProps) {
  return (
    <nav className="segmented" aria-label={label}>
      {items.map((item) => (
        <Link key={item.href} href={item.href} aria-current={item.current ? "page" : undefined}>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
