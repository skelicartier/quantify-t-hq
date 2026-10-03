import { describe, expect, it } from "vitest";

import { classifyExchanges, domainOf, mailHostOf } from "@/lib/mail/mail-host";

/**
 * A person connects a mailbox by typing its address; where its mail lives decides the
 * sign-in. These are the mail servers real domains publish, as a lookup returns them.
 */
describe("where an address's mail lives", () => {
  it("knows the two hosts that sign in by consent screen", () => {
    expect(classifyExchanges(["aspmx.l.google.com", "alt1.aspmx.l.google.com"])).toEqual({
      kind: "google",
    });
    expect(classifyExchanges(["smtp.google.com."])).toEqual({ kind: "google" });
    expect(classifyExchanges(["contoso-com.mail.protection.outlook.com"])).toEqual({
      kind: "microsoft",
    });
  });

  it("fills in the servers of the team's own host, region by region", () => {
    expect(classifyExchanges(["mx.zoho.in", "mx2.zoho.in", "mx3.zoho.in"])).toEqual({
      kind: "server",
      exchange: "mx.zoho.in",
      servers: {
        smtp_host: "smtppro.zoho.in",
        smtp_port: 465,
        imap_host: "imappro.zoho.in",
        imap_port: 993,
      },
    });
    const europe = classifyExchanges(["MX2.ZOHO.EU"]);
    expect(europe.kind === "server" && europe.servers?.smtp_host).toBe("smtppro.zoho.eu");
  });

  it("asks for the servers of any other host instead of guessing them", () => {
    expect(classifyExchanges(["mail.example.net"])).toEqual({
      kind: "server",
      exchange: "mail.example.net",
      servers: null,
    });
    // A name that merely contains a host's name is not that host.
    expect(classifyExchanges(["google.com.example.net"]).kind).toBe("server");
    expect(classifyExchanges(["mx.zoho.in.example.net"])).toMatchObject({ servers: null });
  });

  it("tells a domain with no mail apart from a lookup that failed", async () => {
    expect(classifyExchanges([])).toEqual({ kind: "none" });
    const failing = (code: string) => async () => {
      throw Object.assign(new Error(code), { code });
    };
    expect(await mailHostOf("a@nowhere.example", failing("ENOTFOUND"))).toEqual({ kind: "none" });
    expect(await mailHostOf("a@quiet.example", failing("ENODATA"))).toEqual({ kind: "none" });
    expect(await mailHostOf("a@slow.example", failing("ETIMEOUT"))).toEqual({ kind: "unknown" });
    expect(await mailHostOf("no-at-sign", async () => ["mx.zoho.in"])).toEqual({ kind: "none" });
  });

  it("reads the domain after the last @", () => {
    expect(domainOf("Ravi@QuantifyTerminal.IN ")).toBe("quantifyterminal.in");
    expect(domainOf("odd@name@team.example")).toBe("team.example");
    expect(domainOf("nobody")).toBe("");
  });
});
