/**
 * Regulatory profiles (ws-notes/security/spec.md §9): one per waitlist firm (the customer of a
 * pilot and of a diligence), the rules it works under (SEBI CSCRF, EU DORA, UK financial
 * regulation, other), the duties its contract passes down (ticking a regime adds its
 * `FLOWDOWNS` as unchecked duties; he withdraws what does not apply, or adds his own words),
 * which of them are in the contract, and the day it applies from.
 *
 * Provides `profiles` (`ProfilesLookup`): `inForce` for U3's fix-by days (only duties with an
 * effect, marked in the contract, on a profile applying by today), `forEntry` for the firm's
 * and the pilot's pages, the Summary's lines, and "Used for" of a duty's copy of the
 * contract. A build for the Customer duties CSV. Nothing here sends, files or fetches.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import { CLOSE_TOTALS, anyDay, full, invalid, keepCopy, keyOf } from "../closing/limits";
import {
  COMPANY_SERVICES,
  type AgreementView,
  type AgreementsLookup,
  type Flag,
} from "../company-contracts";
import type { DataCore } from "../core";
import { clean, cleanText } from "../guard";
import type { FilesService } from "../leads/contracts";
import { fileChoices } from "../meetings/copy";
import type { Staff } from "../protocol";
import { RAISE_SERVICES, type WaitlistFeed } from "../raise-contracts";
import {
  FLOWDOWNS,
  SECURITY_SERVICES,
  isFlowdownKey,
  type EvidenceOption,
  type FlowdownKey,
  type ProfilesLookup,
  type Regime,
  type SummaryLine,
} from "../security-contracts";
import { BOM } from "../questionnaires/export";
import { toCsv } from "../text";
import { countWords } from "../../../src/lib/data/labels-controls";
import {
  DUTY_STATE_WORDS,
  NOT_APPLIED,
  appliesFromWords,
} from "../../../src/lib/data/labels-questionnaires";
import {
  ProfilesBook,
  appliesBy,
  contractDutiesOf,
  dutyWords,
  effectsOf,
  flowdownFor,
  inForceOf,
  lineOf,
  live,
  regimesOf,
  rulesWords,
} from "./book";
import { CONTRACT_FOLDER, PROFILE_LIMITS } from "./limits";
import { DUTY_STATES, SEBI_CATEGORIES, type Duty, type Profile } from "./types";

const FLAGS: readonly Flag[] = ["yes", "no", ""];

const errorName = (error: unknown): string => (error instanceof Error ? error.name : "error");

/** A box ticked in a form or a body: true, "true", "on", "1", "yes". */
const ticked = (value: unknown): boolean => {
  if (typeof value === "boolean") return value;
  const text = clean(value, 8).toLowerCase();
  return text === "true" || text === "on" || text === "1" || text === "yes";
};

