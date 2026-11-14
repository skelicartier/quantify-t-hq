// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { SECRET_MESSAGE } from "../../scripts/data/guard";
import { WALKER, codeOf, startStack, type RawAnswer, type Stack } from "./helpers";

/**
 * Contacts (raise spec §6): add, edit, archive and restore, never delete; one live contact
 * per address; the phone rule; the introducers the investors module's picker is given,
 * asked through `core.need` as it asks; and the contacts' search hits. A contact is never
 * a lead. Every person is invented, on `.example`.
 */

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ modules: ["leads", "contacts", "notes"] });
}, 60_000);
afterAll(() => stack.stop());

type Json = Record<string, unknown>;
type Contact = {
  contact_id: string;
  name: string;
  role: string;
  email: string;
  phone: string;
  archived: unknown;
};

const message = (answer: RawAnswer): string =>
  String(((answer.json?.error ?? {}) as { message?: unknown }).message ?? "");

const fields = (change: Json = {}): Json => ({
  name: "Walk CA",
  role: "ca",
  firm: "Walk & Co Chartered Accountants",
  email: "ca@walkco.example",
  phone: "+91 98765 43210",
  notes: "Files the GST returns. Prefers a call before noon.",
  ...change,
});

async function post(path: string, body: Json): Promise<RawAnswer> {
  return stack.ask("POST", path, { by: WALKER, ...body });
}

async function add(change: Json = {}): Promise<Contact> {
  const answer = await post("/data/contacts", { ...fields(change), attempt: randomUUID() });
  expect(answer.status, message(answer)).toBe(200);
  return answer.json!.contact as Contact;
}

async function list(query = ""): Promise<Json> {
  return (await stack.ask("GET", `/data/contacts${query}`)).json!;
}

