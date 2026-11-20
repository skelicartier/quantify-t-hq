// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addMonths } from "../../scripts/data/company-contracts";
import { addDays, localDay } from "../../scripts/data/days";
import { reviewByOf, reviewDue } from "../../scripts/data/questionnaires/library";
import type { LibraryAnswer } from "../../scripts/data/questionnaires/types";
import { reviewDueWords, outOfDateWords } from "@/lib/data/labels-questionnaires";
import { WALKER, startStack, type RawAnswer, type Stack } from "./helpers";

/**
 * The answer library (ws-notes/security/spec.md §9.2, §9.4, §5.5) on the real module: adding,
 * approving with its review day, archived answers never matched, evidence from a stand-in
 * source current and not, a source that is absent, a Files file, and search. Every answer is
 * invented.
 */

let stack: Stack;
const today = () => localDay(new Date());
const post = (path: string, body: Record<string, unknown> = {}) =>
  stack.ask("POST", path, { by: WALKER, ...body });
const get = (path: string) => stack.ask("GET", path);
const body = (answer: RawAnswer) => answer.json ?? {};
const message = (answer: RawAnswer) =>
  String(((answer.json?.error ?? {}) as { message?: string }).message ?? "");

async function add(change: Record<string, unknown> = {}): Promise<LibraryAnswer> {
  const made = await post("/data/answers", {
    question: "Is customer data encrypted at rest?",
    answer: "Yes, with keys the company controls.",
    short: "yes",
    topic: "data_protection",
    attempt: crypto.randomUUID(),
    ...change,
  });
  expect(made.status, message(made)).toBe(200);
  return body(made).answer as LibraryAnswer;
}

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "search", "questionnaires"] });
}, 60_000);
afterAll(() => stack.stop());

describe("the review day (§5.5)", () => {
  it("a year after approval, his months when he set them", () => {
    expect(reviewByOf("2027-01-31", null)).toBe("2028-01-31");
    expect(reviewByOf("2027-01-31", 6)).toBe("2027-07-31");
    expect(reviewByOf("2027-08-31", 6)).toBe("2028-02-29");
    const answer = { state: "approved", review_by: "2028-01-31" } as LibraryAnswer;
    expect(reviewDue(answer, "2028-01-30")).toBe(false);
    expect(reviewDue(answer, "2028-02-01")).toBe(true);
    expect(reviewDue({ ...answer, state: "archived" }, "2028-02-01")).toBe(false);
    expect(reviewDueWords("2028-01-31")).toBe("Review due since 31 Jan 2028.");
  });
});

