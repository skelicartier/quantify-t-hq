// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  COMPLAINTS_HINT,
  NO_COUNTS,
  STOP_REASON_OF,
  WALK_MIX_SPECIALS,
  addCounts,
  appliedKeyOf,
  countsOf,
  countsSince,
  deliveryKindOf,
  deliveryMailingFile,
  isRetry,
  isStopKind,
  isoOf,
  mailingDeliveryOf,
  mailingTagOf,
  messageIdKey,
  ofWords,
  perCentWords,
  redactReason,
  standingOf,
  stopDetailOf,
  waitingStopsOf,
  walkDeliveryEventsOf,
  walkMixOf,
  warningsOf,
  type AppliedStop,
  type DeliveryCounts,
  type DeliveryEvent,
  type DeliveryKind,
  type MailingDeliveryFile,
  type RecipientStanding,
} from "@/lib/merge/delivery-contracts";

/**
 * The seam of the delivery batch, held to the spec's own hand checks (§3.1, §5.1 to §5.6):
 * what an event means, one recipient's standing, the counts, the words, the two warnings
 * word for word, what waits for the press, and the stand-in mix counted by hand.
 */

const T = (time: string): string => `2026-11-06T${time}.000Z`;
const ev = (kind: DeliveryKind, time: string, reason = ""): DeliveryEvent => ({
  kind,
  at: T(time),
  reason,
});

function many(count: number, events: DeliveryEvent[]): RecipientStanding[] {
  return Array.from({ length: count }, () => standingOf(events));
}

describe("what an event means (§3.1's hand checks)", () => {
  it("reads the provider's event names, and nothing it does not keep", () => {
    expect(deliveryKindOf("hardBounces")).toBe("hard_bounce");
    expect(deliveryKindOf("softBounces")).toBe("soft_bounce");
    expect(deliveryKindOf("bounces")).toBe("soft_bounce");
    expect(deliveryKindOf("spam")).toBe("complaint");
    expect(deliveryKindOf("delivered")).toBe("delivered");
    expect(deliveryKindOf("Deferred")).toBe("deferred");
    expect(deliveryKindOf("invalid_email")).toBe("invalid");
    expect(deliveryKindOf("unsubscribed")).toBe("unsubscribed");
    for (const dropped of ["opened", "clicks", "loadedByProxy", "requests", "constructor", 42])
      expect(deliveryKindOf(dropped), String(dropped)).toBeNull();
  });

  it("makes a message id, a reason and an instant the same on both sides", () => {
    expect(messageIdKey(" <202611061015.ABC@smtp-relay.example> ")).toBe(
      "202611061015.abc@smtp-relay.example",
    );
    expect(messageIdKey(undefined)).toBe("");
    expect(redactReason("550 5.1.1 <partner36@fund36.example>: user unknown")).toBe(
      "550 5.1.1 <[address]>: user unknown",
    );
    expect(redactReason(`x${"y".repeat(400)}`)).toHaveLength(200);
    expect(redactReason(null)).toBe("");
    expect(isoOf("2026-11-06T15:45:30+05:30")).toBe("2026-11-06T10:15:30.000Z");
    expect(isoOf("yesterday")).toBeNull();
    expect(isoOf("")).toBeNull();
    expect(isoOf(12)).toBeNull();
  });

  it("writes rates in words, never with a sign", () => {
    expect(perCentWords(8, 293)).toBe("2.7 per cent");
    expect(perCentWords(1, 290)).toBe("0.34 per cent");
    expect(perCentWords(1, 268)).toBe("0.37 per cent");
    expect(perCentWords(8, 290)).toBe("2.8 per cent");
    expect(perCentWords(7, 256)).toBe("2.7 per cent");
    expect(perCentWords(1, 237)).toBe("0.42 per cent");
    expect(perCentWords(1, 1000)).toBe("0.10 per cent");
    expect(perCentWords(3, 1000)).toBe("0.30 per cent");
    expect(perCentWords(1, 100)).toBe("1.0 per cent");
    expect(perCentWords(5, 0)).toBe("");
    expect(ofWords(274, 293)).toBe("274 of 293");
    expect(ofWords(1234, 5000)).toBe("1,234 of 5,000");
  });

  it("names the files, the tags and the stopping kinds", () => {
    expect(deliveryMailingFile("abc")).toBe("delivery/mailings/abc.json");
    expect(mailingTagOf("0123456789abcdef")).toBe("01234567");
    expect(STOP_REASON_OF).toEqual({
      hard_bounce: "bounced",
      invalid: "bounced",
      complaint: "asked",
      unsubscribed: "asked",
    });
    expect(
      (
        [
          "delivered",
          "deferred",
          "soft_bounce",
          "hard_bounce",
          "blocked",
          "invalid",
          "error",
          "complaint",
          "unsubscribed",
        ] as DeliveryKind[]
      ).filter(isStopKind),
    ).toEqual(["hard_bounce", "invalid", "complaint", "unsubscribed"]);
    expect(stopDetailOf("hard_bounce", "Waitlist 08")).toBe("Hard bounce · Waitlist 08");
    expect(stopDetailOf("complaint", "Investors 1")).toBe("Marked as spam · Investors 1");
    expect(stopDetailOf("invalid", "x".repeat(200))).toHaveLength(120);
    expect(appliedKeyOf({ email: "a@b.example", kind: "invalid", at: T("10:00:00") })).toBe(
      `a@b.example|invalid|${T("10:00:00")}`,
    );
  });
});

