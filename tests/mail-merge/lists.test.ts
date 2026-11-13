// @vitest-environment node
import { describe, expect, it } from "vitest";

import { ImportRefused, importCsv, normaliseEmail } from "../../scripts/mail-merge/lists";

describe("a list read from a file", () => {
  it("keeps every column under a key and finds the addresses by their heading", () => {
    const list = importCsv(
      "First Name,Last Name,Firm,Work Email,Fund size (USD)\nAsha,Rao,Peak,Asha.Rao@Peak.vc,50m\nBen,Ode,Nine,ben@nine.capital,\n",
    );
    expect(list.email_column).toBe("Work Email");
    expect(list.columns.map((column) => column.key)).toEqual([
      "first_name",
      "last_name",
      "firm",
      "work_email",
      "fund_size_usd",
      "email",
    ]);
    expect(list.rows).toHaveLength(2);
    expect(list.rows[0]).toMatchObject({
      id: "r1",
      email: "asha.rao@peak.vc",
      name: "Asha Rao",
      values: { first_name: "Asha", firm: "Peak", fund_size_usd: "50m", email: "asha.rao@peak.vc" },
    });
  });

  it("finds the addresses by what is in the column when no heading says", () => {
    const list = importCsv(
      "Investor,Reach,Stage\nAsha Rao,asha@peak.vc,Seed\nBen Ode,ben@nine.capital,Seed\n",
    );
    expect(list.email_column).toBe("Reach");
    expect(list.rows.map((row) => row.email)).toEqual(["asha@peak.vc", "ben@nine.capital"]);
  });

  it("accounts for every row: on the list, or left out with the reason", () => {
    const list = importCsv(
      [
        "Name,Email",
        "Asha Rao,asha@peak.vc",
        "No Address,",
        "Bad One,not-an-address",
        "Asha Again,ASHA@peak.vc",
        'Two There,"Ben <ben@nine.capital>; other@nine.capital"',
      ].join("\n"),
    );
    expect(list.rows.map((row) => row.email)).toEqual(["asha@peak.vc", "ben@nine.capital"]);
    expect(list.left_out).toEqual([
      { line: 3, reason: "No address", value: "" },
      { line: 4, reason: "Not an address", value: "not-an-address" },
      { line: 5, reason: "Already in this file", value: "asha@peak.vc" },
    ]);
  });

  it("works a first name out of a full name when the file has no first-name column", () => {
    const list = importCsv("Name,Email\nDr. Asha Rao,asha@peak.vc\nBen,ben@nine.capital\n");
    expect(list.rows.map((row) => row.values.first_name)).toEqual(["Asha", "Ben"]);
    expect(list.columns.find((column) => column.key === "first_name")).toEqual({
      key: "first_name",
      label: "First name (from Name)",
      derived: true,
    });
  });

  it("does not invent a first name when the file has one", () => {
    const list = importCsv("First,Name,Email\nAsh,Asha Rao,asha@peak.vc\n");
    expect(list.rows[0]!.values.first_name).toBeUndefined();
    expect(list.rows[0]!.values.first).toBe("Ash");
  });

  it("gives two columns with one heading their own keys", () => {
    const list = importCsv("Email,Note,Note\na@b.co,one,two\n");
    expect(list.columns.map((column) => column.key)).toEqual(["email", "note", "note_2"]);
    expect(list.rows[0]!.values).toMatchObject({ note: "one", note_2: "two" });
  });

  it("reads a file that separates with semicolons or tabs, commas inside cells and all", () => {
    const semicolons = importCsv(
      'Name;Firm;Email\nAsha Rao;Peak, Inc;asha@peak.vc\n"Ode; Ben";Nine;ben@nine.capital\n',
    );
    expect(semicolons.rows.map((row) => [row.name, row.values.firm, row.email])).toEqual([
      ["Asha Rao", "Peak, Inc", "asha@peak.vc"],
      ["Ode; Ben", "Nine", "ben@nine.capital"],
    ]);
    const tabs = importCsv("Name\tEmail\nAsha Rao\tasha@peak.vc\n");
    expect(tabs.rows[0]).toMatchObject({ name: "Asha Rao", email: "asha@peak.vc" });
  });

  it("refuses a file it cannot make a list from, and says why", () => {
    expect(() => importCsv("")).toThrow(ImportRefused);
    expect(() => importCsv("Name,Email\n")).toThrow("nobody under it");
    expect(() => importCsv("Name,Firm\nAsha,Peak\n")).toThrow("No column of email addresses");
    expect(() => importCsv("Name,Email\nAsha,nope\n")).toThrow("None of the 1 rows");
  });

  it("knows an address from something that only looks like one", () => {
    expect(normaliseEmail(" Asha@Peak.VC ")).toBe("asha@peak.vc");
    for (const bad of [
      "",
      "asha",
      "asha@peak",
      "a..b@peak.vc",
      ".a@peak.vc",
      "a@-peak.vc",
      "a b@peak.vc",
      "a@peak.v1",
    ])
      expect(normaliseEmail(bad)).toBe("");
  });
});
