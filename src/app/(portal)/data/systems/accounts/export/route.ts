import type { NextRequest } from "next/server";

import { systemsCsv } from "../../export/download";

export const dynamic = "force-dynamic";

/**
 * Every account as a CSV. For the Owner it adds "In the people ledger" and "Close by"; an
 * Admin's has neither column. The same gate as Accounts.
 */
export function GET(request: NextRequest): Promise<Response> {
  return systemsCsv(request, {
    kind: "tools_accounts_csv",
    path: "/data/systems/accounts",
    fallback: "Accounts.csv",
    ownerColumns: true,
  });
}
