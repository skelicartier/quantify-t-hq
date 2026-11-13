// @vitest-environment node
import { createHash, randomUUID } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { LeadSource } from "../../scripts/data/leads/types";
import { firmKeyOf, leadIdOf } from "../../scripts/data/leads/types";
import { FIRMS, heldBackText, leadFileText } from "../../scripts/data/leads/walk-seed";
import { WALKER, peopleCsv, startKit, type Kit } from "./leads-kit";

/**
 * The leads index (spec §3.7): built from Mail merge's lists and every version of the
 * lead files, in order, one lead per address, grouped by firm, never dropping anyone.
 */

let kit: Kit | null = null;
afterEach(() => {
  kit?.close();
  kit = null;
});

function sourceFor(
  fileId: string,
  title: string,
  role: LeadSource["role"],
  reason = "",
): LeadSource {
  return {
    source_id: randomUUID(),
    file_id: fileId,
    role,
    reason,
    added_at: new Date().toISOString(),
    added_by: WALKER,
    state: "waiting",
    detail: "",
    title,
    read: null,
  };
}

/** Sources as if they had been added before this start, so the first build reads them. */
function writeSources(dir: string, sources: LeadSource[]): void {
  mkdirSync(join(dir, "data", "leads"), { recursive: true, mode: 0o700 });
  writeFileSync(join(dir, "data", "leads", "sources.json"), JSON.stringify(sources));
}

