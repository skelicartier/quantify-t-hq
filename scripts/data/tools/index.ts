/**
 * Systems › Tools and Accounts (ws-notes/security/spec.md §6): the tools register (owner,
 * admins, plan, seats, cost, renewal and notice, sign-in and two-step sign-in, critical or
 * not, the data it holds, the sub-processor block, where its data is, how to leave, the
 * yearly look), the accounts in each tool, the sub-processor list (a CSV, and a copy kept in
 * Files), renewals and looks into Due and the calendar, `search:tools`, `usedFor`, the
 * Summary lines and evidence, and the `tools` service (`ToolsLookup`).
 *
 * The Owner rule (spec §2 rules 1–2, §3.5): an account may be linked to a person in the
 * people ledger, by the Owner only. The link lives in `tools/owner/` (`owner.ts`); the
 * person's name, state and last day are read from `people-roster` at request time. Every
 * route that carries a person or a close-by day does so only when asked with the Owner flag
 * (`?owner=1` on a GET, `owner: true` in a POST body, which the portal sets from the role and
 * nothing else) and leaves the keys out otherwise; the link and the for-person routes refuse
 * without it; the link answers `{ account_id, linked }` and keeps no replay; Due rows of kind
 * `account` are `owner_only`; search, the calendar, the overview, the evidence, an Admin's
 * CSV and the event lines hold no ledger name or day. Nothing here sends, files, pays or
 * fetches.
 */

import { writeFileSync } from "node:fs";

import { Refused } from "../../mail-merge/engine";
import { addMonths } from "../company-contracts";
import type { Answer, Ctx, DataCore, DueItem } from "../core";
import { clean } from "../guard";
import type { FileRow, FilesService } from "../leads/contracts";
import { checkCopy, copyGiven, fileChoices, fileLink, keepCopy } from "../meetings/copy";
import type { Staff } from "../protocol";
import {
  agendaService,
  searchService,
  type AgendaItem,
  type AgendaSource,
  type SearchSource,
} from "../raise-contracts";
import {
  SECURITY_SERVICES,
  closeByOf,
  standInDevices,
  type DevicesLookup,
  type DomainSender,
  type DomainSenders,
  type EvidenceOption,
  type MoneyVendors,
  type PeopleRoster,
  type PersonDeviceLine,
  type RosterPerson,
  type SummaryLine,
  type ToolView,
  type ToolsLookup,
} from "../security-contracts";
import { toCsv } from "../text";
import { findTerms, matchesTerms } from "../../../src/lib/merge/find";
import type { ControlKey } from "../../../src/lib/data/labels-controls";
import { countWords } from "../../../src/lib/data/labels-controls";
import { minorWords } from "../../../src/lib/data/labels-duties";
import { REVOKE_CRITICAL, REVOKE_OTHER } from "../../../src/lib/data/labels-people";
import {
  ACCOUNT_KINDS,
  ACCOUNT_ROLES,
  ACCOUNT_TWO_STEP,
  ACCOUNT_VIEWS,
  BILLING,
  BILLING_AFTER,
  DATA_CLASSES,
  KEY_DATE_COVERS,
  SIGN_IN,
  SUBPROCESSORS_FOLDER,
  SUBPROCESSORS_TITLE,
  TOOL_CATEGORIES,
  TOOL_STATUSES,
  TOOL_VIEWS,
  TWO_STEP,
  type AccountView,
  type ToolView as ToolsView,
} from "../../../src/lib/data/labels-systems";
import { ToolsBook } from "./book";
import { checksOf, holdsPeopleData } from "./checks";
import { LIMIT, REMIND_DAYS, SAY } from "./limits";
import { OwnerLinks } from "./owner";
import {
  accountsLine,
  closeByWords,
  coversOf,
  criticalOf,
  lookedOn,
  nextReviewOf,
  renewalDue,
  renewalInDue,
  renewalOf,
  renewalTitle,
  reviewInDue,
  reviewOwed,
  type RenewalDue,
} from "./renewal";
import { subprocessorCsv, subprocessorsOf } from "./subprocessors";
import type { Account, Tool } from "./types";
import { WALK_TOOLS, WALK_TOOL_ID } from "./walk-seed";

const BOM = "﻿";
const PAGE = "/data/systems";
const ACCOUNTS_PAGE = "/data/systems/accounts";
const FLAG_WORDS = { yes: "on", no: "off", "": "not known" } as const;
/** What the register prints: A.5.9 on the register, A.5.18 on accounts, A.5.19–A.5.23 on the sub-processor block. */
const TOOL_REFS: readonly ControlKey[] = [
  "a5_9",
  "a5_18",
  "a5_19",
  "a5_20",
  "a5_21",
  "a5_22",
  "a5_23",
];
const OWNER_REFUSAL = "This is for the Owner only: it comes from the people ledger.";

const toolHref = (toolId: string) => `${PAGE}/tools/${toolId}`;
const accountsHref = (toolId: string) => `${toolHref(toolId)}#tool-accounts`;

