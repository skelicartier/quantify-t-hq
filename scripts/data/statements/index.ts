/**
 * Bank statements (ws-notes/duties/spec.md §9.2–§9.5): bank and card accounts, statements
 * imported in two steps from CSV, delimited text, OFX or QFX by parsers written here, lines
 * with a category and a match, and cash and burn per currency worked out from them.
 *
 * For the Owner only, at the service too: a statement names who was paid what. Every route
 * under `/data/statements/` but the summary refuses without the Owner flag (`?owner=1` on a
 * GET, `owner: true` in a POST body, which the portal sets from the role and nothing else).
 * The summary and the `statements` service give totals only: no line, narration, reference,
 * name of a person or account number. Nothing here is given to search, the calendar, a
 * file's "Used for" or Files; replays of creating POSTs are kept under `statements/`, never
 * in core's log, which every backup takes.
 */

import { Refused } from "../../mail-merge/engine";
import { minorInput } from "../../../src/lib/data/labels-duties";
import {
  STATEMENTS_OWNER_REFUSAL,
  accountLabel,
  acceptedWords,
  fromStatementsWords,
  gapWords,
} from "../../../src/lib/data/labels-statements";
import type { Answer, Ctx, DataCore } from "../core";
import { addDays } from "../days";
import {
  DUTIES_SERVICES,
  periodEnd,
  periodOf,
  standInDutyRules,
  type CategoryView,
  type DutyRuleKey,
  type DutyStored,
  type MoneyLookup,
  type MonthLock,
  type PeoplePay,
  type StatementsFeed,
} from "../duties-contracts";
import { clean, cleanText, isDay } from "../guard";
import type { Staff } from "../protocol";
import { toCsv } from "../text";
import { StatementsBook, signedMinorOf } from "./book";
import {
  balanceAt,
  cashNowOf,
  cashOf,
  monthOf,
  type AccountHistory,
  type CashDetail,
} from "./cash";
import {
  applyMatch,
  linkedIdOf,
  stipendTitle,
  suggestionsFor,
  sureBillOf,
  takeBack,
  type MatchSources,
  type Suggestion,
} from "./match";
import { ATTEMPTS, FILES_FOLDER, NOTE_MAX, STIPEND_DAYS, WHY_MAX } from "./limits";
import type { Account, Line, Statement } from "./types";
import {
  WALK_ACCOUNT,
  WALK_ACCOUNT_ID,
  WALK_FILE_NAME,
  fakeMoney,
  fakePeoplePay,
  walkStatementCsv,
} from "./walk-seed";

/** What the close module and the MIS read: U4's own seam, not in the contract. */
export const STATEMENTS_INSIDE = "statements-inside";
export type StatementsInside = {
  book: StatementsBook;
  histories(): AccountHistory[];
  cash(upTo?: string): CashDetail[];
  categories(): CategoryView[];
  /** Test routes only: the walk's account and its three months, safe to run twice. */
  seed?: (by: Staff, withImport: boolean) => Answer;
};

const ATTEMPT_KEEP_MS = 24 * 60 * 60 * 1_000;
const PERIOD = /^\d{4}-(0[1-9]|1[0-2])$/;

/** The stand-ins this unit installs (test routes only), so another of its routes may replace them. */
export const FAKES = new WeakSet<object>();

/** Install a stand-in only while no real provider is loaded; `{ on: false }` removes only a stand-in. */
export function standInRoute(
  core: DataCore,
  name: string,
  make: (body: Record<string, unknown>) => object,
): (ctx: Ctx) => Answer {
  return (ctx) => {
    ctx.staff();
    const current = core.need<object>(name);
    const real = current !== null && !FAKES.has(current);
    if (ctx.body.on === false) {
      if (current && !real) core.provide(name, null);
      return { installed: false, real };
    }
    if (real) return { installed: false, real: true };
    const fake = make(ctx.body);
    FAKES.add(fake);
    core.provide(name, fake);
    return { installed: true, real: false };
  };
}

/** `body.stored` as the rule book would keep it, for the stand-in `duty-rules`. */
export function storedOf(value: unknown): Partial<Record<DutyRuleKey, DutyStored>> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Partial<Record<DutyRuleKey, DutyStored>>)
    : {};
}

