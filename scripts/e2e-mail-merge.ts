/**
 * Mail merge end to end in a real browser, with nothing able to leave: invented people on
 * reserved `.example` domains, a stand-in provider, and a throwaway folder.
 *
 * Run it against a portal and a sender of its own, never the real ones. Someone may be
 * mid-send on those, and a press that reaches a stand-in looks like mail that went out.
 * So: a copy of this checkout with its own `.env.local` (HQ_MAIL_MERGE_SOCKET at a
 * throwaway socket), `npx next dev -p 3100` there, then
 *
 *     npx tsx scripts/e2e-mail-merge-sender.ts "$T/data" "$T/s.sock" "$T/outbox.jsonl" &
 *     HQ_UI_BASE=http://localhost:3100 npm run check:mail-merge -- "$T/outbox.jsonl"
 *
 * It walks what a person does: add a file, write the email, practise, give the key, test,
 * send, meet the day's limit, resume, download the record, read delivery back from the
 * (stand-in) provider, make a retry draft, pick a few people, type addresses in, edit one
 * person, and checks at each step what left and what did not, that no key came back to a
 * browser, at both widths and for every role.
 *
 * The delivery steps (MD1 to MD12, delivery spec §6.14) count the stand-in's mix for
 * "Email 1": 256 accepted, 237 delivered, 18 that did not arrive, 10 on the stop list.
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import AxeBuilder from "@axe-core/playwright";
import { chromium, type Page } from "playwright";

import { WALK_KEY } from "./mail-merge/e2e-provider";
import type { OutgoingMail } from "./mail-merge/provider";

const BASE = process.env.HQ_UI_BASE ?? "http://localhost:3000";
const SHOTS = "test-results/mail-merge";
const OUTBOX = process.argv[2];
if (!OUTBOX) {
  console.error("usage: e2e-mail-merge.ts <the stand-in sender's outbox file>");
  process.exit(1);
}
mkdirSync(SHOTS, { recursive: true });

const PEOPLE = 293;
const HELD = 37;
const SENDABLE = PEOPLE - HELD;
/** Of the 256 the stand-in provider "accepted" (delivery spec §5.6, "Email 1"). */
const DELIVERED = 237;
const DIDNT_ARRIVE = 18;
const STOPPED_BY_READ = 10;
const RETRY = 10;
/** The one sentence Mail merge's home says about what is not read; nothing else may say so. */
const NOT_READ_LINE =
  "Opens and clicks are not read: privacy features open mail by themselves, so they say nothing about interest.";

const BODY = `{Greeting}

{PersonalLine}

A short note about what we are building, in the words of a person.

Deck: [link]

Open to a 20-minute call next week?

A Founder
[Company postal address]
If this isn't a fit, reply "no" and I won't follow up.
`;

function theFile(): string {
  const rows = ["Email,Firm,Greeting,PersonalLine,Tier,Category,CheckFirst"];
  for (let index = 1; index <= PEOPLE; index += 1) {
    const check = index > SENDABLE ? "Possible conflict with a portfolio company" : "";
    rows.push(
      `partner${index}@fund${index}.example,Fund ${index},"Hi Fund ${index} team,",I'm writing because of your investment in Company ${index}.,${(index % 3) + 1},Venture,${check}`,
    );
  }
  return `${rows.join("\n")}\n`;
}

let failures = 0;
function check(ok: boolean, label: string, detail: unknown = ""): void {
  const said = detail === "" ? "" : ` — ${String(detail).slice(0, 220)}`;
  console.log(`${ok ? "  ✓" : "  ✗"} ${label}${said}`);
  if (!ok) failures += 1;
}

function sent(): OutgoingMail[] {
  if (!existsSync(OUTBOX!)) return [];
  return readFileSync(OUTBOX!, "utf8")
    .trim()
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as OutgoingMail);
}

async function audit(page: Page, name: string): Promise<void> {
  await page.evaluate(() => window.scrollTo(0, 0));
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  const axe = await new AxeBuilder({ page }).exclude(".mail-preview__frame").analyze();
  const bad = axe.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  check(
    overflow <= 1 && bad.length === 0,
    `${name}: no overflow, axe clean`,
    `${overflow}px ${bad.map((violation) => violation.id).join(" ")}`,
  );
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: true });
}

const says = (page: Page, words: string, timeout = 20_000) =>
  page.waitForFunction((text) => document.body.innerText.includes(text), words, { timeout });

const file = join(mkdtempSync(join(tmpdir(), "hq-merge-file-")), "investors.csv");
writeFileSync(file, theFile());

