import Link from "next/link";
import { notFound } from "next/navigation";
import type { ReactNode } from "react";

import { DataUnavailable } from "@/components/data/data-down";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { ControlRefNote, PracticeNote } from "@/components/data/security/control-ref";
import { AccountsTable } from "@/components/data/tools/accounts-table";
import { AccountFields, ToolFields } from "@/components/data/tools/tool-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
} from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { StatusPill } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readTool, type ToolPage } from "@/lib/data/api/tools";
import { dayWords } from "@/lib/data/labels-company";
import { NOT_ADVICE, OWNER_LEFT_OUT } from "@/lib/data/labels-controls";
import { minorWords } from "@/lib/data/labels-duties";
import {
  BILLING,
  DATA_CLASSES,
  KEY_DATE_COVERS,
  NOT_A_SUBPROCESSOR,
  SIGN_IN,
  SUBPROCESSORS_FOLDER,
  TOOL_ACCOUNTS_EMPTY,
  TOOL_CATEGORIES,
  TOOL_STATUSES,
  TWO_STEP,
  billedWords,
  sendsAsWords,
} from "@/lib/data/labels-systems";
import { dataRead } from "@/lib/data/read";
import { requestNow } from "@/lib/request-time";

import {
  addAccountAction,
  notSubprocessorAction,
  retireToolAction,
  reviewToolAction,
  subprocessorAction,
  updateToolAction,
  vendorAction,
} from "../../actions";
import "../../systems.css";

export const metadata = { title: "Tool" };
export const dynamic = "force-dynamic";

const BASE = "/data/systems";
const TOOL_ID = /^[A-Za-z0-9-]{1,64}$/;
const FLAG_WORDS = { yes: "Yes", no: "No", "": "Not known" } as const;

const EVENT_WORDS: Record<string, string> = {
  added: "Added",
  changed: "Changed",
  "looked at": "Looked at",
  retired: "Retired",
  "back in use": "Back in use",
  closed: "Account closed",
  reopened: "Account reopened",
  "agreement kept": "Agreement kept in Files",
};

export default async function ToolRecordPage({ params }: { params: Promise<{ toolId: string }> }) {
  const { toolId } = await params;
  const { allowed, context } = await requireData(`${BASE}/tools/${toolId}`);
  if (!TOOL_ID.test(toolId)) notFound();
  const now = requestNow();
  // The Owner flag from the role and nothing else.
  const owner = allowed && context.me.role === "owner";
  const read = allowed ? await dataRead(() => readTool(toolId, owner)) : null;
  if (!allowed || !read || !read.ok)
    return (
      <>
        <PageHeader title="Tool" />
        <div className="page-content">
          {!allowed || !read ? (
            <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
          ) : (
            !read.ok && <DataUnavailable failure={read} />
          )}
        </div>
      </>
    );
  return <ToolRecord page={read.data} owner={owner} now={now} />;
}

