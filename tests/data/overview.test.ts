// @vitest-environment node
import { describe, expect, it } from "vitest";

import { overviewOf } from "../../scripts/data/overview";
import type { Written } from "../../scripts/data/sender-files";

const line = (email: string, at: string, mailing = "m1"): Written => ({
  email,
  mailing_id: mailing,
  mailing: "Walk 01",
  at,
});

// vitest runs in Asia/Kolkata: a local day runs from 18:30Z the evening before to 18:29:59Z.
describe("the overview's counts, worked by hand", () => {
  it("counts sent today from the written log alone, on this machine's day", () => {
    const today = "2026-11-10";
    const written: Written[] = [
      line("a@fund1.example", "2026-11-10T03:30:00.000Z"), // 09:00 IST today
      line("b@fund2.example", "2026-11-09T19:00:00.000Z"), // 00:30 IST today
      line("c@fund3.example", "2026-11-10T18:00:00.000Z"), // 23:30 IST today
      line("d@fund4.example", "2026-11-09T05:00:00.000Z"), // yesterday
      line("e@fund5.example", "2026-11-09T12:00:00.000Z"), // yesterday
      line("f@fund6.example", "2026-11-02T05:00:00.000Z"), // eight days ago: outside the week
      line("g@fund7.example", "2026-11-10T18:30:00.000Z"), // 00:00 IST tomorrow: not today
      line("h@fund8.example", "2026-11-04T05:00:00.000Z"), // the first day of the week
    ];
    const overview = overviewOf({ today, written, sending: null, due: [], parts: {} });
    expect(overview.sent_today).toBe(3);
    expect(overview.week.map((day) => day.day)).toEqual([
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
      "2026-11-07",
      "2026-11-08",
      "2026-11-09",
      "2026-11-10",
    ]);
    expect(overview.week.map((day) => day.sent)).toEqual([1, 0, 0, 0, 0, 2, 3]);
    expect(overview.week.reduce((sum, day) => sum + day.sent, 0)).toBe(6);
    expect(overview.sending).toBeNull();
    expect(overview.due).toEqual([]);
  });

  it("carries the modules' blocks through and never lets one overwrite a core figure", () => {
    const overview = overviewOf({
      today: "2026-11-10",
      written: [],
      sending: { mailing_id: "m2", name: "Walk 02" },
      due: [
        {
          key: "f1",
          kind: "follow_up",
          title: "Answer Asha's question",
          sub: "Peak Capital",
          due_on: "2026-11-09",
          href: "/data/replies",
        },
      ],
      parts: {
        replies: { today: 1, yes_today: 1, yes_total: 4, latest: [] },
        sent_today: 999,
        week: "nonsense",
      },
    });
    expect(overview.sent_today).toBe(0);
    expect(overview.week).toHaveLength(7);
    expect(overview.replies).toEqual({ today: 1, yes_today: 1, yes_total: 4, latest: [] });
    expect(overview.sending).toEqual({ mailing_id: "m2", name: "Walk 02" });
    expect(overview.due).toHaveLength(1);
    expect("recent_files" in overview).toBe(false);
  });
});
