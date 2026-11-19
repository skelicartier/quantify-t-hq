import type { NextRequest } from "next/server";

import { moneyCsv } from "@/components/data/money/csv-route";

export const dynamic = "force-dynamic";

/** The purchase register for the CA: one row a bill, with the vendor's PAN and GSTIN, the tax deducted, the challan, the payments and the sources of the rules used. */
export function GET(request: NextRequest): Promise<Response> {
  return moneyCsv(request, {
    kind: "money_bills_csv",
    path: "/data/money",
    fallback: "Purchase register.csv",
    fy: true,
  });
}
