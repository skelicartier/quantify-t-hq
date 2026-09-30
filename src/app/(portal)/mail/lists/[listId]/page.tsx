import Link from "next/link";
import { notFound } from "next/navigation";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import {
  addListContactsAction,
  addListMemberAction,
  archiveListAction,
  importListAction,
  removeListMembersAction,
  saveListAction,
  updateListMemberAction,
} from "@/app/(portal)/mail/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { ListImport } from "@/components/mail/list-import";
import { ListCrmPicker, ListRemoveForm } from "@/components/mail/list-members";
import { MailForm } from "@/components/mail/mail-form";
import { CampaignStatePill } from "@/components/mail/pills";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import {
  Properties,
  Property,
  RecordGrid,
  RecordHeader,
  RecordSection,
  RecordTabs,
  currentTab,
} from "@/components/ui/record-shell";
import { StatusPill, type PillTone } from "@/components/ui/status-pill";
import { Timestamp } from "@/components/ui/timestamp";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import {
  LIST_MAX_MEMBERS,
  SKIP_REASON_LABELS,
  readList,
  type ListMember,
  type MailCampaign,
} from "@/lib/api/mail";
import { formatAbsolute } from "@/lib/format";
import { audienceOptions } from "@/lib/mail/options";
import { requestNow } from "@/lib/request-time";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "List" };
export const dynamic = "force-dynamic";

const TABS = [
  { key: "members", label: "People" },
  { key: "import", label: "Import a CSV" },
  { key: "add", label: "Add people" },
  { key: "settings", label: "Settings" },
];
const PAGE = 100;
const STOPPED = new Set(["UNSUBSCRIBED", "SUPPRESSED", "BOUNCED", "COMPLAINED", "DO_NOT_CONTACT"]);
const EXPORT_NOTICES: Record<string, string> = {
  reason: "Say what the export is for (eight characters or more), then download again.",
  sudo: "Confirm it's you first, then export again.",
  forbidden: "Your role does not export records.",
  failed: "The export could not be made just now.",
  quota:
    "That is more than you can export today. An owner can lift your limit for a day on Privileged access.",
};
const STANDARD_LABELS = [
  ["first_name", "First name"],
  ["last_name", "Last name"],
  ["company", "Company"],
  ["title", "Title"],
  ["country", "Country"],
] as const;

function statusTone(status: string): PillTone {
  if (status === "ok") return "live";
  return STOPPED.has(status) ? "danger" : "attention";
}

function MemberStatus({ member }: { member: ListMember }) {
  const label =
    member.status === "ok" ? "Can be mailed" : (SKIP_REASON_LABELS[member.status] ?? member.status);
  return (
    <>
      <StatusPill value={member.status} label={label} tone={statusTone(member.status)} />
      {member.status_detail && <span className="table-sub">{member.status_detail}</span>}
    </>
  );
}

function PersonFields({
  prefix,
  member,
  columns,
}: {
  prefix: string;
  member?: ListMember;
  columns: readonly string[];
}) {
  return (
    <>
      {STANDARD_LABELS.map(([name, label]) => (
        <Field key={name} id={`${prefix}-${name}`} label={label}>
          <Input
            id={`${prefix}-${name}`}
            name={name}
            defaultValue={member ? member[name] : ""}
            maxLength={name === "company" ? 200 : 120}
          />
        </Field>
      ))}
      {columns.map((column) => (
        <Field
          key={column}
          id={`${prefix}-field-${column}`}
          label={column.charAt(0).toUpperCase() + column.slice(1).replace(/_/g, " ")}
          hint={`{{custom.${column}}}`}
        >
          <Input
            id={`${prefix}-field-${column}`}
            name={`field:${column}`}
            defaultValue={member?.fields[column] ?? ""}
            maxLength={500}
          />
        </Field>
      ))}
    </>
  );
}

