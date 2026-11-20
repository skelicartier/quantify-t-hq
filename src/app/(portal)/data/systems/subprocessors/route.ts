import type { NextRequest } from "next/server";

import { systemsCsv } from "../export/download";

export const dynamic = "force-dynamic";

/** The sub-processor list as a CSV: it names no person. The same gate as Tools. */
export function GET(request: NextRequest): Promise<Response> {
  return systemsCsv(request, {
    kind: "tools_subprocessors_csv",
    path: "/data/systems",
    fallback: "Sub-processors.csv",
    ownerColumns: false,
  });
}
