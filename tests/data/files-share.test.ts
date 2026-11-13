// @vitest-environment node
import { randomBytes, randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addressesOf, attachmentName, tooLargeToAttach } from "../../scripts/data/files/share";
import { inventedPdf, socketCall, uploadVia } from "../../scripts/data/files/walk-seed";
import { WALK_KEY, WalkProvider } from "../../scripts/mail-merge/e2e-provider";
import { BrevoProvider } from "../../scripts/mail-merge/provider";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * "Send by email": the real provider class with a fake fetcher, so the request it would
 * make is read here and nothing leaves. The attachment is the current version's bytes in
 * base64; a stop-list address and an empty key are refused; the log line is written.
 */
type Call = { url: string; key: string; body: Record<string, unknown> };
const calls: Call[] = [];
const fakeFetch = (async (input: string | URL | Request, init?: RequestInit) => {
  const body = JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown>;
  const headers = (init?.headers ?? {}) as Record<string, string>;
  calls.push({ url: String(input), key: headers["api-key"] ?? "", body });
  const to = (body.to as { email: string }[] | undefined)?.[0]?.email ?? "";
  if (to.startsWith("bounce"))
    return new Response(JSON.stringify({ code: "invalid_parameter", message: `${to} refused` }), {
      status: 400,
    });
  return new Response(JSON.stringify({ messageId: `<${randomUUID()}@fake.invalid>` }), {
    status: 201,
  });
}) as typeof fetch;

let stack: Stack;
let fileId = "";
let pdf: Uint8Array;
const send = (body: Record<string, unknown>, id = fileId) =>
  socketCall(stack.socket, "POST", `/data/files/${id}/share/email`, {
    json: { by: WALKER, ...body },
  });
const code = (reply: { body: Record<string, unknown> }) =>
  String((reply.body.error as { code?: string } | undefined)?.code ?? "");
const said = (reply: { body: Record<string, unknown> }) =>
  String((reply.body.error as { message?: string } | undefined)?.message ?? "");

beforeAll(async () => {
  stack = await startStack({
    modules: ["files"],
    liveProvider: (key) => new WalkProvider(key, () => undefined),
    shareProvider: (key) => new BrevoProvider(key, fakeFetch),
  });
  stack.engine.saveSettings({
    from_email: "founder@walk.example",
    from_name: "Walk Founder",
    reply_to: "founder@walk.example",
  });
  pdf = await inventedPdf(["Walk Fund one-pager, invented for the test."]);
  const added = await uploadVia(stack.socket, { name: "one-pager.pdf", bytes: pdf, by: WALKER });
  fileId = (added.body.file as { file_id: string }).file_id;
}, 60_000);
afterAll(async () => {
  await stack.stop();
});

