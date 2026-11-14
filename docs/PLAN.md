# HQ — the plan, what is done, what is left

**Read this first when picking the work up again** (after a context reset, a new session, a
new person). It is the one file that says where everything is, how it is verified, what
has shipped, and what comes next in what order. Update the **Checkpoint** at the bottom at
the end of every wave, and move items between the lists as they land.

---

## 1. What HQ is

The staff-only company console for Quantify Terminal at `hq.quantifyterminal.com`: CRM
(leads, companies, people, deals), meetings, tasks, the support desk, revenue (contracts,
renewals, MRR), reports, team / HR-lite, admin (staff, roles, audit, settings, integrations,
danger zone), with real TOTP sign-in. Two repositories:

| Repo                                           | Path                                                                                                                        | What lives there                                                                                                                                                                                                                                            |
| ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **HQ portal** (Next.js 16, TypeScript)         | `~/Documents/Projects/HQ Quantify Terminal` — GitHub `aaryansaroha98/quantify-t-hq`, branch `main`, pushed                  | UI, server actions, zod API clients (`src/lib/api/*`), the mock service (`scripts/mock-hq-api.ts`), the screenshot harness, `docs/DESIGN.md` (the UI contract), `docs/RESEARCH-*.md` (the research passes), this file                                       |
| **Product / service** (Python Azure Functions) | `~/Documents/Projects/Quantify Terminal` → `cloud/azure/account_function/` — commits stay LOCAL (never pushed unless asked) | `account_api/hq/*` routes, `schema/migrations/0007–0055`, `tests/test_hq_api.py` (HQ suite) and `tests/test_hq_payload_samples.py` (writes the payload fixture the portal's contract test reads), `docs/HQ_GO_LIVE.md` (the production switch-on checklist) |

## 2. Ground rules (do not relearn these)

- **Never** add "Co-Authored-By: Claude" or "Generated with Claude Code" to a commit or PR.
- Stage only the files of the task. In the product repo never stage the pre-existing
  uncommitted `src/intelligence/overnight/impact.py`, `src/ui/tabs/deep_research_tab.py`,
  `src/ui/tabs/pulse_tab.py`, `tests/_fabric_coverage_test.db`.
- `.env.local` is gitignored and must never be committed. It carries
  `HQ_DEV_AUTOLOGIN=owner@hq.test` (the test bypass; inert in a production build) and
  `QT_UPDATE_DEPLOY_URL=http://127.0.0.1:7071` (Releases, against the release function
  the mock serves under `/api`) and `HQ_MAIL_MERGE_SOCKET` (Mail merge's local sender).
- **A real list and the provider key never enter the repository.** Mail merge keeps both in
  `~/Library/Application Support/hq-mail-merge`. Its tests and its browser walk use invented
  people on `.example` domains and a stand-in provider.
- **The mock must mirror the real routes** (route names, methods, payload shapes): the
  route-parity and payload-contract tests enforce it. Any new route = service handler +
  test + mock handler + portal client, in that order.
- **The harness is the gate** (`npm run check:hq-ui`, ~5 min, 214 screens, axe serious /
  critical = 0, no horizontal overflow, no console errors). Never edit files while it runs.
  Restart the dev server after any `next build`. Restart the mock after a seed change.
- Never name a data vendor in UI copy (copy-guard test). Tables never truncate data
  columns (a stat hint may ellipsise; keep hints under ~26 characters).
- Numbers: every metric is a plain ratio of figures on the page; tests work the arithmetic
  by hand first. No LTV (too little history), no health score presented as predictive, no
  NPS at this size, no annualised churn from a quiet month.
- Demo data in the mock uses REAL firm names with INVENTED contacts and the mock's own
  price list; never present it as customers. The seeded prospects are invented people at
  invented firms on reserved `.example` domains: nothing there can be mistaken for, or
  mailed to, a real person. Real prospect files are imported at run time and never
  committed.
- **A route that takes rows says so.** Every signed-in POST is read under 256 KB
  (`dispatch.STAFF_BODY_BYTES`); a route that carries a part of a file or a long list of
  ids declares `body_bytes` in the route table (4 MB) and is in the mock's
  `BODY_ROW_ROUTES`. Anonymous routes keep the 16 KB form limit. The portal's server
  actions take 4 MB (`next.config.ts`). The mock counts bytes too: a mock that did not
  once certified imports the service would have refused.
- **A list that can run to thousands is read a page at a time** (`hq/leads` with
  `origin=prospect`): filters, order, paging and the breakdown are the service's, and the
  page never holds more than a hundred rows. The older lists are read whole.

## 3. Commands and gates

Portal (from the HQ repo):

```
npm run dev                                  # dev server on :3000 (expects the mock)
npm run mock:hq                              # mock service on :7071; POST /api/v1/mock/reset reseeds
npx tsc --noEmit -p tsconfig.json && npx eslint <paths> && npx prettier --write <paths>
npx vitest run                               # unit + route-parity + payload-contract tests
npm run check:hq-ui                          # the harness; output in test-results/hq/
npm run check:passkeys                       # passkeys end to end with a virtual authenticator (dev + mock up; reaches localhost:3000)
HQ_HARNESS_PAGES='^(prospect|lead-)' HQ_HARNESS_FLOW=prospects npm run check:hq-ui   # one part of the walk, both widths and themes (flows: prospects, mail, fields, phone, releases and the rest of the script's FLOWS table)
HQ_HARNESS_WIDTHS=desktop npm run check:hq-ui                                        # the full walk at one width (desktop or phone): about an hour each, under the two-hour task limit
npx tsx scripts/e2e-leads-import.ts [file.csv] [outDir]   # a file through the import page in a real browser; with no file it writes 1,200 invented rows
npx tsx scripts/peek-hq.ts <outDir> owner@hq.test /path ...   # screenshots; HQ_PEEK_THEME=light HQ_PEEK_WIDTH=412 HQ_PEEK_AXE=1
```

Service (from the product repo root): `.venv/bin/python -m pytest tests/test_hq_api.py tests/test_hq_payload_samples.py -q` (the second writes `tests/fixtures/hq_payload_samples.json`, gitignored; rerun it after any payload change, then rerun the portal's vitest).

Personas: `owner@ admin@ sales@ support@ intern@ newbie@hq.test`, password `password-123`,
every TOTP prompt `000000`. Under the bypass, `/dev/signin?as=<persona>` switches; the
rail identity menu lists them.

**Where it runs on this machine.** `~/Documents` is in iCloud Drive, which evicts
`node_modules`, so the portal that answers on `localhost:3000` is a second clone at
`~/Library/Caches/hq-work/hq`, kept alive by three launchd agents
(`com.quantifyterminal.hq-dev`, `hq-mock`, `console-mock`; scripts in
`~/Library/Caches/hq-work/demo`, logs in `~/Library/Logs/hq-demo`). Restart one with
`launchctl kickstart -k gui/$(id -u)/com.quantifyterminal.hq-mock`; killing its process
only makes launchd start it again. Three things to know about that clone:

- It has no product repo beside it, so vitest skipped the parity and contract tests
  (215 of 420) without failing. `~/Library/Caches/hq-work/Quantify Terminal` is now a
  link to the product repo and the whole suite runs there.
- A cache folder is the system's to clear. On 2026-10-27 part of `.next/dev` was removed
  under the running server, which panicked and restarted. Work that exists only in that
  clone is one clean-up from gone: push it, or copy it back to `~/Documents`.
- Its dev log (`hq-dev.log`) is the only record of what a person browsing by hand met;
  the harness walks `127.0.0.1` with full page loads and never sees a failed link.

## 4. Done (all committed; HQ pushed, service local)

### Foundations (before 2026-09-29)

- P0–P6 of the original plan: auth (password + real TOTP + recovery + invite + sudo),
  shell, home, leads, companies, people, deals (board + discipline flags), meetings
  (calendar sync, outcomes → task cadences), tasks, support desk (SLA, notes vs replies,
  saved replies, snooze, tags, context, GitHub link), revenue (contracts, MRR ledger and
  bridge), weekly report, exports with reason, team / HR-lite (documents-before-access,
  access register, checklists, check-ins, time off, certificates, access review), admin
  (staff, roles matrix, audit, API keys, integrations, SLA / sources / pipeline settings,
  retention, danger zone). Migrations 0007–0016. 40 audit scopes passed.

### 2026-09-29 — the redesign and the demo

- Full UI rebuild to an operations console (`docs/DESIGN.md`): rail + context bar, ⌘K,
  `j/k/Enter`, dense tables, records with sticky head + URL tabs + inline properties,
  three-pane desk, draggable board, saved-reply picker, column menus.
- Dev sign-in bypass (`HQ_DEV_AUTOLOGIN`), persona switcher, stale-session redirect, and
  (on the founder's explicit decision) the confirm-it's-you window granted automatically
  for the `@hq.test` personas only.
- Demo book: 57 paying real firms + 8 former, MRR $87,312, 26 open deals, 9 won, 6 lost,
  two years of movements; a few events land "today" so the weekly report is never empty.
- Revenue analytics: growth, CMGR, gross churn, NRR, quick ratio, logo churn, tenure, seats,
  MRR by plan / firm type / country, concentration, renewals by month, cohort table by
  start quarter, movement-rate split, MRR lost by reason, ARPA trend; weekly report gains
  the 90-day conversion strip, pipeline chart, MRR trend. Server-rendered SVG charts.
- All record bodies on the record contract (meeting, contract, team member, staff).

### 2026-09-30 — the research-led waves (`docs/RESEARCH-2026-09-30.md`)

| Wave           | What                                                                                                                                                                                                                                                                                                         | Where                                                                                                                       | Commits                                    |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------ |
| Lists          | sortable headers, `x` / shift-click selection with a bulk bar (owner, lifecycle), removable filter chips, per-device saved views; Won/Lost views open as a table                                                                                                                                             | companies, leads, deals                                                                                                     | HQ `b39dfbf`, `4586571`                    |
| Analytics 2    | quarterly logo cohorts, expansion / contraction / churn / reactivation rates, net churn, GRR beside NRR, MRR lost by reason, per-customer trend                                                                                                                                                              | `/revenue/mrr`                                                                                                              | HQ `391d4ee`                               |
| Desk & details | desk keys `r n a s p t z`, `{{first_name                                                                                                                                                                                                                                                                     | there}}`reply variables, favourites (star → rail), stakeholder coverage + single-threaded warning,`close_overdue` deal flag | desk, records, rail                        | HQ `e4aae34`; service `0ab9fc7` |
| Price list     | `hq_plans` (migration 0017), `plan_key` on deals/contracts, `hq/settings/plans/update`, deals and contracts priced from seats × rate held to the plan's minimum; settings section; keyed inputs; record-head popovers open right                                                                             | settings, deal/contract forms and records                                                                                   | HQ `09b6a04`; service `caeefd2`, `59db2c8` |
| Renewal ledger | migration 0018 (status / confidence / renews-at / note / recorded by), `hq/contracts/{id}/renewal`, `hq/revenue/renewals` (window, six-month due vs forecast roll-up, dates passed), Home renewals section; `/revenue/renewals` page with bulk expectation; contract Renewal properties; Home "Renewal" rows | revenue, home                                                                                                               | service `58e403e`; HQ `9dd7ba4`            |
| Field history  | every update's audit row carries `changes` (value before → after, per field); a History tab on company, person and contract records and a Changes tab on deals, read from `hq/audit` for roles with `audit:read`                                                                                             | records                                                                                                                     | service `b91e82a`; HQ `7712133`            |

### 2026-10-01 — the support desk

| Wave          | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Where                                   | Commits                                                  |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------- | -------------------------------------------------------- |
| Desk: threads | followers (migration 0019, `hq/tickets/{id}/follow`, a Following queue filter that opens every status, `o` key, "Followed by …" in the head); merge (`hq/tickets/{id}/merge {into}`: messages in time order, tags + followers united, more urgent priority kept, duplicate resolved + tagged `merged`, notes both sides, refused when either side is resolved); reopen counting (by hand or by the customer writing again; "Reopened once" pill); weekly report "Support desk" card                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | desk, reports                           | service `c90578c`; HQ `d4dea8a`                          |
| Desk: rules   | migration 0020 (`support_alerts` + `desk.*` settings); `desk_rules` / `desk_sweeper`: fewest-open assignment from an admin-chosen pool, one public "still there?" nudge, a public close a reply reopens, one mail per deadline to an assignee whose reply timer is at risk or breached; runs from the queue read when the last pass is > 15 min old + nightly at 03:51 (no quarter-hour timer: the serverless database's free hours); `hq/settings/desk/update`; Settings → Desk rules form; breadcrumb fix ("Ngs")                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | settings, desk, `function_app.py` timer | service `c90578c`; HQ: the commit adding this            |
| Security      | breached-password check (HIBP k-anonymity; fails open; `QT_HQ_BREACH_CHECK=0` off) on invite / reset / change; owner and admin sessions idle out at 15 min (`hq/me.session_policy`); a role change mails the person, a minted key mails every owner; migration 0021 gives intake keys `expires_at` (180 days or less), expired keys are refused, the offboarding checklist gains "rotate the keys"; the access review names orphans, shared accounts and money separation-of-duties conflicts; `POST hq/audit/export` hands back a signed JSONL copy (digest + HMAC, audited first; `scripts/verify_hq_audit_export.py` checks it); Integrations shows expiry and a "Lives for" picker, Audit an "Export a signed copy" block                                                                                                                                                                                                                                                        | auth, admin, access review              | service `4b239cf`; HQ: the commit adding this            |
| People ops    | migration 0022: manager / reporting line (no loops), probation end, emergency contact; asset register whose returns gate the offboarding step "Devices and materials returned"; versioned company policies acknowledged per version (publishing asks everyone again), acknowledged under My security, edited under Settings; training records with expiry; one-to-ones with actions (HR or the manager writes, the owner ticks); reminders within 60 days on the person and across the Team page                                                                                                                                                                                                                                                                                                                                                                                                                                                                                     | team, my security, settings             | service `ea4b7c7`; HQ: the commit adding this            |
| CRM structure | migration 0023: parent companies (no loops; the record names its parent, lists children and rolls the group's MRR up); company and person merge (sudo: every reference moves, blanks fill, stricter do-not-contact wins, notes keep provenance, the duplicate is archived and its domain / address released); duplicate suggestions by legal-form-stripped name and by person name or address; CSV import for companies and people (read in the browser, mapped, ≤ 500 rows, each validated, known records skipped and named, counts audited with a reason); @mentions in notes (a row on Home until seen, and a mail); the stage funnel (entered / moved on / lost / still here / conversion / median days) and the pipeline over time from nightly snapshots                                                                                                                                                                                                                       | companies, people, reports, home        | service `531e7b6`, `3c779d2`; HQ: the commit adding this |
| Lists 2       | grouping (stage / source / owner) and the filter builder (stage, source, owner, company, email, waiting minutes, first-reply overdue) on Leads; grouping (stage / owner) and the filter builder (stage, owner, company, value, weighted, days in stage, days quiet, next step, due, flags) on the Deals table — the same `filters.ts`, `FilterBuilder` and `CategoryRow` modules as Companies, one page each; conditions and the group ride in the URL (`f=`, `group=`) and in saved views                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | leads, deals                            | HQ: the commit adding this                               |
| Dual control  | migration 0026 `hq_approvals`: granting Owner or Admin (invite or role change) and minting an intake key WAIT when a second person with the standing exists — a role grant takes a second Owner, a key an Owner or Admin; the requester never decides their own; 48-hour lapse; an approved key is minted only when the requester collects it (the secret is theirs alone); alone, an owner acts at once and the audit row says `dual_control: sole_approver`; `hq/approvals` + approve / decline (sudo) / withdraw / collect (sudo), mails to approvers and requester; sign-in rules `failures_first` (address failed ≥ 5 sign-ins in the hour) and `address_change` (another address within 10 min) write `auth.anomalous` and mail the person + owners, never refuse; Home `approvals` + `security` sections; portal `/admin/approvals` (decide / history / your requests / waiting on others), forms say "sent for approval", Home cards "Approvals waiting" and "Sign-in watch" | admin, home                             | service `cc25941`; HQ: the commit adding this            |
| Passkeys      | migration 0025 `hq_passkeys`; `webauthn.py` (stdlib CBOR + `cryptography`: COSE P-256 / RSA keys, registration with "none" attestation, assertion with a moving sign count, the challenge inside a 5-minute typed token); `hq/auth/passkey/options` + `hq/auth/passkey` take the code step's place for a pending sign-in (`login.passkeys` says the account holds one); `hq/passkeys` (list), `/register/options`, `/register`, `/{id}/delete` under sudo, ≤ 10 each, a mail on add and remove; portal: `usePasskeySupport` (no hydration mismatch), `PasskeyButton` offered above the code, only to accounts that hold one (`passkeys` in the pending cookie), My security → Passkeys (list, Remove, SudoGate, `AddPasskeyForm`), refusal notice on the code step; the mock reads the real credential id from the attestation object's CBOR so a virtual authenticator registers then signs in; `scripts/e2e-passkeys.ts` drives the whole thing                                    | login, my security                      | service `88cbcc7`; HQ: the commit adding this            |
| Lists         | migration 0024: saved views kept with the account (private or shared with the team, ≤ 20 per list per person, owner or admin edits) replace the per-device ones on companies / leads / deals; column and density preferences sync to the account and hydrate every device; a peek pane (`p` or `?peek=`) on companies, people and deals; undo for bulk changes (each row's previous value read first and put back through the same route); grouping (lifecycle / type / owner / country) and a filter builder (`f=field:op:value`, applied over every row, eight ops) on Companies                                                                                                                                                                                                                                                                                                                                                                                                   | companies, people, deals, leads, shell  | service `adc4e38`; HQ: the commit adding this            |

### Outbound mail (`docs/RESEARCH-2026-09-30-OUTBOUND.md`)

| Wave          | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Where                            | Commit                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------- | --------------------------------------------- |
| Outbound mail | migration 0027 (senders, immutable template versions, segments, consent, suppressions, campaigns, frozen message rows, sequences, steps, enrolments, events, counters, 13 `mail.*` settings); the provider's transactional API per recipient with RFC 8058 one-click headers and a signed stop token per message; two consent tiers (marketing opt-out by topic, DE/AT need a yes; a per-person sales stop), do-not-contact over both; suppression by address, released only with a note; campaigns to a segment, chosen companies / people / leads, or a CSV, with a blocking checklist, a test of the pinned version, second-person approval at 50+ or any customer (`mail:send`, fresh code, never the author), pause / resume / cancel, dry run, seed inboxes; a lease-claiming worker with atomic caps (global / sender / hour), three a day per firm domain, recipient-local working hours, retry and back-off, `unknown` never resent, auto-pause on bounces and complaints, the due flag in blob storage so the serverless database sleeps; sequences with business-day delays, reply threading, task steps, 13 enrolment refusals previewed, exits from CRM events, the account-level stop; the webhook (secret in the path, deduplicated, applied by rank, scanner clicks ignored); nightly reconciliation of the provider's blocklist; portal `/mail` (overview, campaigns, sequences, replies, templates, segments, stop list, reports, settings), the public stop page `/u/[token]` and its one-click POST, mail on person / lead / company records and Home | mail, home, records, `/u`        | service `4ebe730`; HQ `0a529e4`               |
| Mail rules 2  | one first email per firm domain per rolling day (free-mail exempt, also from the three-a-day limit); follow-ups claimed before first emails; a per-sender bounce breaker (three hard bounces from its sequences in a day hold its mail, owners mailed, `hq/mail/senders/{id}/pause` resumes and releases exactly the held rows); a logged inbound email ends the sequence and pauses the firm; `hq/mail/senders/{id}/check` reads the provider's sender and domain lists (exact domain) and says which decided "verified"; one-click stops parked in blob storage while the serverless database sleeps, applied first on the next pass (a failing entry stays parked and never stops the pass); portal: Check with the provider / Pause / Resume on each sender, deferral reasons in words, the stop page's "takes effect within minutes" answer; the mock runs the same rules                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | mail settings, overview, `/u`    | service `7007f8b`, `d6685be`; HQ `857fe44`    |
| Mailing lists | migration 0028: named static lists filled from a CSV (mapped in the browser, sent in parts of 1,000, every row accounted for — added, updated on request, unchanged, or skipped with a reason), by hand, or from CRM people and leads; other CSV columns become the list's own (up to 20), usable in templates as `{{custom.<column>}}`; a member whose address is a CRM person is linked and sent as that person; an import records the attested basis and only "consent" writes a consent row, never over an existing one; each member's status today (can be mailed, or why not), search and paging, edit, remove (stops stay), archive (refused while a waiting campaign uses it), export (crm:export, fresh code, reason, audit first); campaigns to a list, previewed and tested as its first member; demo mode also skips `/` and `/login` (form at `/login?form=1`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | mail lists, campaigns, templates | service `f095b76`; HQ: the commit adding this |

### The rest of the suite (`docs/RESEARCH-2026-09-30-SUITE.md`, third research pass)

Seven researchers, one per area (sales execution, customer success, the platform layer,
finance, trust and compliance, security hardening, AI assistance), each told what HQ has
and asked for gaps only. Section 8 of that file is the build order.

| Wave                      | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Where                                                                                                                                                                                            | Commits                                                  |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| Security 2                | the page policy runs only scripts carrying a per-request nonce (`src/lib/security/csp.ts`, minted in the proxy; `'unsafe-inline'` is gone, so a script injected into a ticket or lead cannot run); an authenticator reset clears the code, recovery codes and passkeys and shows the resetter a one-time enrolment link (24 h) — the password alone no longer enrols (migration 0029 `hq_enrol_tickets`); an owner's or admin's reset waits for a second owner who is not the person reset (approval kind `factor_reset`, collected by the requester; the person an approval is about never decides it); a long-lived `hq-device` cookie decides "new device" (`hq_staff_devices`); a security feed (`hq_security_events`) of new devices, unusual sign-ins, factor changes, recovery codes and "this wasn't me" presses, open until acknowledged or resolved (a critical one needs a note); every security mail carries a "this wasn't me" link to the public `/report/[token]` page that ends every session, replaces the password, voids any ticket, mails a reset link and tells the owners; Admin → Security, My security → Devices and "What happened to your sign-in", Home counts open and critical events                                                                                                                                                                                         | auth, admin, my security, home, `/report`                                                                                                                                                        | service `a04a737`; HQ `519de97`                          |
| Security 2, part two      | migration 0030: every record detail read written down (90 days) and counted per person per rolling hour in the dispatcher (`HqRouteEntry.reads`): owners told past 150 (intern 60), a fresh code past 300 (the portal lands on `/confirm-reads`), reading held past 600 until an owner or admin clears it with a reason — owners never held; "Viewed by" on company, person and deal records for the audit log's readers; decoys (owners only): a company with a do-not-contact contact, or an intake key — opening, exporting or presenting one is critical, mails every owner, and the audit log never names which; the nightly sweep reminds 30/7/1 days before a key expires, revokes keys unused for 90 days (decoys spared), prunes reads; Admin → Security gains "Reading this hour" and "Decoys"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | admin, records, `/confirm-reads`, nightly                                                                                                                                                        | service `d124d90`; HQ `cc82cff`                          |
| Inbox                     | migration 0031: one row per person per subject with a reason (security, waiting on you, mentioned, assigned, reply, reminder, update, activity), new events folding into the open row and making it unread again; read / done / snooze (new activity ends a snooze); follow any record (automatic on author / assigned / mentioned; unfollowing mutes); Remind me on company, person, deal and lead heads; mail only for what stays unread after the person's delay (the mail worker's pass, its due flag brought forward), or a nightly digest, or none, with quiet hours in their zone; hooks in mentions, activity on followed records, tasks / leads / companies / deals / tickets given to someone, a customer's reply on a ticket, approvals asked and decided, critical security events; `/inbox` (Inbox / Snoozed / Done, reason filter, bulk), the rail's Inbox link with its unread count (`hq/me.inbox_unread`), `/me/notifications`, Home's Inbox card; task quick-add and "Group by" labels made readable                                                                                                                                                                                                                                                                                                                                                                                     | inbox, rail, records, home, my notifications                                                                                                                                                     | service `d124d90`; HQ: the commit adding this            |
| Receivables               | migration 0032: a billing profile per customer (legal entity, address, tax identity and treatment, accounts-payable addresses, PO rules, terms, currency, withholding) with the gaps an invoice would have named; invoices as the accounting system issued them (its number, never ours; gross = net + tax enforced; voided with a reason, never deleted); receipts with bank charges and tax withheld, allocated across invoices, withheld tax a receivable until its certificate is recorded; ageing per currency (nothing summed across currencies); a worklist ordered by owed times days late; reminders drafted at −7/0/+7/+14/+30 days stating the real days overdue, sent only when a person presses send; promises and disputes pause them; the schedule from contracts names periods begun with no invoice, counted only from the first invoice recorded here; export flags at 6 and 8 months and the bad-debt relief date; write-offs wait for a second owner or admin; `/revenue/receivables`, `/revenue/invoices/[id]`, the company Billing tab                                                                                                                                                                                                                                                                                                                                               | receivables, invoice, company billing                                                                                                                                                            | service `5585103`; HQ: the commit adding this            |
| Privacy desk              | migration 0033: rights requests and complaints on the UK clock (Art 12A: one month from the latest of receipt, identity confirmed and a fee paid; the corresponding date, or the month's last day; the next working day over weekends and England and Wales bank holidays through 2028; stopped only while scoping and moved by every stopped day; a two-month extension told inside the first month), complaints acknowledged in 30 days (s.164A), India's 90; a checklist of every system searched, and what HQ already holds under the address (people, leads, list memberships, meetings, mail sent, tickets); erasure empties the CRM person and what hangs off them alone, keeps the address on the suppression list only, and needs an admin with a fresh code; an objection stops contact; the incident and breach register with the regulator's 72 hours from awareness, a recorded notifiability judgement, reasons when late, and each affected customer's contractual hours (DORA firms named), never closed with anything owed or without lessons; customer commitments with departures from the standard flagged; sub-processors with a notice to each customer's privacy contact (mailed, or recorded as sent by hand), objection windows, and no go-live while anyone is untold, the notice is running or an objection is open; a daily sweep reminding request holders and incident leads | privacy, request, incident, sub-processors, commitments, company privacy                                                                                                                         | service `b478903`; HQ: the commit adding this            |
| Pipeline inspection       | migration 0034: a forecast category on each deal (the stage's default — 80 % commit, 40 % best case — or a person's, without moving the stage), a push count each time the close date moves into a later month (saying when it crossed a quarter), the first close date, and when the next step last changed (a week unchanged shows the red clock); a nightly picture of every open deal, so 'what changed' compares each deal with itself 7, 14 or 30 days ago and gives one reason by rank (won, lost, new, pushed, pulled in, category moved, bigger, smaller, stage moved), saying that two ends cannot see a push and a pull inside the window; the quarter's forecast per currency (target, won, gap, open by category, coverage, the suggested call) with calls frozen with their deals and, for past quarters, accuracy, bias and the money missed beside the deals hit and missed; targets (owners and admins); competitors with battlecards (quick dismiss, why we win and lose, objections and answers), 'won 3 of 5' until ten deals, stale after 90 days unreviewed, on each deal with their strengths and weaknesses there; win/loss interviews with the buyer's reason beside the seller's and the drivers for and against                                                                                                                                                                 | what changed, forecast, competitors, battlecard, win/loss, a deal's Competition tab                                                                                                              | service `3b55f71`; HQ: the commit adding this            |
| Customer success          | migration 0035: signals per customer from the product accounts linked to the firm — nobody signing in (14 days), seats going unused (under half signed in within 30 days), renewal at risk (inside 90 days, marked at risk or not called), no contact, near the seat limit — each with its evidence, never a score, and a firm with no linked account says its usage cannot be read; feature requests with each firm's ask (their words, how much it matters, the deal it blocks), the open pipeline and MRR asking, and once shipped whom to tell (mailed with `mail:send`, or recorded as told); onboarding plans from a template with steps ticked and durations measured; a contract's notice period and a renewal playbook whose tasks are dated back from the notice date; `/success` (signals, requests, onboarding), the company Success tab, "Notice by" on renewals                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | success, feature requests, onboarding, company success, contract playbook                                                                                                                        | service `3b55f71`; HQ `5c899dc`                          |
| Status                    | migration 0036: components whose state is computed (the worst impact among open incidents naming them, else maintenance while a window runs), incidents with public updates (investigating → identified → monitoring → resolved; impact minor/major/critical from the worst component), maintenance that starts and ends itself, ninety-day bars of REPORTED incidents that say they are not measured uptime; subscribers by double opt-in (signed confirm and stop tokens, a honeypot, one confirm mail per address per hour, the same answer whoever asks), each update mailed to confirmed subscribers with a stop link; an incident lists the firms whose tickets arrived while it ran; the public `/status` page (no session, never names who posted) with `/status/confirm/[token]` and `/status/stop/[token]` acting only on a press; Desk → Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | service status, incident, public status                                                                                                                                                          | service `c7b5fad`; HQ `7fbbe41`                          |
| Security 3                | migration 0037: break-glass owner accounts (sealed; every sign-in critical and mailed to every other owner; a test is a recorded sign-in at least every 90 days, the nightly sweep says when one is due; never counted as the second person for dual control); just-in-time elevation (an owner makes someone eligible for a role above their own, never Owner; they take it for 1–24 h with a reason and a fresh code, owners mailed, every audit row while elevated carries the elevation, an elevation grants no roles or eligibility; the "Acting as" bar on every page); masked fields (personal email, emergency contact, one-to-one notes) revealed for a minute with a reason and a fresh code, listed on the record, never saved back, masked in the audit log; an export ledger with a 5,000-record daily quota an owner lifts for a day and a marker address per file that names it if it comes back; secrets pasted into support text removed before storage with an internal note; typed dates judged against the calendar somewhere, not UTC                                                                                                                                                                                                                                                                                                                                                 | Admin → Privileged access, My security → Elevation, team records, exports, the desk                                                                                                              | service `b1ee121`; HQ: the commit adding this            |
| AI assistance             | migration 0038: one provider behind one interface, the key only in service settings; without it every feature says it is not configured; an owner switch and a capability per feature, daily and monthly caps; outside text wrapped as data; answers checked before they are shown — reply drafts cite the saved replies and past answers they used, briefs take every figure from the records, tasks quote the meeting notes, triage and filters choose only from the lists offered; nothing the model writes is stored; each call a run row and an audit row, with whether it was used                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Admin → AI assistance, the desk (draft, filing), company/deal/meeting (brief me), meeting notes (tasks), leads/deals/companies (filter in plain words)                                           | service `c90131c`; HQ: the commit adding this            |
| Platform, part one        | migration 0039: stage rules (fields a deal needs to enter a stage — value, close date, seats, a contact — checked on a move AND on a create straight into the stage; no skipping, no moving back, each switchable per stage); validation rules an admin sets per field (filled in, not in the past, at least, one of, a pattern), enforced in every create and update handler, the website's intake exempt so a prospect is never lost; comment threads on companies, deals and leads (one level deep, resolve and reopen, mentions through the inbox, interns read-only); task templates applied from a record as ordinary dated tasks; outbound webhooks signed to the Standard Webhooks spec (a secret shown once, sealed at rest; the address checked against private networks at send time, no redirects followed; retries at 5 m, 30 m, 2 h, 5 h, 10 h, 10 h, switched off after three days failing; a test event)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Admin → Rules, Admin → Webhooks, Pipeline editor (Requirements, Order), company/deal/lead (comments, templates), Tasks → Templates                                                               | service `e72b9f0`; HQ: the commit adding this            |
| Trust registers           | migration 0040: what a security review, an auditor or an insurer asks for, with dates and owners and never a "% compliant" — risks (likelihood × impact, banded, a heat map; the band sets the review, a worse score brings it forward; accepting one is a decision with a reason, a critical one the owner's), findings (fix-by 7/30/90/180 days from the day found; fixed with evidence or accepted with a reason), production changes (a way back for medium and high risk; high risk waits for someone other than its recorder, and one that went ahead unapproved stays flagged), continuity tests (restore quarterly, failover twice a year, tabletop and loss of access yearly; missing the recovery target is not a pass; anything short of a pass raises a finding), supplier reviews (a tier per sub-processor sets the cadence; concerns raise a finding; a proposed one is reviewed before it goes live), the answer library (sales drafts, an admin approves for a year, new words lapse the approval, copy an approved answer), the record of processing (UK GDPR Art 30, the privacy desk's, reviewed yearly)                                                                                                                                                                                                                                                                               | Trust (Due, Risks, Findings, Changes, Continuity, Suppliers, Answers, Processing); the sub-processor record shows its tier                                                                       | service `78b045e`, `5f3dae1`; HQ: the commit adding this |
| Custom fields             | migration 0041: an admin's own fields on companies, people, deals and leads (Admin → Fields, a page per field): nine kinds, values normalised by kind; key and kind fixed once made, fields archived never deleted, a choice retired never removed; required when a person creates or edits (imports, conversions, intake exempt; a sensitive required field never blocks someone who cannot see it); sensitive fields shown and written only by owners and admins, masked elsewhere and in the audit log; checked before anything is written; a merge fills the kept record's blanks; changes in the record's audit row; a Fields section on each record, required fields in the create forms, custom fields in the Companies and Leads filters                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Admin → Fields; company, person, deal and lead pages; the create forms; Companies and Leads filters                                                                                              | service `b6133b4`, `d9b3322`; HQ: the commit adding this |
| Automations               | migration 0042: a trigger (created, a field changed to a value, a deal entering a stage, N days before a date, a button on the record), conditions (the list filters' tests), actions (a task, a field set, a notification, the automation.fired webhook); a draft never runs, publishing makes the next version and runs name theirs; it acts as its publisher (a button, as whoever pressed it) through the record's own checks, and fails rather than act as nobody; its own writes never start it again, nothing chains past depth 3, both written down as skipped_loop runs; five failures in a row pause it; date triggers from a nightly timer, once per record per date; a dry run on the last fifty records writes nothing                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Admin → Automations (the builder: When · If · Then; try; publish; pause, resume, archive); an Automations section on company, person, deal and lead pages (its buttons, what ran)                | service `50c7019`; HQ: the commit adding this            |
| Digests                   | migration 0043: a saved view mailed on a schedule (daily, or a weekday, at an hour UTC), paused or removed by its reader; the hourly worker asks the portal to render the view as its reader — the list's own filters and field readers, so a digest shows what the page would — through a ten-minute read-only token (`hqd_`, hashed, lists only: no writes, no record pages, no sudo), then sends it; an empty one is skipped unless asked for; each send an audit row with the rows it carried                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | My digests (add, pause, remove, send me one now); "Mail me a view" beside saved views on Companies, Leads and Deals                                                                              | service `4124222`; HQ: the commit adding this            |
| Finance, part two         | migration 0044: cash per account with the day each balance was true, and runway per currency (cash ÷ net burn over the trailing three months; refused, with the reason, when an account has no balance or one older than 35 days; "cash-flow positive" when burn is nil, never infinity; never added across currencies); vendors with their monthly cost and cancel-by date (an annual term within 30 days of its notice date is flagged; a monthly one never is); expense claims decided by someone other than the claimant (a rejection says why; paid is recorded); investor updates written over a snapshot frozen when started (MRR and what moved it, customers, pipeline, cash and runway, headcount), one per month, finalising keeps it as sent                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Business → Finance (cash and runway, vendors, investor updates); Work → Expenses; "Copy as text" on an update                                                                                    | service `e4555ac`; HQ: the commit adding this            |
| Quotes and action plans   | migration 0045: quotes on a deal — lines from the price list (each keeps the list price it was priced at; the quote says when the list has moved) or written in, a term and a validity date, Q-YYYY-NNNN, one primary per deal; approval by the deepest discount on any line, measured unrounded: up to 10 % the author sends it, above that (or a monthly price off the list) a second person who works deals, above 25 % an owner or admin, never the author or the asker; approvers asked in their inbox; changing a price, quantity, term, terms or validity cancels an approval; a sent quote past its date is expired and revised, not signed; signing is recorded (who, when, where the copy is), makes it the deal's quote, withdraws the others and gives an open deal the signed monthly value; the mutual action plan: steps on both sides with dates, read against the close date, the usual plan laid in from it                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Deals → Quotes (waiting on you, open, yours, all); a deal's Quotes and Action plan tabs; the quote page (the order form, print to PDF, a lines editor that previews the approval, the next acts) | service `6df204a`; HQ: the commit adding this            |
| References and reviews    | migration 0046: references are consent written down — what the firm agreed to (calls, its logo, being quoted, a case study), who, where the yes is kept and until when (a year unless said otherwise); a use outside it, after it ran out or once withdrawn is refused; calls rationed per quarter (two unless set), least-asked first; every use against the deal it helped; withdrawing a public use makes a task to take it down within a week. Business reviews freeze a period's figures for one firm (seats paid and signed in, what it pays and what moved it, tickets with the median and slowest first reply, asks and what shipped, renewal, onboarding) with goals, wins, risks, actions and attendees written over them; finalising keeps it as held; money only for revenue readers                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Customer success → References; a reference page (use, renew, withdraw, edit); Business reviews and References on a firm's Success tab; a review page with Copy as text                           | service `ee7383f`; HQ: the commit adding this            |
| Changelog and help centre | migration 0047: changelog entries (new, improved, fixed) link the feature requests they answer; publishing marks those shipped on its date and leaves telling the askers to the request (the entry counts who is not yet told); published entries are public at /changelog without the requests; taking one down needs a reason. The help centre: the desk's articles with an owner, a category, tags that match ticket tags and a review every 180 days (rewriting or re-reading restarts it); tickets link the article that answered them; the gap list is tickets resolved in 90 days that no article answered, by tag                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Customer success → Changelog and an entry page; public /changelog; Desk → Help centre (articles, gaps, an article page); Answered with on each ticket                                            | service `a7718d1`; HQ: the commit adding this            |
| Control map               | migration 0048: controls (a reference like AC-1, an owner, a cadence, the framework clauses they answer, links to the trust registers that show them working) with dated evidence; an operating control whose newest evidence is older than its cadence is due; counts, never a percentage. An auditor's link needs a fresh second factor and a reason, lasts 1 to 30 days, is shown once and kept as a hash, revocable; its anonymous page shows operating controls, their evidence and links without who collected what, counts every view, and answers an unknown, expired or revoked token alike                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Trust → Controls (the map, auditor links behind the sudo gate) and a control page; the auditor's /audit/[token]                                                                                  | service `ea957a2`; HQ: the commit adding this            |
| Trust centre              | migration 0049: sections the owners publish, each with the day last reviewed; active sub-processors from the register (service, purpose, locations only); documents on request with NDA-first; requests throttled, a honeypot, answered alike, decided with a note and recorded as sent by a person; erasure empties a person's requests. No badge, no percentage, no invented contact address                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | public /trust-centre with its request form; Trust → Trust centre (requests, sections, documents)                                                                                                 | service `af7c7ae`; HQ: the commit adding this            |
| Finance, part three       | migration 0050: revenue earned from the invoice register by day of each service period (the last month takes the rounding), per currency — invoiced, earned and the month-end balance, negative when billed in arrears — and the invoices still being earned; purchase requests decided by someone other than the requester, a recurring one joining the vendor register when bought; budget lines with actuals typed from the accounting system and their source (refused without one), over by a tenth flagged for costs and under for revenue, the register's earned revenue shown beside to check against                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Business → Finance → Revenue earned, Budget; Work → Expenses → Purchase requests                                                                                                                 | service `0e2ef22`; HQ: the commit adding this            |
| Hiring                    | migration 0051: openings with a hiring manager, public at public/careers; applicants from the careers form (throttled, a honeypot, answered alike, a repeat folded in) or by hand; applied → screen → interview → task → offer → hired, rejected (a reason from a fixed list) or withdrawn, an ended one reopening only where it ended; HR names interviewers, who (any role) are told, see their interviews, read that applicant and write one scorecard per stage, blind until their own is in; six months after a decision the details are emptied unless the applicant agreed to longer; erasure reaches applications                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Team → Hiring (roles, a role page, an applicant page); Work → Interviews; public /careers with an application form per role                                                                      | service `bbb4c7d`; HQ: the commit adding this            |

### 2026-10-01 — documents: print, export, the company's particulars

- **Company** (System → Company, everyone reads, an admin edits after a fresh code): the
  legal form, registered name, CIN/LLPIN, PAN, GSTIN, Udyam, DPIIT, registered office,
  contacts and who signs order forms, in the settings store (`company.*`, no migration).
  The service checks shapes and cross-checks (CIN year and class against the form and the
  incorporation date, a PAN's fourth letter, the PAN inside a GSTIN and its Luhn mod 36
  character) and refuses only a problem the change makes. It returns the letterhead every
  document prints and the law's list for the form: Companies Act 2013 s.12(3)(c) (name,
  registered office, CIN, telephone, e-mail, website if any; a former name for two years;
  "(One Person Company)"), s.4(1)(a) for the suffix, LLP Act 2008 s.21 and s.15. The demo
  seeds only public facts (site, contact address, Jammu, who signs) — never a number.
- **Print** (top bar, every page; Print beside Export on lists): the print style forces
  paper colours, drops the frame and every control but keeps every value, puts the
  letterhead and "Printed by … on …" over page one, and the particulars and "Page N of M" in
  the margin boxes (Chrome 131+). A quote prints as the customer's document: letterhead,
  order form, both signature blocks (the company's signatory named), nothing else. A
  repeated top-margin note was tried and dropped: Chrome ignores a named page's override.
- **Export** (lists: companies, people, leads, deals, contracts, quotes, receivables,
  tasks, meetings, the support queue, vendors, expenses, controls; and Reports): CSV (the
  service's, formula-neutralised, with a byte-order mark), Excel (`src/lib/documents/xlsx.ts`,
  a stored zip written here: typed cells, frozen header, filter, an "About this file"
  sheet) or PDF (`pdf.ts`, pdf-lib + fontkit, the brand faces cut to Latin in
  `assets/pdf-fonts`, traced into `/exports` by `next.config.ts`: letterhead, wrapped never
  truncated cells, record-ID columns left to the CSV/Excel, every page footed and
  numbered). One door: `POST /exports` (same origin, session, `crm:export`, a safe return
  path) → `hq/exports/{kind}` (fresh code, reason, quota, marker row, audit row with the
  format). The service returns typed `columns` and `table`; the portal lays out the file.
  Applicants and staff records are deliberately not exportable: a file escapes the
  six-month erasure.
- **The brand** (same day): the top of the rail, the phone bar, sign-in, not-found and every
  public page show the wordmark "quantify terminal." alone (`src/components/brand/wordmark.tsx`,
  Poppins, preloaded); no Q symbol and no "QUANTIFY HQ" anywhere, on screen or on documents.
  Tab titles end "| Quantify Terminal HQ"; the authenticator issuer, the passkey name and
  the staff mails say "Quantify Terminal HQ" (service `0985717`). A collapsed rail shows no
  brand. The unused `public/brand/mark-*.png` files are left in place.
- Service `6503188`; HQ: the commit adding this. Harness 23 adds the Company page, the
  export menu, one real file per format checked by its first bytes, and two pages printed.

### 2026-10-01 — Product: the console's administration, moved here

- The console carried the product's administration; it now lives in HQ's **Product** rail
  group and the console is the customer's own account only. Overview, Accounts (and each
  account), Subscriptions, Notices, Product email, Releases, Reports, Product audit,
  Configuration, Provider keys, Credentials, Product roles, Product staff — the console's
  own screens, ported (`src/app/(portal)/product`, `src/components/product`,
  `src/lib/product`). Support is not among them: HQ has its own desk.
- **Two keys.** HQ decides who may enter (`product:access`: Owner, Admin, Support; a fresh
  code for every change, offered at the top of each screen). The product decides what they
  may do: every `hq/product/<rest>` route runs the Account API's own `admin/<rest>` handler
  as the staff member's **linked Quantify Terminal account**, by that account's product
  role. A link never widens anyone's reach; the product's audit names the account, HQ's
  audit adds who acted through it (`product.<route>`, `as_account`).
- **The link.** Only an Owner, with a fresh code, on the staff record ("Quantify Terminal
  account"), and only to an account that already holds a staff role in the product; one
  account per staff member; an empty address unlinks. Until then Product says why and
  shows nothing.
- **Transport.** `src/lib/product/account-api.ts` keeps the console's schemas and calls;
  only its transport changed (`admin/*` → `hq/product/*` through `fetchHqJson`/`postHqJson`,
  HQ's errors translated to the console's so every screen keeps its messages). Releases
  still go straight to the deploy function, which now accepts an `hq_` token
  (`hq/product/whoami`; a publish needs an Owner and a fresh code). Set
  `QT_UPDATE_DEPLOY_URL` on the HQ project for Releases. Locally the HQ mock serves the
  function's two routes itself (`/api/release_history`, `/api/deploy_update`; §7,
  2026-11-05), so the screen works on a laptop too.
- The mock forwards Product routes to the console's mock (`HQ_PRODUCT_MOCK_URL`, default
  `http://127.0.0.1:7072/api/v1`), signed in as the linked persona; run it from the console
  repo with `MOCK_PORT=7072 npm run mock:api`. `tests/lib/product-bridge.test.ts` holds the
  client, mock and service `BRIDGED` lists to one another; the console's plan catalogue,
  role label, CSV and release client tests moved here with the code.
- HQ's `.board` is the deals board (columns), so the console's stacked layout is
  `.stack-board` here; the provider-key table takes the full width under 1500px.
- Service `e8efead` (0052 `hq_staff.account_user_id`, the bridge, the deploy function) and
  `f79dfaf`; HQ: the commit adding this; the console: the commit removing its
  administration.

### 2026-10-03 — Prospects (`docs/RESEARCH-2026-10-03-LEADS.md`)

A lead was someone who wrote in. A prospect is someone the team found on a public page,
and there are tens of thousands of them: both are leads and share the table (`origin`), a
prospect never starts the first-reply clock, and the list of them is read a page at a time.
Three researchers (lead databases and segmentation; cold outbound and deliverability; the
company console) reported first; the file keeps all three with their sources.

| Wave              | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Where                                                                                                                                                                      | Commits                                                   |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| Prospects         | migration 0054: the columns a researched list carries (title, firm type, country, city, website, registration number, where the address was published, kind of address, tags, notes, what a verification said) and `hq_lead_imports`; import in parts, every row accounted for (added, filled in, already here, or left out with the reason — no address, malformed, repeated in the file, already a CRM person, on the stop list), the whole file de-duplicated in the browser first; an import taken back out with a fresh code (its untouched rows only); `hq/leads` filtered, ordered and paged on the server with a breakdown of whatever the filters kept (firm type, region, country, kind of address, fit, stage, verification, tag); fit as points from rules an admin owns, computed when a lead is read, with its reasons; one change across everything a view matches, audited once; segments ask a lead what the list asks it (one grammar, with "is any of"), and the service suggests segments from the data; a view saved as a segment and taken straight to a new campaign; the send path reads what a verification said, a send moves a new prospect to Attempting, conversion carries the prospect's columns and takes the firm's domain from its website. Found on the way: every signed-in POST was read under a 16 KB limit, so a real import or a long template was refused (see the ground rule)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Leads → Inbound · Prospects · Segments · Import · Fit rules; the lead record (details edited in place, the fit and its reasons, where the lead came from); Mail → Segments | service `54f10c5`; HQ `5e721dd`                           |
| Cold mail         | migration 0055 (`verified_detail`): what must be true before the team writes first to a prospect — only an address a verification called valid and recently (the stale window a setting), risky addresses out unless allowed, shared-looking mailboxes out, one person per firm (the best fit; colleagues named as FIRM_COVERED), a rule per country (`opt_out` / `consent` / `hold`) with the research's cautious reading as the default and every undecided country held, a country's subject label (<ADV>) joined to the subject once; a verifier's file applied to the leads it names (every row accounted for: updated, the same again, not a lead here, a word nobody knows), the vocabulary served to the page so a file's words are shown sorted before any is sent; a whole firm stopped as a `*@domain` stop-list row that cancels its queue and ends its sequences; "the first N, best fit first" on a segment audience (the preview says what the cap took, what it left for later and what could not be written to); the prospects export as the view on screen (its filters travel with the request); an import rehearsed (`dry_run`) and columns a file may replace (`overwrite`); send counts and the last send on every lead; `nhas` and `nin`. In the portal: Leads → Sending rules (what one send would take, what holds the rest with a view for each reason, the checks and the stale window, country by country with change / put back, all behind a fresh code and a reason); the verifier importer and "Try it first" on Import, with a download of the rows left out; "Send to at most" on the campaign form; "Stop a whole firm" on the stop list, reached from a prospect's record with its domain filled in; "Export this view" on Prospects with the person's real remaining allowance; the lead record says what the verifier said, the firm's domain and how often it was written to. Found on the way: the campaign, sequence and list pickers loaded every lead as an option (tens of thousands once the real file is in) — they offer inbound leads now; the global search and the digest's saved views read the whole lead table too                                                                                        | Leads → Sending rules · Import · Prospects; the lead record; Mail → Campaigns (the cap, the capped preview) · Stop list                                                    | service `1a9d17c` + `470125c`; HQ `30e7d1c`               |
| Send programme    | migration 0056: a sequence FED from a segment (`mail_feeds.py`) — a standing rule that takes up to a daily cap each day, best fit first, under the cold-mail rules and the sequence's own (the same verdicts the Enrol tab shows), enrols the ones allowed and writes one audit row for the day with what it held and why; never twice, waits while sending is off or the sequence is paused, judges at most eight times its cap a day, ends by hand or with the sequence; the take rides the worker's pass. A capped send of a segment has a NEXT SLICE (`campaigns/{id}/continue`): a new draft on the same segment, sender, template and cap, "… · part N", that leaves out everyone an earlier slice reached or is about to (HAD_EARLIER_SEND); the chain stops at a loop or a missing link. RESULTS BY FACET (`campaigns/{id}/breakdown?by=`) for lead recipients: firm type, country, region, fit, kind of address, the file, stage, verification. The ledger answers the grammar: `bounced`, `clicked`, `campaign` (was sent campaign X, by name) — one statistics query, seeds out. Each imported file's health (written to, bounced, clicked, stopped). Portal: Sequence → Daily feed tab (the feeds, a check of today's take before starting, pause / resume / change the cap / end); Campaign → "Part of a series", "Send the next slice", Results by (a facet strip); Import → "Since then"                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Mail → Sequences (Daily feed) · Campaigns; Leads → Import; every lead filter and segment                                                                                   | service `1015aaf`; HQ `ce028d8`                           |
| Mailboxes         | migration 0057: a CONNECTED MAILBOX is a sender of kind `mailbox` plus an `hq_mailboxes` row — a person's own Workspace, 365 or other mailbox, signed in by its host's consent screen (`mailbox_oauth.py`: Google with `https://mail.google.com/`, Microsoft with SMTP.Send + IMAP + offline_access, rotated refresh tokens kept) or by server and app password, the credential sealed (AES-GCM, bound to the mailbox) and never returned; sends go over the mailbox's own SMTP (`mailbox_transport.py`: STARTTLS 587 or TLS 465, XOAUTH2 or LOGIN, the server's refusal classified as address / block / quota / sign-in / temporary). A prospect is written to ONLY from a mailbox of the person who enrols them (balanced by load; NO_MAILBOX otherwise) and the whole sequence keeps to it; campaigns leave prospects out (PROSPECT_BY_PROVIDER) unless an admin switches it on with a reason, re-checked at send time. A person's pace, not a bulk sender's: nothing before `ready_on` (21 days by default; HQ sends no warm-up mail; an admin may declare one warm), then a climb from 10 by 2 a day to the cap (30, 50 at most), sends 12 minutes apart plus up to 6 at random, ceilings per domain (150) and for the pool (500, 1,000 at most). A block rests a mailbox two days, the host's daily limit until tomorrow, a refused sign-in pauses it; each holds its queued mail and mails its owner; a bounced address goes to the stop list. A feed's take is held to the room its owner's mailboxes have today and says how many working days the segment would take to drain. Portal: Mail → Mailboxes (connect by typing the address: the domain's MX records pick the consent screen or bring the server form back filled in, Zoho's servers known; the pool, by domain, pace / warm / pause / check / disconnect, the ceilings); Sending rules → where first emails go from, and the switch; the enrol check names the mailbox; the feed check says the room and the drain. Found on the way: a mailbox server that answered nothing was kept although nothing had signed in; a customer segment's drain was paced by the mailboxes it never uses; the sender schema refused the new kind, which would have broken every page that lists senders | Mail → Mailboxes · Sequences (Enrol, Daily feed); Leads → Sending rules; Mail → Settings (mailboxes left out)                                                              | service `10dca9c` + `f8d24ee`; HQ `9fd465e`               |
| Replies           | migration 0058: REPLIES READ BACK from the connected mailboxes (`mail_replies.py`, `mailbox_inbox.py`). Each mailbox's INBOX is read over IMAP (XOAUTH2 or the app password; read-only, every fetch a PEEK) every five minutes and again right before any follow-up; a first read looks back only to the day the mailbox was connected, then counts on from the server's UIDNEXT. A message is kept only if it answers a send of ours — by `In-Reply-To` / `References` (each mailbox send carries `<message id@domain>`), or by who is in a live sequence from that mailbox — and only then is its body fetched; the rest of the inbox is never read past its headers and nothing of it is stored. On its own HQ pauses a person's follow-ups when they reply and their colleagues' at the firm (the firm is the company record, or for a prospect the address's own domain, never free mail), moves the lead to connected, honours a plain "remove me" from the person written to (a colleague's words only pause), pauses an out-of-office until a working day after the date it names (fourteen days if none; the return date read in five languages), and stops an address a bounce notice names — only if it is the address we wrote to. Everything else is a suggestion: the words propose an outcome and the phrase that proposed it; a person records it (or "nothing to record", or carries on), which does what recording it by hand always did, also after the sequence ended. A follow-up never goes blind: it waits while its mailbox's inbox is unread for thirty minutes, and an inbox that refuses its sign-in stops the mailbox. Replies read for a lead are forgotten with the lead. "Waiting for your word" no longer asks about anyone written to from a mailbox HQ reads. Portal: Mail → Replies (what came back, what HQ did, what it reads as, one press to record; settled in the last fortnight); Mailboxes (replies read when, waiting count, "Read replies")                                                                                                                                                                                                                                                                       | Mail → Replies · Mailboxes; Home and the mail overview (replies to record)                                                                                                 | service `138b633`; HQ `ee4054f`                           |
| Lead jobs         | migration 0059: a change to a whole view of more than 300 leads runs in the background (`lead_jobs.py`) — the ids the view matched when asked, worked a slice at a time (the first in the request, the rest on the worker's passes and whenever someone reads its progress) under a lease taken in one atomic statement; each lead's change is the one function a single edit uses, so working a lead twice is harmless; a failed slice says why and is retried; whoever asked, or an admin, can stop it where it is. Found on the way: the inline loop over 23,000 leads would have outrun the platform's response limit part-way, with nobody told where it stopped                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Leads → Prospects (a banner with the progress, kept current, and a stop)                                                                                                   | service `bb87e70`; HQ: the commit adding this             |
| Domain health     | migration 0060: every refusal that matters is kept (`hq_mailbox_events`: block, the host's daily limit, refused sign-in, a dead address said at send or by a bounce notice), and two mailboxes on one domain blocked within two days rest every mailbox on it, once. The portal reads each sending domain's SPF, DKIM, DMARC and MX from DNS (`src/lib/mail/domain-records.ts`, Node's resolver, cached ten minutes, its table streamed so the page never waits) and judges them against the hosts its mailboxes sign in at — the include each host's guide asks for (or a `redirect=`), the host's DKIM selector (or the common ones), a DMARC policy with reports, mail servers for replies — beside its last thirty days (sent, bounced and the rate against 2%, blocked and when). A domain not in DNS at all says so once                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Mail → Mailboxes (Sending domains)                                                                                                                                         | service `0c4ae63`; HQ: the commit adding this             |
| Referrals         | a "wrong person" or out-of-office reply offers whoever it names instead (each address in the words, never the sender's own or one of ours, with the name before it; capitalised verbs are not a name) and what the CRM already holds for them; one press adds them as a prospect, which the cold rules then judge                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | Mail → Replies                                                                                                                                                             | service `4b3bded`; HQ: the commit adding this             |
| Data quality      | migration 0061: LOOK-ALIKE LEADS joined into groups (`data_quality.py`) — the same address, the same mailbox once dots and a plus-tag are out, the same name at the same firm (web domain, or name without legal suffixes) — and a lead the CRM already holds as a person, grouped with that person and listed first; a MERGE keeps one lead (address, verification, history) and takes each other field from the record a person picks, joins tags, appends notes with where they came from, takes the furthest stage, moves activities and tasks, and leaves the others as disqualified duplicates naming it (so the same file brought in again finds their addresses); someone who wrote in and is still owed a reply is never folded into a prospect or marked away; "not the same" remembered by a group's exact records for leads, companies and people, until another look-alike joins (and taken back); ONE SPELLING — names in capitals or all lower case, and "IN" / "india" / "U.K." as the country the table names — when a file comes in and, after a preview, in bulk (the background path past 300); the region and the sending rules read the codes too. A DATA HEALTH page (`data_health.py`): one count per thing worth putting right, each with its list (Prospects or Companies filtered to it, a duplicate review) or a few of its records, and a row a day so each says what it was a week and a month ago. Found on the way: an Indian prospect whose file said "IN" was held by the sending rules as a country nobody had decided                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Leads → Duplicates (and Choose what stays); CRM → Data health (and Put right); Companies → Duplicates (Not the same); the lead record (what it was folded into)            | service `ba1a085` + `8de47c5`; HQ: the commit adding this |
| Weekly review     | migration 0062 (`review.py`, `review_routes.py`): the figures the service can count for any stretch — leads who wrote in and the median first reply, leads qualified, demos held, no-shows, deals opened and won, the weighted pipeline, new, lost and net new MRR, MRR, the desk's tickets — each counted for the week under review, the six weeks before it and the twelve months up to it, never typed; a SCORECARD of them (owner, goal, at least or at most; an admin's), only a complete week judged met or missed, one comment a week on each; THREE PRIORITIES a quarter, each with an owner and a weekly health (on track / at risk / off track, with a line unless on track) given for the week under review, asked for in the Inbox from Wednesday and again on Friday, closed done or dropped; an ACTION is a task carrying the figure or priority it came from, on its owner's list and back at the next review until done; the WEEK'S NOTE (the primary figure against its goal, the rest, what went well and badly, each priority's health — the same shape every week) to the roles that read the weekly pack, sent by an admin or on its own on a chosen morning (UTC) by the hourly pass. A week belongs to its Thursday's quarter; a review whose week fell in another quarter links to this quarter's priorities                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Business → Weekly review (and "Review the week" on the weekly report); a task says where it came from                                                                      | service `a85aed9` + `a3cf2f3`; HQ: the commit adding this |
| Triage, nurture   | migration 0063 (`nurture.py`): a lead still being worked set aside until a day (within two years) with a line — off the working lists (their "nurturing" field), its sequences paused to the day, a first email to a prospect held (NURTURED) — and back on its day, unread for whoever set it aside, its sequences carrying on; brought back early by hand; a whole view set aside or brought back at once. TRIAGE takes the new leads who wrote in, one at a time, the longest wait first: `1` take it, `2` its look-alikes (the duplicates review for that lead), `3` disqualify with a reason, `h` set it aside with a date and a line, `j` skip — each key printed on its button                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | Leads → Triage; Leads → Inbound (Set aside, with its count); the lead record (Set it aside / Bring it back now); Prospects (whole-view set aside)                          | service `b7fc52f` + `3cf3dbb`; HQ: the commit adding this |
| Attribution       | `attribution.py`: every lead who wrote in read two ways into one set of channels — their own answer to "how did you hear about us?" (the intake kept it already; the website's early-access form now asks, committed in the website repo and not yet deployed) and the visit's campaign tags or the page that sent it. A word is matched as a word ("event" is not in "prevent"), an answer naming nothing known is "something else", a visit with neither tags nor referrer "came straight to the site". `hq/reports/attribution?days=` (revenue:read, 1–730): what was said against what was seen; each channel — what it said, else its visit — followed to qualified, a meeting held, a deal and won, the money per currency and never across; the same chain per form with what its people said; the counts by the month a lead came in. Prospects are not counted. Found on the way: the weekly report's tables set figures in tabular digits but not to the right, under right-aligned headings                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Business → Lead sources; the lead record (how they heard of us, what their visit showed)                                                                                   | service `85603de` + `706c2b5`; HQ `9be18e6`               |
| Priority inbox    | migration 0064: the inbox split into Priority (by default a security event, a first reply running late, anything waiting on the person — approvals included — and mentions) and Other; each person's own rule, the default back on request, kept when only their mail settings change; "Mail me for Priority alone"; Home lists Priority first and links to it. FIRST REPLY RUNNING LATE: a lead who wrote in and has waited three quarters of the hour goes once on its owner's inbox — with no owner, on everyone who works leads — from the worker's pass (a new lead brings its next look forward), a read of the inbox or of Home; the wait in minutes, hours or days. Found on the way: React resets a form once its action succeeds, and a controlled choice then showed what the server first drew ("One digest a day" saved, "Mail me what stays unread" shown); both forms now send from onSubmit (`submit-without-reset.ts`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | Inbox (Both · Priority · Other; Your Priority); My notifications (Your Priority; the new mail choice); Home                                                                | service `06f489d` + `55a332f`; HQ `10177f0`               |
| Sequence branches | migration 0065: a sequence leads on, per answer, to another — a reply recorded as interested, not now or a meeting booked enrols the person there as the conversation's owner, judged by every rule a hand enrolment is except "emailed in the last two weeks"; a "no", a stop or a bounce never; never to itself, to an archived sequence, or back the way it came on the same answer; a refusal said in words and never a reason the answer is not kept, also for an answer recorded after the sequence ended. Each enrolment names where it came from and, once an answer ends it, where it went on to (the answer ends the row it was recorded on, so the ended list is where that shows). Automations: "Enrol in a sequence" for people and leads, as the publisher, a rule's refusal written on the run as an answer and not a failure                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | Mail → a sequence (Steps: When they answer, lead on to; People: from …; Finished: went on to …); Admin → Automations (the enrol action)                                    | service `386c360` + `40ab298`; HQ: the commit adding this |
| Target accounts   | migration 0066 (`targets.py`): a company made a target account with a tier (1 the most wanted, 3 the least) and a short plan — why it matters, who there to reach (its own people, a dozen at most), the next step and its day. `hq/targets`: the most wanted first and, within a tier, the longest untouched first; narrowed by tier, owner and untouched. A touch is anything the firm could notice — a note or call on it or its people, a person marked contacted, a mail sent to one of them, a meeting held, a deal moved — never a page view, and never touched counts as untouched. On Monday morning the owner of each target nobody has touched in fourteen days hears in the inbox (whoever made it a target, when the firm has no owner), once a week                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | CRM → Target accounts; the company page (Target account: make it one, change the plan, take it off)                                                                        | service `3a67fb4`; HQ `c229b51`                           |
| Signs of interest | migration 0067 (`prospect_signals.py`): first-party signs on the firms being worked, read from what HQ and the product already hold — a product account made with a lead's own address or at a firm being worked (free mail names no firm), a click through from our mail (seed inboxes left out), someone writing in from a firm whose people are being written to as prospects, product use at a prospect or early-access firm with linked accounts. Each is kept once per kind, record and evidence; its owner hears under a new inbox reason, "Sign of interest" (in Other unless added to their Priority); a person closes it — acted on with a line, or dismissed — and a closed sign never reopens. Swept on the hourly pass and on a read more than a quarter of an hour after the last                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                | CRM → Leads → Signs of interest; the lead and company pages (their open signs)                                                                                             | service `86b8a5c`; HQ `f51a7d5`                           |
| Web push          | migration 0068 (`web_push.py`, `push_routes.py`): HQ installs as an app (a manifest; the Quantify symbol, as the console and the website use; a service worker that only shows notices and opens HQ's own pages, caching nothing; the unread count on the installed icon). Push is turned on per device and registered only at the browsers' push services; rows in a person's Priority reach their devices outside their quiet hours; a test says what each push service answered; a device its push service calls gone is removed. VAPID and the RFC 8291 payload are written on the pinned `cryptography` package and checked against the RFC's worked example. The keys come once from `scripts/hq_vapid_keys.py` as `QT_HQ_VAPID_*`; without them push is off and says so                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | My notifications (Push to your devices); the installed app                                                                                                                 | service `d4fc421`; HQ: the commit adding this             |

### 2026-10-03 — Table stakes (`docs/RESEARCH-2026-10-03-TABLESTAKES.md`, fifth research pass)

What every serious tool ships as standard, from four researchers across about twenty
products and a fifth reading HQ itself; §2 of that file is the gap list (HAS / WEAK /
LACKS against the market's rating) and §3 the order below.

| Wave                            | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Where                                                                                                                                                                                                                                                             |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Exports of a view               | An export can be the view on screen: the portal sends the ids its page shows, in its order, read in the export route with the same code that draws the page (`src/lib/lists/views.ts`, shared by Companies, People, Leads, Deals); an id narrows a file and never widens it. Columns: every one, or a chosen few from the kind's own list (`GET hq/exports/{kind}/columns`), which now carries the custom fields the role can read, typed as the field is. On a phone a page-bar popover spans the bar (it opened past the left edge).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | service `export_routes.py`; portal `export-menu.tsx`, `exports/route.ts`, `lists/views.ts`                                                                                                                                                                        |
| A person's data, as a file      | Privacy → an open access or portability request (identity settled, after a fresh code) → one zip of everything HQ holds under the address, as JSON and a CSV per section with a README: the contact record, how they came to us (with the page a prospect's address was published on), notes and comments the team wrote (included and marked internal: withholding one under an exemption is a person's decision, recorded on the request), mail sent and received, preferences and suppressions, mailing lists, meetings, support conversations, job applications, documents asked for, privacy requests. A sensitive field the maker's role cannot read is named as left out for an admin to add. Written on the request's timeline and in the ledger before the records leave.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | service `privacy_package.py`, `privacy_routes.handle_request_package`; portal `privacy/requests/[requestId]/package/route.ts`, `documents/privacy-zip.ts`                                                                                                         |
| Archive and put back            | A company or person leaves every list with a reason and comes back whole from Archived (companies and people, each with who, when and why); an active customer, open deals or subsidiaries keep a company on the lists and the refusal says which; archiving a person ends their sequences (`ARCHIVED`); a merged record stays merged; one whose domain or address another record took since stays archived and says so; adding an archived record's domain or address again says to put it back. An archived record opens with a banner naming the day.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | service `archive_routes.py`, `crm_routes.py`; portal `archive/page.tsx`, `crm/archive-forms.tsx`, `crm/archived-banner.tsx`                                                                                                                                       |
| Share                           | Share on every record header (companies, people, leads, deals, quotes): Copy link, and send to colleagues with a line — it lands in their inbox as "Shared with you" (Priority unless they say otherwise) and reaches their phone like any Priority row. Nobody is sent what their role cannot read: the refusal names them. Migration 0070 adds the reason, and fixes the notifications constraint, which refused the `signal` reason 0067 writes.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | service `share_routes.py`, 0070; portal `crm/share-menu.tsx`, `ui/copy-link.tsx`, `_actions/share.ts`                                                                                                                                                             |
| Quote links                     | A sent, valid quote gets a link its customer opens at `/q/<token>` without a session: the order form with prices (never list prices, discounts or approvals), accept with name, address and "I agree", or decline with a reason. Accepting signs the quote as a recorded signature does — the deal's quote, the others withdrawn — with the link, the moment and the document's SHA-256 in the signed copy. One answer per link; the first view and the answer reach whoever made it; an unknown, revoked or expired token is the same 404; answers throttled per address. The token is shown once and only its hash kept; never past the quote's own date.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | service `quote_link_routes.py`, `quote_routes.py`; portal `deals/quote-links.tsx`, `deals/quote-answer.tsx`, `app/q/[token]`                                                                                                                                      |
| Outside links                   | Admin → Outside links: every link that lets someone outside HQ read something inside it — auditor views of the control map and customer quote links — who made it, when it ends, how often it was opened, where it is revoked. Live first, then the last ninety days.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | service `share_routes.handle_external_links`; portal `admin/links/page.tsx`                                                                                                                                                                                       |
| Imports of companies and people | Migration 0071 (`record_imports.py`): CRM → Companies → Import and People → Import to the leads' standard. A file in parts under one run is one line in a ledger; every row accounted for (added, filled in, already here, left out with the reason), first as a rehearsal that writes nothing. Matched by the record's ID (an HQ export comes back in), then by domain or address; a company with no domain sharing only a name is a look-alike, left out; an archived match is left out. "Fill in" fills blanks, only ticked columns are replaced, an empty cell never wipes, names/domains/addresses never change, a "do not contact" is always honoured and never removed. A company's owner by the colleague's address, else the default chosen; the answer names unknown owners and firms. Custom fields typed as the field is (a choice by its label too). The rows left out download as the file's own columns with the reason last. Taking a file back (fresh code, reason) removes what nobody has edited, archived, linked to or written about since and puts back each field still holding the file's value; the rest stays, counted. A record names the file it came in with. Automations do not run on imported rows; validation rules and required fields do not apply (bulk writes never have).                                                                                                                                                                                                                                                                                                                                                                                                                | service `record_imports.py`, 0071; portal `crm/record-import.tsx`, `crm/record-import-history.tsx`, `lib/crm/record-import-actions.ts`                                                                                                                            |
| Find and create                 | `hq/search` (`search_routes.py`): one search across companies, people, leads, deals, tickets, meetings, tasks, notes and calls, contracts, invoices, quotes and help articles — each kind only for a role whose own list reads it; ranked whole field, start, word start, anywhere, a title over a note, archived last and marked; every word of a several-word search must appear; at most 200 matches a kind ("200+"); notes and leads searched in SQL, not by reading the table; a list of matches opens no record. `hq/me/recent`: the person's own read log (90 days), one row a record, only what their role can still open. Portal: ⌘K searches everything with "See all results" to `/search` (kinds with counts, one kind up to 50, the query marked in titles and notes); before typing it shows Recently viewed and Create (New company, person, lead, Log a meeting, New task — each opens its page's form via `?new=1`); favourites kept with the account (preference `hq-favourites`); single-key shortcuts switchable off in the sheet or from ⌘K (`hq-single-keys`, WCAG 2.1.4), ⌘K always works.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | service `search_routes.py`; portal `search/page.tsx`, `shell/command-palette.tsx`, `lib/prefs/single-keys.ts`, `shell/favourites.tsx`                                                                                                                             |
| Handover                        | `handover.py` (`hq/staff/{id}/handover`, `…/handover/run`, Owner/Admin with a fresh code): what a person is answerable for, by area — companies, leads, open deals and plan steps, running sequences, open tasks and support conversations, help articles, open feature requests and onboardings, open privacy requests and incidents they lead, risks, open findings, controls, questionnaire answers, records of processing, their direct reports, openings and interviews, vendors, scorecard measures and priorities. One act moves it to one colleague: only work in hand (a closed deal keeps who won it), each kind only to a role that works on it (the rest named and left for someone else), a sequence on the leaver's own identity carries on from the colleague's or ends `OWNER_LEFT` (never writes from the leaver's mailbox). One audit row, the colleague told once, the offboarding run's new step "Work handed over to a colleague" ticked with what moved. The page says the last handover after its form has gone.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | service `handover.py`, gateway `count_owned`/`reassign_owned`; portal `team/handover-section.tsx`, `team/[staffId]`                                                                                                                                               |
| Recurring tasks and reminders   | Migration 0072 (`recurrence.py`): a task can repeat — every day, weekday, week, two weeks, month, quarter or year, until a last day or for ever. Done makes the next one (same title, notes, priority, assignee and record), dated from this one's due date and never into the past; a month-end series keeps its day (the 31st falls on the 30th, then the 31st again); cancelling ends the series. On the day a task falls due — or the first pass after, if it was already late — its assignee is reminded once in the inbox ("Due today" / "Overdue since"), and again only if the date moves; a leaver is not reminded. The watch runs where the first-reply warning does: Home, the inbox and the mail worker's pass.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | service `recurrence.py`, `crm_routes` task create/update, `inbox.task_due_watch`; portal `task-quick-add.tsx` (Repeats), `task-list.tsx`                                                                                                                          |
| Audit and history               | The audit log searched as an auditor asks: between two days (both included) and for words found in the action, reason, record id, actor or detail, beside the existing person, action and record filters (`hq/audit?from=&to=&q=`). Task, meeting and support-conversation updates now record each change's value before and after, as companies, people, leads and deals did; the lead and meeting pages and a support conversation's side panel show their Changes to roles that read the audit log.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | service `staff_routes.handle_audit_search`, `read_hq_audit_events(since, until, text)`; portal `admin/audit`, `crm/record-history.tsx`                                                                                                                            |
| The desk as a team              | Migration 0073 (`hq_ticket_viewers`): a conversation's page says it is open every fifteen seconds while it is visible, and at once when its writer starts or stops; everyone else on it sees who has it open and who is writing, for 45 seconds after their last word. A heartbeat is not audited and its rows go after a day. A public reply carries the newest message its writer had on screen: one that would cross a colleague's reply or the customer's newer message is held back once with who wrote what, the text kept, and Send anyway sends it; a note never crosses anyone and nobody's own reply crosses them. The desk over time (the desk's "Over time", `/reports/desk`): conversations open at each day's end over 14, 30 or 90 days, what came in and what was resolved, first reply and resolution as the median and the slowest tenth, by priority, and how old the open ones are.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | service `desk_routes.py`, `ticket_routes._crossed`, 0073; portal `support/ticket-presence.tsx`, `support/composer.tsx`, `reports/desk/page.tsx`                                                                                                                   |
| Reports                         | Report builder (`/reports/builder`, any role, over the kinds its role reads): companies, leads, deals, support conversations or tasks; the list's own filters (`f=`), a grouping (stage, owner, source, status, priority, tag, the month opened or closed and more), a measure (how many, or the total or average of a figure: monthly value, MRR, seats, days in stage, wait for a first reply, messages), drawn as bars, a line over months (the empty months between drawn) or a table. Each figure links to the records behind it (`/reports/records`). It runs as whoever opens it: what their role cannot see is not counted, money is never summed for a role that does not read it (it counts instead and says so), and money adds up in one currency at a time with the rest left out and counted. A report is a saved view on a `report-<kind>` list: private, shared to open, or shared for the team to change its filters (0074 `team_edits`); renaming, sharing and deleting stay with its owner or an admin. Pinned to My dashboard (preference `hq-dashboard`, in the person's order, reports over the same records share one read), and mailed as a digest like a list view.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | service `view_routes.py`, `digests.LISTS`, 0074; portal `lib/reports/builder.ts`, `reports/builder`, `reports/saved`, `reports/dashboard`, `reports/records`, `components/reports/*`                                                                              |
| Email from a record             | Migration 0075 (`one_off_mail.py`, `hq/mail/one-off`): "Write an email" on a person's or lead's mail panel, a company's activity (its people with an address) and a deal's (its primary person). It goes now from the writer's own connected, sending mailbox — the one the form names, chosen when they have several; never a colleague's — and keeps every rule a send keeps: do not contact, the stop list (unsubscribe, bounce, complaint, a firm-wide stop), a sales stop, an address a verification called dead, a prospect's cold rules and its country's subject label. It counts toward the mailbox's, the domain's and the pool's day, stops when outbound mail is switched off, and carries the opt-out line a sequence email does. It is a row in the same ledger (kind `one_off`), so a bounce, an unsubscribe and a reply find it. Sent, it is on the timeline as the writer's (a lead's first reply stops its clock, a new lead becomes Attempting); refused, the words say why and the text stays in the box; an unclear answer says it may have gone. It is tried once, never retried behind the writer's back.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | service `one_off_mail.py`, 0075; portal `mail/record-email.tsx`, `mail/record-email-form.tsx`, `mail/actions.ts` (`sendOneOffAction`)                                                                                                                             |
| Undo and put back               | An inline edit on a record offers Undo for fifteen seconds: the value it had goes back through the same update, so History keeps the change and its undo (an undo is not itself undoable; a refused undo says why beside the value). History puts a field back to its value before a change — the newest change of each plain field (a company's name, domain, type, team size, country, lifecycle and owner; a person's name, address, title, role, phone, company and do-not-contact; a lead's owner; a deal's name, expected close, owner, seats and currency) — through the record's own update, so the service checks it as any edit, and only over the value that change made; a value the audit row cut at 200 characters, a stage, a status or a next step is moved where it lives.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    | portal `ui/inline-field.tsx`, `crm/record-history.tsx`, `crm/put-back-button.tsx`, `_actions/put-back.ts`, `lib/crm/put-back.ts`                                                                                                                                  |
| Times in the person's zone      | Every time HQ shows is in the person's own zone: `hq/me` carries the zone on their notification preferences ("Your time zone" under Mail from your inbox, which quiet hours already read), "" until set; a person with none is given their device's zone on first sign-in, saved once. The server prints from a per-request zone set as soon as the person is known; client components take the same zone from a provider, so hydration never disagrees; a time keeps its UTC form on hover; a calendar date (a due date, a close date) is never shifted; the status line's clock ticks in the zone. The numeric parts come from Intl and the zone's name (IST, BST, CEST, EDT…) from HQ's own table, so the server and the browser print the same string; a zone outside the table reads by its offset (UTC+5:45). Documents, exports and CSV cells stay UTC and say so; the printed page's footer stamps the page's zone. A time typed into a `datetime-local` field is a wall clock in that same zone — the reminder, a ticket's snooze, a meeting's start, a maintenance window, an incident's times, a change's date, a campaign's start, a notice's start and end, a queued email's schedule — read on the right side of a clock change (`instantFromWallClock`, two passes over the offset) and sent as the instant it means; the field shows a kept instant back as the same wall clock; "Remind me" offers tomorrow at nine on the zone's calendar; no offset travels with a form any more. The Companies list's MRR filter and sort compare in the page's main currency ("MRR (USD)"), never a sum across currencies; a company paying in another is "no MRR" to the comparison while the column shows every amount. | service `auth_routes.handle_me`; portal `lib/time-zone.ts`, `lib/format.ts`, `shell/time-zone-context.tsx`, `_actions/time-zone.ts`, `ui/timestamp.tsx`, `lists/definitions.ts`                                                                                   |
| One hand: the busiest screens   | The screens used away from a desk, shaped for a thumb at phone width and unchanged at a desk. Home: an owed row keeps every word of its title and its status pill sits under it (beside a wide pill the title was squeezed to a sliver — "Bluecrest Family Office" to nothing); the inbox panel's lines wrap; the keyboard shortcuts are not shown to a screen with no keyboard. A record opens on its notes: the activity section (the quick log — note, call, email — and the timeline) comes first in the column, so a call is logged without a scroll past the target account, signals and deals. The peek is the whole screen with a 44px close. A strip of two or three figures (Approvals, Tasks, Privacy) stays one row with wrapped labels and a divider between neighbours, where stacked it read as a bar down the second figure's side. Harness part `phone` asserts each at phone width and the desk's order at desk width.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | portal `globals.css` (the `max-width: 720px` rules on `.owed`, `.agenda`, `.briefing__block--keys`, `.record-layout__main`, `.peek`, `.stat-grid--3/--2`), `home/page.tsx`, `ui/record-shell.tsx` (a section carries `data-section`); harness `capturePhoneFlows` |
| Backup                          | Admin → Backup: an Owner asks with a reason after a fresh code; with another Owner it waits for them (approval kind `backup`, migration 0069) and the asker downloads it once within 48 hours; alone it is made at once (`sole_approver`). One zip: a CSV per export kind with custom fields, the timeline, comments, support threads (internal notes marked), stages, sources, the price list, field definitions, the staff directory, mailing lists, consent and suppressions, and a README with who, who approved, why, what is left out and each file's SHA-256. Outside the export quota (the approval is the control), in the ledger; no marker rows. The approval schema now parses every kind the service has (`write_off` was missing: a waiting write-off broke the request and the Approvals list).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | service `backup_routes.py`, `dual_control.py`; portal `admin/backup/*`, `documents/backup-zip.ts`                                                                                                                                                                 |

## 5. Next, in order (from the research; each is a full wave: service + test + mock + portal + harness + commit)

**The table-stakes order** (`docs/RESEARCH-2026-10-03-TABLESTAKES.md` §3; exports of a
view, the backup, a person's data file, archive, share, quote links, the outside-links
register, imports of companies and people, find and create, handover, recurring tasks, audit search and history, the desk as a team, reports, email from a record, and times in the person's zone are built, §4). Undo on a single edit and History putting a value back are built too (a deal already leaves
the lists when it closes and a lead when it is disqualified, so those two kinds were not
given an archive of their own).

8. **Files on records** (needs the storage account decided with production) and **hosted
   forms** — taken up when asked.

**Prospects, still to do** (report sections in `docs/RESEARCH-2026-10-03-LEADS.md`):

1. **An enrichment adapter with provenance** (backlog 18): one or two providers in order;
   provider, time and cost per field; a value a person typed is never overwritten. It
   waits on choosing a provider — a founder decision with a contract and a price.
2. ~~A phone layout for the busiest screens~~ — built 2026-10-06 (§4, "One hand"), and
   what a native shell would add on 2026-11-05 (§7): the install button on My
   notifications. The icon badge was already there (`AppDevice` sets the unread count).

Data-operations items deliberately left: mailing-list members are not checked against
leads (a list is its own audience, joined by address when it is sent); a phone
normaliser (the team does not call from HQ, and a number is written one way only with
its country's dialling rules); the verifier's file for the whole list is the original
file's addresses, not an export (the export allowance is 5,000 records a day, lifted by
an owner).

The earlier passes, for the record:

The third pass's order (`docs/RESEARCH-2026-09-30-SUITE.md` §8): Security 2 part two
(read tripwires, decoys, key hygiene) → Inbox → Receivables → Privacy desk → Pipeline
inspection → Customer success → Status → Security 3 → AI assistance → Platform → Trust
registers. Earlier passes' S/M items are all built; what follows them below is taken up as
the team asks — nothing here blocks going live.

Lists items deliberately left: grouping and the filter builder on People (the same
modules take one page), keyboard reordering of columns, and saved views that carry a
column set (a view is a query; columns are a preference).

CRM items deliberately left: a three-way merge picker (three or more look-alikes are
merged one at a time from the kept record), import of deals or contracts (money is typed
against a plan, not pasted), mention autocomplete (the handle is a first name or a mail
name; unknown handles are left alone).

Import items deliberately left: import as a capability of its own (the three roles that
write the CRM are the ones that import; a split matters once roles are custom), Excel
files (a CSV is what every source can give; an .xlsx is saved as one), creating the
companies a people file names in the same run (the answer names them; bring them in
first, then "Fill in" links the people), and keeping the original file (the ledger, the
per-record changes and the left-out download are what the research asks for).

People-ops items deliberately left: an applicant pipeline (the careers form), an org
chart (the reporting line is a field, read on the record), and storing pay.

Security items deliberately left: a "new country" sign-in rule (needs a geolocation
source the service does not have — a production-side addition); dual control for further
acts (deactivation, audit export) if the team asks; passkeys as the ONLY factor (today a
passkey stands in for the code after the password, never for the password). A tamper-evident ledger (Azure SQL ledger tables) is a
production-side switch, not code.

Desk items deliberately left: email-to-ticket needs an MX record and an inbound secret
(founder), and the desk reads the customer's app version from the ticket, not live.

Deliberately **not** built, with the research's reasons: round-robin routing, CSAT
surveys, LTV, health scores, territories, AI deal scores,
storing pay, IP allow-lists, whole-mailbox OAuth sync as step one, native mobile apps.

## 6. Blocked on the founder (production) — `docs/HQ_GO_LIVE.md` in the product repo

Azure subscription upgrade and cost fix → service settings (`QT_HQ_*`, portal key pair,
Turnstile, `QT_UPDATE_DEPLOY_URL` on HQ) → apply migrations 0006–0075 and publish → move the desk onto SQL → Vercel
import + `hq.quantifyterminal.com` → bootstrap the first owner → link each staff
member's Quantify Terminal account (Product) → run
`scripts/hq_go_live_check.py` → website form key → retire the console desk. GitHub
Actions on the account fails every run in seconds with no runner (billing) — only the
founder can fix.

**Before the first cold email** (report B; none of it is code): the researched list must
not go through the transactional provider — its policy forbids third-party lists, and
sign-in codes ride on the same reputation. It needs (a) one or two secondary domains that
are clearly ours, with SPF, DKIM and DMARC, (b) two or three ordinary mailboxes on each,
warmed for three to four weeks, each sending 25–50 a day, (c) the addresses verified by a
verifier first (the whole file costs tens of dollars; export a view from Prospects, bring
the result file back in under Import), and (d) a decision, with advice, on each country
the list reaches that the research did not cover — Leads → Sending rules lists them with
their counts, held until someone decides. At about 500 sends a day the list is a
six-month programme, not a week's. The mailboxes themselves are connected under Mail →
Mailboxes; the consent screens need the Google scope and the Microsoft app registration in
`docs/HQ_GO_LIVE.md` §11a (the company's own domain is on Zoho, which connects by server
and app password without either).

---

## 7. Checkpoint — update at the end of every wave

**As of the company batch: the company record, Key dates from its facts, meetings and minutes,
the register of members, agreements, the Owner-only people ledger, touches, pilots, diligence and
the closing checklist** (2026-11-14). Portal and the local sender; no service change, no migration.
Waves 3–5 of the 2026-11-13 research (report outside the repo:
`~/Documents/evm/reports/HQ portal gaps and build plan.md`). Spec: `ws-notes/company/spec.md`
(§14 Step 0 as built, §15 the lead's decisions) in `~/Library/Caches/hq-work`.

- **What it adds.** Data › Company record (rail "Company record", icon Stamp, so it never reads as
  System › Company, which runs on the demo service): facts (CIN, PAN, TAN, GSTIN, state,
  incorporation, first year end, auditor, AD bank, FIRMS user, DPIIT; flags) and directors (DIN,
  DSC expiry, DIR-3 KYC cycle, contact changes); views Meetings (notice and quorum checks,
  resolutions with an MGT-14 flag, SS-1 timers on minutes, minutes locked once signed), Members
  (register of members with a certificate log; a cap-table view read from the register, never a
  model; built as its own module so it can be dropped) and Agreements (parties, term, renewal and
  notice-by days into Due, the "what is missing" check). Key dates gains fact-driven suggestions
  (first AGM, AOC-4, MGT-7A, ADT-1, INC-20A, the board-gap rule, DSC and DIR-3 KYC), evidence per
  date (status, owner, SRN or challan, filed copy, fee), a professional's sign-off for "not for us",
  and a Rules view where every rule shows its source, checked-on day and "confirm with your CA/CS";
  his own days replace the rule's everywhere. Data › People ledger (rail "People ledger", Owner
  only, capability `local:data:owner`): engagement terms, project brief, evaluations gating the
  certificate, stipends paid (a record, never payroll; tax "CA to confirm"), access with 24-hour and
  5-day offboarding deadlines; its letters and certificates are kept inside the ledger
  (`data/people/files/`, an Owner-only download), never in Files, search, the calendar feed or an
  Admin's backup. Touches logged by hand on leads and investors. Waitlist › Pilots (criteria, owners,
  term, price, conversion, go/no-go, weekly check-ins; the active count is a sentence, never a
  limit) and Diligence (questionnaires, security reviews, references, redlines, Labs trials).
  Investors › Closing: a per-firm checklist that adds its dated deadlines to Key dates (allotment
  60 days, refund 15 after, PAS-3, register, certificates, MGT-14, valuation age, FIRMS, FC-GPR,
  FLA), every statutory day editable and "confirm with your CS" until ticked; the only refusal is
  an allotment dated before the money. Modules now 21.
- **Verified on a copy** (`hq-co`, next 3120, mocks 7089/7090): vitest 131 files / 1,113 tests;
  `check:data` 1,478 / 0 over four passes (merged checks M1–M9 included); harness data 208 and find
  44, clean; `check:mail-merge` 65 unchanged. Built by four units on `hq-co-u1..u4` over a shared
  Step 0 (`scripts/data/company-contracts.ts`), merged by `git apply --3way`;
  `tests/data/company-merged.test.ts` and `scripts/data-walk/company-merged.ts` prove the seams.
- **Shipped** to the live clone on 2026-11-14 with a rollback in
  `~/Library/Caches/hq-work/ship-backup-20261114-company/`; 21 modules loaded on his real data; an
  Admin sees "The people ledger is for the Owner only." and no People link.
- **Waiting on him and his CA or CS** (spec §13): every statutory reading in the Rules view; PAS-3
  at 15 or 30 days; MGT-14 for private-company board resolutions; whether HQ keeps the register of
  members at all (drop the `members` module if not); Indian company or a US parent; stipend tax and
  whether paid interns are employees; J&K Professional Tax, Shops & Establishments, stamp duty.

**As of the raise batch: investors qualified, notes, contacts, decisions, numbers, packs, the
calendar feed and search over Data** (2026-11-14). Portal and the local sender; no service
change, no migration. From the research pass of 2026-11-13 (report outside the repo:
`~/Documents/evm/reports/HQ portal gaps and build plan.md`, its Wave 1 and item 3.1).

- **What it adds.** Investors: qualification (cheque range, stage, sectors, geography, lead or
  follow, residency and "can invest into an Indian Pvt Ltd"), introductions (warm when Made),
  waves, offer deadline, a deck link per firm; views Funnel (counts and "of" ratios per stage,
  days since first send, first meetings this week, money per currency never summed, pass reasons,
  time in stage, splits by wave and warm or cold; no target, no "%") and The round (instrument,
  cap, discount, MFN, smallest cheque; no target range). Notes on investor firms and waitlist
  entries (call notes, objections, actions that become the Due kind "Action", the investor FAQ,
  "record as decision"); Contacts (CA, CS, lawyer, bank, auditor, introducers; archived, never
  deleted, never leads); Decisions. Replies: "Hold the rest of their firm" (ticked by default;
  never for out of office or free mail; released by taking the reply back), outcomes Meeting
  request (a yes) and Needs review, a booking-link answer. Numbers (counted from Data only; cash
  and burn typed per currency, unused after 35 days; runway rounded down), the monthly update
  (asks first, `[brackets]` for missing parts, frozen numbers, recipients handed to Mail merge as a
  list he sends himself, a Key date on the 10th). Data-room packs in Files (numbered index, zip
  with a SHA-256 manifest, what is missing, a share log typed by hand). A private calendar feed at
  `/cal/<token>` (only its SHA-256 stored; full titles or kinds only; a downloadable `.ics`), and
  Data in `/search` and ⌘K. Modules now: files, leads, replies, waitlist, investors, dates,
  contacts, notes, numbers, calendar, search, backup.
- **Verified on a copy** (`~/Library/Caches/hq-work/hq-raise`, next 3110, mocks 7079/7080): vitest
  105 files / 911 tests; `check:data` 1,159 checks / 0 failed over four passes, roles and global
  checks; harness data flow 140 screens and find flow 44, clean; `check:mail-merge` 65 unchanged.
  Built by four units on copies `hq-raise-u1..u4` from `ws-notes/raise/spec.md`, merged by
  `git apply --3way`. Tests that prove one module alone run with `startStack({ modules })`;
  `tests/data/raise-merged.test.ts` and `scripts/data-walk/raise.ts` prove the seams.
- **Shipped** to the live clone on 2026-11-14 with a rollback in
  `~/Library/Caches/hq-work/ship-backup-20261114/` (README, CHANGED, NEW, SHIPPED); the sender
  (now under launchd, `com.quantifyterminal.hq-mail-merge`) was restarted with nothing sending.
- **Lessons.** Walking three copies at once drove the load average to 61 and caused every timing
  flake; walk one copy at a time. A closed lid on battery suspends the Mac for 18 s to 16 min and
  breaks wall-clock tests; run gates on mains power with the lid open.
- **Next.** The company batch (`ws-notes/company/spec.md`: company facts and directors with
  fact-driven Key dates, meetings and minutes, register of members, legal-document register, the
  Owner-only people ledger, pilots, diligence, the closing checklist with every statutory day
  marked "confirm with your CS"). Not built and the founder's to decide: moving cold mail off the
  transactional provider, one-click unsubscribe on a public endpoint, the Azure switch-on (§6).

**As of Data: the founder's real files, leads, replies and waitlist, on this computer**
(2026-11-10). Portal and the local sender; no service change, no migration, nothing committed.

- **What it is.** A rail group "Data" (Owners and Admins, `mail:send`; only where
  `HQ_MAIL_MERGE_SOCKET` is set, through the synthetic capability `local:data`): Data (today's
  counts and what is due), Files (14 default folders for an Indian company, upload in 3 MiB parts,
  versions, tags, notes, review dates, trash, search inside PDFs with `unpdf` 2.1.0, folder zips,
  Send by email with the file attached, the share sheet, "Shared by me"), All leads (every
  address from the lead files and Mail merge's lists, status live from the written log and the
  stop list, the exact words each was sent), Replies (Yes → waitlist, No → Mail merge's stop list,
  Later and out of office → follow-ups, Wrong person → a referral lead, Question → a follow-up;
  take back), Waitlist (Joined → Call booked → Call held → Pilot → Customer / Dropped, proof of
  each yes, colleagues, holds of a firm's unsent addresses only after a preview, "For investors"
  with no names or addresses), Investors (the pitch list as a pipeline, amounts per currency, no
  target), Key dates (suggested Indian filings, added only by hand), Backup (one zip, never the
  key). Home gains a Data block and owed rows; ⌘K gains "Record a reply" and "Add files".
- **Where it runs.** In the Mail merge process, on the same socket: `scripts/data/host.ts` on the
  main thread (routes, byte streams, supervision, the four allowed engine calls `addStops`,
  `removeStop`, `importList`, `status`) and everything else in one worker thread
  (`scripts/data/worker.ts`, modules `files`, `leads`, `replies`, `waitlist`, `investors`, `dates`,
  `backup`). A crash restarts the worker (1 s, 5 s, 30 s; off after five in ten minutes; "Restart
  Data" on the page); a hung worker is ended after a missed deadline and a silent ping. The sender
  is never stopped by it. `HQ_DATA=off npm run mail-merge` leaves Data out. Its data is
  `~/Library/Application Support/hq-mail-merge/data/` (0700/0600). `engine.ts` is unchanged;
  `server.ts` gained extra and stream routes after the sender's own and a last-resort catch;
  `provider.ts` gained the optional `attachments` field.
- **Verified on a copy** (`~/Library/Caches/hq-work/hq-ws`, next 3100, mocks 7073/7074, its own
  socket): vitest 81 files / 741 tests; `npm run check:data` (`scripts/e2e-data.ts` with the
  stand-in `scripts/e2e-data-service.ts`, 71,806 invented leads) 755/755 at both widths and themes;
  harness `HQ_HARNESS_FLOW=data` 84 screens and `home` clean (`scripts/screenshot-hq.ts` now reads
  the mock origin from `HQ_MOCK_BASE`); `check:mail-merge` 65/65 on the final code. The `data` flow
  refuses port 3000 and is never in `SIGNED_IN_PAGES`: a walk never opens real data. Not checked:
  Safari, a real print to PDF, a real send by email with an attachment.
- **Shipped to this clone on 2026-11-10** (rollback copies of the 18 changed files in
  `~/Library/Caches/hq-work/ship-backup-20261110/`), `npm install` for `unpdf`, hq-dev restarted,
  the sender restarted detached (`setsid`, log `~/Library/Logs/hq-demo/mail-merge.log`) after it
  had stopped with its parent session. First run: the lead files and three PDFs in Files, four
  lead sources (66,341 leads, 6,128 held back), the first yes recorded, the investor list chosen
  (293 firms). The spec and its addenda are in `~/Library/Caches/hq-work/ws-notes/`.
- **Fixed 2026-11-11: a press after a long edit.** The mock ends an Owner's session after 15
  quiet minutes, and typing is quiet, so "Send me a test" after writing an email arrived signed
  out. `requireStaff` redirected the server action to `/dev/signin` (a GET route), the browser
  posted there, got 405, and the page showed "An unexpected response was received from the
  server". In development with `HQ_DEV_AUTOLOGIN` a server action now signs back in where it
  landed (`devSignBackIn` in `src/lib/access/core.ts`, once per request, only when the
  `next-action` header is present) and the press goes through; a page load still goes through
  `/dev/signin`. Checked on the copy with an expired cookie: the old code lost the press, the new
  code sent the test. Production is unchanged (the bypass is off there).

**As of Mail merge: the raise's investor list, sent from this computer** (2026-11-05). Portal
and a local sender; no service change, no migration.

- **Why not Campaigns.** The founder asked to add the provider key to HQ and send a made-out
  email to a CSV of investors. Campaigns are the service's, and the service is not live
  (`docs/HQ_GO_LIVE.md`: Azure is off, migrations unapplied), so on a laptop they run against
  the mock and send nothing. The portal also holds no secret by rule. So the sending is a
  small program beside the portal (`scripts/mail-merge/`, `npm run mail-merge`), reached by
  a socket file rather than a port, which holds the key and keeps the record. The portal
  stays a screen over a service (`src/lib/merge/api.ts`, `/mail/merge`). Once the service
  is live, Campaigns and Lists do this properly and this can go.
- **Held to the service's provider.** `provider.ts` makes the same calls and classifies
  answers as `mail_provider.py` does: sent, failed, retry, auth_failed, and a lost answer
  as `unknown`, never sent again. Checked against the real provider with a key that does not
  exist: 401 `unauthorized`, read as a refusal on every call. The first real send went on
  2026-11-06: Brevo took 292 of 293 (274 delivered, 8 hard and 10 soft bounces) and logged
  the last as out of credits while answering it 201. So "Sent" in Mail merge means the
  provider accepted it, not that it arrived, and an out-of-credits send can read as sent.
  Left: reading delivery back from the provider, so the screen says what arrived.
- **What it will not do.** Write to anyone twice in a send: each attempt is logged before
  the message goes and a crash between the two reads "may have been sent". Send without a
  live press: a restart comes back paused. Go past the day's limit. Write to the stop list.
  Go out with a `[blank]` in the words, an unknown field, an unverified sender, or words
  that differ from the last test. It pauses itself on a refused key, on no credits, on the
  provider staying down, and at 5 refusals in the last 20.
- **The founder's own list decided the design.** `Quantify_Terminal_Investors_Pitch_Emails.xlsx`
  and its CSV: 293 firms, `{Greeting}` and `{PersonalLine}` in single braces (so both brace
  forms are fields; left as text they would have been mailed literally), `[link]` and
  `[Company postal address]` to fill (so blanks block a real send), `CheckFirst` on 37 rows
  (so a mailing can hold back on a column, and send to one tier), 20-30 a day (so the
  default limit is 30 at 2 a minute, changed in Setup), its own opt-out line (so the footer
  starts empty and a missing opt-out is warned about).
- **The risk that stays with the founder.** That workbook says not to send this list through
  a newsletter tool, and §6 says the researched list must not go through the transactional
  provider. Mail merge does exactly that, because it was asked for by name. It was said so
  at the time. The provider is also what the account notices use: see §6 before sending.
- **Local state on 2026-11-05.** The list and an "Email 1" draft are loaded in the sender,
  no key is set, nothing has been sent. The sender runs as a plain process, not a launchd
  agent: installing one was refused as persistence nobody had asked for, and is the
  founder's to approve. So after a reboot, `npm run mail-merge` from the clone.
- **Sending to a few, and to anyone** (2026-11-06, the founder's ask). A mailing's "Send to"
  is everyone, one column's value, or the people ticked in a searchable list on its page.
  Addresses can be typed in with the words its fields need; they go on one "Added by hand"
  list. Any row can be edited in place, from the list or from the preview. In order, the
  rules are: the stop list beats everything; a person ticked by name beats a hold, because a
  person looked at them; "tick everyone" never ticks the held or the stopped; "already written
  to" comes next. That last one is on by default and rests on `written.jsonl`, written as each
  message goes, not on the mailings: deleting a mailing used to forget who it reached and give
  the day's limit back. Old mailing files read back with the new fields defaulted.
- **Finding a mailing** (2026-11-09, the founder's ask, with 227 mailings on the page). The
  Mailings heading carries a find box (`?q=`, a plain GET form like the list page's) and
  tabs All / Drafts / Going out / Sent or ended (`?show=`), each with its count; the same
  words filter the Lists table, and each table says how many of how many match. Every word
  must appear in the mailing's name, subject, state or list names; a number matches a
  whole number written there (so "8" finds "Waitlist 08", never "Waitlist 18"), and a
  mailing whose name starts with it comes first (`src/lib/merge/find.ts`,
  `tests/mail-merge/find.test.ts`). The walk checks it ("Find a mailing", and `phone-find`):
  all checks passed on a copy with a stand-in sender before it reached the clone.
- **Demo figures at another size, and the road to the goal** (2026-11-09, the founder's ask).
  `MOCK_REVENUE_SCALE` (a whole number, 1 to 100; unset is 1) multiplies the demo book's
  seats and dollars and the finance seed's cash, vendors, claims, budgets and purchases, so
  seats × rate and runway still reconcile; investor-update drafts are left as written. The
  founder's local launcher (`~/Library/Caches/hq-work/demo/hq-mock.sh`) sets 10: about
  $10.3M ARR on screen. Every revenue and finance page now says, above its title, when its
  figures are the local demo service's (`src/lib/demo-figures.ts`: a development build
  reading a service on this machine), so a screenshot of invented figures cannot pass for
  the company's; the line reads "Demo data, not company figures." and, at the founder's ask
  (he reads these pages alone, on this machine), shows only in print, not on screen. Exports
  made against the
  demo service carry "(demo data)" in their title and "-demo-data" in their file name
  (`exports/route.ts`). A "Road to $10M ARR" panel was tried and taken out at the founder's
  ask. `MOCK_PORT` lets a second mock run beside
  the first for a test copy. Checked on a copy (mock on 7073 at 10, portal on 3100): every
  revenue and finance page at both widths, axe clean, no overflow, no console errors;
  vitest 43 files / 503 tests.
- **Never swap the real sender to test.** The founder was using it, tests and a practice run,
  while the walk was run on its socket: for a few minutes the portal was talking to the
  throwaway. A press in that window would have looked like mail going out. The walk now runs
  on a copy of the checkout (`cp -c` of `node_modules` takes seconds) on port 3100 with its
  own socket, and the build runs there too, so the live server is left alone.
- **The demo mail is gone from this laptop's Mail section** (2026-11-06, the founder's ask).
  `MOCK_EMPTY_MAIL=1` in `.env.local` runs `clearMail()` when the mock starts, not on
  `mock/reset`, so the harness keeps the world it walks; restart the mock after a walk. The
  seeds are untouched. With a sender set up, Mail's overview says sending happens in Mail
  merge rather than asking for a campaign sender. A crawl with it empty: no errors, no failed
  reads; only direct links to the demo records answer not-found.
- Tests: `tests/mail-merge/` (template, lists, engine, and the portal's client against the
  sender over a real socket: 65). `npm run check:mail-merge`: 58 ✓ in a browser, including
  that no response carries the key.
- Left: follow-ups in the same thread (a copy of a mailing sends a new email; untick "leave
  out anyone already reached" for it), stopping when someone replies (replies go to the
  mailbox; add them to the stop list by hand), sending at each investor's morning.

**As of the local run: a lapsed session, Releases on a laptop, a thumb's press, install**
(2026-11-05). Portal, mock and harness; no service change, no migration.

- **How it was found.** The gates were green (types, lint, 420 tests, build) and a crawl
  of all 251 screens as the Owner at both widths found nothing: no console error, no
  failed request, no overflow, 1,243 links all answering. The fault was in the dev log:
  "Failed to fetch RSC payload … Falling back to browser navigation", twenty-odd times,
  always just before a `/dev/signin` redirect.
- **A link pressed after the session lapsed reloaded the whole page** (the mock restarted,
  the cookie went stale, the bypass signs back in). The policy's
  `upgrade-insecure-requests` is applied by the browser to a redirect it follows inside a
  fetch, even on localhost: the page the sign-in redirected to was asked for as
  `https://localhost:3000`, which nothing answers (`ERR_SSL_PROTOCOL_ERROR`), and the
  router fell back to a document load. It never showed on a first request (a browser
  spares localhost there) or in production (every address is https), and the harness
  uses full page loads. `contentSecurityPolicy` now leaves the rule out in development
  only; `tests/lib/csp.test.ts` holds both halves.
- **Which uncovered a worse one the failure had been hiding.** With the redirect followed,
  the router kept two answers that pointed at each other (the page's "go and sign in",
  and the sign-in address's "the page") and walked between them without asking the
  server again: 668 navigations in seven seconds, the screen never drawn. `/dev/signin`
  now answers a router fetch (the `rsc` header) with plain text, which the router treats
  as "open this as a document": one sign-in, one landing. Checked with a stale cookie,
  with the mock reseeded under an open page, and on both `localhost` and `127.0.0.1`.
  Development only: in production the route does not exist and sign-in is a page.
- **Releases works on a laptop.** It was the one screen that could only say "not
  configured": nothing local served the release function for an `hq_` token (the
  console's mock knows only its own sessions). `scripts/mock-hq-api.ts` now serves
  `/api/release_history` and `/api/deploy_update` as `update_deploy_function` does: the
  caller resolved through `hq/product/whoami`, Admin to read, Owner and a fresh code to
  publish, `_normalize_manifest` and `_validate_manifest` field for field, the function's
  own `{ok, error}` envelope, a staged release not served, the live one turned off still
  written, the signature never echoed, and `mock/reset` reseeding the two releases.
  `MOCK_RELEASE_SIGNING=unconfigured` answers as a deployment with no key. The
  `releases` harness part publishes 1.5.0, stops it, serves it again and rolls back to
  1.4.0 at both widths in both themes.
- **A pointer left over a button is not a contrast failure.** That part first failed axe
  on a phone, one run in two: a press swaps the button under the pointer for another,
  caught part-way through its hover colours (3.96:1 for 140 ms). The part moves the
  pointer off and waits before each capture; the same will bite any flow that presses a
  button which is replaced in place.
- **A thumb's press** (left from "one hand"). At 412px, 1,585 of 1,618 pressable things on
  eighteen busy screens were under 44px in one dimension. Buttons are the part that
  could be put right without moving anything: at phone width `.btn::before` reaches 6px
  past a button above and below, so a button takes 44px and a small one 40px, drawn as
  they were. Six, because that is the least rows of buttons stand apart. The first
  attempt reached 8px (44px for all) and was wrong: a reach longer than the gap lands on
  the row above, and the button later in the page takes the press. Pressing just inside
  the top and bottom of every control on 27 screens found 27 presses going to the wrong
  button: the lowest 2px of each button over a wrapped row, and on Replies, where the
  three outcomes stood one on another touching, a quarter of each. At 6px, with those
  outcomes given their row's gap (`RowAction` there had no layout class) and the
  prospects tools' lines 6px apart instead of 4px, there are none. Before and after over
  all 251 screens: no page overflows, no scroll container gained a pixel, and axe still
  judges every button's contrast. The `phone` part asserts the 12px added, nothing added
  at a desk, and that no press inside a control is taken by another button; with the
  reach made 9px it fails on Replies, as it should.
- **Install.** The browser's offer to install arrives once, on whatever screen was loaded
  first, so `AppDevice` holds it (`lib/install-offer.ts`) and My notifications has "HQ as
  an app": the button where a browser offers, the steps by hand on an iPhone or iPad, a
  line for a browser that has not offered, and "installed" once it is. Tests:
  `tests/lib/install-offer.test.ts`.
- **Replies told Support and the Intern that a read had failed.** `hq/mail/replies` is
  for those who may write the CRM, the tab is shown to everyone, and the page answered
  the refusal with "could not be read just now". It now says who Replies is for and does
  not ask the service. Found by crawling as each role: of 251 screens it was the only one
  that called a role's limit a failure. (A crawl as Sales trips the read tripwire, as it
  should: twenty screens answered "Confirm it's you to keep reading". And an applicant
  is "not found" to Support and the Intern, which is the service's answer, kept.)
- **The clock gave React two answers.** `SidebarClock` asked the system clock each time
  its store was read. React reads a store twice in a row, and a second turning over
  between the two reads logged "The result of getSnapshot should be cached" on whatever
  screen was open: once in some three thousand page loads here, on an applicant's page.
  The harness counts every console error, so this was a check that failed once and
  passed alone. The second the clock shows is now moved by its tick and by nothing else
  (`tests/components/sidebar-clock.test.tsx`).
- **The mail flow depended on the hour.** `captureMailFlows` started the webinar campaign
  and then tested and submitted the owner's own draft, which goes to the same people. In
  the afternoon in India every recipient is inside their sending window: the webinar
  took all of them at once, the draft was left with "0 eligible recipients; 23 skipped",
  Submit was off as it should be, and the walk waited fifteen seconds for it and died.
  In the morning some sends are deferred and the same walk passes (it did, at 13:00).
  The draft is now submitted first, before anything is sent. The same class as the
  prospects flow's take-back count.
- **The walks.** Desktop and phone, whole, on 2026-11-05 from 17:16: 877 ✓ each, no
  retries, 27 minutes each on a warmed server. Three earlier attempts died, none on a
  check: a form pressed before its page had hydrated, while Turbopack wrote its cache
  for twelve seconds and a second browser was measuring beside the walk (run nothing
  beside a walk, and warm the server first: one pass over every screen compiles them
  all); the browser cut off mid-load when the session that started the walk ended
  (start a walk in a session of its own, under `caffeinate -i`, or it dies with the
  terminal that launched it); and the mail flow above, at 17:10.
- Left: text links, checkboxes and radios are still under 24px at phone width (a table
  title is a 20px line, a checkbox 13px). Making those larger moves every dense table and
  is a design decision, not a fix.

**Before that: one hand: the busiest screens** (2026-10-06, the smaller open items).

- Portal only, CSS almost entirely: the `max-width: 720px` rules in `globals.css` for the
  owed rows, the Home inbox panel, the shortcuts block, the record column's order, the
  peek and the two- and three-figure strips; one class on Home's shortcuts section.
- Measured before changing: at 412px Home had 17 lines cut short and three owed rows
  whose title column was under 120px (one at nothing); the company record's activity
  section sat 1,800px down; the approvals strip was one column with a left border on
  its second figure; the peek was 380px on a 412px screen.
- Nothing moves at a desk: the `phone` harness part asserts the phone shape at phone
  width and the desk's order at desk width, so a rule that leaked past the breakpoint
  would fail the desktop walk.
- Left then, built on 2026-11-05 (above): larger tap targets on every small button at
  phone width, and an install prompt. The icon badge was already there.

**Before that: typed times in the person's zone** (2026-10-06, the smaller open items).

- Portal only: no service change and no migration. The service already read a moment
  with a zone as that moment and one without as UTC; the portal now never sends one
  without.
- `lib/time-zone.ts` gained the typed-time half: `wallClockInZone` (instant → the field's
  value), `instantFromWallClock` (the field's value → the instant, the zone's offset read
  at a first guess and again at the answer so a clock change between them is caught),
  `typedInstant` (what a server action sends: a wall clock is read in the zone, an instant
  that names its own zone is kept, words go through for the service to refuse, empty stays
  empty) and `tomorrowAt`. `isoToLocalInput`/`localInputToIso` take the zone and nothing
  else; a client component passes `useTimeZone()`, a server action `context.me.time_zone`.
- The `tz_offset` hidden field (the device's offset _now_, wrong across a clock change
  and wrong for anyone whose chosen zone is not their device's) is gone from `ActForm`
  and the privacy/status forms; the three `moment()` helpers read the zone instead.
- The desk's "Snooze a day" sends a full instant, since a wall clock would now be read in
  the zone; the snooze field's label lost "(UTC)" and reads a kept snooze back in the zone;
  the Product managers' "Schedule (UTC)"/"Starts (UTC)"/"Expires (UTC)" lost it too and
  gained an "In your time zone" hint.
- Tests: `tests/lib/time-zone.test.ts` ("typed times": Kolkata, UTC, Los Angeles, London's
  two clock changes, Feb 30, 24:00, pass-through). Harness: the `timezone` part now sets a
  reminder from the UTC context while the account is in Kolkata and reads it in the inbox
  at 09:00 IST / 03:30 UTC, then types and reads back a ticket snooze.
- The desktop walk passed first time (877 ✓). Three phone walks in a row then died on the
  machine, not on a check: a staff page served in 7.3 s under load 13 missed the 10 s
  ready wait; `ERR_NETWORK_IO_SUSPENDED` with the laptop on battery and audio playing;
  `/product` served in 39 s under load 24 (0.6 s otherwise). The console mock on 7072 was
  also found terminated (exit 143, cause unknown) between the two walks — check both mocks
  before a walk. The harness now opens a page once more after a stall (a navigation or
  ready-wait timeout, or the network stack suspending), printing `↻ <page>: retried after
a stall (…)`, so one slow render no longer ends a fifty-minute walk; a page that is
  wrong fails the same way twice and still fails the walk.
- A fourth phone walk found an expectation that depended on the hour: the prospects flow
  waited for "Taken back · 23 removed", the night's answer. The mock's mail worker sends
  to the imported rows inside its sending windows, so by day five had been written to
  and stayed ("19 removed"); every overnight walk passed and every morning one failed on
  it. The flow now reads "N written to · N stopped" from the row before the take-back
  and checks the count removed against it and against the row's "still here" — the same
  class as a fixture date that stops being in the future.
- A fifth phone walk reached 745 ✓ and then a flow's 15 s wait missed on a dev server
  nine hours and some four thousand renders old, which served `/leads/rules` in 11.8 s
  (0.3 s fresh). Restarted and warmed, the phone walk passed whole: 877 ✓, no retries, on
  2026-10-06. Start a walk on a dev server started that hour.

**Before that: times in the person's zone** (2026-10-05, fifth research pass).

- Service: `hq/me.time_zone` from the notification preferences, "" until set. Test
  `tests/test_hq_time_zone.py`. No migration (0024's column).
- `formatDateTime` reads the request's zone from a React `cache` store set in
  `currentStaff`; in the browser `cache` memoises nothing, so client components pass the
  zone from `useTimeZone()` — `Timestamp` and `LocalTime` are client components for that
  reason. A client component that formats a time itself (quote links, the AI brief, the
  clock) asks the hook.
- The zone's name is HQ's own table, not Intl's: `en-US` says "GMT+5:30" where `en-IN`
  says "IST", and a server and a browser on different ICU builds would hydrate apart.
- A date-only value never moves: `2026-10-07` is 7 Oct in Los Angeles too. A datetime
  shown as a date is the date in the zone.
- Left then, built the next day (above): a `datetime-local` field converted in the
  device's zone, so someone who chose a zone other than their device's typed times in one
  and read them in the other. Documents and exports print UTC by design.
- "" is "not set" everywhere: the preferences, `hq/me` and the mock. The form offers
  "Your device's zone" as the first choice, so saving the mail form before the device's
  zone has been taken never pins UTC as a choice; choosing it again unsets the zone.
- A review before the first run found: `applyFilters` compared "less than" with
  `Number("")`, so a company paying only in rupees matched "MRR (USD) < 100" — no figure
  now matches no comparison, on every list and report (a hidden figure matched "< 100"
  the same way); the printed page's footer stamped UTC beside a thread in IST (it takes
  the page's zone now); a document's cells said "08:02" with no zone (they say "08:02
  UTC": a file is shared across zones).
- Service `e98fdd4`, HQ `6e468aa` (both local until the walks pass). Chromium reports a
  device in Kolkata as `Asia/Calcutta`; a browser's older names are read as the current
  ones (`canonicalZone`) before they are saved or shown.
- Found on the way: Home's inbox panel reused the meetings list's grid, whose 76px
  first column never wraps, so "First reply running late" ran under the name beside it;
  the panel's list now has a wider, wrapping label column (`agenda--labelled`, `8bb02ae`).
- "Connect" a mailbox looked up the address's mail servers with the resolver's own
  timeouts (per server, per try): a network gone quiet held it for eighteen seconds, and
  twice held a walk with it. The lookup now has a four-second deadline (past it the
  person is sent to the server form), the big consumer hosts are known without DNS, and
  the harness tries the one step that leaves the machine twice.
- Walks on this set: desktop 875 ✓ with one ✗ (`privacy-data-file-recorded`: the check
  counted the timeline's rows before "Data file made" was there, while the screenshot
  taken a moment later shows it); the data-file part alone passes in both themes. A
  check that fails once and passes alone is read as the flaky class, not a regression.
- The dev server and `next build` write the same `.next/types` files; run together they
  leave " 2"/" 3" duplicates that fail typecheck, and once left the dev server unable to
  open its cache. Stop the dev server before `npm run validate`, start it after.
- Every harness context runs in UTC, so screenshots never depend on the Mac's zone; the
  `timezone` part signs in from a second context in Kolkata to prove the device's zone is
  taken, then reads IST from the UTC context (the account's zone, not the device's), and
  puts "your device's zone" back.

**Before that: undo and put back** (2026-10-04, fifth research pass).

- Portal only: no service change and no migration. Undo and put back write through the
  records' own update routes, which validate and audit as any edit does.
- Put back reads the record fresh and refuses when the field no longer holds the value
  the change made, so a newer edit is never overwritten unseen. Audit values are text
  (`True`/`False`, ISO dates, numbers as the store wrote them), compared by type; ids
  are compared without regard to case.
- Tests: `tests/lib/put-back.test.ts`, `tests/components/inline-field-undo.test.tsx`;
  harness part `HQ_HARNESS_FLOW=undo`.

**Before that: email from a record** (2026-10-04, fifth research pass).

- Service: migration 0075 (`hq_mail_messages` kind `one_off`; `template_id` and
  `template_version` may be empty), `one_off_mail.py` reusing the worker's mailbox send,
  verdicts, caps and opt-out links. Tests in `tests/test_hq_one_off_mail.py` (7).
- Sending windows and the gap between automated sends are not applied: a person is
  writing, now. Everything about who may be written to, and how much a mailbox sends
  in a day, is.
- A row never goes back to the queue: a refused or unclear send is closed (`bounced`,
  `cancelled`, `failed` or `unknown`) so the worker cannot send it later.
- `crm:write` sends, as connecting a mailbox needs: sales hold no `mail:send` (the
  programmes), and an email to one person is ordinary sales work.
- The mock's seeded people have readable ids the service would refuse as not GUIDs; its
  one-off route answers not-found for an unknown contact instead of checking the shape.
- The mock gives a walk a warm mailbox through a test-only route, `mock/give-mailbox`;
  the harness part is `HQ_HARNESS_FLOW=oneoff`.
- Service `d9a67b6`, local. Service suite 2,163 passed, 4 skipped, plus
  `tests/test_hq_one_off_mail.py` (7), which the suite's file filter now finds.

**Before that: reports** (2026-10-04, fifth research pass).

- Service: migration 0074 (`hq_saved_views.team_edits`), `view_routes` (the team edits a
  shared view's filters, nothing else), `digests.LISTS` (the five report kinds). Tests in
  `tests/test_hq_shared_reports.py` (3).
- No report store of its own: a report is a saved view on `report-<kind>` whose query the
  portal alone interprets (`src/lib/reports/builder.ts`), as list views already were. The
  engine reuses the list pages' reads and filter grammar, so a report and its records
  page always agree, and the digest renders it with the same code.
- Leads reports read the Leads list (people who wrote in, origin inbound) as the Leads page
  does; prospects are their own list and not a report kind.
- Every built-in role reads all five kinds today, so the per-kind capability matters only
  for a role made later; the builder and the digest list both check it.
- The mock seeds two reports (one shared for editing, one private table) and pins both to
  the Owner's dashboard; the harness part is `HQ_HARNESS_FLOW=reports`.
- A review of the first build, before it ran, found nine faults, all fixed: an average
  over nothing drawn as 0 (now "—", and left off a line); the month fill keeping the
  oldest sixty months (now the latest, with the cut said); a failed staff-directory read
  turning "Owner is Ada" into an empty report (now a read failure); pins of deleted
  reports breaking Up/Down and the cap; a report digest's notes falling past the
  service's fifty rows and its group lost from links cut at 200 characters (notes and
  the group now come first); the digest saying "N more on the list" and linking to a
  list that does not exist (the service now lays a report out as a report); "No records
  match" under records that matched; the builder's records page leading back to the
  saved copy instead of the edits; and a `role={undefined}` the strict optional types
  refuse.
- Service `200ee32`, local. A report's table passes `minWidth={320}`: the data table's
  720px floor put a dashboard card's counts off the right of its scroll frame.
- The companies list's MRR filter and sort added a company's currencies together
  (`readCompanyField`, `companyMrr`); fixed with the time-zone wave on 2026-10-05: they
  compare in the page's main currency, labelled so.

**Before that: the desk as a team** (2026-10-04, fifth research pass).

- Service: migration 0073 (`hq_ticket_viewers`), `desk_routes.py`
  (`hq/tickets/{id}/presence`, `hq/reports/desk`), the crossed check in
  `ticket_routes.handle_reply`, gateway `touch_ticket_viewer` / `list_ticket_viewers`.
  Tests in `tests/test_hq_desk_team.py` (3).
- Presence is a POST that writes and is not audited (a heartbeat is not an act on a
  record); the structural audit test names it as an exemption.
- Every call refreshed a session's idle clock, so a page that asks on a timer kept a
  session alive with nobody there: Home, Mail, Leads, Deals, Meetings and the desk
  (`LiveRefresh`) never reached the 30-minute (15 for Owner and Admin) idle sign-out
  while left visible, and the heartbeat would have made a seventh. A route can now say it
  does not count as the person being there (`HqRouteEntry.keeps_session`, False for
  presence), and the portal's pollers stop asking after two minutes untouched
  (`src/lib/activity.ts`), say so on the live control, and ask again at the first touch.
- What a reply crosses is decided by the message's place in the thread (`seen_through` is
  the id of the newest message on screen), not by time: support times are kept to the
  second, and the first test of the time comparison let a colleague's reply in the same
  second through.
- A held-back reply keeps its text because the composer submits from `onSubmit`
  (`submitWithoutReset`): a form action empties the box when it resolves.
- No status history is kept per conversation, so the report counts one open from its
  creation to its latest resolution; a conversation reopened and resolved again counts
  from the latest only, and the page says so.
- The mock plays a colleague through a test-only route, `mock/desk-colleague`; the
  harness part is `HQ_HARNESS_FLOW=deskteam`, and `reports-desk` is a page.
- Service `6a088e6`, local. Service suite 2,159 passed, 4 skipped.
- The full desktop walk on `997ab13` stopped in the light pass's triage: its keys
  never fired. A preference reaches the account 400 ms after it changes; the find flow
  switches shortcuts back on and leaves the page sooner, so the account kept "off", and
  the hydrator then overwrote the device's newer "on" on every later page. A change the
  account has not confirmed is now marked on the device (`hq-pending:<key>`); the
  hydrator keeps it and sends it again (`src/lib/prefs/sync.ts`,
  `preferences-hydrator.tsx`). Any person who changed a setting and moved on quickly
  had it silently undone the same way.
- The trend chart names at most twelve periods (counted back from the latest), and a
  label at either end spills inward: thirty days on a phone gave each day 10px and the
  newest label pushed the page 6px wide.

**Before that: recurring tasks** (2026-10-04, fifth research pass).

- Service: migration 0072 (four columns on `hq_tasks`, a check on the rule, an index on
  status and due date), `recurrence.py`, the task routes, `inbox.task_due_watch`. Tests in
  `tests/test_hq_recurring_tasks.py` (4).
- A reminder folds into the task's open inbox row (often its "gave you a task" row), as
  every notice on one subject does; read a task's notice by subject, not by reason.
- The first pass after deploying reminds once about every open task already past due:
  honest, and once only (the reminded date is kept).
- Harness part `HQ_HARNESS_FLOW=repeat`.

**Before that: handover** (2026-10-04, fifth research pass).

- Service: `handover.py`, gateway `count_owned` / `reassign_owned` (one UPDATE per kind in
  one transaction, from a fixed list of tables and owner columns; names checked as
  identifiers, values bound), the offboarding checklist's new step, the exit reason
  `OWNER_LEFT`. Tests in `tests/test_hq_handover.py` (4). No migration.
- Deactivating someone never moved their work, and a running sequence keeps its own
  sending identity: moving only an enrolment's owner would have gone on writing to
  prospects from the leaver's mailbox. The handover swaps the identity or ends the
  sequence.
- The mock's offboarding steps had drifted from the service's (it lacked the intake-key
  rotation step); both lists now match, with the handover step second.
- The harness reaches a leaver with work through a test-only mock route,
  `mock/give-work` (beside `mock/reset`), and the part is `HQ_HARNESS_FLOW=handover`.
- The team member page already shows a fresh-code gate to admins at the top; the
  handover section uses it rather than a second gate (one `#sudo-code` per page).

**Before that: find and create** (2026-10-04, fifth research pass).

- Service: `search_routes.py` (`hq/search`, `hq/me/recent`), gateway `search_activities`,
  `search_leads` and `list_recent_reads`; no migration (the read log is 0030's). Tests in
  `tests/test_hq_search.py` (6).
- A search reads every kind the role may open, but a table that can be large (leads, notes)
  is asked in SQL for the query's longest word, at most 400 rows; the ranking then asks
  for every word. Other kinds are read whole and filtered, as their own lists already are.
- The mock now has `hq/search` and `hq/me/recent` mirroring the ranking; the harness part is
  `HQ_HARNESS_FLOW=find` (palette before typing and after, the results page, one kind,
  New company from ⌘K, the single-key switch, a favourite restored from the account).
- Favourites and the single-key switch ride the existing preferences route
  (`hq-favourites`, `hq-single-keys`); a preference holds 2,000 characters, so the
  account copy of the favourites trims labels and drops the oldest past that.
- The 2026-10-04 walks before this wave: desktop 789 checks and phone 789, clean, on the
  batch through the imports; HQ pushed after them.
- The harness had never shot ⌘K open, so the palette's markup had never met axe: options
  (buttons) inside list items inside a listbox failed three critical rules on every
  open. It is now the grouped listbox of the WAI-ARIA practices — the input a combobox
  with `aria-activedescendant`, `role="group"` sections labelled by a presentation item,
  `li role="option"` rows. Its 46px input row was a shrinkable flex item, squeezed to
  20px by a long list; the input and footer no longer shrink.
- The search highlight was light text on bright amber (1.65:1); it is weight and the faint
  accent wash on the text's own colour. A count inside the selected kind takes the
  link's colour (quiet grey on the wash was 4.43:1).
- A flow that picks a palette row must match its title exactly: "See all results for
  “new company”" contains "New company" (Playwright's `hasText` ignores case).

**Before that: imports of companies and people** (2026-10-04, fifth research pass).

- Service `43a98d9` (the company insert), `56be588` (0071 imports), `6e6420a` (repeats
  counted), local. Service suite 2,136 passed, 4 skipped (`tests/test_hq_record_imports.py`
  10, `tests/test_hq_sql_statement_shapes.py` 3).
- Since 0023, `insert_company` named fifteen columns and gave fourteen values: every
  company create, import and lead conversion would have failed on SQL, and the fake
  (dictionaries) never noticed. `tests/test_hq_sql_statement_shapes.py` now reads every
  statement the SQL gateway builds: as many values as columns, as many parameters as
  placeholders (statements built from a joined list are skipped, not guessed).
- The mock matched routes in array order, so `hq/companies/imports` read as the company
  whose id is "imports"; it now matches an exact route before a pattern, as the
  service's route table does.
- A file's in-file repeats are caught by the page before sending; the first part tells
  the service how many (`repeats`) so the ledger line adds up to the file.
- The left-out rows are a list, not a table: on a phone the reason stacks under the row
  instead of sitting off-screen in a scrolling frame.
- The portal half was written in a copy of HQ under the scratchpad (node_modules and the
  product checkout symlinked beside it) while the desktop walk held the real tree, and
  synced with `rsync -a --delete` excluding `.git`, `node_modules`, `.next`,
  `test-results`, `next-env.d.ts`, `.env.local` and `tsconfig.tsbuildinfo`.
- The desktop walk on batch 2 stopped once at the inspection forecast form (10 s wait)
  with load near 20 from type-checks and tests run beside it: run walks alone.

**Before that: a person's data file, archive, share and quote links** (2026-10-04, fifth
research pass).

- Service `a2e4ba7` (a person's data), `a5de21b` (archive), `1083f4b` (0070 share),
  `e12c90f` (quote links), `780c555` (archived_at on the views), local. Service suite
  2,123 passed, 4 skipped (`tests/test_hq_privacy_package.py` 3, `test_hq_archive.py` 5,
  `test_hq_share.py` 3, `test_hq_quote_links.py` 7).
- HQ `b1cdd5b` (the data file) and `dd81dfe` (archive, share, quote links, outside links),
  committed locally; they go out with `5b78940`, `d324324` and `e129302` once a full walk
  per width passes. Portal gates: `npm run validate` green; the parts
  `HQ_HARNESS_FLOW=archive`, `=share` and `=quotelink` at both widths in both themes.
- `HQ_HARNESS_WIDTHS` takes the viewport's name (`desktop`, `phone`), not a pixel width:
  `=412` matches nothing, captures nothing and still prints "All screens captured
  cleanly". Check the ✓ lines before believing a part passed.
- The Product screens need the console's mock on 7072 (`MOCK_PORT=7072 npm run mock:api`
  in the console repo): without it the full desktop walk fails there, not in HQ.
- A walk beside a pytest run or with macOS's sync daemons busy (load above ~8) times out
  on cold compiles: run walks alone, `nice`d, and rerun a lone failure by itself first.
- Migration 0070 also widens `CK_hq_notifications_reason`: 0067's `signal` notices would
  have been refused by SQL in production (the fake never checked the constraint). A test
  now reads every reason the code writes against the migrations' check lists.
- The portal's approval schema lacked `write_off`: one waiting write-off broke the
  approvals list and the backup request. It now parses every kind the service has.
- The public quote page is `/q/<token>` (in `route-policy.ts`); a token is never put in an
  address unescaped (`encodeURIComponent` into a named const, which route parity reads).
- The signed copy's reference ends in a 64-character fingerprint with no spaces: the order
  form's signature lines wrap anywhere, or the page is 140px wider than a phone.
- A record header's popover hangs from its trigger; on a phone it spans the header (as the
  page bar's and the list tools' do), or Share opens 191px past the edge.

**Before that: exports of a view and the backup** (2026-10-03, fifth research pass).

- Service `f4fda0d` (exports of a view), `b6c2d06` (0069 backup), local. Service suite
  2,105 passed, 4 skipped (`tests/test_hq_export_views.py` 6, `tests/test_hq_backup.py` 4).
- HQ `5b78940`, `e129302`, committed locally and pushed with the batch once a full walk
  per width passes. Portal gates: format, lint, types, 369 tests, the build; the parts
  `HQ_HARNESS_FLOW=exports` (a view's CSV holds the screen's rows in its order) and
  `=backup` at both widths in both themes.
- Another session is working in the product repo (theses, the watch, overnight): stage
  only HQ's files there, by name.
- Turbopack will not follow a `node_modules` symlink out of the project, so a scratch copy
  of HQ can type-check and test but cannot run the dev server; run waves in the real tree.
- After hours of edits the dev server's hot reload can panic and reload a page in a loop
  (a flow then "misses" a redraw that did happen): restart it before a harness part.
- A form whose success changes what the page shows (a backup request becomes the waiting
  request) is gone before its "Sent" line can show: a flow waits for the new state.
- The mock's other Owners (`newbie@`, `newbie2@`) have no authenticator, so nobody can
  sign in to approve: `POST /api/v1/mock/approve-pending {kind}` approves the newest
  waiting request as the service would (test-only, outside `hq/`).

**As of target accounts, signs of interest and web push** (2026-10-03).

- Service `3a67fb4` (0066 target accounts), `86b8a5c` (0067 signs of interest), `d4fc421`
  (0068 web push), local; HQ: three commits, pushed. Service suite 2,095 passed, 4 skipped
  (`tests/test_hq_targets.py` 3, `tests/test_hq_signals.py` 5, `tests/test_hq_push.py` 4).
- Portal gates: format, lint, types, 367 tests, the build; the parts
  `HQ_HARNESS_FLOW=targets`, `=signals` and `=push` at both widths in both themes; then one
  full walk per width over the three waves on fresh servers: desktop 740 checks and
  phone 740, both clean. Written stacked in three copies of HQ, as the waves before.
- Push needs the founders to set `QT_HQ_VAPID_*` (`docs/HQ_GO_LIVE.md` §2); until then the
  page says push is not set up. An iPhone takes push only from HQ added to its home screen.
- A RecordSection's id is on its heading: a flow found the `h2`, not the section, and
  waited thirty seconds for a button inside it (trap 9 again).
- `'strict-dynamic'` in the script policy refuses a service worker unless `worker-src`
  names it; the proxy lets the manifest, the worker and the icons through without a session.

**Before that: attribution, the priority inbox and sequence branches** (2026-10-03).

- Service `85603de` + `706c2b5` (attribution), `06f489d` + `55a332f` (0064 priority inbox),
  `386c360` + `40ab298` (0065 sequence branches), local; HQ: three commits, pushed. Service
  suite 2,083 passed, 4 skipped (`tests/test_hq_attribution.py` 6,
  `tests/test_hq_priority_inbox.py` 5, `tests/test_hq_sequence_branches.py` 5).
- Portal gates: format, lint, types, 364 tests, the build; the parts
  `HQ_HARNESS_FLOW=inbox` and `=branches` at both widths in both themes; then one full walk
  per width over the three waves together, on fresh servers: desktop 719 checks and phone
  719, both clean. The three waves were written stacked, each in its own copy of HQ
  (attribution, then priority on top, then branches on top), and committed one after
  another from those copies.
- The service's samples gained `hq/targets` (the next wave) before the portal reads it:
  until that wave lands, the contract test names it as sampled and unparsed.
- React resets a `<form action>` once its action succeeds: a controlled checkbox or radio
  then shows what the server first drew while the state holds the choice, and an
  uncontrolled select goes back to the value it was first drawn with. Forms whose choices
  must stay send from `onSubmit` (`src/lib/forms/submit-without-reset.ts`); the branch
  select is keyed by its saved value instead, so its "Saved." stays.
- Playwright's `goto` to the same address with only a hash does not reload the page: a
  probe that "reloaded" that way read the old DOM.
- `.num` sets tabular digits; `.data-table__num` also aligns right under an `end` heading.

**Before that: the weekly review, triage and nurture** (2026-10-03).

- Service `a85aed9` + `a3cf2f3` (0062 weekly review), `b7fc52f` (0063 nurture), `3cf3dbb`
  (a lead's own look-alikes), local; HQ: the commit adding this, pushed. Service suite
  2,068 passed, 4 skipped (`tests/test_hq_review.py` 9, `tests/test_hq_nurture.py` 5).
- Portal gates: format, lint, types, 358 tests (the contract parses a sampled review; the
  lists' filter fields now include "nurturing" and "nurture_days"), the build; the parts
  `HQ_HARNESS_FLOW=review` and `=triage` at both widths in both themes; then the full walk
  one width at a time on fresh servers: desktop 699 checks and phone 699, both clean.
- These two waves were written while the previous wave's walks held the real tree: each
  was staged as a patch, checked on an rsync'd copy of HQ (node_modules and the product
  checkout symlinked beside it, so parity and the payload contract ran for real), and
  applied after the previous commit.
- Today falls on a quarter's first days: the review's default week (the last complete
  one) belongs to the quarter before. A health given from the review is now recorded for
  the week under review, not the calendar's; the page links to this quarter's
  priorities; the mock seeds its priorities in the review week's quarter.
- The week navigation did not wrap: four items ran 6px past a phone. It wraps.
- Triage's `1` submits a form that needs no word more (a hidden input carries the key);
  `3` and `h` put the cursor in the reason and the date; the round's dealt-with leads
  travel in `?skip=`.

**Before that: data quality** (2026-10-03).

- Service `ba1a085` (0061) and `8de47c5`, local; HQ: the commit adding this, pushed. The
  service's suite with `tests/test_hq_data_quality.py` (13) and the samples regenerated
  (a look-alike group with a CRM person, a merge preview, a folded lead, the health page,
  a tidy-up preview).
- Portal gates: format, lint, types, 357 tests (the contract parses every new read), the
  build; the part (`HQ_HARNESS_FLOW=quality`) at both widths in both themes; then the
  full walk one width at a time on fresh servers: desktop 683 checks and phone 683, both
  clean (the first desktop run stopped on the DNS wait below; fixed, then rerun whole).
- Sending-domain DNS ran inside the Mailboxes render, so each action there waited on it
  too: fifteen seconds once when the resolver was slow (Node's resolver tries every
  nameserver per try, so its own timeout bounds nothing). Each domain check now has an
  overall three-second deadline (`src/lib/mail/domain-records.ts`).
- The flow works its own seeded records (Arjun Nair twice, Elena Marsh) so the screens
  keep theirs through both theme passes, and it tidies the countries, not the names, so
  the light pass still has a names preview to show. A later pass finds its work settled.
- A figure table at phone width showed only its first column without scrolling sideways:
  the health page is a list that names each figure under its check on a phone. A readout
  label longer than half a phone row ran into its neighbour ("To put right" now).
- The cold rules read "IN" as "In", a country nobody had decided, and held Indian
  prospects: the alias table carries the ISO codes, except those a cell might mean
  otherwise ("no", "na", "it", "is", "be", "at", "id", "my", "me") and "sa" (two
  countries).
- The mock's seeded person ids are not GUID-shaped ("p0000000-…"): a mock route must not
  refuse an id its own seed uses; the service checks the shape, and real ids pass it.
- A merge never folds someone who wrote in and is still owed a reply into a prospect, and
  "they are this person" refuses them too: converting keeps the reply they are owed.

**Before that: lead jobs, domain health and referrals** (2026-10-03).

- Service `bb87e70` (0059 lead jobs), `0c4ae63` (0060 mailbox events), `4b3bded` (referrals),
  local; HQ: the commit adding this, pushed. Service suite 2,027 passed, 4 skipped.
- Portal gates: format, lint, types, 348 tests (the contract reads `hq/leads/jobs` and a
  job, and a reply that names a colleague), the build; the full walk one width at a time
  on freshly started servers: desktop 664 checks and phone 664, both clean.
- The portal does a change to an unfiltered list on purpose never: the harness drives a
  background change through a filter every prospect passes (`tags:nhas:never`). The mock
  works 100 leads a slice (the service 1,000 inside a time budget) so a watcher sees it move.
- DNS on every render made every action on Mailboxes wait seconds (the harness timed out
  waiting for "Connected"): the records are cached per domain (ten minutes, one when a
  lookup failed) and the domains table is its own async component inside `<Suspense>`.
- Node says ENOTFOUND for a missing domain and for a missing name under a real one: "not
  in DNS at all" is decided only when the domain's own TXT and MX both say so.
- The mailbox row's actions are Pause/Resume and Change; "Check it signs in" and "Read
  its replies now" live in the Change panel (four buttons in the row ran past the table's
  edge — tables never truncate).

**Before that: replies** (2026-10-03).

- Replies: service `138b633` (0058), local; HQ: the commit adding this, pushed. Mailboxes
  went out before it: service `10dca9c` + `f8d24ee`, HQ `9fd465e`.
- Gates: the service's whole suite (2,018 passed, 4 skipped; `tests/test_hq_mail_replies.py`
  has 19, the IMAP reader against a fake server included); the portal's format, lint,
  types, 342 tests (the payload contract parses a sampled reply) and the build; the
  Replies and Mailboxes screens and the mailboxes flow (now reading the owner's mailbox and
  recording the answer waiting in it) at both widths in both themes; the full walk one
  width at a time on fresh servers: desktop 662 checks and phone 662, both clean.
- No test or mock ever opens a real inbox: the test world installs `MemoryMailboxInbox`
  (`mailbox_inbox.INBOX_FACTORY`) beside the memory transport, and so must any new test
  that runs the worker with a mailbox — otherwise the pass tries a real IMAP connection.
- The mock seeds three prospects written to from `owner@quantifyterminal.co`: one answered
  (open, "Record: Replied, interested"), one out of the office (settled, paused to a date),
  and one whose answer ("Not right now…") waits in the mailbox's inbox for the next read —
  the harness reads it with "Read replies" and records it; later passes find it settled.
- A first read of a mailbox looks back to the day it was connected and then counts on
  from UIDNEXT. Storing "0 read" as None made every later read a date search; never let
  an empty first read leave the cursor unset.
- A bounce is applied only to the address the notice names, and only when that is the
  address of the message it returns; a colleague's "remove me" only pauses.

**Before that: connected mailboxes** (2026-10-03).

- Mailboxes: service `10dca9c` (0057) and `f8d24ee` (the add refuses a server that
  answers nothing; a non-prospect segment's drain is paced by its cap), local; HQ: the
  commit adding this, pushed.
- Gates: the service's whole suite (1,999 passed, 4 skipped); the portal's format, lint,
  types, 342 tests (the payload contract reads `hq/mailboxes` and a sender of kind
  `mailbox`) and the build; the full walk one width at a time on freshly started servers —
  desktop 659 checks clean, phone 659 with one finding (the Mail overview put a resting
  mailbox's block reason inside a pill that does not wrap, 63px past the edge and one
  contrast node), fixed and that page re-checked at 412px in both themes.
- Connecting starts from the address: the portal reads the domain's MX records (Node's
  resolver, `src/lib/mail/mail-host.ts`) — Google or Microsoft go to their consent screen,
  any other host comes back to the server form (`?add=`), filled in for Zoho
  (`smtppro.zoho.<region>`, 465). The UI names no host; the address decides. The harness
  uses `harness.desk@gmail.com` for the consent path (only gmail.com's MX is looked up;
  nothing is ever sent) and `harness.desk@quantifyterminal.com` for the server path.
- The mock's consent stand-in signs in as the address it was asked for; its servers refuse
  a password containing "wrong" and answer nothing at a host starting `nowhere.`.
- A form whose act removes it (declaring a mailbox warm, disconnecting one) loses its
  "sent" line with it: the panel keeps a card that states the new fact, and the harness
  waits for that fact.
- Going from one record's panel to another's by a link: the old panel's form, with the
  same ids, is still on the page until navigation lands. Wait for the heading that names
  the new record before filling anything.
- A new sender kind (or any new enum value the service can return) must reach every zod
  enum that parses it the same day: every mail page that lists or picks a sender parses
  the whole list.

**Before that: the send programme** (2026-10-03).

- Prospects: service `54f10c5` (0054), HQ `5e721dd`. Cold mail: service `1a9d17c` (0055)
  and `470125c`, HQ `30e7d1c`. Send programme: service `1015aaf` (0056), `37e4553` and
  `9eaf501`; HQ `ce028d8`. Service commits are local; HQ is pushed.
- Gates for the send programme: the service's whole suite (1,980 passed, 4 skipped); the
  portal's format, lint, types, 336 tests and the build; the harness for every mail, lead
  and prospect screen with the prospects flow (228 checks) and the mail flow, at both
  widths in both themes. The full walk ran on the cold-mail commit, one width at a time:
  desktop 627 checks and phone 627 checks, both clean. Run the full walk again before the
  next wave's commit (`HQ_HARNESS_WIDTHS=desktop`, then `phone`, each on freshly started
  servers).
- Background tasks die at two hours: the dev server, both mocks and a full walk with them.
  Start the servers fresh before a full walk. A killed mock loses an imported real file
  (re-import with the e2e script).
- `next build` while `next dev` runs leaves the dev server serving stale chunks: restart
  the dev server after any build and before the harness.
- The mock's seed resets every array it fills (`seedMail` clears the feeds too). A new
  store added to the mock must be cleared there, or each harness pass that reseeds piles
  up rows with the same ids and React reports duplicate keys.
- A popover in a record header's actions opens leftwards under the rail at 1440px and the
  rail takes the click: actions that need a form live in the side column (the next slice
  is a side panel, not a header popover).
- Reading a background pytest file: the wrapper's last line is "[exited with code 0]"
  whatever pytest said. Grep the summary line ("passed", "failed") before believing it.
- The seeded demo has a programme to look at: "Indian PMS, verified" (segment), "Indian PMS
  introduction · part 1" (sent, results by country) and "· part 2" (its next slice, a
  draft), and a paused daily feed on "Fund intro — four steps".
- The seeded demo prospects are mostly unverified, so Sending rules shows most of them
  held as NOT_VERIFIED: that is the honest state, not a defect.
- The harness can run one part (`HQ_HARNESS_PAGES`, `HQ_HARNESS_FLOW`) or one width
  (`HQ_HARNESS_WIDTHS`). Quote URLs in zsh: a bare `?` is a glob.
- `scripts/e2e-leads-import.ts` with the real file
  (`~/Documents/QT Leads/00_ALL_LEADS/all_leads.csv`) loads all 22,983 leads into the
  running mock in about two seconds; a mock restart or a harness run empties them again.
- Restart the mock after any edit to it: a mock on old code answers without the new
  fields and every page that needs them reads "could not be read just now".

**Before that: Product: the console's administration, moved here** (2026-10-01).

- Product wave: service `e8efead` + `f79dfaf` (local; 0052 unapplied), HQ and the console
  each one commit. Before anyone uses Product for real, an Owner links each staff member's
  Quantify Terminal account on their staff record (product repo `docs/HQ_GO_LIVE.md`). The
  harness walks the fourteen Product screens only with the console's mock on 7072.
- Harness 24: 720 checks clean — every desktop screen in both themes (the fourteen Product
  screens and the intern's refusal included) and the phone pass as far as Privacy, where the
  dev server reached the background-task time limit and stopped. The Product screens were
  then checked alone at 412px in both themes (axe and overflow): clean. The mail flow's
  campaign start now accepts a campaign already Sent: when every recipient is inside their
  window the mock sends the lot at once and there is no Pause to wait for (an hour-of-day
  flake, not a regression).
- The Turbopack dev cache under `.next/dev/cache` grew to 7.8 GB and the dev server
  panicked ("Restore of All … failed") and then hung mid-compile at 0% CPU: stop it, delete
  `.next/dev/cache` (and `.next/dev/lock`), start again, and expect the first harness pass
  to compile every page cold.

**Before that: documents: print, export and the company's particulars.**

- Documents wave: service `6503188` (no migration), HQ `7374fd8`. Harness 23: both desktop
  passes clean (783 checks, the new export menu, one real file per format by its first
  bytes, two printed pages); the phone pass stopped at two load flakes in older flows
  (a resolved incident's form, the rules form), each rerun alone at 412px twice and clean. Before
  any document leaves for real, an owner fills System → Company (product repo
  `docs/HQ_GO_LIVE.md` §7a). The PDF typefaces live in `assets/pdf-fonts` (static instances
  cut with fontTools from the Google Fonts sources; regenerate the same way if a glyph is
  missing — Devanagari would need shaping pdf-lib does not do, so the PDF says how many
  characters it could not draw and the CSV/Excel carry them).

**Before that: the end of the suite's leftovers.**

- HQ repo: references, reviews, the changelog and the help centre `d585ecb`; the control
  map, the trust centre, finance part three and hiring go out in the commit after it
  (harness 22: 1,077 checks; its three findings — a link inside muted text on the purchases
  page, axe `link-in-text-block` — fixed with `.text-link` and re-checked with axe in both
  themes at both widths). `npm run validate` is green with no forward dependency left.
  `next-env.d.ts` shows modified after every `next dev`; never commit it. `.env.local`
  (HQ_DEV_AUTOLOGIN) never committed.
- Product repo, local only: Security 3 `b1ee121`, AI `c90131c`, platform part one
  `e72b9f0`, Trust `78b045e` + `5f3dae1`, index guards `d3f30d0`, custom fields `b6133b4` +
  `d9b3322`, automations `50c7019`, digests `4124222`, finance part two `e4555ac`, quotes and
  action plans `6df204a` (0045), references and business reviews `ee7383f` (0046), the
  changelog and the help centre `a7718d1` (0047), the control map and auditor links
  `ea957a2` (0048), the public trust centre `af7c7ae` (0049), finance part three `0e2ef22`
  (0050), hiring `bbb4c7d` (0051), the go-live runbook `d528117`. Run every file that
  imports `account_api`, not only `tests/test_hq_*.py` (1,865 pass; never with
  `-p no:logging`, which breaks the `caplog` tests). Uncommitted and not ours: the theses tab,
  `app_manager`, examiner, memory service, `tests/_fabric_coverage_test.db` — never stage.
- Migrations 0006–0051 unapplied (production blocked on Azure). 0042 adds a nightly timer,
  `hq_automation_sweeper` (04:11 UTC), for date triggers; 0043 an hourly one,
  `hq_digest_worker` (:07), which posts due digests to the portal's `/api/digests/render`
  with the portal key — so `QT_HQ_PORTAL_KEY` / `HQ_ACCOUNT_API_PORTAL_KEY` and
  `QT_HQ_PUBLIC_SITE_URL` must be set before digests can send.
- Public pages the portal serves without a session: `/status`, `/changelog`, `/trust-centre`,
  `/careers`, `/audit/[token]` (an auditor's expiring link) and `/verify/*`; each is in
  `src/lib/auth/route-policy.ts`, and `docs/HQ_GO_LIVE.md` §9a in the product repo says what
  to publish before linking them.
- Local run: the console's dev server holds port 3000; HQ runs on 3001 with
  `PORT=3001 NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3001 npx next dev -p 3001`, the mock with
  `MOCK_AI=1 HQ_UI_BASE=http://127.0.0.1:3001 npm run mock:hq` (port 7071; `MOCK_AI=1` puts a
  deterministic stand-in behind the AI routes for the harness — without it the mock says "not
  configured", as production does; without `HQ_UI_BASE` the calendar step times out; restart
  the mock after any edit — tsx does not reload), the harness with
  `HQ_UI_BASE=http://127.0.0.1:3001 npm run check:hq-ui`. If `next dev` fails with "Failed to
  open database … Unexpected file … CURRENT 2", cloud sync duplicated a cache file: stop the
  server and delete `.next` (build output only). Cloud sync also leaves `.next 2/` beside it,
  which fails `prettier --check`: delete it. Restart the dev server after `npm run build`.
  Warm new routes with curl first (`-L -c /tmp/hq-cookies -b /tmp/hq-cookies`); in zsh never
  name a loop variable `path` (it is `$PATH`). Run the harness with nothing heavy beside it.
  A harness step that waits for a form's "sent" line fails when the act removes the form (a
  fixed finding has no fix form): wait for the state the act produces instead. The running
  mock and harness have loaded their code, so `scripts/` can be edited while a harness runs;
  `src/` cannot.
- The mock's custom fields and automations blocks wrap the four record types' existing
  handlers (checked before, written after, triggers fired, values added to lists and
  records) rather than editing each; the automations block sits after the custom fields
  block because it reuses `cfWrap`. The mock's route-parity test reads `pattern:` strings
  literally: two routes sharing a handler are two entries, never a ternary.
- **Next step:** the third research pass and its leftovers are built. What is left is
  production (§6) and the website: once HQ is live, point the website's careers and
  early-access forms at HQ (`/careers`, the intake key) — the founder publishes the site.
  Further work is taken up as the team asks; §5 lists what is deliberately left.
