import "server-only";

import Link from "next/link";

import { DueChip } from "@/components/crm/pills";
import { readDataOverview, type DataOverview, type DueItem } from "@/lib/data/api/overview";
import { dataConfigured } from "@/lib/data/socket";
import { readMergeStatus } from "@/lib/merge/api";
import { formatNumber } from "@/lib/format";

/**
 * What Home shows of Data (spec §2.10): the few figures of the day, the next three things
 * due, and the owed rows that join Home's one queue. Read beside Home's own read, never
 * after it, and never in its way: a Data that does not answer is one sentence.
 */

export type DataMail = {
  sent_today: number;
  daily_cap: number;
  sending: { mailing_id: string; name: string } | null;
};

export type DataHome =
  | { state: "ok"; overview: DataOverview; mail: DataMail | null }
  | { state: "down"; mail: DataMail | null };

/**
 * Data's part of Home, or null where Data is not set up or not for this person (then
 * nothing of it is drawn: absent, not zero). Never throws: a failure is "down".
 */
export async function readDataHome(allowed: boolean, owner = false): Promise<DataHome | null> {
  if (!allowed || !dataConfigured()) return null;
  const [overview, status] = await Promise.allSettled([
    readDataOverview({ owner }),
    readMergeStatus(),
  ]);
  const mail: DataMail | null =
    status.status === "fulfilled"
      ? {
          sent_today: status.value.sent_today,
          daily_cap: status.value.settings.daily_cap,
          sending: status.value.sending,
        }
      : null;
  return overview.status === "fulfilled"
    ? { state: "ok", overview: overview.value, mail }
    : { state: "down", mail };
}

export type DataOwedRow = {
  key: string;
  kind: "Follow-up" | "Waitlist" | "Investor" | "Action" | "Meeting" | "Pilot" | "People";
  href: string;
  title: string;
  sub: string;
  due_on: string;
  /** 1 overdue, 2 due today: Home's scale (lower first). */
  urgency: 1 | 2;
};

const OWED_KINDS: Partial<Record<DueItem["kind"], DataOwedRow["kind"]>> = {
  follow_up: "Follow-up",
  waitlist: "Waitlist",
  investor: "Investor",
  action: "Action",
  meeting: "Meeting",
  pilot: "Pilot",
  person: "People",
};

/**
 * Follow-ups, waitlist next steps, investor next steps, actions from notes, meeting steps,
 * pilots and (for the Owner only) the people ledger's rows due today or earlier, as rows of
 * Home's queue: overdue first, then by day and title. Key dates, agreements, diligence and file
 * reviews stay in Data's own Due list.
 */
export function dataOwedRows(overview: Pick<DataOverview, "due" | "today">): DataOwedRow[] {
  const rows: DataOwedRow[] = [];
  for (const item of overview.due) {
    const kind = OWED_KINDS[item.kind];
    if (!kind || item.due_on > overview.today) continue;
    rows.push({
      key: `data:${item.key}`,
      kind,
      href: item.href,
      title: item.title,
      sub: item.sub,
      due_on: item.due_on,
      urgency: item.due_on < overview.today ? 1 : 2,
    });
  }
  return rows.sort(
    (a, b) =>
      a.urgency - b.urgency || a.due_on.localeCompare(b.due_on) || a.title.localeCompare(b.title),
  );
}

/**
 * The Mail block's line from Mail merge's own figures: what counts against its daily limit,
 * which includes the test sends. When Data's live count (tests left out) is known and
 * differs, the line says so, so the two figures on Home never look like a mistake.
 */
export function mailLine(mail: DataMail, live?: number): string {
  const tests = live !== undefined && live !== mail.sent_today ? ", tests included" : "";
  const sent = `${formatNumber(mail.sent_today)} of ${formatNumber(mail.daily_cap)} sent today${tests}.`;
  return mail.sending ? `${sent} Sending “${mail.sending.name}”.` : `${sent} Nothing is sending.`;
}

/** The side block "Data": the day's figures, the next three Due rows, and the way in. */
export function DataHomeBlock({ data }: { data: DataHome | null }) {
  if (!data) return null;
  if (data.state === "down")
    return (
      <section className="briefing__block hqdata-home" aria-labelledby="data-home-title">
        <div className="briefing__head">
          <h2 id="data-home-title">Data</h2>
        </div>
        <p className="briefing__clear" role="status">
          Data is not answering.
        </p>
      </section>
    );
  const { overview } = data;
  const figures = [
    `Sent today ${formatNumber(overview.sent_today)}`,
    ...(overview.replies ? [`Replies today ${formatNumber(overview.replies.today)}`] : []),
    ...(overview.follow_ups ? [`Follow-ups due ${formatNumber(overview.follow_ups.due)}`] : []),
  ];
  const next = overview.due.slice(0, 3);
  return (
    <section className="briefing__block hqdata-home" aria-labelledby="data-home-title">
      <div className="briefing__head">
        <h2 id="data-home-title">Data</h2>
        <Link className="briefing__more" href="/data">
          Open Data
        </Link>
      </div>
      <p className="briefing__clear">{figures.join(" · ")}</p>
      {next.length === 0 ? (
        <p className="briefing__clear">Nothing is due.</p>
      ) : (
        <ol className="agenda agenda--labelled">
          {next.map((item) => (
            <li key={item.key} className="agenda__row">
              <span className="agenda__time">
                <DueChip due={item.due_on} today={overview.today} />
              </span>
              <span className="agenda__title">
                <Link href={item.href}>{item.title}</Link>
                {item.sub && <span className="quiet"> · {item.sub}</span>}
              </span>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
