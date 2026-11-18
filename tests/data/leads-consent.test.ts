// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { register as registerBatches } from "../../scripts/data/batches/index";
import type { WaitlistService } from "../../scripts/data/leads/contracts";
import { TRACKER_COLUMNS, VIEW_COLUMNS } from "../../scripts/data/leads/exports";
import { parseLeadQuery, queryString } from "../../scripts/data/leads/query";
import { dayInWords } from "../../scripts/data/leads/record";
import { leadIdOf } from "../../scripts/data/leads/types";
import { parseCsv } from "../../src/lib/crm/csv";
import {
  DELIVERY_FILTERS,
  NOT_LEGAL_ADVICE,
  WHERE,
  deliveryFilterOf,
  lawLineOf,
  stopWordsOf,
  whereOf,
  type WhereKey,
} from "../../src/lib/data/labels-outreach";
import {
  DELIVERY_SERVICE,
  NO_COUNTS,
  standingOf,
  type DeliveryFeed,
} from "../../src/lib/merge/delivery-contracts";
import { WALKER, readyToSend, sendLive, startKit, type Kit } from "./leads-kit";

/**
 * Consent and source on leads, and delivery per address (delivery spec §5.7, §7.5): where
 * a lead is, from the country field alone; the "Where" and "Delivery" filters and their
 * facet counts over a live send of 290 read through the stand-in feed; what a lead's page
 * is told about the stop list, a yes and each send; and the CSV's three new columns.
 * Everyone here is invented, on `.example` domains.
 */

// ------------------------------------------------------------------ where a lead is (pure)

describe("whereOf, by the spec's table", () => {
  const table: [WhereKey, string[]][] = [
    ["us", ["USA", "US", "U.S.A.", "United States", "United States of America", "America"]],
    [
      "uk",
      [
        "UK",
        "U.K.",
        "United Kingdom",
        "Great Britain",
        "Britain",
        "England",
        "Scotland",
        "Wales",
        "Northern Ireland",
      ],
    ],
    [
      "eu",
      [
        "Austria",
        "Belgium",
        "Bulgaria",
        "Croatia",
        "Cyprus",
        "Czech Republic",
        "Czechia",
        "Denmark",
        "Estonia",
        "Finland",
        "France",
        "Germany",
        "Greece",
        "Hungary",
        "Ireland",
        "Italy",
        "Latvia",
        "Lithuania",
        "Luxembourg",
        "Malta",
        "Netherlands",
        "The Netherlands",
        "Poland",
        "Portugal",
        "Romania",
        "Slovakia",
        "Slovenia",
        "Spain",
        "Sweden",
        "Iceland",
        "Liechtenstein",
        "Norway",
      ],
    ],
    ["in", ["India", "Bharat"]],
    ["elsewhere", ["Singapore", "Switzerland", "Deutschland", "UAE"]],
    ["unknown", ["", "   "]],
  ];

  it("reads every country as written, whatever its case, dots or spaces", () => {
    for (const [where, countries] of table)
      for (const country of countries) {
        expect(whereOf(country), country).toBe(where);
        expect(whereOf(`  ${country.toUpperCase()} `), country).toBe(where);
        expect(whereOf(country.toLowerCase()), country).toBe(where);
      }
    expect(whereOf(undefined)).toBe("unknown");
    expect(whereOf(42)).toBe("unknown");
  });

  it("holds the 27 members and the three EEA countries, and never guesses from an address", () => {
    expect(table.find(([where]) => where === "eu")![1]).toHaveLength(32);
    // An address's ending says nothing: only the country field is read.
    expect(whereOf("partner@fund.co.uk")).toBe("elsewhere");
    expect(whereOf(".in")).toBe("elsewhere");
  });

  it("labels each, and prints its law line ending Not legal advice", () => {
    expect(
      Object.fromEntries(Object.entries(WHERE).map(([key, value]) => [key, value.label])),
    ).toEqual({
      us: "United States",
      uk: "United Kingdom",
      eu: "European Union and EEA",
      in: "India",
      elsewhere: "Elsewhere",
      unknown: "Not known",
    });
    expect(lawLineOf("us")).toBe(
      "CAN-SPAM covers business email too: a postal address, a clear way out, opt-outs honoured within 10 business days. Not legal advice.",
    );
    expect(lawLineOf("uk")).toBe(
      "PECR: companies need no consent for business email, but sole traders and some partnerships do. Not legal advice.",
    );
    expect(lawLineOf("eu")).toBe("GDPR applies to named people at firms. Not legal advice.");
    expect(lawLineOf("in")).toBe(
      "The DPDP Act's consent and notice duties apply from 13 May 2027. Not legal advice.",
    );
    expect(lawLineOf("elsewhere")).toBe("No rule is suggested for this country. Not legal advice.");
    expect(lawLineOf("unknown")).toBe(lawLineOf("elsewhere"));
    for (const key of Object.keys(WHERE) as WhereKey[])
      expect(lawLineOf(key).endsWith(NOT_LEGAL_ADVICE)).toBe(true);
  });
});

