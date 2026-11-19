import { render } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The bill's form (ws-notes/duties/spec.md §8.6, §8.7): its labels in the spec's order, the
 * amounts posted as he typed them ("1,180.50": the service reads them into paise, the portal
 * does no arithmetic on money), "Add a vendor" adding the vendor first, and no "%" anywhere.
 * The client is mocked; every name is invented.
 */

const mocks = vi.hoisted(() => ({
  requireStaff: vi.fn(),
  addBill: vi.fn(),
  addVendor: vi.fn(),
}));

vi.mock("@/lib/access/core", () => ({
  requireStaff: mocks.requireStaff,
  hasCapability: (context: { me: { capabilities: string[] } }, capability: string) =>
    context.me.capabilities.includes(capability),
}));
vi.mock("@/lib/security/action-origin", () => ({
  requireSameOriginServerAction: async () => undefined,
  SameOriginActionError: class extends Error {},
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/data/api/money", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/data/api/money")>()),
  addBill: mocks.addBill,
  addVendor: mocks.addVendor,
}));

import { addBillAction } from "@/app/(portal)/data/money/actions";
import { BillFields, NEW_BILL, NEW_VENDOR } from "@/components/data/money/bill-fields";
import { INITIAL_ACTION_STATE } from "@/lib/forms/action-state";

const OWNER = {
  token: "walk-token",
  me: {
    role: "owner",
    capabilities: ["mail:send"],
    staff: { staff_id: "walk-owner", display_name: "Walk Owner", email: "owner@hq.test" },
  },
};

const previous = process.env.HQ_MAIL_MERGE_SOCKET;
beforeEach(() => {
  process.env.HQ_MAIL_MERGE_SOCKET = "/nonexistent/hq-test/s.sock";
  for (const mock of Object.values(mocks)) mock.mockReset();
  mocks.requireStaff.mockResolvedValue(OWNER);
});
afterEach(() => {
  if (previous === undefined) delete process.env.HQ_MAIL_MERGE_SOCKET;
  else process.env.HQ_MAIL_MERGE_SOCKET = previous;
});

const form = () =>
  render(
    <form>
      <BillFields
        prefix="bill-new"
        values={NEW_BILL}
        vendors={[{ id: "walk-vendor", name: "Walk Legal LLP" }]}
        categories={[{ id: "walk-category", name: "Professional fees" }]}
        today="2026-11-19"
        copy={{ files: [], filesHere: true }}
      />
    </form>,
  );

describe("the bill's form", () => {
  it("asks in the spec's order, and says no per cent sign anywhere", () => {
    const { container } = form();
    const labels = [...container.querySelectorAll("label, legend")].map((label) =>
      (label.textContent ?? "").trim(),
    );
    expect(labels).toEqual([
      "Vendor",
      "New vendor's name",
      "Invoice number",
      "Invoice day",
      "Accepted on",
      "What it is for",
      "Currency",
      "Amount before GST",
      "GST on the bill",
      "Total",
      "GST treatment",
      "Category",
      "Tax deducted: kind",
      "The invoice",
      "Choose from Files",
      "Or attach it here",
    ]);
    expect(container.textContent).not.toContain("%");
    const vendor = container.querySelector<HTMLSelectElement>("#bill-new-vendor")!;
    expect([...vendor.options].map((option) => option.textContent)).toEqual([
      "Choose a vendor",
      "Walk Legal LLP",
      "Add a vendor",
    ]);
  });

  const filled = (change: Record<string, string> = {}) => {
    const data = new FormData();
    const values: Record<string, string> = {
      vendor_id: "walk-vendor",
      invoice_number: "WALK-INV-0007",
      invoice_on: "2026-11-12",
      accepted_on: "",
      description: "Walk advice",
      currency: "INR",
      taxable: "1,180.50",
      gst: "212.49",
      total: "1,392.99",
      gst_treatment: "charged_on_the_bill",
      category_id: "",
      tds_kind: "",
      attempt: "4f1d2c3b-0000-4000-8000-000000000001",
      ...change,
    };
    for (const [key, value] of Object.entries(values)) data.set(key, value);
    return data;
  };

  it("posts the amounts as typed", async () => {
    mocks.addBill.mockResolvedValue({ bill: { pay_by: null, pay_by_short: "" } });
    const state = await addBillAction(INITIAL_ACTION_STATE, filled());
    expect(state).toMatchObject({ status: "sent", message: "Added." });
    expect(mocks.addBill).toHaveBeenCalledTimes(1);
    const [input, by, attempt] = mocks.addBill.mock.calls[0]!;
    expect(input).toMatchObject({
      taxable: "1,180.50",
      gst: "212.49",
      total: "1,392.99",
      vendor_id: "walk-vendor",
    });
    expect(by).toEqual({ staff_id: "walk-owner", name: "Walk Owner" });
    expect(attempt).toBe("4f1d2c3b-0000-4000-8000-000000000001");
  });

  it("adds a new vendor by name first, and asks for one when neither is given", async () => {
    mocks.addVendor.mockResolvedValue({ vendor: { vendor_id: "walk-new" } });
    mocks.addBill.mockResolvedValue({
      bill: { pay_by: "2026-11-27", pay_by_short: "(15-day limit)" },
    });
    const state = await addBillAction(
      INITIAL_ACTION_STATE,
      filled({ vendor_id: NEW_VENDOR, new_vendor: "Walk Print Works" }),
    );
    expect(state).toMatchObject({
      status: "sent",
      message: "Added. Pay by 27 Nov 2026 (15-day limit).",
    });
    expect(mocks.addVendor.mock.calls[0]![0]).toEqual({ name: "Walk Print Works" });
    expect(mocks.addBill.mock.calls[0]![0]).toMatchObject({ vendor_id: "walk-new" });
    const none = await addBillAction(
      INITIAL_ACTION_STATE,
      filled({ vendor_id: NEW_VENDOR, new_vendor: "" }),
    );
    expect(none).toMatchObject({
      status: "error",
      message: "Choose a vendor, or add one by name.",
    });
  });
});
