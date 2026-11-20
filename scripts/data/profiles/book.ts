/**
 * Where regulatory profiles live (`profiles/profiles.json`, `profiles/events.jsonl`) and what
 * is worked out from them (ws-notes/security/spec.md §5.5, §9.5): which duties are in force
 * (an effect, marked in the contract, not withdrawn, on a profile whose `applies_from` is on or
 * before today), the rules in words, and what an in-contract duty changes in HQ. The working
 * out is pure.
 */

import { randomUUID } from "node:crypto";

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import type { Staff } from "../protocol";
import {
  FLOWDOWNS,
  isFlowdownKey,
  type Flowdown,
  type FlowdownInContract,
  type FlowdownInForce,
  type ProfileLine,
  type Regime,
} from "../security-contracts";
import {
  EFFECT_WORDS,
  REGIME_WORDS,
  SEBI_CATEGORY_WORDS,
} from "../../../src/lib/data/labels-questionnaires";
import type { Duty, Profile, ProfileEvent } from "./types";

const FILE = "profiles/profiles.json";
const EVENTS = "profiles/events.jsonl";

export class ProfilesBook {
  readonly #core: DataCore;
  profiles: Profile[];

  constructor(core: DataCore) {
    this.#core = core;
    core.store.ensureDir("profiles");
    const stored = core.store.readJson<{ profiles?: Profile[] }>(FILE, {});
    this.profiles = Array.isArray(stored.profiles)
      ? stored.profiles.filter((item) => typeof item?.profile_id === "string")
      : [];
  }

  save(): void {
    this.#core.store.writeJson(FILE, { format: 1, profiles: this.profiles });
  }

  log(profileId: string, verb: string, detail: string, by: Staff): void {
    const event: ProfileEvent = {
      event_id: randomUUID(),
      profile_id: profileId,
      verb,
      detail,
      by,
      at: this.#core.now(),
    };
    this.#core.store.appendLine(EVENTS, event);
  }

  events(profileId: string): ProfileEvent[] {
    return this.#core.store
      .readLines<ProfileEvent>(EVENTS)
      .filter((event) => event?.profile_id === profileId)
      .reverse();
  }

  forEntry(entryId: string): Profile | null {
    return this.profiles.find((item) => item.entry_id === entryId) ?? null;
  }

  must(profileId: string | undefined): Profile {
    const found = this.profiles.find((item) => item.profile_id === profileId);
    if (!found) throw new Refused(404, "not_found", "That profile is not here.");
    return found;
  }
}

// ------------------------------------------------------------------ worked out, pure

/** The regimes ticked, in their order. */
export function regimesOf(profile: Profile): Regime[] {
  const found: Regime[] = [];
  if (profile.regimes.sebi) found.push("sebi");
  if (profile.regimes.dora) found.push("dora");
  if (profile.regimes.uk) found.push("uk");
  if (profile.regimes.other) found.push("other");
  return found;
}

/** "SEBI CSCRF (mid-size) · EU DORA"; "No rules recorded" when none. */
export function rulesWords(profile: Profile): string {
  const parts = regimesOf(profile).map((regime) => {
    if (regime === "sebi") {
      const category = profile.regimes.sebi?.category ?? "";
      return category
        ? `${REGIME_WORDS.sebi} (${SEBI_CATEGORY_WORDS[category]})`
        : REGIME_WORDS.sebi;
    }
    if (regime === "other") return profile.regimes.other;
    return REGIME_WORDS[regime];
  });
  return parts.length > 0 ? parts.join(" · ") : "No rules recorded";
}

export const flowdownFor = (duty: Duty): Flowdown | null =>
  duty.key && isFlowdownKey(duty.key)
    ? (FLOWDOWNS.find((item) => item.key === duty.key) ?? null)
    : null;

/** A duty's words: the flowdown's, or his own. */
export const dutyWords = (duty: Duty): string => flowdownFor(duty)?.words ?? duty.words;

export const live = (profile: Profile): Duty[] => profile.duties.filter((duty) => !duty.withdrawn);

/** In force on `today`: `applies_from` on or before it. */
export const appliesBy = (profile: Profile, today: string): boolean =>
  profile.applies_from !== null && profile.applies_from <= today;

/** Duties with an effect, in a contract, on profiles applying by today (§5.5). */
export function inForceOf(profiles: readonly Profile[], today: string): FlowdownInForce[] {
  const found: FlowdownInForce[] = [];
  for (const profile of profiles) {
    if (!appliesBy(profile, today)) continue;
    for (const duty of live(profile)) {
      if (duty.state !== "in_contract") continue;
      const flowdown = flowdownFor(duty);
      if (!flowdown?.effect) continue;
      found.push({
        entry_id: profile.entry_id,
        firm: profile.firm,
        key: flowdown.key,
        effect: flowdown.effect,
      });
    }
  }
  return found;
}

/** Every flowdown duty in a contract on profiles applying by today, with or without an effect. */
export function contractDutiesOf(
  profiles: readonly Profile[],
  today: string,
): FlowdownInContract[] {
  const found: FlowdownInContract[] = [];
  for (const profile of profiles) {
    if (!appliesBy(profile, today)) continue;
    for (const duty of live(profile)) {
      if (duty.state !== "in_contract") continue;
      const flowdown = flowdownFor(duty);
      if (!flowdown) continue;
      found.push({ entry_id: profile.entry_id, firm: profile.firm, key: flowdown.key });
    }
  }
  return found;
}

/** What the in-contract duties with an effect change in HQ, as sentences. */
export function effectsOf(profile: Profile): string[] {
  const keys = live(profile)
    .filter((duty) => duty.state === "in_contract" && flowdownFor(duty)?.effect)
    .map((duty) => duty.key!);
  return FLOWDOWNS.filter((item) => keys.includes(item.key)).map(
    (item) => EFFECT_WORDS[item.key] ?? item.words,
  );
}

export function lineOf(profile: Profile): ProfileLine {
  const duties = live(profile);
  return {
    entry_id: profile.entry_id,
    firm: profile.firm,
    regimes: regimesOf(profile),
    in_contract: duties.filter((duty) => duty.state === "in_contract").length,
    unchecked: duties.filter((duty) => duty.state === "").length,
    href: `/data/waitlist/${profile.entry_id}/profile`,
  };
}
