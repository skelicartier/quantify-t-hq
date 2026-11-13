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
 * send, meet the day's limit, resume, download the record, pick a few people, type
 * addresses in, edit one person, and checks at each step what left and what did not, that
 * no key came back to a browser, at both widths and for every role.
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
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text().slice(0, 240));
  });
  page.on("pageerror", (error) => errors.push(`uncaught: ${String(error).slice(0, 240)}`));
  page.on("response", (response) => {
    response
      .text()
      .then((body) => {
        if (body.includes(WALK_KEY)) leaked.push(response.url());
      })
      .catch(() => undefined);
  });
  const text = () => page.locator("main").innerText();
  const saveWords = () => page.locator('[data-section="merge-words"] button[type=submit]').click();

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

  console.log("A copy, and the stop list");
  await page.goto(mailingUrl, { waitUntil: "networkidle" });
  await page.locator("button", { hasText: "Make a copy" }).click();
  await says(page, `${SENDABLE} people were already written to by`);
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
} finally {
  await browser.close();
}
console.log(failures ? `\n${failures} check(s) failed` : "\nall checks passed");
process.exit(failures ? 1 : 0);
