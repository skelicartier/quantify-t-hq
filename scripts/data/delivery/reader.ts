/**
 * The sender's delivery files, read and never written: `delivery/state.json`, the applied
 * log and one file per mailing, under Mail merge's folder (delivery spec §6.11). The sender
 * rewrites each file whole, so the reader stats before it reads and takes a file again
 * only when its time or size changed, checking at most every two seconds.
 *
 * A file that does not parse keeps its last good reading (or none) and is said once, by
 * no name. Never `provider.key` or `provider-status.json`: this reads `delivery/` alone.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

import {
  DELIVERY_APPLIED_FILE,
  DELIVERY_MAILINGS_DIR,
  DELIVERY_STATE_FILE,
  standingOf,
  type AddressDelivery,
  type AppliedStop,
  type DeliveryRecipient,
  type DeliveryStateFile,
  type MailingDeliveryFile,
} from "../../../src/lib/merge/delivery-contracts";

const CHECK_EVERY_MS = 2_000;

const signatureOf = (path: string): string => {
  try {
    const stat = statSync(path);
    return stat.isFile() ? `${stat.mtimeMs}:${stat.size}` : "";
  } catch {
    return "";
  }
};

function isRecipient(value: unknown): value is DeliveryRecipient {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<DeliveryRecipient>;
  return (
    typeof item.email === "string" &&
    typeof item.message_id === "string" &&
    typeof item.sent_at === "string" &&
    Array.isArray(item.events)
  );
}

/** The file as the contract shapes it, or null when it is not one. */
function mailingFileOf(value: unknown, mailingId: string): MailingDeliveryFile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const file = value as Partial<MailingDeliveryFile>;
  if (file.mailing_id !== mailingId || !Array.isArray(file.recipients)) return null;
  return {
    format: 1,
    mailing_id: mailingId,
    name: typeof file.name === "string" ? file.name : "",
    recipients: file.recipients.filter(isRecipient),
    read_at: typeof file.read_at === "string" ? file.read_at : null,
  };
}

function stateOf(value: unknown): DeliveryStateFile | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const state = value as Partial<DeliveryStateFile>;
  if (typeof state.auto_stop_from !== "string") return null;
  return {
    format: 1,
    auto_stop_from: state.auto_stop_from,
    backlog_applied_at:
      typeof state.backlog_applied_at === "string" ? state.backlog_applied_at : null,
    last_read:
      state.last_read && typeof state.last_read === "object" && !Array.isArray(state.last_read)
        ? state.last_read
        : null,
    last_recent_at: typeof state.last_recent_at === "string" ? state.last_recent_at : null,
    last_older_at: typeof state.last_older_at === "string" ? state.last_older_at : null,
    in_progress: state.in_progress ?? null,
    wait_until: typeof state.wait_until === "string" ? state.wait_until : null,
    requests: Array.isArray(state.requests) ? state.requests : [],
    tags_filter: state.tags_filter !== false,
  };
}

export class DeliveryFiles {
  readonly #dir: string;
  readonly #log: (line: string) => void;
  readonly #clock: () => number;
  #checkedAt = Number.NEGATIVE_INFINITY;
  #state: DeliveryStateFile | null = null;
  #stateSignature = "";
  #applied: AppliedStop[] = [];
  #appliedSignature = "";
  readonly #files = new Map<string, { signature: string; file: MailingDeliveryFile | null }>();
  #byEmail: Map<string, AddressDelivery[]> | null = null;

  /** `dir` is Mail merge's folder. `clock` is for tests: milliseconds, as `Date.now`. */
  constructor(dir: string, log: (line: string) => void, clock: () => number = Date.now) {
    this.#dir = dir;
    this.#log = log;
    this.#clock = clock;
  }

