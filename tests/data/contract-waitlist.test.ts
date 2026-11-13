// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { oldWaitlistText } from "../../scripts/data/waitlist/walk-seed";
import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import { readDataOverview } from "@/lib/data/api/overview";
import { recordReply } from "@/lib/data/api/replies";
import {
  addColleague,
  addEntryNote,
  addFirm,
  attachProof,
  holdBack,
  importOldWaitlist,
  moveStage,
  readEntry,
  readForInvestors,
  readHoldPreview,
  readWaitlist,
  releaseHold,
  setColleagueRole,
  updateEntry,
} from "@/lib/data/api/waitlist";
import { DataRequestError, dataAsk, ok } from "@/lib/data/socket";
import { peopleCsv } from "./leads-kit";
import { WALKER, startStack, until, type Stack } from "./helpers";

/**
 * The portal's waitlist client against the real stack (server, host, worker, every module):
 * each answer passes the portal's own schema, and refusals keep their sentences.
 */

let stack: Stack;
const today = () => localDay(new Date());

beforeAll(async () => {
  stack = await startStack({ env: true });
  stack.engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: peopleCsv([
      { email: "asha@peak.example", first: "Asha", company: "Peak Capital" },
      { email: "dev@peak.example", first: "Dev", title: "Analyst", company: "Peak Capital" },
      { email: "isha@peak.example", first: "Isha", title: "Associate", company: "Peak Capital" },
    ]),
  });
  await until(async () => {
    const page = await dataAsk(ok.passthrough(), "GET", "/data/leads");
    return (
      (page as { total?: number }).total === 3 && (page as { reading?: boolean }).reading === false
    );
  }, "the list to be read");
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and the waitlist agree", () => {
  it("on a yes, the firm, its stages, people, proof, holds and the investor view", async () => {
    const recorded = await recordReply(
      {
        email: "asha@peak.example",
        outcome: "replied_positive",
        words: "Yes, add us.",
        subject: "Re: A note",
        received_at: new Date(Date.now() - 60_000).toISOString(),
        add_if_missing: false,
      },
      WALKER,
      crypto.randomUUID(),
    );
    expect(recorded.message).toContain("Peak Capital is on the waitlist.");
    const page = await readWaitlist();
    expect(page.total).toBe(1);
    const entryId = page.entries[0]!.entry_id;
    expect(recorded.href).toBe(`/data/waitlist/${entryId}`);

    const detail = await readEntry(entryId);
    expect(detail.entry).toMatchObject({ stage: "joined", firm: "Peak Capital" });
    expect(detail.people.map((person) => person.email).sort()).toEqual([
      "asha@peak.example",
      "dev@peak.example",
      "isha@peak.example",
    ]);
    expect(detail.files).toBe(true);

    const preview = await readHoldPreview(entryId);
    expect(preview.candidates.map((item) => item.email)).toEqual([
      "dev@peak.example",
      "isha@peak.example",
    ]);
    const held = await holdBack(entryId, ["dev@peak.example"], WALKER);
    expect(held.added).toEqual(["dev@peak.example"]);
    const released = await releaseHold(held.hold!.hold_id, null, WALKER);
    expect(released).toMatchObject({ released: ["dev@peak.example"], kept: [] });

    const moved = await moveStage(
      entryId,
      {
        stage: "call_booked",
        from: "joined",
        next_step: "Hold the call",
        next_step_on: addDays(today(), 2),
        call_at: new Date(Date.now() + 86_400_000).toISOString(),
      },
      WALKER,
    );
    expect(moved.entry.stage).toBe("call_booked");
    await expect(moveStage(entryId, { stage: "pilot" }, WALKER)).rejects.toMatchObject({
      status: 400,
      code: "needs_next_step",
      message: "Moving to Pilot needs a next step and the day it is due by.",
    });
    await updateEntry(entryId, "owner", "Walk Owner", WALKER);
    await addEntryNote(
      entryId,
      { text: "Asked for the deck.", kind: "note" },
      WALKER,
      crypto.randomUUID(),
    );
    await addEntryNote(
      entryId,
      { text: "Twenty minutes, keen.", kind: "call", at: new Date().toISOString() },
      WALKER,
      crypto.randomUUID(),
    );
    const colleague = await addColleague(
      entryId,
      {
        email: "cfo@peak.example",
        name: "Meera Iyer",
        title: "Chief financial officer",
        role: "decision_maker",
      },
      WALKER,
    );
    expect(colleague.lead.badges).toContain("Copied on a yes");
    await setColleagueRole(entryId, "dev@peak.example", "champion", WALKER);
    const proof = await attachProof(
      entryId,
      { name: "reply.txt", content: Buffer.from("An invented saved reply.").toString("base64") },
      WALKER,
      crypto.randomUUID(),
    );
    expect(proof.file.folder_path).toBe("11 Leads, lists and outreach › Waitlist proof");
    const after = await readEntry(entryId);
    expect(after.proof_file?.file_id).toBe(proof.file.file_id);
    expect(after.events.map((event) => event.kind)).toEqual(
      expect.arrayContaining([
        "stage",
        "note",
        "call",
        "person",
        "hold",
        "release",
        "proof",
        "edit",
      ]),
    );

    const investors = await readForInvestors();
    expect(investors.rows).toHaveLength(1);
    expect(JSON.stringify(investors)).not.toContain("@");
    const overview = await readDataOverview();
    expect(overview.waitlist?.find((item) => item.stage === "call_booked")?.count).toBe(1);
  });

  it("on adding a firm by hand, the old file, and the downloads", async () => {
    const added = await addFirm(
      {
        email: "gp@other.example",
        firm: "Other Fund",
        joined_on: today(),
        how_joined: "Said yes on a call",
        quote: "Count us in.",
      },
      WALKER,
      crypto.randomUUID(),
    );
    expect(added.entry).toMatchObject({ firm: "Other Fund", stage: "joined" });
    await expect(
      addFirm(
        { email: "gp@other.example", firm: "", joined_on: "", how_joined: "", quote: "" },
        WALKER,
        crypto.randomUUID(),
      ),
    ).rejects.toBeInstanceOf(DataRequestError);
    const imported = await importOldWaitlist(
      { text: oldWaitlistText(2), file_name: "waitlist.csv" },
      WALKER,
      crypto.randomUUID(),
    );
    expect(imported).toMatchObject({ added: 2, already: 0 });
    for (const kind of ["waitlist_csv", "investor_csv"]) {
      const started = await startBuild({ kind, by: WALKER });
      const build = await waitForBuild(started.build.build_id, { timeoutMs: 10_000, everyMs: 50 });
      expect(build.state).toBe("ready");
      const file = await openBuild(build.build_id);
      const chunks: Buffer[] = [];
      for await (const chunk of file.body) chunks.push(chunk as Buffer);
      const text = Buffer.concat(chunks).toString("utf8");
      if (kind === "investor_csv") expect(text).not.toContain("@");
      else expect(text).toContain("gp@other.example");
    }
  });

  it("on refusals: an unknown firm is not found", async () => {
    await expect(readEntry("0a17e000-0000-4000-8000-00000000ffff")).rejects.toMatchObject({
      status: 404,
      code: "not_found",
      message: "That firm is not on the waitlist.",
    });
  });
});
