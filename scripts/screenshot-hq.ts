/**
 * Walks every HQ screen against the mock service and writes screenshots for review.
 *
 *     npm run mock:hq        (terminal 1)
 *     npm run dev            (terminal 2)
 *     npm run check:hq-ui    (this)
 *
 * Product's screens forward to the console's mock, so run it too, from the console repo:
 *
 *     MOCK_PORT=7072 npm run mock:api
 *
 * Three assertions per page, not just pictures:
 *   - the page answered 200 and rendered its main landmark;
 *   - no horizontal overflow at either width (the phone is not a narrow desktop);
 *   - axe reports zero serious or critical violations.
 *
 * Output: test-results/hq/<width>/<theme>/<name>.png
 */

import { mkdirSync } from "node:fs";
import AxeBuilder from "@axe-core/playwright";
import { chromium, type Browser, type Page } from "playwright";

const BASE = process.env.HQ_UI_BASE ?? "http://127.0.0.1:3000";
const OUT = "test-results/hq";
/** The quarter after today's, for the forecast screens (the current one may end today). */
const NEXT_QUARTER = (() => {
  const now = new Date();
  const index = now.getUTCFullYear() * 4 + Math.floor(now.getUTCMonth() / 3) + 1;
  return `${Math.floor(index / 4)}-Q${(index % 4) + 1}`;
})();
const ALL_WIDTHS = [
  { name: "desktop", width: 1440, height: 900 },
  { name: "phone", width: 412, height: 915 },
] as const;
/**
 * One width at a time when asked (HQ_HARNESS_WIDTHS=desktop or phone): a full walk at
 * both takes about two hours, which is as long as a background task — or the servers
 * under it — may live.
 */
const WIDTHS = ALL_WIDTHS.filter(
  (viewport) =>
    !process.env.HQ_HARNESS_WIDTHS ||
    process.env.HQ_HARNESS_WIDTHS.split(",").includes(viewport.name),
);

type Shot = { name: string; path: string; ready?: string };

/** Records the mock seeds for mail (`MAIL_IDS` in scripts/mock-hq-api.ts). */
const MAIL = {
  september: "ea400000-0000-4000-8000-000000000001",
  october: "ea400000-0000-4000-8000-000000000002",
  webinar: "ea400000-0000-4000-8000-000000000003",
  roadmap: "ea400000-0000-4000-8000-000000000004",
  newsletter: "ea400000-0000-4000-8000-000000000005",
  releaseTemplate: "ea200000-0000-4000-8000-000000000001",
  webinarList: "ea800000-0000-4000-8000-000000000001",
  berlinList: "ea800000-0000-4000-8000-000000000002",
  followUp: "ea400000-0000-4000-8000-000000000006",
  fundIntro: "ea500000-0000-4000-8000-000000000001",
  pmsIntroOne: "ea400000-0000-4000-8000-000000000007",
  pmsIntroTwo: "ea400000-0000-4000-8000-000000000008",
  leadsThisMonth: "ea300000-0000-4000-8000-000000000003",
  // Three September messages whose footer links the public page is walked with: one only
  // looked at, one unsubscribed by its button, one by the mailbox's one-click POST.
  stopLooked: "ea600000-0000-4000-8000-000000000001",
  stopPressed: "ea600000-0000-4000-8000-000000000002",
  stopOneClick: "ea600000-0000-4000-8000-000000000003",
};

