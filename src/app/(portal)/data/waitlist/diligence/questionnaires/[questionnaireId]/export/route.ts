import { NextResponse, type NextRequest } from "next/server";

import { buildDownload } from "@/components/data/questionnaires/build-download";

export const dynamic = "force-dynamic";

const ID = /^[A-Za-z0-9-]{1,64}$/;
const TYPES = {
  csv: "text/csv; charset=utf-8",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

/**
 * "Export CSV" and "Export XLSX" (ws-notes/security/spec.md §9.3): their header and every
 * row as read, with the answers written in; the XLSX a fresh workbook of inline strings.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ questionnaireId: string }> },
): Promise<Response> {
  const { questionnaireId } = await params;
  if (!ID.test(questionnaireId)) return new NextResponse("Not found", { status: 404 });
  const format = request.nextUrl.searchParams.get("format") === "csv" ? "csv" : "xlsx";
  return buildDownload(request, {
    path: `/data/waitlist/diligence/questionnaires/${questionnaireId}`,
    kind: `questionnaire_${format}`,
    fallback: `Questionnaire answers.${format}`,
    type: TYPES[format],
    extra: { questionnaire_id: questionnaireId },
  });
}
