// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { leadIdOf } from "../../scripts/data/leads/types";
import { INTERNAL_HEADER, OLD_HEADER, scrub } from "../../scripts/data/waitlist/exports";
import type { WaitlistInternal } from "../../scripts/data/waitlist/index";
import { oldWaitlistText } from "../../scripts/data/waitlist/walk-seed";
import {
  WALKER,
  peopleCsv,
  readyToSend,
  sendLive,
  startKit,
  type Answer,
  type Kit,
} from "./leads-kit";

/**
 * The waitlist (spec §2.6, §3.8.2, §3.11) on the real Data core and Mail merge engine in one
 * thread: a yes joins a firm (new or not), the stage rules and their events, "now at" and
 * "ever reached" against counts worked by hand, the hold preview, a hold that adds exactly
 * the stops it made and a release that takes off only those, both downloads, and the old
 * waitlist file brought in twice. Everyone is invented, on `.example` domains.
 */

type Body = Record<string, unknown>;

const WRITTEN = [
  { email: "partner1@fund1.example", first: "Asha", last: "Rao", company: "Walk Fund 1" },
  { email: "partner2@fund2.example", first: "Ravi", last: "Shah", company: "Walk Fund 2" },
  { email: "partner3@fund3.example", first: "Meera", last: "Iyer", company: "Walk Fund 3" },
];
// Colleagues at the first firm, on a list nobody has sent yet.
const UNSENT = [
  {
    email: "analyst1@fund1.example",
    first: "Dev",
    last: "Menon",
    title: "Analyst",
    company: "Walk Fund 1",
  },
  {
    email: "intern1@fund1.example",
    first: "Isha",
    last: "Bose",
    title: "Intern",
    company: "Walk Fund 1",
  },
  {
    email: "ops1@fund1.example",
    first: "Kabir",
    last: "Das",
    title: "Operations",
    company: "Walk Fund 1",
  },
  {
    email: "research1@fund1.example",
    first: "Tara",
    last: "Nair",
    title: "Research",
    company: "Walk Fund 1",
  },
];

let kits: Kit[] = [];
afterEach(() => {
  for (const kit of kits) kit.close();
  kits = [];
});

async function freshKit(dir?: string): Promise<Kit> {
  // A restart reuses the folder as it was; a fresh one seeds Mail merge first.
  const kit = await startKit(
    dir
      ? { dir }
      : {
          before: async (engine) => {
            await readyToSend(engine);
            const written = engine.importList({
              name: "Walk 01",
              file_name: "walk-01.csv",
              text: peopleCsv(WRITTEN),
            }).list.id;
            engine.importList({
              name: "Walk 02",
              file_name: "walk-02.csv",
              text: peopleCsv(UNSENT),
            });
            await sendLive(engine, written, "Walk live 01");
          },
        },
  );
  await kit.core.loadModules(["waitlist"], () => import("../../scripts/data/waitlist/index"));
  const failed = kit.core.modules.find((state) => state.state !== "ready");
  if (failed) throw new Error(`module ${failed.name} failed: ${failed.detail}`);
  kit.core.ready();
  await kit.settle();
  kits.push(kit);
  return kit;
}

const today = () => localDay(new Date());

async function yes(kit: Kit, email: string, extra: Body = {}): Promise<Answer> {
  return kit.ask("POST", "/data/replies", {
    by: WALKER,
    email,
    outcome: "replied_positive",
    words: "Yes, please add us. A call next week works.",
    subject: "Re: A note for the firm",
    received_at: new Date(Date.now() - 3_600_000).toISOString(),
    add_if_missing: false,
    ...extra,
  });
}

async function entryOf(kit: Kit, entryId: string): Promise<Body> {
  const answer = await kit.ask("GET", `/data/waitlist/${entryId}`);
  expect(answer.status).toBe(200);
  return answer.body;
}

const entryIdOf = (answer: Answer): string =>
  ((answer.body.reply as Body).effects as { kind: string; entry_id?: string }[]).find(
    (effect) => effect.kind === "waitlist_joined",
  )!.entry_id!;

const move = (kit: Kit, entryId: string, body: Body) =>
  kit.ask("POST", `/data/waitlist/${entryId}/stage`, { by: WALKER, ...body });

