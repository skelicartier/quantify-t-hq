/**
 * Trust packs, walked against the stand-in (delivery spec §7.10, T1–T7): the link from
 * Waitlist › Diligence (T1), the pinned "Walk trust pack" with its own checklist and what
 * is missing (T2), "For Labs too" adding the data lines (T3, first pass only, then off
 * again), a share recorded against a firm on the waitlist with nothing sent (T4), the zip
 * whose index says "trust pack" (T5), and a data-room pack reading as it always did (T6).
 * Every file and firm is invented, on `.example`.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-trust-packs", path: "/data/files/packs?kind=trust", ready: "#table-packs" },
  {
    name: "data-trust-pack",
    path: "/data/files/packs/walk-trust-pack",
    ready: "#table-in-the-pack",
  },
];

const PACK = "walk-trust-pack";
const ROOM = "walk-pack";
const NEEDED = [
  "Access control policy",
  "Incident response plan",
  "Data handling and privacy policy",
];
const EXPECTED = [
  "Business continuity and disaster recovery",
  "Penetration test report",
  "Insurance certificate",
  "Accounts or an accountant's letter",
];
const LABS = ["Data provenance", "Data dictionary", "Material non-public information policy"];
const REFERENCES = "References, with their consent";

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

/** The pinned "Walk trust pack": three invented files in folder 07. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/packs")).status !== 200) {
    console.log("[walk] trust: the files module is not loaded here");
    return;
  }
  const made = await ask(socketPath, "POST", "/data/_test/packs/seed-trust", { by: WALKER });
  console.log(`[walk] trust: ${made.status === 200 ? "Walk trust pack is ready" : made.status}`);
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

type PackPage = {
  pack: { version: number; name: string; kind: string; labs: boolean };
  items: { item_id: string; n: number }[];
  missing: string[];
  index_text: string;
  shares: { firm: string; version: number; entry_id: string | null }[];
  buyers: { entry_id: string; firm: string }[] | null;
};

const packOf = async (kit: WalkKit, id = PACK) =>
  (await kit.socket.ask("GET", `/data/packs/${id}`)).body as unknown as PackPage;

/** The checklist as the page draws it: each line's label and what its last cell says. */
const checklistOf = (page: Page): Promise<Record<string, string>> =>
  page.evaluate(() =>
    Object.fromEntries(
      [...document.querySelectorAll("#table-checklist tbody tr")].map((row) => [
        (row.children[0]?.textContent ?? "").trim(),
        (row.children[row.children.length - 1]?.textContent ?? "").trim(),
      ]),
    ),
  );

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", `/data/packs/${PACK}`)).status !== 200) {
    kit.check("trust: packs are not loaded in this service", true);
    return;
  }
  const pass = passIndex(kit);

  // ---------------------------------------------------------------- T1: from Waitlist › Diligence
  await open(page, kit, "/data/waitlist/diligence", ".hqdata-diligence");
  await page.locator('a[href="/data/files/packs?kind=trust"]', { hasText: "Trust packs" }).click();
  await page.waitForURL(/\/data\/files\/packs\?kind=trust$/, { timeout: 30_000 });
  await page.waitForSelector("#table-packs", { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  const text = flat(await page.locator("#table-packs").innerText());
  const heading = flat(await page.locator("h1").first().innerText());
  kit.check(
    "trust T1: Trust packs on Waitlist › Diligence leads to the trust packs, and only them",
    heading === "Trust packs" &&
      text.includes("Walk trust pack") &&
      !text.includes("Walk data room") &&
      /Trust pack/i.test(text),
    `${heading} · ${text.slice(0, 160)}`,
  );
  await kit.audit("trust-packs");

  // ---------------------------------------------------------------- T2: its own checklist
  await open(page, kit, `/data/files/packs/${PACK}`, "#table-in-the-pack");
  let lines = await checklistOf(page);
  const status = flat(await page.locator(".rhead__status").innerText());
  const items = await page.locator("#table-in-the-pack tbody tr").count();
  kit.check(
    "trust T2: the walk pack is a Trust pack with three files, missing the three needed policies and the expected lines, not References",
    /trust pack/i.test(status) &&
      items === 3 &&
      [...NEEDED, ...EXPECTED].every((label) => lines[label] === "Missing") &&
      lines[REFERENCES] === "When there is some" &&
      /^\d+\. Walk information security policy$/.test(lines["Information security policy"] ?? "") &&
      !(LABS[0]! in lines),
    Object.entries(lines).map(([label, said]) => `${label}: ${said}`),
  );
  await kit.audit("trust-pack");

  // ---------------------------------------------------------------- T3: For Labs too (once, then off again)
  if (kit.pass.first) {
    const before = await packOf(kit);
    const labsForm = page.locator("form", { has: page.locator("#pack-labs") });
    await page.locator("#pack-labs").check();
    await labsForm.locator("button", { hasText: "Save" }).click();
    const on = await until(page, async () => (await packOf(kit)).pack.labs === true);
    await open(page, kit, `/data/files/packs/${PACK}`, "#table-in-the-pack");
    lines = await checklistOf(page);
    const withLabs = await packOf(kit);
    const labsStatus = flat(await page.locator(".rhead__status").innerText());
    kit.check(
      "trust T3: For Labs too adds Data provenance, Data dictionary and the MNPI policy to what's missing",
      on &&
        LABS.every((label) => lines[label] === "Missing") &&
        LABS.every((label) => withLabs.missing.includes(label)) &&
        withLabs.pack.version === before.pack.version + 1 &&
        /for labs too/i.test(labsStatus),
      `${before.pack.version} → ${withLabs.pack.version} · ${LABS.map((label) => lines[label]).join(", ")}`,
    );
    await page.locator("#pack-labs").uncheck();
    await page
      .locator("form", { has: page.locator("#pack-labs") })
      .locator("button", { hasText: "Save" })
      .click();
    const off = await until(page, async () => (await packOf(kit)).pack.labs === false);
    kit.check("trust T3: and turning it off takes them away again", off);
  }

  // ---------------------------------------------------------------- T4: a share, to a firm on the waitlist
  const before = await packOf(kit);
  const sentBefore = kit.outbox().length;
  await open(page, kit, `/data/files/packs/${PACK}`, "#table-in-the-pack");
  await page.locator("summary", { hasText: "Record a share" }).click();
  const shareForm = page.locator("form", { has: page.locator("#pack-share-to") });
  const buyers = before.buyers ?? [];
  const buyer = buyers.length > 0 ? buyers[pass % buyers.length]! : null;
  const firm = buyer?.firm ?? `Walk Buyer 98${pass}`;
  if (buyer) await shareForm.locator("select#pack-share-buyer").selectOption(buyer.entry_id);
  else await shareForm.locator("input#pack-share-firm").fill(firm);
  const hint = flat(await shareForm.innerText());
  await shareForm.locator("#pack-share-to").fill(`cio98${pass}@buyer98${pass}.example`);
  await shareForm.locator("button", { hasText: "Record it" }).click();
  const recorded = await until(page, async () =>
    (await shareForm.innerText()).includes(`Recorded: ${firm}, version ${before.pack.version}.`),
  );
  await open(page, kit, `/data/files/packs/${PACK}`, "#table-shared");
  const shared = flat(await page.locator("#table-shared").innerText());
  const linked = buyer
    ? await page.locator(`#table-shared a[href="/data/waitlist/${buyer.entry_id}"]`).count()
    : 1;
  const newest = (await packOf(kit)).shares[0];
  kit.check(
    "trust T4: a share to a waitlist firm is in the share log with the firm linked, and nothing was sent",
    recorded &&
      shared.includes(firm) &&
      linked >= 1 &&
      newest?.firm === firm &&
      newest.version === before.pack.version &&
      (buyer ? newest.entry_id === buyer.entry_id : newest.entry_id === null) &&
      hint.includes("HQ sends nothing.") &&
      kit.outbox().length === sentBefore,
    `${firm} v${newest?.version} · outbox ${sentBefore} → ${kit.outbox().length}`,
  );

  // ---------------------------------------------------------------- T5: the zip's index says what it is
  const zip = await page.request.get(`${kit.base}/data/files/packs/${PACK}/zip`, {
    timeout: 120_000,
  });
  const body = (await zip.body()).toString("utf8");
  const now = await packOf(kit);
  const firstLine = now.index_text.split("\n")[0] ?? "";
  kit.check(
    "trust T5: the zip downloads with 00 Index.txt, whose first line says trust pack",
    zip.status() === 200 &&
      (zip.headers()["content-type"] ?? "").startsWith("application/zip") &&
      body.startsWith("PK") &&
      body.includes("00 Index.txt") &&
      firstLine.startsWith("Walk trust pack · trust pack · version ") &&
      body.includes(firstLine),
    `${zip.status()} · ${firstLine}`,
  );

  // ---------------------------------------------------------------- T6: a data-room pack is as it was
  const room = await kit.socket.ask("GET", `/data/packs/${ROOM}`);
  if (room.status === 200) {
    const roomPage = room.body as unknown as PackPage;
    await open(page, kit, `/data/files/packs/${ROOM}`, "#table-in-the-pack");
    const drawn = (await page.locator(".hqdata-pack__index").innerText()).split("\n")[0] ?? "";
    const roomLines = await checklistOf(page);
    kit.check(
      "trust T6: the data-room pack reads as before: its index's first line, and its own checklist",
      /^Walk data room · version \d+ · \d{1,2} [A-Z][a-z]{2} \d{4}$/.test(drawn) &&
        drawn === roomPage.index_text.split("\n")[0] &&
        roomPage.pack.kind === "data_room" &&
        "Pitch deck" in roomLines &&
        !("Access control policy" in roomLines) &&
        (await page.locator("#pack-labs").count()) === 0,
      drawn,
    );
  } else kit.check("trust T6: the raise walk's data-room pack is not here", true);
}