/** A devices stand-in carries this mark, so `{ on: false }` removes only its own fake. */
const STAND_IN = Symbol.for("hq.security.devices.stand-in");

export async function register(core: DataCore): Promise<void> {
  const book = new ToolsBook(core);
  const links = new OwnerLinks(core);
  const today = () => core.day();
  const months = () => book.setup.review_months;

  function safely<T>(ask: () => T): T | null {
    try {
      return ask();
    } catch (error) {
      core.log(`tools: a lookup failed: ${error instanceof Error ? error.name : "error"}`);
      return null;
    }
  }

  const roster = () => core.need<PeopleRoster>(SECURITY_SERVICES.peopleRoster);
  const moneyVendors = () => core.need<MoneyVendors>(SECURITY_SERVICES.moneyVendors);
  const domainSenders = () => core.need<DomainSenders>(SECURITY_SERVICES.domainSenders);
  const devices = () => core.need<DevicesLookup>(SECURITY_SERVICES.devices);
  const files = () => core.need<FilesService>("files");

  // ---------------------------------------------------------------- the Owner

  const refuseOwner = () => new Refused(403, "owner_only", OWNER_REFUSAL);
  const askedAsOwner = (ctx: Ctx) => ctx.query.get("owner") === "1";
  const ownerGet = (ctx: Ctx) => {
    if (!askedAsOwner(ctx)) throw refuseOwner();
  };

  /** The person an account is linked to, as the ledger has them today; null when none or gone. */
  const personOf = (accountId: string, on: string): RosterPerson | null => {
    const personId = links.personOf(accountId);
    if (!personId) return null;
    const people = roster();
    return people ? safely(() => people.person(personId, on)) : null;
  };

  // ---------------------------------------------------------------- rows

  const toolOf = (toolId: string): Tool | null =>
    book.tools.find((tool) => tool.tool_id === toolId) ?? null;

  const toolRow = (tool: Tool, on: string, page = false) => {
    const open = book.openOf(tool.tool_id);
    const looked = lookedOn(tool);
    const review = nextReviewOf(tool, months());
    const owed = !tool.retired && reviewOwed(review, on);
    return {
      ...tool,
      next: { renewal: tool.retired ? null : renewalOf(tool, on), review },
      looked_on: looked,
      review_owed: owed,
      accounts_open: open.length,
      accounts_line: accountsLine(open.length, tool.seats),
      checks: checksOf({ tool, open, looked_on: looked, review_owed: owed, page }),
      href: toolHref(tool.tool_id),
    };
  };

  const toolDetail = (tool: Tool, on: string) => ({ ...toolRow(tool, on, true), refs: TOOL_REFS });

  /** An account as every page has it; with `asOwner`, the person and the close-by too. */
  const accountRow = (account: Account, on: string, asOwner: boolean) => {
    const tool = toolOf(account.tool_id);
    const critical = tool ? criticalOf(account, tool) : (account.critical ?? false);
    const row = {
      ...account,
      tool_name: tool?.name ?? "",
      tool_retired: Boolean(tool?.retired),
      critical_now: critical,
      href: accountsHref(account.tool_id),
    };
    if (!asOwner) return row;
    const person = personOf(account.account_id, on);
    return {
      ...row,
      person: person
        ? { person_id: person.person_id, name: person.name, state: person.state, href: person.href }
        : null,
      close_by: person ? closeByWords(account, person.last_day, critical, on) : null,
    };
  };

  /** The roster for the Owner's "Link to the people ledger" select: names and states only. */
  const rosterChoices = (on: string) =>
    (safely(() => roster()?.people(on)) ?? []).map((person) => ({
      person_id: person.person_id,
      name: person.name,
      state: person.state,
    }));

  const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
  const sortedTools = (list: Tool[]) =>
    [...list].sort(
      (a, b) => Number(Boolean(a.retired)) - Number(Boolean(b.retired)) || byName(a, b),
    );

  // ---------------------------------------------------------------- Due, the agenda, search

  const renewalSub = (tool: Tool): string => {
    const parts: string[] = [];
    if (tool.plan) parts.push(tool.plan);
    if (tool.amount_minor !== null) {
      const after = BILLING_AFTER[tool.billing];
      parts.push(`${minorWords(tool.amount_minor, tool.currency)}${after ? ` ${after}` : ""}`);
    }
    parts.push(`auto-renew ${FLAG_WORDS[tool.auto_renews]}`);
    return parts.join(" · ");
  };

  const renewals = (on: string): { tool: Tool; due: RenewalDue }[] =>
    book.tools.flatMap((tool) => {
      const due = renewalDue(tool, on);
      return due ? [{ tool, due }] : [];
    });

  core.provideDue(() => {
    const on = today();
    const items: DueItem[] = [];
    for (const { tool, due } of renewals(on))
      if (renewalInDue(due, on))
        items.push({
          key: `tool:${tool.tool_id}:renewal`,
          kind: "tool",
          title: renewalTitle(tool.name, due),
          sub: renewalSub(tool),
          due_on: due.cancel_by,
          href: toolHref(tool.tool_id),
        });
    for (const tool of book.tools) {
      if (tool.retired) continue;
      const review = nextReviewOf(tool, months());
      if (reviewInDue(review, on))
        items.push({
          key: `tool:${tool.tool_id}:review`,
          kind: "tool",
          title: `Look again at ${tool.name}`,
          sub: "Sign-in, the data it holds, its terms",
          due_on: review,
          href: toolHref(tool.tool_id),
        });
    }
    // The leavers' accounts: for the Owner only, from the day offboarding starts.
    for (const account of book.accounts) {
      if (account.closed_on) continue;
      const tool = toolOf(account.tool_id);
      const person = tool ? personOf(account.account_id, on) : null;
      if (!tool || !person?.last_day) continue;
      const critical = criticalOf(account, tool);
      items.push({
        key: `account:${account.account_id}`,
        kind: "account",
        title: `Close ${tool.name} for ${person.name}`,
        sub: critical ? REVOKE_CRITICAL : REVOKE_OTHER,
        due_on: closeByOf(person.last_day, critical),
        href: accountsHref(tool.tool_id),
        owner_only: true,
      });
    }
    return items;
  });

  /** Renewals only: never an account, a holder or a person (spec §3.5, §13.1 choice 22). */
  const agenda: AgendaSource = {
    agenda: (on) =>
      renewals(on)
        .map(({ tool, due }): AgendaItem => ({
          key: `tool:${tool.tool_id}:renewal`,
          kind: "tool",
          title: renewalTitle(tool.name, due),
          plain: "Tool renewal",
          sub: renewalSub(tool),
          on: due.cancel_by,
          remind_days: [...REMIND_DAYS],
          href: toolHref(tool.tool_id),
        }))
        .sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title)),
  };
  core.provide(agendaService("tools"), agenda);

  /** Tools only: never an account, a holder or a person. */
  const search: SearchSource = {
    search: ({ terms, kind, limit }) => {
      if (terms.length === 0 || (kind !== null && kind !== "tool")) return [];
      const found = sortedTools(book.tools).filter((tool) =>
        matchesTerms(
          [tool.name, tool.what, tool.legal_name, tool.plan, TOOL_CATEGORIES[tool.category]],
          terms,
        ),
      );
      if (found.length === 0) return [];
      return [
        {
          kind: "tool",
          count: found.length,
          hits: found.slice(0, Math.max(0, limit)).map((tool) => ({
            kind: "tool" as const,
            id: tool.tool_id,
            title: tool.name,
            subtitle: `${TOOL_CATEGORIES[tool.category]} · ${TOOL_STATUSES[tool.status]}`,
            snippet: "",
            href: toolHref(tool.tool_id),
          })),
        },
      ];
    },
  };
  core.provide(searchService("tools"), search);

  // ---------------------------------------------------------------- the service

  const live = () => book.tools.filter((tool) => !tool.retired);

  const summary = (on: string, asOwner: boolean): SummaryLine[] => {
    const tools = live();
    const customer = tools.filter((tool) => tool.holds.includes("customer")).length;
    const unmarked = tools.filter(
      (tool) => holdsPeopleData(tool) && (!tool.subprocessor || !tool.subprocessor.dpa_signed_on),
    ).length;
    const lines: SummaryLine[] = [
      {
        key: "tools",
        area: "systems",
        title: "Tools",
        words:
          tools.length === 0
            ? "No tools recorded. Add every tool the company signs in to, starting with the mail suite."
            : `${countWords(tools.length, "tool")} in use; ${customer.toLocaleString("en-GB")} ${customer === 1 ? "holds" : "hold"} customer data.`,
        attention: tools.length === 0 || unmarked > 0,
        href: PAGE,
      },
    ];
    const weak = tools.filter((tool) => tool.mfa === "optional" || tool.mfa === "none");
    lines.push({
      key: "two-step",
      area: "systems",
      title: "Two-step sign-in",
      words:
        weak.length === 0
          ? "Every tool that records it enforces two-step sign-in."
          : `${countWords(weak.length, "tool")} ${weak.length === 1 ? "does" : "do"} not enforce two-step sign-in: ${weak
              .map((tool) => tool.name)
              .sort((a, b) => a.localeCompare(b))
              .join(", ")}.`,
      attention: weak.length > 0,
      href: PAGE,
    });
    const open = book.accounts.filter((account) => !account.closed_on);
    const inTools = new Set(open.map((account) => account.tool_id)).size;
    const shared = open.filter((account) => account.kind === "shared").length;
    lines.push({
      key: "accounts",
      area: "systems",
      title: "Accounts",
      words: `${countWords(open.length, "account")} open in ${countWords(inTools, "tool")}${
        shared > 0 ? `; ${shared.toLocaleString("en-GB")} shared` : ""
      }.`,
      attention: false,
      href: ACCOUNTS_PAGE,
    });
    if (asOwner) {
      const past = open.filter((account) => {
        const tool = toolOf(account.tool_id);
        const person = tool ? personOf(account.account_id, on) : null;
        return Boolean(
          tool && person?.last_day && closeByOf(person.last_day, criticalOf(account, tool)) < on,
        );
      }).length;
      lines.push({
        key: "leavers",
        area: "systems",
        title: "Leavers' accounts",
        words:
          past === 0
            ? "No account is past its close-by day."
            : `${countWords(past, "account")} ${past === 1 ? "is" : "are"} past ${past === 1 ? "its" : "their"} close-by day.`,
        attention: past > 0,
        href: ACCOUNTS_PAGE,
      });
    }
    return lines;
  };

  const evidence = (on: string): EvidenceOption[] => {
    const tools = live();
    const options: EvidenceOption[] = [];
    if (tools.length > 0) {
      const stale = tools.filter((tool) => reviewOwed(nextReviewOf(tool, months()), on)).length;
      options.push({
        ref: "tools:register",
        label: `Tools register: ${countWords(tools.length, "tool")}${stale === 0 ? ", each looked at in the last year" : ""}`,
        href: PAGE,
        current: stale === 0,
        why: stale === 0 ? "" : `${countWords(stale, "tool")} not looked at in a year.`,
      });
    }
    const listed = subprocessorsOf(book.tools);
    if (listed.length > 0) {
      const without = listed.filter((tool) => !tool.subprocessor?.dpa_signed_on).length;
      options.push({
        ref: "tools:subprocessors",
        label: `Sub-processor list: ${countWords(listed.length, "service")}`,
        href: PAGE,
        current: without === 0,
        why:
          without === 0
            ? ""
            : `${without.toLocaleString("en-GB")} ${without === 1 ? "has" : "have"} no data processing agreement.`,
      });
    }
    return options;
  };

  const usedFor = (fileId: string) => {
    const used: { label: string; href: string }[] = [];
    for (const tool of sortedTools(book.tools))
      if (tool.subprocessor?.dpa_file_id === fileId)
        used.push({
          label: `Data processing agreement with ${tool.name}`,
          href: toolHref(tool.tool_id),
        });
    if (book.setup.kept_file_id === fileId)
      used.push({ label: "The sub-processor list", href: PAGE });
    return used;
  };

  const service: ToolsLookup = {
    usedFor,
    summary: (on, asOwner) => summary(on, asOwner),
    evidence: (on) => evidence(on),
    tools: (): ToolView[] =>
      sortedTools(book.tools).map((tool) => ({
        tool_id: tool.tool_id,
        name: tool.name,
        critical: tool.critical,
        holds: [...tool.holds],
        subprocessor: tool.subprocessor !== null,
        retired: Boolean(tool.retired),
        href: toolHref(tool.tool_id),
      })),
    keyDateCovers: () => coversOf(book.tools),
  };
  core.provide(SECURITY_SERVICES.tools, service);

  /** Counts and the next day: nothing from the people ledger. */
  core.provideOverview("systems", () => {
    const on = today();
    const days = [
      ...renewals(on).map(({ tool, due }) => ({
        title: renewalTitle(tool.name, due),
        on: due.cancel_by,
      })),
      ...live().map((tool) => ({
        title: `Look again at ${tool.name}`,
        on: nextReviewOf(tool, months()),
      })),
    ].sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title));
    return {
      tools: live().length,
      accounts_open: book.accounts.filter((account) => !account.closed_on).length,
      subprocessors: subprocessorsOf(book.tools).length,
      next: days[0] ?? null,
    };
  });

  // ---------------------------------------------------------------- routes (fixed paths first)

  const viewOf = (raw: string | null): ToolsView =>
    raw && Object.prototype.hasOwnProperty.call(TOOL_VIEWS, raw) ? (raw as ToolsView) : "in_use";

  core.route("GET", "/data/tools", (ctx) => {
    const on = today();
    const view = viewOf(clean(ctx.query.get("view"), 20) || null);
    const counts = { in_use: 0, trial: 0, ending: 0, retired: 0, subprocessors: 0 };
    for (const tool of book.tools) counts[tool.retired ? "retired" : tool.status] += 1;
    counts.subprocessors = subprocessorsOf(book.tools).length;
    const tools = sortedTools(book.tools)
      .filter((tool) =>
        view === "all"
          ? true
          : view === "retired"
            ? Boolean(tool.retired)
            : !tool.retired && tool.status === view,
      )
      .map((tool) => toolRow(tool, on));
    return {
      view,
      tools,
      counts,
      review_months: book.setup.review_months,
      subprocessors: subprocessorsOf(book.tools).map((tool) => ({
        tool_id: tool.tool_id,
        name: tool.name,
        dpa_signed_on: tool.subprocessor?.dpa_signed_on ?? null,
      })),
      kept: fileLink(core, book.setup.kept_file_id),
      files_here: files() !== null,
      today: on,
    };
  });

  /** Keeps the DPA's copy in Files when one was given, then points the block at it. */
  const keepDpa = async (tool: Tool, input: Record<string, unknown>, by: Staff): Promise<Tool> => {
    const copy = input.dpa_copy;
    if (!copy || typeof copy !== "object" || !copyGiven(copy as Record<string, unknown>))
      return tool;
    if (!tool.subprocessor) return tool;
    const row = await keepCopy(
      core,
      copy as Record<string, unknown>,
      {
        folder: [...SUBPROCESSORS_FOLDER],
        title: `Data processing agreement with ${tool.name}`,
        note: "Data processing agreement",
      },
      by,
    );
    return book.setDpaFile(tool, row.file_id, by);
  };
  const checkDpa = (input: Record<string, unknown>) => {
    const copy = input.dpa_copy;
    if (copy && typeof copy === "object" && copyGiven(copy as Record<string, unknown>))
      checkCopy(core, copy as Record<string, unknown>);
  };

  core.route("POST", "/data/tools", async (ctx) => {
    const by = ctx.staff();
    checkDpa(ctx.body);
    const tool = await keepDpa(book.addTool(ctx.body, by), ctx.body, by);
    return { tool: toolDetail(tool, today()) };
  });

  core.route("POST", "/data/tools/setup", (ctx) => {
    const by = ctx.staff();
    const raw = ctx.body.review_months;
    const text = raw === null || raw === undefined ? "" : clean(String(raw), 4);
    let reviewMonths: number | null = null;
    if (text) {
      if (!/^\d{1,2}$/.test(text) || Number(text) < 1 || Number(text) > LIMIT.review_months_max)
        throw new Refused(400, "invalid", SAY.reviewMonths);
      reviewMonths = Number(text);
    }
    book.saveSetup({ review_months: reviewMonths });
    book.log("tool", "setup", "", "changed", "How often each tool is looked at", by);
    return { review_months: book.setup.review_months };
  });

  const accountViewOf = (raw: string | null): AccountView =>
    raw && Object.prototype.hasOwnProperty.call(ACCOUNT_VIEWS, raw) ? (raw as AccountView) : "open";

  core.route("GET", "/data/tools/accounts", (ctx) => {
    const on = today();
    const asOwner = askedAsOwner(ctx);
    const view = accountViewOf(clean(ctx.query.get("view"), 20) || null);
    const holder = clean(ctx.query.get("holder"), LIMIT.holder).toLowerCase();
    const holders = [...new Set(book.accounts.map((account) => account.holder))].sort((a, b) =>
      a.localeCompare(b),
    );
    const accounts = book.accounts
      .filter((account) =>
        view === "all" ? true : view === "closed" ? Boolean(account.closed_on) : !account.closed_on,
      )
      .filter((account) => !holder || account.holder.toLowerCase() === holder)
      .sort(
        (a, b) =>
          a.holder.localeCompare(b.holder) ||
          (toolOf(a.tool_id)?.name ?? "").localeCompare(toolOf(b.tool_id)?.name ?? ""),
      )
      .map((account) => accountRow(account, on, asOwner));
    const open = book.accounts.filter((account) => !account.closed_on);
    return {
      view,
      accounts,
      holders,
      counts: {
        open: open.length,
        closed: book.accounts.length - open.length,
        shared: open.filter((account) => account.kind === "shared").length,
        admin_without_mfa: open.filter(
          (account) =>
            (account.role === "owner" || account.role === "admin") && account.mfa !== "yes",
        ).length,
      },
      ...(asOwner ? { roster: rosterChoices(on), roster_here: roster() !== null } : {}),
      today: on,
    };
  });

  core.route("POST", "/data/tools/subprocessors/keep", async (ctx) => {
    const by = ctx.staff();
    const filesService = files();
    if (!filesService)
      throw new Refused(
        409,
        "files_missing",
        "Files is not set up here yet, so a copy cannot be kept.",
      );
    if (subprocessorsOf(book.tools).length === 0) throw new Refused(409, "invalid", SAY.empty);
    const bytes = new TextEncoder().encode(subprocessorCsv(book.tools));
    const file: FileRow = await filesService.putFile({
      folderPath: [...SUBPROCESSORS_FOLDER],
      title: SUBPROCESSORS_TITLE,
      originalName: "Sub-processors.csv",
      bytes,
      by,
      note: "The sub-processor list",
    });
    book.saveSetup({ kept_file_id: file.file_id });
    book.log("tool", "subprocessors", "", "list kept in Files", "", by);
    return { file };
  });

  core.route("GET", "/data/tools/for-person/:personId", (ctx) => {
    ownerGet(ctx);
    const on = today();
    const personId = ctx.params[0] ?? "";
    const people = roster();
    if (!people) throw new Refused(409, "roster_missing", SAY.rosterMissing);
    const person = safely(() => people.person(personId, on));
    if (!person) throw new Refused(404, "not_found", SAY.person);
    const linked = new Set(links.accountsOf(personId));
    const accounts = book.accounts
      .filter((account) => linked.has(account.account_id))
      .sort(
        (a, b) =>
          Number(Boolean(a.closed_on)) - Number(Boolean(b.closed_on)) ||
          (toolOf(a.tool_id)?.name ?? "").localeCompare(toolOf(b.tool_id)?.name ?? ""),
      )
      .map((account) => accountRow(account, on, true));
    const names = new Set([person.name.trim().toLowerCase(), person.email.trim().toLowerCase()]);
    const possible = book.accounts
      .filter(
        (account) =>
          !account.closed_on &&
          links.personOf(account.account_id) === null &&
          names.has(account.holder.trim().toLowerCase()),
      )
      .sort((a, b) => (toolOf(a.tool_id)?.name ?? "").localeCompare(toolOf(b.tool_id)?.name ?? ""))
      .map((account) => accountRow(account, on, true));
    const lookup = devices();
    const deviceLines: PersonDeviceLine[] | null = lookup
      ? (safely(() => lookup.forPerson(personId, on)) ?? [])
      : null;
    return { name: person.name, accounts, devices: deviceLines, possible };
  });

  core.route("POST", "/data/tools/accounts/:accountId/update", (ctx) => {
    const by = ctx.staff();
    const account = book.updateAccount(book.account(ctx.params[0]), ctx.body, by);
    return { account: accountRow(account, today(), false) };
  });

  core.route("POST", "/data/tools/accounts/:accountId/close", (ctx) => {
    const by = ctx.staff();
    const account = book.closeAccount(book.account(ctx.params[0]), ctx.body, by);
    return { account: accountRow(account, today(), false) };
  });

  /** OWNER-ONLY: no replay is kept, and the answer names nothing from the ledger. */
  core.route("POST", "/data/tools/accounts/:accountId/link", (ctx) => {
    ctx.attempt = null;
    if (ctx.body.owner !== true) throw refuseOwner();
    ctx.staff();
    const account = book.account(ctx.params[0]);
    const raw = ctx.body.person_id;
    const personId = raw === null || raw === undefined || raw === "" ? null : clean(raw, 64);
    if (personId) {
      const people = roster();
      if (!people) throw new Refused(409, "roster_missing", SAY.rosterMissing);
      if (!safely(() => people.person(personId, today())))
        throw new Refused(404, "not_found", SAY.person);
    }
    const linked = links.link(account.account_id, personId);
    return { account_id: account.account_id, linked };
  });

  core.route("GET", "/data/tools/:id", (ctx) => {
    const on = today();
    const asOwner = askedAsOwner(ctx);
    const tool = book.tool(ctx.params[0]);
    const money = moneyVendors();
    const vendorList = money ? (safely(() => money.vendors()) ?? []) : null;
    const vendor =
      vendorList && tool.vendor_id
        ? (vendorList.find((item) => item.vendor_id === tool.vendor_id) ?? null)
        : null;
    const billed =
      money && vendor
        ? (safely(() => money.billedSince(vendor.vendor_id, addMonths(on, -12))) ?? [])
        : money
          ? []
          : null;
    const sendersService = domainSenders();
    const name = tool.name.trim().toLowerCase();
    const senders: DomainSender[] | null = sendersService
      ? (safely(() => sendersService.senders()) ?? []).filter((domain) =>
          domain.sends_as.some((item) => item.trim().toLowerCase() === name),
        )
      : null;
    const accounts = book
      .accountsOf(tool.tool_id)
      .sort(
        (a, b) =>
          Number(Boolean(a.closed_on)) - Number(Boolean(b.closed_on)) ||
          a.holder.localeCompare(b.holder),
      )
      .map((account) => accountRow(account, on, asOwner));
    return {
      tool: toolDetail(tool, on),
      accounts,
      vendor,
      vendors: vendorList,
      billed,
      billed_since: addMonths(on, -12),
      senders,
      events: book.eventsOf(tool.tool_id),
      files_here: files() !== null,
      file_choices: fileChoices(core),
      dpa_file: fileLink(core, tool.subprocessor?.dpa_file_id ?? null),
      review_months: book.setup.review_months,
      ...(asOwner ? { roster: rosterChoices(on), roster_here: roster() !== null } : {}),
      today: on,
    };
  });

  core.route("POST", "/data/tools/:id/update", async (ctx) => {
    const by = ctx.staff();
    checkDpa(ctx.body);
    const tool = await keepDpa(
      book.updateTool(book.tool(ctx.params[0]), ctx.body, by),
      ctx.body,
      by,
    );
    return { tool: toolDetail(tool, today()) };
  });

  core.route("POST", "/data/tools/:id/review", (ctx) => {
    const by = ctx.staff();
    return { tool: toolDetail(book.review(book.tool(ctx.params[0]), ctx.body, by), today()) };
  });

  core.route("POST", "/data/tools/:id/retire", (ctx) => {
    const by = ctx.staff();
    return { tool: toolDetail(book.retire(book.tool(ctx.params[0]), ctx.body, by), today()) };
  });

  core.route("POST", "/data/tools/:id/accounts", (ctx) => {
    const by = ctx.staff();
    const account = book.addAccount(book.tool(ctx.params[0]), ctx.body, by);
    return { account: accountRow(account, today(), false) };
  });

  // ---------------------------------------------------------------- the CSVs (builds)

  const writeCsv = async (
    handle: { path: string; setProgress(done: number, total: number): void },
    header: readonly string[],
    rows: (string | number)[][],
  ) => {
    handle.setProgress(0, 1);
    await core.yield();
    writeFileSync(handle.path, BOM + toCsv(header, rows), { mode: 0o600 });
    handle.setProgress(1, 1);
  };
  const exported = (kind: string, by: Staff, rows: number) =>
    core.store.appendLine("tools/exports.jsonl", { at: core.now(), by, kind, rows });

  core.builds.provide("tools_csv", async (handle, input) => {
    const on = today();
    const rows = sortedTools(book.tools).map((tool) => {
      const row = toolRow(tool, on);
      return [
        tool.name,
        tool.what,
        TOOL_CATEGORIES[tool.category],
        TOOL_STATUSES[tool.status],
        tool.business_owner,
        tool.admins,
        tool.legal_name,
        tool.plan,
        tool.seats ?? "",
        tool.amount_minor === null ? "" : minorWords(tool.amount_minor, tool.currency),
        BILLING[tool.billing],
        tool.renews_on ?? "",
        row.next.renewal?.cancel_by ?? "",
        tool.notice_days ?? "",
        FLAG_WORDS[tool.auto_renews],
        tool.key_date ? KEY_DATE_COVERS[tool.key_date] : "",
        SIGN_IN[tool.sign_in],
        TWO_STEP[tool.mfa],
        tool.critical ? "Yes" : "No",
        tool.holds.map((key) => DATA_CLASSES[key]).join("; "),
        tool.subprocessor ? "Yes" : "No",
        tool.subprocessor?.dpa_signed_on ?? "",
        tool.data_location,
        row.accounts_line,
        row.looked_on,
        tool.retired ? `Retired ${tool.retired.on}: ${tool.retired.why}` : "",
        row.checks.join(" "),
      ];
    });
    await writeCsv(
      handle,
      [
        "Tool",
        "What it is for",
        "Category",
        "Status",
        "Business owner",
        "Who administers it",
        "Legal name",
        "Plan",
        "Seats",
        "Cost",
        "Billing",
        "Renews on",
        "Cancel by",
        "Notice in days",
        "Renews by itself",
        "Stands for in Key dates",
        "Sign-in",
        "Two-step sign-in",
        "Critical",
        "Holds",
        "Sub-processor",
        "Data processing agreement signed",
        "Where its data is",
        "Accounts",
        "Looked at",
        "Retired",
        "Checks",
      ],
      rows,
    );
    exported("tools", input.by, rows.length);
    return { name: `Tools ${on}.csv`, type: "text/csv; charset=utf-8" };
  });

  /** The Owner's CSV adds the two ledger columns; anyone else's has neither. */
  core.builds.provide("tools_accounts_csv", async (handle, input) => {
    const on = today();
    const asOwner = input.body.owner === true;
    const rows = book.accounts
      .slice()
      .sort(
        (a, b) =>
          (toolOf(a.tool_id)?.name ?? "").localeCompare(toolOf(b.tool_id)?.name ?? "") ||
          a.holder.localeCompare(b.holder),
      )
      .map((account) => {
        const tool = toolOf(account.tool_id);
        const critical = tool ? criticalOf(account, tool) : false;
        const row: (string | number)[] = [
          tool?.name ?? "",
          account.holder,
          ACCOUNT_KINDS[account.kind],
          ACCOUNT_ROLES[account.role],
          ACCOUNT_TWO_STEP[account.mfa],
          critical ? "Yes" : "No",
          account.opened_on ?? "",
          account.closed_on ?? "",
          account.closed_note,
        ];
        if (asOwner) {
          const person = personOf(account.account_id, on);
          const closeBy = person ? closeByWords(account, person.last_day, critical, on) : null;
          row.push(person?.name ?? "", closeBy?.on ?? "");
        }
        return row;
      });
    await writeCsv(
      handle,
      [
        "Tool",
        "Holder",
        "Kind",
        "Role",
        "Two-step sign-in",
        "Critical",
        "Opened",
        "Closed",
        "Closed note",
        ...(asOwner ? ["In the people ledger", "Close by"] : []),
      ],
      rows,
    );
    exported("accounts", input.by, rows.length);
    return { name: `Accounts ${on}.csv`, type: "text/csv; charset=utf-8" };
  });

  core.builds.provide("tools_subprocessors_csv", async (handle, input) => {
    handle.setProgress(0, 1);
    await core.yield();
    writeFileSync(handle.path, subprocessorCsv(book.tools), { mode: 0o600 });
    handle.setProgress(1, 1);
    exported("subprocessors", input.by, subprocessorsOf(book.tools).length);
    return { name: "Sub-processors.csv", type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    /** §3.3: installs its fake only while the real `devices` is absent; `{ on: false }` removes only its own. */
    const installDevices = (body: Record<string, unknown>): Answer => {
      const current = core.need<DevicesLookup & { [STAND_IN]?: true }>(SECURITY_SERVICES.devices);
      const isStandIn = current !== null && current[STAND_IN] === true;
      if (body.on === false) {
        if (isStandIn) core.provide(SECURITY_SERVICES.devices, null);
        return { installed: false };
      }
      if (current && !isStandIn) return { installed: false, real: true };
      const raw =
        body.by_person && typeof body.by_person === "object" && !Array.isArray(body.by_person)
          ? (body.by_person as Record<string, unknown>)
          : {};
      const byPerson: Record<string, PersonDeviceLine[]> = {};
      for (const [personId, lines] of Object.entries(raw))
        if (Array.isArray(lines))
          byPerson[personId] = lines
            .filter(
              (line): line is Record<string, unknown> => Boolean(line) && typeof line === "object",
            )
            .map((line) => ({
              device_id: clean(line.device_id, 64),
              label: clean(line.label, 200),
              ownership: line.ownership === "company" ? "company" : "personal",
              by: typeof line.by === "string" ? clean(line.by, 10) : null,
              done: line.done === true,
              href: clean(line.href, 200) || "/data/systems/devices",
            }));
      core.provide(
        SECURITY_SERVICES.devices,
        Object.assign(standInDevices(byPerson), { [STAND_IN]: true as const }),
      );
      return { installed: true };
    };

    core.route("POST", "/data/_test/tools/devices", (ctx) => {
      ctx.staff();
      return installDevices(ctx.body);
    });

    /** The walk's seed: the devices stand-in (empty), and the invented tools when asked. Safe twice. */
    core.route("POST", "/data/_test/tools/seed", (ctx) => {
      const by = ctx.staff();
      const added: string[] = [];
      if (ctx.body.tools === true)
        for (const fields of WALK_TOOLS) {
          const name = String(fields.name).toLowerCase();
          if (book.tools.some((tool) => !tool.retired && tool.name.toLowerCase() === name))
            continue;
          added.push(book.addTool(fields, by).tool_id);
        }
      return {
        devices: installDevices(
          ctx.body.by_person && typeof ctx.body.by_person === "object"
            ? { by_person: ctx.body.by_person }
            : {},
        ),
        added,
        tools: book.tools.length,
      };
    });

    /** The walk's "Walk Mail" gets the fixed id `walk-mail`, once, so the harness can open it. */
    core.route("POST", "/data/_test/tools/pin", (ctx) => {
      ctx.staff();
      const tool = book.pin(clean(ctx.body.id, 64), WALK_TOOL_ID);
      return { tool_id: tool.tool_id };
    });

    core.route("GET", "/data/_test/tools/agenda", (ctx) => {
      const on = clean(ctx.query.get("day"), 10) || today();
      return {
        items: core.need<AgendaSource>(agendaService("tools"))?.agenda(on) ?? [],
        today: on,
      };
    });

    core.route("GET", "/data/_test/tools/search", (ctx) => {
      const query = clean(ctx.query.get("q"), LIMIT.search);
      return {
        groups:
          core.need<SearchSource>(searchService("tools"))?.search({
            query,
            terms: findTerms(query),
            kind: null,
            limit: 5,
          }) ?? [],
      };
    });

    /** What the `tools` service answers, as another module reads it. */
    core.route("GET", "/data/_test/tools/lookup", (ctx) => {
      const on = clean(ctx.query.get("day"), 10) || today();
      const lookup = core.need<ToolsLookup>(SECURITY_SERVICES.tools);
      const fileId = clean(ctx.query.get("file"), 64);
      return {
        tools: lookup?.tools() ?? null,
        covers: lookup?.keyDateCovers() ?? null,
        summary: lookup?.summary(on, ctx.query.get("owner") === "1") ?? null,
        evidence: lookup?.evidence(on) ?? null,
        used_for: fileId ? (lookup?.usedFor(fileId) ?? null) : null,
      };
    });

    /** What `money-vendors` and `domain-senders` answer, as the tool's page reads them. */
    core.route("GET", "/data/_test/tools/links", (ctx) => {
      const vendorId = clean(ctx.query.get("vendor"), 64);
      const from = clean(ctx.query.get("from"), 10) || "2000-01-01";
      const money = moneyVendors();
      return {
        vendors: money?.vendors() ?? null,
        billed: money && vendorId ? money.billedSince(vendorId, from) : null,
        senders: domainSenders()?.senders() ?? null,
      };
    });

    /** Due as the Owner and as anyone else sees it (core's own filter), for the walk. */
    core.route("GET", "/data/_test/tools/due", async (ctx) => {
      const owner = ctx.query.get("owner") === "1";
      const { items } = await core.dueList({ owner, all: true });
      return { items: items.filter((item) => item.kind === "tool" || item.kind === "account") };
    });
  }
}
