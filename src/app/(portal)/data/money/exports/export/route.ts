import type { NextRequest } from "next/server";

import { moneyCsv } from "@/components/data/money/csv-route";

export const dynamic = "force-dynamic";

/** Export invoices with their EDF, realisation, receipts and the year's LUT. */
export function GET(request: NextRequest): Promise<Response> {
  return moneyCsv(request, {
    kind: "money_exports_csv",
    path: "/data/money/exports",
    fallback: "Export invoices.csv",
    fy: true,
  });
}