  #unreadable(): void {
    this.#log("delivery: a file could not be read");
  }

  /** Stat everything and take again what changed; at most every two seconds. */
  #refresh(): void {
    const now = this.#clock();
    if (now - this.#checkedAt < CHECK_EVERY_MS) return;
    this.#checkedAt = now;

    const statePath = join(this.#dir, DELIVERY_STATE_FILE);
    const stateSignature = signatureOf(statePath);
    if (stateSignature !== this.#stateSignature) {
      this.#stateSignature = stateSignature;
      if (stateSignature === "") this.#state = null;
      else {
        try {
          const state = stateOf(JSON.parse(readFileSync(statePath, "utf8")));
          if (state) this.#state = state;
          else this.#unreadable();
        } catch {
          this.#unreadable();
        }
      }
    }

    const appliedPath = join(this.#dir, DELIVERY_APPLIED_FILE);
    const appliedSignature = signatureOf(appliedPath);
    if (appliedSignature !== this.#appliedSignature) {
      this.#appliedSignature = appliedSignature;
      const lines: AppliedStop[] = [];
      if (appliedSignature !== "") {
        try {
          for (const text of readFileSync(appliedPath, "utf8").split("\n")) {
            if (!text.trim()) continue;
            try {
              const line = JSON.parse(text) as Partial<AppliedStop> | null;
              if (line && typeof line.email === "string" && typeof line.at === "string")
                lines.push(line as AppliedStop);
            } catch {
              // a last line cut short while the sender was writing it
            }
          }
          this.#applied = lines;
        } catch {
          this.#unreadable();
        }
      } else this.#applied = [];
    }

    let names: string[] = [];
    try {
      names = readdirSync(join(this.#dir, DELIVERY_MAILINGS_DIR)).filter((name) =>
        name.endsWith(".json"),
      );
    } catch {
      names = [];
    }
    const seen = new Set<string>();
    let changed = false;
    for (const name of names) {
      const mailingId = name.slice(0, -".json".length);
      seen.add(mailingId);
      const path = join(this.#dir, DELIVERY_MAILINGS_DIR, name);
      const signature = signatureOf(path);
      const known = this.#files.get(mailingId);
      if (known && known.signature === signature) continue;
      let file: MailingDeliveryFile | null = null;
      try {
        file = mailingFileOf(JSON.parse(readFileSync(path, "utf8")), mailingId);
      } catch {
        file = null;
      }
      if (file === null) {
        // Its last good reading stays (or none); it is taken again when it next changes.
        this.#unreadable();
        this.#files.set(mailingId, { signature, file: known?.file ?? null });
        continue;
      }
      this.#files.set(mailingId, { signature, file });
      changed = true;
    }
    for (const mailingId of [...this.#files.keys()])
      if (!seen.has(mailingId)) {
        this.#files.delete(mailingId);
        changed = true;
      }
    if (changed) this.#byEmail = null;
  }

  state(): DeliveryStateFile | null {
    this.#refresh();
    return this.#state;
  }

  applied(): readonly AppliedStop[] {
    this.#refresh();
    return this.#applied;
  }

  files(): MailingDeliveryFile[] {
    this.#refresh();
    const files: MailingDeliveryFile[] = [];
    for (const entry of this.#files.values()) if (entry.file) files.push(entry.file);
    return files;
  }

  file(mailingId: string): MailingDeliveryFile | null {
    this.#refresh();
    return this.#files.get(mailingId)?.file ?? null;
  }

  /** Each live send to this (normalised) address, newest first. */
  forEmail(email: string): AddressDelivery[] {
    const files = this.files();
    if (this.#byEmail === null) {
      const index = new Map<string, AddressDelivery[]>();
      for (const file of files)
        for (const recipient of file.recipients) {
          const row: AddressDelivery = {
            mailing_id: file.mailing_id,
            mailing: file.name,
            sent_at: recipient.sent_at,
            standing: standingOf(recipient.events),
          };
          const rows = index.get(recipient.email);
          if (rows) rows.push(row);
          else index.set(recipient.email, [row]);
        }
      for (const rows of index.values()) rows.sort((a, b) => b.sent_at.localeCompare(a.sent_at));
      this.#byEmail = index;
    }
    return this.#byEmail.get(email) ?? [];
  }
}