const SIGNED_IN_PAGES: Shot[] = [
  { name: "home", path: "/home", ready: "main#main-content" },
  { name: "support-queue", path: "/support", ready: ".desk" },
  { name: "support-following", path: "/support?view=all&following=1", ready: ".desk" },
  { name: "companies-import", path: "/companies/import", ready: ".csv-import" },
  { name: "companies-grouped", path: "/companies?group=lifecycle", ready: ".data-table" },
  {
    name: "companies-peek",
    path: "/companies?peek=c0000000-0000-4000-8000-0000000000fe",
    ready: ".peek",
  },
  { name: "companies-duplicates", path: "/companies/duplicates", ready: "main#main-content" },
  {
    name: "support-ticket",
    path: "/support/sup_00000000000000000004",
    ready: ".thread",
  },
  { name: "support-replies", path: "/support/replies", ready: "main#main-content" },
  { name: "leads", path: "/leads", ready: ".data-table" },
  {
    name: "lead",
    path: "/leads/1e000000-0000-4000-8000-000000000001",
    ready: ".record-layout",
  },
  // Prospects: the lead table worked as a researched list.
  { name: "prospects", path: "/leads/prospects", ready: ".data-table" },
  {
    name: "prospects-filtered",
    path: "/leads/prospects?f=firm_type:is:PMS&f=email_kind:is:named&sort=-fit",
    ready: ".data-table",
  },
  { name: "prospects-page-two", path: "/leads/prospects?offset=100", ready: ".data-table" },
  {
    name: "prospect",
    path: "/leads/1f000001-0000-4000-8000-000000000001",
    ready: ".record-layout",
  },
  { name: "lead-segments", path: "/leads/segments", ready: ".data-table" },
  { name: "lead-import", path: "/leads/import", ready: ".list-import" },
  { name: "lead-fit", path: "/leads/fit", ready: ".fit-rules" },
  { name: "lead-rules", path: "/leads/rules", ready: ".stat-grid" },
  // Data quality: look-alike leads, a merge's choices, the records' health.
  { name: "lead-duplicates", path: "/leads/duplicates", ready: ".dup-groups" },
  { name: "lead-duplicates-crm", path: "/leads/duplicates?reason=crm", ready: ".stat-grid" },
  {
    name: "lead-merge",
    path: "/leads/duplicates/merge?keep=1f000901-0000-4000-8000-000000000001&fold=1f000902-0000-4000-8000-000000000001",
    ready: "#merge-keep",
  },
  { name: "data-health", path: "/data-health", ready: ".stat-grid" },
  { name: "data-health-tidy", path: "/data-health/tidy?kind=name_case", ready: ".data-table" },
  {
    name: "lead-rules-country",
    path: "/leads/rules?country=Germany#country-rule",
    ready: "#cold-country",
  },
  { name: "companies", path: "/companies", ready: ".data-table" },
  {
    name: "company",
    path: "/companies/c0000000-0000-4000-8000-000000000002",
    ready: ".record-layout",
  },
  { name: "people", path: "/people", ready: ".data-table" },
  {
    name: "person",
    path: "/people/p0000000-0000-4000-8000-000000000002",
    ready: ".record-layout",
  },
  { name: "deals-board", path: "/deals", ready: ".board" },
  { name: "deals-table", path: "/deals?view=table", ready: ".data-table" },
  {
    name: "deal",
    path: "/deals/d0000000-0000-4000-8000-000000000001",
    ready: ".stage-rail",
  },
  {
    name: "deal-stuck",
    path: "/deals/d0000000-0000-4000-8000-000000000002",
    ready: ".stage-rail",
  },
  { name: "tasks", path: "/tasks?scope=all", ready: "main#main-content" },
  { name: "meetings", path: "/meetings", ready: ".meeting-list" },
  {
    name: "meeting-owed",
    path: "/meetings/ee100000-0000-4000-8000-000000000002",
    ready: ".record-layout",
  },
  {
    name: "meeting-synced",
    path: "/meetings/ee100000-0000-4000-8000-000000000001",
    ready: ".record-layout",
  },
  { name: "revenue-contracts", path: "/revenue/contracts", ready: ".data-table" },
  {
    name: "revenue-contract",
    path: "/revenue/contracts/cc100000-0000-4000-8000-000000000001",
    ready: ".record-layout",
  },
  { name: "revenue-renewals", path: "/revenue/renewals", ready: ".data-table" },
  {
    name: "company-history",
    path: "/companies/c0000000-0000-4000-8000-000000000002?tab=history",
    ready: ".record-layout",
  },
  { name: "revenue-mrr", path: "/revenue/mrr", ready: ".bridge__svg" },
  { name: "reports", path: "/reports", ready: ".report-grid" },
  { name: "team", path: "/team", ready: ".data-table" },
  {
    name: "team-member",
    path: "/team/aa000000-0000-4000-8000-00000000000e",
    ready: ".record-layout",
  },
  {
    name: "team-member-docs-missing",
    path: "/team/aa000000-0000-4000-8000-00000000000d",
    ready: ".record-layout",
  },
  { name: "checkin", path: "/checkin", ready: ".checkin-form" },
  { name: "time-off", path: "/time-off", ready: "main#main-content" },
  { name: "certificates", path: "/certificates", ready: "main#main-content" },
  { name: "access-review", path: "/access-review", ready: "main#main-content" },
  { name: "admin-integrations", path: "/admin/integrations", ready: "main#main-content" },
  { name: "admin-approvals", path: "/admin/approvals", ready: "main#main-content" },
  { name: "admin-security", path: "/admin/security", ready: "main#main-content" },
  { name: "inbox", path: "/inbox", ready: ".inbox-list, .empty-state" },
  { name: "inbox-done", path: "/inbox?view=done", ready: "main#main-content" },
  { name: "me-notifications", path: "/me/notifications", ready: ".prefs-modes" },
  { name: "revenue-receivables", path: "/revenue/receivables", ready: "main#main-content" },
  {
    name: "company-billing",
    path: "/companies/c0000000-0000-4000-8000-000000000002?tab=billing",
    ready: "main#main-content",
  },
  { name: "deals-changes", path: "/deals/changes", ready: "main#main-content" },
  { name: "deals-changes-30", path: "/deals/changes?days=30", ready: "main#main-content" },
  { name: "deals-forecast", path: "/deals/forecast", ready: "main#main-content" },
  {
    name: "deals-forecast-next",
    path: `/deals/forecast?period=${NEXT_QUARTER}`,
    ready: "main#main-content",
  },
  { name: "deals-competitors", path: "/deals/competitors", ready: "main#main-content" },
  {
    name: "deals-competitor",
    path: "/deals/competitors/cf000001-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  { name: "deals-win-loss", path: "/deals/win-loss", ready: "main#main-content" },
  {
    name: "deal-competition",
    path: "/deals/d0000000-0000-4000-8000-000000000001?tab=competition",
    ready: ".competitor-list, main#main-content",
  },
  { name: "success", path: "/success", ready: "main#main-content" },
  { name: "success-requests", path: "/success/requests", ready: "main#main-content" },
  {
    name: "success-request",
    path: "/success/requests/ce000001-0000-4000-8000-000000000000",
    ready: ".ask-list, main#main-content",
  },
  { name: "success-onboarding", path: "/success/onboarding", ready: "main#main-content" },
  { name: "service-status", path: "/service-status", ready: ".status-components" },
  { name: "admin-privileged", path: "/admin/privileged", ready: "main#main-content" },
  { name: "admin-ai", path: "/admin/ai", ready: "main#main-content" },
  { name: "admin-rules", path: "/admin/rules", ready: "main#main-content" },
  { name: "admin-webhooks", path: "/admin/webhooks", ready: "main#main-content" },
  {
    name: "admin-webhook",
    path: "/admin/webhooks/f4000000-0000-4000-8000-000000000001",
    ready: "main#main-content",
  },
  { name: "task-templates", path: "/tasks/templates", ready: "main#main-content" },
  { name: "admin-fields", path: "/admin/fields", ready: "main#main-content" },
  { name: "admin-automations", path: "/admin/automations", ready: "main#main-content" },
  { name: "me-digests", path: "/me/digests", ready: "main#main-content" },
  { name: "finance", path: "/finance", ready: "main#main-content" },
  { name: "finance-vendors", path: "/finance/vendors", ready: "main#main-content" },
  {
    name: "finance-vendor-decide",
    path: "/finance/vendors/fb000002-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  { name: "finance-updates", path: "/finance/updates", ready: "main#main-content" },
  {
    name: "finance-update",
    path: "/finance/updates/f7000001-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  { name: "expenses", path: "/expenses", ready: "main#main-content" },
  { name: "finance-deferred", path: "/finance/deferred", ready: "main#main-content" },
  { name: "finance-budget", path: "/finance/budget", ready: "main#main-content" },
  { name: "expenses-purchases", path: "/expenses/purchases", ready: "main#main-content" },
  { name: "deals-quotes", path: "/deals/quotes", ready: "main#main-content" },
  { name: "success-references", path: "/success/references", ready: "main#main-content" },
  { name: "success-changelog", path: "/success/changelog", ready: "main#main-content" },
  {
    name: "success-changelog-draft",
    path: "/success/changelog/ab100002-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  { name: "help", path: "/help", ready: "main#main-content" },
  { name: "trust-controls", path: "/trust/controls", ready: "main#main-content" },
  { name: "company-particulars", path: "/company", ready: ".paper" },
  { name: "hiring", path: "/hiring", ready: "main#main-content" },
  {
    name: "hiring-opening",
    path: "/hiring/openings/f1000001-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  {
    name: "hiring-applicant",
    path: "/hiring/applicants/f2000002-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  { name: "hiring-interviews", path: "/hiring/interviews", ready: "main#main-content" },
  {
    name: "trust-control",
    path: "/trust/controls/c7000001-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  { name: "trust-centre-admin", path: "/trust/centre", ready: "main#main-content" },
  { name: "help-gaps", path: "/help/gaps", ready: "main#main-content" },
  {
    name: "help-article-due",
    path: "/help/ab200002-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  {
    name: "success-reference",
    path: "/success/references/af000001-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  {
    name: "success-review",
    path: "/success/reviews/b7100001-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  {
    name: "company-success",
    path: "/companies/c0000000-0000-4000-8000-000000000001?tab=success",
    ready: "main#main-content",
  },
  { name: "deals-quotes-waiting", path: "/deals/quotes?view=waiting", ready: "main#main-content" },
  {
    name: "quote-waiting",
    path: "/deals/d0000000-0000-4000-8000-000000000001/quotes/qa000001-0000-4000-8000-000000000000",
    ready: ".order-form",
  },
  {
    name: "quote-sent",
    path: "/deals/d0000000-0000-4000-8000-000000000002/quotes/qa000002-0000-4000-8000-000000000000",
    ready: ".order-form",
  },
  {
    name: "deal-quotes",
    path: "/deals/d0000000-0000-4000-8000-000000000001?tab=quotes",
    ready: "main#main-content",
  },
  {
    name: "deal-plan",
    path: "/deals/d0000000-0000-4000-8000-000000000001?tab=plan",
    ready: ".plan-steps",
  },
  {
    name: "admin-automation",
    path: "/admin/automations/a7000001-0000-4000-8000-000000000000",
    ready: ".automation-builder",
  },
  {
    name: "admin-automation-paused",
    path: "/admin/automations/a7000004-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  {
    name: "admin-field",
    path: "/admin/fields/cf000001-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  { name: "trust", path: "/trust", ready: ".trust-registers" },
  { name: "trust-risks", path: "/trust/risks", ready: ".heatmap" },
  {
    name: "trust-risk",
    path: "/trust/risks/b7000001-0000-4000-8000-000000000000",
    ready: ".event-timeline",
  },
  { name: "trust-findings", path: "/trust/findings", ready: "main#main-content" },
  {
    name: "trust-finding-continuity",
    path: "/trust/findings/c5000001-0000-4000-8000-000000000000",
    ready: ".event-timeline",
  },
  { name: "trust-changes", path: "/trust/changes", ready: "main#main-content" },
  {
    name: "trust-change-unapproved",
    path: "/trust/changes/c6000002-0000-4000-8000-000000000000",
    ready: ".event-timeline",
  },
  { name: "trust-continuity", path: "/trust/continuity", ready: "main#main-content" },
  { name: "trust-suppliers", path: "/trust/suppliers", ready: "main#main-content" },
  {
    name: "trust-supplier",
    path: "/trust/suppliers/af000001-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  { name: "trust-answers", path: "/trust/answers", ready: ".answer-card" },
  {
    name: "trust-answer-expired",
    path: "/trust/answers/ba000002-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  { name: "trust-processing", path: "/trust/processing", ready: "main#main-content" },
  {
    name: "trust-processing-activity",
    path: "/trust/processing/bb000001-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  {
    name: "service-status-incident",
    path: "/service-status/incidents/5d000000-0000-4000-8000-000000000001",
    ready: ".event-timeline",
  },
  { name: "privacy", path: "/privacy", ready: "main#main-content" },
  { name: "privacy-closed", path: "/privacy?scope=closed", ready: "main#main-content" },
  {
    name: "privacy-request",
    path: "/privacy/requests/ad000001-0000-4000-8000-000000000000",
    ready: ".search-list",
  },
  {
    name: "privacy-request-erasure",
    path: "/privacy/requests/ad000005-0000-4000-8000-000000000000",
    ready: ".search-list",
  },
  {
    name: "privacy-complaint",
    path: "/privacy/requests/ad000007-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  {
    name: "privacy-incident-resolved",
    path: "/privacy/incidents/ae000002-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  {
    name: "privacy-subprocessor-change",
    path: "/privacy/subprocessors/af000009-0000-4000-8000-000000000000",
    ready: "main#main-content",
  },
  { name: "privacy-incidents", path: "/privacy/incidents", ready: "main#main-content" },
  { name: "privacy-subprocessors", path: "/privacy/subprocessors", ready: "main#main-content" },
  { name: "privacy-commitments", path: "/privacy/commitments", ready: "main#main-content" },
  {
    name: "company-privacy",
    path: "/companies/c0000000-0000-4000-8000-000000000002?tab=privacy",
    ready: "main#main-content",
  },
  { name: "confirm-reads", path: "/confirm-reads?next=%2Fcompanies", ready: "main#main-content" },
  { name: "confirm-reads-held", path: "/confirm-reads?held=1", ready: "main#main-content" },
  { name: "admin-pipeline", path: "/admin/settings/pipeline", ready: ".stage-editor" },
  { name: "admin-settings", path: "/admin/settings", ready: ".sla-rows" },
  { name: "admin-danger", path: "/admin/danger", ready: "main#main-content" },
  { name: "admin-staff", path: "/admin/staff", ready: ".data-table" },
  {
    name: "admin-staff-member",
    path: "/admin/staff/aa000000-0000-4000-8000-00000000000c",
    ready: ".record-layout",
  },
  { name: "admin-audit", path: "/admin/audit", ready: "main#main-content" },
  { name: "me-security", path: "/me/security", ready: "main#main-content" },
  // Product: the product's administration, run as the staff member's linked account. Each
  // waits for what only a successful read draws, so a broken link or an unreachable
  // service fails here instead of photographing an error.
  { name: "product", path: "/product", ready: ".stat-grid[role=list]" },
  { name: "product-users", path: "/product/users", ready: ".data-table" },
  {
    name: "product-user",
    path: "/product/users/9d3f5b71-4c6e-4a8b-9c0d-1e3f5a7b9c33",
    ready: ".stat-grid[role=list]",
  },
  { name: "product-subscriptions", path: "/product/subscriptions", ready: ".data-table" },
  { name: "product-notifications", path: "/product/notifications", ready: ".data-table" },
  { name: "product-email", path: "/product/email", ready: ".data-table" },
  { name: "product-releases", path: "/product/releases", ready: "main#main-content" },
  { name: "product-reports", path: "/product/reports", ready: ".data-table" },
  { name: "product-audit", path: "/product/audit", ready: ".data-table" },
  { name: "product-configuration", path: "/product/configuration", ready: ".stat-grid[role=list]" },
  { name: "product-secrets", path: "/product/secrets", ready: ".credential-split" },
  { name: "product-credentials", path: "/product/credentials", ready: ".data-table" },
  { name: "product-roles", path: "/product/roles", ready: ".data-table" },
  { name: "product-access", path: "/product/access", ready: ".role-grid" },
  // Outbound mail: every tab, and a campaign in each state the seed holds.
  { name: "mail", path: "/mail", ready: ".stat-grid" },
  { name: "mail-campaigns", path: "/mail/campaigns", ready: ".data-table" },
  { name: "mail-campaign-new", path: "/mail/campaigns/new", ready: ".campaign-form" },
  { name: "mail-campaign-sending", path: `/mail/campaigns/${MAIL.october}`, ready: ".rhead" },
  {
    name: "mail-campaign-recipients",
    path: `/mail/campaigns/${MAIL.october}?tab=recipients`,
    ready: ".data-table",
  },
  { name: "mail-campaign-sent", path: `/mail/campaigns/${MAIL.september}`, ready: ".rhead" },
  { name: "mail-campaign-paused", path: `/mail/campaigns/${MAIL.newsletter}`, ready: ".rhead" },
  {
    name: "mail-campaign-draft-preview",
    path: `/mail/campaigns/${MAIL.roadmap}?tab=preview`,
    ready: ".mail-preview",
  },
  { name: "mail-templates", path: "/mail/templates", ready: ".data-table" },
  {
    name: "mail-template",
    path: `/mail/templates/${MAIL.releaseTemplate}`,
    ready: ".mail-preview",
  },
  { name: "mail-template-new", path: "/mail/templates/new", ready: ".template-form" },
  { name: "mail-segments", path: "/mail/segments", ready: ".data-table" },
  { name: "mail-lists", path: "/mail/lists", ready: ".data-table" },
  { name: "mail-list", path: `/mail/lists/${MAIL.webinarList}`, ready: ".data-table" },
  { name: "mail-list-berlin", path: `/mail/lists/${MAIL.berlinList}`, ready: ".data-table" },
  {
    name: "mail-list-import",
    path: `/mail/lists/${MAIL.webinarList}?tab=import`,
    ready: ".list-import",
  },
  { name: "mail-list-add", path: `/mail/lists/${MAIL.webinarList}?tab=add`, ready: ".enrol-panel" },
  {
    name: "mail-list-settings",
    path: `/mail/lists/${MAIL.webinarList}?tab=settings`,
    ready: "main#main-content",
  },
  {
    name: "mail-list-campaign-preview",
    path: `/mail/campaigns/${MAIL.followUp}?tab=preview`,
    ready: ".mail-preview",
  },
  { name: "mail-sequences", path: "/mail/sequences", ready: ".data-table" },
  { name: "mail-sequence", path: `/mail/sequences/${MAIL.fundIntro}`, ready: ".data-table" },
  {
    name: "mail-sequence-steps",
    path: `/mail/sequences/${MAIL.fundIntro}?tab=steps`,
    ready: "main#main-content",
  },
  {
    name: "mail-sequence-feeds",
    path: `/mail/sequences/${MAIL.fundIntro}?tab=feeds`,
    ready: ".enrol-panel",
  },
  // The pool: one sending, one warming, one resting after a block; and an address on a
  // host without a consent screen, sent back to the server form with its servers filled in.
  { name: "mail-mailboxes", path: "/mail/mailboxes", ready: ".record-layout" },
  {
    name: "mail-mailboxes-add",
    path: "/mail/mailboxes?add=zoya%40quantifyterminal.in&smtp=smtppro.zoho.in&port=465&imap=imappro.zoho.in",
    ready: "#add-address",
  },
  // The programme's first slice, sent, with its results by country; and the drafted second.
  {
    name: "mail-campaign-series",
    path: `/mail/campaigns/${MAIL.pmsIntroOne}?by=country`,
    ready: "#campaign-breakdown",
  },
  {
    name: "mail-campaign-next-draft",
    path: `/mail/campaigns/${MAIL.pmsIntroTwo}`,
    ready: "#campaign-audience",
  },
  {
    name: "mail-sequence-results",
    path: `/mail/sequences/${MAIL.fundIntro}?tab=results`,
    ready: "main#main-content",
  },
  { name: "mail-sequence-new", path: "/mail/sequences/new", ready: ".sequence-editor" },
  { name: "mail-replies", path: "/mail/replies", ready: "main#main-content" },
  { name: "mail-suppressions", path: "/mail/suppressions", ready: ".data-table" },
  { name: "mail-reports", path: "/mail/reports", ready: ".data-table" },
  { name: "mail-settings", path: "/mail/settings", ready: ".record-layout" },
];

let failures = 0;

/**
 * Browser console errors since the last page was captured. React reports hydration
 * mismatches and invalid nesting (a list inside a paragraph) only here — the page still
 * renders, so without this the only sign is the dev overlay's badge in a screenshot.
 */
const consoleErrors: string[] = [];

function watchConsole(page: Page) {
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text().slice(0, 240));
  });
  page.on("pageerror", (error) => consoleErrors.push(`uncaught: ${error.message.slice(0, 240)}`));
}

function report(page: string, problem: string) {
  failures += 1;
  console.error(`  ✗ ${page}: ${problem}`);
}

async function assertNoOverflow(page: Page, name: string) {
  const overflow = await page.evaluate(() => {
    const html = document.documentElement;
    return html.scrollWidth - html.clientWidth;
  });
  if (overflow > 1) report(name, `horizontal overflow of ${overflow}px`);
}

async function assertAccessible(page: Page, name: string) {
  // The mail preview is a sandboxed frame with no scripts allowed — by design, it holds
  // an email's HTML. axe injects itself into every frame, the sandbox refuses it, and
  // each refusal is a console error the page never caused; the frame's own title is
  // checked by the unit tests, its contents are the email and not the portal.
  const results = await new AxeBuilder({ page }).exclude(".mail-preview__frame").analyze();
  const serious = results.violations.filter(
    (violation) => violation.impact === "serious" || violation.impact === "critical",
  );
  for (const violation of serious) {
    report(name, `axe ${violation.impact}: ${violation.id} (${violation.nodes.length} nodes)`);
  }
}

async function capture(page: Page, folder: string, shot: Shot) {
  consoleErrors.length = 0;
  const response = await page.goto(`${BASE}${shot.path}`, { waitUntil: "networkidle" });
  if (!response || response.status() !== 200) {
    report(shot.name, `status ${response?.status() ?? "none"}`);
    return;
  }
  if (shot.ready) await page.waitForSelector(shot.ready, { timeout: 10_000 });
  await assertNoOverflow(page, `${folder}/${shot.name}`);
  await assertAccessible(page, `${folder}/${shot.name}`);
  for (const error of consoleErrors) report(`${folder}/${shot.name}`, `console: ${error}`);
  await page.screenshot({ path: `${OUT}/${folder}/${shot.name}.png`, fullPage: true });
  console.log(`  ✓ ${folder}/${shot.name}`);
}

/**
 * Press the named theme's own button and wait until the shell has switched. (It used
 * to click the first toggle button — the already-pressed Dark one — so every "light"
 * screenshot was dark and nothing failed.)
 */
async function setTheme(page: Page, theme: "dark" | "light") {
  const label = theme === "light" ? "Light theme" : "Dark theme";
  const button = page.locator(`.theme-toggle button[title="${label}"]`);
  if ((await button.getAttribute("aria-pressed")) !== "true") {
    // The switch is optimistic; the cookie lands when the server action returns.
    // Navigating before that aborts it (and `networkidle` resolves at once on a page
    // that was already idle), so wait for the action's own response.
    const saved = page.waitForResponse(
      (response) => response.request().method() === "POST" && response.ok(),
      { timeout: 10_000 },
    );
    await button.click();
    await saved;
  }
  await page.reload({ waitUntil: "networkidle" });
  await page.waitForSelector(`.shell[data-theme="${theme}"]`, { timeout: 10_000 });
}

/** States a static walk never reaches: an open popover, and a key minted after sudo. */
async function captureInteractions(page: Page, folder: string) {
  await page.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Add lead" }).click();
  await page.waitForSelector(".popover[open] .popover__panel");
  await assertAccessible(page, `${folder}/leads-add-open`);
  await page.screenshot({ path: `${OUT}/${folder}/leads-add-open.png` });
  console.log(`  ✓ ${folder}/leads-add-open`);

  // Record a held meeting's outcome; the follow-up tasks appear on its page.
  await page.goto(`${BASE}/meetings/ee100000-0000-4000-8000-000000000002`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator("#meeting-notes").count()) > 0) {
    await page.fill("#meeting-notes", "Second desk signed in twice this week.");
    await page.locator("button", { hasText: "Record outcome" }).click();
    await page.waitForSelector(".follow-up", { timeout: 10_000 });
  }
  await assertAccessible(page, `${folder}/meeting-recorded`);
  await page.screenshot({ path: `${OUT}/${folder}/meeting-recorded.png`, fullPage: true });
  console.log(`  ✓ ${folder}/meeting-recorded`);

  await page.goto(`${BASE}/admin/integrations`, { waitUntil: "networkidle" });
  // The window lasts ten minutes, so a later pass may find it already open.
  if ((await page.locator("#sudo-code").count()) > 0) {
    await page.fill("#sudo-code", "000000");
    await page.locator(".sudo-gate button[type=submit]").click();
  }
  await page.waitForSelector(".sudo-gate--open", { timeout: 10_000 });
  // The calendar round trip: consent is simulated by the mock, which answers with the
  // portal's own callback URL, so this walks connect → callback → connected for real.
  if ((await page.locator("button", { hasText: "Connect calendar" }).count()) > 0) {
    await page.locator("button", { hasText: "Connect calendar" }).click();
    await page.waitForURL("**/admin/integrations?calendar=connected", { timeout: 15_000 });
    await page.waitForSelector(".integration-actions");
  }
  await page.fill("#key-name", "Website contact form");
  await page.fill("#key-reason", "Screenshot run");
  await page.locator("button", { hasText: "Mint key" }).click();
  // With the admin persona active, the owner's key waits for them (dual control): the
  // capture is the sent-for-approval message; a lone owner would see the secret.
  await page.waitForSelector(".one-time-secret, .form-sent", { timeout: 10_000 });
  await assertNoOverflow(page, `${folder}/admin-key-minted`);
  await assertAccessible(page, `${folder}/admin-key-minted`);
  await page.screenshot({ path: `${OUT}/${folder}/admin-key-minted.png`, fullPage: true });
  console.log(`  ✓ ${folder}/admin-key-minted`);

  await captureMailFlows(page, folder);
  await captureMailboxFlows(page, folder);
  await captureSecurityFlows(page, folder);
  await captureInboxFlows(page, folder);
  await captureReceivableFlows(page, folder);
  await capturePrivacyFlows(page, folder);
  await captureInspectionFlows(page, folder);
  await captureSuccessFlows(page, folder);
  await captureStatusFlows(page, folder);
  await capturePrivilegedFlows(page, folder);
  await captureAiFlows(page, folder);
  await capturePlatformFlows(page, folder);
  await captureTrustFlows(page, folder);
  await captureFieldFlows(page, folder);
  await captureProspectFlows(page, folder);
  await captureDataQualityFlows(page, folder);
  await captureAutomationFlows(page, folder);
  await captureDigestFlows(page, folder);
  await captureFinanceFlows(page, folder);
  await capturePlanFlows(page, folder);
  await captureQuoteFlows(page, folder);
  await captureRelationshipFlows(page, folder);
  await captureKnowledgeFlows(page, folder);
  await captureControlFlows(page, folder);
  await captureHiringFlows(page, folder);
  await captureDocumentFlows(page, folder);

  // A real CSV download through the route handler (the sudo window is still open).
  await page.goto(`${BASE}/reports`, { waitUntil: "networkidle" });
  await page.selectOption("#export-format", "csv");
  await page.fill("#export-reason", "Screenshot run check");
  // A fresh dev server compiles the export route on this first request (14 s seen after a
  // cache reset); the product's answer is fast once warm, the wait covers the tool.
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.locator("form[action='/exports'] button[type=submit]").click(),
  ]);
  const name = download.suggestedFilename();
  const stream = await download.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) chunks.push(chunk as Buffer);
  const csv = Buffer.concat(chunks).toString("utf8");
  // The byte-order mark first, so a spreadsheet reads ₹ and é as written.
  if (!name.startsWith("hq-leads-") || !csv.startsWith("\uFEFFid,received_at")) {
    report(`${folder}/export`, `unexpected download ${name}: ${csv.slice(0, 40)}`);
  } else {
    console.log(`  ✓ ${folder}/export (${name})`);
  }

  // Retention, run by hand: type the phrase the page shows, then open a lead it reached.
  // The first pass anonymises; later passes find nothing due and only look.
  await page.goto(`${BASE}/admin/danger`, { waitUntil: "networkidle" });
  if ((await page.locator("#retention-run-confirm").count()) > 0) {
    const phrase = (await page.locator(".typed-phrase").first().textContent()) ?? "";
    await page.fill("#retention-run-reason", "Screenshot run of the retention rules");
    await page.fill("#retention-run-confirm", phrase);
    await page.locator("button", { hasText: "Anonymise now" }).click();
    await page.waitForSelector(".form-sent", { timeout: 10_000 });
    // The form is gone, so focus must land on its result rather than fall to the page.
    const focused = await page.evaluate(
      () => document.activeElement?.classList.contains("danger-result") ?? false,
    );
    if (!focused) report(`${folder}/admin-retention-ran`, "focus did not move to the result");
  }
  // Focusing the result scrolled the page; a full-page capture taken scrolled draws the
  // sticky header, and the skip link hidden above it, halfway down the image.
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertNoOverflow(page, `${folder}/admin-retention-ran`);
  await assertAccessible(page, `${folder}/admin-retention-ran`);
  await page.screenshot({ path: `${OUT}/${folder}/admin-retention-ran.png`, fullPage: true });
  console.log(`  ✓ ${folder}/admin-retention-ran`);
  await page.goto(`${BASE}/leads/1e000000-0000-4000-8000-0000000000d1`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator("h1", { hasText: "Anonymised lead" }).count()) === 0) {
    report(`${folder}/lead-anonymised`, "the lead the run reached does not read as anonymised");
  }
  await assertAccessible(page, `${folder}/lead-anonymised`);
  await page.screenshot({ path: `${OUT}/${folder}/lead-anonymised.png`, fullPage: true });
  console.log(`  ✓ ${folder}/lead-anonymised`);
}

/**
 * Receivables, end to end: an invoice recorded from the Receivables page (it lands on its
 * own record), a dispute recorded on it, then money received against an open invoice
 * from the customer's Billing tab, allocated with "All of it".
 */
async function captureReceivableFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/revenue/receivables`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Record an invoice" }).click();
  await page.selectOption("#invoice-company", { index: 1 });
  await page.fill("#invoice-number", `QT-HARNESS-${Date.now().toString(36).toUpperCase()}`);
  await page.fill("#invoice-net", "1250.00");
  await page.locator("button", { hasText: "Record the invoice" }).click();
  await page.waitForURL("**/revenue/invoices/**", { timeout: 15_000 });
  await page.fill("#dispute-reason", "Seat count differs from their PO");
  await page.locator("button", { hasText: "Record the dispute" }).click();
  await page.waitForSelector(".invoice-timeline__row:has-text('Disputed')", { timeout: 10_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertNoOverflow(page, `${folder}/invoice-recorded`);
  await assertAccessible(page, `${folder}/invoice-recorded`);
  await page.screenshot({ path: `${OUT}/${folder}/invoice-recorded.png`, fullPage: true });
  console.log(`  ✓ ${folder}/invoice-recorded`);

  // Money received from the customer just invoiced: the receipt settles that invoice in full.
  const customer = await page.locator('main a[href^="/companies/"]').first().getAttribute("href");
  if (!customer) throw new Error(`${folder}: the invoice page links to no customer`);
  await page.goto(`${BASE}${customer.split("?")[0]}?tab=billing`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Record money received from them" }).click();
  const all = page.locator(".receipt-allocation button", { hasText: "All of it" }).first();
  if ((await all.count()) === 0) throw new Error(`${folder}: no open invoice to settle`);
  await all.click();
  const owed = await page.locator(".receipt-allocation__input input").first().inputValue();
  await page.fill("#receipt-amount", owed);
  await page.fill("#receipt-reference", "WIRE-HARNESS");
  await page.locator("button", { hasText: "Record the receipt" }).click();
  await page.waitForSelector(".disclosure .form-sent", { timeout: 10_000 });
  await assertNoOverflow(page, `${folder}/company-billing-received`);
  await assertAccessible(page, `${folder}/company-billing-received`);
  await page.screenshot({ path: `${OUT}/${folder}/company-billing-received.png`, fullPage: true });
  console.log(`  ✓ ${folder}/company-billing-received`);
}

async function shoot(page: Page, name: string) {
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertNoOverflow(page, name);
  await assertAccessible(page, name);
  await page.screenshot({ path: `${OUT}/${name}.png`, fullPage: true });
  console.log(`  ✓ ${name}`);
}

/**
 * The privacy desk, end to end: a request logged and landed on, one system marked searched,
 * its clock stopped with the question asked; the seeded breach assessed and reported; an
 * objection to the sub-processor change settled; a customer's commitments saved.
 */
async function capturePrivacyFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/privacy`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Log a request" }).click();
  await page.fill("#request-name", "Harness Person");
  await page.fill("#request-email", `harness-${Date.now().toString(36)}@example.org`);
  await page.fill("#request-description", "Please send me a copy of my data.");
  await page.locator("button", { hasText: "Log the request" }).click();
  await page.waitForURL("**/privacy/requests/**", { timeout: 15_000 });
  const firstSearch = page.locator(".search-row").first();
  await firstSearch.locator("select").selectOption("none");
  await firstSearch.locator("button", { hasText: "Save" }).click();
  await page.waitForSelector(".search-row__done", { timeout: 10_000 });
  await page.fill("#stop-question", "Which years do you mean?");
  await page.locator("button", { hasText: "Stop the clock" }).click();
  await page.waitForSelector(".event-timeline__row:has-text('Clock stopped')", { timeout: 10_000 });
  await shoot(page, `${folder}/privacy-request-worked`);

  await page.goto(`${BASE}/privacy/incidents`, { waitUntil: "networkidle" });
  const unassessed = page.locator("tr:has-text('Not assessed') a").first();
  if ((await unassessed.count()) > 0) {
    await unassessed.click();
    await page.waitForURL("**/privacy/incidents/**", { timeout: 15_000 });
    await page.selectOption("#assess-risk", "risk");
    await page.fill("#assess-reason", "Names and work emails of 38 people went to one other firm.");
    await page.locator("button", { hasText: "Record the assessment" }).click();
    await page.waitForSelector("#regulator-reference", { timeout: 10_000 });
    await page.fill("#regulator-reference", "ICO-HARNESS");
    await page.locator("button", { hasText: "Record the report" }).click();
    await page.waitForSelector(".event-timeline__row:has-text('Regulator told')", {
      timeout: 10_000,
    });
  } else {
    await page.locator("tbody tr a").first().click();
    await page.waitForURL("**/privacy/incidents/**", { timeout: 15_000 });
  }
  await shoot(page, `${folder}/privacy-incident`);

  await page.goto(`${BASE}/privacy/subprocessors`, { waitUntil: "networkidle" });
  await page.locator("tbody tr a", { hasText: "Ledgerline" }).first().click();
  await page.waitForURL("**/privacy/subprocessors/**", { timeout: 15_000 });
  if ((await page.locator("#resolve-company").count()) > 0) {
    await page.selectOption("#resolve-company", { index: 1 });
    await page.locator("button", { hasText: "Settle it" }).click();
    await page.waitForSelector(".event-timeline__row:has-text('Objection settled')", {
      timeout: 10_000,
    });
  }
  await shoot(page, `${folder}/privacy-subprocessor`);

  await page.goto(`${BASE}/companies/c0000000-0000-4000-8000-000000000002?tab=privacy`, {
    waitUntil: "networkidle",
  });
  await page.fill("#commit-contact", "dpo@northwall.ch");
  await page.fill("#commit-incident", "24");
  await page.locator("button", { hasText: "Save the commitments" }).click();
  await page.waitForSelector("form:has(#commit-contact) .form-sent", { timeout: 10_000 });
  await shoot(page, `${folder}/company-privacy-saved`);
}

/**
 * Pipeline inspection, end to end: a competitor added and its card marked reviewed; that
 * competitor put on a deal and dropped out; a call submitted for next quarter with its
 * target; a buyer interviewed after a closed deal.
 */
