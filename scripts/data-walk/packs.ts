/**
 * Data-room packs, walked against the stand-in (raise spec §8.14, P1–P8): the pinned
 * "Walk data room" listed and another made (P1); what is missing (P2); a file from
 * "13 Directors' KYC" refused (P3); "Up" renumbering the files and moving the version on
 * by one (P4); the zip, with its index, every file and a manifest line per entry (P5);
 * the index saved in "10 Fundraising and investors" (P6); a share recorded with the
 * pack's version and files as they were (P7); and the intern seeing only the role line
 * (P8). Every file and firm is invented, on `.example`.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";
import { standInBody } from "./numbers";

export const shots: Shot[] = [
  { name: "data-packs", path: "/data/files/packs", ready: "#table-packs" },
  { name: "data-pack", path: "/data/files/packs/walk-pack", ready: "#table-in-the-pack" },
];

const PACK = "walk-pack";
const KYC_SENTENCE = "Files in “13 Directors' KYC” never go in a pack.";

type Answer = { status: number; body: Record<string, unknown> };

function ask(
  socket: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const text = body === undefined ? undefined : JSON.stringify(body);
    const outgoing = request(
      {
        socketPath: socket,
        path,
        method,
        headers: text
          ? { "content-type": "application/json", "content-length": Buffer.byteLength(text) }
          : {},
      },
      (response) => {
        const chunks: Buffer[] = [];
        response.on("data", (chunk: Buffer) => chunks.push(chunk));
        response.on("end", () => {
          let parsed: Record<string, unknown> = {};
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
          } catch {
            parsed = {};
          }
          resolve({ status: response.statusCode ?? 0, body: parsed });
        });
      },
    );
    outgoing.on("error", reject);
    if (text) outgoing.write(text);
    outgoing.end();
  });
}

/** The pinned pack "Walk data room": three invented files in folder 10, deck, team and other. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/packs")).status !== 200) {
    console.log("[walk] packs: the files module is not loaded here");
    return;
  }
  const made = await ask(socketPath, "POST", "/data/_test/packs/seed", { by: WALKER });
  console.log(`[walk] packs: ${made.status === 200 ? "Walk data room is ready" : made.status}`);
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

function passIndex(kit: WalkKit): number {
  return (kit.pass.width === "phone" ? 2 : 0) + (kit.pass.theme === "light" ? 1 : 0);
}

async function until(page: Page, test: () => Promise<boolean>, tries = 150): Promise<boolean> {
  for (let attempt = 0; attempt < tries; attempt += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function open(page: Page, kit: WalkKit, path: string, ready: string): Promise<void> {
  await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(ready, { timeout: 30_000 });
}

type FileRow = { file_id: string; title: string; original_name: string; current_n: number };
type PackPage = {
  pack: { version: number; name: string };
  items: { item_id: string; n: number; file: FileRow | null }[];
  checklist: { label: string; covered_by: number[] }[];
  shares: {
    firm: string;
    version: number;
    files: { n: number; title: string; file_id: string }[];
  }[];
  firms: { investor_id: string; firm: string }[] | null;
};

const packOf = async (kit: WalkKit) =>
  (await kit.socket.ask("GET", `/data/packs/${PACK}`)).body as unknown as PackPage;

/** "01 Walk pitch deck.txt": as the zip names an entry. */
function entryName(n: number, title: string, originalName: string): string {
  const dot = originalName.lastIndexOf(".");
  const ext = dot > 0 ? originalName.slice(dot + 1).toLowerCase() : "";
  const stem =
    ext && title.toLowerCase().endsWith(`.${ext}`) ? title.slice(0, -(ext.length + 1)) : title;
  return `${String(n).padStart(2, "0")} ${stem}${ext ? `.${ext}` : ""}`;
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/packs")).status !== 200) {
    kit.check("packs: not loaded in this service", true);
    return;
  }
  const pass = passIndex(kit);
  // The stand-in investor list, again if a worker restart dropped it (never over a real one).
  const day = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  await kit.socket.ask("POST", "/data/_test/numbers/raise", standInBody(day));

  // ---------------------------------------------------------------- P1: the list, and one more pack
  await open(page, kit, "/data/files/packs", "#table-packs");
  let text = flat(await page.locator("#table-packs").innerText());
  kit.check(
    "packs P1: the list holds Walk data room",
    text.includes("Walk data room"),
    text.slice(0, 160),
  );
  await kit.audit("packs");
  const name = `Walk pack ${pass + 1}`;
  await page.locator("summary", { hasText: "Make a pack" }).click();
  const makeForm = page.locator("form", { has: page.locator("#pack-new-name") });
  await makeForm.locator("#pack-new-name").fill(name);
  await makeForm.locator("button", { hasText: "Make it" }).click();
  const made = await until(page, async () =>
    (
      ((await kit.socket.ask("GET", "/data/packs")).body.packs as { name: string }[] | undefined) ??
      []
    ).some((pack) => pack.name === name),
  );
  await open(page, kit, "/data/files/packs", "#table-packs");
  text = flat(await page.locator("#table-packs").innerText());
  kit.check("packs P1: Make a pack adds another", made && text.includes(name), name);

  // ---------------------------------------------------------------- P2: what's missing
  await open(page, kit, `/data/files/packs/${PACK}`, "#table-in-the-pack");
  const rows = await page.evaluate(() =>
    [...document.querySelectorAll("#table-checklist tbody tr")].map((row) =>
      [...row.children].map((cell) => (cell.textContent ?? "").trim()),
    ),
  );
  const line = (label: string) => rows.find((row) => row[0] === label)?.at(-1);
  kit.check(
    "packs P2: What's missing reads Missing for Roadmap to the next round and Cap table",
    line("Roadmap to the next round") === "Missing" &&
      line("Cap table") === "Missing" &&
      line("Pilot or beta data") === "When there is some" &&
      /^\d+\. Walk pitch deck$/.test(line("Pitch deck") ?? ""),
    rows.map((row) => `${row[0]}: ${row.at(-1)}`),
  );
  await kit.audit("pack");

  // ---------------------------------------------------------------- P3: never from the KYC folder
  if (kit.pass.first) {
    const put = await kit.socket.ask("POST", "/data/_test/files/put", {
      folder_path: ["13 Directors' KYC"],
      title: "Walk director passport",
      name: "walk-director-passport.txt",
      base64: Buffer.from("Invented passport page for the walk.\n").toString("base64"),
      by: WALKER,
    });
    const kyc = (put.body.file as FileRow | undefined)?.file_id ?? "";
    const refused = await kit.socket.ask("POST", `/data/packs/${PACK}/items`, {
      file_ids: [kyc],
      by: WALKER,
    });
    await page.locator("summary", { hasText: "Add files" }).click();
    const offered = await page
      .locator('input[name="file_id"]')
      .evaluateAll((inputs) => inputs.map((input) => (input as HTMLInputElement).value));
    kit.check(
      "packs P3: a file from 13 Directors' KYC is refused with its sentence, and never offered",
      kyc !== "" &&
        refused.status === 409 &&
        (refused.body.error as { message?: string } | undefined)?.message === KYC_SENTENCE &&
        !offered.includes(kyc),
      refused.body,
    );
  }

  // ---------------------------------------------------------------- P4: Up renumbers, the version goes up one
  let before = await packOf(kit);
  const second = before.items[1];
  await open(page, kit, `/data/files/packs/${PACK}`, "#table-in-the-pack");
  await page.locator('button[aria-label="Move 2 up"]').click();
  const moved = await until(
    page,
    async () => (await packOf(kit)).pack.version === before.pack.version + 1,
  );
  await open(page, kit, `/data/files/packs/${PACK}`, "#table-in-the-pack");
  const firstRow = flat(await page.locator("#pack-item-1").innerText());
  const after = await packOf(kit);
  kit.check(
    "packs P4: Up on item 2 makes it number 1 and the version goes up by one",
    moved &&
      after.items[0]?.item_id === second?.item_id &&
      firstRow.startsWith(`1 ${second?.file?.title ?? "?"}`) &&
      after.pack.version === before.pack.version + 1,
    `${before.pack.version} → ${after.pack.version} · ${firstRow.slice(0, 60)}`,
  );

  // ---------------------------------------------------------------- P5: the zip
  const zip = await page.request.get(`${kit.base}/data/files/packs/${PACK}/zip`, {
    timeout: 120_000,
  });
  const bytes = await zip.body();
  const first = after.items[0]?.file;
  const detail = first
    ? ((await kit.socket.ask("GET", `/data/files/${first.file_id}`)).body.file as {
        current: string;
        versions: { version_id: string; sha256: string }[];
      })
    : null;
  const sha = detail?.versions.find((version) => version.version_id === detail.current)?.sha256;
  const manifestLine = first ? `${sha}  ${entryName(1, first.title, first.original_name)}` : "?";
  const body = bytes.toString("latin1");
  kit.check(
    "packs P5: Download the zip gives a zip attachment with the index, the manifest and item 1's line",
    zip.status() === 200 &&
      (zip.headers()["content-type"] ?? "").startsWith("application/zip") &&
      (zip.headers()["content-disposition"] ?? "").startsWith("attachment") &&
      body.startsWith("PK") &&
      body.includes("00 Index.txt") &&
      body.includes("manifest-sha256.txt") &&
      Boolean(sha) &&
      body.includes(manifestLine),
    `${zip.status()} ${zip.headers()["content-type"]} · ${manifestLine.slice(0, 90)}`,
  );

  // ---------------------------------------------------------------- P6: the index in Files
  await open(page, kit, `/data/files/packs/${PACK}`, "#table-in-the-pack");
  await page.locator("button", { hasText: "Save the index in Files" }).click();
  const saved = await until(page, async () =>
    flat(await kit.text()).includes(
      "Saved “Walk data room index” in 10 Fundraising and investors.",
    ),
  );
  const folders =
    ((await kit.socket.ask("GET", "/data/folders")).body.folders as
      { folder_id: string; default_key: string | null }[] | undefined) ?? [];
  const fundraising = folders.find((folder) => folder.default_key === "fundraising");
  await open(page, kit, `/data/files?folder=${fundraising?.folder_id ?? ""}`, ".hqdata-files");
  kit.check(
    "packs P6: Save the index in Files puts Walk data room index in 10 Fundraising and investors",
    saved && flat(await kit.text()).includes("Walk data room index"),
  );

  // ---------------------------------------------------------------- P7: a share, recorded
  before = await packOf(kit);
  await open(page, kit, `/data/files/packs/${PACK}`, "#table-in-the-pack");
  await page.locator("summary", { hasText: "Record a share" }).click();
  const shareForm = page.locator("form", { has: page.locator("#pack-share-to") });
  let firm = `Walk Fund 97${pass}`;
  if (before.firms && before.firms.length > 0) {
    const chosen = before.firms[pass % before.firms.length]!;
    await shareForm.locator("select#pack-share-firm").selectOption(chosen.investor_id);
    firm = chosen.firm;
  } else await shareForm.locator("input#pack-share-firm").fill(firm);
  await shareForm.locator("#pack-share-to").fill(`partner97${pass}@fund97${pass}.example`);
  await shareForm.locator("button", { hasText: "Record it" }).click();
  const recorded = await until(page, async () =>
    (await shareForm.innerText()).includes(`Recorded: ${firm}, version ${before.pack.version}.`),
  );
  await open(page, kit, `/data/files/packs/${PACK}`, "#table-shared");
  const shared = flat(await page.locator("#table-shared").innerText());
  const newest = (await packOf(kit)).shares[0];
  kit.check(
    "packs P7: Record a share lists it with the pack's version, and holds the same files",
    recorded &&
      shared.includes(firm) &&
      newest?.firm === firm &&
      newest.version === before.pack.version &&
      JSON.stringify(newest.files.map((file) => file.file_id)) ===
        JSON.stringify(before.items.map((item) => item.file?.file_id)),
    `${firm} v${newest?.version} · ${newest?.files.length} files`,
  );

  // ---------------------------------------------------------------- P8: the intern sees the role line only
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const intern = await other.newPage();
        await intern.goto(`${kit.base}/dev/signin?as=intern%40hq.test&next=%2Fdata`, {
          waitUntil: "networkidle",
        });
        const pages: string[] = [];
        for (const path of ["/data/files/packs", `/data/files/packs/${PACK}`]) {
          await intern.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
          pages.push(await intern.locator("main").first().innerText());
        }
        kit.check(
          "packs P8: as the intern, both pack pages say the role line, with no @",
          pages.every(
            (words) => words.includes("Data is for Owners and Admins.") && !words.includes("@"),
          ),
          pages.map((words) => words.slice(0, 80)),
        );
      } finally {
        await other.close();
      }
    }
  }
}
