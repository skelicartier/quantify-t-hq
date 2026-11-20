// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import {
  addAccount,
  addTool,
  closeAccount,
  keepSubprocessors,
  linkAccount,
  readAccounts,
  readPersonSystems,
  readTool,
  readTools,
  retireTool,
  reviewTool,
  saveToolsSetup,
  updateAccount,
  updateTool,
} from "@/lib/data/api/tools";
import { DataRequestError } from "@/lib/data/socket";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's tools client against the real stack (ws-notes/security/spec.md §6.4, §6.9):
 * every answer passes its schema, as the Owner and as anyone else, with Money, Domains, Files
 * and the people ledger loaded; the Owner-only routes refuse without the flag. Every name is
 * invented; nothing here opens a network connection.
 */

type Body = Record<string, unknown>;
let stack: Stack;
const today = () => localDay(new Date());
const attempt = () => crypto.randomUUID();

beforeAll(async () => {
  stack = await startStack({
    env: true,
    modules: ["files", "people", "money", "domains", "tools"],
  });
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and Systems › Tools agree", () => {
  it("every read and write answers what its schema reads", async () => {
    const empty = await readTools();
    expect(empty.tools).toEqual([]);
    const added = await addTool(
      {
        name: "Walk Mail",
        category: "mail_docs",
        billing: "yearly",
        renews_on: addDays(today(), 40),
        notice_days: "30",
        critical: true,
        holds: ["customer"],
        subprocessor: { purpose: "Mail", locations: "India", dpa_signed_on: addDays(today(), -5) },
      },
      {
        content: Buffer.from("%PDF-1.4\n% Invented agreement\n").toString("base64"),
        name: "dpa.pdf",
      },
      WALKER,
      attempt(),
    );
    const toolId = added.tool.tool_id;
    expect(added.tool.subprocessor?.dpa_file_id).not.toBeNull();
    await updateTool(toolId, { plan: "Walk Business" }, {}, WALKER);
    await reviewTool(toolId, { on: today(), by_name: "Walk Owner", note: "" }, WALKER);
    await saveToolsSetup("6", WALKER);
    await saveToolsSetup("", WALKER);
    const account = await addAccount(
      toolId,
      { holder: "walk.intern@walk.example", role: "admin", mfa: "yes" },
      WALKER,
      attempt(),
    );
    await updateAccount(account.account.account_id, { role: "member" }, WALKER);
    const kept = await keepSubprocessors(WALKER);
    expect(kept.file.title).toBe("Sub-processors");
    for (const view of [undefined, "trial", "ending", "retired", "all"]) await readTools(view);
    const plain = await readTool(toolId, false);
    expect(plain.accounts[0]).not.toHaveProperty("person");
    expect(plain.roster).toBeUndefined();
    const owner = await readTool(toolId, true);
    expect(owner.accounts[0]?.person).toBeNull();
    expect(owner.roster).toEqual([]);
    await readAccounts({ owner: false });
    await readAccounts({ owner: true, view: "all", holder: "walk.intern@walk.example" });
    await closeAccount(account.account.account_id, { closed_on: today(), note: "" }, WALKER);
    await closeAccount(account.account.account_id, { undo: true }, WALKER);

    const person = await stack.ask("POST", "/data/people", {
      name: "Walk Intern One",
      email: "walk.intern@walk.example",
      kind: "intern",
      starts_on: "2026-11-02",
      ends_on: "2027-01-29",
      by: WALKER,
    });
    const personId = String((person.json!.person as Body).person_id);
    const before = await readPersonSystems(personId);
    expect(before.possible).toHaveLength(1);
    expect(before.devices).toBeNull();
    const linked = await linkAccount(account.account.account_id, personId, WALKER);
    expect(linked).toEqual({ ok: true, account_id: account.account.account_id, linked: true });
    await stack.ask("POST", `/data/people/${personId}/offboard`, {
      last_day: "2026-11-27",
      by: WALKER,
    });
    const after = await readPersonSystems(personId);
    expect(after.accounts[0]?.close_by?.on).toBe("2026-11-28");
    const accounts = await readAccounts({ owner: true, view: "open" });
    expect(accounts.accounts[0]?.person?.name).toBe("Walk Intern One");
    await stack.ask("POST", "/data/_test/tools/devices", {
      by_person: {
        [personId]: [
          {
            device_id: "walk-laptop",
            label: "Walk Laptop 14",
            ownership: "personal",
            by: null,
            done: false,
          },
        ],
      },
      by: WALKER,
    });
    expect((await readPersonSystems(personId)).devices).toHaveLength(1);

    await closeAccount(account.account.account_id, {}, WALKER);
    await retireTool(toolId, { why: "Walk retired it" }, WALKER);
    await retireTool(toolId, { undo: true }, WALKER);
  });

  it("an Owner-only route asked without the flag is refused, not parsed", async () => {
    const tools = await readTools("all");
    const toolId = tools.tools[0]!.tool_id;
    const answer = await stack.ask("GET", `/data/tools/for-person/walk-nobody`);
    expect(answer.status).toBe(403);
    await expect(readPersonSystems("walk-nobody")).rejects.toBeInstanceOf(DataRequestError);
    expect(toolId).not.toBe("");
  });
});
