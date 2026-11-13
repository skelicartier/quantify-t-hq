/**
 * Files, walked (spec §5.1 F1–F16, and Share from addendum §4). The stand-in is seeded with
 * invented files at pinned ids, so the harness can open their pages; each pass then makes
 * its own folder and files (names and bytes carry the pass and a run mark, so a second run
 * against the same stand-in finds nothing already there).
 *
 * Every person and file here is invented; mail goes to the stand-in's outbox only.
 */

import { createHash, randomBytes } from "node:crypto";
import { rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";

import type { Page } from "playwright";

import {
  inventedCsv,
  inventedDocx,
  inventedHtml,
  inventedPdf,
  inventedPng,
  inventedSvg,
  inventedTxt,
  socketCall,
  textRead,
  uploadVia,
} from "../data/files/walk-seed";
import { WALKER, type Shot, type WalkKit } from "./kit";

/** The seeded files' ids: fixed, so the harness opens their pages without asking. */
export const FILES = {
  pdf: "f11e0000-0000-4000-8000-000000000001",
  image: "f11e0000-0000-4000-8000-000000000002",
  csv: "f11e0000-0000-4000-8000-000000000003",
  text: "f11e0000-0000-4000-8000-000000000004",
  html: "f11e0000-0000-4000-8000-000000000005",
  svg: "f11e0000-0000-4000-8000-000000000006",
} as const;

export const shots: Shot[] = [
  { name: "data-files", path: "/data/files", ready: ".hqdata-files" },
  { name: "data-files-trash", path: "/data/files?view=trash", ready: ".hqdata-files" },
  { name: "data-files-shared", path: "/data/files?view=shared", ready: ".hqdata-files" },
  { name: "data-file-pdf", path: `/data/files/${FILES.pdf}`, ready: "#file-preview" },
  { name: "data-file-csv", path: `/data/files/${FILES.csv}`, ready: "#file-preview" },
];

const CERTIFICATE_WORDS = [
  "Walk Fund Private Limited, an invented company for the walk.\nCertificate of incorporation, made up for testing.\nThe registered office is at 9 Invented Lane, Pune 411001.",
  "Directors: two invented people. Nothing on this page is real.",
];

type Folder = { folder_id: string; name: string; default_key: string | null; path: string };
type Row = { file_id: string; title: string; folder_id: string; current_n?: number };

async function folders(socketPath: string): Promise<Folder[]> {
  return (await socketCall(socketPath, "GET", "/data/folders")).body.folders as Folder[];
}

/** The invented files every pass can open: a certificate PDF, a logo, a lead CSV, notes, a page and a badge. */
export async function seed(socketPath: string): Promise<void> {
  const list = await folders(socketPath);
  const folder = (key: string) => list.find((item) => item.default_key === key)?.folder_id ?? "";
  const seeds: [keyof typeof FILES, string, Uint8Array, string][] = [
    ["pdf", "Walk certificate.pdf", await inventedPdf(CERTIFICATE_WORDS), folder("incorporation")],
    ["image", "Walk logo.png", inventedPng("seed", 160, 64), folder("brand")],
    ["csv", "Walk leads.csv", inventedCsv(250, "seed"), folder("leads")],
    ["text", "Walk notes.txt", inventedTxt("seed"), folder("inbox")],
    ["html", "statement.pdf", inventedHtml("seed"), folder("finance")],
    ["svg", "badge.svg", inventedSvg("seed"), folder("brand")],
  ];
  for (const [key, name, bytes, folder_id] of seeds) {
    const answer = await uploadVia(socketPath, {
      name,
      bytes,
      by: WALKER,
      folder_id,
      pin_file_id: FILES[key],
    });
    if (answer.status !== 200) throw new Error(`the files seed could not add ${name}`);
  }
  for (const id of [FILES.pdf, FILES.csv, FILES.text]) await textRead(socketPath, id, 30_000);
}

// ------------------------------------------------------------------ helpers

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const sha = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const toBase64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

async function open(page: Page, kit: WalkKit, path: string, ready: string): Promise<void> {
  await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(ready, { timeout: 30_000 });
}

async function waitFor(
  page: Page,
  check: () => Promise<boolean>,
  timeoutMs = 30_000,
): Promise<boolean> {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    if (await check()) return true;
    await page.waitForTimeout(150);
  }
  return false;
}

async function summary(page: Page): Promise<string> {
  const line = page.locator(".hqdata-tray__summary");
  return (await line.count()) > 0 ? flat(await line.first().innerText()) : "";
}

