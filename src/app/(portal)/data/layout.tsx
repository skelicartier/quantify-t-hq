import type { ReactNode } from "react";

import "./data.css";

/** The Data section's own styles, loaded once for every page under `/data`. */
export default function DataLayout({ children }: Readonly<{ children: ReactNode }>) {
  return <>{children}</>;
}
