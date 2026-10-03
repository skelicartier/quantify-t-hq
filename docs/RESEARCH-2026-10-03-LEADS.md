# Leads at scale, cold outbound and the company console — research, 3 October 2026

Three reports, written the same day by three researchers working from the web, each told
what HQ already had and asked for the gaps. They are kept whole, with every source they
cite, because the build decisions in `docs/PLAN.md` point back at them.

- **Report A — large lead databases and segmentation.** How thirteen lead and prospecting
  tools hold tens of thousands of leads: the data model, import at scale, segments, fit,
  mailing a segment, hygiene, the table itself. Ends with 26 ranked gaps, measured against
  the prospects build as it stood that day.
- **Report B — cold outbound and deliverability.** What it takes to write to about 23,000
  published business addresses without wrecking the sending domain or breaking the law:
  authentication, warm-up, verification, sending policy, replies, the rules country by
  country, what good looks like, and which providers allow cold mail at all. Ends with 28
  ranked items. Its headline: the transactional provider's own policy forbids this list,
  so cold mail goes from ordinary mailboxes on separate domains, slowly.
- **Report C — the company console.** What the best small-company tools do across lead
  management, sales engagement, analytics, the operating cadence, data quality,
  notifications, integrations and the phone. Ends with 35 ranked items and 17 things not
  worth building at this size.

What was built from them, and what is next in what order, is in `docs/PLAN.md` (the
"Prospects" waves). Section numbers below are each report's own.

---

## Large lead databases and segmentation — what the best tools do, 3 October 2026 (report A)

Why this report exists. The team has assembled about 23,000 published prospect emails
in one CSV (columns: email, first_name, last_name, full_name, title, company, firm_type,
website, country, city, phone, registration_no, source, source_url, email_kind
(named / role / personal-domain), notes). The ask is to import them into HQ, have them
organise themselves into segments, and mail a chosen segment directly. This report
records how thirteen lead-management and prospecting tools handle a database of that
size, so the HQ build can be held to the same standard.

Method. 48 web searches (the session's search allowance then ran out) and about 135 page
fetches, of which roughly 100 returned content, on 3 October 2026. Tools covered:
Apollo.io, Clay, HubSpot, Attio, Folk, Close, Pipedrive, Salesforce, Zoho CRM, Breakcold,
Smartlead, Instantly and Customer.io. The vendor's own help centre or developer docs is
the source wherever one could be reached. Three limits on that:

- Apollo's help centre and Salesforce's developer docs refuse automated fetches. Points
  citing them rest on the search engine's extract of those pages and are worded as such.
- Customer.io has moved its docs; the URLs given are the ones that resolved on the day.
- Where only a third-party page was reachable the point is marked "(third-party)".

Quoted phrases are as returned by a fetch of the cited page, or by the search engine's
extract where the point says so. Nothing behind a login was used.

Effort scale used throughout: S ≤ 2 days, M ≤ 1–2 weeks, L more.

---

### 0. Where HQ stands today

The gaps in this report are measured against what is already there, read from
`docs/PLAN.md` and from the service's working tree on 3 October (the prospects module,
`account_api/hq/prospects.py` and `prospect_routes.py`, is uncommitted work in progress,
so this is a snapshot).

- **Model.** A prospect is a lead with `origin = "prospect"` (the other origin is
  `inbound`). Stages: new, attempting, connected, qualified, disqualified. Qualifying is
  done by converting; disqualifying needs a reason. The table's ceiling is 100,000 leads.
- **Import.** The portal reads and maps the file and sends it in parts of 1,000 rows.
  Every row comes back as created, updated, unchanged or skipped with a reason
  (NO_EMAIL, INVALID_EMAIL, DUPLICATE_IN_FILE, ALREADY_A_PERSON, STOPPED, FULL). The key is
  the normalised email. A re-import fills blanks only and never overwrites. Up to 20 extra
  columns are kept and reach templates as `{{custom.<key>}}`. Each import is a record, and
  can be taken back: only rows still new, unowned, never worked and never mailed are
  removed, with a reason, audited first.
- **Kind of address.** named / role / personal-domain, taken from the file or worked out
  from the address (a list of role words and the free-mail domains).
- **Fit.** Points from rules in settings (firm type, kind of address, words in the title,
  country, a named person), summed into bands A (≥ 60), B (≥ 35), C. Computed on read,
  never stored, and the reasons travel with it ("PMS +30").
- **Filters and segments.** One grammar for the Leads list, saved segments and
  suggestions: 19 fields (including region, fit band, tags, verified, days since received,
  days since last email), eight comparisons (is, is not, contains, is any of, more than,
  less than, is empty, is set), at most eight conditions, all of which must hold. A
  campaign's audience is resolved once, when it is scheduled, so the recipients are a
  fact and not a query.
- **Suggestions.** The service already proposes segments from the data: best-fit named
  people (all, India, outside India), each firm type, region and country with at least 20
  leads, shared mailboxes "send last", and best fit never emailed.
- **Bulk.** One change (owner, stage, tags, verified state) to chosen rows (up to 5,000)
  or to everything a filter matches (up to 25,000), in the request, audited.
- **List.** The leads list is filtered, ordered and paged on the server (pages up to
  500), with facet counts. The portal's older list module (`src/lib/lists/filters.ts`)
  still assumes "the lists are read whole (no paging)".
- **Mail.** Campaigns to a segment, a list, chosen records or a CSV; a blocking
  checklist; a test of the pinned version; second-person approval at 50 or more;
  dry run; seed inboxes; caps by sender and hour; three emails a day per firm domain and
  one first email per firm per 24 hours; a per-sender breaker at three hard bounces a
  day; auto-pause on bounces and complaints; a stop list by address; consent tiers;
  do-not-contact; reply outcomes that move a lead to connected or disqualify it.
- **Deliberately not built** (earlier research): round-robin routing, health scores, AI
  deal scores, saved views that carry a column set.

On the portal side the client for these calls exists (`src/lib/api/crm.ts`), but the
Leads page did not yet show the import, take-back, suggestion or facet screens when this
was read. Sections 3 and 8 are written with that screen in mind.

---

### 1. Lead, contact and company: the data model

There are two schools, and the choice shapes everything else.

**School A — a separate "lead" record that is later converted.**

