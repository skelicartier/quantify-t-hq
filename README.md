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

Product's screens read through the HQ mock from the console's mock on `127.0.0.1:7072`
(`MOCK_PORT=7072 npm run mock:api` in the console repository). Releases reads the release
function instead, and the HQ mock serves that too, under `/api`: add
`QT_UPDATE_DEPLOY_URL=http://127.0.0.1:7071` to `.env.local` and the screen lists what is
published, publishes, stops serving and rolls back against it. Without the line the
screen can only say the release service is not set up.

To skip sign-in while testing, set `HQ_DEV_AUTOLOGIN=owner@hq.test` in `.env.local`
and restart `npm run dev`: opening any page signs you in as that persona, and the
identity menu at the foot of the rail switches between Owner, Admin, Sales, Support
and the read-only Intern (`/dev/signin?as=sales@hq.test`). For those test personas the
confirm-it's-you window before sensitive changes (invites, roles, exports, corrections)
is granted automatically too, so nothing asks for a code. A production build ignores
the flag and the route does not exist.

## Mail merge

Mail → Mail merge sends one message, made out to each person on a list, from this computer
through the mail provider. It is a separate thing from Campaigns: those run on the service,
which is not live, so on a laptop they go nowhere.

```
npm run mail-merge   # terminal 3 — the sender; leave it running while mail goes out
```

`.env.local` names its socket (`HQ_MAIL_MERGE_SOCKET`). Unset, as on any deployed portal, the
tab and the screens are not there. The sender keeps its lists, the provider key and the
record of who was written to in `~/Library/Application Support/hq-mail-merge`, readable only
by this account, and never in the repository. It is for Owners and Admins.

Until a key is added under Setup every send is practice: each step runs and nothing leaves.
A field is a column in braces, `{Greeting}` or `{{first_name|there}}`. A real send needs the
key, a sender the provider has verified, a test of the exact words, no `[blank]` left in them
and the number of people typed. It stops at the day's limit and waits for Resume; a restart
brings it back paused and writes to nobody twice.

A mailing goes to everyone on its lists, to one column's value, or to only the people ticked
on its page. Addresses can be typed straight into a mailing, and anyone's words edited where
they sit. Whoever another mailing reached is left out unless that box is unticked; that
record is kept apart from the mailings, so deleting one forgets nothing.

`npm run check:mail-merge` walks all of it in a browser with a stand-in provider and invented
people. Run it against its own portal and sender, as `scripts/e2e-mail-merge.ts` explains,
never the real ones.

`MOCK_EMPTY_MAIL=1` in `.env.local` starts the mock with an empty Mail section, so a laptop
sending real mail is not looking at made-up campaigns. The harness begins with `mock/reset`,
which brings the demo mail back: restart the mock after a walk to empty it again.

## The gates

```
npm run validate     # format, lint, typecheck, unit + parity + copy-guard, build
npm run check:hq-ui  # signs in against the mock, walks every screen at two widths
                     # and two themes, asserts no overflow and no serious axe issues,
                     # writes test-results/hq/**.png for review
```

One part of the walk, at both widths and in both themes, in under a minute:
`HQ_HARNESS_FLOW=phone npm run check:hq-ui` (the phone layout, and a button's press
area), `HQ_HARNESS_FLOW=releases npm run check:hq-ui` (Releases, end to end); the
script's `FLOWS` table names the rest.

The route-parity test reads the service's own `HQ_HANDLERS` table from the sibling
checkout of the product repo and holds both the client and `scripts/mock-hq-api.ts`
to it: the mock mirrors the real table or the test goes red. With no checkout beside
this one (`../Quantify Terminal`), that test and the payload-contract tests skip, about
half the suite, and say so; a clone kept elsewhere wants a link of that name beside it.

## Rules that are not up for debate

- Auth pages are always dark; the signed-in shell follows the theme cookie.
- Every server action re-checks origin, session, capability (and sudo) itself.
- A failed read never renders as an empty state.
- No backend vocabulary in copy (the copy-guard test enforces the list).
- No secret is ever configured on this app; the deployment gate refuses them.
