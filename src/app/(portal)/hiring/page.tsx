import Link from "next/link";

import { createOpeningAction } from "@/app/(portal)/hiring/actions";
import { PageHeader } from "@/components/shell/page-header";
import { ActForm } from "@/components/ui/act-form";
import { Callout } from "@/components/ui/callout";
import { Section } from "@/components/ui/card";
import { DataTable } from "@/components/ui/data-table";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Popover } from "@/components/ui/popover";
import { StatusPill } from "@/components/ui/status-pill";
import { hasCapability, requireStaff } from "@/lib/access/core";
import { HqApiRequestError, HqApiUnavailableError } from "@/lib/api/core";
import { readHiring, type HiringBoard } from "@/lib/api/hiring";
import { formatDate } from "@/lib/format";

export const metadata = { title: "Hiring" };
export const dynamic = "force-dynamic";

const COLUMNS = [
  { key: "role", label: "Role" },
  { key: "state", label: "State" },
  { key: "manager", label: "Hiring manager" },
  { key: "process", label: "In process", align: "end" as const },
  { key: "stages", label: "Applied · screen · interview · task · offer" },
  { key: "waiting", label: "Waiting over a week", align: "end" as const },
  { key: "closes", label: "Closes" },
];

/**
 * The roles we are hiring for and where each applicant stands. Open roles are listed on the
 * website's careers page; applications from it land here.
 */
export default async function HiringPage() {
  const context = await requireStaff("/hiring");
  if (!hasCapability(context, "hr:read")) {
    return (
      <>
        <PageHeader eyebrow="Team" title="Hiring" />
        <Callout tone="neutral">
          Hiring is kept by Owners and Admins. If you are interviewing someone, your interviews are
          under{" "}
          <Link className="text-link" href="/hiring/interviews">
            Interviews
          </Link>
          .
        </Callout>
      </>
    );
  }
  let board: HiringBoard | null = null;
  try {
    board = await readHiring(context.token);
  } catch (error) {
    if (!(error instanceof HqApiUnavailableError || error instanceof HqApiRequestError))
      throw error;
  }
  return (
    <>
      <PageHeader
        eyebrow="Team"
        title="Hiring"
        description="Each open role, its hiring manager and where its applicants stand. Open roles are listed on the careers page; a rejection always says why, from a fixed list; applicants are forgotten six months after the decision unless they agreed to be kept longer."
        actions={
          board?.can_write ? (
            <Popover label="Open a role" variant="primary" width="wide">
              <ActForm
                action={createOpeningAction}
                hidden={{}}
                act="create"
                label="Open it"
                primary
                tight={false}
              >
                <Field id="opening-title" label="Role">
                  <Input
                    id="opening-title"
                    name="title"
                    maxLength={160}
                    placeholder="Research intern"
                  />
                </Field>
                <div className="form-grid">
                  <Field id="opening-team" label="Team">
                    <Input id="opening-team" name="team" maxLength={80} />
                  </Field>
                  <Field id="opening-kind" label="Kind">
                    <Select id="opening-kind" name="kind" defaultValue="employee">
                      {board.kinds.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="form-grid">
                  <Field id="opening-location" label="Where">
                    <Input
                      id="opening-location"
                      name="location"
                      maxLength={120}
                      placeholder="Remote"
                    />
                  </Field>
                  <Field id="opening-closes" label="Applications close">
                    <Input id="opening-closes" name="closes_on" type="date" />
                  </Field>
                </div>
                <Field id="opening-owner" label="Hiring manager">
                  <Select
                    id="opening-owner"
                    name="owner_staff_id"
                    defaultValue={context.me.staff.staff_id}
                  >
                    {board.staff.map((person) => (
                      <option key={person.staff_id} value={person.staff_id}>
                        {person.name}
                      </option>
                    ))}
                  </Select>
                </Field>
                <Field
                  id="opening-description"
                  label="What the role is"
                  hint="Shown on the careers page."
                >
                  <Textarea
                    id="opening-description"
                    name="description"
                    rows={5}
                    maxLength={20000}
                  />
                </Field>
              </ActForm>
            </Popover>
          ) : undefined
        }
      />
      {board === null ? (
        <Callout tone="danger" role="alert">
          Hiring could not be read just now.
        </Callout>
      ) : (
        <div className="page-content">
          <Section id="openings" title="Roles">
            <DataTable
              caption="Roles, open first"
              columns={COLUMNS}
              isEmpty={board.openings.length === 0}
              empty={<p className="muted">No roles yet.</p>}
            >
              {board.openings.map((opening) => (
                <tr key={opening.opening_id}>
                  <td>
                    <Link href={`/hiring/openings/${opening.opening_id}`}>{opening.title}</Link>
                    <span className="quiet">
                      {" "}
                      · {opening.team || "—"} · {opening.kind_label} · {opening.location || "—"}
                    </span>
                  </td>
                  <td>
                    <StatusPill
                      value={opening.status}
                      label={opening.status.charAt(0).toUpperCase() + opening.status.slice(1)}
                      tone={opening.status === "open" ? "live" : "neutral"}
                    />
                  </td>
                  <td>{opening.owner_name || "Nobody"}</td>
                  <td className="data-table__num">{opening.in_process}</td>
                  <td>
                    {(["applied", "screen", "interview", "task", "offer"] as const)
                      .map((stage) => opening.by_stage[stage] ?? 0)
                      .join(" · ")}
                  </td>
                  <td className="data-table__num">{opening.waiting_over_a_week}</td>
                  <td>{formatDate(opening.closes_on, "—")}</td>
                </tr>
              ))}
            </DataTable>
          </Section>
          <p className="page-note">
            <Link href="/hiring/interviews">Your interviews</Link>
          </p>
        </div>
      )}
    </>
  );
}
