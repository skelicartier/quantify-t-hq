// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { policyStateOf } from "../../scripts/data/policies/state";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The policy register (ws-notes/security/spec.md §5.4, §8): §5.4's states with review dates
 * set through the files routes (current, review soon at 30 days inclusive, lapsed, none), no
 * document, a trashed one, not needed and back, his own policies, `fileFor` after a new
 * version, `usedFor`, the Summary's line and the evidence. HQ writes no policy and adds no
 * Due row of its own. Every document is invented.
 */

type Body = Record<string, unknown>;

describe("a policy's state (pure), on 20 Nov 2026", () => {
  const facts = (review_by: string | null, trashed = false) => ({
    files_here: true,
    file: { trashed, review_by },
  });
  const linked = { file_id: "walk-file", not_needed: null };
  const at = (review_by: string | null) => policyStateOf(linked, facts(review_by), "2026-11-20");

  it("§5.4's rows", () => {
    expect(at("2026-12-21")).toEqual({
      state: "current",
      words: "Current; next review 21 Dec 2026.",
      next_review: "2026-12-21",
    });
    expect(at("2026-12-20")).toMatchObject({
      state: "review_soon",
      words: "Review due 20 Dec 2026.",
    });
    expect(at("2026-12-01")).toMatchObject({
      state: "review_soon",
      words: "Review due 1 Dec 2026.",
    });
    expect(at("2026-11-19")).toMatchObject({
      state: "lapsed",
      words: "Review lapsed on 19 Nov 2026.",
    });
    expect(at(null)).toMatchObject({
      state: "no_review",
      words: "No review date. Set one on the document in Files.",
    });
  });

  it("no document, the trash, not needed, Files not here", () => {
    expect(policyStateOf(null, facts(null), "2026-11-20")).toMatchObject({
      state: "no_document",
      words: "No document linked.",
    });
    expect(policyStateOf(linked, facts("2027-01-01", true), "2026-11-20")).toMatchObject({
      state: "trashed",
      words: "The linked document is in the trash.",
    });
    expect(
      policyStateOf(
        { file_id: null, not_needed: { why: "We hold no card data at all" } },
        facts(null),
        "2026-11-20",
      ),
    ).toMatchObject({ state: "not_needed", words: "Not needed: We hold no card data at all." });
    expect(policyStateOf(linked, { files_here: false, file: null }, "2026-11-20")).toMatchObject({
      state: "unknown",
      words: "Files is not loaded here.",
    });
  });
});

