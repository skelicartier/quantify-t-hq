/**
 * Buyer diligence and Labs dataset trials (ws-notes/company/spec.md §9): per waitlist firm,
 * one open diligence at a time (their questionnaire, a security review, references and
 * redlines), and any number of dataset trials. Three rules are refusals, not warnings: a
 * reference is never marked shared before their consent is recorded; a sample is never
 * sent before their compliance team cleared the trial; and a trial never renews on its own.
 *
 * Due rows (kind `diligence`, Data's Due only), `agenda:diligence`, and the `diligence`
 * service's "Used for" lines for the copies kept in "06 Contracts and NDAs › Diligence".
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import {
  COMPANY_SERVICES,
  type AgreementView,
  type AgreementsLookup,
  type UsedFor,
} from "../company-contracts";
import type { DataCore, DueItem } from "../core";
import { addDays } from "../days";
import { clean, cleanText } from "../guard";
import type { Staff } from "../protocol";
import {
  RAISE_SERVICES,
  agendaService,
  type AgendaItem,
  type AgendaSource,
  type WaitlistFeed,
} from "../raise-contracts";
import { TRIAL_DECISIONS, dayShort, dayWords } from "../../../src/lib/data/labels-close";
import {
  CLOSE_TOTALS,
  FOLDERS,
  anyDay,
  full,
  invalid,
  keepCopy,
  keyOf,
  pastDay,
  wholeAmount,
} from "../closing/limits";
import {
  DILIGENCE_LIMITS,
  NEVER_RENEWS,
  NOT_CLEARED,
  NO_CONSENT,
  QUESTIONNAIRE_AHEAD,
  TRIAL_DECIDE_AHEAD,
  TRIAL_END_AHEAD,
} from "./limits";
import type { Diligence, DiligenceEvent, Redline, Reference, Trial } from "./types";

const FILE = "diligence/diligence.json";
const EVENTS = "diligence/events.jsonl";
const OUTCOMES = ["passed", "conditions", "failed", ""] as const;
const STATUSES = ["with_us", "with_them", "agreed"] as const;

const errorName = (error: unknown): string => (error instanceof Error ? error.name : "error");

/** `auto_renews` given as anything but false (or blank) is refused with its sentence. */
function refuseRenewal(value: unknown): void {
  if (value === undefined || value === null || value === false) return;
  if (typeof value === "string" && ["", "false", "0", "no", "off"].includes(value.trim())) return;
  throw new Refused(400, "invalid", NEVER_RENEWS);
}