const codeOf = (answer: Answer) =>
  String(((answer.body.error ?? {}) as { code?: string }).code ?? "");

describe("a yes joins the firm", () => {
  it("makes a new firm at Joined with the quote, subject and received time (R1)", async () => {
    const kit = await freshKit();
    const received = new Date(Date.now() - 3_600_000).toISOString();
    const answer = await yes(kit, "partner1@fund1.example", {
      words: "Yes, count us in.",
      subject: "Re: A note for Walk Fund 1",
      received_at: received,
    });
    expect(answer.status).toBe(200);
    expect(answer.body.message).toBe(
      "Recorded: Asha Rao said yes. Walk Fund 1 is on the waitlist. 4 other addresses at fund1.example have not been written to yet: see them on the firm's page.",
    );
    const entryId = entryIdOf(answer);
    expect(answer.body.href).toBe(`/data/waitlist/${entryId}`);
    const detail = await entryOf(kit, entryId);
    expect(detail.entry).toMatchObject({
      firm: "Walk Fund 1",
      firm_key: "fund1.example",
      domain: "fund1.example",
      stage: "joined",
      joined_on: localDay(received),
      stage_since: localDay(received),
      how_joined: "Replied yes to “Walk live 01”",
      next_step: "Reply and offer call times",
      next_step_on: today(),
      naming: "described",
      described_as: "Partner, family office in Mumbai",
      contact_email: "partner1@fund1.example",
      proof: {
        quote: "Yes, count us in.",
        from: "partner1@fund1.example",
        subject: "Re: A note for Walk Fund 1",
        received_at: received,
        file_id: null,
        recorded_by: WALKER.name,
      },
      people: [{ email: "partner1@fund1.example", role: "not_set", added: "reply" }],
    });
    expect((detail.entry as Body).proof).toMatchObject({
      reply_id: (answer.body.reply as Body).reply_id,
    });
    expect((detail.events as Body[]).map((event) => event.kind)).toEqual(["next_step", "stage"]);
    const lead = (await kit.ask("GET", `/data/leads/${leadIdOf("partner1@fund1.example")}`)).body
      .lead as Body;
    expect(lead.status).toBe("yes");
    expect(lead.waitlist).toEqual({ entry_id: entryId, firm: "Walk Fund 1", stage: "joined" });
    // Nothing is held because a yes arrived.
    for (const person of UNSENT) expect(kit.core.sender.isStopped(person.email)).toBe(false);
  });

  it("adds the person to a firm already there, once", async () => {
    const kit = await freshKit();
    const first = entryIdOf(await yes(kit, "partner1@fund1.example"));
    const second = await yes(kit, "analyst1@fund1.example");
    expect(second.status).toBe(200);
    expect(entryIdOf(second)).toBe(first);
    expect(((second.body.reply as Body).effects as Body[])[0]).toMatchObject({ created: false });
    expect(second.body.message).toContain("3 other addresses at fund1.example");
    const detail = await entryOf(kit, first);
    expect((detail.entry as Body).people).toEqual([
      { email: "partner1@fund1.example", role: "not_set", added: "reply" },
      { email: "analyst1@fund1.example", role: "not_set", added: "reply" },
    ]);
    expect((detail.events as Body[])[0]).toMatchObject({
      kind: "person",
      text: "Dev Menon also said yes",
    });
    expect((await kit.ask("GET", "/data/waitlist")).body.total).toBe(1);
    const service = kit.core.need<WaitlistInternal>("waitlist")!;
    expect(service.forEmail("analyst1@fund1.example")?.entry_id).toBe(first);
    expect(service.forFirm("fund1.example")?.entry_id).toBe(first);
  });

  it("keeps the stand-in out once the real waitlist is loaded", async () => {
    const kit = await freshKit();
    const real = kit.core.need("waitlist");
    const asked = await kit.ask("POST", "/data/_test/waitlist", { by: WALKER, on: true });
    expect(asked.body).toMatchObject({ installed: false, real: true });
    await kit.ask("POST", "/data/_test/waitlist", { by: WALKER, on: false });
    expect(kit.core.need("waitlist")).toBe(real);
  });

  it("does not group free mail", async () => {
    const kit = await freshKit();
    const service = kit.core.need<WaitlistInternal>("waitlist")!;
    const lead = kit.leads.addManual({
      email: "own.book@inbox.example",
      values: { full_name: "Nisha Kapoor", email_kind: "personal-domain" },
      origin: "hand",
      referred_by: null,
      by: WALKER,
    });
    const joined = service.joinFromReply({
      reply: {
        kind: "reply",
        reply_id: "r-free",
        email: lead.email,
        lead_id: lead.lead_id,
        outcome: "replied_positive",
        received_at: new Date().toISOString(),
        subject: "",
        words: "Yes.",
        later_until: null,
        referral: null,
        mailing_id: null,
        mailing: "",
        recorded_at: new Date().toISOString(),
        recorded_by: WALKER,
        effects: [],
        attempt: "",
      },
      lead,
      firmKey: `mail:${lead.email}`,
      by: WALKER,
    });
    expect(joined).toMatchObject({ created: true, unsent: 0, firm: "Nisha Kapoor" });
    const preview = (await kit.ask("GET", `/data/waitlist/${joined.entry_id}/hold-preview`)).body;
    expect(preview).toMatchObject({ candidates: [], free_mail: true, large: false });
    expect((await entryOf(kit, joined.entry_id)).free_mail).toBe(true);
  });
});

