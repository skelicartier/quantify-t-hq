import Link from "next/link";

import { CompanyTabs } from "@/components/data/company/company-tabs";
import { DataUnavailable } from "@/components/data/data-down";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readMembers, type EntryRow, type MembersPage } from "@/lib/data/api/members";
import {
  ENTRY_KINDS,
  HOLDER_KINDS,
  MEMBERS_VIEWS,
  NOT_LEGAL_ADVICE,
  RESIDENCIES,
  SHARE_KINDS,
  countWords,
  dayShort,
  dayWords,
  rangeWords,
  rupees,
} from "@/lib/data/labels-registers";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

import {
  addClassAction,
  addMemberAction,
  cancelCertificateAction,
  issueCertificateAction,
  recordEntryAction,
  reverseEntryAction,
} from "./actions";
import "./members.css";

export const metadata = { title: "Members" };
export const dynamic = "force-dynamic";

const BASE = "/data/company/members";
const ABOUT = `The register of members (MGT-1): every holder, every entry and every share certificate, kept on this computer. Holdings adds the register up; it is not a model. Allotments from the round come in from each investor's closing checklist. ${NOT_LEGAL_ADVICE}`;
const CERTIFICATES_FOLDER = "04 Cap table and share issues";

type View = keyof typeof MEMBERS_VIEWS;
type Params = Record<string, string | string[] | undefined>;

export default async function MembersPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const parameters = await searchParams;
  const asked = firstSearchValue(parameters.view) ?? "register";
  const view: View = asked in MEMBERS_VIEWS ? (asked as View) : "register";
  const read = allowed ? await dataRead(() => readMembers(view)) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Members"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">
              {formatNumber(data.members.length)} {data.members.length === 1 ? "member" : "members"}
            </span>
          ) : undefined
        }
        actions={data ? <HeaderActions data={data} /> : undefined}
      />
      <div className="page-content">
        <CompanyTabs current="members" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-members">
            <p className="page-note">{NOT_LEGAL_ADVICE}</p>
            {read.data.classes.length === 0 ? (
              <EmptyState
                title="No classes of shares yet"
                description="Add the class the company issued at incorporation, such as “Equity shares of ₹10 each”, then the subscribers to the memorandum with their shares."
              />
            ) : (
              <>
                <SegmentedLinks
                  label="View"
                  items={(Object.keys(MEMBERS_VIEWS) as View[]).map((key) => ({
                    href: key === "register" ? BASE : `${BASE}?view=${key}`,
                    label: MEMBERS_VIEWS[key],
                    current: view === key,
                  }))}
                />
                <p className="hqdata-print-only">View: {MEMBERS_VIEWS[view]}</p>
                {view === "register" && <RegisterView data={read.data} />}
                {view === "certificates" && <CertificatesView data={read.data} />}
                {view === "holdings" && <HoldingsView data={read.data} />}
              </>
            )}
          </div>
        )}
      </div>
    </>
  );
}

function ClassOptions({ data }: { data: MembersPage }) {
  return (
    <>
      {data.classes.map((item) => (
        <option key={item.class_id} value={item.class_id}>
          {item.name}
        </option>
      ))}
    </>
  );
}

function MemberOptions({ data }: { data: MembersPage }) {
  return (
    <>
      {data.members.map((member) => (
        <option key={member.member_id} value={member.member_id}>
          {member.folio} · {member.name}
        </option>
      ))}
    </>
  );
}

