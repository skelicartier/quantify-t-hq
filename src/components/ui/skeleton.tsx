import type { CSSProperties } from "react";

type SkeletonProps = {
  variant?: "line" | "title" | "block";
  width?: string | number;
  height?: string | number;
};

export function Skeleton({ variant = "line", width, height }: SkeletonProps) {
  const style: CSSProperties = {};
  if (width !== undefined) style.width = width;
  if (height !== undefined) style.height = height;
  return <span className={`skeleton skeleton--${variant}`} style={style} aria-hidden="true" />;
}

type PageSkeletonProps = {
  variant?: "account" | "admin" | "detail";
};

/** Instant loading UI for a console page; wrapped as one live region so it is announced once. */
export function PageSkeleton({ variant = "account" }: PageSkeletonProps) {
  const stats = variant === "account" ? 3 : 4;
  const rows = variant === "admin" ? 6 : 5;
  return (
    <div className="skeleton-page" role="status" aria-busy="true">
      <span className="sr-only">Loading</span>
      <div className="skeleton-page__header">
        {variant === "detail" && <Skeleton width="180px" />}
        <Skeleton variant="title" width="42%" />
        <Skeleton width="64%" />
      </div>
      <div className={`stat-grid stat-grid--${stats}`} aria-hidden="true">
        {Array.from({ length: stats }, (_, index) => (
          <div className="stat" key={index}>
            <Skeleton width="40%" />
            <Skeleton variant="title" width="55%" />
          </div>
        ))}
      </div>
      {variant !== "account" && (
        <div className="card-grid" aria-hidden="true">
          {Array.from({ length: variant === "detail" ? 2 : 3 }, (_, index) => (
            <div className="card" key={index}>
              <Skeleton width="30%" />
              <Skeleton variant="block" />
            </div>
          ))}
        </div>
      )}
      <div className="skeleton-page__rows" aria-hidden="true">
        {Array.from({ length: rows }, (_, index) => (
          <Skeleton key={index} variant="block" />
        ))}
      </div>
    </div>
  );
}
