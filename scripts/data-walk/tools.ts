/**
 * Systems › Tools and Accounts, walked against the stand-in (ws-notes/security/spec.md §6.9):
 * the empty Tools page and its sentence (TL1); "Walk Mail" added on the page, its "Cancel by"
 * cell and its Due row on Data (TL2); Key dates no longer suggesting "The mail provider's plan"
 * (TL3); two accounts, one an admin without two-step sign-in, and that check line (TL4); the
 * sub-processor block, its CSV and "Keep a copy in Files" (TL5); the Accounts page as the
 * Owner, "Link to the people ledger" for the walk's leaver, offboarding started through the
 * people route, "Close by" reading the day, and the person's page showing the section (TL6);
 * the same pages as the walk's Admin, with no "Walk Intern" and the `OWNER_LEFT_OUT` line
 * (TL7); 412px with no overflow and no "%" (TL8); and the outbox not growing (TL9).
 *
 * The leaver is a person of the walk's own, "Walk Intern Two", added through the people
 * module's routes with a signed letter and IP assignment, and offboarded with yesterday as
 * the last day, so Walk Mail's close-by is today and Home's owed row "Account" shows for the
 * Owner. Every tool, person and address is invented, on `.example`.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

const PAGE = "/data/systems";
const ACCOUNTS = "/data/systems/accounts";
const TOOL_ID = "walk-mail";
const TOOL = `${PAGE}/tools/${TOOL_ID}`;
const LEAVER = { name: "Walk Intern Two", email: "walk.intern@walk.example" };
const ADMIN_HOLDER = "walk.admin@walk.example";
const TOOLS_EMPTY =
  "No tools recorded. Add every tool the company signs in to, paid or free, starting with the mail suite: buyers ask which tools hold their data, and a leaver's accounts are closed from this list.";
const OWNER_LEFT_OUT =
  "Who each account and device belongs to in the people ledger, and the days worked out from a last day, are for the Owner only. They are left out here.";

export const shots: Shot[] = [
  { name: "data-systems", path: PAGE, ready: ".hqdata-systems" },
  { name: "data-systems-tool", path: TOOL, ready: '[data-section="tool-accounts"]' },
  { name: "data-systems-accounts", path: ACCOUNTS, ready: '[data-section="accounts-list"]' },
  {
    name: "data-person-systems",
    path: "/data/people/walk-intern",
    ready: '[data-section="person-systems"]',
  },
];

type Body = Record<string, unknown>;

function ask(socket: string, method: "GET" | "POST", path: string, body?: unknown) {
  return new Promise<{ status: number; body: Body }>((resolve, reject) => {
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
          let parsed: Body = {};
          try {
            parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as Body;
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

/** The devices stand-in (empty) while U2's module is absent: the person's section draws its table. */
export async function seed(socketPath: string): Promise<void> {
  if ((await ask(socketPath, "GET", "/data/tools")).status !== 200) {
    console.log("[walk] tools: the module is not loaded here");
    return;
  }
  await ask(socketPath, "POST", "/data/_test/tools/seed", { by: WALKER });
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const pad = (value: number) => String(value).padStart(2, "0");
const flat = (text: string) => text.replace(/\s+/g, " ").trim();

function addDays(day: string, count: number): string {
  const [year = 0, month = 0, date = 0] = day.split("-").map(Number);
  const moved = new Date(Date.UTC(year, month - 1, date + count));
  return `${moved.getUTCFullYear()}-${pad(moved.getUTCMonth() + 1)}-${pad(moved.getUTCDate())}`;
}

function dayWords(day: string): string {
  const [year = "", month = "", date = ""] = day.split("-");
  return `${Number(date)} ${MONTHS[Number(month) - 1] ?? ""} ${year}`;
}

async function until(page: Page, test: () => Promise<boolean>, tries = 100): Promise<boolean> {
  for (let count = 0; count < tries; count += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

async function open(page: Page, kit: WalkKit, path: string, ready: string): Promise<string> {
  await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
  await page.waitForSelector(ready, { timeout: 30_000 });
  return flat(await kit.text());
}

async function shown(page: Page, kit: WalkKit, path: string, ready: string): Promise<boolean> {
  try {
    await open(page, kit, path, ready);
    return true;
  } catch {
    kit.check(`tools: ${path} opens`, false, ready);
    return false;
  }
}

const toolOf = async (kit: WalkKit): Promise<Body | null> => {
  const answer = await kit.socket.ask("GET", `/data/tools/${TOOL_ID}`);
  return answer.status === 200 ? answer.body : null;
};

const leaverOf = async (kit: WalkKit): Promise<string> =>
  ((((await kit.socket.ask("GET", "/data/people")).body.people as Body[] | undefined) ?? []).find(
    (person) => person.name === LEAVER.name,
  )?.person_id as string | undefined) ?? "";

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/tools")).status !== 200) {
    kit.check("tools: not loaded in this service", true);
    return;
  }
  const outbox = kit.outbox().length;
  const today = String((await kit.socket.ask("GET", "/data/_test/day")).body.day ?? "");
  // A worker restart drops the stand-in: put it back (it never replaces a real one).
  await kit.socket.ask("POST", "/data/_test/tools/seed", { by: WALKER });

  if (kit.pass.first) {
    // -------------------------------------------------------------- TL1: nothing recorded
    const tools =
      ((await kit.socket.ask("GET", "/data/tools?view=all")).body.tools as Body[]) ?? [];
    if (tools.length === 0) {
      const text = await open(page, kit, PAGE, ".hqdata-systems");
      kit.check(
        "tools TL1: the empty Tools page says what to add first, with the not-advice line",
        text.includes(TOOLS_EMPTY) &&
          text.includes("A record and a reminder, not legal or certification advice.") &&
          text.includes("ISO/IEC 27001:2022 A.5.9"),
        text.slice(0, 300),
      );
    }

    // -------------------------------------------------------------- TL2: Walk Mail
    if (!(await toolOf(kit))) {
      await open(page, kit, PAGE, ".hqdata-systems");
      await page.locator(".pagebar__actions summary", { hasText: "Add a tool" }).click();
      await page.fill("#tool-new-name", "Walk Mail");
      await page.fill("#tool-new-what", "Mail and documents");
      await page.selectOption("#tool-new-category", "mail_docs");
      await page.fill("#tool-new-owner", "Walk Owner");
      await page.fill("#tool-new-plan", "Walk Business");
      await page.selectOption("#tool-new-billing", "yearly");
      await page.fill("#tool-new-renews", addDays(today, 40));
      await page.fill("#tool-new-notice", "30");
      await page.selectOption("#tool-new-auto", "yes");
      await page.selectOption("#tool-new-cover", "mail-plan");
      await page.selectOption("#tool-new-sign-in", "sso");
      await page.selectOption("#tool-new-mfa", "enforced");
      await page.check("#tool-new-critical");
      await page.check("#tool-new-holds-personal");
      await page.fill("#tool-new-where", "India");
      await page.locator("form button", { hasText: "Add the tool" }).click();
      let id = "";
      await until(page, async () => {
        const all =
          ((await kit.socket.ask("GET", "/data/tools?view=all")).body.tools as Body[]) ?? [];
        id = String(all.find((tool) => tool.name === "Walk Mail")?.tool_id ?? "");
        return Boolean(id);
      });
      const pinned = await kit.socket.ask("POST", "/data/_test/tools/pin", { id, by: WALKER });
      kit.check(
        "tools TL2: Add a tool keeps Walk Mail, pinned walk-mail",
        pinned.body.tool_id === TOOL_ID,
        pinned.body,
      );
    }
    const cancelBy = dayWords(addDays(today, 10));
    const list = await open(page, kit, PAGE, "#table-tools");
    const row = flat(await page.locator(`#tool-${TOOL_ID}`).innerText());
    const data = await open(page, kit, "/data", "main");
    kit.check(
      "tools TL2: the row reads Cancel by and the Due row on Data asks to renew or cancel",
      row.includes(`Cancel by ${cancelBy}`) &&
        row.includes("Walk Mail") &&
        data.includes(`Renew or cancel Walk Mail by ${cancelBy}`),
      { row, list: list.slice(0, 120) },
    );

    // -------------------------------------------------------------- TL3: Key dates
    const dates = await kit.socket.ask("GET", "/data/dates");
    if (dates.status === 200) {
      await open(page, kit, "/data/dates", "main");
      const hidden = (dates.body.hidden as Body[] | undefined) ?? [];
      kit.check(
        "tools TL3: Key dates no longer suggests The mail provider's plan, and says why",
        (await page.locator("#suggested-mail-plan").count()) === 0 &&
          hidden.some(
            (item) =>
              item.key === "mail-plan" &&
              item.why === "This renewal is on its tool's row in Systems.",
          ),
        hidden,
      );
    } else kit.check("tools TL3: Key dates is not loaded here", true);

    // -------------------------------------------------------------- TL4: two accounts
    const accounts = (((await toolOf(kit))?.accounts as Body[]) ?? []).length;
    if (accounts === 0) {
      for (const [holder, role, mfa] of [
        [ADMIN_HOLDER, "admin", "no"],
        [LEAVER.email, "member", "yes"],
      ] as const) {
        await open(page, kit, TOOL, '[data-section="tool-accounts"]');
        await page
          .locator('[data-section="tool-accounts"] .rsection__actions summary', {
            hasText: "Add an account",
          })
          .click();
        await page.fill("#account-new-holder", holder);
        await page.selectOption("#account-new-role", role);
        await page.selectOption("#account-new-mfa", mfa);
        await page.locator("form button", { hasText: "Add the account" }).click();
        await until(page, async () =>
          (((await toolOf(kit))?.accounts as Body[]) ?? []).some((item) => item.holder === holder),
        );
      }
    }
    const toolText = await open(page, kit, TOOL, '[data-section="tool-accounts"]');
    kit.check(
      "tools TL4: two accounts, and the line for the admin without two-step sign-in",
      toolText.includes("1 admin account without two-step sign-in.") &&
        toolText.includes("2 accounts") &&
        toolText.includes(ADMIN_HOLDER) &&
        toolText.includes(LEAVER.email),
      toolText.slice(0, 300),
    );

    // -------------------------------------------------------------- TL5: the sub-processor block
    if (!((await toolOf(kit))?.tool as Body | undefined)?.subprocessor) {
      await open(page, kit, TOOL, '[data-section="tool-subprocessor"]');
      await page
        .locator('[data-section="tool-subprocessor"] summary', {
          hasText: "Mark as a sub-processor",
        })
        .click();
      await page.fill("#sp-legal", "Walk Mail Private Limited");
      await page.fill("#sp-purpose", "Mail and documents for customers");
      await page.fill("#sp-locations", "India");
      await page.fill("#sp-dpa", addDays(today, -10));
      await page.fill("#sp-since", addDays(today, -100));
      await page
        .locator('[data-section="tool-subprocessor"] form button', { hasText: "Save" })
        .click();
      await until(page, async () =>
        Boolean(((await toolOf(kit))?.tool as Body | undefined)?.subprocessor),
      );
    }
    const block = flat(
      await (async () => {
        await open(page, kit, TOOL, '[data-section="tool-subprocessor"]');
        return page.locator('[data-section="tool-subprocessor"]').innerText();
      })(),
    );
    const csv = await page.request.get(`${kit.base}${PAGE}/subprocessors`);
    const csvText = await csv.text();
    await open(page, kit, PAGE, ".hqdata-systems");
    await page.locator(".hqdata-systems__links summary", { hasText: "Sub-processor list" }).click();
    await page.locator("button", { hasText: "Keep a copy in Files" }).click();
    const kept = await kit
      .says("Kept in Files.")
      .then(() => true)
      .catch(() => false);
    const keptFile = (await kit.socket.ask("GET", "/data/tools")).body.kept as Body | null;
    kit.check(
      "tools TL5: the sub-processor block, its CSV, and a copy kept in Files",
      block.includes("Walk Mail Private Limited") &&
        block.includes(`Signed ${dayWords(addDays(today, -10))}`) &&
        block.includes("ISO/IEC 27001:2022 A.5.19") &&
        csv.status() === 200 &&
        csvText.includes(
          `Walk Mail,Walk Mail Private Limited,Mail and documents for customers,Personal data,India,${addDays(today, -10)},${addDays(today, -100)}`,
        ) &&
        kept &&
        keptFile?.title === "Sub-processors",
      { status: csv.status(), csv: csvText.slice(0, 200), kept, block: block.slice(0, 200) },
    );

    // -------------------------------------------------------------- TL6: the Owner and the leaver
    let personId = await leaverOf(kit);
    if (!personId) {
      const added = await kit.socket.ask("POST", "/data/people", {
        name: LEAVER.name,
        email: LEAVER.email,
        kind: "intern",
        role_title: "Research intern",
        starts_on: addDays(today, -60),
        ends_on: addDays(today, 30),
        mentor: "Walk Mentor",
        by: WALKER,
      });
      personId = String((added.body.person as Body | undefined)?.person_id ?? "");
      // A signed letter and IP assignment, as every walk intern has (the company walk's M5 counts them).
      if (personId)
        for (const [kind, title] of [
          ["internship", "Walk Intern Two internship letter"],
          ["ip_assignment", "Walk Intern Two IP assignment"],
        ] as const)
          await kit.socket.ask("POST", `/data/people/${personId}/documents`, {
            kind,
            title,
            signed_on: addDays(today, -60),
            by: WALKER,
          });
    }
    const account = (((await toolOf(kit))?.accounts as Body[]) ?? []).find(
      (item) => item.holder === LEAVER.email,
    );
    const accountId = String(account?.account_id ?? "");
    // The stand-in devices answer only where Devices is not loaded; in the merged copy the real
    // Devices answers for the person (`real: true`), and no laptop is linked to this leaver.
    let standInDevices = false;
    if (personId && accountId) {
      await open(page, kit, ACCOUNTS, '[data-section="accounts-list"]');
      const rowAt = page.locator(`#account-${accountId}`);
      await rowAt.locator("summary", { hasText: "Link to the people ledger" }).click();
      await page.selectOption(`#link-${accountId}`, personId);
      await rowAt.locator("form button", { hasText: "Save the link" }).click();
      await until(page, async () => {
        const rows =
          ((await kit.socket.ask("GET", "/data/tools/accounts?owner=1")).body.accounts as Body[]) ??
          [];
        return Boolean(rows.find((item) => item.account_id === accountId)?.person);
      });
      const person = (await kit.socket.ask("GET", `/data/people/${personId}`)).body.person as
        Body | undefined;
      if (!person?.offboarding)
        await kit.socket.ask("POST", `/data/people/${personId}/offboard`, {
          last_day: addDays(today, -1),
          by: WALKER,
        });
      const installed = await kit.socket.ask("POST", "/data/_test/tools/devices", {
        by_person: {
          [personId]: [
            {
              device_id: "walk-laptop",
              label: "Walk Laptop 14",
              ownership: "personal",
              by: addDays(today, 4),
              done: false,
              href: "/data/systems/devices",
            },
          ],
        },
        by: WALKER,
      });
      standInDevices = installed.body.installed === true;
    }
    await open(page, kit, ACCOUNTS, "#table-accounts");
    const ownerColumns = await page
      .locator("#table-accounts th", { hasText: /In the people ledger|Close by/ })
      .count();
    const linkedRow = accountId
      ? flat(await page.locator(`#account-${accountId}`).innerText())
      : "";
    const personText =
      personId &&
      (await shown(page, kit, `/data/people/${personId}`, '[data-section="person-systems"]'))
        ? flat(await page.locator('[data-section="person-systems"]').innerText())
        : "";
    const home = await open(page, kit, "/home", "main");
    kit.check(
      "tools TL6: as the Owner, the link, Close by today, the person's section, and Home's owed row Account",
      linkedRow.includes(LEAVER.name) &&
        linkedRow.includes(`Close by ${dayWords(today)}`) &&
        ownerColumns === 2 &&
        personText.includes("Accounts in Systems") &&
        personText.includes(`Close by ${dayWords(today)}`) &&
        (!standInDevices || personText.includes("Walk Laptop 14")) &&
        home.includes(`Close Walk Mail for ${LEAVER.name}`),
      {
        home: home.includes(`Close Walk Mail for ${LEAVER.name}`),
        columns: ownerColumns,
        laptop: personText.includes("Walk Laptop 14"),
        standInDevices,
        accounts: personText.includes("Accounts in Systems"),
        close: personText.includes(`Close by ${dayWords(today)}`),
        linkedRow,
      },
    );

    // -------------------------------------------------------------- TL7: the walk's Admin
    const browser = page.context().browser();
    if (browser) {
      const other = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      try {
        const admin = await other.newPage();
        await admin.goto(`${kit.base}/dev/signin?as=admin%40hq.test&next=%2Fdata%2Fsystems`, {
          waitUntil: "networkidle",
        });
        const seen: string[] = [];
        let columns = 0;
        for (const path of [PAGE, TOOL, ACCOUNTS, "/data", "/home"]) {
          await admin.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
          seen.push(flat(await admin.locator("main").first().innerText()));
          columns += await admin
            .locator("main th", { hasText: /In the people ledger|Close by/ })
            .count();
        }
        const csv = await admin.request.get(`${kit.base}${ACCOUNTS}/export`);
        const csvText = await csv.text();
        kit.check(
          "tools TL7: the walk's Admin sees no Walk Intern, the Owner-left-out line, no ledger column, and a CSV without it",
          seen.every((text) => !text.includes("Walk Intern")) &&
            seen[1]!.includes(OWNER_LEFT_OUT) &&
            seen[2]!.includes(OWNER_LEFT_OUT) &&
            columns === 0 &&
            !seen[2]!.includes("Link to the people ledger") &&
            seen[2]!.includes(LEAVER.email) &&
            csv.status() === 200 &&
            !csvText.includes("In the people ledger") &&
            !csvText.includes("Walk Intern"),
          { columns, seen: seen.map((text) => text.slice(0, 60)) },
        );
      } finally {
        await other.close();
      }
    }
  }

  // ---------------------------------------------------------------- every pass: the pages
  if (!(await toolOf(kit))) {
    kit.check("tools: walk-mail is in the register", false);
    return;
  }
  const texts: string[] = [];
  for (const [path, ready, name] of [
    [PAGE, "#table-tools", "systems"],
    [TOOL, '[data-section="tool-accounts"]', "systems-tool"],
    [ACCOUNTS, "#table-accounts", "systems-accounts"],
  ] as const) {
    if (!(await shown(page, kit, path, ready))) return;
    texts.push(flat(await kit.text()));
    await kit.audit(name);
  }
  const personId = await leaverOf(kit);
  if (
    personId &&
    (await shown(page, kit, `/data/people/${personId}`, '[data-section="person-systems"]'))
  ) {
    texts.push(flat(await page.locator('[data-section="person-systems"]').innerText()));
    await kit.audit("person-systems");
  }

  // ---------------------------------------------------------------- TL8, TL9
  if (kit.pass.width === "phone")
    kit.check(
      "tools TL8: at 412px every Systems page fits (checked by each audit) and says no per cent sign",
      texts.length >= 3 && texts.every((text) => !text.includes("%")),
    );
  kit.check("tools TL9: nothing was sent from Systems", kit.outbox().length === outbox, {
    before: outbox,
    after: kit.outbox().length,
  });
}
