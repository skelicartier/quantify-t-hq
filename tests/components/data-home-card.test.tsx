import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";

import { DataHomeBlock, dataOwedRows, mailLine, readDataHome } from "@/components/data/home-block";
import type { DataOverview } from "@/lib/data/api/overview";

/**
 * Data on Home (spec §2.10): absent where Data is not set up or not for this person; one
 * sentence when the service does not answer; and the owed rows Home's queue takes, overdue
 * before today. Every figure and name is invented.
 */

const TODAY = "2026-11-10";
const previous = process.env.HQ_MAIL_MERGE_SOCKET;
afterEach(() => {
  if (previous === undefined) delete process.env.HQ_MAIL_MERGE_SOCKET;
  else process.env.HQ_MAIL_MERGE_SOCKET = previous;
});

function overview(due: DataOverview["due"]): DataOverview {
  return {
    ok: true,
    today: TODAY,
    sent_today: 290,
    week: [],
    sending: null,
    due,
    replies: { today: 2, yes_today: 1, yes_total: 4, latest: [] },
    follow_ups: { due: 3, overdue: 1 },
  };
}

const item = (
  key: string,
  kind: DataOverview["due"][number]["kind"],
  dueOn: string,
  title: string,
): DataOverview["due"][number] => ({
  key,
  kind,
  title,
  sub: "Walk Fund 8",
  due_on: dueOn,
  href: `/data/waitlist/${key}`,
});

describe("Data's block on Home", () => {
  it("is absent when Data is not set up here, or not for this person", async () => {
    delete process.env.HQ_MAIL_MERGE_SOCKET;
    expect(await readDataHome(true)).toBeNull();
    process.env.HQ_MAIL_MERGE_SOCKET = "/nonexistent/hq-test/s.sock";
    expect(await readDataHome(false)).toBeNull();
    const { container } = render(<DataHomeBlock data={null} />);
    expect(container.innerHTML).toBe("");
  });

  it("says “Data is not answering.” and nothing else when the service is down", async () => {
    process.env.HQ_MAIL_MERGE_SOCKET = "/nonexistent/hq-test/s.sock";
    const data = await readDataHome(true);
    expect(data).toEqual({ state: "down", mail: null });
    render(<DataHomeBlock data={data} />);
    expect(screen.getByRole("status").textContent).toBe("Data is not answering.");
    expect(screen.queryByRole("link")).toBeNull();
    expect(screen.queryByRole("listitem")).toBeNull();
  });

  it("shows the day's figures, the next three Due rows and the way in", () => {
    const due = [
      item("a", "follow_up", "2026-11-08", "Send the deck to Asha15 Rao15"),
      item("b", "waitlist", "2026-11-09", "Reply and offer call times"),
      item("c", "key_date", TODAY, "GSTR-1"),
      item("d", "investor", TODAY, "Book a meeting"),
    ];
    render(<DataHomeBlock data={{ state: "ok", overview: overview(due), mail: null }} />);
    expect(screen.getByText("Sent today 290 · Replies today 2 · Follow-ups due 3")).toBeTruthy();
    expect(screen.getAllByRole("listitem")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Open Data" }).getAttribute("href")).toBe("/data");
    expect(
      screen.getByRole("link", { name: "Reply and offer call times" }).getAttribute("href"),
    ).toBe("/data/waitlist/b");
  });

  it("gives Home's queue the owed rows, sorted by urgency: overdue first, then today", () => {
    const rows = dataOwedRows(
      overview([
        item("today-follow", "follow_up", TODAY, "Answer Asha4 Rao4's question"),
        item("investor", "investor", TODAY, "Book a meeting"),
        item("late-wait", "waitlist", "2026-11-09", "Reply and offer call times"),
        item("key", "key_date", "2026-11-01", "GSTR-1"),
        item("late-follow", "follow_up", "2026-11-03", "Send the deck to Asha15 Rao15"),
        item("future", "waitlist", "2026-11-20", "Check in at week two"),
        item("file", "file_review", TODAY, "Review the deck"),
      ]),
    );
    expect(rows.map((row) => [row.kind, row.urgency, row.title])).toEqual([
      ["Follow-up", 1, "Send the deck to Asha15 Rao15"],
      ["Waitlist", 1, "Reply and offer call times"],
      ["Follow-up", 2, "Answer Asha4 Rao4's question"],
      ["Investor", 2, "Book a meeting"],
    ]);
    expect(rows[0]).toMatchObject({ key: "data:late-follow", href: "/data/waitlist/late-follow" });
  });

  it("gives an action from a note as an owed row “Action”: overdue 1, due today 2", () => {
    const action = (key: string, dueOn: string, title: string): DataOverview["due"][number] => ({
      key: `action:${key}`,
      kind: "action",
      title,
      sub: "Walk Fund 281 · from “Walk first call”",
      due_on: dueOn,
      href: "/data/notes/walk-note",
    });
    const rows = dataOwedRows(
      overview([
        action("today", TODAY, "Send the pilot summary"),
        action("late", "2026-11-09", "Introduce the CTO"),
        action("later", "2026-11-20", "Share the deck"),
      ]),
    );
    expect(rows.map((row) => [row.kind, row.urgency, row.title])).toEqual([
      ["Action", 1, "Introduce the CTO"],
      ["Action", 2, "Send the pilot summary"],
    ]);
    expect(rows[1]).toMatchObject({
      key: "data:action:today",
      href: "/data/notes/walk-note",
      sub: "Walk Fund 281 · from “Walk first call”",
    });
  });

  it("words the Mail block from Mail merge's own figures", () => {
    expect(mailLine({ sent_today: 290, daily_cap: 5_000, sending: null })).toBe(
      "290 of 5,000 sent today. Nothing is sending.",
    );
    expect(
      mailLine({
        sent_today: 12,
        daily_cap: 300,
        sending: { mailing_id: "m", name: "Waitlist 03" },
      }),
    ).toBe("12 of 300 sent today. Sending “Waitlist 03”.");
    // Mail merge counts its test sends against the limit; Data's own count leaves them out.
    expect(mailLine({ sent_today: 291, daily_cap: 5_000, sending: null }, 290)).toBe(
      "291 of 5,000 sent today, tests included. Nothing is sending.",
    );
  });
});