describe("the delivery filter's value", () => {
  const at = "2026-11-10T04:00:00.000Z";
  const standing = (...kinds: Parameters<typeof standingOf>[0][number]["kind"][]) =>
    standingOf(kinds.map((kind) => ({ kind, at, reason: "" })));

  it("is delivered, didn't arrive, not yet, not read, or nothing", () => {
    expect(deliveryFilterOf(standing("delivered"), true)).toBe("delivered");
    // A complaint or an unsubscribe is from someone the mail reached.
    expect(deliveryFilterOf(standing("delivered", "complaint"), true)).toBe("delivered");
    expect(deliveryFilterOf(standing("unsubscribed"), true)).toBe("delivered");
    for (const kind of ["soft_bounce", "hard_bounce", "blocked", "invalid", "error"] as const)
      expect(deliveryFilterOf(standing(kind), true), kind).toBe("didnt_arrive");
    expect(deliveryFilterOf(standing("deferred"), true)).toBe("not_yet");
    expect(deliveryFilterOf(standing(), true)).toBe("not_yet");
    expect(deliveryFilterOf(null, true)).toBe("not_read");
    expect(deliveryFilterOf(null, false)).toBe("");
    expect(DELIVERY_FILTERS).toEqual({
      delivered: "Delivered",
      didnt_arrive: "Didn't arrive",
      not_yet: "Not delivered yet",
      not_read: "Not read yet",
    });
  });

  it("is kept in a query only when it is one of the keys", () => {
    const parse = (text: string) => parseLeadQuery(new URLSearchParams(text));
    expect(parse("where=in&delivery=didnt_arrive")).toMatchObject({
      where: "in",
      delivery: "didnt_arrive",
    });
    expect(parse("where=mars&delivery=opened")).toMatchObject({ where: "", delivery: "" });
    expect(parse("where=constructor&delivery=toString")).toMatchObject({ where: "", delivery: "" });
    expect(queryString(parse("delivery=not_yet&where=uk&q=asha"))).toBe(
      "q=asha&where=uk&delivery=not_yet",
    );
  });

  it("words a stop by its reason", () => {
    expect(stopWordsOf("asked", "14 Nov 2026")).toBe("Asked to stop on 14 Nov 2026");
    expect(stopWordsOf("bounced", "14 Nov 2026")).toBe("Bounced on 14 Nov 2026 (not an opt-out)");
    expect(stopWordsOf("manual", "14 Nov 2026")).toBe("Kept off by hand on 14 Nov 2026");
    expect(stopWordsOf("blocked", "14 Nov 2026")).toBe("Refused by the provider on 14 Nov 2026");
    expect(dayInWords("2026-11-04")).toBe("4 Nov 2026");
  });
});

// ------------------------------------------------------------------ a live send of 290, read back

type Body = Record<string, unknown>;
type Facet = { value: string; label: string; count: number };
type Page = {
  total: number;
  leads: { email: string; where: string; delivery: string | null; times_written: number }[];
  facets: Record<string, Facet[]>;
};

let kit: Kit;
let walk01 = "";
let today = "";

/** Where each of the 290 says they are: 250 in India, then four other answers. */
function countryOf(index: number): string {
  if (index <= 250) return "India";
  if (index <= 260) return "U.S.A.";
  if (index <= 270) return "United Kingdom";
  if (index <= 280) return "Germany";
  if (index <= 285) return "Singapore";
  return "";
}

function walkCsv(): string {
  const rows = ["First Name,Last Name,Title,Company,Firm Type,City,Country,Email"];
  for (let index = 1; index <= 290; index += 1)
    rows.push(
      `Asha${index},Rao${index},Partner,Walk Fund ${index},Family office,Mumbai,${countryOf(index)},partner${index}@fund${index}.example`,
    );
  return `${rows.join("\n")}\n`;
}

const waitlist: WaitlistService = {
  joinFromReply: ({ lead }) => ({
    entry_id: randomUUID(),
    created: true,
    firm: lead.company,
    unsent: 0,
    href: "/data/waitlist/x",
  }),
  forEmail: () => null,
  forFirm: () => null,
  stageCounts: () => ({
    joined: 0,
    call_booked: 0,
    call_held: 0,
    pilot: 0,
    customer: 0,
    dropped: 0,
  }),
  usedFor: () => [],
};

