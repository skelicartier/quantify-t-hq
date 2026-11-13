// @vitest-environment node
import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { MergeEngine, Refused, type StepResult } from "../../scripts/mail-merge/engine";
import type {
  AccountCheck,
  Blocked,
  MailProvider,
  OutgoingMail,
  SendResult,
  SenderCheck,
} from "../../scripts/mail-merge/provider";

const KEY = "xkeysib-test-0000000000000000000000000000000000000000-abcd";

/** A provider that remembers what it was handed and answers as the script says. */
class Scripted implements MailProvider {
  readonly kind = "live" as const;
  sent: OutgoingMail[] = [];
  calls: string[] = [];
  /** address → the answers to give it, one a call; the last one repeats. */
  script = new Map<string, SendResult["status"][]>();
  account: AccountCheck["status"] = "ok";
  verified = true;
  blocked: Blocked[] = [];
  breakOn: string | null = null;

  async send(mail: OutgoingMail): Promise<SendResult> {
    this.calls.push(mail.to_email);
    if (mail.to_email === this.breakOn) throw new Error("the connection fell over");
    const answers = this.script.get(mail.to_email);
    const status = answers && answers.length > 1 ? answers.shift()! : (answers?.[0] ?? "sent");
    const base = { message_id: "", error_code: "", retry_after_seconds: null };
    if (status === "sent") {
      this.sent.push(mail);
      return { ...base, status, message_id: `<${this.sent.length}@test>` };
    }
    if (status === "failed") return { ...base, status, error_code: "invalid_parameter" };
    if (status === "auth_failed") return { ...base, status, error_code: "unauthorized" };
    if (status === "retry") return { ...base, status, error_code: "503", retry_after_seconds: 5 };
    return { ...base, status, error_code: "timeout" };
  }

  async checkAccount(): Promise<AccountCheck> {
    return {
      status: this.account,
      email: "me@quantify.test",
      company: "QT",
      plan: "free",
      credits: 300,
    };
  }

  async checkSender(email: string): Promise<SenderCheck> {
    return {
      status: "ok",
      domain: email.split("@")[1] ?? "",
      sender_known: this.verified,
      sender_active: this.verified,
      domain_known: this.verified,
      domain_authenticated: this.verified,
    };
  }

  async listBlocked(): Promise<Blocked[]> {
    return this.blocked;
  }
}

let dir: string;
let provider: Scripted;
let clock: Date;

function open(): MergeEngine {
  return new MergeEngine({ dir, now: () => new Date(clock), liveProvider: () => provider });
}

function people(count: number, domain = "fund.test"): string {
  return [
    "First Name,Firm,Email",
    ...Array.from(
      { length: count },
      (_, index) => `P${index + 1},Firm ${index + 1},p${index + 1}@${domain}`,
    ),
  ].join("\n");
}

async function drain(engine: MergeEngine, limit = 500): Promise<StepResult[]> {
  const seen: StepResult[] = [];
  for (let index = 0; index < limit; index += 1) {
    const outcome = await engine.step();
    seen.push(outcome);
    if (outcome === "idle" || outcome === "paused" || outcome === "finished") break;
    if (outcome === "waiting") clock = new Date(clock.getTime() + 60_000);
  }
  return seen;
}

/** A draft that is ready to go out for real: key, sender, list, words, a test. */
async function ready(engine: MergeEngine, csv = people(3)) {
  await engine.setKey({ key: KEY });
  engine.saveSettings({
    from_email: "aaryan@quantify.test",
    from_name: "Aaryan",
    reply_to: "aaryan@quantify.test",
    footer: "If you would rather not hear from me again, reply and say so.",
    daily_cap: 1000,
  });
  await engine.checkProvider();
  const list = engine.importList({ name: "Seed funds", file_name: "seed.csv", text: csv }).list;
  const mailing = engine.createMailing({ name: "Intro" }).mailing;
  engine.updateMailing(mailing.id, {
    subject: "Quantify Terminal x {{firm}}",
    body: "Hi {{first_name}},\n\nA short note.",
    list_ids: [list.id],
  });
  await engine.testMailing(mailing.id, { to: "me@quantify.test" });
  provider.sent = [];
  provider.calls = [];
  return { list, id: mailing.id };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "hq-mail-merge-"));
  provider = new Scripted();
  clock = new Date("2026-11-06T04:00:00.000Z");
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe("the provider key", () => {
  it("is kept where only this account can read it, and is never handed back", async () => {
    const engine = open();
    const status = await engine.setKey({ key: KEY });
    expect(status.provider).toMatchObject({ key_set: true, key_hint: "abcd" });
    expect(JSON.stringify(status)).not.toContain(KEY);
    expect(JSON.stringify(engine.status())).not.toContain("xkeysib");
    expect(statSync(join(dir, "provider.key")).mode & 0o777).toBe(0o600);
    expect(statSync(dir).mode & 0o777).toBe(0o700);
    expect(readFileSync(join(dir, "provider.key"), "utf8")).toBe(KEY);
  });

  it("is not saved when the provider refuses it or cannot be asked", async () => {
    const engine = open();
    provider.account = "auth_failed";
    await expect(engine.setKey({ key: KEY })).rejects.toThrow("did not accept that key");
    provider.account = "unavailable";
    await expect(engine.setKey({ key: KEY })).rejects.toThrow("could not be reached");
    await expect(engine.setKey({ key: "has a space" })).rejects.toBeInstanceOf(Refused);
    await expect(engine.setKey({ key: "xsmtpsib-0000-abcd" })).rejects.toThrow(
      "That is the SMTP key",
    );
    expect(engine.status().provider.key_set).toBe(false);
  });
});

