import type { NextRequest } from "next/server";

import { buildDownload } from "@/components/data/questionnaires/build-download";

export const dynamic = "force-dynamic";

/** Customer duties as a CSV: Firm · Rules · Duty · From · In the contract · Agreement (§9.5). */
export async function GET(request: NextRequest): Promise<Response> {
  return buildDownload(request, {
    path: "/data/assurance/customers",
    kind: "profiles_csv",
    fallback: "Customer duties.csv",
    type: "text/csv; charset=utf-8",
  });
}