describe("stages", () => {
  it("need a next step and a day, except Customer and Dropped; Dropped needs a reason (W1)", async () => {
    const kit = await freshKit();
    const entryId = entryIdOf(await yes(kit, "partner2@fund2.example"));
    const soon = addDays(today(), 3);
    let answer = await move(kit, entryId, { stage: "call_booked" });
    expect(answer.status).toBe(400);
    expect(answer.body.error).toEqual({
      code: "needs_next_step",
      message: "Moving to Call booked needs a next step and the day it is due by.",
    });
    answer = await move(kit, entryId, {
      stage: "call_booked",
      next_step: "Hold the call",
      next_step_on: soon,
    });
    expect(answer.body.error).toEqual({ code: "invalid", message: "Say when the call is." });
    answer = await move(kit, entryId, {
      stage: "call_booked",
      next_step: "Hold the call",
      next_step_on: addDays(today(), -1),
      call_at: new Date(Date.now() + 86_400_000).toISOString(),
    });
    expect(answer.body.error).toMatchObject({
      message: "The day for the next step is in the past.",
    });
    const callAt = new Date(Date.now() + 86_400_000).toISOString();
    answer = await move(kit, entryId, {
      stage: "call_booked",
      from: "joined",
      next_step: "Hold the call",
      next_step_on: soon,
      call_at: callAt,
    });
    expect(answer.status).toBe(200);
    expect(answer.body.entry).toMatchObject({
      stage: "call_booked",
      stage_since: today(),
      next_step: "Hold the call",
      next_step_on: soon,
      call_at: callAt,
    });
    expect(
      codeOf(
        await move(kit, entryId, {
          stage: "call_booked",
          next_step: "x",
          next_step_on: soon,
          call_at: callAt,
        }),
      ),
    ).toBe("same_stage");
    // A second press from a page that still showed Joined is caught.
    expect(codeOf(await move(kit, entryId, { stage: "customer", from: "joined" }))).toBe(
      "stage_changed",
    );
    expect(
      codeOf(await move(kit, entryId, { stage: "pilot", next_step: "x", next_step_on: soon })),
    ).toBe("invalid");
    expect(codeOf(await move(kit, entryId, { stage: "dropped" }))).toBe("needs_reason");
    answer = await move(kit, entryId, {
      stage: "dropped",
      dropped: { reason: "no_budget", look_again_on: addDays(today(), 30) },
    });
    expect(answer.body.entry).toMatchObject({
      stage: "dropped",
      next_step: "",
      next_step_on: null,
      dropped: { reason: "no_budget", look_again_on: addDays(today(), 30) },
    });
    answer = await move(kit, entryId, { stage: "customer" });
    expect(answer.status).toBe(200);
    expect(answer.body.entry).toMatchObject({ stage: "customer", dropped: null });
    const stages = ((await entryOf(kit, entryId)).events as Body[])
      .filter((event) => event.kind === "stage")
      .map((event) => [event.from ?? null, event.to, event.text]);
    expect(stages).toEqual([
      ["dropped", "customer", ""],
      ["call_booked", "dropped", "No budget"],
      ["joined", "call_booked", ""],
      [null, "joined", "Said yes in a reply"],
    ]);
  });

  it("count now at and ever reached from the events, as worked by hand (W2)", async () => {
    const kit = await freshKit();
    const a = entryIdOf(await yes(kit, "partner1@fund1.example"));
    const b = entryIdOf(await yes(kit, "partner2@fund2.example"));
    entryIdOf(await yes(kit, "partner3@fund3.example"));
    const step = { next_step: "Next", next_step_on: addDays(today(), 2) };
    const call = { ...step, call_at: new Date(Date.now() + 86_400_000).toISOString() };
    // A: Joined → Call booked → Call held → Pilot → Customer.
    expect((await move(kit, a, { stage: "call_booked", ...call })).status).toBe(200);
    expect(
      (await move(kit, a, { stage: "call_held", ...step, notes: "They want daily filings." }))
        .status,
    ).toBe(200);
    expect(
      (
        await move(kit, a, {
          stage: "pilot",
          ...step,
          pilot: { starts_on: today(), ends_on: addDays(today(), 30), success: "Daily use" },
        })
      ).status,
    ).toBe(200);
    expect((await move(kit, a, { stage: "customer" })).status).toBe(200);
    // B: Joined → Call booked → Dropped → Joined again. C stays at Joined.
    expect((await move(kit, b, { stage: "call_booked", ...call })).status).toBe(200);
    expect((await move(kit, b, { stage: "dropped", dropped: { reason: "timing" } })).status).toBe(
      200,
    );
    expect((await move(kit, b, { stage: "joined", ...step })).status).toBe(200);
    // By hand: now at Joined B, C; Customer A. Ever: Joined A B C; Call booked A B; Call
    // held A; Pilot A; Customer A; Dropped B.
    const page = (await kit.ask("GET", "/data/waitlist")).body;
    expect(page.now).toEqual({
      joined: 2,
      call_booked: 0,
      call_held: 0,
      pilot: 0,
      customer: 1,
      dropped: 0,
    });
    expect(page.ever).toEqual({
      joined: 3,
      call_booked: 2,
      call_held: 1,
      pilot: 1,
      customer: 1,
      dropped: 1,
    });
    expect(page.counts).toMatchObject({ all: 3, joined: 2, customer: 1 });
    const service = kit.core.need<WaitlistInternal>("waitlist")!;
    expect(service.stageCounts()).toEqual(page.now);
    const overview = (await kit.ask("GET", "/data/overview")).body;
    expect(overview.waitlist).toEqual([
      { stage: "joined", count: 2 },
      { stage: "call_booked", count: 0 },
      { stage: "call_held", count: 0 },
      { stage: "pilot", count: 0 },
      { stage: "customer", count: 1 },
      { stage: "dropped", count: 0 },
    ]);
    const calls = ((await entryOf(kit, a)).events as Body[]).filter(
      (event) => event.kind === "call",
    );
    expect(calls).toMatchObject([{ text: "They want daily filings." }]);
    // Joined's first step is due today: on the overview's Due, linked to the firm.
    const due = (overview.due as Body[]).filter((item) => item.kind === "waitlist");
    expect(due.map((item) => item.title)).toEqual(["Reply and offer call times"]);
    expect(String(due[0]!.href)).toMatch(/^\/data\/waitlist\/[0-9a-f-]{36}$/);
  });
});