describe("a practice send", () => {
  it("goes through every step, hands the provider nothing, and leaves the words a draft", async () => {
    const engine = open();
    const list = engine.importList({ name: "Seed", file_name: "s.csv", text: people(4) }).list;
    const id = engine.createMailing({ name: "Intro" }).mailing.id;
    // No key and no sender yet: practice needs neither.
    engine.updateMailing(id, {
      subject: "Hello {{firm}}",
      body: "Hi {{first_name}}",
      list_ids: [list.id],
    });
    engine.startMailing(id, { practice: true });
    expect(await drain(engine)).toEqual(["sent", "sent", "sent", "sent", "finished"]);
    expect(provider.calls).toEqual([]);
    const detail = engine.mailingDetail(id, {});
    expect(detail.mailing).toMatchObject({ state: "finished", mode: "practice", editable: true });
    expect(detail.mailing.progress).toMatchObject({ total: 4, sent: 4, waiting: 0 });
    expect(engine.status().sent_today).toBe(0);
    expect(
      readFileSync(join(dir, "practice-outbox.jsonl"), "utf8").trim().split("\n"),
    ).toHaveLength(4);
    // And the same words can then go out for real, from the start.
    engine.updateMailing(id, { subject: "Hello again {{firm}}" });
    expect(engine.mailingDetail(id, {}).mailing.state).toBe("draft");
  });
});