describe("one recipient: the furthest event wins (§5.1, row by row)", () => {
  const rows: [
    what: string,
    events: DeliveryEvent[],
    delivery: string,
    reaction: string | null,
    shown: string,
    at?: string | null,
  ][] = [
    ["none", [], "not_yet", null, "not_yet", null],
    [
      "deferred then delivered",
      [ev("deferred", "10:00:02"), ev("delivered", "10:00:05")],
      "delivered",
      null,
      "delivered",
      T("10:00:05"),
    ],
    [
      "deferred, soft bounce",
      [ev("deferred", "10:00:02"), ev("soft_bounce", "10:00:03", "452 4.2.2 The mailbox is full")],
      "soft_bounce",
      null,
      "soft_bounce",
    ],
    [
      "soft bounce then delivered",
      [ev("soft_bounce", "10:00:00", "452"), ev("delivered", "11:00:00")],
      "delivered",
      null,
      "delivered",
    ],
    [
      "delivered then hard bounce",
      [ev("delivered", "10:00:00"), ev("hard_bounce", "10:05:00", "550")],
      "hard_bounce",
      null,
      "hard_bounce",
    ],
    [
      "delivered, spam",
      [ev("delivered", "10:00:01"), ev("complaint", "10:00:05")],
      "delivered",
      "complaint",
      "complaint",
    ],
    [
      "spam only",
      [ev("complaint", "10:00:05")],
      "delivered",
      "complaint",
      "complaint",
      T("10:00:05"),
    ],
    [
      "deferred, unsubscribed",
      [ev("deferred", "10:00:02"), ev("unsubscribed", "10:00:06")],
      "delivered",
      "unsubscribed",
      "unsubscribed",
      T("10:00:06"),
    ],
    [
      "delivered, unsubscribed, spam",
      [ev("delivered", "10:00:01"), ev("unsubscribed", "10:00:06"), ev("complaint", "10:00:09")],
      "delivered",
      "complaint",
      "complaint",
    ],
    [
      "error, delivered",
      [ev("error", "10:00:01", "x"), ev("delivered", "10:00:04")],
      "delivered",
      null,
      "delivered",
    ],
    [
      "blocked, spam",
      [ev("blocked", "10:00:01", "x"), ev("complaint", "10:00:05")],
      "blocked",
      "complaint",
      "complaint",
    ],
    [
      "delivered twice",
      [ev("delivered", "10:00:00"), ev("delivered", "10:05:00")],
      "delivered",
      null,
      "delivered",
      T("10:05:00"),
    ],
  ];
  for (const [what, events, delivery, reaction, shown, at] of rows)
    it(what, () => {
      const standing = standingOf(events);
      expect(standing.delivery).toBe(delivery);
      expect(standing.reaction).toBe(reaction);
      expect(standing.shown).toBe(shown);
      if (at !== undefined) expect(standing.delivery_at).toBe(at);
    });

  it("keeps the reason only when the step is a failure, and the earliest reaction's time", () => {
    expect(standingOf(rows[2]![1]).reason).toBe("452 4.2.2 The mailbox is full");
    expect(standingOf(rows[3]![1]).reason).toBe("");
    expect(standingOf(rows[9]![1]).reason).toBe("");
    const twice = standingOf([ev("complaint", "10:09:00"), ev("complaint", "10:03:00")]);
    expect(twice.reaction_at).toBe(T("10:03:00"));
    expect(isRetry("soft_bounce") && isRetry("blocked") && isRetry("error")).toBe(true);
    expect(
      isRetry("deferred") || isRetry("hard_bounce") || isRetry("invalid") || isRetry("delivered"),
    ).toBe(false);
  });
});