describe("the library", () => {
  it("checks every field as §9.4 says", async () => {
    expect(message(await post("/data/answers", { question: "Hi", answer: "x" }))).toBe(
      "Write the question as you would ask it, in 3 to 500 characters.",
    );
    expect(message(await post("/data/answers", { question: "A question?", answer: "" }))).toBe(
      "Write the answer, in 1 to 4,000 characters.",
    );
    const badCaiq = await post("/data/answers", {
      question: "A question?",
      answer: "An answer.",
      caiq_ids: "A&A-1.1",
    });
    expect(message(badCaiq)).toBe(
      "Type a CAIQ ID as its file writes it, such as A&A-01.1. 20 at most.",
    );
    expect(
      message(
        await post("/data/answers", {
          question: "A question?",
          answer: "An answer.",
          other_ids: Array.from({ length: 11 }, (_, n) => `Q${n}`).join(","),
        }),
      ),
    ).toContain("10 at most.");
    expect(
      message(
        await post("/data/answers", {
          question: "A question?",
          answer: "An answer.",
          evidence: "nowhere:thing:1",
        }),
      ),
    ).toBe("Point at 10 pieces of evidence at most, each a record HQ offers or a file in Files.");
    const made = await add({ caiq_ids: " a&a-01.1, IAM-02 ", other_ids: "SIG 4.2" });
    expect(made).toMatchObject({
      state: "draft",
      caiq_ids: ["A&A-01.1", "IAM-02"],
      other_ids: ["SIG 4.2"],
      approved: null,
      review_by: null,
    });
  });

  it("approves with who and a day not in the future; the review day follows", async () => {
    const made = await add({ question: "Is there a written incident response plan?" });
    const future = await post(`/data/answers/${made.answer_id}/approve`, {
      by_name: "Walk Owner",
      on: addDays(today(), 1),
    });
    expect(message(future)).toBe("That day has not come yet.");
    expect(message(await post(`/data/answers/${made.answer_id}/approve`, {}))).toBe(
      "Say who approved it.",
    );
    const long = addMonths(today(), -13);
    const approved = body(
      await post(`/data/answers/${made.answer_id}/approve`, { by_name: "Walk Owner", on: long }),
    ).answer as LibraryAnswer;
    expect(approved).toMatchObject({
      state: "approved",
      approved: { by_name: "Walk Owner", on: long },
      review_by: addMonths(long, 12),
    });
    const listed = body(await get("/data/answers?state=review_due"));
    expect((listed.answers as { answer_id: string }[]).map((item) => item.answer_id)).toEqual([
      made.answer_id,
    ]);
    expect((listed.counts as { review_due: number }).review_due).toBe(1);
    // His own months for the next approvals.
    await post("/data/answers/setup", { review_months: "6" });
    const next = await add({ question: "Are backups restored to prove they work?" });
    const six = body(
      await post(`/data/answers/${next.answer_id}/approve`, { by_name: "Walk Owner" }),
    ).answer as LibraryAnswer;
    expect(six.review_by).toBe(addMonths(today(), 6));
    await post("/data/answers/setup", { review_months: "" });
  });

  it("an archived answer is never suggested, and restores to its state", async () => {
    const made = await add({
      question: "Do you keep a list of sub-processors?",
      caiq_ids: "STA-01.1",
    });
    await post(`/data/answers/${made.answer_id}/approve`, { by_name: "Walk Owner" });
    const archived = body(await post(`/data/answers/${made.answer_id}/archive`))
      .answer as LibraryAnswer;
    expect(archived.state).toBe("archived");
    expect(
      (body(await get("/data/answers")).answers as { answer_id: string }[]).some(
        (item) => item.answer_id === made.answer_id,
      ),
    ).toBe(false);
    const preview = body(
      await post("/data/questionnaires/preview", {
        content: Buffer.from(
          "Question ID,Question\nSTA-01.1,Do you keep a list of sub-processors?\n",
        ).toString("base64"),
        name: "q.csv",
      }),
    );
    const imported = await post("/data/questionnaires", {
      import_id: preview.import_id,
      map: preview.guess,
      kind: "other",
      title: "Walk Fund 9's review",
      attempt: crypto.randomUUID(),
    });
    const id = String(
      (body(imported).questionnaire as { questionnaire_id: string }).questionnaire_id,
    );
    const read = body(await get(`/data/questionnaires/${id}`));
    expect((read.questions as { suggestions: unknown[] }[])[0]!.suggestions).toEqual([]);
    expect(body(await post(`/data/questionnaires/${id}/accept-by-id`))).toMatchObject({
      accepted: 0,
    });
    const restored = body(await post(`/data/answers/${made.answer_id}/restore`))
      .answer as LibraryAnswer;
    expect(restored.state).toBe("approved");
    const again = body(await get(`/data/questionnaires/${id}`));
    expect((again.questions as { suggestions: { how: string }[] }[])[0]!.suggestions[0]!.how).toBe(
      "id",
    );
    expect(
      message(
        await post(`/data/questionnaires/${id}/questions/2/answer`, {
          answer_id: (await add()).answer_id,
        }),
      ),
    ).toBe("Approve that answer in the library first.");
  });
});