describe("contacts", () => {
  const ids: Record<string, string> = {};

  it("adds, lists by role and counts each role", async () => {
    const ca = await add();
    expect(ca).toMatchObject({ name: "Walk CA", role: "ca", email: "ca@walkco.example" });
    ids.ca = ca.contact_id;
    ids.cs = (
      await add({ name: "Walk CS", role: "cs", email: "", phone: "", notes: "" })
    ).contact_id;
    ids.intro = (
      await add({
        name: "Walk Introducer",
        role: "introducer",
        firm: "Walk Angels",
        email: "INTRO@WalkAngels.example",
        phone: "",
      })
    ).contact_id;
    ids.intro2 = (
      await add({ name: "Asha Introducer", role: "introducer", firm: "", email: "", phone: "" })
    ).contact_id;
    const page = await list();
    expect((page.contacts as Contact[]).map((item) => item.name)).toEqual([
      "Walk CA",
      "Walk CS",
      "Asha Introducer",
      "Walk Introducer",
    ]);
    expect(page.counts).toEqual({
      all: 4,
      archived: 0,
      ca: 1,
      cs: 1,
      lawyer: 0,
      bank: 0,
      auditor: 0,
      introducer: 2,
      other: 0,
    });
    expect(((await list("?role=introducer")).contacts as Contact[]).length).toBe(2);
    const intro = (page.contacts as Contact[]).find((item) => item.contact_id === ids.intro);
    expect(intro?.email).toBe("intro@walkangels.example");
  });

  it("refuses a second live contact with the same address, and the other rules", async () => {
    const twice = await post("/data/contacts", {
      ...fields({ name: "Another CA" }),
      attempt: randomUUID(),
    });
    expect([twice.status, codeOf(twice), message(twice)]).toEqual([
      409,
      "already_a_contact",
      "ca@walkco.example is already a contact: Walk CA.",
    ]);
    for (const [change, sentence] of [
      [{ name: "" }, "Give the contact a name."],
      [{ role: "friend" }, "Choose the contact's role."],
      [{ email: "not an address" }, "That is not an email address."],
      [{ email: "", phone: "call me" }, "Type the phone number with digits, spaces and + only."],
      [{ email: "", phone: "12" }, "Type the phone number with digits, spaces and + only."],
      [
        { email: "", phone: "(022) 2345 6789" },
        "Type the phone number with digits, spaces and + only.",
      ],
      [{ email: "", notes: "key xkeysib-0123456789abcdef" }, SECRET_MESSAGE],
    ] as const) {
      const answer = await post("/data/contacts", { ...fields(change), attempt: randomUUID() });
      expect([answer.status, message(answer)]).toEqual([400, sentence]);
    }
    // Phones as people type them.
    for (const phone of ["+91 98765 43210", "022 2345-6789", "+91 (22) 2345 6789", "9876543210"]) {
      const contact = await add({ name: `Phone ${phone}`, role: "other", email: "", phone });
      expect(contact.phone).toBe(phone);
      await post(`/data/contacts/${contact.contact_id}/archive`, {});
    }
  });

  it("edits a contact, keeping what is not given", async () => {
    const answer = await post(`/data/contacts/${ids.ca}/update`, {
      name: "Walk CA (Mumbai)",
      notes: "Files the GST returns.",
    });
    expect(answer.status, message(answer)).toBe(200);
    expect(answer.json!.contact).toMatchObject({
      name: "Walk CA (Mumbai)",
      email: "ca@walkco.example",
      phone: "+91 98765 43210",
      notes: "Files the GST returns.",
    });
    const clash = await post(`/data/contacts/${ids.cs}/update`, { email: "ca@walkco.example" });
    expect(codeOf(clash)).toBe("already_a_contact");
  });

  it("archives, never deletes; restores; and the address is free while archived", async () => {
    const archived = await post(`/data/contacts/${ids.ca}/archive`, {});
    expect((archived.json!.contact as Contact).archived).not.toBeNull();
    let page = await list();
    expect((page.contacts as Contact[]).map((item) => item.contact_id)).not.toContain(ids.ca);
    expect((page.counts as Json).archived).toBe(5);
    page = await list("?archived=1");
    expect((page.contacts as Contact[]).map((item) => item.contact_id)).toContain(ids.ca);
    // While it is archived another contact may take the address; then restoring is refused.
    const taker = await add({ name: "Walk CA two", email: "ca@walkco.example" });
    const blocked = await post(`/data/contacts/${ids.ca}/restore`, {});
    expect(codeOf(blocked)).toBe("already_a_contact");
    await post(`/data/contacts/${taker.contact_id}/archive`, {});
    const restored = await post(`/data/contacts/${ids.ca}/restore`, {});
    expect((restored.json!.contact as Contact).archived).toBeNull();
    expect((await stack.ask("POST", "/data/contacts/no-such/delete", { by: WALKER })).status).toBe(
      404,
    );
  });

  it("gives the investors module its introducers, live ones by name, and any one by id", async () => {
    const before = (await stack.ask("GET", "/data/_test/contacts/introducers")).json!;
    expect(before.found).toBe(true);
    expect(before.introducers).toEqual([
      { contact_id: ids.intro2, name: "Asha Introducer", firm: "" },
      { contact_id: ids.intro, name: "Walk Introducer", firm: "Walk Angels" },
    ]);
    await post(`/data/contacts/${ids.intro2}/archive`, {});
    const after = (await stack.ask("GET", `/data/_test/contacts/introducers?id=${ids.intro2}`))
      .json!;
    expect((after.introducers as Json[]).map((item) => item.name)).toEqual(["Walk Introducer"]);
    expect(after.contact).toEqual({
      contact_id: ids.intro2,
      name: "Asha Introducer",
      firm: "",
      role: "introducer",
    });
  });

  it("is searchable by name, firm, address, phone, notes and role, never when archived", async () => {
    const ask = async (q: string) =>
      (await stack.ask("GET", `/data/_test/notes/search?q=${encodeURIComponent(q)}`)).json!;
    // No notes here: only the contacts' source answers.
    const angels = await ask("walk angels");
    expect(angels.notes).toEqual([]);
    expect(angels.contacts).toEqual([
      {
        kind: "contact",
        count: 1,
        hits: [
          {
            kind: "contact",
            id: ids.intro,
            title: "Walk Introducer",
            subtitle: "Introducer · Walk Angels",
            snippet: "",
            href: `/data/contacts#contact-${ids.intro}`,
          },
        ],
      },
    ]);
    expect(((await ask("company secretary")).contacts as Json[])[0]).toMatchObject({
      count: 1,
    });
    expect(((await ask("gst")).contacts as { hits: Json[] }[])[0]!.hits[0]!.snippet).toBe(
      "Files the GST returns.",
    );
    expect((await ask("asha")).contacts).toEqual([]);
  });

  it("never makes a contact a lead", async () => {
    const lead = await stack.ask("GET", "/data/leads?q=walkco");
    if (lead.status === 200) expect(lead.json!.total ?? 0).toBe(0);
  });
});
