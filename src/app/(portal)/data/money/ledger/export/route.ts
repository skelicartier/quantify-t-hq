import type { NextRequest } from "next/server";

import { moneyCsv } from "@/components/data/money/csv-route";

export const dynamic = "force-dynamic";

/** The ledger map: each category with the CA's ledger and its Schedule III line. */
export function GET(request: NextRequest): Promise<Response> {
  return moneyCsv(request, {
    kind: "money_ledger_csv",
    path: "/data/money/ledger",
    fallback: "Ledger map.csv",
  });
}