export function register(core: DataCore): void {
  const book = new ProfilesBook(core);

  const feed = () => core.need<WaitlistFeed>(RAISE_SERVICES.waitlistFeed);
  const agreements = () => core.need<AgreementsLookup>(COMPANY_SERVICES.agreements);
  const files = () => core.need<FilesService>("files");

  const entryOf = (entryId: string): { entry_id: string; firm: string; stage: string } | null => {
    try {
      const found = feed()
        ?.entries()
        .find((entry) => entry.entry_id === entryId);
      return found ? { entry_id: found.entry_id, firm: found.firm, stage: found.stage } : null;
    } catch (error) {
      core.log(`profiles: the waitlist could not be read: ${errorName(error)}`);
      return null;
    }
  };

  const agreementsFor = (entryId: string): AgreementView[] | null => {
    const register = agreements();
    if (!register) return null;
    try {
      return register.forParty("waitlist", entryId);
    } catch (error) {
      core.log(`profiles: agreements could not be read: ${errorName(error)}`);
      return [];
    }
  };

  const touch = (profile: Profile, by: Staff) => {
    profile.updated_at = core.now();
    profile.updated_by = by;
  };

  /** Add a regime's flowdowns as unchecked duties, each once. */
  const addFlowdowns = (profile: Profile, regime: Regime): number => {
    let added = 0;
    for (const flowdown of FLOWDOWNS) {
      if (flowdown.regime !== regime) continue;
      if (profile.duties.some((duty) => duty.key === flowdown.key)) continue;
      if (profile.duties.length >= PROFILE_LIMITS.duties) break;
      profile.duties.push(newDuty(flowdown.key, ""));
      added += 1;
    }
    return added;
  };

  const newDuty = (key: FlowdownKey | null, words: string): Duty => ({
    duty_id: randomUUID(),
    key,
    words,
    state: "",
    agreement_id: null,
    file_id: null,
    note: "",
    withdrawn: null,
  });

  // ---------------------------------------------------------------- what other modules ask

  const summary = (today: string): SummaryLine[] => {
    const lines: SummaryLine[] = [];
    const all = book.profiles;
    const inContract = all.reduce(
      (sum, profile) => sum + live(profile).filter((duty) => duty.state === "in_contract").length,
      0,
    );
    const unchecked = all.reduce(
      (sum, profile) => sum + live(profile).filter((duty) => duty.state === "").length,
      0,
    );
    lines.push({
      key: "profiles",
      area: "buyers",
      title: "Customer duties",
      words:
        all.length === 0
          ? "No customer has a regulatory profile yet."
          : `${countWords(all.length, "customer")} with a regulatory profile; ${countWords(inContract, "duty", "duties")} in contracts; ${unchecked === 0 ? "none" : unchecked} not checked yet.`,
      attention: unchecked > 0,
      href: "/data/assurance/customers",
    });
    const sbom = all.filter(
      (profile) =>
        appliesBy(profile, today) &&
        live(profile).some((duty) => duty.key === "cscrf-sbom" && duty.state === "in_contract"),
    );
    if (sbom.length > 0) {
      const firms = sbom.map((profile) => `${profile.firm}'s`);
      const who =
        firms.length === 1
          ? `${firms[0]} contract`
          : `${firms.slice(0, -1).join(", ")} and ${firms.at(-1)} contracts`;
      lines.push({
        key: "sbom",
        area: "buyers",
        title: "Software bill of materials",
        words: `A software bill of materials is in ${who}. HQ keeps none yet: it comes with the release records.`,
        attention: true,
        href: "/data/assurance/customers",
      });
    }
    return lines;
  };

  const service: ProfilesLookup = {
    usedFor: (fileId) => {
      const found: { label: string; href: string }[] = [];
      for (const profile of book.profiles)
        for (const duty of profile.duties)
          if (duty.file_id === fileId) {
            const words = dutyWords(duty);
            found.push({
              label: `${profile.firm}'s contract: ${words.charAt(0).toLowerCase()}${words.slice(1)}`,
              href: `/data/waitlist/${profile.entry_id}/profile`,
            });
          }
      return found;
    },
    summary: (today) => summary(today),
    evidence: () => [] as EvidenceOption[],
    inForce: (today) => inForceOf(book.profiles, today),
    inContract: (today) => contractDutiesOf(book.profiles, today),
    forEntry: (entryId) => {
      const profile = book.forEntry(entryId);
      return profile ? lineOf(profile) : null;
    },
  };
  core.provide(SECURITY_SERVICES.profiles, service);

  core.provideOverview("profiles", () => {
    const today = core.day();
    return {
      profiles: book.profiles.length,
      in_force: book.profiles.filter((profile) => appliesBy(profile, today)).length,
      in_contract: book.profiles.reduce(
        (sum, profile) => sum + live(profile).filter((duty) => duty.state === "in_contract").length,
        0,
      ),
      unchecked: book.profiles.reduce(
        (sum, profile) => sum + live(profile).filter((duty) => duty.state === "").length,
        0,
      ),
    };
  });

  // ---------------------------------------------------------------- views

  const rowOf = (profile: Profile, today: string) => {
    const duties = live(profile);
    return {
      ...lineOf(profile),
      profile_id: profile.profile_id,
      rules: rulesWords(profile),
      duties: duties.length,
      not_in_contract: duties.filter((duty) => duty.state === "not_in_contract").length,
      applies_from: profile.applies_from,
      in_force: appliesBy(profile, today),
    };
  };

  const detailOf = (profile: Profile, today: string) => ({
    ...profile,
    line: lineOf(profile),
    rules: rulesWords(profile),
    in_force: appliesBy(profile, today),
    applies_words: profile.applies_from ? appliesFromWords(profile.applies_from) : NOT_APPLIED,
    effects: effectsOf(profile),
    duties: profile.duties.map((duty) => {
      const flowdown = flowdownFor(duty);
      return {
        ...duty,
        shown: dutyWords(duty),
        ref: flowdown?.ref ?? "",
        regime: flowdown?.regime ?? null,
        note_from_list: flowdown?.note ?? "",
        effect: flowdown?.effect ?? null,
        critical_only:
          flowdown?.note !== undefined &&
          flowdown.note !== "" &&
          profile.regimes.dora?.critical_function !== "yes",
      };
    }),
  });

  core.route("GET", "/data/profiles", () => {
    const today = core.day();
    const rows = [...book.profiles]
      .sort((a, b) => a.firm.localeCompare(b.firm, "en", { sensitivity: "base", numeric: true }))
      .map((profile) => rowOf(profile, today));
    return {
      profiles: rows,
      counts: {
        profiles: rows.length,
        in_contract: rows.reduce((sum, row) => sum + row.in_contract, 0),
        unchecked: rows.reduce((sum, row) => sum + row.unchecked, 0),
      },
      today,
    };
  });

  core.route("GET", "/data/profiles/for-entry/:entryId", (ctx) => {
    const today = core.day();
    const entryId = ctx.params[0] ?? "";
    const profile = book.forEntry(entryId);
    return {
      profile: profile ? detailOf(profile, today) : null,
      entry: entryOf(entryId),
      agreements: agreementsFor(entryId),
      flowdowns: FLOWDOWNS,
      events: profile ? book.events(profile.profile_id).slice(0, 50) : [],
      files: fileChoices(core),
      files_here: files() !== null,
      today,
    };
  });

  // ---------------------------------------------------------------- writing

  core.route("POST", "/data/profiles", (ctx) => {
    const by = ctx.staff();
    const entryId = clean(ctx.body.entry_id, 64);
    const entry = entryOf(entryId);
    if (!entry) throw new Refused(404, "not_found", "That firm is not on the waitlist.");
    if (book.forEntry(entry.entry_id))
      throw new Refused(409, "profile_exists", `${entry.firm} already has a profile.`);
    full(book.profiles.length, CLOSE_TOTALS.pilots, "profiles");
    const at = core.now();
    const profile: Profile = {
      profile_id: randomUUID(),
      entry_id: entry.entry_id,
      firm: entry.firm,
      regimes: { sebi: null, dora: null, uk: null, other: "" },
      applies_from: null,
      duties: [],
      notes: "",
      created_at: at,
      created_by: by,
      updated_at: at,
      updated_by: by,
    };
    book.profiles.push(profile);
    book.save();
    book.log(profile.profile_id, "started", entry.firm, by);
    return { profile: detailOf(profile, core.day()) };
  });

  core.route("POST", "/data/profiles/:id/update", (ctx) => {
    const by = ctx.staff();
    const profile = book.must(ctx.params[0]);
    const body = ctx.body;
    const before = regimesOf(profile);
    const other = cleanText(body.other, PROFILE_LIMITS.other + 1);
    if (other.length > PROFILE_LIMITS.other)
      throw invalid("Name the other rules in 300 characters at most.");
    profile.regimes = {
      sebi: ticked(body.sebi)
        ? {
            category: keyOf(
              body.sebi_category,
              SEBI_CATEGORIES,
              "Choose the SEBI CSCRF category, or leave it blank.",
              "",
            ),
          }
        : null,
      dora: ticked(body.dora)
        ? {
            critical_function: keyOf(
              body.dora_critical,
              FLAGS,
              "Say whether the service supports a critical or important function.",
              "",
            ),
          }
        : null,
      uk: ticked(body.uk) ? { note: cleanText(body.uk_note, PROFILE_LIMITS.uk_note) } : null,
      other,
    };
    profile.applies_from = anyDay(body.applies_from);
    profile.notes = cleanText(body.notes, PROFILE_LIMITS.notes);
    let added = 0;
    for (const regime of ["sebi", "dora", "uk"] as const)
      if (profile.regimes[regime] && !before.includes(regime))
        added += addFlowdowns(profile, regime);
    touch(profile, by);
    book.save();
    book.log(profile.profile_id, "edited", added > 0 ? `${added} duties added` : "", by);
    return { profile: detailOf(profile, core.day()) };
  });

  core.route("POST", "/data/profiles/:id/duties", (ctx) => {
    const by = ctx.staff();
    const profile = book.must(ctx.params[0]);
    if (profile.duties.length >= PROFILE_LIMITS.duties)
      throw invalid(`${PROFILE_LIMITS.duties} duties at most.`);
    const key = clean(ctx.body.key, 40);
    let duty: Duty;
    if (key) {
      if (!isFlowdownKey(key)) throw invalid("Choose a duty from the list, or write your own.");
      const there = profile.duties.find((item) => item.key === key);
      if (there && !there.withdrawn) throw invalid("That duty is on the profile already.");
      if (there) {
        // Added again after it was withdrawn: it is looked at afresh, not in force as it was.
        there.withdrawn = null;
        there.state = "";
        duty = there;
      } else {
        duty = newDuty(key, "");
        profile.duties.push(duty);
      }
    } else {
      const words = cleanText(ctx.body.words, PROFILE_LIMITS.words + 1);
      if (words.length < PROFILE_LIMITS.words_min || words.length > PROFILE_LIMITS.words)
        throw invalid("Write the duty in 3 to 300 characters.");
      duty = newDuty(null, words);
      profile.duties.push(duty);
    }
    touch(profile, by);
    book.save();
    book.log(profile.profile_id, "duty added", dutyWords(duty).slice(0, 80), by);
    return { profile: detailOf(profile, core.day()) };
  });

  const mustDuty = (profile: Profile, dutyId: string | undefined): Duty => {
    const found = profile.duties.find((duty) => duty.duty_id === dutyId);
    if (!found) throw new Refused(404, "not_found", "That duty is not on this profile.");
    return found;
  };

  core.route("POST", "/data/profiles/:id/duties/:dutyId/withdraw", (ctx) => {
    const by = ctx.staff();
    const profile = book.must(ctx.params[0]);
    const duty = mustDuty(profile, ctx.params[1]);
    const why = cleanText(ctx.body.why, PROFILE_LIMITS.why);
    duty.withdrawn = { on: core.day(), why };
    touch(profile, by);
    book.save();
    book.log(profile.profile_id, "duty withdrawn", dutyWords(duty).slice(0, 80), by);
    return { profile: detailOf(profile, core.day()) };
  });

  core.route("POST", "/data/profiles/:id/duties/:dutyId", async (ctx) => {
    const by = ctx.staff();
    const profile = book.must(ctx.params[0]);
    const duty = mustDuty(profile, ctx.params[1]);
    const body = ctx.body;
    if (duty.withdrawn) throw invalid("Add the duty again before changing it.");
    const state = keyOf(
      body.state,
      DUTY_STATES,
      "Choose In the contract, Not in it or Not checked.",
      "",
    );
    const agreementId = clean(body.agreement_id, 64) || null;
    if (agreementId) {
      const known = agreementsFor(profile.entry_id);
      if (known === null)
        throw new Refused(409, "agreements_missing", "The agreements register is not loaded here.");
      if (!known.some((item) => item.agreement_id === agreementId))
        throw invalid(`That agreement is not one of ${profile.firm}'s.`);
    }
    const note = cleanText(body.note, PROFILE_LIMITS.note + 1);
    if (note.length > PROFILE_LIMITS.note)
      throw invalid("Write the note in 500 characters at most.");
    const words = dutyWords(duty);
    const file = await keepCopy(core, body, "", {
      folder: CONTRACT_FOLDER,
      title: `${profile.firm}'s contract`,
      note: `${profile.firm}'s contract: ${words}`,
      by,
    });
    duty.state = state;
    duty.agreement_id = agreementId;
    duty.note = note;
    if (file) duty.file_id = file.file_id;
    else if (ticked(body.detach)) duty.file_id = null;
    touch(profile, by);
    book.save();
    book.log(profile.profile_id, "duty", `${words.slice(0, 60)}: ${DUTY_STATE_WORDS[state]}`, by);
    return { profile: detailOf(profile, core.day()) };
  });

  core.builds.provide("profiles_csv", async (handle) => {
    const { writeFileSync } = await import("node:fs");
    const titles = new Map<string, string>();
    const rows: string[][] = [];
    for (const profile of [...book.profiles].sort((a, b) => a.firm.localeCompare(b.firm))) {
      const known = agreementsFor(profile.entry_id) ?? [];
      for (const item of known) titles.set(item.agreement_id, item.title);
      for (const duty of live(profile))
        rows.push([
          profile.firm,
          rulesWords(profile),
          dutyWords(duty),
          flowdownFor(duty)?.ref ?? "His own words",
          DUTY_STATE_WORDS[duty.state],
          duty.agreement_id ? (titles.get(duty.agreement_id) ?? duty.agreement_id) : "",
        ]);
    }
    handle.setProgress(0, rows.length);
    writeFileSync(
      handle.path,
      BOM + toCsv(["Firm", "Rules", "Duty", "From", "In the contract", "Agreement"], rows),
      { mode: 0o600 },
    );
    handle.setProgress(rows.length, rows.length);
    return { name: `Customer duties ${core.day()}.csv`, type: "text/csv; charset=utf-8" };
  });

  // ---------------------------------------------------------------- test routes

  if (core.testRoutes) {
    /** What the Summary and U3's fix-by days would read, on a day the test gives. */
    core.route("GET", "/data/_test/profiles/lookup", (ctx) => {
      const day = anyDay(ctx.query.get("today")) ?? core.day();
      const entryId = clean(ctx.query.get("entry_id"), 64);
      return {
        summary: service.summary(day, ctx.query.get("owner") === "1"),
        in_force: service.inForce(day),
        for_entry: entryId ? service.forEntry(entryId) : null,
      };
    });

    /**
     * A profile for the walk's firm, safe to run twice: SEBI CSCRF (mid-size), `cscrf-patch`
     * in the contract, applying from `applies_from` (today when not given).
     */
    core.route("POST", "/data/_test/profiles/seed", (ctx) => {
      const by = ctx.staff();
      const entry = entryOf(clean(ctx.body.entry_id, 64));
      if (!entry) throw new Refused(404, "not_found", "That firm is not on the waitlist.");
      let profile = book.forEntry(entry.entry_id);
      if (!profile) {
        const at = core.now();
        profile = {
          profile_id: randomUUID(),
          entry_id: entry.entry_id,
          firm: entry.firm,
          regimes: { sebi: { category: "mid" }, dora: null, uk: null, other: "" },
          applies_from: anyDay(ctx.body.applies_from) ?? core.day(),
          duties: [],
          notes: "",
          created_at: at,
          created_by: by,
          updated_at: at,
          updated_by: by,
        };
        addFlowdowns(profile, "sebi");
        for (const duty of profile.duties)
          if (duty.key === "cscrf-patch") duty.state = "in_contract";
        book.profiles.push(profile);
        book.save();
      }
      return { profile: detailOf(profile, core.day()) };
    });
  }
}
