import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { InsuranceFields } from "@/components/data/assurance/assurance-fields";
import { AssuranceTabs } from "@/components/data/assurance/assurance-tabs";
import { CopyFields } from "@/components/data/meetings/copy-fields";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Popover } from "@/components/ui/popover";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readInsurance, type InsurancePage, type InsuranceRow } from "@/lib/data/api/assurance";
import { dayWords } from "@/lib/data/labels-company";
import { INSURANCE_EMPTY } from "@/lib/data/labels-assurance";
import { NOT_ADVICE } from "@/lib/data/labels-controls";
import { dataRead } from "@/lib/data/read";

import { addInsuranceAction, renewInsuranceAction, updateInsuranceAction } from "../actions";
import "../assurance.css";

export const metadata = { title: "Insurance" };
export const dynamic = "force-dynamic";

const BASE = "/data/assurance/insurance";
const ABOUT = `The company's insurance policies: the cover, the insurer, the amount, the days it runs and the certificate. A renewal is a new policy that continues the old one. ${NOT_ADVICE}`;

const EMPTY_VALUES = {
  kind: "cyber",
  name: "",
  insurer: "",
  policy_number: "",
  cover_minor: null,
  currency: "INR",
  premium_minor: null,
  starts_on: null,
  ends_on: null,
  broker: "",
  notes: "",
};

/** Assurance › Insurance (ws-notes/security/spec.md §8.6). */
export default async function InsurancePage() {
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(readInsurance) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Insurance"
        description={ABOUT}
        actions={
          data ? (
            <Popover label="Add a policy" variant="primary" align="end" width="wide">
              <MailForm
                action={addInsuranceAction}
                submitLabel="Record it"
                pendingLabel="Recording…"
              >
                <InsuranceFields prefix="insurance-new" values={EMPTY_VALUES} />
                <CopyFields
                  prefix="insurance-new"
                  label="The certificate"
                  files={data.files}
                  filesHere={data.files_here}
                  folder="Security › Insurance"
                />
              </MailForm>
            </Popover>
          ) : undefined
        }
      />
      <div className="page-content">
        <AssuranceTabs current="insurance" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-assurance">
            <Policies page={read.data} />
            <p className="page-note">{NOT_ADVICE}</p>
          </div>
        )}
      </div>
    </>
  );
}

function Row({ row, page }: { row: InsuranceRow; page: InsurancePage }) {
  const fields = { insurance_id: row.insurance_id };
  return (
    <tr id={`insurance-${row.insurance_id}`}>
      <td>
        <span className="table-title">{row.cover_label}</span>
        <span className={row.ended_unrenewed ? "table-sub hqdata-assurance__late" : "table-sub"}>
          {row.cover_words}
        </span>
        {row.broker && <span className="table-sub">Through {row.broker}</span>}
        <div className="hqdata-assurance__acts">
          <Popover label="Edit" align="start" width="wide">
            <MailForm
              action={updateInsuranceAction}
              fields={fields}
              submitLabel="Save"
              pendingLabel="Saving…"
            >
              <InsuranceFields prefix={`insurance-${row.insurance_id}`} values={row} />
              <CopyFields
                prefix={`insurance-${row.insurance_id}`}
                label="The certificate"
                files={page.files}
                filesHere={page.files_here}
                folder="Security › Insurance"
              />
            </MailForm>
          </Popover>
          {!row.renewed_by && (
            <Popover label="Record the renewal" align="start" width="wide">
              <MailForm
                action={renewInsuranceAction}
                fields={fields}
                submitLabel="Record it"
                pendingLabel="Saving…"
              >
                <p className="field__hint">
                  The new policy continues this one; its cover and insurer are carried over.
                </p>
                <InsuranceFields
                  prefix={`renew-${row.insurance_id}`}
                  values={{ ...row, policy_number: "", starts_on: null, ends_on: null }}
                />
                <CopyFields
                  prefix={`renew-${row.insurance_id}`}
                  label="The new certificate"
                  files={page.files}
                  filesHere={page.files_here}
                  folder="Security › Insurance"
                />
              </MailForm>
            </Popover>
          )}
        </div>
      </td>
      <td>{row.insurer}</td>
      <td className="mono">{row.policy_number || <span className="quiet">—</span>}</td>
      <td className="nowrap">{row.amount_words || <span className="quiet">—</span>}</td>
      <td className="nowrap">
        {row.starts_on ? dayWords(row.starts_on) : <span className="quiet">—</span>}
      </td>
      <td className="nowrap">
        {row.ends_on ? (
          <span className={row.ended_unrenewed ? "hqdata-assurance__late" : undefined}>
            {dayWords(row.ends_on)}
          </span>
        ) : (
          <span className="quiet">—</span>
        )}
      </td>
      <td>
        {row.certificate_file ? (
          <Link className="text-link" href={`/data/files/${row.certificate_file.file_id}`}>
            {row.certificate_file.title}
          </Link>
        ) : (
          <span className="quiet">None attached</span>
        )}
      </td>
    </tr>
  );
}

function Policies({ page }: { page: InsurancePage }) {
  return (
    <section data-section="insurance-list">
      {page.insurance.length > 0 && (
        <div className="hqdata-assurance__links">
          <a className="text-link" href={`${BASE}/export`}>
            Download as CSV
          </a>
        </div>
      )}
      <DataTable
        caption="Insurance"
        columns={[
          { key: "cover", label: "Cover", width: "26%" },
          { key: "insurer", label: "Insurer" },
          { key: "number", label: "Policy number" },
          { key: "amount", label: "Amount" },
          { key: "from", label: "From" },
          { key: "to", label: "To" },
          { key: "certificate", label: "Certificate" },
        ]}
        columnMenu={false}
        scroll={false}
        isEmpty={page.insurance.length === 0}
        empty={<EmptyState compact title="No insurance" description={INSURANCE_EMPTY} />}
      >
        {page.insurance.map((row) => (
          <Row key={row.insurance_id} row={row} page={page} />
        ))}
      </DataTable>
    </section>
  );
}