describe("sending to the people you pick", () => {
  async function picking(engine: MergeEngine, csv = people(6)) {
    const made = await ready(engine, csv);
    engine.updateMailing(made.id, { pick_only: true });
    return made;
  }

  it("goes to nobody until someone is picked, then to them alone", async () => {
    const engine = open();
    const { id } = await picking(engine);
    const detail = engine.mailingDetail(id, {});
    expect(detail.audience.sendable).toBe(0);
    expect(detail.checks.find((item) => item.key === "audience")?.label).toBe(
      "Pick the people it goes to",
    );
    await expect(engine.testMailing(id, { to: "me@quantify.test" })).rejects.toThrow(
      "Pick at least one person",
    );
    expect(engine.pick(id, { emails: ["P2@fund.test", "p5@fund.test"], picked: true })).toEqual({
      picked: 2,
      changed: 2,
    });
    await engine.testMailing(id, { to: "me@quantify.test" });
    provider.calls = [];
    engine.startMailing(id, { confirm: 2 });
    await drain(engine);
    expect(provider.calls).toEqual(["p2@fund.test", "p5@fund.test"]);
    expect(engine.mailingDetail(id, {}).mailing.progress).toMatchObject({ total: 2, sent: 2 });
  });

  it("ignores an address that is not on the lists, and can unpick", async () => {
    const engine = open();
    const { id } = await picking(engine);
    expect(engine.pick(id, { emails: ["nobody@else.test", "p1@fund.test"] }).picked).toBe(1);
    expect(engine.pick(id, { emails: ["p1@fund.test"], picked: false }).picked).toBe(0);
  });

  it("lets a pick beat a hold, but nothing beats the stop list", async () => {
    const engine = open();
    const { id } = await picking(
      engine,
      [
        "First Name,Firm,Email,CheckFirst",
        "A,Alpha,a@fund.test,",
        "B,Beta,b@fund.test,Check this one",
        "C,Gamma,c@fund.test,",
      ].join("\n"),
    );
    engine.updateMailing(id, { hold_column: "checkfirst" });
    engine.addStops({ emails: "c@fund.test", reason: "asked" });
    engine.pick(id, { emails: ["b@fund.test", "c@fund.test"], picked: true });
    const detail = engine.mailingDetail(id, {});
    expect(detail.audience).toMatchObject({ sendable: 1, left_out: 1 });
    expect(detail.preview?.email).toBe("b@fund.test");
    const rows = engine.people(id, {}).rows;
    expect(rows.map((row) => [row.email, row.picked, row.kind])).toEqual([
      ["a@fund.test", false, "ok"],
      ["b@fund.test", true, "ok"],
      ["c@fund.test", true, "stopped"],
    ]);
  });

  it("picks everyone a search finds, but never the held or the stopped", async () => {
    const engine = open();
    const { id } = await picking(
      engine,
      [
        "First Name,Firm,Email,Tier,CheckFirst",
        "A,Alpha,a@fund.test,1,",
        "B,Beta,b@fund.test,1,Check this one",
        "C,Gamma,c@fund.test,1,",
        "D,Delta,d@fund.test,2,",
      ].join("\n"),
    );
    engine.updateMailing(id, { hold_column: "checkfirst" });
    engine.addStops({ emails: "c@fund.test" });
    expect(engine.people(id, { q: "alpha" }).total).toBe(1);
    expect(engine.people(id, { q: "FUND.TEST" }).total).toBe(4);
    expect(engine.pick(id, { all: true, picked: true, q: "fund.test" })).toEqual({
      picked: 2,
      changed: 2,
    });
    expect(engine.people(id, { view: "picked" }).rows.map((row) => row.email)).toEqual([
      "a@fund.test",
      "d@fund.test",
    ]);
    expect(engine.pick(id, { all: true, picked: false }).picked).toBe(0);
  });

  it("shows a line's short columns, not a long letter", async () => {
    const engine = open();
    const long = "x".repeat(60);
    const { id } = await picking(
      engine,
      `First Name,Firm,Email,Notes\nA,Alpha,a@fund.test,${long}\n`,
    );
    const page = engine.people(id, {});
    expect(page.columns.map((column) => column.key)).toEqual(["first_name", "firm"]);
    expect(page.rows[0]!.cells).toEqual(["A", "Alpha"]);
  });

  it("makes a practice stale when the picks change", async () => {
    const engine = open();
    const { id } = await picking(engine);
    engine.pick(id, { emails: ["p1@fund.test"] });
    engine.startMailing(id, { practice: true });
    await drain(engine);
    expect(engine.mailingDetail(id, {}).mailing.state).toBe("finished");
    engine.pick(id, { emails: ["p2@fund.test"] });
    expect(engine.mailingDetail(id, {}).mailing.state).toBe("draft");
  });

  it("cannot change who gets a mailing once it has gone", async () => {
    const engine = open();
    const { id } = await picking(engine);
    engine.pick(id, { emails: ["p1@fund.test"] });
    await engine.testMailing(id, { to: "me@quantify.test" });
    engine.startMailing(id, { confirm: 1 });
    await drain(engine);
    expect(() => engine.pick(id, { emails: ["p2@fund.test"] })).toThrow("Make a copy");
    expect(() => engine.addPeople(id, { emails: "new@fund.test" })).toThrow("Make a copy");
  });
});

