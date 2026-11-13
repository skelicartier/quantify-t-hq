// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import { catalogueItem } from "../../scripts/data/dates/catalogue";
import { openBuild, startBuild, waitForBuild } from "@/lib/data/api/builds";
import {
  addDate,
  addSuggestedDate,
  deleteDate,
  doneDate,
  notForUsDate,
  readDates,
  setDateFacts,
  updateDate,
  type DateFields,
} from "@/lib/data/api/dates";
import { readDataOverview } from "@/lib/data/api/overview";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Key dates client against the real stack: every answer passes the portal's
 * schema, a date inside its reminder window passes the overview's Due schema, and the
 * service's refusals reach the portal as its own sentences.
 */

let stack: Stack;
const today = () => localDay(new Date());

const fields = (change: Partial<DateFields> = {}): DateFields => ({
  title: "Invented filing",
  kind: "filing",
  due_on: addDays(today(), 2),
  repeats: "monthly",
  entity: "The Indian company",
  handled_by: "The CA",
  remind_days: 7,
  notes: "",
  file_id: "",
  ...change,
});

beforeAll(async () => {
  stack = await startStack({ env: true });
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and Key dates agree", () => {
  it("on the page, with the suggestions and no dates of their own", async () => {
    const page = await readDates();
    expect(page.view).toBe("upcoming");
    expect(page.dates).toEqual([]);
    expect(page.counts).toEqual({ upcoming: 0, done: 0, all: 0 });
    expect(page.checked_on).toBe("2026-11-10");
    expect(page.files_here).toBe(true);
    const gstr = page.suggestions.find((item) => item.key === "gstr-1")!;
    expect(gstr.next).toBe(catalogueItem("gstr-1")!.next(today(), { agm_on: null }));
  });

  it("on adding, editing, done, not for us and deleting", async () => {
    const added = await addDate(fields(), WALKER, crypto.randomUUID());
    expect(added.date).toMatchObject({ shown_state: "due_this_week", reminding: true });
    const overview = await readDataOverview();
    expect(overview.due).toContainEqual(
      expect.objectContaining({ kind: "key_date", title: "Invented filing" }),
    );
    const edited = await updateDate(
      added.date.date_id,
      fields({ title: "Invented filing, renamed" }),
      WALKER,
    );
    expect(edited.date.title).toBe("Invented filing, renamed");
    const done = await doneDate(added.date.date_id, "Filed.", WALKER);
    expect(done.date.history).toHaveLength(1);
    expect(done.date.state).toBe("coming_up");
    const nope = await notForUsDate(added.date.date_id, "Not registered for GST.", WALKER);
    expect(nope.date.shown_state).toBe("not_for_us");
    const back = await updateDate(added.date.date_id, { state: "coming_up" }, WALKER);
    expect(back.date.state).toBe("coming_up");
    expect((await readDates("all")).counts.all).toBe(1);
    const gone = await deleteDate(added.date.date_id, WALKER);
    expect(gone.deleted).toBe(added.date.date_id);
  });

  it("on a suggestion added and the AGM date", async () => {
    const facts = await setDateFacts("2026-09-30", WALKER);
    expect(facts.facts.agm_on).toBe("2026-09-30");
    const mgt = await addSuggestedDate("mgt-7a", {}, WALKER, crypto.randomUUID());
    expect(mgt.date).toMatchObject({ due_on: "2026-11-29", from_suggestion: "mgt-7a" });
    const domain = await addSuggestedDate(
      "domain",
      { due_on: addDays(today(), 90) },
      WALKER,
      crypto.randomUUID(),
    );
    expect(domain.date.kind).toBe("renewal");
    const page = await readDates();
    expect(page.suggestions.map((item) => item.key)).not.toContain("mgt-7a");
    expect(page.facts.agm_on).toBe("2026-09-30");
  });

  it("keeps the service's sentences in its refusals", async () => {
    await expect(addDate(fields({ title: "" }), WALKER, crypto.randomUUID())).rejects.toMatchObject(
      { status: 400, message: "Say what is due." },
    );
    await expect(
      addSuggestedDate("trademark", {}, WALKER, crypto.randomUUID()),
    ).rejects.toMatchObject({ status: 400, message: "Choose the day it is due." });
    await expect(doneDate("not-a-date", "", WALKER)).rejects.toMatchObject({
      status: 404,
      code: "not_found",
    });
  });

  it("downloads the dates CSV through the builds client", async () => {
    const started = await startBuild({ kind: "dates_csv", by: WALKER });
    const build = await waitForBuild(started.build.build_id, { timeoutMs: 10_000, everyMs: 50 });
    expect(build.state).toBe("ready");
    const file = await openBuild(build.build_id);
    const chunks: Buffer[] = [];
    for await (const chunk of file.body) chunks.push(chunk as Buffer);
    expect(Buffer.concat(chunks).toString("utf8")).toContain("MGT-7A or MGT-7 (annual return)");
  });
});
