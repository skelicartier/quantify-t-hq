import type { ReactNode } from "react";

import { DemoFiguresNote } from "@/components/shell/demo-figures";

/** Every revenue page says when its figures are the demo service's. */
export default function RevenueLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <DemoFiguresNote />
      {children}
    </>
  );
}
