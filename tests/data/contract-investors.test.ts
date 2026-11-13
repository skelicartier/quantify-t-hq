// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addWorkingDays, localDay } from "../../scripts/data/days";
import { NEEDS_NEXT_STEP } from "../../scripts/data/investors/book";
import { investorIdOf } from "../../scripts/data/investors/types";
import { noteBackupDownloaded, readBackup } from "@/lib/data/api/backup";
import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import {
  addInvestorNote,
  chooseInvestorLists,
  moveInvestor,
  readInvestor,
  readInvestorSetup,
  readInvestors,
  recordInvestorAmount,
  updateInvestor,
} from "@/lib/data/api/investors";
import { readDataOverview } from "@/lib/data/api/overview";
import { recordReply } from "@/lib/data/api/replies";
import { DataRequestError, dataAsk, ok } from "@/lib/data/socket";
import { Scripted, peopleCsv, readyToSend, sendLive } from "./leads-kit";
import { WALKER, startStack, until, type Stack } from "./helpers";

/**
 * The portal's Investors and Backup clients against the real stack: every answer passes
 * the portal's own schema (so a renamed or dropped field fails here), the overview's
 * Backup block and investor Due rows pass Unit 1's, and refusals keep their sentences.
 */

let stack: Stack;
let listId = "";
const provider = new Scripted();
const today = () => localDay(new Date());
const fund = investorIdOf("peak.example");

