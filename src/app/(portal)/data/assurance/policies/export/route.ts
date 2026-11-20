import type { NextRequest } from "next/server";

import { assuranceCsv } from "@/components/data/assurance/csv-route";

export const dynamic = "force-dynamic";

/** The policy register as a CSV with a byte-order mark; the same gate as its page. */
export function GET(request: NextRequest): Promise<Response> {
  return assuranceCsv(request, {
    kind: "policies_csv",
    page: "/data/assurance/policies",
    name: "Policies.csv",
  });
}