const list = async (query: string): Promise<Page> => {
  const answer = await kit.ask("GET", `/data/leads${query ? `?${query}` : ""}`);
  expect(answer.status).toBe(200);
  return answer.body as unknown as Page;
};
const lead = async (email: string): Promise<Body> => {
  const answer = await kit.ask("GET", `/data/leads/${leadIdOf(email)}`);
  expect(answer.status).toBe(200);
  return answer.body.lead as Body;
};
const facet = (page: Page, name: string): Record<string, number> =>
  Object.fromEntries(page.facets[name]!.map((entry) => [entry.value, entry.count]));
const standIn = (on = true) =>
  kit.ask("POST", "/data/_test/batches/delivery", { by: WALKER, ...(on ? {} : { on: false }) });

beforeAll(async () => {
  kit = await startKit({
    noFiles: true,
    before: async (engine) => {
      await readyToSend(engine);
      walk01 = engine.importList({
        name: "Walk 01",
        file_name: "walk-01.csv",
        text: walkCsv(),
      }).list.id;
      await sendLive(engine, walk01, "Walk live 01");
    },
  });
  kit.core.provide("waitlist", waitlist);
  registerBatches(kit.core);
  today = kit.core.day();
}, 120_000);
afterAll(() => kit.close());

describe("All leads, before delivery is read here", () => {
  it("counts Where, leaves the Delivery facet empty and ignores its filter", async () => {
    const all = await list("");
    expect(all.total).toBe(290);
    expect(facet(all, "where")).toEqual({
      in: 250,
      us: 10,
      uk: 10,
      eu: 10,
      elsewhere: 5,
      unknown: 5,
    });
    expect(all.facets.where!.find((entry) => entry.value === "eu")!.label).toBe(
      "European Union and EEA",
    );
    expect(all.facets.delivery).toEqual([]);
    // Nobody is hidden by a filter that cannot be read.
    expect((await list("delivery=didnt_arrive")).total).toBe(290);
    const first = (await list("q=partner1@fund1.example")).leads[0]!;
    expect(first).toMatchObject({ where: "in", delivery: null, times_written: 1 });
    expect(((await lead("partner36@fund36.example")).delivery as unknown[]).length).toBe(0);
  });

  it("filters on Where, each count the rows it shows", async () => {
    const india = await list("where=in");
    expect(india.total).toBe(250);
    // Every lead with the country India, and nobody else.
    expect(india.total).toBe((await list("country=India")).total);
    expect((await list("where=us")).total).toBe(10);
    expect((await list("where=unknown")).total).toBe(5);
    expect((await list("where=elsewhere")).total).toBe(5);
    // The facet still says what each other choice would show.
    expect(facet(india, "where")).toMatchObject({ in: 250, us: 10, unknown: 5 });
    expect((await list("where=uk")).leads.every((row) => row.where === "uk")).toBe(true);
    // An unknown value is no filter at all.
    expect((await list("where=mars")).total).toBe(290);
  });
});

