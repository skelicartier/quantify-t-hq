/**
 * All leads and Lead sources, walked in a real browser against the stand-in: the list and
 * its counts, one lead with what was sent exactly as the outbox has it, practice never
 * shown as sent, both downloads, a Mail merge list made from a view, the stop list (Mail
 * merge's own), a lead turning "Sent" within seconds of a send, and an edit that leaves
 * the Mail merge list as it was. Every person is invented, on `.example` domains.
 *
 * In a copy without Unit 2's files module, `seed()` finds `GET /data/folders` missing and
 * the Mail merge lists alone feed the index; the walk then says "sources: not walked
 * here". With Files present, the seed puts two invented lead files (66,000 leads) and a
 * held-back file in through the files service and adds them as sources.
 */

import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { request } from "node:http";
import { dirname, join } from "node:path";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

const leadIdOf = (email: string): string =>
  createHash("sha256").update(`lead:${email}`).digest("hex").slice(0, 32);

/** Someone the stand-in's live mailing wrote to ("Walk 01"), and someone only practised. */
const SENT_TO = "partner1@fund1.example";
const PRACTISED = "partner1@fund291.example";

export const shots: Shot[] = [
  { name: "data-leads", path: "/data/leads", ready: "#table-all-leads" },
  {
    name: "data-lead",
    path: `/data/leads/${leadIdOf(SENT_TO)}`,
    ready: '[data-section="lead-sent"]',
  },
  { name: "data-lead-sources", path: "/data/leads/sources", ready: "#table-lead-sources" },
];

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

/** Whether Unit 2's files module answers in this service (absent in Unit 3's copy). */
async function filesHere(socket: string): Promise<boolean> {
  const folders = await ask(socket, "GET", "/data/folders");
  return folders.status === 200;
}

