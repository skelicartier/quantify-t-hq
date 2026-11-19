// @vitest-environment node
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import type { CompanyLookup } from "../../scripts/data/company-contracts";
import { factsOf } from "../../scripts/data/company/book";
import { dutyChecksOf } from "../../scripts/data/company/checks";
import { register } from "../../scripts/data/company/index";
import { EMPTY_FACTS, type Facts } from "../../scripts/data/company/types";
import type { DataCore } from "../../scripts/data/core";
import { addDays, localDay } from "../../scripts/data/days";
import { WALKER, codeOf, startStack, type Stack } from "./helpers";

/**
 * The company record's new facts (ws-notes/duties/spec.md §6.2, §6.6): an older
 * `facts.json` without them reads with their empty forms; the CERT-In point of contact, the
 * books of record and the wider DPIIT block save one group at a time and read back, with a
 * copy kept in Files; the six check lines; a day in the future refused; and the
 * `company` service's `facts()` keeps exactly its old keys. Everything is invented.
 */

type Body = Record<string, unknown>;
const today = () => localDay(new Date());

const facts = (change: (draft: Facts) => void): Facts => {
  const draft = structuredClone(EMPTY_FACTS);
  change(draft);
  return draft;
};

describe("the new facts, pure", () => {
  it("an older record without the new keys reads with their empty forms", () => {
    const read = factsOf({
      legal_name: "Walk Company Private Limited",
      dpiit: { number: "DIPP000000", recognised_on: "2025-09-01" },
      flags: { startup: "yes" },
    });
    expect(read.legal_name).toBe("Walk Company Private Limited");
    expect(read.dpiit).toEqual({
      number: "DIPP000000",
      recognised_on: "2025-09-01",
      status: "",
      applied_on: null,
      valid_until: null,
      certificate_file_id: null,
    });
    expect(read.cert_in).toEqual(EMPTY_FACTS.cert_in);
    expect(read.books).toEqual(EMPTY_FACTS.books);
  });

  it("says each of the six check lines for facts made to fail it", () => {
    const on = "2026-11-19";
    expect(dutyChecksOf(EMPTY_FACTS, on).map((line) => line.key)).toEqual([
      "cert-in-none",
      "books-none",
    ]);
    expect(dutyChecksOf(EMPTY_FACTS, on)).toEqual([
      {
        key: "cert-in-none",
        words:
          "No point of contact is recorded as sent to CERT-In. Every company keeps one current.",
        confirm: "lawyer",
      },
      {
        key: "books-none",
        words:
          "Which software keeps the books is not recorded. HQ is not the books: your CA keeps them.",
        confirm: "CA",
      },
    ]);
    const old = facts((draft) => {
      draft.cert_in = {
        ...draft.cert_in,
        name: "Walk Contact",
        sent_on: "2025-11-18",
        mobile: "+91 00000 00000",
      };
      draft.books.software = "Walk Books";
      draft.books.provider_disclosed = "no";
    });
    expect(dutyChecksOf(old, on)).toEqual([
      {
        key: "cert-in-old",
        words: "The point of contact was last sent on 18 Nov 2025. Check it is still current.",
        confirm: null,
      },
      {
        key: "cert-in-incomplete",
        words: "The point of contact has no email.",
        confirm: null,
      },
      {
        key: "books-undisclosed",
        words: "The books software's provider is not recorded as disclosed to the ROC.",
        confirm: "CS",
      },
    ]);
    // 365 days exactly is not "more than 365".
    const year = facts((draft) => {
      draft.cert_in = {
        ...draft.cert_in,
        name: "Walk Contact",
        sent_on: "2025-11-19",
        email: "contact@walk-company.example",
        mobile: "+91 00000 00000",
      };
      draft.books.software = "Walk Books";
      draft.books.provider_disclosed = "yes";
    });
    expect(dutyChecksOf(year, on)).toEqual([]);
    const nameOnly = facts((draft) => {
      draft.cert_in.name = "Walk Contact";
      draft.cert_in.sent_on = "2026-11-01";
      draft.books.software = "Walk Books";
      draft.books.provider_disclosed = "yes";
    });
    expect(dutyChecksOf(nameOnly, on).map((line) => line.words)).toEqual([
      "The point of contact has no email or mobile.",
    ]);
    const mismatch = facts((draft) => {
      draft.flags.startup = "yes";
      draft.dpiit.status = "applied";
    });
    expect(dutyChecksOf(mismatch, on).find((line) => line.key === "dpiit-mismatch")).toEqual({
      key: "dpiit-mismatch",
      words: "Recognised startup is Yes but the DPIIT status is Applied.",
      confirm: null,
    });
    const noButRecognised = facts((draft) => {
      draft.flags.startup = "no";
      draft.dpiit.status = "recognised";
    });
    expect(dutyChecksOf(noButRecognised, on).map((line) => line.words)).toContain(
      "Recognised startup is No but the DPIIT status is Recognised.",
    );
    const agree = facts((draft) => {
      draft.flags.startup = "yes";
      draft.dpiit.status = "recognised";
    });
    expect(dutyChecksOf(agree, on).some((line) => line.key === "dpiit-mismatch")).toBe(false);
  });

  it("the company service's facts() keeps exactly its old keys", () => {
    const provided = new Map<string, unknown>();
    const fake = {
      store: {
        ensureDir: () => "",
        readJson: <T>(_name: string, fallback: T) => fallback,
        writeJson: () => undefined,
        appendLine: () => undefined,
        readLines: () => [],
      },
      need: () => null,
      provide: (name: string, value: unknown) => provided.set(name, value),
      route: () => undefined,
      stream: () => undefined,
      provideOverview: () => undefined,
      provideDue: () => undefined,
      now: () => "2026-11-19T04:30:00.000Z",
      day: () => "2026-11-19",
      log: () => undefined,
      testRoutes: false,
    } as unknown as DataCore;
    register(fake);
    const lookup = provided.get("company") as CompanyLookup;
    expect(Object.keys(lookup.facts()).sort()).toEqual(
      [
        "legal_name",
        "incorporated_on",
        "first_fy_end",
        "small",
        "startup",
        "subsidiary",
        "foreign_investment",
        "dpiit_number",
        "firms_registered_on",
      ].sort(),
    );
  });
});

