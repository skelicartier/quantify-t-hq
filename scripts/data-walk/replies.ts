/**
 * Replies, walked: recording each kind of answer through the form as a person would, and
 * what each one did, read back from the service and from Mail merge's own stop list. A Yes
 * needs the waitlist (Unit 4); until it exists the form says "The waitlist is not set up
 * here yet." and the lead stands as it was. Every person is invented, on `.example`.
 *
 * Raise batch (spec §7.10, R10–R15): the firm hold, a meeting request, needs review, the
 * booking link and the answer to copy, and releasing a firm. These use the invented firms
 * firm3100.example and up, one per step and pass, which no other walk uses (firm3000–3003
 * are the waitlist walk's; a firm numbered 19 mod 20 has only free-mail people).
 */

import { createHash } from "node:crypto";
import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

const leadIdOf = (email: string): string =>
  createHash("sha256").update(`lead:${email}`).digest("hex").slice(0, 32);

export const shots: Shot[] = [
  { name: "data-replies", path: "/data/replies", ready: ".hqdata-reply-form" },
];

function ask(
  socket: string,
  method: "GET" | "POST",
  path: string,
  body?: unknown,
): Promise<number> {
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
        response.resume();
        response.on("end", () => resolve(response.statusCode ?? 0));
      },
    );
    outgoing.on("error", reject);
    if (text) outgoing.write(text);
    outgoing.end();
  });
}

