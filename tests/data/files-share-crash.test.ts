// @vitest-environment node
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { inventedPdf, socketCall, uploadVia } from "../../scripts/data/files/walk-seed";
import { HOST_MESSAGES } from "../../scripts/data/protocol";
import { WALK_KEY, WalkProvider } from "../../scripts/mail-merge/e2e-provider";
import type { OutgoingMail, SendResult } from "../../scripts/mail-merge/provider";
import { Scripted } from "./leads-kit";
import { WALKER, codeOf, startStack, until, type Stack } from "./helpers";

/**
 * A "Send by email" the host is still sending when the worker dies: the request never says
 * "try again" (the mail may have gone), and the send the host made is written down once,
 * in "Shared by me" and the file's activity, when the worker is back.
 */

/** A provider whose send waits until the test lets it go. */
class Held extends Scripted {
  started = 0;
  #release: () => void = () => undefined;
  readonly #gate = new Promise<void>((resolve) => {
    this.#release = resolve;
  });
  release(): void {
    this.#release();
  }
  override async send(mail: OutgoingMail): Promise<SendResult> {
    this.started += 1;
    await this.#gate;
    return super.send(mail);
  }
}

let stack: Stack;
let fileId = "";
const provider = new Held();

beforeAll(async () => {
  stack = await startStack({
    modules: ["files"],
    liveProvider: (key) => new WalkProvider(key, () => undefined),
    shareProvider: () => provider,
  });
  stack.engine.saveSettings({
    from_email: "founder@walk.example",
    from_name: "Walk Founder",
    reply_to: "founder@walk.example",
  });
  await stack.engine.setKey({ key: WALK_KEY });
  const pdf = await inventedPdf(["Walk Fund deck, invented for the test."]);
  const added = await uploadVia(stack.socket, { name: "deck.pdf", bytes: pdf, by: WALKER });
  fileId = (added.body.file as { file_id: string }).file_id;
}, 60_000);
afterAll(async () => {
  provider.release();
  await stack.stop();
});

describe("a send by email when the worker dies part-way", () => {
  it("says it may have gone, and the send is written down once when Data is back", async () => {
    const sending = stack.ask("POST", `/data/files/${fileId}/share/email`, {
      by: WALKER,
      to: "partner1@fund1.example",
      subject: "The deck",
    });
    await until(() => provider.started === 1, "the host to start sending");
    await stack.ask("POST", "/data/_test/crash", { by: WALKER });
    const answer = await sending;
    expect(answer.status).toBe(503);
    expect(codeOf(answer)).toBe("share_unknown");
    expect((answer.json!.error as { message: string }).message).toBe(HOST_MESSAGES.share_unknown);
    expect(HOST_MESSAGES.share_unknown).toBe(
      "It may have gone: Data stopped answering while it was sending. Look in “Shared by me” before you send it again.",
    );

    // The provider answers after the worker died; the host keeps what it said.
    await stack.data.ready(20_000);
    provider.release();
    await until(() => provider.sent.length === 1, "the send to finish");
    type Shared = { shares: { how: string; to: string[]; result: string; subject: string }[] };
    let shared: Shared = { shares: [] };
    await until(async () => {
      shared = (await socketCall(stack.socket, "GET", "/data/files?view=shared")).body as Shared;
      return shared.shares.length === 1;
    }, "the send to be written down");
    expect(shared.shares[0]).toMatchObject({
      how: "email",
      to: ["partner1@fund1.example"],
      result: "sent",
      subject: "The deck",
    });
    const file = (await socketCall(stack.socket, "GET", `/data/files/${fileId}`)).body.file as {
      activity: { verb: string }[];
    };
    expect(file.activity[0]?.verb).toBe("Sent by email to partner1@fund1.example");
    // Read again (and after another listing), it is still written down once.
    await socketCall(stack.socket, "GET", "/data/files?view=shared");
    const lines = readFileSync(join(stack.dir, "data", "files", "shares.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(1);
    expect(provider.sent.map((mail) => mail.to_email)).toEqual(["partner1@fund1.example"]);
  }, 30_000);
});
