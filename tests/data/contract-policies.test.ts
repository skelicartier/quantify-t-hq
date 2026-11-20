// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addOwnPolicy,
  linkPolicy,
  policyNotNeeded,
  readPolicies,
  updatePolicy,
} from "@/lib/data/api/policies";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's policies client against the real stack (ws-notes/security/spec.md §8.7): every
 * answer passes its schema in each state, his own policy included, and a refusal arrives as
 * the service's sentence. Invented documents only.
 */

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["files", "policies"] });
}, 60_000);
afterAll(() => stack.stop());

const put = async (title: string) => {
  const answer = await stack.ask("POST", "/data/_test/files/put", {
    by: WALKER,
    folder_path: ["Security", "Policies"],
    title,
    name: `${title}.txt`,
    base64: Buffer.from(`${title}\n`).toString("base64"),
  });
  return (answer.json!.file as { file_id: string }).file_id;
};

describe("the portal and the policy register agree", () => {
  it("every state parses", async () => {
    const empty = await readPolicies();
    expect(empty.policies).toHaveLength(11);
    const access = await put("Walk access control policy");
    const backup = await put("Walk backup policy");
    const lapsed = await put("Walk lapsed policy");
    await stack.ask("POST", `/data/files/${access}/update`, {
      by: WALKER,
      review_by: "2099-01-01",
    });
    await stack.ask("POST", `/data/files/${lapsed}/update`, {
      by: WALKER,
      review_by: "2001-01-01",
    });
    await linkPolicy("access_control", access, WALKER);
    await linkPolicy("backup", backup, WALKER);
    await linkPolicy("security", lapsed, WALKER);
    await updatePolicy(
      "access_control",
      { owner: "Walk Owner", approved_on: "2026-11-01" },
      WALKER,
    );
    await policyNotNeeded("supplier_code", { why: "An invented reason, long enough." }, WALKER);
    const own = await addOwnPolicy("Walk clean desk policy", WALKER, crypto.randomUUID());
    expect(own.policy.own).toBe(true);
    const page = await readPolicies();
    expect(new Set(page.policies.map((row) => row.state))).toEqual(
      new Set(["current", "no_review", "lapsed", "not_needed", "no_document"]),
    );
    expect(page.own).toHaveLength(1);
    await policyNotNeeded("supplier_code", { undo: true }, WALKER);
  });

  it("a refusal is the service's sentence", async () => {
    await expect(linkPolicy("access_control", "walk-nope", WALKER)).rejects.toMatchObject({
      status: 404,
      message: "That document is not in Files.",
    });
    await expect(addOwnPolicy("Hi", WALKER, crypto.randomUUID())).rejects.toMatchObject({
      status: 400,
      message: "Give the policy a title of 3 to 120 characters.",
    });
  });
});