/** A few replies of every kind but Yes and No, for the pages to show from the start. */
export async function seed(socketPath: string): Promise<void> {
  await ask(socketPath, "POST", "/data/_test/replies/walk-seed", { by: WALKER });
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const pad = (value: number) => String(value).padStart(2, "0");

/** A calendar date plus whole days, with no zone involved. */
function addDays(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

function addWorkingDays(day: string, count: number): string {
  let current = day;
  let left = count;
  while (left > 0) {
    current = addDays(current, 1);
    const [year = 0, month = 1, date = 1] = current.split("-").map(Number);
    const weekday = new Date(Date.UTC(year, month - 1, date)).getUTCDay();
    if (weekday !== 0 && weekday !== 6) left -= 1;
  }
  return current;
}

/** Walk 01's people, every one of whom the stand-in's live mailing wrote to. */
const person = (index: number) => ({
  email: `partner${index}@fund${index}.example`,
  name: `Asha${index} Rao${index}`,
});

type FollowUp = {
  follow_up_id: string;
  email: string;
  title: string;
  due_on: string;
  kind: string;
  note: string;
  state: string;
};

async function followUps(kit: WalkKit): Promise<FollowUp[]> {
  return (
    ((await kit.socket.ask("GET", "/data/follow-ups?state=all")).body.follow_ups as FollowUp[]) ??
    []
  );
}

async function lead(kit: WalkKit, email: string): Promise<Record<string, unknown>> {
  return (
    ((await kit.socket.ask("GET", `/data/leads/${leadIdOf(email)}`)).body.lead as Record<
      string,
      unknown
    >) ?? {}
  );
}

/** Fill the Replies page's form and press one answer; returns the sentence the form says. */
async function record(
  page: Page,
  kit: WalkKit,
  input: { email: string; words: string; press: string; addIfMissing?: boolean },
  before?: (page: Page) => Promise<void>,
): Promise<string> {
  await page.goto(`${kit.base}/data/replies`, { waitUntil: "networkidle" });
  const form = page.locator(".hqdata-reply-form form");
  await form.locator('input[name="email"]').first().fill(input.email);
  await form.locator('textarea[name="words"]').fill(input.words);
  if (input.addIfMissing === false) await form.locator('input[name="add_if_missing"]').uncheck();
  if (before) await before(page);
  await form.getByRole("button", { name: input.press, exact: true }).click();
  const said = form.locator(".form-sent, .callout--danger");
  await said.first().waitFor({ timeout: 20_000 });
  return flat(await said.first().innerText());
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  const pass = (kit.pass.width === "phone" ? 2 : 0) + (kit.pass.theme === "light" ? 1 : 0);
  const day = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");

  await page.goto(`${kit.base}/data/replies`, { waitUntil: "networkidle" });
  await page.waitForSelector(".hqdata-reply-form", { timeout: 30_000 });
  let text = flat(await kit.text());
  kit.check(
    "replies: the page has the form, the readouts, the follow-ups and every reply",
    text.includes("Record a reply") &&
      /Recorded/i.test(text) &&
      text.includes("Follow-ups") &&
      text.includes("Every reply") &&
      text.includes("Answer Asha4 Rao4's question"),
    text.slice(0, 300),
  );
  await kit.audit("replies");

  // ---------------------------------------------------------------- R1: Yes
  const yes = person(10 + pass);
  const waitlist = Boolean(
    (await kit.socket.ask("POST", "/data/_test/need", { by: WALKER, name: "waitlist" })).body.found,
  );
  const statusBefore = String((await lead(kit, yes.email)).status);
  const yesSaid = await record(page, kit, {
    email: yes.email,
    words: "Yes, please add us. A call next week works.",
    press: "Record a yes: add the firm to the waitlist",
  });
  if (!waitlist) {
    kit.check(
      "replies R1 (until Unit 4): a Yes says the waitlist is not set up here yet, and the lead stands as it was",
      yesSaid === "The waitlist is not set up here yet." &&
        String((await lead(kit, yes.email)).status) === statusBefore,
      yesSaid,
    );
  } else {
    kit.check(
      "replies R1: a Yes puts the firm on the waitlist and the lead reads Said yes",
      yesSaid.startsWith(`Recorded: ${yes.name} said yes.`) &&
        yesSaid.includes("is on the waitlist") &&
        String((await lead(kit, yes.email)).status) === "yes",
      yesSaid,
    );
  }

  // ---------------------------------------------------------------- R2: No
  const no = person(20 + pass);
  const noSaid = await record(page, kit, {
    email: no.email,
    words: "Please take me off your list.",
    press: "Record a no: put them on the stop list",
  });
  const stops =
    ((await kit.socket.ask("GET", "/stops")).body.stops as { email: string; reason: string }[]) ??
    [];
  kit.check(
    "replies R2: a No puts the address on Mail merge's stop list as Asked to stop",
    noSaid ===
      `Recorded: ${no.name} said no. They are on the stop list and will not be written to again.` &&
      stops.some((stop) => stop.email === no.email && stop.reason === "asked"),
    noSaid,
  );
  const lists =
    ((await kit.socket.ask("GET", "/lists")).body.lists as { id: string; name: string }[]) ?? [];
  const walk01 = lists.find((list) => list.name.startsWith("Walk 01"));
  const check = await kit.socket.ask("POST", "/mailings", { name: `Walk reply check ${pass + 1}` });
  const checkId = String((check.body.mailing as { id?: string } | undefined)?.id ?? "");
  await kit.socket.ask("POST", `/mailings/${checkId}/update`, { list_ids: [walk01?.id ?? ""] });
  const skipped =
    ((await kit.socket.ask("GET", `/mailings/${checkId}/people?q=${encodeURIComponent(no.email)}`))
      .body.rows as { kind: string; reason: string }[]) ?? [];
  kit.check(
    "replies R2: a mailing then skips it, On the stop list",
    skipped[0]?.kind === "stopped" && skipped[0].reason === "On the stop list",
    skipped[0],
  );
  await page.goto(`${kit.base}/data/leads/${leadIdOf(no.email)}`, { waitUntil: "networkidle" });
  text = flat(await kit.text());
  kit.check("replies R2: the lead reads Said no", text.includes("Said no"), text.slice(0, 200));

  // ---------------------------------------------------------------- R7: take the No back
  await page.locator("summary", { hasText: "Take this back" }).click();
  text = flat(await kit.text());
  kit.check(
    "replies R7: the preview says what is undone",
    text.includes(`Take ${no.email} off the stop list`),
    text.slice(0, 300),
  );
  await page.locator("button", { hasText: "Take it back" }).click();
  // The popover goes with the reply's standing; the reply then says what was undone.
  await kit.says(`Undone: Took ${no.email} off the stop list.`);
  const after = ((await kit.socket.ask("GET", "/stops")).body.stops as { email: string }[]) ?? [];
  kit.check(
    "replies R7: taking back a No takes the address off the stop list, and says so",
    !after.some((stop) => stop.email === no.email),
  );
  await kit.audit("lead-taken-back");

  // ---------------------------------------------------------------- R3: Later, and out of office
  const later = person(30 + pass);
  const laterDay = addDays(day, 21);
  // "Later" only opens its fields; "Record: later" records.
  const laterSaid = await record(
    page,
    kit,
    { email: later.email, words: "Write again next month.", press: "Record: later" },
    async (open) => {
      await open
        .locator(".hqdata-reply-form form")
        .getByRole("button", { name: "Later", exact: true })
        .click();
      await open.locator('input[name="later_until"]').fill(laterDay);
    },
  );
  const items = await followUps(kit);
  kit.check(
    "replies R3: Later with a date makes a follow-up on that date",
    laterSaid.startsWith("Recorded: later. A reminder is set for") &&
      items.some(
        (item) =>
          item.email === later.email && item.due_on === laterDay && item.kind === "write_again",
      ),
    laterSaid,
  );
  const plain = person(35 + pass);
  await record(
    page,
    kit,
    { email: plain.email, words: "Not now.", press: "Record: later" },
    async (open) => {
      await open
        .locator(".hqdata-reply-form form")
        .getByRole("button", { name: "Later", exact: true })
        .click();
      await open.locator('input[name="later_until"]').fill("");
    },
  );
  kit.check(
    "replies R3: without one, the follow-up is on today + 14 days",
    (await followUps(kit)).some(
      (item) => item.email === plain.email && item.due_on === addDays(day, 14),
    ),
  );
  const ooo = person(40 + pass);
  const overviewBefore = (await kit.socket.ask("GET", "/data/overview")).body.replies as
    { today?: number } | undefined;
  const oooSaid = await record(
    page,
    kit,
    { email: ooo.email, words: "I am away until next week.", press: "Record: later" },
    async (open) => {
      await open
        .locator(".hqdata-reply-form form")
        .getByRole("button", { name: "Later", exact: true })
        .click();
      await open.locator('input[name="later_until"]').fill(addDays(day, 5));
      await open.locator('input[name="auto_reply"]').check();
    },
  );
  const overviewAfter = (await kit.socket.ask("GET", "/data/overview")).body.replies as
    { today?: number } | undefined;
  kit.check(
    "replies R3: out of office is counted apart from human replies",
    oooSaid.startsWith("Recorded: out of office until") &&
      overviewAfter?.today === overviewBefore?.today,
    oooSaid,
  );

  // ---------------------------------------------------------------- R4: Wrong person
  const wrong = person(50 + pass);
  const named = {
    name: `Rhea Walk${pass}`,
    email: `named${pass}@fund${50 + pass}.example`,
    title: "Head of research",
  };
  const wrongSaid = await record(
    page,
    kit,
    { email: wrong.email, words: "Write to my colleague instead.", press: "Record: wrong person" },
    async (open) => {
      const form = open.locator(".hqdata-reply-form form");
      await form.getByRole("button", { name: "Wrong person", exact: true }).click();
      const group = form.getByRole("group", { name: "Who they named" });
      await group.getByLabel("Name").fill(named.name);
      await group.getByLabel("Their address").fill(named.email);
      await group.getByLabel("Their title").fill(named.title);
    },
  );
  const namedLead = await lead(kit, named.email);
  kit.check(
    "replies R4: Wrong person with an address adds a lead tagged Referral, firm fields copied, a follow-up in 2 working days",
    wrongSaid.startsWith(`Recorded: wrong person. ${named.name} is added as a lead`) &&
      (namedLead.tags as string[] | undefined)?.includes("Referral") === true &&
      namedLead.company === `Walk Fund ${50 + pass}` &&
      (await followUps(kit)).some(
        (item) =>
          item.email === named.email &&
          item.due_on === addWorkingDays(day, 2) &&
          item.kind === "write_to_named",
      ),
    wrongSaid,
  );

  // ---------------------------------------------------------------- R5: Question
  const question = person(60 + pass);
  const words = `Does it cover unlisted companies? (${pass + 1})`;
  const questionSaid = await record(page, kit, { email: question.email, words, press: "Question" });
  kit.check(
    "replies R5: a Question makes a follow-up due today, carrying the words",
    questionSaid === "Recorded: a question. It is on today's follow-ups." &&
      (await followUps(kit)).some(
        (item) =>
          item.email === question.email &&
          item.due_on === day &&
          item.kind === "answer" &&
          item.note === words,
      ),
    questionSaid,
  );

  // ---------------------------------------------------------------- R6: someone not a lead yet
  const stranger = `stranger${pass}@unknown${pass}.example`;
  const refused = await record(page, kit, {
    email: stranger,
    words: "Who are you?",
    press: "Question",
    addIfMissing: false,
  });
  kit.check(
    "replies R6: unticked, an unknown address is refused with the sentence",
    refused ===
      "No lead has that address. Tick “If they are not a lead yet, add them” to record it.",
    refused,
  );
  const added = await record(page, kit, {
    email: stranger,
    words: "Who are you?",
    press: "Question",
  });
  kit.check(
    "replies R6: ticked, it records and adds a lead",
    added === "Recorded: a question. It is on today's follow-ups." &&
      String((await lead(kit, stranger)).status) === "question",
    added,
  );

  // The page, with what was just recorded.
  await page.goto(`${kit.base}/data/replies`, { waitUntil: "networkidle" });
  text = flat(await kit.text());
  kit.check(
    "replies: the follow-ups list what was just recorded",
    text.includes(`Answer ${question.name}'s question`) &&
      text.includes(`Write to ${named.name}, named by ${wrong.name}`),
    text.slice(0, 400),
  );
  await kit.audit("replies-recorded");

  await raiseSteps(page, kit, pass, day);
}

// ---------------------------------------------------------------- raise batch: R10–R15

type LeadLine = {
  lead_id: string;
  email: string;
  name: string;
  status: string;
  badges?: string[];
};

/** The invented firm a step uses in this pass: sixteen people, none written to, none free mail. */
const firmOf = (step: number, pass: number) => `firm${3100 + step * 10 + pass}.example`;

async function leadsAt(kit: WalkKit, domain: string): Promise<LeadLine[]> {
  return (
    ((await kit.socket.ask("GET", `/data/leads?domain=${encodeURIComponent(domain)}`)).body
      .leads as LeadLine[]) ?? []
  );
}

async function stopList(kit: WalkKit): Promise<Map<string, string>> {
  const stops =
    ((await kit.socket.ask("GET", "/stops")).body.stops as { email: string; reason: string }[]) ??
    [];
  return new Map(stops.map((stop) => [stop.email, stop.reason]));
}

/** Wait for a condition the service decides, a quarter second at a time. */
async function until(page: Page, condition: () => Promise<boolean>, ms = 20_000) {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    if (await condition()) return true;
    await page.waitForTimeout(250);
  }
  return false;
}

async function raiseSteps(page: Page, kit: WalkKit, pass: number, day: string): Promise<void> {
  const holdBox = (open: Page) =>
    open.locator(".hqdata-reply-form form").getByLabel("Hold the rest of their firm");

  // ---------------------------------------------------------------- R10: meeting request, firm held
  const firm10 = firmOf(0, pass);
  const at10 = await leadsAt(kit, firm10);
  const asker = at10[0]!;
  const before10 = await stopList(kit);
  const others = at10.filter((item) => item.email !== asker.email && !before10.has(item.email));
  const meetingSaid = await record(
    page,
    kit,
    {
      email: asker.email,
      words: "Could we meet next week? Tuesday works.",
      press: "Record a meeting request: they asked to meet",
    },
    async (open) => {
      kit.check("replies R10: the hold box is there and ticked", await holdBox(open).isChecked());
    },
  );
  const after10 = await stopList(kit);
  kit.check(
    "replies R10: a meeting request with the box ticked says asked to meet and holds the rest of the firm",
    meetingSaid.includes(`${asker.name} asked to meet`) &&
      others.length > 0 &&
      meetingSaid.includes(`${others.length} other addresses at ${firm10} are held`) &&
      others.every((item) => after10.get(item.email) === "manual") &&
      !after10.has(asker.email),
    { said: meetingSaid, others: others.length },
  );
  await page.goto(`${kit.base}/data/leads/${others[0]!.lead_id}`, { waitUntil: "networkidle" });
  let text = flat(await kit.text());
  kit.check(
    "replies R10: a held colleague's lead reads Held back, someone at the firm replied",
    text.includes("Held back") && /someone at the firm replied/i.test(text),
    text.slice(0, 300),
  );
  await kit.audit("lead-firm-held");

  // ---------------------------------------------------------------- R11: needs review
  const firm11 = firmOf(1, pass);
  const unsure = (await leadsAt(kit, firm11))[0]!;
  const reviewSaid = await record(page, kit, {
    email: unsure.email,
    words: "Interesting. Let me see who here would look at it.",
    press: "Record that it needs review: decide what it means later",
  });
  const reviewItem = (await followUps(kit)).find(
    (item) => item.email === unsure.email && item.kind === "review",
  );
  kit.check(
    "replies R11: needs review leaves a follow-up for today to decide what it means",
    reviewSaid ===
      "Recorded: it needs review. A follow-up for today asks you to decide what it means." &&
      reviewItem?.due_on === day &&
      reviewItem.title === `Decide what ${unsure.name}'s reply means` &&
      reviewItem.state === "open",
    reviewSaid,
  );
  await page.goto(`${kit.base}/data/leads/${unsure.lead_id}`, { waitUntil: "networkidle" });
  text = flat(await kit.text());
  kit.check("replies R11: the lead reads Needs review", text.includes("Needs review"));
  // A yes from the same address, with the box unticked: it closes the follow-up, holds nobody.
  const stopsBefore11 = (await stopList(kit)).size;
  const laterYes = await record(
    page,
    kit,
    {
      email: unsure.email,
      words: "Yes, we would like to see it.",
      press: "Record a yes: add the firm to the waitlist",
    },
    async (open) => {
      await holdBox(open).uncheck();
    },
  );
  const closed = (await followUps(kit)).find(
    (item) => item.email === unsure.email && item.kind === "review",
  );
  kit.check(
    "replies R11: a later yes closes the review follow-up; unticked, nobody is held",
    laterYes.includes("is on the waitlist") &&
      closed?.state === "done" &&
      closed.note === "Answered by a later reply" &&
      (await stopList(kit)).size === stopsBefore11,
    { said: laterYes, state: closed?.state },
  );

  // ---------------------------------------------------------------- R12: never for out of office or free mail
  const firm12 = firmOf(2, pass);
  const away = (await leadsAt(kit, firm12))[0]!;
  const stopsBefore12 = (await stopList(kit)).size;
  const awaySaid = await record(
    page,
    kit,
    { email: away.email, words: "I am away until Monday.", press: "Record: later" },
    async (open) => {
      await open
        .locator(".hqdata-reply-form form")
        .getByRole("button", { name: "Later", exact: true })
        .click();
      await open.locator('input[name="later_until"]').fill(addDays(day, 4));
      await open.locator('input[name="auto_reply"]').check();
    },
  );
  // A free-mail lead nobody has answered for, and not an investor (an angel's yes goes to Investors).
  const free = (await leadsAt(kit, "inbox.example")).find(
    (item) => item.status === "not_sent" && !(item.badges ?? []).includes("Investor"),
  );
  const freeSaid = free
    ? await record(page, kit, {
        email: free.email,
        words: "Happy to try it.",
        press: "Record a yes: add the firm to the waitlist",
      })
    : "";
  kit.check(
    "replies R12: out of office and a free-mail yes hold nobody, and say nothing of holding",
    awaySaid.startsWith("Recorded: out of office until") &&
      !awaySaid.includes("held") &&
      free !== undefined &&
      freeSaid.includes("is on the waitlist") &&
      !freeSaid.includes("held") &&
      (await stopList(kit)).size === stopsBefore12,
    { away: awaySaid, free: freeSaid },
  );

  // ---------------------------------------------------------------- R13: take R10's reply back
  await page.goto(`${kit.base}/data/leads/${asker.lead_id}`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Take this back" }).click();
  text = flat(await kit.text());
  kit.check(
    "replies R13: the take-back preview lists releasing the firm",
    text.includes(`Release the ${others.length} addresses held at ${firm10}`),
    text.slice(0, 400),
  );
  await page.locator("button", { hasText: "Take it back" }).click();
  const releasedAll = await until(page, async () => {
    const stops = await stopList(kit);
    return others.every((item) => !stops.has(item.email));
  });
  kit.check("replies R13: after it, none of them is on the stop list", releasedAll);
  await kit.audit("lead-hold-taken-back");

  // ---------------------------------------------------------------- R14: the booking link and the answer
  await page.goto(`${kit.base}/data/replies#replies-answer`, { waitUntil: "networkidle" });
  const answerSection = page.locator("section[aria-labelledby='replies-answer']");
  await answerSection.locator("summary", { hasText: "Edit your answer" }).click();
  const linkField = answerSection.getByLabel("Your booking link");
  await linkField.fill("http://book.example/walk");
  await answerSection.getByRole("button", { name: "Save", exact: true }).click();
  const refusedLink = answerSection.locator(".callout--danger").first();
  await refusedLink.waitFor({ timeout: 20_000 });
  const refusedText = flat(await refusedLink.innerText());
  await linkField.fill("https://book.example/walk");
  await answerSection.getByRole("button", { name: "Save", exact: true }).click();
  await answerSection.locator(".form-sent", { hasText: "Saved." }).waitFor({ timeout: 20_000 });
  const settings = (await kit.socket.ask("GET", "/data/replies/settings")).body.settings as
    { booking_link?: string; yes_answer?: string } | undefined;
  kit.check(
    "replies R14: an http link is refused with its sentence; the https link is saved",
    refusedText === "Paste the whole link, starting https://." &&
      settings?.booking_link === "https://book.example/walk" &&
      (settings.yes_answer ?? "").includes("{booking_link}"),
    { refused: refusedText, settings },
  );
  await kit.audit("replies-answer-edit");
  const firm14 = firmOf(3, pass);
  const keen = (await leadsAt(kit, firm14))[0]!;
  const firstName = keen.name.split(" ")[0] ?? "";
  await record(
    page,
    kit,
    {
      email: keen.email,
      words: "Yes. Send me a time.",
      press: "Record a yes: add the firm to the waitlist",
    },
    async (open) => {
      await holdBox(open).uncheck();
    },
  );
  const copyBox = page.getByLabel("Your answer, ready to copy");
  await copyBox.waitFor({ timeout: 20_000 });
  const ready = await copyBox.inputValue();
  kit.check(
    "replies R14: a yes then shows the answer ready to copy, with the link and their first name",
    ready.includes("https://book.example/walk") &&
      firstName.length > 0 &&
      ready.includes(`Thank you, ${firstName}.`) &&
      (await page.getByRole("button", { name: "Copy", exact: true }).count()) === 1,
    ready,
  );
  await kit.audit("replies-answer-ready");

  // ---------------------------------------------------------------- R15: release the firm from Replies
  const firm15 = firmOf(4, pass);
  const at15 = await leadsAt(kit, firm15);
  const asking = at15[0]!;
  const before15 = await stopList(kit);
  const held15 = at15.filter((item) => item.email !== asking.email && !before15.has(item.email));
  await record(page, kit, { email: asking.email, words: "What does it cost?", press: "Question" });
  const heldNow = await stopList(kit);
  const where = `${kit.base}/data/replies?q=${encodeURIComponent(asking.email)}#replies-all`;
  await page.goto(where, { waitUntil: "networkidle" });
  const row = page.locator("#table-replies tbody tr").first();
  await row.locator("summary", { hasText: "Release the firm" }).click();
  text = flat(await row.innerText());
  const asked = text.includes(
    `Release ${held15.length} addresses at ${firm15}? Mail merge may write to them again.`,
  );
  await row.getByRole("button", { name: "Release them" }).click();
  const off = await until(page, async () => {
    const stops = await stopList(kit);
    return held15.every((item) => !stops.has(item.email));
  });
  // A fresh load: the same address with its anchor would not reload.
  await page.reload({ waitUntil: "networkidle" });
  const rowText = flat(await page.locator("#table-replies tbody tr").first().innerText());
  kit.check(
    "replies R15: Release the firm takes them off; the row reads Held {n} with no popover left",
    held15.length > 0 &&
      held15.every((item) => heldNow.get(item.email) === "manual") &&
      asked &&
      off &&
      rowText.includes(`Held ${held15.length} at ${firm15}`) &&
      (await page
        .locator("#table-replies tbody tr")
        .first()
        .locator("summary", {
          hasText: "Release the firm",
        })
        .count()) === 0,
    { asked, off, row: rowText.slice(0, 200) },
  );
  await kit.audit("replies-firm-released");

  // ---------------------------------------------------------------- tidy: leave Due as it was
  // Due shows its first 30 rows and the dates walk looks for its own date there, so the next
  // steps these yeses made move a month out, and the question's follow-up is done.
  for (const email of [asker.email, unsure.email, free?.email ?? "", keen.email]) {
    if (!email) continue;
    const entry = ((await lead(kit, email)).waitlist as { entry_id?: string } | null)?.entry_id;
    if (entry)
      await kit.socket.ask("POST", "/data/_test/waitlist/set", {
        entry_id: entry,
        next_step_on: addDays(day, 30),
        by: WALKER,
      });
  }
  for (const item of await followUps(kit))
    if (item.email === asking.email && item.state === "open")
      await kit.socket.ask("POST", `/data/follow-ups/${item.follow_up_id}/done`, {
        note: "Done in the walk.",
        by: WALKER,
      });
}
