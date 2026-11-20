// @vitest-environment node
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { localDay } from "../../scripts/data/days";
import { closeByWords } from "../../scripts/data/tools/renewal";
import { REVOKE_CRITICAL, REVOKE_OTHER } from "@/lib/data/labels-people";
import { WALKER, codeOf, startStack, until, type Stack } from "./helpers";

/**
 * The Owner rule for accounts (ws-notes/security/spec.md §2 rules 1–2, §3.5, §6.9), on the real
 * stack with the people ledger: the link is the Owner's and refused without the flag; a GET
 * without `owner=1` has no `person` or `close_by` key at all; the for-person route refuses
 * without it; offboarding "Walk Intern One" with last day 27 Nov 2026 gives the two close-by
 * rows of §5.2, `owner_only`, absent from an Admin's Due; closing the account takes its row
 * away; the Admin's CSV has no ledger column; a backup made without people holds no
 * `data/tools/owner/`; and `attempts.jsonl`, both event files and every answer of a route an
 * Admin reaches hold neither the name, the id nor the days. Every person is invented.
 */

type Body = Record<string, unknown>;
const NAME = "Walk Intern One";
const EMAIL = "walk.intern@walk.example";
const LAST_DAY = "2026-11-27";
const today = () => localDay(new Date());
const attempt = () => crypto.randomUUID();

let stack: Stack;
let out: string;
let personId = "";
let mailAccount = "";
let designAccount = "";
let mailTool = "";
let designTool = "";

beforeAll(async () => {
  stack = await startStack({ modules: ["files", "people", "tools", "backup"] });
  out = mkdtempSync(join(tmpdir(), "hqd-tools-"));
}, 60_000);
afterAll(async () => {
  await stack.stop();
  rmSync(out, { recursive: true, force: true });
});

async function post(path: string, body: Body): Promise<Body> {
  const answer = await stack.ask("POST", path, { ...body, by: WALKER });
  expect(answer.status, `${path} ${JSON.stringify(answer.json)}`).toBe(200);
  return answer.json!;
}

async function get(path: string): Promise<Body> {
  const answer = await stack.ask("GET", path);
  expect(answer.status, `${path} ${JSON.stringify(answer.json)}`).toBe(200);
  return answer.json!;
}

/** What must never reach anything an Admin can read. */
const ledgerWords = () => [NAME, personId, LAST_DAY, "2026-11-28", "2026-12-02"];
const holdsNone = (text: string) => ledgerWords().filter((word) => text.includes(word));

