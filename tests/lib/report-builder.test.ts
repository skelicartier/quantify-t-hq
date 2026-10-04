import { describe, expect, it, vi } from "vitest";

/**
 * The report engine over fixed reads: money added up in one currency with the rest left
 * out and counted, money never summed for a role that cannot read it, months drawn with
 * the empty ones between, a record in two groups counted in each (and said), and the
 * records behind a figure being exactly the records the figure counted.
 */

const deal = (overrides: Record<string, unknown>) => ({
  deal_id: String(overrides.deal_id ?? "d"),
  name: "Deal",
  company_id: "",
  company_name: String(overrides.company_name ?? "Acme"),
  primary_person_id: "",
  stage_key: "proposal",
  stage_label: "Proposal",
  status: "open",
  mrr_amount: 0,
  currency: "USD",
  plan_key: "",
  seats: 1,
  win_probability: 0.5,
  weighted_mrr: 0,
  expected_close_date: "",
  next_step: "",
  next_step_due: "",
  owner_staff_id: "",
  source_key: "",
  days_in_stage: 3,
  idle_days: 1,
  flags: [],
  loss_reason: "",
  loss_competitor: "",
  loss_detail: "",
  closed_at: null,
  created_at: "2026-09-01T00:00:00Z",
  forecast_category: "pipeline",
  forecast_override: "",
  push_count: 0,
  first_close_date: "",
  next_step_stale: false,
  custom: {},
  ...overrides,
});

const ticket = (overrides: Record<string, unknown>) => ({
  id: String(overrides.id ?? "sup_1"),
  subject: "A question",
  status: "open",
  snoozed: false,
  snoozed_until: null,
  priority: "normal",
  source: "desktop",
  account_id: "",
  contact_email: "",
  assignee_staff_id: "",
  assignee_name: "",
  tags: [],
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-01T00:00:00Z",
  message_count: 2,
  notes_count: 0,
  last_author: "customer",
  last_at: "2026-09-01T00:00:00Z",
  unread: false,
  linked_issue_url: "",
  reopened_count: 0,
  followers: [],
  following: false,
  sla: { timer: "none", due_at: null, status: "none", minutes_remaining: null },
  ...overrides,
});

const reads = vi.hoisted(() => ({
  deals: [] as unknown[],
  tickets: [] as unknown[],
}));

vi.mock("@/lib/api/staff", () => ({
  directoryOrNull: async () => null,
  nameFor: (_directory: unknown, staffId: string, unknown = "—") => staffId || unknown,
}));
vi.mock("@/lib/api/crm", () => ({
  readCrmSettings: async () => ({ sources: [], archived_sources: [] }),
  readCompanies: async () => ({ companies: [], custom_fields: [] }),
  readLeads: async () => ({ leads: [], custom_fields: [] }),
  readTasks: async () => ({ tasks: [], counts: { open: 0, overdue: 0 } }),
}));
vi.mock("@/lib/api/deals", () => ({
  readDealsBoard: async () => ({
    columns: [{ key: "proposal", label: "Proposal", deals: reads.deals }],
    custom_fields: [],
  }),
}));
vi.mock("@/lib/api/tickets", () => ({
  readQueue: async () => ({ tickets: reads.tickets }),
}));

import {
  definitionQuery,
  groupKeyFromParam,
  loadReport,
  parseDefinitionQuery,
  recordsHref,
  reportRecords,
  runReport,
} from "@/lib/reports/builder";

const TODAY = "2026-10-04";

describe("a report's definition", () => {
  it("round-trips through its query, and falls back on what it does not know", () => {
    const definition = parseDefinitionQuery(
      "kind=deals&by=stage&measure=sum%3Avalue&f=owner%3Ais%3AAda&chart=pie&status=won",
    );
    expect(definition).toMatchObject({
      kind: "deals",
      by: "stage",
      measure: "sum:value",
      chart: "bar",
      status: "won",
      filters: ["owner:is:Ada"],
    });
    expect(parseDefinitionQuery(definitionQuery(definition))).toEqual(definition);
    // The list page's default status is not written out.
    expect(definitionQuery(parseDefinitionQuery("kind=deals"))).toBe("kind=deals");
    expect(parseDefinitionQuery("kind=nothing").kind).toBe("deals");
  });

  it("names the group of records with no value so a link can ask for it", () => {
    const definition = parseDefinitionQuery("kind=tickets&by=assignee");
    expect(recordsHref(definition, "")).toContain("g=%7E");
    expect(groupKeyFromParam("~")).toBe("");
    expect(groupKeyFromParam(undefined)).toBeNull();
  });
});