describe("custom addresses typed in", () => {
  it("sends to addresses with no list at all, made out with the words given", async () => {
    const engine = open();
    await engine.setKey({ key: KEY });
    engine.saveSettings({ from_email: "aaryan@quantify.test" });
    await engine.checkProvider();
    const id = engine.createMailing({ name: "One-off" }).mailing.id;
    engine.updateMailing(id, { subject: "For {Firm}", body: "{Greeting}\n\nReply no to stop." });
    const fields = engine.mailingDetail(id, {}).message_fields;
    expect(fields.map((field) => field.key)).toEqual(["firm", "greeting"]);
    expect(
      engine.addPeople(id, {
        emails: "Friend@Angel.test",
        values: { firm: "Angel", greeting: "Hi friend," },
      }),
    ).toEqual({ added: 1, already: 0, stopped: 0, refused: [] });
    const detail = engine.mailingDetail(id, {});
    expect(detail.mailing.lists.map((list) => list.name)).toEqual(["Added by hand"]);
    expect(detail.audience.sendable).toBe(1);
    expect(detail.checks.find((item) => item.key === "fields")?.ok).toBe(true);
    await engine.testMailing(id, { to: "me@quantify.test" });
    provider.calls = [];
    provider.sent = [];
    engine.startMailing(id, { confirm: 1 });
    await drain(engine);
    expect(provider.sent[0]).toMatchObject({ to_email: "friend@angel.test", subject: "For Angel" });
    expect(provider.sent[0]!.text).toContain("Hi friend,");
  });

  it("takes many at once, one list for all of them, and says what it could not read", async () => {
    const engine = open();
    const { id, list } = await ready(engine, people(1));
    const result = engine.addPeople(id, {
      emails: "a@x.test, b@x.test; c@x.test\nnonsense p1@fund.test a@x.test",
      values: { first_name: "Friend", firm: "X" },
    });
    expect(result).toEqual({ added: 3, already: 1, stopped: 0, refused: ["nonsense"] });
    expect(engine.mailingDetail(id, {}).audience.sendable).toBe(4);
    const other = engine.createMailing({ name: "Another" }).mailing.id;
    engine.updateMailing(other, { subject: "S", body: "Hi {{first_name}}", list_ids: [list.id] });
    engine.addPeople(other, { emails: "d@x.test", values: { first_name: "D" } });
    expect(engine.lists().lists.filter((item) => item.name === "Added by hand")).toHaveLength(1);
    expect(engine.lists().lists.find((item) => item.name === "Added by hand")?.people).toBe(4);
  });

  it("picks them too when the mailing goes to picked people, including someone already listed", async () => {
    const engine = open();
    const { id } = await ready(engine, people(3));
    engine.updateMailing(id, { pick_only: true });
    engine.addPeople(id, {
      emails: "new@x.test p3@fund.test",
      values: { first_name: "N", firm: "X" },
    });
    const detail = engine.mailingDetail(id, {});
    expect(detail.mailing.picked_count).toBe(2);
    expect(detail.audience.sendable).toBe(2);
  });

  it("will not add someone a column filter would silently drop", async () => {
    const engine = open();
    const { id } = await ready(engine, "First Name,Firm,Tier,Email\nA,Alpha,1,a@fund.test\n");
    engine.updateMailing(id, { only_column: "tier", only_value: "1" });
    expect(() => engine.addPeople(id, { emails: "new@x.test" })).toThrow(
      "goes only where tier is 1",
    );
  });

  it("still never writes to a typed-in address on the stop list, and says so", async () => {
    const engine = open();
    const { id } = await ready(engine, people(1));
    engine.addStops({ emails: "no@x.test", reason: "asked" });
    expect(engine.addPeople(id, { emails: "no@x.test", values: { first_name: "N" } }).stopped).toBe(
      1,
    );
    expect(engine.mailingDetail(id, {}).audience).toMatchObject({ sendable: 1, left_out: 1 });
  });

  it("refuses when nothing typed is an address", async () => {
    const engine = open();
    const { id } = await ready(engine, people(1));
    expect(() => engine.addPeople(id, { emails: "   " })).toThrow("at least one address");
    expect(() => engine.addPeople(id, { emails: "nonsense" })).toThrow("is not an email address");
  });
});

describe("one person's details", () => {
  it("changes what that person is sent, and nobody else's", async () => {
    const engine = open();
    const { id, list } = await ready(engine, people(2));
    engine.updateRow(list.id, "r1", { values: { first_name: "Rewritten" } });
    const first = engine.mailingDetail(id, {}).preview;
    expect(first).toMatchObject({ email: "p1@fund.test", list_id: list.id, row_id: "r1" });
    expect(first?.text).toContain("Hi Rewritten,");
    expect(engine.mailingDetail(id, { preview: 1 }).preview?.text).toContain("Hi P2,");
    expect(engine.listDetail(list.id, { row: "r1" }).editing?.values.first_name).toBe("Rewritten");
    expect(engine.listDetail(list.id, { q: "rewritten" }).total).toBe(1);
  });

  it("moves a pick with a corrected address, and refuses one already listed", async () => {
    const engine = open();
    const { id, list } = await ready(engine, people(2));
    engine.updateMailing(id, { pick_only: true });
    engine.pick(id, { emails: ["p1@fund.test"] });
    engine.updateRow(list.id, "r1", { email: "Fixed@Fund.test" });
    expect(engine.mailingDetail(id, {}).preview?.email).toBe("fixed@fund.test");
    expect(() => engine.updateRow(list.id, "r1", { email: "p2@fund.test" })).toThrow(
      "already on this list",
    );
    expect(() => engine.updateRow(list.id, "r1", { email: "nope" })).toThrow("not an email");
    expect(() => engine.updateRow(list.id, "r9", {})).toThrow("no longer on the list");
  });

  it("does not reach a send already going", async () => {
    const engine = open();
    const { id, list } = await ready(engine, people(2));
    engine.startMailing(id, { confirm: 2 });
    await engine.step();
    engine.updateRow(list.id, "r2", { values: { first_name: "Late" } });
    await drain(engine);
    expect(provider.sent[1]!.text).toContain("Hi P2,");
  });

  it("adds one person to a list, and never reuses a removed person's id", async () => {
    const engine = open();
    const { list } = await ready(engine, people(2));
    engine.removeRow(list.id, "r2");
    const added = engine.addRow(list.id, { email: "New@x.test", values: { first_name: "N" } });
    expect(added.row_id).toBe("r2");
    engine.removeRow(list.id, "r1");
    expect(engine.addRow(list.id, { email: "two@x.test" }).row_id).toBe("r3");
    expect(() => engine.addRow(list.id, { email: "new@x.test" })).toThrow("already on this list");
    expect(() => engine.addRow(list.id, { email: "nope" })).toThrow("not an email");
  });
});

