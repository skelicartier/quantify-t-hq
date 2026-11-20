// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { parseAlerts } from "../../scripts/data/findings/dependabot";
import { WALK_REPO, walkAlerts } from "../../scripts/data/findings/walk-seed";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The code host's dependency alerts, imported from a file made here (ws-notes/security/spec.md
 * §8.3): both shapes (one array, and the array of arrays `--slurp` saves), the preview's
 * counts and a refused alert with its reason, the import, a second import changing state and
 * severity, an accepted finding kept accepted, open again after fixed, a dismissal in words,
 * the expired preview, a file over 3 MiB and one of over 5,000 alerts refused whole,
 * "moderate" read as medium, and nothing kept but the listed fields. The repository, the
 * advisory ids (in the code host's own alphabet) and the CVE ids are invented; nothing here
 * opens a network connection.
 */

type Body = Record<string, unknown>;

type AlertInput = {
  number: number;
  state?: string;
  severity?: string;
  ghsa?: string | null;
  cve?: string | null;
  created_at?: string;
  fixed_at?: string | null;
  dismissed_at?: string | null;
  dismissed_reason?: string | null;
  dismissed_comment?: string | null;
  package?: string;
};

function alert(input: AlertInput): Body {
  return {
    number: input.number,
    state: input.state ?? "open",
    html_url: `https://github.com/${WALK_REPO}/security/dependabot/${input.number}`,
    created_at: input.created_at ?? "2026-11-19T20:00:00Z",
    fixed_at: input.fixed_at ?? null,
    dismissed_at: input.dismissed_at ?? null,
    auto_dismissed_at: null,
    dismissed_reason: input.dismissed_reason ?? null,
    dismissed_comment: input.dismissed_comment ?? null,
    dependency: {
      package: { ecosystem: "npm", name: input.package ?? `walk-package-${input.number}` },
      manifest_path: "package-lock.json",
    },
    security_advisory: {
      ghsa_id: input.ghsa === undefined ? "GHSA-2c3f-4g5h-6j7m" : input.ghsa,
      cve_id: input.cve === undefined ? "CVE-2099-0001" : input.cve,
      summary: `Walk advisory ${input.number}`,
      description: "WALK-LONG-TEXT: the advisory's long description, never kept.",
      severity: input.severity ?? "high",
      references: [{ url: "https://walk.example/WALK-REFERENCE" }],
      cvss: { score: 9.9, vector_string: "WALK-VECTOR" },
    },
    security_vulnerability: {
      severity: input.severity ?? "high",
      vulnerable_version_range: "< 2.0.1",
      first_patched_version: { identifier: "2.0.1" },
    },
  };
}

const ghsa = (n: number) =>
  ["GHSA-2c3f-4g5h-6j7m", "GHSA-4g5h-6j7m-8p9q", "GHSA-8p9q-rvwx-2c3f", "GHSA-6j7m-8p9q-rvwx"][
    n - 1
  ]!;
const cve = (n: number) => `CVE-2099-000${n}`;
const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64");

describe("the file, read alone", () => {
  const bytes = (value: unknown) => new Uint8Array(Buffer.from(JSON.stringify(value)));

  it("one array and an array of arrays read the same", () => {
    const list = [alert({ number: 1 }), alert({ number: 2, ghsa: ghsa(2) })];
    const flat = parseAlerts(bytes(list));
    const slurped = parseAlerts(bytes([[list[0]], [list[1]]]));
    expect(flat.alerts.map((item) => item.key)).toEqual([`${WALK_REPO}#1`, `${WALK_REPO}#2`]);
    expect(slurped.alerts).toEqual(flat.alerts);
    expect(flat.refused).toEqual([]);
  });

  it("each alert is checked alone, with its position and why", () => {
    const read = parseAlerts(
      bytes([
        alert({ number: 1 }),
        alert({ number: 2, ghsa: null }),
        alert({ number: 3, ghsa: "GHSA-aaaa-bbbb-cccc" }),
        { ...alert({ number: 4 }), html_url: "https://walk.example/alert/4" },
        { ...alert({ number: 5 }), state: "gone" },
        alert({ number: 6, severity: "nope" }),
        { ...alert({ number: 7 }), created_at: "soon" },
        alert({ number: 1 }),
        "an alert",
      ]),
    );
    expect(read.alerts.map((item) => item.number)).toEqual([1]);
    expect(read.refused).toEqual([
      { index: 2, why: "Alert 2: no advisory id." },
      { index: 3, why: "Alert 3: no advisory id." },
      { index: 4, why: "Alert 4: its link is not this alert's address." },
      { index: 5, why: "Alert 5: its state is not one HQ knows." },
      { index: 6, why: "Alert 6: no severity." },
      { index: 7, why: "Alert 7: no day it was found." },
      { index: 8, why: "Alert 8: the same alert is in the file twice." },
      { index: 9, why: "Alert 9: not an alert." },
    ]);
  });

  it("'moderate' reads as medium; the advisory's severity when the vulnerability has none", () => {
    const moderate = alert({ number: 1, severity: "moderate" });
    expect(parseAlerts(bytes([moderate])).alerts[0]!.severity).toBe("medium");
    const fallback = alert({ number: 2, ghsa: ghsa(2), severity: "low" });
    (fallback.security_vulnerability as Body).severity = null;
    expect(parseAlerts(bytes([fallback])).alerts[0]!.severity).toBe("low");
  });

  it("an instant becomes India's day: 19 Nov 2026 20:00 UTC is 20 Nov 2026", () => {
    expect(parseAlerts(bytes([alert({ number: 1 })])).alerts[0]!.found_on).toBe("2026-11-20");
  });

  it("refuses a file that is not the command's, too large, or of over 5,000 alerts", () => {
    expect(() => parseAlerts(new Uint8Array(Buffer.from("not json")))).toThrow(
      "This is not the file the command saves. Run it as the page shows, with --slurp.",
    );
    expect(() => parseAlerts(bytes({ alerts: [] }))).toThrow(
      "This is not the file the command saves. Run it as the page shows, with --slurp.",
    );
    expect(() => parseAlerts(new Uint8Array(3 * 1024 * 1024 + 1))).toThrow(
      "The file is over 3 MB. Save open alerts only: add &state=open to the command.",
    );
    expect(() => parseAlerts(bytes(Array.from({ length: 5_001 }, () => ({}))))).toThrow(
      "The file holds more than 5,000 alerts. Save open alerts only: add &state=open to the command.",
    );
    const bom = new Uint8Array(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("[]")]));
    expect(parseAlerts(bom)).toEqual({ alerts: [], refused: [] });
  });

  it("the walk's file reads as four alerts, one refused", () => {
    const read = parseAlerts(bytes(walkAlerts("2026-11-20")));
    expect(read.alerts.map((item) => [item.number, item.state, item.severity])).toEqual([
      [1, "open", "high"],
      [2, "open", "critical"],
      [3, "fixed", "low"],
    ]);
    expect(read.refused).toEqual([{ index: 4, why: "Alert 4: no advisory id." }]);
  });
});

