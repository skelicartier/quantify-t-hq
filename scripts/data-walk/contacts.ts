/**
 * Contacts, walked against the stand-in (raise spec §6.9): the three seeded contacts
 * listed (N1), "Add a contact" adding an invented lawyer and the same address refused
 * a second time, and "Archive" moving the lawyer from All to Archived and "Restore"
 * bringing it back (N2). Every person is invented, on `.example`; none becomes a lead.
 */

import { request } from "node:http";

import type { Page } from "playwright";

import { WALKER, type Shot, type WalkKit } from "./kit";

export const shots: Shot[] = [
  { name: "data-contacts", path: "/data/contacts", ready: "#table-contacts" },
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

const SEEDED = [
  {
    name: "Walk CA",
    role: "ca",
    firm: "Walk & Co Chartered Accountants",
    email: "ca@walkco.example",
    phone: "+91 98765 43210",
    notes: "Invented: files the GST returns and the TDS. Prefers a call before noon.",
  },
  {
    name: "Walk CS",
    role: "cs",
    firm: "Walk Secretarial Services",
    email: "cs@walksecretarial.example",
    phone: "",
    notes: "Invented: board minutes and the ROC filings.",
  },
  {
    name: "Walk Introducer",
    role: "introducer",
    firm: "Walk Angels",
    email: "intro@walkangels.example",
    phone: "",
    notes: "Invented: introduces seed funds in Mumbai.",
  },
];

const LAWYER = {
  name: "Walk Lawyer",
  firm: "Walk Legal LLP",
  email: "counsel@walklegal.example",
  phone: "+91 98200 11111",
  notes: "Invented: reviews the SAFE and the side letters.",
};

/** The three contacts every walk expects, once. */
export async function seed(socketPath: string): Promise<void> {
  const page = await ask(socketPath, "GET", "/data/contacts");
  if (page.status !== 200) {
    console.log("[walk] contacts: the module is not loaded here");
    return;
  }
  const known = new Set(
    ((page.body.contacts as { name: string }[] | undefined) ?? []).map((item) => item.name),
  );
  for (const contact of SEEDED)
    if (!known.has(contact.name))
      await ask(socketPath, "POST", "/data/contacts", { ...contact, by: WALKER });
}

type Contact = { contact_id: string; name: string; email: string; archived: unknown };

async function contacts(kit: WalkKit, query = ""): Promise<Contact[]> {
  const body = (await kit.socket.ask("GET", `/data/contacts${query}`)).body;
  return (body.contacts as Contact[] | undefined) ?? [];
}

async function until(page: Page, test: () => Promise<boolean>): Promise<boolean> {
  for (let tries = 0; tries < 100; tries += 1) {
    if (await test()) return true;
    await page.waitForTimeout(100);
  }
  return false;
}

const flat = (text: string) => text.replace(/\s+/g, " ").trim();

/**
 * Wait for a page's own element. A page that is not there yet is loaded once more (and the
 * walk says so); still missing, it is a failed check with what the page said instead.
 */
async function shown(page: Page, kit: WalkKit, selector: string): Promise<boolean> {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const found = await page
      .waitForSelector(selector, { timeout: 30_000 })
      .then(() => true)
      .catch(() => false);
    if (found) return true;
    console.log(`[walk] ${selector} was not there: ${flat(await kit.text()).slice(0, 160)}`);
    if (attempt === 0) await page.reload({ waitUntil: "networkidle" });
  }
  kit.check(`${selector} is on the page`, false, flat(await kit.text()).slice(0, 200));
  return false;
}

async function open(page: Page, kit: WalkKit, path: string): Promise<string> {
  await page.goto(`${kit.base}${path}`, { waitUntil: "networkidle" });
  if (!(await shown(page, kit, "#table-contacts"))) return "";
  return flat(await page.locator("#table-contacts").innerText());
}

