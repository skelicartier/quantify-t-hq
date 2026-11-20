/**
 * What the walk and the tests pin and seed (ws-notes/security/spec.md §2 rule 7, §6.9): the
 * fixed id the harness opens the walk's tool by, and the invented tools a test may ask the
 * seed route for. Every name is invented; every address is on `.example`.
 */

/** The walk's "Walk Mail", pinned so the harness can open `/data/systems/tools/walk-mail`. */
export const WALK_TOOL_ID = "walk-mail";

/** The walk's leaver, a person of its own in the people ledger (added through its routes). */
export const WALK_LEAVER = {
  name: "Walk Intern One",
  email: "walk.intern@walk.example",
} as const;

/** Invented tools the seed route adds when asked (`{ tools: true }`), once each, by name. */
export const WALK_TOOLS: readonly Record<string, unknown>[] = [
  {
    name: "Walk Code",
    what: "The code host",
    category: "code",
    business_owner: "Walk Owner",
    billing: "monthly",
    sign_in: "sso",
    mfa: "enforced",
    critical: true,
    holds: ["source_code"],
  },
  {
    name: "Walk Cloud",
    what: "The cloud account the product runs in",
    category: "cloud",
    business_owner: "Walk Owner",
    billing: "monthly",
    sign_in: "mixed",
    mfa: "enforced",
    critical: true,
    holds: ["customer", "personal"],
    subprocessor: { purpose: "Hosting", locations: "India" },
  },
  {
    name: "Walk Design",
    what: "Design files",
    category: "design",
    business_owner: "Walk Owner",
    billing: "free",
    sign_in: "password",
    mfa: "optional",
    critical: false,
    holds: [],
  },
];