describe("one mailing: counts that add up (§5.2)", () => {
  // The investor send of 6 Nov 2026 as the read-back would show it.
  const sixth: RecipientStanding[] = [
    ...many(274, [ev("delivered", "10:00:01")]),
    ...many(8, [ev("hard_bounce", "10:00:03", "550")]),
    ...many(10, [ev("deferred", "10:00:02"), ev("soft_bounce", "10:00:03", "452")]),
    ...many(1, [ev("error", "10:00:01", "no sends left")]),
  ];

  it("counts the 6 Nov send: 293 accepted, 274 delivered, 19 that did not arrive, 11 to retry", () => {
    const counts = countsOf(sixth);
    expect(counts).toEqual({
      accepted: 293,
      delivered: 274,
      not_yet: 0,
      soft_bounce: 10,
      hard_bounce: 8,
      blocked: 0,
      invalid: 0,
      error: 1,
      didnt_arrive: 19,
      complaint: 0,
      unsubscribed: 0,
      retry: 11,
    } satisfies DeliveryCounts);
    expect(
      counts.delivered +
        counts.not_yet +
        counts.soft_bounce +
        counts.hard_bounce +
        counts.blocked +
        counts.invalid +
        counts.error,
    ).toBe(counts.accepted);
    expect(countsOf([])).toEqual(NO_COUNTS);
    expect(addCounts(counts, counts).accepted).toBe(586);
    expect(addCounts(counts, NO_COUNTS)).toEqual(counts);
  });

  it("warns about its hard bounces, word for word, and pauses nothing", () => {
    expect(warningsOf(countsOf(sixth), "mailing")).toEqual([
      {
        key: "hard_bounces",
        level: "attention",
        title: "More addresses bounced hard than is healthy",
        body:
          "8 of 293 accepted bounced hard in this mailing: 2.7 per cent. Under 2 per cent is healthy " +
          "and over 5 per cent is poor: a high rate tells mailbox providers a list is old or bought. " +
          "Nothing has been paused: you decide.",
      },
    ]);
  });

  it("warns about one complaint in a day's batch of 290, word for word", () => {
    const batch = [
      ...many(289, [ev("delivered", "10:00:01")]),
      ...many(1, [ev("delivered", "10:00:01"), ev("complaint", "10:00:05")]),
    ];
    const counts = countsOf(batch);
    expect(counts).toMatchObject({ accepted: 290, delivered: 290, complaint: 1 });
    expect(warningsOf(counts, "mailing")).toEqual([
      {
        key: "complaints",
        level: "danger",
        title: "Spam complaints are at or over Gmail's and Yahoo's limit",
        body:
          "1 spam complaint from 290 delivered in this mailing: 0.34 per cent. Gmail asks senders to " +
          "keep complaints under 0.1 per cent and never to reach 0.3 per cent; Yahoo's limit is also " +
          "0.3 per cent. At about 290 a day, a single complaint is 0.34 per cent. Nothing has been " +
          "paused: you decide.",
      },
    ]);
    expect(warningsOf(counts, "week")[0]!.body).toContain(
      "delivered in the last 7 days: 0.34 per cent",
    );
    expect(COMPLAINTS_HINT).toBe(
      "Gmail does not tell senders who complained, so complaints from Gmail addresses are not in this count.",
    );
  });

  it("holds the boundaries: strictly over, except the complaint limit", () => {
    const hard = (bounced: number, accepted: number) =>
      warningsOf({ ...NO_COUNTS, accepted, hard_bounce: bounced }, "mailing").map(
        (warning) => warning.level,
      );
    expect(hard(2, 100)).toEqual([]);
    expect(hard(3, 100)).toEqual(["attention"]);
    expect(hard(5, 100)).toEqual(["attention"]);
    expect(hard(6, 100)).toEqual(["danger"]);
    expect(hard(0, 100)).toEqual([]);
    const complaints = (complaint: number, delivered: number) =>
      warningsOf({ ...NO_COUNTS, accepted: delivered, delivered, complaint }, "mailing").map(
        (warning) => warning.level,
      );
    expect(complaints(1, 1000)).toEqual([]);
    expect(complaints(1, 999)).toEqual(["attention"]);
    expect(complaints(2, 1000)).toEqual(["attention"]);
    expect(complaints(3, 1000)).toEqual(["danger"]);
    expect(complaints(0, 1000)).toEqual([]);
    expect(complaints(1, 0)).toEqual([]);
  });

  it("names Gmail and Yahoo in the complaint words only, and no sign anywhere", () => {
    const both = warningsOf(
      { ...NO_COUNTS, accepted: 100, delivered: 90, hard_bounce: 10, complaint: 1 },
      "week",
    );
    expect(both.map((warning) => warning.key)).toEqual(["complaints", "hard_bounces"]);
    expect(both[0]!.body).toMatch(/Gmail/);
    expect(both[0]!.body).toMatch(/Yahoo/);
    expect(both[1]!.title + both[1]!.body).not.toMatch(/Gmail|Yahoo/);
    for (const warning of both) {
      expect(warning.title + warning.body).not.toContain("%");
      expect(warning.body).toContain("Nothing has been paused: you decide.");
    }
  });
});

