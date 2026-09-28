import type { ReactNode } from "react";

type Crumb = { href: string; label: string };

type PageHeaderProps = {
  /** Kept for callers; the context bar carries the section now, so it is not drawn. */
  eyebrow?: ReactNode;
  title: ReactNode;
  titleId?: string;
  /** What the page is for, in a sentence. Behind an "About" disclosure, not above the data. */
  description?: ReactNode;
  actions?: ReactNode;
  /** Inline readouts beside the title: a status pill, a count, the live indicator. */
  meta?: ReactNode;
  /** Kept for callers; the context bar draws the path. */
  breadcrumbs?: readonly Crumb[];
};

/**
 * One row: title, inline meta, actions. The sentence that used to sit under every
 * title is one click away instead of 60px of every page.
 */
export function PageHeader({ title, titleId, description, actions, meta }: PageHeaderProps) {
  return (
    <header className="pagebar">
      <div className="pagebar__lead">
        <h1 id={titleId} className="pagebar__title">
          {title}
        </h1>
        {meta && <div className="pagebar__meta">{meta}</div>}
        {description && (
          <details className="pagebar__about">
            <summary aria-label="About this page">About</summary>
            <p>{description}</p>
          </details>
        )}
      </div>
      {actions && <div className="pagebar__actions">{actions}</div>}
    </header>
  );
}
