// @vitest-environment node
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { beforeEach, describe, expect, it } from "vitest";

import { WALK_KEY, WalkProvider, resetWalkEvents } from "../../scripts/mail-merge/e2e-provider";
import {
  BrevoProvider,
  PracticeProvider,
  type OutgoingMail,
} from "../../scripts/mail-merge/provider";

/**
 * The provider's events, one request and one classified answer (delivery spec §6.3). The
 * real provider is never called: `BrevoProvider` gets a fake `fetch`, and the stand-in
 * answers from what it was handed.
 */

const KEY = "xkeysib-test-0000000000000000000000000000000000000000-abcd";
const QUERY = { days: 8, offset: 0, limit: 2_500, tags: ["hq-mail-merge"] } as const;

type Call = { url: string; headers: Record<string, string>; method: string };

function fake(answer: (call: Call) => Response | Promise<Response>): {
  fetcher: typeof fetch;
  calls: Call[];
} {
  const calls: Call[] = [];
  const fetcher = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const call: Call = {
      url: String(input),
      headers: (init?.headers ?? {}) as Record<string, string>,
      method: init?.method ?? "GET",
    };
    calls.push(call);
    return answer(call);
  }) as typeof fetch;
  return { fetcher, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });

function mail(to: string, tags = ["hq-mail-merge", "abcd1234"]): OutgoingMail {
  return {
    to_email: to,
    to_name: "",
    from_email: "founder@walk.example",
    from_name: "Walk Founder",
    reply_to: "",
    subject: "A note",
    html: "<p>A note</p>",
    text: "A note",
    headers: {},
    tags,
  };
}

