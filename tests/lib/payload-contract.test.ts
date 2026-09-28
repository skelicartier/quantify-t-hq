import { existsSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it, vi } from "vitest";

/**
 * Every read the portal makes, parsed with its own zod schema against a payload the
 * REAL service produced. The route-parity test compares routes and methods; this one
 * compares shapes — the gap through which `hq/me` once shipped without a field the
 * schema required, and every signed-in page redirected to sign-in while the mock
 * (which had the field) passed every check.
 *
 * The payloads come from the sibling product checkout, written there by
 * `tests/test_hq_payload_samples.py` on every run of the service's suite: one sample
 * per read route as the Owner, and the money-gated ones as the intern as well. Absent
 * the file, the comparison is skipped loudly rather than passed silently.
 */

type Fixture = {
  ids: Record<string, string>;
  owner: Record<string, unknown>;
  intern: Record<string, unknown>;
};

const FIXTURE_FILE = resolve(
  process.cwd(),
  "../Quantify Terminal/tests/fixtures/hq_payload_samples.json",
);

const shared = vi.hoisted(() => {
  // Hoisted above the imports, so the modules it needs are required here.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const path = require("node:path") as typeof import("node:path");
  const file = path.resolve(
    process.cwd(),
    "../Quantify Terminal/tests/fixtures/hq_payload_samples.json",
  );
  const state: { role: "owner" | "intern"; fixture: Fixture | null; hits: string[] } = {
    role: "owner",
    fixture: null,
    hits: [],
  };
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require("node:fs") as typeof import("node:fs");
    if (fs.existsSync(file)) state.fixture = JSON.parse(fs.readFileSync(file, "utf8")) as Fixture;
  } catch {
    state.fixture = null;
  }
  return state;
});

vi.mock("@/lib/api/core", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/api/core")>();
  return {
    ...actual,
    fetchHqJson: async (
      route: string,
      schema: { parse: (value: unknown) => unknown },
      options: { query?: Record<string, string> | undefined } = {},
    ) => {
      const set = shared.fixture?.[shared.role] ?? {};
      const query = Object.entries(options.query ?? {})
        .filter(([, value]) => value !== "")
        .map(([name, value]) => `${name}=${value}`)
        .join("&");
      const keyed = query ? `${route}?${query}` : route;
      const payload = keyed in set ? set[keyed] : set[route];
      if (payload === undefined) throw new Error(`no sampled payload for ${keyed}`);
      shared.hits.push(keyed in set ? keyed : route);
      return schema.parse(payload);
    },
  };
});

import * as auth from "@/lib/api/auth";
import * as crm from "@/lib/api/crm";
import * as deals from "@/lib/api/deals";
import * as home from "@/lib/api/home";
import * as integrations from "@/lib/api/integrations";
import * as keys from "@/lib/api/keys";
import * as meetings from "@/lib/api/meetings";
import * as reports from "@/lib/api/reports";
import * as revenue from "@/lib/api/revenue";
import * as settings from "@/lib/api/settings";
import * as staff from "@/lib/api/staff";
import * as team from "@/lib/api/team";
import * as tickets from "@/lib/api/tickets";

const fixture = shared.fixture;
const ids = fixture?.ids ?? {};
const token = "hq_test-token";

