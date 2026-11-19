// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { addDays, localDay } from "../../scripts/data/days";
import {
  addDomain,
  addHost,
  addSecurityTxt,
  addSigning,
  checkAllHosts,
  checkHost,
  readDomains,
  releaseDomain,
  retireHost,
  retireSecurityTxt,
  signingReplaced,
  updateDomain,
  updateHost,
  updateSecurityTxt,
  updateSigning,
} from "@/lib/data/api/domains";
import { readDataOverview } from "@/lib/data/api/overview";
import { readRegisters } from "@/lib/data/api/registers";
import { WALKER, startStack, type Stack } from "./helpers";

/**
 * The portal's domains and Registers clients against the real stack
 * (ws-notes/duties/spec.md §6.6): every answer passes its schema, with and without the rule
 * book and the scripted prober, and the Summary names all four registers. Invented names
 * under `.example`, which never resolve; nothing here opens a network connection.
 */

let stack: Stack;
const today = () => localDay(new Date());
const attempt = () => crypto.randomUUID();

beforeAll(async () => {
  stack = await startStack({ env: true, modules: ["incidents", "marks", "domains"] });
}, 60_000);
afterAll(() => stack.stop());

describe("the portal and Domains and certificates agree", () => {
  it("without the rule book and the prober", async () => {
    const page = await readDomains();
    expect(page.prober).toBe(false);
    expect(page.rules).toEqual({ tls: null, signing: null, security_txt: null });
    const summary = await readRegisters();
    expect(summary.rows.map((row) => row.key)).toEqual([
      "incidents",
      "marks",
      "domains",
      "holidays",
    ]);
    expect(summary.rows[3]).toMatchObject({ records: null });
  });

  it("every write answers a row its schema reads", async () => {
    await stack.ask("POST", "/data/_test/domains/seed", { by: WALKER });
    const domain = await addDomain(
      { name: "walk.example", expires_on: addDays(today(), 20), auto_renew: "no" },
      WALKER,
      attempt(),
    );
    await updateDomain(domain.domain.domain_id, { dmarc: "quarantine" }, WALKER);
    const spare = await addDomain({ name: "walk-spare.example" }, WALKER, attempt());
    await releaseDomain(spare.domain.domain_id, { on: today(), why: "Not needed" }, WALKER);
    const host = await addHost({ hostname: "www.walk.example" }, WALKER, attempt());
    const read = await checkHost(host.host.host_id, WALKER);
    expect(read.host.checks).toEqual(["At the 200-day limit."]);
    await updateHost(host.host.host_id, { what: "The website" }, WALKER);
    const down = await addHost({ hostname: "down.walk.example" }, WALKER, attempt());
    await checkAllHosts(WALKER);
    await retireHost(down.host.host_id, WALKER);
    const cert = await addSigning(
      { name: "Walk Windows signing", platform: "windows", expires_on: addDays(today(), 30) },
      WALKER,
      attempt(),
    );
    await updateSigning(cert.signing.cert_id, { lead_days: "60" }, WALKER);
    await signingReplaced(cert.signing.cert_id, WALKER);
    const txt = await addSecurityTxt(
      { hostname: "walk.example", published_on: today(), expires_on: addDays(today(), 300) },
      WALKER,
      attempt(),
    );
    await updateSecurityTxt(
      txt.security_txt.txt_id,
      { contact: "mailto:security@walk.example" },
      WALKER,
    );
    await retireSecurityTxt(txt.security_txt.txt_id, WALKER);
    const page = await readDomains();
    expect(page.domains).toHaveLength(2);
    expect(page.rules.signing).toMatchObject({ key: "signing-life" });
    const summary = await readRegisters();
    expect(summary.rows[0]).toMatchObject({ key: "incidents", records: 0 });
    expect(summary.rows[2]).toMatchObject({ key: "domains", records: 6 });
    const overview = await readDataOverview();
    expect(overview.due.some((item) => item.kind === "domain")).toBe(true);
    await expect(addDomain({ name: "nas.local" }, WALKER, attempt())).rejects.toMatchObject({
      status: 400,
      message: "Type a public hostname, such as www.example.com.",
    });
  });
});
