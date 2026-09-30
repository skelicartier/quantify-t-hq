import Link from "next/link";
import { redirect } from "next/navigation";

import { PageHeader } from "@/components/shell/page-header";
import { REGISTER_LABELS, TrustTabs, trustHref } from "@/components/trust/trust-parts";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readTrustOverview, type TrustOverview } from "@/lib/api/trust";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Trust" };
export const dynamic = "force-dynamic";

const DUE_COLUMNS = [
  { key: "register", label: "Register" },
  { key: "what", label: "What" },
  { key: "why", label: "Why it is here" },
  { key: "date", label: "Date" },
];

/**
 * What a customer's security review, an auditor or an insurer would find owing today —
 * a review past its date, a finding past its deadline, a change nobody else approved —
 * and the seven registers behind it. Deliberately no "% compliant": the list is the
 * answer, and an empty list is the goal.
 */
export default async function TrustPage() {
  const context = await requireStaff("/trust");
  if (!hasCapability(context, "audit:read")) {
    // Sales and the desk use the answer library; the registers are the owners'.
    if (hasCapability(context, "crm:read")) redirect("/trust/answers");
    if (hasCapability(context, "privacy:read")) redirect("/trust/processing");
    return (
      <>
        <PageHeader title="Trust" />
        <Callout tone="neutral">The trust registers are kept by Admins and Owners.</Callout>
      </>
    );
  }
  let overview: TrustOverview | null = null;
  try {
    overview = await readTrustOverview(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }

  return (
    <>
      <PageHeader
        title="Trust"
        description="The records a security review, an auditor or an insurer asks for — risks, findings, production changes, continuity tests, supplier reviews, approved answers and the record of processing — and what is owed on them today."
        actions={<TrustTabs context={context} current="/trust" />}
      />
      {overview === null ? (
        <Callout tone="danger" role="alert">
          The registers could not be read just now. This is not an empty list.
        </Callout>
      ) : (
        <div className="page-content">
          <Section
            id="due"
            title={overview.due.length ? `Owed now (${overview.due.length})` : "Owed now"}
          >
            <DataTable
              caption="What is owed, most pressing first"
              columns={DUE_COLUMNS}
              isEmpty={overview.due.length === 0}
              empty={
                <p className="muted">
                  Nothing is owed. Every review, deadline and approval is in date.
                </p>
              }
            >
              {overview.due.map((item) => (
                <tr key={`${item.register}-${item.record_id}`}>
                  <td>{REGISTER_LABELS[item.register] ?? item.register}</td>
                  <td>
                    <Link href={trustHref(item.register, item.record_id)}>{item.title}</Link>
                  </td>
                  <td>{item.reason}</td>
                  <td>{formatDate(item.due_on, "—")}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
          <Section id="registers" title="The registers">
            <Registers overview={overview} />
          </Section>
        </div>
      )}
    </>
  );
}

function Registers({ overview }: { overview: TrustOverview }) {
  const { registers: r } = overview;
  const cells = [
    {
      href: "/trust/risks",
      name: "Risks",
      figure: r.risks.live,
      note: `${r.risks.critical} critical · ${r.risks.high} high`,
      due: r.risks.critical > 0,
    },
    {
      href: "/trust/findings",
      name: "Findings open",
      figure: r.findings.open,
      note: r.findings.overdue
        ? `${r.findings.overdue} past the deadline`
        : "None past the deadline",
      due: r.findings.overdue > 0,
    },
    {
      href: "/trust/changes",
      name: "Changes, 30 days",
      figure: r.changes.last_30_days,
      note: r.changes.waiting
        ? `${r.changes.waiting} need a second approval`
        : "Every high-risk change approved",
      due: r.changes.waiting > 0,
    },
    {
      href: "/trust/continuity",
      name: "Continuity tests owed",
      figure: r.continuity.due,
      note: r.continuity.last_performed_on
        ? `Last one ${formatDate(r.continuity.last_performed_on)}`
        : "None done yet",
      due: r.continuity.due > 0,
    },
    {
      href: "/trust/suppliers",
      name: "Suppliers",
      figure: r.suppliers.total,
      note: r.suppliers.due
        ? `${r.suppliers.due} review${r.suppliers.due === 1 ? "" : "s"} owed`
        : "Every review in date",
      due: r.suppliers.due > 0,
    },
    {
      href: "/trust/answers",
      name: "Approved answers",
      figure: r.answers.approved,
      note: `${r.answers.draft} draft · ${r.answers.expired} to re-approve`,
      due: r.answers.expired > 0,
    },
    {
      href: "/trust/processing",
      name: "Processing activities",
      figure: r.processing.current,
      note: r.processing.owed
        ? `${r.processing.owed} not reviewed this year`
        : "All reviewed this year",
      due: r.processing.owed > 0,
    },
  ];
  return (
    <div className="trust-registers">
      {cells.map((cell) => (
        <Link key={cell.href} href={cell.href} className="trust-registers__cell">
          <span className="trust-registers__name">{cell.name}</span>
          <span className="trust-registers__figure">{cell.figure}</span>
          <span className={`trust-registers__note${cell.due ? " trust-registers__note--due" : ""}`}>
            {cell.note}
          </span>
        </Link>
      ))}
    </div>
  );
}
