// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { contractDutiesOf, inForceOf } from "../../scripts/data/profiles/book";
import type { Profile } from "../../scripts/data/profiles/types";
import { FLOWDOWNS, fixByOf, FIX_WINDOWS_DEFAULT } from "../../scripts/data/security-contracts";
import { WALKER, startStack, type RawAnswer, type Stack } from "./helpers";

/**
 * Regulatory profiles (ws-notes/security/spec.md §9.2, §9.5, §5.5) on the real module: one per
 * firm; ticking a regime adds its duties unchecked; duty states; `inForce` by `applies_from` and
 * by state; withdrawn duties drop out; DORA's 30(3) duties for a critical function only; the
 * Summary's lines, `sbom` among them; "Used for" of a duty's copy; the CSV. Every firm is
 * invented.
 */

let stack: Stack;
let entryId = "";
let otherId = "";
const today = () => localDay(new Date());
const post = (path: string, body: Record<string, unknown> = {}) =>
  stack.ask("POST", path, { by: WALKER, ...body });
const get = (path: string) => stack.ask("GET", path);
const body = (answer: RawAnswer) => answer.json ?? {};
const message = (answer: RawAnswer) =>
  String(((answer.json?.error ?? {}) as { message?: string }).message ?? "");

type Detail = Omit<Profile, "duties"> & {
  duties: (Profile["duties"][number] & { shown: string; ref: string; critical_only: boolean })[];
  effects: string[];
  applies_words: string;
  rules: string;
};
const profileOf = (answer: RawAnswer) => body(answer).profile as Detail;

async function firm(email: string, name: string): Promise<string> {
  const added = await post("/data/waitlist", { email, firm: name });
  expect(added.status).toBe(200);
  return String((body(added).entry as { entry_id: string }).entry_id);
}

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "leads", "replies", "waitlist", "profiles"] });
  entryId = await firm("asha@walkcapital.example", "Walk Capital");
  otherId = await firm("ravi@walkfund9.example", "Walk Fund 9");
}, 60_000);
afterAll(() => stack.stop());

describe("profiles in force (§5.5), pure", () => {
  const profile = (applies: string | null, state: "" | "in_contract" | "not_in_contract") =>
    ({
      profile_id: "p",
      entry_id: "e",
      firm: "Walk Capital",
      regimes: { sebi: { category: "mid" }, dora: null, uk: null, other: "" },
      applies_from: applies,
      duties: [
        {
          duty_id: "d",
          key: "cscrf-patch",
          words: "",
          state,
          agreement_id: null,
          file_id: null,
          note: "",
          withdrawn: null,
        },
      ],
      notes: "",
    }) as unknown as Profile;

  it("on or before today is in force; later is not yet; none is never", () => {
    expect(inForceOf([profile("2026-11-20", "in_contract")], "2026-11-20")).toHaveLength(1);
    expect(inForceOf([profile("2026-12-01", "in_contract")], "2026-11-20")).toHaveLength(0);
    expect(inForceOf([profile(null, "in_contract")], "2026-11-20")).toHaveLength(0);
    expect(inForceOf([profile("2026-11-20", "not_in_contract")], "2026-11-20")).toHaveLength(0);
    expect(inForceOf([profile("2026-11-20", "")], "2026-11-20")).toHaveLength(0);
  });

  it("a duty with no effect is in the contract, though not in force for a day", () => {
    const base = profile("2026-11-20", "in_contract");
    const empanelled = {
      ...base,
      duties: base.duties.map((duty) => ({ ...duty, key: "cscrf-empanelled" as const })),
    } as Profile;
    expect(inForceOf([empanelled], "2026-11-20")).toEqual([]);
    expect(contractDutiesOf([empanelled, base], "2026-11-20")).toEqual([
      { entry_id: "e", firm: "Walk Capital", key: "cscrf-empanelled" },
      { entry_id: "e", firm: "Walk Capital", key: "cscrf-patch" },
    ]);
    expect(contractDutiesOf([profile("2026-12-01", "in_contract")], "2026-11-20")).toEqual([]);
    expect(contractDutiesOf([profile("2026-11-20", "not_in_contract")], "2026-11-20")).toEqual([]);
  });

  it("an in-force cscrf-patch shortens a dependency alert's fix-by day (§5.1)", () => {
    const inForce = inForceOf([profile("2026-11-20", "in_contract")], "2026-11-20");
    expect(inForce[0]).toMatchObject({ entry_id: "e", firm: "Walk Capital", key: "cscrf-patch" });
    expect(
      fixByOf({
        found_on: "2026-11-20",
        severity: "high",
        source: "dependabot",
        windows: FIX_WINDOWS_DEFAULT,
        in_force: inForce,
      }),
    ).toEqual({
      fix_by: "2026-11-27",
      because: { entry_id: "e", firm: "Walk Capital", key: "cscrf-patch" },
    });
  });
});