export async function walk(page: Page, kit: WalkKit): Promise<void> {
  if ((await kit.socket.ask("GET", "/data/contacts")).status !== 200) {
    kit.check("contacts: not loaded in this service", true);
    return;
  }

  // ---------------------------------------------------------------- N1: the seeded three, and one added
  let table = await open(page, kit, "/data/contacts");
  kit.check(
    "contacts N1: the three seeded contacts are listed, with their roles",
    SEEDED.every((contact) => table.includes(contact.name)) &&
      table.includes("Chartered accountant") &&
      table.includes("Company secretary") &&
      table.includes("Introducer"),
    table.slice(0, 200),
  );
  kit.check(
    "contacts: an address is a mail link and a phone a call link",
    (await page.locator('#table-contacts a[href="mailto:ca@walkco.example"]').count()) === 1 &&
      (await page.locator('#table-contacts a[href="tel:+919876543210"]').count()) === 1,
  );
  await kit.audit("contacts");

  if (kit.pass.first) {
    await page.locator("summary", { hasText: "Add a contact" }).click();
    await page.fill("#contact-new-name", LAWYER.name);
    await page.selectOption("#contact-new-role", "lawyer");
    await page.fill("#contact-new-firm", LAWYER.firm);
    await page.fill("#contact-new-email", LAWYER.email);
    await page.fill("#contact-new-phone", LAWYER.phone);
    await page.fill("#contact-new-notes", LAWYER.notes);
    await page.locator("button", { hasText: "Add the contact" }).click();
    const added = await until(page, async () =>
      (await contacts(kit)).some((item) => item.email === LAWYER.email),
    );
    await kit.says(`Added ${LAWYER.name}.`).catch(() => undefined);
    table = await open(page, kit, "/data/contacts");
    kit.check(
      "contacts N1: Add a contact adds the invented lawyer as a row",
      added && table.includes(LAWYER.name) && table.includes("Lawyer"),
      table.slice(0, 200),
    );

    // The same address again is refused, in the service's words.
    await page.locator("summary", { hasText: "Add a contact" }).click();
    await page.fill("#contact-new-name", "Walk Lawyer two");
    await page.selectOption("#contact-new-role", "lawyer");
    await page.fill("#contact-new-email", LAWYER.email);
    await page.locator("button", { hasText: "Add the contact" }).click();
    const refused = await kit
      .says(`${LAWYER.email} is already a contact: ${LAWYER.name}.`)
      .then(() => true)
      .catch(() => false);
    kit.check(
      "contacts N1: the same address again is refused with “… is already a contact: …”",
      refused && (await contacts(kit)).filter((item) => item.email === LAWYER.email).length === 1,
    );
  }

  // ---------------------------------------------------------------- N2: archive, never delete; restore
  const lawyer = (await contacts(kit)).find((item) => item.email === LAWYER.email);
  if (!lawyer) {
    kit.check("contacts N2: the lawyer is there to archive", false);
    return;
  }
  await open(page, kit, "/data/contacts");
  await page.locator(`button[aria-label="Archive: ${LAWYER.name}"]`).click();
  const archived = await until(page, async () =>
    (await contacts(kit, "?archived=1")).some((item) => item.contact_id === lawyer.contact_id),
  );
  const all = await open(page, kit, "/data/contacts");
  const shelf = await open(page, kit, "/data/contacts?archived=1");
  kit.check(
    "contacts N2: Archive takes the lawyer out of All and puts it under Archived",
    archived && !all.includes(LAWYER.name) && shelf.includes(LAWYER.name),
    `${all.slice(0, 120)} | ${shelf.slice(0, 120)}`,
  );
  if (kit.pass.first) await kit.audit("contacts-archived");
  await page.locator(`button[aria-label="Restore: ${LAWYER.name}"]`).click();
  const restored = await until(page, async () =>
    (await contacts(kit)).some((item) => item.contact_id === lawyer.contact_id),
  );
  table = await open(page, kit, "/data/contacts");
  kit.check(
    "contacts N2: Restore brings it back to All",
    restored && table.includes(LAWYER.name),
    table.slice(0, 120),
  );
  kit.check(
    "contacts: a contact is never a lead",
    ((await kit.socket.ask("GET", "/data/leads?q=walklegal")).body.total ?? 0) === 0,
  );
}
