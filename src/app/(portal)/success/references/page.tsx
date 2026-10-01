import Link from "next/link";

import { ReferenceStatePill } from "@/components/success/relationship-parts";
import { SuccessTabs } from "@/components/success/success-tabs";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { SegmentedLinks } from "@/components/ui/toolbar";
import { requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { REFERENCE_KINDS, readReferences, type References } from "@/lib/api/relationships";
import { formatDate } from "@/lib/format";
import { firstSearchValue } from "@/lib/search-params";

export const metadata = { title: "References" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "firm", label: "Firm" },
  { key: "who", label: "Who" },
  { key: "what", label: "Agreed to" },
  { key: "state", label: "State" },
  { key: "until", label: "Until" },
  { key: "calls", label: "Calls this quarter", align: "end" as const },
  { key: "last", label: "Last used" },
];

type Props = { searchParams: Promise<Record<string, string | string[] | undefined>> };

/**
 * Who has agreed to speak for us, and to what. Usable first, the least-asked first among
 * those: a good reference asked every week stops being one.
 */
export default async function ReferencesPage({ searchParams }: Props) {
  const context = await requireStaff("/success/references");
  const asked = firstSearchValue((await searchParams).kind) ?? "";
  const kind = (REFERENCE_KINDS as readonly string[]).includes(asked) ? asked : "";
  let list: References | null = null;
  try {
    list = await readReferences(context.token, kind ? { kind } : {});
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Customer success"
        title="References"
        description="Consent to be a reference, written down: what each firm agreed to, where the yes is kept, and until when. A use outside it is refused; calls are rationed per quarter. Recorded from the firm's Success tab."
        actions={<SuccessTabs current="/success/references" />}
      />
      {list === null ? (
        <Callout tone="danger" role="alert">
          The references could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <p className="page-note">
            {list.counts.active} agreed · {list.counts.expiring} running out within 30 days ·{" "}
            {list.counts.expired} ran out · {list.counts.withdrawn} withdrawn
          </p>
          <SegmentedLinks
            label="Agreed to"
            items={[
              { href: "/success/references", label: "Everything", current: kind === "" },
              ...list.kinds.map((item) => ({
                href: `/success/references?kind=${item.value}`,
                label: item.label,
                current: kind === item.value,
              })),
            ]}
          />
          <Section id="references" title="References">
            <DataTable
              caption="References, usable and least asked first"
              columns={COLUMNS}
              isEmpty={list.references.length === 0}
              empty={<p className="muted">No firm has agreed to this yet.</p>}
            >
              {list.references.map((item) => (
                <tr key={item.reference_id}>
                  <td>
                    <Link href={`/companies/${item.company_id}?tab=success`}>
                      {item.company_name}
                    </Link>
                  </td>
                  <td>
                    <Link href={`/success/references/${item.reference_id}`}>
                      {item.person_name || "Someone at the firm"}
                    </Link>
                  </td>
                  <td>{item.kind_labels.join(" · ")}</td>
                  <td>
                    <ReferenceStatePill state={item.state} />
                  </td>
                  <td>{formatDate(item.expires_on, "—")}</td>
                  <td className="data-table__num">
                    {item.kinds.includes("call")
                      ? `${item.calls_this_quarter} of ${item.calls_per_quarter}`
                      : "—"}
                  </td>
                  <td>{formatDate(item.last_used_on, "Never")}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
        </div>
      )}
    </>
  );
}