export async function register(core: DataCore): Promise<void> {
  const book = new StatementsBook(core);

  // ---------------------------------------------------------------- the other modules, asked now

  const money = () => core.need<MoneyLookup>(DUTIES_SERVICES.money);
  const people = () => core.need<PeoplePay>(DUTIES_SERVICES.peoplePay);
  const lock = () => core.need<MonthLock>(DUTIES_SERVICES.monthLock);
  const categories = (): CategoryView[] => {
    try {
      return money()?.categories() ?? [];
    } catch {
      return [];
    }
  };
  const cash = (upTo?: string) => cashOf(book.histories(), categories(), upTo);

  const feed: StatementsFeed = { cash: () => cash().map(cashNowOf) };
  core.provide(DUTIES_SERVICES.statements, feed);
  const inside: StatementsInside = {
    book,
    histories: () => book.histories(),
    cash,
    categories,
  };
  core.provide(STATEMENTS_INSIDE, inside);

  // ---------------------------------------------------------------- the Owner, and replays kept here

  const refuseOwner = () => new Refused(403, "owner_only", STATEMENTS_OWNER_REFUSAL);
  const ownerGet = (ctx: Ctx) => {
    if (ctx.query.get("owner") !== "1") throw refuseOwner();
  };
  const ownerPost = (ctx: Ctx): Staff => {
    if (ctx.body.owner !== true) throw refuseOwner();
    return ctx.staff();
  };

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

  /** Every write here: the Owner flag, then a replay of the first answer for a repeated attempt. */
  const post = (pattern: string, handler: (ctx: Ctx, by: Staff) => Answer | Promise<Answer>) =>
    core.route("POST", pattern, async (ctx) => {
      const attempt = ctx.attempt;
      ctx.attempt = null;
      const by = ownerPost(ctx);
      if (attempt) {
        const prior = replays.get(attempt);
        if (prior && prior.path === ctx.path) return prior.answer;
      }
      const answer = await handler(ctx, by);
      if (attempt) {
        const line: Replay = { attempt, path: ctx.path, answer, at: core.now() };
        replays.set(attempt, line);
        core.store.appendLine(ATTEMPTS, line);
      }
      return answer;
    });
  const get = (pattern: string, handler: (ctx: Ctx) => Answer | Promise<Answer>) =>
    core.route("GET", pattern, (ctx) => {
      ownerGet(ctx);
      return handler(ctx);
    });

  const refuseLocked = (period: string) => {
    const months = lock();
    if (months?.isLocked(period)) throw new Refused(409, "month_locked", months.refusal(period));
  };

  // ---------------------------------------------------------------- views

  const toSortOf = (accountId: string) =>
    book.linesOf(accountId).filter((line) => !line.withdrawn && line.category_id === null).length;

  const accountRow = (history: AccountHistory) => ({
    account_id: history.account.account_id,
    name: history.account.name,
    kind: history.account.kind,
    currency: history.account.currency,
    covered_to: history.covered_to,
    closing_minor:
      history.covered_to === null ? null : balanceAt(history, history.covered_to, true),
    to_sort: toSortOf(history.account.account_id),
  });

  const cashAnswer = (detail: CashDetail) => ({
    ...cashNowOf(detail),
    runway_months: detail.runway_months,
    zero_on: detail.zero_on,
    words: fromStatementsWords(detail.months),
  });

  const statementView = (statement: Statement) => ({
    ...statement,
    file_name: book.fileName(statement, "file"),
    copy_name: statement.copy ? book.fileName(statement, "copy") : null,
  });

  /** Payment, receipt and stipend payment ids that live lines already link. */
  const linkedIds = () =>
    new Set(
      book
        .allLines()
        .filter((line) => !line.withdrawn && line.match !== null)
        .map((line) => linkedIdOf(line.match!)),
    );

  const sourcesFor = (
    account: Account,
    owner: boolean,
    around: { from: string; to: string },
  ): MatchSources => {
    const lookup = money();
    let bills: MatchSources["bills"] = [];
    let exports: MatchSources["exports"] = [];
    try {
      bills = lookup?.bills() ?? [];
      exports = lookup?.exportInvoices() ?? [];
    } catch {
      bills = [];
      exports = [];
    }
    let stipends: MatchSources["stipends"] = null;
    if (owner) {
      try {
        stipends =
          people()?.paid(addDays(around.from, -STIPEND_DAYS), addDays(around.to, STIPEND_DAYS)) ??
          null;
      } catch {
        stipends = null;
      }
    }
    return { account, bills, exports, stipends, linked: linkedIds() };
  };

  const matchWords = (line: Line, sources: MatchSources) => {
    const match = line.match;
    if (!match) return { title: null, href: null };
    if (match.kind === "bill_payment") {
      const bill = sources.bills.find((item) => item.bill_id === match.bill_id);
      return {
        title: bill ? `${bill.vendor_name} ${bill.invoice_number}` : "A bill in Money",
        href: bill?.href ?? null,
      };
    }
    if (match.kind === "export_receipt") {
      const invoice = sources.exports.find((item) => item.invoice_id === match.invoice_id);
      return {
        title: invoice
          ? `${invoice.customer} ${invoice.invoice_number}`
          : "An export invoice in Money",
        href: invoice?.href ?? null,
      };
    }
    let pay = sources.stipends?.find((item) => item.payment_id === match.payment_id);
    if (!pay)
      try {
        pay = people()
          ?.paid(addDays(line.posted_on, -60), addDays(line.posted_on, 60))
          .find((item) => item.payment_id === match.payment_id);
      } catch {
        pay = undefined;
      }
    return { title: pay ? stipendTitle(pay) : "A stipend payment", href: null };
  };

  const lineView = (
    line: Line,
    sources: MatchSources,
    named: ReadonlyMap<string, CategoryView>,
    locked: boolean,
  ) => {
    const category = line.category_id ? (named.get(line.category_id) ?? null) : null;
    const words = matchWords(line, sources);
    return {
      ...line,
      category: category
        ? {
            category_id: category.category_id,
            name: category.name,
            kind: category.kind,
            ledger: category.ledger,
          }
        : null,
      match_title: words.title,
      match_href: words.href,
      suggestions: locked ? [] : suggestionsFor(line, sources),
    };
  };

  // ---------------------------------------------------------------- routes: reads

  core.route("GET", "/data/statements/summary", () => ({
    accounts: book.histories().map(accountRow),
    cash: cash().map(cashNowOf),
    here: { money: money() !== null, people: people() !== null },
  }));

  get("/data/statements", () => {
    const histories = book.histories();
    const months = lock();
    return {
      accounts: histories.map((history) => ({
        ...accountRow(history),
        account: history.account,
        label: accountLabel(history.account),
        first_day: history.first_day,
        statements: book.statements
          .filter((statement) => statement.account_id === history.account.account_id)
          .sort(
            (a, b) => b.from.localeCompare(a.from) || b.imported_at.localeCompare(a.imported_at),
          )
          .map(statementView),
        gaps: history.gaps.map((gap) => ({ ...gap, words: gapWords(gap.from, gap.to) })),
      })),
      cash: cash().map(cashAnswer),
      here: { money: money() !== null, people: people() !== null, lock: months !== null },
    };
  });

  get("/data/statements/export", (ctx) => {
    const month = clean(ctx.query.get("month"), 7);
    const accountId = clean(ctx.query.get("account"), 64);
    if (month && !PERIOD.test(month)) throw new Refused(400, "invalid", "Choose a month.");
    const named = new Map(categories().map((category) => [category.category_id, category]));
    const accounts = accountId ? [book.account(accountId)] : book.accounts;
    const rows: (string | number)[][] = [];
    for (const account of accounts) {
      const sources = sourcesFor(account, true, {
        from: month ? `${month}-01` : "2000-01-01",
        to: month ? periodEnd(month) : core.day(),
      });
      for (const line of book.linesOf(account.account_id)) {
        if (line.withdrawn || (month && periodOf(line.posted_on) !== month)) continue;
        const category = line.category_id ? named.get(line.category_id) : undefined;
        rows.push([
          line.posted_on,
          accountLabel(account),
          line.narration,
          line.reference,
          line.direction === "debit" ? minorInput(line.amount_minor) : "",
          line.direction === "credit" ? minorInput(line.amount_minor) : "",
          account.currency,
          category?.name ?? "",
          category?.ledger ?? "",
          matchWords(line, sources).title ?? "",
          line.note,
        ]);
      }
    }
    rows.sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    return {
      name: `Statement lines${month ? ` ${month}` : ""}.csv`,
      csv: toCsv(
        [
          "Day",
          "Account",
          "Narration",
          "Reference",
          "Out",
          "In",
          "Currency",
          "Category",
          "Ledger",
          "Matched to",
          "Note",
        ],
        rows,
      ),
    };
  });

  get("/data/statements/accounts/:id/lines", (ctx) => {
    const account = book.account(ctx.params[0]);
    const history = book
      .histories()
      .find((item) => item.account.account_id === account.account_id)!;
    const all = book.linesOf(account.account_id);
    const months = [...new Set(all.map((line) => periodOf(line.posted_on)))].sort().reverse();
    const asked = clean(ctx.query.get("month"), 7);
    const month = PERIOD.test(asked) ? asked : (months[0] ?? periodOf(core.day()));
    const view =
      (["to_sort", "matched", "all"] as const).find((item) => item === ctx.query.get("view")) ??
      "to_sort";
    const locks = lock();
    const locked = locks?.isLocked(month) ?? false;
    const inMonth = all
      .filter((line) => periodOf(line.posted_on) === month)
      .sort((a, b) => a.posted_on.localeCompare(b.posted_on) || a.n - b.n);
    const shown = inMonth.filter((line) =>
      view === "all"
        ? true
        : view === "matched"
          ? line.match !== null
          : !line.withdrawn && line.category_id === null,
    );
    const sources = sourcesFor(account, true, { from: `${month}-01`, to: periodEnd(month) });
    const named = new Map(categories().map((category) => [category.category_id, category]));
    const lines = shown.map((line) => lineView(line, sources, named, locked));
    const sure = locked
      ? 0
      : inMonth.filter(
          (line) =>
            !line.withdrawn &&
            line.match === null &&
            sureBillOf(suggestionsFor(line, sources)) !== null,
        ).length;
    const figures = monthOf(history, month);
    return {
      account,
      label: accountLabel(account),
      months,
      month,
      view,
      lines,
      counts: {
        to_sort: inMonth.filter((line) => !line.withdrawn && line.category_id === null).length,
        matched: inMonth.filter((line) => line.match !== null).length,
        all: inMonth.length,
      },
      opening_minor: figures.opening_minor,
      in_minor: figures.in_minor,
      out_minor: figures.out_minor,
      closing_minor: figures.closing_minor,
      sure,
      locked,
      lock_words: locked && locks ? locks.refusal(month) : null,
      categories: money() ? categories().filter((category) => !category.retired) : null,
      here: { money: money() !== null, people: people() !== null },
    };
  });

  /** A statement's own file or the bank's PDF, as base64 for the portal's Owner-only route. */
  const fileAnswer = (statement: Statement, which: "file" | "copy"): Answer => {
    const stored = which === "copy" ? statement.copy : statement.file;
    if (!stored) throw new Refused(404, "not_found", "This statement has no PDF beside it.");
    const bytes = core.store.readBytes(`${FILES_FOLDER}/${stored.stored}`);
    if (!bytes) throw new Refused(404, "not_found", "This file's bytes are missing from this Mac.");
    const extension = stored.stored.split(".").pop() ?? "";
    return {
      name: book.fileName(statement, which),
      type:
        extension === "pdf"
          ? "application/pdf"
          : extension === "ofx" || extension === "qfx"
            ? "application/x-ofx"
            : "text/csv; charset=utf-8",
      sha256: stored.sha256,
      content: Buffer.from(bytes).toString("base64"),
    };
  };
  get("/data/statements/:id/file", (ctx) => fileAnswer(book.statement(ctx.params[0]), "file"));
  get("/data/statements/:id/copy", (ctx) => fileAnswer(book.statement(ctx.params[0]), "copy"));

  // ---------------------------------------------------------------- routes: accounts and imports

  post("/data/statements/accounts", (ctx, by) => ({ account: book.addAccount(ctx.body, by) }));

  post("/data/statements/accounts/:id/update", (ctx, by) => ({
    account: book.updateAccount(book.account(ctx.params[0]), ctx.body, by),
  }));

  post("/data/statements/accounts/:id/close", (ctx, by) => ({
    account: book.closeAccount(book.account(ctx.params[0]), ctx.body, by, core.day()),
  }));

  post("/data/statements/accounts/:id/preview", (ctx) => {
    const account = book.account(ctx.params[0]);
    return { preview: book.preview(account, ctx.body, lock()) };
  });

  post("/data/statements/accounts/:id/import", (ctx, by) => {
    const account = book.account(ctx.params[0]);
    const made = book.import(account, ctx.body, by, core.day(), lock());
    return { ...made, statement: statementView(made.statement) };
  });

  post("/data/statements/:id/withdraw", (ctx, by) => ({
    statement: statementView(book.withdraw(book.statement(ctx.params[0]), ctx.body, by, lock())),
  }));

  post("/data/statements/:id/copy", (ctx, by) => ({
    statement: statementView(book.addCopy(book.statement(ctx.params[0]), ctx.body, by)),
  }));

  // ---------------------------------------------------------------- routes: sorting lines

  const liveLine = (id: string | undefined) => {
    const line = book.line(id);
    if (line.withdrawn)
      throw new Refused(
        409,
        "withdrawn",
        "This line's statement was withdrawn; it is counted nowhere.",
      );
    refuseLocked(periodOf(line.posted_on));
    return line;
  };

  const touched = (line: Line, by: Staff) => {
    line.sorted_at = core.now();
    line.sorted_by = by;
    book.saveLines(line.account_id);
  };

  post("/data/statements/lines/:id/category", (ctx, by) => {
    const line = liveLine(ctx.params[0]);
    const given = clean(ctx.body.category_id, 64);
    if (!money())
      throw new Refused(
        409,
        "money_missing",
        "Money is not loaded here, so there are no categories to choose.",
      );
    const chosen = given
      ? categories().find((category) => category.category_id === given && !category.retired)
      : null;
    if (given && !chosen) throw new Refused(400, "invalid", "Choose one of Money's categories.");
    const named = new Map(categories().map((category) => [category.category_id, category.name]));
    book.edits.append({
      record: "line",
      id: line.line_id,
      verb: "category",
      changes: [
        {
          field: "category",
          before: line.category_id ? (named.get(line.category_id) ?? line.category_id) : "",
          after: chosen?.name ?? "",
        },
      ],
      by,
    });
    line.category_id = chosen?.category_id ?? null;
    touched(line, by);
    return { line };
  });

  post("/data/statements/lines/:id/note", (ctx, by) => {
    const line = liveLine(ctx.params[0]);
    const note = cleanText(ctx.body.note, NOTE_MAX);
    book.edits.append({
      record: "line",
      id: line.line_id,
      verb: "note",
      changes: [{ field: "note", before: line.note, after: note }],
      by,
    });
    line.note = note;
    touched(line, by);
    return { line };
  });

  /** Link or record what a line pays, and give it the record's category when it has none. */
  const match = (line: Line, suggestion: Suggestion, by: Staff, amount: number | null) => {
    const made = applyMatch({ line, suggestion, money: money(), by, amount_minor: amount });
    book.edits.append({
      record: "line",
      id: line.line_id,
      verb: "matched",
      changes: [
        {
          field: "match",
          before: "",
          after: `${suggestion.title}${made.match.kind !== "stipend" && "made_here" in made.match && made.match.made_here ? " (recorded from the line)" : ""}`,
        },
      ],
      by,
    });
    line.match = made.match;
    if (line.category_id === null && made.category_id) line.category_id = made.category_id;
    touched(line, by);
  };

  post("/data/statements/lines/:id/match", (ctx, by) => {
    const line = liveLine(ctx.params[0]);
    if (line.match)
      throw new Refused(409, "matched", "This line is matched already. Take the match back first.");
    const account = book.account(line.account_id);
    const ref = clean(ctx.body.ref, 200);
    const sources = sourcesFor(account, true, { from: line.posted_on, to: line.posted_on });
    const suggestion = suggestionsFor(line, sources).find((item) => item.ref === ref);
    if (!suggestion) throw new Refused(400, "invalid", "That is not one of this line's matches.");
    const amount =
      ctx.body.amount_minor === undefined || ctx.body.amount_minor === ""
        ? null
        : signedMinorOf(ctx.body.amount_minor);
    match(line, suggestion, by, amount);
    return { line };
  });

  post("/data/statements/lines/:id/unmatch", (ctx, by) => {
    const line = liveLine(ctx.params[0]);
    if (!line.match) return { line };
    const why = cleanText(ctx.body.why, WHY_MAX) || "Match taken back on Statements.";
    takeBack({ match: line.match, money: money(), why, by });
    book.edits.append({
      record: "line",
      id: line.line_id,
      verb: "match taken back",
      changes: [
        { field: "match", before: JSON.stringify(line.match), after: "" },
        { field: "why", before: "", after: why },
      ],
      by,
    });
    line.match = null;
    touched(line, by);
    return { line };
  });

  post("/data/statements/accounts/:id/accept-sure", (ctx, by) => {
    const account = book.account(ctx.params[0]);
    const month = clean(ctx.body.month, 7);
    if (!PERIOD.test(month)) throw new Refused(400, "invalid", "Choose a month.");
    refuseLocked(month);
    let accepted = 0;
    const lines = book
      .linesOf(account.account_id)
      .filter(
        (line) => periodOf(line.posted_on) === month && !line.withdrawn && line.match === null,
      )
      .sort((a, b) => a.posted_on.localeCompare(b.posted_on) || a.n - b.n);
    for (const line of lines) {
      const sure = sureBillOf(
        suggestionsFor(
          line,
          sourcesFor(account, false, { from: line.posted_on, to: line.posted_on }),
        ),
      );
      if (!sure) continue;
      match(line, sure, by, null);
      accepted += 1;
    }
    return { accepted, words: acceptedWords(accepted) };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    core.route(
      "POST",
      "/data/_test/statements/money",
      standInRoute(core, DUTIES_SERVICES.money, fakeMoney),
    );
    core.route(
      "POST",
      "/data/_test/statements/people-pay",
      standInRoute(core, DUTIES_SERVICES.peoplePay, fakePeoplePay),
    );
    core.route(
      "POST",
      "/data/_test/statements/duty-rules",
      standInRoute(core, DUTIES_SERVICES.dutyRules, (body) =>
        standInDutyRules(() => core.day(), storedOf(body.stored)),
      ),
    );
    /** The walk's account and, unless `import: false`, its three months: safe to run twice. */
    const seed = (by: Staff, withImport: boolean): Answer => {
      let account = book.accounts.find(
        (item) => item.name === WALK_ACCOUNT.name && item.last4 === WALK_ACCOUNT.last4,
      );
      account ??= book.addAccount({ ...WALK_ACCOUNT }, by);
      let statement: Statement | undefined;
      if (withImport) {
        const content = Buffer.from(walkStatementCsv(), "utf8").toString("base64");
        const preview = book.preview(account, { content, name: WALK_FILE_NAME }, lock());
        if (!("refused" in preview) && preview.already_imported_on === null)
          statement = book.import(
            account,
            { import_id: preview.import_id, from: "2026-08-01", to: "2026-10-31" },
            by,
            core.day(),
            lock(),
          ).statement;
      }
      return {
        account_id: account.account_id,
        statement_id: statement?.statement_id ?? null,
        imported: statement !== undefined,
      };
    };
    inside.seed = seed;
    core.route("POST", "/data/_test/statements/seed", (ctx) =>
      seed(ctx.staff(), ctx.body.import !== false),
    );
    /** The walk's account, made on the page, takes the fixed id `walk-account`. */
    core.route("POST", "/data/_test/statements/pin", (ctx) => {
      ctx.staff();
      const account = book.accounts.find(
        (item) => item.name === clean(ctx.body.name, 120) && item.last4 === WALK_ACCOUNT.last4,
      );
      if (!account) throw new Refused(404, "not_found", "That account is not here.");
      return { account_id: book.pin(account.account_id, WALK_ACCOUNT_ID).account_id };
    });
    /** Exactly what another module gets from the `statements` service. */
    core.route("GET", "/data/_test/statements/feed", () => ({ cash: feed.cash() }));
    /** The worked-out figures behind the feed, whole months included, for the tests. */
    core.route("GET", "/data/_test/statements/cash", (ctx) => {
      const upTo = clean(ctx.query.get("up_to"), 10);
      return { cash: cash(isDay(upTo) ? upTo : undefined), first_day: book.firstDay() };
    });
  }
}
