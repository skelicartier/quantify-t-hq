// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import { readDataOverview } from "@/lib/data/api/overview";
import {
  addFollowUp,
  doneFollowUp,
  moveFollowUp,
  readFollowUps,
  readReplies,
  readTakeBackPreview,
  recordReply,
  takeBackReply,
} from "@/lib/data/api/replies";
import { dataAsk, ok } from "@/lib/data/socket";
import { peopleCsv } from "./leads-kit";
import { WALKER, startStack, until, type Stack } from "./helpers";

/**
 * The portal's Replies client against the real stack: each answer passes the portal's own
 * schema, the overview's reply blocks pass Unit 1's, and refusals keep their sentences.
 */

let stack: Stack;
const today = () => localDay(new Date());

beforeAll(async () => {
  // The interim state between Units 3 and 4 (no waitlist yet): the waitlist module is left out.
  stack = await startStack({ env: true, modules: ["files", "leads", "replies"] });
  stack.engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: peopleCsv([
      { email: "asha@peak.example", first: "Asha", company: "Peak Capital" },
      { email: "ben@nine.example", first: "Ben", company: "Nine Ventures" },
    ]),
  });
  await until(async () => {
    const page = await dataAsk(ok.passthrough(), "GET", "/data/leads");
    return (
      (page as { total?: number }).total === 2 && (page as { reading?: boolean }).reading === false
    );
  }, "the list to be read");
}, 60_000);
afterAll(() => stack.stop());

const base = {
  words: "Invented words.",
  subject: "Re: A note",
  received_at: new Date().toISOString(),
  add_if_missing: false,
};

describe("the portal and Replies agree", () => {
  it("on recording, listing, and taking a reply back", async () => {
    const no = await recordReply(
      { ...base, email: "asha@peak.example", outcome: "not_interested" },
      WALKER,
      crypto.randomUUID(),
    );
    expect(no.message).toMatch(/said no/);
    expect(no.reply.effects).toEqual([{ kind: "stop_added", email: "asha@peak.example" }]);
    const later = await recordReply(
      { ...base, email: "ben@nine.example", outcome: "not_now", later_until: addDays(today(), 7) },
      WALKER,
      crypto.randomUUID(),
    );
    expect(later.reply.later_until).toBe(addDays(today(), 7));
    await expect(
      recordReply(
        { ...base, email: "ben@nine.example", outcome: "replied_positive" },
        WALKER,
        crypto.randomUUID(),
      ),
    ).rejects.toMatchObject({
      status: 409,
      code: "waitlist_missing",
      message: "The waitlist is not set up here yet.",
    });
    const page = await readReplies();
    expect(page.total).toBe(2);
    expect(page.counts).toMatchObject({ all: 2, not_interested: 1, not_now: 1 });
    expect((await readReplies({ outcome: "not_now", q: "ben" })).replies).toHaveLength(1);
    const plan = await readTakeBackPreview(no.reply.reply_id);
    expect(plan.undo).toEqual([{ kind: "stop_added", email: "asha@peak.example" }]);
    const taken = await takeBackReply(no.reply.reply_id, WALKER);
    expect(taken.message).toBe("Taken back: asha@peak.example is off the stop list again.");
    expect((await readReplies()).live.all).toBe(1);
  });

  it("on follow-ups: listed, added, moved and done", async () => {
    const open = await readFollowUps();
    expect(open.follow_ups.map((item) => item.title)).toEqual(["Write to Ben Rao again"]);
    expect(open.follow_ups[0]!.firm).toBe("Nine Ventures");
    const { follow_up } = await addFollowUp(
      { email: "asha@peak.example", title: "Send the deck", due_on: today() },
      WALKER,
      crypto.randomUUID(),
    );
    expect(follow_up.kind).toBe("other");
    expect(
      (await moveFollowUp(follow_up.follow_up_id, addDays(today(), 2), WALKER)).follow_up.due_on,
    ).toBe(addDays(today(), 2));
    expect((await doneFollowUp(follow_up.follow_up_id, "Sent.", WALKER)).follow_up.state).toBe(
      "done",
    );
    expect((await readFollowUps({ state: "all" })).total).toBe(2);
  });

  it("on the overview's blocks and the download", async () => {
    await recordReply(
      { ...base, email: "asha@peak.example", outcome: "question" },
      WALKER,
      crypto.randomUUID(),
    );
    const overview = await readDataOverview();
    expect(overview.replies).toMatchObject({ today: 2, yes_today: 0, yes_total: 0 });
    expect(overview.replies!.latest[0]).toMatchObject({
      email: "asha@peak.example",
      outcome: "question",
    });
    expect(overview.follow_ups).toEqual({ due: 1, overdue: 0 });
    expect(overview.due.map((item) => item.kind)).toEqual(["follow_up"]);
    const started = await startBuild({ kind: "replies_csv", by: WALKER });
    expect(
      (await waitForBuild(started.build.build_id, { timeoutMs: 10_000, everyMs: 50 })).state,
    ).toBe("ready");
    const opened = await openBuild(started.build.build_id);
    const chunks: Buffer[] = [];
    for await (const chunk of opened.body) chunks.push(chunk as Buffer);
    const text = Buffer.concat(chunks).toString("utf8");
    expect(text.split("\r\n")[0]).toBe(
      "\ufeffreceived_at,email,name,firm,outcome,words,subject,mailing,later_until,referral_name,referral_email,recorded_at,recorded_by,taken_back",
    );
    expect(text.trim().split("\r\n")).toHaveLength(1 + 3);
  });
});
