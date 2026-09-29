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
| **Product / service** (Python Azure Functions) | `~/Documents/Projects/Quantify Terminal` → `cloud/azure/account_function/` — commits stay LOCAL (never pushed unless asked) | `account_api/hq/*` routes, `schema/migrations/0007–0018`, `tests/test_hq_api.py` (HQ suite) and `tests/test_hq_payload_samples.py` (writes the payload fixture the portal's contract test reads), `docs/HQ_GO_LIVE.md` (the production switch-on checklist) |

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
- **The harness is the gate** (`npm run check:hq-ui`, ~5 min, 202 screens, axe serious /
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

| Wave           | What                                                                                                                                                                                                                                                                                                         | Where                                                                                                                       | Commits                                               |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------- |
| Lists          | sortable headers, `x` / shift-click selection with a bulk bar (owner, lifecycle), removable filter chips, per-device saved views; Won/Lost views open as a table                                                                                                                                             | companies, leads, deals                                                                                                     | HQ `b39dfbf`, `4586571`                               |
| Analytics 2    | quarterly logo cohorts, expansion / contraction / churn / reactivation rates, net churn, GRR beside NRR, MRR lost by reason, per-customer trend                                                                                                                                                              | `/revenue/mrr`                                                                                                              | HQ `391d4ee`                                          |
| Desk & details | desk keys `r n a s p t z`, `{{first_name                                                                                                                                                                                                                                                                     | there}}`reply variables, favourites (star → rail), stakeholder coverage + single-threaded warning,`close_overdue` deal flag | desk, records, rail                                   | HQ `e4aae34`; service `0ab9fc7` |
| Price list     | `hq_plans` (migration 0017), `plan_key` on deals/contracts, `hq/settings/plans/update`, deals and contracts priced from seats × rate held to the plan's minimum; settings section; keyed inputs; record-head popovers open right                                                                             | settings, deal/contract forms and records                                                                                   | HQ `09b6a04`; service `caeefd2`, `59db2c8`            |
| Renewal ledger | migration 0018 (status / confidence / renews-at / note / recorded by), `hq/contracts/{id}/renewal`, `hq/revenue/renewals` (window, six-month due vs forecast roll-up, dates passed), Home renewals section; `/revenue/renewals` page with bulk expectation; contract Renewal properties; Home "Renewal" rows | revenue, home                                                                                                               | service `58e403e`; HQ `9dd7ba4`                       |
| Field history  | every update's audit row carries `changes` (value before → after, per field); a History tab on company, person and contract records and a Changes tab on deals, read from `hq/audit` for roles with `audit:read`                                                                                             | records                                                                                                                     | service `b91e82a`; HQ: the commit that added this row |

## 5. Next, in order (from the research; each is a full wave: service + test + mock + portal + harness + commit)

1. **Support desk**: followers (internal watchers), ticket merge, auto-nudge/close of
   threads waiting on the customer (timer worker), SLA at-risk / breach notification to the
   assignee (mailer), fewest-open auto-assignment on create, quality metrics (reopens,
   resolved on first reply). S each; the worker and mail need the service's timers.
2. **Security quick wins**: HIBP k-anonymity breached-password check on set / reset;
   15-minute idle for owner / admin; security-event emails (password change, authenticator
   reset, recovery-code use, role change, key created); API key `expires_at` (180 days) and
   rotate-on-offboarding checklist item; SoD rules and orphan-grant detection in the access
   review; signed JSONL audit export. Then passkeys (WebAuthn) as a second factor — M.
3. **People-ops quick wins**: manager field and reporting line; asset register with return
   gating the offboarding clock; versioned policy acknowledgements; date reminders
   (probation end, engagement end); training records; 1:1 action items; emergency contacts.
4. **CRM**: CSV import with mapping / dedupe / summary; duplicate detection + merge;
   parent / child companies; stage-conversion funnel and time-in-stage report from
   `hq_deal_stage_events`; comments with @mentions; pipeline snapshots (nightly job).
5. **Lists**: peek pane, undo for bulk changes, display preferences kept server-side,
   grouping, a filter builder. Saved views shared with the team (server-side).

Deliberately **not** built, with the research's reasons: round-robin routing, CSAT
surveys, LTV, health scores, territories, automated email sequences, AI deal scores,
storing pay, IP allow-lists, whole-mailbox OAuth sync as step one, native mobile apps.

## 6. Blocked on the founder (production) — `docs/HQ_GO_LIVE.md` in the product repo

Azure subscription upgrade and cost fix → service settings (`QT_HQ_*`, portal key pair,
Turnstile) → apply migrations 0006–0018 and publish → move the desk onto SQL → Vercel
import + `hq.quantifyterminal.com` → bootstrap the first owner → run
`scripts/hq_go_live_check.py` → website form key → retire the console desk. GitHub
Actions on the account fails every run in seconds with no runner (billing) — only the
founder can fix.

---

## 7. Checkpoint — update at the end of every wave

**As of 2026-09-30, late evening.**

- HQ repo: `origin/main` HEAD carries field history (History / Changes tabs, `RecordHistory`,
  the mock's `changesBetween`, a `company-history` harness screen); working tree clean.
  Harness passed with 206 screens; `~/Downloads/HQ Portal screenshots 2026-09-29` refreshed.
- Product repo: HEAD `b91e82a` (field history); 159 tests pass; not pushed.
- **Next step:** §5 item 1, the support desk — followers, ticket merge, auto-nudge/close of
  threads waiting on the customer (timer worker), SLA at-risk / breach notification to the
  assignee, fewest-open assignment on create, reopen and resolved-on-first-reply metrics.
  Service first (routes + worker + tests), then the mock, then the desk UI.
