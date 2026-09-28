# Quantify Terminal HQ

The staff-only business-management portal: CRM, support desk, revenue, team and
administration, at `hq.quantifyterminal.com`. UI only — every read and write goes to
the Account API's `hq/*` route group (the product repo,
`cloud/azure/account_function/account_api/hq/`), server-side, with HQ's own cookies.

## Running it locally

```
npm run mock:hq      # terminal 1 — the mock service on 127.0.0.1:7071
npm run dev          # terminal 2 — the portal on 127.0.0.1:3000
```

Sign in as `owner@hq.test` (any password of 8+ characters); every authenticator
prompt accepts `000000`. `newbie@hq.test` walks the first-run enrollment.
`.env.local` points `HQ_ACCOUNT_API_BASE_URL` at the mock.

To skip sign-in while testing, set `HQ_DEV_AUTOLOGIN=owner@hq.test` in `.env.local`
and restart `npm run dev`: opening any page signs you in as that persona, and the
identity menu at the foot of the rail switches between Owner, Admin, Sales, Support
and the read-only Intern (`/dev/signin?as=sales@hq.test`). A production build ignores
the flag and the route does not exist.

## The gates

```
npm run validate     # format, lint, typecheck, unit + parity + copy-guard, build
npm run check:hq-ui  # signs in against the mock, walks every screen at two widths
                     # and two themes, asserts no overflow and no serious axe issues,
                     # writes test-results/hq/**.png for review
```

The route-parity test reads the service's own `HQ_HANDLERS` table from the sibling
checkout of the product repo and holds both the client and `scripts/mock-hq-api.ts`
to it: the mock mirrors the real table or the test goes red.

## Rules that are not up for debate

- Auth pages are always dark; the signed-in shell follows the theme cookie.
- Every server action re-checks origin, session, capability (and sudo) itself.
- A failed read never renders as an empty state.
- No backend vocabulary in copy (the copy-guard test enforces the list).
- No secret is ever configured on this app; the deployment gate refuses them.
