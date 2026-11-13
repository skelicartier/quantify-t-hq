// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { leadIdOf } from "../../scripts/data/leads/types";
import { Scripted, peopleCsv, readyToSend } from "./leads-kit";
import { WALKER, startStack, until, type RawAnswer, type Stack } from "./helpers";

/**
 * Taking back a No on the real stack, where the stop it made may still be owed to another
 * No, or may have been taken off and put back since: then the stop stays. Someone whose No
 * stands is never put on a Mail merge list made here, even with the stop entry gone.
 */

let stack: Stack;
const provider = new Scripted();
const PEOPLE = Array.from({ length: 2 }, (_, index) => ({
  email: `partner${index + 13}@fund${index + 13}.example`,
  first: "Asha",
  last: `Rao${index + 13}`,
  company: `Walk Fund ${index + 13}`,
  title: "Partner",
}));

type Body = Record<string, unknown>;

function record(body: Body): Promise<RawAnswer> {
  return stack.ask("POST", "/data/replies", {
    by: WALKER,
    words: "Invented words.",
    subject: "Re: A note",
    received_at: new Date().toISOString(),
    add_if_missing: false,
    ...body,
  });
}

async function lead(email: string): Promise<Body> {
  const answer = await stack.ask("GET", `/data/leads/${leadIdOf(email)}`);
  expect(answer.status).toBe(200);
  return answer.json!.lead as Body;
}

beforeAll(async () => {
  stack = await startStack({ liveProvider: () => provider });
  await readyToSend(stack.engine);
  stack.engine.importList({ name: "Walk 13", file_name: "walk-13.csv", text: peopleCsv(PEOPLE) });
  await until(async () => {
    const page = (await stack.ask("GET", "/data/leads")).json!;
    return page.total === PEOPLE.length && page.reading === false;
  }, "the list to be read");
}, 60_000);
afterAll(() => stack.stop());

describe("taking back a No", () => {
  const onStopList = (email: string) =>
    stack.engine.stops({}).stops.some((stop) => stop.email === email);

  it("keeps the stop while another No still stands, and never lists someone who said no", async () => {
    const email = "partner13@fund13.example";
    // A No recorded with the wrong date, then again with the right one: two Nos stand.
    const first = await record({
      email,
      outcome: "not_interested",
      received_at: new Date(Date.now() - 86_400_000).toISOString(),
    });
    const second = await record({ email, outcome: "not_interested" });
    expect((second.json!.reply as Body).effects).toEqual([{ kind: "stop_already", email }]);
    const firstId = String((first.json!.reply as Body).reply_id);
    const preview = (await stack.ask("GET", `/data/replies/${firstId}/take-back-preview`)).json!;
    expect(preview.undo).toEqual([]);
    expect(preview.keep).toEqual([
      {
        effect: { kind: "stop_added", email, at: expect.any(String) },
        why: "Another “No” from them still stands, so they stay on the stop list.",
      },
    ]);
    const taken = await stack.ask("POST", `/data/replies/${firstId}/take-back`, { by: WALKER });
    expect(taken.json!.message).toBe("Taken back. Nothing it did needed undoing.");
    expect(onStopList(email)).toBe(true);
    const standing = await lead(email);
    expect(standing.status).toBe("no");
    expect(String(standing.status_detail)).toMatch(/ · on the stop list$/);

    // Taken off the stop list by hand: the status says so, and no list made here holds them.
    stack.engine.removeStop({ email });
    const off = await lead(email);
    expect(off.status).toBe("no");
    expect(String(off.status_detail)).toMatch(/ · not on the stop list$/);
    const view = (await stack.ask("GET", `/data/leads?q=${encodeURIComponent(email)}`)).json!;
    expect(view).toMatchObject({ total: 1, listable: 0 });
    const listed = await stack.ask("POST", "/data/leads/to-mail-merge", {
      by: WALKER,
      query: `q=${encodeURIComponent(email)}`,
      name: "Should not be made",
    });
    expect(listed.status).toBe(409);
    expect(listed.json!.error).toEqual({
      code: "all_stopped",
      message: "Everyone in this view is on the stop list or said no.",
    });
    expect(stack.engine.lists().lists.some((list) => list.name === "Should not be made")).toBe(
      false,
    );
  });

  it("keeps a stop that was taken off and put back since: that entry is not the reply's", async () => {
    const email = "partner14@fund14.example";
    const answer = await record({ email, outcome: "not_interested" });
    const replyId = String((answer.json!.reply as Body).reply_id);
    stack.engine.removeStop({ email });
    await new Promise((resolve) => setTimeout(resolve, 5));
    // Put back by hand, with the same reason a No gives it.
    expect(stack.engine.addStops({ emails: email, reason: "asked" }).added).toBe(1);
    const preview = (await stack.ask("GET", `/data/replies/${replyId}/take-back-preview`)).json!;
    expect(preview.undo).toEqual([]);
    expect(preview.keep).toEqual([
      {
        effect: { kind: "stop_added", email, at: expect.any(String) },
        why: "They were put on the stop list again since, so they stay on it.",
      },
    ]);
    const taken = await stack.ask("POST", `/data/replies/${replyId}/take-back`, { by: WALKER });
    expect(taken.status).toBe(200);
    expect(onStopList(email)).toBe(true);
    expect((await lead(email)).status).toBe("stopped");
  });
});
