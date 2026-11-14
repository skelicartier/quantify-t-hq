/**
 * The people ledger (ws-notes/company/spec.md §8): interns, employees and contractors with
 * their terms, mentor and brief, signed documents (copies kept with the ledger in
 * `people/files/`, never in Files), the midpoint and final
 * evaluations, the certificate the final one gates, a stipend ledger (a record of what was
 * paid: HQ never prorates and never works out tax), the access each holds, and the
 * offboarding deadlines.
 *
 * For the Owner only. The portal checks the role on every page, action and route; this
 * module adds what it can: every Due row is `owner_only` (core leaves them out unless the
 * Owner asks), and nothing of the ledger is given to search, the agenda, a file's "Used
 * for" or the overview. The one service it provides, `people-letters`, answers four counts
 * and never a name, an amount or an id.
 */

import { createHash, randomUUID } from "node:crypto";
import { closeSync, fsyncSync, openSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";

import { Refused } from "../../mail-merge/engine";
import { COMPANY_SERVICES, type PeopleLetters } from "../company-contracts";
import type { Answer, Ctx, DataCore } from "../core";
import { LIMITS, clean } from "../guard";
import { extensionOf, servedType, sniff } from "../files/sniff";
import type { Staff } from "../protocol";
import { syncFolder, writeAll } from "../store";
import { toCsv } from "../text";
import { ENGAGEMENT_KINDS, PEOPLE_TABS, TAX_TREATMENT } from "../../../src/lib/data/labels-people";
import {
  PeopleBook,
  deadlinesOf,
  dueRowsOf,
  engagedOn,
  heldGrants,
  ipSignedOn,
  letterSignedOn,
  nextOf,
  periodsOf,
  stateOf,
  warningsOf,
} from "./book";
import { COPY_FOLDER, COPY_MAX_BYTES, WALK_PERSON_ID } from "./limits";
import type { Person, PersonCopy } from "./types";

const BOM = "\uFEFF";
const ATTEMPTS = "people/attempts.jsonl";
const ATTEMPT_KEEP_MS = 24 * 60 * 60 * 1_000;

type Tab = keyof typeof PEOPLE_TABS;

export async function register(core: DataCore): Promise<void> {
  const book = new PeopleBook(core);
  core.store.ensureDir(COPY_FOLDER);

  // ---------------------------------------------------------------- replays, kept under people/

  /**
   * A repeated submit replays its first answer, as everywhere in Data; but the answers here
   * hold the ledger, and Data's own replay log sits at its root, where every backup takes it.
   * So this module keeps its replays under `people/` (left out of a backup an Admin makes)
   * and takes the attempt off the request, so core never writes the answer down.
   */
  type Replay = { attempt: string; path: string; answer: Answer; at: string };
  const replays = new Map<string, Replay>();
  const cutoff = Date.parse(core.now()) - ATTEMPT_KEEP_MS;
  const kept = core.store
    .readLines<Replay>(ATTEMPTS)
    .filter((line) => typeof line?.attempt === "string" && Date.parse(line.at) >= cutoff);
  for (const line of kept) replays.set(line.attempt, line);
  core.store.writeText(
    ATTEMPTS,
    kept.map((line) => JSON.stringify(line)).join("\n") + (kept.length ? "\n" : ""),
  );

  async function once(ctx: Ctx, make: () => Answer | Promise<Answer>): Promise<Answer> {
    const attempt = ctx.attempt;
    ctx.attempt = null;
    if (attempt) {
      const prior = replays.get(attempt);
      if (prior && prior.path === ctx.path) return prior.answer;
    }
    const answer = await make();
    if (attempt) {
      const line: Replay = { attempt, path: ctx.path, answer, at: core.now() };
      replays.set(attempt, line);
      core.store.appendLine(ATTEMPTS, line);
    }
    return answer;
  }

  /** Every write here goes through `once`. */
  const post = (pattern: string, handler: (ctx: Ctx) => Answer | Promise<Answer>) =>
    core.route("POST", pattern, (ctx) => once(ctx, () => handler(ctx)));

  // ---------------------------------------------------------------- what leaves: Due and four counts

  core.provideDue(() => {
    const today = core.day();
    return book.people.flatMap((person) => dueRowsOf(person, today));
  });

  const letters: PeopleLetters = {
    counts: (today) => {
      const engaged = book.people.filter((person) => engagedOn(person, today));
      const interns = engaged.filter(
        (person) => person.kind === "intern" || person.kind === "contractor",
      );
      return {
        engaged: engaged.length,
        with_letter: engaged.filter((person) => letterSignedOn(person, today) !== null).length,
        interns_and_contractors: interns.length,
        with_ip: interns.filter((person) => ipSignedOn(person, today) !== null).length,
      };
    },
  };
  core.provide(COMPANY_SERVICES.peopleLetters, letters);

  // ---------------------------------------------------------------- copies kept with the ledger

  /**
   * A document's or certificate's copy, sent as base64 (`content` and `name`) and kept in
   * `people/files/` (0600, written beside and renamed over, as the store writes), never in
   * Files: Files is for Owners and Admins, every backup holds its bytes, and a letter holds
   * the person's terms. At most 3 MiB, as any copy sent in one request; its kind is read from
   * its first bytes with Files' own sniffing. Null when none was given.
   */
  function keepCopy(body: Record<string, unknown>, by: Staff): PersonCopy | null {
    if (clean(body.file_id, 64))
      throw new Refused(
        400,
        "invalid",
        "Attach the signed copy itself: the people ledger keeps its own copies, never in Files.",
      );
    const content = typeof body.content === "string" ? body.content : "";
    if (!content) return null;
    const name = clean(body.name, LIMITS.file_name).replace(/[\\/]/g, "_") || "Signed copy";
    const bytes = Buffer.from(content, "base64");
    if (bytes.length === 0) throw new Refused(400, "empty", "That file is empty.");
    if (bytes.length > COPY_MAX_BYTES)
      throw new Refused(400, "too_large", "That copy is over 3 MB. Add a smaller scan of it.");
    const copy_id = randomUUID();
    const extension = /^[a-z0-9]{1,8}$/.test(extensionOf(name)) ? extensionOf(name) : "bin";
    const file = `${copy_id}.${extension}`;
    const target = core.store.path(COPY_FOLDER, file);
    const beside = `${target}.writing`;
    const fd = openSync(beside, "w", 0o600);
    try {
      writeAll(fd, bytes);
      fsyncSync(fd);
      closeSync(fd);
    } catch (error) {
      closeSync(fd);
      rmSync(beside, { force: true });
      throw error;
    }
    renameSync(beside, target);
    syncFolder(dirname(target));
    return {
      copy_id,
      file,
      name,
      mime: sniff(bytes.subarray(0, 8_192), name).mime,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      at: core.now(),
      by,
    };
  }

  // ---------------------------------------------------------------- reads

  /** A list row: the person, with the grants replaced by their counts. */
  const rowOf = (person: Person, today: string) => {
    const held = heldGrants(person).length;
    const letterOn = letterSignedOn(person);
    return {
      ...person,
      state: stateOf(person, today),
      letter: letterOn ? ("signed" as const) : ("missing" as const),
      letter_on: letterOn,
      next: nextOf(person, today),
      access: { held, to_revoke: person.offboarding ? held : 0 },
    };
  };

  const inTab = (person: Person, tab: Tab, today: string): boolean => {
    const state = stateOf(person, today);
    if (tab === "all") return true;
    if (tab === "engaged") return state === "engaged" || state === "offboarding";
    return state === tab;
  };

  core.route("GET", "/data/people", (ctx) => {
    const today = core.day();
    const asked = clean(ctx.query.get("state"), 20);
    const tab: Tab = asked in PEOPLE_TABS ? (asked as Tab) : "all";
    const counts: Record<Tab, number> = { engaged: 0, starting: 0, ended: 0, all: 0 };
    for (const person of book.people)
      for (const key of Object.keys(counts) as Tab[])
        if (inTab(person, key, today)) counts[key] += 1;
    const people = book.people
      .filter((person) => inTab(person, tab, today))
      .sort(
        (a, b) => b.starts_on.localeCompare(a.starts_on) || a.name.localeCompare(b.name, "en-GB"),
      )
      .map((person) => rowOf(person, today));
    return { people, counts, state: tab, today };
  });

  const personAnswer = (person: Person) => ({ person });

  post("/data/people", (ctx) => {
    const by = ctx.staff();
    return personAnswer(book.add(ctx.body, by));
  });

  core.route("GET", "/data/people/:id", (ctx) => {
    const today = core.day();
    const person = book.person(ctx.params[0]);
    return {
      person,
      state: stateOf(person, today),
      periods: periodsOf(person, today),
      deadlines: deadlinesOf(person),
      warnings: warningsOf(person, today),
      next: nextOf(person, today),
      events: book.eventsOf(person.person_id),
      today,
    };
  });

  post("/data/people/:id/update", (ctx) => {
    const by = ctx.staff();
    return personAnswer(book.update(book.person(ctx.params[0]), ctx.body, by));
  });

  post("/data/people/:id/documents", (ctx) => {
    const by = ctx.staff();
    const today = core.day();
    const person = book.person(ctx.params[0]);
    const fields = book.documentFields(person, ctx.body, today);
    return personAnswer(book.addDocument(person, fields, keepCopy(ctx.body, by), by));
  });

  post("/data/people/:id/evaluations/:which", (ctx) => {
    const by = ctx.staff();
    return personAnswer(
      book.recordEvaluation(book.person(ctx.params[0]), ctx.params[1], ctx.body, by, core.day()),
    );
  });

  post("/data/people/:id/certificate", (ctx) => {
    const by = ctx.staff();
    const person = book.person(ctx.params[0]);
    const fields = book.certificateFields(person, ctx.body, core.day());
    return personAnswer(book.recordCertificate(person, fields, keepCopy(ctx.body, by), by));
  });

  /**
   * A copy's bytes, as base64, for the portal's Owner-only route. In JSON because the host
   * streams only Files' and builds' bytes (`host.ts`, which this batch leaves alone); a copy
   * is at most 3 MiB, so the answer stays well under what one answer carries.
   */
  core.route("GET", "/data/people/:id/copies/:copyId", (ctx) => {
    const person = book.person(ctx.params[0]);
    const copy = book.copy(person, ctx.params[1]);
    const bytes = core.store.readBytes(`${COPY_FOLDER}/${copy.file}`);
    if (!bytes) throw new Refused(404, "not_found", "This copy's bytes are missing from this Mac.");
    return {
      copy,
      type: servedType(copy.mime),
      content: Buffer.from(bytes).toString("base64"),
    };
  });

  post("/data/people/:id/payments", (ctx) => {
    const by = ctx.staff();
    return personAnswer(book.recordPayment(book.person(ctx.params[0]), ctx.body, by, core.day()));
  });

  post("/data/people/:id/payments/:paymentId/withdraw", (ctx) => {
    const by = ctx.staff();
    return personAnswer(
      book.withdrawPayment(book.person(ctx.params[0]), ctx.params[1], ctx.body, by),
    );
  });

  post("/data/people/:id/access", (ctx) => {
    const by = ctx.staff();
    return personAnswer(book.grantAccess(book.person(ctx.params[0]), ctx.body, by, core.day()));
  });

  post("/data/people/:id/access/:accessId/revoke", (ctx) => {
    const by = ctx.staff();
    return personAnswer(
      book.revokeAccess(book.person(ctx.params[0]), ctx.params[1], ctx.body, by, core.day()),
    );
  });

  post("/data/people/:id/access/:accessId/never", (ctx) => {
    const by = ctx.staff();
    return personAnswer(book.neverHad(book.person(ctx.params[0]), ctx.params[1], by));
  });

  post("/data/people/:id/offboard", (ctx) => {
    const by = ctx.staff();
    const person = book.startOffboarding(book.person(ctx.params[0]), ctx.body, by);
    return { person, deadlines: deadlinesOf(person) };
  });

  post("/data/people/:id/offboard/cancel", (ctx) => {
    const by = ctx.staff();
    const person = book.cancelOffboarding(book.person(ctx.params[0]), by);
    return { person, deadlines: deadlinesOf(person) };
  });

  // ---------------------------------------------------------------- the stipends CSV

  core.builds.provide("stipends_csv", async (handle, input) => {
    const today = core.day();
    const only = clean(input.body.person_id, 64);
    const people = book.people
      .filter((person) => !only || person.person_id === only)
      .sort((a, b) => a.name.localeCompare(b.name, "en-GB"));
    const rows: (string | number)[][] = [];
    for (const person of people)
      for (const period of periodsOf(person, today))
        for (const payment of period.paid)
          rows.push([
            person.name,
            ENGAGEMENT_KINDS[person.kind],
            period.period,
            period.due_on ?? "",
            payment.amount,
            payment.currency,
            payment.paid_on,
            payment.reference,
            payment.tds_deducted ?? "",
            TAX_TREATMENT,
            payment.withdrawn
              ? `Withdrawn ${payment.withdrawn.at.slice(0, 10)}: ${payment.withdrawn.why}`
              : "",
          ]);
    handle.setProgress(0, rows.length);
    await core.yield();
    writeFileSync(
      handle.path,
      BOM +
        toCsv(
          [
            "person",
            "kind",
            "period",
            "due_on",
            "amount",
            "currency",
            "paid_on",
            "reference",
            "tds_deducted",
            "tax_treatment",
            "withdrawn",
          ],
          rows,
        ),
      { mode: 0o600 },
    );
    handle.setProgress(rows.length, rows.length);
    core.store.appendLine("people/exports.jsonl", {
      at: core.now(),
      by: input.by,
      kind: "stipends",
      rows: rows.length,
    });
    return { name: `Stipends ${today}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    /** The walk's intern gets the fixed id `walk-intern`, once, so the harness can open them. */
    core.route("POST", "/data/_test/people/pin", (ctx) => {
      ctx.staff();
      const person = book.pin(clean(ctx.body.id, 64), WALK_PERSON_ID);
      return { person_id: person.person_id };
    });

    /** What `people-letters` answers today (or on `?day=`), as another module would read it. */
    core.route("GET", "/data/_test/people/letters", (ctx) => {
      const day = clean(ctx.query.get("day"), 10) || core.day();
      return {
        counts: core.need<PeopleLetters>(COMPANY_SERVICES.peopleLetters)?.counts(day) ?? null,
        day,
      };
    });
  }
}