describe("the register through the service", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "policies"] });
  }, 60_000);
  afterAll(() => stack.stop());

  const post = (path: string, body: Body = {}) => stack.ask("POST", path, { by: WALKER, ...body });
  const message = (answer: { json?: Body | null }) =>
    ((answer.json?.error ?? {}) as { message?: string }).message ?? "";
  const page = async () => (await stack.ask("GET", "/data/policies")).json!;
  const policy = async (key: string) =>
    ((await page()).policies as Body[]).find((item) => item.key === key)!;
  const lookup = async (query = "") =>
    (await stack.ask("GET", `/data/_test/policies/lookup${query}`)).json!;
  const put = async (title: string, text = title) => {
    const answer = await post("/data/_test/files/put", {
      folder_path: ["Security", "Policies"],
      title,
      name: `${title}.txt`,
      base64: Buffer.from(`${text}\n`).toString("base64"),
    });
    return (answer.json!.file as { file_id: string }).file_id;
  };
  const reviewBy = (fileId: string, day: string | null) =>
    post(`/data/files/${fileId}/update`, { review_by: day ?? "" });

  const ids: Record<string, string> = {};

  it("lists the eleven, each with no document, its controls and its trust-pack line", async () => {
    await post("/data/_test/policies/today", { day: "2026-11-20" });
    const empty = await page();
    expect(empty.counts).toEqual({ expected: 11, linked: 0, current: 0, lapsed: 0, own: 0 });
    const rows = empty.policies as Body[];
    expect(rows).toHaveLength(11);
    expect(rows[0]).toMatchObject({
      key: "security",
      title: "Information security policy",
      controls: ["a5_1"],
      state: "no_document",
      words: "No document linked.",
      trust_words: "In a trust pack as ‘Information security policy’.",
      file: null,
      href: "/data/assurance/policies#policy-security",
    });
    expect(rows.find((row) => row.key === "backup")!.trust_words).toBe("");
    expect(((await lookup()).summary as Body[])[0]).toMatchObject({
      key: "policies",
      words: "0 of 11 expected policies have a current document.",
      attention: true,
    });
  });

  it("links a document; refuses one not in Files or in the trash", async () => {
    ids.access = await put("Walk access control policy");
    ids.backup = await put("Walk backup policy");
    ids.security = await put("Walk security policy");
    ids.trashed = await put("Walk trashed policy");
    await post(`/data/files/${ids.trashed}/trash`);
    expect(message(await post("/data/policies/access_control/link", { file_id: "nope" }))).toBe(
      "That document is not in Files.",
    );
    expect(
      message(await post("/data/policies/access_control/link", { file_id: ids.trashed })),
    ).toBe("That document is in the trash. Restore it in Files first.");
    const unknown = await post("/data/policies/walk_nothing/link", { file_id: ids.access });
    expect(unknown.status).toBe(404);
    expect(message(unknown)).toBe("That policy is not here.");
    const linked = await post("/data/policies/access_control/link", { file_id: ids.access });
    expect(linked.status, message(linked)).toBe(200);
    expect(linked.json!.policy).toMatchObject({
      key: "access_control",
      state: "no_review",
      words: "No review date. Set one on the document in Files.",
      file: { file_id: ids.access, title: "Walk access control policy", version: 1 },
    });
  });

  it("§5.4's states from the review dates set in Files", async () => {
    await post("/data/policies/backup/link", { file_id: ids.backup });
    await post("/data/policies/security/link", { file_id: ids.security });
    await reviewBy(ids.access!, "2026-12-21");
    expect(await policy("access_control")).toMatchObject({
      state: "current",
      words: "Current; next review 21 Dec 2026.",
      next_review: "2026-12-21",
    });
    await reviewBy(ids.backup!, "2026-12-20");
    expect((await policy("backup")).words).toBe("Review due 20 Dec 2026.");
    await reviewBy(ids.security!, "2026-11-19");
    expect((await policy("security")).words).toBe("Review lapsed on 19 Nov 2026.");
    expect((await page()).counts).toEqual({
      expected: 11,
      linked: 3,
      current: 2,
      lapsed: 1,
      own: 0,
    });
    expect(((await lookup()).summary as Body[])[0]).toMatchObject({
      words: "2 of 11 expected policies have a current document; 1 lapsed.",
      attention: true,
    });
    // Policies add no Due row of their own: Files' review dates are the one.
    const due = (await stack.ask("GET", "/data/overview?due=all")).json!.due as Body[];
    expect(due.every((row) => row.kind === "file_review")).toBe(true);
  });

  it("the document in the trash reads so", async () => {
    await post(`/data/files/${ids.security}/trash`);
    expect(await policy("security")).toMatchObject({
      state: "trashed",
      words: "The linked document is in the trash.",
    });
    await post(`/data/files/${ids.security}/restore`);
    expect((await policy("security")).state).toBe("lapsed");
  });

  it("not needed, with why, and back", async () => {
    expect(message(await post("/data/policies/supplier_code/not-needed", { why: "Short" }))).toBe(
      "Say why it is not needed, in 10 to 300 characters.",
    );
    const marked = await post("/data/policies/supplier_code/not-needed", {
      why: "We have no suppliers of our own yet.",
    });
    expect(marked.json!.policy).toMatchObject({
      state: "not_needed",
      words: "Not needed: We have no suppliers of our own yet.",
      not_needed: { why: "We have no suppliers of our own yet.", on: "2026-11-20" },
    });
    expect((await page()).counts).toMatchObject({ expected: 10 });
    expect(((await lookup()).summary as Body[])[0]!.words).toBe(
      "2 of 10 expected policies have a current document; 1 lapsed.",
    );
    const back = await post("/data/policies/supplier_code/not-needed", { undo: true });
    expect(back.json!.policy).toMatchObject({ state: "no_document", not_needed: null });
  });

  it("owner, approver and day; a day in the future refused", async () => {
    expect(
      message(await post("/data/policies/access_control/update", { approved_on: "2026-11-21" })),
    ).toBe("That day is in the future.");
    const saved = await post("/data/policies/access_control/update", {
      owner: "Walk Owner",
      approved_by: "Walk Board",
      approved_on: "2026-11-02",
      note: "Approved at the November board meeting.",
    });
    expect(saved.json!.policy).toMatchObject({
      owner: "Walk Owner",
      approved_by: "Walk Board",
      approved_on: "2026-11-02",
    });
    const events = (await stack.ask("GET", "/data/policies/access_control/events")).json!
      .events as Body[];
    expect(events[0]).toMatchObject({
      verb: "changed",
      detail: "Owner, Approved by, Approved on, Note",
    });
  });

  it("his own policies: added, linked, titled once", async () => {
    expect(message(await post("/data/policies/own", { title: "Hi" }))).toBe(
      "Give the policy a title of 3 to 120 characters.",
    );
    const made = await post("/data/policies/own", {
      title: "Walk clean desk policy",
      attempt: crypto.randomUUID(),
    });
    expect(made.status, message(made)).toBe(200);
    const own = made.json!.policy as Body & { key: string };
    expect(own.key).toMatch(/^own-[0-9a-f-]{36}$/);
    expect(own).toMatchObject({ own: true, title: "Walk clean desk policy", state: "no_document" });
    expect(message(await post("/data/policies/own", { title: "walk clean desk policy" }))).toBe(
      "A policy with that title is already here.",
    );
    ids.own = await put("Walk clean desk document");
    await post(`/data/policies/${own.key}/link`, { file_id: ids.own });
    const listed = await page();
    expect((listed.own as Body[]).map((row) => row.title)).toEqual(["Walk clean desk policy"]);
    expect(listed.counts).toMatchObject({ own: 1, linked: 4 });
    expect((await lookup(`?file_id=${ids.own}`)).used_for).toEqual([
      {
        label: "“Walk clean desk policy”, in Policies",
        href: `/data/assurance/policies#policy-${own.key}`,
      },
    ]);
  });

  it("fileFor and usedFor follow Files: a new version is version 2", async () => {
    expect((await lookup("?key=access_control")).file_for).toEqual({
      key: "access_control",
      file_id: ids.access,
      title: "Walk access control policy",
      version: 1,
      href: `/data/files/${ids.access}`,
    });
    const again = await put(
      "Walk access control policy",
      "Walk access control policy, version two",
    );
    expect(again).toBe(ids.access);
    expect(((await lookup("?key=access_control")).file_for as Body).version).toBe(2);
    expect((await lookup("?key=data_protection")).file_for).toBeNull();
    expect((await lookup(`?file_id=${ids.access}`)).used_for).toEqual([
      {
        label: "The access control policy",
        href: "/data/assurance/policies#policy-access_control",
      },
    ]);
    const evidence = (await lookup()).evidence as Body[];
    expect(evidence.find((item) => item.ref === "policies:policy:access_control")).toEqual({
      ref: "policies:policy:access_control",
      label: "Access control policy, version 2",
      href: "/data/assurance/policies#policy-access_control",
      current: true,
      why: "",
    });
    expect(evidence.find((item) => item.ref === "policies:policy:security")).toMatchObject({
      current: false,
      why: "Review lapsed on 19 Nov 2026.",
    });
    expect(evidence.find((item) => item.ref === "policies:policy:backup")).toMatchObject({
      current: true,
    });
    await post("/data/policies/access_control/link", { file_id: null });
    expect((await lookup("?key=access_control")).file_for).toBeNull();
  });
});
