// @vitest-environment node
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DISK_FULL } from "../../scripts/data/backup/make";
import { noBackupDisk } from "../../scripts/data/backup/index";
import { localDay } from "../../scripts/data/days";
import { Scripted, peopleCsv, readyToSend, sendLive } from "./leads-kit";
import { WALKER, codeOf, startStack, until, type Stack } from "./helpers";

/**
 * The backup on the real stack (B1, B2): every file and every version under its folder,
 * Data's records and Mail merge's lists, mailings and logs, never `provider.key` or
 * `provider-status.json`; a manifest whose every line matches; a zip `unzip -t` accepts;
 * refused under the 5 GB floor; "Last backup downloaded" once the portal sends it.
 */

let stack: Stack;
let out: string;
const provider = new Scripted();
type Body = Record<string, unknown>;

const STATEMENT_V1 = "Invented bank statement, version one.\n";
const STATEMENT_V2 = "Invented bank statement, version two, with more lines.\n";
const DECK = "Invented deck notes for the walk.\n";

async function put(folder: string[], title: string, name: string, text: string) {
  const answer = await stack.ask("POST", "/data/_test/files/put", {
    folder_path: folder,
    title,
    name,
    base64: Buffer.from(text).toString("base64"),
    by: WALKER,
  });
  expect(answer.status).toBe(200);
  return answer.json!.file as Body;
}

