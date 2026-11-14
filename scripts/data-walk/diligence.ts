/**
 * Buyer diligence and dataset trials, walked against the stand-in (ws-notes/company/spec.md
 * §9.11 DI1–DI7): "Open diligence" and its questionnaire in Due (DI1); a reference shared
 * before consent refused, then accepted with it (DI2); a trial's sample refused before
 * clearance, then sent (DI3); `auto_renews: true` refused through the socket (DI4); a trial's
 * go/no-go in Due (DI5); the sample's copy in Files with its "Used for" (DI6); the intern kept
 * out (DI7). Every firm and person is invented.
 */

import type { Page } from "playwright";

import { WALK_ENTRIES } from "../data/waitlist/walk-seed";
import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-diligence", path: "/data/waitlist/diligence", ready: "#table-buyer-diligence" },
];

const flat = (text: string) => text.replace(/\s+/g, " ").trim();
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const short = (day: string) => `${Number(day.slice(8))} ${MONTHS[Number(day.slice(5, 7)) - 1]}`;

function plus(day: string, count: number): string {
  const [year = 0, month = 1, date = 1] = day.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, date + count)).toISOString().slice(0, 10);
}

const NO_CONSENT = "Record their consent first: a reference is shared only once they agree.";
const NOT_CLEARED =
  "Their compliance team clears a trial before any data goes. Record when it was cleared.";
const NEVER_RENEWS =
  "A trial never renews on its own here. Agree the next step in writing instead.";
const RENEWAL_LINE = "Trials never renew on their own here.";