describe("send by email", () => {
  it("is refused with no provider key, and nothing is sent", async () => {
    const answer = await send({ to: "partner1@fund1.example" });
    expect(answer.status).toBe(400);
    expect(code(answer)).toBe("no_key");
    expect(said(answer)).toBe(
      "No provider key is set in Mail merge's Setup, so nothing can be sent.",
    );
    expect(calls).toHaveLength(0);
  });

  it("is refused for an address on the stop list, and nothing is sent", async () => {
    await stack.engine.setKey({ key: WALK_KEY });
    stack.engine.addStops({ emails: "stopped@fund9.example", reason: "manual" });
    const answer = await send({ to: "partner1@fund1.example, Stopped@Fund9.example" });
    expect(answer.status).toBe(409);
    expect(said(answer)).toBe("stopped@fund9.example is on the stop list.");
    expect(calls).toHaveLength(0);
  });

  it("sends the current version as a base64 attachment, one message per address, and writes it down", async () => {
    const attempt = randomUUID();
    const answer = await send({
      to: ["partner1@fund1.example partner2@fund2.example"],
      subject: "The one-pager",
      message: "Please find the one-pager attached.\n\nA Founder",
      attempt,
    });
    expect(answer.status).toBe(200);
    expect(answer.body.message).toBe("Sent to partner1@fund1.example, partner2@fund2.example.");
    expect(calls).toHaveLength(2);
    for (const [index, call] of calls.entries()) {
      expect(call.url).toBe("https://api.brevo.com/v3/smtp/email");
      expect(call.key).toBe(WALK_KEY);
      expect(call.body.attachment).toEqual([
        { name: "one-pager.pdf", content: Buffer.from(pdf).toString("base64") },
      ]);
      expect(call.body.to).toEqual([{ email: `partner${index + 1}@fund${index + 1}.example` }]);
      expect(call.body.sender).toEqual({ email: "founder@walk.example", name: "Walk Founder" });
      expect(call.body.subject).toBe("The one-pager");
      expect(call.body.textContent).toBe("Please find the one-pager attached.\n\nA Founder");
      expect(String(call.body.htmlContent)).toContain("<p>Please find the one-pager attached.</p>");
    }
    // A second press with the same attempt replays the answer and sends nothing more.
    const again = await send({ to: "partner1@fund1.example", attempt });
    expect(again.body.message).toBe(answer.body.message);
    expect(calls).toHaveLength(2);

    const lines = readFileSync(join(stack.dir, "data", "files", "shares.jsonl"), "utf8")
      .trim()
      .split("\n");
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0]!)).toMatchObject({
      file_id: fileId,
      how: "email",
      to: ["partner1@fund1.example", "partner2@fund2.example"],
      subject: "The one-pager",
      by: WALKER,
      result: "sent",
    });
    const file = (await socketCall(stack.socket, "GET", `/data/files/${fileId}`)).body.file as {
      activity: { verb: string }[];
    };
    expect(file.activity[0]?.verb).toBe(
      "Sent by email to partner1@fund1.example, partner2@fund2.example",
    );
    const shared = (await socketCall(stack.socket, "GET", "/data/files?view=shared")).body as {
      shares: { how: string; to: string[]; title: string }[];
      counts: { shared: number };
    };
    expect(shared.counts.shared).toBe(1);
    expect(shared.shares[0]).toMatchObject({ how: "email", title: "one-pager.pdf" });
  });

  it("says the provider's refusal in words", async () => {
    const answer = await send({ to: "bounce@fund3.example" });
    expect(answer.status).toBe(200);
    expect(answer.body.message).toBe(
      "The provider refused it: an address or the attachment was not accepted. Nothing was sent.",
    );
    expect((answer.body.share as { result: string }).result).toBe("failed");
  });

  it("refuses a key in the message, more than ten addresses, a bad address, and a file over 3 MB", async () => {
    expect(code(await send({ to: "a@b.example", message: "use xkeysib-123" }))).toBe("secret");
    const many = Array.from({ length: 11 }, (_, index) => `p${index}@f.example`).join(",");
    expect(said(await send({ to: many }))).toBe("Send it to ten addresses at most.");
    expect(said(await send({ to: "not an address" }))).toBe("“not” is not an email address.");
    const big = await uploadVia(stack.socket, {
      name: "big.bin",
      bytes: randomBytes(3 * 1024 * 1024 + 1),
      by: WALKER,
    });
    const refused = await send(
      { to: "a@b.example" },
      (big.body.file as { file_id: string }).file_id,
    );
    expect(code(refused)).toBe("too_large");
    expect(said(refused)).toBe(
      "This file is 3 MB, too large to attach. Download it and send it from your mail app.",
    );
  });

  it("writes down a share from the device's share sheet", async () => {
    const answer = await socketCall(stack.socket, "POST", `/data/files/${fileId}/share/sheet`, {
      json: { by: WALKER },
    });
    expect((answer.body.share as { how: string; to: string[] }).how).toBe("share_sheet");
    const shared = (await socketCall(stack.socket, "GET", "/data/files?view=shared")).body
      .shares as { how: string }[];
    expect(shared[0]?.how).toBe("share_sheet");
  });
});

describe("the pieces", () => {
  it("reads addresses, names the attachment and words the size", () => {
    expect(addressesOf("A@B.example; c@d.example  a@b.example")).toEqual([
      "a@b.example",
      "c@d.example",
    ]);
    expect(attachmentName("Deck v3", "deck.pdf")).toBe("Deck v3.pdf");
    expect(attachmentName("deck.pdf", "deck.pdf")).toBe("deck.pdf");
    expect(tooLargeToAttach(5 * 1024 * 1024)).toBe(
      "This file is 5 MB, too large to attach. Download it and send it from your mail app.",
    );
  });

  it("leaves the provider's request as it was when nothing is attached", async () => {
    const seen: Record<string, unknown>[] = [];
    const provider = new BrevoProvider("xkeysib-test", (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      seen.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response("{}", { status: 201 });
    }) as typeof fetch);
    const mail = {
      to_email: "a@b.example",
      to_name: "",
      from_email: "f@w.example",
      from_name: "F",
      reply_to: "",
      subject: "s",
      html: "<p>t</p>",
      text: "t",
      headers: {},
      tags: [],
    };
    await provider.send(mail);
    await provider.send({ ...mail, attachments: [] });
    expect(seen.map((body) => "attachment" in body)).toEqual([false, false]);
  });
});
