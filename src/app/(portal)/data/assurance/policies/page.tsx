import Link from "next/link";

import { DataUnavailable } from "@/components/data/data-down";
import { AssuranceTabs } from "@/components/data/assurance/assurance-tabs";
import { PolicyActions } from "@/components/data/policies/policy-actions";
import { ControlRefNote } from "@/components/data/security/control-ref";
import { MailForm } from "@/components/mail/mail-form";
import { PageHeader } from "@/components/shell/page-header";
import { buttonClass } from "@/components/ui/button";
import { Callout } from "@/components/ui/callout";
import { DataTable } from "@/components/ui/data-table";
import { EmptyState } from "@/components/ui/empty-state";
import { Field, Input } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { DATA_ROLE_LINE, requireData } from "@/lib/data/access";
import { readPolicies, type PoliciesPage, type PolicyView } from "@/lib/data/api/policies";
import { dayWords } from "@/lib/data/labels-company";
import { POLICIES_ABOUT, POLICY_STATES } from "@/lib/data/labels-assurance";
import { NOT_ADVICE, ofWords, type ControlKey } from "@/lib/data/labels-controls";
import { dataRead } from "@/lib/data/read";

import {
  addOwnPolicyAction,
  linkPolicyAction,
  policyDetailsAction,
  policyNotNeededAction,
} from "../actions";
import "../assurance.css";

export const metadata = { title: "Policies" };
export const dynamic = "force-dynamic";

const BASE = "/data/assurance/policies";
const ABOUT = `${POLICIES_ABOUT} ${NOT_ADVICE}`;
const ACTIONS = {
  link: linkPolicyAction,
  details: policyDetailsAction,
  notNeeded: policyNotNeededAction,
};

/**
 * Assurance › Policies (ws-notes/security/spec.md §8.6): the eleven a buyer asks for and his
 * own, each with the Files document linked as it, its version and next review (Files' own),
 * who owns and approved it, and its state. HQ writes no policy.
 */
export default async function PoliciesPage() {
  const { allowed } = await requireData(BASE);
  const read = allowed ? await dataRead(readPolicies) : null;
  const data = read?.ok ? read.data : null;
  return (
    <>
      <PageHeader
        title="Policies"
        description={ABOUT}
        meta={
          data ? (
            <span className="quiet">
              {ofWords(data.counts.current, data.counts.expected, "current")}
              {data.counts.lapsed > 0 ? ` · ${data.counts.lapsed} lapsed` : ""}
            </span>
          ) : undefined
        }
        actions={
          data ? (
            <a className={buttonClass({ size: "small" })} href={`${BASE}/export`}>
              Download
            </a>
          ) : undefined
        }
      />
      <div className="page-content">
        <AssuranceTabs current="policies" />
        {!allowed || !read ? (
          <Callout tone="neutral">{DATA_ROLE_LINE}</Callout>
        ) : !read.ok ? (
          <DataUnavailable failure={read} />
        ) : (
          <div className="hqdata-assurance">
            <Expected page={read.data} />
            <Own page={read.data} />
            <p className="page-note">{NOT_ADVICE}</p>
          </div>
        )}
      </div>
    </>
  );
}

function PolicyRow({ row, page }: { row: PolicyView; page: PoliciesPage }) {
  const state = POLICY_STATES[row.state];
  return (
    <tr id={`policy-${row.key}`}>
      <td>
        <span className="table-title">{row.title}</span>
        {row.why && <span className="table-sub">{row.why}</span>}
        {row.controls.length > 0 && <ControlRefNote refs={row.controls as ControlKey[]} />}
        {row.trust_words && <span className="table-sub">{row.trust_words}</span>}
        <PolicyActions
          row={row}
          files={page.files}
          filesHere={page.files_here}
          today={page.today}
          actions={ACTIONS}
        />
      </td>
      <td>
        {row.file ? (
          <Link className="text-link" href={row.file.href}>
            {row.file.title}
          </Link>
        ) : (
          <span className="quiet">None linked</span>
        )}
      </td>
      <td className="nowrap">{row.file ? row.file.version : <span className="quiet">—</span>}</td>
      <td>{row.owner || <span className="quiet">—</span>}</td>
      <td>
        {row.approved_by || row.approved_on ? (
          <>
            {row.approved_by}
            {row.approved_on && <span className="table-sub">{dayWords(row.approved_on)}</span>}
          </>
        ) : (
          <span className="quiet">—</span>
        )}
      </td>
      <td className="nowrap">
        {row.next_review ? (
          <span className={row.state === "lapsed" ? "hqdata-assurance__late" : undefined}>
            {dayWords(row.next_review)}
          </span>
        ) : (
          <span className="quiet">—</span>
        )}
      </td>
      <td>
        <StatusPill value={row.state} label={state.label} tone={state.tone} />
        {row.state !== "no_document" && <span className="table-sub">{row.words}</span>}
      </td>
    </tr>
  );
}

const COLUMNS = [
  { key: "policy", label: "Policy", width: "30%" },
  { key: "document", label: "Document" },
  { key: "version", label: "Version" },
  { key: "owner", label: "Owner" },
  { key: "approved", label: "Approved" },
  { key: "review", label: "Next review" },
  { key: "state", label: "State" },
];

function Expected({ page }: { page: PoliciesPage }) {
  return (
    <section data-section="policies-expected">
      <p>
        <ControlRefNote refs={["a5_1"]} />
      </p>
      {!page.files_here && (
        <p className="page-note">Files is not set up here, so no document can be linked.</p>
      )}
      <DataTable caption="Policies" columns={COLUMNS} columnMenu={false} scroll={false}>
        {page.policies.map((row) => (
          <PolicyRow key={row.key} row={row} page={page} />
        ))}
      </DataTable>
    </section>
  );
}

function Own({ page }: { page: PoliciesPage }) {
  return (
    <section data-section="policies-own">
      <div className="hqdata-assurance__tools">
        <h2 className="hqdata-assurance__heading">Your own policies</h2>
        <Popover label="Add a policy" align="end">
          <MailForm action={addOwnPolicyAction} submitLabel="Add it" pendingLabel="Adding…">
            <Field id="policy-own-title" label="Title">
              <Input id="policy-own-title" name="title" minLength={3} maxLength={120} required />
            </Field>
          </MailForm>
        </Popover>
      </div>
      <DataTable
        caption="Your own policies"
        columns={COLUMNS}
        columnMenu={false}
        scroll={false}
        isEmpty={page.own.length === 0}
        empty={
          <EmptyState
            compact
            title="None of your own yet"
            description="A policy a buyer asks for that is not in the list above: add it, then link its document."
          />
        }
      >
        {page.own.map((row) => (
          <PolicyRow key={row.key} row={row} page={page} />
        ))}
      </DataTable>
    </section>
  );
}
