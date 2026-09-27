import Link from "next/link";
import type { ReactNode } from "react";

type Crumb = { href: string; label: string };

type PageHeaderProps = {
  eyebrow?: ReactNode;
  title: ReactNode;
  titleId?: string;
  description?: ReactNode;
  actions?: ReactNode;
  meta?: ReactNode;
  breadcrumbs?: readonly Crumb[];
};

export function PageHeader({
  eyebrow,
  title,
  titleId,
  description,
  actions,
  meta,
  breadcrumbs,
}: PageHeaderProps) {
  return (
    <header className="page-header">
      <div className="page-header__body">
        {breadcrumbs && breadcrumbs.length > 0 && (
          <nav className="breadcrumbs" aria-label="Breadcrumb">
            {breadcrumbs.map((crumb, index) => (
              <span key={crumb.href} style={{ display: "contents" }}>
                {index > 0 && (
                  <span className="breadcrumbs__sep" aria-hidden="true">
                    /
                  </span>
                )}
                <Link href={crumb.href}>{crumb.label}</Link>
              </span>
            ))}
          </nav>
        )}
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1 id={titleId}>{title}</h1>
        {description && <p className="page-header__desc">{description}</p>}
        {meta && <div className="page-header__meta">{meta}</div>}
      </div>
      {actions && <div className="page-header__actions">{actions}</div>}
    </header>
  );
}