describe("holding back the firm's unsent addresses", () => {
  it("previews the right people, holds exactly what it added, releases only those (W4)", async () => {
    const kit = await freshKit();
    const entryId = entryIdOf(await yes(kit, "partner1@fund1.example"));
    // One colleague asked to stop before any hold: not offered, and never taken over.
    kit.engine.addStops({ emails: "ops1@fund1.example", reason: "asked" });
    kit.core.sender.poll();
    let preview = (await kit.ask("GET", `/data/waitlist/${entryId}/hold-preview`)).body;
    expect(preview).toMatchObject({
      people_at_domain: 5,
      large: false,
      free_mail: false,
      domain: "fund1.example",
    });
    expect(preview.candidates).toEqual([
      { email: "analyst1@fund1.example", name: "Dev Menon", title: "Analyst", lists: ["Walk 02"] },
      { email: "intern1@fund1.example", name: "Isha Bose", title: "Intern", lists: ["Walk 02"] },
      {
        email: "research1@fund1.example",
        name: "Tara Nair",
        title: "Research",
        lists: ["Walk 02"],
      },
    ]);

    const held = await kit.ask("POST", `/data/waitlist/${entryId}/hold`, {
      by: WALKER,
      emails: [
        "analyst1@fund1.example",
        "intern1@fund1.example",
        "ops1@fund1.example",
        "someone@fund9.example",
      ],
    });
    expect(held.status).toBe(200);
    expect(held.body).toMatchObject({
      added: ["analyst1@fund1.example", "intern1@fund1.example"],
      already: ["ops1@fund1.example"],
      skipped: ["someone@fund9.example"],
    });
    const hold = held.body.hold as Body;
    expect(hold.emails).toEqual(["analyst1@fund1.example", "intern1@fund1.example"]);
    const stops = kit.core.sender.stops();
    expect(stops.find((stop) => stop.email === "analyst1@fund1.example")?.reason).toBe("manual");
    expect(stops.find((stop) => stop.email === "ops1@fund1.example")?.reason).toBe("asked");
    const lead = (await kit.ask("GET", `/data/leads/${leadIdOf("analyst1@fund1.example")}`)).body
      .lead as Body;
    expect(lead).toMatchObject({ status: "held_back", status_detail: "Firm already joined" });
    expect(lead.firm_hold).toMatchObject({ reason: "Firm already joined", firm: "Walk Fund 1" });
    expect((lead.waitlist as Body).entry_id).toBe(entryId);
    preview = (await kit.ask("GET", `/data/waitlist/${entryId}/hold-preview`)).body;
    expect((preview.candidates as Body[]).map((item) => item.email)).toEqual([
      "research1@fund1.example",
    ]);
    expect(((await entryOf(kit, entryId)).events as Body[])[0]).toMatchObject({
      kind: "hold",
      text: "Held back 2 unsent addresses",
    });

    // Someone takes one off by hand in Mail merge: the release records it without a call.
    kit.engine.removeStop({ email: "intern1@fund1.example" });
    const released = await kit.ask("POST", `/data/holds/${String(hold.hold_id)}/release`, {
      by: WALKER,
    });
    expect(released.status).toBe(200);
    expect(released.body).toMatchObject({
      released: ["analyst1@fund1.example", "intern1@fund1.example"],
      not_stopped: ["intern1@fund1.example"],
    });
    kit.core.sender.poll();
    expect(kit.core.sender.isStopped("analyst1@fund1.example")).toBe(false);
    // The address stopped before the hold stays stopped.
    expect(kit.core.sender.isStopped("ops1@fund1.example")).toBe(true);
    expect(
      codeOf(await kit.ask("POST", `/data/holds/${String(hold.hold_id)}/release`, { by: WALKER })),
    ).toBe("nothing_held");
    const after = (await kit.ask("GET", `/data/leads/${leadIdOf("analyst1@fund1.example")}`)).body
      .lead as Body;
    expect(after.status).toBe("not_sent");

    // One at a time: release a single address of a hold of two.
    const again = (
      await kit.ask("POST", `/data/waitlist/${entryId}/hold`, {
        by: WALKER,
        emails: ["analyst1@fund1.example", "research1@fund1.example"],
      })
    ).body.hold as Body;
    const one = await kit.ask("POST", `/data/holds/${String(again.hold_id)}/release`, {
      by: WALKER,
      emails: ["research1@fund1.example"],
    });
    expect(one.body).toMatchObject({ released: ["research1@fund1.example"], not_stopped: [] });
    expect((one.body.hold as Body).open).toEqual(["analyst1@fund1.example"]);
    kit.core.sender.poll();
    expect(kit.core.sender.isStopped("analyst1@fund1.example")).toBe(true);
    expect(kit.core.sender.isStopped("research1@fund1.example")).toBe(false);
  });

  it("never takes a stop off that a no, or a newer entry, still needs", async () => {
    const kit = await freshKit();
    const entryId = entryIdOf(await yes(kit, "partner1@fund1.example"));
    const hold = (
      await kit.ask("POST", `/data/waitlist/${entryId}/hold`, {
        by: WALKER,
        emails: ["analyst1@fund1.example", "intern1@fund1.example", "research1@fund1.example"],
      })
    ).body.hold as Body;
    // A held colleague writes back "no": the stop is theirs now as much as the hold's.
    const no = await kit.ask("POST", "/data/replies", {
      by: WALKER,
      email: "analyst1@fund1.example",
      outcome: "not_interested",
      words: "Please do not write to me.",
      subject: "Re: A note",
      received_at: new Date().toISOString(),
      add_if_missing: false,
    });
    expect(no.status).toBe(200);
    // Another is taken off by hand and put back for a different reason.
    kit.engine.removeStop({ email: "intern1@fund1.example" });
    kit.engine.addStops({ emails: "intern1@fund1.example", reason: "asked" });
    const released = await kit.ask("POST", `/data/holds/${String(hold.hold_id)}/release`, {
      by: WALKER,
    });
    expect(released.status).toBe(200);
    expect(released.body.kept).toEqual([
      { email: "analyst1@fund1.example", why: "they said no" },
      {
        email: "intern1@fund1.example",
        why: "it was put on the stop list again since, for another reason",
      },
    ]);
    kit.core.sender.poll();
    expect(kit.core.sender.isStopped("analyst1@fund1.example")).toBe(true);
    expect(kit.core.sender.isStopped("intern1@fund1.example")).toBe(true);
    expect(kit.core.sender.isStopped("research1@fund1.example")).toBe(false);
  });

  it("survives a restart: the holds and firms are read back from the folder", async () => {
    const kit = await freshKit();
    const entryId = entryIdOf(await yes(kit, "partner1@fund1.example"));
    await kit.ask("POST", `/data/waitlist/${entryId}/hold`, {
      by: WALKER,
      emails: ["analyst1@fund1.example"],
    });
    const dir = kit.dir;
    kit.core.close();
    kits = kits.filter((item) => item !== kit);
    const again = await freshKit(dir);
    const lead = (await again.ask("GET", `/data/leads/${leadIdOf("analyst1@fund1.example")}`)).body
      .lead as Body;
    expect(lead).toMatchObject({ status: "held_back", status_detail: "Firm already joined" });
    expect(((await entryOf(again, entryId)).holds as Body[]).map((hold) => hold.open)).toEqual([
      ["analyst1@fund1.example"],
    ]);
  });
});