async function captureInspectionFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/deals/competitors`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Add a competitor" }).click();
  const name = `Harness Rival ${Date.now().toString(36)}`;
  await page.fill("#card-name", name);
  await page.fill("#card-dismiss", "A day late on filings.");
  await page.locator(".objection-row input").first().fill("They are cheaper");
  await page.locator(".objection-row input").nth(1).fill("Per seat, not per desk.");
  await page.locator("button", { hasText: "Add the card" }).click();
  await page.waitForURL("**/deals/competitors/**", { timeout: 15_000 });
  await page.locator("button", { hasText: "Still true: mark reviewed" }).click();
  await page.waitForSelector("form:has(input[value=review]) .form-sent", { timeout: 10_000 });
  await shoot(page, `${folder}/deals-competitor-new`);

  await page.goto(`${BASE}/deals/d0000000-0000-4000-8000-000000000001?tab=competition`, {
    waitUntil: "networkidle",
  });
  const pick = page.locator("#deal-competitor option", { hasText: name });
  if ((await pick.count()) > 0) {
    await page.selectOption("#deal-competitor", { label: name });
    await page.fill("#deal-competitor-strengths", "Cheaper per seat");
    await page.locator("button", { hasText: "Add to the deal" }).click();
    await page.waitForSelector(`.competitor-row:has-text("${name}")`, { timeout: 10_000 });
    await page
      .locator(`.competitor-row:has-text("${name}") button`, { hasText: "They dropped out" })
      .click();
    await page.waitForSelector(`.competitor-row:has-text("${name}") :text("Dropped out")`, {
      timeout: 10_000,
    });
  }
  await shoot(page, `${folder}/deal-competition-worked`);

  await page.goto(`${BASE}/deals/forecast?period=${NEXT_QUARTER}`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Set the target" }).click();
  await page.fill("#target-amount", "8000");
  await page.locator("button", { hasText: "Set the target" }).last().click();
  await page.waitForSelector("form:has(#target-amount) .form-sent", { timeout: 10_000 });
  await page.goto(`${BASE}/deals/forecast?period=${NEXT_QUARTER}`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Submit a call" }).click();
  await page.fill("#forecast-note", "Harness call: the negotiations close in October.");
  await page.locator("button", { hasText: "Submit the call" }).click();
  await page.waitForSelector("form:has(#forecast-commit) .form-sent", { timeout: 10_000 });
  await page.goto(`${BASE}/deals/forecast?period=${NEXT_QUARTER}`, { waitUntil: "networkidle" });
  await shoot(page, `${folder}/deals-forecast-called`);

  await page.goto(`${BASE}/deals/win-loss`, { waitUntil: "networkidle" });
  const unasked = page
    .locator('table:has(caption:has-text("Closed deals without an interview")) tbody tr a')
    .first();
  if ((await unasked.count()) > 0) {
    const href = await unasked.getAttribute("href");
    await page.goto(`${BASE}${(href ?? "").split("#")[0]}?tab=competition`, {
      waitUntil: "networkidle",
    });
    await page.fill("#interview-name", "Head of research");
    await page.fill("#interview-reason", "Filings the same day decided it.");
    await page.selectOption("select[name='driver:speed']", "positive");
    await page.locator("button", { hasText: "Record the interview" }).click();
    await page.waitForSelector("form:has(#interview-reason) .form-sent", { timeout: 10_000 });
  }
  await shoot(page, `${folder}/deal-interviewed`);
}

/**
 * Customer success, end to end: a customer's Success tab opened from the signals; a feature
 * request added, asked for by a firm, and shipped with a note to the asker; an onboarding
 * step ticked; a renewal playbook put on the calendar from a contract.
 */
async function captureSuccessFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/success`, { waitUntil: "networkidle" });
  const firm = page.locator("tbody tr a").nth(4);
  if ((await firm.count()) > 0) {
    await firm.click();
    await page.waitForURL("**/companies/**", { timeout: 15_000 });
    await page.waitForSelector(".signal-list, main#main-content", { timeout: 10_000 });
  }
  await shoot(page, `${folder}/company-success`);

  await page.goto(`${BASE}/success/requests`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "New request" }).click();
  await page.fill("#request-title", `Harness request ${Date.now().toString(36)}`);
  await page.fill("#request-description", "A harness walk through the request flow.");
  await page.locator("button", { hasText: "Add the request" }).click();
  await page.waitForURL("**/success/requests/**", { timeout: 15_000 });
  await page.selectOption("#ask-company", { index: 1 });
  await page.fill("#ask-quote", "We would use this every day.");
  await page.selectOption("#ask-importance", "blocker");
  await page.locator("button", { hasText: "Add the ask" }).click();
  await page.waitForSelector(".ask-list__item", { timeout: 10_000 });
  await page.selectOption("#ship-tell", "recorded");
  await page.locator("button", { hasText: "Mark shipped" }).click();
  await page.waitForSelector("form:has(#ship-on) .form-sent, .ask-list__item :text('told')", {
    timeout: 10_000,
  });
  await page.reload({ waitUntil: "networkidle" });
  await shoot(page, `${folder}/success-request-shipped`);

  await page.goto(`${BASE}/success/onboarding`, { waitUntil: "networkidle" });
  const done = page.locator(".step-list__item button", { hasText: "Done" }).first();
  if ((await done.count()) > 0) {
    const before = await page.locator(".step-list__title--done").count();
    await done.click();
    await page.waitForFunction(
      (count) => document.querySelectorAll(".step-list__title--done").length > count,
      before,
      { timeout: 10_000 },
    );
  }
  await shoot(page, `${folder}/success-onboarding-ticked`);

  await page.goto(`${BASE}/revenue/renewals`, { waitUntil: "networkidle" });
  const contract = page.locator('tbody tr a[href^="/revenue/contracts/"]').first();
  if ((await contract.count()) > 0) {
    await page.goto(`${BASE}${await contract.getAttribute("href")}`, { waitUntil: "networkidle" });
    const start = page.locator("button", { hasText: "Start the playbook" });
    if ((await start.count()) > 0) {
      await start.click();
      await page.waitForSelector(
        "form:has(input[value=start]) .form-sent, :text('Running since')",
        {
          timeout: 10_000,
        },
      );
    }
  }
  await shoot(page, `${folder}/contract-playbook`);
}

/**
 * The status page from the desk's side: an incident reported on the first component,
 * moved to monitoring, then resolved; a maintenance window scheduled a week out.
 */
