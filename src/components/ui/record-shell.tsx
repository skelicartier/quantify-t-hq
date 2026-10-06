import Link from "next/link";
import type { ReactNode } from "react";

import { FavouriteStar, type Favourite } from "@/components/shell/favourites";

type Crumb = { href: string; label: string };

type RecordHeaderProps = {
  crumbs?: readonly Crumb[];
  title: ReactNode;
  /** A status pill and the like, beside the name. */
  status?: ReactNode;
  /** Three or four inline readouts: mono label, tabular value. */
  readouts?: readonly { label: string; value: ReactNode }[];
  actions?: ReactNode;
  /** Pinnable to the rail, on this device. */
  favourite?: Favourite | undefined;
};

/**
 * A record's head: where it sits, what it is called, how it stands, and what can be
 * done to it — one sticky row under the context bar, so the actions are always in reach.
 */
export function RecordHeader({
  crumbs = [],
  title,
  status,
  readouts = [],
  actions,
  favourite,
}: RecordHeaderProps) {
  return (
    <header className="rhead">
      <div className="rhead__lead">
        {crumbs.length > 0 && (
          <nav className="rhead__crumbs" aria-label="Breadcrumb">
            {crumbs.map((crumb, index) => (
              <span key={crumb.href}>
                {index > 0 && (
                  <span className="rhead__sep" aria-hidden="true">
                    ›
                  </span>
                )}
                <Link href={crumb.href}>{crumb.label}</Link>
              </span>
            ))}
          </nav>
        )}
        <div className="rhead__title-row">
          <h1 className="rhead__title">{title}</h1>
          {favourite && <FavouriteStar {...favourite} />}
          {status && <div className="rhead__status">{status}</div>}
        </div>
      </div>
      {readouts.length > 0 && (
        <dl className="rhead__readouts">
          {readouts.map((readout) => (
            <div key={readout.label} className="rhead__readout">
              <dt>{readout.label}</dt>
              <dd>{readout.value}</dd>
            </div>
          ))}
        </dl>
      )}
      {actions && <div className="rhead__actions">{actions}</div>}
    </header>
  );
}

type Tab = { key: string; label: string; count?: number | undefined };

type RecordTabsProps = {
  base: string;
  tabs: readonly Tab[];
  current: string;
  label: string;
};

/** URL-addressed tabs (`?tab=`): the first tab is the bare URL. */
export function RecordTabs({ base, tabs, current, label }: RecordTabsProps) {
  return (
    <nav className="rtabs" aria-label={label}>
      {tabs.map((tab, index) => {
        const href = index === 0 ? base : `${base}?tab=${tab.key}`;
        const active = current === tab.key || (index === 0 && !tabs.some((t) => t.key === current));
        return (
          <Link key={tab.key} href={href} aria-current={active ? "page" : undefined}>
            {tab.label}
            {tab.count !== undefined && <span className="rtabs__count">{tab.count}</span>}
          </Link>
        );
      })}
    </nav>
  );
}

/** Which tab a page shows, from its search params; the first tab when none is named. */
export function currentTab(raw: string | undefined, tabs: readonly Tab[]): string {
  const first = tabs[0]?.key ?? "";
  if (!raw) return first;
  return tabs.some((tab) => tab.key === raw) ? raw : first;
}

/** Body on the left, properties on the right. */
export function RecordGrid({ children, side }: { children: ReactNode; side: ReactNode }) {
  return (
    <div className="record-layout rgrid">
      <div className="record-layout__main rgrid__main">{children}</div>
      <aside className="record-layout__side rgrid__side">{side}</aside>
    </div>
  );
}

/** A titled group of properties in the side panel. */
export function Properties({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="props" aria-label={title}>
      <h2 className="props__title">{title}</h2>
      <dl className="props__list">{children}</dl>
    </section>
  );
}

/** A read-only property row, for values the panel shows but nobody edits here. */
export function Property({
  label,
  children,
  mono,
}: {
  label: string;
  children: ReactNode;
  mono?: boolean;
}) {
  return (
    <div className="prop">
      <dt className="prop__label">{label}</dt>
      <dd className={mono ? "prop__value mono" : "prop__value"}>{children}</dd>
    </div>
  );
}

/** A titled block in the record body. */
export function RecordSection({
  id,
  title,
  actions,
  children,
}: {
  id: string;
  title: string;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className="rsection" aria-labelledby={id} data-section={id}>
      <div className="rsection__head">
        <h2 className="rsection__title" id={id}>
          {title}
        </h2>
        {actions && <div className="rsection__actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