async function filesIn(kit: WalkKit, folderId: string): Promise<Row[]> {
  return (await kit.socket.ask("GET", `/data/files?folder=${folderId}`)).body.files as Row[];
}

/** A stored zip's entries by name (the zips Data makes are stored, never compressed). */
function readZip(bytes: Buffer): Map<string, Buffer> {
  const entries = new Map<string, Buffer>();
  let at = 0;
  while (at + 30 <= bytes.length && bytes.readUInt32LE(at) === 0x04034b50) {
    const size = bytes.readUInt32LE(at + 18);
    const nameLength = bytes.readUInt16LE(at + 26);
    const extra = bytes.readUInt16LE(at + 28);
    const name = bytes.subarray(at + 30, at + 30 + nameLength).toString("utf8");
    const start = at + 30 + nameLength + extra;
    entries.set(name, bytes.subarray(start, start + size));
    at = start + size;
  }
  return entries;
}

type DropItem = { name: string; type: string; data: string };

/** A drop, as the browser hands one over: a DataTransfer of files on the drop zone. */
async function drop(page: Page, items: DropItem[]): Promise<void> {
  await page.evaluate((files) => {
    const transfer = new DataTransfer();
    for (const item of files) {
      const bytes = Uint8Array.from(atob(item.data), (char) => char.charCodeAt(0));
      transfer.items.add(new File([bytes], item.name, { type: item.type }));
    }
    const zone = document.querySelector(".hqdata-drop");
    if (!zone) throw new Error("no drop zone");
    zone.dispatchEvent(
      new DragEvent("dragover", { dataTransfer: transfer, bubbles: true, cancelable: true }),
    );
    zone.dispatchEvent(
      new DragEvent("drop", { dataTransfer: transfer, bubbles: true, cancelable: true }),
    );
  }, items);
}

