// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  blanksIn,
  columnKey,
  fieldsOf,
  fill,
  render,
  wordsToHtml,
  wordsToText,
} from "../../scripts/mail-merge/template";

describe("a message made out to each person", () => {
  it("makes a key from a heading the way a list does", () => {
    expect(columnKey("First Name")).toBe("first_name");
    expect(columnKey("  Fund size (USD) ")).toBe("fund_size_usd");
    expect(columnKey("2024 cheque")).toBe("c_2024_cheque");
  });

  it("finds each field once, and knows when every use of it has a fallback", () => {
    expect(fieldsOf("Hi {{First Name}}", "{{first_name|there}} at {{ firm }}")).toEqual([
      { key: "first_name", fallback: null },
      { key: "firm", fallback: null },
    ]);
    expect(fieldsOf("Hi {{first_name|there}}")).toEqual([{ key: "first_name", fallback: "there" }]);
  });

  it("fills a field, uses the fallback for an empty cell, and names what it could not fill", () => {
    expect(fill("Hi {{first_name}}, about {{firm}}", { first_name: "Asha", firm: "Peak" })).toEqual(
      {
        text: "Hi Asha, about Peak",
        missing: [],
      },
    );
    expect(fill("Hi {{first_name|there}}", { first_name: "  " })).toEqual({
      text: "Hi there",
      missing: [],
    });
    expect(fill("Hi {{first_name}} of {{firm}}", { firm: "Peak" }).missing).toEqual(["first_name"]);
  });

  it("reads a field in single braces, as a mail-merge template writes it", () => {
    expect(
      fill("{Greeting}\n\n{PersonalLine}", {
        greeting: "Hi Example Fund team,",
        personalline: "I'm writing because of Example Co.",
      }),
    ).toEqual({ text: "Hi Example Fund team,\n\nI'm writing because of Example Co.", missing: [] });
    expect(fieldsOf("{Greeting} and {{firm}}").map((field) => field.key)).toEqual([
      "greeting",
      "firm",
    ]);
    expect(fill("Hi {Greeting}", {}).missing).toEqual(["greeting"]);
  });

  it("never reads what a cell holds as a field", () => {
    expect(fill("{Greeting}", { greeting: "{{firm}} {firm}", firm: "Peak" }).text).toBe(
      "{{firm}} {firm}",
    );
  });

  it("finds the blanks a draft left, and leaves a real link alone", () => {
    expect(
      blanksIn(
        "Deck: [link]",
        "[Company postal address]\n[the deck](https://example.com/d) [link]",
      ),
    ).toEqual(["[link]", "[Company postal address]"]);
    expect(blanksIn("See [the deck](https://example.com/d)")).toEqual([]);
  });

  it("writes the words as paragraphs with links, and nothing a cell holds as markup", () => {
    const html = wordsToHtml(
      "Hi <b>Asha</b> & co,\nsecond line\n\nThe deck: https://example.com/deck?a=1&b=2.\n[Our site](https://example.com) is **live**.",
    );
    expect(html).toBe(
      [
        "<p>Hi &lt;b&gt;Asha&lt;/b&gt; &amp; co,<br>",
        "second line</p>",
        '<p>The deck: <a href="https://example.com/deck?a=1&amp;b=2">https://example.com/deck?a=1&amp;b=2</a>.<br>',
        '<a href="https://example.com">Our site</a> is <strong>live</strong>.</p>',
      ].join("\n"),
    );
    expect(html).not.toContain("<b>");
  });

  it("keeps a script in a cell as text", () => {
    const made = render(
      { subject: "For {{firm}}", body: "Hi {{first_name}}", footer: "" },
      { firm: 'Evil"><script>alert(1)</script>', first_name: "<img src=x onerror=alert(1)>" },
    );
    expect(made.html).not.toContain("<script");
    expect(made.html).not.toContain("<img");
    expect(made.html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("reads a named link as words and its address in the plain part", () => {
    expect(wordsToText("See [the deck](https://example.com/d) — **soon**")).toBe(
      "See the deck (https://example.com/d) — soon",
    );
  });

  it("makes an unsubscribe link that writes an email, in both parts", () => {
    const footer = "[Unsubscribe](mailto:founders@walk.example?subject=unsubscribe)";
    const made = render({ subject: "Hello", body: "Hi {{first_name|there}}", footer }, {});
    expect(made.html).toBe(
      '<p>Hi there</p>\n<p><a href="mailto:founders@walk.example?subject=unsubscribe">Unsubscribe</a></p>',
    );
    expect(made.text).toBe(
      'Hi there\n\nUnsubscribe: email founders@walk.example with the subject "unsubscribe"',
    );
    expect(made.missing).toEqual([]);
    expect(blanksIn(footer)).toEqual([]);
    expect(wordsToText("[Write to us](mailto:desk@walk.example)")).toBe(
      "Write to us: email desk@walk.example",
    );
  });

  it("links nothing but a web address or an email to write", () => {
    for (const target of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "mailto:not-an-address",
      'mailto:a@walk.example?subject="><script>alert(1)</script>',
      "mailto:a@walk.example?body=one two",
    ]) {
      const html = wordsToHtml(`[Unsubscribe](${target})`);
      expect(html, target).not.toContain("<a ");
      expect(html, target).not.toContain("<script");
    }
  });

  it("puts the footer under the message and keeps the subject to one line", () => {
    const made = render(
      {
        subject: "Intro:\n{{firm}}  round",
        body: "Hi {{first_name|there}}",
        footer: "Reply to stop.",
      },
      { firm: "Peak" },
    );
    expect(made.subject).toBe("Intro: Peak round");
    expect(made.text).toBe("Hi there\n\nReply to stop.");
    expect(made.missing).toEqual([]);
  });
});
