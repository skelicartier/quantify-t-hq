import type { ReactNode } from "react";

import { DemoFiguresNote } from "@/components/shell/demo-figures";

/** Every finance page says when its figures are the demo service's. */
export default function FinanceLayout({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <>
      <DemoFiguresNote />
      {children}
    </>
  );
}