describe("All leads, with Walk 01's delivery read through the stand-in", () => {
  beforeAll(async () => {
    expect((await standIn()).body).toMatchObject({ installed: true });
  });

  it("counts the Delivery facet as the spec's mix: 268 delivered, 21 didn't arrive, 1 not yet", async () => {
    const all = await list("");
    expect(facet(all, "delivery")).toEqual({ delivered: 268, didnt_arrive: 21, not_yet: 1 });
    expect(all.facets.delivery!.map((entry) => entry.label)).toEqual([
      "Delivered",
      "Didn't arrive",
      "Not delivered yet",
    ]);
  });

  it("filters on Delivery, alone and with the batch", async () => {
    expect((await list(`delivery=didnt_arrive&batch=${walk01}`)).total).toBe(21);
    expect((await list(`delivery=not_yet&batch=${walk01}`)).total).toBe(1);
    expect((await list(`delivery=delivered&batch=${walk01}`)).total).toBe(268);
    expect((await list("delivery=not_read")).total).toBe(0);
    const failed = await list("delivery=didnt_arrive");
    expect(failed.total).toBe(21);
    // 8 hard, 10 soft, and one each blocked, invalid and not sent.
    const shown = failed.leads.map((row) => row.delivery).sort();
    expect(shown.filter((value) => value === "hard_bounce")).toHaveLength(8);
    expect(shown.filter((value) => value === "soft_bounce")).toHaveLength(10);
    expect(shown.filter((value) => ["blocked", "invalid", "error"].includes(value!))).toHaveLength(
      3,
    );
    expect((await list("delivery=not_yet")).leads.map((row) => [row.email, row.delivery])).toEqual([
      ["partner47@fund47.example", "deferred"],
    ]);
    // Both filters at once: the ten U.S. leads are fund 251 to 260, of whom 252 bounced hard
    // and 261 (a soft bounce) is not among them.
    const us = await list("where=us&delivery=didnt_arrive");
    expect(us.leads.map((row) => row.email)).toEqual(["partner252@fund252.example"]);
    expect(facet(us, "delivery")).toEqual({ delivered: 9, didnt_arrive: 1 });
  });

  it("puts the newest send's word on each row", async () => {
    const page = await list("q=fund41.example");
    expect(page.leads.map((row) => row.delivery)).toEqual(["complaint"]);
    expect((await list("q=fund43.example")).leads[0]!.delivery).toBe("unsubscribed");
    expect((await list("q=fund36.example")).leads[0]!.delivery).toBe("hard_bounce");
    expect((await list("q=fund1.example")).leads[0]!.delivery).toBe("delivered");
  });

  it("never counts someone never written to, and never drops them", async () => {
    const added = await kit.ask("POST", "/data/leads/add", {
      by: WALKER,
      email: "new.person@unsent.example",
      values: { full_name: "New Person", country: "India" },
      attempt: randomUUID(),
    });
    expect(added.status).toBe(200);
    const all = await list("");
    expect(all.total).toBe(291);
    expect(facet(all, "delivery")).toEqual({ delivered: 268, didnt_arrive: 21, not_yet: 1 });
    expect((await list("where=in")).total).toBe(251);
    const row = (await list("q=unsent.example")).leads[0]!;
    expect(row).toMatchObject({ delivery: null, times_written: 0, where: "in" });
  });
});

describe("one lead's consent and source", () => {
  it("says not on the stop list, where they are, and each send's delivery", async () => {
    const one = await lead("partner1@fund1.example");
    expect(one.consent).toEqual({
      where: "in",
      opted_out_on: null,
      stop_words: "Not on the stop list",
      said_yes_on: null,
    });
    expect(one.delivery).toEqual([
      expect.objectContaining({ mailing: "Walk live 01", shown: "delivered", reason: "" }),
    ]);
    const sent = (one.sent as { mailing_id: string }[])[0]!;
    const read = (one.delivery as { mailing_id: string; sent_at: string; at: string }[])[0]!;
    expect(read.mailing_id).toBe(sent.mailing_id);
    expect(read.at > read.sent_at).toBe(true);
    expect((one.sources as { label: string }[])[0]!.label).toMatch(
      /^Mail merge list “Walk 01”, row \S+$/,
    );
    expect((await lead("partner255@fund255.example")).consent).toMatchObject({ where: "us" });
    expect((await lead("partner290@fund290.example")).consent).toMatchObject({ where: "unknown" });
  });

  it("gives a failure's reason with the address taken out", async () => {
    const hard = await lead("partner36@fund36.example");
    expect(hard.delivery).toEqual([
      expect.objectContaining({
        shown: "hard_bounce",
        reason: "550 5.1.1 <[address]>: user unknown",
      }),
    ]);
    expect(JSON.stringify(hard.delivery)).not.toContain("@fund36");
    expect((await lead("partner29@fund29.example")).delivery).toEqual([
      expect.objectContaining({ shown: "soft_bounce", reason: "452 4.2.2 The mailbox is full" }),
    ]);
    const complaint = (await lead("partner41@fund41.example")).delivery as Body[];
    expect(complaint[0]).toMatchObject({ shown: "complaint", reason: "" });
  });

  it("reads an opt-out from a stop that says they asked, with its day", async () => {
    kit.engine.addStops({ emails: "partner150@fund150.example", reason: "asked" });
    expect((await lead("partner150@fund150.example")).consent).toEqual({
      where: "in",
      opted_out_on: today,
      stop_words: `Asked to stop on ${dayInWords(today)}`,
      said_yes_on: null,
    });
  });

  it("never reads a bounce or a stop made by hand as an opt-out", async () => {
    kit.provider.blocked = [
      { email: "partner72@fund72.example", reason: "hardBounce", blocked_at: "" },
    ];
    await kit.engine.syncStops();
    kit.engine.addStops({ emails: "partner151@fund151.example", reason: "manual" });
    expect((await lead("partner72@fund72.example")).consent).toMatchObject({
      opted_out_on: null,
      stop_words: `Bounced on ${dayInWords(today)} (not an opt-out)`,
    });
    expect((await lead("partner151@fund151.example")).consent).toMatchObject({
      opted_out_on: null,
      stop_words: `Kept off by hand on ${dayInWords(today)}`,
    });
  });

  it("reads asked to hear from us from the first yes that still stands", async () => {
    const recorded = await kit.ask("POST", "/data/replies", {
      by: WALKER,
      email: "partner7@fund7.example",
      outcome: "replied_positive",
      words: "Invented: yes, tell me more.",
      subject: "Re: A note",
      received_at: new Date().toISOString(),
      add_if_missing: false,
    });
    expect(recorded.status).toBe(200);
    expect((await lead("partner7@fund7.example")).consent).toMatchObject({ said_yes_on: today });
    const replyId = String((recorded.body.reply as { reply_id: string }).reply_id);
    const back = await kit.ask("POST", `/data/replies/${replyId}/take-back`, { by: WALKER });
    expect(back.status).toBe(200);
    expect((await lead("partner7@fund7.example")).consent).toMatchObject({ said_yes_on: null });
  });
});

