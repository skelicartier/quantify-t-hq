// @vitest-environment node
import { afterEach, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import type { Diligence, Trial } from "../../scripts/data/diligence/types";
import { closeKit, codeOf, entry, messageOf, type CloseKit } from "./close-kit";

/**
 * Buyer diligence and dataset trials (ws-notes/company/spec.md §9.3, §9.6) on the real
 * module: the refusals (a reference shared before consent, a sample before clearance,
 * `auto_renews: true`), Due rows and `agenda:diligence`, and the "Used for" labels of the
 * copies kept in "06 Contracts and NDAs › Diligence". Every firm is invented.
 */

let kits: CloseKit[] = [];
afterEach(() => {
  for (const kit of kits) kit.close();
  kits = [];
});

const today = () => localDay(new Date());
const day = (offset: number) => addDays(today(), offset);
const content = Buffer.from("invented bytes").toString("base64");

async function fresh(): Promise<CloseKit> {
  const kit = await closeKit({ entries: [entry(1), entry(2)] });
  kits.push(kit);
  return kit;
}

const open = async (kit: CloseKit, n = 1): Promise<Diligence> =>
  (
    await kit.post("/data/diligence", {
      entry_id: entry(n).entry_id,
      attempt: crypto.randomUUID(),
    })
  ).body.diligence as Diligence;

const trial = async (kit: CloseKit, change: Record<string, unknown> = {}) =>
  kit.post("/data/trials", {
    entry_id: entry(1).entry_id,
    dataset: "Walk dataset",
    dictionary_version: "v0.3",
    starts_on: day(0),
    ends_on: day(30),
    go_no_go_on: day(28),
    attempt: crypto.randomUUID(),
    ...change,
  });

describe("buyer diligence", () => {
  it("one open per firm; the questionnaire's count; the review's days", async () => {
    const kit = await fresh();
    const missing = await kit.post("/data/diligence", { entry_id: "not-here" });
    expect(messageOf(missing)).toBe("That firm is not on the waitlist.");
    const item = await open(kit);
    const again = await kit.post("/data/diligence", { entry_id: entry(1).entry_id });
    expect([again.status, codeOf(again), messageOf(again)]).toEqual([
      409,
      "diligence_open",
      "Walk Buyer 1's diligence is open already.",
    ]);
    const tooMany = await kit.post(`/data/diligence/${item.diligence_id}/questionnaire`, {
      questions: "2001",
    });
    expect(messageOf(tooMany)).toBe(
      "Give the number of questions as a whole number, from 1 to 2,000.",
    );
    const saved = await kit.post(`/data/diligence/${item.diligence_id}/questionnaire`, {
      received_on: day(0),
      due_on: day(5),
      questions: "120",
    });
    expect((saved.body.diligence as Diligence).questionnaire).toMatchObject({
      received_on: day(0),
      due_on: day(5),
      questions: 120,
    });
    const backwards = await kit.post(`/data/diligence/${item.diligence_id}/security-review`, {
      started_on: day(-1),
      finished_on: day(-3),
    });
    expect(messageOf(backwards)).toBe("The review finished before it started.");
    await kit.post(`/data/diligence/${item.diligence_id}/close`);
    expect((await kit.post(`/data/diligence/${item.diligence_id}/reopen`)).status).toBe(200);
  });

  it("a reference is never shared before their consent", async () => {
    const kit = await fresh();
    const item = await open(kit);
    const add = (body: Record<string, unknown>) =>
      kit.post(`/data/diligence/${item.diligence_id}/references`, {
        name: "Walk Referee",
        firm: "Walk Fund 9",
        role: "Partner",
        ...body,
      });
    const shared = await add({ shared_on: day(0) });
    expect([shared.status, codeOf(shared), messageOf(shared)]).toEqual([
      409,
      "no_consent",
      "Record their consent first: a reference is shared only once they agree.",
    ]);
    expect(codeOf(await add({ consent_on: day(0), shared_on: day(-1) }))).toBe("no_consent");
    const ok = await add({ consent_on: day(-1), shared_on: day(0) });
    expect(ok.status).toBe(200);
    const reference = (ok.body.diligence as Diligence).references[0]!;
    const update = await kit.post(
      `/data/diligence/${item.diligence_id}/references/${reference.reference_id}/update`,
      { name: "Walk Referee", consent_on: "", shared_on: day(0) },
    );
    expect(codeOf(update)).toBe("no_consent");
    expect(messageOf(await add({ name: "" }))).toBe("Give the reference's name.");
  });

  it("redlines number their rounds and keep their copy", async () => {
    const kit = await fresh();
    const item = await open(kit);
    expect(messageOf(await kit.post(`/data/diligence/${item.diligence_id}/redlines`, {}))).toBe(
      "Say which document.",
    );
    await kit.post(`/data/diligence/${item.diligence_id}/redlines`, {
      document: "Pilot agreement",
      sent_on: day(-3),
      status: "with_them",
    });
    const second = await kit.post(`/data/diligence/${item.diligence_id}/redlines`, {
      document: "Pilot agreement",
      received_on: day(0),
      status: "with_us",
      content,
      name: "redline-2.docx",
    });
    const redlines = (second.body.diligence as Diligence).redlines;
    expect(redlines.map((line) => line.round)).toEqual([1, 2]);
    expect(
      messageOf(
        await kit.post(`/data/diligence/${item.diligence_id}/redlines`, {
          document: "NDA",
          round: "51",
        }),
      ),
    ).toBe("Give the round as a whole number, from 1 to 50.");
    const service = kit.core.need<{ usedFor(id: string): { label: string }[] }>("diligence")!;
    expect(service.usedFor(redlines[1]!.file_id!)).toEqual([
      {
        label: "Redline round 2 with Walk Buyer 1",
        href: `/data/waitlist/${entry(1).entry_id}#waitlist-diligence`,
      },
    ]);
  });
});

describe("dataset trials", () => {
  it("never renew on their own: auto_renews anything but false is refused", async () => {
    const kit = await fresh();
    for (const value of [true, "true", "on", 1]) {
      const refused = await trial(kit, { auto_renews: value });
      expect([refused.status, messageOf(refused)]).toEqual([
        400,
        "A trial never renews on its own here. Agree the next step in writing instead.",
      ]);
    }
    const made = await trial(kit, { auto_renews: false });
    expect((made.body.trial as Trial).auto_renews).toBe(false);
    expect(messageOf(await trial(kit, { dataset: "" }))).toBe("Name the dataset.");
    expect(messageOf(await trial(kit, { ends_on: day(-1) }))).toBe(
      "The trial ends before it starts.",
    );
  });

  it("no sample before their compliance team clears it", async () => {
    const kit = await fresh();
    const id = ((await trial(kit)).body.trial as Trial).trial_id;
    const early = await kit.post(`/data/trials/${id}/sample`, { sent_on: day(0) });
    expect([early.status, codeOf(early), messageOf(early)]).toEqual([
      409,
      "not_cleared",
      "Their compliance team clears a trial before any data goes. Record when it was cleared.",
    ]);
    await kit.post(`/data/trials/${id}/clearance`, {
      cleared_on: day(0),
      by_name: "Walk Compliance",
    });
    expect(codeOf(await kit.post(`/data/trials/${id}/sample`, { sent_on: day(-1) }))).toBe(
      "not_cleared",
    );
    const sent = await kit.post(`/data/trials/${id}/sample`, {
      sent_on: day(0),
      content,
      name: "sample.csv",
    });
    expect(sent.status).toBe(200);
    const fileId = (sent.body.trial as Trial).sample!.file_id!;
    expect(kit.folders).toEqual([["06 Contracts and NDAs", "Diligence"]]);
    expect(
      kit.core.need<{ usedFor(id: string): { label: string }[] }>("diligence")!.usedFor(fileId),
    ).toEqual([
      {
        label: "Sample sent to Walk Buyer 1 for a trial",
        href: `/data/waitlist/${entry(1).entry_id}#waitlist-trials`,
      },
    ]);
  });
});

describe("Due and the agenda", () => {
  it("the questionnaire within 7 days, a trial's go/no-go within 3, its end within 7", async () => {
    const kit = await fresh();
    const item = await open(kit);
    await kit.post(`/data/diligence/${item.diligence_id}/questionnaire`, {
      received_on: day(0),
      due_on: day(5),
      questions: "120",
    });
    const near = ((await trial(kit, { ends_on: day(6), go_no_go_on: day(2) })).body.trial as Trial)
      .trial_id;
    const far = ((await trial(kit, { ends_on: day(40), go_no_go_on: day(30) })).body.trial as Trial)
      .trial_id;
    const due = (
      (await kit.get("/data/overview")).body.due as { key: string; kind: string; title: string }[]
    ).filter((row) => row.kind === "diligence");
    expect(due.map((row) => row.title).sort()).toEqual(
      [
        "Answer Walk Buyer 1's questionnaire",
        "Go or no-go on the trial: Walk Buyer 1",
        `The trial with Walk Buyer 1 ends ${Number(day(6).slice(8))} ${new Date(`${day(6)}T00:00:00Z`).toLocaleString("en-GB", { month: "short", timeZone: "UTC" })}`,
      ].sort(),
    );
    expect(due.some((row) => row.key.includes(far))).toBe(false);
    expect(due.some((row) => row.key === `trial:${near}:decide`)).toBe(true);
    const items = (await kit.get("/data/_test/diligence/agenda")).body.items as {
      key: string;
      plain: string;
      remind_days: number[];
    }[];
    expect(
      items.find((entry) => entry.key === `diligence:${item.diligence_id}:questionnaire`),
    ).toMatchObject({
      plain: "Questionnaire due",
      remind_days: [7, 0],
    });
    expect(items.find((entry) => entry.key === `trial:${far}:decide`)).toMatchObject({
      plain: "Trial decision",
      remind_days: [3, 0],
    });
    expect(items.find((entry) => entry.key === `trial:${far}:end`)).toMatchObject({
      plain: "Trial ends",
      remind_days: [0],
    });
    await kit.post(`/data/trials/${near}/decision`, { outcome: "go", on: day(0), note: "" });
    const after = ((await kit.get("/data/overview")).body.due as { key: string }[]).map(
      (row) => row.key,
    );
    expect(after.some((key) => key.startsWith(`trial:${near}`))).toBe(false);
  });

  it("the questionnaire's own copies are labelled for Used for", async () => {
    const kit = await fresh();
    const item = await open(kit);
    const saved = await kit.post(`/data/diligence/${item.diligence_id}/questionnaire`, {
      content,
      name: "questionnaire.xlsx",
      answers_content: content,
      answers_name: "answers.xlsx",
    });
    const q = (saved.body.diligence as Diligence).questionnaire;
    const service = kit.core.need<{ usedFor(id: string): { label: string }[] }>("diligence")!;
    expect(service.usedFor(q.file_id!).map((row) => row.label)).toEqual([
      "Questionnaire from Walk Buyer 1",
    ]);
    expect(service.usedFor(q.answers_file_id!).map((row) => row.label)).toEqual([
      "Answers to Walk Buyer 1's questionnaire",
    ]);
  });
});
