import { ArrowRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

type CardProps = {
  eyebrow?: ReactNode;
  title?: ReactNode;
  titleAs?: "h2" | "h3" | undefined;
  titleId?: string | undefined;
  description?: ReactNode;
  important?: boolean | undefined;
  danger?: boolean | undefined;
  soft?: boolean | undefined;
  actions?: ReactNode;
  className?: string | undefined;
  children?: ReactNode;
};

function cardClass({
  important,
  danger,
  soft,
  className,
}: Pick<CardProps, "important" | "danger" | "soft" | "className">) {
  return [
    "card",
    important ? "card--important" : "",
    danger ? "card--danger" : "",
    soft ? "card--soft" : "",
    className ?? "",
  ]
    .filter(Boolean)
    .join(" ");
}

export function Card({
  eyebrow,
  title,
  titleAs: TitleTag = "h3",
  titleId,
  description,
  important,
  danger,
  soft,
  actions,
  className,
  children,
}: CardProps) {
  return (
    <article
      className={cardClass({ important, danger, soft, className })}
      aria-labelledby={titleId}
    >
      {eyebrow && <p className="eyebrow card__eyebrow">{eyebrow}</p>}
      {title && (
        <TitleTag className="card__title" id={titleId}>
          {title}
        </TitleTag>
      )}
      {description && <p className="card__desc">{description}</p>}
      {children && <div className="card__body">{children}</div>}
      {actions && <div className="card__actions">{actions}</div>}
    </article>
  );
}

type LinkCardProps = {
  href: string;
  eyebrow?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
};

/** A whole-card link; the arrow is decorative, the title is the accessible name. */
export function LinkCard({ href, eyebrow, title, description }: LinkCardProps) {
  return (
    <Link className="card card--interactive" href={href}>
      {eyebrow && <span className="eyebrow card__eyebrow">{eyebrow}</span>}
      <span className="card__title">{title}</span>
      {description && <span className="card__desc">{description}</span>}
      <ArrowRight className="card__arrow" size={18} aria-hidden="true" />
    </Link>
  );
}

type SectionProps = {
  id: string;
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
  children: ReactNode;
};

/** A titled region: the `<h2>` and everything it introduces share one `<section>`. */
export function Section({
  id,
  title,
  eyebrow,
  description,
  actions,
  className,
  children,
}: SectionProps) {
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      className={["section", className ?? ""].filter(Boolean).join(" ")}
      aria-labelledby={headingId}
    >
      <div className="section__header">
        <div>
          {eyebrow && <p className="eyebrow">{eyebrow}</p>}
          <h2 id={headingId}>{title}</h2>
          {description && <p className="section__desc">{description}</p>}
        </div>
        {actions && <div className="section__actions">{actions}</div>}
      </div>
      {children}
    </section>
  );
}