export function register(core: DataCore): void {
  const stored = core.store.readJson<{ diligence?: Diligence[]; trials?: Trial[] }>(FILE, {});
  const diligence: Diligence[] = Array.isArray(stored.diligence) ? stored.diligence : [];
  const trials: Trial[] = Array.isArray(stored.trials) ? stored.trials : [];
  const save = (): void => core.store.writeJson(FILE, { format: 1, diligence, trials });
  const log = (
    target: DiligenceEvent["target"],
    id: string,
    verb: string,
    detail: string,
    by: Staff,
  ) => {
    const event: DiligenceEvent = {
      event_id: randomUUID(),
      target,
      id,
      verb,
      detail,
      by,
      at: core.now(),
    };
    core.store.appendLine(EVENTS, event);
  };

  const feed = () => core.need<WaitlistFeed>(RAISE_SERVICES.waitlistFeed);
  const agreements = () => core.need<AgreementsLookup>(COMPANY_SERVICES.agreements);
  const entryOf = (entryId: string): { entry_id: string; firm: string; stage: string } | null => {
    try {
      const found = feed()
        ?.entries()
        .find((entry) => entry.entry_id === entryId);
      return found ? { entry_id: found.entry_id, firm: found.firm, stage: found.stage } : null;
    } catch (error) {
      core.log(`diligence: the waitlist could not be read: ${errorName(error)}`);
      return null;
    }
  };
  const mustEntry = (entryId: unknown) => {
    const entry = entryOf(clean(entryId, 64));
    if (!entry) throw new Refused(404, "not_found", "That firm is not on the waitlist.");
    return entry;
  };
  const stages = (): Map<string, string> => {
    try {
      return new Map((feed()?.entries() ?? []).map((entry) => [entry.entry_id, entry.stage]));
    } catch {
      return new Map();
    }
  };
  const mustDiligence = (id: string | undefined): Diligence => {
    const found = diligence.find((item) => item.diligence_id === id);
    if (!found) throw new Refused(404, "not_found", "That diligence is not here.");
    return found;
  };
  const mustTrial = (id: string | undefined): Trial => {
    const found = trials.find((item) => item.trial_id === id);
    if (!found) throw new Refused(404, "not_found", "That trial is not here.");
    return found;
  };
  const touch = (record: { updated_at: string; updated_by: Staff }, by: Staff): void => {
    record.updated_at = core.now();
    record.updated_by = by;
  };
  const agreementsFor = (entryId: string): AgreementView[] | null => {
    const register = agreements();
    if (!register) return null;
    try {
      return register.forParty("waitlist", entryId);
    } catch (error) {
      core.log(`diligence: agreements could not be read: ${errorName(error)}`);
      return [];
    }
  };
  const copy = (body: Record<string, unknown>, prefix: string, title: string, by: Staff) =>
    keepCopy(core, body, prefix, { folder: FOLDERS.diligence, title, note: title, by });

  // ---------------------------------------------------------------- what other modules ask

  const used: UsedFor = {
    usedFor: (fileId) => {
      const found: { label: string; href: string }[] = [];
      for (const item of diligence) {
        const href = `/data/waitlist/${item.entry_id}#waitlist-diligence`;
        if (item.questionnaire.file_id === fileId)
          found.push({ label: `Questionnaire from ${item.firm}`, href });
        if (item.questionnaire.answers_file_id === fileId)
          found.push({ label: `Answers to ${item.firm}'s questionnaire`, href });
        for (const redline of item.redlines)
          if (redline.file_id === fileId)
            found.push({ label: `Redline round ${redline.round} with ${item.firm}`, href });
      }
      for (const trial of trials)
        if (trial.sample?.file_id === fileId)
          found.push({
            label: `Sample sent to ${trial.firm} for a trial`,
            href: `/data/waitlist/${trial.entry_id}#waitlist-trials`,
          });
      return found;
    },
  };
  core.provide(COMPANY_SERVICES.diligence, used);

  core.provideDue((): DueItem[] => {
    const today = core.day();
    const items: DueItem[] = [];
    for (const item of diligence) {
      const due = item.questionnaire.due_on;
      if (
        item.state === "open" &&
        due &&
        !item.questionnaire.answered_on &&
        due <= addDays(today, QUESTIONNAIRE_AHEAD)
      )
        items.push({
          key: `diligence:${item.diligence_id}:questionnaire`,
          kind: "diligence",
          title: `Answer ${item.firm}'s questionnaire`,
          sub: "Diligence · their questionnaire",
          due_on: due,
          href: `/data/waitlist/${item.entry_id}#waitlist-diligence`,
        });
    }
    for (const trial of trials) {
      if (trial.decision) continue;
      const href = `/data/waitlist/${trial.entry_id}#waitlist-trials`;
      if (trial.go_no_go_on && trial.go_no_go_on <= addDays(today, TRIAL_DECIDE_AHEAD))
        items.push({
          key: `trial:${trial.trial_id}:decide`,
          kind: "diligence",
          title: `Go or no-go on the trial: ${trial.firm}`,
          sub: `Dataset trial · ${trial.dataset}`,
          due_on: trial.go_no_go_on,
          href,
        });
      if (trial.ends_on && trial.ends_on <= addDays(today, TRIAL_END_AHEAD))
        items.push({
          key: `trial:${trial.trial_id}:end`,
          kind: "diligence",
          title: `The trial with ${trial.firm} ends ${dayShort(trial.ends_on)}`,
          sub: `Dataset trial · ${trial.dataset}`,
          due_on: trial.ends_on,
          href,
        });
    }
    return items;
  });

  const agendaOf = (): AgendaItem[] => {
    const items: AgendaItem[] = [];
    for (const item of diligence) {
      const due = item.questionnaire.due_on;
      if (item.state !== "open" || !due || item.questionnaire.answered_on) continue;
      items.push({
        key: `diligence:${item.diligence_id}:questionnaire`,
        kind: "diligence",
        title: `Questionnaire due · ${item.firm}`,
        plain: "Questionnaire due",
        sub: "Diligence",
        on: due,
        remind_days: [7, 0],
        href: `/data/waitlist/${item.entry_id}#waitlist-diligence`,
      });
    }
    for (const trial of trials) {
      if (trial.decision) continue;
      const href = `/data/waitlist/${trial.entry_id}#waitlist-trials`;
      if (trial.go_no_go_on)
        items.push({
          key: `trial:${trial.trial_id}:decide`,
          kind: "diligence",
          title: `Trial decision · ${trial.firm}`,
          plain: "Trial decision",
          sub: `Dataset trial · ${trial.dataset}`,
          on: trial.go_no_go_on,
          remind_days: [3, 0],
          href,
        });
      if (trial.ends_on)
        items.push({
          key: `trial:${trial.trial_id}:end`,
          kind: "diligence",
          title: `Trial ends · ${trial.firm}`,
          plain: "Trial ends",
          sub: `Dataset trial · ${trial.dataset}`,
          on: trial.ends_on,
          remind_days: [0],
          href,
        });
    }
    return items.sort((a, b) => a.on.localeCompare(b.on) || a.title.localeCompare(b.title));
  };
  const agenda: AgendaSource = {
    agenda: (today) => {
      void today; // every open item, overdue ones included
      try {
        return agendaOf();
      } catch (error) {
        core.log(`diligence agenda failed: ${errorName(error)}`);
        return [];
      }
    },
  };
  core.provide(agendaService("diligence"), agenda);

  // ---------------------------------------------------------------- reading

  core.route("GET", "/data/diligence", () => {
    const stageOf = stages();
    const byFirm = (a: { firm: string }, b: { firm: string }) =>
      a.firm.localeCompare(b.firm, "en", { sensitivity: "base", numeric: true });
    return {
      diligence: [...diligence]
        .sort((a, b) => (a.state === b.state ? byFirm(a, b) : a.state === "open" ? -1 : 1))
        .map((item) => ({ ...item, entry_stage: stageOf.get(item.entry_id) ?? null })),
      trials: [...trials]
        .sort((a, b) => byFirm(a, b) || a.dataset.localeCompare(b.dataset))
        .map((trial) => ({ ...trial, entry_stage: stageOf.get(trial.entry_id) ?? null })),
      counts: {
        open: diligence.filter((item) => item.state === "open").length,
        closed: diligence.filter((item) => item.state === "closed").length,
        trials: trials.length,
        trials_open: trials.filter((trial) => !trial.decision).length,
      },
      today: core.day(),
    };
  });

  core.route("GET", "/data/diligence/for-entry/:entryId", (ctx) => {
    const entryId = ctx.params[0] ?? "";
    const mine = diligence.filter((item) => item.entry_id === entryId);
    return {
      diligence: mine.find((item) => item.state === "open") ?? null,
      closed: mine.filter((item) => item.state === "closed").length,
      trials: trials
        .filter((trial) => trial.entry_id === entryId)
        .sort((a, b) => b.created_at.localeCompare(a.created_at)),
      agreements: agreementsFor(entryId),
      today: core.day(),
    };
  });

  // ---------------------------------------------------------------- buyer diligence

  core.route("POST", "/data/diligence", (ctx) => {
    const by = ctx.staff();
    const entry = mustEntry(ctx.body.entry_id);
    if (diligence.some((item) => item.entry_id === entry.entry_id && item.state === "open"))
      throw new Refused(409, "diligence_open", `${entry.firm}'s diligence is open already.`);
    full(diligence.length, CLOSE_TOTALS.diligence, "diligence records");
    const at = core.now();
    const item: Diligence = {
      diligence_id: randomUUID(),
      entry_id: entry.entry_id,
      firm: entry.firm,
      state: "open",
      questionnaire: {
        received_on: null,
        due_on: null,
        answered_on: null,
        questions: null,
        file_id: null,
        answers_file_id: null,
      },
      security_review: { started_on: null, finished_on: null, outcome: "", note: "" },
      references: [],
      redlines: [],
      created_at: at,
      created_by: by,
      updated_at: at,
      updated_by: by,
    };
    diligence.push(item);
    save();
    log("diligence", item.diligence_id, "opened", entry.firm, by);
    return { diligence: item };
  });

  core.route("POST", "/data/diligence/:id/questionnaire", async (ctx) => {
    const by = ctx.staff();
    const item = mustDiligence(ctx.params[0]);
    const body = ctx.body;
    const today = core.day();
    const received = pastDay(body.received_on, today, true);
    const due = anyDay(body.due_on);
    const answered = pastDay(body.answered_on, today, true);
    const questions = wholeAmount(
      body.questions,
      "Give the number of questions as a whole number, from 1 to 2,000.",
    );
    if (questions !== null && questions > DILIGENCE_LIMITS.questions)
      throw invalid("Give the number of questions as a whole number, from 1 to 2,000.");
    const file = await copy(body, "", `Questionnaire from ${item.firm}`, by);
    const answers = await copy(body, "answers_", `Answers to ${item.firm}'s questionnaire`, by);
    item.questionnaire = {
      received_on: received,
      due_on: due,
      answered_on: answered,
      questions,
      file_id: file?.file_id ?? item.questionnaire.file_id,
      answers_file_id: answers?.file_id ?? item.questionnaire.answers_file_id,
    };
    touch(item, by);
    save();
    log("diligence", item.diligence_id, "questionnaire", due ? `due ${due}` : "", by);
    return { diligence: item };
  });

  core.route("POST", "/data/diligence/:id/security-review", (ctx) => {
    const by = ctx.staff();
    const item = mustDiligence(ctx.params[0]);
    const today = core.day();
    const started = pastDay(ctx.body.started_on, today, true);
    const finished = pastDay(ctx.body.finished_on, today, true);
    if (started && finished && finished < started)
      throw invalid("The review finished before it started.");
    item.security_review = {
      started_on: started,
      finished_on: finished,
      outcome: keyOf(ctx.body.outcome, OUTCOMES, "Choose how the review went.", ""),
      note: cleanText(ctx.body.note, DILIGENCE_LIMITS.note),
    };
    touch(item, by);
    save();
    log("diligence", item.diligence_id, "security_review", item.security_review.outcome, by);
    return { diligence: item };
  });

  core.route("POST", "/data/diligence/:id/close", (ctx) => {
    const by = ctx.staff();
    const item = mustDiligence(ctx.params[0]);
    item.state = "closed";
    touch(item, by);
    save();
    log("diligence", item.diligence_id, "closed", "", by);
    return { diligence: item };
  });

  core.route("POST", "/data/diligence/:id/reopen", (ctx) => {
    const by = ctx.staff();
    const item = mustDiligence(ctx.params[0]);
    if (
      item.state === "closed" &&
      diligence.some((other) => other.entry_id === item.entry_id && other.state === "open")
    )
      throw new Refused(409, "diligence_open", `${item.firm}'s diligence is open already.`);
    item.state = "open";
    touch(item, by);
    save();
    log("diligence", item.diligence_id, "reopened", "", by);
    return { diligence: item };
  });

  const referenceOf = (body: Record<string, unknown>, before: Reference | null): Reference => {
    const today = core.day();
    const name = cleanText(body.name, DILIGENCE_LIMITS.name);
    if (!name) throw invalid("Give the reference's name.");
    const consent = pastDay(body.consent_on, today, true);
    const shared = pastDay(body.shared_on, today, true);
    if (shared && (!consent || consent > shared)) throw new Refused(409, "no_consent", NO_CONSENT);
    return {
      reference_id: before?.reference_id ?? randomUUID(),
      name,
      firm: cleanText(body.firm, DILIGENCE_LIMITS.firm),
      role: cleanText(body.role, DILIGENCE_LIMITS.role),
      consent_on: consent,
      shared_on: shared,
      outcome: cleanText(body.outcome, DILIGENCE_LIMITS.outcome),
    };
  };

  core.route("POST", "/data/diligence/:id/references", (ctx) => {
    const by = ctx.staff();
    const item = mustDiligence(ctx.params[0]);
    if (item.references.length >= DILIGENCE_LIMITS.references)
      throw invalid(`${DILIGENCE_LIMITS.references} references at most.`);
    const reference = referenceOf(ctx.body, null);
    item.references.push(reference);
    touch(item, by);
    save();
    log("diligence", item.diligence_id, "reference", reference.name, by);
    return { diligence: item };
  });

  core.route("POST", "/data/diligence/:id/references/:rid/update", (ctx) => {
    const by = ctx.staff();
    const item = mustDiligence(ctx.params[0]);
    const index = item.references.findIndex((ref) => ref.reference_id === ctx.params[1]);
    const before = item.references[index];
    if (!before) throw new Refused(404, "not_found", "That reference is not here.");
    item.references[index] = referenceOf(ctx.body, before);
    touch(item, by);
    save();
    log("diligence", item.diligence_id, "reference", before.name, by);
    return { diligence: item };
  });

  const redlineOf = async (
    item: Diligence,
    body: Record<string, unknown>,
    before: Redline | null,
    by: Staff,
  ): Promise<Redline> => {
    const document = cleanText(body.document, DILIGENCE_LIMITS.document);
    if (!document) throw invalid("Say which document.");
    const sameDocument = item.redlines.filter((line) => line.document === document);
    const round =
      wholeAmount(body.round, "Give the round as a whole number, from 1 to 50.") ??
      before?.round ??
      sameDocument.length + 1;
    if (round > DILIGENCE_LIMITS.rounds)
      throw invalid("Give the round as a whole number, from 1 to 50.");
    const file = await copy(body, "", `Redline round ${round} with ${item.firm}`, by);
    return {
      redline_id: before?.redline_id ?? randomUUID(),
      document,
      agreement_id: clean(body.agreement_id, 64) || null,
      round,
      sent_on: anyDay(body.sent_on),
      received_on: anyDay(body.received_on),
      status: keyOf(body.status, STATUSES, "Choose who has it.", "with_them"),
      file_id: file?.file_id ?? before?.file_id ?? null,
    };
  };

  core.route("POST", "/data/diligence/:id/redlines", async (ctx) => {
    const by = ctx.staff();
    const item = mustDiligence(ctx.params[0]);
    if (item.redlines.length >= DILIGENCE_LIMITS.redlines)
      throw invalid(`${DILIGENCE_LIMITS.redlines} redline rounds at most.`);
    const redline = await redlineOf(item, ctx.body, null, by);
    item.redlines.push(redline);
    touch(item, by);
    save();
    log(
      "diligence",
      item.diligence_id,
      "redline",
      `${redline.document} round ${redline.round}`,
      by,
    );
    return { diligence: item };
  });

  core.route("POST", "/data/diligence/:id/redlines/:rid/update", async (ctx) => {
    const by = ctx.staff();
    const item = mustDiligence(ctx.params[0]);
    const index = item.redlines.findIndex((line) => line.redline_id === ctx.params[1]);
    const before = item.redlines[index];
    if (!before) throw new Refused(404, "not_found", "That redline is not here.");
    item.redlines[index] = await redlineOf(item, ctx.body, before, by);
    touch(item, by);
    save();
    log("diligence", item.diligence_id, "redline", `${before.document} round ${before.round}`, by);
    return { diligence: item };
  });

  // ---------------------------------------------------------------- dataset trials

  const termOf = (body: Record<string, unknown>) => {
    const starts = anyDay(body.starts_on);
    const ends = anyDay(body.ends_on);
    if (starts && ends && ends < starts) throw invalid("The trial ends before it starts.");
    return { starts, ends, decide: anyDay(body.go_no_go_on) };
  };

  core.route("POST", "/data/trials", (ctx) => {
    const by = ctx.staff();
    const body = ctx.body;
    refuseRenewal(body.auto_renews);
    const entry = mustEntry(body.entry_id);
    full(trials.length, CLOSE_TOTALS.trials, "trials");
    const dataset = cleanText(body.dataset, DILIGENCE_LIMITS.dataset);
    if (!dataset) throw invalid("Name the dataset.");
    const { starts, ends, decide } = termOf(body);
    const at = core.now();
    const trial: Trial = {
      trial_id: randomUUID(),
      entry_id: entry.entry_id,
      firm: entry.firm,
      dataset,
      dictionary_version: cleanText(body.dictionary_version, DILIGENCE_LIMITS.dictionary_version),
      compliance: { cleared_on: null, by_name: "" },
      sample: null,
      starts_on: starts,
      ends_on: ends,
      go_no_go_on: decide,
      decision: null,
      auto_renews: false,
      created_at: at,
      created_by: by,
      updated_at: at,
      updated_by: by,
    };
    trials.push(trial);
    save();
    log("trial", trial.trial_id, "added", dataset, by);
    return { trial };
  });

  core.route("POST", "/data/trials/:id/update", (ctx) => {
    const by = ctx.staff();
    const trial = mustTrial(ctx.params[0]);
    const body = ctx.body;
    refuseRenewal(body.auto_renews);
    const dataset = cleanText(body.dataset, DILIGENCE_LIMITS.dataset);
    if (!dataset) throw invalid("Name the dataset.");
    const { starts, ends, decide } = termOf(body);
    trial.dataset = dataset;
    trial.dictionary_version = cleanText(
      body.dictionary_version,
      DILIGENCE_LIMITS.dictionary_version,
    );
    trial.starts_on = starts;
    trial.ends_on = ends;
    trial.go_no_go_on = decide;
    touch(trial, by);
    save();
    log("trial", trial.trial_id, "edited", dataset, by);
    return { trial };
  });

  core.route("POST", "/data/trials/:id/clearance", (ctx) => {
    const by = ctx.staff();
    const trial = mustTrial(ctx.params[0]);
    refuseRenewal(ctx.body.auto_renews);
    const cleared = pastDay(ctx.body.cleared_on, core.day());
    const byName = cleanText(ctx.body.by_name, DILIGENCE_LIMITS.by_name);
    if (!byName) throw invalid("Say who on their compliance team cleared it.");
    if (trial.sample && cleared && cleared > trial.sample.sent_on)
      throw new Refused(409, "not_cleared", NOT_CLEARED);
    trial.compliance = { cleared_on: cleared, by_name: byName };
    touch(trial, by);
    save();
    log("trial", trial.trial_id, "cleared", `${cleared ?? ""} by ${byName}`, by);
    return { trial };
  });

  core.route("POST", "/data/trials/:id/sample", async (ctx) => {
    const by = ctx.staff();
    const trial = mustTrial(ctx.params[0]);
    refuseRenewal(ctx.body.auto_renews);
    const sent = pastDay(ctx.body.sent_on, core.day()) ?? core.day();
    const cleared = trial.compliance.cleared_on;
    if (!cleared || cleared > sent) throw new Refused(409, "not_cleared", NOT_CLEARED);
    const file = await copy(ctx.body, "", `Sample sent to ${trial.firm} for a trial`, by);
    trial.sample = { sent_on: sent, file_id: file?.file_id ?? trial.sample?.file_id ?? null };
    touch(trial, by);
    save();
    log("trial", trial.trial_id, "sample", sent, by);
    return { trial };
  });

  core.route("POST", "/data/trials/:id/decision", (ctx) => {
    const by = ctx.staff();
    const trial = mustTrial(ctx.params[0]);
    refuseRenewal(ctx.body.auto_renews);
    const outcome = clean(ctx.body.outcome, 10);
    if (outcome !== "go" && outcome !== "no_go") throw invalid("Choose Go or No-go.");
    const on = pastDay(ctx.body.on, core.day()) ?? core.day();
    trial.decision = {
      outcome,
      on,
      note: cleanText(ctx.body.note, DILIGENCE_LIMITS.note),
      by,
    };
    touch(trial, by);
    save();
    log("trial", trial.trial_id, "decision", `${TRIAL_DECISIONS[outcome]} on ${dayWords(on)}`, by);
    return { trial };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    core.route("GET", "/data/_test/diligence/agenda", () => ({ items: agenda.agenda(core.day()) }));
  }
}