async function captureStatusFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/service-status`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Report an incident" }).click();
  await page.fill("#status-title", `Harness incident ${Date.now().toString(36)}`);
  await page.fill("#status-body", "Some exports are slow. We are looking into it.");
  await page.locator(".impact-list select").first().selectOption("degraded");
  await page.locator("button", { hasText: "Post the incident" }).click();
  await page.waitForURL("**/service-status/incidents/**", { timeout: 15_000 });
  await page.selectOption("#update-status", "monitoring");
  await page.fill("#update-body", "A fix is out. We are watching it.");
  await page.locator("button", { hasText: "Post the update" }).click();
  await page.waitForSelector("form:has(#update-body) .form-sent", { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  await shoot(page, `${folder}/status-incident-monitoring`);
  await page.selectOption("#update-status", "resolved");
  await page.fill("#update-body", "Exports are back to normal. Resolved.");
  await page.locator("button", { hasText: "Post and resolve" }).click();
  // Resolving takes the form away: a resolved incident takes no more updates.
  await page
    .waitForSelector("#update-body", { state: "detached", timeout: 10_000 })
    .catch(() =>
      report(
        `${folder}/status-incident-resolved`,
        "a resolved incident still offers an update form",
      ),
    );
  await page.reload({ waitUntil: "networkidle" });
  await shoot(page, `${folder}/status-incident-resolved`);

  await page.goto(`${BASE}/service-status`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Schedule maintenance" }).click();
  const day = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
  await page.fill("#maintenance-title", "Harness window");
  await page.fill("#maintenance-starts", `${day}T06:00`);
  await page.fill("#maintenance-ends", `${day}T07:00`);
  await page.locator(".pick-list input[name=component_ids]").first().check();
  await page.locator("button", { hasText: "Schedule it" }).click();
  await page.waitForSelector("form:has(#maintenance-title) .form-sent", { timeout: 10_000 });
  await page.keyboard.press("Escape");
  await page.reload({ waitUntil: "networkidle" });
  await shoot(page, `${folder}/status-maintenance-scheduled`);
}

/**
 * The public status page, signed out: the page itself, a subscribe (always the same
 * answer), and the two mailed links — opening each changes nothing, one press acts.
 */
async function captureStatusPublic(page: Page, folder: string) {
  await capture(page, folder, {
    name: "status-public",
    path: "/status",
    ready: ".status-components",
  });
  await page.fill("#subscribe-email", `harness-${Date.now().toString(36)}@example.test`);
  await page.locator("button", { hasText: "Subscribe" }).click();
  await page.waitForSelector(".subscribe-form .form-sent", { timeout: 10_000 });
  await shoot(page, `${folder}/status-subscribed`);

  // The mock's stand-in token for a subscriber still waiting to confirm, and one who is live.
  const token = (purpose: string, n: number) =>
    Buffer.from(`${purpose}:5e000000-0000-4000-8000-${String(n).padStart(12, "0")}`).toString(
      "base64url",
    );
  await capture(page, folder, {
    name: "status-confirm",
    path: `/status/confirm/${token("confirm", 39)}`,
    ready: ".auth-form",
  });
  await page.locator("button", { hasText: "Confirm" }).click();
  await page.waitForSelector(".form-sent", { timeout: 15_000 });
  if (!/Confirmed\./.test(await page.locator("main").innerText()))
    report(`${folder}/status-confirmed`, "pressing confirm did not say it was confirmed");
  await shoot(page, `${folder}/status-confirmed`);

  await page.goto(`${BASE}/status/stop/${token("confirm", 1)}`, { waitUntil: "networkidle" });
  await page.locator("button", { hasText: "Stop the mail" }).click();
  // The refusal arrives as an alert; nothing on the page carries that role before the press.
  await page.waitForSelector("main [role=alert]", { timeout: 15_000 });
  if (!/not valid/.test(await page.locator("main").innerText()))
    report(`${folder}/status-stop-wrong-token`, "a confirm token was accepted as a stop token");
  await capture(page, folder, {
    name: "status-stop",
    path: `/status/stop/${token("stop", 2)}`,
    ready: ".auth-form",
  });
  await page.locator("button", { hasText: "Stop the mail" }).click();
  await page.waitForSelector(".form-sent", { timeout: 15_000 });
  await shoot(page, `${folder}/status-stopped`);
}

/**
 * Privileged access from the owner's side: someone made eligible to elevate, a break-glass
 * test refused because the sealed account has not signed in, a colleague's export limit
 * lifted for a day, and a masked phone number revealed for a reason.
 */
async function capturePrivilegedFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/admin/privileged`, { waitUntil: "networkidle" });
  if ((await page.locator("#sudo-code").count()) > 0) {
    await page.fill("#sudo-code", "000000");
    await page.locator(".sudo-gate button[type=submit]").first().click();
    await page.waitForSelector(".sudo-gate--open", { timeout: 10_000 });
  }
  await page.locator("summary", { hasText: "Make someone eligible" }).click();
  await page.selectOption("#grant-person", { label: "Sales Person" });
  await page.fill("#grant-reason", "Covers renewals while the owner travels");
  await page.locator("button", { hasText: "Make eligible" }).click();
  // A second pass finds them eligible already, and says so.
  await page.waitForSelector(
    "form:has(#grant-reason) .form-sent, form:has(#grant-reason) [role=alert]",
    {
      timeout: 10_000,
    },
  );
  await page.reload({ waitUntil: "networkidle" });

  const test = page.locator("form:has(input[name=note])").first();
  await test.locator("input[name=note]").fill("Checked the envelope is still sealed");
  await test.locator("button", { hasText: "Record the test" }).click();
  await test.locator("[role=alert]").waitFor({ timeout: 10_000 });
  if (!/sign in with the sealed account first/i.test(await test.innerText()))
    report(`${folder}/admin-privileged-test`, "a break-glass test was recorded without a sign-in");

  await page.locator("summary", { hasText: "Lift a limit" }).click();
  await page.selectOption("#lift-person", { label: "The Admin" });
  await page.fill("#lift-rows", "2000");
  await page.fill("#lift-reason", "Year-end archive for the accountant");
  await page.locator("button", { hasText: "Lift for 24 hours" }).click();
  await page.waitForSelector("form:has(#lift-reason) .form-sent", { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  await shoot(page, `${folder}/admin-privileged-worked`);

  await page.goto(`${BASE}/team/aa000000-0000-4000-8000-00000000000e`, {
    waitUntil: "networkidle",
  });
  const phone = page.locator(".reveal").filter({ hasText: "\u2022\u2022\u2022\u2022 23" }).first();
  if ((await phone.count()) === 0) {
    report(`${folder}/team-member-revealed`, "the emergency contact's phone is not masked");
    return;
  }
  await phone.locator("button", { hasText: "Reveal" }).click();
  await phone.locator("input[name=reason]").fill("Calling their family after a fall at the office");
  await phone.locator("button", { hasText: "Show it" }).click();
  await page.waitForSelector(".reveal__value", { timeout: 10_000 });
  if (!/\+44/.test(await page.locator(".reveal__value").first().innerText()))
    report(`${folder}/team-member-revealed`, "the reveal did not show the number");
  await shoot(page, `${folder}/team-member-revealed`);
}

/**
 * Just-in-time elevation, as the person: the intern takes Support for an hour with a
 * reason and a fresh code, the bar follows them to another page, and they end it.
 */
async function captureElevation(page: Page, folder: string) {
  await page.goto(`${BASE}/me/security`, { waitUntil: "networkidle" });
  const section = page.locator("#elevation");
  if ((await section.count()) === 0) {
    report(`${folder}/me-security-elevation`, "the eligible intern has no elevation section");
    return;
  }
  if ((await section.locator(".elevation-live").count()) > 0) {
    await section.locator("button", { hasText: "End it now" }).click();
    await page.waitForSelector(".elevation-bar", { state: "detached", timeout: 15_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  if ((await section.locator("#sudo-code").count()) > 0) {
    await section.locator("#sudo-code").fill("000000");
    await section.locator(".sudo-gate button[type=submit]").click();
    await section.locator(".sudo-gate--open").waitFor({ timeout: 10_000 });
  }
  await shoot(page, `${folder}/me-security-elevation`);
  await section.locator("input[name=reason]").first().fill("Covering the desk this afternoon");
  await section.locator("button", { hasText: "Take Support" }).first().click();
  await page.waitForSelector(".elevation-bar", { timeout: 15_000 });
  await page.goto(`${BASE}/support`, { waitUntil: "networkidle" });
  if ((await page.locator(".elevation-bar").count()) === 0)
    report(`${folder}/elevated-support`, "the elevation bar did not follow them to another page");
  await shoot(page, `${folder}/elevated-support`);
  await page.goto(`${BASE}/me/security`, { waitUntil: "networkidle" });
  await page.locator("#elevation button", { hasText: "End it now" }).click();
  await page.waitForSelector(".elevation-bar", { state: "detached", timeout: 15_000 });
  await shoot(page, `${folder}/elevation-ended`);
}

/**
 * AI assistance, with the mock's stand-in model (MOCK_AI=1): a reply drafted and put in the
 * reply box, a filing suggestion applied, a brief read, tasks proposed from meeting notes and
 * one added, and a filter described in words turned into the ordinary filter. Without the
 * stand-in every control is absent, which is its own check: nothing is shown that no model wrote.
 */
async function captureAiFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/admin/ai`, { waitUntil: "networkidle" });
  const configured = !(await page.locator("text=Not configured").count());
  await shoot(page, `${folder}/admin-ai`);
  if (!configured) return;

  await page.goto(`${BASE}/support`, { waitUntil: "networkidle" });
  const first = page.locator('a[href^="/support/sup_"]').first();
  await page.goto(`${BASE}${await first.getAttribute("href")}`, { waitUntil: "networkidle" });
  await page.locator("button", { hasText: "Draft a reply" }).click();
  await page.waitForSelector(".ai-panel__text, .ai-panel .callout", { timeout: 15_000 });
  if ((await page.locator(".ai-panel__text").count()) > 0) {
    const draft = (await page.locator(".ai-panel__text").first().innerText()).trim();
    await page.locator("button", { hasText: "Put it in the reply box" }).click();
    const box = await page.locator(".composer textarea").first().inputValue();
    if (!box.includes(draft.slice(0, 20)))
      report(`${folder}/ticket-ai-draft`, "the draft did not reach the reply box");
  }
  await page.locator("button", { hasText: "Suggest filing" }).click();
  await page.waitForSelector(".ai-facts, .ai-panel .callout", { timeout: 15_000 });
  await shoot(page, `${folder}/ticket-ai`);

  await page.goto(`${BASE}/companies/c0000000-0000-4000-8000-000000000002`, {
    waitUntil: "networkidle",
  });
  await page.locator("button", { hasText: "Brief me" }).click();
  await page.waitForSelector(".ai-panel__text, .ai-panel .callout", { timeout: 15_000 });
  await shoot(page, `${folder}/company-brief`);

  await page.goto(`${BASE}/meetings/ee100000-0000-4000-8000-0000000000a1`, {
    waitUntil: "networkidle",
  });
  {
    const ask = page.locator("button", { hasText: "Suggest tasks from the notes" });
    if ((await ask.count()) === 0)
      report(`${folder}/meeting-ai-tasks`, "no way to propose tasks from written-up notes");
    else {
      await ask.click();
      await page.waitForSelector(".ai-proposals__item, .ai-panel .callout", { timeout: 15_000 });
      const add = page.locator(".ai-proposals__item button", { hasText: "Add task" }).first();
      if ((await add.count()) > 0) {
        await add.click();
        await page.waitForSelector(".ai-proposals__done", { timeout: 10_000 });
      }
      await shoot(page, `${folder}/meeting-ai-tasks`);
    }
  }

  await page.goto(`${BASE}/leads`, { waitUntil: "networkidle" });
  await page.fill("#ai-filter-leads", "new leads waiting over 60 minutes");
  await page.locator(".ai-filter button", { hasText: "Filter" }).click();
  await page
    .waitForURL(/[?&]f=/, { timeout: 15_000 })
    .catch(() => report(`${folder}/leads-ai-filter`, "the words did not become a filter"));
  await shoot(page, `${folder}/leads-ai-filter`);
}

/**
 * The platform layer: a validation rule added and one switched off; an outbound endpoint
 * added (its signing secret shown once) and a test event queued on the seeded one; a
 * thread started on a company, a thread resolved, and a template's tasks added to it.
 */
async function capturePlatformFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/admin/rules`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Add a rule" }).click();
  await page.selectOption("#rule-target", "deal:expected_close_date");
  await page.selectOption("#rule-check", "not_past");
  await page.fill("#rule-message", "A close date already gone is not a forecast");
  await page.locator("button", { hasText: "Add rule" }).click();
  await page.waitForSelector("form:has(#rule-message) .form-sent", { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  await shoot(page, `${folder}/admin-rules-worked`);

  await page.goto(`${BASE}/admin/webhooks`, { waitUntil: "networkidle" });
  if ((await page.locator("#sudo-code").count()) > 0) {
    await page.fill("#sudo-code", "000000");
    await page.locator(".sudo-gate button[type=submit]").first().click();
    await page.waitForSelector(".sudo-gate--open", { timeout: 10_000 });
  }
  await page.locator("summary", { hasText: "Add a receiver" }).click();
  await page.fill("#hook-url", `https://hooks.example.com/harness-${Date.now().toString(36)}`);
  await page.fill("#hook-desc", "Harness receiver");
  await page.locator(".pick-list input[name=event_types]").first().check();
  await page.locator("button", { hasText: "Add receiver" }).click();
  await page.waitForSelector(".one-time-secret__value", { timeout: 10_000 });
  if (!/^whsec_/.test((await page.locator(".one-time-secret__value").innerText()).trim()))
    report(`${folder}/admin-webhook-added`, "the signing secret was not shown once");
  await shoot(page, `${folder}/admin-webhook-added`);
  await page.goto(`${BASE}/admin/webhooks/f4000000-0000-4000-8000-000000000001`, {
    waitUntil: "networkidle",
  });
  await page.locator("button", { hasText: "Send a test event" }).click();
  await page.waitForSelector(".webhook-acts .form-sent", { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  await shoot(page, `${folder}/admin-webhook-tested`);

  await page.goto(`${BASE}/companies/c0000000-0000-4000-8000-000000000002`, {
    waitUntil: "networkidle",
  });
  const words = `Harness thread ${Date.now().toString(36)}`;
  await page.fill("#comment-new", words);
  await page.locator(".comments > .comment-form button", { hasText: "Post" }).click();
  await page.waitForSelector(`.comment__body:has-text("${words}")`, { timeout: 10_000 });
  const resolve = page.locator(".comment-thread button", { hasText: "Resolve" }).first();
  if ((await resolve.count()) > 0) {
    await resolve.click();
    await page.waitForTimeout(500);
  }
  const apply = page.locator("#company-templates button", { hasText: "Add its tasks" });
  if ((await apply.count()) > 0) {
    await apply.click();
    await page.waitForSelector("#company-templates .form-sent", { timeout: 10_000 });
  }
  await shoot(page, `${folder}/company-threads`);
}

/**
 * Hiring: the applicant from the careers page moved to screen, the signed-in owner named an
 * interviewer and their scorecard handed in; the agency applicant rejected with a reason.
 */
/**
 * Documents: the export menu on a list, one real file in each format through the route
 * (checked by its first bytes, not its name), and two pages as they print — a list on
 * the letterhead, and a quote as the customer's order form.
 */
async function captureDocumentFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/finance/vendors`, { waitUntil: "networkidle" });
  await page.locator(".export-menu summary").click();
  await page.waitForSelector(".export-menu .format-choice", { timeout: 10_000 });
  await assertAccessible(page, `${folder}/export-menu`);
  await shoot(page, `${folder}/export-menu`);
  const magic: Record<string, (body: Buffer) => boolean> = {
    pdf: (body) => body.subarray(0, 5).toString("latin1") === "%PDF-",
    xlsx: (body) => body.subarray(0, 4).toString("latin1") === "PK\x03\x04",
    csv: (body) => body.subarray(0, 3).equals(Buffer.from([0xef, 0xbb, 0xbf])),
  };
  for (const [format, check] of Object.entries(magic)) {
    const response = await page.request.post(`${BASE}/exports`, {
      form: { kind: "vendors", format, reason: "Screenshot run check", back: "/finance/vendors" },
      headers: { origin: BASE },
      maxRedirects: 0,
      timeout: 60_000,
    });
    const body = await response.body();
    if (response.status() !== 200 || !check(body)) {
      report(
        `${folder}/export-${format}`,
        `status ${response.status()}, ${body.subarray(0, 12).toString("latin1")}`,
      );
    } else {
      console.log(`  ✓ ${folder}/export-${format} (${body.length} bytes)`);
    }
  }
  const refused = await page.request.post(`${BASE}/exports`, {
    form: { kind: "vendors", format: "pdf", reason: "short", back: "//elsewhere.example" },
    headers: { origin: BASE },
    maxRedirects: 0,
  });
  if (!String(refused.headers()["location"] ?? "").endsWith("/reports?export=reason")) {
    report(`${folder}/export-refused`, `went to ${refused.headers()["location"] ?? "nowhere"}`);
  }

  await page.emulateMedia({ media: "print" });
  try {
    await page.goto(`${BASE}/companies`, { waitUntil: "networkidle" });
    if (
      !(await page.locator(".print-head .letterhead").isVisible()) ||
      (await page.locator(".rail").isVisible())
    ) {
      report(`${folder}/print-companies`, "printed without the letterhead, or with the rail");
    }
    await shoot(page, `${folder}/print-companies`);
    await page.goto(`${BASE}/deals/quotes?view=all`, { waitUntil: "networkidle" });
    const quote = await page.locator("a[href*='/quotes/']").first().getAttribute("href");
    if (quote) {
      await page.goto(`${BASE}${quote}`, { waitUntil: "networkidle" });
      if (await page.locator(".print-head__stamp").isVisible()) {
        report(`${folder}/print-quote`, "the customer's order form says who printed it");
      }
      await shoot(page, `${folder}/print-quote`);
    }
  } finally {
    await page.emulateMedia({ media: "screen" });
  }
}

async function captureHiringFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/hiring/applicants/f2000001-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator(".rhead__status :text('Applied')").count()) > 0) {
    await page.selectOption("#move-stage", "screen");
    await page.locator("button", { hasText: /^Move$/ }).click();
    await page.waitForSelector(".rhead__status :text('Screen')", { timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
    await page.check("#interviewer-aa000000-0000-4000-8000-00000000000a");
    await page.locator("button", { hasText: "Set interviewers" }).click();
    await page.waitForSelector(
      "form:has(#interviewer-aa000000-0000-4000-8000-00000000000a) .form-sent",
      {
        timeout: 10_000,
      },
    );
    await page.reload({ waitUntil: "networkidle" });
    await page.locator("summary", { hasText: "Write your scorecard" }).click();
    await page.selectOption("#card-recommendation", "strong_yes");
    await page.fill(
      "#card-notes",
      "Walked through a 10-K note without prompting; asked the right follow-ups.",
    );
    await page.locator("button", { hasText: "Hand it in" }).click();
    await page.waitForSelector("h3:has-text('(you)')", { timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  await shoot(page, `${folder}/hiring-scored`);

  await page.goto(`${BASE}/hiring/applicants/f2000004-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  if (
    (await page.locator("#move-stage").count()) > 0 &&
    (await page.getByText("Rejected:").count()) === 0
  ) {
    await page.selectOption("#move-stage", "rejected");
    await page.selectOption("#move-reason", "timing");
    await page.fill("#move-note", "Strong, but we need someone from January");
    await page.locator("button", { hasText: /^Move$/ }).click();
    await page.waitForSelector("text=Rejected: Timing", { timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  await shoot(page, `${folder}/hiring-rejected`);
}

/**
 * The control map and the trust centre: evidence recorded on the overdue restore control; an
 * auditor's link made behind a fresh code and opened as the auditor would; the waiting
 * document request approved and recorded as sent.
 */
async function captureControlFlows(page: Page, folder: string) {
  const stamp = Date.now().toString(36);
  await page.goto(`${BASE}/trust/controls/c7000002-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator("summary", { hasText: "Record evidence" }).count()) > 0) {
    await page.locator("summary", { hasText: "Record evidence" }).click();
    await page.fill("#evidence-title", `Restore test ${stamp}`);
    await page.fill("#evidence-reference", "Runbook log, this quarter");
    await page.locator("button", { hasText: /^Record it$/ }).click();
    await page.waitForSelector(`td:has-text("${stamp}")`, { timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  if ((await page.getByText("Evidence due", { exact: true }).count()) > 0)
    report(`${folder}/trust-control-evidenced`, "fresh evidence did not clear the due flag");
  await shoot(page, `${folder}/trust-control-evidenced`);

  await page.goto(`${BASE}/trust/controls`, { waitUntil: "networkidle" });
  if ((await page.locator("#sudo-code").count()) > 0) {
    await page.fill("#sudo-code", "000000");
    await page.locator(".sudo-gate button[type=submit]").click();
    await page.waitForSelector(".sudo-gate--open", { timeout: 10_000 });
  }
  await page.fill("#auditor-label", `Ledger & Co ${stamp}`);
  await page.fill("#auditor-reason", "SOC 2 type I fieldwork");
  await page.locator("button", { hasText: "Make the link" }).click();
  await page.waitForSelector(".one-time-secret__value", { timeout: 10_000 });
  const link = ((await page.locator(".one-time-secret__value").textContent()) ?? "").trim();
  await shoot(page, `${folder}/trust-auditor-link`);
  if (!/\/audit\/qta_/.test(link))
    report(`${folder}/trust-auditor-view`, `no auditor link shown (got "${link}")`);
  else {
    await page.goto(link, { waitUntil: "networkidle" });
    await page.waitForSelector(".status-public__section", { timeout: 10_000 });
    await shoot(page, `${folder}/trust-auditor-view`);
  }

  await page.goto(`${BASE}/trust/centre`, { waitUntil: "networkidle" });
  const approve = page.locator("tr:has-text('Jordan Park') button", { hasText: /^Approve$/ });
  if ((await approve.count()) > 0) {
    await approve.click();
    await page.waitForSelector("tr:has-text('Jordan Park') button:has-text('It went out today')", {
      timeout: 10_000,
    });
    await page
      .locator("tr:has-text('Jordan Park') button", { hasText: "It went out today" })
      .click();
    await page.waitForSelector("tr:has-text('Jordan Park') :text('Sent')", { timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  await shoot(page, `${folder}/trust-centre-request-sent`);
}

/**
 * The changelog and the help centre: the drafted fixed-income entry published (its request
 * ships); an article written, answered and published; the article past its review read
 * again.
 */
async function captureKnowledgeFlows(page: Page, folder: string) {
  const stamp = Date.now().toString(36);
  await page.goto(`${BASE}/success/changelog/ab100002-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator("#entry-published").count()) > 0) {
    await page.locator("button", { hasText: /^Publish$/ }).click();
    await page.waitForSelector("#entry-reason", { timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  if ((await page.locator("td", { hasText: /^shipped$/ }).count()) === 0)
    report(`${folder}/changelog-published`, "publishing did not ship the request it answers");
  await shoot(page, `${folder}/changelog-published`);

  await page.goto(`${BASE}/help`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Write an article" }).click();
  await page.fill("#article-title", `Where are exports kept? ${stamp}`);
  await page.fill("#article-tags", "exports");
  await page.locator("button", { hasText: /^Start it$/ }).click();
  await page
    .waitForURL(/\/help\/[0-9a-f-]{36}$/, { timeout: 15_000 })
    .catch(() => report(`${folder}/help-article-published`, "starting an article did not open it"));
  await page.fill(
    "#edit-body",
    "Exports land in the Downloads folder unless one is chosen in Settings.",
  );
  await page.locator("button", { hasText: /^Save$/ }).click();
  await page.waitForSelector("form:has(#edit-body) .form-sent", { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("button", { hasText: /^Publish$/ }).click();
  await page.waitForSelector("button:has-text('Still true')", { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  await shoot(page, `${folder}/help-article-published`);

  await page.goto(`${BASE}/help/ab200002-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  if ((await page.getByText("Due for review since").count()) > 0) {
    await page.locator("button", { hasText: /^Still true$/ }).click();
    await page.waitForSelector("text=Due for review since", { state: "detached", timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  await shoot(page, `${folder}/help-article-reviewed`);
}

/**
 * References and reviews: consent recorded on a firm (calls and its logo); calls used up to
 * the firm's quarterly limit and the next one refused; the expiring call-only consent
 * withdrawn; last quarter's review written up and finalised; a new review started.
 */
async function captureRelationshipFlows(page: Page, folder: string) {
  const stamp = Date.now().toString(36);
  await page.goto(`${BASE}/companies/c0000000-0000-4000-8000-000000000001?tab=success`, {
    waitUntil: "networkidle",
  });
  await page.locator("summary", { hasText: "Record consent" }).click();
  await page.check("#ref-kind-logo");
  await page.fill("#ref-evidence", `Email of consent ${stamp}`);
  await page.locator("button", { hasText: /^Record it$/ }).click();
  await page.waitForSelector("form:has(#ref-evidence) .form-sent", { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  await shoot(page, `${folder}/company-reference-recorded`);

  await page.goto(`${BASE}/success/references/af000001-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  const recordCall = async () => {
    await page.selectOption("#use-kind", "call");
    await page.fill("#use-note", `Call ${stamp}`);
    await page.locator("button", { hasText: "Record the use" }).click();
    await page.waitForSelector("form:has(#use-note) .form-sent, form:has(#use-note) [role=alert]", {
      timeout: 10_000,
    });
  };
  // The firm's limit is two calls a quarter: by the third call of the quarter at the most,
  // one is refused, whatever earlier passes (or a new quarter) left behind.
  const refused = page.locator("form:has(#use-note) [role=alert]", { hasText: "limit is 2" });
  for (let attempt = 0; attempt < 3 && (await refused.count()) === 0; attempt += 1) {
    if (attempt > 0) await page.reload({ waitUntil: "networkidle" });
    await recordCall();
  }
  if ((await refused.count()) === 0)
    report(`${folder}/reference-rationed`, "a third call in the quarter was not refused");
  await shoot(page, `${folder}/reference-rationed`);

  await page.goto(`${BASE}/success/references/af000002-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator("#withdraw-reason").count()) > 0) {
    await page.fill("#withdraw-reason", "New compliance rules at the firm");
    await page.locator("button", { hasText: "Record the withdrawal" }).click();
    await page.waitForSelector("#withdraw-reason", { state: "detached", timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  await shoot(page, `${folder}/reference-withdrawn`);

  await page.goto(`${BASE}/success/reviews/b7100001-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator("#review-goals").count()) > 0) {
    await page.fill(
      "#review-actions",
      "Book a credit-desk demo; send the Q4 roadmap; renewal call in November.",
    );
    await page.locator("button", { hasText: /^Save$/ }).click();
    await page.waitForSelector("form:has(#review-actions) .form-sent", { timeout: 10_000 });
    await page.locator("button", { hasText: /^Finalise$/ }).click();
    await page.waitForSelector("#review-goals", { state: "detached", timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  if ((await page.getByText("renewal call in November").count()) === 0)
    report(`${folder}/review-final`, "the saved actions are not on the final review");
  await shoot(page, `${folder}/review-final`);

  await page.goto(`${BASE}/companies/c0000000-0000-4000-8000-000000000002?tab=success`, {
    waitUntil: "networkidle",
  });
  await page.locator("summary", { hasText: "Start a review" }).click();
  await page.locator("button", { hasText: /^Start it$/ }).click();
  await page
    .waitForURL(/\/success\/reviews\/[0-9a-f-]{36}$/, { timeout: 15_000 })
    .catch(() => report(`${folder}/review-started`, "starting a review did not open it"));
  await shoot(page, `${folder}/review-started`);
}

/**
 * Quotes: the waiting quote approved by someone other than its author, sent and signed (the
 * deal takes its value); a new quote started on the second deal, a line cut by 30 % so an
 * owner or admin must approve it, and sent for approval; the second deal's plan laid in
 * from the close date and its first step done.
 */
async function captureQuoteFlows(page: Page, folder: string) {
  const stamp = Date.now().toString(36);
  await page.goto(
    `${BASE}/deals/d0000000-0000-4000-8000-000000000001/quotes/qa000001-0000-4000-8000-000000000000`,
    { waitUntil: "networkidle" },
  );
  if ((await page.locator("#approve-note").count()) > 0) {
    await page.fill("#approve-note", "Two desks for a year earns it");
    await page.locator("button", { hasText: /^Approve$/ }).click();
    await page.waitForSelector("#approve-note", { state: "detached", timeout: 10_000 });
    await page.locator("button", { hasText: /^Mark as sent$/ }).click();
    await page.waitForSelector("#signer-name", { timeout: 10_000 });
    await page.fill("#signer-name", "Priya Nair");
    await page.fill("#signer-email", "priya@northwall.example");
    await page.fill("#signature-ref", "Signed copy in the deal folder");
    await page.locator("button", { hasText: /^Record the signature$/ }).click();
    await page.waitForSelector(".order-form__sign strong", { timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  if ((await page.locator(".order-form__sign strong", { hasText: "Priya Nair" }).count()) === 0)
    report(`${folder}/quote-signed`, "the signature is not on the order form");
  await shoot(page, `${folder}/quote-signed`);

  await page.goto(`${BASE}/deals/d0000000-0000-4000-8000-000000000002?tab=quotes`, {
    waitUntil: "networkidle",
  });
  await page.locator("summary", { hasText: "New quote" }).click();
  await page.fill("#quote-new-title", `Revised terms ${stamp}`);
  await page.locator("button", { hasText: "Start the quote" }).click();
  await page
    .waitForURL(/\/quotes\/[0-9a-f-]{36}$/, { timeout: 15_000 })
    .catch(() => report(`${folder}/quote-cut`, "starting a quote did not open it"));
  if ((await page.locator(".quote-editor__line").count()) === 0) {
    await page.locator("button", { hasText: "Add the plan" }).click();
  }
  const price = page.locator(".quote-editor__line input[inputmode='decimal']").first();
  const list = Number(await price.inputValue()) || 169;
  await price.fill(String(Math.round(list * 0.7)));
  if (
    (await page
      .locator(".quote-editor__totals", { hasText: "An owner or admin approves it" })
      .count()) === 0
  )
    report(`${folder}/quote-cut`, "a 30 % cut does not preview an owner's approval");
  await page.locator("button", { hasText: "Save the lines" }).click();
  await page.waitForSelector("form.quote-editor .form-sent", { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.locator("button", { hasText: /^Ask for approval$/ }).click();
  await page.waitForSelector(".rhead__status :text('Waiting for approval')", { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  await shoot(page, `${folder}/quote-cut`);

  await page.goto(`${BASE}/deals/d0000000-0000-4000-8000-000000000002?tab=plan`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator("button", { hasText: "Lay in the usual plan" }).count()) > 0) {
    await page.locator("button", { hasText: "Lay in the usual plan" }).click();
    await page.waitForSelector(".plan-steps", { timeout: 10_000 });
    const done = page.locator('button[aria-label^="Mark "][aria-label$=" done"]').first();
    const label = (await done.getAttribute("aria-label")) ?? "";
    await done.click();
    await page.waitForSelector(`button[aria-label="${label}"]`, {
      state: "detached",
      timeout: 10_000,
    });
    await page.reload({ waitUntil: "networkidle" });
  }
  if ((await page.locator(".plan-step").count()) < 6)
    report(`${folder}/deal-plan-laid`, "the usual plan did not lay in six steps");
  await shoot(page, `${folder}/deal-plan-laid`);
}

/**
 * Finance, part three: someone else's purchase request approved; the approved yearly
 * licence bought, which puts it on the vendor register; this month's data line closed with
 * an actual and where it came from.
 */
async function capturePlanFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/expenses/purchases`, { waitUntil: "networkidle" });
  const approve = page.locator('button[aria-label^="Approve "]').first();
  if ((await approve.count()) > 0) {
    const label = (await approve.getAttribute("aria-label")) ?? "";
    await approve.click();
    await page.waitForSelector(`button[aria-label="${label}"]`, {
      state: "detached",
      timeout: 10_000,
    });
    await page.reload({ waitUntil: "networkidle" });
  }
  const bought = page.locator('button[aria-label="Record Charting library licence as bought"]');
  if ((await bought.count()) > 0) {
    await bought.click();
    await page.waitForSelector("a:has-text('on the register')", { timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  await shoot(page, `${folder}/purchases-decided`);

  await page.goto(`${BASE}/finance/budget`, { waitUntil: "networkidle" });
  await page.selectOption("#budget-category", "data");
  await page.fill("#budget-currency", "USD");
  await page.fill("#budget-amount", "3000");
  await page.fill("#budget-actual", "3520");
  await page.fill("#budget-source", "Ledger P&L, run today");
  await page.locator("button", { hasText: "Save the line" }).click();
  await page.waitForSelector("form:has(#budget-source) .form-sent", { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  if ((await page.locator("tr:has-text('Data') :text('Over by more than a tenth')").count()) === 0)
    report(`${folder}/budget-closed`, "an actual 17 % over budget is not flagged");
  await shoot(page, `${folder}/budget-closed`);
}

/**
 * Finance: a balance recorded; an annual vendor added inside its notice window; an expense
 * claimed (its claimant is offered no approval) and someone else's claim approved; this
 * month's investor update started, and last month's written up and finalised.
 */
async function captureFinanceFlows(page: Page, folder: string) {
  const stamp = Date.now().toString(36);
  const inDays = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  await page.goto(`${BASE}/finance`, { waitUntil: "networkidle" });
  await page.selectOption("#balance-account", "fa000003-0000-4000-8000-000000000000");
  await page.fill("#balance-amount", "36900");
  await page.fill("#balance-note", `Statement ${stamp}`);
  await page.locator("button", { hasText: "Record the balance" }).click();
  await page.waitForSelector("form:has(#balance-amount) .form-sent", { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  if ((await page.locator(".runway").count()) < 2)
    report(`${folder}/finance-balance-recorded`, "a runway card per currency is missing");
  await shoot(page, `${folder}/finance-balance-recorded`);

  await page.goto(`${BASE}/finance/vendors`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Add a vendor" }).click();
  await page.fill("#vendor-name", `Analytics suite ${stamp}`);
  await page.selectOption("#vendor-category", "software");
  await page.selectOption("#vendor-billing", "annual");
  await page.fill("#vendor-amount", "2400");
  await page.fill("#vendor-renews", inDays(40));
  await page.locator("button", { hasText: "Add the vendor" }).click();
  await page.waitForSelector(`td:has-text("${stamp}")`, { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  // Forty days out with thirty days' notice: ten days left to decide.
  if ((await page.locator(`tr:has-text("${stamp}") :text("Decide")`).count()) === 0)
    report(
      `${folder}/finance-vendor-added`,
      "an annual renewal inside 30 days of its notice date is not flagged",
    );
  await shoot(page, `${folder}/finance-vendor-added`);

  await page.goto(`${BASE}/expenses`, { waitUntil: "networkidle" });
  await page.fill("#claim-amount", "18.40");
  await page.fill("#claim-description", `Taxi to the client ${stamp}`);
  await page.locator("button", { hasText: "Claim it" }).click();
  await page.waitForSelector(`td:has-text("${stamp}")`, { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  if ((await page.locator(`tr:has-text("${stamp}") button[aria-label^="Approve "]`).count()) > 0)
    report(`${folder}/expenses-decided`, "the claimant was offered their own approval");
  const approve = page.locator('button[aria-label^="Approve "]').first();
  if ((await approve.count()) > 0) {
    const label = (await approve.getAttribute("aria-label")) ?? "";
    await approve.click();
    await page.waitForSelector(`button[aria-label="${label}"]`, {
      state: "detached",
      timeout: 10_000,
    });
    await page.reload({ waitUntil: "networkidle" });
  }
  await shoot(page, `${folder}/expenses-decided`);

  const month = new Date().toISOString().slice(0, 7);
  await page.goto(`${BASE}/finance/updates`, { waitUntil: "networkidle" });
  if ((await page.locator(`td:text-is("${month}")`).count()) === 0) {
    await page.locator("summary", { hasText: "Start an update" }).click();
    await page.fill("#update-period", month);
    await page.locator("button", { hasText: "Start it" }).click();
    await page
      .waitForURL(/\/finance\/updates\/[0-9a-f-]{36}$/, { timeout: 15_000 })
      .catch(() =>
        report(`${folder}/finance-update-started`, "starting an update did not open it"),
      );
    await shoot(page, `${folder}/finance-update-started`);
  }

  await page.goto(`${BASE}/finance/updates/f7000001-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator("#update-asks").count()) > 0) {
    await page.fill("#update-asks", "Introductions to two heads of research at long/short funds.");
    await page.locator("button", { hasText: /^Save$/ }).click();
    await page.waitForSelector("form:has(#update-asks) .form-sent", { timeout: 10_000 });
    await page.locator("button", { hasText: /^Finalise$/ }).click();
    // Final, the words are no longer a form: the form going is the answer.
    await page.waitForSelector("#update-asks", { state: "detached", timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  if ((await page.getByText("Introductions to two heads of research").count()) === 0)
    report(`${folder}/finance-update-final`, "the saved asks are not on the final update");
  await shoot(page, `${folder}/finance-update-final`);
}

/**
 * Digests: a saved view added as a weekly digest, then "send me one now" — rendered by the
 * portal as the signed-in person and handed to the service to mail.
 */
async function captureDigestFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/me/digests`, { waitUntil: "networkidle" });
  if ((await page.locator("#digest-view").count()) > 0) {
    await page.selectOption("#digest-cadence", "weekly");
    await page.selectOption("#digest-weekday", "0");
    await page.selectOption("#digest-hour", "7");
    await page.locator("button", { hasText: "Add the digest" }).click();
    await page.waitForSelector("form:has(#digest-view) .form-sent, #add .muted", {
      timeout: 10_000,
    });
    await page.reload({ waitUntil: "networkidle" });
  }
  const now = page.locator("button", { hasText: "Send me one now" }).first();
  if ((await now.count()) === 0) report(`${folder}/me-digests-sent`, "no digest to send");
  else {
    await now.click();
    await page.waitForSelector("text=Sent to your address", { timeout: 20_000 });
  }
  await shoot(page, `${folder}/me-digests-sent`);
}

/**
 * Automations: one started on companies, built (lifecycle changes to customer → a task and
 * a notification), tried on the last fifty and published; then the Renewal pack button is
 * pressed on a company page.
 */
async function captureAutomationFlows(page: Page, folder: string) {
  const stamp = Date.now().toString(36);
  await page.goto(`${BASE}/admin/automations`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Start an automation" }).click();
  await page.fill("#auto-new-name", `Harness welcome ${stamp}`);
  await page.selectOption("#auto-new-type", "company");
  await page.locator("button", { hasText: "Start it" }).click();
  await page
    .waitForURL(/\/admin\/automations\/[0-9a-f-]{36}$/, { timeout: 15_000 })
    .catch(() => report(`${folder}/automation-built`, "starting an automation did not open it"));
  await page.waitForSelector(".automation-builder", { timeout: 10_000 });
  await page.selectOption("#auto-trigger", "field_changed");
  await page.selectOption("#auto-trigger-field", "lifecycle");
  await page.selectOption("#auto-trigger-to", "customer");
  await page.locator("button", { hasText: "Add a condition" }).click();
  await page.selectOption("#auto-cond-field-0", "country");
  await page.selectOption("#auto-cond-op-0", "set");
  await page.selectOption("#auto-next-kind", "task");
  await page.locator(".automation-builder__add button", { hasText: "Add" }).click();
  await page.fill("#auto-step-title-0", "Send the harness welcome pack");
  await page.selectOption("#auto-next-kind", "notify");
  await page.locator(".automation-builder__add button", { hasText: "Add" }).click();
  await page.fill("#auto-step-message-1", "A new customer: say thank you.");
  await page.locator("button", { hasText: "Save the draft" }).click();
  await page.waitForSelector(".automation-builder .form-sent", { timeout: 10_000 });
  await page.locator("button", { hasText: "Try the saved draft" }).click();
  await page.waitForSelector(".dry-run__row", { timeout: 10_000 });
  await shoot(page, `${folder}/automation-built`);
  await page.locator("button", { hasText: /^Publish version 1$/ }).click();
  await page.waitForSelector(".rhead__status :text('Running')", { timeout: 10_000 });

  // A prospect becomes a customer: the automation runs on it.
  await page.goto(`${BASE}/admin/automations`, { waitUntil: "networkidle" });
  if ((await page.locator(`a:has-text("Harness welcome ${stamp}")`).count()) === 0)
    report(`${folder}/automation-built`, "the new automation is not listed");
  await shoot(page, `${folder}/admin-automations-worked`);

  await page.goto(`${BASE}/companies/c0000000-0000-4000-8000-000000000002`, {
    waitUntil: "networkidle",
  });
  const press = page.locator("button", { hasText: "Renewal pack" }).first();
  if ((await press.count()) > 0) {
    await press.click();
    await page.waitForTimeout(800);
    await page.reload({ waitUntil: "networkidle" });
  } else
    report(
      `${folder}/company-automation-pressed`,
      "the Renewal pack button is not on the company page",
    );
  await shoot(page, `${folder}/company-automation-pressed`);
}

/**
 * Custom fields: one added on companies (a list), filled in on a company from its Fields
 * section, then used as a filter on the companies list.
 */
async function captureFieldFlows(page: Page, folder: string) {
  const stamp = Date.now().toString(36);
  await page.goto(`${BASE}/admin/fields`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Add a field" }).click();
  await page.selectOption("#field-record", "company");
  await page.selectOption("#field-kind", "choice");
  await page.fill("#field-label", `Coverage ${stamp}`);
  await page.fill("#field-options", "Europe\nAmericas\nAsia");
  await page.locator("button", { hasText: "Add the field" }).click();
  await page.waitForSelector(`a:has-text("Coverage ${stamp}")`, { timeout: 10_000 });
  await shoot(page, `${folder}/admin-fields-added`);

  await page.goto(`${BASE}/companies/c0000000-0000-4000-8000-000000000002`, {
    waitUntil: "networkidle",
  });
  await page.locator("summary", { hasText: "Edit the fields" }).first().click();
  await page.selectOption("#cf-company-strategy", "credit");
  await page.fill("#cf-company-regulator", "SEC");
  await page.locator("button", { hasText: "Save the fields" }).click();
  await page.waitForSelector(".prop__value:has-text('SEC')", { timeout: 10_000 });
  await shoot(page, `${folder}/company-fields-saved`);

  await page.goto(`${BASE}/companies?f=custom.strategy:is:Credit`, { waitUntil: "networkidle" });
  if ((await page.locator("tbody tr").count()) < 1)
    report(`${folder}/companies-custom-filter`, "filtering on a custom field found nothing");
  await shoot(page, `${folder}/companies-custom-filter`);
}

/**
 * Prospects, end to end: a small file rehearsed and then brought in through the import
 * page (one row left out and named), a verifier's answer applied to it, the view narrowed
 * by a facet and tagged as a whole, the view saved as a segment and written to with a cap
 * (the first five, best fit first), a prospect edited in place and its firm stopped, a
 * country's rule set and put back, the checks flipped and restored, the view exported as
 * a file, and the file taken back out — which leaves the one somebody edited.
 */
/**
 * Let campaigns write to prospects, or not: the one switch on the sending rules that a
 * campaign through the provider waits on. Changed only when it differs, so a pass that
 * died half-way leaves nothing for the next one to trip on.
 */
async function setProviderCampaigns(page: Page, on: boolean, name: string) {
  await page.goto(`${BASE}/leads/rules`, { waitUntil: "networkidle" });
  if ((await page.locator("#sudo-code").count()) > 0) {
    await page.fill("#sudo-code", "000000");
    await page.locator(".sudo-gate button[type=submit]").click();
  }
  await page.waitForSelector(".sudo-gate--open", { timeout: 10_000 });
  const box = page.locator("#cold-provider_campaigns");
  if ((await box.isChecked()) === on) return;
  await box.setChecked(on);
  await page.fill(
    "#cold-checks-reason",
    on ? "The harness sends its own invented rows by campaign" : "Back to the default",
  );
  await page.locator("button", { hasText: "Save the checks" }).click();
  await page.waitForSelector("form:has(#cold-checks-reason) .form-sent", { timeout: 15_000 });
  await page.reload({ waitUntil: "networkidle" });
  if ((await page.locator("#cold-provider_campaigns").isChecked()) !== on)
    report(name, `campaigns may ${on ? "still not" : "still"} write to prospects`);
  await shoot(page, name);
}

/**
 * Connected mailboxes, end to end. An address whose mail lives with a host that has its
 * own consent screen goes there and comes back connected (the mock approves at once and
 * signs in as the address asked for); an address on the team's own host comes back to
 * the server form with its servers filled in, where a refused password and a server that
 * answers nothing both keep nothing, and the right one connects. The new mailbox is
 * paced, declared warm, paused, resumed and checked; the server one is disconnected so
 * the next pass can add it again; the pool's warm-up is changed and put back.
 */
async function captureMailboxFlows(page: Page, folder: string) {
  const consent = "harness.desk@gmail.com";
  const server = "harness.desk@quantifyterminal.com";
  await page.goto(`${BASE}/mail/mailboxes`, { waitUntil: "networkidle" });
  await page.fill("#connect-address", consent);
  await page.locator("button", { hasText: /^Connect$/ }).click();
  await page.waitForURL("**/mail/mailboxes?connected=*", { timeout: 30_000 });
  if (!page.url().includes("connected=connected"))
    report(`${folder}/mail-mailbox-connected`, `the consent round trip came back as ${page.url()}`);
  const consentRow = page.locator("tr", { hasText: consent });
  if ((await consentRow.count()) === 0)
    report(`${folder}/mail-mailbox-connected`, "the connected mailbox is not in the table");
  await shoot(page, `${folder}/mail-mailbox-connected`);

  // The team's own host has no consent screen: the address comes back to the server form.
  await page.fill("#connect-address", server);
  await page.locator("button", { hasText: /^Connect$/ }).click();
  await page.waitForURL("**/mail/mailboxes?add=*", { timeout: 30_000 });
  await page.waitForSelector("#add-address", { timeout: 15_000 });
  if ((await page.inputValue("#add-smtp")) !== "smtppro.zoho.in")
    report(
      `${folder}/mail-mailbox-add`,
      `the outgoing server reads "${await page.inputValue("#add-smtp")}"`,
    );
  if ((await page.locator("#sudo-code").count()) > 0) {
    await page.fill("#sudo-code", "000000");
    await page.locator(".sudo-gate button[type=submit]").click();
  }
  await page.waitForSelector(".sudo-gate--open", { timeout: 10_000 });
  const addForm = page.locator("form:has(#add-password)");
  await page.fill("#add-password", "a-wrong-password");
  await addForm.locator("button[type=submit]").click();
  await addForm.locator("[role=alert]", { hasText: "refused that password" }).waitFor({
    timeout: 15_000,
  });
  await page.fill("#add-smtp", "nowhere.example");
  await page.fill("#add-password", "app-password");
  await addForm.locator("button[type=submit]").click();
  await addForm
    .locator("[role=alert]", { hasText: "Nothing answered at nowhere.example" })
    .waitFor({
      timeout: 15_000,
    });
  await shoot(page, `${folder}/mail-mailbox-refused`);
  await page.fill("#add-smtp", "smtppro.zoho.in");
  await page.fill("#add-password", "app-password");
  await addForm.locator("button[type=submit]").click();
  await addForm.locator(".form-sent", { hasText: `Connected ${server}` }).waitFor({
    timeout: 15_000,
  });

  // Pace the consent-connected one, then declare it warm when it is still warming.
  await page.goto(`${BASE}/mail/mailboxes`, { waitUntil: "networkidle" });
  await page.locator(`a[aria-label="Change ${consent}"]`).click();
  await page.waitForSelector(`#mailbox-change:has-text("Change ${consent}")`, { timeout: 15_000 });
  const change = page.locator("section[aria-labelledby='mailbox-change']");
  await change.locator("input[name=daily_cap]").fill("40");
  await change.locator("input[name=gap_minutes]").fill("15");
  await change.locator("button", { hasText: "Save the pace" }).click();
  await change.locator(".form-sent", { hasText: "Saved" }).waitFor({ timeout: 15_000 });
  if ((await change.locator("button", { hasText: "Send from today" }).count()) > 0) {
    await page.fill("#warm-reason", "In daily use for a year before it was connected");
    await change.locator("button", { hasText: "Send from today" }).click();
    // The form goes once it has done its work; the card then says what is true now.
    await change
      .locator(".card__desc", { hasText: "It has sent since" })
      .waitFor({ timeout: 15_000 });
  }
  await page.reload({ waitUntil: "networkidle" });
  const paced = (await page.locator("tr", { hasText: consent }).innerText()).replace(/\s+/g, " ");
  if (!/15–21 min apart/.test(paced) || !/Sending/.test(paced))
    report(`${folder}/mail-mailbox-change`, `the paced mailbox reads "${paced.slice(0, 200)}"`);
  await shoot(page, `${folder}/mail-mailbox-change`);

  // Paused and resumed from its row; then a check that it signs in.
  await page.locator(`button[aria-label="Pause ${consent}"]`).click();
  await page.locator(`button[aria-label="Resume ${consent}"]`).waitFor({ timeout: 15_000 });
  if (
    (await page
      .locator("tr", { hasText: consent })
      .locator(".pill", { hasText: "Paused" })
      .count()) === 0
  )
    report(`${folder}/mail-mailbox-paused`, "the paused mailbox does not say so");
  await page.locator(`button[aria-label="Resume ${consent}"]`).click();
  await page.locator(`button[aria-label="Pause ${consent}"]`).waitFor({ timeout: 15_000 });
  await page.locator(`a[aria-label="Change ${consent}"]`).click();
  await page.waitForSelector(`#mailbox-change:has-text("Change ${consent}")`, { timeout: 15_000 });
  await page.locator(`button[aria-label="Check that ${consent} signs in"]`).click();
  await page
    .locator(".mailbox-checks .form-sent", { hasText: "Signed in" })
    .waitFor({ timeout: 15_000 });

  // The server one disconnected, so the next pass can add it again.
  // The panel below the table is the one for the mailbox just chosen only once the page
  // has moved: its heading names it. (The previous one's form is still there until then.)
  await page.locator(`a[aria-label="Change ${server}"]`).click();
  await page.waitForSelector(`#mailbox-change:has-text("Change ${server}")`, { timeout: 15_000 });
  await page.fill("#disconnect-reason", "The harness takes its mailbox away again");
  await page.locator("button", { hasText: /^Disconnect$/ }).click();
  // The panel then says what is true now, in place of the form that did it.
  await page
    .locator("section[aria-labelledby='mailbox-change']", { hasText: "its sign-in was wiped" })
    .waitFor({ timeout: 15_000 });
  await page.goto(`${BASE}/mail/mailboxes`, { waitUntil: "networkidle" });
  const gone = page.locator("tr", { hasText: server });
  if ((await gone.locator(".pill", { hasText: "Disconnected" }).count()) === 0)
    report(`${folder}/mail-mailbox-disconnected`, "the disconnected mailbox does not say so");
  await shoot(page, `${folder}/mail-mailbox-disconnected`);

  // The pool's warm-up changed with a reason, and put back.
  const warmUp = await page.inputValue("#warm-up");
  await page.fill("#warm-up", warmUp === "28" ? "21" : "28");
  await page.fill("#ceilings-reason", "The harness tries a longer warm-up");
  await page.locator("button", { hasText: "Save the ceilings" }).click();
  await page.locator("form:has(#ceilings-reason) .form-sent").waitFor({ timeout: 15_000 });
  await page.reload({ waitUntil: "networkidle" });
  await page.fill("#warm-up", warmUp);
  await page.fill("#ceilings-reason", "The harness puts the warm-up back");
  await page.locator("button", { hasText: "Save the ceilings" }).click();
  await page.locator("form:has(#ceilings-reason) .form-sent").waitFor({ timeout: 15_000 });
  console.log(`  ✓ ${folder}/mail-mailbox-ceilings`);

  // Replies: the owner's mailbox read now. The answer waiting in its inbox is kept with its
  // follow-ups paused and what it reads as, and recorded in one press; later passes find it
  // settled. The seeded interested reply waits throughout.
  await page.goto(`${BASE}/mail/mailboxes`, { waitUntil: "networkidle" });
  await page.locator('a[aria-label="Change owner@quantifyterminal.co"]').click();
  await page.waitForSelector('#mailbox-change:has-text("Change owner@quantifyterminal.co")', {
    timeout: 15_000,
  });
  await page
    .locator('button[aria-label="Read the replies in owner@quantifyterminal.co now"]')
    .click();
  await page.locator(".mailbox-checks .form-sent").waitFor({ timeout: 15_000 });
  await page.goto(`${BASE}/mail/replies`, { waitUntil: "networkidle" });
  if ((await page.locator(".reply-item", { hasText: "pricing for a desk of four" }).count()) === 0)
    report(`${folder}/mail-replies-read`, "the seeded reply is not waiting");
  const later = page.locator(".reply-item", { hasText: "mid-way through a migration" });
  if ((await later.count()) === 0) {
    report(`${folder}/mail-replies-read`, "the reply waiting in the inbox was not read");
  } else if ((await later.locator("button", { hasText: "Record: Not now" }).count()) > 0) {
    if (!/Follow-ups paused/.test(await later.innerText()))
      report(`${folder}/mail-replies-read`, "the read reply does not say its follow-ups paused");
    await shoot(page, `${folder}/mail-replies-read`);
    await later.locator("button", { hasText: "Record: Not now" }).click();
    await page
      .locator(".reply-item", { hasText: "mid-way through a migration" })
      .locator(".reply-item__said", { hasText: "Recorded: not now" })
      .waitFor({ timeout: 15_000 });
  }
  // Whoever a "wrong person" reply names instead is one press from being a prospect.
  const named = page.locator(".reply-item__referrals li", { hasText: "Priya Nair" }).first();
  if ((await named.count()) === 0) {
    report(`${folder}/mail-replies-referral`, "the colleague the reply names is not offered");
  } else if ((await named.locator("button", { hasText: "Add as a prospect" }).count()) > 0) {
    await named.locator("button", { hasText: "Add as a prospect" }).click();
    await page
      .locator(".reply-item__referrals li", { hasText: "Priya Nair" })
      .locator("a", { hasText: "Already a lead" })
      .waitFor({ timeout: 15_000 });
  }
  await shoot(page, `${folder}/mail-replies-recorded`);
}

/**
 * Data quality: a look-alike group judged not the same and asked about again, a prospect
 * marked as the CRM person it already is, a merge with one field taken from the other
 * record, and a tidy-up after its preview. The flow works its own seeded records (Arjun
 * Nair twice, Elena Marsh), so the screens keep theirs; a later pass finds them settled.
 */
async function captureDataQualityFlows(page: Page, folder: string) {
  const lotus = "riyer@lotusalternatives.example";
  await page.goto(`${BASE}/leads/duplicates?reason=same_mailbox`, { waitUntil: "networkidle" });
  const lotusGroup = page.locator("article.card", { hasText: lotus });
  if ((await lotusGroup.count()) === 0) {
    report(`${folder}/lead-duplicates-dismissed`, "the same-mailbox group is not offered");
  } else {
    await lotusGroup.locator("button", { hasText: "Not the same" }).click();
    // The card goes with its form; the list of judgements says what is true now.
    await page
      .locator("section[aria-labelledby='dismissed']", { hasText: "Judged not the same" })
      .waitFor({ timeout: 15_000 });
    if ((await page.locator("article.card", { hasText: lotus }).count()) > 0)
      report(`${folder}/lead-duplicates-dismissed`, "the dismissed group is still offered");
    await shoot(page, `${folder}/lead-duplicates-dismissed`);
    await page
      .locator("section[aria-labelledby='dismissed'] button", { hasText: "Ask again" })
      .first()
      .click();
    await page.locator("article.card", { hasText: lotus }).waitFor({ timeout: 15_000 });
  }

  // A prospect the CRM already holds, marked as that person.
  const elena = "elena.marsh@meridian-capital.example";
  const elenaId = "1f000911-0000-4000-8000-000000000001";
  await page.goto(`${BASE}/leads/duplicates?reason=crm`, { waitUntil: "networkidle" });
  const elenaGroup = page.locator("article.card", { hasText: elena });
  if ((await elenaGroup.count()) > 0) {
    await elenaGroup.locator("button", { hasText: "This lead is Elena Marsh" }).click();
    await page
      .locator("article.card", { hasText: elena })
      .waitFor({ state: "detached", timeout: 15_000 });
  }
  await page.goto(`${BASE}/leads/${elenaId}`, { waitUntil: "networkidle" });
  if ((await page.locator(".side-quiet", { hasText: "Already in the CRM as" }).count()) === 0)
    report(`${folder}/lead-duplicate-of-person`, "the marked lead does not name the person");
  await shoot(page, `${folder}/lead-duplicate-of-person`);

  // The merge: the other record's name chosen, then the kept lead's history says so.
  const keep = "1f000909-0000-4000-8000-000000000001";
  const fold = "1f000910-0000-4000-8000-000000000001";
  await page.goto(`${BASE}/leads/duplicates/merge?keep=${keep}&fold=${fold}`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator("#merge-fields").count()) > 0) {
    if ((await page.locator("#sudo-code").count()) > 0) {
      await page.fill("#sudo-code", "000000");
      await page.locator(".sudo-gate button[type=submit]").click();
    }
    await page.waitForSelector(".sudo-gate--open", { timeout: 10_000 });
    await page.locator(`input[name="choose.name"][value="${fold}"]`).check();
    await shoot(page, `${folder}/lead-merge-chosen`);
    await page.locator("button", { hasText: /^Merge 1 lead into/ }).click();
    await page.waitForURL(`**/leads/${keep}`, { timeout: 30_000 });
    await page.waitForSelector(".record-layout", { timeout: 15_000 });
    const record = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    if (!record.includes("Nair Arjun"))
      report(`${folder}/lead-merged`, "the kept lead does not carry the chosen name");
    if (!record.includes("Merged 1 duplicate into this lead"))
      report(`${folder}/lead-merged`, "the kept lead's history does not record the merge");
    await shoot(page, `${folder}/lead-merged`);
  }
  await page.goto(`${BASE}/leads/${fold}`, { waitUntil: "networkidle" });
  if ((await page.locator(".side-quiet", { hasText: "Folded into" }).count()) === 0)
    report(`${folder}/lead-folded`, "the folded lead does not say where it went");

  // A tidy-up after its preview: the countries, so the names' preview stays for the screens.
  await page.goto(`${BASE}/data-health/tidy?kind=country`, { waitUntil: "networkidle" });
  const apply = page.locator("button", { hasText: /^Change [0-9,]+ leads?$/ });
  if ((await apply.count()) > 0) {
    await shoot(page, `${folder}/data-health-tidy-country`);
    await apply.click();
    // The preview empties once the change is made: the page then says there is nothing left.
    await page
      .locator(".callout", { hasText: "Nothing to put right" })
      .waitFor({ timeout: 30_000 });
  }
  await page.goto(`${BASE}/data-health`, { waitUntil: "networkidle" });
  const countries = (await page.locator("#check-countries_spelled_otherwise").innerText()).replace(
    /\s+/g,
    " ",
  );
  if (!countries.includes("None"))
    report(`${folder}/data-health-after`, `countries still read "${countries.slice(0, 160)}"`);
  await shoot(page, `${folder}/data-health-after`);
}

async function captureProspectFlows(page: Page, folder: string) {
  const stamp = Date.now().toString(36);
  const csv = [
    "email,first_name,last_name,title,company,firm_type,country,Fund size",
    ...Array.from(
      { length: 24 },
      (_, index) =>
        `flow${index}@harness${stamp}${index}.example,Flow${index},Tester,Portfolio Manager,Harness ${stamp} ${index},Harness fund,India,${index + 1}00m`,
    ),
    "not an address,Bad,Row,,Nobody,Harness fund,India,",
  ].join("\n");

  await page.goto(`${BASE}/leads/import`, { waitUntil: "networkidle" });
  await page.setInputFiles("#lead-csv", {
    name: `harness-${stamp}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(csv, "utf8"),
  });
  await page.waitForSelector("#lead-map-email", { timeout: 10_000 });
  await page.fill("#lead-import-reason", "The harness's own invented rows");
  await shoot(page, `${folder}/lead-import-mapped`);
  // First as a rehearsal: the same accounting, nothing written.
  await page.locator("button", { hasText: "Try it first" }).click();
  await page.waitForSelector("#lead-import-done:has-text('What this file would do')", {
    timeout: 30_000,
  });
  const rehearsed = await page.locator(".list-import__counts dd").allInnerTexts();
  if (rehearsed[0] !== "24" || rehearsed[3] !== "1")
    report(
      `${folder}/lead-import-rehearsed`,
      `expected 24 would be added and 1 left out, saw ${rehearsed.join("/")}`,
    );
  await shoot(page, `${folder}/lead-import-rehearsed`);
  await page.locator("button", { hasText: /Add [0-9,]+ rows as prospects/ }).click();
  await page.waitForSelector("#lead-import-done:has-text('What happened')", {
    timeout: 30_000,
  });
  const counts = await page.locator(".list-import__counts dd").allInnerTexts();
  if (counts[0] !== "24" || counts[3] !== "1")
    report(
      `${folder}/lead-import-done`,
      `expected 24 added and 1 left out, saw ${counts.join("/")}`,
    );
  await shoot(page, `${folder}/lead-import-done`);

  // A verifier's answer: twenty good, two the verifier could not vouch for, one dead, one
  // word nobody knows, and an address that is not a lead here.
  const verdicts = [
    "Email,Status",
    ...Array.from({ length: 24 }, (_, index) => {
      const word =
        index < 20 ? "valid" : index < 22 ? "Catch-All" : index < 23 ? "invalid" : "maybe";
      return `flow${index}@harness${stamp}${index}.example,${word}`;
    }),
    `stranger@harness${stamp}.example,valid`,
  ].join("\n");
  await page.setInputFiles("#verification-csv", {
    name: `verified-${stamp}.csv`,
    mimeType: "text/csv",
    buffer: Buffer.from(verdicts, "utf8"),
  });
  await page.waitForSelector("#verification-map-result", { timeout: 10_000 });
  const reads = await page
    .locator("[aria-label='What the file says and how it is read'] tbody tr")
    .allInnerTexts();
  if (reads.length !== 4 || !reads.some((row) => /catch-all.*Risky/.test(row)))
    report(`${folder}/lead-verification-mapped`, `the file's words read ${reads.join(" | ")}`);
  await page.locator("button", { hasText: /^Apply 25 results$/ }).click();
  await page.waitForSelector("#verification-import-done", { timeout: 30_000 });
  const applied = await page
    .locator(".list-import__result:has(#verification-import-done) .list-import__counts dd")
    .allInnerTexts();
  if (applied.join("/") !== "23/0/1/1")
    report(
      `${folder}/lead-verification-done`,
      `expected 23 updated, 0 unchanged, 1 not a lead, 1 unknown; saw ${applied.join("/")}`,
    );
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, `${folder}/lead-verification-done`);

  // The file's own leads, narrowed by a facet row, then one change to the whole view.
  await page.goto(
    `${BASE}/leads/prospects?f=${encodeURIComponent(`import:is:harness-${stamp}.csv`)}`,
    { waitUntil: "networkidle" },
  );
  if ((await page.locator(".data-table tbody tr").count()) !== 24)
    report(`${folder}/prospects-by-file`, "the file's 24 leads are not the view");
  await page.locator(".facets__row", { hasText: "Harness fund" }).click();
  await page.waitForURL(/firm_type/, { timeout: 10_000 });
  await page.waitForLoadState("networkidle");
  await page.locator("summary", { hasText: "Change the whole view" }).click();
  await page.selectOption("#bulk-change", "tags_add");
  await page.fill("#bulk-tags", `harness ${stamp}`);
  await page.check("#bulk-confirm");
  await page.locator("button", { hasText: "Apply to the whole view" }).click();
  await page.waitForSelector("text=/Changed 24 leads of 24/", { timeout: 15_000 });
  await shoot(page, `${folder}/prospects-bulk-done`);

  // A view of everyone (a change to the unfiltered list is not offered; a filter that every
  // prospect passes is): more than a request carries, so it runs in the background. The
  // first slice goes in the request; each read of the page works another until it ends.
  const everyoneView = `${BASE}/leads/prospects?f=${encodeURIComponent("tags:nhas:never")}`;
  await page.goto(everyoneView, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Change the whole view" }).click();
  await page.selectOption("#bulk-change", "tags_add");
  await page.fill("#bulk-tags", `everyone ${stamp}`);
  await page.check("#bulk-confirm");
  await page.locator("button", { hasText: "Apply to the whole view" }).click();
  await page.waitForSelector("text=/in the background/", { timeout: 15_000 });
  await page.reload({ waitUntil: "networkidle" });
  if ((await page.locator(".lead-jobs").count()) === 0)
    report(`${folder}/prospects-bulk-background`, "no banner for the change in the background");
  await shoot(page, `${folder}/prospects-bulk-background`);
  for (let read = 0; read < 12; read += 1) {
    if ((await page.locator(".lead-jobs .callout", { hasText: "Finished" }).count()) > 0) break;
    await page.reload({ waitUntil: "networkidle" });
  }
  if ((await page.locator(".lead-jobs .callout", { hasText: "Finished" }).count()) === 0)
    report(`${folder}/prospects-bulk-background`, "the change in the background never finished");
  const everyone = await page
    .locator(".stat", { hasText: "In this view" })
    .locator(".stat__value")
    .innerText();
  await page.goto(`${BASE}/leads/prospects?f=${encodeURIComponent(`tags:has:everyone ${stamp}`)}`, {
    waitUntil: "networkidle",
  });
  const tagged = await page
    .locator(".stat", { hasText: "In this view" })
    .locator(".stat__value")
    .innerText();
  if (tagged !== everyone)
    report(`${folder}/prospects-bulk-background`, `${tagged} of ${everyone} carry the tag`);

  await page.goto(`${BASE}/leads/prospects?f=${encodeURIComponent(`tags:has:harness ${stamp}`)}`, {
    waitUntil: "networkidle",
  });
  await page.locator("summary", { hasText: "Save as a segment" }).click();
  await page.fill("#segment-name", `Harness ${stamp}`);
  await page.locator("button", { hasText: /^Save segment$/ }).click();
  await page.waitForSelector("text=/Saved\\. 24 leads match today/", { timeout: 15_000 });
  await shoot(page, `${folder}/prospects-segment-saved`);
  await page.goto(`${BASE}/leads/segments`, { waitUntil: "networkidle" });
  if ((await page.locator("tr", { hasText: `Harness ${stamp}` }).count()) < 1)
    report(`${folder}/lead-segments-saved`, "the saved view is not listed as a segment");
  await shoot(page, `${folder}/lead-segments-saved`);

  // A campaign leaves prospects out unless an admin says otherwise: say so, with a reason,
  // for the capped send below; the rules part further down puts the default back.
  await setProviderCampaigns(page, true, `${folder}/lead-rules-provider-on`);

  // The same view straight into a campaign, capped: the first five, best fit first. Of
  // the twenty-four, twenty are verified good, so fifteen stay for the next send.
  await page.goto(`${BASE}/leads/prospects?f=${encodeURIComponent(`tags:has:harness ${stamp}`)}`, {
    waitUntil: "networkidle",
  });
  await page.locator("summary", { hasText: "Save as a segment" }).click();
  await page.fill("#segment-name", `Harness ${stamp} first five`);
  await page.locator("button", { hasText: "Save and write a campaign" }).click();
  await page.waitForURL("**/mail/campaigns/new?segment=*", { timeout: 15_000 });
  await page.fill("#campaign-name", `Harness ${stamp}: the first five`);
  await page.fill("#campaign-limit", "5");
  await page.locator("button", { hasText: "Save draft" }).click();
  await page.waitForURL(/\/mail\/campaigns\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await page.waitForSelector("#campaign-audience", { timeout: 15_000 });
  const reach = (
    await page.locator("section[aria-labelledby='campaign-audience']").innerText()
  ).replace(/\s+/g, " ");
  if (
    !/5 will get it/.test(reach) ||
    !/Capped at 5/.test(reach) ||
    !/15 more could be written to/.test(reach)
  )
    report(`${folder}/mail-campaign-capped`, `the capped campaign reads "${reach.slice(0, 200)}"`);
  await shoot(page, `${folder}/mail-campaign-capped`);

  // The capped send goes out (five people, no customer: no second approval), its results
  // break down by the file's one firm type, and its next slice is one press: a draft that
  // leaves out the five it reached.
  await page.locator("button", { hasText: "Send me a test" }).click();
  await page.waitForSelector("button:has-text('Submit'):not([disabled])", { timeout: 15_000 });
  await page.locator("button", { hasText: "Submit" }).click();
  await page.waitForSelector("button:has-text('Start sending')", { timeout: 15_000 });
  await page.locator("button", { hasText: "Start sending" }).click();
  await page.waitForSelector("button:has-text('Pause'), .rhead__status:has-text('Sent')", {
    timeout: 15_000,
  });
  await page.waitForSelector("#campaign-breakdown", { timeout: 15_000 });
  const byType = (
    await page.locator("section[aria-labelledby='campaign-breakdown']").innerText()
  ).replace(/\s+/g, " ");
  if (!/Harness fund\s+5/.test(byType))
    report(
      `${folder}/mail-campaign-breakdown`,
      `the results by firm type read "${byType.slice(0, 160)}"`,
    );
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, `${folder}/mail-campaign-breakdown`);
  await page.locator("button", { hasText: "Draft the next slice" }).click();
  await page.waitForURL(/\/mail\/campaigns\/[0-9a-f-]{36}$/, { timeout: 15_000 });
  await page.waitForSelector("#campaign-audience", { timeout: 15_000 });
  const slice = (
    await page.locator("section[aria-labelledby='campaign-audience']").innerText()
  ).replace(/\s+/g, " ");
  const sliceTitle = await page.locator("h1").first().innerText();
  if (
    !/part 2/.test(sliceTitle) ||
    !/5 will get it/.test(slice) ||
    !/Reached by an earlier slice/.test(slice)
  )
    report(
      `${folder}/mail-campaign-next-slice`,
      `the next slice reads "${sliceTitle}" / "${slice.slice(0, 200)}"`,
    );
  await shoot(page, `${folder}/mail-campaign-next-slice`);

  // Edit one in place: it is no longer untouched, so taking the file back leaves it.
  await page.goto(
    `${BASE}/leads/prospects?f=${encodeURIComponent(`import:is:harness-${stamp}.csv`)}&sort=lead`,
    { waitUntil: "networkidle" },
  );
  await page.locator(".data-table tbody tr a.table-title").first().click();
  await page.waitForSelector(".record-layout", { timeout: 15_000 });
  const owner = page.locator(".prop", { hasText: "Owner" }).first();
  await owner.locator("button").first().click();
  await owner.locator("select").selectOption({ index: 1 });
  await owner.locator("select").press("Enter");
  await page
    .waitForSelector(".prop:has-text('Owner') :text('Saved')", { timeout: 10_000 })
    .catch(() => {});
  if ((await page.locator(".kv__row", { hasText: "The firm's domain" }).count()) === 0)
    report(`${folder}/prospect-owned`, "the record does not say the firm's domain");
  await shoot(page, `${folder}/prospect-owned`);

  // The whole firm stopped from the record: the stop list opens with its domain filled in.
  await page.locator("a", { hasText: "Stop the whole firm" }).click();
  await page.waitForURL("**/mail/suppressions?firm=*", { timeout: 15_000 });
  await page.waitForSelector("#stop-domain", { timeout: 15_000 });
  const stoppedFirm = await page.inputValue("#stop-domain");
  if (!stoppedFirm.endsWith(".example"))
    report(`${folder}/stop-list-firm`, `the firm's domain was not carried: "${stoppedFirm}"`);
  await page.fill("#stop-domain-detail", "The firm asked not to be written to");
  await page.locator("button", { hasText: "Stop the firm" }).click();
  await page.waitForSelector("text=/The firm is stopped/", { timeout: 15_000 });
  if (
    (await page
      .locator("tr", { hasText: stoppedFirm })
      .locator(".table-sub", { hasText: "Every address at this firm" })
      .count()) === 0
  )
    report(`${folder}/stop-list-firm`, "the firm's row does not read as a whole-firm stop");
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, `${folder}/stop-list-firm`);

  // The sending rules: a country nobody decided, decided and put back; a check flipped
  // and restored. Both need the fresh code, both are audited with their reason.
  await page.goto(`${BASE}/leads/rules`, { waitUntil: "networkidle" });
  if ((await page.locator("#sudo-code").count()) > 0) {
    await page.fill("#sudo-code", "000000");
    await page.locator(".sudo-gate button[type=submit]").click();
  }
  await page.waitForSelector(".sudo-gate--open", { timeout: 10_000 });
  const heldFirm = page.locator(".reason-list li", {
    hasText: "The firm asked not to be written to",
  });
  if ((await heldFirm.count()) === 0)
    report(`${folder}/lead-rules`, "the stopped firm is not among what holds the rest");
  await page.fill("#cold-country", `Harnessland ${stamp}`);
  await page.selectOption("#cold-rule", "opt_out");
  await page.fill("#cold-note", "Decided for the harness");
  await page.fill("#cold-country-reason", "The harness decides a country");
  await page.locator("button", { hasText: "Save the rule" }).click();
  await page.waitForSelector("form:has(#cold-country) .form-sent", { timeout: 15_000 });
  await page.waitForSelector(`tr:has-text("Harnessland ${stamp}"):has-text("An admin")`, {
    timeout: 15_000,
  });
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, `${folder}/lead-rules-country-set`);
  // A second change is a second decision: the reason field emptied with the first save.
  await page.fill("#cold-country-reason", "The harness puts the country back");
  await page.locator("button", { hasText: "Put back to the default" }).click();
  await page.waitForSelector("text=/Back to the default/", { timeout: 15_000 });
  await page.waitForSelector(`tr:has-text("Harnessland ${stamp}")`, {
    state: "detached",
    timeout: 15_000,
  });
  const onePerFirm = page.locator("#cold-one_per_firm");
  const wasOn = await onePerFirm.isChecked();
  await onePerFirm.setChecked(!wasOn);
  await page.fill("#cold-checks-reason", "The harness flips a check");
  await page.locator("button", { hasText: "Save the checks" }).click();
  await page.waitForSelector("form:has(#cold-checks-reason) .form-sent", { timeout: 15_000 });
  await shoot(page, `${folder}/lead-rules-checks-saved`);
  await onePerFirm.setChecked(wasOn);
  await page.fill("#cold-checks-reason", "The harness puts the check back");
  await page.locator("button", { hasText: "Save the checks" }).click();
  await page.waitForSelector("form:has(#cold-checks-reason) .form-sent", { timeout: 15_000 });
  // Back to the default: a campaign leaves prospects to the mailboxes again.
  await setProviderCampaigns(page, false, `${folder}/lead-rules-provider-off`);

  // The view as a file, through the export door (the sudo window is still open).
  await page.goto(
    `${BASE}/leads/prospects?f=${encodeURIComponent(`import:is:harness-${stamp}.csv`)}`,
    { waitUntil: "networkidle" },
  );
  await page.locator("summary", { hasText: "Export this view" }).click();
  await page.waitForSelector(".export-menu .sudo-gate--open", { timeout: 10_000 });
  await page.locator(".export-menu input[value=csv]").check();
  await page.fill("#export-prospects-reason", "The harness takes the view to a verifier");
  const [exported] = await Promise.all([
    page.waitForEvent("download", { timeout: 60_000 }),
    page.locator(".export-menu form[action='/exports'] button[type=submit]").click(),
  ]);
  const exportedName = exported.suggestedFilename();
  const exportedStream = await exported.createReadStream();
  const exportedChunks: Buffer[] = [];
  for await (const chunk of exportedStream) exportedChunks.push(chunk as Buffer);
  const exportedCsv = Buffer.concat(exportedChunks).toString("utf8");
  const exportedRows = exportedCsv.trim().split(/\r?\n/).length - 1;
  if (!exportedName.startsWith("hq-prospects-") || !exportedCsv.startsWith("\uFEFFid,email"))
    report(
      `${folder}/prospects-exported`,
      `unexpected download ${exportedName}: ${exportedCsv.slice(0, 40)}`,
    );
  else if (exportedRows < 24)
    report(`${folder}/prospects-exported`, `the view has 24 rows; the file has ${exportedRows}`);
  else console.log(`  ✓ ${folder}/prospects-exported (${exportedName}, ${exportedRows} rows)`);

  await page.goto(`${BASE}/leads/import`, { waitUntil: "networkidle" });
  const row = page.locator("tr", { hasText: `harness-${stamp}.csv` });
  await row.locator("summary", { hasText: "Take back" }).click();
  await row.locator("input[name=reason]").fill("The harness's rows, taken back");
  await row.locator("button", { hasText: "Take this file back" }).click();
  // The act removes its own form: the row itself says what happened, and what stayed.
  await page.waitForSelector(
    `tr:has-text("harness-${stamp}.csv"):has-text("Taken back · 23 removed")`,
    {
      timeout: 15_000,
    },
  );
  await shoot(page, `${folder}/lead-import-taken-back`);

  // A feed: the intro sequence takes up to two a day from "Leads this month" — checked
  // first, started, paused, resumed and ended. Each pass ends its own, so the next pass
  // may start one on the same segment.
  await page.goto(`${BASE}/mail/sequences/${MAIL.fundIntro}?tab=feeds`, {
    waitUntil: "networkidle",
  });
  await page.selectOption("#feed-segment", MAIL.leadsThisMonth);
  await page.fill("#feed-cap", "2");
  await page.locator("button", { hasText: "Check today's take" }).click();
  await page.waitForSelector(".feed-judge", { timeout: 15_000 });
  await shoot(page, `${folder}/sequence-feed-checked`);
  await page.locator("button", { hasText: "Start the feed" }).click();
  await page.waitForSelector("text=/Started: up to 2 a day/", { timeout: 15_000 });
  const feedRow = page.locator(
    'tr:has-text("Leads this month"):has-text("Taking daily"):not(:has-text("Ended"))',
  );
  await feedRow.waitFor({ timeout: 15_000 });
  await feedRow.locator("button", { hasText: "Pause" }).click();
  const pausedRow = page.locator(
    'tr:has-text("Leads this month"):has-text("Paused"):not(:has-text("Ended"))',
  );
  await pausedRow.locator("button", { hasText: "Resume" }).waitFor({ timeout: 15_000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await shoot(page, `${folder}/sequence-feed-started`);
  await pausedRow.locator("button", { hasText: "End" }).click();
  // An earlier pass left its own ended row, so the proof is this row leaving, not one arriving.
  await pausedRow.waitFor({ state: "detached", timeout: 15_000 });
  if (
    (await page
      .locator('tr:has-text("Leads this month"):has-text("Ended by a colleague")')
      .count()) === 0
  )
    report(`${folder}/sequence-feed-ended`, "the ended feed does not say who ended it");
}

/**
 * The trust registers: a risk recorded (opening on its own page) and reviewed; a finding
 * fixed with its evidence; a high-risk change another person recorded approved, then
 * done; a failed failover test that raises its finding; a supplier review with concerns;
 * an answer drafted and approved; a processing line reviewed. Later passes find each
 * seeded record already worked and only look.
 */
async function captureTrustFlows(page: Page, folder: string) {
  const stamp = Date.now().toString(36);
  await page.goto(`${BASE}/trust/risks`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Record a risk" }).click();
  await page.fill("#risk-title", `Harness risk ${stamp}`);
  await page.selectOption("#risk-category", "security");
  await page.selectOption("#risk-likelihood", "4");
  await page.selectOption("#risk-impact", "4");
  await page.fill("#risk-plan", "Second factor on every account");
  await page.locator("button", { hasText: "Record the risk" }).click();
  await page
    .waitForURL(/\/trust\/risks\/[0-9a-f-]{36}$/, { timeout: 15_000 })
    .catch(() => report(`${folder}/trust-risk-recorded`, "recording a risk did not open it"));
  await page.fill("#review-note", "Checked every account has a second factor");
  await page.locator("button", { hasText: "Record the review" }).click();
  await page.waitForSelector("form:has(#review-note) .form-sent", { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  if ((await page.locator(".event-timeline__row").count()) < 2)
    report(`${folder}/trust-risk-recorded`, "the review is not on the timeline");
  await shoot(page, `${folder}/trust-risk-recorded`);

  await page.goto(`${BASE}/trust/findings/c5000002-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator("#fix-evidence").count()) > 0) {
    await page.fill("#fix-evidence", "SameSite=Lax set on every cookie; rescan clean");
    await page.locator("button", { hasText: "Mark fixed" }).click();
    // A fixed finding has no fix form: the evidence section replacing it is the answer.
    await page.waitForSelector("h2#evidence", { timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  await shoot(page, `${folder}/trust-finding-fixed`);

  // Recorded by the admin, so the owner may approve it; its recorder never could.
  await page.goto(`${BASE}/trust/changes/c6000001-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  const approve = page.locator("button:not([disabled])", { hasText: /^Approve$/ });
  if ((await approve.count()) > 0) {
    await page.fill("#approve-note", "Window agreed for Sunday morning");
    await approve.click();
    // Approved, the approve card goes: its absence is the answer.
    await page.waitForSelector("#approve-note", { state: "detached", timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
    await page.selectOption("#outcome-value", "done");
    await page.locator("button", { hasText: "Record the outcome" }).click();
    await page.waitForSelector(".rhead__status :text('Done')", { timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  await shoot(page, `${folder}/trust-change-approved`);
  // The owner recorded this one, so their approve button is off.
  await page.goto(`${BASE}/trust/changes/c6000002-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  if ((await page.locator("button:not([disabled])", { hasText: /^Approve$/ }).count()) > 0)
    report(`${folder}/trust-change-self`, "the recorder was offered their own approval");

  await page.goto(`${BASE}/trust/continuity`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Record a test" }).click();
  await page.selectOption("#test-kind", "failover");
  await page.fill("#test-scenario", `Fail the database over to the standby ${stamp}`);
  await page.fill("#test-target", "15");
  await page.fill("#test-actual", "40");
  await page.selectOption("#test-outcome", "partial");
  await page.fill("#test-finding", "Standby needs its connection string by hand");
  await page.locator("button", { hasText: "Record the test" }).click();
  await page.waitForSelector(`td:has-text("${stamp}")`, { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  await shoot(page, `${folder}/trust-continuity-recorded`);

  await page.goto(`${BASE}/trust/suppliers/af000002-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  if ((await page.getByText("Review was due").count()) > 0) {
    await page.selectOption("#review-outcome", "concerns");
    await page.fill("#review-evidence", "Their 2026 assurance report");
    await page.fill("#review-notes", "Two exceptions on access reviews");
    await page.fill("#review-finding", "Ask for their access-review remediation");
    await page.locator("button", { hasText: "Record the review" }).click();
    await page.waitForSelector("form:has(#review-evidence) .form-sent", { timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  await shoot(page, `${folder}/trust-supplier-reviewed`);

  await page.goto(`${BASE}/trust/answers`, { waitUntil: "networkidle" });
  await page.locator("summary", { hasText: "Draft an answer" }).click();
  await page.fill("#answer-question", `Do you test your backups? ${stamp}`);
  await page.fill("#answer-text", "Yes. A restore from backup is tried every quarter.");
  await page.locator("button", { hasText: "Save the draft" }).click();
  await page
    .waitForURL(/\/trust\/answers\/[0-9a-f-]{36}$/, { timeout: 15_000 })
    .catch(() => report(`${folder}/trust-answer-approved`, "drafting did not open the answer"));
  await page.locator("button", { hasText: /^Approve$/ }).click();
  await page.waitForSelector("button:has-text('Copy the answer')", { timeout: 10_000 });
  await page.reload({ waitUntil: "networkidle" });
  if ((await page.locator("button", { hasText: "Copy the answer" }).count()) === 0)
    report(`${folder}/trust-answer-approved`, "an approved answer offers no copy");
  await shoot(page, `${folder}/trust-answer-approved`);
  await page.goto(`${BASE}/trust/answers?q=encrypt+rest`, { waitUntil: "networkidle" });
  if ((await page.locator(".answer-card").count()) !== 1)
    report(`${folder}/trust-answers-search`, "searching two words did not find the one answer");
  await shoot(page, `${folder}/trust-answers-search`);

  await page.goto(`${BASE}/trust/processing/bb000003-0000-4000-8000-000000000000`, {
    waitUntil: "networkidle",
  });
  if (
    (await page.locator("#review-note").count()) > 0 &&
    (await page.getByText("Not reviewed this year").count()) > 0
  ) {
    await page.fill("#review-note", "Matches the desk's two-year retention rule");
    await page.locator("button", { hasText: "Record the review" }).click();
    await page.waitForSelector("form:has(#review-note) .form-sent", { timeout: 10_000 });
    await page.reload({ waitUntil: "networkidle" });
  }
  await shoot(page, `${folder}/trust-processing-reviewed`);
}

/**
 * The inbox, end to end: a line snoozed to tomorrow, a line opened (read, and the record
 * it points at opens), a company followed and a reminder set on it, mail settings saved.
 * Later passes find the work done and only look.
 */
async function captureInboxFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/inbox`, { waitUntil: "networkidle" });
  const snooze = page.locator(".inbox-item .inbox-item__snooze").first();
  if ((await snooze.count()) > 0) {
    const before = await page.locator(".inbox-item").count();
    await snooze.locator("summary").click();
    await snooze.locator("button", { hasText: "Tomorrow, 09:00" }).click();
    await page.waitForFunction(
      (count) => document.querySelectorAll(".inbox-item").length < count,
      before,
      { timeout: 10_000 },
    );
  }
  await assertNoOverflow(page, `${folder}/inbox-snoozed`);
  await assertAccessible(page, `${folder}/inbox-snoozed`);
  await page.screenshot({ path: `${OUT}/${folder}/inbox-snoozed.png`, fullPage: true });
  console.log(`  ✓ ${folder}/inbox-snoozed`);

  const unread = page.locator(".inbox-item--unread .inbox-item__title").first();
  if ((await unread.count()) > 0) {
    await unread.click();
    await page.waitForURL((url) => !url.pathname.startsWith("/inbox"), { timeout: 15_000 });
    console.log(`  ✓ ${folder}/inbox-opened (${new URL(page.url()).pathname})`);
  }

  await page.goto(`${BASE}/companies/c0000000-0000-4000-8000-000000000002`, {
    waitUntil: "networkidle",
  });
  const follow = page.locator(".follow-form button");
  if ((await follow.getAttribute("aria-pressed")) !== "true") {
    await follow.click();
    await page.waitForSelector(".follow-form button[aria-pressed=true]", { timeout: 10_000 });
  }
  await page.locator("summary", { hasText: "Remind me" }).click();
  await page.locator(".popover[open] input[name=note]").fill("Ask about the second desk");
  await page.locator(".popover[open] button", { hasText: "Set reminder" }).click();
  await page.waitForSelector(".popover[open] .form-sent", { timeout: 10_000 });
  await assertAccessible(page, `${folder}/company-follow-remind`);
  await page.screenshot({ path: `${OUT}/${folder}/company-follow-remind.png` });
  console.log(`  ✓ ${folder}/company-follow-remind`);

  await page.goto(`${BASE}/me/notifications`, { waitUntil: "networkidle" });
  await page.locator("label.prefs-mode", { hasText: "One digest a day" }).click();
  await page.selectOption("#prefs-quiet-from", "22");
  await page.selectOption("#prefs-quiet-to", "7");
  await page.locator("button", { hasText: "Save" }).click();
  await page.waitForSelector(".form-sent", { timeout: 10_000 });
  // Back to the default so the next pass starts where this one did.
  await page.locator("label.prefs-mode", { hasText: "Mail me what stays unread" }).click();
  await page.selectOption("#prefs-quiet-from", "");
  await page.selectOption("#prefs-quiet-to", "");
  await page.locator("button", { hasText: "Save" }).click();
  await page.waitForSelector(".form-sent", { timeout: 10_000 });
  console.log(`  ✓ ${folder}/me-notifications-saved`);
}

/**
 * Security 2, end to end: an owner acknowledges an event in the feed; resets the desk
 * persona's authenticator and is shown the one-time link; then, in a separate browser,
 * that person's password alone is refused and the link carries them to enrolment.
 */
async function captureSecurityFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/admin/security`, { waitUntil: "networkidle" });
  const acknowledge = page.locator(".security-event button", { hasText: "Acknowledge" }).first();
  if ((await acknowledge.count()) > 0) {
    const acknowledged = () =>
      page.evaluate(
        () =>
          Array.from(document.querySelectorAll(".security-event .pill")).filter(
            (pill) => pill.textContent?.trim() === "Acknowledged",
          ).length,
      );
    const before = await acknowledged();
    await acknowledge.click();
    await page.waitForFunction(
      (count) =>
        Array.from(document.querySelectorAll(".security-event .pill")).filter(
          (pill) => pill.textContent?.trim() === "Acknowledged",
        ).length > count,
      before,
      { timeout: 10_000 },
    );
  }
  await assertNoOverflow(page, `${folder}/admin-security-acknowledged`);
  await assertAccessible(page, `${folder}/admin-security-acknowledged`);
  await page.screenshot({
    path: `${OUT}/${folder}/admin-security-acknowledged.png`,
    fullPage: true,
  });
  console.log(`  ✓ ${folder}/admin-security-acknowledged`);

  // The seeded sales persona passed six hundred records this hour and is held: clear it
  // (the first pass does; later passes find nobody held and only look).
  await page.goto(`${BASE}/admin/security`, { waitUntil: "networkidle" });
  const held = page.locator(".read-watch", { hasText: "Sales Person" }).locator("form");
  if ((await held.count()) > 0) {
    await held.locator("input[name=reason]").fill("Building the renewal list for Q4");
    await held.locator("button[type=submit]").click();
    // Cleared, the row re-renders without its form: wait for the hold to be gone.
    await page.waitForFunction(
      () =>
        !Array.from(document.querySelectorAll(".read-watch")).some(
          (row) =>
            row.textContent?.includes("Sales Person") &&
            Array.from(row.querySelectorAll(".pill")).some(
              (pill) => pill.textContent?.trim() === "Held",
            ),
        ),
      undefined,
      { timeout: 10_000 },
    );
  }
  await assertNoOverflow(page, `${folder}/admin-security-cleared`);
  await assertAccessible(page, `${folder}/admin-security-cleared`);
  await page.screenshot({ path: `${OUT}/${folder}/admin-security-cleared.png`, fullPage: true });
  console.log(`  ✓ ${folder}/admin-security-cleared`);

  // A decoy key, planted: its secret is shown once.
  await page.selectOption("#decoy-kind", "api_key");
  await page.locator("button", { hasText: "Plant the decoy" }).click();
  await page.waitForSelector(".one-time-secret, form:has(#decoy-kind) [role=alert]", {
    timeout: 10_000,
  });
  const decoyKey = (await page.locator(".one-time-secret__value").first().textContent()) ?? "";
  if (!decoyKey.startsWith("qthq_")) report(`${folder}/admin-security-decoy`, "no decoy key shown");
  // A full-page capture taken scrolled draws the sticky bar halfway down the image.
  await page.evaluate(() => {
    (document.activeElement as HTMLElement | null)?.blur();
    window.scrollTo(0, 0);
  });
  await assertAccessible(page, `${folder}/admin-security-decoy`);
  await page.screenshot({ path: `${OUT}/${folder}/admin-security-decoy.png`, fullPage: true });
  console.log(`  ✓ ${folder}/admin-security-decoy`);

  await page.goto(`${BASE}/admin/staff/aa000000-0000-4000-8000-00000000000d`, {
    waitUntil: "networkidle",
  });
  await page.fill("#reset-reason", "Phone replaced — screenshot run");
  await page.locator("form:has(#reset-reason) button[type=submit]").click();
  await page.waitForSelector(".one-time-secret, form:has(#reset-reason) [role=alert]", {
    timeout: 10_000,
  });
  const link = ((await page.locator(".one-time-secret__value").first().textContent()) ?? "").trim();
  await assertNoOverflow(page, `${folder}/staff-reset-link`);
  await assertAccessible(page, `${folder}/staff-reset-link`);
  await page.screenshot({ path: `${OUT}/${folder}/staff-reset-link.png`, fullPage: true });
  console.log(`  ✓ ${folder}/staff-reset-link`);
  if (!/\/login\?ticket=hqe_/.test(link)) {
    report(`${folder}/staff-reset-link`, `no one-time link shown (got "${link.slice(0, 60)}")`);
    return;
  }

  const browser = page.context().browser();
  if (!browser) return;
  const other = await browser.newContext({ viewport: page.viewportSize() ?? null });
  try {
    const person = await other.newPage();
    watchConsole(person);
    await person.goto(`${BASE}/login?form=1`, { waitUntil: "networkidle" });
    await person.fill("#email", "support@hq.test");
    await person.fill("#password", "password-123");
    await person.click("button[type=submit]");
    await person.waitForSelector(".auth__note", { timeout: 15_000 });
    const refusal = (await person.locator(".auth__note").textContent()) ?? "";
    if (!refusal.includes("Your authenticator was reset")) {
      report(`${folder}/login-reset-refused`, `the password alone was not refused: "${refusal}"`);
    }
    await assertAccessible(person, `${folder}/login-reset-refused`);
    await person.screenshot({ path: `${OUT}/${folder}/login-reset-refused.png`, fullPage: true });
    console.log(`  ✓ ${folder}/login-reset-refused`);

    await person.goto(link.replace(/^https?:\/\/[^/]+/, BASE), { waitUntil: "networkidle" });
    await assertAccessible(person, `${folder}/login-reset-ticket`);
    await person.screenshot({ path: `${OUT}/${folder}/login-reset-ticket.png`, fullPage: true });
    console.log(`  ✓ ${folder}/login-reset-ticket`);
    await person.fill("#email", "support@hq.test");
    await person.fill("#password", "password-123");
    await person.click("button[type=submit]");
    await person.waitForURL("**/login/enroll**", { timeout: 15_000 }).catch(() => undefined);
    if (!person.url().includes("/login/enroll")) {
      report(
        `${folder}/login-reset-enrol`,
        `the one-time link did not reach enrolment (${person.url()})`,
      );
    } else {
      console.log(`  ✓ ${folder}/login-reset-enrol`);
    }
  } finally {
    await other.close();
  }
}

/**
 * Mail, end to end through the server actions and the mock's rules: a colleague's
 * campaign approved (the sudo window is open) and started, the owner's own draft tested
 * and submitted (it then waits for someone else), a segment checked, a sequence's
 * enrolment checked. Later passes find the work done and only look.
 */
async function captureMailFlows(page: Page, folder: string) {
  await page.goto(`${BASE}/mail/campaigns/${MAIL.webinar}`, { waitUntil: "networkidle" });
  if ((await page.locator("button", { hasText: "Approve" }).count()) > 0) {
    await page.locator("button", { hasText: "Approve" }).click();
    await page.waitForSelector("button:has-text('Start sending')", { timeout: 15_000 });
  }
  if ((await page.locator("button", { hasText: "Start sending" }).count()) > 0) {
    await page.locator("button", { hasText: "Start sending" }).click();
    // Outside a recipient's local window the worker defers them and the campaign is still
    // Sending, with Pause offered; when every recipient is inside it, the lot goes at once
    // and the campaign is already Sent. Which one depends on the hour the harness runs.
    await page.waitForSelector("button:has-text('Pause'), .rhead__status:has-text('Sent')", {
      timeout: 15_000,
    });
  }
  const webinarState = (await page.locator(".rhead__status").innerText()).trim();
  if (!/Sending|Sent/.test(webinarState)) {
    report(`${folder}/mail-campaign-started`, `the approved campaign reads "${webinarState}"`);
  }
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertNoOverflow(page, `${folder}/mail-campaign-started`);
  await assertAccessible(page, `${folder}/mail-campaign-started`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-campaign-started.png`, fullPage: true });
  console.log(`  ✓ ${folder}/mail-campaign-started`);

  await page.goto(`${BASE}/mail/campaigns/${MAIL.roadmap}`, { waitUntil: "networkidle" });
  if ((await page.locator("button", { hasText: "Send me a test" }).count()) > 0) {
    await page.locator("button", { hasText: "Send me a test" }).click();
    await page.waitForSelector("button:has-text('Submit'):not([disabled])", { timeout: 15_000 });
    await page.locator("button", { hasText: "Submit" }).click();
    await page.waitForSelector(".record-banners", { timeout: 15_000 });
  }
  if ((await page.locator(".callout__title", { hasText: "Waiting for approval" }).count()) === 0) {
    report(
      `${folder}/mail-campaign-submitted`,
      "the owner's own draft is not waiting for someone else",
    );
  }
  await assertAccessible(page, `${folder}/mail-campaign-submitted`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-campaign-submitted.png`, fullPage: true });
  console.log(`  ✓ ${folder}/mail-campaign-submitted`);

  await page.goto(`${BASE}/mail/segments`, { waitUntil: "networkidle" });
  await page.locator("button", { hasText: "Check who matches" }).click();
  await page.waitForSelector(".segment-result", { timeout: 15_000 });
  await assertNoOverflow(page, `${folder}/mail-segment-checked`);
  await assertAccessible(page, `${folder}/mail-segment-checked`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-segment-checked.png`, fullPage: true });
  console.log(`  ✓ ${folder}/mail-segment-checked`);

  // A sender ticked by hand, checked with the provider; then paused and resumed.
  await page.goto(`${BASE}/mail/settings`, { waitUntil: "networkidle" });
  const salesRow = page.locator("tr", { hasText: "sales@quantifyterminal.com" });
  if ((await salesRow.locator(".table-sub", { hasText: "Ticked by hand" }).count()) > 0) {
    await page
      .locator('button[aria-label="Check sales@quantifyterminal.com with the provider"]')
      .click();
    await salesRow
      .locator(".table-sub", { hasText: "Checked with the provider" })
      .waitFor({ timeout: 15_000 });
  }
  await page.locator('button[aria-label="Pause sales@quantifyterminal.com"]').click();
  await page
    .locator('button[aria-label="Resume sales@quantifyterminal.com"]')
    .waitFor({ timeout: 15_000 });
  await assertAccessible(page, `${folder}/mail-sender-paused`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-sender-paused.png`, fullPage: true });
  await page.locator('button[aria-label="Resume sales@quantifyterminal.com"]').click();
  await page
    .locator('button[aria-label="Pause sales@quantifyterminal.com"]')
    .waitFor({ timeout: 15_000 });
  console.log(`  ✓ ${folder}/mail-sender-paused`);

  // A list, end to end: made, filled from a file (a bad address and an extra column
  // included), one person added by hand, one taken off. Later passes find it made.
  await page.goto(`${BASE}/mail/lists`, { waitUntil: "networkidle" });
  const existing = page.locator("a.table-title", { hasText: "Harness list" });
  if ((await existing.count()) > 0) {
    await existing.first().click();
    await page.waitForSelector(".rhead", { timeout: 15_000 });
  } else {
    await page.locator("summary", { hasText: "New list" }).click();
    await page.fill("#list-name", "Harness list");
    await page.locator("button", { hasText: "Create list" }).click();
    await page.waitForURL("**/mail/lists/*?tab=import", { timeout: 15_000 });
  }
  const listUrl = page.url().split("?")[0]!;
  await page.goto(`${listUrl}?tab=import`, { waitUntil: "networkidle" });
  await page.setInputFiles("#list-csv", {
    name: "harness.csv",
    mimeType: "text/csv",
    buffer: Buffer.from(
      [
        "Email,First name,Last name,Company,Fund size,Region",
        "ada@harness.example,Ada,Lovelace,Analytical Capital,$2bn,EMEA",
        "grace@harness.example,Grace,Hopper,Navy Partners,$500m,Americas",
        "not-an-address,Nobody,Here,,,",
      ].join("\n"),
    ),
  });
  await page.locator("button", { hasText: /^Add \d+ rows to the list$/ }).click();
  await page.waitForSelector(".list-import__result", { timeout: 20_000 });
  // The result is below the fold; a full-page capture taken scrolled draws the sticky
  // head mid-image.
  await page.evaluate(() => window.scrollTo(0, 0));
  await assertNoOverflow(page, `${folder}/mail-list-imported`);
  await assertAccessible(page, `${folder}/mail-list-imported`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-list-imported.png`, fullPage: true });
  console.log(`  ✓ ${folder}/mail-list-imported`);
  await page.goto(`${listUrl}?tab=add`, { waitUntil: "networkidle" });
  await page.fill("#add-email", `hand-${folder.replace(/\W+/g, "-")}@harness.example`);
  await page.fill("#add-first_name", "Hand");
  await page.locator("button", { hasText: "Add to the list" }).first().click();
  await page.waitForSelector(".form-sent", { timeout: 15_000 });
  await page.goto(listUrl, { waitUntil: "networkidle" });
  const before = await page
    .locator(".list-bar ~ * input[name=member_id], input[name=member_id]")
    .count();
  // A confirm the page raises; tolerant of a handler another pass left waiting.
  page.once("dialog", (dialog) => void dialog.accept().catch(() => undefined));
  await page.locator("input[name=member_id]").first().check();
  await page.locator("button", { hasText: "Remove ticked" }).click();
  await page.waitForSelector(".list-remove .form-sent", { timeout: 15_000 });
  await page.reload({ waitUntil: "networkidle" });
  const after = await page.locator("input[name=member_id]").count();
  if (after !== before - 1)
    report(`${folder}/mail-list-removed`, `${before} rows before, ${after} after`);
  await assertAccessible(page, `${folder}/mail-list-removed`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-list-removed.png`, fullPage: true });
  console.log(`  ✓ ${folder}/mail-list-removed`);

  await page.goto(`${BASE}/mail/sequences/${MAIL.fundIntro}?tab=enrol`, {
    waitUntil: "networkidle",
  });
  const boxes = page.locator(".audience-pick__list input[type=checkbox]");
  for (let index = 0; index < Math.min(4, await boxes.count()); index += 1) {
    await boxes.nth(index).check();
  }
  await page.locator("button", { hasText: "Check who it takes" }).click();
  await page.waitForSelector(".verdicts", { timeout: 15_000 });
  await assertNoOverflow(page, `${folder}/mail-enrol-checked`);
  await assertAccessible(page, `${folder}/mail-enrol-checked`);
  await page.screenshot({ path: `${OUT}/${folder}/mail-enrol-checked.png`, fullPage: true });
  console.log(`  ✓ ${folder}/mail-enrol-checked`);
}

/**
 * The recipient's side, signed out: the stop page as it opens, a link that names
 * nothing, the button pressed, and the mailbox's RFC 8058 one-click POST — checked by
 * reading the stop back from the service, not by trusting the 200.
 */
async function captureUnsubscribe(page: Page, folder: string) {
  await capture(page, folder, {
    name: "unsubscribe",
    path: `/u/mock-${MAIL.stopLooked}`,
    ready: ".unsub",
  });
  await capture(page, folder, {
    name: "unsubscribe-invalid",
    path: "/u/mock-00000000-0000-4000-8000-000000000000",
  });
  await page.goto(`${BASE}/u/mock-${MAIL.stopPressed}`, { waitUntil: "networkidle" });
  if ((await page.locator("button", { hasText: "Unsubscribe from everything" }).count()) > 0) {
    await page.locator("button", { hasText: "Unsubscribe from everything" }).click();
    await page.waitForSelector("h1:has-text('You are unsubscribed'), .form-sent", {
      timeout: 15_000,
    });
  }
  await assertNoOverflow(page, `${folder}/unsubscribe-done`);
  await assertAccessible(page, `${folder}/unsubscribe-done`);
  await page.screenshot({ path: `${OUT}/${folder}/unsubscribe-done.png`, fullPage: true });
  console.log(`  ✓ ${folder}/unsubscribe-done`);

  const oneClick = await fetch(`${BASE}/u/mock-${MAIL.stopOneClick}/one-click`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: "List-Unsubscribe=One-Click",
  });
  const readBack = (await fetch(
    `http://127.0.0.1:7071/api/v1/public/mail/unsubscribe/mock-${MAIL.stopOneClick}`,
  ).then((response) => response.json())) as { marketing_state?: string };
  if (oneClick.status !== 200 || readBack.marketing_state !== "unsubscribed") {
    report(
      `${folder}/unsubscribe-one-click`,
      `POST answered ${oneClick.status}; the address reads "${readBack.marketing_state}"`,
    );
  } else {
    console.log(`  ✓ ${folder}/unsubscribe-one-click`);
  }
}

/**
 * "This wasn't me", signed out: the page as the mail opens it (nothing happens yet),
 * then the press, which locks the account the link names. A second viewport finds the
 * link already used and says so.
 */
async function captureReport(page: Page, folder: string) {
  await capture(page, folder, {
    name: "report",
    path: "/report/hqr_mock_demo",
    ready: ".auth-form",
  });
  await page.locator("button", { hasText: "This wasn't me" }).click();
  await page.waitForSelector("[role=status], .auth__note", { timeout: 15_000 });
  const answer = (await page.locator("main").innerText()) ?? "";
  if (!/Done\.|already locked/.test(answer)) {
    report(`${folder}/report-done`, "pressing the lock did not say the account was locked");
  }
  await assertNoOverflow(page, `${folder}/report-done`);
  await assertAccessible(page, `${folder}/report-done`);
  await page.screenshot({ path: `${OUT}/${folder}/report-done.png`, fullPage: true });
  console.log(`  ✓ ${folder}/report-done`);
}

/**
 * Compile the sign-in routes before any timed step reaches them. On a freshly started
 * dev server the enrolment page took eighteen seconds to compile on first hit — past
 * the fifteen-second wait after the sign-in click — and the harness failed a step the
 * product had passed. A warm route is the product; a cold compile is the tool.
 */
async function warmRoutes(browser: Browser) {
  const context = await browser.newContext();
  try {
    for (const path of [
      "/login",
      "/login/verify",
      "/login/enroll",
      "/forgot-password",
      "/reset-password",
    ]) {
      await context.request.get(`${BASE}${path}`, { timeout: 120_000 }).catch(() => undefined);
    }
  } finally {
    await context.close();
  }
}

async function run(browser: Browser) {
  await warmRoutes(browser);
  for (const viewport of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();
    watchConsole(page);

    // Signed-out surfaces first.
    mkdirSync(`${OUT}/${viewport.name}/auth`, { recursive: true });
    await capture(page, `${viewport.name}/auth`, { name: "login", path: "/login?form=1" });
    await capture(page, `${viewport.name}/auth`, {
      name: "forgot-password",
      path: "/forgot-password",
    });
    await capture(page, `${viewport.name}/auth`, {
      name: "reset-password-invalid",
      path: "/reset-password",
    });
    // The public certificate check, valid and not found.
    await capture(page, `${viewport.name}/auth`, {
      name: "verify-valid",
      path: "/verify/QT-2026-0001-7KD2QX",
      ready: ".verify__card",
    });
    await capture(page, `${viewport.name}/auth`, {
      name: "verify-missing",
      path: "/verify/QT-2026-0001",
    });
    await captureUnsubscribe(page, `${viewport.name}/auth`);
    await captureReport(page, `${viewport.name}/auth`);
    await captureStatusPublic(page, `${viewport.name}/auth`);
    await capture(page, `${viewport.name}/auth`, {
      name: "careers-public",
      path: "/careers",
      ready: ".status-public__section",
    });
    await capture(page, `${viewport.name}/auth`, {
      name: "trust-centre-public",
      path: "/trust-centre",
      ready: ".status-public__section",
    });
    await capture(page, `${viewport.name}/auth`, {
      name: "changelog-public",
      path: "/changelog",
      ready: ".status-public__section",
    });

    // The two-step and the code screen, mid-flow.
    await page.goto(`${BASE}/login?form=1`, { waitUntil: "networkidle" });
    await page.fill("#email", "owner@hq.test");
    await page.fill("#password", "password-123");
    await page.click("button[type=submit]");
    await page.waitForURL("**/login/verify**", { timeout: 15_000 });
    await assertNoOverflow(page, `${viewport.name}/auth/verify`);
    await assertAccessible(page, `${viewport.name}/auth/verify`);
    await page.screenshot({ path: `${OUT}/${viewport.name}/auth/verify.png`, fullPage: true });
    console.log(`  ✓ ${viewport.name}/auth/verify`);
    await page.fill("#totp-code", "000000");
    await page.click("button[type=submit]");
    await page.waitForURL("**/home", { timeout: 15_000 });

    // Signed-in pages, dark then light.
    for (const theme of ["dark", "light"] as const) {
      mkdirSync(`${OUT}/${viewport.name}/${theme}`, { recursive: true });
      await setTheme(page, theme);
      for (const shot of SIGNED_IN_PAGES) {
        await capture(page, `${viewport.name}/${theme}`, shot);
      }
      await captureInteractions(page, `${viewport.name}/${theme}`);
    }
    // Leave the persona's theme where it started, for the next viewport's walk.
    await setTheme(page, "dark");

    // The intern reads the pipeline with every money figure blanked: the four pages
    // that carry deal money must render the dash, not a crash or a zero.
    const internContext = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const intern = await internContext.newPage();
    watchConsole(intern);
    await intern.goto(`${BASE}/login?form=1`, { waitUntil: "networkidle" });
    await intern.fill("#email", "intern@hq.test");
    await intern.fill("#password", "password-123");
    await intern.click("button[type=submit]");
    await intern.waitForURL("**/login/verify**", { timeout: 15_000 });
    await intern.fill("#totp-code", "000000");
    await intern.click("button[type=submit]");
    await intern.waitForURL("**/home", { timeout: 15_000 });
    mkdirSync(`${OUT}/${viewport.name}/intern`, { recursive: true });
    for (const shot of [
      { name: "home", path: "/home", ready: "main#main-content" },
      { name: "deals", path: "/deals", ready: ".board" },
      { name: "deal", path: "/deals/d0000000-0000-4000-8000-000000000001", ready: ".stage-rail" },
      { name: "companies", path: "/companies", ready: ".data-table" },
      {
        name: "company",
        path: "/companies/c0000000-0000-4000-8000-000000000002",
        ready: ".record-layout",
      },
    ]) {
      await capture(intern, `${viewport.name}/intern`, shot);
      const text = await intern.locator("main").innerText();
      if (/\$\d|\/mo/.test(text)) {
        report(`${viewport.name}/intern/${shot.name}`, "a money figure is visible to the intern");
      }
    }
    // Trust opens the answer library for the intern: read, never drafted.
    await capture(intern, `${viewport.name}/intern`, {
      name: "trust",
      path: "/trust",
      ready: ".answer-card, main#main-content",
    });
    if (!intern.url().includes("/trust/answers"))
      report(`${viewport.name}/intern/trust`, "Trust did not open the answer library");
    if ((await intern.locator("summary", { hasText: "Draft an answer" }).count()) > 0)
      report(`${viewport.name}/intern/trust`, "the intern was offered a draft");
    // Product administers customer accounts: never the intern's, in the rail or by URL.
    if ((await intern.locator('a[href^="/product"]').count()) > 0)
      report(`${viewport.name}/intern/product`, "the intern was offered Product");
    await intern.goto(`${BASE}/product`, { waitUntil: "networkidle" });
    if ((await intern.locator(".stat-grid[role=list], .data-table").count()) > 0)
      report(`${viewport.name}/intern/product`, "Product opened for the intern");
    await captureElevation(intern, `${viewport.name}/intern`);
    await internContext.close();

    // First-run enrollment with the un-enrolled persona, in a fresh context.
    const enrollContext = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const enrollPage = await enrollContext.newPage();
    await enrollPage.goto(`${BASE}/login?form=1`, { waitUntil: "networkidle" });
    await enrollPage.fill(
      "#email",
      viewport.name === "desktop" ? "newbie@hq.test" : "newbie2@hq.test",
    );
    await enrollPage.fill("#password", "password-123");
    await enrollPage.click("button[type=submit]");
    await enrollPage.waitForURL("**/login/enroll**", { timeout: 15_000 });
    await enrollPage.click("button[type=submit]"); // begin
    await enrollPage.waitForSelector(".secret-once", { timeout: 15_000 });
    await assertNoOverflow(enrollPage, `${viewport.name}/auth/enroll`);
    await assertAccessible(enrollPage, `${viewport.name}/auth/enroll`);
    await enrollPage.screenshot({
      path: `${OUT}/${viewport.name}/auth/enroll.png`,
      fullPage: true,
    });
    console.log(`  ✓ ${viewport.name}/auth/enroll`);
    await enrollPage.fill("#enroll-code", "000000");
    await enrollPage.click("button[type=submit]");
    await enrollPage.waitForSelector(".recovery-codes", { timeout: 15_000 });
    await enrollPage.screenshot({
      path: `${OUT}/${viewport.name}/auth/recovery-codes.png`,
      fullPage: true,
    });
    console.log(`  ✓ ${viewport.name}/auth/recovery-codes`);
    await enrollContext.close();
    await context.close();
  }
}

await fetch("http://127.0.0.1:7071/api/v1/mock/reset", { method: "POST" }).catch(() => {
  console.error("mock-hq is not running; start it with `npm run mock:hq`.");
  process.exit(1);
});

/**
 * One part of the walk, for the wave being worked on — the whole walk is still the gate:
 *
 *     HQ_HARNESS_PAGES='^(prospect|lead-)' HQ_HARNESS_FLOW=prospects npm run check:hq-ui
 *
 * Signs in as the owner and, at both widths and in both themes, captures the screens
 * whose name matches the pattern and then runs the named flow.
 */
const ONLY_PAGES = process.env.HQ_HARNESS_PAGES ? new RegExp(process.env.HQ_HARNESS_PAGES) : null;
const ONLY_FLOW = process.env.HQ_HARNESS_FLOW ?? "";
const FLOWS: Record<string, (page: Page, folder: string) => Promise<void>> = {
  prospects: captureProspectFlows,
  mail: captureMailFlows,
  mailboxes: captureMailboxFlows,
  fields: captureFieldFlows,
  quality: captureDataQualityFlows,
};

async function runPart(browser: Browser) {
  const flow = ONLY_FLOW ? FLOWS[ONLY_FLOW] : undefined;
  if (ONLY_FLOW && !flow) {
    console.error(`No flow named "${ONLY_FLOW}". Known: ${Object.keys(FLOWS).join(", ")}.`);
    process.exit(1);
  }
  for (const viewport of WIDTHS) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
    });
    const page = await context.newPage();
    watchConsole(page);
    await page.goto(`${BASE}/login?form=1`, { waitUntil: "networkidle" });
    await page.fill("#email", "owner@hq.test");
    await page.fill("#password", "password-123");
    await page.click("button[type=submit]");
    await page.waitForURL("**/login/verify**", { timeout: 30_000 });
    await page.fill("#totp-code", "000000");
    await page.click("button[type=submit]");
    await page.waitForURL("**/home", { timeout: 30_000 });
    for (const theme of ["dark", "light"] as const) {
      mkdirSync(`${OUT}/${viewport.name}/${theme}`, { recursive: true });
      await setTheme(page, theme);
      for (const shot of SIGNED_IN_PAGES)
        if (ONLY_PAGES?.test(shot.name)) await capture(page, `${viewport.name}/${theme}`, shot);
      if (flow) await flow(page, `${viewport.name}/${theme}`);
    }
    await setTheme(page, "dark");
    await context.close();
  }
}

const browser = await chromium.launch();
try {
  if (ONLY_PAGES || ONLY_FLOW) await runPart(browser);
  else await run(browser);
} finally {
  await browser.close();
}

if (failures > 0) {
  console.error(`\n${failures} problem(s). Screenshots in ${OUT}/.`);
  process.exit(1);
}
console.log(`\nAll screens captured cleanly. Review them in ${OUT}/.`);