describe("evidence", () => {
  it("from a stand-in source, current and not; an absent source says notLoaded", async () => {
    const options = [
      {
        ref: "findings:pen_test:walk-2025",
        label: "Penetration test by Walk Testers, 2 Oct 2025",
        href: "/data/assurance/findings/walk-2025",
        current: false,
        why: "Older than 12 months.",
      },
      {
        ref: "policies:policy:access_control",
        label: "Access control policy, version 3",
        href: "/data/files/policy",
        current: true,
        why: "",
      },
    ];
    const installed = await post("/data/_test/answers/evidence", {
      name: "findings",
      options: [options[0]],
    });
    expect(body(installed)).toMatchObject({ installed: true, real: false });
    await post("/data/_test/answers/evidence", { name: "policies", options: [options[1]] });
    const list = body(await get("/data/answers"));
    // In the sources' order: policies before findings.
    expect(list.evidence_options).toEqual([options[1], options[0]]);
    expect(list.sources_absent).toEqual([
      "Tools",
      "Devices",
      "Logs and time",
      "Backups",
      "Certification and insurance",
    ]);
    const made = await add({
      question: "Is a penetration test done every year?",
      evidence: "findings:pen_test:walk-2025, policies:policy:access_control, recovery:test:walk-1",
    });
    const read = body(await get(`/data/answers/${made.answer_id}`));
    expect(read.evidence).toEqual([
      { ...options[0] },
      { ...options[1] },
      { ref: "recovery:test:walk-1", missing: "Backups is not loaded here." },
    ]);
    expect(outOfDateWords(options[0]!.label, options[0]!.why)).toBe(
      "Its evidence is out of date: Penetration test by Walk Testers, 2 Oct 2025. Older than 12 months.",
    );
    const row = read.answer as { evidence_lapsed: number; evidence_missing: number };
    expect([row.evidence_lapsed, row.evidence_missing]).toEqual([1, 1]);
    // The stand-in goes when asked, and the option with it.
    expect(
      body(await post("/data/_test/answers/evidence", { name: "findings", on: false })),
    ).toMatchObject({
      installed: false,
      real: false,
    });
    const after = body(await get(`/data/answers/${made.answer_id}`));
    expect((after.evidence as { missing?: string }[])[0]!.missing).toBe(
      "Pen tests and findings is not loaded here.",
    );
  });

  it("a Files file, which says so once it is in the trash", async () => {
    const fake = await post("/data/answers", {
      question: "A question with a file?",
      answer: "An answer.",
      evidence: "file:not-a-file",
    });
    expect(message(fake)).toBe("That file is not in Files, or it is in the trash.");
    // The file a questionnaire was imported from is in Files: point an answer at it.
    const list = body(await get("/data/questionnaires")).questionnaires as {
      questionnaire_id: string;
    }[];
    const one = body(await get(`/data/questionnaires/${list[0]!.questionnaire_id}`));
    const fileId = (one.questionnaire as { source: { file_id: string } }).source.file_id;
    const made = await add({ question: "Is the review form kept?", evidence: `file:${fileId}` });
    const read = body(await get(`/data/answers/${made.answer_id}`));
    expect(read.evidence).toEqual([
      {
        ref: `file:${fileId}`,
        label: "Walk Fund 9's review",
        href: `/data/files/${fileId}`,
        current: true,
        why: "",
      },
    ]);
    const file = body(await get(`/data/files/${fileId}`)).file as { used_for: { label: string }[] };
    expect(file.used_for.map((use) => use.label)).toContain("Evidence for a draft answer");
    await post(`/data/files/${fileId}/trash`);
    const after = body(await get(`/data/answers/${made.answer_id}`));
    expect(after.evidence).toEqual([
      {
        ref: `file:${fileId}`,
        label: "Walk Fund 9's review",
        href: `/data/files/${fileId}`,
        current: false,
        why: "It is in the trash in Files.",
      },
    ]);
  });
});

describe("search", () => {
  it("finds approved and draft answers by question, answer and IDs; never archived ones", async () => {
    const found = body(await get("/data/search?q=encrypted"));
    const group = (
      found.groups as {
        kind: string;
        label: string;
        hits: { title: string; subtitle: string; href: string }[];
      }[]
    ).find((item) => item.kind === "answer");
    expect(group?.label).toBe("Answers");
    expect(group?.hits[0]).toMatchObject({
      title: "Is customer data encrypted at rest?",
      subtitle: "Data protection · draft",
    });
    expect(group?.hits[0]?.href).toMatch(/^\/data\/waitlist\/diligence\/answers\//);
    const byId = body(await get("/data/search?q=IAM-02"));
    expect((byId.groups as { kind: string }[]).some((item) => item.kind === "answer")).toBe(true);
    const gone = await add({ question: "Is the walkway lit at night?" });
    await post(`/data/answers/${gone.answer_id}/archive`);
    const archived = body(await get("/data/search?q=walkway"));
    expect((archived.groups as { kind: string }[]).some((item) => item.kind === "answer")).toBe(
      false,
    );
  });
});
