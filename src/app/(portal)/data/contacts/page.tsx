import { DataUnavailable } from "@/components/data/data-down";
import { ContactFields, NEW_CONTACT } from "@/components/data/contacts/contact-fields";
import { counted } from "@/components/data/notes/note-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { RowAction } from "@/components/ui/row-action";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readContacts, type Contact, type ContactsPage } from "@/lib/data/api/contacts";
import { CONTACT_ROLES, CONTACT_ROLE_ORDER } from "@/lib/data/labels";
import { dataRead } from "@/lib/data/read";
import { formatNumber } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

import "@/components/data/notes/notes.css";
import { addContactAction, archiveContactAction, updateContactAction } from "./actions";

export const metadata = { title: "Contacts" };
export const dynamic = "force-dynamic";

const BASE = "/data/contacts";
const ABOUT =
  "The people the company relies on: the chartered accountant, the company secretary, the lawyer, the bank, the auditor and the people who introduce you to investors. Kept on this computer. They are never added to All leads or to a Mail merge list.";

const COLUMNS = [
  { key: "name", label: "Name", width: "20%" },
  { key: "role", label: "Role" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Phone" },
  { key: "notes", label: "Notes", width: "26%" },
  { key: "change", label: "Change", align: "end" as const },
];

type Params = Record<string, string | string[] | undefined>;

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Params> }) {
  const { allowed } = await requireData(BASE);
  const parameters = await searchParams;
  const asked = firstSearchValue(parameters.role) ?? "";
  const role = asked in CONTACT_ROLES ? asked : "";
  const archived = firstSearchValue(parameters.archived) === "1";
  const open = firstSearchValue(parameters.new) === "1";
  const read = allowed ? await dataRead(() => readContacts({ role, archived })) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Contacts"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">{counted(data.counts.all ?? 0, "contact")}</span>
          ) : undefined
        }
        actions={
          data ? (
            <Popover
              label="Add a contact"
              variant="primary"
              align="end"
              width="wide"
              defaultOpen={open}
            >
              <MailForm
                action={addContactAction}
                submitLabel="Add the contact"
                pendingLabel="Adding…"
              >
                <ContactFields prefix="contact-new" values={NEW_CONTACT} />
              </MailForm>
            </Popover>
          ) : undefined
        }
      />
      <div className="page-content">
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <Contacts page={read.data} role={role} archived={archived} />
        )}
      </div>
    </>
  );
}

function Contacts({
  page,
  role,
  archived,
}: {
  page: ContactsPage;
  role: string;
  archived: boolean;
}) {
  const count = (key: string) => formatNumber(page.counts[key] ?? 0);
  const nobody = (page.counts.all ?? 0) === 0 && (page.counts.archived ?? 0) === 0;
  return (
    <div className="hqdata-notes">
      <SegmentedLinks
        label="Role"
        items={[
          { href: BASE, label: `All ${count("all")}`, current: !role && !archived },
          ...CONTACT_ROLE_ORDER.map((key) => ({
            href: `${BASE}?role=${key}`,
            label: `${CONTACT_ROLES[key]} ${count(key)}`,
            current: !archived && role === key,
          })),
          { href: `${BASE}?archived=1`, label: `Archived ${count("archived")}`, current: archived },
        ]}
      />
      <p className="hqdata-print-only">
        {archived
          ? "Archived contacts"
          : role
            ? `Role: ${CONTACT_ROLES[role as Contact["role"]]}`
            : "Every role"}
      </p>
      <DataTable
        caption="Contacts"
        columns={COLUMNS}
        columnMenu={false}
        scroll={false}
        isEmpty={page.contacts.length === 0}
        empty={
          nobody ? (
            <EmptyState
              compact
              title="No contacts yet"
              description="Add the CA, the CS, the lawyer, the bank and the auditor first."
            />
          ) : (
            <EmptyState
              compact
              title={archived ? "Nothing archived" : "Nobody here yet"}
              description={
                archived
                  ? "An archived contact stays here, and can be restored."
                  : "No live contact has this role."
              }
            />
          )
        }
      >
        {page.contacts.map((contact) => (
          <ContactRow key={contact.contact_id} contact={contact} />
        ))}
      </DataTable>
    </div>
  );
}

/** A number a phone can dial: digits and a leading +. */
const dialled = (phone: string) => phone.replace(/[^+0-9]/g, "");

function ContactRow({ contact }: { contact: Contact }) {
  const fields = { contact_id: contact.contact_id };
  const live = contact.archived === null;
  return (
    <tr
      id={`contact-${contact.contact_id}`}
      className={live ? undefined : "hqdata-notes__row--withdrawn"}
    >
      <td>
        <span className="table-title">{contact.name}</span>
        {contact.firm && <span className="table-sub">{contact.firm}</span>}
      </td>
      <td>{CONTACT_ROLES[contact.role]}</td>
      <td>
        {contact.email ? (
          <a className="text-link" href={`mailto:${contact.email}`}>
            {contact.email}
          </a>
        ) : (
          <span className="table-sub">Not given</span>
        )}
      </td>
      <td className="nowrap">
        {contact.phone ? (
          <a className="text-link" href={`tel:${dialled(contact.phone)}`}>
            {contact.phone}
          </a>
        ) : (
          <span className="table-sub">Not given</span>
        )}
      </td>
      <td>
        {contact.notes ? (
          <span className="table-sub table-sub--prose" title={contact.notes}>
            {contact.notes}
          </span>
        ) : (
          <span className="table-sub">None</span>
        )}
      </td>
      <td>
        <div className="hqdata-notes__acts">
          {live && (
            <Popover label="Edit" align="end" width="wide">
              <MailForm
                action={updateContactAction}
                fields={fields}
                submitLabel="Save"
                pendingLabel="Saving…"
              >
                <ContactFields
                  prefix={`contact-${contact.contact_id.slice(0, 8)}`}
                  values={contact}
                />
              </MailForm>
            </Popover>
          )}
          <RowAction
            action={archiveContactAction}
            fields={{ ...fields, to: live ? "archive" : "restore" }}
            buttons={[
              {
                label: live ? "Archive" : "Restore",
                className: "btn btn--small btn--ghost",
                ariaLabel: `${live ? "Archive" : "Restore"}: ${contact.name}`,
                pendingLabel: live ? "Archiving…" : "Restoring…",
              },
            ]}
          />
        </div>
      </td>
    </tr>
  );
}
