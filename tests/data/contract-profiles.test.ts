// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localDay } from "../../scripts/data/days";
import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import {
  addDuty,
  readEntryProfile,
  readProfiles,
  saveDuty,
  startProfile,
  updateProfile,
  withdrawDuty,
} from "@/lib/data/api/profiles";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's profiles client (ws-notes/security/spec.md §9.5) against the real stack with
 * Files, the waitlist and the agreements register: every answer passes the portal's own
 * schema, a duty takes one of the firm's agreements, and the CSV comes back as a build.
 */

let stack: Stack;
let entryId = "";
const today = () => localDay(new Date());

beforeAll(async () => {
  stack = await startStack({
    env: true,
    modules: ["files", "leads", "replies", "waitlist", "agreements", "profiles"],
  });
  const added = await stack.ask("POST", "/data/waitlist", {
    email: "asha@walkcapital.example",
    firm: "Walk Capital",
    by: WALKER,
  });
  entryId = String((added.json?.entry as { entry_id: string }).entry_id);
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and the profiles module agree", () => {
  it("from an empty firm to duties in the contract", async () => {
    const empty = await readEntryProfile(entryId);
    expect(empty.profile).toBeNull();
    expect(empty.agreements).toEqual([]);
    expect(empty.flowdowns).toHaveLength(18);
    const started = await startProfile(entryId, WALKER, crypto.randomUUID());
    const profileId = started.profile.profile_id;
    const updated = await updateProfile(
      profileId,
      {
        sebi: true,
        sebi_category: "mid",
        dora: false,
        dora_critical: "",
        uk: true,
        uk_note: "FCA-regulated",
        other: "",
        applies_from: today(),
        notes: "",
      },
      WALKER,
    );
    expect(updated.profile.rules).toBe("SEBI CSCRF (mid-size) · UK financial regulation");
    expect(updated.profile.duties).toHaveLength(9);
    const patch = updated.profile.duties.find((duty) => duty.key === "cscrf-patch")!;
    const marked = await saveDuty(
      profileId,
      patch.duty_id,
      { state: "in_contract", agreement_id: "", note: "Clause 14.2", file: null },
      WALKER,
    );
    expect(marked.profile.effects).toEqual([
      "High-severity missing patches are fixed within 1 week.",
    ]);
    const own = await addDuty(
      profileId,
      { words: "Data kept in India only" },
      WALKER,
      crypto.randomUUID(),
    );
    const mine = own.profile.duties.at(-1)!;
    const gone = await withdrawDuty(profileId, mine.duty_id, "Not theirs.", WALKER);
    expect(gone.profile.duties.at(-1)?.withdrawn?.why).toBe("Not theirs.");
    await expect(
      saveDuty(
        profileId,
        patch.duty_id,
        { state: "in_contract", agreement_id: "nope", note: "", file: null },
        WALKER,
      ),
    ).rejects.toThrow("That agreement is not one of Walk Capital's.");
    const list = await readProfiles();
    expect(list.counts).toEqual({ profiles: 1, in_contract: 1, unchecked: 8 });
    expect(list.profiles[0]).toMatchObject({ firm: "Walk Capital", in_force: true });
    const read = await readEntryProfile(entryId);
    expect(read.profile?.line).toMatchObject({
      regimes: ["sebi", "uk"],
      in_contract: 1,
      unchecked: 8,
    });
    const started2 = await startBuild({ kind: "profiles_csv", by: WALKER });
    const build = await waitForBuild(started2.build.build_id, { timeoutMs: 10_000, everyMs: 20 });
    expect(build.state).toBe("ready");
    const file = await openBuild(build.build_id);
    const chunks: Buffer[] = [];
    for await (const chunk of file.body) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString("utf8")).toContain(
      "Walk Capital,SEBI CSCRF (mid-size) · UK financial regulation,High-severity missing patches fixed within 1 week,SEBI CSCRF,In the contract,",
    );
  });
});