describe("the provider's events, read with a fake fetch", () => {
  it("asks the events address oldest first, with the key in its header and the tag filter", async () => {
    const { fetcher, calls } = fake(() => json(200, { events: [] }));
    const page = await new BrevoProvider(KEY, fetcher).listEvents({ ...QUERY, offset: 5_000 });
    expect(page).toEqual({ status: "ok", events: [] });
    expect(calls).toHaveLength(1);
    const url = new URL(calls[0]!.url);
    expect(`${url.origin}${url.pathname}`).toBe("https://api.brevo.com/v3/smtp/statistics/events");
    expect(calls[0]!.url).toContain("limit=2500");
    expect(calls[0]!.url).toContain("offset=5000");
    expect(calls[0]!.url).toContain("days=8");
    expect(calls[0]!.url).toContain("sort=asc");
    expect(calls[0]!.url).toContain("tags=%5B%22hq-mail-merge%22%5D");
    expect(calls[0]!.method).toBe("GET");
    expect(calls[0]!.headers["api-key"]).toBe(KEY);
  });

  it("sends no tags at all when the filter is off", async () => {
    const { fetcher, calls } = fake(() => json(200, {}));
    const page = await new BrevoProvider(KEY, fetcher).listEvents({ ...QUERY, tags: null });
    expect(page).toEqual({ status: "ok", events: [] });
    expect(calls[0]!.url).not.toContain("tags");
  });

  it("reads a page defensively: an array tag, long strings cut, odd rows made harmless", async () => {
    const { fetcher } = fake(() =>
      json(200, {
        events: [
          {
            email: "partner36@fund36.example",
            date: "2026-11-06T15:45:30+05:30",
            messageId: "<A1@smtp-relay.example>",
            event: "hardBounces",
            reason: "550 5.1.1 user unknown",
            tag: ["hq-mail-merge", "abcd1234"],
            subject: "never kept",
            ip: "192.0.2.1",
          },
          { email: `${"x".repeat(400)}@fund1.example`, reason: "r".repeat(900), event: 7 },
          "not a row",
          null,
        ],
      }),
    );
    const page = await new BrevoProvider(KEY, fetcher).listEvents(QUERY);
    if (page.status !== "ok") throw new Error("expected a page");
    expect(page.events[0]).toEqual({
      email: "partner36@fund36.example",
      date: "2026-11-06T15:45:30+05:30",
      message_id: "<A1@smtp-relay.example>",
      event: "hardBounces",
      reason: "550 5.1.1 user unknown",
      tag: "hq-mail-merge,abcd1234",
    });
    expect(page.events[1]!.email).toHaveLength(254);
    expect(page.events[1]!.reason).toHaveLength(500);
    expect(page.events[1]).toMatchObject({ date: "", message_id: "", event: "7", tag: "" });
    expect(page.events[2]).toEqual({
      email: "",
      date: "",
      message_id: "",
      event: "",
      reason: "",
      tag: "",
    });
    expect(page.events).toHaveLength(4);
  });

  it("takes at most the page it asked for", async () => {
    const { fetcher } = fake(() =>
      json(200, { events: Array.from({ length: 9 }, () => ({ event: "delivered" })) }),
    );
    const page = await new BrevoProvider(KEY, fetcher).listEvents({ ...QUERY, limit: 4 });
    expect(page.status === "ok" && page.events.length).toBe(4);
  });

  it("classifies a refused key, a slow-down, a refusal and a failure", async () => {
    const ask = (response: () => Response) =>
      new BrevoProvider(KEY, fake(response).fetcher).listEvents(QUERY);
    expect(await ask(() => json(401, { code: "unauthorized" }))).toEqual({ status: "auth_failed" });
    expect(await ask(() => json(403, { code: "permission_denied" }))).toEqual({
      status: "auth_failed",
    });
    expect(await ask(() => json(429, {}, { "x-sib-ratelimit-reset": "120" }))).toEqual({
      status: "rate_limited",
      retry_after_seconds: 120,
    });
    expect(await ask(() => json(429, {}, { "retry-after": "30" }))).toEqual({
      status: "rate_limited",
      retry_after_seconds: 30,
    });
    expect(await ask(() => json(429, {}))).toEqual({
      status: "rate_limited",
      retry_after_seconds: null,
    });
    // A reset that is not a whole number of seconds up to an hour is not believed.
    expect(
      await ask(() =>
        json(429, {}, { "x-sib-ratelimit-reset": "1794300000", "retry-after": "45" }),
      ),
    ).toEqual({ status: "rate_limited", retry_after_seconds: 45 });
    expect(
      await ask(() =>
        json(400, { code: "invalid_parameter", message: "tags for a@fund1.example is wrong" }),
      ),
    ).toEqual({ status: "refused", code: "invalid_parameter", http: 400 });
    expect(await ask(() => json(404, {}))).toEqual({ status: "refused", code: "404", http: 404 });
    expect(await ask(() => json(500, {}))).toEqual({ status: "unavailable" });
    expect(await ask(() => new Response("<html>", { status: 200 }))).toEqual({
      status: "unavailable",
    });
  });

  it("calls a timeout and a dead line unavailable, and asks nothing without a key", async () => {
    const hung = (_input: RequestInfo | URL, init?: RequestInit) =>
      new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () =>
          reject(new DOMException("timed out", "TimeoutError")),
        );
      });
    expect(await new BrevoProvider(KEY, hung as typeof fetch, 30).listEvents(QUERY)).toEqual({
      status: "unavailable",
    });
    const dead = (async () => {
      throw new TypeError("fetch failed");
    }) as unknown as typeof fetch;
    expect(await new BrevoProvider(KEY, dead).listEvents(QUERY)).toEqual({
      status: "unavailable",
    });
    const { fetcher, calls } = fake(() => json(200, {}));
    expect(await new BrevoProvider("", fetcher).listEvents(QUERY)).toEqual({
      status: "auth_failed",
    });
    expect(calls).toHaveLength(0);
  });
});

