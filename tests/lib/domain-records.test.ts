import { describe, expect, it } from "vitest";

import {
  expectedIncludes,
  judgeDkim,
  judgeDmarc,
  judgeSpf,
  selectorsFor,
} from "@/lib/mail/domain-records";

/** What a sending domain publishes, judged against the hosts its mailboxes sign in at. */
describe("a sending domain's records", () => {
  it("expects the include each host's guide asks for", () => {
    expect(expectedIncludes(["google"])).toEqual(["_spf.google.com"]);
    expect(expectedIncludes(["microsoft", "smtppro.zoho.in"])).toEqual([
      "spf.protection.outlook.com",
      "zoho.in",
    ]);
    expect(expectedIncludes(["mail.example.net"])).toEqual([]);
  });

  it("judges SPF: one record, every host named, ending strictly", () => {
    expect(judgeSpf(["google-site-verification=abc"], ["google"]).state).toBe("missing");
    expect(judgeSpf(["v=spf1 include:_spf.google.com ~all"], ["google"]).state).toBe("ok");
    const two = judgeSpf(["v=spf1 include:_spf.google.com ~all", "v=spf1 -all"], ["google"]);
    expect(two.state).toBe("attention");
    expect(two.detail).toMatch(/2 SPF records/);
    const short = judgeSpf(["v=spf1 include:_spf.google.com ~all"], ["google", "smtppro.zoho.in"]);
    expect(short.detail).toBe("It does not include zoho.in, which its mailboxes send through.");
    expect(judgeSpf(["v=spf1 include:zoho.in +all"], ["smtppro.zoho.in"]).detail).toMatch(
      /allowing anyone/,
    );
    expect(judgeSpf(["v=spf1 include:zoho.in -all"], ["smtppro.zoho.in"]).state).toBe("ok");
    // Handing the whole record over names the host as surely as including it.
    expect(judgeSpf(["v=spf1 redirect=_spf.google.com"], ["google"]).state).toBe("ok");
  });

  it("judges DMARC: a policy, and somewhere for the reports", () => {
    expect(judgeDmarc([]).state).toBe("missing");
    expect(judgeDmarc(["v=DMARC1; rua=mailto:d@quantifyterminal.co"]).state).toBe("attention");
    expect(judgeDmarc(["v=DMARC1; p=none"]).detail).toMatch(/no address for reports/);
    expect(judgeDmarc(["v=DMARC1; p=quarantine; rua=mailto:d@quantifyterminal.co"])).toEqual({
      state: "ok",
      detail: "Policy quarantine, reports sent.",
    });
  });

  it("tries the hosts' own DKIM names, and the common ones for any other host", () => {
    expect(selectorsFor(["google"])).toEqual(["google"]);
    expect(selectorsFor(["microsoft"])).toEqual(["selector1", "selector2"]);
    expect(selectorsFor(["smtppro.zoho.in"])).toContain("zmail");
    expect(judgeDkim(["google"], ["google"], ["google"]).state).toBe("ok");
    expect(judgeDkim([], ["google"], ["google"]).state).toBe("missing");
    // Another host chose the name: not found is not the same as not there.
    expect(judgeDkim([], ["default"], ["mail.example.net"]).state).toBe("unknown");
  });
});
