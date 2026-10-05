import { describe, expect, it } from "vitest";

import { companyMrrIn, mainCurrency, readCompanyField } from "@/lib/lists/definitions";
import { applyFilters } from "@/lib/lists/filters";
import type { CompanyListRow } from "@/lib/lists/definitions";

/**
 * A money filter or sort on the Companies list compares in one currency, the page's
 * main one, and never adds a company's currencies together.
 */
const company = (mrr: Record<string, number> | null): CompanyListRow =>
  ({
    company_id: "c",
    name: "Acme",
    domain: "acme.example",
    firm_type: "",
    team_size_band: "",
    country: "",
    lifecycle: "customer",
    owner_staff_id: "",
    source_key: "",
    notes: "",
    customer_since: null,
    archived: false,
    created_at: null,
    updated_at: null,
    parent_id: "",
    people_count: 1,
    open_deals: 0,
    mrr,
    custom: {},
  }) as CompanyListRow;

describe("company money in one currency", () => {
  it("picks the currency most companies pay in", () => {
    expect(
      mainCurrency([
        company({ USD: 100 }),
        company({ INR: 50_000 }),
        company({ USD: 20, INR: 1 }),
        company({ USD: 5 }),
      ]),
    ).toBe("USD");
    // A tie is settled by the code's alphabet, the same way every time.
    expect(mainCurrency([company({ USD: 100 }), company({ INR: 50_000 })])).toBe("INR");
    expect(mainCurrency([company(null), company({}), company({ EUR: 0 })])).toBe("");
  });

  it("reads a company's MRR in that currency only, never summed", () => {
    const split = company({ USD: 100, INR: 50_000 });
    expect(readCompanyField(split, "mrr", null, "USD")).toBe(100);
    expect(readCompanyField(split, "mrr", null, "INR")).toBe(50_000);
    // Paying in another currency is "no MRR" to a USD comparison, not 0 and not a sum.
    expect(readCompanyField(company({ INR: 50_000 }), "mrr", null, "USD")).toBeNull();
    // Without a currency named, only a single-currency company has a figure.
    expect(companyMrrIn(company({ GBP: 40 }), "")).toBe(40);
    expect(companyMrrIn(split, "")).toBeNull();
    expect(companyMrrIn(company(null), "USD")).toBeNull();
    // Paying nothing is 0; money the role may not read is no figure.
    expect(companyMrrIn(company({}), "USD")).toBe(0);
  });

  it("matches no comparison with no figure", () => {
    const rows = [company({ USD: 50 }), company({ INR: 50_000 }), company({}), company(null)];
    const read = (row: CompanyListRow, field: string) => readCompanyField(row, field, null, "USD");
    const under = applyFilters(rows, [{ field: "mrr", op: "lt", value: "100" }], read);
    // The dollar payer and the one paying nothing; never the rupee payer or a hidden figure.
    expect(under.map((row) => row.mrr)).toEqual([{ USD: 50 }, {}]);
    expect(applyFilters(rows, [{ field: "mrr", op: "gt", value: "10" }], read)).toHaveLength(1);
  });
});