async function backup(): Promise<{ build: Body; path: string }> {
  const made = await stack.ask("POST", "/data/builds", { kind: "backup", by: WALKER });
  expect(made.status).toBe(200);
  const buildId = String((made.json!.build as Body).build_id);
  let build: Body = {};
  await until(async () => {
    build = (await stack.ask("GET", `/data/builds/${buildId}`)).json!.build as Body;
    return build.state !== "building";
  }, "the backup");
  if (build.state !== "ready") return { build, path: "" };
  const file = await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`);
  const path = join(out, `${buildId}.zip`);
  writeFileSync(path, file.bytes);
  return { build, path };
}

const entries = (zip: string): string[] =>
  execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" }).split("\n").filter(Boolean);
/** One entry's bytes; the name is passed as-is (no wildcards in these invented names). */
const entry = (zip: string, name: string): Buffer => execFileSync("unzip", ["-p", zip, name]);
const sha256 = (bytes: Uint8Array): string => createHash("sha256").update(bytes).digest("hex");

beforeAll(async () => {
  out = mkdtempSync(join(tmpdir(), "hqb-"));
  stack = await startStack({ liveProvider: () => provider });
  await readyToSend(stack.engine);
  const list = stack.engine.importList({
    name: "Walk 01",
    file_name: "walk-01.csv",
    text: peopleCsv([
      { email: "partner1@fund1.example", company: "Walk Fund 1" },
      { email: "partner2@fund2.example", company: "Walk Fund 2" },
    ]),
  }).list.id;
  await sendLive(stack.engine, list, "Walk live 01");
  stack.engine.addStops({ emails: "partner2@fund2.example", reason: "asked" });
  await put(
    ["08 Finance, tax and audit", "Bank"],
    "Statement.txt",
    "statement-v1.txt",
    STATEMENT_V1,
  );
  await put(
    ["08 Finance, tax and audit", "Bank"],
    "Statement.txt",
    "statement-v2.txt",
    STATEMENT_V2,
  );
  await put(["10 Fundraising and investors"], "Deck notes.txt", "deck-notes.txt", DECK);
  await stack.ask("POST", "/data/dates", {
    title: "Invented filing",
    kind: "filing",
    due_on: localDay(new Date()),
    repeats: "never",
    remind_days: 0,
    by: WALKER,
  });
}, 60_000);
afterAll(async () => {
  await stack.stop();
  rmSync(out, { recursive: true, force: true });
});

describe("the backup zip (B1, B2)", () => {
  it("holds every file and version, Data's records and Mail merge's files, and never the key", async () => {
    expect(existsSync(join(stack.dir, "provider.key"))).toBe(true);
    expect(existsSync(join(stack.dir, "provider-status.json"))).toBe(true);
    const { build, path } = await backup();
    expect(build.state).toBe("ready");
    expect(String(build.name)).toBe(`HQ Data backup ${localDay(new Date())}.zip`);
    execFileSync("unzip", ["-tq", path]);
    const names = entries(path);
    expect(names).toContain("files/08 Finance, tax and audit/Bank/Statement.txt");
    expect(names).toContain(
      "files/_versions/08 Finance, tax and audit/Bank/Statement.txt/v1 statement-v1.txt",
    );
    expect(names).toContain("files/10 Fundraising and investors/Deck notes.txt");
    expect(entry(path, "files/08 Finance, tax and audit/Bank/Statement.txt").toString()).toBe(
      STATEMENT_V2,
    );
    expect(
      entry(
        path,
        "files/_versions/08 Finance, tax and audit/Bank/Statement.txt/v1 statement-v1.txt",
      ).toString(),
    ).toBe(STATEMENT_V1);
    for (const name of [
      "data/data.json",
      "data/files/index.json",
      "data/files/activity.jsonl",
      "data/dates/dates.json",
      "mail-merge/written.jsonl",
      "mail-merge/stop-list.json",
      "mail-merge/settings.json",
      "mail-merge/tests.jsonl",
      "README.txt",
      "manifest-sha256.txt",
    ])
      expect(names).toContain(name);
    expect(names.some((name) => /^mail-merge\/lists\/[^/]+\.json$/.test(name))).toBe(true);
    expect(names.some((name) => /^mail-merge\/mailings\/[^/]+\.json$/.test(name))).toBe(true);
    expect(names.some((name) => /^mail-merge\/mailings\/[^/]+\.run-1\.log$/.test(name))).toBe(true);
    expect(names.some((name) => /provider\.key|provider-status\.json|\.sock$/.test(name))).toBe(
      false,
    );
    expect(names.some((name) => name.startsWith("data/files/blobs/"))).toBe(false);
    expect(names.some((name) => name.startsWith("data/tmp/"))).toBe(false);
    // The key's own text is in no entry either.
    const key = readFileSync(join(stack.dir, "provider.key"), "utf8").trim();
    for (const name of names) expect(entry(path, name).includes(key)).toBe(false);
    const stops = JSON.parse(entry(path, "mail-merge/stop-list.json").toString()) as {
      email: string;
    }[];
    expect(stops.map((stop) => stop.email)).toContain("partner2@fund2.example");
  });

  it("has a manifest that matches every file, and a README that says what it is", async () => {
    const { path } = await backup();
    const names = entries(path);
    const manifest = entry(path, "manifest-sha256.txt").toString().trim().split("\n");
    const listed = new Map(
      manifest.map((line) => {
        const [hash = "", ...rest] = line.split("  ");
        return [rest.join("  "), hash];
      }),
    );
    expect([...listed.keys()].sort()).toEqual(
      names.filter((name) => name !== "manifest-sha256.txt").sort(),
    );
    for (const [name, hash] of listed) expect(sha256(entry(path, name))).toBe(hash);
    const readme = entry(path, "README.txt").toString();
    const day = localDay(new Date());
    const [year, month, date] = day.split("-");
    const months = [
      "Jan",
      "Feb",
      "Mar",
      "Apr",
      "May",
      "Jun",
      "Jul",
      "Aug",
      "Sep",
      "Oct",
      "Nov",
      "Dec",
    ];
    expect(readme.split("\n")[0]).toBe(
      `Made on ${Number(date)} ${months[Number(month) - 1]} ${year} by Walk Owner. Not encrypted: keep it on an encrypted disk.`,
    );
    expect(readme).toContain(
      "- data/: Data's own records (folders, leads, replies, waitlist, investors and the round, key dates, notes, decisions and contacts, the calendar link's checksum, numbers and monthly updates, data-room packs).",
    );
    expect(readme).not.toMatch(/demo/i);
  });

  it("holds the people ledger only when the Owner makes it (company spec §8.6)", async () => {
    const added = await stack.ask("POST", "/data/people", {
      name: "Walk Backup Intern",
      email: "backup@walkintern.example",
      kind: "intern",
      starts_on: "2026-12-01",
      ends_on: "2027-02-28",
      stipend: { amount: 17345, currency: "INR", pays_on: 7 },
      // With an attempt, as the portal sends it: its answer must not reach Data's own replay log.
      attempt: crypto.randomUUID(),
      by: WALKER,
    });
    expect(added.status).toBe(200);
    // A signed copy, which the ledger keeps itself (never in Files).
    const LETTER = "%PDF-1.4\n% Invented quokka internship letter\n";
    const personId = String((added.json!.person as Body).person_id);
    const withCopy = await stack.ask("POST", `/data/people/${personId}/documents`, {
      kind: "internship",
      title: "Quokka internship letter",
      content: Buffer.from(LETTER).toString("base64"),
      name: "quokka-letter.pdf",
      by: WALKER,
    });
    expect(withCopy.status).toBe(200);
    const copyFile = String(
      (((withCopy.json!.person as Body).documents as Body[])[0]!.copy as Body).file,
    );
    const made = async (people: boolean): Promise<string> => {
      const started = await stack.ask("POST", "/data/builds", {
        kind: "backup",
        people,
        by: WALKER,
      });
      const buildId = String((started.json!.build as Body).build_id);
      await until(
        async () =>
          ((await stack.ask("GET", `/data/builds/${buildId}`)).json!.build as Body).state ===
          "ready",
        "the backup",
      );
      const file = await stack.raw(stack.socket, "GET", `/data/builds/${buildId}/bytes`);
      const path = join(out, `people-${String(people)}-${buildId}.zip`);
      writeFileSync(path, file.bytes);
      return path;
    };
    const owners = await made(true);
    const readme = entry(owners, "README.txt").toString();
    expect(entries(owners)).toContain("data/people/people.json");
    expect(entry(owners, `data/people/files/${copyFile}`).toString()).toBe(LETTER);
    expect(entries(owners).some((name) => name.startsWith("files/") && /quokka/i.test(name))).toBe(
      false,
    );
    expect(readme).toContain(
      "- data/people/: the people ledger. The Owner made this backup: keep it as private as this Mac.",
    );
    const others = await made(false);
    const names = entries(others);
    expect(names.some((name) => name.startsWith("data/people/"))).toBe(false);
    for (const name of names) {
      const bytes = entry(others, name);
      expect(
        bytes.includes("Walk Backup Intern") ||
          bytes.includes('"amount":17345') ||
          bytes.includes("quokka"),
        name,
      ).toBe(false);
    }
    const said = entry(others, "README.txt").toString();
    expect(said).toContain(
      "- data/people/ is left out: only a backup the Owner makes holds the people ledger.",
    );
    expect(said).not.toContain("keep it as private as this Mac");
  });

  it("is refused when the disk would have under 5 GB free after it", async () => {
    await stack.ask("POST", "/data/_test/backup/free-bytes", {
      bytes: 5 * 1024 ** 3 + 100,
      by: WALKER,
    });
    const { build } = await backup();
    expect(build.state).toBe("failed");
    expect(build.detail).toBe(DISK_FULL);
    await stack.ask("POST", "/data/_test/backup/free-bytes", { bytes: null, by: WALKER });
  });
});

describe("the overview's Backup block", () => {
  it("says when a backup was last downloaded, once the portal sends one (B3)", async () => {
    const before = (await stack.ask("GET", "/data/overview")).json!.backup as Body;
    expect(before.last_at).toBeNull();
    const { build } = await backup();
    const marked = await stack.ask("POST", "/data/backup/downloaded", {
      build_id: build.build_id,
      by: WALKER,
    });
    expect(marked.status).toBe(200);
    const after = (await stack.ask("GET", "/data/overview")).json!.backup as Body;
    expect(typeof after.last_at).toBe("string");
    const unknown = await stack.ask("POST", "/data/backup/downloaded", {
      build_id: "not-a-build",
      by: WALKER,
    });
    expect(codeOf(unknown)).toBe("not_found");
  });

  it("says when this Mac has no backup disk, as tmutil words it", async () => {
    expect(noBackupDisk("tmutil: No destinations configured.")).toBe(true);
    expect(
      noBackupDisk(
        "====================\nName          : Backup\nKind          : Local\nID            : 1\n",
      ),
    ).toBe(false);
    expect(noBackupDisk("")).toBeNull();
    await stack.ask("POST", "/data/_test/backup/disk", { no_backup_disk: true, by: WALKER });
    expect(((await stack.ask("GET", "/data/overview")).json!.backup as Body).no_backup_disk).toBe(
      true,
    );
  });
});