// ------------------------------------------------------------------ the walk

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  const desk = kit.pass.width === "desktop";
  const tag = `${kit.pass.width[0]}${kit.pass.theme[0]}-${Date.now().toString(36)}`;
  const list = await folders(kit.socket.path);

  // ---- F14: the fourteen default folders; an empty one shows its hint
  await open(page, kit, "/data/files", ".hqdata-files");
  const defaults = list.filter((folder) => folder.default_key);
  kit.check(
    "F14: the fourteen default folders exist, KYC last",
    defaults.length === 14 && defaults.at(-1)?.name === "13 Directors' KYC",
    defaults.map((folder) => folder.name).join(" | "),
  );
  if (desk) {
    const navNames = await page.locator(".hqdata-folders__name").allInnerTexts();
    kit.check(
      "F14: the folder column lists them in number order",
      defaults.every((folder, index) => navNames.indexOf(folder.name) >= index),
      navNames.slice(0, 15).join(" | "),
    );
  }
  const mca = list.find((folder) => folder.default_key === "mca")!;
  await open(page, kit, `/data/files?folder=${mca.folder_id}`, ".hqdata-files");
  let text = flat(await kit.text());
  kit.check(
    "F14: an empty default folder shows its hint",
    text.includes("AOC-4, MGT-7A, ADT-1, DIR-3 KYC, DPT-3 and every form filed"),
    text.slice(0, 200),
  );
  const refusedDefault = await kit.socket.ask("POST", `/data/folders/${mca.folder_id}/delete`, {
    by: WALKER,
  });
  kit.check(
    "F14: deleting a default folder is refused with its sentence",
    refusedDefault.status === 409 &&
      (refusedDefault.body.error as { message?: string } | undefined)?.message ===
        "The folders Data starts with cannot be deleted. Rename it instead.",
    refusedDefault.body,
  );

  // ---- F16 (phone): the folder column is a select labelled Folder
  if (!desk) {
    kit.check(
      "F16: on a phone the folder list is a select labelled Folder",
      (await page.locator(".hqdata-folder-select select").isVisible()) &&
        !(await page.locator(".hqdata-folders").isVisible()) &&
        (await page.getByLabel("Folder", { exact: true }).count()) === 1,
    );
    const inbox = list.find((folder) => folder.default_key === "inbox")!;
    await page.locator(".hqdata-folder-select select").selectOption(inbox.folder_id);
    kit.check(
      "F16: choosing a folder in the select opens it",
      await waitFor(page, async () => page.url().includes(`folder=${inbox.folder_id}`)),
      page.url(),
    );
    await page.waitForLoadState("networkidle");
    await kit.audit("files-phone-folder");
  }

  // ---- F1: a drop of twelve invented files
  const made = await kit.socket.ask("POST", "/data/folders", {
    name: `Walk drop ${tag}`,
    parent_id: null,
    by: WALKER,
  });
  const dropFolder = made.body.folder as Folder;
  await open(page, kit, `/data/files?folder=${dropFolder.folder_id}`, ".hqdata-drop");
  const png1 = inventedPng(`${tag}-1`);
  const twelve: { name: string; type: string; bytes: Uint8Array }[] = [
    {
      name: `walk-${tag}-1.pdf`,
      type: "application/pdf",
      bytes: await inventedPdf([`First paper ${tag}`]),
    },
    {
      name: `walk-${tag}-2.pdf`,
      type: "application/pdf",
      bytes: await inventedPdf([`Second paper ${tag}`]),
    },
    {
      name: `walk-${tag}-3.pdf`,
      type: "application/pdf",
      bytes: await inventedPdf([`Third paper ${tag}`]),
    },
    { name: `walk-${tag}-1.png`, type: "image/png", bytes: png1 },
    { name: `walk-${tag}-2.png`, type: "image/png", bytes: inventedPng(`${tag}-2`) },
    { name: `walk-${tag}-people.csv`, type: "text/csv", bytes: inventedCsv(12, `${tag}a`) },
    { name: `walk-${tag}-firms.csv`, type: "text/csv", bytes: inventedCsv(7, `${tag}b`) },
    { name: `walk-${tag}-notes.txt`, type: "text/plain", bytes: inventedTxt(tag) },
    { name: `walk-${tag}-plan.docx`, type: "application/octet-stream", bytes: inventedDocx(tag) },
    { name: `walk-${tag}-page.html`, type: "text/html", bytes: inventedHtml(tag) },
    {
      name: ".DS_Store",
      type: "application/octet-stream",
      bytes: new TextEncoder().encode(`Bud1 ${tag}`),
    },
    { name: `walk-${tag}-empty.txt`, type: "text/plain", bytes: new Uint8Array() },
  ];
  if (desk)
    await drop(
      page,
      twelve.map((file) => ({ name: file.name, type: file.type, data: toBase64(file.bytes) })),
    );
  else
    await page.setInputFiles(
      "#hqdata-pick-files",
      twelve.map((file) => ({
        name: file.name,
        mimeType: file.type,
        buffer: Buffer.from(file.bytes),
      })),
    );
  const f1 = "10 added · 1 empty, not added · 1 system file skipped";
  const f1Done = await waitFor(page, async () => (await summary(page)) === f1, 60_000);
  kit.check(
    `F1: ${desk ? "dropping" : "choosing"} 12 invented files says exactly “${f1}”`,
    f1Done,
    await summary(page),
  );
  const rowsText = (await page.locator(".hqdata-tray__row").allInnerTexts()).map(flat);
  kit.check(
    "F1: the empty file says how to fetch it from iCloud Drive",
    rowsText.some((row) =>
      row.includes(
        "Empty: not added. If it is in iCloud Drive, open it in Finder so it downloads, then add it again.",
      ),
    ),
    rowsText.join(" | ").slice(0, 300),
  );
  kit.check(
    "F1: each sent file shows its progress as a bar and a percentage",
    (await page.locator(".hqdata-tray progress").count()) === 11 &&
      rowsText.filter((row) => row.includes("100%")).length === 10,
  );
  await waitFor(
    page,
    async () => (await page.locator("#table-files tbody tr").count()) === 10,
    20_000,
  );
  kit.check(
    "F1: the folder lists the ten files after the page refreshes",
    (await page.locator("#table-files tbody tr").count()) === 10,
    await page.locator("#table-files tbody tr").count(),
  );
  await kit.audit("files-dropped");

  // ---- F4: the same bytes again, then "Add it anyway"
  await page.setInputFiles("#hqdata-pick-files", [
    { name: `walk-${tag}-1 copy.png`, mimeType: "image/png", buffer: Buffer.from(png1) },
  ]);
  const duplicate = `Already here as “walk-${tag}-1.png” in Walk drop ${tag}. Not added again.`;
  kit.check(
    "F4: the same bytes again say they are already here",
    (await waitFor(page, async () => (await summary(page)) === "1 already here", 30_000)) &&
      flat(await page.locator(".hqdata-tray__row").first().innerText()).includes(duplicate),
    flat(await page.locator(".hqdata-tray").innerText()).slice(0, 240),
  );
  await page.getByRole("button", { name: "Add it anyway" }).click();
  kit.check(
    "F4: “Add it anyway” keeps both",
    (await waitFor(page, async () => (await summary(page)) === "1 added")) &&
      (await waitFor(page, async () =>
        (await filesIn(kit, dropFolder.folder_id)).some(
          (row) => row.title === `walk-${tag}-1 copy.png`,
        ),
      )),
  );

  // ---- F5: the same name with other bytes asks the three choices
  const v2 = await inventedPdf([`First paper ${tag}, second version`]);
  await page.setInputFiles("#hqdata-pick-files", [
    { name: `walk-${tag}-1.pdf`, mimeType: "application/pdf", buffer: Buffer.from(v2) },
  ]);
  await waitFor(page, async () => (await summary(page)) === "1 waiting for a choice", 30_000);
  kit.check(
    "F5: the same name with other bytes asks: new version, keep both, or skip",
    (await page.getByRole("button", { name: "Add as a new version" }).count()) === 1 &&
      (await page.getByRole("button", { name: "Keep both" }).count()) === 1 &&
      (await page.getByRole("button", { name: "Skip" }).count()) === 1 &&
      flat(await page.locator(".hqdata-tray__row").first().innerText()).includes(
        `A file named “walk-${tag}-1.pdf” is already in this folder.`,
      ),
  );
  await kit.audit("files-name-taken");
  await page.getByRole("button", { name: "Add as a new version" }).click();
  kit.check(
    "F5: “Add as a new version” adds version 2",
    await waitFor(page, async () =>
      flat(await page.locator(".hqdata-tray__row").first().innerText()).includes(
        `Added as version 2 of “walk-${tag}-1.pdf”.`,
      ),
    ),
  );
  const pdfRow = (await filesIn(kit, dropFolder.folder_id)).find(
    (row) => row.title === `walk-${tag}-1.pdf`,
  )!;
  await open(page, kit, `/data/files/${pdfRow.file_id}`, "#file-versions");
  text = flat(await kit.text());
  const versionsRows = page.locator("#table-versions tbody tr");
  kit.check(
    "F5: version 2 is current and version 1 is still listed",
    text.includes("2 of 2") && (await versionsRows.count()) === 2,
    text.slice(0, 200),
  );
  const v1Fingerprint =
    (await versionsRows.nth(1).locator(".hqdata-fingerprint").getAttribute("title")) ?? "";
  const v1 = await page.request.get(`${kit.base}/data/files/${pdfRow.file_id}/download?version=1`);
  kit.check(
    "F5: version 1 downloads with its own fingerprint",
    v1.status() === 200 && sha(await v1.body()) === v1Fingerprint && v1Fingerprint !== sha(v2),
    `${v1.status()} ${v1Fingerprint.slice(0, 12)}`,
  );

  // ---- F6: "Make this current" on version 1; version 2 stays
  await page.getByRole("button", { name: "Make version 1 current" }).click();
  kit.check(
    "F6: making version 1 current keeps version 2",
    await waitFor(page, async () => {
      const now = flat(await kit.text());
      return (
        now.includes("1 of 2") && (await page.locator("#table-versions tbody tr").count()) === 2
      );
    }),
  );

  // ---- F10: rename, move, tags, notes, star and review date each save and write a line
  const notes = (await filesIn(kit, dropFolder.folder_id)).find(
    (row) => row.title === `walk-${tag}-notes.txt`,
  )!;
  await open(page, kit, `/data/files/${notes.file_id}`, "#file-activity");
  const edit = async (
    label: string,
    fill: (selector: string) => Promise<void>,
    selector: string,
  ) => {
    await page.getByRole("button", { name: `Edit ${label}`, exact: true }).click();
    await fill(selector);
    await page.getByRole("button", { name: `Save ${label}`, exact: true }).click();
    // This field's own "Saved", once the editor has closed on the new value.
    const prop = page.locator(".prop", {
      has: page.locator("dt", { hasText: new RegExp(`^${label}$`) }),
    });
    await prop.locator(".prop__saved").waitFor({ timeout: 15_000 });
    await page.waitForLoadState("networkidle");
  };
  await edit(
    "Name",
    (selector) => page.fill(selector, `Walk renamed ${tag}.txt`),
    "#inline-file_id-title",
  );
  await edit("Tags", (selector) => page.fill(selector, "walk, invented"), "#inline-file_id-tags");
  await edit(
    "Notes",
    (selector) => page.fill(selector, "Invented notes for the walk."),
    "#inline-file_id-notes",
  );
  const review = new Date(Date.now() + 20 * 86_400_000).toISOString().slice(0, 10);
  await edit("Review by", (selector) => page.fill(selector, review), "#inline-file_id-review_by");
  const brand = list.find((folder) => folder.default_key === "brand")!;
  await edit(
    "Folder",
    async (selector) => {
      await page.selectOption(selector, brand.folder_id);
    },
    "#inline-file_id-folder_id",
  );
  await page.getByRole("button", { name: `Star Walk renamed ${tag}.txt` }).click();
  await waitFor(
    page,
    async () =>
      (await page.getByRole("button", { name: `Unstar Walk renamed ${tag}.txt` }).count()) === 1,
  );
  await page.reload({ waitUntil: "networkidle" });
  const activity = flat(await page.locator('[data-section="file-activity"]').innerText());
  const verbs = [
    `Renamed from “walk-${tag}-notes.txt”`,
    "Tags changed",
    "Notes changed",
    "Review date set",
    `Moved from Walk drop ${tag}`,
    "Starred",
  ];
  for (const verb of verbs)
    kit.check(
      `F10: “${verb}” is in the activity with who and when`,
      activity.includes(verb),
      activity.slice(0, 160),
    );
  const lines = await page.locator('[data-section="file-activity"] li').allInnerTexts();
  kit.check(
    "F10: every activity line names who and when",
    lines.length >= 7 &&
      lines.every((line) => line.includes("The Owner")) &&
      (await page.locator('[data-section="file-activity"] li time').count()) === lines.length,
    lines.slice(0, 3).join(" | "),
  );
  await kit.audit("file-edited");

  // ---- F7, F8: the PDF in its frame (desk) or behind "Open the PDF" (phone); picture, CSV, text
  await open(page, kit, `/data/files/${FILES.pdf}`, "#file-preview");
  const frame = page.locator(".hqdata-preview__frame");
  const openPdf = page.getByRole("link", { name: "Open the PDF" });
  if (desk)
    kit.check(
      "F7: at desk width the PDF shows in its frame",
      (await frame.isVisible()) && !(await openPdf.isVisible()),
    );
  else
    kit.check(
      "F7: at 412 the frame is hidden and “Open the PDF” shows",
      !(await frame.isVisible()) && (await openPdf.isVisible()),
    );
  text = flat(await kit.text());
  kit.check(
    "F7: the PDF's own words show under it",
    text.includes("Text in this PDF") &&
      text.includes("The registered office is at 9 Invented Lane"),
    text.slice(0, 200),
  );
  const view = await page.request.get(`${kit.base}/data/files/${FILES.pdf}/view`);
  const viewHeaders = view.headers();
  kit.check(
    "F7: the PDF's view is inline, framable by this portal only",
    view.status() === 200 &&
      viewHeaders["content-type"] === "application/pdf" &&
      /^inline; filename="Walk certificate\.pdf"; filename\*=UTF-8''Walk%20certificate\.pdf$/.test(
        viewHeaders["content-disposition"] ?? "",
      ) &&
      viewHeaders["x-frame-options"] === "SAMEORIGIN" &&
      (viewHeaders["content-security-policy"] ?? "").includes("frame-ancestors 'self'"),
    `${view.status()} ${viewHeaders["content-type"]} ${viewHeaders["content-disposition"]} ${viewHeaders["x-frame-options"]} ${viewHeaders["content-security-policy"]}`,
  );
  const pageHeaders = (await page.request.get(`${kit.base}/data/files/${FILES.pdf}`)).headers();
  kit.check(
    "F7: any other page still has frame-ancestors 'none'",
    (pageHeaders["content-security-policy"] ?? "").includes("frame-ancestors 'none'") &&
      pageHeaders["x-frame-options"] === "DENY",
    pageHeaders["content-security-policy"],
  );
  // Share (addendum §4): the form, the from line, the share-sheet line; one PDF sent by email.
  text = flat(await kit.text());
  kit.check(
    "Share: the file page offers Send by email from Mail merge's address",
    text.includes("Send by email") &&
      text.includes(
        "It goes from Walk Founder <founder@walk.example>, the address Mail merge sends from, and counts toward the provider’s daily limit.",
      ),
    text.slice(0, 120),
  );
  kit.check(
    "Share: where the browser has no share sheet for it, one line says how else",
    text.includes("To share it another way, download it and attach it to a message.") ||
      (await page.getByRole("button", { name: "Share…" }).count()) === 1,
  );
  await kit.audit("file-pdf");
  if (desk) {
    const to = `share.${tag.replace(/[^a-z0-9]/g, "")}@readers.example`;
    const before = kit.outbox().length;
    await page.fill('[data-section="file-send"] input[name="to"]', to);
    await page.getByRole("button", { name: "Send by email" }).click();
    const said = page.locator('[data-section="file-send"] .form-sent');
    await said.waitFor({ timeout: 30_000 });
    kit.check(
      "Share: sending says “Sent to {to} · {when}”",
      flat(await said.innerText()).startsWith(`Sent to ${to} · `) &&
        (await said.locator("time").count()) === 1,
      flat(await said.innerText()),
    );
    const mail = kit
      .outbox()
      .slice(before)
      .find((line) => line.to_email === to);
    const bytes = (await kit.socket.ask("GET", `/data/files/${FILES.pdf}`)).body.file as {
      versions: { sha256: string }[];
    };
    kit.check(
      "Share: the stand-in's outbox has the mail with the PDF attached",
      mail?.attachments?.length === 1 &&
        mail.attachments[0]?.name === "Walk certificate.pdf" &&
        sha(Buffer.from(mail.attachments[0].content, "base64")) === bytes.versions.at(-1)?.sha256 &&
        mail.subject === "Walk certificate.pdf" &&
        mail.text === "Please find Walk certificate.pdf attached.",
      mail
        ? {
            to: mail.to_email,
            subject: mail.subject,
            attachments: mail.attachments?.map((item) => item.name),
          }
        : "none",
    );
    await page.reload({ waitUntil: "networkidle" });
    kit.check(
      "Share: the file's activity says it was sent by email",
      flat(await page.locator('[data-section="file-activity"]').innerText()).includes(
        `Sent by email to ${to}`,
      ),
    );
    await open(page, kit, "/data/files?view=shared", ".hqdata-files");
    const firstShare = flat(await page.locator("#table-shared-by-me tbody tr").first().innerText());
    kit.check(
      "Share: “Shared by me” lists it, newest first, by email to the address",
      firstShare.includes("Walk certificate.pdf") &&
        firstShare.includes("By email") &&
        firstShare.includes(to) &&
        firstShare.includes("The Owner"),
      firstShare,
    );
  } else {
    await open(page, kit, "/data/files?view=shared", ".hqdata-files");
    text = flat(await kit.text());
    kit.check(
      "Share: “Shared by me” is a tab that lists what was shared",
      text.includes("Shared by me") &&
        ((await page.locator("#table-shared-by-me tbody tr").count()) > 0 ||
          text.includes("Nothing shared yet.")),
    );
  }
  await kit.audit("files-shared");

  await open(page, kit, `/data/files/${FILES.image}`, "#file-preview");
  const loaded = await page
    .locator("img.hqdata-preview__image")
    .evaluate((image: HTMLImageElement) => image.complete && image.naturalWidth > 0);
  kit.check("F8: a picture shows", loaded);
  await open(page, kit, `/data/files/${FILES.csv}`, "#file-preview");
  text = flat(await kit.text());
  kit.check(
    "F8: a CSV shows its first 200 rows with the exact count",
    text.includes("250 rows · 5 columns") &&
      (await page.locator("#table-preview tbody tr").count()) === 200,
    text.slice(0, 160),
  );
  await kit.audit("file-csv");
  await open(page, kit, `/data/files/${FILES.text}`, "#file-preview");
  const shownText = await page.locator(".hqdata-preview__scroll").innerText();
  kit.check(
    "F8: a text file with a script tag shows it as text",
    shownText.includes('<script>alert("not run")</script>') &&
      (await page.locator("main script").count()) === 0,
  );

  // ---- F9: HTML and SVG are never shown inline
  for (const [name, id] of [
    ["HTML", FILES.html],
    ["SVG", FILES.svg],
  ] as const) {
    const answer = await page.request.get(`${kit.base}/data/files/${id}/view`);
    kit.check(
      `F9: ${name} at /view is plain bytes as an attachment`,
      answer.status() === 200 &&
        answer.headers()["content-type"] === "application/octet-stream" &&
        (answer.headers()["content-disposition"] ?? "").startsWith("attachment;"),
      `${answer.headers()["content-type"]} ${answer.headers()["content-disposition"]}`,
    );
  }

  // ---- F11: words inside a PDF, not its name
  await open(
    page,
    kit,
    `/data/files?q=${encodeURIComponent("registered office")}`,
    ".hqdata-files",
  );
  text = flat(await kit.text());
  const first = flat(await page.locator("#table-files tbody tr").first().innerText());
  kit.check(
    "F11: searching “registered office” finds the PDF by its words, with a snippet",
    /\d+ files? match(es)? “registered office”/.test(text) &&
      first.includes("Walk certificate.pdf") &&
      first.includes("In the text: “") &&
      first.includes("registered office is at 9 Invented Lane"),
    first.slice(0, 200),
  );
  await kit.audit("files-search");

  // ---- Review due: the date set above, in "Next 30 days"
  await open(page, kit, "/data/files?view=review", ".hqdata-files");
  text = flat(await kit.text());
  kit.check(
    "Review due lists the file under Next 30 days",
    // Group headings are set in capitals by CSS, so innerText reads "NEXT 30 DAYS".
    /Next 30 days/i.test(text) && text.includes(`Walk renamed ${tag}.txt`),
    text.slice(0, 200),
  );

  // ---- F12: the trash
  const html = (await filesIn(kit, dropFolder.folder_id)).find(
    (row) => row.title === `walk-${tag}-page.html`,
  )!;
  await open(page, kit, `/data/files/${html.file_id}`, "#file-preview");
  await page.locator("summary", { hasText: "Move to the trash" }).click();
  await page.locator(".popover[open]").getByRole("button", { name: "Move to the trash" }).click();
  await page.getByText("In the trash since").waitFor({ timeout: 15_000 });
  await open(page, kit, "/data/files?view=trash", ".hqdata-files");
  const trashRow = page.locator("#table-trash tbody tr", { hasText: `walk-${tag}-page.html` });
  const trashText = flat(await trashRow.innerText());
  kit.check(
    "F12: the trash shows where it was, when and by whom",
    trashText.includes(`Walk drop ${tag}`) &&
      trashText.includes("by The Owner") &&
      (await trashRow.locator("time").count()) === 1,
    trashText,
  );
  await kit.audit("files-trash");
  await trashRow.getByRole("button", { name: `Restore walk-${tag}-page.html` }).click();
  kit.check(
    "F12: Restore puts it back in its folder",
    await waitFor(page, async () =>
      (await filesIn(kit, dropFolder.folder_id)).some((row) => row.file_id === html.file_id),
    ),
  );
  await kit.socket.ask("POST", `/data/files/${html.file_id}/trash`, { by: WALKER });
  await open(page, kit, "/data/files?view=trash", ".hqdata-files");
  const again = page.locator("#table-trash tbody tr", { hasText: `walk-${tag}-page.html` });
  await again.locator("summary", { hasText: "Delete forever" }).click();
  kit.check(
    "F12: Delete forever says what it does",
    flat(await again.locator(".popover[open]").innerText()).includes(
      `Delete “walk-${tag}-page.html” forever Its bytes are removed from this Mac unless another file has the same ones. This cannot be undone.`,
    ),
  );
  await again.locator(".popover[open]").getByRole("button", { name: "Delete forever" }).click();
  kit.check(
    "F12: Delete forever removes it",
    await waitFor(
      page,
      async () => (await kit.socket.ask("GET", `/data/files/${html.file_id}`)).status === 404,
    ),
  );
  const docx = (await filesIn(kit, dropFolder.folder_id)).find(
    (row) => row.title === `walk-${tag}-plan.docx`,
  )!;
  await kit.socket.ask("POST", `/data/files/${docx.file_id}/trash`, { by: WALKER });
  await open(page, kit, "/data/files?view=trash", ".hqdata-files");
  const inTrash = (
    (await kit.socket.ask("GET", "/data/files?view=trash")).body.counts as { trash: number }
  ).trash;
  await page.locator("summary", { hasText: "Empty the trash" }).click();
  await page.fill("#empty-trash-confirm", String(inTrash + 1));
  await page.getByRole("button", { name: "Delete them forever" }).click();
  const wrong = page.locator(".popover[open] [role=alert]");
  await wrong.waitFor({ timeout: 15_000 });
  kit.check(
    "F12: Empty the trash needs the typed count",
    flat(await wrong.innerText()) ===
      `Type ${inTrash} to delete ${inTrash} ${inTrash === 1 ? "file" : "files"} forever.`,
    flat(await wrong.innerText()),
  );
  await page.fill("#empty-trash-confirm", String(inTrash));
  await page.getByRole("button", { name: "Delete them forever" }).click();
  kit.check(
    "F12: with the count typed, the trash empties",
    await waitFor(
      page,
      async () =>
        ((await kit.socket.ask("GET", "/data/files?view=trash")).body.counts as { trash: number })
          .trash === 0,
    ),
  );

  // ---- F14: a folder of his own with a file in it cannot be deleted
  if (desk) {
    await open(page, kit, `/data/files?folder=${dropFolder.folder_id}`, ".hqdata-files");
    await page.locator("summary", { hasText: "More" }).click();
    await page.getByRole("button", { name: "Delete this folder" }).click();
    const refusal = page.locator(".popover[open] [role=alert]");
    await refusal.waitFor({ timeout: 15_000 });
    kit.check(
      "F14: deleting a folder with files in it is refused with its sentence",
      flat(await refusal.innerText()) ===
        "Only an empty folder can be deleted. Move its files and folders out first.",
      flat(await refusal.innerText()),
    );
    // The danger button just pressed is still under the pointer, part way through its hover.
    await page.mouse.move(0, 0);
    await page.waitForTimeout(400);
    await kit.audit("files-more");
  }

  // ---- F13: the folder zip holds the tree, index.csv and a manifest whose hashes match
  if (desk) {
    const zip = await page.request.get(`${kit.base}/data/files/zip?folder=${dropFolder.folder_id}`);
    const entries = readZip(await zip.body());
    const manifest = entries.get("manifest-sha256.txt")?.toString("utf8") ?? "";
    const lines = manifest.trim().split("\n").filter(Boolean);
    const matches = lines.every((line) => {
      const [hash, ...name] = line.split("  ");
      const entry = entries.get(name.join("  "));
      return entry !== undefined && sha(entry) === hash;
    });
    const index = entries.get("index.csv")?.toString("utf8") ?? "";
    kit.check(
      "F13: the folder zip unpacks to its tree, index.csv and a manifest that matches",
      zip.status() === 200 &&
        (zip.headers()["content-disposition"] ?? "").startsWith("attachment;") &&
        entries.has(`Walk drop ${tag}/walk-${tag}-1.pdf`) &&
        entries.has(`Walk drop ${tag}/walk-${tag}-1 copy.png`) &&
        index.startsWith("path,title,version,bytes,sha256,added on,added by") &&
        lines.length === entries.size - 1 &&
        matches,
      `${zip.status()} ${[...entries.keys()].slice(0, 4).join(" | ")} manifest ${lines.length}`,
    );
  }

  // ---- F2: a 60 MB file in 20 parts, the same bytes back (first pass only: it is big)
  if (kit.pass.first) {
    const big = randomBytes(60 * 1024 * 1024);
    const path = join(dirname(kit.socket.path), `walk-${tag}-60mb.bin`);
    writeFileSync(path, big);
    try {
      await open(page, kit, `/data/files?folder=${dropFolder.folder_id}`, ".hqdata-drop");
      await page.setInputFiles("#hqdata-pick-files", path);
      kit.check(
        "F2: a 60 MB file goes in, in parts, and says Added",
        await waitFor(page, async () => (await summary(page)) === "1 added", 180_000),
        await summary(page),
      );
      const row = (await filesIn(kit, dropFolder.folder_id)).find(
        (item) => item.title === `walk-${tag}-60mb.bin`,
      )!;
      const stored = (await kit.socket.ask("GET", `/data/files/${row.file_id}`)).body.file as {
        versions: { sha256: string; bytes: number }[];
      };
      const back = await page.request.get(`${kit.base}/data/files/${row.file_id}/download`, {
        timeout: 120_000,
      });
      const body = await back.body();
      kit.check(
        "F2: the stored SHA-256 is the source's and the download is byte-identical",
        stored.versions[0]?.sha256 === sha(big) &&
          body.length === big.length &&
          sha(body) === sha(big),
        `${stored.versions[0]?.sha256.slice(0, 12)} ${sha(big).slice(0, 12)} ${body.length}`,
      );
      await open(page, kit, `/data/files/${row.file_id}`, "#file-preview");
      kit.check(
        "Share: a file over 3 MB is too large to attach, and says so",
        flat(await kit.text()).includes(
          "This file is 60 MB, too large to attach. Download it and send it from your mail app.",
        ),
      );
    } finally {
      rmSync(path, { force: true });
    }
  }
}