describe("the practice provider", () => {
  it("has no events: practice mail goes nowhere", async () => {
    const dir = mkdtempSync(join(tmpdir(), "hq-practice-"));
    try {
      const practice = new PracticeProvider(join(dir, "outbox.jsonl"));
      await practice.send(mail("partner1@fund1.example"));
      expect(await practice.listEvents()).toEqual({ status: "ok", events: [] });
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe("the stand-in provider's events", () => {
  beforeEach(() => resetWalkEvents());
  const walk = (key = WALK_KEY) => new WalkProvider(key, () => undefined);
  const all = { days: 8, offset: 0, limit: 100_000, tags: null } as const;

  it("gives every message its own id, a thousand in one millisecond", async () => {
    const ids = new Set<string>();
    const provider = walk();
    for (let index = 1; index <= 1_000; index += 1)
      ids.add((await provider.send(mail(`partner${index}@fund${index}.example`))).message_id);
    expect(ids.size).toBe(1_000);
    for (const id of ids) expect(id).toMatch(/^<walk-\d+-\d+@walk\.invalid>$/);
  });

  it("answers the mix for what it accepted, a new provider for every call", async () => {
    await walk().send(mail("partner1@fund1.example"));
    await walk().send(mail("partner36@fund36.example"));
    const page = await walk().listEvents(all);
    if (page.status !== "ok") throw new Error("expected a page");
    expect(page.events.map((event) => event.event).sort()).toEqual(
      [
        "clicks",
        "delivered",
        "hardBounces",
        "loadedByProxy",
        "opened",
        "requests",
        "requests",
      ].sort(),
    );
    const bounce = page.events.find((event) => event.event === "hardBounces")!;
    expect(bounce).toMatchObject({
      email: "partner36@fund36.example",
      reason: "550 5.1.1 <partner36@fund36.example>: user unknown",
      tag: "hq-mail-merge",
    });
    expect(bounce.message_id).toMatch(/^<walk-/);
    const dates = page.events.map((event) => event.date);
    expect([...dates].sort()).toEqual(dates);
  });

  it("filters by tag, and pages by offset and limit", async () => {
    await walk().send(mail("partner1@fund1.example", ["hq-mail-merge", "abcd1234"]));
    await walk().send(mail("other@fund2.example", ["something-else"]));
    const tagged = await walk().listEvents({ ...all, tags: ["hq-mail-merge"] });
    const everything = await walk().listEvents(all);
    if (tagged.status !== "ok" || everything.status !== "ok") throw new Error("expected pages");
    expect(tagged.events).toHaveLength(5);
    expect(everything.events).toHaveLength(10);
    expect(tagged.events.every((event) => event.email === "partner1@fund1.example")).toBe(true);
    const first = await walk().listEvents({ ...all, limit: 4 });
    const second = await walk().listEvents({ ...all, limit: 4, offset: 4 });
    const third = await walk().listEvents({ ...all, limit: 4, offset: 8 });
    const beyond = await walk().listEvents({ ...all, limit: 4, offset: 12 });
    if (
      first.status !== "ok" ||
      second.status !== "ok" ||
      third.status !== "ok" ||
      beyond.status !== "ok"
    )
      throw new Error("expected pages");
    expect([first.events.length, second.events.length, third.events.length]).toEqual([4, 4, 2]);
    expect(beyond.events).toEqual([]);
    expect([...first.events, ...second.events, ...third.events]).toEqual(everything.events);
  });

  it("makes no events for a send it refused, and none at all for a wrong key", async () => {
    const refused = await walk().send(mail("refused@fund1.example"));
    expect(refused.status).toBe("failed");
    const page = await walk().listEvents(all);
    expect(page).toEqual({ status: "ok", events: [] });
    await walk().send(mail("partner1@fund1.example"));
    expect(await walk("xkeysib-wrong-0000").listEvents(all)).toEqual({ status: "auth_failed" });
    resetWalkEvents();
    expect(await walk().listEvents(all)).toEqual({ status: "ok", events: [] });
  });
});
