/**
 * What the walk and the tests use for Devices (ws-notes/security/spec.md §7.7): invented, like
 * everything else in them. The laptop is held by the walk's intern, "Walk Intern One" in the
 * people ledger; its holder is typed as "Research intern", so the typed label an Admin reads
 * is never the ledger's name (spec §3.5: the Admin's pages and `dueList({ owner: false })`
 * hold no name from the ledger). The personal devices policy is a document made here, put in
 * Files by the seed, and offered through the stand-in `policies` while Assurance is absent.
 */

/** The id the walk's first device takes (the seed pins it), so the harness can open its page. */
export const WALK_DEVICE_ID = "walk-device";

export const WALK_DEVICE = {
  holder: "Research intern",
  model: "Walk Laptop 14",
  serial: "WALK-SERIAL-0001",
  kind: "laptop",
  ownership: "personal",
  platform: "mac",
} as const;

/** The walk's personal devices policy, as a small text document in Files. */
export const WALK_POLICY = {
  folder: ["Security", "Policies"],
  title: "Walk personal devices policy",
  name: "walk-personal-devices-policy.txt",
  text: "Walk personal devices policy, version 1.\nDisk encryption on, a screen lock of 15 minutes or less, automatic updates, a password manager.\n",
} as const;
