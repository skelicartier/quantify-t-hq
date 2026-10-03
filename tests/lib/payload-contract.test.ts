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
  /** Reads made without a session: the recipient's stop page. */
  anonymous?: Record<string, unknown>;
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
  const state: {
    role: "owner" | "intern" | "anonymous";
    fixture: Fixture | null;
    hits: string[];
  } = {
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
import * as inboxApi from "@/lib/api/inbox";
import * as integrations from "@/lib/api/integrations";
import * as approvals from "@/lib/api/approvals";
import * as keys from "@/lib/api/keys";
import * as mail from "@/lib/api/mail";
import * as meetings from "@/lib/api/meetings";
import * as reports from "@/lib/api/reports";
import * as revenue from "@/lib/api/revenue";
import * as inspectionApi from "@/lib/api/inspection";
import * as privacyApi from "@/lib/api/privacy";
import * as receivablesApi from "@/lib/api/receivables";
import * as successApi from "@/lib/api/success";
import * as statusApi from "@/lib/api/status";
import * as privilegedApi from "@/lib/api/privileged";
import * as aiApi from "@/lib/api/ai";
import * as platformApi from "@/lib/api/platform";
import * as security from "@/lib/api/security";
import * as settings from "@/lib/api/settings";
import * as staff from "@/lib/api/staff";
import * as team from "@/lib/api/team";
import * as tickets from "@/lib/api/tickets";
import * as trustApi from "@/lib/api/trust";
import * as financeApi from "@/lib/api/finance";
import * as quotesApi from "@/lib/api/quotes";
import * as relApi from "@/lib/api/relationships";
import * as kbApi from "@/lib/api/knowledge";
import * as controlsApi from "@/lib/api/controls";
import * as centreApi from "@/lib/api/trust-centre";
import * as hiringApi from "@/lib/api/hiring";
import * as companyApi from "@/lib/api/company";
import * as fieldsApi from "@/lib/api/fields";
import * as autoApi from "@/lib/api/automations";
import * as digestApi from "@/lib/api/digests";

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
  ["hq/approvals", () => approvals.readApprovals(token)],
  ["hq/mail/overview", () => mail.readMailOverview(token)],
  ["hq/mail/senders", () => mail.readSenders(token)],
  ["hq/mail/templates", () => mail.readTemplates(token)],
  ["hq/mail/templates/{template_id}", () => mail.readTemplate(token, ids.mail_template_id!)],
  ["hq/mail/segments", () => mail.readSegments(token)],
  ["hq/mail/campaigns", () => mail.readCampaigns(token)],
  ["hq/mail/campaigns/{campaign_id}", () => mail.readCampaign(token, ids.mail_campaign_id!)],
  ["hq/mail/sequences", () => mail.readSequences(token)],
  ["hq/mail/sequences/{sequence_id}", () => mail.readSequence(token, ids.mail_sequence_id!)],
  ["hq/mail/replies", () => mail.readReplies(token)],
  ["hq/mail/suppressions", () => mail.readSuppressions(token)],
  ["hq/mail/consent", () => mail.readConsent(token, ids.mail_email!)],
  ["hq/mail/report", () => mail.readMailReport(token, 30)],
  ["hq/mail/messages/{message_id}", () => mail.readMessage(token, ids.mail_message_id!)],
  ["hq/mail/history", () => mail.readMailHistory(token, ids.mail_email!)],
  ["hq/settings/mail", () => mail.readMailSettings(token)],
  ["hq/mail/lists", () => mail.readLists(token)],
  ["hq/mail/lists/{list_id}", () => mail.readList(token, ids.mail_list_id!)],
  ["hq/security/events", () => security.readSecurityEvents(token)],
  ["hq/me/devices", () => security.readMyDevices(token)],
  ["hq/security/reads", () => security.readReadWatch(token)],
  ["hq/inbox", () => inboxApi.readInbox(token)],
  ["hq/receivables", () => receivablesApi.readReceivables(token)],
  ["hq/invoices", () => receivablesApi.readInvoices(token)],
  ["hq/invoices/{invoice_id}", () => receivablesApi.readInvoice(token, ids.invoice_id!)],
  ["hq/receipts", () => receivablesApi.readReceipts(token)],
  ["hq/companies/{company_id}/billing", () => receivablesApi.readBilling(token, ids.company_id!)],
  ["hq/privacy/requests", () => privacyApi.readPrivacyRequests(token)],
  [
    "hq/privacy/requests/{request_id}",
    () => privacyApi.readPrivacyRequest(token, ids.privacy_request_id!),
  ],
  ["hq/incidents", () => privacyApi.readIncidents(token)],
  ["hq/incidents/{incident_id}", () => privacyApi.readIncident(token, ids.incident_id!)],
  ["hq/commitments", () => privacyApi.readCommitments(token)],
  [
    "hq/companies/{company_id}/commitments",
    () => privacyApi.readCompanyPrivacy(token, ids.company_id!),
  ],
  ["hq/subprocessors", () => privacyApi.readSubprocessors(token)],
  ["hq/pipeline/changes", () => inspectionApi.readPipelineChanges(token)],
  ["hq/forecast", () => inspectionApi.readForecast(token)],
  ["hq/competitors", () => inspectionApi.readCompetitors(token)],
  ["hq/competitors/{competitor_id}", () => inspectionApi.readCompetitor(token, ids.competitor_id!)],
  ["hq/win-loss", () => inspectionApi.readWinLoss(token)],
  ["hq/success", () => successApi.readSuccess(token)],
  [
    "hq/companies/{company_id}/success",
    () => successApi.readCompanySuccess(token, ids.company_id!),
  ],
  ["hq/feature-requests", () => successApi.readFeatureRequests(token)],
  [
    "hq/feature-requests/{request_id}",
    () => successApi.readFeatureRequest(token, ids.feature_request_id!),
  ],
  ["hq/onboardings", () => successApi.readOnboardings(token)],
  ["hq/status", () => statusApi.readStatusBoard(token)],
  [
    "hq/status/incidents/{incident_id}",
    () => statusApi.readStatusIncident(token, ids.status_incident_id!),
  ],
  ["hq/elevation", () => privilegedApi.readMyElevation(token)],
  ["hq/security/privileged", () => privilegedApi.readPrivileged(token)],
  ["hq/export-quota", () => privilegedApi.readExportQuota(token)],
  ["hq/ai/settings", () => aiApi.readAiSettings(token)],
  ["hq/settings/rules", () => platformApi.readRules(token)],
  ["hq/comments", () => platformApi.readComments(token, "company", ids.company_id!)],
  ["hq/templates", () => platformApi.readTemplates(token)],
  ["hq/outbound-webhooks", () => platformApi.readWebhooks(token)],
  ["hq/outbound-webhooks/{endpoint_id}", () => platformApi.readWebhook(token, ids.endpoint_id!)],
  ["hq/settings/fields", () => fieldsApi.readFields(token)],
  ["hq/digests", () => digestApi.readDigests(token)],
  ["hq/hiring", () => hiringApi.readHiring(token)],
  ["hq/hiring/openings/{opening_id}", () => hiringApi.readOpening(token, ids.opening_id!)],
  ["hq/hiring/applicants/{applicant_id}", () => hiringApi.readApplicant(token, ids.applicant_id!)],
  ["hq/hiring/interviews", () => hiringApi.readInterviews(token)],
  ["hq/company", () => companyApi.readCompany(token)],
  ["hq/controls", () => controlsApi.readControls(token)],
  ["hq/controls/{control_id}", () => controlsApi.readControl(token, ids.control_id!)],
  ["hq/trust-centre", () => centreApi.readTrustCentre(token)],
  ["hq/changelog", () => kbApi.readChangelog(token)],
  ["hq/changelog/{entry_id}", () => kbApi.readEntry(token, ids.entry_id!)],
  ["hq/help", () => kbApi.readHelp(token)],
  ["hq/help/gaps", () => kbApi.readHelpGaps(token)],
  ["hq/help/{article_id}", () => kbApi.readArticle(token, ids.article_id!)],
  ["hq/references", () => relApi.readReferences(token)],
  ["hq/references/{reference_id}", () => relApi.readReference(token, ids.reference_id!)],
  ["hq/companies/{company_id}/reviews", () => relApi.readCompanyReviews(token, ids.company_id!)],
  ["hq/reviews/{review_id}", () => relApi.readReview(token, ids.business_review_id!)],
  ["hq/quotes", () => quotesApi.readQuotes(token)],
  ["hq/quotes/{quote_id}", () => quotesApi.readQuote(token, ids.quote_id!)],
  ["hq/deals/{deal_id}/quotes", () => quotesApi.readDealQuotes(token, ids.deal_id!)],
  ["hq/deals/{deal_id}/plan", () => quotesApi.readDealPlan(token, ids.deal_id!)],
  ["hq/finance/cash", () => financeApi.readCash(token)],
  ["hq/finance/deferred", () => financeApi.readDeferred(token)],
  ["hq/finance/purchases", () => financeApi.readPurchases(token)],
  ["hq/finance/budget", () => financeApi.readBudget(token)],
  ["hq/finance/vendors", () => financeApi.readVendors(token)],
  ["hq/finance/expenses", () => financeApi.readExpenses(token)],
  ["hq/finance/updates", () => financeApi.readInvestorUpdates(token)],
  ["hq/finance/updates/{update_id}", () => financeApi.readInvestorUpdate(token, ids.update_id!)],
  ["hq/automations", () => autoApi.readAutomations(token)],
  ["hq/automations/{automation_id}", () => autoApi.readAutomation(token, ids.automation_id!)],
  ["hq/record-automations", () => autoApi.readRecordAutomations(token, "company", ids.company_id!)],
  ["hq/trust", () => trustApi.readTrustOverview(token)],
  ["hq/trust/risks", () => trustApi.readRisks(token)],
  ["hq/trust/risks/{risk_id}", () => trustApi.readRisk(token, ids.risk_id!)],
  ["hq/trust/findings", () => trustApi.readFindings(token)],
  ["hq/trust/findings/{finding_id}", () => trustApi.readFinding(token, ids.finding_id!)],
  ["hq/trust/changes", () => trustApi.readChanges(token)],
  ["hq/trust/changes/{change_id}", () => trustApi.readChange(token, ids.change_id!)],
  ["hq/trust/continuity", () => trustApi.readContinuity(token)],
  ["hq/trust/suppliers", () => trustApi.readSuppliers(token)],
  [
    "hq/trust/suppliers/{subprocessor_id}",
    () => trustApi.readSupplier(token, ids.subprocessor_id!),
  ],
  ["hq/trust/answers", () => trustApi.readAnswers(token)],
  ["hq/trust/answers/{answer_id}", () => trustApi.readAnswer(token, ids.answer_id!)],
  ["hq/trust/processing", () => trustApi.readProcessing(token)],
  ["hq/trust/processing/{activity_id}", () => trustApi.readActivity(token, ids.activity_id!)],
  [
    "hq/subprocessors/{subprocessor_id}",
    () => privacyApi.readSubprocessor(token, ids.subprocessor_id!),
  ],
  ["hq/me/notifications", () => inboxApi.readNotificationPrefs(token)],
  [
    "hq/subscriptions/company/{company_id}",
    () => inboxApi.readSubscription(token, "company", ids.company_id!),
  ],
  ["hq/security/decoys", () => security.readDecoys(token)],
  [
    "hq/records/company/{company_id}/reads",
    () => security.readRecordReads(token, "company", ids.company_id!),
  ],
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
  ["hq/leads/imports", () => crm.readLeadImports(token)],
  ["hq/leads/suggestions", () => crm.readLeadSuggestions(token)],
  ["hq/settings/leads", () => crm.readLeadSettings(token)],
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
  ["hq/elevation", () => privilegedApi.readMyElevation(token)],
  ["hq/company", () => companyApi.readCompany(token)],
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

  describe.skipIf(!fixture?.anonymous)("without a session", () => {
    it("public/mail/unsubscribe/{token}", async () => {
      shared.role = "anonymous";
      await expect(mail.readUnsubscribe(ids.unsubscribe_token!)).resolves.toBeTruthy();
    });
    it("public/audit/{token}", async () => {
      shared.role = "anonymous";
      await expect(controlsApi.readAuditView(ids.auditor_token!)).resolves.toBeTruthy();
    });
    it("public/careers", async () => {
      shared.role = "anonymous";
      await expect(hiringApi.readPublicCareers()).resolves.toBeTruthy();
    });
    it("public/trust-centre", async () => {
      shared.role = "anonymous";
      await expect(centreApi.readPublicTrustCentre()).resolves.toBeTruthy();
    });
    it("public/changelog", async () => {
      shared.role = "anonymous";
      await expect(kbApi.readPublicChangelog()).resolves.toBeTruthy();
    });
    it("public/status", async () => {
      shared.role = "anonymous";
      const page = await statusApi.readPublicStatus();
      // The public page never says who posted an update.
      expect(JSON.stringify(page)).not.toContain("posted_by");
    });
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
