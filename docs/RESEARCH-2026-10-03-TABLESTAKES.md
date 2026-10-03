# What every serious tool has: table stakes for HQ (fifth research pass, 2026-10-03)

The earlier passes asked what a CRM, a desk, outbound mail and the rest of a company's
operations need. This one asked a narrower question: **what does every serious piece of
business software ship as standard — the things a person moving to HQ from HubSpot,
Pipedrive, Attio, Zendesk or Linear would assume are there — and which of them does HQ
lack?** Export and sharing first, then everything else of that kind.

Four researchers each took one area across 17–21 products (HubSpot, Salesforce, Pipedrive,
Attio, Close, Zoho, Freshsales, Copper, Folk, Twenty, monday, Airtable, Notion, ClickUp,
Asana, Linear, Zendesk, Intercom, Front, Stripe, ChartMogul and others), from the vendors'
own help centres and changelogs: about 1,100 cited pages in all. A fifth read HQ itself —
the route table, the portal and this plan — so that every gap below is checked against
what exists, not remembered. The four reports are appended in full (§A–§D); each rates a
feature TABLE STAKES (nearly all have it), COMMON (many) or DIFFERENTIATOR (few).

Limits of the evidence: Salesforce's help site renders client-side and could not be read,
G2 and Capterra blocked automated reading, Pipedrive and monday rate-limited part-way, and
the shared web-search allowance ran out mid-pass, so later evidence came from fetching the
vendors' pages directly. Unverified claims are marked in the reports.

## 1. Where HQ already stands

HQ is ahead of most of the market on the things a fintech's reviewers ask about first:
dual control, break-glass accounts, read tripwires and decoys, canary rows in exported
files, formula-neutralised CSVs (only Attio offers this, and off by default), an export
quota with an owner's lift, a signed audit export, passkeys, a privacy desk on the
statutory clock, consent and suppression across outbound mail, and the trust registers.
Those are differentiators elsewhere; here they are built.

The gaps are the everyday, unglamorous things every tool has: getting data out the way a
person sees it, putting a record back, a file on a record, a link to send a colleague.

## 2. The gaps, area by area

`HAS` built to the market's bar · `WEAK` built, short of the bar in the way named ·
`LACKS` not built. The rating is the market's (§A–§D).

### Data in, out and sharing (§A)

| Feature                                                            | Market         | HQ                   | What is short                                                    |
| ------------------------------------------------------------------ | -------------- | -------------------- | ---------------------------------------------------------------- |
| Export the view on screen (filters, sort, columns, IDs)            | TABLE STAKES   | **HAS (2026-10-03)** | was every record, fixed columns, no custom fields                |
| CSV and spreadsheet                                                | TABLE STAKES   | HAS                  | —                                                                |
| Export as its own permission                                       | TABLE STAKES   | HAS                  | `crm:export`, Owner and Admin only                               |
| "Export everything" backup with stated exclusions                  | TABLE STAKES   | **HAS (2026-10-03)** | —                                                                |
| Background export job with an expiring link                        | TABLE STAKES   | WEAK                 | synchronous download; right at HQ's size, revisit past ~50k rows |
| Scheduled report email                                             | TABLE STAKES   | WEAK                 | digests mail 50 rows of a saved view, no file                    |
| Import with mapping, upsert, error file, history, undo             | TABLE STAKES   | WEAK                 | leads have all of it; companies and people have mapping only     |
| Owner on import, matched by email                                  | TABLE STAKES   | LACKS                |                                                                  |
| Copy a link to a record; send it to a colleague                    | TABLE STAKES   | LACKS                | URLs are stable, but nothing copies or sends one                 |
| Saved views shared with the team                                   | TABLE STAKES   | HAS                  | private or team; not named people                                |
| One person's data for a privacy request                            | COMMON         | WEAK                 | the desk finds what HQ holds; it never makes the file            |
| Undo an import                                                     | COMMON         | WEAK                 | leads only                                                       |
| Preview before an import commits                                   | COMMON         | WEAK                 | leads only                                                       |
| Print or PDF of a record                                           | COMMON         | HAS                  | the browser's print with the letterhead                          |
| Documents from templates with merge fields                         | COMMON         | WEAK                 | the quote's order form only                                      |
| A customer-facing link (a quote to accept), expiring and revocable | COMMON         | LACKS                | auditor links only                                               |
| One place to see and revoke every live external link               | DIFFERENTIATOR | LACKS                | auditor links have their own list                                |
| Formula-injection protection                                       | DIFFERENTIATOR | HAS                  | on by default                                                    |
| Export approval / quota                                            | DIFFERENTIATOR | HAS                  | quota with lift; backups take a second Owner                     |

### Data safety, governance and administration (§B)

| Feature                                   | Market                    | HQ          | What is short                                                                                           |
| ----------------------------------------- | ------------------------- | ----------- | ------------------------------------------------------------------------------------------------------- |
| Trash / restore window                    | TABLE STAKES              | LACKS       | nothing is deleted, but nothing can be archived and put back either (merge archives; no button, no bin) |
| Undo a single change                      | COMMON                    | LACKS       | bulk undo on the page only                                                                              |
| Field history on every object             | TABLE STAKES              | WEAK        | companies, people, contracts, deals; not leads, tickets, meetings, tasks                                |
| Put a previous value back                 | DIFFERENTIATOR            | LACKS       |                                                                                                         |
| Audit log with date and text search       | TABLE STAKES              | WEAK        | staff, action and entity filters only                                                                   |
| Roles; custom roles                       | TABLE STAKES / COMMON     | HAS / LACKS | five roles; custom roles not wanted at this size                                                        |
| Record-level access                       | TABLE STAKES (CRMs)       | LACKS       | everyone with `crm:read` reads every record                                                             |
| Enforced MFA, passkeys, sessions, devices | TABLE STAKES              | HAS         |                                                                                                         |
| Offboarding: transfer a leaver's work     | TABLE STAKES              | WEAK        | the checklist exists; ownership moves by hand                                                           |
| Log in as a user, with consent            | COMMON                    | LACKS       |                                                                                                         |
| Retention and erasure                     | COMMON                    | HAS         | leads, read logs, applicants; erasure on the desk                                                       |
| Signed webhooks with retries              | TABLE STAKES              | HAS         |                                                                                                         |
| SSO / SCIM / IP allowlists                | TABLE STAKES (enterprise) | LACKS       | deliberately, §4                                                                                        |

### Everyday productivity (§C)

| Feature                                                | Market                | HQ    | What is short                                                          |
| ------------------------------------------------------ | --------------------- | ----- | ---------------------------------------------------------------------- |
| Global search inside notes, tasks, meetings, contracts | TABLE STAKES          | WEAK  | ⌘K searches five record kinds by name only, five each, no results page |
| Recently viewed                                        | TABLE STAKES          | WEAK  | the palette's last five picks, on the device                           |
| Favourites                                             | TABLE STAKES          | WEAK  | on the device only                                                     |
| Create from anywhere                                   | COMMON                | LACKS |                                                                        |
| Single-key shortcuts can be turned off (WCAG 2.1.4)    | TABLE STAKES (a11y)   | LACKS |                                                                        |
| Select all matching, bulk edit                         | TABLE STAKES          | WEAK  | a page's selection; a whole view only on prospects                     |
| Filter builder with OR and relative dates              | TABLE STAKES          | WEAK  | AND only, no "in the last N days"                                      |
| Attachments on records                                 | TABLE STAKES          | LACKS | no file anywhere in HQ                                                 |
| Recurring tasks; due reminders                         | COMMON / TABLE STAKES | LACKS |                                                                        |
| Presence on a ticket ("Ana is replying")               | TABLE STAKES (desks)  | LACKS |                                                                        |
| Per-person time zone for times shown                   | TABLE STAKES          | WEAK  | UTC by design, the person's zone for quiet hours only                  |
| A one-off email from a record                          | TABLE STAKES (CRMs)   | LACKS | mail leaves through campaigns and sequences only                       |

### Insight and revenue operations (§D)

| Feature                                                | Market                 | HQ    | What is short                                 |
| ------------------------------------------------------ | ---------------------- | ----- | --------------------------------------------- |
| Report builder (object, filter, group, measure, chart) | TABLE STAKES           | LACKS | fixed report pages only                       |
| Custom dashboards                                      | TABLE STAKES           | LACKS | Home and the fixed pages                      |
| Drill-down from a figure to its records                | TABLE STAKES           | WEAK  | some tables link through; charts do not       |
| Pipeline, funnel, win rate, cycle, forecast            | TABLE STAKES           | HAS   |                                               |
| MRR bridge, NRR/GRR, cohorts                           | TABLE STAKES           | HAS   |                                               |
| Support backlog trend and time to resolution           | TABLE STAKES           | WEAK  | counts and first reply only                   |
| Hosted web forms                                       | TABLE STAKES           | WEAK  | the website posts to intake; no form HQ hosts |
| CSAT, leaderboards, routing for leads                  | TABLE STAKES elsewhere | LACKS | deliberately, §4                              |

## 3. The order to build them (each a full wave: service + test + mock + portal + harness)

Built 2026-10-03: **exports of a view** (with the column choice and custom fields) and
**the backup** (dual-controlled, outside the quota, in the ledger).

1. **A person's data, as a file** — the privacy desk makes the package an access or
   portability request needs: every record HQ holds under the address, as JSON and CSVs
   with a README, recorded on the request. (§A E9, §B 7.)
2. **Archive and restore** — companies, people, deals and leads can be archived and put
   back from an Archived view; archiving keeps every link, so a restore is whole; nothing
   is deleted. A single property edit can be undone from its toast, and History can put a
   previous value back. (§B 1–9.)
3. **Share** — copy a link on every record; send a record to a colleague with a line (it
   lands in their inbox); a quote as a link the customer opens, with an expiry, a view
   count and accept or decline; one page listing every live external link, each
   revocable. (§A S-1, S-4, S-10.)
4. **Imports to the leads' standard** — companies and people gain a dry run, the file of
   rows left out, a history of files brought in, undo, and the owner matched by email.
   (§A I2–I11.)
5. **Find and create** — search across notes, tasks, meetings, contracts, invoices and
   help articles with a full results page; recently viewed from the read log the service
   already keeps; create from ⌘K; favourites kept with the account; single-key shortcuts
   switchable off. (§C 1–3, 16, 24–25.)
6. **Handover** — the offboarding run moves everything a leaver owns (companies, leads,
   deals, open tasks, assigned tickets) to a named colleague, with a preview of the counts,
   a reason and an audit row per kind. (§B 26.)
7. **Tasks** — recurring tasks (on a schedule or after completion) and a reminder on the
   due day in the person's inbox. (§C 13, 27.)
8. **Reports** — a report builder over companies, deals, leads, tickets and tasks (the
   list filters, a grouping, count / sum / average, bar or line or table), saved private
   or shared, pinned to a personal dashboard, each figure a link to its records, mailable
   by digest. (§D 1–6.)
9. **Audit and history** — audit search by date range and text; field history on leads,
   tickets, meetings and tasks. (§B 8, 10.)
10. **The desk** — who else is viewing or replying to a ticket, a warning before a reply
    that crosses another; the backlog over time and time to resolution. (§C 28, §D 21.)
11. **Files on records** — attachments on companies, people, deals, leads and tickets,
    size and type limits, preview, every upload and download in the audit log. Needs the
    storage account and its limits decided with the production switch-on (§6 of PLAN).
12. **Email from a record** through the person's connected mailbox, logged on the
    timeline, under the same consent and suppression rules as everything else.
13. **Hosted forms** and **times in the person's own zone** — taken up when asked.

## 4. Deliberately not built, with the reasons

- **SSO and SCIM**: worth it once the team uses an identity provider; at five to ten
  staff, TOTP and passkeys are the stronger control. **IP allowlists**: no fixed office
  addresses; a production-side switch if one appears.
- **CSAT, NPS, leaderboards, round-robin for leads, territories**: the research's own
  advice for a team this size; a score from a handful of answers misleads.
- **Custom objects, custom roles, guest seats, record-level privacy**: no record a
  role's capability does not already cover; revisit with the first outside collaborator.
- **Background export jobs, a scheduled raw-data feed, a configuration sandbox**: right
  for tens of thousands of rows a day and a data team; HQ is neither yet.
- **Sharing to Slack or Teams**: the company does not use them; email and the inbox
  carry it.

---

# §A. Data in, out and sharing (the full report)

## A. Data in, data out, and sharing: what serious business tools ship

Research for HQ (internal CRM, support desk, revenue and team-admin portal). Focus area: getting data **in** (import), getting data **out** (export, backup, print, API) and **sharing** (links, views, reports, guests, external pages).

- **Date of research:** 2026-10-03
- **Products covered:** HubSpot, Salesforce, Pipedrive, Attio, Close, Zoho CRM, Freshsales, Copper, Folk, Twenty, monday.com, Airtable, Notion, ClickUp, Linear, Zendesk (Support, Explore, Sell), Intercom, Front, Stripe Dashboard.
- **Method:** official help centres, developer docs and vendor pages first (about 125 distinct pages, listed in §8 and cited inline as `[S#]`), then one buyer-side source (Capterra's CRM category). G2 refused automated access (HTTP 403).
- **Ratings:** **TABLE STAKES** means nearly every product in the set has it, and a buyer will assume it exists. **COMMON** means many have it, usually on a paid or Enterprise tier. **DIFFERENTIATOR** means only a few have it, or only a few do it well.
- **Caveats:**
  - The web-search budget ran out midway through the research. After that, pages were reached by direct URL or through each vendor's own help-centre index.
  - Salesforce Help (JavaScript-rendered), the Pipedrive support site (HTTP 429 rate limit) and the Intercom help centre (navigation-heavy pages) could only be read in part.
  - A claim that rests on a vendor's documented behaviour but was **not** fetched in this pass is marked _(not verified this pass)_.
  - Absence claims ("not encountered") mean the reviewed pages did not mention the feature. They do not prove the product lacks it.

---

### 0. Executive summary

1. **Export is gated, logged and asynchronous everywhere serious.**
   - **Gated:** nearly every product makes "export" its own permission, separate from "view". Examples: HubSpot _Export_, Salesforce _Export Reports_, Pipedrive _Export data from list views_, Zoho _Export (Module)_, Twenty _Export CSV_, Stripe _Bulk exports of…_, Zendesk custom-role _CSV Export_ [S7][S21][S29][S43][S58][S128][S100].
   - **Asynchronous:** large exports run in the background, and the file arrives as a notification or emailed link that expires.
   - **Expiry varies widely:** 1 hour (ClickUp) [S86], 12 hours (Linear) [S92], 48 hours (Salesforce weekly export) [S19], 3+ days (Zendesk) [S98], 7 days (Close, Zoho, Notion) [S37][S43][S80], 28–30 days (Pipedrive, HubSpot, Front) [S27][S1][S117], and 5 minutes for HubSpot's API download URL [S17].
2. **Export governance is where products separate.**
   - **Basic:** a per-role export permission.
   - **Better:** an admin-only switch for exports. Attio, monday, Notion, Airtable and ClickUp offer this on Enterprise or Business tiers [S32][S60][S80][S71][S86].
   - **Best seen:** HubSpot Enterprise **export approvals**. An export above a record threshold needs an approver, and _"exports containing Sensitive Data will always require approval regardless of the number of records"_ [S8].
   - **Known gap:** Zendesk's admin export restriction _"doesn't apply to API data exports"_ [S99], and a standard agent _"can use the API but not the UI export"_ [S100]. A UI-only permission that the API bypasses is the classic weak implementation.
3. **Exports must be audited.**
   - **In audit logs:** HubSpot logs exports as security activity [S9]. Notion logs _"Page exported"_ and _"Workspace content exported"_ [S84]. Intercom logs data exports on all plans [S113]. Salesforce exposes report-export events [S24].
   - **As export histories:** Zoho keeps an export history (60 days; admins see everyone's) [S43]. HubSpot keeps an export log for 3 years [S1].
4. **Undoing an import is common, but almost all undo only removes _created_ records.**
   - **Created records only:** Pipedrive (48 h, admins only) [S28], Zoho (30 days) [S44], ClickUp (10 days) [S87], Close (needs _Bulk Delete_) [S38], Copper (not after "overwrite") [S53], and Zendesk Sell (_"does not remove the data that was merged into existing"_ records) [S110][S111].
   - **Updates too:** only HubSpot's **Restore CRM changes** rolls back _updates_ made by an import, workflow, integration or manual edit, up to 14 days back [S5]. HubSpot users had requested this for years [S6].
5. **Upsert by a unique key is the minimum for an importer.**
   - **Has it:** HubSpot offers _Create and update / Create only / Update only_ matched on Record ID, email, domain or any unique property [S2]. Attio, Freshsales, Copper, monday, Twenty and Salesforce have equivalents [S34][S48][S53][S61][S58][S20].
   - **Lacks it:** Notion's _Merge with CSV_ _"add[s] rows. They don't update existing rows"_ [S83].
6. **Public share links vary most in quality.**
   - **Good:** Zendesk Explore links can require a strong password, inherit the account's IP restrictions and lock out after 5 wrong attempts. One switch kills every link [S105]. Airtable has password and email-domain restriction plus regenerate and disable [S70]. ClickUp Enterprise has expiry (7/30/90/custom), a list of every public item, and _"Stop sharing all"_ [S89]. Salesforce content deliveries have a default 90-day expiry, a password, a first-view email and view tracking [S23]. Stripe invoice links expire, with a self-serve recovery flow [S129].
   - **Weak:** monday's public board view has no password, and its own docs warn that _"filtered data (items and columns) can still be accessed through shared views by technical savvy users although it is hidden"_ [S63]. Notion web links have no password (_"Unfortunately, not at the moment."_) [S81].
7. **Scheduled delivery of reports is table stakes for anything with reporting. Scheduled delivery of raw data is rarer.**
   - **Report schedules:** HubSpot sends recurring email, Slack and Google Chat; external recipients get one-off sends only [S12]. Salesforce has subscriptions with conditions [S22]. Zendesk Explore sends PDF, PNG, CSV or XLSX and suspends a schedule after 5 failures [S104]. monday sends PDF with plan quotas [S64]. Freshsales [S51] and Stripe [S125] also schedule reports.
   - **Gap:** Front's custom report dashboards cannot be shared or scheduled (_"Not at this time"_) [S118].
   - **Raw-data schedules:** Salesforce weekly/monthly backups [S19], Zoho backups [S45], and Stripe Data Pipeline full loads every 3 hours to a warehouse or S3/GCS/Azure [S130].
8. **Guests and cheap seats are how sharing outside the paid team happens.** Examples:
   - HubSpot: free, unlimited View-Only seats [S10].
   - monday: free, unlimited viewers who can still export to Excel; free guests on Pro and Enterprise [S65].
   - ClickUp: free view-only guests [S88].
   - Intercom: Lite seats [S112].
   - Front: guests scoped to one conversation [S120].
   - Airtable: Portals; read-only portal users are not billable [S73].
9. **Subject-access (GDPR) export is uneven.**
   - **Strong:** HubSpot's _Export contact data_ includes property **history**, activities and associations, run from a Data Request Manager [S14][S13].
   - **Partial:** Zendesk's user export covers profile and identities only. The docs warn that it _"doesn't include all the users' possible personal data"_ [S102].
10. **Two small security details few products handle.**
    - **CSV formula-injection protection:** Attio has an admin toggle, off by default [S32].
    - **Permission-aware link previews:** Linear's _"URLs associated with private Linear teams never unfurl"_ in Slack [S96].

---

### 1. EXPORT

#### E1. Export the current list or view (filtered, sorted, chosen columns)

- **What it is:** a button on any table that exports exactly what the user is looking at.
- **Who has it:**
  - **HubSpot:** CSV, XLSX or XLS. _"By default, only the properties and associations in the view will be included"_. Can switch to "all properties" or "all properties + associations". With all properties, _Record ID_ is forced to the first column [S1]. Saved views export the _"records and associations displayed within the saved view"_ [S11].
  - **Pipedrive:** list views → _"Export filter results"_ (Excel or CSV). A single deal's detail page exports as XLSX [S27].
  - **Attio:** CSV or Excel. _"Every column visible in your table view will become a column"_. Kanban views export the card attributes. To respect filters you must _"click Save for everyone before exporting"_ [S32].
  - **Close:** export from any lead search or Smart View, CSV or JSON, with "common fields" or "all fields". Contact Smart Views cannot be exported [S37].
  - **Folk:** _"Export view as CSV"_ per group. Respects displayed columns and filters [S56].
  - **Twenty:** _"Only visible columns are exported"_, up to 20,000 records [S58].
  - **Zoho CRM:** filter by custom view or criteria (max 25 criteria). Up to 200 fields, or "all fields" minus up to 20 excluded [S43].
  - **monday:** filters are applied. _"group by, sort, and conditional coloring … are not supported in the export"_ [S60].
  - **Notion:** database export is the _"current view or the default view. Exporting all views at once isn't supported"_ [S80].
  - **Airtable:** CSV per view, available to every permission level including read-only [S78].
  - **ClickUp:** List and Table views, Docs, Dashboard cards, Whiteboards and Form responses, to CSV or PDF [S86].
  - **Linear:** issue views and projects via the command menu [S92].
  - **Zendesk:** a view → _"Export as CSV"_. Unarchived tickets only, view columns only [S101].
  - **Copper:** filtered list → export selected records, all records, or the current filter [S52].
  - **Stripe:** Transactions can be filtered and exported. Reporting allows _"filtering and adding custom columns"_ [S126].
- **What separates good from weak:**
  - **Respects all view state:** filters, column choice and order, and sort. monday drops sort and grouping [S60]. Attio needs the view saved first [S32].
  - **Offers "what I see" vs "all fields":** HubSpot [S1] and Close [S37] offer the choice, which makes round trips possible.
  - **Exports only rows the user may see:** Pipedrive restricts by visibility group [S27]. Notion skips pages the exporter cannot access [S80].
  - **Always includes the stable record ID:** see E14.
  - **Handles enriched or third-party data honestly:** Attio leaves enriched cells blank rather than failing silently [S32].
- **Rating:** **TABLE STAKES**

#### E2. Formats (CSV, XLSX, JSON, PDF, Markdown, vCard/ICS)

- **What it is:** the file formats offered on export.
- **Who has it:**
  - **CSV:** universal.
  - **XLSX:** HubSpot, Zoho, Pipedrive, Attio, Copper (XLSX only), monday ("Excel"), Salesforce [S1][S43][S27][S32][S52][S60][S21].
  - **JSON:** Close (the only format that includes activities) [S37], Zendesk full export (recommended above 200,000 tickets) [S98], Stripe scheduled exports (_"CSV or JSON"_) [S127].
  - **XML:** Zendesk [S98].
  - **PDF, HTML, Markdown:** Notion (pages: PDF, HTML, Markdown; databases: CSV) [S80]. PDF of dashboards: monday [S64], Zendesk Explore [S104], Freshsales reports [S51].
  - **Markdown copy:** Linear, _"for LLM compatibility"_ [S92].
  - **Parquet:** Stripe Data Pipeline to cloud storage [S130].
  - **vCard/ICS:** not encountered in any page reviewed.
- **What separates good from weak:**
  - **Split oversized files automatically:** HubSpot splits XLSX above 1,000,000 rows and XLS above 65,535, and zips CSVs over 2 MB [S1].
  - **Offer an encoding choice:** Zoho [S43] and Salesforce [S21] let the user pick the CSV character set for non-Latin data.
  - **Offer a hierarchical format:** JSON or zip-of-CSVs for related data, because flat CSV loses activities.
  - **Do not truncate silently:** Salesforce truncates long-text fields to 255 characters in report exports [S21].
- **Rating:** CSV and XLSX are **TABLE STAKES**. JSON and PDF are **COMMON**. vCard and ICS are **DIFFERENTIATOR** (not observed).

#### E3. Asynchronous export: notification, download link and link expiry

- **What it is:** a large export runs as a background job, and the user is notified (email, in-app, or an "exports" list) with a time-limited link.
- **Who has it (and how long the link lives):**

| Product                        | Delivery                                      | Link or file lifetime                                        | Source |
| ------------------------------ | --------------------------------------------- | ------------------------------------------------------------ | ------ |
| HubSpot (UI)                   | Email with download link                      | 30 days; export log kept 3 years                             | [S1]   |
| HubSpot (Exports API)          | Poll status, then GET download URL            | **5 minutes**, then request a fresh URL                      | [S17]  |
| Salesforce Data Export Service | Email when the zip is ready                   | Deleted **48 h** after the email                             | [S19]  |
| Close                          | Email link                                    | 7 days                                                       | [S37]  |
| Zoho CRM                       | Export History list                           | 7 days; password-protected zip optional                      | [S43]  |
| Zoho CRM backup                | In-app and email to initiator and Super Admin | 7 days                                                       | [S45]  |
| Notion workspace export        | Email link                                    | 7 days; can take _"up to 30 hours"_                          | [S80]  |
| Zendesk account export         | Email link                                    | _"valid for at least three days"_                            | [S98]  |
| Linear                         | Email                                         | **12 hours**                                                 | [S92]  |
| ClickUp                        | Link                                          | **1 hour**                                                   | [S86]  |
| Pipedrive                      | "Generated exports" list                      | 28 days                                                      | [S27]  |
| Front analytics                | "Export requests" list                        | Deleted after 30 days                                        | [S117] |
| Copper                         | Email with link to .xlsx                      | not stated                                                   | [S52]  |
| Freshsales full export         | Zip by email; Export History                  | not stated                                                   | [S49]  |
| Stripe Sigma schedule          | Email CSV link, or webhook with file URL      | Sample payload shows about 7 days (`result_available_until`) | [S122] |

- **What separates good from weak:**
  - **Short-lived download URLs that need authentication.** HubSpot's API URL lasts 5 minutes [S17]. Stripe's scheduled-query file needs the live secret key: _"using your live secret API key"_ [S122].
  - **A persistent export log, so a user can find past exports.** HubSpot keeps 3 years [S1]; Zoho 60 days, and admins see all users [S43].
  - **Visible status:** HubSpot API states are `PENDING/PROCESSING/COMPLETE/CANCELED` [S17]. Zoho shows _In Progress / Completed / Error_ [S43].
  - **A cancel option.**
  - **Honest timing:** Notion warns _"up to 30 hours"_ [S80]; Zendesk _"a few minutes to a day or more"_ [S98].
  - **Expiry long enough to be usable, short enough to be safe.** One hour (ClickUp) is hostile to email-based delivery. Thirty days on an emailed link is generous for PII.
- **Rating:** **TABLE STAKES**

#### E4. Row, size and frequency limits on export

- **What it is:** caps on how much and how often a user can export.
- **Who has it:**
  - **HubSpot UI:** auto-splits files (see E2) [S1]. **API:** _"one export at a time"_ and _"up to thirty exports within a rolling 24 hour window"_ [S17].
  - **Salesforce reports:** Formatted matrix 2,000 rows × 100 columns. Formatted tabular or summary 100,000 × 100. Details Only _"unlimited number of rows and columns"_ [S21].
  - **Zoho CRM:** CSV 200,000 records per export, XLSX 50,000. Exports per day by edition: Free 10, Standard 100, Professional 250, Enterprise 500, Ultimate 1,000 [S43].
  - **monday:** board export up to 100,000 items [S60].
  - **Twenty:** 20,000 records per export [S58].
  - **Linear:** members 250 issues or 200 projects; admins 2,000 issues; guests cannot export [S92].
  - **ClickUp:** Free and Unlimited plans _"can only export five List, Table, or Form views"_ [S86].
  - **Freshsales:** report export 25,000 records manually, 10,000 scheduled [S51]. Full export _"up to five times daily … full-time range only once"_ [S49].
  - **Zendesk:** UI exports above 100,000 records _"might time out"_ [S100]. XML capped at 200,000 tickets and 500 MB [S98].
- **What separates good from weak:**
  - **Limits by role, not only by plan:** Linear's 250 vs 2,000 [S92].
  - **Daily caps that slow bulk exfiltration:** Zoho [S43], HubSpot API [S17].
  - **Splitting instead of failing.**
  - **A message that names the limit,** rather than a timeout.
- **Rating:** **TABLE STAKES** (some limit always exists). Role-tiered limits are a **DIFFERENTIATOR**.

#### E5. Who may export: per-role permission, admin-only switch, approval

- **What it is:** export is a capability separate from viewing, controlled per role, with optional stricter policies.
- **Who has it:**

| Product                   | Mechanism                                                                                                                                                                                                                                                                                                                           | Source           |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| HubSpot                   | _Export_ permission ("export CRM records and reports"). Enterprise adds _Export without approval_ and _Approve exports_                                                                                                                                                                                                             | [S7]             |
| HubSpot Enterprise (beta) | **Export approvals.** A record-count threshold triggers approval; Sensitive Data always needs approval; approvers are Super Admins or holders of the _Exports Approver_ permission; status shows in the _export audit log_; segments and property history are covered, but _"single-object or custom reports cannot be configured"_ | [S8]             |
| Salesforce                | _Export Reports_ permission (depends on Run Reports)                                                                                                                                                                                                                                                                                | [S21]            |
| Pipedrive                 | Global permissions _"Export data from list views"_ and _"Import data from spreadsheets"_. The "Export data" section is admin-only                                                                                                                                                                                                   | [S29][S27]       |
| Zoho CRM                  | _"Export (Module) permission in their profile"_                                                                                                                                                                                                                                                                                     | [S43]            |
| Close                     | Restricted Users cannot do _"Bulk importing, bulk emailing, exporting, merging leads, or deleting leads"_. Custom roles on the Scale plan only                                                                                                                                                                                      | [S39][S42]       |
| Copper                    | Admins by default; per user via _"'Data Export' box"_                                                                                                                                                                                                                                                                               | [S52]            |
| Twenty                    | _Export CSV_ and _Import CSV_ permissions                                                                                                                                                                                                                                                                                           | [S58]            |
| Attio                     | _"All members can export records"_. _"On the Enterprise plan, admins can restrict exports to admins only"_                                                                                                                                                                                                                          | [S32]            |
| monday                    | _"Admins of an Enterprise plan can activate an account permission that disables non-admins from exporting"_. Viewers (free) can export to Excel                                                                                                                                                                                     | [S60][S65]       |
| Airtable                  | Every base role, read-only included, can download CSV and print [S78]. Business and Enterprise Scale admins can block _"CSV downloads"_, _"Printing"_ and _"Copying and pasting"_ for non-members or all users, with a domain allowlist [S71]                                                                                       | [S78][S71]       |
| Notion                    | Enterprise _"Disable export"_ at workspace or teamspace level. Guests need Full access to export                                                                                                                                                                                                                                    | [S80]            |
| ClickUp                   | Members with Edit permission export views. Task-data export is Admin/Owner only, customisable per role on Business Plus and Enterprise                                                                                                                                                                                              | [S86]            |
| Linear                    | Workspace export by admins (owners on Enterprise). Guests cannot export                                                                                                                                                                                                                                                             | [S92]            |
| Zendesk                   | Exports _"do not turn on automatically"_ (Support must enable them). Admins have full access. Agents need a custom role with _CSV Export_. **Standard agents can use the API but not the UI export.** Owner can limit exports to an _"Approved email domain"_, which _"doesn't apply to API data exports"_                          | [S100][S98][S99] |
| Intercom                  | Lite seats can _"Can export CSV"_ (reports) but cannot _"export lead, user, company data"_ or _"conversation transcripts"_                                                                                                                                                                                                          | [S112]           |
| Stripe                    | _"Bulk exports of payments, customers, products, and connected accounts"_ is a per-role capability; e.g. IAM Admin and Dispute Analyst cannot, View Only can (except connected accounts); a _Data Migration Specialist_ role can _"Request data exports"_                                                                           | [S128]           |

- **What separates good from weak:**
  1. Export is its own permission, separate from view.
  2. **The same rule governs UI and API.** Zendesk is the counter-example [S99][S100].
  3. Permissions are granular by data class: report CSV vs contact PII vs transcripts (Intercom) [S112]; payments vs connected accounts (Stripe) [S128].
  4. An admin-only kill switch.
  5. **Approval above a threshold, with a stricter rule for sensitive fields** (HubSpot) [S8].
  6. Exports respect row-level visibility (E1).
  7. Read-only roles cannot export by default. Airtable and monday allow it, which is convenient but leaky.
- **Rating:**
  - Per-role export permission: **TABLE STAKES**.
  - Admin-only switch: **COMMON**, mostly Enterprise.
  - Approval workflow: **DIFFERENTIATOR**; only HubSpot in this set.

#### E6. Export audit logging and export history

- **What it is:** a record of who exported what, when and how much, ideally in the security audit log and streamable to a SIEM.
- **Who has it:**
  - **HubSpot:** export log kept 3 years [S1]. _"Exporting contacts or users"_ logged as security activity; Enterprise filters audit logs by category [S9]. Export approvals show in the _export audit log_ [S8].
  - **Salesforce:** report-export events via `ReportExportEventLog` and Event Monitoring [S24].
  - **Zoho CRM:** _Export History_ over 60 days; _"Admins can view the exports performed by all the users"_ [S43].
  - **Freshsales:** _Export History_ shows _"type of records exported, the time period, export status, and admins who initiate data export"_ [S49].
  - **Notion (Enterprise):** _"Page exported"_, _"Workspace content exported"_, even _"Audit Log exported"_. Kept 365 days; SIEM streaming via webhooks [S84].
  - **Airtable (Enterprise Scale):** audit log kept 180 days; UI capped at 10,000 events, API 1,000 per page; CSV or JSON [S75].
  - **Intercom:** teammate activity logs cover _"exporting data"_ on all plans; data older than a year via the REST API [S113].
  - **monday (Enterprise):** audit log accessible via API [S67][S62].
  - **Linear (Enterprise):** audit log kept 90 days and streamable. The documented events are access, subscription and settings changes; **exports are not listed** [S95].
  - **Pipedrive:** "Generated exports" list [S27].
- **What separates good from weak:**
  - **Every export is logged:** UI, API, scheduled and report exports.
  - **Each entry records** actor, IP, object, filter, row count and format.
  - **The log is filterable and exportable.**
  - **Retention is long enough for investigations:** 1 year (Notion) vs 90 days (Linear).
  - **Logs can stream to a SIEM:** Notion [S84], Linear [S95].
  - **Admins see everyone's exports:** Zoho [S43].
- **Rating:** export history: **COMMON**. Export events in a streamable security log: **COMMON** at Enterprise tier, **DIFFERENTIATOR** below it.

#### E7. Scheduled or recurring exports (report email, Slack, file drop, warehouse)

- **What it is:** a report, dashboard or dataset delivered on a schedule.
- **Who has it:**
  - **HubSpot:** recurring email _"Daily, Weekly, or Monthly"_ with CSV or Excel attachments, or an image of the report. Recurring recipients must be HubSpot users. External recipients are one-time only, need a connected sending domain, and are capped at 100 emails a day. Also sends to Slack and Google Chat on a schedule [S12].
  - **Salesforce:** report subscriptions with up to 5 conditions (sent only when all are met). Recipients are users, groups and roles that can access the report. Formatted .xlsx or details .csv. Runs as "Me" or "Another Person" [S22].
  - **Zendesk Explore:** CSV, XLSX, PNG or PDF; up to 12 months ahead; 25 MB attachment cap with split emails. _"If a scheduled delivery fails to export five times consecutively, the schedule is automatically suspended"_ [S104]. Zendesk Support also lists daily and weekly scheduled exports [S100].
  - **monday:** scheduled dashboard PDFs; Standard 1, Pro 5, Enterprise 100 schedules; up to 50 recipients; admins can restrict exports to external users [S64].
  - **Freshsales:** scheduled reports capped at 10,000 records [S51].
  - **Stripe:** scheduled financial reports daily, weekly or monthly with chosen columns, delivered as an email notification and download [S125]. Sigma scheduled queries send email CSV links or a webhook [S122]. _"Schedule automated recurring exports … in CSV or JSON"_ [S127].
  - **Data backups on a schedule:** Salesforce weekly or monthly [S19]; Zoho weekly, twice-monthly or monthly, paid beyond the free quota [S45][S46].
  - **Continuous warehouse or object-store sync:** Stripe Data Pipeline to Snowflake, Redshift, Databricks, BigQuery, S3, GCS or Azure Blob, _"delivering a full load of data every 3 hours"_ [S130].
  - **Gap:** Front custom dashboards, _"Can I share my report or schedule report emails? Not at this time"_ [S118].
  - **SFTP delivery:** not encountered.
- **What separates good from weak:**
  - **Recipient rules:** internal only, or external only by explicit exception (HubSpot) [S12].
  - **Report runs as a named user,** so data visibility is predictable (Salesforce) [S22].
  - **Conditional sends** (Salesforce).
  - **Attachment-size handling** (Zendesk).
  - **Failure handling and auto-suspend** (Zendesk).
  - **Plan quotas that are visible** (monday).
  - **A stop or unsubscribe link in every email:** Stripe [S122].
- **Rating:**
  - Scheduled report email: **TABLE STAKES** for tools with reporting.
  - Scheduled raw-data backup: **COMMON**.
  - Warehouse or cloud-storage sync: **DIFFERENTIATOR**.

#### E8. Full account backup ("export all data")

- **What it is:** one admin action that produces every object, usually as a zip of CSV or JSON files.
- **Who has it:**
  - **Salesforce:** Data Export Service, _Export Now_ or scheduled; _"Include all data"_; optionally _"images, documents, attachments"_. Export Now runs at most once every 7 days (Enterprise and above) or 29 days (Professional) [S19].
  - **Zoho CRM:** Data Backup for admins only. Data and attachments come in separate zips. Free backups per month: Ultimate 4, others 2, extra ones paid. The backup also contains the files from _"'File Upload' and 'Image Upload' fields"_ [S45].
  - **Attio:** _"Available on all plans"_, _"restricted to admins"_. Zip of CSVs including lists, records, notes, tasks, files and comments. **Emails _"Cannot be exported"_**; call recordings are metadata only [S33].
  - **Freshsales:** admin export of leads, contacts, deals, activities, users, email logs and _"Email conversations"_ [S49].
  - **monday:** _"admin of your account can download the entire account's data as a zip file"_ [S60].
  - **Notion:** workspace export (see E3) [S80].
  - **Zendesk:** JSON, CSV or XML; must be enabled by Support [S98].
  - **Linear:** workspace CSV export by admins or owners [S92].
  - **ClickUp:** task-data export by admins and owners [S86].
  - **Pipedrive:** admin "Export data" section covering leads, deals, organisations, people, products, activities, projects, notes and files. _"Files in Google Drive are not exported"_ [S27].
- **Gaps:**
  - Folk: _"You currently cannot export from the whole workspace"_; it must be done group by group [S56].
  - Copper: activities need _"a one-time activity export"_ via Support [S52].
- **What separates good from weak:**
  - **Covers every object,** including notes, activities, emails and files.
  - **Preserves relationships** through ID columns.
  - **Self-serve,** not "contact support" (Zendesk, Copper).
  - **Can be scheduled** (Salesforce, Zoho).
  - **States exclusions in writing** (Attio emails) [S33].
  - **Notifies a second admin:** Zoho emails both _"the admin who initiated it and the Super Admin"_ [S45].
- **Rating:** **TABLE STAKES** for an admin-run full export. Scheduled full backup is **COMMON**.

#### E9. Subject-access (GDPR) export of one person's data

- **What it is:** everything held about one data subject, packaged for an access or portability request.
- **Who has it:**
  - **HubSpot:** _Actions → Export contact data_. Includes _"default contact properties and their historical values"_, optionally custom properties with history, _"All activities associated with the contact (e.g., emails, notes)"_, and associations. Sent as separate files by email. _"Values may be redacted if they contain information that's sensitive"_. Needs Super Admin or the CRM export permission [S14]. Requests are tracked in a **Data Request Manager**: assign, batch, mark complete [S13]. Permanent delete removes tracking history, calls and form submissions [S15].
  - **Zendesk:** admins export users via Full JSON export, or the API per user or `show_many` (100 IDs). The docs say it _"doesn't include all the users' possible personal data"_, so tickets are separate. Soft-deleted users persist 30 days before permanent deletion. Redaction removes strings from ticket content [S102].
  - **monday:** a GDPR article exists in the help centre (not read in full this pass).
  - **Salesforce:** Privacy Center _(not verified this pass)_.
- **What separates good from weak:**
  - **One action produces a complete, human-readable package:** properties plus property history, activities, emails, files and associations.
  - **A request tracker with an owner and due date.**
  - **Redaction of sensitive fields.**
  - **A paired deletion flow that covers logs and history.**
- **Rating:** **COMMON**. A complete one-click package with request tracking is a **DIFFERENTIATOR** (HubSpot).

#### E10. Export of attachments and files

- **What it is:** binary files attached to records, included in export.
- **Who has it:**
  - **Salesforce:** _"Include images, documents, and attachments"_ and Salesforce Files in the weekly export [S19].
  - **Zoho:** separate _"CRM Attachments"_ zip in the backup [S45].
  - **Attio:** files included in workspace backup [S33].
  - **Notion:** HTML and Markdown zips _"contain the images and other assets"_; PDF export can exclude files [S80].
  - **Pipedrive:** files in the admin export, but Google Drive files excluded [S27].
- **Gaps:**
  - Linear: CSVs _"exclude attachment files"_ [S92].
  - monday: shared views hide the Files column [S63].
- **What separates good from weak:**
  - **Files sit in a separate archive** so the data export stays small.
  - **Stable file-to-record mapping by ID.**
  - **Linked third-party files are listed, not silently dropped.**
- **Rating:** **COMMON**, in full backups. In list exports it is rare.

#### E11. Export of activities, notes and emails

- **What it is:** the timeline, meaning calls, emails, meetings and notes, not only the record fields.
- **Who has it:**
  - **Close:** JSON is _"the only format you can use to export all Activities (Emails, Calls, SMS messages, Notes, Custom Activities)"_ [S37]. API flag `include_activities`; _"Activities aren't included in any exports by default"_ [S41].
  - **HubSpot:** activities come from a single-contact export or the engagements API, not list export [S1][S14].
  - **Pipedrive:** _"Activities, notes and files linked to deals and contacts must be exported separately"_ [S27].
  - **Freshsales:** full export includes email logs and conversations [S49].
  - **Folk:** export zip has _"2 files: contacts & notes"_; interactions and reminders are excluded [S56].
  - **monday:** updates and replies go in a separate Excel tab; subitem updates are not exported [S60].
  - **Attio:** notes, tasks and comments yes; emails no [S33].
  - **Copper:** via Support only [S52].
- **What separates good from weak:**
  - **Activities are exportable without support,** in a related-file or JSON structure that keeps the record ID.
  - **Defaults are documented.**
- **Rating:** **COMMON**, but often second-class.

#### E12. IDs included for re-import (round trip)

- **What it is:** stable internal IDs in every export, so an edited file can update the right records on re-import.
- **Who has it:**
  - **HubSpot:** Record ID always, first column [S1]; re-import with Record ID updates [S2].
  - **Close:** "ID" is among the common fields [S37].
  - **Attio:** Record ID is accepted as the match key for every object [S35].
  - **Copper:** Copper ID is a key field [S53].
  - **Twenty:** `id` [S58].
  - **Freshsales:** "Freshworks CRM ID" match key [S48].
  - **Linear:** export includes ID [S92].
  - **Salesforce:** Data Loader matches on ID; the import wizard matches on Salesforce ID or external ID [S20].
- **What separates good from weak:**
  - **ID present by default and labelled clearly.**
  - **Support for external IDs** (Salesforce) for system-to-system sync.
- **Rating:** **TABLE STAKES**

#### E13. CSV formula-injection protection on export

- **What it is:** neutralising cell values that start with `=`, `+`, `-` or `@` so a spreadsheet cannot execute them. This matters when exported data contains user-supplied text, such as lead names or ticket subjects.
- **Who has it:** Attio, _"Optional formula injection protection available to workspace admins on all plans (disabled by default)"_ [S32]. Not encountered elsewhere in the reviewed pages.
- **What good looks like:** on by default for any export containing externally entered text.
- **Rating:** **DIFFERENTIATOR**

---

### 2. IMPORT

#### I1. Objects supported, including associations between them

- **What it is:** importing more than contacts: companies, deals, tasks, notes, activities, custom objects, and the links between them.
- **Who has it:**
  - **HubSpot:** contacts, companies, deals, tickets, custom objects and activities such as calls and meetings. Two objects at once _"using a single file or multiple files"_ joined by a _"common column"_. Association labels on Pro and Enterprise. Limitation: _"Existing emails, meetings, notes, and tasks cannot be updated via import"_ [S2].
  - **Pipedrive:** _"people, organizations, leads, deals, projects, activities, notes and products"_. Deals and leads need a linked person or organisation [S28].
  - **Attio:** companies, people, deals, users, workspaces and custom objects. _"You can use imports to update both relationship attributes and the attributes of linked records"_. List entries can be added or updated [S34].
  - **Freshsales:** _"Contacts, Accounts, Deals, Products, Custom Modules, Sales Goals"_ [S48].
  - **Twenty:** strict order: _"Companies first … People second … Opportunities third … Notes and Tasks … Custom objects"_ [S59].
  - **Folk:** people and companies together, auto-linked; _"Pipeline data or status columns"_ and interactions cannot be imported [S55].
  - **Close:** leads and contacts only; cannot import _"notes, calls, emails, SMS, and other non-lead data"_ [S38].
  - **Salesforce:** import wizard handles contacts, leads, accounts, custom objects, campaign members and solutions [S20].
  - **Zendesk:** tickets via the Ticket Import API only. Bulk CSV for users and organisations [S106].
- **What separates good from weak:**
  - **Multi-object, association-aware import:** HubSpot, Attio.
  - **Activities and notes importable.**
  - **Required-relationship validation:** Pipedrive.
  - **A documented import order:** Twenty.
- **Rating:** core objects are **TABLE STAKES**. Associations and activities in one import are **COMMON**.

#### I2. File types and limits

| Product                         | Types                                | Per-file / per-day limits                                                                                                                                                                                   | Source                          |
| ------------------------------- | ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| HubSpot                         | .csv, .xlsx, .xls (one sheet)        | Paid: 512 MB, 1,048,576 rows per file, 10,000,000 rows and 500 imports per day, 80M rows/day via API; Free: 20 MB, 500,000 rows and 50 imports per day; 3 concurrent (2 over 10k rows); under 1,000 columns | [S4]                            |
| Salesforce                      | CSV                                  | Import Wizard up to 50,000 records; Data Loader _"50,000 to 150 million"_                                                                                                                                   | [S20]                           |
| Pipedrive                       | XLS, XLSX, CSV (one tab)             | 50,000 rows, 50 MB                                                                                                                                                                                          | [S28]                           |
| Attio                           | CSV                                  | 100,000 rows, 100 columns, 100 MB                                                                                                                                                                           | [S34]                           |
| Close                           | CSV, XLSX/XLS                        | 15 MB per upload                                                                                                                                                                                            | [S38]                           |
| Freshsales                      | CSV, XLSX                            | 5 MB                                                                                                                                                                                                        | [S48]                           |
| Folk                            | .csv, .xls, .xlsx, .tsv, .txt        | 25,000 rows, 200 columns                                                                                                                                                                                    | [S55]                           |
| Twenty                          | CSV, XLSX, XLS                       | 10,000 records per file (API for 50k+)                                                                                                                                                                      | [S58][S59]                      |
| monday                          | Excel, CSV                           | New board 8,000 rows / 100 columns (first 50 imported); existing board 10,000 rows; 10 MB; 100 files per account per hour                                                                                   | [S61]                           |
| Airtable (CSV import extension) | CSV                                  | 25,000 rows, 5 MB                                                                                                                                                                                           | [S72]                           |
| Notion                          | CSV, Markdown, DOCX, HTML, PDF, ZIP  | 5 MB (Free) / 50 MB (paid) per file                                                                                                                                                                         | [S83]                           |
| ClickUp                         | .xls, .xlsx, .csv, .json, .tsv, .txt | 10,000 rows per file; 60 imports per day                                                                                                                                                                    | [S86] (Import & Export section) |
| Front (contacts)                | CSV                                  | 3,000 rows with `accountName`, otherwise 30,000                                                                                                                                                             | [S119]                          |
| Zendesk Sell                    | CSV                                  | 5,000 records recommended                                                                                                                                                                                   | [S110]                          |

- **What separates good from weak:**
  - **Large single-file ceilings:** HubSpot.
  - **Published daily and concurrency limits.**
  - **A clear "use the API above N" threshold:** Twenty.
  - **Per-role import caps:** Freshsales admins can set them [S48].
- **Rating:** **TABLE STAKES**

#### I3. Column mapping: auto-map, create fields inline, saved mappings

- **What it is:** matching file columns to fields, suggesting matches, creating missing fields, and remembering the mapping for next time.
- **Who has it:**
  - **Auto-mapping:** Pipedrive _"automatically maps your spreadsheet columns to fields based on column names"_ [S28]; Attio [S34]; Folk _"will automatically recognize your incoming field"_ [S55]; Close [S38]; Twenty [S58]; Airtable [S72].
  - **Create a field mid-import:**
    - **Allowed:** Attio _"+ Create new attribute"_ [S34], Pipedrive _"add a custom field"_ [S28], Folk _"Add as new field"_ [S55], Zendesk Sell can create custom fields [S110].
    - **Not allowed:** Twenty, _"Fields must exist before import"_ [S58].
  - **Saved mappings and templates:**
    - **Have them:** Airtable _"remembers your field mappings the next time you import"_ [S72]. HubSpot lets you reuse a past import as a template, but not for imports older than six months [S3].
    - **None documented:** Close [S38].
  - **Typed mapping:** monday maps to column types and needs a `user:` or `team:` prefix when names collide [S61].
- **What separates good from weak:**
  - **Suggestions plus manual override.**
  - **Inline field creation that is permission-checked.**
  - **Reusable mappings for recurring imports.**
  - **Type coercion that does not lose data:** Notion advises mapping problem columns to Text [S83].
- **Rating:** auto-mapping is **TABLE STAKES**; inline field creation is **COMMON**; saved mappings are **COMMON** but few products have them.

#### I4. Create vs update (upsert) and the dedupe key

- **What it is:** matching rows to existing records on a unique key, then creating, updating, or both.
- **Who has it:**
  - **HubSpot:** _"Create and update" / "Create new only" / "Update existing only"_; keys are Record ID, email, company domain or any unique-value property [S2].
  - **Salesforce:** the wizard _"prevents creating duplicate records by matching records"_ on name, Salesforce ID or external ID [S20].
  - **Freshsales:** CRM ID, email (_"matched only with the primary email"_), phone, or unique text and number fields; _"create new contacts, update only the existing contacts in Freshsales, or do both"_ [S48].
  - **Copper:** People and Leads by email, phone or Copper ID; Companies by domain, phone or ID; Opportunities by ID only; _"Skip"_ or _"Overwrite"_; email _"will match to ANY email stored in Copper"_ [S53].
  - **Attio:** domains, emails or Record ID; _"Without a unique attribute, Attio will create duplicate records"_ [S34][S35].
  - **monday:** add as new, skip, or update by a chosen column [S61].
  - **Twenty:** `id`, email or domain; soft-deleted matches _"will be restored"_ [S58].
  - **Close:** _"Check if Leads already exist"_ on chosen fields; _"Group Related Rows"_ for in-file duplicates [S38].
  - **Pipedrive:** _"merge them instead of creating new records"_ [S28].
  - **Folk:** auto-merges exact duplicates from any source [S57].
  - **Front:** dedupes on phone or email [S119].
  - **Notion (counter-example):** CSV merge _"add[s] rows. They don't update existing rows"_ [S83].
- **What separates good from weak:**
  - **Explicit mode choice.**
  - **A documented key per object.**
  - **Detects duplicates within the file as well as against the database:** Close [S38].
  - **Says what happens to soft-deleted records:** Twenty [S58].
- **Rating:** **TABLE STAKES**; Notion is the outlier.

#### I5. Update semantics: blanks, overwrite, multi-value fields

- **What it is:** what an update does to existing values.
- **Who has it:**
  - **Close:** _"Only add the missing information" / "Replace the existing lead information entirely" / "Skip the lead"_ [S38].
  - **Freshsales:** update blank fields only, or overwrite all [S48].
  - **Zendesk Sell:** update empty fields, overwrite, or create custom fields to keep both values [S110].
  - **Airtable:** _"Skip blank or invalid CSV values"_ [S72].
  - **Attio:** _"Empty values are skipped"_; multi-value fields like email and domain are _"additive"_; single values _"replace"_ [S35].
  - **Front:** new email or phone values _"add[ed] … as a separate entry and keep the old value"_ [S119].
  - **Copper:** emails, phones and domains _"cannot be updated"_; phones and websites are _added_ [S53].
- **What separates good from weak:**
  - **Blanks never wipe data unless explicitly chosen.**
  - **Append vs replace is visible for multi-value fields.**
  - **Per-import choice, not a fixed rule.**
- **Rating:** **COMMON**

#### I6. Preview or dry run before commit

- **What it is:** showing what will happen (counts of create, update and unchanged, plus errors) before any write.
- **Who has it:**
  - **Airtable:** shows _"the number of records that will be updated, the number of records that won't change, and the number of new records that will be created"_ [S72].
  - **Twenty:** errors _"highlighted in yellow"_ and editable in the UI before confirming [S58].
  - **Close:** validation runs before commit; failed rows go to a downloadable CSV [S38].
- **What separates good from weak:**
  - **Counts by outcome.**
  - **Inline fixing of bad rows.**
  - **No partial writes before confirmation.**
- **Rating:** **COMMON** (basic validation). A full dry run with outcome counts is a **DIFFERENTIATOR**.

#### I7. Per-row error report download

- **What it is:** a file of rejected or skipped rows with reasons, ready to fix and re-import.
- **Who has it:**
  - **HubSpot:** _"download error file"_ and an errors tab [S3].
  - **Pipedrive:** _"skip file with the reason for each failure"_ [S28].
  - **Close:** failed-validation CSVs kept _"30 days from the time of the import"_ [S38].
  - **Freshsales:** separate download links for errored and skipped records, plus a summary email [S48][S50].
  - **ClickUp:** an Errors section with per-entity reasons [S87].
  - **Salesforce:** status email plus the _Bulk Data Load Jobs_ page [S20].
- **What separates good from weak:**
  - **The error file is the original rows plus a reason column,** so it can be re-imported as is.
  - **Retention is stated.**
- **Rating:** **TABLE STAKES**

#### I8. Import history

- **What it is:** a list of past imports with counts, who ran each and when, with drill-down to the affected records.
- **Who has it:**
  - **HubSpot:** name, new and updated records, new associations, errors, source, user and date. Original file downloadable by the importer or a Super Admin _"within the last six months"_ [S3].
  - **Zoho:** 60 days of history; per-record detail for 7 days; admins see everyone's [S44].
  - **Freshsales:** _"last 1000 imports"_; records filterable by _Import Label_ [S50].
  - **Pipedrive:** added, updated, merged, skipped [S28].
  - **Attio:** an _Import history_ page in settings; imports run in the background [S34].
  - **ClickUp:** Queued, Pending, Completed or Failed; queued imports can be cancelled [S87].
- **What separates good from weak:**
  - **Drill into the exact records created or updated** (Freshsales import label, HubSpot).
  - **Original file retained.**
  - **Admins can audit other users' imports.**
- **Rating:** **TABLE STAKES**

#### I9. Undo or rollback an import

- **What it is:** reversing an import after the fact.

| Product                         | What undo does                                                                                                                                    | Window and permission                                                                           | Source          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------- |
| HubSpot                         | Delete records the import **created**; _"if you updated existing records via an import, you will not be able to reverse the changes by deleting"_ | n/a                                                                                             | [S3]            |
| HubSpot **Restore CRM changes** | Rolls back **updates** from Import, Workflow, Integration or manual "CRM changes" on most objects                                                 | Up to **14 days** back; Super Admin; one restore type at a time; actioned restores kept 90 days | [S5]            |
| Pipedrive                       | Revert import                                                                                                                                     | **48 hours**; global admins                                                                     | [S28]           |
| Zoho CRM                        | Undo removes **added** records only (_"cannot undo an import action on updated records"_)                                                         | **30 days**, then auto-confirmed                                                                | [S44]           |
| Close                           | _"Undo"_ in the History tab; leads changed after import will not revert                                                                           | Needs _Bulk Delete_                                                                             | [S38]           |
| Copper                          | _Revert Import_ deletes created records; _"You cannot revert an import that used the 'overwrite' feature"_                                        | n/a                                                                                             | [S53]           |
| ClickUp                         | _"delete any imports created in the last 10 days"_ (removes all items)                                                                            | 10 days                                                                                         | [S87]           |
| Linear                          | Delete an import to re-import; _"only … for a limited time after creation"_                                                                       | Admins                                                                                          | [S93]           |
| Zendesk Sell                    | Revert removes created records, not merged data; tags and custom fields persist                                                                   | Admins                                                                                          | [S110][S111]    |
| Airtable                        | No import undo; restore a base **snapshot** into a **new** base                                                                                   | Snapshot retention 2 weeks (Free) to 3 years (Enterprise Scale)                                 | [S72][S77]      |
| Notion, Attio, Freshsales       | No undo documented (Freshsales: filter by _Import Label_ and bulk-delete)                                                                         | n/a                                                                                             | [S83][S34][S50] |

- **What separates good from weak:**
  - **Undo covers updates, not just creates.** Only HubSpot does this, through field-level history [S5].
  - **The undo window is stated.**
  - **Records edited after the import are flagged and skipped** rather than clobbered (Close) [S38].
  - **Undo is permission-gated.**
- **Rating:** undo of created records is **COMMON**. Rollback of updates is a **DIFFERENTIATOR**.

#### I10. Owner assignment and side effects (automation on import)

- **What it is:**
  - setting the record owner from the file, or a default owner;
  - deciding whether automations fire on imported rows.
- **Who has it:**
  - **Freshsales:** owner column must hold the owner's **email** (_"NOT the name"_); unassigned rows go to a default user [S48].
  - **Attio:** Deal owner is required on deal import [S34].
  - **Twenty:** users _"must exist in Twenty before import"_ to be mapped [S59].
  - **Linear:** each source user is mapped to an existing user, created from email, or skipped [S93].
  - **Side effects:** Zendesk ticket import, _"No triggers run on imported tickets"_, with advice to tag imported tickets [S106]. HubSpot can enrich records during import [S2].
- **What separates good from weak:**
  - **Owner matched by unique key (email), with a fallback default.**
  - **An explicit "run automations on these rows?" choice.**
  - **An import tag or label on every row.**
- **Rating:** owner mapping is **TABLE STAKES**; automation control is **COMMON**.

#### I11. Who may import

- **What it is:** import as its own permission, with limits on bulk changes.
- **Who has it:**
  - **HubSpot:** _Import_ permission. Note that _"the Create permission … does not apply to records that are created through … imports"_ [S7].
  - **Pipedrive:** _"Import data from spreadsheets"_ [S29].
  - **Attio:** admin, or read-write access to the object or list [S34].
  - **Linear:** _"Imports can only be started by workspace admins"_ [S93].
  - **ClickUp:** admins and owners, or a custom role on Business Plus and Enterprise [S86].
  - **Twenty:** _Import CSV_ permission [S58].
  - **Close:** Restricted Users cannot bulk import [S39].
- **What separates good from weak:**
  - **Import governed separately from per-record create,** with object-level checks honoured.
- **Rating:** **TABLE STAKES**

#### I12. Migration from other tools

- **What it is:** importers that pull from another product with its structure intact, rather than via CSV.
- **Who has it:**
  - **monday:** Asana, Basecamp, Jira Server, Google Sheets, Trello, Zendesk [S61][S69].
  - **ClickUp:** Asana, Basecamp, Confluence, Jira, monday, Notion, Slack, Todoist, Teamwork, Trello, Wrike [S86].
  - **Linear:** Jira, GitHub, Asana, Shortcut, Linear and a CLI. Re-importing skips issues already imported [S93].
  - **Notion:** Evernote, Trello, Quip, Dropbox Paper, Google Docs and others [S83].
  - **Intercom:** Zendesk migration, self-serve or assisted [S114].
  - **Copper:** Import2 brings _"accounts, contacts, opportunities, notes, tasks and activities"_ [S54].
  - **Twenty:** written migration guide, with the API recommended above 50k records [S59].
  - **Zendesk:** Ticket Import API, Marketplace apps and Professional Services [S106].
  - **HubSpot:** Salesforce imports (referenced in its permissions guide) [S7].
- **What separates good from weak:**
  - **Users, history and relationships carried over.**
  - **Idempotent re-runs:** Linear [S93].
  - **Honest lists of what is not migrated:** Zendesk metrics [S106].
- **Rating:** **COMMON**

---

### 3. SHARING

#### S-1. Copy link to a record or view (deep links), and permission-aware previews

- **What it is:** every record, view and report has a stable URL a colleague can open, subject to their own permissions.
- **Who has it:** all products in the set address records and views by URL.
  - **Linear unfurls issue links in Slack** with title, status and assignee, and actions from Slack. Crucially, _"URLs associated with private Linear teams never unfurl"_ [S96].
  - **Close:** shared Smart Views from removed users are not auto-unshared: _"we aren't automatically deleting (un-sharing) Smart Views of removed users"_ [S40].
- **What separates good from weak:**
  - **ID-based URLs that survive renames.**
  - **Permission check on open,** with a request-access path (S-9).
  - **Previews and unfurls that never leak data from private spaces.**
  - **Clean-up of shares when a user leaves.**
- **Rating:** **TABLE STAKES** (links). Permission-aware unfurls are **COMMON**.

#### S-2. Saved views: private vs shared with teams, users or everyone

- **What it is:** a filter and column set saved and shared with chosen people.
- **Who has it:**
  - **HubSpot:** _Private / Team / Everyone / Custom (teams or users)_; Super Admins can see others' private views; up to 5 pinned tabs [S11].
  - **Close:** _"Keep Private – just for me"_ or shared; only the owner can delete [S40].
  - **Attio:** _"Save for everyone"_ [S32].
  - **monday:** saved filters can be exported and shared publicly [S60][S63].
  - **Salesforce and Zoho list or custom view sharing by role or group:** _(not verified this pass)_.
- **What separates good from weak:**
  - **Share to specific teams or users, not only "everyone".**
  - **Edit rights on a shared view separate from view rights.**
  - **A team default view.**
  - **Owner transfer on offboarding.**
- **Rating:** **TABLE STAKES**

#### S-3. Reports and dashboards: sharing with permission levels

- **What it is:** sharing analytics with view or edit rights.
- **Who has it:**
  - **Salesforce:** sharing is by **folder**, with _Viewer_ (view and run), _Editor_ (add, edit or delete content) and _Manager_ (also rename, delete and manage shares) for users, groups and roles [S25].
  - **Zendesk Explore:** dashboards shared with users or groups as Viewer or Editor. Edits are not live until _"Publish changes"_ [S103].
  - **monday:** the dashboard owner controls permissions; only Monday users can be shared with [S64].
  - **HubSpot:** management is the _"Super Admin"_ or the report or dashboard owner [S12]. Reporting permissions include _Create/own_ and _Admin_ [S7].
  - **Intercom:** Lite seats _"Can share Reports"_ [S112].
  - **Pipedrive:** _"Share any live dashboards with other stakeholders – whether they're Pipedrive users or not"_ [S31].
  - **Front:** custom report dashboards cannot be shared [S118].
- **What separates good from weak:**
  - **At least three levels:** view, edit, manage.
  - **Share to groups or roles.**
  - **Explicit publish of changes** so viewers are not shown half-edited dashboards (Zendesk).
  - **A defined data perspective:** whose permissions the report runs under (Salesforce subscriptions run as "Me" or "Another Person") [S22].
- **Rating:** **TABLE STAKES**

#### S-4. External or public share links (read-only, password, expiry, revoke)

- **What it is:** a link anyone outside the account can open without a seat.

| Product                         | What can be shared                            | Password                                         | Expiry                                                                                                   | Other controls                                                                                                                                                                                                                      | Source     |
| ------------------------------- | --------------------------------------------- | ------------------------------------------------ | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| Zendesk Explore                 | Dashboards (view-only)                        | Yes: ≥10 chars with upper, lower, number, symbol | Not stated                                                                                               | Account **IP restrictions enforced**; **5 wrong passwords lock the dashboard for everyone for 5 min**; turning the feature off disables all links; Enterprise + Explore Enterprise                                                  | [S105]     |
| Airtable                        | Views, bases                                  | Yes (paid)                                       | Not stated                                                                                               | **Email-domain restriction** (paid); _"Allow viewers to copy data out"_ toggle; _"Generate new link"_ invalidates the old one; _"Disable link"_; not indexed; API cannot create share links                                         | [S70]      |
| ClickUp                         | Tasks and Docs (all plans); views (Business+) | Not mentioned                                    | **Enterprise: 7, 30, 90 days or a custom date**                                                          | Enterprise list of all public items, _"Stop sharing all"_; search-engine indexing toggle; embed code; OIDC sign-in for public views (Enterprise)                                                                                    | [S89][S90] |
| Notion                          | Pages and databases; Sites                    | **No** (_"not at the moment"_)                   | Link expiration on "Anyone on the web with link"                                                         | _"Duplicate as template"_; search indexing toggle; Enterprise _"Disable publishing sites, forms, and public links"_                                                                                                                 | [S81][S82] |
| Salesforce (content deliveries) | Files                                         | Yes                                              | **Default 90 days**, changeable                                                                          | View in browser and/or download, _"Download as PDF"_; **email on first view**; view and download tracking                                                                                                                           | [S23]      |
| monday                          | Board views and filtered views                | Not mentioned                                    | Not mentioned                                                                                            | Hidden columns hidden **but** _"filtered data … can still be accessed … by technical savvy users"_; Files column hidden; boards with item-level permissions cannot be shared; HIPAA accounts disable it; owner or admin can disable | [S63]      |
| Stripe (hosted invoice)         | Invoice pages and PDFs                        | n/a (long random URL)                            | **30 days after due date, never more than 120**; links shown in the Dashboard or API valid ≥10 more days | Recovery page re-emails fresh links to known recipients; API returns 400 for expired PDF URLs                                                                                                                                       | [S129]     |
| HubSpot (quotes)                | Quote page                                    | n/a                                              | Default expiration period; signed quotes accessible 1 year                                               | E-signature; Enterprise approval before sending                                                                                                                                                                                     | [S16]      |
| Pipedrive                       | Dashboards; Smart Docs                        | n/a                                              | n/a                                                                                                      | Docs shared via _"special links with view tracking"_ with open notifications                                                                                                                                                        | [S31][S30] |

- **What separates good from weak:**
  1. **Server-side data minimisation.** The link returns only the shared fields. monday's caveat is the anti-pattern [S63].
  2. Password, plus a lockout against guessing.
  3. Expiry with a sensible default.
  4. Regenerate (rotate) and disable a single link.
  5. A tenant-wide kill switch plus an inventory of live links (ClickUp, Zendesk).
  6. Domain or IP restrictions, or SSO-gated public links (ClickUp OIDC).
  7. Indexing off by default.
  8. Engagement tracking: first-view email, view counts.
  9. A recovery path instead of a dead link (Stripe).
- **Rating:**
  - A basic public read-only link: **COMMON**.
  - Password, expiry and kill switch done properly: **DIFFERENTIATOR**.

#### S-5. Guest, collaborator and cheap seats

- **What it is:** access for people outside the paid team: clients, auditors, executives, contractors.
- **Who has it:**
  - **HubSpot:** View-Only seats are _"free and unlimited"_. They can view records, dashboards and reports and filter reports, but cannot save reports, edit records or change settings [S10].
  - **monday:**
    - **Viewers:** free and unlimited, and _"Export boards to Excel"_.
    - **Guests:** must use a different email domain. Standard gives 3 free guests (_"Every fourth guest will be considered a paid member"_); Pro and Enterprise are unlimited. Guests see only Shareable Boards they are invited to [S65][S66].
  - **ClickUp:** guest levels are _View only_, _Comment_, _Edit_, _Full edit_. View-only guests are free and unlimited on paid plans. Admins can hide custom fields from guests [S88].
  - **Front:** guests are invited by email to a single conversation, see _"messages and comments … in the last 7 days"_, need no login, and invites _"expire after 30 days"_. Admins can disable the feature company-wide; the cap is _"150 guest invites … every three days"_ [S120].
  - **Notion:** guests by email (need a Notion account). Enterprise owners can restrict guest invites [S82].
  - **Linear:** guests on Business and Enterprise, _"billed as regular members"_, scoped to teams; only team owners add them [S94].
  - **Intercom:** Lite seats (20 on Advanced, 50 on Expert) can view and share reports and export report CSVs, but only see conversations they are linked to or mentioned in [S112].
  - **Airtable:** Portals add-on with packs of 15–200 portal seats. _"Read-only access is not billable"_. Custom sign-in page on Business and Enterprise [S73].
- **What separates good from weak:**
  - **A free or cheap read-only tier.**
  - **Guest scope is per item, not per workspace.**
  - **Invite expiry.**
  - **Admin kill switch and invite rate limits** (Front).
  - **Guests cannot export by default** (Linear) [S92].
  - **Field-level hiding from guests** (ClickUp).
- **Rating:** **TABLE STAKES** in work-management and support tools. **COMMON** in CRMs.

#### S-6. Customer-facing pages (portals, deal rooms, quotes, tracked documents)

- **What it is:** a page tied to a record that a customer can view or act on.
- **Who has it:**
  - **HubSpot quotes:** a hosted quote page on your domain built from contact, company and deal tokens. E-signatures via Dropbox Sign. Default expiration. Enterprise approvals before sending [S16].
  - **Pipedrive Smart Docs:** templates auto-fill from any Pipedrive field; Google Drive or OneDrive; tracked links with open notifications; e-signatures; Professional and above, otherwise an add-on [S30].
  - **Stripe:** hosted invoice page with PDF invoice and receipt download, branding, and the expiry and recovery rules above [S129].
  - **Airtable Portals:** external users see filtered, user-scoped records [S73].
  - **Salesforce content deliveries:** see S-4 [S23].
  - **monday:** a "Customer portal" area exists in its help centre (not read this pass).
  - **Salesforce Digital Sales Room:** _(not verified this pass)_.
- **What separates good from weak:**
  - **Record-scoped external identity:** a link or login that sees only that customer's data.
  - **Engagement tracking.**
  - **Expiry and recovery.**
  - **Branding.**
  - **Approvals before sending.**
- **Rating:** **COMMON** in sales and billing tools; a **DIFFERENTIATOR** for an internal portal.

#### S-7. Share to email, Slack, Teams and Google Chat

- **What it is:** pushing a record, report or alert into communication tools.
- **Who has it:**
  - **HubSpot:** reports and dashboards by email (one-off or recurring), plus _"public Slack channels (not shared channels)"_ and Google Chat (needs mapped users), both schedulable [S12].
  - **Linear:** Slack unfurls with inline actions, channel notifications for team and project activity, issues created from Slack messages, synced threads [S96].
  - **Salesforce:** subscriptions email users, groups and roles [S22].
  - **Zendesk Explore:** dashboards emailed to internal users; Enterprise can email end users [S104].
  - **monday:** scheduled dashboard PDFs to up to 50 recipients [S64].
  - **Stripe:** Sigma results to team members by email [S122].
  - **Microsoft Teams:** not covered in the pages reviewed.
- **What separates good from weak:**
  - **Respect channel visibility:** HubSpot excludes Slack shared channels [S12]; Linear never unfurls private teams [S96].
  - **Recipients must already have access,** or an explicit external exception applies.
  - **One-click unsubscribe.**
- **Rating:** **COMMON**

#### S-8. Embedding views or dashboards

- **What it is:** an iframe of a live view inside another site or tool.
- **Who has it:**
  - **Airtable:** _"live, read-only"_, all plans. Warning: _"Embedding a base exposes all of the information held within it, including new data added in the future"_ [S74].
  - **monday:** iframe embed code, including full-screen [S63].
  - **ClickUp:** _"Copy the code and embed it on any website"_. Public views can be OIDC-gated (Enterprise) [S89][S90].
  - **CRMs:** not encountered as a CRM feature in the pages reviewed.
- **What separates good from weak:**
  - **The embed inherits the share link's controls:** password, domain, expiry.
  - **A warning that embeds expose future data.**
  - **SSO-gated embeds for internal intranets.**
- **Rating:** **COMMON** in work-management tools; a **DIFFERENTIATOR** for CRMs.

#### S-9. Request-access flows

- **What it is:** a user hitting a page they cannot see, or can only view, can ask for access, and the owner approves or denies it.
- **Who has it:**
  - **Notion:** _"Request edit access"_; the page owner _"can accept or ignore it"_ [S82].
  - **ClickUp:** _"Request edit access"_ goes to the location owner by Inbox and email. The owner can grant Full edit, Edit or Comment. _"Requests are valid for 14 days"_. One pending request per user [S91]. ClickUp also has _"Allow requests to upgrade to a member"_ (listed in its permissions section).
- **What separates good from weak:**
  - **The requester can say why.**
  - **The approver picks the level.**
  - **Requests expire.**
  - **No request spam:** one pending request at a time.
- **Rating:** **COMMON** in collaboration tools; rare in CRMs and support desks (not encountered there).

#### S-10. Audit of shares, inventories and kill switches

- **What it is:** knowing every share that exists, who made it, and being able to revoke it in one place.
- **Who has it:**
  - **ClickUp (Enterprise):** _"View all publicly shared items"_, _"Stop sharing all"_, and per-item revocation (_"Public sharing for that item will immediately turn off"_) [S89].
  - **Zendesk:** _"When you turn off external link sharing, any existing shared links are disabled"_ [S105].
  - **Notion:** audit events _"Page shared to web"_, _"Page permission update"_, _"Guest removed"_ [S84]; Enterprise switch to disable public links [S81].
  - **Airtable:** audit logs include share-link events [S75].
  - **monday:** board owner or admin can disable a shared view [S63].
  - **Front:** admin disables guests company-wide, which revokes access to past conversations [S120].
- **What separates good from weak:**
  - **An inventory page,** not only audit events.
  - **Bulk revoke.**
  - **Revocation effective immediately.**
  - **Shares cleaned up on offboarding** (Close does not) [S40].
- **Rating:** **DIFFERENTIATOR**

---

### 4. PRINT, PDF and document generation

#### P1. Print or PDF of a single record

- **What it is:** a clean printable or PDF rendering of one record.
- **Who has it:**
  - **Linear:** individual issues _"PDF: Use print dialog"_ [S92].
  - **Notion:** PDF export with page format, scale, _"Include subpages"_ (Business and Enterprise); if PDF fails, falls back to HTML [S80].
  - **Airtable:** Page designer extension on paid plans; custom per-record layout; prints _"a single record or all of the records in a view"_. It cannot be triggered by an automation to attach the PDF back [S76]. Print is available to every base role unless Enterprise export controls block it [S78][S71].
  - **Salesforce:** "Printable View" on records _(not verified this pass)_.
  - **Zendesk:** ticket printing exists in its help-centre index (not read this pass).
- **What separates good from weak:**
  - **A print stylesheet or template, not a screenshot of the app.**
  - **Related lists included.**
  - **Print counted as an export,** blockable by policy (Airtable) [S71].
- **Rating:** **COMMON**

#### P2. PDF of a report or dashboard

- **Who has it:**
  - **monday:** _"Export to PDF"_ of whole dashboards, plus scheduled PDFs [S64].
  - **Zendesk Explore:** PDF and PNG in scheduled delivery [S104].
  - **Freshsales:** report PDF; _"the number of columns present in the report depends on the file size"_ [S51].
  - **Stripe:** Revenue Recognition reports in _"CSV, PDF or Excel"_ [S124].
  - **HubSpot:** report image export at an adjustable pixel width; email with _"visual of the report"_ [S12].
  - **Front:** custom dashboards have no export [S118].
- **Rating:** **COMMON**

#### P3. Document generation from a record (templates with merge fields)

- **What it is:** templates that fill from record fields and produce DOCX or PDF, often with e-signature.
- **Who has it:**
  - **Zoho CRM:** mail-merge templates in Zoho Writer with merge fields across modules, image fields, subforms (≤10 fields) and related-list tables (≤3 per template, ≤100 items). Output as PDF, DOCX or inline email. Quota: _"1000 merges/month/org"_ on paid editions, extra at $0.05 each, daily cap 1,000. Logs for merges sent. Word and PDF templates can be imported [S47].
  - **Pipedrive:** Smart Docs templates _"automatically pull products from your catalog or information from any Pipedrive field"_; company-wide template sharing; eSignatures; DocuSign integration [S30].
  - **HubSpot:** quote templates with contact, company and deal tokens; Dropbox Sign e-signature; expiry; approvals [S16].
  - **Stripe:** invoice PDFs with business branding and support details [S129].
  - **Work tools** (monday, ClickUp, Notion, Linear, Airtable): document generation not encountered in the reviewed pages.
- **What separates good from weak:**
  - **Related-list tables in templates.**
  - **Bulk generation with quotas shown.**
  - **Generated documents saved back to the record.**
  - **Versioned templates with company-wide sharing.**
  - **E-signature and view tracking.**
  - **An approval step before sending.**
- **Rating:** **COMMON** in sales CRMs; a **DIFFERENTIATOR** elsewhere.

---

### 5. APIs as an export path

| Product    | Async or bulk export                                                                                                                                                         | Rate limits (headline)                                                                                                                                                | Source             |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ |
| HubSpot    | **Exports API**: start, poll, download. View- or list-based; CSV, XLSX, XLS; up to 4 associated objects; URL valid **5 min**; 1 concurrent, 30 per 24 h                      | Private apps per 10 s / per day: Free and Starter 100 / 250k; Pro 190 / 625k; Enterprise 190 / 1M; add-on +1M per day (max two). Public apps 110 per 10 s per account | [S17][S18]         |
| Salesforce | Data Loader (UI or CLI) for very large volumes; Bulk API                                                                                                                     | _(Bulk API 2.0 limits not fetched; developer docs returned 403)_                                                                                                      | [S20]              |
| Close      | **Export API**: `format=csv/json`; `type=leads/contacts/lead_opps`; `fields`; `include_activities`; `include_smart_fields`; emailed link (`send_done_email`)                 | n/a                                                                                                                                                                   | [S41]              |
| Zendesk    | **Incremental Exports** (cursor or time-based; 1,000 per page; data within the last minute excluded): tickets, ticket events, users, organisations, custom objects, articles | Incremental 10 rpm (30 with add-on). Plan rpm: Team 200, Growth and Professional 400, Enterprise 700, Enterprise Plus 2,500                                           | [S108][S109][S107] |
| Intercom   | Data Export API covers _engagement statistics_, not conversation content; _"one active job per workspace"_; `download_expires_at`                                            | 10,000 calls per minute per app, 25,000 per workspace, spread across 10-second windows                                                                                | [S115][S116]       |
| Stripe     | Sigma (SQL) and scheduled queries; Data Pipeline to a warehouse or object store every 3 h; report runs via API                                                               | 100 rps live, 25 rps per endpoint; read allocation of 500 reads per transaction per 30 days (min 10,000 a month); data and reporting endpoints exempt                 | [S123][S130][S122] |
| Attio      | n/a                                                                                                                                                                          | 100 rps read, 25 rps write; score-based limits on list endpoints                                                                                                      | [S36]              |
| Airtable   | n/a                                                                                                                                                                          | 5 rps per base, 50 rps per user token; monthly calls: Free 1,000, Team 100,000; 30 s penalty on 429                                                                   | [S79]              |
| Notion     | n/a                                                                                                                                                                          | 180 rpm (about 3 rps); Business and Enterprise 600 rpm                                                                                                                | [S85]              |
| Linear     | GraphQL; Airbyte and Google Sheets integrations                                                                                                                              | API key 2,500 requests per hour and 3M complexity points per hour; max 10,000 points per query                                                                        | [S97][S92]         |
| Front      | n/a                                                                                                                                                                          | Starter 50, Professional 100, Enterprise 200 rpm; analytics 1 request per 3 s                                                                                         | [S121]             |
| monday     | n/a                                                                                                                                                                          | Daily calls: Free/Standard/Basic 1,000, Pro 10,000, Enterprise 25,000; complexity 5–10M per minute                                                                    | [S68]              |

- **What separates good from weak:**
  - **A first-class asynchronous bulk export endpoint** (HubSpot, Close), not just paginated reads.
  - **Incremental or cursor export** for syncing (Zendesk).
  - **Export governance and audit apply to the API too.** Zendesk's UI restriction _"doesn't apply to API data exports"_ [S99].
  - **Rate-limit headers and clear 429 reasons:** Stripe's `Stripe-Rate-Limited-Reason` [S123].
  - **A warehouse or object-store feed for analytics** (Stripe).
- **Rating:**
  - Rate-limited REST or GraphQL API: **TABLE STAKES**.
  - Asynchronous bulk export endpoint: **COMMON**.
  - Incremental export: **COMMON**.
  - Managed warehouse sync: **DIFFERENTIATOR**.

---

### 6. Buyer-side signal

- Capterra lists _"Data Import/Export"_ as a CRM feature filter. Its research names it among the features **reviewers value most**, alongside Contact Management, Reporting/Analytics, Sales Pipeline Management and Workflow Management. _"Quotes/Estimates"_ and _"Document Storage"_ are also listed filters [S131].
- G2's CRM category page refused automated access (HTTP 403), so it was not read.

---

### 7. A checklist to measure HQ against

The checklist is ordered by rating. Each line names the behaviour to test, not just the feature.

#### Table stakes: a buyer assumes these exist

1. **Export the current view.** It honours filters, columns and sort, offers "visible columns vs all fields", includes the record ID, and exports only rows the user may see (E1, E12).
2. **CSV and XLSX,** with encoding handled and large files split (E2).
3. **Asynchronous export jobs.** Statuses are queued, running, done and failed; the user is notified; the download link needs authentication and expires; an export log is kept (E3).
4. **Export is its own permission,** enforced identically in UI and API (E5).
5. **Admin "export everything" backup** that includes notes, activities and files, with stated exclusions (E8).
6. **Scheduled report or dashboard email** to internal users (E7).
7. **Import CSV or XLSX** with auto-mapping, upsert on a unique key (create, update or both), a downloadable per-row error file, and import history with who and when (I2–I8, I11).
8. **Owner mapping by email** with a default owner (I10).
9. **Shareable deep links** with a permission check on open (S-1).
10. **Saved views shareable** with a team, users or everyone (S-2).
11. **Dashboards shared** at view or edit level (S-3).

#### Common: expected from a mature tool

12. Admin-only export switch (E5).
13. Exports in the security audit log, filterable and exportable (E6).
14. Subject-access export for one person, with a request tracker (E9).
15. Undo of created records within a stated window (I9).
16. Update semantics: skip blanks, overwrite, append to multi-value fields (I5).
17. Preview of outcomes before commit (I6).
18. Saved import mappings (I3).
19. Association-aware, multi-object import (I1).
20. Guest or view-only access, scoped and with expiring invites (S-5).
21. Share to Slack or Teams without leaking private data (S-7).
22. PDF of a record or report (P1, P2).
23. Document generation from templates with merge fields (P3).
24. Asynchronous bulk export API (§5).

#### Differentiators: worth building where the fintech context makes them matter

25. **Export approvals** above a threshold, with an always-approve rule for sensitive fields (HubSpot pattern) (E5).
26. **Rollback of updates made by an import** (HubSpot Restore CRM changes) (I9).
27. **CSV formula-injection protection** on by default (E13).
28. **Public links done properly:** server-side field minimisation, password with lockout, expiry, rotate, kill switch, and an inventory of live links (S-4, S-10).
29. **Role-tiered export row limits and daily export caps** (E4).
30. **Scheduled raw-data feed** to storage the company owns (Stripe Data Pipeline pattern) (E7).

---

### 8. Sources

**HubSpot**

- [S1] https://knowledge.hubspot.com/import-and-export/export-records
- [S2] https://knowledge.hubspot.com/import-and-export/import-objects
- [S3] https://knowledge.hubspot.com/import-and-export/view-and-analyze-previous-imports
- [S4] https://knowledge.hubspot.com/import-and-export/set-up-your-import-file
- [S5] https://knowledge.hubspot.com/object-settings/restore-crm-changes
- [S6] https://community.hubspot.com/t5/HubSpot-Ideas/Roll-back-the-property-changes-undo-made-by-Import/m-p/3139
- [S7] https://knowledge.hubspot.com/user-management/hubspot-user-permissions-guide
- [S8] https://knowledge.hubspot.com/import-and-export/export-approvals
- [S9] https://knowledge.hubspot.com/account-management/view-and-export-account-activity-history
- [S10] https://knowledge.hubspot.com/account-management/manage-seats
- [S11] https://knowledge.hubspot.com/records/create-and-manage-saved-views
- [S12] https://knowledge.hubspot.com/dashboard/email-or-export-reports-and-dashboards
- [S13] https://knowledge.hubspot.com/privacy-and-consent/manage-data-privacy-requests
- [S14] https://knowledge.hubspot.com/import-and-export/export-contact-data
- [S15] https://knowledge.hubspot.com/privacy-and-consent/how-do-i-perform-a-gdpr-delete-in-hubspot
- [S16] https://knowledge.hubspot.com/quotes/create-custom-quote-templates
- [S17] https://developers.hubspot.com/docs/guides/api/crm/exports
- [S18] https://developers.hubspot.com/docs/developer-tooling/platform/usage-guidelines

**Salesforce**

- [S19] https://trailhead.salesforce.com/content/learn/modules/lex_implementation_data_management/lex_implementation_data_export
- [S20] https://trailhead.salesforce.com/content/learn/modules/lex_implementation_data_management/lex_implementation_data_import
- [S21] https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.reports_export.htm&language=en_US
- [S22] https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.reports_subscribe_lex.htm&language=en_US
- [S23] https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.content_delivery_create.htm&language=en_US
- [S24] https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/api/sforce_api_objects_reportexporteventlog.htm (found by search; the direct fetch returned 403)
- [S25] https://developer.salesforce.com/docs/atlas.en-us.api_meta.meta/api_meta/meta_foldershare.htm and https://resources.docs.salesforce.com/210/latest/en-us/sfdc/pdf/salesforce_analytics_folder_sharing_cheatsheet.pdf (folder access levels, via search)

**Pipedrive**

- [S27] https://support.pipedrive.com/en/article/exporting-data-from-pipedrive
- [S28] https://support.pipedrive.com/en/article/importing-data-into-pipedrive-with-spreadsheets
- [S29] https://support.pipedrive.com/en/article/permission-sets
- [S30] https://www.pipedrive.com/en/features/smart-docs
- [S31] https://www.pipedrive.com/en/features/insights-and-reports

**Attio**

- [S32] https://attio.com/help/reference/imports-exports/exporting-lists-and-views
- [S33] https://attio.com/help/reference/security-and-privacy/back-up-your-workspace-data
- [S34] https://attio.com/help/reference/imports-exports/csv-imports/import-data-into-attio-via-csv
- [S35] https://attio.com/help/reference/imports-exports/csv-imports/bulk-update-records-via-csv-import
- [S36] https://docs.attio.com/rest-api/guides/rate-limiting

**Close**

- [S37] https://help.close.com/docs/exporting-data
- [S38] https://help.close.com/docs/importing-leads-from-file
- [S39] https://help.close.com/docs/restricted-user-role.md
- [S40] https://help.close.com/docs/smart-views
- [S41] https://developer.close.com/api/resources/exports/create-lead.md
- [S42] https://help.close.com/docs/roles-permissions

**Zoho CRM**

- [S43] https://help.zoho.com/portal/en/kb/crm/data-administration/export-data/articles/export-crm-data
- [S44] https://help.zoho.com/portal/en/kb/crm-v2-1/data-administration/import-data/articles/crm-v2-view-import-history
- [S45] https://help.zoho.com/portal/kb/articles/requesting-data-backup
- [S46] https://www.zoho.com/crm/developer/docs/api/v6/schedule-data-backup.html
- [S47] https://help.zoho.com/portal/kb/articles/mail-merge-templates

**Freshsales**

- [S48] https://crmsupport.freshworks.com/support/solutions/articles/50000002586-how-to-import-records-contacts-accounts-deals-from-a-csv-xlsx-file-
- [S49] https://support.freshsales.io/support/solutions/articles/50000001894-how-do-i-export-all-required-data-from-the-crm-
- [S50] https://support.freshsales.io/support/solutions/articles/240077-how-can-i-monitor-the-progress-of-csv-imports-and-view-import-history-
- [S51] https://support.freshsales.io/support/solutions/articles/221712-how-to-export-reports

**Copper**

- [S52] https://support.copper.com/hc/en-us/articles/209926033
- [S53] https://support.copper.com/en/articles/8823353-update-records-on-import
- [S54] https://www.copper.com/resources/import2-simplifies-migrating-your-data-into-copper

**Folk**

- [S55] https://help.folk.app/en/articles/5865891-import-contacts-from-a-file
- [S56] https://help.folk.app/en/articles/5007388-export-data
- [S57] https://help.folk.app/en/articles/5007403-manage-duplicates

**Twenty**

- [S58] https://docs.twenty.com/user-guide/data-migration/overview.md
- [S59] https://docs.twenty.com/user-guide/data-migration/migrating-from-other-crms

**monday.com**

- [S60] https://support.monday.com/hc/en-us/articles/26989749858578-Export-from-monday-to-Excel
- [S61] https://support.monday.com/hc/en-us/articles/360000219209-Import-files-from-Excel
- [S62] https://support.monday.com/hc/en-us/articles/115005321509-The-Administration-section-on-monday-com
- [S63] https://support.monday.com/hc/en-us/articles/360009695080-How-to-share-a-board-view-publicly
- [S64] https://support.monday.com/hc/en-us/articles/26237863849490-Share-and-present-your-Dashboard
- [S65] https://support.monday.com/hc/en-us/articles/360002144900-User-types-explained
- [S66] https://support.monday.com/hc/en-us/articles/360000292500-How-to-share-projects-with-guests
- [S67] https://support.monday.com/hc/en-us/articles/34336185460498-monday-com-secure-configuration-checklist
- [S68] https://developer.monday.com/api-reference/docs/rate-limits
- [S69] https://support.monday.com/hc/en-us/articles/360004990799-How-to-import-projects-from-Asana (and sibling importers for Trello, Jira Server, Basecamp, Google Sheets and Zendesk, listed in the same "Import your work" section)

**Airtable**

- [S70] https://support.airtable.com/articles/4130354023-using-the-view-share-menu-in-airtable
- [S71] https://support.airtable.com/articles/7002681256-collaboration-export-controls-in-admin-panel
- [S72] https://support.airtable.com/articles/3067164948-csv-import-extension
- [S73] https://support.airtable.com/articles/5415076460-using-airtable-portals-for-external-collaborators
- [S74] https://support.airtable.com/articles/6973404921-embedding-airtable-views-and-bases
- [S75] https://support.airtable.com/articles/1665450173-accessing-enterprise-audit-logs-in-airtable
- [S76] https://support.airtable.com/articles/9892380240-printing-from-the-page-designer-extension
- [S77] https://support.airtable.com/articles/2163132802-taking-and-restoring-snapshots-in-airtable
- [S78] https://support.airtable.com/articles/5450095623-airtable-base-permissions
- [S79] https://support.airtable.com/articles/7735693959-managing-api-call-limits-in-airtable

**Notion**

- [S80] https://www.notion.com/help/export-your-content
- [S81] https://www.notion.com/help/public-pages-and-web-publishing
- [S82] https://www.notion.com/help/sharing-and-permissions
- [S83] https://www.notion.com/help/import-data-into-notion
- [S84] https://www.notion.com/help/audit-log
- [S85] https://developers.notion.com/reference/request-limits

**ClickUp**

- [S86] https://help.clickup.com/hc/en-us/articles/30782347809815-Import-and-export-feature-availability-and-limits
- [S87] https://help.clickup.com/hc/en-us/articles/6310875506839-Manage-imports
- [S88] https://help.clickup.com/hc/en-us/articles/6310022323991-Guest-type-user-roles
- [S89] https://help.clickup.com/hc/en-us/articles/6309298874775-Share-locations-and-items-with-a-public-link
- [S90] https://help.clickup.com/hc/en-us/articles/33077853953943-Public-views-authentication
- [S91] https://help.clickup.com/hc/en-us/articles/30105280636951-Allow-requests-for-full-edit-permissions

**Linear**

- [S92] https://linear.app/docs/exporting-data
- [S93] https://linear.app/docs/import-issues
- [S94] https://linear.app/docs/members-roles
- [S95] https://linear.app/docs/audit-log
- [S96] https://linear.app/docs/slack
- [S97] https://linear.app/developers/rate-limiting

**Zendesk**

- [S98] https://support.zendesk.com/hc/en-us/articles/4408886165402 (Exporting ticket, user, or organization data from your account)
- [S99] https://support.zendesk.com/hc/en-us/articles/5388932900250 (Restricting or deactivating account data exports)
- [S100] https://support.zendesk.com/hc/en-us/articles/11005636989850 (How do I export my data and reports from all Zendesk products?)
- [S101] https://support.zendesk.com/hc/en-us/articles/4408886501786 (Export a select group of tickets to CSV)
- [S102] https://support.zendesk.com/hc/en-us/articles/4408823195930 (Complying with privacy and data protection law in Zendesk Support)
- [S103] https://support.zendesk.com/hc/en-us/articles/4408827282714-Sharing-dashboards
- [S104] https://support.zendesk.com/hc/en-us/articles/4408843602714 (Scheduling dashboard deliveries)
- [S105] https://support.zendesk.com/hc/en-us/articles/4408826905626 (Sharing dashboards outside of Zendesk)
- [S106] https://support.zendesk.com/hc/en-us/articles/6696005837082 (Migrating from another platform)
- [S107] https://support.zendesk.com/hc/en-us/articles/4408887009306 (Recommended method to regularly export data)
- [S108] https://developer.zendesk.com/api-reference/ticketing/ticket-management/incremental_exports/
- [S109] https://developer.zendesk.com/api-reference/introduction/rate-limits/
- [S110] https://support.zendesk.com/hc/en-us/articles/4408845638298 (Sell: importing leads and contacts)
- [S111] https://support.zendesk.com/hc/en-us/articles/4408845246746 (Sell: importing deals, reverting)

**Intercom**

- [S112] https://www.intercom.com/help/en/articles/8205716.md (Seats: full vs lite)
- [S113] https://www.intercom.com/help/en/articles/4667982-review-actions-taken-in-your-workspace-with-teammate-activity-logs
- [S114] https://www.intercom.com/help/en/articles/9396032.md (Historical data migration to Intercom)
- [S115] https://developers.intercom.com/docs/references/rest-api/api.intercom.io/data-export
- [S116] https://developers.intercom.com/docs/references/rest-api/errors/rate-limiting

**Front**

- [S117] https://help.front.com/en/articles/2147 (Export analytics)
- [S118] https://help.front.com/en/articles/3683008 (Custom report dashboard)
- [S119] https://help.front.com/en/articles/2058 (Import and export contacts with a CSV)
- [S120] https://help.front.com/en/articles/2391 (Invite guests)
- [S121] https://dev.frontapp.com/docs/rate-limiting

**Stripe**

- [S122] https://docs.stripe.com/stripe-data/schedule-queries
- [S123] https://docs.stripe.com/rate-limits
- [S124] https://docs.stripe.com/reports
- [S125] https://docs.stripe.com/reports/options
- [S126] https://docs.stripe.com/dashboard/basics
- [S127] https://docs.stripe.com/data
- [S128] https://docs.stripe.com/get-started/account/teams/roles
- [S129] https://docs.stripe.com/invoicing/hosted-invoice-page
- [S130] https://docs.stripe.com/data/access-data-in-warehouse

**Buyer-side**

- [S131] https://www.capterra.com/customer-relationship-management-software/

_(S26 is deliberately unused. A Salesforce Transaction Security page title was reachable, but its body was not, so no claim rests on it.)_

# §B. Data safety, governance and administration (the full report)

## B. Data safety, governance and administration: what serious business SaaS ships as standard

Research brief for HQ (internal CRM + support desk + revenue + team admin portal, small fintech).
Compiled 2026-10-03 from vendor help centres, developer docs, trust pages and security-framework sources.
About 150 distinct pages are cited; every tag such as [H4] or [ZD3] resolves to a URL in section 13.

---

### 0. How to read this

**Ratings**

- **TABLE STAKES**: nearly every product sampled has it, at least on the paid tier a business would buy. Missing it is a reason to fail a vendor review.
- **COMMON**: many have it, usually on business or enterprise tiers.
- **DIFFERENTIATOR**: few have it. Done well, it is a selling point.

**Products sampled (17 + 2 admin-console references):** HubSpot, Salesforce, Pipedrive, Attio, Close, Zoho CRM, Freshsales, Copper, Twenty (open source), monday.com, Airtable, Notion, ClickUp, Linear, Zendesk, Intercom, Front; plus Slack and Google Workspace for how mature admin consoles behave.

**Evidence quality**

- Untagged statements are analysis or synthesis.
- `(snippet)` means the fact came from a search-engine extract of the vendor page, because the page itself would not render for a machine reader. This applies to monday.com support, parts of Intercom and one ClickUp page.
- `(community)` and `(3rd party)` mark non-vendor sources.
- Anything I could not confirm is listed in section 12 rather than stated as fact.

**One structural observation.** Almost every governance feature exists in two forms: a basic form on paid tiers (trash, roles, 2FA, timeline) and an enterprise form (audit API, SCIM, retention policies, residency, access logs, BYOK). Buyers' security questionnaires ask about the enterprise form. Section 10 maps this.

---

### 1. The top 30 at a glance

| #   | Feature                                                                     | Rating                                                   | The behaviour that matters most                                                                                                                                                                  |
| --- | --------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | Trash / recycle bin with a restore window                                   | TABLE STAKES                                             | 30 to 90 days, every object type, restore puts the record back where it was (stage, view, owner)                                                                                                 |
| 2   | Restore fidelity (associations, activities, children)                       | DIFFERENTIATOR                                           | Restore is the exact inverse of delete. Where it is not, the UI says what will not come back (HubSpot loses list membership and workflow enrolment; Freshsales loses account-to-deal links)      |
| 3   | "Delete" and "permanently delete / purge" as separate permissions           | COMMON                                                   | Most users can only soft-delete. Purge is restricted, logged and irreversible (Twenty "Delete" vs "Destroy"; HubSpot "Permanently delete contacts")                                              |
| 4   | Bulk restore by filter or date range                                        | COMMON                                                   | Select everything deleted in a window, with a confirmation count (HubSpot: up to 10,000 at a time). ClickUp cannot restore multiple items, which is the weak end                                 |
| 5   | Archive as distinct from delete                                             | COMMON                                                   | Archive hides the record and keeps it indefinitely and searchable. Delete starts a purge clock (monday.com, Linear, Zendesk, Attio)                                                              |
| 6   | Undo for the last action                                                    | COMMON                                                   | Ctrl/Cmd+Z or an undo toast for single and bulk edits (Linear, monday.com). Bulk actions with no undo are the norm and a known complaint                                                         |
| 7   | Point-in-time rollback of bulk or automated changes                         | DIFFERENTIATOR                                           | HubSpot "Restore CRM changes": 14 days, filter by user, import, integration or workflow, preview, then selective restore                                                                         |
| 8   | Field-level change history                                                  | TABLE STAKES                                             | Old and new value, actor, timestamp and source (UI, API, import, automation), on every field, including automation-written ones                                                                  |
| 9   | Restore a previous value or version from history                            | DIFFERENTIATOR                                           | One click back to a prior value or version (Notion page versions; HubSpot restore). Airtable's and Salesforce's history is view-only                                                             |
| 10  | Admin and security audit log                                                | TABLE STAKES at enterprise tier                          | Logins, MFA changes, role and permission changes, exports, deletes, settings, API tokens; each entry carries actor, IP and the change                                                            |
| 11  | Audit retention of at least a year, with search and export                  | DIFFERENTIATOR                                           | Zendesk keeps it "indefinitely" and Notion keeps 365 days. ClickUp (60 days), Linear (90) and Airtable (180) fall short of what auditors ask for                                                 |
| 12  | Audit log API and SIEM streaming                                            | COMMON (enterprise)                                      | Push to a signed webhook or a SIEM connector (Notion, Linear, Zendesk), not just a CSV button                                                                                                    |
| 13  | Read-access ("who viewed this") logging for sensitive data                  | DIFFERENTIATOR                                           | Zendesk access logs cover tickets, profiles and searches for 90 days and stream to a SIEM. HubSpot logs sensitive-property access                                                                |
| 14  | Login history, device list and security alerts                              | COMMON / alerts are DIFFERENTIATOR                       | Per-user sign-ins with IP and device, new-device and new-location flags, force logout, and a monthly digest (Pipedrive)                                                                          |
| 15  | Roles, then custom roles or permission sets                                 | TABLE STAKES / custom is COMMON                          | Ship a restricted role by default. Custom roles split the risky verbs out (export, import, bulk edit, bulk delete, merge)                                                                        |
| 16  | Record-level access (own / team / all, sharing rules, row-level)            | TABLE STAKES (CRMs)                                      | Enforced everywhere: lists, search, reports, exports, API and AI. Salesforce restriction rules enumerate every surface                                                                           |
| 17  | Field-level permissions (hidden, read-only)                                 | COMMON                                                   | Per role, enforced in the API too (Freshsales on every plan; Airtable edit limits apply to the API)                                                                                              |
| 18  | Restricted seats for guests, viewers, light agents and contractors          | COMMON                                                   | Scoped to specific teams or records, no export, PII fields hidden, cannot invite others (Linear guests, Zendesk light agents, ClickUp limited members)                                           |
| 19  | Export governance                                                           | COMMON; approvals are DIFFERENTIATOR                     | A separate export permission, an optional approval step (HubSpot "Export without approval"), expiring links (30 days) and an export log (kept 3 years)                                           |
| 20  | Login-as / impersonation with consent and audit                             | COMMON                                                   | User-granted and time-boxed (Salesforce: maximum 1 year). Every action is attributed "A as B" in the audit trail                                                                                 |
| 21  | Enforced MFA                                                                | TABLE STAKES                                             | Admin-enforced for everyone, no per-user exclusions, grace period, phishing-resistant options (HubSpot: mandatory on paid plans and cannot be turned off)                                        |
| 22  | SAML SSO with enforcement and break-glass                                   | TABLE STAKES at enterprise tier                          | Domain verification, "SSO only" mode, one exempt owner for IdP outages. Usually sold behind the "SSO tax"                                                                                        |
| 23  | SCIM provisioning and deprovisioning                                        | COMMON (enterprise)                                      | Deprovisioning kills every session immediately (Notion); groups map to roles                                                                                                                     |
| 24  | Session controls                                                            | COMMON                                                   | Idle and absolute timeouts, a warning before sign-out, admin remote sign-out, device list. Zendesk defaults to 60 minutes for agents; ClickUp defaults to "never expires", which is the weak end |
| 25  | IP allowlisting                                                             | COMMON (enterprise)                                      | Per user, role or group, also enforced on the API, with a documented lock-out recovery (Zendesk, Zoho, Salesforce)                                                                               |
| 26  | Offboarding: suspend, bulk-transfer ownership, revoke credentials           | TABLE STAKES (quality varies)                            | Freeze immediately, transfer open work in bulk, revoke API keys (Close does this automatically), and never destroy data (ClickUp deletes a leaver's private items)                               |
| 27  | Retention schedules and GDPR erasure                                        | COMMON                                                   | Condition-based deletion schedules (Zendesk) and erasure that blocks re-creation by import (HubSpot block-list), with documented purge windows                                                   |
| 28  | Backups / snapshots and sandboxes                                           | DIFFERENTIATOR (backups) / COMMON (enterprise sandboxes) | Customer-triggered snapshots restorable to a copy (Airtable), scheduled downloadable backups (Zoho), sandboxes that can deploy changes back (HubSpot, Zoho)                                      |
| 29  | Data quality: required fields, validation, duplicate prevention, safe merge | TABLE STAKES / validation is COMMON                      | Enforced on every write path (UI, import, API, forms). Block vs warn duplicates. Merge preview with a field picker. Unmerge is rare                                                              |
| 30  | Integration security                                                        | TABLE STAKES (signing, limits) / COMMON (scopes)         | Scoped, rotatable, owner-tagged tokens; admin approval of OAuth apps; HMAC-signed webhooks with timestamp, retries and backoff, auto-disable with alert; documented rate limits with Retry-After |

Also covered below, and worth knowing: DSAR tooling and lawful-basis tracking (Zoho is the reference), sensitive-data redaction and masking (HubSpot, Zendesk), data residency, BYOK, outbound email authentication (SPF, DKIM, DMARC), status pages, security-posture pages, usage dashboards and configuration promotion.

---

### 2. Recycle bin, restore, undo and archive

#### 2.1 Soft delete with a restore window: TABLE STAKES

**What it is.** A deleted record goes to a trash or recycle bin for a fixed window and can be restored before it is purged.

**Who has it**

| Product                  | What goes to trash                                                                                                                                      | Window                                                                                                                        | Who can restore                                                                                                                | Source      |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | ----------- |
| HubSpot                  | The KB lists contacts, companies, emails, products, appointments and custom objects. Activities (notes, calls, meetings, tasks) have a separate restore | 90 days                                                                                                                       | Records: "Account access and Add and edit users" permissions. Activities: "Add and edit users" or Super Admin                  | [H1] [H2]   |
| Salesforce               | Most records                                                                                                                                            | 15 days                                                                                                                       | Own items (needs Read). Admins with "Modify All Data" see everything                                                           | [S1]        |
| Pipedrive                | Deals, people, organisations, activities, products, leads                                                                                               | 30 days                                                                                                                       | Lite and Growth plans: anything the user can see. Premium and up: only their own deletions, unless they may edit others' items | [P1] [P2]   |
| Zoho CRM                 | "All records and files"                                                                                                                                 | 60 days                                                                                                                       | Depends on role hierarchy and view permissions                                                                                 | [Z1]        |
| Freshsales               | Contacts, accounts, deals                                                                                                                               | 90 days                                                                                                                       | Free plan and up                                                                                                               | [F1]        |
| Twenty                   | Any record (soft delete)                                                                                                                                | Not stated                                                                                                                    | Holders of "Delete Records". "Destroy Records" is separate                                                                     | [T1] [T2]   |
| monday.com               | Items, subitems, columns, groups, boards, docs, dashboards                                                                                              | 30 days                                                                                                                       | "Only admins and the person who deleted the item" (snippet)                                                                    | [M1] [M2]   |
| Airtable                 | Base trash: tables, views, fields, extensions, records, interfaces. Workspace trash: bases                                                              | 7 days (base); 30 days (workspace); 30, 60, 90 or 180 days on Enterprise Scale                                                | Editors restore views and records; Creators restore tables and fields; Owners restore bases                                    | [AT1]       |
| Notion                   | Pages and databases                                                                                                                                     | 30 days, then another 30 before the content is "inaccessible to all users, even workspace owners". Configurable on Enterprise | "Can edit" access                                                                                                              | [N1]        |
| ClickUp                  | Tasks, lists, folders, spaces, docs, dashboards, custom fields, whiteboards, time entries and more                                                      | 30 days                                                                                                                       | Members and guests see only their own deletions; owners and admins see any public item                                         | [CK1]       |
| Linear                   | Issues                                                                                                                                                  | 30 days ("Recently deleted issues"), plus Cmd/Ctrl+Z                                                                          | Not restricted in the docs                                                                                                     | [L1]        |
| Zendesk                  | Tickets                                                                                                                                                 | 30 days in the "Deleted tickets" view; the soft-deleted shell is removed 90 days after deletion                               | Admins; agents need a permission                                                                                               | [ZD1] [ZD2] |
| Front                    | Conversations                                                                                                                                           | No automatic purge, unless a retention policy is on (then 7 days in trash)                                                    | Inbox users                                                                                                                    | [FR1] [FR2] |
| Google Workspace (admin) | User accounts; a user's emptied Drive trash                                                                                                             | 20 days (users); 25 days after the trash was emptied (Drive)                                                                  | Super admin                                                                                                                    | [G1] [G2]   |
| Attio                    | Nothing                                                                                                                                                 | None: "once a record is deleted, it cannot be recovered by you or your team"                                                  | n/a                                                                                                                            | [A1] [A2]   |
| Intercom                 | Contacts and conversations                                                                                                                              | Archive is a soft state. Permanent deletes are held about 7 days and only support can recover them (community)                | Intercom support                                                                                                               | [I2]        |
| Close                    | Leads (bulk delete supported)                                                                                                                           | Restore not documented                                                                                                        | n/a                                                                                                                            | [C1]        |
| Copper                   | n/a                                                                                                                                                     | Not documented in the help centre                                                                                             | n/a                                                                                                                            | n/a         |

**What separates good from weak**

- **Good:** the window covers every object type, including activities, notes and files. Pipedrive's restore page does not mention notes or files [P1]; HubSpot handles activities on a separate page [H2].
- **Good:** restore puts the record back exactly where it was. Pipedrive "will reopen the deal to the same stage" [P2]; Zendesk returns the ticket to "the view it was in before it was deleted" [ZD1].
- **Good:** the window is long enough to notice a mistake. 30 days is the floor among good implementations; 60 to 90 is better (Zoho, Freshsales, HubSpot). Salesforce's 15 days and Airtable's 7-day base trash are short.
- **Weak:** permanent-on-delete with no bin (Attio). Attio's own docs point users at "extremely careful" deletes [A1], and third-party backup apps exist to fill the gap [A10].
- **Weak:** silent purge before the window ends. Salesforce Help now says "There isn't a limit on the number of deleted records that the Recycle Bin can hold" [S1], but backup vendors still describe an older 25-times-storage cap that purged the oldest records first [S2]. If a bin has a size cap, say so in the UI.

**Edge cases worth copying (or avoiding)**

- HubSpot cannot restore a contact if an active contact shares its primary or secondary email. GDPR and permanent deletes never enter the bin [H1].
- Deleting an archived Zendesk ticket bypasses the Deleted view entirely. It "cannot be searched for or restored from the agent interface", only through the API with ticket IDs [ZD1].
- Notion's purge is two-stage: 30 days in trash, then 30 more days before it is gone even for owners [N1].

#### 2.2 Restore fidelity: DIFFERENTIATOR

**What it is.** Whether a restored record comes back with its associations, activities, children, list memberships and automation state.

**Who has it, and what each loses**

- **HubSpot.** Even a restorable delete permanently removes "List membership", unenrols the contact from workflows (no re-enrolment), removes "Associations between the contact record and its previous engagements", and deletes integration data and lifecycle-stage transition data [H3].
- **Freshsales.** A contact restore brings back "call logs, contact list associations, and related chats". When an account is deleted, its "association with any related deal or child account is lost permanently" [F1].
- **Pipedrive.** "linked items will be restored as well". Admins can also restore deleted pipelines and stages, and activities are re-synced to Google or Outlook calendars [P1].
- **Salesforce.** Restores lookups such as parent accounts and parent cases, but "only restores lookup relationships that you don't replace with other relationships" [S1].
- **Notion.** Warns that when a database is restored, "all of its pages and their properties will be restored", but "any contents of the database pages, like text inside of the pages, won't be restored" [N1].
- **Airtable.** A snapshot restore creates a new base. Record, table and view IDs are preserved, but the app ID is new and revision history is not included [AT2].
- **Attio.** Deleting a record deletes its linked notes and files, and "Records previously merged with it are not restored" [A2].

**What separates good from weak**

- **Good:** restore is the inverse of delete. That means field values, associations in both directions, child objects, attachments, comments, segment and list membership, and IDs (so links and integrations keep working).
- **Good:** before restore, show what will not come back and why (HubSpot documents this, but in a KB article rather than the dialog). Check for conflicts such as a unique email now in use.
- **Good:** after restore, automations are re-evaluated rather than silently re-fired. HubSpot explicitly does not re-enrol restored contacts into workflows [H3].

#### 2.3 Separate "delete" and "purge" permissions: COMMON

- **Twenty.** Object permissions are "See / Edit / Delete Records" (soft delete, restorable) and a separate "Destroy Records" (permanent) [T1].
- **HubSpot.** "Permanently delete contacts permission is required" for GDPR-grade deletes [H13]. The Bulk delete toggle is separate from Delete [H8].
- **Zendesk.** "Administrators can view and recover deleted tickets. Agents must be granted permission" [ZD1].
- **Airtable.** Only Creators can "Empty trash" [AT1].
- **Freshsales.** "Forget" purges a contact from the recycle bin "forever" [F1].
- **Front.** A permanent delete "cannot be reversed by you or Front's Support team" and has no grace period [FR1].

**Good:** purge is an owner-level verb, needs a typed confirmation, writes an audit entry and, ideally, needs a second approver for bulk purges.

#### 2.4 Bulk restore: COMMON

- **HubSpot.** Checkboxes plus "Select all records in this date range", up to 10,000 records per pass [H1]. Activity restore asks you to type the number of activities being restored [H2].
- **Pipedrive.** "Select multiple items and click 'Restore (items)'" [P1].
- **Zoho CRM.** Filter the recycle bin by record attributes, then restore or delete the filtered set [Z1].
- **Freshsales.** Bulk restore and filters [F1].
- **ClickUp (weak).** "Multiple items cannot be restored at the same time" [CK1], even though its bulk toolbar can delete up to 1,000 tasks in one action [CK9].

**Good:** restore by "deleted by X between T1 and T2", which is the exact inverse of a bad bulk delete.

#### 2.5 Admin-configurable trash retention: DIFFERENTIATOR

- **Airtable Enterprise Scale.** Admins choose "30, 60, 90, and 180 days" for workspace trash [AT1] [AT6].
- **Notion Enterprise.** Workspace owners "may customize these settings" [N1].
- **Front and Slack.** The setting goes the other way: shorten retention for privacy [FR2] [SL2].

#### 2.6 Archive versus delete: COMMON

- **monday.com.** Archive "preserves all data and history indefinitely" and is recommended over delete (snippet) [M1].
- **Linear.** Closed issues auto-archive after a configurable period, and you can "Restore archived issues, projects, or cycles" [L1].
- **Attio.** Archiving is "softer" (`is_archived`); deletion is "permanent" [A1].
- **Zendesk.** Tickets closed for more than 120 days become archived. Deletion schedules act only on archived tickets [ZD3].
- **Intercom.** Archived users cannot be restored from the UI, only by re-import, return visit or a support request (community) [I2].
- **Front.** Archive, trash and permanent delete are three distinct states [FR1].

**Good:** archived data stays searchable and reportable, and archive is the default action in the UI. Delete is secondary.

#### 2.7 Undo: COMMON

- **Linear.** "the fastest way to restore it is to use Cmd/Ctrl Z" [L1].
- **monday.com.** Has an undo button (snippet) [M3].
- **Notion.** Page versions can be restored, and "you can always go back to the page as it was" [N1].
- **ClickUp.** No undo is documented for its bulk action toolbar, which can update up to 1,000 tasks [CK9].
- **Pipedrive.** No undo for bulk edits. Support can "revert from a backup" given the timestamp of the mistake (community) [P8]. An undo in the changelog "has not been introduced due to limitations and complexity" (community) [P9].

#### 2.8 Point-in-time rollback of bulk or automated changes: DIFFERENTIATOR

**What it is.** Undoing a bad import, workflow or integration sync after the fact, scoped by who or what made the change.

**Reference implementation: HubSpot**

- **Restore CRM changes** [H4]:
  - Roll records back "up to 14 days ago".
  - Filter by source: "CRM changes" (manual), "Import", "Integration" or "Workflow". For manual changes, filter further by user or property.
  - Prepare a preview and restore selectively by checkbox. Previews stay available for 14 days; restore history is kept 90 days.
  - Super Admin only. Available on Starter, Professional and Enterprise.
- **Workflow restore** [H5]:
  - Undo one workflow's effects within 14 days.
  - The preview groups "Deleted records", "Created records" and "Modified properties".
  - You confirm by typing the record count.

**Elsewhere**

- Airtable snapshot restore, into a new base [AT2].
- Third-party daily snapshots for Attio [A10].
- Vendor support restores for Pipedrive (community) [P8].

**Good:** diff preview; scope by actor, source, time window, object and property; selective restore; conflict handling when a value was edited again after the bad change; and the rollback itself is logged and reversible.

#### 2.9 Merge, and the missing unmerge: merge is TABLE STAKES; unmerge is DIFFERENTIATOR (no product verified)

**HubSpot**

- The primary record's values win, except where they are empty. You can pick values per property.
- All timeline activities and associations move to the merged record.
- A new Record ID is created (a beta preserves the primary ID).
- "It's not possible to unmerge records".
- Records involved in "250+ merges" cannot be merged again.
- Needs "Merge records" or Super Admin [H6].

**Attio**

- Merge combines list entries, notes, files, tasks, comments, call recordings and meetings.
- "The data for the record on the right is prioritized".
- Merging "creates a new record rather than keeping one of the two originals", with a new ID and URL.
- Only companies and people can be merged [A2].

**Others**

- Pipedrive gates merging behind separate permissions per object type [P3].
- Close's event log carries merge source and destination IDs [C2].
- Salesforce duplicate rules do not run on manual merges [S8].

**Good:** a merge preview with a field picker; old IDs keep resolving (redirect); and the merge writes a full pre-merge snapshot into history so it can be reverted. Nobody in the sample offers a true unmerge, so it is a genuine differentiator.

#### 2.10 Restoring a deleted user account: COMMON in admin consoles

- **Google Workspace.** A deleted user can be restored "up to 20 days after deleting it", by a super admin, if a licence is free [G1]. Drive data can be restored "within 25 days after a user empties their trash", but only as a batch covering every file removed in the chosen date range (no single-file restore), one restore project at a time, and afterwards "the user needs to reshare the item for others to have access" [G2].
- **Close.** Re-adding a removed user's email puts them "instantly ... back into the team" [C6].
- **ClickUp (anti-pattern).** Removal "is a permanent action and cannot be undone" [CK8].

---

### 3. History

#### 3.1 Record activity timeline: TABLE STAKES

**What it is.** A per-record feed of what happened (created, updated, deleted, restored, linked, emailed, commented), with who did it and when.

- **Twenty.** Timeline events for "created", "updated", "deleted", "restored", "linked" and "unlinked", which can fan out to related records [T6].
- **Zendesk.** Ticket audits are "a read-only history of all updates to a ticket", each with author, time and "via" channel [ZD19].
- **monday.com.** Board activity logs, queryable by item, column, group, user and time, up to 10,000 entries per request [M5].
- **Airtable.** The activity feed shows comments and revisions, and can be filtered to "All activity, Comments, or Revision history" [AT3].
- **Attio.** "Right click on any list attribute and you can now View edit history" [A9].
- **Close.** An event log of "most actions in Close that change an object" [C2].

#### 3.2 Field-level change history: TABLE STAKES (with large differences in depth)

**Salesforce**

- Standard field history tracks 20 fields per object. Data is guaranteed for 18 months in the UI and 24 months through the API (3rd party) [S12].
- Field Audit Trail (a Shield add-on) extends this to up to 10 years and 60 fields per object [S10].

**Airtable**

- Shows "which user made which changes, and when", including "Automations including the name of the specific automation that made the update", syncs and API calls [AT3].
- Retention: Free 2 weeks, Team 1 year, Business 2 years, Enterprise Scale 3 years [AT3].
- Limits: history "can't be exported"; changes "made to data that is syncing in from outside Airtable are hidden"; and owners can switch off "Show history" or clear it (clearing is irreversible) [AT3].

**Close**

- Events carry `changed_fields`, `data` and `previous_data`, plus `request_id`, `bulk_action_id`, request method and path [C2].
- Retention is 30 days.
- Consolidation means a field changed A to B to C shows only A and C [C2].

**HubSpot**

- Property history is time-stamped and attributed to a source such as a user, workflow or API (3rd party) [H23].
- Restore can filter by that source [H4].

**Zendesk**

- Every ticket field change, comment, tag and notification is an audit event [ZD19].

**Pipedrive**

- Has a per-record changelog but no undo from it (community) [P9].

**What separates good from weak**

- **Good:** every field is tracked by default, not a capped allow-list (Salesforce's 20 fields is the weak end).
- **Good:** every entry has old value, new value, actor type and name, source (UI, API, import, workflow, integration and which one) and a request or bulk ID that groups a bulk action.
- **Good:** entries are immutable, survive delete, restore and merge, and are exportable.
- **Weak:** short retention (Close's 30 days); intermediate values lost (Close); automation or sync writes hidden (Airtable sync); admins able to clear history (Airtable).

#### 3.3 Source attribution of changes: COMMON

- HubSpot restore separates "CRM changes", "Import", "Integration" and "Workflow" [H4].
- Airtable names the automation [AT3].
- Close links events by `request_id` and `bulk_action_id` [C2].
- Zendesk audit entries carry `source_type` and `source_id` [ZD5], and ticket audits carry a "via" object [ZD19].

This attribution is what makes rollback (2.8) and blame ("which integration overwrote this?") possible.

#### 3.4 Restore a previous value or version: DIFFERENTIATOR

- **Notion.** Version restore with retention by plan: "Free: 7 days, Plus: 30 days, Business: 90 days, Enterprise: unlimited" [N1].
- **HubSpot.** Restore by source and time (2.8) [H4].
- **Airtable.** Revision history is "view-only", with "No undo/revert functionality" from it [AT3].

#### 3.5 Long-term history for compliance: DIFFERENTIATOR

- Salesforce Field Audit Trail: up to 10 years [S10].
- Airtable Enterprise Scale: revision and snapshot history is adjustable "in 1 year increments up to a maximum of 10 years" (default 3) [AT6].
- Zendesk: the account audit log is saved "indefinitely" [ZD4].

For a regulated fintech, record-keeping rules for financial correspondence and customer records usually run 5 to 7 years. That is the bar to plan for, not 90 days.

---

### 4. Audit logs

#### 4.1 Admin and security audit log: TABLE STAKES at enterprise tier, COMMON overall

| Product              | Plan                                | What is logged                                                                                                                                                                                                                              | Retention                                                      | Search / export                                                        | API / streaming                                                         | Source      |
| -------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ---------------------------------------------------------------------- | ----------------------------------------------------------------------- | ----------- |
| HubSpot              | All paid tiers (more on Enterprise) | Logins including mobile, login and security events. Enterprise adds approvals, workflows, pipelines, property updates, CRM object operations, "Sensitive property access" and "data privacy requests". CRM record views are also a category | Logins: "last 30 days" (Starter/Pro). Security history: 1 year | Filter by category, action, user and date. CSV emailed                 | Not stated                                                              | [H7]        |
| Salesforce           | All                                 | Setup Audit Trail: configuration changes, including changes made through login-as ("the setup audit trail lists the changes and the username")                                                                                              | UI shows the 20 most recent; download covers 180 days          | CSV                                                                    | `SetupAuditTrail` object                                                | [S11] [S5]  |
| Pipedrive            | Ultimate                            | Security-change "audit log" and "Device history"                                                                                                                                                                                            | "the past two months"                                          | Device list export                                                     | n/a                                                                     | [P5]        |
| Freshsales           | All plans                           | "configuration changes" only: billing, settings, territories, assignment rules, sequences, workflows                                                                                                                                        | "the previous 90 days"                                         | Filter by time, user and module                                        | n/a                                                                     | [F2]        |
| monday.com           | Enterprise                          | Security events from a queryable event catalogue                                                                                                                                                                                            | Not stated                                                     | Filter by user, event, IP and time                                     | GraphQL API                                                             | [M4]        |
| Airtable             | Enterprise Scale                    | Created, updated and deleted actions by category                                                                                                                                                                                            | "180 days"                                                     | CSV in the admin panel (capped at 10,000 events); JSON through the API | API (pull), "near real-time"                                            | [AT5]       |
| Notion               | Enterprise                          | Page (viewing, sharing, permissions, deletion), workspace, account (login, MFA), teamspace and organisation events                                                                                                                          | "up to 365 days"                                               | Filters and CSV                                                        | Webhook to a SIEM; Datadog, Panther, Splunk and Sumo Logic setups       | [N2]        |
| ClickUp              | Enterprise                          | User (authentication, role changes), task, fields, hierarchy, agents                                                                                                                                                                        | "60 days"                                                      | Date, user and status filters                                          | API                                                                     | [CK2] [CK3] |
| Linear               | Enterprise                          | "account access, subscriptions, and settings changes" with "the IP and country of the actor"                                                                                                                                                | "90 days"                                                      | Filter by type                                                         | GraphQL API, plus "Stream logs" to a webhook signed with a secret       | [L2]        |
| Zendesk              | Enterprise                          | Agent and admin changes to settings, users, apps, business rules, ticket settings, custom objects; sign-ins; exports. "End user activities are not captured"                                                                                | "indefinitely"                                                 | Date, actor, activity and item filters. "Email CSV"                    | REST API with filters; export endpoint limited to 1 request per minute  | [ZD4] [ZD5] |
| Slack                | Enterprise                          | A "subset" of audit events such as `user_login` and `file_downloaded`; never message content                                                                                                                                                | Not stated                                                     | n/a                                                                    | Audit Logs API; the `auditlogs:read` app must be installed by the Owner | [SL3]       |
| Google Workspace     | All                                 | Admin and app logs                                                                                                                                                                                                                          | Mostly "6 months"; Vault logs "Indefinite"                     | Admin console                                                          | BigQuery export                                                         | [G3]        |
| Intercom             | n/a                                 | Teammate activity log                                                                                                                                                                                                                       | Not stated                                                     | n/a                                                                    | API (`activity_log.list`, cursor pagination)                            | [I3]        |
| Close                | All                                 | Object change events, not a security log                                                                                                                                                                                                    | 30 days                                                        | API filters                                                            | API                                                                     | [C2]        |
| Zoho CRM             | n/a                                 | An Audit Log section exists under Security Control; details not verified                                                                                                                                                                    | n/a                                                            | n/a                                                                    | n/a                                                                     | [Z8]        |
| Attio, Copper, Front | n/a                                 | No admin audit log found in the help centres reviewed                                                                                                                                                                                       | n/a                                                            | n/a                                                                    | n/a                                                                     | n/a         |

**What separates good from weak**

- **Coverage.** The baseline is authentication (success and failure, MFA enrolment and reset), role and permission changes, user lifecycle, exports and downloads, bulk edits and deletes, purges, API key and OAuth grant lifecycle, settings changes, impersonation, and integration installs. Zendesk and Notion are the most complete; Freshsales logs configuration only.
- **Each entry carries:** actor (user, API key, automation or support agent), "acting as" when impersonating, IP, user agent, time in UTC, object and ID, and a before-and-after diff. Zendesk's fields are a good template: `action`, `actor_id`, `ip_address`, `source_type`, `source_id`, `change_description` [ZD5].
- **Retention** is not tied to a cheap plan, and at least a year (section 4.2).
- **Immutability** (section 4.6).
- **Weak:** UI-only with no export; capped result sets (Airtable's UI shows 10,000 events [AT5]); end-user or API activity missing.

#### 4.2 Retention, search and export: search plus CSV is TABLE STAKES among products with a log; at least a year is a DIFFERENTIATOR

Retention spectrum:

- Pipedrive: 2 months [P5]
- ClickUp: 60 days [CK3]
- Linear: 90 days [L2]
- Freshsales: 90 days [F2]
- Salesforce Setup Audit Trail: 180 days [S11]
- Airtable: 180 days [AT5]
- Google: 6 months [G3]
- HubSpot security history: 1 year [H7]
- Notion: 365 days [N2]
- Zendesk: indefinite [ZD4]

Auditors usually ask for at least 12 months online and longer in archive. Vendors that stop at 60 to 180 days push customers into SIEM streaming (4.3) to meet that.

#### 4.3 Audit log API and SIEM streaming: COMMON (enterprise)

- **Push:**
  - Notion: a webhook with "real-time workspace events" in JSON, plus partner setups for "Datadog, Panther, Splunk, Sumo Logic" [N2].
  - Linear: "Audit logs can be streamed to a webhook ... for Security Information and Event Management data ingestion", signed with a secret [L2].
  - Zendesk: access-log webhooks delivered "in near real time" to Splunk, Datadog, Microsoft Sentinel and QRadar [ZD7].
- **Pull:**
  - Slack Audit Logs API, built for SIEM providers [SL3].
  - Airtable API: JSON, 1,000 events per response [AT5].
  - monday.com GraphQL [M4].
  - ClickUp API [CK2].
  - Zendesk REST [ZD5].
  - Google BigQuery export [G3].

**Good:** push with signing and retries, a stable event schema and catalogue (monday.com exposes `audit_event_catalogue` [M4]), cursor pagination and documented lag. Google publishes lag per log type, from near real time to hours [G3].

#### 4.4 Read-access logging ("who looked at this"): DIFFERENTIATOR

- **Zendesk (Advanced Data Privacy and Protection add-on).** "a log of access events within 90 days" for tickets, user profiles and searches [ZD6]. Recent additions include event IDs, browser URL and response byte size, and SIEM webhooks [ZD7].
- **HubSpot Enterprise.** Logs "Sensitive property access"; CRM record views are an audit category [H7].
- **Notion.** Page viewing is an audit event [N2].
- **Slack.** Logs `file_downloaded` [SL3].

For a fintech holding KYC documents and bank details, "who viewed this customer's documents" is the question an incident review or regulator asks first.

#### 4.5 Login history, device list and security alerts: login history is COMMON; alerting is a DIFFERENTIATOR

- **HubSpot.** Logins for 30 days and security history for a year [H7]. Each user sees their own sessions with device, browser, IP and last active, and can "Log Out of All Sessions" [H12].
- **Pipedrive security dashboard** [P5]:
  - Live "Users logged in" and "Unique locations".
  - A 7-day view of "New devices", "New locations", "Security events" and "Force logouts".
  - Device management (Ultimate) showing remembered "(30d)" versus "(12h)" sessions, with force logout of filtered devices.
  - Risk findings rated "high-risk" or "low-risk", each linked to its fix.
  - Monthly summary emails.
- **Linear.** Session-creation events can be filtered out of the recent-events list [L2].
- **Zendesk.** "Signed in" is an audit activity type [ZD4].

**Good:** per-user and org-wide sign-in history (success and failure, method, IP, geo, device); new-device and new-country alerts to the user and admins; and one-click revoke.

#### 4.6 Tamper evidence: DIFFERENTIATOR (no product documents cryptographic integrity)

- Slack: "read only. There are no write methods for Audit Log events" [SL3].
- Zendesk ticket audits are "read-only" [ZD19].
- Counter-example: Airtable lets owners clear record history ("irreversible") [AT3]. That is fine for a collaboration tool and wrong for an audit trail.
- No vendor in the sample documents hash-chaining, WORM storage or signed exports.

**Good:** append-only storage that admins cannot delete or edit; retention that is not shortened by a plan downgrade; and exports with an integrity hash and the time source stated.

#### 4.7 Configuration change log: COMMON

- Salesforce Setup Audit Trail [S11].
- Freshsales configuration-only audit (workflows, sequences, territories, billing) [F2].
- Zendesk audit of settings, business rules and apps [ZD4].
- HubSpot Enterprise logs pipeline, workflow and property changes [H7].
- Linear logs settings changes [L2].
- ClickUp: "All changes made to the Chat data retention setting are captured in audit logs" [CK13].

**Good:** a before-and-after diff for every setting, including automation rules and permission sets.

---

### 5. Permissions

#### 5.1 Roles, custom roles and permission sets: roles are TABLE STAKES; custom roles are COMMON (paid tiers)

| Product    | Built-in                                                                                     | Custom                                                                                                     | Source    |
| ---------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | --------- |
| Salesforce | Profiles                                                                                     | Permission sets layered on profiles                                                                        | [S3]      |
| HubSpot    | Super Admin, Partner Admin, per-tool permissions                                             | Permission sets                                                                                            | [H8]      |
| Pipedrive  | Admin and Regular permission sets                                                            | Custom sets: Premium 15, Ultimate 25, Enterprise 150                                                       | [P3]      |
| Attio      | Admin, Member                                                                                | "Access permissions": None (Free), Basic (Plus), Advanced (Pro and up)                                     | [A4] [A6] |
| Close      | Admin, Super User, User, Restricted User ("day-to-day work ... without higher-risk actions") | Scale plan only; on downgrade "Custom Roles will be removed"                                               | [C5]      |
| Zoho CRM   | Profiles and roles                                                                           | Custom profiles                                                                                            | [Z8]      |
| Freshsales | Roles                                                                                        | Custom roles with field permissions                                                                        | [F4]      |
| Twenty     | Default role for new members                                                                 | Roles with object, field, settings and action permissions; roles can be assigned to API keys and AI agents | [T1]      |
| ClickUp    | Owner, Admin, Member, Limited Member, Guest                                                  | 1 custom role on Business Plus, unlimited on Enterprise                                                    | [CK4]     |
| Linear     | Owner (Enterprise), Admin, Member, Guest (Business and up)                                   | Team-level controls                                                                                        | [L4]      |
| Zendesk    | Advisor, Staff, Team lead                                                                    | Enterprise; "maximum of 197 custom roles"                                                                  | [ZD8]     |
| Intercom   | n/a                                                                                          | "custom roles" (article exists; details not readable)                                                      | [I6]      |
| Front      | n/a                                                                                          | Custom roles on Enterprise                                                                                 | [FR5]     |

**Good:** a least-privilege default role; custom roles composed from granular verbs; and the role is enforced for API tokens and AI agents too (Twenty assigns roles to API keys and AI agents [T1]).

#### 5.2 Object-level create, read, update and delete: TABLE STAKES

- **HubSpot.** View, Edit and Delete, each scoped "All / Their team's / Their" records, with an optional "Unassigned" checkbox. "Create" is a separate toggle [H8].
- **Twenty.** "See Records", "Edit Records", "Delete Records" and "Destroy Records" per object [T1].
- **Salesforce.** Object permissions "prevent a group of users from creating, viewing, editing, or deleting any records of that object" [S3].
- **Pipedrive.** Delete deals, people, organisations and activities are separate permissions [P3].
- **Airtable.** Table editing permissions set "Who can create records?" and "Who can delete records?" [AT4].

#### 5.3 Record-level access: TABLE STAKES (CRMs)

- **Salesforce.** Org-wide defaults, role hierarchy, sharing rules and manual sharing [S3]. Restriction rules filter even when sharing would grant access. They apply across "links, list views, lookups, records, related lists, reports, search, SOQL, and SOSL", with 2 or 5 active rules per object depending on edition [S9].
- **HubSpot.** Owned, team or all, per verb [H8].
- **Pipedrive.** Four visibility levels (owner only, owner's group, owner's group and sub-groups, all users). Custom groups: Premium 15, Ultimate 25, Enterprise 150. Caveat: "Users with deals admin permission set will always have access to all pipelines and deals" [P4].
- **Copper.** "Everyone", "Record Owner Only" and "Only Me", plus "Teams" and "Individuals" on Professional and Business [CU1].
- **Twenty.** Row-level permissions on the Organization plan, for example "sales reps viewing only their own opportunities" [T1] [T2].
- **Zoho CRM.** Data sharing rules, territories, groups and reporting hierarchy [Z8].
- **Close.** Lead visibility is part of custom roles [C5].

**Good:** one access check enforced in UI lists, search, reports, exports, API, webhooks and any AI assistant. Salesforce's list of surfaces is the template.

#### 5.4 Field-level permissions: COMMON

- **Freshsales.** "EDITABLE", "READ-ONLY" and "HIDDEN" per role, on every plan. "Required fields cannot be made hidden" [F4].
- **Twenty.** "See Field", "Edit Field" and "No Access" [T1].
- **Close.** "restrict which Roles have access to edit specific Custom Fields" [C5].
- **HubSpot.** Admins can "limit edit access to properties" [H8].
- **Salesforce.** Field-level security [S3].
- **ClickUp.** Hide custom fields from guests and limited members (paid plans) [CK5].
- **Airtable.** Field editing permissions apply to "edits made using the Airtable API" but "do not affect who can see information" [AT4].
- **Zendesk.** Data masking obscures "end-user names, email addresses, and phone numbers" for chosen roles (add-on) [ZD6].

**Good:** both hide and read-only modes; enforced in API, exports and search; masking (partial reveal such as the last 4 digits) for PII.

#### 5.5 Separate permissions for high-risk verbs: COMMON

- **HubSpot.** "Bulk delete", "Export", "Import" and "Export without approval" are separate toggles [H8].
- **Pipedrive.** "Export data from list views", "Bulk edit items", "Import data from spreadsheets", "Merge duplicate ..." and "See other users' data" [P3].
- **ClickUp.** "Delete Items, Exporting, Importing, Invite Guests, Workspace Integrations, Personal Integrations ... Custom Apps via API" [CK4].
- **Twenty.** "Send Email, Import CSV, and Export CSV" and "API keys" [T1].
- **Zendesk.** Ticket deletion is opt-in for agents [ZD1].

#### 5.6 Restricted seats for interns, contractors and guests: COMMON

- **monday.com.** "Unlimited free viewers" (Basic and up); guest access (Standard and up); private boards (Pro and up) [M8].
- **Linear.** Guests have "Restricted access to specified teams" and "Cannot view workspace-wide features". "Only team owners can add guest users" [L4].
- **Zendesk.** Light agents (private comments only) and custom roles [ZD8]. "Agents in masked roles can't delete or assume an end user's profile" [ZD9].
- **ClickUp.** Limited members and guests can be blocked from inviting and from seeing chosen fields [CK5].
- **Notion.** Guests cannot be managed through SCIM [N3].
- **Close.** "Restricted User" [C5].
- **Copper.** "Only Me" records [CU1].

**Good:** an expiry date on guest and contractor access; scoped to named teams or records; no export, no bulk actions, no PII fields; cannot invite others; and a distinct, visible badge.

#### 5.7 Teams, territories and hierarchies: COMMON

- Attio: teams on Pro (up to 10) and Enterprise (unlimited) [A4].
- Zoho CRM: territories, groups and reporting hierarchy [Z8].
- Salesforce: role hierarchy [S3].
- Pipedrive: visibility-group hierarchy [P4].
- Freshsales: territories, which are cleared when a user is deleted [F3].

#### 5.8 Login-as, view-as and support access with consent: COMMON

- **Salesforce.** Users grant login access to admins or support for a chosen period; "the maximum period for granting access is 1 year". By default "administrators can access your account without any action from you" unless the org requires user grants. Changes made through the login are recorded with "the changes and the username" [S5].
- **Zendesk.** "An admin or any agent in a custom role with permission to edit user profiles" can assume an end user. Actions taken "are done by the user you're signed in as" [ZD9].
- **ClickUp.** Each user controls login permission for ClickUp Support access in My Settings [CK12].

**Good:** consent or time-boxed grants; a banner while impersonating; dual attribution ("admin A acting as B") on every log line; impersonating admins is blocked; no password, MFA or payout changes during impersonation; a reason field.

#### 5.9 Approval before sensitive actions: DIFFERENTIATOR

- **HubSpot.** Export approval: users without "Export without approval" have exports reviewed [H8].
- **Slack.** App approval: "Only allow pre-approved apps", restricted list, app managers, approval of the "scopes that it will use" [SL1].
- **Google Workspace.** Unapproved apps go to an admin request queue [G4].
- **Airtable Enterprise.** An API-access allowlist [AT7].
- No vendor in the sample documents dual control (a second approver) for admin-role grants, permission changes or bulk purges. That would be a genuine differentiator.

#### 5.10 Design note: "admins see everything"

Copper owners and admins "will be able to see all records regardless of the visibility settings" [CU1]. Attio admins "view and manage all objects ... even if they have not been explicitly granted access" [A4]. Pipedrive deals admins bypass visibility [P4].

A fintech usually wants the opposite as well: a **restricted admin** who can manage users and settings but cannot read customer data. Few tools offer this.

---

### 6. Identity and access

#### 6.1 Enforced MFA: TABLE STAKES

- **HubSpot.** Passkeys, authenticator app and SMS, with SMS described as "least secure". "2FA is required for all HubSpot Starter, Professional, and Enterprise accounts and can't be turned off". Admin enforcement allows no exceptions ("Individual users can't be excluded") and has a "24-hour grace period" [H10].
- **ClickUp.** Requiring 2FA for the workspace "is available on our Business Plan and above". It can apply to all members or to non-SSO logins only [CK7]. The out-of-box default is "Don't require 2FA" [CK6].
- **Airtable.** Admins can require 2FA once SSO is enabled, and filter users by 2FA status [AT11].
- **Copper.** 2FA through Google or Okta [CU4].
- **Pipedrive.** Offers MFA [P10]; the security dashboard nudges "Enable 2FA" [P5].
- **Close.** Documents "Enabling 2FA" [C5 help index].
- **Notion.** MFA events appear in the audit log [N2].

**Good:** enforced by default for admins at least, with no exempt users; phishing-resistant methods (passkeys or security keys) can be required; recovery codes; admin-initiated reset that is audited; adoption shown on a posture page.

#### 6.2 Passkeys: DIFFERENTIATOR, emerging

HubSpot supports passkeys both as a login method and as the 2FA factor [H10] [H11]. Other passkey support in the sample was not verified in this pass (section 12).

#### 6.3 SAML SSO with enforcement: TABLE STAKES at enterprise tier

- **HubSpot.** Professional and Enterprise. "Require single sign-on" checkbox. "the user who toggles the Require Single Sign-on switch on will automatically be added to the excluded users", and HubSpot advises keeping a Super Admin exempt "In the event your identity provider is down" [H9].
- **Notion.** Business (1 configuration) or Enterprise (up to 25). Domain verification is required. "Only SAML SSO" logs everyone out and forces SSO. Owners can still "log in with email and password" to fix an IdP failure [N4].
- **Linear.** Enterprise. Domains are claimed with a DNS TXT record. Existing sessions are not logged out when SAML is enabled ("affected users will need to sign in with SAML from that point on") [L3].
- **Attio.** SSO and SCIM on Pro and Enterprise [A6]; domain verification [A3].
- **Twenty.** SAML 2.0, Google and Entra on the Organization plan, with Just-in-Time or manual provisioning. Docs recommend disabling password login for SSO users [T3].
- **Front.** SSO and SCIM on Professional [FR5].
- **Copper.** SAML SSO, with a documented Okta setup [CU4] [CU5].
- **Airtable.** Okta, Google, OneLogin, Entra ID and ADFS guides [AT11].
- **Freshsales.** SSO under organisation settings [F5].

**The "SSO tax."** The sso.tax list shows the price jump to reach SSO [X3]:

| Vendor            | Increase  |
| ----------------- | --------- |
| Airtable          | +500%     |
| Front             | +421%     |
| Intercom          | +355%     |
| monday.com        | +286%     |
| HubSpot Marketing | +233%     |
| Copper            | +143%     |
| Notion            | +88%      |
| Slack             | +72%      |
| Linear            | +50%      |
| Attio             | "Call Us" |

Its thesis: "SSO is a core security requirement for any company with more than five employees". Buyers treat SSO as table stakes, and vendors treat it as an enterprise lever.

**Good:** SAML and OIDC; enforcement per domain with a break-glass account; certificate-expiry warnings; IdP-initiated and SP-initiated login; and sessions revoked when enforcement turns on (Linear does not revoke them).

#### 6.4 SCIM provisioning: COMMON (enterprise)

- **Notion Enterprise.** Okta, OneLogin, Rippling and custom SCIM. Deprovisioning removes the user from the workspace and "The user is logged out of all active sessions". It cannot delete the user's account, and cannot manage guests [N3].
- **Attio.** SCIM for Okta and Microsoft Entra [A3].
- **Front.** SCIM on Professional [FR5].
- **Linear.** Supports SCIM; guests provisioned through SCIM must sign in through the provider [L3].
- **Airtable.** IdP sync [AT11].
- **HubSpot.** SCIM provisioning exists; Partner Admins are explicitly excluded from it [H8].
- **Twenty.** JIT and manual only; SCIM not mentioned [T3].

#### 6.5 Login-method restriction and domain claim: COMMON

- **HubSpot.** Admins can allow or deny native passwords, social logins, SSO and passkeys. Changes apply within 15 minutes or on a scheduled date, with "Manage exempt users" [H11].
- **Linear.** Claims domains, and "prevent non-admins from creating new Linear workspaces" on them [L3].
- **Notion** [N4], **Attio** [A3] and **Airtable** [AT11] all require domain verification.

#### 6.6 IP allowlisting: COMMON (enterprise)

- **Zendesk.** Every suite plan. "Agents and administrators cannot bypass IP address restrictions". API calls are blocked too. There is an optional end-user bypass. Warning: it "can break third-party integrations" [ZD10].
- **Zoho CRM.** Allowlists "for individual users or for users in a specified role or a group". Once applied, users who cannot reach CRM from an IP "will also not be able to access the other Zoho applications" [Z3].
- **Salesforce.** "Set Trusted IP Ranges for Your Org" and "Restrict Login IP Addresses in Profiles" are both documented controls [S14].

**Good:** separate ranges for admin functions; API enforcement with per-integration exceptions; and a documented lock-out recovery. Zendesk documents a second admin or support as the recovery path [ZD10].

#### 6.7 Session controls and device management: COMMON

- **Zendesk.** Defaults: sessions expire "after 60 minutes of inactivity for agents and after eight hours of inactivity for end users". There is also a maximum session duration, which, once enabled, "you can't turn it off". Team members are warned five minutes before sign-out [ZD11].
- **Slack.** Desktop and mobile durations are set separately. Users are warned "two hours before the session expires, with a final reminder 15 minutes before", and the change rolls out over 7 days. On Enterprise, durations can be set per subset of users through an API [SL4].
- **ClickUp.** Session duration and idle timeout exist on Enterprise, but the default is "Never expires" [CK6].
- **HubSpot.** Users can see and end their own sessions; "You can only view and log out of your own user sessions" [H12].
- **Pipedrive.** Device management and force logout on Ultimate [P5].
- **Airtable.** Deactivated users are "signed out of all active sessions right away" [AT11].
- **Notion.** SCIM deprovisioning ends all sessions [N3].
- **Salesforce.** Session security settings include high-assurance sessions for sensitive operations [S15].

**Good:**

- Both idle and absolute limits, configurable per role. Shorter for admins.
- An admin view of every user's sessions and devices, with revoke.
- Automatic revoke on role change, deprovisioning or password reset.
- Step-up re-authentication for sensitive operations, as Salesforce's high-assurance sessions do.

#### 6.8 Offboarding: TABLE STAKES (quality varies widely)

| Product          | Mechanism                                                                                                                                         | What happens to owned work                                                                                                                                                                                                   | Source       |
| ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------ |
| Salesforce       | Freeze first ("prevent users from logging in ... while you perform the steps to deactivate"; freezing does not free the licence), then deactivate | Mass Transfer moves accounts, leads, service contracts and custom objects with related contacts, notes, open activities and open opportunities. "up to 250 records at a time"; manual sharing is removed on transfer         | [S4] [S6]    |
| Close            | Remove user                                                                                                                                       | The removal flow reassigns "open tasks, opportunities, and phone numbers". Leads are moved by bulk edit. Activity is kept. "any associated API keys will also be disabled". The seat stays open until the next billing cycle | [C6]         |
| Freshsales       | Delete user                                                                                                                                       | Contacts, accounts and deals go "unassigned"; use bulk transfer. Activities on records are kept; emails not linked to contacts are deleted; territories are cleared. Sub-processor deletion takes up to 30 days              | [F3]         |
| Copper           | Delete user                                                                                                                                       | "Any records they own will become unassigned"; "Always reassign records before removing a user". Freeing the seat needs support                                                                                              | [CU2] [CU3]  |
| ClickUp          | Remove (permanent)                                                                                                                                | "Private Folders, Lists, and tasks owned by a deactivated person will be deleted"; public items stay, labelled "Deactivated"                                                                                                 | [CK8]        |
| Linear           | Suspend                                                                                                                                           | "lose all access immediately", "removed from your next billing cycle", still visible for history                                                                                                                             | [L4]         |
| Airtable         | Deactivate                                                                                                                                        | Signed out with no notification. Automations using external integrations "fail"; syncs "stop updating". Admins can grant Owner to another collaborator                                                                       | [AT8] [AT11] |
| Attio            | Suspend                                                                                                                                           | Admins keep the mailbox under retention and assign an "email access handler"                                                                                                                                                 | [A5]         |
| Zendesk          | Delete or downgrade agent                                                                                                                         | Reassign their tickets. Suspending instead keeps analytics intact                                                                                                                                                            | [ZD14]       |
| Intercom         | Remove teammate                                                                                                                                   | Reassign conversations, messages, articles and assignment rules (snippet)                                                                                                                                                    | [I1]         |
| Google Workspace | Delete user                                                                                                                                       | Restorable for 20 days                                                                                                                                                                                                       | [G1]         |

**Good: a guided offboarding wizard**

1. Freeze now.
2. Pick a recipient per object type, defaulting to the manager.
3. Move open work: deals, tickets, tasks, sequences, scheduled sends, owned automations, shared mailboxes.
4. Revoke sessions, API keys and OAuth grants.
5. Keep history attributed to the leaver.
6. Free the seat.
7. Write an audit entry and produce a downloadable report.

**Weak:** records silently left unassigned (Freshsales, Copper); private data destroyed (ClickUp); integrations breaking without warning (Airtable).

#### 6.9 Freeze or suspend without deleting: COMMON

Salesforce freeze [S4], Linear suspend [L4], Airtable deactivate [AT11], Zendesk suspend [ZD14] and Attio suspended members [A5]. This is the immediate kill switch to use while ownership is sorted out.

---

### 7. Data lifecycle and privacy

#### 7.1 Retention and deletion policies: COMMON in support and collaboration tools; a DIFFERENTIATOR in CRMs

- **Zendesk ticket deletion schedules** [ZD3]:
  - Conditions on brand, organisation, tags, custom fields, form, requester, dates and more.
  - Act only on archived tickets ("closed for more than 120 days") and "start to delete eligible tickets within 72 hours".
  - "Up to 200,000 tickets per account per day".
  - One active schedule, or up to 10 with the privacy add-on.
  - "Deleted archived tickets can't be restored".
  - Attachment schedules handle "24,000 attachments per account per day".
- **Front.** Company-level retention with per-inbox overrides; Front applies "the setting for the inbox with the longest data deletion period". Conversations move to trash and then face "permanent deletion after 7 days" [FR2].
- **Slack.** Message and file retention per plan, with channel-level overrides. "Data deleted according to your retention setting is permanent" [SL2].
- **Airtable Enterprise Scale.** Revision and snapshot history from 1 to 10 years, trash 30 to 180 days, and inactive-base deletion from 1 to 10 years with notices at 30, 60 and 90 days [AT6].
- **CRMs.** None of HubSpot, Salesforce, Pipedrive, Attio, Close, Zoho, Freshsales or Copper document automatic record-retention policies in the pages reviewed.

#### 7.2 Right to erasure: COMMON

- **HubSpot "permanently delete"**:
  - Removes "email tracking history, call records, form submissions, and other engagement data".
  - Redacts email headers with "GDPR_DELETED".
  - Blocks the address from being re-created through the UI or imports, while still allowing lawful re-entry through forms or the API.
  - Takes "up to 30 days to complete a permanent purge".
  - Works on single contacts only ("You cannot perform permanent deletions in bulk").
  - Can email a confirmation to a chosen user [H13] [H3].
- **Zoho.** Erasure locks the record, then "Move to block-list". "all the records bearing the same email address will be deleted" across GDPR-enabled modules [Z4].
- **Freshsales.** "Forget" [F1].
- **Copper.** Customer data is retained 30 days after termination and purged within 180 days [CU4].

**Good:** erasure reaches activities, attachments, email headers, the search index and analytics (anonymised); backup purge windows are documented; a block-list prevents re-import; and a certificate of deletion is produced.

#### 7.3 Data subject request (DSAR) tooling, consent and lawful basis: DIFFERENTIATOR

**Zoho CRM is the reference implementation** [Z4] [Z5]:

- **Access:** templated email with merge fields.
- **Rectification:** a CSV round-trip.
- **Erasure:** lock, then block-list.
- **Restrict processing:** a "lock" under which records "cannot be edited, shared, merged, have emails sent via workflows, or have macros run".
- **Portability:** CSV "in machine readable format".
- **Tracking:** each request is logged in a per-record "Data Privacy" section and a module-wise overview.
- **Also:** consent management, "Managing Lawful Bases for Data Processing", and marking personal fields.

HubSpot Enterprise logs "data privacy requests" in its audit log [H7].

#### 7.4 Sensitive-data detection, redaction and masking: DIFFERENTIATOR (high value for fintech)

- **HubSpot Enterprise** [H18]:
  - Scans "notes, calls, tasks, emails, and meetings" for PII and health data.
  - Redaction "permanently remove[s] values" and replaces them with placeholders such as "REDACTED-ACCOUNT-NUMBER".
  - Super Admin only; covers the "last 60 days"; "one scan every 30 days".
- **Zendesk** masks end-user identifiers by role (add-on) [ZD6].

**Good:** detection at write time, not batch scans 30 days apart. Pattern classes for card numbers, IBANs and account numbers, national IDs and secrets; quarantine or redact-on-save; and redaction logged without storing the redacted value.

#### 7.5 Data residency: COMMON (enterprise)

- **Airtable.** US, Europe and Australia on Enterprise Scale.
  - In region: cell content, attachments, revision history, audit logs.
  - Stays in the US: "Base metadata", "User and authentication data".
  - An organisation "cannot span multiple data regions", and customers "cannot downgrade" afterwards [AT10].
- **Notion.** Enterprise, "free of charge". US, EU, Japan and Korea, each with a backup region.
  - Page content, files and the search index are in region; account and usage data are not.
  - The US copy is deleted 30 days after migration [N5].
- **Zendesk.** A Data Center Location add-on, free on Suite Professional and up: US, EEA, UK, Japan and Australia [ZD15].
- **Linear.** US or EU chosen at workspace creation; "This setting isn't self-serve to change later" [L5].
- **Copper.** "Copper stores all of its data in the United States" and cannot accommodate other locations [CU4].

**Good:** a plain list of what is and is not in region (content, files, search index, backups, logs, AI processing, subprocessors).

#### 7.6 Encryption and customer-managed keys: encryption at rest is TABLE STAKES; BYOK is a DIFFERENTIATOR

- Linear: "All data is encrypted in transit, and our databases are encrypted at rest" [L5].
- Zendesk's add-on supports "your own enterprise Key Management Service": AWS KMS, Azure Key Vault, Google Cloud KMS and Thales CipherTrust [ZD6].
- Airtable documents Enterprise Key Management [AT11].
- Zoho CRM has a Data Encryption section [Z8].

#### 7.7 Backups, snapshots and point-in-time restore: DIFFERENTIATOR

- **Airtable snapshots** [AT2]:
  - Automatic ("at least one snapshot per day" for heavily used bases) plus manual snapshots with a cooldown.
  - Retention: Free 2 weeks, Team 1 year, Business 2 years, Enterprise Scale 3 years.
  - Restore goes to a new base; revision history is excluded.
- **Zoho CRM backups** [Z2]:
  - Admins request them twice a month, monthly, weekly or immediately.
  - "CSV format, compressed in a single archived (*.ZIP) file", including uploaded files.
  - The download link "remains active for a maximum of 7 days".
  - Allowance: Ultimate 4 free, other paid editions 2.
  - Excludes email content and documents.
- **HubSpot.** A 14-day point-in-time rollback (2.8) [H4].
- **Attio.** No native restore; third-party daily snapshots instead [A10].
- **Pipedrive.** Support-side restores (community) [P8].
- **Copper.** Backs up "through one or more data storage providers", with no customer-facing restore [CU4].

**Good:** customer-triggered and scheduled; downloadable in an open format; restorable to a copy and, selectively, in place; stated backup retention; restores tested and reported.

#### 7.8 Sandboxes and test environments: COMMON (enterprise CRMs and help desks)

- **Salesforce.** Developer (metadata only), Developer Pro (larger data), Partial Copy ("a sample of your production org's data as defined by a sandbox template") and Full ("a replica ... including all data"; "Only Full sandboxes support performance testing, load testing, and staging") [S7].
- **HubSpot Enterprise.** Copies the "5,000 most recently updated contacts" with up to 100 associated deals, companies and tickets per contact; deploys "up to 300 changes at a time" [H16].
- **Zoho CRM.**
  - Four types: Configuration, Sample Data (10 synthetic records per module, for when you "don't want developers or users to view CRM records"), Partial Data and Full Data.
  - Full Data is Ultimate only and "can be rebuilt once every 30 days".
  - Enterprise gets 3 configuration plus 2 data sandboxes; Ultimate gets 7, 3 and 1 [Z6].
  - Changes deploy back to production [Z7].
- **Zendesk Enterprise.** Replicates "0, 500, 5,000, or 10,000 tickets"; a full copy can take "up to a week" [ZD12]. But "Sandbox changes are not copied to the production instance" [ZD13], so promotion is manual.
- **Freshsales** has a Sandbox section [F5].
- No sandbox was found for Attio, Close, Copper, Pipedrive, Linear or Notion.

**Good:** a synthetic-data option (no real PII in test); one-click promotion of configuration with a diff; and a refresh schedule.

#### 7.9 Data quality: required fields and duplicate prevention are TABLE STAKES; validation rules are COMMON

- **HubSpot validation.** Regex rules (Professional and up) on single-line and multi-line text, checked during "creation, on a record, on the object index page, via import, or through submissions to forms created via the new form editor". The API is not in that list. Custom error text up to 100 characters [H14].
- **HubSpot deduplication.** By email for contacts and by domain for companies, though "Companies created through API will not be deduplicated". Up to ten unique-value properties, "Not supported in forms" [H15].
- **Salesforce duplicate rules.**
  - Allow or Block on save, with Alert and Report options; "up to three matching rules in each duplicate rule".
  - Documented bypasses: Quick Create, undelete, lead convert without Apex, Lightning Sync, manual merges [S8].
- **Freshsales.** "Required fields cannot be made hidden" [F4].
- **Pipedrive.** Merging duplicates is a permission per object type [P3].

**Good:** rules enforced on every write path (UI, import, API, forms, automations) and the bypasses documented; block versus warn chosen per rule; a duplicate review queue; and a merge preview (2.9).

#### 7.10 Self-service export of your own data: TABLE STAKES

- **HubSpot.**
  - Exports need the export permission and arrive as an emailed link that expires after 30 days.
  - Limits: "300 exports within a rolling 24 hour window", three running at once.
  - "Historical exports remain visible in your export log for 3 years" [H17].
- **Zoho CRM.** Scheduled backups [Z2].
- **Twenty.** Export CSV is a role permission [T1].
- **Close.** Has an exporting guide [C5 help index].

---

### 8. Integration administration

#### 8.1 API credentials: scoped tokens are COMMON; unscoped keys still exist

- **HubSpot private apps.**
  - Super admin only, with scopes chosen by checkbox.
  - Rotation is recommended every six months, with "Rotate and expire now" or "Rotate and expire later" (a 7-day overlap).
  - A "Logs" tab keeps 30 days of calls, filterable and exportable, without storing bodies [H22].
- **Airtable personal access tokens.**
  - Scopes plus resources (named bases, a workspace, or all current and future bases), capped at the creator's own permissions.
  - They never expire on their own: they "remain active indefinitely until they are manually deleted, regenerated, or modified".
  - Legacy API keys stopped working on 1 February 2024.
  - Enterprise admins can restrict API use to an allowlist; service accounts are available [AT7].
- **Twenty.** Keys are shown once ("Copy it immediately") and "can be scoped to a specific role" [T5].
- **Close (weak).** "API keys can read and modify all of your CRM data", and OAuth apps get "the same full access". However, a removed user's keys are disabled [C7] [C6].
- **Pipedrive.** Counts both API tokens and OAuth tokens against a daily budget: 30,000 base tokens × plan multiplier × seats [P6].

**Good:**

- Credentials belong to the integration, not a person.
- Least-privilege scopes and resource limits.
- An expiry date, plus rotation with an overlap window.
- The UI shows owner, scopes, created date and last used.
- Revoked automatically when the owner is offboarded.
- An admin inventory with a kill switch.
- Secrets are shown once and stored hashed.

#### 8.2 Third-party app (OAuth) governance: COMMON

- **Slack.** "Only allow pre-approved apps", a restricted list, a request flow, app managers and scope review. Caveat: restricting an already-installed app does not remove it [SL1].
- **Google Workspace.** Apps are "Trusted", "Limited", "Specific Google data" or "Blocked"; admins can restrict high-risk OAuth scopes and choose a default for unconfigured apps [G4].
- **Linear.** Workspace owners own OAuth approvals [L4].
- **Close.** Users can revoke authorised apps [C7].
- **Airtable Enterprise.** API allowlist [AT7].

#### 8.3 Webhooks: signing is TABLE STAKES; retries and auto-disable are COMMON; idempotency keys and delivery logs are a DIFFERENTIATOR

| Product    | Signature                                                              | Replay protection                                             | Retries                                                                            | Failure handling                                                                                                     | Source |
| ---------- | ---------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | ------ |
| HubSpot    | v3: HMAC-SHA256 (base64) over method + URI + body + timestamp          | "Reject the request if the timestamp is older than 5 minutes" | n/a                                                                                | Constant-time compare advised                                                                                        | [H21]  |
| Zendesk    | base64(HMAC-SHA256(timestamp + body))                                  | Timestamp header                                              | Not documented                                                                     | Secret can be reset                                                                                                  | [ZD17] |
| Linear     | Hex HMAC-SHA256 of the raw body                                        | `webhookTimestamp` "within a minute"                          | 3 retries: 1 minute, 1 hour, 6 hours                                               | "might be disabled ... and must be re-enabled again manually"                                                        | [L6]   |
| Attio      | Hex HMAC-SHA256 of the body                                            | n/a                                                           | Up to 10 retries over about 3 days, exponential backoff                            | Marked "degraded" plus email; `Idempotency-Key` stays the same across retries; 5 s timeout; 25 requests/s per target | [A7]   |
| Close      | HMAC-SHA256 of timestamp + payload                                     | Timestamp header                                              | Exponential backoff, "up to 72 hours"                                              | Auto-pauses at 100,000 backlogged events or after 3 days of failures                                                 | [C3]   |
| Twenty     | HMAC-SHA256 of `{timestamp}:{payload}`                                 | Timestamp header                                              | Not documented                                                                     | n/a                                                                                                                  | [T4]   |
| ClickUp    | Hex HMAC-SHA256 (`X-Signature`)                                        | n/a                                                           | Not documented                                                                     | n/a                                                                                                                  | [CK10] |
| Pipedrive  | None; optional HTTP Basic auth only                                    | n/a                                                           | 3 retries at 3, 30 and 150 s; 10 s timeout                                         | Banned 30 minutes after 10 failures; deleted after 3 days without a success                                          | [P7]   |
| monday.com | Challenge on creation; JWT only for webhooks created with an app token | n/a                                                           | "once a minute for 30 minutes"                                                     | n/a                                                                                                                  | [M7]   |
| Intercom   | Not verified                                                           | n/a                                                           | Resent if no 200 within 5,000 ms                                                   | Paused 15 minutes after more than 1,000 consecutive errors; suspended after 7 days (private apps only)               | [I5]   |
| Front      | Not verified                                                           | n/a                                                           | Application webhooks retry; "Rule webhooks do not offer the same retry guarantees" | n/a                                                                                                                  | [FR3]  |

**Good:** HMAC with a timestamp and replay window; secret rotation with overlap; at-least-once delivery with an idempotency key; exponential backoff over at least 24 hours; a delivery log with response codes and manual replay; and an email before auto-disable.

#### 8.4 Rate limits: TABLE STAKES (documented, with headers)

| Product    | Published limit                                                                                                                                                                                 | Source |
| ---------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| HubSpot    | Private apps: 100 (Free/Starter) or 190 (Pro/Enterprise) per 10 s per app. Daily: 250k / 625k / 1M per account. Public OAuth apps: 110 per 10 s per account. 429 responses carry a `policyName` | [H20]  |
| Pipedrive  | Daily token budget plus a burst per 2 s by plan (20, 40, 100, 120; OAuth 4×). Search: 10 per 2 s                                                                                                | [P6]   |
| Attio      | "100 requests per second" for reads, "25" for writes. `Retry-After` is a date. Score-based limits on list endpoints are summed across apps                                                      | [A8]   |
| Close      | Per endpoint group; organisation limit is 3× the per-key limit; `RateLimit: limit, remaining, reset` header                                                                                     | [C4]   |
| Zoho CRM   | Credits per 24 h: 50,000 plus a per-licence amount by edition. Concurrency 5 to 25                                                                                                              | [Z9]   |
| monday.com | Complexity budget per minute; daily call caps by plan; concurrency and per-IP limits                                                                                                            | [M6]   |
| Airtable   | "5 requests per second" per base; 50 per second per user token; 30 s penalty after a 429                                                                                                        | [AT9]  |
| Notion     | 3 requests/s (10 on Business and Enterprise) per connection; `Retry-After` up to 60 s                                                                                                           | [N7]   |
| ClickUp    | 100 per minute per token (Free to Business), 1,000 (Business Plus), 10,000 (Enterprise)                                                                                                         | [CK11] |
| Zendesk    | 200 / 400 / 700 / 2,500 per minute by plan; "30 updates per 10 minutes per user per ticket"                                                                                                     | [ZD18] |
| Intercom   | 10,000 per minute per app and 25,000 per workspace, spread across 10 s windows                                                                                                                  | [I4]   |
| Front      | 50 / 100 / 200 per minute by plan; burst of half the limit; separate guards for analytics and search                                                                                            | [FR4]  |
| Twenty     | "100 per minute"; 60 records per batch call                                                                                                                                                     | [T5]   |

#### 8.5 Per-integration API call logs: DIFFERENTIATOR

HubSpot private apps show 30 days of calls, filterable by method and status code and exportable to CSV. HubSpot does not store "the request body, request URL parameters, or response payload" [H22]. Webhook delivery logs were not verified for other vendors.

#### 8.6 Outbound email domain authentication: TABLE STAKES for anything that sends email

- **HubSpot.** DKIM ("two CNAME records"), an SPF `include:`, DMARC and MX records. Status shows "Not authenticated", "Partially authenticated" or "Authenticated" [H19].
- **Zendesk.** DKIM through two CNAMEs, with keys rotated quarterly. "Enabling this feature before adding the CNAME records for your domain will cause delivery failures" [ZD16].

**Good:** live DNS checks with per-record status, DMARC alignment guidance, a warning before enabling, and automatic key rotation.

#### 8.7 Marketplace and Zapier: TABLE STAKES (not deeply researched here)

- Close allows Zapier and similar platforms up to 500 webhook subscriptions [C3].
- Front gives OAuth partners a separate 120 requests/min, with Zapier as the exception [FR4].
- Slack shows a "Pre-Approved" marketplace category [SL1].

---

### 9. Admin console

#### 9.1 Users, seats and billing: TABLE STAKES

- **Airtable's admin panel** has Users, Roles, Groups, Workspaces, Bases, Interfaces, Reports and Settings. Admins can filter users by 2FA status. Billing counts each user at their "highest permission level" [AT11].
- **Seat behaviour on removal:**
  - Close keeps the seat until the next billing cycle [C6].
  - Linear drops it from the next cycle [L4].
  - Copper needs support to drop it [CU2].
- **Pipedrive** sells extra permission sets under "Usage limits" [P3].

#### 9.2 Usage analytics: COMMON

- **Slack.** All plans, more detail on paid; member analytics; CSV export [SL5].
- **Notion Enterprise.** Members, content, search and AI analytics for 365 days, with CSV [N6].
- **Airtable.** "Last Activity Time" and activity reports [AT11].

#### 9.3 Public status page: TABLE STAKES

Verified examples:

- Notion: components and subscriptions [N8].
- Linear: separate US and EU regions [L7].
- Attio [A11].

Others not checked (section 12).

#### 9.4 Security posture page: DIFFERENTIATOR

- Salesforce Health Check, with custom baselines [S13].
- Pipedrive's dashboard risk findings and monthly digest [P5].
- ClickUp publishes its "Default security settings" [CK6].
- monday.com publishes a "Secure Configuration Checklist" [M9].

**Good:** one page showing 2FA adoption, admin count, stale users, stale tokens, SSO enforcement, session policy and last export, each with a one-click fix.

#### 9.5 Configuration promotion and export: DIFFERENTIATOR

- HubSpot sandbox deploys up to 300 changes at a time [H16].
- Zoho CRM sandbox deploy [Z7] and "Copy Customization" [Z10].
- Zendesk sandboxes need manual re-entry in production [ZD13].
- Salesforce sandboxes [S7].

---

### 10. What security questionnaires check, and how vendors price it

**CSA CAIQ and CCM**

- CAIQ v4 is "an industry-accepted way to document what security controls exist in IaaS, PaaS, and SaaS services", written as yes/no questions against the Cloud Controls Matrix [X1].
- CCM v4 has "197 control objectives that are structured in 17 domains" [X2].

**How the CCM domains map to this report**

| CCM domain                                                   | Features above that answer it                                                    |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------- |
| Identity & Access Management (IAM)                           | 5.x, 6.1 to 6.9 (least privilege, MFA, SSO, SCIM, access reviews, offboarding)   |
| Logging & Monitoring (LOG)                                   | 4.1 to 4.7 (coverage, retention, protection of logs, alerting, SIEM)             |
| Data Security & Privacy (DSP)                                | 7.1 to 7.5 (classification, retention, deletion, residency, data subject rights) |
| Business Continuity & Operational Resilience (BCR)           | 7.7 (backups and tested restore) and the status page (9.3)                       |
| Change Control & Configuration Management (CCC)              | 4.7, 7.8, 9.5 (configuration change log, sandbox, promotion)                     |
| Cryptography, Encryption & Key Management (CEK)              | 7.6                                                                              |
| Application & Interface Security (AIS)                       | 8.1 to 8.4 (token scopes, webhook signing, rate limits)                          |
| Supply Chain Management, Transparency & Accountability (STA) | Subprocessor lists, residency exceptions (7.5)                                   |

**Plan-gating pattern.** In this sample the following are almost always enterprise-tier only:

- Audit logs: Notion, Linear, ClickUp, Airtable, Zendesk, monday.com, Slack.
- SCIM.
- Data residency.
- Retention policies.
- BYOK.
- Read-access logs.

SSO carries the largest mark-ups [X3]. For an internal tool such as HQ there is no plan ladder, so these become free decisions rather than pricing levers.

---

### 11. Implications for a small fintech's internal staff portal

HQ's users are staff, and the data subjects are customers. The "buyer" running a vendor-style review is therefore the company's own auditors, bank partners and regulators. They will ask the CAIQ/CCM-style questions above about HQ itself. Suggested priority:

**Must have (credible baseline)**

1. **Soft delete everywhere.** A 30 to 90-day restore for every object, including notes, files and activities. Association-faithful restore, with a pre-restore "what will not come back" notice. Purge is owner-only and logged.
2. **Field-level history on customer, revenue and ticket objects.** Actor, source and request ID on every entry; immutable; retained for at least the record-keeping period, which for financial records is usually years.
3. **An append-only admin and security audit log.** Covering logins, MFA, role and permission changes, exports, bulk edits and deletes, purges, API key lifecycle, impersonation and settings. At least 12 months online, with filters and CSV.
4. **Identity basics.** Enforced MFA with passkeys; idle and absolute session timeouts; admin remote sign-out; per-user login history with IP and device.
5. **Least privilege.** Roles plus record-level and field-level control. Separate verbs for export, import, bulk edit, bulk delete, merge and purge. A restricted, time-boxed role for interns and contractors, with PII masked.
6. **An offboarding wizard.** Freeze, transfer open work, revoke sessions and tokens, then audit.
7. **Export governance.** Permission, optional approval, expiring links and an export log.
8. **Backups with tested restore**, plus a source-scoped rollback for bulk or import mistakes (the HubSpot pattern).

**Should have (what a diligent reviewer will ask next)**

9. SAML or OIDC SSO, with SCIM when an IdP exists. An IP allowlist for admin surfaces.
10. Push streaming of the audit log to a SIEM, plus read-access logs for sensitive records (KYC documents, bank details).
11. Retention schedules; erasure with a block-list; a DSAR export; personal-field marking.
12. Sensitive-data detection and redaction in notes and emails (card and account numbers).
13. Integration security: scoped, expiring, owner-tagged API tokens; HMAC-signed webhooks with retries and an idempotency key; a per-integration call log.
14. A security posture page (2FA adoption, admin count, stale users, stale tokens) and a monthly digest.

**Differentiators (nice to have)**

15. Unmerge.
16. Configuration sandbox and promotion.
17. Tamper-evident (hash-chained) audit export.
18. Dual control for admin grants and bulk purges.
19. BYOK.

---

### 12. Not verified in this pass

These were not stated as fact above. Each is a lead to check against the live documentation:

- **Salesforce.** Login History retention and row limits; session-timeout value list; Salesforce Backup product details. Salesforce Help renders client-side, and only some legacy article views returned text.
- **Salesforce Recycle Bin capacity.** Salesforce Help says no record-count limit [S1]; backup vendors cite a 25× storage cap [S2]. Confirm against current Help.
- **Pipedrive.** SSO plan tier, 2FA enforcement options and the contents of "Security alerts". The help centre rate-limited further reads.
- **monday.com.** SSO, IP restrictions, session management, the board permission matrix and enterprise lockdown features. support.monday.com returned 403; the trash, archive and undo facts come from search snippets.
- **monday.com audit event names.** The audit-event catalogue's exact event names were not reliably extracted.
- **Intercom.** Help-centre article bodies did not render: custom-role permission list, data-retention settings, regional hosting, teammate-removal specifics (snippet only) and webhook signature scheme.
- **HubSpot.** Data residency (EU hosting), IP restrictions, view-only seat terms and the version counts behind "Restore CRM changes".
- **Zoho CRM.** Audit log retention and content. The article URL resolved to other Zoho products.
- **Front.** Audit log, IP restrictions and session settings.
- **Slack.** IP allowlisting and data residency.
- **Google Workspace.** 2-Step Verification and passkey enforcement detail; multi-party approval for sensitive admin actions.
- **Passkey support** beyond HubSpot.
- **Status pages** other than Notion, Linear and Attio.
- **G2 category requirement text.** g2.com returned 403.
- **Shared Assessments SIG domain list.** The page is behind a sign-in.

---

### 13. Sources

All accessed 2026-10-03.

**HubSpot**

- [H1] https://knowledge.hubspot.com/records/restore-deleted-records
- [H2] https://knowledge.hubspot.com/records/restore-deleted-activity-in-a-record
- [H3] https://knowledge.hubspot.com/privacy-and-consent/understand-restorable-and-permanent-contact-deletions
- [H4] https://knowledge.hubspot.com/object-settings/restore-crm-changes
- [H5] https://knowledge.hubspot.com/workflows/restore-workflow-crm-property-changes
- [H6] https://knowledge.hubspot.com/records/merge-records
- [H7] https://knowledge.hubspot.com/account-management/view-and-export-account-activity-history-in-a-centralized-audit-log
- [H8] https://knowledge.hubspot.com/user-management/hubspot-user-permissions-guide
- [H9] https://knowledge.hubspot.com/account-security/set-up-single-sign-on-sso
- [H10] https://knowledge.hubspot.com/account-security/set-up-two-factor-authentication-for-your-hubspot-login
- [H11] https://knowledge.hubspot.com/account-security/restrict-which-login-methods-users-can-use-to-access-your-account
- [H12] https://knowledge.hubspot.com/account-security/manage-user-login-sessions
- [H13] https://knowledge.hubspot.com/privacy-and-consent/how-do-i-perform-a-gdpr-delete-in-hubspot
- [H14] https://knowledge.hubspot.com/properties/regex-validation-rules
- [H15] https://knowledge.hubspot.com/records/deduplication-of-records
- [H16] https://knowledge.hubspot.com/account-management/set-up-a-hubspot-standard-sandbox-account
- [H17] https://knowledge.hubspot.com/import-and-export/export-records
- [H18] https://knowledge.hubspot.com/account-security/scan-and-redact-sensitive-data
- [H19] https://knowledge.hubspot.com/domains-and-urls/connect-your-email-sending-domain
- [H20] https://developers.hubspot.com/docs/api/usage-details
- [H21] https://developers.hubspot.com/docs/guides/apps/authentication/validating-requests
- [H22] https://developers.hubspot.com/docs/api/private-apps
- [H23] (3rd party) https://insidea.com/blog/hubspot/kb/how-to-undo-property-value-changes-in-hubspot-crm

**Salesforce**

- [S1] https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.home_delete.htm&language=en_US
- [S2] (3rd party) https://www.grax.com/blog/salesforce-recycle-bin-limits/
- [S3] https://trailhead.salesforce.com/content/learn/modules/data_security/data_security_overview
- [S4] https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.users_freeze.htm&language=en_US
- [S5] https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.granting_login_access.htm&language=en_US
- [S6] https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.admin_transfer.htm&language=en_US
- [S7] https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.create_test_instance.htm&language=en_US
- [S8] https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.duplicate_rules_overview.htm&language=en_US
- [S9] https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.security_restriction_rule.htm&language=en_US
- [S10] https://developer.salesforce.com/docs/atlas.en-us.field_history_retention.meta/field_history_retention/field_audit_trail.htm
- [S11] https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/object_reference/sforce_api_objects_setupaudittrail.htm and (3rd party) https://gearset.com/blog/salesforce-audit-trail/
- [S12] (3rd party) https://docs.calibermind.com/system-configuration/create-field-history-in-salesforce/
- [S13] https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.security_health_check.htm&language=en_US
- [S14] https://help.salesforce.com/apex/HTViewHelpDoc?id=sf.login_ip_ranges.htm&language=en_US
- [S15] https://help.salesforce.com/apex/HTViewHelpDoc?id=xcloud.admin_sessions.htm&language=en_US

**Pipedrive**

- [P1] https://support.pipedrive.com/en/article/restore-data
- [P2] https://support.pipedrive.com/en/article/how-can-i-restore-deleted-deals
- [P3] https://support.pipedrive.com/en/article/permission-sets
- [P4] https://support.pipedrive.com/en/article/visibility-groups
- [P5] https://support.pipedrive.com/en/article/security-dashboard (links to https://support.pipedrive.com/article/security-alerts)
- [P6] https://pipedrive.readme.io/docs/core-api-concepts-rate-limiting
- [P7] https://pipedrive.readme.io/docs/guide-for-webhooks
- [P8] (community) https://community.pipedrive.com/discussion/16972/how-to-revert-the-action-when-bulk-change-is-made
- [P9] (community) https://community.pipedrive.com/discussion/2555/undo-function-in-changelog
- [P10] https://trustcenter.pipedrive.com/

**Attio**

- [A1] https://docs.attio.com/docs/archiving-vs-deleting
- [A2] https://attio.com/help/reference/managing-your-data/records/merge-and-delete-records
- [A3] https://attio.com/help/reference/workspace-settings-billing/security
- [A4] https://attio.com/help/reference/workspace-settings-billing/manage-members-and-admins
- [A5] https://attio.com/help/reference/workspace-settings-billing/view-and-manage-member-accounts
- [A6] https://attio.com/pricing
- [A7] https://docs.attio.com/rest-api/guides/webhooks
- [A8] https://docs.attio.com/rest-api/guides/rate-limiting
- [A9] https://attio.com/changelog/2025/changelog-january-28-2025-
- [A10] (3rd party) https://support.probackup.io/en/articles/16413179-how-to-restore-attio-data
- [A11] https://status.attio.com

**Close**

- [C1] https://help.close.com/docs/deleting-leads
- [C2] https://developer.close.com/resources/event-log/
- [C3] https://developer.close.com/topics/webhooks/
- [C4] https://developer.close.com/topics/rate-limits/
- [C5] https://help.close.com/docs/roles-permissions (help index: https://help.close.com/docs lists "Enabling 2FA" and "Exporting Data")
- [C6] https://help.close.com/docs/adding-and-removing-users
- [C7] https://help.close.com/docs/api-keys-oauth

**Zoho CRM**

- [Z1] https://help.zoho.com/portal/kb/articles/recycle-bin
- [Z2] https://help.zoho.com/portal/en/kb/crm/data-administration/data-backup/articles/requesting-data-backup
- [Z3] https://help.zoho.com/portal/en/kb/crm/security-control/configure-allowed-ips/articles/configure-allowed-ips
- [Z4] https://help.zoho.com/portal/en/kb/crm/security-control/compliance-setting/gdpr/articles/data-subject-rights
- [Z5] https://help.zoho.com/portal/en/kb/crm/security-control/compliance-setting/gdpr
- [Z6] https://help.zoho.com/portal/en/kb/crm/data-administration/sandbox/articles/creating-sandbox
- [Z7] https://help.zoho.com/portal/en/kb/crm/data-administration/sandbox (including "Deploying sandbox changes to production")
- [Z8] https://help.zoho.com/portal/en/kb/crm/security-control
- [Z9] https://www.zoho.com/crm/developer/docs/api/v8/api-limits.html
- [Z10] https://help.zoho.com/portal/en/kb/crm/data-administration

**Freshsales (Freshworks CRM)**

- [F1] https://crmsupport.freshworks.com/support/solutions/articles/50000002562-how-to-restore-deleted-records-from-the-recycle-bin-
- [F2] https://crmsupport.freshworks.com/support/solutions/articles/50000002682-how-to-track-changes-using-audit-logs-
- [F3] https://crmsupport.freshworks.com/support/solutions/articles/50000002411
- [F4] https://crmsupport.freshworks.com/support/solutions/articles/50000002413
- [F5] https://crmsupport.freshworks.com/support/solutions

**Copper**

- [CU1] https://support.copper.com/en/articles/8823276-set-record-visibility-permissions
- [CU2] https://support.copper.com/en/articles/8823473-remove-a-user
- [CU3] https://support.copper.com/en/articles/14434439-replace-a-user-and-reassign-records
- [CU4] https://support.copper.com/en/articles/8823375-data-privacy-and-security-at-copper
- [CU5] https://support.copper.com/en/collections/9574906-data-and-privacy

**Twenty**

- [T1] https://docs.twenty.com/user-guide/permissions-access/capabilities/permissions.md
- [T2] https://docs.twenty.com/user-guide/permissions-access/how-tos/permissions-faq.md
- [T3] https://docs.twenty.com/user-guide/permissions-access/capabilities/sso-configuration.md
- [T4] https://docs.twenty.com/developers/extend/webhooks.md
- [T5] https://docs.twenty.com/developers/extend/api.md
- [T6] https://docs.twenty.com/developers/extend/apps/data/timeline-activity-types.md

**monday.com**

- [M1] (snippet) https://support.monday.com/hc/en-us/articles/115005312729
- [M2] https://monday.com/blog/product/accidentally-deleted-something-we-have-your-back-with-these-feature-updates/
- [M3] (snippet) https://support.monday.com/hc/en-us/articles/360011810600
- [M4] https://developer.monday.com/api-reference/reference/audit-logs
- [M5] https://developer.monday.com/api-reference/reference/activity-logs
- [M6] https://developer.monday.com/api-reference/docs/rate-limits
- [M7] https://developer.monday.com/api-reference/reference/webhooks
- [M8] https://monday.com/pricing
- [M9] https://monday.com/trustcenter

**Airtable**

- [AT1] https://support.airtable.com/docs/managing-trash-in-airtable
- [AT2] https://support.airtable.com/docs/taking-and-restoring-base-snapshots
- [AT3] https://support.airtable.com/articles/3516802427-record-level-revision-history-in-airtable
- [AT4] https://support.airtable.com/articles/2296468758-airtable-field-and-table-editing-permissions
- [AT5] https://support.airtable.com/articles/1665450173-accessing-enterprise-audit-logs-in-airtable
- [AT6] https://support.airtable.com/articles/3982973603-creating-and-managing-data-retention-policies-in-airtable
- [AT7] https://support.airtable.com/articles/9934989703-creating-personal-access-tokens
- [AT8] https://support.airtable.com/articles/4729571682-transferring-airtable-workspace-base-and-interface-ownership-before-leaving-a-company-or-organization
- [AT9] https://support.airtable.com/articles/7735693959-managing-api-call-limits-in-airtable
- [AT10] https://support.airtable.com/articles/3345708696-data-residency-at-airtable
- [AT11] https://support.airtable.com/articles/4183691355-airtable-admin-panel-overview (SSO and key-management guides indexed at https://support.airtable.com/llms.txt)

**Notion**

- [N1] https://www.notion.com/help/duplicate-delete-and-restore-content
- [N2] https://www.notion.com/help/audit-log
- [N3] https://www.notion.com/help/provision-users-and-groups-with-scim
- [N4] https://www.notion.com/help/saml-sso-configuration
- [N5] https://www.notion.com/help/data-residency
- [N6] https://www.notion.com/help/workspace-analytics
- [N7] https://developers.notion.com/reference/request-limits
- [N8] https://www.notion-status.com

**ClickUp**

- [CK1] https://help.clickup.com/hc/en-us/articles/6311742742423-Restore-items-from-the-Trash
- [CK2] https://help.clickup.com/hc/en-us/articles/21929900448535-Workspace-audit-logs
- [CK3] https://help.clickup.com/hc/en-us/articles/25324213764119-Audit-Logs-feature-availability-and-limits
- [CK4] https://help.clickup.com/hc/en-us/articles/6309195687959-Manage-Custom-Role-permissions
- [CK5] https://help.clickup.com/hc/en-us/articles/30406366890391-Hide-Custom-Fields-from-guests-and-limited-members
- [CK6] https://help.clickup.com/hc/en-us/articles/21797055143575-Default-security-settings
- [CK7] https://help.clickup.com/hc/en-us/articles/6327741965591-Activate-and-manage-two-factor-authentication
- [CK8] https://help.clickup.com/hc/en-us/articles/6310514663063-Remove-someone-from-a-Workspace
- [CK9] https://help.clickup.com/hc/en-us/articles/6309768265495-Manage-tasks-with-the-Bulk-Action-Toolbar
- [CK10] https://developer.clickup.com/docs/webhooksignature
- [CK11] https://developer.clickup.com/docs/rate-limits
- [CK12] https://help.clickup.com/hc/en-us/articles/6311968998167-My-Settings
- [CK13] https://help.clickup.com/hc/en-us/articles/30452538132759-Chat-data-retention

**Linear**

- [L1] https://linear.app/docs/delete-archive-issues
- [L2] https://linear.app/docs/audit-log
- [L3] https://linear.app/docs/saml-and-access-control
- [L4] https://linear.app/docs/members-roles
- [L5] https://linear.app/docs/security
- [L6] https://linear.app/developers/webhooks
- [L7] https://linearstatus.com

**Zendesk**

- [ZD1] https://support.zendesk.com/hc/en-us/articles/4408835089050
- [ZD2] https://support.zendesk.com/hc/en-us/articles/4408883501210-Are-tickets-and-ticket-data-kept-permanently-on-my-Zendesk
- [ZD3] https://support.zendesk.com/hc/en-us/articles/6388012977306-Creating-ticket-deletion-schedules (also https://support.zendesk.com/hc/en-us/articles/9783945525658-Creating-attachment-deletion-schedules)
- [ZD4] https://support.zendesk.com/hc/en-us/articles/4408828001434-Viewing-the-audit-log-for-changes-to-your-account
- [ZD5] https://developer.zendesk.com/api-reference/ticketing/account-configuration/audit_logs/
- [ZD6] https://support.zendesk.com/hc/en-us/articles/6561144266906-About-the-Advanced-Data-Privacy-and-Protection-ADPP-add-on
- [ZD7] https://support.zendesk.com/hc/en-us/articles/11093887789850-Announcing-access-log-webhooks-for-SIEM-integration
- [ZD8] https://support.zendesk.com/hc/en-us/articles/4408882153882-Creating-custom-roles-and-assigning-agents
- [ZD9] https://support.zendesk.com/hc/en-us/articles/4408894200474-Assuming-end-users (masked roles: https://support.zendesk.com/hc/en-us/articles/10529708070682-Announcing-data-masking-enhancements-ADPP-add-on)
- [ZD10] https://support.zendesk.com/hc/en-us/articles/4408894156186-Restricting-access-to-Zendesk-using-IP-restrictions
- [ZD11] https://support.zendesk.com/hc/en-us/articles/4408832533274-Setting-session-timeout-for-users
- [ZD12] https://support.zendesk.com/hc/en-us/articles/4408822049818-Creating-a-sandbox-environment-to-test-changes
- [ZD13] https://support.zendesk.com/hc/en-us/articles/4408824434586-Using-and-managing-sandboxes
- [ZD14] https://support.zendesk.com/hc/en-us/articles/10858375532954-Ticket-reassignment-is-causing-issues-with-analytics-and-reporting
- [ZD15] https://support.zendesk.com/hc/en-us/articles/4408838409754-About-the-Data-Center-Location-add-on
- [ZD16] https://support.zendesk.com/hc/en-us/articles/4408822303386-Digitally-signing-your-email-with-DKIM
- [ZD17] https://developer.zendesk.com/documentation/webhooks/verifying/
- [ZD18] https://developer.zendesk.com/api-reference/introduction/rate-limits/
- [ZD19] https://developer.zendesk.com/api-reference/ticketing/tickets/ticket_audits/

**Intercom**

- [I1] (snippet) https://www.intercom.com/help/en/articles/1892979-deleting-teammates-and-their-data
- [I2] (community) https://community.intercom.com/inbox-9/is-there-a-way-to-retrieve-deleted-conversations-1021 and https://community.intercom.com/contacts-14/where-can-i-see-my-archived-users-2785
- [I3] https://developers.intercom.com/docs/references/rest-api/api.intercom.io/admins/listactivitylogs
- [I4] https://developers.intercom.com/docs/references/rest-api/errors/rate-limiting
- [I5] https://developers.intercom.com/docs/webhooks/webhook-notifications
- [I6] https://www.intercom.com/help/en/articles/176-teammate-permissions-how-to-control-workspace-access

**Front**

- [FR1] https://help.front.com/en/articles/2108
- [FR2] https://help.front.com/en/articles/2083
- [FR3] https://dev.frontapp.com/docs/webhooks-1
- [FR4] https://dev.frontapp.com/docs/rate-limiting
- [FR5] https://front.com/pricing

**Slack**

- [SL1] https://slack.com/help/articles/222386767-Manage-app-approval-for-your-workspace
- [SL2] https://slack.com/help/articles/203457187-Customize-message-and-file-retention-policies
- [SL3] https://docs.slack.dev/admins/audit-logs-api
- [SL4] https://slack.com/help/articles/115005223763-Manage-session-duration-
- [SL5] https://slack.com/help/articles/218407447-View-your-Slack-analytics-dashboard

**Google Workspace**

- [G1] https://knowledge.workspace.google.com/admin/users/restore-a-recently-deleted-user
- [G2] https://knowledge.workspace.google.com/admin/drive/recover-deleted-files-and-folders-for-drive-users
- [G3] https://knowledge.workspace.google.com/admin/reports/data-retention-and-lag-times
- [G4] https://knowledge.workspace.google.com/admin/apps/control-which-apps-access-google-workspace-data

**Frameworks and market**

- [X1] https://cloudsecurityalliance.org/artifacts/star-level-1-security-questionnaire-caiq-v4
- [X2] https://cloudsecurityalliance.org/research/cloud-controls-matrix
- [X3] https://sso.tax

# §C. Everyday productivity and collaboration (the full report)

## C — Everyday productivity and collaboration: what serious business tools ship

Research for HQ (internal CRM + support desk + revenue + team admin). Focus area C: the things staff touch every day — finding, viewing, collaborating, working through tasks, writing, customising, and the overall experience.

Prepared 3 October 2026. Products examined: HubSpot, Salesforce (Lightning), Pipedrive, Attio, Close, Zoho CRM, Freshsales, Copper, Folk, Twenty, monday.com, Airtable, Notion, ClickUp, Asana, Linear, Zendesk, Intercom, Front, Superhuman, plus Help Scout as a collision-detection reference. Height was discontinued (its homepage notice gives "the final day of service being September 24th, 2025" — [archived homepage](https://web.archive.org/web/20251008182722/https://height.app/)), so it is excluded from current counts.

---

### How to read this

**Ratings**

| Rating             | Meaning                                                                                                        |
| ------------------ | -------------------------------------------------------------------------------------------------------------- |
| **TABLE STAKES**   | Nearly every product that does this job has it (roughly 80 %+). A buyer notices its absence in the first demo. |
| **COMMON**         | Many have it (roughly 40–80 %). Power users and specific roles expect it.                                      |
| **DIFFERENTIATOR** | Few have it, or only the best implementations do it well.                                                      |

Ratings are judged against products that do the same job. Help-desk features are compared with Zendesk, Intercom, Front and HubSpot's help desk. CRM features are compared with the CRMs. Work-management features are compared with Asana, ClickUp, monday, Notion, Airtable and Linear.

**Feature block layout.** Each feature gives (a) what it is, (b) which products have it, each with a source link, (c) the concrete behaviours that separate a good implementation from a weak one, (d) a rating, and a one-line **acceptance check** you can run against HQ.

**Method and limits.** Each vendor's help-centre sitemap was enumerated and the article text fetched directly on 3 Oct 2026. Quotes are verbatim from those pages. The web-search budget ran out part-way through, so the later evidence comes from direct fetches only. Some sites returned HTTP 403 to automated fetches: Salesforce Help, Salesforce developer docs, G2, Capterra, GetApp, TrustRadius and Software Advice. As a result:

- Salesforce evidence comes from Trailhead units plus Salesforce Admins blog posts that surfaced in search.
- G2's category-qualification text could not be quoted. No buyer-checklist claims in this report rely on G2.
- Anything not re-verified this pass is marked _(not re-verified)_.

---

### Executive summary

#### Table stakes in 2026: a staff tool without these feels unfinished

1. One global search across every record type, reaching into notes, emails and IDs, with type filters and recents.
2. Saved views with private, team and everyone scopes; a filter builder with AND/OR groups; a column chooser; sorting.
3. Table and board views with inline edit.
4. Bulk select, including "select all _N_ matching", then bulk edit, assign and delete, with a count and a confirmation.
5. A record preview side panel that is editable in place.
6. Favourites and pins in the sidebar.
7. @mentions that notify and respect permissions; comments on records and activities.
8. Follow/subscribe with automatic rules, an in-app notification inbox, and per-type × per-channel notification settings.
9. A filterable activity timeline per record, plus field history.
10. Tasks with due date and time, assignee, priority and reminders, and a "due today / overdue" home.
11. Two-way Google/Outlook calendar sync; email sync and BCC/forward logging; email templates with merge fields; snippets.
12. File attachments on records, with preview and clear size limits.
13. Custom fields, including currency, multi-select and relation types; required fields.
14. Native mobile apps; dark mode; per-user time zone and locale; a published accessibility conformance target (WCAG 2.1 AA).
15. Recoverability: a recycle bin (30–90 days) and an undo for destructive actions.

#### Common: expected by power users

- A ⌘K command palette and a `?` shortcut cheat sheet.
- Recurring tasks; a task queue or "start tasks" focus mode.
- Scheduling pages; meeting recording and notes.
- Formula and rollup fields; custom objects; validation rules.
- Conditional formatting; calendar and timeline views.
- Snoozing notifications; batched and digest notifications.
- Multi-currency with exchange rates.
- Mobile offline mode; e-signature; tracked document links; record templates.

#### Differentiators

- Real-time presence outside help desks. Attio shows other people's cursors on table cells.
- Keyboard peek with next/previous navigation (Linear's Space key).
- Spreadsheet-grade cell-range copy and paste.
- Bulk rollback by change source (HubSpot's 14-day restore).
- Exchange rates dated by deal date and locked at close.
- Shared, live email drafts.
- Sub-100 ms optimistic UI backed by a local sync engine.

#### Even the leaders have gaps (useful for calibrating the bar)

- **Pipedrive** has no native recurring activities: _"we do not currently have a dedicated feature to create recurring activities"_ ([source](https://support.pipedrive.com/en/article/recurring-activities)).
- **Pipedrive** bulk edits _"cannot be undone after confirmation"_ ([source](https://support.pipedrive.com/en/article/bulk-editing-and-filtering)).
- **Pipedrive's** time zone cannot be set in the app; it comes from the computer ([source](https://support.pipedrive.com/en/article/can-i-change-my-displayed-timezone)).
- **HubSpot's** mobile app does not work offline: _"Records cannot be created, edited, or viewed in the mobile app without internet"_ ([source](https://knowledge.hubspot.com/records/work-with-records-in-the-hubspot-mobile-app)).
- **HubSpot's** knowledge base has no article on an app dark mode. Its only dark-mode article is about [marketing emails](https://knowledge.hubspot.com/marketing-email/optimize-marketing-emails-for-dark-mode).
- **HubSpot's** CRM index search matches whole words only: _"Searching email will not display the contact"_ ([source](https://knowledge.hubspot.com/records/search-your-crm)).
- **Notion** search excludes comments: _"Comments and discussions are not included in search results"_ ([source](https://www.notion.com/help/search)).
- **ClickUp** keyboard shortcuts are _"disabled by default"_ ([source](https://help.clickup.com/hc/en-us/articles/6309030550167-Use-keyboard-shortcuts)).
- **Intercom's** presence indicator is _"not consistently reliable or prominently displayed"_, per an open feature request from 1 Oct 2025 ([source](https://community.intercom.com/ideas/feature-request-real-time-agent-presence-indicator-12772)).
- **Close** only stores links to external schedulers; it has no native booking page ([source](https://help.close.com/feature-guide/scheduling-links)). Close also supports only US and UK date formats, taken from the browser ([source](https://help.close.com/technical-support/date-and-time-formats)).
- **Twenty** lists no formula or rollup field type ([source](https://docs.twenty.com/user-guide/data-model/capabilities/fields)).

#### Six cross-cutting behaviours separate good implementations from weak ones

1. **A speed budget.** 0.1 s is _"about the limit for having the user feel that the system is reacting instantaneously"_ ([NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)). Superhuman designs to a "100ms rule" ([blog](https://blog.superhuman.com/superhuman-is-built-for-speed/)).
2. **Keyboard parity.** Every action is reachable from the palette; the palette shows each action's shortcut; `?` opens a cheat sheet; `j`/`k` move through lists.
3. **Layered recoverability.** An instant undo toast (10 s to 1 min), then per-record field history, then a recycle bin (30–90 days), then bulk rollback.
4. **Scoped visibility everywhere.** Views, templates, notes and email bodies can each be "me / team / everyone", and mentions respect those scopes.
5. **Notification hygiene.** Batching, suppress-if-seen, urgency-based digests, snooze, do-not-disturb, and a per-type × per-channel settings matrix.
6. **Documented limits and edge cases.** File sizes, result caps, view caps and retention windows are stated, and errors say which limit was hit.

---

### 1. Finding things

#### 1.1 Global search across all record types — TABLE STAKES

**What it is.** One box and one shortcut that search every object (people, companies, deals, tickets, tasks), and the text inside activities. Results are grouped by type and can be filtered by type.

**Who has it**

- **HubSpot.** Global search covers _"CRM records, activities, blog posts, website pages, marketing emails, segments, dashboards, workflows, and campaigns"_.
  - Records are searched by name, notes, email subject, associated tasks, and call and meeting logs. Contacts are also searched by email and phone; companies by domain, address and city.
  - Custom objects are searched by up to 20 chosen properties.
  - Results are capped at 100. Cmd/Ctrl+K opens the box.
  - A preview pane lets you log a call, email or note straight from a result ([KB](https://knowledge.hubspot.com/account-management/search-within-your-hubspot-account)).
- **Salesforce (Einstein Search).**
  - Personalised ranking: results _"are only reordered to be more relevant for you"_; nothing is filtered out.
  - Natural-language queries such as "my open cases".
  - _"Actionable instant results"_ with previews and actions _"as soon as they put their cursor in the search box"_ ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/einstein-search-increased-productivity/get-started-einstein-search)).
- **Pipedrive.** Searches _"deals, leads, contacts, activities, projects, products and attachments"_.
  - Deals match on notes, custom fields and description (limit 2k characters).
  - Linked items appear alongside a hit: _"If your search matches a person, you'll see any deals linked to that item"_.
  - Permission-aware: _"Regular users can only search for their own activities"_ ([KB](https://support.pipedrive.com/en/article/search-finding-what-you-need)).
- **Attio.** `/` searches records _"by name, email, domain, phone number, or ID"_, plus descriptions, social handles and location ([help](https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace); [changelog](https://attio.com/changelog/2023/dedicated-search)).
- **Linear.** `/` searches issues, projects and documents by _"title, description, comments"_, with ID shorthand such as `lin123`. Typing `@` applies team, user or status filters inline ([docs](https://linear.app/docs/search)).
- **Notion.** Cmd/Ctrl+P (or K) searches page titles, page content and database values, but not comments ([help](https://www.notion.com/help/search)).
- **ClickUp.** Connected Search reaches into external tools such as Google Drive, GitHub, Jira and Salesforce ([help](https://help.clickup.com/hc/en-us/articles/14642390285463-Connected-Search)).
- **Close.** ⌘⇧F focuses search; saved searches become Smart Views ([shortcuts](https://help.close.com/docs/keyboard-shortcuts)).
- **Twenty.** A Cmd+K command menu that also reaches settings such as "Edit record page layout" ([docs](https://docs.twenty.com/user-guide/layout/overview)).

**Good vs weak**

- _Good:_
  - Indexes activity bodies (notes, email subjects and bodies, call notes), IDs, emails and phone numbers.
  - Returns linked records alongside the hit (Pipedrive).
  - Lets you act from the result (HubSpot, Salesforce).
  - Respects permissions (Pipedrive).
  - Matches similar terms by default, with quotes as an exact-match escape: _"Without quotes, searches may also include results for similar terms"_ (Linear).
  - Offers type-prefix filters (Linear: `p␠` for projects, `u␠` for users, `d␠` for documents).
- _Weak:_
  - Whole-word matching only: _"The CRM search matches complete words only and doesn't support substring matching within a word"_ (HubSpot index-page search).
  - Hyphens are treated as delimiters ("hedge-fund" becomes two terms).
  - Hard result caps with no "see all".
  - Comments are not indexed (Notion).
  - Custom fields are searchable only on top tiers (HubSpot: Enterprise, for custom searchable properties).
- _Edge cases to design for:_
  - CJK tokenisation. HubSpot treats each Kanji/Hiragana character as a separate term, and Katakana needs a `*` wildcard.
  - Case: secondary email _"must enter all lowercase characters"_.
  - Enumeration values must be searched by their quoted internal value ([HubSpot](https://knowledge.hubspot.com/records/search-your-crm)).

**Acceptance check:** Typing a fragment of a note, an email subject, a phone number, or a ticket/account ID into the global box finds the record in under ~200 ms. Results are grouped by type. Arrow keys plus Enter open a result, and a type chip narrows the list.

#### 1.2 Recent searches and recently viewed — TABLE STAKES

**Who has it**

- **Pipedrive.** _"Before you type in the search box, you can see your recently searched keywords and viewed items"_. Viewed items include those _"you've just created, viewed or edited"_ ([KB](https://support.pipedrive.com/en/article/search-finding-what-you-need)).
- **Linear.** _"recent searches as well as a list of recent issues"_ on open; `O` then `I` reopens recent issues ([docs](https://linear.app/docs/search)).
- **Notion.** Recently viewed pages appear when search opens ([help](https://www.notion.com/help/search)).
- **Salesforce.** Object home pages show a "Recently Viewed" summary by default, and each object has a filterable "Recently Viewed Leads"-style list view. Navigation-item menus jump to recent records ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/work-with-list-views), [Trailhead](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/navigate-around)).
- **HubSpot.** No recent-items menu. Users requested one in the [Ideas forum](https://community.hubspot.com/t5/HubSpot-Ideas/Recent-Items-view/idi-p/424150).

**Good vs weak**

- _Good:_ recents include items you created or edited, not only viewed; recents exist per object; available from a keyboard shortcut; synced across devices.
- _Weak:_ relying on browser history.

**Acceptance check:** Opening search with an empty query shows your last ~10 records and ~5 queries.

#### 1.3 Command palette (⌘K) — COMMON (near table stakes in modern SaaS)

**What it is.** One shortcut that opens a fuzzy-matching list of actions and destinations, aware of the current record and selection.

**Who has it**

- **Superhuman** wrote the reference principles ([blog](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)):
  - Available everywhere: _"Wherever your user is in your app, they must be able to bring up the command palette by using the same keyboard shortcut"_.
  - Complete: _"Give users access to every possible action"_.
  - Forgiving matching: fuzzy search and synonyms, so "archive" finds "Mark Done" and the typo "lnik" still works.
  - Context-aware score boosts.
  - Each match shows its keyboard shortcut, so users learn it.
- **Linear.** Cmd/Ctrl+K _"open pages or run actions"_. It acts on multi-selections (`X` to select, then Cmd+K) ([guide](https://linear.app/enablement/guides/navigating-linear), [docs](https://linear.app/docs/select-issues)).
- **Attio.** cmd+k quick actions _"differ depending on where you are in the platform"_; there are 30+ of them ([help](https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace); [changelog](https://attio.com/changelog/2023/redesigned-command-palette)).
- **Close.** Cmd+K handles "Go to Smart View: [name]", jumps to any settings page (typing "email templ" works), switches org, and creates leads ([help](https://help.close.com/docs/keyboard-shortcuts)).
- **Intercom.** ⌘K actions include compose reply/note, use macro, snooze, assign, tag, switch theme and switch language. Shortcuts are shown on the right.
  - Two weaknesses: _"results in Cmd+K are not shown based on recently or frequently used"_, and the available options vary by permissions ([help](https://www.intercom.com/help/en/articles/6272267-how-to-use-command-k-with-intercom-inbox)).
- **Twenty.** Cmd+K runs commands, including "Edit record page layout" ([docs](https://docs.twenty.com/user-guide/layout/overview)).
- **HubSpot.** Cmd/Ctrl+K opens global search, which has quick actions in its preview. It is search-first rather than a full action palette ([KB](https://knowledge.hubspot.com/account-management/search-within-your-hubspot-account)).

**Good vs weak**

- _Good:_
  - Contains every action, including settings pages.
  - Acts on the current record and on multi-selections.
  - Fuzzy matching with synonyms.
  - Ranks by recency and frequency.
  - Shows each action's shortcut.
  - Permission-aware.
- _Weak:_ a palette that only searches; static ordering (Intercom, by its own admission); no access to settings; no action on a selection.

**Acceptance check:** From any screen, ⌘K then typing "assign" assigns the open or selected records. The palette shows the action's direct shortcut.

#### 1.4 Keyboard shortcuts and cheat sheet — COMMON (TABLE STAKES in help desks)

**Who has it**

- **Close.** `?` on any page lists every shortcut. `j`/`k` move through lists; ⌘⇧D dials; ⌘⇧E emails. In the Inbox, `x` selects and `e`/`y` marks Done ([help](https://help.close.com/docs/keyboard-shortcuts)).
- **Linear.** Two-key navigation (`G` then `I`); `?` for the full list; Shift+V for display options; Cmd+B to toggle list/board ([guide](https://linear.app/enablement/guides/navigating-linear), [docs](https://linear.app/docs/display-options)).
- **Attio.** A `?` shortcut library; `n`, `t` and `c` create a note, task or email ([help](https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace)).
- **Pipedrive.** Number keys jump to navigation tabs; `/` searches; `.` or `+` quick-adds; L/D/A/P/O/N/R/E add a lead, deal, activity, person, organisation, note, product or project. Users can _"Enable and disable the keyboard shortcuts"_ ([KB](https://support.pipedrive.com/en/article/quick-actions-in-pipedrive)).
- **Zendesk.** Shortcuts live under Help > Keyboard shortcuts, with a PDF download. They are toggled per user: _"There is no global option"_ ([help](https://support.zendesk.com/hc/en-us/articles/4408832849946-Viewing-and-deactivating-keyboard-shortcuts); [new shortcuts](https://support.zendesk.com/hc/en-us/articles/9285444325914-Announcing-new-keyboard-shortcuts-in-Agent-Workspace)).
- **Intercom.** `Z` snoozes, `P` sets priority, `A` assigns. Shortcuts work on QWERTY, AZERTY and non-Latin keyboards in Chrome and Edge, but only _"outside the composer"_ ([help](https://www.intercom.com/help/en/articles/6272267-how-to-use-command-k-with-intercom-inbox)).
- **Airtable.** _"A list of keyboard shortcuts can be opened by holding CMD or CTRL & /"_ ([help](https://support.airtable.com/articles/2203617073-accessibility-in-airtable)).
- **ClickUp.** _"Keyboard shortcuts are disabled by default"_ ([help](https://help.clickup.com/hc/en-us/articles/6309030550167-Use-keyboard-shortcuts)).
- **Salesforce.** A third-party list includes Alt+number to "Open Recent Items record" ([TextExpander list](https://textexpander.com/blog/salesforce-keyboard-shortcuts-and-hotkeys)) _(Salesforce's official list not re-verified)_.
- **Folk.** Grid navigation shortcuts ([help](https://help.folk.app/en/articles/5007580-what-are-folk-shortcuts)).

**Good vs weak**

- _Good:_
  - Discoverable: a `?` overlay, tooltips that show keys, and the palette showing shortcuts.
  - Shortcuts never fire while you are typing in a field.
  - International keyboard layouts are supported.
  - Single-key shortcuts can be turned off or remapped. WCAG 2.1 success criterion 2.1.4 "Character Key Shortcuts" (Level A) requires this ([W3C](https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts.html)).
- _Weak:_ off by default (ClickUp); no cheat sheet; collisions with browser shortcuts.

**Acceptance check:** `?` opens a categorised cheat sheet; `j`/`k`/`x`/Enter work in every list; single-key shortcuts can be turned off per user.

#### 1.5 Favourites, pins and bookmarks — TABLE STAKES

**Who has it**

- **Salesforce.** The favourites star _"is always there"_. Up to 200 favourites, private to each user, reorderable and renameable ([Salesforce Admins](https://admin.salesforce.com/blog/2018/pro-tip-fast-track-navigation-lightning-experience-favorites%E2%AD%90%EF%B8%8F)).
- **HubSpot.** _"You can save up to ten secondary menu items in the Bookmarks menu"_, reorderable ([KB](https://knowledge.hubspot.com/help-and-resources/a-guide-to-hubspots-navigation)).
- **Attio.** Notes, note and email templates, list views, object views, records and Ask Attio chats can be favourited, in folders.
  - _"Favorites and folders are personal to you"_.
  - Clicking a favourited template creates a new note from it ([help](https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace); [changelog](https://attio.com/changelog/2024/pin-favorites-in-your-sidebar)).
- **Linear.** Issues, projects, views, documents, initiatives, cycles, labels, teams, customers, dashboards and releases can be favourited. `O` then `F` opens favourites; `Alt+F` toggles one ([docs](https://linear.app/docs/favorites)).
- **Twenty.** _"Pinned favorites for views, records, or searches"_; sidebar folders; drag to reorder ([docs](https://docs.twenty.com/user-guide/layout/overview)).
- **ClickUp.** Favourites are personal ([help](https://help.clickup.com/hc/en-us/articles/6308862167575-Favorites)).
- **Pipedrive.** Star a filter to favourite it ([KB](https://support.pipedrive.com/en/article/how-can-i-favorite-filters)).
- **Close.** Smart Views pin to the sidebar and can be reordered or unpinned ([help](https://help.close.com/feature-guide/lead-filtering-and-smart-views/creating-smart-views)).
- **monday.** Favourites section ([help](https://support.monday.com/hc/en-us/articles/360009142179-The-favorites-section)).

**Good vs weak**

- _Good:_ any object, including saved views and searches; folders; drag ordering; keyboard toggle; personal by default.
- _Weak:_ bookmarking menu items only (HubSpot); very low caps.

**Acceptance check:** Star a record, a saved view and a search; each appears in a reorderable sidebar section, in folders.

#### 1.6 Quick-create from anywhere — COMMON

**Who has it**

- **HubSpot.** _"+ Quick Create"_ button for contact, company, deal, ticket or task ([KB](https://knowledge.hubspot.com/help-and-resources/a-guide-to-hubspots-navigation)).
- **Pipedrive.** `.` or `+`, plus a letter per object ([KB](https://support.pipedrive.com/en/article/quick-actions-in-pipedrive)).
- **Linear.** `C`; `Option/Alt + C` creates from a template ([docs](https://linear.app/docs/creating-issues)).
- **Attio.** `t` creates a task _"anywhere in the platform"_. Natural-language due dates work, such as _"follow up next week"_ ([help](https://attio.com/help/reference/productivity-collaborating/tasks)).
- **Close.** ⌘⇧L creates a lead ([help](https://help.close.com/docs/keyboard-shortcuts)).
- **Salesforce.** Navigation-item menus _"kick it off with a click"_ ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/navigate-around)).
- **Notion.** Cmd/Ctrl+N ([help](https://www.notion.com/help/keyboard-shortcuts)).

**Good vs weak**

- _Good:_ a single key; links to the current record automatically; a template picker; "create another" that keeps the form open; a duplicate warning on create.
- _Weak:_ creation only from list pages; a full-page form.

**Acceptance check:** On a company page, one key opens "new task" already linked to that company. Enter saves; Cmd+Enter saves and starts another.

#### 1.7 Hover cards and quick view — COMMON

**Who has it**

- **Salesforce.** _"quick view hovers"_ show _"a slew of details and related information without navigating away"_. "Related List Quick Links" let you act from the hover ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/work-with-your-data)).
- **Pipedrive.** Hovering a search result _"shows another window with more information"_; list views have hover cards ([KB](https://support.pipedrive.com/en/article/search-finding-what-you-need)).

**Acceptance check:** Hovering any record link shows its key fields and next activity, with no navigation.

---

### 2. Views

#### 2.1 Table/list view: column chooser, sort, inline edit — TABLE STAKES

**Who has it**

- **HubSpot.**
  - Columns: _"sort, freeze, add, remove, or reorder"_.
  - Association columns can be added (e.g. _"Contact -> Deals"_), and a property can be created inline ([KB](https://knowledge.hubspot.com/records/customize-index-page-columns)).
  - Cells: select a range and copy with Ctrl/Cmd+C ([KB](https://knowledge.hubspot.com/records/bulk-edit-records)).
- **Salesforce.**
  - Inline edit: _"Simply click an editable field, type data right into the field, and press Return… breeze around a list using the tab key and arrow keys… Click Save once"_. Edited fields are highlighted yellow until saved.
  - Inline and mass inline edit work only if _"the list view… is limited to a single record type"_.
  - Lists render on a single page, with wrap/clip text per column ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/work-with-list-views)).
- **Pipedrive.** A gear icon chooses columns; a hover pencil edits inline (_"Not all fields can be edited directly"_); a manual "Refresh" button reloads the list ([KB](https://support.pipedrive.com/en/article/list-view)). Shift-click sorts by several columns ([KB](https://support.pipedrive.com/en/article/sorting-by-multiple-columns-in-list-view)).
- **Attio.**
  - Columns can be reordered, hidden and resized, and relabelled per view (_"view-specific only, doesn't rename underlying attribute"_).
  - Enter saves an edit.
  - Copy and paste work across Attio and external spreadsheets ([help](https://attio.com/help/reference/managing-your-data/views/create-and-manage-table-views)).
- **Notion.** Freeze columns ([help](https://www.notion.com/help/views-filters-and-sorts)).
- **Twenty.** Field visibility per view ([docs](https://docs.twenty.com/user-guide/layout/overview)).

**Good vs weak**

- _Good:_ keyboard cell navigation; multi-column sort; frozen columns; per-view labels; paste a range from Excel; a visible save state, or autosave plus undo; association columns.
- _Weak:_ fields that cannot be edited inline; paginated lists; a manual refresh button.

**Acceptance check:** In the accounts list, Tab and arrow keys move between cells; Enter edits; a pasted 5×3 block from Excel updates 15 cells with one undo.

#### 2.2 Board/kanban — TABLE STAKES

**Who has it**

- **HubSpot.**
  - Edit properties inline on cards, create activities from a card, and Cmd/Ctrl-click to multi-select ([KB](https://knowledge.hubspot.com/records/manage-records-in-board-view)).
  - Lanes come from any enumeration property or pipeline stage, with _"up to 3 metrics"_ per lane and lane colours ([KB](https://knowledge.hubspot.com/object-settings/customize-the-redesigned-board-view)).
- **Salesforce.** A Kanban toggle in list views ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/work-with-list-views)).
- **Attio.** Kanban needs a status attribute. Shift-select a range of cards and drag them together ([help](https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views)).
- **Freshsales.** Card views by pipeline, forecast or _"Group by"_, with _"the number of deals and the sum total of the deals' value in each stage"_ ([KB](https://crmsupport.freshworks.com/support/solutions/articles/50000002388-deals-table-and-card-views)).
- **Linear.** Boards with sub-grouped swimlanes ([docs](https://linear.app/docs/display-options)).
- **Also:** Pipedrive pipeline view; Folk pipeline views ([help](https://help.folk.app/en/articles/4998224-create-views)); monday, Notion, ClickUp and Asana boards.

**Good vs weak**

- _Good:_ lanes from any single-select field; per-lane count and sum; multi-card drag; a prompt for required fields when a card changes stage (Pipedrive, see §6.5).
- _Weak:_ lanes fixed to stage; no totals; no keyboard alternative to dragging (see §7.5, WCAG 2.5.7).

**Acceptance check:** Group tickets by priority; each column shows count and total MRR; moving a card into "Closed" asks for any required "resolution" field.

#### 2.3 Calendar view — COMMON

**Who has it**

- **HubSpot.** A calendar view type in day, week or month, laid out by any date property ([KB](https://knowledge.hubspot.com/records/manage-index-page-types-and-tabs)).
- **Twenty.** _"Records plotted by a date field"_ ([docs](https://docs.twenty.com/user-guide/layout/overview)).
- **Also:** Airtable ([help](https://support.airtable.com/docs/getting-started-with-airtable-views)), Notion ([help](https://www.notion.com/help/views-filters-and-sorts)), monday ([help](https://support.monday.com/hc/en-us/articles/360001267945-The-board-views)), ClickUp ([help](https://help.clickup.com/hc/en-us/articles/6329880717719-Intro-to-views)), Asana ([features](https://asana.com/features/project-management/project-views)), and Pipedrive's activity calendar.

**Good behaviours:** drag to reschedule; choose which date field drives the layout.

#### 2.4 Timeline/Gantt — COMMON in work management; DIFFERENTIATOR in CRMs

**Who has it**

- **HubSpot.** A Gantt view where you _"drag an end point to change the start or end date"_ ([KB](https://knowledge.hubspot.com/records/manage-index-page-types-and-tabs)).
- **Pipedrive.** Projects have a Gantt view with dependencies ([KB](https://support.pipedrive.com/en/article/projects-tasks-and-subtasks)).
- **ClickUp.** Gantt with milestones and PDF export ([help](https://help.clickup.com/hc/en-us/articles/6329880717719-Intro-to-views)).
- **Also:** Airtable timeline and Gantt; Notion timeline; Linear project timeline ([docs](https://linear.app/docs/display-options)); Asana timeline.

#### 2.5 Gallery, map and chart views — DIFFERENTIATOR (charts on lists are COMMON)

**Who has it**

- **Salesforce.** List-view charts (_"vertical bar, horizontal bar, and donut"_) using sum, count or average ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/work-with-list-views)).
- **HubSpot.** A "Report view" type on index pages ([KB](https://knowledge.hubspot.com/records/manage-index-page-types-and-tabs)).
- **ClickUp.** Map view using a Location field, plus Mind Map, Dashboard and Whiteboard views ([help](https://help.clickup.com/hc/en-us/articles/6329880717719-Intro-to-views)).
- **Notion.** Gallery, Chart, Map and Form ([help](https://www.notion.com/help/views-filters-and-sorts)).
- **Airtable.** Gallery and form ([help](https://support.airtable.com/docs/getting-started-with-airtable-views)).

#### 2.6 Saved views with scoped visibility — TABLE STAKES

**Who has it**

- **HubSpot.**
  - Visibility is Private, Team, Everyone, or Custom (_"specific teams or users"_).
  - Up to 5 views stay pinned as tabs; opening a sixth closes one.
  - Dragging a tab to the far left makes it the default; views can be cloned ([KB](https://knowledge.hubspot.com/records/create-and-manage-saved-views)).
  - Only _"Super Admins or the user who created the view"_ can save quick filters to it ([KB](https://knowledge.hubspot.com/records/customize-quick-filters)).
- **Salesforce.** List views can be created, renamed, cloned and shared. _"A pinned list is the default list view for that object"_; otherwise the object opens on "Recently Viewed" ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/work-with-list-views)).
- **Close.** Smart Views are shared or _"Keep Private - just for me"_, and can be reordered or unpinned ([help](https://help.close.com/feature-guide/lead-filtering-and-smart-views/creating-smart-views)).
- **Linear.**
  - Personal display settings persist. _"Set as default"_ pushes a layout _"to every other user"_.
  - Views can be scoped to the workspace or a team; Opt/Alt+V saves the current filters as a view ([docs](https://linear.app/docs/display-options), [docs](https://linear.app/docs/custom-views)).
- **Notion.** Filters and sorts are personal unless you choose _"Save for everyone"_ ([help](https://www.notion.com/help/views-filters-and-sorts)).
- **Zendesk.**
  - Views are personal or shared, can be grouped in folders, shared by link and exported to CSV. _"Agents can only edit views for their own personal use"_ ([help](https://support.zendesk.com/hc/en-us/articles/4408832792986-Managing-your-views)).
  - The old sidebar cap of 12 shared and 8 personal views drew complaints ([community](https://support.zendesk.com/hc/en-us/community/posts/4409217537050-Views-limitation)). Zendesk's views refresh raised it ([announcement](https://support.zendesk.com/hc/en-us/articles/6059161161498-Announcing-improvements-to-the-views-experience-in-Support)); third-party summaries say 100 shared and 10 personal _(not re-verified: page requires sign-in)_.
- **Twenty.** Views are _"workspace-wide or… private"_ ([docs](https://docs.twenty.com/user-guide/layout/overview)).
- **Attio — the counter-example.** Saving filter and sort settings applies them _"for all members with access to the view"_; unsaved changes revert. There is no personal variant of a shared view ([help](https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views)).

**Good vs weak**

- _Good:_
  - Three scopes (me, team, everyone) with clear ownership and edit rights.
  - A distinction between "save as new" and "update view".
  - An unsaved-changes indicator with revert.
  - Separate defaults per user and per team.
  - Shareable view links.
  - A view captures columns, sort, grouping and density.
- _Weak:_ global-only or private-only views; caps on the sidebar.

**Acceptance check:** Create a filtered view, share it with "Support team", change a column without saving (the view shows "modified"), then "save as new" privately.

#### 2.7 Filter builder (AND/OR, relative dates, known/unknown) — TABLE STAKES

**Who has it**

- **Notion.** _"Advanced filters: Combine multiple conditions using AND/OR logic, nestable up to three layers deep"_ ([help](https://www.notion.com/help/views-filters-and-sorts)).
- **Pipedrive.** Quick filters, plus advanced filters _"using ALL and ANY filter groups"_ ([KB](https://support.pipedrive.com/en/article/filtering)).
- **HubSpot.**
  - _"You can add up to ten custom quick filters"_ ([KB](https://knowledge.hubspot.com/records/customize-quick-filters)).
  - Operators include _is any of / is none of / is known / is unknown_ ([task queues KB](https://knowledge.hubspot.com/tasks/use-task-queues)).
- **Linear.** `@` filters inside search ([docs](https://linear.app/docs/search)).

**Good vs weak**

- _Good:_ relative dates ("in the last 7 days", "next week"); empty/not empty; filters on associated objects; filter state encoded in the URL; save as view.
- _Weak:_ AND-only filters; absolute dates only.

**Acceptance check:** "Accounts where (plan = Pro OR MRR > 500) AND renewal date within next 30 days AND owner is unknown" can be built, saved and shared by URL.

#### 2.8 Grouping and sub-grouping — COMMON

**Who has it**

- **Linear.** Group by _"status, assignee, project, priority, cycle, label, parent issue, team, customer, release, and SLA status"_. _"Sub-grouping is available in lists and boards (as rows)"_ ([docs](https://linear.app/docs/display-options)).
- **Notion.** Group plus _"Sub-group"_, and _"Hide empty groups"_ ([help](https://www.notion.com/help/views-filters-and-sorts)).
- **Freshsales.** "Group by" ([KB](https://crmsupport.freshworks.com/support/solutions/articles/50000002388-deals-table-and-card-views)).
- **Attio.** Tasks grouped by due date, assignee or creator ([help](https://attio.com/help/reference/productivity-collaborating/tasks)).

**Good behaviours:** collapsible groups showing count and sum; groups on lists as well as boards.

#### 2.9 Bulk select, select-all-matching, bulk edit — TABLE STAKES

**Who has it**

- **HubSpot** ([KB](https://knowledge.hubspot.com/records/bulk-edit-records)):
  - A _"Select all [number] [records]"_ link selects across pages.
  - Actions: Assign, Edit, Delete, Create tasks, Add to segment.
  - Multi-select fields offer _Append / Replace / Remove_.
  - Delete _"is a restorable delete… enter the number of records"_ and needs a Bulk delete permission.
  - Caveats: _"Create tasks… will only create tasks for records selected on the current page"_; segment adds are _"up to 100 records at a time"_.
- **Salesforce.** Mass inline edit of _"up to 200 records without leaving a list view"_ ([Winter '18 overview](https://admin.salesforce.com/blog/2017/winter-18-release-overview-admins)), single record type only ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/work-with-list-views)).
- **Pipedrive** ([KB](https://support.pipedrive.com/en/article/bulk-editing-and-filtering)):
  - A per-object table lists which fields can be bulk-edited.
  - _"Changes cannot be undone after confirmation."_
  - If the edit will trigger automations, admins can _"choose to run or skip automations"_.
- **Linear.** `X` selects; Shift+↑/↓ extends the range; _"Use filters to refine the issue list first, then use Cmd/Ctrl A"_; then Cmd+K or right-click to act ([docs](https://linear.app/docs/select-issues)).
- **Copper.** Bulk edit any detail field; bulk merge ([KB](https://support.copper.com/en/articles/8823245-bulk-edit-records)).
- **Attio.** Multi-card drag ([help](https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views)); cmd/shift-click and cmd+a on tasks ([help](https://attio.com/help/reference/productivity-collaborating/tasks)).

**Good vs weak**

- _Good:_
  - Select-all across pages, with the count shown.
  - Per-value operations on multi-value fields.
  - A preview of how many records will change.
  - Type-the-count confirmation for destructive actions.
  - Permission gates.
  - A warning about automation side effects.
  - A background job with progress for large sets.
  - Rollback afterwards (see §7.10).
- _Weak:_ page-only selection; automations fired silently; no undo.

**Acceptance check:** Filter 3,400 accounts, "select all 3,400", add a tag (append, not replace), see the progress, then undo it within the toast window or from history.

#### 2.10 Aggregates: summary row, column calculations, card metrics — COMMON

**Who has it**

- **Attio.** _"+ Add calculation at the very bottom of a column"_: count, sum, empty, filled ([help](https://attio.com/help/reference/managing-your-data/views/create-and-manage-table-views)).
- **Close.** Smart View column calculations (_"totals, averages, percentages"_) are _"saved with the Smart View, so anyone you share it with will see the same results"_ ([help](https://help.close.com/feature-guide/lead-filtering-and-smart-views/calculations-in-smart-views)).
- **HubSpot.** Board metrics, _"up to 3"_ ([KB](https://knowledge.hubspot.com/object-settings/customize-the-redesigned-board-view)).
- **Freshsales.** Stage totals ([KB](https://crmsupport.freshworks.com/support/solutions/articles/50000002388-deals-table-and-card-views)).
- **Salesforce.** List-view charts ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/work-with-list-views)).

**Acceptance check:** Any number or currency column offers sum, average, min and max in a footer that respects the current filter.

#### 2.11 Conditional formatting — COMMON overall; DIFFERENTIATOR among CRMs

**Who has it**

- **Airtable** ([help](https://support.airtable.com/docs/record-coloring-in-airtable)):
  - Colour _"by Select field or by Conditions"_, with AND/OR condition groups.
  - _"A record can only have one color"_; the first matching condition, from the top, wins.
  - Set per view; _"not a feature available on the Free plan"_.
- **monday** ([help](https://support.monday.com/hc/en-us/articles/360015468399-Conditional-Coloring)):
  - Applies to a cell or a whole row.
  - _"fixed set of colors. Custom hex colors are not supported"_.
  - Standard plan and above.
- **Notion.** _"Add another to create additional color conditions"_ per view ([help](https://www.notion.com/help/database-properties)).
- **HubSpot.** Lane colours only; the KB documents no conditional formatting ([KB](https://knowledge.hubspot.com/object-settings/customize-the-redesigned-board-view)).

**Good behaviours:** rules saved per view; explicit priority order; a colour legend; colour is never the only signal (pair it with an icon or text, for WCAG 1.4.1).

#### 2.12 Record preview, peek and split view — TABLE STAKES (preview); COMMON (keyboard peek or split with next/previous)

**Who has it**

- **HubSpot.**
  - Preview from the table (hover, then Preview) or the board (click a card).
  - Edit properties, which _"will be autosaved"_; add activities; see pinned, recent and upcoming activities and associations.
  - Admins can customise the preview _"for your entire account or for specific teams"_ ([KB](https://knowledge.hubspot.com/records/preview-a-record)).
- **Linear Peek.** _"Tap `Space` to toggle peek… `Space` and hold to turn on peek only while `Space` is depressed… use ↑ and ↓ to move through adjacent issues"_ ([docs](https://linear.app/docs/peek)).
- **Attio.** An "Open preview" icon on the record name ([help](https://attio.com/help/reference/managing-your-data/views/create-and-manage-table-views)).
- **Pipedrive.** The activity contextual view shows _"the activity's details on the left and your schedule on the right"_, with on-screen arrows to step between activities ([KB](https://support.pipedrive.com/en/article/activity-contextual-view)).
- **Salesforce.** Split view, _"list on the left, details on the right"_, for task lists ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/work-with-list-views)).
- **Close.** `j`/`k` _"Next/Previous lead (if from search)"_ ([help](https://help.close.com/docs/keyboard-shortcuts)).

**Good vs weak**

- _Good:_ editable in place; opened and closed from the keyboard; next/previous without closing; list scroll and selection preserved; a deep link to the previewed record.
- _Weak:_ a read-only modal; returning to the list loses your position.

**Acceptance check:** In the ticket list, Space opens a preview; ↓ moves to the next ticket; edits save in place; Esc returns to the same scroll position.

#### 2.13 Spreadsheet-grade grid (range selection, paste from Excel) — DIFFERENTIATOR

**Who has it:** HubSpot cell selection ([KB](https://knowledge.hubspot.com/records/bulk-edit-records)); Attio copy/paste _"across Attio and external spreadsheet applications"_ ([help](https://attio.com/help/reference/managing-your-data/views/create-and-manage-table-views)); Airtable's native grid.

---

### 3. Collaboration

#### 3.1 @mentions — TABLE STAKES

**Who has it**

- **HubSpot** ([KB](https://knowledge.hubspot.com/records/mention-a-user-on-a-record)):
  - A mentioned user _"is given shared access to edit or comment on the note"_.
  - _"Notifications are only sent the first time you mention someone on an activity."_
  - Full-width names (e.g. Japanese) need the user's email instead.
- **Pipedrive** ([KB](https://support.pipedrive.com/en/article/mentions-and-comments-beta)):
  - Mentions work in notes on leads, deals, people, organisations and projects.
  - The dropdown _"shows a maximum of 8 users at a time"_.
  - Notifications only reach users with _"the permission and visibility to view the item"_.
- **Attio.** Mentions in notes, tasks and comments. If someone is mentioned in a list comment _"and they do not have access to the list, they will not receive a notification"_ ([help](https://attio.com/help/reference/productivity-collaborating/comments-and-mentions)).
- **Close.** Mentions of _"users and groups"_, with an email linking _"directly to the activity"_ (16 Apr 2024, [changelog](https://close.com/changelog/mentions-and-comments)).
- **monday.** Mention a person or a team. `@everyone` notifies only item subscribers; accounts over 5k seats cannot use it ([help](https://support.monday.com/hc/en-us/articles/115005900249-The-Updates-Section)).
- **Airtable.** Mentioned collaborators _"are automatically notified of additional comments you make on that record"_ ([help](https://support.airtable.com/articles/1999477400-commenting-in-airtable)).
- **Linear.** Being mentioned auto-subscribes you, to the thread when the mention is in a comment ([docs](https://linear.app/docs/notifications)).
- **Zoho.** _"tag another sales rep or a manager in your notes"_ ([features](https://www.zoho.com/crm/team-collaboration.html)).
- **Folk.** Mention teammates in collaborative notes ([help](https://help.folk.app/en/articles/5007332-adding-notes)).

**Good vs weak**

- _Good:_
  - Permission-aware, with a warning _at mention time_ if the person cannot see the record. Attio and Pipedrive both fail silently.
  - Teams and groups can be mentioned.
  - A mention subscribes the person to the thread.
  - The notification deep-links to the exact comment.
  - `@record` mentions become links.
- _Weak:_ silent non-delivery; notifying only on the first mention.

**Acceptance check:** Mentioning someone who cannot see the account shows an inline warning before posting.

#### 3.2 Comments: threads, resolve, reactions, permalinks — COMMON (TABLE STAKES in work-management tools)

**Who has it**

- **Attio** ([help](https://attio.com/help/reference/productivity-collaborating/comments-and-mentions); [changelog](https://attio.com/changelog/2023/new-comments-system)):
  - Comments on records and on list entries are kept in separate feeds, because _"lists may have restricted access"_.
  - Threads, and emoji reactions that double as upvotes.
  - _"Copy link to comment"_.
  - Resolve; resolved comments are hidden by default and shown via "Show resolved comments".
  - "Only my threads" filter; a view-level feed of all comments.
- **Linear** ([docs](https://linear.app/docs/comment-on-issues)):
  - Threaded replies; reactions _"on the issue description itself, or on individual comments or threads"_.
  - Resolve a thread, optionally from a specific reply _"to expose that reply"_.
  - AI summaries of resolved threads (Business/Enterprise).
  - _"new sub-issue from comment"_.
- **Notion.** Discussions and inline comments; resolve and re-open; filter by person or status; Default or Minimal display ([help](https://www.notion.com/help/comments-mentions-and-reminders)).
- **HubSpot.** Comments on activities, including calls, tasks, notes, meetings, emails, SMS and WhatsApp ([KB](https://knowledge.hubspot.com/records/comment-on-an-activity)). Notification emails include _"any previous comments in the same thread"_ ([KB](https://knowledge.hubspot.com/campaigns/comment-notification-emails)).
- **Pipedrive.** Comments under notes (not on leads); notes can be pinned. _"Regular users can only update their own comments"_ ([KB](https://support.pipedrive.com/en/article/mentions-and-comments-beta)).
- **monday Updates.** Reactions, replies, GIFs, files and checklists. A _"Seen"_ eye icon shows who viewed an update ([help](https://support.monday.com/hc/en-us/articles/115005900249-The-Updates-Section)).
- **Close.** Comments on _"leads, calls, opportunities"_ ([changelog](https://close.com/changelog/mentions-and-comments)).

**Good vs weak**

- _Good:_ threads, resolve and reopen, permalinks, reactions, edit history; visibility inherited from the object; turn a comment into a task.
- _Weak:_ flat comments that cannot be resolved or linked.

**Acceptance check:** A comment on a ticket can be replied to in a thread, resolved, reopened, linked to, and converted into a task.

#### 3.3 Follow, watch, subscribe — TABLE STAKES

**Who has it**

- **HubSpot.** Records can be followed. _"By default, every user is set to automatically follow records of which they are the owner."_ Follow notifications are configured per channel ([KB](https://knowledge.hubspot.com/records/follow-a-record)).
- **Pipedrive.** Followers on deals, products, people and organisations. Following _a user_ gives visibility and notifications for all their items, _"regardless of visibility group settings"_, behind a permission ([KB](https://support.pipedrive.com/en/article/followers)).
- **Linear.**
  - Auto-subscribe when you _"create… are assigned… are @mentioned"_; Shift+S to subscribe ([docs](https://linear.app/docs/notifications)).
  - **View subscriptions** notify when an issue is added to a view or completed, optionally into a Slack channel. _"you won't receive notifications… for actions you take yourself"_ ([docs](https://linear.app/docs/custom-views)).
- **Zendesk.** CCs for external people and followers for internal people ([help](https://support.zendesk.com/hc/en-us/articles/4408822451482-Using-CCs-and-followers)).
- **monday.** Subscribers are pinged only for items they are assigned to, mentioned on, or following ([help](https://support.monday.com/hc/en-us/articles/360001292545-Notifications-explained)).
- **ClickUp.** Changes to followed tasks land in the Inbox's "Other" tab ([help](https://help.clickup.com/hc/en-us/articles/33947959867543-What-is-the-Inbox)).
- **Asana.** Collaborators _"get notified when it's updated"_ ([features](https://asana.com/features/project-management/tasks)).

**Good vs weak**

- _Good:_ auto-follow rules for owner, creator, assignee and mentioned users; following a saved view or query (Linear); the person who made a change is never notified about it.
- _Weak:_ manual follow only; following generates noise.

**Acceptance check:** The account owner auto-follows; anyone can follow a saved view "Enterprise renewals < 30 days" and get one notification per new entry.

#### 3.4 In-app notification inbox — TABLE STAKES (inbox); COMMON (snooze)

**Who has it**

- **Linear** ([inbox](https://linear.app/docs/inbox), [notifications](https://linear.app/docs/notifications)):
  - A Priority tab.
  - `H` snoozes, with options such as _"Next quarter"_ or _"For X months / weeks / days"_.
  - `U` toggles read/unread; Backspace deletes; Shift+Backspace deletes all read; Cmd+F searches notifications.
  - _"Linear retains up to 2,000 open notifications"_, then auto-archives.
- **Asana.** Activity, Bookmarks and Archive tabs. You can _"Create follow-up tasks for any notification with a single click"_, mark unread, bookmark or archive, and filter ([features](https://asana.com/features/project-management/inbox)).
- **Notion.**
  - Updates are _"organized by page and by comment thread"_.
  - _"Lock inbox pane open"_; _"Archive read"_ and _"Archive all"_ ([help](https://www.notion.com/help/updates-and-notifications)).
  - Filter by notification type ([help](https://www.notion.com/help/notification-settings)).
- **ClickUp** ([help](https://help.clickup.com/hc/en-us/articles/33947959867543-What-is-the-Inbox)):
  - Primary, Other, Later and Cleared tabs.
  - Important groups stay in Primary.
  - _"retains 3 months of uncleared notifications and 1 month of cleared notifications"_.
- **Attio.** The inbox has Notifications and Requests; email-access requests can be approved inline with Accept/Deny ([help](https://attio.com/help/reference/account-settings/notifications)).
- **Pipedrive.** A lightbulb panel with filters (unread, email tracking, following, assigned to you, comments, mentions…) and like/dislike to train its suggestion cards ([KB](https://support.pipedrive.com/en/article/notifications)).
- **HubSpot.** A bell with a badge ([KB](https://knowledge.hubspot.com/user-management/how-to-set-up-user-notifications-in-hubspot)), plus an AI summary of the last 24 hours, _"up to three summaries per 24-hour period"_ ([KB](https://knowledge.hubspot.com/account-management/summarize-notifications)).
- **Folk.** A Notifications Center _"with 'Inbox Zero' in mind"_ ([help](https://help.folk.app/en/articles/8249797-notifications-center)).
- **Airtable.** Unread and Read tabs; few event types (_"shares a base… @mentions… assigns you"_). Other alerts need automations ([help](https://support.airtable.com/articles/8089803354-managing-airtable-notifications)).

**Good vs weak**

- _Good:_
  - Act inline: reply, approve, assign.
  - Group by object or thread.
  - Read, unread, archive and snooze.
  - Keyboard triage.
  - A retention policy, counts and filters.
- _Weak:_ a bell list with no archive or snooze; nothing can be done inline.

**Acceptance check:** From the inbox, reply to a mention, approve an access request, and snooze a renewal alert until Monday 09:00, all without leaving the inbox.

#### 3.5 Notification delivery: channels, granularity, batching, digests, do-not-disturb

**Ratings:** settings matrix TABLE STAKES; smart batching and suppression COMMON; DND COMMON.

**Who has it**

- **HubSpot** ([KB](https://knowledge.hubspot.com/user-management/how-to-set-up-user-notifications-in-hubspot)):
  - Channels: pop-up, browser, bell, email, mobile, Slack and Teams, across 30+ categories.
  - Enterprise _"notification profiles"_ set defaults, but _"preferences set by individual users will take precedence"_.
  - _"Users won't receive more than 1,000 email notifications per day."_
  - Unsubscribing from an email turns off that notification type.
  - A daily task digest each weekday ([KB](https://knowledge.hubspot.com/tasks/task-reminders-and-daily-digest)).
- **Linear** ([docs](https://linear.app/docs/notifications)):
  - Channels: Desktop, Mobile, Email, Slack.
  - Email digests _"send with time delays based on urgency, and are only sent if you haven't already read the Linear inbox notification"_.
  - Categories are grouped, so _"You cannot select only status changes"_.
  - No new browser-push subscriptions; the desktop app is used instead.
- **Intercom** ([help](https://www.intercom.com/help/en/articles/187-how-teammates-get-notifications)):
  - _"We wait 10 seconds before sending a push notification… A single push notification is sent with all user messages."_
  - _"We wait 3 minutes before sending an email notification"_, and none is sent _"if they have seen the user's reply"_.
  - Mentions are immediate; no push for bot messages.
- **Notion.**
  - Desktop push _"10 seconds after someone @-mentions you"_; mobile push if the mention is unread after 5 minutes ([help](https://www.notion.com/help/updates-and-notifications)).
  - Email only if you are not active, unless "Always send email notifications" is on ([help](https://www.notion.com/help/notification-settings)).
- **Pipedrive.** A daily summary email at a time you choose, and _"Pause alerts for today"_ ([KB](https://support.pipedrive.com/en/article/notifications)).
- **Attio.** The task digest is _"sent only on days when you have tasks that are due"_ ([help](https://attio.com/help/reference/account-settings/notifications)).
- **Asana.** _"Automatically pause notifications during certain hours and days of the week"_ ([features](https://asana.com/features/project-management/inbox)).
- **monday.** _"By default, all email notifications are turned on"_ ([help](https://support.monday.com/hc/en-us/articles/360001292545-Notifications-explained)).

**Good vs weak**

- _Good:_ suppress anything already seen in-app; batching windows; urgency-based digests; DND schedules; a type × channel matrix; admin defaults that users can override; per-type unsubscribe.
- _Weak:_ every channel on by default; one email per event.

**Acceptance check:** Three customer replies within a minute produce one push and, if you read them in-app, no email.

#### 3.6 Activity timeline — TABLE STAKES

**Who has it**

- **HubSpot** ([filters](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline), [pin](https://knowledge.hubspot.com/records/pin-an-activity-on-a-record)):
  - Filter by type (notes, emails, calls, tasks, meetings, LinkedIn, SMS, WhatsApp), date range, user and team.
  - Search within the timeline; collapse or expand all.
  - Filter choices _"apply to all records for that object and are unique to each user"_.
  - One pinned activity per record, visible to everyone.
  - Free accounts created after 4 Feb 2025 see only 30 days of history.
- **Salesforce.** Upcoming & Overdue, then past months, with filters ([Salesforce Admins](https://admin.salesforce.com/tailor-activity-timeline-lightning-experience-users)) _(via search; not re-verified)_.
- **Pipedrive.** A History section mixes notes, activities, emails and files ([KB](https://support.pipedrive.com/en/article/how-can-i-upload-a-file-to-a-deal-or-a-contact)).
- **Copper.** A Feed home page with filters ([KB](https://support.copper.com/en/articles/10683406-using-the-copper-feed)).

**Good vs weak**

- _Good:_ one chronological feed that includes system changes; filters persisted per user; search; pin; roll-up from associated records (a company shows its contacts' emails); a permalink per entry.
- _Weak:_ separate tabs per activity type and no search.

**Acceptance check:** An account timeline shows emails, tickets, notes and plan changes from all its contacts. A filter set to "billing only" persists for me.

#### 3.7 Field and property history (who changed what, when, via what) — TABLE STAKES in CRMs

**Who has it**

- **HubSpot.** Per-property history: _"Changed to, Date, and Source"_ ([KB](https://knowledge.hubspot.com/records/view-record-property-history)).
- **Airtable.** Revision history retention depends on plan: _"Free… past 2 weeks… Team… 1 year… Business… 2 years… Enterprise Scale… 3 years"_ ([help](https://support.airtable.com/articles/3516802427-record-level-revision-history-in-airtable)).
- **monday.** An Activity Log with undo for 7 days ([help](https://support.monday.com/hc/en-us/articles/360011810600-How-to-undo-something)).

**Good behaviours:** attribute each change to a user, workflow, import or API; restore a single value; a stated retention period.

#### 3.8 Shared inbox — TABLE STAKES (help desks); COMMON (CRMs)

**Who has it**

- **HubSpot help desk.** Chat, email, forms, calling, WhatsApp and Messenger in one workspace. Tickets are unassigned by default; routing rules, skills, and _"Assign to available users only"_ ([overview](https://knowledge.hubspot.com/help-desk/overview-of-the-help-desk-workspace), [routing](https://knowledge.hubspot.com/help-desk/route-tickets-in-help-desk)).
- **Front.** Shared inbox with collision detection and shared drafts ([help](https://help.front.com/en/articles/2403)).
- **Intercom.** Inbox, assignment, snooze and macros ([help](https://www.intercom.com/help/en/articles/6560715-workload-management-explained)).
- **Zendesk.** Views, CCs and followers ([help](https://support.zendesk.com/hc/en-us/articles/4408822451482-Using-CCs-and-followers)).
- **Close Inbox** ([help](https://help.close.com/feature-guide/inbox)):
  - Inbox, Done and Future; _"should be considered a to-do list"_.
  - Marking an email Done archives it in Gmail/Office 365.
  - Mail from unknown senders appears as "Potential Contacts", which _"expire after 30 days"_.
- **Twenty.** Forward a shared inbox from Google Workspace or Microsoft 365 ([docs](https://docs.twenty.com/user-guide/calendar-emails/how-tos/forward-a-shared-inbox-from-google-workspace)).

**Good behaviours:** an owner and a status (open, snoozed, closed) per conversation; internal notes; "done" syncs back to the mailbox; a triage lane for unknown senders.

#### 3.9 Assignment, routing and hand-off — TABLE STAKES (help desks); COMMON (CRMs)

**Who has it**

- **Intercom.**
  - Balanced assignment goes to _"the active teammate with the fewest open conversations"_ and respects limits. Round robin is sequential and _"doesn't account for teammates' assignment limit"_. Manual assignment is also available ([help](https://www.intercom.com/help/en/articles/6560715-workload-management-explained), [round robin](https://www.intercom.com/help/en/articles/6512504-assign-conversations-evenly-using-round-robin)).
  - Status is Active or Away. Away _"stops sending them new conversations, always"_; _"Reassign replies"_ is for the end of a shift. A per-team override can still assign to away teammates ([help](https://www.intercom.com/help/en/articles/6522874-manage-teammate-inbox-status)).
- **Front.** Load balancing assigns to the person with the fewest open conversations, up to a per-teammate limit. _"The maximum limit for each teammate per workspace is 100"_ (also the default). Rules pause when everyone is at their limit and resume when someone has capacity ([help](https://help.front.com/t/x102m8)).
- **HubSpot.** Skills-based routing ([KB](https://knowledge.hubspot.com/help-desk/route-tickets-in-help-desk)); round-robin meetings with rotations and _"Prioritize contact owner"_ ([KB](https://knowledge.hubspot.com/meetings-tool/create-and-edit-scheduling-pages)).
- **Close.** Round-robin lead assignment via workflows ([help](https://help.close.com/best-practices/simplify-your-workflows-with-automated-senders/new-assign-leads-to-users-via-round-robin)).

**Good behaviours:** capacity caps; away and out-of-office handling; reassigning on shift end; skills; an audit trail of hand-offs; a hand-off note.

#### 3.10 Presence and collision detection — TABLE STAKES (help desks); DIFFERENTIATOR (CRMs and admin tools)

**Who has it**

- **Zendesk.** Play mode _"automatically assigns tickets that no other agent views to prevent agent collision"_. Presence depends on cookies; collisions can still happen after disconnects ([help](https://support.zendesk.com/hc/en-us/articles/4408825035674-Troubleshooting-agent-collision-in-Play-mode)).
- **Front.** _"you will see indicators that they are replying. Draft content is automatically shared and updated immediately"_ ([help](https://help.front.com/en/articles/2403)).
- **Help Scout.** _"A yellow indicator lets you know another user already has a conversation open. It will turn red when the user is actively typing"_ ([docs](https://docs.helpscout.com/article/1583-collaborate-with-your-team-in-the-inbox)).
- **Attio.** Avatars show who is on the same page or note. In tables, _"you can see exactly where other members are currently working as they click around the different cells"_. Concurrent edits: _"the most recent update will be shown"_ ([help](https://attio.com/help/reference/productivity-collaborating/real-time-updates)).
- **Superhuman.** Shared drafts update _"in real-time"_, with comments ([help](https://help.superhuman.com/hc/en-us/articles/46005578703885-Shared-Drafts)).
- **Intercom (weak).** An open request says presence is _"not consistently reliable"_ and has _"no indication of when someone is actively composing a reply"_ ([community](https://community.intercom.com/ideas/feature-request-real-time-agent-presence-indicator-12772)).

**Good vs weak**

- _Good:_ viewing and typing shown differently; presence visible in list rows, not only inside a record; drafts visible to others; a warning on send if someone else replied first; heartbeat timeouts.
- _Weak:_ presence only inside the record; no typing state.

**Acceptance check:** Two agents open the same ticket; each sees the other's avatar in the ticket and in the queue row. The second to send is warned that a reply was just sent.

---

### 4. Work management

#### 4.1 Tasks — TABLE STAKES

**Who has it**

- **HubSpot.** Priority (low, medium, high), queue, due date and time, reminder; default due date, time and reminder; a prompt to create a follow-up task after completing one ([KB](https://knowledge.hubspot.com/tasks/create-tasks)).
- **Close.** Description, date, time, contact, assignee and _"High Priority"_. Assigning to someone else emails them. _"Close will automatically mark Call Tasks as completed when there is a matching call activity"_ ([help](https://help.close.com/feature-guide/tasks)).
- **Attio.** `t` from anywhere; `@record` links a record; `@member` assigns; natural-language dates (_"call Tuesday at 7pm"_). Sort and group settings are personal ([help](https://attio.com/help/reference/productivity-collaborating/tasks)).
- **Pipedrive.** Activity types (call, meeting, task, deadline, email, lunch, plus custom types) with time, duration and linked items. An activity is visible only if the user can see every linked item ([KB](https://support.pipedrive.com/en/article/activities)).
- **Linear.** The due-date icon is red when due today or overdue and orange within a week; notifications for overdue and one week out ([docs](https://linear.app/docs/due-dates)).

**Good vs weak**

- _Good:_ tasks linked to records and shown on them; the task type drives a one-click action (HubSpot opens the email or call editor; Close auto-completes call tasks); natural-language dates; defaults; bulk reschedule; a clear overdue state.
- _Weak:_ free-floating to-dos with no record link.

**Acceptance check:** "Call Acme re renewal next Tue 10am" typed once creates a call task linked to Acme, due in my time zone, with a 15-minute reminder.

#### 4.2 Reminders and digests — TABLE STAKES

**Who has it**

- **HubSpot.** Reminder at due time, 1 hour before, or a custom time, plus a weekday digest ([KB](https://knowledge.hubspot.com/tasks/task-reminders-and-daily-digest)).
- **Pipedrive.** An alert, a line in the summary email, or _"a separate email one hour before"_ ([KB](https://support.pipedrive.com/en/article/activity-reminder-emails)).
- **Notion.** `@remind tomorrow`. You can remind others in pages but _"not in a database"_; reminders _"turn red"_ when due ([help](https://www.notion.com/help/reminders)).
- **Superhuman.** `H` sends a message to a Reminders folder; it returns to the top of the inbox _"with a purple dot"_ ([help](https://help.superhuman.com/hc/en-us/articles/46005666142733-Remind-Me)).
- **Attio.** A digest only on days when tasks are due ([help](https://attio.com/help/reference/account-settings/notifications)).

#### 4.3 Recurring tasks — COMMON

**Who has it**

- **HubSpot.** _"Set to repeat"_ every N days, weeks, months or years. Each repeat keeps the title, assignee, notes and associations. _"A new task will be created if the previous task is completed, deleted, or becomes overdue"_. Requires a seat ([KB](https://knowledge.hubspot.com/tasks/create-tasks)).
- **ClickUp.**
  - Recur _"On Schedule"_ or after the task is marked complete; skip weekends.
  - _"If a recurring time is not set, the task will recur at 11pm in the timezone of the user who set up the recurring schedule."_
  - Future recurrences are visible on paid plans ([help](https://help.clickup.com/hc/en-us/articles/6309885016471-Use-recurring-tasks)).
- **Notion.** _"Repeating database templates"_: daily, weekly, monthly or yearly, with a start date and time ([help](https://www.notion.com/help/database-templates)).
- **Linear.** Recurring issues created from templates ([docs](https://linear.app/docs/creating-issues)).
- **Pipedrive — absent.** _"we do not currently have a dedicated feature"_. Recurring events synced from an external calendar _"cannot be edited or moved from within Pipedrive"_ ([KB](https://support.pipedrive.com/en/article/recurring-activities), [calendar sync](https://support.pipedrive.com/en/article/calendar-sync)).

**Good behaviours:** schedule-based vs completion-based recurrence; end conditions; skip weekends and holidays; an explicit time zone; "edit this one or the whole series"; future instances visible.

#### 4.4 Task queues and focus mode — COMMON (sales CRMs); TABLE STAKES (help desks' "next ticket")

**Who has it**

- **HubSpot.**
  - Task queues group and share tasks. _"Each user can create up to 20 task queues"_. Shared queues can be filled by workflows and sequences (Pro/Ent) ([KB](https://knowledge.hubspot.com/tasks/use-task-queues)).
  - _"Start [x] tasks"_ works through them back to back: skip, reschedule, the editor opens by task type, and a task auto-completes when its email is sent ([KB](https://knowledge.hubspot.com/tasks/complete-tasks)).
  - Also a prospecting queue ([KB](https://knowledge.hubspot.com/prospecting/use-the-prospecting-queue)) and guided execution ([KB](https://knowledge.hubspot.com/prospecting/use-guided-execution-in-the-sales-workspace)).
- **Close.**
  - The Power Dialer calls through a Smart View; you can pause. _"Continue Calling"_ skips leads _"reached in the last hour"_; _"Start from Scratch"_ redials everyone ([help](https://help.close.com/feature-guide/power-predictive-dialing/using-the-power-dialer)).
  - The Inbox is the work list ([help](https://help.close.com/feature-guide/inbox)).
- **Zendesk.** Play mode serves the next unviewed ticket ([help](https://support.zendesk.com/hc/en-us/articles/4408825035674-Troubleshooting-agent-collision-in-Play-mode)); Guided mode ([help](https://support.zendesk.com/hc/en-us/articles/4408825479066-Setting-up-Guided-mode)).
- **Pipedrive.** Contextual-view arrows ([KB](https://support.pipedrive.com/en/article/activity-contextual-view)). The mobile focus view has an overdue widget, today and next week, _"swipe… to reschedule"_, and nearby deals ([KB](https://support.pipedrive.com/en/article/focus-view-in-the-mobile-app)).
- **Superhuman.** Split Inbox ([help](https://help.superhuman.com/hc/en-us/articles/46005619081101-Default-Split-Inbox)).

**Good behaviours:** the queue is defined by a saved view; queues can be shared; "next" respects priority and SLA; inline skip and reschedule; a progress counter; auto-complete when the action is taken.

**Acceptance check:** "Start" on the "Renewals this week" view walks through 14 accounts with next/skip/snooze and shows "6 of 14".

#### 4.5 Subtasks and checklists — COMMON (CRMs); TABLE STAKES (work-management tools)

**Who has it**

- **HubSpot.** Subtasks (beta) on project tasks: _"up to 60 subtasks per main task"_ ([KB](https://knowledge.hubspot.com/tasks/use-subtasks-with-objects)).
- **Linear.** Sub-issues. _"paste a list of issue titles"_ to create several at once; turn a comment into a sub-issue ([docs](https://linear.app/docs/parent-and-sub-issues)).
- **Asana.** Subtasks and dependencies ([features](https://asana.com/features/project-management/tasks)).
- **Notion.** Sub-items and dependencies ([help](https://www.notion.com/help/tasks-and-dependencies)).
- **monday.** Multiple levels of subitems ([help](https://support.monday.com/hc/en-us/articles/29810815287570-Multiple-levels-of-subitems-on-monday-com)); checklists inside updates ([help](https://support.monday.com/hc/en-us/articles/115005900249-The-Updates-Section)).
- **Pipedrive Projects.** Tasks, subtasks and dependencies ([KB](https://support.pipedrive.com/en/article/projects-tasks-and-subtasks)).
- **ClickUp.** Checklists and subtasks; subtasks _"cannot be created in Offline Mode"_ ([help](https://help.clickup.com/hc/en-us/articles/6308895791127-Offline-Mode)).

#### 4.6 "My day" home / agenda — TABLE STAKES

**Who has it**

- **HubSpot.** Default task views _"All… Due today… Overdue"_, each scoped to _"Assignee: Me"_ ([KB](https://knowledge.hubspot.com/tasks/filter-tasks-and-manage-task-views)).
- **Attio.** Home shows tasks _"due today, due tomorrow, or overdue"_ ([help](https://attio.com/help/reference/productivity-collaborating/tasks)).
- **Close.** Inbox, Future and Done ([help](https://help.close.com/feature-guide/inbox)).
- **Asana.** My Tasks has custom sections, rules, and a "Recently Assigned" section ([features](https://asana.com/features/project-management/my-tasks)).
- **Linear.** My Issues, with a "Focus" grouping ([docs](https://linear.app/docs/display-options)).
- **Copper.** The Feed's "Keep Things Moving" area ([KB](https://support.copper.com/en/articles/10683406-using-the-copper-feed)).
- **Pipedrive.** Mobile focus view ([KB](https://support.pipedrive.com/en/article/focus-view-in-the-mobile-app)).

**Good behaviours:** tasks, follow-ups due, mentions and meetings in one place; overdue first; one-key reschedule; counts.

#### 4.7 Calendar sync (Google/Outlook) — TABLE STAKES (quality varies widely)

**Who has it**

- **Pipedrive** ([KB](https://support.pipedrive.com/en/article/calendar-sync)):
  - Google, Exchange, Outlook and Office; _"Two-way sync"_ or _"One-way sync"_; choose which calendar.
  - _"Only events and activities in the future will sync"_.
  - Private events become _"an unidentified block"_.
  - In two-way mode, deleting in Pipedrive deletes in the calendar. IMAP/POP calendars are not supported.
- **HubSpot.**
  - _"Calendar sync will only sync with a user's primary calendar"_; Google _or_ Outlook, not both; events from before connecting do not sync ([KB](https://knowledge.hubspot.com/integrations/use-hubspots-integration-with-google-calendar-or-outlook-calendar)).
  - Tasks sync one way as _"a 15-minute event"_. Deleting a task _"will not be deleted from your calendar"_, and calendar edits _"will not sync back"_ ([KB](https://knowledge.hubspot.com/tasks/sync-tasks-to-your-google-or-outlook-calendar)).
- **Copper.** Tasks go to a "Copper Reminders" calendar, on by default. Meetings attach to records when attendee emails match ([KB](https://support.copper.com/en/articles/8823267-syncing-tasks-to-google-calendar)).
- **Twenty.** Google, Microsoft or CalDAV. _"Create calendar event"_ from a record creates it on the connected calendar ([docs](https://docs.twenty.com/user-guide/calendar-emails/how-tos/can-i-book-meetings-from-twenty)).

**Good vs weak**

- _Good:_ two-way; multiple calendars; privacy handling for personal events; attendees matched to records; correct time zones; deletes handled both ways.
- _Weak:_ one-way only; primary calendar only; deletes not propagated.

#### 4.8 Scheduling pages and booking links — COMMON

**Who has it**

- **HubSpot** ([KB](https://knowledge.hubspot.com/meetings-tool/create-and-edit-scheduling-pages)):
  - One-on-one, Group (_"time slots where all selected team members are available"_) and Round robin, with rotations and _"Prioritize contact owner"_.
  - Availability windows and working hours; _"Minimum notice time"_; _"Buffer time"_.
  - A visitor time-zone dropdown; cancel and reschedule links; confirmation and reminder emails.
- **Pipedrive.** General-availability links vs specific time slots; Growth-plan users get _"only one active general availability link"_ ([KB](https://support.pipedrive.com/en/article/scheduler)).
- **Close.** Stores personal links plus up to _"20 shared links (per Organization)"_ as template tags such as `{{user.scheduling_links.demo_call}}`. They are _"not auto-populated or synced from Calendly"_ ([help](https://help.close.com/feature-guide/scheduling-links)).
- **Superhuman.** Share Availability ([help](https://help.superhuman.com/hc/en-us/articles/46005575115021-Share-Availability)).
- **Folk.** Through Calendly or Cal.com ([help](https://help.folk.app/en/articles/9818766-how-to-connect-scheduling-tools-folk-calendly-cal-com)).
- **Twenty.** No booking page ([docs](https://docs.twenty.com/user-guide/calendar-emails/how-tos/can-i-book-meetings-from-twenty)).

**Good behaviours:** round robin and group modes; buffers and minimum notice; time-zone detection; reschedule and cancel links; a qualifying form; each booking writes the contact, the meeting and the owner into the CRM.

#### 4.9 Meeting recording, transcription and notes — COMMON and rising

**Who has it**

- **HubSpot Notetaker** ([KB](https://knowledge.hubspot.com/meetings-tool/record-and-take-notes-in-meetings-with-meeting-notetaker)):
  - Works in Google Meet, Teams and Zoom; produces notes and next steps.
  - _"Each HubSpot user can invite the Notetaker bot to join up to 40 meetings per day"_.
  - Consent: _"You are responsible for determining and establishing the appropriate legal basis"_.
- **Close Notetaker.** Auto-joins _"even if you're not the organizer"_; can record when you are absent; _"over 20 languages"_ ([help](https://help.close.com/feature-guide/notetaker)).
- **Attio.** Call recording and call intelligence ([help](https://attio.com/help/reference/productivity-collaborating/call-intelligence/recording-calls-with-attio)).
- **Notion.** AI meeting notes ([help](https://www.notion.com/help/ai-meeting-notes)); desktop meeting detection _"sends a notification prompt to start meeting notes"_ ([help](https://www.notion.com/help/notification-settings)).

**Good behaviours:** consent controls; auto-linking to records; searchable transcripts; action items become tasks; a retention policy.

---

### 5. Content

#### 5.1 Rich-text notes — TABLE STAKES

**Who has it**

- **Attio.** Real-time collaborative notes, note templates, and `/` block commands. _"Link an event"_ attaches a calendar event; images can be added ([help](https://attio.com/help/reference/productivity-collaborating/notes)).
- **Pipedrive.** Notes on leads, deals, contacts and activities; pin a note ([KB](https://support.pipedrive.com/en/article/mentions-and-comments-beta)).
- **Folk.** Notes are shared with everyone who can see the contact. _"enable the 'Private' button"_ for private notes ([help](https://help.folk.app/en/articles/5007332-adding-notes)).
- **Zoho.** _"record text and audio notes for every module"_ ([features](https://www.zoho.com/crm/team-collaboration.html)).
- **HubSpot.** Notes, plus one pinned activity per record ([KB](https://knowledge.hubspot.com/records/pin-an-activity-on-a-record)).

**Good behaviours:** headings, lists, links and images; templates; private vs shared; pin; `@record` links; edit history.

#### 5.2 File attachments on records — TABLE STAKES (limits vary 100×)

**Who has it**

| Product   | Limit                                                                                        | Notes                                                                                                                                                                                                                                                                                                                                                                    |
| --------- | -------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| HubSpot   | _"20 MB"_ (free) / _"2 GB"_ (paid; _"If a file is 1 GB or more, you may experience issues"_) | Preview and an internal share link on records; BCC-logged email _"40 MB"_ total. Sources: [files](https://knowledge.hubspot.com/files/supported-file-types), [attachments](https://knowledge.hubspot.com/records/add-and-remove-attachments-from-records), [BCC](https://knowledge.hubspot.com/connected-email/log-email-in-your-crm-with-the-bcc-or-forwarding-address) |
| Zendesk   | 50 MB per file                                                                               | Malware scanning, signed-in secure downloads, attachment expiry, allowed-type lists ([help](https://support.zendesk.com/hc/en-us/articles/4408832757146-Allowing-attachments-in-tickets))                                                                                                                                                                                |
| monday    | _"500MB… for each item"_                                                                     | Otherwise zip or use a cloud link ([help](https://support.monday.com/hc/en-us/articles/115005339505-How-to-manage-files-in-monday-com))                                                                                                                                                                                                                                  |
| Airtable  | _"up to 5GB"_ per attachment                                                                 | Previews for images, PDF and Office files; annotation ([help](https://support.airtable.com/articles/9139007724-attachment-fields-in-airtable))                                                                                                                                                                                                                           |
| Notion    | Free _"up to 5MB"_; paid _"up to 5GB"_ per file                                              | ([help](https://www.notion.com/help/images-files-and-media))                                                                                                                                                                                                                                                                                                             |
| ClickUp   | Free Forever 60 MB workspace storage; paid unlimited                                         | ([help](https://help.clickup.com/hc/en-us/articles/33463620625559-Workspace-storage-limits))                                                                                                                                                                                                                                                                             |
| Pipedrive | Drag and drop, Google Drive; Smart BCC message _"under 20 MB"_                               | Files _"remain attached even after an item is archived… or converted"_ ([files](https://support.pipedrive.com/en/article/how-can-i-upload-a-file-to-a-deal-or-a-contact), [BCC](https://support.pipedrive.com/en/article/smart-email-bcc))                                                                                                                               |
| Attio     | Files tab _"on all object types"_ (2026)                                                     | ([changelog](https://attio.com/changelog/2026/files-on-deals-and-custom-objects))                                                                                                                                                                                                                                                                                        |

**Good behaviours:** drag and drop plus paste; inline preview of PDF, images and Office files; cloud pickers; malware scanning; access inherited from the record; versions; errors that name the limit; bulk download.

**Acceptance check:** Pasting a screenshot into a ticket note uploads it. A 60 MB PDF either uploads or fails with "max 50 MB per file".

#### 5.3 File versioning — DIFFERENTIATOR

**Who has it**

- **monday.** Add versions and make an older one current. _"deleting the current version will delete all other versions"_ (trial feature) ([help](https://support.monday.com/hc/en-us/articles/360021698980-File-versioning)).
- **Pipedrive Smart Docs.** "Understanding document versions" ([KB](https://support.pipedrive.com/en/article/smart-docs)).
- **Airtable.** Base snapshots ([help](https://support.airtable.com/articles/2163132802-taking-and-restoring-snapshots-in-airtable)).

#### 5.4 Document library and tracked share links — COMMON (sales CRMs)

**Who has it**

- **HubSpot Documents** ([KB](https://knowledge.hubspot.com/documents/use-documents)):
  - Folders, and permissions on who can share.
  - _"the user who shared the link will receive a notification when a contact views the document"_.
  - Optional _"Require email address to view"_.
  - A shareable link is _"publicly available"_ and shows the sharer's name and email.
- **Pipedrive Smart Docs.** Templates from Google Drive, OneDrive or SharePoint with fields filled in; trackable links; e-signatures; Premium plan or add-on ([KB](https://support.pipedrive.com/en/article/smart-docs)).

#### 5.5 Email templates — TABLE STAKES

**Who has it**

- **HubSpot** ([KB](https://knowledge.hubspot.com/templates/create-and-send-templates)):
  - Personalisation tokens, and placeholder tokens that _"prompt users to enter the missing information before sending"_.
  - Private or shared; folders; _"256 character limit"_ on subjects; template performance in reports.
  - Free accounts get 3–5 templates.
- **Pipedrive.** Private or shared. Merge fields work _"in the body… the subject line or inside hyperlinks"_. You can insert a scheduler link. Regular users edit only their own templates and save shared ones as new ([KB](https://support.pipedrive.com/en/article/email-templates)).
- **Close.** Template tags, including per-user scheduling links ([help](https://help.close.com/feature-guide/scheduling-links)).
- **Copper.** Templates are available inside the Gmail extension ([KB](https://support.copper.com/en/articles/8823284-how-to-use-the-chrome-extension-in-gmail)).

**Good behaviours:** merge fields with fallbacks, and a warning on any unfilled placeholder; sharing scopes; folders; usage statistics; attachments in templates.

#### 5.6 Snippets and macros — TABLE STAKES (help desks and sales tools)

**Who has it**

- **HubSpot snippets** ([KB](https://knowledge.hubspot.com/conversations/use-snippets)):
  - Type `#` plus the shortcut to insert.
  - _"2,500 character limit per snippet"_; _"up to 5,000 snippets per account"_ on paid plans.
  - Tokens populate only on the record's email tab; the mobile keyboard shows _"up to 100"_ snippets.
- **Superhuman.** Variables, plus `{placeholders}` that warn if left unfilled at send; _"Share with team"_ adds a snippet to "Team Snippets" ([help](https://help.superhuman.com/hc/en-us/articles/46005686571149-Snippets)).
- **Intercom macros.** Message content plus actions (_"tagging, assigning, snoozing, or closing"_) that run on send. Each macro belongs to one composer (reply, note or new conversation). Personal and shared macros sit behind different permissions ([help](https://www.intercom.com/help/en/articles/6584504-using-macros-in-the-inbox)).
- **Close.** Snippets under Templates & Snippets ([help](https://help.close.com/docs/keyboard-shortcuts)).

**Good behaviours:** an inline trigger key; variables with fallbacks; actions bundled with text (help desks); team sharing with ownership; usage analytics.

#### 5.7 Record templates and default values on create — COMMON

**Who has it**

- **Attio.** Record and list-entry templates (Pro/Enterprise) choose which attributes appear when a record is created ([help](https://attio.com/help/reference/managing-your-data/create-record-and-list-entry-templates)).
- **Airtable.** Record templates can create linked sub-records ([help](https://support.airtable.com/articles/9772992207-using-record-templates-in-airtable)).
- **Notion.** Database templates, including repeating ones ([help](https://www.notion.com/help/database-templates)).
- **Linear.** Issue templates, and email intake that applies a template ([docs](https://linear.app/docs/creating-issues)).
- **HubSpot.** Admins choose which fields appear on the create form ([KB](https://knowledge.hubspot.com/object-settings/set-up-fields-seen-when-manually-creating-records)).

#### 5.8 E-signature — COMMON (native in some CRMs; via integration in most)

**Who has it**

- **HubSpot** ([KB](https://knowledge.hubspot.com/quotes/use-e-signatures-with-quotes)):
  - Quotes are _"powered by Dropbox Sign"_.
  - A _"pooled monthly e-signature limit"_ scales with seats. A signature counts _"as soon as the e-signature option is turned on for a published quote"_, and _"multiple signatures counts as one"_.
  - Countersigners are supported; quote PDFs over 40 MB may fail.
- **Pipedrive Smart Docs.** A certificate issued by a third party (Ensured). The signing link is _"active for 60 days"_ ([FAQ](https://support.pipedrive.com/en/article/esignatures-faq-beta)).
- **Folk.** Via DocuSign or Yousign ([help](https://help.folk.app/en/articles/9886465-how-to-connect-folk-to-e-signature-tools-docusign-or-yousign)).
- **Close.** DocuSign and GetAccept integrations (Close integrations directory).

#### 5.9 Email sync and BCC/forward logging — TABLE STAKES

**Who has it**

- **HubSpot.** The extension or add-in logs automatically. _"The BCC address is the same for all users"_; there is also a forwarding address; _"40 MB"_ limit ([KB](https://knowledge.hubspot.com/connected-email/log-email-in-your-crm-with-the-bcc-or-forwarding-address)).
- **Pipedrive Smart BCC.**
  - If the sender is unknown, _"a new person contact will be created automatically"_.
  - _"Any replies… will need to be forwarded"_ to the same address.
  - 20 MB limit ([KB](https://support.pipedrive.com/en/article/smart-email-bcc)).
- **Attio.** By default _"teammates can see an email's metadata and subject line… They cannot see the email body"_. Blocklists exist, and internal domains are protected automatically ([help](https://attio.com/help/reference/email-calendar/keep-emails-and-calendar-events-private)).
- **Folk.** Sharing is _"Subject only"_ or _"Full access"_ ([help](https://help.folk.app/en/articles/6416668-share-interactions-with-your-team)).
- **Twenty.** Email appears on People, Companies and Opportunities. Opportunities show only the company's threads: _"Email threads from individual people on the opportunity are not shown yet"_ ([docs](https://docs.twenty.com/user-guide/calendar-emails/capabilities/mailbox)).
- **Close.** Forwarding to a secret address creates leads automatically ([help](https://help.close.com/feature-guide/inbox)).

**Good behaviours:** two-way sync of sent and received mail; auto-association rules; privacy tiers; blocklists; per-user mailboxes; optional attachment logging.

#### 5.10 Email open/click tracking and privacy — TABLE STAKES (sales CRMs); privacy handling is the differentiator

**Who has it**

- **HubSpot** ([KB](https://knowledge.hubspot.com/connected-email/understand-hubspot-sales-email-open-and-click-tracking)):
  - Opens use _"an invisible one-pixel image"_; clicks use a temporary redirect domain, which can be your own.
  - _"suspected non-human interactions… are excluded"_.
  - Preview panes can trigger an open.
  - Tracking can be switched off when there is no consent; with privacy settings on, opens are tracked only for contacts with a legal basis.
- **Pipedrive.** A pixel; _"If the email recipient's email client blocks images… open tracking won't register. Link tracking still works"_ ([KB](https://support.pipedrive.com/en/article/email-tracking)). Since 2021, Apple Mail and Gmail privacy changes make opens unreliable ([KB](https://support.pipedrive.com/en/article/email-tracking-reports-with-gmail-and-apple)).
- **Copper.** Open tracking on Professional and Business plans ([KB](https://support.copper.com/en/articles/8823289-email-open-tracking)).
- **Superhuman.** Read statuses are switched on via ⌘K → Enable Read Statuses ([help](https://help.superhuman.com/hc/en-us/articles/46005603745293-Read-Statuses-and-Recent-Opens-Feed)). In its read-statuses post, Superhuman says it has _"stopped logging location information"_ and is deleting the historical location data. Once read statuses are disabled, it _"will not include tracking pixels in sent emails"_ ([blog](https://blog.superhuman.com/read-statuses/)).

**Good behaviours:** off by default or consent-aware; a per-email toggle; bot filtering; clicks weighted above opens; honest labels such as "opened (may be automated)".

#### 5.11 Inbox sidebar: link email to records — COMMON

**Who has it**

- **Copper.** The Chrome extension gives full record management inside Gmail ([KB](https://support.copper.com/en/articles/8823284-how-to-use-the-chrome-extension-in-gmail)).
- **HubSpot.** Deal context in Gmail and Outlook ([KB](https://knowledge.hubspot.com/connected-email/view-deal-context-in-gmail)).
- **Close.** "Potential contacts" from unknown senders ([help](https://help.close.com/feature-guide/inbox)).

---

### 6. Customisation

#### 6.1 Custom field types — TABLE STAKES

**Who has it**

- **HubSpot.** Single-line and multi-line text (_"65,536 characters"_), checkbox, multi-checkbox, dropdown, date, number (formatted, percentage, currency), calculation, property sync ([KB](https://knowledge.hubspot.com/properties/property-field-types-in-hubspot)).
- **Pipedrive.** _"16 custom field types"_. Single option allows _"maximum 1000 options per field"_; autocomplete stores _"up to 255 characters"_. Also user, organisation and person references, time ranges, date ranges, and addresses with Google Maps autocomplete ([KB](https://support.pipedrive.com/en/article/what-types-of-custom-fields-are-there)).
- **Attio.** Status (_"required for kanban views"_), currency, rating 1–5, record reference (multi-value), relationship (bidirectional, Pro/Ent), formula (Pro/Ent), AI autofill. Default values; _"5,000 options per attribute"_; unique and required attributes ([help](https://attio.com/help/reference/managing-your-data/attributes/create-manage-attributes)).
- **Twenty.** Address, array, boolean, currency (with currency code), date, date & time, domain, email (primary plus additional), JSON, links, long text, multi-select, number, phone (with country code), rating, relation, select, text ([docs](https://docs.twenty.com/user-guide/data-model/capabilities/fields)).
- **Close.** Dropdown (single/multiple), contact (single/multiple), date, date & time, number, text, textarea, user ([help](https://help.close.com/feature-guide/custom-fields)).
- **ClickUp.** Dropdowns and labels allow _"up to 500 options"_, with colours and sorting ([help](https://help.clickup.com/hc/en-us/articles/6303499162647-Custom-Field-types)).
- **Zoho.** Multi-select picklist, auto number, currency, formula, subforms ([feature list](https://www.zoho.com/crm/complete-feature-list.html)).

**Good behaviours:** strongly typed fields (currency with a code, phone with a country, address autocomplete); relation types; defaults; options with colour and order; field-level permissions.

#### 6.2 Formula and calculated fields — COMMON

**Who has it**

- **HubSpot.** Calculation properties (Pro/Ent; count limited by tier). Durations are _"stored in milliseconds"_ ([KB](https://knowledge.hubspot.com/properties/create-calculation-properties)).
- **Pipedrive.** Premium plans and above. _"Each company account can have up to ten formula fields"_; they calculate on deals only, using numeric and monetary `#Field` inputs ([KB](https://support.pipedrive.com/en/article/custom-fields-formula-fields)).
- **Attio.** Pro/Ent, with functions such as `if()`, `dateAdd()` and `timeSpentIn()` ([help](https://attio.com/help/reference/managing-your-data/attributes/formula-attributes)).
- **Salesforce.** Formulas, including cross-object formulas ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/point_click_business_logic/formula_fields)).
- **Also:** Notion, Airtable, ClickUp and monday formula fields; Folk has a "Calculated fields" article ([help](https://help.folk.app/en/articles/13859660-calculated-fields)).
- **Absent:** Twenty and Close document no formula field type.

#### 6.3 Rollups and lookups across relations — COMMON

**Who has it**

- **HubSpot.** Rollup properties, e.g. _"counts the total number of sales activities logged for a deal's associated contacts with the Decision maker label"_ ([KB](https://knowledge.hubspot.com/properties/create-calculation-properties)).
- **Salesforce.** Roll-up summary fields require a master-detail relationship; operations are COUNT, SUM, MIN and MAX ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/point_click_business_logic/roll_up_summary_fields)).
- **Airtable.** Rollup, lookup and count fields, with conditions ([help](https://support.airtable.com/articles/7497685062-rollup-field-overview)).
- **Notion.** Relations and rollups ([help](https://www.notion.com/help/relations-and-rollups)).

#### 6.4 Custom objects — COMMON

**Who has it**

- **HubSpot.** _"An Enterprise subscription is required [to] use custom objects"_ ([KB](https://knowledge.hubspot.com/records/search-your-crm); [KB](https://knowledge.hubspot.com/object-settings/create-custom-objects)).
- **Attio.** _"3 on Free, 5 on Plus, 12 on Pro, and unlimited on Enterprise"_ objects, counting Companies and People ([help](https://attio.com/help/reference/managing-your-data/objects/create-and-manage-custom-objects)).
- **Close.** Scale/Enterprise; custom objects are _"always tied to a specific lead"_ ([help](https://help.close.com/feature-guide/custom-objects)).
- **Freshsales.** _"Admins can create a maximum of 10 new modules"_ ([KB](https://crmsupport.freshworks.com/support/solutions/articles/50000002401-what-are-custom-modules-how-to-add-a-new-module-)).
- **Zoho.** Custom modules ([feature list](https://www.zoho.com/crm/complete-feature-list.html)).
- **Also:** Salesforce and Twenty.
- **Pipedrive.** Its 567-article English KB has no custom-object article; Projects is the extra object.

#### 6.5 Required fields and validation rules — TABLE STAKES (required); COMMON (validation)

**Who has it**

- **HubSpot.**
  - Properties and associations can be made required on create (Starter and above) ([KB](https://knowledge.hubspot.com/object-settings/set-up-fields-seen-when-manually-creating-records)).
  - Validation options: unique values, minimum and maximum characters, numbers only, no special characters, uppercase only, _"Automatically remove disallowed characters"_; regex needs Pro/Ent.
  - Rules apply to UI and imports; _"Existing values aren't retroactively formatted"_ ([KB](https://knowledge.hubspot.com/properties/set-validation-rules-for-properties)).
- **Pipedrive.**
  - Required fields (Professional and above) can be scoped per pipeline and stage. Users _"won't be able to add or edit new items or move deals until the required fields have been filled in"_ ([KB](https://support.pipedrive.com/en/article/required-fields)).
  - _"Important fields"_ give a softer, visual reminder ([KB](https://support.pipedrive.com/en/article/important-fields)).
- **Attio rules.** _"If the condition is met but a requirement isn't, Attio blocks the change"_; _"up to eight rules per object"_ on Pro ([help](https://attio.com/help/reference/managing-your-data/objects/create-and-manage-rules)).
- **Salesforce.** Validation rules are formulas; a True result shows an error message and blocks the save ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/point_click_business_logic/validation_rules)).
- **Freshsales.** Required and read-only fields ([KB](https://crmsupport.freshworks.com/support/solutions/articles/50000002404-what-is-a-required-field-how-to-make-a-field-required-)).
- **Zoho.** Validation rules and record locking ([feature list](https://www.zoho.com/crm/complete-feature-list.html)).

**Good behaviours:** conditional and stage-gated requirements; inline errors in plain language; enforced on imports and the API (or deliberately not); soft "important" warnings as well as hard blocks.

#### 6.6 Conditional field logic and dependent picklists — COMMON

**Who has it**

- **HubSpot.** Conditional logic for enumeration properties (AND combinations in beta) ([KB](https://knowledge.hubspot.com/properties/set-up-conditional-logic-for-enumeration-properties)).
- **Salesforce.** _"Controlling Fields, Dependent Picklists, and Narrowing Values"_ ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/picklist_admin/picklist_admin_manage)).
- **Zoho.** Layout rules ([video](https://www.zoho.com/crm/resources/videos/how-to-videos/layout-rules.html)).

#### 6.7 Field help text and descriptions — COMMON

**Who has it**

- **Attio.** Attributes take _"optionally, a description"_ ([help](https://attio.com/help/reference/managing-your-data/attributes/create-manage-attributes)).
- **Salesforce.** Value-set descriptions appear in Setup ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/picklist_admin/picklist_admin_global)). Field-level help bubbles _(not re-verified)_.

**Good behaviours:** help text shown as a tooltip next to the field label on forms, not only in admin settings.

#### 6.8 Page layouts and record-page builder — COMMON

**Who has it**

- **Salesforce.** Lightning App Builder plus the page layout editor. Dynamic Forms _"migrate the fields and sections… into individual components"_ with visibility rules ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/lex_customization/lex_customization_page_layouts)).
- **HubSpot.** Configure the default record layout (left-sidebar cards including conditional cards, middle-column tabs, right-sidebar associations). Team-specific views need Pro/Ent ([KB](https://knowledge.hubspot.com/object-settings/customize-records)).
- **Twenty.** Tabs and widgets (fields, related records, emails, timeline, calendar, tasks, notes, files, charts, iFrames) on a drag-and-resize grid, opened via Cmd+K ([docs](https://docs.twenty.com/user-guide/layout/overview)).
- **Notion.** Page layouts per database; _"Layouts can't be applied only to specific pages or specific views"_ ([help](https://www.notion.com/help/layouts)).
- **Attio.** Configure record pages ([help](https://attio.com/help/reference/managing-your-data/records/configure-record-pages)).
- **Zoho.** Canvas for list, detail and form views ([feature list](https://www.zoho.com/crm/complete-feature-list.html)).

#### 6.9 Picklist management — TABLE STAKES (basic); DIFFERENTIATOR (advanced)

**Who has it**

- **Salesforce.**
  - "Replace" swaps a value across existing records.
  - Inactive values _"don't [appear], but they're not entirely removed"_, and existing records keep them ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/picklist_admin/picklist_admin_manage)).
  - Global value sets share values across fields and _"are always restricted"_ ([Trailhead](https://trailhead.salesforce.com/content/learn/modules/picklist_admin/picklist_admin_global)).
- **Zoho.** _"Color Coding Picklists"_ and _"Picklist History Tracking"_ ([feature list](https://www.zoho.com/crm/complete-feature-list.html)).
- **Option caps:** Pipedrive 1,000; Attio 5,000; ClickUp 500 (links in §6.1).

**Good behaviours:** renaming a label keeps a stable internal value; deactivate is separate from delete; merge or replace values with a bulk update; colours and ordering; usage counts per value.

---

### 7. Experience

#### 7.1 Native mobile apps — TABLE STAKES

**Who has them**

- **HubSpot.** Records, calls, tasks and a mobile notetaker ([KB](https://knowledge.hubspot.com/records/work-with-records-in-the-hubspot-mobile-app)).
- **Pipedrive.** iOS 18+ and Android 11+ ([KB](https://support.pipedrive.com/en/article/do-the-mobile-apps-work-offline)).
- **Attio.** iOS, and Android 13+ ([help](https://attio.com/help/reference/tools-and-extensions/attio-on-mobile)).
- **Close.** iOS and Android, with calling and SMS ([help](https://help.close.com/getting-started/close-mobile-app)).
- **Linear.** iOS and Android, plus a PWA ([docs](https://linear.app/docs/get-the-app)).
- **Zendesk.** Support mobile app with dark mode ([help](https://support.zendesk.com/hc/en-us/articles/4408830934938-Is-there-a-dark-mode-for-Zendesk-Support)).
- **Also:** monday, Notion, ClickUp, Copper and Folk.

#### 7.2 Offline — COMMON (mobile); DIFFERENTIATOR (web and desktop)

**Who has it**

- **Pipedrive.** The mobile apps work offline and sync automatically; the web app _"can only be used online"_ ([KB](https://support.pipedrive.com/en/article/do-the-mobile-apps-work-offline), [KB](https://support.pipedrive.com/en/article/can-pipedrive-be-used-offline)).
- **monday mobile** ([help](https://support.monday.com/hc/en-us/articles/360017712819-Mobile-app-Offline-Mode)):
  - Offline mode turns on automatically and supports _"70% of all board actions"_.
  - _"your change will override theirs"_ on reconnect: last write wins.
  - _"there is no indication that lets you know you are working offline"_.
- **Notion.** Desktop and mobile only. Paid plans automatically download recent and favourited pages; for databases, _"the first 50 rows of the first view"_ ([help](https://www.notion.com/help/use-pages-offline)).
- **ClickUp.** Offline on web, desktop and mobile: create tasks and reminders, and view tasks you have already opened. _"Tasks and notes cannot be edited while offline"_ ([help](https://help.clickup.com/hc/en-us/articles/6308895791127-Offline-Mode)).
- **Superhuman.** Caches anything _"opened, searched for, or received in the last 30 days"_, plus _"Up to 1250 emails from each Split"_ ([help](https://help.superhuman.com/hc/en-us/articles/46005499629325-Offline-Access)).
- **Attio.** The browser warns when the connection drops; _"Attio will cache the page you have open"_ and syncs your changes later ([help](https://attio.com/help/reference/productivity-collaborating/real-time-updates)).
- **Zoho mobile.** _"Update info offline and sync later"_ ([features](https://www.zoho.com/crm/mobility.html)).
- **HubSpot — none.** Records cannot be created, edited or viewed without a connection ([KB](https://knowledge.hubspot.com/records/work-with-records-in-the-hubspot-mobile-app)).

**Good vs weak**

- _Good:_ an explicit offline indicator; a visible queue of pending changes; a stated conflict policy (field-level merge rather than last-write-wins); configurable caching.
- _Weak:_ a silent offline mode; whole-record last-write-wins (monday).

#### 7.3 Desktop app or PWA — COMMON

**Who has it:** Linear's desktop app (_"Notifications are integrated with your operating system"_; fewer shortcut conflicts) and PWA ([docs](https://linear.app/docs/get-the-app)); Close desktop app ([help](https://help.close.com/getting-started/desktop-app)); Notion; Superhuman; Folk ([help](https://help.folk.app/en/articles/8062551-download-folk-desktop-app)).

#### 7.4 Dark mode — TABLE STAKES in modern SaaS

**Who has it**

- **Attio.** _"Light, Dark, or System"_, plus an accent colour ([help](https://attio.com/help/reference/account-settings/personalize-attios-appearance)).
- **Close.** _"light mode, dark mode, or match your system default"_ ([help](https://help.close.com/account-management/account-settings)).
- **Pipedrive.** Light or dark mode in Interface preferences ([KB](https://support.pipedrive.com/en/article/quick-actions-in-pipedrive)).
- **Zendesk.** Dark mode, including the mobile app ([help](https://support.zendesk.com/hc/en-us/articles/4408830934938-Is-there-a-dark-mode-for-Zendesk-Support)).
- **ClickUp.** Dark Mode or Auto ([help](https://help.clickup.com/hc/en-us/articles/6309134405655-Dark-Mode)).
- **monday.** _"light, dark, and night mode"_ ([help](https://support.monday.com/hc/en-us/articles/360017414139-monday-com-display-themes-light-dark-and-night-mode)).
- **Linear.** Preset and custom themes (_"over 70 themes"_ on linear.style), font size, pointer cursor, underlined links ([docs](https://linear.app/docs/account-preferences)).
- **Twenty.** Light, Dark or System ([docs](https://docs.twenty.com/user-guide/settings/capabilities/experience-settings)).
- **Notion.** _"cmd/ctrl + shift + L to toggle between dark mode and light mode"_ ([help](https://www.notion.com/help/keyboard-shortcuts)).
- **Intercom.** ⌘K "Switch themes" ([help](https://www.intercom.com/help/en/articles/6272267-how-to-use-command-k-with-intercom-inbox)).
- **HubSpot — exception.** No app dark-mode article in its KB.

**Good behaviours:** follows the system setting; per user; contrast-checked colour tokens; charts and rich content themed too; persists across devices.

#### 7.5 Accessibility — TABLE STAKES (enterprise procurement)

**Who has it**

- **Zendesk.** _"Our goal is not only to meet the industry standard (WCAG 2.1 AA), but also to go beyond it"_. Table semantics for screen readers, keyboard support, _"no time-limited features"_ ([help](https://support.zendesk.com/hc/en-us/articles/4408838287514-Making-Zendesk-products-accessible)).
- **Airtable.** Publishes a VPAT and a screen-reader and keyboard guide ([help](https://support.airtable.com/articles/2203617073-accessibility-in-airtable)).

**The standard moved.** WCAG 2.2 (5 Oct 2023) added nine success criteria ([W3C](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)). The ones that hit staff tools directly:

- _2.4.11 Focus Not Obscured (AA):_ sticky headers and toasts must not hide the focused element.
- _2.5.7 Dragging Movements (AA):_ every kanban drag needs a click or keyboard alternative.
- _2.5.8 Target Size (Minimum) (AA):_ targets of at least 24×24 px.
- _3.3.8 Accessible Authentication (AA):_ allow password managers and passkeys; no cognitive puzzles.
- _3.3.7 Redundant Entry (A):_ do not make users re-enter data within a flow.
- Separately, WCAG 2.1 SC 2.1.4 requires single-key shortcuts to be disable-able or remappable ([W3C](https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts.html)).

**Acceptance check:** Publish a conformance statement (WCAG 2.2 AA target). Every board move works from a menu. Every single-key shortcut can be turned off.

#### 7.6 Localisation and per-user formats — COMMON

**Who has it**

- **HubSpot.** UI languages; some _"may not be immediately available for all features, such as when searching"_ ([KB](https://knowledge.hubspot.com/help-and-resources/hubspot-language-offerings)). The UI language _"won't adjust the language in the HubSpot mobile app"_ ([KB](https://knowledge.hubspot.com/user-management/profile-and-preferences)).
- **Pipedrive.** Per-user language, date and number format, and week start: _"Each user can choose the language"_ ([KB](https://support.pipedrive.com/en/article/how-can-i-change-my-language-or-date-number-format)).
- **monday.** _"15 languages"_ ([help](https://support.monday.com/hc/en-us/articles/360003503760-Available-languages-for-monday-com)).
- **Notion.** About 19+ UI languages, counting regional variants ([help](https://www.notion.com/help/change-your-language)).
- **Twenty.** Language, date, time and number formats, time zone, and calendar start day ([docs](https://docs.twenty.com/user-guide/settings/capabilities/experience-settings)).
- **Close — weak.** Only US and UK date formats, taken from the browser or OS ([help](https://help.close.com/technical-support/date-and-time-formats)).

#### 7.7 Time zones — TABLE STAKES (with many edge cases)

**Who has it**

- **HubSpot.** An account time zone drives schedules and analytics. _"some elements of HubSpot use the time zone set in your computer… timestamps for logged sales activities, record timelines, and property history"_ ([KB](https://knowledge.hubspot.com/account-management/change-your-language-and-region-settings)). The user time zone defaults to the device and can be overridden ([KB](https://knowledge.hubspot.com/user-management/profile-and-preferences)).
- **Pipedrive.** _"The timezone information can't be altered within Pipedrive's Settings page"_ ([KB](https://support.pipedrive.com/en/article/can-i-change-my-displayed-timezone)).
- **Zendesk.** Ticket timestamps use each user's profile time zone; voice-call notes use UTC ([help](https://support.zendesk.com/hc/en-us/articles/4408821092762-Which-time-zone-does-Zendesk-use)).
- **Airtable.** _"Airtable stores dates in Greenwich Mean Time"_. A date field can use _"the same time zone for all collaborators"_; there is a `SET_TIMEZONE()` function ([help](https://support.airtable.com/articles/7730575816-timezones-and-locales-in-airtable)).
- **Intercom.** "Snooze until tomorrow" _"always defaults to 9:00 AM in the workspace timezone"_, while reopen times show in each viewer's local time ([help](https://www.intercom.com/help/en/articles/6564538-snooze-a-conversation)).
- **ClickUp.** Recurrences default to 11 pm in the creator's time zone ([help](https://help.clickup.com/hc/en-us/articles/6309885016471-Use-recurring-tasks)).

**Good behaviours:** a per-user time zone setting (not just the OS); store UTC; date-only fields free of time zones; show the absolute time and zone on hover; business-hours calendars for SLAs and snoozes.

#### 7.8 Multi-currency with exchange rates — COMMON (CRMs)

**Who has it**

- **HubSpot** ([KB](https://knowledge.hubspot.com/account-management/add-and-edit-your-account-currencies)):
  - A company currency plus added currencies with exchange rates, optionally _"automatic updates"_, and _"View currency history"_.
  - Closed deals keep _"the exchange rate in effect at the time of closing"_.
  - Totals are reported as "Amount in company currency".
- **Pipedrive.** Rates come from _"Open Exchange Rates"_, are _"for statistical purposes only"_, apply to reporting only, and exclude custom currencies ([KB](https://support.pipedrive.com/en/article/how-is-currency-converted-in-pipedrive)).
- **Freshsales.** Manual rates or "Auto" from Open Exchange Rates. The previous day's closing rates _"will be used for deals created (or closed) from 00:01 UTC onwards"_; if a sync fails, _"the last available exchange rates will be used"_ ([KB](https://crmsupport.freshworks.com/support/solutions/articles/50000002419-how-are-automatic-currency-conversion-rates-fetched-)).
- **Twenty and Attio.** Currency fields with a currency code or display option ([Twenty](https://docs.twenty.com/user-guide/data-model/capabilities/fields), [Attio](https://attio.com/help/reference/managing-your-data/attributes/create-manage-attributes)).
- **Salesforce.** Advanced Currency Management with dated rates _(not re-verified; Salesforce Help blocked automated fetches)_.

**Good behaviours:** rates dated by the record's date; locked at close; both base and original amounts shown; manual overrides audited; the rate source disclosed.

#### 7.9 Onboarding: sample data, checklists, empty states — COMMON

**Who has it**

- **Pipedrive.** A sign-up questionnaire configures the account. Sample records are prefixed _"[Sample]"_ and tracked in Quick help; admins can remove them ([KB](https://support.pipedrive.com/en/article/sample-data)).
- **HubSpot.** Onboarding checklists with tasks and owners, and templates that can be shared across accounts ([KB](https://knowledge.hubspot.com/help-and-resources/manage-onboarding-to-do-lists-with-checklists)).
- **Close.** An onboarding checklist ([help](https://help.close.com/getting-started/onboarding-checklist-start-here)).
- **NN/g on empty states.** They should _"communicate system status, increase learnability of the system, and deliver direct pathways for key tasks"_ ([NN/g](https://www.nngroup.com/articles/empty-state-interface-design/)).

**Good behaviours:** every empty list says what belongs there and offers the primary action and an import; sample data is removable; a setup checklist shows progress; in-app help is searchable.

#### 7.10 Undo and recoverability

**Ratings:** recycle bin TABLE STAKES; undo toast COMMON; bulk rollback DIFFERENTIATOR.

**Who has it**

- **monday** ([help](https://support.monday.com/hc/en-us/articles/360011810600-How-to-undo-something)):
  - The undo button gives _"one full minute"_ after a delete, archive or move.
  - It _"will not appear for column value changes"_; those can be undone from the Activity Log, including batch actions, for 7 days.
  - Trash keeps items for 30 days.
- **Linear.** _"use `Cmd/Ctrl` `Z`"_ to restore a deleted issue; _"Recently deleted issues"_ are kept for 30 days ([docs](https://linear.app/docs/delete-archive-issues)).
- **Superhuman.** _"hit Z within 10 seconds"_; the window cannot be extended ([help](https://help.superhuman.com/hc/en-us/articles/46005666743309-Undo)).
- **HubSpot.**
  - A property edit can be undone _"for a short period"_; not for workflow or API changes ([KB](https://knowledge.hubspot.com/properties/undo-property-value-changes)).
  - The recycle bin keeps records for 90 days; GDPR deletions are not held ([KB](https://knowledge.hubspot.com/records/restore-deleted-records)).
  - **Bulk rollback** _"to a previous point within the last 14 days"_, filtered by source (manual, import, integration, workflow), property and user; Super Admin only ([KB](https://knowledge.hubspot.com/object-settings/restore-crm-changes)).
- **Pipedrive.** Bulk edits cannot be undone ([KB](https://support.pipedrive.com/en/article/bulk-editing-and-filtering)). Deleted deals can be restored for 30 days, including on a bulk "Restore data" page ([KB](https://support.pipedrive.com/en/article/how-can-i-restore-deleted-deals)).
- **Airtable.** Base trash 7 days; workspace trash 30 days ([help](https://support.airtable.com/articles/4837035377-managing-trash-in-airtable)); revision history; snapshots.
- **NN/g.** _"Support undo and redo"_ ([NN/g](https://www.nngroup.com/articles/user-control-and-freedom/)).

**Acceptance check:**

- Every destructive or bulk action shows an "Undo" toast for at least 10 s.
- Deleted records sit in a bin for at least 30 days.
- An admin can roll back "everything import X changed".

#### 7.11 Perceived speed and optimistic UI — DIFFERENTIATOR (buyers feel it immediately)

**Evidence**

- **NN/g.** 0.1 s feels instantaneous; at 1 s _"the user's flow of thought"_ survives; 10 s is the limit of attention ([NN/g](https://www.nngroup.com/articles/response-times-3-important-limits/)).
- **Superhuman.** The 100 ms rule ([blog](https://blog.superhuman.com/superhuman-is-built-for-speed/)).
- **Linear.** Built on a real-time sync engine ([blog](https://linear.app/blog/scaling-the-linear-sync-engine)).
- **Attio mobile.** _"Record and table views load around five times quicker, your data now persists between sessions"_ ([changelog](https://attio.com/changelog/2026/the-mobile-app-just-got-faster)).
- **Counter-example.** Pipedrive's list view has a manual "Refresh" button ([KB](https://support.pipedrive.com/en/article/list-view)).

**Good behaviours:** a local cache; optimistic mutations reconciled in the background; skeleton screens rather than spinners; prefetch on hover; virtualised long lists; no full-page reloads.

#### 7.12 Real-time multi-user updates — COMMON

**Who has it:** Attio (edits _"update in real-time across the platform - this also applies to the mobile app"_, [help](https://attio.com/help/reference/productivity-collaborating/real-time-updates)); Superhuman shared drafts ([help](https://help.superhuman.com/hc/en-us/articles/46005578703885-Shared-Drafts)); Front ([help](https://help.front.com/en/articles/2403)).

---

### 8. Ratings at a glance

| #    | Feature                                        | Rating                                         | The behaviour that matters most                                                 |
| ---- | ---------------------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------- |
| 1.1  | Global search across objects and activity text | TABLE STAKES                                   | Indexes notes, emails, IDs and phones; grouped and filterable; permission-aware |
| 1.2  | Recent searches and recently viewed            | TABLE STAKES                                   | Shown before typing; includes records you edited                                |
| 1.3  | ⌘K command palette                             | COMMON                                         | Every action, contextual to the selection, shows its shortcut                   |
| 1.4  | Keyboard shortcuts and `?` cheat sheet         | COMMON (desks: TABLE STAKES)                   | On by default; single-key shortcuts can be turned off (WCAG 2.1.4)              |
| 1.5  | Favourites and pins                            | TABLE STAKES                                   | Any object or view, folders, personal                                           |
| 1.6  | Quick-create from anywhere                     | COMMON                                         | One key, context pre-filled, "create another"                                   |
| 1.7  | Hover cards                                    | COMMON                                         | Key fields with no navigation                                                   |
| 2.1  | Table: columns, sort, inline edit              | TABLE STAKES                                   | Keyboard cell editing, multi-sort, freeze, paste a range                        |
| 2.2  | Board/kanban                                   | TABLE STAKES                                   | Lanes from any select field; lane totals; required-field prompt                 |
| 2.3  | Calendar view                                  | COMMON                                         | Any date field; drag to reschedule                                              |
| 2.4  | Timeline/Gantt                                 | COMMON (CRM: DIFFERENTIATOR)                   | Drag endpoints; dependencies                                                    |
| 2.5  | Gallery, map and chart views                   | DIFFERENTIATOR                                 | Charts directly on a list                                                       |
| 2.6  | Saved views with scope                         | TABLE STAKES                                   | Me / team / everyone; unsaved-changes state; defaults                           |
| 2.7  | Filter builder                                 | TABLE STAKES                                   | AND/OR groups, relative dates, known/unknown                                    |
| 2.8  | Grouping and sub-grouping                      | COMMON                                         | Swimlanes with counts and sums                                                  |
| 2.9  | Bulk select-all-matching and bulk edit         | TABLE STAKES                                   | Count, append/replace/remove, confirmation, undo                                |
| 2.10 | Column aggregates                              | COMMON                                         | Saved with the view                                                             |
| 2.11 | Conditional formatting                         | COMMON (CRM: DIFFERENTIATOR)                   | Ordered rules per view; first match wins                                        |
| 2.12 | Preview / peek / split view                    | TABLE STAKES (peek with next/previous: COMMON) | Editable; keyboard; keeps list position                                         |
| 2.13 | Spreadsheet-grade grid                         | DIFFERENTIATOR                                 | Paste a range from Excel                                                        |
| 3.1  | @mentions                                      | TABLE STAKES                                   | Warns when the person lacks access; subscribes them                             |
| 3.2  | Threads, resolve, reactions, permalinks        | COMMON                                         | Resolve and reopen; link to a comment; comment → task                           |
| 3.3  | Follow and subscribe                           | TABLE STAKES                                   | Auto-follow rules; follow a saved view; actor not notified                      |
| 3.4  | Notification inbox                             | TABLE STAKES (snooze: COMMON)                  | Act inline; archive, snooze, filter                                             |
| 3.5  | Delivery rules, batching, digests, DND         | TABLE STAKES (matrix) / COMMON (smart)         | Suppress-if-seen; batch window; digest by urgency                               |
| 3.6  | Activity timeline                              | TABLE STAKES                                   | Type/user/date filters persisted per user; search; pin                          |
| 3.7  | Field history                                  | TABLE STAKES                                   | Who, when, and source (user/workflow/import/API)                                |
| 3.8  | Shared inbox                                   | TABLE STAKES (desks) / COMMON (CRM)            | Owner and status per thread; "done" syncs to the mailbox                        |
| 3.9  | Routing and assignment                         | TABLE STAKES (desks)                           | Balanced with caps; away and reassign                                           |
| 3.10 | Presence and collision detection               | TABLE STAKES (desks) / DIFFERENTIATOR (CRM)    | Viewing vs typing, shown in list rows                                           |
| 4.1  | Tasks                                          | TABLE STAKES                                   | Linked to records; type drives the action; natural-language dates               |
| 4.2  | Reminders and digests                          | TABLE STAKES                                   | Per-task reminder plus a daily digest                                           |
| 4.3  | Recurring tasks                                | COMMON                                         | Schedule vs on-completion; explicit time zone                                   |
| 4.4  | Task queue / focus mode                        | COMMON (desks: TABLE STAKES)                   | Queue = saved view; next/skip/snooze; progress                                  |
| 4.5  | Subtasks and checklists                        | COMMON (work-mgmt: TABLE STAKES)               | Paste a list to create many                                                     |
| 4.6  | My day / agenda home                           | TABLE STAKES                                   | Due today + overdue + mentions in one place                                     |
| 4.7  | Calendar sync                                  | TABLE STAKES                                   | Two-way, multiple calendars, privacy-aware                                      |
| 4.8  | Scheduling pages                               | COMMON                                         | Round robin, buffers, time-zone detection, reschedule links                     |
| 4.9  | Meeting recording and notes                    | COMMON                                         | Consent controls; auto-linked to records                                        |
| 5.1  | Rich-text notes                                | TABLE STAKES                                   | Templates, private toggle, pin                                                  |
| 5.2  | Attachments                                    | TABLE STAKES                                   | Preview, scanning, limits stated in the error                                   |
| 5.3  | File versioning                                | DIFFERENTIATOR                                 | Promote or restore earlier versions                                             |
| 5.4  | Document library and tracked links             | COMMON                                         | View notifications; require email to view                                       |
| 5.5  | Email templates                                | TABLE STAKES                                   | Merge fields with an unfilled-placeholder warning; scopes                       |
| 5.6  | Snippets and macros                            | TABLE STAKES                                   | Inline trigger; variables; macros that also run actions                         |
| 5.7  | Record templates                               | COMMON                                         | Pre-filled create forms                                                         |
| 5.8  | E-signature                                    | COMMON                                         | Native or integrated; audit certificate; expiry                                 |
| 5.9  | Email sync and BCC logging                     | TABLE STAKES                                   | Two-way sync; privacy tiers; auto-association                                   |
| 5.10 | Email tracking and privacy                     | TABLE STAKES (sales)                           | Consent-aware; bot filtering; clicks over opens                                 |
| 5.11 | Inbox sidebar                                  | COMMON                                         | Record context inside Gmail/Outlook                                             |
| 6.1  | Custom field types                             | TABLE STAKES                                   | Typed currency, phone, relation; options with colour                            |
| 6.2  | Formula fields                                 | COMMON                                         | Cross-field and cross-object                                                    |
| 6.3  | Rollups and lookups                            | COMMON                                         | Across associations, with conditions                                            |
| 6.4  | Custom objects                                 | COMMON                                         | Full parity with standard objects                                               |
| 6.5  | Required fields and validation                 | TABLE STAKES / COMMON                          | Stage-gated; inline errors; enforced on import                                  |
| 6.6  | Conditional logic and dependent picklists      | COMMON                                         | Show or narrow fields by value                                                  |
| 6.7  | Field help text                                | COMMON                                         | Shown as a tooltip on the form                                                  |
| 6.8  | Page layouts                                   | COMMON                                         | Per team or role; sections and widgets                                          |
| 6.9  | Picklist management                            | TABLE STAKES / DIFFERENTIATOR                  | Deactivate without data loss; replace; colours; history                         |
| 7.1  | Mobile apps                                    | TABLE STAKES                                   | Core record, task and notification flows                                        |
| 7.2  | Offline                                        | COMMON (mobile)                                | Visible queue; stated conflict policy                                           |
| 7.3  | Desktop app or PWA                             | COMMON                                         | OS notifications                                                                |
| 7.4  | Dark mode                                      | TABLE STAKES                                   | System-follow; per user                                                         |
| 7.5  | Accessibility (WCAG 2.2 AA)                    | TABLE STAKES                                   | Keyboard alternatives to drag; focus never obscured                             |
| 7.6  | Localisation                                   | COMMON                                         | Per-user language and formats                                                   |
| 7.7  | Time zones                                     | TABLE STAKES                                   | Per-user setting; UTC storage; zone shown on hover                              |
| 7.8  | Multi-currency                                 | COMMON                                         | Rates dated by record and locked at close                                       |
| 7.9  | Onboarding                                     | COMMON                                         | Actionable empty states; removable sample data                                  |
| 7.10 | Undo and recycle bin and rollback              | TABLE STAKES / COMMON / DIFFERENTIATOR         | Toast ≥ 10 s; bin ≥ 30 days; rollback by source                                 |
| 7.11 | Speed and optimistic UI                        | DIFFERENTIATOR                                 | Under 100 ms for common actions                                                 |
| 7.12 | Real-time multi-user updates                   | COMMON                                         | Live updates, including mobile                                                  |

---

### 9. Top 30 features (ordered by everyday impact on staff)

1. **Global search** — TABLE STAKES — indexes notes, email subjects and bodies, IDs and phones; grouped by type; permission-aware.
2. **Saved views with private/team/everyone scope** — TABLE STAKES — unsaved-changes state, "save as new", per-user and per-team defaults.
3. **Bulk select-all-matching and bulk edit** — TABLE STAKES — shows "all N", append/replace/remove for multi-values, type-count confirmation, undoable.
4. **Inline-editable table views** — TABLE STAKES — keyboard cell navigation, multi-sort, freeze, paste a range.
5. **Record preview / peek panel** — TABLE STAKES — editable in place, next/previous without closing, keeps list position.
6. **Filter builder** — TABLE STAKES — AND/OR groups, relative dates, is known / unknown, any of / none of.
7. **@mentions** — TABLE STAKES — warn at mention time when the person can't see the record; subscribe them to the thread.
8. **Notification inbox** — TABLE STAKES — act inline (reply/approve), archive and snooze, keyboard triage.
9. **Notification delivery rules** — TABLE STAKES — type × channel matrix plus suppress-if-seen and batching (Intercom 10 s push / 3 min email).
10. **Follow / subscribe** — TABLE STAKES — owners auto-follow; follow a saved view; never notify the actor.
11. **Activity timeline** — TABLE STAKES — type/user/date filters persisted per user, search inside, one pinned item.
12. **Field history** — TABLE STAKES — who, when and source (user, workflow, import, API), restorable.
13. **Tasks linked to records** — TABLE STAKES — the task type opens the right action; natural-language due dates; defaults.
14. **My-day home** — TABLE STAKES — due today, overdue and mentions in one list, overdue first.
15. **Undo and recycle bin** — TABLE STAKES — toast of 10 s–1 min for every destructive action; bin of 30–90 days.
16. **Favourites and pins** — TABLE STAKES — records, views and searches, in folders, personal.
17. **Email templates and snippets** — TABLE STAKES — merge fields with an unfilled-placeholder warning; `#` or `/` trigger; team-shared with an owner.
18. **Calendar and email sync** — TABLE STAKES — two-way, privacy tiers (metadata-only by default), attendee → record matching.
19. **Attachments** — TABLE STAKES — paste and drag, inline preview, malware scanning, the limit named in the error.
20. **Custom fields, required fields and validation** — TABLE STAKES — typed currency, phone and relation; stage-gated requirements; enforced on import.
21. **Per-user time zone and locale** — TABLE STAKES — explicit setting (not only the OS), UTC storage, zone shown on hover.
22. **Dark mode** — TABLE STAKES — follows the system, set per user.
23. **Accessibility (WCAG 2.2 AA)** — TABLE STAKES — keyboard alternative to every drag; focus never hidden by sticky UI.
24. **⌘K command palette** — COMMON — every action, contextual to the selection, shows the direct shortcut.
25. **Keyboard shortcuts and `?` cheat sheet** — COMMON — `j`/`k`/`x`/Enter in all lists; single-key shortcuts can be switched off.
26. **Task queue / focus mode** — COMMON — a queue built from a saved view, with next/skip/snooze and an "n of N" counter.
27. **Recurring tasks** — COMMON — on schedule vs on completion, explicit time zone, edit one vs the series.
28. **Presence and collision detection** — TABLE STAKES for desks — viewing vs typing, visible in queue rows, warning before a duplicate reply.
29. **Routing and assignment** — TABLE STAKES for desks — balanced assignment with per-person caps; away status reassigns.
30. **Bulk rollback by source** — DIFFERENTIATOR — undo everything one import, workflow or user changed within N days (HubSpot: 14 days).

---

### Appendix A — Source index (295 distinct URLs)

**HubSpot Knowledge Base and community (62)**

- Search, navigation and records:
  - [global search](https://knowledge.hubspot.com/account-management/search-within-your-hubspot-account)
  - [CRM index search](https://knowledge.hubspot.com/records/search-your-crm)
  - [navigation guide](https://knowledge.hubspot.com/help-and-resources/a-guide-to-hubspots-navigation)
  - [preview a record](https://knowledge.hubspot.com/records/preview-a-record)
  - [bulk edit](https://knowledge.hubspot.com/records/bulk-edit-records)
  - [undo property changes](https://knowledge.hubspot.com/properties/undo-property-value-changes)
  - [restore deleted records](https://knowledge.hubspot.com/records/restore-deleted-records)
  - [restore CRM changes](https://knowledge.hubspot.com/object-settings/restore-crm-changes)
- Views:
  - [saved views](https://knowledge.hubspot.com/records/create-and-manage-saved-views)
  - [columns](https://knowledge.hubspot.com/records/customize-index-page-columns)
  - [quick filters](https://knowledge.hubspot.com/records/customize-quick-filters)
  - [view types](https://knowledge.hubspot.com/records/manage-index-page-types-and-tabs)
  - [board view](https://knowledge.hubspot.com/records/manage-records-in-board-view)
  - [board customisation](https://knowledge.hubspot.com/object-settings/customize-the-redesigned-board-view)
- Collaboration:
  - [mentions](https://knowledge.hubspot.com/records/mention-a-user-on-a-record)
  - [comments](https://knowledge.hubspot.com/records/comment-on-an-activity)
  - [comment emails](https://knowledge.hubspot.com/campaigns/comment-notification-emails)
  - [pin activity](https://knowledge.hubspot.com/records/pin-an-activity-on-a-record)
  - [timeline filters](https://knowledge.hubspot.com/records/filter-activities-on-a-record-timeline)
  - [follow a record](https://knowledge.hubspot.com/records/follow-a-record)
  - [notifications](https://knowledge.hubspot.com/user-management/how-to-set-up-user-notifications-in-hubspot)
  - [AI notification summary](https://knowledge.hubspot.com/account-management/summarize-notifications)
  - [activity feed](https://knowledge.hubspot.com/prospecting/view-your-sales-notifications-in-the-activity-feed)
  - [property history](https://knowledge.hubspot.com/records/view-record-property-history)
  - [help-desk routing](https://knowledge.hubspot.com/help-desk/route-tickets-in-help-desk)
  - [help-desk overview](https://knowledge.hubspot.com/help-desk/overview-of-the-help-desk-workspace)
- Tasks, calendar and meetings:
  - [create tasks](https://knowledge.hubspot.com/tasks/create-tasks)
  - [reminders and digest](https://knowledge.hubspot.com/tasks/task-reminders-and-daily-digest)
  - [task queues](https://knowledge.hubspot.com/tasks/use-task-queues)
  - [complete tasks](https://knowledge.hubspot.com/tasks/complete-tasks)
  - [subtasks](https://knowledge.hubspot.com/tasks/use-subtasks-with-objects)
  - [task calendar sync](https://knowledge.hubspot.com/tasks/sync-tasks-to-your-google-or-outlook-calendar)
  - [task views](https://knowledge.hubspot.com/tasks/filter-tasks-and-manage-task-views)
  - [prospecting queue](https://knowledge.hubspot.com/prospecting/use-the-prospecting-queue)
  - [guided execution](https://knowledge.hubspot.com/prospecting/use-guided-execution-in-the-sales-workspace)
  - [calendar sync](https://knowledge.hubspot.com/integrations/use-hubspots-integration-with-google-calendar-or-outlook-calendar)
  - [scheduling pages](https://knowledge.hubspot.com/meetings-tool/create-and-edit-scheduling-pages)
  - [Notetaker](https://knowledge.hubspot.com/meetings-tool/record-and-take-notes-in-meetings-with-meeting-notetaker)
- Email and content:
  - [BCC logging](https://knowledge.hubspot.com/connected-email/log-email-in-your-crm-with-the-bcc-or-forwarding-address)
  - [email tracking](https://knowledge.hubspot.com/connected-email/understand-hubspot-sales-email-open-and-click-tracking)
  - [deal context in Gmail](https://knowledge.hubspot.com/connected-email/view-deal-context-in-gmail)
  - [templates](https://knowledge.hubspot.com/templates/create-and-send-templates)
  - [snippets](https://knowledge.hubspot.com/conversations/use-snippets)
  - [documents](https://knowledge.hubspot.com/documents/use-documents)
  - [e-signatures](https://knowledge.hubspot.com/quotes/use-e-signatures-with-quotes)
  - [record attachments](https://knowledge.hubspot.com/records/add-and-remove-attachments-from-records)
  - [file limits](https://knowledge.hubspot.com/files/supported-file-types)
- Data model and customisation:
  - [field types](https://knowledge.hubspot.com/properties/property-field-types-in-hubspot)
  - [calculation and rollup](https://knowledge.hubspot.com/properties/create-calculation-properties)
  - [validation](https://knowledge.hubspot.com/properties/set-validation-rules-for-properties)
  - [conditional logic](https://knowledge.hubspot.com/properties/set-up-conditional-logic-for-enumeration-properties)
  - [create form / required fields](https://knowledge.hubspot.com/object-settings/set-up-fields-seen-when-manually-creating-records)
  - [custom objects](https://knowledge.hubspot.com/object-settings/create-custom-objects)
  - [record layouts](https://knowledge.hubspot.com/object-settings/customize-records)
- Experience:
  - [currencies](https://knowledge.hubspot.com/account-management/add-and-edit-your-account-currencies)
  - [language, region and time zone](https://knowledge.hubspot.com/account-management/change-your-language-and-region-settings)
  - [profile preferences](https://knowledge.hubspot.com/user-management/profile-and-preferences)
  - [language offerings](https://knowledge.hubspot.com/help-and-resources/hubspot-language-offerings)
  - [onboarding checklists](https://knowledge.hubspot.com/help-and-resources/manage-onboarding-to-do-lists-with-checklists)
  - [mobile records (no offline)](https://knowledge.hubspot.com/records/work-with-records-in-the-hubspot-mobile-app)
  - [dark mode (emails only)](https://knowledge.hubspot.com/marketing-email/optimize-marketing-emails-for-dark-mode)
  - [Ideas: Recent Items](https://community.hubspot.com/t5/HubSpot-Ideas/Recent-Items-view/idi-p/424150)

**Salesforce (14)**

- [Einstein Search](https://trailhead.salesforce.com/content/learn/modules/einstein-search-increased-productivity/get-started-einstein-search)
- [list views](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/work-with-list-views)
- [navigation](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/navigate-around)
- [records and quick view](https://trailhead.salesforce.com/content/learn/modules/lightning-experience-for-salesforce-classic-users/work-with-your-data)
- [favorites](https://admin.salesforce.com/blog/2018/pro-tip-fast-track-navigation-lightning-experience-favorites%E2%AD%90%EF%B8%8F)
- [Winter '18 mass inline edit](https://admin.salesforce.com/blog/2017/winter-18-release-overview-admins)
- [activity timeline](https://admin.salesforce.com/tailor-activity-timeline-lightning-experience-users)
- [formula fields](https://trailhead.salesforce.com/content/learn/modules/point_click_business_logic/formula_fields)
- [roll-up summary](https://trailhead.salesforce.com/content/learn/modules/point_click_business_logic/roll_up_summary_fields)
- [validation rules](https://trailhead.salesforce.com/content/learn/modules/point_click_business_logic/validation_rules)
- [picklists](https://trailhead.salesforce.com/content/learn/modules/picklist_admin/picklist_admin_manage)
- [global value sets](https://trailhead.salesforce.com/content/learn/modules/picklist_admin/picklist_admin_global)
- [page layouts and Dynamic Forms](https://trailhead.salesforce.com/content/learn/modules/lex_customization/lex_customization_page_layouts)
- [console shortcuts (TextExpander)](https://textexpander.com/blog/salesforce-keyboard-shortcuts-and-hotkeys)

**Pipedrive Knowledge Base (36)**

- Search and views:
  - [search](https://support.pipedrive.com/en/article/search-finding-what-you-need)
  - [quick actions](https://support.pipedrive.com/en/article/quick-actions-in-pipedrive)
  - [bulk edit](https://support.pipedrive.com/en/article/bulk-editing-and-filtering)
  - [list view](https://support.pipedrive.com/en/article/list-view)
  - [multi-sort](https://support.pipedrive.com/en/article/sorting-by-multiple-columns-in-list-view)
  - [filtering](https://support.pipedrive.com/en/article/filtering)
  - [favorite filters](https://support.pipedrive.com/en/article/how-can-i-favorite-filters)
  - [contextual view](https://support.pipedrive.com/en/article/activity-contextual-view)
- Collaboration and activities:
  - [mentions](https://support.pipedrive.com/en/article/mentions-and-comments-beta)
  - [notifications](https://support.pipedrive.com/en/article/notifications)
  - [followers](https://support.pipedrive.com/en/article/followers)
  - [recurring activities](https://support.pipedrive.com/en/article/recurring-activities)
  - [reminders](https://support.pipedrive.com/en/article/activity-reminder-emails)
  - [activities](https://support.pipedrive.com/en/article/activities)
  - [calendar sync](https://support.pipedrive.com/en/article/calendar-sync)
  - [scheduler](https://support.pipedrive.com/en/article/scheduler)
- Email and documents:
  - [Smart BCC](https://support.pipedrive.com/en/article/smart-email-bcc)
  - [email tracking](https://support.pipedrive.com/en/article/email-tracking)
  - [Apple/Gmail tracking caveat](https://support.pipedrive.com/en/article/email-tracking-reports-with-gmail-and-apple)
  - [templates](https://support.pipedrive.com/en/article/email-templates)
  - [Smart Docs](https://support.pipedrive.com/en/article/smart-docs)
  - [eSignatures FAQ](https://support.pipedrive.com/en/article/esignatures-faq-beta)
- Fields:
  - [field types](https://support.pipedrive.com/en/article/what-types-of-custom-fields-are-there)
  - [formula fields](https://support.pipedrive.com/en/article/custom-fields-formula-fields)
  - [required fields](https://support.pipedrive.com/en/article/required-fields)
  - [important fields](https://support.pipedrive.com/en/article/important-fields)
- Experience:
  - [currency conversion](https://support.pipedrive.com/en/article/how-is-currency-converted-in-pipedrive)
  - [mobile offline](https://support.pipedrive.com/en/article/do-the-mobile-apps-work-offline)
  - [web offline](https://support.pipedrive.com/en/article/can-pipedrive-be-used-offline)
  - [language and formats](https://support.pipedrive.com/en/article/how-can-i-change-my-language-or-date-number-format)
  - [time zone](https://support.pipedrive.com/en/article/can-i-change-my-displayed-timezone)
  - [sample data](https://support.pipedrive.com/en/article/sample-data)
  - [files](https://support.pipedrive.com/en/article/how-can-i-upload-a-file-to-a-deal-or-a-contact)
  - [restore deals](https://support.pipedrive.com/en/article/how-can-i-restore-deleted-deals)
  - [mobile focus view](https://support.pipedrive.com/en/article/focus-view-in-the-mobile-app)
  - [projects tasks](https://support.pipedrive.com/en/article/projects-tasks-and-subtasks)

**Attio (26)**

- Navigation and views:
  - [intro to navigating](https://attio.com/help/reference/attio-101/introduction-to-navigating-attio)
  - [navigating your workspace](https://attio.com/help/reference/productivity-collaborating/navigating-your-workspace)
  - [table views](https://attio.com/help/reference/managing-your-data/views/create-and-manage-table-views)
  - [filter and sort](https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views)
  - [kanban](https://attio.com/help/reference/managing-your-data/views/create-and-manage-kanban-views)
- Collaboration and productivity:
  - [comments and mentions](https://attio.com/help/reference/productivity-collaborating/comments-and-mentions)
  - [real-time updates](https://attio.com/help/reference/productivity-collaborating/real-time-updates)
  - [tasks](https://attio.com/help/reference/productivity-collaborating/tasks)
  - [notifications](https://attio.com/help/reference/account-settings/notifications)
  - [notes](https://attio.com/help/reference/productivity-collaborating/notes)
  - [call recording](https://attio.com/help/reference/productivity-collaborating/call-intelligence/recording-calls-with-attio)
- Data model:
  - [attributes](https://attio.com/help/reference/managing-your-data/attributes/create-manage-attributes)
  - [formula attributes](https://attio.com/help/reference/managing-your-data/attributes/formula-attributes)
  - [custom objects](https://attio.com/help/reference/managing-your-data/objects/create-and-manage-custom-objects)
  - [rules](https://attio.com/help/reference/managing-your-data/objects/create-and-manage-rules)
  - [record templates](https://attio.com/help/reference/managing-your-data/create-record-and-list-entry-templates)
  - [record pages](https://attio.com/help/reference/managing-your-data/records/configure-record-pages)
- Experience and email:
  - [appearance](https://attio.com/help/reference/account-settings/personalize-attios-appearance)
  - [mobile](https://attio.com/help/reference/tools-and-extensions/attio-on-mobile)
  - [email privacy](https://attio.com/help/reference/email-calendar/keep-emails-and-calendar-events-private)
- Changelog:
  - [favorites](https://attio.com/changelog/2024/pin-favorites-in-your-sidebar)
  - [comments system](https://attio.com/changelog/2023/new-comments-system)
  - [dedicated search](https://attio.com/changelog/2023/dedicated-search)
  - [command palette](https://attio.com/changelog/2023/redesigned-command-palette)
  - [files on all objects](https://attio.com/changelog/2026/files-on-deals-and-custom-objects)
  - [faster mobile](https://attio.com/changelog/2026/the-mobile-app-just-got-faster)

**Close (17)**

- [keyboard shortcuts](https://help.close.com/docs/keyboard-shortcuts)
- [inbox](https://help.close.com/feature-guide/inbox)
- [tasks](https://help.close.com/feature-guide/tasks)
- [power dialer](https://help.close.com/feature-guide/power-predictive-dialing/using-the-power-dialer)
- [smart views](https://help.close.com/feature-guide/lead-filtering-and-smart-views/creating-smart-views)
- [smart view calculations](https://help.close.com/feature-guide/lead-filtering-and-smart-views/calculations-in-smart-views)
- [scheduling links](https://help.close.com/feature-guide/scheduling-links)
- [custom fields](https://help.close.com/feature-guide/custom-fields)
- [custom objects](https://help.close.com/feature-guide/custom-objects)
- [Notetaker](https://help.close.com/feature-guide/notetaker)
- [account settings / appearance](https://help.close.com/account-management/account-settings)
- [date formats](https://help.close.com/technical-support/date-and-time-formats)
- [mobile app](https://help.close.com/getting-started/close-mobile-app)
- [desktop app](https://help.close.com/getting-started/desktop-app)
- [onboarding checklist](https://help.close.com/getting-started/onboarding-checklist-start-here)
- [round robin](https://help.close.com/best-practices/simplify-your-workflows-with-automated-senders/new-assign-leads-to-users-via-round-robin)
- [mentions and comments changelog](https://close.com/changelog/mentions-and-comments)

**Linear (17)**

- [search](https://linear.app/docs/search)
- [navigating guide](https://linear.app/enablement/guides/navigating-linear)
- [peek](https://linear.app/docs/peek)
- [display options](https://linear.app/docs/display-options)
- [custom views](https://linear.app/docs/custom-views)
- [inbox](https://linear.app/docs/inbox)
- [notifications](https://linear.app/docs/notifications)
- [select issues](https://linear.app/docs/select-issues)
- [delete and archive](https://linear.app/docs/delete-archive-issues)
- [comments](https://linear.app/docs/comment-on-issues)
- [account preferences](https://linear.app/docs/account-preferences)
- [get the app](https://linear.app/docs/get-the-app)
- [favorites](https://linear.app/docs/favorites)
- [sub-issues](https://linear.app/docs/parent-and-sub-issues)
- [due dates](https://linear.app/docs/due-dates)
- [creating issues](https://linear.app/docs/creating-issues)
- [sync engine](https://linear.app/blog/scaling-the-linear-sync-engine)

**Superhuman (11)**

- [command palette](https://blog.superhuman.com/how-to-build-a-remarkable-command-palette/)
- [100 ms rule](https://blog.superhuman.com/superhuman-is-built-for-speed/)
- [read statuses blog](https://blog.superhuman.com/read-statuses/)
- [undo](https://help.superhuman.com/hc/en-us/articles/46005666743309-Undo)
- [read statuses](https://help.superhuman.com/hc/en-us/articles/46005603745293-Read-Statuses-and-Recent-Opens-Feed)
- [snippets](https://help.superhuman.com/hc/en-us/articles/46005686571149-Snippets)
- [remind me](https://help.superhuman.com/hc/en-us/articles/46005666142733-Remind-Me)
- [offline](https://help.superhuman.com/hc/en-us/articles/46005499629325-Offline-Access)
- [shared drafts](https://help.superhuman.com/hc/en-us/articles/46005578703885-Shared-Drafts)
- [split inbox](https://help.superhuman.com/hc/en-us/articles/46005619081101-Default-Split-Inbox)
- [share availability](https://help.superhuman.com/hc/en-us/articles/46005575115021-Share-Availability)

**Zendesk (12)**

- [keyboard shortcuts](https://support.zendesk.com/hc/en-us/articles/4408832849946-Viewing-and-deactivating-keyboard-shortcuts)
- [new shortcuts](https://support.zendesk.com/hc/en-us/articles/9285444325914-Announcing-new-keyboard-shortcuts-in-Agent-Workspace)
- [dark mode](https://support.zendesk.com/hc/en-us/articles/4408830934938-Is-there-a-dark-mode-for-Zendesk-Support)
- [attachments](https://support.zendesk.com/hc/en-us/articles/4408832757146-Allowing-attachments-in-tickets)
- [accessibility](https://support.zendesk.com/hc/en-us/articles/4408838287514-Making-Zendesk-products-accessible)
- [CCs and followers](https://support.zendesk.com/hc/en-us/articles/4408822451482-Using-CCs-and-followers)
- [managing views](https://support.zendesk.com/hc/en-us/articles/4408832792986-Managing-your-views)
- [views improvements](https://support.zendesk.com/hc/en-us/articles/6059161161498-Announcing-improvements-to-the-views-experience-in-Support)
- [views limitation thread](https://support.zendesk.com/hc/en-us/community/posts/4409217537050-Views-limitation)
- [agent collision](https://support.zendesk.com/hc/en-us/articles/4408825035674-Troubleshooting-agent-collision-in-Play-mode)
- [time zones](https://support.zendesk.com/hc/en-us/articles/4408821092762-Which-time-zone-does-Zendesk-use)
- [guided mode](https://support.zendesk.com/hc/en-us/articles/4408825479066-Setting-up-Guided-mode)

**Intercom (8)**

- [Command-K](https://www.intercom.com/help/en/articles/6272267-how-to-use-command-k-with-intercom-inbox)
- [snooze](https://www.intercom.com/help/en/articles/6564538-snooze-a-conversation)
- [notifications](https://www.intercom.com/help/en/articles/187-how-teammates-get-notifications)
- [macros](https://www.intercom.com/help/en/articles/6584504-using-macros-in-the-inbox)
- [teammate status](https://www.intercom.com/help/en/articles/6522874-manage-teammate-inbox-status)
- [workload management](https://www.intercom.com/help/en/articles/6560715-workload-management-explained)
- [round robin](https://www.intercom.com/help/en/articles/6512504-assign-conversations-evenly-using-round-robin)
- [presence feature request](https://community.intercom.com/ideas/feature-request-real-time-agent-presence-indicator-12772)

**Front and Help Scout (3)**

- [Front collision detection](https://help.front.com/en/articles/2403)
- [Front load balancing](https://help.front.com/t/x102m8)
- [Help Scout collaboration](https://docs.helpscout.com/article/1583-collaborate-with-your-team-in-the-inbox)

**Notion (16)**

- [search](https://www.notion.com/help/search)
- [views, filters and sorts](https://www.notion.com/help/views-filters-and-sorts)
- [comments](https://www.notion.com/help/comments-mentions-and-reminders)
- [reminders](https://www.notion.com/help/reminders)
- [notification settings](https://www.notion.com/help/notification-settings)
- [inbox](https://www.notion.com/help/updates-and-notifications)
- [offline](https://www.notion.com/help/use-pages-offline)
- [files](https://www.notion.com/help/images-files-and-media)
- [database templates](https://www.notion.com/help/database-templates)
- [sub-items](https://www.notion.com/help/tasks-and-dependencies)
- [layouts](https://www.notion.com/help/layouts)
- [languages](https://www.notion.com/help/change-your-language)
- [shortcuts](https://www.notion.com/help/keyboard-shortcuts)
- [database properties](https://www.notion.com/help/database-properties)
- [relations and rollups](https://www.notion.com/help/relations-and-rollups)
- [AI meeting notes](https://www.notion.com/help/ai-meeting-notes)

**Asana (4)**

- [inbox](https://asana.com/features/project-management/inbox)
- [my tasks](https://asana.com/features/project-management/my-tasks)
- [tasks](https://asana.com/features/project-management/tasks)
- [project views](https://asana.com/features/project-management/project-views)

**ClickUp (10)**

- [views](https://help.clickup.com/hc/en-us/articles/6329880717719-Intro-to-views)
- [offline](https://help.clickup.com/hc/en-us/articles/6308895791127-Offline-Mode)
- [inbox](https://help.clickup.com/hc/en-us/articles/33947959867543-What-is-the-Inbox)
- [storage](https://help.clickup.com/hc/en-us/articles/33463620625559-Workspace-storage-limits)
- [recurring](https://help.clickup.com/hc/en-us/articles/6309885016471-Use-recurring-tasks)
- [shortcuts](https://help.clickup.com/hc/en-us/articles/6309030550167-Use-keyboard-shortcuts)
- [dark mode](https://help.clickup.com/hc/en-us/articles/6309134405655-Dark-Mode)
- [field types](https://help.clickup.com/hc/en-us/articles/6303499162647-Custom-Field-types)
- [favorites](https://help.clickup.com/hc/en-us/articles/6308862167575-Favorites)
- [connected search](https://help.clickup.com/hc/en-us/articles/14642390285463-Connected-Search)

**monday.com (12)**

- [undo](https://support.monday.com/hc/en-us/articles/360011810600-How-to-undo-something)
- [offline](https://support.monday.com/hc/en-us/articles/360017712819-Mobile-app-Offline-Mode)
- [file versioning](https://support.monday.com/hc/en-us/articles/360021698980-File-versioning)
- [files](https://support.monday.com/hc/en-us/articles/115005339505-How-to-manage-files-in-monday-com)
- [conditional coloring](https://support.monday.com/hc/en-us/articles/360015468399-Conditional-Coloring)
- [themes](https://support.monday.com/hc/en-us/articles/360017414139-monday-com-display-themes-light-dark-and-night-mode)
- [languages](https://support.monday.com/hc/en-us/articles/360003503760-Available-languages-for-monday-com)
- [updates section](https://support.monday.com/hc/en-us/articles/115005900249-The-Updates-Section)
- [notifications](https://support.monday.com/hc/en-us/articles/360001292545-Notifications-explained)
- [board views](https://support.monday.com/hc/en-us/articles/360001267945-The-board-views)
- [subitems](https://support.monday.com/hc/en-us/articles/29810815287570-Multiple-levels-of-subitems-on-monday-com)
- [favorites](https://support.monday.com/hc/en-us/articles/360009142179-The-favorites-section)

**Airtable (12)**

- [record coloring](https://support.airtable.com/docs/record-coloring-in-airtable)
- [attachments](https://support.airtable.com/articles/9139007724-attachment-fields-in-airtable)
- [comments](https://support.airtable.com/articles/1999477400-commenting-in-airtable)
- [notifications](https://support.airtable.com/articles/8089803354-managing-airtable-notifications)
- [revision history](https://support.airtable.com/articles/3516802427-record-level-revision-history-in-airtable)
- [trash](https://support.airtable.com/articles/4837035377-managing-trash-in-airtable)
- [snapshots](https://support.airtable.com/articles/2163132802-taking-and-restoring-snapshots-in-airtable)
- [accessibility](https://support.airtable.com/articles/2203617073-accessibility-in-airtable)
- [time zones](https://support.airtable.com/articles/7730575816-timezones-and-locales-in-airtable)
- [record templates](https://support.airtable.com/articles/9772992207-using-record-templates-in-airtable)
- [views](https://support.airtable.com/docs/getting-started-with-airtable-views)
- [rollups](https://support.airtable.com/articles/7497685062-rollup-field-overview)

**Zoho CRM (4)**

- [complete feature list](https://www.zoho.com/crm/complete-feature-list.html)
- [team collaboration](https://www.zoho.com/crm/team-collaboration.html)
- [mobility](https://www.zoho.com/crm/mobility.html)
- [layout rules video](https://www.zoho.com/crm/resources/videos/how-to-videos/layout-rules.html)

**Freshsales (4)**

- [currency rates](https://crmsupport.freshworks.com/support/solutions/articles/50000002419-how-are-automatic-currency-conversion-rates-fetched-)
- [required fields](https://crmsupport.freshworks.com/support/solutions/articles/50000002404-what-is-a-required-field-how-to-make-a-field-required-)
- [custom modules](https://crmsupport.freshworks.com/support/solutions/articles/50000002401-what-are-custom-modules-how-to-add-a-new-module-)
- [deal views](https://crmsupport.freshworks.com/support/solutions/articles/50000002388-deals-table-and-card-views)

**Copper (5)**

- [Gmail extension](https://support.copper.com/en/articles/8823284-how-to-use-the-chrome-extension-in-gmail)
- [open tracking](https://support.copper.com/en/articles/8823289-email-open-tracking)
- [task calendar sync](https://support.copper.com/en/articles/8823267-syncing-tasks-to-google-calendar)
- [bulk edit](https://support.copper.com/en/articles/8823245-bulk-edit-records)
- [feed](https://support.copper.com/en/articles/10683406-using-the-copper-feed)

**Folk (10)**

- [shortcuts](https://help.folk.app/en/articles/5007580-what-are-folk-shortcuts)
- [views](https://help.folk.app/en/articles/4998224-create-views)
- [notifications](https://help.folk.app/en/articles/8249797-notifications-center)
- [limits](https://help.folk.app/en/articles/8632488-what-are-folk-hard-limits)
- [notes](https://help.folk.app/en/articles/5007332-adding-notes)
- [email sharing](https://help.folk.app/en/articles/6416668-share-interactions-with-your-team)
- [scheduling](https://help.folk.app/en/articles/9818766-how-to-connect-scheduling-tools-folk-calendly-cal-com)
- [e-signature](https://help.folk.app/en/articles/9886465-how-to-connect-folk-to-e-signature-tools-docusign-or-yousign)
- [calculated fields](https://help.folk.app/en/articles/13859660-calculated-fields)
- [desktop app](https://help.folk.app/en/articles/8062551-download-folk-desktop-app)

**Twenty (6)**

- [layout](https://docs.twenty.com/user-guide/layout/overview)
- [fields](https://docs.twenty.com/user-guide/data-model/capabilities/fields)
- [experience settings](https://docs.twenty.com/user-guide/settings/capabilities/experience-settings)
- [book meetings](https://docs.twenty.com/user-guide/calendar-emails/how-tos/can-i-book-meetings-from-twenty)
- [mailbox](https://docs.twenty.com/user-guide/calendar-emails/capabilities/mailbox)
- [shared inbox](https://docs.twenty.com/user-guide/calendar-emails/how-tos/forward-a-shared-inbox-from-google-workspace)

**Height (1)**

- [shutdown notice (archived)](https://web.archive.org/web/20251008182722/https://height.app/)

**Standards and UX research (5)**

- [NN/g response times](https://www.nngroup.com/articles/response-times-3-important-limits/)
- [NN/g user control and freedom](https://www.nngroup.com/articles/user-control-and-freedom/)
- [NN/g empty states](https://www.nngroup.com/articles/empty-state-interface-design/)
- [W3C WCAG 2.2 new criteria](https://www.w3.org/WAI/standards-guidelines/wcag/new-in-22/)
- [W3C SC 2.1.4 character key shortcuts](https://www.w3.org/WAI/WCAG21/Understanding/character-key-shortcuts.html)

### Appendix B — Not verified in this pass

- **Salesforce:** notification builder, Chatter follow limits, mobile offline (Briefcase), Files size limits, Advanced Currency Management dated rates, recurring tasks, and the official keyboard-shortcut list. Salesforce Help and developer docs returned 403.
- **G2 category qualification requirements** for CRM, help desk and shared inbox (403). The same block applied to Capterra, GetApp, TrustRadius and Software Advice buyer guides.
- **Asana:** recurring tasks and snooze details. The help centre is behind an authenticated portal; only Asana's feature pages were readable.
- **Zendesk** current sidebar view caps (the announcement requires sign-in).

# §D. Insight and revenue operations (the full report)

## Insight and revenue operations: what every serious CRM has

Research brief D for HQ, the Quantify Terminal staff portal (CRM, support desk, revenue and team administration). Gathered 2026-10-03.

**Question.** Which insight and revenue-operations features are mandatory in modern business software — CRMs and the SaaS around them — and what separates a good implementation from a weak one?

**Products covered.** HubSpot, Salesforce, Pipedrive, Attio, Close, Zoho CRM (Zia), Freshsales (Freddy), Copper and monday.com CRM as the CRMs; Gong and Clari (now part of Salesloft) for forecasting; ChartMogul, Baremetrics, ProfitWell (Paddle), Chargebee, Recurly, Zoho Billing and Stripe Billing for subscription metrics and billing; Zendesk, Intercom, Freshdesk, Help Scout, Front, Zoho Desk and Salesforce Service Cloud for support analytics; Gainsight and ChurnZero for customer health; Geckoboard as the wall-screen reference.

**Ratings.**

- **TABLE STAKES** — nearly every product has it; a buyer assumes it and notices its absence.
- **COMMON** — many products have it, often on mid or upper tiers.
- **DIFFERENTIATOR** — few have it; it wins evaluations rather than being assumed.

Where a feature has a basic form and an advanced form, both ratings are given (for example "weighted forecast: TABLE STAKES; snapshot-based forecast accuracy: DIFFERENTIATOR").

**Method and evidence.** Official help centres, documentation, pricing and limits pages first; then analyst summaries, category definitions (G2), buyer guides and surveys. Short quotations are taken from the cited page (see the fidelity note under "Gaps in the evidence"). Limits and prices are as served on 2026-10-03 and change often; tier names are the vendors' own. Each feature follows the same pattern: (a) what it is, (b) who has it, with sources, (c) what separates good from weak, (d) rating.

**Gaps in the evidence.** Salesforce's help site renders in JavaScript, so several Salesforce facts come from its official PDF guides, Trailhead and labelled third-party pages. Gartner, G2's category pages, TechRepublic and Forbes Advisor refused automated access; G2's entry rules come from G2's own learn.g2.com articles, the G2 CRM Grid Report PDF, or search extracts (labelled). monday.com's help centre and Pipedrive's (after a few articles) refused or rate-limited requests, so some monday and Pipedrive cells are marked unverified. "Unverified" means no primary evidence was found either way, not that the product lacks the feature. The session's web-search allowance ran out early, so most evidence was gathered by fetching vendor documentation directly (help-centre navigation and search, `llms.txt` indexes, sitemaps); cited URLs were fetched, and the few known only from search-result text are labelled as such. Pages are fetched through a tool that condenses them: Stripe pages came back in full, so Stripe quotations are exact, while other quotations were extracted from condensed pages and should be treated as close to the source wording rather than guaranteed character-for-character.

**How to use this against HQ.** Each "(c) Good versus weak" list is written as a set of testable behaviours. The quickest gap analysis is to take the top-30 table below and, for each row, ask whether HQ has the feature at all, and then whether it has the specific behaviour named in the last column.

### The top 30 at a glance

The rating column follows the legend above; where two ratings are given, the first is the basic form and the second the advanced form. The last column is the single behaviour most worth checking in HQ.

| #   | Feature                                                                      | Rating                                               | The behaviour that matters most                                                                                                                                           | Section       |
| --- | ---------------------------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| 1   | Custom dashboards built from saved-report tiles                              | TABLE STAKES                                         | One report reused on many dashboards, 20-50 tiles, an "as of" stamp on every tile, change history and restore                                                             | 1.1, 1.6      |
| 2   | Dashboard sharing that never widens data access                              | TABLE STAKES / DIFFERENTIATOR (run-as)               | A viewer only ever sees rows they could see anyway; any "run as" is explicit, admin-only and logged                                                                       | 1.2           |
| 3   | Dashboard-level filters (date range, owner, team, pipeline)                  | COMMON                                               | Documented precedence over tile filters, saved defaults, and the same filters applied to emailed and exported copies                                                      | 1.3           |
| 4   | Drill-down from any number to the records behind it                          | TABLE STAKES / DIFFERENTIATOR (act on them)          | Same filters, same count as the tile, permission-checked, and bulk-actionable (reassign, edit, add to list)                                                               | 1.7           |
| 5   | Scheduled report delivery and threshold alerts                               | COMMON / DIFFERENTIATOR                              | Recipient-scoped data, CSV plus PDF, a capture time in the email, and condition-based sends (Salesforce allows up to 5 AND conditions)                                    | 1.4           |
| 6   | Report builder: single and cross-object, formulas, period comparison, export | TABLE STAKES / COMMON                                | KPI, table, pivot, bar, line and funnel; median and distinct count; ratios computed from summed parts; published row caps                                                 | 2.1-2.6       |
| 7   | Pipeline by stage, weighted and unweighted, with coverage                    | TABLE STAKES                                         | A deal-level probability that overrides the stage default and recomputes existing deals when stage probabilities change                                                   | 3.1           |
| 8   | Stage funnel built from stage history                                        | TABLE STAKES / DIFFERENTIATOR (documented rules)     | Written rules for skipped stages and backward moves, and a choice of created-cohort or active-in-period windows (Close's model)                                           | 3.2           |
| 9   | Win/loss analysis                                                            | TABLE STAKES                                         | Win rate defined as won ÷ (won + lost), plus a required, admin-curated lost-reason picklist reported by stage and rep                                                     | 3.3, 3.9      |
| 10  | Cycle length, time in stage and stale-deal flags                             | TABLE STAKES / COMMON                                | Cumulative and latest time-in-stage kept separately; per-stage rot thresholds with documented reset rules                                                                 | 3.4, 3.5      |
| 11  | Rep performance: activity reports, leaderboards, goals and quotas            | TABLE STAKES / COMMON                                | Activity captured automatically and tied to outcomes; team targets that roll up automatically, with pace alerts mid-period                                                | 3.6, 3.7      |
| 12  | Forecasting with categories, roll-ups, adjustments and submissions           | COMMON (weighted forecast: TABLE STAKES)             | Manager adjustments layered over an untouched gross number, a weekly submission lock, and forecast-versus-actual accuracy                                                 | 3.8           |
| 13  | Point-in-time snapshots and pipeline waterfall                               | DIFFERENTIATOR                                       | Snapshots stored from day one so "pipeline as of 1 September" is answerable; point-in-time reports filter on point-in-time values                                         | 3.12          |
| 14  | Source attribution                                                           | TABLE STAKES (source) / DIFFERENTIATOR (multi-touch) | An immutable original source plus latest source on every record, with won revenue reported back to source                                                                 | 3.10          |
| 15  | MRR and ARR with written normalisation rules                                 | TABLE STAKES                                         | Documented, configurable treatment of trials, discounts, tax, refunds, past-due and the FX date (the same data gives different MRR in Stripe, ChartMogul and Baremetrics) | 4.1           |
| 16  | MRR movement bridge (new, expansion, contraction, churn, reactivation, FX)   | TABLE STAKES                                         | Movements classified per customer from a stored movement log, reconciling exactly, each bar drilling to the invoices behind it                                            | 4.2           |
| 17  | Retention: logo and revenue churn, NRR, GRR, cohorts                         | TABLE STAKES / COMMON (GRR)                          | The formula and denominator shown on the chart, reactivation treatment stated, logo and revenue churn side by side                                                        | 4.3, 4.5      |
| 18  | Dunning and payment recovery                                                 | TABLE STAKES                                         | Decline-aware retries, a configurable end state, pre-dunning (expiring cards), and recovered revenue by method; Stripe does not retry India-issued cards                  | 4.8           |
| 19  | Renewals worklist and committed forecast                                     | COMMON / DIFFERENTIATOR                              | Renewals due (7 days for monthly plans, 45 for annual) and scheduled cancellations visible with an owner before they hit MRR                                              | 4.6           |
| 20  | Customer health score                                                        | COMMON                                               | Explainable components, missing data handled by re-weighting rather than scoring zero, and an alert to the owner when status changes                                      | 8.1           |
| 21  | Support volume, backlog and time metrics                                     | TABLE STAKES                                         | Bots and auto-replies excluded, business hours applied per schedule, first versus full resolution, and daily backlog snapshots                                            | 5.1, 5.2, 5.4 |
| 22  | SLA policies and attainment                                                  | TABLE STAKES (mid tier)                              | Per-priority targets including next reply, chosen pause statuses, holiday calendars, minute-level breach warnings, and a stated attainment denominator                    | 5.3           |
| 23  | CSAT (and NPS/CES) tied to tickets                                           | TABLE STAKES / COMMON                                | Explicit attribution rule, response rate reported beside the score, and a reason capture plus reopen or alert on a bad rating                                             | 5.5           |
| 24  | Workflow automation                                                          | TABLE STAKES                                         | Run logs with retention, retries and alerts on failure, re-enrolment rules and loop guards, drafts and versions                                                           | 6.5           |
| 25  | Lead and ticket routing                                                      | TABLE STAKES / DIFFERENTIATOR (capacity-aware)       | Criteria first, then rotation that skips unavailable people, respects caps, and records why an owner was chosen                                                           | 6.2           |
| 26  | Sequences and cadences                                                       | TABLE STAKES                                         | Sent from the rep's mailbox with per-sender caps and send windows, auto-exit on reply, meeting, bounce or unsubscribe                                                     | 6.4           |
| 27  | Web forms                                                                    | TABLE STAKES                                         | Update-on-match deduplication, hidden UTM and first-touch fields, invisible CAPTCHA, consent, routing on submit                                                           | 6.10          |
| 28  | AI record summaries and drafting                                             | TABLE STAKES                                         | Summaries cite the activities they used and respect permissions; drafts never send without approval by default                                                            | 7.1, 7.3      |
| 29  | Explainable AI scores and "ask your data"                                    | COMMON                                               | Scores show signed top factors, history and whether they are a probability or a rank; questions produce an editable, saveable report                                      | 7.5, 7.7      |
| 30  | AI governance and metered-spend controls                                     | TABLE STAKES                                         | A published no-training or opt-out statement, per-feature switches, spend caps with alerts, and a precise billable-outcome definition for AI agents                       | 7.10, 7.11    |

**Just outside the top 30** (all covered below): quotes with price books and e-signature (COMMON), discount approvals (DIFFERENTIATOR), territories (DIFFERENTIATOR), lead scoring with fit and engagement axes (COMMON), enrichment with per-field provenance (COMMON), call recording and transcription (COMMON), invoices, credit notes and a self-serve billing portal (TABLE STAKES for billing tools), revenue recognition (DIFFERENTIATOR for a CRM — link out instead), support AI agents with resolution reporting (TABLE STAKES for support desks), live agent workload views (COMMON), AI topic clustering (DIFFERENTIATOR), metric anomaly detection (DIFFERENTIATOR), public dashboard links and TV mode (DIFFERENTIATOR), and managed warehouse sync (COMMON).

### 1. Dashboards

#### 1.1 Custom dashboards built from report tiles

**(a) What it is.** A grid of tiles, most of them saved reports, some KPI numbers, text notes or embeds. Every tier caps how many dashboards you get and how many tiles fit on one.

**(b) Who has it.**

- **HubSpot** — every plan. Sales Hub and Service Hub: Starter "10 dashboards, 50 reports per dashboard", Professional 30, Enterprise 75; Marketing Hub Starter 30, Professional 75, Enterprise 100; the count is account-wide and "based on the highest subscription tier your account has" ([HubSpot product & services catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)). Tiles can be reports, text or image notes, or external content (Google Sheets, YouTube); notes count towards the per-dashboard limit. A History tab shows "changes made, the users who made the changes, and the timestamps", and restoring a deleted dashboard also restores reports "deleted in the last 14 days" ([HubSpot: manage dashboards](https://knowledge.hubspot.com/reports/manage-your-dashboards); [customize dashboards](https://knowledge.hubspot.com/dashboard/customize-your-dashboards)).
- **Salesforce** — "Each dashboard can have up to 25 widgets, including a maximum of 20 charts and tables, 3 images, and 25 rich text widgets"; "Each widget has one source report"; a table widget can "Show up to 200 records and 10 columns"; "A dashboard widget can calculate up to 1,000 groupings" ([Salesforce reports & dashboards limits](https://help.salesforce.com/s/articleView?id=rd_reports_dashboards_limits.htm&language=en_US&type=5); [build a dashboard](https://help.salesforce.com/s/articleView?id=analytics.dashboards_create_lex.htm&language=en_US&type=5)).
- **Pipedrive** — "You can have a maximum of 25 reports per dashboard"; "Only Premium and higher plans can create multiple dashboards"; reports per user: Lite 15, Growth 30, Premium 250, Ultimate 500 ([Pipedrive dashboards](https://support.pipedrive.com/en/article/insights-dashboards); [usage limits](https://support.pipedrive.com/article/usage-limits-in-pipedrive)).
- **Attio** — dashboards "Available on all plans"; report quotas Free "Up to 3 reports", Plus 15, Pro 100 ([Attio dashboards](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/dashboards); [Attio pricing](https://attio.com/pricing)).
- **Zoho CRM** — "You can add a maximum of 20 components to a dashboard"; custom dashboards Standard 3, Professional 10, Enterprise and Ultimate unlimited; funnels, target meters, comparators, cohorts and quadrants from Enterprise ([Zoho analytical components](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/analytical-components); [Zoho edition comparison](https://www.zoho.com/crm/comparison.html)).
- **Freshsales** — every plan including Free; "A Maximum of 10 widgets can be added to a report" (Freshsales analytics "reports" are the dashboard canvas) ([Freshsales analytics intro](https://crmsupport.freshworks.com/support/solutions/articles/50000003034-introduction-to-analytics)).
- **Copper** — "Business only. Trials do not have Reports access"; soft cap: "keep the total number of KPIs and Insights on a single dashboard below 16 to avoid delays in computation" ([Copper custom reports FAQ](https://support.copper.com/en/articles/8823388-custom-reports-frequently-asked-questions)).
- **monday CRM** — Basic "1 custom dashboard", Standard 5, Pro 50, Ultimate unlimited ([monday CRM pricing](https://monday.com/crm/pricing)); work-management plans cap boards per dashboard (1, 5, 20, 50) ([monday pricing](https://monday.com/pricing)).
- **Close** — no documented dashboard canvas: fixed reports (Activity Overview, Activity Comparison, Opportunity Funnels, Status Change, Sent Email) plus Explorer custom charts, which are "available only on the Scale or Enterprise (legacy) plan" ([Close help index](https://help.close.com/llms.txt); [Close Explorer](https://help.close.com/feature-guide/reports/explorer.md)).

**(c) Good versus weak.** Good: tiles of several kinds (chart, KPI number, table, note, embed); one report reused on many dashboards; clone and templates; per-user default dashboard; caps of 20-50 tiles with performance guidance (Copper's 16); change history and soft-delete restore (HubSpot). Weak: one dashboard on lower tiers (Pipedrive below Premium, monday Basic); a 10-tile cap (Freshsales); no canvas at all (Close).

**(d) Rating: TABLE STAKES.** Eight of nine CRMs.

#### 1.2 Dashboard sharing, permissions and "whose data does the viewer see"

**(a) What it is.** Private, team and shared dashboards; view versus edit rights; and — the subtle part — whether a viewer sees the data _they_ are allowed to see or the data the _owner_ can see.

**(b) Who has it.**

- **HubSpot** — "Private to owner", Everyone (view and edit, or view only), and "Assign teams and users (Enterprise only)". The key rule: "Dashboard access does not override individual report sharing, report folder permissions, or the data permissions required by each report" ([HubSpot: manage dashboards](https://knowledge.hubspot.com/reports/manage-your-dashboards)); reports likewise do not override "CRM record, data source, or field permissions" ([HubSpot reports list](https://knowledge.hubspot.com/reports/manage-reports-in-your-reports-list)).
- **Salesforce** — folder access is Viewer, Editor or Manager, and a new folder "is accessible only to you and to users with administrative permissions, until you share it" ([Salesforce folder access](https://help.salesforce.com/s/articleView?id=analytics.analytics_folder_access.htm&language=en_US&type=5)). "View Dashboard As" chooses Me, another person, or the viewer; the last is a _dynamic dashboard_ that "changes based on the viewer's privileges" ([View Dashboard As](https://help.salesforce.com/s/articleView?id=analytics.dashboards_view_as.htm&language=en_US&type=5)). Dynamic dashboards are capped at 5 (Enterprise), 10 (Unlimited/Performance), 3 (Developer); they cannot be scheduled for refresh or subscribed to ([dynamic dashboards](https://help.salesforce.com/s/articleView?id=analytics.dashboards_dynamic_overview.htm&language=en_US&type=5)). The warning for fixed run-as dashboards: viewers can get "access to more data than they normally have... viewers could see personally identifiable information (PII)" ([considerations](https://help.salesforce.com/s/articleView?id=analytics.dashboards_view_as_considerations.htm&language=en_US&type=5)).
- **Pipedrive** — share with "everyone, selected users or teams"; a Viewer can "see and filter the dashboard, but not make changes"; an Editor can "modify dashboard layout, add or remove reports, and share it"; editor rights and ownership transfer need Premium ([Pipedrive shareable insights](https://support.pipedrive.com/en/article/shareable-insights)).
- **Attio** — Full access, Read and write, Read only, No access; "A member's access is based on the most permissive setting that applies to them" and team settings "cannot reduce" the workspace default; not on Free ([Attio dashboards](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/dashboards)).
- **Zoho CRM** — Only me, All users, or Custom (users, roles and subordinates, groups); "Locked dashboards can be modified only by the dashboard creator and CRM admins" ([Zoho: create dashboard](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/create-dashboard)).
- **Freshsales** — share with "Users, Teams, or Territories" at View, Edit, Manage or Owner ([Freshsales: share reports](https://crmsupport.freshworks.com/support/solutions/articles/50000003035-how-to-share-reports-)).
- **Copper** — by default "Only Admins and Account Owners can access the Reports section"; permission changes take effect at the next data refresh and can take up to 24 hours ([Copper report access](https://support.copper.com/en/articles/8823380-custom-reports-user-access-to-custom-reports)).
- **Close** — saved reports have private or shared permissions; deleting a shared view "will delete it for everyone in the organization" ([Close reports](https://help.close.com/feature-guide/reports.md)).

**(c) Good versus weak.** Good: a clear, testable answer to "whose data is this tile?" — HubSpot enforces the viewer's own permissions, Freshsales scopes emailed reports to the recipient, Salesforce makes the owner choose a running user and warns about PII; "can open the dashboard" is separate from "can see the rows"; team-scoped view/edit/manage; locking; ownership transfer; protection against one person deleting a shared asset. Weak: access that can only be widened (Attio); team restriction only on top tiers (HubSpot Enterprise, Pipedrive Premium); permission changes that lag by hours (Copper); a fixed running user that silently widens access, including in emailed copies. For a fintech the safe default is viewer-scoped data, with any "run as" setting admin-only and logged.

**(d) Rating: TABLE STAKES** for shared dashboards with view and edit rights; **COMMON** for team-restricted access; **DIFFERENTIATOR** for an explicit run-as or per-viewer data model (Salesforce dynamic dashboards, capped at 3-10 per org, raised only through extra licences).

#### 1.3 Dashboard-level filters

**(a) What it is.** Filters set once on the dashboard — date range, owner, team, pipeline — that apply to every tile.

**(b) Who has it.**

- **HubSpot** (all plans) — date range, owners, teams and property filters; "You can add up to 5 quick filters to a dashboard"; precedence: "if a report level filter matches a dashboard level filter, then the dashboard level filter takes precedence", otherwise filters combine with AND; date filters "do not affect Date entered [stage name] properties"; filters are "saved in your current browser session" and "will only apply for the user that applied them" ([HubSpot dashboard filters](https://knowledge.hubspot.com/dashboards/use-dashboard-filters)).
- **Salesforce** — "each dashboard can have up to 5 filters", each with up to 50 values ("no further increases are available") ([Salesforce KB 000387285](https://help.salesforce.com/s/articleView?id=000387285&language=en_US&type=1)); "Filters aren't applied in dashboard subscription emails" or scheduled refreshes; URL parameters fv0-fv2 pre-set filters for deep links, one value each ([filters overview](https://help.salesforce.com/s/articleView?id=analytics.dashboard_filters_overview.htm&language=en_US&type=5); [filter by URL](https://help.salesforce.com/s/articleView?id=analytics.dashboards_filter_url.htm&language=en_US&type=5)).
- **Pipedrive** — "Period" and "User"; "Using filters in your dashboard doesn't change the data contained in the reports, just the data being shown"; goal tiles ignore them ([Pipedrive dashboards](https://support.pipedrive.com/en/article/insights-dashboards)).
- **Zoho CRM** — "A maximum of two fields can be selected as component filter fields", 25 values each, User/Date/Picklist ([Zoho: create dashboard](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/create-dashboard)).
- **Freshsales** — "You can apply filters to all the widgets in a report" with ANY/ALL groups ([Freshsales custom report](https://crmsupport.freshworks.com/support/solutions/articles/50000003049-how-to-create-a-custom-report-)). **Copper** — an attribute filter dragged "to the top of dashboard" ([Copper dashboards](https://support.copper.com/en/articles/8823384-custom-reports-creating-editing-a-reports-dashboard)).
- **Attio and Close** — filters per report only ([Attio reports](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports); [Close activity comparison](https://help.close.com/feature-guide/reports/activity-comparison-report.md)).

**(c) Good versus weak.** Good: a small set of global filters mapped onto each tile's data source; documented precedence over report filters; editor-saved defaults plus per-viewer changes; a URL that carries the filter state; tiles the filter does not affect are marked; filters apply in emailed and exported copies too. Weak: two filter fields (Zoho); session-only persistence (HubSpot); filters silently dropped from emailed copies (Salesforce); no global filter (Attio, Close).

**(d) Rating: COMMON** (six of nine), close to table stakes for date and owner filters; **DIFFERENTIATOR** for saved, shareable filter views.

#### 1.4 Scheduled delivery and threshold alerts

**(a) What it is.** Reports or dashboards emailed on a timetable (link, image, PDF or data file), and alerts that fire only when a metric meets a condition.

**(b) Who has it.**

- **HubSpot** (all plans) — "Daily, Weekly, or Monthly"; recurring emails "can only be sent to HubSpot users"; one-off emails to verified-domain externals, with "100 emails per day to non-Hubspot users"; "Report data will be captured two hours before this time"; attachments CSV, XLS or XLSX, but not for custom reports and several other types; Slack public channels and Google Chat also supported ([HubSpot: email or export](https://knowledge.hubspot.com/dashboard/email-or-export-reports-and-dashboards)). No threshold-alert article exists in HubSpot's reporting help.
- **Salesforce** (all editions) — daily, weekly or monthly; "Each subscription supports up to 500 recipients"; per-user cap of 7 report and 7 dashboard subscriptions (15 on Unlimited), which "cannot be increased" ([Salesforce KB 000383344](https://help.salesforce.com/s/articleView?id=000383344&language=en_US&type=1)); report attachments as formatted .xlsx or .csv; dashboard recipients "see the same report data as the person running the report"; **conditional subscriptions** with up to 5 conditions on totals, where "the threshold is met if all conditions are met (AND match)" ([report subscription conditions](https://help.salesforce.com/s/articleView?id=analytics.reports_subscribe_notify_threshold.htm&language=en_US&type=5); [dashboard subscriptions](https://help.salesforce.com/s/articleView?id=analytics.dashboards_subscribe_lex.htm&language=en_US&type=5)).
- **Zoho CRM** (paid editions) — "daily, weekly, monthly or yearly"; users, roles, groups, territories, plus a "maximum of 50 additional recipients"; "XLS, CSV, PDF and HTML"; "maximum number of records for a scheduled report is 2000" ([Zoho: schedule reports](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/reports/create-edit-reports/articles/schedule-reports)); anomaly subscriptions daily, weekly or monthly ([Zoho anomaly detector](https://help.zoho.com/portal/en/kb/crm-nextgen/analytics-and-dashboards/analytics-dashboards/articles/nextgen-creating-anomaly-detector)).
- **Freshsales** (all plans) — daily, weekly or monthly as "PDF and CSV"; crucially, "the report will contain data based on the scope of the user to whom the email is being sent" — recipient scope, the opposite of Salesforce ([Freshsales: schedule reports](https://crmsupport.freshworks.com/support/solutions/articles/50000003038-how-to-schedule-custom-reports-)).
- **Copper** — dashboards can be exported to PDF or scheduled by email; "recipients must manually unsubscribe" ([Copper getting started](https://support.copper.com/en/articles/8823382-custom-reports-getting-started)).
- **Attio, Close** — none documented; Pipedrive unverified (sharing articles show only internal share, public link and PDF/PNG export).
- **Reference tools** — Zendesk lists "Scheduled dashboard delivery" (Suite Team and up) and "Visual data alerts" ("Set threshold alerts to visually understand when teams are under heavy load", Suite Professional and up) ([Zendesk pricing](https://www.zendesk.com/pricing/)); Geckoboard snapshots go to "any email address, including recipients who aren't Geckoboard users" and alerts fire when a metric "enters or exits a success or warning state" ([Geckoboard snapshots](https://support.geckoboard.com/en/articles/6055740-send-dashboard-snapshots-via-email); [Geckoboard alerts](https://support.geckoboard.com/en/articles/8677060-get-alerts-in-microsoft-teams-or-slack-when-important-changes-happen-to-metrics)).

**(c) Good versus weak.** Good: daily, weekly and monthly schedules with a chosen day and time; data scoped to the recipient by default, with any sender-scope option explicit; external recipients only on verified domains and with caps; PDF for reading and CSV/XLSX for analysis with stated row caps; an "as of" capture time in the email; condition-based sends with first-time-only de-duplication; Slack or Teams delivery; owners and admins can remove subscribers; dashboard filters honoured in the emailed copy. Weak: recurring emails internal-only (HubSpot); a hard 7-subscription cap (Salesforce); custom reports not attachable (HubSpot); a 2,000-row cap (Zoho); recipients who cannot be removed (Copper); no scheduling (Attio, Close). For a fintech, any scheduled export of customer rows also needs an audit trail.

**(d) Rating: COMMON** for scheduled email (five of nine CRMs); **DIFFERENTIATOR** for threshold or anomaly alerts (Salesforce conditions, Zoho anomalies, Zendesk and Geckoboard).

#### 1.5 Full-screen, TV mode, public links and embedding

**(a) What it is.** Showing a dashboard on a wall screen, sharing it with someone without a login, or placing it inside another page.

**(b) Who has it.**

- **HubSpot** — full-screen view; no public link; embedding works inwards only (Google Sheets, Looker Studio inside HubSpot dashboards) ([HubSpot: manage dashboards](https://knowledge.hubspot.com/reports/manage-your-dashboards)).
- **Salesforce** — expand one widget into an overlay; embed dashboards on the Home tab and Lightning app pages ("Record pages don't support embedded dashboards"); "Embedded dashboards are fully interactive. Refresh them, apply filters, and click chart segments to drill into filtered reports" ([Salesforce: embed dashboards](https://help.salesforce.com/s/articleView?id=analytics.dashboards_embed.htm&language=en_US&type=5)); no anonymous public link.
- **Pipedrive** — public links created only by admins or users with the "Share Insights dashboards as public links" permission; viewers need no account; you can "create multiple links for better control", rename them and delete one to revoke it; the page refreshes "once per hour" by default ([Pipedrive shareable insights](https://support.pipedrive.com/en/article/shareable-insights)).
- **Attio** — "Press cmd/ctrl + . to hide the sidebar and make your report fullscreen", arrow keys between reports ([Attio: manage reports](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/manage-reports)).
- **Zoho CRM** — "Create as Presentation" on Enterprise and above, "a maximum of 10 dashboard presentations per month" per user ([Zoho: create dashboard](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/create-dashboard)).
- **Freshsales** — "Enhanced Presentation Mode" that auto-advances with "5,10,15,30,60 seconds" presets ([Freshsales: what's new in analytics](https://crmsupport.freshworks.com/support/solutions/articles/50000004854-what-s-new-in-analytics-)).
- **Intercom** (support reference) — the real-time dashboard has a full-screen setting and refreshes every 60 seconds, Expert plan only ([Intercom real-time dashboard](https://www.intercom.com/help/en/articles/5784131-real-time-dashboard)).
- **Geckoboard** (TV reference) — "Send to screen" pairs a TV by passcode; loops rotate dashboards; share links are view-only "hash URLs which makes them unique and impossible to guess", can be regenerated, deleted and IP-restricted ([Geckoboard send to screen](https://support.geckoboard.com/en/articles/6055746-use-send-to-screen-to-display-your-dashboards); [share links](https://support.geckoboard.com/en/articles/6055739-share-a-dashboard-with-share-links); [loops](https://support.geckoboard.com/en/articles/6055763-use-loops-to-cycle-multiple-dashboards-on-a-single-screen)).

**(c) Good versus weak.** Good: a kiosk mode (full screen, auto-refresh, rotation, a screen paired remotely so no privileged account is logged in on the TV); public links that are individually revocable, named, permission-gated, optionally IP-restricted, and limited to read-only aggregates; interactive embeds. Weak: "full screen" that is only a browser toggle with no auto-refresh; public links with no expiry or IP control; no public link at all (HubSpot, Salesforce, Attio, Copper); a monthly quota on presentations (Zoho).

**(d) Rating: COMMON** for full-screen; **DIFFERENTIATOR** for public links (only Pipedrive among CRMs, standard in dashboard tools) and for embedding (Salesforce).

#### 1.6 Refresh cadence and freshness

**(a) What it is.** Whether tiles query live data, show cached results, refresh on a schedule, or come from batch copies — and whether the viewer can tell.

**(b) Who has it.**

- **Salesforce** — cached with a "Last Refreshed" stamp; "If you submit a refresh during a refresh or up to 1 minute after a completed refresh, the refresh is ignored"; refresh stops after 10 minutes; scheduled refresh (Classic, Enterprise and up) starts "within 30 minutes of your preferred start time", 200 per org; reports "time out after 10 minutes" ([Salesforce: refresh dashboards](https://help.salesforce.com/s/articleView?id=analytics.dashboards_refresh.htm&language=en_US&type=5); [schedule refresh](https://help.salesforce.com/s/articleView?id=analytics.dashboards_schedule_refresh.htm&language=en_US&type=5)).
- **Attio** — "Report data is generated in real time whenever you open a report or dashboard" ([Attio dashboards](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/dashboards)).
- **HubSpot** — manual per-tile refresh; scheduled emails capture data two hours early ([HubSpot: customize dashboards](https://knowledge.hubspot.com/dashboard/customize-your-dashboards)).
- **Pipedrive** — public dashboards update "once per hour" by default ([Pipedrive shareable insights](https://support.pipedrive.com/en/article/shareable-insights)).
- **Copper** — data refreshes "Currently four times a day", Pacific Time only ([Copper FAQ](https://support.copper.com/en/articles/8823388-custom-reports-frequently-asked-questions)).
- **Geckoboard** — per source: some CRM deal metrics "Immediate", Jira every 15 minutes, GA4 every 20 ([Geckoboard refresh rates](https://support.geckoboard.com/en/articles/6055564-refresh-rates-for-data-sources-and-widgets)).

**(c) Good versus weak.** Good: an "as of" stamp on every tile; live queries for light tiles, cached and throttled heavy ones; single-tile refresh; configurable auto-refresh for screens. Weak: batch refresh a few times a day (Copper) — stale for operations work — and no stamp, so nobody knows when the numbers were taken.

**(d) Rating: TABLE STAKES** for live-on-open or manual refresh; **COMMON** for scheduled refresh with a visible "as of" stamp.

#### 1.7 Drill-down from a chart to the records, and acting on them

**(a) What it is.** Click a bar or segment and get exactly the records behind it; the strong versions let you act on those records.

**(b) Who has it.**

- **HubSpot** — "Click a data point on the report to drill into that specific metric"; regroup the list and "Export unsummarized data" ([HubSpot drill-down](https://knowledge.hubspot.com/dashboards/drill-down-into-dashboard-reports); [report viewer](https://knowledge.hubspot.com/reports/interact-with-reports-in-the-report-viewer)).
- **Salesforce** — a chart segment opens the source report filtered to that segment; inline edit on reports for "a maximum of 100 values at one time" across up to 12 columns ([Salesforce drill-down](https://help.salesforce.com/s/articleView?id=analytics.reports_drilldown.htm&language=en_US&type=5); [inline editing](https://help.salesforce.com/s/articleView?id=analytics.reports_inline_editing.htm&language=en_US&type=5)).
- **Attio** — "select a data point to open the contributing records or entries" ([Attio reports](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports)).
- **Close** — "Click on the blue metric number to see all leads that are related to that metric", then bulk-edit status or fields from that search ([Close activity overview](https://help.close.com/feature-guide/reports/activity-overview-report.md); [Close bulk edit](https://help.close.com/feature-guide/leads/edit-merge-delete-leads.md)).
- **Zoho** — "You can view a detailed drilled-down report by clicking on Charts, KPIs, Target meters and Comparators" ([Zoho: create dashboard](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/create-dashboard)).
- **Freshsales** — "Drill Down and viewing Underlying Data" from the report page; "Pull up all records that have been filtered for the report", export capped at "a maximum of 20 fields" ([Freshsales: what's new in analytics](https://crmsupport.freshworks.com/support/solutions/articles/50000004854-what-s-new-in-analytics-); [Freshsales: export reports](https://crmsupport.freshworks.com/support/solutions/articles/50000003040-how-to-export-reports-)).

**(c) Good versus weak.** Good: one click gives exactly the segment's records with every filter carried over, including dashboard filters; the record count matches the tile; record permissions are respected; choose columns; export; save as a list or view; act on them (bulk edit, reassign, email) under permission checks. Weak: drill-down that lands on another summary or a static report with no action to take; field-capped exports.

**(d) Rating: TABLE STAKES** for drill-down to records; **DIFFERENTIATOR** for acting on them in place (Salesforce inline edit, Close bulk edit).

### 2. Report builder

#### 2.1 Building a report: objects, chart types, grouping and aggregation

**(a) What it is.** A builder for a saved question: pick the data, filter, group, aggregate, and choose a visual.

**(b) Who has it.**

- **HubSpot** — custom report builder on Pro or Enterprise of any hub. Charts: vertical bar, line, area, horizontal bar, combination, donut, pie, KPI, gauge, pivot table, table. Aggregations: None, Distinct count, Sum, Average, Median, Min, Max. "Non-table reports are limited to 1,000 unique rows of data"; Sales Hub Pro allows "Up to 100 custom reports and 10 million events per custom reporting query", Enterprise 500 and 100 million ([HubSpot custom report builder](https://knowledge.hubspot.com/reports/create-reports-with-the-custom-report-builder); [understand the builder](https://knowledge.hubspot.com/reports/understand-the-custom-report-builder); [Sales Hub pricing](https://www.hubspot.com/pricing/sales)). Reports are organised with tags, not folders.
- **Salesforce** — reports on report types; charts: bar, stacked bar, line, donut, funnel, scatter, gauge, metric, table; Sum, Average, Min, Max; 20 field filters and "up to 3 cross filters"; display up to 2,000 rows ([Salesforce limits](https://help.salesforce.com/s/articleView?id=rd_reports_dashboards_limits.htm&language=en_US&type=5)).
- **Attio** — report types Insight (all plans), Funnel (Plus+), Historical values, Time in stage and Stage changed (Pro/Enterprise); charts Bar, Pie, Line, Map; measures "Count, Max, Average, Min, or Sum"; group by one attribute and segment by another ([Attio reports](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports); [insight report](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/set-up-an-insight-report)).
- **Zoho CRM** — tabular, summary and matrix; sum, average, largest, lowest, count; up to 25 criteria; charts show up to 75 groupings (one field) or 150 (two) ([Zoho: building reports](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/reports/create-edit-reports/articles/understanding-and-building-reports); [Zoho charts](https://help.zoho.com/portal/en/kb/crm-nextgen/analytics-and-dashboards/analytics-dashboards/articles/nextgen-create-charts)).
- **Copper** (Business) — "Bar Charts, Bubble Charts, Bullet Charts, Column Charts, Combo Charts, Donut Charts, Headlines, Heatmaps, Line Charts, Pie Charts, Pivot Tables, Scatter Plots, Stacked Area Charts, Treemaps" ([Copper insights builder](https://support.copper.com/en/articles/8823392-custom-reports-insights-builder)).
- **Close** — Explorer (Scale): line and bar with "average/min/max/total" and automatic time buckets; Smart View columns show Sum, Average, Median, Min, Max ([Close Explorer](https://help.close.com/feature-guide/reports/explorer.md); [Smart View calculations](https://help.close.com/feature-guide/lead-filtering-and-smart-views/calculations-in-smart-views.md)).
- **Freshsales** — curated plus custom reports; trend reports by day, week, month or quarter ([Freshsales trend reports](https://crmsupport.freshworks.com/support/solutions/articles/50000003036-how-to-create-trend-reports-)).

**(c) Good versus weak.** Good: KPI tile, table, pivot, bar, line and funnel at minimum; median as well as averages; one definition that feeds tiles, emails and alerts; a fixed, stated time-zone rule (Copper's Pacific-only is a weakness). Weak: custom building only on top tiers; low grouping caps.

**(d) Rating: TABLE STAKES** for a single-object builder.

#### 2.2 Cross-object and joined reports

**(a) What it is.** One report over several related objects (deals with their company and line items; tickets with their contact's plan).

**(b) Who has it.** HubSpot: "5 possible sources for your report"; datasets (Data Hub Pro/Enterprise) join "up to five per dataset" ([HubSpot builder](https://knowledge.hubspot.com/reports/create-reports-with-the-custom-report-builder); [HubSpot datasets](https://knowledge.hubspot.com/data-management/create-and-use-datasets?no_head=1)). Salesforce joined reports: "up to 5 blocks", "Each block returns up to 2,000 records", formulas across blocks, export capped at 20,000 rows ([Salesforce joined reports](https://help.salesforce.com/s/articleView?id=analytics.reports_working_with_joined.htm&language=en_US&type=5)). Zoho: "You can join a maximum of three reports" on the same main module, "A maximum of five parent modules can be added to each report" ([Zoho: building reports](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/reports/create-edit-reports/articles/understanding-and-building-reports)). Copper: "Leads and Opportunities can be cross-reported on", and Opportunities, People and Companies with each other ([Copper FAQ](https://support.copper.com/en/articles/8823388-custom-reports-frequently-asked-questions)). Attio, Close, Pipedrive: reports are scoped to one object or list.

**(c) Good versus weak.** Good: an explicit join model (left and inner) with stated caps; row counts that do not silently double when a parent has many children. Weak: cross-object only on the top tier; silent truncation at a block cap.

**(d) Rating: COMMON** (mid and upper tiers).

#### 2.3 Calculated fields and formulas

**(a) What it is.** Row-level maths (margin = amount − cost) and summary-level maths (win rate = won ÷ closed) inside the report.

**(b) Who has it.** HubSpot: "Formula fields perform row-level math", Pro and Enterprise, "not reusable across reports" ([HubSpot formula fields](https://knowledge.hubspot.com/reports/create-formula-fields-in-the-custom-report-builder)). Salesforce: "Formulas per report: 5"; "Each report supports 2 row-level formulas", each over "up to 5 unique fields"; PARENTGROUPVAL and PREVGROUPVAL for share-of-parent and previous-period maths; buckets (5 per report, 20 buckets each) ([Salesforce row-level formula limits](https://help.salesforce.com/s/articleView?id=analytics.reports_formulas_row_level_limits.htm&language=en_US&type=5); [summary formulas](https://help.salesforce.com/s/articleView?id=analytics.reports_builder_fields_formulas.htm&language=en_US&type=5)). Copper: calculated measures "sum, difference, multiplication, ratio, and change" ([Copper pivot example](https://support.copper.com/en/articles/8823389-custom-reports-custom-insight-example-pivot-table-with-calculated-measure)). Freshsales: custom metrics such as a win-rate formula, on all plans ([Freshsales custom metrics](https://crmsupport.freshworks.com/support/solutions/articles/50000006074-how-to-use-custom-metrics-and-attributes-in-reports)). Zoho: bucketing via "a maximum of two category columns in a report" ([Zoho category columns](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/reports/create-edit-reports/articles/create-category-columns-in-reports)); formula columns unverified.

**(c) Good versus weak.** Good: row-level and summary-level formulas; bucketing; formulas reusable across reports; a ratio computed from summed numerator and denominator (not an average of per-row ratios). Weak: formulas that cannot be reused (HubSpot), very low per-report caps.

**(d) Rating: COMMON.**

#### 2.4 Comparison with a previous period

**(a) What it is.** The same metric for this period against the last one, with the change shown.

**(b) Who has it.** HubSpot "Compare by" a date part, Pro/Enterprise, with the limitation that it is "only possible to report on either Date part or Frequency" ([HubSpot compare date ranges](https://knowledge.hubspot.com/reports/compare-date-ranges-in-the-custom-report-builder)); Close fixed reports compare against a second date range with percentage change, and Activity Overview length-matches comparison periods automatically ([Close activity overview](https://help.close.com/feature-guide/reports/activity-overview-report)); Zoho Comparator (users, periods, picklist values) and a Growth Index KPI ([Zoho comparator](https://help.zoho.com/portal/en/kb/crm-nextgen/analytics-and-dashboards/analytics-dashboards/articles/nextgen-create-comparator); [Zoho KPI](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/create-kpi)); Attio lists "Time comparisons" ([Attio pricing](https://attio.com/pricing)); Salesforce via PREVGROUPVAL.

**(c) Good versus weak.** Good: comparison periods of equal length (and like-for-like day counts); both absolute and percentage change; comparison to the same period last year. Weak: comparison that cannot be combined with a breakdown.

**(d) Rating: COMMON.**

#### 2.5 Saved reports, folders and sharing; export

**(a) What it is.** A library of saved reports with folders or tags and access control; export of the result.

**(b) Who has it.** Salesforce folders (Viewer/Editor/Manager); formatted .xlsx export up to 100,000 rows by 100 columns, details-only CSV unlimited but long text cut at 255 characters ([Salesforce export](https://help.salesforce.com/s/articleView?id=analytics.reports_export.htm&language=en_US&type=5)). HubSpot report list with tags and access levels; deleted reports restorable for 90 days ([HubSpot reports list](https://knowledge.hubspot.com/reports/manage-reports-in-your-reports-list)). Zoho folders Only me / Everyone / Selected users; formatted export 2,000 rows, detailed 50,000 (and 50,000 a day) ([Zoho: building reports](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/reports/create-edit-reports/articles/understanding-and-building-reports)). Close CSV or JSON export. Attio: "CSV export is available for the calculated values table only" ([Attio reports](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports)).

**(c) Good versus weak.** Good: folders with permissions; restore after delete; export of both the summary and the underlying rows; stated row caps and truncation rules. Weak: summary-only export (Attio); undocumented truncation.

**(d) Rating: TABLE STAKES.**

#### 2.6 Data out: API and warehouse sync

**(a) What it is.** Getting CRM and billing data into the company's own warehouse or BI tool so analysts can join it with everything else.

**(b) Who has it.** HubSpot: Snowflake Data Share on "Data Hub Enterprise", read-only, "all your HubSpot data directly within Snowflake" ([HubSpot: connect Snowflake Data Share](https://knowledge.hubspot.com/reports/connect-snowflake-data-share)); warehouse integrations with "Snowflake, Google BigQuery, and AWS S3" in both directions, scheduled "hourly to daily", syncing "contacts, companies, deals, tickets, and custom objects" ([HubSpot cloud data storage integrations](https://www.hubspot.com/products/data/cloud-data-storage-integrations)). Stripe Data Pipeline: "Sync Stripe data to Snowflake, Redshift, Google Cloud Storage, Azure Blob Storage, or Amazon S3 with automated recurring exports", plus a private preview of real-time sync to Postgres ([Stripe Data Pipeline](https://docs.stripe.com/stripe-data/data-pipeline)). G2's Lead Scoring category requires that products "easily export and import data", and G2's CRM grid shows 87% user satisfaction with data import and export (section 9).

**(c) Good versus weak.** Good: full-fidelity sync including property history; documented latency; schema docs; no per-row fees. Weak: CSV only; enterprise-tier gating; history not included.

**(d) Rating: TABLE STAKES** for CSV export plus an API; **COMMON** (enterprise tiers) for managed warehouse sync.

### 3. Sales analytics and forecasting

Salesforce Help renders in JavaScript and could not be read directly for this section; Salesforce facts come from the official _Pipeline Forecasting_ guide PDF (Winter '27), Trailhead, and a few labelled third-party pages. Clari is now part of Salesloft and clari.com redirects there.

#### 3.1 Pipeline by stage (count, value, weighted)

**(a) What it is.** Open deals summed by stage as counts and amounts, plus a weighted view (amount × stage or deal probability).

**(b) Who has it.** Everyone. HubSpot: every stage carries a probability; "Weighted amount" is "the Amount multiplied by the Deal probability"; custom pipelines Starter 15, Pro 100, Enterprise 350 ([HubSpot pipelines](https://knowledge.hubspot.com/object-settings/set-up-and-customize-pipelines); [HubSpot default deal properties](https://knowledge.hubspot.com/properties/hubspots-default-deal-properties)). Salesforce: "Each opportunity stage aligns to a forecast category"; the default forecast ships with "Gap to Quota, Pipeline Coverage" columns ([Trailhead: configure forecasting](https://trailhead.salesforce.com/content/learn/modules/sales-forecasting/configure-sales-forecasting-in-salesforce); [Salesforce forecasting guide PDF](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/forecasts.pdf)). Pipedrive: stage probability is "set to 100% for each stage unless adjusted" and "The deal probability is always prioritized over the stage probability" ([Pipedrive probability](https://support.pipedrive.com/en/article/probability-in-pipedrive)). Close: "Expected values (Value × Confidence)" as one-time, monthly or annual value ([Close pipeline view](https://help.close.com/feature-guide/opportunities/opportunity-pipeline-view.md)). Zoho: Expected Revenue "Calculated based on the Amount and deal Stage" ([Zoho deal fields](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/deal-management/articles/standard-fields-deals)). Freshsales: weighted pipeline, but a changed stage probability "will only be reflected on new deals" ([Freshsales weighted pipelines](https://crmsupport.freshworks.com/support/solutions/articles/50000002959-how-to-set-up-and-use-weighted-pipelines-)). Copper: Total and Weighted Pipeline Summary with "average duration in stage" ([Copper pipeline summary](https://support.copper.com/en/articles/8823409-pipeline-reports-pipeline-summary)). monday: Forecast Value = "{Deal Value}*{Close Probability}" ([monday pipeline management](https://support.monday.com/hc/en-us/articles/360013348719-Sales-pipeline-management-with-monday-CRM)). Attio: "Deals in stage" report ([Attio sales dashboard](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/build-a-sales-reporting-dashboard)).

**(c) Good versus weak.** Good: per-deal probability overriding the stage default; count and value side by side; weighted and unweighted together; drill-down; multi-pipeline filters; coverage against quota (pipeline ÷ target, where "A healthy ratio sits between 3x and 5x" per [Outreach](https://www.outreach.ai/resources/blog/sales-pipeline-management-best-practices)). Weak: a probability change that silently does not recompute existing deals (Freshsales).

**(d) Rating: TABLE STAKES.**

#### 3.2 Conversion funnel — and what happens to skipped stages and backward moves

**(a) What it is.** The share of deals reaching stage N+1 from stage N. The arithmetic looks simple; the semantics are where products differ.

**(b) Who has it.**

- **Close** documents the cleanest rules: "Opportunities that skip Stages are not included in the counts for those skipped Stages"; "we will not include any 'undone' forward movement in the Funnel"; conversion counts "only represent Opportunities that converted from the previous Stage directly to the next Stage"; two windows, Active Stage and Created Cohort ([Close opportunity funnels](https://help.close.com/feature-guide/reports/opportunity-funnels-report.md)), also exposed by API ([Close funnel API](https://developer.close.com/api/resources/reporting/get-funnel-stages.md)).
- **Pipedrive** imputes instead: won deals are "considered to have completed every stage in your pipeline, no matter where they were closed"; lost deals "stopped at a specific stage" ([Pipedrive conversion report](https://support.pipedrive.com/en/article/insights-reports-deal-conversion)); in the progress report a deal jumping from stage 2 to 5 counts as entering 3, 4 and 5 ([Pipedrive deal progress](https://support.pipedrive.com/en/article/insights-reports-deal-progress)).
- **HubSpot** (Pro/Enterprise custom funnels): "All" counts records that "have ever moved through all the selected stages"; "Any" counts records entering any selected stage "regardless of create date" ([HubSpot custom funnels](https://knowledge.hubspot.com/reports/create-custom-funnel-reports)). It follows from the "All" definition, and users report, that such a funnel drops deals that skipped a stage ([HubSpot community thread, seen in search results](https://community.hubspot.com/t5/Dashboards-Reporting/Deal-funnel-with-all-stages-can-t-see-conversion-rate-between/td-p/755493); [Coefficient](https://coefficient.io/use-cases/track-deals-skip-stages-hubspot-funnel-reporting)). HubSpot's fix is upstream: pipeline rules (Pro/Enterprise) can "Restrict skipping stages in the pipeline" and "Restrict moving records backwards in the pipeline", though Super Admins, workflows and the API can bypass them ([HubSpot pipeline rules](https://knowledge.hubspot.com/object-settings/set-up-pipeline-rules)).
- **Freshsales**: "A deal will be shown to have moved through a stage only if the deal was moved to that specific stage" — skipped stages are simply absent ([Freshsales deal stage movement](https://crmsupport.freshworks.com/support/solutions/articles/50000010067-how-to-analyze-deal-stage-movement-with-analytics-in-freshsales-)).
- **Zoho** Stage component (Enterprise/Ultimate): conversion, overall win rate, direct wins and drop-outs per stage; a reverted record "counts twice" because it "tracks not the count of the records but actually the number of times a record hits each stage" ([Zoho stage component](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/stage-component)).
- **Attio** Funnel ("measures how many records progress through stages in order", Plus+) ([Attio reports](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports)); **monday** Funnel Chart "calculates the transitions between status labels" ([monday funnel chart](https://support.monday.com/hc/en-us/articles/8805401342482-The-Funnel-Chart)); Copper documents no stage-to-stage conversion (skipped stages show as dashes in its days-in-stage report).

**(c) Good versus weak.** Good: documented rules for skipped stages (exclude, like Close, or impute, like Pipedrive, and say which); documented rules for backward moves; a choice of cohort window (created in period) versus activity window (active in period); count and value conversion; lost-at-stage counts; splits by rep and source; built from stage _history_, not current status. Weak: silently dropping deals that skipped a stage; funnels computed from today's status.

**(d) Rating: TABLE STAKES** for a basic funnel; **DIFFERENTIATOR** for history-based, documented semantics.

#### 3.3 Win rate, with a stated denominator

**(a) What it is.** Won ÷ decided deals, by rep, source or segment.

**(b) Who has it.** Close: won ÷ opportunities "that were won or lost" ([Close funnels](https://help.close.com/feature-guide/reports/opportunity-funnels-report.md)). Copper has two definitions in two documents — "(won opportunities / total opportunities) * 100" and "The percentage of opportunities that are Won Status" ([Copper sales by owner](https://support.copper.com/en/articles/8823416-pipeline-reports-sales-by-owner-and-loss-reasons); [Copper metrics](https://support.copper.com/en/articles/8823394-custom-reports-reference-documents-metrics)). Pipedrive: overall win rate atop the conversion report ([Pipedrive conversion](https://support.pipedrive.com/en/article/insights-reports-deal-conversion)). HubSpot "Deals won & lost" by user or team ([HubSpot sales analytics suite](https://knowledge.hubspot.com/reports/create-sales-reports-in-the-sales-analytics-suite)). Zoho "Overall win rate" in the stage component; Freshsales "Deal win/loss percentage" ([Freshsales Sales Essentials](https://crmsupport.freshworks.com/support/solutions/articles/50000009799-what-is-sales-essentials-dashboard-)). The industry formula is "Closed Deals ÷ (Closed Deals + Lost Deals)", with overall benchmarks of 15-25% ([Outreach win rate](https://www.outreach.ai/resources/blog/sales-win-rate)).

**(c) Good versus weak.** Good: the denominator is stated (won ÷ (won + lost), open deals excluded); count and value versions; cohort choice (created in period versus closed in period); disqualified or abandoned kept apart from lost. Weak: "won ÷ total" with "total" undefined.

**(d) Rating: TABLE STAKES** (rigour of definition is the differentiator).

#### 3.4 Sales cycle, time in stage and velocity

**(a) What it is.** How long deals take overall and in each stage, and pipeline velocity: opportunities × deal value × win rate ÷ cycle length ([HubSpot sales velocity](https://blog.hubspot.com/sales/sales-velocity)).

**(b) Who has it.** HubSpot: "Date entered/exited [stage]", "Cumulative time in [stage]" and "Latest time in [stage]", plus "Days to close"; reports "Time spent in deal stage", "Deal velocity", "Sales velocity" ([HubSpot deal properties](https://knowledge.hubspot.com/properties/hubspots-default-deal-properties); [sales analytics suite](https://knowledge.hubspot.com/reports/create-sales-reports-in-the-sales-analytics-suite)). Close is the only native velocity formula found: "# of Opps x avg. Deal size x Avg. Win rate / Avg. Time to Win" ([Close funnels](https://help.close.com/feature-guide/reports/opportunity-funnels-report.md)). Pipedrive deal duration uses averages only, "always measured in days" ([Pipedrive deal duration](https://support.pipedrive.com/en/article/insights-reports-deal-duration)). Copper: the counter "has a minimum of 1 day"; on a backward move "the counter for Stage 1 will continue from where it left off"; imported deals have no history and deleting a stage deletes its data ([Copper days in stage](https://support.copper.com/en/articles/8823379-custom-reports-sales-cycle-length-and-days-in-stage)). Attio "Time in stage" (Pro+). Zoho flags records "moved with delay", "waiting" and "stalled" against average durations.

**(c) Good versus weak.** Good: cumulative and latest time-in-stage kept separately (handles re-entry); medians as well as averages; cycle to won and to lost measured separately; explicit handling of imported records; velocity with the formula shown and traceable to its four inputs. Weak: averages only; history lost when a stage is deleted. Cycle length matters: deals closing within 50 days win 47% versus 20% or less beyond 50 days ([Outreach](https://www.outreach.ai/resources/blog/sales-win-rate)).

**(d) Rating: TABLE STAKES** for overall cycle length (days to close); **COMMON** for per-stage time, which is often gated (Copper Business, Attio Pro, Zoho Enterprise); **DIFFERENTIATOR** for native velocity (Close; HubSpot partly).

#### 3.5 Deal aging and rotting

**(a) What it is.** Flagging deals that have gone quiet or stuck.

**(b) Who has it.** Pipedrive per-stage "Rotting in (days)" — "the number of inactive days after which a deal in this stage is considered rotten"; notes, files, activities, emails and field edits reset it; caveat: rotting "disregards the next activity date" ([Pipedrive rotting](https://support.pipedrive.com/en/article/the-rotting-feature)). Freshsales measures age from creation ("the time elapsed from the day of deal creation") with a "Show only rotten Deals" filter ([Freshsales stale deals](https://crmsupport.freshworks.com/support/solutions/articles/50000002157-what-are-stale-deals-how-do-they-work-)). monday Deal Insights widget: "Stalled deal", "No rep activity", "Overdue closed date" (Pro/Ultimate, beta) ([monday deal insights](https://support.monday.com/hc/en-us/articles/28180465521682-The-Deal-Insights-Widget)). Gong warnings "Stalled Deal: No change for X days", "No activity", "Ghosted", "Overdue" ([Gong deal warnings](https://help.gong.io/v1/docs/customize-your-deal-warning-settings)). Close recommends Smart Views for no stage move "in 30 days" or "no logged calls, emails, or meetings in 14 days" ([Close pipeline design](https://help.close.com/best-practices/build-a-sales-process/designing-your-sales-pipeline.md)). HubSpot has no rotting setting; the equivalent is colour-coded object tags with your own criteria on "Latest time in [stage]" or "Last activity date" (account-wide on Starter, per pipeline on Pro/Enterprise) ([HubSpot object tags](https://knowledge.hubspot.com/object-settings/color-coded-object-tags)), plus a "Deal push rate" report of deals "whose close date changed". Salesloft's 2026 benchmark: only about 32% of teams can instantly say why deals stall ([Salesloft](https://www.salesloft.com/resources/guides/revenue-benchmark-report-us)).

**(c) Good versus weak.** Good: thresholds per stage; documented reset rules; separate signals for no activity, stuck in stage, close date passed and close date pushed; a queue of stale deals. Weak: age since creation only; a scheduled future activity not counting as healthy.

**(d) Rating: COMMON.**

#### 3.6 Activity reports and leaderboards

**(a) What it is.** Calls, emails, meetings and tasks per rep, with comparisons and rankings.

**(b) Who has it.** Close Activity Overview ("will always show you 10 leaders… plus 2 users around your user name", length-matched comparison periods) and Activity Comparison ("a spreadsheet-like view of the performance of every team member", with a "(No user)" row) ([Close activity overview](https://help.close.com/feature-guide/reports/activity-overview-report); [activity comparison](https://help.close.com/feature-guide/reports/activity-comparison-report.md)). HubSpot call outcomes, completed activities, meeting outcomes, team activity and lead response time; a goals leaderboard that "ranks users and the progress they've made in meeting a goal" ([HubSpot goals](https://knowledge.hubspot.com/goals/view-and-manage-your-goals)). Pipedrive "Activities performance" and "Emails performance" ([Pipedrive report types](https://support.pipedrive.com/en/article/insights-report-types)). Copper "Activity by User", which counts interactions but not tasks ([Copper activity reports](https://support.copper.com/en/articles/9888054-custom-activity-reports-getting-started-best-practices)). monday Leaderboard widget, blank unless reps are set in a People column ([monday leaderboard](https://support.monday.com/hc/en-us/articles/10100407939090-The-Leaderboard-Widget)). Zoho KPI "Rankings" ([Zoho KPI](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/create-kpi)). Freshsales Team Activity Dashboard ([Freshsales curated reports](https://crmsupport.freshworks.com/support/solutions/articles/50000003037-what-are-curated-reports-how-to-use-them-)).

**(c) Good versus weak.** Good: a per-rep matrix with period-over-period change; activity tied to outcomes (calls → meetings → deals); unassigned activity surfaced, not dropped; leaderboards that show your own rank. Weak: raw counts with no outcome and no comparison. Activity reporting depends on capture: reps spend 70% of their time on non-selling tasks ([Salesforce State of Sales](https://www.salesforce.com/news/stories/sales-ai-statistics-2024/)), so manual logging under-counts.

**(d) Rating: TABLE STAKES** for activity reports; **COMMON** for leaderboards.

#### 3.7 Goals and quotas with attainment

**(a) What it is.** Targets per user and team for revenue, deals or activities, tracked against actuals.

**(b) Who has it.** HubSpot: Starter has the "Revenue" goal only; Pro/Enterprise add deals created, calls made, meetings booked; periods "Weekly, Monthly, Quarterly, Yearly, or Custom"; "Teams with individual user targets"; milestone notifications ([HubSpot create goals](https://knowledge.hubspot.com/reports/create-sales-goals)); the forecast shows "Goal attainment" and "Gap" ([HubSpot forecast tool](https://knowledge.hubspot.com/forecast/use-the-forecast-tool)). Salesforce: a quota is "a monthly or quarterly sales goal that's assigned to a user or territory", but "The quota rollup is done manually by users and managers" ([Salesforce forecasting guide](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/forecasts.pdf)). Pipedrive: deals added/progressed/won, activities, forecast; "Seasonal goals" with "different targets for each period"; team goals Premium+ ([Pipedrive goals](https://support.pipedrive.com/en/article/insights-goals)). Zoho: top-down or bottom-up targets (users "submit their own targets" for approval); Target Meter as dial, bar or traffic lights ([Zoho forecasts](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/forecasts/articles/creating-and-working-with-forecasts); [Zoho target meter](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/create-target-meter)). Freshsales: quotas on deal value or won deals; "You cannot create quota for past periods"; team targets split equally or proportionally ([Freshsales quota](https://crmsupport.freshworks.com/support/solutions/articles/50000002581-how-to-assign-and-track-quota-)). monday Forecasting view: rep sub-targets "roll up to the main target" (Pro/Ultimate) ([monday forecasting view](https://support.monday.com/hc/en-us/articles/35252007254930-The-Forecasting-View)). Not found in Close or Copper; Attio has only a chart goal line.

**(c) Good versus weak.** Good: revenue, deal and activity goal types; user and team targets with automatic roll-up; seasonal targets; pace or at-risk notifications; attainment inside the forecast; history kept when targets change. Weak: manual roll-ups (Salesforce); targets that are only lines on a chart (Attio). Average quota attainment is about 62% ([Salesloft 2026](https://www.salesloft.com/resources/guides/revenue-benchmark-report-us)).

**(d) Rating: COMMON** (absent in Close, Copper, Attio).

#### 3.8 Forecasting: categories, roll-ups, adjustments, submissions, snapshots and accuracy

**(a) What it is.** Expected bookings for a period, either probability-weighted or category-based (Pipeline / Best Case / Commit / Closed / Omitted), rolled up a hierarchy, with manager adjustments, submissions, quota in view, history and accuracy.

**(b) Who has it.**

- **Salesforce Pipeline Forecasting** ([Salesforce forecasting guide PDF](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/forecasts.pdf)): "You can have up to four active forecast types at one time"; "Filter definitions aren't editable after activating"; "Deactivating a forecast type deletes the related forecasting data". Categories "Pipeline, Best Case, Commit, Omitted (not included in forecasts), and Closed", optional Most Likely. Cumulative roll-ups by default; "Switching from one rollup method to another deletes adjustments for all active forecast types". Adjustments "doesn't change the underlying gross rollup", and reports expose Amount Without Adjustments and Amount Without Manager Adjustments. "Only one person at each level in the forecasts hierarchy can be the manager." "The maximum date range is 15 months, 15 fiscal periods, or 8 quarters"; the grid "shows up to 2,000 rows"; changing period type or fiscal year purges "all adjustments, manager judgments, and quotas". A "Forecasting Submissions" report type and 13-month historical trends ([Trailhead: track forecast performance](https://trailhead.salesforce.com/content/learn/modules/sales-forecasting/track-sales-forecast-performance)). Pipeline Inspection adds a waterfall and category flow chart ([Trailhead: Pipeline Inspection setup](https://trailhead.salesforce.com/content/learn/modules/revenue-intelligence-setup/set-up-pipeline-inspection)).
- **HubSpot** (Sales/Service Hub Pro and Enterprise): stage-to-category mapping, which a workflow can automate; monthly or quarterly; editing the period resets "forecastable revenue goals and forecast submission… for all pipelines"; submissions with history "up to one year previous"; AI projections from "closed won deals in the past three months", shown as a most-likely/upper/lower range, and "When the forecast error is greater than 1, accuracy will always be 0" ([HubSpot set up forecast](https://knowledge.hubspot.com/forecast/set-up-the-forecast-tool); [use forecast](https://knowledge.hubspot.com/forecast/use-the-forecast-tool); [AI projections](https://knowledge.hubspot.com/forecast/improve-forecasting-with-ai-projections)); the "Deal pipeline waterfall" shows Created, Pushed, Pulled, Decreased, Increased, Lost, Won ([HubSpot sales analytics suite](https://knowledge.hubspot.com/reports/create-sales-reports-in-the-sales-analytics-suite)). The category lists in HubSpot's own docs are inconsistent between articles.
- **Zoho**: top-down or bottom-up over role, territory or reporting hierarchies; "forecasts for two previous years and one future year"; categories Pipeline, Best case, Committed, Closed, Omitted plus two custom; managers can "overwrite the owner adjustments" and mark deals in or out; Standard 5 forecasts, Professional 10, Enterprise 15, Ultimate 20; Zia attainment prediction needs six months of history with deals closed on at least 10 different days ([Zoho forecasts](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/forecasts/articles/creating-and-working-with-forecasts)).
- **Freshsales**: "Committed" and "Best-case" plus three custom; "quota of the team members would roll up to the managers"; "A manager can override the committed deal value"; Freddy flags deals "likely to win in the next four weeks" ([Freshsales forecasting](https://crmsupport.freshworks.com/support/solutions/articles/50000002881-how-to-predict-revenue-from-your-team-); [Freddy commit](https://crmsupport.freshworks.com/support/solutions/articles/50000002883-how-to-use-freddy-to-identify-and-commit-to-deals-)).
- **monday** Forecasting view (Pro/Ultimate): target, attainment and "% from target" by stage or category; "Deals without a close date are excluded" ([monday forecasting view](https://support.monday.com/hc/en-us/articles/35252007254930-The-Forecasting-View)).
- **Pipedrive** revenue forecast by expected close date, weighted or not, no categories or submissions ([Pipedrive revenue forecast](https://support.pipedrive.com/en/article/insights-reports-revenue-forecast)); **Copper** "Pipeline Projection" by expected close date ([Copper forecast](https://support.copper.com/en/articles/8823412-pipeline-reports-forecast)); **Close** has no forecast module, only expected value and estimated close dates; **Attio** weighted pipeline plus goal line.
- **Gong** adds what CRMs lack: auto-submission captured "right before company snapshot", a company snapshot that "set[s] the day and time when forecast numbers are locked for the week", "trends, changes, accuracy and pacing reports" ([Gong configurable forecast](https://help.gong.io/v1/docs/configurable-forecast-article-1); [Gong submissions](https://help.gong.io/v1/docs/create-a-submission-column)); a projection from closed-won plus weighted pipeline using "historical conversion rate for the same time and stage" plus expected new and pulled-in deals, with a "See the math" panel, needing "at least 400 created opportunities, out of which 150 are closed-won deals, spanning over at least four quarters" to exceed 90% accuracy ([Gong projection](https://help.gong.io/v1/docs/analyze-see-forecast-projection)); without a history backfill, a CRM configuration change produces "mixed data" ([Gong historical data](https://help.gong.io/v1/docs/explainer-aligning-analytics-reports-with-historical-data)).
- **Clari (Salesloft)** "automatically snapshots, stores, corrects, and analyzes CRM… data", tracks "who changed their commit since the last call", and shows an AI projection and commit trend ([Salesloft newsroom](https://www.salesloft.com/company/newsroom/revenue-operations-leader-showcases-future-of-forecasting); [Clari datasheet](https://pages.clari.com/rs/866-BBG-005/images/fof_final_ds_product_forecasting.pdf); [Salesloft forecasting](https://www.salesloft.com/platform/sales-forecasting-software)).

**(c) Good versus weak.** Good: stage-to-category mapping with per-deal override; cumulative roll-ups; layered adjustments that never overwrite the gross number; in/out judgments; submissions with a weekly lock and history; quota and gap inline; forecast-versus-actual accuracy (Outreach measures "absolute percentage difference between the Day One commit forecast and cumulative Closed results" — [Outreach](https://www.outreach.ai/resources/blog/how-to-boost-sales-forecast-accuracy-using-ai)); pacing against the same point in previous periods; a pipeline waterfall; configuration changes that do not destroy data. Weak: weighted totals only; no snapshots (cannot answer "what did we call in week 3?"); destructive period or roll-up switches (Salesforce, HubSpot).

**(d) Rating: TABLE STAKES** for a weighted forecast; **COMMON** for category forecasts with roll-ups and submissions (Salesforce, HubSpot Pro, Zoho, Freshsales, monday Pro); **DIFFERENTIATOR** for snapshot-based accuracy, pacing and AI projection (Gong, Clari).

#### 3.9 Lost-reason analysis

**(a) What it is.** A required reason when a deal is lost, and reports by reason, stage and competitor.

**(b) Who has it.** HubSpot "Closed lost reason", conditional required stage properties ("users cannot create or update the record until they set a value"), "Deal loss reasons" report ([HubSpot pipelines](https://knowledge.hubspot.com/object-settings/set-up-and-customize-pipelines)). Pipedrive freeform or predefined reasons, "up to 100 lost reasons" ([Pipedrive lost reasons](https://support.pipedrive.com/en/article/lost-reasons)). Copper defaults "Competitor", "Features", "Price", prompted when dragging to Lost; Loss Reasons report on Professional/Business ([Copper loss reasons](https://support.copper.com/en/articles/8823335-understand-and-customize-loss-reasons-field)); Copper documents a workflow to "Set win percentage to 0% when opp is lost", implying it is not automatic ([Copper](https://support.copper.com/en/articles/9888116-set-win-percentage-to-0-when-opp-is-lost)). Close: "Use a custom field for Lost Reason… and require it before a deal can be marked Lost" ([Close pipeline design](https://help.close.com/best-practices/build-a-sales-process/designing-your-sales-pipeline.md)). Freshsales lost reasons in curated reports.

**(c) Good versus weak.** Good: required, admin-curated picklist; optional comment; lost-at-stage × reason × competitor cross-tabs; probability zeroed automatically on loss. Weak: free text only.

**(d) Rating: TABLE STAKES.**

#### 3.10 Source and attribution

**(a) What it is.** Where a lead or deal came from, from a single source field up to multi-touch revenue attribution.

**(b) Who has it.** HubSpot: contact-create attribution on Marketing Hub Pro/Enterprise; deal-create and revenue attribution on Marketing Hub Enterprise; models First Touch, Last Touch, Linear, Time Decay and Empirical (which "replaces the U-shaped, W-shaped, J-shaped, and Inverse J-shaped models" — though another HubSpot article still describes them, plus Full Path and a Time Decay with "a 7-day half-life"); "up to 20 million interactions per report after sampling", "up to 100 event input types per report" ([HubSpot attribution reports](https://knowledge.hubspot.com/reports/create-attribution-reports); [understand attribution](https://knowledge.hubspot.com/reports/understand-attribution-reporting)). Salesforce Campaign Influence (Primary Campaign Source by default; multi-touch models need Account Engagement licences, per [SalesforceBen](https://www.salesforceben.com/salesforce-campaign-influence/)). Zoho single-touch "Lead Source" and "Campaign Source" ([Zoho deal fields](https://help.zoho.com/portal/en/kb/crm/sales-force-automation/deal-management/articles/standard-fields-deals)). Freshsales last-touch, "Any purchase made by the user for 7 days is attributed to that campaign" ([Freshsales attribution](https://crmsupport.freshworks.com/support/solutions/articles/50000005558-how-to-attribute-revenue-to-a-campaign-)). Pipedrive "source channel" segmentation; Copper "source" filter; Close none.

**(c) Good versus weak.** Good: immutable first-touch original source plus last touch; multi-touch models with stated weights; closed loop from won revenue back to source; stated sampling and look-back windows. Weak: one editable "source" picklist.

**(d) Rating: TABLE STAKES** for source fields and source reports; **DIFFERENTIATOR** for multi-touch revenue attribution.

#### 3.11 Cohorts in sales

**(a) What it is.** Grouping deals by creation month and following their outcomes.

**(b) Who has it.** Zoho Cohort Analysis component (Day to Year intervals, duration "1-10") ([Zoho cohort analysis](https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/cohort-analysis)); Close "Created Cohort" funnels ([Close funnels](https://help.close.com/feature-guide/reports/opportunity-funnels-report.md)); HubSpot "All created" first stage in an All funnel; Pipedrive conversion defaulting to deals created this year.

**(c) Good versus weak.** Good: a created-month × months-since-creation matrix of win rate and value. Weak: a created-date filter.

**(d) Rating: COMMON** for created-date funnels; **DIFFERENTIATOR** for true cohort matrices.

#### 3.12 Point-in-time and historical reporting

**(a) What it is.** Answering "what did the pipeline look like on date X" and "what changed since last week".

**(b) Who has it.** Salesforce historical trend reporting: the previous three months plus the current one, "5 million rows" per object, up to five snapshot dates and four historical filters, Number/Currency/Date/Picklist fields only, and disabling a field deletes its history ([Trailblazer community](https://trailhead.salesforce.com/trailblazer-community/feed/0D54S00000A8FxfSAF); [Salesforce historical trend concepts](https://help.salesforce.com/s/articleView?id=analytics.reports_historical_concepts.htm&language=en_US&type=5)); reporting snapshots copy data "daily, weekly, or monthly" into a custom object, 2,000 rows per run ([Salesforce reporting snapshots](https://help.salesforce.com/s/articleView?id=analytics.data_about_analytic_snap.htm&language=en_US&type=5)). HubSpot "Historical snapshots" and "Deal change history" reports and the waterfall ([HubSpot sales analytics suite](https://knowledge.hubspot.com/reports/create-sales-reports-in-the-sales-analytics-suite)); property history per record ([HubSpot property history](https://knowledge.hubspot.com/records/view-record-property-history)). Attio "Historical values" (Pro+) "Track what your data looked like at prior points in time, week by week, month by month" and reflect data "as it existed at the end of each period, including what a record's category value was at the time" — but the setup article says the report's filters "use the current values of records" ([Attio historical reports](https://attio.com/help/academy/reports-course/historical-reports); [historical values report](https://attio.com/help/reference/managing-your-data/dashboard-and-reports/set-up-a-historical-values-report)). Freshsales field history for 50 fields kept "a duration of 6 months" ([Freshsales field history](https://crmsupport.freshworks.com/support/solutions/articles/50000009049-how-to-track-field-edit-history-of-deals-)). Copper: no value history; the workaround is a manual "Original Value" field ([Copper value changes](https://support.copper.com/en/articles/9888036-reporting-tracking-opportunity-value-changes)). Gong backfills history "up to 5 quarters" ([Gong historical data](https://help.gong.io/v1/docs/explainer-aligning-analytics-reports-with-historical-data)).

**(c) Good versus weak.** Good: snapshots taken from day one on a fixed schedule (daily, plus the locked weekly forecast); pipeline as of any past date with retention long enough for year-over-year; a waterfall between any two dates; reportable field history; history that survives configuration changes; the interface says plainly when history is missing (imports, new fields). Weak: rolling three-month windows and five dates (Salesforce); six-month field history (Freshsales); row caps per run. Attio's trap — point-in-time values filtered by _current_ values — is worth avoiding: a point-in-time report must filter on point-in-time values.

**(d) Rating: DIFFERENTIATOR** for full point-in-time reporting; **COMMON** for field change history. It is cheap to build in from the start and impossible to backfill later.

### 4. SaaS and revenue metrics, billing operations

The single most important finding in this section: **the same billing data produces different MRR in Stripe, ChartMogul, Baremetrics and ProfitWell**, because they disagree on refunds, scheduled cancellations, the delinquency cut-off, trials and the currency date. Every serious tool writes its rules down; a portal that shows MRR must publish its own.

#### 4.1 MRR and ARR: normalisation rules

**(a) What it is.** MRR is the sum, over paying subscriptions, of the recurring price (excluding tax, net of recurring discounts) divided by the months in the billing interval; ARR = MRR × 12.

**(b) Who has it and how they define it.**

- **Stripe Billing analytics** — "the sum of the monthly-normalised value of all your `active` and `past_due` subscriptions"; "MRR calculations exclude any taxes applied to the subscription, any subscribers on free plans and any metered (usage based) products"; "Legacy free trials (using trial_end) exclude the entire subscription from MRR for the duration of the trial"; "Permanent recurring discounts, are always subtracted from MRR"; with `cancel_at_period_end`, MRR stops counting "after the time of the API call, not at the end of the period"; "One-off refunds, like one-off discounts, do not affect MRR"; a separate FX adjustment line; filtering and grouping "isn't available if you're processing subscription volume in multiple currencies" ([Stripe billing analytics glossary](https://docs.stripe.com/billing/subscriptions/analytics/glossary); [Stripe support: understanding MRR](<https://support.stripe.com/questions/understanding-monthly-recurring-revenue-(mrr)>)).
- **ChartMogul** — "the total recurring subscription revenue across all active and past due subscriptions each month"; one-time items excluded; tax deducted; refunds deducted only for Stripe sources ("for all other billing system integrations, refunded transactions are not deducted from MRR"); currency converted at the "service period start date — the first day of the billing period" using Open Exchange Rates, and it "doesn't count currency fluctuations as expansion or contraction MRR movements"; a paying customer moved to a free plan or 100% discount is classed "as Active (default)" or as Cancelled — a setting ([ChartMogul MRR](https://help.chartmogul.com/hc/en-us/articles/203299812); [ChartMogul currency](https://help.chartmogul.com/hc/en-us/articles/201520952); [ChartMogul analytics settings](https://help.chartmogul.com/article/245-configuring-subscription-analytics-settings)).
- **Baremetrics** — "All non-monthly plans are normalized to monthly"; "Customers with 100% off coupons are treated as free users"; usage revenue excluded by default; "On average your metrics are updated every 2 hours" ([Baremetrics MRR](https://help.baremetrics.com/en/articles/5380330-monthly-recurring-revenue); [Baremetrics usage billing](https://help.baremetrics.com/en/articles/9096541-usage-based-billing); [data refresh](https://help.baremetrics.com/en/articles/5380391-how-often-is-my-data-updated)).
- **ProfitWell (Paddle)** — "Trialing customers (or any customer that hasn't yet paid you) are not included"; "ProfitWell always subtracts discounts and credits before calculating MRR"; "ProfitWell, generally speaking, ignores refunds"; "Delinquent charges are in a gray area between churn and active" ([ProfitWell MRR](https://www.paddle.com/help/profitwell-metrics/measure/subscription-metrics/mrr); [ProfitWell refunds](https://www.paddle.com/help/profitwell-metrics/measure/subscription-metrics/refunds)).
- **Chargebee** — excludes setup fees, credit adjustments, ad-hoc charges and tax; subscriptions in dunning stay in MRR because "the revenue is still expected to be recovered"; separate Currency Change MRR ([Chargebee MRR](https://www.chargebee.com/docs/billing/2.0/reports-and-analytics/monthly-recurring-revenue); [RevenueStory FAQ](https://www.chargebee.com/docs/billing/2.0/reports-and-analytics/revenuestory-faq)).
- **Recurly** — splits MRR into Collected, "MRR in dunning" and Expected; excludes "Usage-based billing amounts" ([Recurly MRR](https://docs.recurly.com/recurly-subscriptions/docs/monthly-recurring-revenue)).
- **HubSpot** subscriptions carry MRR and ARR properties that update on edit ([HubSpot manage subscriptions](https://knowledge.hubspot.com/subscriptions/manage-subscriptions)); **Zoho Billing** Net MRR = previous MRR + net new MRR ([Zoho Billing MRR/ARR](https://www.zoho.com/us/billing/help/reports/mrr-arr.html)).

ChartMogul's line-item formula makes the normalisation explicit: "MRR = (amount_in_cents − tax_amount_in_cents) × subscription_duration_ratio × prorate_factor" ([ChartMogul developer docs](https://dev.chartmogul.com/docs/how-mrr-is-calculated-from-prorated-invoices)). Stripe adds: "Once a subscription is unpaid rather than active, your MRR will decrease by the amount on the subscription" ([Stripe support: MRR and ARR](<https://support.stripe.com/questions/understanding-monthly-recurring-revenue-(mrr)-and-annual-recurring-revenue-(arr)>)).

**Where the main tools disagree on the same data:**

| Edge case             | Stripe                              | ChartMogul                                  | Baremetrics                      | ProfitWell                             | Chargebee                                         | Recurly                       |
| --------------------- | ----------------------------------- | ------------------------------------------- | -------------------------------- | -------------------------------------- | ------------------------------------------------- | ----------------------------- |
| Past due / in dunning | in MRR; `unpaid` = churn            | in MRR until cancelled; optional auto-churn | in MRR until >30 days delinquent | "gray area"                            | in MRR (Active)                                   | separate "MRR in dunning"     |
| Cancel at period end  | removed at the time of the API call | churn at end of paid period (default)       | listed as "Cancelling"           | churn at end of paid period            | not documented                                    | not documented                |
| Refunds               | no effect                           | deducted for Stripe sources only            | not documented                   | ignored, except early-cancelled annual | not documented                                    | subscription refunds included |
| Metered / usage       | excluded (preview)                  | included, dated to service start            | excluded; Stripe opt-in          | not documented                         | configurable                                      | excluded                      |
| FX                    | separate "FX Adjustment" line       | rate at service-period start; separate row  | not documented                   | not documented                         | rate at last day of period; "Currency Change MRR" | rate at charge creation       |

**(c) Good versus weak.** Good: a written rule for every edge case — trials, free plans, 100% coupons, pauses, past-due versus unpaid, refunds, tax, one-offs, usage — with the contested ones as settings that recompute history (Stripe takes "24–48 hours"); MRR computed per invoice line with tax removed; past-due shown as its own bucket (Recurly's Collected / In dunning / Expected) rather than counted forever or dropped at the first failure; currency converted on a documented date with FX kept out of expansion and contraction (converting at today's rate rewrites history); usage revenue separate or dated to its service period; the current period flagged as an estimate ("Diagonally-striped bars include the current period... are an estimate" — ChartMogul). Weak: an undocumented single number; delinquent revenue counted forever; currencies mixed without saying which rate.

**(d) Rating: TABLE STAKES.**

#### 4.2 MRR movements, reactivation and churn timing

**(a) What it is.** Ending MRR = opening MRR + new + expansion + reactivation − contraction − churn (± FX), shown as a waterfall or bridge per period.

**(b) Who has it.** Stripe MRR growth adds new, reactivation and expansion, subtracts contraction and churn, "and adjusting for any foreign currency (FX) impact"; churn is counted when a subscription is "canceled, scheduled to be canceled, downgraded to a free subscription, paused, or becomes delinquent" — so a scheduled cancellation is churn immediately ([Stripe glossary](https://docs.stripe.com/billing/subscriptions/analytics/glossary)). ChartMogul: New Business is a lead's first purchase; contraction includes cancelling "one or more (but not their last) subscription"; reactivation is "a formerly paying customer (who had previously churned) moves back onto a paid plan"; churn recognition is a setting ("End of Billing Period" or "Time of Cancellation"); past-due subscriptions can be auto-churned; current-period bars are "an estimate until the period is over" ([ChartMogul movements](https://help.chartmogul.com/hc/en-us/articles/4416682609426); [churn timing](https://chartmogul.com/blog/new-choose-when-to-recognise-churn-in-your-chartmogul-data/); [past-due handling](https://help.chartmogul.com/article/303-handling-past-due-subscriptions)). Baremetrics: "Customers who are delinquent for more than 30 days are considered to have canceled" ([Baremetrics churn](https://help.baremetrics.com/en/articles/5380347-user-and-revenue-churn); [reactivations](https://help.baremetrics.com/en/articles/5380323-reactivations)). ProfitWell: churn at the end of the paid period; "The customer must have the same customer ID to be marked as Reactivated"; same-month join-and-leave not counted as churn ([ProfitWell churn](https://www.paddle.com/help/profitwell-metrics/measure/subscription-retention/churn); [reactivations](https://www.paddle.com/help/profitwell-metrics/measure/subscription-retention/reactivations)). Zoho Billing counts pause as churn; Chargebee does not ([Zoho Billing MRR](https://www.zoho.com/us/billing/help/reports/mrr-arr.html)). HubSpot's revenue analytics suite includes "MRR waterfall by month" (Professional/Enterprise) ([HubSpot revenue analytics](https://knowledge.hubspot.com/reports/create-reports-in-the-revenue-analytics-suite)).

**(c) Good versus weak.** Good: movements classified per _customer_, not per subscription; a written reactivation rule; same-period join-and-leave netted; configurable churn timing with scheduled cancellations visible in their own view; pause as an explicit bucket; every bar drills to customers and the invoice events behind them; FX as its own bridge line. Weak: subscription-level movements; pause silently treated as churn or as active.

**(d) Rating: TABLE STAKES.**

#### 4.3 Retention: NRR, GRR, churn rates, quick ratio

**(a) What it is.** NRR = (start MRR + expansion [+ reactivation] − contraction − churn) ÷ start MRR, for customers present at the start; GRR the same without expansion (capped at 100%); customer churn = customers lost ÷ customers at start; quick ratio = (new + expansion) ÷ (churn + contraction).

**(b) Who has it.** ChartMogul NRR "(Starting MRR + Expansion MRR + Reactivation MRR − Contraction MRR − Churn MRR) ÷ Starting MRR", GRR excluding "expansion and reactivation" ([ChartMogul NRR](https://help.chartmogul.com/hc/en-us/articles/6886664393500); [GRR](https://help.chartmogul.com/hc/en-us/articles/6886621218332)), while its own blog leaves reactivation out ([ChartMogul blog](https://chartmogul.com/blog/net-and-gross-retention-rates)). Baremetrics, rolling 30 days: user churn "(Cancelled Customers in the last 30 days ÷ Active Customers 30 days ago) x 100" ([Baremetrics NRR vs GRR](https://help.baremetrics.com/en/articles/9893951-net-revenue-retention-nrr-vs-gross-revenue-retention-grr)). Stripe subscriber churn divides by "active subscribers 30 days ago, plus the total new subscribers in the past 30 days" — a different denominator — and has **no named NRR or GRR**. Zoho Billing NRR has no reactivation term ([Zoho Billing retention](https://www.zoho.com/us/billing/help/reports/retention-reports.html)). Benchmarks: SaaS Capital 2025 median NRR 102% for $25-50K ACV, interquartile 97-111% ([SaaS Capital](https://www.saas-capital.com/research/saas-retention-benchmarks-for-private-b2b-companies/)); Benchmarkit median NRR 101%, GRR 88% (2024 data), GRR falling to 84% in its 2026 edition ([Benchmarkit 2025](https://www.benchmarkit.ai/2025benchmarks); [Benchmarkit 2026](https://www.benchmarkit.ai/2026-saas-ai-native-metrics)).

**(c) Good versus weak.** Good: the formula in a tooltip, including the denominator and whether reactivation counts; a fixed-cohort year-over-year view as well as rolling monthly; logo churn and revenue churn side by side ("Revenue churn alone can hide an account-attrition problem" — [ChartMogul](https://chartmogul.com/saas-metrics/revenue-churn/)); voluntary versus involuntary churn split. Weak: one rolling number with no definition.

**(d) Rating: TABLE STAKES** for customer and revenue churn and for NRR among analytics vendors (Stripe Billing analytics has no named NRR, only cohort revenue retention); **COMMON** for GRR (ChartMogul, Baremetrics, Zoho Billing) and for quick ratio (Baremetrics, Chargebee).

#### 4.4 ARPA, LTV and CAC payback

**(a) What it is.** ARPA = MRR ÷ paying accounts; LTV ≈ ARPA ÷ churn (× gross margin); CAC payback = CAC ÷ (ARPA × gross margin) ([forEntrepreneurs SaaS metrics](https://www.forentrepreneurs.com/saas-metrics-2-definitions/)).

**(b) Who has it.** Stripe: "Subscriber lifetime value is calculated by dividing the average revenue per user (ARPU) by the subscriber churn rate" ([Stripe glossary](https://docs.stripe.com/billing/subscriptions/analytics/glossary)). ChartMogul LTV = ARPA "divided by a six-month trailing average of Customer Churn Rate", and "ChartMogul can only calculate LTV when your customer churn rate is not zero" ([ChartMogul LTV](https://help.chartmogul.com/hc/en-us/articles/203359061)). Baremetrics "Average Monthly Recurring Revenue Per Customer ÷ User Churn Rate = LTV" ([Baremetrics LTV](https://help.baremetrics.com/en/articles/5380345-ltv-lifetime-value)). ProfitWell "roughly ARPU/(1-Retention)" ([ProfitWell LTV](https://www.paddle.com/help/profitwell-metrics/analyse/subscription-metrics/life-time-value)). CAC and payback appear in none of the fetched product glossaries. Benchmarks: payback under 12 months for SMB, 18 mid-market, 24 enterprise ([Bessemer](https://www.bvp.com/atlas/scaling-to-100-million)); LTV:CAC "higher than 3" ([forEntrepreneurs](https://www.forentrepreneurs.com/saas-metrics-2/)).

**(c) Good versus weak.** Good: churn smoothed by a trailing average; zero churn handled; a gross-margin input; realised LTV beside predicted LTV; free accounts excluded from ARPA; CAC shown only when real spend is fed in. Weak: LTV from one month's churn.

**(d) Rating: TABLE STAKES** for ARPA and LTV; **DIFFERENTIATOR** for CAC and payback.

#### 4.5 Cohort retention and segmentation

**(a) What it is.** Customers grouped by start period, with logo and revenue retention in each later period; all metrics filterable by plan, interval, country and custom or CRM attributes.

**(b) Who has it.** ChartMogul cohorts "groups customers by the interval in which they started their first subscription (day, week, month, quarter, or year)", relative to previous period or start ([ChartMogul cohorts](https://help.chartmogul.com/hc/en-us/articles/213789989)). Stripe cohorts by when customers "first started generating positive Monthly Recurring Revenue (MRR)". Baremetrics segments on "25+ different attributes", "compare up to 5 segments at a time" ([Baremetrics cohorts](https://help.baremetrics.com/en/articles/5380031-cohorts); [segments](https://help.baremetrics.com/en/articles/5379934-segment-your-metrics)). ProfitWell by signup month ([ProfitWell cohorts](https://www.paddle.com/help/profitwell-metrics/analyse/subscription-metrics/understanding-your-mrr-cohorts-report)). Recurly cohort is "the month a new subscriber makes a payment greater than $0" ([Recurly retention](https://docs.recurly.com/recurly-subscriptions/docs/subscriber-retention)). Chargebee saved segments on customer, subscription or product fields ([Chargebee analytics](https://www.chargebee.com/docs/billing/2.0/reports-and-analytics/chargebee-analytics)).

**(c) Good versus weak.** Good: documented cohort basis (first payment, signup, first subscription); "% of start" and "% of previous" views; segments on CRM and billing metadata that can be saved, compared and exported; segmentation that still works with several currencies. Weak: signup cohorts that include never-paid accounts.

**(d) Rating: TABLE STAKES** for cohorts; **COMMON** for CRM-attribute segmentation.

#### 4.6 Renewals calendar and committed forecast

**(a) What it is.** What renews in the next 30/60/90 days, what is scheduled to cancel, and MRR projected from scheduled changes.

**(b) Who has it.** Baremetrics "Renewing" (monthly customers within 7 days, annual within 45) and "Cancelling" ([Baremetrics customer insights](https://help.baremetrics.com/en/articles/15518999-customer-insights-non-paying-renewing-cancelling-geo)). ChartMogul Committed MRR Forecast "based on scheduled subscription changes" and a push of renewal data into HubSpot ([ChartMogul forecast](https://help.chartmogul.com/hc/en-us/articles/4599973627036); [ChartMogul to HubSpot](https://chartmogul.com/blog/sync-saas-metrics-to-hubspot-companies/)). Stripe renewal reminder emails, but "Stripe doesn't send renewal reminder emails for subscriptions with a collection_method of send_invoice" ([Stripe customer emails](https://docs.stripe.com/billing/revenue-recovery/customer-emails)). Recurly "Account Updater runs pre-renewal... approximately one week before the renewal date" ([Recurly account updater](https://docs.recurly.com/docs/account-updater)), and its Renewal Invoices dashboard shows "how many renewals are successfully paid against all renewal invoices", including those "paid without any intervention" ([Recurly renewal invoices](https://docs.recurly.com/recurly-subscriptions/docs/renewal-invoices)). Zoho Billing Renewal Summary and "Non Renewing Profiles"; HubSpot contract renewal in beta ([HubSpot billing settings](https://knowledge.hubspot.com/quotes/configure-billing-settings)).

**(c) Good versus weak.** Good: forward calendar by interval with an owner per account; scheduled non-renewals visible before they hit MRR; pre-renewal card checks and reminders including for invoiced customers; renewal date and MRR pushed onto the CRM company record. Weak: renewals only discoverable after they fail.

**(d) Rating: COMMON** for the renewals list; **DIFFERENTIATOR** for a committed forecast.

#### 4.7 Invoices, credit notes, pay pages, self-serve portal and quotes

**(a) What it is.** The billing documents and customer-facing surfaces of a subscription business.

**(b) Who has it.** Stripe hosted invoice page ("Invoice URLs expire 30 days after the due date", never beyond 120 days) ([Stripe hosted invoice page](https://docs.stripe.com/invoicing/hosted-invoice-page)); credit notes that do not "void and replace the original invoice", and "The sum of all credit notes issued for an invoice can't exceed the total amount" ([Stripe credit notes](https://docs.stripe.com/invoicing/dashboard/credit-notes)); a customer portal for payment methods, billing details, tax IDs, plan changes, cancellation (with save coupons and cancellation reasons) — but multi-product, usage-based and invoiced subscriptions "can cancel it in the portal, but can't update it", "New portal sessions expire after a 5 minute period", and "You can't display the customer portal inside an iframe" ([Stripe customer portal](https://docs.stripe.com/customer-management)); quotes that become subscriptions or schedules on acceptance ([Stripe quotes](https://docs.stripe.com/quotes)). HubSpot invoices from deals or quotes, with reminders and partial payments ([HubSpot invoices](https://knowledge.hubspot.com/invoices/create-and-manage-invoices)). Chargebee portal can "add, edit, pause, resume, cancel, or reactivate" ([Chargebee portal](https://www.chargebee.com/docs/2.0/self-serve-portal.html)). Recurly's token link "automatically authenticates" — "anyone with the link can access the account" ([Recurly hosted account management](https://docs.recurly.com/recurly-subscriptions/docs/hosted-account-management)). Zoho Billing portal accepts quotes that convert to subscriptions ([Zoho Billing portal](https://www.zoho.com/us/billing/help/settings/customer-portal/customer-portal-functions.html)).

**(c) Good versus weak.** Good: immutable numbering and statuses (draft/open/paid/void/uncollectible); corrections by line-item credit notes, never edits; a pay link with expiry and recovery; a portal that can change multi-product subscriptions; quotes with expiry and revisions converting in one step. Weak: editable sent invoices; bearer links that act as the customer indefinitely.

**(d) Rating: TABLE STAKES** for billing tools; **COMMON** for quote-to-subscription.

#### 4.8 Dunning and collections

**(a) What it is.** Recovering failed payments (retries, emails, card updaters) and chasing invoiced customers.

**(b) Who has it.**

- **Stripe** — Smart Retries "Using AI"; "The recommended default setting is 8 tries within 2 weeks"; custom schedules "up to three retries"; hard declines are not retried until the payment method changes; **no retries at all when "The payment card is India-issued"** (directly relevant to an Indian fintech); end state cancel, `unpaid`, `past_due` or paused ([Stripe Smart Retries](https://docs.stripe.com/billing/revenue-recovery/smart-retries)); emails after each failure, card-expiry "1 month before", trial ending ([Stripe customer emails](https://docs.stripe.com/billing/revenue-recovery/customer-emails)); invoiced customers get reminders "before, on or after the invoice due date" and can be marked uncollectible at 30, 60 or 90 days ([Stripe automatic collection](https://docs.stripe.com/invoicing/automatic-collection)); recovery analytics show recovery rate by method and the top decline codes ([Stripe recovery analytics](https://docs.stripe.com/billing/revenue-recovery/recovery-analytics)).
- **Chargebee** — up to 5 custom retries, Smart Dunning "up to 12 retries"; end state cancel or keep, invoice unpaid, voided, written off or credited ([Chargebee dunning](https://www.chargebee.com/docs/2.0/dunning-v2.html)).
- **Recurly** — "Retries won't exceed 20 total transaction attempts or 60 days"; up to 50 dunning campaigns assigned account → plan → default; "If a failed manual invoice is reopened, dunning will not resume"; Account Updater "Not included in Starter or Pro"; recovered revenue attributed to Expired Card Management, Account Updater, Intelligent Retries, Backup Payment Method, Customer Updates, External and Forced recovery ([Recurly retry logic](https://docs.recurly.com/recurly-subscriptions/docs/retry-logic); [dunning](https://docs.recurly.com/docs/dunning-management); [recovered revenue](https://docs.recurly.com/recurly-subscriptions/docs/recovered-revenue); [dunning effectiveness](https://docs.recurly.com/docs/dunning-effectiveness)).
- **Paddle Retain** — "up to 7 retries" from about 2 hours to about day 20, up to 4 emails, default 30-day window, cancel, pause or past-due at the end ([Paddle Retain cadence](https://www.paddle.com/help/profitwell-metrics/retain/how-it-works/retain-payment-recovery-how-it-works-retry-cadence)).
- **Baremetrics Recover** — does not retry itself; "7 fully customizable emails, sent at days 0, 3, 7, 13, 15, 20, and 30", plus SMS and an in-app paywall ([Baremetrics Recover](https://baremetrics.com/features/recover)).
- **HubSpot** cards retried "up to 4 times within a 30-day window" ([HubSpot payments](https://knowledge.hubspot.com/payments/manage-payments)); **Zoho Billing** at most 3 retries within 30 days, with five end actions ([Zoho Billing dunning](https://www.zoho.com/us/billing/help/settings/subscriptions/dunning-management.html)).

**(c) Good versus weak.** Good: retries by decline reason within a capped window; a configurable end state per segment and collection method; pre-dunning (expiry notices, card updater before renewal); a hosted or in-app fix-payment page; recovered revenue attributed by method (in recovery, recovered, lost); for invoiced customers, reminder schedules, write-off thresholds and an ageing report. Weak: "zombie" past-due subscriptions inflating MRR indefinitely.

**(d) Rating: TABLE STAKES** for retries, failure emails and a configurable end state (an entry rule for G2's Subscription Billing category); **COMMON** for ML retries, card updaters and recovery reporting; **DIFFERENTIATOR** for paywalls, SMS and annual-to-monthly rollback.

#### 4.9 Revenue recognition basics (ASC 606 / IFRS 15)

**(a) What it is.** Turning billings into recognised and deferred revenue over the service period, with an auditable ledger.

**(b) Who has it.** Stripe Revenue Recognition: "treats each invoice line item as its own performance obligation", deferred on finalisation and amortised "by the day" by default; refunds, disputes and credit notes become contra-revenue for the recognised part; usage revenue "recognised in full when invoices finalise or when the accounting period closes"; books closed manually or automatically, with corrections posted to the current period; waterfall that "doesn't model future billings"; "Expect a 4-hour delay" ([Stripe RevRec methodology](https://docs.stripe.com/revenue-recognition/methodology); [settings](https://docs.stripe.com/revenue-recognition/revenue-settings); [reports](https://docs.stripe.com/revenue-recognition/reports); [waterfall](https://docs.stripe.com/revenue-recognition/reports/waterfall)). Chargebee RevRec: five-step model, SSP allocation, "Lock periods and enforce accounting controls" ([Chargebee RevRec](https://www.chargebee.com/revenue-recognition-software/)). Zoho Billing daily or even recognition, Premium/Enterprise ([Zoho Billing revenue recognition](https://www.zoho.com/us/billing/help/settings/preferences/revenue-recognition.html)). None of ChartMogul, Baremetrics, ProfitWell, HubSpot or Recurly has a revenue-recognition module.

**(c) Good versus weak.** Good: per-line schedules with proration; contra-revenue instead of rewriting history; bad debt handling; period locks; drill-down for audit; mapping to the general ledger; billing, MRR and recognised revenue that tie out. Weak: "revenue" reports that are really cash received.

**(d) Rating: DIFFERENTIATOR** in CRMs and analytics tools; **COMMON** as a paid tier in billing platforms. For a staff portal the sensible pattern is to link out to the billing system's ledger rather than rebuild recognition, and to make sure billing, MRR and recognised revenue reconcile.

#### 4.10 SaaS goals, forecasts, alerts and benchmarks

**(a) What it is.** Targets on MRR and subscribers, forward projections, digests and threshold alerts, and peer comparison.

**(b) Who has it.** ChartMogul goals on "MRR, ARR, Paid Subscribers, or Net Cash Flow"; benchmarks from "more than 2,500 SaaS businesses"; Slack and webhooks per movement ([ChartMogul goals](https://help.chartmogul.com/hc/en-us/articles/360000962329); [benchmarks](https://help.chartmogul.com/article/138-benchmarks)). Baremetrics 12-month forecast from 3-month averages, goals on any graph, Slack "daily, weekly and monthly summary reports" ([Baremetrics forecast](https://help.baremetrics.com/en/articles/5380028-forecast); [goals](https://help.baremetrics.com/en/articles/5380058-goals); [Slack](https://help.baremetrics.com/en/articles/5380550-slack-integration)). ProfitWell "Pulse" notifications ([ProfitWell Pulse](https://www.paddle.com/help/profitwell-metrics/export-data/pulse-notifications)). Chargebee metric-condition alerts. Stripe benchmarks against "similar businesses on Stripe".

**(c) Good versus weak.** Good: visible, editable forecast inputs; committed (scheduled) forecast kept apart from trend forecast; threshold alerts as well as digests; benchmarks that state peer group and sample size; annotations explaining jumps. Weak: an extrapolated line with no inputs.

**(d) Rating: COMMON** for goals and digests; **DIFFERENTIATOR** for committed forecasts and threshold alerts.

#### 4.11 Data plumbing between billing, metrics and CRM

**(a) What it is.** Connectors from billing systems, import for in-house billing, and pushing metrics back to CRM records.

**(b) Who has it.** ChartMogul sources include Stripe, Chargebee, Recurly, App Store, Google Play, Braintree, PayPal, GoCardless, Paddle, plus CSV and API; HubSpot as a source with "Hourly updates for default and custom HubSpot properties"; destinations HubSpot and Intercom daily, Slack, webhooks, warehouses on higher plans ([ChartMogul integrations](https://help.chartmogul.com/collection/43-integrations-and-data); [HubSpot as a source](https://help.chartmogul.com/article/265-configuring-hubspot-as-a-source); [destinations](https://help.chartmogul.com/article/192-getting-started-with-destinations)). ProfitWell pushes MRR, plan and churn status ("churned_voluntary, churned_delinquent") into HubSpot ([ProfitWell HubSpot fields](https://www.paddle.com/help/profitwell-metrics/export-data/hubspot/hub-spot-api-fields)). Baremetrics merges several sources but "you won't be able to break out the metrics by the individual data source in all graphs" ([Baremetrics sources](https://help.baremetrics.com/en/articles/5380475-connecting-your-payment-processors-and-data-sources)). Stripe Sigma gives SQL over Stripe data ([Stripe Sigma](https://docs.stripe.com/data/sigma)).

**(c) Good versus weak.** Good: several billing sources merged with identity resolution and a per-source breakdown; CSV/API import for gateways the vendors do not support (relevant for Indian payment rails); documented freshness; metrics written back to CRM account fields (MRR, status, plan, renewal date, churned-on, churn type) daily or faster; movement webhooks. Weak: one source only; silent multi-source blending; daily sync with no timestamp; metrics that never reach the people working the accounts.

**(d) Rating: TABLE STAKES** for connectors with import; **COMMON** for CRM push and warehouse export.

#### 4.12 What the subscription-metrics evidence implies for a staff portal

Every vendor derives every metric from one primitive: a per-customer movement log (date, type, MRR delta, currency, FX rate, source invoice). The practical consequences:

1. Store the movement log, not just current MRR; NRR, GRR, cohorts, the waterfall and point-in-time MRR all fall out of it.
2. Decide and display five rules: whether past-due counts, churn timing, discounts, metered usage, reactivation versus new.
3. Keep FX impact and "MRR in dunning" as separate lines from customer movement.
4. Show logo and revenue churn together, each with its denominator; compute NRR and GRR on a customers-present-at-start basis, annual as well as monthly.
5. Turn the numbers into worklists: renewals due (7 days for monthly plans, 45 for annual, following Baremetrics), scheduled cancellations, top customers in recovery, recovered revenue by method.
6. Link out to the billing system for revenue recognition rather than rebuilding it, and check the Stripe India-issued-card retry exclusion against the actual payment rails.

### 5. Support analytics

Support metrics look standard but every vendor defines them differently at the edges: what starts and stops a clock, whether bots count, which date a metric is filed under, and what happens on reopen, merge or transfer. The useful pattern is Zendesk's: it documents where the SLA definition of a metric differs from the report definition.

#### 5.1 First response (first reply) time

**(a) What it is.** Time from the start of a ticket or conversation to the first public reply from a person.

**(b) Who has it.** Everyone.

- **Zendesk** — "The duration between ticket creation and the first public agent reply on the ticket"; for agent-created tickets with a public first comment "the second timestamp shifts to the second public agent comment"; no zero-filling: "The metric's value will appear as null until two required events occur at least once"; "most automated or bot-related actions... aren't considered"; calendar and business-hour values both stored ([Zendesk duration metrics](https://support.zendesk.com/hc/en-us/articles/4408834848154-About-native-Support-time-duration-metrics)). The SLA version differs: "If a ticket is created with a public comment from an agent, the SLA first reply time target is not run", and "SLA first reply time targets are fulfilled when a ticket is solved, even if the ticket never had a public comment from an agent" ([Zendesk ticket reply time](https://support.zendesk.com/hc/en-us/articles/4408821871642-Understanding-ticket-reply-time)); with the Copilot add-on, "Reply time metrics are fulfilled if you set up a trigger to autoreply with a public comment" ([Zendesk SLA policies](https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies)).
- **Intercom** — "The time elapsed between the start of a conversation and the first teammate's reply", with and without bot-inbox time; conversations "closed without any initial response from a teammate… will not be considered"; reports filtered "by the date they were started" ([Intercom metrics](https://www.intercom.com/help/en/articles/7022438-reporting-metrics-attributes); [responsiveness](https://www.intercom.com/help/en/articles/3653556-responsiveness-reporting)); a "Within office hours" option per chart, but "Custom office hours are only used for team metrics" ([Intercom office hours in reporting](https://www.intercom.com/help/en/articles/8425113-how-to-use-office-hours-in-reporting)).
- **Freshdesk** — averages count tickets "whose first response was sent during the selected time period"; agent filters credit the agent who replied, not the assignee; automation "Send Reply" actions do not count for SLA; outbound email counts only "if the customer responds"; a merge can make first response "negative" ([Freshdesk first response](https://support.freshdesk.com/support/solutions/articles/50000000017-average-first-response-time-in-analytics-helpdesk-performance-); [Freshdesk SLA](https://support.freshdesk.com/support/solutions/articles/37626-understanding-sla-policies)).
- **HubSpot** — "Average time to first response" as 24/7 or "SLA hours"; "if a rep sends three consecutive messages without a reply, the calculation does not start over"; replies sent "from another inbox (e.g., Gmail, Outlook)" are not counted ([HubSpot service analytics](https://knowledge.hubspot.com/reports/create-service-reports-in-the-service-analytics-suite); [ticket properties](https://knowledge.hubspot.com/properties/hubspots-default-ticket-properties)).
- **Help Scout** — "Response time is not calculated for a new conversation created by a User"; "If the customer replies twice before you reply, response time is calculated from the first customer reply"; notes and tags do not affect it ([Help Scout email reports](https://docs.helpscout.com/article/380-email)). **Front** — "Auto-replies are not considered replies" ([Front reply time](https://help.front.com/en/articles/2294)). **Zoho Desk** — "the first public response" ([Zoho Desk agent performance](https://help.zoho.com/portal/en/kb/desk/reports-and-dashboards/reports/articles/understanding-the-agent-performance-report)). **Salesforce** — modelled as a milestone ("First Response") in entitlement processes ([Salesforce entitlements guide](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/salesforce_entitlements_implementation_guide.pdf)).

**(c) Good versus weak.** Good: only public human replies count, with bot time optional; a defined start for agent-created and outbound tickets; null (not zero) until a reply exists; calendar and business-hour values stored against the right schedule (workspace, team or agent); the reporting date stated; tickets closed without reply excluded from the average but counted as "unreplied"; a choice of crediting the replier or the assignee; median and time buckets, not just averages; SLA-versus-report differences documented. Weak: averages only; auto-replies counting as responses; merges producing negative values; one metric name for two behaviours.

**(d) Rating: TABLE STAKES.**

#### 5.2 Resolution time: first versus full, wait time, on-hold, reopens

**(a) What it is.** Time from creation to resolution, separated into first and final resolution and split by who was waiting.

**(b) Who has it.** Zendesk first resolution ("Duration between ticket creation and its first resolution") and full resolution ("its most recent resolution"); requester wait time (New + Open + On-hold) versus agent wait time (Pending); reopened counts exclude "tickets solved and reopened during the same update" ([Zendesk duration metrics](https://support.zendesk.com/hc/en-us/articles/4408834848154-About-native-Support-time-duration-metrics); [metrics & attributes](https://support.zendesk.com/hc/en-us/articles/4408827693594-Metrics-and-attributes-for-Zendesk-Support)). Intercom time to close until "closed by a teammate for the last time"; "Snoozing a conversation counts towards time to close"; handling time excludes bot, unassigned, snoozed and closed time ([Intercom metrics](https://www.intercom.com/help/en/articles/7022438-reporting-metrics-attributes)). Freshdesk "No of times resolved", ticket age, time per status; FCR requires "the customer reply count must remain 0 after the first interaction" ([Freshdesk support metrics](https://support.freshdesk.com/support/solutions/articles/50000000041-support-metrics-in-freshdesk-analytics)). Salesforce milestones: "(Elapsed Time) – (Stopped Time) = (Actual Elapsed Time)" ([Salesforce entitlements guide](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/salesforce_entitlements_implementation_guide.pdf)). Help Scout: "A conversation is only resolved when it has at least one User reply and a Closed status" ([Help Scout email reports](https://docs.helpscout.com/article/380-email)). Zoho Desk excludes On Hold from agent response time; transfers keep the original creation time ([Zoho Desk SLA FAQ](https://help.zoho.com/portal/en/kb/desk/faqs/automation/articles/faqs-sla-service-level-agreement)). HubSpot "Average time to close" ([HubSpot service analytics](https://knowledge.hubspot.com/reports/create-service-reports-in-the-service-analytics-suite)).

**(c) Good versus weak.** Good: first versus full resolution with a reopen rate; time split into waiting-on-us, waiting-on-customer and on-hold; a close without a reply does not count as resolved (Help Scout); snooze and pending treatment stated; deterministic merge and transfer handling. Weak: creation-to-last-close only.

**(d) Rating: TABLE STAKES** for time to close; **COMMON** for first/full resolution with time-in-status.

#### 5.3 SLA policies and attainment

**(a) What it is.** Conditional policies setting first-reply, next-reply or periodic-update, and resolution targets by priority or tier, on business-hour and holiday calendars, with pause states, breach warnings, escalations and attainment reports.

**(b) Who has it.**

- **Zendesk** (Suite Growth+) — seven metrics including next reply time ("oldest unanswered customer comment" to next public agent comment) and periodic update; targets only on the system Priority field ("Custom fields (even if they are named 'Priority') can't be used as targets"); "Four SLA targets don't pause in pending status: First Reply Time, Next Reply Time, Periodic Update Time, and Total Resolution Time"; warning automations run hourly, so "You can't send a notification at the exact moment of an SLA breach"; re-applying a policy to a breached ticket "records another breach event"; "% Achieved SLA tickets" means _all_ targets met, and attainment = achieved ÷ (achieved + breached), so tickets still running are excluded ([Zendesk SLA policies](https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies); [pause or reset](https://support.zendesk.com/hc/en-us/articles/4408825745690-Can-I-pause-the-SLA-timer-or-reset-it-under-certain-conditions); [breach alerts](https://support.zendesk.com/hc/en-us/articles/4408820131994-Workflow-How-to-alert-your-team-to-tickets-nearing-an-SLA-breach); [troubleshooting](https://support.zendesk.com/hc/en-us/articles/11006936409882-Troubleshooting-common-SLA-issues); [metrics & attributes](https://support.zendesk.com/hc/en-us/articles/4408827693594-Metrics-and-attributes-for-Zendesk-Support)).
- **Intercom** (Expert plan) — first response, next response, time to close, time to resolve; "Intercom supports only one active SLA per conversation"; optional pause on snoozed or waiting-on-customer, and "If an SLA is missed while a conversation is snoozed, the conversation will be automatically unsnoozed"; office hours stretch targets (a 1-day target from 4:55pm Friday "translates to 5 calendar days"); outcomes Hit, Missed and "Fixed" (missed but completed later); breach-time workflow triggers in beta ([Intercom set SLAs](https://www.intercom.com/help/en/articles/6546152-set-slas-for-conversations-and-tickets); [SLAs and office hours](https://www.intercom.com/help/en/articles/9263617-slas-and-office-hours); [SLA reporting](https://www.intercom.com/help/en/articles/2672572-slas-reporting); [SLA triggers](https://www.intercom.com/help/en/articles/15362781-trigger-a-workflow-before-or-when-an-sla-breaches)).
- **Freshdesk** — per-priority targets for first response, every response and resolution; "You can add up to 1000 SLA policies and 500 Business Hours"; pending timers off by default and per-status freeze; reminders "from 5 minutes to 4 hours" before breach; multiple policies "starting from the Pro plan"; First Response SLA% is responses within SLA ÷ tickets that received a first response; next-response compliance judged per ticket, so one miss fails the ticket; holiday lists must be "updated annually" ([Freshdesk SLA](https://support.freshdesk.com/support/solutions/articles/37626-understanding-sla-policies); [every-response SLA](https://support.freshdesk.com/support/solutions/articles/50000001634-setting-sla-targets-for-every-response); [SLA percentages](https://support.freshdesk.com/support/solutions/articles/226849-how-are-the-resolution-sla-and-first-response-sla-percentage-metrics-calculated-)).
- **HubSpot** (Service Hub Pro+) — first reply, next reply, time to close; "the SLA timer stops while those conditions are met and resumes once they no longer apply" for chosen pipeline statuses; "If the ticket or its associated properties change afterward, the SLA rule won't be re-evaluated"; older inbox SLAs ignore holidays ([HubSpot help desk SLAs](https://knowledge.hubspot.com/help-desk/set-sla-goals-in-help-desk); [inbox SLAs](https://knowledge.hubspot.com/inbox/set-slas-in-the-inbox)).
- **Salesforce** — entitlement processes with up to 10 milestones, success/warning/violation actions, "Time-triggered actions only occur during your Salesforce org's business hours", "Milestones aren't marked completed automatically", and entitlements do not auto-apply to Web-to-Case or Email-to-Case ([Salesforce entitlements guide](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/salesforce_entitlements_implementation_guide.pdf)).
- **Zoho Desk** — up to 10 targets per SLA; an SLA set to run on several triggers "will reset for each update"; "a maximum of two response and four resolution escalations"; contract SLAs Enterprise only; On Hold freezes timers and "Overdue tickets moved to an On Hold state will not be considered as overdue"; violations counted per ticket and per instance ([Zoho Desk SLAs](https://help.zoho.com/portal/en/kb/desk/automation/escalate-sla/articles/understanding-and-working-with-slas); [Zoho Desk SLA dashboard](https://help.zoho.com/portal/en/kb/desk/reports-and-dashboards/dashboards/articles/sla-dashboard)).
- **Help Scout** — "SLA policies only apply to conversations created after the policy itself was created"; "Conversations that are still in progress with no breach yet are excluded from the compliance calculation entirely" ([Help Scout SLAs](https://docs.helpscout.com/article/1751-create-and-manage-service-level-agreements-slas); [Help Scout SLA reports](https://docs.helpscout.com/article/1761-reports-slas)). **Front** time-goal rules whose timer "does not take business hours into account" ([Front time goals](https://help.front.com/en/articles/3038464)).

**(c) Good versus weak.** Good: explicit match order with a fallback policy; next-reply or periodic-update targets as well as first reply; per-policy business hours with regional holiday calendars; chosen pause statuses including custom ones; minute-level warnings with actions (reassign, notify, raise priority), not hourly batches; permanent breach records with documented re-apply and edit behaviour; attainment per target and per ticket with a stated denominator; late-completion and time-after-breach metrics (Intercom). Weak: one global policy, calendar hours only, no pause, a bare breach count.

**(d) Rating: TABLE STAKES** at the mid tier (every vendor gates it); **COMMON** for pause conditions, holidays and escalations; **DIFFERENTIATOR** for minute-level breach triggers and late-completion reporting.

#### 5.4 Backlog

**(a) What it is.** Open work by age and status, its trend over time, and the unassigned queue.

**(b) Who has it.** Zendesk Backlog history dataset — "a snapshot of unsolved tickets at any given date"; channel attributed to "the channel the backlog ticket was most recently updated by" ([Zendesk metrics & attributes](https://support.zendesk.com/hc/en-us/articles/4408827693594-Metrics-and-attributes-for-Zendesk-Support)). Intercom open-at-end-of-period, snoozed and reopened counts, with only two years of history loaded ([Intercom reporting FAQ](https://www.intercom.com/help/en/articles/8921906-reporting-faqs)); real-time unassigned, waiting and longest-waiting ([Intercom real-time dashboard](https://www.intercom.com/help/en/articles/5784131-real-time-dashboard)). Freshdesk "Backlogs - Unresolved Tickets" and an operations dashboard of tickets going overdue soon ([Freshdesk dashboards](https://support.freshdesk.com/support/solutions/articles/50000011779-dashboards-in-freshdesk)). HubSpot real-time open tickets and SLA due-soon ([HubSpot analyze help desk](https://knowledge.hubspot.com/help-desk/analyze-help-desk)). Salesforce Omni Supervisor queue and skills backlog ([Omni Supervisor guide](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/omnichannel_supervisor.pdf)). Zoho Desk "The average number of tickets that were not closed by the end of the day" ([Zoho Desk overview dashboard](https://help.zoho.com/portal/en/kb/desk/reports-and-dashboards/dashboards/articles/overview-dashboard-desk)).

**(c) Good versus weak.** Good: stored daily snapshots, because backlog history cannot be rebuilt from today's data; age buckets and time since last update; breakdowns by status, group, priority and channel (with the channel rule stated); unassigned and unreplied counts; oldest waiting ticket; an overdue-soon list. Weak: a current count only.

**(d) Rating: TABLE STAKES** for the current backlog; **COMMON in dedicated help desks** (Zendesk, Freshdesk, Zoho Desk, Intercom's period-end counts) and **DIFFERENTIATOR** elsewhere for backlog history.

#### 5.5 CSAT, NPS and CES

**(a) What it is.** Post-interaction satisfaction, relationship loyalty and effort surveys, with response capture, follow-ups and reporting by agent and group.

**(b) Who has it.** Zendesk: scales 1-2, 1-3 or 1-5 ("1-3 is bad and 4-5 is good"); email sent "one day after the ticket is set to solved" with "28 days, by default, to respond"; "Satisfaction ratings are per ticket, not per customer"; score = good ÷ rated, plus % rated and % surveyed ([Zendesk CSAT](https://support.zendesk.com/hc/en-us/articles/7689997846554-Sending-a-CSAT-survey-to-your-customers); [CSAT experience](https://support.zendesk.com/hc/en-us/articles/4408886173338-About-the-CSAT-Customer-Satisfaction-user-experience-for-email-and-messaging); [viewing CSAT](https://support.zendesk.com/hc/en-us/articles/4408846011546-Viewing-your-CSAT-customer-satisfaction-score-and-ratings)); Zendesk removed native NPS from April 2023 ([Zendesk: what is being removed](https://support.zendesk.com/hc/en-us/articles/4408843026714-What-is-being-removed-updated-September-2026)) and offers CES only through its QA add-on ([Zendesk surveys dashboard](https://support.zendesk.com/hc/en-us/articles/7043759414042-Accessing-and-viewing-the-Surveys-dashboard)). Intercom: eligibility rules (a teammate replied, over 250 characters, closed within a week of the last reply); "The rating is applied to the teammate who last sent a message"; request and response rates; an AI "CX Score" 1-5 "typically assigned within 2-3 hours after the conversation is closed" ([Intercom ratings](https://www.intercom.com/help/en/articles/7872853-measure-customer-satisfaction-with-conversation-ratings); [CX Score](https://www.intercom.com/help/en/articles/10495092-understand-customer-experience-at-scale-with-the-cx-score)). Freshdesk scales "up to a 10-point", per-contact frequency cap ("Send one survey every n requests per day/week/month"), answers usable in automations ([Freshdesk CSAT](https://support.freshdesk.com/support/solutions/articles/50000009790-the-new-csat-module-how-to-set-up-send-out-and-collect-responses)). HubSpot is the only help desk here with native CSAT, NPS and CES: CES on a 7-point scale sent "only once per ticket"; NPS "0 - 6 Detractors", "9 - 10 Promoters"; workflows per score band ([HubSpot CES](https://knowledge.hubspot.com/customer-feedback/how-do-i-send-a-customer-support-survey); [HubSpot NPS](https://knowledge.hubspot.com/customer-feedback/how-do-i-send-a-customer-loyalty-survey); [HubSpot CSAT](https://knowledge.hubspot.com/customer-feedback/create-and-send-customer-satisfaction-surveys)). Zoho Desk Good/Okay/Bad with reopen-on-negative ([Zoho Desk happiness rating](https://help.zoho.com/portal/en/kb/desk/organization-settings/customer-happiness/articles/setting-up-customer-happiness-rating)). Help Scout Happiness Score "% of Great ratings and subtract the % of Not Good" ([Help Scout happiness](https://docs.helpscout.com/article/383-reports-happiness)). Benchmarks: CSAT 64-80%, NPS about 50 ([Zendesk help desk metrics](https://www.zendesk.com/in/blog/customer-service/help-desk/top-10-help-desk-metrics/)).

**(c) Good versus weak.** Good: configurable scale with explicit cut-offs; eligibility rules (minimum conversation, no stale or group threads); delay and expiry; per-contact caps; follow-up question and reason capture on negatives; request and response rates reported; explicit attribution (last replier, all repliers, assignee); reopen or alert on a bad rating; stated reporting date; AI-inferred scores to cover non-responders. Weak: a score with no response rate, no attribution rule, and no follow-up.

**(d) Rating: TABLE STAKES** for CSAT; **COMMON** for NPS and CES (native in HubSpot, a survey type in Intercom, while Zendesk dropped native NPS); **DIFFERENTIATOR** for AI-inferred satisfaction that needs no customer input ("Unlike CSAT, CX Score does not require customer input" — Intercom; Front's Smart CSAT).

#### 5.6 Volume by channel, tag and topic

**(a) What it is.** Ticket volume broken down by channel, tag, form and topic, including AI clustering.

**(b) Who has it.** Zendesk channel and tag attributes; intelligent triage by topic, sentiment and language — classifications on Professional+, "Using them in workflows requires the Copilot add-on", English only in Explore ([Zendesk intelligent triage](https://support.zendesk.com/hc/en-us/articles/4964463770650-About-intelligent-triage)). Intercom Topics Explorer (Pro add-on, from $99 a month for 1,000 conversations): 90-day backfill, daily refresh, "At least 15 questions or conversations are needed to form a meaningful subtopic", topics renamed and merged by people ([Intercom Topics Explorer](https://www.intercom.com/help/en/articles/11390087-use-the-topics-explorer-to-see-what-s-driving-volume); [Intercom Pro add-on](https://www.intercom.com/help/en/articles/13868265-pro-add-on)). HubSpot Topics (beta) — "topics are currently unavailable for sensitive data accounts", a constraint worth noting for a fintech ([HubSpot topics](https://knowledge.hubspot.com/customer-agent/use-topics-to-analyze-customer-interactions)). Zoho Desk Auto Tags need "a minimum of 3000 individual tickets" to train ([Zoho Desk auto tags](https://help.zoho.com/portal/en/kb/desk/zia/intelligence/articles/understanding-zia-auto-tags)). Help Scout volume by channel, top tags and a "Busiest time of day" heat map ([Help Scout all channels](https://docs.helpscout.com/article/381-all-channels)). Freshdesk ticket creation and assignment report ([Freshdesk curated reports](https://support.freshdesk.com/support/solutions/articles/50000010308-introducing-new-curated-reports-for-better-insights)).

**(c) Good versus weak.** Good: a stated channel rule (at creation or latest); breakdowns by tag, field and form; previous-period comparison; AI clusters with a minimum size and human curation; metrics per topic (resolution time, CSAT); spike alerts. Weak: volume by tag only, with free-form tags.

**(d) Rating: TABLE STAKES** for channel and tag volume; **DIFFERENTIATOR** for AI topic clustering, which the large vendors mostly sell as a paid add-on.

#### 5.7 Agent workload, productivity and real-time views

**(a) What it is.** Per-agent volume and quality, presence and capacity, and a live view of the queue.

**(b) Who has it.** Zendesk agent replies, assignee stations, reopens, one-touch ("solved after one agent reply or no agent replies"); live dashboard updating in "5–10 seconds", being replaced by real-time monitoring; historical data refreshed daily on lower plans, hourly on Professional+ ([Zendesk live dashboard](https://support.zendesk.com/hc/en-us/articles/4408843771546-Overview-of-the-Explore-live-dashboard); [refresh intervals](https://support.zendesk.com/hc/en-us/articles/4408823242778-Data-refresh-intervals-for-analytics)). Intercom real-time dashboard (Expert): "SLA and CSAT only update every 15 mins. All other metrics auto refresh every 60 seconds"; workload as open conversations ÷ assignment limit ([Intercom real-time dashboard](https://www.intercom.com/help/en/articles/5784131-real-time-dashboard); [workload](https://www.intercom.com/help/en/articles/6560699-monitoring-your-team-s-workload-and-capacity)). Freshdesk live widgets every 30 seconds ([Freshdesk team dashboards](https://support.freshdesk.com/support/solutions/articles/234371-team-dashboards-setup-and-functionality)). Salesforce Omni Supervisor presence and "open capacity" ([Omni Supervisor guide](https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/omnichannel_supervisor.pdf)). HubSpot coaching page with one-touch tickets, CSAT and CES (Enterprise) ([HubSpot coaching](https://knowledge.hubspot.com/help-desk/use-the-help-desk-coaching-page)). Zoho Desk agent performance refreshed "once every hour", and "Deleted, merged, and spam tickets are not excluded" ([Zoho Desk agent performance](https://help.zoho.com/portal/en/kb/desk/reports-and-dashboards/reports/articles/understanding-the-agent-performance-report)). Help Scout handle time keeps "only the final visit before sending" ([Help Scout email reports](https://docs.helpscout.com/article/380-email)).

**(c) Good versus weak.** Good: solved, replies, one-touch, reopens and reassignments per agent; handle time as active time only; presence and capacity ratios; documented refresh cadence; drill from any number to the conversations. Weak: tickets solved per agent from a daily batch, including spam and merges.

**(d) Rating: TABLE STAKES** for per-agent counts; **COMMON** (top tiers) for live dashboards and presence; **DIFFERENTIATOR** for capacity and occupancy ratios.

#### 5.8 Reporting mechanics in support tools

**(a) What it is.** Prebuilt dashboards, a custom builder, scheduled delivery and export.

**(b) Who has it.** Zendesk Explore Lite / Professional / Enterprise; scheduled delivery as CSV, Excel, PNG or PDF with a "25 MB" attachment limit; dataset exports avoid "the same 50,000-row limit that reports do" ([Zendesk Explore plans](https://support.zendesk.com/hc/en-us/articles/4408823356186-About-the-Zendesk-Explore-plan-types); [scheduling](https://support.zendesk.com/hc/en-us/articles/4408843602714-Scheduling-dashboard-deliveries); [dataset export](https://support.zendesk.com/hc/en-us/articles/6037992005914-Exporting-datasets-from-Explore)). Intercom templates on all plans, custom reports on higher plans (a downgrade makes existing custom charts inaccessible), "Reports snapshot user and company attributes at the time of conversation creation", instant downloads up to 10,000 rows, external report links "active for 30 days" ([Intercom reporting FAQ](https://www.intercom.com/help/en/articles/8921906-reporting-faqs); [Intercom export](https://www.intercom.com/help/en/articles/2046229-export-your-conversations-data); [external sharing](https://www.intercom.com/help/en/articles/13004328-schedule-sharing-your-reports-externally)). HubSpot: object data reaches the custom report builder "within 2–3 minutes" ([HubSpot service analytics](https://knowledge.hubspot.com/reports/create-service-reports-in-the-service-analytics-suite)). Freshdesk custom reporting, scheduling and export on Pro+ ([Freshdesk analytics by plan](https://support.freshdesk.com/support/solutions/articles/50000001108-analytics-features-for-each-plan)). Help Scout: custom reports "Not in the app", 10-15 minute lag ([Help Scout reports](https://docs.helpscout.com/article/385-reports)). Front scheduled reports to internal or external recipients with CSV ([Front scheduled reports](https://help.front.com/en/articles/2148)). Capterra: reporting/analytics rated critical or highly important by 72% of help-desk reviewers ([Capterra help desk](https://www.capterra.com/help-desk-software/)).

**(c) Good versus weak.** Good: each metric's definition in a popover where it is shown; drill from any number; explicit attribute snapshotting; stated latency; scheduled email with raw CSV; bulk export without row limits; role-based sharing. Weak: fixed reports only.

**(d) Rating: TABLE STAKES** for prebuilt dashboards; **COMMON** for custom builder plus scheduling plus export.

#### 5.9 AI agent and self-service reporting

**(a) What it is.** Measuring what the AI agent and self-service actually resolve.

**(b) Who has it.** Intercom: Fin resolution is confirmed or assumed (an assumed resolution "is auto-closed after 3 minutes"); "Automation Rate = Involvement Rate × Resolution Rate"; "Deflected" includes customers who left without an answer ([Intercom metrics](https://www.intercom.com/help/en/articles/7022438-reporting-metrics-attributes)); content-gap recommendations ([Intercom content recommendations](https://www.intercom.com/help/en/articles/11394959-use-ai-powered-content-recommendations-to-improve-fin)). Zendesk since 18 May 2026: automated resolution rate "(Contained + Verified) / (Unassisted conversations + Assisted Escalations + Contained + Verified) x 100", only Verified billed ([Zendesk resolution tiers](https://support.zendesk.com/hc/en-us/articles/9570369117338-About-automated-resolution-tiers); [AI agent reporting changes](https://support.zendesk.com/hc/en-us/articles/10677925692698-Announcing-changes-to-AI-agent-reporting)). HubSpot: resolution evaluated 72 hours after the visitor's last message; "Deflections do not always indicate resolution"; knowledge-gap flags ([HubSpot customer agent performance](https://knowledge.hubspot.com/customer-agent/analyze-your-customer-agents-performance)). Help Scout AI resolution "resolved without help from a human" at $0.75 ([Help Scout AI resolutions](https://docs.helpscout.com/article/1746-ai-resolutions-pricing)).

Zendesk also defines a self-service score (help-centre sessions ÷ ticket requesters) and treats searches with no results or no clicks as content gaps ([Zendesk self-service metrics](https://support.zendesk.com/hc/en-us/articles/4408894139930-Getting-started-with-self-service-Part-6-Tracking-essential-self-service-metrics)).

**(c) Good versus weak.** Good: involvement, resolution, deflection and escalation reported separately with denominators shown; a fixed evaluation window; confirmed versus assumed versus verified; handoff reasons; separate CSAT for the AI; AI and human results side by side; knowledge-gap work items linked to the conversations behind them. Weak: "deflection" presented as resolution.

**(d) Rating: COMMON** among vendors selling AI agents (every one reports a resolution rate, with different definitions); **DIFFERENTIATOR** for verified definitions and knowledge-gap reporting.

### 6. Sales-ops automation and the quote-to-cash front end

Pipedrive's help centre rate-limited requests and monday's refused them for most of this section, so several of their cells are unverified; Salesforce evidence comes from its edition matrix and Trailhead.

**At a glance** (Y native; P partial, integration or separate product; N not found; ? unverified):

| Feature                | HubSpot   | Salesforce          | Pipedrive | Attio  | Close      | Zoho   | Freshsales    | Copper | monday             |
| ---------------------- | --------- | ------------------- | --------- | ------ | ---------- | ------ | ------------- | ------ | ------------------ |
| Lead scoring           | Y Pro+    | Y (AI) Core add-on+ | ?         | N      | N          | Y      | Y             | N      | Y Ultimate         |
| Routing                | Y Pro+    | Y                   | ?         | Y      | P (random) | Y      | Y             | N      | ?                  |
| Territories            | N (teams) | Y Core+             | ?         | N      | N          | Y Ent+ | Y Pro         | N      | N                  |
| Sequences              | Y Pro+    | Y                   | Y         | Y Pro+ | Y Growth+  | Y      | Y Pro+        | P      | Y Pro+             |
| Workflows              | Y         | Y                   | Y Growth+ | Y      | Y Growth+  | Y      | Y             | Y Pro+ | Y (quota)          |
| Approvals              | Y         | Y Core+             | ?         | N      | N          | Y Ent+ | N             | N      | P                  |
| Quotes                 | Y         | Y Pro Suite+        | ?         | P      | N          | Y      | Y (add-on)    | P      | Y                  |
| Products / price books | Y         | Y                   | Y         | N      | N          | Y      | Y             | N      | P                  |
| Customer portal        | Y         | Y (licensed)        | ?         | N      | N          | Y Ent+ | P (Freshdesk) | N      | P (monday service) |
| Web forms              | Y         | Y                   | ?         | P      | Y          | Y      | Y             | Y      | Y                  |
| Chat / meeting links   | Y / Y     | Y / P               | ? / ?     | N / P  | N / Y      | P / Y  | Y / ?         | N / N  | ? / ?              |
| Surveys                | Y         | Y                   | ?         | N      | N          | P      | P             | N      | P                  |

#### 6.1 Lead scoring

**(a) What it is.** A score or grade ranking leads, contacts, companies or deals. Rules-based scoring adds points for **fit** (who they are) and **engagement** (what they did), with decay and thresholds; predictive scoring trains on past conversions.

**(b) Who has it.**

- **HubSpot** (Pro and Enterprise) — engagement, fit or combined scores on contacts, companies and deals; decay of "1, 3, 6, or 12 months"; thresholds as High/Medium/Low or a 3×3 grid "A1... C3" ([HubSpot lead scoring tool](https://knowledge.hubspot.com/scoring/understand-the-lead-scoring-tool)); limits: Marketing Pro "Up to 5 scores", Marketing Enterprise "Up to 50 scores. Includes AI recommendations", Sales Pro 5, Sales Enterprise 10 ([HubSpot catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)); per-record "score trends by month" and the "events that caused the score to change" ([score history](https://knowledge.hubspot.com/scoring/lead-score-history-and-performance)); test a score on one record with a per-rule breakdown before publishing ([test records](https://knowledge.hubspot.com/scoring/test-records-in-scoring-tools)); AI scores need "a minimum sample size of 50 contacts, containing 25 converted and 25 non-converted".
- **Salesforce** — Lead Scoring purchasable on Core, included on Advanced and Max ([Salesforce pricing](https://www.salesforce.com/sales/pricing/)); Einstein behaviour scoring needs "A year of engagement data" and "At least 20 prospects linked to opportunities", updated "typically... every 4 hours" ([Trailhead: Einstein scoring](https://trailhead.salesforce.com/content/learn/modules/lead-scoring-and-grading-in-account-engagement/einstein-scoring-in-account-engagement)); rules-based points live in Account Engagement, with decay done by automation rules ([Trailhead: lead scoring](https://trailhead.salesforce.com/content/learn/modules/lead-scoring-and-grading-in-account-engagement/get-started-with-lead-scoring)).
- **Zoho CRM** — scoring rules plus AI; "up to ten rules, out of which five of them can be active" per layout; touchpoints from email, calls, campaigns, surveys and Desk; a score-change workflow trigger; but on rescoring after a rule edit, "Workflows related to those records will not be triggered" ([Zoho multiple scoring rules](https://help.zoho.com/portal/en/kb/crm-v2-1/automate-business-processes/scoring-rules/articles/crm-v2-multiple-scoring-rule)); predictions need "at least 200 records", retrained "once every fortnight" ([Zia field prediction](https://help.zoho.com/portal/en/kb/crm/zia-artificial-intelligence/prediction/articles/zia-s-field-prediction)).
- **Freshsales** — Freddy scores contacts 0-99 with admin-defined positive and negative "signals"; star "customer fit" and "score change over the last 7 days" ([Freshsales contact scoring](https://crmsupport.freshworks.com/support/solutions/articles/50000002580-what-is-contact-scoring-how-to-setup-scoring-signals-); [prioritise contacts](https://crmsupport.freshworks.com/support/solutions/articles/50000003001-how-to-use-contact-scoring-to-prioritize-contacts-)).
- **monday CRM** — "Lead scoring — Automatically score your leads based on custom criteria" on Ultimate only ([monday CRM pricing](https://monday.com/crm/pricing)).
- **Close** — none: "Score leads in Close with Custom Fields, Custom Activities, and Smart Views" ([Close lead scoring](https://help.close.com/best-practices/lead-scoring)). **Attio** — none native; AI "Classify Record" attributes as a workaround ([Attio AI attributes](https://attio.com/blog/introducing-ai-attributes)). **Copper** — none ([Copper pricing](https://www.copper.com/pricing)).

**(c) Good versus weak.** Good: separate fit and engagement axes plus a combined matrix; negative points, time-boxed criteria and decay; several scores per object (per product or region); thresholds that set lifecycle stage and fire routing; per-record history with the reason for each change; testing before publishing; AI scoring with stated data minimums and visible factors. Weak: a number field bumped by workflows (only ever grows, no history); opaque AI; rescoring that silently skips or floods automations.

**(d) Rating: COMMON** (five of nine native, mostly mid-tier); **DIFFERENTIATOR** for predictive scoring.

#### 6.2 Lead routing and assignment

**(a) What it is.** Setting the owner or queue of a new lead, deal or ticket automatically, by criteria and rotation, ideally aware of availability and capacity.

**(b) Who has it.**

- **HubSpot** — "Rotate record to owner" workflow action (Sales/Service Pro+) with round robin, load-balanced (fewest open items) or random for leads and tickets; "Assign to available users only", otherwise the record is left "(No owner)"; "HubSpot will only allow one object to be rotated at a time" ([HubSpot rotate owners](https://knowledge.hubspot.com/workflows/assign-and-rotate-record-owners-using-workflows)); chats and forms go to "the least busy available user" ([HubSpot routing rules](https://knowledge.hubspot.com/inbox/set-your-conversations-routing-rules)); lead form routing on Sales Enterprise ([HubSpot catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)).
- **Salesforce** — "Lead Assignment and Routing" in every edition ([Salesforce pricing](https://www.salesforce.com/sales/pricing/)); Omni-Channel routes by capacity ("least active" or "most available"), skills or queue, and "A work item uses one or the other—never both" ([Trailhead: enhanced Omni-Channel](https://trailhead.salesforce.com/content/learn/modules/enhanced-omni-channel/improve-work-distribution-with-enhanced-omni-channel)).
- **Zoho CRM** — round-robin assignment rules across users, roles or groups, aware of "online status (logged in to CRM) and/or shift timing", up to 25 criteria per entry, but applied only to records from "import, Webform, and API" ([Zoho assignment rules](https://help.zoho.com/portal/en/kb/crm/automate-business-processes/assignment-rules/articles/set-assignment-rules)); an Assignment Threshold sets "an upper limit to the number of records" per user per period, with overflow to a default assignee ([Zoho assignment threshold](https://help.zoho.com/portal/en/kb/crm/automate-business-processes/assignment-threshold/articles/assignment-threshold)).
- **Attio** — a "Round robin" workflow block that spreads "picks evenly across everyone in the rota", no availability awareness ([Attio block library](https://attio.com/help/reference/automations/workflows/workflows-block-library)).
- **Freshsales** — round-robin auto-assignment rules in priority order, pools filled from territories ([Freshsales auto-assign](https://crmsupport.freshworks.com/support/solutions/articles/50000002703-how-to-auto-assign-records-to-users-sales-owners-)).
- **Close** — partial: "The Assign User step does not support round robin or rotation assignment at this time" (random pick), with an app as the workaround ([Close workflow steps](https://help.close.com/feature-guide/workflows/workflow-steps); [Close round robin](https://help.close.com/best-practices/simplify-your-workflows-with-automated-senders/new-assign-leads-to-users-via-round-robin)). **Copper** — no assignment rules documented ([Copper workflow automation](https://support.copper.com/en/articles/8823368-automating-your-account-with-workflow-automation)).

**(c) Good versus weak.** Good: match criteria first (segment, territory, existing account owner), then rotate (round robin, weighted or load-balanced); honour working hours, out-of-office and caps; a fallback queue; every entry point covered, including manual creation; re-route when an SLA passes untouched; log why an owner was chosen. Weak: random picks; import-only rules; records left ownerless.

**(d) Rating: TABLE STAKES** for criteria plus round robin; **DIFFERENTIATOR** for availability- and capacity-aware routing (HubSpot, Zoho, Salesforce Omni-Channel).

#### 6.3 Territories

**(a) What it is.** A territory object with rules placing accounts into it, driving visibility, routing pools and forecast roll-ups independently of record ownership.

**(b) Who has it.** Salesforce Sales Territories on Core and up ([Salesforce pricing](https://www.salesforce.com/sales/pricing/)), with guidance that "More than 10,000 records associated with a territory can create performance inefficiencies" ([Trailhead: territory performance](https://trailhead.salesforce.com/content/learn/modules/advanced-territory-management/optimize-enterprise-territory-management-performance)). Zoho Enterprise and up — "Assign leads, customers, and accounts to sales reps based on product line, geography, and verticals", nested territories auto-assigned on create or edit ([Zoho territory management](https://help.zoho.com/portal/en/kb/crm/security-control/territory-management)). Freshsales Pro — "A maximum of 1000 territories", with members who can view and edit "but they won't be assigned as the owner" ([Freshsales territories](https://crmsupport.freshworks.com/support/solutions/articles/50000002702-how-to-create-and-use-territories-)). HubSpot has teams, not territories ("Up to 300 teams" on Enterprise) ([HubSpot catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)); Attio, Close, Copper and monday have none.

**(c) Good versus weak.** Good: rule-defined territories with priority; hierarchy for forecast roll-up; access separate from ownership; realignment with preview and effective dates; opportunities inherit the account's territory. Weak: a "region" picklist.

**(d) Rating: DIFFERENTIATOR** (three of nine, all above entry tier).

#### 6.4 Sequences and cadences

**(a) What it is.** Timed, per-prospect outreach — automated emails, call, LinkedIn and manual tasks, waits — sent from the rep's mailbox and stopping when the prospect engages.

**(b) Who has it.** All nine in some form.

- **HubSpot** (Pro+) — "5,000 sequences per account, and up to 500 email sends/user/day" on Pro, 1,000 on Enterprise ([HubSpot catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)); a rolling limit "calculated 24 hours forwards and 24 hours backwards" ([HubSpot send limits](https://knowledge.hubspot.com/email/sales-email-send-limits)); delays up to "90 business days"; unenrol on reply or meeting booked, optionally for "All contacts at the company" ([HubSpot sequences](https://knowledge.hubspot.com/sequences/create-and-edit-sequences)); A/B tests of up to 6 versions ([HubSpot sequence A/B](https://knowledge.hubspot.com/sequences/automate-a-b-testing-emails-with-sequences)).
- **Salesforce** cadences branch to "the positive or negative track" ([Trailhead: cadences](https://trailhead.salesforce.com/content/learn/modules/high-velocity-sales/get-to-know-the-console-and-cadences)); rep availability windows and Skip Weekend ([Trailhead: cadence settings](https://trailhead.salesforce.com/content/learn/modules/quick-cadences-for-sales-teams/use-linkedin-and-explore-more-settings)).
- **Attio** (Pro+) — "automated email steps only"; exits when the recipient replies or "a new calendar event is booked between them and the sender" ([Attio sequences](https://attio.com/help/reference/automations/sequences/create-a-sequence)).
- **Close** (Growth+) — email, SMS, call, task steps; default window "Monday through Friday at a random time between 9AM - 4PM" in the recipient's time zone; goals end runs as "Goal Met" ([Close workflows](https://help.close.com/feature-guide/workflows)).
- **Zoho** cadences branch on "Opened, Bounced, Replied, Clicked, Sent, Unsubscribed", 20-70 cadences by edition ([Zoho cadences](https://help.zoho.com/portal/en/kb/crm/automate-business-processes/cadences/articles/cadences)).
- **Freshsales** — Pro 10 sequences and 1,000 emails per user per day, Enterprise 25 and 2,000; "maximum of 25 Steps"; "smart" sequences re-check conditions while a skipped classic step "will never be revisited" ([Freshsales sequence limits](https://crmsupport.freshworks.com/support/solutions/articles/50000002619-what-are-the-different-user-limits-in-sales-sequences-); [classic vs smart](https://crmsupport.freshworks.com/support/solutions/articles/50000002163-what-are-classic-and-smart-sequences-where-should-they-be-used-)).
- **Pipedrive** — "Up to 100 deals or contacts per sequence" ([Pipedrive automation limits](https://support.pipedrive.com/en/article/automation-limits)); **Copper** — up to 7-email series on Business and "a limit of 900 automated emails that can be sent per day from your company" ([Copper email automation](https://support.copper.com/en/articles/8879978-best-practices-for-email-automation)).

**(c) Good versus weak.** Good: multichannel steps and threading; per-sender caps with time-zone windows and holidays; auto-exit on reply, meeting, bounce, unsubscribe or a CRM change, including account-wide exit; engagement branching; safe edits to live sequences; A/B tests; enrolment from workflows; step-level reporting. Weak: email-only drips; company-wide caps; no reply detection.

**(d) Rating: TABLE STAKES** (depth is tier-gated).

#### 6.5 Workflow automation

**(a) What it is.** A trigger → conditions → actions engine with branches and delays.

**(b) Who has it.** All nine.

- **HubSpot** — Sales Starter "Up to 50 workflows with restricted triggers and actions", Pro 300, Enterprise 1,000 with "workflow health monitoring" ([HubSpot catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)); action logs kept "90 days", enrolment history "6 months" ([HubSpot workflows FAQ](https://knowledge.hubspot.com/workflows/workflows-faq)); "Re-enrollment can only happen after the record is manually unenrolled from or has exited the workflow" ([HubSpot re-enrolment](https://knowledge.hubspot.com/workflows/add-re-enrollment-triggers-to-a-workflow)); Enterprise can undo a workflow's property changes from "the last 14 days" ([HubSpot restore changes](https://knowledge.hubspot.com/workflows/restore-workflow-crm-property-changes)).
- **Salesforce Flow** — "5 flows per org" on Pro Suite, full from Core ([Salesforce pricing](https://www.salesforce.com/sales/pricing/)); before/after-save triggers and scheduled paths ([Trailhead: record-triggered flows](https://trailhead.salesforce.com/content/learn/modules/record-triggered-flows/get-started-with-triggered-flows)); fault paths ([Trailhead: fault paths](https://trailhead.salesforce.com/content/learn/modules/flow-implementation-2/handle-flow-errors-with-fault-paths)); debug as another user with "rollback mode" ([Trailhead: debug flows](https://trailhead.salesforce.com/content/learn/modules/flow-implementation-2/debug-flows-as-another-user)).
- **Pipedrive** (Growth+) — 50/150/250 active automations by plan; delay steps with "Total delay per automation is 90 days"; "up to 10,000 executions within ten minutes" per company ([Pipedrive automation limits](https://support.pipedrive.com/en/article/automation-limits)).
- **Attio** — "Triggers, logic, and data lookups are free"; writes and HTTP calls cost 1 credit ([Attio credits](https://attio.com/help/reference/workspace-settings-billing/manage-workspace-and-seat-credits)); webhook and cron triggers, loops, HTTP, JavaScript with a "100-second timeout" ([Attio block library](https://attio.com/help/reference/automations/workflows/workflows-block-library)); drafts, versions and restore ([Attio manage workflows](https://attio.com/help/reference/automations/workflows/manage-workflows)); "Retry from failed" ([Attio troubleshooting](https://attio.com/help/reference/automations/workflows/troubleshooting-workflows)).
- **Zoho** — date triggers fire "a maximum of 5000 records ... every 10 minutes"; "A maximum of 5 Scheduled Actions" ([Zoho workflow rules](https://help.zoho.com/portal/en/kb/crm/automate-business-processes/workflows/articles/configuring-workflow-rules)); failure report with retries ([Zoho workflow report](https://help.zoho.com/portal/en/kb/crm/automate-business-processes/workflows/articles/workflow-report)); Blueprint state machines from Professional ([Zoho Blueprint](https://help.zoho.com/portal/en/kb/crm/process-management/blueprint)).
- **Freshsales** — up to 10 conditions and 5 actions, including "Trigger webhooks" ([Freshsales workflows](https://crmsupport.freshworks.com/support/solutions/articles/50000002143-how-to-configure-a-workflow-)); **Copper** — "Workflow Automation rules cannot trigger other Workflow Automation rules" ([Copper workflow rule](https://support.copper.com/en/articles/15926316-create-a-workflow-automation-rule)); **monday CRM** — Standard "250 actions per month", Pro 25,000 ([monday CRM pricing](https://monday.com/crm/pricing)); **Close** (Growth+) — failed runs go to an Error state and can be retried ([Close workflows](https://help.close.com/feature-guide/workflows)).

**(c) Good versus weak.** Good: broad triggers (field change, date, schedule, webhook, form); explicit re-enrolment rules and loop guards; retries and alerts; run logs with retention; drafts, versions and restore; test or rollback mode; documented throughput. Weak: action quotas that silently stop automations; no run history.

**(d) Rating: TABLE STAKES** (the gap is observability and safety).

#### 6.6 Approval processes

**(a) What it is.** Gating a change (discount, stage, contract) behind approvers, with record locking, reject/recall and an audit trail.

**(b) Who has it.** HubSpot quote approvals: "Up to 10 approvers", AND-only criteria ("'Or' logic is not supported"), Enterprise "up to 5 approval steps" ([HubSpot catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)), "All approvers required" or "At least one approver required" ([HubSpot quote approvals](https://knowledge.hubspot.com/quotes/set-up-quote-approvals)); deal-stage approvals on Sales Enterprise where a rejected deal "can only be moved to a closed lost stage" ([HubSpot pipeline approvals](https://knowledge.hubspot.com/object-settings/pipeline-approvals)). Salesforce on Core and up; submission "locks the record" ([Trailhead: approvals](https://trailhead.salesforce.com/content/learn/modules/business_process_automation/approvals)); CPQ Smart Approvals skip unchanged approvers on resubmission ([Trailhead: smart approvals](https://trailhead.salesforce.com/content/learn/modules/advanced-approvals-for-admins/use-smart-approvals-to-evaluate-changes)). Zoho Enterprise+: hierarchy-based approvers including "Record Owner's Manager", parallel or sequential "up to 10 stages", locked records ([Zoho approval process](https://help.zoho.com/portal/en/kb/crm-nextgen/process-management/approval-process/articles/nextgen-add-approval-process)). monday: a generic "human-in-the-loop block" ([monday CRM what's new](https://monday.com/crm/whatsnew)). Attio, Close, Copper, Freshsales: none found.

**(c) Good versus weak.** Good: criteria on discount, amount or margin; sequential and parallel steps; approvers resolved from the hierarchy; delegation and recall; locking with admin override; re-approval only on material change; approve from email or chat; full audit trail; escalation reminders. Weak: a status picklist plus a notification.

**(d) Rating: DIFFERENTIATOR** (native in three of nine, all top-tier).

#### 6.7 Quotes, CPQ and e-signature

**(a) What it is.** Quotes built from catalogue line items with discounts, tax, currency and expiry, delivered as a web page or PDF, signed and paid.

**(b) Who has it.** HubSpot (Revenue Hub): single-page review, accept and pay; signable attachments; password protection; e-signature via Dropbox Sign, "25 signatures per user per account per month" on Pro, 50 on Enterprise, counted again on each resend ([HubSpot catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog); [HubSpot e-signatures](https://knowledge.hubspot.com/quotes/use-e-signatures-with-quotes)); "print and sign, e-sign, or click to accept" ([HubSpot CPQ](https://knowledge.hubspot.com/cpq/getting-started-with-hubspot-cpq)). Salesforce: "An opportunity can have multiple quotes, but it can sync with only one quote at a time" ([Trailhead: multiple quotes](https://trailhead.salesforce.com/content/learn/projects/manage-products-prices-quotes-orders/create-multiple-quotes)); advanced CPQ is Revenue Cloud. Zoho (Professional+): "up to 200 line items in a quote", converting to sales orders and invoices ([Zoho quotes](https://help.zoho.com/portal/en/kb/crm/manage-inventory/quotes/articles/create-quotes)). Freshsales CPQ add-on with native Dropbox Sign and a "maximum of 50 signatures for the entire account" ([Freshsales CPQ](https://crmsupport.freshworks.com/support/solutions/articles/50000003241-what-is-cpq-add-on-how-does-the-add-on-work-); [Freshsales e-signatures](https://crmsupport.freshworks.com/support/solutions/articles/50000005700-how-to-add-esignatures-to-quotes-)). monday CRM "20 quotes & invoices /month" on Basic up to unlimited on Ultimate ([monday CRM pricing](https://monday.com/crm/pricing)). Attio via a PandaDoc app ([Attio PandaDoc](https://attio.com/apps/pandadoc)); Copper via DocuSign/PandaDoc; Close none.

**(c) Good versus weak.** Good: catalogue and price-book lines; discount guardrails tied to approvals; tax and currency; versions with one primary quote synced to the deal; e-signature with countersign; payment on acceptance; conversion to subscription or invoice. Weak: a free-text PDF unconnected to the deal.

**(d) Rating: COMMON** (five or six of nine).

#### 6.8 Products and price books

**(a) What it is.** A SKU catalogue with prices per currency or segment, recurring terms and tiers, feeding deal line items.

**(b) Who has it.** HubSpot product library ("Up to 100 products" on Free, 15 million on Pro/Enterprise; currencies 5/30/200) and price books with one currency each, applied "only at deal creation" ([HubSpot catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog); [HubSpot price books](https://knowledge.hubspot.com/products/use-price-books)). Salesforce standard and custom price books in all editions ([Trailhead: price books](https://trailhead.salesforce.com/content/learn/projects/manage-products-prices-quotes-orders/create-custom-price-books)). Pipedrive "one price per product per currency", product variations, billing frequency from weekly to annually, up to 208 billing cycles ([Pipedrive products API](https://developers.pipedrive.com/docs/api/v1/Products)). Zoho price books, one per deal ([Zoho price books](https://help.zoho.com/portal/en/kb/crm/manage-inventory/price-books/articles/price-books)). Freshsales: "Pricing can be either one-time or subscription-based for a product and not both" ([Freshsales products](https://crmsupport.freshworks.com/support/solutions/articles/50000002420-how-to-add-and-use-products-)). Attio, Close and Copper have no native catalogue.

**(c) Good versus weak.** Good: variants; several price books with date ranges; recurring terms and setup fees; tiered or volume pricing; cost and margin; per-line discount and tax; history kept when a product is archived. Weak: a free-text amount.

**(d) Rating: COMMON** (five of nine).

#### 6.9 Customer portals

**(a) What it is.** An authenticated site where customers see their own tickets, quotes, invoices, subscriptions and knowledge base.

**(b) Who has it.** HubSpot customer portal (Service Pro/Enterprise) to "view, open, and reply to their support tickets, and access your knowledge base" ([HubSpot catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)), plus a billing portal to "view invoices and subscriptions, update the payment method... or pay outstanding invoices" ([HubSpot billing portal](https://knowledge.hubspot.com/payment-processing/set-up-a-billing-portal)); portal limits include 10 custom ticket-table properties and no multi-language portals ([HubSpot portal settings](https://knowledge.hubspot.com/inbox/manage-customer-portal-settings)). Salesforce Experience Cloud, licensed separately ([Trailhead: Experience Cloud](https://trailhead.salesforce.com/content/learn/modules/community_cloud_basics/communities_intro_to_community_cloud)). Zoho portals (Enterprise+), "up to 1,000 users across the user groups ... for free" ([Zoho portals](https://help.zoho.com/portal/en/kb/crm/connect-with-customers/portals/articles/setting-up-portal)). Freshdesk portal, a separate product ([Freshdesk portal](https://crmsupport.freshworks.com/support/solutions/articles/50000003752-overview-of-freshdesk-portal)). Stripe's billing portal (section 4.7) is the billing reference.

**(c) Good versus weak.** Good: SSO or passwordless login; company-level visibility; tickets, quotes, invoices, payments and contracts in one place; knowledge base; branding and custom domain. Weak: a status page reached by an emailed link that acts as the customer.

**(d) Rating: DIFFERENTIATOR** inside a CRM; **TABLE STAKES** for support desks and billing systems.

#### 6.10 Web forms

**(a) What it is.** Hosted or embedded forms that create or update records, capture source data and start routing.

**(b) Who has it.** Eight of nine. HubSpot: multi-step forms and consent on Starter, "conditional logic ... and AI spam detection (Beta)" on Pro ([HubSpot catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)); reCAPTCHA threshold "between 0.1 (least strict) and 0.9 (most strict)" ([HubSpot reCAPTCHA](https://knowledge.hubspot.com/forms/verify-form-submissions-with-recaptcha-v3)); a matching email updates the existing contact ([HubSpot deduplication](https://knowledge.hubspot.com/records/deduplication-of-records)). Close native forms with "Track URL Parameters" for UTMs ([Close forms](https://help.close.com/feature-guide/forms)). Zoho captcha, hidden fields, double opt-in, assignment rule on submit, a "spam possibility percentage" slider ([Zoho web forms](https://help.zoho.com/portal/en/kb/crm/connect-with-customers/webforms/articles/set-up-web-forms)), and A/B tests ([Zoho form A/B](https://help.zoho.com/portal/en/kb/crm/connect-with-customers/webforms/articles/webform-ab-testing)). Freshsales forms matched on a unique field ([Freshsales web forms](https://crmsupport.freshworks.com/support/solutions/articles/50000002631-how-to-configure-web-forms-)). Copper forms ([Copper forms](https://support.copper.com/en/articles/15861813-use-copper-forms-to-capture-contacts)); monday WorkForms ([monday forms](https://monday.com/features/forms)); Salesforce Web-to-Lead in every edition. Attio only via a third-party app.

**(c) Good versus weak.** Good: update-on-match deduplication; hidden fields plus UTM and first-touch capture; invisible CAPTCHA and domain blocks; consent and double opt-in; routing and auto-reply on submit; prefill; analytics. Weak: a duplicate record on every submission.

**(d) Rating: TABLE STAKES.**

#### 6.11 Chat and meeting widgets

**(a) What it is.** Website chat and bots that qualify and route visitors; booking links (personal, round-robin, group).

**(b) Who has it.** HubSpot: Starter bots "Limited to ticket creation, lead qualification, and meeting booking bots, with no custom branching logic" ([HubSpot catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)); round robin picks "the user who has gone the longest without being assigned a meeting", and a disconnected calendar is treated as "always available" ([HubSpot round-robin meetings](https://knowledge.hubspot.com/meetings-tool/understand-group-and-round-robin-meeting-availability)); weighted rotations on Pro ([HubSpot meeting rotations](https://knowledge.hubspot.com/meetings-tool/schedule-a-meeting-with-a-contact-using-meeting-rotations)). Salesforce Enhanced Chat (legacy Chat retired 14 February 2026) ([Trailhead: enhanced chat](https://trailhead.salesforce.com/content/learn/modules/migrating-from-legacy-chat-to-enhanced-chat/explore-enhanced-chat)). Close scheduling links ("20 personal links (per User)") but no team links or chat ([Close scheduling links](https://help.close.com/feature-guide/scheduling-links)). Freshsales built-in chat on Growth, bot sessions "$49 /100 sessions" ([Freshsales pricing](https://www.freshworks.com/crm/pricing/)). Zoho via SalesIQ (separate). Attio via a Calendly app.

**(c) Good versus weak.** Good: chat creates or deduplicates the contact and routes by owner and availability; a bot books onto the right calendar; round-robin, group and weighted links with buffers and caps; routing forms; reminders. Weak: personal booking links only.

**(d) Rating: COMMON.**

#### 6.12 Surveys tied to records

**(a) What it is.** NPS, CSAT, CES or custom surveys whose answers land on the contact, company or ticket.

**(b) Who has it.** HubSpot Service Pro/Enterprise: "50 NPS surveys, 50 CES surveys, and 100 CSAT surveys" ([HubSpot catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)); Salesforce survey invitations from flows, responses on the record ([Trailhead: survey invitations](https://trailhead.salesforce.com/content/learn/modules/salesforce-surveys-for-admins/automate-your-survey-invitations)); Zoho via Zoho Survey (feeding scoring rules); Freshworks via Freshdesk; monday via WorkForms and integrations. See section 5.5 for support-desk surveys.

**(c) Good versus weak.** Good: templates; triggers on ticket close or deal won; answers linked to contact, company and ticket; detractor follow-up; throttling so customers are not over-surveyed. Weak: an external survey link with no record link.

**(d) Rating: DIFFERENTIATOR** for CRMs; **TABLE STAKES** for support desks.

### 7. AI features now expected (2025-2026), and how vendors gate and explain them

Prices below are as served on 2026-10-03 and change often; some pages were localised (Zendesk showed sterling, Zoho rupees). Salesforce Help could not be fetched, so Salesforce detail comes from salesforce.com product and pricing pages.

#### 7.1 Record and thread summaries

**(a) What it is.** A one-click digest of a record's history (contact, company, deal, ticket) or of one email thread or call, usually a card on the record with follow-up questions in a chat panel.

**(b) Who has it.**

- **HubSpot** — all plans, no credit cost stated. The summary card works on "contact, company, deal, and ticket records" and reads activities, notes, ownership and properties. Accounts with sensitive-data handling enabled "will not be able to summarize certain activities such as calls and sales emails" ([HubSpot: summarize records](https://knowledge.hubspot.com/records/summarize-records)). Breeze Assistant shows its citations so users can "review all referenced sources and memories", and is rate-limited to "30 times each minute and 1,000 times each day" ([HubSpot: use Breeze Assistant](https://knowledge.hubspot.com/ai/use-breeze-assistant)).
- **Salesforce** — "Get one-click, AI-generated summaries for every account, opportunity, lead, and contact" ([Salesforce Sales AI](https://www.salesforce.com/sales/ai/)); edition gating not stated.
- **Pipedrive** — email-thread summarisation (beta) with sentiment and readiness-to-buy signals, Premium/Ultimate only; Sales Assistant summaries capped "(up to 300 characters)" ([Pipedrive AI](https://support.pipedrive.com/en/article/pipedrive-ai); [Sales Assistant](https://support.pipedrive.com/article/sales-assistant)).
- **Attio** — a "Summarize Record" AI attribute costs 1 credit per record and reads "all attribute values on the record, but not things like notes or emails" ([Attio AI attributes](https://attio.com/help/reference/managing-your-data/attributes/ai-attributes)).
- **Close** — Lead Summaries and Email Thread Summaries are among features that "never consume credits" ([Close AI credits](https://help.close.com/account-management/variable-usage-costs-calling-sms-phone-numbers-ai-tools/ai-credits.md)).
- **Zoho CRM** — "Generate quick summaries for records, conversations, notes, emails, and calls"; email summary reads the last 50 emails; Professional and up ([Zoho Zia generative AI](https://www.zoho.com/crm/zia/generative-ai.html); [Zia models](https://help.zoho.com/portal/en/kb/crm/zia-artificial-intelligence/generative-ai/articles/zia-models)).
- **monday CRM** — AI "Smart fields that auto-fill, categorize, or summarize data" and Sidekick summaries of updates, both on AI credits ([monday CRM pricing](https://monday.com/crm/pricing); [Sidekick](https://monday.com/w/sidekick)).
- **Gong** — the call brief has Recap, Key points and Next steps, with "Regenerate AI Content" when it is wrong ([Gong call briefs](https://help.gong.io/docs/use-transcripts-outline-and-call-details.md)).
- **Intercom** — "AI Summarize is available on the Advanced plan and above for the manual inbox button, and requires the Expert plan for the Workflow 'Add summary note' action"; "No more than 2 summaries can be posted to the same conversation per hour"; a workspace cap of 1,500 an hour ([Intercom inbox AI features](https://www.intercom.com/help/en/articles/6955446-ai-features-available-in-the-inbox.md)).
- **Copper** — no native summary; its help centre routes users to Google's Gemini side panel and warns "Always double-check the information Gemini provides" ([Copper help](https://support.copper.com/en/articles/15075498-summarize-relationships-and-opportunities-with-google-gemini)). Freshsales record summaries unverified (Freddy Copilot summaries are documented for the help-desk products, at $29 per agent per month annually) ([Freddy AI pricing](https://crmsupport.freshworks.com/support/solutions/articles/50000009124-understanding-freddy-ai-features-and-pricing)).

**(c) Good versus weak.** Good: cites the activities it used; states what it covers and what it leaves out (Attio says its summary skips notes and emails); respects record permissions and degrades openly for sensitive data (HubSpot); is regenerated when opened rather than cached forever; can be written back as a note by automation (Intercom); published rate limits; free on every plan (HubSpot, Close). Weak: an unsourced paragraph with no visible scope that silently ignores calls and emails; hard length caps (Pipedrive); permanent beta.

**(d) Rating: TABLE STAKES.** Every CRM and help desk checked has it, mostly in base or mid tiers; only Copper relies on an outside assistant.

#### 7.2 Call recording, transcription, call summaries and conversation intelligence

**(a) What it is.** Record and transcribe calls and meetings, turn them into a recap and action items, and analyse them (talk ratios, keyword or concept trackers, coaching comments).

**(b) Who has it.**

- **HubSpot** — the Notetaker "joins your conversations automatically and handles recording, transcription, and CRM logging"; $7/month add-on on Sales and Service Hub Starter to Enterprise; next steps become tasks in one click and "CRM update suggestions appear automatically for rep review"; "Google Meet currently supports English transcripts only"; on consent, "your team is responsible for establishing the appropriate legal basis for recording meetings" ([HubSpot AI notetaker](https://www.hubspot.com/products/sales/ai-notetaker)). Conversation intelligence (Sales Hub Pro/Enterprise) includes tracked terms and "750 hours of transcription per account per month" on Professional, 1,500 on Enterprise ([HubSpot Sales Hub pricing](https://www.hubspot.com/pricing/sales)), and lets managers "leave feedback on specific moments in a call" ([HubSpot CI](https://www.hubspot.com/products/conversation-intelligence)).
- **Salesforce** — "Conversation Intelligence is included in every Sales Cloud edition", flagging "competitor likes and dislikes, objections, pricing attitudes, and customer questions" ([Salesforce CI](https://www.salesforce.com/sales/conversation-intelligence/)); the pricing page lists advanced CI and Call Summaries as add-ons on lower editions ([Salesforce pricing](https://www.salesforce.com/sales/pricing/)).
- **Gong** (reference) — captures "video calls, phone conversations, emails, SMS, calendar events, LinkedIn messages" ([Gong revenue graph](https://www.gong.io/platform/revenue-graph)); interaction stats include Longest Monologue, Interactivity, Patience and Question Rate ([Gong stats API](https://help.gong.io/apidocs/retrieve-interaction-stats-for-applicable-users-by-date-v2statsinteraction.md)); AI trackers find concepts "recognizing intent no matter how it's phrased", can be previewed on 100 calls and 400 email threads before publishing, and pause when credits run out ([Gong smart trackers](https://help.gong.io/docs/create-smart-trackers.md)); Gong publishes how it measures tracker "hit rate" and "precision" ([Gong: measuring AI performance](https://help.gong.io/docs/measuring-ai-performance-at-gong.md)).
- **Close** — Call Assistant "transcribes and summarizes voicemails and recorded calls over 30 seconds" in 20 languages; "Summary quality may vary depending on the language"; $50/month plus $0.02/minute; transcripts "remain available even if the call recording expires" ([Close Call Assistant](https://help.close.com/feature-guide/calling/call-assistant.md)); a meeting Notetaker is free ([Close AI credits](https://help.close.com/account-management/variable-usage-costs-calling-sms-phone-numbers-ai-tools/ai-credits.md)).
- **Attio** — Call Intelligence ("Record and analyze meetings") from the Pro plan, 100+ languages, summary templates such as SPICED ([Attio pricing](https://attio.com/pricing); [Attio call intelligence](https://attio.com/platform/call-intelligence)).
- **Zoho** — Zia "converts recorded call audio into searchable plain text within the Call Activity module", plus sentiment and intent ([Zia for calls](https://help.zoho.com/portal/en/kb/crm/zia-artificial-intelligence/communication/zia-for-calls)).
- **monday CRM** — an AI notetaker that "Joins, captures, and analyzes every meeting" on credits ([monday CRM features](https://monday.com/crm/features)).
- Pipedrive's own AI catalogue lists no recording or transcription; Freshsales and Clari native transcription unverified; Copper none found.

**(c) Good versus weak.** Good: speaker-labelled transcript you can click through; honest language list with quality caveats; transcript retention independent of audio retention; structured summary (recap, key points, next steps) with one-click tasks; suggested CRM field updates that need rep approval and show the evidence; fixed metrics (talk ratio, monologue length) beside generated text; concept trackers testable before publishing; metered hours shown up front; consent, retention and redaction controls (Gong offers "custom retention and redaction settings, and bring-your-own-key encryption" — [Gong trust](https://www.gong.io/platform/trust)). Weak: summary only, English only, no transcript access, no field extraction, opaque per-minute fees, no consent handling.

**(d) Rating: COMMON, moving to table stakes** for recording, transcription and summary (usually on a paid tier or metered); **DIFFERENTIATOR** for real conversation analytics — talk metrics, trackers, coaching — outside the specialists (Gong, Salesforce, HubSpot Enterprise).

#### 7.3 Email drafting, reply suggestions and tone

**(a) What it is.** Generate or rewrite outbound emails, replies and sequence steps from record context.

**(b) Who has it.** Every product checked has some version: HubSpot templates and guided-selling drafts, plus a prospecting agent that runs "Review before sending" or "Send automatically" and consumes credits per personalised email ([HubSpot prospecting agent](https://knowledge.hubspot.com/prospecting/use-the-prospecting-agent)); Salesforce "Sales Emails" in the top edition ([Salesforce pricing](https://www.salesforce.com/sales/pricing/)); Pipedrive tone and length controls and "AI email suggested replies (beta)", Premium/Ultimate ([Pipedrive AI](https://support.pipedrive.com/en/article/pipedrive-ai)); Attio bulk drafting at "50 - 80" credits, and "Ask Attio cannot send emails without approval" ([Ask Attio](https://attio.com/help/reference/attio-ai/ask-attio/chat-with-ask-attio)); Close drafting on Growth and Scale with free AI Rewrite ([Close pricing](https://www.close.com/pricing)); Zoho grammar, tone, subject lines and translation ([Zia for emails](https://www.zoho.com/crm/zia/ai-for-emails.html)); Freshsales Freddy prospecting emails ([Freddy AI](https://www.freshworks.com/crm/freddy-ai/)); Copper's only AI features are template writing and "AI-powered edits" ([Copper pricing](https://www.copper.com/pricing)); Gong AI Composer ([Gong revenue AI](https://www.gong.io/platform/revenue-ai)); Zendesk auto assist can "suggest next steps, draft responses and execute approved actions" ([Zendesk Copilot](https://www.zendesk.com/in/service/ai/copilot/)).

HubSpot's own help warns that AI may "occasionally generate incorrect, biased, offensive, or misleading information" ([HubSpot AI email templates](https://knowledge.hubspot.com/generate-sales-email-templates-with-ai-assistant)); Intercom's Copilot lets agents "fact check and preview each of the sources used before sending the answer off to the customer" ([Intercom Copilot explained](https://www.intercom.com/help/en/articles/9121374-copilot-explained.md)).

**(c) Good versus weak.** Good: grounded in record context (stage, last touch, transcript), not just the prompt; sources previewable; tone and length controls and a brand voice; nothing sends without approval unless someone deliberately chose autonomous mode; per-user controls. For a fintech, approved-language and disclaimer guardrails as well. Weak: a free-floating text generator with no CRM context, or auto-send as the default.

**(d) Rating: TABLE STAKES.**

#### 7.4 Next-best-action and best time to contact

**(a) What it is.** A ranked suggestion of what to do next on a deal or account, sometimes with the best time and channel to reach the person.

**(b) Who has it.** HubSpot guided selling: "Suggested tasks powered by real-time buying signals", Sales Hub Professional and Enterprise ([HubSpot guided selling](https://www.hubspot.com/products/sales/ai-guided-selling)); Salesforce opportunity prioritisation and an Agentforce sales agent with a "suggestive or autonomous mode" ([Salesforce AI sales agent](https://www.salesforce.com/sales/ai-sales-agent/)); Pipedrive's assistant "recommend[s] the next best actions" and nudges when a deal has no activity scheduled ([Pipedrive AI sales assistant](https://www.pipedrive.com/en/features/ai-sales-assistant)); Zoho Deal Analyzer agent plus "smart suggestions for the best time and mode to contact each customer" ([Zia best time to contact](https://help.zoho.com/portal/en/kb/crm/zia-artificial-intelligence/communication/best-time-to-contact-customers)); Freshsales "next best actions" in deal insights, Pro and up ([Freddy AI](https://www.freshworks.com/crm/freddy-ai/)); Close "Suggested Actions" free ([Close AI credits](https://help.close.com/account-management/variable-usage-costs-calling-sms-phone-numbers-ai-tools/ai-credits.md)); Clari/Salesloft "Risks, gaps, and opportunities automatically trigger next best actions" ([Salesloft forecasting](https://www.salesloft.com/platform/sales-forecasting-software)). Best time to contact is verified only for Zoho.

**(c) Good versus weak.** Good: names the signal behind each suggestion ("no prospect activity for X days"); becomes a dated task in one click; can be dismissed with a reason; ranked by value times likelihood. Weak: generic "follow up" tips with no reason.

**(d) Rating: COMMON** for next-best-action; **DIFFERENTIATOR** for best time to contact.

#### 7.5 Deal and lead scores that explain themselves

**(a) What it is.** A model score for a deal's chance of closing or a lead's fit, with the factors that drove it.

**(b) Who has it.**

- **HubSpot** — deal score 0-100 where "a score of 85 predicts an 85% likelihood of winning the deal"; the card shows "the top five key factors" marked positive or negative; users can "view the history of a deal's score"; fast-trigger updates within 6 hours, slow ones up to 48 hours; Sales Hub Professional or Enterprise ([HubSpot deal scores](https://knowledge.hubspot.com/records/use-deal-scores)). By contrast its Enterprise predictive lead scoring describes itself as "blackbox machine learning" where "it is unknown how the input is transformed into the output" ([HubSpot predictive lead scoring](https://knowledge.hubspot.com/contacts/determine-likelihood-to-close-with-predictive-lead-scoring)).
- **Salesforce** — "Einstein opportunity scoring indicates high likelihood that a lead will close, including recent positives and negatives" ([Salesforce Sales AI](https://www.salesforce.com/sales/ai/)).
- **Gong** — AI Deal Predictor scores 1-99 as a **percentile rank** within the pipeline, banded Low (1-29), Fair (30-75), High (76-99), using "300+ signals" and a model "trained on your company's historical deal outcomes", each score listing "positive and negative signals" ([Gong deal predictor](https://help.gong.io/docs/understanding-ai-deal-predictor.md)).
- **Zoho** — Zia Scores "out of 100" with a "Scorecard that delves deeper into why that particular score was assigned" and thumbs feedback; needs at least 200 records (75 good and 75 bad examples for conversion scores); scores take "a few minutes to 24 hours" ([Zia scores](https://help.zoho.com/portal/en/kb/crm-nextgen/zia-artificial-intelligence/prediction/articles/nextgen-zia-scores)).
- **Freshsales** — Freddy deal tags Likely to Close, Trending, At Risk, Gone Cold and Neutral, each card showing "the top signal that contributed to the prediction", and needing "a good number of closed-won deals" ([Freddy deal insights](https://crmsupport.freshworks.com/support/solutions/articles/50000002393-what-are-freddy-deal-insights-and-how-to-use-them-)); contact score 0-99 with contributing factors plus a 1-5 star fit rating ([Freshsales contact scoring](https://crmsupport.freshworks.com/support/solutions/articles/50000003001-how-to-use-contact-scoring-to-prioritize-contacts-)); the pricing page lists both under Pro while the help articles list every plan.
- **Pipedrive** markets "AI-powered win probability predictions" but documents no explanation ([Pipedrive AI sales assistant](https://www.pipedrive.com/en/features/ai-sales-assistant)). Attio and Close: no native win-probability model found.

**(c) Good versus weak.** Good: says whether the number is a calibrated probability (HubSpot) or a rank (Gong); shows signed top factors in plain words; keeps score history; shows freshness; states the minimum data needed and the cold-start behaviour (Zoho); takes feedback; trained on the customer's own outcomes. Weak: a bare number, especially one the vendor calls a black box.

**(d) Rating: COMMON** for having a score; among those that do, **explained factors are now expected**.

#### 7.6 Forecast assist (AI-projected landing)

**(a) What it is.** A model's projection of where the period will land, beside the rep and manager calls.

**(b) Who has it.** Gong AI Revenue Predictor sums "closed-won deals", "weighted pipeline" and "expected deals" per board, team or rep, using "historical data to generate more accurate projections, even early in the period" ([Gong revenue predictor](https://help.gong.io/docs/understanding-ai-revenue-predictor.md)); Clari (now Salesloft; clari.com redirects) shows an "AI Projection" built from "historical data and predicts outcomes based on deal size, stage, and velocity" ([Salesloft forecasting](https://www.salesloft.com/platform/sales-forecasting-software)); Salesforce Predictive Forecasting add-on with "visibility into relevant logic, factors, and business trends" ([Salesforce pricing](https://www.salesforce.com/sales/pricing/)); HubSpot "AI-powered projections" ([HubSpot forecasting](https://www.hubspot.com/products/forecasting)), documented as based on "closed won deals in the past three months", shown as a most-likely, upper and lower range and refreshed on set days of the month ([HubSpot AI projections](https://knowledge.hubspot.com/forecast/improve-forecasting-with-ai-projections)). None found in Pipedrive, Freshsales, Attio, Close, Copper or monday.

**(c) Good versus weak.** Good: AI number beside commit and manager call with the gap shown; decomposed into closed, weighted and expected; back-tested accuracy by period; names the deals that moved it. Weak: one unexplained number. Vendor accuracy claims ("20% more precision", 90-98%) are vendor benchmarks, not independent ones.

**(d) Rating: DIFFERENTIATOR.**

#### 7.7 Natural-language reporting ("ask your data")

**(a) What it is.** Ask a question in words and get a number, table or chart, ideally as a saveable report.

**(b) Who has it.**

- **Pipedrive** — AI report creation produces an editable report where you can "edit filters manually" and "save the report"; it cannot make "pie charts, bar charts, tables or scorecards", dashboards, or reports on data that does not exist ([Pipedrive AI report generation](https://support.pipedrive.com/article/ai-report-generation)).
- **Zoho** — Ask Zia will "Retrieve data and view visual analytics based on your queries" and the charts can be added to dashboards; it "Supports the English language only", one module and one aggregate per question, Professional and above ([Ask Zia](https://help.zoho.com/portal/en/kb/crm-nextgen/zia-artificial-intelligence/conversational-ai/articles/nextgen-ask-zia-17-8-2022)).
- **Freshsales** — Conversational Analytics lets you "analyse and engage with your data using simple, natural language prompts", public beta on Pro/Enterprise, then an add-on ([Freshsales conversational analytics](https://crmsupport.freshworks.com/support/solutions/articles/50000009033-conversational-analytics-formerly-prompt-based-analytics-)).
- **Attio** — Ask Attio runs SQL for aggregate questions and "has the same viewing permissions as you" ([Ask Attio](https://attio.com/help/reference/attio-ai/ask-attio/chat-with-ask-attio)).
- **HubSpot** — Breeze Assistant interprets existing data and reports but does not build new reports, and some report types (funnels) cannot be summarised ([HubSpot: summarize data with Breeze](https://knowledge.hubspot.com/ai/summarize-and-review-data-with-breeze-assistant)); the Data Agent's smart properties ($0.10 per answer) say "each answer cites exactly where it was pulled from" ([HubSpot data agent](https://www.hubspot.com/products/artificial-intelligence/ai-data-agent)).
- **Gong** — Ask Anything over up to 100 calls, or 60 calls and 500 emails per deal or account ([Gong Ask Anything](https://help.gong.io/docs/understanding-ai-ask-anything.md)). **Close** — Chloe chat in free beta ([Close Chloe](https://help.close.com/feature-guide/chloe.md)).

**(c) Good versus weak.** Good: the model only translates the question — the query or filters are shown and editable (Pipedrive's filters, Attio's SQL) and the numbers come from the normal reporting engine; the answer can be saved as an ordinary report; the asker's permissions apply; unsupported question types are documented (Zoho also fixes a week as Sunday to Saturday; Gong limits context to 10 calls and 80 emails per contact); drill into the records. Weak: a chat answer whose number cannot be traced. No vendor publishes accuracy figures for question-to-query translation.

**(d) Rating: COMMON** to have some "ask" feature, moving towards table stakes (82% of CX leaders in [Zendesk CX Trends 2026](https://cxtrends.zendesk.com/) say "promptable analytics" produce insights in seconds); **DIFFERENTIATOR** for a reliable path from a question to a saved, editable report.

#### 7.8 Data enrichment

**(a) What it is.** Filling firmographic and contact fields (size, industry, location, revenue, LinkedIn, title) from a vendor dataset or web research.

**(b) Who has it.**

- **HubSpot** — automatic (Super Admin toggle), manual or bulk; "Data enrichment does not consume HubSpot Credits" (KB dated 2026-07-10); sources are "HubSpot's commercial dataset, third-party providers, and publicly available information" ([HubSpot data enrichment](https://knowledge.hubspot.com/records/get-started-with-data-enrichment)). It was priced per record in 2024 ("One credit = one enriched record") ([Breeze Intelligence pricing guide](<https://www.hubspot.com/hubfs/Agency/GTM%20-%20Product%20Resources%20(Justin)/Product%20Folders%20(EN)/HubSpot%20AI/Breeze%20Intelligence%20-%20Pricing%20Guide.pdf>)).
- **Close** — AI Enrichment fills company size, industry, LinkedIn URL, timezone and go-to-market motion, steered by per-field prompts; "6 credits" per field per record; each filled field shows a confidence colour and, on hover, the reasoning and sources; "Override existing values" is opt-in; runs over 200 records need confirmation ([Close enrichment](https://help.close.com/feature-guide/enrichment.md)).
- **Attio** — "Auto-enrich every record" on every tier including Free ("Location, employee range, funding raised, estimated ARR, and more. All from the domain."); a Web Agent for custom research at 10 credits per record that can "Show confidence levels" and reveal "the agent's reasoning and the web sources it used" ([Attio pricing](https://attio.com/pricing); [Attio enrichment](https://attio.com/platform/enrichment); [Attio AI attributes](https://attio.com/help/reference/managing-your-data/attributes/ai-attributes)).
- **Zoho** — manual "Enrich data" that "retrieves additional information such as company size, phone number, address", all paid editions, with an admin usage tab ([Zia data enrichment](https://help.zoho.com/portal/en/kb/crm-nextgen/zia-artificial-intelligence/data-enrichment/articles/nextgen-zia-data-enrichment)).
- **Gong** fills CRM fields from calls and emails rather than firmographics: its Data Extractor "Automatically fills out CRM fields with no rep input required" ([Gong AI agents](https://www.gong.io/platform/ai-agents-for-revenue-teams)).
- monday's lead-sourcing agent enriches new leads ([monday CRM AI agents](https://monday.com/crm/ai-agents)); Pipedrive's AI catalogue lists no enrichment; Freshsales unverified; Copper none found.

**(c) Good versus weak.** Good: source, date and confidence per field; never overwrites a human-entered value unless told to (Close); bulk safeguards; cost shown before running; data-subject opt-out (HubSpot). Weak: silent overwrites, no sources, hidden per-record fees.

**(d) Rating: COMMON, effectively TABLE STAKES for SMB CRMs in 2026.**

#### 7.9 Anomaly detection and proactive alerts

**(a) What it is.** The system notices an unusual metric or a deal going quiet and tells the owner, instead of waiting for someone to open a report.

**(b) Who has it.**

- **Zoho** — anomaly detector flags behaviour "that does not conform with the normal trend" on sum, count, average or maximum, daily, weekly or monthly; can "compare the anomalous metric with a related metric to get a ratio"; 10 detectors on Enterprise, 25 on Ultimate ([Zoho anomaly detector](https://help.zoho.com/portal/en/kb/crm-nextgen/analytics-and-dashboards/analytics-or-dashboards/articles/nextgen-creating-anomaly-detector)).
- **Gong** — eight deal warnings: No Activity, Ghosted ("no prospect activity for X days"), Overdue, Insufficient Contacts, Missing Power, Pricing Discussion Gap, Red Flags, Stalled; each can be switched off or retuned per board ([Gong deal warnings](https://help.gong.io/docs/customize-your-deal-warning-settings.md)).
- **Salesforce** — "Opportunity Health Signals" with "weekly change signals that include visual cues and alerts" ([Salesforce sales analytics](https://www.salesforce.com/sales/analytics/)).
- **HubSpot** — the Data agent tracks "40+ live intent signals" plus custom signals ([HubSpot data agent](https://www.hubspot.com/products/artificial-intelligence/ai-data-agent)); no metric anomaly detector documented.
- Pipedrive AI notifications (Premium/Ultimate) ([Pipedrive AI](https://support.pipedrive.com/en/article/pipedrive-ai)); monday Pipeline Monitor agent; Freshworks Proactive Insights (status unclear after the AI Insights beta was deprecated in Nov 2025) ([Freshworks proactive insights](https://crmsupport.freshworks.com/support/solutions/articles/50000009031-proactive-insights)).

**(c) Good versus weak.** Good: shows expected baseline against actual; thresholds tunable per pipeline; routed to the owner; clears itself when the condition ends. Weak: a fixed rule marketed as AI, no baseline, alert floods.

**(d) Rating: DIFFERENTIATOR** for metric anomaly detection; **COMMON** for deal-level risk warnings.

#### 7.10 Autonomous agents and how they are priced

**(a) What it is.** Agents that act on their own: support agents that resolve conversations, sales agents that research and write outreach.

**(b) Who has it and how it is billed.**

| Model                     | Examples (2026-10-03)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Per outcome / resolution  | Intercom Fin "$0.99 per Fin outcome", qualified lead "$9.99 each", "only charged for one outcome per conversation" ([Fin pricing](https://fin.ai/pricing); [Fin outcomes](https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes.md)); HubSpot customer agent "50 credits ($0.50) when it resolves a conversation without help from a human" ([HubSpot credits](https://www.hubspot.com/products/artificial-intelligence/credits)); Zendesk "Automated resolutions are the unit of measurement", pay-as-you-go US$2.00, allowances of 5-10 per agent per month, with a "verified resolution" tier billed only after an LLM confirms resolution ([Zendesk automated resolutions](https://support.zendesk.com/hc/en-us/articles/5352026794010-About-automated-resolutions-for-AI-agents); [Zendesk pricing](https://www.zendesk.com/pricing/)) |
| Per action / conversation | Salesforce Flex Credits, "20 Flex Credits ($0.10 USD)" per standard action, "100,000 Credits" for "$500 USD"; $2 per conversation for customer-facing agents ([Salesforce press release, 15 May 2025](https://www.salesforce.com/news/press-releases/2025/05/15/agentforce-flexible-pricing-news/); [Agentforce pricing](https://www.salesforce.com/agentforce/pricing/)); Freddy AI Agent "$49 /100 sessions" ([Freshworks pricing](https://www.freshworks.com/crm/pricing/))                                                                                                                                                                                                                                                                                                                                                                                |
| Credit pool               | HubSpot (Starter 500, Professional 3,000, Enterprise 5,000 credits a month; overage $0.010 per credit) ([HubSpot product & services catalog](https://legal.hubspot.com/hubspot-product-and-services-catalog)); Close; Attio; monday; Gong (2,000 credits a year per paid seat) ([Gong credits](https://help.gong.io/docs/about-gong-credits.md))                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| Seat add-on               | Agentforce $125/user "Unmetered Agentforce usage for employees"; Zendesk Copilot; Intercom and Freddy Copilot; HubSpot Notetaker $7                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |

HubSpot counts a resolution when there is no visitor-requested handoff within 72 hours, and offers 14 days of free access ([HubSpot customer agent](https://knowledge.hubspot.com/customer-agent/understand-the-customer-agent)). Freshworks sessions are 24-hour windows, and when they run out the agent "will stop responding, and conversations will be handed over to live agents" ([Freddy AI agent sessions](https://crmsupport.freshworks.com/support/solutions/articles/50000004664-freddy-ai-agent-sessions-faqs)). monday CRM agents come with Pro and above with "no separate AI add-on". Intercom's "assumed" resolution — "No further help is requested after the last AI answer" — is the edge case to watch; Futurum flags per-resolution pricing risks for buyers "used to the predictability of seat license-based pricing" ([Futurum](https://futurumgroup.com/insights/will-zendesks-resolutions-driven-strategy-resonate-with-customers)). Fin escalates "When confidence thresholds are not met... rather than guessing" ([Fin trust](https://fin.ai/trust-reliability)). Close's Chloe voice agent is "Outbound only", "English only", "US and Canadian phone numbers only" ([Close Chloe](https://help.close.com/feature-guide/chloe.md)). monday: "You review every agent's action before it happens" ([monday CRM AI agents](https://monday.com/crm/ai-agents)).

**(c) Good versus weak.** Good: billable event defined precisely with exclusions; resolutions verified before billing; simulation before launch; low-confidence handoff to a human; agent acts with the user's permissions or its own identity; review-before-send default; every action logged; spend caps. Weak: billing "assumed" resolutions when a customer simply leaves; charging per conversation regardless of outcome; no cap.

**(d) Rating: TABLE STAKES** for a support AI agent in a 2026 support desk (Intercom, Zendesk, HubSpot, Salesforce, Freshworks); **COMMON** for sales prospecting agents in the big suites.

#### 7.11 AI governance, explainability and spend controls

**(a) What it is.** What the vendor does with customer data, who can switch AI on, how spend is capped, and whether AI output is reviewable and cited.

**(b) Who has what.**

- _Training on customer data:_ HubSpot trains its own models by default with a Super Admin opt-out, and data already used "cannot be removed" ([HubSpot ML data](https://knowledge.hubspot.com/account-management/hubspot-machine-learning-data)); Intercom fine-tunes Fin on anonymised data by default with an opt-out processed within 30 days ([Intercom AI training](https://www.intercom.com/help/en/articles/11993352-ai-model-training-and-fine-tuning)); Salesforce says prompts and responses are "never stored or used to train the underlying third-party large language models" ([Salesforce trusted AI](https://www.salesforce.com/artificial-intelligence/trusted-ai/)); Attio: "We don't train our own models on customer data" ([Attio AI policy](https://attio.com/help/reference/attio-ai/attio-ai-policy)); Pipedrive: "Your data is never used to train AI models" ([Pipedrive Sales Assistant](https://support.pipedrive.com/article/sales-assistant)); Gong: "your data is never used to train generative models", though the deal predictor learns from your own deals ([Gong trust](https://www.gong.io/platform/trust)); Zoho lets admins choose Zia's model or bring their own key for third-party models ([Zia models](https://help.zoho.com/portal/en/kb/crm/zia-artificial-intelligence/generative-ai/articles/zia-models)).
- _Switches:_ HubSpot account-wide toggles, Super Admin only ([HubSpot AI settings](https://knowledge.hubspot.com/account-management/manage-your-ai-settings)); Intercom Copilot per teammate (Unlimited / Included / Off) ([Intercom Copilot usage](https://www.intercom.com/help/en/articles/9121384-copilot-included-and-unlimited-usage.md)); Pipedrive "Only users with account settings access can enable AI features".
- _Spend:_ HubSpot alerts at 75%, 85% and 90%, caps per account and per tool, and when credits run out features "pause until your next reset date" ([HubSpot credits and billing](https://knowledge.hubspot.com/account-management/understand-hubspot-credits-and-billing)); Salesforce Digital Wallet gives "granular insights down to the agent, action, and channel level" ([Salesforce Digital Wallet](https://www.salesforce.com/agentforce/digital-wallet/)); Gong per-member credit limits.
- _Review and citations:_ Attio "proposed changes require your approval before being applied"; HubSpot deal progression "Reps can review, modify, or reject any recommendations" ([HubSpot deal progression](https://www.hubspot.com/products/sales/deal-progression)); Salesforce grounds answers by "forcing the model to cite and use trusted, customer-approved sources", adds PII masking and toxicity detection, and runs agents as the user with audit of agent actions ([Salesforce trusted AI](https://www.salesforce.com/artificial-intelligence/trusted-ai/); [Agentforce security](https://www.salesforce.com/agentforce/ai-agents/security/)).
- _monday_ — "We do not use your input or output to train machine-learning models", AI respects board permissions, and an AI Cost Center sets spend limits per team, with agent activity logs and a simulation mode ([monday AI trust center](https://monday.com/w/ai-trust-center); [monday AI](https://monday.com/w/ai)). HubSpot publishes model cards naming its model providers ([HubSpot AI trust](https://trust.hubspot.com/ai)).

**(c) Good versus weak.** Good: a clear training statement with an opt-out (or training off by default); documented zero data retention with third-party models; disclosure of which models are used; per-feature, per-user and per-data-scope switches; retrieval limited to what the user may see, with citations; approve-before-act modes and an audit log of AI actions; usage dashboards, alerts, spend caps (per team, ideally) and graceful degradation at zero credits; PII masking or redaction. Weak: account-wide switches only; training on by default; no stated opt-out.

**(d) Rating: TABLE STAKES** for a published data-use statement, an admin switch and a usage view; **COMMON** for per-feature or per-user controls, credit dashboards and citations; **DIFFERENTIATOR** for PII masking, audited AI action logs, per-team spend caps, ISO 42001 certification and bring-your-own-key encryption. Consumers agree: 95% expect explanations for AI decisions ([Zendesk CX Trends 2026](https://cxtrends.zendesk.com/)).

### 8. Where support and revenue meet

#### 8.1 Customer health scores (the retention early-warning)

**(a) What it is.** A per-account score built from usage, support load, survey results, relationship signals and billing state, mapped to a status (healthy / neutral / at risk) that drives customer-success work and feeds renewal forecasts. It is where support analytics and revenue metrics meet: the score is how a support spike or a failed payment becomes a renewal risk someone acts on.

**(b) Who has it.**

- **HubSpot** (Service Hub Professional and Enterprise, customer success workspace): "Up to 50 health scores per account"; criteria are event-based (meetings, calls, form submissions in a time window) or property-based, with pre-built groups "1:1 Engagement, Support Tickets, CSM Sentiment, NPS"; rules add or subtract points and each group has a maximum so no single signal dominates; thresholds map to labelled, coloured statuses ("Healthy", "Neutral", "At-risk"); activating a score creates two properties, "Health score" and "Health status", so it is reportable and usable in workflows ([HubSpot: customize a health score](https://knowledge.hubspot.com/help-desk/customize-a-health-score-in-the-customer-success-workspace)). The workspace raises alerts when "a customer's health status changes"; alerts "expire after 14 days" ([HubSpot: use the customer success workspace](https://knowledge.hubspot.com/customer-success/use-the-customer-success-workspace)). No AI scoring is described; every criterion is configured by hand.
- **Gainsight** (the customer-success reference): scorecards in "Numeric", "Color" or "Grade" schemes; the overall score is "calculated automatically as a weighted average of the measures and measure groups", or entered manually ([Gainsight: create scorecards](https://support.gainsight.com/gainsight_nxt/05Scorecards/02Admin_Guides/Configure_Scorecards)). When a measure has no data its weight is redistributed inside its group, not counted as zero: with Support Volume 20%, Admin Sentiment 50% and Bugs 30% (missing), the live weights become 28.6% and 71.4% ([Gainsight community](https://communities.gainsight.com/customer-success-cs-15/health-score-calculation-7745)). Measures have validity periods, but stale scores still count — "Scores are included in scorecard calculation regardless of their validity" — and "There is no notification triggered when a validity period expires" ([Gainsight](https://support.gainsight.com/gainsight_nxt/05Scorecards/02Admin_Guides/Configure_Scorecards)).
- **ChurnZero** ChurnScores: inputs span engagement, product usage, account attributes, support history ("support ticket volume and duration, SLA issues, severity"), loyalty ("tenure, customer satisfaction surveys (NPS, CSAT, CES)") and risk trends; separate scores per segment, lifecycle stage, industry or region; "Proactive alerts based on health score changes" that can "trigger automated campaigns for upcoming renewals and at-risk customers" ([ChurnZero](https://churnzero.com/features/customer-health-scores/)).
- G2 makes native health scoring an entry rule for the Customer Success category: "Monitor and score customer health using native, multi-factor models" ([learn.g2.com](https://learn.g2.com/best-customer-success-software)).
- None of the sales-first CRMs in this study (Pipedrive, Close, Copper, Attio, monday CRM) document a native account health score; teams build one from formula fields or buy a customer-success tool. (Inferred from their help centres, which describe no such feature.)

**(c) Good versus weak.**

- _Explainable components:_ the score shows which group moved it (support, usage, sentiment), not just a number. HubSpot's per-group point caps and Gainsight's group weights both make the contribution of each signal visible.
- _Missing data handled deliberately:_ a customer with no NPS response should not look unhealthy. Redistributing weight (Gainsight) is better than scoring a blank as zero.
- _Staleness is visible and acted on:_ a CSM sentiment entered nine months ago is not current. Gainsight flags staleness but still counts stale values and sends no alert, a known weakness.
- _History and trend:_ the useful question is "falling or rising", so the score needs a stored history, not just a current value.
- _Alerts on status change, routed to an owner,_ with the alert tied to a task (HubSpot's alerts, ChurnZero's plays).
- _One model per segment or lifecycle stage:_ onboarding accounts and mature accounts fail in different ways.
- _Back-tested against churn:_ compare the score at the time of churn with the score of renewed accounts; a score that does not separate them is decoration.

**(d) Rating: COMMON** in customer-success and service suites (HubSpot Service Pro+, Gainsight, ChurnZero, and an entry rule for G2's Customer Success category); **DIFFERENTIATOR** among sales-first CRMs. For a subscription business with a support desk, it is the feature that joins the two halves of the product.

### 9. What the market itself calls mandatory

The ratings in sections 1 to 8 come from counting vendors. This section checks them against the people who decide what counts as "a CRM" or "a help desk": G2's category entry rules, analyst coverage, buyer guides and surveys. Where a capability is an _entry rule_ in a G2 category, a product without it is not even listed in that category.

#### 9.1 G2 entry rules ("to qualify for inclusion, a product must...")

| G2 category                                                  | What the entry rules make mandatory for insight and RevOps                                                                                                                                                                                                                                                                                                                               | Source                                                                                                                                                                                                 |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CRM (Fall 2025 Grid Report, G2's own text)                   | Nine rules, including "Provide reporting features to track sales performance", "Provide workflow automation capabilities to streamline sales processes" and "Integrate functions into a unifying database and platform". Forecasting, dashboards and AI are **not** entry rules; lead scoring appears only in descriptive text.                                                          | [G2 CRM Grid Report Fall 2025 (PDF hosted by Salesforce)](https://www.salesforce.com/en-us/wp-content/uploads/sites/4/documents/reports/sales/g2-salesforce-sales-cloud-grid-report-crm-fall-2025.pdf) |
| Sales Analytics                                              | "Automate and visualize sales pipelines with customizable stages, risk factors, and scoring methods"; "Report on the performance of salespeople, products, methods..."; "Forecast sales numbers based on pipeline factors".                                                                                                                                                              | [learn.g2.com Sales Analytics](https://learn.g2.com/best-sales-analytics-software)                                                                                                                     |
| Revenue Operations & Intelligence                            | "Leverage AI to unify customer interaction data..."; "Analyze account engagement and provide AI-driven insights and guidance"; "Provide analytics and insights to enhance forecasting accuracy and pipeline management"; "Provide performance metrics on revenue KPIs". The only G2 category in this set where **AI is an entry condition**.                                             | [learn.g2.com RO&I](https://learn.g2.com/best-revenue-operations-software)                                                                                                                             |
| Subscription Analytics (search extract of the category page) | "Deliver dashboards that provide real-time analysis of subscription data"; "Capture and segment subscription data using criteria such as geography or customer size"; "Identify the subscribers with the highest risk of canceling"; "Include reports, analytics, and KPIs such as monthly recurring revenue (MRR), customer lifetime value (CLTV), or customer acquisition cost (CAC)". | [g2.com Subscription Analytics](https://www.g2.com/categories/subscription-analytics?page=3)                                                                                                           |
| Subscription Billing (search extract)                        | "Generate recurring invoices..."; "Accept payments and match them with invoices and subscription plans"; "Provide features to address late and incomplete payments" (dunning); "Adjust billing based on changes to plans such as upgrades or downgrades" (proration); "Include standard tax rules".                                                                                      | [g2.com Subscription Billing](https://www.g2.com/categories/subscription-billing)                                                                                                                      |
| Subscription Management                                      | "Manage renewals, cancellations, and any other changes to subscriptions"; "Identify new sales opportunities, such as upsell and cross-sell".                                                                                                                                                                                                                                             | [learn.g2.com Subscription Management](https://learn.g2.com/best-subscription-management-software)                                                                                                     |
| Customer Success                                             | "Monitor and score customer health using native, multi-factor models"; "Have revenue tracking metrics built-in (ARR, NRR, GRR, churn, contraction, expansion)"; surveys "(NPS, CSAT, CES)".                                                                                                                                                                                              | [learn.g2.com Customer Success](https://learn.g2.com/best-customer-success-software)                                                                                                                   |
| Help Desk                                                    | Ticket conversion, centralising email and portal inquiries, and "Route tickets to support agents to ensure timely responses". Reporting and SLA tracking are listed as must-haves in the article but are **not** entry rules.                                                                                                                                                            | [learn.g2.com Help Desk](https://learn.g2.com/best-help-desk-software)                                                                                                                                 |
| Customer Self-Service                                        | Knowledge without human interaction; the article's must-haves include analytics measuring "ticket deflection, article performance, and ROI".                                                                                                                                                                                                                                             | [learn.g2.com Self-Service](https://learn.g2.com/best-customer-self-service-software)                                                                                                                  |
| Sales Engagement                                             | "Automate multichannel communication sequences and workflows"; "Provide analytics or insights into sales performance".                                                                                                                                                                                                                                                                   | [learn.g2.com Sales Engagement](https://learn.g2.com/best-sales-engagement-software)                                                                                                                   |
| Lead Scoring (search extract)                                | "assign scores to leads based on predefined criteria like company size, location, budget, and revenue"; "provide reporting and analysis that salespeople can use to determine which opportunities to pursue".                                                                                                                                                                            | [g2.com Lead Scoring](https://g2.com/categories/lead-scoring)                                                                                                                                          |
| CPQ                                                          | Catalogue and price rules, configuration, automated pricing, "Generate personalized branded quotes or proposals", and quoting analytics.                                                                                                                                                                                                                                                 | [learn.g2.com CPQ](https://learn.g2.com/best-cpq-software)                                                                                                                                             |
| Conversation Intelligence (search extract)                   | Capture and transcribe calls; "Generate conversation summaries and actionable insights"; call-level analytics.                                                                                                                                                                                                                                                                           | [g2.com Conversation Intelligence](https://www.g2.com/categories/conversation-intelligence/sem)                                                                                                        |

G2 has no standalone "Sales Forecasting" category that we could find; forecasting is mandatory inside Sales Analytics and RO&I instead.

#### 9.2 How satisfied CRM users are with each feature (G2 CRM Grid, Fall 2025)

G2's per-product panels give category-average satisfaction scores. The core insight features score high and the agentic AI features score lowest, which is the pattern to expect in user expectations: reporting is assumed, agents are still being judged.

- Contact & Account Management 89%, Opportunity & Pipeline 88%, **Dashboards 87%**, **Workflow 87%**, Data Import & Export 87%, **Reporting 86%**.
- **Forecasting 84%**, **Territory & Quota 83%**, AI Text Generation 80%.
- Agentic: Natural Language Interaction, Autonomous Task Execution and Adaptive Learning **75%**; Multi-step Planning, Decision Making and Proactive Assistance **76%**.

Source: [G2 CRM Grid Report Fall 2025](https://www.salesforce.com/en-us/wp-content/uploads/sites/4/documents/reports/sales/g2-salesforce-sales-cloud-grid-report-crm-fall-2025.pdf).

#### 9.3 Analyst and buyer-guide coverage

- **Gartner** now publishes the "Magic Quadrant for CRM Sales Platforms" (6 August 2026). Gartner's own pages refused automated access, so the criteria below are as described by vendors: Microsoft says the assessment covers "pipeline visibility and seller productivity through AI-driven research, analytics, and workflow automation" ([Microsoft, 11 Aug 2026](https://www.microsoft.com/en-us/dynamics-365/blog/business-leader/2026/08/11/microsoft-named-a-leader-in-the-2026-gartner-magic-quadrant-for-crm-sales-platforms-for-the-sixteenth-consecutive-year/); [Salesforce landing page](https://www.salesforce.com/sales/resources/gartner-mq-crm-sales-platforms-2026/?d=pb&pr=)).
- **ISG Buyers Guides 2026** (vendor-hosted summaries): CRM Sales evaluates "pipeline forecasting, account management, and territory alignment" and "the effectiveness of AI-driven revenue guidance and analytics"; CRM Service evaluates "case and ticket management, SLA tracking, and knowledge management"; Sales Engagement evaluates "outreach orchestration, cadence execution, and activity tracking" ([CRM Sales](https://www.salesforce.com/crm/resources/isg-crm-sales-buyers-guide-2026/?d=pb&pr=), [CRM Service](https://www.salesforce.com/crm/resources/isg-crm-service-buyers-guide-2026/?d=pb&pr=), [Sales Engagement](https://www.salesforce.com/crm/resources/isg-sales-engagement-buyers-guide-2026/?d=pb&pr=)).
- **Forrester**, on Dreamforce 2026, advises buyers to negotiate "explicit definitions of billable actions before deploying agents broadly" and to focus on "governance, evaluation, human oversight, and measurable business outcomes" ([Forrester blog, 29 Sep 2026](https://www.forrester.com/blogs/from-crm-to-the-agentic-enterprise-salesforces-biggest-dreamforce-2026-reveals/)).
- **Software Advice** (share of CRM reviewers rating a feature critical or highly important): contact management 90%, email 85%, interaction tracking 84%, lead management 84%, **reporting/analytics 83%**, pipeline 82%, **workflow 82%**, tasks 79% ([Software Advice CRM](https://www.softwareadvice.com/crm/)). For help desks, ticket management 90% and knowledge base 82% ([Capterra Help Desk](https://www.capterra.com/help-desk-software/)).

#### 9.4 Survey numbers worth knowing

- Salesforce _State of Sales_, 6th edition (n=5,500, published 25 Jul 2024): 81% of sales teams experimenting with or fully using AI; reps spend 70% of their time on non-selling tasks; **only 35% completely trust the accuracy of their organisation's data** ([Salesforce](https://www.salesforce.com/news/stories/sales-ai-statistics-2024/)).
- Salesloft 2026 US Revenue Benchmark (n=500, fieldwork May-Jun 2026): average quota attainment about 62%; **only about 32% can instantly identify why deals stall**; about 19.7% of pipeline is stalled; 100% use AI but only 20.6% have production deployments with measurable outcomes ([Salesloft](https://www.salesloft.com/resources/guides/revenue-benchmark-report-us)).
- Zendesk CX Trends 2026: 82% of leaders say "promptable analytics" produce insights in seconds rather than weeks; **95% of consumers expect explanations for AI decisions** ([Zendesk CX Trends](https://cxtrends.zendesk.com/)).
- RevOps Co-op 2025 State of RevOps: 99% struggle with technical data issues ([RevOps Co-op](https://www.revopscoop.com/reports/the-2025-state-of-revops-survey)).
- HubSpot 2025 State of Sales: "only 8% of the sales reps we surveyed reported not using AI at all" ([HubSpot](https://blog.hubspot.com/sales/hubspot-sales-strategy-report)).

The consistent message: buyers assume reporting, pipeline and automation; the unmet need is trusted data and the ability to explain _why_ a number moved (why a deal stalled, why a score changed) more than more AI.

#### 9.5 Synthesis: mandatory across three or more independent sources

1. Unified customer record ("single source of truth").
2. Staged pipeline management with stage-level reporting.
3. Sales-performance reporting by rep, team and product.
4. Dashboards.
5. Pipeline-based forecasting (mandatory for analytics and RevOps tools; not a base-CRM entry rule).
6. Workflow automation including routing.
7. The standard sales KPI set: win rate, stage conversion, deal size, cycle length, velocity, coverage, quota attainment.
8. Subscription revenue KPIs: MRR/ARR, churn, LTV, NRR/GRR.
9. Support basics: ticketing, routing, SLA tracking, support reporting.
10. Knowledge base and self-service with deflection analytics.
11. Data import and export.
12. Stalled and overdue deal flags.

Appearing in one or two sources, so COMMON rather than mandatory: dunning and recovery analytics (but an entry rule for any billing product), forecast categories and accuracy tracking, cohort retention, customer health scoring, territory and quota management, lead scoring, conversation intelligence, and AI-assisted insight (an entry rule only for RO&I, though every analyst guide now evaluates it).

Differentiators only: agentic AI (lowest-rated features in G2's CRM data), natural-language analytics, AI forecasts claiming 90-98% accuracy (vendor benchmarks, not independent ones, as [CaptivateIQ](https://www.captivateiq.com/blog/sales-forecasting-software) notes), automatic CRM updates from captured conversations, and peer benchmarking.

### 10. Coverage matrix: insight features across the nine CRMs

Y = documented natively (tier noted where gated); P = partial or workaround; N = not found in the vendor's documentation; ? = could not be verified (help centre blocked or silent). Sources are in sections 1-3.

| Feature                             | HubSpot                               | Salesforce                    | Pipedrive                            | Attio         | Close                                | Zoho CRM                          | Freshsales                | Copper           | monday CRM           |
| ----------------------------------- | ------------------------------------- | ----------------------------- | ------------------------------------ | ------------- | ------------------------------------ | --------------------------------- | ------------------------- | ---------------- | -------------------- |
| Widget dashboards                   | Y (10/30/75 by tier; 50 reports each) | Y (25 widgets)                | Y (multiple on Premium+; 25 reports) | Y             | N (fixed reports; Explorer on Scale) | Y (20 components; 3/10/unlimited) | Y (10 widgets)            | Y (Business)     | Y (1/5/50/unlimited) |
| Dashboard-level filters             | Y (5 quick filters)                   | Y (5 filters, 50 values)      | Y (period, user)                     | N             | N (per report)                       | Y (2 fields)                      | Y                         | Y                | ?                    |
| Scheduled email of reports          | Y (recurring to users only)           | Y (7 per user)                | ?                                    | N             | N                                    | Y (2,000-row cap)                 | Y (recipient-scoped)      | Y                | ?                    |
| Threshold or anomaly alerts         | N                                     | Y (conditional subscriptions) | ?                                    | N             | N                                    | Y (anomaly detector, Enterprise+) | ?                         | N                | ?                    |
| Full screen / presentation          | Y                                     | P (single widget)             | P (public link)                      | Y             | N                                    | Y (Enterprise+, 10/month)         | Y                         | N                | ?                    |
| Public share link                   | N                                     | N                             | Y                                    | N             | N                                    | N                                 | N                         | N                | ?                    |
| Drill-down to records               | Y                                     | Y (+ inline edit)             | ?                                    | Y             | Y (+ bulk edit)                      | Y                                 | Y                         | ?                | ?                    |
| Cross-object reports                | Y (Pro+, 5 sources)                   | Y (joined, 5 blocks)          | ?                                    | N             | N                                    | Y (5 parent modules)              | ?                         | P (fixed groups) | ?                    |
| Formulas in reports                 | Y (Pro+)                              | Y                             | ?                                    | ?             | P (Smart View calcs)                 | P (category columns)              | Y (custom metrics)        | Y                | ?                    |
| Period comparison                   | Y (Pro+)                              | Y (PREVGROUPVAL)              | ?                                    | Y (Pro)       | Y                                    | Y                                 | ?                         | ?                | ?                    |
| Point-in-time history               | Y (snapshots, waterfall)              | Y (3 months; snapshots)       | N                                    | Y (Pro)       | P (status changes)                   | P (waterfall)                     | P (6-month field history) | N                | N                    |
| Weighted pipeline                   | Y                                     | Y                             | Y                                    | Y (formula)   | Y (expected value)                   | Y                                 | Y                         | Y (Pro+)         | Y (column)           |
| Documented funnel semantics         | P                                     | ?                             | Y                                    | P             | Y                                    | Y (Enterprise+)                   | Y                         | N                | P                    |
| Stale-deal flags                    | P (tags)                              | P (Pipeline Inspection)       | Y (rotting)                          | N             | P (Smart Views)                      | Y (Enterprise+)                   | Y (age-based)             | N                | Y (beta)             |
| Goals / quotas                      | Y                                     | Y (manual roll-up)            | Y                                    | P (goal line) | N                                    | Y                                 | Y                         | N                | Y (Pro+)             |
| Forecast categories and submissions | Y (Pro+)                              | Y                             | N                                    | N             | N                                    | Y                                 | Y                         | N                | P (Pro+)             |
| Required lost reasons               | Y                                     | ?                             | Y                                    | ?             | P (custom field)                     | ?                                 | Y                         | Y                | N                    |
| Multi-touch attribution             | Y (Marketing Enterprise)              | Y (with Account Engagement)   | N                                    | N             | N                                    | N                                 | N                         | N                | N                    |
| Cohort analysis                     | P                                     | ?                             | P                                    | ?             | Y                                    | Y                                 | P                         | ?                | ?                    |

The pattern: HubSpot, Salesforce and Zoho cover nearly every row (often only on upper tiers); Pipedrive, Freshsales and monday cover the sales-manager basics; Attio, Close and Copper leave large parts of reporting to exports or other tools. No CRM in the set ships subscription metrics (MRR movements, NRR, cohorts) natively at the depth of ChartMogul or Stripe; HubSpot's revenue analytics suite (MRR waterfall, Pro/Enterprise) comes closest.

### Sources

547 distinct URLs from 67 domains, grouped by domain in order of first citation. All were fetched on 2026-10-03 unless the text labels them as a search extract.

**knowledge.hubspot.com** (79)

1. <https://knowledge.hubspot.com/reports/manage-your-dashboards>
2. <https://knowledge.hubspot.com/dashboard/customize-your-dashboards>
3. <https://knowledge.hubspot.com/reports/manage-reports-in-your-reports-list>
4. <https://knowledge.hubspot.com/dashboards/use-dashboard-filters>
5. <https://knowledge.hubspot.com/dashboard/email-or-export-reports-and-dashboards>
6. <https://knowledge.hubspot.com/dashboards/drill-down-into-dashboard-reports>
7. <https://knowledge.hubspot.com/reports/interact-with-reports-in-the-report-viewer>
8. <https://knowledge.hubspot.com/reports/create-reports-with-the-custom-report-builder>
9. <https://knowledge.hubspot.com/reports/understand-the-custom-report-builder>
10. <https://knowledge.hubspot.com/data-management/create-and-use-datasets?no_head=1>
11. <https://knowledge.hubspot.com/reports/create-formula-fields-in-the-custom-report-builder>
12. <https://knowledge.hubspot.com/reports/compare-date-ranges-in-the-custom-report-builder>
13. <https://knowledge.hubspot.com/reports/connect-snowflake-data-share>
14. <https://knowledge.hubspot.com/object-settings/set-up-and-customize-pipelines>
15. <https://knowledge.hubspot.com/properties/hubspots-default-deal-properties>
16. <https://knowledge.hubspot.com/reports/create-custom-funnel-reports>
17. <https://knowledge.hubspot.com/object-settings/set-up-pipeline-rules>
18. <https://knowledge.hubspot.com/reports/create-sales-reports-in-the-sales-analytics-suite>
19. <https://knowledge.hubspot.com/object-settings/color-coded-object-tags>
20. <https://knowledge.hubspot.com/goals/view-and-manage-your-goals>
21. <https://knowledge.hubspot.com/reports/create-sales-goals>
22. <https://knowledge.hubspot.com/forecast/use-the-forecast-tool>
23. <https://knowledge.hubspot.com/forecast/set-up-the-forecast-tool>
24. <https://knowledge.hubspot.com/forecast/improve-forecasting-with-ai-projections>
25. <https://knowledge.hubspot.com/reports/create-attribution-reports>
26. <https://knowledge.hubspot.com/reports/understand-attribution-reporting>
27. <https://knowledge.hubspot.com/records/view-record-property-history>
28. <https://knowledge.hubspot.com/subscriptions/manage-subscriptions>
29. <https://knowledge.hubspot.com/reports/create-reports-in-the-revenue-analytics-suite>
30. <https://knowledge.hubspot.com/quotes/configure-billing-settings>
31. <https://knowledge.hubspot.com/invoices/create-and-manage-invoices>
32. <https://knowledge.hubspot.com/payments/manage-payments>
33. <https://knowledge.hubspot.com/reports/create-service-reports-in-the-service-analytics-suite>
34. <https://knowledge.hubspot.com/properties/hubspots-default-ticket-properties>
35. <https://knowledge.hubspot.com/help-desk/set-sla-goals-in-help-desk>
36. <https://knowledge.hubspot.com/inbox/set-slas-in-the-inbox>
37. <https://knowledge.hubspot.com/help-desk/analyze-help-desk>
38. <https://knowledge.hubspot.com/customer-feedback/how-do-i-send-a-customer-support-survey>
39. <https://knowledge.hubspot.com/customer-feedback/how-do-i-send-a-customer-loyalty-survey>
40. <https://knowledge.hubspot.com/customer-feedback/create-and-send-customer-satisfaction-surveys>
41. <https://knowledge.hubspot.com/customer-agent/use-topics-to-analyze-customer-interactions>
42. <https://knowledge.hubspot.com/help-desk/use-the-help-desk-coaching-page>
43. <https://knowledge.hubspot.com/customer-agent/analyze-your-customer-agents-performance>
44. <https://knowledge.hubspot.com/scoring/understand-the-lead-scoring-tool>
45. <https://knowledge.hubspot.com/scoring/lead-score-history-and-performance>
46. <https://knowledge.hubspot.com/scoring/test-records-in-scoring-tools>
47. <https://knowledge.hubspot.com/workflows/assign-and-rotate-record-owners-using-workflows>
48. <https://knowledge.hubspot.com/inbox/set-your-conversations-routing-rules>
49. <https://knowledge.hubspot.com/email/sales-email-send-limits>
50. <https://knowledge.hubspot.com/sequences/create-and-edit-sequences>
51. <https://knowledge.hubspot.com/sequences/automate-a-b-testing-emails-with-sequences>
52. <https://knowledge.hubspot.com/workflows/workflows-faq>
53. <https://knowledge.hubspot.com/workflows/add-re-enrollment-triggers-to-a-workflow>
54. <https://knowledge.hubspot.com/workflows/restore-workflow-crm-property-changes>
55. <https://knowledge.hubspot.com/quotes/set-up-quote-approvals>
56. <https://knowledge.hubspot.com/object-settings/pipeline-approvals>
57. <https://knowledge.hubspot.com/quotes/use-e-signatures-with-quotes>
58. <https://knowledge.hubspot.com/cpq/getting-started-with-hubspot-cpq>
59. <https://knowledge.hubspot.com/products/use-price-books>
60. <https://knowledge.hubspot.com/payment-processing/set-up-a-billing-portal>
61. <https://knowledge.hubspot.com/inbox/manage-customer-portal-settings>
62. <https://knowledge.hubspot.com/forms/verify-form-submissions-with-recaptcha-v3>
63. <https://knowledge.hubspot.com/records/deduplication-of-records>
64. <https://knowledge.hubspot.com/meetings-tool/understand-group-and-round-robin-meeting-availability>
65. <https://knowledge.hubspot.com/meetings-tool/schedule-a-meeting-with-a-contact-using-meeting-rotations>
66. <https://knowledge.hubspot.com/records/summarize-records>
67. <https://knowledge.hubspot.com/ai/use-breeze-assistant>
68. <https://knowledge.hubspot.com/prospecting/use-the-prospecting-agent>
69. <https://knowledge.hubspot.com/generate-sales-email-templates-with-ai-assistant>
70. <https://knowledge.hubspot.com/records/use-deal-scores>
71. <https://knowledge.hubspot.com/contacts/determine-likelihood-to-close-with-predictive-lead-scoring>
72. <https://knowledge.hubspot.com/ai/summarize-and-review-data-with-breeze-assistant>
73. <https://knowledge.hubspot.com/records/get-started-with-data-enrichment>
74. <https://knowledge.hubspot.com/customer-agent/understand-the-customer-agent>
75. <https://knowledge.hubspot.com/account-management/hubspot-machine-learning-data>
76. <https://knowledge.hubspot.com/account-management/manage-your-ai-settings>
77. <https://knowledge.hubspot.com/account-management/understand-hubspot-credits-and-billing>
78. <https://knowledge.hubspot.com/help-desk/customize-a-health-score-in-the-customer-success-workspace>
79. <https://knowledge.hubspot.com/customer-success/use-the-customer-success-workspace>

**help.zoho.com** (43)

80. <https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/analytical-components>
81. <https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/create-dashboard>
82. <https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/reports/create-edit-reports/articles/schedule-reports>
83. <https://help.zoho.com/portal/en/kb/crm-nextgen/analytics-and-dashboards/analytics-dashboards/articles/nextgen-creating-anomaly-detector>
84. <https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/reports/create-edit-reports/articles/understanding-and-building-reports>
85. <https://help.zoho.com/portal/en/kb/crm-nextgen/analytics-and-dashboards/analytics-dashboards/articles/nextgen-create-charts>
86. <https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/reports/create-edit-reports/articles/create-category-columns-in-reports>
87. <https://help.zoho.com/portal/en/kb/crm-nextgen/analytics-and-dashboards/analytics-dashboards/articles/nextgen-create-comparator>
88. <https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/create-kpi>
89. <https://help.zoho.com/portal/en/kb/crm/sales-force-automation/deal-management/articles/standard-fields-deals>
90. <https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/stage-component>
91. <https://help.zoho.com/portal/en/kb/crm/sales-force-automation/forecasts/articles/creating-and-working-with-forecasts>
92. <https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/create-target-meter>
93. <https://help.zoho.com/portal/en/kb/crm/analytics-and-dashboards/analytics-dashboards/articles/cohort-analysis>
94. <https://help.zoho.com/portal/en/kb/desk/reports-and-dashboards/reports/articles/understanding-the-agent-performance-report>
95. <https://help.zoho.com/portal/en/kb/desk/faqs/automation/articles/faqs-sla-service-level-agreement>
96. <https://help.zoho.com/portal/en/kb/desk/automation/escalate-sla/articles/understanding-and-working-with-slas>
97. <https://help.zoho.com/portal/en/kb/desk/reports-and-dashboards/dashboards/articles/sla-dashboard>
98. <https://help.zoho.com/portal/en/kb/desk/reports-and-dashboards/dashboards/articles/overview-dashboard-desk>
99. <https://help.zoho.com/portal/en/kb/desk/organization-settings/customer-happiness/articles/setting-up-customer-happiness-rating>
100.  <https://help.zoho.com/portal/en/kb/desk/zia/intelligence/articles/understanding-zia-auto-tags>
101.  <https://help.zoho.com/portal/en/kb/crm-v2-1/automate-business-processes/scoring-rules/articles/crm-v2-multiple-scoring-rule>
102.  <https://help.zoho.com/portal/en/kb/crm/zia-artificial-intelligence/prediction/articles/zia-s-field-prediction>
103.  <https://help.zoho.com/portal/en/kb/crm/automate-business-processes/assignment-rules/articles/set-assignment-rules>
104.  <https://help.zoho.com/portal/en/kb/crm/automate-business-processes/assignment-threshold/articles/assignment-threshold>
105.  <https://help.zoho.com/portal/en/kb/crm/security-control/territory-management>
106.  <https://help.zoho.com/portal/en/kb/crm/automate-business-processes/cadences/articles/cadences>
107.  <https://help.zoho.com/portal/en/kb/crm/automate-business-processes/workflows/articles/configuring-workflow-rules>
108.  <https://help.zoho.com/portal/en/kb/crm/automate-business-processes/workflows/articles/workflow-report>
109.  <https://help.zoho.com/portal/en/kb/crm/process-management/blueprint>
110.  <https://help.zoho.com/portal/en/kb/crm-nextgen/process-management/approval-process/articles/nextgen-add-approval-process>
111.  <https://help.zoho.com/portal/en/kb/crm/manage-inventory/quotes/articles/create-quotes>
112.  <https://help.zoho.com/portal/en/kb/crm/manage-inventory/price-books/articles/price-books>
113.  <https://help.zoho.com/portal/en/kb/crm/connect-with-customers/portals/articles/setting-up-portal>
114.  <https://help.zoho.com/portal/en/kb/crm/connect-with-customers/webforms/articles/set-up-web-forms>
115.  <https://help.zoho.com/portal/en/kb/crm/connect-with-customers/webforms/articles/webform-ab-testing>
116.  <https://help.zoho.com/portal/en/kb/crm/zia-artificial-intelligence/generative-ai/articles/zia-models>
117.  <https://help.zoho.com/portal/en/kb/crm/zia-artificial-intelligence/communication/zia-for-calls>
118.  <https://help.zoho.com/portal/en/kb/crm/zia-artificial-intelligence/communication/best-time-to-contact-customers>
119.  <https://help.zoho.com/portal/en/kb/crm-nextgen/zia-artificial-intelligence/prediction/articles/nextgen-zia-scores>
120.  <https://help.zoho.com/portal/en/kb/crm-nextgen/zia-artificial-intelligence/conversational-ai/articles/nextgen-ask-zia-17-8-2022>
121.  <https://help.zoho.com/portal/en/kb/crm-nextgen/zia-artificial-intelligence/data-enrichment/articles/nextgen-zia-data-enrichment>
122.  <https://help.zoho.com/portal/en/kb/crm-nextgen/analytics-and-dashboards/analytics-or-dashboards/articles/nextgen-creating-anomaly-detector>

**crmsupport.freshworks.com** (35)

123. <https://crmsupport.freshworks.com/support/solutions/articles/50000003034-introduction-to-analytics>
124. <https://crmsupport.freshworks.com/support/solutions/articles/50000003035-how-to-share-reports->
125. <https://crmsupport.freshworks.com/support/solutions/articles/50000003049-how-to-create-a-custom-report->
126. <https://crmsupport.freshworks.com/support/solutions/articles/50000003038-how-to-schedule-custom-reports->
127. <https://crmsupport.freshworks.com/support/solutions/articles/50000004854-what-s-new-in-analytics->
128. <https://crmsupport.freshworks.com/support/solutions/articles/50000003040-how-to-export-reports->
129. <https://crmsupport.freshworks.com/support/solutions/articles/50000003036-how-to-create-trend-reports->
130. <https://crmsupport.freshworks.com/support/solutions/articles/50000006074-how-to-use-custom-metrics-and-attributes-in-reports>
131. <https://crmsupport.freshworks.com/support/solutions/articles/50000002959-how-to-set-up-and-use-weighted-pipelines->
132. <https://crmsupport.freshworks.com/support/solutions/articles/50000010067-how-to-analyze-deal-stage-movement-with-analytics-in-freshsales->
133. <https://crmsupport.freshworks.com/support/solutions/articles/50000009799-what-is-sales-essentials-dashboard->
134. <https://crmsupport.freshworks.com/support/solutions/articles/50000002157-what-are-stale-deals-how-do-they-work->
135. <https://crmsupport.freshworks.com/support/solutions/articles/50000003037-what-are-curated-reports-how-to-use-them->
136. <https://crmsupport.freshworks.com/support/solutions/articles/50000002581-how-to-assign-and-track-quota->
137. <https://crmsupport.freshworks.com/support/solutions/articles/50000002881-how-to-predict-revenue-from-your-team->
138. <https://crmsupport.freshworks.com/support/solutions/articles/50000002883-how-to-use-freddy-to-identify-and-commit-to-deals->
139. <https://crmsupport.freshworks.com/support/solutions/articles/50000005558-how-to-attribute-revenue-to-a-campaign->
140. <https://crmsupport.freshworks.com/support/solutions/articles/50000009049-how-to-track-field-edit-history-of-deals->
141. <https://crmsupport.freshworks.com/support/solutions/articles/50000002580-what-is-contact-scoring-how-to-setup-scoring-signals->
142. <https://crmsupport.freshworks.com/support/solutions/articles/50000003001-how-to-use-contact-scoring-to-prioritize-contacts->
143. <https://crmsupport.freshworks.com/support/solutions/articles/50000002703-how-to-auto-assign-records-to-users-sales-owners->
144. <https://crmsupport.freshworks.com/support/solutions/articles/50000002702-how-to-create-and-use-territories->
145. <https://crmsupport.freshworks.com/support/solutions/articles/50000002619-what-are-the-different-user-limits-in-sales-sequences->
146. <https://crmsupport.freshworks.com/support/solutions/articles/50000002163-what-are-classic-and-smart-sequences-where-should-they-be-used->
147. <https://crmsupport.freshworks.com/support/solutions/articles/50000002143-how-to-configure-a-workflow->
148. <https://crmsupport.freshworks.com/support/solutions/articles/50000003241-what-is-cpq-add-on-how-does-the-add-on-work->
149. <https://crmsupport.freshworks.com/support/solutions/articles/50000005700-how-to-add-esignatures-to-quotes->
150. <https://crmsupport.freshworks.com/support/solutions/articles/50000002420-how-to-add-and-use-products->
151. <https://crmsupport.freshworks.com/support/solutions/articles/50000003752-overview-of-freshdesk-portal>
152. <https://crmsupport.freshworks.com/support/solutions/articles/50000002631-how-to-configure-web-forms->
153. <https://crmsupport.freshworks.com/support/solutions/articles/50000009124-understanding-freddy-ai-features-and-pricing>
154. <https://crmsupport.freshworks.com/support/solutions/articles/50000002393-what-are-freddy-deal-insights-and-how-to-use-them->
155. <https://crmsupport.freshworks.com/support/solutions/articles/50000009033-conversational-analytics-formerly-prompt-based-analytics->
156. <https://crmsupport.freshworks.com/support/solutions/articles/50000009031-proactive-insights>
157. <https://crmsupport.freshworks.com/support/solutions/articles/50000004664-freddy-ai-agent-sessions-faqs>

**help.salesforce.com** (23)

158. <https://help.salesforce.com/s/articleView?id=rd_reports_dashboards_limits.htm&language=en_US&type=5>
159. <https://help.salesforce.com/s/articleView?id=analytics.dashboards_create_lex.htm&language=en_US&type=5>
160. <https://help.salesforce.com/s/articleView?id=analytics.analytics_folder_access.htm&language=en_US&type=5>
161. <https://help.salesforce.com/s/articleView?id=analytics.dashboards_view_as.htm&language=en_US&type=5>
162. <https://help.salesforce.com/s/articleView?id=analytics.dashboards_dynamic_overview.htm&language=en_US&type=5>
163. <https://help.salesforce.com/s/articleView?id=analytics.dashboards_view_as_considerations.htm&language=en_US&type=5>
164. <https://help.salesforce.com/s/articleView?id=000387285&language=en_US&type=1>
165. <https://help.salesforce.com/s/articleView?id=analytics.dashboard_filters_overview.htm&language=en_US&type=5>
166. <https://help.salesforce.com/s/articleView?id=analytics.dashboards_filter_url.htm&language=en_US&type=5>
167. <https://help.salesforce.com/s/articleView?id=000383344&language=en_US&type=1>
168. <https://help.salesforce.com/s/articleView?id=analytics.reports_subscribe_notify_threshold.htm&language=en_US&type=5>
169. <https://help.salesforce.com/s/articleView?id=analytics.dashboards_subscribe_lex.htm&language=en_US&type=5>
170. <https://help.salesforce.com/s/articleView?id=analytics.dashboards_embed.htm&language=en_US&type=5>
171. <https://help.salesforce.com/s/articleView?id=analytics.dashboards_refresh.htm&language=en_US&type=5>
172. <https://help.salesforce.com/s/articleView?id=analytics.dashboards_schedule_refresh.htm&language=en_US&type=5>
173. <https://help.salesforce.com/s/articleView?id=analytics.reports_drilldown.htm&language=en_US&type=5>
174. <https://help.salesforce.com/s/articleView?id=analytics.reports_inline_editing.htm&language=en_US&type=5>
175. <https://help.salesforce.com/s/articleView?id=analytics.reports_working_with_joined.htm&language=en_US&type=5>
176. <https://help.salesforce.com/s/articleView?id=analytics.reports_formulas_row_level_limits.htm&language=en_US&type=5>
177. <https://help.salesforce.com/s/articleView?id=analytics.reports_builder_fields_formulas.htm&language=en_US&type=5>
178. <https://help.salesforce.com/s/articleView?id=analytics.reports_export.htm&language=en_US&type=5>
179. <https://help.salesforce.com/s/articleView?id=analytics.reports_historical_concepts.htm&language=en_US&type=5>
180. <https://help.salesforce.com/s/articleView?id=analytics.data_about_analytic_snap.htm&language=en_US&type=5>

**intercom.com** (22)

181. <https://www.intercom.com/help/en/articles/5784131-real-time-dashboard>
182. <https://www.intercom.com/help/en/articles/7022438-reporting-metrics-attributes>
183. <https://www.intercom.com/help/en/articles/3653556-responsiveness-reporting>
184. <https://www.intercom.com/help/en/articles/8425113-how-to-use-office-hours-in-reporting>
185. <https://www.intercom.com/help/en/articles/6546152-set-slas-for-conversations-and-tickets>
186. <https://www.intercom.com/help/en/articles/9263617-slas-and-office-hours>
187. <https://www.intercom.com/help/en/articles/2672572-slas-reporting>
188. <https://www.intercom.com/help/en/articles/15362781-trigger-a-workflow-before-or-when-an-sla-breaches>
189. <https://www.intercom.com/help/en/articles/8921906-reporting-faqs>
190. <https://www.intercom.com/help/en/articles/7872853-measure-customer-satisfaction-with-conversation-ratings>
191. <https://www.intercom.com/help/en/articles/10495092-understand-customer-experience-at-scale-with-the-cx-score>
192. <https://www.intercom.com/help/en/articles/11390087-use-the-topics-explorer-to-see-what-s-driving-volume>
193. <https://www.intercom.com/help/en/articles/13868265-pro-add-on>
194. <https://www.intercom.com/help/en/articles/6560699-monitoring-your-team-s-workload-and-capacity>
195. <https://www.intercom.com/help/en/articles/2046229-export-your-conversations-data>
196. <https://www.intercom.com/help/en/articles/13004328-schedule-sharing-your-reports-externally>
197. <https://www.intercom.com/help/en/articles/11394959-use-ai-powered-content-recommendations-to-improve-fin>
198. <https://www.intercom.com/help/en/articles/6955446-ai-features-available-in-the-inbox.md>
199. <https://www.intercom.com/help/en/articles/9121374-copilot-explained.md>
200. <https://www.intercom.com/help/en/articles/8205718-fin-ai-agent-outcomes.md>
201. <https://www.intercom.com/help/en/articles/11993352-ai-model-training-and-fine-tuning>
202. <https://www.intercom.com/help/en/articles/9121384-copilot-included-and-unlimited-usage.md>

**support.zendesk.com** (22)

203. <https://support.zendesk.com/hc/en-us/articles/4408834848154-About-native-Support-time-duration-metrics>
204. <https://support.zendesk.com/hc/en-us/articles/4408821871642-Understanding-ticket-reply-time>
205. <https://support.zendesk.com/hc/en-us/articles/4408829459866-Defining-SLA-policies>
206. <https://support.zendesk.com/hc/en-us/articles/4408827693594-Metrics-and-attributes-for-Zendesk-Support>
207. <https://support.zendesk.com/hc/en-us/articles/4408825745690-Can-I-pause-the-SLA-timer-or-reset-it-under-certain-conditions>
208. <https://support.zendesk.com/hc/en-us/articles/4408820131994-Workflow-How-to-alert-your-team-to-tickets-nearing-an-SLA-breach>
209. <https://support.zendesk.com/hc/en-us/articles/11006936409882-Troubleshooting-common-SLA-issues>
210. <https://support.zendesk.com/hc/en-us/articles/7689997846554-Sending-a-CSAT-survey-to-your-customers>
211. <https://support.zendesk.com/hc/en-us/articles/4408886173338-About-the-CSAT-Customer-Satisfaction-user-experience-for-email-and-messaging>
212. <https://support.zendesk.com/hc/en-us/articles/4408846011546-Viewing-your-CSAT-customer-satisfaction-score-and-ratings>
213. <https://support.zendesk.com/hc/en-us/articles/4408843026714-What-is-being-removed-updated-September-2026>
214. <https://support.zendesk.com/hc/en-us/articles/7043759414042-Accessing-and-viewing-the-Surveys-dashboard>
215. <https://support.zendesk.com/hc/en-us/articles/4964463770650-About-intelligent-triage>
216. <https://support.zendesk.com/hc/en-us/articles/4408843771546-Overview-of-the-Explore-live-dashboard>
217. <https://support.zendesk.com/hc/en-us/articles/4408823242778-Data-refresh-intervals-for-analytics>
218. <https://support.zendesk.com/hc/en-us/articles/4408823356186-About-the-Zendesk-Explore-plan-types>
219. <https://support.zendesk.com/hc/en-us/articles/4408843602714-Scheduling-dashboard-deliveries>
220. <https://support.zendesk.com/hc/en-us/articles/6037992005914-Exporting-datasets-from-Explore>
221. <https://support.zendesk.com/hc/en-us/articles/9570369117338-About-automated-resolution-tiers>
222. <https://support.zendesk.com/hc/en-us/articles/10677925692698-Announcing-changes-to-AI-agent-reporting>
223. <https://support.zendesk.com/hc/en-us/articles/4408894139930-Getting-started-with-self-service-Part-6-Tracking-essential-self-service-metrics>
224. <https://support.zendesk.com/hc/en-us/articles/5352026794010-About-automated-resolutions-for-AI-agents>

**help.close.com** (21)

225. <https://help.close.com/llms.txt>
226. <https://help.close.com/feature-guide/reports/explorer.md>
227. <https://help.close.com/feature-guide/reports.md>
228. <https://help.close.com/feature-guide/reports/activity-comparison-report.md>
229. <https://help.close.com/feature-guide/reports/activity-overview-report.md>
230. <https://help.close.com/feature-guide/leads/edit-merge-delete-leads.md>
231. <https://help.close.com/feature-guide/lead-filtering-and-smart-views/calculations-in-smart-views.md>
232. <https://help.close.com/feature-guide/reports/activity-overview-report>
233. <https://help.close.com/feature-guide/opportunities/opportunity-pipeline-view.md>
234. <https://help.close.com/feature-guide/reports/opportunity-funnels-report.md>
235. <https://help.close.com/best-practices/build-a-sales-process/designing-your-sales-pipeline.md>
236. <https://help.close.com/best-practices/lead-scoring>
237. <https://help.close.com/feature-guide/workflows/workflow-steps>
238. <https://help.close.com/best-practices/simplify-your-workflows-with-automated-senders/new-assign-leads-to-users-via-round-robin>
239. <https://help.close.com/feature-guide/workflows>
240. <https://help.close.com/feature-guide/forms>
241. <https://help.close.com/feature-guide/scheduling-links>
242. <https://help.close.com/account-management/variable-usage-costs-calling-sms-phone-numbers-ai-tools/ai-credits.md>
243. <https://help.close.com/feature-guide/calling/call-assistant.md>
244. <https://help.close.com/feature-guide/chloe.md>
245. <https://help.close.com/feature-guide/enrichment.md>

**attio.com** (20)

246. <https://attio.com/help/reference/managing-your-data/dashboard-and-reports/dashboards>
247. <https://attio.com/pricing>
248. <https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports>
249. <https://attio.com/help/reference/managing-your-data/dashboard-and-reports/manage-reports>
250. <https://attio.com/help/reference/managing-your-data/dashboard-and-reports/set-up-an-insight-report>
251. <https://attio.com/help/reference/managing-your-data/dashboard-and-reports/build-a-sales-reporting-dashboard>
252. <https://attio.com/help/academy/reports-course/historical-reports>
253. <https://attio.com/help/reference/managing-your-data/dashboard-and-reports/set-up-a-historical-values-report>
254. <https://attio.com/blog/introducing-ai-attributes>
255. <https://attio.com/help/reference/automations/workflows/workflows-block-library>
256. <https://attio.com/help/reference/automations/sequences/create-a-sequence>
257. <https://attio.com/help/reference/workspace-settings-billing/manage-workspace-and-seat-credits>
258. <https://attio.com/help/reference/automations/workflows/manage-workflows>
259. <https://attio.com/help/reference/automations/workflows/troubleshooting-workflows>
260. <https://attio.com/apps/pandadoc>
261. <https://attio.com/help/reference/managing-your-data/attributes/ai-attributes>
262. <https://attio.com/platform/call-intelligence>
263. <https://attio.com/help/reference/attio-ai/ask-attio/chat-with-ask-attio>
264. <https://attio.com/platform/enrichment>
265. <https://attio.com/help/reference/attio-ai/attio-ai-policy>

**support.copper.com** (20)

266. <https://support.copper.com/en/articles/8823388-custom-reports-frequently-asked-questions>
267. <https://support.copper.com/en/articles/8823380-custom-reports-user-access-to-custom-reports>
268. <https://support.copper.com/en/articles/8823384-custom-reports-creating-editing-a-reports-dashboard>
269. <https://support.copper.com/en/articles/8823382-custom-reports-getting-started>
270. <https://support.copper.com/en/articles/8823392-custom-reports-insights-builder>
271. <https://support.copper.com/en/articles/8823389-custom-reports-custom-insight-example-pivot-table-with-calculated-measure>
272. <https://support.copper.com/en/articles/8823409-pipeline-reports-pipeline-summary>
273. <https://support.copper.com/en/articles/8823416-pipeline-reports-sales-by-owner-and-loss-reasons>
274. <https://support.copper.com/en/articles/8823394-custom-reports-reference-documents-metrics>
275. <https://support.copper.com/en/articles/8823379-custom-reports-sales-cycle-length-and-days-in-stage>
276. <https://support.copper.com/en/articles/9888054-custom-activity-reports-getting-started-best-practices>
277. <https://support.copper.com/en/articles/8823412-pipeline-reports-forecast>
278. <https://support.copper.com/en/articles/8823335-understand-and-customize-loss-reasons-field>
279. <https://support.copper.com/en/articles/9888116-set-win-percentage-to-0-when-opp-is-lost>
280. <https://support.copper.com/en/articles/9888036-reporting-tracking-opportunity-value-changes>
281. <https://support.copper.com/en/articles/8823368-automating-your-account-with-workflow-automation>
282. <https://support.copper.com/en/articles/8879978-best-practices-for-email-automation>
283. <https://support.copper.com/en/articles/15926316-create-a-workflow-automation-rule>
284. <https://support.copper.com/en/articles/15861813-use-copper-forms-to-capture-contacts>
285. <https://support.copper.com/en/articles/15075498-summarize-relationships-and-opportunities-with-google-gemini>

**trailhead.salesforce.com** (20)

286. <https://trailhead.salesforce.com/content/learn/modules/sales-forecasting/configure-sales-forecasting-in-salesforce>
287. <https://trailhead.salesforce.com/content/learn/modules/sales-forecasting/track-sales-forecast-performance>
288. <https://trailhead.salesforce.com/content/learn/modules/revenue-intelligence-setup/set-up-pipeline-inspection>
289. <https://trailhead.salesforce.com/trailblazer-community/feed/0D54S00000A8FxfSAF>
290. <https://trailhead.salesforce.com/content/learn/modules/lead-scoring-and-grading-in-account-engagement/einstein-scoring-in-account-engagement>
291. <https://trailhead.salesforce.com/content/learn/modules/lead-scoring-and-grading-in-account-engagement/get-started-with-lead-scoring>
292. <https://trailhead.salesforce.com/content/learn/modules/enhanced-omni-channel/improve-work-distribution-with-enhanced-omni-channel>
293. <https://trailhead.salesforce.com/content/learn/modules/advanced-territory-management/optimize-enterprise-territory-management-performance>
294. <https://trailhead.salesforce.com/content/learn/modules/high-velocity-sales/get-to-know-the-console-and-cadences>
295. <https://trailhead.salesforce.com/content/learn/modules/quick-cadences-for-sales-teams/use-linkedin-and-explore-more-settings>
296. <https://trailhead.salesforce.com/content/learn/modules/record-triggered-flows/get-started-with-triggered-flows>
297. <https://trailhead.salesforce.com/content/learn/modules/flow-implementation-2/handle-flow-errors-with-fault-paths>
298. <https://trailhead.salesforce.com/content/learn/modules/flow-implementation-2/debug-flows-as-another-user>
299. <https://trailhead.salesforce.com/content/learn/modules/business_process_automation/approvals>
300. <https://trailhead.salesforce.com/content/learn/modules/advanced-approvals-for-admins/use-smart-approvals-to-evaluate-changes>
301. <https://trailhead.salesforce.com/content/learn/projects/manage-products-prices-quotes-orders/create-multiple-quotes>
302. <https://trailhead.salesforce.com/content/learn/projects/manage-products-prices-quotes-orders/create-custom-price-books>
303. <https://trailhead.salesforce.com/content/learn/modules/community_cloud_basics/communities_intro_to_community_cloud>
304. <https://trailhead.salesforce.com/content/learn/modules/migrating-from-legacy-chat-to-enhanced-chat/explore-enhanced-chat>
305. <https://trailhead.salesforce.com/content/learn/modules/salesforce-surveys-for-admins/automate-your-survey-invitations>

**salesforce.com** (16)

306. <https://www.salesforce.com/news/stories/sales-ai-statistics-2024/>
307. <https://www.salesforce.com/sales/pricing/>
308. <https://www.salesforce.com/sales/ai/>
309. <https://www.salesforce.com/sales/conversation-intelligence/>
310. <https://www.salesforce.com/sales/ai-sales-agent/>
311. <https://www.salesforce.com/sales/analytics/>
312. <https://www.salesforce.com/news/press-releases/2025/05/15/agentforce-flexible-pricing-news/>
313. <https://www.salesforce.com/agentforce/pricing/>
314. <https://www.salesforce.com/artificial-intelligence/trusted-ai/>
315. <https://www.salesforce.com/agentforce/digital-wallet/>
316. <https://www.salesforce.com/agentforce/ai-agents/security/>
317. <https://www.salesforce.com/en-us/wp-content/uploads/sites/4/documents/reports/sales/g2-salesforce-sales-cloud-grid-report-crm-fall-2025.pdf>
318. <https://www.salesforce.com/sales/resources/gartner-mq-crm-sales-platforms-2026/?d=pb&pr=>
319. <https://www.salesforce.com/crm/resources/isg-crm-sales-buyers-guide-2026/?d=pb&pr=>
320. <https://www.salesforce.com/crm/resources/isg-crm-service-buyers-guide-2026/?d=pb&pr=>
321. <https://www.salesforce.com/crm/resources/isg-sales-engagement-buyers-guide-2026/?d=pb&pr=>

**support.pipedrive.com** (16)

322. <https://support.pipedrive.com/en/article/insights-dashboards>
323. <https://support.pipedrive.com/article/usage-limits-in-pipedrive>
324. <https://support.pipedrive.com/en/article/shareable-insights>
325. <https://support.pipedrive.com/en/article/probability-in-pipedrive>
326. <https://support.pipedrive.com/en/article/insights-reports-deal-conversion>
327. <https://support.pipedrive.com/en/article/insights-reports-deal-progress>
328. <https://support.pipedrive.com/en/article/insights-reports-deal-duration>
329. <https://support.pipedrive.com/en/article/the-rotting-feature>
330. <https://support.pipedrive.com/en/article/insights-report-types>
331. <https://support.pipedrive.com/en/article/insights-goals>
332. <https://support.pipedrive.com/en/article/insights-reports-revenue-forecast>
333. <https://support.pipedrive.com/en/article/lost-reasons>
334. <https://support.pipedrive.com/en/article/automation-limits>
335. <https://support.pipedrive.com/en/article/pipedrive-ai>
336. <https://support.pipedrive.com/article/sales-assistant>
337. <https://support.pipedrive.com/article/ai-report-generation>

**docs.stripe.com** (15)

338. <https://docs.stripe.com/stripe-data/data-pipeline>
339. <https://docs.stripe.com/billing/subscriptions/analytics/glossary>
340. <https://docs.stripe.com/billing/revenue-recovery/customer-emails>
341. <https://docs.stripe.com/invoicing/hosted-invoice-page>
342. <https://docs.stripe.com/invoicing/dashboard/credit-notes>
343. <https://docs.stripe.com/customer-management>
344. <https://docs.stripe.com/quotes>
345. <https://docs.stripe.com/billing/revenue-recovery/smart-retries>
346. <https://docs.stripe.com/invoicing/automatic-collection>
347. <https://docs.stripe.com/billing/revenue-recovery/recovery-analytics>
348. <https://docs.stripe.com/revenue-recognition/methodology>
349. <https://docs.stripe.com/revenue-recognition/revenue-settings>
350. <https://docs.stripe.com/revenue-recognition/reports>
351. <https://docs.stripe.com/revenue-recognition/reports/waterfall>
352. <https://docs.stripe.com/data/sigma>

**help.chartmogul.com** (15)

353. <https://help.chartmogul.com/hc/en-us/articles/203299812>
354. <https://help.chartmogul.com/hc/en-us/articles/201520952>
355. <https://help.chartmogul.com/article/245-configuring-subscription-analytics-settings>
356. <https://help.chartmogul.com/hc/en-us/articles/4416682609426>
357. <https://help.chartmogul.com/article/303-handling-past-due-subscriptions>
358. <https://help.chartmogul.com/hc/en-us/articles/6886664393500>
359. <https://help.chartmogul.com/hc/en-us/articles/6886621218332>
360. <https://help.chartmogul.com/hc/en-us/articles/203359061>
361. <https://help.chartmogul.com/hc/en-us/articles/213789989>
362. <https://help.chartmogul.com/hc/en-us/articles/4599973627036>
363. <https://help.chartmogul.com/hc/en-us/articles/360000962329>
364. <https://help.chartmogul.com/article/138-benchmarks>
365. <https://help.chartmogul.com/collection/43-integrations-and-data>
366. <https://help.chartmogul.com/article/265-configuring-hubspot-as-a-source>
367. <https://help.chartmogul.com/article/192-getting-started-with-destinations>

**help.baremetrics.com** (14)

368. <https://help.baremetrics.com/en/articles/5380330-monthly-recurring-revenue>
369. <https://help.baremetrics.com/en/articles/9096541-usage-based-billing>
370. <https://help.baremetrics.com/en/articles/5380391-how-often-is-my-data-updated>
371. <https://help.baremetrics.com/en/articles/5380347-user-and-revenue-churn>
372. <https://help.baremetrics.com/en/articles/5380323-reactivations>
373. <https://help.baremetrics.com/en/articles/9893951-net-revenue-retention-nrr-vs-gross-revenue-retention-grr>
374. <https://help.baremetrics.com/en/articles/5380345-ltv-lifetime-value>
375. <https://help.baremetrics.com/en/articles/5380031-cohorts>
376. <https://help.baremetrics.com/en/articles/5379934-segment-your-metrics>
377. <https://help.baremetrics.com/en/articles/15518999-customer-insights-non-paying-renewing-cancelling-geo>
378. <https://help.baremetrics.com/en/articles/5380028-forecast>
379. <https://help.baremetrics.com/en/articles/5380058-goals>
380. <https://help.baremetrics.com/en/articles/5380550-slack-integration>
381. <https://help.baremetrics.com/en/articles/5380475-connecting-your-payment-processors-and-data-sources>

**help.gong.io** (14)

382. <https://help.gong.io/v1/docs/customize-your-deal-warning-settings>
383. <https://help.gong.io/v1/docs/configurable-forecast-article-1>
384. <https://help.gong.io/v1/docs/create-a-submission-column>
385. <https://help.gong.io/v1/docs/analyze-see-forecast-projection>
386. <https://help.gong.io/v1/docs/explainer-aligning-analytics-reports-with-historical-data>
387. <https://help.gong.io/docs/use-transcripts-outline-and-call-details.md>
388. <https://help.gong.io/apidocs/retrieve-interaction-stats-for-applicable-users-by-date-v2statsinteraction.md>
389. <https://help.gong.io/docs/create-smart-trackers.md>
390. <https://help.gong.io/docs/measuring-ai-performance-at-gong.md>
391. <https://help.gong.io/docs/understanding-ai-deal-predictor.md>
392. <https://help.gong.io/docs/understanding-ai-revenue-predictor.md>
393. <https://help.gong.io/docs/understanding-ai-ask-anything.md>
394. <https://help.gong.io/docs/customize-your-deal-warning-settings.md>
395. <https://help.gong.io/docs/about-gong-credits.md>

**hubspot.com** (10)

396. <https://www.hubspot.com/pricing/sales>
397. <https://www.hubspot.com/products/data/cloud-data-storage-integrations>
398. <https://www.hubspot.com/products/sales/ai-notetaker>
399. <https://www.hubspot.com/products/conversation-intelligence>
400. <https://www.hubspot.com/products/sales/ai-guided-selling>
401. <https://www.hubspot.com/products/forecasting>
402. <https://www.hubspot.com/products/artificial-intelligence/ai-data-agent>
403. <https://www.hubspot.com/hubfs/Agency/GTM%20-%20Product%20Resources%20(Justin)/Product%20Folders%20(EN)/HubSpot%20AI/Breeze%20Intelligence%20-%20Pricing%20Guide.pdf>
404. <https://www.hubspot.com/products/artificial-intelligence/credits>
405. <https://www.hubspot.com/products/sales/deal-progression>

**support.freshdesk.com** (10)

406. <https://support.freshdesk.com/support/solutions/articles/50000000017-average-first-response-time-in-analytics-helpdesk-performance->
407. <https://support.freshdesk.com/support/solutions/articles/37626-understanding-sla-policies>
408. <https://support.freshdesk.com/support/solutions/articles/50000000041-support-metrics-in-freshdesk-analytics>
409. <https://support.freshdesk.com/support/solutions/articles/50000001634-setting-sla-targets-for-every-response>
410. <https://support.freshdesk.com/support/solutions/articles/226849-how-are-the-resolution-sla-and-first-response-sla-percentage-metrics-calculated->
411. <https://support.freshdesk.com/support/solutions/articles/50000011779-dashboards-in-freshdesk>
412. <https://support.freshdesk.com/support/solutions/articles/50000009790-the-new-csat-module-how-to-set-up-send-out-and-collect-responses>
413. <https://support.freshdesk.com/support/solutions/articles/50000010308-introducing-new-curated-reports-for-better-insights>
414. <https://support.freshdesk.com/support/solutions/articles/234371-team-dashboards-setup-and-functionality>
415. <https://support.freshdesk.com/support/solutions/articles/50000001108-analytics-features-for-each-plan>

**docs.recurly.com** (9)

416. <https://docs.recurly.com/recurly-subscriptions/docs/monthly-recurring-revenue>
417. <https://docs.recurly.com/recurly-subscriptions/docs/subscriber-retention>
418. <https://docs.recurly.com/docs/account-updater>
419. <https://docs.recurly.com/recurly-subscriptions/docs/renewal-invoices>
420. <https://docs.recurly.com/recurly-subscriptions/docs/hosted-account-management>
421. <https://docs.recurly.com/recurly-subscriptions/docs/retry-logic>
422. <https://docs.recurly.com/docs/dunning-management>
423. <https://docs.recurly.com/recurly-subscriptions/docs/recovered-revenue>
424. <https://docs.recurly.com/docs/dunning-effectiveness>

**monday.com** (9)

425. <https://monday.com/crm/pricing>
426. <https://monday.com/pricing>
427. <https://monday.com/crm/whatsnew>
428. <https://monday.com/features/forms>
429. <https://monday.com/w/sidekick>
430. <https://monday.com/crm/features>
431. <https://monday.com/crm/ai-agents>
432. <https://monday.com/w/ai-trust-center>
433. <https://monday.com/w/ai>

**paddle.com** (9)

434. <https://www.paddle.com/help/profitwell-metrics/measure/subscription-metrics/mrr>
435. <https://www.paddle.com/help/profitwell-metrics/measure/subscription-metrics/refunds>
436. <https://www.paddle.com/help/profitwell-metrics/measure/subscription-retention/churn>
437. <https://www.paddle.com/help/profitwell-metrics/measure/subscription-retention/reactivations>
438. <https://www.paddle.com/help/profitwell-metrics/analyse/subscription-metrics/life-time-value>
439. <https://www.paddle.com/help/profitwell-metrics/analyse/subscription-metrics/understanding-your-mrr-cohorts-report>
440. <https://www.paddle.com/help/profitwell-metrics/retain/how-it-works/retain-payment-recovery-how-it-works-retry-cadence>
441. <https://www.paddle.com/help/profitwell-metrics/export-data/pulse-notifications>
442. <https://www.paddle.com/help/profitwell-metrics/export-data/hubspot/hub-spot-api-fields>

**learn.g2.com** (8)

443. <https://learn.g2.com/best-customer-success-software>
444. <https://learn.g2.com/best-sales-analytics-software>
445. <https://learn.g2.com/best-revenue-operations-software>
446. <https://learn.g2.com/best-subscription-management-software>
447. <https://learn.g2.com/best-help-desk-software>
448. <https://learn.g2.com/best-customer-self-service-software>
449. <https://learn.g2.com/best-sales-engagement-software>
450. <https://learn.g2.com/best-cpq-software>

**zoho.com** (8)

451. <https://www.zoho.com/crm/comparison.html>
452. <https://www.zoho.com/us/billing/help/reports/mrr-arr.html>
453. <https://www.zoho.com/us/billing/help/reports/retention-reports.html>
454. <https://www.zoho.com/us/billing/help/settings/customer-portal/customer-portal-functions.html>
455. <https://www.zoho.com/us/billing/help/settings/subscriptions/dunning-management.html>
456. <https://www.zoho.com/us/billing/help/settings/preferences/revenue-recognition.html>
457. <https://www.zoho.com/crm/zia/generative-ai.html>
458. <https://www.zoho.com/crm/zia/ai-for-emails.html>

**docs.helpscout.com** (7)

459. <https://docs.helpscout.com/article/380-email>
460. <https://docs.helpscout.com/article/1751-create-and-manage-service-level-agreements-slas>
461. <https://docs.helpscout.com/article/1761-reports-slas>
462. <https://docs.helpscout.com/article/383-reports-happiness>
463. <https://docs.helpscout.com/article/381-all-channels>
464. <https://docs.helpscout.com/article/385-reports>
465. <https://docs.helpscout.com/article/1746-ai-resolutions-pricing>

**chargebee.com** (6)

466. <https://www.chargebee.com/docs/billing/2.0/reports-and-analytics/monthly-recurring-revenue>
467. <https://www.chargebee.com/docs/billing/2.0/reports-and-analytics/revenuestory-faq>
468. <https://www.chargebee.com/docs/billing/2.0/reports-and-analytics/chargebee-analytics>
469. <https://www.chargebee.com/docs/2.0/self-serve-portal.html>
470. <https://www.chargebee.com/docs/2.0/dunning-v2.html>
471. <https://www.chargebee.com/revenue-recognition-software/>

**support.geckoboard.com** (6)

472. <https://support.geckoboard.com/en/articles/6055740-send-dashboard-snapshots-via-email>
473. <https://support.geckoboard.com/en/articles/8677060-get-alerts-in-microsoft-teams-or-slack-when-important-changes-happen-to-metrics>
474. <https://support.geckoboard.com/en/articles/6055746-use-send-to-screen-to-display-your-dashboards>
475. <https://support.geckoboard.com/en/articles/6055739-share-a-dashboard-with-share-links>
476. <https://support.geckoboard.com/en/articles/6055763-use-loops-to-cycle-multiple-dashboards-on-a-single-screen>
477. <https://support.geckoboard.com/en/articles/6055564-refresh-rates-for-data-sources-and-widgets>

**support.monday.com** (5)

478. <https://support.monday.com/hc/en-us/articles/360013348719-Sales-pipeline-management-with-monday-CRM>
479. <https://support.monday.com/hc/en-us/articles/8805401342482-The-Funnel-Chart>
480. <https://support.monday.com/hc/en-us/articles/28180465521682-The-Deal-Insights-Widget>
481. <https://support.monday.com/hc/en-us/articles/10100407939090-The-Leaderboard-Widget>
482. <https://support.monday.com/hc/en-us/articles/35252007254930-The-Forecasting-View>

**chartmogul.com** (4)

483. <https://chartmogul.com/blog/new-choose-when-to-recognise-churn-in-your-chartmogul-data/>
484. <https://chartmogul.com/blog/net-and-gross-retention-rates>
485. <https://chartmogul.com/saas-metrics/revenue-churn/>
486. <https://chartmogul.com/blog/sync-saas-metrics-to-hubspot-companies/>

**g2.com** (4)

487. <https://www.g2.com/categories/subscription-analytics?page=3>
488. <https://www.g2.com/categories/subscription-billing>
489. <https://g2.com/categories/lead-scoring>
490. <https://www.g2.com/categories/conversation-intelligence/sem>

**gong.io** (4)

491. <https://www.gong.io/platform/revenue-graph>
492. <https://www.gong.io/platform/trust>
493. <https://www.gong.io/platform/revenue-ai>
494. <https://www.gong.io/platform/ai-agents-for-revenue-teams>

**help.front.com** (3)

495. <https://help.front.com/en/articles/2294>
496. <https://help.front.com/en/articles/3038464>
497. <https://help.front.com/en/articles/2148>

**outreach.ai** (3)

498. <https://www.outreach.ai/resources/blog/sales-pipeline-management-best-practices>
499. <https://www.outreach.ai/resources/blog/sales-win-rate>
500. <https://www.outreach.ai/resources/blog/how-to-boost-sales-forecast-accuracy-using-ai>

**resources.docs.salesforce.com** (3)

501. <https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/forecasts.pdf>
502. <https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/salesforce_entitlements_implementation_guide.pdf>
503. <https://resources.docs.salesforce.com/latest/latest/en-us/sfdc/pdf/omnichannel_supervisor.pdf>

**salesloft.com** (3)

504. <https://www.salesloft.com/resources/guides/revenue-benchmark-report-us>
505. <https://www.salesloft.com/company/newsroom/revenue-operations-leader-showcases-future-of-forecasting>
506. <https://www.salesloft.com/platform/sales-forecasting-software>

**zendesk.com** (3)

507. <https://www.zendesk.com/pricing/>
508. <https://www.zendesk.com/in/blog/customer-service/help-desk/top-10-help-desk-metrics/>
509. <https://www.zendesk.com/in/service/ai/copilot/>

**benchmarkit.ai** (2)

510. <https://www.benchmarkit.ai/2025benchmarks>
511. <https://www.benchmarkit.ai/2026-saas-ai-native-metrics>

**blog.hubspot.com** (2)

512. <https://blog.hubspot.com/sales/sales-velocity>
513. <https://blog.hubspot.com/sales/hubspot-sales-strategy-report>

**fin.ai** (2)

514. <https://fin.ai/pricing>
515. <https://fin.ai/trust-reliability>

**forentrepreneurs.com** (2)

516. <https://www.forentrepreneurs.com/saas-metrics-2-definitions/>
517. <https://www.forentrepreneurs.com/saas-metrics-2/>

**freshworks.com** (2)

518. <https://www.freshworks.com/crm/pricing/>
519. <https://www.freshworks.com/crm/freddy-ai/>

**support.stripe.com** (2)

520. <https://support.stripe.com/questions/understanding-monthly-recurring-revenue-(mrr)>
521. <https://support.stripe.com/questions/understanding-monthly-recurring-revenue-(mrr)-and-annual-recurring-revenue-(arr)>

**baremetrics.com** (1)

522. <https://baremetrics.com/features/recover>

**bvp.com** (1)

523. <https://www.bvp.com/atlas/scaling-to-100-million>

**capterra.com** (1)

524. <https://www.capterra.com/help-desk-software/>

**captivateiq.com** (1)

525. <https://www.captivateiq.com/blog/sales-forecasting-software>

**churnzero.com** (1)

526. <https://churnzero.com/features/customer-health-scores/>

**close.com** (1)

527. <https://www.close.com/pricing>

**coefficient.io** (1)

528. <https://coefficient.io/use-cases/track-deals-skip-stages-hubspot-funnel-reporting>

**communities.gainsight.com** (1)

529. <https://communities.gainsight.com/customer-success-cs-15/health-score-calculation-7745>

**community.hubspot.com** (1)

530. <https://community.hubspot.com/t5/Dashboards-Reporting/Deal-funnel-with-all-stages-can-t-see-conversion-rate-between/td-p/755493>

**copper.com** (1)

531. <https://www.copper.com/pricing>

**cxtrends.zendesk.com** (1)

532. <https://cxtrends.zendesk.com/>

**dev.chartmogul.com** (1)

533. <https://dev.chartmogul.com/docs/how-mrr-is-calculated-from-prorated-invoices>

**developer.close.com** (1)

534. <https://developer.close.com/api/resources/reporting/get-funnel-stages.md>

**developers.pipedrive.com** (1)

535. <https://developers.pipedrive.com/docs/api/v1/Products>

**forrester.com** (1)

536. <https://www.forrester.com/blogs/from-crm-to-the-agentic-enterprise-salesforces-biggest-dreamforce-2026-reveals/>

**futurumgroup.com** (1)

537. <https://futurumgroup.com/insights/will-zendesks-resolutions-driven-strategy-resonate-with-customers>

**legal.hubspot.com** (1)

538. <https://legal.hubspot.com/hubspot-product-and-services-catalog>

**microsoft.com** (1)

539. <https://www.microsoft.com/en-us/dynamics-365/blog/business-leader/2026/08/11/microsoft-named-a-leader-in-the-2026-gartner-magic-quadrant-for-crm-sales-platforms-for-the-sixteenth-consecutive-year/>

**pages.clari.com** (1)

540. <https://pages.clari.com/rs/866-BBG-005/images/fof_final_ds_product_forecasting.pdf>

**pipedrive.com** (1)

541. <https://www.pipedrive.com/en/features/ai-sales-assistant>

**revopscoop.com** (1)

542. <https://www.revopscoop.com/reports/the-2025-state-of-revops-survey>

**saas-capital.com** (1)

543. <https://www.saas-capital.com/research/saas-retention-benchmarks-for-private-b2b-companies/>

**salesforceben.com** (1)

544. <https://www.salesforceben.com/salesforce-campaign-influence/>

**softwareadvice.com** (1)

545. <https://www.softwareadvice.com/crm/>

**support.gainsight.com** (1)

546. <https://support.gainsight.com/gainsight_nxt/05Scorecards/02Admin_Guides/Configure_Scorecards>

**trust.hubspot.com** (1)

547. <https://trust.hubspot.com/ai>
