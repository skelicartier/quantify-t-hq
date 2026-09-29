# Outbound mail — research, 30 September 2026

The research behind HQ's outbound mail: campaigns to customers and prospects, sales
sequences from one person to another, and the rules that decide who may be mailed. Three
passes finished, each citing the vendors' and standards bodies' own pages; this file
keeps their conclusions and the evidence that decided the design, and says what was
built from each and what was left out.

Two further passes — deliverability operations and the provider's API surface — were
interrupted before they reported. Their questions were answered in part by the
architecture pass (§4 below); what is still open is listed in §7.

The three full reports ran to about 28,000 words. They are summarised here, not copied;
every claim keeps the link it was made from.

---

## 1. What the standards and the mailbox providers require

These are the rules a sender is judged by, whatever its size.

- **One-click unsubscribe (RFC 8058).** `List-Unsubscribe` must carry one HTTPS URI;
  `List-Unsubscribe-Post: List-Unsubscribe=One-Click` announces it; the mailbox provider
  POSTs `List-Unsubscribe=One-Click` to it; both headers must be covered by the DKIM
  signature; the URI should carry "an opaque identifier or another hard-to-forge
  component". The RFC says nothing about expiry or replay.
  https://datatracker.ietf.org/doc/html/rfc8058
- **Gmail's bulk-sender bar** (about 5,000 a day to personal Gmail): SPF, DKIM and DMARC
  with an aligned From; both one-click headers plus "a clearly visible unsubscribe link in
  the message body"; spam rate "below 0.10%" and never "0.30% or higher"; unsubscribes
  honoured "within 48 hours"; mailto-only unsubscribe "doesn't meet our one-click
  unsubscribe requirement". https://support.google.com/a/answer/81126 ,
  https://support.google.com/a/answer/14229414
- **Yahoo**: "The Post (RFC 8058) method is highly recommended", "Honor unsubscribes
  within 2 days", "Keep your spam rate below 0.3%".
  https://senders.yahooinc.com/best-practices/
- Below the bulk thresholds these are recommendations, not mandates. The architecture
  pass's advice was to build them in anyway: "the first campaign that lands in a
  corporate domain will be judged by the same filters."
- **Consent is two tiers, not one.** Marketing is opt-out per topic for UK and US
  corporate subscribers but needs an explicit yes in Germany and Austria; sales 1:1 mail
  rests on legitimate interest with a per-person stop that ends every sequence.
  Do-not-contact overrides both.
- **A postal address in every marketing message** (CAN-SPAM; UK PECR practice).

## 2. How CRM suites run email from inside the customer database

Vendors read: HubSpot, Salesforce (Pardot / Marketing Cloud), Pipedrive, Zoho,
Freshsales, Close, Attio, Copper, folk, Keap, ActiveCampaign, Customer.io and the
provider HQ sends through.

