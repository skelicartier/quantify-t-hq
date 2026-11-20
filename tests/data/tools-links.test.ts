// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addMonths } from "../../scripts/data/company-contracts";
import { addDays, localDay } from "../../scripts/data/days";
import { billedWords, sendsAsWords } from "@/lib/data/labels-systems";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * U1's lines in Money and Domains against the real modules (ws-notes/security/spec.md §5.2,
 * §6.6, §3.6 case 5): `money-vendors` lists the vendors and totals what each billed since a
 * day, one figure per currency and never a cancelled bill; `domain-senders` lists the live
 * domains with what sends as each; a tool's page carries its vendor, what was billed in the
 * last year and the domains that send as it. Every vendor and domain is invented.
 */

type Body = Record<string, unknown>;
const today = () => localDay(new Date());
const attempt = () => crypto.randomUUID();
let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "money", "domains", "tools"] });
  await stack.ask("POST", "/data/_test/money/duty-rules", { by: WALKER });
}, 60_000);
afterAll(() => stack.stop());

async function post(path: string, body: Body): Promise<Body> {
  const answer = await stack.ask("POST", path, { ...body, by: WALKER });
  expect(answer.status, `${path} ${JSON.stringify(answer.json)}`).toBe(200);
  return answer.json!;
}

describe("the billed sentence and the senders sentence", () => {
  it("one figure per currency, never added (§5.2)", () => {
    expect(
      billedWords("2025-11-20", [
        { currency: "USD", total_minor: 2_000, bills: 1 },
        { currency: "INR", total_minor: 2_360_000, bills: 2 },
      ]),
    ).toBe("Billed since 20 Nov 2025: ₹23,600 in 2 bills · $20 in 1 bill");
    expect(billedWords("2025-11-20", [])).toBe("Nothing billed since 20 Nov 2025.");
    expect(sendsAsWords(["walk.example"])).toBe(
      "Sends mail as walk.example (as Domains records it).",
    );
  });
});

describe("money-vendors and domain-senders against the real modules", () => {
  let vendorId = "";
  let toolId = "";

  it("a vendor with two rupee bills, a dollar bill, an old bill and a cancelled one", async () => {
    vendorId = String(
      (
        (await post("/data/money/vendors", { name: "Walk Mail Vendor", residency: "resident" }))
          .vendor as Body
      ).vendor_id,
    );
    await post("/data/money/vendors", { name: "Walk Another Vendor", residency: "resident" });
    const bill = (number: string, invoiceOn: string, taxable: string, currency = "INR", gst = "") =>
      post("/data/money/bills", {
        vendor_id: vendorId,
        invoice_number: number,
        invoice_on: invoiceOn,
        taxable,
        ...(gst ? { gst } : {}),
        currency,
        attempt: attempt(),
      });
    await bill("WALK-T-1", addDays(today(), -40), "10000", "INR", "1800");
    await bill("WALK-T-2", addDays(today(), -10), "10000", "INR", "1800");
    await bill("WALK-T-3", addDays(today(), -5), "20", "USD");
    await bill("WALK-T-OLD", addDays(addMonths(today(), -12), -1), "500", "INR");
    const gone = await bill("WALK-T-GONE", addDays(today(), -3), "999", "INR");
    await post(`/data/money/bills/${String((gone.bill as Body).bill_id)}/cancel`, {
      why: "Raised in error",
    });
    const links = (
      await stack.ask(
        "GET",
        `/data/_test/tools/links?vendor=${vendorId}&from=${addMonths(today(), -12)}`,
      )
    ).json!;
    expect((links.vendors as Body[]).map((vendor) => vendor.name)).toEqual([
      "Walk Another Vendor",
      "Walk Mail Vendor",
    ]);
    expect((links.vendors as Body[])[1]).toEqual({
      vendor_id: vendorId,
      name: "Walk Mail Vendor",
      retired: false,
      href: `/data/money/vendors/${vendorId}`,
    });
    expect(links.billed).toEqual([
      { currency: "INR", total_minor: 2_360_000, bills: 2 },
      { currency: "USD", total_minor: 2_000, bills: 1 },
    ]);
  });

  it("a domain whose Sends as lists Walk Mail, and a released one that does too", async () => {
    await post("/data/domains", { name: "walk.example", sends_as: "Walk Mail, Walk Other" });
    await post("/data/domains", { name: "walk-news.example", sends_as: "walk mail " });
    const old = await post("/data/domains", { name: "walk-old.example", sends_as: "Walk Mail" });
    await post(`/data/domains/${String((old.domain as Body).domain_id)}/release`, {
      on: today(),
      why: "Let go",
    });
    await post("/data/domains", { name: "walk-design.example", sends_as: "Walk Design" });
    const senders = (await stack.ask("GET", "/data/_test/tools/links")).json!.senders as Body[];
    expect(senders.map((domain) => domain.name)).toEqual([
      "walk-design.example",
      "walk-news.example",
      "walk.example",
    ]);
    expect(senders[2]).toMatchObject({
      sends_as: ["Walk Mail", "Walk Other"],
      href: "/data/registers/domains",
    });
  });

  it("the tool's page: its vendor, what it billed in the last year, and the domains that send as it", async () => {
    toolId = String(
      (
        (await post("/data/tools", { name: "Walk Mail", vendor_id: vendorId, attempt: attempt() }))
          .tool as Body
      ).tool_id,
    );
    const page = (await stack.ask("GET", `/data/tools/${toolId}`)).json!;
    expect(page.vendor).toMatchObject({ vendor_id: vendorId, name: "Walk Mail Vendor" });
    expect((page.vendors as Body[]).length).toBe(2);
    expect(page.billed_since).toBe(addMonths(today(), -12));
    expect(billedWords(String(page.billed_since), page.billed as never)).toBe(
      `Billed since ${dayOf(addMonths(today(), -12))}: ₹23,600 in 2 bills · $20 in 1 bill`,
    );
    expect((page.senders as Body[]).map((domain) => domain.name)).toEqual([
      "walk-news.example",
      "walk.example",
    ]);
    const other = String(
      ((await post("/data/tools", { name: "Walk Notes", attempt: attempt() })).tool as Body)
        .tool_id,
    );
    const plain = (await stack.ask("GET", `/data/tools/${other}`)).json!;
    expect(plain).toMatchObject({ vendor: null, billed: [], senders: [] });
  });
});

describe("without Money and Domains", () => {
  it("the tool's page says nothing of either: null, not empty", async () => {
    const alone = await startStack({ modules: ["tools"] });
    try {
      const added = await alone.ask("POST", "/data/tools", {
        name: "Walk Mail",
        attempt: attempt(),
        by: WALKER,
      });
      const id = String((added.json!.tool as Body).tool_id);
      const page = (await alone.ask("GET", `/data/tools/${id}`)).json!;
      expect(page).toMatchObject({
        vendor: null,
        vendors: null,
        billed: null,
        senders: null,
        files_here: false,
      });
    } finally {
      await alone.stop();
    }
  });
});

function dayOf(day: string): string {
  const months = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${months[Number(month) - 1] ?? ""} ${year}`;
}
