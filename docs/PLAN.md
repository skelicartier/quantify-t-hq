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
| **HQ portal** (Next.js 16, TypeScript)         | `~/Documents/Projects/HQ Quantify Terminal` — GitHub `aaryansaroha98/quantify-t-hq`, branch `main`, pushed                  | UI, server actions, zod API clients (`src/lib/api/*`), the mock service (`scripts/mock-hq-api.ts`), the screenshot harness, `docs/DESIGN.md` (the UI contract), `docs/RESEARCH-2026-09-30.md` (the research), this file                                     |
| **Product / service** (Python Azure Functions) | `~/Documents/Projects/Quantify Terminal` → `cloud/azure/account_function/` — commits stay LOCAL (never pushed unless asked) | `account_api/hq/*` routes, `schema/migrations/0007–0023`, `tests/test_hq_api.py` (HQ suite) and `tests/test_hq_payload_samples.py` (writes the payload fixture the portal's contract test reads), `docs/HQ_GO_LIVE.md` (the production switch-on checklist) |

## 2. Ground rules (do not relearn these)

- **Never** add "Co-Authored-By: Claude" or "Generated with Claude Code" to a commit or PR.
- Stage only the files of the task. In the product repo never stage the pre-existing
  uncommitted `src/intelligence/overnight/impact.py`, `src/ui/tabs/deep_research_tab.py`,
  `src/ui/tabs/pulse_tab.py`, `tests/_fabric_coverage_test.db`.
- `.env.local` is gitignored and must never be committed. It carries
  `HQ_DEV_AUTOLOGIN=owner@hq.test` (the test bypass; inert in a production build).
- **The mock must mirror the real routes** (route names, methods, payload shapes): the
  route-parity and payload-contract tests enforce it. Any new route = service handler +
  test + mock handler + portal client, in that order.
- **The harness is the gate** (`npm run check:hq-ui`, ~5 min, 212 screens, axe serious /
  critical = 0, no horizontal overflow, no console errors). Never edit files while it runs.
  Restart the dev server after any `next build`. Restart the mock after a seed change.
- Never name a data vendor in UI copy (copy-guard test). Tables never truncate data
  columns (a stat hint may ellipsise; keep hints under ~26 characters).
- Numbers: every metric is a plain ratio of figures on the page; tests work the arithmetic
  by hand first. No LTV (too little history), no health score presented as predictive, no
  NPS at this size, no annualised churn from a quiet month.
- Demo data in the mock uses REAL firm names with INVENTED contacts and the mock's own
  price list; never present it as customers.

## 3. Commands and gates

Portal (from the HQ repo):

```
npm run dev                                  # dev server on :3000 (expects the mock)
npm run mock:hq                              # mock service on :7071; POST /api/v1/mock/reset reseeds
npx tsc --noEmit -p tsconfig.json && npx eslint <paths> && npx prettier --write <paths>
npx vitest run                               # unit + route-parity + payload-contract tests
npm run check:hq-ui                          # the harness; output in test-results/hq/
npx tsx scripts/peek-hq.ts <outDir> owner@hq.test /path ...   # screenshots; HQ_PEEK_THEME=light HQ_PEEK_WIDTH=412 HQ_PEEK_AXE=1
```

Service (from the product repo root): `.venv/bin/python -m pytest tests/test_hq_api.py tests/test_hq_payload_samples.py -q` (the second writes `tests/fixtures/hq_payload_samples.json`, gitignored; rerun it after any payload change, then rerun the portal's vitest).

Personas: `owner@ admin@ sales@ support@ intern@ newbie@hq.test`, password `password-123`,
every TOTP prompt `000000`. Under the bypass, `/dev/signin?as=<persona>` switches; the
rail identity menu lists them.

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

| Wave          | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Where                                   | Commits                                                  |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | -------------------------------------------------------- |
| Desk: threads | followers (migration 0019, `hq/tickets/{id}/follow`, a Following queue filter that opens every status, `o` key, "Followed by …" in the head); merge (`hq/tickets/{id}/merge {into}`: messages in time order, tags + followers united, more urgent priority kept, duplicate resolved + tagged `merged`, notes both sides, refused when either side is resolved); reopen counting (by hand or by the customer writing again; "Reopened once" pill); weekly report "Support desk" card                                                                                                                                                                                                                                                                            | desk, reports                           | service `c90578c`; HQ `d4dea8a`                          |
| Desk: rules   | migration 0020 (`support_alerts` + `desk.*` settings); `desk_rules` / `desk_sweeper`: fewest-open assignment from an admin-chosen pool, one public "still there?" nudge, a public close a reply reopens, one mail per deadline to an assignee whose reply timer is at risk or breached; runs from the queue read when the last pass is > 15 min old + nightly at 03:51 (no quarter-hour timer: the serverless database's free hours); `hq/settings/desk/update`; Settings → Desk rules form; breadcrumb fix ("Ngs")                                                                                                                                                                                                                                            | settings, desk, `function_app.py` timer | service `c90578c`; HQ: the commit adding this            |
| Security      | breached-password check (HIBP k-anonymity; fails open; `QT_HQ_BREACH_CHECK=0` off) on invite / reset / change; owner and admin sessions idle out at 15 min (`hq/me.session_policy`); a role change mails the person, a minted key mails every owner; migration 0021 gives intake keys `expires_at` (180 days or less), expired keys are refused, the offboarding checklist gains "rotate the keys"; the access review names orphans, shared accounts and money separation-of-duties conflicts; `POST hq/audit/export` hands back a signed JSONL copy (digest + HMAC, audited first; `scripts/verify_hq_audit_export.py` checks it); Integrations shows expiry and a "Lives for" picker, Audit an "Export a signed copy" block                                  | auth, admin, access review              | service `4b239cf`; HQ: the commit adding this            |
| People ops    | migration 0022: manager / reporting line (no loops), probation end, emergency contact; asset register whose returns gate the offboarding step "Devices and materials returned"; versioned company policies acknowledged per version (publishing asks everyone again), acknowledged under My security, edited under Settings; training records with expiry; one-to-ones with actions (HR or the manager writes, the owner ticks); reminders within 60 days on the person and across the Team page                                                                                                                                                                                                                                                               | team, my security, settings             | service `ea4b7c7`; HQ: the commit adding this            |
| CRM structure | migration 0023: parent companies (no loops; the record names its parent, lists children and rolls the group's MRR up); company and person merge (sudo: every reference moves, blanks fill, stricter do-not-contact wins, notes keep provenance, the duplicate is archived and its domain / address released); duplicate suggestions by legal-form-stripped name and by person name or address; CSV import for companies and people (read in the browser, mapped, ≤ 500 rows, each validated, known records skipped and named, counts audited with a reason); @mentions in notes (a row on Home until seen, and a mail); the stage funnel (entered / moved on / lost / still here / conversion / median days) and the pipeline over time from nightly snapshots | companies, people, reports, home        | service `531e7b6`, `3c779d2`; HQ: the commit adding this |

## 5. Next, in order (from the research; each is a full wave: service + test + mock + portal + harness + commit)

1. **Lists**: peek pane, undo for bulk changes, display preferences kept server-side,
   grouping, a filter builder. Saved views shared with the team (server-side).

CRM items deliberately left: a three-way merge picker (three or more look-alikes are
merged one at a time from the kept record), import of deals or contracts (money is typed
against a plan, not pasted), mention autocomplete (the handle is a first name or a mail
name; unknown handles are left alone).

People-ops items deliberately left: an applicant pipeline (the careers form), an org
chart (the reporting line is a field, read on the record), and storing pay.

Security items deliberately left for their own wave: passkeys (WebAuthn) as a second
factor — M; dual control for owner grants and key creation; anomalous sign-in rules
(new country, velocity). A tamper-evident ledger (Azure SQL ledger tables) is a
production-side switch, not code.

Desk items deliberately left: email-to-ticket needs an MX record and an inbound secret
(founder), and the desk reads the customer's app version from the ticket, not live.

Deliberately **not** built, with the research's reasons: round-robin routing, CSAT
surveys, LTV, health scores, territories, automated email sequences, AI deal scores,
storing pay, IP allow-lists, whole-mailbox OAuth sync as step one, native mobile apps.

## 6. Blocked on the founder (production) — `docs/HQ_GO_LIVE.md` in the product repo

Azure subscription upgrade and cost fix → service settings (`QT_HQ_*`, portal key pair,
Turnstile) → apply migrations 0006–0023 and publish → move the desk onto SQL → Vercel
import + `hq.quantifyterminal.com` → bootstrap the first owner → run
`scripts/hq_go_live_check.py` → website form key → retire the console desk. GitHub
Actions on the account fails every run in seconds with no runner (billing) — only the
founder can fix.

---

## 7. Checkpoint — update at the end of every wave

**As of 2026-10-02, early hours.**

- HQ repo: `origin/main` HEAD carries the CRM structure wave (company Part of / Group /
  Merge; person Merge; Companies → Import and Duplicates; `/companies/import`,
  `/people/import`, `/companies/duplicates`; reports Pipeline over time and How the
  stages convert; Home "You were mentioned"; the CSV reader `src/lib/crm/csv.ts` with its
  test; the mock's merges, imports, duplicates, mentions, funnel, history and a seeded
  child company + mention); working tree clean. Harness passed with 212 screens;
  `~/Downloads/HQ Portal screenshots 2026-09-29` refreshed.
- Product repo: HEAD `adc4e38` (CRM structure `531e7b6` + `3c779d2`, then the lists
  wave's service side: migration 0024 `hq_saved_views` + `hq_preferences`, `view_routes.py`
  — `hq/views`, `hq/views/save`, `hq/views/{id}/delete`, `hq/preferences`,
  `hq/preferences/set`); 187 tests pass; not pushed. `docs/HQ_GO_LIVE.md` says 0006–0024.
- Reports: the funnel table is a full-width scrolling section and the pipeline chart labels
  month starts only, after a 13px phone overflow the harness caught.
- **Next step:** §5 item 1, the lists wave's portal side — saved views read from and saved to
  the service (shared with the team), column / density preferences synced to the account,
  a peek pane on list rows (`?peek=`), undo for bulk changes, grouping and a filter builder
  on the companies list; the mock mirrors `hq/views*` and `hq/preferences*`. Then passkeys.