- **Audiences are saved dynamic filters**, re-evaluated when the send is scheduled, and
  the resolved recipients are frozen on the send with a per-recipient outcome or
  not-sent reason (HubSpot's Recipients tab).
- **Deliverability state belongs to the address, not the person**: hard bounce, soft
  bounces counted to a limit, complaint, invalid (Close's first-non-unsubscribed-address
  rule; Pipedrive's five-bounce rule).
- **Build and send are separate permissions.** Pipedrive, Zoho and Customer.io all split
  them; Close restricts bulk sends to admins. Pipedrive has five Campaigns permissions.
  https://support.pipedrive.com/en/article/campaigns-permissions
- **A second person approves large or sensitive sends.** Zoho goes further and has its
  own moderators review every campaign.
  https://help.zoho.com/portal/en/kb/campaigns/faqs/campaign-review/articles/campaign-review-faq
- **Sales mail and marketing mail travel differently.** Attio, Close, HubSpot, Copper and
  Pipedrive send sequences through the user's own mailbox and marketing through an ESP;
  Attio states its mass email must not be used for "Cold sales outreach" or newsletters.
  https://attio.com/help/reference/email-calendar/send-emails-in-attio
- **Opens are stored but not trusted.** Apple Mail Privacy Protection and corporate
  scanners open everything; HubSpot filters bots, Litmus documents the inflation. Opens
  are never used in filters, suppression or headline figures.
- **Resending to non-openers is dubious** for the same reason.
- **Frequency caps** (HubSpot Enterprise, Customer.io) and **quiet hours** in the
  recipient's zone (Close 9–16, Copper 8–18) are standard; overflow is queued to the next
  business day, never dropped.

The pass ended with 25 design decisions for a three-to-ten-person B2B software company.
§5 maps them to what was built.

## 3. Sales sequences

Tools read: Outreach, Salesloft, Apollo, HubSpot Sequences, Close, Reply.io, lemlist,
Woodpecker, Instantly, Mixmax.

- **Steps are emails, calls and tasks**, with delays counted in the recipient's business
  days; a follow-up is threaded as a reply (`In-Reply-To`, `References`, "Re: " + the
  original subject) or sent as a new thread. Gmail joins a conversation on the same
  subject or reference headers and breaks it when the subject changes.
  https://support.google.com/mail/answer/5900
- **Four to six steps over two to three weeks**; the last one closes the loop politely.
- **Enrolment refuses, with a reason code, and shows the refusals before anything is
  sent**: already in a sequence, had this one within its cooling period, contacted in the
  last N days, owned by a colleague, do-not-contact, unsubscribed, bounced, a paying
  customer in a prospect sequence, no or invalid address, a token with no value and no
  fallback, too many people at one firm.
- **Exits without inbox sync** come from the CRM: a recorded outcome, a meeting, a deal at
  the firm, a lead moving stage, a bounce, a stop. When one person at a firm engages,
  every other enrolment there pauses for the owner to decide (account-level stop).
- **Sending rules**: a per-sender daily cap, recipient-local business-hour windows,
  randomised spacing, pause on high bounce rates, and per-domain limits. Instantly's
  benchmark: "Keep bounce rates below 2% (ideally much lower)".
  https://instantly.ai/cold-email-benchmark-report-2026
- **Personalisation that works** is short, plain text, one question, a real "why you"
  line; tokens always have fallbacks, and a missing token never sends a gap.
- **Reply handling for a team without inbox sync** is a shared replies checklist: every
  enrolment whose last email is a business day old appears there with one-click
  outcomes.
- **No leaderboards for tiny teams.** "With two to four senders, a rank is decided by a
  handful of replies"; per-sender figures go to the sender and the founder only.

The pass ended with 44 testable rules. §5 and §7 say which HQ enforces.

## 4. Architecture on Azure Functions, Azure SQL and a transactional mail API

- **The queue is the database.** Each outbound message is a row; a worker claims rows with
  a lease (`claimed_by`, `lease_expires_at`), sends, and records the result; every write
  that could double a send is conditional on the run's own lease.
- **The ambiguity window** — the provider accepted the message but the run died before
  recording it — ends in `unknown`, never in a second call.
- **Caps are reserved atomically before the provider is called** (global, per sender, per
  hour), and released if unused.
- **Deferred messages go to the next window opening in the recipient's own zone**,
  correct across DST and midnight UTC.
- **Serverless SQL must not be woken every five minutes.** Any login resumes it; open
  sessions stop it pausing; the first connection to a paused database fails with 40613
  and resumes in under a minute. A timer that connects every five minutes bills the
  database around the clock — the shape of the September cost incident. The fix is a
  small "anything due?" flag in the storage account the timer already uses, with an
  hourly safety valve.
  https://learn.microsoft.com/en-us/azure/azure-sql/database/serverless-tier-auto-pause-resume ,
  https://learn.microsoft.com/en-us/azure/azure-sql/database/free-offer
- **Webhooks** are verified (a secret in the path, rotatable with a grace period), stored
  before they are applied, deduplicated on message id + event + event time + link, and
  applied by rank so out-of-order events never regress a message's state.
- **Suppression is by address and never deleted**; a release is a stamp with a reason.
- **Unsubscribe tokens** are HMAC-signed, bound to one message and one scope, with a key
  id so the secret can rotate.
- **The pass listed 35 invariants to test**; the service's suite asserts them
  (`tests/test_hq_mail.py` in the product repo).

## 5. What HQ built from it

Service (product repo, migration 0027, `account_api/hq/mail_*.py`) and portal (`/mail/*`,
the public stop page at `/u/[token]`):

| Research decision                                             | In HQ                                                                                             |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Two consent tiers, do-not-contact over both, DE/AT need a yes | `mail_rules.marketing_verdict` / `sales_verdict`; a consent row per address with basis and source |
| Suppression by address, never deleted                         | Released with a note; a complaint can only be released by an owner                                |
| Saved dynamic segments, frozen audience per send              | Segments re-evaluated at schedule; message rows written once at enqueue                           |
| Blocking checklist before sending                             | Verified sender, postal address, a test of the pinned version, sending on; webhook advised        |
| Second-person approval at 50+ recipients or any customer      | `review` state; the approver needs `mail:send` and a fresh code, and is never the author          |
| Build and send separate                                       | `crm:write` drafts; `mail:send` approves, schedules, pauses                                       |
| Caps: global, per sender, per hour; per domain                | Reserved atomically in the worker; the portal shows each deferral's reason in words               |
| Recipient-local windows, business days                        | `next_slot`; country to zone; a fallback zone setting                                             |
| Auto-pause on bounces and complaints                          | 2% hard bounces / 0.1% complaints after 50 sends; 3 early hard bounces; any early complaint       |
| One-click unsubscribe + footer link + preference page         | RFC 8058 headers, `/u/{token}/one-click`, `/u/{token}` with topics                                |
| Opens not shown; scanner clicks not counted                   | No open figure anywhere; clicks within seconds of delivery are stored but not counted             |
| Sequences: steps, business-day delays, threading, tasks       | A task step waits for its task to be done                                                         |
| Enrolment refusals with reason codes, previewed               | "Check who it takes" before "Enrol"                                                               |
| Exits from CRM events; account-level stop                     | Meeting, deal, lead stage, do-not-contact, outcomes; COMPANY_ENGAGED pause for 3 business days    |
| Replies checklist                                             | `/mail/replies`, one-click outcomes, an out-of-office pause                                       |
| Dry run, seed inboxes, kill switch                            | All three; seeds go first and are never counted                                                   |
| Serverless-safe worker                                        | Due flag in blob storage, hourly safety valve, a short budget, unstarted rows handed back         |
| Reconciliation with the provider's blocklist                  | Nightly                                                                                           |

Deliberately not built, with the reason the research gave: open tracking and
resend-to-non-openers (privacy proxies); A/B tests (too few recipients); lead scoring,
workflow canvases, SMS, landing pages, AI copy (the CRM pass's skip list); per-sender
leaderboards (the sequence pass).

One decision was adapted rather than followed. The CRM pass recommends sending sequences
through each person's own mailbox so replies thread normally. HQ has no mailbox
integration, so sequences go through the same provider from a per-person sales identity
on the company domain, with Reply-To set to the person's real mailbox; replies land in
that inbox and are recorded on the replies checklist.

## 6. Checks run against the result

- The service's mail tests assert the architecture invariants and the sequence rules the
  engine enforces.
- The portal's route-parity test holds the client and the mock to the service's route
  table; the payload-contract test parses every sampled owner payload.
- The screenshot harness walks every mail page at desktop and phone width in both themes,
  approves and starts a campaign, tests and submits a draft, checks a segment and an
  enrolment, and unsubscribes through both the stop page and the RFC 8058 POST, reading
  the result back from the service.

## 7. Built in the second pass, and still open

Built after the first commit, from the lists above:

- one first email per recipient firm domain per rolling day, whoever sends it (rule 25);
  free-mail domains are exempt from this and from the three-a-day limit;
- follow-ups claimed before first emails, seeds still first (rule 28);
- a per-sender bounce breaker: three hard bounces from one sender's sequences within a day
  hold its mail and mail the owners; resuming releases exactly the held rows (rule 27);
- a reply logged on the CRM ends the enrolment and pauses colleagues at the firm (rule 22
  in spirit); it had been moving a lead to Connected while its sequence kept sending;
- sender verification read from the provider's own sender and domain lists, exact domain
  only; a hand tick is labelled as one;
- a one-click stop that arrives while the database is asleep is parked in blob storage,
  answered 200 and applied first on the next pass (invariant 28).

Still open:

- randomised spacing between one sender's sends (rule 26);
- a separate first-touch budget per sender (rule 24);
- sender consent to automated sending in their name (rule 14): today an admin creates the
  identity;
- the deliverability and provider-API passes that were interrupted would have covered
  warm-up schedules for a new sending domain, reputation monitoring (Google Postmaster
  Tools, Microsoft SNDS) and DMARC reporting.
