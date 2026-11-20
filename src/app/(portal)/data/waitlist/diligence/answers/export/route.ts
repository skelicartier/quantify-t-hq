import type { NextRequest } from "next/server";

import { buildDownload } from "@/components/data/questionnaires/build-download";

export const dynamic = "force-dynamic";

/** The answer library as a CSV with a byte-order mark (ws-notes/security/spec.md §9.5). */
export async function GET(request: NextRequest): Promise<Response> {
  return buildDownload(request, {
    path: "/data/waitlist/diligence/answers",
    kind: "answers_csv",
    fallback: "Answer library.csv",
    type: "text/csv; charset=utf-8",
  });
}