function HeaderActions({ data }: { data: MembersPage }) {
  const none = data.classes.length === 0;
  const today = data.today;
  return (
    <>
      <Popover label="Add a class of shares" variant={none ? "primary" : "default"} align="end">
        <MailForm action={addClassAction} submitLabel="Add the class" pendingLabel="Adding…">
          <Field id="class-name" label="Name">
            <Input
              id="class-name"
              name="name"
              required
              maxLength={120}
              placeholder="Equity shares of ₹10 each"
            />
          </Field>
          <Field id="class-kind" label="Kind">
            <Select id="class-kind" name="kind" defaultValue="equity">
              {Object.entries(SHARE_KINDS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="class-nominal" label="Nominal value a share (₹)">
            <Input
              id="class-nominal"
              name="nominal"
              type="number"
              min={1}
              max={100_000}
              step={1}
              required
              defaultValue="10"
            />
          </Field>
        </MailForm>
      </Popover>
      <Popover label="Add a member" align="end" width="wide">
        <MailForm action={addMemberAction} submitLabel="Add the member" pendingLabel="Adding…">
          <Field id="member-name" label="Name">
            <Input id="member-name" name="name" required maxLength={200} />
          </Field>
          <div className="hqdata-members-form__pair">
            <Field id="member-kind" label="Kind">
              <Select id="member-kind" name="kind" defaultValue="person">
                {Object.entries(HOLDER_KINDS).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field id="member-became" label="Became a member on">
              <Input
                id="member-became"
                name="became_member_on"
                type="date"
                required
                max={today}
                defaultValue={today}
              />
            </Field>
          </div>
          <Field id="member-email" label="Email">
            <Input id="member-email" name="email" type="email" maxLength={254} />
          </Field>
          <Field id="member-address" label="Address">
            <Textarea id="member-address" name="address" rows={2} maxLength={400} />
          </Field>
          <div className="hqdata-members-form__pair">
            <Field
              id="member-id-number"
              label="Identity number"
              hint="The PAN for a resident; a passport or registration number otherwise."
            >
              <Input id="member-id-number" name="id_number" maxLength={40} />
            </Field>
            <Field id="member-residency" label="Residency">
              <Select id="member-residency" name="residency" defaultValue="">
                {Object.entries(RESIDENCIES).map(([key, label]) => (
                  <option key={key} value={key}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field id="member-nationality" label="Nationality">
            <Input id="member-nationality" name="nationality" maxLength={60} />
          </Field>
          <Field
            id="member-backers"
            label="Who is behind it"
            hint="For a syndicate or fund that holds as one: its backers, as you know them."
          >
            <Textarea id="member-backers" name="backers_note" rows={2} maxLength={1_000} />
          </Field>
        </MailForm>
      </Popover>
      {!none && (
        <Popover label="Record an entry" align="end" width="wide">
          <MailForm
            action={recordEntryAction}
            submitLabel="Record the entry"
            pendingLabel="Recording…"
          >
            <div className="hqdata-members-form__pair">
              <Field id="entry-member" label="Member">
                <Select id="entry-member" name="member_id" required defaultValue="">
                  <option value="" disabled>
                    Choose a member
                  </option>
                  <MemberOptions data={data} />
                </Select>
              </Field>
              <Field id="entry-class" label="Class">
                <Select
                  id="entry-class"
                  name="class_id"
                  required
                  defaultValue={data.classes[0]?.class_id}
                >
                  <ClassOptions data={data} />
                </Select>
              </Field>
            </div>
            <div className="hqdata-members-form__pair">
              <Field id="entry-kind" label="Kind">
                <Select id="entry-kind" name="kind" defaultValue="allotment">
                  {Object.entries(ENTRY_KINDS).map(([key, label]) => (
                    <option key={key} value={key}>
                      {label}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field id="entry-shares" label="Shares">
                <Input id="entry-shares" name="shares" type="number" min={1} step={1} required />
              </Field>
            </div>
            <div className="hqdata-members-form__pair">
              <Field id="entry-from" label="Distinctive numbers from">
                <Input id="entry-from" name="distinctive_from" type="number" min={1} step={1} />
              </Field>
              <Field id="entry-to" label="to">
                <Input id="entry-to" name="distinctive_to" type="number" min={1} step={1} />
              </Field>
            </div>
            <div className="hqdata-members-form__pair">
              <Field id="entry-price" label="Price a share (₹)">
                <Input id="entry-price" name="price_per_share" type="number" min={0} step={1} />
              </Field>
              <Field id="entry-paid" label="Paid up a share (₹)">
                <Input id="entry-paid" name="paid_up_per_share" type="number" min={0} step={1} />
              </Field>
            </div>
            <div className="hqdata-members-form__pair">
              <Field id="entry-on" label="On">
                <Input
                  id="entry-on"
                  name="on"
                  type="date"
                  required
                  max={today}
                  defaultValue={today}
                />
              </Field>
              <Field id="entry-entered" label="Entered in the register on">
                <Input
                  id="entry-entered"
                  name="entered_on"
                  type="date"
                  required
                  max={today}
                  defaultValue={today}
                />
              </Field>
            </div>
            {data.resolutions && (
              <Field id="entry-resolution" label="Board resolution">
                <Select id="entry-resolution" name="resolution_id" defaultValue="typed">
                  <option value="typed">Typed below</option>
                  {data.resolutions.map((item) => (
                    <option key={item.resolution_id} value={item.resolution_id}>
                      {item.title} · {item.meeting_title}
                    </option>
                  ))}
                </Select>
              </Field>
            )}
            <Field id="entry-words" label="Or describe the resolution">
              <Input id="entry-words" name="resolution_words" maxLength={300} />
            </Field>
            <Field id="entry-note" label="Note">
              <Textarea id="entry-note" name="note" rows={2} maxLength={1_000} />
            </Field>
            <p className="field__hint">
              Allotments to investors come from their closing checklist, so their filings are dated.
            </p>
          </MailForm>
        </Popover>
      )}
      {!none && (
        <Popover label="Issue a certificate" align="end" width="wide">
          <MailForm action={issueCertificateAction} submitLabel="Issue it" pendingLabel="Issuing…">
            <div className="hqdata-members-form__pair">
              <Field id="certificate-member" label="Member">
                <Select id="certificate-member" name="member_id" required defaultValue="">
                  <option value="" disabled>
                    Choose a member
                  </option>
                  <MemberOptions data={data} />
                </Select>
              </Field>
              <Field id="certificate-class" label="Class">
                <Select
                  id="certificate-class"
                  name="class_id"
                  required
                  defaultValue={data.classes[0]?.class_id}
                >
                  <ClassOptions data={data} />
                </Select>
              </Field>
            </div>
            <div className="hqdata-members-form__pair">
              <Field id="certificate-shares" label="Shares">
                <Input
                  id="certificate-shares"
                  name="shares"
                  type="number"
                  min={1}
                  step={1}
                  required
                />
              </Field>
              <Field id="certificate-number" label="Number">
                <Input id="certificate-number" name="number" maxLength={40} placeholder="SC-001" />
              </Field>
            </div>
            <div className="hqdata-members-form__pair">
              <Field id="certificate-from" label="Distinctive numbers from">
                <Input
                  id="certificate-from"
                  name="distinctive_from"
                  type="number"
                  min={1}
                  step={1}
                />
              </Field>
              <Field id="certificate-to" label="to">
                <Input id="certificate-to" name="distinctive_to" type="number" min={1} step={1} />
              </Field>
            </div>
            <Field id="certificate-issued" label="Issued on">
              <Input
                id="certificate-issued"
                name="issued_on"
                type="date"
                required
                max={today}
                defaultValue={today}
              />
            </Field>
            <div className="hqdata-members-form__pair">
              <Field id="certificate-stamp" label="Stamp duty paid (₹)">
                <Input id="certificate-stamp" name="stamp_amount" type="number" min={0} step={1} />
              </Field>
              <Field id="certificate-reference" label="Stamp reference">
                <Input id="certificate-reference" name="stamp_reference" maxLength={120} />
              </Field>
            </div>
            <CopyFields
              prefix="certificate"
              label="Copy"
              files={data.files}
              filesHere={data.files_here}
              folder={CERTIFICATES_FOLDER}
            />
          </MailForm>
        </Popover>
      )}
      <a className={buttonClass({ size: "small" })} href={`${BASE}/export`}>
        Download (CSV)
      </a>
    </>
  );
}

const MEMBER_COLUMNS = [
  { key: "folio", label: "Folio" },
  { key: "name", label: "Name", width: "22%" },
  { key: "became", label: "Became a member" },
  { key: "email", label: "Email" },
  { key: "address", label: "Address" },
  { key: "holds", label: "Holds", width: "26%" },
];

const ENTRY_COLUMNS = [
  { key: "folio", label: "Folio" },
  { key: "member", label: "Member" },
  { key: "entry", label: "Entry" },
  { key: "class", label: "Class" },
  { key: "shares", label: "Shares", align: "end" as const },
  { key: "range", label: "Distinctive numbers" },
  { key: "on", label: "On" },
  { key: "entered", label: "Entered" },
  { key: "certificate", label: "Certificate" },
  { key: "state", label: "State" },
  { key: "change", label: "Change", align: "end" as const },
];

function RegisterView({ data }: { data: MembersPage }) {
  return (
    <>
      <DataTable
        caption="Members"
        columns={MEMBER_COLUMNS}
        columnMenu={false}
        isEmpty={data.members.length === 0}
        empty={
          <EmptyState
            compact
            title="No members yet"
            description="Add the subscribers to the memorandum first, then record their shares as entries."
          />
        }
      >
        {data.members.map((member) => (
          <tr key={member.member_id} id={`member-${member.member_id}`}>
            <td className="nowrap">{member.folio}</td>
            <td>
              <span className="table-title">{member.name}</span>
              <span className="table-sub">
                {HOLDER_KINDS[member.kind]} · {RESIDENCIES[member.residency]}
              </span>
              {member.backers_note && (
                <span className="table-sub table-sub--prose" title={member.backers_note}>
                  Behind it: {member.backers_note}
                </span>
              )}
            </td>
            <td className="nowrap">{dayWords(member.became_member_on)}</td>
            <td>{member.email || <span className="quiet">Not given</span>}</td>
            <td>
              {member.address ? (
                <span className="table-sub--prose" title={member.address}>
                  {member.address}
                </span>
              ) : (
                <span className="quiet">Not given</span>
              )}
            </td>
            <td>
              {member.holds.length === 0 ? (
                <span className="quiet">No shares held</span>
              ) : (
                member.holds.map((hold) => (
                  <span key={hold.class_id} className="hqdata-members__holds">
                    {hold.words}
                  </span>
                ))
              )}
            </td>
          </tr>
        ))}
      </DataTable>
      <DataTable
        caption="Entries"
        columns={ENTRY_COLUMNS}
        columnMenu={false}
        isEmpty={data.entries.length === 0}
        empty={
          <p className="page-note">No entries yet. Record each member’s shares as an entry.</p>
        }
      >
        {data.entries.map((entry) => (
          <EntryLine key={entry.entry_id} entry={entry} today={data.today} />
        ))}
      </DataTable>
    </>
  );
}

function EntryLine({ entry, today }: { entry: EntryRow; today: string }) {
  const reversed = entry.reversed;
  return (
    <tr
      id={`entry-${entry.entry_id}`}
      className={reversed ? "hqdata-members__row--reversed" : undefined}
    >
      <td className="nowrap">{entry.folio}</td>
      <td>{entry.member_name}</td>
      <td>
        {ENTRY_KINDS[entry.kind]}
        {entry.closing_key && (
          <span className="table-sub">
            {entry.investor_id ? (
              <Link className="text-link" href={`/data/investors/${entry.investor_id}`}>
                From the closing of {entry.member_name}
              </Link>
            ) : (
              `From the closing of ${entry.member_name}`
            )}
          </span>
        )}
        {(entry.resolution_title || entry.resolution.words) && (
          <span className="table-sub">
            {entry.resolution_href ? (
              <Link className="text-link" href={entry.resolution_href}>
                {entry.resolution_title}
              </Link>
            ) : (
              entry.resolution.words
            )}
          </span>
        )}
      </td>
      <td>{entry.class_name}</td>
      <td className="data-table__num">{formatNumber(entry.shares)}</td>
      <td className="nowrap">{rangeWords(entry.distinctive)}</td>
      <td className="nowrap">{dayWords(entry.on)}</td>
      <td className="nowrap">
        {dayWords(entry.entered_on)}
        {entry.late_days > 7 && (
          <span className="table-sub hqdata-attention">
            {countWords(entry.late_days)} days after
          </span>
        )}
      </td>
      <td>{entry.certificate ?? <span className="quiet">None</span>}</td>
      <td>
        {reversed ? (
          <span className="quiet">
            Reversed {dayShort(reversed.on)}: {reversed.why}
          </span>
        ) : (
          "In the register"
        )}
      </td>
      <td>
        {!reversed && (
          <Popover label="Reverse it" align="end">
            <MailForm
              action={reverseEntryAction}
              fields={{ entry_id: entry.entry_id }}
              submitLabel="Reverse the entry"
              pendingLabel="Reversing…"
              variant="danger"
            >
              <Field id={`reverse-${entry.entry_id.slice(0, 8)}-on`} label="On">
                <Input
                  id={`reverse-${entry.entry_id.slice(0, 8)}-on`}
                  name="on"
                  type="date"
                  max={today}
                  defaultValue={today}
                />
              </Field>
              <Field id={`reverse-${entry.entry_id.slice(0, 8)}-why`} label="Why">
                <Input
                  id={`reverse-${entry.entry_id.slice(0, 8)}-why`}
                  name="why"
                  required
                  maxLength={300}
                />
              </Field>
              <p className="field__hint">A reversed entry stays in the register, struck through.</p>
            </MailForm>
          </Popover>
        )}
      </td>
    </tr>
  );
}

const CERTIFICATE_COLUMNS = [
  { key: "number", label: "Number" },
  { key: "member", label: "Member" },
  { key: "class", label: "Class" },
  { key: "shares", label: "Shares", align: "end" as const },
  { key: "range", label: "Distinctive numbers" },
  { key: "issued", label: "Issued" },
  { key: "stamp", label: "Stamp duty" },
  { key: "copy", label: "Copy" },
  { key: "state", label: "State" },
  { key: "change", label: "Change", align: "end" as const },
];

function CertificatesView({ data }: { data: MembersPage }) {
  return (
    <DataTable
      caption="Share certificates"
      columns={CERTIFICATE_COLUMNS}
      columnMenu={false}
      isEmpty={data.certificates.length === 0}
      empty={
        <EmptyState
          compact
          title="No certificates yet"
          description="Issue a certificate for each holding; a copy can go into Files."
        />
      }
    >
      {data.certificates.map((certificate) => {
        const short = certificate.certificate_id.slice(0, 8);
        return (
          <tr
            key={certificate.certificate_id}
            id={`certificate-${certificate.certificate_id}`}
            className={certificate.cancelled ? "hqdata-members__row--reversed" : undefined}
          >
            <td className="nowrap">{certificate.number}</td>
            <td>
              {certificate.folio} · {certificate.member_name}
            </td>
            <td>{certificate.class_name}</td>
            <td className="data-table__num">{formatNumber(certificate.shares)}</td>
            <td className="nowrap">{rangeWords(certificate.distinctive)}</td>
            <td className="nowrap">{dayWords(certificate.issued_on)}</td>
            <td>
              {certificate.stamp.amount !== null || certificate.stamp.reference
                ? [
                    certificate.stamp.amount !== null ? rupees(certificate.stamp.amount) : "",
                    certificate.stamp.reference,
                  ]
                    .filter(Boolean)
                    .join(" · ")
                : "Not recorded"}
            </td>
            <td>
              {certificate.file ? (
                <Link className="text-link" href={`/data/files/${certificate.file.file_id}`}>
                  Copy
                </Link>
              ) : (
                <span className="quiet">None</span>
              )}
            </td>
            <td>
              {certificate.cancelled ? (
                <span className="quiet">
                  Cancelled {dayShort(certificate.cancelled.on)}: {certificate.cancelled.why}
                </span>
              ) : (
                "Issued"
              )}
            </td>
            <td>
              {!certificate.cancelled && (
                <Popover label="Cancel it" align="end">
                  <MailForm
                    action={cancelCertificateAction}
                    fields={{ certificate_id: certificate.certificate_id }}
                    submitLabel="Cancel the certificate"
                    pendingLabel="Cancelling…"
                    variant="danger"
                  >
                    <Field id={`cancel-${short}-on`} label="On">
                      <Input
                        id={`cancel-${short}-on`}
                        name="on"
                        type="date"
                        max={data.today}
                        defaultValue={data.today}
                      />
                    </Field>
                    <Field id={`cancel-${short}-why`} label="Why">
                      <Input id={`cancel-${short}-why`} name="why" required maxLength={300} />
                    </Field>
                    <p className="field__hint">A cancelled certificate stays in the register.</p>
                  </MailForm>
                </Popover>
              )}
            </td>
          </tr>
        );
      })}
    </DataTable>
  );
}

const HOLDING_COLUMNS = [
  { key: "member", label: "Member", width: "28%" },
  { key: "folio", label: "Folio" },
  { key: "class", label: "Class" },
  { key: "shares", label: "Shares", align: "end" as const },
  { key: "of", label: "Of the class" },
];

function HoldingsView({ data }: { data: MembersPage }) {
  return (
    <>
      <p className="page-note">
        The register of members added up: the shares each member holds now, per class. No options,
        conversions to come or valuations: this is not a cap-table model.
      </p>
      <DataTable
        caption="Holdings, from the register"
        columns={HOLDING_COLUMNS}
        columnMenu={false}
        isEmpty={data.holdings.length === 0}
        empty={<p className="page-note">Nobody holds shares in the register yet.</p>}
      >
        {data.holdings.map((holding) => (
          <tr key={`${holding.member_id}:${holding.class_id}`}>
            <td>
              <Link className="text-link" href={`${BASE}#member-${holding.member_id}`}>
                {holding.name}
              </Link>
            </td>
            <td className="nowrap">{holding.folio}</td>
            <td>{holding.class_name}</td>
            <td className="data-table__num">{formatNumber(holding.shares)}</td>
            <td>{holding.words}</td>
          </tr>
        ))}
      </DataTable>
      <ul className="hqdata-members__totals">
        {data.totals.map((total) => (
          <li key={total.class_id}>
            {total.class_name}: {formatNumber(total.issued)} issued.
          </li>
        ))}
      </ul>
    </>
  );
}