describe("running a report", () => {
  it("adds money up in one currency and counts what it left out", async () => {
    reads.deals = [
      deal({ deal_id: "d1", mrr_amount: 100, stage_key: "proposal" }),
      deal({ deal_id: "d2", mrr_amount: 50, stage_key: "proposal" }),
      deal({
        deal_id: "d3",
        mrr_amount: 1000,
        currency: "INR",
        stage_key: "negotiation",
        stage_label: "Negotiation",
      }),
    ];
    const definition = parseDefinitionQuery("kind=deals&by=stage&measure=sum%3Avalue");
    const loaded = await loadReport("token", definition, TODAY);
    const usd = runReport(loaded, definition, true);
    expect(usd.currency).toBe("USD");
    expect(usd.currencies).toEqual(["USD", "INR"]);
    expect(usd.total).toBe(150);
    expect(usd.groups.find((group) => group.key === "proposal")?.value).toBe(150);
    expect(usd.leftOut).toEqual([{ count: 1, why: "in other currencies than USD" }]);
    const inr = runReport(loaded, { ...definition, currency: "INR" }, true);
    expect([inr.total, inr.leftOut[0]?.count]).toEqual([1000, 2]);
  });

  it("never sums money for a role that cannot read it: it counts instead, and says so", async () => {
    reads.deals = [deal({ deal_id: "d1", mrr_amount: null, weighted_mrr: null })];
    const definition = parseDefinitionQuery("kind=deals&measure=sum%3Avalue");
    const result = runReport(await loadReport("token", definition, TODAY), definition, false);
    expect(result.unit).toBe("count");
    expect(result.total).toBe(1);
    expect(result.refused).toMatch(/does not read money/);
  });

  it("draws months in order with the empty ones between", async () => {
    reads.tickets = [
      ticket({ id: "t1", created_at: "2026-07-03T10:00:00Z" }),
      ticket({ id: "t2", created_at: "2026-09-20T10:00:00Z" }),
      ticket({ id: "t3", created_at: "2026-09-21T10:00:00Z" }),
    ];
    const definition = parseDefinitionQuery("kind=tickets&by=opened&chart=line");
    const result = runReport(await loadReport("token", definition, TODAY), definition, true);
    expect(result.time).toBe(true);
    expect(result.groups.map((group) => [group.key, group.value])).toEqual([
      ["2026-07", 1],
      ["2026-08", 0],
      ["2026-09", 2],
    ]);
  });

  it("counts a record in each of its groups, and says the groups overlap", async () => {
    reads.tickets = [
      ticket({ id: "t1", tags: ["billing", "login"] }),
      ticket({ id: "t2", tags: ["billing"] }),
      ticket({ id: "t3", tags: [] }),
    ];
    const definition = parseDefinitionQuery("kind=tickets&by=tag");
    const loaded = await loadReport("token", definition, TODAY);
    const result = runReport(loaded, definition, true);
    expect(result.overlapping).toBe(true);
    expect(result.total).toBe(3);
    expect(Object.fromEntries(result.groups.map((group) => [group.key, group.value]))).toEqual({
      billing: 2,
      login: 1,
      "": 1,
    });
    // The records behind a figure are the ones it counted.
    const billing = reportRecords(loaded, definition, "billing");
    expect(billing.lines.map((line) => line.id)).toEqual(["t1", "t2"]);
    expect(reportRecords(loaded, definition, "").lines.map((line) => line.id)).toEqual(["t3"]);
  });

  it("shows nothing to average as nothing, not as 0", async () => {
    reads.deals = [
      deal({ deal_id: "d1", status: "open", days_in_stage: 10 }),
      deal({ deal_id: "d2", status: "won", stage_key: "won", stage_label: "Won" }),
    ];
    const definition = parseDefinitionQuery("kind=deals&status=all&by=stage&measure=avg%3Aage");
    const result = runReport(await loadReport("token", definition, TODAY), definition, true);
    expect(Object.fromEntries(result.groups.map((group) => [group.key, group.value]))).toEqual({
      proposal: 10,
      won: null,
    });
    expect(result.leftOut).toEqual([{ count: 1, why: "with no days in stage" }]);
  });

  it("keeps the latest five years of months and says how many earlier ones are cut", async () => {
    reads.tickets = [
      ticket({ id: "t1", created_at: "2001-01-15T00:00:00Z" }),
      ticket({ id: "t2", created_at: "2026-09-15T00:00:00Z" }),
    ];
    const definition = parseDefinitionQuery("kind=tickets&by=opened");
    const result = runReport(await loadReport("token", definition, TODAY), definition, true);
    expect(result.groups).toHaveLength(60);
    expect(result.groups.at(-1)).toMatchObject({ key: "2026-09", value: 1 });
    expect(result.total).toBe(2);
    expect(result.notes[0]).toMatch(/^The 249 earliest months are not drawn/);
  });

  it("will not count by people's names when the staff directory could not be read", async () => {
    reads.tickets = [ticket({ id: "t1", assignee_staff_id: "s1" })];
    await expect(
      loadReport("token", parseDefinitionQuery("kind=tickets&by=assignee"), TODAY),
    ).rejects.toThrow(/staff directory/);
    await expect(
      loadReport("token", parseDefinitionQuery("kind=tickets&f=assignee%3Ais%3AAda"), TODAY),
    ).rejects.toThrow(/staff directory/);
  });

  it("applies the list's filters before it counts", async () => {
    reads.tickets = [
      ticket({ id: "t1", status: "open", priority: "high" }),
      ticket({ id: "t2", status: "resolved", priority: "high" }),
      ticket({ id: "t3", status: "open", priority: "low" }),
    ];
    const definition = parseDefinitionQuery("kind=tickets&by=priority&f=status%3Ais%3Aopen");
    const result = runReport(await loadReport("token", definition, TODAY), definition, true);
    expect(result.matched).toBe(2);
    expect(result.groups.map((group) => [group.key, group.value])).toEqual([
      ["high", 1],
      ["low", 1],
    ]);
  });
});
