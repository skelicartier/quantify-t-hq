// @vitest-environment node
import { randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { LeadsIndex, type StatusContext } from "../../scripts/data/leads/build";
import { parseLeadQuery, runQuery } from "../../scripts/data/leads/query";
import type { SourceRow } from "../../scripts/data/leads/sources";
import type { LeadSource, LeadStatus, ReplyMark, Standing } from "../../scripts/data/leads/types";
import { leadFileText } from "../../scripts/data/leads/walk-seed";
import type { SenderList, Stop, Written } from "../../scripts/data/sender-files";
import { LEAD_STATUS_ORDER, OUTCOME_ORDER, type Outcome } from "../../src/lib/data/labels";
import { WALKER, peopleCsv, readyToSend, sendLive, startKit, type Kit } from "./leads-kit";

/**
 * Asking the index: the one status rule (spec §2.4.4), counts that equal the rows a
 * filter shows, facets, sorts, and Mail merge's find over 66,000 leads inside the budget.
 */

// ------------------------------------------------------------------ the rule, worked by hand

type Case = {
  email: string;
  reply: Outcome | null;
  stop: "asked" | "bounced" | "firm_hold" | null;
  sent: boolean;
  held: boolean;
};

const REPLY_TO_STATUS: Record<Outcome, LeadStatus> = {
  replied_positive: "yes",
  not_interested: "no",
  not_now: "later",
  out_of_office: "later",
  wrong_person: "wrong_person",
  question: "question",
};

/** The rule as the spec words it, written apart from the code it checks. */
function expected(item: Case): { status: LeadStatus; detail: RegExp } {
  if (item.reply) return { status: REPLY_TO_STATUS[item.reply], detail: /./ };
  if (item.stop === "firm_hold") return { status: "held_back", detail: /^Firm already joined$/ };
  if (item.stop === "asked") return { status: "stopped", detail: /^Asked to stop$/ };
  if (item.stop === "bounced") return { status: "stopped", detail: /^Bounced$/ };
  if (item.sent) return { status: "sent", detail: /^9 Nov · Walk live 01$/ };
  if (item.held) return { status: "held_back", detail: /^Not a buyer$/ };
  return { status: "not_sent", detail: /^On Walk 01$/ };
}

describe("the status rule", () => {
  it("holds for every mix of reply, stop list, send and hold (L2)", async () => {
    const cases: Case[] = [];
    let n = 0;
    for (const reply of [null, ...OUTCOME_ORDER])
      for (const stop of [null, "asked", "bounced", "firm_hold"] as const)
        for (const sent of [false, true])
          for (const held of [false, true])
            cases.push({ email: `p${(n += 1)}@case${n}.example`, reply, stop, sent, held });
    const list: SenderList = {
      id: "list-1",
      name: "Walk 01",
      file_name: "walk-01.csv",
      created_at: "2026-11-01T00:00:00.000Z",
      hand: false,
      columns: [],
      rows: cases.map((item, index) => ({
        id: `r${index + 1}`,
        email: item.email,
        name: `Person ${index + 1}`,
        values: { email: item.email, first_name: `Person ${index + 1}` },
      })),
    };
    const held: LeadSource = {
      source_id: "held-1",
      file_id: "file-held",
      role: "held_back",
      reason: "Not a buyer",
      added_at: "2026-11-01T00:00:00.000Z",
      added_by: WALKER,
      state: "read",
      detail: "",
      title: "held_back.csv",
      read: null,
    };
    const heldRows: SourceRow[] = cases
      .filter((item) => item.held)
      .map((item) => ({
        email: item.email,
        values: { email: item.email },
        n: 1,
        line: 2,
        stale: false,
      }));
    const written: Written[] = cases
      .filter((item) => item.sent)
      .map((item) => ({
        email: item.email,
        mailing_id: "mailing-1",
        mailing: "Walk live 01",
        at: "2026-11-09T06:00:00.000Z",
      }));
    const index = await LeadsIndex.build(
      {
        lists: [list],
        sources: [{ source: held, rows: heldRows }],
        manual: [],
        edits: {},
        written,
      },
      async () => undefined,
      "2026-11-10T06:00:00.000Z",
    );
    const stops = new Map<string, Stop>();
    const marks = new Map<string, ReplyMark>();
    const holds = new Set<string>();
    for (const item of cases) {
      if (item.stop)
        stops.set(item.email, {
          email: item.email,
          reason: item.stop === "bounced" ? "bounced" : item.stop === "asked" ? "asked" : "manual",
          detail: "",
          at: "2026-11-08T06:00:00.000Z",
        });
      if (item.stop === "firm_hold") holds.add(item.email);
      if (item.reply)
        marks.set(item.email, {
          reply_id: randomUUID(),
          outcome: item.reply,
          received_at: "2026-11-10T05:00:00.000Z",
          later_until: "2026-11-24",
          referral_name: "Rhea",
          went: item.reply === "replied_positive" ? "waitlist" : null,
        });
    }
    const standing: Standing = {
      name: "waitlist",
      holdFor: (email) =>
        holds.has(email)
          ? { reason: "Firm already joined", firm: "Walk Fund", on: "2026-11-07" }
          : null,
    };
    const context: StatusContext = {
      stops,
      marks,
      standings: [standing],
      listName: (id) => (id === "list-1" ? "Walk 01" : ""),
      today: "2026-11-10",
    };
    expect(cases).toHaveLength(7 * 4 * 2 * 2);
    for (const item of cases) {
      const lead = index.status(index.byEmail.get(item.email)!, context);
      const want = expected(item);
      expect({ email: item.email, status: lead.status }).toEqual({
        email: item.email,
        status: want.status,
      });
      expect(lead.detail).toMatch(want.detail);
    }
    // The words for a reply's status are the spec's.
    const detailFor = (outcome: Outcome, stop: Case["stop"] = null) =>
      index.status(
        index.byEmail.get(
          cases.find((item) => item.reply === outcome && item.stop === stop)!.email,
        )!,
        context,
      ).detail;
    expect(detailFor("replied_positive")).toBe("10 Nov · on the waitlist");
    // A yes says where it went: an investor's yes moves the firm in Investors, not the waitlist.
    const yes = index.byEmail.get(
      cases.find((item) => item.reply === "replied_positive" && item.stop === null)!.email,
    )!;
    const yesMark = marks.get(yes.email)!;
    for (const [went, words] of [
      ["investors", "10 Nov · in Investors"],
      [null, "10 Nov"],
    ] as const) {
      marks.set(yes.email, { ...yesMark, went });
      yes.sv = -1;
      expect(index.status(yes, context).detail).toBe(words);
    }
    marks.set(yes.email, yesMark);
    yes.sv = -1;
    // A No reads the stop list itself: the entry may have been taken off by hand since.
    expect(detailFor("not_interested", "asked")).toBe("10 Nov · on the stop list");
    expect(detailFor("not_interested")).toBe("10 Nov · not on the stop list");
    expect(detailFor("not_now")).toBe("Write again 24 Nov");
    expect(detailFor("out_of_office")).toBe("Out of office until 24 Nov");
    expect(detailFor("question")).toBe("10 Nov · answer due");
    expect(detailFor("wrong_person")).toBe("Named Rhea");
  });
});

// ------------------------------------------------------------------ counts, facets, sorts

let kit: Kit;
const LIST_PEOPLE = 290;

beforeAll(async () => {
  kit = await startKit({
    before: async (engine, files, dir) => {
      await readyToSend(engine);
      const people = Array.from({ length: LIST_PEOPLE }, (_, index) => ({
        email: `partner${index + 1}@fund${index + 1}.example`,
        first: ["Asha", "Ravi", "Meera"][index % 3]!,
        last: `Rao${index + 1}`,
        company: `Walk Fund ${index + 1}`,
      }));
      const list = engine.importList({
        name: "Walk 01 - India named 1 of 20",
        file_name: "walk-01.csv",
        text: peopleCsv(people),
      }).list;
      engine.importList({
        name: "Walk 02 - India named 2 of 20",
        file_name: "walk-02.csv",
        text: peopleCsv(
          Array.from({ length: 50 }, (_, index) => ({
            email: `analyst${index + 1}@desk${index + 1}.example`,
            company: `Desk ${index + 1}`,
          })),
        ),
      });
      await sendLive(engine, list.id, "Walk live 01");
      engine.addStops({ emails: "analyst1@desk1.example analyst2@desk2.example", reason: "asked" });
      const file = files.add("all_leads.csv", leadFileText(0, 3_000));
      mkdirSync(join(dir, "data", "leads"), { recursive: true });
      writeFileSync(
        join(dir, "data", "leads", "sources.json"),
        JSON.stringify([
          {
            source_id: randomUUID(),
            file_id: file.file_id,
            role: "leads",
            reason: "",
            added_at: new Date().toISOString(),
            added_by: WALKER,
            state: "waiting",
            detail: "",
            title: file.title,
            read: null,
          },
        ]),
      );
    },
  });
  const record = (email: string, outcome: Outcome, extra: Record<string, unknown> = {}) =>
    kit.ask("POST", "/data/replies", {
      by: WALKER,
      email,
      outcome,
      words: "Invented words.",
      subject: "Re: A note",
      add_if_missing: false,
      ...extra,
    });
  await record("partner1@fund1.example", "not_now");
  await record("partner2@fund2.example", "question");
  await record("partner3@fund3.example", "not_interested");
  await record("partner4@fund4.example", "wrong_person", { referral: { name: "Rhea" } });
  await record("partner5@fund5.example", "not_now", { auto_reply: "on" });
  await record("analyst3@desk3.example", "question");
  await kit.ask(
    "POST",
    `/data/leads/${kit.leads.byEmail("asha.rao0@firm0.example")!.lead_id}/tags`,
    {
      by: WALKER,
      add: ["Warm"],
    },
  );
}, 60_000);
afterAll(() => kit.close());

type Page = {
  leads: {
    lead_id: string;
    email: string;
    status: string;
    name: string;
    last_written_at: string | null;
  }[];
  total: number;
  all: number;
  counts: { status: Record<string, number>; reply: Record<string, number> };
  book: Record<string, number>;
  facets: Record<string, { value: string; label: string; count: number }[]>;
};

async function page(query: string): Promise<Page> {
  const answer = await kit.ask("GET", `/data/leads?${query}`);
  expect(answer.status).toBe(200);
  return answer.body as unknown as Page;
}

/** Every row a filter shows, page by page, as the portal would page through it. */
async function everyRow(query: string): Promise<Page["leads"]> {
  const rows: Page["leads"] = [];
  for (let offset = 0; offset < 10_000; offset += 100) {
    const one = await page(`${query}&offset=${offset}`);
    rows.push(...one.leads);
    if (one.leads.length < 100) break;
  }
  return rows;
}

describe("a query", () => {
  it("counts each status as the rows that status shows, paged through (L3)", async () => {
    const all = await page("");
    expect(all.all).toBe(LIST_PEOPLE + 50 + 3_000);
    expect(all.total).toBe(all.all);
    expect(all.counts.status).toMatchObject({
      sent: LIST_PEOPLE - 5,
      later: 2,
      question: 2,
      no: 1,
      wrong_person: 1,
      stopped: 2,
      replied: 6,
    });
    for (const status of [...LEAD_STATUS_ORDER, "replied"]) {
      const rows = await everyRow(`status=${status}`);
      expect({ status, rows: rows.length }).toEqual({ status, rows: all.counts.status[status] });
      expect(new Set(rows.map((row) => row.lead_id)).size).toBe(rows.length);
    }
    const sum = LEAD_STATUS_ORDER.reduce((total, status) => total + all.counts.status[status]!, 0);
    expect(sum).toBe(all.total);
    // With Replied chosen, each reply word shows its own rows; out of office counts as later.
    expect(all.counts.reply).toMatchObject({ not_now: 1, out_of_office: 1, question: 2 });
    for (const reply of ["yes", "later", "no", "question", "wrong_person"]) {
      const rows = await everyRow(`status=replied&reply=${reply}`);
      expect(rows.every((row) => row.status === reply)).toBe(true);
      expect(rows.length).toBe(all.counts.status[reply]);
    }
    expect(all.book).toMatchObject({
      leads: all.all,
      written: LIST_PEOPLE,
      replied: 6,
      stopped: 2,
    });
  });

  it("gives facets whose counts are the rows each choice shows", async () => {
    const all = await page("");
    expect(all.facets.batch!.map((entry) => [entry.label, entry.count])).toEqual([
      ["Walk 01 - India named 1 of 20", LIST_PEOPLE],
      ["Walk 02 - India named 2 of 20", 50],
    ]);
    expect(all.facets.tag).toEqual([{ value: "warm", label: "Warm", count: 1 }]);
    for (const dim of ["country", "firm_type", "email_kind", "batch", "source"] as const) {
      for (const entry of all.facets[dim]!) {
        const one = await page(`${dim}=${encodeURIComponent(entry.value)}`);
        expect({ dim, value: entry.value, total: one.total }).toEqual({
          dim,
          value: entry.value,
          total: entry.count,
        });
      }
    }
    // A facet's own counts ignore its own filter, so another value can still be chosen.
    const india = await page("country=India");
    expect(india.facets.country!.length).toBe(all.facets.country!.length);
    // Status counts are of the other filters: Sent within Walk 02 is none, Not sent yet is 47.
    const walk02 = all.facets.batch![1]!.value;
    const narrowed = await page(`batch=${walk02}`);
    expect(narrowed.counts.status).toMatchObject({
      sent: 0,
      stopped: 2,
      question: 1,
      not_sent: 47,
    });
  });

  it("sorts: newest written first then the rest by name, by name, by firm", async () => {
    const written = await page("");
    expect(written.leads[0]!.last_written_at).not.toBeNull();
    const firstPages = await everyRow("sort=written");
    const firstNever = firstPages.findIndex((row) => row.last_written_at === null);
    expect(firstNever).toBe(LIST_PEOPLE);
    const stamps = firstPages.slice(0, firstNever).map((row) => row.last_written_at!);
    expect([...stamps].sort().reverse()).toEqual(stamps);
    const names = firstPages
      .slice(firstNever, firstNever + 200)
      .map((row) => (row.name || row.email).toLowerCase());
    expect([...names].sort()).toEqual(names);
    const byName = (await page("sort=name")).leads.map((row) =>
      (row.name || row.email).toLowerCase(),
    );
    expect([...byName].sort()).toEqual(byName);
    const byFirm = await kit.ask("GET", "/data/leads?sort=firm");
    expect(byFirm.status).toBe(200);
  });

  it("finds with Mail merge's find: every word must match, a number a whole number", async () => {
    const one = await page("q=meera%20fund12.example");
    expect(one.leads.map((row) => row.email)).toEqual(["partner12@fund12.example"]);
    // "12" matches the whole number 12, never 120 or 112.
    const numbered = await page("q=walk%20fund%2012");
    expect(numbered.leads.map((row) => row.email)).toEqual(["partner12@fund12.example"]);
    const none = await page("q=meera%20nobody");
    expect(none.total).toBe(0);
    const byDomain = await page("domain=fund7.example");
    expect(byDomain.leads.map((row) => row.email)).toEqual(["partner7@fund7.example"]);
  });
});

describe("a query over 66,000 leads", () => {
  it("answers a search inside the budget", async () => {
    const big = await startKit({
      before: (_engine, files, dir) => {
        const first = files.add("all_leads.csv", leadFileText(0, 40_000));
        const second = files.add("new_leads.csv", leadFileText(40_000, 66_000));
        mkdirSync(join(dir, "data", "leads"), { recursive: true });
        writeFileSync(
          join(dir, "data", "leads", "sources.json"),
          JSON.stringify(
            [first, second].map((file) => ({
              source_id: randomUUID(),
              file_id: file.file_id,
              role: "leads",
              reason: "",
              added_at: new Date().toISOString(),
              added_by: WALKER,
              state: "waiting",
              detail: "",
              title: file.title,
              read: null,
            })),
          ),
        );
      },
    });
    try {
      const index = big.module.index;
      const context = big.module.context();
      runQuery(index, parseLeadQuery(new URLSearchParams("")), context, { source: () => "" });
      const timings: number[] = [];
      for (const query of [
        "q=kabir%20london",
        "q=partner&country=India",
        "sort=name&q=shah",
        "status=not_sent",
      ]) {
        const started = performance.now();
        const result = runQuery(index, parseLeadQuery(new URLSearchParams(query)), context, {
          source: () => "",
        });
        timings.push(performance.now() - started);
        expect(result.all).toBe(66_000);
      }
      console.log(
        `[leads-query] 66,000 leads: ${timings.map((ms) => `${Math.round(ms)} ms`).join(", ")}`,
      );
      // The budget is 150 ms on the founder's Mac; the bound here allows a slow machine.
      for (const ms of timings) expect(ms).toBeLessThan(500);
      const found = runQuery(
        index,
        parseLeadQuery(new URLSearchParams("q=kabir%20london")),
        context,
        {
          source: () => "",
        },
      );
      expect(found.total).toBeGreaterThan(0);
      expect(
        found.matches.every(
          (lead) => lead.search.includes("kabir") && lead.search.includes("london"),
        ),
      ).toBe(true);
    } finally {
      big.close();
    }
  }, 60_000);
});