describe("the downloads", () => {
  it("ends This view with where, opted_out_on and delivery, and leaves the first columns alone", async () => {
    const text = await kit.build("leads_csv", { query: `batch=${walk01}` });
    const table = parseCsv(text.replace(/^﻿/, ""));
    expect(table.header).toEqual([...VIEW_COLUMNS]);
    expect(table.header.slice(-3)).toEqual(["where", "opted_out_on", "delivery"]);
    expect(table.header.slice(0, 7).join(",")).toBe(
      "email,name,first_name,last_name,title,company,firm_type",
    );
    expect(table.header.slice(-4, -3)).toEqual(["tags"]);
    expect(table.rows).toHaveLength(290);
    const row = (email: string) => {
      const cells = table.rows.find((line) => line[0] === email)!;
      return Object.fromEntries(table.header.map((key, index) => [key, cells[index] ?? ""]));
    };
    expect(row("partner36@fund36.example")).toMatchObject({
      where: "India",
      opted_out_on: "",
      delivery: "Hard bounce",
    });
    expect(row("partner150@fund150.example")).toMatchObject({
      where: "India",
      opted_out_on: today,
      delivery: "Delivered",
      stop_reason: "Asked to stop",
    });
    // A bounce is on the stop list, and is not an opt-out.
    expect(row("partner72@fund72.example")).toMatchObject({
      opted_out_on: "",
      stop_reason: "Bounced",
    });
    expect(row("partner41@fund41.example").delivery).toBe("Marked as spam");
    expect(row("partner47@fund47.example").delivery).toBe("Delayed");
    expect(row("partner255@fund255.example").where).toBe("United States");
    expect(row("partner290@fund290.example").where).toBe("Not known");
  });

  it("makes This view from the Delivery filter too", async () => {
    const text = await kit.build("leads_csv", {
      query: `delivery=didnt_arrive&batch=${walk01}`,
    });
    expect(parseCsv(text.replace(/^﻿/, "")).rows).toHaveLength(21);
  });

  it("leaves the old tracker as it was", async () => {
    const text = await kit.build("leads_tracker");
    const table = parseCsv(text.replace(/^﻿/, ""));
    expect(table.header).toEqual([...TRACKER_COLUMNS]);
    expect(table.header.join(",")).toBe(
      "status,sent_on,sent_in,batch,email,name,company,firm_type,country",
    );
  });
});

describe("written to, with nothing read about it", () => {
  it("reads Not read yet when the feed holds nothing for the address", async () => {
    expect((await standIn(false)).body).toMatchObject({ installed: false });
    const empty: DeliveryFeed = {
      state: () => ({
        last_read_at: null,
        outcome: null,
        detail: "",
        auto_stop_from: null,
        waiting: 0,
      }),
      mailings: () => [],
      mailing: () => null,
      forEmail: () => [],
      since: () => ({ ...NO_COUNTS }),
    };
    kit.core.provide(DELIVERY_SERVICE, empty);
    const all = await list("");
    expect(facet(all, "delivery")).toEqual({ not_read: 290 });
    expect((await list("delivery=not_read")).total).toBe(290);
    expect((await list("delivery=delivered")).total).toBe(0);
    expect(all.leads.every((row) => row.delivery === null)).toBe(true);
    const text = await kit.build("leads_csv", { query: "q=fund36.example" });
    expect(parseCsv(text.replace(/^﻿/, "")).rows[0]!.at(-1)).toBe("");
    kit.core.provide(DELIVERY_SERVICE, null);
  });
});