describe("the downloads", () => {
  it("never give investors an address, a name, a phone or the quote (W5)", async () => {
    const kit = await freshKit();
    const named = entryIdOf(
      await yes(kit, "partner1@fund1.example", { words: "Yes, add Walk Fund 1 please." }),
    );
    const described = entryIdOf(
      await yes(kit, "partner2@fund2.example", { words: "Quote that must never travel." }),
    );
    // Typed by hand: a name on file at the firm, the firm's own name, and a phone.
    expect(
      (
        await kit.ask("POST", `/data/waitlist/${described}/update`, {
          by: WALKER,
          field: "how_joined",
          value: "Ravi Shah of Walk Fund 2 said yes on a call, +91 98765 43210",
        })
      ).status,
    ).toBe(200);
    const added = await kit.ask("POST", "/data/waitlist", {
      by: WALKER,
      attempt: crypto.randomUUID(),
      email: "cio@callfund.example",
      firm: "Call Fund",
      joined_on: today(),
      how_joined: "Said yes on a call, cio@callfund.example (ref 1234567890)",
      quote: "Never shown",
    });
    expect(added.status).toBe(200);
    expect(
      (
        await kit.ask("POST", `/data/waitlist/${named}/update`, {
          by: WALKER,
          field: "naming",
          value: "named",
        })
      ).status,
    ).toBe(200);
    const refused = await kit.ask("POST", `/data/waitlist/${named}/update`, {
      by: WALKER,
      field: "described_as",
      value: "Write to asha@fund1.example",
    });
    expect(codeOf(refused)).toBe("invalid");
    const page = (await kit.ask("GET", "/data/waitlist/for-investors")).body;
    const rows = page.rows as Body[];
    expect(rows).toHaveLength(3);
    const text = JSON.stringify(page);
    const csv = await kit.build("investor_csv");
    for (const shown of [text, csv]) {
      expect(shown).not.toContain("@");
      expect(shown).not.toMatch(/\d{8}/);
      expect(shown).not.toContain("Quote that must never travel");
      expect(shown).not.toContain("Never shown");
      expect(shown).not.toContain("Ravi Shah");
      expect(shown).not.toContain("Walk Fund 2");
      expect(shown).not.toContain("Call Fund");
      expect(shown).toContain("Walk Fund 1");
    }
    expect(rows.find((row) => row.named === true)?.firm).toBe("Walk Fund 1");
    expect(rows.filter((row) => row.named === false).map((row) => row.firm)).toEqual(
      expect.arrayContaining(["Partner, family office in Mumbai"]),
    );
    const call = rows.find((row) => row.how_joined === "Said yes on a call");
    expect(call).toMatchObject({ proof: "call", firm: "A firm on the waitlist" });
    expect(rows.find((row) => String(row.how_joined).includes("of the firm"))?.how_joined).toBe(
      "someone there of the firm said yes on a call",
    );
    expect(csv.split("\r\n")[0]).toBe(
      "\ufeffjoined_on,firm,firm_type,place,contact_role,how_joined,stage,since,proof,as_of",
    );
    expect(csv).toContain(`Written reply, ${today()}`);
    expect(csv).toContain(`On a call, ${today()}`);
  });

  it("keep the old twelve columns first in Every field (W6)", async () => {
    const kit = await freshKit();
    entryIdOf(
      await yes(kit, "partner1@fund1.example", {
        words: "Yes, count us in.",
        subject: "Re: A note for Walk Fund 1",
        received_at: new Date(Date.now() - 60_000).toISOString(),
      }),
    );
    const csv = await kit.build("waitlist_csv");
    const [header, row] = csv.replace(/^\ufeff/, "").split("\r\n");
    expect(header!.split(",").slice(0, 12)).toEqual([...OLD_HEADER]);
    expect(header!.split(",")).toEqual([...INTERNAL_HEADER]);
    expect(OLD_HEADER.join(",")).toBe(
      "joined_on,full_name,title,company,firm_type,city,country,email,how_joined,proof,status,notes",
    );
    expect(row).toContain(
      "Asha Rao,Partner,Walk Fund 1,Family office,Mumbai,India,partner1@fund1.example",
    );
    expect(row).toContain(`Yes, count us in. (subject “Re: A note for Walk Fund 1”, ${today()})`);
    expect(row).toContain(",Joined,");
  });

  it("scrubs addresses, phones and long numbers out of free text", () => {
    expect(scrub("Call +91 98765 43210 or write to a.b@x.example today")).toBe(
      "Call or write to today",
    );
    expect(scrub("Ref 12345678 · 2026-11-10")).toBe("Ref · 2026-11-10");
    expect(scrub("Said yes to Ravi Shah of Peak", ["Ravi Shah", "Ravi"], ["Peak"])).toBe(
      "Said yes to someone there of the firm",
    );
  });
});