describe("the new facts, through the service", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "contacts", "company"] });
  }, 60_000);
  afterAll(() => stack.stop());

  const save = (group: string, body: Body) =>
    stack.ask("POST", "/data/company/facts", { by: WALKER, group, ...body });
  const page = async () => (await stack.ask("GET", "/data/company")).json!;

  it("reads an older facts.json without the new keys, and rewrites nothing until saved", async () => {
    const folder = join(stack.dir, "data", "company");
    mkdirSync(folder, { recursive: true });
    const old = {
      format: 1,
      facts: {
        legal_name: "Walk Company Private Limited",
        dpiit: { number: "DIPP000000", recognised_on: null },
        flags: { startup: "yes" },
        updated_at: "2026-10-01T05:00:00.000Z",
        updated_by: WALKER,
      },
    };
    writeFileSync(join(folder, "facts.json"), JSON.stringify(old));
    await stack.ask("POST", "/data/_test/crash", { by: WALKER });
    await stack.data.ready(20_000);
    const read = await page();
    const readFacts = read.facts as Facts;
    expect(readFacts.legal_name).toBe("Walk Company Private Limited");
    expect(readFacts.cert_in).toEqual(EMPTY_FACTS.cert_in);
    expect(readFacts.books).toEqual(EMPTY_FACTS.books);
    expect(readFacts.dpiit.status).toBe("");
    expect((read.duty_checks as { key: string }[]).map((line) => line.key)).toEqual([
      "cert-in-none",
      "books-none",
    ]);
    expect(read.rules).toEqual({ cert_in_contact: null });
  });

  it("saves the CERT-In contact with its message kept in Security › CERT-In", async () => {
    const answer = await save("cert_in", {
      cert_in_name: "Walk Contact",
      cert_in_designation: "Director",
      cert_in_email: "contact@walk-company.example",
      cert_in_mobile: "+91 00000 00000",
      cert_in_office_phone: "+91 00000 00001",
      cert_in_address: "",
      cert_in_sent_on: addDays(today(), -10),
      content: Buffer.from("invented message to CERT-In").toString("base64"),
      name: "point-of-contact.txt",
    });
    expect(answer.status).toBe(200);
    const read = await page();
    const contact = (read.facts as Facts).cert_in;
    expect(contact).toMatchObject({
      name: "Walk Contact",
      designation: "Director",
      email: "contact@walk-company.example",
      sent_on: addDays(today(), -10),
    });
    expect(contact.sent_file_id).toBeTruthy();
    expect(read.cert_in_file).toMatchObject({ title: "Point of contact sent to CERT-In" });
    const file = (await stack.ask("GET", `/data/files/${contact.sent_file_id}`)).json!;
    expect(JSON.stringify(file)).toContain("CERT-In");
    expect((read.duty_checks as { key: string }[]).map((line) => line.key)).toEqual(["books-none"]);
    const changes = read.changes as { detail: string }[];
    expect(changes[0]!.detail).toContain("CERT-In contact's name");
    expect(changes[0]!.detail).not.toContain("Walk Contact");
  });

  it("refuses a day in the future, a PIN in a note and a limit that is not a whole number", async () => {
    const future = await save("cert_in", { cert_in_sent_on: addDays(today(), 2) });
    expect(future.status).toBe(400);
    expect((future.json!.error as { message: string }).message).toBe("That day is in the future.");
    const started = await save("books", { books_started_on: addDays(today(), 1) });
    expect(started.status).toBe(400);
    const pin = await save("books", { books_disclosed_note: "password: walk-secret-1" });
    expect(codeOf(pin)).toBe("invalid");
    const limit = await save("books", { books_free_revenue_limit: "12.5" });
    expect((limit.json!.error as { message: string }).message).toBe(
      "Type a whole number from 1 to 1,000,000,000,000, or leave it empty.",
    );
    const access = await save("books", { books_access: "admin" });
    expect((access.json!.error as { message: string }).message).toBe(
      "Choose the CA's access from the list.",
    );
    const missing = await save("cert_in", { cert_in_sent_file_id: "no-such-file" });
    expect(missing.status).toBe(404);
  });

  it("saves the books of record, and the check lines follow", async () => {
    const saved = await save("books", {
      books_software: "Walk Books",
      books_kept_by: "Walk Accountants LLP",
      books_access: "accountant",
      books_started_on: "2025-08-14",
      books_provider_disclosed: "no",
      books_disclosed_note: "Board minutes of 14 Aug 2025",
      books_free_revenue_limit: "1,00,00,000",
      books_free_invoice_limit: "1000",
    });
    expect(saved.status).toBe(200);
    expect((saved.json!.duty_checks as { key: string }[]).map((line) => line.key)).toEqual([
      "books-undisclosed",
    ]);
    const books = ((await page()).facts as Facts).books;
    expect(books).toMatchObject({
      software: "Walk Books",
      kept_by: "Walk Accountants LLP",
      access: "accountant",
      started_on: "2025-08-14",
      provider_disclosed: "no",
      free_revenue_limit: 10_000_000,
      free_invoice_limit: 1000,
    });
    await save("books", { books_provider_disclosed: "yes" });
    expect(((await page()).duty_checks as unknown[]).length).toBe(0);
  });

  it("saves the wider DPIIT block, refuses valid-until before recognised, and checks the flag", async () => {
    const before = await save("registrations", {
      dpiit_recognised_on: "2025-09-01",
      dpiit_valid_until: "2025-08-01",
    });
    expect((before.json!.error as { message: string }).message).toBe(
      "Valid until cannot be before the day it was recognised.",
    );
    const status = await save("registrations", { dpiit_status: "maybe" });
    expect(status.status).toBe(400);
    await save("class", { startup: "yes" });
    const saved = await save("registrations", {
      dpiit_number: "DIPP000000",
      dpiit_status: "applied",
      dpiit_applied_on: "2025-08-20",
      dpiit_recognised_on: "",
      dpiit_valid_until: "2035-08-13",
      content: Buffer.from("invented certificate").toString("base64"),
      name: "dpiit.txt",
    });
    expect(saved.status).toBe(200);
    const read = await page();
    const dpiit = (read.facts as Facts).dpiit;
    expect(dpiit).toMatchObject({
      number: "DIPP000000",
      status: "applied",
      applied_on: "2025-08-20",
      valid_until: "2035-08-13",
    });
    expect(read.dpiit_file).toMatchObject({ title: "DPIIT recognition certificate" });
    expect((read.duty_checks as { words: string }[]).map((line) => line.words)).toContain(
      "Recognised startup is Yes but the DPIIT status is Applied.",
    );
  });
});
