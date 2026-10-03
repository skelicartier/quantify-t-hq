/**
 * The channels a lead can come from, named as the service names them
 * (`account_api/hq/attribution.py` — `tests/lib/attribution.test.ts` holds the two
 * together). A lead is read twice: what the person said, and what their visit showed.
 */
export const CHANNEL_LABELS: Readonly<Record<string, string>> = {
  search: "Search",
  paid: "Paid advertising",
  ai_assistant: "An AI assistant",
  linkedin: "LinkedIn",
  x: "X",
  youtube: "YouTube",
  reddit: "Reddit",
  podcast: "A podcast",
  newsletter: "A newsletter or email",
  event: "An event or webinar",
  referral: "Someone who knows us",
  community: "A community",
  press: "An article or the press",
  direct: "Came straight to the site",
  other: "Something else",
};

/** The matrix's row for leads that left the question empty. */
export const NOT_SAID = "not_said";

export function channelLabel(
  key: string,
  names: Readonly<Record<string, string>> = CHANNEL_LABELS,
): string {
  if (key === NOT_SAID || !key) return "Did not say";
  return names[key] ?? CHANNEL_LABELS[key] ?? key;
}

/** The visit's tags as one line ("google · cpc · brand"), or "" when it carried none. */
export function visitTags(lead: {
  utm_source: string;
  utm_medium: string;
  utm_campaign: string;
}): string {
  return [lead.utm_source, lead.utm_medium, lead.utm_campaign].filter(Boolean).join(" · ");
}

/** The page that sent the visit, as its host alone; "" when there was none or it is unreadable. */
export function referrerHost(referrer: string): string {
  if (!referrer) return "";
  try {
    return new URL(referrer).hostname.replace(/^www\./, "");
  } catch {
    return "";
  }
}