const browser = await chromium.launch();
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    acceptDownloads: true,
  });
  const page = await context.newPage();
  const errors: string[] = [];
  const leaked: string[] = [];
  const reasons: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 240));
  });
  page.on("pageerror", (error) => errors.push(`uncaught: ${String(error).slice(0, 240)}`));
  page.on("response", (response) => {
    response
      .text()
      .then((body) => {
        if (body.includes(WALK_KEY)) leaked.push(response.url());
        // A bounce's reason as the provider wrote it has the address in it; HQ's never has.
        if (/@fund\d+\.example.{0,12}user unknown/.test(body)) reasons.push(response.url());
      })
      .catch(() => undefined);
  });
  const text = () => page.locator("main").innerText();
  const saveWords = () => page.locator('[data-section="merge-words"] button[type=submit]').click();
  /** MD7: no page says anything about opens or clicks, but for the line that says they are not read. */
  const pagesWithOpens: string[] = [];
  const noOpens = async (name: string) => {
    const words = (await text()).replaceAll(NOT_READ_LINE, "");
    if (/opened|Opened|clicks/.test(words)) pagesWithOpens.push(name);
  };

  console.log("Home, nothing set up");
  await page.goto(`${BASE}/dev/signin?as=owner%40hq.test&next=%2Fmail%2Fmerge`, {
    waitUntil: "networkidle",
  });
  check((await text()).includes("Practice only until a provider key is added"), "practice only");
  await audit(page, "home-empty");

  console.log("Add the file");
  await page.locator("summary", { hasText: "Add a list" }).click();
  await page.setInputFiles("#merge-file", file);
  await page.fill("#merge-list-name", "Investors");
  await page.locator("button", { hasText: "Add this list" }).click();
  await page.waitForURL("**/mail/merge/lists/**", { timeout: 30_000 });
  await page.waitForSelector("table tbody tr");
  check((await text()).includes(`${PEOPLE} people added`), "every row is on the list");
  check((await text()).includes("{{personalline}}"), "its columns are offered as fields");
  const listUrl = page.url().split("?")[0]!;
  await audit(page, "list");

  console.log("Write the email");
  await page.goto(`${BASE}/mail/merge`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "New mailing" }).click();
  await page.fill("#merge-mailing-name", "Email 1");
  await page.locator("button", { hasText: "Start writing" }).click();
  await page.waitForURL("**/mail/merge/mailings/**", { timeout: 30_000 });
  const mailingUrl = page.url().split("?")[0]!;
  await page.waitForSelector("#merge-subject");
  await page.locator('input[name="list_ids"]').first().check();
  await page.fill("#merge-subject", "A note for {Firm}");
  await page.fill("#merge-body", BODY);
  await saveWords();
  await page.waitForSelector(".merge-insert__row", { timeout: 20_000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.selectOption("#merge-hold-column", "checkfirst");
  await saveWords();
  await says(page, "held back by checkfirst");
  let words = await text();
  check(words.includes(`${HELD} people are held back`), "the rows to check are held back");
  check(words.includes(`${SENDABLE} people will be written to`), "the rest will be written to");
  check(words.includes("Fill in [link] and [Company postal address]"), "the blanks are caught");
  check(!words.includes("Nothing says how to stop"), "its opt-out line is recognised");
  await page.locator("#merge-subject").focus();
  await page.evaluate(() =>
    (document.getElementById("merge-subject") as HTMLInputElement).setSelectionRange(0, 0),
  );
  await page.locator(".merge-field--button", { hasText: "{{tier}}" }).click();
  check((await page.inputValue("#merge-subject")).startsWith("{{tier}}"), "a field goes in");
  const first = await page.frameLocator(".mail-preview__frame").locator("body").innerText();
  check(first.startsWith("Hi Fund 1 team,") && !first.includes("{"), "made out to the first");
  await page.locator("a", { hasText: "Next person" }).click();
  await page.waitForURL("**preview=1**");
  await says(page, "person 2 of");
  await page.goto(mailingUrl, { waitUntil: "networkidle" });
  await audit(page, "mailing-draft");

  console.log("Practise");
  const realSend = page.locator("button", { hasText: `Send to ${SENDABLE} people` });
  check(await realSend.isDisabled(), "a real send is shut");
  check(
    await page.locator("button", { hasText: "Send me a test" }).isDisabled(),
    "a test needs a key",
  );
  await page.locator("button", { hasText: "Practise this send" }).click();
  await says(page, "That was practice", 90_000);
  check(sent().length === 0, "the provider was handed nothing", sent().length);
  check((await page.locator("#merge-subject").count()) === 1, "the words can still change");

  console.log("Setup");
  await page.goto(`${BASE}/mail/merge/setup`, { waitUntil: "networkidle" });
  await audit(page, "setup-empty");
  const paste = async (key: string, answer: string) => {
    await page.fill("#merge-key", key);
    await page.locator("button", { hasText: /save the key|Replace the key/ }).click();
    await says(page, answer);
  };
  await paste("xsmtpsib-the-wrong-kind", "That is the SMTP key");
  await page.waitForTimeout(400);
  await paste("xkeysib-wrong-0000", "did not accept that key");
  await page.waitForTimeout(400);
  await paste(WALK_KEY, "The provider accepted the key");
  await page.reload({ waitUntil: "networkidle" });
  words = await text();
  check(
    words.includes(`Ends in ${WALK_KEY.slice(-4)}`) && !words.includes(WALK_KEY),
    "only the key's last four are shown",
  );
  await page.fill("#merge-from-name", "A Founder");
  await page.fill("#merge-from-email", "founder@quantify.example");
  await page.locator("button", { hasText: /^Save$/ }).click();
  await says(page, "Verified");
  await page.reload({ waitUntil: "networkidle" });
  await audit(page, "setup-ready");

  console.log("Fill the blanks, test, send");
  await page.goto(mailingUrl, { waitUntil: "networkidle" });
  await page.fill(
    "#merge-body",
    BODY.replace("[link]", "https://example.com/deck").replace(
      "[Company postal address]",
      "1 Example Street",
    ),
  );
  await saveWords();
  await says(page, "No blanks are left");
  await page.locator("button", { hasText: "Send me a test" }).click();
  await says(page, "A test of this wording went to");
  check(sent()[0]?.subject.startsWith("[Test] ") === true, "the test is marked as a test");
  await page.waitForTimeout(500);
  const open = await page.locator(".check--block").allInnerTexts();
  check(open.length === 0, "every check is done", open.join(" | "));
  await page.fill("#merge-confirm", "12");
  await realSend.click();
  await says(page, "that is how many people this goes to");
  await page.waitForTimeout(400);
  check(sent().length === 1, "the wrong count sends nothing");
  await page.fill("#merge-confirm", String(SENDABLE));
  await realSend.click();
  await says(page, "Today's limit of 30 is reached", 90_000);
  const mails = sent().slice(1);
  check(mails.length === 29, "it stopped at the day's limit, the test counted", mails.length);
  check(
    mails.every((mail) => /^Hi Fund \d+ team,/.test(mail.text) && !/[{[]/.test(mail.text)),
    "every message is made out, no field or blank left",
  );
  check(new Set(mails.map((mail) => mail.text)).size === mails.length, "each is its own");
  check(
    mails.every((mail) => mail.headers["List-Unsubscribe"]?.includes("mailto:founder@")),
    "each carries a way to stop",
  );
  await page.waitForTimeout(500);
  await audit(page, "mailing-paused");
  await page.locator("button", { hasText: "Resume" }).click();
  await says(page, "Today's limit is reached. Resume tomorrow");

  console.log("Raise the limit and finish");
  await page.goto(`${BASE}/mail/merge/setup`, { waitUntil: "networkidle" });
  await page.fill("#merge-cap", "300");
  await page.locator("button", { hasText: /^Save$/ }).click();
  await says(page, "Saved.");
  await page.goto(mailingUrl, { waitUntil: "networkidle" });
  await page.locator("button", { hasText: "Resume" }).click();
  for (let tries = 0; tries < 60 && sent().length < SENDABLE + 1; tries += 1)
    await page.waitForTimeout(1_000);
  await page.waitForTimeout(1_500);
  await page.reload({ waitUntil: "networkidle" });
  const all = sent().slice(1);
  check(all.length === SENDABLE, "everyone went", all.length);
  check(new Set(all.map((mail) => mail.to_email)).size === SENDABLE, "nobody got two");
  check((await page.locator("#merge-subject").count()) === 0, "its words are now fixed");
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("a", { hasText: "Download as a CSV" }).click(),
  ]);
  const lines = readFileSync(await download.path(), "utf8")
    .trim()
    .split("\n");
  check(lines.length === PEOPLE + 1, "the record accounts for everyone", lines.length);
  check(lines.filter((line) => line.includes(",skipped,")).length === HELD, "and who was held");
  await page.goto(`${mailingUrl}?state=skipped`, { waitUntil: "networkidle" });
  check((await text()).includes("Held back:"), "the left-out view gives the reasons");
  await audit(page, "mailing-finished");

  console.log("Finding someone in the record");
  const whoSection = page.locator('section[data-section="merge-recipients"]');
  const findFor = async (words: string) => {
    await whoSection.locator("#merge-record-find").fill(words);
    await Promise.all([
      page.waitForURL((url) => url.searchParams.get("find") === words),
      whoSection.locator("button", { hasText: "Find" }).click(),
    ]);
    await page.waitForLoadState("networkidle");
  };
  const whoRows = whoSection.locator("tbody tr");
  await page.goto(mailingUrl, { waitUntil: "networkidle" });
  // MF1
  await findFor("partner17@fund17.example");
  check(
    (await whoRows.count()) === 1 &&
      (await whoRows.first().innerText()).includes("partner17@fund17.example"),
    "MF1 the find box finds one address",
    await whoRows.count(),
  );
  check(
    (await whoSection.innerText()).includes(`1 of ${PEOPLE} matches`),
    "MF1 and says how many it looked through",
  );
  check(page.url().endsWith("#merge-recipients"), "MF1 the page stays at the record", page.url());
  // MF2: Fund 25 and Fund 250 to 259, whatever the capitals.
  await findFor("FUND 25");
  check((await whoRows.count()) === 11, "MF2 it finds a firm's people", await whoRows.count());
  // MF3: Fund 29 and Fund 290 to 293; the last four were held back.
  await findFor("fund 29");
  check((await whoRows.count()) === 5, "MF3 five match in all", await whoRows.count());
  await whoSection.locator("a", { hasText: "Left out" }).click();
  await page.waitForURL((url) => url.searchParams.get("state") === "skipped");
  await page.waitForLoadState("networkidle");
  check(
    (await whoRows.count()) === 4 &&
      (await whoSection.innerText()).includes(`4 of ${HELD} match`) &&
      (await whoSection.locator("#merge-record-find").inputValue()) === "fund 29",
    "MF3 a filter keeps what is looked for",
    await whoRows.count(),
  );
  await audit(page, "mailing-found");
  // MF4
  await findFor("nobody-of-that-name");
  check(
    (await whoSection.innerText()).includes("Nobody matches") &&
      (await whoSection.innerText()).includes("Nobody found"),
    "MF4 nobody found says so",
  );
  // MF5
  await whoSection.locator("a", { hasText: "Clear" }).click();
  await page.waitForURL((url) => !url.searchParams.has("find"));
  await page.waitForLoadState("networkidle");
  check(
    (await whoRows.count()) === HELD &&
      (await whoSection.locator("a", { hasText: "Clear" }).count()) === 0,
    "MF5 Clear shows everyone again, in the same filter",
    await whoRows.count(),
  );

  console.log("Delivery read back");
  const deliverySection = page.locator('section[data-section="merge-delivery"]');
  // A stat's label is drawn in capitals by CSS, so innerText reads it that way: compare in lower case.
  const statsOf = async (section = deliverySection) =>
    new Map(
      (await section.locator(".stat").allInnerTexts()).map((stat) => {
        const [label = "", value = ""] = stat.split("\n").map((part) => part.trim());
        return [label.toLowerCase(), value] as const;
      }),
    );
  await page.goto(mailingUrl, { waitUntil: "networkidle" });
  // MD1
  check(
    (await deliverySection.innerText()).includes("Not read yet"),
    "MD1 delivery is not read yet",
  );
  const runStat = (await page.locator(".stat").first().innerText()).replace(/\s+/g, " ");
  check(
    runStat.toLowerCase().startsWith(`accepted ${SENDABLE}`) && runStat.includes("by the provider"),
    "MD1 the run's first stat reads Accepted",
    runStat,
  );
  const recipients = page.locator('section[data-section="merge-recipients"] tbody tr');
  const firstRow = (await recipients.first().innerText()).replace(/\s+/g, " ");
  check(
    firstRow.includes("Accepted") &&
      firstRow.includes("Not read yet") &&
      !/\bSent\b/.test(firstRow),
    "MD1 a recipient's pill reads Accepted, and its delivery is not read yet",
    firstRow,
  );
  await noOpens("the mailing before the read");
  // MD2
  const outboxBeforeRead = sent().length;
  await deliverySection.locator("button", { hasText: "Check delivery now" }).click();
  await says(page, `${DELIVERED} of ${SENDABLE} delivered`, 60_000);
  check(true, `MD2 Check delivery now reads ${DELIVERED} of ${SENDABLE} delivered`);
  await page.goto(mailingUrl, { waitUntil: "networkidle" });
  // MD3
  const stats = await statsOf();
  const wanted: [string, number][] = [
    ["Delivered", DELIVERED],
    ["Not delivered yet", 1],
    ["Hard bounces", 7],
    ["Soft bounces", 8],
    ["Blocked by the provider", 1],
    ["Not a working address", 1],
    ["Not sent by the provider", 1],
    ["Spam complaints", 1],
    ["Unsubscribed", 1],
  ];
  check(
    wanted.every(([label, value]) => stats.get(label.toLowerCase()) === String(value)),
    "MD3 the nine delivery stats read as the mix says",
    [...stats].map(([label, value]) => `${label} ${value}`).join(" | "),
  );
  // MD4
  words = await deliverySection.innerText();
  check(
    words.includes("2.7 per cent") &&
      words.includes("0.42 per cent") &&
      words.includes("Gmail") &&
      words.includes("Yahoo") &&
      words.includes("Nothing has been paused") &&
      !words.includes("%"),
    "MD4 both warnings, in words, with Gmail and Yahoo named and nothing paused",
  );
  check(
    words.includes("Those addresses are on the stop list now.") &&
      words.includes("Gmail does not tell senders who complained"),
    "MD4 the warnings say what happens to the addresses, and that the complaint count is a floor",
  );
  check(
    (await page.locator(".pill", { hasText: /^Sent$/ }).count()) === 1 &&
      (await deliverySection.locator("button", { hasText: /Pause/ }).count()) === 0 &&
      !(await text()).includes("Paused"),
    "MD4 the mailing still reads Sent: a warning pauses nothing and offers no pause once it has gone",
  );
  check(sent().length === outboxBeforeRead, "MD4 reading delivery handed the provider nothing");
  // MD5
  const byPerson = page.locator("#table-delivery-by-person tbody tr");
  check(
    (await byPerson.count()) === DIDNT_ARRIVE,
    "MD5 Didn't arrive lists 18",
    await byPerson.count(),
  );
  const bounced = (
    await byPerson.filter({ hasText: "partner36@fund36.example" }).innerText()
  ).replace(/\s+/g, " ");
  check(
    bounced.includes("Hard bounce") &&
      bounced.includes("550 5.1.1 <[address]>: user unknown") &&
      bounced.includes("On the stop list since"),
    "MD5 a hard bounce: its reason without the address, and on the stop list",
    bounced,
  );
  check(
    !(await page.content()).includes("&lt;partner36@fund36.example&gt;") &&
      !(await text()).includes("<partner36@fund36.example>"),
    "MD5 the provider's own words for it are not on the page",
  );
  const soft = (await byPerson.filter({ hasText: "partner29@fund29.example" }).innerText()).replace(
    /\s+/g,
    " ",
  );
  check(
    soft.includes("Soft bounce") && soft.includes("Can be retried"),
    "MD5 a soft bounce can be retried",
    soft,
  );
  check(
    (await deliverySection.innerText()).includes(`Didn’t arrive ${DIDNT_ARRIVE}`) &&
      (await deliverySection.innerText()).includes(`For a retry ${RETRY}`) &&
      (await deliverySection.innerText()).includes(`Everyone ${SENDABLE}`),
    "MD5 the views carry their counts",
  );
  await noOpens("the mailing after the read");
  // MD11 (wide)
  await audit(page, "mailing-delivery");
  await page.goto(`${mailingUrl}?dview=all&doffset=200#merge-delivery`, {
    waitUntil: "networkidle",
  });
  check(
    (await byPerson.count()) === SENDABLE - 200 && (await text()).includes("Arrived"),
    "the Everyone view pages by its own keys",
    await byPerson.count(),
  );
  await noOpens("the mailing, everyone");
  // MD10
  const [record] = await Promise.all([
    page.waitForEvent("download"),
    page.locator("a", { hasText: "Download as a CSV" }).click(),
  ]);
  // The record's lines end with CRLF, as every CSV HQ hands out does.
  const recordLines = readFileSync(await record.path(), "utf8")
    .trim()
    .split(/\r?\n/);
  check(
    recordLines[0]!.endsWith(
      "email,name,list,state,reason,at,delivery,delivery_reason,delivery_at",
    ),
    "MD10 the record has the three delivery columns",
    recordLines[0],
  );
  const bouncedLine =
    recordLines.find((line) => line.startsWith("partner36@fund36.example,")) ?? "";
  check(
    bouncedLine.includes(",Hard bounce,") &&
      bouncedLine.includes("user unknown") &&
      !bouncedLine.includes("<partner36"),
    "MD10 the hard bounce's row reads Hard bounce",
    bouncedLine,
  );
  check(
    recordLines.length === PEOPLE + 1 &&
      recordLines.filter((line) => line.includes(",skipped,")).length === HELD,
    "MD10 the record still accounts for everyone",
  );
  // MD6
  await page.goto(`${BASE}/mail/merge/setup`, { waitUntil: "networkidle" });
  const stopRows = page.locator("#table-stop-list tbody tr");
  const stopOf = async (email: string) =>
    (await stopRows.filter({ hasText: email }).innerText()).replace(/\s+/g, " ");
  check(
    (await stopOf("partner36@fund36.example")).includes("Bounced Hard bounce · Email 1"),
    "MD6 the hard bounce is on the stop list, with why",
    await stopOf("partner36@fund36.example"),
  );
  check(
    (await stopOf("partner41@fund41.example")).includes("Asked to stop Marked as spam · Email 1"),
    "MD6 the spam complaint is on the stop list, with why",
    await stopOf("partner41@fund41.example"),
  );
  check(
    (await stopRows.filter({ hasText: "· Email 1" }).count()) === STOPPED_BY_READ &&
      (await text()).includes(`Stop list (${STOPPED_BY_READ})`),
    "MD6 ten read-back stops in all",
    await stopRows.count(),
  );
  check(
    (await text()).includes("Delivery read-back adds hard bounces, spam complaints, unsubscribes"),
    "MD6 Setup says where they come from",
  );
  await noOpens("Setup");
  // MD8
  await page.goto(mailingUrl, { waitUntil: "networkidle" });
  const outboxBeforeRetry = sent().length;
  check(
    (await deliverySection.innerText()).includes(
      `${RETRY} soft bounces, blocked or not sent can be tried once more.`,
    ),
    "MD8 ten can be tried once more",
  );
  await deliverySection.locator("button", { hasText: "Make a retry mailing for these" }).click();
  await page.waitForURL((url) => !mailingUrl.endsWith(url.pathname), { timeout: 30_000 });
  await says(page, `People you pick (${RETRY} ticked)`);
  words = await text();
  check(
    (await page.locator("h1").innerText()).includes("Email 1 (retry)") &&
      (await page.locator(".pill", { hasText: /^Draft$/ }).count()) >= 1,
    "MD8 the browser lands on the retry, a draft",
  );
  check(
    !(await page.locator('input[name="skip_written"]').isChecked()),
    "MD8 leaving out anyone another mailing reached is unticked",
  );
  check(
    words.includes(
      `${RETRY} people were already written to by "Email 1", and will be written to again`,
    ) && words.includes("Send yourself a test of this wording"),
    "MD8 the retry says who it writes to again, and still wants its own test",
  );
  check(sent().length === outboxBeforeRetry, "MD8 making the retry sent nothing");
  await noOpens("the retry draft");
  // MD9
  await page.goto(`${BASE}/mail/merge`, { waitUntil: "networkidle" });
  const homeDelivery = page.locator('section[data-section="merge-delivery-home"]');
  words = await homeDelivery.innerText();
  check(
    words.includes(`Last 7 days: ${DELIVERED} of ${SENDABLE} delivered`) &&
      words.includes(`${DIDNT_ARRIVE} didn’t arrive`) &&
      words.includes("Delivery last read"),
    "MD9 Mail merge's home has the week's delivery",
    words.slice(0, 200),
  );
  check(
    (await homeDelivery.locator(".callout").count()) === 2 &&
      words.includes("in the last 7 days: 0.42 per cent") &&
      words.includes("in the last 7 days: 2.7 per cent") &&
      words.includes("Most of them: Email 1 (7)") &&
      words.includes("Most of them: Email 1 (1)"),
    "MD9 both of the week's warnings, and which mailing they come from",
  );
  check(
    !words.includes("would go on the stop list") && !words.includes("Apply to the stop list"),
    "MD9 nothing waits for a press: it all happened after the key was set",
  );
  const mailingsTable = page.locator('section[data-section="merge-mailings"]');
  // Column heads are drawn in capitals by CSS; "Email 1 (retry)" is the newer row, so match the title exactly.
  const heads = (await mailingsTable.locator("thead th").allInnerTexts()).map((head) =>
    head.trim().toLowerCase(),
  );
  const sentRow = (
    await mailingsTable
      .locator("tbody tr")
      .filter({ has: page.locator("a.table-title", { hasText: /^Email 1$/ }) })
      .first()
      .innerText()
  ).replace(/\s+/g, " ");
  check(
    heads.includes("accepted") && heads.includes("delivered") && !heads.includes("sent"),
    "MD9 the mailings table has Accepted and Delivered",
    heads.join(" | "),
  );
  check(
    sentRow.includes(`${DELIVERED} of ${SENDABLE}`) && sentRow.includes("Warning"),
    "MD9 the mailing's row reads its delivered count, with a warning",
    sentRow,
  );
  check(
    (await mailingsTable.innerText()).includes("Accepted means the provider took the message."),
    "MD9 the table says what Accepted and Delivered mean",
  );
  check(
    (await homeDelivery.innerText()).includes(NOT_READ_LINE),
    "MD9 the home says opens are not read",
  );
  await noOpens("Mail merge's home");
  await audit(page, "home-delivery");

  console.log("A copy, and the stop list");
  await page.goto(mailingUrl, { waitUntil: "networkidle" });
  await page.locator("button", { hasText: "Make a copy" }).click();
  // The read put ten of them on the stop list, and the stop list comes before "already written to".
  await says(page, `${SENDABLE - STOPPED_BY_READ} people were already written to by`);
  check(
    (await text()).includes(`${STOPPED_BY_READ} people are on the stop list and left out`),
    "the copy leaves out the ten the read stopped",
  );
  await page.goto(`${BASE}/mail/merge/setup`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Add addresses" }).click();
  await page.fill("#merge-stop-emails", "stop.me@example.org nonsense");
  await page.locator("button", { hasText: "Add to the stop list" }).click();
  await says(page, "1 added");
  await page.locator("button", { hasText: "Bring in the provider's" }).click();
  await says(page, "bounced@walk.invalid");
  await audit(page, "setup-stops");

  console.log("Only the people picked, and addresses typed in");
  await page.goto(`${BASE}/mail/merge`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "New mailing" }).click();
  await page.fill("#merge-mailing-name", "A few people");
  await page.locator("button", { hasText: "Start writing" }).click();
  await page.waitForURL("**/mail/merge/mailings/**", { timeout: 30_000 });
  const pickedUrl = page.url().split("?")[0]!;
  await page.waitForSelector("#merge-subject");
  await page.locator('input[name="list_ids"]').first().check();
  await page.fill("#merge-subject", "A note for {Firm}");
  await page.fill(
    "#merge-body",
    `{Greeting}\n\n{PersonalLine}\n\nIf this isn't a fit, reply "no" and I won't follow up.`,
  );
  await saveWords();
  await page.waitForSelector(".merge-insert__row", { timeout: 20_000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.selectOption("#merge-who", "picked");
  await page.selectOption("#merge-hold-column", "checkfirst");
  await saveWords();
  await says(page, "People you pick (0 ticked)");
  check((await text()).includes("Pick the people it goes to"), "it waits for someone to be ticked");
  await audit(page, "picker-empty");
  await page.locator("button", { hasText: "Tick everyone" }).first().click();
  await says(page, "0 picked.");
  check(true, "ticking everyone skips the held and those already written to");
  const held = SENDABLE + 4;
  await page.fill("#merge-people-search", `Fund ${held}`);
  await page
    .locator("button", { hasText: /^Find$/ })
    .first()
    .click();
  await page.waitForURL(`**q=Fund**`, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  const box = page.getByLabel(`Send to partner${held}@fund${held}.example`);
  await box.waitFor({ timeout: 20_000 });
  await box.click();
  await says(page, "People you pick (1 ticked)");
  check(await box.isChecked(), "a held person ticked by name stays ticked");
  await page.locator("summary", { hasText: "Add addresses by hand" }).click();
  await page.fill(
    "#merge-add-emails",
    "custom.one@angel.example, custom.two@angel.example nonsense",
  );
  await page.fill("#merge-add-firm", "Angel");
  await page.fill("#merge-add-greeting", "Hi friend,");
  await page.fill("#merge-add-personalline", "We met at the meetup.");
  await page.locator("button", { hasText: "Add to this mailing" }).click();
  await says(page, "2 added");
  words = await text();
  check(words.includes("not addresses: nonsense"), "what is not an address is named");
  await page.goto(pickedUrl, { waitUntil: "networkidle" });
  await says(page, "People you pick (3 ticked)");
  check((await text()).includes("3 people will be written to"), "three will be written to");
  await audit(page, "picker-ticked");
  await page.locator("a", { hasText: "Edit this person" }).click();
  await page.waitForURL("**edit=**", { timeout: 20_000 });
  await page.waitForSelector("#merge-edit-personalline");
  await page.fill("#merge-edit-personalline", "A line rewritten by hand for this one person.");
  await page.locator("button", { hasText: "Save this person" }).click();
  await says(page, "Saved. Drafts use this");
  await audit(page, "edit-person");
  await page.locator("a", { hasText: /^Done$/ }).click();
  await page.waitForURL(pickedUrl, { timeout: 20_000 });
  await page.waitForLoadState("networkidle");
  const rewritten = await page.frameLocator(".mail-preview__frame").locator("body").innerText();
  check(rewritten.includes("rewritten by hand"), "the person's own words are in their message");
  await page.locator("button", { hasText: "Make a copy" }).click();
  await says(page, "A few people (copy)");
  const copyUrl = page.url().split("?")[0]!;
  await page.goto(pickedUrl, { waitUntil: "networkidle" });
  const before = sent().length;
  await page.locator("button", { hasText: "Send me a test" }).click();
  await says(page, "A test of this wording went to");
  await page.fill("#merge-confirm", "3");
  await page.locator("button", { hasText: "Send to 3 people" }).click();
  for (let tries = 0; tries < 30 && sent().length < before + 4; tries += 1)
    await page.waitForTimeout(500);
  const chosen = sent()
    .slice(before + 1)
    .map((mail) => mail.to_email)
    .sort();
  check(
    chosen.join() ===
      [
        "custom.one@angel.example",
        "custom.two@angel.example",
        `partner${held}@fund${held}.example`,
      ].join(),
    "only the three chosen were written to",
    chosen.join(" "),
  );
  const custom = sent().find((mail) => mail.to_email === "custom.one@angel.example");
  check(
    custom?.subject === "A note for Angel" && custom.text.startsWith("Hi friend,"),
    "a typed-in address gets the words typed for it",
    custom?.subject,
  );
  const person = sent().find((mail) => mail.to_email.startsWith(`partner${held}@`));
  check(person?.text.includes("rewritten by hand") === true, "the edited person got their words");

  console.log("Find a mailing");
  const mailingRows = page.locator('section[data-section="merge-mailings"] tbody tr');
  await page.goto(`${BASE}/mail/merge?q=few+copy`, { waitUntil: "networkidle" });
  check(
    (await mailingRows.count()) === 1 &&
      (await mailingRows.first().innerText()).includes("A few people (copy)"),
    "every word must match: two words find the one mailing they name",
    await mailingRows.count(),
  );
  await page.goto(`${BASE}/mail/merge?q=1`, { waitUntil: "networkidle" });
  const byNumber = await page.locator('section[data-section="merge-mailings"] tbody').innerText();
  check(
    byNumber.includes("Email 1") && !byNumber.includes("A few people"),
    "a number finds the mailing with that number",
  );
  await page.goto(`${BASE}/mail/merge?q=nothing-is-called-this`, { waitUntil: "networkidle" });
  check((await text()).includes("Nothing matches"), "a search with no match says so");
  await page.goto(`${BASE}/mail/merge?show=drafts`, { waitUntil: "networkidle" });
  const drafts = await page.locator('section[data-section="merge-mailings"] tbody').innerText();
  check(!drafts.includes("Finished") && !drafts.includes("Sent"), "Drafts shows no sent mailing");
  await page.goto(`${BASE}/mail/merge`, { waitUntil: "networkidle" });
  await page.fill("#merge-find", "people");
  await page.press("#merge-find", "Enter");
  await page.waitForURL("**/mail/merge?q=people", { timeout: 30_000 });
  check(
    (await text()).includes("A few people") && (await text()).includes("match “people”"),
    "typing and Enter search the mailings",
  );
  await audit(page, "find");

  console.log("Phone");
  const phone = await browser.newContext({ viewport: { width: 412, height: 915 } });
  const small = await phone.newPage();
  await small.goto(`${BASE}/dev/signin?as=owner%40hq.test&next=%2Fmail%2Fmerge`, {
    waitUntil: "networkidle",
  });
  for (const [name, url] of [
    ["phone-home", `${BASE}/mail/merge`],
    ["phone-find", `${BASE}/mail/merge?q=people`],
    ["phone-setup", `${BASE}/mail/merge/setup`],
    ["phone-list", listUrl],
    ["phone-mailing", mailingUrl],
    ["phone-delivery", `${mailingUrl}?dview=all`],
    ["phone-picker", copyUrl],
  ] as const) {
    await small.goto(url, { waitUntil: "networkidle" });
    await audit(small, name);
  }
  await phone.close();

  console.log("Roles");
  for (const persona of ["admin", "sales", "support", "intern"]) {
    const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const person = await other.newPage();
    await person.goto(`${BASE}/dev/signin?as=${persona}%40hq.test&next=%2Fmail%2Fmerge`, {
      waitUntil: "networkidle",
    });
    const body = await person.locator("main").innerText();
    check(
      persona === "admin"
        ? body.includes("Mailings")
        : body.includes("Mail merge is for Owners and Admins") && !body.includes("@"),
      `${persona} sees what the role allows`,
    );
    await other.close();
  }

  check(errors.length === 0, "no console errors", errors.slice(0, 3).join(" | "));
  check(leaked.length === 0, "the key never came back", leaked.slice(0, 3).join(" "));
  check(
    pagesWithOpens.length === 0,
    "MD7 no page says anything of opens or clicks",
    pagesWithOpens.join(" | "),
  );
  check(
    reasons.length === 0,
    "MD12 no answer carried a provider's reason with an address in it",
    reasons.slice(0, 3).join(" "),
  );
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