function fileOf(
  mailingId: string,
  name: string,
  recipients: { email: string; sent_at: string; events: DeliveryEvent[] }[],
): MailingDeliveryFile {
  return {
    format: 1,
    mailing_id: mailingId,
    name,
    recipients: recipients.map((recipient) => ({ ...recipient, message_id: "" })),
    read_at: null,
  };
}

describe("the last 7 days (§5.3)", () => {
  it("takes a send at the edge and leaves the one a minute earlier", () => {
    const since = "2026-11-07T12:00:00.000Z";
    const files = [
      fileOf("m1", "One", [
        { email: "out@fund1.example", sent_at: "2026-11-07T11:59:00.000Z", events: [] },
        { email: "in@fund2.example", sent_at: "2026-11-07T12:00:00.000Z", events: [] },
      ]),
      fileOf("m2", "Two", [
        {
          email: "later@fund3.example",
          sent_at: "2026-11-10T09:00:00.000Z",
          events: [{ kind: "delivered", at: "2026-11-10T09:00:01.000Z", reason: "" }],
        },
      ]),
    ];
    expect(countsSince(files, since)).toMatchObject({ accepted: 2, delivered: 1, not_yet: 1 });
    expect(countsSince(files, "2026-11-07T11:59:00.000Z").accepted).toBe(3);
    expect(countsSince([], since)).toEqual(NO_COUNTS);
  });

  it("summarises a file, and has nothing to say of an empty one", () => {
    const file = fileOf("m1", "One", [
      { email: "b@fund2.example", sent_at: "2026-11-07T12:05:00.000Z", events: [] },
      { email: "a@fund1.example", sent_at: "2026-11-07T12:00:00.000Z", events: [] },
    ]);
    expect(mailingDeliveryOf(file)).toMatchObject({
      mailing_id: "m1",
      name: "One",
      first_sent_at: "2026-11-07T12:00:00.000Z",
      last_sent_at: "2026-11-07T12:05:00.000Z",
      read_at: null,
      counts: { accepted: 2, not_yet: 2 },
    });
    expect(mailingDeliveryOf(fileOf("m0", "None", []))).toBeNull();
  });
});

