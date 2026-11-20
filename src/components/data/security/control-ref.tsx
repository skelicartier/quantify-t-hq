import { dayWords } from "@/lib/data/labels-company";
import {
  CONTROL_REFS,
  PRACTICES,
  everyWords,
  spanOf,
  type ControlKey,
  type ControlSource,
  type PracticeKey,
} from "@/lib/data/labels-controls";

import "./control-ref.css";

function Sources({ sources, checked }: { sources: readonly ControlSource[]; checked: string }) {
  return (
    <>
      {sources.map((source, index) => (
        <span key={source.url}>
          {index > 0 && " · "}
          <a
            className="text-link"
            href={source.url}
            target="_blank"
            rel="noopener noreferrer"
            title={source.name}
          >
            Source
          </a>
          <span className="hqdata-control-ref__url"> ({source.url})</span>
        </span>
      ))}
      {sources.length > 0 ? `, checked ${dayWords(checked)}` : ""}
    </>
  );
}

/**
 * The control references beside a clock or a check (ws-notes/security/spec.md §3.4), each
 * with its source and the day it was checked: "ISO/IEC 27001:2022 A.5.18 Access rights.
 * Source, checked 20 Nov 2026". A source is a link reading "Source"; on paper its address
 * follows it. Nothing for no references.
 */
export function ControlRefNote({ refs }: { refs: readonly ControlKey[] }) {
  if (refs.length === 0) return null;
  return (
    <span className="hqdata-control-ref">
      {refs.map((key, index) => {
        const ref = CONTROL_REFS[key];
        return (
          <span key={key}>
            {index > 0 && " · "}
            {ref.ref} {ref.title}. <Sources sources={ref.sources} checked={ref.checked} />
          </span>
        );
      })}
    </span>
  );
}

/**
 * An interval a day is worked out with, read as the practice's `kind` says. One that repeats:
 * "Every 3 months, HQ's default." or, with his own amount, "Every 2 months, yours; HQ's default
 * is every 3 months." A window that runs once from a day: "Within 7 days, HQ's default." or
 * "Within 5 days, yours; HQ's default is within 7 days." How long something lasts, which its
 * source sets: "36 months." or "30 months, yours; the source gives 36 months." Then the
 * practice's note and its sources.
 */
export function PracticeNote({ practice, amount }: { practice: PracticeKey; amount?: number }) {
  const known = PRACTICES[practice];
  const words = (count: number): string =>
    known.kind === "within"
      ? `within ${spanOf(count, known.unit)}`
      : known.kind === "lasts"
        ? spanOf(count, known.unit)
        : everyWords(count, known.unit);
  const theirs = known.kind === "lasts" ? "the source gives" : "HQ's default is";
  const head =
    amount !== undefined && amount !== known.amount
      ? `${capital(words(amount))}, yours; ${theirs} ${words(known.amount)}.`
      : known.kind === "lasts"
        ? `${capital(words(known.amount))}.`
        : `${capital(words(known.amount))}, HQ's default.`;
  return (
    <span className="hqdata-control-ref">
      {head} {known.note} <Sources sources={known.sources} checked={known.checked} />
    </span>
  );
}

function capital(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}