describe("files written before these features", () => {
  it("read back as an everyone mailing that skips those already written to", async () => {
    const engine = open();
    const { id } = await ready(engine, people(2));
    const file = join(dir, "mailings", `${id}.json`);
    const old = JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
    delete old.pick_only;
    delete old.picked;
    delete old.skip_written;
    writeFileSync(file, JSON.stringify(old));
    const reopened = open().mailingDetail(id, {});
    expect(reopened.mailing).toMatchObject({
      pick_only: false,
      picked_count: 0,
      skip_written: true,
    });
    expect(reopened.audience.sendable).toBe(2);
  });
});

describe("a real send", () => {
  it("needs a key, a verified sender, a test of these words and the count typed", async () => {
    const engine = open();
    const list = engine.importList({ name: "Seed", file_name: "s.csv", text: people(2) }).list;
    const id = engine.createMailing({ name: "Intro" }).mailing.id;
    engine.updateMailing(id, { subject: "Hello", body: "Hi {{first_name}}", list_ids: [list.id] });
    expect(() => engine.startMailing(id, { confirm: 2 })).toThrow("Say who it is from");
    engine.saveSettings({ from_email: "aaryan@quantify.test" });
    expect(() => engine.startMailing(id, { confirm: 2 })).toThrow("Add the provider key");
    await expect(engine.testMailing(id, { to: "me@quantify.test" })).rejects.toThrow(
      "needs the provider key",
    );
    provider.verified = false;
    await engine.setKey({ key: KEY });
    expect(() => engine.startMailing(id, { confirm: 2 })).toThrow(
      "does not know aaryan@quantify.test",
    );
    provider.verified = true;
    await engine.checkProvider();
    expect(() => engine.startMailing(id, { confirm: 2 })).toThrow("Send yourself a test");
    await engine.testMailing(id, { to: "me@quantify.test" });
    expect(provider.sent[0]).toMatchObject({
      to_email: "me@quantify.test",
      subject: "[Test] Hello",
    });
    engine.updateMailing(id, { body: "Hi {{first_name}}, changed" });
    expect(() => engine.startMailing(id, { confirm: 2 })).toThrow("wording changed since the test");
    await engine.testMailing(id, { to: "me@quantify.test" });
    expect(() => engine.startMailing(id, { confirm: 3 })).toThrow("Type 2 to send");
    expect(() => engine.startMailing(id, {})).toThrow("Type 2 to send");
    engine.startMailing(id, { confirm: 2 });
    expect(engine.mailingDetail(id, {}).mailing).toMatchObject({ state: "sending", mode: "live" });
  });

  it("makes each message out to its person, with a way to stop and nothing a cell holds as markup", async () => {
    const engine = open();
    const { id } = await ready(
      engine,
      'First Name,Firm,Email\nAsha,"Peak <b>VC</b>",asha@peak.test\n',
    );
    engine.startMailing(id, { confirm: 1 });
    expect(await drain(engine)).toEqual(["sent", "finished"]);
    expect(provider.sent[0]).toMatchObject({
      to_email: "asha@peak.test",
      to_name: "Asha",
      from_email: "aaryan@quantify.test",
      from_name: "Aaryan",
      reply_to: "aaryan@quantify.test",
      subject: "Quantify Terminal x Peak <b>VC</b>",
      headers: { "List-Unsubscribe": "<mailto:aaryan@quantify.test?subject=unsubscribe>" },
    });
    expect(provider.sent[0]!.html).toContain("<p>Hi Asha,</p>");
    expect(provider.sent[0]!.text).toContain("If you would rather not hear from me again");
    expect(engine.status().sent_today).toBe(2);
  });

  it("writes to nobody twice, across lists and across a restart", async () => {
    let engine = open();
    const { id, list } = await ready(engine, people(5));
    const second = engine.importList({
      name: "Angels",
      file_name: "a.csv",
      text: "First Name,Firm,Email\nP2 again,Firm 2,P2@fund.test\nNew,Solo,new@angel.test\n",
    }).list;
    engine.updateMailing(id, { list_ids: [list.id, second.id] });
    await engine.testMailing(id, { to: "me@quantify.test" });
    provider.calls = [];
    expect(engine.mailingDetail(id, {}).audience).toMatchObject({ sendable: 6, duplicates: 1 });
    engine.startMailing(id, { confirm: 6 });
    await engine.step();
    await engine.step();
    // The sender stops with two gone. It comes back paused, and carries on from there.
    engine = open();
    expect(engine.mailingDetail(id, {}).mailing).toMatchObject({ state: "paused" });
    expect(await engine.step()).toBe("idle");
    engine.resumeMailing(id);
    await drain(engine);
    expect(provider.calls.sort()).toEqual(
      [
        "new@angel.test",
        "p1@fund.test",
        "p2@fund.test",
        "p3@fund.test",
        "p4@fund.test",
        "p5@fund.test",
      ].sort(),
    );
    expect(engine.mailingDetail(id, {}).mailing.progress).toMatchObject({
      total: 6,
      sent: 6,
      waiting: 0,
    });
  });

  it("calls a message that was going out when the sender died 'may have been sent', never sends it again", async () => {
    let engine = open();
    const { id } = await ready(engine, people(3));
    engine.startMailing(id, { confirm: 3 });
    await engine.step();
    // The second message is handed over and the answer never arrives in this process.
    let release: (value: SendResult) => void = () => {};
    provider.send = (mail) => {
      provider.calls.push(mail.to_email);
      return new Promise<SendResult>((resolve) => (release = resolve));
    };
    void engine.step();
    await Promise.resolve();
    engine = open();
    release({ status: "sent", message_id: "", error_code: "", retry_after_seconds: null });
    provider = new Scripted();
    engine = open();
    engine.resumeMailing(id);
    await drain(engine);
    expect(provider.calls).toEqual(["p3@fund.test"]);
    const rows = engine.mailingDetail(id, {}).recipients.rows;
    expect(rows.map((row) => row.state)).toEqual(["sent", "unknown", "sent"]);
    expect(rows[1]!.reason).toContain("may have been sent");
  });

  it("treats a provider that breaks as 'may have been sent' too", async () => {
    const engine = open();
    const { id } = await ready(engine, people(2));
    provider.breakOn = "p1@fund.test";
    engine.startMailing(id, { confirm: 2 });
    expect(await drain(engine)).toEqual(["unknown", "sent", "finished"]);
    expect(provider.calls).toEqual(["p1@fund.test", "p2@fund.test"]);
  });

  it("never writes to someone on the stop list, before the send or during it", async () => {
    const engine = open();
    const { id } = await ready(engine, people(4));
    engine.addStops({ emails: "P2@fund.test, nonsense" });
    expect(engine.mailingDetail(id, {}).audience).toMatchObject({ sendable: 3, left_out: 1 });
    engine.startMailing(id, { confirm: 3 });
    await engine.step();
    engine.addStops({ emails: "p4@fund.test", reason: "asked" });
    await drain(engine);
    expect(provider.calls).toEqual(["p1@fund.test", "p3@fund.test"]);
    const rows = engine.mailingDetail(id, {}).recipients.rows;
    expect(
      rows.filter((row) => row.state === "skipped").map((row) => [row.email, row.reason]),
    ).toEqual([
      ["p4@fund.test", "On the stop list"],
      ["p2@fund.test", "On the stop list"],
    ]);
  });

  it("leaves out someone with nothing for a field, and keeps them with a fallback", async () => {
    const engine = open();
    const { id } = await ready(
      engine,
      "First Name,Firm,Email\nAsha,Peak,asha@peak.test\n,Nine,ben@nine.test\n",
    );
    const before = engine.mailingDetail(id, {});
    expect(before.audience).toMatchObject({ sendable: 1, left_out: 1 });
    expect(before.checks.find((check) => check.key === "missing_first_name")?.label).toContain(
      "1 person has nothing for first_name",
    );
    engine.updateMailing(id, { body: "Hi {{first_name|there}}" });
    expect(engine.mailingDetail(id, {}).audience).toMatchObject({ sendable: 2, left_out: 0 });
  });

  it("will not start with a field that is not a column", async () => {
    const engine = open();
    const { id } = await ready(engine);
    engine.updateMailing(id, { body: "Hi {{frist_name}}" });
    expect(() => engine.startMailing(id, { practice: true })).toThrow(
      "{{frist_name}} is not a column",
    );
  });

  it("stops at the day's limit and carries on the next day", async () => {
    const engine = open();
    const { id } = await ready(engine, people(5));
    engine.saveSettings({ daily_cap: 3 });
    // The test already used one of today's three.
    engine.startMailing(id, { confirm: 5 });
    expect(await drain(engine)).toEqual(["sent", "sent", "paused"]);
    expect(engine.mailingDetail(id, {}).mailing.pause_reason).toContain("Today's limit of 3");
    expect(() => engine.resumeMailing(id)).toThrow("Today's limit is reached");
    clock = new Date("2026-11-07T04:00:00.000Z");
    engine.resumeMailing(id);
    expect(await drain(engine)).toEqual(["sent", "sent", "sent", "finished"]);
    expect(provider.calls).toHaveLength(5);
  });

  it("stops when the provider refuses the key, with nobody used up", async () => {
    const engine = open();
    const { id } = await ready(engine, people(3));
    provider.script.set("p2@fund.test", ["auth_failed", "sent"]);
    engine.startMailing(id, { confirm: 3 });
    expect(await drain(engine)).toEqual(["sent", "paused"]);
    expect(engine.mailingDetail(id, {}).mailing.pause_reason).toContain("did not accept the key");
    expect(engine.mailingDetail(id, {}).mailing.progress).toMatchObject({ sent: 1, waiting: 2 });
    // A restart here must not read the refused attempt as "may have been sent".
    const again = open();
    again.resumeMailing(id);
    expect(await drain(again)).toEqual(["sent", "sent", "finished"]);
    expect(again.mailingDetail(id, {}).mailing.progress).toMatchObject({ sent: 3, unknown: 0 });
  });

  it("waits and tries again when the provider is busy, and stops when it stays down", async () => {
    const engine = open();
    const { id } = await ready(engine, people(2));
    provider.script.set("p1@fund.test", ["retry", "sent"]);
    engine.startMailing(id, { confirm: 2 });
    expect(await drain(engine)).toEqual(["waiting", "sent", "sent", "finished"]);
    const again = engine.duplicateMailing(id).mailing.id;
    engine.updateMailing(again, { skip_written: false });
    await engine.testMailing(again, { to: "me@quantify.test" });
    provider.script.set("p1@fund.test", ["retry"]);
    engine.startMailing(again, { confirm: 2 });
    expect(await drain(engine)).toEqual(["waiting", "waiting", "paused"]);
    expect(engine.mailingDetail(again, {}).mailing.pause_reason).toContain("not answering");
    expect(engine.mailingDetail(again, {}).mailing.progress).toMatchObject({ sent: 0, waiting: 2 });
  });

  it("stops itself when too many of the latest are refused", async () => {
    const engine = open();
    const { id } = await ready(engine, people(30));
    for (const index of [3, 5, 7, 9, 11]) provider.script.set(`p${index}@fund.test`, ["failed"]);
    engine.startMailing(id, { confirm: 30 });
    const seen = await drain(engine);
    expect(seen.at(-1)).toBe("paused");
    expect(seen.filter((outcome) => outcome === "failed")).toHaveLength(4);
    expect(engine.mailingDetail(id, {}).mailing.pause_reason).toContain(
      "5 of the last 11 were refused",
    );
    expect(provider.calls).toHaveLength(11);
  });

  it("will not go out with a blank left in the words, though a practice run may", async () => {
    const engine = open();
    const { id } = await ready(engine, people(2));
    engine.updateMailing(id, {
      body: "Hi {{first_name}}. Deck: [link]\n\n[Company postal address]",
    });
    await engine.testMailing(id, { to: "me@quantify.test" });
    expect(() => engine.startMailing(id, { confirm: 2 })).toThrow(
      "Fill in [link] and [Company postal address]",
    );
    engine.startMailing(id, { practice: true });
    expect(engine.mailingDetail(id, {}).mailing.mode).toBe("practice");
  });

  it("says so when nothing tells a reader how to stop", async () => {
    const engine = open();
    const { id } = await ready(engine, people(1));
    engine.saveSettings({ footer: "" });
    const advised = () => engine.mailingDetail(id, {}).checks.find((c) => c.key === "opt_out");
    expect(advised()).toMatchObject({ ok: false, blocking: false });
    engine.updateMailing(id, { body: `Hi {{first_name}}. If this isn't a fit, reply "no".` });
    expect(advised()).toBeUndefined();
  });

  it("sends to one tier, holds back the rows marked to check, and says who was held", async () => {
    const engine = open();
    const { id } = await ready(
      engine,
      [
        "First Name,Email,Firm,Tier,CheckFirst",
        "Al,a@fund.test,Alpha,1,",
        "Be,b@fund.test,Beta,1,Conflict with a portfolio company",
        "Ga,c@fund.test,Gamma,2,",
      ].join("\n"),
    );
    engine.updateMailing(id, {
      body: "Hi {{firm}}",
      subject: "Note for {{firm}}",
      only_column: "tier",
      only_value: "1",
      hold_column: "checkfirst",
    });
    await engine.testMailing(id, { to: "me@quantify.test" });
    provider.calls = [];
    const detail = engine.mailingDetail(id, {});
    expect(detail.audience).toMatchObject({ sendable: 1, left_out: 1 });
    expect(detail.checks.find((check) => check.key === "held")?.label).toContain(
      "1 person is held back by checkfirst",
    );
    engine.startMailing(id, { confirm: 1 });
    await drain(engine);
    expect(provider.calls).toEqual(["a@fund.test"]);
    const rows = engine.mailingDetail(id, {}).recipients.rows;
    expect(rows.map((row) => [row.email, row.state, row.reason])).toEqual([
      ["a@fund.test", "sent", ""],
      ["b@fund.test", "skipped", "Held back: Conflict with a portfolio company"],
    ]);
    const other = engine.createMailing({ name: "X" }).mailing.id;
    expect(() => engine.updateMailing(other, { only_column: "tier" })).toThrow("Say which tier");
  });

  it("leaves out whoever another mailing reached, unless asked to write again", async () => {
    const engine = open();
    const { id } = await ready(engine, people(2));
    engine.startMailing(id, { confirm: 2 });
    await drain(engine);
    const copy = engine.duplicateMailing(id).mailing.id;
    const check = (key: string) =>
      engine.mailingDetail(copy, {}).checks.find((item) => item.key === key);
    expect(engine.mailingDetail(copy, {}).audience).toMatchObject({ sendable: 0, left_out: 2 });
    expect(check("already_left_out")?.label).toContain("2 people were already written to");
    engine.updateMailing(copy, { skip_written: false });
    expect(engine.mailingDetail(copy, {}).audience).toMatchObject({ sendable: 2, left_out: 0 });
    expect(check("already_written")?.label).toContain(
      '2 people were already written to by "Intro", and will be written to again',
    );
  });

  it("remembers who was written to after the mailing is deleted, and after a restart", async () => {
    let engine = open();
    const { id, list } = await ready(engine, people(3));
    engine.startMailing(id, { confirm: 3 });
    await drain(engine);
    expect(engine.status().sent_today).toBe(4);
    engine.deleteMailing(id);
    // Deleting it frees neither the people nor the day's limit.
    expect(engine.status().sent_today).toBe(4);
    engine = open();
    expect(engine.status().sent_today).toBe(4);
    const next = engine.createMailing({ name: "Next" }).mailing.id;
    engine.updateMailing(next, { subject: "S", body: "Hi {{first_name}}", list_ids: [list.id] });
    expect(engine.mailingDetail(next, {}).audience).toMatchObject({ sendable: 0, left_out: 3 });
  });

  it("counts a practice as nobody written to", async () => {
    const engine = open();
    const { id } = await ready(engine, people(2));
    engine.startMailing(id, { practice: true });
    await drain(engine);
    const copy = engine.duplicateMailing(id).mailing.id;
    expect(engine.mailingDetail(copy, {}).audience.sendable).toBe(2);
  });

  it("cannot be changed or sent again once real mail has gone, but can be copied", async () => {
    const engine = open();
    const { id } = await ready(engine, people(2));
    engine.startMailing(id, { confirm: 2 });
    await drain(engine);
    expect(() => engine.updateMailing(id, { subject: "Different" })).toThrow("Make a copy");
    expect(() => engine.startMailing(id, { confirm: 2 })).toThrow("has gone out");
    const copy = engine.duplicateMailing(id).mailing;
    expect(copy).toMatchObject({ name: "Intro (copy)", state: "draft", editable: true });
    expect(copy.progress.total).toBe(0);
  });

  it("sends one mailing at a time, and pauses and cancels on a word", async () => {
    const engine = open();
    const { id, list } = await ready(engine, people(3));
    const other = engine.createMailing({ name: "Second" }).mailing.id;
    engine.updateMailing(other, { subject: "S", body: "B", list_ids: [list.id] });
    engine.startMailing(id, { confirm: 3 });
    expect(() => engine.startMailing(other, { practice: true })).toThrow('"Intro" is sending');
    await engine.step();
    engine.pauseMailing(id);
    expect(await engine.step()).toBe("idle");
    expect(() => engine.deleteList(list.id)).toThrow("part-way through");
    engine.cancelMailing(id);
    expect(engine.mailingDetail(id, {}).mailing).toMatchObject({ state: "cancelled" });
    expect(provider.calls).toEqual(["p1@fund.test"]);
  });

  it("brings in the addresses the provider itself will not mail", async () => {
    const engine = open();
    await engine.setKey({ key: KEY });
    provider.blocked = [
      { email: "Gone@fund.test", reason: "hardBounce", blocked_at: "2026-11-05T10:00:00.000Z" },
      { email: "no@fund.test", reason: "unsubscribedViaEmail", blocked_at: "" },
      { email: "not an address", reason: "adminBlocked", blocked_at: "" },
    ];
    expect(await engine.syncStops()).toEqual({ added: 2, seen: 3 });
    expect(
      engine
        .stops({})
        .stops.map((stop) => [stop.email, stop.reason])
        .sort(),
    ).toEqual([
      ["gone@fund.test", "bounced"],
      ["no@fund.test", "asked"],
    ]);
    expect(await engine.syncStops()).toEqual({ added: 0, seen: 3 });
  });
});
