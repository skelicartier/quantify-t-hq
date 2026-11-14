import "server-only";

import { logTouchAction } from "@/app/(portal)/data/touches/actions";
import { readTouches } from "@/lib/data/api/touches";
import { dataRead } from "@/lib/data/read";

import { TouchesSectionView } from "./touches-section-view";
import "./touches.css";

/**
 * The Touches section on a lead's page and an investor firm's page (ws-notes/company/spec.md
 * §3.4, §8.9.4): it reads its own data and draws the subject's touches and "Log a touch".
 * C4's stand-in had this signature; this file replaces it at the merge.
 */
export type TouchSubject = { kind: "lead" | "investor"; id: string; name: string };

export type TouchesSectionProps = {
  subject: TouchSubject;
  /** The request's time (`requestNow()`), for `<Timestamp>`. */
  now: number;
  /** This Mac's day, as the page's own read gave it. */
  today: string;
  /** The page the section's form returns to. */
  path: string;
};

export async function TouchesSection({ subject, now, today, path }: TouchesSectionProps) {
  void now;
  const read = await dataRead(() =>
    readTouches({ subject_kind: subject.kind, subject_id: subject.id }),
  );
  return (
    <TouchesSectionView
      subject={subject}
      today={today}
      path={path}
      read={read}
      action={logTouchAction}
    />
  );
}
