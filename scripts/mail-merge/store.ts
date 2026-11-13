/**
 * What the sender keeps, as files in one folder the person's account alone can read.
 *
 * A whole file is replaced by writing beside it and renaming, so a crash leaves the old
 * file or the new one and never half of either. What happened to each person in a send is
 * a line added to a log, written before the next message goes: a restart reads the log
 * and knows exactly who has been written to.
 */

import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";

export class Store {
  readonly dir: string;

  constructor(dir: string) {
    this.dir = dir;
    for (const folder of [dir, join(dir, "lists"), join(dir, "mailings")]) {
      mkdirSync(folder, { recursive: true, mode: 0o700 });
      chmodSync(folder, 0o700);
    }
  }

  path(...parts: string[]): string {
    return join(this.dir, ...parts);
  }

  readJson<T>(name: string, fallback: T): T {
    const file = this.path(name);
    if (!existsSync(file)) return fallback;
    try {
      return JSON.parse(readFileSync(file, "utf8")) as T;
    } catch {
      // Unreadable is not "empty": keep the bytes for a person to look at.
      renameSync(file, `${file}.unreadable-${Date.now()}`);
      return fallback;
    }
  }

  writeJson(name: string, value: unknown): void {
    const file = this.path(name);
    const beside = `${file}.writing`;
    writeFileSync(beside, JSON.stringify(value), { mode: 0o600 });
    renameSync(beside, file);
  }

  readText(name: string): string {
    const file = this.path(name);
    return existsSync(file) ? readFileSync(file, "utf8") : "";
  }

  writeSecret(name: string, text: string): void {
    const file = this.path(name);
    const beside = `${file}.writing`;
    writeFileSync(beside, text, { mode: 0o600 });
    chmodSync(beside, 0o600);
    renameSync(beside, file);
  }

  remove(name: string): void {
    rmSync(this.path(name), { force: true });
  }

  appendLine(name: string, value: unknown): void {
    appendFileSync(this.path(name), `${JSON.stringify(value)}\n`, { mode: 0o600 });
  }

  /** Every whole line of a log; a last line cut short by a crash is dropped. */
  readLines<T>(name: string): T[] {
    const out: T[] = [];
    for (const line of this.readText(name).split("\n")) {
      if (!line.trim()) continue;
      try {
        out.push(JSON.parse(line) as T);
      } catch {
        // A torn final line: that send's outcome is unknown, which the engine records.
      }
    }
    return out;
  }

  /** File names in a folder with this ending, without the ending. */
  list(folder: string, ending: string): string[] {
    const dir = this.path(folder);
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((name) => name.endsWith(ending))
      .map((name) => name.slice(0, -ending.length));
  }
}