describe("the old waitlist file", () => {
  it("adds one firm per row at Joined, and none the second time (W8)", async () => {
    const kit = await freshKit();
    const text = oldWaitlistText(3);
    const first = await kit.ask("POST", "/data/waitlist/import", {
      by: WALKER,
      attempt: crypto.randomUUID(),
      text,
      file_name: "waitlist.csv",
    });
    expect(first.status).toBe(200);
    expect(first.body).toMatchObject({ added: 3, already: 0, refused: [] });
    const second = await kit.ask("POST", "/data/waitlist/import", {
      by: WALKER,
      attempt: crypto.randomUUID(),
      text,
      file_name: "waitlist.csv",
    });
    expect(second.body).toMatchObject({ added: 0, already: 3 });
    const page = (await kit.ask("GET", "/data/waitlist")).body;
    expect(page.total).toBe(3);
    const rows = page.entries as Body[];
    expect(rows.every((row) => row.stage === "joined")).toBe(true);
    const one = rows.find((row) => row.firm === "Old Walk Fund 1") as Body;
    expect(one).toMatchObject({
      joined_on: "2026-10-11",
      how_joined: "Replied yes to “Waitlist 01”",
    });
    const detail = await entryOf(kit, String(one.entry_id));
    expect((detail.entry as Body).proof).toMatchObject({
      quote: "Yes, add us. (subject “Re: Waitlist 01”, 2026-10-11)",
      from: "old1@oldfund1.example",
    });
    expect((detail.entry as Body).described_as).toBe("Managing partner, family office in Mumbai");
    expect(
      (detail.events as Body[]).some(
        (event) => event.text === "From the old waitlist file: Asked for the deck first",
      ),
    ).toBe(true);
    // Each contact became a lead, so nobody on the old file is lost.
    expect(kit.leads.byEmail("old2@oldfund2.example")?.name).toBe("Old Walker 2");
  });

  it("refuses a file without the old columns, and a row without an address", async () => {
    const kit = await freshKit();
    const wrong = await kit.ask("POST", "/data/waitlist/import", {
      by: WALKER,
      text: "name,phone\nA,1\n",
      file_name: "other.csv",
    });
    expect(codeOf(wrong)).toBe("invalid");
    const partial = await kit.ask("POST", "/data/waitlist/import", {
      by: WALKER,
      text: `${OLD_HEADER.join(",")}\n2026-10-01,No Address,Partner,Nowhere,AIF,Pune,India,,Said yes,,,\n`,
      file_name: "waitlist.csv",
    });
    expect(partial.body).toMatchObject({
      added: 0,
      refused: [{ line: 2, reason: "No address, or not an email address" }],
    });
  });
});

