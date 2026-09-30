# The rest of the suite — research, 30 September 2026 (third pass)

The first pass (`RESEARCH-2026-09-30.md`) covered the desk, lists, customer-success analytics,
CRM structure, people ops and security quick wins; the second
(`RESEARCH-2026-09-30-OUTBOUND.md`) covered outbound mail. Every S/M item from both is
built. This pass asked seven questions of the best tools in areas HQ had not studied, each
answered by a separate researcher reading vendor documentation and regulators' pages, and
each told what HQ already has so it returned **gaps only**:

1. sales execution and forecasting · 2. customer success, feedback and customer
   communication · 3. the platform layer (inbox, rules, automations, fields, webhooks) ·
2. finance and company operations · 5. trust, privacy and compliance operations ·
3. security hardening against insiders and account takeover · 7. AI assistance.

The house rules still bind every item: a number is a plain ratio of figures on the page; no
predictive scores; nothing reaches a customer without a person pressing send; every write is
audited; no data vendor is named in the interface; nothing runs on a quarter-hour timer
(the serverless database's free hours) — work happens on a read, on a write, on the mail
worker's pass or on the nightly timer.

---

## 1. Sales execution and forecasting

**Ranked gaps**

1. **Deal inspection — what changed this week (S/M).** Salesforce Pipeline Inspection:
   New / Increased / Decreased / Moved in / Moved out over 7 days; a **push count** that
   rises each time the close date crosses into a later month; a red clock when the next
   step has not changed in 7 days. Gong's Changes report compares each deal at the start
   and end of a window and gives each one reason by rank (lost, won, pushed, pulled in,
   moved category, new, …), with amount up/down beside it. HQ has field history and
   nightly snapshots, so the data exists. Pitfall: endpoint comparison hides a push and a
   pull inside the window — say so; label whether a push is a month or a quarter.
2. **Forecast categories, submissions and accuracy (M).** Pipeline / Best case / Commit /
   Closed / Omitted; the stage sets the default and a person may override it on the deal
   without moving the stage (probability says where the deal is, the category is a
   judgement). A submission per period stores the amount, the deals behind it and a note,
   frozen; history browsable. Columns: goal, closed won, gap, submission, open pipeline,
   coverage (open ÷ gap). Accuracy = 1 − |F − A| / A and bias = (F − A) / A at fixed
   checkpoints. Pitfall at 3–8 deals a quarter: one deal swings accuracy by 30 points —
   show the money miss and a hit/miss list, not a percentage alone.
3. **Quotes / order forms with discount approval (M).** Draft → Pending approval →
   Changes requested → Published → Accepted / Expired; one primary quote per deal; an edit
   to price or terms cancels the approval; the quote is pinned to the price list it was
   made from. Approval tiers by discount (≤ 10 % the author, above that a second person).
   Signing is **recorded**, not built.
4. **Competitors on open deals and battlecards (S/M).** Salesforce OpportunityCompetitor:
   many per deal with strengths / weaknesses. Klue cards: a quick dismiss, objection →
   response, why we win. Counts as "won 3 of 5", never a percentage below ~10 deals; a
   card goes stale after 90 days without review.
5. **Win/loss interview records (S).** Clozd: 20–30 minute interviews, decision drivers
   marked positive or negative, verbatim quotes; the view puts the seller's reason next to
   the buyer's.
6. **Stage guidance and exit criteria (S)**, **quarterly targets and attainment (S)**,
   **an internal mutual action plan per deal (M)**.

**Not at this size:** commission engines, opportunity splits, CPQ rules, forecast
hierarchies, AI forecasts, deal rooms, payment on the quote, an in-house scheduler.

Sources: salesforceben.com/ultimate-guide-to-salesforce-pipeline-inspection ·
help.gong.io/docs/analyze-forecast-category-changes · knowledge.hubspot.com/forecast/use-the-forecast-tool ·
knowledge.hubspot.com/quotes/understand-how-quotes-work-in-hubspot ·
klue.com/blog/competitive-battlecards-101-key-points-quick-dismiss-sales-battlecard ·
clozd.com/learning-center/sample-buyer-interview-questions

## 2. Customer success, feedback and customer communication

1. **Usage per firm and rule signals (M).** Pendo: active on a day = at least one event
   that day. ChurnZero alerts: seat use under X %, near the licence limit, no contact for X
   days, renewal within 90 days with a risk. HQ: seats paid (contract) vs product accounts
   signed in within 30 days, per firm; named signals — `seat use < 50 %`, `no sign-in
14 d`, `seats ≥ 90 % of paid`, `renewal ≤ 90 d and a risk` — each showing its rule and
   its evidence, clearing itself when the rule stops matching. **Never summed into a
   score.** Pitfall: a 2-seat firm moves 50 points per person; say the counts.
2. **Feature requests with the money asking (M).** Linear customer requests (quote,
   person, source, "important"); Canny opportunities (the pipeline at stake; export the
   accounts when it ships); status mails to everyone who asked, on by default. HQ: a
   request holds many asks (person, firm, source, verbatim quote, importance, "blocks a
   deal"); columns firms asking, their MRR counted once per firm, open pipeline asking;
   shipping lists every asker and mails them through outbound mail. No weighted scores.
3. **Status page and incident communication (M).** Statuspage: components (Operational /
   Degraded / Partial outage / Major outage / Maintenance); incidents (Investigating →
   Identified → Monitoring → Resolved) whose impact derives from the components;
   scheduled maintenance that starts and ends itself; subscriber mails on create / update /
   resolve; a 90-day bar. Pitfall: uptime from incidents typed by hand is **not measured
   uptime** — label it "reported incidents".
4. **Onboarding projects with key dates (M).** Vitally projects (owner, target and actual
   dates, milestones, progress = tasks done); Rocketlane intervals between named events.
   HQ key events: contract start → kickoff → first sign-in → 80 % of seats active. About
   ten onboardings a year: show each firm's durations, never a median.
5. **Renewal playbooks anchored to the notice date (S)**, **a changelog tied to requests
   (S/M)**, **an internal help centre with ticket links and a gap list (M/L)**, **a
   business-review page per firm (M)**, **reference consent ledger (S)**.

**Not at this size:** public voting boards, weighted prioritisation, customer onboarding
portals, click analytics in the desktop app, an exec-sponsor programme, forums.

Sources: support.pendo.io/hc/en-us/articles/18989920058523 ·
churnzero.com/blog/16-ideas-for-getting-started-with-automated-alerts ·
linear.app/docs/customer-requests · help.canny.io/en/articles/9737555-opportunities ·
support.atlassian.com/statuspage/docs/top-level-status-and-incident-impact-calculations ·
docs.vitally.io/en/articles/9922942-projects

## 3. The platform layer

1. **A notification inbox (M).** Linear: subscribed on create / assign / mention; a mail
   only if the in-app item is still unread; snooze returns it unread and new activity
   cancels the snooze; "remind me" on any record. GitHub: every notification carries a
   **reason** (assign, author, comment, mention, review requested, state change); read is
   separate from done. Knock: a new event updates the unread row for the same subject
   rather than adding one. HQ: subscriptions per record, one row per (person, subject)
   with an event count, read / done / snoozed; mail only for what stays unread, sent by
   the worker's pass, never a new timer; counts computed on render, never polled.
2. **Validation and stage rules (S/M).** Salesforce validation rules (block the save with
   a message on a named field; compare with the old value); HubSpot pipeline rules (no
   skipping, no going back, fields required to enter a stage). Evaluate in one place — the
   service's write handler — so the form, bulk edit, the intake API and automations obey
   the same rules; apply on create too (HubSpot's gap).
3. **A narrow automation builder (L).** Trigger (created, field changed to, stage entered,
   N days before a date, a button) → conditions → actions (task, set field, notify,
   sequence, approval, webhook). Loop guards: an automation's own writes never retrigger
   it, depth ≤ 3; visible `skipped_loop` runs; immutable published versions; a dry run
   over the last 50 matching records; auto-pause on a failure streak.
4. **Record templates and checklists (S)**, **comment threads with resolve (S/M)**,
   **scheduled digests of saved views rendered as the recipient (S)**, **outbound
   webhooks** to the Standard Webhooks spec (id, timestamp, `v1,` HMAC-SHA256 over
   `id.timestamp.body`; retries on a coarse schedule; disabled after ~3 days of failure;
   SSRF guard) **(M)**, **custom fields** with immutable keys, archive not delete, a
   sensitive flag **(M/L)**.

**Not at this size:** custom objects, a visual canvas builder, multi-step approval chains,
formula / rollup fields, push and Slack-native channels.

Sources: linear.app/docs/notifications · linear.app/docs/inbox ·
docs.knock.app/send-notifications/designing-workflows/batch-function ·
knowledge.hubspot.com/object-settings/set-up-pipeline-rules ·
knowledge.hubspot.com/workflows/workflows-faq ·
github.com/standard-webhooks/standard-webhooks/blob/main/spec/standard-webhooks.md

## 4. Finance and company operations

HQ stays operational: the ledger, the VAT / GST returns and the legal invoice number stay in
the accounting system. Every figure carries an as-of date and a source.

**Key finding.** ≈ $87k MRR is ≈ ₹9 crore a year; an Indian GST-registered invoicing
entity would be above the ₹5 crore e-invoicing threshold, so a B2B or export invoice is
valid only with an IRN and signed QR from the IRP. HQ must **record** invoices, not mint
them. Which entity invoices decides which tax rules apply — a founder / accountant question.

1. **Billing schedule and invoice register (M).** Stripe: draft → open → paid | void |
   uncollectible; finalised invoices never change, corrections are credit notes. HQ: the
   expected invoices derived from each contract's cadence and term (period, amount, due
   date); a "to bill in the next 30 days" queue and a **billed late** flag when a period
   has started with no invoice; a register of issued invoices (number from the accounting
   system, issue date, period, net / tax / gross, currency, terms, due, PO, status).
   Never delete an issued invoice.
2. **Receivables ageing and collections (M).** Buckets current / 1–30 / 31–60 / 61–90 /
   90+ **per currency, never summed across currencies**. Collection state per invoice:
   reminded (n) → promised (date, amount; reminders pause) → disputed (paused) →
   escalated → written off (reason and a second person). Reminders at −7 / 0 / +7 / +14 /
   +30 days, drafted for a person to send. Receipts with bank reference, charges and
   **TDS withheld** (Indian customers withhold 2–10 % under s.393 of the Income-tax Act
   2025; the short payment is a receivable until the certificate arrives). FEMA: export
   proceeds within 9 months — flag at 6 and 8. UK late-payment interest (8 % + base rate)
   shown as a figure, never charged. Suspension of a firm is always a person's decision.
3. **Customer billing profile (S).** Legal entity, billing address and country (Indian
   state code), VAT number / GSTIN, place of supply, tax treatment, AP contacts, PO number
   with value and expiry and a "PO required" flag, terms, invoice currency, TDS expected.
4. **Cash and runway (M).** Runway = cash ÷ net burn over the trailing three months, from
   balances entered per account with a date. **Refuse to show runway** when an account is
   missing or older than 35 days; say "cash-flow positive" rather than ∞.
5. **Deferred revenue schedule (M)**, **vendor and subscription register with cancel-by
   dates (S/M)**, **investor update drafts from a frozen snapshot (S/M)**, **purchase
   requests and expense claims (S)**, **budget vs actual (M, last)**.

**What an invoice must carry** (a pre-send check, not a renderer): UK VAT Notice 700 §16.3
(number, date, supplier name / address / VAT number, customer name / address, description,
unit price, rate, VAT, total; in a foreign currency the VAT in sterling and the rate);
India CGST Rule 46 (GSTIN both sides, a ≤ 16-character serial unique per financial year,
SAC, place of supply, the export endorsement under LUT). UK B2B e-invoicing from 1 April 2029.

**Not here:** minting tax invoices or IRNs, the ledger and returns, card retries, the
customer's billing portal (that is the Account Portal), spend cards, cap table, payroll.

Sources: docs.stripe.com/invoicing/overview · docs.stripe.com/invoicing/automatic-collection ·
gov.uk/guidance/vat-guide-notice-700 · gstzen.in/a/tax-invoice-cgst-rule-46.html ·
taxmann.com/post/blog/rbi-restores-export-proceeds-realisation-period-to-9-months ·
pilot.com/blog/burn-rate-calculation-startup-runway-calculator

## 5. Trust, privacy and compliance operations

Two dated duties make the first item a present gap, not a future one: the UK Data (Use and
Access) Act's rules on rights requests apply from 5 February 2026, and the statutory
complaints duty (DPA 2018 s.164A) from 19 June 2026.

1. **Rights-request and complaints desk (M).** Types: access, rectification, erasure,
   restriction, portability, objection, automated-decision review, consent withdrawal,
   complaint. **UK clock (Art 12A):** one month from the latest of receipt, identity
   confirmed, fee paid; the corresponding calendar date, the month's last day when that
   date does not exist, the next working day when it lands on a weekend or bank holiday;
   **stop the clock** only while waiting for information needed to scope the request
   (paused the day it is asked, resumed the day after the answer); an extension of two
   months for complex requests, told to the person with reasons inside the first month.
   Complaints: acknowledge within 30 days. India DPDP grievances: 90 days (most rules from
   14 May 2027). States: received → identity → scoping (paused) → searching → review →
   responded / extended / refused (with a reason). A search checklist per system; erasure
   and objection link to the existing anonymisation and do-not-contact.
2. **Incident and breach register with clocks (M).** Every breach is logged (Art 33(5)),
   notified or not; `aware_at` anchors the 72-hour ICO clock; "notifiable?" is a recorded
   human judgement with its reason; affected customers notified within their contract's
   hours; DORA clients need facts within hours (initial report 4 h after classifying as
   major).
3. **Customer commitments register (S/M).** Per customer: incident notice hours,
   sub-processor notice days and objection window, audit rights, data locations, exit
   assistance, how the customer classifies us (DORA critical or important function,
   material outsourcing). Record what the contract says; flag non-standard clauses.
4. **Sub-processor register and change notices (S/M).** Legal entity, purpose, data
   categories, locations, transfer mechanism, DPA date; proposed → notice sent → objection
   window → active → retired; 30 days' notice is the market norm; notices per customer
   through outbound mail with any objection recorded.
5. **Questionnaire answer library (M)**, **record of processing activities (S)**, **risk
   register (S)**, **supplier reviews by tier (S/M)**, **production change log (S/M)**,
   **findings with remediation SLAs (S)**, **continuity test records (S)**, **trust centre
   (M/L, after the registers)**, **control map with an auditor view (M/L)** — never a
   "% compliant" figure.

**Not here:** continuous cloud tests (buy one if an audit starts), a CCPA-only workflow,
ID-document vendors, DORA register submission (the client's duty), public security badges.

Sources: ico.org.uk/for-the-public/time-limits-for-responding-to-data-protection-rights-requests ·
legislation.gov.uk/ukpga/2025/18/section/103/enacted ·
edpb.europa.eu/documents/guideline/guidelines-92022-on-personal-data-breach-notification-under-gdpr_nb ·
fca.org.uk/publications/policy-statements/ps26-2-operational-incident-third-party-reporting ·
ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/accountability-and-governance/documentation

## 6. Security hardening

Sessions already meet NIST 800-63B-4 (12 h absolute; 15 min idle for owner / admin is
AAL3-grade, 30 min for others within AAL2). Two findings are **defects in HQ today**, not
missing features:

- **The CSP allows inline script** (`script-src 'self' 'unsafe-inline'` in
  `next.config.ts`). Outsiders' text reaches staff browsers — ticket bodies, intake leads,
  mail replies — so one stored XSS would carry an owner's session and the policy would
  stop none of it. The Next 16 guide: the proxy mints a nonce per request and sends
  `script-src 'self' 'nonce-…' 'strict-dynamic'`; every page renders dynamically (HQ's
  already do). Report-only first is the cautious route; HQ has a harness that loads every
  screen, so it can enforce at once and let the harness catch a blocked script.
- **An authenticator reset leaves the person on a password alone** until they enrol again
  (`staff_routes.handle_staff_totp_reset`). Okta's 2023 advisory (help-desk social
  engineering of super-admin resets): the reset should hand over a single-use enrolment
  link (24 h), and resetting an owner's or admin's factor should take a second person.

**Ranked gaps**

1. **Strict CSP with a nonce (S)** — above.
2. **Safer factor reset (S)** — above; plus an alert on every factor change.
3. **Security feed and "this wasn't me" (S/M).** Okta mails the user on a sign-in from a
   new client (a long-lived device cookie, not the IP), on a factor added or removed, and
   on a password change, each with a "report suspicious activity" button that revokes
   every session, forces a reset and alerts the owners. One feed for owners: factor
   changes, recovery codes used, exports, tripwires, decoys, break-glass sign-ins — open /
   acknowledged / resolved. Retool 2023: the attacker added their own device; a
   "factor added" mail is the only thing that shows it.
4. **Read log and volume tripwires (M).** Salesforce Transaction Security (block / MFA /
   notify on report, list and API events; the stock example blocks exports ≥ 1,000
   rows); Atlassian Guard flags crawling. Coinbase 2025: bribed support agents copied
   69,461 customers' data from support tools, unnoticed for five months. HQ: the service
   counts distinct records served per person over a rolling hour — notify owners at 150
   (intern 60), a fresh code at 300, blocked at 600 until an owner clears it; "Viewed by"
   on a record for owners.
5. **Decoy records and keys (S).** A company, contract and contact that nobody has any
   reason to open; opening, exporting or reading it by API alerts owners; left out of
   every total; a decoy intake key whose any use alerts.
6. **Break-glass owner (S).** Microsoft Entra: two accounts, sealed credentials,
   phishing-resistant keys, every sign-in a critical alert, tested every 90 days.
7. **Just-in-time elevation (M).** Entra PIM: admin eligible, activated for 1–24 h with a
   reason and a fresh code, owners mailed; actions while elevated tagged.
8. **Masked fields with reveal-with-reason (M).** HubSpot sensitive data: named viewers,
   reveal logged; Stripe shows a secret once. HQ: emergency contacts, personal phones,
   one-to-one notes masked in the service (exports and APIs too); a reveal needs a reason
   and the sudo window, re-masks after 60 s, writes `field.revealed`.
9. **Key hygiene (S).** Last used on every key; reminders 30 / 7 / 1 days before expiry;
   keys unused for 90 days disabled; a register of service secrets with rotation dates.
10. **Export canary and quota (S)**, **secrets scrubbed from support text (S)**, **effective
    permissions per role (S)**, **record-level privacy (M/L)**, **the ledger switch
    written out properly (S/M)**.

**Not here:** Google sign-in + SCIM at 5–10 staff (one Google account becomes the single
point of failure), device-bound session credentials (Chrome on Windows only), ML
baselines, DLP, session recording, IP allow-lists and geolocation.

Sources: nextjs.org/docs/app/guides/content-security-policy ·
pages.nist.gov/800-63-4/sp800-63b/aal ·
sec.okta.com/articles/2023/08/cross-tenant-impersonation-prevention-and-detection ·
retool.com/blog/mfa-isnt-mfa ·
help.okta.com/en-us/Content/Topics/security/suspicious-activity-reporting.htm ·
trailhead.salesforce.com/content/learn/modules/enhanced_transaction_security/enhanced_transaction_security_basics ·
learn.microsoft.com/en-us/entra/identity/role-based-access-control/security-emergency-access

## 7. AI assistance

Order of value: (1) support reply drafts grounded in saved replies and resolved threads,
with source chips, never sent by themselves, "no grounded answer" when nothing supports
one; (2) "brief me" before a meeting — on demand, never stored, stamped "as of … from N
records", every figure filled by code; (3) meeting notes → proposed tasks, each quoting
its line; (4) triage suggestions (tag, priority, duplicate within the same firm) with
accept / dismiss; (5) plain-English filters — the model sees only the filter schema, never
a record; (6) field extraction from pasted text; (7) a narrative over the week's pipeline
changes whose every number is inserted by code.

**Minimum safe architecture:** one provider interface in the service; the key only in
service settings; **"AI assistance is not configured"** when there is none — no canned
output; a capability per feature and an owner switch; context assembled by the same reads
the page uses, as the caller; an allow-list of fields per feature; inbound text (tickets,
mails, forms) wrapped as untrusted data to a model with no tools; output rendered as plain
text; citations checked by the server; one `hq_ai_runs` row per call (feature, actor,
source ids, tokens, outcome); per-person and monthly caps.

**Not here:** AI deal / health / churn scores, anything sent automatically, triage that
applies itself, web research written into CRM fields, summaries stored as fields.

Sources: intercom.com/help/en/articles/8587194-how-to-use-fin-ai-copilot ·
help.gong.io/docs/understanding-ai-briefer · linear.app/docs/triage-intelligence ·
simonwillison.net/2025/Jun/13/prompt-injection-design-patterns · varonis.com/blog/forcedleak

---

## 8. What gets built, in order

Each is a full wave: migration → service handlers and tests → mock → portal → harness →
commit, and the checkpoint in `PLAN.md`.

| #   | Wave                | From           | What                                                                                                                                                                   |
| --- | ------------------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 0   | Security 2          | §6.1–5, §6.9   | the strict CSP with a nonce, the safer factor reset, the security feed with new-device and factor mails and "this wasn't me", read tripwires, decoys, key hygiene      |
| 1   | Inbox               | §3.1           | notifications with reasons, read / done / snooze, follow any record, remind me, unread-only mail by the worker's pass; mentions and approvals move there               |
| 2   | Receivables         | §4.1–3         | billing profile, the billing schedule and "billed late", the invoice register, receipts with TDS, ageing per currency, collection states, write-off under dual control |
| 3   | Privacy desk        | §5.1–4         | rights requests with the UK clock, complaints, the incident and breach register with its clocks, customer commitments, sub-processors and change notices               |
| 4   | Pipeline inspection | §1.1–2, §1.4–6 | changes this week with push counts, forecast categories, submissions and accuracy, targets, competitors on open deals, battlecards, win/loss interviews                |
| 5   | Customer success    | §2.1–2, §2.4–5 | usage per firm and rule signals, feature requests with the money asking and a close-the-loop mail, onboarding projects, renewal playbooks                              |
| 6   | Status              | §2.3           | components, incidents, maintenance, subscribers, the public status page, firms whose tickets fell inside an incident                                                   |
| 7   | Security 3          | §6.6–8, §6.10  | break-glass, just-in-time elevation, masked fields with reveal, export canary and quota, secrets scrubbed from support text                                            |
| 8   | AI assistance       | §7             | the provider interface and the honest unconfigured state, then the features in the order above                                                                         |
| 9   | Platform            | §3.2–4         | stage and validation rules, record templates, comment threads, digests, outbound webhooks, the automation builder                                                      |
| 10  | Trust registers     | §5.5           | risk register, supplier reviews, change log, findings, continuity tests, the answer library                                                                            |