function ToolRecord({ page, owner, now }: { page: ToolPage; owner: boolean; now: number }) {
  const { tool, today } = page;
  const fields = { tool_id: tool.tool_id };
  const retired = Boolean(tool.retired);
  const renewal = tool.next.renewal;
  const sharedLines = tool.checks.filter((line) => line === "A shared account.");
  const checks = tool.checks.filter((line) => line !== "A shared account.");
  return (
    <>
      <RecordHeader
        crumbs={[
          { href: BASE, label: "Systems" },
          { href: `${BASE}?view=all`, label: "Tools" },
        ]}
        title={tool.name}
        status={
          <StatusPill
            value={tool.status}
            label={TOOL_STATUSES[tool.status]}
            tone={
              tool.status === "in_use"
                ? "live"
                : tool.status === "retired"
                  ? "neutral"
                  : "attention"
            }
          />
        }
        readouts={[
          { label: "Accounts open", value: tool.accounts_line },
          {
            label: "Cancel by",
            value: renewal && !retired ? dayWords(renewal.cancel_by) : "None",
          },
          { label: "Looked at", value: dayWords(tool.looked_on) },
        ]}
        actions={
          retired ? (
            <RowAction
              action={retireToolAction}
              fields={{ ...fields, undo: "1" }}
              buttons={[
                {
                  label: "Bring back into use",
                  className: "btn btn--small",
                  pendingLabel: "Saving…",
                },
              ]}
              sentLabel="Back in use."
            />
          ) : (
            <>
              <Popover label="Edit" variant="primary" align="start" width="wide">
                <MailForm
                  action={updateToolAction}
                  fields={fields}
                  submitLabel="Save"
                  pendingLabel="Saving…"
                  className="stack-form stack-form--tight"
                >
                  <ToolFields prefix="tool-edit" values={tool} />
                </MailForm>
              </Popover>
              <Popover label="Record a look" align="start">
                <MailForm
                  action={reviewToolAction}
                  fields={fields}
                  submitLabel="Record the look"
                  pendingLabel="Saving…"
                >
                  <p className="field__hint">Its sign-in, the data it holds and its terms.</p>
                  <Field id="review-on" label="On">
                    <Input id="review-on" name="on" type="date" max={today} defaultValue={today} />
                  </Field>
                  <Field id="review-by" label="By">
                    <Input id="review-by" name="by_name" maxLength={120} />
                  </Field>
                  <Field id="review-note" label="Note" hint="Never a password.">
                    <Textarea id="review-note" name="note" rows={2} maxLength={500} />
                  </Field>
                </MailForm>
              </Popover>
              <Popover label="Retire" align="start">
                <MailForm
                  action={retireToolAction}
                  fields={fields}
                  submitLabel="Retire it"
                  pendingLabel="Saving…"
                >
                  <p className="field__hint">It stays listed. Close its open accounts first.</p>
                  <Field id="retire-on" label="On">
                    <Input id="retire-on" name="on" type="date" max={today} defaultValue={today} />
                  </Field>
                  <Field id="retire-why" label="Why">
                    <Input id="retire-why" name="why" maxLength={300} required />
                  </Field>
                </MailForm>
              </Popover>
            </>
          )
        }
      />
      <RecordGrid side={<Side page={page} />}>
        <div className="hqdata-systems">
          <p className="page-note">{NOT_ADVICE}</p>
          {retired && tool.retired && (
            <p className="page-note">
              Retired {dayWords(tool.retired.on)}: {tool.retired.why}
            </p>
          )}
          {checks.length > 0 && (
            <ul className="hqdata-systems__list" aria-label="Checks">
              {checks.map((line) => (
                <li key={line} className="hqdata-systems__check">
                  {line}
                </li>
              ))}
            </ul>
          )}
          <RecordSection
            id="tool-accounts"
            title="Accounts"
            actions={
              retired ? undefined : (
                <Popover label="Add an account" align="end" width="wide">
                  <MailForm
                    action={addAccountAction}
                    fields={fields}
                    submitLabel="Add the account"
                    pendingLabel="Adding…"
                    className="stack-form stack-form--tight"
                  >
                    <AccountFields prefix="account-new" values={null} today={today} />
                  </MailForm>
                </Popover>
              )
            }
          >
            <p className="page-note">
              <ControlRefNote refs={["a5_18"]} />
            </p>
            {!owner && <p className="page-note">{OWNER_LEFT_OUT}</p>}
            {sharedLines.length > 1 && (
              <p className="page-note">{sharedLines.length} shared accounts.</p>
            )}
            <AccountsTable
              accounts={page.accounts}
              owner={owner}
              roster={page.roster ?? []}
              showTool={false}
              today={today}
              empty={TOOL_ACCOUNTS_EMPTY}
            />
          </RecordSection>
          <RecordSection id="tool-signin" title="Sign-in and data">
            <dl className="hqdata-systems__facts">
              <Fact label="Sign-in">
                {SIGN_IN[tool.sign_in]}
                {tool.sso_with ? `, through ${tool.sso_with}` : ""}
              </Fact>
              <Fact label="Two-step sign-in">{TWO_STEP[tool.mfa]}</Fact>
              <Fact label="Critical">
                {tool.critical
                  ? "Yes: a leaver's account is closed by the end of the day after the last day."
                  : "No: a leaver's account is closed within 5 days."}
              </Fact>
              <Fact label="Holds">
                {tool.holds.length === 0
                  ? "Nothing marked"
                  : tool.holds.map((key) => DATA_CLASSES[key]).join(", ")}
              </Fact>
              <Fact label="Where its data is">{tool.data_location || "Not recorded"}</Fact>
              <Fact label="Who administers it">{tool.admins || "Not recorded"}</Fact>
            </dl>
          </RecordSection>
          <SubprocessorSection page={page} />
          <MoneySection page={page} />
          {page.senders !== null && page.senders.length > 0 && (
            <RecordSection id="tool-mail" title="Mail">
              <p>
                {sendsAsWords(page.senders.map((domain) => domain.name))}{" "}
                <Link className="text-link" href="/data/registers/domains">
                  Domains
                </Link>
              </p>
            </RecordSection>
          )}
          <RecordSection id="tool-renewal" title="Renewal">
            <dl className="hqdata-systems__facts">
              <Fact label="Plan">{tool.plan || "Not recorded"}</Fact>
              <Fact label="Seats">
                {tool.seats === null ? "Not recorded" : tool.seats.toLocaleString("en-GB")}
              </Fact>
              <Fact label="Cost">
                {tool.amount_minor === null
                  ? "Not recorded"
                  : `${minorWords(tool.amount_minor, tool.currency)} ${BILLING[tool.billing].toLowerCase()}`}
              </Fact>
              <Fact label="Billing">{BILLING[tool.billing]}</Fact>
              <Fact label="Next renewal">{renewal ? dayWords(renewal.next) : "None"}</Fact>
              <Fact label="Cancel by">
                {renewal
                  ? `${dayWords(renewal.cancel_by)}${tool.notice_days ? ` (${tool.notice_days} days' notice)` : ""}`
                  : "None"}
              </Fact>
              <Fact label="Renews by itself">{FLAG_WORDS[tool.auto_renews]}</Fact>
              <Fact label="Stands for in Key dates">
                {tool.key_date ? KEY_DATE_COVERS[tool.key_date] : "None"}
              </Fact>
              <Fact label="Look again by">
                {dayWords(tool.next.review)}
                <span className="table-sub">
                  <PracticeNote
                    practice="tool_review"
                    {...(page.review_months !== null ? { amount: page.review_months } : {})}
                  />
                </span>
              </Fact>
            </dl>
            {tool.reviewed && (
              <p className="page-note">
                Last looked at {dayWords(tool.reviewed.on)} by {tool.reviewed.by_name}
                {tool.reviewed.note ? `: ${tool.reviewed.note}` : "."}
              </p>
            )}
          </RecordSection>
          <RecordSection id="tool-leaving" title="Leaving it">
            {tool.exit ? (
              <p className="hqdata-systems__prose">{tool.exit}</p>
            ) : (
              <p className="page-note">
                How to export its data and leave is not recorded. Add it with Edit.
              </p>
            )}
          </RecordSection>
          <RecordSection id="tool-activity" title="Activity">
            {page.events.length === 0 ? (
              <p className="page-note">Nothing yet.</p>
            ) : (
              <ul className="hqdata-systems__list">
                {page.events.map((event) => (
                  <li key={event.event_id}>
                    {event.target === "account" && !EVENT_WORDS[event.verb]?.startsWith("Account")
                      ? `Account ${event.verb}`
                      : (EVENT_WORDS[event.verb] ?? event.verb)}
                    {event.detail && event.verb === "changed" ? `: ${event.detail}` : ""} ·{" "}
                    {event.by.name} · <Timestamp value={event.at} now={now} />
                  </li>
                ))}
              </ul>
            )}
          </RecordSection>
        </div>
      </RecordGrid>
    </>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="hqdata-systems__fact">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function SubprocessorSection({ page }: { page: ToolPage }) {
  const { tool, today } = page;
  const block = tool.subprocessor;
  const fields = { tool_id: tool.tool_id };
  const form = (
    <MailForm
      action={subprocessorAction}
      fields={fields}
      submitLabel="Save"
      pendingLabel="Saving…"
      className="stack-form stack-form--tight"
    >
      <Field id="sp-legal" label="Legal name" hint="As on its terms.">
        <Input id="sp-legal" name="legal_name" maxLength={200} defaultValue={tool.legal_name} />
      </Field>
      <Field id="sp-purpose" label="What it does with customers' data">
        <Input id="sp-purpose" name="purpose" maxLength={300} defaultValue={block?.purpose ?? ""} />
      </Field>
      <Field id="sp-locations" label="Where customers' data is processed">
        <Input
          id="sp-locations"
          name="locations"
          maxLength={200}
          defaultValue={block?.locations ?? ""}
        />
      </Field>
      <div className="hqdata-systems__pair">
        <Field id="sp-dpa" label="Data processing agreement signed">
          <Input
            id="sp-dpa"
            name="dpa_signed_on"
            type="date"
            max={today}
            defaultValue={block?.dpa_signed_on ?? ""}
          />
        </Field>
        <Field id="sp-since" label="Since">
          <Input
            id="sp-since"
            name="since"
            type="date"
            max={today}
            defaultValue={block?.since ?? ""}
          />
        </Field>
      </div>
      <CopyFields
        prefix="sp-copy"
        label="The agreement"
        files={page.file_choices}
        filesHere={page.files_here}
        folder={SUBPROCESSORS_FOLDER.join(" › ")}
      />
    </MailForm>
  );
  return (
    <RecordSection
      id="tool-subprocessor"
      title="Sub-processor"
      actions={
        tool.retired ? undefined : (
          <>
            <Popover label={block ? "Edit" : "Mark as a sub-processor"} align="end" width="wide">
              {form}
            </Popover>
            {block && (
              <RowAction
                action={notSubprocessorAction}
                fields={fields}
                buttons={[{ label: "Not a sub-processor", className: "btn btn--small btn--ghost" }]}
                sentLabel="No longer a sub-processor."
              />
            )}
          </>
        )
      }
    >
      <p className="page-note">
        <ControlRefNote refs={["a5_19", "a5_20", "a5_21", "a5_22"]} />
      </p>
      {block ? (
        <dl className="hqdata-systems__facts">
          <Fact label="Legal name">{tool.legal_name || "Not recorded"}</Fact>
          <Fact label="Purpose">{block.purpose || "Not recorded"}</Fact>
          <Fact label="Where customers' data is processed">
            {block.locations || "Not recorded"}
          </Fact>
          <Fact label="Data processing agreement">
            {block.dpa_signed_on ? `Signed ${dayWords(block.dpa_signed_on)}` : "None recorded"}
            {page.dpa_file && (
              <span className="table-sub">
                <Link className="text-link" href={`/data/files/${page.dpa_file.file_id}`}>
                  {page.dpa_file.title}
                </Link>
              </span>
            )}
          </Fact>
          <Fact label="Since">{block.since ? dayWords(block.since) : "Not recorded"}</Fact>
        </dl>
      ) : (
        <p className="page-note">{NOT_A_SUBPROCESSOR}</p>
      )}
    </RecordSection>
  );
}

function MoneySection({ page }: { page: ToolPage }) {
  if (page.vendors === null) return null;
  const { tool } = page;
  return (
    <RecordSection
      id="tool-money"
      title="Money"
      actions={
        tool.retired ? undefined : (
          <Popover label="Choose the vendor" align="end">
            <MailForm
              action={vendorAction}
              fields={{ tool_id: tool.tool_id }}
              submitLabel="Save"
              pendingLabel="Saving…"
            >
              <Field id="tool-vendor" label="Vendor in Money">
                <Select id="tool-vendor" name="vendor_id" defaultValue={tool.vendor_id ?? ""}>
                  <option value="">None</option>
                  {page.vendors.map((vendor) => (
                    <option key={vendor.vendor_id} value={vendor.vendor_id}>
                      {vendor.name}
                      {vendor.retired ? " (retired)" : ""}
                    </option>
                  ))}
                </Select>
              </Field>
            </MailForm>
          </Popover>
        )
      }
    >
      {page.vendor ? (
        <>
          <p>
            Its vendor in Money:{" "}
            <Link className="text-link" href={page.vendor.href}>
              {page.vendor.name}
            </Link>
            .
          </p>
          {page.billed !== null && <p>{billedWords(page.billed_since, page.billed)}</p>}
        </>
      ) : (
        <p className="page-note">No vendor in Money is chosen for it.</p>
      )}
    </RecordSection>
  );
}

function Side({ page }: { page: ToolPage }) {
  const { tool } = page;
  return (
    <Properties title="Tool">
      <Property label="Category">{TOOL_CATEGORIES[tool.category]}</Property>
      <Property label="Status">{TOOL_STATUSES[tool.status]}</Property>
      <Property label="Business owner">{tool.business_owner || "Not recorded"}</Property>
      <Property label="What it is for">{tool.what || "Not recorded"}</Property>
      <Property label="Notes">{tool.notes || "None"}</Property>
    </Properties>
  );
}