- Salesforce. A Lead is its own object. Converting it creates an Account, a Contact and
  optionally an Opportunity. "The Lead record itself doesn't disappear - it's marked
  `IsConverted = true` and becomes read-only", and unmapped custom fields stay behind on
  the lead (third-party: https://prospeo.io/s/lead-conversion-salesforce). The status
  list is itself a table whose values carry an `IsConverted` flag, so "which statuses
  count as converted" is data (search extract of
  https://developer.salesforce.com/docs/atlas.en-us.object_reference.meta/api/sforce_api_objects_leadstatus.htm).
  A new org starts with "Open - Not Contacted", "Working - Contacted", "Closed - Not
  Converted" and a converted status (third-party excerpt of _Salesforce for Beginners_:
  https://m.bookac.qq.com/read/1036698108/63). Campaign membership is a separate record
  with its own status list, and the marketer marks which values count as "Responded"
  (search extract of
  https://developer.salesforce.com/docs/atlas.en-us.api.meta/api/sforce_api_objects_campaignmember.htm).
- Zoho CRM. Converting a lead creates a Contact, an Account ("if the Company Name detail
  is available for the lead") and optionally a Deal. "A lead cannot be reverted once
  converted." Custom fields survive only through Lead Conversion Mapping, and "Field
  mapping will not be carried out when records are converted in bulk (Mass Convert)"
  (https://help.zoho.com/portal/kb/articles/convert-leads).
- Pipedrive. Leads live in a separate Leads Inbox because "it's common to have potential
  opportunities that aren't ready to move through your pipeline yet". A lead must be
  linked to a person or an organisation; "all other fields are optional". Converting
  makes a deal and "the lead will then be deleted from your Lead Inbox"
  (https://support.pipedrive.com/en/article/leads-inbox).
- HubSpot. A Lead is a record attached to a contact or company, with its own stages: New,
  Attempting, Connected, Qualified, Disqualified. "Removing the primary object associated
  with the lead ... will delete the existing lead"
  (https://knowledge.hubspot.com/records/view-a-lead-record).

**School B — people and firms always exist; "lead" is a status on them.**

- Close. A Lead "represent[s] a company or organization and can contain contacts, tasks,
  opportunities, and activities"; those objects "must be children of a Lead". Close says
  its Lead is like "both a 'lead' and 'account'" elsewhere
  (https://developer.close.com/api/resources/leads). Statuses are a custom list; Close's
  outbound example is "Potential, Interested, Qualified, Customer, Not Interested, Bad
  Fit" (https://help.close.com/feature-guide/leads/lead-statuses).
- Attio. Objects (People, Companies, Deals) hold records. A List "represent[s] workflows
  or projects"; a list entry is "an instance of a record within a list, with values for
  list-specific attributes" (https://attio.com/help/getting-started/glossary).
- Apollo. Contacts and Accounts each carry a stage. Default contact stages: Cold,
  Approaching (at least one message sent), Replied, Interested, Not Interested,
  Unresponsive, Do Not Contact. Default account stages: Cold, Current Client, Active
  Opportunity (search extract of https://knowledge.apollo.io/hc/en-us/articles/4410623601165).
- Folk and Breakcold. Contacts plus companies, organised into groups (Folk:
  https://help.folk.app/en/articles/6804416-data-enrichment) or lists (Breakcold). In
  Breakcold pipeline status is separate from list membership
  (https://developer.breakcold.com/help/contacts-lists).
- Customer.io. A person profile with attributes and events. Identifiers are `id`, `email`
  or `phone`; reserved attributes are "`id`, `email`, `phone`, `created_at`, and
  `unsubscribed`" (https://docs.customer.io/messaging/people/uploading-people/).
- Smartlead and Instantly. A "lead" is a campaign row: email, name, company, location and
  custom fields. Smartlead's statuses: NOT_CONTACTED, IN_PROGRESS, COMPLETED, INTERESTED,
  NOT_INTERESTED, DO_NOT_CONTACT, BOUNCED, UNSUBSCRIBED
  (https://api.smartlead.ai/guides/lead-management).

**Standard keys.**

- HubSpot looks "for a matching value in the Email property" for contacts and at "the
  Company domain name property" for companies
  (https://knowledge.hubspot.com/records/deduplication-of-records).
- Attio: "Email addresses (unique and used for data enrichment)" for people, "Domains
  (unique and used for data enrichment)" for companies
  (https://attio.com/help/reference/imports-and-exports/import-data-into-attio).
- Pipedrive keeps a "marketing status" apart from any sales status: No consent (the
  default), Subscribed, Unsubscribed, Bounced, Archived
  (https://support.pipedrive.com/en/article/campaigns-marketing-contacts).

**HQ today.** Prospects are leads with their own origin, in HubSpot's five stages, kept
apart from CRM people. An address that is already a CRM person is refused at import.
That is the Pipedrive pattern (a pool outside the pipeline) with HubSpot's vocabulary.

**Gap.** A prospect's firm is a typed name. Every tool above keys the firm by domain.
And conversion is where Zoho and Salesforce lose fields, so it is worth one test that a
converted prospect carries every column, including the custom ones.

---

### 2. Bulk import at scale (10k–100k rows)

**Published limits.**

- HubSpot: .csv, .xlsx or .xls; paid accounts up to 512 MB and "1,048,576 rows per
  file", 10,000,000 rows a day, 500 imports a day, three at once; free accounts 20 MB
  and 500,000 rows a day (https://knowledge.hubspot.com/import-and-export/set-up-your-import-file).
- Attio: CSV only, 100,000 rows, 100 columns, 100 MB
  (https://attio.com/help/reference/imports-and-exports/import-data-into-attio).
- Customer.io: "not exceed 100 MB in size" and "not contain more than 100 columns"; one
  column must map to an identifier (https://docs.customer.io/messaging/people/uploading-people/).
- Zoho CRM: CSV rows per file "Standard - 10,000; Professional - 20,000; Enterprise -
  30,000; Ultimate - 50,000"; 5,000 per batch for XLS, XLSX and VCF; and "Once the Import
  process begins, you cannot cancel it"
  (https://help.zoho.com/portal/en/kb/crm-nextgen/data-administration/import-data/articles/nextgen-import-data).
- Salesforce: "the Data Import Wizard can only insert up to 50,000 records" (third-party:
  https://www.salesforceben.com/salesforce-data-import-wizard-vs-data-loader/); Data
  Loader for up to 5,000,000 (search extract of
  https://developer.salesforce.com/docs/atlas.en-us.244.0.dataLoader.meta/dataLoader/when_to_use_the_data_loader.htm).
- Apollo: "Apollo recommends under 10,000" rows a file; "Larger files work but slow down
  processing and increase the chance of timeout errors"; weekly caps scale with spend
  (third-party: https://prospeo.io/s/csv-import-outreach).
- Smartlead API: "up to 400 leads per request"
  (https://api.smartlead.ai/guides/lead-management).
- Clay: a 50,000-row ceiling per table, and at the ceiling the import stops with no
  error shown (community support thread, read through the search extract because the page
  is script-rendered:
  https://community.clay.com/x/support/6kbwba9o2dhq/issues-with-uploading-large-datasets-to-clay-need).
  The silent stop is the thing to avoid.

**Column mapping.**

- Attio "will auto-map columns where possible" and lets you "+ Create new attribute"
  during mapping; a comma imports several values into one attribute; a preview step comes
  before the run (https://attio.com/help/reference/imports-and-exports/import-data-into-attio).
- Customer.io maps headers to attributes, asks "whether to update existing people or
  not", and can "(Optional) Add people to a new or existing manual segment" in the same
  step (https://docs.customer.io/messaging/people/uploading-people/).
- HubSpot flags mapping problems with an alert icon and an "[x] errors" link before the
  import runs (https://knowledge.hubspot.com/import-and-export/understand-the-import-tool).
- Breakcold imports CSV or Excel into a list, creating companies and matching existing
  ones as it goes (https://developer.breakcold.com/help/contacts-lists).

**Deduplication rules.**

- HubSpot: email for contacts, domain for companies. "If multiple records already exist
  with the same email address as a contact you're importing, you'll receive an import
  error and that contact won't be imported"
  (https://knowledge.hubspot.com/records/deduplication-of-records).
- Attio: email and domain; without one mapped "you might end up with duplicate records"
  (https://attio.com/help/reference/imports-exports/troubleshooting-csv-imports). A
  consultancy reports the match is exact: "ACME LTD and Acme Ltd. are two different
  companies to it. Jon@x.com and jon@x.com are two different people", and "A trailing
  space is a new record" (third-party: https://www.craftt.io/blog/attio-import-deduper-agent).
- Pipedrive: a person matches on any of "Person - Organization", "Person - Phone" or
  "Person - Email", and Pipedrive will "merge them together and add any new data included
  in the import"; organisations match on address; merging can be bypassed
  (https://support.pipedrive.com/en/article/how-to-avoid-duplicates-during-an-import).
- Close: you "choose the field(s) to compare"; "If an existing lead matches any of the
  selected fields, it will be considered a match"; rows sharing an identifier can be
  grouped into one lead ("Group Related Rows")
  (https://help.close.com/getting-started/import-data-into-close/avoiding-lead-duplicates).
- Folk: auto-merge on an exact match of "first name + last name + email, OR first name +
  last name + phone number OR first name + last name + social platforms URL"; near
  matches go to a "Duplicates" view with "merge all"
  (https://help.folk.app/en/articles/5007403-clean-manage-duplicates).
- Zoho: unique fields per module (Email for Leads and Contacts), or the Record ID
  (https://help.zoho.com/portal/en/kb/crm-v2/faqs/data-administration/import/articles/crm-v2-exist-faqs-import).
- Instantly: email only. A file-level check "cannot be disabled"; a second check "across
  all Campaigns or Lists" is on by default; existing leads are skipped, never updated
  (https://help.instantly.ai/en/articles/7891047-duplicate-lead-detection).
- Smartlead: "Duplicate emails are always skipped" inside a campaign; across campaigns it
  is a setting (https://api.smartlead.ai/guides/lead-management).
- Apollo: first name, last name, company, email and profile URL (third-party:
  https://prospeo.io/s/csv-import-outreach; Apollo's own article:
  https://knowledge.apollo.io/hc/en-us/articles/4409161532045).

**What happens on re-import.**

- HubSpot: "the imported information will update the existing contact rather than create
  a new one" (https://knowledge.hubspot.com/records/deduplication-of-records).
- Close: "Only add missing information" or "Replace Lead information in Close"; unmatched
  rows either "Create a new Lead" or "Skip the Lead"
  (https://help.close.com/getting-started/import-data-into-close/updating-existing-leads-and-contacts).
- Zoho: skip, overwrite or clone; "Only the mapped fields will be overwritten"
  (https://help.zoho.com/portal/en/kb/crm-v2/faqs/data-administration/import/articles/crm-v2-exist-faqs-import).
- Attio: importing into a list asks "Add again" or "Update existing"; multi-value
  attributes are appended, not replaced
  (https://attio.com/help/reference/imports-and-exports/import-data-into-attio).
- Breakcold "merge[s] the data with the existing contact record"
  (https://developer.breakcold.com/help/contacts-lists).
- Customer.io manual segments: "If a person's identifier in the CSV doesn't match an
  existing person, we won't create a new person and we won't add them to the segment"
  (https://docs.customer.io/messaging/segmentation/manual-segments/).

**History, errors and undo.**

- HubSpot's imports dashboard shows new records, updated records and errors per import,
  an error file, and the original file for six months. Records created by an import can
  be opened as a list and deleted. But "if you updated existing records via an import,
  you will not be able to reverse the changes by deleting"
  (https://knowledge.hubspot.com/import-and-export/view-and-analyze-previous-imports).
  Segments can filter on "is in import"
  (https://knowledge.hubspot.com/segments/determine-filter-criteria).
- Zoho has Import History with "Undo This Import", open for a month: "30 days after the
  import, the import action will be automatically confirmed. You cannot undo the import
  once it is confirmed"
  (https://help.zoho.com/portal/en/kb/crm-v2/faqs/data-administration/import/articles/crm-v2-exist-faqs-import).
- Attio shows a tick or an error icon per record and keeps an "Import history page in
  Settings"; its clean-up advice is to filter on "Created at" and bulk delete
  (https://attio.com/help/reference/imports-and-exports/import-data-into-attio;
  https://attio.com/help/reference/imports-exports/troubleshooting-csv-imports).
- Close documents a "Reverting Import" path
  (https://help.close.com/getting-started/import-data-into-close/updating-existing-leads-and-contacts).
- Instantly shows a banner per reason: "X email(s) already exist!", "X missing or invalid
  email(s)"; blocklisted addresses and domains are "automatically skipped during upload"
  (https://help.instantly.ai/en/articles/13644475-why-are-leads-not-uploading).

**HQ today.** Parts of 1,000, every row accounted for, fill-blanks-only on re-import, an
import record and a take-back limited to untouched rows. That matches Close's "only add
missing information" and is stricter than HubSpot's delete.

**Gaps.** No dry run (Attio previews before writing). Skipped rows are reported up to
200 per part and not kept as one downloadable file (HubSpot's error file). No way to
overwrite a chosen column on re-import (Close and Zoho offer it). No "in import X" filter
field (HubSpot).

---

### 3. Segmentation

**Two kinds of segment, and every tool has both.**

- HubSpot: active segments update themselves — records "will join the segment when they
  meet the criteria and leave the segment when they no longer meet the criteria"; "Static
  segments do not update automatically". Segments feed marketing email, workflows, ad
  audiences and reports (https://knowledge.hubspot.com/segments/segments-overview).
- Customer.io: data-driven segments where "People enter and exit ... automatically when
  they match and stop matching the conditions that you set"; manual segments filled by
  CSV, a workflow action or the API (https://docs.customer.io/journeys/segmentation/segments/;
  https://docs.customer.io/messaging/segmentation/manual-segments/).
- Breakcold: static lists and dynamic lists that "update based on rules or filters you
  define"; a lead can be in several lists
  (https://developer.breakcold.com/help/contacts-lists).
- Attio splits it differently. Views are the dynamic part: "Each view can have its own
  filters and sorting" (https://attio.com/help/getting-started/glossary). Lists are
  curated: records are added by hand, by "Add to List" from a selection, or by CSV; they
  do not fill themselves (https://attio.com/help/reference/managing-your-data/lists/create-lists).
- Close: a Smart View is a saved search whose "search queries ... dynamically impact
  which Leads appear" (https://help.close.com/feature-guide/lead-filtering-and-smart-views).
- Pipedrive: filters are dynamic and saveable, and choose Campaign recipients
  (https://support.pipedrive.com/en/article/filtering;
  https://support.pipedrive.com/en/article/campaigns-filtering).
- Smartlead and Instantly: lead lists are static containers attached to a campaign
  (https://help.instantly.ai/en/articles/7891047-duplicate-lead-detection).

**Rule operators.** HubSpot publishes the fullest list; the others are subsets.

- HubSpot text: contains any of / all of / exactly, doesn't contain, starts with any of,
  ends with any of, is equal to (any of), is not equal to (any of), is known, is unknown,
  and historical forms such as "has (never) been equal to". Numbers: greater or less than,
  compared with another property; "0 is a known value". Dates: is (a relative date such
  as Today or Last week), before, after, between, "is more than" N days ago or from now.
  Choices: is any of, is none of. Activities: has or has not completed, narrowed by date
  and by "Number of completions". Membership: is (not) member of segment, is (not) in
  import. Updates: "(not) updated in last" N days
  (https://knowledge.hubspot.com/segments/determine-filter-criteria).
- Attio: is, is not, contains, not contains, was (a stage within a date range), before,
  after; and filters on a linked record, such as people whose Company > Categories is
  SaaS (https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views).
- Close: "Using `is not` will return Leads that do not have that particular condition";
  text matches "contains exact words", "contains phrase", "words begin with"; dates
  "down to the past few hours or minutes"; a "Me" filter for each user's own records
  (https://help.close.com/feature-guide/lead-filtering-and-smart-views/lead-filtering-tips).
- Customer.io: attributes, events and segment membership, including NOT IN. One trap
  worth knowing: for "within the past X days" a person must have existed in Customer.io
  for that long, where age is "The date-time when you added the person" or "the earliest
  event" (https://docs.customer.io/journeys/segmentation/past-x-days-help/).
- Pipedrive Campaigns adds engagement fields: campaign opens, clicks, send date,
  delivered date, clicked link URL, bounce type, unsubscribed date
  (https://support.pipedrive.com/en/article/campaigns-filtering).

**AND/OR.**

- HubSpot: "All filters included within the same filter group follow AND logic by
  default"; "OR logic is followed between separate filter groups by default"
  (https://knowledge.hubspot.com/segments/determine-filter-criteria).
- Pipedrive: one ALL block and one ANY block — every ALL condition and "at least one" of
  the ANY conditions. "The maximum number of filter conditions is 16", and fewer are
  advised on large data (https://support.pipedrive.com/en/article/filtering).
- Close: "All of" and "Any of", with "Wrap in a group" for a sub-section
  (https://help.close.com/feature-guide/lead-filtering-and-smart-views/lead-filtering-tips).
- Attio: groups with And/Or, nested through "Convert to advanced condition" then "Convert
  to group" (https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views).
- Customer.io: "combine and nest a few conditions with a couple of AND and OR operators"
  (https://docs.customer.io/messaging/segmentation/creating-segments/).

**Limits that show scale assumptions.**

- HubSpot: "up to 250 filters per segment, including up to 60 associated object filters"
  (https://knowledge.hubspot.com/segments/segments-overview). By tier: Free "10 active
  lists and 1,000 static lists", Starter 50 and 1,000, Professional 1,200 and 1,200,
  Enterprise 2,000 and 2,000 (third-party: https://www.bluleadz.com/blog/hubspot-lists-guide).
- Pipedrive: 16 conditions a filter, "5000 filters per user"
  (https://support.pipedrive.com/en/article/filtering).
- Customer.io archives unused segments automatically and warns it can take days once a
  workspace has more than 1,000 of them
  (https://docs.customer.io/journeys/segmentation/segments/).

**Size preview and membership history.**

- Customer.io: "Once you save this segment, we'll process it, and you'll be able to see
  exactly how many people belong to it"
  (https://docs.customer.io/messaging/segmentation/creating-segments/). The People tab
  shows "a count of segment membership over time", and membership changes export as CSV
  (https://docs.customer.io/journeys/segmentation/segments/). A send shows an estimated
  recipient count with "View list"
  (https://docs.customer.io/messaging/send/broadcasts/one-time-sends/).
- HubSpot's "has ever been" operators let a segment ask about past values
  (https://knowledge.hubspot.com/segments/determine-filter-criteria).

**Segments suggested from the data.** No vendor page read for this report documents
segments created from the shape of an imported file. The nearest things:

- HubSpot turns a typed sentence into filters: a "Generate segment filters with AI" box,
  or "Start with AI" with a prompt such as "Create a segment of contacts who viewed a
  pricing page in the last 30 days" (https://knowledge.hubspot.com/segments/segments-overview).
- HubSpot's AI Lookalike Lists build "lists of similar prospects" from best customers,
  "Live now for Marketing Hub Enterprise users" (third-party:
  https://coefficient.io/saas-ai-tools/hubspot-ai-features).
- Apollo shows saved contacts grouped by stage (search extract of
  https://knowledge.apollo.io/hc/en-us/articles/5995865049229-View-and-Edit-Account-Profiles).

**Saving and sharing a filter.**

- Close: "pin any Saved View to your left sidebar"; views are "kept private, shared with
  your entire organization, or specific team members"
  (https://help.close.com/feature-guide/lead-filtering-and-smart-views).
- Attio: "Save for everyone" or "Save as new view"
  (https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views).
- Pipedrive: private filters are "visible only to the person who created them. No other
  user, not even admins, can see them" (https://support.pipedrive.com/en/article/filtering).
- Customer.io: "A Segment can have many people and a person can belong to many segments"
  (https://docs.customer.io/journeys/segmentation/segments/).

**HQ today.** One grammar across the list, segments and suggestions; "is any of"; relative
dates through "days since received" and "days since last email"; audiences frozen at
scheduling. The service's suggestions already do what no vendor documents.

**Gaps.** All conditions must hold: there is no OR. There is no "is none of" or "does not
contain". There are no engagement or membership fields — was sent campaign X, replied,
bounced, clicked, in import X, in or not in segment X — which is how HubSpot, Close,
Pipedrive and Customer.io build the next audience from the last send. `registration_no`
and `website` are not filterable. There is no membership history.

---

### 4. Fit / ICP scoring

- HubSpot (Professional and Enterprise). Engagement scores, fit scores ("demographic
  information through property values, such as their age, job title, company size, or
  annual revenue") and combined scores. Points are "added to or subtracted from the
  score". Criteria sit in groups with a "group limit" under a "score limit". Decay, for
  engagement, "reduces an individual event's score based on how long ago a scored event
  occurred", at 1, 3, 6 or 12 months. Shown as a number plus High / Medium / Low, or
  A1–C3 for combined scores (https://knowledge.hubspot.com/properties/build-lead-scores).
  The AI version, which will "train the AI model and generate recommended criteria and
  points based on your account's contact data", needs Marketing Hub Enterprise
  (https://knowledge.hubspot.com/scoring/build-lead-scores-with-ai).
- Apollo. Rule models with criteria and weights, plus AI auto-scores. Each person or
  company gets a rating "based on their score as a percentage of the maximum possible
  score": Excellent, Good, Fair or Not a fit; the criteria behind a score are visible per
  lead; scores are a search filter (search extracts of
  https://knowledge.apollo.io/hc/en-us/articles/4988048582285 and
  https://knowledge.apollo.io/hc/en-us/articles/28436140554509).
- Salesforce. Account Engagement separates grade from score: "Unlike scores that are
  based on implicit factors, grades are based on explicit factors". Grades run "from an F
  to an A+"; "All prospects are assigned with a grade of D"; five default criteria
  (company size, industry, location, job title, department), each worth two-thirds of a
  letter
  (https://trailhead.salesforce.com/content/learn/modules/lead-scoring-and-grading-in-account-engagement/get-started-with-lead-grading).
  Einstein Lead Scoring is machine learning over the org's past conversions, scoring 1–99
  (search extract; Salesforce's own pages on it could not be fetched on the day).
- Zoho CRM. Rules "Add or Subtract" points on field criteria and on touchpoints (mail,
  calls, webinars, social). "up-to ten rules, out of which five of them can be active"
  per layout; six fields per rule. The record shows positive, negative, touchpoint and
  total scores separately. In Standard edition "criteria and scoring are available only
  for the Calls channel" (https://help.zoho.com/portal/kb/articles/set-scoring-rules).
- Clay. A formula column: "Number-Based Scoring" (points for size, role, revenue),
  "Grade-Based Scoring" (letter grades from rule combinations) or "Fit Criteria" (Yes or
  No) (https://www.university.clay.com/docs/lead-scoring-overview).
- No built-in score in the pages read: Attio, Close, Folk, Pipedrive, Breakcold,
  Instantly, Smartlead, Customer.io.
- Small-team advice from Salesforce itself: "hot, warm, or cold beats a complex 1-100
  scale for small teams" and "pick three to five signals to score on first"
  (https://www.salesforce.com/blog/ai-strategies-for-small-business-sales/). A
  practitioner thread says the same: "simple point weights and buckets you can explain to
  sales" (third-party:
  https://www.jeffbullas.com/thread/can-a-small-business-build-an-ai-lead-scoring-model-without-a-data-scientist).

**HQ today.** Rule points, three bands, reasons shown, computed on read. This is the
Apollo and Zoho shape, and it is the shape Salesforce's own small-business advice
recommends. It is fit only, which is right: there are no engagement events to score yet.

**Gaps.** Small ones. The rules do not use `registration_no` (a regulated firm) or the
verified state. The reasons should be one glance away in the table, as Apollo shows them.

---

### 5. Mailing a segment directly

**Audience → campaign.**

- Customer.io: "Filter for people IN or NOT IN segments and join conditions using AND or
  OR logic"; an estimated recipient count with "View list"
  (https://docs.customer.io/messaging/send/broadcasts/one-time-sends/). In the API, "This
  targets people in segment 42 while excluding anyone in segment 99"
  (https://docs.customer.io/messaging/send/broadcasts/api-triggered-data-format/).
- Close: build a Smart View, then bulk email it or enrol it in a Workflow
  (https://help.close.com/feature-guide/lead-filtering-and-smart-views/smart-views-for-bulk-email-and-worfklows).
- Pipedrive: recipients are chosen by filter, and "You will only be able to send out
  campaigns to users with subscribed marketing status"
  (https://support.pipedrive.com/en/article/campaigns-filtering).
- Apollo: add contacts to a sequence from a list (search extract of
  https://knowledge.apollo.io/hc/en-us/articles/4409396985741).

**Exclusions.**

- HubSpot's "Don't send to unengaged contacts" is on by default. Unengaged means "Has
  never engaged with a marketing email from you and hasn't engaged with the last 11
  emails", or "Previously engaged ... but hasn't engaged with the last 16"
  (https://knowledge.hubspot.com/marketing-email/what-is-graymail-and-how-can-i-avoid-sending-my-email-to-unengaged-contacts).
- Close: "exclude anyone who has already received this particular message or workflow",
  and start from a status filter. An unsubscribed contact "will not receive the email at
  all"; in a Workflow "any email steps will be skipped. The rest of the Workflow steps -
  calls, SMS, tasks - will run as expected"
  (https://help.close.com/feature-guide/lead-filtering-and-smart-views/smart-views-for-bulk-email-and-worfklows;
  https://help.close.com/feature-guide/emailing/managing-unsubscribe-requests).
- Apollo's API names each switch: `sequence_active_in_other_campaigns`,
  `sequence_finished_in_other_campaigns`, `sequence_same_company_in_same_campaign` ("even
  if other contacts from the same company are already in the sequence"),
  `sequence_unverified_email`, `sequence_no_email`, `sequence_job_change`
  (https://docs.apollo.io/reference/add-contacts-to-sequence).
- Instantly: the Global Blocklist takes whole domains and single addresses, "is checked
  both during the upload and across ongoing campaigns", and blocked leads "will not be
  contacted, even if they already exist in the campaign"
  (https://help.instantly.ai/en/articles/9214389-global-blocklist). After verification,
  "Invalid and Risky leads will not be contacted" unless "Allow risky emails" is switched
  on (https://help.instantly.ai/en/articles/9245059-verifying-leads).
- Smartlead: imports check the global block list and the unsubscribe list by default
  (https://api.smartlead.ai/guides/lead-management).

**Sampling, test sends and ramps.**

- Customer.io: an A/B test goes to a sample of 1–100%; "Results are most reliable when
  you have at least 500 recipients per variation"; up to eight variations. Rate limits
  are a fixed rate ("the maximum number of messages and the time period") or a Daily
  Ramp over up to 60 days (https://docs.customer.io/messaging/send/broadcasts/one-time-sends/).
- Close: "Set limit" caps the recipients; start with 200 leads to "test and optimize
  different approaches"
  (https://help.close.com/feature-guide/lead-filtering-and-smart-views/smart-views-for-bulk-email-and-worfklows).
- Instantly: recommended 30 campaign emails a day per sending account; the campaign limit
  is accounts × 30; "Campaign Slow Ramp" adds two a day
  (https://help.instantly.ai/en/articles/6248612-account-and-campaign-limits).

**Published caps elsewhere.**

- Zoho CRM mass email: "250 per day" (Standard), 500, 1,000, "2000 per day" (Ultimate),
  counted with autoresponders, schedulers and macros
  (https://help.zoho.com/portal/en/kb/articles/email-limits).
- Salesforce: "5,000 emails per organization per day" on a rolling 24 hours
  (third-party: https://massmailer.io/glossary/mass-email-limit-salesforce/).
- Gmail itself: a personal account "up to 500 emails per day"; Workspace "often up to
  2,000/day" (Folk's guide:
  https://www.folk.app/articles/gmail-limit-101-common-error-messages-and-daily-send-limits).

**What is shown after sending.**

- Instantly: at account level "Total sent, Open rate, Click rate, Reply rate, and
  Opportunities"; per campaign the same plus "Sequence started"; and "Step Analytics" per
  step and variant (https://help.instantly.ai/en/articles/6602310). Its own course says
  "We recommend actually not turning on open tracking", "A good reply rate is anywhere
  from two to ten percent", and "You want to keep your bounce rate under two percent"
  (https://instantly.ai/get-started-with-instantly/lesson-5). "Only positive custom labels
  count as opportunities" (https://help.instantly.ai/en/articles/8448897-custom-lead-labels).
- Pipedrive turns results back into audiences through its campaign filter fields
  (https://support.pipedrive.com/en/article/campaigns-filtering).

**HQ today.** Ahead of most of these on safety: frozen audiences, a blocking checklist,
second-person approval, per-firm and per-sender caps, a bounce breaker and a stop list.

**Gaps.** No way to send to the first N of a segment and hold the rest, and no ramp
(Close, Customer.io, Instantly). No "one person per firm" choice when the audience is
built — and with one first email per firm per day, a segment with eight people at one
firm drains over eight days without saying so. Results are per campaign, not broken down
by the facets the segment was built from.

---

### 6. List hygiene

**Verification — the vocabulary the sending tools borrow.**

- ZeroBounce returns `valid` ("a very low bounce rate of under 2%"), `invalid` ("Please
  delete them from your email list"), `catch-all` ("impossible to validate without
  sending a real email and waiting for a bounce" — "segment them into a catch-all group
  with the knowledge that some of your emails will bounce"), `unknown` ("an offline mail
  server or an anti-spam email system"), `spamtrap`, `abuse` and `do_not_mail`.
  Sub-statuses include `role_based` ("like sales@ info@ and contact@"),
  `role_based_catch_all`, `disposable`, `mailbox_not_found`, `greylisted`. Separate
  flags: `free_email`, `mx_found`, `catchall_domain`
  (https://www.zerobounce.net/docs/email-validation-api-quickstart/v2-status-codes).
- Instantly: Valid, Invalid, Risky; 0.25 credits a lead; run at upload ("Verify leads")
  or later (https://help.instantly.ai/en/articles/9245059-verifying-leads).
- Smartlead: an add-on "starting from 6000 credits for $15 USD"; afterwards it "will
  send emails only to valid and catch all leads"
  (https://helpcenter.smartlead.ai/en/articles/196-how-to-verify-your-lead-list-using-smartlead).
  A practitioner guide advises treating catch-all and unknown as "medium risk, cap daily
  volume instead of excluding", and says Smartlead "throttles and eventually suspends
  sending accounts once bounce rate crosses roughly 5%" (third-party:
  https://moderninbound.com/blog/neverbounce-smartlead-integration-guide).
- Apollo: each email is Verified, Unverified (which includes anything imported by CSV),
  Likely to Engage or Unavailable; a verified email that bounces within 30 days is
  refunded (search extract of https://knowledge.apollo.io/hc/en-us/articles/4423314404621).

**Bounce → suppression.**

- HubSpot: a hard bounce "excludes these contacts" from future email; a soft bounce does
  not; a pending bounce is retried "for up to 72 hours"; a global bounce is "a hard
  bounce across three or more HubSpot accounts" and is "dropped from future emails across
  all HubSpot accounts"
  (https://knowledge.hubspot.com/marketing-email/what-is-the-difference-between-a-hard-bounce-and-a-soft-bounce).
- Pipedrive: Bounced after emails "hard-bounce ... or soft-bounce ... five times";
  marketing statuses older than 90 days are deleted
  (https://support.pipedrive.com/en/article/campaigns-marketing-contacts).
- Customer.io: suppressed on a hard bounce, a spam complaint or by API. It "only prevents
  the address from receiving emails". Suppressions can be exported and undone with
  "Unsuppress" (https://docs.customer.io/messaging/channels/email/deliverability/workspace-suppressions/).

**Unsubscribe and block lists.**

- Close adds the link under the signature; unsubscribed contacts can be found with "email
  Unsubscribed status is set to Yes"
  (https://help.close.com/feature-guide/emailing/managing-unsubscribe-requests).
- Instantly's blocklist takes "Entire Domains" as well as addresses
  (https://help.instantly.ai/en/articles/9214389-global-blocklist).

**Role and free-mail addresses.** ZeroBounce files role addresses under `do_not_mail` and
flags free mail separately
(https://www.zerobounce.net/docs/email-validation-api-quickstart/v2-status-codes). The
file's `email_kind` column already makes that split.

**Stale records.** No page read gives a re-verification cadence. The nearest signals are
Apollo's 30-day refund window and Pipedrive's 90-day purge (both cited above).

**HQ today.** The kind of address is known; hard bounces, invalid addresses, provider
blocks and complaints go to the stop list from the webhook; `verified_state` and
`verified_at` exist on every lead.

**Gaps.** Nothing fills `verified_state` except a file column or a hand edit, and the
send path does not read it. "Risky" merges catch-all and unknown, which the verifiers
treat differently. A stop is one address; a prospect's firm cannot be stopped as a whole.
There is no rule for a verification that has gone stale.

---

### 7. Enrichment

- Attio enriches when "people records must have an email address" and "company records
  must have a domain". Companies: "Name, Logo, Description, Categories, Location ...
  Estimated ARR*, Employee Range*, Funding Raised*, Social media ..., Foundation date,
  Team, Twitter Follower Count" (starred fields not on the Free plan). People: name,
  picture, description, location, social, company, job title. Hand-entered values "will
  not be overwritten by Attio's enrichment"
  (https://attio.com/help/reference/managing-your-data/enriched-data).
- Folk: "Email, Phone number, Company name, Job Title, Contact URLs" through a waterfall
  "including Apollo.io, People Data Labs, Clearbit, Datagma, Prospeo & DropContact".
  "email enrichment consumes 1 enrichment credit and phone enrichment consumes 4"; 500 or
  1,000 credits a month by plan; "Enrich all" takes up to 500 contacts; an enriched field
  shows "a sparkle" (https://help.folk.app/en/articles/6804416-data-enrichment).
- Pipedrive: Data Enrichment "looks up publicly available information based on your
  contact's email domain, website or LinkedIn profile". Organisation: address, industry,
  employee count, annual revenue, website, LinkedIn. Person: phone, email. Premium and
  Ultimate plans (https://www.pipedrive.com/en/crm/resources/data-enrichment). The older
  Smart Contact Data closed to new customers on 22 August 2025 (Czech edition of the
  support article; the English page was not reachable:
  https://support.pipedrive.com/cs/article/smart-contact-data).
- Apollo: Basic "$49/seat/month", Professional "$79/seat/month", Organization
  "$119/seat/month"; an email costs 1 credit, a phone number 8 (third-party:
  https://www.zeliq.com/blog/apolloio-pricing).
- FullEnrich: a work email is 1 credit, a mobile 10; $0.058 a credit at 500 down to
  $0.035 at 100,000; "Not found = free" (https://fullenrich.com/pricing.md).
- Clay: a waterfall of providers per column, priced in credits that vary by provider
  (third-party: https://www.landbase.com/blog/clay-pricing).
- Breakcold fetches a LinkedIn profile when its URL is added
  (https://developer.breakcold.com/help/contacts-lists).

**How confidence is shown.** As a status on the email (Apollo), a status and sub-status
(ZeroBounce), or a mark on the enriched field (Folk's sparkle). Attio never overwrites a
value a person typed.

**What is cheap enough.** Verification: Smartlead's 6,000 credits for $15 is a quarter
of a cent an address, so the whole file costs about $58; Instantly's 0.25 credits a lead
is 5,750 credits. Finding emails is ten to twenty times dearer and not needed, because
the file already has them. For this market, firm facts from the website (what the firm
is, how big, regulated or not) are worth more than personal phone numbers.

**HQ today.** No enrichment. The file carries `website`, `registration_no` and
`source_url`, which is more provenance than most enrichment gives.

---

### 8. Table UX at 20,000+ rows

**Act on everything that matches, not just the page.**

- HubSpot: tick the header box, then a "Select all [number] [records]" link. Two caveats
  in its own words: adding to a static segment is "up to 100 records at a time", and
  creating tasks "will only create tasks for records selected on the current page, even
  if all records, including those on other pages, are selected"
  (https://knowledge.hubspot.com/records/bulk-edit-records).
- Close: a bulk action is defined by a query, not by ticked rows. It runs in the
  background, can be paused and resumed "unless more than 7 days have passed", and "By
  default a confirmation email is sent when a bulk action completes"
  (https://developer.close.com/api/resources/bulk-actions).
- Attio: bulk actions process "the selected records in batches (up to 250 per batch)"
  (https://docs.attio.com/sdk/extensions/bulk-record-action).
- Zoho: "a maximum of 500 records in a single API call", or 50,000 through the scheduled
  kind that runs in the background (community:
  https://help.zoho.com/portal/nl/community/topic/kaizen-57-mass-update-api-in-zoho-crm).
- Salesforce: "List views let you edit up to 200 records" at once (third-party:
  https://www.weflow.ai/blog/mass-update-records-salesforce).

**Saved views and columns.**

- HubSpot: "organize records with filters and save them as view tabs"; "you must save the
  view for the filters to remain after a page refresh"
  (https://knowledge.hubspot.com/crm-setup/create-customize-and-manage-your-saved-views).
- Close: columns are saved inside the Smart View
  (https://help.close.com/feature-guide/lead-filtering-and-smart-views).
- Attio: saved filters "are applied for all members with access to the view"
  (https://attio.com/help/reference/managing-your-data/views/filter-and-sort-views).

**Inline and bulk edit, keyboard, plain words.**

- Attio: select a range of cells and paste; move several kanban cards together; press
  `e` in a list to add a record; "Pasting into cells is only possible when the values ...
  are compatible with the attribute types"
  (https://attio.com/help/reference/managing-your-data/lists/bulk-updating-lists;
  https://attio.com/help/reference/managing-your-data/lists/create-lists).
- HubSpot's bulk edit of multi-value properties offers append, replace or remove
  (https://knowledge.hubspot.com/records/bulk-edit-records).
- Pipedrive's bulk actions: group email, schedule up to 100 activities, add to sequences,
  convert, archive, delete, enrich
  (https://support.pipedrive.com/en/article/bulk-editing-and-filtering).
- Breakcold filters on tags, custom attributes, activity, date and pipeline stage, and
  its export follows the active filter (https://developer.breakcold.com/help/contacts-lists).
- Close's search bar takes a sentence such as "leads based on the West Coast who haven't
  been called this week" (https://help.close.com/feature-guide/lead-filtering-and-smart-views).

**Virtualised tables and server-side filtering.** No vendor documents how its table is
drawn. What can be seen: paged tables with a select-all-matching link (HubSpot), bulk
changes as background jobs defined by a query (Close), batches of 250 (Attio), and hard
ceilings (Clay 50,000 rows a table, Attio 100,000 rows an import).

**HQ today.** The service already filters, orders and pages on the server, returns facet
counts, and applies a change to everything a filter matches. The portal's shared list
module still reads lists whole.

**Gaps.** A change to 25,000 rows runs inside one request; Close and Zoho run that in
the background. The Prospects screen needs the server grammar, a facet rail and a
"select all N that match" bar; the Leads page did not have them when this was read.

---

### 9. Ownership and workflow

**Round-robin versus manual.**

- HubSpot: "Rotate record to owner" offers Load Balanced, "Round Robin: assign records in
  a rotating, sequential order" and Random; leads are in beta and "A Sales Hub
  Professional or Enterprise subscription is required"
  (https://knowledge.hubspot.com/workflows/assign-and-rotate-record-owners-using-workflows).
- Pipedrive: automatic assignment on "Lead added", to a User or a Team (round robin);
  "up to two condition sets and 160 conditions per set"; "only available on Professional
  and higher plans" (https://support.pipedrive.com/en/article/automatic-assignment).
- Zoho: rules apply "for the records generated through import, Webform, and API only";
  with several users, "the records will be assigned based on the round-robin pattern"
  (https://help.zoho.com/portal/en/kb/crm-v2/automate-business-processes/assignment-rules/articles/crm-v2-set-assignment-rules).
- Salesforce "doesn't ship with native round robin functionality out of the box"
  (third-party: https://www.revenuehero.io/blog/salesforce-round-robin-assignment-guide).
- Close has none of its own; its help centre points to an app that "checks Close every 5
  minutes for new leads", or to Zapier
  (https://help.close.com/best-practices/simplify-your-workflows-with-automated-senders/new-assign-leads-to-users-via-round-robin).

**State machines and automatic moves.**

- HubSpot: a lead moves to Attempting when the owner sends an email, logs a call or an
  activity, schedules a meeting or creates a task, and to Connected when "the lead
  replies to your email" or a call or meeting is completed. Qualified and Disqualified
  "Must be manually updated" (https://knowledge.hubspot.com/records/view-a-lead-record).
  "Disqualified leads are stored with reasons" (third-party:
  https://hublead.io/blog/hubspot-leads-object).
- Apollo: Cold → Approaching once a message is sent → Replied, then Interested or Not
  Interested; Unresponsive; Do Not Contact (search extract of
  https://knowledge.apollo.io/hc/en-us/articles/4410623601165).
- Smartlead: a machine-learning engine "will parse every single reply ... and
  automatically categorize the lead". Categories "can be used as triggers to your
  subsequences". The Pro plan covers "up to 5 lead categories", Custom up to 10; the Base
  plan has none (https://helpcenter.smartlead.ai/en/articles/150-what-is-ai-categorization-and-how-does-it-work-with-smartlead;
  https://helpcenter.smartlead.ai/en/articles/51-lead-categories).
- Instantly: a label has an interest status (Positive, Neutral, Negative) and can be
  applied by AI, which "reads the label description and uses it to determine whether a
  reply matches" (https://help.instantly.ai/en/articles/8448897-custom-lead-labels).
- Close: status is set by hand or in bulk; no automatic moves are documented
  (https://help.close.com/feature-guide/leads/lead-statuses).

**Snooze and next action.**

- HubSpot offers to "schedule the next activity" on a lead with none pending
  (https://knowledge.hubspot.com/records/view-a-lead-record).
- Close's Inbox holds "inbound emails, missed calls, voicemails, SMS, and tasks in one
  list", "oldest items first", with snooze and a Done folder
  (https://help.close.com/docs/inbox).

**HQ today.** The same five stages as HubSpot. Logging a call or an outbound email on a
lead moves it from new to attempting; an inbound email moves it to connected; a positive
reply or a meeting connects it; "not interested" and "wrong person" disqualify it. The
inbox has snooze and reminders. Round robin was left out on purpose, and the tools above
agree: it is sold on the upper tiers or not built in at all.

**Gap.** The mail worker, the sequences and the webhook contain no stage write for a
send. It is worth confirming a campaign send reaches the "attempting" rule, or a mailed
prospect and an untouched one look alike in the stage facet.

---

### 10. Wrong for a small team; table stakes

**Over-engineering for 3–10 people — and the vendors' own pricing agrees.**

- Predictive scoring. HubSpot's AI scores are Enterprise-only
  (https://knowledge.hubspot.com/scoring/build-lead-scores-with-ai). It learns from past
  conversions, which a new prospect file does not have.
- Lookalike audiences: Enterprise-only (third-party:
  https://coefficient.io/saas-ai-tools/hubspot-ai-features).
- Score decay and grouped caps
  (https://knowledge.hubspot.com/properties/build-lead-scores) assume months of
  engagement events.
- Round robin and load balancing: Professional tiers at HubSpot and Pipedrive, absent
  from Close and Salesforce (section 9).
- AI reply sorting beyond a handful of labels: Smartlead caps it at 5 on Pro
  (https://helpcenter.smartlead.ai/en/articles/150-what-is-ai-categorization-and-how-does-it-work-with-smartlead).
- A convertible lead object that copies fields: Zoho's mass convert skips field mapping
  (https://help.zoho.com/portal/kb/articles/convert-leads).
- Nested filter groups. Pipedrive gets by with one ALL block and one ANY block
  (https://support.pipedrive.com/en/article/filtering).
- Segment sprawl. Customer.io has to archive segments automatically
  (https://docs.customer.io/journeys/segmentation/segments/). Ten to thirty named
  segments is the realistic number here.
- A six-provider enrichment waterfall (Folk, Clay) exists to find emails. This file has
  them.
- Open-rate reporting. Instantly's own course says not to turn open tracking on
  (https://instantly.ai/get-started-with-instantly/lesson-5).

**Table stakes — what every tool does.** Email as the person key and domain as the firm
key. An import with mapping, a dedupe choice, an error file, an import record and a way
to take it back. Dynamic and static segments with AND and OR, relative dates and a live
count. Exclusions at send. A suppression list that takes domains. A verification status
that the send path obeys. Bulk actions on everything a filter matches. Saved views. A
short status list that moves on sent, replied, bounced and unsubscribed. Caps per sender
and per campaign, with a ramp. Results by segment.

---

### Ranked: what is worth building

**Already in the working tree, and the research agrees.** The prospect pool kept apart
from CRM people (Pipedrive). HubSpot's five stages with automatic moves on logged
activity. Parts of 1,000 with every row accounted for (HubSpot's error counts, Instantly's
banners). Fill-blanks-only re-import (Close). Taking an import back, untouched rows only
(Zoho's undo, HubSpot's delete). Kind of address (ZeroBounce's role and free-mail flags).
Fit as bands with reasons (Apollo, Zoho, Salesforce's small-team advice). "Is any of" and
day-count comparisons. Audiences frozen at scheduling. Segment suggestions from the data,
which no vendor page documents. Server-side paging and facet counts. Per-firm and
per-sender caps, a bounce breaker and a stop list.

**The gaps, in order.** Ordered by what stands between the 23,000-row file and a safe
first send, then by what makes the second send better than the first.

1. **Verify addresses through a vendor, and make the send path obey the result.** A
   "verify this segment" action that fills `verified_state` and `verified_at`; invalid
   refused when an audience is resolved; risky left out unless a box is ticked; both
   counted in the preview. M. Why: Instantly, Smartlead and Apollo all gate sending on
   it; the whole file costs about $58; without it a cold file will trip the three-bounce
   breaker on day one.
2. **Split "risky" into catch-all and unknown, and keep the verifier's sub-status.** S.
   Why: ZeroBounce's advice differs for each — a catch-all can be mailed in its own
   group, an unknown should be retried — and one word hides that.
3. **A stale-verification rule.** A check older than 90 days counts as unchecked when an
   audience is resolved. S. Why: Apollo refunds bounces for 30 days and Pipedrive purges
   at 90; no status stays true.
4. **A domain-level stop.** S. Why: Instantly and Smartlead block whole domains. A
   prospect has no company record to mark do-not-contact, so a firm that says "take us
   off" needs one entry, not eight.
5. **Send to the first N, then the rest; and a daily ramp.** S–M. Why: Close's "Set
   limit" and 200-lead test, Customer.io's sample and Daily Ramp, Instantly's Slow Ramp.
   HQ has caps, approval and a version test, but no way to try 200 of a 4,000 segment.
6. **A firm key on a prospect** — `firm_domain` from `website`, else from a non-free-mail
   address — as a field, a facet, a "people at this firm" count on the row, and "one
   person per firm, best fit first" when an audience is built; the preview says how many
   firms. M. Why: HubSpot and Attio key firms by domain; Apollo has a same-company
   switch; and HQ's one-first-email-per-firm rule otherwise drains a campaign silently
   over days.
7. **Engagement and membership fields in the grammar** — was or was not sent campaign X,
   replied, bounced, clicked, in import X, in or not in segment X, has a registration
   number, has a website. M. Why: HubSpot's "is member of segment" and "is in import",
   Close's "not received this message", Pipedrive's campaign fields, Customer.io's NOT
   IN. This is what makes "the next slice" and "clicked but did not reply" one filter.
8. **Confirm a campaign send moves a prospect to "attempting".** S. Why: HubSpot and
   Apollo do it on the first message; otherwise the stage facet cannot tell mailed from
   untouched.
9. **Campaign results broken down by facet** — firm type, region, kind of address, fit
   band, source, import — counting replies, bounces and stops, not opens. M. Why:
   Instantly's step analytics and Pipedrive's campaign fields; the point of segmenting is
   to learn which segment answers.
10. **Import health on the imports list** — each file's bounces, replies and stops so
    far. S. Why: HubSpot's imports dashboard; it turns "take this file back" and "do not
    use this source again" into decisions made on numbers.
11. **A dry run for an import** — the same accounting, nothing written — so the portal
    shows what will be created, updated, left and skipped before the first part goes.
    S. Why: Attio previews before it runs; HubSpot flags errors first.
12. **One file of every skipped row and its reason**, kept on the import record. S. Why:
    HubSpot's error file; today a part reports at most 200 skips and nothing keeps them.
13. **The Prospects screen** — server pages, a facet rail whose counts are filters, a
    sticky bar with "select all N that match", the fit reasons one glance away, peek and
    keys from the existing lists. M. Why: HubSpot's select-all link, Close's query-based
    views; the shared list module reads lists whole and cannot carry 23,000 rows.
14. **Suggested segments on that screen, saved in one press**, plus two more kinds: by
    source or import, and "has a registration number". S. Why: the service already
    computes them, and it is the one place HQ is ahead of every tool read.
15. **A live count while a segment is built, with "of which can be mailed now" and the
    reasons for the rest.** S–M. Why: Customer.io's count and "View list"; it stops an
    empty or oversized send before the checklist does.
16. **One ANY block beside the ALL block, plus "is none of" and "does not contain".**
    S–M. Why: every tool has OR; Pipedrive's two-block model is the smallest that works;
    "is any of" already covers OR within one field.
17. **Bulk changes as a background job with progress, and "put back" for a change made
    by filter.** M. Why: Close runs them by query with pause and resume; Zoho schedules
    anything over 500; a 25,000-row change inside one request is a timeout waiting to
    happen.
18. **Role and free-mail addresses left out of a campaign unless ticked.** S. Why:
    ZeroBounce files role addresses under do-not-mail; the service already calls shared
    mailboxes "send last".
19. **"Next slice" on a finished campaign** — a segment of everyone in the same
    definition not yet sent. S, after item 7. Why: Close and Pipedrive build the next
    audience from the last.
20. **A test that conversion carries every prospect column**, custom ones included. S.
    Why: Zoho's mass convert drops mapped fields and Salesforce leaves unmapped ones
    behind; it is the documented failure of converting.
21. **Overwrite for chosen columns on re-import** (title, firm type), beside
    fill-blanks. S. Why: Close offers both modes; Zoho overwrites mapped fields only;
    researched lists are re-researched and titles change.
22. **An "in import" filter and a per-import link to its rows.** S (part of item 7, but
    useful alone). Why: HubSpot's "View imported records".
23. **Near-duplicate review among prospects** — the same name at the same firm under two
    addresses; a named and a role address at one firm. M. Why: Folk's Duplicates view,
    Pipedrive's any-of matching. HQ has this for companies and people already.
24. **Fit rules that read `registration_no` and the verified state.** S. Why: a
    regulated firm is a better fit and an invalid address is no fit; both columns exist.
25. **Segment membership over time** — a nightly count per saved segment, and who
    entered or left since the last send. M. Why: Customer.io's People tab; it answers
    "why did this segment shrink".
26. **Firm facts from the website** — what the firm is, its size — fetched by hand for a
    segment, marked as fetched, never over a typed value. M–L. Later. Why: Attio's
    company fields and its rule that typed values win; Folk's mark on enriched fields.

**Not worth building for this team.** Predictive scoring. Lookalike audiences.
Round-robin or load-balanced routing. Nested filter groups. Engagement scores with decay.
AI reply sorting beyond the outcomes sequences already record. An email-finding
waterfall. Open-rate reporting.

---

## Leads B — mailing 23,000 published prospects safely: research, 3 October 2026

How the cold-outbound and email-marketing tools of 2025–26 run outbound email to large
prospect lists without destroying the sending domain or breaking the law, and what HQ
should build so a 3–10 person team can mail about 23,000 published business addresses
(India, US, Europe, Asia, LatAm) of fund managers, PMS/AIF managers, hedge funds and
analysts.

HQ already has campaigns, sequences with business-day delays, a suppression list,
two-tier consent, daily caps, recipient time windows, three a day per firm domain, a
bounce breaker per sender, one-click unsubscribe and Brevo as the provider. This file
says what the rest of the industry does on top of that, where HQ's set-up is already
right, where it is wrong for this job, and ends with a ranked build list.

Plain English throughout; a term is defined the first time it appears. Every claim
keeps the link it was made from. Vendor blog figures are vendor figures; where a number
is from a vendor's own data rather than a standards body, it says so. Nothing here is
legal advice; §6 is the map, not the opinion.

Sources were read on 3 October 2026: 80 web searches and about 60 direct page reads, no
logins. Six pages refused or failed a direct read and are cited from search results or a
secondary summary instead; they are listed at the end of the appendix.

---

### 0. The short version

1. **Brevo cannot carry cold mail.** Its anti-spam policy bans lists "scraped on the
   internet, acquired or purchased from a third-party" for "transactional or marketing"
   mail alike. Every other shared-pool provider (Mailgun, Postmark, Amazon SES) says the
   same. Cold mail on Brevo risks the account that also sends sign-in codes and receipts.
   (§8)
2. **The industry sends cold mail from ordinary Google Workspace or Microsoft 365
   mailboxes on separate lookalike domains**, 25–50 messages per mailbox per day,
   2–3 mailboxes per domain, warmed for 3–4 weeks first, with replies pulled back into
   one shared inbox. Instantly, Smartlead and lemlist are orchestration layers over such
   mailboxes, not mail providers. (§2, §8)
3. **23,000 prospects is a six-month programme, not a campaign.** At safe volumes it
   needs about 20 mailboxes on 7–8 domains sending ~500 cold messages a day, after a
   month of warm-up. Doing it in eight weeks would need ~70 mailboxes and is the
   classic way a small team burns its name. (§2.5)
4. **Verify every address first.** Published-but-unverified lists lose 10–25% at
   verification; sending to them unverified gives 5%+ bounces, which is above every
   provider's pause threshold. Catch-all domains (about 38% of B2B domains) bounce at
   27% versus 1% for verified addresses: sample them, never bulk-send them. (§3)
5. **The law is a per-country switch, not a footer.** Published business addresses may be
   mailed on an opt-out basis in the US, Canada (with conditions), the UK (companies
   only), France, Australia (with conditions), Singapore (with an `<ADV>` label), Hong
   Kong and Brazil. They need prior consent in Germany, Austria, Italy, the Netherlands,
   Switzerland and, from 2027, India. Japan has a published-address exception. (§6)
6. **Measure replies and complaints, not opens.** Open rates are inflated by Apple's
   proxy and the pixel itself hurts placement. Good cold B2B finance outreach in 2025–26:
   2–4% replies, a quarter to a third of them positive, under 2% bounces, under 0.1%
   complaints, roughly 1–4 meetings per 1,000 sends (4–10 per 1,000 prospects on a
   well-targeted list). (§7)

---

### 1. Deliverability mechanics

**Authentication.** SPF (Sender Policy Framework) is a DNS record listing which servers
may send for a domain. DKIM (DomainKeys Identified Mail) is a cryptographic signature a
sending server adds so the receiver can check the message was not altered and came from
the signing domain. DMARC (Domain-based Message Authentication, Reporting and
Conformance) is a DNS policy that says what to do when SPF and DKIM fail and, crucially,
requires _alignment_: the domain in the visible `From:` must match the SPF domain or the
DKIM signing domain. "Relaxed" alignment accepts a subdomain of the same organisational
domain; "strict" requires an exact match.
https://www.nslookup.io/learning/dmarc-alignment-explained-with-examples/ ,
https://easydmarc.com/blog/dmarc-alignment/

**Gmail's rules (February 2024 onward).** Google's sender guidelines require of everyone:
SPF or DKIM, valid forward and reverse DNS, TLS in transit, a spam rate "below 0.3%",
RFC 5322-compliant formatting and no impersonation of Gmail. A _bulk sender_ — "close to
5,000 messages or more to personal Gmail accounts within a 24-hour period", counted per
primary domain — must also have DMARC (policy may be `p=none`), an aligned `From:`,
one-click unsubscribe plus "a clearly visible unsubscribe link in the message body" for
marketing mail, and DKIM keys of at least 1024 bits (2048 recommended). Google also says
"don't mix different types of content in the same message" and not to "purchase email
addresses from other companies". https://support.google.com/a/answer/81126

The FAQ adds the timeline and the fine print: "Starting November 2025, Gmail is ramping up
its enforcement on non-compliant traffic. Messages that fail to meet the email sender
requirements will experience disruptions, including temporary and permanent rejections";
"bulk senders with a user-reported spam rate greater than 0.3% will be ineligible for
mitigation"; one-click is "required only for marketing and promotional messages"; and
"the Email sender guidelines don't apply to messages sent to Google Workspace accounts"
— they bind on mail to personal @gmail.com. Google's recommended target is under 0.1%.
https://support.google.com/a/answer/14229414

**Yahoo.** Yahoo "will not specify a volume threshold" for who is bulk; requires SPF,
DKIM (1024-bit minimum) and DMARC; one-click "is only required for promotional/marketing
messages"; "if the unsubscribe is not honored in 2 days, then it would not meet the
requirement"; non-compliant mail "may be sent to the spam folder or rejected".
https://senders.yahooinc.com/faqs/ . Its best-practices page gives the ceiling ("Keep your
spam rate below 0.3%"). https://senders.yahooinc.com/best-practices/ . Third-party guides
add that Yahoo computes the rate on mail delivered to the inbox, so a sender's own
"complaints ÷ sent" reads lower than Yahoo's figure.
https://egressif.io/resources/sender-requirements/yahoo ,
https://leadhaste.com/blog/yahoo-email-deliverability-guide

**Microsoft (May 2025).** From 5 May 2025, domains sending over 5,000 a day to
Outlook.com/Hotmail/Live must pass SPF, DKIM and DMARC (`p=none` minimum, aligned with
SPF or DKIM); keep "valid 'From' and 'Reply-To' addresses reflecting the true sending
domain" (Microsoft recommends "avoiding 'no-reply' addresses"); include "a visible and
functional one-click unsubscribe link in all bulk or marketing emails, complying with
RFC 8058"; "regularly remove invalid or inactive email addresses"; use accurate subject
lines and transparent headers. Non-compliant mail goes to Junk first, with rejection
("550 5.7.515 Access denied, sending domain ... does not meet the required authentication
level") as the later phase.
https://techcommunity.microsoft.com/blog/outlook/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730 ,
https://docs.inboxally.com/compliance-industry-updates/microsoft-outlook-changes-for-bulk-senders-in-2025/ ,
https://support.easydmarc.com/knowledge-base/outlooks-new-email-authentication-requirements-for-high-volume-senders-effective-may-2025

**The filters that actually see fund managers.** Most of the 23,000 are on corporate
Microsoft 365 or Google Workspace tenants, not consumer webmail. Microsoft 365 assigns
every inbound message a Bulk Complaint Level (BCL, 0–9) from "internal and external
sources"; the default anti-spam policy junks mail at BCL 7, the Standard preset at 6, the
Strict preset at 5, and since July 2026 all mail identified as bulk carries a
"Promotions" tag. BCL 4–7 is "a bulk sender that generates a mixed number of
complaints". A cold stream that looks bulk and draws complaints lands in Junk at every
firm on the Standard preset.
https://learn.microsoft.com/en-us/defender-office-365/anti-spam-bulk-complaint-level-bcl-about

**One-click unsubscribe (RFC 8058).** Two headers: `List-Unsubscribe` with one HTTPS URI
(a `mailto:` may be added), and `List-Unsubscribe-Post: List-Unsubscribe=One-Click`. The
receiver POSTs that key/value to the URI; the sender "MUST NOT return an HTTPS redirect";
the DKIM signature must cover both headers; the URI must identify recipient and list so
the removal completes without a human. https://www.rfc-editor.org/rfc/rfc8058.html
HQ already does this; the point for cold mail is in §4.

**Postmaster Tools.** Google's free dashboard per domain. In the v2 release (compliance
dashboard replaced the reputation bars on 30 September 2025) each requirement — SPF, DKIM,
DMARC, From alignment, one-click, spam rate — shows Pass or Needs Work, next to Spam
Rate, Authentication, Delivery Errors, Feedback Loop and Encryption dashboards.
https://blueshift.com/blog/google-postmaster-tools-v2/ ,
https://www.suped.com/blog/ultimate-guide-to-google-postmaster-tools-v2 . Small senders
see blanks: "Data might be missing if the total number of messages for a given day is too
low. This is to protect users' privacy." https://support.google.com/mail/answer/9981691
A team sending 500 a day across seven domains, mostly to corporate recipients, should
expect little or no Gmail data per domain; its own bounce and reply logs are the
instrument.

**Feedback loops (FBLs).** A feedback loop is a provider telling the sender which messages
its users marked as spam. Gmail's needs a `Feedback-ID: a:b:c:SenderId` header added
before DKIM signing; aggregated complaint rates per identifier appear in Postmaster, for
@gmail.com recipients only. https://support.google.com/mail/answer/6254652 . Microsoft's
SNDS (Smart Network Data Services) shows IP reputation for its consumer domains and JMRP
(Junk Mail Reporting Program) forwards each junk report so the complainer can be
suppressed; both are enrolled from the same portal.
https://sendersupport.olc.protection.outlook.com/ ,
https://egressif.io/resources/postmaster/microsoft-snds-jmrp . Yahoo's Complaint Feedback
Loop is free and DKIM-domain based. https://senders.yahooinc.com/complaint-feedback-loop/
These cover consumer mailboxes; corporate tenants send no FBL. For HQ the realistic
complaint signal is the "report" clicks that come back as unsubscribes, plus bounce codes
that cite policy.

**Dedicated versus shared IPs.** A dedicated IP is yours alone, so only your behaviour
sets its reputation; a shared pool is pre-warmed and the provider manages it, but one bad
neighbour can get a clean campaign junked "because someone else on the same pool got
flagged that morning". Vendors put the cross-over around 50,000–100,000 messages a month;
below that a dedicated IP is cold and under-used.
https://instantly.ai/blog/dedicated-vs-shared-ip-pools-for-cold-outreach/ ,
https://www.smartlead.ai/blog/shared-vs-dedicated-ip-address ,
https://sendkit.ai/learn/dedicated-ip-vs-shared-ip-cold-email . At ~500 a day HQ is far
below that line. Note the irony the cold-email vendors rely on: Workspace and Microsoft
365 mailboxes send from Google's and Microsoft's own well-regarded IP pools, which is why
the industry uses them.

**Subdomain versus separate domain.** Reputation is tracked per domain and per DKIM
signing domain; Gmail's `421-4.7.28 ... unusual rate of unsolicited mail originating from
your DKIM domain` throttles _every_ stream signed by that domain. The remedy the
postmasters give is to "segment transactional and marketing streams onto separate DKIM
domains". https://www.postmastery.com/gmail-postmaster/ ,
https://support.google.com/a/answer/3726730 . A subdomain
(`mail.quantifyterminal.com`) separates the stream but still aligns to the organisational
domain under relaxed DMARC and still carries the brand's name into blocklist listings,
which is why the cold-email guides use _separate secondary domains_ for cold and keep
subdomains for consented streams (newsletter, transactional).
https://mailshake.com/blog/secondary-domains-the-essential-guide-for-safe-scaling/ ,
https://emailbison.com/blogs/cold-email-secondary-domains . Judgment for a finance
audience: lookalike domains can read as phishing to a hedge fund's security team.
Choose domains that are obviously ours (`quantifyterminal.co`, `getquantifyterminal.com`,
`quantifyterminal.io`), redirect them to the main site, list them on the main site, use
real team names.

**What damage looks like.** In order of severity: open and reply rates fall while nothing
else changes (placement moved to spam or Junk); Gmail returns `421-4.7.28` temporary
rate-limits on the DKIM domain; `550-5.7.1 ... likely unsolicited mail` permanent
rejections; Microsoft `550 5.7.515` for authentication, Junk placement at BCL 7; a
Spamhaus listing after a trap hit, where "delisting taking 30+ days and requiring
documentation of remediation"; and the Workspace account itself, which Google may
"permanently restrict ... from sending email" for spam.
https://www.postmastery.com/gmail-postmaster/ , https://bouncezero.io/blog/spam-traps-explained ,
https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace

**How long recovery takes.** Medium-to-high can recover in 2–3 weeks; bad-to-good takes
"6–12 weeks or even longer" of sending only to engaged recipients, because Postmaster's
compliance view looks back over 120 days and old spam rates must age out.
https://www.suped.com/knowledge/email-deliverability/sender-reputation/how-long-does-it-take-to-recover-email-deliverability-after-ip-blacklisting-or-poor-domain-reput ,
https://www.suped.com/learn/email-deliverability/how-long-does-it-take-for-domain-to-be-compliant-in-google-postmaster-after-reducing-spam-rates
This is why cold goes on domains that can be retired: a burned secondary domain is
abandoned; a burned `quantifyterminal.com` is three months of sign-in codes in spam.

**Spam traps.** Addresses that exist only to catch senders. _Pristine_ traps are planted
on web pages for scrapers — "using a scraped or purchased list is the fastest way to hit a
pristine trap", and one hit can list the domain. _Recycled_ traps are abandoned mailboxes
re-activated by the provider — the kind an old published list is full of. _Typo_ traps
catch `gmial.com`. https://www.suped.com/learn/blocklists/what-are-the-different-types-of-spam-traps-and-how-do-they-work ,
https://bouncezero.io/blog/spam-traps-explained . Verification (§3) removes most recycled
and typo traps; nothing removes a pristine trap except not scraping.

### 2. Warm-up and inbox rotation

**What warm-up is.** A new domain or mailbox has no history; providers treat a sudden
burst of similar messages as spam regardless of authentication. Warm-up sends a slowly
rising number of messages between cooperating mailboxes that open, reply and rescue from
spam, so the provider sees "normal" behaviour before the campaign starts.

**Instantly.** "Plan at least 2 weeks of warmup for new inboxes. For brand new domains,
4 weeks is safer." The warm-up sends 2 on day one and adds one a day; the campaign-level
"slow ramp" adds two a day up to the cap; production starts "at 30 emails per inbox per
day once placement is healthy", with hard bounces "near or below 1 percent and spam
complaints well under 0.3 percent".
https://instantly.ai/blog/7-key-benefits-of-slow-ramp-warmup-cold-email-domains/ ,
https://instantly.ai/blog/warmup-plan-for-ai-reply-agent/

**Smartlead.** Warm-up settings `total_warmup_per_day` 10–15 with `daily_rampup` 5 for
new accounts, reply rate 25–40%; week 1 10–15 a day, week 2 15–25, week 3 25–40, week 4+
40–50. https://api.smartlead.ai/api-reference/email-accounts/warmup-settings ,
https://api.smartlead.ai/guides/email-warmup.md ,
https://www.octavehq.com/post/smartlead-email-warmup-sender-reputation . For sending:
"keep every mailbox at 50 cold emails a day or fewer" ("only the busiest 5% of mailboxes
send 70 or more a day"), and "keep any single sending domain under about 500 outbound
cold emails per day"; "two domains at 400 per day each is safer than one domain at 800";
Workspace "tends to be stricter on volume ramp and content signals", Microsoft 365 "more
sensitive to authentication and IP reputation".
https://www.smartlead.ai/blog/how-many-cold-emails-per-day

**lemlist (lemwarm).** Target 30–40 warm-up messages a day, increment "1 email per day"
for new mailboxes, about 40 days of ramp then 14 days steady; start campaigns only when
the deliverability score is 90+ and inbox placement has stayed above 90% for 14 days;
once live keep total output (campaign + warm-up + manual) "under 70/day per provider",
reduce warm-up to ~10 a day, run the campaign at 30 a day and move to 40 only after a
month of clean sending; never switch warm-up off entirely.
https://help.lemlist.com/en/articles/8178427-set-up-lemwarm-and-start-warming-your-inbox

**MailReach.** 14–21 days of warm-up before outreach, volume raised gradually by the tool.
https://www.mailreach.co/blog/gmail-warmup ,
https://buttondown.com/outpacegtm/archive/mailreach-in-5-minutes/ . Price $19.50 per
mailbox per month (20 mailboxes $390), up to 100 warm-up emails a day, 20 inbox-placement
test credits included, 20% off annually. https://www.mailreach.co/pricing

**Warmup Inbox.** $15 per inbox per month for 75 warm-up messages a day (Basic), $49 for
250 (Pro), $79 for 1,000 (Max), volume discounts as inboxes are added, a network of "more
than 30K real inboxes". The higher tiers send far more warm-up mail than a 25–50-a-day
mailbox should; Basic is the only tier that fits this plan.
https://www.warmupinbox.com/pricing/

**The 50-a-day warm-up cap** most tools apply exists so the mailbox stays under what the
provider would call a bulk sender while leaving room for real campaign mail.
https://help.pipl.ai/en/articles/9262943-why-do-we-limit-warmup-emails-to-a-maximum-of-50-per-day

**Legitimacy.** Google shut the largest warm-up network: GMass closed its system on
31 January 2023 after Google said to "shut down their warmup system or they'd lose their
Gmail API access"; Google's view was that warm-up mail violates its anti-spam policies.
https://www.gmass.co/blog/warmup-shutting-down/ ,
https://www.growbots.com/blog/google-bans-cold-email-warmup/ ,
https://helpcenter.smartlead.ai/en/articles/94-google-warmup-google-api-changes-announcement-what-this-means
Warm-up tools now work over SMTP/IMAP rather than the Gmail API, which is a terms-of-
service grey zone rather than a sanctioned practice. Some practitioners report no
measurable Postmaster lift from warm-up networks in 2025 and say automated openers "create
detectable patterns". https://postboxservices.com/blogs/post/do-email-warmup-tools-work-in-2025/
The sober reading: warm-up is still what everyone does and the ramp itself is the part
that provably matters; a network of fake engagement is the part Google objects to.
Prefer a slow ramp of _real_ mail (team-to-team, to existing customers who have consented,
to partners) over a bought network, and if a network is used, keep it off the brand
domain.

**Rotation.** Tools distribute each campaign across all connected mailboxes, each with
its own daily cap and a per-mailbox minimum gap; a prospect's whole sequence stays on one
mailbox so follow-ups thread. Smartlead's documented minimum gap is 10–15 minutes per
mailbox ("emails sent less than 10 minutes apart can trigger ESP disconnections"), and
the campaign gap must be at least two minutes above the mailbox gap.
https://helpcenter.smartlead.ai/en/articles/77-how-does-the-minimum-time-gap-on-the-email-level-affect-campaign-distribution ,
https://frontbrick.io/resources-cold-emails/smartlead-interval-between-sending-emails
Instantly exposes "Minimum time" plus "Random additional time" per send.
https://www.guideflow.com/tutorial/how-to-set-time-gaps-in-a-campaign-in-instantly

**Per-recipient-domain caps.** Instantly's Domain/Company Send Limits default to 2 leads
per recipient domain per day, recommended 2–3: "If too many people at the same company
receive your messages, especially within a short time frame, it can trigger spam filters
or even cause domain-wide blocks." https://help.instantly.ai/en/articles/12578026-domain-send-limits ,
https://help.instantly.ai/en/articles/15943046-company-send-limits . HQ's three-a-day
per firm domain is at the top of that range; two is the safer default for firms on the
Strict preset.

**Mailboxes per domain, domains per programme.** The calculators agree: 25–30 cold a day
per mailbox, 2–3 mailboxes per domain, 2–3 weeks of warm-up, 20–30% spare capacity for
when a domain has to rest. Woodpecker's worked example: a primary pool of 20 mailboxes on
7 domains, a backup pool of 6 on 2, a scaling pool of 2 on 1 — 28 mailboxes, 10 domains.
https://woodpecker.co/cold-email-infrastructure-calculator/ ,
https://mailshake.com/blog/secondary-domains-the-essential-guide-for-safe-scaling/ ,
https://leadhaste.com/blog/how-many-domains-do-you-need-for-cold-email

**Provider ceilings (the hard limits above the safe ones).** Google Workspace: 2,000
messages per user per day (500 on trial), 3,000 external recipients per day, 10,000 total
recipients per day; hitting one suspends sending for up to 24 hours; "user accounts that
send spam might be permanently restricted". https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace
Exchange Online: 10,000 recipients per mailbox per rolling day, 30 messages per minute
over SMTP, a tenant-wide external recipient cap (TERRL) that "depends on the number of
licenses" (5,000 a day on trial), 100 external recipients a day from `onmicrosoft.com`
domains, and the statement that customers "who need to send legitimate bulk commercial
email ... should use third-party providers". https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits
A per-mailbox external limit of 2,000 a day was announced in 2024, postponed twice, and
cancelled on 6 January 2026 ("we have decided not to proceed with the rollout of this
limit"); older guides still describe it as coming. https://mc.merill.net/message/MC787382
None of these bind at 25–50 a day; they matter because a bug that loops a send will hit
them.

#### 2.5 The arithmetic for 23,000 prospects

Assumptions, each from the sources above: about 13% of the list is removed at
verification (the sources say 10–25%, §3); a sequence of one opener and two follow-ups; replies, bounces and stops end some
sequences early, so about 2.7 sends per prospect; 25 cold sends per mailbox per working
day; 3 mailboxes per domain; a 25% spare pool. About 20,000 deliverable prospects ×
2.7 ≈ 54,000 sends.

| Programme length (after warm-up) | Sends per mailbox | Mailboxes | Domains | With 25% spare             |
| -------------------------------- | ----------------- | --------- | ------- | -------------------------- |
| 8 weeks                          | 1,000             | 54        | 18      | ~68 mailboxes, ~23 domains |
| 12 weeks                         | 1,500             | 36        | 12      | ~45 mailboxes, ~15 domains |
| 26 weeks                         | 3,250             | 17        | 6       | ~21 mailboxes, ~8 domains  |
| 52 weeks                         | 6,500             | 9         | 3       | ~11 mailboxes, ~4 domains  |

Add 3–4 weeks of warm-up before week one, and a month at 30 a day before any mailbox goes
to 40. For a 3–10 person team the 26-week row is the honest one: ~20 mailboxes (two or
three per real person, across domains), ~500 cold sends a day, of which ~185 are new
prospects and the rest follow-ups, so the 23,000 drain in about six months. At 2–4% reply
that is 10–20 replies a day, every one of which has to be read (§5). Because of HQ's
per-firm cap and time windows, a list concentrated in a few hundred large firms drains
more slowly than the table says; the portal should compute and show "days to drain" per
campaign from the real constraints rather than let anyone guess.

### 3. Verification before sending

**What a verifier does.** Syntax check; MX lookup (does the domain accept mail at all);
SMTP handshake (ask the server whether the mailbox exists without sending); detection of
_catch-all_ (also "accept-all") domains, which say yes to every address so the handshake
proves nothing; _role_ addresses (`info@`, `sales@`, owned by a function not a person);
_disposable_ domains; and sometimes spam-trap and toxicity scoring.

**Pricing per 1,000 (2026, as published or as reviewed; all vary with volume).**

| Vendor          | Price per 1,000                                   | Notes                                                                                                | Source                                                                                               |
| --------------- | ------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| ZeroBounce      | ~$19.50 pay-as-you-go; ~$9.90 on the $99/10k plan | Claims 99.6% accuracy; catch-all is flagged, not resolved                                            | https://bouncezero.io/zerobounce-review-2026                                                         |
| NeverBounce     | $8 at 1k, falling to ~$4–5 at 100k+               | Credits valid 12 months; free list analysis                                                          | https://emelia.io/hub/neverbounce-pricing , https://bouncezero.io/neverbounce-pricing                |
| MillionVerifier | $1.78 (50k for $89); $0.45 at 1M                  | Credits never expire; money-back on "risky"; catch-all marked risky, "resolves only ~5%" in one test | https://bouncezero.io/compare/millionverifier , https://toolradar.com/tools/millionverifier/pricing  |
| Bouncer         | $8 at 1k, $5 at 50k, $2 at 1M                     | Toxicity check included; prices checked June 2026                                                    | https://hackceleration.com/labs/bouncer-pricing , https://www.capterra.com/p/178464/Bouncer/pricing/ |
| Reoon           | $1.20 (10k for $12); $0.94 at 100k lifetime       | 20 free a day; unknowns not charged; reviewers report missed catch-alls                              | https://www.capterra.co.uk/software/1033680/reoon-email-verifier                                     |

For 23,000 addresses the whole list costs between about $30 (Reoon/MillionVerifier) and
$450 (ZeroBounce PAYG). The cheap tier is fine for the first pass; the point of paying
more is catch-all handling, and none of them truly resolves catch-alls.

**What to expect from a published-but-unverified list.** "Every email data source
returns 10-25% invalid addresses at export." Campaigns with no verification bounced at
5.2%, single-provider verification 1.8%, two-provider ("waterfall") verification 0.7%
(a practitioner sample, not a study). Purchased third-party lists run "30-50% invalid".
https://leadhaste.com/blog/cold-email-bounce-rate-benchmarks-2026 ,
https://bouncezero.io/email-bounce-rate-guide-2026 ,
https://www.apollo.io/insights/how-do-i-cut-my-cold-email-bounce-rate-and-keep-messages-out-of-spam-while-prospecting
B2B addresses decay at roughly 3.6% a month (22–70% a year depending on the source), so a
list verified three months ago is not verified. https://www.landbase.com/blog/data-decay-rate-statistics ,
https://bouncezero.io/blog/why-b2b-email-lists-decay-fast

**Acceptable bounce rate.** Under 2% is good, 1–2% is a well-kept list, under 3% is the
tolerance ceiling; Belkins' 2025 cold-email bounce rate was 1.71%. "If you're meaningfully
above 2%, your list has a hygiene problem." https://bouncezero.io/email-bounce-rate-guide-2026
Providers pause well before that becomes a reputation event: Smartlead's High Bounce Rate
Auto Protection pauses a campaign at a threshold the user sets (its example is 5%), with
a webhook when it fires.
https://helpcenter.smartlead.ai/en/articles/274-what-is-high-bounce-rate-auto-protection-in-smartlead ,
https://helpcenter.smartlead.ai/en/articles/210-bounce-autopause-and-webhook

**Catch-all.** Hunter found "38% of email domains are configured as accept-all" (sample of
2,572) and that mail to accept-all addresses bounced at 27% against 1% for verified
addresses. Its advice: sample first; cap accept-all at "2-5% of the list"; prefer
addresses with corroborating web presence; Google Workspace addresses that show a "people
chip" bounced 0% in its test. https://hunter.io/blog/ultimate-guide-accept-all-catch-all/
LeadMagic's rule is the same: treat catch-all as its own segment, send 5–10% as a test,
measure hard bounces, then decide. https://leadmagic.io/blog/should-you-email-catch-all-risky-unknown
For a fund-manager list this matters more than usual: many asset managers and banks run
catch-all domains, so a large slice of the 23,000 will come back "risky", and the right
answer is a separate, slower, closely watched catch-all campaign, not deletion and not a
blind send.

**Role addresses.** Verifiers do not mark them invalid; they flag them. Role addresses
"generate complaints at 3-5 times higher rates than personal addresses", are harvested by
spammers so sending to them matches spammer patterns, and some honeypots are role
addresses. "For cold outreach and bulk marketing, suppress role addresses, or send only to
named contacts." https://www.suped.com/knowledge/email-deliverability/sender-reputation/what-are-the-deliverability-risks-and-handling-practices-for-role-based-email-addresses ,
https://bouncezero.io/what-is-a-role-based-email . A published `ir@fund.com` or
`info@fund.com` is also the address most likely to fail the "relevant to the recipient's
role" test in Canada and Australia (§6).

**Bounce codes.** Permanent failures start with 5 (`550 5.1.1` user unknown), temporary
with 4 (`4.2.2` mailbox full); a 5xx whose text mentions policy or spam is a _block_, not a
bad address, and is the signal to stop the sender, not just the recipient.
https://www.gmass.co/blog/email-bounce-codes/ ,
https://www.suped.com/knowledge/email-deliverability/troubleshooting/how-to-parse-smtp-responses-to-identify-hard-and-soft-bounces

### 4. Sending policy

**Ramp for a new campaign on a warmed domain.** Even on warmed mailboxes the first week
of a new campaign is a step change in content and recipients. The published schedules
start at 5–10 a day and reach 25–30 over two weeks; Instantly's slow ramp adds 2 a day per
mailbox; a daily increase of 10–20% is the upper end and 30%+ "can trigger ESP scrutiny".
https://hunter.io/cold-email-guide/email-warmup/ , https://instantly.ai/blog/7-key-benefits-of-slow-ramp-warmup-cold-email-domains/ ,
https://www.octavehq.com/post/smartlead-email-warmup-sender-reputation

**Never mix cold with transactional.** Google: "don't mix different types of content in
the same message". https://support.google.com/a/answer/81126 . The Gmail `421-4.7.28`
rate limit applies to the DKIM domain, so a cold stream signed by `quantifyterminal.com`
throttles sign-in codes signed by the same domain. https://www.postmastery.com/gmail-postmaster/
Cold on secondary domains; Brevo transactional on the brand domain; newsletter on a brand
subdomain.

**Time of day and time zone.** Belkins (7.5 million cold emails, 2025): replies by day
Wednesday/Thursday 0.48%, Monday/Tuesday 0.45%, Friday 0.44%, Saturday 0.35%; by window,
morning (8–12) 0.54%, early morning (5–8) 0.52%, afternoon 0.47%, evening 0.40%; meeting
conversion 0.4% for morning and early morning, 0.1% for every other window. (Belkins
defines reply rate as all replies ÷ all sends, which is why its figures are low.)
https://belkins.io/blog/email-deliverability/choosing-the-best-time-to-send-an-email
Vendor compilations report weekend sends at 1.6% replies against 4.1% on weekdays, and put
sending in the recipient's working hours at a "10-15%" lift in replies; treat both as
directional. https://www.zeliq.com/blog/best-days-email-open-rates ,
https://qualtir.com/blog/best-time-to-send-cold-email
HQ's recipient time windows already do this; the rule to add is "8–11 local, Tuesday to
Thursday first, Monday and Friday as overflow, never weekends", with India, Europe, US
East, Singapore/Hong Kong and São Paulo each getting their own window so a 500-a-day
budget is not spent in one time zone.

**Spacing.** 10–15 minutes minimum between sends from one mailbox, randomised
(Smartlead; Instantly's minimum-plus-random). At 25 a day over an eight-hour local window
that is about one every 20 minutes, which is what a person looks like.
https://helpcenter.smartlead.ai/en/articles/77-how-does-the-minimum-time-gap-on-the-email-level-affect-campaign-distribution

**Plain text versus HTML.** Hunter's 2.2 million-email 2025 analysis: HTML campaigns had
"+652% higher" bounce rates than plain text, where HTML meant links, images, formatting,
pasted AI output or "a tracking pixel to track opens"; the authors note it is correlational
("plain text senders may be more experienced"). Recommendation: no links, media,
formatting or tracking in first-touch cold mail; small campaigns of 50–100.
https://hunter.io/blog/is-html-harming-your-cold-email-deliverability/ . Smartlead and
Warmy say the same about images. https://www.smartlead.ai/blog/do-images-send-your-emails-to-spam ,
https://www.warmy.io/blog/plain-text-or-html-in-cold-email/

**Tracking pixels.** Open tracking forces HTML and some filters block tracked content;
Hunter quotes a practitioner: click tracking is "cementing your place in the promotions
folder at best"; open tracking is tolerable only on a custom tracking domain; Hunter's
own tactic is to track at launch to check placement, then switch tracking off.
https://hunter.io/cold-email-guide/email-tracking . Vendor write-ups put the placement
penalty at 8–12 points; treat that as directional. https://warmforge.ai/blog/plain-text-vs-html-in-cold-emails
And the number it produces is wrong anyway (§7). Verdict: no open pixel on cold mail; if a
link is unavoidable, one, un-tracked, on the brand domain.

**Personalisation tokens.** Woodpecker's 20 million-email analysis: "advanced"
personalisation 17% replies versus 7% without; the ideal icebreaker is one sentence under
20 words; trigger-based outreach (funding, hires, job change) roughly doubles replies.
https://woodpecker.co/blog/sales-email-statistics/ ,
https://www.apollo.io/insights/what-personalization-strategies-actually-improve-cold-email-reply-rates
For this list the tokens that are both true and relevant are firm type (PMS, AIF, hedge
fund, family office), mandate (long-only, multi-asset), market (NSE, LSE, SIX), and a
public fact (a filing, a fund launch). A token that renders empty must block the send, not
send "Hi ,".

**Spintax.** Spintax is `{Hi|Hello|Dear}` — randomised wording so messages are not
identical. MailReach: "spintax does not improve cold email deliverability" for senders
under ~500 a day; neither Google nor Microsoft documents a template-similarity filter;
heavy spintax "fragments that data across too many variations" so A/B tests stop
working. https://www.mailreach.co/blog/spintax-cold-email . Mailshake and Woodpecker
report a 3–8% placement lift at 100+ a day per mailbox and higher volumes.
https://mailshake.com/?p=18057 , https://woodpecker.co/blog/spintax-for-cold-email/
At HQ's volumes: skip spintax; vary copy per segment deliberately instead.

**Reply-To.** Microsoft wants a valid `Reply-To` that reflects the true sending domain and
no `no-reply`. https://docs.inboxally.com/compliance-industry-updates/microsoft-outlook-changes-for-bulk-senders-in-2025/
One school routes replies to a shared inbox on a subdomain so the sending mailbox stays
quiet. https://firstsales.io/blog/cold-email-reply-to-address . The sequencers do the
opposite and the better thing for 1:1 mail: replies land in the sending mailbox (it is a
real person's address) and are pulled into the shared view over IMAP or the Gmail API.
Threading needs `Message-ID`, `In-Reply-To` and `References` set correctly on every
follow-up. https://help.devcloudsoftware.com/help/article/sending-and-threading

**Follow-ups in the thread.** Follow-ups produce 42% of all replies (first message 58%).
https://instantly.ai/blog/follow-up-emails-vs-no-followup/ . An unattributed study of
26,000 prospects quoted by Prospeo got 2.5% on the opener, 5.2% from the first bump and
3.7% from the second, 11.4% in total. https://prospeo.io/s/bumper-email-template . Keep
the first two or three follow-ups in the same thread (context, one Reply-To, one
mailbox); a later new-thread "break-up" with a new subject is optional.
https://prospeo.io/s/cold-email-follow-up-best-practices , https://whali.co.uk/blog/how-many-follow-ups-to-send
Prospeo's cadence is day 0, 2, 5, 10 and a break-up at 18, "3-5 total emails", with the
warning that "sending 4+ emails in a sequence more than triples unsubscribe and spam
complaint rates". https://prospeo.io/s/follow-up-email-reply-rate . Judgment for this
audience: an opener and two follow-ups, a few business days apart, then stop.

**One-click headers on cold mail.** The bulk-sender rule binds at 5,000 a day to Gmail,
which HQ will not reach, and Gmail strips `List-Unsubscribe` from mail it classifies as
personal 1:1. https://www.suped.com/email-deliverability/answers/why-are-list-unsubscribe-headers-removed-from-cold-emails-sent-via-gmail
GMass's view: for cold mail an in-body sentence ("if you'd rather not hear from me, reply
'stop' or click here") fits better than a marketing-style button.
https://www.gmass.co/blog/list-unsubscribe-header/ . Microsoft asks for a one-click link
in "all bulk or marketing emails". Do both: HQ's RFC 8058 headers (they cost nothing and
help where they are honoured) plus a plain one-line opt-out in the body that also accepts
a "stop" reply. The spam button is the complaint; the unsubscribe is the relief valve.

### 5. Reply handling

**Detection.** Smartlead detects replies "through multiple methods: email headers,
webhooks, and IMAP polling" and its Master Inbox shows them "seconds after they land".
https://smartlead.ai/unified-master-inbox , https://smartlead.ai/blog/ai-email-organizer
Matching is by `In-Reply-To`/`References` first, then by sender address and subject; a
reply from a different address at the same firm (an assistant, a colleague) must still
stop the sequence for the original recipient.

**Classification.** Instantly's Unibox ships eight tabs: All, Interested, Meeting booked,
Meeting complete, Closed, Out of Office, Wrong person, Not interested; its Reply Agent
tags sentiment and can run on "full autopilot" or "human-in-the-loop" (drafts for
approval). https://help.instantly.ai/en/articles/6576561-how-to-manage-the-unibox-best-practices-on-how-to-reply-to-leads ,
https://instantly.ai/get-started-with-instantly/lesson-6 . Smartlead's categories
("Requested info", "Out of Office", etc.) are also triggers for sub-sequences: mark
"Requested info" and the lead drops into a "send more info" drip.
https://helpcenter.smartlead.ai/en/articles/51-lead-categories . Reply.io documents the
same set with an explicit "Unsubscribe" class. https://how.reply.io/learn/reply-classification
The minimum set for HQ: interested, not interested, out of office (with a return date),
wrong person (with a referral if given), unsubscribe/stop, bounce/auto-reply, other.
"Not interested" and "stop" are both suppression events; "wrong person" is a stop for the
address and a new lead for the referral, with its own consent basis.

**Auto-stop on reply.** Standard everywhere: any human reply ends the sequence for that
prospect; the Reply Agent "stops the sequence and moves on" on a no.
https://instantly.ai/get-started-with-instantly/lesson-6 . For a firm-level account view,
a stop from one person at a firm should at least pause the others at that firm for review.

**Out-of-office resume.** lemlist's Out of Office Detection "extracts the return date from
the auto-reply using AI", reschedules the next step to the return date and creates a task.
https://help.lemlist.com/en/articles/13702727-out-of-office-detection . Smartlead's
"Auto-restart OOO Replies by Using AI" parses the return date and reschedules follow-ups
after it. https://helpcenter.smartlead.ai/en/articles/209-auto-restart-ooo-based-on-email-copy
Instantly's "OOO Resume" does the same. https://help.instantly.ai/en/articles/9713093-ooo-resume-ai-smart-pause-for-out-of-office
Good practice: pause only that address, resume a day or two after the stated date, and
for "until further notice" pause 14 days then retry once. Out-of-office replies also leak
useful facts — the replacement contact, the new title, a changed address — which
Amplemarket uses to find "42% more leads"; HQ should at least capture the named
alternate as a referral candidate, with the same consent rules.
https://www.amplemarket.com/blog/how-we-leverage-out-of-the-office-responses-to-generate-more-meetings

**Shared inbox UX.** What the three leaders agree on: one list across all mailboxes,
filterable by category, campaign and sender; the full thread with the campaign step that
produced the reply; one-click actions (mark interested, book, stop, wrong person,
forward); assignment to a person; a draft reply that sends from the original mailbox so
the thread stays intact; and the lead's CRM record one click away. HQ's desk already has
queues, assignment, peek pane and bulk undo; what it needs is the mail thread as a desk
item with these verbs.

**Bounce and block handling.** Hard bounce: suppress the address permanently, mark the
record. Soft bounce: retry up to a limit, then treat as hard. Policy block (5xx with
spam/policy text) or Gmail `421-4.7.28`: pause the _sender_ and raise an alert, because
the address is fine and the domain is the problem. https://www.gmass.co/blog/email-bounce-codes/
HQ has a bounce breaker per sender; the missing piece is distinguishing "address dead"
from "we are being blocked".

### 6. Compliance by region (B2B cold email to published business addresses)

Definitions used below. _Opt-out regime_: you may send a first message without consent if
it carries identification and a working opt-out. _Opt-in regime_: you need prior consent
before the first message. _Legitimate interest_ (GDPR Article 6(1)(f)): a lawful basis
for processing personal data without consent, provided a documented balancing test (a
_Legitimate Interest Assessment_, LIA) finds the recipient's interests are not overridden;
GDPR Recital 47 says direct marketing "may be regarded as carried out for a legitimate
interest". https://gdpr-info.eu/recitals/no-47/ . _Soft opt-in_: an existing-customer
exception for similar products with an opt-out at collection and in every message.
_Corporate subscriber_ (UK): a company, LLP, Scottish partnership or public body, as
opposed to an individual, sole trader or ordinary partnership. _Conspicuous publication_
(Canada, Australia): the recipient's address is published openly, without a "no marketing"
note, and the message relates to the recipient's role.

A named person's work email is personal data under GDPR, UK GDPR, LGPD, DPDP and the UAE
PDPL. Two laws usually apply at once: a data-protection law (may I process this person's
data for this purpose?) and an electronic-marketing law (may I send this message?). Passing
one does not pass the other; the ICO says the two regimes "must be read together".
https://www.scl.org/10176-b2b-communications-a-welcome-ico-turnaround/

#### 6.1 Country by country

**United States — CAN-SPAM (opt-out).** "The law makes no exception for business-to-
business email." Requirements: no false or misleading header information; no deceptive
subject lines; identify the message as an ad; a valid physical postal address; a clear
and conspicuous opt-out that works for at least 30 days; honour opt-outs within 10
business days with no fee, no login and no information beyond the address; and liability
for whoever's product is promoted as well as whoever sends. Penalty up to $53,088 per
email. https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business

**Canada — CASL (consent, express or implied).** Implied consent exists where the
recipient "conspicuously published" the address, the publication is not accompanied by a
statement that they do not want commercial messages, and the message "is relevant to the
person's business, role, functions or duties"; or through an existing business
relationship (purchase within 2 years, inquiry within 6 months). Every message must
identify the sender and anyone on whose behalf it is sent, give contact information
(mailing address plus phone, email or web), and carry an unsubscribe that works for 60
days and is given effect "no later than 10 business days". The burden of proving consent
is on the sender. Penalties up to CAD 1 million per violation for individuals and
CAD 10 million for organisations. https://laws-lois.justice.gc.ca/eng/acts/E-1.6/FullText.html ,
https://crtc.gc.ca/eng/com500/guide.htm . For HQ: store the URL and date where each
Canadian address was found, and the reason the terminal is relevant to that role.

**United Kingdom — PECR + UK GDPR (opt-out for companies).** ICO: "You can email or text
any corporate body (a company, Scottish partnership, limited liability partnership or
government body)"; sole traders and ordinary partnerships "are treated as individuals –
so you can only email or text them if they have specifically consented" or under the soft
opt-in. You "must not disguise or conceal your identity, and you must provide a valid
contact address so they can opt out". Named employees' addresses are personal data, so
UK GDPR applies: legitimate interests with an LIA, and an Article 14-style notice.
https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/

**European Union — the directive and the national split.** ePrivacy Directive Article
13(1) requires prior consent for direct-marketing email to _natural persons_; Article
13(5) leaves _legal persons_ to each member state, so B2B rules differ by country.
https://presencis.com/regulations/eprivacy-directive/article-13/ ,
https://en.wikipedia.org/wiki/EPrivacy_Directive . GDPR Article 14 applies wherever the
address was not collected from the person: identity of the controller, purposes and legal
basis, the legitimate interests pursued, the source of the data, retention period and the
right to object, provided "at the latest at the first communication".
https://gdpr-info.eu/art-14-gdpr/

- **France (opt-out for professionals).** CNIL: prospecting "à l'égard de professionnels
  peut être fondée sur l'intérêt légitime" when "l'objet de la sollicitation est en
  rapport avec la profession de la personne démarchée", the person was told how the
  address would be used and can object; consumers need prior consent.
  https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique
- **Germany (opt-in, no B2B exception).** UWG §7(2) No. 2 "generally requires prior
  express consent for advertising by email ... without creating a general B2B
  exemption" (the presumed-consent route exists for B2B _telephone_ calls only); §7(3)
  existing-customer exception needs a real contract, similar products, no objection and
  an opt-out in every message; a GDPR legitimate interest "does not by itself authorise a
  commercial email"; enforcement by competitor cease-and-desist (Abmahnung), data
  authorities and civil claims. https://overloop.com/blog/b2b-cold-email-germany-gdpr-compliance ,
  https://certified-senders.org/wp-content/uploads/2017/07/The-legal-situation-for-email-marketing-in-Germany-Austria-and-Switzerland.pdf
- **Austria (opt-in).** §174 TKG: consent required for any marketing email unless the
  previous-business exception applies. https://www.dealfront.com/guides/guide-to-cold-calling-and-emailing-europe
- **Italy (opt-in).** Article 130 of the Privacy Code requires consent for promotional
  email; the Garante reads it as applying to business addresses too; legitimate interest
  does not substitute. https://overloop.com/it/blog/b2b-cold-email-italia-gdpr-garante
- **Netherlands (opt-in, since 1 October 2009 for B2B too).** Article 11.7
  Telecommunicatiewet bans unsolicited commercial email to businesses "unless the sender
  can demonstrate prior consent"; two narrow exceptions — an address the business
  published _for the purpose of receiving offers_, and existing customers for similar
  products with an opt-out at collection and in every message. ACM expects consent
  evidence kept up to five years, does not warn before fining, and can fine up to
  €900,000 or 1% of turnover (doubled for repeats within five years); the Companeo fine
  (15 million emails) was upheld at €75,000. https://cms.law/en/nld/publication/dutch-new-law-prohibits-b2b-spam ,
  https://imisofts.com/blog/cold-email-laws-netherlands/ ,
  https://www.autoriteitpersoonsgegevens.nl/en/themes/internet-and-smart-devices/advertising/digital-direct-marketing
- **Switzerland (opt-in, B2B same as B2C).** UWG Article 3(1)(o): mass advertising by
  email needs prior consent, correct sender identification and a free, easy opt-out;
  "there is no difference between B2C and B2B". Zurich and Geneva are prime targets for
  this list, so this is not a footnote. https://www.bakom.admin.ch/en/when-is-mass-sending-allowed
- Other EU states (Ireland, Belgium, Spain, Nordics) vary; the directive's "implemented
  differently by the EU member states" is the honest summary. Default them to the strict
  path until each is checked. https://www.gdprregister.eu/gdpr/direct-marketing-rules-and-exceptions/

**India — DPDP Act 2023 and Rules 2025; TRAI does not cover email.** "India does not have
a comprehensive law or regulatory authority governing email marketing activities", and
TRAI's commercial-communication regulations "currently only govern voice calls and
communications sent through telegraph" (calls and SMS), not email.
https://tta.in/annual-maintenance-email-marketing-india/ ,
https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf ,
https://law.asia/phishing-and-spam-regulation/ . The DPDP Rules were notified on
14 November 2025 with phased commencement: the Board immediately, Consent Managers after
12 months, and the substantive obligations (notice, consent, fiduciary duties) after 18
months, i.e. around May 2027. https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf ,
https://www.deccanherald.com/amp/story/india%2Fcentre-notifies-dpdp-rules-implementation-planned-in-phases-spread-over-12-18-months-3798465
Once in force, marketing to a person needs "specific opt-in consent (by way of a clear
and itemised notice)"; the Act's lawful grounds are consent and a closed list of
"legitimate uses", with no general legitimate-interest ground to fall back on. On B2B the
same firm notes the Act "only covers personal data (as opposed to non-personal data, such
as organisational data)": a generic firm address sits outside it, a named person's work
address is personal data and inside it. https://tta.in/annual-maintenance-email-marketing-india/
Until then "there's no blanket ban on emailing a stranger", and the advice is
transparency and an easy opt-out.
https://echai.ventures/startingup/cold-outreach/is-it-legal-to-cold-email-people-in-india-and-do-i-need-their-consent-first ,
https://www.exchange4media.com/digital-news/dpdp-act-forcing-digital-marketing-reset-email-survives-pixels-die-and-sms-gets-reborn-149645.html
Practical reading: India is opt-out-by-custom now and opt-in for named individuals from
about May 2027; build the consent record now so the Indian segment does not go dark then.

**Singapore — Spam Control Act 2007 (opt-out, with a label).** Applies to unsolicited
commercial electronic messages sent "in bulk": more than 100 of the same or similar
subject in 24 hours, 1,000 in 30 days, or 10,000 in a year. Each must carry an
unsubscribe facility with contact information valid for at least 30 days at no more than
standard cost, be removed within 10 business days of an unsubscribe request, have
accurate header and sender information, and have a title beginning with `<ADV>`;
dictionary attacks and address harvesting are prohibited. https://sso.agc.gov.sg/Act/SCA2007 ,
https://imda.gov.sg/infocomm-regulation-and-guides/unsolicited-communications/best-practices-for-organisations ,
https://otp.sg/singapores-spam-control-bill/ . The PDPA's Do Not Call registry covers
phone, SMS and fax, not email; the PDPA also excludes "business contact information" from
most of its data-protection obligations — verify that reading with counsel before relying
on it (https://sso.agc.gov.sg/Act/PDPA2012).

**Hong Kong — UEMO (opt-out).** Commercial electronic messages with a Hong Kong link must
carry accurate sender information and an unsubscribe facility, honoured within 10 working
days, with the sender and unsubscribe statements in both Chinese and English; the
do-not-call registers cover fax, SMS and pre-recorded calls, not email.
https://www.gov.hk/en/residents/communication/infosec/guidelines/antispam.htm

**Japan — opt-in with a published-address exception.** The Act on Regulation of
Transmission of Specified Electronic Mail requires prior consent, with exceptions for
persons who consented, who gave their address in writing (business cards), with whom there
is a business relationship, and — the one that matters here — "自己の電子メールアドレスを
公表している団体・営業を営む個人": organisations and individuals in business who publish
their own address, _unless_ the publication says advertising mail is refused. Each message
must show the sender's name and address and an opt-out contact.
https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/m_mail.html . One vendor reads
the exception more narrowly; treat it as usable for published firm addresses and record
the publication. https://www.benchmarkemail.com/in/the-quirks-of-japans-opt-in-email-marketing-legislation/

**Australia — Spam Act 2003 (consent, express or inferred).** Inferred consent via
conspicuous publication requires that the address is published accessibly, is not
accompanied by a "no commercial messages" statement, and "the subject matter of your
message is directly related to the principal role or function of the recipient"; the ACMA
warns that "publication of contact details does not mean consent has been given" on its
own. Every message must identify who authorised it and how to contact them, and carry an
unsubscribe honoured within 5 business days, functional for 30 days, free, and not
requiring a login. Penalties run to AUD 2.1 million a day for repeat corporate offenders;
Tabcorp paid AUD 4.0 million in April 2025, CBA AUD 7.5 million. https://www.acma.gov.au/avoid-sending-spam ,
https://acma.gov.au/sites/default/files/2024-06/ACMA%20-%20Statement%20of%20Expectations%20-%20Use%20of%20consent%20in%20telemarketing%20~%20marketing%20FINAL_0.DOCX ,
https://www.ashurst.com/en/insights/acma-goes-ham-on-spam-is-your-business-in-breach-of-the-spam-act ,
https://www.sparke.com.au/insights/spam-in-the-spotlight-acma-raises-the-stakes-for-business-messaging/

**Brazil — LGPD (legitimate interest with an LIA; opt-out).** B2B prospecting rests on
Article 7 IX legitimate interest; document the balancing test (purpose, necessity, data
and source, safeguards, reasonable expectation); provide an opt-out and honour it at
once. The ANPD issued outbound-marketing guidance in late 2024 and began enforcing in
2025; fines up to 2% of Brazilian revenue, capped at BRL 50 million per violation. The
CAPEM code is a voluntary self-regulation (opt-out link in every message).
https://puzzleinbox.com/blog/cold-email-brazil-lgpd-2026 ,
https://www.validity.com/blog/towards-lgpd-and-beyond-legal-bases-for-email-marketing/ ,
https://emailoctopus.com/blog/email-marketing-regulations-brazil

**Mexico, Argentina, Chile.** Mexico's LFPDPPP and PROFECO's REPEP registry govern
consumer marketing; B2B email enforcement by INAI "has been limited in practice" — send
with identification and opt-out. Argentina leans to express opt-in; Chile needs clear
notice. Treat the rest of LatAm as "opt-out with records" and check before any large
segment. https://www.mailpro.com/faq/sms-regulations-mexico ,
https://www.reform.app/blog/how-lead-forms-handle-latin-america-consent-rules

**United Arab Emirates — PDPL + TDRA policy (consent-based; B2B unaddressed).** The PDPL
(Federal Decree-Law 45/2021, in force 2 January 2022) gives a right to "object to and
stop the Processing" for direct marketing (Article 17). The TDRA's Unsolicited Electronic
Communications policy defines spam as "Marketing Electronic Communications sent to a
Recipient without obtaining the Recipient's Consent" and puts the duties on telecom
licensees; the 2023 TMTM law gives consumers "the right to choose whether to receive
advertising ... via phone calls, emails or social media". None of these address B2B
specifically; penalties under the older RUEC regime ran to AED 10 million. Free zones
(DIFC, ADGM) have their own data laws. Treat the UAE as consent-preferred: send only
with a clear role link, identification and an instant opt-out, or hold the segment for
consent. https://www.dlapiperdataprotection.com/index.html?t=electronic-marketing&c=AE ,
https://tdra.gov.ae/-/media/About/regulations-and-ruling/EN/Unsolicited-Elrctronic-Commuincations--pdf.ashx ,
https://www.mondaq.com/telecoms-mobile-cable-communications/111212/new-electronic-marketing-consent-regime-for-the-uae

#### 6.2 The switch table

| Jurisdiction                                      | First cold email to a published business address                          | Condition that must be recorded                          | Opt-out deadline                     |
| ------------------------------------------------- | ------------------------------------------------------------------------- | -------------------------------------------------------- | ------------------------------------ |
| US                                                | Allowed (opt-out)                                                         | —                                                        | 10 business days                     |
| Canada                                            | Allowed under implied consent                                             | Publication URL + date, no "no CEM" note, role relevance | 10 business days; link valid 60 days |
| UK                                                | Allowed to companies/LLPs; not sole traders/partnerships                  | Entity type; LIA; Art 14 notice                          | Prompt; valid contact address        |
| France                                            | Allowed (legitimate interest)                                             | Role relevance; source stated at first contact           | Prompt                               |
| Germany, Austria, Italy, Netherlands, Switzerland | **Not allowed without prior consent**                                     | Consent record (NL: keep 5 years)                        | —                                    |
| Other EU                                          | Default to the strict path until checked                                  | —                                                        | —                                    |
| India                                             | Allowed by custom today; **consent for named individuals from ~May 2027** | Build consent record now                                 | Prompt                               |
| Singapore                                         | Allowed with `<ADV>` subject prefix when "in bulk"                        | Label; 30-day valid unsubscribe contact                  | 10 business days                     |
| Hong Kong                                         | Allowed (opt-out)                                                         | Bilingual sender + unsubscribe statements                | 10 working days                      |
| Japan                                             | Allowed only via the published-address exception                          | Publication record, no refusal note                      | Prompt                               |
| Australia                                         | Allowed under inferred consent                                            | Publication record; "directly related" to role           | 5 business days; valid 30 days       |
| Brazil                                            | Allowed (legitimate interest)                                             | LIA on file                                              | Immediately                          |
| Mexico/LatAm                                      | Allowed in practice (opt-out)                                             | Identification                                           | Prompt                               |
| UAE                                               | Consent-preferred; B2B unaddressed                                        | Role link; or hold for consent                           | Immediately                          |

#### 6.3 What a compliant footer carries

Everywhere: the legal entity's name; a physical postal address; one sentence on why this
person is being written to and where the address came from ("your address is published
on <firm>'s site as <role>"); a one-click opt-out link and the words "or reply 'stop'"; a
link to the privacy notice (GDPR/UK GDPR Article 14, LGPD). Then by region: US — a line
that makes the commercial nature plain; Canada — the mailing address plus a phone, email
or web contact, link valid 60 days; UK/EU — the controller, the legitimate-interest basis
and the right to object; Singapore — subject starts `<ADV>`, unsubscribe contact valid 30
days; Hong Kong — sender and unsubscribe statements in Chinese and English; Japan —
sender name and address and the opt-out address, marked as advertising; Australia — who
authorised the message, unsubscribe functional 30 days. A footer is one template per
jurisdiction, chosen by the prospect's jurisdiction field, never hand-typed.

#### 6.4 Records to keep (per prospect, per send, per stop)

- The lawful basis chosen (consent / legitimate interest / implied consent / published
  address) and the jurisdiction rule it came from.
- Source URL, the text seen there (role title), and the capture date — needed for Canada,
  Australia, Japan, France's "inform of the source" and GDPR Article 14's "source".
- Whether the publication carried a "no marketing" statement (Canada, Australia, Japan).
- The LIA document version in force at the time (UK/EU, Brazil).
- Consent records with time, text and method, retained at least five years (Netherlands'
  ACM expectation) — HQ's two-tier consent already stores this; link it to the send.
- Every send: mailbox, domain, template version, footer version, time in recipient's zone.
- Every stop: channel (one-click POST, link, "stop" reply, spam report via FBL, manual),
  time received, time honoured; the deltas are the proof for the 2-day (Google/Yahoo),
  5-day (Australia) and 10-day (US, Canada, Singapore, Hong Kong) clocks.

### 7. Metrics: what good looks like in 2025–26

**Open rate is not a KPI.** Apple Mail Privacy Protection fetches every image through
Apple's proxy "whether or not the message was actually read", so Apple opens read as
100%; "if you're seeing open rates above 50%, assume a meaningful chunk of those are
machines, not buyers". And the pixel that measures it costs placement (§4). Use opens, if
at all, as a deliverability alarm (a sudden drop), never for A/B tests or triggers.
https://emaillistvalidation.com/blog/apple-mail-privacy-protection-impact-on-email-metrics-explained/ ,
https://www.cu.edu/blog/ecomm-wiki/apple-mail-and-artificial-open-rates ,
https://lemlist.com/blog/cold-email-benchmarks/

**Definitions first.** Published benchmarks "vary by as much as 7.6x depending on
methodology": Belkins counts unique human replies ÷ all sends (0.45% over 7.5 million
emails in 2025); Instantly counts replies ÷ delivered (3.43% average, 5–10% "solid", 10%+
"excellent"); Saleshandy reports 3.7%. https://somethinginc.com/blog/cold-email-reply-rate-benchmark-contradiction/ ,
https://instantly.ai/blog/cold-email-reply-rate-benchmarks , https://lemlist.com/blog/cold-email-benchmarks/
HQ should fix its denominators in code: _delivered_ = sent − bounced; _reply rate_ =
human replies ÷ delivered (auto-replies and bounces excluded); _positive reply rate_ =
replies classed interested or meeting ÷ delivered; and report per prospect as well as per
send, because three sends to one person are one opportunity.

**Finance, specifically.** lemlist's 2026 table: Financial Services open 19.7–28%, reply
2–4%, "compliance-cautious"; Legal up to 10%; Agencies 4–7%; SaaS often under 2%.
https://lemlist.com/blog/cold-email-benchmarks/ . Cleverly: Financial Services open ~19–25%,
reply ~3–4%, "relationship-driven, but moderate competition", below Legal (8–10%) and
EdTech (5–7%) because of "inbox saturation among decision-makers".
https://www.cleverly.co/blog/cold-email-benchmarks-by-industry . Another compilation puts
finance at 1–3% baseline, 3–5% for top performers, with 25–35% of replies positive.
https://www.getboomerang.ai/glossaries/cold-email-reply-rate-benchmarks-2026 . Across
industries positive replies are 30–50% of all replies.
https://emailbison.com/blogs/cold-email-open-rates . Multiplying the two ranges, a
finance programme should plan on positive replies from roughly 0.5–1.4% of delivered
sends.

**Bounce and complaint.** Bounce under 2% good, under 1.5% excellent, 5.1% the reported
average (i.e. most lists are dirty). Complaints: "below 0.1% per provider", many aim for
0.05%; 0.3% is the cliff at Google, Yahoo and Microsoft. https://bouncezero.io/email-bounce-rate-guide-2026 ,
https://suped.com/email-deliverability/answers/what-is-an-acceptable-email-complaint-rate-benchmark
At 500 sends a day, 0.1% is one complaint every two days; at 0.3% it is 1.5 a day. The
portal should show complaints as a count with the rate, because at this volume the rate
flickers.

**Meetings per 1,000.** Belkins: meeting conversion 0.4% of sends in the morning windows,
0.1% otherwise — 1 to 4 meetings per 1,000 sends. https://belkins.io/blog/email-deliverability/choosing-the-best-time-to-send-an-email
Cleverly's "meetings booked rate" of 0.5–2.5%, as quoted by lemlist, does not state its
denominator. https://lemlist.com/blog/cold-email-benchmarks/ . Planning figure for this
list (a judgment from the two): 4–10 meetings per 1,000 prospects on a clean,
well-segmented send; 23,000 prospects → roughly 90–230 meetings over six months if
execution is good, a fraction of that if the list is stale or the copy generic. Email drove "50% of appointments" in Belkins' mix, so pair it
with the other channels rather than expecting it to carry the quarter.

**Per-segment comparison.** Compare segments (region × firm type × role × template) on
positive replies per 100 prospects, complaints per 1,000 sends and bounce per 1,000
sends. Sample size matters: distinguishing a 2% from a 3% reply rate with any confidence
needs about a thousand prospects per segment, so most segments of a 23,000 list will only
ever show direction, not significance. Say so in the UI rather than ranking segments on
twenty replies.

### 8. Provider fit

**Brevo.** Its anti-spam policy (Appendix 7 to the General Terms) states a "Zero Tolerance
Policy Towards Spam"; lists "scraped on the internet, acquired or purchased from a
third-party are likely to damage the reputation of Brevo as well as your deliverability",
and their use is strictly prohibited "whether for transactional or marketing electronic
communications"; consent must be active (a checkbox, not pre-ticked) and explicit.
https://www.brevo.com/legal/antispampolicy/ ,
https://www.brevo.com/blog/never-buy-an-email-list/ . (The policy page renders by script
and could not be read directly in this pass; the wording is as indexed by search. Read
the page once by hand before quoting it to anyone.) Reviewers put its enforcement at
~0.1% complaints, ~5% hard bounces or any spam-trap hit, with a frozen account and human
review. https://puzzleinbox.com/blog/brevo-cold-email-allowed-tos-2026 . Published
addresses collected from firm websites are "scraped on the internet" in Brevo's words.
Brevo therefore cannot carry the 23,000, and a cold stream on it would put the sign-in and
receipt stream at risk. Keep Brevo for transactional and the consented newsletter.

**Mailgun, Postmark, Amazon SES.** Mailgun: "Use of contact lists that are bought, rented
or scraped from third-parties is prohibited"; mail "can only be sent to recipients who
have granted clear, explicit and provable consent"; thresholds bounces ≤5%, complaints
≤0.08%, unsubscribes ≤1.4%. https://www.mailgun.com/legal/aup/ . Postmark: "All email
lists ... must be permission-based subscriptions"; "Use of a list that has been purchased
or rented from a third party is prohibited." https://postmarkapp.com/terms-of-service
AWS: may not "distribute, publish, send, or facilitate the sending of unsolicited mass
email or other messages, promotions, advertising, or solicitations". https://aws.amazon.com/aup/
All three enforce with automated bounce/complaint suspension. https://puzzleinbox.com/blog/postmark-vs-mailgun-cold-email-2026
There is no transactional provider that permits cold mail; a dedicated-IP contract does
not change the policy.

**Instantly, Smartlead, lemlist.** These are sequencers plus inbox managers. They connect
_your_ Google Workspace or Microsoft 365 mailboxes (or sell pre-warmed ones), rotate
sends across them, warm them, cap them, and pull replies into one inbox. Their legitimacy
rests on each mailbox being an ordinary business mailbox under its provider's terms and
limits; Google's 2023 action against API-based warm-up (§2) shows the terms are enforced
when a pattern becomes visible. Prices: Instantly Growth $47 a month (unlimited mailboxes
and warm-up, 1,000 contacts, 5,000 emails), Hypergrowth $97 (25,000 contacts, 125,000
emails); Smartlead Base $39 (2,000 contacts, 6,000 sends), Pro $94 (30,000 contacts,
90,000 sends), both with unlimited mailboxes; the mailboxes themselves are bought
separately. https://instantly.ai/pricing , https://www.smartlead.ai/pricing . For 23,000
contacts that means Instantly Hypergrowth or Smartlead Pro, about $95 a month, if the
team chose to rent the mailbox and reply layer instead of building it.

**Google Workspace and Microsoft 365 as the sending layer.** Limits in §2; both say bulk
mail belongs with a third-party provider, both permit normal human-scale sending, and
neither publishes a "cold email" rule beyond their spam and abuse policies. The practical
contract the industry operates under: 25–50 a day per mailbox, real people's names, real
replies handled, complaints near zero. Workspace Business Starter is ₹270 per user per
month on Google's India price list, so 20 mailboxes cost about ₹5,400 a month.
https://workspace.google.com/pricing

**What the team should actually do.**

1. Keep Brevo for transactional and the newsletter, on `quantifyterminal.com` and a brand
   subdomain, with DMARC on the brand domain moving from `p=none` to `quarantine` once
   the reports are clean.
2. Register 7–8 clearly-ours secondary domains; SPF, DKIM (2048-bit), DMARC `p=none` on
   each; redirect to the main site; list them on the site; Workspace with 2–3 mailboxes
   per domain in real team members' names.
3. Warm each mailbox for 3–4 weeks (ramp of real mail first, a network only if needed and
   never on the brand domain); hold 25–30 a day for the first month, 40 at most after.
4. HQ sends over the mailbox's own SMTP with OAuth 2.0 (Google XOAUTH2 / Microsoft), one
   prospect's whole sequence on one mailbox, 10–15 minute randomised gaps, recipient-local
   8–11 windows, 2 per firm domain per day by default.
5. HQ reads each mailbox over IMAP or the provider API for replies and bounces, classifies
   them, stops sequences, resumes after out-of-office, and shows them on the desk.
6. Verify every address within 30 days of sending, with a second verifier for "unknown",
   a sampled catch-all campaign, role addresses suppressed.
7. Jurisdiction switch and footer per prospect; consent capture for the opt-in countries;
   records per §6.4.
8. Either buy a warm-up service per mailbox (MailReach, Warmup Inbox, Instantly's
   warm-up alone) or run a slow real-mail ramp; do not build a warm-up network.

### 9. Wrong for a small team; table stakes for anyone

**Wrong for a 3–10 person team**

- Sending cold from the brand domain or through Brevo. One complaint spike and the
  product's own mail follows it into spam. (§1, §8)
- A dedicated IP. Cold and under-used below ~50,000 a month; it adds warm-up and
  removes the one advantage of Workspace/365 (their IP reputation). (§1)
- Buying a 50-mailbox farm to do 23,000 in eight weeks. The 2026 founder playbook
  describes exactly this — "$2,400/month on infrastructure" and fewer conversations than a
  simpler set-up. https://www.indiehackers.com/post/the-cold-email-infrastructure-playbook-the-math-most-founders-get-wrong-2026-ae83bbd596
- 100+ a day per mailbox. "No version of 2026 exists where one mailbox sends hundreds of
  cold emails daily and survives." (same source)
- HTML templates, images, tracking pixels, five links, a signature banner. (§4)
- Spintax and "AI personalisation" at 500 a day. The data fragments and the lift is not
  there at this volume. (§4)
- Full-autopilot AI replies to fund managers. Human-in-the-loop drafts are the sane
  setting for a regulated, relationship-driven audience. (§5)
- Building an engagement (warm-up) network. Google has already shown what it does to
  those. (§2)
- Treating the footer as compliance. The country switch is the compliance; the footer is
  the receipt. (§6)
- Ranking segments on twenty replies. (§7)

**Table stakes**

- SPF, DKIM (2048), DMARC with alignment on every sending domain; TLS; PTR records.
- Separate domains per stream: transactional, newsletter, cold.
- Verification before every wave; catch-all sampled; role addresses out; bounce under 2%.
- 25–50 a day per mailbox, 2–3 mailboxes per domain, randomised 10–15 minute gaps,
  recipient-local morning windows, ≤2–3 per firm per day.
- Plain text, one optional un-tracked link, real name, real Reply-To, threads intact.
- One-click unsubscribe headers plus an in-body opt-out that accepts "stop" replies,
  honoured within 48 hours, and every stop logged with its clock.
- Reply detection that stops the sequence on any human reply and resumes after
  out-of-office.
- Per-sender and per-campaign breakers on bounces, blocks and complaints; a pause is
  cheaper than a listing.
- Jurisdiction-aware sending with records of basis, source and date.
- Replies, positive replies, bounces and complaints as the KPIs; opens as an alarm only.

### 10. Ranked build list for HQ

S = days, M = a week or two, L = several weeks. Items HQ already has are not listed;
items that extend something it has say so.

1. **Mailbox pool and rotation** — L — The sending layer the whole plan rests on:
   connect Workspace/365 mailboxes by OAuth, assign each prospect's sequence to one
   mailbox for life, per-mailbox daily cap, per-mailbox randomised 10–15 minute gap,
   per-domain cap, pool-wide "days to drain" display. Without it the 23,000 cannot be sent
   at all without Brevo. (§2, §8)
2. **Jurisdiction switch on every send** — M — Each prospect carries a jurisdiction; the
   send step is allowed, allowed-with-conditions (`<ADV>`, bilingual footer, published-
   address record) or blocked-pending-consent per the §6.2 table; the block is a reason
   the operator sees, not a silent skip. Extends two-tier consent. This is the law, and it
   is the difference between opt-out countries and Germany.
3. **Verification pipeline before send** — M — Verifier API (one cheap primary, a second
   for "unknown"), results stored on the address with date, re-verify if older than 30
   days, hard-block invalid, suppress role addresses by default, route catch-all to a
   separate sampled campaign. Bounces are the first thing that kills a domain. (§3)
4. **Reply ingestion and auto-stop** — L — IMAP/API read of every pool mailbox; match by
   `In-Reply-To`/`References`, then address and firm; any human reply ends the sequence;
   a reply from a colleague at the same firm pauses the original for review. Every
   sequencer does this; without it HQ keeps mailing people who answered. (§5)
5. **Reply classification with human-in-the-loop** — M — Interested / not interested /
   out of office (with return date) / wrong person (with referral) / stop / bounce /
   other; "not interested" and "stop" write to suppression; the suggested label is
   confirmed by a person. (§5)
6. **Out-of-office pause and resume** — S — Parse the return date, pause that address
   only, resume one to two business days after; 14-day default for "until further
   notice"; capture the alternate contact as a referral candidate with its own basis.
   (§5)
7. **Sender block detection separate from the bounce breaker** — S — Classify 5xx with
   spam/policy text and Gmail `421-4.7.28` as "we are being blocked": pause the mailbox
   and its domain, alert, do not touch the address. Extends the bounce breaker. (§1, §3)
8. **Complaint and stop ledger with clocks** — S — Every stop with channel and received/
   honoured timestamps; counts as well as rates; dashboard lines at 0.05%, 0.1%, 0.3%
   and at 2-day, 5-day, 10-day honouring. The evidence for every regulator in §6. (§6.4)
9. **Plain-text enforcement for cold templates** — S — Cold templates are text/plain by
   default; a link count above one, any image, any tracking pixel or any HTML formatting
   is a lint failure the author must override with a reason. (§4)
10. **Open tracking off for cold; replies and positives as the headline** — S — Remove
    the pixel from cold sends; campaign cards lead with delivered, replies, positive
    replies, bounces, complaints; opens shown only as a deliverability alarm with the MPP
    caveat. (§4, §7)
11. **Per-firm cap default 2, per-day, pool-wide** — S — Lower HQ's three to two by
    default and count across all mailboxes and campaigns, not per campaign. (§2)
12. **Recipient-local morning windows per region** — S — 8–11 local, Tuesday–Thursday
    preferred, Monday/Friday overflow, no weekends; a daily budget split across India,
    Europe, US East, Singapore/HK and São Paulo. Extends time windows. (§4)
13. **Warm-up state per mailbox** — M — Age, ramp day, current cap, placement test
    result; a mailbox under 3 weeks cannot join a campaign; caps step 30 → 40 only after a
    clean month; a "resting" state for a mailbox or domain that was blocked. (§2)
14. **Source and basis record per prospect** — S — Source URL, captured title, capture
    date, "no marketing" statement flag, lawful basis, LIA version; shown on the record
    and in the footer sentence. Needed for Canada, Australia, Japan, France, GDPR Art 14.
    (§6.4)
15. **Footer templates by jurisdiction** — S — One template per rule set with the
    required elements (postal address, `<ADV>`, bilingual, 60-day link, controller,
    opt-out, source sentence), chosen automatically, never edited per send. (§6.3)
16. **"Stop" reply as an unsubscribe** — S — A reply whose body is "stop", "unsubscribe",
    "remove" (any case, any language in the pool) is honoured like the one-click POST and
    logged with the same clock. (§4)
17. **Catch-all campaign type** — S — A campaign flagged catch-all sends 5–10% first,
    halts if hard bounces exceed 3%, and never exceeds 5% of the day's volume. (§3)
18. **Campaign slow ramp** — S — New campaign starts at 5–10 per mailbox per day and adds
    2 a day to the mailbox cap; a ramp of more than 20% a day needs an override. (§4)
19. **Consent capture for opt-in countries** — M — A per-jurisdiction consent request
    path (a landing page or an existing-relationship record) so German, Dutch, Swiss,
    Austrian, Italian and, from 2027, Indian prospects can be unblocked with a record that
    meets the five-year retention expectation. Extends two-tier consent. (§6)
20. **Thread-correct follow-ups** — S — `In-Reply-To` and `References` on bumps two and
    three; a bump sends from the same mailbox as the opener or not at all; optional new-
    thread break-up as step four with its own subject. (§4)
21. **Empty-token guard** — S — Any personalisation token that renders empty blocks the
    send and queues the record for enrichment. (§4)
22. **Segment report with sample-size honesty** — M — Positive replies per 100 prospects,
    complaints and bounces per 1,000 sends by region × firm type × role × template, with
    confidence shown and segments under ~300 prospects marked "direction only". (§7)
23. **Domain and mailbox health board** — M — Per domain: age, DMARC policy, Postmaster
    compliance status if any data, SNDS enrolment, bounce/block/complaint counts, state.
    Per mailbox: cap, sent today, gap, reply backlog. (§1, §2)
24. **Postmaster, SNDS/JMRP and Yahoo CFL enrolment checklist** — S — Per domain, with
    the `Feedback-ID` header on sends to Gmail recipients; expect blanks at HQ's volume
    and say so on the board. (§1)
25. **Desk item for a reply thread** — M — The thread as a desk item with interested /
    book / stop / wrong person / forward verbs, assignment, and a draft that sends from
    the original mailbox. Extends the desk. (§5)
26. **Per-domain DMARC progression** — S — Secondary domains start `p=none`; the brand
    domain moves to `quarantine` when reports are clean; a reminder on the board. (§1)
27. **Suppression by firm** — S — A "do not contact this firm" entry that stops every
    prospect at the domain, for the firms that say so. (§5)
28. **Volume sanity breaker** — S — A pool-wide hard ceiling (e.g. 1,000 a day) and a
    per-mailbox ceiling (50) in code, so a loop cannot reach the Workspace or Exchange
    limits or a bulk-sender threshold. (§2)

---

#### Appendix — sources by section

§1 Google sender guidelines https://support.google.com/a/answer/81126 · Google FAQ
https://support.google.com/a/answer/14229414 · Postmaster data https://support.google.com/mail/answer/9981691 ·
Postmaster v2 https://blueshift.com/blog/google-postmaster-tools-v2/ · Gmail FBL
https://support.google.com/mail/answer/6254652 · Gmail SMTP errors https://support.google.com/a/answer/3726730 ·
Yahoo FAQ https://senders.yahooinc.com/faqs/ · Yahoo CFL https://senders.yahooinc.com/complaint-feedback-loop/ ·
Microsoft post https://techcommunity.microsoft.com/blog/outlook/strengthening-email-ecosystem-outlook%E2%80%99s-new-requirements-for-high%E2%80%90volume-senders/4399730 ·
Microsoft BCL https://learn.microsoft.com/en-us/defender-office-365/anti-spam-bulk-complaint-level-bcl-about ·
SNDS https://sendersupport.olc.protection.outlook.com/ · RFC 8058 https://www.rfc-editor.org/rfc/rfc8058.html ·
Reputation recovery https://www.suped.com/knowledge/email-deliverability/sender-reputation/how-long-does-it-take-to-recover-email-deliverability-after-ip-blacklisting-or-poor-domain-reput ·
Spam traps https://bouncezero.io/blog/spam-traps-explained

§2 Instantly https://instantly.ai/blog/7-key-benefits-of-slow-ramp-warmup-cold-email-domains/ ·
Smartlead https://www.smartlead.ai/blog/how-many-cold-emails-per-day ,
https://api.smartlead.ai/api-reference/email-accounts/warmup-settings · lemwarm
https://help.lemlist.com/en/articles/8178427-set-up-lemwarm-and-start-warming-your-inbox ·
MailReach https://www.mailreach.co/blog/gmail-warmup · GMass shutdown https://www.gmass.co/blog/warmup-shutting-down/ ·
Woodpecker calculator https://woodpecker.co/cold-email-infrastructure-calculator/ · Instantly domain
limits https://help.instantly.ai/en/articles/12578026-domain-send-limits · Workspace limits
https://knowledge.workspace.google.com/admin/gmail/gmail-sending-limits-in-google-workspace ·
Exchange limits https://learn.microsoft.com/en-us/office365/servicedescriptions/exchange-online-service-description/exchange-online-limits

§3 Hunter accept-all https://hunter.io/blog/ultimate-guide-accept-all-catch-all/ · bounce
benchmarks https://bouncezero.io/email-bounce-rate-guide-2026 · role addresses
https://www.suped.com/knowledge/email-deliverability/sender-reputation/what-are-the-deliverability-risks-and-handling-practices-for-role-based-email-addresses ·
decay https://www.landbase.com/blog/data-decay-rate-statistics · Smartlead bounce protection
https://helpcenter.smartlead.ai/en/articles/274-what-is-high-bounce-rate-auto-protection-in-smartlead

§4 Hunter HTML https://hunter.io/blog/is-html-harming-your-cold-email-deliverability/ · Hunter
tracking https://hunter.io/cold-email-guide/email-tracking · MailReach spintax
https://www.mailreach.co/blog/spintax-cold-email · Belkins timing
https://belkins.io/blog/email-deliverability/choosing-the-best-time-to-send-an-email · Woodpecker
personalisation https://woodpecker.co/blog/sales-email-statistics/ · follow-ups
https://instantly.ai/blog/follow-up-emails-vs-no-followup/ · Smartlead gaps
https://helpcenter.smartlead.ai/en/articles/77-how-does-the-minimum-time-gap-on-the-email-level-affect-campaign-distribution

§5 Instantly Unibox https://help.instantly.ai/en/articles/6576561-how-to-manage-the-unibox-best-practices-on-how-to-reply-to-leads ·
Instantly OOO https://help.instantly.ai/en/articles/9713093-ooo-resume-ai-smart-pause-for-out-of-office ·
Smartlead categories https://helpcenter.smartlead.ai/en/articles/51-lead-categories · Smartlead OOO
https://helpcenter.smartlead.ai/en/articles/209-auto-restart-ooo-based-on-email-copy · lemlist OOO
https://help.lemlist.com/en/articles/13702727-out-of-office-detection

§6 FTC https://www.ftc.gov/business-guidance/resources/can-spam-act-compliance-guide-business · CASL
https://laws-lois.justice.gc.ca/eng/acts/E-1.6/FullText.html · ICO
https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/guide-to-pecr/electronic-and-telephone-marketing/electronic-mail-marketing/ ·
GDPR Art 14 https://gdpr-info.eu/art-14-gdpr/ · CNIL https://www.cnil.fr/fr/la-prospection-commerciale-par-courrier-electronique ·
Germany https://overloop.com/blog/b2b-cold-email-germany-gdpr-compliance · Netherlands
https://imisofts.com/blog/cold-email-laws-netherlands/ · Switzerland https://www.bakom.admin.ch/en/when-is-mass-sending-allowed ·
India https://static.pib.gov.in/WriteReadData/specificdocs/documents/2025/nov/doc20251117695301.pdf ,
https://trai.gov.in/sites/default/files/2025-02/Regulation_12022025.pdf · Singapore https://sso.agc.gov.sg/Act/SCA2007 ·
Hong Kong https://www.gov.hk/en/residents/communication/infosec/guidelines/antispam.htm · Japan
https://www.soumu.go.jp/main_sosiki/joho_tsusin/d_syohi/m_mail.html · Australia https://www.acma.gov.au/avoid-sending-spam ·
Brazil https://puzzleinbox.com/blog/cold-email-brazil-lgpd-2026 · UAE
https://www.dlapiperdataprotection.com/index.html?t=electronic-marketing&c=AE

§7 lemlist benchmarks https://lemlist.com/blog/cold-email-benchmarks/ · Instantly benchmarks
https://instantly.ai/blog/cold-email-reply-rate-benchmarks · Cleverly by industry
https://www.cleverly.co/blog/cold-email-benchmarks-by-industry · benchmark contradiction
https://somethinginc.com/blog/cold-email-reply-rate-benchmark-contradiction/ · Apple MPP
https://emaillistvalidation.com/blog/apple-mail-privacy-protection-impact-on-email-metrics-explained/

§8 Brevo https://www.brevo.com/legal/antispampolicy/ · Mailgun https://www.mailgun.com/legal/aup/ ·
Postmark https://postmarkapp.com/terms-of-service · AWS https://aws.amazon.com/aup/ · Instantly
pricing https://instantly.ai/pricing · Smartlead pricing https://www.smartlead.ai/pricing ·
MailReach pricing https://www.mailreach.co/pricing · Warmup Inbox pricing
https://www.warmupinbox.com/pricing/ · Workspace pricing https://workspace.google.com/pricing

§9 https://www.indiehackers.com/post/the-cold-email-infrastructure-playbook-the-math-most-founders-get-wrong-2026-ae83bbd596

**Not read directly in this pass.** These pages refused or failed a direct read; what this
file says about them comes from search-result extracts or the secondary source named
beside them, and each should be opened by hand before it is relied on for a decision.

- Microsoft's Tech Community post on high-volume senders (HTTP 403) — requirements taken
  from Inbox Ally's and EasyDMARC's summaries.
- Brevo's anti-spam policy (page renders by script) — wording as indexed by search.
- The CRTC's implied-consent guidance (HTTP 403) — the statute itself was read instead.
- Singapore's Spam Control Act on the statutes site (HTTP 403) and IMDA's best-practices
  page (returned no body) — the bulk thresholds, `<ADV>` label and 10-business-day rule
  are from search extracts of those pages.
- The ACMA's "Avoid sending spam" page (timed out twice) — rules from search extracts of
  that page and the ACMA's Statement of Expectations.
- ZeroBounce, NeverBounce, MillionVerifier, Bouncer and Reoon prices are from 2026 review
  and listing pages, not the vendors' own price pages; confirm at checkout.

---

## What the best tools do that HQ does not — leads, engagement, GTM analytics, cadence, data operations, inbox, integrations, mobile (research, 3 October 2026)

HQ is to be finished to the standard of the best "company operating system" tools for a
B2B software company of three to ten people. This report finds what is missing or weak in
eight areas: (a) lead management and prospecting at scale, (b) sales engagement and
account-based work, (c) go-to-market analytics, (d) the operating cadence, (e) data
quality operations, (f) the inbox, (g) integrations, (h) mobile.

**Method.** Sixty-four web searches and twenty vendor pages read on 3 October 2026 — help
centres, changelogs and docs first; third-party reviews only where the vendor page was
unreachable, and marked "reported". Five essays on how small teams run the business. No
logins. Where a page would not load, the quote comes from the search excerpt and is
marked "reported". Three things in the brief could not be sourced before the session's
search allowance ran out and are left out rather than guessed: Notion as a company-OS
pattern, call-data research on single-threaded deals, and a Lenny's Newsletter essay (the
one found is behind a paywall).

**Baseline.** The feature list in the brief was checked against `docs/PLAN.md` (§4 and
§5) and the portal's API clients in `src/lib/api/`. HQ holds more than the brief listed,
and that changed many marks. Already built, and in several cases ahead of the tools
studied:

- **Inbound leads with a clock**: a first-reply target in minutes, waiting minutes, an
  overdue flag on Home, the list and the record; the weekly pack reports the median first
  reply and how many were answered within target; disqualifying asks for a reason;
  conversion makes the company, person and deal; a daily retention run anonymises leads
  left untouched.
- **Home as a working page**: leads awaiting a first reply, tasks overdue and due today,
  meetings today and meetings with no outcome, deals neglected, rotting or with no next
  step, renewals due, approvals awaiting me, outbound replies waiting, security events.
- **Pipeline inspection**: a forecast category and a push count per deal; a nightly
  picture so "what changed" compares each deal with itself; the quarter's forecast per
  currency with target, won, gap, coverage and a suggested call; calls frozen with their
  deals, then accuracy and bias for past quarters; competitors with battlecards; win/loss
  interviews; stakeholder coverage with a single-threaded warning.
- **Funnel**: per stage — entered, advanced, won, lost, still here, conversion and median
  days; win rate; nightly pipeline history.
- **Outbound**: sequences with business-day delays, task steps, exits with reasons, a
  replies page with labels, caps, windows, a bounce breaker, seed inboxes, second-person
  approval, mailing lists from CSV in parts of 1,000 with their own columns.
- **Platform**: an Inbox (reasons, folding, snooze, follow, remind me, quiet hours,
  digest), shared saved views, a filter builder, grouping, a peek pane, `j`/`k` table
  keys, bulk change with undo (owner included), automations, signed outbound webhooks to
  the Standard Webhooks spec, stage and validation rules, custom fields, comment threads,
  AI assists (brief me, filter in plain words, reply drafts, tasks from meeting notes).
- **Customer success**: signals with evidence and never a score, onboarding plans,
  renewal playbooks dated back from the notice date, feature requests, cancel reasons.
- **Quotes**: discount approval, a recorded signature, and a mutual action plan.

Round-robin routing, territories, AI deal scores, health scores, CSAT, LTV, storing pay,
whole-mailbox sync as a first step and native mobile apps are on the team's own
"deliberately not built" list. This research agrees with every one.

**Marks.** **HAS** (built), **WEAK** (built, but short of the best tools in a way that
matters at this size), **LACKS** (not built). Effort: S ≤ 2 days, M ≤ 1–2 weeks, L more.
Terms are defined where they first appear.

**The one-paragraph finding.** HQ's lead is an inbound enquiry, and that half is strong.
What does not exist is a home for tens of thousands of outbound prospects. Today they can
only sit in a static mailing list: no stage, no owner, no fit, no verification, no
duplicate check against leads, and no way in for leads by CSV at all (the importer covers
companies and people, 500 rows at a time). Everything else in this report is smaller than
that. The second gap is the weekly rhythm: the numbers exist, but nothing gives each a
goal, an owner and an action that survives to next week. The third is the outside world:
billing, booking, signing and the phone.

---

### (a) Lead management and prospecting at scale

A "lead" here is a person or firm not yet qualified. "Prospecting" is finding and
first-contacting them. "At scale" means tens of thousands of rows, bought or built,
worked by one to three people.

1. **A lead is an attempt, not a person — and prospects need their own place.** HubSpot's
   lead object is "a secondary object (like deals or tasks)" attached to a contact or
   company; "one contact can have multiple leads created over time as you make different
   attempts to engage them" (https://www.blendb2b.com/blog/hubspot-lead-object-explained,
   https://hublead.io/blog/hubspot-leads-object). The person keeps their history; each
   approach has its own stage and outcome. **HQ: HAS** this for inbound (the lead is the
   enquiry; conversion makes the person). **LACKS** it for outbound: a cold prospect is a
   row in a mailing list and nothing more.
2. **Lists are first-class, with their own fields.** In Attio, adding a record to a list
   creates a "list entry"; "the same record can appear more than once in a single list";
   list attributes "live on the list entry (for example, Applying for in the Recruiting
   list)" while object attributes live on the record
   (https://attio.com/help/reference/attio-101/attios-data-model/understanding-lists).
   That is how one person sits in three campaigns with a different stage in each.
   **HQ: WEAK.** Mailing lists hold members and up to 20 custom columns, usable in
   templates as `{{custom.<column>}}`. A member has no stage, owner, last touch or fit,
   and the list page is not a working view.
3. **A staging inbox that is not the pipeline.** Pipedrive's Leads Inbox is "a staging
   area for unqualified prospects"; leads carry labels, can be archived "until you're
   ready to use it", and "Convert to deal" carries "any person, organization, notes or
   files data" across (https://support.pipedrive.com/en/article/leads-inbox). **HQ: HAS**
   (stages new → attempting → connected → qualified / disqualified with a reason;
   conversion; bulk change; filters). **WEAK** on one thing: "nurture until a date". A
   lead can be reminded through the Inbox but stays in the working lists meanwhile.
4. **Dynamic views that drive the day.** Close's Smart Views are "saved Lead Filters";
   "leads dynamically flow in and out"; teams keep one each for "untouched leads,
   follow-ups, email cadences, and warm opportunities"
   (https://help.close.com/docs/smart-views). Close's "AI Search" turns a question into
   a filtered list (https://www.close.com/blog/close-features-sell-smarter-2025).
   **HQ: HAS** — shared saved views, the filter builder, grouping, filter in plain words,
   `j`/`k`, the peek pane.
5. **Import at scale, reviewed before it lands.** Close scans "for errors during field
   assignments before importing"
   (https://www.close.com/blog/close-features-sell-smarter-2025). Attio prompts a merge
   "when Attio detects them using domain for companies and email address for people"
   (https://attio.com/help/reference/managing-your-data/records/merge-and-delete-records).
   Twenty, the open-source CRM, lists "import and export your data via CSV or API" as a
   base capability
   (https://docs.twenty.com/user-guide/getting-started/capabilities/what-is-twenty).
   **HQ: LACKS** a leads import (leads arrive by form or by hand). **WEAK** for companies
   and people: 500 rows per run ("run it again for the rest"), known records skipped
   rather than "fill blanks / overwrite", no batch to undo. The mailing-list importer
   already does it properly — parts of 1,000, every row accounted for — and is the path
   to reuse.
6. **Enrichment with a waterfall and provenance.** "Waterfall enrichment" asks several
   data providers in turn and keeps the first verified answer. Clay aggregates "over 75
   enrichment providers" and bills by credits (https://www.eesel.ai/blog/clay-reviews,
   https://enrich.so/blog/clay-review). A review reports Apollo made waterfall "the
   default" in December 2025 and extended it to job changes in early 2026
   (https://www.syncgtm.com/blog/apollo-io-review). HubSpot's Breeze Intelligence fills
   "job title, company size, industry, and revenue"
   (https://www.eesel.ai/blog/breeze-intelligence-data-enrichment). folk sells "1-click
   enrichment" from a LinkedIn or Gmail sidebar
   (https://martech.zone/folk-sales-pipeline-crm). **HQ: LACKS.** Needed: an adapter
   (provider never named in the UI), one or two providers in order, provider and time
   stored per field, human values never overwritten, a cost counter.
7. **Fit and engagement kept apart, rules first.** HubSpot's 2025 scoring tool models
   "Fit (who they are) and Engagement (what they do) separately or together", with "time
   frames, decay, thresholds"; AI-built scores are Enterprise-only
   (https://www.iodigital.com/en/insights/blogs/everything-you-need-to-know-about-hubspot-new-lead-scoring-model,
   https://knowledge.hubspot.com/scoring/build-lead-scores-with-ai). **HQ: LACKS** — and
   the right build is not a number. A fit band (A/B/C) from a visible checklist of ICP
   fields ("ICP" = ideal customer profile: segment, size, country, role), and an
   engagement line that lists the facts (last reply, last meeting, last visit), fits HQ's
   rule that every figure is a plain ratio of things on the page. No built-in tier or
   ICP field exists on the company today (an admin could add a custom one).
8. **Signals, and plays that act on them.** Clay's signal list: career movement (job
   changes, promotions, new hires), web intent, social listening, news and funding,
   technology stack, product usage, custom; a signal can "auto-generate new prospects,
   update CRM lead scoring or queue AI emails", bundled into "prioritized Slack messages
   per account" (https://www.clay.com/signals). Apollo's play "Engage decision makers who
   just changed jobs" fires on a title change, enriches email and phone, alerts "by email
   and Slack" and enrols a "5-6 touch point" sequence; "once activated, this Play runs
   continuously"
   (https://www.apollo.io/academy/plays/engage-decision-makers-who-just-changed-jobs).
   Instantly identifies "US-based company visitors" at one credit each
   (https://instantly.ai/llms.txt). **HQ: LACKS** for prospects. **HAS** the right shape
   for customers (signals with evidence). Feed prospects first from first-party events —
   a trial sign-up, a pricing-page visit from a known domain, product usage.
9. **Bought databases.** Instantly claims "450M+ B2B leads" (https://instantly.ai/llms.txt);
   lemlist is reported at "650M+" (https://pipeline.zoominfo.com/sales/lemlist-features).
   **HQ: LACKS, by design.** Buy an export, import it with its source, keep what is used.
10. **Speed to lead.** The time from an inbound enquiry to the first human touch. The
    InsideSales/MIT study found a reply within 5 minutes made a lead "21x more likely to
    qualify" than at 30 minutes; a Drift test of 433 software companies found "only 7%
    replied within five minutes"; Workato tested 114 B2B companies (as summarised in
    https://www.guideflow.com/blog/speed-to-lead and
    https://www.revenuehero.io/blog/what-is-speed-to-lead;
    https://workato.com/the-connector/lead-response-time-study). **HQ: HAS** — target,
    clock, overdue flag, weekly median, answered-within-target. Two refinements only: a
    target per source (five minutes for a demo request, an hour for a download), and a
    booked meeting counting as the first touch.
11. **Routing.** HubSpot's "Rotate record to owner" spreads leads across a pool
    (https://community.hubspot.com/t/how-to-automatically-assign-contacts-and-leads/114021).
    Guides agree round robin "works fine" for a small team and rules matter "once you're
    past about 5 reps" (https://withsurface.com/blog/how-to-set-up-round-robin-lead-assignment,
    https://prospeo.io/s/lead-distribution). **HQ: deliberately not built**, rightly.
    **HAS** what a three-seller team needs: "Unowned" on the lists and bulk owner change
    with undo.
12. **Lawful basis (India).** Under the Digital Personal Data Protection Act 2023 and
    the 2025 Rules, marketing is reported to "require prior opt-in consent, even in a B2B
    context"; the notice must itemise the data, the purpose, the contact, how to withdraw
    and how to complain; most rules phase in over 18 months
    (https://www.ey.com/content/dam/ey-unified-site/ey-com/en-in/pdf/2025/11/ey-india-dpdp-act-2023-and-rules-2025-pov.pdf,
    https://www.mondaq.com/from-draft-to-reality-key-changes-in-indias-dpdp-rules-2025/1775140,
    https://www.hoganlovells.com/en/publications/indias-digital-personal-data-protection-act-2023-brought-into-force-).
    **HQ: HAS** two consent tiers ("DE/AT need a yes"), suppression, a privacy desk with
    India's 90 days, and lead retention. **WEAK**: India is not in the "needs a yes" tier.
    Take advice, then add it; the mechanism exists.
13. **The suite at the low end.** Salesforce's Starter Suite (successor to Essentials,
    August 2023) bundles sales, service and marketing with guided onboarding at a
    reported $25 per user per month, and logs email and calendar automatically
    (https://www.smb-gr.com/cloud-computing/salesforces-evolving-smb-strategy-from-starter-suite-to-pro-suite-and-beyond/).
    **HQ: HAS** the breadth and far more depth; **LACKS** automatic email capture ((g)1).

### (b) Sales engagement and account-based workflows

"Sales engagement" is the sequence of emails, calls and tasks that works a lead.
"Account-based" means working a firm — several people, one plan — not a list of
individuals.

1. **Sequences that exit on their own and can be sent for someone else.** Attio
   Sequences "automatically exits contacts when they reply or book a meeting" and lets a
   teammate be a "delegated sender" so outreach continues while the owner is away
   (https://attio.com/blog/introducing-attio-sequences,
   https://attio.com/help/reference/automations/sequences/create-a-sequence). HubSpot:
   "each sequence is limited to 10 email templates, although you can add as many task
   reminders as needed", delays up to 90 business days, exit on a reply or a booked
   meeting, task steps for calls and LinkedIn; Professional tier
   (https://knowledge.hubspot.com/sequences/create-and-edit-sequences). **HQ: HAS** —
   business-day delays, reply threading, task steps, exits from CRM events with reasons,
   a logged inbound email ending the sequence and pausing the firm, thirteen enrolment
   refusals previewed. **LACKS** delegated sending (not found in the plan or the code).
2. **Conditions and branches.** lemlist: "if a lead doesn't reply to an email, lemlist
   can send a LinkedIn message instead" (https://www.lemlist.com/multichannel,
   https://help.lemlist.com/en/articles/4686779-add-linkedin-steps-to-your-sequence).
   Smartlead's "subsequences" start from a reply category: mark a reply "Requested info"
   and the lead joins the "Send more info" drip
   (https://www.smartlead.ai/blog/smartlead-is-best-cold-email-outreach-partner).
   **HQ: LACKS** (no step condition found). One branch is enough at this size: "reply
   labelled X → enrol in sequence Y".
3. **One reply queue with labels.** Instantly's Unibox centralises replies, auto-labels
   them ("Interested, Closed-Won, Not Interested") and offers "reply, forward, snooze,
   archive" and "team assignment and handoff" (https://instantly.ai/llms.txt).
   **HQ: HAS** (`/mail/replies`, with Interested and Not now labels).
4. **Deliverability as a product.** Instantly runs a warm-up network of "4.2M+
   accounts", "inbox placement testing" and "Server & IP Sharding & Rotation"
   (https://instantly.ai/llms.txt); Close added per-account "email sending limits"
   (https://www.close.com/blog/close-features-sell-smarter-2025). **HQ: HAS** the right
   subset — caps, windows, one first email per firm domain per day, three a day per
   domain, a bounce breaker, auto-pause on complaints, seed inboxes, a provider check on
   each sender. **LACKS** address verification before the first send ((e)4).
5. **Target accounts and buying roles.** HubSpot's "Target account" is a checkbox on
   the company; "Buying role" marks each contact "Decision Maker, Budget Holder, and
   Blocker"; the target accounts page shows progress and offers "Start outreach" per
   contact; Professional tier (https://knowledge.hubspot.com/records/use-target-accounts,
   https://knowledge.hubspot.com/branding/get-started-with-account-based-marketing-in-hubspot).
   **HQ: HAS** roles (decision maker, champion), stakeholder coverage and the
   single-threaded warning. **LACKS** a target tier on the company, a short account plan
   (who to reach, next step) and a "target accounts not touched in 14 days" list.
6. **Plays: a trigger that enrols.** Attio workflows "automatically enroll recipients"
   in a sequence (https://attio.com/blog/introducing-attio-sequences); Apollo chains
   trigger → enrich → alert → sequence ((a)8). **HQ: HAS** automations (created, field
   changed, stage entered, N days before a date, a button; task, field, notification,
   webhook). **LACKS** an "enrol in sequence" action and a signal trigger.
7. **Calls, SMS, WhatsApp inside the record.** Close is reported to build "calling,
   email, SMS, and WhatsApp into the lead record" with a power dialer
   (https://pipeline.zoominfo.com/sales/close-crm-features, https://close.com/communication);
   lemlist adds LinkedIn voice notes and WhatsApp (https://www.lemlist.com/multichannel).
   **HQ: LACKS**, and should (see "wrong to build"). A call is a logged activity.
8. **Booking a meeting from the lead.** HubSpot's sales workspace books "directly from
   the Schedule tab" (https://knowledge.hubspot.com/prospecting/use-the-prospecting-workspace).
   Cal.com routing forms route "based on Salesforce ownership" by email or domain, with
   attribute weights and a fallback to "a subset of team members"
   (https://cal.com/help/routing/routing-overview); Calendly can "look up and match known
   leads to assigned account owners from Salesforce and HubSpot" and report conversion
   by form (https://calendly.com/features/routing). **HQ: HAS** meetings from Google
   Calendar with outcomes and no-shows. **LACKS** a booking link, and a booked meeting
   does not create or first-touch a lead.
9. **Buyer rooms and mutual action plans.** A "digital sales room" is one private link
   the buyer opens for the quote, documents, people and next steps; a "mutual action
   plan" is the shared checklist to signature. Dock has "comments, mutual action plans,
   and task tracking"; Trumpet's "Pods" include plans "with the free tier", where "buyers
   tick off tasks, upload documents" (https://www.flowla.com/blog/dock-vs-trumpet,
   https://sendtrumpet.com/blog-posts/what-is-a-digital-sales-room-a-comprehensive-guide);
   Papermark is open source with "engagement analytics"
   (https://papermark.io/blog/what-is-digital-sales-room). **HQ: HAS** the action plan
   ("steps on both sides with dates") and the order form. **LACKS** the buyer's link and
   any record of who opened what.
10. **Snippets and templates.** Close inserts saved content with "/"
    (https://www.close.com/blog/close-features-sell-smarter-2025). **HQ: HAS.**

### (c) Go-to-market analytics

"Go-to-market (GTM) analytics" means the numbers that say whether selling is working:
conversion between stages, speed, coverage, forecast, and where customers came from.

1. **Stage conversion, win/loss and duration.** Pipedrive's Insights has "Funnel
   conversion" and "Win/loss conversion" by "owner, organization and time periods", and
   a "deal duration" report
   (https://support.pipedrive.com/en/article/insights-reports-deal-conversion,
   https://support.pipedrive.com/en/article/insights-reports-deal-duration). Attio ships
   "Funnel, Time in Stage and Stage Changed reports" and "Historical reports"
   (https://attio.com/help/reference/managing-your-data/dashboard-and-reports/reports).
   **HQ: HAS** all of it, plus the nightly "what changed" comparison. **WEAK** on two
   cuts: the funnel by lead source and by created-month cohort, and one chain from lead
   to meeting to deal to won by source.
2. **Benchmarks to read the funnel against.** FirstPageSage's table for firms selling
   to small companies ($1M–$10M revenue): visitor → lead 2.3%, lead → MQL 37%, MQL → SQL
   32%, SQL → opportunity 40%, opportunity → close 46%
   (https://firstpagesage.com/reports/b2b-saas-funnel-conversion-benchmarks/). An MQL is
   a marketing-qualified lead (fits and showed interest); an SQL is a sales-qualified
   lead (a seller agrees it is worth a conversation). **HQ: LACKS**; optional, and only
   as a faint reference line, never a target.
3. **Pipeline coverage and sales velocity.** "Pipeline coverage" is open pipeline for a
   period divided by the target. The old "3x" rule comes from 1990s enterprise software;
   the honest ratio is "1 divided by your historical win rate" (a 40% win rate needs
   2.5x) (https://www.landbase.com/blog/pipeline-coverage-ratio-calculate-2026,
   https://www.rox.com/articles/how-to-calculate-pipeline). "Sales velocity" =
   (opportunities × average deal size × win rate) ÷ sales cycle in days
   (https://prospeo.io/s/sales-pipeline-metrics). **HQ: HAS** targets and coverage on the
   forecast. **LACKS** the velocity line and "coverage needed at your win rate" beside it.
4. **Forecast categories, rolled up and remembered.** HubSpot's defaults are "Pipeline,
   Best case, Most likely, and Commit"
   (https://knowledge.hubspot.com/forecast/set-up-the-forecast-tool). **HQ: HAS**, with
   frozen calls, and accuracy and bias for past quarters, on top.
5. **Self-reported attribution.** Ask "How did you hear about us?" as free text on every
   inbound form. Refine Labs compared software attribution with 620 self-reported
   answers: software credited web search with 78% of conversions, customers said 12%;
   customers credited "dark social" (social, podcasts, word of mouth, community) with 85%
   (https://www.refinelabs.com/article/attribution-mirage,
   https://www.blendb2b.com/blog/self-reported-attribution). **HQ: LACKS.** A lead keeps
   its `source_key` and the form's payload; nothing reads a self-reported channel or the
   campaign tags out of the payload, and no report shows the two side by side.
6. **Subscription analytics the way the specialists do it.** ChartMogul: segments,
   cohorts, "a per-customer view showing every MRR movement", and now a CRM inside the
   analytics (https://help.chartmogul.com/article/165-what-is-chartmogul-subscription-analytics,
   https://baremetrics.com/blog/what-is-chartmogul). Baremetrics: "Recover" for failed
   charges, "Cancellation Insights" to "calculate lost revenue by cancellation reason",
   "Forecast+" (https://baremetrics.com/). ProfitWell Metrics is free, refreshes "every
   3-6 hours" and benchmarks "against 30,000+ companies"
   (https://www.paddle.com/profitwell-metrics, https://developer.paddle.com/concepts/retain/metrics).
   **HQ: HAS** the MRR bridge, NRR/GRR, cohorts, the renewals ledger, cancel reasons and
   earned revenue by service period. **LACKS** a "payment failing" state on the customer
   (no billing feed, (g)4). No breakdown by plan, segment or country was found in the
   revenue client — **WEAK** if so.
7. **The vocabulary investors use.** a16z's "16 Startup Metrics": bookings vs revenue,
   ARR "should exclude one-time (non-recurring) fees", deferred revenue and billings,
   CAC, churn, burn (https://a16z.com/16-startup-metrics/). **HQ: HAS** most. **LACKS**
   CAC (customer acquisition cost = sales and marketing spend ÷ new customers in the
   period); it needs only expenses tagged "acquisition" with a channel.
8. **Customer-success scoring.** Vitally sells "Dynamic Health Scores … based on current
   lifecycle stage or segment" and playbooks that automate "CSM assignment, task
   creation" (https://www.vitally.io/). **HQ: HAS** the better form — signals with their
   evidence, playbooks dated from the notice date. A score would add nothing.

### (d) The operating cadence

"Operating cadence" is the fixed weekly, monthly and quarterly rhythm by which a small
company looks at its numbers, decides and follows up.

1. **The weekly business review, done properly.** Basedash's guide: 45 minutes, one
   facilitator; "open with the scorecard"; 10–20 metrics, each passing three tests —
   "someone can move it within a week", "it moves week to week", "it has an owner who
   can explain a change"; walk only the variances; "6-12 charts" plotting "trailing 6
   weeks alongside the trailing 12 months"; actions carry an owner and a date and are
   reviewed at the next opening; the dashboard runs live "against your production
   database", not slides
   (https://www.basedash.com/blog/how-to-run-a-weekly-business-review-a-practical-operating-guide).
   **HQ: HAS** the numbers — the weekly pack covers leads, meetings, deals, pipeline,
   forecast, revenue and the desk, live, week by week. **WEAK** on the meeting around
   them: no owner per metric, no goal line, no 6-week and 12-month trend beside each
   figure, no comment, and no action that reopens next week.
2. **The rhythm for under ten people.** "One meeting. One hour. Same time every week":
   10 minutes on last week, 20 on metrics ("5–7 core KPIs max" — "if you have more than
   7 KPIs, you don't have KPIs — you have noise"), 20 on blockers, 10 on next week; a
   monthly refresher that names "three bets" and what to stop; "a Google Sheet is
   enough" (https://purinsights.substack.com/p/the-first-operating-rhythm-every).
   **HQ: LACKS** a place for the three bets, their owners and a weekly status.
3. **Founder discipline.** First Round's profile of Front's Mathilde Collin: a weekly
   revenue email to the whole company with "the same structure … sent around the same
   time", every week for four years, saying "how much revenue we added yesterday, what
   we did well and what didn't go so well"; a Monday 10am email of her weekly goals; a
   15-minute Friday review against quarterly goals; "concentrate on a single metric"
   (https://review.firstround.com/the-founders-guide-to-discipline-lessons-from-fronts-mathilde-collin/).
   **HQ: WEAK.** Digests mail a saved view on a schedule. There is no weekly note that
   puts the number, the good and the bad in the same place every Monday.
4. **One primary metric, three to five secondary, a weekly goal.** Adora Cheung's YC
   Startup School talk (reported): the primary metric "almost always is either revenue
   or active users", with "3-5 secondary metrics", and "you should always be setting
   weekly goals for this" (https://www.adoracheung.com/how-to-set-kpis-and-goals,
   https://blog.ycombinator.com/startup-school-week-8-recap-adora-cheung-on-prioritizing-your-time-and-kevin-hale-on-evaluating-startup-ideas/).
   **HQ: WEAK.** Quarter targets exist on the forecast; no weekly goal sits beside the
   weekly actual.
5. **The scorecard and the 90-day priority.** EOS, a widely used small-company
   operating system: "5–15 weekly Measurables", "each leader typically owns 1–3",
   "Rocks" are the 90-day priorities, and the weekly Level 10 meeting runs scorecard →
   rocks → to-dos → issues (https://www.ninety.io/eos/blog/effective-eos-scorecard,
   https://www.eosworldwide.com/blog/level-10-meeting). **HQ: LACKS** the scorecard, the
   rocks and an issues list. (The only scorecards in HQ are for hiring.)
6. **Status updates with health, nudged by the inbox.** Linear's updates carry a health
   mark — "on track (green), at risk (yellow), and off track (red)" — plus text;
   "project leads and initiative owners will get a reminder in their Inbox when they
   need to share an update and follow-up reminders if the deadline has passed"
   (https://linear.app/docs/initiative-and-project-updates,
   https://linear.app/changelog/2025-02-13-initiative-updates). **HQ: LACKS** the
   update; the Inbox "reminder" reason is the hook for it.
7. **A caution.** Height tried to be the whole company's tool, with an AI reasoning
   engine; it announced its shutdown in March 2025 and went offline on 24 September 2025
   (https://alternativeto.net/news/2025/3/height-project-management-tool-to-shut-down-by-september-2025/).
   Keep HQ's cadence features small: a scorecard, three priorities, a weekly note,
   actions. Not a planning suite.

### (e) Data quality operations

The routine work that keeps records true: finding duplicates, filling blanks, fixing
formats, keeping an owner on everything, and knowing how healthy the data is this week.

1. **A data health page.** HubSpot's Data Quality Command Center shows duplicates and
   formatting issues as counts with "the percentage change … since the start date of your
   date range", and "property insights" for properties with "Duplicates, No data, or
   Unused" (https://knowledge.hubspot.com/reports/data-quality-command-center). Insycle's
   "Customer Data Health Assessment" lists "30+ of the most common customer data issues"
   (https://insycle.com/hubspot/). **HQ: LACKS** one page with the counts, the list
   behind each and the trend.
2. **Duplicates as clusters, across every kind of record.** Attio merges two at a time,
   "the data for the record on the right will be prioritized", and "the other record is
   permanently deleted"
   (https://attio.com/help/reference/managing-your-data/records/merge-and-delete-records);
   its Duplicate Detection app "creates an entry in a deduplication list ('Duplicate
   People' or 'Duplicate Companies') for review"
   (https://attio.com/apps/check-for-duplicates); other apps merge "three, five, nine
   records at once" with a survivor built "attribute by attribute"
   (https://attio.com/apps/dedupe, https://attio.com/apps/deduptio). **HQ: HAS** grouped
   suggestions with a reason for companies and people, and a careful pair merge (HQ
   archives the duplicate; Attio deletes it). **WEAK**: leads and mailing-list members
   are not checked, against each other or against people; three look-alikes take two
   merges. The three-way picker was left out when imports were 500 rows. At tens of
   thousands, duplicates arrive in clusters.
3. **Standardisation at write and in bulk.** Insycle has templates for "names, phone
   numbers, states, cities, emails, zip codes", schedules cleanups, and lets you "review
   all … updates before they go live" (https://insycle.com/hubspot/,
   https://www.insycle.com/hubspot/workflows/). **HQ: HAS** validation rules and custom
   values "normalised by kind". No phone, name-case or legal-form normaliser was found in
   the portal — **WEAK** if the service has none either.
4. **Email verification before the first send.** With only "DELIVERABLE" addresses
   bounces stay "under 1%"; high-probability catch-all addresses bounce "~9%"
   (https://marketful.com/best-email-verification-tools). NeverBounce is reported to
   refund when bounces pass 3% after verification; MillionVerifier is reported at
   $0.0039 per address (https://leadmagic.io/blog/best-neverbounce-alternatives-2026,
   https://bouncezero.io/best-email-verifier-2026). A "catch-all" domain accepts every
   address, so no single one can be proven. **HQ: LACKS.** The bounce breaker acts after
   three hard bounces; a status per address, with its date, and a rule ("never send to
   invalid or unknown; cap catch-all") acts before the first.
5. **Enrichment provenance and cost.** Breeze and Clay both bill in credits
   (https://www.innovationvisual.com/knowledge-hub/knowledge/autumn-2025-update-to-hubspots-breeze-credits,
   https://enrich.so/blog/clay-review). **HQ: LACKS** ((a)6).
6. **Ownership hygiene.** **HQ: HAS** ("Unowned" on lists; bulk owner change with undo).
7. **Staleness.** **HQ: HAS** for deals (neglected, rotting, no next step) and leads
   (waiting minutes; retention's "untouched since"). Companies and people have no
   "no activity in 90 days" list; small, and belongs on the health page.
8. **Basis and retention.** **HQ: HAS** (retention sweep, privacy desk); see (a)12.

### (f) Notifications and the inbox — what the person must do now

1. **One inbox, with a priority split.** Linear's Inbox subscribes you to what you
   created, were assigned or were mentioned in; `H` snoozes, `U` marks read, `J`/`K`
   move (https://linear.app/docs/inbox, https://linear.app/docs/snooze). Priority Inbox
   (September 2026) "separates what needs your attention from what can wait, so
   something like a review blocking a release never gets buried", with "the option to
   customize it by choosing notification sources or creating a filter"
   (https://linear.app/changelog/2026-09-03-priority-inbox). **HQ: HAS** the inbox —
   reasons, folding, read / done / snooze, follow, remind me, a reason filter, bulk,
   quiet hours, mail only for what stays unread. **WEAK**: no Priority / Other split
   (security, waiting on you, approvals and mentions first; updates and activity after).
2. **Triage keys for a queue.** Linear Triage: "accept with `1`, mark as duplicate with
   `2`, decline with `3`, or snooze with `H`" (https://linear.app/docs/triage). The same
   four verbs fit a new lead: work it, merge it, disqualify it with a reason, nurture it
   until a date. **HQ: LACKS** the keys and the nurture date.
3. **A digest only when something is due.** Attio's daily digest "includes tasks
   overdue and due today" and "is sent only on days when you have tasks that are due";
   mentions, replies and assignments go to email and the mobile app, toggled per channel
   (https://attio.com/help/reference/account-settings/notifications). **HQ: HAS** the
   digest. **LACKS** a push channel ((h)).
4. **A page that proposes the next action.** HubSpot's sales workspace Summary shows
   "tasks that are due today, overdue, or due tomorrow", "a preview of today's schedule"
   and "Guided actions" — "suggestions that are automatically generated based on certain
   criteria" (https://knowledge.hubspot.com/prospecting/use-the-prospecting-workspace).
   **HQ: HAS** — Home already carries each of these, and "brief me" prepares a meeting.
5. **The phone's "today" screen.** Pipedrive's Focus view opens on "the most pressing
   matters of the day": an overdue widget, today's activities, swipe to reschedule
   (https://support.pipedrive.com/en/article/focus-view-in-the-mobile-app). **HQ: LACKS**
   a phone layout ((h)).
6. **Slack: immediate for the few, batched for the many.** Integrators' guidance:
   "low-significance events can be batched into a daily digest, while high-significance
   events post immediately", with "deep-link buttons directly to the CRM record"
   (https://dev.to/sailolabs/hubspot-slack-integration-get-crm-signals-where-your-team-actually-looks-3afk,
   https://cotera.co/articles/hubspot-slack-integration-automation.md). Attio's Slack
   app posts "deals closing or new signups", lets you "kick off follow-up workflows from
   Slack", and "cannot read existing messages" (https://attio.com/apps/slack).
   **HQ: LACKS** a chat destination. Signed outbound webhooks exist, but a chat tool
   wants its own message shape, so a small formatter is needed.

### (g) Integrations a small fintech team actually needs

1. **Google Workspace.** Copper "automatically creates contacts and logs emails and
   calendar events" from a Gmail sidebar
   (https://automationatlas.io/answers/copper-crm-review-2026/); Attio "auto-creates
   enriched People and Company records based on who you've emailed or met with"
   (https://crm.org/news/attio-review). **HQ: HAS** Calendar sync and its own outbound
   mail on every record. **LACKS** logging of mail sent from a person's own mailbox;
   whole-mailbox sync is deliberately not step one. The small step is a forward-in or
   BCC address that files the message on the matching person and company.
2. **Chat.** See (f)6. **HQ: LACKS.**
3. **Scheduling.** Cal.com: attribute-based routing with weights and "virtual queues",
   ownership routing by email or domain, fallback to a subset
   (https://cal.com/help/routing/routing-overview); workflow triggers "when a routing
   form is submitted and no booking is created", "no-shows" counted in rotation, SMS and
   WhatsApp workflows "on every Cal.com plan" (https://cal.com/blog/cal-com-v5-3,
   https://cal.com/blog/calcom-v5-9). Calendly looks up known leads to their owners and
   reports conversion by form (https://calendly.com/features/routing). **HQ: LACKS.**
   Take the booking tool's events (created, rescheduled, cancelled, no-show) into leads
   and meetings, and offer an owner lookup the form can call.
4. **Billing.** Stripe Billing: recurring and usage-based pricing, trials and
   prorations, a customer portal, ASC 606 / IFRS 15 revenue recognition, "Smart
   Retries", webhooks (https://docs.stripe.com/implementation-guides/billing/resources,
   https://stripe.com/billing). Razorpay Subscriptions: plans, "cards, UPI, eMandate,
   and international cards", webhooks, retries, pause
   (https://razorpay.com/docs/payments/subscriptions, https://razorpay.com/subscriptions/).
   **HQ: LACKS** a listener. Subscription and invoice events should write contract rows,
   receivables and a "payment failing" flag. Contracts, receivables and earned revenue
   are modelled already; they are typed, not fed.
5. **Accounting.** Zoho Books is GST-localised for India (returns and e-invoices from
   inside the product — see partner pages such as
   https://precisiontech.in/software/zoho/zoho-books/); QuickBooks and Xero serve the
   rest; unified APIs reach all three (https://www.apideck.com/integrations/country/india).
   **HQ: HAS** receivables and budget actuals that quote the accounting system's own
   numbers. **LACKS** a read-only pull to check them against. Never write back.
6. **E-signature.** Documenso is open source and "can be self-hosted via Docker", with
   5 free documents a month; Dropbox Sign is hosted with an API; DocuSign is the
   incumbent (https://gappsy.com/compare/documenso-vs-dropbox-sign/,
   https://ossalt.com/guides/best-open-source-alternatives-to-docusign-2026). For Indian
   signatories, Aadhaar eSign providers exist (e.g.
   https://stackshare.io/stackups/aadhaar-esign-api-vs-documenso). **HQ: WEAK.** A
   signature is recorded by hand ("who, when, where the copy is"). A "send for
   signature" step that brings back the signed copy and its audit trail is the gap.
7. **Buyer rooms.** See (b)9. **HQ: WEAK.**
8. **Lifecycle email.** Loops is "built for SaaS specifically", email-only, with
   "product events as the native trigger"; Customer.io adds push, SMS and in-app with
   complex conditions, from about $100 a month
   (https://www.courier.com/integrations/compare/customer-io-vs-loops,
   https://sequenzy.com/versus/loops-vs-customer-io). **HQ: HAS** the engine, consent
   and customer signals. **WEAK**: a product event (trial started, quiet for seven days,
   near the seat limit) is not an automation trigger.
9. **Controls and trust.** Vanta says it runs "1,200+ automated tests per hour across
   300+ integrations" against Drata's daily tests (https://vanta.com/compare/drata);
   Drata bought SafeBase in February 2025 for its trust centre
   (https://drata.com/learn/compare/delve-vs-vanta-vs-drata). **HQ: HAS** the control
   map, trust centre, registers and access review. Automated evidence collection is not
   worth building here.
10. **Support.** Plain is "Slack-native, API-first"; Front is the shared inbox; Help
    Scout is "for sub-10-agent teams" (vendor pages, read as such:
    https://www.plain.com/blog/startup-support-plain-helpscout-comparison-2025,
    https://plain.com/blog/best-slack-native-support-tools-2026). **HQ: HAS** the desk.
    Email-to-ticket waits on an MX record and is on the go-live list.
11. **People operations.** Deel's EOR (employer of record: a third party employs abroad
    on your behalf) is reported at $599 per employee per month; Gusto pays contractors
    in 120+ countries but has no EOR; Rippling is modular and quote-based
    (https://theaiagentindex.com/compare/deel-vs-rippling-vs-gusto,
    https://www.rho.co/blog/best-payroll-software-for-startups). **HQ: HAS** HR-lite and
    stores no pay. No integration is needed; link out.
12. **Webhooks and an API.** Twenty lists both as base capabilities
    (https://docs.twenty.com/user-guide/getting-started/capabilities/what-is-twenty).
    **HQ: HAS** — API keys and outbound webhooks signed to the Standard Webhooks spec.

### (h) Mobile and PWA

A PWA (progressive web app) is a website installed on the phone's home screen that can
receive push notifications and show a badge count.

1. **What the CRMs put on the phone.** Attio: tasks, record pages, and notifications
   for mentions, replies and assignments; iOS 26+ or Android 13+
   (https://attio.com/help/reference/tools-and-extensions/attio-on-mobile). Close's 2025
   apps: "quick access to inbox and pipeline", dark mode
   (https://www.close.com/blog/close-features-sell-smarter-2025). Pipedrive's Focus view
   is the "today" screen ((f)5). The common minimum: inbox, today, a record with notes,
   a quick log.
2. **Web push works on iPhone now.** Apple supports web push for web apps added to the
   Home Screen on iOS and iPadOS 16.4+, over HTTPS with a manifest and a service worker;
   permission must follow a user action; `navigator.setAppBadge` sets the icon badge
   (https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers,
   https://documentation.onesignal.com/docs/web-push-for-ios,
   https://pushpad.xyz/blog/ios-special-requirements-for-web-push-notifications).
   **HQ: LACKS** a manifest, a service worker, push and a phone layout. Native apps are
   deliberately not built; a PWA gives most of the value.
3. **The phone cases that matter here.** Approving a dual-control request (the second
   owner is often away from a desk), reading the priority inbox, opening the brief for
   the next meeting, answering a lead inside its target, logging a call, reading the
   weekly pack before the meeting. **HQ: LACKS** all of them at phone width.

---

### Ranked backlog — what is worth building for three to ten people

Ranked by value this quarter. Every item was checked as absent in the plan and the code.

1. **Prospect lists that can be worked** — L (first slice M). Give each mailing-list
   member a stage (untouched, contacted, replied, meeting, converted, not a fit,
   stopped), an owner, a last touch, a fit band and a verification status; make the list
   page a working view with the filter builder, grouping, saved views and bulk change;
   a reply or a booked meeting turns the member into a lead and starts the inbound
   clock. Why: tens of thousands of prospects have no home today. (Attio list entries;
   HubSpot lead object.)
2. **Import at scale with matching and undo** — M. Leads and prospects by CSV through
   the existing 1,000-row path; match on address or domain with skip / fill blanks /
   overwrite; a dry run; a batch id on every row and "undo this batch" for seven days;
   the same path lifts the 500-row cap on companies and people. (Close pre-import
   review; Attio merge on import.)
3. **Address verification and a send rule** — M. A status and date per address from a
   verification adapter (vendor never named); a first email refuses invalid and unknown
   and caps catch-all; the status is a list filter. Why: under 1% against about 9%
   bounces, and the bounce breaker only acts after the damage.
4. **Duplicates across leads, prospects and people, merged as clusters** — M. Extend the
   suggestions to leads and list members; a survivor built field by field with a
   preview; one merge for the group. Why: imports of this size arrive in clusters.
   (Attio Duplicate Detection; Dedupe.)
5. **Fit band from a visible checklist** — S. ICP fields on the company and the
   prospect; A/B/C with the rule shown; engagement as listed facts, never a number.
   (HubSpot fit against engagement, the rules tier.)
6. **Scorecard on the weekly pack** — M. For ten to twenty of its figures: an owner, a
   goal, the 6-week and 12-month trend, a variance flag, one comment a week, and actions
   with an owner and a date that reopen at the next review. (Basedash; EOS.)
7. **Three priorities with weekly health** — S. Three per quarter, an owner each, a
   weekly on-track / at-risk / off-track and one line, asked for through the Inbox and
   chased when late. (Linear updates; "three bets".)
8. **Weekly note** — S. One template every Monday at the same hour: the primary metric,
   its goal and actual, what went well and badly, the three priorities. Sent by the
   digest worker. (Collin at Front.)
9. **A weekly goal beside the weekly actual** — S. Break the quarter's target into weeks
   on the forecast and the pack. (Adora Cheung.)
10. **Self-reported attribution** — S. "How did you hear about us?" on every inbound
    form, a normalised channel beside it, campaign tags read out of the lead's payload,
    and one report showing form source against the customer's own answer. (Refine Labs.)
11. **Funnel by source and by cohort** — M. The existing funnel cut by lead source and
    by created month, and one chain from lead to meeting to deal to won per source.
    (Pipedrive Insights; Attio funnel reports.)
12. **Priority split in the Inbox** — S. Priority (security, waiting on you, approvals,
    mentions, a first reply about to run late) and Other; the person can edit the rule.
    (Linear Priority Inbox.)
13. **Lead triage keys and "nurture until"** — S. Work / merge / disqualify / nurture on
    `1 2 3 H`; a nurtured lead leaves the working lists and returns unread on its date.
    (Linear Triage; Pipedrive archive.)
14. **Data health page** — M. Duplicate groups, blanks in required fields, unowned
    records, companies and people quiet for 90 days, invalid addresses, unused custom
    fields — a count, the list behind it, the trend. (HubSpot Data Quality Command
    Center.)
15. **One branch in a sequence, and "enrol in sequence" as an automation action** — M.
    "Reply labelled X → enrol in Y"; a trigger that enrols. (Smartlead subsequences;
    Attio workflows; Apollo plays.)
16. **Target accounts** — M. A tier on the company, a short plan (who to reach, next
    step, owner), and a weekly list of target accounts not touched in 14 days. (HubSpot
    target accounts.)
17. **First-party signals on prospects** — M. Trial sign-up, pricing-page visit from a
    known domain, product use → a signal row with its evidence and act / dismiss, in the
    shape customer success already uses. Vendor signals later, if ever. (Clay; Apollo.)
18. **Enrichment adapter with provenance** — M. One or two providers in order; provider,
    time and cost per field; a human value is never overwritten. (Clay waterfall.)
19. **PWA** — M. Manifest, service worker, install prompt, push for priority inbox rows,
    the icon badge, and a phone layout for Inbox, Home, a record peek, a quick note and
    the approval screen. (Apple web push; Attio and Close mobile; Pipedrive Focus.)
20. **Chat posts** — S. A formatter so an automation or webhook can post "deal won",
    "first reply late", "SLA breached" and critical security events to a channel with a
    link back. Everything else stays in digests. (Attio Slack app.)
21. **Billing events in** — M. Subscription and invoice events from the payment
    providers → contract rows, receivables, the renewals ledger. (Stripe Billing;
    Razorpay Subscriptions.)
22. **"Payment failing" on the customer** — S, after 21. A flag with its date, on the
    company, in customer-success signals and on Home. (Baremetrics Recover.)
23. **Booking events in, owner lookup out** — M. Booked / moved / cancelled / no-show →
    the lead's first touch and a meeting on the record; an endpoint the booking form
    calls to route a known account to its owner. (Cal.com; Calendly.)
24. **"Send for signature" on the order form** — M. Through a signing provider or a
    self-hosted one; the signed copy and audit trail return to the deal and replace the
    hand-typed record; an Aadhaar eSign route where a signatory needs it. (Documenso;
    Dropbox Sign.)
25. **Buyer's link for a deal** — M. One private page: the quote, the action plan the
    team already writes, documents, people; opens recorded on the deal. (Dock; Trumpet;
    Papermark.)
26. **Forward-in mail logging** — M. An address that files a forwarded or BCC'd message
    on the matching person and company; nothing reads the mailbox. (Copper as the far
    end.)
27. **Product events as automation triggers** — M. Trial started, quiet for seven days,
    near the seat limit — with consent checked before any mail. (Loops; Customer.io.)
28. **Accounting read-only pull** — M. Invoices and payments from the accounting system
    compared with receivables; differences listed, nothing written back.
29. **CAC line** — S. Expenses tagged "acquisition" with a channel ÷ new customers in
    the period, beside NRR. (a16z.)
30. **Velocity, and coverage needed at your win rate** — S. Two lines on the forecast
    page from figures already there. (Prospeo; Landbase.)
31. **India in the "needs a yes" consent tier** — S, after advice. The mechanism built
    for Germany and Austria; plus a check that the form notice itemises data, purpose,
    contact, withdrawal and complaint. (DPDP Act and Rules.)
32. **Standardisers** — S. Phone to international format, name case, legal form
    stripped from company names, domains lower-cased — at write and on import, with a
    preview for the bulk run. Check the service first. (Insycle.)
33. **First-reply target per source** — S. Five minutes for a demo request, an hour for
    a download; a booked meeting counts as the first touch.
34. **Delegated sending** — S. A sequence continues from a colleague's sender while the
    owner is away, with the owner's recorded consent. (Attio.)
35. **Revenue by plan, segment and country** — S, if absent. The same bridge and
    retention figures, cut three ways. (ChartMogul segments.)

### What is wrong to build at this size

- **Round-robin or territory routing.** With one to three sellers, assignment is a rule,
  not a rotation. Already declined; the guides agree it matters past about five reps.
- **AI or predictive lead and deal scores.** HubSpot sells them only at Enterprise and
  they need volume to train. HQ's rule is that every number is a visible ratio. Build
  the fit band.
- **A health score as a number.** Already declined; signals with evidence are better.
- **Your own warm-up network, inbox rotation or placement testing.** Instantly runs
  "4.2M+ accounts" for this. It is infrastructure and a grey area for a regulated brand.
- **Your own contact database or scraper.** License an export, import it with its
  source, keep what is used. 450 million rows are a vendor's problem.
- **Person-level website de-anonymisation.** RB2B's person-level identification is
  reported as "U.S. only" (https://pipeline.zoominfo.com/sales/rb2b-vs-warmly,
  https://abmatic.ai/blog/warmly-vs-rb2b-vs-abmatic-ai-for-deanonymization-2026), and
  the privacy cost for Indian and European visitors is high. Your own sign-ups and
  pricing page are enough.
- **A dialer, SMS or WhatsApp automation.** Telephony and messaging consent rules, and
  cost. A logged call with a note is the right amount of telephony at ten people.
- **A full subscription-analytics suite (financial modelling, LTV).** The bridge,
  NRR/GRR, cohorts and renewals are built. Stop at the billing feed.
- **Multi-touch attribution modelling.** Refine Labs shows software attribution misreads
  the channel most of the time. The form source plus the customer's own answer is the
  honest version.
- **Buyer-intent data subscriptions.** HubSpot's is reported at ten credits per company
  per month (https://bitscale.ai/blogs/breeze-intelligence-review). For a small market
  it is noise bought by the row.
- **Native iOS and Android apps.** Already declined; the PWA covers push, the badge and
  the phone cases.
- **An initiative hierarchy, Gantt charts or full OKR software.** Three priorities with
  a weekly health line is the whole need. Height tried to be everything and closed.
- **A wiki or documents product.** Policies, the help centre and letterhead documents
  exist. Writing lives elsewhere.
- **Payroll, EOR or storing pay.** Already declined; link out.
- **Automated compliance evidence collection.** Hourly tests across hundreds of
  integrations is a product. The control map and trust centre are the right size.
- **An in-house signing engine.** Certificates and audit chains are the provider's job.
- **A second lead object for inbound.** The inbound lead and its clock are right as they
  are. The prospect work belongs on the lists, not in a rebuilt lead.