type ListPageProps = {
  params: Promise<{ listId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default async function ListPage({ params, searchParams }: ListPageProps) {
  const { listId } = await params;
  const context = await requireStaff(`/mail/lists/${listId}`);
  const parameters = await searchParams;
  const now = requestNow();
  const q = (firstSearchValue(parameters.q) ?? "").slice(0, 120);
  const statusFilter = firstSearchValue(parameters.status) ?? "";
  const offset = Math.max(0, Number.parseInt(firstSearchValue(parameters.offset) ?? "0", 10) || 0);
  let page: Awaited<ReturnType<typeof readList>> | null = null;
  try {
    page = await readList(context.token, listId, {
      q,
      status: statusFilter === "ok" || statusFilter === "blocked" ? statusFilter : "",
      offset,
      limit: PAGE,
    });
  } catch (error) {
    if (error instanceof HqApiRequestError && error.status === 404) notFound();
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  if (page === null) {
    return (
      <div className="page-content">
        <Callout tone="danger" role="alert">
          This list could not be read just now. This is a read failure, not an empty list.
        </Callout>
      </div>
    );
  }
  const { list, counts } = page;
  const base = `/mail/lists/${list.list_id}`;
  const tab = currentTab(firstSearchValue(parameters.tab), TABS);
  const canWrite = hasCapability(context, "crm:write");
  const canExport = hasCapability(context, "crm:export");
  const archived = Boolean(list.archived_at);
  const editing = page.members.find(
    (member) => member.member_id === firstSearchValue(parameters.member),
  );
  const exportNotice = EXPORT_NOTICES[firstSearchValue(parameters.export) ?? ""];
  const options = tab === "add" && canWrite ? await audienceOptions(context.token) : null;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;
  const pageHref = (next: Record<string, string>) => {
    const query = new URLSearchParams({
      ...(q ? { q } : {}),
      ...(statusFilter ? { status: statusFilter } : {}),
      ...next,
    });
    const text = query.toString();
    return text ? `${base}?${text}` : base;
  };

  const actions = (
    <>
      {canWrite && !archived && counts.members > 0 && (
        <Link
          className="btn btn--small btn--primary"
          href={`/mail/campaigns/new?list=${list.list_id}`}
        >
          Send a campaign
        </Link>
      )}
      {canExport && (
        <Popover label="Export" align="end" width="wide">
          <SudoGate
            action={confirmSudoAction}
            fresh={context.me.sudo_fresh}
            untilLabel={untilLabel}
            returnPath={base}
            purpose="Exports need a fresh code from your authenticator app."
          />
          <form
            className="stack-form stack-form--tight export-form"
            method="post"
            action={`${base}/export`}
          >
            <div className="field">
              <div className="field__label">
                <label htmlFor="list-export-reason">What it is for</label>
              </div>
              <input
                id="list-export-reason"
                className="input"
                name="reason"
                minLength={8}
                maxLength={400}
                required
                placeholder="e.g. Sharing with the events agency"
                disabled={!context.me.sudo_fresh}
              />
            </div>
            <button
              className="btn btn--primary btn--small"
              type="submit"
              disabled={!context.me.sudo_fresh}
            >
              Download CSV
            </button>
          </form>
        </Popover>
      )}
    </>
  );

  return (
    <>
      <RecordHeader
        crumbs={[
          { href: "/mail", label: "Mail" },
          { href: "/mail/lists", label: "Lists" },
        ]}
        title={list.name}
        status={archived ? <StatusPill value="archived" label="Archived" /> : undefined}
        readouts={[
          { label: "People", value: counts.members.toLocaleString("en-GB") },
          { label: "Can be mailed", value: counts.eligible.toLocaleString("en-GB") },
          { label: "Cannot", value: counts.blocked.toLocaleString("en-GB") },
          { label: "Own columns", value: String(list.columns.length) },
        ]}
        actions={actions}
      />
      {(archived || exportNotice) && (
        <div className="record-banners">
          {archived && (
            <Callout tone="attention" title="Archived">
              Nobody can be added and no new campaign can use it. Restore it under Settings.
            </Callout>
          )}
          {exportNotice && (
            <Callout tone="attention" role="alert">
              {exportNotice}
            </Callout>
          )}
        </div>
      )}
      <RecordTabs
        base={base}
        tabs={[{ ...TABS[0]!, count: counts.members }, ...TABS.slice(1)]}
        current={tab}
        label="List sections"
      />
      <RecordGrid
        side={
          editing && canWrite ? (
            <section className="side-panel" aria-labelledby="list-member-edit">
              <h2 id="list-member-edit" className="record-section__title">
                {editing.email}
              </h2>
              <MemberStatus member={editing} />
              {editing.person_id && (
                <p className="page-note">
                  In the CRM as{" "}
                  <Link href={`/people/${editing.person_id}`}>
                    {editing.person_name || "this person"}
                  </Link>
                  ; a campaign to this list sends to that record.
                </p>
              )}
              <MailForm
                action={updateListMemberAction}
                fields={{ list_id: list.list_id, member_id: editing.member_id }}
                submitLabel="Save"
              >
                <PersonFields prefix="edit" member={editing} columns={list.columns} />
              </MailForm>
              <MailForm
                action={removeListMembersAction}
                fields={{ list_id: list.list_id, member_id: editing.member_id }}
                submitLabel="Take off this list"
                variant="ghost"
              />
              <Link className="page-note" href={pageHref({})}>
                Close
              </Link>
            </section>
          ) : (
            <>
              <Properties title="This list">
                <Property label="What it is">{list.description || "—"}</Property>
                <Property label="Made by">{list.created_by?.name || "—"}</Property>
                <Property label="Made">
                  <Timestamp value={list.created_at} now={now} mode="both" />
                </Property>
                <Property label="Own columns">
                  {list.columns.length ? (
                    <ul className="step-lines step-lines--plain">
                      {list.columns.map((column) => (
                        <li key={column}>{`{{custom.${column}}}`}</li>
                      ))}
                    </ul>
                  ) : (
                    "Only the standard ones"
                  )}
                </Property>
              </Properties>
              {Object.keys(counts.by_reason).length > 0 && (
                <Properties title="Why some cannot be mailed">
                  {Object.entries(counts.by_reason).map(([reason, count]) => (
                    <Property key={reason} label={SKIP_REASON_LABELS[reason] ?? reason}>
                      {count.toLocaleString("en-GB")}
                    </Property>
                  ))}
                </Properties>
              )}
              {page.campaigns.length > 0 && (
                <Properties title="Campaigns to this list">
                  {page.campaigns.map((campaign) => (
                    <Property key={campaign.campaign_id} label={campaign.name}>
                      <Link href={`/mail/campaigns/${campaign.campaign_id}`}>
                        <CampaignStatePill state={campaign.state as MailCampaign["state"]} />
                      </Link>
                    </Property>
                  ))}
                </Properties>
              )}
            </>
          )
        }
      >
        {tab === "members" && (
          <>
            <div className="list-bar">
              <form className="list-search" method="get" action={base} role="search">
                <label className="sr-only" htmlFor="list-q">
                  Search this list
                </label>
                <input
                  id="list-q"
                  className="input input--small"
                  name="q"
                  defaultValue={q}
                  placeholder="Email, name, firm or any column"
                />
                <label className="sr-only" htmlFor="list-status">
                  Who
                </label>
                <select
                  id="list-status"
                  className="select select--small"
                  name="status"
                  defaultValue={statusFilter}
                >
                  <option value="">Everyone</option>
                  <option value="ok">Can be mailed</option>
                  <option value="blocked">Cannot be mailed</option>
                </select>
                <button className="btn btn--small" type="submit">
                  Search
                </button>
              </form>
              {canWrite && !archived && page.members.length > 0 && (
                <ListRemoveForm
                  formId="list-remove"
                  listId={list.list_id}
                  action={removeListMembersAction}
                />
              )}
            </div>
            <DataTable
              caption={`People on ${list.name}`}
              columns={[
                ...(canWrite ? [{ key: "pick", label: "Tick" }] : []),
                { key: "email", label: "Email" },
                { key: "name", label: "Name" },
                { key: "status", label: "Can we mail them" },
                { key: "company", label: "Company" },
                { key: "title", label: "Title" },
                { key: "country", label: "Country" },
                ...list.columns.map((column) => ({
                  key: `c-${column}`,
                  label: column.replace(/_/g, " "),
                })),
                { key: "added", label: "Added" },
              ]}
              isEmpty={page.members.length === 0}
              empty={
                <EmptyState
                  compact
                  title={q || statusFilter ? "Nobody matches" : "Nobody on this list yet"}
                  description={
                    q || statusFilter
                      ? "Clear the search to see everyone."
                      : "Import a CSV, add someone by hand, or pick people from the CRM."
                  }
                />
              }
            >
              {page.members.map((member) => (
                <tr key={member.member_id}>
                  {canWrite && (
                    <td>
                      <input
                        type="checkbox"
                        name="member_id"
                        value={member.member_id}
                        form="list-remove"
                        aria-label={`Tick ${member.email}`}
                        disabled={archived}
                      />
                    </td>
                  )}
                  <td>
                    <Link
                      className="table-title"
                      href={pageHref({ member: member.member_id, offset: String(offset) })}
                    >
                      {member.email}
                    </Link>
                    {member.person_id && (
                      <span className="table-sub">
                        In the CRM{member.person_name ? `: ${member.person_name}` : ""}
                      </span>
                    )}
                  </td>
                  <td>{member.full_name || "—"}</td>
                  <td>
                    <MemberStatus member={member} />
                  </td>
                  <td>{member.company || "—"}</td>
                  <td>{member.title || "—"}</td>
                  <td>{member.country || "—"}</td>
                  {list.columns.map((column) => (
                    <td key={column}>{member.fields[column] || "—"}</td>
                  ))}
                  <td>
                    <Timestamp value={member.added_at} now={now} mode="relative" />
                    <span className="table-sub">
                      {member.source === "csv"
                        ? "From a CSV"
                        : member.source === "crm"
                          ? "From the CRM"
                          : "By hand"}
                      {member.basis === "consent" ? " · asked to hear from us" : ""}
                    </span>
                  </td>
                </tr>
              ))}
            </DataTable>
            {page.total > PAGE && (
              <nav className="pager" aria-label="Pages">
                <span className="page-note">
                  {(offset + 1).toLocaleString("en-GB")}–
                  {Math.min(offset + PAGE, page.total).toLocaleString("en-GB")} of{" "}
                  {page.total.toLocaleString("en-GB")}
                </span>
                {offset > 0 && (
                  <Link
                    className="btn btn--small"
                    href={pageHref({ offset: String(Math.max(0, offset - PAGE)) })}
                  >
                    Previous
                  </Link>
                )}
                {offset + PAGE < page.total && (
                  <Link
                    className="btn btn--small"
                    href={pageHref({ offset: String(offset + PAGE) })}
                  >
                    Next
                  </Link>
                )}
              </nav>
            )}
          </>
        )}
        {tab === "import" &&
          (canWrite && !archived ? (
            <ListImport
              listId={list.list_id}
              action={importListAction}
              maxMembers={LIST_MAX_MEMBERS}
              current={counts.members}
            />
          ) : (
            <Callout tone="neutral">
              {archived ? "An archived list takes no one new." : "Your role reads lists."}
            </Callout>
          ))}
        {tab === "add" &&
          (canWrite && !archived && options ? (
            <>
              <RecordSection id="list-add-one" title="One person">
                <MailForm
                  action={addListMemberAction}
                  fields={{ list_id: list.list_id }}
                  submitLabel="Add to the list"
                  className="form-grid"
                >
                  <Field id="add-email" label="Email" className="form-grid__span">
                    <Input id="add-email" name="email" type="email" maxLength={254} required />
                  </Field>
                  <PersonFields prefix="add" columns={list.columns} />
                  <Field
                    id="add-basis"
                    label="Why you may mail them"
                    className="form-grid__span"
                    hint="Consent records a yes if none is on file; someone who unsubscribed stays unsubscribed."
                  >
                    <Select id="add-basis" name="basis" defaultValue="legitimate_interest">
                      <option value="legitimate_interest">A business contact</option>
                      <option value="consent">They asked to hear from us</option>
                    </Select>
                  </Field>
                </MailForm>
              </RecordSection>
              <RecordSection id="list-add-crm" title="From the CRM">
                <ListCrmPicker
                  listId={list.list_id}
                  action={addListContactsAction}
                  people={options.people}
                  leads={options.leads}
                />
              </RecordSection>
            </>
          ) : (
            <Callout tone="neutral">
              {archived ? "An archived list takes no one new." : "Your role reads lists."}
            </Callout>
          ))}
        {tab === "settings" &&
          (canWrite ? (
            <>
              <RecordSection id="list-details" title="Name and description">
                <MailForm
                  action={saveListAction}
                  fields={{ list_id: list.list_id }}
                  submitLabel="Save"
                >
                  <Field id="list-edit-name" label="Name">
                    <Input
                      id="list-edit-name"
                      name="name"
                      defaultValue={list.name}
                      maxLength={120}
                      required
                    />
                  </Field>
                  <Field id="list-edit-description" label="What it is">
                    <Textarea
                      id="list-edit-description"
                      name="description"
                      defaultValue={list.description}
                      rows={2}
                      maxLength={400}
                    />
                  </Field>
                </MailForm>
              </RecordSection>
              <RecordSection id="list-archive" title={archived ? "Restore" : "Archive"}>
                <p className="page-note">
                  {archived
                    ? "Restoring lets people be added and campaigns use it again."
                    : "An archived list keeps its people and its history but takes no one new, and no new campaign can use it. A list a waiting campaign uses cannot be archived."}
                </p>
                <MailForm
                  action={archiveListAction}
                  fields={{ list_id: list.list_id, restore: archived ? "1" : "0" }}
                  submitLabel={archived ? "Restore the list" : "Archive the list"}
                  variant={archived ? "default" : "danger"}
                />
              </RecordSection>
            </>
          ) : (
            <Callout tone="neutral">Your role reads lists.</Callout>
          ))}
      </RecordGrid>
    </>
  );
}