describe("proof and colleagues", () => {
  it("keeps a saved copy in Files and lists it under Used for", async () => {
    const kit = await freshKit();
    const entryId = entryIdOf(await yes(kit, "partner1@fund1.example"));
    const answer = await kit.ask("POST", `/data/waitlist/${entryId}/proof-file`, {
      by: WALKER,
      attempt: crypto.randomUUID(),
      name: "reply.txt",
      content: Buffer.from("An invented saved reply.").toString("base64"),
    });
    expect(answer.status).toBe(200);
    const fileId = String((answer.body.file as Body).file_id);
    expect((answer.body.entry as Body).proof).toMatchObject({ file_id: fileId });
    const service = kit.core.need<WaitlistInternal>("waitlist")!;
    expect(service.usedFor(fileId)).toEqual([
      { label: "Proof of Walk Fund 1's yes, on the waitlist", href: `/data/waitlist/${entryId}` },
    ]);
  });

  it("adds a colleague as a lead copied on the yes, and sets roles", async () => {
    const kit = await freshKit();
    const entryId = entryIdOf(await yes(kit, "partner1@fund1.example"));
    const added = await kit.ask("POST", `/data/waitlist/${entryId}/people`, {
      by: WALKER,
      email: "cfo@fund1.example",
      name: "Arjun Pillai",
      title: "Chief financial officer",
      role: "decision_maker",
    });
    expect(added.status).toBe(200);
    const lead = kit.leads.byEmail("cfo@fund1.example")!;
    expect(lead).toMatchObject({
      company: "Walk Fund 1",
      badges: ["Copied on a yes"],
      tags: ["Copied on a yes"],
    });
    const role = await kit.ask("POST", `/data/waitlist/${entryId}/people/role`, {
      by: WALKER,
      email: "analyst1@fund1.example",
      role: "champion",
    });
    expect(role.status).toBe(200);
    const people = (await entryOf(kit, entryId)).people as Body[];
    expect(people.map((person) => [person.email, person.role])).toEqual([
      ["partner1@fund1.example", "not_set"],
      ["cfo@fund1.example", "decision_maker"],
      ["analyst1@fund1.example", "champion"],
      ["intern1@fund1.example", "not_set"],
      ["ops1@fund1.example", "not_set"],
      ["research1@fund1.example", "not_set"],
    ]);
    expect(
      codeOf(
        await kit.ask("POST", `/data/waitlist/${entryId}/people`, {
          by: WALKER,
          email: "cfo@fund1.example",
        }),
      ),
    ).toBe("already_there");
  });
});
