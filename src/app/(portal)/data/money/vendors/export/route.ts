import type { NextRequest } from "next/server";

import { moneyCsv } from "@/components/data/money/csv-route";

export const dynamic = "force-dynamic";

/** Every vendor with its PAN, GSTIN, Udyam class, the kind of tax deducted and, for a vendor abroad, the CA's decision. */
export function GET(request: NextRequest): Promise<Response> {
  return moneyCsv(request, {
    kind: "money_vendors_csv",
    path: "/data/money/vendors",
    fallback: "Vendors.csv",
  });
}