export async function seed(socketPath: string): Promise<void> {
  if (!(await filesHere(socketPath))) {
    console.log("[walk] leads: no files module here, so the Mail merge lists alone feed All leads");
    return;
  }
  const seeded = await ask(socketPath, "POST", "/data/_test/leads/walk-seed", { by: WALKER });
  console.log(`[walk] leads: ${JSON.stringify(seeded.body)}`);
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const number = (value: number) => value.toLocaleString("en-GB");

type ListSummary = { id: string; name: string; people: number };

async function lists(kit: WalkKit): Promise<ListSummary[]> {
  return ((await kit.socket.ask("GET", "/lists")).body.lists as ListSummary[] | undefined) ?? [];
}

async function leadsPage(kit: WalkKit, query = ""): Promise<Record<string, unknown>> {
  return (await kit.socket.ask("GET", `/data/leads${query ? `?${query}` : ""}`)).body;
}

/** Wait until a background rebuild of the index is done. */
async function settled(kit: WalkKit, page: Page): Promise<void> {
  for (let tries = 0; tries < 100; tries += 1) {
    if ((await leadsPage(kit, "q=nobody-at-all")).reading === false) return;
    await page.waitForTimeout(200);
  }
}

function passIndex(kit: WalkKit): number {
  return (kit.pass.width === "phone" ? 2 : 0) + (kit.pass.theme === "light" ? 1 : 0);
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  const pass = passIndex(kit);
  const withFiles = await filesHere(kit.socket.path);
  await settled(kit, page);

  // ---------------------------------------------------------------- L1: the list
  const book = await leadsPage(kit);
  const total = Number(book.total);
  const started = Date.now();
  await page.goto(`${kit.base}/data/leads`, { waitUntil: "networkidle" });
  await page.waitForSelector("#table-all-leads", { timeout: 30_000 });
  const took = Date.now() - started;
  let text = flat(await kit.text());
  kit.check(
    `leads L1: page 1 shows 1–100 of ${number(total)}${withFiles ? " (66,000+)" : " (the 20 lists, no files here)"} in under 3 s`,
    text.includes(`1–100 of ${number(total)}`) &&
      took < 3_000 &&
      (withFiles ? total >= 66_000 : total >= 20 * 290),
    `${took} ms · ${text.slice(0, 160)}`,
  );
  const counts = (book.counts as { status: Record<string, number> }).status;
  kit.check(
    "leads: the status links carry the counts the service gives",
    text.includes(`Sent ${number(counts.sent ?? 0)}`) &&
      text.includes(`Not sent yet ${number(counts.not_sent ?? 0)}`),
    text.slice(0, 300),
  );
  kit.check(
    "leads: the readouts cover the whole book",
    /Leads/i.test(text) && /Written to/i.test(text) && /Held back/i.test(text),
  );
  kit.check(
    "leads: the 100 rows of page 1 are drawn",
    (await page.locator("#table-all-leads tbody tr").count()) === 100,
  );
  await kit.audit("leads");

  // ---------------------------------------------------------------- L6: practice is never sent
  const known = await lists(kit);
  const walk02 = known.find((list) => list.name.startsWith("Walk 02"));
  const practisedSent = await leadsPage(kit, `batch=${walk02?.id ?? "none"}&status=sent`);
  kit.check(
    "leads L6: the practice run's addresses never show as sent",
    walk02 !== undefined && Number(practisedSent.total) === 0,
    practisedSent.total,
  );
  await page.goto(`${kit.base}/data/leads/${leadIdOf(PRACTISED)}`, { waitUntil: "networkidle" });
  text = flat(await kit.text());
  kit.check(
    "leads L6: a practised lead's page says not sent and shows no message",
    text.includes("Not sent yet") && text.includes("Mail merge has not written to them"),
    text.slice(0, 200),
  );

  // ---------------------------------------------------------------- L5: what was sent
  await page.goto(`${kit.base}/data/leads/${leadIdOf(SENT_TO)}`, { waitUntil: "networkidle" });
  await page.waitForSelector('[data-section="lead-sent"]', { timeout: 30_000 });
  const handed = kit.outbox().find((mail) => mail.to_email === SENT_TO);
  const body = (await page.locator(".hqdata-mail__body").first().innerText()).trim();
  const subject = (await page.locator(".hqdata-mail__subject").first().innerText()).trim();
  kit.check(
    "leads L5: What was sent shows the subject and text exactly as in the outbox",
    Boolean(handed) && subject === handed!.subject && body === handed!.text.trim(),
    `${subject} | ${handed?.subject}`,
  );
  text = flat(await kit.text());
  kit.check(
    "leads: the lead's page names its list, its firm and its status",
    text.includes("Mail merge list “Walk 01 - India named 1 of 20”, row r1") &&
      text.includes("fund1.example") &&
      text.includes("Sent"),
    text.slice(0, 200),
  );
  await kit.audit("lead");

  // ---------------------------------------------------------------- L8, L9: the downloads
  const walk01 = known.find((list) => list.name.startsWith("Walk 01"));
  const view = await leadsPage(kit, `batch=${walk01?.id ?? "none"}`);
  const csv = await page.request.get(
    `${kit.base}/data/leads/export?view=this&batch=${walk01?.id ?? "none"}`,
  );
  // Read as bytes: the mark is the first three, and trimming text would drop it.
  const csvBytes = await csv.body();
  const csvLines = csvBytes.subarray(3).toString("utf8").trim().split("\r\n");
  kit.check(
    "leads L8: This view downloads the filtered total, with the header and a byte-order mark",
    csv.status() === 200 &&
      csvBytes.subarray(0, 3).toString("hex") === "efbbbf" &&
      csvLines[0]!.startsWith("email,name,first_name,last_name,title,company,firm_type") &&
      csvLines.length - 1 === Number(view.total) &&
      (csv.headers()["content-disposition"] ?? "").startsWith("attachment;"),
    `${csv.status()} ${csvLines.length - 1} of ${String(view.total)}`,
  );
  const ledger = join(dirname(kit.socket.path), "data", "data", "leads", "exports.jsonl");
  const ledgerLines = existsSync(ledger)
    ? readFileSync(ledger, "utf8").trim().split("\n").filter(Boolean)
    : [];
  const lastLine = ledgerLines.length
    ? (JSON.parse(ledgerLines[ledgerLines.length - 1]!) as { kind?: string; rows?: number })
    : null;
  kit.check(
    "leads L8: the export ledger has the line",
    lastLine?.kind === "this_view" && lastLine.rows === Number(view.total),
    lastLine,
  );
  if (kit.pass.first) {
    const tracker = await page.request.get(`${kit.base}/data/leads/export?view=tracker`);
    const trackerBytes = await tracker.body();
    const trackerText = trackerBytes.subarray(3).toString("utf8");
    kit.check(
      "leads L9: The old tracker has his header and his words",
      tracker.status() === 200 &&
        trackerBytes.subarray(0, 3).toString("hex") === "efbbbf" &&
        trackerText.startsWith(
          "status,sent_on,sent_in,batch,email,name,company,firm_type,country\r\n",
        ) &&
        trackerText.includes("Sent,") &&
        trackerText.includes("Not sent yet,"),
      trackerText.slice(0, 120),
    );
  }

  // ---------------------------------------------------------------- L11: the stop list
  const batch = known.find((list) =>
    list.name.startsWith(`Walk ${String(3 + pass).padStart(2, "0")}`),
  );
  const listNumber = 3 + pass;
  const stopping = `partner7@fund${(listNumber - 1) * 290 + 7}.example`;
  await page.goto(`${kit.base}/data/leads/${leadIdOf(stopping)}`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "More" }).click();
  await page.locator("button", { hasText: "Put on the stop list" }).click();
  // Once it works the form gives way to "Take off the stop list"; the banner stays.
  await kit.says("On the stop list since");
  const stops =
    ((await kit.socket.ask("GET", "/stops")).body.stops as { email: string; reason: string }[]) ??
    [];
  kit.check(
    "leads L11: Put on the stop list puts the address on Mail merge's stop list",
    stops.some((stop) => stop.email === stopping && stop.reason === "asked"),
    stopping,
  );
  const draft = await kit.socket.ask("POST", "/mailings", { name: `Walk stop check ${pass + 1}` });
  const draftId = String((draft.body.mailing as { id?: string } | undefined)?.id ?? "");
  await kit.socket.ask("POST", `/mailings/${draftId}/update`, { list_ids: [batch?.id ?? ""] });
  const people = await kit.socket.ask(
    "GET",
    `/mailings/${draftId}/people?q=${encodeURIComponent(stopping)}`,
  );
  const row = ((people.body.rows as { email: string; kind: string; reason: string }[]) ?? [])[0];
  kit.check(
    "leads L11: a mailing that includes it records On the stop list",
    row?.kind === "stopped" && row.reason === "On the stop list",
    row,
  );
  await page.reload({ waitUntil: "networkidle" });
  text = flat(await kit.text());
  kit.check(
    "leads L11: the lead reads Stopped, with the banner",
    text.includes("On the stop list since") && text.includes("Stopped"),
    text.slice(0, 200),
  );

  // ---------------------------------------------------------------- L10: a Mail merge list from a view
  await page.goto(`${kit.base}/data/leads?batch=${batch?.id ?? "none"}`, {
    waitUntil: "networkidle",
  });
  text = flat(await kit.text());
  kit.check(
    "leads L10: the view is the batch's 290",
    text.includes("of 290") || text.includes("1–100 of 290"),
    text.slice(0, 160),
  );
  const listName = `Walk view list ${pass + 1}`;
  await page.locator("summary", { hasText: "Make a Mail merge list" }).click();
  await page.fill("#list-name", listName);
  await page.locator("button", { hasText: "Make the list" }).click();
  await kit.says(`Made “${listName}” in Mail merge with 289 people.`);
  const made = (await lists(kit)).find((list) => list.name === listName);
  kit.check(
    "leads L10: the list is in Mail merge with the 289 not on the stop list",
    made?.people === 289,
    made,
  );
  await kit.audit("leads-list-made");
  if (kit.pass.first) {
    const tooMany = await kit.socket.ask("POST", "/data/leads/to-mail-merge", {
      by: WALKER,
      query: "",
      name: "Everyone",
    });
    kit.check(
      "leads L10: more than 5,000 is refused with the sentence",
      tooMany.status === 400 &&
        /a list made here holds 5,000\. Narrow it first\.$/.test(
          String((tooMany.body.error as { message?: string } | undefined)?.message),
        ),
      tooMany.body,
    );
  }

  // ---------------------------------------------------------------- sources
  await page.goto(`${kit.base}/data/leads/sources`, { waitUntil: "networkidle" });
  await page.waitForSelector("#table-lead-sources", { timeout: 30_000 });
  text = flat(await kit.text());
  kit.check(
    "sources: Mail merge lists are the first row, read on their own",
    /Mail merge lists \d+ lists · [\d,]+ rows · read/.test(text),
    text.slice(0, 200),
  );
  if (withFiles) {
    kit.check(
      "sources: the two lead files and the held-back file are read",
      text.includes("all_leads.csv") &&
        text.includes("new_leads.csv") &&
        text.includes("held_back.csv"),
      text.slice(0, 300),
    );
  } else if (kit.pass.first) {
    console.log("  sources: not walked here (no files module in this copy)");
    kit.check(
      "sources: the empty state says where lead files go",
      text.includes("No lead files yet"),
      text.slice(0, 200),
    );
  }
  await kit.audit("lead-sources");

  if (!kit.pass.first) return;

  // ---------------------------------------------------------------- L12: an edit stays in Data
  const editing = `partner2@fund${2 * 290 + 2}.example`;
  const before = await kit.socket.ask(
    "GET",
    `/lists/${known.find((list) => list.name.startsWith("Walk 03"))?.id ?? ""}?q=${encodeURIComponent(editing)}`,
  );
  await page.goto(`${kit.base}/data/leads/${leadIdOf(editing)}`, { waitUntil: "networkidle" });
  await page.locator('button[aria-label="Edit Title"]').click();
  const input = page.locator("#inline-lead_id-title");
  await input.fill("Head of research");
  await input.press("Enter");
  await page.waitForSelector(".prop__saved", { timeout: 20_000 });
  await page.reload({ waitUntil: "networkidle" });
  text = flat(await kit.text());
  const after = await kit.socket.ask(
    "GET",
    `/lists/${known.find((list) => list.name.startsWith("Walk 03"))?.id ?? ""}?q=${encodeURIComponent(editing)}`,
  );
  const rowBefore = ((before.body.rows as { values: Record<string, string> }[]) ?? [])[0];
  const rowAfter = ((after.body.rows as { values: Record<string, string> }[]) ?? [])[0];
  kit.check(
    "leads L12: an edit changes the lead and leaves the Mail merge list row as it was",
    text.includes("Head of research") &&
      text.includes("Title: Partner → Head of research") &&
      JSON.stringify(rowBefore) === JSON.stringify(rowAfter) &&
      rowAfter?.values.title === "Partner",
    `${rowAfter?.values.title}`,
  );

  // ---------------------------------------------------------------- L4: Sent within 10 s of a send
  const fresh = ["fresh1@walksend.example", "fresh2@walksend.example"];
  const imported = await kit.socket.ask("POST", "/lists/import", {
    name: "Walk send check",
    file_name: "walk-send-check.csv",
    text: `Email,First Name,Company\n${fresh[0]},Tara,Walk Send\n${fresh[1]},Dev,Walk Send\n`,
  });
  const sendList = String((imported.body.list as { id?: string } | undefined)?.id ?? "");
  await settled(kit, page);
  await page.goto(`${kit.base}/data/leads?q=${encodeURIComponent(fresh[0]!)}`, {
    waitUntil: "networkidle",
  });
  text = flat(await kit.text());
  kit.check(
    "leads L4: before the send the row reads Not sent yet",
    text.includes("Not sent yet On Walk send check"),
    text.slice(0, 300),
  );
  const mailing = await kit.socket.ask("POST", "/mailings", { name: "Walk live 02" });
  const mailingId = String((mailing.body.mailing as { id?: string } | undefined)?.id ?? "");
  await kit.socket.ask("POST", `/mailings/${mailingId}/update`, {
    subject: "A second note for {{company}}",
    body: "Hi {{first_name}},\n\nA second invented note.\n\nA Founder",
    list_ids: [sendList],
  });
  await kit.socket.ask("POST", `/mailings/${mailingId}/test`, { to: "founder@walk.example" });
  const start = await kit.socket.ask("POST", `/mailings/${mailingId}/start`, {
    practice: false,
    confirm: 2,
  });
  kit.check(
    "leads L4: the stand-in starts a live send to the two",
    start.status === 200,
    start.body,
  );
  let sentAt = 0;
  for (let tries = 0; tries < 100 && !sentAt; tries += 1) {
    if (kit.outbox().some((mail) => mail.to_email === fresh[0])) sentAt = Date.now();
    else await page.waitForTimeout(100);
  }
  let turned = 0;
  while (sentAt && Date.now() - sentAt < 10_000) {
    await page.goto(`${kit.base}/data/leads?q=${encodeURIComponent(fresh[0]!)}`, {
      waitUntil: "networkidle",
    });
    text = flat(await kit.text());
    if (text.includes("Walk live 02") && /Sent \d+ \w+ · Walk live 02/.test(text)) {
      turned = Date.now() - sentAt;
      break;
    }
    await page.waitForTimeout(500);
  }
  kit.check(
    "leads L4: within 10 s of the send the row turns Sent with the date and mailing, nothing restarted",
    sentAt > 0 && turned > 0 && turned < 10_000,
    `${turned} ms · ${text.slice(0, 200)}`,
  );
  for (let tries = 0; tries < 100; tries += 1) {
    const state = (await kit.socket.ask("GET", `/mailings/${mailingId}`)).body.mailing as
      { state?: string } | undefined;
    if (state?.state === "finished") break;
    await page.waitForTimeout(200);
  }
}