describe("what waits for his press", () => {
  const FROM = "2026-11-14T06:00:00.000Z";
  const before = (time: string) => `2026-11-10T${time}.000Z`;
  const files = [
    fileOf("m1", "Waitlist 07", [
      {
        email: "twice@fund36.example",
        sent_at: before("09:00:00"),
        events: [{ kind: "hard_bounce", at: before("09:00:09"), reason: "550" }],
      },
      {
        email: "soft@fund29.example",
        sent_at: before("09:00:00"),
        events: [{ kind: "soft_bounce", at: before("09:00:03"), reason: "452" }],
      },
      {
        email: "edge@fund72.example",
        sent_at: before("09:00:00"),
        events: [{ kind: "hard_bounce", at: FROM, reason: "550" }],
      },
    ]),
    fileOf("m0", "Waitlist 06", [
      {
        email: "twice@fund36.example",
        sent_at: before("08:00:00"),
        events: [{ kind: "complaint", at: before("08:00:05"), reason: "" }],
      },
      {
        email: "applied@fund41.example",
        sent_at: before("08:00:00"),
        events: [{ kind: "unsubscribed", at: before("08:00:06"), reason: "" }],
      },
    ]),
  ];
  const state = { auto_stop_from: FROM, backlog_applied_at: null };

  it("lists one per address, its earliest, oldest first; never a soft bounce", () => {
    expect(waitingStopsOf(files, [], state)).toEqual([
      {
        email: "twice@fund36.example",
        kind: "complaint",
        at: before("08:00:05"),
        mailing_id: "m0",
        mailing: "Waitlist 06",
      },
      {
        email: "applied@fund41.example",
        kind: "unsubscribed",
        at: before("08:00:06"),
        mailing_id: "m0",
        mailing: "Waitlist 06",
      },
    ]);
  });

  it("does not wait for an event at auto_stop_from exactly: that one acts by itself", () => {
    expect(
      waitingStopsOf(files, [], state).some((item) => item.email === "edge@fund72.example"),
    ).toBe(false);
  });

  it("leaves out an applied key, and is empty once he has pressed", () => {
    const applied: AppliedStop[] = [
      {
        email: "applied@fund41.example",
        kind: "unsubscribed",
        mailing_id: "m0",
        at: before("08:00:06"),
        applied_at: FROM,
        result: "added",
        how: "auto",
      },
    ];
    expect(waitingStopsOf(files, applied, state).map((item) => item.email)).toEqual([
      "twice@fund36.example",
    ]);
    expect(waitingStopsOf(files, [], { ...state, backlog_applied_at: FROM })).toEqual([]);
  });
});