beforeAll(async () => {
  stack = await startStack({ env: true, liveProvider: () => provider });
  await readyToSend(stack.engine);
  const walk = stack.engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: peopleCsv([{ email: "asha@peak.example", first: "Asha", company: "Peak Capital" }]),
  }).list.id;
  await sendLive(stack.engine, walk, "Walk live 01");
  listId = stack.engine.importList({
    name: "Walk investors",
    file_name: "walk-investors.csv",
    text: peopleCsv([
      { email: "asha@peak.example", first: "Asha", company: "Peak Capital" },
      { email: "ben@peak.example", first: "Ben", company: "Peak Capital" },
      { email: "cara@nine.example", first: "Cara", company: "Nine Ventures" },
    ]),
  }).list.id;
  await until(async () => {
    const page = await dataAsk(ok.passthrough(), "GET", "/data/leads");
    return (
      (page as { total?: number }).total === 3 && (page as { reading?: boolean }).reading === false
    );
  }, "the lists to be read");
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and Investors agree", () => {
  it("on the setup, the list and one firm", async () => {
    const setup = await readInvestorSetup();
    expect(setup.chosen.list_ids).toEqual([]);
    expect(setup.lists.map((list) => list.name)).toContain("Walk investors");
    const chosen = await chooseInvestorLists([listId], WALKER);
    expect(chosen.firms).toBe(2);
    const page = await readInvestors();
    expect(page.total).toBe(2);
    expect(page.counts.written).toBe(1);
    expect(page.readouts).toMatchObject({ firms: 2, written: 1, replied: 0, meetings: 0 });
    const row = page.investors.find((item) => item.investor_id === fund)!;
    expect(row).toMatchObject({ firm: "Peak Capital", stage: "written", people: 2, amount: null });
    const detail = await readInvestor(fund);
    expect(detail.investor.people).toHaveLength(2);
    expect(detail.sent).toHaveLength(1);
    expect(detail.people.find((person) => person.email === "asha@peak.example")).toMatchObject({
      times_written: 1,
      status: "sent",
    });
    // The waitlist module is loaded; this firm is not on it.
    expect(detail.waitlist_here).toBe(true);
    expect(detail.waitlist).toBeNull();
    const searched = await readInvestors({ q: "nine" });
    expect(searched.investors.map((item) => item.firm)).toEqual(["Nine Ventures"]);
    const tab = await readInvestors({ stage: "not_written" });
    expect(tab.investors.map((item) => item.firm)).toEqual(["Nine Ventures"]);
  });

  it("on a reply, a move, a field, a note and an amount", async () => {
    const reply = await recordReply(
      {
        email: "asha@peak.example",
        outcome: "replied_positive",
        words: "Happy to talk.",
        subject: "Re: A note",
        received_at: new Date().toISOString(),
        add_if_missing: false,
      },
      WALKER,
      crypto.randomUUID(),
    );
    expect(reply.message).toContain("moves to Replied in Investors");
    const replied = await readInvestor(fund);
    expect(replied.investor).toMatchObject({
      stage: "replied",
      next_step: "Book a meeting",
      next_step_on: addWorkingDays(today(), 1),
    });
    expect(replied.replies).toHaveLength(1);
    const moved = await moveInvestor(
      fund,
      { stage: "meeting", next_step: "Hold the first call", next_step_on: today() },
      WALKER,
    );
    expect(moved.investor.stage).toBe("meeting");
    const named = await updateInvestor(fund, "owner", "Walk Owner", WALKER);
    expect(named.investor.owner).toBe("Walk Owner");
    const noted = await addInvestorNote(fund, "Invented note.", WALKER, crypto.randomUUID());
    expect(noted.event.kind).toBe("note");
    const amount = await recordInvestorAmount(
      fund,
      { state: "soft", amount: "50000", currency: "USD", instrument: "SAFE", on: today() },
      WALKER,
      crypto.randomUUID(),
    );
    expect(amount.amount).toMatchObject({ state: "soft", amount: 50000, currency: "USD" });
    const page = await readInvestors();
    expect(page.money).toEqual({ USD: { soft: 50000, signed_and_in: 0 } });
    expect(page.readouts.meetings).toBe(1);
  });

  it("puts a next step due today in the overview's Due, which passes Unit 1's schema", async () => {
    const overview = await readDataOverview();
    expect(overview.due).toContainEqual(
      expect.objectContaining({
        kind: "investor",
        title: "Hold the first call",
        href: `/data/investors/${fund}`,
      }),
    );
    expect(overview.backup).toEqual({ last_at: null, no_backup_disk: expect.anything() });
  });

  it("keeps the service's sentences in its refusals", async () => {
    await expect(
      moveInvestor(fund, { stage: "met", next_step: "", next_step_on: "" }, WALKER),
    ).rejects.toMatchObject({ status: 400, code: "needs_next_step", message: NEEDS_NEXT_STEP });
    await expect(readInvestor("0".repeat(32))).rejects.toBeInstanceOf(DataRequestError);
    await expect(chooseInvestorLists(["not-a-list"], WALKER)).rejects.toMatchObject({
      code: "not_found",
    });
  });

  it("downloads the investors CSV through the builds client", async () => {
    const started = await startBuild({ kind: "investors_csv", by: WALKER });
    const build = await waitForBuild(started.build.build_id, { timeoutMs: 10_000, everyMs: 50 });
    expect(build.state).toBe("ready");
    const file = await openBuild(build.build_id);
    const chunks: Buffer[] = [];
    for await (const chunk of file.body) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    expect(text).toContain("Peak Capital");
    expect(text).not.toContain("@");
  });
});

describe("the portal and Backup agree", () => {
  it("on the state, a backup made, and its download noted", async () => {
    const before = await readBackup();
    expect(before.last).toBeNull();
    const started = await startBuild({ kind: "backup", by: WALKER });
    const build = await waitForBuild(started.build.build_id, { timeoutMs: 20_000, everyMs: 50 });
    expect(build.state).toBe("ready");
    expect(build.name).toBe(`HQ Data backup ${today()}.zip`);
    const noted = await noteBackupDownloaded(build.build_id, WALKER);
    expect(noted.last).toMatchObject({ build_id: build.build_id, by: WALKER });
    const after = await readBackup();
    expect(after.last?.build_id).toBe(build.build_id);
    expect((await readDataOverview()).backup?.last_at).toBe(after.last?.at);
    await expect(noteBackupDownloaded("not-a-build", WALKER)).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });
});
