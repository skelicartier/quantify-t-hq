import Link from "next/link";

import { confirmSudoAction } from "@/app/(portal)/admin/actions";
import { dismissCrmGroupAction, mergeCompanyAction } from "@/app/(portal)/companies/actions";
import { restoreDuplicatesAction } from "@/app/(portal)/leads/actions";
import { mergePersonAction } from "@/app/(portal)/people/actions";
import { SudoGate } from "@/components/admin/sudo-gate";
import { PageHeader } from "@/components/shell/page-header";
import { Callout } from "@/components/ui/callout";
import { Card } from "@/components/ui/card";
import { RecordSection } from "@/components/ui/record-shell";
import { RowAction } from "@/components/ui/row-action";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readDuplicates, type DuplicateGroups } from "@/lib/api/crm";
import { LIFECYCLE_LABELS } from "@/lib/crm/vocabulary";
import { formatAbsolute, pluralize } from "@/lib/format";

export const metadata = { title: "Duplicates" };
export const dynamic = "force-dynamic";

export default async function DuplicatesPage() {
  const context = await requireStaff("/companies/duplicates");
  if (!hasCapability(context, "crm:read")) {
    return (
      <>
        <PageHeader eyebrow="CRM" title="Duplicates" />
        <Callout tone="neutral">The CRM is read by roles with crm:read.</Callout>
      </>
    );
  }
  let groups: DuplicateGroups | null = null;
  try {
    groups = await readDuplicates(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  const canWrite = hasCapability(context, "crm:write");
  const fresh = context.me.sudo_fresh;
  const untilLabel = context.me.sudo_until
    ? (formatAbsolute(context.me.sudo_until).split(", ")[1] ?? null)
    : null;

  return (
    <>
      <PageHeader
        eyebrow="CRM"
        title="Duplicates"
        description="Records that look like the same firm or the same person, for you to judge. Nothing is merged until you choose which one stays."
      />
      {canWrite && (
        <SudoGate
          action={confirmSudoAction}
          fresh={fresh}
          untilLabel={untilLabel}
          returnPath="/companies/duplicates"
          purpose="Merging records needs a fresh code from your authenticator app."
        />
      )}
      {groups === null ? (
        <Callout tone="danger" role="alert">
          Duplicates could not be read just now. This is a read failure, not a clean book.
        </Callout>
      ) : groups.groups.length === 0 ? (
        <Callout tone="neutral">
          No likely duplicates: no two companies share a name once legal suffixes are removed, and
          no two people share a name at one company or an address.
        </Callout>
      ) : (
        <div className="dup-groups">
          {groups.groups.map((group, index) => (
            <Card
              key={`${group.kind}-${index}`}
              title={group.kind === "company" ? "Companies" : "People"}
              titleAs="h2"
              description={`Why: ${group.reason}.`}
            >
              <ul className="dup-records">
                {group.records.map((record) => {
                  const id = record.company_id ?? record.person_id ?? "";
                  const others = group.records.filter(
                    (other) => (other.company_id ?? other.person_id) !== id,
                  );
                  return (
                    <li key={id} className="dup-record">
                      <div className="dup-record__main">
                        <Link
                          className="table-title"
                          href={group.kind === "company" ? `/companies/${id}` : `/people/${id}`}
                        >
                          {group.kind === "company"
                            ? record.name
                            : record.full_name || record.email || "Unnamed"}
                        </Link>
                        <span className="table-sub">
                          {group.kind === "company"
                            ? `${record.domain || "no domain"} · ${LIFECYCLE_LABELS[record.lifecycle ?? ""] ?? record.lifecycle}`
                            : `${record.email || "no address"}${record.company_name ? ` · ${record.company_name}` : ""}`}
                        </span>
                      </div>
                      {canWrite && others.length === 1 && (
                        <RowAction
                          action={group.kind === "company" ? mergeCompanyAction : mergePersonAction}
                          fields={{
                            [group.kind === "company" ? "company_id" : "person_id"]: id,
                            into: (others[0]!.company_id ?? others[0]!.person_id) as string,
                          }}
                          buttons={[
                            {
                              label: "Fold this one into the other",
                              className: "btn btn--small btn--ghost",
                              pendingLabel: "Merging…",
                            },
                          ]}
                        />
                      )}
                    </li>
                  );
                })}
              </ul>
              {canWrite && group.records.length > 2 && (
                <p className="table-sub">
                  Three or more look alike: open the one to keep and use Merge on each of the
                  others.
                </p>
              )}
              {canWrite && (
                <div className="dup-actions">
                  <RowAction
                    action={dismissCrmGroupAction}
                    fields={{
                      kind: group.kind,
                      ids: group.records
                        .map((record) => record.company_id ?? record.person_id ?? "")
                        .join(","),
                    }}
                    buttons={[
                      {
                        label: "Not the same",
                        className: "btn btn--small btn--ghost",
                        pendingLabel: "Saving…",
                      },
                    ]}
                  />
                </div>
              )}
            </Card>
          ))}
        </div>
      )}
      {groups !== null && groups.dismissed.length > 0 && (
        <RecordSection id="dismissed" title="Judged not the same">
          <ul className="dup-records">
            {groups.dismissed.map((row) => (
              <li key={row.key} className="dup-record">
                <div className="dup-record__main">
                  <span>
                    {row.kind === "company" ? "Companies" : "People"}:{" "}
                    {pluralize(row.record_ids.length, "record")}
                    {row.reason ? ` · ${row.reason}` : ""}
                  </span>
                  <span className="table-sub">
                    {row.dismissed_by?.name || "Someone"}
                    {row.dismissed_at ? ` · ${formatAbsolute(row.dismissed_at)}` : ""}
                  </span>
                </div>
                {canWrite && (
                  <RowAction
                    action={restoreDuplicatesAction}
                    fields={{ key: row.key, back: "/companies/duplicates" }}
                    buttons={[
                      {
                        label: "Ask again",
                        className: "btn btn--small btn--ghost",
                        pendingLabel: "Saving…",
                      },
                    ]}
                  />
                )}
              </li>
            ))}
          </ul>
        </RecordSection>
      )}
    </>
  );
}
