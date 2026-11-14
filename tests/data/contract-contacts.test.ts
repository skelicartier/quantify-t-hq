// @vitest-environment node
import { randomUUID } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  addContact,
  archiveContact,
  readContacts,
  restoreContact,
  updateContact,
  type ContactInput,
} from "@/lib/data/api/contacts";
import { DataRequestError } from "@/lib/data/socket";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's Contacts client against the real stack: every answer passes its schema,
 * and the service's refusals reach the portal as its own sentences.
 */

let stack: Stack;

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["contacts"] });
}, 60_000);
afterAll(() => stack.stop());

const fields = (change: Partial<ContactInput> = {}): ContactInput => ({
  name: "Walk Lawyer",
  role: "lawyer",
  firm: "Walk Legal LLP",
  email: "counsel@walklegal.example",
  phone: "+91 98200 00000",
  notes: "Reviews the SAFE.",
  ...change,
});

describe("the portal and Contacts agree", () => {
  it("on an empty page", async () => {
    const page = await readContacts();
    expect(page.contacts).toEqual([]);
    expect(page.counts).toMatchObject({ all: 0, archived: 0, lawyer: 0 });
  });

  it("on adding, editing, archiving and restoring", async () => {
    const { contact } = await addContact(fields(), WALKER, randomUUID());
    expect(contact.role).toBe("lawyer");
    const edited = await updateContact(
      contact.contact_id,
      fields({ notes: "Reviews the SAFE and the side letter." }),
      WALKER,
    );
    expect(edited.contact.notes).toBe("Reviews the SAFE and the side letter.");
    expect((await archiveContact(contact.contact_id, WALKER)).contact.archived).not.toBeNull();
    expect((await readContacts({ archived: true })).contacts).toHaveLength(1);
    expect((await readContacts({ role: "lawyer" })).contacts).toHaveLength(0);
    expect((await restoreContact(contact.contact_id, WALKER)).contact.archived).toBeNull();
    expect((await readContacts({ q: "side letter" })).total).toBe(1);
  });

  it("on a refusal, in its own words", async () => {
    const twice = addContact(fields({ name: "Walk Lawyer two" }), WALKER, randomUUID());
    await expect(twice).rejects.toBeInstanceOf(DataRequestError);
    await expect(twice).rejects.toMatchObject({
      status: 409,
      code: "already_a_contact",
      message: "counsel@walklegal.example is already a contact: Walk Lawyer.",
    });
  });
});
