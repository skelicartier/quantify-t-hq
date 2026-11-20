import type { NextRequest } from "next/server";

import { assuranceCsv } from "@/components/data/assurance/csv-route";

export const dynamic = "force-dynamic";

/** The certifications as a CSV with a byte-order mark; the same gate as its page. */
export function GET(request: NextRequest): Promise<Response> {
  return assuranceCsv(request, {
    kind: "certifications_csv",
    page: "/data/assurance/certification",
    name: "Certification.csv",
  });
}
