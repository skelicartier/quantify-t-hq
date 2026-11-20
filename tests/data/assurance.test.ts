// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { WALKER, startStack, type Stack } from "./helpers";

/**
 * Certification, insurance and management reviews (ws-notes/security/spec.md §5.4, §8.5):
 * the stage audit in Due from 14 days before, surveillance audits 12 and 24 months after
 * issue from 60 days before, the expiry 36 months after from 90; cover in Due from 30 days
 * before it ends and "Cover ended" after it with no renewal; the next review 12 months after
 * the last from 30 days before, and each action from 7; the calendar's items; the Summary's
 * own lines; `usedFor`; evidence. The module's day is pinned so §5.4's days hold on any day.
 * The body, the insurer and every number are invented.
 */

type Body = Record<string, unknown>;
const pdf = (what: string) => Buffer.from(`%PDF-1.4\n% An invented ${what}.\n`).toString("base64");

describe("certification, insurance and reviews", () => {
  let stack: Stack;
  beforeAll(async () => {
    stack = await startStack({ modules: ["files", "assurance"] });
  }, 60_000);
  afterAll(() => stack.stop());

  const post = (path: string, body: Body = {}) => stack.ask("POST", path, { by: WALKER, ...body });
  const pin = (day: string) => post("/data/_test/assurance/today", { day });
  const message = (answer: { json?: Body | null }) =>
    ((answer.json?.error ?? {}) as { message?: string }).message ?? "";
  const due = async (kind: string) =>
    ((await stack.ask("GET", "/data/overview?due=all")).json!.due as Body[]).filter(
      (item) => item.kind === kind,
    );
  const lookup = async (query = "") =>
    (await stack.ask("GET", `/data/_test/assurance/lookup${query}`)).json!;
  const line = async (key: string) =>
    ((await lookup()).summary as Body[]).find((item) => item.key === key)!;
  const agenda = async () =>
    (await stack.ask("GET", "/data/_test/assurance/agenda")).json!.items as Body[];

  let certId = "";

  it("starts empty, and its own Summary lines say what to add", async () => {
    await pin("2026-11-20");
    expect((await lookup()).summary).toEqual([
      {
        key: "certification",
        area: "assurance",
        title: "Certification",
        words: "No certification recorded. Buyers accept ‘working towards’ with an auditor named.",
        attention: false,
        href: "/data/assurance/certification",
      },
      {
        key: "insurance",
        area: "assurance",
        title: "Insurance",
        words:
          "No insurance recorded. Buyers ask for cyber and professional indemnity cover first.",
        attention: false,
        href: "/data/assurance/insurance",
      },
      {
        key: "review",
        area: "assurance",
        title: "Management review",
        words: "No management review recorded.",
        attention: false,
        href: "/data/assurance/reviews",
      },
    ]);
    expect(await agenda()).toEqual([]);
  });

  it("a Stage 1 audit on 10 Feb 2027: in Due from 27 Jan 2027", async () => {
    expect(message(await post("/data/assurance/certifications", { standard: "iso9001" }))).toBe(
      "Choose the standard from the list.",
    );
    expect(message(await post("/data/assurance/certifications", { standard: "other" }))).toBe(
      "Name the standard, in at most 120 characters.",
    );
    const made = await post("/data/assurance/certifications", {
      standard: "iso27001",
      status: "planning",
      body: "Walk Certification Body",
      accredited_by: "NABCB",
      consultant: "Walk Consulting",
      scope: "The walk app, its cloud and the team that runs it",
      stage1_on: "2027-02-10",
      attempt: crypto.randomUUID(),
    });
    expect(made.status, message(made)).toBe(200);
    const cert = made.json!.certification as Body & { cert_id: string };
    certId = cert.cert_id;
    expect(cert).toMatchObject({
      standard_words: "ISO 27001",
      status_label: "Planning",
      words: "ISO 27001: Stage 1 on 10 Feb 2027 with Walk Certification Body.",
      next_audit: { key: "stage1", on: "2027-02-10" },
    });
    expect((await line("certification")).words).toBe(
      "ISO 27001: Stage 1 on 10 Feb 2027 with Walk Certification Body.",
    );
    await pin("2027-01-26");
    expect(await due("certification")).toEqual([]);
    await pin("2027-01-27");
    expect(await due("certification")).toEqual([
      {
        key: `certification:${certId}:stage1`,
        kind: "certification",
        title: "Stage 1 audit for ISO 27001",
        sub: "Walk Certification Body",
        due_on: "2027-02-10",
        href: `/data/assurance/certification/${certId}`,
      },
    ]);
    expect(await agenda()).toEqual([
      {
        key: `certification:${certId}:stage1`,
        kind: "certification",
        title: "Stage 1 audit for ISO 27001",
        plain: "Certification audit",
        sub: "Walk Certification Body",
        on: "2027-02-10",
        remind_days: [14, 3],
        href: `/data/assurance/certification/${certId}`,
      },
    ]);
  });

  it("issued 15 Jan 2027: surveillance on 15 Jan 2028 and 2029, expiry on 15 Jan 2030", async () => {
    await pin("2027-03-01");
    expect(
      message(
        await post(`/data/assurance/certifications/${certId}/update`, {
          issued_on: "2027-01-15",
          expires_on: "2027-01-10",
        }),
      ),
    ).toBe("It must expire after it was issued.");
    const certified = await post(`/data/assurance/certifications/${certId}/update`, {
      status: "certified",
      issued_on: "2027-01-15",
      certificate_number: "WALK-CERT-0001",
      content: pdf("certificate"),
      name: "walk-certificate.pdf",
    });
    expect(certified.status, message(certified)).toBe(200);
    const cert = certified.json!.certification as Body & { certificate_file_id: string };
    expect(cert.expiry).toBe("2030-01-15");
    expect((cert.days as Body[]).map((day) => [day.key, day.on])).toEqual([
      ["s1", "2028-01-15"],
      ["s2", "2029-01-15"],
      ["expiry", "2030-01-15"],
    ]);
    expect(cert.words).toBe("ISO 27001: certified by Walk Certification Body until 15 Jan 2030.");
    await pin("2027-11-15");
    expect(await due("certification")).toEqual([]);
    await pin("2027-11-16");
    expect(await due("certification")).toEqual([
      expect.objectContaining({
        key: `certification:${certId}:s1`,
        title: "Surveillance audit 1 for ISO 27001",
        due_on: "2028-01-15",
      }),
    ]);
    const held = await post(`/data/assurance/certifications/${certId}/surveillance/1`, {
      held_on: "2027-11-16",
      outcome: "No nonconformities.",
    });
    expect(held.status, message(held)).toBe(200);
    expect(await due("certification")).toEqual([]);
    expect(message(await post(`/data/assurance/certifications/${certId}/surveillance/3`, {}))).toBe(
      "Choose surveillance audit 1 or 2.",
    );
    await pin("2028-11-16");
    expect((await due("certification")).map((row) => row.key)).toEqual([
      `certification:${certId}:s2`,
    ]);
    await post(`/data/assurance/certifications/${certId}/surveillance/2`, {
      held_on: "2028-11-16",
    });
    await pin("2029-10-16");
    expect(await due("certification")).toEqual([]);
    await pin("2029-10-17");
    expect(await due("certification")).toEqual([
      expect.objectContaining({
        key: `certification:${certId}:expiry`,
        title: "ISO 27001 certificate expires 15 Jan 2030",
        due_on: "2030-01-15",
      }),
    ]);
    expect((await lookup(`?file_id=${cert.certificate_file_id}`)).used_for).toEqual([
      {
        label: "The ISO 27001 certificate, in Certification",
        href: `/data/assurance/certification/${certId}`,
      },
    ]);
    const option = ((await lookup()).evidence as Body[]).find(
      (item) => item.ref === `assurance:certification:${certId}`,
    );
    expect(option).toMatchObject({
      label: "ISO 27001 certificate WALK-CERT-0001, to 15 Jan 2030",
      current: true,
    });
  });

  it("cyber cover to 31 Mar 2027: in Due from 1 Mar 2027, ended on 1 Apr 2027, renewed", async () => {
    await pin("2026-11-20");
    expect(message(await post("/data/assurance/insurance", { kind: "cyber", insurer: "" }))).toBe(
      "Name the insurer, in at most 120 characters.",
    );
    expect(
      message(
        await post("/data/assurance/insurance", {
          kind: "cyber",
          insurer: "Walk Insurance",
          starts_on: "2026-04-01",
          ends_on: "2026-03-31",
        }),
      ),
    ).toBe("The cover must end after it starts.");
    expect(
      message(
        await post("/data/assurance/insurance", {
          kind: "cyber",
          insurer: "Walk Insurance",
          cover: "a lot",
        }),
      ),
    ).toBe("Type the amount as a number, such as 1180.50.");
    const made = await post("/data/assurance/insurance", {
      kind: "cyber",
      insurer: "Walk Insurance",
      policy_number: "WALK-POL-0001",
      cover: "50,00,000",
      currency: "INR",
      premium: "42000",
      starts_on: "2026-04-01",
      ends_on: "2027-03-31",
      broker: "Walk Brokers",
      attempt: crypto.randomUUID(),
    });
    expect(made.status, message(made)).toBe(200);
    const policy = made.json!.insurance as Body & { insurance_id: string };
    expect(policy).toMatchObject({
      cover_label: "Cyber",
      cover_words: "Cover to 31 Mar 2027",
      amount_words: "₹50,00,000",
      policy_number: "WALK-POL-0001",
      ended_unrenewed: false,
    });
    expect((await line("insurance")).words).toBe(
      "Cyber cover to 31 Mar 2027 with Walk Insurance; no professional indemnity recorded.",
    );
    await pin("2027-02-28");
    expect(await due("insurance")).toEqual([]);
    await pin("2027-03-01");
    expect(await due("insurance")).toEqual([
      {
        key: `insurance:${policy.insurance_id}`,
        kind: "insurance",
        title: "Renew the cyber insurance with Walk Insurance",
        sub: "Cover to 31 Mar 2027",
        due_on: "2027-03-31",
        href: `/data/assurance/insurance#insurance-${policy.insurance_id}`,
      },
    ]);
    await pin("2027-04-01");
    const rows = (await stack.ask("GET", "/data/assurance/insurance")).json!.insurance as Body[];
    expect(rows[0]).toMatchObject({
      cover_words: "Cover ended 31 Mar 2027.",
      ended_unrenewed: true,
    });
    expect(await line("insurance")).toMatchObject({
      words:
        "Cyber cover ended 31 Mar 2027 with Walk Insurance; no professional indemnity recorded.",
      attention: true,
    });
    const renewed = await post(`/data/assurance/insurance/${policy.insurance_id}/renew`, {
      starts_on: "2027-04-01",
      ends_on: "2028-03-31",
      policy_number: "WALK-POL-0002",
      attempt: crypto.randomUUID(),
    });
    expect(renewed.status, message(renewed)).toBe(200);
    expect(renewed.json!.insurance).toMatchObject({
      kind: "cyber",
      insurer: "Walk Insurance",
      renewed_from: policy.insurance_id,
      cover_words: "Cover to 31 Mar 2028",
    });
    expect(await due("insurance")).toEqual([]);
    expect(await line("insurance")).toMatchObject({
      words: "Cyber cover to 31 Mar 2028 with Walk Insurance; no professional indemnity recorded.",
      attention: false,
    });
    expect(message(await post(`/data/assurance/insurance/${policy.insurance_id}/renew`, {}))).toBe(
      "That policy has been renewed already.",
    );
    const items = await agenda();
    expect(items.filter((item) => item.kind === "insurance")).toEqual([
      expect.objectContaining({
        plain: "Insurance renewal",
        on: "2028-03-31",
        remind_days: [14, 3],
      }),
    ]);
  });

  it("a review held 20 Nov 2026: the next by 20 Nov 2027, in Due from 21 Oct 2027; its action from 8 Jan 2027", async () => {
    await pin("2026-11-20");
    expect(message(await post("/data/assurance/reviews", { attendees: "Walk Owner" }))).toBe(
      "Give the day it was held.",
    );
    expect(
      message(
        await post("/data/assurance/reviews", { held_on: "2026-11-20", actions: [{ what: "Go" }] }),
      ),
    ).toBe("Say what is to be done in 3 to 300 characters.");
    const made = await post("/data/assurance/reviews", {
      held_on: "2026-11-20",
      attendees: "Walk Owner, Walk Admin",
      inputs: {
        previous_actions: "None: this is the first review.",
        performance: "Two findings fixed; one restore test.",
        nope: "ignored",
      },
      decisions: "Turn on two-step sign-in everywhere.",
      actions: [
        {
          what: "Walk action: turn on two-step sign-in",
          owner: "Walk Owner",
          due_on: "2027-01-15",
        },
        { what: "", owner: "" },
      ],
      content: pdf("minutes"),
      name: "walk-minutes.pdf",
      attempt: crypto.randomUUID(),
    });
    expect(made.status, message(made)).toBe(200);
    const review = made.json!.review as Body & {
      review_id: string;
      actions: { action_id: string }[];
      minutes_file_id: string;
    };
    expect(review).toMatchObject({
      inputs: {
        previous_actions: "None: this is the first review.",
        performance: "Two findings fixed; one restore test.",
      },
      actions_open: 1,
    });
    expect(Object.keys(review.inputs as Body)).toEqual(["previous_actions", "performance"]);
    expect(await line("review")).toMatchObject({
      words: "Last management review 20 Nov 2026; next due 20 Nov 2027.",
      attention: false,
    });
    await pin("2027-01-07");
    expect(await due("management_review")).toEqual([]);
    await pin("2027-01-08");
    const actionId = review.actions[0]!.action_id;
    expect(await due("management_review")).toEqual([
      {
        key: `management_review:${actionId}`,
        kind: "management_review",
        title: "Walk action: turn on two-step sign-in",
        sub: "From the review of 20 Nov 2026 · Walk Owner",
        due_on: "2027-01-15",
        href: `/data/assurance/reviews/${review.review_id}`,
      },
    ]);
    const done = await post(`/data/assurance/reviews/actions/${actionId}/done`, {});
    expect((done.json!.review as Body).actions_open).toBe(0);
    expect(await due("management_review")).toEqual([]);
    await pin("2027-10-20");
    expect(await due("management_review")).toEqual([]);
    await pin("2027-10-21");
    expect(await due("management_review")).toEqual([
      {
        key: "management_review:next",
        kind: "management_review",
        title: "Hold the management review",
        sub: "Last review 20 Nov 2026",
        due_on: "2027-11-20",
        href: "/data/assurance/reviews",
      },
    ]);
    await pin("2027-11-21");
    expect((await line("review")).attention).toBe(true);
    expect(((await lookup()).evidence as Body[]).at(-1)).toMatchObject({
      ref: `assurance:review:${review.review_id}`,
      label: "Management review of 20 Nov 2026",
      current: false,
      why: "Older than 12 months.",
    });
    expect((await lookup(`?file_id=${review.minutes_file_id}`)).used_for).toEqual([
      {
        label: "Minutes of the management review of 20 Nov 2026",
        href: `/data/assurance/reviews/${review.review_id}`,
      },
    ]);
    const added = await post(`/data/assurance/reviews/${review.review_id}/actions`, {
      what: "Walk action: write the backup policy",
      owner: "Walk Admin",
    });
    expect((added.json!.review as Body).actions_open).toBe(1);
  });

  it("his months between reviews; the calendar's review item", async () => {
    await pin("2026-11-20");
    expect(message(await post("/data/assurance/setup", { review_months: "30" }))).toBe(
      "Type the months as a whole number from 1 to 24.",
    );
    const set = await post("/data/assurance/setup", { review_months: "6" });
    expect(set.json).toMatchObject({ review_months: 6, months: 6 });
    const page = (await stack.ask("GET", "/data/assurance/reviews")).json!;
    expect(page.next).toEqual({
      next_on: "2027-05-20",
      last_held: "2026-11-20",
      months: 6,
      yours: true,
    });
    expect((await agenda()).find((item) => item.kind === "management_review")).toMatchObject({
      plain: "Management review",
      on: "2027-05-20",
    });
    await post("/data/assurance/setup", { review_months: "" });
    expect(((await stack.ask("GET", "/data/assurance/reviews")).json!.next as Body).next_on).toBe(
      "2027-11-20",
    );
  });

  it("one certification's page, with its events", async () => {
    const page = (await stack.ask("GET", `/data/assurance/certifications/${certId}`)).json!;
    expect((page.events as Body[]).map((event) => event.verb)).toEqual([
      "surveillance audit 2",
      "surveillance audit 1",
      "changed",
      "added",
    ]);
    expect((await stack.ask("GET", "/data/assurance/certifications/nope")).status).toBe(404);
  });
});