describe("the stand-in's mix (§5.6)", () => {
  const mix = (from: number, to: number): DeliveryCounts => {
    const standings: RecipientStanding[] = [];
    for (let n = from; n <= to; n += 1)
      standings.push(
        standingOf(walkDeliveryEventsOf(`partner${n}@fund${n}.example`, T("10:00:00"))),
      );
    return countsOf(standings);
  };

  it("drops requests, opens, proxy loads and clicks", () => {
    expect(walkMixOf("partner1@fund1.example").map((item) => item.event)).toEqual([
      "requests",
      "delivered",
      "opened",
      "loadedByProxy",
      "clicks",
    ]);
    expect(walkDeliveryEventsOf("partner1@fund1.example", T("10:00:00"))).toEqual([
      { kind: "delivered", at: T("10:00:01"), reason: "" },
    ]);
    expect(walkDeliveryEventsOf("partner36@fund36.example", T("10:00:00"))).toEqual([
      { kind: "hard_bounce", at: T("10:00:03"), reason: "550 5.1.1 <[address]>: user unknown" },
    ]);
    expect(walkDeliveryEventsOf("silent@fund1.example", T("10:00:00"))).toEqual([]);
    expect(walkMixOf("custom.one@angel.example").map((item) => item.event)).toContain("delivered");
  });

  it("decides by the local part first, then by the firm number", () => {
    const shown = (email: string) => standingOf(walkDeliveryEventsOf(email, T("10:00:00"))).shown;
    expect(shown("hardbounce@fund1.example")).toBe("hard_bounce");
    expect(shown("softbounce@fund1.example")).toBe("soft_bounce");
    expect(shown("complaint@fund1.example")).toBe("complaint");
    expect(shown("unsubscribe@fund1.example")).toBe("unsubscribed");
    expect(shown("deferred@fund1.example")).toBe("deferred");
    expect(shown("blocked@fund1.example")).toBe("blocked");
    expect(shown("invalid@fund1.example")).toBe("invalid");
    expect(shown("error@fund1.example")).toBe("error");
    expect(shown("silent@fund1.example")).toBe("not_yet");
    expect(WALK_MIX_SPECIALS).toEqual({
      complaint: 41,
      unsubscribed: 43,
      deferred: 47,
      blocked: 53,
      invalid: 59,
      error: 61,
    });
    // The firm numbers the existing walks and tests name are all plain deliveries.
    for (const n of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 260, 281, 285, 291, 301])
      expect(shown(`partner${n}@fund${n}.example`), String(n)).toBe("delivered");
  });

  it('counts "Walk live 01" (fund 1 to 290) as the table says', () => {
    const counts = mix(1, 290);
    expect(counts).toEqual({
      accepted: 290,
      delivered: 268,
      not_yet: 1,
      soft_bounce: 10,
      hard_bounce: 8,
      blocked: 1,
      invalid: 1,
      error: 1,
      didnt_arrive: 21,
      complaint: 1,
      unsubscribed: 1,
      retry: 12,
    } satisfies DeliveryCounts);
    const warnings = warningsOf(counts, "mailing");
    expect(warnings.map((warning) => [warning.key, warning.level])).toEqual([
      ["complaints", "danger"],
      ["hard_bounces", "attention"],
    ]);
    expect(warnings[0]!.body).toContain(
      "1 spam complaint from 268 delivered in this mailing: 0.37 per cent.",
    );
    expect(warnings[1]!.body).toContain(
      "8 of 290 accepted bounced hard in this mailing: 2.8 per cent.",
    );
  });

  it('counts "Email 1" (fund 1 to 256) as the table says', () => {
    const counts = mix(1, 256);
    expect(counts).toEqual({
      accepted: 256,
      delivered: 237,
      not_yet: 1,
      soft_bounce: 8,
      hard_bounce: 7,
      blocked: 1,
      invalid: 1,
      error: 1,
      didnt_arrive: 18,
      complaint: 1,
      unsubscribed: 1,
      retry: 10,
    } satisfies DeliveryCounts);
    const warnings = warningsOf(counts, "mailing");
    expect(warnings[0]!.body).toContain("0.42 per cent");
    expect(warnings[1]!.body).toContain(
      "7 of 256 accepted bounced hard in this mailing: 2.7 per cent.",
    );
    expect(warnings[1]!.level).toBe("attention");
  });
});
