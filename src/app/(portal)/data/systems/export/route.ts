import type { NextRequest } from "next/server";

import { systemsCsv } from "./download";

export const dynamic = "force-dynamic";

/** Every tool as one CSV with a byte-order mark; cells defused. The same gate as Tools. */
export function GET(request: NextRequest): Promise<Response> {
  return systemsCsv(request, {
    kind: "tools_csv",
    path: "/data/systems",
    fallback: "Tools.csv",
    ownerColumns: false,
  });
}
