/**
 * The answer to a yes (raise spec §7.2.2): his booking link, stored once, and one answer
 * template with `{first_name}`, `{firm}` and `{booking_link}` in it. After a yes or a
 * meeting request the reply's answer carries the template filled in for that person, for
 * him to copy into his own mail. HQ sends nothing and never opens the link.
 */

import { Refused } from "../../mail-merge/engine";
import type { DataCore } from "../core";
import { clean, cleanText } from "../guard";
import type { Staff } from "../protocol";
import { httpsLinkOf } from "../raise-contracts";

export const SETTINGS = "replies/settings.json";
export const ANSWER_LIMIT = 2_000;
export const DEFAULT_YES_ANSWER =
  "Thank you, {first_name}. I would be glad to show you what we are building and hear how {firm} works today. Choose a time that suits you here: {booking_link}";
export const NO_BOOKING_LINK = "[your booking link]";

const PLACEHOLDERS = ["{first_name}", "{firm}", "{booking_link}"] as const;

export type ReplySettings = {
  booking_link: string;
  yes_answer: string;
  updated_at: string | null;
  updated_by: Staff | null;
};

const DEFAULTS: ReplySettings = {
  booking_link: "",
  yes_answer: DEFAULT_YES_ANSWER,
  updated_at: null,
  updated_by: null,
};

export class ReplySettingsBook {
  readonly #store: DataCore["store"];
  settings: ReplySettings;

  constructor(store: DataCore["store"]) {
    this.#store = store;
    const stored = store.readJson<Partial<ReplySettings> | null>(SETTINGS, null);
    this.settings = {
      booking_link: typeof stored?.booking_link === "string" ? stored.booking_link : "",
      yes_answer:
        typeof stored?.yes_answer === "string" && stored.yes_answer
          ? stored.yes_answer
          : DEFAULT_YES_ANSWER,
      updated_at: typeof stored?.updated_at === "string" ? stored.updated_at : null,
      updated_by: stored?.updated_by ?? null,
    };
  }

  save(input: { booking_link: string; yes_answer: string }, by: Staff, at: string): ReplySettings {
    this.settings = { ...DEFAULTS, ...input, updated_at: at, updated_by: by };
    this.#store.writeJson(SETTINGS, { format: 1, ...this.settings });
    return this.settings;
  }
}

/** The booking link and the answer as the form sends them, checked. */
export function readSettingsInput(body: Record<string, unknown>): {
  booking_link: string;
  yes_answer: string;
} {
  const typed = clean(body.booking_link, 600);
  const link = typed ? httpsLinkOf(typed) : "";
  if (link === null) throw new Refused(400, "invalid", "Paste the whole link, starting https://.");
  const answer = cleanText(body.yes_answer, ANSWER_LIMIT);
  if (!answer) throw new Refused(400, "invalid", "Write your answer.");
  let rest = answer;
  for (const placeholder of PLACEHOLDERS) rest = rest.split(placeholder).join("");
  if (/[{}]/.test(rest))
    throw new Refused(
      400,
      "invalid",
      "Only {first_name}, {firm} and {booking_link} can be filled in.",
    );
  return { booking_link: link, yes_answer: answer };
}

/** The template filled in for one person: their first name, their firm, the link. */
export function fillAnswer(
  template: string,
  link: string,
  who: { first_name: string; name: string; company: string; firm_key: string },
): string {
  const first = who.first_name.trim() || who.name.trim().split(/\s+/)[0] || "there";
  const firm = who.company.trim() || who.firm_key || "your firm";
  return template
    .split("{first_name}")
    .join(first)
    .split("{firm}")
    .join(firm)
    .split("{booking_link}")
    .join(link || NO_BOOKING_LINK);
}
