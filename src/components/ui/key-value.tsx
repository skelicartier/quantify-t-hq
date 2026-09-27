import type { ReactNode } from "react";

type KeyValueProps = {
  columns?: 1 | 2;
  className?: string;
  children: ReactNode;
};

export function KeyValue({ columns = 1, className, children }: KeyValueProps) {
  return (
    <dl className={["kv", columns === 2 ? "kv--2" : "", className ?? ""].filter(Boolean).join(" ")}>
      {children}
    </dl>
  );
}

type KeyValueRowProps = {
  label: ReactNode;
  children: ReactNode;
  mono?: boolean;
};

export function KeyValueRow({ label, children, mono }: KeyValueRowProps) {
  return (
    <div className="kv__row">
      <dt className="kv__label">{label}</dt>
      <dd className={["kv__value", mono ? "mono" : ""].filter(Boolean).join(" ")}>{children}</dd>
    </div>
  );
}