describe("a firm's profile", () => {
  let profileId = "";

  it("is one per firm, and starts empty", async () => {
    const empty = body(await get(`/data/profiles/for-entry/${entryId}`));
    expect(empty.profile).toBeNull();
    expect(empty.entry).toMatchObject({ entry_id: entryId, firm: "Walk Capital" });
    expect((empty.flowdowns as unknown[]).length).toBe(FLOWDOWNS.length);
    const started = await post("/data/profiles", {
      entry_id: entryId,
      attempt: crypto.randomUUID(),
    });
    profileId = profileOf(started).profile_id;
    expect(profileOf(started)).toMatchObject({
      firm: "Walk Capital",
      duties: [],
      applies_words: "Not applied yet: give the day the contract starts.",
      effects: [],
      rules: "No rules recorded",
    });
    const again = await post("/data/profiles", { entry_id: entryId });
    expect([again.status, message(again)]).toEqual([409, "Walk Capital already has a profile."]);
    expect(message(await post("/data/profiles", { entry_id: "not-here" }))).toBe(
      "That firm is not on the waitlist.",
    );
  });

  it("ticking a regime adds its duties, unchecked, once each", async () => {
    const sebi = profileOf(
      await post(`/data/profiles/${profileId}/update`, { sebi: "on", sebi_category: "mid" }),
    );
    expect(sebi.rules).toBe("SEBI CSCRF (mid-size)");
    expect(sebi.duties.map((duty) => duty.key)).toEqual([
      "cscrf-sbom",
      "cscrf-vapt",
      "cscrf-patch",
      "cscrf-empanelled",
      "cscrf-back-to-back",
      "cscrf-iso",
    ]);
    expect(sebi.duties.every((duty) => duty.state === "")).toBe(true);
    const both = profileOf(
      await post(`/data/profiles/${profileId}/update`, {
        sebi: "on",
        sebi_category: "mid",
        dora: "on",
        dora_critical: "no",
      }),
    );
    expect(both.duties).toHaveLength(6 + 9);
    const reporting = both.duties.find((duty) => duty.key === "dora-reporting")!;
    expect(reporting).toMatchObject({ ref: "DORA Article 30(3)(b)", critical_only: true });
    expect(both.duties.find((duty) => duty.key === "dora-incident-help")?.critical_only).toBe(
      false,
    );
    const critical = profileOf(
      await post(`/data/profiles/${profileId}/update`, {
        sebi: "on",
        sebi_category: "mid",
        dora: "on",
        dora_critical: "yes",
      }),
    );
    expect(critical.duties).toHaveLength(15);
    expect(critical.duties.find((duty) => duty.key === "dora-reporting")?.critical_only).toBe(
      false,
    );
    expect(
      message(
        await post(`/data/profiles/${profileId}/update`, { sebi: "on", sebi_category: "huge" }),
      ),
    ).toBe("Choose the SEBI CSCRF category, or leave it blank.");
  });

  it("duty states, withdrawn duties, his own words, and what changes in HQ", async () => {
    const profile = profileOf(await get(`/data/profiles/for-entry/${entryId}`));
    const duty = (key: string) => profile.duties.find((item) => item.key === key)!;
    const marked = profileOf(
      await post(`/data/profiles/${profileId}/duties/${duty("cscrf-patch").duty_id}`, {
        state: "in_contract",
        note: "Clause 14.2",
        content: Buffer.from("An invented contract, clause 14.2.").toString("base64"),
        name: "walk-capital-msa.txt",
      }),
    );
    expect(marked.effects).toEqual(["High-severity missing patches are fixed within 1 week."]);
    const fileId = marked.duties.find((item) => item.key === "cscrf-patch")!.file_id!;
    const file = body(await get(`/data/files/${fileId}`)).file as {
      folder_path: string;
      used_for: { label: string }[];
    };
    expect(file.used_for.map((use) => use.label)).toEqual([
      "Walk Capital's contract: high-severity missing patches fixed within 1 week",
    ]);
    // Not in force until it applies.
    const lookup = async () => body(await get(`/data/_test/profiles/lookup?entry_id=${entryId}`));
    expect((await lookup()).in_force).toEqual([]);
    await post(`/data/profiles/${profileId}/update`, {
      sebi: "on",
      sebi_category: "mid",
      dora: "on",
      dora_critical: "yes",
      applies_from: addDays(today(), 1),
    });
    expect((await lookup()).in_force).toEqual([]);
    const applied = profileOf(
      await post(`/data/profiles/${profileId}/update`, {
        sebi: "on",
        sebi_category: "mid",
        dora: "on",
        dora_critical: "yes",
        applies_from: today(),
      }),
    );
    expect(applied.duties).toHaveLength(15);
    expect((await lookup()).in_force).toEqual([
      {
        entry_id: entryId,
        firm: "Walk Capital",
        key: "cscrf-patch",
        effect: {
          sources: ["dependabot"],
          severities: ["critical", "high"],
          days: 7,
          months: null,
        },
      },
    ]);
    // A duty marked not in the contract, or withdrawn, is out.
    await post(`/data/profiles/${profileId}/duties/${duty("cscrf-vapt").duty_id}`, {
      state: "in_contract",
    });
    expect(((await lookup()).in_force as { key: string }[]).map((item) => item.key)).toEqual([
      "cscrf-vapt",
      "cscrf-patch",
    ]);
    await post(`/data/profiles/${profileId}/duties/${duty("cscrf-vapt").duty_id}/withdraw`, {
      why: "Not in their contract after all.",
    });
    expect(((await lookup()).in_force as { key: string }[]).map((item) => item.key)).toEqual([
      "cscrf-patch",
    ]);
    const changed = await post(`/data/profiles/${profileId}/duties/${duty("cscrf-vapt").duty_id}`, {
      state: "in_contract",
    });
    expect(message(changed)).toBe("Add the duty again before changing it.");
    const back = profileOf(await post(`/data/profiles/${profileId}/duties`, { key: "cscrf-vapt" }));
    expect(back.duties.find((item) => item.key === "cscrf-vapt")).toMatchObject({
      withdrawn: null,
      state: "",
    });
    const own = profileOf(
      await post(`/data/profiles/${profileId}/duties`, {
        words: "Data kept in India only",
        attempt: crypto.randomUUID(),
      }),
    );
    expect(own.duties.at(-1)).toMatchObject({
      key: null,
      words: "Data kept in India only",
      shown: "Data kept in India only",
    });
    expect(message(await post(`/data/profiles/${profileId}/duties`, { words: "No" }))).toBe(
      "Write the duty in 3 to 300 characters.",
    );
    expect(
      message(
        await post(`/data/profiles/${profileId}/duties/${duty("cscrf-iso").duty_id}`, {
          state: "in_contract",
          agreement_id: "walk-agreement",
        }),
      ),
    ).toBe("The agreements register is not loaded here.");
    expect((await lookup()).for_entry).toMatchObject({
      entry_id: entryId,
      firm: "Walk Capital",
      regimes: ["sebi", "dora"],
      in_contract: 1,
      href: `/data/waitlist/${entryId}/profile`,
    });
  });

  it("the Summary's lines: profiles, and a software bill of materials once it is in a contract in force", async () => {
    const lines = async () =>
      body(await get("/data/_test/profiles/lookup")).summary as {
        key: string;
        words: string;
        attention: boolean;
        area: string;
      }[];
    const before = await lines();
    expect(before.map((line) => line.key)).toEqual(["profiles"]);
    expect(before[0]).toMatchObject({
      area: "buyers",
      words: "1 customer with a regulatory profile; 1 duty in contracts; 15 not checked yet.",
      attention: true,
    });
    const profile = profileOf(await get(`/data/profiles/for-entry/${entryId}`));
    const sbom = profile.duties.find((item) => item.key === "cscrf-sbom")!;
    await post(`/data/profiles/${profileId}/duties/${sbom.duty_id}`, { state: "in_contract" });
    const after = await lines();
    expect(after.find((line) => line.key === "sbom")).toMatchObject({
      words:
        "A software bill of materials is in Walk Capital's contract. HQ keeps none yet: it comes with the release records.",
      attention: true,
    });
    // Another firm's profile counts too; the list is sorted by firm.
    await post("/data/profiles", { entry_id: otherId });
    const list = body(await get("/data/profiles"));
    expect(list.counts).toEqual({ profiles: 2, in_contract: 2, unchecked: 14 });
    expect(
      (list.profiles as { firm: string; rules: string }[]).map(
        (row) => `${row.firm}: ${row.rules}`,
      ),
    ).toEqual(["Walk Capital: SEBI CSCRF (mid-size) · EU DORA", "Walk Fund 9: No rules recorded"]);
  });

  it("the Customer duties CSV, as a build", async () => {
    const started = await post("/data/builds", { kind: "profiles_csv" });
    const buildId = String((body(started).build as { build_id: string }).build_id);
    let state = "building";
    for (let tries = 0; tries < 100 && state === "building"; tries += 1) {
      state = String((body(await get(`/data/builds/${buildId}`)).build as { state: string }).state);
      if (state === "building") await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(state).toBe("ready");
    const bytes = await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`);
    const text = bytes.bytes.toString("utf8");
    expect(text.startsWith("﻿Firm,Rules,Duty,From,In the contract,Agreement\r\n")).toBe(true);
    expect(text).toContain(
      "Walk Capital,SEBI CSCRF (mid-size) · EU DORA,High-severity missing patches fixed within 1 week,SEBI CSCRF,In the contract,",
    );
    expect(text).toContain(
      "Walk Capital,SEBI CSCRF (mid-size) · EU DORA,Data kept in India only,His own words,Not checked,",
    );
  });
});