const OWNER_READS: Array<[string, () => Promise<unknown>]> = [
  ["hq/me", () => auth.readMe(token)],
  ["hq/sessions", () => auth.listSessions(token)],
  ["hq/home", () => home.readHome(token)],
  ["hq/roles/matrix", () => staff.readRolesMatrix(token)],
  ["hq/directory", () => staff.readDirectory(token)],
  ["hq/staff", () => staff.listStaff(token)],
  ["hq/staff/{staff_id}", () => staff.readStaffMember(token, ids.staff_id!)],
  ["hq/audit", () => staff.searchAudit(token, {}, { limit: 50, offset: 0 })],
  ["hq/api-keys", () => keys.readApiKeys(token)],
  ["hq/tickets", () => tickets.readQueue(token, {})],
  ["hq/tickets/{ticket_id}", () => tickets.readTicket(token, ids.ticket_id!)],
  ["hq/tickets/{ticket_id}/context", () => tickets.readTicketContext(token, ids.ticket_id!)],
  ["hq/saved-replies", () => tickets.listSavedReplies(token)],
  ["hq/companies", () => crm.readCompanies(token)],
  ["hq/companies/{company_id}", () => crm.readCompany(token, ids.company_id!)],
  ["hq/people", () => crm.readPeople(token)],
  ["hq/people/{person_id}", () => crm.readPerson(token, ids.person_id!)],
  ["hq/leads", () => crm.readLeads(token)],
  ["hq/leads/{lead_id}", () => crm.readLead(token, ids.lead_id!)],
  ["hq/deals", () => deals.readDealsBoard(token)],
  ["hq/deals/{deal_id}", () => deals.readDeal(token, ids.deal_id!)],
  ["hq/activities", () => crm.readActivities(token, { company_id: ids.company_id! })],
  ["hq/tasks", () => crm.readTasks(token)],
  ["hq/meetings", () => meetings.readMeetings(token, "upcoming")],
  ["hq/meetings/{meeting_id}", () => meetings.readMeeting(token, ids.meeting_id!)],
  ["hq/contracts", () => revenue.readContracts(token)],
  ["hq/contracts/{contract_id}", () => revenue.readContract(token, ids.contract_id!)],
  ["hq/revenue/mrr", () => revenue.readMrrBridge(token)],
  ["hq/reports/weekly", () => reports.readWeeklyReport(token, ids.week!)],
  ["hq/settings/crm", () => crm.readCrmSettings(token)],
  ["hq/settings/support", () => settings.readSupportSettings(token)],
  ["hq/webhooks", () => settings.readWebhooks(token)],
  ["hq/retention", () => settings.readRetention(token)],
  ["hq/integrations/calendar", () => integrations.readCalendarStatus(token)],
  ["hq/team", () => team.readTeam(token)],
  ["hq/team/{staff_id}", () => team.readTeamMember(token, ids.staff_id!)],
  ["hq/checkins", () => team.readCheckins(token)],
  ["hq/time-off", () => team.readTimeOff(token)],
  ["hq/certificates", () => team.readCertificates(token)],
  ["hq/access-reviews", () => team.readAccessReviews(token)],
  ["hq/access-reviews/{review_id}", () => team.readAccessReview(token, ids.review_id!)],
];

const INTERN_READS: Array<[string, () => Promise<unknown>]> = [
  ["hq/me", () => auth.readMe(token)],
  ["hq/home", () => home.readHome(token)],
  ["hq/companies", () => crm.readCompanies(token)],
  ["hq/companies/{company_id}", () => crm.readCompany(token, ids.company_id!)],
  ["hq/deals", () => deals.readDealsBoard(token)],
  ["hq/deals/{deal_id}", () => deals.readDeal(token, ids.deal_id!)],
  ["hq/checkins", () => team.readCheckins(token)],
  ["hq/time-off", () => team.readTimeOff(token)],
];

describe("every portal read parses the service's own payload", () => {
  it("has the sampled payloads from the sibling checkout", () => {
    if (!existsSync(FIXTURE_FILE)) {
      console.warn(
        `payload-contract: ${FIXTURE_FILE} is absent; run the service's tests first — SKIPPED`,
      );
    }
    expect(fixture === null || typeof fixture.owner === "object").toBe(true);
  });

  describe.skipIf(!fixture)("as the Owner", () => {
    for (const [route, read] of OWNER_READS) {
      it(route, async () => {
        shared.role = "owner";
        await expect(read()).resolves.toBeTruthy();
      });
    }
  });

  describe.skipIf(!fixture)("as the intern", () => {
    for (const [route, read] of INTERN_READS) {
      it(route, async () => {
        shared.role = "intern";
        await expect(read()).resolves.toBeTruthy();
      });
    }
  });

  it.skipIf(!fixture)("leaves no sampled Owner payload unparsed", () => {
    const sampled = Object.keys(fixture!.owner).map((key) => key.split("?")[0]!);
    const parsed = new Set(shared.hits.map((key) => key.split("?")[0]!));
    const missed = sampled.filter((route) => !parsed.has(route));
    expect(missed, `sampled but never parsed by any client function: ${missed.join(", ")}`).toEqual(
      [],
    );
  });
});
