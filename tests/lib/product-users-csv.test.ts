import { csvCell, usersCsv, usersCsvFilename, usersCsvRow } from "@/lib/product/users-csv";

const summary = {
  user: {
    user_id: "860aac31-73fb-4e10-8f3f-bfcf22a71c11",
    email: "owner@example.test",
    first_name: "Owner",
    last_name: 'O"Neil, Jr',
    display_name: 'Owner O"Neil, Jr',
    is_active: true,
    subscription_tier: "pro",
    created_at: "2026-09-01T00:00:00Z",
    last_login_at: "",
    updated_at: "2026-09-04T00:00:00Z",
  },
  role: {
    effective: "owner" as const,
    database: "owner" as const,
    legacy: null,
    mismatch: "missing-in-legacy",
    break_glass: false,
  },
};

describe("users CSV", () => {
  it("quotes cells that contain separators or quotes and neutralises formulas", () => {
    expect(csvCell("plain")).toBe("plain");
    expect(csvCell('O"Neil, Jr')).toBe('"O""Neil, Jr"');
    expect(csvCell("=HYPERLINK(1)")).toBe("'=HYPERLINK(1)");
    expect(csvCell("+1 415")).toBe("'+1 415");
    expect(csvCell("-2")).toBe("'-2");
    expect(csvCell("@mention")).toBe("'@mention");
    expect(csvCell(null)).toBe("");
    expect(csvCell(42)).toBe("42");
  });

  it("projects one row per account with human status, role and plan", () => {
    expect(usersCsvRow(summary)).toBe(
      '860aac31-73fb-4e10-8f3f-bfcf22a71c11,owner@example.test,Owner,"O""Neil, Jr",active,Owner,pro,2026-09-01T00:00:00Z,,2026-09-04T00:00:00Z',
    );
  });

  it("writes a BOM, a header and CRLF line endings", () => {
    const document = usersCsv([summary]);
    expect(document.startsWith("﻿user_id,email,first_name,last_name,status,role,plan,")).toBe(true);
    expect(document.split("\r\n")).toHaveLength(3);
    expect(document.endsWith("\r\n")).toBe(true);
  });

  it("stamps the filename with the export date", () => {
    expect(usersCsvFilename(new Date("2026-09-11T13:37:00Z"))).toBe(
      "quantify-terminal-users-2026-09-11.csv",
    );
  });
});