describe("the import through the service", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "findings"] });
  }, 60_000);
  afterAll(() => stack.stop());

  const post = (path: string, body: Body = {}) => stack.ask("POST", path, { by: WALKER, ...body });
  const message = (answer: { json?: Body | null }) =>
    ((answer.json?.error ?? {}) as { message?: string }).message ?? "";
  const preview = (value: unknown, name = "dependabot-alerts.json") =>
    post("/data/findings/dependabot/preview", { content: encode(value), name });
  const findings = async () =>
    (
      (await stack.ask("GET", "/data/findings?view=all&source=dependabot")).json!.findings as Body[]
    ).sort((a, b) => Number((a.dependabot as Body).number) - Number((b.dependabot as Body).number));

  it("previews: the counts, the sample, the refused one; nothing kept yet", async () => {
    await post("/data/_test/findings/today", { day: "2026-11-20" });
    const read = await preview([
      [
        alert({ number: 1, ghsa: ghsa(1), cve: cve(1) }),
        alert({ number: 2, ghsa: ghsa(2), cve: null, severity: "moderate" }),
      ],
      [
        alert({ number: 3, ghsa: null }),
        alert({ number: 4, ghsa: ghsa(4), cve: cve(4), severity: "low" }),
      ],
    ]);
    expect(read.status, message(read)).toBe(200);
    expect(read.json).toMatchObject({
      repos: [WALK_REPO],
      counts: { alerts: 3, new: 3, changed: 0, unchanged: 0, refused: 1 },
      words: "3 alerts in walk-org/walk-app: 3 new, 0 changed, 0 unchanged.",
      refused: [{ index: 3, why: "Alert 3: no advisory id." }],
    });
    expect(
      (read.json!.sample as Body[]).map((row) => [row.number, row.severity, row.plan]),
    ).toEqual([
      [1, "high", "new"],
      [2, "medium", "new"],
      [4, "low", "new"],
    ]);
    expect(await findings()).toEqual([]);

    const done = await post("/data/findings/dependabot/import", {
      import_id: read.json!.import_id,
      attempt: crypto.randomUUID(),
    });
    expect(done.status, message(done)).toBe(200);
    expect(done.json!.counts).toEqual({ alerts: 3, new: 3, changed: 0, unchanged: 0, refused: 1 });
    const again = await post("/data/findings/dependabot/import", {
      import_id: read.json!.import_id,
    });
    expect(message(again)).toBe("That preview has expired. Choose the file again.");
  });

  it("each alert is a finding: its title, its words, its day", async () => {
    const rows = await findings();
    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      title: "walk-package-1: Walk advisory 1",
      description: `${ghsa(1)} · ${cve(1)} · npm · package-lock.json · affected < 2.0.1 · fixed in 2.0.1`,
      source: "dependabot",
      severity: "high",
      found_on: "2026-11-20",
      status: "open",
      fix: { fix_by: "2026-12-20" },
      dependabot: {
        repo: WALK_REPO,
        number: 1,
        ghsa_id: ghsa(1),
        cve_id: cve(1),
        package: "walk-package-1",
        ecosystem: "npm",
        manifest_path: "package-lock.json",
        vulnerable_range: "< 2.0.1",
        patched: "2.0.1",
        html_url: `https://github.com/${WALK_REPO}/security/dependabot/1`,
        state: "open",
        dismissed_reason: null,
      },
    });
    expect(rows[1]!.description).toBe(
      `${ghsa(2)} · npm · package-lock.json · affected < 2.0.1 · fixed in 2.0.1`,
    );
    expect(rows[1]!.severity).toBe("medium");
    const page = (await stack.ask("GET", "/data/findings")).json!;
    expect(page.last_import).toMatchObject({
      file_name: "dependabot-alerts.json",
      counts: { alerts: 3, new: 3, refused: 1 },
    });
    const line = (
      (await stack.ask("GET", "/data/_test/findings/lookup")).json!.summary as Body[]
    ).find((item) => item.key === "dependabot");
    expect(line!.words).toBe("Dependency alerts last imported 20 Nov 2026: 3 open.");
    const groups = (await stack.ask("GET", `/data/_test/findings/search?q=${ghsa(4)}`)).json!
      .groups as Body[];
    expect((groups[0]!.hits as Body[])[0]).toMatchObject({
      title: "walk-package-4: Walk advisory 4",
    });
    const byCve = (await stack.ask("GET", `/data/_test/findings/search?q=${cve(1)}`)).json!
      .groups as Body[];
    expect(byCve[0]!.count).toBe(1);
  });

  it("nothing is kept but the listed fields", () => {
    const stored = readFileSync(join(stack.dir, "data", "findings", "findings.json"), "utf8");
    expect(stored).not.toContain("WALK-LONG-TEXT");
    expect(stored).not.toContain("WALK-REFERENCE");
    expect(stored).not.toContain("WALK-VECTOR");
    const record = (JSON.parse(stored) as { findings: Body[] }).findings[0]!;
    expect(Object.keys(record.dependabot as Body).sort()).toEqual(
      [
        "repo",
        "number",
        "ghsa_id",
        "cve_id",
        "package",
        "ecosystem",
        "manifest_path",
        "vulnerable_range",
        "patched",
        "html_url",
        "state",
        "dismissed_reason",
        "imported_at",
      ].sort(),
    );
    const imports = readFileSync(join(stack.dir, "data", "findings", "imports.jsonl"), "utf8");
    expect(imports).not.toContain("Walk advisory");
    expect(imports).toContain("dependabot-alerts.json");
    expect(JSON.parse(imports.trim().split("\n")[0]!)).toMatchObject({
      file_name: "dependabot-alerts.json",
      sha256: expect.stringMatching(/^[0-9a-f]{64}$/),
      counts: { alerts: 3, new: 3, changed: 0, unchanged: 0, refused: 1 },
    });
  });

  it("a second file: state and severity change; an accepted finding stays accepted", async () => {
    const rows = await findings();
    const fourth = rows.find((row) => (row.dependabot as Body).number === 4)!;
    const accepted = await post(`/data/findings/${String(fourth.finding_id)}/accept`, {
      why: "Only used by the build, never shipped.",
      decided_by: "Walk Owner",
      on: "2026-11-20",
    });
    expect(accepted.status, message(accepted)).toBe(200);
    const read = await preview([
      alert({
        number: 1,
        ghsa: ghsa(1),
        cve: cve(1),
        state: "fixed",
        fixed_at: "2026-11-20T10:00:00Z",
      }),
      alert({ number: 2, ghsa: ghsa(2), cve: null, severity: "critical" }),
      alert({ number: 4, ghsa: ghsa(4), cve: cve(4), severity: "low" }),
    ]);
    expect(read.json).toMatchObject({
      counts: { alerts: 3, new: 0, changed: 2, unchanged: 1, refused: 0 },
      words: "3 alerts in walk-org/walk-app: 0 new, 2 changed, 1 unchanged.",
    });
    await post("/data/findings/dependabot/import", { import_id: read.json!.import_id });
    const after = await findings();
    expect(after[0]).toMatchObject({ status: "fixed", fixed_on: "2026-11-20" });
    expect(after[1]).toMatchObject({
      severity: "critical",
      found_on: "2026-11-20",
      fix: { fix_by: "2026-11-27" },
    });
    expect(after[2]).toMatchObject({ status: "accepted" });
    expect((after[2]!.fix as Body).lines).toEqual(["Still open on the code host."]);
  });

  it("open again after fixed; a dismissal in words, by the code host", async () => {
    const read = await preview([
      alert({ number: 1, ghsa: ghsa(1), cve: cve(1), state: "open" }),
      alert({
        number: 2,
        ghsa: ghsa(2),
        cve: null,
        severity: "critical",
        state: "dismissed",
        dismissed_at: "2026-11-20T05:00:00Z",
        dismissed_reason: "inaccurate",
        dismissed_comment: "The walk app never calls it.",
      }),
    ]);
    await post("/data/findings/dependabot/import", { import_id: read.json!.import_id });
    const after = await findings();
    expect(after[0]).toMatchObject({ status: "open", fixed_on: null });
    const detail = (await stack.ask("GET", `/data/findings/${String(after[0]!.finding_id)}`)).json!;
    expect((detail.events as Body[]).map((event) => event.verb)).toContain(
      "Open again on the code host",
    );
    expect(after[1]).toMatchObject({
      status: "dismissed",
      decision: {
        why: "Not accurate: The walk app never calls it.",
        decided_by: "The code host",
        on: "2026-11-20",
      },
    });
  });

  it("the preview expires after 10 minutes; a file too large or not the command's is refused", async () => {
    const read = await preview([alert({ number: 9, ghsa: ghsa(3), cve: null })]);
    expect(read.status).toBe(200);
    await post("/data/_test/findings/expire");
    expect(
      message(await post("/data/findings/dependabot/import", { import_id: read.json!.import_id })),
    ).toBe("That preview has expired. Choose the file again.");
    const big = Buffer.alloc(3 * 1024 * 1024 + 10, 32).toString("base64");
    expect(
      message(await post("/data/findings/dependabot/preview", { content: big, name: "big.json" })),
    ).toBe("The file is over 3 MB. Save open alerts only: add &state=open to the command.");
    expect(
      message(
        await post("/data/findings/dependabot/preview", {
          content: Buffer.from("{").toString("base64"),
        }),
      ),
    ).toBe("This is not the file the command saves. Run it as the page shows, with --slurp.");
    expect(message(await post("/data/findings/dependabot/preview", {}))).toBe(
      "Choose the file the command saved.",
    );
  });
});