async function build(kind: string, extra: Body = {}): Promise<Buffer> {
  const started = await post("/data/builds", { kind, ...extra });
  const buildId = String((started.build as Body).build_id);
  await until(
    async () => ((await get(`/data/builds/${buildId}`)).build as Body).state !== "building",
    kind,
  );
  expect(((await get(`/data/builds/${buildId}`)).build as Body).state).toBe("ready");
  return (await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`)).bytes;
}

describe("the Owner rule for accounts (§3.5)", () => {
  it("seeds the walk's intern through the people module, and two tools with an account each", async () => {
    const added = await post("/data/people", {
      name: NAME,
      email: EMAIL,
      kind: "intern",
      starts_on: "2026-11-02",
      ends_on: "2027-01-29",
      attempt: attempt(),
    });
    personId = String((added.person as Body).person_id);
    const mail = await post("/data/tools", {
      name: "Walk Mail",
      category: "mail_docs",
      critical: true,
      mfa: "enforced",
      attempt: attempt(),
    });
    mailTool = String((mail.tool as Body).tool_id);
    const design = await post("/data/tools", {
      name: "Walk Design",
      category: "design",
      critical: false,
      attempt: attempt(),
    });
    designTool = String((design.tool as Body).tool_id);
    mailAccount = String(
      (
        (await post(`/data/tools/${mailTool}/accounts`, { holder: EMAIL, attempt: attempt() }))
          .account as Body
      ).account_id,
    );
    designAccount = String(
      (
        (
          await post(`/data/tools/${designTool}/accounts`, {
            holder: "walk.one@design.example",
            attempt: attempt(),
          })
        ).account as Body
      ).account_id,
    );
  });

  it("refuses the link and the for-person route without the Owner flag: 403 owner_only", async () => {
    const link = await stack.ask("POST", `/data/tools/accounts/${mailAccount}/link`, {
      person_id: personId,
      by: WALKER,
    });
    expect(link.status).toBe(403);
    expect(codeOf(link)).toBe("owner_only");
    expect((link.json!.error as Body).message).toBe(
      "This is for the Owner only: it comes from the people ledger.",
    );
    const flagFalse = await stack.ask("POST", `/data/tools/accounts/${mailAccount}/link`, {
      person_id: personId,
      owner: "true",
      by: WALKER,
    });
    expect(flagFalse.status).toBe(403);
    const forPerson = await stack.ask("GET", `/data/tools/for-person/${personId}`);
    expect(forPerson.status).toBe(403);
    expect(codeOf(forPerson)).toBe("owner_only");
    expect((await stack.ask("GET", `/data/tools/for-person/${personId}?owner=0`)).status).toBe(403);
  });

  it("as the Owner, lists the address that is possibly theirs, then links both and answers nothing from the ledger", async () => {
    const before = await get(`/data/tools/for-person/${personId}?owner=1`);
    expect(before.accounts).toEqual([]);
    expect(before.devices).toBeNull();
    expect((before.possible as Body[]).map((row) => row.account_id)).toEqual([mailAccount]);
    const unknown = await stack.ask("POST", `/data/tools/accounts/${mailAccount}/link`, {
      person_id: "walk-nobody",
      owner: true,
      by: WALKER,
    });
    expect(unknown.status).toBe(404);
    expect((unknown.json!.error as Body).message).toBe("That person is not in the people ledger.");
    for (const accountId of [mailAccount, designAccount]) {
      const linked = await stack.ask("POST", `/data/tools/accounts/${accountId}/link`, {
        person_id: personId,
        owner: true,
        attempt: attempt(),
        by: WALKER,
      });
      expect(linked.status).toBe(200);
      expect(linked.json).toEqual({ ok: true, account_id: accountId, linked: true });
    }
    const after = await get(`/data/tools/for-person/${personId}?owner=1`);
    expect((after.accounts as Body[]).map((row) => row.tool_name)).toEqual([
      "Walk Design",
      "Walk Mail",
    ]);
    expect(after.possible).toEqual([]);
    expect((after.accounts as Body[])[0]).toMatchObject({
      person: { person_id: personId, name: NAME, href: `/data/people/${personId}` },
      close_by: null,
    });
  });

  it("a GET without owner=1 has no person or close_by key; with it, each row has both", async () => {
    const plain = await get("/data/tools/accounts");
    for (const row of plain.accounts as Body[]) {
      expect(Object.keys(row)).not.toContain("person");
      expect(Object.keys(row)).not.toContain("close_by");
    }
    expect(Object.keys(plain)).not.toContain("roster");
    const asOwner = await get("/data/tools/accounts?owner=1");
    for (const row of asOwner.accounts as Body[]) {
      expect(Object.keys(row)).toContain("person");
      expect(Object.keys(row)).toContain("close_by");
    }
    expect((asOwner.roster as Body[]).map((person) => person.name)).toEqual([NAME]);
    // The keys an Admin's row has are exactly the Owner's less the two.
    const keys = (rows: Body[]) => Object.keys(rows[0]!).sort();
    expect(
      keys(asOwner.accounts as Body[]).filter((key) => key !== "person" && key !== "close_by"),
    ).toEqual(keys(plain.accounts as Body[]));
    const tool = await get(`/data/tools/${mailTool}`);
    expect(Object.keys((tool.accounts as Body[])[0]!)).not.toContain("person");
    expect(Object.keys(tool)).not.toContain("roster");
    const ownerTool = await get(`/data/tools/${mailTool}?owner=1`);
    expect((ownerTool.accounts as Body[])[0]).toMatchObject({ person: { name: NAME } });
  });

  it("offboarding with last day 27 Nov 2026 gives the two close-by rows, owner_only, and none to an Admin", async () => {
    await post(`/data/people/${personId}/offboard`, { last_day: LAST_DAY, attempt: attempt() });
    const owner = (await get("/data/_test/tools/due?owner=1")).items as Body[];
    const rows = owner.filter((item) => item.kind === "account");
    expect(rows).toEqual([
      {
        key: `account:${mailAccount}`,
        kind: "account",
        title: `Close Walk Mail for ${NAME}`,
        sub: REVOKE_CRITICAL,
        due_on: "2026-11-28",
        href: `/data/systems/tools/${mailTool}#tool-accounts`,
        owner_only: true,
      },
      {
        key: `account:${designAccount}`,
        kind: "account",
        title: `Close Walk Design for ${NAME}`,
        sub: REVOKE_OTHER,
        due_on: "2026-12-02",
        href: `/data/systems/tools/${designTool}#tool-accounts`,
        owner_only: true,
      },
    ]);
    const admin = (await get("/data/_test/tools/due")).items as Body[];
    expect(admin.filter((item) => item.kind === "account")).toEqual([]);
    expect(holdsNone(JSON.stringify(admin))).toEqual([]);
    // The overview an Admin's Home reads: core leaves the rows out without the flag.
    const overview = await get("/data/overview?due=all");
    expect(holdsNone(JSON.stringify(overview))).toEqual([]);
    const ownerOverview = await get("/data/overview?due=all&owner=1");
    expect(JSON.stringify(ownerOverview)).toContain(`Close Walk Mail for ${NAME}`);
    // The close-by words as the Owner reads them.
    const asOwner = (await get("/data/tools/accounts?owner=1")).accounts as Body[];
    const mail = asOwner.find((row) => row.account_id === mailAccount)!;
    expect(mail.close_by).toEqual(closeByWords({ closed_on: null }, LAST_DAY, true, today()));
    const design = asOwner.find((row) => row.account_id === designAccount)!;
    expect(design.close_by).toEqual(closeByWords({ closed_on: null }, LAST_DAY, false, today()));
    expect(String((design.close_by as Body).words)).toMatch(/2 Dec 2026$/);
  });

  it("the Summary counts leavers only for the Owner; evidence, search and the agenda never name the person", async () => {
    const owner = (await get("/data/_test/tools/lookup?owner=1")).summary as Body[];
    expect(owner.map((line) => line.key)).toEqual(["tools", "two-step", "accounts", "leavers"]);
    const plain = await get("/data/_test/tools/lookup");
    expect((plain.summary as Body[]).map((line) => line.key)).toEqual([
      "tools",
      "two-step",
      "accounts",
    ]);
    expect(holdsNone(JSON.stringify(plain))).toEqual([]);
    for (const q of ["intern", "walk", "walk.intern"]) {
      const search = await get(`/data/_test/tools/search?q=${encodeURIComponent(q)}`);
      expect(holdsNone(JSON.stringify(search))).toEqual([]);
      expect(JSON.stringify(search)).not.toContain(EMAIL);
    }
    const agenda = await get("/data/_test/tools/agenda");
    expect(holdsNone(JSON.stringify(agenda))).toEqual([]);
  });

  it("every answer of a route an Admin reaches holds no name, id or day of the ledger", async () => {
    for (const path of [
      "/data/tools",
      "/data/tools?view=all",
      `/data/tools/${mailTool}`,
      `/data/tools/${designTool}`,
      "/data/tools/accounts",
      "/data/tools/accounts?view=all",
      "/data/overview",
    ])
      expect({ path, found: holdsNone(JSON.stringify(await get(path))) }).toEqual({
        path,
        found: [],
      });
  });

  it("the Admin's accounts CSV has no ledger column; the Owner's has both", async () => {
    const admin = (await build("tools_accounts_csv")).toString("utf8");
    expect(admin).not.toContain("In the people ledger");
    expect(admin).not.toContain("Close by");
    expect(holdsNone(admin)).toEqual([]);
    const owner = (await build("tools_accounts_csv", { owner: true })).toString("utf8");
    expect(owner).toContain("In the people ledger,Close by");
    expect(owner).toContain(`,${NAME},2026-11-28`);
  });

  it("a backup made without people holds no data/tools/owner/; the Owner's does", async () => {
    const zip = async (people: boolean) => {
      const path = join(out, `backup-${String(people)}.zip`);
      writeFileSync(path, await build("backup", { people }));
      return execFileSync("unzip", ["-Z1", path], { encoding: "utf8" }).split("\n").filter(Boolean);
    };
    const others = await zip(false);
    expect(others).toContain("data/tools/tools.json");
    expect(others.some((name) => name.startsWith("data/tools/owner/"))).toBe(false);
    const owners = await zip(true);
    expect(owners).toContain("data/tools/owner/links.json");
  });

  it("the person's section: devices from the stand-in, and closing the account takes its row away", async () => {
    const installed = await post("/data/_test/tools/devices", {
      by_person: {
        [personId]: [
          {
            device_id: "walk-laptop",
            label: "Walk Laptop 14",
            ownership: "personal",
            by: "2026-12-02",
            done: false,
            href: "/data/systems/devices/walk-laptop",
          },
        ],
      },
    });
    expect(installed).toMatchObject({ installed: true });
    const section = await get(`/data/tools/for-person/${personId}?owner=1`);
    expect(section.devices).toEqual([
      {
        device_id: "walk-laptop",
        label: "Walk Laptop 14",
        ownership: "personal",
        by: "2026-12-02",
        done: false,
        href: "/data/systems/devices/walk-laptop",
      },
    ]);
    await post("/data/_test/tools/devices", { on: false });
    expect((await get(`/data/tools/for-person/${personId}?owner=1`)).devices).toBeNull();
    await post(`/data/tools/accounts/${mailAccount}/close`, { closed_on: today() });
    const rows = ((await get("/data/_test/tools/due?owner=1")).items as Body[]).filter(
      (item) => item.kind === "account",
    );
    expect(rows.map((row) => row.key)).toEqual([`account:${designAccount}`]);
    const closed = ((await get("/data/tools/accounts?owner=1&view=all")).accounts as Body[]).find(
      (row) => row.account_id === mailAccount,
    )!;
    expect(String((closed.close_by as Body).words)).toMatch(/^Closed /);
  });

  it("unlinks, with the verb only in the Owner's event file", async () => {
    const unlinked = await post(`/data/tools/accounts/${designAccount}/link`, {
      person_id: null,
      owner: true,
    });
    expect(unlinked).toMatchObject({ account_id: designAccount, linked: false });
    const events = readFileSync(join(stack.dir, "data/tools/owner/events.jsonl"), "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as Body);
    expect(events.map((event) => event.verb)).toEqual(["linked", "linked", "unlinked"]);
    for (const event of events)
      expect(Object.keys(event).sort()).toEqual(["account_id", "at", "verb"]);
  });

  it("attempts.jsonl, both event files and the tools records hold no name, id or day of the ledger", () => {
    const root = join(stack.dir, "data");
    const files = [
      "attempts.jsonl",
      "tools/events.jsonl",
      "tools/owner/events.jsonl",
      "tools/tools.json",
      ...readdirSync(join(root, "tools"))
        .filter((name) => name.endsWith(".jsonl"))
        .map((name) => `tools/${name}`),
    ];
    for (const file of files) {
      const text = readFileSync(join(root, file), "utf8");
      expect({ file, found: holdsNone(text) }).toEqual({ file, found: [] });
    }
    // The link itself holds the id, and only there.
    expect(readFileSync(join(root, "tools/owner/links.json"), "utf8")).toContain(personId);
  });
});
