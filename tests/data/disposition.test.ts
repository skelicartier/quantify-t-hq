// @vitest-environment node
import { describe, expect, it } from "vitest";

import { INLINE_TYPES, contentDisposition, servedAs } from "@/lib/data/disposition";

/** How a stored file is handed over: its name in a header, and inline only for PDFs and pictures. */
describe("content disposition", () => {
  it("gives an ASCII name every browser reads, then the exact name", () => {
    expect(contentDisposition("inline", "Résumé 2026.pdf")).toBe(
      "inline; filename=\"Resume 2026.pdf\"; filename*=UTF-8''R%C3%A9sum%C3%A9%202026.pdf",
    );
    expect(contentDisposition("attachment", "₹ ledger (Q3).csv")).toBe(
      "attachment; filename=\"_ ledger (Q3).csv\"; filename*=UTF-8''%E2%82%B9%20ledger%20%28Q3%29.csv",
    );
    expect(contentDisposition("attachment", "it's*.txt")).toContain(
      "filename*=UTF-8''it%27s%2A.txt",
    );
  });

  it("strips control characters and slashes, so a name can never break the header", () => {
    const header = contentDisposition("attachment", "evil\r\nSet-Cookie: x=1\u0000/../a.pdf");
    expect(header).not.toMatch(/[\r\n\u0000]/);
    expect(header).toContain('filename="evilSet-Cookie_ x_1_.._a.pdf"');
    expect(contentDisposition("inline", "\u0007")).toBe(
      "inline; filename=\"file\"; filename*=UTF-8''file",
    );
  });

  it("shows inline only a PDF or a picture, and only when asked", () => {
    expect([...INLINE_TYPES].sort()).toEqual([
      "application/pdf",
      "image/gif",
      "image/jpeg",
      "image/png",
      "image/webp",
    ]);
    expect(servedAs("application/pdf", "inline")).toEqual({
      type: "application/pdf",
      disposition: "inline",
    });
    expect(servedAs("image/png", "attachment")).toEqual({
      type: "image/png",
      disposition: "attachment",
    });
    for (const type of [
      "text/html",
      "image/svg+xml",
      "text/csv",
      "text/plain; charset=utf-8",
      "application/octet-stream",
      "",
    ])
      expect(servedAs(type, "inline")).toEqual({
        type: "application/octet-stream",
        disposition: "attachment",
      });
  });
});