async function until(page: Page, test: () => Promise<boolean>): Promise<boolean> {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function shown(page: Page, kit: WalkKit, selector: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const found = await page
      .waitForSelector(selector, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return true;
    if (attempt === 0) await page.reload({ waitUntil: "networkidle" });
  }
  kit.check(`diligence: ${selector} is on the page`, false, flat(await kit.text()).slice(0, 200));
  return false;
}

/** What the form said after it was sent: its own line, or its refusal. */
async function said(form: ReturnType<Page["locator"]>): Promise<string> {
  const line = form.locator(".form-sent, .callout--danger").first();
  return line
    .waitFor({ timeout: 20_000 })
    .then(async () => flat(await line.innerText()))
    .catch(() => "");
}

type Item = {
  diligence_id: string;
  entry_id: string;
  firm: string;
  questionnaire: { due_on: string | null; questions: number | null };
  references: { consent_on: string | null; shared_on: string | null }[];
};
type Trial = {
  trial_id: string;
  entry_id: string;
  firm: string;
  dataset: string;
  compliance: { cleared_on: string | null };
  sample: { sent_on: string; file_id: string | null } | null;
};

async function state(kit: WalkKit): Promise<{ diligence: Item[]; trials: Trial[] }> {
  const body = (await kit.socket.ask("GET", "/data/diligence")).body;
  return {
    diligence: (body.diligence as Item[] | undefined) ?? [],
    trials: (body.trials as Trial[] | undefined) ?? [],
  };
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/diligence")).status !== 200) {
    kit.check("diligence: not loaded in this service", true);
    return;
  }
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  const entryId = WALK_ENTRIES.freeMail;
  const firmPage = `${kit.base}/data/waitlist/${entryId}`;
  const mine = async () =>
    (await state(kit)).diligence.find((item) => item.entry_id === entryId) ?? null;

  if (kit.pass.first && !(await mine())) {
    // ---------------------------------------------------------------- DI1: open, questionnaire
    await page.goto(firmPage, { waitUntil: "networkidle" });
    if (!(await shown(page, kit, '[data-section="waitlist-diligence"]'))) return;
    const section = page.locator('[data-section="waitlist-diligence"]');
    kit.check(
      "diligence DI1: a firm with none says No diligence open.",
      flat(await section.innerText()).includes("No diligence open."),
    );
    await section.locator("button", { hasText: "Open diligence" }).click();
    await until(page, async () => (await mine()) !== null);
    await page.reload({ waitUntil: "networkidle" });
    await section.locator("summary", { hasText: /^Questionnaire$/ }).click();
    const questionnaire = section.locator("form", { has: page.locator('input[name="questions"]') });
    await questionnaire.locator('input[name="received_on"]').fill(today);
    await questionnaire.locator('input[name="due_on"]').fill(plus(today, 5));
    await questionnaire.locator('input[name="questions"]').fill("120");
    await questionnaire.locator("button", { hasText: "Save" }).click();
    await until(page, async () => (await mine())?.questionnaire.questions === 120);
    const item = (await mine())!;
    await page.goto(`${kit.base}/data/waitlist/diligence`, { waitUntil: "networkidle" });
    await page.waitForSelector("#table-buyer-diligence", { timeout: 30_000 });
    const row = flat(
      await page.locator("#table-buyer-diligence tr", { hasText: item.firm }).first().innerText(),
    );
    const due = ((await kit.socket.ask("GET", "/data/overview")).body.due ?? []) as {
      title: string;
    }[];
    kit.check(
      "diligence DI1: the questionnaire reads Due {d}, and Data's Due has Answer {firm}'s questionnaire",
      row.includes(`Due ${short(plus(today, 5))}`) &&
        due.some((entry) => entry.title === `Answer ${item.firm}'s questionnaire`),
      `${row} · ${due
        .map((entry) => entry.title)
        .join(" | ")
        .slice(0, 200)}`,
    );

    // ---------------------------------------------------------------- DI2: a reference, with consent
    await page.goto(firmPage, { waitUntil: "networkidle" });
    await section.locator("summary", { hasText: "Add a reference" }).click();
    const reference = section.locator("form", { has: page.locator('input[name="consent_on"]') });
    await reference.locator('input[name="name"]').fill("Walk Referee");
    await reference.locator('input[name="firm"]').fill("Walk Fund 9");
    await reference.locator('input[name="shared_on"]').fill(today);
    await reference.locator("button", { hasText: "Add the reference" }).click();
    const refused = await said(reference);
    // A form's fields start again once it has answered: type them all again, with the consent.
    await reference.locator('input[name="name"]').fill("Walk Referee");
    await reference.locator('input[name="firm"]').fill("Walk Fund 9");
    await reference.locator('input[name="consent_on"]').fill(plus(today, -1));
    await reference.locator('input[name="shared_on"]').fill(today);
    await reference.locator("button", { hasText: "Add the reference" }).click();
    const added = await until(
      page,
      async () =>
        (await mine())?.references.some((ref) => ref.consent_on === plus(today, -1)) ?? false,
    );
    kit.check(
      "diligence DI2: a reference shared with no consent is refused with its sentence; with consent the day before it is kept",
      refused === NO_CONSENT && added,
      refused,
    );

    // ---------------------------------------------------------------- DI3: a trial, cleared first
    await page.goto(firmPage, { waitUntil: "networkidle" });
    const trials = page.locator('[data-section="waitlist-trials"]');
    await trials.locator("summary", { hasText: "Add a dataset trial" }).click();
    const add = trials.locator("form", { has: page.locator('input[name="dataset"]') });
    await add.locator('input[name="dataset"]').fill("Walk dataset");
    await add.locator('input[name="dictionary_version"]').fill("v0.3");
    await add.locator('input[name="starts_on"]').fill(today);
    await add.locator('input[name="ends_on"]').fill(plus(today, 30));
    await add.locator('input[name="go_no_go_on"]').fill(plus(today, 2));
    await add.locator("button", { hasText: "Add the trial" }).click();
    await until(page, async () => (await state(kit)).trials.some((t) => t.entry_id === entryId));
    await page.reload({ waitUntil: "networkidle" });
    const line = trials.locator(".hqdata-trials__row").first();
    await line.locator("summary", { hasText: "Send a sample" }).click();
    const sample = line.locator("form", { has: page.locator('input[name="sent_on"]') });
    await sample.locator('input[name="sent_on"]').fill(today);
    await sample.locator("button", { hasText: "Record it" }).click();
    const early = await said(sample);
    await page.reload({ waitUntil: "networkidle" });
    await line.locator("summary", { hasText: "Clearance" }).click();
    const clearance = line.locator("form", { has: page.locator('input[name="cleared_on"]') });
    await clearance.locator('input[name="cleared_on"]').fill(today);
    await clearance.locator('input[name="by_name"]').fill("Walk Compliance");
    await clearance.locator("button", { hasText: "Record it" }).click();
    await until(
      page,
      async () =>
        (await state(kit)).trials.find((t) => t.entry_id === entryId)?.compliance.cleared_on ===
        today,
    );
    await page.reload({ waitUntil: "networkidle" });
    await line.locator("summary", { hasText: "Send a sample" }).click();
    await sample.locator('input[name="sent_on"]').fill(today);
    await sample.locator('input[name="file"]').setInputFiles({
      name: "walk-sample.csv",
      mimeType: "text/csv",
      buffer: Buffer.from("isin,day,close\nWALK0000001,2026-11-13,100\n", "utf8"),
    });
    await sample.locator("button", { hasText: "Record it" }).click();
    const sent = await until(page, async () =>
      Boolean((await state(kit)).trials.find((t) => t.entry_id === entryId)?.sample),
    );
    kit.check(
      "diligence DI3: a sample before clearance is refused; cleared today by Walk Compliance, it goes",
      early === NOT_CLEARED && sent,
      early,
    );
  }

  // ---------------------------------------------------------------- DI4: never renews
  const trial = (await state(kit)).trials.find((t) => t.entry_id === entryId);
  const renewing = await kit.socket.ask("POST", "/data/trials", {
    entry_id: entryId,
    dataset: "Walk dataset renewing",
    auto_renews: true,
    by: WALKER,
  });
  await page.goto(firmPage, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, '[data-section="waitlist-trials"]'))) return;
  const trialsText = flat(await page.locator('[data-section="waitlist-trials"]').innerText());
  kit.check(
    "diligence DI4: auto_renews true is refused with its sentence, and the page says trials never renew",
    renewing.status === 400 &&
      (renewing.body.error as { message?: string } | undefined)?.message === NEVER_RENEWS &&
      trialsText.includes(RENEWAL_LINE),
    renewing.body,
  );
  await kit.audit("waitlist-diligence");

  // ---------------------------------------------------------------- DI5: the trial's go/no-go in Due
  const due = ((await kit.socket.ask("GET", "/data/overview")).body.due ?? []) as {
    key: string;
    title: string;
  }[];
  kit.check(
    "diligence DI5: a trial go/no-go two days on is in Due",
    Boolean(trial) &&
      due.some((row) => row.title === `Go or no-go on the trial: ${trial?.firm ?? ""}`),
    due.map((row) => row.title).slice(0, 12),
  );

  // ---------------------------------------------------------------- DI6: the copy and its Used for
  const fileId = trial?.sample?.file_id ?? "";
  const file = fileId
    ? ((await kit.socket.ask("GET", `/data/files/${fileId}`)).body.file as
        { folder_path?: string; used_for?: { label: string }[] } | undefined)
    : undefined;
  kit.check(
    "diligence DI6: the sample is in 06 Contracts and NDAs › Diligence, Used for its trial",
    Boolean(file) &&
      /06 Contracts and NDAs.*Diligence/.test(file?.folder_path ?? "") &&
      (file?.used_for ?? []).some(
        (use) => use.label === `Sample sent to ${trial?.firm ?? ""} for a trial`,
      ),
    file,
  );
  if (fileId && kit.pass.first) {
    await page.goto(`${kit.base}/data/files/${fileId}`, { waitUntil: "networkidle" });
    const text = flat(await kit.text());
    kit.check(
      "diligence DI6: the file's page lists the trial under Used for",
      text.includes(`Sample sent to ${trial?.firm ?? ""} for a trial`),
      text.slice(0, 200),
    );
  }

  // ---------------------------------------------------------------- the list, every pass
  await page.goto(`${kit.base}/data/waitlist/diligence`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-buyer-diligence"))) return;
  const text = flat(await kit.text());
  const now = await state(kit);
  kit.check(
    "diligence: the list shows every buyer diligence and trial, and the renewal line",
    (await page.locator("#table-buyer-diligence tbody tr").count()) === now.diligence.length &&
      (await page.locator("#table-dataset-trials tbody tr").count()) === now.trials.length &&
      text.includes(RENEWAL_LINE) &&
      !text.includes("%"),
    `${now.diligence.length} · ${now.trials.length}`,
  );
  await kit.audit("diligence");

  // ---------------------------------------------------------------- DI7: the intern
  if (kit.pass.first) {
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const intern = await other.newPage();
      await intern.goto(
        `${kit.base}/dev/signin?as=intern%40hq.test&next=${encodeURIComponent("/data/waitlist/diligence")}`,
        { waitUntil: "networkidle" },
      );
      await intern.goto(`${kit.base}/data/waitlist/diligence`, { waitUntil: "networkidle" });
      const body = await intern.locator("main").first().innerText();
      kit.check(
        "diligence DI7: the intern sees “Data is for Owners and Admins.” and no address",
        body.includes("Data is for Owners and Admins.") &&
          !body.includes("@") &&
          (await intern.locator("#table-buyer-diligence").count()) === 0,
        body.slice(0, 160),
      );
      await other.close();
    } else kit.check("diligence DI7: a second browser context", false);
  }
}