describe("the leads index", () => {
  it("builds 66,000 invented leads in about 4,000 firms under the budget", async () => {
    const started = performance.now();
    kit = await startKit({
      before: (_engine, files, dir) => {
        const first = files.add("all_leads.csv", leadFileText(0, 40_000));
        const second = files.add("new_leads.csv", leadFileText(40_000, 66_000));
        writeSources(dir, [
          sourceFor(first.file_id, first.title, "leads"),
          sourceFor(second.file_id, second.title, "leads"),
        ]);
      },
    });
    const took = performance.now() - started;
    // The budget is 10 s on the founder's Mac; the bound here allows a slow machine.
    expect(took).toBeLessThan(30_000);
    console.log(`[leads-index] 66,000 leads read and built in ${Math.round(took)} ms`);
    const index = kit.module.index;
    expect(index.size).toBe(66_000);
    // One in twenty is on inbox.example, marked personal-domain: never grouped. Those firms
    // whose every person is such an address have no key at all.
    expect(index.byFirm.size).toBe(FIRMS - FIRMS / 20);
    const personal = index.byEmail.get("vikram.shah19@inbox.example")!;
    expect(personal.fields.email_kind).toBe("personal-domain");
    expect(personal.firm_key).toBe("");
    const named = index.byEmail.get("asha.rao0@firm0.example")!;
    expect(named.firm_key).toBe("firm0.example");
    expect(index.byFirm.get("firm0.example")!.length).toBeGreaterThan(10);
    for (const source of kit.module.sources) expect(source.state).toBe("read");
    expect(kit.module.sources.map((source) => source.read?.leads)).toEqual([40_000, 26_000]);
  }, 120_000);

  it("reads its sources in order: a later value fills or replaces, never blanks; an edit wins", async () => {
    let fileId = "";
    kit = await startKit({
      before: (engine, files, dir) => {
        engine.importList({
          name: "Walk 01",
          file_name: "walk-01.csv",
          text: peopleCsv([
            { email: "asha@peak.example", title: "Partner", company: "Peak Capital" },
            { email: "ben@nine.example", title: "Analyst", company: "Nine Ventures" },
          ]),
        });
        const file = files.add(
          "all_leads.csv",
          [
            "email,full_name,title,company,city",
            "asha@peak.example,Asha Rao,,Peak Capital Advisors,Pune",
            "chandra@solo.example,Chandra Iyer,Principal,Solo Fund,Delhi",
          ].join("\n"),
        );
        fileId = file.file_id;
        writeSources(dir, [sourceFor(file.file_id, file.title, "leads")]);
      },
    });
    const index = kit.module.index;
    const asha = index.byEmail.get("asha@peak.example")!;
    expect(asha.fields.title).toBe("Partner"); // the file's empty title does not blank the list's
    expect(asha.fields.company).toBe("Peak Capital Advisors"); // the file's comes later and wins
    expect(asha.fields.city).toBe("Pune"); // and fills what the list did not have
    expect(asha.name).toBe("Asha Rao");
    expect(asha.lists).toHaveLength(1);
    expect(asha.files).toHaveLength(1);
    expect(index.size).toBe(3);

    // A manual lead comes after the files, and an edit after everything.
    kit.leads.addManual({
      email: "dev@new.example",
      values: { title: "Analyst" },
      origin: "hand",
      referred_by: null,
      by: WALKER,
    });
    const edited = await kit.ask("POST", `/data/leads/${leadIdOf("asha@peak.example")}/update`, {
      by: WALKER,
      field: "title",
      value: "Managing partner",
    });
    expect(edited.status).toBe(200);
    kit.files!.addVersion(
      fileId,
      [
        "email,full_name,title,company,city",
        "asha@peak.example,Asha Rao,Head of research,Peak Capital Advisors,Pune",
        "chandra@solo.example,Chandra Iyer,Principal,Solo Fund,Delhi",
        "dev@new.example,Dev Menon,Partner,New Fund,Mumbai",
      ].join("\n"),
    );
    await kit.settle();
    const after = kit.module.index;
    expect(after.byEmail.get("asha@peak.example")!.fields.title).toBe("Managing partner");
    expect(after.byEmail.get("asha@peak.example")!.edited).toEqual(["title"]);
    const dev = after.byEmail.get("dev@new.example")!;
    expect(dev.fields.title).toBe("Analyst"); // the manual record wins over the file
    expect(dev.fields.company).toBe("New Fund"); // and the file fills what it lacked
  });

  it("keeps every row an older version had, marked stale, when a new version drops it (L7)", async () => {
    let fileId = "";
    kit = await startKit({
      before: (_engine, files, dir) => {
        const file = files.add("all_leads.csv", leadFileText(0, 1_000));
        fileId = file.file_id;
        writeSources(dir, [sourceFor(file.file_id, file.title, "leads")]);
      },
    });
    expect(kit.module.index.size).toBe(1_000);
    // Version 2: 120 rows fewer.
    kit.files!.addVersion(
      fileId,
      leadFileText(0, 1_000, (index) => index >= 880),
    );
    await kit.settle();
    const index = kit.module.index;
    expect(index.size).toBe(1_000);
    const stale = index.all.filter((lead) => lead.files.some((ref) => ref.stale));
    expect(stale).toHaveLength(120);
    const dropped = stale[0]!;
    const detail = (await kit.ask("GET", `/data/leads/${dropped.lead_id}`)).body.lead as {
      stale_in: string | null;
      stale_seen_in: number | null;
      sources: { label: string }[];
    };
    expect(detail.stale_in).toBe("all_leads.csv");
    expect(detail.stale_seen_in).toBe(1);
    expect(detail.sources[0]!.label).toMatch(/^all_leads\.csv, version 1, row \d+$/);
    const kept = index.all.find((lead) => !lead.files[0]!.stale)!;
    expect(kept.files[0]!.n).toBe(2);
    expect(kit.module.sources[0]!.read).toMatchObject({ version_n: 2, rows: 880, leads: 880 });
  });

  it("holds back the people a held-back file names, and keeps them in All", async () => {
    kit = await startKit({
      before: (_engine, files, dir) => {
        const leadsFile = files.add("all_leads.csv", leadFileText(500, 520));
        const held = files.add(
          "held_back.csv",
          `${heldBackText(5, 500).trimEnd()}\r\nonly.held@hold.example,Only Held,Hold Co\r\n`,
        );
        writeSources(dir, [
          sourceFor(leadsFile.file_id, leadsFile.title, "leads"),
          sourceFor(held.file_id, held.title, "held_back", "Not a buyer"),
        ]);
      },
    });
    const rows = (await kit.ask("GET", "/data/leads?status=held_back")).body as {
      leads: { email: string; status: string; status_detail: string }[];
      total: number;
    };
    expect(rows.total).toBe(6); // five from the lead file, and one only the held-back file has
    expect(rows.leads.every((lead) => lead.status_detail === "Not a buyer")).toBe(true);
    expect(rows.leads.map((lead) => lead.email)).toContain("only.held@hold.example");
    const all = (await kit.ask("GET", "/data/leads")).body as { total: number };
    expect(all.total).toBe(21); // held-back people stay in "All"
  });

  it("does not group free mail or personal-domain addresses, and keeps one stable id", async () => {
    expect(firmKeyOf("someone@gmail.com")).toBe("");
    expect(firmKeyOf("someone@rediffmail.com")).toBe("");
    expect(firmKeyOf("someone@firm.example", "personal-domain")).toBe("");
    expect(firmKeyOf("someone@firm.example", "named")).toBe("firm.example");
    const email = "asha@peak.example";
    expect(leadIdOf(email)).toBe(
      createHash("sha256").update(`lead:${email}`).digest("hex").slice(0, 32),
    );
    expect(leadIdOf(email)).toMatch(/^[0-9a-f]{32}$/);
    kit = await startKit({
      before: (engine) => {
        engine.importList({
          name: "Walk 01",
          file_name: "walk-01.csv",
          text: peopleCsv([{ email }, { email: "ben@gmail.com" }, { email: "chandra@gmail.com" }]),
        });
      },
    });
    const ben = kit.module.index.byEmail.get("ben@gmail.com")!;
    expect(ben.firm_key).toBe("");
    expect(kit.module.index.byFirm.has("gmail.com")).toBe(false);
    const id = kit.module.index.byEmail.get(email)!.lead_id;
    await kit.ask("POST", "/data/leads/read-again", { by: WALKER });
    await kit.settle();
    expect(kit.module.index.byEmail.get(email)!.lead_id).toBe(id);
    const detail = (await kit.ask("GET", `/data/leads/${ben.lead_id}`)).body.lead as {
      firm: { free_mail: boolean; total: number };
    };
    expect(detail.firm).toMatchObject({ free_mail: true, total: 1 });
  });

  it("keeps a file's leads after the file leaves Files", async () => {
    let fileId = "";
    let dir = "";
    kit = await startKit({
      before: (_engine, files, folder) => {
        dir = folder;
        const file = files.add("all_leads.csv", leadFileText(0, 50));
        fileId = file.file_id;
        writeSources(folder, [sourceFor(file.file_id, file.title, "leads")]);
      },
    });
    expect(kit.module.index.size).toBe(50);
    kit.files!.forget(fileId);
    await kit.ask("POST", "/data/leads/read-again", { by: WALKER });
    await kit.settle();
    expect(kit.module.index.size).toBe(50);
    expect(kit.module.sources[0]!.detail).toBe(
      "The file is no longer in Files; the leads it brought are kept.",
    );
    expect(dir).not.toBe("");
  });
});
